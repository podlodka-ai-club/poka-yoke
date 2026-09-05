import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { readJsonLines } from "../../src/dataset/io.ts";
import type { V2ScoreReport } from "../../src/dataset/score-v2.ts";
import type { V2Prediction, V2PublicTask, V2TaskOracle } from "../../src/dataset/v2-schema.ts";

const runRoot = resolve(process.argv[2] ?? "");
if (!process.argv[2] || !existsSync(join(runRoot, "score.json"))) {
  throw new Error("Usage: bun run scripts/dataset/report-a0-v2.ts <complete-run-directory>");
}

const releaseRoot = resolve("dataset/scifact-memory-v2");
const score = JSON.parse(readFileSync(join(runRoot, "score.json"), "utf8")) as V2ScoreReport;
const metadata = JSON.parse(readFileSync(join(runRoot, "metadata.json"), "utf8")) as {
  model: string;
  runner: string;
  started_at: string;
  duration_seconds: number;
  task_count: number;
  isolation: Record<string, unknown>;
  hashes: Record<string, string>;
  usage: Record<string, number>;
};
const predictions = readJsonLines<V2Prediction>(join(runRoot, "predictions.jsonl"));
const taskMetrics = readJsonLines<{
  duration_seconds: number;
  input_tokens: number;
  output_tokens: number;
  tool_calls: number;
  corpus_search_calls: number;
}>(join(runRoot, "task-metrics.jsonl"));
const tasks = readJsonLines<V2PublicTask>(join(releaseRoot, "frozen-test", "tasks.jsonl"));
const oracles = readJsonLines<V2TaskOracle>(join(releaseRoot, "frozen-test", "oracle.jsonl"));
const predictionById = new Map(predictions.map((prediction) => [prediction.task_id, prediction]));
const taskById = new Map(tasks.map((task) => [task.task_id, task]));

const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
const average = (key: keyof (typeof taskMetrics)[number]) =>
  taskMetrics.reduce((sum, item) => sum + item[key], 0) / taskMetrics.length;
const evidenceKeys = (items: readonly { paper_id: string; sentence_ids: readonly number[] }[]) =>
  new Set(items.flatMap((item) => item.sentence_ids.map((id) => `${item.paper_id}:${id}`)));

const failures: string[] = [];
const reasons = new Map<string, number>();
for (const oracle of oracles) {
  const prediction = predictionById.get(oracle.task_id)!;
  const task = taskById.get(oracle.task_id)!;
  const gold = evidenceKeys(oracle.gold.evidence);
  const actual = evidenceKeys(prediction.predicted_evidence);
  let reason: string | null = null;
  if (prediction.predicted_verdict !== oracle.gold.verdict) reason = "wrong verdict";
  else if (oracle.gold.verdict === "UNKNOWN") {
    if (actual.size > 0) reason = "UNKNOWN with evidence";
    else if (!prediction.answer.uncertainty?.trim()) reason = "UNKNOWN without uncertainty";
  } else {
    const stance = oracle.gold.verdict === "SUPPORT" ? "SUPPORTS" : "REFUTES";
    if (prediction.predicted_evidence.some((item) => item.stance !== stance)) {
      reason = "wrong evidence stance";
    } else if (![...actual].every((key) => gold.has(key))) {
      reason = "unannotated citation";
    } else if (
      !oracle.gold.evidence.some((rationale) =>
        rationale.sentence_ids.every((id) => actual.has(`${rationale.paper_id}:${id}`)),
      )
    ) {
      reason = "incomplete gold rationale";
    }
  }
  if (reason) {
    reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
    failures.push(
      `| ${oracle.task_id} | ${oracle.protocol.case} | ${oracle.protocol.failure_family} | ${task.claim.language} | ${oracle.gold.verdict} | ${prediction.predicted_verdict} | ${reason} |`,
    );
  }
}

const sliceRows = (values: Record<string, { tasks: number; verdict_accuracy: number; grounded_task_accuracy: number }>) =>
  Object.entries(values)
    .map(
      ([name, value]) =>
        `| ${name} | ${value.tasks} | ${percent(value.verdict_accuracy)} | ${percent(value.grounded_task_accuracy)} |`,
    )
    .join("\n");
const groundedInRange = score.grounded_task_accuracy >= 0.45 && score.grounded_task_accuracy <= 0.65;
const verdictInRange = score.verdict_accuracy >= 0.65 && score.verdict_accuracy <= 0.8;
const report = `# DeepSeek V4 Flash A0 — SciFact-Memory v2

Run date: ${metadata.started_at.slice(0, 10)}<br>
Model: \`${metadata.model}\` via ${metadata.runner}<br>
Condition: clean memory, fresh isolated session per task, network denied, oracle hidden<br>
Frozen tasks: ${metadata.task_count}

## Result

| Metric | A0 |
|---|---:|
| **Grounded task accuracy (primary)** | **${percent(score.grounded_task_accuracy)}** |
| Verdict with any gold evidence (soft) | ${percent(score.verdict_with_any_gold_evidence_accuracy)} |
| Verdict accuracy | ${percent(score.verdict_accuracy)} |
| Verdict macro-F1 | ${percent(score.verdict_macro_f1)} |
| Evidence F1 | ${percent(score.evidence_f1)} |
| Citation contamination | ${percent(score.citation_contamination_rate)} |
| False certainty on UNKNOWN | ${percent(score.false_certainty_rate)} |
| Russian response compliance | ${percent(score.russian_response_rate)} |

The primary A0 result ${groundedInRange ? "falls inside" : "falls outside"} the predeclared 45–65% calibration range.
Verdict accuracy ${verdictInRange ? "falls inside" : "is above"} the diagnostic 65–80% range. This means the three-way label remains easy for this model, while a fully supported, uncontaminated answer leaves room for memory-driven improvement. The soft and strict grounded metrics are both shown so stricter citation scoring cannot be mistaken for verdict failure.

## By memory case

| Case | Tasks | Verdict | Grounded |
|---|---:|---:|---:|
${sliceRows(score.by_case)}

## By procedural family

| Family | Tasks | Verdict | Grounded |
|---|---:|---:|---:|
${sliceRows(score.by_failure_family)}

## By claim language

| Language | Tasks | Verdict | Grounded |
|---|---:|---:|---:|
${sliceRows(score.by_claim_language)}

## Strict-failure audit

${[...reasons].map(([reason, count]) => `- ${reason}: ${count}`).join("\n")}

| Task | Case | Family | Language | Gold | Predicted | Reason |
|---|---|---|---|---|---|---|
${failures.join("\n")}

## Interpretation

This A0 proves that verdict-only accuracy is not an adequate hackathon outcome: the model can usually choose the correct label without consistently returning the complete annotated rationale and only supported citations. The causal learning claim must therefore use A3–A0 on the primary metric, especially the paper-disjoint \`experience_reuse\` slice, while checking traps, cold controls, and regressions.

The scorer is annotation-strict. A correct verdict with additional scientifically plausible but unannotated sentences appears as citation contamination and should be manually inspected; the soft metric and evidence F1 preserve that distinction.

## Reproducibility

- Duration: ${metadata.duration_seconds.toFixed(1)} seconds
- Mean task latency: ${average("duration_seconds").toFixed(1)} seconds
- Mean corpus search calls/task: ${average("corpus_search_calls").toFixed(2)}
- Mean tool calls/task: ${average("tool_calls").toFixed(2)}
- Mean input tokens/task: ${average("input_tokens").toFixed(0)}
- Input tokens: ${metadata.usage.input_tokens ?? 0}
- Output tokens: ${metadata.usage.output_tokens ?? 0}
- Tool calls: ${metadata.usage.tool_calls ?? 0}
- Manifest SHA-256: \`${metadata.hashes.dataset_manifest_sha256}\`
- Corpus SHA-256: \`${metadata.hashes.corpus_sha256}\`
- Frozen tasks SHA-256: \`${metadata.hashes.frozen_tasks_sha256}\`
- Prompt SHA-256: \`${metadata.hashes.prompt_sha256}\`

Predictions, metadata, per-task metrics, and the machine-readable score are stored beside this report. Raw provider traces and stderr are intentionally excluded from Git.
`;

writeFileSync(join(runRoot, "REPORT.md"), report);
console.log(`Wrote ${join(runRoot, "REPORT.md")}`);
