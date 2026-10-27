#!/usr/bin/env node
export type Report = {
    file?: string;
    ok: boolean;
    lines: string[];
};
/** Finds and checks the peak file for one repo folder (or one file). */
export declare function check(target: string): Report;
