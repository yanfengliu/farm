import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Lessons live in two files on purpose.
 *
 * `lessons.md` is the one-line rule for each lesson and names the gate that will
 * retire it. `lessons-evidence.md` holds the war story and the anchor and is
 * opened only when a rule is in doubt. Telling an agent to read part of one
 * large file does not work — reading a file reads all of it — so the split is
 * what actually keeps the queue cheap to carry.
 *
 * Two files, not one per lesson. Anthropic's progressive-disclosure guidance
 * groups reference material by domain rather than by item, and expects a
 * reference file of a hundred-odd lines to be normal. Split the evidence file by
 * subsystem if it outgrows that; splitting per lesson would trade a cheap read
 * for dozens of files and make reading all the lessons about one subsystem
 * expensive again.
 *
 * Splitting is only safe if the halves cannot drift, which is what this checks:
 * every rule has an entry, every entry has a rule, and every link resolves.
 *
 * An EMPTY pair is valid and is the resting state. The queue is drained when
 * every lesson has landed its gate, and a check that demanded at least one entry
 * would make emptying it a failure — which is exactly backwards. What must never
 * happen is a HALF-emptied pair: a rule whose evidence was deleted, or evidence
 * whose rule was deleted, is a lesson that silently stopped being readable.
 *
 * Emptiness is also why the parsers are proved against an inline fixture in
 * `tests/testing/lessonsPairing.test.mjs` rather than against the live files: a
 * parser that has quietly stopped matching anything returns zero rules and zero
 * entries, which is indistinguishable from a drained queue. The fixture is the
 * control that tells those two apart.
 */
export const RULES_PATH = "docs/learning/lessons.md";
export const EVIDENCE_PATH = "docs/learning/lessons-evidence.md";

/** GitHub's heading anchor: lowercased, punctuation dropped, spaces hyphenated. */
export function slugify(heading) {
  return heading
    .toLowerCase()
    .replace(/[`'’"]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

export function parseRules(text) {
  const lines = text.split(/\r?\n/);
  const heading = lines.indexOf("## Rules");
  if (heading < 0) return null;
  return lines.slice(heading + 1).filter((line) => line.startsWith("- "));
}

export function parseEntries(text) {
  // A heading inside a fenced block is a template example, not a lesson.
  let fenced = false;
  const entries = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.trimStart().startsWith("```")) fenced = !fenced;
    else if (!fenced && line.startsWith("## ") && line.slice(3).trim() !== "Entries") {
      entries.push(line.slice(3).trim());
    }
  }
  return entries;
}

/** Returns the list of problems; an empty list means the two halves are in step. */
export function checkLessons(rulesText, evidenceText) {
  const problems = [];
  const rules = parseRules(rulesText);
  if (rules === null) {
    return [`${RULES_PATH} has no "## Rules" section; that heading is where the queue lives`];
  }
  const entries = parseEntries(evidenceText);

  if (rules.length !== entries.length) {
    problems.push(
      `${RULES_PATH} lists ${rules.length} rule(s) but ${EVIDENCE_PATH} holds ${entries.length} entr(y|ies). ` +
        `Half-emptying the queue loses the half nobody is reading. Entries: ${entries
          .map((entry) => `"${entry}"`)
          .join(", ")}`,
    );
  }

  const anchors = new Set(entries.map(slugify));
  const linkedAnchors = new Set();
  for (const rule of rules) {
    const link = /\[evidence\]\(lessons-evidence\.md#([a-z0-9-]+)\)/.exec(rule);
    if (!link) {
      problems.push(`A rule has no link to its evidence, so nobody can reach it: ${rule.slice(0, 120)}`);
      continue;
    }
    linkedAnchors.add(link[1]);
    if (!anchors.has(link[1])) {
      problems.push(
        `A rule links to "${link[1]}", which no entry heading produces. ` +
          `Available: ${[...anchors].join(", ") || "(none)"}`,
      );
    }
  }
  for (const anchor of anchors) {
    if (!linkedAnchors.has(anchor)) {
      problems.push(`An entry anchored at "${anchor}" has no rule pointing at it, so it is unreachable prose.`);
    }
  }

  // A queue entry earns its keep only by staying short enough to scan.
  for (const rule of rules.filter((rule) => ruleText(rule).length > 160)) {
    problems.push(`A rule exceeds 160 characters before its link, which defeats a queue: ${rule.slice(0, 120)}…`);
  }

  const seen = new Set();
  for (const rule of rules) {
    const text = ruleText(rule);
    if (seen.has(text)) problems.push(`Two rules say the same thing, so two entries teach it: ${text}`);
    seen.add(text);
  }

  return problems;
}

function ruleText(rule) {
  return rule.replace(/\s*\(\[evidence\].*$/, "");
}

export function readLessonFiles(read = (path) => readFileSync(path, "utf8")) {
  return { rulesText: read(RULES_PATH), evidenceText: read(EVIDENCE_PATH) };
}

function main() {
  let files;
  try {
    files = readLessonFiles();
  } catch (error) {
    console.error(
      `Lessons check failed: ${RULES_PATH} and ${EVIDENCE_PATH} are both required, even when the queue is empty ` +
        `(${error instanceof Error ? error.message : String(error)})`,
    );
    process.exit(1);
  }
  const problems = checkLessons(files.rulesText, files.evidenceText);
  if (problems.length > 0) {
    for (const problem of problems) console.error(`Lessons check failed: ${problem}`);
    process.exit(1);
  }
  const count = parseRules(files.rulesText).length;
  console.log(
    count === 0
      ? `Lessons check passed: the queue in ${RULES_PATH} is empty, which is its resting state.`
      : `Lessons check passed: ${count} queued lesson(s) in ${RULES_PATH}, each linked to an entry in ${EVIDENCE_PATH}.`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
