// Activity log: who did what + when. Admin reads, anyone writes (server-side logged from other endpoints too).
import { put, head, del } from '@vercel/blob';
const ADMIN_EMAILS = ['perinabrycen9@gmail.com'];
const KEY = 'activity.json';

export async function loadActivity() {
  try {
    const info = await head(KEY).catch(() => null);
    if (!info) return [];
    const buster = info.uploadedAt ? new Date(info.uploadedAt).getTime() : Date.now();
    const r = await fetch(info.url + '?v=' + buster, { cache: 'no-store' });
    if (!r.ok) return [];
    return await r.json();
  } catch (e) { return []; }
}
export async function saveActivity(arr) {
  await put(KEY, JSON.stringify(arr), {
    access: 'public', contentType: 'application/json',
    allowOverwrite: true, addRandomSuffix: false, cacheControlMaxAge: 0,
  });
}
export async function logActivity(entry) {
  try {
    const all = await loadActivity();
    all.unshift({ id: 'a_' + Math.random().toString(36).slice(2, 10), at: new Date().toISOString(), ...entry });
    while (all.length > 500) all.pop();
    await saveActivity(all);
  } catch (e) {}
}

function isAdmin(e){ return e && ADMIN_EMAILS.includes(String(e).toLowerCase()) }

// Visitor-loggable event types (no admin required, rate-limited by user honor)
const CLIENT_TYPES = new Set(['print_at_home', 'print_order_ship', 'print_order_pickup']);

export default async function handler(req, res) {
  res.setHeader('Cache-Control','no-store');
  if (req.method === 'POST') {
    const { type, by, name, image } = req.body || {};
    if (!type || !CLIENT_TYPES.has(type)) return res.status(400).json({ error: 'invalid type' });
    await logActivity({ type, by: by || 'anonymous', name: name || '', image: image || '' });
    return res.status(200).json({ ok: true });
  }
  if (req.method === 'GET') {
    const adminEmail = req.headers['x-admin-email'];
    if (!isAdmin(adminEmail)) return res.status(403).json({ error: 'admin only' });
    return res.status(200).json({ events: await loadActivity() });
  }
  if (req.method === 'DELETE') {
    const adminEmail = req.headers['x-admin-email'];
    if (!isAdmin(adminEmail)) return res.status(403).json({ error: 'admin only' });
    const { id, all } = req.body || {};
    if (all || !id) { await del(KEY).catch(()=>{}); return res.status(200).json({ ok: true, cleared: 'all' }); }
    let events = await loadActivity();
    events = events.filter(e => e.id !== id);
    await saveActivity(events);
    return res.status(200).json({ ok: true });
  }
  return res.status(405).json({ error: 'method not allowed' });
}
