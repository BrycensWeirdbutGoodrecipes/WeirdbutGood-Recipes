// Visitor → Owner (Brycen) message relay via Discord DM + saves to inbox
import { put, head } from '@vercel/blob';
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

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const { from, message } = req.body || {};
  if (!message || !message.trim()) return res.status(400).json({ error: 'message required' });
  if (message.length > 1000) return res.status(400).json({ error: 'too long (max 1000 chars)' });

  const BRYCEN_DISCORD_ID = '1200864062549020715';
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) return res.status(500).json({ error: 'no bot token' });

  try {
    const dmRes = await fetch('https://discord.com/api/v10/users/@me/channels', {
      method: 'POST',
      headers: { 'Authorization': `Bot ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipient_id: BRYCEN_DISCORD_ID })
    });
    const dm = await dmRes.json();
    if (!dm.id) return res.status(500).json({ error: 'dm failed' });

    const who = from ? `**${from}**` : 'a visitor';
    const text = `💌 **New message from your recipes site!**\nFrom: ${who}\n\n> ${message.replace(/\n/g, '\n> ')}`;
    await fetch(`https://discord.com/api/v10/channels/${dm.id}/messages`, {
      method: 'POST',
      headers: { 'Authorization': `Bot ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: text })
    });

    // Save to inbox blob
    try {
      const inbox = await loadInbox();
      inbox.unshift({
        id: 'm_' + Math.random().toString(36).slice(2, 10),
        from: from || 'anonymous',
        message: message.slice(0, 1000),
        at: new Date().toISOString(),
        read: false,
      });
      while (inbox.length > 200) inbox.pop();
      await saveInbox(inbox);
    } catch (e) { /* discord already sent, ignore */ }

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
}
