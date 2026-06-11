#!/usr/bin/env node
// Generate individual HTML pages for every recipe — full text content + Recipe schema
// Each page becomes its own crawlable URL with ingredients/steps in REAL text (not images)
// Output: public/recipes/<slug>.html
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const KEY = process.env.GEMINI_API_KEY;
if (!KEY) { console.error('GEMINI_API_KEY missing'); process.exit(1); }

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT_DIR = path.join(ROOT, 'public', 'recipes');
const CACHE_PATH = path.join(ROOT, 'scripts', 'recipe-content-cache.json');
await fs.mkdir(OUT_DIR, { recursive: true });

const recipes = JSON.parse(await fs.readFile(path.join(ROOT, 'scripts', 'recipes.json'), 'utf8'));
const cache = existsSync(CACHE_PATH) ? JSON.parse(await fs.readFile(CACHE_PATH, 'utf8')) : {};

const slug = s => s.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]+/gu,'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60);
const cleanName = s => s.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]+/gu,'').trim();
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');

const TARGETS = [];
for (const r of recipes.drinks) TARGETS.push({...r, kind:'drink', dir:'drinks'});
for (const r of recipes.snacks) TARGETS.push({...r, kind:'snack', dir:'snacks'});
for (const r of recipes.foods)  TARGETS.push({...r, kind:'food',  dir:'foods'});

console.log(`Generating pages for ${TARGETS.length} recipes`);

async function gemFlash(prompt) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${KEY}`, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ contents:[{parts:[{text:prompt}]}], generationConfig:{temperature:0.7,maxOutputTokens:900,thinkingConfig:{thinkingBudget:0}} })
  });
  return (await res.json())?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
}

async function getContent(r) {
  const name = cleanName(r.n);
  if (cache[name]) return cache[name];
  const out = await gemFlash(`You are writing the recipe card for "${name}" (${r.kind}, category: ${r.cat}). Reply with EXACTLY this format, no preamble or markdown:

DESCRIPTION: <one-paragraph 2-3 sentence kid-friendly description of what this recipe is and why it's weird-but-good>
INGREDIENTS:
- <ingredient with quantity>
- <ingredient with quantity>
(5-9 lines total, use simple kid-friendly ingredients with quantities)
STEPS:
1. <step under 60 chars>
2. <step under 60 chars>
(4-8 short imperative steps)
TASTE: <short descriptor with + symbols, end with ~XX cal estimate, under 30 chars>
COOK_TIME: <PT5M or PT10M etc, ISO 8601 duration>
SERVINGS: <single number like 1, 2, 4>`);
  const desc = (out.match(/DESCRIPTION:\s*(.+?)(?=\n(?:INGREDIENTS|STEPS|TASTE|COOK|SERVINGS):)/is)?.[1] || '').trim();
  const ing = [...out.matchAll(/^[-•]\s*(.+)$/gm)].map(m => m[1].trim());
  const steps = [...out.matchAll(/^\d+\.\s*(.+)$/gm)].map(m => m[1].trim());
  const taste = (out.match(/TASTE:\s*(.+)/i)?.[1] || '').trim();
  const cookTime = (out.match(/COOK_TIME:\s*(\S+)/i)?.[1] || 'PT10M').trim();
  const servings = (out.match(/SERVINGS:\s*(\d+)/i)?.[1] || '1').trim();
  const content = { desc, ing, steps, taste, cookTime, servings };
  cache[name] = content;
  await fs.writeFile(CACHE_PATH, JSON.stringify(cache, null, 2));
  return content;
}

function buildPage(r, c) {
  const name = cleanName(r.n);
  const sl = slug(name);
  const cardImg = r.img || (r.f ? `/images/${r.dir}/${r.f.replace('.png','.jpg')}` : '/og-image.jpg');
  const fullImgUrl = `https://www.weirdbutgood.recipes${cardImg.startsWith('/') ? cardImg : '/' + cardImg}`;
  const desc = c.desc || `${name} — a ${r.cat} ${r.kind} from Brycen's Weird But Good Recipes.`;
  const ingList = c.ing.length ? c.ing : ['See the recipe card image above.'];
  const stepList = c.steps.length ? c.steps : ['Follow the steps on the recipe card above.'];
  const ld = {
    "@context": "https://schema.org",
    "@type": "Recipe",
    "name": name,
    "author": {"@type":"Person","name":"Brycen Perina","url":"https://www.weirdbutgood.recipes/#about"},
    "datePublished": "2026-06-10",
    "description": desc,
    "image": fullImgUrl,
    "recipeCategory": r.kind === 'drink' ? 'Drink' : (r.kind === 'food' ? 'Main Course' : 'Snack'),
    "recipeCuisine": "Kid Recipes",
    "keywords": `${name}, weird recipes for kids, ${r.cat} ${r.kind}, Brycen Perina recipes`,
    "recipeYield": `${c.servings} servings`,
    "cookTime": c.cookTime,
    "totalTime": c.cookTime,
    "recipeIngredient": ingList,
    "recipeInstructions": stepList.map(s => ({"@type":"HowToStep","text":s}))
  };
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(name)} Recipe — by Brycen (Age 11) | Weird But Good Recipes</title>
<meta name="description" content="${esc(name)} — ${esc(desc.slice(0,140))}">
<meta name="keywords" content="${esc(name)}, weird recipes for kids, ${esc(r.cat)} ${esc(r.kind)}, Brycen Perina, hand drawn recipe">
<meta name="author" content="Brycen Perina">
<meta property="og:title" content="${esc(name)} 🦊 — by Brycen (age 11)">
<meta property="og:description" content="${esc(desc.slice(0,160))}">
<meta property="og:url" content="https://www.weirdbutgood.recipes/recipes/${sl}.html">
<meta property="og:type" content="article">
<meta property="og:image" content="${esc(fullImgUrl)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(name)} — by Brycen, age 11">
<meta name="twitter:description" content="${esc(desc.slice(0,160))}">
<meta name="twitter:image" content="${esc(fullImgUrl)}">
<link rel="canonical" href="https://www.weirdbutgood.recipes/recipes/${sl}.html">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Caveat:wght@500;700&family=Patrick+Hand&display=swap" rel="stylesheet">
<script type="application/ld+json">${JSON.stringify(ld)}</script>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Patrick Hand','Comic Sans MS',cursive;background:#fff8e7;color:#222;line-height:1.65;font-size:1.1rem;padding:18px}
h1,h2,h3{font-family:'Caveat','Patrick Hand',cursive;font-weight:700;letter-spacing:1px}
.wrap{max-width:780px;margin:0 auto;background:#fff;padding:30px;border:4px solid #222;border-radius:20px;box-shadow:8px 8px 0 #ff6b9d}
h1{font-size:2.6rem;color:#ff6b9d;text-shadow:3px 3px 0 #222;line-height:1.1;margin-bottom:8px}
.taste{font-size:1.05rem;color:#666;margin-bottom:20px}
.author{font-size:.95rem;color:#666;margin-bottom:24px}
.author a{color:#ff6b9d;font-weight:bold;text-decoration:none}
.card-img{width:100%;max-width:720px;height:auto;border:4px solid #222;border-radius:14px;display:block;margin:0 auto 24px;box-shadow:6px 6px 0 #feca57}
h2{font-size:1.7rem;color:#feca57;text-shadow:2px 2px 0 #222;margin:24px 0 12px}
ul,ol{padding-left:28px;margin-bottom:16px}
li{margin-bottom:8px}
p{margin-bottom:14px}
.back{display:inline-block;margin-top:24px;padding:10px 20px;background:#feca57;border:3px solid #222;border-radius:30px;text-decoration:none;color:#222;font-weight:bold;box-shadow:4px 4px 0 #222}
.tag{display:inline-block;padding:4px 12px;background:#7bed9f;border:2px solid #222;border-radius:14px;font-size:.85rem;font-weight:bold;margin-right:6px;margin-bottom:6px}
</style>
</head>
<body>
<div class="wrap">
<h1>${esc(name)}</h1>
<div class="taste">${esc(c.taste || r.cat)}</div>
<div class="author">By <a href="/#about">Brycen Perina</a> (age 11) · <span class="tag">${esc(r.cat)}</span><span class="tag">${esc(r.kind)}</span></div>
<img class="card-img" src="${esc(cardImg)}" alt="${esc(name)} recipe card — hand-drawn by Brycen's Weird But Good Recipes">
<p>${esc(desc)}</p>
<h2>Ingredients</h2>
<ul>${ingList.map(i => `<li>${esc(i)}</li>`).join('')}</ul>
<h2>Steps</h2>
<ol>${stepList.map(s => `<li>${esc(s)}</li>`).join('')}</ol>
<h2>About this recipe</h2>
<p>This is one of <strong>${cleanName(r.n)}</strong> — part of my collection of ${TARGETS.length}+ weird-but-good recipes I made at age 11. Every card is hand-drawn by AI in a style I designed. If you make this, <a href="/#about">come say hi</a> or leave me a tip on the main page.</p>
<a href="/" class="back">🦊 Back to all recipes</a>
</div>
</body>
</html>
`;
}

let done = 0, cached = 0;
for (let i = 0; i < TARGETS.length; i++) {
  const r = TARGETS[i];
  const name = cleanName(r.n);
  const sl = slug(name);
  if (!sl) continue;
  try {
    const wasCached = !!cache[name];
    const c = await getContent(r);
    if (wasCached) cached++;
    const html = buildPage(r, c);
    await fs.writeFile(path.join(OUT_DIR, `${sl}.html`), html);
    done++;
    if (i % 10 === 0 || i === TARGETS.length - 1) console.log(`[${i+1}/${TARGETS.length}] ${name} → ${sl}.html`);
  } catch (e) {
    console.error(`[${i+1}/${TARGETS.length}] ${name}: ${e.message}`);
  }
}
console.log(`\nDONE. Generated ${done} pages, ${cached} from cache.`);
