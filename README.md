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

## Configuration and compatibility

SciPi keeps Pi 0.84.3's configuration schemas and file names, but isolates both global and project-local state:

- The default global agent directory is `~/.scipi/agent`.
- Project-local settings and resources use `<project>/.scipi` instead of Pi's `<project>/.pi`.
- Pi-compatible files such as `auth.json`, `settings.json`, and `models.json`, together with packages, extensions, skills, themes, and prompts, keep their standard formats.
- Without `SCIPI_SESSION_DIR`, an explicit `--session-dir`, or `sessionDir` in SciPi's own `settings.json`, Pi derives its canonical cwd-encoded default session paths under the isolated global agent directory.

Set SciPi-specific overrides before launching:

```bash
SCIPI_AGENT_DIR="$HOME/work/scipi-agent" bun run scipi
SCIPI_SESSION_DIR="$HOME/work/scipi-sessions" bun run scipi
```

`SCIPI_AGENT_DIR` replaces `~/.scipi/agent` and always wins over an inherited `PI_CODING_AGENT_DIR`. A non-empty `SCIPI_SESSION_DIR` maps to Pi's session directory. Inherited `PI_CODING_AGENT_*` values are intentionally ignored by SciPi; use the `SCIPI_*` variables instead. An explicit Pi CLI `--session-dir` remains the intentional highest-priority override:

```bash
bun run scipi -- --session-dir "$HOME/work/one-session"
```

Pi's package commands are forwarded unchanged. Global packages remain private to SciPi; `-l` packages are installed into the current project's `.scipi`:

```bash
bun run scipi install npm:@scope/pi-extension
bun run scipi install npm:@scope/pi-extension -l
```

This is compatible with Pi's existing formats, not a new storage format. To migrate, copy only the global Pi JSON files you want (for example `auth.json`, `settings.json`, or `models.json`) into `~/.scipi/agent`, and copy selected project resources from `.pi` into `.scipi` when needed. Do not symlink either directory: symlinks reintroduce shared mutable state. Ordinary Pi reads `.pi`, while SciPi reads `.scipi`, so project-local packages, extensions, skills, prompts, themes, and settings no longer mix.

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