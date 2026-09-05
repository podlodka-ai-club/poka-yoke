import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { scoreV2Predictions } from "./score-v2.ts";
import type { V2Prediction, V2PublicTask, V2TaskOracle } from "./v2-schema.ts";
import { validateDatasetV2 } from "./validate-v2.ts";

const task: V2PublicTask = {
  schema_version: 2,
  dataset_id: "scifact-memory-v2",
  task_id: "task-v2-test",
  sequence_index: 0,
  corpus_id: "scifact-memory-v2-corpus",
  claim: { text: "Терапия улучшает выживаемость.", language: "ru", domain: "biomedicine" },
  request_context: {
    user_role: "student",
    channel: "telegram",
    response_language: "ru",
    evidence_granularity: "abstract-sentence",
  },
  memory_control: {
    operation: "none",
    scope: "none",
    target_task_ids: [],
    target_document_ids: [],
    instruction_ru: null,
  },
};

const oracle: V2TaskOracle = {
  schema_version: 2,
  dataset_id: "scifact-memory-v2",
  task_id: task.task_id,
  gold: {
    verdict: "SUPPORT",
    evidence: [{ paper_id: "scifact:1", sentence_ids: [2], text: ["Evidence"] }],
    candidate_document_ids: ["scifact:1"],
  },
  protocol: {
    split: "frozen-test",
    case: "experience_reuse",
    failure_family: "causal_language",
    difficulty_tier: "memory-sensitive",
    episode_id: "episode-test",
    related_task_ids: ["teach-test"],
    expected_lesson_family: "causal_language",
    expected_evidence_document_ids: [],
    forbidden_evidence_document_ids: [],
    memory_operation: "none",
    memory_read_allowed: true,
    memory_write_allowed: false,
    allowed_memory_writes: "none",
    reflection_allowed: false,
  },
  provenance: {
    source: "SciFact",
    source_split: "dev",
    source_claim_id: 1,
    original_claim_en: "Therapy improves survival.",
    claim_translation: "repository-maintained",
    selection: "difficulty-ranked-unseen-pool",
  },
};

function prediction(overrides: Partial<V2Prediction> = {}): V2Prediction {
  return {
    task_id: task.task_id,
    predicted_verdict: "SUPPORT",
    answer: {
      language: "ru",
      explanation: "Это прямо подтверждается предложением 2.",
      uncertainty: null,
    },
    predicted_evidence: [
      { paper_id: "scifact:1", sentence_ids: [2], stance: "SUPPORTS" },
    ],
    consulted_document_ids: ["scifact:1"],
    used_evidence_memory_ids: [],
    used_lesson_families: ["causal_language"],
    ...overrides,
  };
}

test("v2 primary metric requires a correct verdict and grounded evidence", () => {
  const grounded = scoreV2Predictions([oracle], [task], [prediction()]);
  expect(grounded.verdict_accuracy).toBe(1);
  expect(grounded.grounded_task_accuracy).toBe(1);
  expect(grounded.by_claim_language.ru?.grounded_task_accuracy).toBe(1);

  const verdictOnly = scoreV2Predictions(
    [oracle],
    [task],
    [prediction({ predicted_evidence: [] })],
  );
  expect(verdictOnly.verdict_accuracy).toBe(1);
  expect(verdictOnly.grounded_task_accuracy).toBe(0);
  expect(verdictOnly.unsupported_verdict_rate).toBe(1);

  const contaminated = scoreV2Predictions(
    [oracle],
    [task],
    [
      prediction({
        predicted_evidence: [
          { paper_id: "scifact:1", sentence_ids: [2, 3], stance: "SUPPORTS" },
        ],
      }),
    ],
  );
  expect(contaminated.verdict_with_any_gold_evidence_accuracy).toBe(1);
  expect(contaminated.grounded_task_accuracy).toBe(0);
  expect(contaminated.citation_contamination_rate).toBe(1);
});

test("UNKNOWN is grounded only with no evidence and explicit uncertainty", () => {
  const unknownOracle: V2TaskOracle = {
    ...oracle,
    gold: { ...oracle.gold, verdict: "UNKNOWN", evidence: [] },
  };
  const calibrated = prediction({
    predicted_verdict: "UNKNOWN",
    answer: {
      language: "ru",
      explanation: "В ограниченном корпусе недостаточно данных.",
      uncertainty: "Нет прямого подтверждения или опровержения.",
    },
    predicted_evidence: [],
  });
  expect(scoreV2Predictions([unknownOracle], [task], [calibrated]).grounded_task_accuracy).toBe(1);
  expect(
    scoreV2Predictions(
      [unknownOracle],
      [task],
      [prediction({ ...calibrated, answer: { ...calibrated.answer, uncertainty: null } })],
    ).grounded_task_accuracy,
  ).toBe(0);
});

test("v2 reports paper-disjoint transfer against the clean baseline", () => {
  const report = scoreV2Predictions(
    [oracle],
    [task],
    [prediction()],
    [prediction({ predicted_verdict: "REFUTE" })],
  );
  expect(report.grounded_delta_vs_baseline).toBe(1);
  expect(report.experience_transfer_success_rate).toBe(1);
  expect(report.by_case.experience_reuse?.grounded_delta_vs_baseline).toBe(1);
});

test("tracked v2 release satisfies structural, bilingual, and memory-case invariants", () => {
  const summary = validateDatasetV2(resolve("dataset/scifact-memory-v2"));
  expect(summary.tasks).toBe(144);
  expect(summary.russian_claims).toBe(38);
  expect(summary.localized_documents).toBeGreaterThanOrEqual(25);
  expect(summary.frozen_cases).toEqual({
    cold: 6,
    evidence_reuse: 14,
    experience_reuse: 30,
    memory_trap: 10,
  });
});
