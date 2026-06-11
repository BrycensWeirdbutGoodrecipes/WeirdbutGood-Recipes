#!/usr/bin/env node
// Generate drawn cards ONLY for placeholder recipes (no f, no img field).
// After each successful gen, edits index.html to add img:"images/cards/<slug>.png"
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const KEY = process.env.GEMINI_API_KEY;
if (!KEY) { console.error('GEMINI_API_KEY missing'); process.exit(1); }

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const HTML_PATH = path.join(ROOT, 'public', 'index.html');
const REF_PATH = path.join(ROOT, 'api', 'reference-card.jpg');
const OUT_DIR = path.join(ROOT, 'public', 'images', 'cards');
await fs.mkdir(OUT_DIR, { recursive: true });

const refB64 = (await fs.readFile(REF_PATH)).toString('base64');
const recipes = JSON.parse(await fs.readFile(path.join(ROOT, 'scripts', 'recipes.json'), 'utf8'));

const slug = s => s.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]+/gu, '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

// Targets = recipes with NO f and NO img (the emoji+grad placeholders)
const TARGETS = [];
for (const r of recipes.drinks) if (!r.f && !r.img) TARGETS.push({ ...r, kind: 'drink' });
for (const r of recipes.snacks) if (!r.f && !r.img) TARGETS.push({ ...r, kind: 'snack' });
for (const r of recipes.foods)  if (!r.f && !r.img) TARGETS.push({ ...r, kind: 'food' });

console.log(`Placeholder targets: ${TARGETS.length}`);
TARGETS.forEach(t => console.log(`  [${t.kind}/${t.cat}] ${t.n} → ${slug(t.n)}.png`));

async function gemFlash(prompt) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents:[{parts:[{text:prompt}]}], generationConfig:{ temperature:0.7, maxOutputTokens:800, thinkingConfig:{thinkingBudget:0} } })
  });
  return (await res.json())?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
}

async function describe(t) {
  const out = await gemFlash(`Generate a kid-friendly recipe for "${t.n.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]+/gu,'').trim()}" (${t.kind}, ${t.cat}). Reply with EXACTLY:

TASTE: <short descriptor with + symbols, end with ~XX cal, under 30 chars>
INGREDIENTS:
- <ingredient with quantity>
(5-8 lines)
STEPS:
1. <step>
(4-7 short imperative steps under 60 chars)`);
  const taste = (out.match(/TASTE:\s*(.+)/i)?.[1] || '').trim();
  const ing = [...out.matchAll(/^[-•]\s*(.+)$/gm)].map(m => m[1].trim());
  const steps = [...out.matchAll(/^\d+\.\s*(.+)$/gm)].map(m => m[1].trim());
  return { taste, ingredients: ing, steps };
}

const PROMPT = (t, r) => {
  const cleanName = t.n.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]+/gu,'').trim();
  return `Create ONE single recipe card image matching the visual style of the REFERENCE IMAGE EXACTLY: watercolor + marker illustration on white textured paper, thick confident black outlines, vibrant marker fills (hot pink, lime green, coral, teal, mustard), chunky hand-lettered BUBBLE LETTER title with color fill, a short taste-descriptor subtitle directly under the title (small, handwritten, with + symbols between words), two columns (pink INGREDIENTS on left with hand-drawn checkboxes ☐, green STEPS on right with red/pink circled numbers), and MANY small detailed illustrated drawings of the actual ingredients scattered around the borders and between columns. Two small rounded badge tags at the top corners describing the vibe in caps. Output ONE single card filling the frame — NOT a sheet, NOT a collage.

TITLE (chunky bubble letters): ${cleanName.toUpperCase()}
TASTE LINE (small handwritten under title): ${r.taste || `${t.cat} ${t.kind}`}

INGREDIENTS (left column, pink header, with checkboxes ☐):
${r.ingredients.length ? r.ingredients.map(i=>'☐ '+i).join('\n') : '☐ (use what makes sense)'}

STEPS (right column, green header, numbered red circles 1 through ${r.steps.length || 'N'}):
${r.steps.length ? r.steps.map((s,i)=>`${i+1}. ${s}`).join('\n') : '1. (sensible steps)'}

REQUIRED DOODLES around the card (draw each as small illustrations): ${r.ingredients.slice(0,6).map(i=>i.replace(/^[\d¼½¾⅓⅔\s/.-]+/,'').split(' ').slice(0,2).join(' ')).join(', ')}.

Hand-lettered illustrated cookbook page aesthetic — landscape 16:9 like reference.`;
};

async function genCard(t) {
  const sl = slug(t.n);
  const out = path.join(OUT_DIR, `${sl}.png`);
  if (existsSync(out)) return { ok: true, skipped: true, slug: sl };
  const r = await describe(t);
  const body = {
    contents: [{ parts: [
      { inlineData: { mimeType: 'image/jpeg', data: refB64 } },
      { text: PROMPT(t, r) }
    ] }],
    generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '16:9' }, candidateCount: 1 }
  };
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image:generateContent?key=${KEY}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await res.json();
  if (!res.ok) return { ok: false, err: JSON.stringify(d).slice(0,200) };
  const img = (d?.candidates?.[0]?.content?.parts || []).find(p => p.inlineData?.data);
  if (!img) return { ok: false, err: 'no image' };
  await fs.writeFile(out, Buffer.from(img.inlineData.data, 'base64'));
  return { ok: true, slug: sl };
}

// Inject img:"images/cards/<slug>.png" into the matching entry in index.html
async function wireIntoHtml(name, sl) {
  let html = await fs.readFile(HTML_PATH, 'utf8');
  // Match the exact entry containing n:"<name>" (with possible trailing emoji) — replace emoji:"..." with img:"...",emoji:"..."
  // Find the line: {n:"<exact name>",emoji:"...",cat:"...",grad:"..."}
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/"/g, '\\"');
  const lineRe = new RegExp(`(\\{n:"${esc}",)(emoji:"[^"]+",cat:"[^"]+",grad:"[^"]+"\\})`, 'g');
  const newHtml = html.replace(lineRe, `$1img:"images/cards/${sl}.png",$2`);
  if (newHtml === html) {
    console.warn(`  ⚠ no match in html for: ${name}`);
    return false;
  }
  await fs.writeFile(HTML_PATH, newHtml);
  return true;
}

let done = 0, skipped = 0, failed = 0, wired = 0;
const start = performance.now();
for (let i = 0; i < TARGETS.length; i++) {
  const t = TARGETS[i];
  try {
    const r = await genCard(t);
    if (r.skipped) {
      skipped++;
      if (await wireIntoHtml(t.n, r.slug)) wired++;
      console.log(`[${i+1}/${TARGETS.length}] SKIP ${t.n} (existed) → wired`);
    } else if (r.ok) {
      done++;
      if (await wireIntoHtml(t.n, r.slug)) wired++;
      console.log(`[${i+1}/${TARGETS.length}] ✓ ${t.n} → ${r.slug}.png + wired`);
    } else {
      failed++;
      console.error(`[${i+1}/${TARGETS.length}] ✗ ${t.n}: ${r.err}`);
    }
  } catch (e) {
    failed++; console.error(`[${i+1}/${TARGETS.length}] THROW ${t.n}: ${e.message}`);
  }
}
const dur = ((performance.now() - start) / 1000 / 60).toFixed(1);
console.log(`\nDONE in ${dur}min. generated=${done} skipped=${skipped} failed=${failed} wired=${wired}/${TARGETS.length}`);
