// Synthetic source-shaped HTML, never private clipboard captures. Target tests check
// the hand-over contract; only the separate WebKit lab exercises an editor's paste.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cleanContent } from '../src/convert.ts';
const sources = JSON.parse(readFileSync(new URL('./fixtures/audit/sources.json', import.meta.url), 'utf8')) as {
  source: string; html: string; text: string; contains: string[];
}[];
for (const fixture of sources) {
  for (const target of ['Mail', 'Gmail', 'Slack', 'WhatsApp text', 'Notion']) {
    test(`source contract: ${fixture.source} -> ${target}`, () => {
      const result = cleanContent(fixture)!;
      assert.ok(result);
      for (const text of fixture.contains) { assert.ok(result.text.includes(text), text + ': ' + result.text); }
      if (target === 'WhatsApp text') { assert.doesNotMatch(result.text, /<\/?(?:div|ul|li|table|pre)[ >]/); return; }
      assert.match(result.html, /<b>Plan<\/b>/);
      assert.match(result.html, /<a href="https:\/\/example.com\/brief\?a=1&amp;b=2">Brief<\/a>/);
      assert.match(result.html, /<table/);
      assert.match(result.html, /Liść/);
      assert.match(result.html, /white-space: pre-wrap/);
      assert.doesNotMatch(result.html, /background|font-family|color:|<script|<div[^>]*><ul|<\/ul><\/div>/);
    });
  }
}
