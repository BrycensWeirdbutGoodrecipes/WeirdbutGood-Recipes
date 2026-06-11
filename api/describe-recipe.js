import { checkBudget, recordSpend } from './_budget.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const { description, type } = req.body || {};
  if (!description) return res.status(400).json({ error: 'description required' });
  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: 'no gemini key' });

  const budget = await checkBudget('describe-recipe');
  if (!budget.allowed) return res.status(429).json({ error: `Daily AI budget hit ($1/day). Resets midnight UTC.`, budget });

  const kind = type === 'snack' ? 'snack' : 'drink';
  const cats = kind === 'snack' ? '"sweet","savory","fresh","energy"' : '"coffee","energy","fruit","hot","mocktail","low-cal","savory","custom"';

  const prompt = `Invent ONE ${kind} recipe based on this description. Pick a catchy 2-4 word name, a short taste descriptor (e.g. "sweet + tart + ~80 cal"), a category from [${cats}], ingredients list with measurements, and 5-8 short numbered steps.

User's description: "${description}"

Reply as STRICT JSON only (no markdown, no extra text):
{
  "name": "Catchy name",
  "taste": "short + + ~XX cal",
  "category": "...",
  "ingredients": ["1 cup x","2 tbsp y", ...],
  "steps": ["short step 1", ...]
}`;

  try {
    const apiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.9, maxOutputTokens: 800, thinkingConfig: { thinkingBudget: 0 } }
        })
      }
    );
    const data = await apiRes.json();
    if (!apiRes.ok) return res.status(500).json({ error: 'gemini error', detail: data });
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    const cleaned = text.replace(/^```json\s*|\s*```$/g, '').replace(/^```\s*|\s*```$/g, '').trim();
    try {
      const parsed = JSON.parse(cleaned);
      await recordSpend('describe-recipe');
      return res.status(200).json({ ok: true, ...parsed });
    } catch (e) { return res.status(500).json({ error: 'parse failed', raw: text }); }
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
}
