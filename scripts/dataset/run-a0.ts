import { createHash } from "node:crypto";
import {
  copyFileSync,
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
import { scorePredictions } from "../../src/dataset/scifact-memory.ts";
import {
  DATASET_ID,
  type Prediction,
  type PublicTask,
  type TaskOracle,
} from "../../src/dataset/schema.ts";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const releaseRoot = join(projectRoot, "dataset", DATASET_ID);
const corpusPath = join(releaseRoot, "corpus.jsonl");
const tasksPath = join(releaseRoot, "frozen-test", "tasks.jsonl");
const oraclePath = join(releaseRoot, "frozen-test", "oracle.jsonl");
const datasetManifestPath = join(releaseRoot, "manifest.json");
const outputSchemaPath = join(projectRoot, "dataset", "schema", "prediction-output.schema.json");

const A0_PROMPT = `This is a controlled A0 scientific claim-verification evaluation with empty memory.
Do not use the internet or prior-task memory. Read current_task.json and search only corpus.jsonl.
SUPPORT means the corpus entails the claim, REFUTE means it contradicts the claim, and UNKNOWN
means it does neither. Cite only exact corpus paper_id and zero-based abstract sentence_ids.
Return exactly the required JSON object. task_id must equal the task_id in current_task.json.
used_evidence_document_ids must list corpus documents actually relied on; used_lesson_families
must be empty.`;

interface CliOptions {
  model: string;
  reasoningEffort: string;
  concurrency: number;
  outputRoot: string;
}

interface AttemptResult {
  prediction: Prediction;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
}

function valueAfter(args: readonly string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (!value) throw new Error(`${flag} requires a value`);
  return value;
}

function parseOptions(args: readonly string[]): CliOptions {
  const model = valueAfter(args, "--model") ?? "gpt-5.6-luna";
  const reasoningEffort = valueAfter(args, "--reasoning-effort") ?? "medium";
  const concurrency = Number(valueAfter(args, "--concurrency") ?? "4");
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 16) {
    throw new Error("--concurrency must be an integer from 1 through 16");
  }
  const timestamp = new Date().toISOString().replaceAll(":", "-").replace(/\.\d{3}Z$/, "Z");
  const defaultOutput = join(
    projectRoot,
    "artifacts",
    DATASET_ID,
    `${model}-a0-${timestamp}`,
  );
  return {
    model,
    reasoningEffort,
    concurrency,
    outputRoot: resolve(valueAfter(args, "--output") ?? defaultOutput),
  };
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function commandOutput(command: string[]): string {
  const result = Bun.spawnSync(command, { cwd: projectRoot, stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) {
    throw new Error(`${command.join(" ")} failed: ${result.stderr.toString()}`);
  }
  return result.stdout.toString().trim();
}

function assertPrediction(value: unknown, taskId: string): asserts value is Prediction {
  if (!value || typeof value !== "object") throw new Error("Prediction is not an object");
  const prediction = value as Partial<Prediction>;
  if (prediction.task_id !== taskId) {
    throw new Error(`Expected task_id ${taskId}, received ${prediction.task_id}`);
  }
  if (!["SUPPORT", "REFUTE", "UNKNOWN"].includes(prediction.predicted_verdict ?? "")) {
    throw new Error(`Invalid verdict for ${taskId}`);
  }
  if (!Array.isArray(prediction.predicted_evidence)) {
    throw new Error(`Missing predicted_evidence for ${taskId}`);
  }
  if (!Array.isArray(prediction.used_evidence_document_ids)) {
    throw new Error(`Missing used_evidence_document_ids for ${taskId}`);
  }
  if (!Array.isArray(prediction.used_lesson_families) || prediction.used_lesson_families.length) {
    throw new Error(`A0 prediction ${taskId} must not use lessons`);
  }
}

function usageFromTrace(trace: string): Omit<AttemptResult, "prediction"> {
  let usage = {
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    reasoningOutputTokens: 0,
  };
  for (const line of trace.split("\n")) {
    if (!line.trim()) continue;
    try {
      const event = JSON.parse(line) as {
        type?: string;
        usage?: {
          input_tokens?: number;
          cached_input_tokens?: number;
          output_tokens?: number;
          reasoning_output_tokens?: number;
        };
      };
      if (event.type === "turn.completed" && event.usage) {
        usage = {
          inputTokens: event.usage.input_tokens ?? 0,
          cachedInputTokens: event.usage.cached_input_tokens ?? 0,
          outputTokens: event.usage.output_tokens ?? 0,
          reasoningOutputTokens: event.usage.reasoning_output_tokens ?? 0,
        };
      }
    } catch {
      // The trace is retained verbatim; a non-JSON diagnostic line has no usage data.
    }
  }
  return usage;
}

async function runTask(
  codexPath: string,
  task: PublicTask,
  options: CliOptions,
  tempRoot: string,
): Promise<AttemptResult> {
  const taskRoot = join(tempRoot, task.task_id);
  mkdirSync(taskRoot, { recursive: true });
  copyFileSync(corpusPath, join(taskRoot, "corpus.jsonl"));
  writeFileSync(join(taskRoot, "current_task.json"), `${JSON.stringify(task)}\n`);

  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const predictionPath = join(taskRoot, "prediction.json");
    const process = Bun.spawn(
      [
        codexPath,
        "exec",
        "--model",
        options.model,
        "-c",
        `model_reasoning_effort=${JSON.stringify(options.reasoningEffort)}`,
        "--ephemeral",
        "--ignore-user-config",
        "--ignore-rules",
        "--skip-git-repo-check",
        "--sandbox",
        "read-only",
        "--cd",
        taskRoot,
        "--output-schema",
        outputSchemaPath,
        "--output-last-message",
        predictionPath,
        "--json",
        A0_PROMPT,
      ],
      { cwd: taskRoot, stdin: "ignore", stdout: "pipe", stderr: "pipe" },
    );
    const [exitCode, trace, stderr] = await Promise.all([
      process.exited,
      new Response(process.stdout).text(),
      new Response(process.stderr).text(),
    ]);
    writeFileSync(
      join(options.outputRoot, "traces", `${task.task_id}.attempt-${attempt}.jsonl`),
      trace,
    );
    writeFileSync(
      join(options.outputRoot, "stderr", `${task.task_id}.attempt-${attempt}.log`),
      stderr,
    );
    try {
      if (exitCode !== 0) throw new Error(`codex exited with ${exitCode}`);
      if (!existsSync(predictionPath)) throw new Error("codex did not write a prediction");
      const prediction = JSON.parse(readFileSync(predictionPath, "utf8")) as unknown;
      assertPrediction(prediction, task.task_id);
      return { prediction, ...usageFromTrace(trace) };
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`${task.task_id} failed after two attempts: ${String(lastError)}`);
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  if (existsSync(options.outputRoot)) {
    throw new Error(`Refusing to overwrite existing output directory: ${options.outputRoot}`);
  }
  const codexPath = Bun.which("codex");
  if (!codexPath) throw new Error("codex CLI is not available in PATH");
  mkdirSync(join(options.outputRoot, "traces"), { recursive: true });
  mkdirSync(join(options.outputRoot, "stderr"), { recursive: true });

  const tasks = readJsonLines<PublicTask>(tasksPath);
  const startedAt = new Date();
  const tempRoot = mkdtempSync(join(tmpdir(), "scifact-memory-a0-"));
  const results = new Array<AttemptResult>(tasks.length);
  let cursor = 0;
  try {
    const workers = Array.from({ length: Math.min(options.concurrency, tasks.length) }, async () => {
      while (true) {
        const index = cursor;
        cursor += 1;
        if (index >= tasks.length) return;
        const task = tasks[index]!;
        console.log(`[${index + 1}/${tasks.length}] ${task.task_id} started`);
        results[index] = await runTask(codexPath, task, options, tempRoot);
        console.log(
          `[${index + 1}/${tasks.length}] ${task.task_id} -> ${results[index]!.prediction.predicted_verdict}`,
        );
      }
    });
    await Promise.all(workers);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }

  const predictions = results.map(({ prediction }) => prediction);
  writeJsonLines(join(options.outputRoot, "predictions.jsonl"), predictions);
  const oracles = readJsonLines<TaskOracle>(oraclePath);
  const score = scorePredictions(oracles, predictions);
  writeFileSync(join(options.outputRoot, "score.json"), `${JSON.stringify(score, null, 2)}\n`);

  const usage = results.reduce(
    (total, result) => ({
      input_tokens: total.input_tokens + result.inputTokens,
      cached_input_tokens: total.cached_input_tokens + result.cachedInputTokens,
      output_tokens: total.output_tokens + result.outputTokens,
      reasoning_output_tokens: total.reasoning_output_tokens + result.reasoningOutputTokens,
    }),
    { input_tokens: 0, cached_input_tokens: 0, output_tokens: 0, reasoning_output_tokens: 0 },
  );
  const finishedAt = new Date();
  const metadata = {
    dataset_id: DATASET_ID,
    condition: "A0-clean-no-memory",
    model: options.model,
    reasoning_effort: options.reasoningEffort,
    temperature: "Codex CLI default; not configurable for this run",
    codex_cli_version: commandOutput([codexPath, "--version"]),
    git_head: commandOutput(["git", "rev-parse", "HEAD"]),
    started_at: startedAt.toISOString(),
    finished_at: finishedAt.toISOString(),
    duration_seconds: (finishedAt.getTime() - startedAt.getTime()) / 1000,
    concurrency: options.concurrency,
    task_count: tasks.length,
    memory: { reads: false, writes: false, snapshot_id: null },
    isolation: {
      per_task_ephemeral_process: true,
      sandbox: "read-only",
      user_config_loaded: false,
      project_rules_loaded: false,
      model_files: ["current_task.json", "corpus.jsonl"],
      oracle_exposed_to_model: false,
    },
    hashes: {
      dataset_manifest_sha256: sha256(datasetManifestPath),
      corpus_sha256: sha256(corpusPath),
      frozen_tasks_sha256: sha256(tasksPath),
      output_schema_sha256: sha256(outputSchemaPath),
      runner_sha256: sha256(fileURLToPath(import.meta.url)),
      prompt_sha256: createHash("sha256").update(A0_PROMPT).digest("hex"),
    },
    usage,
  };
  writeFileSync(join(options.outputRoot, "metadata.json"), `${JSON.stringify(metadata, null, 2)}\n`);
  console.log(JSON.stringify({ output: options.outputRoot, score, usage }, null, 2));
}

await main();
