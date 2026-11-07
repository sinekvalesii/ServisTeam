require('dotenv').config({ quiet: true });
const crypto = require('crypto');

const env = process.env;
const isProd = env.NODE_ENV === 'production';

function required(name, devFallback) {
  const v = env[name];
  if (v) return v;
  if (isProd) {
    console.error(`[config] ${name} ortam değişkeni zorunlu (production).`);
    process.exit(1);
  }
  return devFallback;
}

const config = {
  isProd,
  port: parseInt(env.PORT || '3000', 10),
  baseUrl: (env.BASE_URL || 'http://localhost:3000').replace(/\/$/, ''),
  databaseUrl: required('DATABASE_URL', 'postgres://servisteam:devpass@localhost:5432/servisteam'),
  sessionSecret: required('SESSION_SECRET', 'dev-only-session-secret-change-me'),
  // 32 byte hex: belge doğrulama verilerini şifrelemek için
  dataKey: Buffer.from(required('DATA_ENCRYPTION_KEY', crypto.createHash('sha256').update('dev-only').digest('hex')), 'hex'),
  trustProxy: env.TRUST_PROXY || (isProd ? '1' : '0'),
  uploadDir: env.UPLOAD_DIR || require('path').join(__dirname, '..', 'storage'),

  sms: {
    provider: env.SMS_PROVIDER || 'console', // netgsm | console
    netgsm: { usercode: env.NETGSM_USERCODE, password: env.NETGSM_PASSWORD, header: env.NETGSM_HEADER },
  },
  mail: {
    host: env.SMTP_HOST, port: parseInt(env.SMTP_PORT || '587', 10),
    user: env.SMTP_USER, pass: env.SMTP_PASS, from: env.MAIL_FROM || 'Servis Team <no-reply@servisteam.com>',
  },
  fuel: {
    provider: env.FUEL_PROVIDER || 'api', // api | manual
    refreshCron: env.FUEL_CRON || '10 */2 * * *', // 2 saatte bir
  },
  // Doğrulama kanalı: e-posta (varsayılan). Telefon zorunlu alan; SMS doğrulaması ileride SMS_VERIFY=1 ile açılır.
  smsVerify: env.SMS_VERIFY === '1',
  adsenseClient: env.ADSENSE_CLIENT || '', // ca-pub-xxxxxxxx
  company: {
    title: env.COMPANY_TITLE || '[Şirket unvanı]',
    address: env.COMPANY_ADDRESS || '[Açık adres]',
    email: env.COMPANY_EMAIL || 'destek@servisteam.com',
    kep: env.COMPANY_KEP || '[KEP adresi]',
    mersis: env.COMPANY_MERSIS || '',
  },
};

if (config.dataKey.length !== 32) {
  console.error('[config] DATA_ENCRYPTION_KEY 64 karakterlik hex olmalı (openssl rand -hex 32).');
  process.exit(1);
}
if (isProd && config.sessionSecret.length < 32) {
  console.error('[config] SESSION_SECRET en az 32 karakter olmalı.');
  process.exit(1);
}

module.exports = config;
