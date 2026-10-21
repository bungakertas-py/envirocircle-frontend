/* Peta Cuaca — frontend (angin + hujan, GFS)
 * Membaca catalog.json + aset dari pipeline backend; angin = partikel + heatmap
 * kecepatan, hujan = heatmap laju hujan. Layout & gaya ala BMKG Signature.
 */
// ================= MODEL =================
// Dua sumber data. GFS = model global, realtime, seluruh Asia Tenggara.
// WRF 9 km = keluaran meteorologi WRF-Chem dari server ITERA, se-Indonesia.
// Pindah model = MUAT ULANG halaman, bukan tukar state di tempat. Disengaja:
// ada belasan cache lazy (point_data, city_data, siklon, ITCZ, isobar, monsun,
// profil) yang semuanya terkunci ke DATA_BASE. Menukarnya di tempat berarti
// membatalkan semuanya satu per satu, dan satu yang kelewat = data model lama
// nempel di model baru. Muat ulang selalu benar dan ongkosnya sepersekian detik.
// SATU MODEL SATU FOLDER, tidak ada yang nebeng di akar. Diminta pemilik
// 5 September 2026, dan susunan lama memang mengundang celaka. Dulu GFS duduk
// di AKAR data/output sedangkan model lain di sub-folder, jadi keluaran model
// baru yang salah taruh langsung MENIMPA catalog.json GFS, dan yang hilang
// justru model yang sudah jalan. Sekarang akar sengaja dibiarkan kosong,
// tidak ada model yang bisa menimpa model lain.
//
// Nama foldernya menyebut asal dan resolusinya, bukan nama internal. WRF 9 km
// dan WRFCHEM 9 km itu DUA KELUARAN DARI SATU RUN yang sama di server ITERA,
// yang satu parameter meteorologi yang satu parameter kimia. Yang meteorologi
// mendarat di sini, yang kimia di pohon Smokewatch.
//
// ANGKA RESOLUSI, 12 km sejak 12 September 2026. Nama foldernya sengaja TETAP
// wrfchem_9km_meteo, itu kesepakatan dengan backend supaya jalur push tidak
// ikut berubah. Jadi angka di nama folder JANGAN dipakai sebagai resolusi.
// Yang benar dikirim backend lewat catalog.model_label, dan samakanResolusi()
// di bawah menyalin angkanya ke label ini begitu katalognya mendarat.
//
// dx itu jarak antar sel dalam derajat, dipakai menghitung batas zoom-in di
// zoomMaksGrid(). Angka di sini cuma CADANGAN. Kalau katalog membawa
// image_bounds, jaraknya dihitung dari situ dan angka ini diabaikan.
// SATELIT ikut masuk daftar ini, bukan jadi layer tempelan di katalog GFS.
// Dia memang sumber data tersendiri, domainnya sendiri, waktunya sendiri,
// dan parameternya sendiri. Menumpangkannya ke GFS membuat garis waktu
// ramalan dan garis waktu pengamatan berebut satu penggeser.
//
// Dua penanda baru di baris ini dibaca di banyak tempat, jadi jangan
// dihapus. `privat` menentukan siapa yang lewat gerbang sandi dan siapa
// yang dapat keterangan uji coba. `satelit` menentukan siapa yang
// menyembunyikan parameter yang tidak dipunyainya, menyembunyikan pilihan
// level, dan tidak punya panel titik.
//
// `pemasok` menyebut SIAPA YANG MEMASAK data di base path model itu, dan dia
// dibaca chip sumber di bilah bawah. Dulu chip itu memakai satu kata untuk
// seluruh halaman, "cirrus" kalau datanya dari hostingan ini dan "GitAction"
// kalau dari cadangan. Itu benar selama semua model dimasak di tempat yang
// sama, dan BERHENTI BENAR begitu ada model yang tidak. Model yang dimasak
// GitHub Actions lalu disalin ke sini akan diberi label cirrus, dan chip yang
// salah lebih buruk daripada chip yang tidak ada, sebab chip inilah satu
// satunya tempat orang memeriksa kiriman siapa yang sedang macet.
//
// Nilainya nama tempat masak, bukan nama tempat simpan. ECMWF sekarang
// "gitaction" sebab alur kamilah yang memasaknya, walau berkasnya duduk di
// hostingan ini juga. Begitu server mengambil alih, ubah satu kata ini.
//
// `warna` dipakai GARIS MODEL di plot banding, dan cuma di situ. Ditaruh di
// tabel ini supaya tidak ada angka warna yang harus dicocokkan di dua tempat
// waktu model baru masuk. Tiga warna ini sengaja berjauhan di roda warna dan
// semuanya gelap, sebab latarnya putih dan garisnya setipis 1,6 px. Dua di
// antaranya memang di luar palet merek, dan itu disengaja: palet kita cuma
// punya satu biru gelap yang terbaca, sedangkan di sini yang dibedakan tiga
// hal yang setara.
//
// `cadangan` menyebut SUBFOLDER model ini di GitAction, dan model yang tidak
// punya baris itu memang tidak punya cadangan. Dulu pilihannya ditulis
// sebagai cabang `if` di basisCadangan(), satu cabang per model, dan itu
// berarti tiap model baru menambah cabang di tempat yang jauh dari sini.
// GFS tidak memakainya sebab katalognya duduk di AKAR keluaran, bukan di
// subfolder, lihat MODEL_GLOBAL.
//
// ECMWF `ekstra: false` walau pipelinenya menulis isobar, siklon, ITCZ,
// monsun, MJO, AUSMI, dan profil. Dengan false tiap fitur diperiksa dulu
// berkasnya ada atau tidak, jadi kalau satu run gugur di tengah dan satu
// berkas tidak tertulis, tombolnya hilang sendiri alih alih mengejar 404.
const MODELS = {
  gfs:         { base: "../backend/atmosight/data/output/gfs/",                 label: "GFS - 28 km",         ekstra: true,  dx: 0.25,  pemasok: "cirrus",    warna: "#1679AB" },
  ec9:         { base: "../backend/atmosight/data/output/ecmwf_9km/",           label: "ECMWF - 9 km",        ekstra: false, dx: 0.1,   pemasok: "gitaction", warna: "#7a3fb0", cadangan: "ecmwf_9km/" },
  wrf9:        { base: "../backend/atmosight/data/output/wrfchem_9km_meteo/",   label: "WRF - 12 km",         ekstra: false, dx: 0.108, privat: true, pemasok: "cirrus", warna: "#e4572e" },
  hima:        { base: "../backend/atmosight/data/output/himawari/",            label: "Satelit Himawari-9",  ekstra: false, dx: 0.05,  satelit: true, pemasok: "cirrus", cadangan: "himawari/" },
};

/* Nama tempat masak model yang sedang dibuka, dan bagaimana menyebutnya.
   Bawaannya cirrus, jadi model lama tidak berubah sama sekali. */
const PEMASOK = {
  cirrus:    { chip: "cirrus",   nama: "server cirrus" },
  gitaction: { chip: "GitAction", nama: "GitHub Actions" },
};
const pemasokModel = () => PEMASOK[MODEL.pemasok] || PEMASOK.cirrus;

// ================= SAKLAR MODEL =================
// Atmosight tahap awal SENGAJA cuma menampilkan GFS. Model lain tidak dihapus,
// cuma dimatikan, supaya bisa dinyalakan lagi tanpa menulis apa pun dari nol.
//
// CARA MENYALAKAN LAGI, ubah false jadi true di bawah ini. Tapi ingat,
// menyalakan di sini CUMA memunculkan pilihannya di dropdown. Yang membuat
// petanya berisi itu ADA DATANYA di base path model bersangkutan. Kalau cuma
// yang di sini dinyalakan, pilihannya muncul tapi peta kosong.
//
// Catatan lama di sini menyuruh menyalakan MASAK_MODEL_EXTRA di
// .github/workflows/deploy.yml juga. ITU SUDAH TIDAK BERLAKU di repo ini.
// Repo ini isinya tampilan saja dan tidak punya workflow. Yang memasak data
// sekarang server ITERA, dan dia mengirim hasilnya langsung ke folder
// data/output di hostingan.
//
// wrf9 DINYALAKAN 5 September 2026, sebab server ITERA sudah menjalankan
// WRF-Chem yang keluaran meteorologinya mengisi slot ini. Sebelum kirimannya
// mendarat, pilihannya muncul tapi masuk mode kosong, dan itu memang benar.
//
// WRF Citarum DIBUANG 5 September 2026 atas permintaan pemilik. Dia arsip ITB
// 2018-2019 dengan domain kecil sekitar Jawa, tidak pernah dinyalakan di sini,
// dan tidak ada yang akan mengisinya. Kodenya masih utuh di repo Kertas Cuaca
// kalau suatu saat diperlukan lagi.
const MODEL_AKTIF = {
  gfs: true,
  /* ECMWF DINYALAKAN 21 Oktober 2026. Datanya belum ada di hostingan, yang
     mengisinya untuk sekarang alur kerja kita sendiri di GitAction, dan
     ambilKatalog() otomatis memakai cadangan selama folder di hostingan
     masih kosong. Begitu server mengirimnya, dia pindah sendiri ke sana. */
  ec9: true,
  wrf9: true,          // keluaran meteorologi WRF-Chem 9 km dari server ITERA
  hima: true,          // citra Himawari-9, PENGAMATAN bukan ramalan
};
const modelHidup = (id) => !!MODELS[id] && MODEL_AKTIF[id] === true;

// Model PAJANGAN. Sengaja cuma dipamerkan di dropdown supaya rencananya
// kelihatan, tapi MATI dan tidak bisa dipilih. Tidak ada pipeline, tidak ada
// data, tidak ada base path. Kalau nanti salah satunya betul betul digarap,
// pindahkan dia ke MODELS di atas lalu nyalakan lewat MODEL_AKTIF.
// Daftarnya dipatok user. ECMWF dipasang lagi, dan angkanya BUKAN taksiran.
//
// ANGKANYA BERUBAH 21 Oktober 2026, dari 28 km jadi 9 km. Catatan lama di
// sini bilang HRES 9 km berbayar sehingga yang gratis cuma ifs/0p25, dan itu
// memang benar waktu dicek 4 September. ECMWF membukanya jadi gratis pada
// 20 Oktober 2026, latensi dua jam, lisensi CC-BY-4.0 wajib menyebut ECMWF.
// Sudah diperiksa langsung ke servernya, folder 0p1 betul betul ada dan bisa
// diambil tanpa akun.
// https://data.ecmwf.int/forecasts/<YYYYMMDD>/<HH>z/ifs/0p1/oper/
//
// MASIH PAJANGAN, dan itu disengaja. Layanannya baru sehari dan belum tiap
// run membawa folder 0p1, jadi belum ada yang mengisi base path-nya. Uji
// cobanya ada di repo atmosight, .github/workflows/ecmwf-uji.yml, dan dia
// sengaja TIDAK menerbitkan apa apa, hasilnya cuma artefak. Kalau sudah
// terbukti stabil, pindahkan barisnya ke MODELS lalu nyalakan lewat
// MODEL_AKTIF.
//
// LABELNYA "ECMWF - 9 km", bukan "ECMWF HRES" atau "IFS - 9 km". Pola di
// daftar ini nama lalu resolusi, dan HRES serta IFS itu istilah dalam yang
// tidak dikenal pembaca awam. Keterangan itu tempatnya di lencana sumber
// data, bukan di dropdown.
// "WRF - 9 km" DIKELUARKAN dari daftar ini 5 September 2026. Dia sudah jadi
// model sungguhan di MODELS, bukan pajangan lagi. Kalau dibiarkan di sini, dia
// muncul dua kali di dropdown, sekali hidup dan sekali mati.
const MODEL_PAJANGAN = [
  { label: "WRFDA - 9 km" },
];

const _mp = new URLSearchParams(location.search).get("model");
// Dijaga juga di sini, bukan cuma di dropdown. Kalau tidak, model yang sudah
// dimatikan masih bisa dibuka orang cuma dengan mengetik ?model=wrf di alamat.
const MODEL_ID = modelHidup(_mp) ? _mp : "gfs";
const MODEL = MODELS[MODEL_ID];

/* ---------------------------------------------------------------------
   MODE SEMATAN (?embed=1). Dipakai kartu Showcase di landing.

   Kartu itu tidak lagi memajang tangkapan layar. Dia memasang app INI
   sungguhan di dalam iframe, jadi yang dilihat orang peta hidup dengan data
   hari ini, bukan gambar yang basi begitu palet atau tata letaknya berubah.

   Yang dimatikan CUMA dua hal, interaksi peta dan pendaftaran service worker.
   Panel dan tombolnya sengaja DIBIARKAN tampil, sebab kartunya memang harus
   terbaca sebagai app yang utuh. Tombolnya tidak berfungsi bukan karena
   dilumpuhkan di sini, tapi karena seluruh kartu di landing ditutup satu
   tudung tautan, jadi klik di mana pun membuka app-nya.
   --------------------------------------------------------------------- */
const EMBED = new URLSearchParams(location.search).get("embed") === "1";
/* SUMBER DATA, SATU SAJA.
   Diputuskan user 10 Sep 2026, cadangan GitHub Pages DIBUANG. Datanya cuma
   dari hostingan ini sendiri, yaitu kiriman server cirrus ITERA di
   `../backend/<app>/data/output/<model>/`. Kalau katalognya tidak ada, situs
   masuk mode kosong dan itu disengaja, supaya kiriman yang berhenti langsung
   kelihatan, bukan tertutup data dari tempat lain. */
let DATA_BASE = MODEL.base;
/* Sumber yang akhirnya menang, dipakai badge di pojok slider. Ditaruh di sini
   supaya nilainya sudah ada sebelum katalog diambil, bukan menunggu DOM. */
let SUMBER_DEKAT = true;
let SUMBER_CADANGAN = false;
/* Kiriman cirrus sudah mendarat SESUDAH halaman ini dibuka, selagi kita
   berdiri di cadangan. Diisi intaiCirrus(), dibaca tandaiSumber(). */
let cirrusSiap = false;

/* CADANGAN GITHUB ACTIONS. Dipasang 5 Oktober 2026 atas permintaan pemilik,
   sebab kiriman server cirrus beberapa kali berhenti berhari hari tanpa kabar.

   Ini MENGHIDUPKAN LAGI cadangan yang sengaja dibuang 10 September di 3e2bd95,
   tapi dengan satu aturan yang dulu tidak ada, lihat ambilKatalog().

   Cuma untuk MODEL GLOBAL. GFS dimasak ulang tiap hari oleh
   GitHub Actions di repo lama, jadi kalau cirrus diam situs masih punya
   cuaca. WRF TIDAK PUNYA CADANGAN dan memang tidak bisa punya,
   dia dijalankan di server itu sendiri dan tidak ada tempat lain yang
   menghitungnya. Kalau kiriman WRF berhenti, model itu masuk mode kosong,
   dan itu disengaja supaya berhentinya kelihatan.

   Sumbernya beda ASAL, bukan sekadar beda folder. Itu justru pemisahan yang
   paling tegas, tidak mungkin tertukar dengan kiriman cirrus di hostingan.
   CORS-nya terbuka, GitHub Pages menjawab `access-control-allow-origin: *`,
   sudah diuji. */
const DATA_CADANGAN = "https://bungakertas-py.github.io/atmosight/backend/data/output/";
const MODEL_GLOBAL = "gfs";

/* Kapan catalog.json MENDARAT di folder kita, dibaca dari header Last-Modified
   jawaban server. Diisi ambilKatalog(), dipakai segar24Jam(). SENGAJA bukan
   dari isi katalog: isi katalog menceritakan pekerjaan backend, sedangkan yang
   ditanya titik segar cuma kapan berkasnya sampai di path kita. */
let katalogMendarat = null;

/* SATU PENGULANGAN kalau yang gugur itu jaringannya, bukan jawaban server.
   Dipasang 13 Oktober 2026. Tanpa ini satu permintaan yang gagal, misalnya
   sambungan direset hostingan waktu dia sedang sibuk mengunggah, sudah cukup
   untuk menurunkan SELURUH halaman ke cadangan sampai orangnya menekan F5
   sendiri. Pola yang sama sudah dipakai fetchUlang untuk point_meta.json dan
   potongan Range, jadi catalog.json ikut memakainya. Jawaban HTTP apa pun
   TIDAK diulang, 404 dan 500 itu bukan soal jaringan.

   kepala = true meminta HEAD saja, header tanpa badan. Dipakai intaiCirrus()
   yang cuma butuh Last-Modified, bukan isi katalognya yang 80 KB. */
async function cobaKatalog(base, kepala) {
  const opt = { cache: "no-store" };
  if (kepala) opt.method = "HEAD";
  try { return await fetchUlang(base + "catalog.json", opt); }
  catch (e) { return null; }        // jaringan mati, dua kali
}
/* Umur dibaca dari header Last-Modified, yaitu KAPAN BERKASNYA MENDARAT di
   sumber itu, bukan kapan modelnya di-run. Patokan yang sama dengan titik
   segar, lihat segar24Jam(). */
function umurKatalog(res) {
  const lm = res && res.ok && res.headers.get("last-modified");
  const ms = lm ? Date.parse(lm) : NaN;
  return isFinite(ms) ? Date.now() - ms : Infinity;
}

/* PATOKANNYA UMUR, BUKAN CUMA ADA ATAU TIDAK.
   Cadangan yang dulu cuma menolong kalau catalog.json 404. Itu tidak cukup.
   Keadaan yang sebenarnya terjadi bukan berkasnya hilang, melainkan cirrus
   tetap menjawab 200 sambil menyajikan katalog tiga hari lalu, dan aturan
   lama tidak akan pernah mundur dari situ.

   Jadi sekarang begini urutannya.
   1. Galat yang BUKAN 404 tidak pernah ditutupi cadangan. 500 atau JSON rusak
      itu kerusakan sungguhan, dan menyembunyikannya membuat ia tidak pernah
      ketahuan. Aturan lama, dipertahankan.
   2. Kalau yang dekat sehat DAN mendarat dalam 24 jam terakhir, selesai.
      Cadangan tidak disentuh sama sekali, nol permintaan jaringan tambahan.
   3. Baru kalau yang dekat hilang atau basi, cadangan ditanya.
   4. Cadangan dipakai HANYA kalau dia benar benar lebih segar. Pindah ke
      sumber yang sama basinya atau lebih basi cuma menukar satu masalah
      dengan masalah lain, sambil menyembunyikan bahwa cirrus yang bermasalah.
   5. "Lebih segar" sekarang ada ukurannya, lihat AMBANG_PINDAH_MS. */

/* SELISIH MINIMAL UNTUK PINDAH KE CADANGAN. 13 Oktober 2026.

   Dulu cukup lebih muda sedetik. Itu jadi mahal sejak 12 Oktober, sebab
   cadangan GitHub Pages masih format lama tanpa kunci "cells", jadi pindah
   ke sana membuat klik titik kembali mengunduh kisi utuh 22 MB. Lihat
   ambilTitik dan point_cells.bin.

   Pagi 13 Oktober itu betul terjadi. Folder GFS di cirrus belum ditukar
   sehingga katalognya berumur 26 jam, cadangan berumur 24,5 jam, dan situs
   pindah ke cadangan demi data yang cuma 1,5 jam lebih segar. Jalur cepat
   panel titik hilang, dan titik segarnya tetap merah sebab dua duanya sudah
   lewat 24 jam.

   Kalau selisihnya tipis, lebih baik tetap di cirrus. Chip cirrus plus titik
   merah itu pesan yang benar, yaitu kiriman ITERA yang terlambat. Pindah ke
   cadangan yang sama basinya cuma menyamarkan itu sambil ikut membuang jalur
   cepatnya. CAMS tidak terpengaruh, selisihnya di sana puluhan jam.

   umurDekat bisa Infinity, yaitu katalog dekat 404 atau jaringannya mati.
   Infinity tetap kalah berapa pun ambangnya, jadi cadangan tetap menolong
   di keadaan itu. */
const AMBANG_PINDAH_MS = 6 * 60 * 60 * 1000;
/* ALAMAT CADANGAN ITU PER SUMBER DATA, bukan satu untuk semua.

   DATA_CADANGAN menunjuk ke AKAR keluaran di GitAction, dan di akar itu
   yang ada katalog model global. Satelit punya folder sendiri di bawahnya.

   Tanpa pemisahan ini, memilih satelit lalu jatuh ke cadangan memulangkan
   katalog MODEL GLOBAL, dan yang tampil daftar parameter model lengkap
   dengan namanya sendiri di panel sumber. Persis itu yang dilaporkan
   pemilik, Satelit Himawari-9 terpilih tapi yang keluar Suhu, Kelembapan,
   Tutupan Awan, dan kawan kawan.

   Yang memulangkan null artinya sumber ini memang tidak punya cadangan,
   dan itu benar untuk model privat. */
function basisCadangan() {
  if (!DATA_CADANGAN) return null;
  if (MODEL_ID === MODEL_GLOBAL) return DATA_CADANGAN;
  /* Dibaca dari tabel MODELS, bukan dari cabang per model yang dulu ada di
     sini. Model yang tidak punya `cadangan` memulangkan null, dan itu benar
     untuk model privat: WRF dijalankan di server itu sendiri dan tidak ada
     tempat lain yang menghitungnya. */
  if (MODEL && MODEL.cadangan) return DATA_CADANGAN + MODEL.cadangan;
  return null;
}

async function ambilKatalog() {
  /* SATELIT ikut boleh memakai cadangan, dan itu bukan kelonggaran, itu
     memang satu satunya tempat datanya untuk sekarang. Citra Himawari
     dimasak GitAction dan terbit ke GitHub Pages, sedangkan folder di
     hostingan diisi server ITERA dan belum berisi satelit sama sekali.
     Tanpa baris ini pilihan Satelit akan selalu kosong di situs.

     Begitu backend mengirimnya ke hostingan, aturan umurnya yang bekerja
     seperti biasa, yang dekat menang kecuali cadangan lebih segar lewat
     ambang, dan GitAction otomatis turun jadi cadangan betulan. */
  const bolehCadangan = !!basisCadangan();
  const pakai = (base, res) => {
    pakaiSumber(base);
    katalogMendarat = res.headers.get("last-modified");
    return res;
  };
  const dekat = await cobaKatalog(MODEL.base);
  if (dekat && !dekat.ok && dekat.status !== 404) { pakaiSumber(MODEL.base); return dekat; }

  const dekatBaik = !!(dekat && dekat.ok);
  const umurDekat = dekatBaik ? umurKatalog(dekat) : Infinity;
  if (!bolehCadangan || (dekatBaik && umurDekat <= SEGAR_MAKS_MS)) {
    return dekatBaik ? pakai(MODEL.base, dekat) : null;
  }

  const jauh = await cobaKatalog(basisCadangan());
  if (jauh && jauh.ok && umurKatalog(jauh) + AMBANG_PINDAH_MS < umurDekat) {
    return pakai(basisCadangan(), jauh);
  }
  if (dekatBaik) return pakai(MODEL.base, dekat);
  return null;
}

/* INTAI CIRRUS SELAGI BERDIRI DI CADANGAN. 13 Oktober 2026.

   Sumber dipilih SEKALI, waktu halaman dibuka. Akibatnya tab yang dibuka
   pagi, selagi folder cirrus belum ditukar, terpaku di cadangan sepanjang
   hari walau kiriman barunya mendarat sepuluh menit kemudian. Itu yang
   dilaporkan 13 Oktober pagi, GFS masih GitAction padahal datanya sudah
   masuk, sedangkan WRF sudah cirrus sebab WRF tidak punya cadangan.

   Jadi selagi kita di cadangan, catalog.json cirrus diketuk tiap lima menit
   dengan HEAD, nol bita badan. Begitu dia sehat dan umurnya di bawah 24 jam,
   muat ulang DITAWARKAN, bukan dikerjakan sendiri. Halaman yang memuat ulang
   sendiri waktu orang sedang menggeser slider itu kasar, dan hash sudah
   menyimpan layer, waktu, titik, serta tombol lapisan, jadi sesudah muat
   ulang orangnya mendarat di tempat yang sama.

   Ambangnya SENGAJA sama dengan aturan nomor 2 di ambilKatalog, yaitu segar
   di bawah 24 jam. Jadi tawaran ini tidak pernah bohong, muat ulang yang
   ditawarkan pasti betul berpindah ke cirrus, bukan balik lagi ke cadangan.

   TIDAK jalan di mode sematan, sebab kartu peta hidup di landing memasang
   app ini di iframe dan tiap pengunjung landing akan ikut mengetuk hostingan.
   TIDAK mengetuk selagi tabnya tersembunyi. BERHENTI sesudah menawarkan
   sekali, biar tidak jadi gangguan yang berulang. */
const INTAI_MS = 5 * 60 * 1000;
let intaiTimer = null;
function intaiCirrus() {
  if (EMBED || !SUMBER_CADANGAN || intaiTimer) return;
  intaiTimer = setInterval(async () => {
    if (document.hidden) return;
    const r = await cobaKatalog(MODEL.base, true);
    if (!r || !r.ok || umurKatalog(r) > SEGAR_MAKS_MS) return;
    clearInterval(intaiTimer);
    intaiTimer = null;
    cirrusSiap = true;
    tandaiSumber();
    toast("Kiriman cirrus sudah masuk, ketuk untuk memuat ulang", () => location.reload());
  }, INTAI_MS);
}

function pakaiSumber(base) {
  DATA_BASE = base;
  const dekat = base === MODEL.base;
  SUMBER_CADANGAN = !dekat;
  /* Ditulis ke <html> supaya bisa diperiksa tanpa membuka console, dan supaya
     dump DOM waktu menguji deploy bisa membuktikan sumbernya yang mana. */
  document.documentElement.dataset.sumber = dekat ? "dekat" : "jauh";
  SUMBER_DEKAT = dekat;
  tandaiSumber();
  console.info(`[data] sumber ${dekat ? "LOKAL" : "menumpang"}, ${base}`);
}
window.__sumberData = () => DATA_BASE;
// Layer tambahan (siklon, ITCZ, isobar, monsun, Skew-T, level stratosfer) cuma
// ada di pipeline GFS. Di WRF berkasnya memang tak dibuat, jadi tombolnya
// disembunyikan daripada dibiarkan mengejar 404.
const PUNYA_EKSTRA = MODEL.ekstra;
/* Skew-T menyala kalau profile_meta.json ADA di folder model. GFS selalu punya,
   jadi langsung true. Model lain dicek dulu di terapkanFiturModel(), dan kartu
   Skew-T di popup titik cuma dibuat kalau berkasnya memang dikirim server. */
let SKEWT_ADA = PUNYA_EKSTRA;

// Definisi legend per layer: [label, warna, teksPutih?]
/* Palet anomali MJO, 18 pita. Huruf putih atau tinta ditentukan ANGKA
   KONTRAS, bukan selera. Diukur, tiga biru tergelap dan empat merah tergelap
   memang lebih terbaca berhuruf putih, sisanya berhuruf tinta. */
const MJO_PALET = ["#1364d2", "#1d6eeb", "#2782f0", "#3c96f5", "#50a5f5", "#78b9fa",
  "#94d0f9", "#b4f0fa", "#e1ffff", "#fffaaa", "#ffe878", "#ffc03c", "#ffa000",
  "#ff6000", "#ff3200", "#e11300", "#c00000", "#a50100"];
const MJO_PALET_PUTIH = [1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1];
/* 18 sel, 17 batas. Label tiap sel adalah batas ATASNYA, aturan yang sama
   dengan seluruh legenda lain di berkas ini. Sel pertama berarti "sama atau
   kurang dari", sel terakhir berarti "lebih dari". */
/* Enam pita, lima batas di 3, 6, 9, 12, dan 15. Label tiap sel tetap batas
   ATASNYA, aturan yang sama dengan seluruh legenda lain di berkas ini, jadi
   sel pertama berarti "kurang dari 3" dan sel terakhir "lebih dari 15". */
/* PITA ANOMALI ANGIN, dicuplik dari contoh GrADS yang dikirim pemilik.
   Enam pita, lima batas di 3, 6, 9, 12, dan 15 m/detik. Label tiap sel adalah
   batas ATASNYA, aturan yang sama dengan seluruh legenda lain di berkas ini.

   U850 ditampilkan SISI POSITIF saja, U200 sisi NEGATIF saja. Itu bukan
   pilihan rasa. Tanda tangan MJO itu BAROKLINIK, baratan 850 hPa berpasangan
   dengan timuran 200 hPa tepat di atas pusat konveksinya. Jadi dua duanya
   menyorot sisi yang memang menandai MJO, cuma tandanya berlawanan sebab
   lapisannya berlawanan.

   Pita terlemah BENING di dua duanya, bukan putih. Di bawah 3 m/detik
   anomalinya terlalu lemah untuk berarti apa apa, dan mengecatnya cuma
   menutupi peta di bawahnya.

   Ditulis sebagai DAFTAR TEGAS, bukan hitungan indeks. Percobaan pertama
   memakai 6 + i*3 dan sel terakhirnya jadi "18+" padahal mestinya "15+",
   sebab sel terakhir memang tidak punya batas atas. */
const ANOM_BARATAN = [
  ["3", "transparent", 0],
  ["6", "#dcdcff", 0],
  ["9", "#8071e8", 1],
  ["12", "#f8e275", 0],
  ["15", "#ffa000", 0],
  ["15+", "#e11300", 1],
];
/* Cerminnya. Urutan sel SELALU dari nilai terkecil ke terbesar, jadi yang
   paling pekat ada di KIRI dan beningnya di kanan, dekat nol. */
const ANOM_TIMURAN = [
  ["-15", "#e11300", 1],
  ["-12", "#ffa000", 0],
  ["-9", "#f8e275", 0],
  ["-6", "#8071e8", 1],
  ["-3", "#dcdcff", 0],
  ["0", "transparent", 0],
];
function legendaAnomSatuSisi(satuan, baratan) {
  const sel = (baratan ? ANOM_BARATAN : ANOM_TIMURAN).map((x) => x.slice());
  return { head: satuan + ", anomali " + (baratan ? "baratan" : "timuran"), cells: sel };
}

function legendaAnom(satuan, langkah) {
  const sel = [];
  for (let i = 0; i < 17; i++) {
    sel.push([String((i - 8) * langkah), MJO_PALET[i], MJO_PALET_PUTIH[i]]);
  }
  sel.push([8 * langkah + "+", MJO_PALET[17], MJO_PALET_PUTIH[17]]);
  return { head: satuan + ", anomali", cells: sel };
}

const LEGENDS = {
  /* ANOMALI MJO. Paletnya dicuplik LANGSUNG dari bilah warna contoh GrADS
     yang dikirim pemilik, bukan ditiru dengan mata. 18 pita dan 17 batas,
     biru untuk negatif dan merah untuk positif, dan pergantiannya TEPAT DI
     NOL, bukan di tengah rentang data.
     LANGKAHNYA BEDA PER PARAMETER. Angin memakai -16 sampai 16 persis seperti
     contohnya, sebab satuannya m/detik. OLR TIDAK BISA ikut angka itu, sebab
     anomali OLR MJO lazim mencapai 40 sampai 50 W/m2 sehingga seluruh petanya
     akan mentok di dua warna ujung dan strukturnya hilang. Warnanya sama
     persis, yang diskalakan cuma angkanya. */
  olr_anom: legendaAnom("W/m2", 5),       // -40 sampai +40
  /* ANGIN ANOMALI, HANYA SISI POSITIF, diminta pemilik 6 Oktober.
     Paletnya dicuplik dari contoh GrADS yang dia kirim, enam pita dengan lima
     label di BATAS antar pita, bukan di tengahnya.
     Pita terbawah BENING, bukan putih. Di bawah 3 m/detik anomalinya terlalu
     lemah untuk berarti apa apa, dan mengecatnya cuma menutupi peta di bawahnya.
     Soal tanda, U positif itu angin BARATAN, namanya mengikuti asal angin, dan
     udaranya memang bergerak KE TIMUR. Dua duanya benar, cuma beda sudut
     pandang. Baratan 850 hPa itu memang tanda fase konveksi MJO. */
  u850_anom: legendaAnomSatuSisi("m/detik", true),    // baratan, sisi positif
  u200_anom: legendaAnomSatuSisi("m/detik", false),   // timuran, sisi negatif
  wind_surface: {
    head: "KNOTS",
    cells: [["5", "#2b83ba", 1], ["10", "#5aa8cf", 0], ["15", "#abdda4", 0], ["20", "#66bd63", 0],
            ["25", "#d9ef8b", 0], ["34", "#fee08b", 0], ["48", "#fdae61", 0], ["64", "#f46d43", 1],
            ["80", "#d73027", 1], ["100+", "#a50026", 1]],
  },
  rain_surface: {
    head: "mm",
    cells: [["2", "#14378f", 1], ["4", "#2360c8", 1], ["8", "#22a5e0", 0], ["10", "#23d3c0", 0],
            ["15", "#35c84a", 0], ["20", "#8ed82a", 0], ["25", "#ead821", 0], ["30", "#f5a91e", 0],
            ["35", "#f2701c", 1], ["40", "#e42320", 1], ["50", "#e33bbf", 1], ["60", "#8a29c8", 1]],
  },
  rain_accum_surface: {
    head: "mm/hari",
    cells: [["5", "#14378f", 1], ["10", "#2360c8", 1], ["20", "#22a5e0", 0], ["40", "#23d3c0", 0],
            ["60", "#35c84a", 0], ["90", "#8ed82a", 0], ["120", "#ead821", 0], ["150", "#f5a91e", 0],
            ["200", "#f2701c", 1], ["300", "#e42320", 1], ["400", "#e33bbf", 1], ["500", "#8a29c8", 1]],
  },
  /* ANGIN GERAK AWAN dari Himawari-9. Ini angin yang DIUKUR dari
     perpindahan awan antar citra, bukan hitungan model, jadi dia pasangan
     yang pas untuk layer Angin GFS di sebelahnya.

     Legendanya bukan tangga angka melainkan TIGA LAPIS, sebab yang penting
     dibedakan memang lapisannya. Warnanya sama dengan warna panah di
     backend/pipeline/himawari_angin.py, dan dua duanya harus disetel
     bersama kalau diubah. */
  amv_angin: {
    head: "lapisan",
    cells: [["< 400 hPa", "#c5ff95", 0], ["400-700", "#5debd7", 0], ["> 700 hPa", "#4fa8d8", 1]],
  },
  /* BRIGHTNESS TEMPERATURE kanal 13 Himawari-9, 10,4 mikrometer. Ini
     PENGAMATAN, bukan ramalan.

     Namanya DISENGAJA bukan "Puncak Awan". Yang dihitung suhu kecerahan
     kanalnya, bukan produk turunan Cloud Top Temperature.

     SKALANYA INFERNO, TUJUH tingkat dari -70 sampai -5, lalu bening di
     -3. Jaraknya 11 derajat, bukan angka bulat, sebab dua ujungnya yang
     dipatok pemilik lalu dibagi tujuh. Diminta pemilik 19 Okt, menggantikan abu dan
     kelabu yang dulu membuat sebagian besar awan terbaca kelabu rata.

     Rentangnya dipilih dari data. Percobaan -90 sampai -70 diukur dulu di
     tiga hari dan ternyata nyaris kosong, jadi batas dinginnya jadi -70.
     Yang sekarang mewarnai 11 sampai 14 persen domain.

     Angkanya WAJIB sama dengan SKALA di backend/pipeline/himawari.py. */
  cloudtop_temp: {
    head: "\u00b0C",
    cells: [["-70", "#360961", 1], ["-59", "#69166e", 1], ["-48", "#952867", 1],
            ["-37", "#c4434f", 1], ["-26", "#e8692c", 0], ["-15", "#fba10e", 0],
            ["-5", "#fade72", 0], ["-3", "transparent", 0]],
  },
  temp_surface: {
    head: "°C",
    cells: [["0", "#2450b4", 1], ["8", "#4a97dc", 1], ["16", "#cfe4f2", 0], ["22", "#ffe08a", 0],
            ["28", "#fbaa4a", 0], ["32", "#ee7233", 0], ["36", "#d43325", 1], ["42", "#7d0d1a", 1]],
  },
  /* KELEMBAPAN, tabelnya DISAMAKAN dengan suite WRF Python milik Will
     Hatheway, 20 Okt 2026. Divergen cokelat ke hijau, sisi kering dari BrBG
     ColorBrewer dan sisi basah dari PiYG, netral #f5f5f5 di tengah.

     Dari sebelas paletnya yang diadu dengan data domain kita, cuma yang ini
     yang rentangnya memang pas, 9 dari 10 sel terpakai. Yang lain ujungnya
     di luar jangkauan tropis.

     Angkanya WAJIB sama dengan _HUM_SCALE di backend/pipeline/process.py,
     DAN dengan yang dipakai backend di server. Lihat catatan di dokumen
     untuk backend, sebab merekalah yang merender gambarnya. */
  humidity_surface: {
    head: "%",
    cells: [["0", "#8c510a", 1], ["10", "#bf812d", 1], ["20", "#dfc27d", 0],
            ["30", "#f6e8c3", 0], ["40", "#f5f5f5", 0], ["50", "#e6f5d0", 0],
            ["60", "#b8e186", 0], ["70", "#7fbc41", 0], ["80", "#4d9221", 1],
            ["90", "#3d741a", 1]],
  },
  // Inferno dibalik. Angkanya WAJIB sama dengan _CLOUD_SCALE di process.py.
  // Sel 0% sengaja "transparent": dirender jadi kotak-kotak catur, bukan warna,
  // supaya jelas artinya TIDAK ADA awan dan peta di bawahnya tembus.
  cloud_surface: {
    head: "%",
    cells: [["0", "transparent", 0], ["10", "#f9dc5c", 0], ["20", "#fcac1c", 0],
            ["30", "#f4802a", 0], ["40", "#e05a41", 1], ["50", "#c2415c", 1],
            ["60", "#9c3273", 1], ["70", "#75248a", 1], ["80", "#4f1e8c", 1],
            ["90", "#2e1c7d", 1], ["100", "#0f1a5e", 1]],
  },
  pressure_surface: {
    head: "hPa",
    cells: [["980", "#5e3c99", 1], ["995", "#356bc4", 1], ["1005", "#7dc8d8", 0], ["1013", "#f0f0e0", 0],
            ["1020", "#f4c060", 0], ["1030", "#e05a3a", 1]],
  },
  // CAPE & CIN pakai ANGKA MENTAH J/kg. Ambangnya persis _CAPE_SCALE / _CIN_SCALE
  // di process.py, jadi warna di legenda selalu sama dengan warna di peta.
  storm_potential: {
    head: "CAPE, J/kg",
    cells: [["500", "#2f9e7a", 0], ["1000", "#5ac86a", 0], ["1800", "#ead821", 0],
            ["2600", "#f5a91e", 0], ["3400", "#e42320", 1], ["4200", "#8a29c8", 1]],
  },
  // CIN nilainya NEGATIF. Makin minus makin tebal tutupnya, makin sulit badai
  // terbentuk walau CAPE besar. Urutan sel dibuat dari tipis ke tebal.
  cin_surface: {
    head: "CIN, J/kg",
    cells: [["-10", "#5ac86a", 0], ["-25", "#ead821", 0], ["-50", "#f5a91e", 0],
            ["-100", "#e42320", 1], ["-200", "#8a29c8", 1], ["-400", "#4a0d67", 1]],
  },
  // --- Level stratosfer 70 hPa ---
  wind_strato: {
    head: "KNOTS",
    cells: [["5", "#2b83ba", 1], ["10", "#5aa8cf", 0], ["15", "#abdda4", 0], ["20", "#66bd63", 0],
            ["25", "#d9ef8b", 0], ["34", "#fee08b", 0], ["48", "#fdae61", 0], ["64", "#f46d43", 1],
            ["80", "#d73027", 1], ["100+", "#a50026", 1]],
  },
  temp_strato: {
    head: "°C",
    cells: [["-70", "#2450b4", 1], ["-64", "#4a97dc", 1], ["-58", "#cfe4f2", 0],
            ["-52", "#ffe08a", 0], ["-46", "#fbaa4a", 0], ["-40", "#ee7233", 0]],
  },
};


// Tema per-layer: "dark" = latar peta gelap (overlay putih); "light" = latar
// terang (overlay gelap). Menentukan label/batas/partikel.
const LAYER_THEME = {
  wind_surface: "dark", rain_surface: "dark", rain_accum_surface: "dark",
  temp_surface: "dark", humidity_surface: "dark", cloud_surface: "dark", pressure_surface: "dark",
  storm_potential: "dark", cin_surface: "dark", wind_strato: "dark", temp_strato: "dark",
  cloudtop_temp: "dark", amv_angin: "dark", citra_tampak: "dark",
};

// Override warna border batas administrasi per-layer (selain default tema).
const BORDER_COLOR = {
  temp_surface: "#000000",       // batas hitam di atas heatmap suhu
  humidity_surface: "#000000",   // batas hitam di atas heatmap kelembapan
  // Tutupan awan TIDAK didaftar lagi. Dulu hijau neon #39ff14, sekarang jatuh ke
  // bawaan yaitu PUTIH di tema gelap, sama seperti parameter lain.
  pressure_surface: "#6d7787",   // batas ABU (redup) di layer tekanan → isobar jadi garis utama
  temp_strato: "#000000",        // batas hitam di atas heatmap suhu stratosfer
  /* Tiga layer anomali MJO, diminta pemilik 6 Oktober. Paletnya terang dan
     pucat di tengah rentang, dan garis batas PUTIH bawaan lenyap di atas
     kuning muda dan lavender. Hitam terbaca di seluruh pita paletnya. */
  olr_anom: "#000000",
  u850_anom: "#000000",
  u200_anom: "#000000",
};

// --- LEVEL KETINGGIAN (dropdown LEVEL) ---
// Tombol layer memakai kunci PERMUKAAN (data-layer). Saat level "strato" dipilih,
// tombol Angin & Suhu dipetakan ke varian 70 hPa; variabel lain diredupkan.
const STRATO_OF = { wind_surface: "wind_strato", temp_surface: "temp_strato" };
const BASE_OF = { wind_strato: "wind_surface", temp_strato: "temp_surface" };
// Kunci katalog sebenarnya untuk sebuah tombol pada level aktif.
function resolveLayer(base) {
  return (mapLevel === "strato" && STRATO_OF[base]) ? STRATO_OF[base] : base;
}
/* SATU SAKLAR untuk seluruh ketinggian di atas permukaan.

   Diminta user 9 Sep 2026, semua model difokuskan ke PERMUKAAN dulu. GFS
   sebenarnya PUNYA data 70 hPa dan sudah jalan, tapi kalau cuma GFS yang
   punya ketinggian kedua, pemilihnya jadi tidak seragam antar model dan
   ceritanya susah dijelaskan. Jadi dimatikan tampilannya, bukan dihapus.

   Datanya TIDAK disentuh sama sekali, wind_strato dan temp_strato tetap ada
   di server. Menyalakannya lagi cukup mengubah baris ini jadi true, tidak ada
   yang lain yang perlu diubah, dan jangan lupa mengeluarkan 70 hPa dari
   LEVEL_PAJANGAN supaya tidak muncul dua kali. */
const LEVEL_ATAS_HIDUP = false;

// Apakah data stratosfer ada di katalog (kalau belum diregen, dropdown tetap mati).
function stratoAvailable() {
  return LEVEL_ATAS_HIDUP
      && !!(catalog && catalog.layers && (catalog.layers.wind_strato || catalog.layers.temp_strato));
}

// Redupkan tombol yang tak tersedia di level aktif (di strato: hanya Angin & Suhu).
//
// SATELIT lain perlakuannya. Dia cuma punya satu dua parameter, dan sebelas
// tombol redup berjajar di sebelah satu tombol hidup itu terbaca seperti
// aplikasinya rusak, bukan seperti sumber yang memang isinya sedikit. Jadi
// untuk satelit yang tidak ada datanya DISEMBUNYIKAN, bukan diredupkan.
// Model tetap diredupkan seperti dulu, sebab di model ketidakhadiran satu
// parameter itu kabar, bukan sifat sumbernya.
function applyLevelUI() {
  const strato = mapLevel === "strato";
  // Penjagaan `catalog` WAJIB. Fungsi ini juga dipanggil sebelum katalog
  // mendarat, dan tanpa penjagaan itu SELURUH tombol dianggap tak berdata
  // lalu disembunyikan, termasuk yang sebentar lagi terbukti ada.
  const satelit = !!(MODEL && MODEL.satelit) && !!catalog;
  document.querySelectorAll(".layer-btn[data-layer]").forEach((b) => {
    const base = b.dataset.layer;
    const has = catalog && catalog.layers[resolveLayer(base)];
    const enabled = strato ? (!!STRATO_OF[base] && !!has) : !!has;
    // Tombol yang KHUSUS milik satu sumber disembunyikan di sumber lain,
    // bukan diredupkan. Suhu puncak awan tidak akan pernah ada di GFS, dan
    // memajangnya dalam keadaan redup cuma menjanjikan sesuatu yang tidak
    // pernah datang.
    const khusus = b.dataset.khusus;
    b.classList.toggle("disabled", !enabled);
    b.classList.toggle("sembunyi", (!!khusus && khusus !== MODEL_ID) || (satelit && !enabled));
  });
  // Pilihan level ikut hilang di satelit. Citra kanal 13 itu satu bidang,
  // tidak ada permukaan dan tidak ada stratosfer.
  document.querySelectorAll(".level-bar, .panel.selects .field--level").forEach((n) => {
    n.classList.toggle("sembunyi", satelit);
  });
}

// Samakan tampilan kontrol level: dropdown desktop + tombol level HP.
function syncLevelControls() {
  const sel = $("level-select"); if (sel) sel.value = mapLevel;
  document.querySelectorAll(".level-btn[data-level]").forEach((b) =>
    b.classList.toggle("active", b.dataset.level === mapLevel));
}

// Ganti level (dari dropdown, tombol HP, atau restore hash). Pindah ke Angin bila
// layer aktif tak punya versi di level tujuan.
function setLevel(lv) {
  if (lv === mapLevel || !catalog) return;
  mapLevel = lv;
  applyLevelUI();
  let base = activeBase;
  if (mapLevel === "strato" && !STRATO_OF[base]) base = "wind_surface";
  activeBase = base;
  setActiveLayer(resolveLayer(base));
  syncLevelControls();
}

// Hidupkan pemilih LEVEL (dropdown desktop + tombol HP) bila data strato tersedia.
// ================= GERBANG SANDI MODEL WRF =================
// PERINGATAN JUJUR: ini berjalan di browser, jadi TIDAK mengamankan apa pun.
// Sandinya ada di berkas ini dan bisa dibaca siapa saja lewat view-source, dan
// berkas datanya di /backend/atmosight/data/output/wrf/ tetap bisa diambil langsung tanpa
// melewati halaman ini. Fungsinya cuma penghalang sopan supaya model ini tidak
// terbuka begitu saja bagi yang sekadar lewat. Kalau datanya benar benar harus
// dibatasi, satu satunya cara adalah tidak menerbitkannya di Pages publik.
const WRF_SANDI = "envi123!";
const WRF_KUNCI = "kertas-cuaca:wrf-tiket";

// Sandinya TIDAK diingat. Tiap muat ulang, dan tiap balik lagi dari GFS ke WRF,
// harus diketik lagi. Permintaan user.
//
// Masalahnya, membuka WRF itu MEMUAT ULANG halaman (?model=wrf), jadi kalau
// sama sekali tak ada yang disimpan, sandi yang barusan benar akan langsung
// ditanya lagi begitu halaman baru terbuka. Jadi dipakai TIKET SEKALI PAKAI:
// ditulis tepat sebelum pindah, lalu DIHAPUS saat dibaca. Sekali dipakai habis.
// Akibatnya F5 menanyakan lagi, dan pulang pergi GFS-WRF juga menanyakan lagi,
// persis yang diminta.
function ambilTiket() {
  try {
    const ada = sessionStorage.getItem(WRF_KUNCI) === "1";
    sessionStorage.removeItem(WRF_KUNCI);   // sekali pakai, langsung hangus
    return ada;
  } catch { return false; }
}
function tulisTiket() {
  try { sessionStorage.setItem(WRF_KUNCI, "1"); } catch { /* mode privat, abaikan */ }
}

// Tampilkan modal, kembalikan janji true kalau sandinya benar.
function mintaSandi(label) {
  return new Promise((selesai) => {
    const ov = $("pw-overlay"), inp = $("pw-input"), err = $("pw-err");
    if (!ov || !inp) { selesai(false); return; }
    const judul = $("pw-title");
    if (judul && label) judul.textContent = "Buka " + label;
    ov.classList.add("show");
    inp.value = "";
    err.hidden = true;
    setTimeout(() => inp.focus(), 50);

    const tutup = (hasil) => {
      ov.classList.remove("show");
      $("pw-ok").removeEventListener("click", onOk);
      $("pw-cancel").removeEventListener("click", onBatal);
      inp.removeEventListener("keydown", onTombol);
      ov.removeEventListener("click", onLatar);
      selesai(hasil);
    };
    const onOk = () => {
      if (inp.value === WRF_SANDI) { tutup(true); }
      else { err.hidden = false; inp.select(); }
    };
    const onBatal = () => tutup(false);
    const onTombol = (e) => {
      if (e.key === "Enter") onOk();
      else if (e.key === "Escape") onBatal();
      else err.hidden = true;
    };
    const onLatar = (e) => { if (e.target === ov) onBatal(); };

    $("pw-ok").addEventListener("click", onOk);
    $("pw-cancel").addEventListener("click", onBatal);
    inp.addEventListener("keydown", onTombol);
    ov.addEventListener("click", onLatar);
  });
}

/* ================= KETERANGAN UJI COBA, MODEL PRIVAT =================

   Diminta pemilik atas saran rekan tim, dan alasannya kuat. Model ini
   dijalankan dengan satu konfigurasi dan parameterisasi yang sama untuk
   seluruh Indonesia, tanpa penyetelan per wilayah, jadi ada wilayah yang
   hasilnya bisa meleset. Pembaca berhak tahu itu sebelum memakai angkanya,
   terutama kalau prakiraannya nanti ternyata salah.

   Muncul SEKALI TIAP SESI, bukan tiap pindah halaman, dan cuma di model
   privat. Model global tidak diberi keterangan ini, dia produk yang sudah
   dipakai luas dan memberinya peringatan yang sama malah mengaburkan maksud
   peringatannya.

   Penandanya TIDAK hilang sesudah ditutup. Tombol tanda seru di samping
   tombol layar penuh tetap ada selama model privat terbuka, dan dia membuka
   kartu ini lagi kapan saja. */
function pasangUji() {
  const ov = $("uji-overlay");
  if (!ov || ov.dataset.siap) return;          // sekali saja, jangan menumpuk
  ov.dataset.siap = "1";
  const tutup = () => ov.classList.remove("show");
  const buka  = () => ov.classList.add("show");
  const x = $("uji-close"), ok = $("uji-ok"), tombol = $("uji-btn");
  if (x) x.addEventListener("click", tutup);
  if (ok) ok.addEventListener("click", tutup);
  if (tombol) tombol.addEventListener("click", buka);
  ov.addEventListener("click", (e) => { if (e.target === ov) tutup(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && ov.classList.contains("show")) tutup();
  });
}

/* TIAP KALI MASUK, bukan sekali per sesi.

   Versi lama menyimpan penanda di sessionStorage, jadi kartunya cuma muncul
   di kunjungan pertama. Masalahnya SANDINYA TIDAK BEGITU. Tiketnya sekali
   pakai dan langsung hangus, jadi pindah ke model lain lalu balik lagi
   tetap diminta sandi. Hasilnya mulai kunjungan kedua orang mengetik sandi
   lalu tidak ada apa apa yang muncul, dan itu terbaca seperti kartunya
   rusak. Dilaporkan pemilik.

   Sekarang dua duanya seirama, sandi diminta tiap masuk dan keterangannya
   ikut muncul tiap masuk. Menutupnya tetap satu klik, dan tombol tanda seru
   di samping tombol layar penuh membukanya lagi kapan saja. */
function ujiTiapMasuk() {
  // Satelit TIDAK dapat keterangan ini. Dia pengamatan, tidak punya
  // parameterisasi yang bisa meleset, jadi peringatannya tidak berlaku.
  if (!MODEL || !MODEL.privat) return;
  // Kelas yang sama juga dipasang terapkanFiturModel, tapi itu jalan jauh
  // lebih belakangan. Dipasang di sini juga supaya tombol tanda serunya
  // sudah ada begitu kartunya muncul, bukan menyusul beberapa detik.
  document.body.classList.add("model-private");
  const ov = $("uji-overlay");
  if (ov) ov.classList.add("show");
}

/* Angka resolusi model diambil dari katalog, bukan dipatok di kode.
   Backend mengubah grid WRF dari 9 km jadi 12 km tanpa mengganti nama folder,
   dan angka barunya mereka kirim di catalog.model_label. Yang diambil di sini
   CUMA angka kilometernya. Nama produknya tetap punya kita, sebab model_label
   mereka memakai nama internal backend yang tidak dipakai di situs ini. */
function samakanResolusi(cat) {
  const m = /(\d+(?:[.,]\d+)?)\s*km/i.exec((cat && cat.model_label) || "");
  if (!m || !MODEL) return;
  const baru = MODEL.label.replace(/\d+(?:[.,]\d+)?\s*km/i, m[1] + " km");
  if (baru === MODEL.label) return;
  MODEL.label = baru;
  const sel = $("model-select");
  const opt = sel && Array.from(sel.options).find((o) => o.value === MODEL_ID);
  if (opt) opt.textContent = baru;
}

// Dropdown MODEL. Dulu dekoratif satu opsi, sekarang benar benar memindah sumber
// data. Pindah model = muat ulang halaman dengan ?model=..., alasannya ada di
// komentar MODELS di atas.
function setupModelSelect() {
  const sel = $("model-select");
  if (!sel) return;
  sel.innerHTML = "";
  const hidup = Object.entries(MODELS).filter(([id]) => modelHidup(id));
  for (const [id, m] of hidup) {
    const o = document.createElement("option");
    o.value = id;
    o.textContent = m.label;
    sel.appendChild(o);
  }
  // Model pajangan ditempel di ekor, mati dan tak bisa dipilih.
  for (const m of MODEL_PAJANGAN) {
    const o = document.createElement("option");
    o.textContent = m.label;
    o.disabled = true;
    sel.appendChild(o);
  }
  sel.value = MODEL_ID;
  // Dropdown disembunyikan HANYA kalau isinya betul betul cuma satu baris.
  // Yang dihitung isi seluruh dropdown, bukan cuma yang hidup, sebab model
  // pajangan pun tetap perlu kelihatan. Yang disembunyikan HARUS seluruh
  // .field, bukan cuma .select-wrap, sebab label "MODEL" ada di luar
  // select-wrap dan kalau salah sasaran dia nongol sendirian tanpa kotak
  // pilihan di bawahnya.
  if (hidup.length + MODEL_PAJANGAN.length < 2) {
    (sel.closest(".field") || sel.closest(".select-wrap") || sel).style.display = "none";
    return;
  }
  // Pindah model cuma boleh ke yang hidup. Option pajangan sudah disabled,
  // tapi penjagaan di bawah tetap diperlukan buat jalur lain.
  sel.addEventListener("change", async () => {
    const id = sel.value;
    if (id === MODEL_ID) return;
    if (MODELS[id] && MODELS[id].privat) {
      const boleh = await mintaSandi(MODELS[id].label);
      if (!boleh) { sel.value = MODEL_ID; return; }   // batal, kembalikan pilihan
      tulisTiket();                                   // tiket sekali pakai
    }
    // Hash (layer, waktu, titik) sengaja DIBUANG. Layer & waktu model lama
    // belum tentu ada di model baru, dan restore yang gagal separuh lebih
    // membingungkan daripada mulai bersih.
    location.href = location.pathname + (id === "gfs" ? "" : "?model=" + id);
  });
}

// Fitur tambahan dinyalakan MENGIKUTI BERKAS YANG ADA di folder model.
//
// Dulu WRF 9 km dipatok tanpa siklon, ITCZ, dan Skew-T, jadi walau server
// mengirim berkasnya fiturnya tetap tersembunyi. Sejak 10 Sep 2026 tiap berkas
// dicek dulu, dan tombolnya muncul cuma kalau berkasnya menjawab. Server cukup
// mengirim berkas ke folder model, frontend tidak perlu disunting lagi.
//
// Isobar tidak ada di daftar ini sebab dia muncul sendiri di layer Tekanan dan
// loadIsobars() sudah berjaga terhadap 404.
const FITUR_BERKAS = [
  ["cyclone-toggle", "cyclones.json"],
  ["itcz-toggle", "itcz.json"],
  ["mon-toggle", "monsoon.json"],
];
async function berkasAdaDi(base, nama) {
  try {
    const r = await fetchUlang(base + nama, { method: "HEAD", cache: "no-store" });
    return r.ok;
  } catch (e) {
    return false;
  }
}
async function berkasAda(nama) { return berkasAdaDi(DATA_BASE, nama); }
function terapkanFiturModel() {
  /* Tombol Skew-T disetel DULUAN, sebelum cabang PUNYA_EKSTRA di bawah.
     Markupnya lahir hidden, dan model berekstra seperti GFS keluar lebih awal
     dari fungsi ini sehingga tidak pernah sampai ke pemeriksaan berkas di
     bawah. Akibatnya tombolnya tidak pernah muncul di model yang justru
     paling pasti punya Skew-T. Sempat terjadi. */
  var tbSkt = $("skewt-toggle");
  if (tbSkt) tbSkt.hidden = !SKEWT_ADA;
  /* MJO disetel di sini juga, sebelum cabang PUNYA_EKSTRA, dengan sebab yang
     persis sama seperti Skew-T di atas. Yang disembunyikan PEMBUNGKUSNYA,
     sebab tombol ini duduk di .fit-wrap bersama banernya dan pembungkus kosong
     tetap memakan satu celah flex 18 px. */
  var tbMjo = $("mjo-toggle");
  if (tbMjo) {
    var wMjo = tbMjo.closest(".fit-wrap") || tbMjo;
    wMjo.style.display = "none";
    (async function () {
      if (await berkasAda("mjo.json")) { wMjo.style.display = ""; return; }
      /* FOLDER MODEL GLOBAL juga dihitung, sejak 13 Oktober 2026. RMM itu
         indeks global dan zona MJO di peta cuma pita bujur, dua duanya
         berlaku di atas domain mana pun. Sebelumnya tombol MJO hilang sama
         sekali di WRF padahal panel titiknya sudah menampilkan oktagonnya,
         dan pemilik menanyakannya. Asalnya ditandai pita "Basis GFS" di
         pojok kotak ini, lihat pasangPitaGlobal(). */
      if (MODEL_ID !== MODEL_GLOBAL && await berkasAdaDi(basisGlobal(), "mjo.json")) {
        wMjo.style.display = ""; return;
      }
      /* Tanpa mjo.json, fitur ini cuma masuk akal kalau profil modelnya LEBAR.
         Selubung MJO sendiri lebarnya 30 sampai 40 derajat bujur, jadi di
         domain seukuran Indonesia saja amplopnya pasti menyentuh kedua tepi
         dan angkanya tidak berarti apa apa. */
      try {
        var m = await fetch(DATA_BASE + "profile_meta.json").then(function (r) { return r.ok ? r.json() : null; });
        if (m && m.bounds && (m.bounds[2] - m.bounds[0]) >= MJO_LEBAR_MIN) wMjo.style.display = "";
      } catch (e) { /* tetap tersembunyi */ }
    })();
  }
  /* AUSMI disetel di sini juga, sebelum cabang PUNYA_EKSTRA, dengan sebab
     yang sama seperti MJO dan Skew-T di atas. Bedanya dia TIDAK punya jalur
     cadangan dari profil. MJO masih bisa menghitung amplop lembap sendiri
     kalau indeksnya belum dikirim, AUSMI tidak, sebab tanpa klimatologi
     angkanya tidak bisa disebut di atas atau di bawah normal dan tanpa
     riwayat tidak ada yang bisa digambar. Jadi tombolnya ada kalau
     berkasnya ada, titik. */
  var tbAu = $("ausmi-toggle");
  if (tbAu) {
    var wAu = tbAu.closest(".fit-wrap") || tbAu;
    wAu.style.display = "none";
    /* Lewat cariAusmi, BUKAN berkasAda. berkasAda cuma melihat sumber yang
       sedang dipakai, dan selama ausmi.json belum ada di cirrus tombolnya
       tidak akan pernah muncul walau cadangan sudah memuatnya. */
    cariAusmi().then(function (base) { if (base) wAu.style.display = ""; });
  }
  if (PUNYA_EKSTRA) return;
  // Sembunyikan dulu semuanya, baru dimunculkan satu satu yang berkasnya ada.
  // Urutannya begini supaya tombol tidak sempat terlihat lalu hilang lagi.
  /* Yang disembunyikan PEMBUNGKUSNYA, bukan tombolnya. Sejak 4 Oktober 2026
     tiap tombol fitur duduk di dalam .fit-wrap bersama keterangannya, dan
     daftar fitur itu flex bercelah 18 px. Menyembunyikan tombolnya saja
     meninggalkan pembungkus kosong yang tetap memakan satu celah, jadi ada
     lubang di tengah daftar tanpa isi. */
  const bungkus = (id) => $(id)?.closest(".fit-wrap, .city-wrap, .phenom-wrap") || $(id);
  FITUR_BERKAS.forEach(([id]) => {
    const el = bungkus(id);
    if (el) el.style.display = "none";
  });
  FITUR_BERKAS.forEach(([id, berkas]) => {
    berkasAda(berkas).then((ada) => {
      const el = bungkus(id);
      if (ada && el) el.style.display = "";
    });
  });
  berkasAda("profile_meta.json").then((ada) => {
    SKEWT_ADA = ada;
    /* Tombolnya disembunyikan, bukan dimatikan. Tombol mati yang tetap
       terlihat mengundang orang mengkliknya lalu kecewa, sedangkan model
       yang tidak punya profile_meta.json memang tidak akan pernah punya
       Skew-T selama pipeline-nya belum mengirimkannya. */
    var tb = $("skewt-toggle"); if (tb) tb.hidden = !ada;
  });
  document.querySelector(".level-bar")?.style.setProperty("display", "none", "important");
  const lv = $("level-select");
  if (lv) lv.closest(".field")?.style.setProperty("display", "none");
  document.body.classList.add("model-wrf");
  if (MODEL_ID === "wrf9") document.body.classList.add("model-private");
}

/* KETINGGIAN PAJANGAN. Dipamerkan supaya rencananya kelihatan, tapi MATI dan
   tidak bisa dipilih. Tidak ada datanya, tidak ada pipeline, dan situs ini
   memang belum bisa membacanya kalaupun dikirim.

   Polanya sama persis dengan MODEL_PAJANGAN di Smokewatch, dan alasannya juga
   sama. Orang jadi tahu ini bukan aplikasi yang cuma punya satu ketinggian,
   dan kami tidak perlu menjanjikan apa apa lewat kalimat.

   Urutannya menurut KETINGGIAN, bukan menurut angka tekanan, jadi makin ke
   bawah daftar makin tinggi tempatnya di atmosfer. Angka tekanan justru
   mengecil ke arah sana, dan daftar yang diurutkan menurut angka akan terbaca
   terbalik oleh orang yang terbiasa membaca peta udara atas. */
const LEVEL_PAJANGAN = [
  { label: "900 hPa" },
  { label: "700 hPa" },
  { label: "500 hPa" },
  { label: "200 hPa" },
  /* 70 hPa DATANYA SUDAH ADA di GFS, tapi ikut dipajang sampai seluruh model
     punya ketinggian. Lihat LEVEL_ATAS_HIDUP. */
  { label: "70 hPa" },
];

function setupLevelSelect() {
  const sel = $("level-select");
  const bar = document.querySelector(".level-bar");
  const adaStrato = stratoAvailable();

  if (sel) {
    /* Dropdown SELALU hidup sekarang, bukan cuma waktu data strato ada.
       Isinya minimal Permukaan plus daftar pajangan, dan itu sudah cukup
       jadi alasan dropdown-nya ditampilkan. */
    sel.disabled = false;
    sel.innerHTML =
      '<option value="surface">Permukaan</option>'
      + (adaStrato ? '<option value="strato">Stratosfer, 70 hPa</option>' : "")
      + LEVEL_PAJANGAN.map((l) =>
          `<option disabled>${l.label}</option>`).join("");
    sel.value = mapLevel;
    sel.addEventListener("change", () => setLevel(sel.value));
  }

  /* HP: bilah tombol level. Yang di sini CUMA ketinggian yang benar benar
     ada, pajangan tidak ikut. Bilahnya sempit dan tombol mati di layar
     sekecil itu lebih terbaca sebagai rusak daripada sebagai rencana.
     Kalau strato belum ada, tidak ada yang bisa dipilih, jadi bilahnya
     disembunyikan seperti sebelumnya. */
  if (bar) bar.style.display = adaStrato ? "" : "none";
  document.querySelectorAll(".level-btn[data-level]").forEach((b) =>
    b.addEventListener("click", () => setLevel(b.dataset.level)));
  $("level-toggle")?.addEventListener("click", () =>
    document.querySelector(".level-bar")?.classList.toggle("level-open"));
  syncLevelControls();
}

// Layer dengan data HARIAN (1 frame/hari; slider = tanggal saja, tanpa jam).
//
// Dulu ini daftar mati berisi rain_accum_surface. Itu benar untuk GFS, yang
// mengirim satu frame akumulasi per hari, tapi SALAH untuk WRF meteo. Sejak
// 12 September 2026 WRF mengirim akumulasi 24 jam BERGULIR tiap jam, 67 frame,
// dan slidernya jadi menulis tanggal yang sama berjam jam tanpa jam sama
// sekali. Sekarang harian atau tidak diputuskan dari jarak antar frame di
// katalognya sendiri, jadi model mana pun terbaca benar tanpa menyunting kode.
const HARIAN_CADANGAN = new Set(["rain_accum_surface"]);   // dipakai kalau framenya < 2
const _harianCache = new Map();
function layerHarian(key) {
  if (!key) return false;
  /* PENGAMATAN TIDAK PERNAH DIHITUNG HARIAN, walau jarak bingkainya 24 jam.
     Sejak 19 Oktober 2026 satelit mengirim satu bingkai per hari di jam
     11:00 WIB, dan tanpa penjagaan ini labelnya jatuh ke tanggal saja.
     Itu salah arti. Akumulasi hujan memang nilai sepanjang hari, jadi
     tanggal saja betul, tapi citra satelit itu POTRET SESAAT di jam
     tertentu, dan jamnya justru keterangan yang paling penting. */
  if (catalog && catalog.observasi) return false;
  if (_harianCache.has(key)) return _harianCache.get(key);
  const L = catalog && catalog.layers && catalog.layers[key];
  const fr = L && L.frames;
  let hasil;
  if (!fr || fr.length < 2) {
    hasil = HARIAN_CADANGAN.has(key);
  } else {
    // Rata rata seluruh rentang, bukan selisih dua frame pertama. Jarak frame
    // tidak selalu rata di ujung, dan rata rata tak bisa tertipu satu lubang.
    const jam = (Date.parse(fr[fr.length - 1].valid_time) - Date.parse(fr[0].valid_time))
                / 3600000 / (fr.length - 1);
    hasil = jam >= 20;
  }
  _harianCache.set(key, hasil);
  return hasil;
}

// Ibukota provinsi (nama persis di id_places.json) — TIER 0: ikon kondisi selalu
// tampil bahkan saat zoom-out penuh. Jakarta diwakili Jakarta Pusat saja.
const PROV_CAPITALS = new Set([
  "Kota Banda Aceh", "Kota Medan", "Kota Padang", "Kota Pekanbaru", "Kota Jambi",
  "Kota Palembang", "Kota Pangkal Pinang", "Kota Bengkulu", "Kota Bandar Lampung",
  "Kota Serang", "Kota Administrasi Jakarta Pusat", "Kota Bandung", "Kota Semarang",
  "Kota Yogyakarta", "Kota Surabaya", "Kota Denpasar", "Kota Mataram", "Kota Kupang",
  "Kota Pontianak", "Kota Palangka Raya", "Kota Banjarmasin", "Kota Samarinda",
  "Kabupaten Bulungan", "Kota Manado", "Kota Palu", "Kota Makassar", "Kota Kendari",
  "Kota Gorontalo", "Kabupaten Mamuju", "Kota Ambon", "Kota Ternate",
  "Kota Tidore Kepulauan", "Kota Jayapura", "Kabupaten Manokwari", "Kota Sorong",
]);

// ---- Peta dasar (gelap, ala screenshot) --------------------------------
const map = L.map("map", {
  center: [5, 116],
  zoom: 4,
  minZoom: 3,
  maxZoom: 9,
  zoomSnap: 0,             // izinkan zoom pecahan → bingkai bisa pas mengisi layar
  zoomControl: false,      // pakai tombol zoom neubrutalist sendiri
  attributionControl: false, // kredit ditaruh di footer sidebar
  maxBoundsViscosity: 1.0, // dinding keras: tak bisa geser keluar kotak
  preferCanvas: true,      // render vektor (batas) via Canvas: hanya yang masuk frame
  wheelPxPerZoomLevel: 120,// scroll-zoom lebih landai → terasa lebih mulus
  wheelDebounceTime: 30,
});

/* Peta yang disematkan tidak boleh digeser atau di-zoom. Tudung tautan di
   landing sudah menadah klik, tapi ini lapis kedua yang penting: tanpa dia,
   roda tetikus yang kebetulan lewat di atas kartu bisa men-zoom peta alih
   alih menggulung halaman, dan pengunjung terjebak di dalam kartu. */
if (EMBED) {
  ["dragging", "scrollWheelZoom", "doubleClickZoom", "touchZoom", "boxZoom", "keyboard", "tap"]
    .forEach((k) => { if (map[k] && map[k].disable) map[k].disable(); });
}

// Kotak inti yang WAJIB selalu tampak penuh: India–Pasifik Barat, Cina Selatan–
// tengah Australia. Bingkai tampilan diturunkan dari kotak ini, diperlebar
// mengikuti rasio layar. Domain DATA (dari catalog) lebih luas dari kotak ini di
// tiap sisi → tepi data tak pernah terlihat.
// Kotak inti tampilan awal. Default = domain GFS. Model lain boleh membawa
// kotaknya sendiri lewat catalog.region.view_core, jadi WRF membingkai Jawa
// bukan seluruh Asia Tenggara. Diganti di init() setelah katalog terbaca.
let VIEW_CORE = L.latLngBounds([-28, 68], [28, 174]);

// dark_NOLABELS, bukan dark_all. Alas sudah punya lapisan label sendiri di pane
// "labels"; kalau alasnya juga membawa nama, namanya muncul dua kali di tempat yang
// datanya transparan (mis. hujan saat kering).
// Basemap Esri World Dark Gray (GRATIS, tanpa API key). CARTO menghentikan akses
// tanpa-key (tile bertempel watermark "API key required"), jadi pindah ke Esri.
/* ALAS CITRA untuk sumber SATELIT, diminta pemilik.

   Yang ditayangkan sumber ini memang citra satelit, jadi alas kartografi
   abu abu terasa salah tempat di bawahnya. Esri World Imagery dipakai
   sebab dia sekeluarga dengan alas yang sudah ada, tanpa kunci API, dan
   pola ubinnya sama persis.

   Label tidak ikut berubah. Lapisan nama tempat berdiri di pane sendiri
   dan yang dipakai di tema gelap sudah yang bertulisan putih berhalo,
   jadi dia tetap terbaca di atas citra. */
const ATAS_SATELIT_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const PAKAI_CITRA = !!(MODEL && MODEL.satelit);
L.tileLayer(PAKAI_CITRA ? ATAS_SATELIT_URL
    : "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}", {
  attribution: PAKAI_CITRA
    ? 'Tiles &copy; Esri, Maxar, Earthstar Geographics | Data: Himawari-9 (NOAA)'
    : 'Tiles &copy; Esri | Data: NOAA GFS',
  // Dinaikkan dari 12 jadi 16. Zoom-in maksimum peta sekarang ikut kerapatan
  // grid model dan bisa lewat 12, dan kalau alasnya berhenti duluan yang
  // kelihatan cuma latar hitam polos. Esri World Dark Gray native sampai 16.
  maxZoom: 16, maxNativeZoom: 16,
  updateWhenZooming: false, // tunda muat tile sampai zoom selesai → animasi mulus
  keepBuffer: 4,
  /* Citra aslinya terlalu ramai untuk jadi alas. Hijau daratan dan biru
     lautnya langsung bersaing dengan panah lime dan panah biru di atasnya,
     dan panah lapisan rendah nyaris hilang di atas laut. Diredupkan lewat
     kelas, bukan lewat opacity, sebab opacity akan ikut memudarkan nama
     tempat yang digambar lapisan lain. */
  className: PAKAI_CITRA ? "alas-citra" : "",
}).addTo(map);

/* ---------------------------------------------------------------------
   ZOOM-IN MAKSIMUM IKUT KERAPATAN GRID MODEL

   Dulu batasnya dipatok 9 untuk semua model. Akibatnya model beresolusi halus
   berhenti sedalam model kasar, dan detail yang sudah ada di datanya tak
   pernah bisa dilihat.

   Sekarang batasnya dihitung dari jarak antar sel. Zoom paling dalam adalah
   saat satu sel data selebar satu ubin peta, 256 piksel. Lebih dalam dari itu
   yang bertambah cuma bluran, bukan detail.

   Lebar satu sel dalam piksel = dx * 256 * 2^z / 360, jadi
   z = log2(PX_PER_SEL * 360 / (256 * dx)).
   --------------------------------------------------------------------- */
const PX_PER_SEL = 256;     // satu sel data = selebar satu ubin peta
const ZOOM_MAKS_BAWAH = 9;  // jangan pernah lebih dangkal dari batas lama
const ZOOM_MAKS_ATAS = 13;  // jangan lewat kemampuan alas Esri (native 16)

function zoomMaksGrid(dxDeg) {
  if (!(dxDeg > 0)) return ZOOM_MAKS_BAWAH;
  const z = Math.log2((PX_PER_SEL * 360) / (256 * dxDeg));
  return Math.max(ZOOM_MAKS_BAWAH, Math.min(ZOOM_MAKS_ATAS, Math.round(z * 10) / 10));
}

/* Jarak antar sel dalam derajat, dibaca dari katalog. `image_bounds` itu
   `bounds` yang diperlebar SETENGAH sel di tiap sisi, sebab pratinjau berisi
   blok sel penuh sedangkan bounds cuma pusat sel. Jadi selisih tepinya sama
   dengan setengah jarak antar sel. Katalog yang tak mengirim image_bounds
   mengembalikan null, dan pemanggil memakai angka cadangan di MODELS. */
function jarakSelDerajat(region) {
  if (!region || !region.image_bounds || !region.bounds) return null;
  const d = Math.abs(region.bounds[0] - region.image_bounds[0]) * 2;
  return d > 0 ? d : null;
}

// Pane heatmap kecepatan angin: di atas peta dasar (z200), di bawah partikel
// (overlayPane z400) & label (z650). Ini "kontur warna" ala BMKG Signature.
const speedPane = map.createPane("speed");
speedPane.style.zIndex = 350;
speedPane.style.pointerEvents = "none";

/* ALAS SATELIT. Satu tingkat DI BAWAH pane speed, jadi dia benar benar
   jadi latar dan panah anginnya duduk di atasnya.

   Ini pasangan untuk pola yang sudah dipakai layer angin GFS, tempat
   heatmap kecepatan jadi alas dan partikel velocity.js menari di atasnya.
   Di satelit, alasnya suhu puncak awan dan "partikelnya" panah AMV yang
   sudah digambar server. Tanpa alas, layer AMV cuma panah
   melayang di atas peta hitam, dan panah tanpa awan itu kehilangan
   separuh ceritanya, sebab angin ini memang DIUKUR dari gerak awan. */
const satAtasPane = map.createPane("satatas");
// 360, tepat DI ATAS pane kecepatan yang 350. Dulu 340, di bawahnya,
// sebab dulu yang ditumpangkan citra awan di bawah panah. Sejak panah
// AMV dilebur jadi bagian Brightness Temperature, yang ditumpangkan
// justru panahnya, jadi dia harus di atas.
satAtasPane.style.zIndex = 360;
satAtasPane.style.pointerEvents = "none";

// Pane batas administrasi (garis negara & provinsi): di atas partikel
// (overlayPane z400), di bawah label (z650).
const adminPane = map.createPane("admin");
adminPane.style.zIndex = 450;
adminPane.style.pointerEvents = "none";

// Label negara/laut di atas partikel supaya tetap terbaca
const labelPane = map.createPane("labels");
labelPane.style.zIndex = 650;
labelPane.style.pointerEvents = "none";
// Pane ikon kondisi cuaca per kota — di atas label, TETAP bisa diklik.
const cityPane = map.createPane("cityicons");
cityPane.style.zIndex = 660;
// Siklon: jalur (garis, non-interaktif) di bawah, ikon pusat (klik) di atas.
// Pos hujan WRF: penanda TETAP, selalu tampil selama model WRF dipilih.
// z 670, di ATAS label kota/kabupaten beserta nilainya (pane cityicons z660)
// dan di atas label negara/laut (pane labels z650). Pos ini titik acuan
// akurasi, jadi tak boleh ketutup nama kota.
const posPane = map.createPane("poshujan");
posPane.style.zIndex = 670;
// Tooltip pos hujan punya pane SENDIRI di z690. Kalau memakai tooltipPane
// bawaan Leaflet (z650) ia kalah dari label kota/kabupaten (z660) dan
// tertutup separuh. Harus di atas label kota DAN di atas ikon posnya sendiri.
const posTipPane = map.createPane("poshujan-tip");
posTipPane.style.zIndex = 690;
posTipPane.style.pointerEvents = "none";
const cyclonePathPane = map.createPane("cyclonepath");
cyclonePathPane.style.zIndex = 655;
cyclonePathPane.style.pointerEvents = "none";
const cyclonePane = map.createPane("cyclones");
cyclonePane.style.zIndex = 664;
// ITCZ: pita zona + garis sumbu, konteks latar (non-interaktif, klik tembus ke peta).
const itczPane = map.createPane("itcz");
itczPane.style.zIndex = 459;
itczPane.style.pointerEvents = "none";

/* MJO: pita bujur, latar paling bawah di antara lapisan fitur. zIndex 448
   SENGAJA di bawah pane admin (450) supaya garis batas provinsi tetap tajam
   di atasnya. Pita ini menutupi seperempat layar, jadi dia harus berperilaku
   sebagai latar, bukan sebagai isi. */
const mjoPane = map.createPane("mjo");
mjoPane.style.zIndex = 448;
mjoPane.style.pointerEvents = "none";

/* TULISAN zona MJO punya PANE SENDIRI di atas label peta. Pane mjo yang 448
   ada di bawah pane label yang 650, jadi nama negara dan laut menimpa nomor
   fase sampai hilang. Sempat terjadi.
   Yang naik CUMA tulisannya. Bidang zona tetap di pane bawah, sebab dia
   memang latar dan tidak boleh menutupi nama tempat. */
const mjoKepalaPane = map.createPane("mjokepala");
mjoKepalaPane.style.zIndex = 656;
mjoKepalaPane.style.pointerEvents = "none";
// Isobar: garis kontur tekanan + penanda H/L (otomatis di layer Tekanan).
const isobarPane = map.createPane("isobar");
isobarPane.style.zIndex = 461;
isobarPane.style.pointerEvents = "none";
// Dua set label: GELAP (teks terang, utk tema gelap/angin) & TERANG (teks gelap,
// utk tema terang/hujan). Ditukar oleh applyTheme() sesuai layer aktif.
const _lblOpts = { pane: "labels", maxNativeZoom: 16, updateWhenZooming: false, keepBuffer: 4 };
const darkLabels = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}", _lblOpts).addTo(map);
const lightLabels = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}", _lblOpts);

// ---- State -------------------------------------------------------------
let frames = [];
let current = 0;
let velocityLayer = null;
/* Penanda urutan permintaan medan angin. Sejak partikel angin TIDAK LAGI
   ditunggu sebelum peta tampil, dua permintaan bisa berjalan bersamaan waktu
   slider digeser cepat. Tanpa penanda ini, yang datang belakangan belum tentu
   yang paling baru, dan partikel frame lama bisa menimpa frame yang sedang
   tampil. Tiap permintaan mengambil nomor, dan hasilnya dibuang kalau nomornya
   sudah bukan yang terakhir. */
let velSeq = 0;
let speedLayer = null;      // heatmap (imageOverlay preview PNG) — dipakai kedua layer
/* Layer yang dipakai sebagai ALAS waktu layer di kirinya sedang aktif.
   Cuma berlaku untuk sumber satelit. Lihat komentar pane "satatas". */
const ATAS_SATELIT = { cloudtop_temp: "amv_angin", citra_tampak: "amv_angin" };
let satAtasLayer = null;
// Jarak antar langkah waktu, dalam JAM. GFS 3 jam, WRF 9 km 1 jam.
// Dipakai untuk mengubah laju hujan (mm/jam) jadi akumulasi. Dulu dipatok 3
// dan itu benar selama cuma ada GFS; begitu WRF masuk, patokan itu melebihkan
// akumulasi tepat 3 kali. Dihitung ulang dari deret waktu yang sebenarnya.
let STEP_JAM = 3;
function hitungStepJam(times) {
  if (!times || times.length < 2) return;
  const a = new Date(times[0]).getTime(), b = new Date(times[1]).getTime();
  const j = Math.round((b - a) / 3600000);
  if (j > 0 && j <= 24) STEP_JAM = j;
}

let dataBounds = null;      // L.latLngBounds domain data (pusat sel; utk klik & geolokasi)
let imageBounds = null;     // L.latLngBounds TEPI sel, tempat heatmap ditempel
let frameBounds = null;     // L.latLngBounds untuk BINGKAI, minZoom, dan kunci pan
/* Pegangan ke frameRegion() yang lahir di dalam init(). Dipakai tombol layar
   penuh supaya bisa membingkai ulang tanpa menunggu event resize. */
let bingkaiUlang = null;
/* true = model berdomain terbatas yang membawa frame_bounds sendiri, yaitu WRF.
   Untuk model begini bingkainya memuat SELURUH domain. Lihat frameRegion(). */
let ikutDomain = false;
let playing = false;
let playTimer = null;
let activeLayer = "wind_surface";

/* Layer yang menyala waktu app dibuka. Untuk sumber SATELIT itu True Color
   RGB, diminta pemilik 19 Okt, sebab citra warna asli yang paling langsung
   dimengerti orang begitu peta terbuka, tanpa perlu membaca legenda dulu.

   Kalau unduhan kanal tampaknya gagal, layernya memang TIDAK ADA di katalog,
   sebab pipeline cuma menuliskannya kalau ada bingkai yang jadi. Jadi di sini
   wajib ada jalan mundur, kalau tidak app-nya membuka layer yang tidak ada.
   Tautan berisi ?l=... tetap menang, itu diurus restoreFromHash. */
function layerAwal(cat, avail) {
  /* SATELIT membuka Brightness Temperature, dan panah AMV ikut tergambar di
     atasnya sendiri. Sempat True Color, lalu diganti pemilik 19 Okt sebab
     pasangan citra awan plus panah itu yang paling banyak bercerita sekali
     lihat. True Color tetap ada di rel parameter.

     MODEL membuka HUJAN, bukan angin. Juga diminta pemilik hari yang sama.
     Hujan yang paling dicari orang begitu peta terbuka, dan kartu Showcase
     di landing ikut memakai tampilan ini. */
  if (MODEL && MODEL.satelit) return cat.layers["cloudtop_temp"] ? "cloudtop_temp" : avail[0];
  if (cat.layers["rain_surface"]) return "rain_surface";
  return cat.layers["wind_surface"] ? "wind_surface" : avail[0];
}
let activeBase = "wind_surface";   // tombol layer aktif (kunci PERMUKAAN); di strato dipetakan ke varian _strato
let mapLevel = "surface";          // "surface" | "strato" (70 hPa) — dari dropdown LEVEL
let catalog = null;
let windVelByTime = {};     // PERMUKAAN: valid_time -> velocity_json (partikel angin)
let windVelStrato = {};     // STRATO 70 hPa: valid_time -> velocity_json
let worldLayer = null, provLayer = null;   // layer batas (warna diatur per-tema)
const dataCache = new Map();
// Tombol "Kondisi" HANYA mengatur ikon cuaca (cerah/berawan/hujan). Nama kota +
// nilai parameter aktif berdiri sendiri, selalu tampil, tak ikut tombol itu.
let cityIconsOn = false;    // toggle IKON kondisi cuaca per kota
let cityGroup = null;       // L.layerGroup penampung marker kota (label + ikon opsional)
let cyclonesOn = false;     // toggle deteksi siklon + jalur
let cyclones = null, cyclonesLoading = null;
let cycloneGroup = null;
let itczOn = false;         // toggle zona ITCZ (pita + garis pertemuan angin)
let itcz = null, itczLoading = null;
let itczGroup = null;
let isobars = null, isobarsLoading = null;   // garis isobar (auto di layer Tekanan)
let isobarGroup = null;
let monsoonOn = false;      // toggle: monsun DOMINAN (warna + banner ikut data) + arus beranimasi
let monsoon = null, monsoonLoading = null;
let monsoonVel = null, monsoonVelData = null, monsoonVelLoading = null;
let borneoVel = null, borneoVelData = null, borneoVelLoading = null, borneoMarker = null;

// Ubin label CARTO DIMATIKAN. Alasannya: ubin itu menulis nama kota juga, sedangkan
// label kita sendiri sudah menulis nama + angka parameter. Dua duanya hidup = tiap
// kota punya dua nama (mis. "Majalengka" muncul dua kali, salah satunya tanpa angka).
// Satu tempat cukup satu label, dan label yang menang adalah yang membawa angka.
//
// Naikkan angka ini untuk menghidupkan lagi label CARTO di bawah zoom tersebut
// (mis. 5.5 = hidup saat peta masih jauh, mati begitu label kota kita muncul).
const LABEL_TILE_MAX_Z = 0;

// ---- Nama negara & laut, digambar sendiri ----
// Ubin label CARTO dimatikan karena bikin nama kota kembar. Konteks geografis tetap
// perlu, jadi kita gambar sendiri dari daftar pendek ini. Karena daftarnya kita yang
// pegang, tak mungkin bentrok dengan label kota. Hanya yang masuk domain data
// (bujur 62-180 timur, lintang 33 selatan sampai 33 utara).
const GEO_LABELS = [
  { t: "India", lat: 22.0, lon: 79.0, k: "neg" },
  { t: "Sri Lanka", lat: 7.8, lon: 80.8, k: "neg" },
  { t: "Bangladesh", lat: 24.0, lon: 90.0, k: "neg" },
  { t: "Myanmar", lat: 21.0, lon: 96.2, k: "neg" },
  { t: "Thailand", lat: 15.5, lon: 101.0, k: "neg" },
  { t: "Laos", lat: 18.6, lon: 103.6, k: "neg" },
  { t: "Kamboja", lat: 12.4, lon: 104.9, k: "neg" },
  { t: "Vietnam", lat: 16.2, lon: 107.4, k: "neg" },
  { t: "Tiongkok", lat: 27.0, lon: 107.0, k: "neg" },
  { t: "Taiwan", lat: 23.7, lon: 121.0, k: "neg" },
  { t: "Filipina", lat: 12.5, lon: 122.5, k: "neg" },
  { t: "Malaysia", lat: 4.0, lon: 102.3, k: "neg" },
  { t: "Brunei", lat: 4.5, lon: 114.7, k: "neg" },
  { t: "Indonesia", lat: -4.2, lon: 109.8, k: "neg" },
  { t: "Timor Leste", lat: -8.8, lon: 125.9, k: "neg" },
  { t: "Papua Nugini", lat: -6.2, lon: 144.0, k: "neg" },
  { t: "Australia", lat: -24.0, lon: 133.0, k: "neg" },
  { t: "Samudra Hindia", lat: -15.0, lon: 85.0, k: "laut" },
  { t: "Laut Arab", lat: 15.0, lon: 65.0, k: "laut" },
  { t: "Teluk Benggala", lat: 15.0, lon: 88.0, k: "laut" },
  { t: "Laut Andaman", lat: 11.0, lon: 95.5, k: "laut" },
  { t: "Laut Cina Selatan", lat: 13.5, lon: 114.0, k: "laut" },
  { t: "Laut Jawa", lat: -5.4, lon: 114.6, k: "laut" },
  { t: "Laut Sulawesi", lat: 3.5, lon: 122.0, k: "laut" },
  { t: "Laut Banda", lat: -5.6, lon: 128.0, k: "laut" },
  { t: "Laut Timor", lat: -11.5, lon: 127.0, k: "laut" },
  { t: "Laut Arafura", lat: -9.5, lon: 136.0, k: "laut" },
  { t: "Laut Filipina", lat: 16.0, lon: 130.0, k: "laut" },
  { t: "Samudra Pasifik", lat: 5.0, lon: 158.0, k: "laut" },
];
// Di atas zoom ini pengguna sudah tahu sedang melihat mana, dan label kota yang
// membawa angka jadi yang lebih berguna.
const GEO_LABEL_MAX_Z = 6;
let geoGroup = null;
let cityPlacedPts = [];   // titik label kota terakhir, dipakai geo label biar tak tabrakan

function refreshGeoLabels() {
  if (!geoGroup) return;
  geoGroup.clearLayers();
  if (map.getZoom() >= GEO_LABEL_MAX_Z) return;
  const b = map.getBounds();
  // Nama negara/laut cuma konteks, jadi mengalah pada label kota yang membawa angka.
  // Titik label kota dipakai sebagai penghalang, lalu antar-geo saling menghindar juga.
  const halang = cityPlacedPts.slice(), GX = 66, GY = 22;
  for (const g of GEO_LABELS) {
    if (!b.contains([g.lat, g.lon])) continue;
    const pt = map.latLngToContainerPoint([g.lat, g.lon]);
    let ok = true;
    for (let i = 0; i < halang.length; i++)
      if (Math.abs(pt.x - halang[i].x) < GX && Math.abs(pt.y - halang[i].y) < GY) { ok = false; break; }
    if (!ok) continue;
    halang.push(pt);
    geoGroup.addLayer(L.marker([g.lat, g.lon], {
      pane: "labels", interactive: false, keyboard: false,
      icon: L.divIcon({ className: "geo-lbl geo-" + g.k, iconSize: [0, 0],
                        html: `<span>${g.t}</span>` }),
    }));
  }
}

// Pilih set label CARTO sesuai tema, atau matikan bila zoom sudah melewati ambang.
function applyLabelTiles() {
  const light = LAYER_THEME[activeLayer] === "light";
  const pakai = map.getZoom() < LABEL_TILE_MAX_Z ? (light ? lightLabels : darkLabels) : null;
  for (const l of [darkLabels, lightLabels])
    if (l !== pakai && map.hasLayer(l)) map.removeLayer(l);
  if (pakai && !map.hasLayer(pakai)) pakai.addTo(map);
}

// Tema per-layer: angin = gelap (latar peta gelap), hujan = terang (latar putih).
function applyTheme() {
  const light = LAYER_THEME[activeLayer] === "light";
  applyLabelTiles();
  map.getPane("labels").classList.toggle("lbl-light", light);   // teks gelap di peta terang
  // Batas: override per-layer bila ada, jika tidak ikut tema (gelap/putih).
  const color = BORDER_COLOR[activeLayer] || (light ? "#1c1b1b" : "#ffffff");
  const opacity = light ? 0.7 : 0.85;
  // Di layer Tekanan, batas dibuat lebih redup agar isobar jadi garis dominan.
  const bOpacity = activeLayer === "pressure_surface" ? 0.5 : opacity;
  if (worldLayer) worldLayer.setStyle({ color, opacity: bOpacity });
  if (provLayer) provLayer.setStyle({ color, opacity: bOpacity });
}

// Warna partikel angin sesuai tema: gelap di latar terang, putih di latar gelap.
function particleColor() {
  return LAYER_THEME[activeLayer] === "light" ? "#2b3550" : "#ffffff";
}

const $ = (id) => document.getElementById(id);

function toWIB(iso) {
  // GFS memberi waktu UTC; WIB = UTC+7.
  return new Date(new Date(iso).getTime() + 7 * 3600 * 1000);
}

function fmtValid(iso) {
  // "2026-07-31T00:00:00Z" -> "Jum, 31 Jul 07:00 WIB"
  const opt = { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" };
  return toWIB(iso).toLocaleString("id-ID", opt).replace(/\./g, ":") + " WIB";
}

function fmtDay(iso) {
  // Untuk layer harian: tampilkan TANGGAL saja (hari akumulasi, UTC).
  return new Date(iso).toLocaleDateString("id-ID",
    { weekday: "short", day: "2-digit", month: "short", timeZone: "UTC" });
}

// Frame terdekat ke waktu "sekarang" (untuk posisi awal slider, karena window
// bisa memuat masa lalu -24 jam).
// "Sekarang" versi aplikasi. Untuk model ramalan ini jam dinding sungguhan.
// Untuk model ARSIP, yang datanya bertahun tahun lalu, jam dinding tak ada
// gunanya, semua frame jadi masa lalu dan slider melompat ke ujung. Jadi
// dipakai run_time katalog,
// yaitu batas antara 1 hari lampau dan 3 hari ke depan di jendela itu.
function nowMs() {
  if (catalog?.arsip && catalog.run_time) {
    const t = new Date(catalog.run_time).getTime();
    if (isFinite(t)) return t;
  }
  return Date.now();
}

function nearestNowIndex() {
  const now = nowMs();
  let best = 0, bestDiff = Infinity;
  frames.forEach((f, i) => {
    const d = Math.abs(new Date(f.valid_time).getTime() - now);
    if (d < bestDiff) { bestDiff = d; best = i; }
  });
  return best;
}

// Label tanggal/jam (WIB) di bawah slider: tanggal ditandai tebal saat harinya
// berganti, sisanya jam saja.
function buildTicks() {
  const wrap = $("tl-ticks");
  if (!wrap || !frames.length) return;
  const n = frames.length;
  let prevDay = null;
  /* Kalau SELURUH bingkai jatuh di hari yang sama, sumbu waktunya jadi
     polos tanpa satu pun angka, sebab label cuma dipasang di pergantian
     hari. Itu yang terjadi pada sumber pengamatan seperti satelit, yang
     riwayatnya cuma beberapa jam. Pembaca melihat penggeser tanpa
     keterangan apa apa di belakangnya.

     Jadi kalau harinya tidak pernah berganti, yang dilabeli JAM, dipilih
     berjarak supaya tidak berdesakan. */
  const hariAwal = toWIB(frames[0].valid_time).getUTCDate();
  const sehariSaja = frames.every((f) => toWIB(f.valid_time).getUTCDate() === hariAwal);
  const langkahJam = Math.max(1, Math.round(n / 5));
  wrap.innerHTML = frames.map((f, i) => {
    const wib = toWIB(f.valid_time);
    const day = wib.getUTCDate();
    // Frame 0 hanya dilabeli kalau memang hari tersendiri (layer HARIAN). Di layer
    // per-jam frame 0 itu hari yang belum genap; dulu labelnya dipaksa muncul lalu
    // menyerempet label tengah malam pertama, jadi terlihat bertumpuk di awal.
    // Sekarang tanggal cuma muncul di pergantian hari yang sebenarnya.
    const isDay = i === 0
      ? (n <= 1 || day !== toWIB(frames[1].valid_time).getUTCDate())
      : day !== prevDay;
    prevDay = day;
    const pos = n === 1 ? 0 : (i / (n - 1)) * 100;
    const edge = i === 0 ? " edge-start" : (i === n - 1 ? " edge-end" : "");
    // Mark untuk tiap frame; label TANGGAL saja (di pergantian hari) biar tak berdesakan.
    const lbl = isDay
      ? `<span class="tl-tick-lbl">${wib.toLocaleDateString("id-ID", { day: "numeric", month: "short", timeZone: "UTC" })}</span>`
      : (sehariSaja && (i % langkahJam === 0 || i === n - 1)
        ? `<span class="tl-tick-lbl">${String(wib.getUTCHours()).padStart(2, "0")}:${String(wib.getUTCMinutes()).padStart(2, "0")}</span>`
        : "");
    return `<div class="tl-tick${isDay ? " day" : (lbl ? " jam" : "")}${edge}" style="left:${pos}%">` +
      `<span class="tl-tick-mark"></span>${lbl}</div>`;
  }).join("");
}

// ---- Batas administrasi -------------------------------------------------
// Indonesia: batas PROVINSI (garis tipis). Negara lain: batas NEGARA saja.
const ADMIN_BASE = "data/";
async function loadAdmin() {
  // Struktur styling mengikuti portofolio: batas negara solid & tegas,
  // batas provinsi tipis putus-putus. Warna putih agar kontras di atas heatmap gelap.
  const styleCountry = { color: "#ffffff", weight: 1.0, opacity: 0.85, fill: false, lineJoin: "round", lineCap: "round", interactive: false };
  const styleProv = { color: "#ffffff", weight: 1.0, opacity: 0.85, fill: false, dashArray: "3 2", lineJoin: "round", interactive: false };
  // Canvas renderer khusus pane admin: fitur di luar frame (+padding) tak digambar,
  // muncul lagi saat di-pan/zoom-out. Jauh lebih mulus daripada SVG.
  const renderer = L.canvas({ pane: "admin", padding: 0.5 });
  try {
    const [world, prov] = await Promise.all([
      fetch(ADMIN_BASE + "world_countries.geojson").then((r) => (r.ok ? r.json() : null)),
      fetch(ADMIN_BASE + "idn_provinces.geojson").then((r) => (r.ok ? r.json() : null)),
    ]);
    if (world) {
      worldLayer = L.geoJSON(world, {
        pane: "admin",
        renderer,
        style: styleCountry,
        // Indonesia digambar oleh layer provinsi → hindari garis pantai ganda kasar.
        filter: (f) => !f.properties || f.properties.name !== "Indonesia",
      }).addTo(map);
    }
    if (prov) provLayer = L.geoJSON(prov, { pane: "admin", renderer, style: styleProv }).addTo(map);
    /* GeoJSON MENTAHNYA disimpan, bukan cuma layernya. Satu layer Leaflet
       tidak bisa dipasang di dua peta, dan peta sisipan di panel titik perlu
       batas yang sama. Menyimpan datanya jauh lebih murah daripada
       mengunduhnya dua kali. */
    adminGeo = { world, prov };
    applyTheme(); // warna batas sesuai layer aktif saat ini
  } catch (e) {
    console.warn("Batas administrasi gagal dimuat:", e);
  }
}

async function loadVelocity(vj) {
  if (dataCache.has(vj)) return dataCache.get(vj);
  const res = await fetch(DATA_BASE + vj);
  if (!res.ok) throw new Error("Gagal memuat " + vj);
  const data = await res.json();
  dataCache.set(vj, data);
  return data;
}

// PARAMETER AKTIF, tetap kelihatan walau kartu Parameter tertutup. 10 Sep 2026.
//
// Dulu yang tersisa waktu kartu tertutup cuma SATUAN di kepala legenda, dan
// Kelembapan dan Tutupan Awan dua duanya cuma "%". Sekarang kepala legenda
// menyebut nama layernya di depan satuan, dan ikon di spine Parameter ikut
// berganti jadi ikon layer yang aktif.
//
// Nama dan ikon diambil dari TOMBOL layer itu sendiri, supaya cuma ada satu
// sumber. innerHTML dipakai supaya subskrip seperti PM<sub>2.5</sub> ikut.
// Blok ini IDENTIK di atmosight dan smokewatch, jangan dibiarkan bercabang.
function tombolLayer(layerKey) {
  return document.querySelector(`.layer-btn[data-layer="${layerKey}"]`)
      || (typeof BASE_OF !== "undefined" && BASE_OF[layerKey]
          ? document.querySelector(`.layer-btn[data-layer="${BASE_OF[layerKey]}"]`)
          : null);
}
function isiKepalaLegenda(head, layerKey, satuan) {
  /* SATUANNYA SAJA. Nama parameter pindah ke badge di kiri atas 19 Oktober
     2026, jadi menuliskannya lagi di sini cuma mengulang.

     Kecualinya layer yang satuannya memang namanya sendiri, ISPU dan AQI,
     dan layer tanpa satuan. Untuk itu namanya yang dipakai, kalau tidak
     kepala legendanya kosong melompong di atas bilah warna. */
  const t = tombolLayer(layerKey)?.querySelector(".lb-txt");
  const nama = t ? t.textContent.trim() : "";
  let sat = String(satuan || "");
  const N = nama.toUpperCase(), S = sat.toUpperCase();
  // "CAPE, J/kg" -> "J/kg". Namanya dibuang, satuannya disisakan.
  if (nama && S.startsWith(N + ",")) sat = sat.slice(nama.length + 1).trim();
  if (sat && S !== N) { head.innerHTML = `<span class="lh-sat">${escHtml(sat)}</span>`; return; }
  head.innerHTML = t ? `<span class="lh-nama">${t.innerHTML.trim()}</span>` : escHtml(sat);
}
// Tombol ISPU dan AQI tidak punya ikon, jadi untuk dua layer itu spine tetap
// memakai ikon pengatur umum.
function tandaiSpineParameter(layerKey) {
  const ic = document.querySelector("#spine-param .sisi-ico");
  if (!ic) return;
  const bi = tombolLayer(layerKey)?.querySelector(".material-symbols-outlined");
  ic.textContent = bi ? bi.textContent.trim() : "tune";
}

/* Legenda untuk layer yang sedang jadi ALAS. Ikut aturan yang sama dengan
   legenda utama, cuma kotaknya lebih kecil, sebab dia keterangan pendamping
   bukan keterangan pokok. */
function renderLegendaAlas() {
  const baris = $("legend-alas");
  if (!baris) return;
  const dasar = (MODEL && MODEL.satelit) ? ATAS_SATELIT[activeLayer] : null;
  const def = dasar && LEGENDS[dasar];
  if (!def) { baris.hidden = true; return; }
  baris.hidden = false;
  const head = $("legend-alas-head"), cells = $("legend-alas-cells");
  if (head) isiKepalaLegenda(head, dasar, def.head);
  if (cells) {
    cells.classList.toggle("legend-words", !!def.words);
    cells.innerHTML = def.cells.map(([label, bg, dark]) =>
      (bg === "transparent"
        ? `<div class="legend-cell kotak-catur${dark ? " dark" : ""}">${label}</div>`
        : `<div class="legend-cell${dark ? " dark" : ""}" style="background:${bg}">${label}</div>`)
    ).join("");
  }
}

function renderLegend(layerKey) {
  renderLegendaAlas();
  const def = LEGENDS[layerKey];
  const head = $("legend-head"), cells = $("legend-cells");
  /* Layer yang TIDAK punya skala, untuk sekarang cuma citra warna asli,
     panel legendanya disembunyikan. Tanpa ini yang tertinggal di layar
     legenda layer sebelumnya, dan tangga warna yang tidak berhubungan
     dengan apa pun di peta itu lebih menyesatkan daripada tidak ada. */
  const panel = document.querySelector(".legend-col > .legend-panel");
  if (panel) panel.style.display = def ? "" : "none";
  if (!def || !head || !cells) return;
  isiKepalaLegenda(head, layerKey, def.head);
  tandaiSpineParameter(layerKey);
  cells.classList.toggle("legend-words", !!def.words);   // sel melebar utk label kata
  cells.innerHTML = def.cells.map(([label, bg, dark]) =>
    (bg === "transparent"
      ? `<div class="legend-cell kotak-catur${dark ? " dark" : ""}">${label}</div>`
      : `<div class="legend-cell${dark ? " dark" : ""}" style="background:${bg}">${label}</div>`)
  ).join("");
}

function setActiveLayer(layerKey) {
  if (!catalog || !catalog.layers[layerKey] || layerKey === activeLayer) return;
  activeLayer = layerKey;
  activeBase = BASE_OF[layerKey] || layerKey;   // tombol yang menyala = kunci permukaan
  frames = catalog.layers[layerKey].frames;
  document.querySelectorAll(".layer-btn[data-layer]").forEach((b) =>
    b.classList.toggle("active", b.dataset.layer === activeBase));
  renderLegend(layerKey);
  updateParChip();
  applyTheme();
  setelHalusAnomali();
  if (velocityLayer) { map.removeLayer(velocityLayer); velocityLayer = null; } // recreate warna partikel
  // Recreate imageOverlay heatmap tiap ganti layer: elemen <img> yang sama TAK
  // di-reuse antar-layer. Mencegah "ghost" palet layer sebelumnya menembus area
  // transparan layer hujan (bug sisa palet putih->biru saat pindah lalu balik).
  if (speedLayer) { map.removeLayer(speedLayer); speedLayer = null; }
  // Alas satelit ikut dibuang. Kalau dibiarkan, pindah dari AMV ke
  // Brightness Temperature menyisakan satu citra tembus pandang di bawah citra
  // awan yang baru, dan dua duanya kelihatan.
  if (satAtasLayer) { map.removeLayer(satAtasLayer); satAtasLayer = null; }
  buildTicks();
  const slider = $("time-slider");
  if (slider) slider.max = String(frames.length - 1);
  // Index frame tak sebanding antar-layer (harian ~8 frame vs per-jam ~27). Selalu
  // resolve ulang ke frame terdekat "sekarang" agar tak melompat ke awal data.
  current = nearestNowIndex();
  showFrame(current);
  syncIsobars();                 // isobar auto muncul/lepas mengikuti layer Tekanan
  // panel titik ikut variabel aktif
  if (pdTerakhir && lastPoint && $("point-panel")?.classList.contains("open"))
    renderPoint(pdTerakhir, lastPoint.lat, lastPoint.lon);
  updateHash();
}

/* Memasang atau memperbarui lapisan partikel angin.
   Dipisah dari showFrame supaya bisa dipanggil belakangan, sesudah datanya
   tiba, tanpa menahan peta tampil. Lihat komentar panjang di showFrame. */
function pasangAngin(data) {
  if (!velocityLayer) {
    velocityLayer = L.velocityLayer({
      displayValues: false,
      displayOptions: {
        velocityType: "Angin", position: "bottomleft", emptyString: "Tidak ada data",
        angleConvention: "bearingCW", speedUnit: "kt", directionString: "Arah", speedString: "Kecepatan",
      },
      data,
      minVelocity: 0, maxVelocity: 25, velocityScale: 0.012,
      particleAge: 90, particleMultiplier: 1 / 260, lineWidth: 1.1,
      colorScale: [particleColor()], frameRate: 24,
    });
    velocityLayer.addTo(map);
  } else {
    if (!map.hasLayer(velocityLayer)) velocityLayer.addTo(map);
    velocityLayer.setData(data);
  }
}

/* Memasang alas satelit untuk bingkai yang sedang tampil.

   Dicocokkan lewat valid_time, BUKAN lewat nomor bingkai. Dua layer satelit
   sekarang memang selalu punya deret jam yang sama, tapi kalau suatu hari
   AMV bolong satu slot sedangkan citranya ada, mencocokkan nomor akan
   memasang awan jam lain di bawah panah jam ini, dan tidak ada yang akan
   sadar sebab gambarnya tetap masuk akal. */
/* Satu bingkai di depan ditarik diam diam.

   Satu keping citra satelit 1,9 MB, sedangkan putaran berganti tiap 1,1
   detik. Tanpa ancang ancang, tiap langkah berarti menunggu berkas itu
   mendarat dulu, dan yang dilihat orang peta yang diam walau penggesernya
   sudah berpindah. Yang ditarik CUMA satu di depan, bukan seluruh deret,
   sebab dua belas bingkai itu 23 MB dan tidak sopan menyedot sebanyak itu
   dari orang yang mungkin cuma melihat satu jam.

   Gagalnya diabaikan. Ini ancang ancang, bukan pemuatan datanya sendiri. */
let praMuatUrl = null;
/* BERAPA BINGKAI KE DEPAN yang diambil lebih dulu, ikut kecepatan putar.

   Dulu selalu SATU. Pada jeda 1100 ms itu cukup, satu bingkai 700 KB punya
   satu detik penuh untuk mendarat. Pada deret 288 bingkai jedanya 156 ms,
   dan satu bingkai ke depan berarti menuntut 4,5 MB per detik cuma supaya
   tidak tersendat. Tidak akan tercapai, dan animasinya akan tersentak di
   tiap bingkai yang belum sempat turun.

   Angkanya diturunkan dari jeda, jadi MODEL TIDAK BERUBAH SAMA SEKALI:
   jeda 1100 memberi 1, persis seperti sebelumnya. Dibatasi enam supaya
   tidak membuka belasan permintaan sekaligus dan justru memperlambat yang
   sedang ditunggu. */
function praMuatBerapa() {
  return Math.max(1, Math.min(6, Math.round(1100 / jedaPutar())));
}

function muatDuluBingkaiBerikut() {
  if (!frames.length || !DATA_BASE) return;
  const n = praMuatBerapa();
  const kunci = current + "|" + n + "|" + DATA_BASE + "|" + activeLayer;
  if (kunci === praMuatUrl) return;
  praMuatUrl = kunci;
  const dasar = (MODEL && MODEL.satelit) ? ATAS_SATELIT[activeLayer] : null;
  const def = dasar && catalog && catalog.layers[dasar];
  for (let k = 1; k <= n; k++) {
    const b = frames[(current + k) % frames.length];
    if (!b || !b.preview_image) continue;
    const im = new Image(); im.decoding = "async"; im.src = DATA_BASE + b.preview_image;
    // Alasnya ikut, kalau tidak yang mulus cuma panahnya dan awan di
    // belakangnya tetap tersendat.
    const fa = def && def.frames.find((f) => f.valid_time === b.valid_time);
    if (fa) { const ia = new Image(); ia.decoding = "async"; ia.src = DATA_BASE + fa.preview_image; }
  }
}

function pasangPanahSatelit(frame) {
  const dasar = (MODEL && MODEL.satelit) ? ATAS_SATELIT[activeLayer] : null;
  const def = dasar && catalog && catalog.layers[dasar];
  const fa = def && def.frames.find((f) => f.valid_time === frame.valid_time);
  if (!fa || !imageBounds) {
    if (satAtasLayer) { map.removeLayer(satAtasLayer); satAtasLayer = null; }
    return;
  }
  const url = DATA_BASE + fa.preview_image;
  if (!satAtasLayer) {
    satAtasLayer = L.imageOverlay(url, imageBounds,
      { pane: "satatas", opacity: 1, interactive: false }).addTo(map);
  } else {
    satAtasLayer.setUrl(url);
  }
}

async function showFrame(i) {
  current = (i + frames.length) % frames.length;
  const frame = frames[current];

  // Heatmap (kedua layer punya preview_image): angin = kecepatan, hujan = laju hujan.
  const url = DATA_BASE + frame.preview_image;
  if (!speedLayer) {
    speedLayer = L.imageOverlay(url, imageBounds, { pane: "speed", opacity: 0.92, interactive: false });
    speedLayer.addTo(map);
  } else {
    speedLayer.setUrl(url);
  }
  const isVector = catalog.layers[activeLayer]?.kind === "vector";
  speedLayer.setOpacity(isVector ? 0.92 : 1); // scalar opaque; angin semi
  pasangPanahSatelit(frame);                   // panah AMV di atas citra awan

  // Partikel angin PUTIH — SELALU ada (angin & hujan), dari medan angin waktu sama.
  // Ikut LEVEL: di stratosfer pakai medan angin 70 hPa agar konsisten dengan heatmap.
  const vsrc = (mapLevel === "strato") ? windVelStrato : windVelByTime;
  const vj = vsrc[frame.valid_time];
  /* TIDAK DITUNGGU. Ini yang dulu membuat layar "Memuat data cuaca" bertahan
     lama sekali di Atmosight.

     Berkas medan angin GFS itu 4,58 MB, jauh lebih besar dari gambar layernya
     yang cuma 77 sampai 315 KB. Karena dulu di-await, dan init pun me-await
     showFrame, seluruh layar tertahan sampai berkas 4,58 MB itu selesai
     diunduh DAN di-parse. Padahal petanya sendiri sudah siap digambar jauh
     sebelum itu.

     Sekarang gambarnya tampil dulu, partikel anginnya menyusul begitu datanya
     tiba. Yang dilihat orang jadi peta dalam hitungan detik, bukan layar
     memuat selama belasan detik. Di sambungan lambat bedanya bukan detik lagi.

     Kegagalannya sengaja ditelan. Partikel angin itu hiasan di atas peta,
     bukan datanya sendiri, jadi gagal memuatnya tidak boleh merusak apa pun.
     Sebelumnya galat di sini melempar keluar dari showFrame dan menggagalkan
     seluruh init. */
  const seq = ++velSeq;
  if (vj) {
    loadVelocity(vj).then((data) => {
      if (seq !== velSeq) return;   // sudah pindah frame, buang yang telat
      pasangAngin(data);
    }).catch(() => { /* partikel gagal, peta tetap jalan */ });
  } else if (velocityLayer && map.hasLayer(velocityLayer)) {
    map.removeLayer(velocityLayer);
  }

  const vt = $("valid-time");
  if (vt) vt.textContent = layerHarian(activeLayer) ? fmtDay(frame.valid_time) : fmtValid(frame.valid_time);
  const ts = $("time-slider"); if (ts) ts.value = String(current);
  /* Isian silinder dan letak label waktu. Dua duanya dari satu angka yang
     sama, persen posisi slider, ditaruh di variabel CSS supaya CSS yang
     mengurus gambarnya dan JS cuma mengabari. Jempol slider lebarnya 13 px,
     jadi letaknya dikoreksi sedikit di CSS lewat calc supaya label betul
     betul duduk di atas titiknya, bukan bergeser di dua ujung. */
  const tm = document.querySelector(".tl-main");
  if (tm) tm.style.setProperty("--tl-isi", (frames.length > 1 ? current / (frames.length - 1) * 100 : 0).toFixed(2) + "%");
  refreshCityIcons();                    // label kota (+ikon bila aktif) ikut waktu aktif
  tandaiJamAktif();                      // kolom jam di panel bawah ikut slider
  gambarFenomena();                      // siklon dan penanda AUSMI ikut jam juga
  if (cyclonesOn) refreshCyclones();     // siklon + jalur ikut waktu aktif
  if (itczOn) refreshItcz();             // zona ITCZ ikut waktu aktif
  if (mjoOn) { refreshMjo(); mjoIsiNote(); }   // amplop MJO ikut waktu aktif
  if (activeLayer === "pressure_surface") refreshIsobars();   // isobar ikut waktu aktif
  segarkanSkewT();   // kartu Skew-T ikut jam yang sedang tampil
  muatDuluBingkaiBerikut();   // ancang ancang, biar putaran tidak tersendat
  updateHash();
}

/* MAIN DAN BERHENTI, satu pintu.

   Dulu ini cuma togglePlay yang membalik `playing` lalu, kalau hidupnya
   jadi true, memasang interval baru. Dua hal yang bisa berantakan di situ.

   Pertama, waktu dimatikan ia memanggil clearInterval tapi tidak pernah
   mengosongkan pemegangnya, jadi tidak ada satu pun tempat yang bisa
   memastikan "sekarang benar benar tidak ada timer yang jalan".

   Kedua, dan ini yang membuatnya rapuh, keadaan main itu disimpan DUA KALI,
   di variabel `playing` dan di adanya timer. Kalau dua duanya sempat tidak
   sepakat, misalnya `playing` true sementara timernya sudah hilang, tekanan
   tombol berikutnya justru MEMATIKAN yang memang sudah mati. Dari luar itu
   terlihat persis seperti tombol main yang tidak berfungsi, dan baru jalan
   di tekanan kedua.

   Sekarang keadaannya disetel, bukan dibalik, dan timer lama SELALU dicabut
   lebih dulu, hidup atau mati. Jadi tidak mungkin ada dua timer berjalan
   bersamaan, dan tidak mungkin ada `playing` true tanpa timer. */
function setPlay(on) {
  playing = !!on;
  const ic = $("play-icon");
  if (ic) ic.textContent = playing ? "pause" : "play_arrow";
  if (playTimer) { clearInterval(playTimer); playTimer = null; }
  if (playing) playTimer = setInterval(() => { showFrame(current + 1); }, jedaPutar());
}

/* LAMA SATU PUTARAN yang dijaga, bukan lama satu bingkai.

   Dulu jedanya dipatok 1100 ms. Itu pas untuk model, yang bingkainya 25
   sampai 33 sehingga satu putaran 28 sampai 36 detik. Begitu Himawari jadi
   tiap sepuluh menit, bingkainya 288 dan satu putaran jadi 5,3 MENIT. Tidak
   ada yang akan menunggu selama itu, jadi fitur putarnya praktis mati
   justru di layer yang paling pantas dianimasikan.

   Jadi yang dipatok sekarang lama putarannya, sekitar 45 detik, lalu
   jedanya dibagi dari situ. Dijepit di 1100 ms supaya MODEL TIDAK BERUBAH
   SAMA SEKALI: 25 bingkai memberi 1800 ms yang langsung kena jepit atas,
   jadi GFS, WRF, dan ECMWF tetap persis seperti sebelumnya. Jepit bawah 120
   ms supaya deret yang sangat panjang tidak berubah jadi kedipan.

   288 bingkai memberi 156 ms, dan itu kira kira kecepatan film awan satelit
   yang biasa dilihat orang. */
const PUTAR_MS = 45000, PUTAR_MIN = 120, PUTAR_MAKS = 1100;
function jedaPutar() {
  const n = (frames && frames.length) || 1;
  return Math.max(PUTAR_MIN, Math.min(PUTAR_MAKS, Math.round(PUTAR_MS / n)));
}
function togglePlay() { setPlay(!playing); }

// ================= POINT DETAIL =================
let pointData = null;      // { meta, vars: {name:{arr,scale,offset}} }
let pointLoading = null;
let pointMarker = null;
let kotaTerpilih = null;   // nama kota yang sedang dipilih, labelnya dibuat berkedip
let sharedPoint = null;    // {lat,lon,name} titik aktif → dipakai untuk link Bagikan
let lastPoint = null;      // untuk export CSV
let pdTerakhir = null;     // pd titik aktif (kisi kecil atau blob), untuk gambar ulang saat layer ganti
const MS_TO_KT = 1.943844;
const DIRS = ["U", "TL", "T", "TG", "S", "BD", "B", "BL"]; // 8 arah dari Utara searah jarum jam

/* META DIMUAT SEKALI, DIPAKAI DUA JALUR.

   point_meta.json kecil, 2 sampai 3 KB. Dia yang bilang apakah model ini
   sudah punya point_cells.bin (kunci "cells") atau masih blob lama. `segar`
   memaksa tarik ulang melewati cache browser, dipakai kalau ukuran berkas di
   server tidak cocok lagi dengan metanya, lihat bacaSel. */
/* fetch dengan SATU pengulangan kalau jaringannya yang gagal (TypeError,
   misalnya sambungan direset hostingan atau permintaan dibatalkan browser).
   Dilihat 12 Oktober 2026 di uji produksi: satu dari tiga klik pertama
   point_meta.json-nya gugur begitu, dan tanpa ini panelnya langsung bilang
   gagal. Balasan HTTP apa pun (404, 500) TIDAK diulang, itu bukan soal jaringan. */
async function fetchUlang(url, opt) {
  try { return await fetch(url, opt); }
  catch (e) {
    if (!(e instanceof TypeError)) throw e;
    await new Promise((r) => setTimeout(r, 400));
    return fetch(url, opt);
  }
}

/* CACHE META PER BASE, bukan satu untuk seluruh halaman. Dipisah waktu plot
   banding masuk, sebab plot itu membaca titik yang sama dari BEBERAPA MODEL
   sekaligus. Dengan satu cache bersama, meta model pertama yang mendarat
   akan dipakai membaca berkas model kedua, dan karena `nx`, `stride`, serta
   `cells.bytes` tiap model berbeda, yang terbaca adalah offset yang salah di
   berkas yang benar. Itu tidak melempar galat, cuma memulangkan angka ngawur.

   Kuncinya base path, jadi model aktif tetap memakai satu entri dan tidak
   ada permintaan tambahan untuk jalur yang sudah ada. */
const metaCache = new Map();       // base -> { nilai, janji }
async function loadPointMeta(segar, base) {
  const b = base || DATA_BASE;
  let c = metaCache.get(b);
  if (!c) { c = { nilai: null, janji: null }; metaCache.set(b, c); }
  if (c.nilai && !segar) return c.nilai;
  if (c.janji && !segar) return c.janji;
  c.janji = fetchUlang(b + "point_meta.json", segar ? { cache: "reload" } : {})
    .then((r) => { if (!r.ok) throw new Error("point_meta.json HTTP " + r.status); return r.json(); })
    .then((m) => { c.nilai = m; return m; });
  c.janji.catch(() => { c.janji = null; });   // gagal → klik berikutnya mencoba lagi
  return c.janji;
}

/* JALUR LAMA, blob utuh. Sejak 12 Oktober 2026 hanya dipakai kalau meta
   tidak punya "cells", yaitu data format lama seperti cadangan di GitHub
   Pages. Klik biasa lewat ambilTitik di bawah. */
async function loadPointData() {
  if (pointData) return pointData;
  if (pointLoading) return pointLoading;
  pointLoading = (async () => {
    const meta = await loadPointMeta();
    /* DIBUKA SAMBIL DIUNDUH, bukan sesudah. Cara lama menunggu seluruh
       berkas selesai jadi satu ArrayBuffer, baru membungkusnya jadi Blob,
       baru mengalirkannya ke pembuka gzip. Untuk WRF itu berarti 47 MB
       bentuk mampat DAN 120 MB bentuk terbuka hidup bersamaan di memori,
       dan pembukaannya baru mulai sesudah bita terakhir mendarat.

       Badan tanggapannya memang sudah aliran, jadi dia bisa langsung
       disambung ke pembuka gzip. Membukanya berjalan selagi mengunduh, dan
       bentuk mampatnya tidak pernah perlu disimpan utuh. */
    const r = await fetch(DATA_BASE + "point_data.bin.gz");
    if (!r.ok) throw new Error("point_data.bin.gz HTTP " + r.status);
    const buf = await new Response(
      r.body.pipeThrough(new DecompressionStream("gzip"))
    ).arrayBuffer();
    const vars = {};
    for (const v of meta.vars) {
      const Ctor = v.dtype === "uint8" ? Uint8Array : Int16Array;
      vars[v.var] = { arr: new Ctor(buf, v.byteOffset, v.byteLength / Ctor.BYTES_PER_ELEMENT),
                      scale: v.scale, offset: v.offset };
    }
    pointData = { meta, vars };
    return pointData;
  })();
  return pointLoading;
}

/* SATU TITIK SAJA, LEWAT HTTP RANGE. 12 Oktober 2026.

   Jalur lama di atas mengunduh SELURUH grid, 22 MB GFS dan 47 MB WRF,
   padahal satu panel cuma butuh empat sel di sekitar titiknya. Diukur hari
   itu hostingan melayani 1 MB/s, jadi klik pertama menunggu 22 sampai 46
   detik di PC, dan di HP lebih lama lagi atau tabnya mati kehabisan memori
   sebab bentuk terbukanya 120 MB.

   Backend sekarang menulis point_cells.bin, susunan [y][x][var][t] tanpa
   kompresi. Semua waktu semua variabel satu sel berderet, dan sel (x,y)
   mulai di byte (y*nx + x)*stride. Jadi empat sel bilinear itu dua baris
   bersebelahan, dua permintaan Range sekitar 1 KB masing masing, dan
   panelnya tampil di bawah sedetik juga di HP.

   Hasilnya dikemas jadi kisi kecil 2 x 2 (atau 1 x 2, 2 x 1, 1 x 1 di tepi
   grid) dengan bounds yang digeser ke sel itu, supaya sampleVar dan
   renderPoint tidak perlu tahu dari mana datanya datang. Posisi pecahan
   titik di dalam selnya tetap sama persis, jadi angkanya identik dengan
   jalur lama. */
const selCache = new Map();        // base|x0,y0 -> Promise pd kisi kecil
/* `base` dipakai plot banding untuk membaca model SELAIN yang sedang dibuka.
   Tanpa argumen dia model aktif, jadi semua pemanggil lama tidak berubah.
   Jalur mundur ke loadPointData() SENGAJA cuma untuk model aktif: berkas
   blob lama itu puluhan megabita dan menariknya untuk model yang cuma jadi
   garis pembanding tidak sepadan. Model tanpa point_cells dilewati saja. */
async function ambilTitik(lat, lon, base) {
  const b = base || DATA_BASE;
  let meta = await loadPointMeta(false, b);
  if (!meta.cells) {
    if (base && base !== DATA_BASE) throw new Error("model ini belum punya point_cells");
    return loadPointData();
  }
  const kotak = selSekitar(meta, lat, lon);
  const kunci = b + "|" + kotak.x0 + "," + kotak.y0;
  if (!selCache.has(kunci)) {
    const p = (async () => {
      try { return await bacaSel(meta, kotak, b); }
      catch (e) {
        /* Ukuran berkas di server tidak cocok dengan meta, berarti meta di
           tangan sudah basi, data baru mendarat di antara dua permintaan.
           Tarik meta segar lalu coba sekali lagi. */
        if (!e.basi) throw e;
        meta = await loadPointMeta(true, b);
        if (!meta.cells) {
          if (base && base !== DATA_BASE) throw e;
          return loadPointData();
        }
        return bacaSel(meta, selSekitar(meta, lat, lon), b);
      }
    })();
    p.catch(() => selCache.delete(kunci));
    selCache.set(kunci, p);
  }
  return selCache.get(kunci);
}

// Empat sel pengapit titik. Hitungannya persis sampleVar, supaya bilinearnya
// jatuh di sel yang sama.
function selSekitar(meta, lat, lon) {
  const { nx, ny, bounds, dx, dy } = meta, [w, , , n] = bounds;
  const fx = Math.max(0, Math.min(nx - 1, (lon - w) / dx));
  const fy = Math.max(0, Math.min(ny - 1, (n - lat) / dy));
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  return { x0, x1: Math.min(x0 + 1, nx - 1), y0, y1: Math.min(y0 + 1, ny - 1) };
}

async function bacaSel(meta, { x0, x1, y0, y1 }, base) {
  const c = meta.cells, nkol = x1 - x0 + 1, baris = y1 === y0 ? [y0] : [y0, y1];
  const potongan = await Promise.all(baris.map(async (y) => {
    const awal = (y * meta.nx + x0) * c.stride, akhir = awal + nkol * c.stride - 1;
    const r = await fetchUlang((base || DATA_BASE) + c.file, { headers: { Range: "bytes=" + awal + "-" + akhir } });
    if (r.status !== 206) {
      /* Server yang mengabaikan Range membalas 200 berikut SELURUH berkas.
         Jangan ditelan, putuskan dan laporkan. */
      try { if (r.body) await r.body.cancel(); } catch (_) { /* abaikan */ }
      throw new Error(c.file + " HTTP " + r.status + ", bukan 206");
    }
    const total = parseInt((r.headers.get("Content-Range") || "").split("/")[1], 10);
    if (total && total !== c.bytes) { const e = new Error("point_meta basi"); e.basi = true; throw e; }
    const b = new Uint8Array(await r.arrayBuffer());
    if (b.length !== nkol * c.stride) throw new Error(c.file + " potongan " + b.length + " byte, mau " + nkol * c.stride);
    return b;
  }));
  const nbar = baris.length, bidang = nkol * nbar, nt = meta.times.length, vars = {};
  for (const v of meta.vars) {
    const u8 = v.dtype === "uint8";
    const arr = u8 ? new Uint8Array(nt * bidang) : new Int16Array(nt * bidang);
    for (let r = 0; r < nbar; r++) for (let k = 0; k < nkol; k++) {
      const dv = new DataView(potongan[r].buffer, potongan[r].byteOffset + k * c.stride + v.cellOffset, v.cellLength);
      for (let t = 0; t < nt; t++) arr[t * bidang + r * nkol + k] = u8 ? dv.getUint8(t) : dv.getInt16(t * 2, true);
    }
    vars[v.var] = { arr, scale: v.scale, offset: v.offset };
  }
  const [w, , , n] = meta.bounds, { dx, dy } = meta;
  return { meta: { ...meta, nx: nkol, ny: nbar, bounds: [w + x0 * dx, n - y1 * dy, w + x1 * dx, n - y0 * dy] },
           vars };
}

/* DERET DARI city_data.json, TANPA MENYENTUH JARINGAN.

   city_data.json sudah diunduh sejak peta dibuka, dia yang memberi angka
   di label kota. Isinya bukan cuma angka jam ini, tapi SELURUH deret waktu
   untuk 514 kota dan kabupaten. Jadi kalau orang membuka titik yang memang
   salah satu dari 514 itu, entah dengan mengklik penandanya atau lewat
   pencarian di bilah atas, seluruh isi panelnya sudah ada di tangan dan
   panelnya bisa tampil SEKETIKA tanpa menunggu berkas 47 MB.

   Angkanya BUKAN hampiran. Backend menyampelnya dari kisi yang sama, di
   titik yang sama, jadi untuk kota bernama ini justru angka yang persis
   sama dengan yang nanti keluar dari point_data.

   Dikemas supaya sampleVar bisa membacanya tanpa diubah, yaitu kisi 1 x 1.
   Di kisi sejengkal itu bilinearnya runtuh jadi satu nilai, persis yang
   dimau, dan tidak ada satu baris pun di jalur gambar yang perlu tahu dari
   mana datanya datang.

   Yang TIDAK ada di sini cuma arah angin. city_data menyimpan kecepatan
   saja. Makanya point_data tetap diunduh di latar, dan panelnya digambar
   ulang begitu dia mendarat. */
function deretKota(nama) {
  if (!nama || !cityData || !cityIndexByName) return null;
  const i = cityIndexByName.get(nama);
  if (i === undefined) return null;
  const vars = {};
  for (const k in cityData.data) {
    const baris = cityData.data[k][i];
    if (!baris) continue;
    vars[k] = { arr: Float64Array.from(baris), scale: cityData.scales[k] || 1, offset: 0 };
  }
  if (!vars.temp && !vars.rain) return null;
  return { meta: { nx: 1, ny: 1, bounds: [0, 0, 0, 0], dx: 1, dy: 1, times: cityData.times },
           vars, dariKota: true };
}

// Bilinear di titik (lat,lon) untuk semua waktu -> array nilai.
function sampleVar(pd, name, lat, lon) {
  const v = pd.vars[name];
  if (!v) return null;
  const { nx, ny, bounds, dx, dy, times } = pd.meta;
  const [w, , , n] = bounds;
  let fx = Math.max(0, Math.min(nx - 1, (lon - w) / dx));
  let fy = Math.max(0, Math.min(ny - 1, (n - lat) / dy)); // baris-0 = utara
  const x0 = Math.floor(fx), x1 = Math.min(x0 + 1, nx - 1), tx = fx - x0;
  const y0 = Math.floor(fy), y1 = Math.min(y0 + 1, ny - 1), ty = fy - y0;
  const plane = nx * ny, out = [];
  for (let t = 0; t < times.length; t++) {
    const b = t * plane;
    const A = v.arr[b + y0 * nx + x0], B = v.arr[b + y0 * nx + x1];
    const C = v.arr[b + y1 * nx + x0], D = v.arr[b + y1 * nx + x1];
    const raw = (1 - tx) * (1 - ty) * A + tx * (1 - ty) * B + (1 - tx) * ty * C + tx * ty * D;
    out.push(raw * v.scale + v.offset);
  }
  return out;
}

function windAt(u, v) {
  const spd = Math.sqrt(u * u + v * v) * MS_TO_KT;
  const deg = (Math.atan2(-u, -v) * 180 / Math.PI + 360) % 360; // arah DATANG
  return { spd, dir: DIRS[Math.round(deg / 45) % 8] };
}

// ============== PROFIL VERTIKAL (Skew-T) — muat malas & sampel ==============
let profileMeta = null, profileMetaJanji = null;

async function muatProfilMeta() {
  if (profileMeta) return profileMeta;
  if (!profileMetaJanji) {
    profileMetaJanji = fetch(DATA_BASE + "profile_meta.json")
      .then((r) => { if (!r.ok) throw new Error("profile_meta HTTP " + r.status); return r.json(); })
      .then((m) => (profileMeta = m))
      .catch((e) => { profileMetaJanji = null; throw e; });
  }
  return profileMetaJanji;
}

/* SATU SEL PROFIL LEWAT HTTP RANGE.

   DIUKUR 19 Oktober 2026, dan angkanya yang membuat ini ditulis. Berkas
   lama `profile.bin.gz` bersusun [waktu][level][y][x], jadi satu titik
   tersebar di seluruh berkas dan harus diunduh utuh. 19,3 MB, 16 detik,
   untuk memakai 3.850 bita, yaitu 0,02 persennya. Hitungan Skew-T-nya
   sendiri cuma 0,8 milidetik, jadi seluruh rasa lambat itu satu unduhan.

   `profile_cells.bin` bersusun [y][x][var][level][waktu], jadi satu titik
   duduk bersebelahan dan cukup diminta sepotong. Terukur 0,18 detik.

   Polanya SALINAN dari bacaSel untuk point_cells.bin, termasuk cara
   memulangkan jendela kecil yang bentuknya sama dengan kisi penuh, supaya
   sampleProfile di bawah tidak perlu diubah sama sekali. */
const selProfilCache = new Map();

async function bacaSelProfil(meta, { x0, x1, y0, y1 }) {
  const c = meta.cells, nkol = x1 - x0 + 1, baris = y1 === y0 ? [y0] : [y0, y1];
  const potongan = await Promise.all(baris.map(async (y) => {
    const awal = (y * meta.nx + x0) * c.stride, akhir = awal + nkol * c.stride - 1;
    const r = await fetchUlang(DATA_BASE + c.file, { headers: { Range: "bytes=" + awal + "-" + akhir } });
    if (r.status !== 206) {
      /* Server yang mengabaikan Range membalas 200 berikut SELURUH berkas,
         dan itu 30 MB. Jangan ditelan, putuskan dan laporkan. */
      try { if (r.body) await r.body.cancel(); } catch (_) { /* abaikan */ }
      throw new Error(c.file + " HTTP " + r.status + ", bukan 206");
    }
    const b = new Uint8Array(await r.arrayBuffer());
    if (b.length !== nkol * c.stride)
      throw new Error(c.file + " potongan " + b.length + " bita, mau " + nkol * c.stride);
    return b;
  }));
  const nbar = baris.length, bidang = nkol * nbar;
  const nt = meta.times.length, nlev = meta.levels.length, vars = {};
  for (const v of meta.vars) {
    const u8 = v.dtype === "uint8";
    const arr = u8 ? new Uint8Array(nt * nlev * bidang) : new Int16Array(nt * nlev * bidang);
    for (let r = 0; r < nbar; r++) for (let k = 0; k < nkol; k++) {
      /* DataView, bukan Int16Array langsung, supaya tidak ada urusan
         perataan dua bita waktu potongannya tidak mulai di batas genap. */
      const dv = new DataView(potongan[r].buffer,
                              potongan[r].byteOffset + k * c.stride + v.cellOffset, v.cellLength);
      for (let l = 0; l < nlev; l++) for (let t = 0; t < nt; t++) {
        const dari = l * nt + t;                       // di dalam sel, [level][waktu]
        arr[(t * nlev + l) * bidang + r * nkol + k] = u8 ? dv.getUint8(dari) : dv.getInt16(dari * 2, true);
      }
    }
    vars[v.var] = { arr, scale: v.scale, offset: v.offset };
  }
  const [w, , , n] = meta.bounds, { dx, dy } = meta;
  return { meta: { ...meta, nx: nkol, ny: nbar,
                   bounds: [w + x0 * dx, n - y1 * dy, w + x1 * dx, n - y0 * dy] }, vars };
}

/* SELURUH KISI SEKALIGUS, dan ini MASIH DIPAKAI, bukan sisa yang menunggu
   dibuang.

   Dua pemakainya. Pertama katalog yang belum menulis profile_cells.bin.
   Kedua, dan ini yang menetap, MODE MJO LOKAL. Dia merata ratakan
   kelembapan sepanjang pita lintang untuk SETIAP bujur, jadi dia memang
   butuh seluruh kisi dan tidak bisa ditolong potongan per sel.

   Mode itu cuma hidup selama `mjo.json` belum berisi `amplop`. Diperiksa 19
   Oktober 2026, belum berisi, jadi jalur ini betul betul jalan. Kalau suatu
   saat backend mengirim amplopnya, barulah `profile.bin.gz` boleh dibuang
   dari pipeline. */
let profilBlob = null, profilBlobJanji = null;
async function muatProfilBlob(meta) {
  if (profilBlob) return profilBlob;
  if (!profilBlobJanji) {
    profilBlobJanji = (async () => {
      const gz = await fetch(DATA_BASE + "profile.bin.gz").then((r) => r.arrayBuffer());
      const stream = new Blob([gz]).stream().pipeThrough(new DecompressionStream("gzip"));
      const buf = await new Response(stream).arrayBuffer();
      const vars = {};
      for (const v of meta.vars) {
        const Ctor = v.dtype === "uint8" ? Uint8Array : Int16Array;
        vars[v.var] = { arr: new Ctor(buf, v.byteOffset, v.byteLength / Ctor.BYTES_PER_ELEMENT),
                        scale: v.scale, offset: v.offset };
      }
      profilBlob = { meta, vars };
      return profilBlob;
    })().catch((e) => { profilBlobJanji = null; throw e; });
  }
  return profilBlobJanji;
}

// Meta dulu, lalu blobnya. Dipakai mode MJO lokal yang butuh seluruh kisi.
async function muatProfilPenuh() {
  return muatProfilBlob(await muatProfilMeta());
}

// Profil siap pakai untuk satu titik. Lewat Range kalau katalognya sudah
// punya susunan per sel, kalau belum jatuh ke blob lama.
async function ambilProfil(lat, lon) {
  const meta = await muatProfilMeta();
  if (!meta.cells) return muatProfilBlob(meta);
  const sel = selSekitar(meta, lat, lon);
  const kunci = sel.x0 + "," + sel.y0;
  if (!selProfilCache.has(kunci)) {
    const janji = bacaSelProfil(meta, sel);
    janji.catch(() => selProfilCache.delete(kunci));
    selProfilCache.set(kunci, janji);
  }
  return selProfilCache.get(kunci);
}

// Index waktu profil terdekat dengan valid_time frame yang sedang ditampilkan.
function profileTimeIndex(pd) {
  const vt = frames && frames[current] && frames[current].valid_time;
  const ts = pd.meta.times;
  const hit = ts.indexOf(vt);
  if (hit >= 0) return hit;
  const target = new Date(vt || ts[0]).getTime();
  let best = 0, bd = Infinity;
  ts.forEach((t, i) => { const dd = Math.abs(new Date(t).getTime() - target); if (dd < bd) { bd = dd; best = i; } });
  return best;
}

// Profil vertikal di (lat,lon) untuk index waktu ti -> {levels,T,RH,u,v} per level.
function sampleProfile(pd, lat, lon, ti) {
  const { nx, ny, bounds, dx, dy, levels } = pd.meta;
  const nlev = levels.length, plane = nx * ny, [w, , , n] = bounds;
  const fx = Math.max(0, Math.min(nx - 1, (lon - w) / dx));
  const fy = Math.max(0, Math.min(ny - 1, (n - lat) / dy));
  const x0 = Math.floor(fx), x1 = Math.min(x0 + 1, nx - 1), tx = fx - x0;
  const y0 = Math.floor(fy), y1 = Math.min(y0 + 1, ny - 1), ty = fy - y0;
  const samp = (vv, lev) => {
    const b = (ti * nlev + lev) * plane;
    const A = vv.arr[b + y0 * nx + x0], B = vv.arr[b + y0 * nx + x1];
    const C = vv.arr[b + y1 * nx + x0], D = vv.arr[b + y1 * nx + x1];
    return ((1 - tx) * (1 - ty) * A + tx * (1 - ty) * B + (1 - tx) * ty * C + tx * ty * D) * vv.scale + vv.offset;
  };
  const out = { levels: levels.slice(), T: [], RH: [], u: [], v: [] };
  for (let l = 0; l < nlev; l++) {
    out.T.push(samp(pd.vars.t, l)); out.RH.push(Math.max(0, Math.min(100, samp(pd.vars.r, l))));
    out.u.push(samp(pd.vars.u, l)); out.v.push(samp(pd.vars.v, l));
  }
  return out;
}

// Export PLOT Skew-T (tanpa legenda) ke PNG. Rasterize SVG plot ke canvas,
// beri latar + border + bayangan neubrutalist agar rapi saat dibagikan.
function exportSkewTPng() {
  /* Sumbernya PINDAH 4 Oktober 2026 ikut kartu Skew-T yang keluar dari
     panel titik. Dulu wadah lipat di sidebar, dan begitu wadah itu
     dibuang tombol ekspor akan diam saja tanpa satu pun pesan. */
  const wrap = $("skt-card");
  /* DITUNJUK LANGSUNG ke kolom kiri. Dulu ini "svg pertama di kartu", dan
     itu benar selama kartunya cuma punya satu plot. Sejak 19 Oktober 2026
     ada hodograf dan panel theta-e di kolom kanan, jadi patokan "pertama"
     tinggal menunggu salah satu dari dua panel itu pindah ke atas. */
  const svgEl = wrap && wrap.querySelector(".skt-kiri svg");
  if (!svgEl) return;
  const vb = svgEl.viewBox.baseVal;
  const W = vb && vb.width ? vb.width : 340, H = vb && vb.height ? vb.height : 380;
  const xml = new XMLSerializer().serializeToString(svgEl);
  const img = new Image();
  img.onload = () => {
    const s = 2, M = 14, SH = 6;
    const cw = W + M * 2 + SH, ch = H + M * 2 + SH;
    const c = document.createElement("canvas");
    c.width = cw * s; c.height = ch * s;
    const x = c.getContext("2d");
    x.scale(s, s);
    x.fillStyle = "#ffffff"; x.fillRect(0, 0, cw, ch);         // latar
    x.fillStyle = "#ffffff"; x.fillRect(M, M, W, H);           // latar plot putih
    x.drawImage(img, M, M, W, H);
    x.lineWidth = 1; x.strokeStyle = "rgba(7,65,115,.35)"; x.strokeRect(M + 0.5, M + 0.5, W - 1, H - 1);
    c.toBlob((b) => {
      if (!b) return;
      const nm = (sharedPoint && sharedPoint.name) ? sharedPoint.name.replace(/[^\w-]+/g, "_")
        : (lastPoint ? lastPoint.lat.toFixed(2) + "_" + lastPoint.lon.toFixed(2) : "titik");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(b); a.download = `skewt_${nm}.png`; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }, "image/png");
  };
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(xml);
}

// Legenda garis/elemen diagram (di bawah plot, sebelum kartu indeks).
function skewtLegend() {
  const line = (c, dash) => `<svg width="24" height="10" viewBox="0 0 24 10"><line x1="1" y1="5" x2="23" y2="5" stroke="${c}" stroke-width="2"${dash ? ` stroke-dasharray="${dash}"` : ""}/></svg>`;
  const box = (fill) => `<svg width="24" height="10" viewBox="0 0 24 10"><rect x="1" y="1" width="22" height="8" fill="${fill}" stroke="#8FA0B3" stroke-width="0.5"/></svg>`;
  const barbSw = `<svg width="24" height="12" viewBox="0 0 24 12"><line x1="2" y1="6" x2="19" y2="6" stroke="#074173" stroke-width="1.2"/><line x1="19" y1="6" x2="23" y2="1" stroke="#074173" stroke-width="1.2"/><line x1="15" y1="6" x2="19" y2="1" stroke="#074173" stroke-width="1.2"/></svg>`;
  const it = (sw, label) => `<div class="skt-lg">${sw}<span>${label}</span></div>`;
  return `<div class="skt-legend">` +
    it(line("#e42320"), "Suhu (T)") +
    it(line("#1f8a4c"), "Titik embun (Td)") +
    it(line("#0b63b8", "3 2"), "Wetbulb (Tw)") +
    it(line("#074173", "4 3"), "Jalur parcel") +
    it(barbSw, "Angin (barbs)") +
    it(line("#0029d7", "5 3"), "LCL · dasar awan") +
    it(line("#d97706", "5 3"), "LFC · mulai konveksi") +
    it(line("#7a1fa2", "5 3"), "EL · puncak konveksi") +
    it(box("rgba(226,35,32,.30)"), "CAPE · energi naik") +
    it(box("rgba(35,96,200,.25)"), "CIN · penghambat") +
    it(box("rgba(93,235,215,.35)"), "DGZ · zona tumbuh kristal es") +
    `</div>`;
}

/* Tabel indeks di bawah diagram.

   TIGA PARCEL berdampingan, bukan satu. Parcel permukaan itu yang paling
   gampang dijelaskan, tapi dia juga yang paling gampang menipu, sebab satu
   lapisan tipis yang panas di dekat tanah bisa melambungkan CAPE padahal
   yang benar benar terangkat waktu konveksi itu lapisan campur. Parcel
   paling tak stabil berguna waktu udara labilnya justru duduk di ATAS
   lapisan dingin dekat tanah, keadaan yang biasa terjadi malam hari.

   YANG SENGAJA TIDAK DIPASANG di sini, STP, SCP, SHIP, EHI, dan SRH. Semua
   itu indeks superset badai lintang tengah, disetel untuk tornado di
   dataran Amerika. Di Indonesia angkanya hampir selalu nol, dan yang tidak
   nol pun artinya bukan yang tertulis di namanya. Memasangnya membuat
   tabelnya terlihat mentereng dan isinya derau. */
function skewtTabel(d) {
  const fmtP = (p) => (p ? Math.round(p) + "" : "–");
  const capeCol = (c) => c > 2500 ? "#d61f1f" : c > 1000 ? "#e8590c" : c > 300 ? "#f59f00" : "#2b8a3e";
  const kol = [["SB", d.sb], ["ML", d.ml], ["MU", d.mu]];

  const baris = (label, isi, satuan) =>
    `<tr><th>${label}</th>` + kol.map(([, pc]) => isi(pc)).join("") +
    `<td class="skt-sat">${satuan || ""}</td></tr>`;

  const tabel =
    `<table class="skt-tabel"><thead><tr><th></th>` +
    kol.map(([n]) => `<th>${n}</th>`).join("") + `<th></th></tr></thead><tbody>` +
    baris("CAPE", (pc) => `<td style="color:${capeCol(pc.cape)}">${Math.round(pc.cape)}</td>`, "J/kg") +
    baris("CIN", (pc) => `<td style="color:${pc.cin < -50 ? "#e8590c" : ""}">${Math.round(pc.cin)}</td>`, "J/kg") +
    baris("LCL", (pc) => `<td>${fmtP(pc.lcl.p)}</td>`, "hPa") +
    baris("LFC", (pc) => `<td>${fmtP(pc.lfc)}</td>`, "hPa") +
    baris("EL", (pc) => `<td>${fmtP(pc.el)}</td>`, "hPa") +
    `</tbody></table>`;

  const sel = (label, val, col) =>
    `<div class="skt-cell"><span class="skt-k">${label}</span>` +
    `<span class="skt-v" style="color:${col || ""}">${val}</span></div>`;
  const km = (m) => (m === null || m === undefined) ? "–" : (m / 1000).toFixed(1) + " km";
  const dgzTebal = d.dgz ? Math.round(d.dgz.pBawah - d.dgz.pAtas) + " hPa" : "–";

  const sisa = `<div class="skt-idx">` +
    sel("LI", d.li !== null ? d.li.toFixed(1) : "–", d.li !== null && d.li < -2 ? "#d61f1f" : "") +
    sel("Air mampu curah", Math.round(d.pwat) + " mm", d.pwat > 50 ? "#e8590c" : "") +
    sel("K-index", d.kIndex !== null ? Math.round(d.kIndex) : "–", d.kIndex !== null && d.kIndex > 30 ? "#e8590c" : "") +
    sel("Total Totals", d.totalTotals !== null ? Math.round(d.totalTotals) : "–") +
    sel("Tinggi beku", km(d.beku ? d.beku.z : null)) +
    sel("Tebal DGZ", dgzTebal) +
    sel("Geser 0-1 km", Math.round(d.geser.km1) + " kt") +
    sel("Geser 0-6 km", Math.round(d.geser.km6) + " kt") +
    `</div>`;
  return tabel + sisa;
}

// Skeleton loading kartu Skew-T (meniru layout: catatan + plot + export + legenda + indeks).
function skewtSkeleton() {
  return `<div class="pt-skel skt-skel">` +
    `<div class="sk-bar skt-sk-note"></div>` +
    `<div class="sk-bar skt-sk-plot"></div>` +
    `<div class="sk-bar skt-sk-exp"></div>` +
    `<div class="skt-sk-idx">${"<div class='sk-bar'></div>".repeat(6)}</div>` +
    `</div>`;
}

/* ================= MODE SKEW-T =================
   4 Oktober 2026, diminta user. Skew-T dikeluarkan dari panel titik dan jadi
   ALAT di kartu Fitur. Dinyalakan dulu, lalu titiknya ditunjuk di peta, lalu
   hasilnya tampil di kartu tengah layar.

   Modenya MATI SENDIRI sesudah satu titik dipilih. Kalau dibiarkan menyala,
   klik biasa ke peta tidak lagi membuka panel titik dan orang bisa merasa
   petanya rusak tanpa tahu sebabnya. Menyalakannya lagi cuma satu klik. */
let skewtMode = false;
let sktTitik = null;        // titik yang sedang diplot, dipakai saat waktu berubah

function setSkewtMode(on) {
  skewtMode = !!on;
  $("skewt-toggle")?.classList.toggle("active", skewtMode);
  document.getElementById("stage")?.classList.toggle("mode-skewt", skewtMode);
  /* Tulisan di petunjuk kursor ikut berganti, jadi orang tahu klik
     berikutnya akan melakukan hal yang berbeda dari biasanya. */
  const t = $("klik-petunjuk");
  /* "Generate Skew-T plot here", BUKAN "Generate Plot Skew-T here". Yang lama
     memakai urutan Indonesia, diterangkan lalu menerangkan. Di Inggris
     penerangnya di depan, jadi Skew-T menerangkan plot. Dikoreksi pemilik
     5 Oktober 2026. "Click Here" dibiarkan apa adanya, itu tulisan yang
     dia minta persis begitu. */
  if (t) t.textContent = skewtMode ? "Generate Skew-T plot here" : "Click Here";
}

/* SEMUA klik di peta jatuh ke sounding selama mode Skew-T menyala, termasuk
   klik di ikon kota dan di ikon siklon.

   Dulu cuma klik peta kosong yang kebagian. Penanda kota memasang
   pendengarnya sendiri lalu memanggil stopPropagation, jadi kliknya tidak
   pernah sampai ke pendengar peta dan yang terbuka justru panel detail.
   Dilaporkan pemilik, dan memang membingungkan, sebab kursornya sudah
   bertuliskan "Generate Skew-T plot here" tapi yang keluar bukan itu.

   Mengembalikan true kalau kliknya sudah ditangani sebagai Skew-T, jadi
   pemanggilnya tahu harus berhenti. */
function sktTangkap(lat, lon, nama) {
  if (!skewtMode) return false;
  setSkewtMode(false);
  bukaSkewT(lat, lon, nama);
  return true;
}

async function bukaSkewT(lat, lon, nama) {
  const ov = $("skt-overlay"), isi = $("skt-card")?.querySelector(".skt-isi");
  if (!ov || !isi) return;
  sktTitik = { lat, lon, nama };
  ov.classList.add("show");
  isi.innerHTML = skewtSkeleton();
  let pd;
  try { pd = await ambilProfil(lat, lon); }
  catch (e) { isi.innerHTML = `<div class="skt-load">Profil belum tersedia untuk model ini.</div>`; return; }
  if (!ov.classList.contains("show")) return;          // keburu ditutup
  const ti = profileTimeIndex(pd);
  const prof = sampleProfile(pd, lat, lon, ti);
  const d = window.SkewT.derive(prof);
  isi.innerHTML =
    `<div class="skt-kepala">` +
      `<span class="skt-tag">Profil Atmosfer · Skew-T</span>` +
      `<span class="skt-koord mono">` +
        (nama ? `<b class="skt-nama">${escHtml(nama)}</b> · ` : "") +
        fmtCoord(lat, lon) + `</span>` +
    `</div>` +
    `<div class="skt-badan">` +
      `<div class="skt-kiri">` +
        window.SkewT.svg(d, { W: 340, H: 380 }) +
        /* Legenda DUDUK DI BAWAH PLOT, bukan di kolom kanan. Diminta
           pemilik 19 Okt, dan memang di situ tempatnya. Kolom kiri
           menyisakan ruang kosong setinggi hampir tiga ratus piksel di
           bawah diagram, sedangkan kolom kanan sudah penuh. Lagipula
           legenda itu menerangkan garis garis di diagram, jadi lebih enak
           dibaca sambil melihat diagramnya. */
        skewtLegend() +
      `</div>` +
      `<div class="skt-kanan">` +
        `<div class="skt-panel-row">` +
          window.SkewT.hodo(d, { W: 196, H: 196 }) +
          window.SkewT.thetaePanel(d, { W: 196, H: 196 }) +
        `</div>` +
        /* NAMA MODELNYA IKUT, jangan dipatok GFS. Sejak ada ECMWF 9 km,
           Skew-T bisa datang dari model mana pun yang punya
           profile_meta.json, dan catatan yang menyebut GFS di sounding
           ECMWF itu keterangan yang SALAH tentang asal data, bukan sekadar
           label yang kurang rapi. */
        `<div class="skt-note">Profil ${fmtValid(pd.meta.times[ti])} · indikasi ${MODEL.label} (grid ~1°), bukan sounding asli.</div>` +
        skewtTabel(d) +
        `<div class="skt-exp-row"><button type="button" class="skt-export" id="skt-export">` +
        `<span class="material-symbols-outlined">image</span> Export PNG</button></div>` +
      `</div>` +
    `</div>`;
  $("skt-export")?.addEventListener("click", exportSkewTPng);
}
function tutupSkewT() {
  $("skt-overlay")?.classList.remove("show");
  sktTitik = null;
}
/* Waktu frame berganti sementara kartunya terbuka, profilnya digambar ulang
   untuk titik yang sama. Tanpa ini kartunya menunjukkan jam lama sedangkan
   peta di belakangnya sudah pindah jam. */
function segarkanSkewT() {
  if (sktTitik && $("skt-overlay")?.classList.contains("show"))
    bukaSkewT(sktTitik.lat, sktTitik.lon, sktTitik.nama);
}

function fmtCoord(lat, lon) {
  return Math.abs(lat).toFixed(2) + "° " + (lat >= 0 ? "LU" : "LS") + " · " +
         Math.abs(lon).toFixed(2) + "° " + (lon >= 0 ? "BT" : "BB");
}
function fmtHour(iso) { const w = toWIB(iso); return w.getUTCDate() + "/" + String(w.getUTCHours()).padStart(2, "0"); }

// Judul panel titik: koordinat (klik acak), nama kota (search/ikon), atau
// alamat hasil reverse-geocoding (tombol "lokasi saya"). Token menjaga agar
// hasil geocoding yang datang telat tak menimpa titik lain yang keburu dipilih.
let pointToken = 0;
function setPointLabel(text, kind) { // kind: "coord" | "addr" | "loading"
  const c = $("pt-coords"); if (!c) return;
  c.textContent = text;
  c.classList.toggle("mono", kind === "coord");
  c.classList.toggle("pt-addr", kind === "addr" || kind === "loading");
}

// Susun alamat awam "Kelurahan, Kecamatan, Kota/Kabupaten" dari address
// Nominatim (tag OSM Indonesia tak konsisten → ambil sebisanya lalu dedup).
function addressLabel(a) {
  if (!a) return null;
  const kel = a.village || a.neighbourhood || a.hamlet || a.suburb;
  const kec = a.municipality || a.subdistrict || a.city_district;
  const kk  = a.city || a.town || a.county || a.regency;
  const seen = new Set(), parts = [];
  for (const x of [kel, kec, kk, a.state])
    if (x && !seen.has(x)) { seen.add(x); parts.push(x); }
  return parts.slice(0, 3).join(", ") || null;
}

// Reverse-geocode via Nominatim (OpenStreetMap) — dipakai HANYA untuk tombol
// "lokasi saya" (jarang & dipicu user, sesuai kebijakan pemakaian wajar).
async function reverseGeocode(lat, lon) {
  const url = "https://nominatim.openstreetmap.org/reverse?format=jsonv2" +
    "&lat=" + lat + "&lon=" + lon + "&zoom=14&addressdetails=1&accept-language=id";
  const r = await fetch(url, { headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error("geocode " + r.status);
  return addressLabel((await r.json()).address);
}

// Cari alamat lalu perbarui judul; gagal / titik sudah diganti → koordinat.
async function fillAddress(lat, lon) {
  const token = pointToken;
  setPointLabel("Mencari alamat…", "loading");
  try {
    const addr = await reverseGeocode(lat, lon);
    if (pointToken !== token) return;
    setPointLabel(addr || fmtCoord(lat, lon), addr ? "addr" : "coord");
    if (sharedPoint && addr) { sharedPoint.name = addr; updateHash(); }
  } catch (_) {
    if (pointToken !== token) return;
    setPointLabel(fmtCoord(lat, lon), "coord");
  }
}

// Deret-waktu untuk VARIABEL yang sedang dipilih (ikut layer aktif).
function chartSeries(pd, lat, lon) {
  const times = pd.meta.times;
  // yDomain = [bawah, atas] skala sumbu Y tetap. Utk tekanan sengaja TERBALIK
  // (1200 di bawah → 400 di atas) meniru profil atmosfer vertikal: tekanan
  // tertinggi di permukaan. Tanpa yDomain → skala otomatis dari data (mulai 0).
  const num = (v, label, unit, color, type, yDomain) =>
    ({ label, unit, color, type, times, values: sampleVar(pd, v, lat, lon), yDomain });
  // Panel titik = prakiraan PERMUKAAN (di tempat berdiri). Bila peta sedang di
  // level strato, grafik ikut variabel permukaan padanannya (data titik = permukaan).
  switch (BASE_OF[activeLayer] || activeLayer) {
    case "wind_surface": {
      const u = sampleVar(pd, "u", lat, lon), v = sampleVar(pd, "v", lat, lon);
      /* Deret dari city_data tidak punya u dan v, cuma kecepatan jadi. Tanpa
         penjaga ini u.map melempar dan SELURUH panelnya gagal, bukan cuma
         grafiknya. */
      const nilai = u && v
        ? u.map((uu, i) => Math.sqrt(uu * uu + v[i] * v[i]) * MS_TO_KT)
        : sampleVar(pd, "wind", lat, lon);
      return { label: "Kecepatan Angin", unit: "kt", color: "#0029d7", type: "line",
               times, values: nilai || [] };
    }
    case "temp_surface": return num("temp", "Suhu", "°C", "#e42320", "line", [0, 50]);
    case "humidity_surface": return num("humidity", "Kelembapan", "%", "#1f8a5c", "line", [0, 100]);
    case "cloud_surface": return num("cloud", "Tutupan Awan", "%", "#4A6685", "line", [0, 100]);
    case "pressure_surface": return num("pressure", "Tekanan", "hPa", "#7a3fb0", "line", [1200, 400]);
    case "storm_potential": return num("cape", "CAPE", "J/kg", "#e84a2f", "line", [0, 4000]);
    // Sumbu CIN sengaja 0 di atas, -400 di bawah: makin ke bawah makin tebal tutupnya.
    case "cin_surface": return num("cin", "CIN", "J/kg", "#8a29c8", "line", [-400, 0]);
    case "rain_accum_surface": {
      const rain = sampleVar(pd, "rain", lat, lon), days = {};
      times.forEach((t, i) => { const d = t.slice(0, 10); days[d] = (days[d] || 0) + rain[i] * STEP_JAM; });
      const dts = Object.keys(days).sort();
      return { label: "Akumulasi Hujan Harian", unit: "mm/hari", color: "#2360c8", type: "line",
               times: dts.map((d) => d + "T00:00:00Z"), values: dts.map((d) => days[d]), daily: true };
    }
    default: return num("rain", "Hujan", "mm", "#2360c8", "line"); // rain_surface
  }
}

/* Warna deret grafik di panel titik, dibaca dari token --aksen di style.css
   supaya tidak ada angka warna yang harus disunting di dua tempat. */
function warnaDeret() {
  return getComputedStyle(document.documentElement).getPropertyValue("--aksen").trim() || "#1679AB";
}

function chartSVG(spec) {
  /* WARNA DERET, sejarahnya. 8 Sep dipaksa tinta #333 ikut rebranding, sebab
     tiap grafik di panel ini cuma punya SATU deret dan warnanya tidak
     membedakan apa apa. 11 Sep jadi TERAKOTA, diminta user, supaya garis
     ramalan di titik yang dipilih terbaca sebagai hal yang disorot.
     Kalau suatu saat grafiknya berisi lebih dari satu deret, kembalikan
     `color` dari spec dan beri tiap deret warnanya sendiri. */
  const { values, type, times, daily } = spec;
  const color = warnaDeret();
  const n = values.length;
  if (!n) return "";
  // Padding asimetris: kiri utk label sumbu-Y, bawah utk label waktu sumbu-X.
  const W = 330, H = 162, padL = 32, padR = 8, padT = 12, padB = 26;
  const plotW = W - padL - padR, plotH = H - padT - padB, y0 = padT + plotH;
  const vmin = Math.min(...values), vmax = Math.max(...values);
  // lo = nilai di DASAR sumbu, hi = nilai di PUNCAK. Bila yDomain diberi, pakai
  // itu (bisa terbalik spt tekanan: lo=1200 > hi=400). Selain itu otomatis mulai 0.
  const [lo, hi] = spec.yDomain
    ? [spec.yDomain[0], spec.yDomain[1]]
    : [Math.min(0, vmin), vmax === Math.min(0, vmin) ? Math.min(0, vmin) + 1 : vmax];
  const x = (i) => padL + plotW * (n <= 1 ? 0.5 : i / (n - 1));
  const y = (v) => y0 - plotH * ((v - lo) / (hi - lo));
  const fmt = (v) => (Math.abs(v) < 10 ? v.toFixed(1) : v.toFixed(0));
  const tms = times ? times.map((t) => new Date(t).getTime()) : [];
  const nowT = nowMs();

  // Posisi pecahan "kini" di dalam deret (utk memisah garis solid vs putus-putus).
  let sxi = n - 1;
  if (times && n > 1) {
    if (nowT <= tms[0]) sxi = 0;
    else if (nowT >= tms[n - 1]) sxi = n - 1;
    else for (let i = 0; i < n - 1; i++)
      if (nowT >= tms[i] && nowT <= tms[i + 1]) { sxi = i + (nowT - tms[i]) / (tms[i + 1] - tms[i]); break; }
  }
  const sx = x(sxi);

  // ---- data (bar: solid=terlewati, transparan+outline putus=forecast) ----
  let body = "";
  if (type === "bar") {
    const bw = Math.max(3, (plotW / n) * 0.6);
    for (let i = 0; i < n; i++) {
      const past = !times || tms[i] <= nowT;
      const bx = (x(i) - bw / 2).toFixed(1), by = y(values[i]).toFixed(1), bh = (y0 - y(values[i])).toFixed(1);
      body += `<rect x="${bx}" y="${by}" width="${bw.toFixed(1)}" height="${bh}" fill="${color}" ` +
        (past ? `opacity="0.82"/>` : `opacity="0.26" stroke="${color}" stroke-width="1" stroke-dasharray="3 2"/>`);
    }
  } else {
    const pts = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
    if (type === "area")
      body += `<path d="${pts}L${x(n - 1).toFixed(1)},${y0}L${x(0).toFixed(1)},${y0}Z" fill="${color}" opacity="0.14"/>`;
    // Garis digambar 2x: klip kiri "kini" = solid, klip kanan = putus-putus.
    body += `<clipPath id="cpPast"><rect x="0" y="0" width="${sx.toFixed(1)}" height="${H}"/></clipPath>` +
            `<clipPath id="cpFut"><rect x="${sx.toFixed(1)}" y="0" width="${(W - sx).toFixed(1)}" height="${H}"/></clipPath>`;
    body += `<path d="${pts}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linejoin="round" clip-path="url(#cpPast)"/>`;
    body += `<path d="${pts}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linejoin="round" stroke-dasharray="5 4" opacity="0.55" clip-path="url(#cpFut)"/>`;
  }

  // ---- sumbu X & Y + tick label (tanpa grid) ----
  const AX = `stroke="rgba(7,65,115,.35)" stroke-width="1"`;
  let axes = `<line x1="${padL}" y1="${padT}" x2="${padL}" y2="${y0}" ${AX}/>` +
             `<line x1="${padL}" y1="${y0}" x2="${padL + plotW}" y2="${y0}" ${AX}/>`;
  for (const tv of [hi, (lo + hi) / 2, lo]) {
    const yy = y(tv);
    axes += `<line x1="${padL - 3}" y1="${yy.toFixed(1)}" x2="${padL}" y2="${yy.toFixed(1)}" ${AX}/>` +
            `<text x="${padL - 5}" y="${(yy + 3).toFixed(1)}" class="pt-ax" text-anchor="end">${fmt(tv)}</text>`;
  }
  if (times) {
    const nt = Math.min(5, n), last = n - 1;
    let prevDay = null;
    for (let k = 0; k < nt; k++) {
      const i = nt <= 1 ? 0 : Math.round((k * last) / (nt - 1));
      const xx = x(i), w = toWIB(times[i]), day = w.getUTCDate();
      const lbl = (daily || prevDay === null || day !== prevDay)
        ? day + "/" + (w.getUTCMonth() + 1)
        : String(w.getUTCHours()).padStart(2, "0") + ":00";
      prevDay = day;
      const anchor = i === 0 ? "start" : i === last ? "end" : "middle";
      axes += `<line x1="${xx.toFixed(1)}" y1="${y0}" x2="${xx.toFixed(1)}" y2="${y0 + 3}" ${AX}/>` +
              `<text x="${xx.toFixed(1)}" y="${y0 + 14}" class="pt-ax" text-anchor="${anchor}">${lbl}</text>`;
    }
    // garis acuan real-time di batas solid/forecast (tanpa teks — dijelaskan legenda)
    if (sx > padL + 1 && sx < padL + plotW - 1)
      axes += `<line class="pt-kini" x1="${sx.toFixed(1)}" y1="${padT}" x2="${sx.toFixed(1)}" y2="${y0}" stroke="rgba(7,65,115,.5)" stroke-width="1" stroke-dasharray="2 3" opacity="0.9"/>`;
  }

  return `<svg class="pt-meteo" viewBox="0 0 ${W} ${H}" width="100%">` +
    `<rect x="1" y="1" width="${W - 2}" height="${H - 2}" fill="#ffffff" stroke="rgba(7,65,115,.2)" stroke-width="1"/>` +
    axes + body + `</svg>`;
}

// Legenda bawah frame grafik: garis solid = kondisi sekarang, putus = forecast.
function chartLegend(color) {
  const line = (dash) => `<svg width="24" height="8" viewBox="0 0 24 8">` +
    `<line x1="1" y1="4" x2="23" y2="4" stroke="${color}" stroke-width="1.6"${dash ? ` stroke-dasharray="5 4"` : ""}/></svg>`;
  return `<div class="chart-legend">` +
    `<span class="chl-key">${line(false)}Kondisi Sekarang</span>` +
    `<span class="chl-key">${line(true)}<i>Forecast</i></span></div>`;
}

/* =====================================================================
   PLOT BANDING ANTAR MODEL. 21 Oktober 2026, diminta pemilik.

   Satu plot, satu parameter, beberapa model bersebelahan. Dipanggil dari
   tombol di samping CSV di kepala panel titik.

   DIBANGUN DI ATAS chartSeries DAN chartSVG YANG SUDAH ADA, dua duanya
   peninggalan grafik sidebar lama yang sejak panel pindah ke bawah tidak
   dipanggil siapa pun lagi. Yang dipakai ulang chartSeries, sebab dia yang
   tahu variabel mana yang mewakili tiap layer, bagaimana angin dihitung
   dari u dan v, dan bagaimana hujan diakumulasi per hari. Menulis ulang
   switch itu di sini berarti dua tempat yang harus disunting tiap ada layer
   baru, dan yang kedua pasti terlupa.

   Yang TIDAK dipakai ulang chartSVG, dan ini sebabnya. Sumbu X chartSVG
   berbasis INDEKS, titik ke-i diletakkan di i/(n-1). Itu benar selama cuma
   ada satu deret, tapi di sini model panjangnya beda beda. WRF biasanya
   berhenti jauh lebih awal daripada GFS. Dengan sumbu indeks, langkah
   terakhir WRF akan ditarik ke ujung kanan dan sejajar dengan langkah
   terakhir GFS, padahal jam dindingnya berbeda setengah hari. Dua garis
   yang beda panjang akan terbaca seolah olah sama panjang, dan itu
   kesalahan yang tidak kelihatan sebagai kesalahan.

   Jadi sumbu X di sini WAKTU BETULAN, dalam milidetik. Model yang lebih
   pendek garisnya memang berhenti lebih awal di tengah bidang plot, dan
   itu memang yang diminta pemilik.
   ===================================================================== */

/* Model yang boleh ikut. Urutannya ikut urutan di MODELS, jadi warnanya
   konsisten dari satu titik ke titik berikutnya. */
function modelBanding() {
  return Object.keys(MODELS).filter((id) => {
    const m = MODELS[id];
    if (!modelHidup(id) || !m.base) return false;
    /* Satelit TIDAK IKUT. Dia pengamatan, bukan ramalan, tidak punya
       panel titik, dan garis waktunya garis waktu yang berbeda jenis. */
    if (m.satelit) return false;
    return true;
  });
}

/* GERBANG SANDI TIDAK BERLAKU DI PLOT INI, diputuskan pemilik 21 Oktober
   2026. Model privat ikut jadi garis pembanding tanpa diminta sandi dulu.

   Alasannya yang dibagi di sini cuma SATU DERET ANGKA untuk satu titik
   pada satu parameter, bukan petanya, bukan arsipnya, dan bukan pilihan
   modelnya di dropdown. Gerbang di dropdown tetap utuh, jadi membuka WRF
   sebagai model tetap menuntut sandi seperti biasa.

   Versi pertama memasang gerbangnya di sini juga, dan akibatnya plot yang
   dibuka dari GFS cuma punya dua garis sedangkan yang paling ingin diadu
   justru tiga. */

/* Alamat yang BETUL BETUL berisi data model itu.

   Tidak bisa sekadar MODELS[id].base, dan itu bug yang kena betulan 21
   Oktober 2026. Begitu ECMWF hidup, folder di hostingan masih kosong dan
   datanya ada di cadangan GitAction. Peta tetap jalan sebab ambilKatalog
   sudah memilih sumber lalu menyimpannya di DATA_BASE, tapi plot banding
   membaca base mentah dari tabel, kena 404, dan melaporkan "data belum
   ada" untuk model yang justru sedang ditampilkan di layar.

   Untuk model yang sedang dibuka, jawabannya DATA_BASE, yaitu sumber yang
   sudah menang. Untuk model lain belum ada yang memilihkan, jadi dicoba
   sendiri, yang dekat dulu baru cadangannya. */
async function baseBerisi(id) {
  if (id === MODEL_ID) return DATA_BASE;
  const m = MODELS[id];
  try { await loadPointMeta(false, m.base); return m.base; } catch (_) { /* coba cadangan */ }
  if (DATA_CADANGAN && m.cadangan) {
    const c = DATA_CADANGAN + m.cadangan;
    await loadPointMeta(false, c);
    return c;
  }
  throw new Error("point_meta tidak ada di dekat maupun cadangan");
}

/* Titik di luar domain sebuah model DILEWATI, bukan digambar.

   Tanpa penjaga ini garisnya tetap muncul dan kelihatan masuk akal.
   sampleVar menjepit posisi pecahan ke tepi kisi, jadi titik di luar
   domain memulangkan nilai SEL TEPI, bukan null dan bukan galat. Untuk
   model berdomain sempit itu berarti seluruh deretnya diambil dari pojok
   domain yang bisa ribuan kilometer dari titik yang diklik. */
function didalamDomain(meta, lat, lon) {
  const [w, s, e, n] = meta.bounds;
  return lon >= Math.min(w, e) && lon <= Math.max(w, e)
      && lat >= Math.min(s, n) && lat <= Math.max(s, n);
}

async function deretBanding(lat, lon) {
  const hasil = await Promise.all(modelBanding().map(async (id) => {
    const m = MODELS[id];
    try {
      const base = await baseBerisi(id);
      const meta = await loadPointMeta(false, base);
      if (!didalamDomain(meta, lat, lon)) {
        return { id, label: m.label, warna: m.warna, lewat: "di luar domain" };
      }
      const pd = await ambilTitik(lat, lon, base);
      const s = chartSeries(pd, lat, lon);
      if (!s || !s.values || !s.values.length || s.values.some((v) => !isFinite(v)))
        return { id, label: m.label, warna: m.warna, lewat: "parameter ini tidak ada" };
      return { id, label: m.label, warna: m.warna || warnaDeret(),
               judul: s.label, satuan: s.unit, yDomain: s.yDomain, daily: s.daily,
               times: s.times, values: s.values };
    } catch (e) {
      /* Satu model yang gagal TIDAK menjatuhkan plotnya. Yang paling sering
         terjadi model itu memang belum punya kirimannya, dan plot dua garis
         tetap berguna. Sebabnya ditulis ke console buat yang mencari tahu,
         dan ke legenda buat yang cuma melihat. */
      console.info("[banding] " + id + " dilewati: " + (e && e.message));
      return { id, label: m.label, warna: m.warna, lewat: "data belum ada" };
    }
  }));
  return hasil;
}

/* SVG beberapa garis pada satu sumbu waktu. */
function chartBandingSVG(deret) {
  const isi = deret.filter((d) => !d.lewat);
  if (!isi.length) return "";
  const W = 760, H = 330, padL = 46, padR = 14, padT = 16, padB = 34;
  const plotW = W - padL - padR, plotH = H - padT - padB, y0 = padT + plotH;

  // Sumbu X dibentang dari waktu paling awal sampai paling akhir DI SELURUH
  // model, jadi model yang pendek berhenti di tengah bidang.
  const ms = (t) => new Date(t).getTime();
  let t0 = Infinity, t1 = -Infinity;
  for (const d of isi) for (const t of d.times) {
    const v = ms(t); if (v < t0) t0 = v; if (v > t1) t1 = v;
  }
  if (!(t1 > t0)) t1 = t0 + 3600e3;

  /* Sumbu Y dari RENTANG DATA, bukan dari yDomain layernya, dan itu beda
     dengan grafik satu deret.

     yDomain dipakai di peta supaya skalanya tetap dari satu titik ke titik
     berikutnya, jadi orang bisa membandingkan dua tempat. Di sini yang
     dibandingkan bukan tempat, tapi MODEL di satu tempat yang sama, dan
     selisih antar model itu kecil. Suhu di Jakarta terukur 25,6 sampai
     34,1 untuk ketiga model digabung, sedangkan yDomain suhu 0 sampai 50.
     Dengan skala itu ketiga garisnya berdesakan di seperlima tengah bidang
     dan selisih dua derajat antar model praktis tidak kelihatan, padahal
     justru itu yang mau dilihat.

     Rentangnya dihitung dari SEMUA model digabung, bukan per model. Kalau
     per model, dua garis yang nilainya jauh berbeda akan sama sama
     memenuhi bidang dan terbaca seolah olah berimpit. */
  let vmin = Infinity, vmax = -Infinity;
  for (const d of isi) for (const v of d.values) { if (v < vmin) vmin = v; if (v > vmax) vmax = v; }
  if (!isFinite(vmin)) { vmin = 0; vmax = 1; }
  let lo, hi;
  if (vmax === vmin) { lo = vmin - 1; hi = vmax + 1; }
  else {
    const margin = (vmax - vmin) * 0.08;
    /* Dasarnya TIDAK ditarik ke bawah nol untuk besaran yang memang tidak
       pernah negatif, kalau tidak hujan dan CAPE kehilangan bidang di bawah
       garisnya tanpa ada yang digambar di situ. */
    lo = vmin >= 0 && vmin - margin < 0 ? 0 : vmin - margin;
    hi = vmax + margin;
  }
  /* LANGKAH SUMBU DIBULATKAN KE ANGKA YANG ENAK DIBACA, lalu lo dan hi
     ditarik ke kelipatannya. Tanpa ini sumbunya berlabel 26.06, 26.56,
     27.05, 27.54, 28.04, yaitu lima angka yang semuanya benar dan tidak
     satu pun mudah dibaca.

     Percobaan sebelumnya membulatkan desimal menurut lebar rentang, dan itu
     memang menghapus label kembar seperti 28, 28, 27, 27, 26 yang sempat
     muncul waktu rentangnya cuma dua derajat. Tapi yang hilang cuma
     kembarnya, bukan angka ganjilnya.

     Langkahnya dipilih dari 1, 2, 2,5, dan 5 dikali pangkat sepuluh, pola
     yang sama dipakai hampir semua pustaka grafik. Banyaknya desimal ikut
     langkah, jadi langkah 0,5 memberi satu desimal dan langkah 5 memberi
     nol, tanpa perlu aturan terpisah. */
  const kasar = Math.abs(hi - lo) / 4 || 1;
  const pangkat = Math.pow(10, Math.floor(Math.log10(kasar)));
  const langkah = [1, 2, 2.5, 5, 10].map((m) => m * pangkat).find((v) => v >= kasar) || pangkat * 10;
  lo = Math.floor(lo / langkah) * langkah;
  hi = Math.ceil(hi / langkah) * langkah;
  if (hi === lo) hi = lo + langkah;
  /* yDomain tidak dipakai sebagai rentang tampil, tapi MASIH BERGUNA sebagai
     batas fisik. Kelembapan 70 sampai 100 persen dibulatkan ke atas jadi
     110, dan sumbu kelembapan yang berlabel 110 persen terbaca seperti
     kesalahan hitung.

     Dijepit HANYA kalau tidak memotong datanya sendiri. CAPE punya yDomain
     0 sampai 4000 sedangkan nilainya di sini terukur sampai 6424, jadi
     menjepitnya ke 4000 akan membuang puncak yang justru paling penting.
     Batas yang membuang data bukan batas, itu kesalahan. */
  const dom = isi[0].yDomain;
  if (dom) {
    const dmin = Math.min(dom[0], dom[1]), dmax = Math.max(dom[0], dom[1]);
    if (dmax >= vmax && hi > dmax) hi = dmax;
    if (dmin <= vmin && lo < dmin) lo = dmin;
    if (hi <= lo) { lo = Math.floor(vmin / langkah) * langkah; hi = lo + langkah; }
  }
  /* Desimalnya harus cukup untuk menulis LANGKAHNYA SENDIRI dengan tepat,
     bukan sekadar mengikuti pangkat sepuluhnya. Langkah 2,5 punya pangkat
     sepuluh nol, jadi aturan pangkat memberi nol desimal dan sumbunya
     keluar sebagai 25, 28, 30, 32, 35. Kelimanya berjarak sama persis,
     tapi dibaca jaraknya naik turun, dan sumbu yang berbohong soal
     jaraknya sendiri lebih buruk daripada sumbu yang angkanya panjang. */
  let des = 0;
  while (des < 3 && Math.abs(parseFloat(langkah.toFixed(des)) - langkah) > 1e-9) des++;
  des = Math.max(des, Math.min(3, Math.max(0, -Math.floor(Math.log10(langkah)))));
  const x = (t) => padL + plotW * ((t - t0) / (t1 - t0));
  const y = (v) => y0 - plotH * ((v - lo) / (hi - lo));
  const fmt = (v) => v.toFixed(des);
  const nowT = nowMs();
  const sx = Math.max(padL, Math.min(padL + plotW, x(nowT)));

  // ---- sumbu ----
  const AX = `stroke="rgba(7,65,115,.35)" stroke-width="1"`;
  let axes = `<line x1="${padL}" y1="${padT}" x2="${padL}" y2="${y0}" ${AX}/>` +
             `<line x1="${padL}" y1="${y0}" x2="${padL + plotW}" y2="${y0}" ${AX}/>`;
  const tandaY = [];
  for (let v = lo; v <= hi + langkah * 0.001; v += langkah) tandaY.push(v);
  for (const tv of tandaY) {
    const yy = y(tv);
    axes += `<line x1="${padL - 3}" y1="${yy.toFixed(1)}" x2="${padL}" y2="${yy.toFixed(1)}" ${AX}/>` +
            `<line x1="${padL}" y1="${yy.toFixed(1)}" x2="${(padL + plotW).toFixed(1)}" y2="${yy.toFixed(1)}" stroke="rgba(7,65,115,.08)" stroke-width="1"/>` +
            `<text x="${padL - 6}" y="${(yy + 3).toFixed(1)}" class="pt-ax" text-anchor="end">${fmt(tv)}</text>`;
  }
  // Label waktu tiap tengah malam WIB, ditambah ujung kiri dan kanan.
  const SEHARI = 86400e3;
  const tandaX = [t0];
  for (let t = t0; t <= t1; t += 3600e3) {
    const w = toWIB(new Date(t).toISOString());
    if (w.getUTCHours() === 0 && t - tandaX[tandaX.length - 1] > SEHARI * 0.4) tandaX.push(t);
  }
  if (t1 - tandaX[tandaX.length - 1] > SEHARI * 0.4) tandaX.push(t1);
  tandaX.forEach((t, k) => {
    const xx = x(t), w = toWIB(new Date(t).toISOString());
    const lbl = w.getUTCDate() + "/" + (w.getUTCMonth() + 1);
    const anchor = k === 0 ? "start" : k === tandaX.length - 1 ? "end" : "middle";
    axes += `<line x1="${xx.toFixed(1)}" y1="${y0}" x2="${xx.toFixed(1)}" y2="${y0 + 3}" ${AX}/>` +
            `<text x="${xx.toFixed(1)}" y="${y0 + 15}" class="pt-ax" text-anchor="${anchor}">${lbl}</text>`;
  });

  // ---- garis per model ----
  let body = "";
  isi.forEach((d, k) => {
    const pts = d.values.map((v, i) => `${i ? "L" : "M"}${x(ms(d.times[i])).toFixed(1)},${y(v).toFixed(1)}`).join("");
    /* Klip dibuat PER MODEL dengan id sendiri. Dengan satu id bersama,
       dokumen berisi beberapa clipPath bernama sama dan peramban memakai
       yang pertama untuk semuanya, jadi garis kedua dan ketiga terpotong
       di tempat yang salah. */
    const idP = "bdP" + k, idF = "bdF" + k;
    body += `<clipPath id="${idP}"><rect x="0" y="0" width="${sx.toFixed(1)}" height="${H}"/></clipPath>` +
            `<clipPath id="${idF}"><rect x="${sx.toFixed(1)}" y="0" width="${(W - sx).toFixed(1)}" height="${H}"/></clipPath>`;
    body += `<path d="${pts}" fill="none" stroke="${d.warna}" stroke-width="1.8" stroke-linejoin="round" clip-path="url(#${idP})"/>`;
    body += `<path d="${pts}" fill="none" stroke="${d.warna}" stroke-width="1.8" stroke-linejoin="round" stroke-dasharray="5 4" opacity="0.65" clip-path="url(#${idF})"/>`;
    // Titik di ujung kanan tiap garis, supaya model yang berhenti lebih
    // awal kelihatan BERHENTI, bukan terpotong tepi gambar.
    const tAkhir = ms(d.times[d.times.length - 1]);
    body += `<circle cx="${x(tAkhir).toFixed(1)}" cy="${y(d.values[d.values.length - 1]).toFixed(1)}" r="2.6" fill="${d.warna}"/>`;
  });

  // Garis tegak penanda jam sekarang, digambar PALING ATAS supaya tidak
  // tertimbun garis model.
  let kini = "";
  if (sx > padL + 1 && sx < padL + plotW - 1)
    kini = `<line class="pt-kini" x1="${sx.toFixed(1)}" y1="${padT}" x2="${sx.toFixed(1)}" y2="${y0}" stroke-width="1" stroke-dasharray="3 3"/>` +
           `<text x="${(sx + 4).toFixed(1)}" y="${padT + 10}" class="pt-ax">sekarang</text>`;

  return `<svg class="bd-svg" viewBox="0 0 ${W} ${H}" width="100%" role="img">` +
    `<rect x="1" y="1" width="${W - 2}" height="${H - 2}" fill="#ffffff" stroke="rgba(7,65,115,.2)" stroke-width="1"/>` +
    axes + body + kini + `</svg>`;
}

// Legenda: satu baris per model, plus arti garis solid dan putus putus.
function bandingLegenda(deret) {
  const garis = (warna, dash) => `<svg width="26" height="8" viewBox="0 0 26 8">` +
    `<line x1="1" y1="4" x2="25" y2="4" stroke="${warna}" stroke-width="1.8"` +
    (dash ? ` stroke-dasharray="5 4"` : "") + `/></svg>`;
  const model = deret.map((d) => d.lewat
    ? `<span class="bd-key bd-mati">${garis("rgba(7,65,115,.25)", false)}${escHtml(d.label)}` +
      `<i class="bd-sebab">${escHtml(d.lewat)}</i></span>`
    : `<span class="bd-key">${garis(d.warna, false)}${escHtml(d.label)}</span>`).join("");
  return `<div class="bd-legenda">${model}</div>` +
    `<div class="bd-legenda bd-legenda-2">` +
      /* Abu netral, SENGAJA bukan warna tinta. Tinta kita biru tua dan di
         legenda sekecil ini dia terbaca seperti warna salah satu model,
         sehingga baris yang menerangkan BENTUK garis malah ikut terbaca
         sebagai keterangan warna. */
      `<span class="bd-key">${garis("rgba(7,65,115,.45)", false)}Sudah terjadi</span>` +
      `<span class="bd-key">${garis("rgba(7,65,115,.45)", true)}<i>Prakiraan</i></span>` +
    `</div>`;
}

async function bukaPlotBanding(lat, lon, nama) {
  const ov = $("bd-overlay"), isi = $("bd-card")?.querySelector(".bd-isi");
  if (!ov || !isi) return;
  ov.classList.add("show");
  isi.innerHTML = `<div class="bd-load">Mengambil deret dari tiap model…</div>`;
  let deret;
  try { deret = await deretBanding(lat, lon); }
  catch (e) { isi.innerHTML = `<div class="bd-load">Gagal mengambil datanya.</div>`; return; }
  if (!ov.classList.contains("show")) return;            // keburu ditutup
  const ada = deret.filter((d) => !d.lewat);
  if (!ada.length) {
    isi.innerHTML = `<div class="bd-load">Tidak ada model yang punya data di titik ini.</div>`;
    return;
  }
  const judul = ada[0].judul, satuan = ada[0].satuan;
  isi.innerHTML =
    `<div class="bd-kepala">` +
      `<span class="bd-tag">Banding Model</span>` +
      `<span class="bd-koord mono">` +
        (nama ? `<b class="bd-nama">${escHtml(nama)}</b> · ` : "") +
        `${fmtCoord(lat, lon)}</span>` +
    `</div>` +
    `<div class="bd-param">${escHtml(judul)}<span class="bd-sat">${escHtml(satuan || "")}</span></div>` +
    chartBandingSVG(deret) +
    bandingLegenda(deret) +
    `<div class="bd-note">Tiap model punya run dan jangkauannya sendiri, jadi garis yang ` +
    `lebih pendek memang berhenti lebih awal, bukan terpotong.</div>`;
}

function tutupBanding() {
  $("bd-overlay")?.classList.remove("show");
}

/* =====================================================================
   GELEMBUNG NILAI, LANGKAH PERTAMA SESUDAH KLIK. 13 Oktober 2026.

   Diminta pemilik. Dulu satu klik langsung menaikkan panel bawah setinggi
   separuh layar, dan itu kasar untuk orang yang cuma ingin tahu "di sini
   berapa". Sekarang klik memunculkan gelembung kecil berisi SATU angka,
   yaitu parameter yang sedang dia pilih sendiri di kartu Parameter, lalu
   di dalamnya ada lencana Detail yang baru menaikkan panelnya.

   Angkanya dari sel titik lewat Range, sekitar 2 KB, jadi gelembung ini
   murah. Kalau titiknya salah satu kota di city_data, angkanya malah sudah
   di memori dan gelembungnya tampil tanpa menyentuh jaringan sama sekali.
   ===================================================================== */
const LAYER_SAMPEL = {
  wind_surface: ["Angin", "kt", (pd, la, lo) => {
    const u = sampleVar(pd, "u", la, lo), v = sampleVar(pd, "v", la, lo);
    if (u && v) return u.map((uu, i) => windAt(uu, v[i]).spd);
    return sampleVar(pd, "wind", la, lo);
  }],
  rain_surface: ["Hujan", "mm/jam", (pd, la, lo) => sampleVar(pd, "rain", la, lo)],
  rain_accum_surface: ["Hujan", "mm/jam", (pd, la, lo) => sampleVar(pd, "rain", la, lo)],
  temp_surface: ["Suhu", "°C", (pd, la, lo) => sampleVar(pd, "temp", la, lo)],
  humidity_surface: ["Kelembapan", "%", (pd, la, lo) => sampleVar(pd, "humidity", la, lo)],
  cloud_surface: ["Tutupan awan", "%", (pd, la, lo) => sampleVar(pd, "cloud", la, lo)],
  pressure_surface: ["Tekanan", "hPa", (pd, la, lo) => sampleVar(pd, "pressure", la, lo)],
  storm_potential: ["CAPE", "J/kg", (pd, la, lo) => sampleVar(pd, "cape", la, lo)],
  cin_surface: ["CIN", "J/kg", (pd, la, lo) => sampleVar(pd, "cin", la, lo)],
};

let gelembung = null, gelembungTitik = null;
function tutupGelembung() {
  if (gelembung) { map.closePopup(gelembung); gelembung = null; }
  gelembungTitik = null;
}

async function bukaGelembung(lat, lon, label, isMe) {
  /* SUMBER SATELIT TIDAK PUNYA PANEL TITIK. Citra itu bidang gambar, tidak
     ada deret waktu per titik untuk ditarik, dan jalur panel titik akan
     melempar galat kalau dipaksa. Diam saja lebih baik daripada gelembung
     berisi titik titik yang tidak pernah jadi isi. */
  if (MODEL && MODEL.satelit) return;
  /* PANEL TIDAK DITUTUP waktu titik berganti. Dulu dia ditutup dulu, dan
     orang yang sedang membandingkan Jakarta dengan Bandung harus menekan
     Detail lagi tiap kali. Sekarang kalau panelnya sedang terbuka, isinya
     yang diganti ke titik baru, dan gelembungnya tetap berdiri. */
  const panelTerbuka = $("meteo-bar")?.classList.contains("open") &&
                       !$("meteo-bar")?.classList.contains("hidden");
  gelembungTitik = { lat, lon, label, isMe };
  const isi = (dalam) => `<div class="gb">` +
    `<div class="gb-nama">${label || fmtCoord(lat, lon)}</div>${dalam}` +
    `<button type="button" class="gb-detail" id="gb-detail">` +
    `<span class="material-symbols-outlined">expand_less</span>Detail</button></div>`;

  if (panelTerbuka) openPoint(lat, lon, label, isMe);
  gelembung = L.popup({ className: "gb-popup", closeButton: true, autoPan: false,
    offset: [0, -6], maxWidth: 220 })
    .setLatLng([lat, lon])
    .setContent(isi(`<div class="gb-angka gb-tunggu">···</div>`))
    .openOn(map);

  const def = LAYER_SAMPEL[activeLayer];
  if (!def) { tulisGelembung(isi(`<div class="gb-angka">–</div>`)); return; }
  try {
    const cepat = deretKota(label);
    const pd = cepat || await ambilTitik(lat, lon);
    if (!gelembungTitik || gelembungTitik.lat !== lat || gelembungTitik.lon !== lon) return;
    const deret = def[2](pd, lat, lon);
    const i = Math.max(0, (pd.meta.times || []).indexOf(frames[current] && frames[current].valid_time));
    const v = deret && deret[i];
    const angka = isFinite(v) ? (Math.abs(v) >= 100 ? Math.round(v) : v.toFixed(1)) : "–";
    tulisGelembung(isi(`<div class="gb-par">${def[0]}</div>` +
      `<div class="gb-angka">${angka}<span>${def[1]}</span></div>`));
  } catch (e) {
    tulisGelembung(isi(`<div class="gb-angka">–</div>`));
  }
}
function tulisGelembung(html) {
  if (!gelembung) return;
  gelembung.setContent(html);
}
/* SATU PENDENGAR SAJA, DIWAKILKAN DARI DOKUMEN.

   Dulu tombol Detail dirangkai ulang tiap kali isi gelembung digambar,
   sebab setContent Leaflet mengganti seluruh simpulnya. Itu rapuh, dan
   terbukti bocor. Dilaporkan pemilik, sesudah panel disembunyikan lalu
   pindah titik, Detail tidak membuka panelnya lagi.

   Terlacak dengan menandai simpul tombol tiap kali dirangkai lalu mengintip
   penanda itu waktu diketuk. Simpul yang hidup saat diketuk ternyata TANPA
   penanda, padahal perangkainya tercatat jalan empat kali dan semuanya
   berhasil. Artinya ada satu penggambaran terakhir, 240 milidetik sesudah
   perangkaian terakhir, yang mengganti tombolnya tanpa lewat perangkai itu.

   Diwakilkan dari dokumen, soal siapa yang menggambar ulang tidak penting
   lagi. Tombol dicari dari sasaran ketukan, dan titiknya dibaca dari
   keadaan gelembung yang sedang berdiri. */
document.addEventListener("click", (e) => {
  const b = e.target && e.target.closest && e.target.closest("#gb-detail, .gb-detail");
  if (!b || !gelembungTitik) return;
  const t = gelembungTitik;
  /* GELEMBUNGNYA TIDAK DITUTUP. Dia membawa angka parameter yang sedang
     dipilih di tempatnya, tepat di sebelah titiknya di peta, dan itu tetap
     berguna selagi panel bawah terbuka. Menekan Detail lagi cuma menggambar
     ulang panelnya untuk titik yang sama, tidak merusak apa apa. */
  openPoint(t.lat, t.lon, t.label, t.isMe);
});

async function openPoint(lat, lon, label, isMe) {
  ++pointToken; // titik baru → batalkan reverse-geocode titik sebelumnya
  const pp = $("meteo-bar");
  if (pp) { pp.classList.add("open"); pp.classList.remove("hidden"); }
  $("pt-reopen")?.classList.remove("show");
  ukurPanelBawah();

  /* MENDEKAT KE TITIKNYA, dikerjakan di UJUNG renderPoint, bukan di sini.

     Di sini tinggi panelnya masih tinggi tulang shimmer, dan ukurPanelBawah
     akan dipanggil SEKALI LAGI sesudah isinya terpasang. Kalau peta digeser
     sekarang, pengubahan ukuran yang kedua itu menggeser titik tengahnya
     lagi, sebab invalidateSize dipanggil dengan pan false yang memang
     mempertahankan sudut kiri atas, bukan pusat. Terukur melesetnya 177
     piksel mendatar dan 78 tegak. */
  perluDekati = { lat, lon };
  // Marker: ikon "orang" (kamu di sini) utk geolokasi, belah-ketupat utk titik lain.
  if (pointMarker) map.removeLayer(pointMarker);
  const html = isMe
    ? '<span class="pm-me"><span class="material-symbols-outlined">person</span></span>'
    : '<span class="pm-diamond"></span>';
  const sz = isMe ? 32 : 20;
  /* Penandanya TEPAT DI KOORDINAT kotanya, tidak digeser. Yang diminta
     pemilik urutan LAPISAN, bukan letak, penanda ini digambar DI BAWAH
     lapisan label nama kota supaya namanya tidak tertutup.

     Pane "labels" z-index 650, sedangkan label kota ada di pane "cityicons"
     z-index 660, jadi urutannya memang sudah benar tanpa perlu diubah. */
  const diKota = !isMe && !!label && cityIndexByName && cityIndexByName.has(label);
  pointMarker = L.marker([lat, lon], {
    icon: L.divIcon({ className: "point-mark" + (diKota ? " pm-kota" : ""), html,
      iconSize: [sz, sz], iconAnchor: [sz / 2, sz / 2] }),
    interactive: false, pane: "labels",
  }).addTo(map);
  /* Nama kotanya ikut berkedip, bukan cuma titiknya. Label kota digambar
     ulang tiap bingkai waktu berganti, jadi penandanya disimpan di variabel
     dan dibaca lagi di refreshCityIcons. */
  kotaTerpilih = diKota ? label : null;
  refreshCityIcons();
  setPointLabel(label || fmtCoord(lat, lon), label ? "addr" : "coord");
  sharedPoint = { lat, lon, name: label || null };
  updateHash();
  const body = $("mb-body"); if (body) body.innerHTML = pointSkeleton();
  fenomenaSkeleton();
  const tokenKu = pointToken;

  /* DUA LANGKAH, dan langkah pertamanya tanpa jaringan sama sekali.

     Kalau titik ini salah satu dari 514 kota dan kabupaten di city_data,
     dan itu keadaan yang paling sering sebab orang memang mengklik penanda
     kota atau mencarinya di bilah atas, panelnya digambar SEKARANG JUGA.
     Angkanya sudah ada di memori sejak peta dibuka.

     Baru sesudah itu sel titiknya ditunggu (ambilTitik, dua permintaan
     Range kecil), dan panelnya digambar ulang dengan arah anginnya. Untuk klik di tempat yang bukan kota, langkah
     pertama ini dilewat dan jalannya persis seperti dulu. */
  const cepat = deretKota(label);
  if (cepat) { pdTerakhir = cepat; try { renderPoint(cepat, lat, lon); } catch (e) { console.warn(e); } }

  try {
    const pd = await ambilTitik(lat, lon);
    if (pointToken !== tokenKu) return;   // sudah pindah ke titik lain
    pdTerakhir = pd;
    renderPoint(pd, lat, lon);
  } catch (e) {
    if (pointToken !== tokenKu) return;
    /* Kalau langkah cepatnya sudah menggambar, kegagalan di sini JANGAN
       menimpanya dengan pesan galat. Yang hilang cuma arah anginnya, dan
       panel berisi lebih berguna daripada panel berisi kabar buruk. */
    if (!cepat && body) body.innerHTML = '<div class="mb-gagal">Gagal memuat data titik.</div>';
    console.error(e);
  }
}

/* ANCANG ANCANG, TAPI YANG RINGAN.

   Dulu ini mengunduh point_data 47 MB di latar supaya klik pertama tidak
   menunggu. Dengan point_cells.bin yang dibaca per sel itu tidak perlu lagi,
   cukup point_meta.json yang 3 KB supaya klik pertama langsung tahu letak
   selnya. Blob utuh hanya diambil kalau datanya masih format lama.

   DITUNDA dulu, bukan langsung. Bandwidth di detik detik pertama milik
   ubin peta dan bingkai pertama. DIBATALKAN di sambungan hemat atau lambat,
   sebab blob 47 MB untuk panel yang mungkin tidak pernah dibuka itu kasar
   untuk yang memakai kuota. */
function prefetchTitik() {
  const c = navigator.connection;
  if (c && (c.saveData || /(^|-)2g$/.test(c.effectiveType || ""))) return;
  loadPointMeta()
    .then((m) => { if (!m.cells) return loadPointData(); })
    .catch(() => { /* diam, ini cuma ancang ancang */ });
}

// Skeleton panel titik: tulang shimmer per-kontainer (ringkasan, chip, kartu
// 3-hari, grafik, tabel) meniru layout renderPoint — dipakai saat data dimuat.
/* TULANG SHIMMER BERBENTUK, bukan tulisan "memuat data".

   Ukurannya DISAMAKAN dengan tabel sungguhan, kolom label 88 piksel dengan
   padding 10, kolom data 38 piksel, dua baris kepala lalu sembilan baris
   parameter. Versi pertama cuma mirip kira kira dan tata letaknya melompat
   waktu isi aslinya mendarat, dan itu justru yang mau dihindari tulang
   shimmer. Angka angkanya ikut .mb-label dan .mb-tabel di CSS, kalau salah
   satunya diubah ubah juga yang di sini. */
function pointSkeleton() {
  const KOL = 24;                                   // kira kira selebar layar
  const bar = (w, h) => `<span class="sk-bar" style="width:${w};height:${h}"></span>`;
  let jam = "";
  for (let i = 0; i < KOL; i++) jam += `<span class="sk-sel">${bar("20px", "9px")}</span>`;
  let hari = "";
  for (let i = 0; i < 4; i++) hari += `<span class="sk-hari">${bar("86px", "11px")}</span>`;
  let baris = "";
  for (let i = 0; i < 9; i++) {
    let sel = "";
    for (let k = 0; k < KOL; k++) sel += `<span class="sk-sel">${bar("22px", "10px")}</span>`;
    baris += `<div class="sk-baris"><span class="sk-label">${bar("54px", "10px")}</span>${sel}</div>`;
  }
  return '<div class="mb-skel">' +
    `<div class="sk-baris sk-baris-hari"><span class="sk-label"></span>${hari}</div>` +
    `<div class="sk-baris"><span class="sk-label">${bar("30px", "9px")}</span>${jam}</div>` +
    baris + '</div>';
}

/* Tulang untuk panel kanan, dipasang bersamaan dengan tulang tabel.

   PANEL BERPETA TIDAK BOLEH DITIMPA. Versi pertama menulis innerHTML ke
   kelima panel, dan itu membongkar wadah Leaflet di panel AUSMI dan ITCZ,
   jadi dua panel itu kosong selamanya sesudah tulangnya dilepas. Yang
   diberi tulang di sana cuma baris keterangannya, petanya dibiarkan, dan
   latar abu .mb-mini sudah cukup jadi tulang buat dirinya sendiri. */
function fenomenaSkeleton() {
  const judul = '<span class="sk-bar" style="width:78px;height:8px"></span>';
  const peraga = (d) => `<div class="mb-sel-peraga"><span class="sk-bar sk-bulat" style="width:${d}px;height:${d}px"></span></div>`;
  const penuh = { "mb-mjo": judul + peraga(84), "mb-siklon": judul + peraga(66), "mb-kondisi": judul + peraga(38) };
  Object.keys(penuh).forEach((id) => {
    const el = $(id); if (!el) return;
    el.classList.add("mb-sel-skel");
    el.innerHTML = penuh[id];
  });
  ["mb-ausmi-isi", "mb-itcz-isi"].forEach((id) => {
    const el = $(id); if (el) el.innerHTML = '<span class="sk-bar" style="width:72%;height:11px"></span>';
  });
}
function fenomenaSkeletonLepas() {
  document.querySelectorAll("#mb-fenomena .mb-sel-skel").forEach((e) => e.classList.remove("mb-sel-skel"));
}

// ---- Ringkasan awam untuk panel titik --------------------------------
function hhWIB(iso) { const w = toWIB(iso); return String(w.getUTCHours()).padStart(2, "0") + ":00"; }
function windWord(kt) { return kt < 7 ? "tenang" : kt < 17 ? "sedang" : kt < 28 ? "kencang" : "sangat kencang"; }

// Suhu TERASA (apparent temperature, rumus BOM Australia) dari suhu(°C) +
// kelembapan(%) + angin(knot). Di iklim tropis lembap umumnya lebih PANAS dari
// suhu asli karena keringat sulit menguap. e = tekanan uap air (hPa).
function feelsLike(tC, rh, spdKt) {
  const e = (rh / 100) * 6.105 * Math.exp((17.27 * tC) / (237.7 + tC));
  const ws = (spdKt || 0) / MS_TO_KT; // knot -> m/s
  return tC + 0.33 * e - 0.70 * ws - 4.0;
}

// Kalimat bahasa manusia: kondisi kini + hujan mendatang + angin.
function pointSummary(times, temp, rain, cloud, wind, rh, ci) {
  const now = cityCondition(rain[ci], cloud ? cloud[ci] : null);
  let s = `Saat ini <b>${now.label}</b>`;
  if (temp) {
    const t = Math.round(temp[ci]);
    s += `, ${t}°C`;
    if (rh && wind) {
      const fl = Math.round(feelsLike(temp[ci], rh[ci], wind[ci].spd));
      if (Math.abs(fl - t) >= 1) s += ` <span class="feels">(terasa ${fl}°)</span>`;
    }
  }
  s += ".";
  if (rain[ci] >= 0.5) {
    let stop = -1;
    for (let i = ci + 1; i < times.length; i++) if (rain[i] < 0.5) { stop = i; break; }
    s += stop > 0 ? ` Hujan diperkirakan mereda sekitar <b>${hhWIB(times[stop])} WIB</b>.`
                  : " Hujan diperkirakan masih berlanjut beberapa jam.";
  } else {
    let onset = -1;
    for (let i = ci + 1; i < times.length; i++) if (rain[i] >= 0.5) { onset = i; break; }
    s += onset > 0 ? ` Hujan diperkirakan mulai sekitar <b>${hhWIB(times[onset])} WIB</b>.`
                   : " Tidak ada hujan berarti dalam beberapa jam ke depan.";
  }
  if (wind) s += ` Angin ${windWord(wind[ci].spd)}.`;
  return s;
}

// Saran aktivitas dari kondisi ~12 jam ke depan (chip yang relevan saja).
function pointAdvice(times, rain, cloud, wind, ci) {
  const to = Math.min(times.length, ci + 5), dry6To = Math.min(times.length, ci + 3);
  let maxRain = 0, storm = false, strongWind = false, dry6 = true;
  for (let i = ci; i < to; i++) {
    maxRain = Math.max(maxRain, rain[i]);
    if (rain[i] >= 20) storm = true;
    if (wind && wind[i].spd >= 22) strongWind = true;
    if (i < dry6To && rain[i] >= 0.5) dry6 = false;
  }
  const chips = [];
  if (maxRain >= 0.5) chips.push(["umbrella", "cc-rain", "Bawa payung"]);
  if (storm) chips.push(["thunderstorm", "cc-storm", "Waspada petir"]);
  if (maxRain >= 10 || strongWind) chips.push(["two_wheeler", "cc-heavy", "Hati-hati berkendara"]);
  if (dry6 && (!cloud || cloud[ci] < 85)) chips.push(["dry_cleaning", "cc-sunny", "Aman jemur"]);
  if (!chips.length) chips.push(["check_circle", "cc-pcloud", "Cuaca bersahabat"]);
  return chips.map(([ic, cls, txt]) =>
    `<span class="adv-chip ${cls}"><span class="material-symbols-outlined">${ic}</span>${txt}</span>`).join("");
}

// Potensi badai/petir dari CAPE (energi labil). Ambang konvektif yang lazim.
function stormLevel(c) {
  if (c >= 3000) return ["Ekstrem", "cc-storm", "thunderstorm", "atmosfer sangat labil, potensi badai petir kuat"];
  if (c >= 1800) return ["Tinggi", "cc-heavy", "bolt", "berpotensi badai dan petir"];
  if (c >= 1000) return ["Sedang", "cc-rain", "cloud", "awan hujan bisa tumbuh"];
  return ["Rendah", "cc-sunny", "wb_sunny", "atmosfer relatif stabil"];
}
function stormChip(cape, ci) {
  if (!cape) return "";
  const c = Math.round(cape[ci]);
  const [lvl, cls, ic, note] = stormLevel(c);
  return `<div class="pt-storm"><span class="adv-chip ${cls}"><span class="material-symbols-outlined">${ic}</span>Potensi badai: ${lvl}</span>` +
         `<span class="pt-storm-note">CAPE ${c} J/kg, ${note}</span></div>`;
}

// Kartu prakiraan harian (maks 3 hari): ikon dominan + suhu maks/min + hujan total.
function dailyCards(times, temp, rain, cloud, ci) {
  const days = {}, fromDate = times[ci].slice(0, 10); // mulai dari hari frame aktif (bukan masa lalu)
  for (let i = 0; i < times.length; i++) {
    const d = times[i].slice(0, 10);
    if (d < fromDate) continue;
    const o = days[d] || (days[d] = { tmax: -99, tmin: 99, peak: 0, rain: 0, cloud: 0, n: 0, nc: 0 });
    if (temp) { o.tmax = Math.max(o.tmax, temp[i]); o.tmin = Math.min(o.tmin, temp[i]); }
    o.peak = Math.max(o.peak, rain[i]); o.rain += rain[i] * STEP_JAM;
    if (cloud) { o.cloud += cloud[i]; o.nc++; }
    o.n++;
  }
  return Object.keys(days).sort().slice(0, 3).map((d) => {
    const o = days[d], cond = cityCondition(o.peak, o.nc ? o.cloud / o.nc : null);
    const base = new Date(d + "T00:00:00Z");
    const wd = base.toLocaleDateString("id-ID", { weekday: "short", timeZone: "UTC" });
    const dm = base.toLocaleDateString("id-ID", { day: "numeric", month: "short", timeZone: "UTC" });
    return `<div class="fc-card"><div class="fc-day">${wd}<span>${dm}</span></div>` +
      `<span class="cc-ico cc-mini ${cond.cls}"><span class="material-symbols-outlined">${cond.icon}</span></span>` +
      `<div class="fc-temp">` + (temp
        ? `<span class="material-symbols-outlined ft-ico">device_thermostat</span>` +
          `<span class="t-max">${Math.round(o.tmax)}°</span>` +
          `<span class="t-min">${Math.round(o.tmin)}°</span>`
        : "–") + `</div>` +
      `<div class="fc-rain">${o.rain >= 1 ? Math.round(o.rain) + " mm" : "–"}</div></div>`;
  }).join("");
}

/* =====================================================================
   PANEL TITIK PINDAH KE BAWAH, METEOGRAM TABEL. 13 Oktober 2026.

   Diminta pemilik, bentuknya meniru tabel bawah Windy. Panel tepi kanan
   dibuang seluruhnya, jadi peta tidak lagi terpotong 380 px, dan deret
   waktunya dibaca MENDATAR, satu kolom satu langkah waktu.

   Yang pindah ke sini apa adanya, tabel per jam, dan tombol CSV yang
   sekarang cuma ikon di kepala panel.

   Yang DIBUANG beserta alasannya, supaya tidak dikira kelalaian.
   Grafik SVG satu variabel dibuang, sebab seluruh barisnya kini tampil
   sekaligus dan berwarna, jadi grafik satu variabel justru lebih miskin.
   Kartu tiga hari dibuang, sebab angkanya pindah ke kepala tiap hari di
   meteogram, maksimum, minimum, dan hujan sehari.
   Ringkasan dan saran dibuang dari sini, digantikan chip konteks yang
   lebih spesifik ke titiknya.

   Yang BARU, chip konteks. Empat fenomena yang datanya sudah lama ada di
   app tapi belum pernah dikaitkan ke satu titik, ITCZ, MJO, monsun, dan
   siklon terdekat lengkap jarak serta arah mata anginnya.

   Kolom jamnya BISA DIKLIK dan menggeser waktu peta, dan kolom yang
   sedang aktif ditandai mengikuti slider. Lihat tandaiJamAktif().
   ===================================================================== */

/* Skala warna latar sel. Berhenti di angka yang lazim di Indonesia, bukan
   rentang global, kalau tidak seluruh kolom suhu akan sewarna. Warnanya
   muda semua supaya tulisan tinta tetap terbaca di atasnya. */
const SK_SUHU  = [[18, "rgb(200,226,246)"], [24, "rgb(233,245,233)"], [28, "rgb(255,249,196)"],
                  [32, "rgb(255,204,128)"], [36, "rgb(240,138,110)"]];
const SK_HUJAN = [[0, "rgb(255,255,255)"], [0.5, "rgb(222,241,252)"], [2, "rgb(148,203,249)"],
                  [10, "rgb(74,144,226)"], [20, "rgb(150,86,190)"]];
const SK_ANGIN = [[0, "rgb(255,255,255)"], [5, "rgb(205,240,243)"], [10, "rgb(150,216,250)"],
                  [20, "rgb(146,228,170)"], [30, "rgb(255,216,102)"], [40, "rgb(240,138,110)"]];
const SK_RH    = [[30, "rgb(255,255,255)"], [70, "rgb(226,241,236)"], [95, "rgb(150,210,190)"]];
const SK_CAPE  = [[0, "rgb(255,255,255)"], [1000, "rgb(255,249,196)"], [2500, "rgb(255,196,120)"],
                  [4000, "rgb(240,130,100)"]];

function campurWarna(a, b, f) {
  const pa = a.match(/\d+/g).map(Number), pb = b.match(/\d+/g).map(Number);
  return "rgb(" + pa.map((x, i) => Math.round(x + (pb[i] - x) * f)).join(",") + ")";
}
function skalaWarna(v, stops) {
  if (v === null || v === undefined || !isFinite(v)) return "";
  if (v <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    const [a, ca] = stops[i - 1], [b, cb] = stops[i];
    if (v <= b) return campurWarna(ca, cb, (v - a) / (b - a));
  }
  return stops[stops.length - 1][1];
}

/* TERASA SEPERTI. Heat Index Rothfusz, rumus yang dipakai NOAA, dihitung
   dari suhu dan kelembapan. Di bawah 27 derajat rumus itu tidak berlaku
   dan suhu aslinya yang dipakai. Ini angka TURUNAN, bukan keluaran model,
   jadi barisnya diberi judul yang menyebutkan itu. */
function terasaSeperti(tc, rh) {
  if (!isFinite(tc) || !isFinite(rh) || tc < 27) return tc;
  const t = tc * 9 / 5 + 32, r = rh;
  let hi = -42.379 + 2.04901523 * t + 10.14333127 * r - 0.22475541 * t * r
    - 0.00683783 * t * t - 0.05481717 * r * r + 0.00122874 * t * t * r
    + 0.00085282 * t * r * r - 0.00000199 * t * t * r * r;
  return (hi - 32) * 5 / 9;
}

// Arah angin dalam derajat, arah DATANG, sama patokan dengan windAt().
function arahDerajat(u, v) { return (Math.atan2(-u, -v) * 180 / Math.PI + 360) % 360; }

/* Jarak lingkaran besar dan arah mata angin dari titik ke sasaran.
   Dipakai chip siklon terdekat. */
function jarakArah(lat1, lon1, lat2, lon2) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad, dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  const km = 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
  const y = Math.sin(dLon) * Math.cos(lat2 * rad);
  const x = Math.cos(lat1 * rad) * Math.sin(lat2 * rad) -
    Math.sin(lat1 * rad) * Math.cos(lat2 * rad) * Math.cos(dLon);
  const brg = (Math.atan2(y, x) / rad + 360) % 360;
  return { km, brg, arah: DIRS[Math.round(brg / 45) % 8] };
}

/* Titik poros ITCZ pada bujur tertentu, [bujur, poros, utara, selatan].
   Dipisah jadi helper sebab dipakai dua tempat, chip jaraknya dan penentu
   zoom peta sisipan. */
function itczPorosDi(lon) {
  if (!itcz || !itcz.frames || !frames[current]) return null;
  const ti = itcz.times ? itcz.times.indexOf(frames[current].valid_time) : -1;
  const fr = itcz.frames[ti < 0 ? 0 : ti];
  if (!fr) return null;
  let best = null, bd = 9e9;
  for (const ruas of fr) for (const p of ruas) {
    const d = Math.abs(p[0] - lon);
    if (d < bd) { bd = d; best = p; }
  }
  return best && bd <= 2 ? best : null;
}

/* Berkas fenomena dimuat MALAS dan TIDAK menahan meteogram tampil. Kelimanya
   punya pemuat sendiri yang ber-cache, jadi klik titik kedua tidak mengetuk
   jaringan lagi. Token menjaga agar hasil yang datang telat tidak mendarat
   di titik yang sudah berganti.

   Ikut terhapus waktu baris chip dibuang, dan halamannya langsung berbunyi
   "Gagal memuat data titik" sebab renderPoint memanggilnya di baris terakhir.
   Ketahuan dari console.error yang ditangkap pengintip, bukan dari layar. */
function muatKonteks(lat, lon, nama) {
  const tokenKu = pointToken;
  gambarFenomena(lat, lon, nama);
  Promise.all([loadItcz(), loadMjo(), loadMonsoon(), loadCyclones(), muatAusmi()])
    .then(() => { if (pointToken === tokenKu) gambarFenomena(lat, lon, nama); })
    .catch(() => { /* panel memang boleh kosong */ });
}

/* LENCANA SUMBER. Dipasang kalau isi panelnya datang dari folder model LAIN,
   yaitu model global, sedangkan peta yang sedang dibuka model lokal. Diminta
   pemilik, "tetap ada AUSMI dan MJO tapi di kontainernya dilabeli GFS Based,
   jadi tetap terisi penuh semua fiturnya".

   Lebih jujur begini daripada dua pilihan yang lain. Mengosongkan panelnya
   membuang data yang memang berlaku, dan memajangnya tanpa keterangan
   membuat orang mengira angka itu keluaran WRF. */
function namaModelGlobal() {
  return (MODELS[MODEL_GLOBAL] && MODELS[MODEL_GLOBAL].label || "GFS").split(" ")[0];
}

/* PITA MIRING DI KARTU FITUR. Diminta pemilik, supaya orang yang menyalakan
   MJO atau AUSMI dari kartu Fitur juga tahu angkanya dari model mana, bukan
   cuma yang membuka panel titik.

   Dipasang SEKALI waktu init, sebab model tidak berganti tanpa memuat ulang
   halaman, MODEL_ID dibaca dari ?model= di alamat. */
/* Pita "Basis GFS" di pojok tombol MJO dan AUSMI.

   DIPASANG CUMA KALAU INDEKSNYA MEMANG DIPINJAM, dan itu diperbaiki 21
   Oktober 2026 setelah pemilik menanyakannya. Versi lama memasangnya ke
   SETIAP model yang bukan GFS, tanpa memeriksa apa pun. Itu benar selama
   satu satunya model lain adalah WRF, yang memang tidak menghitung MJO dan
   AUSMI sendiri sehingga membacanya dari folder GFS.

   Begitu ECMWF masuk, pitanya jadi keterangan yang SALAH. Pipeline ECMWF
   menghitung MJO dan AUSMI dari analisis ECMWF sendiri, riwayatnya pun
   berkas terpisah, jadi angkanya memang bukan angka GFS. Pita yang
   mengaku sebaliknya lebih buruk daripada tidak ada pita, sebab dia
   membuat orang mengira dua model menampilkan angka yang sama.

   Pemeriksaannya per tombol, sebab sebuah model bisa saja punya salah satu
   tanpa punya yang lain. Pola "mana yang akhirnya dipakai" ini sama dengan
   lencanaSumber() di panel titik, yang sejak awal memang sudah memeriksa
   basenya. */
function pasangPitaGlobal() {
  if (MODEL_ID === MODEL_GLOBAL) return;
  const nama = namaModelGlobal();
  const pasang = (id) => {
    const w = $(id);
    if (!w || w.querySelector(".pita-global")) return;
    w.classList.add("pita-induk");
    const p = document.createElement("span");
    p.className = "pita-global";
    p.textContent = "Basis " + nama;
    p.title = "Indeks global, dihitung dari analisis " + nama +
      ", bukan keluaran model yang sedang ditampilkan. Angkanya sama di model mana pun.";
    w.appendChild(p);
  };
  /* MJO: ADANYA BERKAS TIDAK CUKUP, isinya yang menentukan.

     Folder WRF punya mjo.json sendiri, tapi isinya indeks GFS. Sumbernya
     menyatakan sendiri "indeks dari GFS (62-180BT); WRF 12km utk amplop
     halus", dan fase serta amplitudonya memang sama persis dengan GFS.
     Yang dihitung dari WRF cuma amplop selubungnya, bukan angkanya. Jadi
     pita Basis GFS di situ BENAR dan harus tetap ada.

     Yang dibaca `sumber`, dan patokannya apakah dia menyebut model global
     sebagai asal indeks. ECMWF menulis "angin analisis ECMWF" sehingga
     tidak kena, WRF menulis "indeks dari GFS" sehingga kena.

     Ini membaca kalimat, dan kalimat bisa berubah sewaktu waktu di sisi
     backend. Yang benar benar dibutuhkan satu field tegas di mjo.json,
     misalnya nama model yang indeksnya dipakai. Sudah masuk daftar untuk
     backend. Sampai itu ada, kalau kalimatnya berubah akibat terburuknya
     cuma pita yang hilang atau muncul keliru, bukan angka yang salah. */
  const polaGlobal = new RegExp("\\b" + namaModelGlobal() + "\\b", "i");
  fetchUlang(DATA_BASE + "mjo.json", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => {
      // Tidak ada mjo.json sendiri, berarti nanti dipinjam dari folder global.
      if (!j) return pasang("mjo-toggle");
      if (polaGlobal.test(String(j.sumber || ""))) pasang("mjo-toggle");
    })
    .catch(() => pasang("mjo-toggle"));
  // AUSMI: cariAusmi memulangkan folder yang akhirnya memuatnya.
  cariAusmi().then((base) => { if (base && base !== DATA_BASE) pasang("ausmi-toggle"); });
}

function lencanaSumber(base) {
  if (!base || base === DATA_BASE) return "";
  const nama = namaModelGlobal();
  return `<span class="mb-sumber" title="Indeks ini global, dihitung dari analisis ${nama}, bukan keluaran model yang sedang ditampilkan. Angkanya sama di model mana pun.">Basis ${nama}</span>`;
}

/* PANEL 1, OKTAGON MJO. Gambarnya TIDAK ditulis ulang di sini.

   Sempat kutulis fungsi kedua bernama sama, dan itu dua kesalahan sekaligus.
   Pekerjaan dobel, dan lebih parah, dua deklarasi function bernama sama di
   lingkup yang sama saling menimpa, jadi yang belakangan menang dan panel
   MJO yang lama ikut rusak. Dipergoki pemilik, "bukannya ada di fitur mjo
   ya". Yang dipakai mjoOktagon() milik panel keterangan MJO.

   DUA JURING diwarnai, dan ini inti panelnya.
   MERAH, wilayah tempat TITIK ini berada, ditentukan bujurnya.
   HIJAU, fase tempat MJO sedang berada sekarang, ditentukan indeks global.
   Kalau dua duanya juring yang sama, pusat konveksi MJO memang sedang di
   atas titik itu. */
function mjoSel(lon) {
  if (!mjo || mjo.kosong || !mjo.indeks)
    return `<div class="mb-sel-judul">Wheeler-Hendon Diagram</div>` +
           `<div class="mb-sel-kosong">MJO belum ada</div>`;
  const ix = mjo.indeks, fb = mjoFaseBujur(lon), lemah = !(ix.amplitudo >= 1);
  return `<div class="mb-sel-judul">Wheeler-Hendon Diagram${lencanaSumber(mjoBase)}</div>` +
    `<div class="mb-sel-peraga">${mjoOktagon(ix, mjo.jejak, fb && fb.fase, lemah ? null : ix.fase)}</div>` +
    `<div class="mb-sel-isi">MJO ${lemah ? "lemah" : "Fase " + ix.fase}</div>`;
}

/* PANEL 2, INDEKS AUSMI. Di atas cuplikan kotak wilayahnya, di bawah
   angkanya. Cuplikan itu peta DIAM, tanpa parameter dan tanpa partikel,
   gunanya cuma satu, memberi tahu kotak AUSMI itu di sebelah mana. Jadi dia
   dibangun sekali dan tidak pernah disegarkan lagi. */
function ausmiIsi() {
  const lb = $("mb-ausmi-sumber");
  if (lb) lb.innerHTML = lencanaSumber(ausmiBase);
  const el = $("mb-ausmi-isi"); if (!el) return;
  if (!ausmiData || !ausmiData.kini) { el.innerHTML = '<span class="mb-sel-kosong">AUSMI belum ada</span>'; return; }
  const k = ausmiData.kini;
  const fase = monsoon && monsoon.phase ? monsoon.phase.label : "Monsun";
  el.innerHTML = `<div class="au-angka">${k.nilai > 0 ? "+" : ""}${k.nilai.toFixed(1)}<span>m/s</span></div>` +
    `<div class="au-arah">${fase} (${k.arah})</div>`;
}

let petaAusmi = null;
function petaAusmiSiap() {
  if (petaAusmi || !ausmiData || !ausmiData.kotak) return;
  const el = $("mb-peta-ausmi"); if (!el || !el.clientWidth) return;
  const kt = ausmiData.kotak;
  petaAusmi = L.map(el, {
    zoomControl: false, attributionControl: false, zoomSnap: 0.1,
    dragging: false, scrollWheelZoom: false, doubleClickZoom: false,
    boxZoom: false, keyboard: false, touchZoom: false, fadeAnimation: false,
  });
  /* Alas POLOS dan daratnya abu, diminta pemilik. World_Light_Gray_Base
     memang itu, dan kotak AUSMI jadi satu satunya yang berwarna. */
  L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",
    { maxZoom: 16, crossOrigin: true }).addTo(petaAusmi);
  L.rectangle([[kt.latS, kt.lonW], [kt.latN, kt.lonE]], {
    color: "#b26a00", weight: 1.4, dashArray: "4 3", fillColor: "#b26a00",
    fillOpacity: 0.22, interactive: false,
  }).addTo(petaAusmi);
  petaAusmi.fitBounds(L.latLngBounds([kt.latS - 11, kt.lonW - 17], [kt.latN + 11, kt.lonE + 17]),
    { animate: false, padding: [0, 0] });
}

/* PANEL 3, JARAK KE SIKLON. Kalau pada jam aktif ada lebih dari satu sistem,
   kartunya BERGANTIAN tiap empat detik, bukan ditumpuk. Urutannya dari yang
   terdekat. Ikonnya diputar pelan, berlawanan jarum jam di belahan utara dan
   searah di selatan, seperti siklon sungguhan. */
let siklonPutar = null, siklonDaftar = [], siklonKe = 0;
function siklonKumpul(lat, lon) {
  const t = frames[current] && frames[current].valid_time;
  const out = [];
  if (!cyclones || !cyclones.tracks || !t) return out;
  for (const tr of cyclones.tracks) {
    const p = tr.points.find((q) => q.t === t);
    if (!p) continue;
    out.push({ p, tr, d: jarakArah(lat, lon, p.lat, p.lon) });
  }
  return out.sort((a, b) => a.d.km - b.d.km);
}
function siklonGambar() {
  const el = $("mb-siklon"); if (!el) return;
  const judul = `<div class="mb-sel-judul">Jarak ke Siklon</div>`;
  if (!siklonDaftar.length) {
    el.innerHTML = judul + `<div class="mb-sel-kosong">Tidak ada sistem siklonik di jam ini</div>`;
    return;
  }
  const n = siklonDaftar.length, c = siklonDaftar[siklonKe % n];
  /* WARNA DAN NAMA IKUT JALURNYA, sama dengan ikon di peta dan legenda di
     kartu Fitur. Sebelumnya panel ini memakai tingkat pada JAM ITU
     (c.p.tier) sedangkan peta memakai puncak sepanjang hidup sistemnya
     (tr.tier), jadi satu sistem yang sama tampil UNGU di peta dan ORANYE di
     panel. Dipergoki pemilik.

     Keadaan jam ini tidak dibuang, dia ditulis di baris kecil di bawahnya
     kalau memang berbeda, sebab itu kabar yang berguna. Sistem yang namanya
     Siklon Lintang Tinggi tapi jam ini baru bibit memang belum sekuat
     namanya. */
  const warna = cycloneColor(c.tr.tier, c.tr.peak_cat);
  const putar = c.p.lat >= 0 ? "sik-utara" : "sik-selatan";
  const nama = rapikanNamaSiklon(c.tr.peak_label || c.p.label || "Sistem siklonik");
  const namaKini = rapikanNamaSiklon(c.p.label);
  const kini = namaKini && namaKini !== nama ? `<div class="sik-kini">saat ini ${namaKini}</div>` : "";
  el.innerHTML = judul +
    `<div class="mb-sel-peraga"><div class="sik-ikon ${putar}" style="color:${warna}" ` +
    `data-lat="${c.p.lat}" data-lon="${c.p.lon}">` +
    `<span class="material-symbols-outlined">cyclone</span></div></div>` +
    `<div class="mb-sel-isi"><div class="sik-kat" style="color:${warna}">${nama}</div>${kini}` +
    `<div class="sik-jarak">Terjadi pada <b>${Math.round(c.d.km)} km</b><br>arah ${c.d.arah} (${Math.round(c.d.brg)}°)</div></div>` +
    (n > 1 ? `<div class="sik-cacah">${(siklonKe % n) + 1} dari ${n}</div>` : "");
}
/* "Siklon Tropis \u00b7 Badai Tropis Kuat" dibaca jadi "Siklon Tropis (Kuat)".
   Diminta pemilik, titik tengah di tengah nama terbaca seperti dua sistem
   yang berbeda padahal yang kedua cuma menerangkan yang pertama.

   Yang di belakang titik tengah dipangkas dari kata yang sudah ada di nama
   pokoknya, jadi "Badai Tropis Kuat" di belakang "Siklon Tropis" tinggal
   "Kuat". Kalau sesudah dipangkas tidak ada sisanya, keterangan aslinya yang
   dipakai utuh, jadi label bentuk lain tidak ikut rusak. */
const SIK_KATA_UMUM = ["badai", "siklon", "sistem"];
function rapikanNamaSiklon(teks) {
  if (!teks) return teks;
  const bagi = String(teks).split(/\s*\u00b7\s*/);
  if (bagi.length < 2) return teks;
  const pokok = bagi[0].trim();
  const penuh = bagi.slice(1).join(" ").trim();
  const kataPokok = pokok.toLowerCase().split(/\s+/);
  const sisa = penuh.split(/\s+/).filter((w) => {
    const k = w.toLowerCase();
    return kataPokok.indexOf(k) < 0 && SIK_KATA_UMUM.indexOf(k) < 0;
  });
  return pokok + " (" + (sisa.length ? sisa.join(" ") : penuh) + ")";
}

/* SOROT IKONNYA, LENCANA IKUT KURSOR. DIKETUK, BARU PETANYA MENUJU.

   Versi pertama langsung terbang waktu disorot, dan pemilik membetulkannya.
   Memang benar, penunjuk yang cuma lewat tidak boleh menyeret peta orang.
   Sekarang sorotan cuma memunculkan lencana kecil yang menempel di kursor,
   dan ketukan yang mengerjakannya.

   Diketuk, panel bawah TURUN DULU baru petanya terbang. Dua duanya penting
   urutannya, sebab kotak peta memanjang waktu panel turun dan titik
   tengahnya ikut bergeser. Kalau terbangnya duluan, sistemnya mendarat
   melenceng ke atas.

   ZOOMNYA DIHITUNG, bukan dipatok. Sistem di 29,8 LS itu cuma 3,2 derajat
   dari tepi selatan domain, dan kunci pan di tepi domain menolak
   menengahkannya kalau zoomnya terlalu renggang. Yang dipakai zoom terkecil
   yang masih membuat setengah tinggi layar muat di sisa ruang itu, dijepit
   di 4 sampai 8. */
let lencanaKursor = null;
function lencanaKursorTampil(teks, x, y) {
  if (!lencanaKursor) {
    lencanaKursor = document.createElement("div");
    lencanaKursor.className = "lencana-kursor";
    document.body.appendChild(lencanaKursor);
  }
  lencanaKursor.innerHTML = `<span class="material-symbols-outlined">my_location</span>${teks}`;
  lencanaKursor.classList.add("show");
  // Dipasang dulu baru diukur, lebarnya baru ada sesudah isinya masuk. Dekat
  // tepi kanan jendela lencananya dibalik ke kiri kursor, kalau tidak dia
  // menggantung keluar layar. Terukur menggantung 9 px di jendela 1440.
  const lb = lencanaKursor.offsetWidth || 90;
  lencanaKursor.style.left = (x + lb > innerWidth - 8 ? Math.max(4, x - lb - 28) : x) + "px";
  lencanaKursor.style.top = Math.min(y, innerHeight - 28) + "px";
}
function lencanaKursorSembunyi() { lencanaKursor?.classList.remove("show"); }

function terbangKeSiklon(lat, lon) {
  if (!isFinite(lat) || !isFinite(lon)) return;
  const h = map.getSize().y || 400;
  let ruang = 6;
  if (frameBounds) {
    ruang = Math.max(0.6, Math.min(frameBounds.getNorth() - lat, lat - frameBounds.getSouth()) * 0.95);
  }
  let z = Math.log2(h * 360 / (512 * ruang));
  z = Math.max(4, Math.min(8, Math.round(z * 10) / 10));
  try { map.flyTo([lat, lon], z, { duration: 0.7 }); } catch (e) { /* peta belum siap */ }
}

$("mb-siklon")?.addEventListener("mousemove", (e) => {
  const ik = e.target.closest(".sik-ikon");
  if (ik) lencanaKursorTampil("Ke siklon", e.clientX + 14, e.clientY + 16);
  else lencanaKursorSembunyi();
});
$("mb-siklon")?.addEventListener("mouseleave", lencanaKursorSembunyi);
$("mb-siklon")?.addEventListener("click", (e) => {
  const ik = e.target.closest(".sik-ikon"); if (!ik) return;
  lencanaKursorSembunyi();
  const la = +ik.dataset.lat, lo = +ik.dataset.lon;
  hidePoint();                         // panel turun dulu, kotak peta memanjang
  // Lapisan siklonnya DINYALAKAN sekalian. Menengahkan peta ke sistem yang
  // ikonnya tidak digambar itu cuma memandangi laut kosong. Diminta pemilik.
  if (!cyclonesOn) toggleCyclones();
  setTimeout(() => terbangKeSiklon(la, lo), 0);
});

function siklonSel(lat, lon) {
  clearInterval(siklonPutar); siklonPutar = null;
  siklonDaftar = siklonKumpul(lat, lon); siklonKe = 0;
  siklonGambar();
  if (siklonDaftar.length > 1)
    siklonPutar = setInterval(() => { siklonKe++; siklonGambar(); }, 4000);
}

/* PANEL 4, KONDISI SAAT INI. Isi tabel yang sedang jadi sorotan, satu
   parameter sekali tayang, bergantian tiap tiga detik. Angkanya SELALU jam
   yang sedang ditampilkan peta, jadi menggeser slider mengubah isinya juga.

   Barisnya TIDAK disusun ulang di sini, dia meminjam susunan yang sama
   dengan meteogram lewat barisTitik, supaya nama, ikon, satuan, dan cara
   membulatkannya tidak pernah berbeda antara tabel dan panel ini. */
let kondisiPutar = null, kondisiKe = 0;
function kondisiGambar() {
  const el = $("mb-kondisi"); if (!el) return;
  const judul = `<div class="mb-sel-judul">Kondisi saat ini</div>`;
  const b = barisTitik.filter((x) => x.ikon);
  if (!b.length || !lastPoint) { el.innerHTML = judul + `<div class="mb-sel-kosong">Belum ada data</div>`; return; }
  const i = indeksJamTitik();
  if (i < 0) { el.innerHTML = judul + `<div class="mb-sel-kosong">Jam ini di luar deret titik</div>`; return; }
  const p = b[kondisiKe % b.length];
  const [teks] = p.sel(i);
  const k = p.kondisi ? p.kondisi(i) : null;
  /* Di tabel, nilai nol ditulis titik tengah supaya kolomnya tidak penuh
     angka nol yang tidak berarti. Di panel ini titik itu berdiri sendirian
     di bawah ikon besar dan terbaca seperti gagal memuat, jadi dikembalikan
     jadi angka nol. */
  const teksPanel = teks === "·" ? "0" : teks;
  /* Satuan menempel ke ANGKANYA, bukan ke namanya. Di nama dia terbaca
     seperti bagian dari nama parameternya, "Badai CAPE", dan itu memang
     sempat terjadi. */
  el.innerHTML = judul +
    `<div class="kon-nama">${p.label}</div>` +
    `<div class="mb-sel-peraga"><span class="kon-ikon material-symbols-outlined">${k ? k.ikon : p.ikon}</span></div>` +
    /* Satuan DILEWATI kalau angkanya sudah membawanya sendiri. Suhu di tabel
       ditulis "37°", dan menambahkan satuan "°C" di belakangnya
       menghasilkan "37°°C". */
    `<div class="kon-nilai">${k ? `<span class="kon-kata">${k.nilai}</span>`
      : teksPanel + (p.satuan && !(String(teks).endsWith("°") && p.satuan.startsWith("°"))
        ? `<span>${p.satuan}</span>` : "")}</div>` +
    `<div class="sik-cacah">${(kondisiKe % b.length) + 1} dari ${b.length}</div>`;
}
/* Langkah ke berapa di deret titik yang sepadan dengan jam peta sekarang.
   Dicocokkan lewat valid_time, bukan nomor urut, sebab bingkai peta bisa
   mulai lebih awal daripada deret titiknya. */
function indeksJamTitik() {
  if (!lastPoint || !frames[current]) return -1;
  return lastPoint.times.indexOf(frames[current].valid_time);
}
function kondisiSel() {
  clearInterval(kondisiPutar);
  kondisiKe = 0;
  kondisiGambar();
  kondisiPutar = setInterval(() => { kondisiKe++; kondisiGambar(); }, 3000);
}

/* PANEL 5, ITCZ. Peta ini SENGAJA polos, tanpa parameter dan tanpa partikel,
   diminta pemilik. Yang hidup cuma pitanya, dan dia ikut jam aktif. Dengan
   latar sepolos itu pita ITCZ jadi satu satunya yang menarik mata, dan itu
   memang maksudnya. */
let petaItcz = null, petaItczGrup = null, petaItczTitik = null;
function petaItczSiap() {
  if (petaItcz) return petaItcz;
  const el = $("mb-peta-itcz"); if (!el || !el.clientWidth) return null;
  petaItcz = L.map(el, {
    zoomControl: false, attributionControl: false, zoomSnap: 0.1,
    dragging: false, scrollWheelZoom: false, doubleClickZoom: false,
    boxZoom: false, keyboard: false, touchZoom: false, fadeAnimation: false,
  });
  L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",
    { maxZoom: 16, crossOrigin: true }).addTo(petaItcz);
  petaItczGrup = L.layerGroup().addTo(petaItcz);
  petaItcz.setView([-2, 118], 2);
  return petaItcz;
}
function itczSel(lat, lon, nama) {
  const m = petaItczSiap();
  if (m) {
    m.invalidateSize(false);
    const pz = itczPorosDi(lon);
    let jarak = 6;
    if (pz) {
      const tepi = lat < pz[1] ? pz[2] : pz[3];
      jarak = Math.max(Math.abs(lat - pz[1]), Math.abs(lat - tepi));
    }
    const rentang = Math.max(4, jarak * 1.2);
    let z = Math.log2((m.getSize().y || 120) * 360 / (512 * rentang));
    m.setView([lat, lon], Math.max(2.4, Math.min(6, Math.round(z * 10) / 10)), { animate: false });
    if (petaItczTitik) petaItczTitik.remove();
    petaItczTitik = L.circleMarker([lat, lon], { radius: 4, color: "#ffffff", weight: 2,
      fillColor: "#C8553D", fillOpacity: 1, interactive: false }).addTo(m);
    petaItczGrup.clearLayers();
    itczGambarKe(petaItczGrup, null, true);
  }
  const el = $("mb-itcz-isi"); if (!el) return;
  const pz = itczPorosDi(lon);
  const di = pz && lat <= pz[2] && lat >= pz[3];
  el.innerHTML = `<b>${nama || fmtCoord(lat, lon)}</b> ` +
    (di ? "sedang dilalui ITCZ" : "tidak sedang dilalui ITCZ");
}

/* LENCANA "BUKA FITUR". Muncul waktu panel disorot, lalu mengantar ke fitur
   yang sama di peta utama. Panel Kondisi saat ini SENGAJA tidak punya, sebab
   isinya memang tidak punya fitur sendiri di peta. */
const FITUR_PANEL = {
  mjo: ["Buka fitur MJO", () => { if (!mjoOn) toggleMjo(); }],
  ausmi: ["Buka fitur AUSMI", () => { if (!ausmiOn) toggleAusmi(); }],
  siklon: ["Buka fitur Siklon", () => { if (!cyclonesOn) toggleCyclones(); }],
  itcz: ["Buka fitur ITCZ", () => { if (!itczOn) toggleItcz(); }],
};

/* Satu ketukan, tiga akibat. Panel bawah turun supaya petanya lega, kartu
   Fitur di tepi kanan terbuka supaya orang tahu saklarnya ada di sana, dan
   fiturnya sendiri dinyalakan. Urutannya begitu, bukan sebaliknya, sebab
   fitur yang menyala di balik panel yang masih menutupi peta itu percuma. */
function bukaFitur(kunci) {
  const f = FITUR_PANEL[kunci]; if (!f) return;
  hidePoint();
  const kartu = $("sisi-fitur");
  if (kartu && !kartu.classList.contains("terbuka")) $("spine-fitur")?.click();
  f[1]();
}
function pasangLencana() {
  document.querySelectorAll("#mb-fenomena .mb-sel[data-fitur]").forEach((sel) => {
    if (sel.querySelector(".mb-lencana")) return;
    const f = FITUR_PANEL[sel.dataset.fitur]; if (!f) return;
    const b = document.createElement("button");
    b.type = "button"; b.className = "mb-lencana";
    b.innerHTML = `<span class="material-symbols-outlined">open_in_new</span>${f[0]}`;
    b.addEventListener("click", (e) => { e.stopPropagation(); bukaFitur(sel.dataset.fitur); });
    sel.appendChild(b);
  });
}

/* Blok fenomena digambar ulang tiap titik berganti dan tiap jam berganti,
   sebab siklon, kondisi, dan pita ITCZ memang ikut waktu. */
let fenTitik = null;
let perluDekati = null;  // titik yang harus didekati sesudah panel selesai digambar
let barisTitik = [];     // baris meteogram berikut ikonnya, dipakai panel Kondisi
function gambarFenomena(lat, lon, nama) {
  if (lat === undefined && fenTitik) { lat = fenTitik.lat; lon = fenTitik.lon; nama = fenTitik.nama; }
  if (lat === undefined) return;
  fenomenaSkeletonLepas();
  const titikBaru = !fenTitik || fenTitik.lat !== lat || fenTitik.lon !== lon;
  fenTitik = { lat, lon, nama };
  const m = $("mb-mjo"); if (m) m.innerHTML = mjoSel(lon);
  petaAusmiSiap(); ausmiIsi();
  if (titikBaru) { siklonSel(lat, lon); kondisiSel(); }
  else { siklonDaftar = siklonKumpul(lat, lon); siklonGambar(); kondisiGambar(); }
  itczSel(lat, lon, nama);
  pasangLencana();
}

/* Kolom mana yang sedang ditampilkan peta. Dipanggil ulang dari showFrame
   supaya penanda di meteogram ikut slider. */
function tandaiJamAktif() {
  const body = $("mb-body"); if (!body || !frames[current]) return;
  const t = frames[current].valid_time;
  body.querySelectorAll(".mb-aktif").forEach((el) => el.classList.remove("mb-aktif"));
  const sel = body.querySelectorAll(`[data-t="${t}"]`);
  sel.forEach((el) => el.classList.add("mb-aktif"));
  if (sel.length) {
    const kol = sel[0], wrap = $("mb-body");
    if (wrap) {
      const kiri = kol.offsetLeft - wrap.scrollLeft;
      if (kiri < 90 || kiri > wrap.clientWidth - 60)
        wrap.scrollTo({ left: kol.offsetLeft - wrap.clientWidth / 2, behavior: "smooth" });
    }
  }
}

function renderPoint(pd, lat, lon) {
  const times = pd.meta.times;
  const u = sampleVar(pd, "u", lat, lon), v = sampleVar(pd, "v", lat, lon);
  const temp = sampleVar(pd, "temp", lat, lon), rain = sampleVar(pd, "rain", lat, lon);
  const rh = sampleVar(pd, "humidity", lat, lon), cloud = sampleVar(pd, "cloud", lat, lon);
  const pres = sampleVar(pd, "pressure", lat, lon), cape = sampleVar(pd, "cape", lat, lon);
  let wind = u && v ? u.map((uu, i) => windAt(uu, v[i])) : null;
  /* Dari city_data yang ada cuma KECEPATANNYA, arahnya tidak disampel di
     sana. Barisnya tetap dipasang dengan arah kosong, bukan dibuang, supaya
     waktu sel titiknya mendarat sedetik kemudian dan panelnya digambar
     ulang, jumlah barisnya tidak berubah dan tabelnya tidak melompat. */
  if (!wind) {
    const kec = sampleVar(pd, "wind", lat, lon);     // city_data: sudah knot
    if (kec) wind = kec.map((k) => ({ spd: k, dir: "" }));
  }
  lastPoint = { lat, lon, times, temp, rain, wind, rh, cloud, pres };

  /* Baris disusun dari variabel yang MEMANG ada. Model WRF tidak punya
     tutupan awan, dan baris berisi tanda pisah dari ujung ke ujung cuma
     memakan tinggi layar. Tiap sel memulangkan [teks, warna latar, judul]. */
  const baris = [
    /* Unsur kelima khusus baris ini, dipakai panel "Kondisi saat ini".
       Cuaca tidak punya angka, jadi di panel itu yang ditayangkan ikon
       keadaannya yang BERUBAH ikut jam, bukan ikon tetap, dan di bawahnya
       kata keadaannya, Cerah, Hujan, dan seterusnya. */
    ["Cuaca", "", "partly_cloudy_day", (i) => {
      const c = cityCondition(rain ? rain[i] : 0, cloud ? cloud[i] : null);
      return [`<span class="mb-ico ${c.cls}"><span class="material-symbols-outlined">${c.icon}</span></span>`, "", c.label];
    }, (i) => {
      const c = cityCondition(rain ? rain[i] : 0, cloud ? cloud[i] : null);
      return { ikon: c.icon, nilai: c.label.charAt(0).toUpperCase() + c.label.slice(1) };
    }],
    temp && ["Suhu", "°C", "device_thermostat", (i) =>
      [Math.round(temp[i]) + "°", skalaWarna(temp[i], SK_SUHU), temp[i].toFixed(1) + " °C"]],
    temp && rh && ["Terasa", "°C", "thermostat", (i) => {
      const ts = terasaSeperti(temp[i], rh[i]);
      return [Math.round(ts) + "°", skalaWarna(ts, SK_SUHU),
        "Terasa seperti " + ts.toFixed(1) + " °C, hitungan Heat Index dari suhu dan kelembapan, bukan keluaran model"];
    }],
    rain && ["Hujan", "mm/j", "rainy", (i) =>
      [rain[i] >= 0.1 ? rain[i].toFixed(1) : "·", skalaWarna(rain[i], SK_HUJAN), rain[i].toFixed(2) + " mm per jam"]],
    wind && ["Angin", "kt", "air", (i) =>
      [String(Math.round(wind[i].spd)), skalaWarna(wind[i].spd, SK_ANGIN), wind[i].spd.toFixed(1) + " knot"]],
    u && v && ["Arah", "", "explore", (i) => {
      const d = arahDerajat(u[i], v[i]);
      /* Panah menunjuk ke arah angin BERTIUP, hurufnya arah DATANG, patokan
         yang sama dengan seluruh app ini. Dua duanya ditulis supaya tidak
         ada yang salah baca. */
      return [`<span class="mb-panah" style="transform:rotate(${(d + 180) % 360}deg)">↑</span>`,
        "", "Datang dari " + wind[i].dir + ", " + Math.round(d) + " derajat"];
    }],
    rh && ["Lembap", "%", "humidity_percentage", (i) =>
      [String(Math.round(rh[i])), skalaWarna(rh[i], SK_RH), Math.round(rh[i]) + " persen"]],
    cloud && ["Awan", "%", "cloud", (i) =>
      [String(Math.round(cloud[i])), "", Math.round(cloud[i]) + " persen tertutup awan"]],
    pres && ["Tekanan", "hPa", "compress", (i) =>
      [String(Math.round(pres[i])), "", pres[i].toFixed(1) + " hPa"]],
    cape && ["CAPE", "J/kg", "bolt", (i) =>
      [String(Math.round(cape[i])), skalaWarna(cape[i], SK_CAPE), Math.round(cape[i]) + " J/kg, makin tinggi makin besar potensi badai"]],
  ].filter(Boolean);

  /* Kepala hari, NAMA HARI SAJA. Sempat membawa ringkasan tertinggi,
     terendah, dan hujan sehari, dan pemilik memintanya dibuang. Deret
     lengkapnya memang sudah ada di baris di bawahnya, jadi ringkasan itu
     cuma mengulang dengan cara yang lebih sulit dibaca. */
  const hari = [];
  for (let i = 0; i < times.length; i++) {
    const w = toWIB(times[i]), kunci = w.toISOString().slice(0, 10);
    let h = hari[hari.length - 1];
    if (!h || h.kunci !== kunci) { h = { kunci, w, n: 0 }; hari.push(h); }
    h.n++;
  }
  const kepalaHari = hari.map((h) => {
    const nama = h.w.toLocaleDateString("id-ID", { weekday: "long", timeZone: "UTC" });
    return `<th class="mb-hari" colspan="${h.n}"><b>${nama} ${h.w.getUTCDate()}</b></th>`;
  }).join("");

  /* MASA LALU, SEKARANG, RAMALAN. Patokannya JAM NYATA, bukan posisi slider.
     Slider sudah punya penandanya sendiri, garis tinta dua sisi, dan kalau
     dua duanya dipatok ke hal yang sama penanda itu kehilangan gunanya.

     Kolom "sekarang" itu langkah waktu yang paling dekat dengan jam ini,
     ditandai satu garis terakota di tepi kirinya. Yang sebelum dia
     diredupkan, sebab isinya analisis, bukan ramalan.

     IKUT TERHAPUS sekali waktu ringkasan harian dibuang, sebab letaknya
     bertetangga, dan panelnya langsung berbunyi "Gagal memuat data titik".
     Ditaruh di sini, di atas pemakainya, supaya tidak ikut terbawa lagi. */
  const kiniMs = Date.now();
  let iKini = -1, bedaKini = Infinity;
  times.forEach((t, i) => {
    const d = Math.abs(Date.parse(t) - kiniMs);
    if (d < bedaKini) { bedaKini = d; iKini = i; }
  });
  const kelasWaktu = (i) => (i < iKini ? " mb-lalu" : i === iKini ? " mb-kini" : "");

  const jamTh = times.map((t, i) => {
    const w = toWIB(t);
    return `<th class="mb-jam${kelasWaktu(i)}" data-t="${t}">${String(w.getUTCHours()).padStart(2, "0")}</th>`;
  }).join("");

  /* Baris DISIMPAN berikut ikonnya. Panel "Kondisi saat ini" menayangkan
     baris yang sama satu per satu, dan dia harus memakai nama, satuan, dan
     cara membulatkan yang persis sama dengan tabelnya. */
  barisTitik = baris.map(([label, satuan, ikon, sel, kondisi]) => ({ label, satuan, ikon, sel, kondisi }));

  const tbody = baris.map(([label, satuan, , f]) => {
    const sel = times.map((t, i) => {
      const [teks, warna, judul] = f(i);
      return `<td class="${kelasWaktu(i).trim()}" data-t="${t}"${warna ? ` style="background:${warna}"` : ""}` +
        `${judul ? ` title="${String(judul).replace(/"/g, "&quot;")}"` : ""}>${teks}</td>`;
    }).join("");
    return `<tr><th class="mb-label">${label}<span>${satuan}</span></th>${sel}</tr>`;
  }).join("");

  $("mb-body").innerHTML =
    `<table class="mb-tabel"><thead>` +
    `<tr><th class="mb-label mb-pojok"></th>${kepalaHari}</tr>` +
    `<tr><th class="mb-label">Jam<span>WIB</span></th>${jamTh}</tr>` +
    `</thead><tbody>${tbody}</tbody></table>`;

  /* Diukur SESUDAH isinya ada, bukan waktu panelnya dibuka. Tingginya baru
     ketahuan sesudah barisnya terpasang, dan jumlah barisnya ikut variabel
     yang dipunyai model. */
  ukurPanelBawah();
  /* Sekarang tinggi panelnya sudah final, jadi geser petanya aman. Zoom cuma
     DINAIKKAN, tidak pernah diturunkan, sebab kalau orangnya sudah mengamati
     satu pulau dari dekat, memaksanya mundur ke zoom patokan itu merebut
     pekerjaannya. */
  if (perluDekati) {
    const t = perluDekati; perluDekati = null;
    try { map.flyTo([t.lat, t.lon], Math.max(map.getZoom(), 6), { duration: 0.6 }); }
    catch (e) { /* peta belum siap */ }
  }
  tandaiJamAktif();
  muatKonteks(lat, lon, sharedPoint && sharedPoint.name);
}


/* KLIK KOLOM JAM MENGGESER WAKTU PETA. Dipasang sekali, bukan tiap gambar
   ulang, sebab isi tabelnya ditukar terus. Patokan kolomnya atribut data-t
   berisi valid_time, jadi tidak bergantung pada nomor urut yang bisa beda
   antara deret city_data dan bingkai peta. */
$("mb-body")?.addEventListener("click", (e) => {
  const sel = e.target.closest("[data-t]");
  if (!sel) return;
  const i = frames.findIndex((f) => f.valid_time === sel.dataset.t);
  if (i >= 0 && i !== current) showFrame(i);
});

function exportCSV() {
  if (!lastPoint) return;
  const p = lastPoint;
  let csv = "waktu_wib,suhu_C,angin_kt,arah,hujan_mmjam,kelembapan_pct,awan_pct,tekanan_hpa\n";
  for (let i = 0; i < p.times.length; i++) {
    const w = toWIB(p.times[i]);
    const wib = `${w.getUTCFullYear()}-${String(w.getUTCMonth() + 1).padStart(2, "0")}-${String(w.getUTCDate()).padStart(2, "0")} ${String(w.getUTCHours()).padStart(2, "0")}:00`;
    csv += [wib, p.temp ? p.temp[i].toFixed(1) : "", p.wind ? Math.round(p.wind[i].spd) : "",
            p.wind ? p.wind[i].dir : "", p.rain ? p.rain[i].toFixed(1) : "",
            p.rh ? Math.round(p.rh[i]) : "", p.cloud ? Math.round(p.cloud[i]) : "",
            p.pres ? Math.round(p.pres[i]) : ""].join(",") + "\n";
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = `titik_${p.lat.toFixed(2)}_${p.lon.toFixed(2)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}


/* TINGGI PANEL BAWAH DIUMUMKAN KE CSS. 13 Oktober 2026.

   #ui memakai justify-content space-between dengan padding 20 px, jadi
   menambah padding bawahnya otomatis mendorong slider dan legenda naik.
   Tanpa ini meteogram menimbun slider, dan slider itu justru yang paling
   sering dipakai bersamaan dengan panel ini. Tingginya tidak tetap, sebab
   jumlah barisnya ikut variabel yang dipunyai model. */
let mbTinggiLama = -1;
/* Penjaga supaya frameRegion tidak ikut jalan waktu yang berubah cuma tinggi
   kotak peta gara gara panel titik. Lihat frameRegion() di init(). */
let abaikanBingkai = false;
function ukurPanelBawah() {
  const bar = $("meteo-bar");
  const buka = bar && bar.classList.contains("open") && !bar.classList.contains("hidden");
  const h = buka ? Math.round(bar.getBoundingClientRect().height) : 0;
  document.documentElement.style.setProperty("--mb-h", h + "px");
  document.documentElement.classList.toggle("mb-buka", !!buka);
  /* PETANYA IKUT MENGECIL, bukan cuma tertutup panel. Dulu #map tetap setinggi
     layar dan panel ini menimbunnya, jadi separuh peta ada tapi tak terlihat,
     dan geser peta terasa mentok sebab kunci pan dihitung untuk peta yang
     tingginya penuh. Sekarang kotak petanya betul betul memendek, Leaflet
     diberi tahu, lalu bingkai dan kunci pannya dihitung ulang untuk tinggi
     yang baru. Hasilnya geser bebas di dalam domain.

     Dihitung ulang HANYA kalau tingginya berubah. Tanpa penjaga ini tiap
     klik titik akan mengembalikan peta ke tengah domain, dan orang kehilangan
     tempat yang sedang dilihatnya. */
  if (h === mbTinggiLama) return;
  mbTinggiLama = h;
  /* SEKETIKA, dan TANPA membingkai ulang.

     Dua duanya sempat salah. Menundanya 270 milidetik membuat Leaflet
     menggambar ulang jauh sesudah kotaknya berubah, jadi ada pita gelap
     menganga di bawah peta selama itu. Dan memanggil bingkaiUlang() menata
     ulang seluruh bingkai, jadi domainnya terdorong tiap kali panel buka
     tutup, padahal orangnya sedang melihat tempat tertentu.

     invalidateSize dengan pan false cukup, dia memberi tahu Leaflet ukuran
     barunya tanpa menggeser pusat peta. Zoom minimum yang sudah dihitung
     untuk layar penuh tetap berlaku, dan di kotak yang lebih pendek itu
     justru menyisakan ruang geser, bukan mengurangi. */
  abaikanBingkai = true;
  try { map.invalidateSize({ pan: false }); } catch (e) { /* peta belum siap */ }
  /* Dilepas di putaran berikutnya, bukan seketika, sebab Leaflet boleh
     menunda peristiwa resize-nya. */
  setTimeout(() => { abaikanBingkai = false; }, 0);
}
window.addEventListener("resize", ukurPanelBawah);

function closePoint() {
  $("meteo-bar")?.classList.remove("open", "hidden");
  clearInterval(siklonPutar); siklonPutar = null;
  clearInterval(kondisiPutar); kondisiPutar = null;
  fenTitik = null;
  ukurPanelBawah();
  $("pt-reopen")?.classList.remove("show");
  if (pointMarker) { map.removeLayer(pointMarker); pointMarker = null; }
  if (kotaTerpilih) { kotaTerpilih = null; refreshCityIcons(); }
  sharedPoint = null;
  updateHash();
}
/* Panel disembunyikan ke bawah, datanya TIDAK dibuang. Tombol balik cuma
   muncul di keadaan ini, jadi orang yang belum pernah mengklik titik tidak
   melihat tombol yang tidak ada gunanya. Sempat ada laporan panelnya tidak
   bisa dikembalikan, dan memang tombolnya tenggelam di bawah panel yang
   z-index-nya sama. Sekarang dia di atas, berlabel, dan di pojok kanan
   supaya tidak bertabrakan dengan gagang bilah bawah di telepon. */
function hidePoint() {           // sembunyikan panel, marker & data tetap
  $("meteo-bar")?.classList.add("hidden");
  $("pt-reopen")?.classList.add("show");
  ukurPanelBawah();
}
function reopenPoint() {
  $("meteo-bar")?.classList.remove("hidden");
  $("pt-reopen")?.classList.remove("show");
  ukurPanelBawah();
}

// ================= FRESHNESS · SHARE · TOAST =================
// Waktu inisiasi model (run_time GFS) dalam WIB — jam & tanggal. Kredibilitas:
// user tahu kapan data terakhir diperbarui.
const MONTHS_ID = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
// Tanda ASAL DATA di badge "Last update". Sejak cadangan GitHub Pages dibuang
// 10 Sep 2026 sumbernya cuma satu, server cirrus ITERA lewat hostingan ini.
/* Chip sumber dan warna titiknya. Kuning berarti situs sedang berdiri di atas
   cadangan, dan itu keadaan yang WAJIB kelihatan. Hijau akan berbohong, sebab
   datanya memang segar tapi bukan dari tempat yang seharusnya. Merah juga
   berbohong ke arah sebaliknya, sebab tidak ada yang rusak di layar. */
function tandaiSumber() {
  const el = $("fresh-src-text"); if (!el) return;
  /* Keadaan KETIGA sejak 13 Oktober 2026, "cirrus siap". Kita masih memakai
     data cadangan, tapi kiriman cirrus sudah mendarat dan tinggal dimuat
     ulang. Chipnya jadi tombol, sebab toast cuma lewat sekejap sedangkan
     chip ini tinggal di bilah bawah. Lihat intaiCirrus(). */
  /* CHIPNYA IKUT MODEL, bukan satu kata untuk seluruh halaman. Lihat
     `pemasok` di tabel MODELS. Model yang dimasak GitHub Actions akan
     menulis GitAction di sini walau berkasnya duduk di hostingan ini,
     sebab yang ditanya chip ini kiriman SIAPA yang sedang dipakai, bukan
     berkasnya diambil dari alamat mana. */
  const pm = pemasokModel();
  el.textContent = cirrusSiap ? "cirrus siap" : SUMBER_CADANGAN ? "GitAction" : pm.chip;
  const wadah = $("fresh-src");
  if (wadah) {
    if (cirrusSiap) {
      wadah.title = "Kiriman baru dari server cirrus sudah mendarat. Klik untuk memuat ulang halaman.";
      wadah.style.cursor = "pointer";
      wadah.onclick = () => location.reload();
    } else {
      wadah.title = SUMBER_CADANGAN
        ? "Kiriman server cirrus belum masuk lebih dari 24 jam, jadi situs memakai cadangan yang dimasak GitHub Actions"
        : `Data ${MODEL.label} dimasak ${pm.nama}, lewat hostingan ini sendiri`;
      wadah.style.cursor = "";
      wadah.onclick = null;
    }
  }
  const badge = $("data-fresh");
  if (badge) badge.dataset.sumber = SUMBER_CADANGAN ? "cadangan" : MODEL.pemasok || "cirrus";
}

// Dot HIJAU kalau data MENDARAT di path kita dalam 24 JAM terakhir, MERAH
// kalau lebih lama. Jendelanya bergulir, jadi tidak ada merah palsu antara
// tengah malam dan jam kiriman datang.
//
// Patokannya header Last-Modified catalog.json, yaitu kapan berkas itu ditaruh
// di folder kita. Ditegaskan user 12 September 2026. Kapan modelnya di-run dan
// kapan dimasak di backend BUKAN urusan titik ini. Yang ditanya cuma satu,
// dalam 24 jam terakhir ada penyegaran di path kita atau tidak.
//
// Dulu patokannya generated_at, dan itu meleset. Backend bisa mengolah ulang
// run lama lalu mengisi generated_at dengan jam hari ini, dan titiknya hijau
// padahal tak ada kiriman baru. Sebaliknya kiriman baru berisi run lama akan
// dihitung merah, padahal foldernya baru saja disegarkan.
//
// Kalau headernya tak terbaca, mundur ke generated_at supaya tidak jadi merah
// palsu. Waktu yang tak terbaca sama sekali dihitung merah.
const SEGAR_MAKS_MS = 24 * 60 * 60 * 1000;
function segar24Jam(cat) {
  const t = katalogMendarat || cat?.generated_at || cat?.run_time;
  if (!t) return false;
  const ms = Date.parse(t);
  return isFinite(ms) && Date.now() - ms <= SEGAR_MAKS_MS;
}

function updateFreshness() {
  const el = $("fresh-text"); if (!el || !catalog?.run_time) return;
  const w = toWIB(catalog.run_time);
  const hh = String(w.getUTCHours()).padStart(2, "0");
  const mm = String(w.getUTCMinutes()).padStart(2, "0");
  const tgl = `${hh}:${mm} WIB, ${w.getUTCDate()} ${MONTHS_ID[w.getUTCMonth()]} ${w.getUTCFullYear()}`;
  // Model arsip (WRF Citarum) tanggalnya 2018-2019. Kalau ditulis "Last update"
  // begitu saja orang mengira situsnya basi. Ditandai terang terangan.
  el.textContent = catalog.arsip ? `ARSIP : ${tgl}` : `Last update : ${tgl}`;
  const badge = $("data-fresh");
  // Model arsip tanggalnya MEMANG lama. Kalau ditandai merah, orang mengira
  // situsnya rusak padahal itu justru isi yang dijanjikan. Jadi dibiarkan abu.
  if (badge) {
    badge.dataset.segar = catalog.arsip
      ? "arsip"
      : (segar24Jam(catalog) ? "ya" : "tidak");
  }
  tandaiSumber();
}

// Badge AKURASI. Angkanya statis, dihitung sekali di backend lawan pos hujan,
// jadi TIDAK berubah waktu slider digeser. Cuma muncul di model yang memang
// punya verifikasi. Rinciannya ditaruh di title supaya angka telanjang di
// layar tak dibaca sebagai klaim yang lebih kuat dari yang sebenarnya.
// ================= POS HUJAN (khusus WRF) =================
// Titik pengamatan yang dipakai menghitung akurasi. Digambar TETAP, tak ikut
// tombol Kondisi, supaya orang bisa melihat angka akurasi itu diuji di mana.
// Ikonnya divIcon, bukan gambar, biar tetap tajam dan sewarna tema.
let posLayer = null;

function posIcon() {
  return L.divIcon({
    className: "",
    iconSize: [18, 18], iconAnchor: [9, 9],
    // Ikon MENARA UKUR, bukan hujan atau awan. Yang ditandai di sini alatnya,
    // bukan cuacanya, jadi lambang cuaca malah rancu dengan ikon kondisi kota.
    html: '<span class="pos-mark"><span class="material-symbols-outlined">cell_tower</span></span>',
  });
}

function drawPosHujan() {
  if (posLayer) { map.removeLayer(posLayer); posLayer = null; }
  const pos = catalog?.pos_hujan;
  if (!pos || !pos.length) return;
  const a = catalog.akurasi || {};
  posLayer = L.layerGroup([], { pane: "poshujan" });
  pos.forEach((p) => {
    L.marker([p.lat, p.lon], { icon: posIcon(), pane: "poshujan", title: `Pos hujan ${p.n}` })
      .bindTooltip(
        `<b>${p.n}</b><br>Pos hujan DAS Citarum` +
        `<br><span class="mono">${p.lat.toFixed(4)}, ${p.lon.toFixed(4)}</span>` +
        (a.hari ? `<br>Dipakai verifikasi ${a.hari} hari` : ""),
        { direction: "top", offset: [0, -10], className: "pos-tip",
          pane: "poshujan-tip" })
      .addTo(posLayer);
  });
  posLayer.addTo(map);
}

/* ================= KARTU AKURASI =================
   4 Oktober 2026, diminta user. Isinya dibangun dari catalog.akurasi, tidak
   satu angka pun dipatok di sini maupun di HTML. Kalau backend mengubah
   angkanya, kartunya ikut sendiri.

   TIDAK ADA GSAP di app ini, cuma di landing. Jadi hitungan naiknya ditulis
   tangan pakai requestAnimationFrame. Tiga puluh baris, dan itu jauh lebih
   murah daripada memuat pustaka animasi cuma untuk satu kartu. */
function angkaNaik(el, akhir, des, lama) {
  var mulai = null, selesai = false;
  function tulis(v) {
    /* Titik desimal, bukan koma. Kartu ini berbahasa Inggris, sedangkan
       badge di belakangnya tetap memakai koma mengikuti kebiasaan Indonesia.
       Dua duanya disengaja. */
    el.textContent = v.toFixed(des);
  }
  function tuntas() {
    if (selesai) return;
    selesai = true;
    tulis(akhir);
  }
  tulis(0);
  function langkah(t) {
    if (selesai) return;
    if (mulai === null) mulai = t;
    var p = Math.min(1, (t - mulai) / lama);
    /* Perlambatan di ujung, bukan laju rata. Angka yang berhenti mendadak
       terbaca seperti patah, yang melambat terbaca seperti mendarat. */
    tulis(akhir * (1 - Math.pow(1 - p, 3)));
    if (p < 1) requestAnimationFrame(langkah);
    else tuntas();
  }
  requestAnimationFrame(langkah);
  /* PENJAGA. requestAnimationFrame BISA tidak pernah berdetak, dan kalau itu
     terjadi angkanya berhenti di 0,0 selamanya. Bukan kemungkinan teoretis,
     di Chrome headless rAF cuma berdetak dua kali dalam delapan detik dan
     kartunya memang tampil kosong. Peramban sungguhan juga menahan rAF di
     tab latar belakang. Jadi sesudah durasinya lewat jauh, nilainya dipaksa
     ke angka akhir. Kalau animasinya sudah jalan, tuntas() tidak melakukan
     apa apa, dia dijaga bendera. */
  setTimeout(tuntas, lama + 600);
}

function ribuan(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/* Kartunya BERBAHASA INGGRIS, diminta user. Tapi sebagian isinya datang dari
   backend dalam bahasa Indonesia, nama parameter, nama sumber, nama bulan,
   dan satu paragraf catatan. Jadi yang bisa dipetakan dipetakan, dan yang
   tidak cocok JATUH BALIK ke teks aslinya, bukan dibuang. Kalau backend
   suatu saat mengubah kata-katanya, kartunya tetap tampil, cuma sebagian
   kembali berbahasa Indonesia. Itu lebih baik daripada kosong. */
var AKR_PARAM = {
  "Suhu": "Temperature",
  "Angin": "Wind speed",
  "Arah angin": "Wind direction",
  "Kelembapan": "Humidity",
  "Tekanan": "Pressure",
  "Hujan": "Rainfall",
};
var AKR_BULAN = {
  "Januari": "January", "Februari": "February", "Maret": "March",
  "April": "April", "Mei": "May", "Juni": "June", "Juli": "July",
  "Agustus": "August", "September": "September", "Oktober": "October",
  "November": "November", "Desember": "December",
};
function akrBulan(t) {
  return String(t).replace(/[A-Za-z]+/g, function (w) { return AKR_BULAN[w] || w; });
}
/* "METAR 21 stasiun" -> "21 METAR stations". Pola tunggal dengan jaring
   pengaman, bukan penerjemah serba bisa. */
function akrSumber(t) {
  var m = /^METAR\s+(\d+)\s+stasiun$/i.exec(String(t).trim());
  return m ? m[1] + " METAR stations" : t;
}
/* Jangkauan prakiraannya cuma ada di dalam kalimat catatan, tidak ada
   medannya sendiri. Jadi angkanya DICOMOT, bukan kalimatnya diterjemahkan. */
function akrJangkau(cat) {
  var m = /(\d+)\s*sampai\s*(\d+)\s*jam/i.exec(String(cat || ""));
  return m ? m[1] + " to " + m[2] + " h lead time" : null;
}

function isiKartuAkurasi() {
  var kartu = $("akr-card");
  var isi = kartu && kartu.querySelector(".akr-isi");
  if (!isi) return;
  var a = catalog && catalog.akurasi;
  kartu.classList.remove("jalan");

  if (!a || a.status === "soon" || a.nilai == null) {
    isi.innerHTML =
      '<div class="akr-kiri akr-sendiri">' +
      '<span class="akr-tag">Verification</span>' +
      '<p class="akr-kosong" style="margin:14px 0 0">No verification figure yet for this model. ' +
      'Accuracy is scored automatically against METAR observations, and the number appears here ' +
      'once a full daily run has been checked.</p></div>';
    return;
  }

  var asal = [];
  if (a.sumber) asal.push(akrSumber(a.sumber));
  if (a.periode) asal.push(akrBulan(a.periode));
  if (a.pasangan) asal.push(ribuan(a.pasangan) + " observation pairs");
  var jangkau = akrJangkau(a.catatan);
  if (jangkau) asal.push(jangkau);

  var par = a.parameter || {};
  var nama = Object.keys(par);
  var baris = nama.map(function (n) {
    var p = par[n];
    var ket = [];
    if (p.tol != null && p.sat) ket.push("within " + p.tol + " " + p.sat);
    if (p.mae != null && p.sat) ket.push("mean error " + p.mae + " " + p.sat);
    return '<div class="akr-par">' +
      '<div class="akr-par-atas"><span class="akr-par-nama">' + escHtml(AKR_PARAM[n] || n) + '</span>' +
      '<span class="akr-par-nil"><b data-akr="' + p.tepat + '">0.0</b>%</span></div>' +
      '<div class="akr-bar"><i style="--isi:' + p.tepat + '%"></i></div>' +
      (ket.length ? '<div class="akr-par-ket">' + escHtml(ket.join(" · ")) + '</div>' : '') +
      '</div>';
  }).join("");

  /* DUA KOLOM, 4 Oktober 2026. Angka pokok dan asal datanya di kiri, rincian
     per parameter di kanan. Dulu satu kolom dan kartunya menjulang tinggi
     kurus, user minta dibuat melebar. Catatan kakinya merentang dua kolom. */
  isi.innerHTML =
    '<div class="akr-kiri">' +
      '<span class="akr-tag">Verification</span>' +
      '<div class="akr-besar" id="akr-judul"><b data-akr="' + a.nilai + '">0.0</b><span>%</span></div>' +
      '<div class="akr-sub">Average across ' + nama.length + ' surface parameters, scored against airport observations.</div>' +
      (asal.length ? '<div class="akr-garis"></div><div class="akr-asal"><span>' +
        asal.map(escHtml).join("</span><span>") + '</span></div>' : '') +
    '</div>' +
    '<div class="akr-kanan">' + (baris ? '<div class="akr-daftar">' + baris + '</div>' : '') + '</div>' +
    '<div class="akr-catatan">Each figure is the share of forecasts that landed inside the tolerance shown. ' +
    'Mean error is the average miss, sign ignored.</div>';
}

function bukaAkurasi() {
  var ov = $("akr-overlay"), kartu = $("akr-card");
  if (!ov) return;
  isiKartuAkurasi();
  ov.classList.add("show");

  var sudah = false;
  function jalankan() {
    if (sudah) return;
    sudah = true;
    if (kartu) kartu.classList.add("jalan");
    var n = ov.querySelectorAll("[data-akr]");
    for (var i = 0; i < n.length; i++) {
      var v = parseFloat(n[i].getAttribute("data-akr"));
      if (!isNaN(v)) angkaNaik(n[i], v, 1, 1100);
    }
  }

  /* Yang minta gerakannya dikurangi dapat angka jadi, tanpa hitungan dan
     tanpa batang yang tumbuh. Transisi batangnya dimatikan CSS lewat
     prefers-reduced-motion, dan angkanya dilompatkan di sini. */
  var pelan = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (pelan) {
    if (kartu) kartu.classList.add("jalan");
    var m = ov.querySelectorAll("[data-akr]");
    for (var j = 0; j < m.length; j++) {
      var w = parseFloat(m[j].getAttribute("data-akr"));
      if (!isNaN(w)) m[j].textContent = w.toFixed(1);
    }
    return;
  }

  /* DUA rAF, bukan satu. Kalau width diisi di frame yang sama dengan
     elemennya lahir, peramban tidak punya nilai awal untuk ditransisikan dan
     batangnya langsung melompat penuh tanpa tumbuh.
     setTimeout di bawahnya penjaga, sebab rAF bisa tidak pernah berdetak. */
  requestAnimationFrame(function () { requestAnimationFrame(jalankan); });
  setTimeout(jalankan, 250);
}
function tutupAkurasi() { $("akr-overlay")?.classList.remove("show"); }

function updateAkurasi() {
  var box = $("acc-badge"), el = $("acc-text");
  if (!box || !el) return;
  var a = catalog?.akurasi;
  if (!a) { box.hidden = true; return; }
  box.hidden = false;
  /* ATRIBUT title DIBUANG 4 Oktober 2026, diminta user. Rinciannya sekarang
     ada di kartu yang dibuka dengan mengklik badge ini, dan tooltip yang
     berisi hal yang sama cuma menunda orang menemukan kartunya. Tooltip
     bawaan itu juga tidak pernah muncul di HP, tidak bisa disalin, dan
     tidak bisa diberi gaya. Kode penyusun teksnya ikut dibuang, bukan
     disisakan menganggur. */
  if (a.status === "soon" || a.nilai == null) {
    el.textContent = "Akurasi : segera";
    box.classList.add("acc-soon");
    return;
  }
  box.classList.remove("acc-soon");
  // Koma sebagai pemisah desimal, ikut kebiasaan Indonesia. Kartunya sendiri
  // berbahasa Inggris dan memakai titik, dan itu memang disengaja.
  var nil = a.nilai.toFixed(1).replace(".", ",");
  el.textContent = `Akurasi : ${nil}% ${a.label || ""}`.trim();
}

let toastTimer = null;
/* aksi opsional, dipasang 13 Oktober 2026 untuk tawaran muat ulang dari
   intaiCirrus(). Toast bertawaran bisa diketuk dan hidup 12 detik, sebab 2,2
   detik tidak cukup untuk disadari lalu diklik. Yang tanpa aksi tidak berubah
   sama sekali, tetap 2,2 detik dan tetap tembus klik, lihat .toast di CSS
   yang memakai pointer-events none. */
function toast(msg, aksi) {
  const el = $("toast"); if (!el) return;
  el.textContent = msg; el.classList.add("show");
  el.classList.toggle("tawar", !!aksi);
  el.onclick = aksi || null;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), aksi ? 12000 : 2200);
}

// Hash saat halaman dibuka (sebelum showFrame/updateHash menimpanya) — sumber
// kebenaran untuk restore link yang dibagikan.
const INITIAL_HASH = location.hash;

// URL-hash state: layer + waktu (valid_time) + titik → link bisa dibagikan &
// kebuka persis. replaceState supaya tak menumpuk riwayat / memicu navigasi.
function updateHash() {
  if (!activeLayer) return;
  const p = new URLSearchParams();
  p.set("l", activeLayer);
  const f = frames && frames[current];
  if (f?.valid_time) p.set("t", f.valid_time);
  if (sharedPoint) {
    p.set("p", sharedPoint.lat.toFixed(4) + "," + sharedPoint.lon.toFixed(4));
    if (sharedPoint.name) p.set("n", sharedPoint.name);
  }
  if (cyclonesOn) p.set("c", "1");
  if (itczOn) p.set("z", "1");
  if (mjoOn) p.set("j", "1");
  if (ausmiOn) p.set("a", "1");
  if (monsoonOn) p.set("m", "1");
  history.replaceState(null, "", location.pathname + location.search + "#" + p.toString());
}
function restoreFromHash() {
  const h = INITIAL_HASH.replace(/^#/, ""); if (!h || !catalog) return;
  const p = new URLSearchParams(h);
  const l = p.get("l");
  if (l && catalog.layers[l] && l !== activeLayer) {
    /* Tautan lama bisa saja menunjuk wind_strato. Selama ketinggian atas
       dimatikan, tautan itu DIABAIKAN, bukan dipaksa tampil, kalau tidak
       petanya menampilkan data 70 hPa sedangkan pemilihnya menulis
       Permukaan. */
    if (BASE_OF[l] && !stratoAvailable()) {
      /* dilewati dengan sengaja */
    } else {
      if (BASE_OF[l]) {   // layer versi strato -> aktifkan level dulu
        mapLevel = "strato";
        applyLevelUI();
        syncLevelControls();
      }
      setActiveLayer(l);
    }
  }
  const t = p.get("t");
  if (t && frames) {
    const idx = frames.findIndex((f) => f.valid_time === t);
    if (idx >= 0) { current = idx; showFrame(current); }
  }
  if (p.get("c") === "1" && !cyclonesOn) toggleCyclones();
  if (p.get("z") === "1" && !itczOn) toggleItcz();
  if (p.get("j") === "1" && !mjoOn) toggleMjo();
  if (p.get("a") === "1" && !ausmiOn) toggleAusmi();
  if (p.get("m") === "1" && !monsoonOn) toggleMonsoon();
  const pt = p.get("p");
  if (pt) {
    const [la, lo] = pt.split(",").map(parseFloat);
    if (isFinite(la) && isFinite(lo) && (!dataBounds || dataBounds.contains([la, lo]))) {
      map.setView([la, lo], 8, { animate: false });
      /* GELEMBUNG, bukan panel. Hash ini ditulis updateHash() tiap kali orang
         memilih titik, jadi dia bertahan di alamat tab dan ikut terbaca waktu
         halaman sekadar dimuat ulang. Dulu di situ panel bawah langsung naik,
         dan pemilik mengiranya alamat Atmosight biasa yang kelakuannya aneh.
         Sekarang jalurnya sama dengan klik biasa, gelembung dulu, panel kalau
         Detail diketuk. */
      bukaGelembung(la, lo, p.get("n") || null);
    }
  }
}
async function shareCurrent() {
  updateHash();
  const url = location.href;
  const data = { title: "Atmosight", text: "Lihat cuaca di Atmosight", url };
  try {
    if (navigator.share) { await navigator.share(data); return; }
    await navigator.clipboard.writeText(url);
    toast("Link disalin ke clipboard");
  } catch (_) { /* user batal atau clipboard diblokir */ }
}

// Layar penuh: sembunyikan semua panel kecuali brand + fullscreen browser (best-effort).
let immersive = false;
function setFsIcon() {
  const ic = document.querySelector("#fs-btn .material-symbols-outlined");
  if (ic) ic.textContent = immersive ? "fullscreen_exit" : "fullscreen";
  $("fs-btn")?.classList.toggle("active", immersive);
}
function toggleFullscreen() {
  immersive = !immersive;
  $("stage")?.classList.toggle("immersive", immersive);
  setFsIcon();
  try {
    if (immersive) document.documentElement.requestFullscreen?.();
    else if (document.fullscreenElement) document.exitFullscreen?.();
  } catch (_) { /* fullscreen API diblokir → mode sembunyi-panel tetap jalan */ }
  segarkanBingkai();
}

/* Masuk atau keluar layar penuh mengubah TINGGI jendela, jadi bingkai awalnya
   harus dihitung ulang. Kalau tidak, yang tampil masih bingkai ukuran jendela
   yang lama, dan di model berdomain terbatas tepi luar domain jadi kelihatan
   lagi di atas bawah.

   Tidak boleh bergantung pada event resize Leaflet saja. Peralihan layar penuh
   itu beranimasi dan kadang belum selesai waktu event itu datang, jadi ukuran
   yang terbaca masih ukuran lama. invalidateSize() sendiri diam saja kalau
   ukurannya dianggap belum berubah. Maka bingkainya dipanggil LANGSUNG, dua
   kali, sesudah peralihan mulai dan sesudah kira kira selesai. */
function segarkanBingkai() {
  const sekali = () => { try { map.invalidateSize(); bingkaiUlang?.(); } catch (e) { /* peta belum siap */ } };
  setTimeout(sekali, 200);
  setTimeout(sekali, 700);
}

document.addEventListener("fullscreenchange", () => {
  if (!document.fullscreenElement && immersive) {   // keluar via ESC → sinkron
    immersive = false;
    $("stage")?.classList.remove("immersive");
    setFsIcon();
  }
  segarkanBingkai();
});

// Kartu Tentang (modal)
function openAbout() { $("about-overlay")?.classList.add("show"); }
function closeAbout() { $("about-overlay")?.classList.remove("show"); }

// ================= SEARCH KOTA/KABUPATEN =================
let places = null, placesLoading = null;
async function loadPlaces() {
  if (places) return places;
  if (!placesLoading) placesLoading = fetch(ADMIN_BASE + "id_places.json")
    .then((r) => r.json())
    .then((a) => {
      // b = nama tanpa prefix (utk cari "sleman"), f = nama penuh (lowercase).
      // tier 0=ibukota provinsi, 1=kota, 2=kabupaten → menentukan mulai zoom berapa
      // ikon kondisi kota boleh muncul (strategi anti-rame saat zoom-out).
      places = a.map((p) => {
        const tier = PROV_CAPITALS.has(p.n) ? 0 : (p.n.startsWith("Kota") ? 1 : 2);
        const minZoom = tier === 0 ? 0 : (tier === 1 ? 5.5 : 6.5);
        return { n: p.n, lat: p.lat, lon: p.lon, tier, minZoom,
          b: p.n.replace(/^(Kabupaten|Kota) /, "").toLowerCase(), f: p.n.toLowerCase() };
      });
      return places;
    });
  return placesLoading;
}
function renderSearch(q) {
  const box = $("search-results"); if (!box) return;
  q = q.trim().toLowerCase();
  if (!q || !places) { box.innerHTML = ""; return; }
  const pre = [], sub = [];
  for (const p of places) {
    if (p.b.startsWith(q) || p.f.startsWith(q)) pre.push(p);       // awalan diprioritaskan
    else if (p.b.includes(q) || p.f.includes(q)) sub.push(p);
  }
  const res = pre.concat(sub).slice(0, 12);
  box.innerHTML = res.length
    ? res.map((p) => `<div class="search-item" data-lat="${p.lat}" data-lon="${p.lon}">${p.n}</div>`).join("")
    : '<div class="search-empty">Tak ada hasil</div>';
}
function pickPlace(lat, lon, name) {
  map.setView([lat, lon], 8, { animate: true });
  bukaGelembung(lat, lon, name);
  $("search-box")?.classList.remove("open");
}

// ================= LABEL & IKON KONDISI PER KOTA =================
// Kondisi cuaca titik dari hujan (mm/jam) + tutupan awan (%). sev = prioritas
// declutter (cuaca lebih parah menang saat berdesakan).
function cityCondition(rain, cloud) {
  if (rain >= 20) return { icon: "thunderstorm", cls: "cc-storm", sev: 5, label: "hujan sangat lebat" };
  if (rain >= 10) return { icon: "rainy_heavy", cls: "cc-heavy", sev: 4, label: "hujan lebat" };
  if (rain >= 0.5) return { icon: "rainy", cls: "cc-rain", sev: 3, label: "hujan" };
  // Model tanpa tutupan awan. Jangan mengaku "cerah", itu klaim
  // yang datanya tak ada. Cukup katakan tidak hujan.
  if (cloud === null || cloud === undefined || !isFinite(cloud))
    return { icon: "partly_cloudy_day", cls: "cc-pcloud", sev: 1, label: "tidak hujan" };
  if (cloud >= 85) return { icon: "cloud", cls: "cc-cloud", sev: 2, label: "berawan tebal" };
  if (cloud >= 40) return { icon: "partly_cloudy_day", cls: "cc-pcloud", sev: 1, label: "cerah berawan" };
  return { icon: "sunny", cls: "cc-sunny", sev: 0, label: "cerah" };
}

// Index waktu point_data terdekat dengan frame yang sedang ditampilkan.
const currentTimeIndex = (pd) => timeIndexOf(pd.meta.times);
function timeIndexOf(times) {
  const vt = frames[current] && frames[current].valid_time;
  if (!vt) return 0;
  const target = new Date(vt).getTime();
  let bi = 0, bd = Infinity;
  for (let i = 0; i < times.length; i++) {
    const d = Math.abs(new Date(times[i]).getTime() - target);
    if (d < bd) { bd = d; bi = i; }
  }
  return bi;
}

/* ================= ALARM HUJAN =================
   4 Oktober 2026, diminta user. Tanda berdenyut di kota yang SEKARANG kering
   tapi akan kena hujan di sisa waktu model.

   TIDAK ADA PERMINTAAN JARINGAN BARU. city_data.json sudah diunduh sejak awal
   untuk label kota, dan di dalamnya hujan 514 tempat untuk SELURUH langkah
   waktu, bukan cuma langkah yang sedang tampil. Jadi alarm ini cuma membaca
   ulang yang sudah ada di memori.

   PATOKANNYA JAM DINDING, bukan posisi slider, diminta user. Itu penting.
   Kalau ikut slider, alarmnya berubah tiap orang menggeser waktu, dan
   sesuatu yang berubah waktu digeser bukan alarm.

   JENDELANYA SELURUH SISA HORIZON MODEL, bukan angka tetap. GFS sampai 72 jam
   dengan langkah 3 jam, WRF sampai 42 jam dengan langkah 1 jam, dan kalau
   backend mengubah jangkauannya alarm ini ikut sendiri. Juga diminta user.

   AMBANGNYA DINAIKKAN JADI 5 mm, 19 Oktober 2026, diminta pemilik.

   Dengan 0,5 mm dan jendela penuh, yang berdenyut 24,5 persen kota di GFS
   dan 35,4 persen di WRF. Itu memang terlalu ramai, dan 0,5 mm itu rintik
   yang tidak membuat siapa pun mengubah rencana. Di 5 mm yang tersisa hujan
   yang betul betul terasa, dan alarmnya kembali berarti.

   SENGAJA TIDAK LAGI SAMA dengan cityCondition. Ikon kondisi kota memang
   harus menyebut rintik sebagai hujan, sebab dia menggambarkan cuaca.
   Alarm tidak, dia menyuruh orang bersiap. */
var ALARM_AMBANG = 5;   // mm, batas hujan yang pantas diberi alarm
/* Bisa dimatikan, pola yang sama dengan Siklon, ITCZ, dan Fenomena.
   Menyala sejak awal, sebab ini alarm, tapi tiap lapisan di app ini punya
   saklarnya sendiri dan yang satu ini tidak boleh jadi kekecualian.
   Dengan seperempat sampai sepertiga kota berdenyut, orang yang sedang
   membaca hal lain harus punya cara mematikannya. */
let alarmOn = true;

/* PATOKANNYA FRAME YANG SEDANG TAMPIL, bukan jam dinding.
   Diputuskan 4 Oktober sore, menggantikan keputusan pagi harinya.

   Alasannya bukan berubah pikiran. Yang diminta sekarang gelembungnya
   BERGANTI KEADAAN waktu slider sampai di jam hujannya, dan itu mustahil
   kalau patokannya jam dinding.

   Syarat "patokan jam dinding" TETAP TERPENUHI, dan ini bukan akal akalan.
   App ini membuka slidernya di nearestNowIndex(), frame terdekat dengan jam
   sekarang. Jadi waktu halaman dibuka, slider dan jam dinding memang sama,
   dan alarmnya bekerja sebagai alarm. Begitu orang menggeser waktu dia
   berubah jadi alat jelajah, dan itu memang yang diminta.
   Ikut slider juga membuatnya sinkron dengan SELURUH isi peta lain. Gelembung
   yang ikut jam dinding sendirian akan jadi satu satunya benda yang bercerita
   soal waktu yang berbeda dari yang sedang digambar. */
function alarmHujan(i) {
  if (!cityData) return null;
  var arr = cityData.data.rain;
  if (!arr || !arr[i]) return null;
  var sc = cityData.scales.rain, t = cityData.times, baris = arr[i];
  var ti = timeIndexOf(t);
  if (ti < 0 || ti >= baris.length) return null;
  var patok = new Date(t[ti]).getTime();
  var jamDari = function (k) { return (new Date(t[k]).getTime() - patok) / 3600000; };

  /* ---- KEADAAN 1, SEDANG HUJAN ---- */
  if (baris[ti] * sc >= ALARM_AMBANG) {
    var mulai = ti;
    while (mulai > 0 && baris[mulai - 1] * sc >= ALARM_AMBANG) mulai--;
    var reda = -1;
    for (var k = ti + 1; k < baris.length; k++)
      if (baris[k] * sc < ALARM_AMBANG) { reda = k; break; }
    return {
      kini: true,
      mm: baris[ti] * sc,
      sejak: -jamDari(mulai),                 // jam, sudah berlangsung berapa lama
      awalData: mulai === 0,                  // mulainya di luar jangkauan data
      reda: reda >= 0 ? t[reda] : null,       // sampelnya sudah kering di sini
      jamReda: reda >= 0 ? jamDari(reda) : null,
    };
  }

  /* ---- KEADAAN 2, AKAN HUJAN ---- */
  var awal = -1, puncak = 0;
  for (var m = ti + 1; m < baris.length; m++) {
    var v = baris[m] * sc;
    if (v >= ALARM_AMBANG && awal < 0) awal = m;
    if (awal >= 0 && v > puncak) puncak = v;
  }
  if (awal < 0) return null;
  /* Puncaknya dihitung dari saat hujan MULAI, bukan dari frame sekarang,
     supaya yang diukur memang episode yang akan datang itu.
     DUA angka untuk dua hal. `jam` kapan mulai, itu yang mengatur denyut.
     `puncak` terderas, itu yang mengatur besar gelembung. Dulu yang dipakai
     cuma nilai saat hujan pertama menyentuh ambang, dan itu menyesatkan,
     rintik 0,6 mm bisa diikuti 15 mm beberapa jam kemudian. */
  return { kini: false, jam: jamDari(awal), mm: baris[awal] * sc,
           puncak: puncak, waktu: t[awal] };
}

/* Garis tengah gelembung, piksel. Luasnya yang sebanding dengan angkanya,
   bukan garis tengahnya, jadi akarnya diambil. Itu aturan baku peta
   gelembung, sebab mata membaca LUAS bukan lebar.

   DOMAINNYA DIPATOK 0,5 sampai 20 mm, TIDAK ikut sebaran data. Diukur,
   puncak GFS cuma sampai 3,4 mm sedangkan WRF sampai 41,9 mm. Kalau
   skalanya ikut data masing masing, gelembung sebesar itu akan berarti
   3 mm di satu model dan 40 mm di model lain, dan itu bohong.
   Angka 0,5, 10, dan 20 itu ambang yang sama dengan cityCondition, jadi
   gelembung sebesar separuh kira kira berarti "hujan lebat". */
/* 16 dan 34, bukan 12 dan 30. Yang terkecil pun harus langsung terlihat,
   dan di 12 px gelembung hujan ringan nyaris hilang di antara ikon kota. */
var ALARM_MIN = 16, ALARM_MAKS = 34, ALARM_PUNCAK = 20;
function alarmGaris(mm) {
  var p = (Math.min(mm, ALARM_PUNCAK) - ALARM_AMBANG) / (ALARM_PUNCAK - ALARM_AMBANG);
  return Math.round(ALARM_MIN + (ALARM_MAKS - ALARM_MIN) * Math.sqrt(Math.max(0, p)));
}

/* Tandanya. Kelasnya ikut SEBERAPA DEKAT, bukan seberapa deras, sebab yang
   paling berguna dari alarm itu waktunya. Deras sudah diwakili ikon kotanya
   nanti waktu hujannya tiba. */
function alarmKelas(jam) {
  if (jam <= 3) return "ah-dekat";
  if (jam <= 12) return "ah-sedang";
  return "ah-jauh";
}
/* Jam dibulatkan jadi kalimat, bukan angka telanjang. "0 jam lagi" itu
   membingungkan, dan "2,7 jam" bukan cara orang bicara. */
function alarmJamKata(j) {
  return j < 1 ? "kurang dari 1 jam lagi" : Math.round(j) + " jam lagi";
}
/* Jam saja tanpa tanggal, "16:00 WIB". Kartunya sempit dan tanggalnya sudah
   kelihatan di bilah waktu di bawah peta. */
function alarmJamSaja(iso) {
  var o = { hour: "2-digit", minute: "2-digit", timeZone: "UTC" };
  return toWIB(iso).toLocaleString("id-ID", o).replace(/\./g, ":") + " WIB";
}

/* Kartu kecil waktu gelembungnya disorot. SELURUHNYA CSS, tidak ada satu pun
   pendengar kejadian. Kota digambar ulang tiap peta digeser dan tiap waktu
   diganti, jadi pendengar yang dipasang per gelembung harus dilepas lagi tiap
   kali, dan yang lupa dilepas menumpuk diam diam.

   Atribut title SENGAJA TIDAK DIPAKAI. Tooltip bawaan peramban terlambat
   sekitar sedetik, tidak bisa diberi gaya, dan tidak bisa memuat tata letak. */
function alarmHtml(a, namaKota) {
  if (!a) return "";
  var kepala = '<span class="ah-kota">' + escHtml(namaKota || "") + '</span>';

  if (a.kini) {
    /* KATA "SEKITAR" ITU WAJIB, bukan basa basi. Redanya cuma bisa diketahui
       sehalus langkah waktu modelnya, dan di GFS langkahnya 3 jam. Diukur,
       47 persen episode hujan GFS cuma muncul di SATU sampel, jadi "reda 3
       jam lagi" sebenarnya berarti "sampel berikutnya sudah kering" dan
       hujannya bisa berhenti kapan saja di antara keduanya. Kalimat yang
       terdengar seperti hitung mundur pasti itu menjanjikan ketelitian yang
       datanya tidak punya. */
    var lama = a.awalData ? "Sudah berlangsung"
             : a.sejak < 1 ? "Baru mulai"
             : "Sudah " + Math.round(a.sejak) + " jam";
    var reda = a.reda ? "reda sekitar " + alarmJamSaja(a.reda)
                      : "masih hujan sampai ujung data model";
    return '<span class="alarm-hujan ah-kini" style="--d:' + alarmGaris(a.mm) + 'px">' +
      '<i class="ah-tetes material-symbols-outlined" aria-hidden="true">water_drop</i>' +
      '<span class="ah-kartu">' + kepala +
        '<span class="ah-utama">Sedang hujan</span>' +
        '<span class="ah-jam">' + escHtml(lama) + '</span>' +
        '<span class="ah-pisah"></span>' +
        '<span class="ah-deras"><b>' + a.mm.toFixed(1).replace(".", ",") + '</b> mm, ' +
        escHtml(reda) + '</span>' +
      '</span></span>';
  }

  return '<span class="alarm-hujan ' + alarmKelas(a.jam) + '" style="--d:' + alarmGaris(a.puncak) + 'px">' +
    '<span class="ah-kartu">' + kepala +
      '<span class="ah-utama">Hujan ' + escHtml(alarmJamKata(a.jam)) + '</span>' +
      '<span class="ah-jam">' + escHtml(fmtValid(a.waktu)) + '</span>' +
      '<span class="ah-pisah"></span>' +
      '<span class="ah-deras"><b>' + a.puncak.toFixed(1).replace(".", ",") + '</b> mm terderas</span>' +
    '</span></span>';
}

// Tempatkan ikon kota: filter tier×zoom + dalam layar, urut prioritas, lalu
// GREEDY anti-tabrakan piksel → hanya yang tak overlap yang digambar. Efeknya
// zoom-out = ibukota provinsi saja; makin zoom-in makin banyak kota/kabupaten.
// ---- Sumber nilai label kota ----
// SENGAJA bukan point_data.bin.gz. Diukur 12 Okt 2026, berkas itu 22,5 MB di
// GFS dan 47,2 MB di WRF, seluruh kisi untuk semua jam dan semua variabel,
// padahal label cuma butuh 514 titik. city_data.json sudah disampel di
// backend, dan ber-Brotli dia cuma 118 KB di GFS dan 253 KB di WRF.
//
// Berkas ini SEKARANG PUNYA TUGAS KEDUA. Isinya seluruh deret waktu 514
// kota, bukan cuma angka jam ini, jadi panel titik untuk kota bernama bisa
// digambar seketika dari sini tanpa menyentuh jaringan. Lihat deretKota.
let cityData = null, cityDataLoading = null, cityIndexByName = null;
function loadCityData() {
  if (cityData) return Promise.resolve(cityData);
  if (!cityDataLoading) {
    cityDataLoading = fetch(DATA_BASE + "city_data.json")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) {
          cityIndexByName = new Map(d.places.map((n, i) => [n, i]));
          cityData = d;
        }
        return cityData;
      })
      .catch(() => null);
  }
  return cityDataLoading;
}
// Satu nilai, sudah dikembalikan ke satuan aslinya.
function cityRaw(key, i, ti) {
  const a = cityData && cityData.data[key];
  if (!a || !a[i] || a[i][ti] === undefined) return NaN;
  return a[i][ti] * cityData.scales[key];
}

// Satuan per parameter untuk label kota. Pakai SIMBOL, bukan kata.
// Derajat & persen menempel ke angka, sisanya diberi spasi (31°C, 88%, 12 kt).
const CITY_UNIT = {
  wind_surface: { u: "kt", d: 0 },
  rain_surface: { u: "mm", d: 1 },
  rain_accum_surface: { u: "mm", d: 0 },
  temp_surface: { u: "\u00b0C", d: 0 },
  humidity_surface: { u: "%", d: 0 },
  cloud_surface: { u: "%", d: 0 },
  cloudtop_temp: { u: "\u00b0C", d: 0 },
  amv_angin: { u: "m/detik", d: 0 },
  pressure_surface: { u: "hPa", d: 0 },
  storm_potential: { u: "J/kg", d: 0 },
  cin_surface: { u: "J/kg", d: 0 },
};
const CITY_VAR = { wind_surface: "wind", rain_surface: "rain", temp_surface: "temp",
                   humidity_surface: "humidity", cloud_surface: "cloud",
                   pressure_surface: "pressure", storm_potential: "cape",
                   cin_surface: "cin" };

// Nilai parameter aktif di satu kota. Rumusnya SENGAJA disamakan dengan chartSeries
// supaya angka di label dan angka di grafik panel titik tak pernah berbeda.
function cityValueText(i, ti) {
  if (BASE_OF[activeLayer]) return "";        // level strato: data titik hanya permukaan
  const s = CITY_UNIT[activeLayer];
  if (!s || !cityData) return "";
  let v;
  if (activeLayer === "rain_accum_surface") {
    const d = cityData.times[ti].slice(0, 10);   // total sepanjang TANGGAL frame aktif
    v = 0;
    cityData.times.forEach((t, k) => { if (t.slice(0, 10) === d) v += cityRaw("rain", i, k) * STEP_JAM; });
  } else {
    v = cityRaw(CITY_VAR[activeLayer], i, ti);
  }
  if (!isFinite(v)) return "";
  // Hujan per jam angkanya kecil, jadi 1 desimal. Tapi "0.0 mm" di seluruh peta
  // cuma jadi sampah visual, dan di atas 10 mm desimalnya tak berguna.
  const dec = (activeLayer === "rain_surface" && (v < 0.05 || v >= 10)) ? 0 : s.d;
  const sep = (s.u === "\u00b0C" || s.u === "%") ? "" : " ";
  return v.toFixed(dec) + sep + s.u;
}

// Nama untuk DI PETA saja, biar label pendek. Judul panel titik & tooltip tetap
// memakai nama lengkap.
//
// Awalan "Kabupaten"/"Kota" dibuang, TAPI "Kota" dipertahankan kalau ada kabupaten
// bernama sama. Tanpa ini "Kota Bandung" dan "Kabupaten Bandung" sama sama jadi
// "Bandung", padahal wilayah dan angkanya berbeda. Ada 26 pasangan seperti itu.
let cityDupNames = null;
const cityBaseName = (n) => n.replace(/^(Kabupaten|Kota)(\s+Administrasi)?\s+/, "");
function buildCityDupNames(places) {
  if (cityDupNames) return;
  const hitung = {};
  for (const p of places) { const b = cityBaseName(p.n); hitung[b] = (hitung[b] || 0) + 1; }
  cityDupNames = new Set(Object.keys(hitung).filter((k) => hitung[k] > 1));
}
function cityShortName(n) {
  const base = cityBaseName(n);
  return (/^Kota\b/.test(n) && cityDupNames && cityDupNames.has(base)) ? "Kota " + base : base;
}
const escHtml = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function refreshCityIcons() {
  if (!cityGroup) return;
  let cd, pl;
  try { cd = await loadCityData(); pl = await loadPlaces(); }
  catch (e) { console.warn("Label kota gagal dimuat:", e); return; }
  if (!cityGroup || !cd) return;   // bisa dibongkar selama await
  buildCityDupNames(pl);
  const ti = timeIndexOf(cd.times);
  const z = map.getZoom(), b = map.getBounds();
  const cands = [];
  for (const p of pl) {
    if (z < p.minZoom || !b.contains([p.lat, p.lon])) continue;
    const i = cityIndexByName.get(p.n);
    if (i === undefined) continue;   // daftar tempat & city_data tak sinkron
    cands.push({ p, cond: cityCondition(cityRaw("rain", i, ti), cityRaw("cloud", i, ti)),
                 val: cityValueText(i, ti),
                 alarm: alarmOn ? alarmHujan(i) : null });
  }
  cands.sort((a, c) => a.p.tier - c.p.tier || c.cond.sev - a.cond.sev);
  cityGroup.clearLayers();
  // Kotak anti-tabrakan LEBIH LEBAR dari ikon, karena ada nama + nilai di bawahnya.
  // Kalau tetap 32px, labelnya saling tindih dan tak terbaca. Tanpa ikon, tumpukannya
  // lebih pendek jadi jarak tegaknya boleh lebih rapat.
  const placed = [], RX = 68, RY = cityIconsOn ? 44 : 34;
  for (const c of cands) {
    const pt = map.latLngToContainerPoint([c.p.lat, c.p.lon]);
    let ok = true;
    for (let i = 0; i < placed.length; i++)
      if (Math.abs(pt.x - placed[i].x) < RX && Math.abs(pt.y - placed[i].y) < RY) { ok = false; break; }
    if (!ok) continue;
    placed.push(pt);
    const ico = cityIconsOn
      ? `<span class="cc-ico ${c.cond.cls}${c.p.tier === 0 ? " cc-cap" : ""}">` +
        `<span class="material-symbols-outlined">${c.cond.icon}</span></span>`
      : "";
    const m = L.marker([c.p.lat, c.p.lon], {
      pane: "cityicons", title: c.p.n, keyboard: false,
      icon: L.divIcon({ className: "city-cond" + (cityIconsOn ? "" : " no-ico") +
        (kotaTerpilih && c.p.n === kotaTerpilih ? " kota-pilih" : ""),
        iconSize: [30, 30], iconAnchor: [15, 15],
        html: ico + alarmHtml(c.alarm, cityShortName(c.p.n)) +
              `<span class="cc-lbl"><b>${escHtml(cityShortName(c.p.n))}</b>` +
              (c.val ? `<i>${escHtml(c.val)}</i>` : "") + `</span>` }),
    });
    m.on("click", (e) => {
      L.DomEvent.stopPropagation(e);
      if (!sktTangkap(c.p.lat, c.p.lon, c.p.n)) bukaGelembung(c.p.lat, c.p.lon, c.p.n);
    });
    cityGroup.addLayer(m);
  }
  cityPlacedPts = placed;
  refreshGeoLabels();   // nama negara/laut ditata ULANG supaya menghindari label kota
}

// Legenda kecil kategori ikon (cermin cityCondition) — dibangun sekali.
const COND_LEGEND = [
  { icon: "sunny", cls: "cc-sunny", label: "Cerah" },
  { icon: "partly_cloudy_day", cls: "cc-pcloud", label: "Berawan" },
  { icon: "cloud", cls: "cc-cloud", label: "Mendung" },
  { icon: "rainy", cls: "cc-rain", label: "Hujan" },
  { icon: "rainy_heavy", cls: "cc-heavy", label: "Lebat" },
  { icon: "thunderstorm", cls: "cc-storm", label: "Sangat lebat" },
];
function buildCondLegend() {
  const el = $("cond-legend");
  if (!el || el.dataset.built) return;
  el.innerHTML = '<div class="cl-head mono">KONDISI</div><div class="cl-grid">' +
    COND_LEGEND.map((c) =>
      `<div class="cl-item"><span class="cc-ico cc-mini ${c.cls}">` +
      `<span class="material-symbols-outlined">${c.icon}</span></span>` +
      `<span class="cl-lbl">${c.label}</span></div>`).join("") +
    "</div>";
  el.dataset.built = "1";
}

// Tombol "Kondisi" kini HANYA menyalakan ikon cuaca + legendanya. Label nama & nilai
// tak ikut mati, karena itu informasi parameter yang sedang dipilih, bukan kondisi.
// Sembunyikan/tampilkan panel Parameter + Model. Brand sengaja TETAP terlihat,
// jadi identitas dan tombol Tentang tak ikut hilang.
function togglePanels() {
  const col = document.querySelector("#ui .col:not(.items-end)");
  const btn = $("panel-toggle");
  if (!col || !btn) return;
  const tutup = col.classList.toggle("panels-hidden");
  const ic = btn.querySelector(".material-symbols-outlined");
  if (ic) ic.textContent = tutup ? "chevron_right" : "chevron_left";
  const label = tutup ? "Tampilkan panel" : "Sembunyikan panel";
  btn.setAttribute("aria-label", label);
  btn.title = label;
}

function toggleCityIcons() {
  cityIconsOn = !cityIconsOn;
  $("city-toggle") && $("city-toggle").classList.toggle("active", cityIconsOn);
  const cl = $("cond-legend");
  if (cityIconsOn) { buildCondLegend(); if (cl) cl.classList.add("show"); }
  else if (cl) cl.classList.remove("show");
  refreshCityIcons();
}

// Label kota selalu ada sejak peta dibuka. point_data SEKARANG BETUL BETUL
// dimuat di latar, lihat prefetchTitik. Dulu kalimat ini bohong, pemuatannya
// malas dan baru mulai waktu orang mengklik. Jadi peta
// tetap bisa dipakai selagi berkasnya turun; labelnya menyusul saat sudah siap.
function initCityLabels() {
  if (!cityGroup) cityGroup = L.layerGroup([], { pane: "cityicons" });
  cityGroup.addTo(map);
  refreshCityIcons();
}

// ================= SIKLON (indikasi model GFS) =================
async function loadCyclones() {
  if (cyclones) return cyclones;
  if (!cyclonesLoading) cyclonesLoading = fetch(DATA_BASE + "cyclones.json")
    .then((r) => (r.ok ? r.json() : { tracks: [] }))
    .then((j) => (cyclones = j))
    .catch(() => (cyclones = { tracks: [] }));
  return cyclonesLoading;
}
// Warna ikut TINGKAT: Siklon Lintang Tinggi (UNGU), Siklon Tropis (MERAH),
// Bibit Siklon (ORANYE), Sirkulasi Siklonik (HIJAU TUA). Kunci legenda identifikasi.
function cycloneColor(tier, cat) {
  if (tier === "EXTRA") return "#7a1fa2";              // Siklon Lintang Tinggi — ungu
  if (tier === "SEED") return "#f59f00";              // Bibit Siklon — oranye
  if (tier === "CIRC") return "#1b7a3d";              // Sirkulasi Siklonik — hijau tua
  return cat >= 3 ? "#a11010" : "#d61f1f";            // Siklon Tropis — merah
}
function refreshCyclones() {
  if (!cycloneGroup) return;
  cycloneGroup.clearLayers();
  if (!cyclonesOn || !cyclones || !frames[current]) return;
  const nowT = frames[current].valid_time;
  for (const tr of cyclones.tracks) {
    // Hanya sistem yang ADA di waktu aktif → jalur selalu ada ikon siklonnya
    // (buang bug garis nyasar dari sistem yang baru terbentuk di jam lain).
    const cur = tr.points.find((p) => p.t === nowT);
    if (!cur) continue;
    const color = cycloneColor(tr.tier, tr.peak_cat);
    const sz = (tr.tier === "TC" || tr.tier === "EXTRA") ? 36 : tr.tier === "SEED" ? 30 : 26;
    const past = [], future = [];
    for (const p of tr.points) (p.t < nowT ? past : future).push([p.lat, p.lon]);
    if (past.length && future.length) future.unshift(past[past.length - 1]); // sambung
    if (past.length > 1)
      L.polyline(past, { pane: "cyclonepath", color, weight: 2, opacity: 0.3, dashArray: "3 5", interactive: false }).addTo(cycloneGroup);
    if (future.length > 1)
      L.polyline(future, { pane: "cyclonepath", color, weight: 3, opacity: 0.9, interactive: false }).addTo(cycloneGroup);
    for (const p of tr.points) {
      if (p.t < nowT) continue;       // titik prakiraan ke depan
      L.circleMarker([p.lat, p.lon], { pane: "cyclonepath", radius: 2.5, weight: 0,
        fillColor: color, fillOpacity: 0.9, interactive: false }).addTo(cycloneGroup);
    }
    const m = L.marker([cur.lat, cur.lon], {
      pane: "cyclones", keyboard: false,
      title: `${tr.name} · ${cur.label} · ${cur.wind_kt} kt · ${cur.mslp} hPa`,
      icon: L.divIcon({ className: "cyc-mark", iconSize: [sz, sz], iconAnchor: [sz / 2, sz / 2],
        html: `<span class="cyc-spin" style="color:${color};font-size:${sz - 4}px"><span class="material-symbols-outlined" style="font-size:${sz - 4}px">cyclone</span></span>` }),
    });
    m.on("click", (e) => {
      L.DomEvent.stopPropagation(e);
      if (!sktTangkap(cur.lat, cur.lon, tr.name)) openPoint(cur.lat, cur.lon, tr.name);
    });
    cycloneGroup.addLayer(m);
  }
}
function toggleCyclones() {
  cyclonesOn = !cyclonesOn;
  $("cyclone-toggle") && $("cyclone-toggle").classList.toggle("active", cyclonesOn);
  const note = $("cyc-note");
  if (cyclonesOn) {
    if (!cycloneGroup) cycloneGroup = L.layerGroup([], { pane: "cyclones" });
    cycloneGroup.addTo(map);
    if (note) note.classList.add("show");
    loadCyclones().then(() => { if (cyclonesOn) refreshCyclones(); });
  } else {
    if (cycloneGroup) { cycloneGroup.clearLayers(); map.removeLayer(cycloneGroup); }
    if (note) note.classList.remove("show", "open");
  }
  updateHash();
}

// ================= ZONA ITCZ (indikasi model GFS) =================
// Sabuk pertemuan angin pasat dua belahan bumi → banyak awan & hujan. Digambar
// sebagai PITA zona (konvergensi kuat) + GARIS sumbu. Hanya untuk jam prakiraan
// run aktif (0..72 jam); waktu lampau tak punya data (konsisten dgn siklon).
const ITCZ_COLOR = "#ff2ea6";   // magenta terang — kontras di semua warna heatmap
async function loadItcz() {
  if (itcz) return itcz;
  if (!itczLoading) itczLoading = fetch(DATA_BASE + "itcz.json")
    .then((r) => (r.ok ? r.json() : { times: [], frames: [] }))
    .then((j) => (itcz = j))
    .catch(() => (itcz = { times: [], frames: [] }));
  return itczLoading;
}
function refreshItcz() {
  if (!itczGroup) return;
  itczGroup.clearLayers();
  if (!itczOn) return;
  itczGambarKe(itczGroup, "itcz");
}

/* Gambar ITCZ DIPISAH dari toggle-nya 13 Oktober 2026, sebab sekarang ada
   dua peta yang menggambarnya, peta utama dan peta sisipan di panel titik.
   pane boleh kosong untuk peta yang tidak punya pane khusus. */
function itczGambarKe(grup, pane, kecil) {
  if (!grup || !itcz || !itcz.times || !frames[current]) return;
  const ti = itcz.times.indexOf(frames[current].valid_time);
  if (ti < 0) return;                         // waktu lampau → tak ada garis
  const po = pane ? { pane } : {};
  /* Di peta sisipan garisnya ditipiskan setengah. Ketebalan yang pas di
     peta selebar layar jadi pita raksasa di kotak 467 x 170. */
  const w = kecil ? 0.5 : 1;
  for (const sg of itcz.frames[ti] || []) {
    if (sg.length < 2) continue;
    // Pita zona: tepi utara (maju) + tepi selatan (mundur) → poligon terisi.
    const ring = [];
    for (const p of sg) ring.push([p[2], p[0]]);                // [latN, lon]
    for (let i = sg.length - 1; i >= 0; i--) ring.push([sg[i][3], sg[i][0]]); // [latS, lon]
    L.polygon(ring, Object.assign({ color: ITCZ_COLOR, weight: 1, opacity: 0.35,
      fillColor: ITCZ_COLOR, fillOpacity: 0.2, interactive: false }, po)).addTo(grup);
    // Garis sumbu: casing putih (kontras di latar gelap/terang) + garis teal putus.
    const axis = sg.map((p) => [p[1], p[0]]);
    L.polyline(axis, Object.assign({ color: "#ffffff", weight: 6 * w, opacity: 0.35,
      interactive: false, lineCap: "round", lineJoin: "round" }, po)).addTo(grup);
    L.polyline(axis, Object.assign({ color: ITCZ_COLOR, weight: 3 * w, opacity: 0.95,
      dashArray: kecil ? "5 4" : "7 5", interactive: false, lineCap: "round", lineJoin: "round" }, po)).addTo(grup);

    /* NAMA DITULIS DI PITANYA, bukan di keterangan pojok. Diminta pemilik,
       dan memang lebih jelas, orang tidak perlu mencocokkan warna dengan
       kotak legenda. Ditaruh berkala tiap 20 derajat bujur supaya di peta
       sekecil apa pun selalu ada satu yang kebetulan terlihat, dan tiap
       label dimiringkan mengikuti kemiringan poros di titik itu.

       Kemiringannya dihitung dari derajat langsung, bukan dari piksel.
       Di sekitar khatulistiwa Mercator hampir sebangun, dan poros ITCZ
       memang tinggalnya di situ, jadi bedanya tak terlihat. */
    if (kecil) {
      for (let i = 1; i < sg.length - 1; i++) {
        if (Math.round(sg[i][0]) % 20 !== 0) continue;
        const a = sg[i - 1], b2 = sg[i + 1];
        const sudut = Math.atan2(-(b2[1] - a[1]), b2[0] - a[0]) * 180 / Math.PI;
        L.marker([sg[i][1], sg[i][0]], {
          interactive: false, keyboard: false,
          icon: L.divIcon({
            className: "itcz-nama",
            html: `<span style="transform:rotate(${sudut.toFixed(1)}deg)">Zona ITCZ</span>`,
            iconSize: [0, 0], iconAnchor: [0, 0],
          }),
        }).addTo(grup);
      }
    }
  }
}
function toggleItcz() {
  itczOn = !itczOn;
  $("itcz-toggle") && $("itcz-toggle").classList.toggle("active", itczOn);
  const note = $("itcz-note");
  if (itczOn) {
    if (!itczGroup) itczGroup = L.layerGroup([], { pane: "itcz" });
    itczGroup.addTo(map);
    if (note) note.classList.add("show");
    loadItcz().then(() => { if (itczOn) refreshItcz(); });
  } else {
    if (itczGroup) { itczGroup.clearLayers(); map.removeLayer(itczGroup); }
    if (note) note.classList.remove("show", "open");
  }
  updateHash();
}

// ================= MJO (Madden-Julian Oscillation) =================
//
// Dua sumber, dan frontend memakai yang terbaik yang tersedia.
//
// 1. `mjo.json` dari backend. Ini yang BENAR. Indeks RMM dihitung mengikuti
//    Wheeler dan Hendon 2004, dan resep itu WAJIB memakai data SELURUH bujur
//    bumi, sebab EOF-nya global. Backend punya GFS global, jadi dia bisa.
//    Kontrak berkasnya ditulis di UNTUK-TEMAN-mjo.md.
//
// 2. Kalau `mjo.json` belum ada, frontend menghitung AMPLOP LEMBAP sendiri
//    dari `profile.bin.gz` yang memang sudah diunduh untuk Skew-T.
//
// SOAL NAMA, ini penting. Yang dihitung sendiri di nomor 2 BUKAN RMM dan tidak
// boleh disebut RMM. Dia cuma letak selubung lembap di dalam kotak data kita,
// 62 sampai 180 BT. Dia tidak bisa membedakan MJO dari El Nino, monsun, atau
// gelombang Kelvin, sebab ketiganya hidup di kotak yang sama dan untuk
// memisahkannya perlu rentang waktu puluhan hari yang tidak kita punya.
// Karena itu banernya berganti kalimat menurut sumbernya, dan mode lokal
// menyebut dirinya "perkiraan", bukan indeks.
//
// KENAPA KELEMBAPAN, BUKAN ANGIN. Diuji 5 Oktober 2026 pada run GFS nyata.
// U200 ternyata timuran di 118 dari 119 bujur pada SEMUA langkah waktu, jadi
// tes baroklinik yang biasa dipakai tidak membedakan apa apa di sini. Pelacak
// puncak baratan U850 lompat 30 derajat dalam 6 jam, setara 120 derajat per
// hari, padahal MJO bergerak sekitar 5. Kelembapan lapis tengah jauh lebih
// tenang, goyangannya 0,74 derajat antar langkah, dan pusat amplop yang
// ditemukannya 85,5 BT cocok dengan keterangan BMKG hari itu bahwa MJO sedang
// melintasi Samudra Hindia sebelah barat Sumatra.
/* HIJAU NEON, diganti dari ungu 6 Oktober atas permintaan pemilik, dan
   angkanya mendukung. Palet kontur anomali membentang dari biru sampai merah
   dan TIDAK PUNYA HIJAU sama sekali, jadi hijau satu satunya hue yang tidak
   bertabrakan dengan datanya sendiri.
   Diukur jarak RGB ke warna palet TERDEKAT, makin jauh makin tidak mungkin
   tertukar. Hijau ini 212, sedangkan ungu lama cuma 92, sebab ungu duduk
   dekat ujung biru paletnya sendiri. Itu sebabnya ungu tenggelam.
   Magenta tidak dipakai, itu milik ITCZ. */
const MJO_COLOR = "#39ff14";
const MJO_LINTANG = 17;         // pita digambar 17 LS sampai 17 LU
const MJO_HALUS = 15;           // penghalusan, derajat bujur
const MJO_K_SD = 0.6;           // ambang = rata rata + k x simpangan baku
const MJO_LEBAR_MIN = 60;       // domain lebih sempit dari ini, mode lokal MATI

let mjoOn = false;
let mjo = null, mjoLoading = null, mjoGroup = null;
let mjoBase = null;   // folder yang akhirnya memuat mjo.json, untuk lencana sumber
let mjoLokal = null;            // hasil hitung sendiri, per model, dihitung sekali
let mjoSibuk = false;

/* FOLDER MODEL GLOBAL, dipakai berkas yang isinya BUKAN keluaran model yang
   sedang dilihat. 13 Oktober 2026.

   MJO dan AUSMI itu indeks global. RMM dihitung dari OLR dan angin analisis,
   AUSMI dari rerata kotak u850 di 110 sampai 130 BT, dan dua duanya tidak
   berubah gara gara peta yang sedang dibuka WRF atau GFS. Backend cuma
   menaruhnya di folder GFS, jadi waktu orang membuka WRF panel MJO dan AUSMI
   berbunyi "belum ada" padahal datanya ada di sebelah.

   Yang TIDAK ikut aturan ini, ITCZ dan siklon. Dua duanya memang dihitung
   dari medan model yang sedang dilihat, jadi versi WRF-nya berbeda dengan
   versi GFS dan memang harus dibaca dari foldernya sendiri. */
function basisGlobal() {
  const m = MODELS[MODEL_GLOBAL];
  return m && m.base ? m.base : DATA_BASE;
}

async function loadMjo() {
  if (mjo) return mjo;
  if (!mjoLoading) {
    /* fetchUlang, bukan fetch telanjang. Berkas ini 66 KB dan sekali gugur di
       jaringan panelnya berbunyi "MJO belum ada" sampai halaman dimuat ulang,
       padahal datanya ada. Sudah kejadian sekali waktu diuji. Pola yang sama
       dipakai point_meta.json dan catalog.json. */
    const ambil = (base) => fetchUlang(base + "mjo.json")
      .then((r) => { if (!r.ok) return null; mjoBase = base; return r.json(); });
    mjoLoading = ambil(DATA_BASE)
      .then((j) => (j || (basisGlobal() !== DATA_BASE ? ambil(basisGlobal()) : null)))
      .then((j) => (mjo = j || { kosong: true }))
      .catch(() => (mjo = { kosong: true }));
  }
  return mjoLoading;
}
const mjoPunyaIndeks = () => !!(mjo && !mjo.kosong && mjo.indeks);
const mjoPunyaAmplop = () => !!(mjo && !mjo.kosong && Array.isArray(mjo.amplop) && mjo.amplop.length);

/* Amplop lembap dari satu profil RH per bujur.
   Ambangnya ADAPTIF, rata rata ditambah 0,6 simpangan baku dari bujur yang ada,
   bukan angka tetap. Ambang tetap akan gagal total di dua arah. Tahun El Nino
   kuat seluruh kotak kita bisa kering sehingga tidak ada yang lewat ambang, dan
   di puncak musim hujan semuanya lewat sehingga amplopnya selebar layar.
   Yang ditanya memang pertanyaan relatif, di mana yang paling lembap SEKARANG,
   dan itu tidak butuh iklim acuan yang memang tidak kita punya. */
function mjoAmplopDari(prof, lonBarat, dx) {
  const nx = prof.length;
  const sp = Math.max(1, Math.round(MJO_HALUS / dx / 2));
  const sm = new Float32Array(nx);
  for (let i = 0; i < nx; i++) {
    let s = 0, c = 0;
    for (let k = -sp; k <= sp; k++) {
      const j = i + k;
      if (j < 0 || j >= nx) continue;         // tepi dirata ratakan dari yang ADA,
      s += prof[j]; c++;                      // bukan dianggap nol, biar tidak bias turun
    }
    sm[i] = s / c;
  }
  let rata = 0; for (let i = 0; i < nx; i++) rata += sm[i]; rata /= nx;
  let va = 0; for (let i = 0; i < nx; i++) va += (sm[i] - rata) * (sm[i] - rata);
  const amb = rata + MJO_K_SD * Math.sqrt(va / nx);
  /* SEMUA amplop dikembalikan, bukan yang terkuat saja. Ini bukan kemewahan.
     Diuji 5 Oktober 2026, run GFS saat itu punya DUA zona lembap, satu di
     Samudra Hindia sekitar 69 sampai 99 BT dan satu lagi di Pasifik tengah
     dari 165 BT terus ke timur. Yang terkuat justru yang Pasifik, dan itu
     konveksi El Nino, bukan MJO. Menampilkan yang terkuat saja berarti
     menunjuk tempat yang salah dengan penuh percaya diri. */
  const hasil = []; let i = 0;
  while (i < nx) {
    if (sm[i] >= amb) {
      let j = i; while (j + 1 < nx && sm[j + 1] >= amb) j++;
      let bobot = 0, num = 0, den = 0;
      for (let k = i; k <= j; k++) {
        const w = sm[k] - amb; bobot += w; num += w * (lonBarat + k * dx); den += w;
      }
      if ((j - i) * dx >= 8) hasil.push({      // ruas tipis di bawah 8 derajat dibuang, itu derau
        lon_barat: lonBarat + i * dx,
        lon_timur: lonBarat + j * dx,
        lon_pusat: num / den,
        bobot: bobot,
        lokal: true,
        /* Amplop yang menyentuh tepi kotak data itu amplop TERPOTONG. Pusatnya
           pasti bias ke dalam sebab bagian di luar tidak ikut ditimbang, dan
           pusat sebenarnya bisa jauh di luar domain. Yang begini TIDAK BOLEH
           diberi garis pusat, sebab garis itu menjanjikan ketelitian palsu. */
        tepi_barat: i === 0,
        tepi_timur: j === nx - 1,
        tepi: i === 0 || j === nx - 1,
      });
      i = j + 1;
    } else i++;
  }
  hasil.sort((a, b) => b.bobot - a.bobot);
  return hasil.length ? hasil : null;
}

/* RH lapis tengah 500 sampai 800 hPa, dirata ratakan 10 LS sampai 10 LU,
   satu nilai per bujur, untuk tiap langkah waktu profil. */
function mjoHitungLokal(pd) {
  const { nx, ny, bounds, dx, dy, levels, times } = pd.meta;
  const nlev = levels.length, plane = nx * ny;
  const lonBarat = bounds[0], latUtara = bounds[3];
  const lap = [];
  levels.forEach((p, i) => { if (p >= 500 && p <= 800) lap.push(i); });
  if (!lap.length) return null;
  const y0 = Math.max(0, Math.round((latUtara - 10) / dy));
  const y1 = Math.min(ny - 1, Math.round((latUtara + 10) / dy));
  const rr = pd.vars.r;
  const out = [];
  for (let ti = 0; ti < times.length; ti++) {
    const prof = new Float32Array(nx);
    for (let x = 0; x < nx; x++) {
      let s = 0, c = 0;
      for (const l of lap) {
        const b = (ti * nlev + l) * plane;
        for (let y = y0; y <= y1; y++) { s += rr.arr[b + y * nx + x]; c++; }
      }
      prof[x] = (s / c) * rr.scale + rr.offset;
    }
    out.push(mjoAmplopDari(prof, lonBarat, dx));
  }
  return out;
}

/* Mode lokal cuma masuk akal kalau kotak datanya LEBAR. Selubung MJO sendiri
   lebarnya 30 sampai 40 derajat bujur, jadi di domain WRF yang cuma menutupi
   Indonesia, amplopnya pasti menyentuh kedua tepi dan angkanya tidak berarti
   apa apa. Lebih baik fiturnya diam dan bilang belum ada datanya. */
async function mjoSiapkanLokal() {
  if (mjoLokal) return mjoLokal;
  if (mjoPunyaAmplop()) return null;          // backend sudah kirim, profil tak perlu disentuh
  if (!SKEWT_ADA) return null;                // tak ada profile_meta.json
  try {
    const pd = await muatProfilPenuh();
    const lebar = pd.meta.bounds[2] - pd.meta.bounds[0];
    if (lebar < MJO_LEBAR_MIN) return null;
    mjoLokal = mjoHitungLokal(pd);
    return mjoLokal;
  } catch (e) {
    return null;
  }
}

/* Selalu mengembalikan DAFTAR amplop, walau isinya satu. Backend boleh
   mengirim satu objek per waktu atau daftar, dua duanya diterima. */
function mjoAmplopAktif() {
  const vt = frames && frames[current] && frames[current].valid_time;
  if (mjoPunyaAmplop()) {
    const hit = mjo.amplop.find((x) => x.waktu === vt) || mjo.amplop[0];
    if (!hit) return null;
    const d = Array.isArray(hit.zona) ? hit.zona : [hit];
    return d.filter((x) => isFinite(x.lon_barat) && isFinite(x.lon_timur));
  }
  if (mjoLokal && profilBlob) return mjoLokal[profileTimeIndex(profilBlob)] || null;
  return null;
}

/* PENGHALUS KOTAK ANOMALI.
   Tiga layer anomali dirender backend dari kisi 1 DERAJAT, sedangkan layer
   lain dari 0,25 derajat. Caranya sama, resolusinya yang 4 kali lebih kasar,
   jadi selnya 4 kali lebih besar di layar dan terbaca sebagai kotak kotak.

   Yang benar benar membereskannya cuma backend, dengan merender anomali di
   kisi yang sama dengan layer lain. Sambil menunggu itu, panenya diberi blur
   seukuran separuh sel, dan hasilnya sudah jauh lebih enak dilihat.

   BLUR DIPASANG DI PANE, bukan di elemen gambarnya. Elemen gambar diganti
   tiap frame berubah, jadi gaya yang ditempel di situ hilang tiap slider
   digeser. Pane-nya tetap. Pane ini isinya cuma heatmap, partikel angin ada
   di lapisan sendiri, jadi tidak ada yang ikut buram.

   Radiusnya IKUT ZOOM. Blur piksel tetap akan terlalu kuat waktu dizoom jauh
   dan tidak terasa waktu dizoom dekat, sebab yang mau dihaluskan itu sel
   data, bukan piksel layar. */
const ANOM_LAYER = ["olr_anom", "u850_anom", "u200_anom"];
const ANOM_SEL_DERAJAT = 1.0;      // kerapatan kisi anomali dari backend
function setelHalusAnomali() {
  const pane = map.getPane("speed");
  if (!pane) return;
  if (!ANOM_LAYER.includes(activeLayer)) { pane.style.filter = ""; return; }
  const b = map.getBounds();
  const lebarDerajat = Math.max(1e-6, b.getEast() - b.getWest());
  const pxPerDerajat = map.getSize().x / lebarDerajat;
  const r = Math.max(0.6, Math.min(16, pxPerDerajat * ANOM_SEL_DERAJAT * 0.45));
  pane.style.filter = "blur(" + r.toFixed(1) + "px)";
}
map.on("zoomend moveend", setelHalusAnomali);

/* ZONA FASE MJO DI PETA.
   Menggantikan pita amplop lembap yang dulu dipakai waktu indeks belum ada.
   Sekarang indeksnya ada, jadi yang digambar bukan tebakan letak selubung
   lagi, melainkan GEOGRAFI FASE yang memang sudah baku.

   Susunannya mengikuti oktagon persis. Empat zona, tiap zona dua fase, jadi
   delapan fase. Nama zonanya sama dengan empat sisi oktagon, supaya orang
   yang melihat kartu lalu melihat peta tidak perlu menerjemahkan apa apa.

   TIDAK SEMUA ZONA BISA TERGAMBAR, dan itu disengaja. Domain kita 62 sampai
   180 BT, sedangkan fase 8 dan 1 ada di belahan barat bumi. Yang di luar
   dilewati, yang terpotong digambar sampai batas domain saja dan ditandai.

   Batas bujurnya patokan lazim di makalah MJO. Angkanya memang tidak tunggal
   di literatur, beda penulis beda sedikit, jadi ini dipatok di sini supaya
   peta dan kartu tidak pernah bercerita beda. */
/* TIAP ZONA WARNA SENDIRI, diminta pemilik. Ini sebenarnya jalan keluar yang
   benar, dan dua percobaan sebelumnya gagal karena salah menargetkan.
   Yang perlu kontras BUKAN zona lawan data di bawahnya, melainkan ZONA LAWAN
   ZONA. Mata membaca batasnya, bukan warna mutlaknya. Jadi satu warna untuk
   semua zona memang mustahil terbaca berapa pun alfanya, sedangkan tiga warna
   berbeda langsung terbaca walau masing masing bercampur dengan datanya.
   Hue-nya dijauhkan satu sama lain, hijau, ungu, oranye, toska. */
const MJO_ZONA = [
  { nama: "Samudra Hindia", warna: "#39ff14", teks: "#15611a",
    fase: [[2, 50, 72.5], [3, 72.5, 95]] },
  { nama: "Benua Maritim",  warna: "#b14cff", teks: "#5a1a94",
    fase: [[4, 95, 120], [5, 120, 145]] },
  { nama: "Pasifik barat",  warna: "#ff9500", teks: "#8a4a00",
    fase: [[6, 145, 167.5], [7, 167.5, 190]] },
  { nama: "Belahan barat",  warna: "#00c8ff", teks: "#00506b",
    fase: [[8, 190, 300], [1, 300, 410]] },
];
const ZONA_LINTANG = 17;

/* BUJUR SEBUAH TITIK MASUK FASE MJO YANG MANA. 13 Oktober 2026.

   Dipakai menandai juring di oktagon panel titik. Patokannya MJO_ZONA di
   atas, daftar yang sama yang mewarnai zona di peta, jadi juring yang
   merah di oktagon dan zona yang menyala di peta TIDAK MUNGKIN berbeda.

   Rentangnya ditulis 50 sampai 410 derajat, jadi bujur negatif atau yang
   sudah lewat 180 digeser dulu ke jendela itu. */
function mjoFaseBujur(lon) {
  let b = Number(lon);
  if (!isFinite(b)) return null;
  while (b < 50) b += 360;
  while (b >= 410) b -= 360;
  for (const z of MJO_ZONA)
    for (const [f, a, c] of z.fase)
      if (b >= a && b < c) return { fase: f, zona: z.nama };
  return null;
}

/* Kotak data kita, dipakai memotong zona yang menjulur keluar. Diambil dari
   katalog kalau ada, bukan dipatok, sebab domain backend pernah berubah. */
function zonaBatasDomain() {
  const b = catalog && catalog.region && catalog.region.bounds;
  return b ? [Number(b[0]), Number(b[2])] : [62, 180];
}

function gambarZonaMjo() {
  if (!mjoPunyaIndeks()) return false;
  const faseKini = Number(mjo.indeks.fase);
  const amp = Number(mjo.indeks.amplitudo);
  /* Amplitudo di bawah 1 berarti titiknya di DALAM lingkaran satuan, dan di
     situ nomor fasenya tidak berarti. Zonanya tetap digambar supaya orang
     tahu petanya dibagi apa, tapi TIDAK ADA yang berkedip. Berkedip waktu
     fasenya sendiri tidak berarti itu berbohong. */
  const lemah = !(amp >= 1);
  const [dW, dE] = zonaBatasDomain();
  /* Leaflet pakai renderer KANVAS di app ini, dan kanvas tidak bisa
     dianimasikan CSS. Kedipnya CSS, jadi pane ini dipaksa SVG. */
  const svg = L.svg({ pane: "mjo" });

  MJO_ZONA.forEach((z) => {
    const faseTampak = z.fase
      .map(([f, a, b]) => [f, Math.max(a, dW), Math.min(b, dE), a < dW, b > dE])
      .filter(([, a, b]) => b - a > 0.5);
    if (!faseTampak.length) return;               // zona ini di luar domain
    const zonaAktif = !lemah && z.fase.some(([f]) => f === faseKini);
    const zW = Math.min(...faseTampak.map((x) => x[1]));
    const zE = Math.max(...faseTampak.map((x) => x[2]));

    // Bidang zona, warnanya sendiri. Yang menampung fase sekarang berdenyut.
    L.rectangle([[-ZONA_LINTANG, zW], [ZONA_LINTANG, zE]], {
      pane: "mjo", renderer: svg, interactive: false,
      className: "mjo-zona" + (zonaAktif ? " mjo-zona-aktif" : ""),
      stroke: false, fillColor: z.warna, fillOpacity: 1,
    }).addTo(mjoGroup);

    faseTampak.forEach(([f, a, b, potongBarat, potongTimur]) => {
      const aktif = !lemah && f === faseKini;
      // Fase yang ditempati, warna zona yang sama tapi lebih pekat.
      if (aktif) {
        L.rectangle([[-ZONA_LINTANG, a], [ZONA_LINTANG, b]], {
          pane: "mjo", renderer: svg, interactive: false,
          className: "mjo-fase-aktif", stroke: false,
          fillColor: z.warna, fillOpacity: 1,
        }).addTo(mjoGroup);
      }
      /* Garis pemisah cuma di tepi yang NYATA. Tepi yang berimpit batas
         domain itu bukan batas fase, itu tempat data kita habis. */
      [[a, potongBarat], [b, potongTimur]].forEach(([lon, potong]) => {
        if (potong) return;
        L.polyline([[-ZONA_LINTANG, lon], [ZONA_LINTANG, lon]], {
          pane: "mjo", renderer: svg, interactive: false,
          className: "mjo-garis-fase" + (aktif ? " aktif" : ""),
          color: z.warna, weight: aktif ? 2.4 : 1.2,
        }).addTo(mjoGroup);
      });
      // Nomor fase. Di pane ATAS label peta, kalau tidak dia tertimpa.
      L.marker([ZONA_LINTANG - 1.8, (a + b) / 2], {
        pane: "mjokepala", interactive: false, keyboard: false,
        icon: L.divIcon({
          className: "", iconSize: [34, 20], iconAnchor: [17, 10],
          html: '<span class="mjo-no-fase' + (aktif ? " aktif" : "")
                + '" style="color:' + z.teks + '">' + f + "</span>",
        }),
      }).addTo(mjoGroup);
    });

    // Nama zona di bawah, satu per zona.
    L.marker([-ZONA_LINTANG + 2.4, (zW + zE) / 2], {
      pane: "mjokepala", interactive: false, keyboard: false,
      icon: L.divIcon({
        className: "", iconSize: [170, 16], iconAnchor: [85, 8],
        html: '<span class="mjo-nama-zona' + (zonaAktif ? " aktif" : "")
              + '" style="color:' + z.teks + '">' + escHtml(z.nama) + "</span>",
      }),
    }).addTo(mjoGroup);
  });
  return true;
}

function refreshMjo() {
  if (!mjoGroup) return;
  mjoGroup.clearLayers();
  if (!mjoOn) return;
  /* Kalau indeksnya ada, yang digambar ZONA FASE. Amplop lembap cuma dipakai
     waktu backend belum mengirim indeks, dan dia memang cuma tebakan letak
     selubung dari kelembapan. Dua duanya sekaligus akan saling menutupi. */
  if (gambarZonaMjo()) return;
  const daftar = mjoAmplopAktif();
  if (!daftar || !daftar.length) return;
  daftar.forEach((a, idx) => {
    /* Yang kedua dan seterusnya digambar lebih pudar. Dia zona lembap yang sah,
       tapi yang terkuat tetap yang paling pantas dilihat duluan. */
    const redup = idx === 0 ? 1 : 0.6;
    /* TEPINYA SENGAJA TIDAK TEGAS. Selubung MJO tidak punya batas, dan garis
       tajam menjanjikan ketelitian yang tidak ada. Tiga kotak bertumpuk yang
       makin ke dalam makin pekat itu cara termurah membaca "kira kira di sini"
       tanpa gradien sungguhan di Leaflet. */
    /* Angkanya DIUKUR, bukan dikira kira. Percobaan pertama memakai 0,05 sampai
       0,09 dan hasilnya tidak terlihat sama sekali di atas heatmap. Dibaca
       langsung dari kanvas pane-nya, alfanya cuma 8 sampai 23 dari 255, dan
       di atas latar biru tua yang ramai itu sama saja dengan tidak ada. */
    /* ISIANNYA DIBUANG kalau layer peta sedang menampilkan anomali MJO.
       Ujung negatif palet OLR itu ungu, sama hue dengan pita ini, jadi
       keduanya menyala bersama membuat pitanya lenyap ke dalam datanya
       sekaligus mengotori warna datanya. Diuji, memang tidak terbaca.
       Yang tersisa garis tepi dan garis pusat, dan justru itu yang berguna
       di atas peta anomali, sebab petanya sendiri sudah menunjukkan
       selubungnya dan yang masih ditanya cuma batas bujurnya. */
    const diAtasAnomali = MJO_ANOM.some((a) => a.kunci === activeLayer);
    (diAtasAnomali ? [] : [[7, 0.09], [3.5, 0.13], [0, 0.17]]).forEach(([pad, op]) => {
      L.rectangle([[-MJO_LINTANG, a.lon_barat - pad], [MJO_LINTANG, a.lon_timur + pad]], {
        pane: "mjo", stroke: false, fillColor: MJO_COLOR,
        fillOpacity: op * redup, interactive: false,
      }).addTo(mjoGroup);
    });
    /* Garis tepi cuma digambar di tepi yang NYATA. Tepi yang berimpit dengan
       batas kotak data itu bukan tepi selubungnya, itu cuma tempat data kita
       habis, dan memberinya garis sama saja mengarang batas yang tidak ada. */
    [[a.lon_barat, a.tepi_barat], [a.lon_timur, a.tepi_timur]].forEach(([lon, potong]) => {
      if (potong || !isFinite(lon)) return;
      L.polyline([[-MJO_LINTANG, lon], [MJO_LINTANG, lon]], {
        pane: "mjo", color: MJO_COLOR,
        weight: diAtasAnomali ? 2.2 : 1.5,
        opacity: (diAtasAnomali ? 0.85 : 0.55) * redup,
        interactive: false,
      }).addTo(mjoGroup);
    });
    // Garis pusat HANYA untuk amplop yang utuh. Lihat alasan di mjoAmplopDari.
    if (!a.tepi && isFinite(a.lon_pusat)) {
      L.polyline([[-MJO_LINTANG, a.lon_pusat], [MJO_LINTANG, a.lon_pusat]], {
        pane: "mjo", color: MJO_COLOR, weight: 2.5, opacity: 0.85 * redup,
        dashArray: "8 6", interactive: false, lineCap: "round",
      }).addTo(mjoGroup);
    }
  });
}

/* OKTAGON RMM. Sumbu datar RMM1, sumbu tegak RMM2, lingkaran satuan di
   tengah. Titiknya berputar BERLAWANAN arah jarum jam, dan putaran itulah
   yang mewakili perjalanan MJO ke timur.
   Sektor fase p membentang dari sudut ((p+3)*45) derajat selebar 45 derajat,
   jadi fase 5 mulai di 0 derajat. Itu tata letak baku, bukan pilihan kami,
   supaya diagram ini bisa diadu langsung dengan punya BMKG maupun BoM. */
const MJO_WILAYAH = {
  1: "Belahan barat dan Afrika", 2: "Samudra Hindia barat", 3: "Samudra Hindia timur",
  4: "Benua Maritim barat", 5: "Benua Maritim timur", 6: "Pasifik barat",
  7: "Pasifik tengah", 8: "Belahan barat",
};
/* Fase 8 dan 1 ada di belahan barat bumi, DI LUAR domain bujur yang dikirim
   backend. Keduanya bersebelahan dan bersama sama membentuk satu juring 90
   derajat di sisi kiri oktagon, jadi pudarannya satu blok utuh, bukan dua
   tambalan terpisah. Dipudarkan, BUKAN dihapus. Fasenya tetap ada di alam,
   yang tidak ada cuma pantauan kita, dan dua hal itu berbeda. */
const MJO_LUAR_DOMAIN = [8, 1];

/* Tiga layer anomali yang jadi kontur peta. Mereka DISENGAJA tidak masuk
   daftar parameter di sidebar, sebab mereka milik fitur MJO, bukan cuaca
   sehari hari. Daftar parameter ditulis tangan di index.html jadi mereka
   memang tidak akan muncul di sana dengan sendirinya.
   Tombolnya memakai kelas .layer-btn dan atribut data-layer yang sama dengan
   tombol parameter, jadi seluruh mesin yang sudah ada ikut terpakai, mulai
   dari pemasangan pendengar klik, penyelarasan kelas active, sampai legenda.
   Tidak ada jalur kedua yang harus dirawat. */
const MJO_ANOM = [
  { kunci: "olr_anom", nama: "OLR", tip: "Anomali radiasi gelombang panjang ke angkasa. Negatif berarti awan konveksi dalam, itu inti MJO" },
  { kunci: "u850_anom", nama: "U850", tip: "Anomali angin zonal 850 hPa. Positif berarti baratan" },
  { kunci: "u200_anom", nama: "U200", tip: "Anomali angin zonal 200 hPa. Positif berarti baratan" },
];

/* Baris tombol anomali disembunyikan seluruhnya kalau backend belum mengirim
   satu pun layernya. Tombol mati yang tetap terlihat mengundang orang
   mengkliknya lalu kecewa, aturan yang sama dipakai untuk Skew-T. */
function mjoAnomUI() {
  const baris = $("mjo-anom");
  if (!baris) return;
  let ada = 0;
  MJO_ANOM.forEach((a) => {
    const b = baris.querySelector('[data-layer="' + a.kunci + '"]');
    if (!b) return;
    const punya = !!(catalog && catalog.layers && catalog.layers[a.kunci]);
    b.hidden = !punya;
    if (punya) ada++;
  });
  baris.hidden = !ada;
}

// Kalimat sederhana untuk pembaca yang tidak memakai nomor fase.
const MJO_TAHAP = [
  { nama: "Mendekat", fase: [2, 3] },
  { nama: "Di atas kita", fase: [4, 5] },
  { nama: "Menjauh", fase: [6, 7] },
  { nama: "Jauh", fase: [8, 1] },
];

/* Tata letaknya MENIRU diagram resmi BoM, diminta pemilik, supaya orang yang
   sudah biasa membaca punya BoM atau BMKG tidak perlu belajar lagi. Kotak
   bersumbu -4 sampai 4, empat garis putus menyilang di tengah, lingkaran
   satuan, nomor fase besar di pojok tiap juring, dan nama wilayah di empat
   sisi. Yang diganti cuma paletnya, jadi palet kita. */
/* faseTitik DITAMBAHKAN 13 Oktober 2026, dipakai panel titik di bawah.
   Panel keterangan MJO memanggil tanpa argumen ketiga dan gambarnya tidak
   berubah sedikit pun. */
function mjoOktagon(ix, jejak, faseTitik, faseMjo) {
  const X0 = 56, Y0 = 24, SISI = 264;            // kotak gambar
  const CX = X0 + SISI / 2, CY = Y0 + SISI / 2;  // 188, 156
  const S = SISI / 8;                            // 33 piksel per satuan, skala -4..4
  const rad = (d) => (d * Math.PI) / 180;
  const px = (r1, r2) => [CX + r1 * S, CY - r2 * S];
  const n2 = (a) => a.map((v) => v.toFixed(1)).join(",");
  const kunci = (v) => Math.max(-4, Math.min(4, v));
  let o = '<svg class="mjo-okt" viewBox="0 0 340 352" role="img" '
        + 'aria-label="Ruang fase RMM1 lawan RMM2">';

  /* Juring fase 8 dan 1 bersama sama membentuk segitiga dari pusat ke dua
     pojok kiri, sebab batasnya tepat diagonal 135 dan 225 derajat. Jadi
     cukup satu segitiga, bukan dua tambalan yang harus dijahit. */
  o += '<path class="okt-luar" d="M' + n2([CX, CY]) + "L" + n2([X0, Y0])
     + "L" + n2([X0, Y0 + SISI]) + 'Z"/>';

  // Empat garis putus, mendatar, tegak, dan dua diagonal, dari tepi ke tepi.
  o += '<path class="okt-bagi" d="M' + n2([X0, CY]) + "H" + (X0 + SISI).toFixed(1)
     + "M" + n2([CX, Y0]) + "V" + (Y0 + SISI).toFixed(1)
     + "M" + n2([X0, Y0]) + "L" + n2([X0 + SISI, Y0 + SISI])
     + "M" + n2([X0, Y0 + SISI]) + "L" + n2([X0 + SISI, Y0]) + '"/>';
  /* JURING FASE TITIK TERPILIH. Satu lokasi TIDAK punya RMM sendiri, RMM
     itu indeks global, jadi menaruh noktah di koordinat RMM untuk sebuah
     kota akan mengarang angka. Yang benar menandai JURINGNYA, yaitu fase
     yang rentang bujurnya memuat titik itu.

     Batas juring selalu kelipatan 45 derajat, dan sinar dari pusat pada
     sudut kelipatan 45 selalu mendarat tepat di sudut kotak atau di tengah
     sisi. Dua duanya ada di sisi yang sama, jadi juringnya segitiga biasa,
     tidak perlu busur. */
  if (faseTitik || faseMjo) {
    const tepi = (deg) => {
      const t = rad(deg), c = Math.cos(t), sn = Math.sin(t), h = SISI / 2;
      const k = Math.min(Math.abs(c) < 1e-9 ? Infinity : h / Math.abs(c),
                         Math.abs(sn) < 1e-9 ? Infinity : h / Math.abs(sn));
      return [CX + k * c, CY - k * sn];
    };
    const juring = (f, kelas) => {
      const a0 = (f - 5) * 45;
      return '<path class="' + kelas + '" d="M' + n2([CX, CY]) + "L" + n2(tepi(a0))
           + "L" + n2(tepi(a0 + 45)) + 'Z"/>';
    };
    /* HIJAU dulu baru MERAH, supaya kalau dua duanya jatuh di juring yang
       sama yang terlihat merahnya, yaitu wilayah titik ini. Noktah penanda
       dibuang atas permintaan pemilik, juring berwarna sudah cukup. */
    if (faseMjo) o += juring(faseMjo, "okt-juring-mjo");
    if (faseTitik) o += juring(faseTitik, "okt-juring");
  }
  o += '<circle class="okt-satuan" cx="' + CX + '" cy="' + CY + '" r="' + S + '"/>';
  o += '<rect class="okt-bingkai" x="' + X0 + '" y="' + Y0 + '" width="' + SISI
     + '" height="' + SISI + '"/>';

  // Skala. Angka ganjil dilewati supaya tidak berdesakan di lebar panel.
  for (let v = -4; v <= 4; v++) {
    const [tx] = px(v, 0), [, ty] = px(0, v);
    o += '<path class="okt-tik" d="M' + tx.toFixed(1) + "," + (Y0 + SISI) + "v4"
       + "M" + X0 + "," + ty.toFixed(1) + 'h-4"/>';
    if (v % 2 === 0) {
      o += '<text class="okt-skala" x="' + tx.toFixed(1) + '" y="' + (Y0 + SISI + 14)
         + '" text-anchor="middle">' + v + "</text>"
         + '<text class="okt-skala" x="' + (X0 - 7) + '" y="' + (ty + 3.5).toFixed(1)
         + '" text-anchor="end">' + v + "</text>";
    }
  }

  // Nomor fase, di tengah tiap juring dekat tepi luar.
  for (let f = 1; f <= 8; f++) {
    const a = ((f + 3) * 45) % 360 + 22.5, r = 3.4;
    const [nx, ny] = px(r * Math.cos(rad(a)), r * Math.sin(rad(a)));
    o += '<text class="okt-no' + (MJO_LUAR_DOMAIN.includes(f) ? " okt-no-luar" : "")
       + '" x="' + nx.toFixed(1) + '" y="' + (ny + 6).toFixed(1) + '">' + f + "</text>";
  }

  // Nama wilayah, DI DALAM kotak seperti aslinya.
  o += '<text class="okt-sisi" x="' + CX + '" y="' + (Y0 + 15) + '" text-anchor="middle">PASIFIK BARAT</text>'
     + '<text class="okt-sisi" x="' + CX + '" y="' + (Y0 + SISI - 8) + '" text-anchor="middle">SAMUDRA HINDIA</text>'
     + '<text class="okt-sisi" x="' + (X0 + 12) + '" y="' + CY + '" text-anchor="middle" transform="rotate(-90 ' + (X0 + 12) + ' ' + CY + ')">BELAHAN BARAT</text>'
     + '<text class="okt-sisi" x="' + (X0 + SISI - 12) + '" y="' + CY + '" text-anchor="middle" transform="rotate(90 ' + (X0 + SISI - 12) + ' ' + CY + ')">BENUA MARITIM</text>';

  /* Ekor. Nilai DIKUNCI ke kotak -4..4, bukan dibiarkan keluar. Amplitudo di
     atas 4 memang jarang tapi bukan mustahil, dan garis yang menjulur keluar
     bingkai terbaca sebagai gambar rusak. */
  const jj = (jejak || []).filter((d) => isFinite(d.rmm1) && isFinite(d.rmm2));
  if (jj.length > 1) {
    o += '<polyline class="okt-ekor" points="'
       + jj.map((d) => n2(px(kunci(+d.rmm1), kunci(+d.rmm2)))).join(" ") + '"/>';
    const [ax, ay] = px(kunci(+jj[0].rmm1), kunci(+jj[0].rmm2));
    o += '<circle class="okt-awal" cx="' + ax.toFixed(1) + '" cy="' + ay.toFixed(1) + '" r="2.6"/>'
       + '<text class="okt-tanda" x="' + (ax + 6).toFixed(1) + '" y="' + (ay + 3).toFixed(1) + '">AWAL</text>';
  }
  if (isFinite(ix.rmm1) && isFinite(ix.rmm2)) {
    const [kx, ky] = px(kunci(+ix.rmm1), kunci(+ix.rmm2));
    o += '<circle class="okt-kini" cx="' + kx.toFixed(1) + '" cy="' + ky.toFixed(1) + '" r="4.5"/>';
  }

  // Judul sumbu.
  o += '<text class="okt-sumbu" x="' + CX + '" y="346" text-anchor="middle">RMM1</text>'
     + '<text class="okt-sumbu" x="16" y="' + CY + '" text-anchor="middle" transform="rotate(-90 16 ' + CY + ')">RMM2</text>';
  return o + "</svg>";
}

function mjoIsiNote() {
  mjoAnomUI();
  const tbHov = $("hov-buka");
  if (tbHov) tbHov.hidden = !hovPunya();
  const atas = document.querySelector("#mjo-note .cyc-note-txt");
  const kotak = $("mjo-fase");
  const sisip = $("mjo-sumber");
  const daftar = mjoAmplopAktif();
  const a = daftar && daftar.length ? daftar[0] : null;
  if (atas) {
    atas.textContent = mjoPunyaIndeks()
      ? "MJO, indeks RMM " + (mjo.indeks.tanggal || "")
      : (a ? "MJO, perkiraan zona lembap dari model" : "MJO, data belum tersedia");
  }
  if (sisip) {
    /* Kalimat sumber ditulis APA ADANYA, termasuk waktu dia tidak punya apa
       apa. Fitur yang diam tanpa keterangan membuat orang mengira aplikasinya
       rusak, padahal yang terjadi cuma berkasnya belum dikirim. */
    if (mjoPunyaIndeks()) {
      sisip.textContent = "Indeks RMM dari " + (mjo.sumber || "server") + ".";
    } else if (a && a.lokal) {
      const n = daftar.length;
      const tepi = daftar.filter((x) => x.tepi).length;
      sisip.textContent = "Dihitung di peramban dari kelembapan model, 500 sampai 800 hPa. "
        + "Ini PERKIRAAN letak zona lembap, BUKAN indeks RMM. Cara ini tidak bisa "
        + "memisahkan MJO dari El Nino, monsun, atau gelombang Kelvin, sebab ketiganya "
        + "hidup di kotak bujur yang sama. "
        + (n > 1 ? "Ada " + n + " zona, yang paling pekat yang paling kuat. " : "")
        + (tepi ? "Zona yang menyentuh tepi kotak data dibiarkan tanpa garis pusat, "
                + "sebab dia terpotong dan pusat sebenarnya bisa jauh di luar domain." : "");
    } else {
      sisip.textContent = "Berkas mjo.json belum ada di folder model ini, dan profil "
        + "kelembapannya tidak cukup lebar untuk dihitung sendiri.";
    }
  }
  if (kotak) {
    kotak.innerHTML = "";
    if (!mjoPunyaIndeks()) { kotak.hidden = true; return; }
    kotak.hidden = false;
    const ix = mjo.indeks;
    const f = Number(ix.fase), amp = Number(ix.amplitudo);
    const lemah = !(amp >= 1);
    kotak.insertAdjacentHTML("beforeend", mjoOktagon(ix, mjo.jejak));
    const angka = amp.toFixed(2).replace(".", ",");   // UI app ini berbahasa Indonesia
    const tahap = MJO_TAHAP.find((t) => t.fase.includes(f));
    const baris = [];
    /* Amplitudo di bawah 1 itu titik di DALAM lingkaran satuan, dan di situ
       nomor fasenya memang tidak berarti. Disebutkan, bukan disembunyikan,
       sebab "MJO lemah" itu kabar yang berguna. */
    baris.push(lemah
      ? "<b>MJO lemah.</b> Fase " + f + ", amplitudo " + angka
        + ", di bawah 1 jadi fasenya belum berarti."
      : "<b>" + (tahap ? tahap.nama : "Fase " + f) + ".</b> Fase " + f + ", "
        + (MJO_WILAYAH[f] || "") + ", amplitudo " + angka + ".");
    if (!lemah && MJO_LUAR_DOMAIN.includes(f)) {
      baris.push("Fase ini di luar bujur yang dipantau, jadi angkanya paling lemah dasarnya.");
    }
    /* Angka kecocokan dari backend ditampilkan APA ADANYA. EOF-nya dilatih
       cuma di bujur yang kita sajikan, bukan seluruh bumi, jadi angka ini
       yang memberi tahu pembaca seberapa jauh dia boleh percaya. Kalau
       backend tidak mengirimnya, tidak ada yang dikarang di sini. */
    const v = mjo.validasi;
    if (v && isFinite(v.fase_sama_persen)) {
      baris.push("Fasenya sama dengan RMM resmi pada "
        + String(v.fase_sama_persen).replace(".", ",") + " persen hari uji.");
    }
    const kaki = document.createElement("div");
    kaki.className = "mjo-kaki";
    kaki.innerHTML = baris.join(" ");
    kotak.appendChild(kaki);
  }
}

/* Diagramnya 329 px tinggi dan panelnya dipatok 560, jadi berapa pun dia
   ditaruh dia tidak akan muat utuh bersama baris fitur di atasnya. Daripada
   mengecilkan diagramnya sampai labelnya berdesakan, panelnya yang digulir
   sendiri begitu MJO dinyalakan. Digulir langsung tanpa animasi, dan dihitung
   dari selisih rect supaya tidak bergantung offsetParent. */
function mjoGulirKeDiagram() {
  const kotak = $("mjo-fase");
  if (!kotak || kotak.hidden) return;
  const panel = kotak.closest(".sisi-body");
  if (!panel || panel.scrollHeight <= panel.clientHeight) return;
  const r = kotak.getBoundingClientRect(), pr = panel.getBoundingClientRect();
  panel.scrollTop += r.top - pr.top - 8;
}

function toggleMjo() {
  mjoOn = !mjoOn;
  $("mjo-toggle") && $("mjo-toggle").classList.toggle("active", mjoOn);
  const note = $("mjo-note");
  if (mjoOn) {
    if (!mjoGroup) mjoGroup = L.layerGroup([], { pane: "mjo" });
    mjoGroup.addTo(map);
    if (note) note.classList.add("show");
    /* Mode lokal menarik profile.bin.gz yang 20 MB. Kalau dia belum ada di
       memori, bilang dulu sedang dihitung. Panel yang diam beberapa detik
       tanpa kabar terbaca sebagai rusak. */
    if (!mjoSibuk) {
      mjoSibuk = true;
      const sisip = $("mjo-sumber");
      if (sisip && !mjoPunyaAmplop() && !profilBlob) sisip.textContent = "Sedang menghitung dari profil model.";
      loadMjo()
        .then(() => mjoSiapkanLokal())
        .then(() => { mjoSibuk = false; if (mjoOn) { mjoIsiNote(); refreshMjo(); mjoGulirKeDiagram(); } })
        .catch(() => { mjoSibuk = false; if (mjoOn) mjoIsiNote(); });
    }
  } else {
    if (mjoGroup) { mjoGroup.clearLayers(); map.removeLayer(mjoGroup); }
    if (note) note.classList.remove("show", "open");
  }
  updateHash();
}

// ================= HOVMOLLER, SUBFITUR MJO =================
//
// Sumbu datar BUJUR, sumbu tegak WAKTU, waktu mengalir ke BAWAH. Dengan tata
// letak itu, gejala yang merambat ke timur muncul sebagai garis miring dari
// kiri atas ke kanan bawah, dan kemiringannya itulah kecepatan rambatnya.
// MJO mestinya sekitar 5 derajat bujur per hari.
//
// INI SATU SATUNYA TAMPILAN YANG BISA MEMBUKTIKAN PERAMBATAN. Peta cuma
// menunjukkan keadaan satu waktu, dan 72 jam prakiraan itu cuma 4 persen dari
// satu putaran MJO yang 30 sampai 60 hari. Hovmoller butuh PULUHAN HARI KE
// BELAKANG, dan itu cuma bisa datang dari backend. Frontend tidak menghitung
// apa apa di sini, dia cuma menggambar.
let hovParam = "olr_anom";

const hovPunya = () => !!(mjo && !mjo.kosong && mjo.hovmoller
  && Array.isArray(mjo.hovmoller.lon) && Array.isArray(mjo.hovmoller.waktu));

/* Palet dan batasnya diambil dari LEGENDS layer anomali yang sama, BUKAN
   palet sendiri. Kalau Hovmoller punya palet sendiri, satu nilai akan
   berwarna dua macam di dua tempat dan itu menyesatkan. */
/* HOVMOLLER MEMAKAI SKALANYA SENDIRI, dan sengaja TIDAK ikut legenda peta.
   Di peta, angin ditampilkan satu sisi saja, baratan untuk 850 dan timuran
   untuk 200, sebab di sana yang dicari letak pusat konveksinya.
   Di Hovmoller yang dicari RAMBATANNYA, dan rambatan itu terbaca dari pita
   positif dan negatif yang berselang seling miring ke kanan bawah. Satu sisi
   saja akan menghapus separuh polanya, justru di tampilan yang seluruh
   gunanya memperlihatkan pola itu.
   Jadi ketiganya memakai palet dua sisi yang sama dengan OLR. Diminta
   pemilik, dan memang begitu yang benar. */
const HOV_SKALA_DEF = {
  olr_anom: legendaAnom("W/m2", 5),
  u850_anom: legendaAnom("m/detik", 2),
  u200_anom: legendaAnom("m/detik", 2),
};

function hovSkala(kunci) {
  const sel = (HOV_SKALA_DEF[kunci] || {}).cells || [];
  if (sel.length < 3) return null;
  const b0 = parseFloat(sel[0][0]);
  const langkah = parseFloat(sel[1][0]) - b0;
  const rgb = sel.map(([, hex]) => [parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]);
  /* Pitanya berjarak sama, jadi indeksnya dihitung, bukan dicari satu per
     satu. Bedanya nyata, pencarian berurutan dipanggil sejuta kali per
     gambar. Math.ceil memberi batas ATAS yang tertutup, jadi nilai tepat di
     batas masuk ke pita bawahnya, sama dengan aturan legenda. */
  const maks = rgb.length - 1;
  return { rgb: rgb, indeks: (v) =>
    Math.max(0, Math.min(maks, Math.ceil((v - b0) / langkah))) };
}

const HOV_KUNCI = { olr_anom: "olr", u850_anom: "u850", u200_anom: "u200" };

/* GARIS KONTUR, marching squares.
   Tanpa ini plotnya cuma bidang berwarna, dan yang membuat plot GrADS
   terlihat seperti GrADS justru garisnya. Garis juga mengerjakan hal yang
   tidak bisa dikerjakan warna, yaitu memberi tahu pembaca di mana persisnya
   satu nilai berada, bukan cuma pita mana yang dia tempati.

   Ruasnya DISAMBUNG jadi rantai, bukan digambar satu satu. Bukan kemewahan,
   garis negatif digambar putus putus dan pola putusnya mulai ulang di tiap
   subjalur. Ruas pendek yang berdiri sendiri akan jadi deret titik yang
   jaraknya tidak keruan, bukan garis putus putus. */
function konturRuas(data, nx, nt, L) {
  const ruas = [];
  const ix = (j, i) => data[j][i];
  for (let j = 0; j < nt - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = ix(j, i), b = ix(j, i + 1), c = ix(j + 1, i + 1), d = ix(j + 1, i);
      if (!(isFinite(a) && isFinite(b) && isFinite(c) && isFinite(d))) continue;
      let k = (a > L ? 8 : 0) | (b > L ? 4 : 0) | (c > L ? 2 : 0) | (d > L ? 1 : 0);
      if (k === 0 || k === 15) continue;
      const atas  = () => [i + (L - a) / (b - a), j];
      const kanan = () => [i + 1, j + (L - b) / (c - b)];
      const bawah = () => [i + (L - d) / (c - d), j + 1];
      const kiri  = () => [i, j + (L - a) / (d - a)];
      /* Dua kasus pelana, 5 dan 10, dua duanya bisa disambung dengan dua cara
         dan jawabannya tidak ditentukan oleh keempat sudut saja. Dipakai
         rata rata keempatnya sebagai nilai di tengah sel, cara baku. */
      if (k === 5 || k === 10) {
        const tengah = (a + b + c + d) / 4;
        const naik = tengah > L;
        if (k === 5) {
          if (naik) { ruas.push([atas(), kanan()], [kiri(), bawah()]); }
          else { ruas.push([atas(), kiri()], [kanan(), bawah()]); }
        } else {
          if (naik) { ruas.push([atas(), kiri()], [kanan(), bawah()]); }
          else { ruas.push([atas(), kanan()], [kiri(), bawah()]); }
        }
        continue;
      }
      if (k === 8 || k === 7) ruas.push([kiri(), atas()]);
      else if (k === 4 || k === 11) ruas.push([atas(), kanan()]);
      else if (k === 2 || k === 13) ruas.push([kanan(), bawah()]);
      else if (k === 1 || k === 14) ruas.push([bawah(), kiri()]);
      else if (k === 12 || k === 3) ruas.push([kiri(), kanan()]);
      else if (k === 6 || k === 9) ruas.push([atas(), bawah()]);
    }
  }
  return ruas;
}

/* Sambung ruas jadi rantai. Titik yang sama dikenali lewat kunci bulat,
   sebab dua ruas bertetangga menghitung titik temu yang sama dari sel yang
   berbeda dan hasilnya bisa beda di digit terakhir. */
function konturRantai(ruas) {
  const kunci = (p) => p[0].toFixed(4) + "|" + p[1].toFixed(4);
  const peta = new Map();
  ruas.forEach((r, n) => {
    [kunci(r[0]), kunci(r[1])].forEach((k) => {
      if (!peta.has(k)) peta.set(k, []);
      peta.get(k).push(n);
    });
  });
  const pakai = new Array(ruas.length).fill(false);
  const rantai = [];
  for (let n = 0; n < ruas.length; n++) {
    if (pakai[n]) continue;
    pakai[n] = true;
    const jalur = [ruas[n][0], ruas[n][1]];
    // Dipanjangkan ke dua arah sampai buntu.
    for (const arah of [1, 0]) {
      for (;;) {
        const ujung = arah ? jalur[jalur.length - 1] : jalur[0];
        const kand = peta.get(kunci(ujung)) || [];
        let maju = -1;
        for (const m of kand) if (!pakai[m]) { maju = m; break; }
        if (maju < 0) break;
        pakai[maju] = true;
        const r = ruas[maju];
        const lain = kunci(r[0]) === kunci(ujung) ? r[1] : r[0];
        if (arah) jalur.push(lain); else jalur.unshift(lain);
      }
    }
    if (jalur.length > 1) rantai.push(jalur);
  }
  return rantai;
}

function gambarHovmoller() {
  const kv = $("hov-kanvas");
  if (!kv || !hovPunya()) return;
  const H = mjo.hovmoller;
  const data = H[HOV_KUNCI[hovParam]];
  const pesan = $("hov-pesan");
  if (!Array.isArray(data) || !data.length) {
    kv.hidden = true;
    if (pesan) { pesan.hidden = false; pesan.textContent = "Backend belum mengirim deret untuk parameter ini."; }
    return;
  }
  kv.hidden = false; if (pesan) pesan.hidden = true;

  const KIRI = 52, ATAS = 14, KANAN = 14, BAWAH = 34;
  const nx = H.lon.length, nt = H.waktu.length;
  const lebarPlot = 620, tinggiPlot = Math.max(260, Math.min(520, nt * 5));
  const W = KIRI + lebarPlot + KANAN, Hh = ATAS + tinggiPlot + BAWAH;
  /* Digambar 2x lalu dikecilkan lewat CSS. Tanpa ini, teks sumbu dan garis
     rambut jadi kabur di layar ber-dpr 2, dan plot ini isinya memang garis
     tipis semua. */
  const dpr = 2;
  kv.width = W * dpr; kv.height = Hh * dpr;
  kv.style.width = W + "px"; kv.style.height = Hh + "px";
  const c = kv.getContext("2d");
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, W, Hh);

  const tinggiSel = tinggiPlot / nt;
  /* DIGAMBAR PER PIKSEL, BUKAN PER SEL DATA. Versi pertama mengecat satu
     kotak untuk tiap sel 1 derajat kali 1 hari, dan hasilnya kotak kotak
     kasar yang memang jelek. Sekarang tiap piksel mencicipi medan datanya
     secara bilinear dulu, baru diwarnai menurut pitanya, jadi batas antar
     pita menjadi lengkung halus yang mengikuti medannya. Itu yang membuat
     shaded GrADS terlihat halus, dan caranya memang ini, bukan memburamkan
     gambar kotak kotak.
     Nilai antar pita TIDAK digradasikan. Pita diskret itu memang maunya,
     sebab pembaca harus bisa menghitung berapa pita yang dilewati. */
  const sk = hovSkala(hovParam);
  if (sk) {
    const pw = Math.max(1, Math.round(lebarPlot * dpr));
    const ph = Math.max(1, Math.round(tinggiPlot * dpr));
    const img = c.createImageData(pw, ph), buf = img.data;
    for (let py = 0; py < ph; py++) {
      const fy = ph < 2 ? 0 : (py / (ph - 1)) * (nt - 1);
      const y0 = Math.min(nt - 1, Math.floor(fy)), y1 = Math.min(nt - 1, y0 + 1);
      const ty = fy - y0, r0 = data[y0] || [], r1 = data[y1] || [];
      for (let pxi = 0; pxi < pw; pxi++) {
        const fx = pw < 2 ? 0 : (pxi / (pw - 1)) * (nx - 1);
        const x0 = Math.min(nx - 1, Math.floor(fx)), x1 = Math.min(nx - 1, x0 + 1);
        const tx = fx - x0;
        const v = (1 - tx) * (1 - ty) * r0[x0] + tx * (1 - ty) * r0[x1]
                + (1 - tx) * ty * r1[x0] + tx * ty * r1[x1];
        const w = sk.rgb[isFinite(v) ? sk.indeks(v) : 8];
        const o = (py * pw + pxi) * 4;
        buf[o] = w[0]; buf[o + 1] = w[1]; buf[o + 2] = w[2]; buf[o + 3] = 255;
      }
    }
    /* putImageData MENGABAIKAN transform, jadi letaknya dihitung dalam piksel
       peranti, bukan piksel CSS. Kalau dipakai KIRI dan ATAS apa adanya,
       gambarnya melenceng ke kiri atas di layar ber-dpr 2. */
    c.putImageData(img, Math.round(KIRI * dpr), Math.round(ATAS * dpr));
  }

  const gaya = getComputedStyle(document.documentElement);
  const tinta = gaya.getPropertyValue("--ink").trim() || "#074173";

  /* GARIS KONTUR DI ATAS BIDANG WARNA. Batasnya sama persis dengan batas pita
     warnanya, jadi garis selalu jatuh di pergantian warna dan keduanya tidak
     pernah bercerita hal yang berbeda.
     NEGATIF PUTUS PUTUS, positif utuh. Itu bukan hiasan, itu kesepakatan lama
     di peta meteorologi dan orang seperti Alvin membacanya tanpa melihat
     legenda. */
  if (sk) {
    const selL = (LEGENDS[hovParam] || {}).cells || [];
    const aras = selL.slice(0, 17).map((x) => parseFloat(x[0]));
    const gx = (i) => KIRI + (i / (nx - 1)) * lebarPlot;
    const gy = (j) => ATAS + (j / (nt - 1)) * tinggiPlot;
    const label = [];
    c.save();
    c.lineJoin = "round"; c.lineCap = "round";
    c.strokeStyle = "rgba(20,28,38,.62)";
    aras.forEach((L) => {
      const rantai = konturRantai(konturRuas(data, nx, nt, L));
      if (!rantai.length) return;
      c.lineWidth = L === 0 ? 1.1 : 0.7;
      c.setLineDash(L < 0 ? [4, 3] : []);
      c.beginPath();
      rantai.forEach((jalur) => {
        jalur.forEach(([i, j], n) => {
          const x = gx(i), y = gy(j);
          if (n === 0) c.moveTo(x, y); else c.lineTo(x, y);
        });
      });
      c.stroke();
      /* Angka ditaruh di rantai yang CUKUP PANJANG saja. Rantai pendek itu
         serpihan di pojok gundukan, dan angka di situ cuma menutupi gambar
         tanpa memberi tahu apa apa. */
      rantai.forEach((jalur) => {
        if (jalur.length < 14) return;
        const t = Math.floor(jalur.length / 2);
        const [i, j] = jalur[t];
        const x = gx(i), y = gy(j);
        if (x < KIRI + 14 || x > KIRI + lebarPlot - 14) return;
        if (y < ATAS + 10 || y > ATAS + tinggiPlot - 10) return;
        if (label.some((p) => Math.abs(p[0] - x) < 42 && Math.abs(p[1] - y) < 16)) return;
        label.push([x, y, L]);
      });
    });
    c.setLineDash([]);
    /* Angkanya diberi halo warna kertas, bukan kotak isian. Kotak akan
       melubangi bidang warnanya, sedangkan halo cuma menipiskan garis yang
       lewat persis di belakang angkanya. */
    c.font = "600 9px system-ui, sans-serif";
    c.textAlign = "center"; c.textBaseline = "middle";
    c.lineWidth = 2.6; c.strokeStyle = "rgba(255,255,255,.92)";
    label.forEach(([x, y, L]) => c.strokeText(String(L), x, y));
    c.fillStyle = "rgba(20,28,38,.88)";
    label.forEach(([x, y, L]) => c.fillText(String(L), x, y));
    c.restore();
  }
  const pudar = gaya.getPropertyValue("--ink-50").trim() || "rgba(7,65,115,.5)";
  const xBujur = (lo) => KIRI + ((lo - H.lon[0]) / (H.lon[nx - 1] - H.lon[0])) * lebarPlot;

  /* Pita Indonesia, 95 sampai 141 BT. Inti seluruh tampilan ini sebenarnya
     satu pertanyaan, kapan garis miring itu melintasi pita ini. */
  c.save();
  c.strokeStyle = tinta; c.lineWidth = 1; c.setLineDash([5, 4]); c.globalAlpha = 0.55;
  [95, 141].forEach((lo) => {
    const px = xBujur(lo);
    if (px < KIRI || px > KIRI + lebarPlot) return;
    c.beginPath(); c.moveTo(px, ATAS); c.lineTo(px, ATAS + tinggiPlot); c.stroke();
  });
  c.restore();

  /* Garis batas analisis lawan prakiraan. Di bawahnya bukan lagi pengamatan,
     dan pembaca berhak tahu persis di mana batas itu. */
  const iBatas = H.waktu.indexOf(H.batas_analisis);
  if (iBatas > 0) {
    const y = ATAS + (iBatas + 1) * tinggiSel;
    c.save();
    c.strokeStyle = tinta; c.lineWidth = 1.4;
    c.beginPath(); c.moveTo(KIRI, y); c.lineTo(KIRI + lebarPlot, y); c.stroke();
    c.fillStyle = tinta; c.font = "9px system-ui, sans-serif"; c.textAlign = "right";
    c.fillText("prakiraan", KIRI + lebarPlot - 3, y + 10);
    c.restore();
  }

  c.strokeStyle = pudar; c.lineWidth = 1;
  c.strokeRect(KIRI, ATAS, lebarPlot, tinggiPlot);
  c.fillStyle = pudar; c.font = "9px system-ui, sans-serif";

  c.textAlign = "center";
  for (let lo = 60; lo <= 180; lo += 20) {
    const px = xBujur(lo);
    if (px < KIRI - 1 || px > KIRI + lebarPlot + 1) continue;
    c.beginPath(); c.moveTo(px, ATAS + tinggiPlot); c.lineTo(px, ATAS + tinggiPlot + 4); c.stroke();
    c.fillText(lo + "E", px, ATAS + tinggiPlot + 15);
  }
  c.fillText("BUJUR TIMUR", KIRI + lebarPlot / 2, Hh - 4);

  c.textAlign = "right";
  /* Label tanggal dijarangkan supaya tidak saling menimpa. Dihitung dari
     tinggi sel, bukan dipatok, sebab panjang deretnya ditentukan backend. */
  const lompat = Math.max(1, Math.ceil(13 / tinggiSel));
  for (let t = 0; t < nt; t += lompat) {
    const y = ATAS + (t + 0.5) * tinggiSel;
    c.fillText(String(H.waktu[t]).slice(5), KIRI - 6, y + 3);
  }
}

function isiHovLegenda() {
  const el = $("hov-legenda");
  if (!el) return;
  const def = HOV_SKALA_DEF[hovParam] || { cells: [], head: "" };
  el.innerHTML = '<span class="hov-lg-kep">' + escHtml(def.head) + "</span>"
    + def.cells.map(([lab, hex, gelap]) =>
        '<span class="hov-lg-sel' + (gelap ? " gelap" : "") + '" style="background:'
        + hex + '">' + escHtml(lab) + "</span>").join("");
}

function setHovParam(kunci) {
  hovParam = kunci;
  document.querySelectorAll("#hov-tab .hov-tab-btn").forEach((b) =>
    b.classList.toggle("active", b.dataset.hov === kunci));
  isiHovLegenda();
  gambarHovmoller();
}

function bukaHovmoller() {
  const ov = $("hov-overlay");
  if (!ov) return;
  ov.classList.add("show");
  const kos = $("hov-kosong");
  if (!hovPunya()) {
    /* Tidak ada data bukan alasan membuka kartu kosong tanpa kabar. Orang
       akan mengira aplikasinya rusak, padahal berkasnya memang belum ada. */
    if (kos) kos.hidden = false;
    $("hov-badan") && ($("hov-badan").hidden = true);
    return;
  }
  if (kos) kos.hidden = true;
  $("hov-badan") && ($("hov-badan").hidden = false);
  // Pilih parameter pertama yang datanya benar benar ada.
  if (!Array.isArray(mjo.hovmoller[HOV_KUNCI[hovParam]])) {
    const ada = MJO_ANOM.find((a) => Array.isArray(mjo.hovmoller[HOV_KUNCI[a.kunci]]));
    if (ada) hovParam = ada.kunci;
  }
  setHovParam(hovParam);
}

function tutupHovmoller() { $("hov-overlay")?.classList.remove("show"); }

// ================= ISOBAR (garis tekanan) =================
// Otomatis muncul HANYA di layer Tekanan (tanpa tombol): garis kontur PRMSL
// tiap 4 hPa + penanda pusat tekanan Tinggi (H) / Rendah (L). Melengkapi heatmap
// jadi peta tekanan gaya klasik. Hanya jam prakiraan run aktif (0..72 jam).
// Warna isobar MENGIKUTI palet tekanan (dari legenda) pada nilai hPa garis itu,
// lalu digelapkan ("lebih tua") agar kontras; dipadu halo putih supaya terbaca
// di zona terang (~1013) maupun gelap (biru/oranye).
const _PRESS_STOPS = LEGENDS.pressure_surface.cells.map(([lab, hex]) => [parseFloat(lab), hex]);
const _hex2rgb = (h) => { h = h.replace("#", ""); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; };
const _rgb2hex = (r, g, b) => "#" + [r, g, b].map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, "0")).join("");
function _rgb2hsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0; const l = (mx + mn) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d !== 0) {
    if (mx === r) h = ((g - b) / d) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  return [h, s, l];
}
function _hsl2rgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g] = [c, x]; else if (h < 120) [r, g] = [x, c];
  else if (h < 180) [g, b] = [c, x]; else if (h < 240) [g, b] = [x, c];
  else if (h < 300) [r, b] = [x, c]; else [r, b] = [c, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}
// Warna isobar: ambil HUE dari palet tekanan pd nilai hPa garis, tapi paksa
// saturasi cukup & kecerahan medium (0.40) → jelas berwarna spt palet, "lebih
// tua" tanpa jadi hitam; zona pucat (~1013) pun tampil sbg warna, bukan abu.
function isobarColor(hPa) {
  const s = _PRESS_STOPS;
  let a = s[0], b = s[s.length - 1];
  if (hPa <= s[0][0]) b = a = s[0];
  else if (hPa >= s[s.length - 1][0]) a = b = s[s.length - 1];
  else for (let i = 0; i < s.length - 1; i++) if (hPa >= s[i][0] && hPa <= s[i + 1][0]) { a = s[i]; b = s[i + 1]; break; }
  const t = b[0] === a[0] ? 0 : (hPa - a[0]) / (b[0] - a[0]);
  const ca = _hex2rgb(a[1]), cb = _hex2rgb(b[1]);
  const rgb = [0, 1, 2].map((k) => ca[k] + (cb[k] - ca[k]) * t);
  const [h, sat] = _rgb2hsl(rgb[0], rgb[1], rgb[2]);
  const [r, g, bl] = _hsl2rgb(h, Math.min(0.9, Math.max(0.55, sat * 1.25)), 0.4);
  return _rgb2hex(r, g, bl);
}
async function loadIsobars() {
  if (isobars) return isobars;
  if (!isobarsLoading) isobarsLoading = fetch(DATA_BASE + "isobars.json")
    .then((r) => (r.ok ? r.json() : { times: [], frames: [] }))
    .then((j) => (isobars = j))
    .catch(() => (isobars = { times: [], frames: [] }));
  return isobarsLoading;
}
function refreshIsobars() {
  if (!isobarGroup) return;
  isobarGroup.clearLayers();
  if (activeLayer !== "pressure_surface" || !isobars || !isobars.times || !frames[current]) return;
  const ti = isobars.times.indexOf(frames[current].valid_time);
  if (ti < 0) return;                         // waktu lampau → tak ada isobar
  const fr = isobars.frames[ti];
  if (!fr) return;
  for (const [lv, pts] of fr.iso) {
    const latlng = pts.map((p) => [p[1], p[0]]);
    const bold = lv % 20 === 0;               // pertegas tiap 20 hPa (gaya peta cuaca)
    // Inti = warna palet tekanan (digelapkan) pada nilai hPa garis + HALO PUTIH.
    // Border admin diredupkan (abu) supaya isobar jadi garis dominan.
    L.polyline(latlng, { pane: "isobar", color: "#ffffff", weight: bold ? 4 : 3,
      opacity: 0.6, interactive: false, lineJoin: "round" }).addTo(isobarGroup);
    L.polyline(latlng, { pane: "isobar", color: isobarColor(lv), weight: bold ? 2.2 : 1.4,
      opacity: 0.97, interactive: false, lineJoin: "round" }).addTo(isobarGroup);
  }
  for (const [t, v, lat, lon] of fr.hl) {
    const high = t === 1;
    isobarGroup.addLayer(L.marker([lat, lon], {
      pane: "isobar", interactive: false, keyboard: false,
      icon: L.divIcon({ className: "hl-wrap", iconSize: [44, 44], iconAnchor: [22, 22],
        html: `<span class="hl-mark ${high ? "hl-h" : "hl-l"}">${high ? "H" : "L"}<b>${v}</b></span>` }),
    }));
  }
}
// Tampilkan/lepas isobar sesuai layer aktif (dipanggil saat ganti layer).
function syncIsobars() {
  if (activeLayer === "pressure_surface") {
    if (!isobarGroup) isobarGroup = L.layerGroup([], { pane: "isobar" });
    if (!map.hasLayer(isobarGroup)) isobarGroup.addTo(map);
    loadIsobars().then(() => { if (activeLayer === "pressure_surface") refreshIsobars(); });
  } else if (isobarGroup) {
    isobarGroup.clearLayers();
    if (map.hasLayer(isobarGroup)) map.removeLayer(isobarGroup);
  }
}

// ================= MONSUN (indikasi model GFS) =================
// Status monsun (badge) + ARUS AMBER beranimasi = angin rata-rata musiman lewat
// leaflet-velocity (warna amber, partikel lebih tebal & jarang → beda dari angin
// putih sesaat). Medan rata-rata bersifat statik (tak ikut slider).
async function loadMonsoon() {
  if (monsoon) return monsoon;
  if (!monsoonLoading) monsoonLoading = fetch(DATA_BASE + "monsoon.json")
    .then((r) => (r.ok ? r.json() : { phase: null }))
    .then((j) => (monsoon = j))
    .catch(() => (monsoon = { phase: null }));
  return monsoonLoading;
}
// Warna arus & banner mengikuti MONSUN DOMINAN (dari data): Australia=amber,
// Asia=biru, Peralihan=hijau. Gradasi satu rona → partikel jelas berwarna.
const MON_AMBER = ["#ffe0a3", "#ffc760", "#ffb020", "#f59e0b", "#e07b00"];
const MON_BLUE = ["#a9c6f5", "#6f9ae6", "#3f6fce", "#2650a8", "#173b7d"];
const MON_GREEN = ["#c3e8ae", "#8fd06b", "#5cb63f", "#3f9330", "#2c6f24"];
function monColors(code) {
  if (code === "ASIA") return { scale: MON_BLUE, banner: "#1e3f8f" };
  if (code === "TRANS") return { scale: MON_GREEN, banner: "#1a7a4f" };
  return { scale: MON_AMBER, banner: "#b26a00" };        // AUS (default)
}
async function loadMonsoonVel() {
  if (monsoonVelData) return monsoonVelData;
  if (!monsoonVelLoading) monsoonVelLoading = fetch(DATA_BASE + "monsoon_velocity.json")
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => (monsoonVelData = j))
    .catch(() => (monsoonVelData = null));
  return monsoonVelLoading;
}
async function loadBorneoVel() {
  if (borneoVelData) return borneoVelData;
  if (!borneoVelLoading) borneoVelLoading = fetch(DATA_BASE + "monsoon_velocity_bv.json")
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => (borneoVelData = j))
    .catch(() => (borneoVelData = null));
  return borneoVelLoading;
}
// Borneo Vortex: swirl partikel TEAL (medan angin kotak Kalimantan → berpilin sendiri)
// + ikon pusaran di pusat. HANYA saat vorteks terdeteksi (musim DJF).
function showBorneoVortex(vx) {
  if (!vx || !vx.active) return;
  loadBorneoVel().then((bv) => {
    if (!monsoonOn || !bv) return;
    if (!borneoVel) borneoVel = L.velocityLayer({
      displayValues: false, data: bv,
      minVelocity: 0, maxVelocity: 12, velocityScale: 0.025,
      particleAge: 110, particleMultiplier: 1 / 300, lineWidth: 2.2,
      colorScale: ["#7fe6df", "#2fd0c6", "#0fb5ae", "#0a8f89", "#076d68"], frameRate: 24,
    });
    if (!map.hasLayer(borneoVel)) borneoVel.addTo(map);
    if (!borneoMarker && vx.lat != null) borneoMarker = L.marker([vx.lat, vx.lon], {
      interactive: false, keyboard: false, title: "Borneo Vortex",
      icon: L.divIcon({ className: "bv-mark", iconSize: [40, 40], iconAnchor: [20, 20],
        html: `<span class="cyc-spin" style="color:#0fb5ae;font-size:34px"><span class="material-symbols-outlined" style="font-size:34px">cyclone</span></span>` }),
    });
    if (borneoMarker && !map.hasLayer(borneoMarker)) borneoMarker.addTo(map);
  });
}
function hideBorneoVortex() {
  if (borneoVel && map.hasLayer(borneoVel)) map.removeLayer(borneoVel);
  if (borneoMarker && map.hasLayer(borneoMarker)) map.removeLayer(borneoMarker);
}
// Panel FENOMENA: daftar semua fenomena + status. Dot HIJAU NEON = sedang terjadi,
// MERAH = belum; baris tak-aktif diredupkan (kelas ph-off).
function fillPhenomPanel() {
  const el = $("phenom-panel");
  if (!el || !monsoon) return;
  const p = monsoon.phase || {};
  const s = monsoon.surge || {};
  const vx = monsoon.vortex || {};
  const konst = p.steadiness != null ? Math.round(p.steadiness * 100) + "%" : "-";
  // Dot AKTIF ikut warna arus/velocity fenomena; BELUM terjadi = merah menyala.
  const MON_DOT = { AUS: "#ffb020", ASIA: "#3f6fce", TRANS: "#5cb63f" };
  const SURGE_DOT = "#3f6fce", BV_DOT = "#0fb5ae", OFF = "#ff2d2d";
  const row = (active, color, name, status) => {
    const c = active ? color : OFF;
    return `<div class="ph-row ${active ? "" : "ph-off"}">` +
      `<span class="ph-dot" style="background:${c};box-shadow:0 0 6px 1px ${c}"></span>` +
      `<div class="ph-txt"><b>${name}</b><span>${status}</span></div></div>`;
  };
  el.innerHTML = `<div class="ph-head">FENOMENA</div>` +
    row(true, MON_DOT[p.code] || "#ffb020", "Monsun", `${p.label || "-"}${p.season ? " · " + p.season : ""}. Angin dari ${p.wind_from || "-"}, konsistensi ${konst}.`) +
    row(!!s.active, SURGE_DOT, "<i>Cold Surge</i>", s.active ? `${s.level}, angin utara ${s.north_kt || 0} kt. ${s.note}` : "Belum terjadi (fenomena musim hujan / DJF).") +
    row(!!vx.active, BV_DOT, "<i>Borneo Vortex</i>", vx.active ? `Vortisitas ${vx.vort}. ${vx.note}` : "Belum terjadi (fenomena musim hujan / DJF).");
}
// Terapkan keadaan tiga fenomena. Dipanggil tombol HP (satu satu) maupun
// tombol desktop #mon-toggle (ketiganya sekaligus). Cold Surge sengaja tak
// punya lapisan peta, karena BMKG-pun tak menggambarnya; yang ada cuma status,
// jadi tombolnya hanya memunculkan barisnya di kotak keterangan.
function terapkanFenomena() {
  const adaYangNyala = fenOn.monsun || fenOn.bv || fenOn.surge;
  monsoonOn = adaYangNyala;
  $("mon-toggle")?.classList.toggle("active", adaYangNyala);
  document.querySelectorAll("#lowbar-body .lb-btn[data-fen]").forEach((b) =>
    b.classList.toggle("active", !!fenOn[b.dataset.fen]));

  const panel = $("phenom-panel");
  if (!adaYangNyala) {
    if (monsoonVel && map.hasLayer(monsoonVel)) map.removeLayer(monsoonVel);
    hideBorneoVortex();
    panel?.classList.remove("show");
    updateHash();
    return;
  }
  Promise.all([loadMonsoon(), fenOn.monsun ? loadMonsoonVel() : null]).then(([mon, data]) => {
    segarkanTombolFenomena();
    fillPhenomPanel();
    panel?.classList.add("show");

    if (fenOn.bv) showBorneoVortex(mon && mon.vortex); else hideBorneoVortex();

    if (fenOn.monsun && data) {
      const code = mon && mon.phase ? mon.phase.code : "AUS";
      if (!monsoonVel) {
        monsoonVel = L.velocityLayer({
          displayValues: false, data,
          minVelocity: 0, maxVelocity: 14, velocityScale: 0.02,
          particleAge: 120, particleMultiplier: 1 / 500, lineWidth: 2.4,
          colorScale: monColors(code).scale, frameRate: 22,
        });
        monsoonVel.addTo(map);
      } else if (!map.hasLayer(monsoonVel)) {
        monsoonVel.addTo(map);
      }
    } else if (monsoonVel && map.hasLayer(monsoonVel)) {
      map.removeLayer(monsoonVel);
    }
  });
  updateHash();
}

function toggleMonsoon() {
  // Tombol desktop: satu klik menyalakan/mematikan KETIGANYA, perilaku lama.
  const nyala = !(fenOn.monsun || fenOn.bv || fenOn.surge);
  fenOn = { monsun: nyala, bv: nyala, surge: nyala };
  terapkanFenomena();
}

function toggleMonsoonLama() {
  monsoonOn = !monsoonOn;
  $("mon-toggle") && $("mon-toggle").classList.toggle("active", monsoonOn);
  const panel = $("phenom-panel");
  if (monsoonOn) {
    Promise.all([loadMonsoon(), loadMonsoonVel()]).then(([mon, data]) => {
      if (!monsoonOn) return;
      fillPhenomPanel();
      if (panel) panel.classList.add("show");
      showBorneoVortex(mon && mon.vortex);
      if (data) {
        const code = mon && mon.phase ? mon.phase.code : "AUS";
        if (!monsoonVel) {
          monsoonVel = L.velocityLayer({
            displayValues: false, data,
            minVelocity: 0, maxVelocity: 14, velocityScale: 0.02,
            particleAge: 120, particleMultiplier: 1 / 500, lineWidth: 2.4,
            colorScale: monColors(code).scale, frameRate: 22,
          });
          monsoonVel.addTo(map);
        } else if (!map.hasLayer(monsoonVel)) {
          monsoonVel.addTo(map);
        }
      }
    });
  } else {
    if (monsoonVel && map.hasLayer(monsoonVel)) map.removeLayer(monsoonVel);
    hideBorneoVortex();
    if (panel) panel.classList.remove("show");
  }
  updateHash();
}

// ---- Skeleton loading ---------------------------------------------------
function hideSkeleton() {
  const s = $("skeleton");
  if (!s || s.classList.contains("hide")) return;
  s.classList.add("hide");                 // fade-out (transition CSS)
  setTimeout(() => s.remove(), 480);
}
// Tampilkan pesan (error/diagnosa) di kotak #loading & lepas skeleton.
function showLoadMsg(msg, asHtml) {
  const el = $("loading");
  if (el) { el[asHtml ? "innerHTML" : "textContent"] = msg; el.style.display = "block"; }
  hideSkeleton();
}
/* Belum ada data sama sekali. Peta, basemap, dan seluruh kerangka tetap jalan,
   sebab map dibuat di ruang lingkup modul jauh sebelum init(). Yang kosong cuma
   lapisannya. Tombol layer aman ditekan, setLayer() sudah menjaga dengan
   `if (!catalog ...) return`.
   Pesannya sengaja menyebut PERINTAHNYA, bukan cuma bilang data tidak ada.
   Orang yang membuka salinan ini biasanya baru pertama kali melihatnya. */
function modeKosong() {
  /* Bilah bawah dan penyembunyi fitur model dipanggil DI SINI juga.
     Keduanya tidak bisa dipanggil sebelum katalog ditarik, sebab setupHP
     memakai const yang dideklarasikan jauh di bawah. Jadi jalur mode kosong
     harus memanggilnya sendiri, kalau tidak antarmuka HP-nya mati dan orang
     yang masuk ke model tanpa data terjebak tanpa bilah bawah. */
  try { setupHP(); terapkanFiturModel(); } catch (e) { console.warn("setel antarmuka:", e); }

  showLoadMsg(
    "<b>Model ini belum punya data</b><br><br>" +
    "Pilihan model di panel kiri tetap bisa dipakai, jadi kamu bisa kembali " +
    "ke model lain kapan saja.<br><br>" +
    "Keluaran model ini belum ada. " +
    "Itu memang disengaja, keluaran pipeline tidak ikut dikirim.<br><br>" +
    "Untuk mengisinya, jalankan dari dalam folder pipeline-nya:<br>" +
    "<b>cd backend/atmosight/pipeline</b><br><b>python run.py</b><br><br>" +
    "Hasilnya mendarat di <b>backend/atmosight/data/output/</b>, lalu muat ulang halaman ini.",
    true);
}

// Tunggu frame heatmap PERTAMA benar-benar tergambar sebelum skeleton dilepas,
// biar reveal-nya mulus (bukan peta kosong sekejap). Ada fallback timeout.
function whenHeatmapReady() {
  return new Promise((resolve) => {
    const img = speedLayer && speedLayer.getElement();
    if (!img || img.complete) return resolve();
    let done = false;
    const fin = () => { if (!done) { done = true; resolve(); } };
    img.addEventListener("load", fin, { once: true });
    img.addEventListener("error", fin, { once: true });
    setTimeout(fin, 1600);
  });
}

// ---- Init --------------------------------------------------------------
async function init() {
  // Diagnosa dini penyebab umum gagal-muat
  if (location.protocol === "file:") {
    showLoadMsg(
      "⚠️ Halaman dibuka via <b>file://</b> — browser memblokir pemuatan data.<br><br>" +
      "Buka lewat alamat server:<br><b>http://127.0.0.1:8000/frontend/index.html</b>", true);
    return;
  }
  if (typeof L === "undefined" || typeof L.velocityLayer !== "function") {
    showLoadMsg("⚠️ Library peta gagal dimuat (cek koneksi internet ke unpkg.com / CDN diblokir).");
    return;
  }
  // Dibuka langsung lewat ?model=wrf juga harus lewat gerbang, kalau tidak
  // penguncian di dropdown gampang dilewati cuma dengan mengetik alamatnya.
  // Yang digerbangi CUMA model privat. Dulu syaratnya "bukan gfs", dan itu
  // ikut menggerbangi satelit yang datanya justru terbuka untuk umum.
  if (MODEL && MODEL.privat && !ambilTiket()) {
    const boleh = await mintaSandi(MODEL.label);
    if (!boleh) { location.replace(location.pathname); return; }
  }
  /* Keterangan uji coba menyusul SESUDAH gerbang sandi, bukan sebelumnya.
     Dua kartu bertumpuk membingungkan, dan orang yang batal di gerbang
     tidak perlu membacanya sama sekali. Dipasang di sini juga supaya jalur
     mode kosong tetap kebagian, sama alasannya dengan dropdown model. */
  pasangUji();
  ujiTiapMasuk();
  /* ---- ANTARMUKA YANG TIDAK BUTUH DATA, disetel DULUAN ----

     Ketiganya dulu dijalankan SESUDAH katalog terbaca, dan itu bug. Jalur
     mode kosong keluar dari init lebih awal lewat `return`, jadi begitu
     sebuah model belum punya data, ketiganya tidak pernah jalan.

     Akibat terparahnya, dropdown MODEL tidak pernah tersambung. Orang yang
     masuk ke model yang datanya belum ada JADI TERJEBAK, tidak bisa memilih
     model lain dan tidak bisa kembali ke GFS. Satu satunya jalan keluar
     mengetik ulang alamatnya, dan tidak ada yang memberi tahu itu.

     Ketiganya memang tidak menyentuh katalog sama sekali, sudah diperiksa.
     setupModelSelect cuma membaca daftar MODELS, setupHP membangun bilah
     bawah dari tombol yang sudah ada di HTML, dan terapkanFiturModel cuma
     melihat model mana yang sedang dibuka. Jadi tidak ada alasan menunggu
     data untuk menjalankannya.

     setupLevelSelect TIDAK ikut dipindah, dia memang perlu katalog untuk
     tahu ada tidaknya data stratosfer. */
  /* CUMA dropdown MODEL yang dipanggil sedini ini, dan itu disengaja.

     setupHP dan terapkanFiturModel SEMPAT ikut dipindah ke sini, dan itu
     MERUSAK Atmosight sama sekali. setupHP memakai LB_SEKSI, sebuah const
     yang dideklarasikan ratusan baris di bawah, jadi memanggilnya sedini ini
     melempar ReferenceError, cannot access before initialization. Init mati
     di situ sebelum sempat menarik katalog, dan yang tampil layar memuat
     selamanya tanpa pesan galat apa pun.

     Jadi dua itu dikembalikan ke tempat semula, dan supaya jalur mode kosong
     tidak lagi menjebak, keduanya dipanggil juga dari modeKosong sebelum dia
     kembali. Lebih bertele tapi benar.

     setupModelSelect aman di sini, dia cuma membaca daftar MODELS yang sudah
     dideklarasikan di kepala berkas. */
  setupModelSelect();      // dropdown MODEL, WAJIB duluan supaya tidak terjebak

  try {
    // MODE KOSONG. Salinan untuk ditinjau dan salinan yang baru dipasang di
    // server memang dikirim TANPA data model, sebab keluaran pipeline itu
    // ratusan MB dan tidak pantas masuk repo. Tanpa penjagaan ini yang muncul
    // pesan merah "Gagal memuat data", padahal tidak ada yang gagal, datanya
    // memang belum pernah dimasak. 404 dibedakan dari galat lain dengan
    // sengaja, sebab 500 atau JSON rusak itu memang kerusakan sungguhan.
    // ambilKatalog() memulangkan null cuma kalau SEMUA sumber menjawab 404.
    const catRes = await ambilKatalog();
    if (!catRes) { modeKosong(); return; }
    if (!catRes.ok) throw new Error(`catalog.json HTTP ${catRes.status} (${DATA_BASE}catalog.json)`);
    const cat = await catRes.json();
    catalog = cat;
    samakanResolusi(cat);            // "WRF - 9 km" -> ikut angka di model_label
    const avail = Object.keys(cat.layers || {});
    // Cadence sebenarnya, dari layer non-harian pertama yang punya >= 2 frame.
    for (const k of avail) {
      if (layerHarian(k)) continue;
      const fr = cat.layers[k].frames;
      if (fr && fr.length > 1) { hitungStepJam(fr.map((f) => f.valid_time)); break; }
    }
    if (!avail.length) throw new Error("catalog.json tidak punya layer");
    activeLayer = layerAwal(cat, avail);
    /* activeBase IKUT DISETEL di sini. Dulu tidak, dan nilainya tertinggal di
       bawaan "wind_surface" sampai orang mengklik tombol parameter pertama
       kalinya. Itu tidak kelihatan selama activeBase cuma dipakai menyalakan
       tombol, tapi sejak badge Parameter memakainya juga, badge-nya menulis
       "Angin" di peta yang sedang menampilkan Brightness Temperature. */
    activeBase = BASE_OF[activeLayer] || activeLayer;
    frames = cat.layers[activeLayer].frames;

    // Tiga kotak yang beda peran, jangan tertukar.
    //   bounds        domain data model (pusat sel). Dipakai panel titik.
    //   image_bounds  tepi sel, tempat heatmap ditempel. Kalau tak ada, pakai bounds.
    //   frame_bounds  kotak untuk bingkai, minZoom, dan kunci pan.
    // Backend mengirim frame_bounds CUMA untuk model berdomain terbatas, yaitu
    // WRF se-Indonesia. GFS tidak punya, jadi dia jatuh ke bounds dan bingkainya
    // tetap diturunkan dari VIEW_CORE seperti sebelumnya.
    const [dw, ds, de, dn] = cat.region.bounds;
    const [iw, is_, ie, iN] = cat.region.image_bounds || cat.region.bounds;
    const [fw, fs, fe, fn] = cat.region.frame_bounds || cat.region.bounds;
    dataBounds = L.latLngBounds([ds, dw], [dn, de]);
    imageBounds = L.latLngBounds([is_, iw], [iN, ie]);
    frameBounds = L.latLngBounds([fs, fw], [fn, fe]);
    ikutDomain = !!cat.region.frame_bounds;
    if (cat.region.view_core) {
      const [vw, vs, ve, vn] = cat.region.view_core;
      VIEW_CORE = L.latLngBounds([vs, vw], [vn, ve]);
    }
    // Batas zoom-in ikut kerapatan grid model, bukan angka mati 9.
    map.setMaxZoom(zoomMaksGrid(jarakSelDerajat(cat.region) || MODEL.dx));

    // Wire tombol layer: klik memilih varian sesuai LEVEL aktif (permukaan/strato).
    // Tombol tanpa data (atau diredupkan oleh level) diabaikan saat diklik.
    document.querySelectorAll(".layer-btn[data-layer]").forEach((btn) => {
      const key = btn.dataset.layer;
      if (cat.layers[key]) {
        btn.classList.remove("disabled");
        // Pilih variabel TIDAK menutup dropdown; hanya tombol panah "Parameter" yg menutup.
        btn.addEventListener("click", () => {
          if (btn.classList.contains("disabled")) return;   // diredupkan (mis. di strato)
          setPlay(false);          // ganti parameter selalu menghentikan putaran
          activeBase = key;
          setActiveLayer(resolveLayer(key));
        });
      } else {
        btn.classList.add("disabled");
      }
      btn.classList.toggle("active", key === activeLayer);
    });
    renderLegend(activeLayer);

    // Medan angin per-waktu — partikel dipakai di SEMUA layer (termasuk hujan).
    const windL = cat.layers["wind_surface"];
    if (windL) windL.frames.forEach((f) => { if (f.velocity_json) windVelByTime[f.valid_time] = f.velocity_json; });
    const windS = cat.layers["wind_strato"];
    if (windS) windS.frames.forEach((f) => { if (f.velocity_json) windVelStrato[f.valid_time] = f.velocity_json; });

    setupHP();               // bilah bawah + chip parameter + kotak keterangan (HP)
    // Dipanggil SESUDAH katalog mendarat dan sesudah bilah HP dibangun.
    // Dia yang menyembunyikan parameter yang tidak dipunyai sumber ini,
    // dan cermin tombol di bilah HP ikut berubah lewat pengamat kelas.
    applyLevelUI();
    terapkanFiturModel();    // sembunyikan fitur yang tak punya data di model ini
    setupLevelSelect();      // hidupkan dropdown LEVEL kalau data strato ada

    // Bingkai tampilan = kotak inti (VIEW_CORE) yang diperlebar pada sumbu yang
    // perlu hingga RASIONYA sama dengan jendela desktop. Efeknya: seluruh wilayah
    // inti (India–Pasifik Barat, Cina Selatan–tengah Australia) mengisi layar
    // penuh, tanpa bar kosong dan tanpa terpotong; tepi domain data (yang lebih
    // luas) tak pernah terlihat. Dihitung ulang tiap kali jendela di-resize.
    function frameRegion() {
      /* DILEWATI kalau yang memicu resize itu panel titik buka tutup.

         map.on("resize", frameRegion) memasang ini di SETIAP perubahan
         ukuran, termasuk invalidateSize yang dipanggil ukurPanelBawah waktu
         kotak peta memendek. Akibatnya tiap kali panel naik, frameRegion
         menata ulang seluruh bingkai dan setView ke tengah domain, jadi
         peta yang baru saja terbang ke titiknya langsung ditarik balik.
         Terukur, zoom naik 4 ke 6 lalu balik dan titiknya meleset 733
         piksel. Yang dilaporkan pemilik, "zoom trs balik lagi zoom out".

         Resize dari JENDELA tetap diurus seperti biasa. */
      if (abaikanBingkai) return;
      const crs = map.options.crs;
      // Lepas dulu rem lama. getBoundsZoom() memotong hasilnya ke minZoom yang
      // sedang berlaku, jadi tanpa ini jendela yang DIKECILKAN tak pernah bisa
      // turun zoom lagi dan tepi bingkainya kepotong.
      map.setMinZoom(0);

      /* Model berdomain terbatas (WRF) membawa frame_bounds sendiri. Untuk dia
         bingkainya = SELURUH domain, bukan turunan VIEW_CORE.

         Argumen kedua `true` itu kuncinya. Tanpa dia Leaflet memberi zoom saat
         domain MUAT DI DALAM layar, dan sisa layar jadi pita alas kosong di
         atas-bawah. Dengan `true` yang diberi adalah zoom saat layar muat DI
         DALAM domain, jadi domain MENUTUPI layar dan tepi luarnya tak pernah
         kelihatan. Sumbu yang lebih sempit yang menentukan, di layar mendatar
         itu tingginya, dan bujurnya yang gantian kepotong sedikit.

         Dinding pan dipasang di tepi domain juga, jadi potongan itu bisa
         digeser tapi tak pernah bisa keluar domain. */
      if (ikutDomain) {
        const z = map.getBoundsZoom(frameBounds, true);
        map.setMinZoom(z);
        map.setMaxBounds(frameBounds);
        map.setView(frameBounds.getCenter(), z, { animate: false });
        return;
      }

      const sw = crs.project(VIEW_CORE.getSouthWest());
      const ne = crs.project(VIEW_CORE.getNorthEast());
      const cx = (sw.x + ne.x) / 2, cy = (sw.y + ne.y) / 2; // pusat (proyeksi Mercator)
      let halfW = Math.abs(ne.x - sw.x) / 2;
      let halfH = Math.abs(ne.y - sw.y) / 2;
      const size = map.getSize();
      const screenRatio = size.x / size.y;
      // Setengah-ukuran domain data GRIB. Bingkai tak boleh melewati ini di sumbu
      // mana pun, kalau lewat yang kelihatan cuma latar kosong di tepi.
      const dsw = crs.project(frameBounds.getSouthWest());
      const dne = crs.project(frameBounds.getNorthEast());
      const dataHalfW = Math.abs(dne.x - dsw.x) / 2;
      const dataHalfH = Math.abs(dne.y - dsw.y) / 2;
      if (screenRatio > halfW / halfH) {
        // Layar lebih lebar (mis. jendela browser yang tingginya termakan bilah
        // alamat) → perlebar bujur. TAPI jangan keluar domain data (lon 62-180E),
        // nanti tepi KIRI/KANAN kosong. Bila melebihi, KUNCI bujur ke domain data
        // & POTONG lintang: layar terisi penuh, zoom sedikit lebih dekat.
        halfW = halfH * screenRatio;
        if (halfW > dataHalfW) { halfW = dataHalfW; halfH = halfW / screenRatio; }
      } else {
        // Layar lebih tinggi (mis. HP potret) → kebalikannya. Pertinggi lintang,
        // tapi jangan keluar domain data (lat ±33), nanti tepi ATAS/BAWAH kosong.
        // Bila melebihi, KUNCI lintang & POTONG bujur: tampil strip vertikal.
        halfH = halfW / screenRatio;
        if (halfH > dataHalfH) { halfH = dataHalfH; halfW = halfH * screenRatio; }
      }
      const box = L.latLngBounds(
        crs.unproject(L.point(cx - halfW, cy - halfH)),
        crs.unproject(L.point(cx + halfW, cy + halfH))
      );
      // Kunci HANYA zoom-out pada tampilan awal (bingkai inti mengisi layar);
      // zoom-in dan geser tetap bebas di dalam domain data.
      const z = map.getBoundsZoom(box);      // zoom saat bingkai inti mengisi layar
      map.setMinZoom(z);                     // tak bisa zoom-out lebih jauh dari ini
      map.setMaxBounds(frameBounds);         // pan dibatasi domain data, bukan bingkai
      map.setView(crs.unproject(L.point(cx, cy)), z, { animate: false });
    }
    bingkaiUlang = frameRegion;   // dipanggil juga oleh tombol layar penuh
    frameRegion();
    map.on("resize", frameRegion);
    loadAdmin(); // batas negara + provinsi Indonesia (non-blocking)
    initCityLabels(); // nama kota + nilai parameter aktif (non-blocking)
    geoGroup = L.layerGroup([], { pane: "labels" }).addTo(map);
    refreshGeoLabels();   // nama negara & laut (pengganti label CARTO)

    // Wiring UI dibuat tahan-null: elemen dekoratif yang hilang (mis. cache
    // index.html lama) tak boleh menggagalkan pemuatan peta & data.
    const slider = $("time-slider");
    if (slider) {
      slider.max = String(frames.length - 1);
      slider.addEventListener("input", (ev) => {
        /* Menyeret selalu menghentikan putaran, bukan membaliknya. Dengan
           toggle lama, satu keadaan yang tidak sepakat membuat seretan
           justru MENYALAKAN putaran lalu tombol main mematikannya lagi,
           dan orang melihat slider yang tidak mau jalan. */
        setPlay(false);
        showFrame(parseInt(ev.target.value, 10));
      });
    }
    $("panel-toggle")?.addEventListener("click", togglePanels);
    $("play-btn")?.addEventListener("click", togglePlay);
    buildTicks(); // label tanggal/jam WIB di bawah slider

    // Tombol zoom neubrutalist → kontrol peta
    $("zoom-in")?.addEventListener("click", () => map.zoomIn());
    $("zoom-out")?.addEventListener("click", () => map.zoomOut());

    // Panah geser variabel (HP): gulir strip layer + auto-redup panah di ujung.
    const layersEl = document.querySelector(".layers");
    const layerStep = () => Math.max(120, (layersEl ? layersEl.clientWidth : 200) * 0.7);
    function updateLayerNav() {
      if (!layersEl) return;
      const atStart = layersEl.scrollLeft <= 1;
      const atEnd = layersEl.scrollLeft + layersEl.clientWidth >= layersEl.scrollWidth - 1;
      $("layer-prev")?.classList.toggle("nav-hidden", atStart);
      $("layer-next")?.classList.toggle("nav-hidden", atEnd);
    }
    $("layer-prev")?.addEventListener("click", () => layersEl?.scrollBy({ left: -layerStep(), behavior: "smooth" }));
    $("layer-next")?.addEventListener("click", () => layersEl?.scrollBy({ left: layerStep(), behavior: "smooth" }));
    layersEl?.addEventListener("scroll", updateLayerNav);
    window.addEventListener("resize", updateLayerNav);
    updateLayerNav();

    // HP: dropdown "Parameter" (variabel) & dropdown kontrol kanan (buka/tutup)
    $("param-toggle")?.addEventListener("click", () =>
      document.querySelector(".layer-bar")?.classList.toggle("param-open"));
    $("ctrl-toggle")?.addEventListener("click", () =>
      document.querySelector(".col.items-end")?.classList.toggle("ctrl-open"));

    // Toggle ikon kondisi cuaca per kota + hitung ulang declutter tiap pindah/zoom
    $("city-toggle")?.addEventListener("click", toggleCityIcons);
    $("cyclone-toggle")?.addEventListener("click", toggleCyclones);
    $("itcz-toggle")?.addEventListener("click", toggleItcz);
    $("mjo-toggle")?.addEventListener("click", toggleMjo);
    $("alarm-toggle")?.addEventListener("click", () => {
      alarmOn = !alarmOn;
      $("alarm-toggle").classList.toggle("active", alarmOn);
      refreshCityIcons();
    });
    $("mon-toggle")?.addEventListener("click", toggleMonsoon);
    map.on("moveend", () => { refreshCityIcons(); });
    map.on("zoomend", applyLabelTiles);   // ambang label CARTO vs label kota sendiri

    // "Cuaca lokasi saya" — geolokasi browser → buka detail di titik pengguna
    $("geo-btn")?.addEventListener("click", () => {
      const btn = $("geo-btn");
      if (!navigator.geolocation) { alert("Browser tidak mendukung geolokasi."); return; }
      btn.classList.add("active");
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          btn.classList.remove("active");
          const { latitude, longitude } = pos.coords;
          if (dataBounds && !dataBounds.contains([latitude, longitude])) {
            alert("Lokasi kamu di luar cakupan peta (Asia–Pasifik).");
            return;
          }
          map.setView([latitude, longitude], 8, { animate: true });
          openPoint(latitude, longitude, null, true); // marker "kamu di sini"
          fillAddress(latitude, longitude); // koordinat → alamat kecamatan/kota
        },
        () => { btn.classList.remove("active"); alert("Tidak bisa mengakses lokasi. Izinkan akses lokasi di browser."); },
        { enableHighAccuracy: true, timeout: 8000 }
      );
    });

    // Point detail: klik peta → panel titik
    /* Klik peta BERCABANG. Dalam mode Skew-T dia memilih titik plot, di luar
       itu dia membuka panel titik seperti biasa. */
    map.on("click", (e) => {
      if (!sktTangkap(e.latlng.lat, e.latlng.lng)) bukaGelembung(e.latlng.lat, e.latlng.lng);
    });
    $("skewt-toggle")?.addEventListener("click", () => setSkewtMode(!skewtMode));
    $("hov-buka")?.addEventListener("click", bukaHovmoller);
    $("ausmi-toggle")?.addEventListener("click", toggleAusmi);
    $("ausmi-note-toggle")?.addEventListener("click", () => $("ausmi-note").classList.toggle("open"));
    $("ausmi-buka")?.addEventListener("click", bukaAusmi);
    $("ausmi-close")?.addEventListener("click", tutupAusmi);
    $("ausmi-overlay")?.addEventListener("click", (e) => { if (e.target === e.currentTarget) tutupAusmi(); });
    $("hov-close")?.addEventListener("click", tutupHovmoller);
    $("hov-overlay")?.addEventListener("click", (e) => { if (e.target === e.currentTarget) tutupHovmoller(); });
    document.querySelectorAll("#hov-tab .hov-tab-btn").forEach((b) =>
      b.addEventListener("click", () => setHovParam(b.dataset.hov)));
    $("skt-close")?.addEventListener("click", tutupSkewT);
    $("skt-overlay")?.addEventListener("click", (e) => { if (e.target === e.currentTarget) tutupSkewT(); });
    $("bd-close")?.addEventListener("click", tutupBanding);
    $("bd-overlay")?.addEventListener("click", (e) => { if (e.target === e.currentTarget) tutupBanding(); });
    /* Escape mematikan modenya kalau kartunya belum terbuka, dan menutup
       kartunya kalau sudah. Dua duanya jalan keluar yang orang harapkan. */
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if ($("hov-overlay")?.classList.contains("show")) tutupHovmoller();
      if ($("ausmi-overlay")?.classList.contains("show")) tutupAusmi();
      if ($("bd-overlay")?.classList.contains("show")) tutupBanding();
      if ($("skt-overlay")?.classList.contains("show")) tutupSkewT();
      else if (skewtMode) setSkewtMode(false);
    });

    /* ---- petunjuk kursor ----
       Label "Click Here" yang mengikuti kursor selama dia di atas peta.
       Petanya tidak punya satu pun tanda bahwa dia bisa diklik, jadi panel
       titik itu praktis tersembunyi sampai ada yang tidak sengaja mengklik.
       Gayanya di style.css, cari PETUNJUK KURSOR.

       Pendengarnya ditempel di #map, BUKAN di window. Panel dan kartu tepi
       itu saudara #map, bukan anaknya, jadi begitu kursor naik ke panel
       #map menerima mouseleave dan labelnya hilang sendiri. Tidak perlu
       satu pun daftar pengecualian.

       Labelnya juga disembunyikan selama peta DIGESER atau di-zoom. Kalau
       tidak, dia menulis "Click Here" tepat waktu orang sedang menyeret
       peta, dan itu menyesatkan. */
    (() => {
      const tanda = $("klik-petunjuk"), wadah = map.getContainer();
      if (!tanda || !wadah || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
      let diDalam = false, geser = false, mx = 0, my = 0;
      const JARAK = 18;                      // jarak dari ujung kursor
      const taruh = () => {
        /* Dibalik ke kiri kursor kalau sudah dekat tepi kanan, kalau tidak
           labelnya terpotong jendela. Lebarnya diukur, tidak ditebak. */
        const w = tanda.offsetWidth, h = tanda.offsetHeight;
        let x = mx + JARAK, y = my + JARAK;
        if (x + w > window.innerWidth - 8) x = mx - JARAK - w;
        if (y + h > window.innerHeight - 8) y = my - JARAK - h;
        tanda.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      };
      const nyala = () => tanda.classList.toggle("tampil", diDalam && !geser);
      wadah.addEventListener("mousemove", (e) => {
        mx = e.clientX; my = e.clientY; diDalam = true; taruh(); nyala();
      });
      wadah.addEventListener("mouseleave", () => { diDalam = false; nyala(); });
      map.on("movestart zoomstart", () => { geser = true; nyala(); });
      map.on("moveend zoomend", () => { geser = false; nyala(); });
    })();
    $("pt-close")?.addEventListener("click", closePoint);
    $("pt-export")?.addEventListener("click", exportCSV);
    /* Titiknya diambil dari lastPoint, SAMA dengan exportCSV, bukan dari
       sharedPoint. sharedPoint cuma terisi kalau titiknya datang dari
       tautan atau dari pencarian kota, sedangkan panel ini juga terbuka
       lewat klik biasa di peta. */
    $("pt-plot")?.addEventListener("click", () => {
      if (!lastPoint) return;
      bukaPlotBanding(lastPoint.lat, lastPoint.lon, sharedPoint && sharedPoint.name);
    });
    $("pt-hide")?.addEventListener("click", hidePoint);
    $("pt-reopen")?.addEventListener("click", reopenPoint);
    $("share-btn")?.addEventListener("click", shareCurrent);
    $("fs-btn")?.addEventListener("click", toggleFullscreen);
    /* #about-btn SUDAH TIDAK ADA di markup, diganti tautan rumah ke landing.
       Baris ini dibiarkan dan aman sebab pakai ?., jadi bagian #about tinggal
       dipasangi pintu masuk baru kapan saja tanpa menulis ulang apa apa.
       Untuk sekarang bagian itu memang tidak bisa dibuka siapa pun. */
    $("about-btn")?.addEventListener("click", openAbout);
    $("nav-arrow")?.addEventListener("click", () => $("nav-arrow").closest(".brand-row")?.classList.toggle("nav-open"));
    $("about-close")?.addEventListener("click", closeAbout);
    $("about-close-team")?.addEventListener("click", closeAbout);
    $("about-overlay")?.addEventListener("click", (e) => { if (e.target === e.currentTarget) closeAbout(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeAbout(); });
    /* Kartu akurasi. Badge-nya sekarang DIKLIK, bukan cuma disorot. Rincian
       di atribut title tidak pernah terbaca di HP, dan di desktop pun cuma
       terbaca orang yang kebetulan mendiamkan kursornya di situ. */
    $("acc-badge")?.addEventListener("click", bukaAkurasi);
    $("akr-close")?.addEventListener("click", tutupAkurasi);
    $("akr-overlay")?.addEventListener("click", (e) => { if (e.target === e.currentTarget) tutupAkurasi(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") tutupAkurasi(); });
    // Badge "Last update" (HP): tap ikon "!" → buka teks; tap lagi/panah → tutup.
    $("data-fresh")?.addEventListener("click", () => $("data-fresh").classList.toggle("open"));
    // Tempatkan badge: desktop → kontainer slider (atas-kanan); HP → dalam legend-col
    // (di atas legenda; otomatis naik di atas tabel kondisi saat ikon kota aktif).
    const freshBadge = $("data-fresh");
    const placeFreshBadge = () => {
      if (!freshBadge) return;
      const hp = window.matchMedia("(max-width: 640px)").matches;
      /* Desktop: ke blok status di kiri atas, di bawah identitas. Dulu ke
         ".timeline" di bilah bawah, dipindah 9 Sep 2026 atas permintaan user. */
      const host = document.querySelector(hp ? ".legend-col" : ".status");
      if (host && freshBadge.parentElement !== host) host.insertBefore(freshBadge, host.firstChild);
    };
    placeFreshBadge();
    window.addEventListener("resize", placeFreshBadge);
    // Dropdown legenda+threshold di banner indikasi siklon.
    $("cyc-note-toggle")?.addEventListener("click", () => $("cyc-note").classList.toggle("open"));
    $("itcz-note-toggle")?.addEventListener("click", () => $("itcz-note").classList.toggle("open"));
    $("mjo-note-toggle")?.addEventListener("click", () => $("mjo-note").classList.toggle("open"));

    // Pencarian kota/kabupaten
    const sbox = $("search-box"), sin = $("search-input");
    $("search-btn")?.addEventListener("click", () => {
      if (sbox.classList.toggle("open")) { loadPlaces(); sin.focus(); }
    });
    sin?.addEventListener("input", (e) => renderSearch(e.target.value));
    sin?.addEventListener("keydown", (e) => {
      if (e.key === "Escape") sbox.classList.remove("open");
      if (e.key === "Enter") {
        const f = $("search-results").querySelector(".search-item");
        if (f) pickPlace(parseFloat(f.dataset.lat), parseFloat(f.dataset.lon), f.textContent);
      }
    });
    $("search-results")?.addEventListener("click", (e) => {
      const it = e.target.closest(".search-item");
      if (it) pickPlace(parseFloat(it.dataset.lat), parseFloat(it.dataset.lon), it.textContent);
    });
    // Initial time (dekoratif) diisi dari run model
    const io = $("init-opt");
    if (io) io.textContent = cat.run_time;

    const runEl = $("run-info");
    if (runEl) runEl.title = "Run model: " + cat.run_time;
    current = nearestNowIndex();       // mulai di frame terdekat "sekarang"
    await showFrame(current);
    restoreFromHash();                 // pulihkan layer/waktu/titik dari link dibagikan
    updateFreshness();
    updateAkurasi();
    drawPosHujan();
    await whenHeatmapReady();          // reveal setelah frame pertama tergambar
    hideSkeleton();
    setTimeout(prefetchTitik, 2500);   // ancang ancang panel titik, lihat prefetchTitik
    pasangPitaGlobal();                // pita "Basis GFS" di kartu Fitur, kalau model lokal
    intaiCirrus();                     // kalau kita di cadangan, tunggu cirrus mendarat
  } catch (err) {
    showLoadMsg("Gagal memuat data: " + err.message);
    console.error(err);
  }
}

init();

// PWA: daftarkan service worker (cache shell berversi; data cuaca tetap online).
// Dilewati di mode sematan. Kartu Showcase bukan tempat orang memasang app,
// dan mendaftarkan SW dari dalam iframe cuma menambah kerja tanpa gunanya.
if (!EMBED && "serviceWorker" in navigator) {
  window.addEventListener("load", () =>
    navigator.serviceWorker.register("sw.js").catch((e) => console.warn("SW gagal:", e)));
}

/* ==================================================================
   TATA LETAK HP: bilah bawah, chip parameter, tumpukan keterangan.

   Prinsip yang dipegang: bilah bawah TIDAK punya tombol sendiri. Isinya
   dibangun dari tombol yang sudah ada di DOM, dan kliknya diteruskan ke
   tombol aslinya. Jadi tak ada dua tempat yang harus disamakan tiap kali
   ada parameter baru, dan status aktif/redup selalu ikut yang asli.
   Penyelarasan statusnya pakai MutationObserver, bukan memanggil ulang
   dari belasan tempat, supaya tak ada jalur yang kelewat.
   ================================================================== */
const HP = () => window.matchMedia("(max-width: 640px)").matches;

// Seksi bilah bawah. `sel` = pemilih tombol ASLI yang diwakili.
const LB_SEKSI = [
  { judul: "Model", jenis: "model" },
  { judul: "Parameter", sel: ".layer-btn[data-layer]" },
  // Nama seksi ini dipilih sendiri: isinya penanda yang digambar DI ATAS peta
  // (ikon kondisi kota, ikon siklon, garis ITCZ), bukan parameter dan bukan
  // fenomena. "Penanda" paling pas dan tetap awam.
  { judul: "Penanda", sel: "#city-toggle, #cyclone-toggle, #itcz-toggle, #mjo-toggle" },
  { judul: "Fenomena", jenis: "fenomena" },
];

// Tiga fenomena jadi tombol TERPISAH di HP. Di desktop satu tombol
// #mon-toggle tetap menyalakan ketiganya sekaligus (perilaku lama).
const FEN = [
  { k: "monsun", label: "Monsun", ikon: "air" },
  { k: "bv", label: "Borneo Vortex", ikon: "cyclone" },
  { k: "surge", label: "Cold Surge", ikon: "ac_unit" },
];
let fenOn = { monsun: false, bv: false, surge: false };

function ikonDari(btn) {
  const i = btn.querySelector(".material-symbols-outlined");
  return i ? i.textContent.trim() : "";
}
function labelDari(btn) {
  // Urutan: .lb-txt, lalu TEKS TOMBOL ITU SENDIRI, baru data-tip.
  // data-tip sering berisi keterangan panjang yang tak muat di tombol selebar
  // sepertiga layar. Ikon dikeluarkan dulu, kalau tidak nama ligature Material
  // ikut terbaca sebagai teks.
  const t = btn.querySelector(".lb-txt")?.textContent.trim();
  if (t) return t;
  const salin = btn.cloneNode(true);
  salin.querySelectorAll(".material-symbols-outlined").forEach((e) => e.remove());
  const teks = salin.textContent.replace(/\s+/g, " ").trim();
  if (teks) return teks;
  return btn.dataset.tip || btn.getAttribute("aria-label") || "";
}

function bangunLowbar() {
  const body = $("lowbar-body");
  if (!body) return;
  body.innerHTML = "";
  for (const sec of LB_SEKSI) {
    let isi = [];
    if (sec.jenis === "model") {
      const selEl = $("model-select");
      if (!selEl) continue;
      isi = [...selEl.options].map((o) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "lb-btn" + (o.value === MODEL_ID ? " active" : "");
        b.textContent = o.textContent.replace(/\s*-\s*\d+\s*km$/, "");
        b.addEventListener("click", () => {
          if (o.value === MODEL_ID) return;
          selEl.value = o.value;
          selEl.dispatchEvent(new Event("change"));
        });
        return b;
      });
    } else if (sec.jenis === "fenomena") {
      if (!$("mon-toggle")) continue;
      isi = FEN.map((f) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "lb-btn" + (fenOn[f.k] ? " active" : "");
        b.dataset.fen = f.k;
        b.innerHTML = `<span class="material-symbols-outlined">${f.ikon}</span>${f.label}`;
        b.addEventListener("click", () => {
          if (b.classList.contains("disabled")) return;
          fenOn[f.k] = !fenOn[f.k];
          terapkanFenomena();
        });
        return b;
      });
      // Borneo Vortex & Cold Surge BUKAN saklar bebas. Keduanya kejadian yang
      // ada atau tidak ada hari itu; kalau sedang tak terjadi, tak ada yang
      // bisa digambar. Jadi tombolnya diredupkan dan tak bisa dipencet,
      // menjadi penunjuk keadaan. Monsun selalu ada, jadi selalu bisa dipencet.
      loadMonsoon().then(() => segarkanTombolFenomena());
    } else {
      const asli = [...document.querySelectorAll(sec.sel)];
      if (!asli.length) continue;
      isi = asli.map((src) => {
        const b = document.createElement("button");
        b.type = "button";
        b.dataset.sumber = src.id || src.dataset.layer;
        b.innerHTML = `<span class="material-symbols-outlined">${ikonDari(src)}</span>${labelDari(src)}`;
        b.addEventListener("click", () => { if (!src.classList.contains("disabled")) src.click(); });
        return b;
      });
      // Status awal + ikut berubah otomatis kalau kelas tombol asli berubah.
      asli.forEach((src, i) => {
        const cermin = () => {
          isi[i].className = "lb-btn"
            + (src.classList.contains("active") ? " active" : "")
            + (src.classList.contains("disabled") ? " disabled" : "")
            // Kelas sembunyi WAJIB ikut dicerminkan. Kalau tidak, tombol
            // yang sudah hilang di sisi kanan tetap berjajar di bilah bawah
            // HP, dan dua tampilan itu jadi bercerita beda.
            + (src.classList.contains("sembunyi") ? " sembunyi" : "");
        };
        cermin();
        new MutationObserver(cermin).observe(src, { attributes: true, attributeFilter: ["class"] });
      });
    }
    if (!isi.length) continue;
    const wrap = document.createElement("div");
    wrap.className = "lb-sec";
    wrap.innerHTML = `<div class="lb-head">${sec.judul}</div><div class="lb-rule"></div>`;
    const box = document.createElement("div");
    box.className = "lb-items";
    isi.forEach((b) => box.appendChild(b));
    wrap.appendChild(box);
    body.appendChild(wrap);
  }
}

// Redupkan tombol fenomena yang kejadiannya sedang TIDAK berlangsung.
function segarkanTombolFenomena() {
  const vx = monsoon?.vortex || {}, sg = monsoon?.surge || {};
  const hidup = { monsun: true, bv: !!vx.active, surge: !!sg.active };
  document.querySelectorAll("#lowbar-body .lb-btn[data-fen]").forEach((b) => {
    const k = b.dataset.fen;
    const bisa = hidup[k];
    b.classList.toggle("disabled", !bisa);
    b.title = bisa ? "" : "Sedang tidak terjadi";
    if (!bisa && fenOn[k]) { fenOn[k] = false; }   // matikan kalau terlanjur nyala
    b.classList.toggle("active", !!fenOn[k]);
  });
}

function setLowbar(buka) {
  const lb = $("lowbar"), h = $("lowbar-handle"), st = $("stage");
  if (!lb || !h) return;
  lb.classList.toggle("open", buka);
  h.classList.toggle("open", buka);
  lb.setAttribute("aria-hidden", String(!buka));
  st && st.classList.toggle("lowbar-open", buka);
  // Peta berubah tinggi (jadi 4:3), Leaflet harus diberi tahu.
  setTimeout(() => map && map.invalidateSize({ animate: false }), 300);
}

/* Badge parameter aktif, di bawah badge Last update.
   Dulu chip mengambang yang CUMA ada di HP. Dipindah dan dihidupkan di
   semua ukuran layar 19 Oktober 2026 atas permintaan pemilik, sekalian
   supaya nama parameter punya satu rumah, bukan dua tempat berbeda
   tergantung lebar layar. */
function isiParBadge(src) {
  const ik = $("par-badge-ico"), tx = $("par-badge-text");
  const ikon = src.querySelector(".material-symbols-outlined");
  if (ik) ik.textContent = ikon ? ikon.textContent.trim() : "tune";
  const lbl = src.querySelector(".lb-txt");
  if (tx) {
    // innerHTML untuk yang punya .lb-txt, sebab nama polutan membawa tulisan
    // bawah seperti SO<sub>2</sub> yang akan jadi "SO2" kalau dipaksa teks.
    if (lbl) tx.innerHTML = "Parameter : " + lbl.innerHTML.trim();
    else tx.textContent = "Parameter : " + src.textContent.trim();
  }
}

function updateParChip() {
  const el = $("par-badge");
  if (!el) return;
  const src = document.querySelector(`.layer-btn[data-layer="${activeBase}"]`);
  if (!src) { el.hidden = true; return; }
  el.hidden = false;
  isiParBadge(src);
}

/* NAMA DI BADGE IKUT KURSOR selagi orang memilih di panel parameter, lalu
   kembali ke yang sedang tampil begitu kursornya keluar. Diminta pemilik 19
   Okt sore. Gunanya, nama parameter sering lebih panjang daripada yang muat
   di tombolnya, jadi menyorotnya sudah cukup untuk tahu itu apa tanpa harus
   mengkliknya dulu.

   PENGUNCIANNYA TIDAK PERLU KODE TAMBAHAN. Begitu orang benar benar memilih,
   setActiveLayer memanggil updateParChip dan badge-nya terisi dari layer
   yang aktif, jadi sorotan berikutnya cuma menimpa sementara lalu kembali ke
   pilihan itu.

   Dipasang di document dengan penyaringan, bukan di tiap tombol, sebab
   tombolnya tersebar di lebih dari satu wadah. Pemulihannya menunggu kursor
   betul betul keluar dari semua tombol, kalau tidak badge-nya berkedip tiap
   kali kursor melintas dari satu tombol ke tetangganya.

   HANYA DI ALAT BERTETIKUS. Di layar sentuh mouseover ikut terpicu oleh
   ketukan, dan itu membuat badge-nya berganti sekejap sebelum pilihannya
   diterapkan. */
if (window.matchMedia("(hover: hover)").matches) {
  const sorot = (e) => {
    const b = e.target.closest && e.target.closest(".layer-btn[data-layer]");
    if (!b || b.classList.contains("disabled") || b.classList.contains("sembunyi")) return b;
    const el = $("par-badge");
    if (el && !el.hidden) isiParBadge(b);
    return b;
  };
  document.addEventListener("mouseover", sorot);
  document.addEventListener("mouseout", (e) => {
    if (!e.target.closest || !e.target.closest(".layer-btn[data-layer]")) return;
    const ke = e.relatedTarget && e.relatedTarget.closest
      && e.relatedTarget.closest(".layer-btn[data-layer]");
    if (!ke) updateParChip();
  });
}

// Keterangan (Kondisi, Siklon, ITCZ, Fenomena) dikumpulkan ke kiri bawah.
// Elemen ASLINYA yang dipindah, bukan disalin, supaya isinya tetap ikut
// diperbarui oleh kode yang sudah ada.
const KET_SUMBER = [
  ["cond-legend", "Kondisi"], ["cyc-note", "Siklon"],
  ["itcz-note", "ITCZ"], ["phenom-panel", "Fenomena"],
];
const ketAsal = new Map();
function susunKeterangan() {
  const stack = $("ket-stack"), body = $("ket-body");
  if (!stack || !body) return;
  if (!HP()) {                       // desktop: kembalikan ke tempat semula
    for (const [id] of KET_SUMBER) {
      const el = $(id), asal = ketAsal.get(id);
      if (el && asal && el.parentElement === body) { el.classList.remove("di-ket"); asal.appendChild(el); }
    }
    stack.hidden = true;
    return;
  }
  let ada = 0;
  for (const [id, judul] of KET_SUMBER) {
    const el = $(id);
    if (!el) continue;
    if (!ketAsal.has(id)) ketAsal.set(id, el.parentElement);
    const tampil = el.classList.contains("show") || el.classList.contains("open")
                || getComputedStyle(el).display !== "none";
    if (tampil) {
      if (el.parentElement !== body) {
        el.classList.add("di-ket");
        const t = document.createElement("div");
        t.className = "ket-judul"; t.textContent = judul.toUpperCase();
        body.appendChild(t); body.appendChild(el);
      }
      ada++;
    } else if (el.parentElement === body) {
      el.classList.remove("di-ket");
      el.previousElementSibling?.classList.contains("ket-judul") && el.previousElementSibling.remove();
      ketAsal.get(id)?.appendChild(el);
    }
  }
  stack.hidden = ada === 0;
}

function setupHP() {
  bangunLowbar();
  updateParChip();
  $("lowbar-handle")?.addEventListener("click", () => setLowbar(true));
  $("lowbar")?.addEventListener("click", (e) => {
    // Klik di area kosong bilah menutupnya kembali.
    if (e.target === $("lowbar") || e.target.classList.contains("lowbar-grip")) setLowbar(false);
  });
  $("ket-toggle")?.addEventListener("click", () => $("ket-stack").classList.toggle("ciut"));
  window.addEventListener("resize", () => { updateParChip(); susunKeterangan(); });
  // Keterangan bisa muncul/hilang dari mana saja; pantau saja perubahannya.
  new MutationObserver(susunKeterangan).observe(document.body,
    { attributes: true, subtree: true, attributeFilter: ["class", "style"] });
  susunKeterangan();
}

/* =====================================================================
   AUSMI, INDEKS MONSUN AUSTRALIA, 7 Oktober 2026
   Diminta pemilik lewat Alvin, saudara MJO.

   AUSMI itu u850 dirata ratakan di kotak 5 sampai 15 LS, 110 sampai 130 BT.
   Kajikawa, Wang, Yang 2010. Baratan berarti monsun aktif, timuran berarti
   lemah. Semuanya dihitung backend, berkasnya ausmi.json, frontend di sini
   cuma menayangkan.

   JEBAKAN ISTILAH, dan ini sudah ditulis juga di layar. Banner Monsun di
   sebelah memakai istilah Indonesia, tempat "Monsun Australia" berarti angin
   timuran alias musim KEMARAU. AUSMI memakai istilah internasional, dan
   AUSMI aktif berarti baratan alias musim HUJAN. Dua banner bertetangga yang
   artinya hampir berlawanan, jadi keduanya WAJIB tetap berketerangan.

   Tombolnya menggambar KOTAKNYA di peta. Angka indeks tanpa tempat itu cuma
   angka, dan kotaknya kecil serta tetap, jadi menggambarnya murah dan
   langsung menjawab "ini dihitung dari mana".
   ===================================================================== */
/* Warnanya DIAMBIL DARI MON_AMBER, skala yang sudah dipakai partikel
   velocity waktu monsun Australia sedang dominan, dan nilai tengahnya
   #ffb020 itu juga yang jadi titik penanda AUS. Diminta pemilik.

   Sengaja menunjuk konstanta itu, bukan menyalin hex-nya ke sini. Kotak
   AUSMI dan partikel monsun menggambarkan gejala yang SAMA, jadi kalau
   suatu hari paletnya digeser, menyalin berarti meninggalkan satu kotak
   berwarna lama yang tidak ada yang ingat harus ikut diubah. */
const AUSMI_WARNA = MON_AMBER[2];
let ausmiData = null, ausmiMuat = null, ausmiOn = false, ausmiGroup = null;
let ausmiBase = null, ausmiCari = null;

function ausmiPunya() { return !!(ausmiData && ausmiData.kini); }

/* MUNDUR KE CADANGAN PER BERKAS, dan ini perlu alasan sebab dia menyimpang
   dari aturan sumber yang berlaku di app ini.

   Aturan biasa memilih sumber SEKALI untuk SELURUH folder model, patokannya
   umur catalog.json. Selama kiriman cirrus sehat dan belum 24 jam, cadangan
   tidak pernah ditanya sama sekali. Benar untuk medan peta, sebab mencampur
   bingkai dari dua masakan berbeda di satu slider itu menyesatkan.

   Tapi untuk berkas yang BELUM PERNAH ADA di cirrus, aturan itu membuat
   fiturnya gelap selamanya. Dilaporkan pemilik, AUSMI tidak muncul padahal
   sudah dipasang, sebab catalog.json cirrus masih segar sehingga cadangan
   yang sudah memuat ausmi.json tidak pernah dilirik.

   Jadi khusus berkas ini, kalau yang dekat menjawab 404, cadangan ditanya.
   Aman sebab AUSMI itu indeks yang berdiri sendiri, bukan bingkai yang harus
   sejalan dengan bingkai lain, dan dua duanya dihitung dari analisis GFS yang
   sama. Yang TIDAK dilakukan, memakai cadangan waktu yang dekat ADA, sekalipun
   cadangannya lebih segar. Yang dekat tetap menang kalau dia ada.

   Asalnya disebutkan di baner, supaya tidak ada angka yang sumbernya diam
   diam berbeda dari chip di bilah bawah. */
function cariAusmi() {
  if (ausmiCari) return ausmiCari;
  const coba = (base) => fetchUlang(base + "ausmi.json", { method: "HEAD", cache: "no-store" })
    .then((r) => (r.ok ? base : null)).catch(() => null);
  ausmiCari = coba(DATA_BASE).then((b) => {
    if (b) return b;
    /* Folder model global dulu, baru cadangan GitHub Pages. AUSMI indeks
       global, jadi membacanya dari folder GFS selagi peta menampilkan WRF
       itu benar, bukan tambal sulam. Lihat basisGlobal(). */
    return basisGlobal() !== DATA_BASE ? coba(basisGlobal()) : null;
  }).then((b) => {
    if (b) return b;
    const boleh = !!DATA_CADANGAN && MODEL_ID === MODEL_GLOBAL && DATA_BASE !== DATA_CADANGAN;
    return boleh ? coba(DATA_CADANGAN) : null;
  }).then((b) => (ausmiBase = b));
  return ausmiCari;
}

function muatAusmi() {
  if (ausmiData) return Promise.resolve(ausmiData);
  if (!ausmiMuat) {
    ausmiMuat = cariAusmi().then((base) => {
      if (!base) return null;
      return fetch(base + "ausmi.json", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null));
    }).then((j) => (ausmiData = j)).catch(() => (ausmiData = null));
  }
  return ausmiMuat;
}

function ausmiGambarKotak() {
  if (!ausmiGroup) ausmiGroup = L.layerGroup([], { pane: "mjo" });
  ausmiGroup.clearLayers();
  if (!ausmiPunya()) return;
  const k = ausmiData.kotak;
  if (!k) return;
  const sudut = [[k.latS, k.lonW], [k.latN, k.lonE]];
  L.rectangle(sudut, {
    pane: "mjo", color: AUSMI_WARNA, weight: 1.6, opacity: 0.95,
    // Putus putus, sengaja. Kotak ini WILAYAH HITUNG, bukan gejala cuaca,
    // sedangkan garis utuh di peta ini sudah berarti sesuatu yang fisik
    // seperti ITCZ dan lintasan siklon.
    dashArray: "6 5",
    // Alfa dinaikkan 0,10 ke 0,18, diminta pemilik. Masih cukup bening untuk
    // membaca medan angin di bawahnya, yang memang harus tetap terbaca sebab
    // itulah yang diringkas angka AUSMI.
    fillColor: AUSMI_WARNA, fillOpacity: 0.18, interactive: false,
  }).addTo(ausmiGroup);
  /* Label di pane kepala, bukan pane mjo. Pane mjo itu 448 dan ada di bawah
     label peta yang 650, jadi nama laut akan menimpa angkanya. Pelajaran
     yang sama sudah kena waktu menomori zona MJO. */
  const kini = ausmiData.kini;
  const tanda = kini.nilai > 0 ? "+" : "";
  /* Label ditaruh di tepi BAWAH kotak. Tepi atasnya di 5 LS jatuh di Laut
     Jawa yang penuh nama kota, dan tulisannya langsung bertabrakan dengan
     Makassar dan Semarang. Tepi bawahnya di 15 LS laut lepas, kosong. */
  L.marker([k.latS, (k.lonW + k.lonE) / 2], {
    pane: "mjokepala", interactive: false,
    icon: L.divIcon({
      className: "ausmi-tag",
      html: `<span class="ausmi-tag-in"><b>AUSMI</b> ${tanda}${kini.nilai.toFixed(1)} m/s`
          + ` &middot; ${kini.arah}</span>`,
      iconSize: null,
    }),
  }).addTo(ausmiGroup);
}

function ausmiIsiNote() {
  const angka = $("ausmi-angka");
  const onset = $("ausmi-onset");
  const sisip = $("ausmi-sumber");
  const tombol = $("ausmi-buka");
  if (!ausmiPunya()) {
    if (angka) angka.hidden = true;
    if (onset) onset.hidden = true;
    if (tombol) tombol.hidden = true;
    if (sisip) sisip.textContent = "Indeks AUSMI belum dikirim untuk model ini.";
    return;
  }
  const k = ausmiData.kini;
  const tanda = k.nilai > 0 ? "+" : "";
  const aTanda = k.anomali > 0 ? "+" : "";
  if (angka) {
    angka.hidden = false;
    angka.innerHTML =
      `<span class="ausmi-besar">${tanda}${k.nilai.toFixed(1)}</span>`
    + `<span class="ausmi-sat">m/s</span>`
    + `<span class="ausmi-arah ${k.aktif ? "is-aktif" : "is-lemah"}">`
    + `${k.aktif ? "baratan, monsun aktif" : "timuran, monsun lemah"}</span>`
    + `<span class="ausmi-anom">${aTanda}${k.anomali.toFixed(1)} dari normal`
    + (k.sigma == null ? "" : ` &middot; ${k.sigma > 0 ? "+" : ""}${k.sigma.toFixed(1)} sigma`)
    + `</span>`;
  }
  if (onset) {
    const o = ausmiData.onset || {};
    onset.hidden = false;
    onset.innerHTML = o.tanggal
      ? `<b>Onset ${o.musim}</b> ${tglPendek(o.tanggal)}`
      : `<b>Onset ${o.musim || ""}</b> ${o.catatan || "belum"}`;
  }
  if (tombol) tombol.hidden = !(ausmiData.deret && ausmiData.deret.hari && ausmiData.deret.hari.length > 2);
  if (sisip) {
    const ki = ausmiData.klim_info || {};
    /* Bias yang BELUM diukur disebut apa adanya. Kalau tidak, anomali di atas
       terbaca seolah olah sudah bersih padahal nilai hariannya dari GFS dan
       klimatologinya dari reanalisis, dua model yang berbeda. */
    const dariCadangan = ausmiBase && ausmiBase === DATA_CADANGAN && DATA_BASE !== DATA_CADANGAN;
    sisip.textContent = (dariCadangan ? "Indeks ini dari cadangan GitAction, bukan dari cirrus seperti peta di belakangnya. " : "")
      + `Klimatologi ${ki.periode || "-"}, ${ki.sumber || "-"}.`
      + (ausmiData.bias_terukur == null
          ? " Selisih model lawan reanalisis belum diukur, anomali di atas belum dikoreksi."
          : ` Selisih model lawan reanalisis ${ausmiData.bias_terukur > 0 ? "+" : ""}`
            + `${Number(ausmiData.bias_terukur).toFixed(2)} m/s, sudah dikoreksi.`);
  }
}

function tglPendek(iso) {
  const B = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  const d = new Date(iso + "T00:00:00Z");
  return `${d.getUTCDate()} ${B[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function toggleAusmi() {
  ausmiOn = !ausmiOn;
  $("ausmi-toggle")?.classList.toggle("active", ausmiOn);
  const note = $("ausmi-note");
  if (ausmiOn) {
    muatAusmi().then(() => {
      ausmiIsiNote();
      ausmiGambarKotak();
      if (ausmiGroup) ausmiGroup.addTo(map);
    });
    if (note) note.classList.add("show");
  } else {
    if (ausmiGroup) map.removeLayer(ausmiGroup);
    if (note) note.classList.remove("show");
  }
  updateHash();
}

/* ---- Grafik musiman. SVG ditulis tangan, bukan lewat chartSVG.
   chartSVG dibuat untuk deret tunggal di panel titik, sedangkan di sini ada
   TIGA deret sekaligus, mentah, halus, dan klimatologi, plus garis nol yang
   harus tepat sebab tanda indeks inilah yang punya arti. Memaksanya masuk ke
   sana berarti menambah cabang di fungsi yang dipakai belasan grafik lain. */
function gambarAusmi() {
  const wadah = $("ausmi-plot");
  const kosong = $("ausmi-kosong");
  if (!wadah) return;
  const d = ausmiPunya() ? ausmiData.deret : null;
  if (!d || !d.hari || d.hari.length < 3) {
    wadah.innerHTML = "";
    if (kosong) {
      kosong.hidden = false;
      kosong.textContent = "Deret AUSMI belum cukup panjang untuk digambar. "
        + "Riwayatnya ditumpuk sehari satu baris, jadi grafik ini terisi sendiri seiring waktu.";
    }
    return;
  }
  if (kosong) kosong.hidden = true;

  /* Dipotong setahun terakhir. Lebih panjang dari itu garisnya jadi rapat
     tak terbaca, dan yang dicari orang di sini keadaan musim ini. */
  const N = Math.min(d.hari.length, 366);
  const hari = d.hari.slice(-N);
  const mentah = d.nilai.slice(-N);
  const halus = (d.halus || d.nilai).slice(-N);
  const klim = (d.klim || []).slice(-N);

  const W = 760, H = 300, padL = 44, padR = 14, padT = 14, padB = 30;
  const pw = W - padL - padR, ph = H - padT - padB;
  const semua = mentah.concat(klim.length ? klim : []);
  let lo = Math.min(...semua), hi = Math.max(...semua);
  const sela = (hi - lo) * 0.12 || 1;
  lo -= sela; hi += sela;
  const X = (i) => padL + pw * (N <= 1 ? 0.5 : i / (N - 1));
  const Y = (v) => padT + ph * (1 - (v - lo) / (hi - lo));

  const jalur = (arr) => arr.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(" ");

  // Garis nol. Inilah batas baratan lawan timuran, jadi dia dipertebal
  // dibanding garis bantu lain.
  const y0 = (lo < 0 && hi > 0) ? Y(0) : null;
  let bantu = "";
  const langkah = (hi - lo) > 16 ? 5 : 2;
  for (let v = Math.ceil(lo / langkah) * langkah; v <= hi; v += langkah) {
    if (y0 != null && Math.abs(v) < 1e-9) continue;
    bantu += `<line x1="${padL}" y1="${Y(v).toFixed(1)}" x2="${padL + pw}" y2="${Y(v).toFixed(1)}" class="au-bantu"/>`
           + `<text x="${padL - 6}" y="${(Y(v) + 3.5).toFixed(1)}" class="au-axl" text-anchor="end">${v > 0 ? "+" : ""}${v}</text>`;
  }

  // Label bulan di sumbu datar, satu per pergantian bulan.
  const B = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  let sumbu = "";
  for (let i = 1; i < N; i++) {
    if (hari[i].slice(5, 7) === hari[i - 1].slice(5, 7)) continue;
    const x = X(i);
    sumbu += `<line x1="${x.toFixed(1)}" y1="${padT + ph}" x2="${x.toFixed(1)}" y2="${padT + ph + 4}" class="au-bantu"/>`
           + `<text x="${x.toFixed(1)}" y="${H - 8}" class="au-axl" text-anchor="middle">${B[+hari[i].slice(5, 7) - 1]}</text>`;
  }

  /* Penanda onset untuk TIAP musim yang jatuh di dalam potongan, bukan cuma
     musim berjalan. Di bulan bulan sebelum onset, musim berjalan belum punya
     tanggal sama sekali, dan justru saat itulah orang bertanya tahun lalu
     kapan. Menandai yang lalu saja sudah menjawabnya. */
  let tandaOnset = "";
  const daftarOnset = ausmiData.onset_semua
    || (ausmiData.onset ? [ausmiData.onset] : []);
  daftarOnset.forEach((o) => {
    if (!o || !o.tanggal) return;
    const oi = hari.indexOf(o.tanggal);
    if (oi < 0) return;
    const x = X(oi);
    tandaOnset += `<line x1="${x.toFixed(1)}" y1="${padT}" x2="${x.toFixed(1)}" y2="${padT + ph}" class="au-onset"/>`
                + `<text x="${(x + 4).toFixed(1)}" y="${padT + 11}" class="au-onset-lbl">onset ${o.musim}</text>`;
  });

  wadah.innerHTML =
    `<svg viewBox="0 0 ${W} ${H}" class="au-svg" role="img" aria-label="Deret AUSMI setahun terakhir">`
    + bantu
    + (y0 != null ? `<line x1="${padL}" y1="${y0.toFixed(1)}" x2="${padL + pw}" y2="${y0.toFixed(1)}" class="au-nol"/>`
                  + `<text x="${padL - 6}" y="${(y0 + 3.5).toFixed(1)}" class="au-axl" text-anchor="end">0</text>` : "")
    + sumbu
    + (klim.length ? `<polyline points="${jalur(klim)}" class="au-klim"/>` : "")
    + `<polyline points="${jalur(mentah)}" class="au-mentah"/>`
    + `<polyline points="${jalur(halus)}" class="au-halus"/>`
    + tandaOnset
    + `<circle cx="${X(N - 1).toFixed(1)}" cy="${Y(mentah[N - 1]).toFixed(1)}" r="3.2" class="au-kini"/>`
    + `</svg>`;

  const kini = $("ausmi-kini");
  if (kini) {
    const k = ausmiData.kini;
    kini.innerHTML = `<b>${k.nilai > 0 ? "+" : ""}${k.nilai.toFixed(1)}</b> m/s`
      + `<span>${tglPendek(k.tanggal)}</span>`;
  }
}

function bukaAusmi() {
  muatAusmi().then(() => {
    gambarAusmi();
    $("ausmi-overlay")?.classList.add("show");
  });
}
function tutupAusmi() { $("ausmi-overlay")?.classList.remove("show"); }
