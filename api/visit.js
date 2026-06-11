// Pings Brycen on Discord when someone visits the site
const recent = new Map(); // ip -> last ping ms (in-memory, resets on cold start)
const COOLDOWN_MS = 30 * 60 * 1000; // 30 min per IP

// Samsung model code -> friendly name (most common 2022-2026)
const SAMSUNG = {
  'SM-S928': 'Galaxy S24 Ultra', 'SM-S926': 'Galaxy S24+', 'SM-S921': 'Galaxy S24',
  'SM-S918': 'Galaxy S23 Ultra', 'SM-S916': 'Galaxy S23+', 'SM-S911': 'Galaxy S23',
  'SM-S908': 'Galaxy S22 Ultra', 'SM-S906': 'Galaxy S22+', 'SM-S901': 'Galaxy S22',
  'SM-G998': 'Galaxy S21 Ultra', 'SM-G996': 'Galaxy S21+', 'SM-G991': 'Galaxy S21',
  'SM-G988': 'Galaxy S20 Ultra', 'SM-G986': 'Galaxy S20+', 'SM-G981': 'Galaxy S20',
  'SM-A546': 'Galaxy A54', 'SM-A536': 'Galaxy A53', 'SM-A526': 'Galaxy A52', 'SM-A156': 'Galaxy A15',
  'SM-F946': 'Galaxy Z Fold5', 'SM-F731': 'Galaxy Z Flip5',
  'SM-F926': 'Galaxy Z Fold3', 'SM-F721': 'Galaxy Z Flip4',
  'SM-N986': 'Galaxy Note 20 Ultra', 'SM-N981': 'Galaxy Note 20',
  'SM-T870': 'Galaxy Tab S7', 'SM-X910': 'Galaxy Tab S9 Ultra',
};

function parseDevice(ua) {
  if (!ua) return { icon: '❓', name: 'Unknown device', os: '?', browser: '?' };

  // iPhone
  let m = ua.match(/iPhone OS (\d+_\d+)/);
  if (m || /iPhone/.test(ua)) {
    // Try to detect iPhone model (UA only gives this in newer Safari with hint)
    return { icon: '📱', name: 'iPhone', os: `iOS ${(m?.[1]||'?').replace('_','.')}`, browser: browserName(ua) };
  }
  // iPad
  if (/iPad/.test(ua)) {
    m = ua.match(/OS (\d+_\d+)/);
    return { icon: '📱', name: 'iPad', os: `iPadOS ${(m?.[1]||'?').replace('_','.')}`, browser: browserName(ua) };
  }
  // Samsung
  m = ua.match(/(SM-[A-Z0-9]+)/);
  if (m) {
    const code = m[1];
    const friendly = SAMSUNG[code.slice(0,7)] || SAMSUNG[code.slice(0,8)] || ('Samsung ' + code);
    const av = ua.match(/Android (\d+)/);
    return { icon: '📱', name: friendly, os: `Android ${av?.[1]||'?'}`, browser: browserName(ua) };
  }
  // Pixel
  m = ua.match(/Pixel (\d+\w*)/);
  if (m) {
    const av = ua.match(/Android (\d+)/);
    return { icon: '📱', name: `Google Pixel ${m[1]}`, os: `Android ${av?.[1]||'?'}`, browser: browserName(ua) };
  }
  // OnePlus
  m = ua.match(/OnePlus\s*([A-Z0-9]+)/i);
  if (m) {
    const av = ua.match(/Android (\d+)/);
    return { icon: '📱', name: `OnePlus ${m[1]}`, os: `Android ${av?.[1]||'?'}`, browser: browserName(ua) };
  }
  // Generic Android
  if (/Android/.test(ua)) {
    const av = ua.match(/Android (\d+)/);
    const model = ua.match(/;\s*([^;)]+?)\s+Build/);
    return { icon: '📱', name: model?.[1]?.trim() || 'Android phone', os: `Android ${av?.[1]||'?'}`, browser: browserName(ua) };
  }
  // Mac
  if (/Macintosh/.test(ua)) {
    m = ua.match(/Mac OS X (\d+[._]\d+)/);
    return { icon: '💻', name: 'Mac', os: `macOS ${(m?.[1]||'?').replace('_','.')}`, browser: browserName(ua) };
  }
  // Windows
  if (/Windows NT/.test(ua)) {
    const wv = ua.match(/Windows NT ([\d.]+)/);
    const winName = { '10.0':'10/11', '6.3':'8.1', '6.2':'8', '6.1':'7' }[wv?.[1]] || wv?.[1] || '?';
    return { icon: '💻', name: 'Windows PC', os: `Windows ${winName}`, browser: browserName(ua) };
  }
  // Linux
  if (/Linux/.test(ua)) return { icon: '💻', name: 'Linux PC', os: 'Linux', browser: browserName(ua) };

  return { icon: '❓', name: 'Unknown device', os: '?', browser: browserName(ua) };
}

function browserName(ua) {
  if (/Edg\//.test(ua)) return 'Edge';
  if (/OPR\//.test(ua)) return 'Opera';
  if (/SamsungBrowser/.test(ua)) return 'Samsung Internet';
  if (/Chrome\//.test(ua)) return 'Chrome';
  if (/Firefox\//.test(ua)) return 'Firefox';
  if (/Safari\//.test(ua)) return 'Safari';
  return 'Browser';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const { user, page } = req.body || {};
  // Skip pings from Brycen himself
  if (user && user.toLowerCase() === 'perinabrycen9@gmail.com') return res.status(200).json({ ok: true, skipped: 'admin' });

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  const ua = req.headers['user-agent'] || 'unknown';
  // Skip obvious bots
  if (/bot|crawl|spider|preview|fetch/i.test(ua)) return res.status(200).json({ ok: true, skipped: 'bot' });

  const last = recent.get(ip) || 0;
  const now = Date.now();
  if (now - last < COOLDOWN_MS) return res.status(200).json({ ok: true, skipped: 'cooldown' });
  recent.set(ip, now);

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

    const who = user ? `**${user}**` : 'someone';
    const device = parseDevice(ua);
    const msg = `👀 ${who} is on your recipes site!\n${device.icon} **${device.name}**\n${device.os} • ${device.browser}\nIP: ${ip}`;
    await fetch(`https://discord.com/api/v10/channels/${dm.id}/messages`, {
      method: 'POST',
      headers: { 'Authorization': `Bot ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: msg })
    });
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
}
