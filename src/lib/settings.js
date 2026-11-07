const db = require('../db');

const DEFAULTS = {
  moderation: 'post',            // post: ilan hemen yayında, şikayetle incelenir | pre: admin onayı gerekir
  promo_prices: { vitrin_7: 149, vitrin_14: 249 },
  traffic_log_days: 730,         // 5651: 2 yıl
  message_retention_days: 730,
  maintenance: false,
  announcement: '',
  adsense_enabled: false,
  banned_words: ['kapora', 'ön ödeme', 'iban gönder'],
};

let cache = null; let cacheAt = 0;

async function all() {
  if (cache && Date.now() - cacheAt < 30000) return cache;
  const rows = await db.many('SELECT key, value FROM settings');
  cache = { ...DEFAULTS };
  for (const r of rows) cache[r.key] = r.value;
  cacheAt = Date.now();
  return cache;
}
async function get(key) { return (await all())[key]; }
async function set(key, value) {
  await db.query('INSERT INTO settings(key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value', [key, JSON.stringify(value)]);
  cache = null;
}

module.exports = { all, get, set, DEFAULTS };
