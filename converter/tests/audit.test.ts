import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanContent, cleanMarkdown, looksLikeMarkdown, markdownBody } from '../src/convert.ts';

const options = { replaceDashes: true, replaceQuotes: true, fontSize: 0 };

test('audit: HTML code blocks preserve indentation, blank lines and literal markup', () => {
  const result = cleanContent({ html: '<pre><code>if (ok) {\n  run(&quot;x&quot;);\n\n  done();\n}</code></pre>' }, options)!;
  assert.equal(result.text, 'if (ok) {\n  run("x");\n\n  done();\n}\n');
  assert.match(result.html, /white-space: pre-wrap/);
});

test('audit: fenced Markdown code is literal and body does not stop inside a fence', () => {
  const source = '```ts\n  **literal**\n\n---\n  x_y_z\n```\n\nEnd';
  assert.equal(markdownBody(source), source);
  const result = cleanMarkdown(source, options);
  assert.equal(result.text, '  **literal**\n\n---\n  x_y_z\n\n\nEnd\n');
  assert.doesNotMatch(result.html, /<b>|```/);
});

test('audit: inline code never becomes bold, italic or a link', () => {
  const result = cleanMarkdown('Use `**raw** _value_ [x](https://example.com)` now', options);
  assert.equal(result.text, 'Use **raw** _value_ [x](https://example.com) now\n');
  assert.doesNotMatch(result.html, /<b>|<i>|<a /);
});

test('audit: Markdown numbering preserves explicit numbers and HTML li value', () => {
  assert.equal(cleanMarkdown('3. Alpha\n8. Beta\n2. Gamma', options).text, '3. Alpha\n8. Beta\n2. Gamma\n');
  assert.equal(cleanContent({ html: '<ol start="3"><li>Alpha</li><li value="8">Beta</li><li>Gamma</li></ol>' }, options)!.text,
    '3. Alpha\n8. Beta\n9. Gamma\n');
});

test('audit: descendants of ordered lists inside bullets stay in HTML', () => {
  const result = cleanMarkdown('- Parent\n  4. Child\n    - Grandchild\n      7. Leaf', options);
  assert.match(result.html, /Grandchild/);
  assert.match(result.html, /7\. Leaf/);
});

test('audit: link-only, italic-only and code-only Markdown are detected', () => {
  for (const text of ['[Brief](https://example.com)', '*ważne*', '`code`', '```js\nx\n```']) {
    assert.equal(looksLikeMarkdown(text), true, text);
    assert.equal(cleanContent({ text }, options)!.html, cleanMarkdown(text, options).html);
  }
});

test('audit: Markdown pipe tables become a table with plain text cells', () => {
  const result = cleanMarkdown('| Item | Count |\n| --- | ---: |\n| **Żółw** | 2 |', options);
  assert.match(result.html, /<table[^>]*><tr><th>Item<\/th><th>Count<\/th><\/tr><tr><td><b>Żółw<\/b><\/td><td>2<\/td><\/tr><\/table>/);
  assert.equal(result.text, 'Item\tCount\t\nŻółw\t2\n');
});
