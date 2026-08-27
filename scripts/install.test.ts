import { describe, expect, test } from "bun:test";

import {
  archiveUrlForRef,
  isSupportedBunVersion,
  smokeCommandFor,
} from "./install.ts";

describe("Bun version gate", () => {
  test.each([
    ["1.3.13", false],
    ["1.3.14", true],
    ["1.3.14-canary.1", true],
    ["1.4.0", true],
    ["2.0.0", true],
    ["1.3", false],
    ["not-a-version", false],
  ])("classifies %s", (version, supported) => {
    expect(isSupportedBunVersion(version)).toBe(supported);
  });
});

test("builds an encoded GitHub archive URL", () => {
  expect(archiveUrlForRef("feat/scipi installer")).toBe(
    "https://api.github.com/repos/podlodka-ai-club/poka-yoke/tarball/feat%2Fscipi%20installer",
  );
  expect(() => archiveUrlForRef("")).toThrow("SCIPI_REF must not be empty");
});

describe("installed executable smoke command", () => {
  test("runs Unix and Windows executables directly", () => {
    expect(smokeCommandFor("/tmp/scipi", "linux", {})).toEqual([
      "/tmp/scipi",
      "--version",
    ]);
    expect(smokeCommandFor("C:\\bin\\scipi.exe", "win32", {})).toEqual([
      "C:\\bin\\scipi.exe",
      "--version",
    ]);
  });

  test("uses native Windows hosts for command and PowerShell shims", () => {
    expect(
      smokeCommandFor("C:\\SciPi Bin\\scipi.cmd", "win32", {
        ComSpec: "C:\\Windows\\System32\\cmd.exe",
      }),
    ).toEqual([
      "C:\\Windows\\System32\\cmd.exe",
      "/d",
      "/s",
      "/c",
      "\"C:\\SciPi Bin\\scipi.cmd\" --version",
    ]);
    expect(
      smokeCommandFor("C:\\SciPi Bin\\scipi.ps1", "win32", {}),
    ).toEqual([
      "powershell.exe",
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      "C:\\SciPi Bin\\scipi.ps1",
      "--version",
    ]);
  });
});
