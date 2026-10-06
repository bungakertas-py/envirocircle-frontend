/* =====================================================================
   Kartu tepi, Parameter di kiri dan Fitur di kanan.

   Polanya diambil dari "Stock Information" di raja.co.id. Tulang punggung
   tipis menempel di tepi layar, labelnya berdiri tegak, badannya melebar
   keluar waktu ditekan. Peta tetap penuh waktu dua duanya tertutup, dan itu
   yang diminta user.

   SENGAJA berkas sendiri, bukan disisipkan ke app.js. app.js itu 3100 baris
   dan urusannya data peta, sedangkan ini murni perabot tampilan. Dimuat
   SEBELUM app.js supaya tombolnya sudah hidup walau data masih diambil.

   Dua kartu boleh terbuka bersamaan di layar lebar, tombolnya memang
   dipisah atas permintaan user. Di layar sempit yang satu menutup yang lain,
   sebab dua duanya tidak akan muat.
   ===================================================================== */
(function () {
  "use strict";

  /* Oceansight punya tiga kartu. Indeks TERPISAH dari Parameter sebab isinya
     enam indeks iklim yang dibaca sendiri, bukan pemilih layer peta. */
  var pasangan = [
    { sisi: "sisi-param", tombol: "spine-param" },
    { sisi: "sisi-indeks", tombol: "spine-indeks" },
    { sisi: "sisi-fitur", tombol: "spine-fitur" }
  ];

  var kartu = [];
  pasangan.forEach(function (p) {
    var el = document.getElementById(p.sisi);
    var btn = document.getElementById(p.tombol);
    if (el && btn) kartu.push({ el: el, btn: btn });
  });
  if (!kartu.length) return;

  function sempit() { return window.matchMedia("(max-width: 900px)").matches; }

  function setBuka(k, buka) {
    k.el.classList.toggle("terbuka", buka);
    k.btn.setAttribute("aria-expanded", buka ? "true" : "false");
  }

  kartu.forEach(function (k) {
    k.btn.addEventListener("click", function () {
      var buka = !k.el.classList.contains("terbuka");
      setBuka(k, buka);
      /* Di layar sempit dua kartu tidak muat berdampingan, jadi yang satu
         ditutup. Di layar lebar dibiarkan, itu justru gunanya tombol dipisah. */
      if (buka && sempit()) {
        kartu.forEach(function (lain) { if (lain !== k) setBuka(lain, false); });
      }
    });
  });

  /* Esc menutup semuanya. Kalau ada panel titik atau kotak cari yang terbuka,
     app.js yang mengurus miliknya sendiri, dua duanya tidak bertabrakan sebab
     yang di sini cuma membuang kelas. */
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    kartu.forEach(function (k) { setBuka(k, false); });
  });
})();
