/**
 * peak.yaml: one small file per repo that says what the repo is, what owns what, and what to read
 * first, for people and coding agents alike. This module is the parser. It has no dependencies and
 * reads an already-parsed YAML/JSON value, so it runs in Node, Workers and browsers.
 * The format is in SPEC.md; the JSON Schema is peak.schema.json.
 */
/** The format version this parser reads. A file may say `version: 1`; leaving it out means 1. */
export const SPEC_VERSION = 1;
/** The JSON Schema, for `# yaml-language-server: $schema=…` and links from tools. */
export const SCHEMA_URL = "https://raw.githubusercontent.com/bergaaberg/peak/main/peak.schema.json";
/** The spec, for links in tools' error messages. */
export const SPEC_URL = "https://github.com/bergaaberg/peak/blob/main/SPEC.md";
/** The file names, in the order a tool looks for them. */
export const FILES = ["peak.yaml", "peak.yml"];
/** The format's old names (Dovre's `range.yaml`). Tools may read them, and should suggest the rename. */
export const LEGACY_FILES = ["range.yaml", "range.yml"];
/** The tiers the spec names. Any other word is allowed and kept as written. */
export const TIERS = ["active", "maintained", "scratch"];
const KEYS = new Set(["$schema", "version", "name", "description", "url", "tier", "components", "docs", "health"]);
const isMap = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v) => (typeof v === "string" ? v.trim() : "");
const strList = (v) => Array.isArray(v) && v.every((x) => typeof x === "string") ? v.map((x) => x.trim()).filter(Boolean) : null;
const webUrl = (u) => {
    try {
        const p = new URL(u).protocol;
        return p === "https:" || p === "http:";
    }
    catch {
        return false;
    }
};
/** Reads one peak.yaml's parsed value (from any YAML or JSON parser). */
export function parsePeak(raw) {
    const warnings = [];
    if (!isMap(raw))
        return { problems: ["The file must be a mapping (key: value lines)."], warnings };
    const problems = [];
    for (const k of Object.keys(raw))
        if (!KEYS.has(k))
            warnings.push(`Unknown key "${k}" (ignored).`);
    let version = SPEC_VERSION;
    if (raw.version !== undefined) {
        if (raw.version !== SPEC_VERSION)
            problems.push(`version must be ${SPEC_VERSION} (this parser reads version ${SPEC_VERSION}).`);
        else
            version = raw.version;
    }
    const name = str(raw.name);
    if (!name)
        problems.push("name is required.");
    const description = str(raw.description) || undefined;
    const url = str(raw.url) || undefined;
    if (url && !webUrl(url))
        problems.push("url must be an http(s) URL.");
    if (raw.tier !== undefined && typeof raw.tier !== "string")
        problems.push("tier must be a word, e.g. active, maintained or scratch.");
    const tier = str(raw.tier) || "active";
    const components = [];
    if (raw.components !== undefined && raw.components !== null) {
        if (!Array.isArray(raw.components))
            problems.push("components must be a list.");
        else
            raw.components.forEach((c, i) => {
                const at = `components[${i}]`;
                if (!isMap(c))
                    return void problems.push(`${at} must be a mapping with name and owns.`);
                const cname = str(c.name);
                if (!cname)
                    problems.push(`${at}: name is required.`);
                const owns = strList(c.owns);
                if (!owns || owns.length === 0)
                    problems.push(`${at}${cname ? ` (${cname})` : ""}: owns must be a non-empty list of paths.`);
                if (c.rules !== undefined && typeof c.rules !== "string")
                    problems.push(`${at}: rules must be a path.`);
                for (const k of Object.keys(c))
                    if (!["name", "owns", "rules"].includes(k))
                        warnings.push(`${at}: unknown key "${k}" (ignored).`);
                components.push({ name: cname, owns: owns ?? [], ...(str(c.rules) ? { rules: str(c.rules) } : {}) });
            });
    }
    const docs = {};
    if (raw.docs !== undefined && raw.docs !== null) {
        if (!isMap(raw.docs))
            problems.push("docs must be a mapping of label: path.");
        else
            for (const [k, v] of Object.entries(raw.docs)) {
                if (typeof v === "string" && v.trim())
                    docs[k] = v.trim();
                else
                    warnings.push(`docs.${k} is not a path (ignored).`);
            }
    }
    let health;
    if (raw.health !== undefined && raw.health !== null) {
        if (!isMap(raw.health))
            problems.push("health must be a mapping with workers and/or links.");
        else {
            const workers = raw.health.workers === undefined ? undefined : strList(raw.health.workers);
            const links = raw.health.links === undefined ? undefined : strList(raw.health.links);
            if (workers === null)
                problems.push("health.workers must be a list of names.");
            if (links === null)
                problems.push("health.links must be a list of URLs.");
            for (const l of links ?? [])
                if (!webUrl(l))
                    problems.push(`health.links: "${l}" is not an http(s) URL.`);
            health = { ...(workers ? { workers } : {}), ...(links ? { links } : {}) };
        }
    }
    if (problems.length)
        return { problems, warnings };
    return {
        peak: { version, name, ...(description ? { description } : {}), ...(url ? { url } : {}), tier, components, docs, ...(health ? { health } : {}) },
        warnings,
    };
}
