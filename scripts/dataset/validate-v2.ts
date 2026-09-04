import { resolve } from "node:path";
import { validateDatasetV2 } from "../../src/dataset/validate-v2.ts";

const root = resolve(process.argv[2] ?? "dataset/scifact-memory-v2");
const v1Root = resolve("dataset/scifact-memory-v1");
console.log(JSON.stringify(validateDatasetV2(root, v1Root), null, 2));
