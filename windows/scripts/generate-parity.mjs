// Reuse the exact matrix in the macOS parity test, with TypeScript as the oracle.
import { readFileSync, writeFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { cleanContent, cleanMarkdown, markdownBody } from "../../converter/src/convert.ts";
const root = new URL("../../", import.meta.url);
const source = readFileSync(new URL("tests/parity.test.ts", root), "utf8");
const fixture = name => readFileSync(new URL(`converter/tests/fixtures/${name}`, root), "utf8");
const matrix = source.slice(source.indexOf("type Opts"), source.indexOf("for (const [label"));
const { variants, contents } = new Function("fixture", stripTypeScriptTypes(matrix) + "\nreturn { variants, contents };")(fixture);
const cases = [];
for (const [label, options] of variants) {
  for (const [name, input] of contents) {
    cases.push({ name: `${name} (${label})`, input, options, expected: cleanContent(input, options) });
  }
  const input = { text: fixture("draft.md") };
  cases.push({ name: `markdown draft body (${label})`, input, options, markdown: true, body: true,
    expected: cleanMarkdown(markdownBody(input.text), options) });
}
const output = JSON.stringify(cases, null, 2) + "\n";
const target = new URL("../crates/cleanpasta-core/tests/parity.json", import.meta.url);
if (process.argv.includes("--check")) {
  if (readFileSync(target, "utf8") !== output) throw new Error("Parity oracle is stale. Run node windows/scripts/generate-parity.mjs");
} else writeFileSync(target, output);
console.log(`${cases.length} TypeScript parity cases verified`);
