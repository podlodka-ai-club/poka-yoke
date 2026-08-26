import { expect, test } from "bun:test";
import { main as piMain, type MainOptions } from "@earendil-works/pi-coding-agent";
import branding from "./branding.ts";
import { runSciPi } from "./main.ts";

test("forwards CLI args and exactly the SciPi branding extension", async () => {
  const calls: Array<{
    args: string[];
    options: MainOptions | undefined;
  }> = [];
  const runner: typeof piMain = async (args, options) => {
    calls.push({ args, options });
  };
  const args = ["--print", "hello"];

  await runSciPi(args, runner);

  expect(calls).toHaveLength(1);
  const call = calls[0];
  if (call === undefined) {
    throw new Error("Pi runner was not called");
  }

  expect(call.args).toEqual(args);
  expect(call.options?.extensionFactories).toHaveLength(1);
  expect(call.options?.extensionFactories?.[0]).toBe(branding);
});
