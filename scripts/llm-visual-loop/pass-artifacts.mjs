import { constants as fsConstants } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  renderVisualLoopHtml,
  renderVisualLoopMarkdown,
} from './report-renderers.mjs';

const REQUIRED_SOURCE_FILES = ['latest.json', 'latest.md', 'latest.html'];
const SCREENSHOT_KEYS = new Set(['screenshot', 'screenshotFile', 'screenshotPath']);

export async function snapshotPassArtifacts({
  rootDir,
  outputDir,
  historyDir,
  passId,
  bundlePath,
}) {
  assertSafePassId(passId);
  const snapshotRoot = path.join(historyDir, 'pass-artifacts');
  const snapshotDir = path.join(snapshotRoot, passId);
  const sourceBundlePath = bundlePath ? path.resolve(rootDir, bundlePath) : null;
  const snapshotBundlePath = sourceBundlePath
    ? path.join(snapshotDir, 'latest.bundle.json')
    : null;
  await fs.mkdir(snapshotRoot, { recursive: true });
  await fs.mkdir(snapshotDir);

  try {
    await Promise.all(REQUIRED_SOURCE_FILES.map((name) => fs.access(path.join(outputDir, name))));
    const run = JSON.parse(await fs.readFile(path.join(outputDir, 'latest.json'), 'utf8'));
    const screenshotCopies = collectScreenshotCopies(run, outputDir, snapshotDir);
    if (screenshotCopies.length === 0) {
      throw new Error('Recursive pass snapshot has no screenshot evidence.');
    }
    if (snapshotBundlePath) {
      await fs.copyFile(sourceBundlePath, snapshotBundlePath, fsConstants.COPYFILE_EXCL);
    }
    await fs.mkdir(path.join(snapshotDir, 'steps'));
    for (const screenshot of screenshotCopies) {
      await fs.mkdir(path.dirname(screenshot.snapshotPath), { recursive: true });
      await fs.copyFile(
        screenshot.sourcePath,
        screenshot.snapshotPath,
        fsConstants.COPYFILE_EXCL,
      );
    }

    const stableRun = rewriteArtifactReferences(run, {
      rootDir,
      outputDir,
      snapshotDir,
      snapshotBundlePath,
    });
    await fs.writeFile(
      path.join(snapshotDir, 'latest.json'),
      `${JSON.stringify(stableRun, null, 2)}\n`,
      { flag: 'wx' },
    );
    await fs.writeFile(
      path.join(snapshotDir, 'latest.md'),
      renderVisualLoopMarkdown(stableRun),
      { flag: 'wx' },
    );
    await fs.writeFile(
      path.join(snapshotDir, 'latest.html'),
      renderVisualLoopHtml(stableRun),
      { flag: 'wx' },
    );

    const artifacts = [
      artifact(rootDir, snapshotDir, 'run', 'latest.json'),
      artifact(rootDir, snapshotDir, 'report', 'latest.md'),
      artifact(rootDir, snapshotDir, 'report-html', 'latest.html'),
      artifact(rootDir, snapshotDir, 'screenshots', 'steps'),
    ];
    if (snapshotBundlePath) artifacts.push(artifact(rootDir, snapshotDir, 'bundle', 'latest.bundle.json'));
    return {
      artifacts,
      passManifestPath: path.join(snapshotDir, 'pass-manifest.json'),
    };
  } catch (error) {
    await fs.rm(snapshotDir, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

export async function writePassManifest({
  manifest,
  latestManifestPath,
  immutableManifestPath,
  ledgerPath,
}) {
  const formattedManifest = `${JSON.stringify(manifest, null, 2)}\n`;
  if (immutableManifestPath) {
    await fs.writeFile(immutableManifestPath, formattedManifest, { flag: 'wx' });
  }
  await fs.mkdir(path.dirname(latestManifestPath), { recursive: true });
  await fs.writeFile(latestManifestPath, formattedManifest);
  await fs.mkdir(path.dirname(ledgerPath), { recursive: true });
  await fs.appendFile(ledgerPath, `${JSON.stringify(manifest)}\n`);
}

function collectScreenshotCopies(run, outputDir, snapshotDir) {
  const copies = new Map();
  visit(run, (key, value) => {
    if (!SCREENSHOT_KEYS.has(key) || typeof value !== 'string') return;
    const relativePath = screenshotRelativePath(outputDir, value);
    const sourcePath = path.resolve(outputDir, relativePath);
    const priorSource = copies.get(relativePath);
    if (priorSource && priorSource !== sourcePath) {
      throw new Error(`Conflicting screenshot evidence path: ${relativePath}`);
    }
    copies.set(relativePath, sourcePath);
  });
  return [...copies].map(([relativePath, sourcePath]) => ({
    sourcePath,
    snapshotPath: path.resolve(snapshotDir, relativePath),
  }));
}

function rewriteArtifactReferences(value, options, key = '') {
  if (Array.isArray(value)) {
    return value.map((entry) => rewriteArtifactReferences(entry, options));
  }
  if (!value || typeof value !== 'object') {
    if (typeof value !== 'string') return value;
    if (key === 'bundlePath' && options.snapshotBundlePath) {
      return relativeArtifactPath(options.rootDir, options.snapshotBundlePath);
    }
    if (!SCREENSHOT_KEYS.has(key)) return value;
    const relativePath = screenshotRelativePath(options.outputDir, value);
    return key === 'screenshotFile'
      ? path.resolve(options.snapshotDir, relativePath)
      : relativePath.split(path.sep).join('/');
  }
  return Object.fromEntries(Object.entries(value).map(([entryKey, entry]) => [
    entryKey,
    rewriteArtifactReferences(entry, options, entryKey),
  ]));
}

function screenshotRelativePath(outputDir, value) {
  const stepsDir = path.resolve(outputDir, 'steps');
  const sourcePath = path.isAbsolute(value)
    ? path.resolve(value)
    : path.resolve(outputDir, value);
  const relativeToSteps = path.relative(stepsDir, sourcePath);
  if (
    !relativeToSteps ||
    relativeToSteps.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativeToSteps)
  ) {
    throw new Error(`Screenshot evidence must be inside ${stepsDir}: ${value}`);
  }
  return path.join('steps', relativeToSteps);
}

function visit(value, visitor) {
  if (Array.isArray(value)) {
    for (const entry of value) visit(entry, visitor);
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, entry] of Object.entries(value)) {
    visitor(key, entry);
    visit(entry, visitor);
  }
}

function artifact(rootDir, snapshotDir, kind, name) {
  return { kind, path: relativeArtifactPath(rootDir, path.join(snapshotDir, name)) };
}

function assertSafePassId(passId) {
  if (typeof passId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(passId)) {
    throw new Error(`Invalid recursive pass id: ${String(passId)}`);
  }
}

function relativeArtifactPath(rootDir, artifactPath) {
  const relativePath = path.relative(rootDir, artifactPath);
  if (!relativePath || relativePath.startsWith(`..${path.sep}`) || path.isAbsolute(relativePath)) {
    throw new Error(`Pass artifact must be inside the root directory: ${artifactPath}`);
  }
  return relativePath.split(path.sep).join('/');
}
