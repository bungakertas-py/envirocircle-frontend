#!/usr/bin/env bash
# =====================================================================
# pasang-di-hostingan.sh
#
# SATU skrip untuk dua keperluan, memasang pertama kali DAN memperbarui.
# Dijalankan DI HOSTINGAN, bukan di laptop dan bukan di server ITERA.
#
#   pertama kali:
#     REPO=https://github.com/<akun>/<repo>.git bash pasang-di-hostingan.sh
#
#   selanjutnya, tiap kali ada push baru:
#     bash ~/public_html/deploy/pasang-di-hostingan.sh
#
# REPO cuma perlu disebut sekali. Sesudah itu remote-nya sudah tersimpan.
#
# YANG DIA SENTUH cuma kode situs. DATA TIDAK PERNAH DISENTUH, sebab
# backend/*/data/output ada di .gitignore, jadi git menganggapnya bukan
# urusannya. Itu disengaja. Kode datang dari GitHub, data datang dari
# server ITERA, dan dua duanya tidak pernah saling menimpa.
# =====================================================================
set -euo pipefail

SITUS="${SITUS:-$HOME/public_html}"
CABANG="${CABANG:-main}"
REPO="${REPO:-}"

garis() { printf '%s\n' "------------------------------------------------------------"; }
kabar() { printf '  %s\n' "$*"; }

garis
echo "  Pasang / perbarui situs"
echo "  folder  $SITUS"
echo "  cabang  $CABANG"
garis

mkdir -p "$SITUS"
cd "$SITUS"

# ---------------------------------------------------------------------
# 1. Pastikan folder ini salinan kerja git.
#
# Sengaja `git init` di dalam folder yang SUDAH ada isinya, bukan
# `git clone` ke folder kosong. public_html bawaan hostingan sudah berisi
# halaman sambutan penyedia, cgi-bin, php.ini, .user.ini, dan .htaccess
# buatan cPanel.
# `git clone` menolak folder yang tidak kosong, dan mengosongkannya dulu
# berarti membuang berkas milik penyedia yang mungkin dia butuhkan.
#
# Dengan cara ini berkas bawaan itu tetap ada sebagai untracked, tidak
# ikut ke git, dan tidak terganggu.
# ---------------------------------------------------------------------
if [ ! -d .git ]; then
  if [ -z "$REPO" ]; then
    echo "  BERHENTI. Ini pemasangan pertama, jadi REPO wajib disebut." >&2
    echo "  Contoh:" >&2
    echo "    REPO=https://github.com/<akun>/<repo>.git bash $0" >&2
    exit 1
  fi
  kabar "Belum ada .git, memasang pertama kali"
  git init -q
  git remote add origin "$REPO"
else
  if [ -n "$REPO" ]; then
    git remote set-url origin "$REPO"
    kabar "Alamat repo diperbarui"
  fi
fi

kabar "Menarik dari $(git remote get-url origin)"
git fetch -q origin "$CABANG"

LAMA="$(git rev-parse --short HEAD 2>/dev/null || echo "belum ada")"

# reset --hard, BUKAN pull. Salinan di hostingan ini tidak pernah disunting
# tangan, jadi dia harus selalu sama persis dengan yang di GitHub. Merge
# atau rebase cuma bisa gagal di sini, dan gagalnya di tengah malam.
#
# reset --hard TIDAK menghapus berkas untracked maupun yang di-gitignore,
# jadi data dan berkas bawaan hostingan aman.
git reset --hard -q "origin/$CABANG"

BARU="$(git rev-parse --short HEAD)"

if [ "$LAMA" = "$BARU" ]; then
  kabar "Kode sudah paling baru, $BARU"
else
  kabar "Kode $LAMA -> $BARU"
  git --no-pager log --oneline "$LAMA..$BARU" 2>/dev/null | sed 's/^/      /' || true
fi

# ---------------------------------------------------------------------
# 2. Folder data. Dibuat kalau belum ada, TIDAK PERNAH dihapus.
#
# SATU MODEL SATU FOLDER, akar data/output sengaja dibiarkan kosong. Dulu
# model utama duduk di akar, dan itu bikin keluaran model lain yang salah
# taruh langsung menimpa catalog model yang sudah jalan.
#
# Foldernya dibuat di sini walaupun masih kosong, dua alasannya. Susunannya
# jadi KELIHATAN di disk, jadi yang mengirim data tidak perlu menebak nama
# foldernya. Dan skrip kiriman yang lupa `mkdir -p` tidak gagal gara gara
# folder tujuannya belum ada.
#
# Daftar di bawah ini cerminan dari MODELS di atmosight/app.js dan
# smokewatch/app.js, TAPI HANYA YANG HIDUP. Model yang MODEL_AKTIF-nya false
# sengaja TIDAK dibuatkan folder, sebab tidak ada yang akan mengisinya dan
# folder kosong yang tak berguna cuma bikin orang bertanya tanya isinya apa.
#
# Jadi wrf_citarum TIDAK ada di sini. Dia masih terdaftar di app.js sebagai
# arsip yang dimatikan, dan itu memang disengaja, tapi selama dimatikan dia
# tidak butuh tempat di disk. Kalau suatu saat dinyalakan, tambahkan namanya
# di sini juga.
#
# Salinan dua tempat memang tidak ideal, tapi bash tidak bisa membaca
# konstanta JavaScript, dan menebak dari nama folder yang sudah ada justru
# lebih rapuh.
#
# Kalau folder ini kosong, situsnya tetap tampil, cuma masuk mode kosong
# yang menjelaskan datanya belum ada. Itu bukan kerusakan.
# ---------------------------------------------------------------------
MODEL_ATMOSIGHT="gfs wrfchem_9km_meteo"
MODEL_SMOKEWATCH="cams wrfchem_9km_kimia"

for m in $MODEL_ATMOSIGHT;  do mkdir -p "$SITUS/backend/atmosight/data/output/$m";  done
for m in $MODEL_SMOKEWATCH; do mkdir -p "$SITUS/backend/smokewatch/data/output/$m"; done
kabar "Folder data siap, isinya tidak disentuh"

# ---------------------------------------------------------------------
# 3. Aturan .htaccess.
#
# Hostingan TIDAK memasang cache-control sendiri, dan daftar isi folder
# MENYALA bawaan. Tanpa Options -Indexes, seluruh isi folder data
# terpajang ke publik. Dua duanya sudah diuji langsung, bukan dibaca dari
# dokumentasi.
#
# Aturannya DISISIPKAN di antara penanda, bukan menimpa berkasnya, sebab
# .htaccess bawaan berisi arahan PHP dari cPanel yang tidak boleh hilang.
# Kompresi TIDAK diurus di sini, brotli sudah hidup bawaan.
# ---------------------------------------------------------------------
HT="$SITUS/.htaccess"
BUKA="# >>> envirocircle, jangan disunting tangan >>>"
TUTUP="# <<< envirocircle <<<"
SUMBER="$SITUS/deploy/htaccess-tambahan.txt"

if [ ! -f "$SUMBER" ]; then
  kabar "PERINGATAN, $SUMBER tidak ada, aturan .htaccess dilewati"
else
  touch "$HT"
  # buang blok lama kalau ada, lalu pasang yang baru
  if grep -qF "$BUKA" "$HT"; then
    sed -i.bak "/^${BUKA//\//\\/}\$/,/^${TUTUP//\//\\/}\$/d" "$HT"
    rm -f "$HT.bak"
  fi
  {
    echo "$BUKA"
    cat "$SUMBER"
    echo "$TUTUP"
  } >> "$HT"
  kabar "Aturan .htaccess dipasang"
fi

# ---------------------------------------------------------------------
# 4. Laporan
# ---------------------------------------------------------------------
garis
echo "  Isi folder data, per model."
lapor_model() {
  local app="$1" daftar="$2" m d n
  for m in $daftar; do
    d="$SITUS/backend/$app/data/output/$m"
    n="$(find "$d" -type f 2>/dev/null | wc -l)"
    # Berkas berawalan titik seperti .gitkeep ikut terhitung find, tapi TIDAK
    # muncul di `ls` biasa. Disebut angkanya saja supaya tidak bingung waktu
    # `ls` kelihatan kosong padahal laporannya bukan nol.
    printf '    %-11s %-20s %s berkas\n' "$app" "$m" "$n"
  done
}
lapor_model atmosight  "$MODEL_ATMOSIGHT"
lapor_model smokewatch "$MODEL_SMOKEWATCH"
echo
kabar "Folder kosong itu WAJAR selama datanya belum dikirim server."
kabar "Selesai. Muat ulang situsnya."
garis
