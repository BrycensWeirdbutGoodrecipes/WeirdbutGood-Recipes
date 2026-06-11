// Take a photo of ingredients → Gemini identifies them → suggests a drink recipe
import { logActivity } from './activity.js';
import { checkBudget, recordSpend } from './_budget.js';
export const config = { api: { bodyParser: { sizeLimit: '8mb' } } };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const { imageBase64, imageMime } = req.body || {};
  if (!imageBase64) return res.status(400).json({ error: 'imageBase64 required' });

  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: 'no gemini key' });

  const budget = await checkBudget('photo-to-recipe');
  if (!budget.allowed) return res.status(429).json({ error: `Daily AI budget hit ($1/day). Resets midnight UTC.`, budget });

  const prompt = `Look at this photo and identify all the food/drink ingredients you can see. Then invent ONE creative, weird-but-good drink recipe using ONLY those ingredients (plus basic kitchen staples like water, ice, salt).

Respond as STRICT JSON only (no markdown, no extra text):
{
  "ingredientsSeen": ["item1", "item2", ...],
  "name": "Catchy 2-4 word drink name",
  "taste": "short + descriptors + + ~XX cal",
  "category": "fruit|coffee|energy|hot|mocktail|low-cal|savory|custom",
  "ingredients": ["1 cup x", "2 tbsp y", ...],
  "steps": ["short step 1", "short step 2", ...]
}`;

  try {
    const apiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { inlineData: { mimeType: imageMime || 'image/jpeg', data: imageBase64 } },
              { text: prompt }
            ]
          }],
          generationConfig: { temperature: 0.8, maxOutputTokens: 800, thinkingConfig: { thinkingBudget: 0 } }
        })
      }
    );
    const data = await apiRes.json();
    if (!apiRes.ok) return res.status(500).json({ error: 'gemini error', detail: data });

    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    // strip code fences if present
    const cleaned = text.replace(/^```json\s*|\s*```$/g, '').replace(/^```\s*|\s*```$/g, '').trim();
    let parsed;
    try { parsed = JSON.parse(cleaned); } catch (e) {
      return res.status(500).json({ error: 'parse failed', raw: text });
    }
    const user = req.headers['x-user-email'] || 'anonymous';
    await logActivity({ type: 'photo_recipe', by: user, ingredientsSeen: parsed.ingredientsSeen, suggested: parsed.name });
    await recordSpend('photo-to-recipe');
    return res.status(200).json({ ok: true, ...parsed });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
}
