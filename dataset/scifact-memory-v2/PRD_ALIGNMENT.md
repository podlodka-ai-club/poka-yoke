# SciFact-Memory v2 alignment audit

This audit maps the product and hackathon requirements to concrete dataset
artifacts. It distinguishes what the dataset can prove from what the Cognee
harness must demonstrate at runtime.

| Requirement | Dataset evidence | Runtime evidence still required |
|---|---|---|
| Students and research staff | `request_context.user_role` balances both roles in the frozen set | UI/session logs from real Pi or Telegram entry points |
| Pi and Telegram | `request_context.channel` creates reportable channel slices | Both channels must use the same memory policy |
| Russian-first answer | every task requires `response_language: ru`; scorer checks Cyrillic explanations | Product rendering and user-visible citations |
| Russian and English research inputs | 38 Russian claims, 106 English claims, and 27 Russian localized evidence documents | Retrieval over additional live RU/EN sources is outside this bounded release |
| One claim or a small batch | each record is an independently identifiable claim-verification task | Batch orchestration, cancellation, and progress UI |
| Traceable scientific evidence | stable paper IDs, exact abstract sentence IDs, source claim provenance | Links to source documents and end-user citation presentation |
| Learn from evaluated results | 60 writable learning tasks followed by 24 no-training lesson-validation tasks | Research run → evaluator → reflection → Cognee write trace |
| Reusable experience, not only fact lookup | 30 frozen `experience_reuse` targets share a lesson family but have papers disjoint from learning | Positive A3–A0 delta on this slice with lesson retrieval enabled |
| Evidence memory | 14 frozen `evidence_reuse` targets share an evidence document with a learning task | Retrieval trace showing stored evidence was actually read |
| Avoid harmful transfer | 10 memory traps plus six cold controls; scorer reports false certainty, forbidden citation use, and regressions | A3 must not improve by contaminating traps or unrelated controls |
| Correct and forget stale memory | three `correct` and three `reset` targets with explicit scope and target IDs | Isolated S1 clones, mutation audit events, and post-operation retrieval traces |
| Persistence across restart | frozen protocol separates trained snapshot S1 from A3 and forbids replay | Stop Pi/Cognee, restore S1, and reproduce changed behavior without replay |
| Observable before/after proof | identical frozen tasks for A0 and A3; scorer accepts a baseline | Immutable run metadata showing equal model, prompts, tools, corpus, budget, and order |
| Scientifically grounded completion | primary score requires correct verdict, complete rationale, correct stance, and no unannotated citation | Manual review of strict failures where SciFact may omit a valid adjacent sentence |
| Reproducibility | pinned SciFact URL, commit and SHA-256; deterministic generator; artifact hashes; versioned translations and curation | Pin Cognee, model/provider, prompt, tool, and snapshot versions per run |

## Limits of the claim

The dataset alone does not demonstrate that Cognee persisted memory or that the
agent learned. It supplies the controlled stream, gold data, counterfactual
slices, and scorer needed to test those claims. The hackathon proof is complete
only after a memory-enabled A3 run beats the clean A0 on grounded
`experience_reuse`, survives a full process restart, and does not materially
regress on traps and cold controls.

SciFact remains the scientific source pool. The task sequencing, bilingual
presentation, memory interventions, lesson-transfer structure, leakage controls,
manual curation, and evaluation contract are repository-owned.

## Deliberate scope choices

This is not a weight-training dataset. `learning` means the harness may evaluate
the frozen answer, diagnose a failure, validate a lesson, and write structured
memory. The LLM and Cognee weights are not changed.

The blueprint's 60–70% / 10–20% / 20% split is a scaling recommendation. The
hackathon release intentionally uses 60 / 24 / 60 instead: ten learning examples
and four validation examples per lesson family, plus a frozen set large enough
to hold 30 paper-disjoint transfer targets, 14 evidence-reuse targets, ten traps,
and six cold controls. This eval-heavy ratio costs more per full ablation but
gives interpretable slices at a total of 144 tasks. Scale the learning stream
later without changing this frozen release.

The corpus is deliberately bounded to 1024 English SciFact abstracts. Russian
claims and 27 localized passages test Russian interaction and bilingual evidence
handling, but they are translations rather than native Russian publications.
Native-Russian source ingestion remains a product-harness extension and must not
be claimed as already proven by this release.
