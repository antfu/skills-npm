# The `skills` field in `package.json`

> A convention for declaring [agent skills](https://agentskills.io) that a package wants installed, without shipping their files. Companion to the `skills/` directory convention in [PROPOSAL.md](./PROPOSAL.md).

The key words MUST, MUST NOT, SHOULD, and MAY are to be interpreted as described in [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119).

## Purpose

The `skills/` directory convention covers skills a package *owns*. The `skills` field covers skills a package *curates*: a list of skills hosted elsewhere that should be installed alongside the package. A package whose only content is a `skills` field is a **skills pack**: a shareable, versionable, curated list distributed through npm.

## Location

The field is a top-level key named `skills` in `package.json`. It MAY appear in any package: the root project, a direct dependency, or a transitive one. Which packages a tool honors is the tool's choice and SHOULD follow the same rule it uses to discover `skills/` directories.

## Shape

```json
{
  "skills": [
    "vercel-labs/agent-skills@web-design-guidelines",
    "owner/repo#v1.2.0",
    "https://github.com/owner/repo/tree/main/skills/some-skill",
    { "source": "owner/repo", "skills": ["a", "b"], "ref": "v2.0.0" },
    "npm:@vueuse/skills",
    { "source": "npm:@vueuse/skills", "skills": ["vueuse-functions"] }
  ]
}
```

The value is an array of **entries**. An entry is either a string or an object:

| Form | Meaning |
|------|---------|
| `"<source>"` | Install every skill the source provides. |
| `{ "source": "<source>", "skills"?: string[], "ref"?: string }` | Install only the named skills; optionally pin a git ref. |

- `source` (required) follows the grammar below.
- `skills` (optional) is a list of skill names. A name matches a skill's folder name or its sanitized `SKILL.md` frontmatter `name`. Omitted or empty means "all".
- `ref` (optional) is a git branch, tag, or full 40-character commit SHA (abbreviated SHAs are not resolvable over the git wire protocol). It MUST NOT be combined with a source that already carries a ref (`#ref` fragment or `/tree/<ref>/` path). It MUST NOT be used with an `npm:` source.

## Source grammar

There are two kinds of source.

### Remote sources

Any git-hosted source string accepted by the [`skills` CLI](https://github.com/vercel-labs/skills):

| Example | Meaning |
|---------|---------|
| `owner/repo` | All skills in a GitHub repository. |
| `owner/repo@skill` | One skill; shorthand for `{ "source": "owner/repo", "skills": ["skill"] }`. |
| `owner/repo#ref`, `owner/repo#ref@skill` | Pinned to a branch, tag, or commit. |
| `owner/repo/sub/path` | Skills under a subdirectory. |
| `https://github.com/owner/repo/tree/<ref>/<path>` | GitHub URL with ref and path. |
| `https://gitlab.com/group/repo/-/tree/<ref>/<path>` | GitLab URL. |
| `git@host:owner/repo.git`, `https://host/owner/repo.git` | Any git URL. |

The authoritative grammar is the CLI's own source parser; this spec does not redefine it.

Not allowed:

- **Local paths** (`./x`, `../x`, `/abs`, `C:\x`). A package that wants to ship skill files MUST use the `skills/` directory convention instead.
- **Non-git HTTP sources** (arbitrary URLs, `/.well-known/agent-skills` indexes, skills.sh packs). These MAY be permitted by a future revision.

### npm sources

`npm:<package-name>` refers to the `skills/` directory of an installed npm package, resolved with Node module resolution starting from the **declaring** package. The declaring package SHOULD list `<package-name>` in its `dependencies` so that resolution succeeds for consumers.

This is the only prefix not delegated to the `skills` CLI: no network is involved; tools reuse whatever mechanism they already have for `skills/` directories.

## Semantics

Given the set of packages a tool honors, the desired skill set is the **union** of every entry in every honored `skills` field, plus the skills found in `skills/` directories as before.

Tools:

1. MUST install remote entries at **project scope** into the agent directories the *consumer* selects. Packs do not choose agents.
2. MUST treat identical requests (same source, same ref, same skill list) from several packages as one.
3. MUST NOT install anything for a local-path or non-git HTTP entry, and SHOULD report it as an error.
4. SHOULD group entries that share a normalized source and ref into a single fetch.
5. SHOULD resolve name collisions deterministically and report the losers. A recommended order: a skill the user installed explicitly outside the tool wins; a skill shipped in a `skills/` directory wins over a remote one of the same name; a request from a direct dependency wins over one from a transitive dependency; remaining ties are skipped.
6. SHOULD skip a remote entry that is already installed rather than fetch it again, and SHOULD provide a way to force a refetch.
7. SHOULD remove skills they previously installed on behalf of a `skills` field once no honored package requests them anymore, and MUST NOT remove skills they did not install.

## Pinning

Entries SHOULD pin a ref (`#<tag|commit>` or `"ref"`) so a pack resolves to the same content for every consumer. Tools MAY warn on unpinned entries but MUST accept them.

## Example: a skills pack

```json
{
  "name": "@acme/frontend-skills",
  "version": "1.0.0",
  "skills": [
    "vercel-labs/agent-skills#v1.4.0@web-design-guidelines",
    { "source": "antfu/skills", "ref": "v2.3.0", "skills": ["antfu", "antfu-design"] },
    "npm:@vueuse/skills"
  ],
  "dependencies": {
    "@vueuse/skills": "^1.0.0"
  }
}
```

A consumer runs `npm i -D @acme/frontend-skills` and their skills tool installs the three remote skills and symlinks the `@vueuse/skills` skills, exactly as if the consumer had listed them.
