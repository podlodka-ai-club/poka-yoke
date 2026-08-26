import type { ExtensionFactory, Theme } from "@earendil-works/pi-coding-agent";
import { type Component, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

export const PRODUCT_NAME = "SciPi";
type Rgb = readonly [number, number, number];

export const SCIPI_GRADIENT_STOPS = [
  [34, 211, 238],
  [99, 102, 241],
  [168, 85, 247],
  [244, 114, 182],
] as const satisfies readonly Rgb[];

export const SCIPI_TAGLINE_PARTS = {
  base: "Научные утверждения",
  separator: " • ",
  evidence: "доказательства",
  memory: "память",
} as const;

const toByte = (value: number): number =>
  Math.max(0, Math.min(255, Math.round(value)));

const interpolateRgb = (from: Rgb, to: Rgb, amount: number): Rgb => {
  const t = Math.max(0, Math.min(1, amount));
  return [
    toByte(from[0] + (to[0] - from[0]) * t),
    toByte(from[1] + (to[1] - from[1]) * t),
    toByte(from[2] + (to[2] - from[2]) * t),
  ] as const;
};

const sampleGradient = (position: number): Rgb => {
  const t = Math.max(0, Math.min(1, position));
  if (t <= 0) return SCIPI_GRADIENT_STOPS[0];
  if (t >= 1) {
    return SCIPI_GRADIENT_STOPS[SCIPI_GRADIENT_STOPS.length - 1]!;
  }

  const scaled = t * (SCIPI_GRADIENT_STOPS.length - 1);
  const segment = Math.min(
    SCIPI_GRADIENT_STOPS.length - 2,
    Math.floor(scaled),
  );
  return interpolateRgb(
    SCIPI_GRADIENT_STOPS[segment]!,
    SCIPI_GRADIENT_STOPS[segment + 1]!,
    scaled - segment,
  );
};

const paintBoldTruecolor = (text: string, color: Rgb): string =>
  `\u001b[1;38;2;${color[0]};${color[1]};${color[2]}m${text}\u001b[0m`;

const SCIPI_GRADIENT_ROW_OFFSET = 0.75;

const paintGradient = (
  text: string,
  rowIndex = 0,
  gradientWidth = visibleWidth(text),
): string => {
  const denominator = Math.max(1, gradientWidth - 1);
  let column = 0;
  let painted = "";

  for (const character of text) {
    const characterWidth = visibleWidth(character);
    if (character === " " || characterWidth === 0) {
      painted += character;
      column += characterWidth;
      continue;
    }

    const position =
      (column + rowIndex * SCIPI_GRADIENT_ROW_OFFSET) / denominator;
    painted += paintBoldTruecolor(character, sampleGradient(position));
    column += characterWidth;
  }

  return painted;
};

export const SCIPI_TAGLINE = [
  SCIPI_TAGLINE_PARTS.base,
  SCIPI_TAGLINE_PARTS.separator,
  SCIPI_TAGLINE_PARTS.evidence,
  SCIPI_TAGLINE_PARTS.separator,
  SCIPI_TAGLINE_PARTS.memory,
].join("");

export const SCIPI_LOGO_ROWS: readonly string[] = [
  ["█████████", " ████████", "   ███   ", "████████ ", "   ███   "].join("   "),
  ["██       ", "██       ", "         ", "██     ██", "         "].join("   "),
  ["██       ", "██       ", "   ███   ", "██     ██", "   ███   "].join("   "),
  ["█████████", "██       ", "   ███   ", "████████ ", "   ███   "].join("   "),
  ["       ██", "██       ", "   ███   ", "██       ", "   ███   "].join("   "),
  ["       ██", "██       ", "   ███   ", "██       ", "   ███   "].join("   "),
  ["█████████", " ████████", " ███████ ", "██       ", " ███████ "].join("   "),
];

const SCIPI_LOGO_WIDTH = Math.max(...SCIPI_LOGO_ROWS.map((row) => visibleWidth(row)));
const SCIPI_LOGO_HORIZONTAL_MARGIN = 1;

class SciPiSplash implements Component {
  private lastWidth: number | undefined;
  private lastLines: string[] | undefined;

  constructor(private readonly theme: Theme) {}

  render(width: number): string[] {
    if (this.lastWidth === width && this.lastLines !== undefined) {
      return this.lastLines;
    }

    const lines = this.renderUncached(width);
    this.lastWidth = width;
    this.lastLines = lines;
    return lines;
  }

  invalidate(): void {
    this.lastWidth = undefined;
    this.lastLines = undefined;
  }

  private renderUncached(width: number): string[] {
    if (width <= 0) return [""];

    const useWideLogo =
      width >= SCIPI_LOGO_WIDTH + SCIPI_LOGO_HORIZONTAL_MARGIN * 2;
    const brandLines = useWideLogo
      ? SCIPI_LOGO_ROWS.map((row, rowIndex) =>
          this.centerLine(
            paintGradient(row, rowIndex, SCIPI_LOGO_WIDTH),
            width,
          ),
        )
      : [
          this.centerLine(
            paintGradient(truncateToWidth(PRODUCT_NAME, width, "")),
            width,
          ),
        ];
    const taglineLines = this.renderTaglineLines(width);

    return taglineLines.length === 0
      ? brandLines
      : [...brandLines, "", ...taglineLines];
  }

  private renderTaglineLines(width: number): string[] {
    if (visibleWidth(SCIPI_TAGLINE) <= width) {
      const { base, separator, evidence, memory } = SCIPI_TAGLINE_PARTS;
      const fullTagline = [
        this.theme.fg("accent", base),
        this.theme.fg("dim", separator),
        this.theme.fg("mdLink", this.theme.bold(evidence)),
        this.theme.fg("dim", separator),
        this.theme.fg("success", this.theme.bold(memory)),
      ].join("");
      return [this.centerLine(fullTagline, width)];
    }

    const { base, evidence, memory } = SCIPI_TAGLINE_PARTS;
    const candidates: readonly {
      raw: string;
      render: () => string;
    }[] = [
      {
        raw: base,
        render: () => this.theme.fg("accent", base),
      },
      {
        raw: `• ${evidence} •`,
        render: () =>
          [
            this.theme.fg("dim", "•"),
            " ",
            this.theme.fg("mdLink", this.theme.bold(evidence)),
            " ",
            this.theme.fg("dim", "•"),
          ].join(""),
      },
      {
        raw: memory,
        render: () => this.theme.fg("success", this.theme.bold(memory)),
      },
    ];

    return candidates
      .filter(({ raw }) => visibleWidth(raw) <= width)
      .map(({ render }) => this.centerLine(render(), width));
  }
  private centerLine(line: string, width: number): string {
    const truncated = truncateToWidth(line, width, "");
    const leftPadding = Math.max(0, Math.floor((width - visibleWidth(truncated)) / 2));
    return `${" ".repeat(leftPadding)}${truncated}`;
  }
}

const branding: ExtensionFactory = (pi) => {
  pi.on("session_start", (_event, ctx) => {
    if (ctx.mode !== "tui") return;

    ctx.ui.setHeader((_tui, theme) => new SciPiSplash(theme));
  });
};

export default branding;
