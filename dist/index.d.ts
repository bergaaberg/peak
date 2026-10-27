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
};
export type Peak = {
    version: number;
    name: string;
    description?: string;
    url?: string;
    tier: Tier;
    components: Component[];
    /** Label → repo-relative path, e.g. `architecture: ARCHITECTURE.md`. */
    docs: Record<string, string>;
    health?: {
        /** Names of deployed services (e.g. Cloudflare Workers) a dashboard should watch. */
        workers?: string[];
        /** URLs that should answer. */
        links?: string[];
    };
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
