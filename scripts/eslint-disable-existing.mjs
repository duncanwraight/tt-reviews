// One-off codemod to snapshot existing lint violations:
// insert `// eslint-disable-next-line <rule>` above each violation so
// the rules can be flipped to `error` without requiring a mass fix.
//
// Run once, then delete. Safe to re-run (lint should report 0 errors
// after the first run; duplicate disables will appear as unused-disable
// warnings if enabled).

import { ESLint } from "eslint";
import fs from "node:fs";

const eslint = new ESLint({ cwd: process.cwd() });
const results = await eslint.lintFiles([
  "app/**/*.{ts,tsx}",
  "workers/**/*.{ts,tsx}",
]);

const byFile = new Map();
let total = 0;
for (const result of results) {
  if (!result.messages.length) continue;
  const lines = new Map();
  for (const msg of result.messages) {
    if (!msg.ruleId) continue;
    if (msg.severity < 1) continue;
    if (!lines.has(msg.line)) lines.set(msg.line, new Set());
    lines.get(msg.line).add(msg.ruleId);
    total++;
  }
  if (lines.size) byFile.set(result.filePath, lines);
}

console.log(`Snapshotting ${total} violations across ${byFile.size} files`);

let edited = 0;
for (const [file, lineMap] of byFile) {
  const src = fs.readFileSync(file, "utf-8");
  const srcLines = src.split("\n");
  const sortedLines = [...lineMap.keys()].sort((a, b) => b - a);
  for (const line of sortedLines) {
    const rules = [...lineMap.get(line)].sort().join(", ");
    const idx = line - 1;
    const origLine = srcLines[idx];
    const indent = origLine.match(/^\s*/)[0];

    // Default to the // form. Switch to {/* */} when the line is
    // inside JSX: either starts with a `<TagName` or `{expr}` where
    // the previous non-blank line ends with `>` (JSX tag closer).
    const trimmed = origLine.trim();
    const looksLikeJsxTag = /^<[A-Za-z][A-Za-z0-9]*/.test(trimmed);

    let prevNonBlank = "";
    for (let j = idx - 1; j >= 0; j--) {
      if (srcLines[j].trim()) {
        prevNonBlank = srcLines[j].trim();
        break;
      }
    }
    const prevEndsWithJsx =
      /[A-Za-z0-9"'}]\s*>\s*$/.test(prevNonBlank) &&
      !prevNonBlank.endsWith("=>");

    const insideJsxExpr = trimmed.startsWith("{") && prevEndsWithJsx;

    const disableLine =
      looksLikeJsxTag || insideJsxExpr
        ? `${indent}{/* eslint-disable-next-line ${rules} */}`
        : `${indent}// eslint-disable-next-line ${rules}`;

    srcLines.splice(idx, 0, disableLine);
  }
  fs.writeFileSync(file, srcLines.join("\n"));
  edited++;
}

console.log(`Wrote ${edited} files`);
