/* =====================================================================
   Envirocircle — animasi masuk hero (GSAP)

   Top bar dan tombol tetap pudar plus geser sedikit. Dua baris judulnya
   MELUNCUR MASUK dari luar bingkai, "Precise" dari kiri dan "Forecast." dari
   bawah. Keduanya tidak dipudarkan, sebab waktu masih di luar bingkai memang
   sudah tak terlihat, dan memudarkan sekalian malah bikin geraknya terasa
   ragu. Yang mengurung mereka `overflow: hidden` di .hero.

   GSAP dipasang lewat npm lalu berkas jadinya disalin ke vendor/, sebab
   halaman ini statis tanpa bundler. Lihat CARA-PASANG.md.
   ===================================================================== */
(function () {
  "use strict";

  var hero = document.querySelector(".hero");
  if (!hero) return;

  /* Semua sasaran animasi. Urutannya = urutan munculnya. */
  var sasaran = {
    top:    document.querySelectorAll(".hero-top [data-anim='top']"),
    baris:  hero.querySelectorAll(".hero-title .hl-in"),
    tbl:    hero.querySelectorAll(".hero-foot .pill"),
    kontur: hero.querySelector(".hero-contour")
  };

  /* Jaring pengaman. Kalau GSAP gagal dimuat, teksnya jangan ikut hilang,
     sebab keadaan awal opacity 0 dipasang dari CSS. */
  function tampilkanSaja() {
    /* Sejak top bar keluar dari .hero, selektornya TIDAK BOLEH lagi diawali
       .hero, kalau tidak jaring pengaman ini melewatkan seluruh isi bar. */
    /* WAJIB menyebut .pc, bukan .hl-in. Sejak judul dipecah jadi potongan,
       keadaan awal opacity 0 dipasang pada .pc. Sempat ketinggalan dan
       akibatnya SELURUH JUDUL tak terlihat kalau GSAP gagal dimuat. */
    var semua = document.querySelectorAll(
      "[data-anim], .hero .hero-title .pc, .hero .hero-contour, [data-sc]");
    for (var i = 0; i < semua.length; i++) {
      semua[i].style.opacity = "1";
      semua[i].style.transform = "none";
    }
    /* Tanpa animasi, titik tidak pernah berpindah ke slot i. Kalau dibiarkan,
       yang terbaca "Precıse" tanpa titik, kelihatan seperti salah ketik.
       Jadi batangnya dikembalikan jadi "i" bertitik apa adanya. */
    var bi = document.querySelector(".pc-i");
    if (bi) bi.textContent = "i";
  }

  /* Kotak TEKS, bukan kotak elemen. .hl-in itu display:block jadi kotaknya
     selebar judul. Kotak dari Range juga kotak FONT (ascent + descent), jadi
     baseline = kotak.atas + fontBoundingBoxAscent. Dua duanya jebakan yang
     sudah pernah kena. */
  function kotakTeks(el) {
    var r = document.createRange();
    r.selectNodeContents(el);
    var b = r.getBoundingClientRect();
    return b.width ? b : el.getBoundingClientRect();
  }

  /* Hitung ke mana titik harus mendarat supaya jadi titik huruf i yang benar.
     SEMUA dari metrik font, tidak ada angka karangan. */
  function ukurTitik() {
    var h1 = document.querySelector(".hero-title");
    var pcI = document.querySelector(".pc-i");
    var dot = document.querySelector(".fc-dot");
    if (!h1 || !pcI || !dot) return null;

    var cs = getComputedStyle(h1);
    var m = document.createElement("canvas").getContext("2d");
    m.font = cs.fontWeight + " " + cs.fontSize + " " + cs.fontFamily;
    var mi = m.measureText("i"), ms = m.measureText("\u0131"), mp = m.measureText(".");
    if (!mi.actualBoundingBoxAscent || !mi.fontBoundingBoxAscent) return null;

    /* Daerah titik "i" = antara puncak ink "i" dan puncak ink "ı". */
    var pusatTitik = mi.actualBoundingBoxAscent
                   - (mi.actualBoundingBoxAscent - ms.actualBoundingBoxAscent) / 2;
    /* Pusat ink titik "." kalau ia digambar duduk di baseline. */
    var pusatPeriod = mp.actualBoundingBoxAscent
                    - (mp.actualBoundingBoxAscent + mp.actualBoundingBoxDescent) / 2;
    var xDalamI  = (-mi.actualBoundingBoxLeft + mi.actualBoundingBoxRight) / 2;
    var xPeriod  = (-mp.actualBoundingBoxLeft + mp.actualBoundingBoxRight) / 2;

    var kI = kotakTeks(pcI), kD = kotakTeks(dot);
    var asc = mi.fontBoundingBoxAscent;
    var base1 = kI.top + asc;                  // baseline baris "Precise"
    var base2 = kD.top + asc;                  // baseline baris "Forecast"
    return {
      dx: (kI.left + xDalamI) - (kD.left + xPeriod),
      dy: (base1 - pusatTitik) - (base2 - pusatPeriod),
      /* "Lantai" tempat bola memantul, yaitu baseline baris Precise. Dihitung
         supaya SISI BAWAH ink titik yang menyentuhnya, bukan pusatnya. */
      dyLantai: base1 - (base2 + mp.actualBoundingBoxDescent),
      em: parseFloat(cs.fontSize),
      atasTitik: kD.top,
      poros: porosT(m, asc)
    };
  }

  /* Poros putar huruf t, di PERSILANGAN palang mendatar dan batang tegaknya.
     Mendatar diambil dari pusat ink huruf t, sebab palangnya memanjang kira
     kira sama ke kiri dan ke kanan batang. Menegak diambil dari TINGGI-X,
     yaitu tinggi huruf "x", sebab di situlah palang huruf t duduk.
     Dipulangkan relatif terhadap kotak elemen, bukan layar, sebab
     transform-origin dihitung dari situ. */
  function porosT(m, asc) {
    var fcT = document.querySelector(".fc-t");
    if (!fcT) return null;
    var mt = m.measureText("t"), mx = m.measureText("x");
    var kT = kotakTeks(fcT);                 // kotak FONT
    var rT = fcT.getBoundingClientRect();    // kotak ELEMEN
    var pusatInk = (-mt.actualBoundingBoxLeft + mt.actualBoundingBoxRight) / 2;
    return {
      x: (kT.left + pusatInk) - rT.left,
      y: (kT.top + asc - mx.actualBoundingBoxAscent) - rT.top
    };
  }

  if (!window.gsap) { tampilkanSaja(); return; }

  var diam = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (diam) { tampilkanSaja(); return; }

  showcase();

  function jalan() {
    var tl = window.gsap.timeline({ defaults: { ease: "power3.out" } });

    /* WAJIB fromTo, bukan from. Keadaan awal opacity 0 sudah dipasang dari CSS
       biar teksnya tidak berkedip sebelum GSAP siap. Kalau pakai from(), GSAP
       membaca nilai sekarang sebagai TUJUAN, jadi dia beranimasi dari 0 ke 0
       dan teksnya tidak pernah muncul. */
    /* Tombol punya `transition: transform .1s` di CSS buat efek ditekan.
       Kalau dibiarkan, tiap frame yang ditulis GSAP kena eased ULANG oleh CSS
       dan geraknya jadi lembek serta telat. Transisinya dimatikan selama
       animasi masuk, lalu dikembalikan setelah selesai. */
    function masuk(el, y, dur, geser, jeda) {
      tl.fromTo(el,
        { opacity: 0, y: y },
        {
          opacity: 1, y: 0, duration: dur, stagger: geser,
          onStart: function () { window.gsap.set(this.targets(), { transition: "none" }); },
          onComplete: function () { window.gsap.set(this.targets(), { clearProps: "transition,transform" }); }
        },
        jeda);
    }

    var pcA = hero.querySelector(".pc-a");     // "Prec"
    var pcI = hero.querySelector(".pc-i");     // batang i tanpa titik
    var pcB = hero.querySelector(".pc-b");     // "se"
    var fcA = hero.querySelector(".fc-a");     // "Foreca"
    var fcT = hero.querySelector(".fc-t");     // "t", yang menendang
    var dot = hero.querySelector(".fc-dot");   // titik, jadi titik i di akhir
    var baris = hero.querySelectorAll(".hero-title .hl-in");

    var b1 = kotakTeks(baris[0]);
    var b2 = kotakTeks(baris[1]);
    var keluarKiri = -(b1.right + 60);         // +60 supaya benar benar lewat tepi
    var keluarBawah = (window.innerHeight - b2.top) + 60;

    var BUMP = "back.out(1.9)";                // rasa "bump", melewati lalu balik

    masuk(sasaran.top, -10, 0.5, 0.06, 0);

    /* ---- 1. "Precise" masuk DUA TAHAP dari kiri.
       "se" duluan, menyisakan rongga selebar "Prec" dan slot i. Baru "Prec"
       menyusul. Slot i sengaja dibiarkan kosong, titik dan batangnya datang
       jauh belakangan. */
    tl.fromTo(pcB, { opacity: 1, x: keluarKiri },
                   { x: 0, duration: 0.85, ease: BUMP, clearProps: "transform" }, 0.12);
    tl.fromTo(pcA, { opacity: 1, x: keluarKiri },
                   { x: 0, duration: 0.85, ease: BUMP, clearProps: "transform" }, 0.34);

    /* ---- 2. "Forecast" naik dari bawah, TANPA huruf s dan TANPA titiknya.
       Huruf s menyusul paling akhir dengan gerakan stempel, dan slotnya
       sengaja dibiarkan menganga sampai saat itu. */
    tl.fromTo([fcA, fcT], { opacity: 1, y: keluarBawah },
                          { y: 0, duration: 0.9, ease: "back.out(1.7)" }, 0.62);

    masuk(sasaran.tbl, 18, 0.6, 0, 1.05);

    koreografiTitik(tl, {
      pcI: pcI, fcT: fcT, dot: dot,
      fcS: hero.querySelector(".fc-s"),
      dot2: hero.querySelector(".fc-dot2")
    });

    /* Kontur PM2.5 muncul setelah DUA KATA-nya mendarat, bukan menunggu
       seluruh urusan titik yang berlangsung sampai detik ke-4. Kalau menunggu
       itu, latarnya kosong terlalu lama.
       Yang dipudarkan kanvasnya, bukan isinya, jadi tak ada ongkos tambahan
       di gelung gambar. Keadaan awal opacity 0 dipasang dari CSS. */
    if (sasaran.kontur) {
      tl.fromTo(sasaran.kontur,
        { opacity: 0 },
        { opacity: 1, duration: 1.1, ease: "power2.out" },
        1.60);
    }

    /* Dipakai waktu verifikasi headless. Chrome headless tidak menjalankan
       animasi sampai selesai, jadi keadaan akhir diperiksa lewat progress(1). */
    window.__heroTl = tl;
    return tl;
  }

  /* ---- Koreografi titik ----
     Urutan yang diminta user:
     1. Titik JATUH dari luar layar atas, mendarat seperti stempel (menggepeng
        sesaat lalu balik).
     2. Huruf t MENENDANG titik itu. Titik melesat ke arah slot i di "Precise",
        singgah dulu di BAWAH teks.
     3. Batang i MUNCUL DARI BAWAH seperti keluar dari tanah, dengan bump.
     4. Titik bereaksi, memantul naik, lalu hinggap bump tepat di posisi titik
        huruf i.

     Titik ini SENGAJA tidak di-clearProps di akhir. Dia harus tetap tinggal
     di posisi barunya, sebab sejak saat itu dialah titik huruf i. */
  function koreografiTitik(tl, el) {
    var pcI = el.pcI, fcT = el.fcT, dot = el.dot, fcS = el.fcS, dot2 = el.dot2;
    if (!pcI || !fcT || !dot) return;
    var u = ukurTitik();
    if (!u) { pcI.textContent = "i"; window.gsap.set(dot, { opacity: 1 }); return; }

    var g = window.gsap;
    var jatuhDari = -(u.atasTitik + 1.1 * u.em);   // berangkat dari LUAR bingkai atas
    var puncak    = u.dy - 0.75 * u.em;            // puncak lambungan melengkung
    var puncak2   = u.dy - 0.80 * u.em;            // puncak pentalan lurus

    /* Gerakan STEMPEL: datang besar dari depan, membanting mengecil, lalu
       menggepeng sesaat dan balik. Dipakai huruf s dan titik pengganti. */
    function stempel(e, mulai) {
      if (!e) return;
      tl.fromTo(e, { opacity: 1, scale: 2.6, rotation: -7 },
                   { scale: 1, rotation: 0, duration: 0.24, ease: "power4.in",
                     transformOrigin: "50% 100%", immediateRender: false }, mulai);
      tl.to(e, { scaleX: 1.18, scaleY: 0.84, duration: 0.07, ease: "power2.out" }, mulai + 0.24);
      tl.to(e, { scaleX: 1, scaleY: 1, duration: 0.30, ease: "back.out(3.2)",
                 clearProps: "transform" }, mulai + 0.31);
    }

    /* immediateRender WAJIB false. Bawaannya true, artinya keadaan awal
       dipasang SEKETIKA saat tween dibuat, bukan saat mulai, dan akibatnya
       elemennya sudah kelihatan sejak detik nol. */

    /* ---- 1. Titik jatuh dari luar bingkai, mendarat seperti stempel ---- */
    tl.fromTo(dot, { opacity: 1, y: jatuhDari },
                   { y: 0, duration: 0.44, ease: "power2.in",
                     immediateRender: false }, 1.50);
    tl.to(dot, { scaleX: 1.34, scaleY: 0.5, duration: 0.09, ease: "power2.out",
                 transformOrigin: "50% 100%" }, 1.94);
    tl.to(dot, { scaleX: 1, scaleY: 1, duration: 0.30, ease: "back.out(3.6)" }, 2.03);

    /* ---- 2. Huruf t MENGAYUN JAUH ke belakang, baru menendang ----
       50 derajat, diminta user. Poros di dasar huruf jadi terasa seperti kaki. */
    /* Poros di persilangan palang dan batang, jadi ayunannya seperti jarum jam
       yang berputar pada porosnya, bukan seperti tiang yang miring dari dasar. */
    var poros = u.poros ? (u.poros.x + "px " + u.poros.y + "px") : "50% 100%";
    tl.set(fcT, { transformOrigin: poros }, 2.28);
    tl.to(fcT, { rotation: 50, duration: 0.34, ease: "power2.out" }, 2.28);
    tl.to(fcT, { rotation: -24, duration: 0.10, ease: "power3.in" }, 2.62);
    tl.to(fcT, { rotation: 0, duration: 0.48, ease: "back.out(2.4)",
                 clearProps: "transform" }, 2.74);

    /* ---- 3. Lambungan melengkung, lalu pantulan LURUS DI TEMPAT ----
       Sumbu x diselesaikan TEPAT saat bola menyentuh lantai. Dulu x masih
       berjalan selama memantul, jadi tiap pantulan bolanya menggeser ke
       samping dan terlihat seperti glitch. Pantulannya juga tidak lagi
       memakai ease bounce, tapi hop naik turun tegak yang tingginya mengecil,
       supaya lintasannya benar benar lurus. */
    var LAJU = 0.55;
    /* Poros dikembalikan ke tengah. Gerakan stempel tadi menyetelnya ke dasar
       bawah, dan warisan itu merusak apa pun yang memutar atau menyekala
       sesudahnya. Aman disetel di sini sebab pada detik ini skala dan
       rotasinya sudah kembali normal, jadi tidak ada lompatan tampilan. */
    tl.set(dot, { transformOrigin: "50% 50%" }, 2.68);
    tl.to(dot, { x: u.dx, duration: LAJU, ease: "none" }, 2.70);
    tl.to(dot, { y: puncak, duration: 0.24, ease: "power2.out" }, 2.70);
    tl.to(dot, { y: u.dyLantai, duration: LAJU - 0.24, ease: "power2.in" }, 2.94);

    var tPantul = 2.70 + LAJU;               // saat menyentuh lantai
    [[0.30, 0.17], [0.13, 0.115], [0.05, 0.075]].forEach(function (h) {
      var naik = h[0] * u.em, lama = h[1];
      tl.to(dot, { y: u.dyLantai - naik, duration: lama, ease: "power2.out" }, tPantul);
      tl.to(dot, { y: u.dyLantai, duration: lama, ease: "power2.in" }, tPantul + lama);
      tPantul += lama * 2;
    });

    /* ---- 4. Batang i naik dari bawah baseline, titik TERPENTAL LURUS ----
       Pentalannya sengaja lurus, tanpa lengkung, sebab x sudah di tempat dan
       yang digerakkan hanya y. Titik MENGGANTUNG di atas selama batang i
       menyelesaikan bump-nya, baru turun setelah itu. */
    tl.fromTo(pcI, { opacity: 1, y: 0.62 * u.em },
                   { y: 0, duration: 0.55, ease: "back.out(2.4)",
                     clearProps: "transform", immediateRender: false }, 4.02);
    tl.to(dot, { y: puncak2, duration: 0.30, ease: "power2.out" }, 4.04);
    /* Turun ke posisinya, lalu bump memantul KE ATAS.
       Dulu memakai ease back.out, dan itu MELEWATI sasaran dulu baru balik,
       jadi titiknya sempat turun sampai ke badan huruf i. Batas bawah
       penurunan HARUS posisi titik i yang sebenarnya, tidak boleh lebih.
       Jadi bump-nya dibuat sebagai pantulan kecil ke atas setelah mendarat,
       bukan sebagai lewatan ke bawah.

       TANPA rotation juga. Titik masih memakai transform-origin warisan
       gerakan stempel, dan rotasi di poros dasar memutarinya mengelilingi
       poros itu, bukan berputar di tempat, sehingga posisinya terlempar ke
       samping. Lagipula titik ini bundar, diputar berapa pun sama saja. */
    var tTurun = 4.57;                    // 4.02 + 0.55, tepat saat i selesai bump
    tl.to(dot, { y: u.dy, duration: 0.28, ease: "power2.in" }, tTurun);
    [[0.100, 0.11, 0.14], [0.032, 0.06, 0.06]].forEach(function (h) {
      var naik = h[0] * u.em, atas = h[1], bawah = h[2];
      tl.to(dot, { y: u.dy - naik, duration: atas, ease: "power2.out" }, tTurun + 0.28);
      tl.to(dot, { y: u.dy, duration: bawah, ease: "power2.in" }, tTurun + 0.28 + atas);
      tTurun += atas + bawah;
    });

    /* ---- 5. Huruf s dan titik pengganti, dua duanya di-stamp ----
       Titik aslinya sudah pergi jadi titik huruf i, jadi tanpa ini "Forecast"
       berakhir tanpa titik. */
    stempel(fcS, 5.28);
    stempel(dot2, 5.56);

    window.addEventListener("resize", function () {
      if (tl.progress() < 1) return;
      var v = ukurTitik();
      if (v) g.set(dot, { x: v.dx, y: v.dy });
    });
  }

  /* ---- Showcase, muncul saat digulir ----
     Ini pemakaian pertama ScrollTrigger, berkasnya sudah nongkrong di vendor/
     sejak 2 September tanpa pernah dipanggil.
     `once: true` disengaja. Bagian ini isinya kartu produk, bukan pertunjukan,
     jadi tidak perlu memudar lagi tiap kali digulir bolak balik.
     Kalau ScrollTrigger gagal dimuat, elemennya ditampilkan apa adanya, sebab
     keadaan awal opacity 0 dipasang dari CSS. */
  function showcase() {
    ["#showcase", "#team"].forEach(bagianGulir);
  }

  function bagianGulir(pilih) {
    var sec = document.querySelector(pilih);
    if (!sec) return;
    var sasaranSc = sec.querySelectorAll("[data-sc]");
    if (!sasaranSc.length) return;

    if (!window.gsap || !window.ScrollTrigger) {
      for (var i = 0; i < sasaranSc.length; i++) {
        sasaranSc[i].style.opacity = "1";
        sasaranSc[i].style.transform = "none";
      }
      return;
    }
    window.gsap.registerPlugin(window.ScrollTrigger);
    window.gsap.fromTo(sasaranSc,
      { opacity: 0, y: 34 },
      {
        opacity: 1, y: 0, duration: 0.7, stagger: 0.11, ease: "power3.out",
        clearProps: "transform",
        scrollTrigger: { trigger: sec, start: "top 78%", once: true }
      });
  }

  /* Tunggu Archivo Black selesai dimuat dulu. Kalau tidak, huruf tulisannya
     sempat berganti di tengah animasi dan barisnya kelihatan meloncat. */
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(jalan);
    /* Kalau fontnya lama sekali, jangan biarkan hero kosong menganga. */
    setTimeout(function () { if (!window.__heroTl) jalan(); }, 1500);
  } else {
    jalan();
  }
})();

/* =====================================================================
   Bidang top bar, dipasang begitu hero terlewat.

   Bidangnya sendiri digambar CSS di .hero-bar::before dan sudah muncul
   sendiri waktu disorot. Yang tidak bisa dikerjakan CSS cuma satu, tahu
   kapan hero sudah lewat. Itu tugas blok ini, dia cuma memasang dan
   melepas kelas .padat, tidak menyentuh warna apa pun.

   Namanya .padat, bukan .gelap seperti dulu. Waktu bidangnya masih --ink
   pekat nama itu benar, sekarang bidangnya cyan tembus pandang jadi nama
   lama itu berbohong. Yang dimaksud keadaan ini cuma satu, bidangnya sedang
   tampil.

   Diminta user, sebab bar ini beku dan ikut turun ke bagian yang latarnya
   sudah bukan putih lagi.

   IIFE TERPISAH dari blok animasi, sebab ini perilaku antarmuka biasa dan
   harus tetap jalan walau GSAP gagal dimuat atau pengguna memilih
   prefers-reduced-motion.
   ===================================================================== */
(function () {
  "use strict";
  var bar  = document.querySelector(".hero-top");
  var hero = document.querySelector(".hero");
  if (!bar || !hero) return;

  var nunggu = false;
  function periksa() {
    nunggu = false;
    bar.classList.toggle("padat", hero.getBoundingClientRect().bottom <= bar.offsetHeight);
  }
  /* Digandeng ke rAF supaya tidak menghitung ulang tiap kejadian gulir. */
  function jadwal() { if (!nunggu) { nunggu = true; requestAnimationFrame(periksa); } }

  periksa();
  window.addEventListener("scroll", jadwal, { passive: true });
  window.addEventListener("resize", jadwal);
})();

/* =====================================================================
   Korsel Showcase.

   Satu kartu lanskap di tengah, tetangganya mengintip terpotong, digeser
   pakai dua panah. Acuannya Showcase gsap.com.

   IIFE TERPISAH dari blok animasi, sebab ini perilaku antarmuka biasa dan
   harus tetap jalan walau GSAP gagal dimuat atau pengguna memilih
   prefers-reduced-motion. Kalau GSAP tidak ada, transform tetap disetel
   langsung dan .sc-rel punya transition CSS sebagai cadangan.
   ===================================================================== */
(function () {
  "use strict";
  var rel   = document.getElementById("sc-rel");
  var layar = rel && rel.parentElement;
  var kiri  = document.getElementById("sc-kiri");
  var kanan = document.getElementById("sc-kanan");
  var ket   = document.getElementById("sc-ket");
  if (!rel || !layar || !kiri || !kanan || !ket) return;

  var slide = [].slice.call(rel.querySelectorAll(".sc-slide"));
  var kap   = [].slice.call(ket.querySelectorAll(".sc-kap"));
  if (slide.length < 2) return;

  var idx = 0;
  var pelan = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var korsel = layar.parentElement;
  var ket    = document.getElementById("sc-ket");

  /* SEBERAPA BANYAK TETANGGA MENGINTIP. Diminta user, seperdelapan lebar
     kartu, tidak lebih.

     Caranya BUKAN menggeser relnya lebih jauh, tapi menyempitkan wadahnya.
     Dengan wadah selebar satu kartu + sela + seperdelapan kartu, tetangga
     otomatis terpotong pas di angka itu, dan tidak ada ruang kosong menganga
     di antara dua kartu. Kalau wadahnya dibiarkan selebar halaman, satu
     satunya cara mengecilkan intipan adalah membesarkan kartunya, dan itu
     justru keluhan yang satunya lagi. */
  var INTIP = 1 / 8;

  function ukur() {
    var w = slide[0].offsetWidth;
    var sela = Math.round(w * 0.06);
    rel.style.gap = sela + "px";
    var lebar = Math.round(w + sela + w * INTIP);
    korsel.style.maxWidth = lebar + "px";
    if (ket) ket.style.maxWidth = lebar + "px";
  }

  /* Kartu ujung dipatok ke tepi wadah, tidak ditengahkan. Sejak wadahnya
     disempitkan, dua duanya menghasilkan hal yang sama untuk dua kartu, tapi
     penjepitan ini yang bikin aturannya tetap benar begitu produk ketiga
     ditambahkan. */
  function posisi(i) {
    var s = slide[i];
    var tengah = layar.clientWidth / 2 - (s.offsetLeft + s.offsetWidth / 2);
    var maks = 0;
    var min  = layar.clientWidth - rel.scrollWidth;
    if (min > maks) min = maks;
    return Math.max(min, Math.min(maks, tengah));
  }

  function pasangKeadaan() {
    slide.forEach(function (s, i) { s.classList.toggle("aktif", i === idx); });
    kiri.disabled  = idx === 0;
    kanan.disabled = idx === slide.length - 1;
  }

  /* Keterangan di bawah kartu MEMBALIK ke atas bawah waktu produknya berganti,
     diminta user. Yang lama membalik pergi dulu, baru yang baru membalik
     masuk dari sisi seberangnya, jadi geraknya terbaca sebagai satu benda
     yang diputar, bukan dua benda yang bergantian muncul.

     BERURUTAN, bukan bersamaan, dan itu disengaja. Kedua keterangan itu
     elemen biasa yang ikut mengisi ruang, bukan ditumpuk absolut. Kalau dua
     duanya ditampilkan bersamaan demi menyilangkan animasinya, tingginya jadi
     dua kali lipat sekejap dan seluruh bagian bawah halaman tersentak.
     min-height 130px pada .sc-ket yang menahan sisa goyangannya.

     Arahnya ikut arah geseran. Ke kanan, keterangannya membalik ke atas.
     Ke kiri, membalik ke bawah. Kalau tidak diikutkan, geraknya terasa
     melawan panah yang barusan ditekan. */
  var LAMA_KELUAR = 0.26, LAMA_MASUK = 0.34;

  function tukarKet(nama, arah, langsung) {
    var baru = null, lama = null;
    kap.forEach(function (k) {
      if (k.getAttribute("data-nama") === nama) baru = k;
      else if (!k.hidden) lama = k;
    });
    if (!baru) return;

    /* Tanpa GSAP, tanpa gerak, atau memang sudah yang benar yang tampil,
       tukar apa adanya. Ini juga jalur yang dipakai waktu halaman baru dibuka
       dan waktu jendela diubah ukurannya. */
    if (langsung || pelan || typeof gsap === "undefined" || !lama || lama === baru) {
      /* Balikan yang sedang jalan harus dihentikan dulu. Kalau tidak, jendela
         yang diubah ukurannya di tengah animasi menyisakan tween yang masih
         menulisi elemen yang barusan kita rapikan. */
      if (typeof gsap !== "undefined") gsap.killTweensOf(kap);
      kap.forEach(function (k) { k.hidden = k !== baru; });
      if (typeof gsap !== "undefined") gsap.set(baru, { clearProps: "all" });
      return;
    }

    gsap.killTweensOf(kap);
    gsap.to(lama, {
      rotationX: arah * 90, opacity: 0, duration: LAMA_KELUAR, ease: "power2.in",
      onComplete: function () {
        lama.hidden = true;
        gsap.set(lama, { clearProps: "all" });
        baru.hidden = false;
        gsap.fromTo(baru,
          { rotationX: arah * -90, opacity: 0 },
          { rotationX: 0, opacity: 1, duration: LAMA_MASUK, ease: "power3.out",
            clearProps: "transform,opacity" });
      },
    });
  }

  /* =================================================================
     KARTU HIDUP. Kartu Showcase memuat Atmosight dan Smokewatch yang
     SUNGGUHAN, di dalam iframe, bukan memajang tangkapan layar.

     Alasannya bukan pamer. Tangkapan layar itu basi tiap kali palet, tata
     letak, atau lambangnya berubah, dan sudah dua kali harus ditambal
     tangan pakai PIL. Yang hidup tidak pernah basi, dan pengunjung
     langsung melihat cuaca hari ini, bukan cuaca bulan lalu.

     Yang dijaga di sini beratnya. Tiap app cuma menarik satu bingkai waktu,
     jadi sekitar satu megabita, dan itu pun baru ditarik kalau bagian
     Showcase betul betul terlihat. Yang di HP, yang sambungannya hemat
     data, dan yang memilih reduced-motion tetap dapat poster diam.
     ================================================================= */
  var pelitData = !!(navigator.connection && navigator.connection.saveData);
  /* Di bawah 700 px kartunya cuma sepertiga lebar app, tulisannya sudah tidak
     terbaca hidup maupun diam, jadi memuat dua app penuh di sana cuma
     menghabiskan kuota orang tanpa memberi apa apa. */
  var cukupLebar = window.innerWidth >= 700;
  var bolehHidup = !pelan && !pelitData && cukupLebar;
  var terlihat = false;

  function hidupkan(i) {
    if (!bolehHidup || !terlihat) return;
    var shot = slide[i] && slide[i].querySelector(".sc-shot");
    if (!shot || shot.getAttribute("data-hidup")) return;
    var src = shot.getAttribute("data-embed");
    if (!src) return;
    shot.setAttribute("data-hidup", "1");

    var f = document.createElement("iframe");
    f.className = "sc-bingkai";
    f.setAttribute("title", shot.getAttribute("data-judul") || "");
    f.setAttribute("scrolling", "no");
    /* Tidak boleh ikut urutan tab dan tidak perlu dibacakan pembaca layar.
       Yang mewakili kartu ini di dua duanya tautan pembungkusnya, dan poster
       di bawahnya masih membawa alt yang menjelaskan isinya. */
    f.setAttribute("tabindex", "-1");
    f.setAttribute("aria-hidden", "true");
    f.addEventListener("load", function () { f.classList.add("siap"); });
    shot.insertBefore(f, shot.querySelector(".sc-tudung"));
    f.src = src;
    skala();
  }

  /* ---- JEDA. App di dalam kartu itu app SUNGGUHAN ----
     Lengkap dengan gelung partikel anginnya sendiri, dan gelung itu jalan
     terus selama iframe-nya masih dirender. Artinya waktu orang sudah
     membaca bagian Team, di belakangnya masih ada satu atau dua peta penuh
     yang sibuk menggambar partikel. Itu yang ikut membuat gulirannya
     tersendat, dan itu pekerjaan yang tidak dilihat siapa pun.

     `display:none` membuat dokumen di dalam iframe tidak punya kesempatan
     menggambar, jadi requestAnimationFrame di dalamnya BERHENTI SENDIRI,
     tanpa memuat ulang app-nya dan tanpa perlu menyentuh kode app-nya.
     Posternya yang muncul menggantikan.

     Dua aturan kapan dijeda.
     1. Seluruh bagian Showcase di luar layar. Aman, tidak ada yang melihat
        pertukarannya.
     2. Kartu yang BUKAN kartu aktif. Yang itu cuma mengintip seperdelapan
        lebar dan sudah diredupkan jadi 45 persen, jadi memutar app hidup di
        situ hampir tidak terbaca sebagai apa pun. Ditunda sampai geserannya
        selesai, supaya pertukarannya tidak jatuh di tengah gerak. */
  var showcaseTampak = true, waktuJeda = 0;

  function pasangJeda() {
    slide.forEach(function (s, i) {
      var f = s.querySelector(".sc-bingkai");
      if (f) f.classList.toggle("jeda", !showcaseTampak || i !== idx);
    });
  }
  /* Kail buat verifikasi, sejalan dengan __heroStatus di hero.js. Jeda ini
     tidak bisa dilihat dari tangkapan layar, sebab yang muncul menggantikan
     justru posternya yang memang mirip. */
  window.__scStatus = function () {
    var k = korsel.getBoundingClientRect();
    return {
      tampak: showcaseTampak, idx: idx,
      korsel: Math.round(k.top) + ".." + Math.round(k.bottom),
      bingkai: slide.map(function (s) {
        var f = s.querySelector(".sc-bingkai");
        return f ? f.className : "-";
      }).join(" | ")
    };
  };

  /* Kartu aktif dibangunkan seketika, yang lain baru dijeda setelah gerak
     korselnya reda. */
  function jadwalJeda() {
    var f = slide[idx] && slide[idx].querySelector(".sc-bingkai");
    if (f && showcaseTampak) f.classList.remove("jeda");
    clearTimeout(waktuJeda);
    waktuJeda = setTimeout(pasangJeda, 700);
  }

  /* Bingkainya dirender 1400 px lalu dikecilkan. Lebar kartu ikut vw, jadi
     angkanya dihitung ulang tiap kali korselnya diukur ulang. */
  function skala() {
    slide.forEach(function (s) {
      var shot = s.querySelector(".sc-shot");
      var f = shot && shot.querySelector(".sc-bingkai");
      /* clientWidth, BUKAN offsetWidth. offsetWidth ikut menghitung garis
         tepi 3 px, sedangkan bingkai ini ditaruh di dalam garis tepi, sama
         seperti poster yang width:100%. Pakai offsetWidth dan gambarnya
         kelebihan enam piksel, tepi kanan bawahnya terpotong. */
      if (!f || !shot.clientWidth) return;
      f.style.transform = "scale(" + (shot.clientWidth / 1400) + ")";
    });
  }

  function geser(i, langsung) {
    var dulu = idx;
    idx = Math.max(0, Math.min(slide.length - 1, i));
    pasangKeadaan();
    /* Arah dihitung dari perpindahan yang BENAR benar terjadi, bukan dari
       nilai yang diminta. Panah di ujung dijepit, dan tanpa ini tekanan yang
       tidak menggeser apa apa masih memicu animasi membalik. */
    tukarKet(slide[idx].getAttribute("data-nama"), idx > dulu ? 1 : -1, langsung);
    ukur();
    hidupkan(idx);
    skala();
    jadwalJeda();
    var x = posisi(idx);
    if (langsung || pelan || typeof gsap === "undefined") {
      rel.style.transform = "translateX(" + x + "px)";
      return;
    }
    /* back.out itu MELEWATI sasaran lalu balik, dan di sini itu memang yang
       diminta, geraknya harus terasa membentur. Aman dipakai sebab sasaran
       ini tidak punya batas fisik yang tidak boleh dilewati, beda dengan
       titik huruf i di hero. */
    gsap.to(rel, { x: x, duration: 0.62, ease: "back.out(1.15)", overwrite: true });
    var shot = slide[idx].querySelector(".sc-shot");
    if (shot) {
      gsap.fromTo(shot, { scale: 0.955 },
        { scale: 1, duration: 0.55, ease: "back.out(2.4)", clearProps: "scale", overwrite: true });
    }
  }

  kiri.addEventListener("click", function () { geser(idx - 1); });
  kanan.addEventListener("click", function () { geser(idx + 1); });

  /* Panah papan ketik. Korselnya bukan elemen fokus sendiri, jadi yang
     didengar tombol panahnya, itu sudah cukup dan tidak merebut panah dari
     bagian halaman lain. */
  [kiri, kanan].forEach(function (b) {
    b.addEventListener("keydown", function (e) {
      if (e.key === "ArrowLeft")  { e.preventDefault(); geser(idx - 1); }
      if (e.key === "ArrowRight") { e.preventDefault(); geser(idx + 1); }
    });
  });

  /* Ukuran kartu ikut vw, jadi tiap layar berubah posisinya harus dihitung
     ulang. Langsung, tanpa animasi, kalau tidak dia terlihat melayang tiap
     jendela diseret. Digandeng rAF supaya tidak menghitung tiap kejadian. */
  var nunggu = false;
  window.addEventListener("resize", function () {
    if (nunggu) return;
    nunggu = true;
    requestAnimationFrame(function () { nunggu = false; geser(idx, true); });
  });

  /* Gambar sampulnya belum tentu sudah termuat waktu skrip ini jalan, dan
     sebelum termuat tingginya nol sehingga offsetLeft bisa meleset. Dihitung
     ulang sekali lagi setelah semuanya selesai memuat. */
  window.addEventListener("load", function () { geser(idx, true); });

  /* Pemicunya bagian Showcase masuk layar, bukan halaman selesai dimuat.
     Kalau dimuat di awal, dua app ikut berebut jalur dengan hero yang justru
     hal pertama yang dilihat orang. Cadangan kalau IntersectionObserver tak
     ada, langsung hidupkan saja, browser tanpa dia sudah sangat tua. */
  /* Yang diamati KORSELNYA, bukan seluruh bagian #showcase. Terukur, bagian
     itu tingginya 1404 px sedangkan halamannya cuma 3140 px, jadi waktu
     digulir sampai mentok pun tepi bawahnya masih tersisa 72 px di dalam
     layar. Kalau bagian itu yang diamati, kartunya TIDAK PERNAH dijeda di
     layar desktop, padahal petanya sendiri sudah lama lewat jauh di atas.
     Korselnya jauh lebih pendek dan betul betul keluar layar. */
  var seksi = korsel || document.getElementById("showcase");
  if (!bolehHidup) {
    /* tidak ada yang perlu dipasang, poster diam sudah jadi tampilan akhir */
  } else if (typeof IntersectionObserver === "function") {
    /* DUA pengamat, bukan satu, dan itu disengaja.

       Memuat dan menjeda mau margin yang berbeda. Memuat harus DULUAN,
       kartunya perlu waktu menarik data dan menggambar peta, jadi 300 px
       sebelum kelihatan. Menjeda harus BELAKANGAN, jangan sampai kartunya
       dimatikan padahal masih tersisa sejengkal di tepi layar.

       Kalau dipaksa satu pengamat, marginnya harus dipilih salah satu dan
       yang kalah jadi cacat. Terukur dengan margin 300 px, di jendela
       1600x1000 korsel berhenti 224 px di atas layar waktu halamannya sudah
       mentok, masih di dalam pita 300 px itu, jadi kartunya TIDAK PERNAH
       dijeda. Halaman ini memang cuma 3140 px, tidak cukup panjang. */
    new IntersectionObserver(function (entri) {
      if (!entri[0].isIntersecting) return;
      terlihat = true;
      hidupkan(idx);
    }, { rootMargin: "300px 0px" }).observe(seksi);

    new IntersectionObserver(function (entri) {
      showcaseTampak = entri[0].isIntersecting;
      pasangJeda();
    }, { rootMargin: "60px 0px" }).observe(seksi);
  } else {
    terlihat = true;
    hidupkan(idx);
  }

  geser(0, true);
})();
