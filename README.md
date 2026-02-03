# skills-npm

[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![bundle][bundle-src]][bundle-href]
[![JSDocs][jsdocs-src]][jsdocs-href]
[![License][license-src]][license-href]

A CLI that discovers [agent skills](https://agentskills.io) shipped inside npm packages and creates symlinks for coding agents to consume.

> [!IMPORTANT]
> This project is a work in progress.

## Why?

Current skill distribution approaches (e.g. [`@vercel-labs/skills`](https://github.com/vercel-labs/skills)) have friction:

- **Git-only source** - Only supports git repos as skills source
- **Version mismatch** - Skills and tools update separately, causing compatibility issues
- **Manual management** - Cloning skills from git repos requires extra steps per project
- **Sharing overhead** - Teams must commit cloned files or repeat setup on each machine

This project proposes a convention: **ship skills inside npm packages**. When you `npm install` a tool, its skills come bundled. Run `skills-npm` to symlink them for your agent.

**Read the full proposal: [PROPOSAL.md](./PROPOSAL.md)**

## Usage

```bash
npm i -D skills-npm
```

Add a `prepare` script to your `package.json` so the skills are symlinked automatically for your agent whenever you install dependencies:

```json
{
  "private": true,
  "scripts": {
    "prepare": "skills-npm"
  }
}
```

`skills-npm` will symbol links the skills from `node_modules` to `skills/npm-<package-name>-<skill-name>` for your agent. It's recommend to add the following to your `.gitignore`:

```
skills/npm-*
```

## Configuration

You can create a `skills-npm.config.ts` file in your project root to configure the behavior:

```ts
// skills-npm.config.ts
import { defineConfig } from 'skills-npm'

export default defineConfig({
  // Target specific agents (defaults to all detected agents)
  agents: ['cursor', 'windsurf'],
  // Whether to update .gitignore (default: true)
  gitignore: true,
  // Skip confirmation prompts (default: false)
  yes: false,
  // Dry run mode (default: false)
  dryRun: false,
  // Include specific packages or skills
  include: [
    // Include all skills from a package
    '@some/package',
    // Include specific skills from a package
    { package: '@slidev/cli', skills: ['presenter-mode'] },
  ],
  // Exclude specific packages or skills
  exclude: [
    // Exclude all skills from a package
    '@some/package',
    // Exclude specific skills from a package
    { package: '@slidev/cli', skills: ['presenter-mode'] },
  ],
})
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `cwd` | `string` | Workspace root | Current working directory |
| `agents` | `string[]` | All detected | Target agents to install to |
| `gitignore` | `boolean` | `true` | Whether to update .gitignore |
| `yes` | `boolean` | `false` | Skip confirmation prompts |
| `dryRun` | `boolean` | `false` | Show what would be done without making changes |
| `include` | `(string \| { package: string, skills: string[] })[]` | `undefined` | Packages or skills to include (only these will be installed) |
| `exclude` | `(string \| { package: string, skills: string[] })[]` | `[]` | Packages or skills to exclude from being installed |

> The `cwd` defaults to the workspace root, which is detected by searching up for `pnpm-workspace.yaml`, `lerna.json`, or a `package.json` with `workspaces` field. Falls back to the nearest `package.json`.

## CLI Options

```bash
skills-npm [options]

Options:
  --cwd <cwd>        Current working directory
  -a, --agents       Comma-separated list of agents to install to
  --gitignore        Whether to update .gitignore (default: true)
  --yes              Skip confirmation prompts
  --dry-run          Show what would be done without making changes
  -h, --help         Display help
  -v, --version      Display version
```

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

> [!NOTE]
> PR are welcome to add more packages that ships their built-in skills.

## Sponsors

<p align="center">
  <a href="https://cdn.jsdelivr.net/gh/antfu/static/sponsors.svg">
    <img src='https://cdn.jsdelivr.net/gh/antfu/static/sponsors.svg'/>
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
