import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cleanContent, cleanMarkdown, looksLikeMarkdown, markdownBody } from "../src/convert.ts";

const ON = { replaceDashes: true, replaceQuotes: true };
const OFF = { replaceDashes: false, replaceQuotes: false };
// every typographic quote the converter replaces
const TYPOGRAPHIC_QUOTES = /[„“”‟«»‚‘’‛‹›]/;
// Mail's list class, without Mail's wrapping <div> (Slack adds a blank line for it)
const list = (tag: "ul" | "ol", items: string, start = "") =>
  `<${tag} class="MailOutline"${start}>${items}</${tag}>`;

test("markdown: bold, italic, lists, links and blank lines in Mail markup", () => {
  const result = cleanMarkdown(
    "*Hi,*\n\n**1. Scope**\n\n- one\n- two\n\n3. three\n4. four\n\n[link](https://example.com)",
    ON,
  );
  assert.equal(
    result.html,
    "<div><i>Hi,</i></div><div><br></div><div><b>1. Scope</b></div><div><br></div>" +
      list("ul", "<li>one</li><li>two</li>") +
      "<div><br></div>" +
      "<div>3. three</div><div><br></div><div>4. four</div>" +
      "<div><br></div>" +
      '<div><a href="https://example.com">link</a></div>',
  );
  assert.equal(result.text, "Hi,\n\n1. Scope\n\n- one\n- two\n\n3. three\n4. four\n\nlink\n");
});

test("markdown: line breaks inside a paragraph stay, non-breaking spaces stay", () => {
  const result = cleanMarkdown("first line\nsecond\u00a0line", ON);
  assert.equal(result.html, "<div>first line<br>second&nbsp;line</div>");
});

test("dashes: em and en dashes become a hyphen, unless switched off", () => {
  assert.equal(cleanMarkdown("a — b – c", ON).html, "<div>a - b - c</div>");
  assert.equal(cleanMarkdown("a — b", OFF).html, "<div>a — b</div>");
  assert.deepEqual(cleanContent({ text: "one line — no markdown" }, ON), { html: "", text: "one line - no markdown" });
});

test("quotes: Polish quotation marks become straight quotes", () => {
  assert.equal(cleanMarkdown("Napisał: „Dzień dobry”.", ON).html, '<div>Napisał: "Dzień dobry".</div>');
  assert.equal(cleanMarkdown("‚pojedyncze’", ON).html, "<div>'pojedyncze'</div>");
});

test("quotes: English double and single quotes and the apostrophe become straight", () => {
  assert.equal(
    cleanMarkdown("“Hello,” she said, ‘it’s fine’ - don’t worry.", ON).html,
    `<div>"Hello," she said, 'it's fine' - don't worry.</div>`,
  );
  assert.deepEqual(cleanContent({ text: "it’s Eryk’s" }, ON), { html: "", text: "it's Eryk's" });
});

test("quotes: French guillemets become straight quotes, non-breaking spaces stay", () => {
  assert.equal(cleanMarkdown("« Bonjour » et ‹oui›", ON).html, "<div>\"&nbsp;Bonjour&nbsp;\" et 'oui'</div>");
});

test("quotes: a paragraph mixing all quote styles and dashes", () => {
  const html = "<p>„Polski” — “English” – ‘single’, «français», ‹simple›, ‚low’ i it’s.</p>";
  const result = cleanContent({ html, text: "" }, ON);
  assert.ok(result);
  assert.equal(
    result.html,
    `<div>"Polski" - "English" - 'single', "français", 'simple', 'low' i it's.</div>`,
  );
  assert.equal(result.text, `"Polski" - "English" - 'single', "français", 'simple', 'low' i it's.\n`);
  assert.doesNotMatch(result.html + result.text, TYPOGRAPHIC_QUOTES);
});

test("quotes: inside bold and inside list items, from HTML and from Markdown", () => {
  const html = "<p>To jest <strong>„ważne”</strong></p><ul><li>it’s <b>“first”</b></li><li>‘second’</li></ul>";
  const fromHtml = cleanContent({ html, text: "To jest ważne" }, ON);
  assert.ok(fromHtml);
  assert.equal(
    fromHtml.html,
    '<div>To jest <b>"ważne"</b></div><div><br></div>' + list("ul", `<li>it's <b>"first"</b></li><li>'second'</li>`),
  );
  assert.equal(
    cleanMarkdown("**„ważne”**\n\n- „pierwszy” punkt\n- it’s *‘drugi’*", ON).html,
    '<div><b>"ważne"</b></div><div><br></div>' +
      list("ul", `<li>"pierwszy" punkt</li><li>it's <i>'drugi'</i></li>`),
  );
});

test("quotes: link addresses and attributes are never changed, only the visible text", () => {
  const html = '<p><a href="https://example.com/„a”/it’s–x" title="„Tytuł”">„link” it’s</a></p>';
  const result = cleanContent({ html, text: "link" }, ON);
  assert.ok(result);
  assert.equal(result.html, '<div><a href="https://example.com/„a”/it’s–x">"link" it\'s</a></div>');
  assert.equal(
    cleanMarkdown("„[tekst „linku”](https://example.com/a’b–c_d_)”", ON).html,
    '<div>"<a href="https://example.com/a’b–c_d_">tekst "linku"</a>"</div>',
  );
});

test("quotes: a URL in the text keeps its characters, quotes around it are replaced", () => {
  assert.equal(
    cleanMarkdown("„Zobacz https://en.wikipedia.org/wiki/Mexican–American_War’s”.", ON).html,
    '<div>"Zobacz https://en.wikipedia.org/wiki/Mexican–American_War’s".</div>',
  );
  assert.deepEqual(cleanContent({ text: "«www.example.com/it’s» – ok" }, ON), {
    html: "",
    text: '"www.example.com/it’s" - ok',
  });
});

test("quotes: switched off they stay, independently of dashes", () => {
  assert.equal(cleanMarkdown("„a” — it’s", OFF).html, "<div>„a” — it’s</div>");
  assert.equal(cleanMarkdown("„a” — it’s", { replaceDashes: true, replaceQuotes: false }).html, "<div>„a” - it’s</div>");
  assert.equal(cleanMarkdown("„a” — it’s", { replaceDashes: false, replaceQuotes: true }).html, `<div>"a" — it's</div>`);
});

test("markdown: nested list", () => {
  const result = cleanMarkdown("- parent\n  - child\n- next", ON);
  assert.equal(result.html, list("ul", '<li>parent<ul class="MailOutline"><li>child</li></ul></li><li>next</li>'));
});

test("html: styling from a dark-mode app is dropped, structure stays", () => {
  const html =
    '<meta charset="utf-8"><div style="background:#1f1f1f;color:#fff;font-family:Styrene">' +
    '<p><em>Dzień dobry,</em></p><p>text with&nbsp;nbsp and <span style="font-weight: 700; color: red">bold span</span></p>' +
    "<h2>Heading</h2><ul><li><p>first <code>code</code></p></li><li>second<ul><li>nested</li></ul></li></ul>" +
    "<table><tr><th>a</th><th>b</th></tr><tr><td>1</td><td>2</td></tr></table></div>";
  const result = cleanContent({ html, text: "Dzień dobry,\ntext" }, ON);
  assert.ok(result);
  assert.equal(
    result.html,
    "<div><i>Dzień dobry,</i></div><div><br></div><div>text with&nbsp;nbsp and <b>bold span</b></div>" +
      "<div><br></div><div><b>Heading</b></div><div><br></div>" +
      list("ul", '<li>first code</li><li>second<ul class="MailOutline"><li>nested</li></ul></li>') +
      "<div><br></div>" +
      '<table border="1" cellpadding="4" cellspacing="0"><tr><th>a</th><th>b</th></tr><tr><td>1</td><td>2</td></tr></table>',
  );
  assert.doesNotMatch(result.html, /style|color|font|background/);
});

test("html: markdown source copied from an editor wins over its colored HTML", () => {
  const html = '<div style="color:#569cd6">**bold** text</div><div>- item</div>';
  const result = cleanContent({ html, text: "**bold** text\n- item" }, ON);
  assert.ok(result);
  assert.equal(result.html, "<div><b>bold</b> text</div><div><br></div>" + list("ul", "<li>item</li>"));
});

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

test("html: rendered chat keeps bold, italic, lists and links although its text looks like Markdown", () => {
  // Chromium puts "1. Zakres" headings and marker-less list items into the plain text
  // version; reading that as Markdown used to drop all formatting in Mail.
  const text = fixture("chat-rendered.txt");
  assert.equal(looksLikeMarkdown(text), true);
  const result = cleanContent({ html: fixture("chat-rendered.html"), text }, ON);
  assert.ok(result);
  assert.equal(
    result.html,
    "<div><i>Dzień dobry Pani Anno,</i></div><div><br></div>" +
      "<div>dziękuję za spotkanie - poniżej plan na kolejny tydzień.</div><div><br></div>" +
      "<div><b>1. Zakres</b></div><div><br></div>" +
      list("ul", "<li>strona z formularzem,</li><li>dwa krótkie filmy - po 30&nbsp;s,</li>") +
      "<div><br></div>" +
      "<div><b>2. Terminy</b></div><div><br></div>" +
      "<div>1. Szkic we wtorek.</div><div><br></div><div>2. Wersja finalna w piątek.</div>" +
      "<div><br></div>" +
      '<div>Szczegóły w <a href="https://example.com/brief">briefie</a>.</div>',
  );
  assert.doesNotMatch(result.html.replaceAll(' class="MailOutline"', ""), /style|class|color|font|background/);
});

test("html: Markdown source copied from VS Code is read as Markdown", () => {
  const result = cleanContent({ html: fixture("vscode-markdown.html"), text: fixture("vscode-markdown.txt") }, ON);
  assert.ok(result);
  assert.equal(
    result.html,
    "<div><i>Dzień dobry,</i></div><div><br></div><div><b>1. Zakres</b></div><div><br></div>" +
      list("ul", "<li>strona z formularzem,</li><li>dwa krótkie filmy - po 30 s.</li>"),
  );
});

test("html: a rendered mail with typed '- ' lines and bold stays as it is", () => {
  const html = "<div><b>Plan</b></div><div>- first</div><div>- second</div>";
  const result = cleanContent({ html, text: "Plan\n- first\n- second" }, ON);
  assert.ok(result);
  assert.equal(
    result.html,
    "<div><b>Plan</b></div><div><br></div><div>- first</div><div><br></div><div>- second</div>",
  );
});

test("html: unformatted HTML with Markdown text uses the Markdown", () => {
  const result = cleanContent({ html: "<div>- one</div><div>- two</div>", text: "- one\n- two" }, ON);
  assert.ok(result);
  assert.equal(result.html, list("ul", "<li>one</li><li>two</li>"));
});

test("html: a message formatted by hand in Mail comes out in the same markup, without styles", () => {
  // Apple Mail's own clipboard HTML: inline-styled <div> per line, MailOutline lists
  const style = ' style="color: rgb(0, 0, 0); font-family: Helvetica Neue; font-size: 12px; font-weight: 400;"';
  const html =
    `<head><meta charset="UTF-8"></head><div${style}><i>Hi Anna,</i></div><div${style}><br></div>` +
    `<div${style}><b>1. Scope</b></div><div${style}><br></div>` +
    `<div${style}><ul class="MailOutline"><li>landing page,</li><li>two videos.</li></ul></div><div${style}><br></div>` +
    `<div${style}><ol class="MailOutline"><li>Draft on Tuesday.</li></ol></div>`;
  const result = cleanContent(
    { html, text: "Hi Anna,\n\n1. Scope\n\nlanding page,\ntwo videos.\n\nDraft on Tuesday." },
    ON,
  );
  assert.ok(result);
  assert.equal(
    result.html,
    "<div><i>Hi Anna,</i></div><div><br></div><div><b>1. Scope</b></div><div><br></div>" +
      list("ul", "<li>landing page,</li><li>two videos.</li>") +
      "<div><br></div>" +
      "<div>1. Draft on Tuesday.</div>",
  );
});

test("font size: every line, blank line and list gets it, as in Mail's own messages", () => {
  const result = cleanMarkdown("**Plan**\n\n- one", { replaceDashes: true, fontSize: 12 });
  assert.equal(
    result.html,
    '<div style="font-size: 12px;"><b>Plan</b></div><div style="font-size: 12px;"><br></div>' +
      '<ul class="MailOutline" style="font-size: 12px;"><li>one</li></ul>',
  );
  assert.doesNotMatch(cleanMarkdown("a", { replaceDashes: true, fontSize: 0 }).html, /font-size/);
});

test("bullet lists are not wrapped in a <div> - Slack pastes that as a double blank line", () => {
  const result = cleanMarkdown("**Monday**\n\n- one point\n\n**Challenge**\n\n- a\n- b", { replaceDashes: true, fontSize: 12 });
  assert.doesNotMatch(result.html, /<div[^>]*><ul|<\/ul><\/div>/);
  assert.match(result.html, /<\/ul><div style="font-size: 12px;"><br><\/div><div style="font-size: 12px;"><b>Challenge<\/b>/);
});

test("markdown detection", () => {
  assert.equal(looksLikeMarkdown("plain\ntext"), false);
  assert.equal(looksLikeMarkdown("has **bold**"), true);
  assert.equal(looksLikeMarkdown("- list item"), true);
});

test("draft file: front matter and notes after the rule are skipped", () => {
  const body = markdownBody(readFileSync(new URL("./fixtures/draft.md", import.meta.url), "utf8"));
  assert.match(body, /^\*Dzień dobry,\*/);
  assert.doesNotMatch(body, /Notes for the sender/);
  const result = cleanMarkdown(body, ON);
  assert.match(result.html, /thank you for the call - here is the plan/);
  assert.match(result.html, /<li>two short videos - 30 s each,<\/li>/);
  assert.match(result.html, /<div>1\. Draft on Tuesday\.<\/div><div><br><\/div><div>2\. Final version on Friday\.<\/div>/);
});

test("numbered points are plain paragraphs; bullets sit right below their lead-in line", () => {
  // A quote mail: 1., 2., 3. with bullet lists between them used to become an indented
  // numbered list in Mail, with the bullets breaking the numbering.
  const result = cleanContent({ text: fixture("numbered-with-bullets.txt") }, { replaceDashes: true, replaceQuotes: true, fontSize: 0 });
  assert.ok(result);
  assert.doesNotMatch(result.html, /<ol/);
  assert.match(result.html, /^<div>Hi Anzhelika,<\/div><div><br><\/div><div>As promised, [^<]+<\/div><div><br><\/div><div>1\. Scope and method/);
  // the bullets sit right below "2. ...:" and a blank line follows them
  assert.match(result.html, /<div>1\. Scope and method - [^<]+<\/div><div><br><\/div><div>2\. Options and prices \(net, reverse charge\):<\/div><ul class="MailOutline"><li>Option A - /);
  assert.match(result.html, /<\/ul><div><br><\/div><div>3\. Platform limits:<\/div><ul /);
  assert.match(result.html, /<div>4\. Review and sign-off[^<]+<\/div><div><br><\/div><div>5\. Timeline/);
  assert.equal((result.html.match(/<ul /g) ?? []).length, 2);
});

test("numbered list from rendered HTML: plain lines, nested bullets right below the item", () => {
  const html = "<ol start=\"2\"><li><p>Options:</p><ul><li>A</li><li>B</li></ul></li><li>Limits</li></ol>";
  const result = cleanContent({ html, text: "x" }, { replaceDashes: true, replaceQuotes: true, fontSize: 0 });
  assert.ok(result);
  assert.equal(result.html, '<div>2. Options:</div><ul class="MailOutline"><li>A</li><li>B</li></ul><div><br></div><div>3. Limits</div>');
});

test("greeting on its own first line becomes its own paragraph", () => {
  assert.equal(cleanMarkdown("Hi Anna,\nthank you for the call.", { replaceDashes: true, replaceQuotes: true, fontSize: 0 }).html, "<div>Hi Anna,</div><div><br></div><div>thank you for the call.</div>");
  // a longer first line ending in a comma is a sentence, not a greeting
  assert.equal(cleanMarkdown("Thank you for the call yesterday, it was great and useful,\nsee you.", { replaceDashes: true, replaceQuotes: true, fontSize: 0 }).html, "<div>Thank you for the call yesterday, it was great and useful,<br>see you.</div>");
});
