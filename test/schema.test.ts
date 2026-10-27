import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { KINDS, SCHEMA_URL } from "../src/index.ts";

const schema = JSON.parse(readFileSync(new URL("../peak.schema.json", import.meta.url), "utf8"));

test("the schema's $id is the URL the parser and examples point at", () => {
  assert.equal(schema.$id, SCHEMA_URL);
  for (const ex of ["single-app", "monorepo", "scratch", "catalog"]) {
    assert.ok(readFileSync(new URL(`../examples/${ex}/peak.yaml`, import.meta.url), "utf8").startsWith(`# yaml-language-server: $schema=${SCHEMA_URL}\n`), ex);
  }
});

test("the schema names the same keys the parser reads", () => {
  assert.deepEqual(Object.keys(schema.properties).sort(), ["$schema", "components", "description", "docs", "environments", "health", "name", "owner", "provider", "runs", "tier", "url", "uses", "version"]);
  assert.deepEqual(Object.keys(schema.properties.components.items.properties).sort(), ["name", "owner", "owns", "rules"]);
  assert.deepEqual(Object.keys(schema.properties.health.properties).sort(), ["links", "workers"]);
  assert.deepEqual(Object.keys(schema.definitions.runs.properties), [...KINDS]);
  assert.deepEqual(Object.keys(schema.definitions.runs.properties.workers.items.anyOf[1].properties).sort(), ["component", "hosts", "name", "objects", "provider"]);
  assert.deepEqual(schema.required, ["name"]);
});
