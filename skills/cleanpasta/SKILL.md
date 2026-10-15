---
name: cleanpasta
description: "Hand over emails, messages and replies ready to paste with their formatting (bold, lists, links) through ES Tools Cleanpasta and its cleanpasta command line tool on macOS. Use when the user asks for an email, message, reply, post or any text to paste into Mail, Gmail, Outlook, Slack, Notion, WhatsApp or a document, or says copy it formatted, put it on my clipboard, give me something to paste, clean paste, fix the clipboard or remove the formatting."
metadata:
  version: 1.1.0
  updated: 2026-10-15
  author: Eryk Sadowski
---

# cleanpasta - text ready to paste, formatting included

ES Tools Cleanpasta turns Markdown or rich text into clean formatted text: bold, italic, links, lists and line breaks stay; backgrounds, colors and fonts go; em and en dashes become "-" and typographic quotes become " and '. Pasted into Mail, Gmail or Slack it looks as if it was typed there.

## 1. Is the tool here?

```bash
command -v cleanpasta || ls "/Applications/Cleanpasta.app/Contents/Helpers/cleanpasta"
```

- Found: use it (full path if it is not on the PATH).
- Not found, but on a Mac with a shell: say once that ES Tools Cleanpasta is missing (install: `curl -fsSL https://github.com/iameryksadowski/estools-app-cleanpasta/releases/latest/download/install.sh | sh`) and deliver the text in the chat.
- No shell (claude.ai chat, phone): write the text normally; the user copies it and pastes with the Cleanpasta shortcut (Control+Option+Command+V).

## 2. A draft to paste

1. Write the text in Markdown: `**bold**`, `*italic*`, `- lists`, `1. lists`, `[link](https://...)`, blank lines between paragraphs. Headings become bold lines, so prefer `**1. Topic**` in emails.
2. Save it to a temporary file (body only; the subject goes in the chat, not in the file).
3. Put it on the clipboard:

   ```bash
   cleanpasta /tmp/draft.md --markdown --copy
   ```

4. Tell the user: "In your clipboard - paste with Cmd+V". Show the text in the chat as well, so they can read it before pasting.

A draft file with YAML front matter or notes after a `---` line: add `--body` to paste only the message.

## 3. Other jobs

| Job | Command |
|---|---|
| Fix what is on the clipboard (copied from a web page, a chat, a dark-mode app) | `cleanpasta --repair` |
| Paste straight into the frontmost app (needs Accessibility for the terminal) | `cleanpasta FILE --markdown --paste` |
| See the plain text or the HTML | `--print text`, `--print html`, `--print json` |
| Keep dashes or quotes as they are | `--keep-dashes`, `--keep-quotes` |
| Font size (default: the app setting, 12 px like Apple Mail; 0 = the target app decides) | `--font-size 0` |

Exit codes: 0 done, 1 usage error, 2 nothing to clean, 3 copied but no Accessibility for `--paste` (then say: press Cmd+V).

## 4. Rules

- Never send anything yourself: the clipboard is the hand-over, the user pastes and sends.
- Write with a short hyphen "-" and straight quotes " and ' from the start; the tool is a safety net, not an excuse.
- No notes about who or what wrote the text, no signatures the user did not ask for.
- One message per clipboard: when there are several drafts, copy one, wait for "next", then copy the next.
