# Submit benchmark results from Linux

[Back to the README](../README.md#submit-results) · [Windows / PowerShell walkthrough](SUBMITTING-RESULTS-WINDOWS.md)

Export **one finalized bundle per run**, then submit the complete campaign in **one pull request**. Seven runs produce seven snapshot folders. The same steps work for a single run.

```text
Benchmark checkout                             Results checkout
results/<campaign>/runs/<runId>/
                |
                | bundle each run
                v
results/submissions/<batch>/<snapshotId>/  -->  bundles/<snapshotId>/
                       checksums.json                  checksums.json
                       ...complete bundle              ...complete bundle
```

A **run ID** identifies the original execution and is stored in `manifest.json`. A **snapshot ID** identifies a finalized export and is stored in `checksums.json`. The bundler generates the snapshot UUID and checksums automatically. Live `runs/<runId>/` directories normally have no `checksums.json`. Exporting a run again creates another snapshot ID, even when its evidence is unchanged.

## Before starting

Use **Bash**, Git, and **Node.js 24**. The commands use Node.js for JSON handling; there are no npm dependencies or additional JSON utilities to install. Run the blocks in order in the **same Bash session**, or save them in a Bash script. The examples enable `set -euo pipefail` so command failures stop the procedure; an error may end that shell session. Do not continue to commit or push after a failed check.

Have your benchmark checkout, portable run directories, and the original dataset notices available. A new clone of the benchmark tool may not include ignored data/notices from the generation machine. Linux paths are case-sensitive; adjust all example paths and the campaign name. Keep original runs and private recovery files on their generation machine.

The results repository must already have its scaffold on `main`. The current CI workflow also requires the standalone benchmark repository and exact pinned commit to be publicly readable. Maintainers setting up the repositories should first follow [Enable GitHub](../README.md#enable-github-after-creating-the-repository).

If you **already have finalized bundles**, reuse them: start a Bash session with `set -euo pipefail`, set `export export_root='/absolute/path/to/the/folder-containing-snapshot-directories'`, and begin at [step 5](#5-clone-the-results-repository-and-create-a-branch). You do not need the original generation checkout to submit those bundles. Step 6 validates them after copying.

## 1. Locate and inspect the runs

From the machine holding the benchmark results, configure the paths below. `runs_root` must contain the individual run UUID directories. `export_root` is a new output location outside those runs.

```bash
#!/usr/bin/env bash
set -euo pipefail

export benchmark_root="$HOME/work/HilbertRaum_LLM_bench"
export campaign='qwen35-2b-xl-extended-nonthinking-budget-v2'
export runs_root="$benchmark_root/results/$campaign/runs"
export export_root="$benchmark_root/results/submissions/$campaign-$(date -u +%Y%m%dT%H%M%SZ)"

cd -- "$benchmark_root"
test -f bench.mjs
test -d "$runs_root"
node --version
git --version

node --input-type=module <<'NODE'
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
const root = process.env.runs_root;
const runs = (await readdir(root, { withFileTypes: true }))
  .filter(entry => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name));
if (!runs.length) throw new Error(`No runs found in ${root}`);
const rows = [];
for (const run of runs) {
  const manifest = JSON.parse(await readFile(join(root, run.name, 'manifest.json'), 'utf8'));
  rows.push({ runId: manifest.runId, model: manifest.model.id, cases: manifest.workload.cases });
}
console.table(rows);
NODE
```

Check that the list contains the campaign you intend to share. A parent `runs/` directory is not itself a bundle. Finish desired automatic scoring or human-review imports before export. Generation failures remain valid outcomes; missing human reviews may remain explicitly unavailable.

## 2. Inspect the available assessments

Each run's `assessment-sets/*.json` files record its automatic scoring revisions. List the revision names and exact IDs:

```bash
node --input-type=module <<'NODE'
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
const root = process.env.runs_root;
for (const run of (await readdir(root, { withFileTypes: true })).filter(entry => entry.isDirectory())) {
  const directory = join(root, run.name, 'assessment-sets');
  for (const name of (await readdir(directory)).filter(name => name.endsWith('.json')).sort()) {
    const set = JSON.parse(await readFile(join(directory, name), 'utf8'));
    console.log(JSON.stringify({ runId: run.name, revision: set.scorer.revision,
      benchmax: Boolean(set.scorer.benchmax), assessmentSetId: set.assessmentSetId }));
  }
}
NODE
```

The example below selects `benchmax-1`, which applies when the runs have already been scored with that checker revision. Change it to the intended revision, such as `initial`, if appropriate. Selecting `initial` does not add BenchMAX scores. Choose a consistent scoring protocol, not whichever assessment scores highest.

Each run's assessment ID is resolved separately. A shared revision name does not guarantee shared IDs. When a run has multiple sets under the same revision, give its exact ID in `assessmentOverrides`. Human assessments are separate and must already have been imported into the original live run.

## 3. Configure assessment choices and dataset notices

Create a local configuration beside the batch's output folder. It is a preparation file, **outside every finalized snapshot**, and does not belong in the contribution. The paths under `notices` and `selectionNotice` are relative to `benchmark_root`.

```bash
export export_config="${export_root}.json"
mkdir -p -- "$(dirname -- "$export_config")"
cat > "$export_config" <<'JSON'
{
  "assessmentRevision": "benchmax-1",
  "assessmentOverrides": {},
  "humanAssessmentByRun": {},
  "runIds": [],
  "selectionNotice": "dataset_selected_items/ATTRIBUTION.md",
  "notices": {
    "belebele": [
      "data/belebele/SOURCE.json", "data/belebele/LICENSE_CC-BY-SA4.0",
      "data/belebele/UPSTREAM_README.md", "data/belebele/UPSTREAM_DATASET_CARD.md"
    ],
    "global-mmlu-lite": [
      "data/global-mmlu-lite/SOURCE.json",
      "data/global-mmlu-lite/originals/LICENSE.Apache-2.0.txt",
      "data/global-mmlu-lite/originals/README.upstream.md"
    ],
    "germanquad": [
      "data/germanquad/SOURCE.json", "data/germanquad/UPSTREAM_DATASET_CARD.md",
      "data/benchmax/originals/LICENSE.CC-BY-4.0.txt"
    ],
    "xnli": [
      "data/xnli/SOURCE.json", "data/xnli/LICENSE",
      "data/xnli/README.release.md", "data/xnli/README.upstream.md"
    ],
    "paws-x": [
      "data/paws-x/SOURCE.json", "data/paws-x/LICENSE",
      "data/paws-x/README.upstream.md", "data/paws-x/README.paws.md",
      "data/paws-x/README.huggingface.md"
    ],
    "mt-bench-x": [
      "data/mt-bench-x/SOURCE.json", "data/mt-bench-x/LICENSE",
      "data/mt-bench-x/UPSTREAM_README.md"
    ],
    "mgsm": [
      "data/mgsm-rev2/SOURCE.json", "data/mgsm-rev2/ATTRIBUTION.md",
      "data/mgsm-rev2/README.md", "data/belebele/LICENSE_CC-BY-SA4.0"
    ],
    "benchmax": [
      "data/benchmax/SOURCE.json", "data/benchmax/originals/LICENSE.CC-BY-4.0.txt",
      "data/benchmax/originals/README.upstream.md",
      "data/benchmax/author-checkers/LICENSE",
      "data/benchmax/author-checkers/LICENSE.Apache-2.0.txt",
      "data/benchmax/author-checkers/README.md"
    ]
  }
}
JSON
```

Edit this JSON file before continuing if needed:

- `assessmentOverrides`: map a run UUID to its exact automatic assessment ID, for example `"RUN_UUID": "FULL_ASSESSMENT_SET_ID"`.
- `humanAssessmentByRun`: map each run with completed human reviews to the human assessment ID you want to select. An empty map leaves human ratings unselected.
- `runIds`: an empty array selects all run directories. Set specific UUIDs when exporting a single run or continuing only the remaining runs after a partial batch failure.
- `notices`: the map covers the eight standard reviewed quick/extended datasets. Add entries for other datasets and correct any local paths. The dataset ID is `mgsm`, while its source folder is `mgsm-rev2`.

The CC BY 4.0 text stored with BenchMAX is also used for GermanQuAD, and the CC BY-SA 4.0 text stored with Belebele is also used for MGSM-Rev2. Each dataset's own source records remain included. If these licence files are elsewhere, adjust their paths. For a custom profile, replace `selectionNotice` with its applicable attribution file.

Consult the benchmark's `dataset_selected_items/ATTRIBUTION.md` and original sources for the exact revisions you are contributing. Preserve the applicable licence terms, including XNLI's noncommercial restriction. The map does not relicense the data or establish licence completeness. Obtain missing original notices; do not substitute empty files.

## 4. Export and verify the batch

This block first checks every selected run's assessment and notice files, then invokes the benchmark's existing `bundle` and `verify` commands for each run. Paths are passed as separate arguments, including when they contain spaces. A failed command stops the batch.

```bash
node --input-type=module <<'NODE'
import { readdir, readFile, lstat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const { benchmark_root: tool, runs_root: root, export_root: output, export_config: configPath } = process.env;
const json = async file => JSON.parse(await readFile(file, 'utf8'));
const config = await json(configPath);
const available = (await readdir(root, { withFileTypes: true }))
  .filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
if (!Array.isArray(config.runIds)) throw new Error('runIds must be an array.');
const runIds = config.runIds.length ? config.runIds : available;
if (!runIds.length || new Set(runIds).size !== runIds.length) throw new Error('Choose a nonempty set of distinct runs.');
const plan = [];

for (const runId of runIds) {
  if (!available.includes(runId)) throw new Error(`Unknown run: ${runId}`);
  const directory = join(root, runId);
  const setDirectory = join(directory, 'assessment-sets');
  const sets = await Promise.all((await readdir(setDirectory))
    .filter(name => name.endsWith('.json')).map(name => json(join(setDirectory, name))));
  const override = config.assessmentOverrides?.[runId];
  const chosen = sets.filter(set => override ? set.assessmentSetId === override : set.scorer.revision === config.assessmentRevision);
  if (chosen.length !== 1) throw new Error(`Run ${runId}: choose one revision or exact assessment override.`);

  const items = (await readFile(join(directory, 'items.jsonl'), 'utf8'))
    .split(/\r?\n/).filter(line => line.trim()).map(line => JSON.parse(line));
  const args = ['bundle', '--run', directory, '--output', output, '--assessment', chosen[0].assessmentSetId];
  for (const dataset of new Set(items.map(item => item.dataset))) {
    const notices = config.notices?.[dataset];
    if (!Array.isArray(notices) || !notices.length) throw new Error(`Missing notices for ${dataset}`);
    for (const notice of [...notices, config.selectionNotice]) {
      const file = resolve(tool, notice);
      if (!(await lstat(file)).isFile()) throw new Error(`Notice must be a regular file: ${file}`);
      args.push('--notice', `${dataset}=${file}`);
    }
  }
  const human = config.humanAssessmentByRun?.[runId];
  if (human) args.push('--human-assessment', human);
  plan.push({ runId, args });
}

const cli = join(tool, 'bench.mjs');
const exported = [];
for (const entry of plan) {
  console.log(`Exporting ${entry.runId}`);
  const snapshot = JSON.parse(execFileSync(process.execPath, [cli, ...entry.args], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 8 * 1024 * 1024
  }));
  execFileSync(process.execPath, [cli, 'verify', '--run', snapshot.directory], { stdio: 'inherit' });
  exported.push({ runId: entry.runId, snapshotId: snapshot.snapshotId });
}
console.table(exported);
console.log(`Verified ${exported.length} bundles in ${output}`);
NODE
```

Each output UUID directory now contains `checksums.json`, original evidence, one selected report, schemas, assessment support and attribution. Finalization may generate a report in the live run, but does not rescore answers or replace generation evidence. It does not upload anything.

If a batch fails, successfully finalized snapshots remain usable. Inspect their `checksums.json` files for `runId`, then set `runIds` in the configuration to only the remaining executions and rerun step 4. Do not recreate the configuration or change `export_root` while continuing that batch. Re-exporting an already exported run creates another snapshot UUID.

Generation must be complete by default. Failed cases do not prevent finalization; pending human reviews remain unavailable. To intentionally submit incomplete generation, use the benchmark's explicit `--allow-incomplete` option and disclose it in the PR. This example does not enable that option automatically. See the [benchmark's bundling contract](https://github.com/HilbertraumAI/HilbertRaum_LLM_bench/blob/c9c69d38ce49aa862461ccd756f077a66f6d5e4f/docs/PORTABLE-RUNS.md#finalize-a-bundle).

## 5. Clone the results repository and create a branch

With write access, use the shared repository as `results_remote`. Otherwise fork it on GitHub first and put your fork's clone URL there. Keep `upstream_remote` pointing to the shared repository. Set `results_root` to a separate directory from the benchmark checkout; an existing results checkout must be clean. Choose a fresh branch name for this contribution.

```bash
set -euo pipefail
results_remote='https://github.com/HilbertraumAI/Hilbertraum_LLM_Bench_Results.git'
upstream_remote='https://github.com/HilbertraumAI/Hilbertraum_LLM_Bench_Results.git'
export results_root="$HOME/work/Hilbertraum_LLM_Bench_Results"
branch_name='results/qwen35-2b-extended-nonthinking'

if [[ ! -e "$results_root/.git" ]]; then
    git clone "$results_remote" "$results_root"
fi
cd -- "$results_root"
working_changes=$(git status --porcelain)
if [[ -n "$working_changes" ]]; then
    printf '%s\n' 'Commit or otherwise preserve existing work before creating a contribution branch.' >&2
    exit 1
fi
git fetch "$upstream_remote" main
base_commit=$(git rev-parse FETCH_HEAD)
git switch -c "$branch_name" "$base_commit"
git remote -v
```

The branch starts from accepted `main` even if your fork is behind. Confirm that `origin` is your writable repository or fork: you will push there.

Set up the validator/collector at the exact pin required by the results repository:

```bash
tool_repository=$(node -p 'JSON.parse(require("node:fs").readFileSync("benchmark-tool.json", "utf8")).repository')
tool_ref=$(node -p 'JSON.parse(require("node:fs").readFileSync("benchmark-tool.json", "utf8")).ref')
tool_root="$results_root/.tools/benchmark"
if [[ ! -e "$tool_root" ]]; then
    git clone --no-checkout "https://github.com/$tool_repository.git" "$tool_root"
    git -C "$tool_root" -c core.autocrlf=false checkout --detach "$tool_ref"
fi
```

Keep this dedicated checkout clean. Validation rejects a modified checkout or the wrong commit. Its version controls validation/aggregation, not the generation versions recorded in your submitted runs. Do not change `benchmark-tool.json` just to match your generation checkout.

If maintainers have changed the pin since your last contribution, first confirm `.tools/benchmark` has no local changes. Then update that dedicated checkout and validate again:

```bash
tool_changes=$(git -C "$tool_root" status --porcelain)
if [[ -n "$tool_changes" ]]; then
    printf '%s\n' 'Preserve changes in the tool checkout before updating its pin.' >&2
    exit 1
fi
git -C "$tool_root" fetch origin "$tool_ref"
git -C "$tool_root" -c core.autocrlf=false checkout --detach "$tool_ref"
```

## 6. Copy the snapshot folders and build the combined results

Keep `export_root` set to the folder containing the finalized snapshot directories. Copy their complete contents directly into `bundles/<snapshotId>/`; do not add a campaign directory between `bundles/` and the UUIDs. The following code checks all destinations before copying and refuses to overwrite existing snapshots.

```bash
cd -- "$results_root"
node --input-type=module <<'NODE'
import { readdir, readFile, lstat, cp } from 'node:fs/promises';
import { join } from 'node:path';
const { export_root: source, results_root: root } = process.env;
const entries = (await readdir(source, { withFileTypes: true })).filter(entry => entry.isDirectory());
if (!entries.length) throw new Error(`No bundles found in ${source}`);
const copies = [];
for (const entry of entries) {
  const directory = join(source, entry.name);
  const checksums = JSON.parse(await readFile(join(directory, 'checksums.json'), 'utf8'));
  if (entry.name !== checksums.snapshotId) throw new Error(`Snapshot folder name mismatch: ${entry.name}`);
  const target = join(root, 'bundles', entry.name);
  const existing = await lstat(target).catch(error => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (existing) throw new Error(`Snapshot already exists: ${target}`);
  copies.push({ directory, target });
}
for (const { directory, target } of copies) {
  await cp(directory, target, { recursive: true, force: false, errorOnExist: true });
}
console.log(`Copied ${copies.length} complete snapshot folders.`);
NODE

node --test tests/results.test.mjs
node scripts/results.mjs build --base-ref "$base_commit"
cat build/index.json
collection_path=$(node -p 'JSON.parse(require("node:fs").readFileSync("build/index.json", "utf8")).collectionPath')
printf 'Open this report: %s\n' "$results_root/build/${collection_path}report.html"
```

`build` verifies the copied bundles, checks accepted files against the fetched base commit, and generates/validates the combined collection. Inspect the report path printed above: check models, assessments, coverage and warnings. Existing accepted results participate as well. Seven independent runs add seven executions; several snapshots of one run must not count as extra independent evaluations.

Leave `selection.json` unchanged when each new run has one submitted snapshot. If a run already has a submitted snapshot with different evidence, keep it and make an explicit selection as described in [Select snapshots and assessments](../README.md#select-snapshots-and-assessments).

If you only want to validate an existing results checkout after setting up the pinned tool, run `node scripts/results.mjs validate`, `node --test tests/results.test.mjs`, and `node scripts/results.mjs build` from that checkout. Without `--base-ref`, validation cannot check changes against previously accepted bundle files.

## 7. Commit, push and open one pull request

Review what you are about to publish. The contribution consists of complete snapshot directories, plus deliberate `selection.json` changes if needed. Keep the export configuration, live runs, model files, private configuration and logs outside the commit. `.tools/` and `build/` are ignored.

```bash
git status --short
git add -- bundles
# Only if this contribution deliberately changes snapshot choices:
# git add -- selection.json
git diff --cached --stat
git diff --cached --name-status
```

Check that an initial campaign adds files under the expected UUID directories and does not modify or delete accepted bundles. Preserve exact bytes: do not format, trim or normalize finalized evidence. Review sensitive content before publication; resolve problems in the source/export process before creating a new snapshot.

Use Git push for these files. The browser uploader limits individual files to 25 MiB, while ordinary Git accepts files up to 100 MiB. Do not split checksummed files or introduce LFS pointers in this workflow. [GitHub file-size limits](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github).

Once the staged files and local checks are correct, adapt the message to your campaign and push:

```bash
git commit -m 'Add Qwen3.5-2B extended non-thinking results'
git push -u origin "$branch_name"
```

Open a PR on `HilbertraumAI/Hilbertraum_LLM_Bench_Results` with **base `main`** and your pushed branch as the comparison branch. For a fork, select your fork as the head repository. All seven runs can be in the same PR. Suggested title: `Add Qwen3.5-2B extended non-thinking results for seven variants`.

Complete the [PR template](../.github/pull_request_template.md) with model/checkpoint and quantisation, run and snapshot IDs, profile and generation settings, hardware/runtime, failures, incomplete work or human reviews, selection changes, and the validation outcome. Keep failures visible; acceptance does not depend on a high score.

## 8. Review checks, preview and later updates

GitHub runs **Validate bundles and collection** using the pinned tool. A successful PR build produces a `results-preview` artifact. Open the workflow run from the PR's checks, download and extract it, then follow `index.json` to the selected collection's `report.html`. A first-time fork contributor's workflow may need maintainer approval to start. [Fork workflow behavior](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflows-in-forked-repositories).

If a check fails, read its log, fix the contribution locally, rebuild, and push to the same branch. A passing check does not merge the PR. A maintainer reviews the evidence and preview, then merges; `main` gets a new build and an `accepted-results` artifact. Artifacts expire after 14 days. Website deployment is not configured here.

For later human reviews or rescoring, update the original run and export a new snapshot. Keep the accepted snapshot intact and submit the new one through another PR, explaining any updated `selection.json` choices. See [common submission problems](../README.md#common-submission-problems) for missing notices, ambiguous assessments, checksum errors and tool-pin problems.
