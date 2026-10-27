/**
 * peak.yaml: one small file per repo that says what the repo is, what owns what, and what to read
 * first, for people and coding agents alike. This module is the parser. It has no dependencies and
 * reads an already-parsed YAML/JSON value, so it runs in Node, Workers and browsers.
 * The format is in SPEC.md; the JSON Schema is peak.schema.json.
 */
/** The format version this parser reads. A file may say `version: 1`; leaving it out means 1. */
export declare const SPEC_VERSION = 1;
/** The JSON Schema, for `# yaml-language-server: $schema=…` and links from tools. */
export declare const SCHEMA_URL = "https://raw.githubusercontent.com/bergaaberg/peak/main/peak.schema.json";
/** The spec, for links in tools' error messages. */
export declare const SPEC_URL = "https://github.com/bergaaberg/peak/blob/main/SPEC.md";
/** The file names, in the order a tool looks for them. */
export declare const FILES: readonly ["peak.yaml", "peak.yml"];
/** The format's old names (Dovre's `range.yaml`). Tools may read them, and should suggest the rename. */
export declare const LEGACY_FILES: readonly ["range.yaml", "range.yml"];
/** The tiers the spec names. Any other word is allowed and kept as written. */
export declare const TIERS: readonly ["active", "maintained", "scratch"];
export type Tier = (typeof TIERS)[number] | (string & {});
export type Component = {
    name: string;
    /** Paths or globs, relative to the repo root, that this component owns. */
    owns: string[];
    /** A repo-relative file with the rules for working in this component. */
    rules?: string;
    /** Who answers for this component, when not the repo's owner: `@user` or `@org/team`. */
    owner?: string;
};
/** The kinds of deployed things `runs` can name, in the order the spec lists them. */
export declare const KINDS: readonly ["workers", "databases", "stores", "buckets", "queues"];
export type Kind = (typeof KINDS)[number];
/**
 * One deployed thing, by the name its provider knows it by. A name ending in `*` is a pattern:
 * it stands for every one with that prefix that no entry before it in the same list names.
 */
export type Resource = {
    name: string;
    /** Where it runs, when not the file's `provider` (a word, e.g. cloudflare). */
    provider?: string;
    /** The component it belongs to (a `components` name). */
    component?: string;
    /** Workers only: the hostnames a static-files-only worker serves, so its traffic can be found. */
    hosts?: string[];
    /** Workers only: the Durable Object classes it holds (they live inside the worker). */
    objects?: string[];
};
/** What the repo deploys, by kind. Only kinds the file names are present. */
export type Runs = Partial<Record<Kind, Resource[]>>;
/** Something the repo depends on: another repo's peak, or an outside service. */
export type Use = {
    repo: string; /** Which of that repo's `runs` entries, when not all of it. */
    what?: string;
    why?: string;
} | {
    service: string;
    why?: string;
};
/** An environment other than production: only what differs from it. */
export type Environment = {
    url?: string;
    runs?: Runs;
};
export type Peak = {
    version: number;
    name: string;
    description?: string;
    url?: string;
    tier: Tier;
    /** Who answers for the repo: `@user` or `@org/team`. */
    owner?: string;
    /** Where its `runs` entries run unless they say otherwise (a word, e.g. cloudflare). */
    provider?: string;
    components: Component[];
    /** Label → repo-relative path, e.g. `architecture: ARCHITECTURE.md`. */
    docs: Record<string, string>;
    health?: {
        /** Names of deployed services (e.g. Cloudflare Workers) a dashboard should watch. */
        workers?: string[];
        /** URLs that should answer. */
        links?: string[];
    };
    /** What it deploys, in production. */
    runs?: Runs;
    /** What it depends on. */
    uses: Use[];
    /** Other environments by name (staging, preview, …): only what differs from production. */
    environments: Record<string, Environment>;
};
/**
 * A file that can be used (`peak`), or one that can't (`problems`). Either way `warnings` lists
 * what a tool may point out without refusing the file (an unknown key, a dropped value).
 */
export type Parsed = {
    peak: Peak;
    warnings: string[];
} | {
    problems: string[];
    warnings: string[];
};
/** Reads one peak.yaml's parsed value (from any YAML or JSON parser). */
export declare function parsePeak(raw: unknown): Parsed;
/**
 * What one environment runs (production when `env` is left out): its own entries for each kind
 * it names, production's for the rest. `health.workers` counts as production workers, after
 * `runs.workers` and without repeats. Every entry carries its provider, from the file when it
 * doesn't name one.
 */
export declare function runsIn(peak: Peak, env?: string): Runs;
