// Two-way messaging: any signed-in user can message Brycen or Dad, and they can reply back.
import { put, head } from '@vercel/blob';

const ADMIN_EMAILS = ['perinabrycen9@gmail.com'];
const HELPER_EMAILS = ['3dmikep@gmail.com'];
const CONTACTS = ['perinabrycen9@gmail.com', '3dmikep@gmail.com']; // who can be messaged
const MESSAGES_KEY = 'messages.json';
const BRYCEN_DISCORD_ID = '1200856129362739320'.replace('1200856129362739320','1200864062549020715'); // Brycen DM target

async function loadMessages() {
  try {
    const info = await head(MESSAGES_KEY).catch(() => null);
    if (!info) return [];
    // Use uploadedAt (changes every write) as cache buster
    const buster = info.uploadedAt ? new Date(info.uploadedAt).getTime() : Date.now();
    const r = await fetch(info.url + '?v=' + buster, { cache: 'no-store', headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' } });
    if (!r.ok) return [];
    return await r.json();
  } catch (e) { return []; }
}
async function saveMessages(arr) {
  await put(MESSAGES_KEY, JSON.stringify(arr), {
    access: 'public', contentType: 'application/json',
    allowOverwrite: true, addRandomSuffix: false,
    cacheControlMaxAge: 0,
  });
}

async function pingDiscord(token, userId, content) {
  try {
    const dmRes = await fetch('https://discord.com/api/v10/users/@me/channels', {
      method: 'POST',
      headers: { 'Authorization': `Bot ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipient_id: userId })
    });
    const dm = await dmRes.json();
    if (!dm.id) return;
    await fetch(`https://discord.com/api/v10/channels/${dm.id}/messages`, {
      method: 'POST',
      headers: { 'Authorization': `Bot ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content })
    });
  } catch (e) {}
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const userEmail = (req.headers['x-user-email'] || '').toLowerCase();
  const userName = req.headers['x-user-name'] || userEmail.split('@')[0] || 'anonymous';

  if (req.method === 'GET') {
    if (!userEmail) return res.status(403).json({ error: 'sign in required' });
    const all = await loadMessages();
    // return only messages involving this user
    const mine = all.filter(m => m.from === userEmail || m.to === userEmail);
    return res.status(200).json({ messages: mine, contacts: CONTACTS.filter(c => c !== userEmail) });
  }

  if (req.method === 'POST') {
    if (!userEmail) return res.status(403).json({ error: 'sign in required' });
    const { to, message } = req.body || {};
    if (!to || !message || !message.trim()) return res.status(400).json({ error: 'to + message required' });
    if (message.length > 1000) return res.status(400).json({ error: 'too long' });
    // Anyone signed in can message anyone (basic safety: must be a real email)
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
      return res.status(400).json({ error: 'invalid email' });
    }

    const all = await loadMessages();
    const msg = {
      id: 'm_' + Math.random().toString(36).slice(2, 10),
      from: userEmail,
      fromName: userName,
      to: to.toLowerCase(),
      message: message.slice(0, 1000),
      at: new Date().toISOString(),
      read: false,
    };
    all.unshift(msg);
    while (all.length > 1000) all.pop();
    await saveMessages(all);

    // Discord ping if Brycen is recipient
    const token = process.env.DISCORD_BOT_TOKEN;
    if (token && msg.to === 'perinabrycen9@gmail.com') {
      await pingDiscord(token, '1200864062549020715',
        `💬 **New message from ${msg.fromName}** (\`${msg.from}\`)\n\n> ${msg.message.replace(/\n/g, '\n> ')}\n\nReply in your profile inbox on the site.`);
    }
    return res.status(200).json({ ok: true, message: msg });
  }

  if (req.method === 'DELETE') {
    if (!userEmail) return res.status(403).json({ error: 'sign in required' });
    const { id, all: clearAll, with: withUser } = req.body || {};
    let all = await loadMessages();
    if (clearAll) {
      // wipe own messages only
      all = all.filter(m => m.from !== userEmail && m.to !== userEmail);
    } else if (withUser) {
      // wipe convo with a specific user
      const w = withUser.toLowerCase();
      all = all.filter(m => !((m.from === userEmail && m.to === w) || (m.from === w && m.to === userEmail)));
    } else if (id) {
      // delete one msg, only if user is involved
      all = all.filter(m => !(m.id === id && (m.from === userEmail || m.to === userEmail)));
    } else {
      return res.status(400).json({ error: 'id, with, or all required' });
    }
    await saveMessages(all);
    return res.status(200).json({ ok: true });
  }

  if (req.method === 'PATCH') {
    // Mark messages from a user as read
    if (!userEmail) return res.status(403).json({ error: 'sign in required' });
    const { with: withUser } = req.body || {};
    if (!withUser) return res.status(400).json({ error: 'with required' });
    const w = withUser.toLowerCase();
    const all = await loadMessages();
    let changed = false;
    for (const m of all) {
      if (m.to === userEmail && m.from === w && !m.read) { m.read = true; changed = true; }
    }
    if (changed) await saveMessages(all);
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'method not allowed' });
}
