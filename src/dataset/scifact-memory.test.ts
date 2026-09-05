import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import {
  failureFamilyForClaim,
  scorePredictions,
  verdictForClaim,
  type SciFactClaim,
} from "./scifact-memory.ts";
import { type Prediction, type TaskOracle } from "./schema.ts";
import { validateDataset } from "./validate.ts";

function claim(evidence: SciFactClaim["evidence"]): SciFactClaim {
  return { id: 1, claim: "A claim", evidence, cited_doc_ids: [] };
}

test("maps SciFact labels without treating missing evidence as contradiction", () => {
  expect(verdictForClaim(claim({}))).toBe("UNKNOWN");
  expect(
    verdictForClaim(
      claim({ "1": [{ sentences: [0], label: "SUPPORT" }] }),
    ),
  ).toBe("SUPPORT");
  expect(
    verdictForClaim(
      claim({ "1": [{ sentences: [0], label: "CONTRADICT" }] }),
    ),
  ).toBe("REFUTE");
});

test("assigns procedural challenge families deterministically", () => {
  expect(failureFamilyForClaim("Treatment improves survival in 20% of patients.")).toBe(
    "numeric_precision",
  );
  expect(failureFamilyForClaim("The intervention works in mice.")).toBe("population_scope");
  expect(failureFamilyForClaim("Exposure causes mortality.")).toBe("causal_language");
  expect(failureFamilyForClaim("Treatment reduces inflammation.")).toBe("directionality");
  expect(failureFamilyForClaim("Protein A is not required.")).toBe("negation");
});

describe("prediction scorer", () => {
  const oracle: TaskOracle = {
    schema_version: 1,
    dataset_id: "scifact-memory-v1",
    task_id: "task-1",
    gold: {
      verdict: "SUPPORT",
      evidence: [{ paper_id: "paper-1", sentence_ids: [2], text: ["evidence"] }],
      candidate_document_ids: ["paper-1"],
    },
    protocol: {
      split: "frozen-test",
      case: "experience_reuse",
      failure_family: "causal_language",
      episode_id: "episode-1",
      related_task_ids: ["teach-1"],
      expected_lesson_family: "causal_language",
      expected_evidence_document_ids: [],
      forbidden_evidence_document_ids: [],
      memory_read_allowed: true,
      memory_write_allowed: false,
      allowed_memory_writes: "none",
      reflection_allowed: false,
    },
    provenance: { source: "SciFact", source_split: "dev", source_claim_id: 1 },
  };
  const correct: Prediction = {
    task_id: "task-1",
    predicted_verdict: "SUPPORT",
    predicted_evidence: [{ paper_id: "paper-1", sentence_ids: [2] }],
    used_lesson_families: ["causal_language"],
  };

  test("scores verdict, evidence, and lesson use", () => {
    const report = scorePredictions([oracle], [correct]);
    expect(report.accuracy).toBe(1);
    expect(report.evidence_f1).toBe(1);
    expect(report.lesson_retrieval_rate).toBe(1);
  });

  test("reports regression against a baseline", () => {
    const report = scorePredictions(
      [oracle],
      [{ task_id: "task-1", predicted_verdict: "REFUTE" }],
      [correct],
    );
    expect(report.delta_vs_baseline).toBe(-1);
    expect(report.memory_induced_regression_rate).toBe(1);
  });

  test("rejects incomplete or duplicate prediction files", () => {
    expect(() => scorePredictions([oracle], [])).toThrow("Expected 1 trained predictions");
    expect(() => scorePredictions([oracle], [correct, correct])).toThrow(
      "Duplicate trained prediction",
    );
  });
});

test("tracked SciFact-Memory release satisfies all invariants", () => {
  const summary = validateDataset(resolve("dataset/scifact-memory-v1"));
  expect(summary.tasks).toBe(120);
  expect(summary.splits).toEqual({
    learning: 60,
    "lesson-validation": 24,
    "frozen-test": 36,
  });
});
