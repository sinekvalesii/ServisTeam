const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const sharp = require('sharp');
const config = require('../config');
const { encrypt, decrypt } = require('./crypto');

const PUBLIC_DIR = path.join(config.uploadDir, 'public');
const PRIVATE_DIR = path.join(config.uploadDir, 'private');
for (const d of [PUBLIC_DIR, PRIVATE_DIR, path.join(PUBLIC_DIR, 'listings'), path.join(PUBLIC_DIR, 'ads')]) fs.mkdirSync(d, { recursive: true });

const memory = (maxFiles, maxMb) => multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxMb * 1024 * 1024, files: maxFiles, fields: 60 },
});

// Dosya imzası (magic bytes) kontrolü — uzantıya/MIME başlığına güvenilmez
function sniff(buf) {
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  if (buf.subarray(0, 4).toString() === '%PDF') return 'application/pdf';
  const ftyp = buf.subarray(4, 12).toString();
  if (ftyp.startsWith('ftypheic') || ftyp.startsWith('ftypheix') || ftyp.startsWith('ftypmif1')) return 'image/heic';
  return null;
}

// İlan fotoğrafı: yeniden kodlanır → EXIF/GPS dahil tüm metadata silinir
async function saveListingPhoto(file) {
  const type = sniff(file.buffer);
  if (!type || type === 'application/pdf') throw new Error('Yalnızca fotoğraf (JPG, PNG, WEBP) yükleyebilirsiniz.');
  const name = `${crypto.randomBytes(16).toString('hex')}.webp`;
  await sharp(file.buffer, { limitInputPixels: 40e6 }).rotate().resize(1280, 1280, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 78 }).toFile(path.join(PUBLIC_DIR, 'listings', name));
  return `/media/listings/${name}`;
}

async function saveAdImage(file) {
  const type = sniff(file.buffer);
  if (!type || type === 'application/pdf') throw new Error('Reklam görseli JPG/PNG/WEBP olmalı.');
  const name = `${crypto.randomBytes(16).toString('hex')}.webp`;
  await sharp(file.buffer).resize(1200, 600, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 })
    .toFile(path.join(PUBLIC_DIR, 'ads', name));
  return `/media/ads/${name}`;
}

function removePublic(urlPath) {
  if (!urlPath || !urlPath.startsWith('/media/')) return;
  const p = path.join(PUBLIC_DIR, path.normalize(urlPath.replace('/media/', '')).replace(/^(\.\.[/\\])+/, ''));
  if (p.startsWith(PUBLIC_DIR)) fs.rm(p, { force: true }, () => {});
}

// Doğrulama belgesi: şifreli, web kökünün dışında, inceleme sonrası silinir
async function saveVerificationFile(file) {
  const type = sniff(file.buffer);
  if (!type || type === 'image/heic') throw new Error('Belge JPG, PNG veya PDF olmalı.');
  let data = file.buffer;
  if (type !== 'application/pdf') data = await sharp(data).rotate().resize(2000, 2000, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
  const name = `${crypto.randomBytes(20).toString('hex')}.bin`;
  fs.writeFileSync(path.join(PRIVATE_DIR, name), encrypt(data), { mode: 0o600 });
  return { name, mime: type === 'application/pdf' ? 'application/pdf' : 'image/jpeg' };
}
function readVerificationFile(name) {
  if (!/^[a-f0-9]{40}\.bin$/.test(name)) throw new Error('geçersiz dosya');
  return decrypt(fs.readFileSync(path.join(PRIVATE_DIR, name)));
}
function deleteVerificationFile(name) {
  if (!name || !/^[a-f0-9]{40}\.bin$/.test(name)) return;
  const p = path.join(PRIVATE_DIR, name);
  try {
    // üzerine yazıp sil (basit güvenli silme)
    const size = fs.statSync(p).size;
    fs.writeFileSync(p, crypto.randomBytes(size));
    fs.rmSync(p, { force: true });
  } catch { /* zaten silinmiş */ }
}

module.exports = { memory, saveListingPhoto, saveAdImage, removePublic, saveVerificationFile, readVerificationFile, deleteVerificationFile, PUBLIC_DIR };
