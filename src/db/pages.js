// Varsayılan sayfa içerikleri. Yasal metinler TASLAKTIR: yayından önce bir avukata kontrol ettirilmelidir.
// {{...}} yer tutucuları .env'deki şirket bilgileriyle doldurulur.

module.exports = [
  {
    slug: 'kvkk',
    title: 'KVKK Aydınlatma Metni',
    body_html: `
<p>Bu metin, 6698 sayılı Kişisel Verilerin Korunması Kanunu'nun ("KVKK") 10. maddesi ve Aydınlatma Yükümlülüğünün Yerine Getirilmesinde Uyulacak Usul ve Esaslar Hakkında Tebliğ uyarınca, <strong>{{SITE}}</strong> ("Servis Team") kullanıcılarını bilgilendirmek amacıyla hazırlanmıştır.</p>
<h2>1. Veri sorumlusu</h2>
<p>{{SIRKET_UNVANI}} — Adres: {{SIRKET_ADRES}} — E-posta: {{SIRKET_EPOSTA}} — KEP: {{SIRKET_KEP}} — MERSİS: {{SIRKET_MERSIS}}</p>
<h2>2. İşlenen kişisel veriler</h2>
<ul>
<li><strong>Kimlik ve iletişim:</strong> ad soyad, e-posta adresi, cep telefonu numarası, (varsa) firma adı.</li>
<li><strong>Mesleki bilgiler:</strong> hesap türü, ehliyet sınıfı, SRC türü, deneyim yılı, araç bilgileri (tip, marka, model, kapasite, plakanın yalnızca il kodu).</li>
<li><strong>İlan ve iletişim içerikleri:</strong> ilan metinleri, fotoğraflar (konum ve cihaz bilgisi içeren üst veriler otomatik silinir), site içi mesajlar.</li>
<li><strong>Belge doğrulama verileri:</strong> e-Devlet barkod numarası ve T.C. kimlik numarası veya belge görüntüsü — yalnızca doğrulama süresince, şifreli olarak.</li>
<li><strong>İşlem güvenliği:</strong> IP adresi, kaynak port bilgisi, işlem zamanı, oturum bilgisi, şifrenizin geri döndürülemez özeti.</li>
<li><strong>Konum:</strong> konumunuzu kullanmayı seçerseniz, cihazınızda yalnızca bulunduğunuz il hesaplanır; koordinatlarınız sunucularımıza gönderilmez.</li>
</ul>
<h2>3. İşleme amaçları ve hukuki sebepler</h2>
<ul>
<li>Üyelik oluşturma, ilan yayınlama, mesajlaşma ve platform hizmetinin sunulması — <em>sözleşmenin kurulması ve ifası (KVKK md. 5/2-c)</em>.</li>
<li>Hesap güvenliği, dolandırıcılığın önlenmesi, şikâyetlerin incelenmesi — <em>meşru menfaat (md. 5/2-f)</em>.</li>
<li>5651 sayılı Kanun kapsamında trafik bilgisinin saklanması ve yetkili mercilere sunulması — <em>kanunlarda açıkça öngörülme ve hukuki yükümlülük (md. 5/2-a, ç)</em>.</li>
<li>Telefon numaranızın ilanlarda gösterilmesi, belge doğrulaması için T.C. kimlik numarası ve belge bilgilerinin işlenmesi, ticari elektronik ileti gönderimi ve reklam çerezleri — <em>açık rızanız (md. 5/1)</em>. Açık rızanızı dilediğiniz zaman geri alabilirsiniz.</li>
</ul>
<p>Ceza mahkûmiyeti ve güvenlik tedbirleri (adli sicil), sağlık gibi <strong>özel nitelikli kişisel veriler</strong> platformda talep edilmez ve işlenmez.</p>
<h2>4. Aktarım</h2>
<p>Kişisel verileriniz; yalnızca hizmetin gerektirdiği ölçüde Türkiye'de bulunan barındırma ve e-posta hizmeti sağlayıcılarımıza, kanunen yetkili kamu kurum ve kuruluşlarına ve yargı mercilerine aktarılabilir. İlan içerikleri ve sizin paylaşmayı seçtiğiniz bilgiler (ör. telefon numarası) diğer üyelerce görüntülenebilir. Reklam çerezlerine izin verirseniz Google tarafından yurt dışında işlenen çerez verileri için KVKK md. 9 hükümleri uygulanır.</p>
<h2>5. Saklama süreleri</h2>
<ul>
<li>Üyelik ve ilan verileri: üyelik süresince; hesabınızı sildiğinizde derhal silinir.</li>
<li>Belge doğrulama verileri: inceleme tamamlanınca derhal, her durumda en geç 7 gün içinde silinir. Yalnızca "doğrulandı" bilgisi ve tarihi saklanır.</li>
<li>Trafik (erişim) kayıtları: 5651 sayılı Kanun gereği 2 yıl.</li>
<li>Doğrulanmamış hesaplar: 3 gün.</li>
</ul>
<h2>6. Haklarınız (KVKK md. 11)</h2>
<p>Verilerinizin işlenip işlenmediğini öğrenme, bilgi talep etme, işleme amacını öğrenme, aktarıldığı kişileri bilme, düzeltme, silme veya yok edilmesini isteme, bu işlemlerin aktarılan kişilere bildirilmesini isteme, otomatik sistemlerle aleyhinize bir sonuç doğmasına itiraz etme ve zarara uğramanız hâlinde tazminat talep etme haklarına sahipsiniz.</p>
<p>Hesabım &gt; Hesap Ayarları bölümünden verilerinizin bir kopyasını indirebilir ve hesabınızı silebilirsiniz. Diğer talepleriniz için <a href="/iletisim">iletişim formunu</a> ("KVKK başvurusu" konusu) kullanabilir veya {{SIRKET_EPOSTA}} adresine yazabilirsiniz. Başvurularınız en geç 30 gün içinde ücretsiz olarak sonuçlandırılır.</p>`,
  },
  {
    slug: 'kullanim-kosullari',
    title: 'Kullanım Koşulları',
    body_html: `
<p>Bu koşullar, {{SITE}} ("Servis Team") ile siteyi kullanan üyeler arasındaki ilişkiyi düzenler. Siteye üye olarak bu koşulları kabul etmiş olursunuz.</p>
<h2>1. Hizmetin niteliği</h2>
<p>Servis Team; servis şoförleri, araç sahipleri, servis firmaları, kurumlar ve servis hizmeti arayanların ilan yayınlayarak birbirine ulaşmasını sağlayan bir ilan platformudur. Servis Team, 5651 sayılı Kanun kapsamında <strong>yer sağlayıcıdır</strong>; ilanların tarafı, işvereni, aracısı veya kefili değildir. Taraflar arasında kurulan iş ve hizmet ilişkilerinden doğan hak ve yükümlülükler yalnızca taraflara aittir.</p>
<h2>2. Üyelik</h2>
<ul>
<li>Üyelik için 18 yaşını doldurmuş olmak, gerçek ve güncel bilgi vermek zorunludur.</li>
<li>Her kişi tek hesap açabilir. Hesap güvenliğinden ve şifrenin gizliliğinden üye sorumludur.</li>
<li>Başkası adına, sahte kimlikle veya yanıltıcı bilgilerle hesap açılamaz.</li>
</ul>
<h2>3. İlan kuralları</h2>
<ul>
<li>İlanlar gerçek bir iş, hizmet veya araç talebine/teklifine dayanmalıdır. İlan 14 gün yayında kalır.</li>
<li>İlan metninde telefon, e-posta, IBAN gibi iletişim/ödeme bilgisi yazılamaz; iletişim site içi araçlarla kurulur.</li>
<li>Ayrımcı (cinsiyet, yaş, köken, din vb.), hakaret içeren, yasa dışı, yanıltıcı veya üçüncü kişilerin haklarını ihlal eden ilanlar yayınlanamaz.</li>
<li>Kayıt dışı istihdam, sigortasız çalıştırma, gerekli izin ve belgeler olmadan yolcu taşımacılığı teklif eden ilanlar yasaktır.</li>
<li>İşe alım için "dosya parası", "kapora" gibi ücret talep etmek yasaktır.</li>
<li>Başkasına ait kişisel verileri (fotoğraf, plaka, kimlik bilgisi) rızası olmadan paylaşmak yasaktır.</li>
</ul>
<h2>4. Mesajlaşma</h2>
<p>Site içi mesajlar yalnızca ilgili ilanla ilgili iletişim için kullanılabilir. Taciz, spam ve dolandırıcılık amaçlı mesajlar yasaktır. Şikâyet edilen konuşmalar yalnızca yetkili ekip tarafından, inceleme amacıyla görüntülenebilir.</p>
<h2>5. Servis Team'in hakları</h2>
<p>Servis Team; kurallara aykırı ilanları önceden bildirimde bulunmaksızın yayından kaldırabilir, hesapları askıya alabilir veya kapatabilir, hukuka aykırı içerik bildirimlerini yetkili mercilere iletebilir. Kararlara <a href="/iletisim">iletişim formu</a> üzerinden itiraz edilebilir.</p>
<h2>6. Belge doğrulama ve rozetler</h2>
<p>"Belgeli" rozeti, ilgili belgenin başvuru tarihinde e-Devlet veya belge görüntüsü üzerinden kontrol edildiğini gösterir; kişinin güvenilirliğine veya belgenin sonraki geçerliliğine ilişkin bir garanti değildir. İşe alım yapanlar belgeleri ayrıca kontrol etmelidir.</p>
<h2>7. Ücretli hizmetler ve reklam</h2>
<p>İlan vermek ücretsizdir. "Öne çıkarma" gibi ücretli hizmetlerin koşulları satış sırasında ayrıca bildirilir. Sitede reklam alanları bulunur; reklam içeriklerinden reklamveren sorumludur.</p>
<h2>8. Sorumluluğun sınırlandırılması</h2>
<p>Servis Team, ilan içeriklerinin doğruluğunu ve taraflar arasındaki ilişkilerin sonucunu garanti etmez. Sitenin kesintisiz veya hatasız çalışacağı taahhüt edilmez.</p>
<h2>9. Uygulanacak hukuk</h2>
<p>Bu koşullar Türkiye Cumhuriyeti hukukuna tabidir. Tüketici sıfatına sahip üyeler için tüketici hakem heyetleri ve tüketici mahkemelerinin yetkisi saklıdır.</p>
<p>İletişim: {{SIRKET_UNVANI}}, {{SIRKET_ADRES}}, {{SIRKET_EPOSTA}}</p>`,
  },
  {
    slug: 'cerez-politikasi',
    title: 'Çerez Politikası',
    body_html: `
<p>Servis Team, sitenin çalışması ve (izin vermeniz hâlinde) reklam gösterimi için çerez kullanır. Tercihinizi <a href="/cerez-tercihleri">Çerez Tercihleri</a> sayfasından istediğiniz zaman değiştirebilirsiniz.</p>
<h2>Zorunlu çerezler (izin gerekmez)</h2>
<ul>
<li><code>st.sid</code> — oturumunuzu ve güvenlik (CSRF) anahtarını tutar. Süre: 30 gün.</li>
<li><code>st_il</code> — seçtiğiniz il. Süre: 1 yıl.</li>
<li><code>st_text</code> — yazı boyutu tercihiniz. Süre: 1 yıl.</li>
<li><code>st_consent</code> — çerez tercihiniz. Süre: 6 ay.</li>
<li><code>st_locask</code> — konum sorusunu tekrar göstermemek için. Süre: 30 gün.</li>
</ul>
<h2>Reklam çerezleri (açık rızanızla)</h2>
<p>İzin verirseniz Google AdSense ve iş ortakları, ilgi alanınıza uygun reklam göstermek ve reklam performansını ölçmek için çerez kullanır. Bu veriler Google tarafından yurt dışında işlenebilir. Ayrıntılar için Google'ın reklam politikalarını inceleyebilirsiniz. İzin vermezseniz reklam çerezi kullanılmaz; yalnızca çerezsiz, bölgesel doğrudan reklamlar gösterilebilir.</p>
<p>Analitik amaçlı üçüncü taraf çerez kullanılmamaktadır.</p>`,
  },
  {
    slug: 'hakkimizda',
    title: 'Hakkımızda',
    body_html: `
<p><strong>Servis Team</strong>, Türkiye'nin servis taşımacılığı sektörüne özel ilan platformudur. Personel servisi, öğrenci servisi, VIP transfer ve turizm taşımacılığında çalışan şoförleri, araç sahiplerini, servis firmalarını ve servis hizmeti arayan kurumları tek yerde buluşturur.</p>
<h2>Neden Servis Team?</h2>
<ul>
<li><strong>Sade ve kolay:</strong> Büyük yazılar, net düğmeler. Herkesin rahatça kullanabileceği şekilde tasarlandı.</li>
<li><strong>Ücretsiz ilan:</strong> İlan vermek ücretsizdir, ilanınız 14 gün yayında kalır.</li>
<li><strong>Gizlilik:</strong> Telefon numaranız siz izin vermedikçe görünmez; site içi mesajlaşma ile güvenle iletişim kurarsınız.</li>
<li><strong>Belgeli üyeler:</strong> Ehliyet, SRC ve ruhsat gibi belgeler e-Devlet üzerinden doğrulanır; belgeleriniz bizde saklanmaz.</li>
<li><strong>Bölgenize özel:</strong> İlinizdeki ilanlar otomatik olarak öne gelir.</li>
</ul>`,
  },
  {
    slug: 'guvenli-ilan',
    title: 'Güvenli İlan Rehberi',
    body_html: `
<h2>Dolandırıcılığa karşı 6 altın kural</h2>
<ol>
<li><strong>Kapora göndermeyin.</strong> İş bulmak veya servis hattı almak için "dosya parası", "kapora", "ön ödeme" isteyenlere para göndermeyin.</li>
<li><strong>Site içinden yazışın.</strong> Mesajlarınız kayıt altında olur; sorun yaşarsanız şikâyet edebilirsiniz.</li>
<li><strong>Belgeleri yüz yüze kontrol edin.</strong> Ehliyet, SRC, psikoteknik ve ruhsatı işe başlamadan görün; e-Devlet barkodu ile doğrulayın.</li>
<li><strong>Sözleşme ve sigorta isteyin.</strong> Şoför olarak çalışacaksanız SGK girişinizin yapıldığından emin olun.</li>
<li><strong>Kişisel bilgilerinizi koruyun.</strong> Kimlik fotokopinizi, e-Devlet şifrenizi veya kart bilgilerinizi kimseyle paylaşmayın.</li>
<li><strong>Şüphelendiğinizde bildirin.</strong> İlan ve mesaj ekranlarındaki "Şikâyet Et" düğmesini kullanın.</li>
</ol>
<h2>Öğrenci servisi arayan velilere</h2>
<p>Okul servis araçlarında rehber personel bulunması, aracın ve şoförün mevzuatta öngörülen belgelere sahip olması gerekir. Servis firmasından izin belgelerini, şoförün ehliyet, SRC ve psikoteknik belgelerini görmek isteyin; ayrıntılar için okul idaresi ve ilçe milli eğitim müdürlüğü ile görüşün.</p>`,
  },
  {
    slug: 'reklam',
    title: 'Reklam Verin',
    body_html: `
<p>Servis Team'de reklamınız; servis şoförleri, servis firmaları, araç sahipleri ve servis hizmeti alan kurumlardan oluşan <strong>hedef kitleye</strong> ulaşır.</p>
<h2>Reklam seçenekleri</h2>
<ul>
<li><strong>Bölge Vitrini:</strong> İlanınız seçtiğiniz ilde, ana sayfada ve arama sonuçlarında en üstte "Öne Çıkan" etiketiyle 7 veya 14 gün gösterilir.</li>
<li><strong>Banner reklam:</strong> Ana sayfa, ilan listesi ve ilan detay sayfalarında, il bazında hedefleme ile.</li>
</ul>
<p>Lastik, yedek parça, sigorta, filo takip, akaryakıt, servis aracı satış/kiralama ve eğitim (SRC, psikoteknik) firmaları için uygundur.</p>
<p>Fiyat ve uygunluk için <a href="/iletisim">iletişim formundan</a> "Reklam vermek istiyorum" konusunu seçin.</p>`,
  },
];
