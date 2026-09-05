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
import { scoreV2Predictions } from "../../src/dataset/score-v2.ts";
import {
  DATASET_V2_ID,
  type V2Prediction,
  type V2PublicTask,
  type V2TaskOracle,
} from "../../src/dataset/v2-schema.ts";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const releaseRoot = join(projectRoot, "dataset", DATASET_V2_ID);
const corpusPath = join(releaseRoot, "corpus.jsonl");
const tasksPath = join(releaseRoot, "frozen-test", "tasks.jsonl");
const oraclePath = join(releaseRoot, "frozen-test", "oracle.jsonl");
const manifestPath = join(releaseRoot, "manifest.json");
const schemaPath = join(projectRoot, "dataset", "schema", "prediction-output-v2.schema.json");

const A0_PROMPT = `Это контролируемая A0-проверка научного утверждения с пустой памятью.
Не используй интернет, знания о прошлых задачах или внешние источники. Прочитай current_task.json
и ищи только в corpus.jsonl. SUPPORT означает, что предложения корпуса прямо подтверждают claim;
REFUTE — прямо ему противоречат; UNKNOWN — корпус не делает ни того, ни другого. Тематическая близость
не является доказательством. Проверь числа, популяцию, причинность, направление эффекта и отрицание.
Для evidence указывай точные paper_id и нумерацию abstract_sentences с нуля. Ответ и объяснение должны
быть на русском. Для UNKNOWN predicted_evidence обязан быть пустым, а uncertainty — кратко объяснять,
какого прямого evidence не хватает. Память в A0 отсутствует, поэтому used_evidence_memory_ids и
used_lesson_families всегда пусты. Выполни memory_control.instruction_ru, если оно задано, но не
симулируй наличие памяти. Верни только JSON с этими ключами:
{"task_id":"task-...","predicted_verdict":"SUPPORT|REFUTE|UNKNOWN","answer":{"language":"ru","explanation":"...","uncertainty":null},"predicted_evidence":[{"paper_id":"scifact:...","sentence_ids":[0],"stance":"SUPPORTS|REFUTES"}],"consulted_document_ids":["scifact:..."],"used_evidence_memory_ids":[],"used_lesson_families":[]}`;

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

interface Options {
  model: string;
  concurrency: number;
  outputRoot: string;
  limit?: number;
}

interface AttemptResult {
  prediction: V2Prediction;
  usage: {
    input_tokens: number;
    cache_read_tokens: number;
    cache_write_tokens: number;
    output_tokens: number;
    reasoning_tokens: number;
    cost_reported_by_opencode: number;
    tool_calls: number;
  };
}

function valueAfter(args: readonly string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (!value) throw new Error(`${flag} requires a value`);
  return value;
}

function options(args: readonly string[]): Options {
  const model = valueAfter(args, "--model") ?? "commandcode/deepseek/deepseek-v4-flash";
  const concurrency = Number(valueAfter(args, "--concurrency") ?? "6");
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 16) {
    throw new Error("--concurrency must be an integer from 1 through 16");
  }
  const rawLimit = valueAfter(args, "--limit");
  const limit = rawLimit ? Number(rawLimit) : undefined;
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) {
    throw new Error("--limit must be a positive integer");
  }
  const timestamp = new Date().toISOString().replaceAll(":", "-").replace(/\.\d{3}Z$/, "Z");
  return {
    model,
    concurrency,
    limit,
    outputRoot: resolve(
      valueAfter(args, "--output") ??
        join(
          projectRoot,
          "artifacts",
          DATASET_V2_ID,
          `${model.replaceAll("/", "-")}-opencode-a0-${timestamp}`,
        ),
    ),
  };
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function commandOutput(command: string[]): string {
  const result = Bun.spawnSync(command, { cwd: projectRoot, stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) throw new Error(result.stderr.toString());
  return result.stdout.toString().trim();
}

function jsonObjects(value: string): unknown[] {
  const objects: unknown[] = [];
  for (let start = 0; start < value.length; start += 1) {
    if (value[start] !== "{") continue;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let end = start; end < value.length; end += 1) {
      const character = value[end]!;
      if (inString) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === '"') inString = false;
      } else if (character === '"') inString = true;
      else if (character === "{") depth += 1;
      else if (character === "}" && --depth === 0) {
        try {
          objects.push(JSON.parse(value.slice(start, end + 1)));
        } catch {
          // Continue until a valid final JSON object is found.
        }
        break;
      }
    }
  }
  return objects;
}

function assertPrediction(value: unknown, taskId: string): asserts value is V2Prediction {
  if (!value || typeof value !== "object") throw new Error("Prediction is not an object");
  const prediction = value as Partial<V2Prediction>;
  if (prediction.task_id !== taskId) throw new Error(`Expected task_id ${taskId}`);
  if (!(["SUPPORT", "REFUTE", "UNKNOWN"] as string[]).includes(prediction.predicted_verdict ?? "")) {
    throw new Error(`Invalid verdict for ${taskId}`);
  }
  if (prediction.answer?.language !== "ru" || !prediction.answer.explanation) {
    throw new Error(`Missing Russian answer for ${taskId}`);
  }
  for (const field of [
    "predicted_evidence",
    "consulted_document_ids",
    "used_evidence_memory_ids",
    "used_lesson_families",
  ] as const) {
    if (!Array.isArray(prediction[field])) throw new Error(`Missing ${field} for ${taskId}`);
  }
  if (
    (prediction.used_evidence_memory_ids?.length ?? 0) > 0 ||
    (prediction.used_lesson_families?.length ?? 0) > 0
  ) {
    throw new Error(`A0 prediction ${taskId} must not use memory`);
  }
}

function parseTrace(trace: string, taskId: string): AttemptResult {
  let finalText = "";
  const usage: AttemptResult["usage"] = {
    input_tokens: 0,
    cache_read_tokens: 0,
    cache_write_tokens: 0,
    output_tokens: 0,
    reasoning_tokens: 0,
    cost_reported_by_opencode: 0,
    tool_calls: 0,
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
      if (event.type === "text" && event.part?.text) finalText = event.part.text;
      if (event.type === "tool_use") usage.tool_calls += 1;
      if (event.type === "step_finish") {
        usage.input_tokens += event.part?.tokens?.input ?? 0;
        usage.output_tokens += event.part?.tokens?.output ?? 0;
        usage.reasoning_tokens += event.part?.tokens?.reasoning ?? 0;
        usage.cache_read_tokens += event.part?.tokens?.cache?.read ?? 0;
        usage.cache_write_tokens += event.part?.tokens?.cache?.write ?? 0;
        usage.cost_reported_by_opencode += event.part?.cost ?? 0;
      }
    } catch {
      // Preserve malformed provider diagnostics in the trace without parsing them.
    }
  }
  const prediction = jsonObjects(finalText)
    .reverse()
    .find((candidate) => candidate && typeof candidate === "object" && "task_id" in candidate);
  assertPrediction(prediction, taskId);
  return { prediction, usage };
}

async function runTask(
  opencodePath: string,
  task: V2PublicTask,
  runOptions: Options,
  tempRoot: string,
): Promise<AttemptResult> {
  const taskRoot = join(tempRoot, task.task_id);
  mkdirSync(taskRoot, { recursive: true });
  copyFileSync(corpusPath, join(taskRoot, "corpus.jsonl"));
  writeFileSync(join(taskRoot, "current_task.json"), `${JSON.stringify(task)}\n`);
  writeFileSync(join(taskRoot, "opencode.json"), `${JSON.stringify(OPENCODE_CONFIG, null, 2)}\n`);
  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const child = Bun.spawn(
      [
        opencodePath,
        "run",
        "--model",
        runOptions.model,
        "--format",
        "json",
        "--dir",
        taskRoot,
        "--title",
        `scifact-v2-a0-${task.task_id}-${attempt}`,
        A0_PROMPT,
      ],
      { cwd: taskRoot, stdin: "ignore", stdout: "pipe", stderr: "pipe" },
    );
    const [exitCode, trace, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    writeFileSync(
      join(runOptions.outputRoot, "traces", `${task.task_id}.attempt-${attempt}.jsonl`),
      trace,
    );
    writeFileSync(
      join(runOptions.outputRoot, "stderr", `${task.task_id}.attempt-${attempt}.log`),
      stderr,
    );
    try {
      if (exitCode !== 0) throw new Error(`opencode exited with ${exitCode}`);
      return parseTrace(trace, task.task_id);
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`${task.task_id} failed after two attempts: ${String(lastError)}`);
}

async function main(): Promise<void> {
  const runOptions = options(process.argv.slice(2));
  if (existsSync(runOptions.outputRoot)) {
    throw new Error(`Refusing to overwrite existing output directory: ${runOptions.outputRoot}`);
  }
  const opencodePath = Bun.which("opencode");
  if (!opencodePath) throw new Error("opencode CLI is not available in PATH");
  mkdirSync(join(runOptions.outputRoot, "traces"), { recursive: true });
  mkdirSync(join(runOptions.outputRoot, "stderr"), { recursive: true });
  const allTasks = readJsonLines<V2PublicTask>(tasksPath);
  const tasks = runOptions.limit ? allTasks.slice(0, runOptions.limit) : allTasks;
  const results = new Array<AttemptResult>(tasks.length);
  const tempRoot = mkdtempSync(join(tmpdir(), "scifact-memory-v2-a0-"));
  const startedAt = new Date();
  let cursor = 0;
  try {
    await Promise.all(
      Array.from({ length: Math.min(runOptions.concurrency, tasks.length) }, async () => {
        while (true) {
          const index = cursor++;
          if (index >= tasks.length) return;
          const task = tasks[index]!;
          console.log(`[${index + 1}/${tasks.length}] ${task.task_id} started`);
          results[index] = await runTask(opencodePath, task, runOptions, tempRoot);
          console.log(
            `[${index + 1}/${tasks.length}] ${task.task_id} -> ${results[index]!.prediction.predicted_verdict}`,
          );
        }
      }),
    );
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
  const predictions = results.map(({ prediction }) => prediction);
  writeJsonLines(join(runOptions.outputRoot, "predictions.jsonl"), predictions);
  const complete = tasks.length === allTasks.length;
  const score = complete
    ? scoreV2Predictions(
        readJsonLines<V2TaskOracle>(oraclePath),
        allTasks,
        predictions,
      )
    : null;
  if (score) writeFileSync(join(runOptions.outputRoot, "score.json"), `${JSON.stringify(score, null, 2)}\n`);
  const usage = results.reduce(
    (total, result) => {
      for (const key of Object.keys(total) as Array<keyof typeof total>) total[key] += result.usage[key];
      return total;
    },
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
    dataset_id: DATASET_V2_ID,
    condition: "A0-clean-no-memory",
    model: runOptions.model,
    provider: runOptions.model.split("/", 1)[0],
    runner: "OpenCode",
    opencode_version: commandOutput([opencodePath, "--version"]),
    git_head: commandOutput(["git", "rev-parse", "HEAD"]),
    started_at: startedAt.toISOString(),
    finished_at: finishedAt.toISOString(),
    duration_seconds: (finishedAt.getTime() - startedAt.getTime()) / 1000,
    concurrency: runOptions.concurrency,
    task_count: tasks.length,
    complete_frozen_test: complete,
    memory: { reads: false, writes: false, snapshot_id: null },
    isolation: {
      fresh_session_per_task: true,
      project_permissions: OPENCODE_CONFIG.permission,
      model_files: ["current_task.json", "corpus.jsonl", "opencode.json"],
      oracle_exposed_to_model: false,
      consulted_document_ids_source: "model-output; informational only in A0",
    },
    hashes: {
      dataset_manifest_sha256: sha256(manifestPath),
      corpus_sha256: sha256(corpusPath),
      frozen_tasks_sha256: sha256(tasksPath),
      output_schema_sha256: sha256(schemaPath),
      runner_sha256: sha256(fileURLToPath(import.meta.url)),
      prompt_sha256: createHash("sha256").update(A0_PROMPT).digest("hex"),
    },
    usage,
  };
  writeFileSync(join(runOptions.outputRoot, "metadata.json"), `${JSON.stringify(metadata, null, 2)}\n`);
  console.log(JSON.stringify({ output: runOptions.outputRoot, score, usage }, null, 2));
}

await main();
