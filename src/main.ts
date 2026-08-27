#!/usr/bin/env bun
import { main as scipiMain } from "#scipi/coding-agent";
import brandingFactory from "./branding.ts";

type SciPiMain = typeof scipiMain;

export type RunSciPiOptions = {
  runner?: SciPiMain;
};

export async function runSciPi(
  args: string[],
  options: RunSciPiOptions = {},
): Promise<void> {
  await (options.runner ?? scipiMain)(args, {
    extensionFactories: [brandingFactory],
  });
}

if (import.meta.main) {
  await runSciPi(process.argv.slice(2));
}
