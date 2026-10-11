/* Ajakan main Adu Cuaca, dipasang sendiri di SEMUA halaman.

   Markahnya ditanam dari sini, tidak ditempel ke tujuh berkas HTML.
   Alasannya bukan malas. Markah yang sama disalin ke tujuh tempat itu
   pasti berakhir beda, satu halaman ketinggalan waktu naganya berganti
   dan tidak ada yang sadar sampai berbulan kemudian. Satu sumber, tujuh
   pemakai.

   DUA BENTUK.
   Di tiga app peta dia tombol kecil di deretan tombol kepala, isinya naga
   saja. Di halaman isi dia papan tempel di tepi kanan, dan papan itu punya
   DUA KEADAAN.

   Di hero halaman depan dia utuh, ada naganya dan ada ajakannya. Begitu
   orang menggulir keluar hero, atau membuka halaman lain yang memang
   tidak punya hero, dia menyusut jadi jalur tipis di tepi kanan. Masih
   ada, masih bisa dipencet, tapi tidak lagi menghalangi isi halaman.

   Letak berkasnya dihitung dari src skrip ini sendiri, bukan ditebak dari
   alamat halaman. Halaman di akar dan halaman di dalam folder butuh jalan
   yang berbeda ke game/, dan menghitungnya dari sini membuatnya benar di
   dua duanya tanpa satu pun aturan tambahan.
*/
(function () {
  "use strict";

  var skrip = document.currentScript ||
              document.querySelector('script[src$="ajak.js"]');
  if (!skrip) return;
  var akar = skrip.src.replace(/ajak\.js(\?.*)?$/, "");

  /* Di dalam gamenya sendiri dia tidak perlu ada. */
  if (/\/game\//.test(location.pathname)) return;
  if (document.querySelector(".ajak-game, .ajak-kepala")) return;

  var naga = '<img src="' + akar +
            'game/bos-sehat.png?v=9" width="48" height="48" alt="" />';

  function pasang() {
    /* DUA BENTUK, dipilih dari apa yang ada di halamannya.

       Tiga app peta itu layarnya sudah penuh panel, dan menempelkan papan
       gelap besar di tepi kanannya cuma menutupi peta. Jadi di sana dia
       ikut bentuk tombol kepala yang sudah ada, kotak 26 piksel, isinya
       naganya saja tanpa tulisan. Diminta pemilik.

       Halaman isi tidak punya alat-nav, dan di sana dia tetap papan tempel
       di tepi kanan. */
    var nav = document.querySelector(".alat-nav");
    if (nav) {
      var t = document.createElement("a");
      t.className = "ajak-kepala";
      t.href = akar + "game/";
      t.title = "Main mini game Adu Cuaca";
      t.innerHTML = naga + '<span>Mini Game</span>';
      /* DISELIPKAN TEPAT SESUDAH Home, bukan ditaruh di ujung. Diminta
         pemilik. Tiga tautan sesudahnya itu pindah antar peta, satu
         keluarga, dan menyisipkan tautan permainan di tengah tengahnya
         memutus keluarga itu. Di sebelah Home dia jelas berdiri sendiri. */
      var home = nav.querySelector(".brand-info");
      if (home && home.nextSibling) nav.insertBefore(t, home.nextSibling);
      else if (home) nav.appendChild(t);
      else nav.insertBefore(t, nav.firstChild);
      return;
    }

    var a = document.createElement("a");
    a.className = "ajak-game";
    a.href = akar + "game/";
    a.setAttribute("aria-label", "Main mini game Adu Cuaca");
    a.innerHTML =
      '<span class="ajak-bos">' + naga + '</span>' +
      '<span class="ajak-teks">Kalahkan<br />Kemarau<br />Sekarang!</span>';
    document.body.appendChild(a);

    var hero = document.querySelector(".hero");
    if (!hero) { a.classList.add("ajak-kecil"); return; }

    function nilai() {
      var k = hero.getBoundingClientRect();
      var tinggi = window.innerHeight || document.documentElement.clientHeight;
      /* Seperempat hero masih kelihatan berarti masih dianggap di hero. */
      var tampak = Math.min(k.bottom, tinggi) - Math.max(k.top, 0);
      a.classList.toggle("ajak-kecil", tampak < k.height * 0.25);
    }

    /* Diperiksa SEKALI di sini, langsung, sebelum pengamatnya dipasang.
       Pengamat baru melapor di akhir bingkai gambar berikutnya, dan
       halaman yang dibuka sudah dalam keadaan tergulir, entah lewat
       tautan berjangkar atau lewat posisi gulir yang dipulihkan browser,
       akan terlanjur memamerkan papan utuh selama satu bingkai itu. */
    nilai();
    /* Baru sesudah keadaan pertamanya terpasang transisinya dihidupkan.
       Dua bingkai, bukan satu, sebab satu bingkai kadang masih jatuh di
       perhitungan gaya yang sama. */
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { a.classList.add("ajak-siap"); });
    });

    /* IntersectionObserver, bukan pendengar scroll. Pendengar scroll
       menyala puluhan kali per detik dan memaksa tata letak dihitung
       ulang tiap kali dia menanyakan posisi hero. Yang ini cuma menyala
       waktu ambangnya benar benar terlewat. */
    if (!("IntersectionObserver" in window)) return;
    new IntersectionObserver(function (masuk) {
      a.classList.toggle("ajak-kecil", !masuk[0].isIntersecting);
    }, { threshold: 0.25 }).observe(hero);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", pasang);
  } else {
    pasang();
  }
})();
