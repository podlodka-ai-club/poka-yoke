import { expect, test } from "bun:test";
import {
  createSciPiManifest,
  SCIPI_APP_NAME,
  SCIPI_CONFIG_DIR,
  SCIPI_PACKAGE_NAME,
  UPSTREAM_PACKAGE_NAME,
} from "./build-scipi-distribution.ts";

const upstreamManifest = {
  name: UPSTREAM_PACKAGE_NAME,
  version: "0.84.3",
  type: "module",
  piConfig: { configDir: ".pi" },
  bin: { pi: "dist/bundle/cli.js" },
};

test("creates an independently named SciPi distribution manifest", () => {
  const manifest = createSciPiManifest(upstreamManifest, "0.1.0-dev.42");

  expect(manifest.name).toBe(SCIPI_PACKAGE_NAME);
  expect(manifest.version).toBe("0.1.0-dev.42");
  expect(manifest.private).toBe(true);
  expect(manifest.piConfig).toEqual({
    name: SCIPI_APP_NAME,
    configDir: SCIPI_CONFIG_DIR,
  });
  expect(manifest.bin).toBeUndefined();
  expect(upstreamManifest.piConfig).toEqual({ configDir: ".pi" });
});

test("fails closed when upstream changes its config directory contract", () => {
  expect(() =>
    createSciPiManifest(
      {
        ...upstreamManifest,
        piConfig: { configDir: ".future-pi" },
      },
      "0.1.0-dev.42",
    ),
  ).toThrow("review SciPi distribution isolation before upgrading");
});
