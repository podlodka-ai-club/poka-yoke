import { createHash } from "node:crypto";
import {
  DATASET_ID,
  SCHEMA_VERSION,
  type DatasetSplit,
  type FailureFamily,
  type GoldEvidence,
  type MemoryCase,
  type MemoryEpisode,
  type Prediction,
  type PublicTask,
  type ScientificPaper,
  type TaskOracle,
  type Verdict,
} from "./schema.ts";

export interface SciFactPaper {
  doc_id: number;
  title: string;
  abstract: string[];
  structured: boolean;
}

export interface SciFactClaim {
  id: number;
  claim: string;
  evidence: Record<
    string,
    Array<{ sentences: number[]; label: "SUPPORT" | "CONTRADICT" }>
  >;
  cited_doc_ids?: number[];
}

export interface SourceClaim extends SciFactClaim {
  source_split: "train" | "dev";
}

export interface BuiltTask {
  source: SourceClaim;
  task: PublicTask;
  oracle: TaskOracle;
  documentIds: Set<number>;
  goldDocumentIds: Set<number>;
}

export interface DatasetBuild {
  corpus: ScientificPaper[];
  splits: Record<DatasetSplit, { tasks: PublicTask[]; oracles: TaskOracle[] }>;
  episodes: MemoryEpisode[];
  stats: DatasetStats;
}

export interface DatasetStats {
  total_tasks: number;
  corpus_documents: number;
  splits: Record<DatasetSplit, number>;
  labels: Record<Verdict, number>;
  cases: Record<MemoryCase, number>;
  failure_families: Record<FailureFamily, number>;
  episodes: number;
}

const ALL_LABELS: Verdict[] = ["SUPPORT", "REFUTE", "UNKNOWN"];
const ALL_FAMILIES: FailureFamily[] = [
  "numeric_precision",
  "population_scope",
  "causal_language",
  "directionality",
  "negation",
  "evidence_sufficiency",
];

export function verdictForClaim(claim: SciFactClaim): Verdict {
  const labels = Object.values(claim.evidence)
    .flat()
    .map(({ label }) => label);
  if (labels.length === 0) return "UNKNOWN";
  const unique = new Set(labels);
  if (unique.size !== 1) return "UNKNOWN";
  return labels[0] === "SUPPORT" ? "SUPPORT" : "REFUTE";
}

export function failureFamilyForClaim(text: string): FailureFamily {
  const normalized = text.toLowerCase();
  if (
    /^\d|(?:^|\s)\d+(?:[.,]\d+)?\s*(?:%|percent|fold|times?|years?|days?|weeks?|months?|million|billion)\b|%|approximately|at least|less than|more than/.test(
      normalized,
    )
  ) {
    return "numeric_precision";
  }
  if (/\b(?:not|no|lack|without|unrelated|uninvolved|insufficient)\b/.test(normalized)) {
    return "negation";
  }
  if (
    /\b(?:mice|mouse|humans?|patients?|adults?|children|women|men|infants?|rhesus|macaques?|rats?)\b/.test(
      normalized,
    )
  ) {
    return "population_scope";
  }
  if (/\b(?:caus\w*|leads?|results?|driv\w*|induces?|influences?)\b/.test(normalized)) {
    return "causal_language";
  }
  if (
    /\b(?:increas\w*|decreas\w*|reduc\w*|rais\w*|lower\w*|improv\w*|worsen\w*|enhanc\w*|imped\w*|inhibit\w*|promot\w*|prevent\w*|suppress\w*)\b/.test(
      normalized,
    )
  ) {
    return "directionality";
  }
  return "evidence_sufficiency";
}

function stableScore(seed: string, value: string): string {
  return createHash("sha256").update(`${seed}:${value}`).digest("hex");
}

function stableOrder<T>(items: readonly T[], seed: string, key: (item: T) => string): T[] {
  return [...items].sort((left, right) =>
    stableScore(seed, key(left)).localeCompare(stableScore(seed, key(right))),
  );
}

function sourceTaskId(claim: SourceClaim): string {
  return `task-${createHash("sha256")
    .update(`${claim.source_split}:${claim.id}`)
    .digest("hex")
    .slice(0, 12)}`;
}

function sourceDocumentIds(claim: SciFactClaim): Set<number> {
  return new Set([
    ...(claim.cited_doc_ids ?? []),
    ...Object.keys(claim.evidence).map(Number),
  ]);
}

function goldDocumentIds(claim: SciFactClaim): Set<number> {
  return new Set(Object.keys(claim.evidence).map(Number));
}

function intersects(left: ReadonlySet<number>, right: ReadonlySet<number>): number[] {
  return [...left].filter((value) => right.has(value));
}

function evidenceForClaim(
  claim: SciFactClaim,
  papers: ReadonlyMap<number, SciFactPaper>,
): GoldEvidence[] {
  const evidence: GoldEvidence[] = [];
  for (const [documentIdText, rationales] of Object.entries(claim.evidence)) {
    const documentId = Number(documentIdText);
    const paper = papers.get(documentId);
    if (!paper) throw new Error(`Missing SciFact paper ${documentId}`);
    for (const rationale of rationales) {
      evidence.push({
        paper_id: `scifact:${documentId}`,
        sentence_ids: [...rationale.sentences],
        text: rationale.sentences.map((sentenceId) => {
          const sentence = paper.abstract[sentenceId];
          if (sentence === undefined) {
            throw new Error(
              `Claim ${claim.id} references missing sentence ${documentId}:${sentenceId}`,
            );
          }
          return sentence;
        }),
      });
    }
  }
  return evidence;
}

function createBuiltTask(
  source: SourceClaim,
  split: DatasetSplit,
  sequenceIndex: number,
  papers: ReadonlyMap<number, SciFactPaper>,
  protocol: {
    case: MemoryCase;
    episodeId?: string;
    relatedTaskIds?: string[];
    expectedLessonFamily?: FailureFamily;
    expectedEvidenceDocumentIds?: number[];
    forbiddenEvidenceDocumentIds?: number[];
  },
): BuiltTask {
  const taskId = sourceTaskId(source);
  const task: PublicTask = {
    schema_version: SCHEMA_VERSION,
    dataset_id: DATASET_ID,
    task_id: taskId,
    sequence_index: sequenceIndex,
    corpus_id: "scifact-memory-v1-corpus",
    claim: { text: source.claim, language: "en" },
  };
  const oracle: TaskOracle = {
    schema_version: SCHEMA_VERSION,
    dataset_id: DATASET_ID,
    task_id: taskId,
    gold: {
      verdict: verdictForClaim(source),
      evidence: evidenceForClaim(source, papers),
      candidate_document_ids: [...sourceDocumentIds(source)]
        .sort((a, b) => a - b)
        .map((id) => `scifact:${id}`),
    },
    protocol: {
      split,
      case: protocol.case,
      failure_family: failureFamilyForClaim(source.claim),
      episode_id: protocol.episodeId ?? null,
      related_task_ids: protocol.relatedTaskIds ?? [],
      expected_lesson_family: protocol.expectedLessonFamily ?? null,
      expected_evidence_document_ids: (protocol.expectedEvidenceDocumentIds ?? []).map(
        (id) => `scifact:${id}`,
      ),
      forbidden_evidence_document_ids: (protocol.forbiddenEvidenceDocumentIds ?? []).map(
        (id) => `scifact:${id}`,
      ),
      memory_read_allowed: true,
      memory_write_allowed: split === "learning",
      allowed_memory_writes:
        split === "learning"
          ? "research-and-lessons"
          : split === "lesson-validation"
            ? "lesson-validation-only"
            : "none",
      reflection_allowed: split === "learning",
    },
    provenance: {
      source: "SciFact",
      source_split: source.source_split,
      source_claim_id: source.id,
    },
  };
  return {
    source,
    task,
    oracle,
    documentIds: sourceDocumentIds(source),
    goldDocumentIds: goldDocumentIds(source),
  };
}

function pickFamilyBalanced(
  candidates: readonly SourceClaim[],
  perFamily: number,
  seed: string,
  excludedIds: ReadonlySet<string> = new Set(),
  forbiddenDocuments: ReadonlySet<number> = new Set(),
  initial: readonly SourceClaim[] = [],
): SourceClaim[] {
  const selected = [...initial];
  const selectedIds = new Set([...excludedIds, ...selected.map(sourceTaskId)]);
  const labelCounts = new Map(
    ALL_LABELS.map((label) => [
      label,
      selected.filter((candidate) => verdictForClaim(candidate) === label).length,
    ]),
  );
  for (const family of ALL_FAMILIES) {
    const current = selected.filter(
      (candidate) => failureFamilyForClaim(candidate.claim) === family,
    );
    if (current.length > perFamily) {
      throw new Error(`${seed}: ${family} has ${current.length} required tasks, limit is ${perFamily}`);
    }
    const buckets = new Map(
      ALL_LABELS.map((label) => [
        label,
        stableOrder(
          candidates.filter(
            (candidate) =>
              failureFamilyForClaim(candidate.claim) === family &&
              verdictForClaim(candidate) === label &&
              !selectedIds.has(sourceTaskId(candidate)) &&
              intersects(sourceDocumentIds(candidate), forbiddenDocuments).length === 0,
          ),
          `${seed}:${family}:${label}`,
          sourceTaskId,
        ),
      ]),
    );
    while (
      selected.filter((candidate) => failureFamilyForClaim(candidate.claim) === family).length <
      perFamily
    ) {
      const label = [...ALL_LABELS]
        .sort(
          (left, right) =>
            (labelCounts.get(left) ?? 0) - (labelCounts.get(right) ?? 0) ||
            ALL_LABELS.indexOf(left) - ALL_LABELS.indexOf(right),
        )
        .find((candidateLabel) => (buckets.get(candidateLabel)?.length ?? 0) > 0);
      if (!label) {
        throw new Error(`${seed}: not enough ${family} tasks to reach ${perFamily}`);
      }
      const candidate = buckets.get(label)!.shift()!;
      selected.push(candidate);
      selectedIds.add(sourceTaskId(candidate));
      labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1);
    }
  }
  return stableOrder(selected, `${seed}:combined`, sourceTaskId);
}

function bestAnchor(
  target: SourceClaim,
  learning: readonly SourceClaim[],
  mode: "shared-gold" | "shared-candidate" | "family",
): SourceClaim | undefined {
  const targetDocuments = sourceDocumentIds(target);
  const targetGold = goldDocumentIds(target);
  const targetFamily = failureFamilyForClaim(target.claim);
  const candidates = learning.filter((candidate) => {
    if (mode === "shared-gold") {
      return intersects(goldDocumentIds(candidate), targetGold).length > 0;
    }
    if (mode === "shared-candidate") {
      return (
        verdictForClaim(candidate) !== "UNKNOWN" &&
        intersects(goldDocumentIds(candidate), targetDocuments).length > 0
      );
    }
    return (
      failureFamilyForClaim(candidate.claim) === targetFamily &&
      intersects(sourceDocumentIds(candidate), targetDocuments).length === 0
    );
  });
  return stableOrder(candidates, `anchor:${sourceTaskId(target)}:${mode}`, sourceTaskId)[0];
}

function selectPairedTargets(
  dev: readonly SourceClaim[],
  train: readonly SourceClaim[],
  kind: "evidence_reuse" | "memory_trap",
  count: number,
  excludedIds: ReadonlySet<string>,
): Array<{ target: SourceClaim; anchor: SourceClaim; shared: number[] }> {
  const candidates = stableOrder(
    dev.filter((claim) => {
      const verdict = verdictForClaim(claim);
      return kind === "memory_trap" ? verdict === "UNKNOWN" : verdict !== "UNKNOWN";
    }),
    `paired:${kind}`,
    sourceTaskId,
  );
  const pairs: Array<{ target: SourceClaim; anchor: SourceClaim; shared: number[] }> = [];
  const usedTargets = new Set<string>();
  const evidenceLabelCounts = new Map<Verdict, number>([
    ["SUPPORT", 0],
    ["REFUTE", 0],
    ["UNKNOWN", 0],
  ]);
  for (const target of candidates) {
    if (pairs.length >= count) break;
    if (excludedIds.has(sourceTaskId(target)) || usedTargets.has(sourceTaskId(target))) continue;
    const targetVerdict = verdictForClaim(target);
    if (
      kind === "evidence_reuse" &&
      (targetVerdict === "UNKNOWN" ||
        (evidenceLabelCounts.get(targetVerdict) ?? 0) >= count / 2)
    ) {
      continue;
    }
    const anchor = bestAnchor(
      target,
      train,
      kind === "memory_trap" ? "shared-candidate" : "shared-gold",
    );
    if (!anchor) continue;
    const shared = intersects(
      kind === "memory_trap" ? goldDocumentIds(anchor) : goldDocumentIds(target),
      kind === "memory_trap" ? sourceDocumentIds(target) : goldDocumentIds(anchor),
    );
    if (shared.length === 0) continue;
    pairs.push({ target, anchor, shared });
    evidenceLabelCounts.set(targetVerdict, (evidenceLabelCounts.get(targetVerdict) ?? 0) + 1);
    usedTargets.add(sourceTaskId(target));
  }
  if (pairs.length !== count) {
    throw new Error(`Unable to create ${count} ${kind} pairs; created ${pairs.length}`);
  }
  return pairs;
}

function assignLearningCases(items: readonly SourceClaim[]): MemoryCase[] {
  const seenDocuments = new Set<number>();
  return items.map((item) => {
    const shared = intersects(sourceDocumentIds(item), seenDocuments);
    const verdict = verdictForClaim(item);
    let result: MemoryCase = "cold";
    if (shared.length > 0) result = verdict === "UNKNOWN" ? "memory_trap" : "evidence_reuse";
    for (const documentId of sourceDocumentIds(item)) seenDocuments.add(documentId);
    return result;
  });
}

export function buildDataset(
  trainClaims: readonly SciFactClaim[],
  devClaims: readonly SciFactClaim[],
  sourcePapers: readonly SciFactPaper[],
): DatasetBuild {
  const papers = new Map(sourcePapers.map((paper) => [paper.doc_id, paper]));
  const train: SourceClaim[] = trainClaims.map((claim) => ({ ...claim, source_split: "train" }));
  const dev: SourceClaim[] = devClaims.map((claim) => ({ ...claim, source_split: "dev" }));

  const evidencePairs = selectPairedTargets(dev, train, "evidence_reuse", 6, new Set());
  const evidenceTargetIds = new Set(evidencePairs.map(({ target }) => sourceTaskId(target)));
  const trapPairs = selectPairedTargets(dev, train, "memory_trap", 6, evidenceTargetIds);

  const requiredAnchors = new Map<string, SourceClaim>();
  for (const pair of [...evidencePairs, ...trapPairs]) {
    requiredAnchors.set(sourceTaskId(pair.anchor), pair.anchor);
  }

  const orderedLearning = pickFamilyBalanced(
    train,
    10,
    "learning",
    new Set(),
    new Set(),
    [...requiredAnchors.values()],
  );
  const learningIds = new Set(orderedLearning.map(sourceTaskId));
  const learningDocuments = new Set(orderedLearning.flatMap((claim) => [...sourceDocumentIds(claim)]));

  const validation = pickFamilyBalanced(
    train,
    4,
    "validation",
    learningIds,
    learningDocuments,
  );
  const validationIds = new Set(validation.map(sourceTaskId));

  const pairedTargetIds = new Set([
    ...evidencePairs.map(({ target }) => sourceTaskId(target)),
    ...trapPairs.map(({ target }) => sourceTaskId(target)),
  ]);
  const experienceTargets = pickFamilyBalanced(
    dev,
    4,
    "frozen-experience",
    pairedTargetIds,
    learningDocuments,
  );
  const frozen = [
    ...experienceTargets,
    ...evidencePairs.map(({ target }) => target),
    ...trapPairs.map(({ target }) => target),
  ];

  const episodes: MemoryEpisode[] = [];
  const episodeByTarget = new Map<
    string,
    { episode: MemoryEpisode; anchors: SourceClaim[]; shared: number[] }
  >();
  let episodeCounter = 1;
  const registerEpisode = (
    target: SourceClaim,
    anchors: readonly SourceClaim[],
    kind: Exclude<MemoryCase, "cold">,
    shared: number[] = [],
  ) => {
    const episodeId = `episode-${String(episodeCounter).padStart(3, "0")}`;
    episodeCounter += 1;
    const episode: MemoryEpisode = {
      schema_version: SCHEMA_VERSION,
      dataset_id: DATASET_ID,
      episode_id: episodeId,
      case: kind,
      failure_family: failureFamilyForClaim(target.claim),
      teach_task_ids: anchors.map(sourceTaskId),
      target_task_id: sourceTaskId(target),
      constraints: {
        disjoint_papers: kind === "experience_reuse",
        evidence_reuse_allowed: kind === "evidence_reuse",
      },
    };
    episodes.push(episode);
    episodeByTarget.set(sourceTaskId(target), { episode, anchors: [...anchors], shared });
  };

  for (const target of validation) {
    const anchors = orderedLearning.filter(
      (candidate) =>
        failureFamilyForClaim(candidate.claim) === failureFamilyForClaim(target.claim) &&
        intersects(sourceDocumentIds(candidate), sourceDocumentIds(target)).length === 0,
    );
    if (anchors.length === 0) {
      throw new Error(`No experience anchors for validation task ${sourceTaskId(target)}`);
    }
    registerEpisode(target, anchors, "experience_reuse");
  }
  for (const target of experienceTargets) {
    const anchors = orderedLearning.filter(
      (candidate) =>
        failureFamilyForClaim(candidate.claim) === failureFamilyForClaim(target.claim) &&
        intersects(sourceDocumentIds(candidate), sourceDocumentIds(target)).length === 0,
    );
    if (anchors.length === 0) {
      throw new Error(`No experience anchors for frozen task ${sourceTaskId(target)}`);
    }
    registerEpisode(target, anchors, "experience_reuse");
  }
  for (const { target, anchor, shared } of evidencePairs) {
    registerEpisode(target, [anchor], "evidence_reuse", shared);
  }
  for (const { target, anchor, shared } of trapPairs) {
    registerEpisode(target, [anchor], "memory_trap", shared);
  }

  const learningCases = assignLearningCases(orderedLearning);
  const buildSplit = (
    claims: readonly SourceClaim[],
    split: DatasetSplit,
  ): { tasks: PublicTask[]; oracles: TaskOracle[] } => {
    const built = claims.map((source, index) => {
      if (split === "learning") {
        return createBuiltTask(source, split, index, papers, { case: learningCases[index]! });
      }
      const match = episodeByTarget.get(sourceTaskId(source));
      if (!match) throw new Error(`Missing episode for ${sourceTaskId(source)}`);
      return createBuiltTask(source, split, index, papers, {
        case: match.episode.case,
        episodeId: match.episode.episode_id,
        relatedTaskIds: match.anchors.map(sourceTaskId),
        expectedLessonFamily:
          match.episode.case === "experience_reuse"
            ? match.episode.failure_family
            : undefined,
        expectedEvidenceDocumentIds:
          match.episode.case === "evidence_reuse" ? match.shared : undefined,
        forbiddenEvidenceDocumentIds:
          match.episode.case === "memory_trap" ? match.shared : undefined,
      });
    });
    return { tasks: built.map(({ task }) => task), oracles: built.map(({ oracle }) => oracle) };
  };

  const splits: DatasetBuild["splits"] = {
    learning: buildSplit(orderedLearning, "learning"),
    "lesson-validation": buildSplit(validation, "lesson-validation"),
    "frozen-test": buildSplit(frozen, "frozen-test"),
  };

  const requiredDocumentIds = new Set<number>();
  for (const claim of [...orderedLearning, ...validation, ...frozen]) {
    for (const documentId of sourceDocumentIds(claim)) requiredDocumentIds.add(documentId);
  }
  const distractors = stableOrder(
    sourcePapers.filter((paper) => !requiredDocumentIds.has(paper.doc_id)),
    "corpus-distractors",
    (paper) => String(paper.doc_id),
  ).slice(0, Math.max(0, 512 - requiredDocumentIds.size));
  const selectedPapers = [
    ...[...requiredDocumentIds].map((id) => {
      const paper = papers.get(id);
      if (!paper) throw new Error(`Selected task references absent paper ${id}`);
      return paper;
    }),
    ...distractors,
  ].sort((a, b) => a.doc_id - b.doc_id);
  const corpus: ScientificPaper[] = selectedPapers.map((paper) => ({
    paper_id: `scifact:${paper.doc_id}`,
    source: "SciFact",
    source_document_id: paper.doc_id,
    title: paper.title,
    abstract_sentences: paper.abstract,
    structured: paper.structured,
  }));

  const oracles = Object.values(splits).flatMap(({ oracles: values }) => values);
  const count = <T extends string>(values: readonly T[], keys: readonly T[]) =>
    Object.fromEntries(keys.map((key) => [key, values.filter((value) => value === key).length]));
  const stats: DatasetStats = {
    total_tasks: oracles.length,
    corpus_documents: corpus.length,
    splits: {
      learning: splits.learning.tasks.length,
      "lesson-validation": splits["lesson-validation"].tasks.length,
      "frozen-test": splits["frozen-test"].tasks.length,
    },
    labels: count(
      oracles.map(({ gold }) => gold.verdict),
      ALL_LABELS,
    ) as Record<Verdict, number>,
    cases: count(
      oracles.map(({ protocol }) => protocol.case),
      ["cold", "evidence_reuse", "experience_reuse", "memory_trap"],
    ) as Record<MemoryCase, number>,
    failure_families: count(
      oracles.map(({ protocol }) => protocol.failure_family),
      ALL_FAMILIES,
    ) as Record<FailureFamily, number>,
    episodes: episodes.length,
  };

  if (validationIds.size !== 24) throw new Error("Validation selection contains duplicates");
  return { corpus, splits, episodes, stats };
}

function evidenceKeys(
  evidence: readonly { paper_id: string; sentence_ids: readonly number[] }[],
): Set<string> {
  return new Set(
    evidence.flatMap(({ paper_id, sentence_ids }) =>
      sentence_ids.map((sentenceId) => `${paper_id}:${sentenceId}`),
    ),
  );
}

function divide(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

export interface ScoreReport {
  tasks: number;
  accuracy: number;
  verdict_macro_f1: number;
  evidence_precision: number;
  evidence_recall: number;
  evidence_f1: number;
  unknown_accuracy: number;
  lesson_retrieval_rate: number;
  forbidden_evidence_use_rate: number;
  delta_vs_baseline?: number;
  memory_induced_regression_rate?: number;
  by_case: Record<string, { tasks: number; accuracy: number }>;
  by_failure_family: Record<string, { tasks: number; accuracy: number }>;
}

export function scorePredictions(
  oracles: readonly TaskOracle[],
  predictions: readonly Prediction[],
  baseline: readonly Prediction[] = [],
): ScoreReport {
  const oracleIds = new Set(oracles.map(({ task_id }) => task_id));
  const indexPredictions = (values: readonly Prediction[], name: string) => {
    const result = new Map<string, Prediction>();
    for (const prediction of values) {
      if (result.has(prediction.task_id)) {
        throw new Error(`Duplicate ${name} prediction for ${prediction.task_id}`);
      }
      if (!oracleIds.has(prediction.task_id)) {
        throw new Error(`Unexpected ${name} prediction for ${prediction.task_id}`);
      }
      if (!ALL_LABELS.includes(prediction.predicted_verdict)) {
        throw new Error(`Invalid ${name} verdict for ${prediction.task_id}`);
      }
      for (const evidence of prediction.predicted_evidence ?? []) {
        if (
          evidence.paper_id.length === 0 ||
          evidence.sentence_ids.some(
            (sentenceId) => !Number.isInteger(sentenceId) || sentenceId < 0,
          )
        ) {
          throw new Error(`Invalid ${name} evidence for ${prediction.task_id}`);
        }
      }
      result.set(prediction.task_id, prediction);
    }
    if (result.size !== oracles.length) {
      throw new Error(`Expected ${oracles.length} ${name} predictions, received ${result.size}`);
    }
    return result;
  };
  const predictionByTask = indexPredictions(predictions, "trained");
  const baselineByTask =
    baseline.length > 0 ? indexPredictions(baseline, "baseline") : new Map<string, Prediction>();
  let correct = 0;
  let evidenceTruePositive = 0;
  let predictedEvidence = 0;
  let goldEvidence = 0;
  let unknownCorrect = 0;
  let unknownTotal = 0;
  let lessonExpected = 0;
  let lessonUsed = 0;
  let forbiddenChecks = 0;
  let forbiddenUses = 0;
  let baselineCorrect = 0;
  let baselineRegressions = 0;
  const confusion = new Map<string, number>();
  const caseScores = new Map<string, { tasks: number; correct: number }>();
  const familyScores = new Map<string, { tasks: number; correct: number }>();

  for (const oracle of oracles) {
    const prediction = predictionByTask.get(oracle.task_id);
    if (!prediction) throw new Error(`Missing prediction for ${oracle.task_id}`);
    const isCorrect = prediction.predicted_verdict === oracle.gold.verdict;
    if (isCorrect) correct += 1;
    confusion.set(
      `${oracle.gold.verdict}:${prediction.predicted_verdict}`,
      (confusion.get(`${oracle.gold.verdict}:${prediction.predicted_verdict}`) ?? 0) + 1,
    );
    if (oracle.gold.verdict === "UNKNOWN") {
      unknownTotal += 1;
      if (isCorrect) unknownCorrect += 1;
    }

    const expectedEvidence = evidenceKeys(oracle.gold.evidence);
    const actualEvidence = evidenceKeys(prediction.predicted_evidence ?? []);
    goldEvidence += expectedEvidence.size;
    predictedEvidence += actualEvidence.size;
    evidenceTruePositive += [...actualEvidence].filter((key) => expectedEvidence.has(key)).length;

    const lessonFamily = oracle.protocol.expected_lesson_family;
    if (lessonFamily) {
      lessonExpected += 1;
      if ((prediction.used_lesson_families ?? []).includes(lessonFamily)) lessonUsed += 1;
    }
    if (oracle.protocol.forbidden_evidence_document_ids.length > 0) {
      forbiddenChecks += 1;
      if (
        (prediction.used_evidence_document_ids ?? []).some((id) =>
          oracle.protocol.forbidden_evidence_document_ids.includes(id),
        )
      ) {
        forbiddenUses += 1;
      }
    }

    const updateGroup = (map: Map<string, { tasks: number; correct: number }>, key: string) => {
      const current = map.get(key) ?? { tasks: 0, correct: 0 };
      current.tasks += 1;
      if (isCorrect) current.correct += 1;
      map.set(key, current);
    };
    updateGroup(caseScores, oracle.protocol.case);
    updateGroup(familyScores, oracle.protocol.failure_family);

    const baselinePrediction = baselineByTask.get(oracle.task_id);
    if (baselinePrediction?.predicted_verdict === oracle.gold.verdict) {
      baselineCorrect += 1;
      if (!isCorrect) baselineRegressions += 1;
    }
  }

  const perLabelF1 = ALL_LABELS.map((label) => {
    const tp = confusion.get(`${label}:${label}`) ?? 0;
    const fp = ALL_LABELS.filter((gold) => gold !== label).reduce(
      (sum, gold) => sum + (confusion.get(`${gold}:${label}`) ?? 0),
      0,
    );
    const fn = ALL_LABELS.filter((predicted) => predicted !== label).reduce(
      (sum, predicted) => sum + (confusion.get(`${label}:${predicted}`) ?? 0),
      0,
    );
    return divide(2 * tp, 2 * tp + fp + fn);
  });
  const evidencePrecision = divide(evidenceTruePositive, predictedEvidence);
  const evidenceRecall = divide(evidenceTruePositive, goldEvidence);
  const toGroups = (map: Map<string, { tasks: number; correct: number }>) =>
    Object.fromEntries(
      [...map].map(([key, value]) => [
        key,
        { tasks: value.tasks, accuracy: divide(value.correct, value.tasks) },
      ]),
    );
  const report: ScoreReport = {
    tasks: oracles.length,
    accuracy: divide(correct, oracles.length),
    verdict_macro_f1: perLabelF1.reduce((sum, value) => sum + value, 0) / perLabelF1.length,
    evidence_precision: evidencePrecision,
    evidence_recall: evidenceRecall,
    evidence_f1: divide(2 * evidencePrecision * evidenceRecall, evidencePrecision + evidenceRecall),
    unknown_accuracy: divide(unknownCorrect, unknownTotal),
    lesson_retrieval_rate: divide(lessonUsed, lessonExpected),
    forbidden_evidence_use_rate: divide(forbiddenUses, forbiddenChecks),
    by_case: toGroups(caseScores),
    by_failure_family: toGroups(familyScores),
  };
  if (baseline.length > 0) {
    const baselineAccuracy = divide(
      oracles.filter(
        (oracle) => baselineByTask.get(oracle.task_id)?.predicted_verdict === oracle.gold.verdict,
      ).length,
      oracles.length,
    );
    report.delta_vs_baseline = report.accuracy - baselineAccuracy;
    report.memory_induced_regression_rate = divide(baselineRegressions, baselineCorrect);
  }
  return report;
}
