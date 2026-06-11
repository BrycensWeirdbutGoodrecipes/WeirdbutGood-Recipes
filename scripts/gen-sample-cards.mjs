#!/usr/bin/env node
// Generate sample drawn recipe cards using Gemini 3 Pro Image
// Matches the style of api/reference-card.jpg
import fs from 'node:fs/promises';
import path from 'node:path';

const KEY = process.env.GEMINI_API_KEY;
if (!KEY) { console.error('GEMINI_API_KEY missing'); process.exit(1); }

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const REF_PATH = path.join(ROOT, 'api', 'reference-card.jpg');
const OUT_DIR = path.join(ROOT, 'public', 'images', 'cards');
await fs.mkdir(OUT_DIR, { recursive: true });

const refBuf = await fs.readFile(REF_PATH);
const refB64 = refBuf.toString('base64');

const SAMPLES = [
  { slug: 'pickle-brine-sparkler', name: 'Pickle Brine Sparkler', category: 'savory drink',
    taste: 'salty + tangy + ~5 cal',
    ingredients: ['¼ cup pickle brine', '1 cup sparkling water', '2 ice cubes', '1 lime wedge', 'pinch sea salt'],
    steps: ['fill glass with ice', 'pour ¼ cup pickle brine over ice', 'top with sparkling water', 'squeeze lime wedge in', 'stir + garnish with pickle slice'] },
  { slug: 'cucumber-hummus-boats', name: 'Cucumber Hummus Boats', category: 'low-cal snack',
    taste: 'crunchy + fresh + ~80 cal',
    ingredients: ['1 large cucumber', '½ cup hummus', '1 tbsp olive oil', 'sprinkle paprika', 'fresh dill', 'lemon zest'],
    steps: ['slice cucumber lengthwise', 'scoop seeds out with spoon to make boats', 'fill each boat with hummus', 'drizzle olive oil on top', 'sprinkle paprika + dill', 'finish with lemon zest'] },
  { slug: 'zucchini-noodle-bowl', name: 'Zucchini Noodle Bowl', category: 'low-cal food',
    taste: 'fresh + savory + ~150 cal',
    ingredients: ['2 medium zucchini', '1 tbsp olive oil', '2 cloves garlic', '½ cup cherry tomatoes', 'fresh basil', 'parmesan', 'pinch chili flakes'],
    steps: ['spiralize zucchini into noodles', 'heat olive oil in pan', 'add minced garlic + cook 30 sec', 'toss zoodles in pan 2 min', 'add halved tomatoes', 'top with basil + parm + chili flakes'] }
];

const PROMPT_TEMPLATE = (s) => `Create ONE single recipe card image matching the visual style of the REFERENCE IMAGE EXACTLY: watercolor + marker illustration on white textured paper, thick confident black outlines, vibrant marker fills (hot pink, lime green, coral, teal, mustard), chunky hand-lettered BUBBLE LETTER title with color fill, a short taste-descriptor subtitle directly under the title (small, handwritten, with + symbols between words), two columns (pink INGREDIENTS on left with hand-drawn checkboxes ☐, green STEPS on right with red/pink circled numbers), and MANY small detailed illustrated drawings of the actual ingredients scattered around the borders and between columns. Two small rounded badge tags at the top corners describing the vibe in caps. Output ONE single card filling the frame — NOT a sheet, NOT a collage.

TITLE (chunky bubble letters): ${s.name.toUpperCase()}
TASTE LINE (small handwritten under title): ${s.taste}

INGREDIENTS (left column, pink header, with checkboxes ☐):
${s.ingredients.map(i => '☐ ' + i).join('\n')}

STEPS (right column, green header, numbered red circles 1 through ${s.steps.length}):
${s.steps.map((st,i)=>`${i+1}. ${st}`).join('\n')}

REQUIRED DOODLES around the card (draw each as small illustrations): ${s.ingredients.slice(0,6).map(i=>i.replace(/^[\d¼½¾⅓⅔\s/.-]+/,'').split(' ').slice(0,2).join(' ')).join(', ')}.

Hand-lettered illustrated cookbook page aesthetic — landscape orientation matching reference.`;

async function generate(s) {
  console.log(`\n[${s.slug}] generating...`);
  const body = {
    contents: [{ parts: [
      { inlineData: { mimeType: 'image/jpeg', data: refB64 } },
      { text: PROMPT_TEMPLATE(s) }
    ] }],
    generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '16:9' }, candidateCount: 1 }
  };
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image:generateContent?key=${KEY}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );
  const data = await res.json();
  if (!res.ok) { console.error(`[${s.slug}] error:`, JSON.stringify(data).slice(0,500)); return; }
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const img = parts.find(p => p.inlineData?.data);
  if (!img) { console.error(`[${s.slug}] no image, response:`, JSON.stringify(data).slice(0,500)); return; }
  const out = path.join(OUT_DIR, `${s.slug}.png`);
  await fs.writeFile(out, Buffer.from(img.inlineData.data, 'base64'));
  const sz = (await fs.stat(out)).size;
  console.log(`[${s.slug}] saved ${out} (${(sz/1024).toFixed(0)}KB)`);
}

for (const s of SAMPLES) {
  try { await generate(s); } catch (e) { console.error(`[${s.slug}] threw:`, e.message); }
}
console.log('\ndone.');
