import { AUGMENTS, isOffensive, MAX_AUGMENT_SLOTS, rollOffer } from './augments';
import { cardLabel, cloneCard } from './cards';
import type { AugmentId, Card, GameState, Player, Street, Suit } from './types';

export type EngineResult = { ok: true; state: GameState } | { ok: false; error: string };

export type AugmentPayload =
  | { type: 'none' }
  | { type: 'hole'; index: number }
  | { type: 'holes'; indices: number[] }
  | { type: 'suitUnify'; indices: number[]; suit: Suit }
  | { type: 'rankNudge'; index: number; delta: 1 | -1 }
  | { type: 'target'; playerId: number }
  | { type: 'swap'; targetId: number; myIndex: number }
  | { type: 'handFlip'; targetId: number }
  | { type: 'board'; index: number }
  | { type: 'seal'; targetId: number; augmentId: AugmentId }
  | { type: 'copy'; targetId: number; augmentId: AugmentId };

type Ctx = {
  byId: (s: GameState, id: number) => Player | undefined;
  isLive: (p: Player) => boolean;
  clone: (s: GameState) => GameState;
  pushLog: (s: GameState, msg: string) => void;
  emit: (s: GameState, e: { type: 'augmentUsed'; playerId: number; augmentId: AugmentId; blocked?: boolean }) => void;
};

function owns(p: Player, id: AugmentId) {
  return p.augments.some((a) => a.id === id && !a.used);
}

function isSealed(s: GameState, playerId: number, id: AugmentId) {
  return s.effects.sealed.some((x) => x.targetId === playerId && x.augmentId === id);
}

function markUsed(p: Player, id: AugmentId) {
  const a = p.augments.find((x) => x.id === id && !x.used);
  if (!a) return;
  if (AUGMENTS[id].kind === 'oneShot' || AUGMENTS[id].kind === 'persistent') {
    a.used = true;
  }
  // oneShot은 슬롯에서 제거
  if (AUGMENTS[id].kind === 'oneShot') {
    p.augments = p.augments.filter((x) => x !== a);
  }
}

function tryShield(s: GameState, attacker: Player, target: Player, id: AugmentId, ctx: Ctx): boolean {
  if (!isOffensive(id)) return false;
  if (target.id === attacker.id) return false;
  const shield = target.augments.find((a) => a.id === 'augShield' && !a.used);
  if (!shield) return false;
  if (isSealed(s, target.id, 'augShield')) return false;
  shield.used = true;
  target.augments = target.augments.filter((a) => a !== shield);
  // 공격 증강도 소모
  markUsed(attacker, id);
  ctx.pushLog(s, `🛡️ ${target.name}: 증강 방패로 [${AUGMENTS[id].name}] 방어!`);
  ctx.emit(s, { type: 'augmentUsed', playerId: attacker.id, augmentId: id, blocked: true });
  return true;
}

function nextStreetOf(street: Street): Street | 'done' {
  if (street === 'preflop') return 'flop';
  if (street === 'flop') return 'turn';
  if (street === 'turn') return 'river';
  return 'done';
}

/** 사용 가능 여부와 이유 */
export function canUseAugment(s: GameState, playerId: number, id: AugmentId): { ok: true } | { ok: false; reason: string } {
  if (s.mode !== 'augmented') return { ok: false, reason: '일반 모드입니다.' };
  if (s.phase !== 'betting') return { ok: false, reason: '베팅 중에만 사용할 수 있습니다.' };
  const p = s.players.find((x) => x.id === playerId);
  if (!p || !p.inHand || p.folded) return { ok: false, reason: '핸드에 참가 중이 아닙니다.' };
  if (!owns(p, id)) return { ok: false, reason: '보유하지 않았거나 이미 사용했습니다.' };
  if (isSealed(s, playerId, id)) return { ok: false, reason: '봉인된 증강입니다.' };
  if (id === 'handFlip' && s.augmentRoundsDone !== 1) return { ok: false, reason: '첫 증강 선택 직후에만 쓸 수 있습니다.' };
  if (id === 'boardFlip' && s.community.length === 0) return { ok: false, reason: '공개된 공용 카드가 없습니다.' };
  if (id === 'foresight' && s.community.length >= 5) return { ok: false, reason: '더 이상 공개될 카드가 없습니다.' };
  if (id === 'augShield') return { ok: false, reason: '방패는 공격받을 때 자동으로 발동합니다.' };
  if (id === 'rerollFate') return { ok: false, reason: '선택 화면에서만 쓸 수 있습니다.' };
  return { ok: true };
}

export function useAugment(
  prev: GameState,
  playerId: number,
  id: AugmentId,
  payload: AugmentPayload,
  ctx: Ctx,
): EngineResult {
  const gate = canUseAugment(prev, playerId, id);
  if (!gate.ok) return { ok: false, error: gate.reason };

  const s = ctx.clone(prev);
  const me = ctx.byId(s, playerId)!;
  const def = AUGMENTS[id];

  // 공격 대상이 있으면 방패 검사
  const targetId =
    payload.type === 'target' || payload.type === 'swap' || payload.type === 'handFlip' || payload.type === 'seal' || payload.type === 'copy'
      ? 'targetId' in payload
        ? payload.targetId
        : payload.playerId
      : null;
  if (targetId !== null) {
    const target = ctx.byId(s, targetId);
    if (!target || !ctx.isLive(target)) return { ok: false, error: '유효한 상대가 아닙니다.' };
    if (tryShield(s, me, target, id, ctx)) {
      s.actionSeq += 1;
      return { ok: true, state: s };
    }
  }

  switch (id) {
    case 'aceStamp': {
      if (payload.type !== 'hole') return { ok: false, error: '카드를 선택하세요.' };
      const c = me.hole[payload.index];
      if (!c) return { ok: false, error: '잘못된 카드입니다.' };
      c.rank = 14;
      c.isModified = true;
      ctx.pushLog(s, `🂡 ${me.name}: ${cardLabel({ ...c, rank: c.rank })} 에이스 각인`);
      break;
    }
    case 'clone': {
      if (payload.type !== 'hole') return { ok: false, error: '카드를 선택하세요.' };
      const c = me.hole[payload.index];
      if (!c) return { ok: false, error: '잘못된 카드입니다.' };
      me.hole.push(cloneCard(s, c));
      ctx.pushLog(s, `⧉ ${me.name}: ${cardLabel(c)} 복제`);
      break;
    }
    case 'suitUnify': {
      if (payload.type !== 'suitUnify') return { ok: false, error: '카드와 무늬를 선택하세요.' };
      if (payload.indices.length < 1 || payload.indices.length > 2) return { ok: false, error: '카드는 1~2장입니다.' };
      for (const i of payload.indices) {
        const c = me.hole[i];
        if (!c) return { ok: false, error: '잘못된 카드입니다.' };
        c.suit = payload.suit;
        c.isModified = true;
      }
      ctx.pushLog(s, `🎨 ${me.name}: 무늬 통일`);
      break;
    }
    case 'rankNudge': {
      if (payload.type !== 'rankNudge') return { ok: false, error: '카드와 방향을 선택하세요.' };
      const c = me.hole[payload.index];
      if (!c) return { ok: false, error: '잘못된 카드입니다.' };
      const next = c.rank + payload.delta;
      if (next < 2 || next > 14) return { ok: false, error: 'A와 2 사이로는 순환할 수 없습니다.' };
      c.rank = next;
      c.isModified = true;
      ctx.pushLog(s, `↕ ${me.name}: 숫자 교정 → ${cardLabel(c)}`);
      break;
    }
    case 'fateSwap': {
      if (payload.type !== 'swap') return { ok: false, error: '상대와 내 카드를 고르세요.' };
      const target = ctx.byId(s, payload.targetId)!;
      if (!target.hole.length) return { ok: false, error: '상대 카드가 없습니다.' };
      const my = me.hole[payload.myIndex];
      if (!my) return { ok: false, error: '잘못된 카드입니다.' };
      const ti = Math.floor(Math.random() * target.hole.length);
      const theirs = target.hole[ti];
      me.hole[payload.myIndex] = theirs;
      target.hole[ti] = my;
      ctx.pushLog(s, `⇄ ${me.name} ↔ ${target.name}: 카드 교환`);
      break;
    }
    case 'handFlip': {
      if (payload.type !== 'handFlip') return { ok: false, error: '상대를 고르세요.' };
      const target = ctx.byId(s, payload.targetId)!;
      if (me.hole.length !== target.hole.length) return { ok: false, error: '카드 수가 같아야 합니다.' };
      const tmp = me.hole;
      me.hole = target.hole;
      target.hole = tmp;
      const show = Math.floor(Math.random() * me.hole.length);
      s.revealed[me.id] = [...(s.revealed[me.id] ?? []), show];
      ctx.pushLog(s, `🃏 ${me.name} ↔ ${target.name}: 손패 교환 · ${me.name}의 ${cardLabel(me.hole[show])} 공개`);
      break;
    }
    case 'boardFlip': {
      if (payload.type !== 'board') return { ok: false, error: '공용 카드를 고르세요.' };
      if (payload.index < 0 || payload.index >= s.community.length) return { ok: false, error: '잘못된 공용 카드입니다.' };
      const old = s.community[payload.index];
      const neu = s.deck.pop();
      if (!neu) return { ok: false, error: '덱에 카드가 없습니다.' };
      s.community[payload.index] = neu;
      ctx.pushLog(s, `🌀 ${me.name}: 판 뒤집기 ${cardLabel(old)} → ${cardLabel(neu)}`);
      break;
    }
    case 'redeal': {
      if (payload.type !== 'hole') return { ok: false, error: '카드를 선택하세요.' };
      const old = me.hole[payload.index];
      if (!old) return { ok: false, error: '잘못된 카드입니다.' };
      const neu = s.deck.pop();
      if (!neu) return { ok: false, error: '덱에 카드가 없습니다.' };
      me.hole[payload.index] = neu;
      ctx.pushLog(s, `🔄 ${me.name}: 재배분 ${cardLabel(old)} → ${cardLabel(neu)}`);
      break;
    }
    case 'mindRead': {
      if (payload.type !== 'target') return { ok: false, error: '상대를 고르세요.' };
      const target = ctx.byId(s, payload.playerId)!;
      const c = target.hole[Math.floor(Math.random() * target.hole.length)];
      if (!c) return { ok: false, error: '상대 카드가 없습니다.' };
      s.effects.privatePeeks.push({ viewerId: me.id, targetId: target.id, cardId: c.id, rank: c.rank, suit: c.suit });
      ctx.pushLog(s, `👁️ ${me.name}: ${target.name}의 카드 한 장을 엿봤습니다.`);
      break;
    }
    case 'foresight': {
      const next = s.deck[s.deck.length - 1];
      if (!next) return { ok: false, error: '다음 카드가 없습니다.' };
      s.effects.foresight[me.id] = { rank: next.rank, suit: next.suit };
      ctx.pushLog(s, `🔮 ${me.name}: 다음 공용 카드를 예지했습니다.`);
      break;
    }
    case 'forceReveal': {
      if (payload.type !== 'target') return { ok: false, error: '상대를 고르세요.' };
      const target = ctx.byId(s, payload.playerId)!;
      s.effects.forceRevealed.push(target.id);
      s.revealed[target.id] = target.hole.map((_, i) => i);
      ctx.pushLog(s, `📢 ${me.name}: ${target.name}의 패를 강제 공개`);
      break;
    }
    case 'auraPeek': {
      if (payload.type !== 'target') return { ok: false, error: '상대를 고르세요.' };
      const target = ctx.byId(s, payload.playerId)!;
      const ranks = target.hole.map((c) => c.rank);
      const hasPair = ranks.some((r, i) => ranks.indexOf(r) !== i);
      const hasPaint = ranks.some((r) => r >= 11);
      const hint = `${hasPair ? '페어 있음' : '페어 없음'} · ${hasPaint ? 'J+' : 'J+ 없음'}`;
      s.effects.auraHints[me.id] = `${target.name}: ${hint}`;
      ctx.pushLog(s, `✨ ${me.name}: ${target.name}의 기운 — ${hint}`);
      break;
    }
    case 'raiseSeal': {
      if (payload.type !== 'target') return { ok: false, error: '상대를 고르세요.' };
      const target = ctx.byId(s, payload.playerId)!;
      s.effects.raiseBannedUntil[target.id] = nextStreetOf(s.street);
      ctx.pushLog(s, `🔒 ${me.name}: ${target.name} 레이즈 봉인`);
      break;
    }
    case 'actLast': {
      s.effects.actLastId = me.id;
      s.effects.actLastStreet = nextStreetOf(s.street) === 'done' ? s.street : (nextStreetOf(s.street) as Street);
      ctx.pushLog(s, `⏩ ${me.name}: 다음 구간 마지막 행동`);
      break;
    }
    case 'raiseCap': {
      const ns = nextStreetOf(s.street);
      s.effects.raiseCapStreet = ns === 'done' ? s.street : ns;
      s.effects.raisesUnderCap = 0;
      ctx.pushLog(s, `1️⃣ ${me.name}: 다음 구간 레이즈 1회 제한`);
      break;
    }
    case 'pressure': {
      if (payload.type !== 'target') return { ok: false, error: '상대를 고르세요.' };
      s.effects.pressure = { ownerId: me.id, targetId: payload.playerId, armed: true, fired: false };
      ctx.pushLog(s, `😠 ${me.name}: 심리 압박 준비 (${ctx.byId(s, payload.playerId)!.name})`);
      break;
    }
    case 'augSeal': {
      if (payload.type !== 'seal') return { ok: false, error: '상대와 증강을 고르세요.' };
      const target = ctx.byId(s, payload.targetId)!;
      if (!target.augments.some((a) => a.id === payload.augmentId && !a.used)) {
        return { ok: false, error: '상대가 그 증강을 갖고 있지 않습니다.' };
      }
      const until = nextStreetOf(s.street);
      s.effects.sealed.push({
        targetId: target.id,
        augmentId: payload.augmentId,
        untilStreet: until === 'done' ? s.street : until,
      });
      ctx.pushLog(s, `⛔ ${me.name}: ${target.name}의 [${AUGMENTS[payload.augmentId].name}] 봉인`);
      break;
    }
    case 'copyPower': {
      if (payload.type !== 'copy') return { ok: false, error: '복제할 증강을 고르세요.' };
      const target = ctx.byId(s, payload.targetId)!;
      const src = target.augments.find((a) => a.id === payload.augmentId && !a.used);
      if (!src) return { ok: false, error: '상대가 그 증강을 갖고 있지 않습니다.' };
      const srcDef = AUGMENTS[src.id];
      if (srcDef.kind !== 'persistent' || srcDef.copyable === false || src.id === 'copyPower' || src.id === 'rerollFate') {
        return { ok: false, error: '복제할 수 없는 증강입니다.' };
      }
      if (me.augments.length >= MAX_AUGMENT_SLOTS) return { ok: false, error: '슬롯이 가득 찼습니다.' };
      me.augments.push({ id: src.id, used: false, isCopy: true });
      ctx.pushLog(s, `🧬 ${me.name}: [${srcDef.name}] 복제`);
      break;
    }
    default:
      return { ok: false, error: '이 증강은 여기서 사용할 수 없습니다.' };
  }

  markUsed(me, id);
  ctx.emit(s, { type: 'augmentUsed', playerId: me.id, augmentId: id });
  if (def.kind === 'oneShot') ctx.pushLog(s, `⌛ ${me.name}: [${def.name}] 소모`);
  s.actionSeq += 1;
  return { ok: true, state: s };
}

/** 선택 화면에서 운명 재추첨을 고른 경우 후보를 다시 뽑는다 */
export function applyRerollFatePick(
  s: GameState,
  playerId: number,
  ctx: { pushLog: (s: GameState, msg: string) => void },
): boolean {
  const entry = s.augmentRound?.entries[playerId];
  if (!entry || entry.done || entry.rerolled) return false;
  const p = s.players.find((x) => x.id === playerId)!;
  entry.rerolled = true;
  entry.offer = rollOffer(
    s.augmentRound!.tier,
    p.augments.map((a) => a.id),
    3,
    !p.isHuman,
    Math.random,
    s.augmentRound!.round,
    false,
  );
  ctx.pushLog(s, `🎲 ${p.name}: 운명 재추첨`);
  return true;
}

export function onStreetEndClearEffects(s: GameState, endedStreet: Street) {
  for (const [pid, until] of Object.entries(s.effects.raiseBannedUntil)) {
    if (until === endedStreet) delete s.effects.raiseBannedUntil[Number(pid)];
  }
  if (s.effects.raiseCapStreet === endedStreet) {
    s.effects.raiseCapStreet = null;
    s.effects.raisesUnderCap = 0;
  }
  if (s.effects.actLastStreet === endedStreet) {
    s.effects.actLastId = null;
    s.effects.actLastStreet = null;
  }
  s.effects.sealed = s.effects.sealed.filter((x) => x.untilStreet !== endedStreet);
}

export type PeekCard = Pick<Card, 'rank' | 'suit'>;
