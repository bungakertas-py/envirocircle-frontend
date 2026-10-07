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
const MODELS = {
  gfs:         { base: "../backend/atmosight/data/output/gfs/",                 label: "GFS - 28 km",         ekstra: true,  dx: 0.25  },
  wrf9:        { base: "../backend/atmosight/data/output/wrfchem_9km_meteo/",   label: "WRF - 12 km",         ekstra: false, dx: 0.108 },
};

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
  wrf9: true,          // keluaran meteorologi WRF-Chem 9 km dari server ITERA
};
const modelHidup = (id) => !!MODELS[id] && MODEL_AKTIF[id] === true;

// Model PAJANGAN. Sengaja cuma dipamerkan di dropdown supaya rencananya
// kelihatan, tapi MATI dan tidak bisa dipilih. Tidak ada pipeline, tidak ada
// data, tidak ada base path. Kalau nanti salah satunya betul betul digarap,
// pindahkan dia ke MODELS di atas lalu nyalakan lewat MODEL_AKTIF.
// Daftarnya dipatok user. ECMWF dipasang lagi, dan angkanya BUKAN taksiran.
// Dicek langsung ke data.ecmwf.int pada 4 Sep 2026, open data yang gratis
// cuma menyediakan SATU resolusi, ifs/0p25, yaitu 0,25 derajat atau sekitar
// 28 km. Tidak ada 0p4 lagi, dan HRES 9 km itu berbayar jadi tidak bisa
// dipakai. Angka 28 km juga sebasis dengan GFS di daftar ini, dua duanya
// 0,25 derajat.
// Aliran yang dipakai nanti "oper", berkasnya
// https://data.ecmwf.int/forecasts/<YYYYMMDD>/<HH>z/ifs/0p25/oper/
// "WRF - 9 km" DIKELUARKAN dari daftar ini 5 September 2026. Dia sudah jadi
// model sungguhan di MODELS, bukan pajangan lagi. Kalau dibiarkan di sini, dia
// muncul dua kali di dropdown, sekali hidup dan sekali mati.
const MODEL_PAJANGAN = [
  { label: "ECMWF - 28 km" },
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

async function cobaKatalog(base) {
  try { return await fetch(base + "catalog.json", { cache: "no-store" }); }
  catch (e) { return null; }        // jaringan mati
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
      dengan masalah lain, sambil menyembunyikan bahwa cirrus yang bermasalah. */
async function ambilKatalog() {
  const bolehCadangan = !!DATA_CADANGAN && MODEL_ID === MODEL_GLOBAL;
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

  const jauh = await cobaKatalog(DATA_CADANGAN);
  if (jauh && jauh.ok && umurKatalog(jauh) < umurDekat) return pakai(DATA_CADANGAN, jauh);
  if (dekatBaik) return pakai(MODEL.base, dekat);
  return null;
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
  temp_surface: {
    head: "°C",
    cells: [["0", "#2450b4", 1], ["8", "#4a97dc", 1], ["16", "#cfe4f2", 0], ["22", "#ffe08a", 0],
            ["28", "#fbaa4a", 0], ["32", "#ee7233", 0], ["36", "#d43325", 1], ["42", "#7d0d1a", 1]],
  },
  humidity_surface: {
    head: "%",
    cells: [["0", "#7a450a", 1], ["25", "#b9843a", 1], ["50", "#88b055", 0], ["70", "#359a86", 1],
            ["85", "#216bb0", 1], ["100", "#123f86", 1]],
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
function applyLevelUI() {
  const strato = mapLevel === "strato";
  document.querySelectorAll(".layer-btn[data-layer]").forEach((b) => {
    const base = b.dataset.layer;
    const has = catalog && catalog.layers[resolveLayer(base)];
    const enabled = strato ? (!!STRATO_OF[base] && !!has) : !!has;
    b.classList.toggle("disabled", !enabled);
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
    if (id !== "gfs") {
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
async function berkasAda(nama) {
  try {
    const r = await fetch(DATA_BASE + nama, { method: "HEAD", cache: "no-store" });
    return r.ok;
  } catch (e) {
    return false;
  }
}
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
    berkasAda("ausmi.json").then(function (ada) { if (ada) wAu.style.display = ""; });
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
L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}", {
  attribution: 'Tiles &copy; Esri | Data: NOAA GFS',
  // Dinaikkan dari 12 jadi 16. Zoom-in maksimum peta sekarang ikut kerapatan
  // grid model dan bisa lewat 12, dan kalau alasnya berhenti duluan yang
  // kelihatan cuma latar hitam polos. Esri World Dark Gray native sampai 16.
  maxZoom: 16, maxNativeZoom: 16,
  updateWhenZooming: false, // tunda muat tile sampai zoom selesai → animasi mulus
  keepBuffer: 4,
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
      : "";
    return `<div class="tl-tick${isDay ? " day" : ""}${edge}" style="left:${pos}%">` +
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
  const t = tombolLayer(layerKey)?.querySelector(".lb-txt");
  const nama = t ? t.textContent.trim() : "";
  let sat = String(satuan || "");
  if (!nama) { head.textContent = sat; return; }
  // Nama yang sudah tertulis di satuan tidak diulang. "ISPU" tetap "ISPU",
  // "CAPE, J/kg" jadi "CAPE · J/kg".
  const N = nama.toUpperCase(), S = sat.toUpperCase();
  if (S === N) sat = "";
  else if (S.startsWith(N + ",")) sat = sat.slice(nama.length + 1).trim();
  head.innerHTML = `<span class="lh-nama">${t.innerHTML.trim()}</span>` +
    (sat ? `<span class="lh-sep">·</span><span class="lh-sat">${escHtml(sat)}</span>` : "");
}
// Tombol ISPU dan AQI tidak punya ikon, jadi untuk dua layer itu spine tetap
// memakai ikon pengatur umum.
function tandaiSpineParameter(layerKey) {
  const ic = document.querySelector("#spine-param .sisi-ico");
  if (!ic) return;
  const bi = tombolLayer(layerKey)?.querySelector(".material-symbols-outlined");
  ic.textContent = bi ? bi.textContent.trim() : "tune";
}

function renderLegend(layerKey) {
  const def = LEGENDS[layerKey];
  const head = $("legend-head"), cells = $("legend-cells");
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
  buildTicks();
  const slider = $("time-slider");
  if (slider) slider.max = String(frames.length - 1);
  // Index frame tak sebanding antar-layer (harian ~8 frame vs per-jam ~27). Selalu
  // resolve ulang ke frame terdekat "sekarang" agar tak melompat ke awal data.
  current = nearestNowIndex();
  showFrame(current);
  syncIsobars();                 // isobar auto muncul/lepas mengikuti layer Tekanan
  // panel titik ikut variabel aktif
  if (pointData && lastPoint && $("point-panel")?.classList.contains("open"))
    renderPoint(pointData, lastPoint.lat, lastPoint.lon);
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
  refreshCityIcons();                    // label kota (+ikon bila aktif) ikut waktu aktif
  if (cyclonesOn) refreshCyclones();     // siklon + jalur ikut waktu aktif
  if (itczOn) refreshItcz();             // zona ITCZ ikut waktu aktif
  if (mjoOn) { refreshMjo(); mjoIsiNote(); }   // amplop MJO ikut waktu aktif
  if (activeLayer === "pressure_surface") refreshIsobars();   // isobar ikut waktu aktif
  segarkanSkewT();   // kartu Skew-T ikut jam yang sedang tampil
  updateHash();
}

function togglePlay() {
  playing = !playing;
  $("play-icon").textContent = playing ? "pause" : "play_arrow";
  if (playing) {
    playTimer = setInterval(async () => { await showFrame(current + 1); }, 1100);
  } else {
    clearInterval(playTimer);
  }
}

// ================= POINT DETAIL =================
let pointData = null;      // { meta, vars: {name:{arr,scale,offset}} }
let pointLoading = null;
let pointMarker = null;
let sharedPoint = null;    // {lat,lon,name} titik aktif → dipakai untuk link Bagikan
let lastPoint = null;      // untuk export CSV
const MS_TO_KT = 1.943844;
const DIRS = ["U", "TL", "T", "TG", "S", "BD", "B", "BL"]; // 8 arah dari Utara searah jarum jam

async function loadPointData() {
  if (pointData) return pointData;
  if (pointLoading) return pointLoading;
  pointLoading = (async () => {
    const meta = await fetch(DATA_BASE + "point_meta.json").then((r) => r.json());
    const gz = await fetch(DATA_BASE + "point_data.bin.gz").then((r) => r.arrayBuffer());
    const stream = new Blob([gz]).stream().pipeThrough(new DecompressionStream("gzip"));
    const buf = await new Response(stream).arrayBuffer();
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
let profileData = null;      // { meta, vars:{t,r,u,v} }
let profileLoading = null;

async function loadProfileData() {
  if (profileData) return profileData;
  if (profileLoading) return profileLoading;
  profileLoading = (async () => {
    const meta = await fetch(DATA_BASE + "profile_meta.json").then((r) => r.json());
    const gz = await fetch(DATA_BASE + "profile.bin.gz").then((r) => r.arrayBuffer());
    const stream = new Blob([gz]).stream().pipeThrough(new DecompressionStream("gzip"));
    const buf = await new Response(stream).arrayBuffer();
    const vars = {};
    for (const v of meta.vars) {
      const Ctor = v.dtype === "uint8" ? Uint8Array : Int16Array;
      vars[v.var] = { arr: new Ctor(buf, v.byteOffset, v.byteLength / Ctor.BYTES_PER_ELEMENT),
                      scale: v.scale, offset: v.offset };
    }
    profileData = { meta, vars };
    return profileData;
  })();
  return profileLoading;
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
  const svgEl = wrap && wrap.querySelector("svg");   // svg PERTAMA = plot (bukan swatch legenda)
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
    it(line("#074173", "4 3"), "Jalur parcel") +
    it(barbSw, "Angin (barbs)") +
    it(line("#0029d7", "5 3"), "LCL · dasar awan") +
    it(line("#d97706", "5 3"), "LFC · mulai konveksi") +
    it(line("#7a1fa2", "5 3"), "EL · puncak konveksi") +
    it(box("rgba(226,35,32,.30)"), "CAPE · energi naik") +
    it(box("rgba(35,96,200,.25)"), "CIN · penghambat") +
    `</div>`;
}

// Kotak indeks konvektif di bawah diagram.
function skewtIndexBox(d) {
  const fmtP = (p) => p ? Math.round(p) + " hPa" : "–";
  const capeCol = d.cape > 2500 ? "#d61f1f" : d.cape > 1000 ? "#e8590c" : d.cape > 300 ? "#f59f00" : "#2b8a3e";
  const cell = (label, val, col) =>
    `<div class="skt-cell"><span class="skt-k">${label}</span><span class="skt-v" style="color:${col || "#074173"}">${val}</span></div>`;
  return `<div class="skt-idx">` +
    cell("CAPE", Math.round(d.cape) + " J/kg", capeCol) +
    cell("CIN", Math.round(d.cin) + " J/kg", d.cin < -50 ? "#e8590c" : "#4A6685") +
    cell("LCL", fmtP(d.lcl.p)) +
    cell("LFC", fmtP(d.lfc)) +
    cell("EL", fmtP(d.el)) +
    cell("LI", d.li !== null ? d.li.toFixed(1) : "–", d.li !== null && d.li < -2 ? "#d61f1f" : "#4A6685") +
    `</div>`;
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

async function bukaSkewT(lat, lon) {
  const ov = $("skt-overlay"), isi = $("skt-card")?.querySelector(".skt-isi");
  if (!ov || !isi) return;
  sktTitik = { lat, lon };
  ov.classList.add("show");
  isi.innerHTML = skewtSkeleton();
  let pd;
  try { pd = await loadProfileData(); }
  catch (e) { isi.innerHTML = `<div class="skt-load">Profil belum tersedia untuk model ini.</div>`; return; }
  if (!ov.classList.contains("show")) return;          // keburu ditutup
  const ti = profileTimeIndex(pd);
  const prof = sampleProfile(pd, lat, lon, ti);
  const d = window.SkewT.derive(prof);
  isi.innerHTML =
    `<div class="skt-kepala">` +
      `<span class="skt-tag">Profil Atmosfer · Skew-T</span>` +
      `<span class="skt-koord mono">${fmtCoord(lat, lon)}</span>` +
    `</div>` +
    `<div class="skt-badan">` +
      `<div class="skt-kiri">` +
        window.SkewT.svg(d, { W: 340, H: 380 }) +
      `</div>` +
      `<div class="skt-kanan">` +
        `<div class="skt-note">Profil ${fmtValid(pd.meta.times[ti])} · indikasi model GFS (grid ~1°), bukan sounding asli.</div>` +
        skewtIndexBox(d) +
        skewtLegend() +
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
    bukaSkewT(sktTitik.lat, sktTitik.lon);
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
      return { label: "Kecepatan Angin", unit: "kt", color: "#0029d7", type: "line",
               times, values: u.map((uu, i) => Math.sqrt(uu * uu + v[i] * v[i]) * MS_TO_KT) };
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

async function openPoint(lat, lon, label, isMe) {
  ++pointToken; // titik baru → batalkan reverse-geocode titik sebelumnya
  const pp = $("point-panel");
  if (pp) { pp.classList.add("open"); pp.classList.remove("hidden"); }
  $("pt-reopen")?.classList.remove("show");
  // Marker: ikon "orang" (kamu di sini) utk geolokasi, belah-ketupat utk titik lain.
  if (pointMarker) map.removeLayer(pointMarker);
  const html = isMe
    ? '<span class="pm-me"><span class="material-symbols-outlined">person</span></span>'
    : '<span class="pm-diamond"></span>';
  const sz = isMe ? 32 : 20;
  pointMarker = L.marker([lat, lon], {
    icon: L.divIcon({ className: "point-mark", html, iconSize: [sz, sz], iconAnchor: [sz / 2, sz / 2] }),
    interactive: false, pane: "labels",
  }).addTo(map);
  setPointLabel(label || fmtCoord(lat, lon), label ? "addr" : "coord");
  sharedPoint = { lat, lon, name: label || null };
  updateHash();
  const body = $("pt-body"); if (body) body.innerHTML = pointSkeleton();
  try {
    renderPoint(await loadPointData(), lat, lon);
  } catch (e) {
    if (body) body.innerHTML = '<div class="pt-loading">Gagal memuat data titik.</div>';
    console.error(e);
  }
}

// Skeleton panel titik: tulang shimmer per-kontainer (ringkasan, chip, kartu
// 3-hari, grafik, tabel) meniru layout renderPoint — dipakai saat data dimuat.
function pointSkeleton() {
  const bar = (cls, w) => `<span class="sk-bar${cls ? " " + cls : ""}"${w ? ` style="width:${w}"` : ""}></span>`;
  return '<div class="pt-skel">' +
    `<div class="pt-skel-lines">${bar("", "100%")}${bar("", "94%")}${bar("", "60%")}</div>` +
    `<div class="pt-skel-chips">${bar()}${bar()}</div>` +
    bar("pt-skel-sec") +
    `<div class="pt-skel-cards">${bar()}${bar()}${bar()}</div>` +
    bar("pt-skel-sec") +
    bar("pt-skel-chart") +
    bar("pt-skel-sec") +
    `<div class="pt-skel-rows">${bar("", "100%")}${bar("", "100%")}${bar("", "100%")}${bar("", "100%")}${bar("", "100%")}</div>` +
    '</div>';
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

function renderPoint(pd, lat, lon) {
  const times = pd.meta.times;
  const u = sampleVar(pd, "u", lat, lon), v = sampleVar(pd, "v", lat, lon);
  const temp = sampleVar(pd, "temp", lat, lon), rain = sampleVar(pd, "rain", lat, lon);
  const rh = sampleVar(pd, "humidity", lat, lon), cloud = sampleVar(pd, "cloud", lat, lon);
  const pres = sampleVar(pd, "pressure", lat, lon), cape = sampleVar(pd, "cape", lat, lon);
  const wind = u && v ? u.map((uu, i) => windAt(uu, v[i])) : null;
  lastPoint = { lat, lon, times, temp, rain, wind, rh, cloud, pres };

  // Kolom disusun dari variabel yang MEMANG ada. Model WRF tak punya tutupan
  // awan, dan kolom berisi "–" dari atas sampai bawah cuma memakan lebar.
  const kolom = [
    ["Tgl/Jam", (i) => fmtHour(times[i])],
    temp && ["°C", (i) => temp[i].toFixed(1)],
    wind && ["Angin", (i) => Math.round(wind[i].spd) + " " + wind[i].dir],
    rain && ["mm/j", (i) => rain[i].toFixed(1)],
    rh && ["RH%", (i) => Math.round(rh[i])],
    cloud && ["Awan%", (i) => Math.round(cloud[i])],
    pres && ["hPa", (i) => Math.round(pres[i])],
  ].filter(Boolean);
  let rows = "";
  for (let i = 0; i < times.length; i++) {
    rows += "<tr>" + kolom.map(([, f]) => `<td>${f(i)}</td>`).join("") + "</tr>";
  }
  const ci = currentTimeIndex(pd);
  const extras =
    `<div class="pt-summary">${pointSummary(times, temp, rain, cloud, wind, rh, ci)}</div>` +
    `<div class="pt-advice">${pointAdvice(times, rain, cloud, wind, ci)}</div>` +
    stormChip(cape, ci) +
    `<div class="pt-sec">PRAKIRAAN 3 HARI</div><div class="fc-cards">${dailyCards(times, temp, rain, cloud, ci)}</div>`;
  const spec = chartSeries(pd, lat, lon);
  $("pt-body").innerHTML = extras +
    `<div class="pt-sec">${spec.label.toUpperCase()} <span>${spec.unit}</span></div>${chartSVG(spec)}${chartLegend(warnaDeret())}` +
    `<div class="pt-sec">DATA PER-JAM (WIB)</div>` +
    `<div class="pt-table-wrap"><table class="pt-table"><thead><tr>` +
    kolom.map(([h]) => `<th>${h}</th>`).join("") +
    `</tr></thead><tbody>${rows}</tbody></table></div>` +
    // KARTU LIPAT SKEW-T DIBUANG DARI SINI 4 Oktober 2026, diminta user.
    // Dulu dia duduk di kaki panel ini, jadi orang harus mengklik peta dulu,
    // menggulir sampai dasar, baru menemukannya. Sekarang dia alat sendiri di
    // kartu Fitur, dipilih dulu lalu titiknya ditunjuk, dan hasilnya tampil
    // di kartu tengah layar. Cari MODE SKEW-T di bawah.
    "";
}

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

function closePoint() {
  $("point-panel")?.classList.remove("open", "hidden");
  $("pt-reopen")?.classList.remove("show");
  if (pointMarker) { map.removeLayer(pointMarker); pointMarker = null; }
  sharedPoint = null;
  updateHash();
}
function hidePoint() {           // sembunyikan panel, marker & data tetap
  $("point-panel")?.classList.add("hidden");
  $("pt-reopen")?.classList.add("show");
}
function reopenPoint() {
  $("point-panel")?.classList.remove("hidden");
  $("pt-reopen")?.classList.remove("show");
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
  el.textContent = SUMBER_CADANGAN ? "GitAction" : "cirrus";
  const wadah = $("fresh-src");
  if (wadah) {
    wadah.title = SUMBER_CADANGAN
      ? "Kiriman server cirrus belum masuk lebih dari 24 jam, jadi situs memakai cadangan yang dimasak GitHub Actions"
      : "Data dari server cirrus, lewat hostingan ini sendiri";
  }
  const badge = $("data-fresh");
  if (badge) badge.dataset.sumber = SUMBER_CADANGAN ? "cadangan" : "cirrus";
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
function toast(msg) {
  const el = $("toast"); if (!el) return;
  el.textContent = msg; el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
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
      openPoint(la, lo, p.get("n") || null);
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
  openPoint(lat, lon, name);
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

   KONSEKUENSINYA SUDAH DIUKUR DAN DITERIMA USER. Dengan jendela penuh dan
   ambang 0,5 mm, yang berdenyut 24,5 persen kota di GFS dan 35,4 persen di
   WRF. Itu banyak. Kalau suatu saat terasa terlalu ramai, yang disetel
   ALARM_AMBANG atau jendelanya dipendekkan, bukan tandanya yang dikecilkan. */
var ALARM_AMBANG = 0.5;   // mm, batas disebut hujan. Sama dengan cityCondition.
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
// SENGAJA bukan point_data.bin.gz. Berkas itu 21 MB (seluruh grid 473x265), padahal
// label cuma butuh 514 titik. city_data.json sudah disampel di backend: ~100 KB
// terkirim. point_data tetap ada, tapi kembali malas: baru diunduh saat pengguna
// mengklik peta atau membuka Skew-T.
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
      icon: L.divIcon({ className: "city-cond" + (cityIconsOn ? "" : " no-ico"),
        iconSize: [30, 30], iconAnchor: [15, 15],
        html: ico + alarmHtml(c.alarm, cityShortName(c.p.n)) +
              `<span class="cc-lbl"><b>${escHtml(cityShortName(c.p.n))}</b>` +
              (c.val ? `<i>${escHtml(c.val)}</i>` : "") + `</span>` }),
    });
    m.on("click", (e) => { L.DomEvent.stopPropagation(e); openPoint(c.p.lat, c.p.lon, c.p.n); });
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

// Label kota selalu ada sejak peta dibuka. point_data dimuat di latar, jadi peta
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
    m.on("click", (e) => { L.DomEvent.stopPropagation(e); openPoint(cur.lat, cur.lon, tr.name); });
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
  if (!itczOn || !itcz || !itcz.times || !frames[current]) return;
  const ti = itcz.times.indexOf(frames[current].valid_time);
  if (ti < 0) return;                         // waktu lampau → tak ada garis
  for (const sg of itcz.frames[ti] || []) {
    if (sg.length < 2) continue;
    // Pita zona: tepi utara (maju) + tepi selatan (mundur) → poligon terisi.
    const ring = [];
    for (const p of sg) ring.push([p[2], p[0]]);                // [latN, lon]
    for (let i = sg.length - 1; i >= 0; i--) ring.push([sg[i][3], sg[i][0]]); // [latS, lon]
    L.polygon(ring, { pane: "itcz", color: ITCZ_COLOR, weight: 1, opacity: 0.35,
      fillColor: ITCZ_COLOR, fillOpacity: 0.2, interactive: false }).addTo(itczGroup);
    // Garis sumbu: casing putih (kontras di latar gelap/terang) + garis teal putus.
    const axis = sg.map((p) => [p[1], p[0]]);
    L.polyline(axis, { pane: "itcz", color: "#ffffff", weight: 6, opacity: 0.35,
      interactive: false, lineCap: "round", lineJoin: "round" }).addTo(itczGroup);
    L.polyline(axis, { pane: "itcz", color: ITCZ_COLOR, weight: 3, opacity: 0.95,
      dashArray: "7 5", interactive: false, lineCap: "round", lineJoin: "round" }).addTo(itczGroup);
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
let mjoLokal = null;            // hasil hitung sendiri, per model, dihitung sekali
let mjoSibuk = false;

async function loadMjo() {
  if (mjo) return mjo;
  if (!mjoLoading) mjoLoading = fetch(DATA_BASE + "mjo.json")
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => (mjo = j || { kosong: true }))
    .catch(() => (mjo = { kosong: true }));
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
    const pd = await loadProfileData();
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
  if (mjoLokal && profileData) return mjoLokal[profileTimeIndex(profileData)] || null;
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
function mjoOktagon(ix, jejak) {
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
      if (sisip && !mjoPunyaAmplop() && !profileData) sisip.textContent = "Sedang menghitung dari profil model.";
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
  if (MODEL_ID !== "gfs" && !ambilTiket()) {
    const boleh = await mintaSandi(MODEL.label);
    if (!boleh) { location.replace(location.pathname); return; }
  }
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
    activeLayer = cat.layers["wind_surface"] ? "wind_surface" : avail[0];
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
          if (playing) togglePlay();
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
    terapkanFiturModel();    // sembunyikan fitur yang tak punya data di model ini
    setupLevelSelect();      // hidupkan dropdown LEVEL kalau data strato ada

    // Bingkai tampilan = kotak inti (VIEW_CORE) yang diperlebar pada sumbu yang
    // perlu hingga RASIONYA sama dengan jendela desktop. Efeknya: seluruh wilayah
    // inti (India–Pasifik Barat, Cina Selatan–tengah Australia) mengisi layar
    // penuh, tanpa bar kosong dan tanpa terpotong; tepi domain data (yang lebih
    // luas) tak pernah terlihat. Dihitung ulang tiap kali jendela di-resize.
    function frameRegion() {
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
        if (playing) togglePlay();
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
      if (skewtMode) { setSkewtMode(false); bukaSkewT(e.latlng.lat, e.latlng.lng); }
      else openPoint(e.latlng.lat, e.latlng.lng);
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
    /* Escape mematikan modenya kalau kartunya belum terbuka, dan menutup
       kartunya kalau sudah. Dua duanya jalan keluar yang orang harapkan. */
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if ($("hov-overlay")?.classList.contains("show")) tutupHovmoller();
      if ($("ausmi-overlay")?.classList.contains("show")) tutupAusmi();
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
            + (src.classList.contains("disabled") ? " disabled" : "");
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

// Chip nama parameter aktif di tengah atas.
function updateParChip() {
  const el = $("par-chip");
  if (!el) return;
  if (!HP()) { el.hidden = true; return; }
  const src = document.querySelector(`.layer-btn[data-layer="${activeBase}"]`);
  if (!src) { el.hidden = true; return; }
  el.hidden = false;
  el.innerHTML = `<span class="material-symbols-outlined">${ikonDari(src)}</span>${labelDari(src)}`;
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

function ausmiPunya() { return !!(ausmiData && ausmiData.kini); }

function muatAusmi() {
  if (ausmiData) return Promise.resolve(ausmiData);
  if (!ausmiMuat) {
    ausmiMuat = fetch(DATA_BASE + "ausmi.json", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => (ausmiData = j))
      .catch(() => (ausmiData = null));
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
    sisip.textContent = `Klimatologi ${ki.periode || "-"}, ${ki.sumber || "-"}.`
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
