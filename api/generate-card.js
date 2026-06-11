// Generate a hand-drawn recipe card image via Gemini 3 Pro Image (Nano Banana Pro)
// Uses a reference image to match the exact style of the existing cards.
import { put } from '@vercel/blob';
import fs from 'fs';
import path from 'path';
import { checkBudget, recordSpend } from './_budget.js';

let REFERENCE_B64 = null;
function loadReference() {
  if (REFERENCE_B64) return REFERENCE_B64;
  try {
    const p = path.join(process.cwd(), 'api', 'reference-card.jpg');
    REFERENCE_B64 = fs.readFileSync(p).toString('base64');
  } catch (e) {
    REFERENCE_B64 = null;
  }
  return REFERENCE_B64;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const { name, category, taste, ingredients, steps } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name required' });

  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: 'no gemini key' });

  // Daily $1 budget check
  const budget = await checkBudget('generate-card');
  if (!budget.allowed) {
    return res.status(429).json({ error: `Daily AI budget hit ($1/day). Spent: $${budget.spent.toFixed(2)}. Resets at midnight UTC.`, budget });
  }

  // Polish title + taste line in one Gemini Flash call
  let prettyName = name;
  let prettyTaste = taste || '';
  try {
    const polishRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `Improve this drink recipe's NAME and TASTE LINE to sound cooler/catchier.

NAME rules: 2-4 words MAX, punchy and memorable. Examples: "Hibiscus Lime Cooler" (not "Hibiscus Lime"), "Dragon Fuel" (not "watermelon smoothie"), "Golden Milk" (not "honey milk"), "Midnight Brew" (not "cold coffee").

TASTE LINE rules: short descriptor connected by + symbols, optionally end with calorie estimate. Examples: "sweet + tart + ~30 cal", "floral + creamy + ~120 cal", "spicy + smooth + ~50 cal", "earthy + bright + ~80 cal". Keep under 30 chars.

Original name: "${name}"
Original taste: "${taste || '(none)'}"
Ingredients: ${ingredients || '(none)'}
Category: ${category || ''}

Reply with EXACTLY two lines, no labels, no extra text:
LINE 1 = new name
LINE 2 = new taste line` }] }],
          generationConfig: { temperature: 0.9, maxOutputTokens: 200, thinkingConfig: { thinkingBudget: 0 } }
        })
      }
    );
    const pdata = await polishRes.json();
    const out = pdata?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    const lines = out.split(/\n+/).map(s => s.trim().replace(/^["']|["']$/g, '').replace(/^(name|taste)[: ]*/i, '')).filter(Boolean);
    if (lines[0] && lines[0].length < 50) prettyName = lines[0];
    if (lines[1] && lines[1].length < 60) prettyTaste = lines[1];
  } catch (e) { /* keep originals */ }

  const ingLines = (ingredients || '').split(/\n+/).map(s => s.trim()).filter(Boolean);
  const stpLines = (steps || '').split(/\n+/).map(s => s.trim()).filter(Boolean);

  // Pull ingredient keywords for explicit doodle direction
  const keywords = ingLines.map(l => l.replace(/^\d+[/.]?\d*\s*\w*\s*/,'').replace(/\(.*\)/,'').trim().split(/\s+/).slice(0,3).join(' ')).filter(Boolean).slice(0,8).join(', ');

  const prompt = `Create ONE single recipe card image matching the visual style of the REFERENCE IMAGE EXACTLY: watercolor + marker illustration on white textured paper, thick confident black outlines, vibrant marker fills (hot pink, lime green, coral, teal, mustard), chunky hand-lettered BUBBLE LETTER title with color fill, a short taste-descriptor subtitle directly under the title (small, handwritten, with + symbols between words), two columns (pink INGREDIENTS on left with hand-drawn checkboxes ☐, green STEPS on right with red/pink circled numbers), and MANY small detailed illustrated drawings of the actual ingredients scattered around the borders and between columns (e.g., if recipe has mint draw a mint sprig; if lemon draw lemon slices; if ice draw ice cubes; if honey draw a honey jar; if a tea bag draw a tea bag). Two small rounded badge tags at the top corners describing the vibe in caps with a decorative border. Output ONE single card filling the frame — NOT a sheet of variations, NOT a collage.

Card content — use EXACTLY this, do not invent additions:

TITLE (chunky bubble letters): ${prettyName.toUpperCase()}
TASTE LINE (small handwritten under title): ${prettyTaste || `${category || 'custom'} recipe`}

INGREDIENTS (left column, pink header, with checkboxes ☐):
${ingLines.length ? ingLines.map(l => '☐ ' + l).join('\n') : '☐ (use what makes sense)'}

STEPS (right column, green header, numbered red circles 1 through ${stpLines.length || 'N'}):
${stpLines.length ? stpLines.map((l,i)=>`${i+1}. ${l}`).join('\n') : '1. (use sensible steps)'}

REQUIRED DOODLES around the card (draw each of these as a small illustration): ${keywords || 'related ingredients'}.

Hand-lettered, illustrated cookbook page aesthetic — NOT childish, NOT cartoonish, like the reference image.`;

  const ref = loadReference();
  const parts = [];
  if (ref) parts.push({ inlineData: { mimeType: 'image/jpeg', data: ref } });
  parts.push({ text: prompt });

  try {
    const apiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '4:5' }, candidateCount: 1 }
        })
      }
    );
    const data = await apiRes.json();
    if (!apiRes.ok) return res.status(500).json({ error: 'gemini error', detail: data });

    const rparts = data?.candidates?.[0]?.content?.parts || [];
    const imgPart = rparts.find(p => p.inlineData?.data);
    if (!imgPart) return res.status(500).json({ error: 'no image in response', detail: data });

    const buffer = Buffer.from(imgPart.inlineData.data, 'base64');
    const filename = `cards/${Date.now()}-${prettyName.toLowerCase().replace(/[^a-z0-9]+/g,'-').slice(0,40)}.png`;
    const blob = await put(filename, buffer, { access: 'public', contentType: 'image/png', addRandomSuffix: false });

    await recordSpend('generate-card');
    return res.status(200).json({ ok: true, url: blob.url, prettyName, prettyTaste });
  } catch (err) {
    return res.status(500).json({ error: 'generation failed', detail: String(err) });
  }
}
