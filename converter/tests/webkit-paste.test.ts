// End-to-end: cleaned content goes through a pasteboard into the WebKit editor used by
// the Apple Mail compose window (lab/paste-lab.swift). macOS only; needs swiftc.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cleanContent, cleanMarkdown, markdownBody, type CleanResult } from "../src/convert.ts";

const ON = { replaceDashes: true };
const root = new URL("..", import.meta.url).pathname;
const source = join(root, "lab/paste-lab.swift");
const binary = join(root, "node_modules/.cache/cleanpasta/paste-lab");

function hasSwift(): boolean {
  try {
    execFileSync("/usr/bin/xcrun", ["--find", "swiftc"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const skip = process.platform !== "darwin" || !hasSwift() ? "needs macOS with swiftc" : false;

function lab(): string {
  if (!existsSync(binary) || statSync(binary).mtimeMs < statSync(source).mtimeMs) {
    mkdirSync(join(root, "node_modules/.cache/cleanpasta"), { recursive: true });
    execFileSync("/usr/bin/xcrun", ["swiftc", "-O", "-suppress-warnings", "-o", binary, source], { stdio: "inherit" });
  }
  return binary;
}

function pasteIntoMail(result: CleanResult, mode: "paste" | "match" | "wk" = "paste"): string {
  const dir = mkdtempSync(join(tmpdir(), "cleanpasta-"));
  writeFileSync(join(dir, "in.html"), result.html);
  writeFileSync(join(dir, "in.txt"), result.text);
  return execFileSync(lab(), [mode, "--html", join(dir, "in.html"), "--text", join(dir, "in.txt")], {
    encoding: "utf8",
    timeout: 60_000,
  });
}

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

test("Mail paste: rendered chat keeps bold, italic, lists and links", { skip }, () => {
  const result = cleanContent({ html: fixture("chat-rendered.html"), text: fixture("chat-rendered.txt") }, ON);
  assert.ok(result);
  const dom = pasteIntoMail(result);
  assert.match(dom, /<i>Dzień dobry Pani Anno,<\/i>/);
  assert.match(dom, /<b>1\. Zakres<\/b>/);
  assert.match(dom, /<ul[^>]*><li>strona z formularzem,<\/li><li>dwa krótkie filmy - po 30&nbsp;s,<\/li><\/ul>/);
  assert.match(dom, /1\. Szkic we wtorek\.(<\/div>|<br>)/);
  assert.doesNotMatch(dom, /<ol/);
  assert.match(dom, /<a href="https:\/\/example\.com\/brief">briefie<\/a>/);
  assert.doesNotMatch(dom, /background|color|Anthropic/);
});

test("Mail paste: Markdown draft file", { skip }, () => {
  const dom = pasteIntoMail(cleanMarkdown(markdownBody(fixture("draft.md")), ON));
  assert.match(dom, /<i>Dzień dobry,<\/i>/);
  assert.match(dom, /<b>1\. Scope<\/b>/);
  assert.match(dom, /<ul[^>]*><li>landing page with a form,<\/li>/);
  assert.match(dom, /1\. Draft on Tuesday\./);
  assert.doesNotMatch(dom, /<ol/);
});

test("Mail paste: Markdown copied from VS Code", { skip }, () => {
  const result = cleanContent({ html: fixture("vscode-markdown.html"), text: fixture("vscode-markdown.txt") }, ON);
  assert.ok(result);
  const dom = pasteIntoMail(result);
  assert.match(dom, /<b>1\. Zakres<\/b>/);
  assert.match(dom, /<ul[^>]*><li>strona z formularzem,<\/li>/);
  assert.doesNotMatch(dom, /Menlo|#1f1f1f|\*\*/);
});

test("Mail Paste and Match Style drops bold and italic - the paste must be a plain Cmd+V", { skip }, () => {
  const dom = pasteIntoMail(cleanMarkdown("*Hi,*\n\n**Plan**\n\n- one", ON), "match");
  assert.doesNotMatch(dom, /<b>|<i>/);
});

// wk pastes through the clipboard: the lab saves it first and restores it after.
test("Mail paste (modern WebKit): 12 px lines keep the message size, no 16 px fallback", { skip }, () => {
  const markdown = "*Hi,*\n\n**Plan**\n\n- one\n- two";
  const sized = pasteIntoMail(cleanMarkdown(markdown, { replaceDashes: true, fontSize: 12 }), "wk");
  assert.doesNotMatch(sized, /font-size/);
  assert.match(sized, /<b>Plan<\/b>/);
  assert.match(sized, /<ul class="MailOutline"><li>one<\/li>/);
  const unsized = pasteIntoMail(cleanMarkdown(markdown, ON), "wk");
  assert.match(unsized, /font-size: medium/);
});

test("Mail paste (modern WebKit): no typographic quotes left in the text, link address untouched", { skip }, () => {
  const html =
    '<p style="font-family: Georgia">„Dzień dobry” – napisała. “Hello,” ‘it’s’ «bonjour» ‹oui› ‚nisko’.</p>' +
    '<ul><li><b>„ważne”</b> i <a href="https://example.com/brief">“brief”</a></li></ul>';
  const result = cleanContent({ html, text: "Dzień dobry" }, { replaceDashes: true, replaceQuotes: true, fontSize: 12 });
  assert.ok(result);
  const dom = pasteIntoMail(result, "wk");
  const text = dom.replace(/<[^>]+>/g, "");
  assert.doesNotMatch(text, /[„“”‟«»‚‘’‛‹›–—]/);
  assert.match(text, /"Dzień dobry" - napisała\. "Hello," 'it's' "bonjour" 'oui' 'nisko'\./);
  // WebKit keeps the spaces next to <b> and <a> as &nbsp; when it pastes
  assert.match(dom, /<b>"ważne"<\/b>( |&nbsp;)i( |&nbsp;)<a href="https:\/\/example\.com\/brief">"brief"<\/a>/);
});
