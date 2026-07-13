import { describe, expect, test } from 'vitest';
import { SessionReplayer, type SessionBundle } from 'civ-engine';
import {
  FARM_REPLAY_WINDOW_TICKS,
  FarmReplayWindow,
} from '../../src/debug/farmReplayWindow';
import {
  createFarmGame,
  getFarmSnapshot,
  submitFarmCommand,
  type FarmState,
} from '../../src/game/simulation/farmGame';
import { tierState } from '../../src/game/simulation/farmState';

type ReplayEvents = Record<string, never>;
type ReplayCommands = { farmCommand: Parameters<typeof submitFarmCommand>[1] };
type ReplayState = { farm: FarmState };

describe('farm replay evidence window', () => {
  test('returns the last complete window when export lands exactly on a rotation boundary', () => {
    const game = createFarmGame({ seed: 'exact-replay-boundary' });
    const replayWindow = new FarmReplayWindow(game, true);

    replayWindow.advance(FARM_REPLAY_WINDOW_TICKS);
    const bundle = replayWindow.exportBundle();
    replayWindow.dispose();

    expect(bundle?.metadata.durationTicks).toBe(FARM_REPLAY_WINDOW_TICKS);
    expect(bundle?.ticks).toHaveLength(FARM_REPLAY_WINDOW_TICKS);
  });

  test('keeps a long interactive session export bounded and strongly replayable', () => {
    const state = getFarmSnapshot(createFarmGame({ seed: 'bounded-replay-window' }));
    state.tier = tierState(2);
    const game = createFarmGame({ seed: 'bounded-replay-window', state });
    const replayWindow = new FarmReplayWindow(game, true);

    for (let index = 0; index < 140; index += 1) {
      submitFarmCommand(game, {
        type: 'setCropMix',
        mix: index % 2 === 0
          ? { carrot: 0.8, wheat: 0.2 }
          : { carrot: 0.7, wheat: 0.3 },
      });
      replayWindow.advance(4);
    }

    const bundle = replayWindow.exportBundle() as unknown as SessionBundle<ReplayEvents, ReplayCommands>;
    replayWindow.dispose();
    expect(bundle.metadata.durationTicks).toBeGreaterThan(0);
    expect(bundle.metadata.durationTicks).toBeLessThanOrEqual(FARM_REPLAY_WINDOW_TICKS);
    expect(JSON.stringify(bundle).length).toBeLessThan(32 * 1024 * 1024);

    const replayer = SessionReplayer.fromBundle<
      ReplayEvents,
      ReplayCommands,
      unknown,
      Record<string, never>,
      ReplayState
    >(bundle, {
      worldFactory: (snapshot) => {
        const replay = createFarmGame({ seed: snapshot.config.seed });
        replay.applySnapshot(snapshot);
        return replay;
      },
    });
    const selfCheck = replayer.selfCheck({ stopOnFirstDivergence: true });
    expect(selfCheck.ok).toBe(true);
    expect(selfCheck.checkedSegments).toBeGreaterThan(0);
    expect(selfCheck.skippedSegments).toHaveLength(0);
  });
});
