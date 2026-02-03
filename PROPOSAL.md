# npm-based Agent Skills Convention

> A proposal for shipping agent skills inside npm packages to solve version alignment and distribution challenges.

## Introduction

[Agent Skills](https://agentskills.io) is an open format for giving AI coding agents new capabilities and expertise. Skills are folders containing `SKILL.md` files that agents can discover and use to perform tasks more accurately and efficiently.

While the Agent Skills standard defines *what* skills are, the ecosystem still lacks a mature solution for *how* skills should be distributed, versioned, and managed. This proposal introduces a convention for shipping skills inside npm packages, leveraging the npm ecosystem's battle-tested infrastructure for dependency management.

## Problem Statement

Current approaches to skill distribution, such as cloning skills from git repositories via tools like [`npx skills add`](https://github.com/vercel-labs/skills), have several limitations:

### 1. Distribution Fragmentation

Skills live in separate repositories, disconnected from the tools they enhance. Users must manually discover, clone, and manage skills independently of their tooling. This creates friction and cognitive overhead.

### 2. Version Misalignment

Skills and tools are installed and updated separately. When a skill is updated to leverage new tool capabilities, users running older tool versions may experience unexpected behavior or errors. There's no built-in mechanism to ensure compatibility between skill versions and tool versions.

### 3. Sharing Friction

Sharing skills across teams and projects is cumbersome:

- **Committing cloned skills** pollutes repositories with duplicated content that's hard to sync with upstream
- **Re-cloning on each machine** is manual and error-prone
- **Working across many projects** means repeating the setup process everywhere

## Proposed Convention

This proposal introduces a simple convention: **ship official skills inside npm packages under a `skills/` directory**.

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

This pattern finds skills in direct dependencies, nested dependencies, and workspace packages.

In monorepo setups, use the `--recursive` flag to scan all workspace packages for skills, and `--ignore-paths` to exclude specific directories from the search.

### Symlink Creation

Once discovered, skills are symlinked to agent-specific directories (e.g., `.cursor/skills/`, `.claude/skills/`). The tool automatically detects which agents are present and creates symlinks accordingly.

## Benefits

### Version Alignment

Skills ship with the exact tool version they're designed for. When you run `npm update my-tool`, both the tool and its skills update together. No more compatibility guessing.

### Zero Friction Sharing

Teams share skills by adding them as dependencies. The skill is available to everyone who runs `npm install`. No extra steps, no manual cloning, no files to commit.

### Leverages npm Ecosystem

This convention inherits all the benefits of npm:

- **Semantic versioning** - Pin exact versions or allow ranges
- **Lockfiles** - Reproducible installations across machines
- **Private registries** - Host proprietary skills on private npm registries
- **Workspaces** - Develop skills locally in monorepos

## For Package Authors

1. Add a `skills/` directory to your package with one subdirectory per skill
2. Each skill directory must contain a `SKILL.md` following the [Agent Skills specification](https://agentskills.io/specification)
3. Include `skills` in your `package.json`'s `files` array

## For Users

```bash
# Install packages as usual
npm install my-awesome-tool

# Discover and symlink skills
npx skills-npm
```

## Comparison with Git-based Approach

| Aspect | Git-based (`npx skills add`) | npm-based (`skills-npm`) |
|--------|------------------------------|--------------------------|
| Version control | Separate from tool | Bundled with tool |
| Installation | Clone + symlink | `npm install` + symlink |
| Updates | Manual re-clone | `npm update` |
| Team sharing | Commit files or re-clone | Package dependency |

## Relationship to Existing Tools

This convention is **complementary** to existing tools like [vercel-labs/skills](https://github.com/vercel-labs/skills). The git-based approach remains valuable for skills from repositories that don't publish to npm, or for quick experimentation with community skills.

The npm-based convention is ideal for tool authors shipping official skills and teams wanting version-locked, reproducible installations.

## Specification Summary

1. **Directory**: Skills live in `skills/` at the package root
2. **Structure**: Each skill is a subdirectory containing `SKILL.md`
3. **Format**: `SKILL.md` follows the [Agent Skills specification](https://agentskills.io/specification)
4. **Discovery**: Tools scan `node_modules/**/skills/*/SKILL.md`
5. **Activation**: Symlinks are created in agent-specific directories

## References

- [Agent Skills Specification](https://agentskills.io)
- [vercel-labs/skills](https://github.com/vercel-labs/skills) - Git-based skills CLI
