// Track everyone who's signed in. Admin reads the list.
import { put, head } from '@vercel/blob';
const ADMIN_EMAILS = ['perinabrycen9@gmail.com'];
const HELPER_EMAILS = ['3dmikep@gmail.com'];
const KEY = 'users.json';

async function loadUsers() {
  try {
    const info = await head(KEY).catch(() => null);
    if (!info) return [];
    const buster = info.uploadedAt ? new Date(info.uploadedAt).getTime() : Date.now();
    const r = await fetch(info.url + '?v=' + buster, { cache: 'no-store' });
    if (!r.ok) return [];
    return await r.json();
  } catch (e) { return []; }
}
async function saveUsers(arr) {
  await put(KEY, JSON.stringify(arr), {
    access: 'public', contentType: 'application/json',
    allowOverwrite: true, addRandomSuffix: false, cacheControlMaxAge: 0,
  });
}
function roleOf(e){
  const l = String(e||'').toLowerCase();
  if (ADMIN_EMAILS.includes(l)) return 'admin';
  if (HELPER_EMAILS.includes(l)) return 'helper';
  return 'visitor';
}
function isAdmin(e){ return e && ADMIN_EMAILS.includes(String(e).toLowerCase()) }

export default async function handler(req, res) {
  res.setHeader('Cache-Control','no-store');

  if (req.method === 'POST') {
    const { email, name } = req.body || {};
    if (!email) return res.status(400).json({ error: 'email required' });
    const e = String(email).toLowerCase();
    const users = await loadUsers();
    const existing = users.find(u => u.email === e);
    const now = new Date().toISOString();
    if (existing) {
      existing.name = name || existing.name;
      existing.lastSeen = now;
      existing.visits = (existing.visits || 1) + 1;
      existing.role = roleOf(e);
    } else {
      users.unshift({ email: e, name: name || e.split('@')[0], role: roleOf(e), firstSeen: now, lastSeen: now, visits: 1 });
    }
    while (users.length > 500) users.pop();
    await saveUsers(users);
    return res.status(200).json({ ok: true });
  }

  if (req.method === 'GET') {
    const adminEmail = req.headers['x-admin-email'];
    if (!isAdmin(adminEmail)) return res.status(403).json({ error: 'admin only' });
    const users = await loadUsers();
    users.sort((a,b) => new Date(b.lastSeen) - new Date(a.lastSeen));
    return res.status(200).json({ users });
  }

  if (req.method === 'DELETE') {
    const adminEmail = req.headers['x-admin-email'];
    if (!isAdmin(adminEmail)) return res.status(403).json({ error: 'admin only' });
    const { email, all } = req.body || {};
    let users = await loadUsers();
    if (all) users = [];
    else if (email) users = users.filter(u => u.email !== String(email).toLowerCase());
    else return res.status(400).json({ error: 'email or all required' });
    await saveUsers(users);
    return res.status(200).json({ ok: true });
  }
  return res.status(405).json({ error: 'method not allowed' });
}
