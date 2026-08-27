import { expect, test } from "bun:test";
import {
  CONFIG_DIR_NAME,
  main as scipiMain,
  type MainOptions,
} from "#scipi/coding-agent";
import branding from "./branding.ts";
import { runSciPi } from "./main.ts";

interface CapturedCall {
  args: string[];
  options: MainOptions | undefined;
}

test("uses a separate SciPi project configuration directory", () => {
  expect(CONFIG_DIR_NAME).toBe(".scipi");
});

test("forwards CLI args and exactly the SciPi branding extension", async () => {
  const calls: CapturedCall[] = [];
  const runner: typeof scipiMain = async (args, options) => {
    calls.push({ args, options });
  };
  const args = ["--print", "hello"];

  await runSciPi(args, { runner });

  expect(calls).toHaveLength(1);
  const call = calls[0];
  if (call === undefined) {
    throw new Error("Pi runner was not called");
  }

  expect(call.args).toEqual(args);
  expect(call.options?.extensionFactories).toHaveLength(1);
  expect(call.options?.extensionFactories?.[0]).toBe(branding);
});

