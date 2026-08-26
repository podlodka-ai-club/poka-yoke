import { homedir } from "node:os";
import { join } from "node:path";
import { main as piMain } from "@earendil-works/pi-coding-agent";
import brandingFactory from "./branding.ts";

type PiMain = typeof piMain;

export const SCIPI_AGENT_DIR_ENV = "SCIPI_AGENT_DIR";
export const SCIPI_SESSION_DIR_ENV = "SCIPI_SESSION_DIR";
export const PI_AGENT_DIR_ENV = "PI_CODING_AGENT_DIR";
export const PI_SESSION_DIR_ENV = "PI_CODING_AGENT_SESSION_DIR";

export type MutableEnvironment = Record<string, string | undefined>;

export type SciPiPaths = {
  agentDir: string;
  sessionDir?: string;
};

const hasNonEmptyValue = (value: string | undefined): value is string =>
  value !== undefined && value.trim().length > 0;

export function configureSciPiEnvironment(
  environment: MutableEnvironment,
  homeDir: string,
): SciPiPaths {
  const scipiAgentDir = environment[SCIPI_AGENT_DIR_ENV];
  const agentDir = hasNonEmptyValue(scipiAgentDir)
    ? scipiAgentDir
    : join(homeDir, ".scipi", "agent");
  environment[PI_AGENT_DIR_ENV] = agentDir;

  const scipiSessionDir = environment[SCIPI_SESSION_DIR_ENV];
  const sessionDir = hasNonEmptyValue(scipiSessionDir)
    ? scipiSessionDir
    : undefined;
  if (sessionDir === undefined) {
    delete environment[PI_SESSION_DIR_ENV];
    return { agentDir };
  }

  environment[PI_SESSION_DIR_ENV] = sessionDir;
  return { agentDir, sessionDir };
}

export type RunSciPiOptions = {
  runner?: PiMain;
  environment?: MutableEnvironment;
  homeDir?: string;
};

export async function runSciPi(
  args: string[],
  options: RunSciPiOptions = {},
): Promise<void> {
  configureSciPiEnvironment(
    options.environment ?? process.env,
    options.homeDir ?? homedir(),
  );
  await (options.runner ?? piMain)(args, {
    extensionFactories: [brandingFactory],
  });
}

if (import.meta.main) {
  await runSciPi(process.argv.slice(2));
}
