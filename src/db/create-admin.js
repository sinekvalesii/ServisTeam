// Kullanım: npm run create-admin -- eposta@ornek.com 05XXXXXXXXX "Ad Soyad"
// Şifre güvenli şekilde terminalden sorulur (geçmişe yazılmaz).
const readline = require('readline');
const bcrypt = require('bcryptjs');
const db = require('./index');
const { normalizeEmail, normalizePhone, passwordProblem } = require('../lib/auth');

function askHidden(q) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => { if (s.includes(q)) rl.output.write(s); else rl.output.write('*'); };
    rl.question(q, (a) => { rl.close(); process.stdout.write('\n'); resolve(a); });
  });
}

(async () => {
  const [emailRaw, phoneRaw, name] = process.argv.slice(2);
  const email = normalizeEmail(emailRaw); const phone = normalizePhone(phoneRaw);
  if (!email || !phone || !name) { console.error('Kullanım: npm run create-admin -- eposta 05XXXXXXXXX "Ad Soyad"'); process.exit(1); }
  const pw = process.env.ADMIN_PASSWORD || await askHidden('Admin şifresi: ');
  const prob = passwordProblem(pw); if (prob) { console.error(prob); process.exit(1); }
  const hash = await bcrypt.hash(pw, 12);
  await db.query(`INSERT INTO users(email, phone, password_hash, display_name, role, email_verified_at, onboarding_done, account_type, city_code,
                  consent_kvkk_at, consent_terms_at) VALUES ($1,$2,$3,$4,'admin', now(), true, 'servis_firmasi', '34', now(), now())
                  ON CONFLICT (email) DO UPDATE SET role='admin', password_hash=EXCLUDED.password_hash`, [email, phone, hash, name]);
  console.log(`Admin hazır: ${email}`);
  await db.pool.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
