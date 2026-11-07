// Servis Team sabit sınıflandırmaları. Etiketler sade, kısa ve büyük ekranda okunur olacak şekilde seçildi.

const ACCOUNT_TYPES = {
  sofor: {
    label: 'Şoför',
    desc: 'Servis şoförüyüm, iş arıyorum veya çalışıyorum.',
    icon: 'driver',
    needsVehicle: false,
    docs: ['ehliyet', 'src', 'psikoteknik'],
  },
  arac_sahibi: {
    label: 'Araç Sahibi',
    desc: 'Kendi servis aracım var, aracıma iş veya şoför arıyorum.',
    icon: 'van',
    needsVehicle: true,
    docs: ['ehliyet', 'src', 'ruhsat'],
  },
  servis_firmasi: {
    label: 'Servis Firması',
    desc: 'Filomuz var. Şoför, araç veya yeni müşteri arıyoruz.',
    icon: 'building',
    needsVehicle: false,
    docs: ['yetki_belgesi', 'vergi_levhasi'],
  },
  kurum: {
    label: 'Kurum / Şirket',
    desc: 'Fabrika, okul, şirket. Personel veya öğrenci servisi arıyoruz.',
    icon: 'factory',
    needsVehicle: false,
    docs: ['vergi_levhasi'],
  },
  yolcu_veli: {
    label: 'Veli / Yolcu',
    desc: 'Çocuğum veya kendim için servis arıyorum.',
    icon: 'family',
    needsVehicle: false,
    docs: [],
  },
  rehber_personel: {
    label: 'Rehber Personel',
    desc: 'Okul servisinde rehber (hostes) olarak iş arıyorum.',
    icon: 'guide',
    needsVehicle: false,
    docs: [],
  },
};

// İlan türleri. `for`: önerildiği hesap türleri (hepsi seçebilir, öneriler üstte çıkar).
const CATEGORIES = {
  sofor_ariyorum:   { label: 'Şoför Arıyorum',        short: 'Şoför aranıyor',   for: ['servis_firmasi', 'arac_sahibi', 'kurum'], icon: 'driver' },
  is_ariyorum:      { label: 'İş Arıyorum (Şoför)',   short: 'İş arıyor',        for: ['sofor'], icon: 'briefcase' },
  aracima_is:       { label: 'Aracıma İş Arıyorum',   short: 'Araç + iş arıyor', for: ['arac_sahibi', 'servis_firmasi'], icon: 'van' },
  servis_ariyorum:  { label: 'Servis Arıyorum',       short: 'Servis aranıyor',  for: ['kurum', 'yolcu_veli'], icon: 'search' },
  servis_veriyorum: { label: 'Servis Hizmeti Veriyorum', short: 'Hizmet veriyor', for: ['servis_firmasi', 'arac_sahibi'], icon: 'handshake' },
  arac_ariyorum:    { label: 'Araç Arıyorum',         short: 'Araç aranıyor',    for: ['servis_firmasi', 'kurum'], icon: 'van' },
  rehber_ariyorum:  { label: 'Rehber Personel Arıyorum', short: 'Rehber aranıyor', for: ['servis_firmasi', 'arac_sahibi'], icon: 'guide' },
  rehber_is:        { label: 'İş Arıyorum (Rehber)',  short: 'Rehber iş arıyor', for: ['rehber_personel'], icon: 'briefcase' },
  hat_devri:        { label: 'Hat / İş Devri',         short: 'Hat devri',        for: ['servis_firmasi', 'arac_sahibi'], icon: 'route' },
};

const SERVICE_TYPES = {
  personel: 'Personel Servisi',
  okul: 'Öğrenci / Okul Servisi',
  vip: 'VIP Transfer',
  havalimani: 'Havalimanı Transferi',
  turizm: 'Turizm / Tur',
  organizasyon: 'Düğün / Organizasyon',
  sehirlerarasi: 'Şehirlerarası',
};

const VEHICLE_TYPES = {
  otomobil: 'Otomobil',
  hafif_ticari: 'Hafif Ticari (Doblo, Caddy vb.)',
  vip_arac: 'VIP Araç (Vito, Sprinter VIP)',
  minibus: 'Minibüs (14-19 kişilik)',
  midibus: 'Midibüs (25-35 kişilik)',
  otobus: 'Otobüs (45+ kişilik)',
  okul_tasiti: 'Okul Taşıtı',
};

const VEHICLE_FEATURES = {
  klima: 'Klima',
  usb: 'USB şarj',
  wifi: 'Wi-Fi',
  kamera: 'Araç içi kamera',
  arac_takip: 'Araç takip (GPS)',
  engelli: 'Engelli erişimi',
  emniyet_kemeri: 'Tüm koltuklarda emniyet kemeri',
};

const SHIFTS = { sabah: 'Sabah', aksam: 'Akşam', gece: 'Gece', tam_gun: 'Tam gün', hafta_sonu: 'Hafta sonu' };

const PRICE_PERIODS = { aylik: 'Aylık', gunluk: 'Günlük', sefer: 'Sefer başı', saatlik: 'Saatlik', toplam: 'Toplam' };

const LICENSE_CLASSES = ['B', 'BE', 'C1', 'C', 'D1', 'D1E', 'D', 'DE'];
const SRC_TYPES = ['SRC1', 'SRC2', 'SRC3', 'SRC4', 'SRC5'];

const DOC_TYPES = {
  ehliyet: { short: 'Ehliyet', label: 'Sürücü Belgesi', edevlet: 'e-Devlet > Sürücü Belgesi Bilgilerim (barkodlu)' },
  src: { short: 'SRC', label: 'SRC Belgesi', edevlet: 'e-Devlet > SRC Belgesi Sorgulama (barkodlu)' },
  psikoteknik: { short: 'Psikoteknik', label: 'Psikoteknik Belgesi', edevlet: 'e-Devlet > Psikoteknik Belge Sorgulama (barkodlu)' },
  ruhsat: { short: 'Ruhsat', label: 'Araç Ruhsatı', edevlet: 'e-Devlet > Adıma Kayıtlı Araç Sorgulama (barkodlu)' },
  yetki_belgesi: { short: 'Yetki belgesi', label: 'Yetki / İzin Belgesi (D2, servis izin belgesi vb.)', edevlet: 'Ulaştırma Bakanlığı / Belediye belgesi (barkodlu veya doğrulama kodlu)' },
  vergi_levhasi: { short: 'Vergi levhası', label: 'Vergi Levhası', edevlet: 'GİB > Vergi Levhası (barkodlu / doğrulama kodlu)' },
};

const REPORT_REASONS = {
  dolandiricilik: 'Dolandırıcılık şüphesi',
  sahte: 'Sahte / yanıltıcı ilan',
  uygunsuz: 'Uygunsuz içerik',
  taciz: 'Taciz / hakaret',
  kisisel_veri: 'Kişisel verilerim izinsiz paylaşılmış',
  diger: 'Diğer',
};

const PROMO_PACKAGES = {
  vitrin_7:  { label: 'Bölge Vitrini — 7 gün',  days: 7,  defaultPrice: 149 },
  vitrin_14: { label: 'Bölge Vitrini — 14 gün', days: 14, defaultPrice: 249 },
};

const FUEL_REGIONS = {
  turkiye: 'Türkiye ort.',
  istanbul_avrupa: 'İstanbul Avrupa',
  istanbul_anadolu: 'İstanbul Anadolu',
  ankara: 'Ankara',
  izmir: 'İzmir',
  bursa: 'Bursa',
};

const LISTING_DAYS = 14;

module.exports = {
  ACCOUNT_TYPES, CATEGORIES, SERVICE_TYPES, VEHICLE_TYPES, VEHICLE_FEATURES, SHIFTS, PRICE_PERIODS,
  LICENSE_CLASSES, SRC_TYPES, DOC_TYPES, REPORT_REASONS, PROMO_PACKAGES, FUEL_REGIONS, LISTING_DAYS,
};
