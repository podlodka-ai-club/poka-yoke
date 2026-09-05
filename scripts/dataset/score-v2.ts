import { resolve } from "node:path";
import { writeFileSync } from "node:fs";
import { readJsonLines } from "../../src/dataset/io.ts";
import { scoreV2Predictions } from "../../src/dataset/score-v2.ts";
import type { V2Prediction, V2PublicTask, V2TaskOracle } from "../../src/dataset/v2-schema.ts";

function valueAfter(args: readonly string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (!value) throw new Error(`${flag} requires a path`);
  return value;
}

const args = process.argv.slice(2);
const predictionsPath = valueAfter(args, "--predictions");
if (!predictionsPath) {
  throw new Error(
    "Usage: bun run dataset:score:v2 --predictions <jsonl> [--baseline <jsonl>] [--oracle <jsonl>] [--tasks <jsonl>] [--output <json>]",
  );
}
const root = "dataset/scifact-memory-v2/frozen-test";
const oraclePath = resolve(valueAfter(args, "--oracle") ?? `${root}/oracle.jsonl`);
const tasksPath = resolve(valueAfter(args, "--tasks") ?? `${root}/tasks.jsonl`);
const baselinePath = valueAfter(args, "--baseline");
const report = scoreV2Predictions(
  readJsonLines<V2TaskOracle>(oraclePath),
  readJsonLines<V2PublicTask>(tasksPath),
  readJsonLines<V2Prediction>(resolve(predictionsPath)),
  baselinePath ? readJsonLines<V2Prediction>(resolve(baselinePath)) : [],
);
const serialized = `${JSON.stringify(report, null, 2)}\n`;
const outputPath = valueAfter(args, "--output");
if (outputPath) writeFileSync(resolve(outputPath), serialized);
console.log(serialized.trimEnd());
