// A gate that is not scheduled cannot be trusted. `npm run lessons:check` was a
// command somebody had to remember, so this file is what actually runs it: it is
// picked up by plain `npm test` alongside every other suite, which is the only
// place a check reliably executes before a commit.
//
// The pairing rule it enforces: `lessons.md` is a QUEUE, not an archive. An entry
// is deleted in the commit that lands its gate, so the two halves must empty
// together — an empty pair is the resting state and passes, a HALF-emptied pair
// is a lesson that silently stopped being readable and fails.
//
// The parsers are proved against an inline fixture rather than against the live
// files, because once the queue is drained the live files can no longer tell a
// working parser from a broken one: both return nothing. The fixture is the
// control that separates "the queue is empty" from "the check stopped looking".
import { readFile } from 'node:fs/promises';
import { describe, expect, test } from 'vitest';
import {
  EVIDENCE_PATH,
  RULES_PATH,
  checkLessons,
  parseEntries,
  parseRules,
  slugify,
} from '../../scripts/check-lessons.mjs';

const FIXTURE_RULES = [
  '# Lessons',
  '',
  'Prose that is not a heading and not a rule.',
  '',
  '## Rules',
  '',
  '- 2026-01-01 - A queued lesson names its gate ([evidence](lessons-evidence.md#2026-01-01---a-queued-lesson-names-its-gate))',
  '- 2026-01-02 - A second queued lesson ([evidence](lessons-evidence.md#2026-01-02---a-second-queued-lesson))',
  '',
].join('\n');

const FIXTURE_EVIDENCE = [
  '# Lessons — evidence',
  '',
  '## 2026-01-01 - A queued lesson names its gate',
  '',
  '- Surfaced by: a fixture.',
  '',
  '## 2026-01-02 - A second queued lesson',
  '',
  '- Surfaced by: the same fixture.',
  '',
  'A fenced heading is a template example, not a lesson:',
  '',
  '```markdown',
  '## 2026-01-03 - Not a real entry',
  '```',
  '',
].join('\n');

const EMPTY_RULES = ['# Lessons', '', '## Rules', '', ''].join('\n');
const EMPTY_EVIDENCE = ['# Lessons — evidence', '', 'Nothing is queued.', ''].join('\n');

describe('lessons pairing check', () => {
  test('the parsers still find rules and entries in a known fixture', () => {
    const rules = parseRules(FIXTURE_RULES);
    const entries = parseEntries(FIXTURE_EVIDENCE);

    expect(rules).toHaveLength(2);
    expect(entries).toEqual([
      '2026-01-01 - A queued lesson names its gate',
      '2026-01-02 - A second queued lesson',
    ]);
    expect(slugify(entries[0])).toBe('2026-01-01---a-queued-lesson-names-its-gate');
    expect(checkLessons(FIXTURE_RULES, FIXTURE_EVIDENCE)).toEqual([]);
  });

  test('an empty queue is the resting state and passes', () => {
    expect(parseRules(EMPTY_RULES)).toEqual([]);
    expect(parseEntries(EMPTY_EVIDENCE)).toEqual([]);
    expect(checkLessons(EMPTY_RULES, EMPTY_EVIDENCE)).toEqual([]);
  });

  test('a half-emptied queue fails in both directions', () => {
    const ruleWithoutEntry = checkLessons(FIXTURE_RULES, EMPTY_EVIDENCE);
    expect(ruleWithoutEntry.join('\n')).toMatch(/lists 2 rule\(s\) but .* holds 0/);
    expect(ruleWithoutEntry.join('\n')).toMatch(/which no entry heading produces/);

    const entryWithoutRule = checkLessons(EMPTY_RULES, FIXTURE_EVIDENCE);
    expect(entryWithoutRule.join('\n')).toMatch(/lists 0 rule\(s\) but .* holds 2/);
    expect(entryWithoutRule.join('\n')).toMatch(/has no rule pointing at it, so it is unreachable prose/);
  });

  test('a missing "## Rules" heading is reported rather than read as an empty queue', () => {
    expect(checkLessons('# Lessons\n\nNo heading here.\n', EMPTY_EVIDENCE))
      .toEqual([expect.stringContaining('has no "## Rules" section')]);
  });

  test('the live lessons queue and its evidence are in step', async () => {
    const [rulesText, evidenceText] = await Promise.all([
      readFile(RULES_PATH, 'utf8'),
      readFile(EVIDENCE_PATH, 'utf8'),
    ]);

    expect(checkLessons(rulesText, evidenceText)).toEqual([]);
  });
});
