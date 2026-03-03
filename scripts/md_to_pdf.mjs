import { readFileSync, writeFileSync } from 'fs';
import { marked } from 'marked';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const md = readFileSync(path.join(root, 'LAUNCH_CAMPAIGN_PLAN.md'), 'utf8');
const body = marked.parse(md);

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Zero1 — World-Class Launch Campaign Plan</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: "Georgia", "Times New Roman", serif;
    font-size: 11pt;
    line-height: 1.65;
    color: #1a1a2e;
    background: #ffffff;
    padding: 0;
  }

  /* ── Cover header ── */
  .cover {
    background: linear-gradient(135deg, #0f3460 0%, #16213e 60%, #1a1a2e 100%);
    color: #ffffff;
    padding: 56px 56px 48px;
    margin-bottom: 0;
  }
  .cover-eyebrow {
    font-family: "Helvetica Neue", Arial, sans-serif;
    font-size: 9pt;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: #a8c4e0;
    margin-bottom: 16px;
  }
  .cover h1 {
    font-family: "Helvetica Neue", Arial, sans-serif;
    font-size: 28pt;
    font-weight: 800;
    line-height: 1.15;
    color: #ffffff;
    margin-bottom: 16px;
    border: none;
  }
  .cover-subtitle {
    font-size: 13pt;
    color: #c8d8e8;
    font-style: italic;
    margin-bottom: 28px;
  }
  .cover-meta {
    font-family: "Helvetica Neue", Arial, sans-serif;
    font-size: 9pt;
    color: #88aacc;
    letter-spacing: 0.05em;
  }
  .cover-formula {
    display: inline-block;
    background: rgba(255,255,255,0.08);
    border: 1px solid rgba(168,196,224,0.3);
    border-radius: 6px;
    padding: 10px 20px;
    font-family: "Helvetica Neue", Arial, sans-serif;
    font-size: 10pt;
    color: #e0ecf8;
    margin-top: 24px;
    letter-spacing: 0.03em;
  }

  /* ── Main content ── */
  .content {
    padding: 40px 56px 56px;
  }

  h1 { display: none; } /* covered by the .cover block */

  h2 {
    font-family: "Helvetica Neue", Arial, sans-serif;
    font-size: 16pt;
    font-weight: 700;
    color: #0f3460;
    margin: 40px 0 14px;
    padding-bottom: 6px;
    border-bottom: 2.5px solid #0f3460;
    page-break-after: avoid;
  }

  h3 {
    font-family: "Helvetica Neue", Arial, sans-serif;
    font-size: 13pt;
    font-weight: 700;
    color: #16213e;
    margin: 28px 0 10px;
    page-break-after: avoid;
  }

  h4 {
    font-family: "Helvetica Neue", Arial, sans-serif;
    font-size: 10.5pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: #0f3460;
    margin: 20px 0 8px;
    page-break-after: avoid;
  }

  p {
    margin: 0 0 12px;
  }

  a { color: #1565c0; text-decoration: none; }

  /* ── Blockquote (philosophy callout) ── */
  blockquote {
    background: #f0f5ff;
    border-left: 5px solid #0f3460;
    border-radius: 0 6px 6px 0;
    padding: 16px 20px;
    margin: 16px 0 24px;
    color: #1a1a2e;
    font-style: italic;
  }
  blockquote p { margin: 0; }
  blockquote strong { font-style: normal; color: #0f3460; }

  /* ── Tables ── */
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 9pt;
    font-family: "Helvetica Neue", Arial, sans-serif;
    margin: 14px 0 22px;
    page-break-inside: avoid;
  }
  thead tr {
    background: #0f3460;
    color: #ffffff;
  }
  thead th {
    padding: 8px 10px;
    text-align: left;
    font-weight: 700;
    letter-spacing: 0.04em;
    border: 1px solid #0a2647;
  }
  tbody tr:nth-child(even) { background: #f4f7fb; }
  tbody tr:nth-child(odd)  { background: #ffffff; }
  tbody tr:hover           { background: #e8f0fe; }
  tbody td {
    padding: 7px 10px;
    border: 1px solid #dde3ed;
    vertical-align: top;
    line-height: 1.4;
  }
  tbody td:first-child { font-weight: 600; color: #0f3460; }

  /* ── Code blocks (timeline) ── */
  pre {
    background: #0f1923;
    color: #c8d8e8;
    border-radius: 8px;
    padding: 24px 28px;
    font-family: "Courier New", Courier, monospace;
    font-size: 8.5pt;
    line-height: 1.6;
    overflow: hidden;
    margin: 16px 0 24px;
    page-break-inside: avoid;
    white-space: pre-wrap;
    word-break: break-word;
  }
  code {
    font-family: "Courier New", Courier, monospace;
    font-size: 8.5pt;
    background: #eef2f9;
    color: #0f3460;
    padding: 1px 5px;
    border-radius: 3px;
  }
  pre code {
    background: transparent;
    color: inherit;
    padding: 0;
    font-size: inherit;
  }

  /* ── Lists ── */
  ul, ol {
    padding-left: 22px;
    margin: 0 0 12px;
  }
  li { margin-bottom: 5px; }
  li strong { color: #0f3460; }

  /* ── Horizontal rules ── */
  hr {
    border: none;
    border-top: 1.5px solid #dde3ed;
    margin: 32px 0;
  }

  /* ── Page breaks ── */
  h2 { page-break-before: auto; }
  .page-break { page-break-after: always; }

  /* ── Footer ── */
  @page {
    margin: 18mm 14mm 20mm;
    @bottom-center {
      content: "Zero1 Launch Campaign Plan — Confidential";
      font-family: "Helvetica Neue", Arial, sans-serif;
      font-size: 8pt;
      color: #888;
    }
    @bottom-right {
      content: counter(page);
      font-family: "Helvetica Neue", Arial, sans-serif;
      font-size: 8pt;
      color: #888;
    }
  }

  /* ── TOC styling ── */
  .toc { margin-bottom: 32px; }
  .toc a { color: #0f3460; }

  /* ── Small tag styling ── */
  em { color: #444; }
  strong { color: #1a1a2e; }
</style>
</head>
<body>

<div class="cover">
  <div class="cover-eyebrow">Zero1 · Internal Planning Document</div>
  <h1 class="cover-title">World-Class<br>Launch Campaign Plan</h1>
  <div class="cover-subtitle">AI-Powered Bible Study Platform — Post-Beta Go-To-Market Playbook</div>
  <div class="cover-formula">
    Idea &times; Infrastructure &times; Distribution &times; Switching Cost = Durable Revenue
  </div>
  <div class="cover-meta" style="margin-top:24px;">Generated: 2026-03-03 &nbsp;|&nbsp; Confidential</div>
</div>

<div class="content">
${body}
</div>

</body>
</html>`;

const htmlPath = path.join(root, 'LAUNCH_CAMPAIGN_PLAN.html');
const pdfPath  = path.join(root, 'LAUNCH_CAMPAIGN_PLAN.pdf');

writeFileSync(htmlPath, html);
console.log('HTML written to', htmlPath);

execSync(
  `wkhtmltopdf \
    --enable-local-file-access \
    --page-size A4 \
    --margin-top 0 \
    --margin-bottom 18 \
    --margin-left 0 \
    --margin-right 0 \
    --title "Zero1 Launch Campaign Plan" \
    --footer-center "Zero1 Launch Campaign Plan — Confidential" \
    --footer-right "[page]" \
    --footer-font-size 8 \
    --footer-spacing 5 \
    --no-stop-slow-scripts \
    --javascript-delay 200 \
    "${htmlPath}" "${pdfPath}"`,
  { stdio: 'inherit' }
);

console.log('PDF written to', pdfPath);
