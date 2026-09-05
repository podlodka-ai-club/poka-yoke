# SciFact-Memory v2

This is the primary hackathon curriculum for demonstrating that SciPi changes
scientific-research behavior through persistent memory, rather than merely
retrieving a previously seen fact.

## Product alignment

The intended users are students and research staff checking one scientific claim
or a small batch through Pi or Telegram. Claims may be English or Russian; the
answer, explanation, and uncertainty statement must be Russian. Evidence remains
traceable to an exact SciFact abstract sentence. Russian claims and localized
passages are repository-maintained translations of English SciFact material, not
native-language publications or medical advice.

The requirement-by-requirement evidence and remaining harness obligations are
listed in [`PRD_ALIGNMENT.md`](PRD_ALIGNMENT.md).

The release has 144 tasks and a bounded corpus of 1024 abstracts:

| Split | Tasks | Purpose | Writes |
|---|---:|---|---|
| `learning` | 60 | evaluated task → reflection → candidate lesson | research runs and lessons |
| `lesson-validation` | 24 | test lesson transfer in disposable snapshots | validation status only |
| `frozen-test` | 60 | identical A0/A3 before-after measurement | none |

Frozen composition:

- 30 `experience_reuse` targets, exactly five per procedural family, with papers
  disjoint from learning;
- 14 `evidence_reuse` targets, where recall of a previously seen paper can help;
- 10 `memory_trap` targets, including three `correct` and three `reset` controls;
- 6 `cold` controls that detect unrelated drift.

## What constitutes learning

The headline comparison is A3 (trained persistent memory after process restart)
against A0 (clean memory). Improvement must occur on `experience_reuse`, where
the target papers were never seen during learning. Evidence-reuse improvement
alone demonstrates retrieval, not procedural learning. Memory traps and cold
controls bound harmful transfer.

Recommended conditions:

- A0: clean memory;
- A1: trained evidence memory, procedural lessons disabled;
- A2: active procedural lessons, evidence memory disabled;
- A3: complete trained snapshot restored after restart.
- A4 (optional): full memory with lesson-validation gate bypassed, to measure
  whether unvalidated lessons cause more regressions.

All conditions use the same model, prompt, tools, corpus, order, budget, and
temperature. Frozen writes and reflection are disabled.

To show evolution rather than only two endpoints, save snapshots after 0, 20,
40, and 60 learning tasks and rerun the identical frozen set with writes off.
This yields the blueprint's learning curve while keeping the stateless A0 line
fixed. Never reflect on checkpoint outputs.

## Scoring

`grounded_task_accuracy` is primary. Correct verdict alone is insufficient:

- `SUPPORT`/`REFUTE`: correct verdict, matching `SUPPORTS`/`REFUTES` stance, at
  least one complete annotated rationale, and no unannotated evidence sentence;
- `UNKNOWN`: correct verdict, no evidence citation, and a non-empty Russian
  uncertainty statement.

Report the softer `verdict_with_any_gold_evidence_accuracy` alongside verdict
macro-F1, evidence F1, citation contamination, false-certainty and unsupported-
verdict rates, Russian response compliance, memory traps, operations, language,
role, channel, and procedural-family slices. With `--baseline`, the scorer also
reports per-slice deltas, `experience_transfer_success_rate`,
`evidence_reuse_success_rate`, and memory-induced regressions. Retrieval
provenance fields must come from harness traces in memory-enabled runs; model
self-report is not causal proof.
SciFact annotations do not necessarily enumerate every scientifically valid
adjacent sentence. Therefore, inspect strict failures that have a correct verdict
and a high soft score as citation-review cases rather than automatically treating
them as scientific reasoning errors.

Acceptance targets are intentionally ranges rather than a score to optimize the
frozen test against:

| Check | Expected interpretation |
|---|---|
| A0 verdict accuracy | diagnostic only; report saturation instead of using it as task completion |
| A0 grounded task accuracy | roughly 45–65% leaves measurable improvement room |
| A3 overall grounded delta | at least +10 percentage points over A0 |
| A3 experience-reuse delta | at least +10 points, with gains in at least three families |
| A3 memory-trap quality | grounded loss no worse than 10 points; forbidden citation use no higher than A0 |
| Memory-induced regressions | below 10% of tasks that were grounded-correct in A0 |
| Restart durability | A3 uses a restored snapshot without replaying learning |

These ranges are diagnostics, not permission to alter frozen items after seeing
A0. The v2 frozen set was manually reviewed and frozen before its first complete
model run. `FROZEN_REVIEW.md`, oracles, curriculum, and lesson catalog are
evaluator-only.

The frozen DeepSeek V4 Flash A0 run achieved 51.7% primary grounded accuracy,
60.0% on paper-disjoint experience reuse, and 91.7% verdict accuracy. See the
[`A0 report`](../../artifacts/scifact-memory-v2/deepseek-v4-flash-commandcode-opencode-a0-2026-09-04/REPORT.md)
for the strict-failure audit and reproducibility hashes.

## Commands

```bash
bun run dataset:validate:v2
bun run dataset:a0:opencode:v2 -- \
  --model commandcode/deepseek/deepseek-v4-flash \
  --concurrency 6 \
  --output artifacts/scifact-memory-v2/<run-name>
bun run dataset:score:v2 --predictions artifacts/scifact-memory-v2/<run-name>/predictions.jsonl
bun run dataset:a0:metrics:v2 artifacts/scifact-memory-v2/<run-name>
bun run dataset:a0:report:v2 artifacts/scifact-memory-v2/<run-name>
```

Do not expose `oracle.jsonl`, `episodes.jsonl`, `lesson-catalog.jsonl`,
`CURRICULUM.md`, or `FROZEN_REVIEW.md` to the research agent. A trap document
may be retrieved and inspected; it counts as forbidden use only if it is cited
as answer evidence after the agent should have rejected or invalidated it.
