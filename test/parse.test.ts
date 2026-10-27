import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { parsePeak, SPEC_VERSION, type Parsed } from "../src/index.ts";

const ok = (r: Parsed) => {
  assert.ok("peak" in r, "problems" in r ? r.problems.join("; ") : "");
  return r.peak;
};
const bad = (r: Parsed) => {
  assert.ok("problems" in r, "expected problems");
  return r.problems;
};

test("the smallest file: a name; tier defaults to active, version to 1", () => {
  const p = ok(parsePeak({ name: "spikes" }));
  assert.deepEqual(p, { version: SPEC_VERSION, name: "spikes", tier: "active", components: [], docs: {} });
});

test("every field, trimmed", () => {
  const p = ok(parsePeak(parse(readFileSync(new URL("../examples/monorepo/peak.yaml", import.meta.url), "utf8"))));
  assert.equal(p.name, "Northwind");
  assert.equal(p.components.length, 3);
  assert.deepEqual(p.components[1], { name: "checkout", owns: ["services/checkout/**"], rules: "services/checkout/RULES.md" });
  assert.deepEqual(p.components[2], { name: "db", owns: ["packages/db/", "migrations/"] });
  assert.equal(p.docs.architecture, "ARCHITECTURE.md");
  assert.deepEqual(p.health, { workers: ["northwind-web", "northwind-checkout"], links: ["https://northwind.example", "https://api.northwind.example/health"] });
  assert.equal(ok(parsePeak({ name: "  x  ", tier: " scratch " })).tier, "scratch");
});

test("any tier word is kept", () => {
  assert.equal(ok(parsePeak({ name: "x", tier: "deprecated" })).tier, "deprecated");
});

test("problems: not a mapping, no name, a bad url, a wrong version", () => {
  assert.match(bad(parsePeak("name: x"))[0]!, /mapping/);
  assert.match(bad(parsePeak([]))[0]!, /mapping/);
  assert.match(bad(parsePeak(null))[0]!, /mapping/);
  assert.match(bad(parsePeak({ tier: "active" })).join(), /name is required/);
  assert.match(bad(parsePeak({ name: "x", url: "javascript:alert(1)" })).join(), /http\(s\) URL/);
  assert.match(bad(parsePeak({ name: "x", url: "not a url" })).join(), /http\(s\) URL/);
  assert.match(bad(parsePeak({ name: "x", version: 2 })).join(), /version must be 1/);
  assert.match(bad(parsePeak({ name: "x", tier: 3 })).join(), /tier must be a word/);
});

test("problems in components: not a list, not a mapping, no name, no owns", () => {
  assert.match(bad(parsePeak({ name: "x", components: "web" })).join(), /components must be a list/);
  assert.match(bad(parsePeak({ name: "x", components: ["web"] })).join(), /components\[0\] must be a mapping/);
  assert.match(bad(parsePeak({ name: "x", components: [{ owns: ["a"] }] })).join(), /components\[0\]: name is required/);
  assert.match(bad(parsePeak({ name: "x", components: [{ name: "web" }] })).join(), /components\[0\] \(web\): owns must be a non-empty list/);
  assert.match(bad(parsePeak({ name: "x", components: [{ name: "web", owns: [] }] })).join(), /owns must be a non-empty list/);
  assert.match(bad(parsePeak({ name: "x", components: [{ name: "web", owns: "src" }] })).join(), /owns must be a non-empty list/);
  assert.match(bad(parsePeak({ name: "x", components: [{ name: "web", owns: ["src"], rules: 1 }] })).join(), /rules must be a path/);
});

test("problems in docs and health", () => {
  assert.match(bad(parsePeak({ name: "x", docs: ["README.md"] })).join(), /docs must be a mapping/);
  assert.match(bad(parsePeak({ name: "x", health: "up" })).join(), /health must be a mapping/);
  assert.match(bad(parsePeak({ name: "x", health: { workers: "web" } })).join(), /health.workers must be a list/);
  assert.match(bad(parsePeak({ name: "x", health: { links: ["ftp://x"] } })).join(), /not an http\(s\) URL/);
});

test("every problem is listed, not just the first", () => {
  assert.equal(bad(parsePeak({ url: "nope", components: "x", docs: [] })).length, 4);
});

test("warnings: unknown keys and dropped docs don't refuse the file", () => {
  const r = parsePeak({ name: "x", owner: "me", docs: { a: "A.md", b: 3 }, components: [{ name: "w", owns: ["w"], team: "t" }] });
  const p = ok(r);
  assert.deepEqual(p.docs, { a: "A.md" });
  assert.deepEqual(r.warnings, ['Unknown key "owner" (ignored).', 'components[0]: unknown key "team" (ignored).', "docs.b is not a path (ignored)."]);
  assert.deepEqual(parsePeak({ name: "x", $schema: "https://…" }).warnings, []);
});

test("empty sections (components:, docs:, health: with nothing after) are fine", () => {
  const p = ok(parsePeak(parse("name: x\ncomponents:\ndocs:\nhealth:\n")));
  assert.deepEqual([p.components, p.docs, p.health], [[], {}, undefined]);
});
