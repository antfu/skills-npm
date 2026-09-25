# skills-npm

[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![bundle][bundle-src]][bundle-href]
[![JSDocs][jsdocs-src]][jsdocs-href]
[![License][license-src]][license-href]

A CLI that installs [agent skills](https://agentskills.io) through npm: it symlinks skills shipped inside your installed packages, and fetches the remote skills your packages declare in a `skills` field via the [`skills`](https://github.com/vercel-labs/skills) CLI.

## Why?

Cloning skills from git repos one by one (e.g. `npx skills add`) has friction:

- **Version mismatch** - Skills and tools update separately, causing compatibility issues
- **Manual management** - Each project repeats the same `add` commands
- **Sharing overhead** - Teams must commit cloned files or repeat setup on each machine

This project proposes two conventions that let npm do the distribution:

- **Ship skills inside npm packages** under a `skills/` directory. When you `npm install` a tool, its skills come bundled and are symlinked for your agent.
- **Curate skills in a `skills` field** of `package.json`. A package can list skills hosted elsewhere; installing the package installs the list. A package that is nothing but this field is a **skills pack**.

**Read the full proposal: [PROPOSAL.md](./PROPOSAL.md)** and the field spec: **[SPEC.md](./SPEC.md)**

> [!NOTE]
> Requires Node.js 22.20 or later (the floor of the `skills` CLI it drives).

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

## Remote skills and skills packs

Besides the `skills/` directory, skills-npm reads a `skills` field from your own `package.json` and from the packages it scans (your direct dependencies by default). Each entry is a git-hosted source in the same syntax the `skills` CLI accepts, or `npm:<package>` to pull in skills shipped by another npm package:

```json
{
  "skills": [
    "vercel-labs/agent-skills@web-design-guidelines",
    "owner/repo#v1.2.0",
    { "source": "owner/repo", "skills": ["a", "b"], "ref": "v2.0.0" },
    "npm:@vueuse/skills"
  ]
}
```

Publish a package with only this field and you have a shareable, versioned **skills pack**: `npm i -D @acme/frontend-skills` installs the whole list for everyone on the team. The full syntax and semantics are in [SPEC.md](./SPEC.md).

How remote entries are handled:

- **The `skills` CLI does the fetching.** skills-npm spawns `skills add <source> --skill … -a <your agents> -y` for each distinct source, so the result is exactly what `npx skills add` would produce: a copy under `.agents/skills/<name>`, per-agent symlinks, and an entry in `skills-lock.json`. Commit those files as you would after `npx skills add`.
- **Fetch once, not on every install.** An entry whose skills are already recorded in `skills-lock.json` from the same source (and ref) is skipped. `--force` refetches everything; to pull newer upstream content run `npx skills update`.
- **Failures fail the run.** A source that cannot be cloned or an invalid entry (a local path, a non-git URL, a `ref` given twice) exits non-zero, so a broken pack never passes silently. Use `--no-remote` (or `remote: false`) for offline installs: network entries are left as they are, `npm:` entries still resolve.
- **Removal follows the field.** When no honored package requests a remote skill anymore, skills-npm runs `skills remove <name>` for it (unless `--no-cleanup`). Skills you installed by hand are never touched.
- **`npm:` entries** are resolved from the declaring package (so pnpm's isolated layout works) and symlinked like any shipped skill. The pack must list the target package in its `dependencies`.

Pin refs in packs (`owner/repo#v1.2.0`, or `"ref"`) so every consumer gets the same content. A commit must be a full 40-character SHA.

## Lock file

Each sync writes `skills-npm-lock.json` in your project root: a committed manifest of the skills skills-npm manages, keyed by skill name:

```json
{
  "version": 2,
  "skills": {
    "presenter-mode": { "package": "@slidev/cli", "skillFolder": "presenter-mode" },
    "vueuse-functions": { "package": "@vueuse/skills", "skillFolder": "vueuse-functions", "via": "@acme/frontend-skills" }
  },
  "remote": {
    "web-design-guidelines": { "package": "@acme/frontend-skills", "source": "vercel-labs/agent-skills", "ref": "v1.4.0" }
  }
}
```

It records *what* is installed and *who asked for it*, not *where*; agent directories are derived per machine, mirroring how the `skills` CLI keeps agent selection out of its committed lock. `via` marks a shipped skill that is only installed because a pack requested it with `npm:`; `remote` lists the skills fetched on behalf of a `skills` field. Skill versions are pinned by your package manager's lock file and by `skills-lock.json` respectively.

## Conflicts

When the same skill name comes from more than one place, skills-npm applies this priority ladder:

1. **Explicit installs win** - a name listed in the `skills` CLI's `skills-lock.json` that skills-npm did not install itself is never touched, even when the skill is missing on disk.
2. **Existing content wins** - a real directory or a symlink not pointing into `node_modules` is never replaced.
3. **Shipped beats remote** - a skill shipped in an npm package beats a remote entry of the same name.
4. **Direct beats transitive** - a skill from a direct dependency beats the same name from a transitive one; identical remote requests from several packages count as one.
5. **Ties are skipped** - if two direct (or only transitive) dependencies collide, all contenders are skipped with a warning; resolve with `include`/`exclude`.

Cleanup only ever removes symlinks that point into `node_modules` skill directories and remote skills recorded in `skills-npm-lock.json`, so nothing else in your agent directories is at risk.

## Migrating from v2

v3 requires Node.js 22.20+ and adds `skills` as a dependency. `skills-npm-lock.json` moves to version 2 (a `remote` map and an optional `via` per entry); it is rewritten on the first sync. Nothing changes for projects without a `skills` field.

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
  // Fetch remote skills from `skills` fields (default: true); false for offline installs
  remote: true,
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

`include` and `exclude` string patterns match either a package name (`@some/*`) or a sanitized skill name (`presenter-mode`). These filters only apply to packages that were already discovered from `node_modules` or `package.json`. For remote entries they match the requesting package, and the skill name only where the entry names skills (a bare `owner/repo` can only be filtered by package).

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
| `cleanup` | `boolean` | `true` | Remove stale skills-npm symlinks and remote skills nobody requests anymore |
| `remote` | `boolean` | `true` | Fetch remote skills declared in `skills` fields; `false` skips network entries |

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
  --force                 Force full reload, ignore cache and refetch remote skills
  --no-cleanup            Keep stale skills-npm symlinks and remote skills in agent directories
  --no-remote             Skip remote skills declared in "skills" fields (offline)
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

Ship the skills you own in a `skills/` directory:

```
my-tool/
├── package.json
├── dist/
└── skills/
    └── my-skill/
        └── SKILL.md
```

Curate skills you don't own in a `skills` field. A skills pack is just a package with that field and nothing else:

```json
{
  "name": "@acme/frontend-skills",
  "version": "1.0.0",
  "skills": [
    "vercel-labs/agent-skills#v1.4.0@web-design-guidelines",
    "npm:@vueuse/skills"
  ],
  "dependencies": {
    "@vueuse/skills": "^1.0.0"
  }
}
```

See [PROPOSAL.md](./PROPOSAL.md#for-package-authors) and [SPEC.md](./SPEC.md).

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
