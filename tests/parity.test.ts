// The app and the CLI run convert.js in JavaScriptCore; this test checks that they give
// exactly the same result as the TypeScript source in Node (converter/tests).
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const converter = join(root, "converter");
const { cleanContent, cleanMarkdown, markdownBody } = await import(join(converter, "src/convert.ts"));
const bin = join(root, ".build/debug/cleanpaste");
const fixture = (name: string) => readFileSync(join(converter, "tests/fixtures", name), "utf8");
const dir = mkdtempSync(join(tmpdir(), "cleanpaste-"));

function cli(args: string[], input?: string): string {
  return execFileSync(bin, args, { input, encoding: "utf8", env: { ...process.env, CLEAN_PASTE_CONVERTER: join(root, "Resources/convert.js") } });
}

type Opts = { replaceDashes: boolean; replaceQuotes: boolean; fontSize: number };
const variants: [string, Opts, string[]][] = [
  ["defaults", { replaceDashes: true, replaceQuotes: true, fontSize: 12 }, ["--font-size", "12"]],
  ["keep all", { replaceDashes: false, replaceQuotes: false, fontSize: 0 }, ["--keep-dashes", "--keep-quotes", "--font-size", "0"]],
  ["size 14", { replaceDashes: true, replaceQuotes: true, fontSize: 14 }, ["--font-size", "14"]],
];

const contents: [string, { html?: string; text?: string }][] = [
  ["rendered chat", { html: fixture("chat-rendered.html"), text: fixture("chat-rendered.txt") }],
  ["VS Code Markdown", { html: fixture("vscode-markdown.html"), text: fixture("vscode-markdown.txt") }],
  ["quotes and link", { html: '<p>„Polski” — “English” it’s <a href="https://example.com/„a”">„link”</a></p><ul><li><b>«x»</b></li></ul>', text: "x" }],
  ["plain line", { text: "one line — it’s „ok”" }],
  ["Mail message", { html: '<div style="font-size: 12px"><b>Plan</b></div><div><ul class="MailOutline"><li>one</li></ul></div>', text: "Plan\none" }],
];

for (const [label, opts, flags] of variants) {
  for (const [name, content] of contents) {
    test(`content: ${name} (${label})`, () => {
      const file = join(dir, "in.json");
      writeFileSync(file, JSON.stringify(content));
      const actual = JSON.parse(cli([file, "--json-input", "--print", "json", ...flags]));
      assert.deepEqual(actual, cleanContent(content, opts));
    });
  }
  test(`markdown draft body (${label})`, () => {
    const actual = JSON.parse(cli(["--markdown", "--body", "--print", "json", ...flags], fixture("draft.md")));
    assert.deepEqual(actual, cleanMarkdown(markdownBody(fixture("draft.md")), opts));
  });
}

test("file types: .md is Markdown, .html is HTML, stdin text detects Markdown", () => {
  writeFileSync(join(dir, "a.md"), "**Hi** „there”\n\n- one");
  assert.equal(cli([join(dir, "a.md"), "--font-size", "0"]).trim(), cleanMarkdown("**Hi** „there”\n\n- one", { replaceDashes: true, replaceQuotes: true, fontSize: 0 }).html);
  writeFileSync(join(dir, "a.html"), "<p style='color:red'><i>x</i></p>");
  assert.equal(cli([join(dir, "a.html"), "--font-size", "0"]).trim(), "<div><i>x</i></div>");
  assert.equal(cli(["--print", "text", "--font-size", "0"], "- one\n- two").trim(), "- one\n- two");
});

test("nothing to clean exits with 2", () => {
  assert.throws(() => cli(["--text"], "   \n"), (error: { status?: number }) => error.status === 2);
});
