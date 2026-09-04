import { readFileSync, writeFileSync } from "node:fs";

export function readJsonLines<T>(path: string): T[] {
  const content = readFileSync(path, "utf8").trim();
  if (content.length === 0) return [];
  return content.split("\n").map((line, index) => {
    try {
      return JSON.parse(line) as T;
    } catch (error) {
      throw new Error(`Invalid JSONL at ${path}:${index + 1}`, { cause: error });
    }
  });
}

export function writeJsonLines(path: string, values: readonly unknown[]): void {
  writeFileSync(path, `${values.map((value) => JSON.stringify(value)).join("\n")}\n`);
}
