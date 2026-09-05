# GPT-5.6 Luna A0 baseline

This is a clean-memory baseline over all 36 frozen SciFact-Memory v1 tasks. It
establishes whether the model has measurable headroom before Cognee learning.
It is not an A3 memory result and does not by itself prove that the memory
implementation works.

## Controlled condition

- Model: `gpt-5.6-luna`
- Reasoning effort: `medium`
- Runner: Codex CLI `0.153.0`
- Condition: `A0-clean-no-memory`
- One fresh ephemeral process per task
- Read-only sandbox
- Each task workspace contained only `current_task.json` and `corpus.jsonl`
- No user configuration, project rules, previous-task context, or Cognee memory
- Trace audit confirms that no lesson catalog or oracle file was accessed
- All 36 tasks completed on the first attempt
- Run duration: 326 seconds

The model identifier and supported reasoning levels are documented on the
[official GPT-5.6 Luna model page](https://developers.openai.com/api/docs/models/gpt-5.6-luna).

## Result

| Slice | Tasks | Correct | Errors | Accuracy |
|---|---:|---:|---:|---:|
| Overall | 36 | 32 | 4 | 88.89% |
| `experience_reuse` | 24 | 22 | 2 | 91.67% |
| `evidence_reuse` | 6 | 5 | 1 | 83.33% |
| `memory_trap` | 6 | 5 | 1 | 83.33% |

Additional metrics:

- verdict macro-F1: 0.8907;
- evidence F1: 0.4948;
- UNKNOWN accuracy: 0.7857;
- forbidden-document use on memory traps: 3/6.

The A0 headroom is therefore 4/36 verdicts overall and 2/24 on the strongest
procedural-transfer slice. An A3 run can improve by at most 11.11 percentage
points overall on this exact frozen set, with 8.33 points of available headroom
on `experience_reuse`.

## Incorrect verdicts

| Task | Case | Family | Gold | A0 | Claim |
|---|---|---|---|---|---|
| `task-7010c3491b46` | `experience_reuse` | `directionality` | UNKNOWN | SUPPORT | Pleiotropic coupling of GLP-1R to intracellular effectors promotes distinct profiles of cellular signaling. |
| `task-73af791d6de8` | `experience_reuse` | `negation` | UNKNOWN | REFUTE | Mice without IFN-γ or its receptor are resistant to EAM induced with α-MyHC/CFA. |
| `task-5c3786620aa4` | `evidence_reuse` | `evidence_sufficiency` | SUPPORT | UNKNOWN | Rapid phosphotransfer rates govern fidelity in two component systems. |
| `task-0f004fb50a14` | `memory_trap` | `population_scope` | UNKNOWN | SUPPORT | In mice, P. chabaudi parasites are able to proliferate faster early in infection when inoculated at lower numbers than when inoculated at high numbers. |

SciFact UNKNOWN is a bounded-corpus annotation, not a universal scientific
falsehood. In particular, the two experience-transfer errors are strict
entailment decisions and should be presented as disagreement with the official
SciFact gold rather than incontrovertible scientific mistakes.

## Leakage audit

During the run, 36 raw traces containing 246 shell-search commands were audited.
None referenced `oracle`, the repository path, lesson validation, or
evaluator-only files, and no task needed a second attempt. Raw traces and stderr
logs are intentionally excluded from Git; structured outputs are retained in
`predictions.jsonl`.

## Integrity

```text
dataset manifest  d740d5b58fb528132c86ecdaa4625d695342d4f9ae7a446069aeabd71e386097
runner            0cbf38f37699a4b92ca326431078a98f597d59da62d8e20e959f72b81d954dd2
output schema     8d63fe878a10c3fa6e799d85340677216579622296920fe17cad44c94c4b352a
predictions       8077a89e7a04691c8fd25fe57243b73040ccae79600a3901ba4c6f530fc6429f
score             81d34a7b5884623b4972ed6ea13b74f26bb55681476c100031e9656e7215febd
metadata          0ffaecb66c226fc910f4c49b55fe6cfff25491aa77ca7e4d2364182b03c68a3a
```

## Reproduction and next comparison

```bash
bun run dataset:a0 \
  --model gpt-5.6-luna \
  --reasoning-effort medium \
  --concurrency 4 \
  --output artifacts/scifact-memory-v1/<new-a0-run>

bun run dataset:score \
  --predictions artifacts/scifact-memory-v1/<a3-run>/predictions.jsonl \
  --baseline artifacts/scifact-memory-v1/gpt-5.6-luna-a0-2026-09-04/predictions.jsonl
```

For the hackathon claim, the next required evidence is A3 after Cognee learning
and restart, plus the A2 lessons-disabled ablation. Improvement on the two A0
`experience_reuse` failures is the most direct demonstration of procedural
learning; fixing only the evidence-reuse case would demonstrate retrieval.
