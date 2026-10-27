#!/usr/bin/env node
/**
 * `peak check [dir or file …]`: validates each repo's peak.yaml (default: the current folder).
 * Beyond the format, it checks that the files the peak names (docs, rules) exist.
 * Exit code 0 when every file is fine, 1 when one has a problem or is missing, 2 on bad usage.
 */
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";
import { parse } from "yaml";
import { FILES, LEGACY_FILES, SPEC_URL, parsePeak } from "./index.js";
/** Finds and checks the peak file for one repo folder (or one file). */
export function check(target) {
    let file = target;
    let root = target;
    if (existsSync(target) && statSync(target).isDirectory()) {
        const found = [...FILES, ...LEGACY_FILES].map((f) => join(target, f)).find((f) => existsSync(f));
        if (!found)
            return { ok: false, lines: [`${target}: no peak.yaml found. See ${SPEC_URL}`] };
        file = found;
    }
    else
        root = dirname(target);
    if (!existsSync(file))
        return { ok: false, lines: [`${file}: not found.`] };
    const lines = [];
    const shown = relative(process.cwd(), file) || file;
    let raw;
    try {
        raw = parse(readFileSync(file, "utf8"));
    }
    catch (e) {
        return { file, ok: false, lines: [`${shown}: not valid YAML: ${e.message.split("\n")[0]}`] };
    }
    if (LEGACY_FILES.some((f) => file.endsWith(f)))
        lines.push(`${shown}: warning: the old name; rename it to peak.yaml.`);
    const result = parsePeak(raw);
    for (const w of result.warnings)
        lines.push(`${shown}: warning: ${w}`);
    if ("problems" in result) {
        for (const p of result.problems)
            lines.push(`${shown}: ${p}`);
        return { file, ok: false, lines };
    }
    const { peak } = result;
    const missing = [];
    for (const [label, path] of Object.entries(peak.docs))
        if (!existsSync(join(root, path)))
            missing.push(`docs.${label}: ${path} doesn't exist.`);
    for (const c of peak.components)
        if (c.rules && !existsSync(join(root, c.rules)))
            missing.push(`components (${c.name}): rules file ${c.rules} doesn't exist.`);
    for (const m of missing)
        lines.push(`${shown}: ${m}`);
    if (!missing.length)
        lines.push(`${shown}: ok (${peak.name}, ${peak.tier}, ${peak.components.length} ${peak.components.length === 1 ? "component" : "components"}, ${Object.keys(peak.docs).length} docs)`);
    return { file, ok: missing.length === 0, lines };
}
function main(argv) {
    const [cmd, ...rest] = argv;
    if (cmd !== "check" || rest.some((a) => a.startsWith("-"))) {
        console.error("usage: peak check [dir or file …]");
        return 2;
    }
    let ok = true;
    for (const t of rest.length ? rest : ["."]) {
        const r = check(t);
        for (const l of r.lines)
            (r.ok ? console.log : console.error)(l);
        ok &&= r.ok;
    }
    return ok ? 0 : 1;
}
// Run as a command (also through a bin symlink), not when imported.
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url))
    process.exitCode = main(process.argv.slice(2));
