# DeepSeek V4 Flash A0 baseline via CommandCode and OpenCode

This is a clean-memory baseline over all 36 frozen SciFact-Memory v1 tasks. It
uses the `commandcode/deepseek/deepseek-v4-flash` route requested for comparison
with the recorded GPT-5.6 Luna A0 baseline. It is not an A3 memory result and
does not by itself demonstrate learning.

## Controlled condition

- Model: `commandcode/deepseek/deepseek-v4-flash`
- Provider: CommandCode subscription
- Runner: OpenCode `1.18.27`
- Condition: `A0-clean-no-memory`
- One fresh OpenCode session per task; six tasks ran concurrently
- Each task workspace contained `current_task.json`, `corpus.jsonl`, and a
  restrictive `opencode.json`
- Project permissions denied edits, external-directory access, web fetch,
  web search, and code search
- The CommandCode provider plugin remained enabled because the provider is not
  available to OpenCode in `--pure` mode
- No task needed a retry
- Run duration: 652 seconds

## Result

| Slice | Tasks | DeepSeek correct | DeepSeek accuracy | Luna correct | Luna accuracy |
|---|---:|---:|---:|---:|---:|
| Overall | 36 | 32 | 88.89% | 32 | 88.89% |
| `experience_reuse` | 24 | 21 | 87.50% | 22 | 91.67% |
| `evidence_reuse` | 6 | 5 | 83.33% | 5 | 83.33% |
| `memory_trap` | 6 | 6 | 100.00% | 5 | 83.33% |

Additional DeepSeek metrics:

- verdict macro-F1: 0.8903;
- evidence F1: 0.4884;
- UNKNOWN accuracy: 12/14 (85.71%);
- forbidden-document use on memory traps: 1/6;
- total local tool calls: 376.

The total A0 verdict headroom remains 4/36, or 11.11 percentage points. On the
procedural `experience_reuse` slice, DeepSeek leaves 3/24 errors, or 12.50
percentage points of potential improvement.

## Incorrect verdicts

| Task | Case | Family | Gold | DeepSeek | Luna | Claim |
|---|---|---|---|---|---|---|
| `task-7010c3491b46` | `experience_reuse` | `directionality` | UNKNOWN | SUPPORT | SUPPORT | Pleiotropic coupling of GLP-1R to intracellular effectors promotes distinct profiles of cellular signaling. |
| `task-83a7805039cc` | `experience_reuse` | `directionality` | SUPPORT | UNKNOWN | SUPPORT | Polymeal nutrition reduces cardiovascular mortality. |
| `task-73af791d6de8` | `experience_reuse` | `negation` | UNKNOWN | REFUTE | REFUTE | Mice without IFN-γ or its receptor are resistant to EAM induced with α-MyHC/CFA. |
| `task-5c3786620aa4` | `evidence_reuse` | `evidence_sufficiency` | SUPPORT | UNKNOWN | UNKNOWN | Rapid phosphotransfer rates govern fidelity in two component systems. |

The models disagreed on only two tasks. DeepSeek missed the Polymeal task that
Luna answered according to gold, while DeepSeek correctly returned UNKNOWN on
the *P. chabaudi* memory trap that Luna missed. The remaining three errors were
shared by both models.

SciFact UNKNOWN is a bounded-corpus annotation, not a universal scientific
falsehood. The two shared UNKNOWN disagreements should therefore be presented
as strict disagreements with official SciFact gold. The Polymeal gold evidence
mentions reduced cardiovascular morbidity and increased life expectancy, but
does not use the exact phrase "cardiovascular mortality"; DeepSeek's stricter
UNKNOWN is understandable. Thus the run establishes measurable label headroom,
but not four equally clean examples of a learnable reasoning defect.

## Leakage audit

During the run, 36 traces containing 376 tool calls were audited: 270 `bash`, 68
`read`, 30 `grep`, and 8 `glob`. The recorded inputs contained no web URL,
network command, oracle path, lesson catalog, frozen-test path, repository path,
or prior OpenCode session. All search and inspection targeted the per-task files.
One `read` followed an OpenCode-managed temporary tool-output path containing a
truncated local `corpus.jsonl` grep result; it did not add external information.
Raw traces and stderr logs are intentionally excluded from Git.

One correct memory-trap prediction listed its forbidden document as consulted,
which explains the 1/6 forbidden-use rate. It returned UNKNOWN and cited no
gold evidence, so the trap verdict itself remained correct.

## Integrity

```text
dataset manifest  d740d5b58fb528132c86ecdaa4625d695342d4f9ae7a446069aeabd71e386097
runner            69020bfe2818a63d1e5f4a44668568ede2a4357310aecbb9cc88c51eb4fc2b8d
output schema     8d63fe878a10c3fa6e799d85340677216579622296920fe17cad44c94c4b352a
predictions       9497407eca7b4da830c0b9cf7400cdeee490461b99d459210ab72694401f5f74
score             87ed6a46dde38f0e809acf4221447451b9ee057b0a314e7a903322341bfac702
metadata          31d120760bf484455ddda955d7c696a662bf826faa4b4cbad6df4bd89e88f256
```

## Reproduction

```bash
bun run dataset:a0:opencode \
  --model commandcode/deepseek/deepseek-v4-flash \
  --concurrency 6 \
  --output artifacts/scifact-memory-v1/<new-a0-run>
```

For a memory claim, compare the eventual A3 run to this exact A0 prediction
file and include the A2 lessons-disabled ablation. A3 improvements on the three
`experience_reuse` misses are the most direct procedural-learning candidates;
the evidence-reuse miss primarily measures retrieval.
