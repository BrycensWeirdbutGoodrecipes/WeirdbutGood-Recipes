// Vercel serverless function — notifies Brycen when dad asks for admin access
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const { email, event } = req.body || {};
  if (!email) return res.status(400).json({ error: 'email required' });

  const BRYCEN_DISCORD_ID = '1200864062549020715';
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) return res.status(500).json({ error: 'no bot token configured' });

  try {
    // Open DM channel with Brycen
    const dmRes = await fetch('https://discord.com/api/v10/users/@me/channels', {
      method: 'POST',
      headers: { 'Authorization': `Bot ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipient_id: BRYCEN_DISCORD_ID })
    });
    const dm = await dmRes.json();
    if (!dm.id) return res.status(500).json({ error: 'dm channel failed', detail: dm });

    // Send message
    const msg = event === 'signed-in'
      ? `👑 **Dad just signed in!**\n\`${email}\` is now using brycens-recipes.vercel.app as admin.`
      : `🔐 **Admin Access Request**\nSomeone signed in as \`${email}\` and wants admin access to brycens-recipes.vercel.app\n\nReply here with **YES** or **NO** to approve. (Kit will handle the rest!)`;
    const sendRes = await fetch(`https://discord.com/api/v10/channels/${dm.id}/messages`, {
      method: 'POST',
      headers: { 'Authorization': `Bot ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: msg })
    });
    const sent = await sendRes.json();
    return res.status(200).json({ ok: true, sent: !!sent.id });
  } catch (err) {
    return res.status(500).json({ error: 'request failed', detail: String(err) });
  }
}
