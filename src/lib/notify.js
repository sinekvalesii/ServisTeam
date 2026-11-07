// SMS ve e-posta gönderimi. Sağlayıcı ayarlanmamışsa geliştirme modunda konsola yazar.
const nodemailer = require('nodemailer');
const config = require('../config');

let transporter = null;
if (config.mail.host) {
  transporter = nodemailer.createTransport({
    host: config.mail.host, port: config.mail.port, secure: config.mail.port === 465,
    auth: config.mail.user ? { user: config.mail.user, pass: config.mail.pass } : undefined,
  });
}

async function sendSms(phoneE164, text) {
  if (config.sms.provider === 'netgsm') {
    const { usercode, password, header } = config.sms.netgsm;
    // Netgsm OTP REST v2 (yalnızca doğrulama kodu; ticari ileti değildir, İYS kapsamı dışında)
    const res = await fetch('https://api.netgsm.com.tr/sms/rest/v2/otp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Basic ' + Buffer.from(`${usercode}:${password}`).toString('base64'),
      },
      body: JSON.stringify({ msgheader: header, msg: text, no: phoneE164.replace(/^\+90/, '') }),
      signal: AbortSignal.timeout(10000),
    });
    const body = await res.json().catch(() => ({}));
    if (body.code !== '00') throw new Error(`SMS gönderilemedi (Netgsm kodu: ${body.code || res.status})`);
    return;
  }
  if (config.isProd) throw new Error('SMS sağlayıcısı yapılandırılmadı');
  console.log(`[SMS → ${phoneE164}] ${text}`);
}

async function sendMail(to, subject, text) {
  if (transporter) {
    await transporter.sendMail({ from: config.mail.from, to, subject, text });
    return;
  }
  if (config.isProd) throw new Error('E-posta sunucusu yapılandırılmadı');
  console.log(`[E-POSTA → ${to}] ${subject}\n${text}`);
}

module.exports = { sendSms, sendMail };
