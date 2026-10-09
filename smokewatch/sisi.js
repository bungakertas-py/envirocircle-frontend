/* =====================================================================
   Kartu tepi, Parameter di kiri dan Fitur di kanan.

   Polanya diambil dari "Stock Information" di raja.co.id. Tulang punggung
   tipis menempel di tepi layar, labelnya berdiri tegak, badannya melebar
   keluar waktu ditekan. Peta tetap penuh waktu dua duanya tertutup, dan itu
   yang diminta user.

   SENGAJA berkas sendiri, bukan disisipkan ke app.js. app.js itu 3460 baris
   dan urusannya data peta, sedangkan ini murni perabot tampilan. Dimuat
   SEBELUM app.js supaya tombolnya sudah hidup walau data masih diambil.

   Dua kartu boleh terbuka bersamaan di layar lebar, tombolnya memang
   dipisah atas permintaan user. Di layar sempit yang satu menutup yang lain,
   sebab dua duanya tidak akan muat.
   ===================================================================== */
(function () {
  "use strict";

  var pasangan = [
    /* Kartu Udara PALING ATAS di rel kiri, dan dia satu satunya yang terbuka
       sendiri waktu halaman dibuka. Diminta user 9 Okt. */
    { sisi: "sisi-kartu", tombol: "spine-kartu" },
    { sisi: "sisi-param", tombol: "spine-param" },
    /* Model TERPISAH dari Parameter, tombolnya sendiri. Diminta user. Dua
       duanya duduk di rel kiri yang sama, jadi waktu Parameter dibuka kartu
       Model ikut turun sendiri tanpa satu baris pun kode di sini. */
    { sisi: "sisi-model", tombol: "spine-model" },
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
    if (k.el.classList.contains("terbuka") === buka) return;
    k.el.classList.toggle("terbuka", buka);
    k.btn.setAttribute("aria-expanded", buka ? "true" : "false");
    /* app.js butuh tahu kapan Kartu Udara dibuka, sebab di situlah izin
       lokasi diminta. Lewat kejadian, bukan lewat app.js menyadap tombolnya
       sendiri, supaya urusan buka tutup tetap tinggal di berkas ini. */
    document.dispatchEvent(new CustomEvent("sisi-ubah", {
      detail: { id: k.el.id, buka: buka }
    }));
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

  /* Kartu Udara terbuka sendiri, kecuali di layar HP. Di HP badannya
     memakan hampir seluruh layar dan petanya jadi tidak terlihat sama
     sekali, jadi di sana dia menunggu ditekan. */
  var kartuUdara = kartu.filter(function (k) { return k.el.id === "sisi-kartu"; })[0];
  if (kartuUdara && !window.matchMedia("(max-width: 640px)").matches) {
    /* Ditunda satu putaran supaya app.js sempat memasang penyimaknya. */
    setTimeout(function () { setBuka(kartuUdara, true); }, 0);
  }

  /* Esc menutup semuanya. Kalau ada panel titik atau kotak cari yang terbuka,
     app.js yang mengurus miliknya sendiri, dua duanya tidak bertabrakan sebab
     yang di sini cuma membuang kelas. */
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    kartu.forEach(function (k) { setBuka(k, false); });
  });
})();
