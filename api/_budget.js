// Daily spending cap for AI endpoints — defaults to $1/day USD
import { put, head } from '@vercel/blob';

export const DAILY_BUDGET_USD = 1.00;

// Estimated cost per call (USD). Tune as Gemini pricing changes.
export const COST = {
  'generate-card': 0.04,      // Gemini 3 Pro Image (Nano Banana Pro)
  'photo-to-recipe': 0.01,    // Gemini Flash vision
  'describe-recipe': 0.005,   // Gemini Flash text
  'ask-kit': 0.005,           // Gemini Flash text
};

function todayKey() {
  // UTC date so cap resets at midnight UTC for everyone
  const d = new Date();
  return `usage-${d.toISOString().slice(0,10)}.json`;
}

async function loadUsage() {
  const KEY = todayKey();
  try {
    const info = await head(KEY).catch(() => null);
    if (!info) return { spent: 0, calls: {} };
    const buster = info.uploadedAt ? new Date(info.uploadedAt).getTime() : Date.now();
    const r = await fetch(info.url + '?v=' + buster, { cache: 'no-store' });
    if (!r.ok) return { spent: 0, calls: {} };
    return await r.json();
  } catch (e) { return { spent: 0, calls: {} }; }
}

async function saveUsage(data) {
  await put(todayKey(), JSON.stringify(data), {
    access: 'public', contentType: 'application/json',
    allowOverwrite: true, addRandomSuffix: false, cacheControlMaxAge: 0,
  });
}

// Call BEFORE making an expensive request. Returns {allowed, spent, remaining}.
// If not allowed, the API should return 429 with a friendly message.
export async function checkBudget(endpoint) {
  const usage = await loadUsage();
  const cost = COST[endpoint] || 0;
  if (usage.spent + cost > DAILY_BUDGET_USD) {
    return { allowed: false, spent: usage.spent, remaining: Math.max(0, DAILY_BUDGET_USD - usage.spent) };
  }
  return { allowed: true, spent: usage.spent, remaining: DAILY_BUDGET_USD - usage.spent };
}

// Call AFTER a successful expensive request to record the spend.
export async function recordSpend(endpoint) {
  const cost = COST[endpoint] || 0;
  const usage = await loadUsage();
  usage.spent = (usage.spent || 0) + cost;
  usage.calls = usage.calls || {};
  usage.calls[endpoint] = (usage.calls[endpoint] || 0) + 1;
  await saveUsage(usage);
}
