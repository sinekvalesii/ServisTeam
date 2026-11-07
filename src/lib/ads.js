// Reklam alanları: Google AdSense (çerez onayı varsa) veya doğrudan satılan "ev reklamları" (bölge hedefli).
const db = require('../db');
const config = require('../config');
const settings = require('./settings');

const SLOTS = {
  home_top: 'Ana sayfa — üst',
  list_inline: 'İlan listesi — araya',
  detail_bottom: 'İlan detayı — alt',
  sidebar: 'Yan sütun (masaüstü)',
};

async function pick(slotKey, cityCode) {
  const slot = await db.one('SELECT * FROM ad_slots WHERE key=$1', [slotKey]);
  if (!slot || slot.mode === 'off') return null;
  if (slot.mode === 'house') {
    const ad = await db.one(
      `SELECT id, title, body, image_path, advertiser FROM house_ads
       WHERE slot_key=$1 AND active AND now() BETWEEN starts_at AND ends_at
         AND (cardinality(city_codes)=0 OR $2 = ANY(city_codes))
       ORDER BY random() LIMIT 1`, [slotKey, cityCode || '']);
    if (!ad) return { type: 'empty' };
    db.query('UPDATE house_ads SET impressions=impressions+1 WHERE id=$1', [ad.id]).catch(() => {});
    return { type: 'house', ad };
  }
  if (slot.mode === 'adsense' && config.adsenseClient && (await settings.get('adsense_enabled'))) {
    return { type: 'adsense', client: config.adsenseClient, slotId: slot.adsense_slot_id };
  }
  return null;
}

// Bir sayfanın ihtiyaç duyduğu tüm slotları tek seferde hazırla
async function forPage(keys, cityCode) {
  const out = {};
  for (const k of keys) out[k] = await pick(k, cityCode);
  return out;
}

module.exports = { SLOTS, pick, forPage };
