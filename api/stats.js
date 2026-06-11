// Public-facing site stats — counts only, no PII
import { head } from '@vercel/blob';

async function safeCount(key) {
  try {
    const info = await head(key).catch(() => null);
    if (!info) return 0;
    const buster = info.uploadedAt ? new Date(info.uploadedAt).getTime() : Date.now();
    const r = await fetch(info.url + '?v=' + buster, { cache: 'no-store' });
    if (!r.ok) return 0;
    const j = await r.json();
    return Array.isArray(j) ? j.length : 0;
  } catch (e) { return 0; }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control','no-store');
  try {
    async function loadJson(key){
      try {
        const info = await head(key).catch(() => null);
        if (!info) return [];
        const r = await fetch(info.url + '?v=' + Date.now(), { cache: 'no-store' });
        if (!r.ok) return [];
        return await r.json();
      } catch (e) { return []; }
    }
    const [usersArr, events, recipesArr, donations] = await Promise.all([
      loadJson('users.json'),
      (async () => {
        try {
          const info = await head('activity.json').catch(() => null);
          if (!info) return [];
          const r = await fetch(info.url + '?v=' + Date.now(), { cache: 'no-store' });
          if (!r.ok) return [];
          return await r.json();
        } catch (e) { return []; }
      })(),
      loadJson('recipes.json'),
      (async () => {
        try {
          const info = await head('donations.json').catch(() => null);
          if (!info) return [];
          const r = await fetch(info.url + '?v=' + Date.now(), { cache: 'no-store' });
          if (!r.ok) return [];
          return await r.json();
        } catch (e) { return []; }
      })(),
    ]);
    const users = Array.isArray(usersArr) ? usersArr.length : 0;
    const customRecipes = Array.isArray(recipesArr) ? recipesArr.length : 0;
    const totalVisits = Array.isArray(usersArr)
      ? usersArr.reduce((s, u) => s + (Number(u.visits) || 1), 0)
      : 0;
    const prints = events.filter(e => ['print_at_home','print_order_ship','print_order_pickup'].includes(e.type)).length;
    const tipsTotal = donations.reduce((s, d) => s + (Number(d.amount) || 0), 0);
    return res.status(200).json({
      members: users,
      totalVisits,
      prints,
      customRecipes,
      totalActions: events.length,
      tipsTotal,
      tipsCount: donations.length,
    });
  } catch (err) {
    return res.status(200).json({ members: 0, prints: 0, customRecipes: 0, totalActions: 0 });
  }
}
