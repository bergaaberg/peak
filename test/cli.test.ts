import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { check } from "../src/cli.ts";

const repo = (files: Record<string, string>) => {
  const dir = mkdtempSync(join(tmpdir(), "peak-"));
  for (const [f, text] of Object.entries(files)) {
    mkdirSync(join(dir, f, ".."), { recursive: true });
    writeFileSync(join(dir, f), text);
  }
  return dir;
};

test("each example passes", () => {
  for (const ex of ["single-app", "monorepo", "scratch"]) {
    const r = check(new URL(`../examples/${ex}`, import.meta.url).pathname);
    assert.ok(r.ok, r.lines.join("\n"));
  }
});

test("a folder without a peak.yaml fails and links the spec", () => {
  const r = check(repo({ "README.md": "" }));
  assert.equal(r.ok, false);
  assert.match(r.lines[0]!, /no peak.yaml found\. See https:\/\/github\.com\/bergaaberg\/peak/);
});

test("docs and rules that don't exist are problems", () => {
  const r = check(repo({ "peak.yaml": "name: x\ndocs:\n  plan: PLAN.md\ncomponents:\n  - name: web\n    owns: [web/]\n    rules: web/RULES.md\n" }));
  assert.equal(r.ok, false);
  assert.match(r.lines.join("\n"), /docs\.plan: PLAN\.md doesn't exist/);
  assert.match(r.lines.join("\n"), /rules file web\/RULES\.md doesn't exist/);
});

test("broken YAML and format problems fail", () => {
  assert.match(check(repo({ "peak.yaml": "name: [x" })).lines[0]!, /not valid YAML/);
  const r = check(repo({ "peak.yaml": "tier: active\n" }));
  assert.equal(r.ok, false);
  assert.match(r.lines.join(), /name is required/);
});

test("range.yaml (the old name) passes with a rename warning; peak.yaml wins over it", () => {
  const old = check(repo({ "range.yaml": "name: x\n" }));
  assert.ok(old.ok);
  assert.match(old.lines[0]!, /rename it to peak\.yaml/);
  const both = check(repo({ "range.yaml": "tier: 1\n", "peak.yaml": "name: y\n" }));
  assert.ok(both.ok);
  assert.match(both.file!, /peak\.yaml$/);
});

test("a file path works as well as a folder", () => {
  const dir = repo({ "peak.yml": "name: z\n" });
  assert.ok(check(join(dir, "peak.yml")).ok);
  assert.ok(check(dir).ok);
});
