export const DATASET_V2_ID = "scifact-memory-v2" as const;
export const SCHEMA_V2_VERSION = 2 as const;

export type V2Verdict = "SUPPORT" | "REFUTE" | "UNKNOWN";
export type V2Language = "en" | "ru";
export type V2Split = "learning" | "lesson-validation" | "frozen-test";
export type V2MemoryCase =
  | "cold"
  | "evidence_reuse"
  | "experience_reuse"
  | "memory_trap";
export type V2FailureFamily =
  | "numeric_precision"
  | "population_scope"
  | "causal_language"
  | "directionality"
  | "negation"
  | "evidence_sufficiency";
export type V2MemoryOperation = "none" | "correct" | "reset";
export type V2UserRole = "student" | "research_staff";
export type V2Channel = "pi" | "telegram";

export interface V2LocalizedPassage {
  language: "ru";
  translation_kind: "repository-maintained";
  sentence_ids: number[];
  text: string[];
}

export interface V2ScientificPaper {
  paper_id: string;
  source: "SciFact";
  source_document_id: number;
  source_language: "en";
  title: string;
  abstract_sentences: string[];
  structured: boolean;
  localized_passages: V2LocalizedPassage[];
}

export interface V2PublicTask {
  schema_version: typeof SCHEMA_V2_VERSION;
  dataset_id: typeof DATASET_V2_ID;
  task_id: string;
  sequence_index: number;
  corpus_id: "scifact-memory-v2-corpus";
  claim: {
    text: string;
    language: V2Language;
    domain: "biomedicine";
  };
  request_context: {
    user_role: V2UserRole;
    channel: V2Channel;
    response_language: "ru";
    evidence_granularity: "abstract-sentence";
  };
  memory_control: {
    operation: V2MemoryOperation;
    scope: "none" | "claim-evidence-relation" | "topic";
    target_task_ids: string[];
    target_document_ids: string[];
    instruction_ru: string | null;
  };
}

export interface V2GoldEvidence {
  paper_id: string;
  sentence_ids: number[];
  text: string[];
}

export interface V2TaskOracle {
  schema_version: typeof SCHEMA_V2_VERSION;
  dataset_id: typeof DATASET_V2_ID;
  task_id: string;
  gold: {
    verdict: V2Verdict;
    evidence: V2GoldEvidence[];
    candidate_document_ids: string[];
  };
  protocol: {
    split: V2Split;
    case: V2MemoryCase;
    failure_family: V2FailureFamily;
    difficulty_tier: "memory-sensitive";
    episode_id: string | null;
    related_task_ids: string[];
    expected_lesson_family: V2FailureFamily | null;
    expected_evidence_document_ids: string[];
    forbidden_evidence_document_ids: string[];
    memory_operation: V2MemoryOperation;
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
    original_claim_en: string;
    claim_translation: "none" | "repository-maintained";
    selection: "difficulty-ranked-unseen-pool";
  };
}

export interface V2MemoryEpisode {
  schema_version: typeof SCHEMA_V2_VERSION;
  dataset_id: typeof DATASET_V2_ID;
  episode_id: string;
  case: Exclude<V2MemoryCase, "cold">;
  failure_family: V2FailureFamily;
  teach_task_ids: string[];
  target_task_id: string;
  memory_operation: V2MemoryOperation;
  constraints: {
    disjoint_papers: boolean;
    evidence_reuse_allowed: boolean;
    frozen_target_unseen_in_v1: true;
  };
}

export interface V2LessonCatalogEntry {
  schema_version: typeof SCHEMA_V2_VERSION;
  dataset_id: typeof DATASET_V2_ID;
  lesson_family: V2FailureFamily;
  canonical_rule: string;
  applies_when: string;
  expected_effect: string;
  intended_use: "evaluator-only";
}

export interface V2Prediction {
  task_id: string;
  predicted_verdict: V2Verdict;
  answer: {
    language: "ru";
    explanation: string;
    uncertainty: string | null;
  };
  predicted_evidence: Array<{
    paper_id: string;
    sentence_ids: number[];
    stance: "SUPPORTS" | "REFUTES";
  }>;
  consulted_document_ids: string[];
  used_evidence_memory_ids: string[];
  used_lesson_families: V2FailureFamily[];
}

export const V2_FAILURE_FAMILY_LESSONS: Record<
  V2FailureFamily,
  Omit<V2LessonCatalogEntry, "schema_version" | "dataset_id" | "lesson_family" | "intended_use">
> = {
  numeric_precision: {
    canonical_rule:
      "Сопоставляй точные числа, диапазоны, единицы измерения и операторы сравнения; близкое значение не эквивалентно заявленному.",
    applies_when: "Claim и evidence содержат количества, пороги, длительности или размеры эффекта.",
    expected_effect: "Снижает ложные SUPPORT при несовпадающих числах и единицах.",
  },
  population_scope: {
    canonical_rule:
      "Не переноси результат между видами, возрастами, состояниями здоровья или клиническими популяциями без прямого evidence.",
    applies_when: "Популяция claim отличается от популяции исследования или сохранённого evidence.",
    expected_effect: "Снижает negative transfer между животными и людьми и между подгруппами.",
  },
  causal_language: {
    canonical_rule:
      "Ассоциация и корреляция сами по себе не подтверждают причинный claim; проверяй дизайн и формулировку вывода.",
    applies_when: "Claim использует причинную формулировку, а evidence описывает наблюдаемую связь.",
    expected_effect: "Снижает ложные SUPPORT для причинных утверждений.",
  },
  directionality: {
    canonical_rule:
      "Проверяй направление эффекта и различай увеличение, уменьшение, отсутствие эффекта и изменение другого outcome.",
    applies_when: "Claim и evidence описывают направленное изменение показателя.",
    expected_effect: "Снижает ошибки знака эффекта и подмены outcome.",
  },
  negation: {
    canonical_rule:
      "Разрешай отрицание явно и сравнивай полную пропозицию, а не только совпадающие сущности и ключевые слова.",
    applies_when: "Claim или evidence содержит отрицание, отсутствие, недостаточность или исключение.",
    expected_effect: "Снижает инверсии SUPPORT/REFUTE и ложную уверенность.",
  },
  evidence_sufficiency: {
    canonical_rule:
      "Возвращай UNKNOWN, если ограниченный корпус не содержит предложения, которое прямо подтверждает или опровергает claim.",
    applies_when: "Найден тематически близкий документ без достаточного entailment или contradiction.",
    expected_effect: "Улучшает калибровку UNKNOWN и снижает неподкреплённые verdicts.",
  },
};
