# peak

SPEC.md is the format; README.md is how to use it. This file holds the rules.

- `src/index.ts` (the parser) has no dependencies and imports nothing from `node:*`: it runs in
  Workers and browsers too. Only `src/cli.ts` touches the file system and the YAML parser.
- The parser, peak.schema.json and SPEC.md change together. `test/schema.test.ts` holds the key
  lists in step; a new field gets a line in all three and a test.
- A change that makes an existing valid file invalid, or mean something else, needs a new
  `version`. Adding an optional field doesn't.
- `dist/` is committed and must match `src/`: `pnpm check` before every commit.
