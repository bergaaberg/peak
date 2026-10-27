# peak

**`peak.yaml`: one small file per repo that tells people and coding agents what the repo is,
what owns what, and what to read first.**

```yaml
# yaml-language-server: $schema=https://raw.githubusercontent.com/bergaaberg/peak/main/peak.schema.json
version: 1
name: Northwind
description: The shop, its checkout and the catalog service.
tier: active            # active · maintained · scratch
components:
  - name: checkout
    owns: [services/checkout/**]
    rules: services/checkout/RULES.md
docs:
  architecture: ARCHITECTURE.md
```

- **[SPEC.md](SPEC.md)**: the format, field by field, and how it compares to Backstage's
  catalog-info.yaml, CODEOWNERS and AGENTS.md.
- **[peak.schema.json](peak.schema.json)**: a JSON Schema for editor completion and checks.
- **[examples/](examples/)**: a single app, a monorepo, a scratch repo.
- **`@bergaaberg/peak`**: the parser (no dependencies, runs in Node, Workers and browsers) and
  the `peak check` command.

Read by [Dovre](https://github.com/bergaaberg/dovre)'s Repo Atlas, where the format started as
`range.yaml`.

## Check a repo

```sh
npx github:bergaaberg/peak#v0.1.0 check          # this folder
npx github:bergaaberg/peak#v0.1.0 check a/ b/    # several repos
```

It checks the format and that every `docs` path and `rules` file exists. Exit code 1 on any
problem.

In GitHub Actions:

```yaml
- uses: actions/checkout@v4
- uses: bergaaberg/peak@v0.1.0
```

## Use the parser

```sh
pnpm add github:bergaaberg/peak#v0.1.0
```

```ts
import { parse } from "yaml";
import { parsePeak } from "@bergaaberg/peak";

const r = parsePeak(parse(text));
if ("problems" in r) console.error(r.problems); // every problem, not just the first
else console.log(r.peak.tier, r.peak.components);
```

`parsePeak` takes the value any YAML or JSON parser gives you. It returns `{ peak, warnings }`
or `{ problems, warnings }`. It also exports `FILES`, `LEGACY_FILES`, `TIERS`, `SCHEMA_URL` and
`SPEC_URL`.

## Licence

MIT
