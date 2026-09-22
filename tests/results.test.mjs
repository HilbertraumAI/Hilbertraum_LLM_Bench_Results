import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, checkAppendOnly, loadTool, processResults, readToolPin } from '../scripts/results.mjs';

const tool = resolve(process.env.BENCHMARK_TOOL_DIR ?? join(ROOT, '.tools', 'benchmark'));
const pin = await readToolPin();
await loadTool(tool, pin);
const module = name => import(pathToFileURL(join(tool, 'lib', name)).href);
const { normalizeConfiguration, prepareRun } = await module('config.mjs');
const { portablePlan, assessPortable } = await module('results-v2.mjs');
const { executePortable } = await module('runner-v2.mjs');
const { finalizeBundle } = await module('bundle-v2.mjs');
const json = async path => JSON.parse(await readFile(path, 'utf8'));
const git = (root, args, encoding = 'utf8') => execFileSync('git', ['-C', root, ...args], { encoding, windowsHide: true });

async function workspace(t) {
  const root = await mkdtemp(join(tmpdir(), 'hilbertraum-results-test-'));
  t.after(async () => {
    assert(resolve(root).startsWith(resolve(tmpdir()) + sep + 'hilbertraum-results-test-'));
    await rm(root, { recursive: true, force: true });
  });
  await mkdir(join(root, 'bundles'));
  for (const name of ['benchmark-tool.json', 'selection.json', '.gitattributes']) await cp(join(ROOT, name), join(root, name));
  await writeFile(join(root, 'bundles', '.gitkeep'), '');
  return root;
}

// These fixtures use an injected in-memory runtime, never a real model. Some
// deliberately have demo:false to exercise submission policy; they stay in temp.
async function fixture(t, demo = false) {
  const root = await workspace(t), source = join(root, 'fixture-source');
  await mkdir(source);
  await writeFile(join(source, 'model.gguf'), 'GGUF synthetic weights');
  await writeFile(join(source, 'server'), 'synthetic executable');
  const items = [
    { id: 'correct', prompt: 'correct', scoring: { type: 'choice', answer: 'A' } },
    { id: 'failed', prompt: 'failed', scoring: { type: 'choice', answer: 'A' } },
    { id: 'human', prompt: 'human', scoring: { type: 'human' } }
  ];
  await writeFile(join(source, 'items.jsonl'), items.map(item => JSON.stringify(item)).join('\n') + '\n');
  const config = normalizeConfiguration({ version: 1, outputDir: 'runs',
    runtime: { executable: 'server', args: [] }, models: [{ id: 'fixture', path: 'model.gguf' }],
    datasets: [{ id: 'fixture-data', type: 'custom', path: 'items.jsonl', language: 'en', revision: 'fixture-v1' }] }, source, { demo });
  const plan = await portablePlan(config, await prepareRun(config), 'fixture');
  const run = await executePortable(config, plan, { localRoot: join(source, 'local'), log: () => {},
    runtimeFactory: async () => ({ close: async () => {}, generate: async messages => ({
      answer: 'A', finishReason: messages[0].content === 'failed' ? 'length' : 'stop', request: { messages } }) }) });
  const notice = join(source, 'NOTICE.txt');
  await writeFile(notice, 'Synthetic test evidence only.');
  const bundle = assessmentSetId => finalizeBundle(run.directory, { output: join(root, 'bundles'),
    assessmentSetId: assessmentSetId ?? run.assessmentSetId, notices: { 'fixture-data': [notice] } });
  return { root, run, bundle, snapshot: await bundle() };
}

test('empty repository validates and builds a null collection, with strict pin and selection checks', async t => {
  const root = await workspace(t);
  const result = await processResults({ root, tool });
  assert.equal(result.runs, 0); assert.equal(result.collectionId, null);
  assert.deepEqual(await processResults({ root, tool, mode: 'build' }), result);
  assert.deepEqual(await json(join(root, 'build', 'index.json')), result);
  await writeFile(join(root, 'selection.json'), JSON.stringify({ version: 1, runs: { unknown: {} } }));
  await assert.rejects(processResults({ root, tool }), /no bundles/);
  await writeFile(join(root, 'benchmark-tool.json'), JSON.stringify({ ...pin, ref: 'main' }));
  await assert.rejects(processResults({ root, tool }), /full commit SHA/);
  await assert.rejects(loadTool(tool, { ...pin, ref: '0'.repeat(40) }), /pinned commit/);
});

test('build retains failures and missing human reviews, reuses output, and rejects damaged evidence', async t => {
  const f = await fixture(t);
  const original = await readFile(join(f.snapshot.directory, 'attempts.jsonl'));
  const result = await processResults({ root: f.root, tool, mode: 'build' });
  const summary = await json(join(f.root, 'build', result.collectionPath, 'summary.json'));
  assert.equal(result.runs, 1); assert.equal(summary.counts.observations, 3);
  const run = JSON.parse((await readFile(join(f.root, 'build', result.collectionPath, 'runs.jsonl'), 'utf8')).trim());
  assert.equal(run.status.failed, 1); assert.equal(run.status.generationComplete, true); assert.equal(run.status.scoringComplete, false);
  assert.equal((await processResults({ root: f.root, tool, mode: 'build' })).collectionId, result.collectionId);
  assert.deepEqual(await readFile(join(f.snapshot.directory, 'attempts.jsonl')), original);
  await writeFile(join(f.snapshot.directory, 'attempts.jsonl'), Buffer.concat([original, Buffer.from(' ')]));
  await assert.rejects(processResults({ root: f.root, tool }), /checksum/);
});

test('equivalent snapshots count once; changed assessments require explicit selection', async t => {
  const f = await fixture(t);
  await f.bundle();
  const equivalent = await processResults({ root: f.root, tool });
  assert.equal(equivalent.snapshots, 2); assert.equal(equivalent.runs, 1);
  const set = await assessPortable(f.run.directory, { revision: 'another-review' });
  const later = await f.bundle(set);
  await assert.rejects(processResults({ root: f.root, tool }), /Select snapshotId explicitly/);
  await writeFile(join(f.root, 'selection.json'), JSON.stringify({ version: 1, runs: { [f.run.runId]: { snapshotId: later.snapshotId } } }));
  assert.equal((await processResults({ root: f.root, tool })).runs, 1);
});

test('synthetic runs and stray/live-run directories are rejected', async t => {
  const f = await fixture(t, true);
  await assert.rejects(processResults({ root: f.root, tool }), /Synthetic/);
  const root = await workspace(t);
  await mkdir(join(root, 'bundles', 'live-run'));
  await assert.rejects(processResults({ root, tool }), /snapshot UUID/);
});

test('Git preserves bundle bytes and accepted files cannot be edited or deleted', async t => {
  const root = await workspace(t);
  git(root, ['init', '-q', '-b', 'main']);
  const evidence = Buffer.from('line one\r\nGrüße\n', 'utf8');
  await writeFile(join(root, 'bundles', 'evidence.txt'), evidence);
  git(root, ['-c', 'core.autocrlf=true', 'add', '.']);
  git(root, ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'fixture']);
  const base = git(root, ['rev-parse', 'HEAD']).trim();
  assert.deepEqual(git(root, ['show', 'HEAD:bundles/evidence.txt'], null), evidence);
  checkAppendOnly(root, base);
  await writeFile(join(root, 'bundles', 'new.txt'), 'new evidence');
  git(root, ['add', 'bundles/new.txt']); checkAppendOnly(root, base);
  await writeFile(join(root, 'bundles', 'evidence.txt'), 'edited');
  assert.throws(() => checkAppendOnly(root, base), /immutable/);
  await rm(join(root, 'bundles', 'evidence.txt'));
  assert.throws(() => checkAppendOnly(root, base), /immutable/);
  assert.throws(() => checkAppendOnly(root, '--help'), /full commit SHA/);
});
