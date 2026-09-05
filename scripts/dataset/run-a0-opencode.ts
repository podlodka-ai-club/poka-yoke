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
must be empty. Use exactly these keys and no others:
{"task_id":"task-...","predicted_verdict":"SUPPORT|REFUTE|UNKNOWN","predicted_evidence":[{"paper_id":"scifact:...","sentence_ids":[0]}],"used_evidence_document_ids":["scifact:..."],"used_lesson_families":[]}
For UNKNOWN, predicted_evidence may be an empty array.`;

const OPENCODE_CONFIG = {
  $schema: "https://opencode.ai/config.json",
  permission: {
    edit: "deny",
    webfetch: "deny",
    websearch: "deny",
    codesearch: "deny",
    external_directory: "deny",
  },
};

interface CliOptions {
  model: string;
  concurrency: number;
  outputRoot: string;
  limit?: number;
}

interface AttemptResult {
  prediction: Prediction;
  inputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cost: number;
  toolCalls: number;
}

function valueAfter(args: readonly string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (!value) throw new Error(`${flag} requires a value`);
  return value;
}

function parseOptions(args: readonly string[]): CliOptions {
  const model = valueAfter(args, "--model") ?? "commandcode/deepseek/deepseek-v4-flash";
  const concurrency = Number(valueAfter(args, "--concurrency") ?? "4");
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 16) {
    throw new Error("--concurrency must be an integer from 1 through 16");
  }
  const rawLimit = valueAfter(args, "--limit");
  const limit = rawLimit === undefined ? undefined : Number(rawLimit);
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) {
    throw new Error("--limit must be a positive integer");
  }
  const timestamp = new Date().toISOString().replaceAll(":", "-").replace(/\.\d{3}Z$/, "Z");
  const modelSlug = model.replaceAll("/", "-");
  const defaultOutput = join(
    projectRoot,
    "artifacts",
    DATASET_ID,
    `${modelSlug}-opencode-a0-${timestamp}`,
  );
  return {
    model,
    concurrency,
    outputRoot: resolve(valueAfter(args, "--output") ?? defaultOutput),
    limit,
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

function jsonObjects(text: string): unknown[] {
  const values: unknown[] = [];
  for (let start = 0; start < text.length; start += 1) {
    if (text[start] !== "{") continue;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let end = start; end < text.length; end += 1) {
      const character = text[end]!;
      if (inString) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === '"') inString = false;
        continue;
      }
      if (character === '"') inString = true;
      else if (character === "{") depth += 1;
      else if (character === "}") {
        depth -= 1;
        if (depth === 0) {
          try {
            values.push(JSON.parse(text.slice(start, end + 1)));
          } catch {
            // Keep looking for a later valid JSON object in the model's final text.
          }
          break;
        }
      }
    }
  }
  return values;
}

function resultFromTrace(trace: string, taskId: string): AttemptResult {
  let lastText = "";
  const usage = {
    inputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    cost: 0,
    toolCalls: 0,
  };
  for (const line of trace.split("\n")) {
    if (!line.trim()) continue;
    try {
      const event = JSON.parse(line) as {
        type?: string;
        part?: {
          text?: string;
          cost?: number;
          tokens?: {
            input?: number;
            output?: number;
            reasoning?: number;
            cache?: { read?: number; write?: number };
          };
        };
      };
      if (event.type === "text" && typeof event.part?.text === "string") {
        lastText = event.part.text;
      } else if (event.type === "tool_use") {
        usage.toolCalls += 1;
      } else if (event.type === "step_finish") {
        usage.inputTokens += event.part?.tokens?.input ?? 0;
        usage.outputTokens += event.part?.tokens?.output ?? 0;
        usage.reasoningTokens += event.part?.tokens?.reasoning ?? 0;
        usage.cacheReadTokens += event.part?.tokens?.cache?.read ?? 0;
        usage.cacheWriteTokens += event.part?.tokens?.cache?.write ?? 0;
        usage.cost += event.part?.cost ?? 0;
      }
    } catch {
      // The trace is retained verbatim; plugin diagnostics need not be JSON.
    }
  }
  const candidates = jsonObjects(lastText).reverse();
  const prediction = candidates.find(
    (value) => value && typeof value === "object" && "task_id" in value,
  );
  if (!prediction) throw new Error("OpenCode final text did not contain a prediction object");
  assertPrediction(prediction, taskId);
  return { prediction, ...usage };
}

async function runTask(
  opencodePath: string,
  task: PublicTask,
  options: CliOptions,
  tempRoot: string,
): Promise<AttemptResult> {
  const taskRoot = join(tempRoot, task.task_id);
  mkdirSync(taskRoot, { recursive: true });
  copyFileSync(corpusPath, join(taskRoot, "corpus.jsonl"));
  writeFileSync(join(taskRoot, "current_task.json"), `${JSON.stringify(task)}\n`);
  writeFileSync(join(taskRoot, "opencode.json"), `${JSON.stringify(OPENCODE_CONFIG, null, 2)}\n`);

  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const process = Bun.spawn(
      [
        opencodePath,
        "run",
        "--model",
        options.model,
        "--format",
        "json",
        "--dir",
        taskRoot,
        "--title",
        `scifact-a0-${task.task_id}-attempt-${attempt}`,
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
      if (exitCode !== 0) throw new Error(`opencode exited with ${exitCode}`);
      return resultFromTrace(trace, task.task_id);
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
  const opencodePath = Bun.which("opencode");
  if (!opencodePath) throw new Error("opencode CLI is not available in PATH");
  mkdirSync(join(options.outputRoot, "traces"), { recursive: true });
  mkdirSync(join(options.outputRoot, "stderr"), { recursive: true });

  const allTasks = readJsonLines<PublicTask>(tasksPath);
  const tasks = options.limit === undefined ? allTasks : allTasks.slice(0, options.limit);
  const startedAt = new Date();
  const tempRoot = mkdtempSync(join(tmpdir(), "scifact-memory-opencode-a0-"));
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
        results[index] = await runTask(opencodePath, task, options, tempRoot);
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
  const completeRun = tasks.length === allTasks.length;
  const score = completeRun
    ? scorePredictions(readJsonLines<TaskOracle>(oraclePath), predictions)
    : null;
  if (score) {
    writeFileSync(join(options.outputRoot, "score.json"), `${JSON.stringify(score, null, 2)}\n`);
  }

  const usage = results.reduce(
    (total, result) => ({
      input_tokens: total.input_tokens + result.inputTokens,
      cache_read_tokens: total.cache_read_tokens + result.cacheReadTokens,
      cache_write_tokens: total.cache_write_tokens + result.cacheWriteTokens,
      output_tokens: total.output_tokens + result.outputTokens,
      reasoning_tokens: total.reasoning_tokens + result.reasoningTokens,
      cost_reported_by_opencode: total.cost_reported_by_opencode + result.cost,
      tool_calls: total.tool_calls + result.toolCalls,
    }),
    {
      input_tokens: 0,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
      output_tokens: 0,
      reasoning_tokens: 0,
      cost_reported_by_opencode: 0,
      tool_calls: 0,
    },
  );
  const finishedAt = new Date();
  const metadata = {
    dataset_id: DATASET_ID,
    condition: "A0-clean-no-memory",
    model: options.model,
    provider: options.model.split("/", 1)[0],
    runner: "OpenCode",
    opencode_version: commandOutput([opencodePath, "--version"]),
    git_head: commandOutput(["git", "rev-parse", "HEAD"]),
    started_at: startedAt.toISOString(),
    finished_at: finishedAt.toISOString(),
    duration_seconds: (finishedAt.getTime() - startedAt.getTime()) / 1000,
    concurrency: options.concurrency,
    task_count: tasks.length,
    complete_frozen_test: completeRun,
    memory: { reads: false, writes: false, snapshot_id: null },
    isolation: {
      fresh_session_per_task: true,
      project_permissions: OPENCODE_CONFIG.permission,
      provider_plugin_loaded: true,
      model_files: ["current_task.json", "corpus.jsonl", "opencode.json"],
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
