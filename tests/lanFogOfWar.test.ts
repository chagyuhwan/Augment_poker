import { describe, expect, it } from 'vitest';
import { fogOfWar } from '../src/net/fogOfWar';
import { isLanMessage } from '../src/net/lanProtocol';
import { createTable } from '../src/practice/game/engine';
import { makeCard } from '../src/practice/game/cards';

describe('fogOfWar', () => {
  it('상대 홀카드는 가리고 본인 패와 heroId는 유지한다', () => {
    const s = createTable({
      tableId: 't1',
      mode: 'normal',
      hero: { name: 'Host', isHuman: true, chips: 1000 },
      others: [{ name: 'Guest', isHuman: true, chips: 1000 }],
      smallBlind: 5,
      bigBlind: 10,
      maxBet: null,
    });
    const hostId = s.heroId;
    const guest = s.players.find((p) => p.id !== hostId)!;
    // 강제로 홀카드 부여
    const st = structuredClone(s);
    st.phase = 'betting';
    st.players[0].hole = [
      makeCard(st, 14, 's'),
      makeCard(st, 13, 'h'),
    ];
    st.players[1].hole = [
      makeCard(st, 2, 'c'),
      makeCard(st, 3, 'd'),
    ];
    st.deck = [makeCard(st, 10, 's')];

    const guestView = fogOfWar(st, guest.id);
    expect(guestView.heroId).toBe(guest.id);
    expect(guestView.players.find((p) => p.id === guest.id)!.hole[0].rank).toBe(2);
    expect(guestView.players.find((p) => p.id === hostId)!.hole[0].rank).toBe(0);
    expect(guestView.deck[0].rank).toBe(0);
  });

  it('쇼다운이면 폴드하지 않은 패를 공개한다', () => {
    const s = createTable({
      tableId: 't2',
      mode: 'normal',
      hero: { name: 'A', isHuman: true, chips: 1000 },
      others: [{ name: 'B', isHuman: true, chips: 1000 }],
      smallBlind: 5,
      bigBlind: 10,
      maxBet: null,
    });
    const st = structuredClone(s);
    st.phase = 'handOver';
    st.result = { showdown: true, lines: [], winnerIds: [st.heroId], pot: 20, net: {} };
    st.players[0].folded = false;
    st.players[1].folded = false;
    st.players[0].hole = [makeCard(st, 14, 's'), makeCard(st, 13, 'h')];
    st.players[1].hole = [makeCard(st, 2, 'c'), makeCard(st, 3, 'd')];
    const view = fogOfWar(st, st.players[1].id);
    expect(view.players[0].hole[0].rank).toBe(14);
  });
});

describe('lanProtocol', () => {
  it('메시지 판별', () => {
    expect(isLanMessage({ t: 'ping' })).toBe(true);
    expect(isLanMessage({ t: 'hello', code: 'ABCDEF', playerId: '1', displayName: 'x', buyIn: 1 })).toBe(true);
    expect(isLanMessage(null)).toBe(false);
    expect(isLanMessage({ x: 1 })).toBe(false);
  });
});
