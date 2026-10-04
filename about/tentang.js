/* =====================================================================
   Halaman About Us.

   Tiga adegan, dan tiap bagian punya ceritanya sendiri, sama seperti di
   landing dan halaman karya.

     Kepala     pernyataan besarnya naik pelan, paragrafnya menyusul.
     Angka      dihitung naik dari nol, satu per satu. Angka yang muncul
                begitu saja tidak terasa seperti hitungan, sedangkan angka
                yang berjalan naik membuat orang membacanya.
     Team       fotonya DISIBAK dari sisi luar mengikuti zigzagnya, lalu
                keterangannya masuk dari sisi yang sama. Pola yang sama
                dengan Instrumen di landing, sebab tata letaknya memang
                bersaudara dan geraknya sebaiknya konsisten.

   ATURAN YANG DIPEGANG. Untuk satu elemen pilih SALAH SATU, fromTo padanya
   sendiri, atau set dia lalu from anaknya. Jangan set dan from elemen yang
   sama, sebab from merekam nilai akhir waktu tween dibuat dan kalau saat itu
   masih 0 dari CSS dia beranimasi dari 0 ke 0.
   ===================================================================== */
(function () {
  "use strict";

  var sasaran = document.querySelectorAll("[data-abt]");
  function tampilSemua() {
    for (var i = 0; i < sasaran.length; i++) {
      sasaran[i].style.opacity = "1";
      sasaran[i].style.transform = "none";
    }
    var f = document.querySelectorAll(".tim-foto");
    for (var j = 0; j < f.length; j++) f[j].style.clipPath = "none";
    var n = document.querySelectorAll(".abt-num");
    for (var k = 0; k < n.length; k++) n[k].textContent = n[k].dataset.akhir || n[k].textContent;
  }

  /* Angka aslinya disimpan dulu, sebab tween nanti menimpanya. */
  var angka = document.querySelectorAll(".abt-num");
  for (var a = 0; a < angka.length; a++) angka[a].dataset.akhir = angka[a].textContent.trim();

  if (!window.gsap || !window.ScrollTrigger) { tampilSemua(); return; }
  var pelan = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (pelan) { tampilSemua(); return; }

  var gsap = window.gsap;
  gsap.registerPlugin(window.ScrollTrigger);
  var semua = [];
  window.__abtTl = semua;
  function garis(el, mulai) {
    var tl = gsap.timeline({ scrollTrigger: { trigger: el, start: "top " + mulai, once: true } });
    semua.push(tl);
    return tl;
  }

  /* --- kepala halaman --- */
  (function () {
    var sec = document.querySelector(".abt-atas");
    if (!sec) return;
    var tl = garis(sec, "94%");
    /* NAMA KELASNYA BERUBAH 4 Oktober 2026 waktu kepala halaman disusun
       ulang. Ini WAJIB ikut diganti, bukan pilihan. Semua yang ber-data-abt
       berangkat dari opacity 0 lewat CSS, dan yang memunculkannya cuma
       adegan di sini. Selektor yang tidak lagi cocok berarti elemennya
       TIDAK PERNAH MUNCUL. Sempat terjadi, .abt-logo diganti namanya tanpa
       mengubah baris ini, dan lambangnya hilang sama sekali di peramban
       biasa. Chrome headless tidak menunjukkannya sebab dia dijalankan
       dengan prefers-reduced-motion, dan di jalur itu semuanya dipaksa
       tampil. JANGAN percaya potret headless untuk memeriksa hal ini. */
    var kata  = sec.querySelector(".abt-pernyataan");
    var par   = sec.querySelectorAll(".abt-paragraf p");
    var itera = sec.querySelector(".abt-itera");
    var pisahLogo = sec.querySelector(".abt-pisah");
    var logo  = sec.querySelector(".abt-ec");
    /* JANGAN dinamai `garis`. Fungsi pembuat barisan waktu di atas sudah
       bernama garis(), dan `var` terangkat ke puncak fungsi ini, jadi
       variabel lokal bernama sama akan MENUTUPI fungsinya sejak baris
       pertama. Akibatnya garis(sec, "94%") memanggil undefined, TypeError,
       dan SELURUH IIFE mati tanpa satu pun adegan dibuat. Kena sekali. */
    var pemisah = sec.querySelector(".abt-garis");
    /* Urutannya mengikuti urutan baca, yang menaungi dulu baru yang punya
       halaman, lalu pernyataannya. */
    if (itera) tl.fromTo(itera, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.6, ease: "power3.out" }, 0);
    if (pisahLogo) tl.fromTo(pisahLogo, { opacity: 1, scaleY: 0 }, { scaleY: 1, duration: 0.45, ease: "power2.inOut", transformOrigin: "50% 0%" }, 0.22);
    if (logo)  tl.fromTo(logo,  { opacity: 0, scale: 0.94 }, { opacity: 1, scale: 1, duration: 0.8, ease: "power3.out" }, 0.3);
    if (kata)  tl.fromTo(kata,  { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 1.0, ease: "power4.out" }, 0.5);
    /* Garisnya DITARIK dari kiri, bukan dipudarkan. Gerak yang sama dipakai
       garis pita bukti di hero landing, dan di sini dia yang memisahkan
       pernyataan dari badan teks. */
    if (pemisah) tl.fromTo(pemisah, { opacity: 1, scaleX: 0 }, { scaleX: 1, duration: 0.9, ease: "power3.inOut" }, 0.8);
    if (par.length) tl.fromTo(par, { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.7, stagger: 0.12 }, 0.96);
  })();

  /* --- pita angka, dihitung naik ---
     Yang dianimasikan objek pembantu, bukan elemennya, lalu tiap frame
     nilainya ditulis ulang ke teksnya. Angka tetap dijaga dua digit dengan
     nol di depan, seperti nilai akhirnya. */
  (function () {
    var sec = document.querySelector(".abt-angka");
    if (!sec) return;
    var butir = sec.querySelectorAll(".abt-butir");
    var tl = garis(sec, "86%");
    tl.fromTo(butir, { opacity: 0, y: 20 },
                     { opacity: 1, y: 0, duration: 0.55, stagger: 0.09, ease: "power3.out" }, 0);
    for (var i = 0; i < butir.length; i++) {
      (function (el, urut) {
        var span = el.querySelector(".abt-num");
        if (!span) return;
        var akhir = parseInt(span.dataset.akhir, 10);
        if (isNaN(akhir)) return;
        var lebar = span.dataset.akhir.length;
        var kotak = { n: 0 };
        span.textContent = akhir < 10 ? "00" : "0";
        tl.to(kotak, {
          n: akhir, duration: 1.0, ease: "power2.out",
          onUpdate: function () {
            var v = String(Math.round(kotak.n));
            while (v.length < lebar) v = "0" + v;
            span.textContent = v;
          },
          onComplete: function () { span.textContent = span.dataset.akhir; }
        }, 0.1 + urut * 0.09);
      })(butir[i], i);
    }
  })();

  /* --- Team, zigzag --- */
  (function () {
    var baris = document.querySelectorAll(".tim-baris");
    for (var i = 0; i < baris.length; i++) {
      (function (r) {
        var balik = r.className.indexOf("tim-baris--balik") >= 0;
        var foto  = r.querySelector(".tim-foto");
        var teks  = r.querySelectorAll(".tim-teks > *");
        var tl = garis(r, "80%");
        tl.set(r, { opacity: 1 }, 0);
        if (foto) {
          tl.fromTo(foto,
            { clipPath: balik ? "inset(0% 0% 0% 100%)" : "inset(0% 100% 0% 0%)" },
            { clipPath: "inset(0% 0% 0% 0%)", duration: 1.0, ease: "power3.inOut" }, 0);
        }
        if (teks.length) {
          tl.from(teks, { opacity: 0, x: balik ? 28 : -28, duration: 0.6, stagger: 0.08, ease: "power3.out" }, 0.22);
        }
      })(baris[i]);
    }
  })();

  /* --- kepala bagian dan footer --- */
  (function () {
    var sisa = document.querySelectorAll(".bag-head[data-abt], footer [data-abt]");
    for (var i = 0; i < sisa.length; i++) {
      garis(sisa[i], "90%").fromTo(sisa[i], { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.6 }, 0);
    }
  })();

  /* Penjaga anti halaman kosong, sama dengan dua halaman lain. */
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
