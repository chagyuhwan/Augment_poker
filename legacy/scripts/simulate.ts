import { decideBotAction } from '../src/game/ai';
import { applyAction, chooseAugment, createGame, mulliganCard, startHand, twistFate, canUseMulligan, canUseFateTwist } from '../src/game/engine';
import { evaluate } from '../src/game/evaluator';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

// 족보 판정 단위 테스트
const c = (s: string) => {
  const rankMap: Record<string, number> = { A: 14, K: 13, Q: 12, J: 11, T: 10 };
  return { rank: rankMap[s[0]] ?? Number(s[0]), suit: s[1] as 's' | 'h' | 'd' | 'c' };
};
const hand = (s: string) => s.split(' ').map(c);
assert(evaluate(hand('As Ks Qs Js Ts 2d 3c')).name === '로열 스트레이트 플러시', 'royal');
assert(evaluate(hand('As 2d 3c 4h 5s 9d Kc')).score.join() === '4,5', 'wheel');
assert(evaluate(hand('Ah Kh 7h 2h 9c 9d 3s')).name === '원페어', 'no 4-flush');
assert(evaluate(hand('Ah Kh 7h 2h 9c 9d 3s'), { flushLen: 4 }).name === '플러시', '4-flush');
assert(evaluate(hand('9c 8d 7h 6s 2c 2d Ks'), { straightLen: 4 }).name === '스트레이트', '4-straight');
assert(evaluate(hand('9c 9d 9h 6s 6c 6d Ks')).score.join() === '6,9,6', 'double trips fullhouse');

let hands = 0;
for (let game = 0; game < 30; game++) {
  let s = createGame();
  let guard = 0;
  while (s.phase !== 'gameOver' && guard++ < 400) {
    const before = s.players.reduce((a, p) => a + p.chips, 0);
    s.log = [];
    const logStart = 0;
    s = chooseAugment(s, s.augmentOffer[0]);
    let steps = 0;
    while (s.phase === 'betting') {
      assert(steps++ < 500, 'betting loop stuck');
      if (canUseMulligan(s) && Math.random() < 0.3) s = mulliganCard(s, 0);
      if (canUseFateTwist(s) && Math.random() < 0.3) s = twistFate(s);
      s = applyAction(s, decideBotAction(s));
    }
    if (s.phase === 'handOver') {
      hands++;
      const after = s.players.reduce((a, p) => a + p.chips, 0);
      let bonus = 0;
      for (const line of s.log.slice(logStart)) {
        const m = line.match(/보너스 \+(\d+)|(\d+)칩 회수|(\d+)칩 환급/);
        if (m) bonus += Number(m[1] ?? m[2] ?? m[3]);
      }
      assert(after === before + bonus, `chip mismatch: ${before} + ${bonus} != ${after}\n${s.log.slice(logStart).join('\n')}`);
      for (const p of s.players) assert(p.chips >= 0 && Number.isInteger(p.chips), `bad chips ${p.chips}`);
      s = startHand(s);
    }
  }
}
console.log(`OK: ${hands} hands simulated`);
