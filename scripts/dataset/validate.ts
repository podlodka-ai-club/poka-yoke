import { resolve } from "node:path";
import { DATASET_ID } from "../../src/dataset/schema.ts";
import { validateDataset } from "../../src/dataset/validate.ts";

const root = resolve(process.argv[2] ?? `dataset/${DATASET_ID}`);
const summary = validateDataset(root);
console.log(JSON.stringify(summary, null, 2));
