const bcrypt = require('bcryptjs');
const db = require('../db');
const { randomCode } = require('./crypto');
const { sendSms, sendMail } = require('./notify');

const TTL_MIN = 5;
const MAX_ATTEMPTS = 5;
const RESEND_SEC = 60;

// destination: telefon (E.164) veya e-posta
async function issue(destination, purpose) {
  const last = await db.one(
    'SELECT created_at FROM otp_codes WHERE destination=$1 AND purpose=$2 ORDER BY created_at DESC LIMIT 1',
    [destination, purpose]);
  if (last && Date.now() - new Date(last.created_at).getTime() < RESEND_SEC * 1000) {
    return { ok: false, error: `Yeni kod için ${RESEND_SEC} saniye bekleyin.` };
  }
  const channel = destination.startsWith('+') ? 'sms' : 'email';
  const code = randomCode(6);
  await db.query('UPDATE otp_codes SET consumed_at=now() WHERE destination=$1 AND purpose=$2 AND consumed_at IS NULL', [destination, purpose]);
  await db.query(
    `INSERT INTO otp_codes(channel, destination, purpose, code_hash, expires_at) VALUES ($1,$2,$3,$4, now() + interval '${TTL_MIN} minutes')`,
    [channel, destination, purpose, bcrypt.hashSync(code, 8)]);
  const text = purpose === 'reset'
    ? `Servis Team sifre yenileme kodunuz: ${code}. Kodu kimseyle paylasmayin.`
    : `Servis Team dogrulama kodunuz: ${code}. Kodu kimseyle paylasmayin.`;
  try {
    if (channel === 'sms') await sendSms(destination, text);
    else await sendMail(destination, 'Servis Team doğrulama kodu', `${text}\n\nKod ${TTL_MIN} dakika geçerlidir. Bu isteği siz yapmadıysanız bu e-postayı dikkate almayın.`);
  } catch (e) {
    console.error('[otp]', e.message);
    return { ok: false, error: 'Kod gönderilemedi. Lütfen biraz sonra tekrar deneyin.' };
  }
  return { ok: true, channel };
}

async function verify(destination, purpose, code) {
  const row = await db.one(
    `SELECT * FROM otp_codes WHERE destination=$1 AND purpose=$2 AND consumed_at IS NULL AND expires_at > now()
     ORDER BY created_at DESC LIMIT 1`, [destination, purpose]);
  if (!row) return { ok: false, error: 'Kodun süresi doldu. Yeni kod isteyin.' };
  if (row.attempts >= MAX_ATTEMPTS) return { ok: false, error: 'Çok fazla hatalı deneme. Yeni kod isteyin.' };
  if (!/^\d{6}$/.test(code || '') || !bcrypt.compareSync(code, row.code_hash)) {
    await db.query('UPDATE otp_codes SET attempts=attempts+1 WHERE id=$1', [row.id]);
    return { ok: false, error: 'Kod hatalı. Lütfen tekrar kontrol edin.' };
  }
  await db.query('UPDATE otp_codes SET consumed_at=now() WHERE id=$1', [row.id]);
  return { ok: true };
}

module.exports = { issue, verify, TTL_MIN };
