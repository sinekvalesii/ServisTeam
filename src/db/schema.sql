-- Servis Team veritabanı şeması (PostgreSQL 14+)
-- İlke: Gereken en az veriyi tut (KVKK md. 4 - ölçülülük). Belge içerikleri kalıcı tutulmaz.

CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE IF NOT EXISTS users (
  id               BIGSERIAL PRIMARY KEY,
  email            CITEXT UNIQUE,
  phone            VARCHAR(16) UNIQUE,          -- E.164: +905xxxxxxxxx
  password_hash    TEXT NOT NULL,
  display_name     VARCHAR(80) NOT NULL,
  account_type     VARCHAR(24),                 -- sofor, arac_sahibi, servis_firmasi, kurum, yolcu_veli, rehber_personel
  lister_kind      VARCHAR(10) DEFAULT 'bireysel', -- bireysel | firma
  company_name     VARCHAR(120),
  city_code        CHAR(2),
  district         VARCHAR(60),
  about            VARCHAR(600),
  profile          JSONB NOT NULL DEFAULT '{}'::jsonb,  -- role'e özel alanlar (ehliyet sınıfı, deneyim, filo büyüklüğü...)
  onboarding_done  BOOLEAN NOT NULL DEFAULT FALSE,
  email_verified_at TIMESTAMPTZ,
  phone_verified_at TIMESTAMPTZ,
  role             VARCHAR(12) NOT NULL DEFAULT 'user',  -- user | moderator | admin
  status           VARCHAR(12) NOT NULL DEFAULT 'active', -- active | suspended | deleted
  suspend_reason   VARCHAR(300),
  consent_kvkk_at  TIMESTAMPTZ,                 -- aydınlatma metni okundu
  consent_terms_at TIMESTAMPTZ,
  consent_marketing_at TIMESTAMPTZ,             -- ticari ileti onayı (opsiyonel, İYS)
  failed_logins    INT NOT NULL DEFAULT 0,
  locked_until     TIMESTAMPTZ,
  last_login_at    TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at       TIMESTAMPTZ,
  CONSTRAINT users_contact_required CHECK (email IS NOT NULL OR phone IS NOT NULL OR status = 'deleted')
);

CREATE TABLE IF NOT EXISTS vehicles (
  id            BIGSERIAL PRIMARY KEY,
  user_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vehicle_type  VARCHAR(24) NOT NULL,
  brand         VARCHAR(40),
  model         VARCHAR(60),
  model_year    SMALLINT,
  capacity      SMALLINT,
  plate_city    CHAR(2),                        -- plakanın yalnızca il kodu tutulur
  features      TEXT[] NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS vehicles_user_idx ON vehicles(user_id);

-- Belge doğrulama: e-Devlet barkodu veya geçici dosya. İnceleme sonrası hassas alanlar silinir (purge).
CREATE TABLE IF NOT EXISTS verifications (
  id            BIGSERIAL PRIMARY KEY,
  user_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  doc_type      VARCHAR(24) NOT NULL,           -- ehliyet, src, psikoteknik, ruhsat, yetki_belgesi, vergi_levhasi
  method        VARCHAR(10) NOT NULL,           -- barkod | dosya
  secret_enc    TEXT,                           -- AES-256-GCM: barkod no + TCKN (yalnızca inceleme süresince)
  file_path     TEXT,                           -- şifreli dosya (yalnızca inceleme süresince)
  file_mime     VARCHAR(40),
  status        VARCHAR(10) NOT NULL DEFAULT 'pending', -- pending | approved | rejected | expired
  reject_reason VARCHAR(300),
  valid_until   DATE,                           -- belgenin geçerlilik bitişi (opsiyonel)
  reviewed_by   BIGINT REFERENCES users(id),
  reviewed_at   TIMESTAMPTZ,
  purge_after   TIMESTAMPTZ NOT NULL,
  purged_at     TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS verifications_user_idx ON verifications(user_id);
CREATE INDEX IF NOT EXISTS verifications_status_idx ON verifications(status);

CREATE TABLE IF NOT EXISTS listings (
  id            BIGSERIAL PRIMARY KEY,
  user_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category      VARCHAR(30) NOT NULL,
  lister_kind   VARCHAR(10) NOT NULL DEFAULT 'bireysel',
  title         VARCHAR(90) NOT NULL,
  description   TEXT NOT NULL,
  service_types TEXT[] NOT NULL DEFAULT '{}',
  vehicle_type  VARCHAR(24),
  capacity      SMALLINT,
  city_code     CHAR(2) NOT NULL,
  district      VARCHAR(60),
  route_from    VARCHAR(140),
  route_to      VARCHAR(140),
  route_stops   TEXT[] NOT NULL DEFAULT '{}',
  shifts        TEXT[] NOT NULL DEFAULT '{}',
  price_amount  NUMERIC(12,2),
  price_period  VARCHAR(12),
  price_hidden  BOOLEAN NOT NULL DEFAULT FALSE,
  show_phone    BOOLEAN NOT NULL DEFAULT FALSE,
  photos        TEXT[] NOT NULL DEFAULT '{}',
  status        VARCHAR(10) NOT NULL DEFAULT 'active', -- pending | active | passive | rejected | deleted
  reject_reason VARCHAR(300),
  published_at  TIMESTAMPTZ,
  expires_at    TIMESTAMPTZ,
  featured_until TIMESTAMPTZ,
  view_count    INT NOT NULL DEFAULT 0,
  fav_count     INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  search        TSVECTOR GENERATED ALWAYS AS (
                  setweight(to_tsvector('turkish', coalesce(title,'')), 'A') ||
                  setweight(to_tsvector('turkish', coalesce(route_from,'') || ' ' || coalesce(route_to,'') || ' ' || coalesce(district,'')), 'B') ||
                  setweight(to_tsvector('turkish', coalesce(description,'')), 'C')
                ) STORED
);
CREATE INDEX IF NOT EXISTS listings_status_city_idx ON listings(status, city_code, published_at DESC);
CREATE INDEX IF NOT EXISTS listings_user_idx ON listings(user_id);
CREATE INDEX IF NOT EXISTS listings_featured_idx ON listings(featured_until) WHERE featured_until IS NOT NULL;
CREATE INDEX IF NOT EXISTS listings_search_idx ON listings USING GIN(search);
CREATE INDEX IF NOT EXISTS listings_expires_idx ON listings(expires_at) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS favorites (
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  listing_id  BIGINT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, listing_id)
);

CREATE TABLE IF NOT EXISTS conversations (
  id              BIGSERIAL PRIMARY KEY,
  listing_id      BIGINT REFERENCES listings(id) ON DELETE SET NULL,
  listing_title   VARCHAR(90),
  owner_id        BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  other_id        BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  owner_unread    INT NOT NULL DEFAULT 0,
  other_unread    INT NOT NULL DEFAULT 0,
  owner_hidden    BOOLEAN NOT NULL DEFAULT FALSE,
  other_hidden    BOOLEAN NOT NULL DEFAULT FALSE,
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (listing_id, other_id)
);
CREATE INDEX IF NOT EXISTS conv_owner_idx ON conversations(owner_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS conv_other_idx ON conversations(other_id, last_message_at DESC);

CREATE TABLE IF NOT EXISTS messages (
  id              BIGSERIAL PRIMARY KEY,
  conversation_id BIGINT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body            VARCHAR(2000) NOT NULL,
  flagged         BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS messages_conv_idx ON messages(conversation_id, id);

CREATE TABLE IF NOT EXISTS blocks (
  blocker_id  BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id  BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id)
);

CREATE TABLE IF NOT EXISTS reports (
  id           BIGSERIAL PRIMARY KEY,
  reporter_id  BIGINT REFERENCES users(id) ON DELETE SET NULL,
  target_type  VARCHAR(16) NOT NULL,   -- listing | user | conversation
  target_id    BIGINT NOT NULL,
  reason       VARCHAR(30) NOT NULL,
  details      VARCHAR(1000),
  status       VARCHAR(10) NOT NULL DEFAULT 'open', -- open | resolved | dismissed
  handled_by   BIGINT REFERENCES users(id),
  handled_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reports_status_idx ON reports(status, created_at DESC);

CREATE TABLE IF NOT EXISTS otp_codes (
  id           BIGSERIAL PRIMARY KEY,
  channel      VARCHAR(6) NOT NULL,     -- sms | email
  destination  VARCHAR(160) NOT NULL,
  purpose      VARCHAR(12) NOT NULL,    -- verify | reset
  code_hash    TEXT NOT NULL,
  attempts     INT NOT NULL DEFAULT 0,
  expires_at   TIMESTAMPTZ NOT NULL,
  consumed_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS otp_dest_idx ON otp_codes(destination, purpose, created_at DESC);

CREATE TABLE IF NOT EXISTS fuel_prices (
  id          BIGSERIAL PRIMARY KEY,
  region      VARCHAR(20) NOT NULL,     -- istanbul_avrupa, istanbul_anadolu, ankara, izmir, bursa, turkiye
  benzin      NUMERIC(6,2),
  motorin     NUMERIC(6,2),
  lpg         NUMERIC(6,2),
  source      VARCHAR(30) NOT NULL,     -- api | manuel
  fetched_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fuel_region_idx ON fuel_prices(region, fetched_at DESC);

CREATE TABLE IF NOT EXISTS ad_slots (
  key             VARCHAR(30) PRIMARY KEY,
  label           VARCHAR(80) NOT NULL,
  mode            VARCHAR(10) NOT NULL DEFAULT 'house',  -- adsense | house | off
  adsense_slot_id VARCHAR(40)
);

CREATE TABLE IF NOT EXISTS house_ads (
  id            BIGSERIAL PRIMARY KEY,
  slot_key      VARCHAR(30) NOT NULL REFERENCES ad_slots(key) ON DELETE CASCADE,
  advertiser    VARCHAR(120) NOT NULL,
  title         VARCHAR(90) NOT NULL,
  body          VARCHAR(200),
  image_path    TEXT,
  target_url    VARCHAR(500) NOT NULL,
  city_codes    TEXT[] NOT NULL DEFAULT '{}',   -- boş = tüm Türkiye
  starts_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at       TIMESTAMPTZ NOT NULL,
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  impressions   INT NOT NULL DEFAULT 0,
  clicks        INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS promotion_orders (
  id           BIGSERIAL PRIMARY KEY,
  listing_id   BIGINT REFERENCES listings(id) ON DELETE SET NULL,
  user_id      BIGINT REFERENCES users(id) ON DELETE SET NULL,
  package      VARCHAR(20) NOT NULL,
  days         INT NOT NULL,
  amount       NUMERIC(10,2) NOT NULL,
  status       VARCHAR(12) NOT NULL DEFAULT 'pending', -- pending | paid | failed | granted
  provider     VARCHAR(16),
  provider_ref VARCHAR(120),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at      TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS settings (
  key    VARCHAR(40) PRIMARY KEY,
  value  JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS pages (
  slug        VARCHAR(40) PRIMARY KEY,
  title       VARCHAR(120) NOT NULL,
  body_html   TEXT NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_log (
  id          BIGSERIAL PRIMARY KEY,
  actor_id    BIGINT,
  action      VARCHAR(40) NOT NULL,
  target_type VARCHAR(16),
  target_id   BIGINT,
  meta        JSONB,
  ip          INET,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_created_idx ON audit_log(created_at DESC);

-- 5651 sayılı Kanun: yer sağlayıcı trafik bilgisi (IP, port, zaman, işlem). Saklama süresi ayarlardan (varsayılan 2 yıl).
CREATE TABLE IF NOT EXISTS traffic_log (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT,
  ip          INET,
  port        INT,
  action      VARCHAR(30) NOT NULL,
  ref_id      BIGINT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS traffic_created_idx ON traffic_log(created_at);

CREATE TABLE IF NOT EXISTS "session" (
  "sid" VARCHAR NOT NULL COLLATE "default" PRIMARY KEY,
  "sess" JSON NOT NULL,
  "expire" TIMESTAMP(6) NOT NULL
);
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
