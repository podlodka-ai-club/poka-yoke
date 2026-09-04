# SciFact-Memory

`SciFact-Memory` is a learning curriculum and evaluation dataset for testing
whether a scientific research agent changes its behavior through persistent memory. SciFact supplies
the scientific claims, abstracts, verdict annotations, and evidence rationales;
this repository supplies the memory protocol, held-out episodes, leakage rules,
and scorer.

The dataset does **not** train model weights or Cognee itself. A "learning" task
means that the agent may evaluate its answer, reflect on a failure, and persist
a procedural lesson in Cognee for later tasks. Cognee is the memory engine;
SciFact is the source corpus. See the
[Cognee integration contract](COGNEE_INTEGRATION.md) for the ownership boundary
and suggested graph.

## Which release to use

`scifact-memory-v2` is the primary hackathon release. It models the product's
student and research-staff users, accepts English and Russian claims, requires a
grounded Russian answer, and contains explicit correction/reset controls. Its 144
tasks are split into 60 learning, 24 lesson-validation, and 60 frozen-test tasks.
The frozen test contains 30 procedural-transfer tasks over papers disjoint from
learning, 14 evidence-reuse tasks, 10 memory traps, and 6 cold controls.

`scifact-memory-v1` is retained as a public calibration anchor. Its 36-task frozen
test was useful for validating the runner, but verdict-only A0 accuracy was too
high to be the primary evidence of learning. No v1 source claim is reused in v2.

Version 2 is not made difficult by obscure trivia. It is difficult at the product
boundary: the agent must find an exact abstract sentence, distinguish direct
evidence from topical similarity, observe population/numeric/causal scope, answer
in Russian, and remain calibrated when the bounded corpus is insufficient.
Ambiguous frozen rationales found during manual review are excluded in the
versioned authoring curation file.

Build and validate the recommended release:

```bash
bun run dataset:build:v2
bun run dataset:validate:v2
```

Score a v2 run:

```bash
bun run dataset:score:v2 --predictions artifacts/trained-v2.jsonl \
  --baseline artifacts/clean-v2.jsonl
```

The recorded DeepSeek V4 Flash clean-memory calibration is in the
[`v2 A0 report`](../artifacts/scifact-memory-v2/deepseek-v4-flash-commandcode-opencode-a0-2026-09-04/REPORT.md):
51.7% primary grounded accuracy versus 91.7% verdict accuracy. This gap is why
the v2 protocol does not use a bare verdict as proof of task completion.

The primary metric is `grounded_task_accuracy`, not verdict accuracy. A labelled
task passes only with the correct verdict, correct stance, a complete annotated
gold rationale, and no unannotated evidence sentence. An `UNKNOWN` task passes
only with no cited evidence and an explicit Russian uncertainty statement.
`verdict_with_any_gold_evidence_accuracy` is retained as a softer diagnostic so
the report exposes the difference instead of hiding citation contamination.
Verdict accuracy, evidence F1, false certainty, unsupported verdicts, language
compliance, traps, correction/reset, and product slices remain diagnostics.

The v2 format is specified by
[`schema/scifact-memory-v2.schema.json`](schema/scifact-memory-v2.schema.json) and
[`schema/prediction-output-v2.schema.json`](schema/prediction-output-v2.schema.json).
Release-specific protocol and acceptance gates are in
[`scifact-memory-v2/README.md`](scifact-memory-v2/README.md).

## Why SciFact alone is not enough

An ordinary SciFact run measures claim verification and evidence retrieval. It
does not distinguish remembering a paper from learning a reusable research
procedure. SciFact-Memory adds three controlled held-out cases:

- `experience_reuse`: a new claim over disjoint papers shares only a procedural
  challenge with a learning task;
- `evidence_reuse`: a relevant evidence document was encountered during
  learning and may be reused;
- `memory_trap`: a previously encountered document is related to the new claim
  but SciFact contains no supporting or contradicting rationale for that claim;
  reusing it as evidence is forbidden.

Learning tasks are additionally marked `cold`, `evidence_reuse`, or
`memory_trap` based on what appeared earlier in the deterministic stream.

## Version 1 release size

Version 1 intentionally contains 120 tasks and a 512-document bounded corpus:

| Split | Tasks | Agent may read memory | Agent may write/reflect |
|---|---:|---:|---:|
| `learning` | 60 | yes | yes |
| `lesson-validation` | 24 | yes | lesson status only |
| `frozen-test` | 36 | yes | no |

This is large enough for approximately label-balanced before/after evaluation while keeping
the LLM cost and manual audit surface appropriate for a hackathon. Scaling the
dataset should happen only after the first release has been manually reviewed
and run end to end.

The 36 frozen tasks contain:

- 24 experience-transfer tasks with no paper overlap with learning;
- 6 evidence-reuse tasks with an explicitly shared gold document;
- 6 memory traps with an explicitly forbidden recalled document.

The official unlabeled SciFact test split is not used. Learning and lesson
validation come from the labeled SciFact train split; frozen tasks come from the
labeled SciFact dev split.

## Layout

```text
dataset/scifact-memory-v1/
├── corpus.jsonl
├── learning/
│   ├── tasks.jsonl
│   └── oracle.jsonl
├── lesson-validation/
│   ├── tasks.jsonl
│   └── oracle.jsonl
├── frozen-test/
│   ├── tasks.jsonl
│   └── oracle.jsonl
├── episodes.jsonl
├── lesson-catalog.jsonl
├── CURRICULUM.md
├── manifest.json
└── stats.json
```

Integration documentation lives next to the release in
[`COGNEE_INTEGRATION.md`](COGNEE_INTEGRATION.md). Third-party attribution and
component licenses are recorded in
[`THIRD_PARTY_LICENSES.md`](THIRD_PARTY_LICENSES.md).

`tasks.jsonl` is safe to expose to the researcher. It contains only the claim,
the bounded corpus identifier, and sequencing fields. `oracle.jsonl` belongs to
the evaluation harness and must never be inserted into the researcher context
or memory.

`lesson-catalog.jsonl` defines the procedural competencies measured by the
curriculum. It is also evaluator-only: the reflector must derive a lesson from
an observed failure before the evaluator may match it to a catalog family.
`CURRICULUM.md` is a generated evaluator-only table for reviewing every
teach/target relation.

Language-neutral JSON Schema definitions for corpus records, tasks, oracles,
episodes, lesson catalog entries, and predictions are available in
[`schema/scifact-memory.schema.json`](schema/scifact-memory.schema.json).

## Runtime protocol

### Learning

For every task in order:

1. Give only the public task and corpus access to the researcher.
2. Freeze its prediction.
3. Give the corresponding oracle to the evaluator, not the researcher.
4. If the result is wrong, allow the reflector to inspect the prediction and
   oracle and propose a lesson.
5. Persist the run, evaluation, and proposed lesson. Only a separately validated
   lesson may become active.

### Lesson validation

Run each candidate lesson against its matching validation tasks and guardrails
using an isolated memory snapshot. Task answers and gold data must not produce
new lessons or enter persistent evidence memory. The validation controller may
persist only the resulting `LessonValidation` record and lesson status change;
the oracle encodes this as `allowed_memory_writes: lesson-validation-only`.

### Frozen test

Run the same frozen tasks before learning and after learning. Both runs must use
the same model, temperature, tools, prompt budget, corpus, and task order. The
only intended difference is the persistent memory snapshot. Frozen outputs are
scored outside the agent and are never reflected upon.

For stronger causal evidence, run an additional ablation with experience memory
disabled. An improvement that disappears when lessons are disabled is more
convincing than a simple before/after comparison.

## Failure families

Every oracle assigns one coarse procedural family:

- `numeric_precision`;
- `population_scope`;
- `causal_language`;
- `directionality`;
- `negation`;
- `evidence_sufficiency`.

These tags are deterministic curriculum-routing metadata, not additional
scientific gold labels. The canonical competency descriptions live in
`lesson-catalog.jsonl`; matching a free-form lesson to a family is an evaluator
operation and must not reveal the canonical rule to the researcher.

## Building

The release is generated deterministically from the official SciFact archive.
The archive URL, repository commit, and SHA-256 are pinned in the build script
and release manifest.

```bash
bun run dataset:build
bun run dataset:validate
```

For an already extracted SciFact archive:

```bash
bun run scripts/dataset/build.ts --source /path/to/scifact/data
```

Do not edit generated release artifacts by hand. Change the builder, create a
new version, and validate it.

## Prediction format and scoring

One prediction per line:

```json
{"task_id":"task-2d851b35e42a","predicted_verdict":"SUPPORT","predicted_evidence":[{"paper_id":"scifact:456","sentence_ids":[2]}],"used_evidence_document_ids":["scifact:456"],"used_lesson_families":["population_scope"]}
```

The harness must populate `used_evidence_document_ids` and
`used_lesson_families` from actual retrieval/run traces, not from the model's
self-report. They are observability fields; causal evidence still comes from
the frozen before/after comparison and memory ablations.

Score a trained-memory run:

```bash
bun run dataset:score --predictions artifacts/trained.jsonl
```

Compare it with a clean-memory baseline:

```bash
bun run dataset:score \
  --predictions artifacts/trained.jsonl \
  --baseline artifacts/clean.jsonl
```

The scorer reports verdict macro-F1, evidence precision/recall/F1, UNKNOWN
accuracy, lesson retrieval, forbidden evidence use, case/family slices, delta
against baseline, and memory-induced regression.

Run a clean-memory A0 baseline through an isolated Codex CLI process per task:

```bash
bun run dataset:a0 \
  --model gpt-5.6-luna \
  --reasoning-effort medium \
  --concurrency 4 \
  --output artifacts/scifact-memory-v1/<run-name>
```

The recorded GPT-5.6 Luna run and its limitations are documented in the
[A0 report](../artifacts/scifact-memory-v1/gpt-5.6-luna-a0-2026-09-04/REPORT.md).

The same frozen A0 evaluation can be run through OpenCode and CommandCode:

```bash
bun run dataset:a0:opencode \
  --model commandcode/deepseek/deepseek-v4-flash \
  --concurrency 6 \
  --output artifacts/scifact-memory-v1/<new-a0-run>
```

The recorded DeepSeek V4 Flash run and its direct comparison to Luna are in the
[OpenCode A0 report](../artifacts/scifact-memory-v1/deepseek-v4-flash-commandcode-opencode-a0-2026-09-04/REPORT.md).

## Scientific interpretation

SciFact `SUPPORT` maps to `SUPPORT`, `CONTRADICT` maps to `REFUTE`, and an empty
evidence map maps to `UNKNOWN`. Missing evidence means insufficient evidence in
the bounded corpus; it must not be interpreted as proof that the claim is false.

The dataset provides evidence at abstract-sentence granularity. Its verdicts
must not be presented as medical advice or as conclusions about the complete
scientific literature.

## Attribution

SciFact is described in:

> David Wadden et al. Fact or Fiction: Verifying Scientific Claims. EMNLP 2020.

- Repository: <https://github.com/allenai/scifact>
- Data format: <https://github.com/allenai/scifact/blob/master/doc/data.md>
- Paper: <https://aclanthology.org/2020.emnlp-main.609/>

SciFact-Memory is a derived evaluation protocol. Source IDs are preserved in
every oracle and corpus record so results remain traceable to SciFact.
