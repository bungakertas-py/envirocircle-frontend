/* Skew-T log-P: termodinamika parcel + render diagram klasik.
 * Dipakai kartu "Profil Atmosfer" di panel titik. Data profil (T/RH/angin per
 * level tekanan) diberikan frontend; modul ini menghitung Td, jalur parcel,
 * LCL/LFC/EL, CAPE/CIN, lalu menggambar SVG (isoterm miring, adiabat kering/
 * basah, garis rasio campuran, T/Td/parcel, arsir CAPE/CIN, wind barbs).
 *
 * CATATAN: indikasi model GFS (grid ~1 derajat), bukan sounding radiosonde asli.
 */
(function () {
  "use strict";

  // ---- Konstanta termodinamika ----
  const Rd = 287.05, cp = 1005.0, kappa = Rd / cp;   // 0.2854
  const Lv = 2.5e6, EPS = 0.622;
  const K0 = 273.15, MS_TO_KT = 1.943844;

  // Tekanan uap jenuh (hPa) atas air, T dalam °C (Bolton 1980).
  function esat(Tc) { return 6.112 * Math.exp(17.67 * Tc / (Tc + 243.5)); }

  // Titik embun (°C) dari T(°C) & RH(%).
  function dewpoint(Tc, RH) {
    const e = Math.max(esat(Tc) * Math.max(RH, 0.01) / 100, 1e-6);
    const ln = Math.log(e / 6.112);
    return 243.5 * ln / (17.67 - ln);
  }

  // Rasio campuran (kg/kg) dari tekanan uap e(hPa) & tekanan p(hPa).
  function mixRatio(e, p) { return EPS * e / Math.max(p - e, 1e-6); }

  // Suhu virtual (K) dari T(°C) & rasio campuran r(kg/kg).
  function Tvirt(Tc, r) { return (Tc + K0) * (1 + 0.608 * r); }

  // LCL: dari parcel permukaan (p0 hPa, T0 °C, Td0 °C) -> {p, T(°C)} (Bolton eq.15+Poisson).
  function lcl(p0, T0, Td0) {
    const TK = T0 + K0, TdK = Td0 + K0;
    const Tl = 1 / (1 / (TdK - 56) + Math.log(TK / TdK) / 800) + 56;   // K
    const pl = p0 * Math.pow(Tl / TK, 1 / kappa);
    return { p: pl, T: Tl - K0 };
  }

  // Laju adiabat basah pseudo dT/d(ln p) (K), T dalam K, p hPa.
  function moistDToDlnp(TK, p) {
    const Tc = TK - K0;
    const es = esat(Tc);
    const rs = mixRatio(es, p);
    return (Rd * TK + Lv * rs) / (cp + (Lv * Lv * rs * EPS) / (Rd * TK * TK));
  }

  // Integrasi adiabat basah dari (p1,T1K) ke p2 (p2<p1), N substep di ln p. -> T2 (K).
  function moistStep(p1, T1K, p2) {
    const n = Math.max(1, Math.ceil(Math.abs(Math.log(p1 / p2)) / 0.02));
    const dlnp = (Math.log(p2) - Math.log(p1)) / n;   // negatif (naik)
    let T = T1K, lnp = Math.log(p1);
    for (let i = 0; i < n; i++) {
      const k1 = moistDToDlnp(T, Math.exp(lnp));
      const k2 = moistDToDlnp(T + k1 * dlnp, Math.exp(lnp + dlnp));
      T += 0.5 * (k1 + k2) * dlnp;   // Heun (RK2)
      lnp += dlnp;
    }
    return T;
  }

  /* WETBULB (derajat C) lewat aturan Normand. Parcel diangkat ke LCL-nya
     lalu diturunkan lagi sepanjang adiabat basah ke tekanan semula.

     SENGAJA BUKAN rumus pendek Stull. Rumus itu enak sebab satu baris, tapi
     dia tidak melihat tekanan sama sekali, jadi dia cuma benar di dekat
     permukaan laut dan di 300 hPa sudah meleset jauh. Di sini wetbulb
     digambar sepanjang kolom, jadi yang salah di atas akan kelihatan. */
  function wetbulb(p, Tc, Tdc) {
    if (!(Tdc < Tc)) return Tc;                 // sudah jenuh, wetbulb = suhu
    const l = lcl(p, Tc, Tdc);
    if (!isFinite(l.p) || !isFinite(l.T) || l.p <= 0) return Tc;
    const out = moistStep(l.p, l.T + K0, p) - K0;
    return isFinite(out) ? out : Tc;
  }

  /* THETA-E (K), suhu potensial ekuivalen, Bolton 1980 persamaan 38.
     Rasio campurannya dalam g/kg, bukan kg/kg, sesuai bentuk aslinya. */
  function thetaE(p, Tc, Tdc) {
    const w = mixRatio(esat(Tdc), p) * 1000;
    const TK = Tc + K0, TdK = Tdc + K0;
    const Tl = 1 / (1 / (TdK - 56) + Math.log(TK / TdK) / 800) + 56;
    return TK * Math.pow(1000 / p, 0.2854 * (1 - 2.8e-4 * w)) *
           Math.exp((3.376 / Tl - 0.00254) * w * (1 + 8.1e-4 * w));
  }

  /* TINGGI GEOPOTENSIAL (m) dari persamaan hipsometrik.

     Backend TIDAK mengirim tinggi, cuma T, RH, dan angin di 22 level
     tekanan, jadi tingginya diintegrasikan sendiri dari suhu virtual.

     PATOKANNYA level terbawah dianggap nol. Untuk Indonesia yang hampir
     seluruhnya pesisir itu dekat dengan tinggi di atas laut, tapi di
     dataran tinggi angka ini TETAP di atas level 1000 hPa, bukan di atas
     tanah setempat. Dipakai untuk hodograf, geser angin, dan tinggi beku,
     dan untuk ketiganya patokan laut memang yang lazim. */
  function tinggiKolom(L, T, Td) {
    const n = L.length, z = new Array(n);
    z[0] = 0;
    for (let i = 1; i < n; i++) {
      const r1 = mixRatio(esat(Td[i - 1]), L[i - 1]);
      const r2 = mixRatio(esat(Td[i]), L[i]);
      const Tv1 = Tvirt(T[i - 1], r1), Tv2 = Tvirt(T[i], r2);
      z[i] = z[i - 1] + (Rd * 0.5 * (Tv1 + Tv2) / 9.80665) * Math.log(L[i - 1] / L[i]);
    }
    return z;
  }

  // Nilai suatu deret pada tinggi z meter, interpolasi linear.
  function padaTinggi(zArr, arr, zTarget) {
    const n = zArr.length;
    if (zTarget <= zArr[0]) return arr[0];
    for (let i = 1; i < n; i++) {
      if (zArr[i] >= zTarget) {
        const f = (zTarget - zArr[i - 1]) / (zArr[i] - zArr[i - 1]);
        return arr[i - 1] + f * (arr[i] - arr[i - 1]);
      }
    }
    return arr[n - 1];
  }

  /* Satu kali angkat parcel dari level indeks i0, lalu CAPE, CIN, LFC, EL.

     i0 BOLEH BUKAN NOL. Parcel paling tak stabil bisa berasal dari lapisan
     di atas permukaan, dan jalur di bawah asalnya tidak punya arti, jadi
     larik jalurnya diisi NaN di bawah i0 dan integrasinya mulai dari sana. */
  function parcelRun(L, Tenv, Tv, i0, T0, Td0) {
    const n = L.length, p0 = L[i0];
    const r0 = mixRatio(esat(Td0), p0);
    const lc = lcl(p0, T0, Td0);
    const parcelT = new Array(n).fill(NaN), parcelTv = new Array(n).fill(NaN);
    let curP = lc.p, curTK = lc.T + K0;
    for (let i = i0; i < n; i++) {
      const p = L[i];
      let TpC;
      if (p >= lc.p) {
        TpC = (T0 + K0) * Math.pow(p / p0, kappa) - K0;
        parcelTv[i] = Tvirt(TpC, r0);
      } else {
        curTK = moistStep(curP, curTK, p);
        curP = p;
        TpC = curTK - K0;
        parcelTv[i] = Tvirt(TpC, mixRatio(esat(TpC), p));
      }
      parcelT[i] = TpC;
    }

    const b = new Array(n).fill(NaN);
    for (let i = i0; i < n; i++) b[i] = parcelTv[i] - Tv[i];

    /* LFC TIDAK PERNAH DI BAWAH LCL, dan versi pertama bisa melanggar itu.

       Sebabnya apungan di level asal parcel SELALU tepat nol, sebab di situ
       parcel memang masih sama dengan lingkungannya. Pencari perlintasan
       membaca nol itu sebagai "tadinya tidak mengapung", lalu melaporkan
       LFC di level asal. Keluarannya LCL 986 hPa dengan LFC 1000 hPa, yaitu
       konveksi bebas dimulai di bawah dasar awan, dan itu mustahil.

       Yang benar, perlintasannya dicari MULAI DARI LCL, dengan apungan di
       LCL itu sendiri sebagai titik pembanding pertama. Kalau di LCL parcel
       sudah mengapung, LFC-nya ya LCL itu. Di bawah LCL parcel masih kering
       dan belum ada awan, jadi lapisan itu bukan konveksi bebas menurut
       definisinya, seberapa pun apungannya. Luas positif di bawah LFC juga
       tidak dihitung sebagai CAPE, sama seperti di SHARPpy. */
    let iAtas = i0;
    while (iAtas < n - 1 && L[iAtas] > lc.p) iAtas++;
    const TvpLcl = Tvirt(lc.T, r0);          // di LCL parcel pas jenuh, r masih r0
    let TvLcl;
    if (iAtas === i0) {
      TvLcl = Tv[i0];
    } else {
      const f = (Math.log(L[iAtas - 1]) - Math.log(lc.p)) /
                (Math.log(L[iAtas - 1]) - Math.log(L[iAtas]));
      TvLcl = Tv[iAtas - 1] + f * (Tv[iAtas] - Tv[iAtas - 1]);
    }
    const bLcl = TvpLcl - TvLcl;

    let lfc = null, el = null, cape = 0, cin = 0;
    if (bLcl > 0) {
      lfc = lc.p;
    } else {
      let bLalu = bLcl, pLalu = lc.p;
      for (let i = iAtas; i < n; i++) {
        if (b[i] > 0 && bLalu <= 0) {
          const f = bLalu / (bLalu - b[i]);
          lfc = Math.exp(Math.log(pLalu) + f * (Math.log(L[i]) - Math.log(pLalu)));
          break;
        }
        bLalu = b[i]; pLalu = L[i];
      }
    }
    if (lfc !== null) {
      for (let i = i0 + 1; i < n; i++) {
        if (L[i] <= lfc && b[i] < 0 && b[i - 1] >= 0) {
          const f = b[i - 1] / (b[i - 1] - b[i]);
          el = Math.exp(Math.log(L[i - 1]) + f * (Math.log(L[i]) - Math.log(L[i - 1])));
          break;
        }
      }
    }
    for (let i = i0 + 1; i < n; i++) {
      const dlnp = Math.log(L[i - 1] / L[i]);
      const bb = 0.5 * (b[i] + b[i - 1]);
      const pmid = 0.5 * (L[i] + L[i - 1]);
      if (lfc !== null && pmid <= lfc && (el === null || pmid >= el)) {
        if (bb > 0) cape += Rd * bb * dlnp;
      } else if (pmid > (lfc || 0)) {
        if (bb < 0) cin += Rd * bb * dlnp;
      }
    }
    return { parcelT, lcl: lc, lfc, el, cape: Math.max(0, cape), cin };
  }

  /* Hitung profil parcel + indeks. profile = {levels:[hPa surface->atas], T:[°C],
   * RH:[%], u:[m/s], v:[m/s]}. Mengembalikan objek turunan untuk render. */
  function derive(profile) {
    const L = profile.levels, n = L.length;
    const T = profile.T, RH = profile.RH, u = profile.u, v = profile.v;
    const Td = new Array(n), Tv = new Array(n), Tw = new Array(n);
    const thE = new Array(n), thEs = new Array(n);
    for (let i = 0; i < n; i++) {
      Td[i] = dewpoint(T[i], RH[i]);
      Tv[i] = Tvirt(T[i], mixRatio(esat(Td[i]), L[i]));
      Tw[i] = wetbulb(L[i], T[i], Td[i]);
      thE[i] = thetaE(L[i], T[i], Td[i]);
      thEs[i] = thetaE(L[i], T[i], T[i]);      // versi jenuh, Td dibuat = T
    }
    const z = tinggiKolom(L, T, Td);

    // ---- TIGA PARCEL, bukan satu ----
    // SB  dari level terbawah. ML  rata rata 100 hPa terbawah, dan ini yang
    // paling mewakili udara yang benar benar terangkat waktu siang. MU  dari
    // lapisan paling tak stabil dalam 300 hPa terbawah, dipakai waktu udara
    // labilnya justru duduk di atas lapisan dingin dekat tanah.
    const p0 = L[0];
    const sb = parcelRun(L, T, Tv, 0, T[0], Td[0]);

    let sTh = 0, sR = 0, cnt = 0;
    for (let i = 0; i < n && L[i] >= p0 - 100; i++) {
      sTh += (T[i] + K0) * Math.pow(1000 / L[i], kappa);
      sR += mixRatio(esat(Td[i]), L[i]);
      cnt++;
    }
    let ml = sb;
    if (cnt > 1) {
      const thM = sTh / cnt, rM = sR / cnt;
      const Tml = thM * Math.pow(p0 / 1000, kappa) - K0;
      const eM = rM * p0 / (EPS + rM);
      const lnM = Math.log(Math.max(eM, 1e-6) / 6.112);
      ml = parcelRun(L, T, Tv, 0, Tml, 243.5 * lnM / (17.67 - lnM));
    }

    let iMu = 0;
    for (let i = 1; i < n && L[i] >= p0 - 300; i++) if (thE[i] > thE[iMu]) iMu = i;
    const mu = iMu === 0 ? sb : parcelRun(L, T, Tv, iMu, T[iMu], Td[iMu]);

    // Lifted Index di 500 hPa, pakai parcel permukaan seperti definisinya.
    let li = null;
    const i500 = L.indexOf(500);
    if (i500 >= 0) li = T[i500] - sb.parcelT[i500];

    // ---- AIR MAMPU CURAH, mm. Integrasi rasio campuran terhadap tekanan. ----
    let pwat = 0;
    for (let i = 1; i < n; i++) {
      const r1 = mixRatio(esat(Td[i - 1]), L[i - 1]);
      const r2 = mixRatio(esat(Td[i]), L[i]);
      pwat += 0.5 * (r1 + r2) * (L[i - 1] - L[i]) * 100 / 9.80665;
    }

    // ---- Indeks dari level baku. Keduanya dipakai luas di tropis. ----
    const at = (p, arr) => { const i = L.indexOf(p); return i >= 0 ? arr[i] : null; };
    const T850 = at(850, T), T700 = at(700, T), T500 = at(500, T);
    const D850 = at(850, Td), D700 = at(700, Td);
    const kIndex = (T850 !== null && T500 !== null && D850 !== null && T700 !== null && D700 !== null)
      ? (T850 - T500) + D850 - (T700 - D700) : null;
    const totalTotals = (T850 !== null && D850 !== null && T500 !== null)
      ? (T850 + D850) - 2 * T500 : null;

    // ---- Tinggi beku, perlintasan 0 derajat yang pertama dari bawah ----
    let beku = null;
    for (let i = 1; i < n; i++) {
      if (T[i - 1] > 0 && T[i] <= 0) {
        const f = T[i - 1] / (T[i - 1] - T[i]);
        beku = { z: z[i - 1] + f * (z[i] - z[i - 1]),
                 p: Math.exp(Math.log(L[i - 1]) + f * (Math.log(L[i]) - Math.log(L[i - 1]))) };
        break;
      }
    }

    /* ---- DGZ, Dendritic Growth Zone, lapisan -12 sampai -18 derajat ----
       Di situ kristal es tumbuh paling cepat jadi bentuk bercabang, dan
       kalau lapisan itu LEMBAP sekaligus TEBAL, hujannya cenderung deras.
       Yang dicatat batas tekanannya, supaya bisa diarsir di diagram. */
    let dgz = null;
    const pPada = (Ta, Tb, pa, pb, target) => {
      const f = (Ta - target) / (Ta - Tb);
      return Math.exp(Math.log(pa) + f * (Math.log(pb) - Math.log(pa)));
    };
    for (let i = 1; i < n; i++) {
      if (T[i - 1] > -12 && T[i] <= -12) dgz = { pBawah: pPada(T[i - 1], T[i], L[i - 1], L[i], -12) };
      if (dgz && !dgz.pAtas && T[i - 1] > -18 && T[i] <= -18)
        dgz.pAtas = pPada(T[i - 1], T[i], L[i - 1], L[i], -18);
    }
    if (dgz && !dgz.pAtas) dgz = null;

    // ---- Geser angin, beda vektor permukaan ke 1, 3, dan 6 km, knot ----
    const geserPada = (km) => {
      const du = padaTinggi(z, u, km * 1000) - u[0];
      const dv = padaTinggi(z, v, km * 1000) - v[0];
      return Math.hypot(du, dv) * MS_TO_KT;
    };
    const geser = { km1: geserPada(1), km3: geserPada(3), km6: geserPada(6) };

    // Theta-e terkecil di kolom, penanda udara kering yang disedot masuk.
    let iMin = 0;
    for (let i = 1; i < n && z[i] <= 8000; i++) if (thE[i] < thE[iMin]) iMin = i;

    return {
      levels: L, T, Td, Tw, u, v, z, thetaE: thE, thetaEs: thEs,
      // dipertahankan supaya pemakai lama tidak perlu diubah
      parcelT: sb.parcelT, lcl: sb.lcl, lfc: sb.lfc, el: sb.el,
      cape: sb.cape, cin: sb.cin, li,
      sb, ml, mu, iMu,
      pwat, kIndex, totalTotals, beku, dgz, geser,
      thetaEMin: { nilai: thE[iMin], z: z[iMin] },
    };
  }

  // =====================================================================
  //  RENDER SVG (Skew-T log-P klasik)
  // =====================================================================
  const PTOP = 100, PBOT = 1050;         // rentang tekanan diagram (hPa)
  const TMIN = -40, TMAX = 40;           // rentang suhu di dasar (°C)

  function makeGeom(W, H, pad) {
    const x0 = pad.l, y0 = pad.t, plotW = W - pad.l - pad.r, plotH = H - pad.t - pad.b;
    const yBot = y0 + plotH;
    const lnTop = Math.log(PTOP), lnBot = Math.log(PBOT);
    const yOf = (p) => y0 + (Math.log(p) - lnTop) / (lnBot - lnTop) * plotH;
    const SKEW = plotW * 0.9;            // pergeseran-x total dari bawah ke atas (miring)
    const xOf = (Tc, p) => x0 + (Tc - TMIN) / (TMAX - TMIN) * plotW + (yBot - yOf(p)) / plotH * SKEW;
    return { x0, y0, plotW, plotH, yBot, yOf, xOf };
  }

  function poly(pts, stroke, w, dash, fill) {
    const d = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
    return `<path d="${d}" fill="${fill || "none"}" stroke="${stroke}" stroke-width="${w}"${dash ? ` stroke-dasharray="${dash}"` : ""}/>`;
  }

  // sampel kurva sepanjang tekanan (untuk adiabat / garis rasio campuran)
  function curve(fn, g, pLo, pHi) {
    const pts = [];
    for (let p = pHi; p >= pLo - 1; p -= 25) {
      const Tc = fn(p);
      if (Tc === null || !isFinite(Tc)) continue;
      pts.push([g.xOf(Tc, p), g.yOf(p)]);
    }
    return pts;
  }

  // wind barb (kt) di posisi x,y; u,v m/s. bearing meteorologi.
  function barb(x, y, u, v) {
    const spdKt = Math.sqrt(u * u + v * v) * MS_TO_KT;
    if (spdKt < 2.5) return `<circle cx="${x}" cy="${y}" r="3" fill="none" stroke="#333" stroke-width="1"/>`;
    const ang = Math.atan2(-u, -v);            // arah DARI mana angin datang
    const dx = Math.sin(ang), dy = -Math.cos(ang);
    const L = 26;                              // panjang batang
    const bx = x - dx * L, by = y - dy * L;    // ujung batang (arah angin datang)
    let s = `<line x1="${x}" y1="${y}" x2="${bx.toFixed(1)}" y2="${by.toFixed(1)}" stroke="#222" stroke-width="1.2"/>`;
    // duri: 50=bendera,10=penuh,5=setengah
    let rem = Math.round(spdKt / 5) * 5;
    const px = -dx, py = -dy;                   // arah sepanjang batang (ke ujung)
    const perpx = -dy, perpy = dx;              // tegak lurus
    let pos = 0;                                // 0..L dari titik pangkal
    const step = 4.5;
    const put = (len, half, flag) => {
      const ax = x + px * (L - pos), ay = y + py * (L - pos);
      if (flag) {
        const b1x = ax + px * step, b1y = ay + py * step;
        const tx = ax + perpx * 10, ty = ay + perpy * 10;
        s += `<path d="M${ax.toFixed(1)} ${ay.toFixed(1)} L${tx.toFixed(1)} ${ty.toFixed(1)} L${b1x.toFixed(1)} ${b1y.toFixed(1)} Z" fill="#222"/>`;
        pos += step * 1.4;
      } else {
        const ln = half ? 5 : 10;
        const tx = ax + perpx * ln + px * 3, ty = ay + perpy * ln + py * 3;
        s += `<line x1="${ax.toFixed(1)}" y1="${ay.toFixed(1)}" x2="${tx.toFixed(1)}" y2="${ty.toFixed(1)}" stroke="#222" stroke-width="1.2"/>`;
        pos += step;
      }
    };
    while (rem >= 50) { put(0, false, true); rem -= 50; }
    while (rem >= 10) { put(0, false, false); rem -= 10; }
    if (rem >= 5) put(0, true, false);
    return s;
  }

  /* Render diagram. d = hasil derive(). opts {W,H}. Kembalikan string SVG. */
  function svg(d, opts) {
    opts = opts || {};
    const W = opts.W || 340, H = opts.H || 380;
    const pad = { l: 34, r: 34, t: 12, b: 34 };
    const g = makeGeom(W, H, pad);
    const parts = [];
    const clip = `<clipPath id="skclip"><rect x="${g.x0}" y="${g.y0}" width="${g.plotW}" height="${g.plotH}"/></clipPath>`;

    // --- latar: isoterm miring ---
    let bg = "";
    for (let Tc = -100; Tc <= 60; Tc += 10) {
      const p1 = [g.xOf(Tc, PBOT), g.yOf(PBOT)], p2 = [g.xOf(Tc, PTOP), g.yOf(PTOP)];
      const zero = Tc === 0;
      bg += poly([p1, p2], zero ? "#9fb0c8" : "#e2e6ee", zero ? 1.1 : 0.8);
    }
    // --- adiabat kering (theta const) ---
    for (let th = -30; th <= 160; th += 10) {
      const fn = (p) => (th + K0) * Math.pow(p / 1000, kappa) - K0;
      bg += poly(curve(fn, g, PTOP, PBOT), "#f0d9b8", 0.7);
    }
    // --- adiabat basah (dari T di 1000 hPa) ---
    for (let Tb = -20; Tb <= 40; Tb += 5) {
      const pts = [];
      let TK = Tb + K0, p = 1000;
      for (; p >= PTOP - 1; p -= 25) {
        pts.push([g.xOf(TK - K0, p), g.yOf(p)]);
        const np = p - 25; if (np < PTOP - 1) break;
        TK = moistStep(p, TK, np);
      }
      bg += poly(pts, "#bfe3c8", 0.7, "1 3");
    }
    // --- garis rasio campuran (g/kg), dashed ---
    [1, 2, 4, 8, 12, 16, 20].forEach((rgkg) => {
      const r = rgkg / 1000;
      const fn = (p) => {
        const e = r * p / (EPS + r);
        const ln = Math.log(Math.max(e, 1e-6) / 6.112);
        return 243.5 * ln / (17.67 - ln);
      };
      bg += poly(curve(fn, g, 400, PBOT), "#cfe0b0", 0.7, "2 3");
    });

    /* --- pita DGZ, lapisan -12 sampai -18 derajat ---
       Digambar sebagai pita mendatar tipis, bukan kotak miring mengikuti
       isoterm, sebab yang penting dibaca orang itu KETEBALANNYA dalam
       tekanan, dan pita mendatar langsung terbaca di sumbu kiri. */
    if (d.dgz) {
      const yb = g.yOf(d.dgz.pBawah), ya = g.yOf(d.dgz.pAtas);
      bg += `<rect x="${g.x0}" y="${ya.toFixed(1)}" width="${g.plotW}" height="${(yb - ya).toFixed(1)}" fill="rgba(93,235,215,0.20)"/>`;
      bg += `<text x="${(g.x0 + g.plotW - 4).toFixed(1)}" y="${((ya + yb) / 2 + 3).toFixed(1)}" text-anchor="end" font-size="8.5" font-weight="700" fill="#2a8f85" font-family="monospace">DGZ</text>`;
    }

    // --- sumbu ---
    let axis = "";
    [1000, 850, 700, 500, 400, 300, 250, 200, 150, 100].forEach((p) => {
      const y = g.yOf(p);
      axis += `<line x1="${g.x0}" y1="${y.toFixed(1)}" x2="${g.x0 + g.plotW}" y2="${y.toFixed(1)}" stroke="#eceef2" stroke-width="0.6"/>`;
      axis += `<text x="${g.x0 - 4}" y="${(y + 3).toFixed(1)}" text-anchor="end" font-size="9" fill="#5a6472" font-family="monospace">${p}</text>`;
    });
    for (let Tc = -40; Tc <= 40; Tc += 20) {
      const x = g.xOf(Tc, PBOT);
      axis += `<text x="${x.toFixed(1)}" y="${(g.yBot + 14).toFixed(1)}" text-anchor="middle" font-size="9" fill="#5a6472" font-family="monospace">${Tc}</text>`;
    }
    axis += `<text x="${(g.x0 - 24).toFixed(1)}" y="${(g.y0 + g.plotH / 2).toFixed(1)}" text-anchor="middle" font-size="9" fill="#8a94a6" font-family="monospace" transform="rotate(-90 ${(g.x0 - 24).toFixed(1)} ${(g.y0 + g.plotH / 2).toFixed(1)})">hPa</text>`;
    axis += `<text x="${(g.x0 + g.plotW / 2).toFixed(1)}" y="${(g.yBot + 27).toFixed(1)}" text-anchor="middle" font-size="9" fill="#8a94a6" font-family="monospace">Suhu (°C)</text>`;

    // --- arsir CAPE (merah) & CIN (biru): antara parcel & lingkungan ---
    let shade = "";
    const Ld = d.levels;
    function areaBetween(iA, iB, color) {
      const up = [], dn = [];
      for (let i = iA; i <= iB; i++) { up.push([g.xOf(d.parcelT[i], Ld[i]), g.yOf(Ld[i])]); dn.push([g.xOf(d.T[i], Ld[i]), g.yOf(Ld[i])]); }
      const pts = up.concat(dn.reverse());
      shade += poly(pts, "none", 0, null, color);
    }
    // tandai indeks lapis untuk CAPE (parcel>env) & CIN (parcel<env)
    for (let i = 1; i < Ld.length; i++) {
      const warm = d.parcelT[i] > d.T[i] && d.parcelT[i - 1] > d.T[i - 1];
      const cold = d.parcelT[i] < d.T[i] && d.parcelT[i - 1] < d.T[i - 1];
      const inCape = d.lfc && Ld[i] <= d.lfc && (!d.el || Ld[i] >= d.el);
      if (warm && inCape) areaBetween(i - 1, i, "rgba(226,35,32,0.22)");
      else if (cold && d.lfc && Ld[i] > d.lfc) areaBetween(i - 1, i, "rgba(35,96,200,0.18)");
    }

    // --- kurva T (merah), Td (hijau), parcel (putus-putus) ---
    const tPts = Ld.map((p, i) => [g.xOf(d.T[i], p), g.yOf(p)]);
    const tdPts = Ld.map((p, i) => [g.xOf(d.Td[i], p), g.yOf(p)]);
    const paPts = Ld.map((p, i) => [g.xOf(d.parcelT[i], p), g.yOf(p)]);
    let lines = poly(paPts, "#1c1b1b", 1.3, "4 3");
    // Wetbulb duduk di ANTARA Td dan T menurut definisinya, jadi dia tipis
    // dan putus putus supaya tidak berebut perhatian dengan dua kurva pokok.
    const twPts = Ld.map((p, i) => [g.xOf(d.Tw[i], p), g.yOf(p)]);
    lines += poly(twPts, "#0b63b8", 1.1, "3 2");
    lines += poly(tdPts, "#1f8a4c", 2, null);
    lines += poly(tPts, "#e42320", 2, null);

    // --- penanda LCL / LFC / EL ---
    let marks = "";
    const mark = (p, label, color) => {
      if (!p) return;
      const y = g.yOf(p);
      marks += `<line x1="${g.x0}" y1="${y.toFixed(1)}" x2="${g.x0 + g.plotW}" y2="${y.toFixed(1)}" stroke="${color}" stroke-width="1" stroke-dasharray="5 3"/>`;
      marks += `<text x="${g.x0 + 3}" y="${(y - 3).toFixed(1)}" text-anchor="start" font-size="9" font-weight="700" fill="${color}" font-family="monospace">${label}</text>`;
    };
    mark(d.lcl.p, "LCL", "#0029d7");
    mark(d.lfc, "LFC", "#d97706");
    mark(d.el, "EL", "#7a1fa2");

    // --- wind barbs (kolom kanan) ---
    let barbs = "";
    const bx = W - pad.r + 16;
    for (let i = 0; i < Ld.length; i++) {
      if (Ld[i] < PTOP) continue;
      // hindari barb terlalu rapat: lewati bila dekat barb sebelumnya
      barbs += barb(bx, g.yOf(Ld[i]), d.u[i], d.v[i]);
    }

    const body =
      `<g clip-path="url(#skclip)">${bg}${shade}${lines}${marks}</g>${axis}` +
      `<rect x="${g.x0}" y="${g.y0}" width="${g.plotW}" height="${g.plotH}" fill="none" stroke="#1c1b1b" stroke-width="1.2"/>` +
      `<g>${barbs}</g>`;
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px" xmlns="http://www.w3.org/2000/svg"><defs>${clip}</defs>${body}</svg>`;
  }

  // =====================================================================
  //  HODOGRAF
  // =====================================================================
  /* Jejak ujung vektor angin dari permukaan ke atas, sumbu u mendatar dan
     sumbu v tegak, satuannya knot.

     Yang dibaca orang dari gambar ini PUTARAN dan PANJANGNYA. Jejak yang
     panjang berarti geser angin kuat, dan jejak yang melengkung searah
     jarum jam berarti arah angin berputar dengan ketinggian.

     Warnanya per pita ketinggian, bukan satu warna, sebab tanpa itu tidak
     ada cara tahu ujung mana yang bawah dan ujung mana yang atas. */
  const HODO_PITA = [
    [0, 1, "#e42320"], [1, 3, "#f59f00"], [3, 6, "#2f9e7a"], [6, 12, "#1679ab"],
  ];

  function hodo(d, opts) {
    opts = opts || {};
    const W = opts.W || 200, H = opts.H || 200;
    const cx = W / 2, cy = H / 2;
    const rMax = Math.min(W, H) / 2 - 16;

    // Titik tiap kilometer, bukan tiap level, supaya jaraknya rata dibaca.
    const titik = [];
    for (let km = 0; km <= 12; km += 0.5) {
      const zz = km * 1000;
      if (zz > d.z[d.z.length - 1]) break;
      titik.push({ km, u: padaTinggi(d.z, d.u, zz) * MS_TO_KT, v: padaTinggi(d.z, d.v, zz) * MS_TO_KT });
    }
    if (titik.length < 2) return "";

    let maks = 0;
    for (const t of titik) maks = Math.max(maks, Math.hypot(t.u, t.v));
    // Cincin dibulatkan ke 10 knot supaya angkanya enak dibaca.
    const cincin = Math.max(10, Math.ceil(maks / 3 / 10) * 10);
    const skala = rMax / Math.max(cincin * 3, maks * 1.1);
    const X = (uu) => cx + uu * skala, Y = (vv) => cy - vv * skala;

    let g = "";
    for (let r = cincin; r <= cincin * 3 + 0.1; r += cincin) {
      g += `<circle cx="${cx}" cy="${cy}" r="${(r * skala).toFixed(1)}" fill="none" stroke="#e2e6ee" stroke-width="0.8"/>`;
      g += `<text x="${cx + 2}" y="${(cy - r * skala - 2).toFixed(1)}" font-size="7.5" fill="#8a94a6" font-family="monospace">${r}</text>`;
    }
    g += `<line x1="${cx - rMax}" y1="${cy}" x2="${cx + rMax}" y2="${cy}" stroke="#e2e6ee" stroke-width="0.8"/>`;
    g += `<line x1="${cx}" y1="${cy - rMax}" x2="${cx}" y2="${cy + rMax}" stroke="#e2e6ee" stroke-width="0.8"/>`;

    for (const [a, b, warna] of HODO_PITA) {
      const pts = titik.filter((t) => t.km >= a - 1e-6 && t.km <= b + 1e-6)
                       .map((t) => [X(t.u), Y(t.v)]);
      if (pts.length > 1) g += poly(pts, warna, 2.2);
    }
    const tanda = titik.filter((t) => Math.abs(t.km - Math.round(t.km)) < 1e-6 &&
                                      (t.km === 0 || t.km === 1 || t.km % 3 === 0));
    for (const t of tanda) {
      g += `<circle cx="${X(t.u).toFixed(1)}" cy="${Y(t.v).toFixed(1)}" r="${t.km === 0 ? 3.4 : 2.6}" fill="#074173"/>`;
    }
    /* Labelnya ditaruh DARI ATAS KE BAWAH, dan yang akan menimpa label yang
       sudah berdiri dilewati.

       Sebabnya di tropis angin lapisan bawah lemah, jadi titik 0, 1, dan 3
       km sering jatuh berdekatan di dekat pusat dan tulisannya saling
       menumpuk sampai tidak ada yang terbaca. Yang didahulukan yang di
       atas, sebab ujung atas itu yang paling perlu ditandai supaya orang
       tahu jejaknya dibaca dari mana ke mana. */
    const dipakai = [];
    const label = (t) => {
      const x = X(t.u), y = Y(t.v);
      if (!dipakai.every((q) => Math.hypot(q[0] - x, q[1] - y) > 16)) return;
      dipakai.push([x, y]);
      g += `<text x="${(x + 5).toFixed(1)}" y="${(y - 4).toFixed(1)}" font-size="8" font-weight="700" fill="#074173" font-family="monospace">${t.km} km</text>`;
    };
    // Titik nol SELALU dilabeli, didahulukan sebelum yang lain. Dia jangkar
    // seluruh gambar, dan tanpa dia orang tidak tahu ujung mana permukaan.
    if (tanda.length) label(tanda[0]);
    // Sisanya dari ATAS ke bawah, dan yang akan menimpa dilewati.
    for (let i = tanda.length - 1; i >= 1; i--) label(tanda[i]);

    /* Kunci warna pita, empat garis pendek di sudut bawah. Tanpa ini
       warnanya cuma hiasan, sebab tidak ada yang bisa menebak bahwa merah
       itu kilometer pertama. */
    let kunci = "";
    HODO_PITA.forEach(([a, b2, warna], i) => {
      const ky = H - 8 - (HODO_PITA.length - 1 - i) * 9;
      kunci += `<line x1="6" y1="${ky}" x2="18" y2="${ky}" stroke="${warna}" stroke-width="2.2"/>`;
      kunci += `<text x="21" y="${ky + 3}" font-size="7" fill="#8a94a6" font-family="monospace">${a}-${b2} km</text>`;
    });
    g += kunci;

    const kep = `<text x="6" y="11" font-size="9" font-weight="700" fill="#4A6685" font-family="monospace">HODOGRAF · knot</text>`;
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px" xmlns="http://www.w3.org/2000/svg">` +
           `<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" fill="none" stroke="#dfe4ec" stroke-width="1"/>` +
           kep + g + `</svg>`;
  }

  // =====================================================================
  //  PANEL THETA-E
  // =====================================================================
  /* Theta-e terhadap ketinggian. Dua kurva, theta-e sebenarnya dan versi
     jenuhnya.

     KENAPA INI BERGUNA. Theta-e kekal waktu udara naik dan mengembun, jadi
     kalau dia MENURUN dengan ketinggian, udara di atas lebih "ringan
     secara lembap" daripada yang di bawah, dan lapisan itu tidak stabil
     bersyarat. Titik terendahnya menandai udara paling kering di kolom,
     dan itu yang biasanya disedot turun jadi hembusan dingin waktu hujan.

     Jarak antara dua kurva itu KEKERINGAN. Rapat berarti lembap, renggang
     berarti kering. */
  function thetaePanel(d, opts) {
    opts = opts || {};
    const W = opts.W || 200, H = opts.H || 200;
    const pad = { l: 26, r: 8, t: 16, b: 22 };
    const pw = W - pad.l - pad.r, ph = H - pad.t - pad.b;
    const zMaks = 14000;

    const pakai = [];
    for (let i = 0; i < d.z.length; i++) if (d.z[i] <= zMaks) pakai.push(i);
    if (pakai.length < 2) return "";

    let lo = Infinity, hi = -Infinity;
    for (const i of pakai) {
      lo = Math.min(lo, d.thetaE[i], d.thetaEs[i]);
      hi = Math.max(hi, d.thetaE[i], d.thetaEs[i]);
    }
    lo = Math.floor(lo / 10) * 10; hi = Math.ceil(hi / 10) * 10;
    const X = (t) => pad.l + (t - lo) / (hi - lo) * pw;
    const Y = (zz) => pad.t + ph - zz / zMaks * ph;

    let g = "";
    for (let km = 0; km <= 14; km += 2) {
      const y = Y(km * 1000);
      g += `<line x1="${pad.l}" y1="${y.toFixed(1)}" x2="${pad.l + pw}" y2="${y.toFixed(1)}" stroke="#eceef2" stroke-width="0.6"/>`;
      g += `<text x="${pad.l - 4}" y="${(y + 3).toFixed(1)}" text-anchor="end" font-size="7.5" fill="#8a94a6" font-family="monospace">${km}</text>`;
    }
    for (let t = lo; t <= hi + 0.1; t += Math.max(10, Math.round((hi - lo) / 4 / 10) * 10)) {
      const x = X(t);
      g += `<line x1="${x.toFixed(1)}" y1="${pad.t}" x2="${x.toFixed(1)}" y2="${pad.t + ph}" stroke="#f3f5f8" stroke-width="0.6"/>`;
      g += `<text x="${x.toFixed(1)}" y="${(pad.t + ph + 11).toFixed(1)}" text-anchor="middle" font-size="7.5" fill="#8a94a6" font-family="monospace">${Math.round(t)}</text>`;
    }

    g += poly(pakai.map((i) => [X(d.thetaEs[i]), Y(d.z[i])]), "#f59f00", 1.4, "3 2");
    g += poly(pakai.map((i) => [X(d.thetaE[i]), Y(d.z[i])]), "#1f8a4c", 2);

    const ym = Y(d.thetaEMin.z), xm = X(d.thetaEMin.nilai);
    g += `<circle cx="${xm.toFixed(1)}" cy="${ym.toFixed(1)}" r="2.6" fill="#1f8a4c"/>`;
    g += `<text x="${Math.min(xm + 5, W - 4).toFixed(1)}" y="${(ym - 4).toFixed(1)}" text-anchor="${xm > W * 0.6 ? "end" : "start"}" font-size="7.5" font-weight="700" fill="#1f8a4c" font-family="monospace">min ${Math.round(d.thetaEMin.nilai)} K</text>`;

    const kep = `<text x="6" y="11" font-size="9" font-weight="700" fill="#4A6685" font-family="monospace">THETA-E · K, km</text>`;
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px" xmlns="http://www.w3.org/2000/svg">` +
           `<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" fill="none" stroke="#dfe4ec" stroke-width="1"/>` +
           kep + g + `</svg>`;
  }

  window.SkewT = { derive, svg, hodo, thetaePanel, dewpoint };
})();
