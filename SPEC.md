# peak.yaml, version 1

`peak.yaml` is one small file at the root of a repo. It says what the repo is, how much care it
gets, which part owns which files, and what to read before touching anything. It can also say
what the repo deploys, what it depends on and who answers for it, so a set of repos reads as a
small service catalog. People read it, and so do coding agents and dashboards.

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
| `owner` | no | handle | Who answers for the repo: a forge handle, `@user` or `@org/team`. |
| `provider` | no | word | Where the `runs` entries run unless an entry says otherwise, e.g. `cloudflare`. Tools may assume one when it's left out. |
| `components` | no | list | The parts of the repo. Each has `name` (required), `owns` (required: a non-empty list of paths or globs relative to the root), `rules` (optional: a repo-relative file with that part's rules) and `owner` (optional: as above, when not the repo's). |
| `docs` | no | mapping | What to read first, as `label: path` (e.g. `architecture: ARCHITECTURE.md`). Labels are free text. |
| `runs` | no | mapping | What the repo deploys, in production. See [What it runs](#what-it-runs). |
| `uses` | no | list | What it depends on: other repos' peaks and outside services. See [What it uses](#what-it-uses). |
| `environments` | no | mapping | Environments other than production, with only what differs. See [Environments](#environments). |
| `health` | no | mapping | What a dashboard should watch beyond `runs`: `links` (http(s) URLs that should answer) and `workers` (read as production workers too; new files name them under `runs`). |

Paths are relative to the repo root. `owns` entries are written the way people write them in
CODEOWNERS or .gitignore (`src/web/`, `packages/db/**`); tools treat a trailing `/` as "this
folder and everything in it".

### What it runs

`runs` names what the repo deploys, by kind, by the names the provider knows them by:

| Kind | What |
| --- | --- |
| `workers` | Deployed services (Cloudflare Workers, functions, containers). |
| `databases` | Databases (D1, Postgres, …). |
| `stores` | Key-value stores (KV namespaces, …). |
| `buckets` | Object storage (R2, S3, …). |
| `queues` | Message queues. |

Each entry is a name, or a mapping with `name` and any of:

- `provider`: where this one runs, when not the file's `provider`.
- `component`: the component it belongs to (one of `components`), tying code to what runs it.
- `hosts` (workers only): for a worker that only serves static files and so never runs code of
  its own, the hostnames it serves. A dashboard counts their traffic as its.
- `objects` (workers only): the Durable Object classes it holds. They live inside the worker, so
  they're named on it rather than as a kind of their own.

A name ending in `*` is a pattern: it stands for every one with that prefix **not named before
it in the same list**. Order matters, so name the specific ones first:

```yaml
runs:
  workers: [skribb-web, skribb-cms-*, skribb-*]   # skribb-web alone, then the CMS tenants, then the rest
```

A `*` anywhere but the end is a problem. Unknown kinds are warnings.

### What it uses

`uses` lists what the repo depends on. Each entry is one of:

- `owner/name`: another repo, whose own peak.yaml says what it is.
- a lowercase word: an outside service (`stripe`, `resend`, `anthropic`). Words aren't checked
  against a list; write the service's usual name.
- a mapping with `repo` (and optionally `what`: which of that repo's `runs` entries, when not all
  of it) or with `service`, and optionally `why`.

```yaml
uses:
  - bergaaberg/dovre-control
  - repo: bergaaberg/skribb
    what: skribb-cms-*
    why: reads tenants' posts
  - service: stripe
    why: payments
```

### Environments

`url` and `runs` describe production. `environments` names the others (`staging`, `preview`, …)
with only what differs: its own `url`, and a `runs` whose kinds **replace** production's list of
that kind. A kind it doesn't name is shared with production. `production` is the file itself, so
it can't be named here.

```yaml
url: https://skribb.no
runs:
  workers: [skribb-web]
  databases: [skribb]
environments:
  staging:
    url: https://staging.skribb.no
    runs:
      workers: [skribb-web-staging]   # databases: shared with production
```

The parser's `runsIn(peak, env)` gives what one environment runs, with this applied.

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

Unknown keys, unknown `runs` kinds, `hosts` or `objects` on anything but a worker, and `docs` entries that
aren't paths, are **warnings**: the file is still used and
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
  points at its rules. `owner` names who answers for the repo or a part, not who reviews each
  file. A repo can have both.
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

Still version 1, every new field optional: `owner`, `provider`, `runs`, `uses`,
`environments`, and a component's `owner`. `health.workers` keeps its meaning and is read as
production workers alongside `runs.workers`. Older parsers warn on the new keys and use the rest.
A change that would make an existing valid file mean something else gets a new version number.
