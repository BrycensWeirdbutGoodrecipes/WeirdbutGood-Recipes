// Admin-only: log + list donations (manual entry, since payment APIs aren't wired)
import { put, head } from '@vercel/blob';
const ADMIN_EMAILS = ['perinabrycen9@gmail.com'];
const KEY = 'donations.json';

async function load() {
  try {
    const info = await head(KEY).catch(() => null);
    if (!info) return [];
    const buster = info.uploadedAt ? new Date(info.uploadedAt).getTime() : Date.now();
    const r = await fetch(info.url + '?v=' + buster, { cache: 'no-store' });
    if (!r.ok) return [];
    return await r.json();
  } catch (e) { return []; }
}
async function save(arr) {
  await put(KEY, JSON.stringify(arr), {
    access: 'public', contentType: 'application/json',
    allowOverwrite: true, addRandomSuffix: false, cacheControlMaxAge: 0,
  });
}
function isAdmin(e) { return e && ADMIN_EMAILS.includes(String(e).toLowerCase()) }

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const email = (req.headers['x-admin-email'] || '').toLowerCase();

  if (req.method === 'GET') {
    const donations = await load();
    // GET is public — anyone can see the total (used by public stats wall)
    const total = donations.reduce((s, d) => s + (Number(d.amount) || 0), 0);
    return res.status(200).json({ donations: isAdmin(email) ? donations : [], total, count: donations.length });
  }

  if (!isAdmin(email)) return res.status(403).json({ error: 'admin only' });

  if (req.method === 'POST') {
    const { name, amount, source, note } = req.body || {};
    const amt = Number(amount);
    if (!name || !amt || isNaN(amt)) return res.status(400).json({ error: 'name + amount required' });
    const donations = await load();
    donations.unshift({
      id: 'd_' + Math.random().toString(36).slice(2, 10),
      name, amount: amt, source: source || 'manual', note: note || '',
      at: new Date().toISOString(),
    });
    while (donations.length > 200) donations.pop();
    await save(donations);
    return res.status(200).json({ ok: true });
  }

  if (req.method === 'DELETE') {
    const { id, all } = req.body || {};
    let donations = await load();
    if (all) donations = [];
    else if (id) donations = donations.filter(d => d.id !== id);
    else return res.status(400).json({ error: 'id or all required' });
    await save(donations);
    return res.status(200).json({ ok: true });
  }
  return res.status(405).json({ error: 'method not allowed' });
}
