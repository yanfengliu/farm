// Browser replay evidence needs a bounded time window. A recorder that captures a whole accelerated
// browser lifetime accumulates per-tick deterministic diffs into one protocol response until the
// export dies of ERR_STRING_TOO_LONG -- after every action has already completed. Screenshot size
// was never the problem. The bundle carries a recent, strongly checkable window and says so in its
// source label, and a long idle tail must not erase the last window that actually held a command.
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

// The bound this file exists to hold is an absolute one: the recorder must not
// hand Playwright's pipe transport a whole accelerated browser lifetime. Every
// other assertion here compares against FARM_REPLAY_WINDOW_TICKS, which moves
// with the constant it is meant to pin -- widen the constant and those
// assertions widen with it and stay green. This literal ceiling does not, and
// the size assertion below cannot stand in for it: a session short enough to run
// in a unit test never approaches the string limit that produced the defect, so
// it is the tick bound, not the byte count, that is actually load-bearing.
const REPLAY_WINDOW_ABSOLUTE_CEILING_TICKS = 256;

describe('farm replay evidence window', () => {
  test('bounds the replay window by an absolute tick ceiling, not by its own constant', () => {
    expect(FARM_REPLAY_WINDOW_TICKS).toBeGreaterThan(0);
    expect(FARM_REPLAY_WINDOW_TICKS).toBeLessThanOrEqual(REPLAY_WINDOW_ABSOLUTE_CEILING_TICKS);
  });


  test('returns the last complete window when export lands exactly on a rotation boundary', () => {
    const game = createFarmGame({ seed: 'exact-replay-boundary' });
    const replayWindow = new FarmReplayWindow(game, true);

    replayWindow.advance(FARM_REPLAY_WINDOW_TICKS);
    const bundle = replayWindow.exportBundle();
    replayWindow.dispose();

    expect(bundle?.metadata.durationTicks).toBe(FARM_REPLAY_WINDOW_TICKS);
    expect(bundle?.ticks).toHaveLength(FARM_REPLAY_WINDOW_TICKS);
    expect(bundle?.metadata.sourceLabel).toBe('farm-terminal-replay-window:full');
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
    expect(bundle.metadata.sourceLabel).toBe('farm-terminal-replay-window:partial');
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

  test('retains the most recent command-bearing window across a long idle tail', () => {
    const state = getFarmSnapshot(createFarmGame({ seed: 'command-replay-window' }));
    state.tier = tierState(2);
    const game = createFarmGame({ seed: 'command-replay-window', state });
    const replayWindow = new FarmReplayWindow(game, true);
    submitFarmCommand(game, { type: 'setCropMix', mix: { carrot: 0.8, wheat: 0.2 } });
    replayWindow.advance(1 + FARM_REPLAY_WINDOW_TICKS * 2);

    const bundle = replayWindow.exportBundle() as unknown as SessionBundle<ReplayEvents, ReplayCommands>;
    replayWindow.dispose();
    expect(bundle.commands).toHaveLength(1);
    expect(bundle.metadata.sourceLabel).toBe('farm-terminal-replay-window:partial');

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
  });
});
