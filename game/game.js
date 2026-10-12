/* Adu Cuaca, mesin permainannya.

   SUMBER KEBENARAN DEKNYA kartu.json, bukan berkas ini dan bukan HTML.
   Muka kartu dan muka belakangnya dua duanya SVG yang sengaja tidak memuat
   jawaban, dan sifat "menolong" cuma hidup di JSON supaya tidak pernah
   bocor ke gambar. SVG dan JSON dilahirkan buat-kartu.py, jangan disunting
   tangan.

   ANGKA ANGKANYA JANGAN DIUBAH SEMBARANGAN. HP 1400, tujuh giliran, dan
   pengali rantai 1,6 itu hasil simulasi 40 ribu undian di setel-hp.py,
   bukan tebakan. Dengan susunan tangan yang dipakai di bawah, pemain yang
   tahu ilmunya tapi tidak peduli rantai merobohkan bos PAS di giliran
   ketujuh sebanyak 91 persen, dan yang menyambung rantai robohnya di
   giliran kelima atau keenam. Mengubah satu angka saja merusak janji itu,
   jadi kalau mau diubah, jalankan ulang simulasinya dulu. */

(function () {
  "use strict";

  var HP_AWAL = 1400;
  var GILIRAN_MAKS = 7;
  var KOMBO = 1.6;

  /* ====================== TIGA TINGKAT ======================

     NYAWA BOSNYA TIDAK IKUT BERUBAH. Tetap 1400, tetap tujuh giliran, bos
     yang sama. Yang berubah cuma TANGANNYA, dan peluang menangnya jatuh
     sendiri. Disimulasikan 40 ribu undian per tingkat, lihat
     setel-hp-tingkat.py di scratchpad.

       rank          tangan                      menang benar   pakai rantai
       Squire        3 kartu susunan pasti             91%            99%
       Knight        4 kartu undian bebas              72%            86%
       Dragonslayer  5 kartu bebas, seperempat         56%            77%
                     giliran isinya jebakan semua

     Ini DISENGAJA begini, bukan kebetulan. Menurunkan nyawa bos di tingkat
     atas memang bisa, tapi pemain membacanya sebagai bos yang makin lemah,
     dan itu kebalikan dari maksudnya. Dengan nyawa tetap, yang naik cuma
     tuntutan ke pemainnya.

     Yang paling berharga ada di kolom terakhir. Di Squire, menyambung
     rantai sebab cuma menaikkan peluang menang 8 poin. Di Dragonslayer
     menaikkan 21 poin. Jadi naik rank MEMAKSA orang mengerti sebab
     akibatnya, bukan sekadar hafal mana kartu baik.

     CATATAN NAMA. Di kode namanya tetap "tingkat", sebab yang diurus di
     sini memang tingkat kesulitan. Yang dilihat pemain "rank", dan nama
     ranknya sengaja istilah game yang umum, bukan terjemahan. Bedanya
     disengaja, jangan disamakan tanpa mengganti dua duanya. */
  var TINGKAT = [
    { nomor: 1, nama: "Squire", kartu: 3, susun: "pasti",
      jelas: "Tiap tangan pasti berisi satu fenomena yang menolong, satu " +
             "parameter yang menolong, dan satu jebakan." },
    { nomor: 2, nama: "Knight", kartu: 4, susun: "bebas",
      jelas: "Empat kartu diundi bebas dari seluruh dek. Bisa dapat dua " +
             "jebakan sekaligus, bisa dapat dua kartu baik yang kekuatannya " +
             "beda jauh." },
    { nomor: 3, nama: "Dragonslayer", kartu: 5, susun: "bebas", jebakanPenuh: 0.25,
      jelas: "Lima kartu bebas, dan kira kira satu dari empat giliran " +
             "isinya jebakan semua. Di giliran itu langkah yang benar " +
             "adalah MELEWATI, sebab tidak semua tindakan memperbaiki keadaan." },
  ];
  var KUNCI_TINGKAT = "aduCuaca.tingkat";
  var tingkat = TINGKAT[0];

  function bacaTingkat() {
    var n = 1;
    try { n = parseInt(localStorage.getItem(KUNCI_TINGKAT), 10) || 1; } catch (e) { n = 1; }
    tingkat = TINGKAT[Math.min(TINGKAT.length, Math.max(1, n)) - 1];
  }
  function simpanTingkat(n) {
    tingkat = TINGKAT[Math.min(TINGKAT.length, Math.max(1, n)) - 1];
    try { localStorage.setItem(KUNCI_TINGKAT, String(tingkat.nomor)); } catch (e) { /* tidak apa apa */ }
  }

  var DEK = [];
  var FEN_BAIK = [], PAR_BAIK = [], CELAKA = [], SEMUA_KARTU = [];
  var S = null;

  /* Perbesaran gambar aula. WAJIB BILANGAN BULAT. Diperbesar 6,25 kali
     misalnya, sebagian piksel jadi 6 dan sebagian 7, dan seluruh kerjaan
     pixel art ini langsung percuma. Jadi dibulatkan KE ATAS supaya
     aulanya pasti menutup layar, sisanya biar terpotong. */
  function ukurAula() {
    var tinggi = window.innerHeight - 54;      // dikurangi bilah atas
    var px = Math.ceil(Math.max(window.innerWidth / 288, tinggi / 162));
    document.documentElement.style.setProperty("--px", Math.max(3, px));
  }
  ukurAula();
  window.addEventListener("resize", ukurAula);

  var el = {};
  ["bos-gambar", "latar-akhir", "langit", "mendung",
   "hp-isi", "hp-angka", "giliran", "pesan", "tangan", "aksi",
   "serang", "lewati", "hasil", "gagal", "hp", "tumpukan-info", "efek", "aksi-hasil", "tutor", "lore",
   "tingkat-pilih", "tingkat-nama", "ulang-awal"
  ].forEach(function (id) { el[id] = document.getElementById(id); });

  /* ================== GERAK KARTU ALA BALATRO ==================

     Tekniknya DIPELAJARI dari SunsetSamu/balatro-cards-effect-css, yang
     readme-nya menyatakan MIT. CATATAN JUJUR, berkas LICENSE yang ditunjuk
     readme itu TIDAK ADA di repo-nya, tautannya mati. Jadi yang kuambil
     cuma CARANYA, bukan kodenya, dan di bawah ini semuanya tulisan sendiri.
     Dengan begitu tidak ada pertanyaan lisensi yang menggantung di situs
     perusahaan. Sumbernya tetap kutulis di sini sebagai penghormatan.

     Empat hal yang bikin kartu Balatro terasa hidup, dan keempatnya ada di
     sini.
       1. GOYANG. Tiap kartu bergoyang pelan terus menerus walau tidak
          disentuh, dan FASENYA ACAK per kartu. Kalau fasenya sama, tiga
          kartu bergoyang serempak seperti mesin, dan itu malah terasa mati.
       2. MIRING IKUT TETIKUS. Dihaluskan pakai lerp, jadi waktu tetikusnya
          pergi kartunya pulang pelan pelan, bukan mental balik.
       3. MIRING SENDIRI waktu tidak disentuh. Ini yang paling sering
          kelewat orang. Tanpa dia, tangan yang menganggur kelihatan beku.
       4. PEGAS waktu dipilih. Naiknya KELEWAT sedikit lalu balik. Transisi
          CSS biasa tidak bisa begitu, jadi pegasnya dihitung di sini.

     Satu lingkaran rAF untuk SEMUA kartu, bukan satu lingkaran per kartu.
     Dek di bawah isinya 26 kartu, dan 26 lingkaran rAF itu pemborosan yang
     tidak perlu. Kartu yang sedang diam juga dilewati, jadi yang benar
     benar dihitung tiap bingkai cuma tiga kartu di tangan. */

  /* Pendek, supaya pemanggilannya di bawah tidak berisik. Dibungkus
     penjaga sebab suara.js bisa saja gagal dimuat, dan permainan harus
     tetap jalan tanpa suara, bukan mati. */
  function bunyi(n) { if (window.Suara) window.Suara.main(n); }

  var DIAM = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var ADA_TETIKUS = window.matchMedia("(hover: hover)").matches;
  var HIDUP = [];

  function daftarGerak(sel, bergoyang, masuk, tunda) {
    var g = {
      sel: sel, goyang: bergoyang,
      fase: Math.random() * Math.PI * 2,
      tujuX: 0, tujuY: 0, miringX: 0, miringY: 0, hover: false,
      angkat: 0, angkatV: 0, skala: 1, skalaV: 0, ditulis: false,
      /* masuk, kartu DIBAGIKAN dari tumpukan. Nilainya 1 berarti dia masih
         utuh di tumpukan, 0 berarti sudah sampai di tangan. Diturunkan
         pelan pelan tiap bingkai, jadi dia terbang sendiri tanpa animasi
         CSS terpisah yang bakal berebut transform dengan lingkaran ini. */
      masuk: masuk ? 1 : 0, dariX: masuk ? masuk.dx : 0, dariY: masuk ? masuk.dy : 0,
      tunda: tunda || 0,
      /* pergi, kebalikannya. Kartu dilempar ke bos atau dibuang ke
         tumpukan. 0 sampai 1. */
      pergi: null, pergiT: 0
    };
    sel._gerak = g;
    if (ADA_TETIKUS) {
      sel.addEventListener("mouseenter", function () { g.hover = true; });
      sel.addEventListener("mouseleave", function () {
        g.hover = false; g.tujuX = 0; g.tujuY = 0;
      });
      sel.addEventListener("mousemove", function (e) {
        var r = sel.getBoundingClientRect();
        g.tujuX = ((e.clientX - r.left) / r.width - 0.5) * 2;
        g.tujuY = ((e.clientY - r.top) / r.height - 0.5) * 2;
      });
    }
    HIDUP.push(g);
  }

  /* ================== EFEK WAKTU BOS KENA ==================
     Dulu hasil serangan dilaporkan lewat panel berbingkai yang menimpa
     papan. Pemilik bilang "jangan di rekap pake shape gitu ganggu
     jadinya", dan dia benar, panel itu memotong pertarungan jadi dua
     babak, menyerang lalu membaca laporan.

     Sekarang semuanya terjadi DI BADAN BOSNYA. Hujan turun dari awan di
     atas kepalanya waktu dia kena, api menjalar di tubuhnya waktu dia
     malah pulih, dan angkanya melayang naik di situ juga. Mata tidak
     perlu pindah ke mana mana. */
  function angkaApung(teks, kelas, geser) {
    var a = document.createElement("span");
    a.className = "angka-apung " + kelas;
    a.textContent = teks;
    if (geser) a.style.marginTop = geser + "px";
    el.efek.appendChild(a);
    setTimeout(function () { a.remove(); }, 1500);
  }

  /* Dibangun sekali lalu dipakai ulang. Kalau tiap serangan elemennya
     dibuat baru, animasi mendung turunnya mulai dari nol lagi tiap kali dan
     badainya terasa dipotong potong. */
  function badai() {
    /* DUA WADAH, bukan satu. Mendungnya di belakang naga dan hujannya di
       depan naga, jadi mereka tidak bisa tinggal di lapisan yang sama. */
    var m = el.mendung, l = el.langit;
    if (!m || !l) return;
    clearTimeout(badai.buang);
    clearTimeout(badai.sapu);
    m.classList.remove("pergi");
    l.classList.remove("pergi");
    if (!m.firstChild) m.innerHTML = '<div class="langit-awan"></div>';
    if (!l.firstChild) l.innerHTML = '<div class="langit-hujan"></div>';
    badai.buang = setTimeout(function () {
      m.classList.add("pergi"); l.classList.add("pergi");
    }, 2000);
    badai.sapu = setTimeout(function () {
      m.classList.remove("pergi"); m.innerHTML = "";
      l.classList.remove("pergi"); l.innerHTML = "";
    }, 2520);
  }

  /* ===================== DUA AKHIRAN ===================== */

  /* Naganya pecah berhamburan. Serpihannya dipotong dari gambar naga itu
     sendiri, jadi tidak ada berkas tambahan dan pecahannya dijamin sama
     persis dengan yang barusan dilihat pemain.

     Arah lemparnya DIHITUNG dari posisi tiap serpih, bukan diacak penuh.
     Serpih di kiri atas terlempar ke kiri atas, yang di kanan bawah ke
     kanan bawah. Acak penuh terbaca seperti kerusakan gambar, terpancar
     dari tengah terbaca seperti meledak. Yang diacak cuma jauhnya dan
     putarannya, dan itu yang bikin ledakannya tidak terlihat seperti
     kembang api yang terlalu rapi. */
  function pecahkanBos() {
    var bos = el["bos-gambar"];
    if (!bos || !el.efek) return;
    if (DIAM) { bos.style.opacity = "0"; return; }

    var N = 8, wadah = document.createElement("div");
    wadah.className = "pecahan";
    for (var i = 0; i < N * N; i++) {
      var c = i % N, r = (i / N) | 0, sp = document.createElement("i");
      sp.className = "serpih";
      sp.style.left = (c * 100 / N) + "%";
      sp.style.top  = (r * 100 / N) + "%";
      /* Persennya dibagi N-1, bukan N. Itu aturan background-position
         persen, nol persen berarti tepi kiri dan seratus persen tepi
         kanan, jadi yang dibagi jarak antar petak bukan jumlah petak. */
      sp.style.backgroundPosition =
        (c * 100 / (N - 1)) + "% " + (r * 100 / (N - 1)) + "%";
      wadah.appendChild(sp);
    }
    el.efek.appendChild(wadah);
    bos.style.opacity = "0";

    var anak = wadah.children, tengah = (N - 1) / 2;
    for (var j = 0; j < anak.length; j++) {
      (function (sp, k) {
        var c = k % N, r = (k / N) | 0;
        var dx = (c - tengah) / tengah, dy = (r - tengah) / tengah;
        var jauh = 70 + Math.random() * 150;
        var putar = Math.random() * 160 - 80;
        var tunda = Math.random() * 0.14;
        sp.style.transition =
          "transform 1.05s cubic-bezier(.15,.7,.35,1) " + tunda + "s," +
          "opacity .95s ease-in " + (tunda + 0.1) + "s";
        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            sp.style.transform =
              "translate(" + (dx * jauh) + "px," + (dy * jauh + 46) + "px)" +
              " rotate(" + putar + "deg)";
            sp.style.opacity = "0";
          });
        });
      })(anak[j], j);
    }
    getarkan(999, 0);   /* luka besar, layarnya ikut berguncang keras */
  }

  /* Pemain gagal, dan naganya membesar. Tidak maju, cuma membesar di
     tempat, dan itu cukup untuk terbaca sebagai mendekat. */
  function besarkanBos() {
    var bos = el["bos-gambar"];
    if (!bos || DIAM) return;
    bos.classList.add("membesar");
  }

  function efekHantam(luka, pulih) {
    if (DIAM) {
      if (luka) angkaApung("-" + luka, "angka-luka");
      if (pulih) angkaApung("+" + pulih, "angka-pulih", luka ? 46 : 0);
      return;
    }
    if (luka > 0) {
      /* Awannya WAJIB ada, bukan hiasan. Hujan yang turun entah dari mana
         terbaca seperti cacat gambar. Begitu ada mendung yang menggantung
         di atas, hujan itu jadi punya sebab.

         SELEBAR LAYAR, bukan sebesar naga. Yang dikerjakan pemain itu
         menurunkan hujan di seluruh wilayah, dan kalau hujannya cuma
         sebesar badan naga yang tersampaikan malah seperti menyiram satu
         ekor binatang. */
      badai();
      angkaApung("-" + luka, "angka-luka");
    }
    if (pulih > 0) {
      for (var i = 0; i < 5; i++) {
        var api = document.createElement("div");
        api.className = "efek-api";
        api.style.left = (14 + i * 18) + "%";
        api.style.bottom = (4 + (i % 2) * 30) + "%";
        api.style.animationDelay = (i * 0.07) + "s, " + (i * 0.07) + "s";
        el.efek.appendChild(api);
      }
      angkaApung("+" + pulih, "angka-pulih", luka ? 46 : 0);
      setTimeout(function () {
        var l = el.efek.querySelectorAll(".efek-api");
        for (var j = 0; j < l.length; j++) l[j].remove();
      }, 1600);
    }
  }

  function bingkai(t) {
    var jam = t / 1000;
    var sisa = [];
    for (var i = 0; i < HIDUP.length; i++) {
      var g = HIDUP[i];
      /* Kartu tangan dibuang dan dibuat ulang tiap giliran. Yang sudah
         lepas dari halaman dicoret di sini, jadi tidak perlu ada pencatatan
         terpisah waktu tangannya digambar ulang. */
      if (!g.sel.isConnected) continue;
      sisa.push(g);

      var terpilih = g.sel.classList.contains("dipilih");
      var a = jam * 1.6 + g.fase;

      /* Dibagikan dan dibuang dihitung DI SINI, bukan lewat transition CSS,
         sebab transform kartu ini milik lingkaran rAF. Dipasang lewat CSS,
         dua duanya menulis ke properti yang sama dan tiap bingkai salah
         satunya menang bergantian. Kartunya jadi kejang kejang. */
      if (g.tunda > 0) { g.tunda -= 1 / 60; }
      else if (g.masuk > 0) { g.masuk = Math.max(0, g.masuk - 0.085); }
      if (g.pergi) { g.pergiT = Math.min(1, g.pergiT + 0.055); }
      var gx = g.goyang ? Math.sin(a) * 1.2 : 0;
      var gy = g.goyang ? Math.cos(a) * 1.2 : 0;
      var gr = g.goyang ? Math.sin(a * 2) * 1.1 : 0;

      var tx = g.hover ? g.tujuX : (g.goyang ? Math.cos(a) * 0.45 : 0);
      var ty = g.hover ? g.tujuY : (g.goyang ? Math.sin(a) * 0.45 : 0);
      g.miringX += (tx - g.miringX) * 0.18;
      g.miringY += (ty - g.miringY) * 0.18;

      var tujuAngkat = terpilih ? -26 : (g.hover ? -7 : 0);
      var tujuSkala = terpilih ? (g.hover ? 1.13 : 1.07) : (g.hover ? 1.11 : 1);
      g.angkatV = (g.angkatV + (tujuAngkat - g.angkat) * 0.26) * 0.74;
      g.angkat += g.angkatV;
      g.skalaV = (g.skalaV + (tujuSkala - g.skala) * 0.26) * 0.74;
      g.skala += g.skalaV;

      var bergerak = g.goyang || g.hover || terpilih || g.masuk > 0 || g.pergi
        || g.tunda > 0
        || Math.abs(g.angkat) > 0.05 || Math.abs(g.skala - 1) > 0.002
        || Math.abs(g.miringX) > 0.003 || Math.abs(g.miringY) > 0.003;
      if (!bergerak) {
        if (g.ditulis) { g.sel.style.transform = ""; g.sel.style.zIndex = ""; g.ditulis = false; }
        continue;
      }
      g.ditulis = true;
      /* m melembutkan masuknya, jatuhnya cepat di awal lalu melambat
         mendarat. Linear terasa seperti kartu digeser mesin. */
      var m = g.tunda > 0 ? 1 : g.masuk * g.masuk;
      var px = gx + g.dariX * m;
      var py = g.angkat + gy + g.dariY * m;
      var sk = g.skala * (1 - 0.55 * m);
      var rt = gr + m * 24;
      var op = 1;
      if (g.pergi) {
        var t = g.pergiT * g.pergiT * (3 - 2 * g.pergiT);   // pelan cepat pelan
        px += g.pergi.dx * t;
        py += g.pergi.dy * t;
        sk *= 1 - (1 - g.pergi.skala) * t;
        rt += g.pergi.putar * t;
        op = 1 - Math.max(0, (g.pergiT - 0.55) / 0.45);
      }
      g.sel.style.opacity = op < 1 ? op.toFixed(3) : "";
      g.sel.style.transform =
        "perspective(600px)" +
        " translate(" + px.toFixed(2) + "px," + py.toFixed(2) + "px)" +
        " scale(" + sk.toFixed(3) + ")" +
        " rotate(" + rt.toFixed(2) + "deg)" +
        " rotateX(" + (-g.miringY * 7).toFixed(2) + "deg)" +
        " rotateY(" + (g.miringX * 7).toFixed(2) + "deg)";
      /* TINGKATANNYA BERJENJANG, jangan disamakan lagi. Dulu kartu
         terpilih dan kartu yang disentuh dua duanya dipasang 20, dan waktu
         z-index-nya seri yang menang cuma urutan DOM. Akibatnya menyentuh
         kartu kiri waktu kartu kanan sedang terpilih bikin kartu kirinya
         tetap tertimpa, dan namanya tidak terbaca.

         Yang disentuh WAJIB paling depan, sebab itu kartu yang sedang
         dibaca orang. Yang terpilih di bawahnya, dia sudah diputuskan.
         Kosong berarti mengikuti urutan dari CSS, 1 sampai 3. */
      g.sel.style.zIndex = g.pergi ? "40" : (g.hover ? "30" : (terpilih ? "20" : ""));
    }
    HIDUP = sisa;
    requestAnimationFrame(bingkai);
  }
  if (!DIAM) requestAnimationFrame(bingkai);

  /* Getaran layar. Kelasnya DICOPOT lalu offsetWidth dibaca sekali supaya
     browser memaksa hitung ulang, baru dipasang lagi. Tanpa paksaan itu,
     memasang kelas yang sama dua kali berturut turut tidak memulai ulang
     animasinya dan pukulan kedua terasa tidak ada. */
  function getarkan(luka, pulih) {
    if (DIAM) return;
    var a = document.getElementById("arena");
    var kelas = pulih > luka ? "getar-pulih" : (luka >= 300 ? "getar-besar" : "getar");
    a.classList.remove("getar", "getar-besar", "getar-pulih");
    void a.offsetWidth;
    a.classList.add(kelas);
    setTimeout(function () { a.classList.remove(kelas); }, 520);
  }

  function aman(t) {
    return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;")
                    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function acak(a) { return a[Math.floor(Math.random() * a.length)]; }

  /* ----------------------------- KARTU ----------------------------- */

  /* ====================== SOROTAN KARTU ======================

     Dulu tombol tanda seru cuma membalik kartunya di tempat. Masalahnya,
     kartu di tangan cuma 120 piksel, dan penjelasan di baliknya jadi
     sekitar 7 piksel tingginya. Tidak terbaca. Sekarang kartunya MELOMPAT
     KE TENGAH LAYAR sambil membalik, dan di sana tingginya sekitar 500
     piksel, jadi hurufnya hampir tiga kali lebih besar.

     Perpindahannya pakai cara FLIP, singkatan dari First Last Invert Play.
     Kartunya LANGSUNG ditaruh di tempat terakhirnya, di tengah dan besar,
     baru diukur. Dari situ dihitung geseran dan pengecilan yang
     mengembalikannya ke posisi kartu asal, dipasang sebagai transform awal,
     lalu dilepas. Browser yang menganimasikan sisanya, dan karena yang
     dianimasikan cuma transform, dia mulus tanpa menghitung ulang tata
     letak tiap bingkai.

     Kalau dibalik urutannya, digeser dari kecil ke besar pakai lebar dan
     tinggi, tiap bingkai browser harus menghitung ulang tata letak dan
     animasinya tersendat. */
  var sorot = null;

  function tutupSorot() {
    if (!sorot) return;
    var s = sorot; sorot = null;
    s.classList.remove("tampil");
    document.removeEventListener("keydown", tombolEsc);
    if (DIAM) { s.remove(); return; }
    setTimeout(function () { s.remove(); }, 260);
  }

  function tombolEsc(e) { if (e.key === "Escape") tutupSorot(); }

  /* Satu penangan Escape untuk SEMUA lapisan yang menutupi papan. Dipasang
     sekali di dokumen, bukan dipasang dan dicopot tiap lapisan dibuka,
     sebab yang dipasang berpasangan begitu gampang sekali bocor, dan
     penangan yang bocor diam diam menumpuk sampai satu tekanan Escape
     memanggil belasan fungsi. */
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (el.lore && !el.lore.hidden) tutupLore();
    if (el.tutor && !el.tutor.hidden) tutupTutor();
  });

  function bukaSorot(k, sumber) {
    tutupSorot();
    var nama = aman(k.nama);
    var s = document.createElement("div");
    s.className = "sorot";
    s.innerHTML =
      '<button class="sorot-tutup" type="button" aria-label="Tutup">&times;</button>' +
      '<div class="sorot-kartu">' +
        '<img class="sisi-muka" src="' + aman(k.id) + '.svg" alt="' + nama + '">' +
        '<img class="sisi-balik" src="' + aman(k.id) + '-balik.svg" alt="Penjelasan ' + nama + '">' +
      '</div>';
    document.body.appendChild(s);
    sorot = s;

    var kartuEl = s.querySelector(".sorot-kartu");
    if (!DIAM) {
      var asal = sumber.getBoundingClientRect();
      var tuju = kartuEl.getBoundingClientRect();
      var skala = asal.width / tuju.width;
      var dx = (asal.left + asal.width / 2) - (tuju.left + tuju.width / 2);
      var dy = (asal.top + asal.height / 2) - (tuju.top + tuju.height / 2);
      kartuEl.style.transition = "none";
      kartuEl.style.transform =
        "translate(" + dx.toFixed(1) + "px," + dy.toFixed(1) + "px) scale(" +
        skala.toFixed(4) + ") rotateY(0deg)";
      /* Dibaca sekali supaya browser benar benar memasang keadaan awal.
         Tanpa paksaan ini dia menggabungkan dua perubahan jadi satu dan
         animasinya tidak pernah jalan. */
      void kartuEl.offsetWidth;
      kartuEl.style.transition = "";
    }
    requestAnimationFrame(function () {
      s.classList.add("tampil");
      kartuEl.style.transform = "";
    });

    s.addEventListener("click", tutupSorot);
    document.addEventListener("keydown", tombolEsc);
  }

  /* Daftar seluruh kartu, dibuka dari tanda seru di tumpukan dek. Inilah
     "bagian khusus info" yang dulu memanjang di bawah halaman dan dibuang
     atas permintaan pemilik. Sekarang dia tidak mengganggu papan, cuma
     muncul waktu diminta, dan tiap kartunya masih bisa dipencet untuk
     dibesarkan satu satu. */
  function bukaSemua() {
    tutupSorot();
    function rak(ks) {
      return '<div class="sorot-rak">' + ks.map(function (k) {
        return '<img src="' + aman(k.id) + '.svg" alt="' + aman(k.nama) +
               '" data-id="' + aman(k.id) + '" loading="lazy">';
      }).join("") + '</div>';
    }
    var fen = DEK.filter(function (k) { return k.jenis === "fenomena"; });
    var par = DEK.filter(function (k) { return k.jenis === "parameter"; });
    var s = document.createElement("div");
    s.className = "sorot";
    s.innerHTML =
      '<button class="sorot-tutup" type="button" aria-label="Tutup">&times;</button>' +
      '<div class="sorot-daftar">' +
        '<h2 class="sorot-judul">Kartu fenomena</h2>' +
        '<p>Kejadian besar yang mengubah cuaca satu wilayah sekaligus. ' +
        'Damage-nya paling gede. Pencet kartunya buat baca penjelasannya.</p>' +
        rak(fen) +
        '<h2 class="sorot-judul">Kartu parameter</h2>' +
        '<p>Keadaan udara yang bisa kamu naikkan atau turunkan. Damage-nya ' +
        'lebih kecil, tapi enak buat kombo.</p>' +
        rak(par) +
      '</div>';
    document.body.appendChild(s);
    sorot = s;
    requestAnimationFrame(function () { s.classList.add("tampil"); });
    s.addEventListener("click", function (e) {
      var img = e.target.closest(".sorot-rak img");
      if (img) {
        var k = DEK.filter(function (x) { return x.id === img.dataset.id; })[0];
        if (k) { bukaSorot(k, img); return; }
      }
      /* Tutup kalau yang dipencet DI LUAR panelnya, atau tombol silang.
         Mengklik panel kosongnya sendiri tidak menutup apa apa, sebab di
         daftar sepanjang ini orang pasti sering salah klik. */
      if (!e.target.closest(".sorot-daftar")) tutupSorot();
    });
    document.addEventListener("keydown", tombolEsc);
  }

  function buatKartu(k, bisaDipilih) {
    var nama = aman(k.nama);
    var sel = document.createElement("div");
    sel.className = "kartu";
    sel.dataset.id = k.id;
    /* Dua gambar ditumpuk dan yang membelakangi disembunyikan lewat
       backface-visibility, jadi pembalikannya satu transform saja. */
    sel.innerHTML =
      '<div class="kartu-dalam">' +
        '<img class="sisi-muka" src="' + aman(k.id) + '.svg" ' +
             'alt="' + nama + '" width="200" height="288" loading="lazy">' +
        '<img class="sisi-balik" src="' + aman(k.id) + '-balik.svg" ' +
             'alt="Penjelasan ' + nama + '" width="200" height="288" loading="lazy">' +
      '</div>' +
      '<button class="kartu-info" type="button" aria-pressed="false" ' +
              'aria-label="Penjelasan ' + nama + '">!</button>';

    var tombol = sel.querySelector(".kartu-info");
    tombol.addEventListener("click", function (e) {
      /* WAJIB dihentikan di sini. Tanpa ini, membaca penjelasan sekaligus
         memilih kartunya, dan itu jebakan yang menyebalkan. */
      e.stopPropagation();
      bunyi("balik");
      bukaSorot(k, sel);
    });

    /* Kartu di tangan bergoyang, kartu di dek tidak. Dek isinya 26 kartu
       dan kalau semuanya ikut bergoyang, halaman jadi ramai dan tidak ada
       yang jadi pusat perhatian. */
    daftarGerak(sel, !!bisaDipilih);

    if (bisaDipilih) {
      sel.classList.add("bisa-pilih");
      sel.setAttribute("role", "button");
      sel.setAttribute("tabindex", "0");
      sel.addEventListener("click", function () { pilih(sel, k); });
      sel.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pilih(sel, k); }
      });
    }
    return sel;
  }

  function pilih(sel, k) {
    if (S.fase !== "pilih") return;
    var i = S.dipilih.indexOf(k.id);
    bunyi(i >= 0 ? "batal" : "pilih");
    if (i >= 0) S.dipilih.splice(i, 1); else S.dipilih.push(k.id);
    sel.classList.toggle("dipilih", i < 0);
    sel.setAttribute("aria-pressed", i < 0 ? "true" : "false");
    el.serang.disabled = S.dipilih.length === 0;
    el.serang.textContent = S.dipilih.length
      ? "Serang pakai " + S.dipilih.length + " kartu"
      : "Serang";
  }

  /* ---------------------------- GILIRAN ---------------------------- */

  /* Susunan tangan DIPATOK, satu fenomena yang menolong, satu parameter
     yang menolong, dan satu jebakan yang jenisnya acak.

     Kenapa dipatok dan tidak diacak bebas. Pertama, pemain yang benar
     selalu memukul satu kartu besar dan satu kartu kecil, jadi sebaran
     kerusakannya sempit dan janji "roboh pas giliran ketujuh" bisa
     ditepati. Diacak bebas, ada giliran yang isinya dua kartu kecil saja
     dan pemain yang main benar tetap kalah gara gara sial. Kedua, rantai
     sebab jadi mungkin tiap giliran, bukan sesekali.

     Harganya satu dan sudah ditimbang. Jenis kartu yang cuma muncul
     sekali di tangan itu pasti yang menolong. Pemain yang jeli bisa
     memanfaatkan itu tanpa tahu ilmunya. Dibiarkan, sebab ini permainan
     belajar, bukan adu siasat. */
  function kocok(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  /* Ambil n kartu BERBEDA dari sebuah daftar. Tanpa penjaga kembar, undian
     bebas bisa memberi dua kartu yang sama persis di satu tangan, dan itu
     terbaca sebagai cacat, bukan sebagai kesialan. */
  function ambilBeda(daftar, n) {
    return kocok(daftar.slice()).slice(0, Math.min(n, daftar.length));
  }

  function undiTangan() {
    if (tingkat.susun === "pasti") {
      return kocok([acak(FEN_BAIK), acak(PAR_BAIK), acak(CELAKA)]);
    }
    /* Giliran yang isinya jebakan semua. Ini bukan kesialan, ini PELAJARAN,
       dan satu satunya langkah benar di sini adalah melewati giliran. */
    if (tingkat.jebakanPenuh && Math.random() < tingkat.jebakanPenuh) {
      return ambilBeda(CELAKA, tingkat.kartu);
    }
    return ambilBeda(SEMUA_KARTU, tingkat.kartu);
  }

  /* Kartu baru DIBAGIKAN dari tumpukan di kanan, bukan muncul begitu saja.
     Diminta pemilik, "tumpukkan kartu tadi memberikan kartu baru seperti
     permainan poker". Caranya kartunya ditaruh dulu di tempat akhirnya,
     baru diukur berapa jauh tumpukan dari situ, lalu jarak itu dipasang
     sebagai keadaan awal yang diturunkan pelan pelan tiap bingkai. Sama
     dengan cara sorotan kartu, dan sebabnya sama, yang digeser cuma
     transform jadi tata letaknya tidak dihitung ulang tiap bingkai. */
  /* Tombol Serang dan Lewati dipatok dari TENGAH meja, digeser sejauh
     separuh lebar tangan. Dulu angkanya dipaku 158, benar untuk tiga kartu
     dan salah untuk empat atau lima. Begitu rank Knight dan Dragonslayer
     lahir, tangannya melebar sampai 448 piksel dan tombolnya ketimpa
     kartu. Dilaporkan pemilik.

     Lebarnya DIUKUR, bukan dihitung dari jumlah kartu, supaya dia tetap
     benar kalau suatu saat lebar kartu atau tindihannya diubah di CSS.

     DUA JEBAKAN di pengukurannya, dua duanya sudah kena.

     Jangan mengukur #tangan. Dia wadah lentur selebar meja, jadi yang
     didapat lebar layar bukan lebar kartu, dan tombolnya terlempar ke
     tepi layar.

     Jangan memakai getBoundingClientRect pada kartunya. Kartu sedang
     dianimasikan waktu dibagi, dan kotak itu ikut transform, jadi
     angkanya berubah ubah tiap bingkai. offsetLeft dan offsetWidth
     memulangkan angka TATA LETAK yang kebal transform. */
  function sembunyiUlang(sembunyi) {
    if (!el["ulang-awal"]) return;
    el["ulang-awal"].hidden = sembunyi;
    if (sembunyi) batalYakin();
  }

  /* DUA LANGKAH, bukan sekali pencet. Tombol ini membuang permainan yang
     sedang berjalan, dan dia duduk persis di samping kartu yang sering
     diklik. Sekali salah pencet, tujuh giliran hilang. Klik pertama cuma
     mengubah tulisannya jadi tanya, dan kalau tiga detik tidak dijawab dia
     kembali sendiri supaya tidak ada tombol yang menggantung dalam keadaan
     bertanya. */
  var jamYakin = null;
  function batalYakin() {
    clearTimeout(jamYakin); jamYakin = null;
    if (!el["ulang-awal"]) return;
    el["ulang-awal"].textContent = "Ulang dari awal";
    el["ulang-awal"].classList.remove("ulang-yakin");
  }
  function tanyaUlang() {
    if (jamYakin) { batalYakin(); mulai(); return; }
    el["ulang-awal"].textContent = "Yakin? Pencet lagi";
    el["ulang-awal"].classList.add("ulang-yakin");
    jamYakin = setTimeout(batalYakin, 3000);
  }

  function setelSisiTombol() {
    var m = document.querySelector(".meja");
    if (!m || !el.tangan) return;
    var k = el.tangan.querySelectorAll(".kartu");
    if (!k.length) return;
    var kiri = k[0].offsetLeft;
    var kanan = k[k.length - 1].offsetLeft + k[k.length - 1].offsetWidth;
    var w = kanan - kiri;
    if (w > 0) m.style.setProperty("--sisi", (w / 2 + 18) + "px");
  }

  function gambarTangan(bagikan) {
    el.tangan.innerHTML = "";
    var sel = S.tangan.map(function (k) {
      var e = buatKartu(k, true);
      el.tangan.appendChild(e);
      return e;
    });
    if (!bagikan || DIAM) return;
    var tum = document.getElementById("tumpukan");
    var tr = tum ? tum.getBoundingClientRect() : null;
    if (!tr || !tr.width) return;
    sel.forEach(function (e, i) {
      setTimeout(function () { bunyi("bagi"); }, i * 140);
      var r = e.getBoundingClientRect();
      var g = e._gerak;
      g.dariX = (tr.left + tr.width / 2) - (r.left + r.width / 2);
      g.dariY = (tr.top + tr.height / 2) - (r.top + r.height / 2);
      g.masuk = 1;
      g.tunda = i * 0.14;
    });
  }

  function cariRantai(pilihan) {
    var fen = pilihan.filter(function (k) { return k.jenis === "fenomena" && k.menolong; });
    var par = pilihan.filter(function (k) { return k.jenis === "parameter" && k.menolong; });
    for (var a = 0; a < fen.length; a++) {
      for (var b = 0; b < par.length; b++) {
        if ((fen[a].rantai || []).indexOf(par[b].id) >= 0) {
          return { fen: fen[a], par: par[b] };
        }
      }
    }
    return null;
  }

  function lempar(e, tuju, skala, putar, tunda) {
    var r = e.getBoundingClientRect();
    var d = {
      dx: (tuju.left + tuju.width / 2) - (r.left + r.width / 2),
      dy: (tuju.top + tuju.height / 2) - (r.top + r.height / 2),
      skala: skala, putar: putar
    };
    if (DIAM) { e._gerak.pergi = d; e._gerak.pergiT = 1; return; }
    setTimeout(function () { e._gerak.pergi = d; }, tunda);
  }

  function serang() {
    if (S.fase !== "pilih" || !S.dipilih.length) return;
    var pilihan = S.tangan.filter(function (k) { return S.dipilih.indexOf(k.id) >= 0; });

    var rantai = cariRantai(pilihan);
    var luka = 0, pulih = 0;
    pilihan.forEach(function (k) {
      if (k.menolong) luka += k.damage; else pulih += k.damage;
    });
    /* Pengalinya cuma kena ke pukulan, TIDAK ke penyembuhan. Kalau ikut
       dikali, memainkan kartu jebakan bareng rantai malah jadi untung. */
    if (rantai) luka = Math.round(luka * KOMBO);

    S.salah += pilihan.filter(function (k) { return !k.menolong; }).length;
    catat(pilihan);
    S.fase = "hasil";
    el.aksi.hidden = true;
    sembunyiUlang(true);
    el.pesan.hidden = true;

    var bosR = el["bos-gambar"].getBoundingClientRect();
    var tum = document.getElementById("tumpukan");
    var tumR = tum.getBoundingClientRect();
    var semua = [].slice.call(el.tangan.querySelectorAll(".kartu"));
    var dipakai = semua.filter(function (e) { return e.classList.contains("dipilih"); });
    var sisa = semua.filter(function (e) { return !e.classList.contains("dipilih"); });

    /* Yang dipilih dilempar ke bos satu per satu. Yang tidak dipilih baru
       dibuang ke tumpukan SESUDAH serangannya mendarat, bukan barengan,
       supaya jelas mana yang menyerang dan mana yang sekadar dibuang. */
    dipakai.forEach(function (e, i) {
      setTimeout(function () { bunyi("lempar"); }, i * 110);
      lempar(e, bosR, 0.22, (i - 1) * 16, i * 110);
    });
    var tHantam = DIAM ? 0 : (dipakai.length - 1) * 110 + 360;

    setTimeout(function () {
      S.hp = Math.max(0, Math.min(HP_AWAL, S.hp - luka + pulih));
      pasangBos();
      getarkan(luka, pulih);
      efekHantam(luka, pulih);
      /* Kalau dua duanya terjadi, yang dibunyikan DUA DUANYA, hujannya
         dulu lalu tawanya. Dipilih salah satu, pemain kehilangan separuh
         kabar tentang gilirannya sendiri. */
      if (luka > 0) bunyi("kena");
      if (pulih > 0) setTimeout(function () { bunyi("pulih"); }, luka > 0 ? 260 : 0);
      sisa.forEach(function (e, i) { lempar(e, tumR, 0.35, 150, i * 70); });
    }, tHantam);

    setTimeout(function () {
      el.tangan.hidden = true;
      tampilHasil(pilihan, rantai, luka, pulih);
    }, tHantam + (DIAM ? 0 : 1250));
  }

  function lewati() {
    if (S.fase !== "pilih") return;
    catat([]);
    S.fase = "hasil";
    el.aksi.hidden = true;
    sembunyiUlang(true);
    el.pesan.hidden = true;
    var tum = document.getElementById("tumpukan").getBoundingClientRect();
    var semua = [].slice.call(el.tangan.querySelectorAll(".kartu"));
    semua.forEach(function (e, i) { lempar(e, tum, 0.35, 150, i * 70); });
    setTimeout(function () {
      el.tangan.hidden = true;
      tampilHasil([], null, 0, 0);
    }, DIAM ? 0 : 620);
  }

  /* ----------------------------- TAMPIL ----------------------------- */

  function pasangBos() {
    var persen = S.hp / HP_AWAL * 100;
    /* Dipasang SEKALI di wadahnya sebagai --hp, lalu isi bar dan angkanya
       dua duanya ikut ke situ lewat CSS. Kalau keduanya diatur sendiri
       sendiri dari sini, sekali waktu salah satu lupa diperbarui dan
       angkanya melayang jauh dari ujung isinya. */
    el["hp"].style.setProperty("--hp", persen + "%");
    el["hp-angka"].textContent = S.hp;
    el.giliran.textContent = S.giliran;
    el["bos-gambar"].src =
      S.hp <= 0 ? "bos-padam.png?v=9" : (persen <= 60 ? "bos-terluka.png?v=9" : "bos-sehat.png?v=9");
  }

  /* Src-nya dipasang SEBELUM kelas tampilnya, dan pemudaran dimulai satu
     bingkai kemudian lewat requestAnimationFrame. Kalau dua duanya diset
     dalam satu tarikan, browser kadang sempat menggambar gambarnya sudah
     keburu buram penuh dan transisinya hilang. */
  function gantiLatar(berkas) {
    var g = el["latar-akhir"];
    if (!g || g.classList.contains("tampil")) return;
    g.src = berkas;
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { g.classList.add("tampil"); });
    });
  }

  /* Angkanya meletus satu per satu, bukan berbarengan. Tundaan 90
     milidetik per baris itu yang bikin hasilnya terasa dibacakan, bukan
     ditumpahkan sekaligus. */
  function barisKartu(k, i) {
    var tunda = DIAM ? 0 : 60 + i * 90;
    return '<li class="hasil-baris ' + (k.menolong ? "baris-baik" : "baris-buruk") + '">' +
      '<span class="hasil-nama">' + aman(k.nama) + '</span>' +
      '<span class="hasil-angka" style="animation-delay:' + tunda + 'ms">' +
        (k.menolong ? "-" : "+") + k.damage + '</span>' +
      '<span class="hasil-akibat">' + aman(k.akibat) + '</span></li>';
  }

  /* ========================== RAPOR ==========================

     Dulu di layar tamat orang cuma dibilangi "ada 2 kartu yang malah
     menyehatkan dia". Jumlahnya saja, tanpa yang mana dan tanpa kenapa.
     Padahal justru di detik itu dia paling ingin tahu.

     Yang dicatat DUA MACAM, dan yang kedua sama pentingnya.
       SALAH  kartu jebakan yang terlanjur dimainkan
       LEWAT  kartu menolong yang ada di tangan tapi tidak dipakai

     Yang kedua baru mungkin dicatat sejak tangan tidak lagi bersusunan
     pasti. Di rank Squire hampir tidak pernah terjadi, di Knight dan
     Dragonslayer sering, dan di situlah pelajarannya. */
  function catat(pilihan) {
    var dipakai = pilihan.map(function (k) { return k.id; });
    S.catatan.push({
      g: S.giliran,
      salah: pilihan.filter(function (k) { return !k.menolong; }),
      lewat: S.tangan.filter(function (k) {
        return k.menolong && dipakai.indexOf(k.id) < 0;
      }),
    });
  }

  var PINTU = { Atmosight: "../atmosight/", Smokewatch: "../smokewatch/",
                Oceansight: "../oceansight/" };

  /* Dikelompokkan per kartu, bukan per giliran. Orang yang memainkan El
     Nino tiga kali tidak perlu dibacakan alasan yang sama tiga kali, dia
     perlu tahu bahwa dia mengulanginya tiga kali. */
  function kumpulkan(ambil) {
    var peta = {}, urut = [];
    S.catatan.forEach(function (c) {
      ambil(c).forEach(function (k) {
        if (!peta[k.id]) { peta[k.id] = { k: k, g: [] }; urut.push(peta[k.id]); }
        peta[k.id].g.push(c.g);
      });
    });
    return urut;
  }

  function barisRapor(x, buruk) {
    var k = x.k, pintu = PINTU[k.lihat];
    return '<li class="rapor-baris ' + (buruk ? "rapor-buruk" : "rapor-baik") + '">' +
      '<span class="rapor-nama">' + aman(k.nama) + '</span>' +
      '<span class="rapor-angka">' + (buruk ? "+" : "-") + k.damage + '</span>' +
      '<span class="rapor-giliran">giliran ' + x.g.join(", ") + '</span>' +
      '<span class="rapor-sebab">' + aman(k.akibat) + '</span>' +
      (pintu ? '<a class="rapor-tautan" href="' + pintu + '">Lihat di ' +
               aman(k.lihat) + ' &#8594;</a>' : '') +
      '</li>';
  }

  function rapor() {
    var salah = kumpulkan(function (c) { return c.salah; });
    var lewat = kumpulkan(function (c) { return c.lewat; });
    var h = '<div class="rapor"><p class="rapor-judul">Rapor</p>';
    if (!salah.length && !lewat.length) {
      return h + '<p class="rapor-bersih">Bersih. Tiap giliran kamu memainkan ' +
             'semua kartu yang menolong, dan tidak satu pun jebakan.</p></div>';
    }
    if (salah.length) {
      h += '<p class="rapor-kepala">Kartu yang justru menyehatkan dia</p>' +
           '<ul class="rapor-daftar">' +
           salah.map(function (x) { return barisRapor(x, true); }).join("") + '</ul>';
    }
    if (lewat.length) {
      h += '<p class="rapor-kepala">Kartu menolong yang kamu tinggalkan</p>' +
           '<ul class="rapor-daftar">' +
           lewat.map(function (x) { return barisRapor(x, false); }).join("") + '</ul>';
    }
    return h + '</div>';
  }

  function tampilHasil(pilihan, rantai, luka, pulih) {
    var habis = S.hp <= 0;
    var mentok = S.giliran >= GILIRAN_MAKS;
    var h = "";

    if (!pilihan.length) {
      h += '<p class="hasil-kepala">Giliran dilewati. Si Kemarau tidak kena apa apa.</p>';
    } else {
      h += '<ul class="hasil-daftar">' + pilihan.map(barisKartu).join("") + "</ul>";
      if (rantai) {
        h += '<p class="hasil-rantai"><b>Rantai sebab.</b> ' + aman(rantai.fen.nama) +
             ' memang yang bikin ' + aman(rantai.par.nama) +
             '. Pukulannya jadi 1,6 kali.</p>';
      }
      h += '<p class="hasil-jumlah">Si Kemarau kena <b>' + luka + '</b>' +
           (pulih ? ' tapi pulih <b class="pulih">' + pulih + '</b>' : '') + '.</p>';
    }

    if (habis) {
      var naik = TINGKAT[tingkat.nomor];   // tingkat berikutnya, kalau ada
      h += '<div class="tamat menang"><p class="tamat-judul">Hujan turun.</p>' +
           '<p>Si Kemarau padam di giliran ke-' + S.giliran +
           ', rank ' + aman(tingkat.nama) + '.' +
           (S.salah ? ' Kamu sempat memainkan ' + S.salah +
                      ' kartu yang malah menyehatkan dia.'
                    : ' Dan tidak sekali pun kamu salah pilih kartu.') +
           (naik ? ' Sekarang naik rank jadi ' + aman(naik.nama) + '. ' +
                   aman(naik.jelas) : '') +
           '</p></div>' + rapor();
    } else if (mentok) {
      h += '<div class="tamat kalah"><p class="tamat-judul">Tujuh giliran habis.</p>' +
           '<p>Si Kemarau masih menyala, sisa ' + S.hp + ' HP.' +
           (S.salah ? ' Ada ' + S.salah + ' kartu yang kamu mainkan tapi justru ' +
                      'menyehatkan dia. Buka deknya di bawah, baca penjelasannya, ' +
                      'lalu coba lagi.'
                    : ' Kartu pilihanmu sudah benar semua, tinggal kurang tenaga. ' +
                      'Coba cari rantai sebabnya, fenomena bareng parameter yang ' +
                      'memang dia yang bikin, pukulannya jadi 1,6 kali.') +
           '</p></div>' + rapor();
    }

    el.hasil.innerHTML = h;
    el.hasil.hidden = false;
    el.tangan.hidden = true;
    el.aksi.hidden = true;
    sembunyiUlang(true);
    el.pesan.hidden = true;

    /* Tombolnya ditulis ke wadahnya SENDIRI, bukan diselipkan ke dalam
       panel teks. Panel teks itu bisa digulir dan tingginya dibatasi, dan
       tombol yang ikut di dalamnya ketelan waktu isinya panjang. Persis itu
       yang terjadi di layar tamat, isinya paling panjang dan tombol Main
       Lagi tidak pernah kelihatan. Dilaporkan pemilik, "setelah menang atau
       kalah gada tombol reset". */
    var bolehNaik = habis && TINGKAT[tingkat.nomor];
    el["aksi-hasil"].innerHTML = (habis || mentok)
      ? (bolehNaik ? '<button class="pil" id="naik" type="button">Naik jadi ' +
                     aman(TINGKAT[tingkat.nomor].nama) + '</button>' : '') +
        '<button class="pil' + (bolehNaik ? " pil-garis" : "") +
          '" id="ulang" type="button">Main lagi</button>' +
        '<a class="pil pil-garis" href="../">Ke beranda</a>'
      : '<button class="pil" id="lanjut" type="button">Giliran berikutnya</button>';
    el["aksi-hasil"].hidden = false;

    if (habis || mentok) {
      S.fase = "tamat";
      /* DIGULIRKAN KE RAPOR. Panel ini tingginya dibatasi dan bisa
         digulir, dan di layar tamat isinya paling panjang, jadi rapornya
         jatuh di bawah lipatan. Padahal justru itu yang paling ingin
         dibaca orang di detik itu. Hasil giliran terakhirnya tetap ada,
         tinggal digulir balik ke atas. */
      var rp = el.hasil.querySelector(".rapor");
      if (rp) setTimeout(function () {
        el.hasil.scrollTop = rp.offsetTop - el.hasil.offsetTop - 12;
      }, DIAM ? 0 : 700);
      /* Tempatnya ikut berubah. Bos padam, hujan kembali dan padangnya
         menghijau. Bos menang, padangnya hangus. Latar penutupnya ditumpuk
         di atas latar kemarau lalu dipudarkan masuk, jadi perubahannya
         terbaca sebagai akibat, bukan sebagai layar baru. Ditunda sebentar
         supaya pemain sempat melihat pukulan terakhirnya mendarat dulu. */
      gantiLatar(habis ? "latar-subur.png" : "latar-hancur.png");
      /* Ditunda sebentar. Pemain baru saja melihat pukulan terakhirnya
         mendarat, dan kalau naganya langsung pecah di bingkai yang sama
         dua kejadian itu bertabrakan dan tidak ada yang terbaca. */
      setTimeout(habis ? pecahkanBos : besarkanBos, 520);
      setTimeout(function () { bunyi(habis ? "menang" : "kalah"); }, 420);
      document.getElementById("ulang").addEventListener("click", function () {
        bunyi("tombol"); mulai();
      });
      /* Naik tingkat DISIMPAN dulu baru mulai, sebab mulai() membaca
         tingkatnya dari simpanan. */
      var tn = document.getElementById("naik");
      if (tn) tn.addEventListener("click", function () {
        bunyi("tombol"); simpanTingkat(tingkat.nomor + 1); mulai();
      });
    } else {
      document.getElementById("lanjut").addEventListener("click", function () {
        bunyi("tombol"); lanjut();
      });
    }
  }

  function lanjut() {
    /* Penjaga fase. Tombolnya memang disembunyikan sesudah dipakai, tapi
       disembunyikan bukan berarti hilang dari DOM, dan tanpa penjaga ini
       pemanggilan kedua tetap menambah nomor giliran. Ketahuan waktu alat
       uji memanggilnya berulang dan nomor gilirannya sampai 615. */
    if (S.fase !== "hasil") return;
    S.giliran += 1;
    S.fase = "pilih";
    S.dipilih = [];
    S.tangan = undiTangan();
    el.hasil.hidden = true;
    el["aksi-hasil"].hidden = true;
    el.tangan.hidden = false;
    el.aksi.hidden = false;
    sembunyiUlang(false);
    el.pesan.hidden = false;
    el.serang.disabled = true;
    el.serang.textContent = "Serang";
    gambarTangan(true);
    pasangBos();
    setelSisiTombol();
  }

  function mulai() {
    bacaTingkat();
    S = { hp: HP_AWAL, giliran: 1, fase: "pilih", dipilih: [],
          tangan: undiTangan(), salah: 0, catatan: [] };
    /* Sisa awan, hujan, atau api dari giliran terakhir dibersihkan. Tanpa
       ini, main lagi sesudah kalah dimulai dengan naga yang masih terbakar. */
    var sisaEfek = el.efek.querySelectorAll("*");
    for (var i = 0; i < sisaEfek.length; i++) sisaEfek[i].remove();
    [el.mendung, el.langit].forEach(function (w) {
      if (w) { w.classList.remove("pergi"); w.innerHTML = ""; }
    });
    /* Naganya dipulihkan. Serpihannya sudah ikut tersapu bersama isi
       .efek di atas, tapi naga aslinya masih tak terlihat dan masih
       memakai kelas membesar kalau tadi pemain kalah. */
    if (el["bos-gambar"]) {
      el["bos-gambar"].style.opacity = "";
      el["bos-gambar"].classList.remove("membesar");
    }
    /* Padangnya dibalikkan ke kemarau. Src-nya ikut dikosongkan, bukan cuma
       kelasnya dibuang, supaya pemudaran berikutnya mulai dari nol lagi
       walau latar penutupnya kebetulan sama dengan yang tadi. */
    if (el["latar-akhir"]) {
      el["latar-akhir"].classList.remove("tampil");
      el["latar-akhir"].removeAttribute("src");
    }
    el.hasil.hidden = true;
    el["aksi-hasil"].hidden = true;
    el.tangan.hidden = false;
    el.aksi.hidden = false;
    sembunyiUlang(false);
    el.pesan.hidden = false;
    el.serang.disabled = true;
    el.serang.textContent = "Serang";
    gambarTangan(true);
    pasangBos();
    if (el["tingkat-nama"]) el["tingkat-nama"].textContent = tingkat.nama;
    setelSisiTombol();
  }

  /* ============================ TUTORIAL ============================

     Muncul sendiri SEKALI, di kunjungan pertama. Sesudah itu disimpan di
     localStorage dan tidak mengganggu lagi, tapi tetap bisa dibuka dari
     tanda tanya di bilah atas.

     localStorage DIBUNGKUS try catch, dan itu bukan kehati hatian
     berlebihan. Di jendela penyamaran, atau waktu orangnya memblokir data
     situs, membacanya langsung melempar galat, dan galat di sini bakal
     membunuh seluruh pemuatan permainan. Kalau gagal, tutorialnya tampil
     lagi, dan itu kerugian paling ringan yang bisa dipilih.

     Gambarnya MEMAKAI ULANG aset yang sudah ada, tidak ada berkas baru
     sama sekali. Naganya gambar naga yang itu juga, kartunya kartu asli
     dari deknya. Jadi apa yang dilihat di tutorial persis sama dengan yang
     nanti dilihat waktu main. */
  /* ====================== CERITA SI KEMARAU ======================

     Ini BUKAN hiasan. Pemilik minta ceritanya sekaligus jadi petunjuk, dan
     itu cara paling halus mengajari pemain. Kalau aturannya ditulis sebagai
     daftar, orang melewatinya. Ditulis sebagai cerita tentang kenapa naganya
     kuat dan kenapa dia bisa padam, orang membacanya sampai habis dan
     petunjuknya ikut masuk.

     Yang disebut di sini SIFATNYA saja, uap air dan udara yang naik. Nama
     kartunya sengaja TIDAK disebut satu pun. Disebut, permainannya selesai
     sebelum dimulai. */
  var LORE = [
    "Dulu dia cuma bara kecil di bawah tanah yang retak. Tiap kemarau " +
    "lewat tanpa hujan, baranya tambah besar. Sampai suatu musim dia " +
    "bangun jadi naga dan bikin sarang di aula ini.",

    "Napasnya bikin laut di sekitar kita jadi dingin, dan laut yang dingin " +
    "itu malas menguapkan air. Tanpa uap air, langit tidak punya bahan " +
    "buat bikin awan. Begitu caranya dia bertahan, dia memutus hujan dari " +
    "hulunya, jauh sebelum awan sempat terbentuk."
  ];
  var LORE_LEMAH =
    "Dia tidak tahan sama dua hal. Apa pun yang mengisi langit dengan uap " +
    "air, dan apa pun yang memaksa udara naik ke atas. Udara yang naik itu " +
    "yang jadi awan, dan awan yang cukup tinggi pasti jatuh jadi hujan. " +
    "Siram tanahnya, baranya padam.";

  function bukaLore() {
    el.lore.innerHTML =
      '<div class="lore-panel">' +
        '<button class="sorot-tutup" type="button" aria-label="Tutup">&times;</button>' +
        '<img class="lore-bos" src="bos-sehat.png?v=9" alt="" width="48" height="48">' +
        '<h2 class="lore-judul">Si Kemarau</h2>' +
        '<p class="lore-gelar">Naga kekeringan</p>' +
        LORE.map(function (t) { return "<p>" + aman(t) + "</p>"; }).join("") +
        '<h3 class="lore-lemah-judul">Titik lemahnya</h3>' +
        '<p class="lore-lemah">' + aman(LORE_LEMAH) + '</p>' +
      '</div>';
    el.lore.hidden = false;
    requestAnimationFrame(function () { el.lore.classList.add("tampil"); });
  }

  /* Pemilih tingkat. Memakai lapisan yang sama dengan cerita bos, sebab
     dua duanya panel tengah layar yang menutup seluruh permainan, dan
     membangun lapisan kedua cuma untuk ini pemborosan. */
  function bukaTingkat() {
    el.lore.innerHTML =
      '<div class="lore-panel">' +
        '<button class="sorot-tutup" type="button" aria-label="Tutup">&times;</button>' +
        '<h2 class="lore-judul">Pilih rank</h2>' +
        '<p class="lore-gelar">Nyawa Si Kemarau tetap 1400 dan gilirannya ' +
          'tetap tujuh di semua rank. Yang berubah cuma kartu di tanganmu.</p>' +
        '<ul class="tingkat-daftar">' +
        TINGKAT.map(function (t) {
          return '<li class="tingkat-baris' +
            (t.nomor === tingkat.nomor ? " tingkat-kini" : "") + '">' +
            '<button class="tingkat-tombol" data-tingkat="' + t.nomor + '" type="button">' +
              '<span class="tingkat-gelar">' + aman(t.nama) + '</span>' +
              '<span class="tingkat-kartu">' + t.kartu + ' kartu</span>' +
            '</button>' +
            '<p class="tingkat-jelas">' + aman(t.jelas) + '</p></li>';
        }).join("") +
        '</ul></div>';
    el.lore.hidden = false;
    requestAnimationFrame(function () { el.lore.classList.add("tampil"); });
  }

  function tutupLore() {
    el.lore.classList.remove("tampil");
    setTimeout(function () { el.lore.hidden = true; }, DIAM ? 0 : 240);
  }

  var KUNCI_TUTOR = "aduCuaca.tutorSelesai";

  function sudahTutor() {
    try { return localStorage.getItem(KUNCI_TUTOR) === "1"; } catch (e) { return false; }
  }
  function tandaiTutor() {
    try { localStorage.setItem(KUNCI_TUTOR, "1"); } catch (e) { /* tidak apa apa */ }
  }

  var SLIDE = [
    {
      judul: "Lawanmu Si Kemarau",
      teks: "Naga kekeringan. Nyawanya 1400 dan kamu cuma punya tujuh " +
            "giliran. Satu satunya cara ngalahin dia, bikin hujan turun.",
      gambar: '<img class="tutor-bos" src="bos-sehat.png?v=9" alt="" width="48" height="48">'
    },
    {
      judul: "Tiap giliran dapat tiga kartu",
      teks: "Kartu FENOMENA itu kejadian besar, damage-nya paling gede. " +
            "Kartu PARAMETER itu keadaan udara yang bisa kamu naikkan atau " +
            "turunkan, damage-nya lebih kecil.",
      gambar: '<div class="tutor-kartu">' +
              '<img src="la-nina.svg" alt=""><img src="kelembapan-naik.svg" alt="">' +
              '<img src="el-nino.svg" alt=""></div>'
    },
    {
      judul: "Kartunya tidak kasih tahu jawabannya",
      teks: "Tidak ada tanda plus minus di kartunya, sengaja. Kamu harus " +
            "tahu sendiri mana yang bikin hujan. Salah pilih, Si Kemarau " +
            "malah pulih dan tubuhnya terbakar.",
      gambar: '<div class="tutor-dua">' +
              '<span class="tutor-cap tutor-benar">Benar, hujan turun</span>' +
              '<span class="tutor-cap tutor-salah">Salah, dia pulih</span></div>'
    },
    {
      judul: "Sambung rantai sebabnya",
      teks: "Mainkan fenomena bareng parameter yang MEMANG dia yang bikin, " +
            "pukulannya jadi 1,6 kali. La Nina bikin laut kita hangat, " +
            "jadi dua kartu ini satu rantai.",
      gambar: '<div class="tutor-kartu tutor-rantai">' +
              '<img src="la-nina.svg" alt=""><span class="tutor-plus">+</span>' +
              '<img src="sml-naik.svg" alt=""></div>'
    },
    {
      judul: "Belum hafal kartunya?",
      teks: "Pencet tanda seru di pojok kartu, penjelasannya muncul besar. " +
            "Tanda seru di tumpukan kanan buka daftar semua kartu.",
      gambar: '<div class="tutor-kartu"><span class="tutor-sorot">' +
              '<img src="itcz.svg" alt=""><i class="tutor-seru">!</i></span></div>'
    }
  ];

  var slideKe = 0;

  function gambarSlide() {
    var s = SLIDE[slideKe];
    var titik = SLIDE.map(function (_, i) {
      return '<span class="tutor-titik' + (i === slideKe ? " kini" : "") + '"></span>';
    }).join("");
    el.tutor.innerHTML =
      '<div class="tutor-panel">' +
        '<div class="tutor-gambar">' + s.gambar + '</div>' +
        '<h2 class="tutor-judul">' + aman(s.judul) + '</h2>' +
        '<p class="tutor-teks">' + aman(s.teks) + '</p>' +
        '<div class="tutor-kaki">' +
          '<span class="tutor-titik-baris">' + titik + '</span>' +
          '<div class="tutor-tombol">' +
            (slideKe > 0 ? '<button class="pil pil-garis" data-aksi="mundur" type="button">Balik</button>' : '') +
            '<button class="pil" data-aksi="maju" type="button">' +
              (slideKe === SLIDE.length - 1 ? "Mulai main" : "Lanjut") + '</button>' +
          '</div>' +
        '</div>' +
        (slideKe < SLIDE.length - 1
          ? '<button class="tutor-lewati" data-aksi="tutup" type="button">Lewati</button>' : '') +
      '</div>';
  }

  function bukaTutor() {
    slideKe = 0;
    el.tutor.hidden = false;
    gambarSlide();
    requestAnimationFrame(function () { el.tutor.classList.add("tampil"); });
  }

  function tutupTutor() {
    el.tutor.classList.remove("tampil");
    tandaiTutor();
    setTimeout(function () { el.tutor.hidden = true; }, DIAM ? 0 : 240);
  }

  /* ------------------------------ MUAT ------------------------------ */

  fetch("kartu.json")
    .then(function (r) {
      if (!r.ok) throw new Error(r.status);
      return r.json();
    })
    .then(function (d) {
      DEK = d;
      SEMUA_KARTU = d.slice();
      FEN_BAIK = d.filter(function (k) { return k.menolong && k.jenis === "fenomena"; });
      PAR_BAIK = d.filter(function (k) { return k.menolong && k.jenis === "parameter"; });
      CELAKA = d.filter(function (k) { return !k.menolong; });
      el.serang.addEventListener("click", serang);
      el.lewati.addEventListener("click", function () { bunyi("tombol"); lewati(); });
      if (el["ulang-awal"]) el["ulang-awal"].addEventListener("click", function () {
        bunyi("tombol"); tanyaUlang();
      });
      if (el["tingkat-pilih"]) el["tingkat-pilih"].addEventListener("click", function () {
        bunyi("tombol"); bukaTingkat();
      });
      /* Satu pendengar di lapisannya, bukan satu per tombol, sebab isinya
         ditulis ulang tiap kali dibuka. */
      el.lore.addEventListener("click", function (e) {
        var b = e.target.closest && e.target.closest(".tingkat-tombol");
        if (!b) return;
        bunyi("tombol");
        simpanTingkat(parseInt(b.getAttribute("data-tingkat"), 10));
        tutupLore();
        mulai();
      });

      /* DICOBA LANGSUNG begitu halaman siap, diminta pemilik, "musiknya di
         play langsung ketika sudah ada di page game ini".

         Percobaan ini sering gagal dan itu bukan bug. Browser melarang
         suara di halaman yang belum pernah disentuh orangnya, dan larangan
         itu tidak bisa diakali. Datang dari landing lewat klik pun tidak
         menolong, sentuhan tidak ikut pindah halaman.

         Jadi penangan sentuhan DITAHAN sampai suaranya benar benar jalan,
         bukan dicopot sesudah sekali coba. Dicopot kecepatan, percobaan
         pertamanya gagal dan tidak ada lagi yang menyalakan. */
      if (window.Suara) window.Suara.nyalakan();
      var nyalakanSampaiJalan = function () {
        if (!window.Suara) return;
        window.Suara.nyalakan();
        if (window.Suara.jalan()) {
          document.removeEventListener("pointerdown", nyalakanSampaiJalan);
          document.removeEventListener("keydown", nyalakanSampaiJalan);
        }
      };
      document.addEventListener("pointerdown", nyalakanSampaiJalan);
      document.addEventListener("keydown", nyalakanSampaiJalan);

      var tombolSuara = document.getElementById("tukar-suara");
      function pasangSuara() {
        var on = !(window.Suara && window.Suara.bisu());
        tombolSuara.classList.toggle("mati", !on);
        tombolSuara.innerHTML = on ? "&#9834;" : "&#9834;";
        tombolSuara.setAttribute("aria-pressed", on ? "true" : "false");
      }
      tombolSuara.addEventListener("click", function () {
        if (window.Suara) window.Suara.tukar();
        pasangSuara();
        bunyi("tombol");
      });
      pasangSuara();
      el["tumpukan-info"].addEventListener("click", bukaSemua);

      el.tutor.addEventListener("click", function (e) {
        var t = e.target.closest("[data-aksi]");
        if (!t) {
          /* Klik di luar panelnya ikut menutup, tapi klik di dalam panel
             tidak. Di slide yang isinya kalimat panjang orang sering
             menyeret teks, dan kalau itu ikut menutup rasanya seperti
             tutorialnya kabur. */
          if (!e.target.closest(".tutor-panel")) tutupTutor();
          return;
        }
        var a = t.dataset.aksi;
        if (a === "tutup") { tutupTutor(); return; }
        if (a === "mundur") { slideKe -= 1; gambarSlide(); return; }
        if (slideKe === SLIDE.length - 1) { tutupTutor(); return; }
        slideKe += 1; gambarSlide();
      });
      document.getElementById("buka-tutor").addEventListener("click", bukaTutor);
      document.getElementById("bos-info").addEventListener("click", bukaLore);
      el.lore.addEventListener("click", function (e) {
        if (!e.target.closest(".lore-panel") || e.target.closest(".sorot-tutup")) tutupLore();
      });
      if (!sudahTutor()) bukaTutor();
      document.querySelector(".tumpukan-angka b").textContent = DEK.length;
      mulai();
    })
    .catch(function () {
      el.gagal.hidden = false;
      document.getElementById("arena").hidden = true;
    });
})();
