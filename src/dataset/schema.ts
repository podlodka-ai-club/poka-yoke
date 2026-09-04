export const DATASET_ID = "scifact-memory-v1" as const;
export const SCHEMA_VERSION = 1 as const;

export type Verdict = "SUPPORT" | "REFUTE" | "UNKNOWN";
export type DatasetSplit = "learning" | "lesson-validation" | "frozen-test";
export type MemoryCase =
  | "cold"
  | "evidence_reuse"
  | "experience_reuse"
  | "memory_trap";
export type FailureFamily =
  | "numeric_precision"
  | "population_scope"
  | "causal_language"
  | "directionality"
  | "negation"
  | "evidence_sufficiency";

export interface ScientificPaper {
  paper_id: string;
  source: "SciFact";
  source_document_id: number;
  title: string;
  abstract_sentences: string[];
  structured: boolean;
}

export interface PublicTask {
  schema_version: typeof SCHEMA_VERSION;
  dataset_id: typeof DATASET_ID;
  task_id: string;
  sequence_index: number;
  corpus_id: "scifact-memory-v1-corpus";
  claim: {
    text: string;
    language: "en";
  };
}

export interface GoldEvidence {
  paper_id: string;
  sentence_ids: number[];
  text: string[];
}

export interface TaskOracle {
  schema_version: typeof SCHEMA_VERSION;
  dataset_id: typeof DATASET_ID;
  task_id: string;
  gold: {
    verdict: Verdict;
    evidence: GoldEvidence[];
    candidate_document_ids: string[];
  };
  protocol: {
    split: DatasetSplit;
    case: MemoryCase;
    failure_family: FailureFamily;
    episode_id: string | null;
    related_task_ids: string[];
    expected_lesson_family: FailureFamily | null;
    expected_evidence_document_ids: string[];
    forbidden_evidence_document_ids: string[];
    memory_read_allowed: boolean;
    memory_write_allowed: boolean;
    allowed_memory_writes:
      | "research-and-lessons"
      | "lesson-validation-only"
      | "none";
    reflection_allowed: boolean;
  };
  provenance: {
    source: "SciFact";
    source_split: "train" | "dev";
    source_claim_id: number;
  };
}

export interface MemoryEpisode {
  schema_version: typeof SCHEMA_VERSION;
  dataset_id: typeof DATASET_ID;
  episode_id: string;
  case: Exclude<MemoryCase, "cold">;
  failure_family: FailureFamily;
  teach_task_ids: string[];
  target_task_id: string;
  constraints: {
    disjoint_papers: boolean;
    evidence_reuse_allowed: boolean;
  };
}

export interface LessonCatalogEntry {
  schema_version: typeof SCHEMA_VERSION;
  dataset_id: typeof DATASET_ID;
  lesson_family: FailureFamily;
  canonical_rule: string;
  intended_use: "evaluator-only";
  matching_note: string;
}

export interface Prediction {
  task_id: string;
  predicted_verdict: Verdict;
  predicted_evidence?: Array<{
    paper_id: string;
    sentence_ids: number[];
  }>;
  used_evidence_document_ids?: string[];
  used_lesson_families?: FailureFamily[];
}

export const FAILURE_FAMILY_LESSONS: Record<FailureFamily, string> = {
  numeric_precision:
    "Match quantities, ranges, and comparison operators exactly; do not treat a nearby number as equivalent.",
  population_scope:
    "Verify population and species compatibility before transferring evidence to a claim.",
  causal_language:
    "Association or correlation alone is insufficient to support a causal claim.",
  directionality:
    "Check the direction of the reported effect before assigning SUPPORT or REFUTE.",
  negation:
    "Resolve negation explicitly and compare the proposition, not only overlapping keywords.",
  evidence_sufficiency:
    "Return UNKNOWN when the bounded corpus does not contain evidence that entails or contradicts the claim.",
};
