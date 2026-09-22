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
docs/                          Windows and Linux submission walkthroughs
.github/workflows/validate.yml  Pull-request checks and builds
build/                         Generated collection and index; git ignored
.tools/benchmark/              Local pinned tool checkout; git ignored
```

Use the snapshot UUID as the directory name. The run UUID inside its manifest identifies the underlying execution. Several snapshots may describe that same run; they must never become extra independent model evaluations.

## Submit results

Choose the walkthrough for your shell: **[Linux / Bash](docs/SUBMITTING-RESULTS-LINUX.md)** or **[Windows / PowerShell](docs/SUBMITTING-RESULTS-WINDOWS.md)**. Both cover one run or a complete campaign, from export through pull-request review. The shared concepts below apply to both.

**Export one finalized bundle per run, then submit all the bundles from a campaign in one pull request.** Seven runs produce seven snapshot folders; they do not require seven pull requests. The `bundle` command takes one run directory, so both walkthroughs loop over all runs in a campaign.

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

Follow the instructions for your shell to set up the pinned tool, validate bundles and build the collection:

- **Windows / PowerShell:** [local setup, validation and build](docs/SUBMITTING-RESULTS-WINDOWS.md#validate-and-build-locally).
- **Linux / Bash:** [pinned-tool setup](docs/SUBMITTING-RESULTS-LINUX.md#5-clone-the-results-repository-and-create-a-branch) and [validation/build commands](docs/SUBMITTING-RESULTS-LINUX.md#6-copy-the-snapshot-folders-and-build-the-combined-results).

Keep the dedicated tool checkout clean and at the commit in `benchmark-tool.json`; make benchmark development changes in another checkout. The pin controls validation/aggregation, not which historical generation versions contributors may submit. Existing results retain their original code and schema provenance.

`--tool PATH` can select another dedicated checkout at that same clean pinned commit; `BENCHMARK_TOOL_DIR` is an equivalent environment variable. These commands also work before this results folder is initialized as a Git repository.

Validation checks bundle contents/checksums, identities, selected reports and assessments, snapshot history, duplicate responses, and collection compatibility. It builds a temporary collection to exercise the same aggregation used by the build, then removes only its own temporary files. It does not execute code or render HTML contained in a submitted bundle. It does not establish that a contributor actually ran a model or independently verify every scoring decision.

To additionally reject edits/deletions to already accepted bundle files, pass the full commit SHA of the base branch:

```text
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
