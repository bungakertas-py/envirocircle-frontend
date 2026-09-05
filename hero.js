/* =====================================================================
   Envirocircle — animasi hero
   Klona kode dari terrain_pm25.gif: field konsentrasi PM2.5 ASLI hasil
   CAMx (72 frame) diekstrak jadi data ringkas (pm25-frames.json, RLE),
   lalu digambar sendiri di canvas. Bukan berkas gif.
     - pita warna & level persis colorbar aslinya (cmap jet, alpha 0.66)
     - antar frame di-interpolasi supaya geraknya mulus, bukan meloncat
     - tanpa basemap, latar putih
     - angin: partikel ala velocity.js (u/v dummy), seperti di skrip Python
   ===================================================================== */
(function () {
  "use strict";

  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var host = document.querySelector(".hero");
  if (!host) return;
  var concCv = host.querySelector(".hero-contour");
  var windCv = host.querySelector(".hero-wind");
  if (!concCv) return;
  if (windCv && !ANGIN) windCv.style.display = "none";
  var cCtx = concCv.getContext("2d", { alpha: false });
  var wCtx = ANGIN && windCv ? windCv.getContext("2d", { alpha: true }) : null;

  /* Saklar lapis angin. Dimatikan atas permintaan user. Kodenya sengaja
     dibiarkan utuh, nyalakan lagi cukup ganti ke true. */
  var ANGIN = false;

  /* Warna latar kanvas. TIDAK dipatok, dibaca dari latar .hero tiap resize
     supaya ikut token --paper. Kalau dipatok, ganti tema bikin kanvas
     melukis persegi warna lama di atas halaman. */
  var BG = "#fffff6";

  /* ---- Palet pita, mengikuti token situs ----
     Dulu memakai 7 warna jet asli dari colorbar CAMx yang ikut tersimpan di
     pm25-frames.json. Diminta user, sekarang mengikuti palet Envirocircle.
     LIMA dari tujuh pita memakai kode ASLI dari berkas palet, lewat token:
       pita 1  --lime-hi       #63f7ff   (primary-fixed)
       pita 2  --lime          #00f5ff   (biolume / primary-container)
       pita 3  --lime-dim      #00dce5   (inverse-primary)
       pita 5  --primary       #00696e   (primary)
       pita 6  --primary-deep  #004f53   (on-primary-fixed-variant)
     Yang dicampur cuma dua, pita 0 sebagai tint pucat ke arah --paper, dan
     pita 4 sebagai jembatan antara --lime-dim dan --primary. Dua itu terpaksa,
     paletnya memang tidak punya entri di dua rentang terang itu.
     Lime hijau TIDAK dipakai. Sudah dicek ke NewPaletBiru.zip, palet Deep Sea
     Telemetry tidak punya hijau sama sekali, seluruh aksennya cyan dan teal.
     Token yang bernama --lime itu isinya cyan, namanya warisan palet lama.
     Karena dibaca dari CSS, ganti nilai di :root otomatis ikut mengganti
     warna konturnya. Tidak ada angka warna yang perlu disunting dua tempat.
     Ujung tertinggi SENGAJA berhenti di teal gelap, tidak sampai --ink,
     sebab --ink itu warna tulisan "Precise" dan pita tidak boleh menyamainya.
     Pita tertinggi digelapkan DI DALAM ronanya sendiri, bukan dicampur ke
     arah --ink. Sempat dicampur ke --ink dan hasilnya inti pitanya jadi
     kelabu, bukan teal pekat, sebab --ink itu hitam kebiruan jadi
     mencampurnya justru membuang warna.
     Urutannya juga sengaja makin gelap dari pita 0 ke pita 6. Cyan murni itu
     terangnya tinggi, jadi dua pita di bawahnya harus tint yang LEBIH pucat
     dari cyan, kalau tidak tangganya berbalik di tengah dan peta jadi salah
     baca. */
  function keRGB(v, cadangan) {
    v = (v || "").trim();
    if (/^#[0-9a-f]{3}$/i.test(v)) {
      return [parseInt(v[1] + v[1], 16), parseInt(v[2] + v[2], 16), parseInt(v[3] + v[3], 16)];
    }
    if (/^#[0-9a-f]{6}$/i.test(v)) {
      return [parseInt(v.substr(1, 2), 16), parseInt(v.substr(3, 2), 16), parseInt(v.substr(5, 2), 16)];
    }
    var m = v.match(/rgba?\(([^)]+)\)/);
    if (m) { var a = m[1].split(","); return [+a[0], +a[1], +a[2]]; }
    return cadangan;
  }
  function campur(a, b, t) {
    return [Math.round(a[0] + (b[0] - a[0]) * t),
            Math.round(a[1] + (b[1] - a[1]) * t),
            Math.round(a[2] + (b[2] - a[2]) * t)];
  }
  /* ---- SAKLAR PALET ----
     "turbo" memakai colormap Turbo, "token" memakai tangga cyan teal yang
     mengikuti :root. Ganti satu kata ini saja. */
  var PALET_KONTUR = "token";

  /* Titik jangkar Turbo, colormap buatan Google yang dibuat justru untuk
     menggantikan jet. Jet punya pita terang palsu di cyan dan kuning yang
     bikin mata melihat batas yang sebenarnya tidak ada di data, turbo
     meratakan itu. Sembilan titik ini cukup, sisanya dijembatani lurus.
     Angkanya 0 sampai 255, urut dari nilai terendah ke tertinggi. */
  var TURBO = [
    [0.000, [ 48,  18,  59]],
    [0.125, [ 70, 107, 227]],
    [0.250, [ 54, 163, 251]],
    [0.375, [ 24, 215, 203]],
    [0.500, [ 58, 244, 134]],
    [0.625, [150, 254,  60]],
    [0.750, [224, 225,  44]],
    [0.875, [253, 152,  39]],
    [1.000, [122,   4,   3]]
  ];
  function turboAt(t) {
    if (t <= 0) return TURBO[0][1].slice();
    if (t >= 1) return TURBO[TURBO.length - 1][1].slice();
    for (var i = 1; i < TURBO.length; i++) {
      if (t <= TURBO[i][0]) {
        var a = TURBO[i - 1], b = TURBO[i];
        return campur(a[1], b[1], (t - a[0]) / (b[0] - a[0]));
      }
    }
    return TURBO[TURBO.length - 1][1].slice();
  }
  /* Dicuplik di TENGAH tiap pita, (i + 0.5) / n, sama seperti cara contourf
     matplotlib memberi warna. Kalau dicuplik di tepi, pita pertama dapat
     nila hampir hitam dan pita terakhir merah tua hampir hitam juga, dua
     duanya menabrak warna tulisan dan bikin ujung peta terlihat kotor. */
  function bangunTurbo(n) {
    var out = [];
    for (var i = 0; i < n; i++) out.push(turboAt((i + 0.5) / n));
    return out;
  }

  function paletAktif() {
    return PALET_KONTUR === "turbo" ? bangunTurbo(7) : bangunPalet();
  }

  function bangunPalet() {
    var cs = getComputedStyle(document.documentElement);
    var limeHi   = keRGB(cs.getPropertyValue("--lime-hi"),      [99, 247, 255]);
    var lime     = keRGB(cs.getPropertyValue("--lime"),         [0, 245, 255]);
    var limeDim  = keRGB(cs.getPropertyValue("--lime-dim"),     [0, 220, 229]);
    var prim     = keRGB(cs.getPropertyValue("--primary"),      [0, 105, 110]);
    var primDeep = keRGB(cs.getPropertyValue("--primary-deep"), [0, 79, 83]);
    var paper    = keRGB(cs.getPropertyValue("--paper"),        [255, 255, 246]);
    return [
      campur(limeHi, paper, 0.82),
      limeHi,
      lime,
      limeDim,
      campur(limeDim, prim, 0.55),
      prim,
      primDeep
    ];
  }
  var CALPHA = 168;            // ~ alpha 0.66 seperti contourf

  /* Penempatan field di dalam hero.
     Pusat massa data CAMx dihitung langsung dari pm25-frames.json, bukan
     ditaksir dari gambar: x 67,6% lebar, y 46,1% tinggi. Kalau field
     dipasang rata tengah, pitanya menumpuk di kanan dan separuh kiri hero
     putih melompong. PUSAT_X/Y menyatakan titik data mana yang ditaruh di
     tengah hero, ZOOM membesarkan sedikit supaya tepinya tidak menganga.
     Sejak diminta user, PUSAT_X/Y TIDAK LAGI dipatok mati. Titik biru kecil
     yang menyendiri di data (puncak lokal di x=53 y=99, u 0,3099 v 0,5789)
     dipatok ke huruf e terakhir kata "Precise", dan letak huruf itu dibaca
     dari halaman tiap kali ukuran berubah. Lihat titikHuruf().

     Kenapa tidak angka mati saja. Mendatar memang aman, letak huruf dan
     skala peta dua duanya tumbuh seiring LEBAR layar jadi perbandingannya
     tetap. Menegak tidak, letak huruf ikut TINGGI layar sedangkan skala peta
     ikut lebar, jadi angka mati yang pas di 1440x900 meleset 90 px di
     1920x1080. Nilai di bawah cuma cadangan kalau pengukuran gagal. */
  var ZOOM = 1.15, PUSAT_X = 0.2134, PUSAT_Y = 0.6117;
  var PATOK_U = 0.3099, PATOK_V = 0.5789;
  var ptTerakhir = null;
  var DATA = null, FR = [], SW = 0, SH = 0, NT = 0, DUR = 250, JET = [];

  /* ---------------- angin dummy (u/v), ala velocity.js ---------------- */
  var WSPD = 2.4, BASE = -0.05 * Math.PI;
  var seedT = Math.random() * 1000;
  function windAng(x, y, tw) {
    // medan halus tanpa noise berat: dua gelombang sinus bersilang
    return BASE + 0.26 * Math.PI * Math.sin(tw * 0.35 + seedT)
         + 0.30 * Math.sin(x * 0.0042 + tw * 0.9)
         + 0.26 * Math.cos(y * 0.0051 - tw * 0.7);
  }

  var w = 0, h = 0;
  var fs = 2, fw = 0, fh = 0, off = null, offCtx = null, IMG = null;
  var NPART = 0, PSTEPS = 3, PMAXAGE = 45, PRESEED = 0.02;
  var px = null, py = null, page = null;
  var blend = null, tmp = null;

  /* Penghalus tepi pita.
     Grid datanya cuma 171x171 lalu diperbesar sekitar 8 kali di layar. Kalau
     dicuplik bilinear langsung, permukaannya patah patah per sel, jadi batas
     pitanya keluar sebagai poligon bersisi 9,6 px. Itu tangga yang kelihatan.
     Obatnya grid dinaikkan dulu UPS kali dengan Catmull-Rom, kubik dan mulus
     turunan pertamanya, jadi batasnya melengkung bukan patah. Dikerjakan
     terpisah mendatar lalu menegak supaya biayanya 4 tap, bukan 16. */
  var UPS = 3;
  var FW = 0, FH = 0, fine = null, rowbuf = null, CRW = null;

  function siapkanBobot() {
    CRW = new Float32Array(UPS * 4);
    for (var j = 0; j < UPS; j++) {
      var t = j / UPS, t2 = t * t, t3 = t2 * t, o = j * 4;
      CRW[o]     = -0.5 * t3 + t2 - 0.5 * t;
      CRW[o + 1] =  1.5 * t3 - 2.5 * t2 + 1;
      CRW[o + 2] = -1.5 * t3 + 2 * t2 + 0.5 * t;
      CRW[o + 3] =  0.5 * t3 - 0.5 * t2;
    }
  }

  function perbesarKubik() {
    var x, y, j, b, o, p0, p1, p2, p3, v, rs, rd;
    /* mendatar: blend (SW x SH) -> rowbuf (FW x SH) */
    for (y = 0; y < SH; y++) {
      rs = y * SW; rd = y * FW;
      for (x = 0; x < SW - 1; x++) {
        p0 = blend[rs + (x > 0 ? x - 1 : 0)];
        p1 = blend[rs + x];
        p2 = blend[rs + x + 1];
        p3 = blend[rs + (x + 2 < SW ? x + 2 : SW - 1)];
        o = rd + x * UPS;
        for (j = 0; j < UPS; j++) {
          b = j * 4;
          rowbuf[o + j] = CRW[b] * p0 + CRW[b + 1] * p1 + CRW[b + 2] * p2 + CRW[b + 3] * p3;
        }
      }
      rowbuf[rd + FW - 1] = blend[rs + SW - 1];
    }
    /* menegak: rowbuf -> fine (FW x FH). Urutannya baris demi baris supaya
       baca dan tulisnya berurutan, bukan meloncat sejauh FW tiap langkah. */
    var y0, y1, y2, y3, w0, w1, w2, w3, dst;
    for (y = 0; y < SH - 1; y++) {
      y0 = (y > 0 ? y - 1 : 0) * FW; y1 = y * FW;
      y2 = (y + 1) * FW; y3 = (y + 2 < SH ? y + 2 : SH - 1) * FW;
      for (j = 0; j < UPS; j++) {
        b = j * 4;
        w0 = CRW[b]; w1 = CRW[b + 1]; w2 = CRW[b + 2]; w3 = CRW[b + 3];
        dst = (y * UPS + j) * FW;
        for (x = 0; x < FW; x++) {
          v = w0 * rowbuf[y0 + x] + w1 * rowbuf[y1 + x] + w2 * rowbuf[y2 + x] + w3 * rowbuf[y3 + x];
          /* kubik boleh melampaui jangkauan aslinya, dikurung supaya tidak
             lahir pita palsu di luar 7 pita colorbar */
          fine[dst + x] = v < -1 ? -1 : (v > 6 ? 6 : v);
        }
      }
    }
    dst = (FH - 1) * FW; rd = (SH - 1) * FW;
    for (x = 0; x < FW; x++) fine[dst + x] = rowbuf[rd + x];
  }

  /* haluskan field kasar (2x blur 3-tap) supaya garis konturnya luwes,
     tidak bergerigi saat grid 171 diperbesar ke lebar hero */
  function smooth(a, t, W, H) {
    var x, y, i;
    for (y = 0; y < H; y++) {
      for (x = 0; x < W; x++) {
        i = y * W + x;
        t[i] = (a[i] * 2 + a[x > 0 ? i - 1 : i] + a[x < W - 1 ? i + 1 : i]) * 0.25;
      }
    }
    for (y = 0; y < H; y++) {
      for (x = 0; x < W; x++) {
        i = y * W + x;
        a[i] = (t[i] * 2 + t[y > 0 ? i - W : i] + t[y < H - 1 ? i + W : i]) * 0.25;
      }
    }
  }

  /* Pusat ink huruf e terakhir di baris pertama judul.
     Dua jebakan yang sudah kena dan dibayar:
     1. Kotak dari Range itu kotak FONT (ascent + descent), bukan kotak baris,
        jadi baseline = kotak.atas + fontBoundingBoxAscent. Jangan dikoreksi
        half-leading, nanti melesetnya puluhan piksel.
     2. Baris judul dianimasikan GSAP, jadi rect-nya bisa tertangkap selagi
        masih tergeser. Nilai translate itu dikurangkan balik. Sejak baris
        pertama meluncur dari KIRI, yang dikurangkan bukan cuma ty tapi juga
        tx, kalau tidak patokannya melenceng sejauh sisa luncuran. */
  function titikHuruf() {
    var baris = document.querySelector(".hero-title .hl-in");
    if (!baris) return null;
    var tn = baris.firstChild;
    if (!tn || tn.nodeType !== 3) return null;
    var i = tn.textContent.lastIndexOf("e");
    if (i < 0) return null;

    var r = document.createRange();
    r.setStart(tn, i); r.setEnd(tn, i + 1);
    var b = r.getBoundingClientRect();
    if (!b.width) return null;

    var cs = getComputedStyle(document.querySelector(".hero-title"));
    var m = document.createElement("canvas").getContext("2d");
    m.font = cs.fontWeight + " " + cs.fontSize + " " + cs.fontFamily;
    var tm = m.measureText("e");
    if (!tm.fontBoundingBoxAscent) return null;   // browser lawas, jangan menebak

    var tx = 0, ty = 0, mt = getComputedStyle(baris).transform;
    if (mt && mt.indexOf("matrix") === 0) {
      var a = mt.slice(mt.indexOf("(") + 1, -1).split(",");
      var tiga = mt.indexOf("matrix3d") === 0;
      tx = parseFloat(tiga ? a[12] : a[4]) || 0;
      ty = parseFloat(tiga ? a[13] : a[5]) || 0;
    }
    var baseline = b.top - ty + tm.fontBoundingBoxAscent;
    return {
      x: (b.left + b.right) / 2 - tx,
      y: baseline + (tm.actualBoundingBoxDescent - tm.actualBoundingBoxAscent) / 2
    };
  }

  function resize() {
    var lat = getComputedStyle(host).backgroundColor;
    if (lat && lat.indexOf("rgba(0, 0, 0, 0)") < 0 && lat !== "transparent") BG = lat;
    JET = paletAktif();

    var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    w = host.clientWidth; h = host.clientHeight;
    concCv.width = Math.floor(w * dpr);
    concCv.height = Math.floor(h * dpr);
    concCv.style.width = w + "px";
    concCv.style.height = h + "px";
    cCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (wCtx) {
      windCv.width = concCv.width; windCv.height = concCv.height;
      windCv.style.width = w + "px"; windCv.style.height = h + "px";
      wCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    fw = Math.ceil(w / fs) + 1; fh = Math.ceil(h / fs) + 1;
    off = document.createElement("canvas"); off.width = fw; off.height = fh;
    offCtx = off.getContext("2d", { alpha: true });
    IMG = offCtx.createImageData(fw, fh);

    if (wCtx) {
      NPART = Math.min(2800, Math.floor(w * h / 620));
      px = new Float32Array(NPART); py = new Float32Array(NPART); page = new Float32Array(NPART);
      for (var i = 0; i < NPART; i++) { px[i] = Math.random() * w; py[i] = Math.random() * h; page[i] = (Math.random() * PMAXAGE) | 0; }
    }

    var pt = titikHuruf();
    ptTerakhir = pt ? { x: pt.x, y: pt.y, w: w, h: h } : null;
    if (pt) {
      var sz = Math.max(w, h) * ZOOM;
      PUSAT_X = PATOK_U + (w / 2 - pt.x) / sz;
      PUSAT_Y = PATOK_V + (h / 2 - pt.y) / sz;
    }

    cCtx.fillStyle = BG; cCtx.fillRect(0, 0, w, h);
  }

  function decodeRLE(s, n) {
    var out = new Int8Array(n), p = 0, toks = s.split("."), i, j, tk, v, c, val;
    for (i = 0; i < toks.length; i++) {
      tk = toks[i];
      v = tk.charCodeAt(0) - 48;
      c = parseInt(tk.substring(1), 16);
      val = v === 7 ? -1 : v;              // 7 = tak ada polutan
      for (j = 0; j < c; j++) out[p++] = val;
    }
    return out;
  }

  /* ---- gambar field konsentrasi: interpolasi waktu + ruang, lalu pita ---- */
  function drawConc(time) {
    if (!DATA) { cCtx.fillStyle = BG; cCtx.fillRect(0, 0, w, h); return; }
    var pos = (time / DUR), i0 = Math.floor(pos) % NT, i1 = (i0 + 1) % NT, f = pos - Math.floor(pos);
    var A = FR[i0], B = FR[i1], i;
    for (i = 0; i < blend.length; i++) blend[i] = A[i] + (B[i] - A[i]) * f;   // interpolasi antar frame
    smooth(blend, tmp, SW, SH); smooth(blend, tmp, SW, SH);
    perbesarKubik();                                    // 171 -> 511, tepi jadi lengkung

    // pemetaan "cover": data persegi -> hero yang lebar, digeser ke pusat massa
    var s = Math.max(w, h) * ZOOM;
    var ox = w / 2 - PUSAT_X * s, oy = h / 2 - PUSAT_Y * s, k = SW * UPS / s;
    /* Penghalusan tepi pita.
       Ambang pita itu keras, `bi = round(vv)`, jadi batasnya jatuh persis di
       tengah piksel dan keluar bergerigi. Di sini jarak piksel ke batas
       dihitung dari KECURAMAN field setempat, lalu warnanya dilebur dengan
       pita tetangga selebar satu piksel kanvas kasar. Bentuk pitanya tetap
       pita keras seperti contourf, yang berubah cuma satu piksel di tepinya.
       Akar kuadrat sengaja dihindari, dipakai hampiran norma segi delapan
       max + 0,4*min, melesetnya di bawah 4 persen dan jauh lebih murah. */
    var kfs = k * fs;
    var d = IMG.data, gx, gy, sxp, syp, x0, y0, ax, ay, v00, v10, v01, v11, vv, bi, o;
    var e, dvx, dvy, ga, gb, grad, m, nb, a1, a2, al, w1, w2, c1, c2, r0;
    for (gy = 0; gy < fh; gy++) {
      syp = (gy * fs - oy) * k;
      y0 = Math.floor(syp); ay = syp - y0;
      for (gx = 0; gx < fw; gx++) {
        o = (gy * fw + gx) * 4;
        sxp = (gx * fs - ox) * k;
        x0 = Math.floor(sxp); ax = sxp - x0;
        if (x0 < 0 || y0 < 0 || x0 >= FW - 1 || y0 >= FH - 1) { d[o + 3] = 0; continue; }
        r0 = y0 * FW + x0;
        v00 = fine[r0]; v10 = fine[r0 + 1];
        v01 = fine[r0 + FW]; v11 = fine[r0 + FW + 1];
        vv = v00 * (1 - ax) * (1 - ay) + v10 * ax * (1 - ay) + v01 * (1 - ax) * ay + v11 * ax * ay;

        bi = Math.round(vv);
        e = vv - bi;

        /* turunan bilinear, lalu diubah jadi perubahan nilai per piksel */
        dvx = ((1 - ay) * (v10 - v00) + ay * (v11 - v01)) * kfs;
        dvy = ((1 - ax) * (v01 - v00) + ax * (v11 - v10)) * kfs;
        ga = dvx < 0 ? -dvx : dvx; gb = dvy < 0 ? -dvy : dvy;
        grad = ga > gb ? ga + 0.4 * gb : gb + 0.4 * ga;

        m = 0;
        if (grad > 1e-6) {
          m = 0.5 - (0.5 - (e < 0 ? -e : e)) / grad;
          if (m < 0) m = 0;
        }

        if (bi > 6) bi = 6; else if (bi < -1) bi = -1;
        nb = e > 0 ? bi + 1 : bi - 1;
        if (nb > 6) nb = 6; else if (nb < -1) nb = -1;

        a1 = bi < 0 ? 0 : 1; a2 = nb < 0 ? 0 : 1;
        al = a1 * (1 - m) + a2 * m;
        if (al <= 0) { d[o + 3] = 0; continue; }

        c1 = JET[bi < 0 ? (nb < 0 ? 0 : nb) : bi];
        c2 = nb < 0 ? c1 : JET[nb];
        w2 = (a2 * m) / al; w1 = 1 - w2;
        d[o]     = c1[0] * w1 + c2[0] * w2;
        d[o + 1] = c1[1] * w1 + c2[1] * w2;
        d[o + 2] = c1[2] * w1 + c2[2] * w2;
        d[o + 3] = CALPHA * al;
      }
    }
    offCtx.putImageData(IMG, 0, 0);
    cCtx.fillStyle = BG; cCtx.fillRect(0, 0, w, h);
    cCtx.imageSmoothingEnabled = true; cCtx.imageSmoothingQuality = "high";
    cCtx.drawImage(off, 0, 0, w, h);
  }

  /* ---- angin: partikel ala velocity.js ---- */
  function drawWind(time) {
    var tw = time * 0.00004;
    wCtx.clearRect(0, 0, w, h);
    wCtx.lineWidth = 1.15; wCtx.lineCap = "round";
    var s, a, i, ang, x0, y0, x1, y1;
    for (s = 0; s < PSTEPS; s++) {
      a = 0.26 + 0.60 * (s / (PSTEPS - 1));
      /* Gelap, mengikuti latar terang. Lapis angin masih dimatikan lewat
         ANGIN, ini supaya tidak rusak kalau dinyalakan lagi. */
      wCtx.strokeStyle = "rgba(17,17,17," + a + ")";
      wCtx.beginPath();
      for (i = 0; i < NPART; i++) {
        x0 = px[i]; y0 = py[i];
        ang = windAng(x0, y0, tw);
        x1 = x0 + Math.cos(ang) * WSPD; y1 = y0 + Math.sin(ang) * WSPD;
        wCtx.moveTo(x0, y0); wCtx.lineTo(x1, y1);
        px[i] = x1; py[i] = y1;
      }
      wCtx.stroke();
    }
    for (i = 0; i < NPART; i++) {
      page[i] += 1;
      if (px[i] < 0 || px[i] > w || py[i] < 0 || py[i] > h || page[i] > PMAXAGE || Math.random() < PRESEED) {
        px[i] = Math.random() * w; py[i] = Math.random() * h; page[i] = 0;
      }
    }
  }

  function frame(time) { drawConc(time); if (wCtx) drawWind(time); }

  /* =====================================================================
     GELUNG GAMBAR. Dulu satu baris, `tick(t){ frame(t); rAF(tick) }`, dan
     itu sumber utama halaman terasa berat.

     Tiga hal yang salah di sana.
     1. Dia TIDAK PERNAH berhenti. Hero cuma setinggi satu layar, tapi
        gelungnya tetap menggambar penuh waktu orang sudah membaca Showcase
        atau Team jauh di bawahnya. Jatah gambar yang terpakai di situ persis
        jatah yang bikin gulirannya tersendat.
     2. Dia menggambar 60 kali sedetik, padahal datanya cuma 72 bingkai
        berjarak 250 ms, jadi 4 bingkai sedetik, sisanya interpolasi. 30 kali
        sedetik sudah jauh di atas yang dibutuhkan untuk melihat geraknya
        mulus, dan biayanya separuh.
     3. Waktunya diambil dari jam halaman. Begitu gelungnya boleh berhenti,
        itu jadi salah, medannya akan meloncat sejauh lama berhentinya.
        Sekarang jamnya sendiri dan cuma bertambah selagi menggambar.
     ===================================================================== */
  var FPS = 30, SELA = 1000 / FPS;
  var jam = 0, tLalu = 0, tGambar = -1e9, rafId = 0, sedangJalan = false;

  /* Penilai biaya. Kalau mesinnya memang tidak sanggup, lebih baik menggambar
     sedikit lebih kasar daripada tersendat. Sel kasarnya dinaikkan dari 2 ke
     3 piksel, biayanya turun 2,25 kali, dan karena hasilnya toh sudah
     diperbesar dengan penghalusan, yang berubah cuma ketajaman tepi pita.
     SEKALI JALAN saja, tidak pernah balik, supaya tidak berayun di ambang. */
  var berat = 0, sudahDikasarkan = false;
  function nilaiBiaya(ms) {
    if (sudahDikasarkan || fs >= 3) return;
    berat = ms > 14 ? berat + 1 : 0;
    if (berat < 12) return;                 /* 12 bingkai berat berturut turut */
    sudahDikasarkan = true;
    fs = 3;
    resize();
  }

  function tick(t) {
    rafId = requestAnimationFrame(tick);
    if (!tLalu) tLalu = t;
    var dt = t - tLalu;
    tLalu = t;
    /* Balik dari tab lain atau dari bagian bawah halaman. Jangan biarkan satu
       selisih raksasa melompatkan medannya. */
    if (dt > 200) dt = SELA;
    jam += dt;
    if (t - tGambar < SELA - 1) return;
    tGambar = t;
    var t0 = performance.now();
    frame(jam);
    nilaiBiaya(performance.now() - t0);
  }

  function mulai() {
    if (sedangJalan || !DATA) return;
    sedangJalan = true;
    tLalu = 0;
    rafId = requestAnimationFrame(tick);
  }
  function henti() {
    if (!sedangJalan) return;
    sedangJalan = false;
    cancelAnimationFrame(rafId);
    rafId = 0;
  }

  /* Hero terlihat atau tidak. Diberi margin sedikit supaya sudah jalan lagi
     sepersekian layar sebelum betul betul kelihatan, bukan pas mepet.
     visibilitychange dipasang juga. rAF memang sudah berhenti sendiri di tab
     yang tersembunyi, tapi tanpa ini jamnya ikut jalan terus dan medannya
     meloncat waktu tabnya dibuka lagi. */
  var heroTampak = true;
  function nilaiUlang() {
    if (reduce) return;
    if (heroTampak && document.visibilityState !== "hidden") mulai(); else henti();
  }
  if (typeof IntersectionObserver === "function") {
    new IntersectionObserver(function (e) {
      heroTampak = e[0].isIntersecting;
      nilaiUlang();
    }, { rootMargin: "150px 0px" }).observe(host);
  }
  document.addEventListener("visibilitychange", nilaiUlang);

  /* Kail buat verifikasi gelungnya, sejalan dengan __heroMap di bawah.
     Dipakai untuk membuktikan gelungnya betul betul berhenti waktu hero
     tidak terlihat, sebab itu tidak bisa dilihat dari tangkapan layar
     maupun dari dump DOM. */
  window.__heroStatus = function () {
    return { jalan: sedangJalan, fs: fs, jam: Math.round(jam), tampak: heroTampak };
  };

  /* Kail buat verifikasi, dipakai waktu mengadu posisi titik biru dengan
     posisi huruf. Sama gunanya dengan window.__heroTl di anim.js. */
  window.__heroMap = function () {
    var sz = Math.max(w, h) * ZOOM;
    return { w: w, h: h, s: sz, ox: w / 2 - PUSAT_X * sz, oy: h / 2 - PUSAT_Y * sz,
             PUSAT_X: PUSAT_X, PUSAT_Y: PUSAT_Y, pt: ptTerakhir };
  };

  resize();
  window.addEventListener("resize", function () { resize(); if (reduce) frame(4000); });
  /* Sebelum Space Grotesk mendarat, lebar hurufnya masih punya font cadangan,
     jadi patokannya salah. Ukur lagi begitu fontnya siap. */
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () { resize(); if (reduce) frame(4000); });
  }

  /* Jaring pengaman patokan.
     document.fonts.ready TERBUKTI tidak selalu menandai saat huruf betulan
     sudah terpasang, pernah terukur meleset 3,7 persen lebar layar dan
     hilang sendiri di muat ulang berikutnya. Balapan seperti itu tak boleh
     diserahkan ke satu isyarat. Patokannya diperiksa ulang beberapa kali di
     detik detik pertama, lalu BERHENTI SENDIRI begitu dua pengukuran
     berturut turut sama. Setelah itu nol biaya. */
  (function jagaPatokan() {
    var jadwal = [120, 320, 700, 1200, 2000, 3200], i = 0, sebelum = null;
    function periksa() {
      var x = ptTerakhir ? ptTerakhir.x : null;
      resize();
      var y = ptTerakhir ? ptTerakhir.x : null;
      if (reduce) frame(4000);
      /* berhenti kalau sudah mantap, atau kalau jadwalnya habis */
      if (x !== null && x === y && sebelum === x) return;
      sebelum = y;
      if (i < jadwal.length) setTimeout(periksa, jadwal[i++]);
    }
    setTimeout(periksa, jadwal[i++]);
  })();

  fetch("pm25-frames.json").then(function (r) { return r.json(); }).then(function (j) {
    /* j.colors sengaja TIDAK dipakai lagi, itu 7 warna jet asli CAMx.
       Warna pita datang dari paletAktif(), lihat blok di atas. */
    DATA = j; SW = j.w; SH = j.h; NT = j.n; DUR = j.dur || 250; JET = paletAktif();
    FR = j.frames.map(function (s) { return decodeRLE(s, SW * SH); });
    blend = new Float32Array(SW * SH); tmp = new Float32Array(SW * SH);
    FW = (SW - 1) * UPS + 1; FH = (SH - 1) * UPS + 1;
    fine = new Float32Array(FW * FH); rowbuf = new Float32Array(FW * SH);
    siapkanBobot();
    if (reduce) frame(4000);
    else nilaiUlang();
  }).catch(function (e) { console.error("gagal memuat pm25-frames.json", e); });
})();
