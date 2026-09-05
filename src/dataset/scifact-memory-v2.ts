import { createHash } from "node:crypto";
import type { SciFactClaim, SciFactPaper } from "./scifact-memory.ts";
import {
  DATASET_V2_ID,
  SCHEMA_V2_VERSION,
  type V2FailureFamily,
  type V2GoldEvidence,
  type V2Language,
  type V2MemoryCase,
  type V2MemoryEpisode,
  type V2MemoryOperation,
  type V2PublicTask,
  type V2ScientificPaper,
  type V2Split,
  type V2TaskOracle,
  type V2Verdict,
} from "./v2-schema.ts";

export interface V2SourceClaim extends SciFactClaim {
  source_split: "train" | "dev";
}

export interface V2Translations {
  claims: Record<string, string>;
  passages: Record<
    string,
    {
      sentence_ids: number[];
      text: string[];
    }
  >;
}

export interface V2DatasetStats {
  total_tasks: number;
  corpus_documents: number;
  splits: Record<V2Split, number>;
  labels: Record<V2Verdict, number>;
  cases: Record<V2MemoryCase, number>;
  failure_families: Record<V2FailureFamily, number>;
  claim_languages: Record<V2Language, number>;
  memory_operations: Record<V2MemoryOperation, number>;
  episodes: number;
}

export interface V2DatasetBuild {
  corpus: V2ScientificPaper[];
  splits: Record<V2Split, { tasks: V2PublicTask[]; oracles: V2TaskOracle[] }>;
  episodes: V2MemoryEpisode[];
  stats: V2DatasetStats;
  desired_russian_task_ids: string[];
}

interface Pair {
  target: V2SourceClaim;
  anchor: V2SourceClaim;
  shared: number[];
}

interface RegisteredEpisode {
  episode: V2MemoryEpisode;
  anchors: V2SourceClaim[];
  shared: number[];
}

interface AnchorSelectionState {
  ids: Set<string>;
  familyCounts: Map<V2FailureFamily, number>;
}

const VERDICTS: V2Verdict[] = ["SUPPORT", "REFUTE", "UNKNOWN"];
const FAMILIES: V2FailureFamily[] = [
  "numeric_precision",
  "population_scope",
  "causal_language",
  "directionality",
  "negation",
  "evidence_sufficiency",
];

const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "been",
  "by",
  "for",
  "from",
  "has",
  "have",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "their",
  "this",
  "to",
  "was",
  "were",
  "with",
]);

function stableHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function stableOrder<T>(items: readonly T[], seed: string, key: (item: T) => string): T[] {
  return [...items].sort((left, right) =>
    stableHash(`${seed}:${key(left)}`).localeCompare(stableHash(`${seed}:${key(right)}`)),
  );
}

export function v2SourceKey(claim: Pick<V2SourceClaim, "source_split" | "id">): string {
  return `${claim.source_split}:${claim.id}`;
}

export function v2TaskId(claim: Pick<V2SourceClaim, "source_split" | "id">): string {
  return `task-${stableHash(`${DATASET_V2_ID}:${v2SourceKey(claim)}`).slice(0, 12)}`;
}

export function v2VerdictForClaim(claim: SciFactClaim): V2Verdict {
  const labels = Object.values(claim.evidence)
    .flat()
    .map(({ label }) => label);
  if (labels.length === 0) return "UNKNOWN";
  const unique = new Set(labels);
  if (unique.size !== 1) return "UNKNOWN";
  return labels[0] === "SUPPORT" ? "SUPPORT" : "REFUTE";
}

export function v2FailureFamilyForClaim(text: string): V2FailureFamily {
  const normalized = text.toLowerCase();
  if (
    /\b\d+\s*\/\s*\d{3,}\b|\b\d[\d,./]*\s+(?:base|baise)\s+pairs?\b|(?:^|\s)\d+(?:[.,]\d+)?\s*(?:%|percent|fold|times?|years?|days?|weeks?|months?|million|billion)\b|%|approximately|at least|at most|less than|more than|greater than/.test(
      normalized,
    )
  ) {
    return "numeric_precision";
  }
  if (/\b(?:not|no|lack|lacks|without|unrelated|uninvolved|insufficient|independent)\b/.test(normalized)) {
    return "negation";
  }
  if (
    /\b(?:mice|mouse|humans?|patients?|adults?|children|women|men|infants?|newborns?|rhesus|macaques?|rats?|elderly|adolescents?)\b/.test(
      normalized,
    )
  ) {
    return "population_scope";
  }
  if (/\b(?:caus\w*|leads?|results? in|driv\w*|induces?|determines?|responsible for)\b/.test(normalized)) {
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

function sourceDocumentIds(claim: SciFactClaim): Set<number> {
  return new Set([
    ...(claim.cited_doc_ids ?? []),
    ...Object.keys(claim.evidence).map(Number),
  ]);
}

function goldDocumentIds(claim: SciFactClaim): Set<number> {
  return new Set(Object.keys(claim.evidence).map(Number));
}

function intersection(left: ReadonlySet<number>, right: ReadonlySet<number>): number[] {
  return [...left].filter((value) => right.has(value));
}

function tokens(text: string): Set<string> {
  return new Set(
    (text.toLowerCase().match(/[a-zα-ωа-яё0-9]+/giu) ?? []).filter(
      (token) => token.length > 2 && !STOPWORDS.has(token),
    ),
  );
}

function lexicalCoverage(claim: string, passages: readonly string[]): number {
  const claimTokens = tokens(claim);
  if (claimTokens.size === 0) return 0;
  const passageTokens = tokens(passages.join(" "));
  return [...claimTokens].filter((token) => passageTokens.has(token)).length / claimTokens.size;
}

function claimPassages(claim: V2SourceClaim, papers: ReadonlyMap<number, SciFactPaper>): string[] {
  return [...sourceDocumentIds(claim)].flatMap(
    (documentId) => papers.get(documentId)?.abstract ?? [],
  );
}

function difficultyScore(
  claim: V2SourceClaim,
  papers: ReadonlyMap<number, SciFactPaper>,
): number {
  const verdict = v2VerdictForClaim(claim);
  const coverage = lexicalCoverage(claim.claim, claimPassages(claim, papers));
  const wordCount = tokens(claim.claim).size;
  const evidenceSentences = Object.values(claim.evidence)
    .flat()
    .reduce((sum, rationale) => sum + rationale.sentences.length, 0);
  const base = verdict === "UNKNOWN" ? coverage * 100 : (1 - coverage) * 100;
  return base + Math.min(wordCount, 24) + Math.min(evidenceSentences * 3, 15);
}

function eligibleClaim(
  claim: V2SourceClaim,
  papers: ReadonlyMap<number, SciFactPaper>,
): boolean {
  const documentIds = [...sourceDocumentIds(claim)];
  const wordCount = tokens(claim.claim).size;
  return (
    wordCount >= 5 &&
    wordCount <= 32 &&
    documentIds.length > 0 &&
    documentIds.every((id) => papers.has(id)) &&
    (v2VerdictForClaim(claim) === "UNKNOWN" || Object.keys(claim.evidence).length > 0)
  );
}

function ranked(
  claims: readonly V2SourceClaim[],
  papers: ReadonlyMap<number, SciFactPaper>,
  seed: string,
): V2SourceClaim[] {
  return [...claims].sort(
    (left, right) =>
      difficultyScore(right, papers) - difficultyScore(left, papers) ||
      stableHash(`${seed}:${v2SourceKey(left)}`).localeCompare(
        stableHash(`${seed}:${v2SourceKey(right)}`),
      ),
  );
}

function labelQuota(total: number, familyIndex: number): Record<V2Verdict, number> {
  const base = Math.floor(total / VERDICTS.length);
  const result = Object.fromEntries(VERDICTS.map((label) => [label, base])) as Record<
    V2Verdict,
    number
  >;
  for (let index = 0; index < total - base * VERDICTS.length; index += 1) {
    result[VERDICTS[(familyIndex + index) % VERDICTS.length]!] += 1;
  }
  return result;
}

function selectFamilyBalanced(
  candidates: readonly V2SourceClaim[],
  papers: ReadonlyMap<number, SciFactPaper>,
  perFamily: number,
  seed: string,
  excludedIds: ReadonlySet<string>,
  forbiddenDocuments: ReadonlySet<number>,
  initial: readonly V2SourceClaim[] = [],
): V2SourceClaim[] {
  const selected = [...initial];
  const selectedIds = new Set([...excludedIds, ...selected.map(v2SourceKey)]);
  for (const [familyIndex, family] of FAMILIES.entries()) {
    const existing = selected.filter(
      (candidate) => v2FailureFamilyForClaim(candidate.claim) === family,
    );
    if (existing.length > perFamily) {
      throw new Error(`${seed}: ${family} has ${existing.length} required tasks; max ${perFamily}`);
    }
    const quota = labelQuota(perFamily, familyIndex);
    const labelCounts = Object.fromEntries(
      VERDICTS.map((label) => [
        label,
        existing.filter((candidate) => v2VerdictForClaim(candidate) === label).length,
      ]),
    ) as Record<V2Verdict, number>;
    const pool = ranked(
      candidates.filter(
        (candidate) =>
          v2FailureFamilyForClaim(candidate.claim) === family &&
          !selectedIds.has(v2SourceKey(candidate)) &&
          intersection(sourceDocumentIds(candidate), forbiddenDocuments).length === 0,
      ),
      papers,
      `${seed}:${family}`,
    );
    while (existing.length < perFamily) {
      const preferred = VERDICTS.find((label) => labelCounts[label] < quota[label]);
      let index = pool.findIndex(
        (candidate) => preferred === undefined || v2VerdictForClaim(candidate) === preferred,
      );
      if (index === -1 && pool.length > 0) index = 0;
      if (index === -1) {
        throw new Error(`${seed}: not enough ${family}/${preferred ?? "any"} candidates`);
      }
      const candidate = pool.splice(index, 1)[0]!;
      existing.push(candidate);
      selected.push(candidate);
      selectedIds.add(v2SourceKey(candidate));
      labelCounts[v2VerdictForClaim(candidate)] += 1;
    }
  }
  return stableOrder(selected, `${seed}:combined`, v2SourceKey);
}

function selectPairs(
  dev: readonly V2SourceClaim[],
  train: readonly V2SourceClaim[],
  papers: ReadonlyMap<number, SciFactPaper>,
  kind: "evidence_reuse" | "memory_trap",
  count: number,
  excludedIds: ReadonlySet<string>,
  anchorState: AnchorSelectionState,
): Pair[] {
  const targets = ranked(
    dev.filter((claim) =>
      kind === "memory_trap"
        ? v2VerdictForClaim(claim) === "UNKNOWN"
        : v2VerdictForClaim(claim) !== "UNKNOWN",
    ),
    papers,
    `v2-pairs:${kind}`,
  );
  const pairs: Pair[] = [];
  const labelCounts: Record<V2Verdict, number> = { SUPPORT: 0, REFUTE: 0, UNKNOWN: 0 };
  for (const target of targets) {
    if (pairs.length >= count || excludedIds.has(v2SourceKey(target))) continue;
    const targetVerdict = v2VerdictForClaim(target);
    if (
      kind === "evidence_reuse" &&
      labelCounts[targetVerdict] >= count / 2
    ) {
      continue;
    }
    const targetDocuments = sourceDocumentIds(target);
    const targetGold = goldDocumentIds(target);
    const anchors = ranked(
      train.filter((anchor) => {
        if (excludedIds.has(v2SourceKey(anchor))) return false;
        const shared = intersection(
          kind === "memory_trap" ? goldDocumentIds(anchor) : goldDocumentIds(anchor),
          kind === "memory_trap" ? targetDocuments : targetGold,
        );
        return (
          v2VerdictForClaim(anchor) !== "UNKNOWN" &&
          shared.length > 0 &&
          (anchorState.ids.has(v2SourceKey(anchor)) ||
            (anchorState.familyCounts.get(v2FailureFamilyForClaim(anchor.claim)) ?? 0) < 10)
        );
      }),
      papers,
      `v2-anchor:${kind}:${v2SourceKey(target)}`,
    );
    const anchor = anchors[0];
    if (!anchor) continue;
    const shared = intersection(
      goldDocumentIds(anchor),
      kind === "memory_trap" ? targetDocuments : targetGold,
    );
    if (shared.length === 0) continue;
    pairs.push({ target, anchor, shared });
    labelCounts[targetVerdict] += 1;
    if (!anchorState.ids.has(v2SourceKey(anchor))) {
      anchorState.ids.add(v2SourceKey(anchor));
      const family = v2FailureFamilyForClaim(anchor.claim);
      anchorState.familyCounts.set(family, (anchorState.familyCounts.get(family) ?? 0) + 1);
    }
  }
  if (pairs.length !== count) {
    throw new Error(`Unable to create ${count} ${kind} pairs; created ${pairs.length}`);
  }
  return pairs;
}

function goldEvidence(
  claim: V2SourceClaim,
  papers: ReadonlyMap<number, SciFactPaper>,
): V2GoldEvidence[] {
  return Object.entries(claim.evidence).flatMap(([documentIdText, rationales]) => {
    const documentId = Number(documentIdText);
    const paper = papers.get(documentId);
    if (!paper) throw new Error(`Missing SciFact paper ${documentId}`);
    return rationales.map((rationale) => ({
      paper_id: `scifact:${documentId}`,
      sentence_ids: [...rationale.sentences],
      text: rationale.sentences.map((sentenceId) => {
        const sentence = paper.abstract[sentenceId];
        if (sentence === undefined) {
          throw new Error(`${v2SourceKey(claim)} references missing ${documentId}:${sentenceId}`);
        }
        return sentence;
      }),
    }));
  });
}

function assignRussianIds(
  learning: readonly V2SourceClaim[],
  validation: readonly V2SourceClaim[],
  experience: readonly V2SourceClaim[],
  evidencePairs: readonly Pair[],
  trapPairs: readonly Pair[],
): Set<string> {
  const result = new Set<string>();
  const addPerFamily = (claims: readonly V2SourceClaim[], count: number) => {
    for (const family of FAMILIES) {
      stableOrder(
        claims.filter((claim) => v2FailureFamilyForClaim(claim.claim) === family),
        `v2-russian:${family}:${count}`,
        v2SourceKey,
      )
        .slice(0, count)
        .forEach((claim) => result.add(v2TaskId(claim)));
    }
  };
  addPerFamily(learning, 2);
  addPerFamily(validation, 1);
  addPerFamily(experience, 2);
  stableOrder(
    evidencePairs.map(({ target }) => target),
    "v2-russian:evidence",
    v2SourceKey,
  )
    .slice(0, 4)
    .forEach((claim) => result.add(v2TaskId(claim)));
  stableOrder(
    trapPairs.map(({ target }) => target),
    "v2-russian:traps",
    v2SourceKey,
  )
    .slice(0, 4)
    .forEach((claim) => result.add(v2TaskId(claim)));
  return result;
}

function learningCases(items: readonly V2SourceClaim[]): V2MemoryCase[] {
  const seen = new Set<number>();
  return items.map((item) => {
    const shared = intersection(sourceDocumentIds(item), seen);
    let memoryCase: V2MemoryCase = "cold";
    if (shared.length > 0) {
      memoryCase = v2VerdictForClaim(item) === "UNKNOWN" ? "memory_trap" : "evidence_reuse";
    }
    sourceDocumentIds(item).forEach((id) => seen.add(id));
    return memoryCase;
  });
}

function operationForTrap(index: number): V2MemoryOperation {
  if (index < 4) return "none";
  if (index < 7) return "correct";
  return "reset";
}

export function buildDatasetV2(
  trainClaims: readonly SciFactClaim[],
  devClaims: readonly SciFactClaim[],
  sourcePapers: readonly SciFactPaper[],
  translations: V2Translations,
  excludedSourceKeys: ReadonlySet<string> = new Set(),
  allowMissingTranslations = false,
  reservedExperienceSourceKeys: ReadonlySet<string> = new Set(),
): V2DatasetBuild {
  const papers = new Map(sourcePapers.map((paper) => [paper.doc_id, paper]));
  const train = trainClaims
    .map<V2SourceClaim>((claim) => ({ ...claim, source_split: "train" }))
    .filter((claim) => eligibleClaim(claim, papers) && !excludedSourceKeys.has(v2SourceKey(claim)));
  const dev = devClaims
    .map<V2SourceClaim>((claim) => ({ ...claim, source_split: "dev" }))
    .filter((claim) => eligibleClaim(claim, papers) && !excludedSourceKeys.has(v2SourceKey(claim)));

  const anchorState: AnchorSelectionState = { ids: new Set(), familyCounts: new Map() };
  const trapPairs = selectPairs(
    dev,
    train,
    papers,
    "memory_trap",
    10,
    new Set([...excludedSourceKeys, ...reservedExperienceSourceKeys]),
    anchorState,
  );
  const trapTargetIds = new Set(trapPairs.map(({ target }) => v2SourceKey(target)));
  const evidencePairs = selectPairs(
    dev,
    train,
    papers,
    "evidence_reuse",
    14,
    new Set([...excludedSourceKeys, ...reservedExperienceSourceKeys, ...trapTargetIds]),
    anchorState,
  );
  const requiredAnchors = new Map<string, V2SourceClaim>();
  for (const { anchor } of [...evidencePairs, ...trapPairs]) {
    requiredAnchors.set(v2SourceKey(anchor), anchor);
  }
  const reservedExperienceDocuments = new Set(
    dev
      .filter((claim) => reservedExperienceSourceKeys.has(v2SourceKey(claim)))
      .flatMap((claim) => [...sourceDocumentIds(claim)]),
  );
  const learning = selectFamilyBalanced(
    train,
    papers,
    10,
    "v2-learning",
    excludedSourceKeys,
    reservedExperienceDocuments,
    [...requiredAnchors.values()],
  );
  const learningIds = new Set(learning.map(v2SourceKey));
  const learningDocuments = new Set(learning.flatMap((claim) => [...sourceDocumentIds(claim)]));
  const validation = selectFamilyBalanced(
    train,
    papers,
    4,
    "v2-validation",
    new Set([...excludedSourceKeys, ...learningIds]),
    learningDocuments,
  );
  const pairedTargetIds = new Set([
    ...evidencePairs.map(({ target }) => v2SourceKey(target)),
    ...trapPairs.map(({ target }) => v2SourceKey(target)),
  ]);
  const experience = selectFamilyBalanced(
    dev,
    papers,
    5,
    "v2-frozen-experience",
    new Set([...excludedSourceKeys, ...pairedTargetIds]),
    learningDocuments,
  );
  const occupiedFrozenIds = new Set([
    ...pairedTargetIds,
    ...experience.map(v2SourceKey),
  ]);
  const coldTargets = ranked(
    dev.filter(
      (candidate) =>
        !excludedSourceKeys.has(v2SourceKey(candidate)) &&
        !occupiedFrozenIds.has(v2SourceKey(candidate)) &&
        intersection(sourceDocumentIds(candidate), learningDocuments).length === 0,
    ),
    papers,
    "v2-frozen-cold",
  ).slice(0, 6);
  if (coldTargets.length !== 6) throw new Error("Unable to select six frozen cold controls");
  const frozen = stableOrder(
    [
      ...experience,
      ...evidencePairs.map(({ target }) => target),
      ...trapPairs.map(({ target }) => target),
      ...coldTargets,
    ],
    "v2-frozen-stream",
    v2SourceKey,
  );

  const russianTaskIds = assignRussianIds(
    learning,
    validation,
    experience,
    evidencePairs,
    trapPairs,
  );
  for (const claim of [...learning, ...validation, ...frozen]) {
    if (
      russianTaskIds.has(v2TaskId(claim)) &&
      translations.claims[v2SourceKey(claim)] === undefined &&
      !allowMissingTranslations
    ) {
      throw new Error(`Missing Russian claim translation for ${v2SourceKey(claim)}`);
    }
  }

  const episodes: V2MemoryEpisode[] = [];
  const episodeByTarget = new Map<string, RegisteredEpisode>();
  let episodeCounter = 1;
  const registerEpisode = (
    target: V2SourceClaim,
    anchors: readonly V2SourceClaim[],
    memoryCase: Exclude<V2MemoryCase, "cold">,
    shared: number[] = [],
    memoryOperation: V2MemoryOperation = "none",
  ) => {
    const episodeId = `episode-v2-${String(episodeCounter).padStart(3, "0")}`;
    episodeCounter += 1;
    const episode: V2MemoryEpisode = {
      schema_version: SCHEMA_V2_VERSION,
      dataset_id: DATASET_V2_ID,
      episode_id: episodeId,
      case: memoryCase,
      failure_family: v2FailureFamilyForClaim(target.claim),
      teach_task_ids: anchors.map(v2TaskId),
      target_task_id: v2TaskId(target),
      memory_operation: memoryOperation,
      constraints: {
        disjoint_papers: memoryCase === "experience_reuse",
        evidence_reuse_allowed: memoryCase === "evidence_reuse",
        frozen_target_unseen_in_v1: true,
      },
    };
    episodes.push(episode);
    episodeByTarget.set(v2TaskId(target), { episode, anchors: [...anchors], shared });
  };

  for (const target of validation) {
    const anchors = learning.filter(
      (candidate) =>
        v2FailureFamilyForClaim(candidate.claim) === v2FailureFamilyForClaim(target.claim) &&
        intersection(sourceDocumentIds(candidate), sourceDocumentIds(target)).length === 0,
    );
    registerEpisode(target, anchors, "experience_reuse");
  }
  for (const target of experience) {
    const anchors = learning.filter(
      (candidate) =>
        v2FailureFamilyForClaim(candidate.claim) === v2FailureFamilyForClaim(target.claim) &&
        intersection(sourceDocumentIds(candidate), sourceDocumentIds(target)).length === 0,
    );
    registerEpisode(target, anchors, "experience_reuse");
  }
  for (const { target, anchor, shared } of evidencePairs) {
    registerEpisode(target, [anchor], "evidence_reuse", shared);
  }
  const orderedTrapPairs = stableOrder(trapPairs, "v2-trap-operations", ({ target }) =>
    v2SourceKey(target),
  );
  for (const [index, { target, anchor, shared }] of orderedTrapPairs.entries()) {
    registerEpisode(target, [anchor], "memory_trap", shared, operationForTrap(index));
  }

  const learningCaseValues = learningCases(learning);
  const createTask = (
    source: V2SourceClaim,
    split: V2Split,
    sequenceIndex: number,
  ): { task: V2PublicTask; oracle: V2TaskOracle } => {
    const taskId = v2TaskId(source);
    const match = episodeByTarget.get(taskId);
    const language: V2Language = russianTaskIds.has(taskId) ? "ru" : "en";
    const memoryCase =
      split === "learning"
        ? learningCaseValues[sequenceIndex]!
        : (match?.episode.case ?? "cold");
    const memoryOperation = match?.episode.memory_operation ?? "none";
    const targetDocumentIds =
      memoryOperation === "none" ? [] : match!.shared.map((id) => `scifact:${id}`);
    const targetTaskIds = memoryOperation === "none" ? [] : match!.anchors.map(v2TaskId);
    const instruction =
      memoryOperation === "correct"
        ? "Пользователь исправил прошлую запись: сохранённое свидетельство относится только к исходному утверждению. Не переносите его на текущий claim без прямого entailment."
        : memoryOperation === "reset"
          ? "Пользователь сбросил память по этой теме. Не используйте ранее сохранённые выводы; заново проверьте текущий claim только по разрешённому корпусу."
          : null;
    const task: V2PublicTask = {
      schema_version: SCHEMA_V2_VERSION,
      dataset_id: DATASET_V2_ID,
      task_id: taskId,
      sequence_index: sequenceIndex,
      corpus_id: "scifact-memory-v2-corpus",
      claim: {
        text:
          language === "ru"
            ? (translations.claims[v2SourceKey(source)] ?? source.claim)
            : source.claim,
        language,
        domain: "biomedicine",
      },
      request_context: {
        user_role: Number.parseInt(stableHash(`${taskId}:role`).slice(0, 2), 16) % 2 === 0
          ? "student"
          : "research_staff",
        channel: Number.parseInt(stableHash(`${taskId}:channel`).slice(0, 2), 16) % 3 === 0
          ? "telegram"
          : "pi",
        response_language: "ru",
        evidence_granularity: "abstract-sentence",
      },
      memory_control: {
        operation: memoryOperation,
        scope:
          memoryOperation === "correct"
            ? "claim-evidence-relation"
            : memoryOperation === "reset"
              ? "topic"
              : "none",
        target_task_ids: targetTaskIds,
        target_document_ids: targetDocumentIds,
        instruction_ru: instruction,
      },
    };
    const oracle: V2TaskOracle = {
      schema_version: SCHEMA_V2_VERSION,
      dataset_id: DATASET_V2_ID,
      task_id: taskId,
      gold: {
        verdict: v2VerdictForClaim(source),
        evidence: goldEvidence(source, papers),
        candidate_document_ids: [...sourceDocumentIds(source)]
          .sort((left, right) => left - right)
          .map((id) => `scifact:${id}`),
      },
      protocol: {
        split,
        case: memoryCase,
        failure_family: v2FailureFamilyForClaim(source.claim),
        difficulty_tier: "memory-sensitive",
        episode_id: match?.episode.episode_id ?? null,
        related_task_ids: match?.anchors.map(v2TaskId) ?? [],
        expected_lesson_family:
          match?.episode.case === "experience_reuse"
            ? match.episode.failure_family
            : null,
        expected_evidence_document_ids:
          match?.episode.case === "evidence_reuse"
            ? match.shared.map((id) => `scifact:${id}`)
            : [],
        forbidden_evidence_document_ids:
          match?.episode.case === "memory_trap"
            ? match.shared.map((id) => `scifact:${id}`)
            : [],
        memory_operation: memoryOperation,
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
        original_claim_en: source.claim,
        claim_translation: language === "ru" ? "repository-maintained" : "none",
        selection: "difficulty-ranked-unseen-pool",
      },
    };
    return { task, oracle };
  };

  const buildSplit = (claims: readonly V2SourceClaim[], split: V2Split) => {
    const built = claims.map((source, index) => createTask(source, split, index));
    return {
      tasks: built.map(({ task }) => task),
      oracles: built.map(({ oracle }) => oracle),
    };
  };
  const splits: V2DatasetBuild["splits"] = {
    learning: buildSplit(learning, "learning"),
    "lesson-validation": buildSplit(validation, "lesson-validation"),
    "frozen-test": buildSplit(frozen, "frozen-test"),
  };

  const requiredDocumentIds = new Set<number>();
  for (const claim of [...learning, ...validation, ...frozen]) {
    sourceDocumentIds(claim).forEach((id) => requiredDocumentIds.add(id));
  }
  const distractors = stableOrder(
    sourcePapers.filter((paper) => !requiredDocumentIds.has(paper.doc_id)),
    "v2-corpus-distractors",
    (paper) => String(paper.doc_id),
  ).slice(0, Math.max(0, 1024 - requiredDocumentIds.size));
  const selectedPapers = [
    ...[...requiredDocumentIds].map((id) => papers.get(id)!),
    ...distractors,
  ].sort((left, right) => left.doc_id - right.doc_id);
  const corpus: V2ScientificPaper[] = selectedPapers.map((paper) => {
    const passage = translations.passages[`scifact:${paper.doc_id}`];
    return {
      paper_id: `scifact:${paper.doc_id}`,
      source: "SciFact",
      source_document_id: paper.doc_id,
      source_language: "en",
      title: paper.title,
      abstract_sentences: paper.abstract,
      structured: paper.structured,
      localized_passages: passage
        ? [
            {
              language: "ru",
              translation_kind: "repository-maintained",
              sentence_ids: passage.sentence_ids,
              text: passage.text,
            },
          ]
        : [],
    };
  });

  const oracles = Object.values(splits).flatMap(({ oracles }) => oracles);
  const tasks = Object.values(splits).flatMap(({ tasks }) => tasks);
  const count = <T extends string>(values: readonly T[], keys: readonly T[]) =>
    Object.fromEntries(keys.map((key) => [key, values.filter((value) => value === key).length]));
  const stats: V2DatasetStats = {
    total_tasks: tasks.length,
    corpus_documents: corpus.length,
    splits: {
      learning: splits.learning.tasks.length,
      "lesson-validation": splits["lesson-validation"].tasks.length,
      "frozen-test": splits["frozen-test"].tasks.length,
    },
    labels: count(
      oracles.map(({ gold }) => gold.verdict),
      VERDICTS,
    ) as Record<V2Verdict, number>,
    cases: count(
      oracles.map(({ protocol }) => protocol.case),
      ["cold", "evidence_reuse", "experience_reuse", "memory_trap"],
    ) as Record<V2MemoryCase, number>,
    failure_families: count(
      oracles.map(({ protocol }) => protocol.failure_family),
      FAMILIES,
    ) as Record<V2FailureFamily, number>,
    claim_languages: count(
      tasks.map(({ claim }) => claim.language),
      ["en", "ru"],
    ) as Record<V2Language, number>,
    memory_operations: count(
      tasks.map(({ memory_control }) => memory_control.operation),
      ["none", "correct", "reset"],
    ) as Record<V2MemoryOperation, number>,
    episodes: episodes.length,
  };
  return {
    corpus,
    splits,
    episodes,
    stats,
    desired_russian_task_ids: [...russianTaskIds].sort(),
  };
}
