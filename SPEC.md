# peak.yaml, version 1

`peak.yaml` is one small file at the root of a repo. It says what the repo is, how much care it
gets, which part owns which files, and what to read before touching anything. People read it,
and so do coding agents and dashboards.

Why a separate file: a coding agent that starts work in an unfamiliar repo needs the boundaries
and the rules before its first edit. README.md is written for users, AGENTS.md / CLAUDE.md for
how to work, CODEOWNERS for who reviews. None of them says "this folder is the checkout service,
its rules are in that file, and this repo is a scratchpad". peak.yaml does, in a form a program
can read.

The name: if your repos are a mountain range, each repo is one peak in it.

## Where it lives

At the repo root, as `peak.yaml` (or `peak.yml`). Tools look for `peak.yaml` first. Dovre's
earlier name for the same format, `range.yaml`, is read as a fallback by Dovre and `peak check`,
which suggest the rename.

For editor completion and checks, start the file with:

```yaml
# yaml-language-server: $schema=https://raw.githubusercontent.com/bergaaberg/peak/main/peak.schema.json
```

## Fields

| Field | Required | Type | What it means |
| --- | --- | --- | --- |
| `version` | no | `1` | The format version. Leaving it out means 1. A file with another number is refused, so the format can change later without old tools misreading new files. |
| `name` | **yes** | text | The project's name, as people say it (`Quill`, not `quill-monorepo`). |
| `description` | no | text | One sentence on what it is. |
| `url` | no | http(s) URL | Where it runs or is published. |
| `tier` | no | word | How much care the repo gets. Default `active`. See [Tiers](#tiers). |
| `components` | no | list | The parts of the repo. Each has `name` (required), `owns` (required: a non-empty list of paths or globs relative to the root) and `rules` (optional: a repo-relative file with that part's rules). |
| `docs` | no | mapping | What to read first, as `label: path` (e.g. `architecture: ARCHITECTURE.md`). Labels are free text. |
| `health` | no | mapping | What a dashboard should watch: `workers` (names of deployed services, e.g. Cloudflare Workers) and `links` (http(s) URLs that should answer). |

Paths are relative to the repo root. `owns` entries are written the way people write them in
CODEOWNERS or .gitignore (`src/web/`, `packages/db/**`); tools treat a trailing `/` as "this
folder and everything in it".

### Tiers

| Tier | Means | What an agent should take from it |
| --- | --- | --- |
| `active` | Worked on now. Changes go through review and CI. | Follow the rules files, keep tests green, open a PR. |
| `maintained` | Kept working, rarely changed. | Small, careful changes. Don't refactor or upgrade beyond the task. |
| `scratch` | Experiments. Nothing here ships. | Move fast; it's fine to break things. |

Other words (`deprecated`, `platform`, …) are allowed and kept as written. Tools that don't know
a word treat it like `active`.

## Problems and warnings

A file that breaks a rule above has **problems**, and a tool should not use it (Dovre lists it on
/topo with the problems; `peak check` fails). Every problem is reported, not just the first.

Unknown keys, and `docs` entries that aren't paths, are **warnings**: the file is still used and
the extra keys are ignored. That leaves room for tools to experiment, but a key that matters
should come here first.

`peak check` also fails when a `docs` path or a component's `rules` file doesn't exist.

## Examples

A single app:

```yaml
version: 1
name: Quill
description: A newsletter platform for writers.
url: https://quill.example
docs:
  readme: README.md
  rules: AGENTS.md
```

A monorepo:

```yaml
version: 1
name: Northwind
description: The shop, its checkout and the catalog service.
tier: active
components:
  - name: web
    owns: [apps/web/, packages/ui/]
    rules: apps/web/AGENTS.md
  - name: checkout
    owns: [services/checkout/**]
    rules: services/checkout/RULES.md
docs:
  architecture: ARCHITECTURE.md
health:
  workers: [northwind-web, northwind-checkout]
```

A scratch repo:

```yaml
name: spikes
description: Throwaway experiments. Nothing here ships.
tier: scratch
```

More in [examples/](examples/).

## How it compares

- **Backstage `catalog-info.yaml`** describes a service for an organisation's catalog: owner,
  lifecycle, APIs, dependencies, and it needs Backstage to mean anything. peak.yaml is smaller,
  describes the repo from the inside (which folder is which part), and is read straight from the
  checkout. `tier` is close to Backstage's `lifecycle`; `components` are folders, not services.
- **CODEOWNERS** maps paths to reviewers. `owns` maps paths to *parts of the system*, and a part
  points at its rules, not at people. A repo can have both.
- **AGENTS.md / CLAUDE.md** hold the rules in prose. peak.yaml doesn't repeat them: it points at
  them (`docs`, a component's `rules`), so a tool knows which rules apply to which files.

## Tools that read it

- [Dovre](https://github.com/bergaaberg/dovre): its Topo (/topo) lists every checkout's
  peak, Bino (the assistant) gets each repo's tier, components and docs as context, `/agents/new`
  offers "focus on this component" with its paths and rules, and pull requests show the repo's
  tier and docs.
- `peak check` (this repo) validates files locally and in CI.

## Changes

Version 1 is the first published version, the same shape as Dovre's `range.yaml` plus `version`.
A change that would make an existing valid file mean something else gets a new version number.
