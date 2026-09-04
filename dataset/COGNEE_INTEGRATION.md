# Integrating SciFact-Memory with Cognee

This document defines the boundary between the dataset and the memory harness.
The dataset does not call Cognee directly. It supplies a deterministic learning
stream, evaluator-only gold data, lesson-validation tasks, and a frozen test.

For v2, the prediction fields `consulted_document_ids`,
`used_evidence_memory_ids`, and `used_lesson_families` must be derived from
Cognee retrieval and run provenance. Do not ask the model to declare which
memory it used and treat that declaration as ground truth. The legacy v1 field
`used_evidence_document_ids` has the same requirement.

## Responsibilities

The dataset owns:

- task order and split policy;
- the bounded scientific corpus;
- gold verdicts and evidence sentences;
- curriculum families and transfer relations;
- evaluation and leakage invariants;
- the prediction format and scorer.

The harness owns:

- research and evidence retrieval;
- evaluation after a learning prediction is frozen;
- failure diagnosis and lesson generation;
- Cognee persistence and retrieval;
- lesson validation and activation;
- memory snapshots and ablation runs.

## Suggested Cognee graph

```text
Claim ──has_run──> ResearchRun ──evaluated_by──> EvalResult
  │                    │                              │
  │                    ├──used──> EvidenceAssessment  └──diagnosed_as──> Failure
  │                    │               │                                    │
  │                    │               ├──about──> EvidencePassage           │
  │                    │               └──stance_for──> Claim                │
  │                    │                         │                            │
  │                    │                         └──from──> Paper              │
  │                    └──used──> Lesson                                      │
  │                                                                           │
  └──────────────────────────────────────────────────── Lesson <──proposes───┘
                                                          │
                                                validated_by
                                                          │
                                                  LessonValidation
```

Recommended persistent entities:

- `Paper`, keyed by dataset `paper_id`;
- `Claim`, keyed by `task_id` for benchmark runs;
- `EvidencePassage`, keyed by `paper_id + sentence_ids`;
- `EvidenceAssessment`, scoped to claim and run;
- `ResearchRun` and `EvalResult`;
- `Failure`;
- `Lesson`, with `PROPOSED`, `VALIDATING`, `ACTIVE`, `REJECTED`, or
  `DEPRECATED` status;
- `LessonValidation`;
- `StrategyVersion` or memory snapshot metadata.

Use deterministic Cognee identity fields for all stable dataset IDs. A plain
application field named `external_id` is not sufficient unless it is configured
as a Cognee identity/deduplication field.

## Retrieval boundaries

The researcher may retrieve:

- scientific evidence that passed scope checks;
- `ACTIVE` lessons applicable to the current task;
- provenance needed to explain why an item was used.

The researcher must not retrieve:

- oracle files or gold labels for the current held-out task;
- `PROPOSED` or `REJECTED` lessons;
- validation-task answers;
- frozen-test predictions from earlier checkpoints;
- evaluator-only canonical rules from `lesson-catalog.jsonl`;
- raw prior gold verdicts as if they were scientific evidence.

Store audit objects such as `EvalResult` and `Failure` in a node set that the
researcher cannot query directly. The reflector and observability UI may access
them; normal evidence recall should not.

## Learning loop

```ts
for (const task of learningTasks) {
  const memoryContext = await memory.recall(task.claim);
  const prediction = await researcher.solve(task, memoryContext);

  // Freeze the prediction before reading the oracle.
  const oracle = evaluatorOracleByTaskId.get(task.task_id);
  const evaluation = evaluate(prediction, oracle);
  await memory.persistRun(task, prediction, evaluation);

  if (!evaluation.passed) {
    const candidate = await reflector.proposeLesson({
      task,
      prediction,
      evaluation,
      oracle,
      memoryContext,
    });
    await memory.persistProposedLesson(candidate);
  }
}
```

The oracle may be given to the evaluator and reflector only after the
researcher's prediction is immutable.

## Lesson validation

For a proposed lesson family:

1. Locate matching targets in `lesson-validation/oracle.jsonl` and
   `episodes.jsonl`.
2. Clone the current memory snapshot.
3. Run the target set twice: current active strategy, then current strategy plus
   the candidate lesson.
4. Do not persist claims, evidence, answers, failures, or new lessons from these
   runs.
5. Persist only a `LessonValidation` record and the resulting lesson status.
6. Activate the lesson only if target quality improves and guardrail quality
   stays within the configured regression threshold.

The dataset encodes this policy as:

```json
{
  "memory_write_allowed": false,
  "allowed_memory_writes": "lesson-validation-only",
  "reflection_allowed": false
}
```

## Frozen before/after evaluation

Create at least two runs:

```text
A0 clean/stateless
A3 trained Cognee memory
```

Recommended third run:

```text
A2 trained memory with Evidence Memory disabled and ACTIVE lessons enabled
```

For every condition, restore a fixed snapshot before the first frozen task and
disable all writes. Keep model, temperature, tools, prompts, corpus, context
budget, and task order unchanged. Write predictions outside Cognee until scoring
is complete.

Run:

```bash
bun run dataset:score:v2 \
  --predictions artifacts/trained.jsonl \
  --baseline artifacts/clean.jsonl
```

The strongest evidence of learning is improvement on `experience_reuse` tasks,
where papers are disjoint from learning, without increased errors on
`memory_trap` tasks. Evidence-reuse improvement alone demonstrates retrieval,
not procedural learning.

## Version 2 correction and reset controls

Each v2 public task includes `memory_control`. For ordinary tasks its operation
is `none`. A `correct` or `reset` target must be evaluated from a clone of the
same trained snapshot used by A3:

1. restore a fresh clone of trained snapshot `S1`;
2. apply `instruction_ru` to exactly the listed scope and target IDs;
3. persist the correction or deletion and record its audit event;
4. disable writes and reflection;
5. run that one frozen target and capture retrieval provenance;
6. discard the clone after scoring.

`correct` replaces the scoped claim–evidence relation without erasing unrelated
lessons. `reset` removes the scoped topic/evidence state while leaving unrelated
memory intact. The target's `forbidden_evidence_document_ids` must not appear in
retrieval-derived consulted or cited documents after the operation. Running all
operations cumulatively in one mutable snapshot is invalid because earlier
controls would change later conditions.

The v2 answer contract also requires a Russian explanation. For `UNKNOWN`, the
harness must preserve a non-empty uncertainty statement and an empty evidence
list; a remembered topically related paper is not sufficient evidence.

## Minimum hackathon run

1. Validate the primary release with `bun run dataset:validate:v2`.
2. Create an empty Cognee snapshot `S0` and run the 60 frozen tasks with writes
   disabled; save these predictions outside Cognee as `A0`.
3. Restore `S0`, process the 60 learning tasks in sequence, and propose lessons
   only after each answer is frozen and evaluated.
4. Validate candidate lessons on the 24 lesson-validation tasks using disposable
   snapshot clones; persist only validation results and status transitions.
5. Save the resulting trained snapshot `S1`, stop both SciPi and Cognee, then
   restart them and restore `S1` without replaying the learning stream.
6. Run the same 60 frozen tasks with writes disabled and save predictions as
   `A3`. Optionally run `A2` with evidence memory disabled and ACTIVE lessons
   enabled.
7. Score `A3` against `A0` and inspect experience transfer, memory traps, and
   memory-induced regressions separately.

For each condition, record at least the dataset manifest SHA-256, model and
temperature, prompt hash, tool configuration hash, task order, Cognee snapshot
identifier, enabled memory layers, and whether writes were disabled. Without
this run metadata, a before/after delta is difficult to attribute to memory.

## Durability demonstration

After the learning stream:

1. record the Cognee dataset/snapshot identifier;
2. stop the Pi and memory processes completely;
3. start them without replaying learning tasks;
4. show the restored ACTIVE lessons;
5. run the frozen test or a selected transfer task;
6. use the saved run provenance to show which lesson affected the answer.

This demonstrates persistent write → restart → read → changed behavior rather
than ordinary in-context learning.
