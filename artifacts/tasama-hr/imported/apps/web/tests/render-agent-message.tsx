/** Temporary visual-check page rendered from the real component and built CSS.
 * The generated page lives only in dist and is removed after the screenshot. */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { AgentMessage } from '../src/app/agent-message';

const example = `Based on policy, proceeding without a completed PIP creates significant risk. Here is what applies:

- **PIP is mandatory before performance termination.** A PIP must be at least 60 days, with written objectives and regular reviews [HR-09 §9.6].
- **Termination for performance without a completed PIP is not valid** under Red Sea Global's policy. If the contract is ended without a valid reason, compensation under Saudi Labor Law Art. 77 is due [HR-12 §12.4].
- **Dismissal without a PIP is only permissible** if the grounds fall under one of the Art. 80 cases (gross misconduct), and even then a formal investigation must be completed first [HR-12 §12.4].
- **Every termination requires approval** from the CHRO and Legal [HR-12 §12.4].

**Recommended path:** Issue a PIP now (minimum 60 days), document objectives and reviews, then proceed if performance does not improve. If there are misconduct grounds instead of performance grounds, a formal investigation is needed first.

Would you like me to route this to Legal for review, or help you initiate a PIP case?`;

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const css = readdirSync(`${dist}/assets`).find(name => /^index-.*\.css$/.test(name));
if (!css) throw new Error('Build the app before rendering the check page.');
const content = renderToStaticMarkup(createElement(AgentMessage, { content: example }));
writeFileSync(`${dist}/agent-message-check.html`, `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/assets/${css}"><title>Agent message formatting check</title></head><body style="margin:0;background:#fff;font-family:Inter,sans-serif"><main style="max-width:620px;margin:auto;padding:24px;font-size:13px;--foreground:230 20% 15%;--primary:244 93% 32%"><div style="display:flex;gap:12px"><span style="background:#10069E;color:white;border-radius:50%;width:24px;height:24px;flex-shrink:0;display:grid;place-items:center;font-size:11px;font-weight:600">M</span><div style="min-width:0">${content}</div></div></main></body></html>`);
console.log('Temporary real-component check page generated.');
