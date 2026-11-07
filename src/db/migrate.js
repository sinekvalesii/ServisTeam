// Kullanım: npm run migrate  — şemayı kurar, varsayılan reklam alanları ve sayfaları ekler (mevcut sayfalar korunur)
const fs = require('fs');
const path = require('path');
const db = require('./index');
const { SLOTS } = require('../lib/ads');
const pages = require('./pages');

(async () => {
  await db.query(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
  for (const [key, label] of Object.entries(SLOTS)) {
    await db.query(`INSERT INTO ad_slots(key, label, mode) VALUES ($1,$2,'house') ON CONFLICT (key) DO UPDATE SET label=EXCLUDED.label`, [key, label]);
  }
  for (const p of pages) {
    await db.query('INSERT INTO pages(slug, title, body_html) VALUES ($1,$2,$3) ON CONFLICT (slug) DO NOTHING', [p.slug, p.title, p.body_html.trim()]);
  }
  console.log('Veritabanı hazır.');
  await db.pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
