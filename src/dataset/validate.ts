import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { readJsonLines } from "./io.ts";
import {
  DATASET_ID,
  SCHEMA_VERSION,
  type DatasetSplit,
  type FailureFamily,
  type LessonCatalogEntry,
  type MemoryEpisode,
  type PublicTask,
  type ScientificPaper,
  type TaskOracle,
  type Verdict,
} from "./schema.ts";

const SPLITS: DatasetSplit[] = ["learning", "lesson-validation", "frozen-test"];
const VERDICTS = new Set<Verdict>(["SUPPORT", "REFUTE", "UNKNOWN"]);
const FAMILIES = new Set<FailureFamily>([
  "numeric_precision",
  "population_scope",
  "causal_language",
  "directionality",
  "negation",
  "evidence_sufficiency",
]);

interface DatasetManifest {
  dataset_id: string;
  schema_version: number;
  counts: {
    corpus_documents: number;
    tasks: number;
    episodes: number;
    splits: Record<DatasetSplit, number>;
  };
  artifact_sha256: Record<string, string>;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function hashFile(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export interface ValidationSummary {
  tasks: number;
  corpus_documents: number;
  episodes: number;
  splits: Record<DatasetSplit, number>;
}

export function validateDataset(root: string): ValidationSummary {
  const manifestPath = join(root, "manifest.json");
  assert(existsSync(manifestPath), `Missing ${manifestPath}`);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as DatasetManifest;
  assert(manifest.dataset_id === DATASET_ID, "Unexpected dataset_id in manifest");
  assert(manifest.schema_version === SCHEMA_VERSION, "Unexpected schema_version in manifest");

  for (const [relativePath, expectedHash] of Object.entries(manifest.artifact_sha256)) {
    const path = join(root, relativePath);
    assert(existsSync(path), `Manifest artifact is missing: ${relativePath}`);
    assert(hashFile(path) === expectedHash, `Artifact checksum mismatch: ${relativePath}`);
  }

  const corpus = readJsonLines<ScientificPaper>(join(root, "corpus.jsonl"));
  const paperById = new Map(corpus.map((paper) => [paper.paper_id, paper]));
  assert(paperById.size === corpus.length, "Duplicate paper_id in corpus");
  assert(corpus.length === manifest.counts.corpus_documents, "Corpus count differs from manifest");

  const taskById = new Map<string, PublicTask>();
  const oracleById = new Map<string, TaskOracle>();
  const splitCounts = {} as Record<DatasetSplit, number>;
  for (const split of SPLITS) {
    const tasks = readJsonLines<PublicTask>(join(root, split, "tasks.jsonl"));
    const oracles = readJsonLines<TaskOracle>(join(root, split, "oracle.jsonl"));
    assert(tasks.length === oracles.length, `${split}: task/oracle count mismatch`);
    assert(tasks.length === manifest.counts.splits[split], `${split}: manifest count mismatch`);
    splitCounts[split] = tasks.length;

    const localOracleIds = new Set(oracles.map(({ task_id }) => task_id));
    for (const [index, task] of tasks.entries()) {
      assert(task.schema_version === SCHEMA_VERSION, `${task.task_id}: schema version mismatch`);
      assert(task.dataset_id === DATASET_ID, `${task.task_id}: dataset mismatch`);
      assert(task.sequence_index === index, `${task.task_id}: non-contiguous sequence index`);
      assert(localOracleIds.has(task.task_id), `${task.task_id}: missing oracle`);
      assert(!taskById.has(task.task_id), `${task.task_id}: duplicate task`);
      const serialized = JSON.stringify(task);
      for (const forbidden of ["gold", "failure_family", "expected_lesson", "related_task_ids"]) {
        assert(!serialized.includes(forbidden), `${task.task_id}: public task leaks ${forbidden}`);
      }
      taskById.set(task.task_id, task);
    }

    for (const oracle of oracles) {
      assert(oracle.schema_version === SCHEMA_VERSION, `${oracle.task_id}: oracle schema mismatch`);
      assert(oracle.dataset_id === DATASET_ID, `${oracle.task_id}: oracle dataset mismatch`);
      assert(oracle.protocol.split === split, `${oracle.task_id}: split mismatch`);
      assert(VERDICTS.has(oracle.gold.verdict), `${oracle.task_id}: unknown verdict`);
      assert(FAMILIES.has(oracle.protocol.failure_family), `${oracle.task_id}: unknown family`);
      assert(!oracleById.has(oracle.task_id), `${oracle.task_id}: duplicate oracle`);
      assert(oracle.protocol.memory_read_allowed, `${oracle.task_id}: memory reads disabled`);
      assert(
        oracle.provenance.source_split === (split === "frozen-test" ? "dev" : "train"),
        `${oracle.task_id}: source split does not match protocol split`,
      );
      if (split === "learning") {
        assert(oracle.protocol.memory_write_allowed, `${oracle.task_id}: learning write disabled`);
        assert(
          oracle.protocol.allowed_memory_writes === "research-and-lessons",
          `${oracle.task_id}: invalid learning write scope`,
        );
        assert(oracle.protocol.reflection_allowed, `${oracle.task_id}: learning reflection disabled`);
        assert(oracle.protocol.episode_id === null, `${oracle.task_id}: learning task has episode`);
        assert(oracle.protocol.related_task_ids.length === 0, `${oracle.task_id}: learning task has relations`);
        assert(
          oracle.protocol.expected_lesson_family === null,
          `${oracle.task_id}: learning task exposes expected lesson`,
        );
      } else {
        assert(!oracle.protocol.memory_write_allowed, `${oracle.task_id}: held-out write enabled`);
        assert(!oracle.protocol.reflection_allowed, `${oracle.task_id}: held-out reflection enabled`);
        assert(
          oracle.protocol.allowed_memory_writes ===
            (split === "lesson-validation" ? "lesson-validation-only" : "none"),
          `${oracle.task_id}: invalid held-out write scope`,
        );
      }
      if (oracle.gold.verdict === "UNKNOWN") {
        assert(oracle.gold.evidence.length === 0, `${oracle.task_id}: UNKNOWN has gold evidence`);
      } else {
        assert(oracle.gold.evidence.length > 0, `${oracle.task_id}: labeled task lacks evidence`);
      }
      for (const evidence of oracle.gold.evidence) {
        const paper = paperById.get(evidence.paper_id);
        assert(paper, `${oracle.task_id}: missing paper ${evidence.paper_id}`);
        assert(
          oracle.gold.candidate_document_ids.includes(evidence.paper_id),
          `${oracle.task_id}: gold evidence is not a candidate document`,
        );
        assert(
          evidence.sentence_ids.length === evidence.text.length,
          `${oracle.task_id}: evidence sentence/text length mismatch`,
        );
        for (const [position, sentenceId] of evidence.sentence_ids.entries()) {
          assert(
            paper.abstract_sentences[sentenceId] === evidence.text[position],
            `${oracle.task_id}: evidence text mismatch at ${evidence.paper_id}:${sentenceId}`,
          );
        }
      }
      for (const documentId of oracle.gold.candidate_document_ids) {
        assert(paperById.has(documentId), `${oracle.task_id}: candidate paper ${documentId} absent`);
      }
      for (const documentId of [
        ...oracle.protocol.expected_evidence_document_ids,
        ...oracle.protocol.forbidden_evidence_document_ids,
      ]) {
        assert(
          oracle.gold.candidate_document_ids.includes(documentId),
          `${oracle.task_id}: protocol document ${documentId} is not a candidate`,
        );
      }
      oracleById.set(oracle.task_id, oracle);
    }
  }

  const episodes = readJsonLines<MemoryEpisode>(join(root, "episodes.jsonl"));
  const lessonCatalog = readJsonLines<LessonCatalogEntry>(join(root, "lesson-catalog.jsonl"));
  const catalogFamilies = new Set(lessonCatalog.map(({ lesson_family }) => lesson_family));
  assert(lessonCatalog.length === FAMILIES.size, "Lesson catalog must contain every family once");
  assert(catalogFamilies.size === lessonCatalog.length, "Duplicate lesson family in catalog");
  for (const entry of lessonCatalog) {
    assert(FAMILIES.has(entry.lesson_family), `Unknown lesson family ${entry.lesson_family}`);
    assert(entry.intended_use === "evaluator-only", `${entry.lesson_family}: unsafe catalog exposure`);
    assert(entry.canonical_rule.length > 0, `${entry.lesson_family}: empty canonical rule`);
  }
  const episodeIds = new Set<string>();
  const episodeTargetIds = new Set<string>();
  for (const episode of episodes) {
    assert(episode.schema_version === SCHEMA_VERSION, `${episode.episode_id}: schema mismatch`);
    assert(episode.dataset_id === DATASET_ID, `${episode.episode_id}: dataset mismatch`);
    assert(!episodeIds.has(episode.episode_id), `${episode.episode_id}: duplicate episode`);
    episodeIds.add(episode.episode_id);
    assert(!episodeTargetIds.has(episode.target_task_id), `${episode.target_task_id}: duplicate target`);
    episodeTargetIds.add(episode.target_task_id);
    assert(
      new Set(episode.teach_task_ids).size === episode.teach_task_ids.length,
      `${episode.episode_id}: duplicate teach tasks`,
    );
    const teaches = episode.teach_task_ids.map((taskId) => oracleById.get(taskId));
    const target = oracleById.get(episode.target_task_id);
    assert(teaches.length > 0, `${episode.episode_id}: episode has no teach tasks`);
    assert(
      teaches.every((teach) => teach?.protocol.split === "learning"),
      `${episode.episode_id}: teach task is not learning`,
    );
    assert(
      target?.protocol.split === "lesson-validation" || target?.protocol.split === "frozen-test",
      `${episode.episode_id}: target task is not held out`,
    );
    assert(target.protocol.episode_id === episode.episode_id, `${episode.episode_id}: target link mismatch`);
    assert(target.protocol.case === episode.case, `${episode.episode_id}: case mismatch`);
    assert(
      target.protocol.failure_family === episode.failure_family,
      `${episode.episode_id}: target family mismatch`,
    );
    assert(
      JSON.stringify(target.protocol.related_task_ids) === JSON.stringify(episode.teach_task_ids),
      `${episode.episode_id}: related teach tasks differ`,
    );
    const teachDocuments = new Set(
      teaches.flatMap((teach) => teach?.gold.candidate_document_ids ?? []),
    );
    const targetDocuments = new Set(target.gold.candidate_document_ids);
    const shared = [...teachDocuments].filter((id) => targetDocuments.has(id));
    if (episode.constraints.disjoint_papers) {
      assert(shared.length === 0, `${episode.episode_id}: experience episode leaks papers`);
      assert(
        teaches.every((teach) => teach?.protocol.failure_family === episode.failure_family),
        `${episode.episode_id}: experience episode family differs from teach tasks`,
      );
    }
    assert(
      episode.constraints.disjoint_papers === (episode.case === "experience_reuse"),
      `${episode.episode_id}: invalid paper-disjointness policy`,
    );
    assert(
      episode.constraints.evidence_reuse_allowed === (episode.case === "evidence_reuse"),
      `${episode.episode_id}: invalid evidence-reuse policy`,
    );
    if (episode.case === "experience_reuse") {
      assert(
        target.protocol.expected_lesson_family === episode.failure_family,
        `${episode.episode_id}: expected lesson family mismatch`,
      );
      assert(
        target.protocol.expected_evidence_document_ids.length === 0 &&
          target.protocol.forbidden_evidence_document_ids.length === 0,
        `${episode.episode_id}: experience transfer includes evidence hints`,
      );
    }
    if (episode.case === "evidence_reuse") {
      assert(
        target.protocol.expected_lesson_family === null &&
          target.protocol.forbidden_evidence_document_ids.length === 0,
        `${episode.episode_id}: evidence reuse includes unrelated expectations`,
      );
      assert(
        target.protocol.expected_evidence_document_ids.length > 0,
        `${episode.episode_id}: evidence reuse has no expected document`,
      );
      const teachGold = new Set(
        teaches.flatMap((teach) => teach?.gold.evidence.map(({ paper_id }) => paper_id) ?? []),
      );
      const targetGold = new Set(target.gold.evidence.map(({ paper_id }) => paper_id));
      for (const documentId of target.protocol.expected_evidence_document_ids) {
        assert(teachGold.has(documentId), `${episode.episode_id}: expected document not in teach gold`);
        assert(targetGold.has(documentId), `${episode.episode_id}: expected document not in target gold`);
      }
    }
    if (episode.case === "memory_trap") {
      assert(
        target.protocol.expected_lesson_family === null &&
          target.protocol.expected_evidence_document_ids.length === 0,
        `${episode.episode_id}: memory trap includes unrelated expectations`,
      );
      assert(
        target.protocol.forbidden_evidence_document_ids.length > 0,
        `${episode.episode_id}: memory trap has no forbidden document`,
      );
      const teachGold = new Set(
        teaches.flatMap((teach) => teach?.gold.evidence.map(({ paper_id }) => paper_id) ?? []),
      );
      const targetCandidates = new Set(target.gold.candidate_document_ids);
      for (const documentId of target.protocol.forbidden_evidence_document_ids) {
        assert(teachGold.has(documentId), `${episode.episode_id}: forbidden document not in teach gold`);
        assert(
          targetCandidates.has(documentId),
          `${episode.episode_id}: forbidden document is not a target candidate`,
        );
      }
    }
  }

  for (const oracle of oracleById.values()) {
    if (oracle.protocol.split === "learning") continue;
    assert(oracle.protocol.episode_id !== null, `${oracle.task_id}: held-out task has no episode`);
    assert(episodeIds.has(oracle.protocol.episode_id), `${oracle.task_id}: episode is absent`);
    assert(episodeTargetIds.has(oracle.task_id), `${oracle.task_id}: not registered as episode target`);
  }

  assert(taskById.size === manifest.counts.tasks, "Total task count differs from manifest");
  assert(episodes.length === manifest.counts.episodes, "Episode count differs from manifest");
  return {
    tasks: taskById.size,
    corpus_documents: corpus.length,
    episodes: episodes.length,
    splits: splitCounts,
  };
}
