# SciPi

SciPi is a custom scientific-research harness built on top of [Pi](https://pi.dev).

## Run

Requirements:

- Bun 1.3.14 or newer
- a model provider supported by Pi

```bash
bun install
bun run scipi
```

SciPi forwards regular Pi CLI arguments:

```bash
bun run scipi -- --help
```

The harness keeps Pi's standard CLI, authentication, settings, and session behavior while replacing the interactive startup header with `SciPi`.

## Startup onboarding

On wide terminals, SciPi opens with a centered seven-row logo and the Russian tagline:

```text
Научные утверждения • доказательства • память
```

The logo occupies roughly half of a 120-column terminal. Narrow terminals automatically fall back to a compact centered `SciPi` label without overflowing the available width.

The logo uses a locally rendered cyan → indigo → violet → pink truecolor gradient. The tagline uses Pi theme colors to emphasize `доказательства` and `память`. No startup-header package or additional rendering dependency is installed.

At 24 columns, the tagline switches to complete semantic lines instead of cutting words:

```text
         SciPi

  Научные утверждения
   • доказательства •
         память
```