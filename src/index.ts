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
export const FILES = ["peak.yaml", "peak.yml"] as const;

/** The format's old names (Dovre's `range.yaml`). Tools may read them, and should suggest the rename. */
export const LEGACY_FILES = ["range.yaml", "range.yml"] as const;

/** The tiers the spec names. Any other word is allowed and kept as written. */
export const TIERS = ["active", "maintained", "scratch"] as const;

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
export const KINDS = ["workers", "databases", "stores", "buckets", "queues"] as const;
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
};

/** What the repo deploys, by kind. Only kinds the file names are present. */
export type Runs = Partial<Record<Kind, Resource[]>>;

/** Something the repo depends on: another repo's peak, or an outside service. */
export type Use =
  | { repo: string; /** Which of that repo's `runs` entries, when not all of it. */ what?: string; why?: string }
  | { service: string; why?: string };

/** An environment other than production: only what differs from it. */
export type Environment = { url?: string; runs?: Runs };

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
export type Parsed = { peak: Peak; warnings: string[] } | { problems: string[]; warnings: string[] };

const KEYS = new Set(["$schema", "version", "name", "description", "url", "tier", "owner", "provider", "components", "docs", "health", "runs", "uses", "environments"]);

const OWNER = /^@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\/[A-Za-z0-9._-]+)?$/;
const REPO = /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/;
const WORD = /^[a-z][a-z0-9-]*$/;
const RESOURCE_KEYS = ["name", "provider", "component", "hosts"];

const isMap = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const strList = (v: unknown): string[] | null =>
  Array.isArray(v) && v.every((x) => typeof x === "string") ? v.map((x: string) => x.trim()).filter(Boolean) : null;

const webUrl = (u: string) => {
  try {
    const p = new URL(u).protocol;
    return p === "https:" || p === "http:";
  } catch {
    return false;
  }
};

/** Reads one peak.yaml's parsed value (from any YAML or JSON parser). */
export function parsePeak(raw: unknown): Parsed {
  const warnings: string[] = [];
  if (!isMap(raw)) return { problems: ["The file must be a mapping (key: value lines)."], warnings };
  const problems: string[] = [];

  for (const k of Object.keys(raw)) if (!KEYS.has(k)) warnings.push(`Unknown key "${k}" (ignored).`);

  let version = SPEC_VERSION;
  if (raw.version !== undefined) {
    if (raw.version !== SPEC_VERSION) problems.push(`version must be ${SPEC_VERSION} (this parser reads version ${SPEC_VERSION}).`);
    else version = raw.version;
  }

  const name = str(raw.name);
  if (!name) problems.push("name is required.");
  const description = str(raw.description) || undefined;
  const url = str(raw.url) || undefined;
  if (url && !webUrl(url)) problems.push("url must be an http(s) URL.");
  if (raw.tier !== undefined && typeof raw.tier !== "string") problems.push("tier must be a word, e.g. active, maintained or scratch.");
  const tier = str(raw.tier) || "active";
  const repoOwner = owner(raw.owner, "owner", problems);
  const provider = word(raw.provider, "provider", problems);

  const components: Component[] = [];
  if (raw.components !== undefined && raw.components !== null) {
    if (!Array.isArray(raw.components)) problems.push("components must be a list.");
    else
      raw.components.forEach((c: unknown, i: number) => {
        const at = `components[${i}]`;
        if (!isMap(c)) return void problems.push(`${at} must be a mapping with name and owns.`);
        const cname = str(c.name);
        if (!cname) problems.push(`${at}: name is required.`);
        const owns = strList(c.owns);
        if (!owns || owns.length === 0) problems.push(`${at}${cname ? ` (${cname})` : ""}: owns must be a non-empty list of paths.`);
        if (c.rules !== undefined && typeof c.rules !== "string") problems.push(`${at}: rules must be a path.`);
        const cowner = owner(c.owner, `${at}: owner`, problems);
        for (const k of Object.keys(c)) if (!["name", "owns", "rules", "owner"].includes(k)) warnings.push(`${at}: unknown key "${k}" (ignored).`);
        components.push({ name: cname, owns: owns ?? [], ...(str(c.rules) ? { rules: str(c.rules) } : {}), ...(cowner ? { owner: cowner } : {}) });
      });
  }

  const docs: Record<string, string> = {};
  if (raw.docs !== undefined && raw.docs !== null) {
    if (!isMap(raw.docs)) problems.push("docs must be a mapping of label: path.");
    else
      for (const [k, v] of Object.entries(raw.docs)) {
        if (typeof v === "string" && v.trim()) docs[k] = v.trim();
        else warnings.push(`docs.${k} is not a path (ignored).`);
      }
  }

  let health: Peak["health"];
  if (raw.health !== undefined && raw.health !== null) {
    if (!isMap(raw.health)) problems.push("health must be a mapping with workers and/or links.");
    else {
      const workers = raw.health.workers === undefined ? undefined : strList(raw.health.workers);
      const links = raw.health.links === undefined ? undefined : strList(raw.health.links);
      if (workers === null) problems.push("health.workers must be a list of names.");
      if (links === null) problems.push("health.links must be a list of URLs.");
      for (const l of links ?? []) if (!webUrl(l)) problems.push(`health.links: "${l}" is not an http(s) URL.`);
      health = { ...(workers ? { workers } : {}), ...(links ? { links } : {}) };
    }
  }

  const named = new Set(components.map((c) => c.name));
  const runs = raw.runs === undefined || raw.runs === null ? undefined : parseRuns(raw.runs, "runs", named, problems, warnings);

  const uses: Use[] = [];
  if (raw.uses !== undefined && raw.uses !== null) {
    if (!Array.isArray(raw.uses)) problems.push("uses must be a list.");
    else raw.uses.forEach((u: unknown, i: number) => {
      const use = parseUse(u, `uses[${i}]`, problems, warnings);
      if (use) uses.push(use);
    });
  }

  const environments: Record<string, Environment> = {};
  if (raw.environments !== undefined && raw.environments !== null) {
    if (!isMap(raw.environments)) problems.push("environments must be a mapping of name: what differs.");
    else
      for (const [env, e] of Object.entries(raw.environments)) {
        const at = `environments.${env}`;
        if (!WORD.test(env)) problems.push(`${at}: the name must be a lowercase word (staging, preview, …).`);
        if (env === "production") problems.push(`${at}: production is the file itself; name only the others.`);
        if (!isMap(e)) {
          problems.push(`${at} must be a mapping with url and/or runs.`);
          continue;
        }
        for (const k of Object.keys(e)) if (k !== "url" && k !== "runs") warnings.push(`${at}: unknown key "${k}" (ignored).`);
        const eurl = str(e.url) || undefined;
        if (e.url !== undefined && (!eurl || !webUrl(eurl))) problems.push(`${at}.url must be an http(s) URL.`);
        const eruns = e.runs === undefined || e.runs === null ? undefined : parseRuns(e.runs, `${at}.runs`, named, problems, warnings);
        environments[env] = { ...(eurl ? { url: eurl } : {}), ...(eruns ? { runs: eruns } : {}) };
      }
  }

  if (problems.length) return { problems, warnings };
  return {
    peak: {
      version,
      name,
      ...(description ? { description } : {}),
      ...(url ? { url } : {}),
      tier,
      ...(repoOwner ? { owner: repoOwner } : {}),
      ...(provider ? { provider } : {}),
      components,
      docs,
      ...(health ? { health } : {}),
      ...(runs ? { runs } : {}),
      uses,
      environments,
    },
    warnings,
  };
}

/**
 * What one environment runs (production when `env` is left out): its own entries for each kind
 * it names, production's for the rest. `health.workers` counts as production workers, after
 * `runs.workers` and without repeats. Every entry carries its provider, from the file when it
 * doesn't name one.
 */
export function runsIn(peak: Peak, env?: string): Runs {
  const base: Runs = { ...peak.runs };
  const extra = (peak.health?.workers ?? []).filter((w) => !base.workers?.some((r) => r.name === w));
  if (extra.length) base.workers = [...(base.workers ?? []), ...extra.map((name) => ({ name }))];
  const over = env && env !== "production" ? peak.environments[env]?.runs : undefined;
  const out: Runs = {};
  for (const k of KINDS) {
    const list = over?.[k] ?? base[k];
    if (list) out[k] = list.map((r) => (r.provider || !peak.provider ? r : { ...r, provider: peak.provider }));
  }
  return out;
}

function owner(v: unknown, at: string, problems: string[]): string | undefined {
  if (v === undefined || v === null) return undefined;
  const s = str(v);
  if (!OWNER.test(s)) problems.push(`${at} must be a forge handle: @user or @org/team.`);
  return s || undefined;
}

function word(v: unknown, at: string, problems: string[]): string | undefined {
  if (v === undefined || v === null) return undefined;
  const s = str(v);
  if (!WORD.test(s)) problems.push(`${at} must be a lowercase word, e.g. cloudflare.`);
  return s || undefined;
}

function parseRuns(v: unknown, at: string, named: Set<string>, problems: string[], warnings: string[]): Runs | undefined {
  if (!isMap(v)) return void problems.push(`${at} must be a mapping of kind: list (${KINDS.join(", ")}).`);
  const runs: Runs = {};
  for (const [k, list] of Object.entries(v)) {
    if (!(KINDS as readonly string[]).includes(k)) {
      warnings.push(`${at}: unknown kind "${k}" (ignored; known: ${KINDS.join(", ")}).`);
      continue;
    }
    if (!Array.isArray(list)) {
      problems.push(`${at}.${k} must be a list of names.`);
      continue;
    }
    const out: Resource[] = [];
    list.forEach((e: unknown, i: number) => {
      const r = parseResource(e, k as Kind, `${at}.${k}[${i}]`, named, problems, warnings);
      if (r) out.push(r);
    });
    runs[k as Kind] = out;
  }
  return runs;
}

function parseResource(e: unknown, kind: Kind, at: string, named: Set<string>, problems: string[], warnings: string[]): Resource | undefined {
  if (typeof e === "string") return resourceName(e, at, problems) ? { name: e.trim() } : undefined;
  if (!isMap(e)) return void problems.push(`${at} must be a name or a mapping with name.`);
  for (const k of Object.keys(e)) if (!RESOURCE_KEYS.includes(k)) warnings.push(`${at}: unknown key "${k}" (ignored).`);
  const name = typeof e.name === "string" ? e.name : "";
  if (!resourceName(name, at, problems)) return undefined;
  const provider = word(e.provider, `${at}: provider`, problems);
  const component = e.component === undefined ? undefined : str(e.component);
  if (component !== undefined && !named.has(component)) problems.push(`${at}: component "${component}" is not one of components.`);
  let hosts: string[] | undefined;
  if (e.hosts !== undefined) {
    if (kind !== "workers") warnings.push(`${at}: hosts is for workers only (ignored).`);
    else {
      hosts = strList(e.hosts) ?? undefined;
      if (!hosts?.length) problems.push(`${at}: hosts must be a non-empty list of hostnames.`);
      else for (const h of hosts) if (!/^[a-z0-9.-]+$/i.test(h) || !h.includes(".")) problems.push(`${at}: "${h}" is not a hostname.`);
    }
  }
  return { name: name.trim(), ...(provider ? { provider } : {}), ...(component ? { component } : {}), ...(hosts?.length ? { hosts } : {}) };
}

function resourceName(n: string, at: string, problems: string[]): boolean {
  const s = n.trim();
  if (!s) return void problems.push(`${at}: name is required.`), false;
  if (s.slice(0, -1).includes("*") || s === "*") return void problems.push(`${at}: "${s}": a * may only end a name, after a prefix.`), false;
  return true;
}

function parseUse(u: unknown, at: string, problems: string[], warnings: string[]): Use | undefined {
  if (typeof u === "string") {
    const s = u.trim();
    if (!s) return void problems.push(`${at} is empty.`);
    if (s.includes("/")) return REPO.test(s) ? { repo: s } : void problems.push(`${at}: "${s}" is not a repo (owner/name).`);
    return WORD.test(s) ? { service: s } : void problems.push(`${at}: "${s}" must be owner/name for a repo or a lowercase word for a service.`);
  }
  if (!isMap(u)) return void problems.push(`${at} must be owner/name, a service word, or a mapping with repo or service.`);
  const why = str(u.why) || undefined;
  if ((u.repo === undefined) === (u.service === undefined)) return void problems.push(`${at} needs exactly one of repo and service.`);
  if (u.repo !== undefined) {
    for (const k of Object.keys(u)) if (!["repo", "what", "why"].includes(k)) warnings.push(`${at}: unknown key "${k}" (ignored).`);
    const repo = str(u.repo);
    if (!REPO.test(repo)) return void problems.push(`${at}: repo must be owner/name.`);
    const what = str(u.what) || undefined;
    return { repo, ...(what ? { what } : {}), ...(why ? { why } : {}) };
  }
  for (const k of Object.keys(u)) if (!["service", "why"].includes(k)) warnings.push(`${at}: unknown key "${k}" (ignored).`);
  const service = str(u.service);
  if (!WORD.test(service)) return void problems.push(`${at}: service must be a lowercase word (stripe, resend, …).`);
  return { service, ...(why ? { why } : {}) };
}
