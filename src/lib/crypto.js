const crypto = require('crypto');
const config = require('../config');

// AES-256-GCM: yalnızca inceleme süresince tutulan doğrulama verileri için
function encrypt(buf) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', config.dataKey, iv);
  const enc = Buffer.concat([cipher.update(buf), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]);
}
function decrypt(buf) {
  const iv = buf.subarray(0, 12); const tag = buf.subarray(12, 28); const data = buf.subarray(28);
  const d = crypto.createDecipheriv('aes-256-gcm', config.dataKey, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(data), d.final()]);
}
const encryptText = (s) => encrypt(Buffer.from(s, 'utf8')).toString('base64');
const decryptText = (s) => decrypt(Buffer.from(s, 'base64')).toString('utf8');

function randomCode(len = 6) {
  let s = '';
  for (let i = 0; i < len; i++) s += crypto.randomInt(0, 10);
  return s;
}
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const timingSafeEq = (a, b) => {
  const A = Buffer.from(String(a)); const B = Buffer.from(String(b));
  return A.length === B.length && crypto.timingSafeEqual(A, B);
};

// T.C. Kimlik No algoritma kontrolü (biçim doğrulaması; kayıt tutulmaz)
function isValidTckn(t) {
  if (!/^[1-9][0-9]{10}$/.test(t)) return false;
  const d = t.split('').map(Number);
  const odd = d[0] + d[2] + d[4] + d[6] + d[8];
  const even = d[1] + d[3] + d[5] + d[7];
  if (((odd * 7 - even) % 10 + 10) % 10 !== d[9]) return false;
  return d.slice(0, 10).reduce((a, b) => a + b, 0) % 10 === d[10];
}

module.exports = { encrypt, decrypt, encryptText, decryptText, randomCode, sha256, timingSafeEq, isValidTckn };
