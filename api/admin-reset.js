// Admin-only: nuke the messages blob entirely
import { del } from '@vercel/blob';
const ADMIN_EMAILS = ['perinabrycen9@gmail.com'];

export default async function handler(req, res) {
  const email = (req.headers['x-admin-email'] || '').toLowerCase();
  if (!ADMIN_EMAILS.includes(email)) return res.status(403).json({ error: 'admin only' });
  try {
    await del('messages.json').catch(() => {});
    await del('inbox.json').catch(() => {});
    return res.status(200).json({ ok: true, deleted: ['messages.json', 'inbox.json'] });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}
