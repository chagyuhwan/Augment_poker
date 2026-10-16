/**
 * 장시간·밸런스 시드 시뮬레이션 (실실행)
 * 기본: 모드×인원 샘플. QA_HANDS 환경변수로 핸드 수 확장 가능.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AUGMENTS } from '../src/practice/game/augments';
import type { AugmentId, TableMode } from '../src/practice/game/types';
import { runManyHands } from './qaHarness';

const HANDS = Number(process.env.QA_HANDS ?? 200);
const LONG_HANDS = Number(process.env.QA_LONG_HANDS ?? 1000);

describe('밸런스·장시간 시뮬 (실실행)', () => {
  it(`일반/증강 홀덤 × 2/4/6인 — 각 ${HANDS}핸드`, () => {
    const modes: TableMode[] = ['normal', 'augmented'];
    const sizes = [2, 4, 6];
    const report: Record<string, unknown> = {
      handsPerCell: HANDS,
      cells: {} as Record<string, unknown>,
      generatedAt: new Date().toISOString(),
    };

    for (const mode of modes) {
      for (const n of sizes) {
        const stacks = Array.from({ length: n }, () => 4000);
        const stats = runManyHands({
          seed: 9000 + n * 10 + (mode === 'augmented' ? 1 : 0),
          hands: HANDS,
          stacks,
          mode,
          style: 'random',
          refill: true,
          targetPlayers: n,
          useAugmentChance: mode === 'augmented' ? 0.35 : 0,
        });
        const key = `${mode}-${n}p`;
        (report.cells as Record<string, unknown>)[key] = {
          completed: stats.completed,
          errors: stats.errors.slice(0, 10),
          errorCount: stats.errors.length,
          incompleteBoard: stats.incompleteBoard,
          contestedBad: stats.contestedBad,
          showdowns: stats.showdowns,
          foldWins: stats.foldsWins,
          augmentPicks: stats.augmentPicks,
        };
        expect(stats.errors, `${key} errors: ${JSON.stringify(stats.errors.slice(0, 3))}`).toHaveLength(0);
        expect(stats.incompleteBoard).toBe(0);
        expect(stats.contestedBad).toBe(0);
        expect(stats.completed).toBeGreaterThanOrEqual(Math.min(HANDS, 50));
      }
    }

    mkdirSync(resolve('qa-results'), { recursive: true });
    writeFileSync(resolve('qa-results/balance-sample.json'), JSON.stringify(report, null, 2), 'utf8');
  }, 120_000);

  it(`증강 홀덤 장시간 ${LONG_HANDS}핸드 (리필)`, () => {
    const stats = runManyHands({
      seed: 424242,
      hands: LONG_HANDS,
      stacks: [5000, 5000, 5000, 5000],
      mode: 'augmented',
      style: 'random',
      refill: true,
      targetPlayers: 4,
      useAugmentChance: 0.4,
    });
    expect(stats.errors.slice(0, 5)).toEqual([]);
    expect(stats.errors).toHaveLength(0);
    expect(stats.incompleteBoard).toBe(0);
    expect(stats.contestedBad).toBe(0);
    expect(stats.completed).toBeGreaterThanOrEqual(Math.min(LONG_HANDS, 100));

    const pickTotal = Object.values(stats.augmentPicks).reduce((a, b) => a + b, 0);
    const perAugment = (Object.keys(AUGMENTS) as AugmentId[]).map((id) => ({
      id,
      name: AUGMENTS[id].name,
      picks: stats.augmentPicks[id] ?? 0,
      pickShare: pickTotal ? (stats.augmentPicks[id] ?? 0) / pickTotal : 0,
    }));

    mkdirSync(resolve('qa-results'), { recursive: true });
    writeFileSync(
      resolve('qa-results/long-run.json'),
      JSON.stringify(
        {
          hands: LONG_HANDS,
          completed: stats.completed,
          showdowns: stats.showdowns,
          foldWins: stats.foldsWins,
          pickTotal,
          perAugment,
        },
        null,
        2,
      ),
      'utf8',
    );
  }, 300_000);
});
