import { describe, expect, test } from "bun:test";
import type {
  ExtensionAPI,
  ExtensionContext,
  ExtensionFactory,
  ExtensionUIContext,
  SessionStartEvent,
} from "#scipi/coding-agent";
import { stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import branding, {
  PRODUCT_NAME,
  SCIPI_LOGO_ROWS,
  SCIPI_TAGLINE,
  SCIPI_TAGLINE_PARTS,
} from "./branding.ts";

type SessionStartHandler = (
  event: SessionStartEvent,
  context: ExtensionContext,
) => void | Promise<void>;
type HeaderFactory = Exclude<
  Parameters<ExtensionUIContext["setHeader"]>[0],
  undefined
>;
type HeaderTui = Parameters<HeaderFactory>[0];
type HeaderTheme = Parameters<HeaderFactory>[1];

const WIDE_WIDTH = 100;
const NARROW_WIDTH = 24;

// Immutable corner stops of the local static diagonal logo gradient.
const GRADIENT_STOPS: ReadonlyArray<readonly [number, number, number]> = [
  [34, 211, 238], // cyan
  [99, 102, 241], // indigo
  [168, 85, 247], // violet
  [244, 114, 182], // pink
];
const MIN_DISTINCT_GRADIENT_COLORS = 4;

// Matches 38;2;r;g;b inside any SGR parameter list, so both
// "\u001b[38;2;r;g;bm" and combined "\u001b[1;38;2;r;g;bm" are observed.
const TRUECOLOR_PATTERN =
  /\u001b\[[0-9;]*38;2;(\d{1,3});(\d{1,3});(\d{1,3})[0-9;]*m/g;
const SGR_PATTERN = /\u001b\[([0-9;]*)m/g;

interface TruecolorRgb {
  r: number;
  g: number;
  b: number;
}

const sessionStartEvent: SessionStartEvent = {
  type: "session_start",
  reason: "startup",
};

function getSessionStartHandler(factory: ExtensionFactory): SessionStartHandler {
  let sessionStartHandler: SessionStartHandler | undefined;
  const extensionApi = {
    on(event: "session_start", handler: SessionStartHandler) {
      if (event !== "session_start") {
        throw new Error(`Unexpected event: ${event}`);
      }
      sessionStartHandler = handler;
    },
  } as unknown as ExtensionAPI;

  factory(extensionApi);

  if (sessionStartHandler === undefined) {
    throw new Error("Branding extension did not register a session_start handler");
  }
  return sessionStartHandler;
}

async function installTuiHeader(): Promise<HeaderFactory> {
  const sessionStartHandler = getSessionStartHandler(branding);
  let installedHeader: HeaderFactory | undefined;
  const context = {
    mode: "tui",
    ui: {
      setHeader(header: HeaderFactory | undefined) {
        installedHeader = header;
      },
    },
  } as unknown as ExtensionContext;

  await sessionStartHandler(sessionStartEvent, context);

  if (installedHeader === undefined) {
    throw new Error("TUI branding header was not installed");
  }
  return installedHeader;
}

interface RenderedLine {
  /** Raw ANSI output as produced by the component. */
  raw: string;
  /** Escape-stripped counterpart, safe for width/centering math. */
  line: string;
}

interface RenderedHeader {
  rawLines: string[];
  lines: string[];
  styleCalls: string[];
}

function createRecordingTheme(styleCalls: string[]): HeaderTheme {
  const theme = {
    bold(text: string): string {
      styleCalls.push(`bold:${stripTerminalSequences(text)}`);
      return `\u001b[1m${text}\u001b[22m`;
    },
    fg(color: string, text: string): string {
      styleCalls.push(`fg:${color}:${stripTerminalSequences(text)}`);
      return `\u001b[38;5;39m${text}\u001b[39m`;
    },
  };
  return theme as unknown as HeaderTheme;
}

function renderHeader(headerFactory: HeaderFactory, width: number): RenderedHeader {
  const styleCalls: string[] = [];
  const theme = createRecordingTheme(styleCalls);
  const component = headerFactory(undefined as unknown as HeaderTui, theme);

  const rawLines = component.render(width);
  return {
    rawLines,
    lines: rawLines.map((line) => stripTerminalSequences(line)),
    styleCalls,
  };
}

function pairRenderedLines(rendered: RenderedHeader): RenderedLine[] {
  expect(rendered.rawLines.length).toBe(rendered.lines.length);
  return rendered.lines.map((line, index) => ({
    line,
    raw: rendered.rawLines[index] ?? "",
  }));
}

function extractTruecolors(rawLines: string[]): TruecolorRgb[] {
  const colors: TruecolorRgb[] = [];
  for (const line of rawLines) {
    for (const match of line.matchAll(TRUECOLOR_PATTERN)) {
      colors.push({
        r: Number(match[1] ?? ""),
        g: Number(match[2] ?? ""),
        b: Number(match[3] ?? ""),
      });
    }
  }
  return colors;
}

function dedupeTruecolors(colors: TruecolorRgb[]): TruecolorRgb[] {
  const seen = new Set<string>();
  return colors.filter(({ r, g, b }) => {
    const key = `${r};${g};${b}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function hasBoldSgr(rawLine: string): boolean {
  for (const match of rawLine.matchAll(SGR_PATTERN)) {
    if ((match[1] ?? "").split(";").includes("1")) return true;
  }
  return false;
}

/** Every observed color must lie inside the hull of the four gradient stops. */
function expectWithinGradientPalette(colors: TruecolorRgb[]): void {
  const uniqueColors = dedupeTruecolors(colors);
  expect(uniqueColors.length).toBeGreaterThan(0);
  const channels = [
    { key: "r", index: 0 },
    { key: "g", index: 1 },
    { key: "b", index: 2 },
  ] as const;
  for (const { key, index } of channels) {
    const hullValues = GRADIENT_STOPS.map((stop) => stop[index]);
    const observedValues = uniqueColors.map((color) => color[key]);
    expect(Math.min(...observedValues)).toBeGreaterThanOrEqual(
      Math.min(...hullValues),
    );
    expect(Math.max(...observedValues)).toBeLessThanOrEqual(
      Math.max(...hullValues),
    );
  }
}

function styledCallArgs(
  styleCalls: string[],
  kind: "bold" | "fg",
  color?: string,
): string[] {
  const prefix = color === undefined ? `${kind}:` : `${kind}:${color}:`;
  return styleCalls
    .filter((call) => call.startsWith(prefix))
    .map((call) => call.slice(prefix.length));
}

function expectSemanticTaglineThemeCalls(styleCalls: string[]): void {
  const { base, separator, evidence, memory } = SCIPI_TAGLINE_PARTS;
  expect(styledCallArgs(styleCalls, "fg", "accent")).toContain(base);
  const separatorArgs = styledCallArgs(styleCalls, "fg", "dim").filter(
    (arg) => arg === separator,
  );
  expect(separatorArgs).toHaveLength(2);
  expect(styledCallArgs(styleCalls, "bold")).toContain(evidence);
  expect(styledCallArgs(styleCalls, "fg", "mdLink")).toContain(evidence);
  expect(styledCallArgs(styleCalls, "bold")).toContain(memory);
  expect(styledCallArgs(styleCalls, "fg", "success")).toContain(memory);
}

function expectCenteredWithinOneColumn(
  line: string,
  content: string,
  width: number,
): void {
  const actualLeftPad = line.indexOf(content);
  expect(actualLeftPad).toBeGreaterThanOrEqual(0);
  const expectedLeftPad = Math.floor((width - visibleWidth(content)) / 2);
  const deviation = Math.abs(actualLeftPad - expectedLeftPad);
  expect(deviation).toBeLessThanOrEqual(1);
}

/** Width accounting must ignore ANSI bytes: raw and stripped widths agree. */
function expectAnsiAwareWidths(renderedLines: RenderedLine[], width: number): void {
  for (const { line, raw } of renderedLines) {
    expect(visibleWidth(line)).toBeLessThanOrEqual(width);
    expect(visibleWidth(raw)).toBe(visibleWidth(line));
  }
}

describe("SciPi startup branding", () => {
  test("renders the full truecolor gradient logo, tagline, and styling across wide terminals", async () => {
    const headerFactory = await installTuiHeader();
    const rendered = renderHeader(headerFactory, WIDE_WIDTH);

    expect(SCIPI_LOGO_ROWS).toHaveLength(7);
    expect(
      Math.max(...SCIPI_LOGO_ROWS.map((row) => visibleWidth(row))),
    ).toBeGreaterThanOrEqual(55);
    expect(rendered.lines.length).toBeGreaterThanOrEqual(9);

    const renderedPairs = pairRenderedLines(rendered);
    const logoRawLines: string[] = [];
    for (const row of SCIPI_LOGO_ROWS) {
      const renderedLine = renderedPairs.find((pair) => pair.line.includes(row));
      expect(renderedLine).toBeDefined();
      if (renderedLine !== undefined) {
        logoRawLines.push(renderedLine.raw);
        expectCenteredWithinOneColumn(renderedLine.line, row, WIDE_WIDTH);
      }
    }

    expect(logoRawLines).toHaveLength(SCIPI_LOGO_ROWS.length);
    for (const rawLine of logoRawLines) {
      expect(hasBoldSgr(rawLine)).toBe(true);
      expect(extractTruecolors([rawLine]).length).toBeGreaterThan(0);
    }
    expect(
      dedupeTruecolors(extractTruecolors(logoRawLines)).length,
    ).toBeGreaterThanOrEqual(MIN_DISTINCT_GRADIENT_COLORS);
    expectWithinGradientPalette(extractTruecolors(logoRawLines));

    const taglineLine = renderedPairs.find((pair) =>
      pair.line.includes(SCIPI_TAGLINE),
    );
    expect(taglineLine).toBeDefined();
    if (taglineLine !== undefined) {
      expectCenteredWithinOneColumn(taglineLine.line, SCIPI_TAGLINE, WIDE_WIDTH);
      expect(taglineLine.line.trim()).toBe(SCIPI_TAGLINE);
    }
    expectSemanticTaglineThemeCalls(rendered.styleCalls);

    expectAnsiAwareWidths(renderedPairs, WIDE_WIDTH);
  });

  test("falls back to compact truecolor branding on narrow terminals", async () => {
    const headerFactory = await installTuiHeader();
    const rendered = renderHeader(headerFactory, NARROW_WIDTH);
    const renderedPairs = pairRenderedLines(rendered);

    // Compact fallback renders every semantic tagline unit as its own whole,
    // centered line instead of truncating mid-word.
    const trimmedLines = rendered.lines
      .filter((line) => line.trim().length > 0)
      .map((line) => line.trim());
    const semanticLines = [
      PRODUCT_NAME,
      SCIPI_TAGLINE_PARTS.base,
      "• доказательства •",
      SCIPI_TAGLINE_PARTS.memory,
    ];
    expect(trimmedLines).toEqual(semanticLines);

    // No rendered line may be a partial prefix of a longer semantic word.
    const semanticWords = [
      PRODUCT_NAME,
      ...SCIPI_TAGLINE_PARTS.base.split(" "),
      SCIPI_TAGLINE_PARTS.evidence,
      SCIPI_TAGLINE_PARTS.memory,
    ];
    for (const line of trimmedLines) {
      for (const word of semanticWords) {
        expect(word.startsWith(line) && line.length < word.length).toBe(false);
      }
    }

    for (const content of semanticLines.slice(1)) {
      const centeredLine = rendered.lines.find((line) => line.trim() === content);
      expect(centeredLine).toBeDefined();
      if (centeredLine !== undefined) {
        expectCenteredWithinOneColumn(centeredLine, content, NARROW_WIDTH);
      }
    }

    expect(rendered.lines.some((line) => line.includes("█"))).toBe(false);

    const brandLine = renderedPairs.find((pair) => pair.line.includes(PRODUCT_NAME));
    expect(brandLine).toBeDefined();
    if (brandLine !== undefined) {
      expect(extractTruecolors([brandLine.raw]).length).toBeGreaterThan(0);
      expect(hasBoldSgr(brandLine.raw)).toBe(true);
    }
    // Compact brand paint is generated locally, not routed through the theme.
    expect(
      rendered.styleCalls.some((call) => call.includes(PRODUCT_NAME)),
    ).toBe(false);

    expectAnsiAwareWidths(renderedPairs, NARROW_WIDTH);
  });

  test("keeps compact branding styled and reset-safe at width 1", async () => {
    const headerFactory = await installTuiHeader();
    const rendered = renderHeader(headerFactory, 1);
    const renderedPairs = pairRenderedLines(rendered);

    const visiblePairs = renderedPairs.filter(
      (pair) => pair.line.trim().length > 0,
    );
    expect(visiblePairs.length).toBeGreaterThan(0);

    const brandPair = visiblePairs[0];
    expect(brandPair).toBeDefined();
    if (brandPair !== undefined) {
      // Raw-truncated before painting: styling survives intact, no cut SGR.
      expect(/\u001b/u.test(brandPair.raw)).toBe(true);
      expect(brandPair.raw.endsWith("\u001b[0m")).toBe(true);
      expect(visibleWidth(brandPair.line)).toBeLessThanOrEqual(1);
    }

    expectAnsiAwareWidths(renderedPairs, 1);
  });

  test("reuses cached header lines per width until invalidated", async () => {
    const headerFactory = await installTuiHeader();
    const styleCalls: string[] = [];
    const theme = createRecordingTheme(styleCalls);
    const component = headerFactory(undefined as unknown as HeaderTui, theme);

    const firstRenderLines = component.render(WIDE_WIDTH);
    const firstRenderStyleCalls = [...styleCalls];
    expect(firstRenderStyleCalls.length).toBeGreaterThan(0);
    expect(
      dedupeTruecolors(extractTruecolors(firstRenderLines)).length,
    ).toBeGreaterThanOrEqual(MIN_DISTINCT_GRADIENT_COLORS);
    expect(
      firstRenderLines
        .map((line) => stripTerminalSequences(line))
        .some((line) => line.includes(SCIPI_TAGLINE)),
    ).toBe(true);

    expect(component.render(WIDE_WIDTH)).toBe(firstRenderLines);
    expect(styleCalls).toEqual(firstRenderStyleCalls);

    // Switching widths must bypass the cache: new array, compact layout, fresh work.
    const narrowLines = component.render(NARROW_WIDTH);
    expect(narrowLines).not.toBe(firstRenderLines);
    expect(narrowLines.some((line) => line.includes("█"))).toBe(false);
    const styleCallsThroughNarrow = [...styleCalls];
    expect(styleCallsThroughNarrow.length).toBeGreaterThan(
      firstRenderStyleCalls.length,
    );

    // Repeating the narrow width hits the cache again.
    expect(component.render(NARROW_WIDTH)).toBe(narrowLines);
    expect(styleCalls).toEqual(styleCallsThroughNarrow);

    component.invalidate();
    const refreshedLines = component.render(WIDE_WIDTH);
    expect(refreshedLines).not.toBe(firstRenderLines);
    expect(refreshedLines).toEqual(firstRenderLines);
    expect(styleCalls.slice(styleCallsThroughNarrow.length)).toEqual(
      firstRenderStyleCalls,
    );
  });

  test("does not install a header outside TUI mode", async () => {
    for (const mode of ["rpc", "json", "print"] as const) {
      const sessionStartHandler = getSessionStartHandler(branding);
      let setHeaderCalls = 0;
      const context = {
        mode,
        ui: {
          setHeader() {
            setHeaderCalls += 1;
          },
        },
      } as unknown as ExtensionContext;

      await sessionStartHandler(sessionStartEvent, context);

      expect(setHeaderCalls).toBe(0);
    }
  });
});
