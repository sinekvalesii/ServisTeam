const router = require('../lib/router')();
const db = require('../db');
const geo = require('../lib/geo');
const { requireAuth } = require('../lib/auth');
const { limits } = require('../lib/security');

router.post('/favori/:id(\\d+)', requireAuth, limits.message, async (req, res) => {
  const id = req.params.id;
  const l = await db.one(`SELECT id FROM listings WHERE id=$1 AND status IN ('active','passive')`, [id]);
  if (!l) return res.status(404).json({ error: 'İlan bulunamadı.' });
  const del = await db.query('DELETE FROM favorites WHERE user_id=$1 AND listing_id=$2', [req.user.id, id]);
  let on = false;
  if (!del.rowCount) {
    await db.query('INSERT INTO favorites(user_id, listing_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [req.user.id, id]);
    on = true;
  }
  await db.query('UPDATE listings SET fav_count=(SELECT count(*) FROM favorites WHERE listing_id=$1) WHERE id=$1', [id]);
  res.json({ on });
});

router.get('/ilceler/:il', (req, res) => {
  const c = geo.byCode[req.params.il];
  res.set('Cache-Control', 'public, max-age=86400');
  res.json(c ? c.districts : []);
});

router.get('/il-merkezleri', (req, res) => {
  res.set('Cache-Control', 'public, max-age=604800');
  res.json(geo.iller.map((c) => [c.code, c.lat, c.lng]));
});

module.exports = router;
