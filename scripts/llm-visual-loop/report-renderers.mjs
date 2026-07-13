import { formatActionState, formatKeyboardAction } from './action-adapter.mjs';
import { renderImprovementFindingsMarkdown } from './improvement-report.mjs';

export function renderVisualLoopMarkdown(run) {
  const lines = [
    '# LLM Visual Loop Playtest', '', `Generated: ${run.generatedAt}`, `URL: ${run.url}`,
    `Decision provider: ${run.decisionProvider}`, `Action boundary: ${run.actionBoundary}`, '',
    '## Artifacts', '',
    '- `latest.json` - full observations, prompts, decisions, and execution results',
    '- `latest.html` - screenshot replay viewer with decisions',
    '- `steps/` - per-step screenshots used for decisions', '', '## Findings', '',
  ];
  lines.push(...renderImprovementFindingsMarkdown(run.findings), '', '## Rerun Comparison', '', ...renderComparisonMarkdown(run.comparison), '', '## Steps', '');
  for (const step of run.steps) {
    lines.push(`### Step ${step.index}`, '', `Screenshot: ${step.observation.screenshot}`, `Screenshot file: ${step.observation.screenshotFile}`,
      `Visible text: ${step.observation.visibleText}`, `Decision: ${step.decision.action.kind} - ${step.decision.rationale}`,
      `Expected result: ${step.decision.expectedResult}`, `Execution: ${step.execution.ok ? 'ok' : `failed - ${step.execution.error}`}`, '', 'Available actions:');
    for (const action of step.observation.availableActions) lines.push(`- ${action.label || action.selector} | ${action.selector} | ${action.actionHint}${formatActionState(action.state)} | ${JSON.stringify(action.bounds)}`);
    if ((step.observation.keyboardActions ?? []).length > 0) {
      lines.push('Keyboard actions:');
      for (const action of step.observation.keyboardActions) lines.push(`- ${formatKeyboardAction(action)}`);
    }
    lines.push('');
  }
  if (run.finalObservation) lines.push('## Final Observation', '', `Screenshot: ${run.finalObservation.screenshot}`, `Screenshot file: ${run.finalObservation.screenshotFile}`, `Visible text: ${run.finalObservation.visibleText}`, '');
  return `${lines.join('\n')}\n`;
}

function renderComparisonMarkdown(comparison) {
  if (!comparison || comparison.status === 'no-baseline') {
    return [
      '- No previous `latest.json` baseline was available for this run.',
      `- Current stop reason: ${comparison?.current?.stopReason ?? 'unknown'}`,
      `- Current findings: ${(comparison?.current?.findingIds ?? []).join(', ') || 'none'}`,
    ];
  }
  return [
    `- Status: ${comparison.status}`,
    `- Previous run: ${comparison.previous.runId} (${comparison.previous.stopReason ?? 'unknown'}, ${comparison.previous.steps ?? 0} steps)`,
    `- Current run: ${comparison.current.runId} (${comparison.current.stopReason ?? 'unknown'}, ${comparison.current.steps ?? 0} steps)`,
    `- Steps delta: ${comparison.behavior.stepsDelta}`,
    `- Resolved findings: ${comparison.findings.resolved.join(', ') || 'none'}`,
    `- Added findings: ${comparison.findings.added.join(', ') || 'none'}`,
    `- Persistent findings: ${comparison.findings.persistent.join(', ') || 'none'}`,
  ];
}

export function renderVisualLoopHtml(run) {
  const runJson = JSON.stringify(run);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" /><title>Farm LLM Visual Loop</title><style>
:root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; background: #050505; color: #f5f5f5; }
body { margin: 0; height: 100vh; overflow: hidden; display: grid; grid-template-columns: minmax(0, 1fr) 390px; }
main { display: grid; grid-template-rows: minmax(0, 1fr) auto; min-width: 0; min-height: 0; height: 100vh; overflow: hidden; }
img { width: 100%; height: 100%; object-fit: contain; background: #0b0b0b; }
aside { height: 100vh; box-sizing: border-box; border-left: 1px solid rgba(255,255,255,.18); padding: 14px; overflow: auto; background: rgba(255,255,255,.05); }
button { border: 1px solid rgba(255,255,255,.35); background: rgba(255,255,255,.08); color: inherit; padding: 6px 10px; border-radius: 4px; cursor: pointer; }
button:hover, button.active { background: rgba(255,255,255,.2); }
.strip { display: flex; gap: 6px; padding: 8px; border-top: 1px solid rgba(255,255,255,.16); overflow-x: auto; background: rgba(255,255,255,.04); }
.meta { color: #c8c8c8; font-size: 12px; line-height: 1.45; } pre { white-space: pre-wrap; word-break: break-word; font-size: 11px; background: rgba(255,255,255,.07); padding: 8px; border-radius: 4px; } li { margin: 8px 0; }
</style></head><body><main><img id="frame" alt="Visual loop screenshot" /><div class="strip" id="strip"></div></main>
<aside><h1>Visual Loop</h1><p class="meta" id="frameMeta"></p><h2>Decision</h2><pre id="decision"></pre><h2>Visible Text</h2><pre id="visibleText"></pre><h2>Actions</h2><ul id="actions"></ul><h2>Keyboard</h2><ul id="keyboardActions"></ul><h2>Findings</h2><pre id="findings"></pre></aside>
<script>
const run = ${runJson};
const frames = [...run.steps.map((step) => ({ kind: 'step', ...step })), { kind: 'final', observation: run.finalObservation, decision: { action: { kind: 'none' }, rationale: 'Final screenshot.' }, execution: { ok: true } }].filter((frame) => frame.observation);
let index = 0;
const frame = document.getElementById('frame'); const strip = document.getElementById('strip'); const frameMeta = document.getElementById('frameMeta'); const decision = document.getElementById('decision'); const visibleText = document.getElementById('visibleText'); const actions = document.getElementById('actions'); const keyboardActions = document.getElementById('keyboardActions'); const findings = document.getElementById('findings');
findings.textContent = JSON.stringify(run.findings, null, 2);
for (const [i, item] of frames.entries()) { const button = document.createElement('button'); button.textContent = item.kind === 'final' ? 'final' : 'step ' + item.index; button.addEventListener('click', () => show(i)); strip.append(button); }
function show(next) { index = next; const item = frames[index]; frame.src = item.observation.screenshot; frameMeta.textContent = item.observation.label + ' / ' + item.observation.screenshot; decision.textContent = JSON.stringify({ decision: item.decision, execution: item.execution }, null, 2); visibleText.textContent = item.observation.visibleText; actions.innerHTML = item.observation.availableActions.map((action) => '<li><strong>' + escapeHtml(action.label || action.selector) + '</strong><br /><span class="meta">' + escapeHtml(action.selector) + ' / ' + action.actionHint + escapeHtml(formatActionState(action.state)) + '</span></li>').join(''); keyboardActions.innerHTML = (item.observation.keyboardActions || []).map((action) => '<li><strong>' + escapeHtml(action.label) + '</strong><br /><span class="meta">' + escapeHtml(action.key) + escapeHtml(action.alternateKeys?.length ? ' / ' + action.alternateKeys.join(', ') : '') + escapeHtml(action.selector ? ' / ' + action.selector : '') + ' / ' + escapeHtml(action.actionHint + formatActionState(action.state)) + '</span></li>').join(''); [...strip.children].forEach((button, i) => button.classList.toggle('active', i === index)); }
function formatActionState(state) { return state ? ' / state ' + JSON.stringify(state) : ''; }
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character])); }
show(0);
</script></body></html>\n`;
}
