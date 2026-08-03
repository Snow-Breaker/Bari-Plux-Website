/**
 * Announce Pro grants to Discord (sales + accurate details).
 * Prefers bot token + channel ID; falls back to webhook URL.
 */

const DEFAULT_CHANNEL = '1531890005176225894';
const PRO_PAGE = 'https://login.bariplux.com/Pro';

function roleTree(uid) {
  return uid.startsWith('discord_') ? 'discordUsers' : 'users';
}

function fmtDate(ms) {
  try {
    return new Date(ms).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
  } catch {
    return String(ms);
  }
}

function daysFromMs(ms) {
  const d = Math.round(Number(ms) / (24 * 60 * 60 * 1000));
  return Number.isFinite(d) && d > 0 ? d : 60;
}

export async function announceProGranted(env, deps, info = {}) {
  const {
    uid,
    expiresAtMs,
    durationMs,
    source = 'stripe',
    email = null,
    amountTotal = null,
    currency = null,
    sessionId = null
  } = info;

  if (!uid) return { ok: false, reason: 'no_uid' };

  let name = 'Member';
  let photo = null;
  let loginMethod = null;
  try {
    const tree = roleTree(uid);
    const [n, p, m, em] = await Promise.all([
      deps.adminGet(`${tree}/${uid}/name`),
      deps.adminGet(`${tree}/${uid}/photoURL`),
      deps.adminGet(`${tree}/${uid}/loginMethod`),
      deps.adminGet(`${tree}/${uid}/email`)
    ]);
    if (typeof n === 'string' && n.trim()) name = n.trim().slice(0, 64);
    if (typeof p === 'string' && p.startsWith('http')) photo = p;
    if (typeof m === 'string') loginMethod = m;
    if (!email && typeof em === 'string') info.email = em;
  } catch (err) {
    console.warn('[ProAnnounce] profile fetch failed', err);
  }

  const days = daysFromMs(durationMs);
  const expLabel = expiresAtMs ? fmtDate(expiresAtMs) : '—';
  const sourceLabel =
    source === 'stripe'
      ? 'Stripe purchase'
      : source === 'payhip' || source === 'payhip_license'
        ? 'Payhip purchase'
        : source === 'admin'
          ? 'Admin grant'
          : String(source);

  const amountLabel =
    amountTotal != null && Number.isFinite(Number(amountTotal))
      ? `${(Number(amountTotal) / 100).toFixed(2)} ${(currency || 'usd').toUpperCase()}`
      : null;

  const displayEmail = (info.email || email || '—').toString().slice(0, 80);
  const maskEmail =
    displayEmail.includes('@') && displayEmail.length > 6
      ? displayEmail.replace(/(.{2}).+(@.+)/, '$1***$2')
      : displayEmail;

  const lines = [
    `**${name}** just unlocked **Bari Plux Pro**`,
    '',
    `• **Plan:** ${days} days`,
    `• **Active until:** ${expLabel}`,
    `• **Source:** ${sourceLabel}`,
    `• **Account:** \`${uid.slice(0, 12)}…\``,
    `• **Email:** ${maskEmail}`
  ];
  if (loginMethod) lines.push(`• **Login:** ${loginMethod}`);
  if (amountLabel) lines.push(`• **Paid:** ${amountLabel}`);
  if (sessionId) lines.push(`• **Order:** \`${String(sessionId).slice(0, 18)}…\``);
  lines.push('', `Get Pro → ${PRO_PAGE}`);

  const embed = {
    title: '⭐ New Pro Member',
    description: lines.join('\n'),
    color: 0x63b3ed,
    timestamp: new Date().toISOString(),
    footer: { text: 'Bari Plux Tool · Pro' },
    fields: [
      { name: 'Days', value: String(days), inline: true },
      { name: 'Expires', value: expLabel, inline: true },
      { name: 'Source', value: sourceLabel, inline: true }
    ]
  };
  if (photo) embed.thumbnail = { url: photo };

  const payload = {
    content: null,
    embeds: [embed],
    allowed_mentions: { parse: [] }
  };

  const webhook = (env.DISCORD_PRO_WEBHOOK_URL || '').trim();
  if (webhook) {
    const res = await fetch(webhook + (webhook.includes('?') ? '&' : '?') + 'wait=true', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      console.error('[ProAnnounce] webhook failed', res.status, await res.text());
      return { ok: false, reason: 'webhook', status: res.status };
    }
    return { ok: true, via: 'webhook' };
  }

  const bot = (env.DISCORD_BOT_TOKEN || '').trim();
  const channelId = (env.DISCORD_PRO_ANNOUNCE_CHANNEL_ID || DEFAULT_CHANNEL).trim();
  if (!bot) {
    console.warn('[ProAnnounce] no DISCORD_BOT_TOKEN or DISCORD_PRO_WEBHOOK_URL — skipped');
    return { ok: false, reason: 'not_configured' };
  }

  const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bot ${bot}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    console.error('[ProAnnounce] bot post failed', res.status, await res.text());
    return { ok: false, reason: 'bot', status: res.status };
  }
  return { ok: true, via: 'bot' };
}
