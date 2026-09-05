# Envirocircle, sisi tampilan

Isi repo ini **cuma yang disajikan ke browser**. Landing page, dua app peta,
gambar, dan huruf. Tidak ada pipeline, tidak ada Python yang memasak data.

```
akar/            landing page
atmosight/       app peta cuaca
smokewatch/      app peta kualitas udara
backend/         kerangka folder data, ISINYA datang dari server
deploy/          satu skrip pasang dan perbarui, plus aturan .htaccess
```

## Data tidak ada di sini, dan itu disengaja

Keluaran pipeline itu ratusan MB dan berganti tiap hari. `.gitignore`
mengabaikan `backend/*/data/output`, jadi repo ini tetap ramping dan **dua
jalur tidak pernah saling menimpa**.

```
repo ini    --git pull-->  hostingan     kode situs, jarang berubah
server      --ssh------->  hostingan     data hasil masak, tiap hari
```

Pipeline dan urusan servernya ada di repo terpisah, `envirocircle`.

## Sumber datanya dipilih sendiri

Kedua app mencoba data lokal dulu, baru menumpang ke keluaran yang tersaji di
GitHub Pages kalau yang lokal belum ada. Jadi satu berkas yang sama jalan di
tiga keadaan tanpa disunting.

| keadaan | yang dipakai |
|---|---|
| dibuka di laptop tanpa data | menumpang |
| di hostingan, server belum mengirim | menumpang |
| di hostingan, server sudah mengirim | data lokal |

Perpindahannya otomatis di muat ulang berikutnya, tidak ada baris yang perlu
diubah. Sumber yang sedang dipakai terbaca di atribut `data-sumber` pada
elemen `<html>`, isinya `dekat` atau `jauh`.

## Alur kerja

Sunting di laptop, push ke sini, lalu tarik di hostingan.

```
di laptop      sunting, git commit, git push
di hostingan   bash ~/public_html/deploy/pasang-di-hostingan.sh
```

Satu perintah itu dipakai untuk memasang pertama kali maupun memperbarui.
Dia tidak pernah menyentuh folder data.

**Jangan menyunting langsung di hostingan.** Skrip itu memakai `reset --hard`,
jadi apa pun yang disunting di sana akan tertimpa tanpa pesan.

## Melihat lokal

```
python3 dev_server.py
```

Lalu buka `http://127.0.0.1:8013/`. Pakai itu, jangan `http.server` biasa.
`dev_server.py` memasang `no-store`, dan tanpa itu browser menyimpan ratusan
PNG dengan nama yang sama antar run lalu menampilkan frame kemarin.

## Landing page tidak punya langkah build

Tidak ada bundler. `import` modul TIDAK bisa dipakai. GSAP dipanggil sebagai
script biasa dari `vendor/`.
