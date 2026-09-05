import { resolve } from "node:path";
import { readJsonLines } from "../../src/dataset/io.ts";
import { scorePredictions } from "../../src/dataset/scifact-memory.ts";
import { DATASET_ID, type Prediction, type TaskOracle } from "../../src/dataset/schema.ts";

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
    "Usage: bun run dataset:score --predictions <jsonl> [--baseline <jsonl>] [--oracle <jsonl>]",
  );
}
const oraclePath = resolve(
  valueAfter(args, "--oracle") ?? `dataset/${DATASET_ID}/frozen-test/oracle.jsonl`,
);
const baselinePath = valueAfter(args, "--baseline");
const report = scorePredictions(
  readJsonLines<TaskOracle>(oraclePath),
  readJsonLines<Prediction>(resolve(predictionsPath)),
  baselinePath ? readJsonLines<Prediction>(resolve(baselinePath)) : [],
);
console.log(JSON.stringify(report, null, 2));
