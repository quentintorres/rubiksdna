#!/usr/bin/env node
/**
 * Claims lint: fails CI when report or UI source contains language from the
 * forbidden-terms denylist (diagnose, treat, cure, ...) outside an explicit
 * negation ("not a diagnosis"). The list itself lives in @rubiksdna/claims
 * so it is versioned with the copy it polices.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { FORBIDDEN_TERMS, FORBIDDEN_TERM_EXEMPTIONS } from "../packages/claims/src/phrases.ts";

const ROOTS = ["packages/report/src", "packages/claims/src", "packages/axes/src", "apps/web/src"];
const EXTENSIONS = new Set([".ts", ".tsx", ".md", ".mdx"]);
/** The denylist definition itself is policy, not copy. */
const SKIP_FILES = new Set(["packages/claims/src/phrases.ts"]);

const repoRoot = new URL("..", import.meta.url).pathname;

function* walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) {
      if (entry === "node_modules" || entry === "dist") continue;
      yield* walk(full);
    } else if ([...EXTENSIONS].some((ext) => entry.endsWith(ext))) {
      yield full;
    }
  }
}

const violations = [];

for (const root of ROOTS) {
  for (const file of walk(join(repoRoot, root))) {
    if (SKIP_FILES.has(relative(repoRoot, file))) continue;
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, index) => {
      const lower = line.toLowerCase();
      for (const term of FORBIDDEN_TERMS) {
        if (!lower.includes(term.toLowerCase())) continue;
        if (FORBIDDEN_TERM_EXEMPTIONS.some((exemption) => exemption.test(line))) continue;
        violations.push({
          file: relative(repoRoot, file),
          line: index + 1,
          term,
          text: line.trim().slice(0, 120),
        });
      }
    });
  }
}

if (violations.length > 0) {
  console.error("Claims lint failed. Forbidden language found:\n");
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line} — "${v.term}"`);
    console.error(`    ${v.text}\n`);
  }
  console.error(
    `${violations.length} violation(s). If the phrase is a negation ("does not diagnose"), add it to FORBIDDEN_TERM_EXEMPTIONS in packages/claims/src/phrases.ts with reviewer sign-off.`,
  );
  process.exit(1);
}

console.log("Claims lint passed: no forbidden diagnostic language in report or UI source.");
