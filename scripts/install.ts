import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";

const PACKAGE_NAME = "@podlodka-ai-club/scipi";
const REPOSITORY = "podlodka-ai-club/poka-yoke";
const DEFAULT_REF = "main";
const MINIMUM_BUN_VERSION = [1, 3, 14] as const;
const REQUIRED_SOURCE_PATHS = [
  "package.json",
  "bun.lock",
  "src/main.ts",
  "scripts/build-scipi-distribution.ts",
  "scripts/install.ts",
] as const;

type JsonObject = Record<string, unknown>;

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isSupportedBunVersion(version: string): boolean {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(version);
  if (!match) return false;

  const current = match.slice(1, 4).map(Number);
  for (let index = 0; index < MINIMUM_BUN_VERSION.length; index += 1) {
    const difference = current[index]! - MINIMUM_BUN_VERSION[index]!;
    if (difference !== 0) return difference > 0;
  }
  return true;
}

export function archiveUrlForRef(ref: string): string {
  if (ref.length === 0) throw new Error("SCIPI_REF must not be empty");
  return `https://api.github.com/repos/${REPOSITORY}/tarball/${encodeURIComponent(ref)}`;
}

function readManifest(sourceRoot: string): JsonObject {
  const value: unknown = JSON.parse(
    readFileSync(join(sourceRoot, "package.json"), "utf8"),
  );
  if (!isJsonObject(value)) {
    throw new Error("SciPi package.json must contain an object");
  }
  if (value.name !== PACKAGE_NAME) {
    throw new Error(`Expected ${PACKAGE_NAME}, received ${String(value.name)}`);
  }
  if (typeof value.version !== "string" || value.version.length === 0) {
    throw new Error("SciPi package version must be a non-empty string");
  }
  return value;
}

function validateSourceRoot(sourceRoot: string): JsonObject {
  for (const relativePath of REQUIRED_SOURCE_PATHS) {
    const path = join(sourceRoot, relativePath);
    if (!existsSync(path)) throw new Error(`Missing installer input: ${path}`);
  }
  return readManifest(sourceRoot);
}

function packageIsInstalled(globalDir: string): boolean {
  const manifestPath = join(globalDir, "package.json");
  if (!existsSync(manifestPath)) return false;

  const manifest: unknown = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (!isJsonObject(manifest) || !isJsonObject(manifest.dependencies)) {
    return false;
  }
  return typeof manifest.dependencies[PACKAGE_NAME] === "string";
}

function findExtractedSourceRoot(extractDir: string): string {
  const candidates = readdirSync(extractDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(extractDir, entry.name))
    .filter((path) => existsSync(join(path, "package.json")));

  if (candidates.length !== 1) {
    throw new Error(
      `Expected one SciPi source directory in the archive, found ${candidates.length}`,
    );
  }
  return candidates[0]!;
}

async function downloadSource(workspace: string): Promise<string> {
  const ref = process.env.SCIPI_REF ?? DEFAULT_REF;
  const url = archiveUrlForRef(ref);
  console.log(`Downloading SciPi from ${REPOSITORY}@${ref}...`);

  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "scipi-installer",
    },
    redirect: "follow",
  });
  if (!response.ok) {
    throw new Error(`SciPi download failed: HTTP ${response.status}`);
  }

  const extractDir = join(workspace, "source");
  const archive = new Bun.Archive(await response.blob());
  await archive.extract(extractDir);
  return findExtractedSourceRoot(extractDir);
}

async function runBun(
  args: readonly string[],
  cwd: string,
  options: { capture?: boolean } = {},
): Promise<string> {
  const processHandle = Bun.spawn([process.execPath, ...args], {
    cwd,
    env: process.env,
    stdin: "inherit",
    stdout: options.capture ? "pipe" : "inherit",
    stderr: "inherit",
  });
  const output = options.capture
    ? new Response(processHandle.stdout).text()
    : Promise.resolve("");
  const [exitCode, stdout] = await Promise.all([processHandle.exited, output]);
  if (exitCode !== 0) {
    throw new Error(`bun ${args.join(" ")} failed with exit code ${exitCode}`);
  }
  return stdout.trim();
}

function localSourceArgument(args: readonly string[]): string | undefined {
  const sourceIndex = args.indexOf("--source");
  if (sourceIndex === -1) return undefined;

  const source = args[sourceIndex + 1];
  if (!source) throw new Error("--source requires a directory");
  if (args.length !== 2) throw new Error("Only --source <directory> is supported");
  return resolve(source);
}

function executableCandidates(binDir: string): string[] {
  if (process.platform === "win32") {
    return ["scipi.exe", "scipi.cmd", "scipi.ps1", "scipi"].map((name) =>
      join(binDir, name),
    );
  }
  return [join(binDir, "scipi")];
}

export function smokeCommandFor(
  executable: string,
  platform: NodeJS.Platform,
  environment: NodeJS.ProcessEnv,
): [string, ...string[]] {
  if (platform !== "win32" || executable.endsWith(".exe")) {
    return [executable, "--version"];
  }
  if (executable.endsWith(".cmd")) {
    return [
      environment.ComSpec ?? environment.COMSPEC ?? "cmd.exe",
      "/d",
      "/s",
      "/c",
      `"${executable}" --version`,
    ];
  }
  if (executable.endsWith(".ps1")) {
    return [
      "powershell.exe",
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      executable,
      "--version",
    ];
  }
  return [executable, "--version"];
}

async function smokeTestInstalledBinary(binDir: string): Promise<string> {
  const executable = executableCandidates(binDir).find(existsSync);
  if (!executable) {
    throw new Error(`SciPi executable was not created in ${binDir}`);
  }

  const [command, ...args] = smokeCommandFor(
    executable,
    process.platform,
    process.env,
  );

  const processHandle = Bun.spawn([command, ...args], {
    env: process.env,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "inherit",
  });
  const [exitCode, version] = await Promise.all([
    processHandle.exited,
    new Response(processHandle.stdout).text(),
  ]);
  if (exitCode !== 0) {
    throw new Error(`Installed SciPi failed its startup smoke test (${exitCode})`);
  }
  return version.trim();
}

function pathContains(directory: string): boolean {
  const normalize = (path: string) =>
    process.platform === "win32" ? resolve(path).toLowerCase() : resolve(path);
  const expected = normalize(directory);
  return (process.env.PATH ?? "")
    .split(delimiter)
    .filter(Boolean)
    .some((entry) => normalize(entry) === expected);
}

export function installerCacheDirectory(): string {
  const override = process.env.SCIPI_INSTALL_CACHE_DIR;
  if (override) return resolve(override);

  if (process.platform === "win32") {
    const localAppData =
      process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local");
    return join(localAppData, "SciPi", "installer");
  }
  return join(process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache"), "scipi");
}

export async function install(source?: string): Promise<void> {
  const bunVersion = process.versions.bun;
  if (!bunVersion || !isSupportedBunVersion(bunVersion)) {
    throw new Error(
      `SciPi requires Bun 1.3.14 or newer; found ${bunVersion ?? "unknown"}`,
    );
  }

  const globalDir = resolve(
    process.env.BUN_INSTALL_GLOBAL_DIR ??
      join(homedir(), ".bun", "install", "global"),
  );
  process.env.BUN_INSTALL_GLOBAL_DIR = globalDir;

  const workspace = mkdtempSync(join(tmpdir(), "scipi-install-"));
  const cacheDir = installerCacheDirectory();
  const tarballPath = join(cacheDir, "scipi-install.tgz");
  try {
    const sourceRoot = source ?? (await downloadSource(workspace));
    const manifest = validateSourceRoot(sourceRoot);
    const expectedVersion = manifest.version as string;
    const workspaceTarball = join(workspace, "scipi-install.tgz");

    await runBun(
      [
        "pm",
        "pack",
        "--ignore-scripts",
        "--filename",
        workspaceTarball,
        "--quiet",
      ],
      sourceRoot,
    );
    mkdirSync(cacheDir, { recursive: true });
    copyFileSync(workspaceTarball, tarballPath);
    if (packageIsInstalled(globalDir)) {
      await runBun(["install", "--force", "--cwd", globalDir], sourceRoot);
    } else {
      await runBun(
        ["add", "--global", "--trust", "--force", tarballPath],
        sourceRoot,
      );
    }

    const binDir = await runBun(["pm", "bin", "--global"], sourceRoot, {
      capture: true,
    });
    const installedVersion = await smokeTestInstalledBinary(binDir);
    if (installedVersion !== expectedVersion) {
      throw new Error(
        `Installed SciPi version ${installedVersion} does not match ${expectedVersion}`,
      );
    }

    console.log(`Installed SciPi ${installedVersion}.`);
    console.log(`Executable directory: ${binDir}`);
    if (!pathContains(binDir)) {
      if (process.platform === "win32") {
        console.log(`Add ${binDir} to your user PATH, then open a new terminal.`);
      } else {
        console.log(`Add to PATH: export PATH="${binDir}:$PATH"`);
      }
    }
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  install(localSourceArgument(process.argv.slice(2))).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`SciPi installation failed: ${message}`);
    process.exitCode = 1;
  });
}
