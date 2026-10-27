import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { parsePeak, runsIn, SPEC_VERSION, type Parsed } from "../src/index.ts";

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
  assert.deepEqual(p, { version: SPEC_VERSION, name: "spikes", tier: "active", components: [], docs: {}, uses: [], environments: {} });
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
  const r = parsePeak({ name: "x", maintainer: "me", docs: { a: "A.md", b: 3 }, components: [{ name: "w", owns: ["w"], team: "t" }] });
  const p = ok(r);
  assert.deepEqual(p.docs, { a: "A.md" });
  assert.deepEqual(r.warnings, ['Unknown key "maintainer" (ignored).', 'components[0]: unknown key "team" (ignored).', "docs.b is not a path (ignored)."]);
  assert.deepEqual(parsePeak({ name: "x", $schema: "https://…" }).warnings, []);
});

test("empty sections (components:, docs:, health: with nothing after) are fine", () => {
  const p = ok(parsePeak(parse("name: x\ncomponents:\ndocs:\nhealth:\n")));
  assert.deepEqual([p.components, p.docs, p.health], [[], {}, undefined]);
});

test("catalog: owner, provider, runs, uses and environments", () => {
  const p = ok(parsePeak(parse(readFileSync(new URL("../examples/catalog/peak.yaml", import.meta.url), "utf8"))));
  assert.equal(p.owner, "@skribb/core");
  assert.equal(p.provider, "cloudflare");
  assert.equal(p.components[1]!.owner, "@skribb/cms");
  assert.deepEqual(p.runs?.workers, [
    { name: "skribb-web", component: "web", objects: ["Hub"] },
    { name: "skribb-assets", hosts: ["skribb.example", "www.skribb.example"] },
    { name: "skribb-cms-*" },
    { name: "skribb-*" },
  ]);
  assert.deepEqual(p.runs?.buckets, [{ name: "skribb-media" }]);
  assert.deepEqual(p.uses, [
    { repo: "northwind/billing" },
    { repo: "northwind/identity", what: "identity-api", why: "sign-in" },
    { service: "stripe", why: "payments" },
    { service: "resend" },
  ]);
  assert.deepEqual(Object.keys(p.environments), ["staging"]);
});

test("runsIn: production by default, an environment's kinds replace production's, the rest are shared", () => {
  const p = ok(parsePeak(parse(readFileSync(new URL("../examples/catalog/peak.yaml", import.meta.url), "utf8"))));
  const prod = runsIn(p);
  assert.equal(prod.workers?.[0]!.provider, "cloudflare", "the file's provider fills in");
  const staging = runsIn(p, "staging");
  assert.deepEqual(staging.workers, [{ name: "skribb-web-staging", provider: "cloudflare" }]);
  assert.deepEqual(staging.databases, [{ name: "skribb-staging", provider: "cloudflare" }]);
  assert.deepEqual(staging.buckets, prod.buckets, "not named: shared with production");
  assert.deepEqual(runsIn(p, "nope"), prod, "an unknown environment is production");
});

test("runsIn: health.workers count as production workers, after runs.workers, without repeats", () => {
  const p = ok(parsePeak({ name: "x", runs: { workers: ["a"] }, health: { workers: ["a", "b"] } }));
  assert.deepEqual(runsIn(p).workers, [{ name: "a" }, { name: "b" }]);
  assert.deepEqual(runsIn(ok(parsePeak({ name: "x", health: { workers: ["w"] } }))).workers, [{ name: "w" }], "old files keep working");
  assert.deepEqual(ok(parsePeak({ name: "x" })).uses, []);
});

test("problems in the catalog fields", () => {
  const p = (v: object) => bad(parsePeak({ name: "x", ...v })).join("; ");
  assert.match(p({ owner: "bergaaberg" }), /owner must be a forge handle/);
  assert.match(p({ components: [{ name: "w", owns: ["a"], owner: "team" }] }), /components\[0\]: owner must be a forge handle/);
  assert.match(p({ provider: "Cloud Flare" }), /provider must be a lowercase word/);
  assert.match(p({ runs: ["a"] }), /runs must be a mapping/);
  assert.match(p({ runs: { workers: "a" } }), /runs.workers must be a list/);
  assert.match(p({ runs: { workers: ["a*b"] } }), /a \* may only end a name/);
  assert.match(p({ runs: { workers: ["*"] } }), /a \* may only end a name/);
  assert.match(p({ runs: { workers: [{ hosts: ["a.b"] }] } }), /name is required/);
  assert.match(p({ runs: { workers: [{ name: "a", component: "web" }] } }), /component "web" is not one of components/);
  assert.match(p({ runs: { workers: [{ name: "a", hosts: [] }] } }), /hosts must be a non-empty list/);
  assert.match(p({ runs: { workers: [{ name: "a", hosts: ["https://a.b"] }] } }), /is not a hostname/);
  assert.match(p({ runs: { workers: [{ name: "a", objects: ["my-hub"] }] } }), /is not a class name/);
  assert.match(p({ runs: { workers: [{ name: "a", objects: "Hub" }] } }), /objects must be a non-empty list/);
  assert.match(p({ uses: "stripe" }), /uses must be a list/);
  assert.match(p({ uses: ["Stripe Inc"] }), /lowercase word for a service/);
  assert.match(p({ uses: ["a/b/c"] }), /is not a repo/);
  assert.match(p({ uses: [{ repo: "a/b", service: "c" }] }), /exactly one of repo and service/);
  assert.match(p({ uses: [{ why: "x" }] }), /exactly one of repo and service/);
  assert.match(p({ environments: { production: { url: "https://a.b" } } }), /production is the file itself/);
  assert.match(p({ environments: { Staging: {} } }), /lowercase word/);
  assert.match(p({ environments: { staging: { url: "ftp://a" } } }), /environments.staging.url must be an http\(s\) URL/);
  assert.match(p({ environments: { staging: "x" } }), /must be a mapping/);
});

test("warnings in the catalog fields: unknown kinds and keys, hosts off a worker", () => {
  const r = parsePeak({ name: "x", runs: { functions: ["a"], databases: [{ name: "d", hosts: ["a.b"], objects: ["X"], size: 1 }] }, uses: [{ service: "s", url: "u" }], environments: { staging: { branch: "dev" } } });
  assert.ok("peak" in r);
  assert.deepEqual(r.warnings, [
    'runs: unknown kind "functions" (ignored; known: workers, databases, stores, buckets, queues).',
    'runs.databases[0]: unknown key "size" (ignored).',
    "runs.databases[0]: hosts is for workers only (ignored).",
    "runs.databases[0]: objects is for workers only (ignored).",
    'uses[0]: unknown key "url" (ignored).',
    'environments.staging: unknown key "branch" (ignored).',
  ]);
});
