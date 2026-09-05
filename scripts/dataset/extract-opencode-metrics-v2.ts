import { readdirSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { writeJsonLines } from "../../src/dataset/io.ts";

const runRoot = resolve(process.argv[2] ?? "");
if (!process.argv[2]) {
  throw new Error("Usage: bun run scripts/dataset/extract-opencode-metrics-v2.ts <run-directory>");
}

interface TaskMetrics {
  task_id: string;
  duration_seconds: number;
  input_tokens: number;
  output_tokens: number;
  reasoning_tokens: number;
  tool_calls: number;
  corpus_search_calls: number;
}

const traceRoot = join(runRoot, "traces");
const metrics: TaskMetrics[] = [];
for (const file of readdirSync(traceRoot).filter((name) => name.endsWith(".attempt-1.jsonl"))) {
  const taskId = basename(file).replace(/\.attempt-1\.jsonl$/, "");
  let firstTimestamp = Number.POSITIVE_INFINITY;
  let lastTimestamp = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let reasoningTokens = 0;
  let toolCalls = 0;
  let corpusSearchCalls = 0;
  for (const line of readFileSync(join(traceRoot, file), "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const event = JSON.parse(line) as {
        type?: string;
        timestamp?: number;
        part?: {
          tool?: string;
          state?: { input?: unknown };
          tokens?: { input?: number; output?: number; reasoning?: number };
        };
      };
      if (event.timestamp !== undefined) {
        firstTimestamp = Math.min(firstTimestamp, event.timestamp);
        lastTimestamp = Math.max(lastTimestamp, event.timestamp);
      }
      if (event.type === "tool_use") {
        toolCalls += 1;
        if (
          event.part?.tool === "bash" &&
          JSON.stringify(event.part.state?.input ?? {}).includes("corpus.jsonl")
        ) {
          corpusSearchCalls += 1;
        }
      }
      if (event.type === "step_finish") {
        inputTokens += event.part?.tokens?.input ?? 0;
        outputTokens += event.part?.tokens?.output ?? 0;
        reasoningTokens += event.part?.tokens?.reasoning ?? 0;
      }
    } catch {
      // Provider diagnostics are retained but excluded from structured metrics.
    }
  }
  metrics.push({
    task_id: taskId,
    duration_seconds:
      Number.isFinite(firstTimestamp) && lastTimestamp >= firstTimestamp
        ? (lastTimestamp - firstTimestamp) / 1000
        : 0,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    reasoning_tokens: reasoningTokens,
    tool_calls: toolCalls,
    corpus_search_calls: corpusSearchCalls,
  });
}

metrics.sort((left, right) => left.task_id.localeCompare(right.task_id));
writeJsonLines(join(runRoot, "task-metrics.jsonl"), metrics);
console.log(`Wrote ${metrics.length} task metrics to ${join(runRoot, "task-metrics.jsonl")}`);
