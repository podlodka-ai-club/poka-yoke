import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readJsonLines, writeJsonLines } from "../../src/dataset/io.ts";
import type { SciFactClaim, SciFactPaper } from "../../src/dataset/scifact-memory.ts";
import {
  buildDatasetV2,
  type V2Translations,
} from "../../src/dataset/scifact-memory-v2.ts";
import {
  DATASET_V2_ID,
  SCHEMA_V2_VERSION,
  V2_FAILURE_FAMILY_LESSONS,
  type V2LessonCatalogEntry,
  type V2TaskOracle,
} from "../../src/dataset/v2-schema.ts";

const SOURCE_URL = "https://scifact.s3-us-west-2.amazonaws.com/release/latest/data.tar.gz";
const SOURCE_SHA256 = "11c621288d41ac144d29b13b0f8503b3820b7d6e8b1f6ff24dff335c196d76be";
const SOURCE_COMMIT = "68b98a56d93e0f9da0d2aab4e6c3294699a0f72e";
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const outputRoot = join(projectRoot, "dataset", DATASET_V2_ID);
const translationsPath = join(
  projectRoot,
  "dataset",
  "authoring",
  "scifact-memory-v2-translations.json",
);
const curationPath = join(
  projectRoot,
  "dataset",
  "authoring",
  "scifact-memory-v2-curation.json",
);

interface V2Curation {
  excluded_source_keys: string[];
  exclusion_reason: string;
  reserved_experience_source_keys: string[];
  review_notes: Record<string, string>;
  reviewed_frozen_source_keys: string[];
}

function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function valueAfter(args: readonly string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (!value) throw new Error(`${flag} requires a value`);
  return value;
}

async function downloadSciFact(workspace: string): Promise<string> {
  const response = await fetch(SOURCE_URL);
  if (!response.ok) throw new Error(`SciFact download failed: HTTP ${response.status}`);
  const blob = await response.blob();
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const actualHash = sha256(bytes);
  if (actualHash !== SOURCE_SHA256) {
    throw new Error(`SciFact archive checksum mismatch: ${actualHash}`);
  }
  const extractRoot = join(workspace, "source");
  mkdirSync(extractRoot, { recursive: true });
  await new Bun.Archive(blob).extract(extractRoot);
  return join(extractRoot, "data");
}

function requireSourceFiles(root: string): void {
  for (const name of ["corpus.jsonl", "claims_train.jsonl", "claims_dev.jsonl"]) {
    if (!existsSync(join(root, name))) throw new Error(`Missing SciFact source file: ${name}`);
  }
}

function v1SourceKeys(): Set<string> {
  const keys = new Set<string>();
  for (const split of ["learning", "lesson-validation", "frozen-test"]) {
    const path = join(projectRoot, "dataset", "scifact-memory-v1", split, "oracle.jsonl");
    if (!existsSync(path)) continue;
    for (const oracle of readJsonLines<{
      provenance: { source_split: string; source_claim_id: number };
    }>(path)) {
      keys.add(`${oracle.provenance.source_split}:${oracle.provenance.source_claim_id}`);
    }
  }
  return keys;
}

function artifactHash(path: string): string {
  return sha256(readFileSync(path));
}

function markdownCell(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ").trim();
}

function renderCurriculum(
  built: ReturnType<typeof buildDatasetV2>,
): string {
  const tasks = new Map(
    Object.values(built.splits)
      .flatMap(({ tasks: values }) => values)
      .map((task) => [task.task_id, task]),
  );
  const oracles = new Map(
    Object.values(built.splits)
      .flatMap(({ oracles: values }) => values)
      .map((oracle) => [oracle.task_id, oracle]),
  );
  const lines = [
    "# SciFact-Memory v2 curriculum report",
    "",
    "Evaluator-only. Do not expose this report to the researcher during a run.",
    "",
    "| Episode | Case | Operation | Family | Teach tasks | Target |",
    "|---|---|---|---|---:|---|",
  ];
  for (const episode of built.episodes) {
    const target = tasks.get(episode.target_task_id);
    const oracle = oracles.get(episode.target_task_id);
    if (!target || !oracle) throw new Error(`Missing target for ${episode.episode_id}`);
    lines.push(
      `| ${episode.episode_id} | ${episode.case} | ${episode.memory_operation} | ${episode.failure_family} | ${episode.teach_task_ids.length} | ${oracle.gold.verdict} / ${target.claim.language}: ${markdownCell(target.claim.text)} |`,
    );
  }
  lines.push("");
  return lines.join("\n");
}

function renderReview(
  built: ReturnType<typeof buildDatasetV2>,
  reviewedSourceKeys: ReadonlySet<string>,
): string {
  const lines = [
    "# SciFact-Memory v2 frozen semantic review",
    "",
    "This file is evaluator-only. It exposes gold labels and evidence.",
    "Every row must receive a review decision before the release is presented as curated.",
    "",
  ];
  for (const [index, task] of built.splits["frozen-test"].tasks.entries()) {
    const oracle = built.splits["frozen-test"].oracles[index]!;
    const sourceKey = `${oracle.provenance.source_split}:${oracle.provenance.source_claim_id}`;
    lines.push(
      `## ${task.task_id}`,
      "",
      `- Review status: ${reviewedSourceKeys.has(sourceKey) ? "ACCEPTED" : "PENDING"}`,
      `- Case/family: ${oracle.protocol.case} / ${oracle.protocol.failure_family}`,
      `- Language: ${task.claim.language}`,
      `- Gold: ${oracle.gold.verdict}`,
      `- Claim: ${task.claim.text}`,
      `- Original EN: ${oracle.provenance.original_claim_en}`,
      `- Source: SciFact ${oracle.provenance.source_split}:${oracle.provenance.source_claim_id}`,
      "",
    );
    if (oracle.gold.evidence.length === 0) {
      lines.push("Gold evidence: none (bounded-corpus UNKNOWN).", "");
    } else {
      lines.push("Gold evidence:", "");
      for (const evidence of oracle.gold.evidence) {
        for (const [position, sentenceId] of evidence.sentence_ids.entries()) {
          lines.push(
            `- ${evidence.paper_id}:${sentenceId} — ${evidence.text[position]!.trimEnd()}`,
          );
        }
      }
      lines.push("");
    }
  }
  return lines.join("\n");
}

function printTranslationPlan(built: ReturnType<typeof buildDatasetV2>): void {
  const taskById = new Map(
    Object.values(built.splits)
      .flatMap(({ tasks }) => tasks)
      .map((task) => [task.task_id, task]),
  );
  const oracleById = new Map(
    Object.values(built.splits)
      .flatMap(({ oracles }) => oracles)
      .map((oracle) => [oracle.task_id, oracle]),
  );
  const plan = built.desired_russian_task_ids.map((taskId) => {
    const task = taskById.get(taskId)!;
    const oracle = oracleById.get(taskId)!;
    return {
      task_id: taskId,
      source_key: `${oracle.provenance.source_split}:${oracle.provenance.source_claim_id}`,
      split: oracle.protocol.split,
      case: oracle.protocol.case,
      family: oracle.protocol.failure_family,
      original_claim_en: oracle.provenance.original_claim_en,
      gold_evidence: oracle.gold.evidence,
    };
  });
  console.log(JSON.stringify(plan, null, 2));
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const workspace = mkdtempSync(join(tmpdir(), "scifact-memory-v2-build-"));
  try {
    const sourceRoot = valueAfter(args, "--source")
      ? resolve(valueAfter(args, "--source")!)
      : await downloadSciFact(workspace);
    requireSourceFiles(sourceRoot);
    const papers = readJsonLines<SciFactPaper>(join(sourceRoot, "corpus.jsonl"));
    const train = readJsonLines<SciFactClaim>(join(sourceRoot, "claims_train.jsonl"));
    const dev = readJsonLines<SciFactClaim>(join(sourceRoot, "claims_dev.jsonl"));
    const translations = JSON.parse(readFileSync(translationsPath, "utf8")) as V2Translations;
    const curation = JSON.parse(readFileSync(curationPath, "utf8")) as V2Curation;
    const excludedSourceKeys = new Set([
      ...v1SourceKeys(),
      ...curation.excluded_source_keys,
    ]);
    const planOnly = args.includes("--translation-plan");
    const built = buildDatasetV2(
      train,
      dev,
      papers,
      translations,
      excludedSourceKeys,
      planOnly,
      new Set(curation.reserved_experience_source_keys),
    );
    if (planOnly) {
      printTranslationPlan(built);
      return;
    }

    mkdirSync(outputRoot, { recursive: true });
    for (const split of ["learning", "lesson-validation", "frozen-test"] as const) {
      const splitRoot = join(outputRoot, split);
      mkdirSync(splitRoot, { recursive: true });
      writeJsonLines(join(splitRoot, "tasks.jsonl"), built.splits[split].tasks);
      writeJsonLines(join(splitRoot, "oracle.jsonl"), built.splits[split].oracles);
    }
    writeJsonLines(join(outputRoot, "corpus.jsonl"), built.corpus);
    writeJsonLines(join(outputRoot, "episodes.jsonl"), built.episodes);
    const lessonCatalog: V2LessonCatalogEntry[] = Object.entries(
      V2_FAILURE_FAMILY_LESSONS,
    ).map(([lessonFamily, lesson]) => ({
      schema_version: SCHEMA_V2_VERSION,
      dataset_id: DATASET_V2_ID,
      lesson_family: lessonFamily as V2LessonCatalogEntry["lesson_family"],
      ...lesson,
      intended_use: "evaluator-only",
    }));
    writeJsonLines(join(outputRoot, "lesson-catalog.jsonl"), lessonCatalog);
    writeFileSync(join(outputRoot, "stats.json"), `${JSON.stringify(built.stats, null, 2)}\n`);
    writeFileSync(join(outputRoot, "CURRICULUM.md"), renderCurriculum(built));
    writeFileSync(
      join(outputRoot, "FROZEN_REVIEW.md"),
      renderReview(built, new Set(curation.reviewed_frozen_source_keys)),
    );

    const artifactPaths = [
      "corpus.jsonl",
      "episodes.jsonl",
      "lesson-catalog.jsonl",
      "stats.json",
      "CURRICULUM.md",
      "FROZEN_REVIEW.md",
      ...["learning", "lesson-validation", "frozen-test"].flatMap((split) => [
        `${split}/tasks.jsonl`,
        `${split}/oracle.jsonl`,
      ]),
    ];
    const artifactHashes = Object.fromEntries(
      artifactPaths.map((relativePath) => [
        relativePath,
        artifactHash(join(outputRoot, relativePath)),
      ]),
    );
    const localizedDocuments = built.corpus.filter(
      ({ localized_passages }) => localized_passages.length > 0,
    ).length;
    const frozenSourceKeys = new Set(
      built.splits["frozen-test"].oracles.map(
        ({ provenance }) => `${provenance.source_split}:${provenance.source_claim_id}`,
      ),
    );
    const reviewedSourceKeys = new Set(curation.reviewed_frozen_source_keys);
    const reviewComplete =
      frozenSourceKeys.size === reviewedSourceKeys.size &&
      [...frozenSourceKeys].every((sourceKey) => reviewedSourceKeys.has(sourceKey));
    const manifest = {
      dataset_id: DATASET_V2_ID,
      schema_version: SCHEMA_V2_VERSION,
      description:
        "Bilingual, memory-sensitive scientific claim evaluation for evidence reuse, procedural transfer, correction/reset, and grounded Russian answers",
      languages: {
        claims: ["en", "ru"],
        required_response: ["ru"],
        source_abstracts: ["en"],
        localized_evidence_passages: localizedDocuments > 0 ? ["ru"] : [],
        translation_notice:
          "Russian claims and localized passages are repository-maintained translations of SciFact English material, not native-language publications.",
      },
      source: {
        name: "SciFact",
        repository: "https://github.com/allenai/scifact",
        repository_commit: SOURCE_COMMIT,
        archive_url: SOURCE_URL,
        archive_sha256: SOURCE_SHA256,
        translations_sha256: artifactHash(translationsPath),
        curation_sha256: artifactHash(curationPath),
        licenses: {
          claims_and_annotations: "CC-BY-4.0",
          abstracts: "ODC-By-1.0",
          notice: "../THIRD_PARTY_LICENSES.md",
        },
      },
      generation: {
        deterministic: true,
        target_size: 144,
        corpus_size: 1024,
        excludes_all_v1_source_claims: true,
        official_test_used: false,
        selection: "difficulty-ranked within label/failure-family strata after manual rationale curation",
        calibration_policy:
          "v1 is calibration-only; v2 frozen claims are selected from source IDs absent from v1",
        primary_metric: "grounded_task_accuracy",
      },
      counts: {
        corpus_documents: built.corpus.length,
        localized_documents: localizedDocuments,
        tasks: built.stats.total_tasks,
        episodes: built.episodes.length,
        splits: built.stats.splits,
      },
      review: {
        frozen_semantic_review: reviewComplete ? "complete" : "pending",
        report: "FROZEN_REVIEW.md",
        excluded_source_claims: curation.excluded_source_keys.length,
      },
      artifact_sha256: artifactHashes,
    };
    writeFileSync(join(outputRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`Built ${DATASET_V2_ID}: ${JSON.stringify(built.stats)}`);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

await main();
