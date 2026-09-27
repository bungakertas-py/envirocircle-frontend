/* =====================================================================
   Halaman Publication & Project.

   Dua tugas saja, jadi TIDAK memakai anim.js. Berkas itu isinya urusan
   landing, hero, tumpukan sticky, dan korsel, yang semuanya akan keluar
   lebih awal di sini dan menyisakan isi halaman tersembunyi pada opacity 0.
   ===================================================================== */
(function () {
  "use strict";

  /* ---- 1. ANIMASI GERAK, DIMUAT SAAT DIPENCET ----
     Enam animasi dispersi WRF-Chem itu 780 sampai 830 KB masing masing,
     hampir 5 MB kalau semuanya diunduh sendiri. Jadi yang dikirim duluan
     cuma poster diam sekitar 80 KB, dan animasinya baru diambil waktu
     tombolnya dipencet. Sekali dimuat dia tidak diunduh lagi. */
  var tombol = document.querySelectorAll(".kry-main[data-gerak]");
  for (var i = 0; i < tombol.length; i++) {
    tombol[i].addEventListener("click", function () {
      var b = this;
      if (b.dataset.jalan === "1") return;
      b.dataset.jalan = "1";
      b.classList.add("memuat");
      var src = b.getAttribute("data-gerak");
      var baru = new Image();
      baru.onload = function () {
        var lama = b.querySelector("img");
        if (lama) lama.src = src;
        b.classList.remove("memuat");
        b.classList.add("jalan");
      };
      baru.onerror = function () {
        b.classList.remove("memuat");
        b.dataset.jalan = "";       /* biar bisa dicoba lagi */
      };
      baru.src = src;
    });
  }

  /* ---- 2. ADEGAN PER BAGIAN ----

     Bukan satu resep untuk semua. Kalau tiap butir cuma dipudarkan sambil
     naik, halaman sepanjang ini terasa seperti satu gerakan yang diulang
     lima puluh kali. Jadi tiap jenis isi punya ceritanya sendiri.

       Kepala halaman  judulnya naik, penjelasnya menyusul.
       Publication     makalah dibuka. Kepalanya masuk dari kiri mengikuti
                       arah baca, lalu FIGUR UTAMANYA TERSINGKAP KE BAWAH
                       seperti peta yang sedang dicetak, dan gambarnya
                       mengendap dari skala 1,06 di dalamnya. Temuannya
                       masuk satu per satu, chip kata kuncinya memantul.
       Project         peta demi peta. Keterangan pekerjaan masuk dari kiri,
                       lalu tiga keluaran modelnya TERSINGKAP DARI BAWAH
                       satu per satu, seperti plot yang selesai digambar
                       berurutan. Arah singkapnya sengaja KEBALIKAN dari
                       figur Publication, supaya dua bagian itu tidak terasa
                       sama.

     Tiap pekerjaan punya pemicunya sendiri, empat belas buah. Kalau satu
     pemicu untuk seluruh bagian, yang di bawah sudah selesai beranimasi
     jauh sebelum orang menggulir sampai ke sana.

     ATURAN YANG DIPEGANG DI SELURUH BERKAS INI. Untuk satu elemen, pilih
     SALAH SATU, fromTo padanya sendiri, ATAU set dia lalu from anaknya.
     Jangan set dan from elemen yang sama. from merekam nilai akhir waktu
     tween dibuat, dan kalau saat itu nilainya masih 0 dari CSS, dia
     beranimasi dari 0 ke 0 dan isinya tidak pernah muncul. */
  var sasaran = document.querySelectorAll("[data-kry]");
  function tampilSemua() {
    for (var j = 0; j < sasaran.length; j++) {
      sasaran[j].style.opacity = "1";
      sasaran[j].style.transform = "none";
      sasaran[j].style.clipPath = "none";
    }
    var g = document.querySelectorAll(".kry-gbr, .pub2-figur");
    for (var n = 0; n < g.length; n++) { g[n].style.clipPath = "none"; g[n].style.opacity = "1"; }
  }
  if (!window.gsap || !window.ScrollTrigger) { tampilSemua(); return; }
  var pelan = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (pelan) { tampilSemua(); return; }

  var gsap = window.gsap;
  gsap.registerPlugin(window.ScrollTrigger);
  var semua = [];
  window.__kryTl = semua;          /* dipakai jaring pengaman dan alat uji */
  function garis(el, mulai) {
    var tl = gsap.timeline({ scrollTrigger: { trigger: el, start: "top " + mulai, once: true } });
    semua.push(tl);
    return tl;
  }
  function anak(el, pilih) { return el ? el.querySelectorAll(pilih) : []; }

  /* --- kepala halaman --- */
  (function () {
    var sec = document.querySelector(".kry-atas");
    if (!sec) return;
    var tl = garis(sec, "94%");
    var label = sec.querySelector(".kry-atas-label");
    var judul = sec.querySelector(".kry-atas-judul");
    var lead  = sec.querySelector(".kry-atas-lead");
    if (label) tl.fromTo(label, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.5 }, 0);
    if (judul) tl.fromTo(judul, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.95, ease: "power4.out" }, 0.08);
    if (lead)  tl.fromTo(lead,  { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.7 }, 0.3);
  })();

  /* --- kepala tiap bagian --- */
  (function () {
    var h = document.querySelectorAll(".bag-head");
    for (var i = 0; i < h.length; i++) {
      garis(h[i], "88%").fromTo(h[i], { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.6 }, 0);
    }
  })();

  /* --- Publication, makalah dibuka --- */
  (function () {
    var art = document.querySelector(".pub2");
    if (!art) return;
    var kepala = art.querySelector(".pub2-kepala");
    var besar  = art.querySelector(".pub2-figur");
    var kecil  = art.querySelector(".pub2-figur--kecil");
    var blok   = art.querySelectorAll(".pub-blok");
    var temuan = art.querySelectorAll(".pub-temuan li");
    var chip   = art.querySelectorAll(".chips .chip");
    var abst   = art.querySelector(".pub-abstrak");
    var aksi   = art.querySelector(".pub-aksi");

    var tl = garis(art, "80%");
    if (kepala) {
      tl.set(kepala, { opacity: 1 }, 0);
      tl.from(kepala.children, { opacity: 0, x: -24, duration: 0.6, stagger: 0.09, ease: "power3.out" }, 0);
    }
    /* Figur utama tersingkap KE BAWAH, dan gambarnya mengendap di dalamnya.
       Dua gerak di satu bidang, yang satu bingkainya yang satu isinya, itu
       yang membuatnya terasa seperti dicetak bukan sekadar muncul. */
    if (besar) {
      tl.set(besar, { opacity: 1 }, 0.3);
      tl.fromTo(besar, { clipPath: "inset(0% 0% 100% 0%)" },
                       { clipPath: "inset(0% 0% 0% 0%)", duration: 1.1, ease: "power3.inOut" }, 0.3);
      tl.from(besar.querySelector("img"), { scale: 1.06, duration: 1.4, ease: "power2.out" }, 0.3);
    }
    for (var b = 0; b < blok.length; b++) tl.set(blok[b], { opacity: 1 }, 0.72);
    if (temuan.length) tl.from(temuan, { opacity: 0, x: -18, duration: 0.5, stagger: 0.12, ease: "power3.out" }, 0.78);
    if (kecil) {
      tl.set(kecil, { opacity: 1 }, 0.66);
      tl.from(kecil, { scale: 0.94, duration: 0.8, ease: "power3.out" }, 0.66);
    }
    if (chip.length) tl.from(chip, { opacity: 0, scale: 0.6, duration: 0.4, stagger: 0.05, ease: "back.out(2.2)" }, 1.12);
    if (abst) tl.fromTo(abst, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.5 }, 1.2);
    if (aksi) tl.fromTo(aksi, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.5 }, 1.32);
  })();

  /* --- Project, peta demi peta --- */
  (function () {
    var kepala = document.querySelectorAll(".kry-grup-kepala");
    for (var i = 0; i < kepala.length; i++) {
      (function (k) {
        var wadah = k.hasAttribute("data-kry") ? k : k.parentElement;
        var tl = garis(k, "86%");
        tl.set(wadah, { opacity: 1 }, 0);
        tl.from(k.querySelector(".kry-grup-no"), { opacity: 0, scale: 0.4, duration: 0.5, ease: "back.out(2.4)" }, 0);
        tl.from(k.querySelectorAll("div > *"), { opacity: 0, y: 16, duration: 0.55, stagger: 0.08, ease: "power3.out" }, 0.08);
      })(kepala[i]);
    }

    var kerja = document.querySelectorAll(".kry-kerja");
    for (var j = 0; j < kerja.length; j++) {
      (function (w) {
        var tl = garis(w, "85%");
        tl.set(w, { opacity: 1 }, 0);
        tl.from(w.querySelectorAll(".kry-kerja-kepala > *, .kry-kerja-desc"),
                { opacity: 0, x: -22, duration: 0.55, stagger: 0.08, ease: "power3.out" }, 0);
        /* Tersingkap DARI BAWAH, kebalikan dari figur Publication yang
           tersingkap ke bawah. Satu per satu dengan jeda 0,13, jadi terbaca
           seperti tiga plot yang selesai digambar berurutan. */
        tl.fromTo(anak(w, ".kry-gbr"),
                  { clipPath: "inset(100% 0% 0% 0%)", opacity: 1 },
                  { clipPath: "inset(0% 0% 0% 0%)", duration: 0.85, stagger: 0.13, ease: "power3.out" }, 0.22);
      })(kerja[j]);
    }
  })();

  /* --- footer, sisanya yang belum kebagian adegan --- */
  (function () {
    var sisa = document.querySelectorAll("footer [data-kry]");
    for (var i = 0; i < sisa.length; i++) {
      garis(sisa[i], "92%").fromTo(sisa[i], { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.6 }, 0);
    }
  })();

  /* Penjaga yang sama dengan di landing. Semua isi berangkat dari opacity 0,
     jadi kalau ticker GSAP tidak pernah berdetak halamannya kosong, bukan
     cuma kehilangan animasi. Yang dilompatkan cuma yang sudah di dalam layar. */
  function periksa() {
    for (var m = 0; m < semua.length; m++) {
      var t = semua[m];
      if (t.progress() > 0.001) continue;
      var el = t.scrollTrigger && t.scrollTrigger.trigger;
      if (!el) continue;
      var r = el.getBoundingClientRect();
      if (r.bottom > 0 && r.top < (window.innerHeight || 0)) t.progress(1);
    }
  }
  setTimeout(periksa, 8000);
  var jam = null;
  window.addEventListener("scroll", function () {
    if (jam) clearTimeout(jam);
    jam = setTimeout(periksa, 2500);
  }, { passive: true });
})();
