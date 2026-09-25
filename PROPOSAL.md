# npm-based Agent Skills Convention

> A proposal for using npm packages as the distribution and curation layer for agent skills.

## Introduction

[Agent Skills](https://agentskills.io) is an open format for giving AI coding agents new capabilities and expertise. Skills are folders containing `SKILL.md` files that agents can discover and use to perform tasks more accurately and efficiently.

While the Agent Skills standard defines *what* skills are, the ecosystem still lacks a mature solution for *how* skills should be distributed, versioned, and managed. This proposal introduces two conventions that let npm play that role:

1. **The `skills/` directory** - a package ships the skills it owns, so they install and update together with the tool.
2. **The `skills` field** - a package declares skills hosted elsewhere that it curates, so a curated list can be shared as an ordinary npm dependency (a "skills pack"). Fetching is delegated to the git-based [`skills`](https://github.com/vercel-labs/skills) CLI.

## Problem Statement

Cloning skills from git repositories via tools like [`npx skills add`](https://github.com/vercel-labs/skills) is a good fit for one-off installs, but as the only distribution mechanism it has several limitations:

### 1. Distribution Fragmentation

Skills live in separate repositories, disconnected from the tools they enhance. Users must manually discover, clone, and manage skills independently of their tooling. This creates friction and cognitive overhead.

### 2. Version Misalignment

Skills and tools are installed and updated separately. When a skill is updated to leverage new tool capabilities, users running older tool versions may experience unexpected behavior or errors. There's no built-in mechanism to ensure compatibility between skill versions and tool versions.

### 3. Sharing Friction

Sharing skills across teams and projects is cumbersome:

- **Committing cloned skills** pollutes repositories with duplicated content that's hard to sync with upstream
- **Re-cloning on each machine** is manual and error-prone
- **Working across many projects** means repeating the setup process everywhere

## Convention 1: the `skills/` directory

**Ship official skills inside npm packages under a `skills/` directory.**

A reference implementation tool, `skills-npm`, scans installed packages in `node_modules`, discovers bundled skills, and creates symlinks for agents to consume.

### Package Structure

Tools that ship with skills should include a `skills/` directory in their npm package:

```
my-awesome-tool/
├── package.json
├── dist/
└── skills/
    ├── my-awesome-tool-docs/
    │   └── SKILL.md
    └── my-awesome-tool-best-practices/
        └── SKILL.md
```

Each subdirectory under `skills/` represents a single skill and must contain a `SKILL.md` file following the [Agent Skills specification](https://agentskills.io/specification).

### Discovery Pattern

`skills-npm` discovers skills by scanning:

```
node_modules/**/skills/*/SKILL.md
```

By default only the project's direct dependencies are honored; scanning every hoisted package is opt-in. In monorepo setups, use the `--recursive` flag to scan all workspace packages for skills.

### Symlink Creation

Once discovered, skills are symlinked to agent-specific directories (e.g., `.cursor/skills/`, `.claude/skills/`). The tool automatically detects which agents are present and creates symlinks accordingly.

## Convention 2: the `skills` field

**Declare skills you curate but don't own in a `skills` field of `package.json`.**

Not every skill is published to npm, and not every useful set of skills comes from a single tool. Teams and individuals still want to share a curated list. The `skills` field lists remote skills by their git source; installing the package installs the list:

```json
{
  "name": "@acme/frontend-skills",
  "skills": [
    "vercel-labs/agent-skills#v1.4.0@web-design-guidelines",
    { "source": "antfu/skills", "ref": "v2.3.0", "skills": ["antfu", "antfu-design"] },
    "npm:@vueuse/skills"
  ]
}
```

A package whose only content is this field is a **skills pack**: versioned, publishable to private registries, composable through `dependencies`, and installed with `npm install` like anything else.

The field's syntax and semantics are specified in [SPEC.md](./SPEC.md). In short: entries are git-hosted sources in the exact grammar the `skills` CLI already accepts, plus `npm:<package>` to curate skills shipped under another package's `skills/` directory. Local paths are not allowed; a package that wants to ship files uses Convention 1.

`skills-npm` honors the field in the same packages it scans for `skills/` directories, and drives the `skills` CLI to fetch remote entries into the consumer's agent directories. The consumer, never the pack, decides which agents receive the skills.

## Benefits

### Version Alignment

Skills ship with the exact tool version they're designed for. When you run `npm update my-tool`, both the tool and its skills update together. No more compatibility guessing.

### Zero Friction Sharing

Teams share skills by adding them as dependencies, whether a tool that ships its own skills or a skills pack that curates others. The skills are available to everyone who runs `npm install`. No extra steps, no manual cloning; for shipped skills, no files to commit either.

### Leverages npm Ecosystem

This convention inherits all the benefits of npm:

- **Semantic versioning** - Pin exact versions or allow ranges
- **Lockfiles** - Reproducible installations across machines
- **Private registries** - Host proprietary skills on private npm registries
- **Workspaces** - Develop skills locally in monorepos

## For Package Authors

Shipping skills you own:

1. Add a `skills/` directory to your package with one subdirectory per skill
2. Each skill directory must contain a `SKILL.md` following the [Agent Skills specification](https://agentskills.io/specification)
3. Include `skills` in your `package.json`'s `files` array

Curating skills you don't own:

1. Add a `skills` field to your `package.json` listing the sources, following [SPEC.md](./SPEC.md)
2. Pin each entry to a tag or commit so every consumer gets the same content
3. For `npm:` entries, list the referenced package in your `dependencies`

## For Users

```bash
# Install packages as usual
npm install my-awesome-tool @acme/frontend-skills

# Discover, symlink and fetch skills
npx skills-npm
```

## Relationship to the `skills` CLI

This proposal builds on [vercel-labs/skills](https://github.com/vercel-labs/skills) rather than replacing it. The two approaches divide the work:

| Concern | npm package (`skills-npm`) | `skills` CLI |
|---------|----------------------------|--------------|
| Skills owned by a tool | Shipped in `skills/`, symlinked from `node_modules` | - |
| Curated lists | Declared in the `skills` field, shared as a dependency | - |
| Fetching remote skills | Delegates to the CLI | Clones and installs |
| Installed-state record | `skills-npm-lock.json` (what came from which package) | `skills-lock.json` (source and content hash) |
| Reproducibility | npm lockfile + pinned refs | `skills-lock.json` |

`skills-npm` never re-implements source parsing, cloning, or agent-directory layout for remote skills: it invokes the CLI and lets it own the result. Skills installed by hand with `npx skills add` are left untouched.

## Specification Summary

1. **Directory**: Skills a package owns live in `skills/` at the package root, one subdirectory per skill, each containing a `SKILL.md` that follows the [Agent Skills specification](https://agentskills.io/specification)
2. **Field**: Skills a package curates are listed in the `skills` field of `package.json`, as specified in [SPEC.md](./SPEC.md)
3. **Discovery**: Tools scan the packages they honor for both `skills/*/SKILL.md` and a `skills` field
4. **Activation**: Owned skills are symlinked into agent-specific directories; curated skills are fetched into them by the `skills` CLI

## References

- [Agent Skills Specification](https://agentskills.io)
- [SPEC.md](./SPEC.md) - The `skills` field
- [vercel-labs/skills](https://github.com/vercel-labs/skills) - Git-based skills CLI
