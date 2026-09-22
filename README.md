# HilbertRaum benchmark results

This repository stores reviewed, finalized result bundles from [HilbertRaum_LLM_bench](https://github.com/HilbertraumAI/HilbertRaum_LLM_bench). Each run evaluates one model/inference configuration on one machine. Contributors submit results through pull requests; a maintainer review and merge into `main` accepts them.

Answer quality is the primary result. Coverage, generation failures, human-review status, and hardware/runtime conditions remain visible. The repository preserves original evidence and generates comparisons with the benchmark tool's existing collector. It does not run models, rescore answers, upload results elsewhere, or deploy the website.

## Layout

```text
bundles/
  <snapshotId>/                 Complete finalized bundle, unchanged
    checksums.json
    manifest.json
    items.jsonl
    attempts.jsonl
    scores.jsonl
    sessions.jsonl
    runtime.jsonl
    RESULTS.md
    schemas/
    reports/<reportId>/
    ATTRIBUTION.md
    attribution/
    ...                        Assessment definitions/support and human records when present
selection.json                 Optional explicit choices between snapshots/assessments
benchmark-tool.json            Repository and exact collector/validator commit
scripts/results.mjs            Thin wrapper around the benchmark tool
tests/                         Repository integration checks
.github/workflows/validate.yml  Pull-request checks and builds
build/                         Generated collection and index; git ignored
.tools/benchmark/              Local pinned tool checkout; git ignored
```

Use the snapshot UUID as the directory name. The run UUID inside its manifest identifies the underlying execution. Several snapshots may describe that same run; they must never become extra independent model evaluations.

## Submit results

**Export one finalized bundle per run, then submit all the bundles from a campaign in one pull request.** Seven runs produce seven snapshot folders; they do not require seven pull requests. The `bundle` command takes one run directory, so the walkthrough below loops over all runs in a campaign.

```text
Benchmark checkout                           Results checkout
results/<campaign>/runs/<runId>/
              |
              | bundle (once per run)
              v
results/submissions/<batch>/<snapshotId>/ --> bundles/<snapshotId>/
                     checksums.json                  checksums.json
                     ...complete bundle              ...complete bundle
```

| Identifier | Meaning | Where to find it |
|---|---|---|
| Run ID | One benchmark execution for a model variant on a machine | `manifest.json` -> `runId` |
| Snapshot ID | One immutable export of that run, with its selected assessments and report | `checksums.json` -> `snapshotId` |

The bundler generates the snapshot UUID and `checksums.json`; neither needs to be created manually. A live `runs/<runId>/` folder normally has no `checksums.json`. Exporting the same run again creates a new snapshot UUID, even if nothing changed. Later assessments retain the original run ID but belong in a new snapshot.

**Before starting:** install Git and Node.js 24. Have the benchmark checkout, completed portable runs, and their original dataset notices available locally. A fresh benchmark clone may not contain the ignored data/notices from the machine that generated the runs. Keep the original runs and private recovery files on that machine. The commands below use PowerShell; run the numbered steps in the same session so their variables remain available. Replace the example paths and campaign name with your own.

The results repository must already have its scaffold on `main`. Maintainers creating it for the first time should complete [Enable GitHub](#enable-github-after-creating-the-repository) first. The current workflow requires the standalone benchmark repository and pinned commit to be publicly readable, as well as this results repository being public for public contributions. Private benchmark access would require a different authentication/workflow setup. [GitHub checkout access](https://github.com/actions/checkout#checkout-multiple-repos-private).

If you **already have finalized bundles**, do not export them again: set `$benchmarkRoot` to your benchmark checkout and `$exportRoot` to the folder containing the snapshot UUID directories, then start at [step 5](#5-clone-the-results-repository-and-create-a-branch). Step 6 verifies them after copying.

### 1. Locate and inspect the runs (benchmark checkout)

The example campaign has seven runs, but the procedure works for any nonempty set, including one run. Use the checkout that contains your `bench.mjs` and data notices; its path may differ from this example.

```powershell
$ErrorActionPreference = 'Stop'
$benchmarkRoot = 'C:\work\HilbertRaum_LLM_bench'
$campaign = 'qwen35-2b-xl-extended-nonthinking-budget-v2'
$runsRoot = Join-Path $benchmarkRoot "results/$campaign/runs"
$batchName = "$campaign-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
$exportRoot = Join-Path $benchmarkRoot "results/submissions/$batchName"
$benchCli = Join-Path $benchmarkRoot 'bench.mjs'

Set-Location -LiteralPath $benchmarkRoot
if (-not (Test-Path -LiteralPath $benchCli -PathType Leaf)) {
    throw 'Choose the benchmark checkout containing bench.mjs.'
}
$runDirs = @(Get-ChildItem -LiteralPath $runsRoot -Directory | Sort-Object Name)
if ($runDirs.Count -eq 0) { throw "No runs found in $runsRoot" }

$runDirs | ForEach-Object {
    $manifest = Get-Content -LiteralPath (Join-Path $_.FullName 'manifest.json') -Raw | ConvertFrom-Json
    [pscustomobject]@{ RunId = $manifest.runId; Model = $manifest.model.id; Cases = $manifest.workload.cases }
} | Format-Table -AutoSize
```

Check that the list is the campaign you intend to share. A parent `runs/` directory is not itself a bundle. Finish any desired automatic scoring or human-review imports before export. Generation failures are valid outcomes and must remain in the submission; pending human reviews can remain explicitly unavailable.

### 2. Choose the assessment for each run

Each run's `assessment-sets/*.json` files identify its automatic scoring revisions. Inspect them before choosing:

```powershell
$runDirs | ForEach-Object {
    $runId = $_.Name
    Get-ChildItem -LiteralPath (Join-Path $_.FullName 'assessment-sets') -Filter '*.json' -File | ForEach-Object {
        $set = Get-Content -LiteralPath $_.FullName -Raw | ConvertFrom-Json
        [pscustomobject]@{
            RunId = $runId
            Revision = $set.scorer.revision
            BenchMAX = [bool]$set.scorer.benchmax
            AssessmentSetId = $set.assessmentSetId
        }
    }
} | Format-List
```

For a campaign already scored with the offline BenchMAX checker, `benchmax-1` is the revision used in this example. If you intentionally want another revision, such as `initial`, set its name below. Selecting `initial` does not add BenchMAX scores. Choose the intended scoring protocol consistently, not the highest score.

```powershell
$assessmentRevision = 'benchmax-1'
$assessmentOverrides = @{}
$humanAssessmentByRun = @{}

# Optional exact choices when a run has multiple sets with the same revision:
# $assessmentOverrides['RUN_UUID'] = 'FULL_AUTOMATIC_ASSESSMENT_SET_ID'

# Optional human assessments already imported into the corresponding live run:
# $humanAssessmentByRun['RUN_UUID'] = 'FULL_HUMAN_ASSESSMENT_SET_ID'
```

The export code resolves the actual assessment ID separately for every run. Identical revision names do not guarantee identical assessment IDs. If a revision is missing or ambiguous, it stops and asks for an explicit choice. Human sets are selected separately; leaving the human map empty exports no selected human ratings.

### 3. Set the source and licence notices

Every dataset in a real run needs its applicable notices. The following map covers the eight datasets in the reviewed quick/extended profiles, using the benchmark's existing local data layout. It includes provenance records, dataset cards and licence texts. Paths in this map are relative to `$benchmarkRoot`; adjust them for your installation and add entries for any additional datasets. The run's dataset ID is `mgsm`, even though its source directory is `mgsm-rev2`.

```powershell
$noticeFiles = @{
    'belebele' = @(
        'data/belebele/SOURCE.json', 'data/belebele/LICENSE_CC-BY-SA4.0',
        'data/belebele/UPSTREAM_README.md', 'data/belebele/UPSTREAM_DATASET_CARD.md'
    )
    'global-mmlu-lite' = @(
        'data/global-mmlu-lite/SOURCE.json',
        'data/global-mmlu-lite/originals/LICENSE.Apache-2.0.txt',
        'data/global-mmlu-lite/originals/README.upstream.md'
    )
    'germanquad' = @(
        'data/germanquad/SOURCE.json', 'data/germanquad/UPSTREAM_DATASET_CARD.md',
        'data/benchmax/originals/LICENSE.CC-BY-4.0.txt'
    )
    'xnli' = @(
        'data/xnli/SOURCE.json', 'data/xnli/LICENSE',
        'data/xnli/README.release.md', 'data/xnli/README.upstream.md'
    )
    'paws-x' = @(
        'data/paws-x/SOURCE.json', 'data/paws-x/LICENSE',
        'data/paws-x/README.upstream.md', 'data/paws-x/README.paws.md',
        'data/paws-x/README.huggingface.md'
    )
    'mt-bench-x' = @(
        'data/mt-bench-x/SOURCE.json', 'data/mt-bench-x/LICENSE',
        'data/mt-bench-x/UPSTREAM_README.md'
    )
    'mgsm' = @(
        'data/mgsm-rev2/SOURCE.json', 'data/mgsm-rev2/ATTRIBUTION.md',
        'data/mgsm-rev2/README.md', 'data/belebele/LICENSE_CC-BY-SA4.0'
    )
    'benchmax' = @(
        'data/benchmax/SOURCE.json', 'data/benchmax/originals/LICENSE.CC-BY-4.0.txt',
        'data/benchmax/originals/README.upstream.md',
        'data/benchmax/author-checkers/LICENSE',
        'data/benchmax/author-checkers/LICENSE.Apache-2.0.txt',
        'data/benchmax/author-checkers/README.md'
    )
}
$selectionNotice = 'dataset_selected_items/ATTRIBUTION.md'
```

The CC BY 4.0 text stored with BenchMAX is also used for GermanQuAD; the CC BY-SA 4.0 text stored with Belebele is also used for MGSM-Rev2. Their own source records remain included. If those shared licence files are elsewhere on your machine, update the corresponding paths.

Consult the benchmark's `dataset_selected_items/ATTRIBUTION.md` and the original sources for your exact dataset revisions. Preserve all applicable terms, including XNLI's noncommercial restriction; this map does not relicense the data or establish licence completeness. Missing notices must be obtained from the source provenance, not replaced with empty placeholder files. For a custom profile, also replace `$selectionNotice` with its applicable attribution notice.

### 4. Export and verify all selected runs

First prepare the whole batch. This checks assessment choices and required notice files for every run before creating snapshots:

```powershell
$exportPlan = @(
    foreach ($run in $runDirs) {
        $sets = @(Get-ChildItem -LiteralPath (Join-Path $run.FullName 'assessment-sets') -Filter '*.json' -File | ForEach-Object {
            Get-Content -LiteralPath $_.FullName -Raw | ConvertFrom-Json
        })
        if ($assessmentOverrides.ContainsKey($run.Name)) {
            $chosen = @($sets | Where-Object { $_.assessmentSetId -eq $assessmentOverrides[$run.Name] })
        } else {
            $chosen = @($sets | Where-Object { $_.scorer.revision -eq $assessmentRevision })
        }
        if ($chosen.Count -ne 1) {
            throw "Run $($run.Name): choose one assessment using assessmentRevision or assessmentOverrides."
        }

        $datasets = @(Get-Content -LiteralPath (Join-Path $run.FullName 'items.jsonl') | ForEach-Object {
            ($_ | ConvertFrom-Json).dataset
        } | Sort-Object -Unique)
        $noticeArgs = @()
        foreach ($dataset in $datasets) {
            if (-not $noticeFiles.ContainsKey($dataset)) { throw "Missing notice mapping for $dataset" }
            foreach ($notice in (@($noticeFiles[$dataset]) + @($selectionNotice))) {
                $noticePath = Join-Path $benchmarkRoot $notice
                if (-not (Test-Path -LiteralPath $noticePath -PathType Leaf)) {
                    throw "Missing notice: $noticePath"
                }
                $noticeArgs += @('--notice', "$dataset=$noticePath")
            }
        }
        $humanArgs = @()
        if ($humanAssessmentByRun.ContainsKey($run.Name)) {
            $humanArgs = @('--human-assessment', $humanAssessmentByRun[$run.Name])
        }
        [pscustomobject]@{
            Run = $run
            Assessment = $chosen[0].assessmentSetId
            NoticeArgs = $noticeArgs
            HumanArgs = $humanArgs
        }
    }
)
```

Then export each run and verify its new snapshot. Native command failures stop the batch explicitly; PowerShell's `$ErrorActionPreference` alone does not reliably stop a failing `node` command.

```powershell
$exported = @()
foreach ($entry in $exportPlan) {
    $bundleArgs = @(
        'bundle', '--run', $entry.Run.FullName,
        '--output', $exportRoot, '--assessment', $entry.Assessment
    ) + $entry.NoticeArgs + $entry.HumanArgs

    $bundleJson = & node $benchCli @bundleArgs
    if ($LASTEXITCODE -ne 0) { throw "Bundle failed for run $($entry.Run.Name)" }
    $snapshot = ($bundleJson -join "`n") | ConvertFrom-Json

    & node $benchCli verify --run $snapshot.directory
    if ($LASTEXITCODE -ne 0) { throw "Verification failed for $($snapshot.snapshotId)" }
    $exported += [pscustomobject]@{
        RunId = $entry.Run.Name
        SnapshotId = $snapshot.snapshotId
        Directory = $snapshot.directory
    }
}
$exported | Format-List
Write-Host "Verified $($exported.Count) bundles in $exportRoot"
```

The output directory now contains one UUID folder per successful export. Each has `checksums.json`, the original evidence, one selected report, schemas, assessment support and attribution. Finalization may generate a report in the live run but does not rescore answers or replace generation evidence. It does not upload anything. See the tool's [bundling contract](https://github.com/HilbertraumAI/HilbertRaum_LLM_bench/blob/c9c69d38ce49aa862461ccd756f077a66f6d5e4f/docs/PORTABLE-RUNS.md#finalize-a-bundle).

If the batch stops, inspect the error. Successfully finalized folders remain usable; continue with only the remaining runs rather than exporting every run again. Incomplete generation is rejected by default. Use the tool's explicit `--allow-incomplete` option only when intentionally submitting an incomplete snapshot, and disclose that in the PR. The example does not enable it automatically.

### 5. Clone the results repository and create a branch

With write access, clone the shared results repository. Otherwise, fork it on GitHub first and set `$resultsRemote` to your fork's clone URL. Use a separate directory from the benchmark checkout. Set `$resultsRoot` to the desired clone location or an existing clean results checkout; the code skips cloning when it finds one.

```powershell
$ErrorActionPreference = 'Stop'
$resultsRemote = 'https://github.com/HilbertraumAI/Hilbertraum_LLM_Bench_Results.git'
$resultsRoot = 'C:\work\Hilbertraum_LLM_Bench_Results'
$branchName = 'results/qwen35-2b-extended-nonthinking'

if (-not (Test-Path -LiteralPath (Join-Path $resultsRoot '.git'))) {
    git clone $resultsRemote $resultsRoot
    if ($LASTEXITCODE -ne 0) { throw 'Results clone failed.' }
}
Set-Location -LiteralPath $resultsRoot
$workingChanges = git status --porcelain
if ($LASTEXITCODE -ne 0) { throw 'Could not inspect the results checkout.' }
if ($workingChanges) { throw 'Commit or otherwise preserve your existing work before starting a contribution branch.' }
git fetch https://github.com/HilbertraumAI/Hilbertraum_LLM_Bench_Results.git main
if ($LASTEXITCODE -ne 0) { throw 'Could not fetch the accepted main branch.' }
$baseCommit = (git rev-parse FETCH_HEAD).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Could not resolve the base commit.' }
git switch -c $branchName $baseCommit
if ($LASTEXITCODE -ne 0) { throw 'Could not create the contribution branch.' }
```

Choose a new branch name for each contribution. Fetching the shared repository's `main` starts the branch from accepted results even if your fork is behind. `origin` remains your writable repository or fork, which is where you will push. For an existing checkout, confirm its destination with `git remote -v`.

Now set up the validator/collector at the exact pin required by the results repository:

```powershell
$pin = Get-Content -LiteralPath .\benchmark-tool.json -Raw | ConvertFrom-Json
$toolRoot = Join-Path $resultsRoot '.tools/benchmark'
if (-not (Test-Path -LiteralPath $toolRoot)) {
    git clone --no-checkout "https://github.com/$($pin.repository).git" $toolRoot
    if ($LASTEXITCODE -ne 0) { throw 'Benchmark tool clone failed.' }
    git -C $toolRoot -c core.autocrlf=false checkout --detach $pin.ref
    if ($LASTEXITCODE -ne 0) { throw 'Pinned benchmark checkout failed.' }
}
```

`.tools/benchmark` is a dedicated, git-ignored dependency. Keep it clean. The local validation below rejects a wrong commit or modified checkout. If an existing checkout has the wrong pin, follow [Validate and build locally](#validate-and-build-locally); do not change `benchmark-tool.json` just to match your generation checkout. Older/newer generation versions can be accepted when the pinned validator supports their bundles.

### 6. Copy the snapshot folders and build the combined results

From the results checkout, copy only finalized UUID folders directly under `bundles/`. Do not add a campaign directory between `bundles/` and the snapshot UUIDs. The code refuses to overwrite an existing snapshot.

```powershell
Set-Location -LiteralPath $resultsRoot
$snapshotDirs = @(Get-ChildItem -LiteralPath $exportRoot -Directory | Sort-Object Name)
if ($snapshotDirs.Count -eq 0) { throw "No bundles found in $exportRoot" }
foreach ($snapshotDir in $snapshotDirs) {
    $checksumsPath = Join-Path $snapshotDir.FullName 'checksums.json'
    $checksums = Get-Content -LiteralPath $checksumsPath -Raw | ConvertFrom-Json
    if ($snapshotDir.Name -ne $checksums.snapshotId) { throw 'Snapshot folder name does not match checksums.json.' }
    $destination = Join-Path (Join-Path $resultsRoot 'bundles') $snapshotDir.Name
    if (Test-Path -LiteralPath $destination) { throw "Snapshot already exists: $destination" }
    Copy-Item -LiteralPath $snapshotDir.FullName -Destination $destination -Recurse
}

node --test tests/results.test.mjs
if ($LASTEXITCODE -ne 0) { throw 'Repository tests failed.' }
node scripts/results.mjs build --base-ref $baseCommit
if ($LASTEXITCODE -ne 0) { throw 'Bundle validation or collection build failed.' }
Get-Content -LiteralPath .\build\index.json
```

`build` verifies the copied bundles, checks accepted files against the fetched base commit, and generates/validates the combined collection. Use `collectionPath` in `build/index.json` to find `build/<collectionId>/report.html`. Inspect the models, selected assessments, coverage and warnings. Existing accepted results participate too. Seven new independent runs should add seven runs to the collection; multiple snapshots of one run must not add extra independent evaluations.

For an initial submission with one snapshot per new run, leave `selection.json` unchanged. If you add a new snapshot of an already submitted run, resolve differing evidence with an explicit choice as described in [Select snapshots and assessments](#select-snapshots-and-assessments).

### 7. Commit, push and open one pull request

Use Git to push the files. GitHub's browser uploader limits individual files to 25 MiB; a campaign's `scores.jsonl` can exceed that while remaining below the 100 MiB ordinary Git limit. Do not split checksummed files or introduce LFS pointers in this workflow. [GitHub file-size limits](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github).

```powershell
git status --short
git add -- bundles
if ($LASTEXITCODE -ne 0) { throw 'Could not stage bundles.' }
# If this submission deliberately changes snapshot choices, also run:
# git add -- selection.json
git diff --cached --stat
git diff --cached --name-status
```

Review the staged list. A new campaign should add complete snapshot folders. It should not modify or delete already accepted bundles. `.tools/`, `build/`, live `runs/`, models, machine configs and private logs do not belong in the commit. Do not format, trim, redact or normalize a finalized bundle's files; checksums cover their exact bytes. Review sensitive content before publication and address any issue in the source/export process before finalizing another snapshot.

```powershell
git commit -m 'Add Qwen3.5-2B extended non-thinking results'
if ($LASTEXITCODE -ne 0) { throw 'Commit failed.' }
git push -u origin $branchName
if ($LASTEXITCODE -ne 0) { throw 'Push failed.' }
```

Adapt the commit message to your campaign. Open a PR on `HilbertraumAI/Hilbertraum_LLM_Bench_Results`, with **base `main`** and your pushed branch as the comparison branch. For a fork, choose your fork as the head repository. One PR can include all seven runs. Suggested title: `Add Qwen3.5-2B extended non-thinking results for seven variants`.

Fill in the [PR template](.github/pull_request_template.md): model/checkpoint and quantisation, run and snapshot IDs, profile/thinking mode/generation settings, hardware/runtime, failed cases, pending generation or human reviews, and any `selection.json` changes. Include the local validation outcome. Keep failures visible; acceptance is not based on a high score.

### 8. Review the automatic checks and preview

GitHub runs **Validate bundles and collection** using the pinned tool, then uploads a `results-preview` artifact on success. Open the workflow run from the PR's checks, download the artifact, extract it, and follow `index.json` to the selected collection's `report.html`. A first-time fork contributor's workflow may need maintainer approval before it starts. [Fork workflow behavior](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflows-in-forked-repositories).

If validation fails, read the failed step's log, fix the contribution locally, rebuild and push to the same branch. Checks run again. A passing check does not merge the PR: a maintainer reviews the evidence and preview, then merges. The push to `main` triggers a fresh build and produces `accepted-results`. These artifacts expire after 14 days; website deployment is not configured here.

For later human reviews or rescoring, work on the original run, export a new snapshot, and add it through another PR. Preserve the accepted snapshot; explain any new selection in `selection.json`.

### Common submission problems

| Problem | What to do |
|---|---|
| No `checksums.json` under `runs/<runId>/` | This is a live run. Finalize it with `bundle`; look in the export directory for the snapshot. |
| Seven runs, unclear how many PRs | Export seven bundles and include all seven UUID directories in one campaign PR. |
| Missing or ambiguous assessment | Inspect `assessment-sets/`; choose the intended revision or an exact per-run override. Do not choose by score. |
| Missing notice file | Restore the applicable original source/licence notice or correct the map before exporting. |
| Generation incomplete | Finish/resume it, or explicitly finalize an incomplete snapshot and disclose that status. |
| Checksum mismatch after copying | Compare with the verified export. Transfer its original bytes; do not regenerate checksums around edited files. |
| A snapshot folder already exists | Reuse it if already copied; do not overwrite it. After a partial copy, check those files before retrying the remaining folders. |
| Multiple snapshots require selection | Keep the old evidence and choose explicitly in `selection.json`. See the selection guide below. |
| Wrong or dirty `.tools/benchmark` checkout | Use a clean dedicated checkout at the results repository's pin. Development happens elsewhere. |
| GitHub cannot fetch the benchmark tool | The configured repository and exact pinned commit must be publicly readable for this workflow. |
| Browser rejects a large result file | Use Git commit/push for files under the ordinary Git limit; preserve the bundle's exact files. |

Do not copy the live `runs/<runId>/` directory: a contribution must contain `checksums.json` and exactly one selected report. Do not include model weights, `local/`, machine configuration, or raw diagnostic logs. Preserve the source notices and their original terms; this repository does not relicense contributed dataset text or model answers under a blanket licence.

Generation failures are valid outcomes and are retained. Missing human reviews or unsupported scoring remain unavailable, not zero. Explicitly finalized runs with pending generation can be submitted for review, with their incomplete coverage shown. Synthetic/demo runs are rejected here. Acceptance must not depend on obtaining a high score.

## Validate and build locally

Requires Node.js 24 and Git. There are no npm dependencies and no install step.

From this repository's root, create a dedicated tool checkout at the commit in `benchmark-tool.json`:

```powershell
$pin = Get-Content -LiteralPath .\benchmark-tool.json -Raw | ConvertFrom-Json
if (-not (Test-Path -LiteralPath .tools/benchmark)) {
    git clone --no-checkout "https://github.com/$($pin.repository).git" .tools/benchmark
    if ($LASTEXITCODE -ne 0) { throw 'Benchmark tool clone failed.' }
    git -C .tools/benchmark -c core.autocrlf=false checkout --detach $pin.ref
    if ($LASTEXITCODE -ne 0) { throw 'Pinned benchmark checkout failed.' }
}
node scripts/results.mjs validate
if ($LASTEXITCODE -ne 0) { throw 'Validation failed.' }
node --test tests/results.test.mjs
if ($LASTEXITCODE -ne 0) { throw 'Tests failed.' }
node scripts/results.mjs build
if ($LASTEXITCODE -ne 0) { throw 'Build failed.' }
```

For an existing clean checkout after a reviewed pin update, fetch the required commit with `git -C .tools/benchmark fetch origin $pin.ref`, check that it succeeds, then run the pinned checkout command above and revalidate. Keep this tool checkout clean; make benchmark development changes in another checkout. The pin controls validation/aggregation, not which historical generation versions contributors may submit. Existing results retain their original code and schema provenance.

`--tool PATH` can select another dedicated checkout at that same clean pinned commit; `BENCHMARK_TOOL_DIR` is an equivalent environment variable. These commands also work before this results folder is initialized as a Git repository.

Validation checks bundle contents/checksums, identities, selected reports and assessments, snapshot history, duplicate responses, and collection compatibility. It builds a temporary collection to exercise the same aggregation used by the build, then removes only its own temporary files. It does not execute code or render HTML contained in a submitted bundle. It does not establish that a contributor actually ran a model or independently verify every scoring decision.

To additionally reject edits/deletions to already accepted bundle files, pass the full commit SHA of the base branch:

```powershell
node scripts/results.mjs validate --base-ref BASE_COMMIT_SHA
```

GitHub supplies this comparison base automatically for pull requests and ordinary pushes. Local validation without `--base-ref` checks the current evidence, but cannot detect a wholesale rewrite with freshly recomputed hashes. Preserve old snapshots and add a new snapshot for later assessments. If evidence needs withdrawal, agree on an explicit maintainer policy before changing history.

An empty repository validates successfully and builds an index with zero runs and a null collection; it does not invent placeholder benchmark scores.

## Select snapshots and assessments

The initial `selection.json` is:

```json
{ "version": 1, "runs": {} }
```

All real bundles participate. This file resolves ambiguity; it is not an allowlist or a way to hide a low score. Identical evidence from multiple snapshots is counted once. When snapshots of a run contain different generation or assessment evidence, choose explicitly:

```json
{
  "version": 1,
  "runs": {
    "11111111-1111-4111-8111-111111111111": {
      "snapshotId": "22222222-2222-4222-8222-222222222222",
      "assessmentSetId": "REPLACE_WITH_ACTUAL_64_CHARACTER_SET_HASH",
      "humanAssessmentSetId": null
    }
  }
}
```

Replace the illustrative IDs with actual values. All three fields under a run are optional. Omitted assessment choices use the snapshot's selections; explicit `humanAssessmentSetId: null` excludes human ratings from that comparison. Explain selection changes in the pull request. Never choose a snapshot merely because its score is higher.

The collector keeps incompatible benchmark profiles, generation settings, code, and scorer revisions in separate comparison groups. Each model variant/environment combination retains its own row. Its [full collection guide](https://github.com/HilbertraumAI/HilbertRaum_LLM_bench/blob/c9c69d38ce49aa862461ccd756f077a66f6d5e4f/docs/COLLECTING-RESULTS.md) defines the exact rules. Different machines can also affect answer quality; grouping does not prove a controlled hardware comparison.

## Generated data and the future website

`build/index.json` points to the selected generated `build/<collectionId>/` directory and records the tool pin, snapshot count, and selected run count. An empty build has `collectionId`/`collectionPath` set to null. `version: 1` refers to this small index format.

The collection includes `summary.json`, `runs.jsonl`, `observations.jsonl`, `metrics.jsonl`, CSV exports, a comparison `report.html`, and its own `COLLECTION.md`/`schema.json`. It recalculates aggregates from saved evidence without rerunning answer scoring. These collection files have their own format; they are not interchangeable with similarly named per-run files. Treat unknown measurements as unavailable and preserve comparison groups and source IDs.

Builds retain immutable collection directories and update the index to the current selection. Read the index rather than choosing a directory by name or modification time. Generated files are git ignored and can be rebuilt. Original bundles remain the durable evidence.

GitHub produces a downloadable `results-preview` artifact for pull requests and `accepted-results` for `main`. Artifacts expire after 14 days; they are review/build outputs, not permanent website hosting. The website should consume a successful build of an approved `main` revision and record that revision and collection ID. Deployment or a stable public data endpoint will be connected in the website project later. The current workflow has no deployment or repository-write permissions.

## Enable GitHub after creating the repository

1. Create the results repository with `main` as its default branch and push these files.
2. Ensure the benchmark-tool repository and pinned commit are publicly readable. Cross-repository public checkout then needs no private access token, including for fork contributions.
3. Enable GitHub Actions. Require the **Validate bundles and collection** check and at least one maintainer approval on `main`, dismiss stale approvals after changes, and block direct/force pushes. Enable first-time contributor workflow approval as appropriate.
4. Submit an initial finalized bundle through a pull request and inspect its generated preview before merging. In particular, review changes to scripts, workflows, the tool pin, and selection rules; passing a contributor-modified check is not approval.

Branch protection and access settings are configured on GitHub; merely adding these files does not enforce them. Updating `benchmark-tool.json` is a reviewed maintenance change: run tests and compare generated summaries before merging it.

The `.gitattributes` entry for `bundles/**` disables line-ending conversion because checksums cover exact bytes. Do not format or normalize bundle files. Keep individual committed files below GitHub's regular Git limit (100 MiB); do not split a finalized ledger or replace it with an LFS pointer without a separately designed storage workflow. Reassess storage if raw evidence becomes large; no database or LFS dependency is needed initially.

GitHub references: [workflow events and fork behavior](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#pull_request), [secondary repository checkout](https://github.com/actions/checkout#checkout-multiple-repos-side-by-side), [artifact retention](https://github.com/actions/upload-artifact#retention-period), and [file-size limits](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github).
