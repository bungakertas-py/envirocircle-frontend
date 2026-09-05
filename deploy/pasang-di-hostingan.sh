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
# Kalau folder ini kosong, situsnya tetap tampil, cuma masuk mode kosong
# yang menjelaskan datanya belum ada. Itu bukan kerusakan.
# ---------------------------------------------------------------------
for app in atmosight smokewatch; do
  mkdir -p "$SITUS/backend/$app/data/output"
done
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
for app in atmosight smokewatch; do
  d="$SITUS/backend/$app/data/output"
  printf '  data %-12s %s berkas\n' "$app" "$(find "$d" -type f 2>/dev/null | wc -l)"
done
kabar "Selesai. Muat ulang situsnya."
garis
