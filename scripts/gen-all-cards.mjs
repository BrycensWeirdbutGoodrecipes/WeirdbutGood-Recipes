#!/usr/bin/env node
// Batch: generate drawn recipe cards for every snack + food (drinks already have them).
// Uses Gemini 2.5 Flash for ingredients/steps, Gemini 3 Pro Image for the card.
// Resumes: skips slugs that already exist in public/images/cards/.
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const KEY = process.env.GEMINI_API_KEY;
if (!KEY) { console.error('GEMINI_API_KEY missing'); process.exit(1); }

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const REF_PATH = path.join(ROOT, 'api', 'reference-card.jpg');
const OUT_DIR = path.join(ROOT, 'public', 'images', 'cards');
const SLUG_MAP_PATH = path.join(OUT_DIR, '_slug-map.json');
await fs.mkdir(OUT_DIR, { recursive: true });

const refB64 = (await fs.readFile(REF_PATH)).toString('base64');
const recipes = JSON.parse(await fs.readFile(path.join(ROOT, 'scripts', 'recipes.json'), 'utf8'));

const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

// Collect targets: every snack + food (drinks already have illustrated cards in images/drinks/)
const TARGETS = [];
for (const s of recipes.snacks) TARGETS.push({ kind: 'snack', name: s.n.replace(/\s*[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]+\s*$/u, ''), category: s.cat });
for (const f of recipes.foods) TARGETS.push({ kind: 'food', name: f.n.replace(/\s*[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]+\s*$/u, ''), category: f.cat });

// Also include the new placeholder drink (savory) + a few low-cal placeholders for completeness
for (const d of recipes.drinks) if (!d.f && !d.img) TARGETS.push({ kind: 'drink', name: d.n.replace(/\s*[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]+\s*$/u, ''), category: d.cat });

console.log(`Targets: ${TARGETS.length} (${TARGETS.filter(t=>t.kind==='snack').length} snacks, ${TARGETS.filter(t=>t.kind==='food').length} foods, ${TARGETS.filter(t=>t.kind==='drink').length} drinks)`);

const slugMap = existsSync(SLUG_MAP_PATH) ? JSON.parse(await fs.readFile(SLUG_MAP_PATH,'utf8')) : {};

async function gemFlash(prompt) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents:[{parts:[{text:prompt}]}], generationConfig:{ temperature:0.7, maxOutputTokens:800, thinkingConfig:{thinkingBudget:0} } })
  });
  const d = await res.json();
  return d?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
}

async function describe(t) {
  const out = await gemFlash(`Generate a kid-friendly recipe for "${t.name}" (${t.kind}, category: ${t.category}). Reply with EXACTLY this format, no preamble, no markdown:

TASTE: <short descriptor with + symbols, end with ~XX cal estimate, under 30 chars, e.g. "salty + crunchy + ~120 cal">
INGREDIENTS:
- <ingredient 1>
- <ingredient 2>
(5-8 short lines, with quantities)
STEPS:
1. <step 1>
2. <step 2>
(4-8 short imperative steps under 60 chars each)`);
  const taste = (out.match(/TASTE:\s*(.+)/i)?.[1] || '').trim();
  const ing = [...out.matchAll(/^[-•]\s*(.+)$/gm)].map(m => m[1].trim());
  const steps = [...out.matchAll(/^\d+\.\s*(.+)$/gm)].map(m => m[1].trim());
  return { taste, ingredients: ing, steps };
}

const PROMPT = (t, r) => `Create ONE single recipe card image matching the visual style of the REFERENCE IMAGE EXACTLY: watercolor + marker illustration on white textured paper, thick confident black outlines, vibrant marker fills (hot pink, lime green, coral, teal, mustard), chunky hand-lettered BUBBLE LETTER title with color fill, a short taste-descriptor subtitle directly under the title (small, handwritten, with + symbols between words), two columns (pink INGREDIENTS on left with hand-drawn checkboxes ☐, green STEPS on right with red/pink circled numbers), and MANY small detailed illustrated drawings of the actual ingredients scattered around the borders and between columns. Two small rounded badge tags at the top corners describing the vibe in caps. Output ONE single card filling the frame — NOT a sheet, NOT a collage.

TITLE (chunky bubble letters): ${t.name.toUpperCase()}
TASTE LINE (small handwritten under title): ${r.taste || `${t.category} ${t.kind}`}

INGREDIENTS (left column, pink header, with checkboxes ☐):
${r.ingredients.length ? r.ingredients.map(i=>'☐ '+i).join('\n') : '☐ (use what makes sense)'}

STEPS (right column, green header, numbered red circles 1 through ${r.steps.length || 'N'}):
${r.steps.length ? r.steps.map((s,i)=>`${i+1}. ${s}`).join('\n') : '1. (sensible steps)'}

REQUIRED DOODLES around the card (draw each as small illustrations): ${r.ingredients.slice(0,6).map(i=>i.replace(/^[\d¼½¾⅓⅔\s/.-]+/,'').split(' ').slice(0,2).join(' ')).join(', ')}.

Hand-lettered illustrated cookbook page aesthetic — landscape orientation matching reference.`;

async function genCard(t) {
  const sl = slug(t.name);
  const out = path.join(OUT_DIR, `${sl}.png`);
  if (existsSync(out)) {
    slugMap[t.name] = sl;
    return { ok: true, skipped: true, slug: sl };
  }
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
  if (!res.ok) return { ok: false, err: JSON.stringify(d).slice(0,300) };
  const img = (d?.candidates?.[0]?.content?.parts || []).find(p => p.inlineData?.data);
  if (!img) return { ok: false, err: 'no image: ' + JSON.stringify(d).slice(0,300) };
  await fs.writeFile(out, Buffer.from(img.inlineData.data, 'base64'));
  slugMap[t.name] = sl;
  await fs.writeFile(SLUG_MAP_PATH, JSON.stringify(slugMap, null, 2));
  return { ok: true, slug: sl };
}

let done = 0, skipped = 0, failed = 0;
const start = performance.now();
for (let i = 0; i < TARGETS.length; i++) {
  const t = TARGETS[i];
  try {
    const r = await genCard(t);
    if (r.skipped) { skipped++; console.log(`[${i+1}/${TARGETS.length}] SKIP ${t.name} (already done)`); }
    else if (r.ok) { done++; console.log(`[${i+1}/${TARGETS.length}] ✓ ${t.name} → ${r.slug}.png`); }
    else { failed++; console.error(`[${i+1}/${TARGETS.length}] ✗ ${t.name}: ${r.err}`); }
  } catch (e) {
    failed++; console.error(`[${i+1}/${TARGETS.length}] THROW ${t.name}: ${e.message}`);
  }
}
const dur = ((performance.now() - start) / 1000 / 60).toFixed(1);
console.log(`\nDONE in ${dur} min. generated=${done} skipped=${skipped} failed=${failed}`);
await fs.writeFile(SLUG_MAP_PATH, JSON.stringify(slugMap, null, 2));
