import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { readJsonLines } from "./io.ts";
import {
  DATASET_V2_ID,
  SCHEMA_V2_VERSION,
  type V2FailureFamily,
  type V2LessonCatalogEntry,
  type V2MemoryEpisode,
  type V2PublicTask,
  type V2ScientificPaper,
  type V2Split,
  type V2TaskOracle,
  type V2Verdict,
} from "./v2-schema.ts";

const SPLITS: V2Split[] = ["learning", "lesson-validation", "frozen-test"];
const VERDICTS = new Set<V2Verdict>(["SUPPORT", "REFUTE", "UNKNOWN"]);
const FAMILIES = new Set<V2FailureFamily>([
  "numeric_precision",
  "population_scope",
  "causal_language",
  "directionality",
  "negation",
  "evidence_sufficiency",
]);

interface V2Manifest {
  dataset_id: string;
  schema_version: number;
  source: {
    curation_sha256: string;
  };
  counts: {
    corpus_documents: number;
    localized_documents: number;
    tasks: number;
    episodes: number;
    splits: Record<V2Split, number>;
  };
  review: {
    frozen_semantic_review: "complete" | "pending";
    report: string;
    excluded_source_claims: number;
  };
  artifact_sha256: Record<string, string>;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function hashFile(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function numberTokens(text: string): Set<string> {
  const normalizedThousands = text.replace(/(\d) (?=\d{3}\b)/g, "$1");
  return new Set(
    (normalizedThousands.match(/(?:\d+(?:[.,·]\d+)?|[.,·]\d+)/g) ?? []).map(
      (value) => {
        const withLeadingZero = /^[.,·]/.test(value) ? `0${value}` : value;
        return withLeadingZero.replace(/[^\d]/g, "");
      },
    ),
  );
}

function assertNumbersPreserved(original: string, translated: string, context: string): void {
  const source = numberTokens(original);
  const target = numberTokens(translated);
  for (const number of source) {
    assert(target.has(number), `${context}: translation dropped numeric token ${number}`);
  }
}

export interface V2ValidationSummary {
  tasks: number;
  corpus_documents: number;
  localized_documents: number;
  russian_claims: number;
  episodes: number;
  splits: Record<V2Split, number>;
  frozen_cases: Record<string, number>;
}

export function validateDatasetV2(root: string, v1Root?: string): V2ValidationSummary {
  const manifestPath = join(root, "manifest.json");
  assert(existsSync(manifestPath), `Missing ${manifestPath}`);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as V2Manifest;
  assert(manifest.dataset_id === DATASET_V2_ID, "Unexpected v2 dataset_id in manifest");
  assert(manifest.schema_version === SCHEMA_V2_VERSION, "Unexpected v2 schema version");
  assert(
    manifest.review.frozen_semantic_review === "complete",
    "v2 frozen semantic review is not complete",
  );
  for (const [relativePath, expectedHash] of Object.entries(manifest.artifact_sha256)) {
    const path = join(root, relativePath);
    assert(existsSync(path), `Manifest artifact is missing: ${relativePath}`);
    assert(hashFile(path) === expectedHash, `Artifact checksum mismatch: ${relativePath}`);
  }
  const reviewText = readFileSync(join(root, manifest.review.report), "utf8");
  assert(!reviewText.includes("Review status: PENDING"), "v2 frozen review contains pending tasks");
  assert(
    (reviewText.match(/Review status: ACCEPTED/g) ?? []).length === 60,
    "v2 frozen review must contain 60 accepted tasks",
  );

  const corpus = readJsonLines<V2ScientificPaper>(join(root, "corpus.jsonl"));
  const paperById = new Map(corpus.map((paper) => [paper.paper_id, paper]));
  assert(paperById.size === corpus.length, "Duplicate v2 paper_id");
  assert(corpus.length === 1024, "v2 corpus must contain exactly 1024 documents");
  assert(corpus.length === manifest.counts.corpus_documents, "v2 corpus count differs from manifest");
  let localizedDocuments = 0;
  for (const paper of corpus) {
    assert(paper.source === "SciFact" && paper.source_language === "en", `${paper.paper_id}: source mismatch`);
    assert(paper.paper_id === `scifact:${paper.source_document_id}`, `${paper.paper_id}: unstable paper id`);
    if (paper.localized_passages.length > 0) localizedDocuments += 1;
    for (const passage of paper.localized_passages) {
      assert(passage.language === "ru", `${paper.paper_id}: localized passage is not Russian`);
      assert(/\p{Script=Cyrillic}/u.test(passage.text.join(" ")), `${paper.paper_id}: no Cyrillic translation`);
      assert(
        passage.sentence_ids.length === passage.text.length,
        `${paper.paper_id}: localized sentence/text mismatch`,
      );
      assert(
        new Set(passage.sentence_ids).size === passage.sentence_ids.length,
        `${paper.paper_id}: duplicate localized sentence id`,
      );
      for (const [position, sentenceId] of passage.sentence_ids.entries()) {
        const source = paper.abstract_sentences[sentenceId];
        assert(source !== undefined, `${paper.paper_id}: localized sentence ${sentenceId} absent`);
        assertNumbersPreserved(source, passage.text[position]!, `${paper.paper_id}:${sentenceId}`);
      }
    }
  }
  assert(localizedDocuments >= 20, "v2 must include at least 20 localized evidence documents");
  assert(localizedDocuments === manifest.counts.localized_documents, "localized document count mismatch");

  const taskById = new Map<string, V2PublicTask>();
  const oracleById = new Map<string, V2TaskOracle>();
  const splitCounts = {} as Record<V2Split, number>;
  let russianClaims = 0;
  for (const split of SPLITS) {
    const tasks = readJsonLines<V2PublicTask>(join(root, split, "tasks.jsonl"));
    const oracles = readJsonLines<V2TaskOracle>(join(root, split, "oracle.jsonl"));
    assert(tasks.length === oracles.length, `${split}: v2 task/oracle count mismatch`);
    assert(tasks.length === manifest.counts.splits[split], `${split}: v2 manifest count mismatch`);
    splitCounts[split] = tasks.length;
    const oracleIds = new Set(oracles.map(({ task_id }) => task_id));
    for (const [index, task] of tasks.entries()) {
      assert(task.schema_version === SCHEMA_V2_VERSION, `${task.task_id}: schema mismatch`);
      assert(task.dataset_id === DATASET_V2_ID, `${task.task_id}: dataset mismatch`);
      assert(task.sequence_index === index, `${task.task_id}: non-contiguous sequence index`);
      assert(task.corpus_id === "scifact-memory-v2-corpus", `${task.task_id}: corpus mismatch`);
      assert(!taskById.has(task.task_id), `${task.task_id}: duplicate task`);
      assert(oracleIds.has(task.task_id), `${task.task_id}: missing oracle`);
      assert(task.request_context.response_language === "ru", `${task.task_id}: answer not Russian`);
      assert(
        task.request_context.evidence_granularity === "abstract-sentence",
        `${task.task_id}: wrong evidence granularity`,
      );
      if (task.claim.language === "ru") {
        russianClaims += 1;
        assert(/\p{Script=Cyrillic}/u.test(task.claim.text), `${task.task_id}: RU claim has no Cyrillic`);
      }
      const serialized = JSON.stringify(task);
      for (const forbidden of [
        '"gold"',
        "failure_family",
        "expected_lesson",
        "difficulty_tier",
        "original_claim_en",
      ]) {
        assert(!serialized.includes(forbidden), `${task.task_id}: public task leaks ${forbidden}`);
      }
      const control = task.memory_control;
      if (control.operation === "none") {
        assert(
          control.scope === "none" &&
            control.target_task_ids.length === 0 &&
            control.target_document_ids.length === 0 &&
            control.instruction_ru === null,
          `${task.task_id}: empty operation contains a control payload`,
        );
      } else {
        assert(split === "frozen-test", `${task.task_id}: memory control outside frozen test`);
        assert(control.scope !== "none", `${task.task_id}: control scope missing`);
        assert(control.target_task_ids.length > 0, `${task.task_id}: control task targets missing`);
        assert(control.target_document_ids.length > 0, `${task.task_id}: control document targets missing`);
        assert(control.instruction_ru !== null, `${task.task_id}: control instruction missing`);
      }
      taskById.set(task.task_id, task);
    }

    for (const oracle of oracles) {
      assert(oracle.schema_version === SCHEMA_V2_VERSION, `${oracle.task_id}: oracle schema mismatch`);
      assert(oracle.dataset_id === DATASET_V2_ID, `${oracle.task_id}: oracle dataset mismatch`);
      assert(oracle.protocol.split === split, `${oracle.task_id}: split mismatch`);
      assert(VERDICTS.has(oracle.gold.verdict), `${oracle.task_id}: invalid verdict`);
      assert(FAMILIES.has(oracle.protocol.failure_family), `${oracle.task_id}: invalid family`);
      assert(!oracleById.has(oracle.task_id), `${oracle.task_id}: duplicate oracle`);
      assert(taskById.has(oracle.task_id), `${oracle.task_id}: public task absent`);
      assert(oracle.protocol.memory_read_allowed, `${oracle.task_id}: memory reads disabled`);
      assert(oracle.protocol.difficulty_tier === "memory-sensitive", `${oracle.task_id}: tier mismatch`);
      assert(
        oracle.provenance.source_split === (split === "frozen-test" ? "dev" : "train"),
        `${oracle.task_id}: source split mismatch`,
      );
      const publicTask = taskById.get(oracle.task_id)!;
      if (publicTask.claim.language === "ru") {
        assert(oracle.provenance.claim_translation === "repository-maintained", `${oracle.task_id}: translation provenance missing`);
        assertNumbersPreserved(
          oracle.provenance.original_claim_en,
          publicTask.claim.text,
          `${oracle.task_id}:claim`,
        );
      } else {
        assert(oracle.provenance.claim_translation === "none", `${oracle.task_id}: unexpected translation provenance`);
        assert(publicTask.claim.text === oracle.provenance.original_claim_en, `${oracle.task_id}: English claim changed`);
      }
      if (split === "learning") {
        assert(oracle.protocol.memory_write_allowed, `${oracle.task_id}: learning write disabled`);
        assert(oracle.protocol.reflection_allowed, `${oracle.task_id}: learning reflection disabled`);
        assert(oracle.protocol.allowed_memory_writes === "research-and-lessons", `${oracle.task_id}: learning write scope invalid`);
        assert(oracle.protocol.episode_id === null, `${oracle.task_id}: learning task has episode`);
      } else {
        assert(!oracle.protocol.memory_write_allowed, `${oracle.task_id}: held-out write enabled`);
        assert(!oracle.protocol.reflection_allowed, `${oracle.task_id}: held-out reflection enabled`);
        assert(
          oracle.protocol.allowed_memory_writes ===
            (split === "lesson-validation" ? "lesson-validation-only" : "none"),
          `${oracle.task_id}: held-out write scope invalid`,
        );
      }
      if (oracle.gold.verdict === "UNKNOWN") {
        assert(oracle.gold.evidence.length === 0, `${oracle.task_id}: UNKNOWN has evidence`);
      } else {
        assert(oracle.gold.evidence.length > 0, `${oracle.task_id}: labeled task lacks evidence`);
      }
      for (const evidence of oracle.gold.evidence) {
        const paper = paperById.get(evidence.paper_id);
        assert(paper, `${oracle.task_id}: missing paper ${evidence.paper_id}`);
        assert(
          oracle.gold.candidate_document_ids.includes(evidence.paper_id),
          `${oracle.task_id}: evidence paper is not a candidate`,
        );
        assert(evidence.sentence_ids.length === evidence.text.length, `${oracle.task_id}: evidence shape mismatch`);
        for (const [position, sentenceId] of evidence.sentence_ids.entries()) {
          assert(
            paper.abstract_sentences[sentenceId] === evidence.text[position],
            `${oracle.task_id}: evidence text mismatch at ${evidence.paper_id}:${sentenceId}`,
          );
        }
      }
      for (const documentId of oracle.gold.candidate_document_ids) {
        assert(paperById.has(documentId), `${oracle.task_id}: candidate paper absent: ${documentId}`);
      }
      assert(
        oracle.protocol.memory_operation === publicTask.memory_control.operation,
        `${oracle.task_id}: public/oracle operation mismatch`,
      );
      oracleById.set(oracle.task_id, oracle);
    }
  }
  assert(splitCounts.learning === 60, "v2 learning split must contain 60 tasks");
  assert(splitCounts["lesson-validation"] === 24, "v2 validation split must contain 24 tasks");
  assert(splitCounts["frozen-test"] === 60, "v2 frozen split must contain 60 tasks");
  assert(russianClaims === 38, "v2 must contain exactly 38 Russian claims");

  const episodes = readJsonLines<V2MemoryEpisode>(join(root, "episodes.jsonl"));
  const catalog = readJsonLines<V2LessonCatalogEntry>(join(root, "lesson-catalog.jsonl"));
  assert(catalog.length === FAMILIES.size, "v2 lesson catalog must contain six families");
  assert(new Set(catalog.map(({ lesson_family }) => lesson_family)).size === FAMILIES.size, "duplicate v2 lesson family");
  const episodeIds = new Set<string>();
  const targetIds = new Set<string>();
  for (const episode of episodes) {
    assert(episode.schema_version === SCHEMA_V2_VERSION, `${episode.episode_id}: schema mismatch`);
    assert(episode.dataset_id === DATASET_V2_ID, `${episode.episode_id}: dataset mismatch`);
    assert(!episodeIds.has(episode.episode_id), `${episode.episode_id}: duplicate episode`);
    assert(!targetIds.has(episode.target_task_id), `${episode.target_task_id}: duplicate episode target`);
    episodeIds.add(episode.episode_id);
    targetIds.add(episode.target_task_id);
    const teaches = episode.teach_task_ids.map((id) => oracleById.get(id));
    const target = oracleById.get(episode.target_task_id);
    assert(teaches.length > 0 && teaches.every((item) => item?.protocol.split === "learning"), `${episode.episode_id}: invalid teach tasks`);
    assert(target, `${episode.episode_id}: target absent`);
    assert(target.protocol.split !== "learning", `${episode.episode_id}: target is learning`);
    assert(target.protocol.episode_id === episode.episode_id, `${episode.episode_id}: target link mismatch`);
    assert(target.protocol.case === episode.case, `${episode.episode_id}: case mismatch`);
    assert(target.protocol.failure_family === episode.failure_family, `${episode.episode_id}: family mismatch`);
    assert(target.protocol.memory_operation === episode.memory_operation, `${episode.episode_id}: operation mismatch`);
    assert(
      JSON.stringify(target.protocol.related_task_ids) === JSON.stringify(episode.teach_task_ids),
      `${episode.episode_id}: related tasks mismatch`,
    );
    const teachDocuments = new Set(teaches.flatMap((item) => item?.gold.candidate_document_ids ?? []));
    const targetDocuments = new Set(target.gold.candidate_document_ids);
    const shared = [...teachDocuments].filter((id) => targetDocuments.has(id));
    if (episode.case === "experience_reuse") {
      assert(episode.constraints.disjoint_papers && shared.length === 0, `${episode.episode_id}: experience papers overlap`);
      assert(target.protocol.expected_lesson_family === episode.failure_family, `${episode.episode_id}: expected lesson mismatch`);
      assert(teaches.every((item) => item?.protocol.failure_family === episode.failure_family), `${episode.episode_id}: teach family mismatch`);
    } else {
      assert(!episode.constraints.disjoint_papers && shared.length > 0, `${episode.episode_id}: paired documents do not overlap`);
    }
    if (episode.case === "evidence_reuse") {
      assert(episode.constraints.evidence_reuse_allowed, `${episode.episode_id}: evidence reuse disabled`);
      assert(target.protocol.expected_evidence_document_ids.length > 0, `${episode.episode_id}: expected evidence absent`);
    }
    if (episode.case === "memory_trap") {
      assert(!episode.constraints.evidence_reuse_allowed, `${episode.episode_id}: trap permits reuse`);
      assert(target.gold.verdict === "UNKNOWN", `${episode.episode_id}: trap is not UNKNOWN`);
      assert(target.protocol.forbidden_evidence_document_ids.length > 0, `${episode.episode_id}: forbidden evidence absent`);
      assert(target.protocol.memory_operation === episode.memory_operation, `${episode.episode_id}: trap operation mismatch`);
    }
  }
  for (const oracle of oracleById.values()) {
    if (oracle.protocol.split === "learning" || oracle.protocol.case === "cold") continue;
    assert(oracle.protocol.episode_id !== null, `${oracle.task_id}: held-out pair has no episode`);
    assert(episodeIds.has(oracle.protocol.episode_id), `${oracle.task_id}: episode missing`);
  }

  const frozen = [...oracleById.values()].filter(({ protocol }) => protocol.split === "frozen-test");
  const frozenCases = Object.fromEntries(
    ["cold", "evidence_reuse", "experience_reuse", "memory_trap"].map((memoryCase) => [
      memoryCase,
      frozen.filter(({ protocol }) => protocol.case === memoryCase).length,
    ]),
  );
  assert(frozenCases.cold === 6, "v2 frozen set must contain six cold controls");
  assert(frozenCases.evidence_reuse === 14, "v2 frozen set must contain 14 evidence-reuse tasks");
  assert(frozenCases.experience_reuse === 30, "v2 frozen set must contain 30 experience tasks");
  assert(frozenCases.memory_trap === 10, "v2 frozen set must contain ten memory traps");
  for (const family of FAMILIES) {
    assert(
      frozen.filter(
        ({ protocol }) =>
          protocol.case === "experience_reuse" && protocol.failure_family === family,
      ).length === 5,
      `v2 experience slice must contain five ${family} targets`,
    );
  }
  assert(frozen.filter(({ protocol }) => protocol.memory_operation === "correct").length === 3, "v2 must contain three correction controls");
  assert(frozen.filter(({ protocol }) => protocol.memory_operation === "reset").length === 3, "v2 must contain three reset controls");

  const curationPath = join(root, "..", "authoring", "scifact-memory-v2-curation.json");
  if (existsSync(curationPath)) {
    const curation = JSON.parse(readFileSync(curationPath, "utf8")) as {
      excluded_source_keys: string[];
      reviewed_frozen_source_keys: string[];
    };
    assert(
      hashFile(curationPath) === manifest.source.curation_sha256,
      "v2 curation checksum differs from manifest",
    );
    const selectedKeys = new Set(
      [...oracleById.values()].map(
        ({ provenance }) => `${provenance.source_split}:${provenance.source_claim_id}`,
      ),
    );
    for (const excluded of curation.excluded_source_keys) {
      assert(!selectedKeys.has(excluded), `manually excluded source claim was selected: ${excluded}`);
    }
    const frozenKeys = new Set(
      frozen.map(({ provenance }) => `${provenance.source_split}:${provenance.source_claim_id}`),
    );
    const reviewedKeys = new Set(curation.reviewed_frozen_source_keys);
    assert(reviewedKeys.size === frozenKeys.size, "v2 reviewed frozen key count mismatch");
    assert(
      [...frozenKeys].every((key) => reviewedKeys.has(key)),
      "v2 reviewed frozen keys do not match the release",
    );
  }

  if (v1Root && existsSync(v1Root)) {
    const v1Keys = new Set<string>();
    for (const split of SPLITS) {
      const path = join(v1Root, split, "oracle.jsonl");
      for (const oracle of readJsonLines<{
        provenance: { source_split: string; source_claim_id: number };
      }>(path)) {
        v1Keys.add(`${oracle.provenance.source_split}:${oracle.provenance.source_claim_id}`);
      }
    }
    for (const oracle of oracleById.values()) {
      const key = `${oracle.provenance.source_split}:${oracle.provenance.source_claim_id}`;
      assert(!v1Keys.has(key), `${oracle.task_id}: source claim leaked from v1 calibration set`);
    }
  }

  assert(taskById.size === 144, "v2 must contain exactly 144 unique tasks");
  assert(taskById.size === manifest.counts.tasks, "v2 task count differs from manifest");
  assert(episodes.length === manifest.counts.episodes, "v2 episode count differs from manifest");
  return {
    tasks: taskById.size,
    corpus_documents: corpus.length,
    localized_documents: localizedDocuments,
    russian_claims: russianClaims,
    episodes: episodes.length,
    splits: splitCounts,
    frozen_cases: frozenCases,
  };
}
