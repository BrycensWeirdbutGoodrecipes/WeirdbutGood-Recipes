import { checkBudget, recordSpend } from './_budget.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const { message, history } = req.body || {};
  if (!message) return res.status(400).json({ error: 'message required' });
  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: 'no gemini key' });

  const budget = await checkBudget('ask-kit');
  if (!budget.allowed) return res.status(429).json({ error: `Daily AI budget hit ($1/day). Resets midnight UTC.`, budget });

  const systemInstruction = `You are Kit 🦊 — a friendly AI helper for Brycen's Recipes (brycens-recipes.vercel.app), a website by 11-year-old Brycen Perina that hosts 62+ DIY drink and snack recipes with auto-generated hand-drawn cards.

Help visitors with:
- Finding a recipe (suggest one from drinks: coffee, energy, fruit, hot, mocktails, low-cal, savory, custom; or snacks: sweet, savory, fresh, energy)
- Substitutions (no honey? use maple syrup. no peanut butter? use sunbutter.)
- Cooking tips, food questions, easy answers
- Site features: signing in, favorites, messaging Brycen, the photo→recipe tool, tipping

Keep replies SHORT (under 4 sentences). Friendly, encouraging, kid-friendly. Use emojis. If they ask something off-topic, gently steer back to food/recipes.`;

  const contents = [];
  if (Array.isArray(history)) {
    for (const m of history.slice(-10)) {
      if (m.role === 'user' || m.role === 'model') {
        contents.push({ role: m.role, parts: [{ text: String(m.text || '').slice(0, 1000) }] });
      }
    }
  }
  contents.push({ role: 'user', parts: [{ text: message.slice(0, 800) }] });

  try {
    const apiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemInstruction }] },
          contents,
          generationConfig: { temperature: 0.8, maxOutputTokens: 400, thinkingConfig: { thinkingBudget: 0 } }
        })
      }
    );
    const data = await apiRes.json();
    if (!apiRes.ok) return res.status(500).json({ error: 'gemini error', detail: data });
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || 'Hmm, I blanked. Try asking again? 🦊';
    await recordSpend('ask-kit');
    return res.status(200).json({ ok: true, reply: text });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
}
