// Admin-only inbox read/clear
import { put, head } from '@vercel/blob';
const ADMIN_EMAILS = ['perinabrycen9@gmail.com'];
const INBOX_KEY = 'inbox.json';

async function loadInbox() {
  try {
    const info = await head(INBOX_KEY).catch(() => null);
    if (!info) return [];
    const r = await fetch(info.url, { cache: 'no-store' });
    if (!r.ok) return [];
    return await r.json();
  } catch (e) { return []; }
}
async function saveInbox(arr) {
  await put(INBOX_KEY, JSON.stringify(arr), {
    access: 'public', contentType: 'application/json',
    allowOverwrite: true, addRandomSuffix: false,
  });
}
function isAdmin(e){ return e && ADMIN_EMAILS.includes(String(e).toLowerCase()) }

export default async function handler(req, res) {
  res.setHeader('Cache-Control','no-store');
  const adminEmail = req.headers['x-admin-email'];
  if (!isAdmin(adminEmail)) return res.status(403).json({ error: 'admin only' });

  if (req.method === 'GET') {
    const messages = await loadInbox();
    return res.status(200).json({ messages });
  }
  if (req.method === 'DELETE') {
    const { id, all } = req.body || {};
    if (all) { await saveInbox([]); return res.status(200).json({ ok: true }); }
    if (!id) return res.status(400).json({ error: 'id required' });
    let inbox = await loadInbox();
    inbox = inbox.filter(m => m.id !== id);
    await saveInbox(inbox);
    return res.status(200).json({ ok: true });
  }
  if (req.method === 'POST') {
    // Mark read
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id required' });
    const inbox = await loadInbox();
    const m = inbox.find(x => x.id === id);
    if (m) { m.read = true; await saveInbox(inbox); }
    return res.status(200).json({ ok: true });
  }
  return res.status(405).json({ error: 'method not allowed' });
}
