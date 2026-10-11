/* Suara Adu Cuaca.

   TIDAK ADA SATU PUN BERKAS AUDIO di sini, semuanya DIBANGKITKAN di
   tempat lewat Web Audio. Tiga alasan, dan ketiganya menentukan.

   SATU, LISENSI. Suara game yang beredar di internet itu lisensinya
   berantakan, dan situs ini punya perusahaan. Nada yang dibangkitkan
   sendiri tidak punya pemilik lain.

   DUA, BERAT. Satu musik latar saja gampang 2 sampai 4 megabita. Seluruh
   berkas ini belasan kilobita, dan dia memuat musik DAN sembilan efek.

   TIGA, COCOK. Game ini pixel art, dan bunyi kotak dari osilator persegi
   itu memang bunyi mesin zaman itu. Suara rekaman yang halus malah
   terasa salah tempel.

   SATU HAL YANG TIDAK BISA DITAWAR, browser MELARANG suara sebelum orangnya
   menyentuh halaman. Jadi mesinnya baru dinyalakan di sentuhan pertama,
   apa pun sentuhannya. Dicoba dinyalakan lebih awal, yang terjadi bukan
   suara tapi galat di konsol. */

window.Suara = (function () {
  "use strict";

  var ctx = null, utama = null, gSfx = null, gMusik = null;
  var hidup = true, siap = false;
  var KUNCI = "aduCuaca.suara";

  try { hidup = localStorage.getItem(KUNCI) !== "0"; } catch (e) { /* biarkan */ }

  /* Dipanggil dua kali, sekali langsung waktu halaman dimuat dan sekali
     lagi di sentuhan pertama. Yang pertama SERING GAGAL dan itu bukan bug.
     Browser melarang suara di halaman yang belum pernah disentuh orangnya,
     dan larangan itu tidak bisa diakali, memang begitu aturannya sejak
     2018. Jadi yang bisa dilakukan cuma MENCOBA duluan, lalu menyiapkan
     percobaan kedua yang pasti berhasil.
     Untungnya di kunjungan pertama tutorialnya langsung muncul, dan
     memencet Lanjut di situ sudah cukup jadi sentuhan. */
  function nyalakan() {
    if (ctx) {
      if (ctx.state === "suspended") ctx.resume().then(mulaiMusik, function () {});
      else mulaiMusik();
      return;
    }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();

    /* PENAHAN PUNCAK, dan dia yang bikin suaranya boleh dinaikkan.
       Tanpa dia, volume dinaikkan sampai enak lalu begitu tiga suara
       bertumpuk, misalnya dentum ditambah hujan ditambah musik, gabungannya
       lewat batas dan yang terdengar bukan keras tapi PECAH. Dengan dia,
       puncak yang kelewat ditekan balik otomatis, jadi bagian yang pelan
       bisa dinaikkan jauh tanpa merusak yang keras.

       Serangnya 3 milidetik, cukup cepat menangkap dentum tanpa memakan
       hentakan awalnya. Lepasnya 250 milidetik, cukup pelan supaya
       penekanannya tidak terdengar memompa. */
    var tekan = ctx.createDynamicsCompressor();
    tekan.threshold.value = -12;
    tekan.knee.value = 10;
    tekan.ratio.value = 12;
    tekan.attack.value = 0.003;
    tekan.release.value = 0.25;
    tekan.connect(ctx.destination);

    utama = ctx.createGain(); utama.gain.value = hidup ? 1 : 0;
    utama.connect(tekan);

    /* Dinaikkan jauh 11 Oktober 2026. Pemilik, "suaranya kurang gede, jadi
       harus saya naikkan dulu volume laptop tinggi". Angka lamanya 0,26
       dan 0,09, terlalu sopan. Musik tetap jauh di bawah efek, sebab dia
       berbunyi terus menerus sedangkan efek cuma sesekali, dan yang
       berbunyi terus itu paling cepat bikin orang bosan lalu mematikan
       suaranya sama sekali. */
    gSfx = ctx.createGain(); gSfx.gain.value = 0.85; gSfx.connect(utama);
    gMusik = ctx.createGain(); gMusik.gain.value = 0.3; gMusik.connect(utama);
    siap = true;
    if (ctx.state === "suspended") ctx.resume().then(mulaiMusik, function () {});
    else mulaiMusik();
  }

  function nada(f, mulai, lama, jenis, vol, tuju) {
    if (!siap) return;
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = jenis || "square";
    o.frequency.setValueAtTime(f, mulai);
    if (tuju) o.frequency.exponentialRampToValueAtTime(Math.max(20, tuju), mulai + lama);
    g.gain.setValueAtTime(0.0001, mulai);
    g.gain.exponentialRampToValueAtTime(vol, mulai + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, mulai + lama);
    o.connect(g); g.connect(gSfx);
    o.start(mulai); o.stop(mulai + lama + 0.03);
  }

  /* Desis, bahan untuk hujan, kibasan, dan api. Buffer-nya dibikin baru
     tiap dipakai dan itu disengaja, buffer yang dipakai ulang bunyinya
     persis sama tiap kali dan telinga langsung tahu itu rekaman. */
  function desis(mulai, lama, vol, saring, jenisSaring) {
    if (!siap) return;
    var n = Math.max(1, Math.floor(ctx.sampleRate * lama));
    var buf = ctx.createBuffer(1, n, ctx.sampleRate);
    var dt = buf.getChannelData(0);
    for (var i = 0; i < n; i++) dt[i] = (Math.random() * 2 - 1) * (1 - i / n);
    var src = ctx.createBufferSource(); src.buffer = buf;
    var f = ctx.createBiquadFilter();
    f.type = jenisSaring || "lowpass";
    f.frequency.setValueAtTime(saring, mulai);
    var g = ctx.createGain();
    g.gain.setValueAtTime(vol, mulai);
    g.gain.exponentialRampToValueAtTime(0.0001, mulai + lama);
    src.connect(f); f.connect(g); g.connect(gSfx);
    src.start(mulai); src.stop(mulai + lama);
  }

  function t(geser) { return ctx.currentTime + (geser || 0); }

  var EFEK = {
    /* kartu dibagikan dari tumpukan, bunyi kertas pendek */
    bagi: function () { desis(t(), 0.07, 0.5, 2600, "highpass"); },
    pilih: function () { nada(620, t(), 0.09, "square", 0.3, 980); },
    batal: function () { nada(620, t(), 0.08, "square", 0.22, 380); },
    balik: function () {
      desis(t(), 0.06, 0.4, 3000, "highpass");
      nada(880, t(0.03), 0.07, "triangle", 0.18, 1320);
    },
    tombol: function () { nada(440, t(), 0.06, "square", 0.22, 620); },

    /* kartu dilempar ke bos, kibasan naik */
    lempar: function () { desis(t(), 0.2, 0.45, 900, "bandpass"); },

    /* bos kena. Dentum rendah dulu, baru hujannya. Dibalik urutannya,
       yang terdengar cuma gemerisik dan pukulannya kehilangan bobot. */
    kena: function () {
      nada(170, t(), 0.3, "sine", 0.55, 48);
      desis(t(0.02), 0.5, 0.42, 5200, "highpass");
      nada(330, t(0.04), 0.5, "triangle", 0.12, 180);
    },

    /* bos malah pulih. Api menyala, lalu dia tertawa. */
    pulih: function () {
      desis(t(), 0.35, 0.5, 1400, "lowpass");
      EFEK.tawa(0.12);
    },

    /* Tawa jahat. Empat hembusan pendek yang turun, tiap hembusan
       digetarkan sedikit. Gergaji rendah plus getaran itu yang bikin
       telinga membacanya sebagai makhluk, bukan sebagai nada. */
    tawa: function (geser) {
      if (!siap) return;
      var awal = t(geser || 0);
      [168, 150, 134, 116].forEach(function (f, i) {
        var m = awal + i * 0.135;
        var o = ctx.createOscillator(), g = ctx.createGain();
        var lfo = ctx.createOscillator(), lg = ctx.createGain();
        o.type = "sawtooth";
        o.frequency.setValueAtTime(f, m);
        o.frequency.exponentialRampToValueAtTime(f * 0.78, m + 0.11);
        lfo.type = "sine"; lfo.frequency.value = 22;
        lg.gain.value = f * 0.12;
        lfo.connect(lg); lg.connect(o.frequency);
        g.gain.setValueAtTime(0.0001, m);
        g.gain.exponentialRampToValueAtTime(0.3, m + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0001, m + 0.12);
        var f2 = ctx.createBiquadFilter();
        f2.type = "lowpass"; f2.frequency.value = 900;
        o.connect(f2); f2.connect(g); g.connect(gSfx);
        o.start(m); o.stop(m + 0.14);
        lfo.start(m); lfo.stop(m + 0.14);
      });
    },

    menang: function () {
      [392, 523, 659, 784, 1047].forEach(function (f, i) {
        nada(f, t(i * 0.11), 0.28, "square", 0.26);
      });
      desis(t(0.1), 1.4, 0.2, 6000, "highpass");
    },
    kalah: function () {
      [330, 294, 247, 196].forEach(function (f, i) {
        nada(f, t(i * 0.16), 0.4, "sawtooth", 0.22);
      });
      EFEK.tawa(0.5);
    }
  };

  /* --------------------------- MUSIK LATAR ---------------------------
     Delapan birama, nada minor, pelan. Dijadwalkan dua birama di depan
     lewat setInterval, BUKAN dengan satu setTimeout per nada. Jam
     setTimeout itu melenceng puluhan milidetik dan di musik itu langsung
     terdengar goyah. Jam Web Audio tidak melenceng, jadi yang dipakai
     jamnya, dan setInterval cuma bertugas mengisi ulang antrean. */
  var BPM = 78, ketuk = 60 / BPM;
  var BAS = [55, 55, 49, 49, 44, 44, 51, 51];              // A G F B rendah
  var ARP = [220, 262, 330, 262, 196, 247, 294, 247,
             175, 220, 262, 220, 247, 294, 370, 294];
  var biramaKe = 0, jamJadwal = 0, timerMusik = null;

  function isiAntrean() {
    if (!siap || !hidup) return;
    while (jamJadwal < ctx.currentTime + 2) {
      var b = biramaKe % 8;
      var m = jamJadwal;
      // bas, dua ketuk
      musikNada(BAS[b], m, ketuk * 1.7, "triangle", 0.5);
      musikNada(BAS[b], m + ketuk * 2, ketuk * 1.7, "triangle", 0.4);
      // arpeggio, delapan not seperdelapan
      for (var i = 0; i < 8; i++) {
        var f = ARP[(b * 2 + (i >> 2)) % ARP.length + 0];
        musikNada(ARP[(b * 8 + i) % ARP.length], m + i * ketuk * 0.5,
                  ketuk * 0.42, "square", 0.16);
      }
      jamJadwal += ketuk * 4;
      biramaKe += 1;
    }
  }

  function musikNada(f, mulai, lama, jenis, vol) {
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = jenis; o.frequency.setValueAtTime(f, mulai);
    g.gain.setValueAtTime(0.0001, mulai);
    g.gain.exponentialRampToValueAtTime(vol, mulai + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, mulai + lama);
    o.connect(g); g.connect(gMusik);
    o.start(mulai); o.stop(mulai + lama + 0.03);
  }

  function mulaiMusik() {
    if (timerMusik || !siap || !hidup) return;
    if (ctx.state !== "running") return;   // masih diblokir, nanti dicoba lagi
    jamJadwal = ctx.currentTime + 0.1;
    isiAntrean();
    timerMusik = setInterval(isiAntrean, 500);
  }

  return {
    nyalakan: nyalakan,
    jalan: function () { return !!(ctx && ctx.state === "running"); },
    main: function (nama) {
      if (!hidup) return;
      nyalakan();
      if (siap && EFEK[nama]) EFEK[nama]();
    },
    bisu: function () { return !hidup; },
    tukar: function () {
      hidup = !hidup;
      try { localStorage.setItem(KUNCI, hidup ? "1" : "0"); } catch (e) { /* biarkan */ }
      if (hidup) { nyalakan(); if (utama) utama.gain.value = 1; }
      else if (utama) utama.gain.value = 0;
      return hidup;
    }
  };
})();
