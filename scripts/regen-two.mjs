#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

const KEY = process.env.GEMINI_API_KEY;
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const refB64 = (await fs.readFile(path.join(ROOT, 'api', 'reference-card.jpg'))).toString('base64');

const TARGETS = [
  { out: 'public/images/drinks/21-london-fog-latte.jpg', name: 'London Fog Latte', taste: 'tea latte + creamy + ~120 cal',
    ing: ['1 Earl Grey tea bag','¾ cup hot water','½ cup milk (or oat milk)','1 tsp vanilla','1 tbsp honey','pinch lavender (optional)','pinch salt'],
    steps: ['steep Earl Grey in ¾ cup hot water 5 min','remove tea bag + add honey + vanilla','add tiny pinch dried lavender (optional)','stir until honey dissolves','in small pot warm ½ cup milk 2 min','froth milk with whisk or jar shake','pour milk over tea','spoon foam on top + sprinkle lavender'] },
  { out: 'public/images/cards/honey-cinnamon-strips.png', name: 'Honey Cinnamon Strips', taste: 'sweet + warm + yummy + ~100 cal',
    ing: ['2 slices sandwich bread','1 tbsp butter, melted','1 tbsp honey','¼ tsp cinnamon','pinch of sugar (optional)'],
    steps: ['preheat oven to 350°F','cut crusts off bread, cut into 4 strips','mix melted butter, honey, and cinnamon','brush mixture on both sides of strips','sprinkle with a little sugar if you like','bake 8-10 min until golden and crispy','let cool, then enjoy!'] }
];

const PROMPT = (t) => `Create ONE recipe card. CRITICAL: the ENTIRE FRAME must be the recipe card itself — pure white textured paper background filling 100% of the image. ABSOLUTELY NO wooden table, NO desk surface, NO pencils/markers/erasers around the card, NO photo of "a card sitting on a surface". The card IS the image, edge to edge.

Match reference visual style EXACTLY: watercolor + marker illustration on WHITE textured paper, thick black outlines, vibrant marker fills (hot pink, lime green, coral, teal, mustard), chunky hand-lettered BUBBLE LETTER title with color fill, taste-descriptor subtitle directly under title, two columns (pink INGREDIENTS left with checkboxes ☐, green STEPS right with red/pink circled numbers), small illustrated ingredient drawings scattered around the borders BETWEEN/INSIDE the white card area. Two small rounded badge tags top corners.

TITLE: ${t.name.toUpperCase()}
TASTE LINE: ${t.taste}

INGREDIENTS (left, pink header, checkboxes ☐):
${t.ing.map(i=>'☐ '+i).join('\n')}

STEPS (right, green header, numbered circles 1-${t.steps.length}):
${t.steps.map((s,i)=>`${i+1}. ${s}`).join('\n')}

DOODLES around the card (inside the white paper area, NOT outside): ${t.ing.slice(0,6).map(i=>i.replace(/^[\d¼½¾⅓⅔\s/.-]+/,'').split(' ').slice(0,2).join(' ')).join(', ')}.

Output 16:9 landscape. White paper edge-to-edge. NO surfaces, NO context — just the card.`;

for (const t of TARGETS) {
  console.log(`Regenerating ${t.name}...`);
  const body = {
    contents: [{ parts: [{ inlineData: { mimeType: 'image/jpeg', data: refB64 } }, { text: PROMPT(t) }] }],
    generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '16:9' }, candidateCount: 1 }
  };
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image:generateContent?key=${KEY}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await res.json();
  if (!res.ok) { console.error(`  ✗ ${JSON.stringify(d).slice(0,300)}`); continue; }
  const img = (d?.candidates?.[0]?.content?.parts || []).find(p => p.inlineData?.data);
  if (!img) { console.error('  ✗ no image'); continue; }
  const outPath = path.join(ROOT, t.out);
  await fs.writeFile(outPath, Buffer.from(img.inlineData.data, 'base64'));
  console.log(`  ✓ ${t.out}`);
}
