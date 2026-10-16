/**
 * ES Tools Cleanpasta - converter.
 *
 * Turns clipboard content into clean HTML that keeps the structure of the text
 * (bold, italic, underline, links, line breaks, non-breaking spaces, bulleted and
 * numbered lists, simple tables) and drops all styling (fonts, sizes, colors,
 * backgrounds), so the pasted text takes the default style of the target app.
 *
 * Typographic dashes and quotes in the visible text become the keyboard characters
 * "-", " and ' (both optional); URLs and HTML attributes keep every character.
 *
 * Sources: rich HTML copied from any app, or Markdown copied as plain text.
 * Pure functions only - no Raycast or Node APIs, so the same code runs in the
 * extension, in the CLI script and in tests.
 */
import { Parser } from "htmlparser2";

export type Options = {
  /** Replace em dashes, en dashes and similar with a plain hyphen "-". */
  replaceDashes: boolean;
  /**
   * Replace typographic quotes - Polish, English and French quotation marks, single
   * quotes and the curly apostrophe (it's) - with the straight quotes " and '.
   */
  replaceQuotes: boolean;
  /**
   * Font size in px set on every line, as Apple Mail does in its own messages.
   * Without it WebKit editors (Mail, Notes) paste at their 16 px fallback instead of
   * the message's size. 0 or undefined keeps the target app's default size.
   */
  fontSize?: number;
};

export type CleanResult = {
  /** Clean HTML, or "" when the result is a single line of plain text. */
  html: string;
  /** Plain text version of the same content. */
  text: string;
};

type List = { tag: "ul" | "ol"; start: number; items: Item[] };
type Item = { html: string; lists: List[] };
type Block = { kind: "p"; html: string } | { kind: "list"; list: List } | { kind: "table"; html: string };

const DASHES = /[\u2012\u2013\u2014\u2015]/g; // figure dash, en dash, em dash, horizontal bar
// low-9, left, right and reversed double quotes, left and right guillemets -> "
const DOUBLE_QUOTES = /[\u201e\u201c\u201d\u201f\u00ab\u00bb]/g;
// low-9, left, right (also the curly apostrophe) and reversed single quotes, single guillemets -> '
const SINGLE_QUOTES = /[\u201a\u2018\u2019\u201b\u2039\u203a]/g;
// A URL in the visible text keeps every character. Punctuation and closing quotes right
// after it are not part of it, so quotes around a URL are still replaced.
const URL_IN_TEXT = /\b(?:https?:\/\/|mailto:|www\.)[^\s<>]*[^\s<>.,;:!?)\]}"'\u2018-\u201f\u00ab\u00bb\u2039\u203a]/gi;
export const DEFAULT_OPTIONS: Options = { replaceDashes: true, replaceQuotes: true, fontSize: 12 };

function replaceTypography(text: string, options: Options): string {
  let out = text;
  if (options.replaceDashes) {
    out = out.replace(DASHES, "-");
  }
  if (options.replaceQuotes) {
    out = out.replace(DOUBLE_QUOTES, '"').replace(SINGLE_QUOTES, "'");
  }
  return out;
}

/** Typographic dashes and quotes to keyboard characters, as set in options; URLs stay as they are. */
export function typography(text: string, options: Options): string {
  if (!options.replaceDashes && !options.replaceQuotes) {
    return text;
  }
  let out = "";
  let last = 0;
  for (const match of text.matchAll(URL_IN_TEXT)) {
    out += replaceTypography(text.slice(last, match.index), options) + match[0];
    last = match.index + match[0].length;
  }
  return out + replaceTypography(text.slice(last), options);
}

// --- entry point ----------------------------------------------------------------

/**
 * Clean clipboard content.
 *
 * Rich HTML wins: text copied from a rendered page, chat or document keeps its bold,
 * italic, links and lists, even when its plain text version happens to look like
 * Markdown ("1. Scope" headings, numbered lines). The plain text is read as Markdown
 * only when the HTML is a view of Markdown source (a code editor shows "**", "#" or
 * "[link](url)" as visible text) or carries no formatting at all.
 * Returns null when there is nothing to clean (no text at all).
 */
export function cleanContent(
  input: { html?: string; text?: string },
  options: Options = DEFAULT_OPTIONS,
): CleanResult | null {
  const text = input.text ?? "";
  const html = input.html ?? "";
  if (!html && !text) {
    return null;
  }
  const htmlBlocks = html ? htmlToBlocks(html, options) : [];
  if (htmlBlocks.length === 0 && !text.trim().includes("\n") && !looksLikeMarkdown(text)) {
    // a single plain line (address, link, number): keep it plain
    return { html: "", text: typography(text, options) };
  }
  let blocks = htmlBlocks;
  if (htmlBlocks.length === 0 || (looksLikeMarkdown(text) && showsMarkdownSource(htmlBlocks))) {
    blocks = markdownToBlocks(text, options);
  }
  return { html: render(blocks, options), text: toPlainText(blocks) };
}

/** Markdown source (e.g. an .md file) straight to clean HTML. */
export function cleanMarkdown(markdown: string, options: Options = DEFAULT_OPTIONS): CleanResult {
  const blocks = markdownToBlocks(markdown, options);
  return { html: render(blocks, options), text: toPlainText(blocks) };
}

export function looksLikeMarkdown(text: string): boolean {
  if (/\*\*[^*\n]+\*\*/.test(text)) {
    return true;
  }
  return /^\s*([-*+]|\d+[.)]|#{1,6})\s+\S/m.test(text);
}

/**
 * True when HTML is a view of Markdown source rather than rendered text: its visible
 * text still shows Markdown syntax (bold markers, headings, links), or it carries no
 * formatting that reading the plain text as Markdown could lose. Lines starting with
 * "- " alone do not count - people type them in rendered mails too.
 */
function showsMarkdownSource(blocks: Block[]): boolean {
  const visible = blocks
    .filter((block) => block.kind === "p")
    .map((block) => htmlToText(block.html))
    .join("\n");
  if (/\*\*[^*\n]+\*\*|__[^_\n]+__|\[[^\]\n]+\]\((https?:|mailto:)|^\s*#{1,6}\s+\S/m.test(visible)) {
    return true;
  }
  return !blocks.some((block) => block.kind !== "p" || /<(b|i|u|a)[\s>]/.test(block.html));
}

// --- output -------------------------------------------------------------------------

/** "1. text" lines of a numbered list (numbered lists are pasted as plain text lines). */
function numberedLines(list: List): string[] {
  return list.items.map((item, index) => `${list.start + index}. ${item.html}`);
}

// Bulleted lists with Apple Mail's own list class: <ul class="MailOutline"><li>...</li></ul>
// (Mail itself wraps the list in a <div>; see render). A numbered list nested in a
// bullet stays as "1. ..." lines inside that bullet.
function renderList(list: List, open = '<ul class="MailOutline">'): string {
  const items = list.items
    .map((item) => {
      const nested = item.lists
        .map((sub) => (sub.tag === "ol" ? `<br>${numberedLines(sub).join("<br>")}` : renderList(sub)))
        .join("");
      return `<li>${item.html}${nested}</li>`;
    })
    .join("");
  return `${open}${items}</ul>`;
}

/**
 * Mail's own markup: one <div> per line, an empty <div><br></div> as the blank line,
 * tables inside a <div>; with a font size, every <div> carries it. Bullet lists are not
 * wrapped in a <div> (Mail pastes both forms the same, but Slack turns the closing </div>
 * of a one-item list into an extra blank line); the <ul> carries the font size itself.
 *
 * Numbered lists are not Mail lists: each item is a plain "1. ..." line without an
 * indent, so the numbers stay exactly as written even when bullet lists, notes or blank
 * lines come between the items. Only bulleted lists become real (indented) lists.
 */
function render(blocks: Block[], options: Options): string {
  const size = options.fontSize && options.fontSize > 0 ? Math.round(options.fontSize) : 0;
  const div = size ? `<div style="font-size: ${size}px;">` : "<div>";
  // Each unit is one paragraph, line or bullet list; units are separated by a blank line,
  // except a bullet list that introduces itself with a line ending in ":" - it sits right
  // below that line, as people format it by hand.
  type Unit = { html: string; bullets: boolean; leadIn: boolean; glued?: boolean };
  const units: Unit[] = [];
  const leadIn = (html: string) => /:\s*$/.test(htmlToText(html));
  const ul = size ? `<ul class="MailOutline" style="font-size: ${size}px;">` : '<ul class="MailOutline">';
  const bullets = (list: List, glued = false): Unit => ({
    html: renderList(list, ul),
    bullets: true,
    leadIn: false,
    glued,
  });
  const numbered = (list: List): void => {
    list.items.forEach((item, index) => {
      units.push({ html: `${div}${list.start + index}. ${item.html}</div>`, bullets: false, leadIn: leadIn(item.html) });
      for (const sub of item.lists) {
        if (sub.tag === "ol") {
          numbered(sub);
        } else {
          units.push(bullets(sub, true)); // bullets of a numbered point go right below it
        }
      }
    });
  };
  for (const block of blocks) {
    if (block.kind === "p") {
      units.push({ html: `${div}${block.html}</div>`, bullets: false, leadIn: leadIn(block.html) });
    } else if (block.kind === "table") {
      units.push({ html: size ? `${div}${block.html}</div>` : block.html, bullets: false, leadIn: false });
    } else if (block.list.tag === "ol") {
      numbered(block.list);
    } else {
      units.push(bullets(block.list));
    }
  }
  return units
    .map((unit, index) => {
      const previous = units[index - 1];
      if (!previous) {
        return unit.html;
      }
      const glue = unit.glued || (unit.bullets && previous.leadIn);
      return (glue ? "" : `${div}<br></div>`) + unit.html;
    })
    .join("");
}

function htmlToText(fragment: string): string {
  return decodeEntities(fragment.replace(/<br\s*\/?>/g, "\n").replace(/<[^>]+>/g, ""));
}

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, "\u00a0")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
}

function listToText(list: List, depth = 0): string[] {
  const lines: string[] = [];
  list.items.forEach((item, index) => {
    const mark = list.tag === "ol" ? `${list.start + index}.` : "-";
    lines.push(`${"  ".repeat(depth)}${mark} ${htmlToText(item.html).trim()}`);
    for (const sub of item.lists) {
      lines.push(...listToText(sub, depth + 1));
    }
  });
  return lines;
}

function toPlainText(blocks: Block[]): string {
  return (
    blocks
      .map((block) => {
        if (block.kind === "list") {
          return listToText(block.list).join("\n");
        }
        if (block.kind === "table") {
          return htmlToText(block.html.replace(/<\/t[dh]>/g, "\t").replace(/<\/tr>/g, "\n")).trim();
        }
        return htmlToText(block.html).trim();
      })
      .join("\n\n") + "\n"
  );
}

// --- Markdown ----------------------------------------------------------------------------

const LIST_LINE = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const RULE_LINE = /^\s*(-{3,}|\*{3,}|_{3,})\s*$/;

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const MARKDOWN_LINK = /\[([^\]]+)\]\(((?:https?:\/\/|mailto:)[^)\s]+)\)/g;
const LINK_SLOT = /\[([^\]]+)\]\ue000(\d+)\ue001/g; // private-use marks stand in for a link URL

function inlineMarkdown(text: string, options: Options): string {
  // Link URLs are set aside first, so neither dash and quote replacement nor the
  // bold and italic markers can change them.
  const urls: string[] = [];
  let out = escapeHtml(text.replace(/[\ue000\ue001]/g, "")).replace(MARKDOWN_LINK, (_, label: string, url: string) => {
    urls.push(url);
    return `[${label}]\ue000${urls.length - 1}\ue001`;
  });
  out = typography(out, options);
  out = out.replace(/`([^`]+)`/g, "$1");
  out = out.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
  out = out.replace(/(?<![\p{L}\p{N}*])\*(?![\s*])(.+?)(?<![\s*])\*(?![\p{L}\p{N}*])/gu, "<i>$1</i>");
  out = out.replace(/(?<![\p{L}\p{N}_])_(?![\s_])(.+?)(?<![\s_])_(?![\p{L}\p{N}_])/gu, "<i>$1</i>");
  out = out.replace(LINK_SLOT, (_, label: string, index: string) => {
    return `<a href="${urls[Number(index)].replace(/"/g, "&quot;")}">${label}</a>`;
  });
  return out.replace(/\u00a0/g, "&nbsp;");
}

function newList(marker: string): List {
  const ordered = /^\d/.test(marker);
  return { tag: ordered ? "ol" : "ul", start: ordered ? parseInt(marker, 10) : 1, items: [] };
}

// A short first line ending in "," or "!" (no other sentence on it): a greeting.
const GREETING_LINE = /^[^.?!:,]{1,40}[,!]$/;

function markdownToBlocks(markdown: string, options: Options): Block[] {
  const blocks: Block[] = [];
  const paragraph: string[] = [];
  let stack: { indent: number; list: List }[] = [];

  const closeParagraph = () => {
    // A greeting ("Hi Anna,", "Dzień dobry!") on its own first line is a paragraph of its
    // own, even without a blank line after it - that is how a mail is laid out.
    if (paragraph.length > 1 && GREETING_LINE.test(paragraph[0].trim())) {
      blocks.push({ kind: "p", html: inlineMarkdown(paragraph[0].trim(), options) });
      paragraph.shift();
    }
    if (paragraph.length > 0) {
      blocks.push({ kind: "p", html: paragraph.map((line) => inlineMarkdown(line.trim(), options)).join("<br>") });
      paragraph.length = 0;
    }
  };

  for (const raw of markdown.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.replace(/\s+$/, "");
    if (!line.trim() || RULE_LINE.test(line)) {
      closeParagraph();
      stack = [];
      continue;
    }
    const match = LIST_LINE.exec(line);
    if (match) {
      closeParagraph();
      const indent = match[1].replace(/\t/g, "    ").length;
      const marker = match[2];
      const tag = /^\d/.test(marker) ? "ol" : "ul";
      while (stack.length > 0 && indent < stack[stack.length - 1].indent) {
        stack.pop();
      }
      const top = stack[stack.length - 1];
      if (top && indent > top.indent && top.list.items.length > 0) {
        const list = newList(marker);
        top.list.items[top.list.items.length - 1].lists.push(list);
        stack.push({ indent, list });
      } else if (!top || top.list.tag !== tag) {
        if (top) {
          stack.pop();
        }
        const list = newList(marker);
        const parent = stack[stack.length - 1];
        if (parent) {
          parent.list.items[parent.list.items.length - 1].lists.push(list);
        } else {
          blocks.push({ kind: "list", list });
        }
        stack.push({ indent, list });
      }
      stack[stack.length - 1].list.items.push({ html: inlineMarkdown(match[3], options), lists: [] });
      continue;
    }
    if (stack.length > 0) {
      // continuation line of the last list item
      const items = stack[stack.length - 1].list.items;
      items[items.length - 1].html += "<br>" + inlineMarkdown(line.trim(), options);
      continue;
    }
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    if (heading) {
      closeParagraph();
      blocks.push({ kind: "p", html: `<b>${inlineMarkdown(heading[1], options)}</b>` });
      continue;
    }
    paragraph.push(line.replace(/^\s*>\s?/, ""));
  }
  closeParagraph();
  return blocks;
}

/** Body of a Markdown draft: without YAML front matter, up to the first "---" rule. */
export function markdownBody(markdown: string): string {
  let lines = markdown.replace(/\r\n/g, "\n").split("\n");
  if (lines[0]?.trim() === "---") {
    const end = lines.indexOf("---", 1);
    if (end > 0) {
      lines = lines.slice(end + 1);
    }
  }
  const body: string[] = [];
  for (const line of lines) {
    if (RULE_LINE.test(line) && body.some((l) => l.trim())) {
      break;
    }
    body.push(line);
  }
  return body.join("\n").replace(/^\n+|\n+$/g, "");
}

// --- HTML ------------------------------------------------------------------------------

const SKIP = new Set(["script", "style", "head", "title", "noscript", "template", "svg", "button", "select"]);
const VOID = new Set(["meta", "link", "img", "input", "source", "wbr", "col", "area", "base"]);
const BLOCK = new Set([
  "p",
  "div",
  "section",
  "article",
  "header",
  "footer",
  "main",
  "aside",
  "blockquote",
  "pre",
  "figure",
  "figcaption",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "dt",
  "dd",
]);
const TABLE = new Set(["table", "thead", "tbody", "tfoot", "tr", "td", "th"]);
const WHITESPACE = /[ \t\r\n\f\v]+/g; // not \s: keeps non-breaking spaces

class Sanitizer {
  blocks: Block[] = [];
  private buf: string[] = [];
  private open: { tag: string; closing: string }[] = [];
  private lists: List[] = [];
  private items: Item[] = [];
  private skip = 0;
  private table: string[] | null = null;
  private readonly options: Options;

  constructor(options: Options) {
    this.options = options;
  }

  private current(): string {
    return this.buf.join("").replace(/^(<br>|\s)+|(<br>|\s)+$/g, "");
  }

  private flush(): void {
    const content = this.current();
    this.buf = [];
    if (!content) {
      return;
    }
    if (this.table) {
      this.table.push(content);
    } else if (this.items.length > 0) {
      const item = this.items[this.items.length - 1];
      item.html += (item.html ? "<br>" : "") + content;
    } else if (htmlToText(content).trim()) {
      this.blocks.push({ kind: "p", html: content });
    }
  }

  onOpenTag(tag: string, attrs: Record<string, string>): void {
    if (VOID.has(tag)) {
      return;
    }
    if (SKIP.has(tag)) {
      this.skip++;
      return;
    }
    if (this.skip > 0) {
      return;
    }
    const style = (attrs.style ?? "").toLowerCase().replace(/\s+/g, "");
    if (tag === "br") {
      this.buf.push("<br>");
      return;
    }
    if (tag === "hr") {
      this.flush();
      return;
    }
    if (tag === "ul" || tag === "ol") {
      this.flush();
      const start = /^\d+$/.test(attrs.start ?? "") ? parseInt(attrs.start, 10) : 1;
      const list: List = { tag, start, items: [] };
      if (this.items.length > 0) {
        this.items[this.items.length - 1].lists.push(list);
      } else if (!this.table) {
        this.blocks.push({ kind: "list", list });
      }
      this.lists.push(list);
      return;
    }
    if (tag === "li") {
      this.flush();
      const item: Item = { html: "", lists: [] };
      this.lists[this.lists.length - 1]?.items.push(item);
      this.items.push(item);
      return;
    }
    if (TABLE.has(tag)) {
      if (tag === "table" && !this.table) {
        this.flush();
        this.table = ['<table border="1" cellpadding="4" cellspacing="0">'];
      } else if (this.table && (tag === "tr" || tag === "td" || tag === "th")) {
        this.flush();
        this.table.push(`<${tag}>`);
      }
      return;
    }
    if (BLOCK.has(tag)) {
      this.flush();
      let closing = "";
      if (/^h[1-6]$/.test(tag) || tag === "dt") {
        this.buf.push("<b>");
        closing = "</b>";
      }
      this.open.push({ tag, closing });
      return;
    }
    let closing = "";
    if (tag === "b" || tag === "strong" || /font-weight:(bold|[6-9]00)/.test(style)) {
      this.buf.push("<b>");
      closing = "</b>" + closing;
    }
    if (tag === "i" || tag === "em" || style.includes("font-style:italic")) {
      this.buf.push("<i>");
      closing = "</i>" + closing;
    }
    // links are underlined anyway; underline styling on or inside them is noise
    const inLink = tag === "a" || this.open.some((entry) => entry.tag === "a");
    if (tag === "u" || (!inLink && /text-decoration(-line)?:[^;]*underline/.test(style))) {
      this.buf.push("<u>");
      closing = "</u>" + closing;
    }
    const href = attrs.href ?? "";
    if (tag === "a" && /^(https?:|mailto:)/.test(href)) {
      this.buf.push(`<a href="${escapeHtml(href).replace(/"/g, "&quot;")}">`);
      closing = "</a>" + closing;
    }
    this.open.push({ tag, closing });
  }

  onCloseTag(tag: string): void {
    if (VOID.has(tag) || tag === "br" || tag === "hr") {
      return;
    }
    if (SKIP.has(tag)) {
      this.skip = Math.max(0, this.skip - 1);
      return;
    }
    if (this.skip > 0) {
      return;
    }
    if (tag === "ul" || tag === "ol") {
      this.flush();
      this.lists.pop();
      return;
    }
    if (tag === "li") {
      this.flush();
      this.items.pop();
      return;
    }
    if (TABLE.has(tag)) {
      if (this.table) {
        this.flush();
        if (tag === "tr" || tag === "td" || tag === "th") {
          this.table.push(`</${tag}>`);
        } else if (tag === "table") {
          this.table.push("</table>");
          this.blocks.push({ kind: "table", html: this.table.join("") });
          this.table = null;
        }
      }
      return;
    }
    for (let i = this.open.length - 1; i >= 0; i--) {
      if (this.open[i].tag === tag) {
        for (const entry of this.open.slice(i).reverse()) {
          this.buf.push(entry.closing);
        }
        this.open.splice(i);
        break;
      }
    }
    if (BLOCK.has(tag)) {
      this.flush();
    }
  }

  onText(data: string): void {
    if (this.skip > 0) {
      return;
    }
    // only visible text: attributes (href) never pass through here
    const text = escapeHtml(typography(data.replace(WHITESPACE, " "), this.options));
    this.buf.push(text.replace(/\u00a0/g, "&nbsp;"));
  }

  finish(): Block[] {
    for (const entry of this.open.slice().reverse()) {
      this.buf.push(entry.closing);
    }
    this.open = [];
    this.flush();
    return this.blocks.map((block) => {
      if (block.kind !== "p") {
        return block;
      }
      const html = block.html
        .replace(/<(b|i|u)>(\s|&nbsp;)*<\/\1>/g, "$2")
        .replace(/<\/b><b>|<\/i><i>|<\/u><u>/g, "")
        .trim();
      return { kind: "p", html };
    });
  }
}

function htmlToBlocks(html: string, options: Options): Block[] {
  const sanitizer = new Sanitizer(options);
  const parser = new Parser(
    {
      onopentag: (name, attrs) => sanitizer.onOpenTag(name, attrs),
      onclosetag: (name) => sanitizer.onCloseTag(name),
      ontext: (data) => sanitizer.onText(data),
    },
    { decodeEntities: true, lowerCaseTags: true, lowerCaseAttributeNames: true },
  );
  parser.write(html);
  parser.end();
  return sanitizer.finish();
}
