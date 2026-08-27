import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const UPSTREAM_PACKAGE_NAME =
  "@earendil-works/pi-coding-agent" as const;
export const SCIPI_PACKAGE_NAME =
  "@podlodka-ai-club/scipi-coding-agent" as const;
export const SCIPI_APP_NAME = "scipi" as const;
export const SCIPI_CONFIG_DIR = ".scipi" as const;

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const distributionDir = join(
  projectRoot,
  ".scipi-dist",
  "pi-coding-agent",
);

type JsonObject = Record<string, unknown>;

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readJsonObject(path: string): JsonObject {
  const value: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (!isJsonObject(value)) {
    throw new Error(`Expected a JSON object in ${path}`);
  }
  return value;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Expected ${field} to be a non-empty string`);
  }
  return value;
}

export function createSciPiManifest(source: JsonObject): JsonObject {
  const sourceName = requireString(source.name, "upstream package name");
  if (sourceName !== UPSTREAM_PACKAGE_NAME) {
    throw new Error(
      `Expected ${UPSTREAM_PACKAGE_NAME}, received ${sourceName}`,
    );
  }

  const piConfig = source.piConfig;
  if (!isJsonObject(piConfig) || piConfig.configDir !== ".pi") {
    throw new Error(
      "Upstream piConfig.configDir changed; review SciPi distribution isolation before upgrading",
    );
  }

  const distributionSource = { ...source };
  delete distributionSource.bin;

  return {
    ...distributionSource,
    name: SCIPI_PACKAGE_NAME,
    private: true,
    piConfig: {
      ...piConfig,
      name: SCIPI_APP_NAME,
      configDir: SCIPI_CONFIG_DIR,
    },
  };
}

function findPackageRoot(entrypoint: string): string {
  let current = dirname(entrypoint);

  while (true) {
    const manifestPath = join(current, "package.json");
    if (existsSync(manifestPath)) {
      const manifest = readJsonObject(manifestPath);
      if (manifest.name === UPSTREAM_PACKAGE_NAME) {
        return current;
      }
    }

    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }

  throw new Error(`Unable to locate ${UPSTREAM_PACKAGE_NAME} package root`);
}

function assertPinnedVersion(sourceManifest: JsonObject): void {
  const projectManifest = readJsonObject(join(projectRoot, "package.json"));
  const dependencies = projectManifest.dependencies;
  if (!isJsonObject(dependencies)) {
    throw new Error("Project dependencies are missing");
  }

  const expectedVersion = requireString(
    dependencies[UPSTREAM_PACKAGE_NAME],
    `${UPSTREAM_PACKAGE_NAME} dependency version`,
  );
  const sourceVersion = requireString(
    sourceManifest.version,
    "upstream package version",
  );
  if (sourceVersion !== expectedVersion) {
    throw new Error(
      `Installed ${UPSTREAM_PACKAGE_NAME}@${sourceVersion}, expected pinned ${expectedVersion}`,
    );
  }
}

function distributionIsCurrent(expectedManifest: JsonObject): boolean {
  const manifestPath = join(distributionDir, "package.json");
  const entrypointPath = join(distributionDir, "dist", "index.js");
  if (!existsSync(manifestPath) || !existsSync(entrypointPath)) return false;

  try {
    const currentManifest = readJsonObject(manifestPath);
    return (
      currentManifest.name === expectedManifest.name &&
      currentManifest.version === expectedManifest.version &&
      currentManifest.private === expectedManifest.private &&
      JSON.stringify(currentManifest.piConfig) ===
        JSON.stringify(expectedManifest.piConfig) &&
      currentManifest.bin === undefined
    );
  } catch {
    return false;
  }
}

export function buildSciPiDistribution(): string {
  const sourceEntrypoint = fileURLToPath(
    import.meta.resolve(UPSTREAM_PACKAGE_NAME),
  );
  const sourceDir = findPackageRoot(sourceEntrypoint);
  const sourceManifest = readJsonObject(join(sourceDir, "package.json"));
  assertPinnedVersion(sourceManifest);

  const targetManifest = createSciPiManifest(sourceManifest);
  if (distributionIsCurrent(targetManifest)) return distributionDir;

  const parentDir = dirname(distributionDir);
  const stagingDir = `${distributionDir}.tmp-${process.pid}`;
  mkdirSync(parentDir, { recursive: true });
  rmSync(stagingDir, { recursive: true, force: true });

  try {
    cpSync(sourceDir, stagingDir, { recursive: true });
    writeFileSync(
      join(stagingDir, "package.json"),
      `${JSON.stringify(targetManifest, null, 2)}\n`,
    );
    rmSync(distributionDir, { recursive: true, force: true });
    renameSync(stagingDir, distributionDir);
  } catch (error) {
    rmSync(stagingDir, { recursive: true, force: true });
    throw error;
  }

  console.log(
    `Prepared ${SCIPI_PACKAGE_NAME}@${String(targetManifest.version)}`,
  );
  return distributionDir;
}

if (import.meta.main) {
  buildSciPiDistribution();
}
