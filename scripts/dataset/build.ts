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
import {
  buildDataset,
  type SciFactClaim,
  type SciFactPaper,
} from "../../src/dataset/scifact-memory.ts";
import {
  DATASET_ID,
  FAILURE_FAMILY_LESSONS,
  SCHEMA_VERSION,
  type LessonCatalogEntry,
} from "../../src/dataset/schema.ts";
import { validateDataset } from "../../src/dataset/validate.ts";

const SOURCE_URL = "https://scifact.s3-us-west-2.amazonaws.com/release/latest/data.tar.gz";
const SOURCE_SHA256 = "11c621288d41ac144d29b13b0f8503b3820b7d6e8b1f6ff24dff335c196d76be";
const SOURCE_COMMIT = "68b98a56d93e0f9da0d2aab4e6c3294699a0f72e";
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const outputRoot = join(projectRoot, "dataset", DATASET_ID);

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
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

function sourceArgument(args: readonly string[]): string | undefined {
  const index = args.indexOf("--source");
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (!value) throw new Error("--source requires a directory");
  return resolve(value);
}

function requireSourceFiles(root: string): void {
  for (const name of ["corpus.jsonl", "claims_train.jsonl", "claims_dev.jsonl"]) {
    if (!existsSync(join(root, name))) throw new Error(`Missing SciFact source file: ${name}`);
  }
}

function artifactHash(path: string): string {
  return sha256(readFileSync(path));
}

function markdownCell(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ").trim();
}

function renderCurriculumReport(built: ReturnType<typeof buildDataset>): string {
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
    "# SciFact-Memory v1 curriculum report",
    "",
    "This generated evaluator-only report makes every teach/target relation auditable.",
    "Do not expose it to the researcher during a run.",
    "",
    "| Episode | Case | Family | Learning curriculum | Target verdict and claim |",
    "|---|---|---|---|---|",
  ];
  for (const episode of built.episodes) {
    const targetTask = tasks.get(episode.target_task_id);
    const targetOracle = oracles.get(episode.target_task_id);
    const teachOracles = episode.teach_task_ids.map((taskId) => oracles.get(taskId));
    if (!targetTask || !targetOracle || teachOracles.some((oracle) => !oracle)) {
      throw new Error(`Unable to render ${episode.episode_id}`);
    }
    const teachLabels = Object.entries(
      Object.fromEntries(
        ["SUPPORT", "REFUTE", "UNKNOWN"].map((label) => [
          label,
          teachOracles.filter((oracle) => oracle?.gold.verdict === label).length,
        ]),
      ),
    )
      .filter(([, count]) => count > 0)
      .map(([label, count]) => `${label}=${count}`)
      .join(", ");
    lines.push(
      `| ${episode.episode_id} | ${episode.case} | ${episode.failure_family} | ${episode.teach_task_ids.length} tasks (${teachLabels}) | ${targetOracle.gold.verdict}: ${markdownCell(targetTask.claim.text)} |`,
    );
  }
  lines.push("", "## Learning stream", "", "| Task | Family | Verdict | Claim |", "|---|---|---|---|");
  for (const task of built.splits.learning.tasks) {
    const oracle = oracles.get(task.task_id);
    if (!oracle) throw new Error(`Unable to render learning task ${task.task_id}`);
    lines.push(
      `| ${task.task_id} | ${oracle.protocol.failure_family} | ${oracle.gold.verdict} | ${markdownCell(task.claim.text)} |`,
    );
  }
  lines.push("");
  return lines.join("\n");
}

async function main(): Promise<void> {
  const workspace = mkdtempSync(join(tmpdir(), "scifact-memory-build-"));
  try {
    const sourceRoot = sourceArgument(process.argv.slice(2)) ?? (await downloadSciFact(workspace));
    requireSourceFiles(sourceRoot);
    const papers = readJsonLines<SciFactPaper>(join(sourceRoot, "corpus.jsonl"));
    const train = readJsonLines<SciFactClaim>(join(sourceRoot, "claims_train.jsonl"));
    const dev = readJsonLines<SciFactClaim>(join(sourceRoot, "claims_dev.jsonl"));
    const built = buildDataset(train, dev, papers);

    mkdirSync(outputRoot, { recursive: true });
    for (const split of ["learning", "lesson-validation", "frozen-test"] as const) {
      const splitRoot = join(outputRoot, split);
      mkdirSync(splitRoot, { recursive: true });
      writeJsonLines(join(splitRoot, "tasks.jsonl"), built.splits[split].tasks);
      writeJsonLines(join(splitRoot, "oracle.jsonl"), built.splits[split].oracles);
    }
    writeJsonLines(join(outputRoot, "corpus.jsonl"), built.corpus);
    writeJsonLines(join(outputRoot, "episodes.jsonl"), built.episodes);
    const lessonCatalog: LessonCatalogEntry[] = Object.entries(
      FAILURE_FAMILY_LESSONS,
    ).map(([lessonFamily, canonicalRule]) => ({
      schema_version: SCHEMA_VERSION,
      dataset_id: DATASET_ID,
      lesson_family: lessonFamily as LessonCatalogEntry["lesson_family"],
      canonical_rule: canonicalRule,
      intended_use: "evaluator-only",
      matching_note:
        "Match a proposed lesson by meaning, not exact wording; never expose this catalog to the researcher before reflection.",
    }));
    writeJsonLines(join(outputRoot, "lesson-catalog.jsonl"), lessonCatalog);
    writeFileSync(join(outputRoot, "stats.json"), `${JSON.stringify(built.stats, null, 2)}\n`);
    writeFileSync(join(outputRoot, "CURRICULUM.md"), renderCurriculumReport(built));

    const artifactPaths = [
      "corpus.jsonl",
      "episodes.jsonl",
      "lesson-catalog.jsonl",
      "stats.json",
      "CURRICULUM.md",
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
    const manifest = {
      dataset_id: DATASET_ID,
      schema_version: SCHEMA_VERSION,
      description:
        "Scientific-claim learning curriculum and evaluation suite for evidence and experience memory",
      language: ["en"],
      source: {
        name: "SciFact",
        repository: "https://github.com/allenai/scifact",
        repository_commit: SOURCE_COMMIT,
        archive_url: SOURCE_URL,
        archive_sha256: SOURCE_SHA256,
        licenses: {
          claims_and_annotations: "CC-BY-4.0",
          abstracts: "ODC-By-1.0",
          notice: "../THIRD_PARTY_LICENSES.md",
        },
      },
      generation: {
        deterministic: true,
        target_size: 120,
        corpus_size: 512,
        official_test_used: false,
        label_mapping: {
          SUPPORT: "SUPPORT",
          CONTRADICT: "REFUTE",
          empty_evidence: "UNKNOWN",
          mixed_evidence: "UNKNOWN",
        },
      },
      counts: {
        corpus_documents: built.corpus.length,
        tasks: built.stats.total_tasks,
        episodes: built.episodes.length,
        splits: built.stats.splits,
      },
      artifact_sha256: artifactHashes,
    };
    writeFileSync(join(outputRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    const summary = validateDataset(outputRoot);
    console.log(`Built ${DATASET_ID}: ${JSON.stringify(summary)}`);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

await main();
