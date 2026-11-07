const router = require('../lib/router')();
const db = require('../db');
const settings = require('../lib/settings');
const { requireOnboarded } = require('../lib/auth');
const { limits, traffic } = require('../lib/security');

router.use(requireOnboarded);
router.use((req, res, next) => { res.locals.nav = 'msg'; next(); });

const IBAN_RE = /TR\s?\d{2}(\s?\d{4}){5}\s?\d{2}/i;
async function isSuspicious(body) {
  const words = (await settings.get('banned_words')) || [];
  const t = body.toLocaleLowerCase('tr');
  return IBAN_RE.test(body) || words.some((w) => w && t.includes(String(w).toLocaleLowerCase('tr')));
}

async function getConv(req) {
  const c = await db.one(`SELECT c.*, l.status AS listing_status, l.user_id AS listing_owner
    FROM conversations c LEFT JOIN listings l ON l.id=c.listing_id
    WHERE c.id=$1 AND (c.owner_id=$2 OR c.other_id=$2)`, [req.params.id, req.user.id]);
  if (c) c.me = c.owner_id === req.user.id ? 'owner' : 'other';
  return c;
}
async function blockedBetween(a, b) {
  return !!(await db.one('SELECT 1 FROM blocks WHERE (blocker_id=$1 AND blocked_id=$2) OR (blocker_id=$2 AND blocked_id=$1)', [a, b]));
}

async function addMessage(req, conv, text) {
  const body = String(text || '').trim().slice(0, 2000);
  if (!body) return { error: 'Boş mesaj gönderilemez.' };
  const otherId = conv.me === 'owner' ? conv.other_id : conv.owner_id;
  if (await blockedBetween(req.user.id, otherId)) return { error: 'Bu kişiyle mesajlaşma engellendi.' };
  const flagged = await isSuspicious(body);
  const m = await db.one('INSERT INTO messages(conversation_id, sender_id, body, flagged) VALUES ($1,$2,$3,$4) RETURNING id, sender_id, body, flagged, created_at',
    [conv.id, req.user.id, body, flagged]);
  const unreadCol = conv.me === 'owner' ? 'other_unread' : 'owner_unread';
  await db.query(`UPDATE conversations SET ${unreadCol}=${unreadCol}+1, last_message_at=now(), owner_hidden=false, other_hidden=false WHERE id=$1`, [conv.id]);
  await traffic(req, 'message_send', m.id);
  return { message: m };
}

// ---------- Gelen kutusu ----------
router.get('/', async (req, res) => {
  const uid = req.user.id;
  const rows = await db.many(`SELECT c.id, c.listing_id, c.listing_title, c.last_message_at,
      CASE WHEN c.owner_id=$1 THEN c.owner_unread ELSE c.other_unread END AS unread,
      u.display_name AS other_name, (c.owner_id=$1) AS i_am_owner,
      (SELECT body FROM messages m WHERE m.conversation_id=c.id ORDER BY m.id DESC LIMIT 1) AS last_body
    FROM conversations c JOIN users u ON u.id = CASE WHEN c.owner_id=$1 THEN c.other_id ELSE c.owner_id END
    WHERE (c.owner_id=$1 AND NOT c.owner_hidden) OR (c.other_id=$1 AND NOT c.other_hidden)
    ORDER BY c.last_message_at DESC LIMIT 200`, [uid]);
  res.render('messages/inbox', { title: 'Mesajlar', rows, noindex: true });
});

// ---------- İlandan yeni konuşma başlat ----------
router.post('/baslat', limits.message, async (req, res) => {
  const l = await db.one(`SELECT id, user_id, title, status FROM listings WHERE id=$1`, [req.body.listing_id]);
  if (!l || l.status !== 'active') { req.flash('err', 'Bu ilan artık yayında değil.'); return res.redirect('/ilanlar'); }
  if (l.user_id === req.user.id) return res.redirect(`/ilan/${l.id}`);
  if (await blockedBetween(req.user.id, l.user_id)) { req.flash('err', 'Bu kullanıcıyla mesajlaşamazsınız.'); return res.redirect(`/ilan/${l.id}`); }
  const conv = await db.one(`INSERT INTO conversations(listing_id, listing_title, owner_id, other_id) VALUES ($1,$2,$3,$4)
    ON CONFLICT (listing_id, other_id) DO UPDATE SET listing_title=EXCLUDED.listing_title RETURNING *`,
  [l.id, l.title, l.user_id, req.user.id]);
  conv.me = 'other';
  const r = await addMessage(req, conv, req.body.body);
  if (r.error) req.flash('err', r.error);
  res.redirect(`/mesajlar/${conv.id}`);
});

// ---------- Konuşma ----------
router.get('/:id(\\d+)', async (req, res, next) => {
  const c = await getConv(req); if (!c) return next();
  const otherId = c.me === 'owner' ? c.other_id : c.owner_id;
  const other = await db.one('SELECT id, display_name, status FROM users WHERE id=$1', [otherId]);
  const messages = await db.many('SELECT id, sender_id, body, flagged, created_at FROM messages WHERE conversation_id=$1 ORDER BY id DESC LIMIT 300', [c.id]);
  messages.reverse();
  await db.query(`UPDATE conversations SET ${c.me}_unread=0 WHERE id=$1`, [c.id]);
  res.locals.unread = Math.max(0, (res.locals.unread || 0) - (c.me === 'owner' ? c.owner_unread : c.other_unread));
  const iBlocked = !!(await db.one('SELECT 1 FROM blocks WHERE blocker_id=$1 AND blocked_id=$2', [req.user.id, otherId]));
  const blocked = iBlocked || await blockedBetween(req.user.id, otherId);
  res.render('messages/chat', { title: `Mesaj: ${other.display_name}`, c, other, messages, blocked, iBlocked, noindex: true });
});

// Form ile gönderim (JS yoksa) ve fetch ile gönderim (JS varsa)
router.post('/:id(\\d+)', limits.message, async (req, res, next) => {
  const c = await getConv(req); if (!c) return next();
  const r = await addMessage(req, c, req.body.body);
  if (req.get('accept')?.includes('application/json')) {
    if (r.error) return res.status(400).json({ error: r.error });
    return res.json({ message: r.message });
  }
  if (r.error) req.flash('err', r.error);
  res.redirect(`/mesajlar/${c.id}`);
});

// Yeni mesajları çek (5 sn'de bir)
router.get('/:id(\\d+)/yeni', async (req, res) => {
  const c = await getConv(req); if (!c) return res.status(404).json({ error: 'Bulunamadı' });
  const after = parseInt(req.query.after, 10) || 0;
  const messages = await db.many('SELECT id, sender_id, body, flagged, created_at FROM messages WHERE conversation_id=$1 AND id>$2 ORDER BY id LIMIT 100', [c.id, after]);
  if (messages.length) await db.query(`UPDATE conversations SET ${c.me}_unread=0 WHERE id=$1`, [c.id]);
  res.json({ messages });
});

router.post('/:id(\\d+)/engelle', async (req, res, next) => {
  const c = await getConv(req); if (!c) return next();
  const otherId = c.me === 'owner' ? c.other_id : c.owner_id;
  if (req.body.action === 'kaldir') {
    await db.query('DELETE FROM blocks WHERE blocker_id=$1 AND blocked_id=$2', [req.user.id, otherId]);
    req.flash('ok', 'Engel kaldırıldı.');
  } else {
    await db.query('INSERT INTO blocks(blocker_id, blocked_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [req.user.id, otherId]);
    req.flash('ok', 'Kişi engellendi. Artık size mesaj gönderemez.');
  }
  res.redirect(`/mesajlar/${c.id}`);
});

router.post('/:id(\\d+)/sil', async (req, res, next) => {
  const c = await getConv(req); if (!c) return next();
  await db.query(`UPDATE conversations SET ${c.me}_hidden=true, ${c.me}_unread=0 WHERE id=$1`, [c.id]);
  req.flash('ok', 'Konuşma gelen kutunuzdan kaldırıldı.');
  res.redirect('/mesajlar');
});

module.exports = router;
