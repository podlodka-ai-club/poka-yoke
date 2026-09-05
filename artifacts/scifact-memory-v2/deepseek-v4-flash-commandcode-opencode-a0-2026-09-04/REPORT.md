# DeepSeek V4 Flash A0 — SciFact-Memory v2

Run date: 2026-09-04<br>
Model: `commandcode/deepseek/deepseek-v4-flash` via OpenCode<br>
Condition: clean memory, fresh isolated session per task, network denied, oracle hidden<br>
Frozen tasks: 60

## Result

| Metric | A0 |
|---|---:|
| **Grounded task accuracy (primary)** | **51.7%** |
| Verdict with any gold evidence (soft) | 90.0% |
| Verdict accuracy | 91.7% |
| Verdict macro-F1 | 91.8% |
| Evidence F1 | 65.6% |
| Citation contamination | 70.0% |
| False certainty on UNKNOWN | 17.4% |
| Russian response compliance | 100.0% |

The primary A0 result falls inside the predeclared 45–65% calibration range.
Verdict accuracy is above the diagnostic 65–80% range. This means the three-way label remains easy for this model, while a fully supported, uncontaminated answer leaves room for memory-driven improvement. The soft and strict grounded metrics are both shown so stricter citation scoring cannot be mistaken for verdict failure.

## By memory case

| Case | Tasks | Verdict | Grounded |
|---|---:|---:|---:|
| cold | 6 | 100.0% | 33.3% |
| experience_reuse | 30 | 86.7% | 60.0% |
| evidence_reuse | 14 | 100.0% | 14.3% |
| memory_trap | 10 | 90.0% | 90.0% |

## By procedural family

| Family | Tasks | Verdict | Grounded |
|---|---:|---:|---:|
| evidence_sufficiency | 14 | 85.7% | 57.1% |
| population_scope | 8 | 100.0% | 25.0% |
| negation | 7 | 100.0% | 57.1% |
| causal_language | 7 | 85.7% | 42.9% |
| numeric_precision | 6 | 100.0% | 100.0% |
| directionality | 18 | 88.9% | 44.4% |

## By claim language

| Language | Tasks | Verdict | Grounded |
|---|---:|---:|---:|
| en | 40 | 92.5% | 50.0% |
| ru | 20 | 90.0% | 55.0% |

## Strict-failure audit

- unannotated citation: 24
- wrong verdict: 5

| Task | Case | Family | Language | Gold | Predicted | Reason |
|---|---|---|---|---|---|---|
| task-2ad0c40f5b40 | cold | evidence_sufficiency | en | SUPPORT | SUPPORT | unannotated citation |
| task-d1d6a9dfde77 | evidence_reuse | population_scope | en | SUPPORT | SUPPORT | unannotated citation |
| task-0fd20fba29a0 | experience_reuse | evidence_sufficiency | ru | REFUTE | UNKNOWN | wrong verdict |
| task-948a14d724af | experience_reuse | population_scope | en | SUPPORT | SUPPORT | unannotated citation |
| task-3e0dfcbb2419 | evidence_reuse | directionality | en | SUPPORT | SUPPORT | unannotated citation |
| task-fca0428e0107 | experience_reuse | population_scope | en | REFUTE | REFUTE | unannotated citation |
| task-d2f822a137b3 | evidence_reuse | evidence_sufficiency | ru | REFUTE | REFUTE | unannotated citation |
| task-95b5ce6c9f88 | evidence_reuse | directionality | en | REFUTE | REFUTE | unannotated citation |
| task-5f45ba56c945 | evidence_reuse | negation | en | REFUTE | REFUTE | unannotated citation |
| task-4fe9601c2965 | cold | directionality | en | SUPPORT | SUPPORT | unannotated citation |
| task-c2074b6b82ce | evidence_reuse | directionality | en | REFUTE | REFUTE | unannotated citation |
| task-bbb4872abfcd | evidence_reuse | causal_language | en | REFUTE | REFUTE | unannotated citation |
| task-2b6f70a19051 | evidence_reuse | causal_language | ru | SUPPORT | SUPPORT | unannotated citation |
| task-114bc1c6f311 | cold | directionality | en | REFUTE | REFUTE | unannotated citation |
| task-627a8508b37d | experience_reuse | causal_language | en | UNKNOWN | SUPPORT | wrong verdict |
| task-6a7872dd20a3 | experience_reuse | directionality | en | REFUTE | REFUTE | unannotated citation |
| task-b901c5d9861f | evidence_reuse | directionality | ru | REFUTE | REFUTE | unannotated citation |
| task-a8c0c056147b | experience_reuse | directionality | ru | UNKNOWN | REFUTE | wrong verdict |
| task-b6da46b29fc2 | experience_reuse | negation | en | REFUTE | REFUTE | unannotated citation |
| task-65c36b675686 | memory_trap | directionality | en | UNKNOWN | SUPPORT | wrong verdict |
| task-48fa8eeb2e72 | experience_reuse | directionality | ru | SUPPORT | SUPPORT | unannotated citation |
| task-5e5c14be8a86 | evidence_reuse | population_scope | en | SUPPORT | SUPPORT | unannotated citation |
| task-37fd9ef345db | evidence_reuse | evidence_sufficiency | ru | SUPPORT | SUPPORT | unannotated citation |
| task-d0b83cdeefc0 | cold | evidence_sufficiency | en | SUPPORT | SUPPORT | unannotated citation |
| task-63b8ae9743bf | evidence_reuse | population_scope | en | SUPPORT | SUPPORT | unannotated citation |
| task-a4d8720db650 | experience_reuse | population_scope | ru | SUPPORT | SUPPORT | unannotated citation |
| task-6b6b28e474f5 | experience_reuse | negation | ru | SUPPORT | SUPPORT | unannotated citation |
| task-486e9c576269 | experience_reuse | causal_language | en | SUPPORT | SUPPORT | unannotated citation |
| task-0e120bb03f10 | experience_reuse | evidence_sufficiency | en | UNKNOWN | SUPPORT | wrong verdict |

## Interpretation

This A0 proves that verdict-only accuracy is not an adequate hackathon outcome: the model can usually choose the correct label without consistently returning the complete annotated rationale and only supported citations. The causal learning claim must therefore use A3–A0 on the primary metric, especially the paper-disjoint `experience_reuse` slice, while checking traps, cold controls, and regressions.

The scorer is annotation-strict. A correct verdict with additional scientifically plausible but unannotated sentences appears as citation contamination and should be manually inspected; the soft metric and evidence F1 preserve that distinction.

## Reproducibility

- Duration: 822.4 seconds
- Mean task latency: 68.4 seconds
- Mean corpus search calls/task: 8.33
- Mean tool calls/task: 12.03
- Mean input tokens/task: 236634
- Input tokens: 14198026
- Output tokens: 468631
- Tool calls: 722
- Manifest SHA-256: `9f5f643b1004dd2fd4c25b7348d37b2d76785b3419478bd2d045758602341bf6`
- Corpus SHA-256: `4ea16cc8c19745950ef908b00cf2a8fb3f94af1cc169584a31bba1c41f75e95e`
- Frozen tasks SHA-256: `904aa67ca590d97c6c7b15d9a9c3e1b504fb895bb516a88384ab42a3cc28df7f`
- Prompt SHA-256: `6d9a673bb37e316d81a63a33f5ac5f69e16e6b774470428da1de4f866aad44ff`

Predictions, metadata, per-task metrics, and the machine-readable score are stored beside this report. Raw provider traces and stderr are intentionally excluded from Git.
