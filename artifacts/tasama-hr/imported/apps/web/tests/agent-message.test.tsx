import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AgentMessage } from '../src/app/agent-message';

const render = (content: string) => renderToStaticMarkup(createElement(AgentMessage, { content }));

test('renders the supplied policy-answer structure without raw Markdown markers', () => {
  const html = render('Based on policy, proceeding without a completed PIP creates significant risk.\n\n- **PIP is mandatory before performance termination.** A PIP must be at least 60 days [HR-09 §9.6].\n- **Every termination requires approval** from the CHRO and Legal [HR-12 §12.4].\n\n**Recommended path:** Issue a PIP now.\n\nWould you like me to route this to Legal?');
  assert.match(html, /<ul[^>]*>/);
  assert.equal((html.match(/<li /g) ?? []).length, 2);
  assert.match(html, /<strong[^>]*>PIP is mandatory before performance termination\.<\/strong>/);
  assert.match(html, /<strong[^>]*>Recommended path:<\/strong>/);
  assert.match(html, /HR-09 §9\.6/);
  assert.match(html, /HR-12 §12\.4/);
  assert.doesNotMatch(html, /\*\*/);
});

test('supports headings, numbered steps, nested lists, tables and inline code', () => {
  const html = render('## Next steps\n\n1. Review the evidence\n2. Get approval\n   - HR review\n\n| Step | Owner |\n| --- | --- |\n| Review | HR |\n\nReference: `WF-20`.');
  assert.match(html, /<h3 /);
  assert.match(html, /<ol /);
  assert.match(html, /<ul /);
  assert.match(html, /<table /);
  assert.match(html, /<code[^>]*>WF-20<\/code>/);
});

test('preserves Arabic and policy references with automatic reading direction', () => {
  const html = render('**المسار الموصى به:** مراجعة خطة تحسين الأداء.\n\n- موافقة الموارد البشرية [HR-12 §12.4]');
  assert.match(html, /dir="auto"/);
  assert.match(html, /<strong[^>]*>المسار الموصى به:<\/strong>/);
  assert.match(html, /HR-12 §12\.4/);
});

test('does not render arbitrary HTML, executable links or tracking images', () => {
  const html = render('<script>alert(1)</script>\n\n<img src="https://example.com/track" onerror="alert(1)">\n\n[unsafe](javascript:alert%281%29)\n\n![Tracking](https://example.com/pixel.png)\n\n[safe](https://example.com/policy)');
  assert.doesNotMatch(html, /<script|<img|javascript:|onerror=|pixel\.png/);
  assert.match(html, /href="https:\/\/example\.com\/policy"/);
  assert.match(html, /rel="noopener noreferrer"/);
});
