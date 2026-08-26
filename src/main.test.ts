import { expect, test } from "bun:test";
import {
  CONFIG_DIR_NAME,
  main as piMain,
  type MainOptions,
} from "@earendil-works/pi-coding-agent";
import branding from "./branding.ts";
import { runSciPi, type MutableEnvironment } from "./main.ts";

interface CapturedCall {
  args: string[];
  options: MainOptions | undefined;
}

test("uses a separate SciPi project configuration directory", () => {
  expect(CONFIG_DIR_NAME).toBe(".scipi");
});

test("forwards CLI args and exactly the SciPi branding extension", async () => {
  const calls: CapturedCall[] = [];
  const runner: typeof piMain = async (args, options) => {
    calls.push({ args, options });
  };
  const environment: MutableEnvironment = {};
  const args = ["--print", "hello"];

  await runSciPi(args, { runner, environment, homeDir: "/home/test" });

  expect(calls).toHaveLength(1);
  const call = calls[0];
  if (call === undefined) {
    throw new Error("Pi runner was not called");
  }

  expect(call.args).toEqual(args);
  expect(call.options?.extensionFactories).toHaveLength(1);
  expect(call.options?.extensionFactories?.[0]).toBe(branding);
});

test("isolates default agent dir and clears inherited Pi session dir before running", async () => {
  const environment: MutableEnvironment = {
    PI_CODING_AGENT_DIR: "/pi/shared/agent",
    PI_CODING_AGENT_SESSION_DIR: "/pi/shared/sessions",
  };
  const calls: CapturedCall[] = [];
  let observedAgentDir: string | undefined;
  let observedSessionDir: string | undefined;
  const runner: typeof piMain = async (args, options) => {
    calls.push({ args, options });
    observedAgentDir = environment["PI_CODING_AGENT_DIR"];
    observedSessionDir = environment["PI_CODING_AGENT_SESSION_DIR"];
  };
  const args = ["--print", "hello"];

  await runSciPi(args, { runner, environment, homeDir: "/home/test" });

  expect(observedAgentDir).toBe("/home/test/.scipi/agent");
  expect(observedSessionDir).toBeUndefined();

  expect(calls).toHaveLength(1);
  const call = calls[0];
  if (call === undefined) {
    throw new Error("Pi runner was not called");
  }
  expect(call.args).toEqual(args);
});

test("copies nonempty SciPi overrides verbatim into Pi variables before running", async () => {
  const environment: MutableEnvironment = {
    PI_CODING_AGENT_DIR: "/pi/inherited/agent",
    PI_CODING_AGENT_SESSION_DIR: "/pi/inherited/sessions",
    SCIPI_AGENT_DIR: "/custom/scipi/agent",
    SCIPI_SESSION_DIR: "/custom/scipi/sessions",
  };
  const calls: CapturedCall[] = [];
  let observedAgentDir: string | undefined;
  let observedSessionDir: string | undefined;
  const runner: typeof piMain = async (args, options) => {
    calls.push({ args, options });
    observedAgentDir = environment["PI_CODING_AGENT_DIR"];
    observedSessionDir = environment["PI_CODING_AGENT_SESSION_DIR"];
  };
  const args = ["--print", "hello"];

  await runSciPi(args, { runner, environment, homeDir: "/home/test" });

  expect(observedAgentDir).toBe("/custom/scipi/agent");
  expect(observedSessionDir).toBe("/custom/scipi/sessions");

  expect(calls).toHaveLength(1);
  const call = calls[0];
  if (call === undefined) {
    throw new Error("Pi runner was not called");
  }
  expect(call.args).toEqual(args);
});

test("treats whitespace SciPi overrides as unset with default agent path and no Pi session", async () => {
  const environment: MutableEnvironment = {
    PI_CODING_AGENT_DIR: "/pi/inherited/agent",
    PI_CODING_AGENT_SESSION_DIR: "/pi/inherited/sessions",
    SCIPI_AGENT_DIR: "   ",
    SCIPI_SESSION_DIR: "\t\n ",
  };
  const calls: CapturedCall[] = [];
  let observedAgentDir: string | undefined;
  let observedSessionDir: string | undefined;
  const runner: typeof piMain = async (args, options) => {
    calls.push({ args, options });
    observedAgentDir = environment["PI_CODING_AGENT_DIR"];
    observedSessionDir = environment["PI_CODING_AGENT_SESSION_DIR"];
  };
  const args = ["--print", "hello"];

  await runSciPi(args, { runner, environment, homeDir: "/home/test" });

  expect(observedAgentDir).toBe("/home/test/.scipi/agent");
  expect(observedSessionDir).toBeUndefined();

  expect(calls).toHaveLength(1);
  const call = calls[0];
  if (call === undefined) {
    throw new Error("Pi runner was not called");
  }
  expect(call.args).toEqual(args);
});
