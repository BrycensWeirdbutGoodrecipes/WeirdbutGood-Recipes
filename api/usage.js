// Admin-only: see today's AI spend
import { head } from '@vercel/blob';
import { DAILY_BUDGET_USD, COST } from './_budget.js';
const ADMIN_EMAILS = ['perinabrycen9@gmail.com'];

export default async function handler(req, res) {
  res.setHeader('Cache-Control','no-store');
  const email = (req.headers['x-admin-email'] || '').toLowerCase();
  if (!ADMIN_EMAILS.includes(email)) return res.status(403).json({ error: 'admin only' });

  const KEY = `usage-${new Date().toISOString().slice(0,10)}.json`;
  let usage = { spent: 0, calls: {} };
  try {
    const info = await head(KEY).catch(()=>null);
    if (info) {
      const r = await fetch(info.url + '?v=' + Date.now(), { cache: 'no-store' });
      if (r.ok) usage = await r.json();
    }
  } catch (e) {}
  return res.status(200).json({
    today: KEY,
    budget: DAILY_BUDGET_USD,
    spent: usage.spent || 0,
    remaining: Math.max(0, DAILY_BUDGET_USD - (usage.spent || 0)),
    calls: usage.calls || {},
    costPerCall: COST,
  });
}
