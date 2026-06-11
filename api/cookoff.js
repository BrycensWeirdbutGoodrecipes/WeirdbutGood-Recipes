// Friend Cook-Off: challenge a friend, both upload photos, AI judges who plated better
import { put, head } from '@vercel/blob';
import { logActivity } from './activity.js';
import { checkBudget, recordSpend } from './_budget.js';

export const config = { api: { bodyParser: { sizeLimit: '8mb' } } };

const KEY = 'cookoffs.json';

async function load() {
  try {
    const info = await head(KEY).catch(() => null);
    if (!info) return [];
    const buster = info.uploadedAt ? new Date(info.uploadedAt).getTime() : Date.now();
    const r = await fetch(info.url + '?v=' + buster, { cache: 'no-store' });
    if (!r.ok) return [];
    return await r.json();
  } catch { return []; }
}
async function save(arr) {
  await put(KEY, JSON.stringify(arr), {
    access: 'public', contentType: 'application/json',
    allowOverwrite: true, addRandomSuffix: false, cacheControlMaxAge: 0,
  });
}
function uid() { return Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 6); }

async function uploadPhoto(id, side, base64, mime) {
  const buf = Buffer.from(base64, 'base64');
  const ext = (mime || 'image/jpeg').split('/')[1] || 'jpg';
  const blob = await put(`cookoffs/${id}/${side}.${ext}`, buf, {
    access: 'public', contentType: mime || 'image/jpeg',
    allowOverwrite: true, addRandomSuffix: false,
  });
  return blob.url;
}

async function judge(challenge) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('no gemini key');

  const budget = await checkBudget('cookoff-judge');
  if (!budget.allowed) throw new Error('Daily AI budget hit. Try again tomorrow.');

  const [imgA, imgB] = await Promise.all([
    fetch(challenge.challenger.photoUrl).then(r => r.arrayBuffer()).then(b => Buffer.from(b).toString('base64')),
    fetch(challenge.opponent.photoUrl).then(r => r.arrayBuffer()).then(b => Buffer.from(b).toString('base64')),
  ]);

  const prompt = `Two friends made the same recipe: "${challenge.recipeName}". Photo A is by ${challenge.challenger.name}, Photo B is by ${challenge.opponent.name}.

Judge who plated it better. Be playful and savage but fair. Score each on plating, color, technique, vibe (1-10 each). Pick a winner.

Respond as STRICT JSON only:
{
  "scoreA": {"plating": N, "color": N, "technique": N, "vibe": N, "total": N},
  "scoreB": {"plating": N, "color": N, "technique": N, "vibe": N, "total": N},
  "winner": "A" or "B" or "tie",
  "verdict": "2-3 sentence savage but funny judgment",
  "shoutoutA": "1 line praise or roast for A",
  "shoutoutB": "1 line praise or roast for B"
}`;

  const apiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: 'Photo A:' },
            { inlineData: { mimeType: 'image/jpeg', data: imgA } },
            { text: 'Photo B:' },
            { inlineData: { mimeType: 'image/jpeg', data: imgB } },
            { text: prompt },
          ]
        }],
        generationConfig: { temperature: 0.9, maxOutputTokens: 600, thinkingConfig: { thinkingBudget: 0 } }
      })
    }
  );
  const data = await apiRes.json();
  if (!apiRes.ok) throw new Error('gemini error: ' + JSON.stringify(data).slice(0, 200));
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
  const cleaned = text.replace(/^```json\s*|\s*```$/g, '').replace(/^```\s*|\s*```$/g, '').trim();
  const parsed = JSON.parse(cleaned);
  await recordSpend('cookoff-judge');
  return parsed;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id required' });
    const all = await load();
    const c = all.find(x => x.id === id);
    if (!c) return res.status(404).json({ error: 'not found' });
    return res.status(200).json({ ok: true, challenge: c });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { action } = req.body || {};

  if (action === 'create') {
    const { recipeId, recipeName, challengerName, challengerEmail, payTo } = req.body;
    if (!recipeName || !challengerName) return res.status(400).json({ error: 'recipeName + challengerName required' });
    const id = uid();
    const all = await load();
    const challenge = {
      id, recipeId, recipeName,
      challenger: { name: challengerName, email: challengerEmail || '', photoUrl: null, submittedAt: null },
      opponent: { name: null, email: null, photoUrl: null, submittedAt: null },
      payTo: payTo || 'https://cash.app/$brycenperina6',
      verdict: null,
      createdAt: new Date().toISOString(),
    };
    all.push(challenge);
    await save(all);
    await logActivity({ type: 'cookoff_created', by: challengerEmail || challengerName, recipe: recipeName, id });
    return res.status(200).json({ ok: true, id, shareUrl: `/?cookoff=${id}`, challenge });
  }

  if (action === 'setRecipe') {
    const { id, recipeName } = req.body;
    if (!id || !recipeName) return res.status(400).json({ error: 'id + recipeName required' });
    const all = await load();
    const c = all.find(x => x.id === id);
    if (!c) return res.status(404).json({ error: 'not found' });
    if (c.recipeName && c.recipeName !== '__TBD__') return res.status(400).json({ error: 'recipe already set' });
    c.recipeName = recipeName;
    await save(all);
    return res.status(200).json({ ok: true, challenge: c });
  }

  if (action === 'submit') {
    const { id, side, name, email, imageBase64, imageMime } = req.body;
    if (!id || !side || !imageBase64) return res.status(400).json({ error: 'id, side, imageBase64 required' });
    const all = await load();
    const c = all.find(x => x.id === id);
    if (!c) return res.status(404).json({ error: 'not found' });
    if (!c.recipeName || c.recipeName === '__TBD__') return res.status(400).json({ error: 'recipe must be picked before uploading' });

    const photoUrl = await uploadPhoto(id, side, imageBase64, imageMime);
    if (side === 'challenger') {
      c.challenger.photoUrl = photoUrl;
      c.challenger.submittedAt = new Date().toISOString();
    } else if (side === 'opponent') {
      c.opponent.name = name || 'Opponent';
      c.opponent.email = email || '';
      c.opponent.photoUrl = photoUrl;
      c.opponent.submittedAt = new Date().toISOString();
    } else {
      return res.status(400).json({ error: 'side must be challenger or opponent' });
    }

    // Auto-judge if both photos in
    if (c.challenger.photoUrl && c.opponent.photoUrl && !c.verdict) {
      try {
        c.verdict = await judge(c);
        c.judgedAt = new Date().toISOString();
        const winnerName = c.verdict.winner === 'A' ? c.challenger.name : c.verdict.winner === 'B' ? c.opponent.name : 'TIE';
        await logActivity({ type: 'cookoff_judged', by: winnerName, recipe: c.recipeName, winner: winnerName, challenger: c.challenger.name, opponent: c.opponent.name, id });
      } catch (e) {
        c.verdict = { error: String(e).slice(0, 200) };
      }
    }
    await save(all);
    return res.status(200).json({ ok: true, challenge: c });
  }

  return res.status(400).json({ error: 'unknown action' });
}
