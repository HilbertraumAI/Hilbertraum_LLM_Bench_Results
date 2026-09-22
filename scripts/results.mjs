import { execFileSync } from 'node:child_process';
import { lstat, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

export const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const json = async path => JSON.parse(await readFile(path, 'utf8'));
const git = (directory, args) => execFileSync('git', ['-C', directory, ...args], { encoding: 'utf8', windowsHide: true }).trim();

export async function readToolPin(root = ROOT) {
  const pin = await json(join(root, 'benchmark-tool.json'));
  if (!pin || Object.keys(pin).sort().join(',') !== 'ref,repository'
    || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(pin.repository)
    || !/^[a-f0-9]{40}$/.test(pin.ref)) throw new Error('benchmark-tool.json requires a repository and full commit SHA.');
  return pin;
}

export async function loadTool(directory, pin) {
  const root = resolve(directory);
  if (resolve(git(root, ['rev-parse', '--show-toplevel'])).toLowerCase() !== root.toLowerCase()
    || git(root, ['rev-parse', 'HEAD']) !== pin.ref) throw new Error('Use a dedicated benchmark checkout at the pinned commit. See README.md.');
  if (git(root, ['status', '--porcelain', '--untracked-files=normal'])) throw new Error('The benchmark checkout must be clean.');
  const module = name => import(pathToFileURL(join(root, 'lib', name)).href);
  const [bundle, collection] = await Promise.all([module('bundle-v2.mjs'), module('collection-v1.mjs')]);
  return { verifyBundle: bundle.verifyBundle, collectBundles: collection.collectBundles, verifyCollection: collection.verifyCollection };
}

export function checkAppendOnly(root, baseRef) {
  if (!baseRef || /^0+$/.test(baseRef)) return; // First push has no previous commit.
  if (!/^[a-f0-9]{40}$/.test(baseRef)) throw new Error('The comparison base must be a full commit SHA.');
  const changes = git(root, ['diff', '--name-status', '-z', '--no-renames', baseRef, '--', 'bundles']).split('\0');
  for (let i = 0; i + 1 < changes.length; i += 2) {
    if (changes[i] !== 'A') throw new Error(`Accepted bundle files are immutable: ${changes[i + 1]}. Add a new snapshot instead.`);
  }
}

export async function inspectBundles(root, verifyBundle) {
  const directory = join(root, 'bundles');
  const info = await lstat(directory);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('bundles must be a regular directory.');
  const bundles = [];
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name === '.gitkeep' && entry.isFile()) {
      if ((await readFile(join(directory, entry.name))).length) throw new Error('bundles/.gitkeep must stay empty.');
      continue;
    }
    if (!entry.isDirectory() || entry.isSymbolicLink() || !uuid.test(entry.name)) throw new Error('bundles/ accepts only finalized snapshot UUID directories.');
    const path = join(directory, entry.name);
    const verified = await verifyBundle(path);
    if (verified.snapshotId !== entry.name) throw new Error('Bundle folder name must equal checksums.json snapshotId.');
    const manifest = await json(join(path, 'manifest.json'));
    if (manifest.demo) throw new Error('Synthetic/demo runs do not belong in the results repository.');
    // Completeness is displayed, not an acceptance threshold: real failures and
    // missing human assessments must remain visible rather than be dropped.
    bundles.push({ path, ...verified });
  }
  return bundles;
}

export async function processResults({ root = ROOT, tool, mode = 'validate', baseRef } = {}) {
  root = resolve(root);
  if (!['validate', 'build'].includes(mode)) throw new Error('Use validate or build.');
  const pin = await readToolPin(root);
  const api = await loadTool(tool ?? process.env.BENCHMARK_TOOL_DIR ?? join(ROOT, '.tools', 'benchmark'), pin);
  checkAppendOnly(root, baseRef);
  const bundles = await inspectBundles(root, api.verifyBundle);
  const selection = await json(join(root, 'selection.json'));
  if (!selection || selection.version !== 1 || Object.keys(selection).sort().join(',') !== 'runs,version'
    || !selection.runs || typeof selection.runs !== 'object' || Array.isArray(selection.runs)) throw new Error('Invalid selection.json. Use {version:1,runs:{}}.');
  if (!bundles.length && Object.keys(selection.runs).length) throw new Error('selection.json names runs but no bundles exist.');
  let temporary;
  try {
    const output = mode === 'build' ? join(root, 'build') : (temporary = await mkdtemp(join(tmpdir(), 'hilbertraum-results-')));
    const result = bundles.length ? await api.collectBundles({ inputs: bundles.map(bundle => bundle.path), output, selection }) : null;
    if (result) await api.verifyCollection(result.directory);
    const index = { version: 1, benchmarkTool: pin, snapshots: bundles.length,
      runs: result?.runs ?? 0, collectionId: result?.collectionId ?? null,
      collectionPath: result ? `${result.collectionId}/` : null };
    if (mode === 'build') {
      await mkdir(output, { recursive: true });
      await writeFile(join(output, 'index.json'), `${JSON.stringify(index, null, 2)}\n`, 'utf8');
    }
    return index;
  } finally {
    if (temporary) {
      if (!resolve(temporary).startsWith(resolve(tmpdir()) + sep + 'hilbertraum-results-')) throw new Error('Unexpected temporary directory.');
      await rm(temporary, { recursive: true, force: true });
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { positionals, values } = parseArgs({ allowPositionals: true, options: { tool: { type: 'string' }, 'base-ref': { type: 'string' } } });
    if (positionals.length !== 1) throw new Error('Usage: node scripts/results.mjs validate|build [--tool PATH] [--base-ref COMMIT_SHA]');
    const result = await processResults({ mode: positionals[0], tool: values.tool,
      baseRef: values['base-ref'] ?? process.env.RESULTS_BASE_REF });
    console.log(JSON.stringify(result, null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
