// Zamanlanmış işler: ilan süresi, belge imhası, yakıt yenileme, kayıt saklama süreleri
const cron = require('node-cron');
const db = require('./db');
const config = require('./config');
const fuel = require('./lib/fuel');
const settings = require('./lib/settings');
const uploads = require('./lib/uploads');

async function expireListings() {
  // 14 gün dolan ilanlar pasife düşer (öne çıkarma da biter)
  const r = await db.query(`UPDATE listings SET status='passive', featured_until=NULL, updated_at=now()
                            WHERE status='active' AND expires_at < now()`);
  if (r.rowCount) console.log(`[jobs] ${r.rowCount} ilan pasife alındı`);
}

async function purgeVerifications() {
  // İnceleme süresi (7 gün) dolan belgeler imha edilir
  const rows = await db.many(`SELECT id, file_path FROM verifications WHERE purged_at IS NULL AND purge_after < now()`);
  for (const v of rows) {
    uploads.deleteVerificationFile(v.file_path);
    await db.query(`UPDATE verifications SET secret_enc=NULL, file_path=NULL, purged_at=now(),
                    status = CASE WHEN status='pending' THEN 'expired' ELSE status END WHERE id=$1`, [v.id]);
  }
  if (rows.length) console.log(`[jobs] ${rows.length} belge kaydı imha edildi`);
  // Süresi geçen onaylı belgeler rozet vermez
  await db.query(`UPDATE verifications SET status='expired' WHERE status='approved' AND valid_until IS NOT NULL AND valid_until < current_date`);
}

async function retention() {
  const s = await settings.all();
  await db.query(`DELETE FROM traffic_log WHERE created_at < now() - ($1 || ' days')::interval`, [String(s.traffic_log_days || 730)]);
  await db.query(`DELETE FROM otp_codes WHERE created_at < now() - interval '2 days'`);
  // Doğrulanmamış ve 3 günden eski hesaplar silinir (veri minimizasyonu)
  await db.query(`DELETE FROM users WHERE email_verified_at IS NULL AND role='user' AND created_at < now() - interval '3 days'`);
  // Silinmiş ilanlar 30 gün sonra tamamen kaldırılır
  await db.query(`DELETE FROM listings WHERE status='deleted' AND updated_at < now() - interval '30 days'`);
  // Yakıt geçmişi 90 gün
  await db.query(`DELETE FROM fuel_prices WHERE fetched_at < now() - interval '90 days'`);
  await db.query(`DELETE FROM audit_log WHERE created_at < now() - interval '3 years'`);
}

const safe = (name, fn) => () => fn().catch((e) => console.error(`[jobs] ${name}:`, e.message));

function start() {
  cron.schedule('*/10 * * * *', safe('expire', expireListings), { timezone: 'Europe/Istanbul' });
  cron.schedule('17 * * * *', safe('purge', purgeVerifications), { timezone: 'Europe/Istanbul' });
  cron.schedule('40 3 * * *', safe('retention', retention), { timezone: 'Europe/Istanbul' });
  cron.schedule(config.fuel.refreshCron, safe('fuel', fuel.refresh), { timezone: 'Europe/Istanbul' });
  safe('expire', expireListings)();
  safe('fuel', fuel.refresh)();
  console.log('[jobs] zamanlanmış işler başladı');
}

module.exports = { start, expireListings, purgeVerifications, retention };
