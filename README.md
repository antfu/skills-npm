# skills-npm

[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![bundle][bundle-src]][bundle-href]
[![JSDocs][jsdocs-src]][jsdocs-href]
[![License][license-src]][license-href]

A CLI that discovers [agent skills](https://agentskills.io) shipped inside npm packages and creates symlinks for coding agents to consume.

## Why?

Current skill distribution approaches (e.g. [`@vercel-labs/skills`](https://github.com/vercel-labs/skills)) have friction:

- **Git-only source** - Only supports git repos as skills source
- **Version mismatch** - Skills and tools update separately, causing compatibility issues
- **Manual management** - Cloning skills from git repos requires extra steps per project
- **Sharing overhead** - Teams must commit cloned files or repeat setup on each machine

This project proposes a convention: **ship skills inside npm packages**. When you `npm install` a tool, its skills come bundled. Run `skills-npm` to symlink them for your agent.

**Read the full proposal: [PROPOSAL.md](./PROPOSAL.md)**

## Usage

Install as a dev dependency and run `setup` once:

```bash
npm i -D skills-npm
npx skills-npm setup
```

`skills-npm setup` wires the tool into your `package.json` `prepare` script and runs the first sync. After that, skills are re-symlinked for your agent automatically whenever you install dependencies.

`setup` merges into any existing `prepare` script (it appends with `&&` and is a no-op if already wired), resulting in:

```json
{
  "private": true,
  "scripts": {
    "prepare": "skills-npm"
  }
}
```

`skills-npm` symlinks each skill from `node_modules` into your agent's skills directory under the skill's own name (the `SKILL.md` frontmatter `name`, sanitized the same way the [`skills`](https://github.com/vercel-labs/skills) CLI sanitizes install names). The symlinks are relative and point into `node_modules`, so you can commit them: they are restored on every fresh clone as soon as `npm install` runs. No `.gitignore` changes are made.

> [!NOTE]
> Keep `skills-npm` as a `devDependency`. The `prepare` script runs on `install` (and before `publish`/`pack`), but never for people who install your published package, so it is safe to commit.

## Lock file

Each sync writes `skills-npm-lock.json` in your project root: a committed manifest of the skills skills-npm manages, keyed by skill name:

```json
{
  "version": 1,
  "skills": {
    "presenter-mode": { "package": "@slidev/cli", "skillFolder": "presenter-mode" }
  }
}
```

It records *what* is installed, not *where*; agent directories are derived per machine, mirroring how the `skills` CLI keeps agent selection out of its committed lock. Skill versions are already pinned by your package manager's lock file.

## Conflicts

When the same skill name comes from more than one place, skills-npm applies this priority ladder:

1. **Explicit installs win** - a name listed in the `skills` CLI's `skills-lock.json` is never touched, even when the skill is missing on disk.
2. **Existing content wins** - a real directory or a symlink not pointing into `node_modules` is never replaced.
3. **Direct beats transitive** - a skill from a direct dependency beats the same name from a transitive one.
4. **Ties are skipped** - if two direct (or only transitive) dependencies collide, all contenders are skipped with a warning; resolve with `include`/`exclude`.

Cleanup only ever removes symlinks that point into `node_modules` skill directories, so nothing else in your agent directories is at risk.

## Migrating from v1

v1 created `npm-<package>-<skill>` links and gitignored them. On the first v2 sync, stale `npm-*` links are removed automatically and re-created under the new names. The old `**/skills/npm-*` block in `.gitignore` no longer matches anything; skills-npm won't edit your `.gitignore`, so remove it whenever convenient (a hint is printed while it remains). If you want the links shared with your team, commit them along with `skills-npm-lock.json`.

## Configuration

You can create a `skills-npm.config.ts` file in your project root to configure the behavior:

```ts
// skills-npm.config.ts
import { defineConfig } from 'skills-npm'

export default defineConfig({
  // Source to discover skills from: 'node_modules' or 'package.json'
  source: 'package.json',
  // Target specific agents (defaults to all detected agents)
  agents: ['cursor', 'windsurf'],
  // Scan recursively for monorepo packages (default: false)
  recursive: false,
  // Skip confirmation prompts (default: false)
  yes: false,
  // Dry run mode (default: false)
  dryRun: false,
  // Include specific packages or skills
  include: [
    // Include all skills from a package
    '@some/package',
    // Include all skills from packages matching a wildcard pattern
    '@some/*',
    // Include specific skills from packages matching a wildcard pattern
    { package: '@some/*', skills: ['integration'] },
    // Include specific skills from a package
    { package: '@slidev/cli', skills: ['presenter-mode'] },
  ],
  // Exclude specific packages or skills
  exclude: [
    // Exclude all skills from a package
    '@some/package',
    // Exclude all skills from packages matching a wildcard pattern
    '@some/*',
    // Exclude specific skills from packages matching a wildcard pattern
    { package: '@some/*', skills: ['integration'] },
    // Exclude specific skills from a package
    { package: '@slidev/cli', skills: ['presenter-mode'] },
  ],
})
```

`include` and `exclude` string patterns match either a package name (`@some/*`) or a sanitized skill name (`presenter-mode`). These filters only apply to packages that were already discovered from `node_modules` or `package.json`.

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `cwd` | `string` | Workspace root | Current working directory |
| `source` | `'node_modules' \| 'package.json'` | `'package.json'` | Source to discover skills from |
| `agents` | `string \| string[]` | All detected | Target agents to install to |
| `recursive` | `boolean` | `false` | Scan recursively for monorepo packages |
| `yes` | `boolean` | `false` | Skip confirmation prompts |
| `dryRun` | `boolean` | `false` | Show what would be done without making changes |
| `include` | `(string \| { package: string, skills: string[] })[]` | `undefined` | Packages or skills to include. Supports package wildcard patterns like `@some/*` |
| `exclude` | `(string \| { package: string, skills: string[] })[]` | `[]` | Packages or skills to exclude. Supports package wildcard patterns like `@some/*` |

> The `cwd` defaults to the workspace root, which is detected by searching up for `pnpm-workspace.yaml`, `lerna.json`, or a `package.json` with `workspaces` field. Falls back to the nearest `package.json`.

## CLI Options

```bash
skills-npm [options]          # discover and symlink skills (run by the prepare hook)
skills-npm setup [options]    # add the prepare script, then run the first sync (run once)

Options:
  --cwd <cwd>             Current working directory
  -s, --source <source>   Source to discover skills from (default: 'package.json')
  -a, --agents            Comma-separated list of agents to install to
  -r, --recursive         Scan recursively for monorepo packages
  --yes                   Skip confirmation prompts
  --dry-run               Show what would be done without making changes
  --force                 Force full reload, ignore cache
  --no-cleanup            Keep stale skills-npm symlinks in agent directories
  -h, --help              Display help
  -v, --version           Display version
```

## Agent detection

When `agents` is not set, `skills-npm` auto-detects which coding agents you use and installs to those. Detection combines two signals:

- **Config directory** - an agent's home directory exists (e.g. `~/.cursor`, `~/.claude`).
- **Installed command** - the agent's CLI is found on your `PATH` (e.g. `claude`, `codex`, `gemini`, `cursor-agent`). This catches agents that are installed but have not created their config directory yet.

The command check is conservative: only agents with an unambiguous CLI name are probed, so generic names and GUI-only editors are matched by the directory check alone.

In an interactive terminal, the prompt lists **all** agents with the detected ones pre-selected, so you can add or remove any. Non-interactively (e.g. from the `prepare` hook), the detected set is used directly. Pass `--agents` (or set `agents` in the config) to bypass detection entirely.

## For Package Authors

Include a `skills/` directory in your package:

```
my-tool/
├── package.json
├── dist/
└── skills/
    └── my-skill/
        └── SKILL.md
```

See [PROPOSAL.md](./PROPOSAL.md#for-package-authors) for detailed instructions.

## Showcases

Packages that ships their built-in skills:

- [`@slidev/cli`](https://github.com/slidevjs/slidev)
- [`eslint-vitest-rule-tester`](https://github.com/antfu-collective/eslint-vitest-rule-tester)
- [`@vitejs/devtools-kit`](https://github.com/vitejs/devtools)
- [`@vueuse/skills`](https://github.com/vueuse/vueuse/tree/main/packages/skills)

> [!NOTE]
> PR are welcome to add more packages that ships their built-in skills.

## Sponsors

<p align="center">
  <a href="https://cdn.jsdelivr.net/gh/antfu/static/sponsors.svg">
    <img src='https://cdn.jsdelivr.net/gh/antfu/static/sponsors.svg' alt="sponsors" />
  </a>
</p>

## License

[MIT](./LICENSE) License © [Anthony Fu](https://github.com/antfu)

<!-- Badges -->

[npm-version-src]: https://img.shields.io/npm/v/skills-npm?style=flat&colorA=080f12&colorB=1fa669
[npm-version-href]: https://npmjs.com/package/skills-npm
[npm-downloads-src]: https://img.shields.io/npm/dm/skills-npm?style=flat&colorA=080f12&colorB=1fa669
[npm-downloads-href]: https://npmjs.com/package/skills-npm
[bundle-src]: https://img.shields.io/bundlephobia/minzip/skills-npm?style=flat&colorA=080f12&colorB=1fa669&label=minzip
[bundle-href]: https://bundlephobia.com/result?p=skills-npm
[license-src]: https://img.shields.io/github/license/antfu/skills-npm.svg?style=flat&colorA=080f12&colorB=1fa669
[license-href]: https://github.com/antfu/skills-npm/blob/main/LICENSE
[jsdocs-src]: https://img.shields.io/badge/jsdocs-reference-080f12?style=flat&colorA=080f12&colorB=1fa669
[jsdocs-href]: https://www.jsdocs.io/package/skills-npm
