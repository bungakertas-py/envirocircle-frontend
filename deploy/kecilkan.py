#!/usr/bin/env python3
"""Mengecilkan salinan JS dan CSS DI HOSTINGAN, bukan di repo.

Dijalankan pasang-di-hostingan.sh sesudah `git reset --hard`, jadi sumbernya
selalu dikembalikan dulu ke versi GitHub sebelum dikecilkan lagi. Aman diulang
dan tidak pernah bentrok.

Yang dibuang cuma KOMENTAR dan spasi di awal/akhir baris. Nama variabel tidak
disentuh, jadi kalau ada galat di hostingan, nomor barisnya masih berarti dan
jejak tumpukannya masih bisa dibaca.

Kenapa tidak memakai minifier betulan: repo ini sengaja tanpa Node dan tanpa
node_modules, dan hostingan cuma punya Python. Menambah rantai alat demi 10
persen tambahan tidak sepadan dengan beban merawatnya.

Pemindainya sadar string, template literal, dan regex literal, sebab `//` di
dalam string dan `/*` di dalam template bukan komentar. Kalau ada yang tidak
bisa dipastikan, berkasnya DILEWATI utuh, bukan ditebak.
"""
import sys, os, io

# Kata kunci yang boleh diikuti regex literal. Sesudah nilai (identifier,
# angka, kurung tutup) sebuah "/" selalu pembagian, bukan regex.
KATA_OP = {"return","typeof","case","in","of","delete","void","new","do","else",
           "yield","await","instanceof","throw"}
IDEN = set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_$")

def kecilkan_js(s):
    keluar, i, n = [], 0, len(s)
    nilai = False          # token sebelumnya sebuah NILAI? kalau ya, "/" = bagi
    kurawal = 0            # kurawal di luar string dan komentar, untuk penjaga
    while i < n:
        c = s[i]
        if c in IDEN:                                   # identifier atau angka, utuh
            j = i
            while j < n and s[j] in IDEN: j += 1
            kata = s[i:j]
            keluar.append(kata); nilai = kata not in KATA_OP; i = j; continue
        if c in "\"'":
            j = i + 1
            while j < n:
                if s[j] == "\\": j += 2; continue
                if s[j] == c: break
                if s[j] == "\n": raise ValueError("string tak tertutup, baris %d" % (s[:i].count("\n")+1))
                j += 1
            if j >= n: raise ValueError("string tak tertutup")
            keluar.append(s[i:j+1]); nilai = True; i = j + 1; continue
        if c == "`":
            j, dalam = i + 1, 0
            while j < n:
                if s[j] == "\\": j += 2; continue
                if s[j] == "$" and j+1 < n and s[j+1] == "{": dalam += 1; j += 2; continue
                if s[j] == "}" and dalam: dalam -= 1; j += 1; continue
                if s[j] == "`" and not dalam: break
                j += 1
            if j >= n: raise ValueError("template tak tertutup")
            keluar.append(s[i:j+1]); nilai = True; i = j + 1; continue
        if c == "/" and i+1 < n and s[i+1] == "/":
            while i < n and s[i] != "\n": i += 1
            continue
        if c == "/" and i+1 < n and s[i+1] == "*":
            j = s.find("*/", i+2)
            if j < 0: raise ValueError("komentar blok tak tertutup")
            keluar.append(" "); i = j + 2; continue
        if c == "/" and not nilai:                      # regex literal
            j, kelas = i + 1, False
            while j < n:
                if s[j] == "\\": j += 2; continue
                if s[j] == "[": kelas = True
                elif s[j] == "]": kelas = False
                elif s[j] == "/" and not kelas: break
                elif s[j] == "\n": raise ValueError("regex tak tertutup, baris %d" % (s[:i].count("\n")+1))
                j += 1
            if j >= n: raise ValueError("regex tak tertutup")
            j += 1
            while j < n and s[j].isalpha(): j += 1
            keluar.append(s[i:j]); nilai = True; i = j; continue
        if c == "{": kurawal += 1
        elif c == "}": kurawal -= 1
        if not c.isspace():
            nilai = c in ")]"
        keluar.append(c); i += 1
    teks = "".join(keluar)
    hasil = "\n".join(b.strip() for b in teks.splitlines() if b.strip())
    if kurawal != 0: raise ValueError("kurawal tidak seimbang di luar string")
    return hasil

def kecilkan_css(s):
    keluar, i, n = [], 0, len(s)
    while i < n:
        c = s[i]
        if c in "\"'":
            j = i + 1
            while j < n:
                if s[j] == "\\": j += 2; continue
                if s[j] == c: break
                j += 1
            if j >= n: raise ValueError("string css tak tertutup")
            keluar.append(s[i:j+1]); i = j + 1; continue
        if c == "/" and i + 1 < n and s[i+1] == "*":
            j = s.find("*/", i + 2)
            if j < 0: raise ValueError("komentar css tak tertutup")
            keluar.append(" "); i = j + 2; continue
        keluar.append(c); i += 1
    teks = "".join(keluar)
    return "\n".join(b.strip() for b in teks.splitlines() if b.strip())

def main(akar):
    hemat_total = dilewati = 0
    for dirpath, dirnames, filenames in os.walk(akar):
        dirnames[:] = [d for d in dirnames if d not in (".git", "vendor", "backend", "node_modules")]
        for f in filenames:
            if not f.endswith((".js", ".css")) or f == "sw.js":
                continue
            p = os.path.join(dirpath, f)
            try:
                asli = io.open(p, encoding="utf-8").read()
                baru = kecilkan_js(asli) if f.endswith(".js") else kecilkan_css(asli)
                if len(baru) < len(asli) * 0.3:
                    raise ValueError("hasilnya menyusut terlalu jauh")
                if len(baru) > len(asli):
                    raise ValueError("hasilnya malah membesar")
                io.open(p, "w", encoding="utf-8", newline="").write(baru)
                hemat_total += len(asli) - len(baru)
            except Exception as e:
                dilewati += 1
                print("    LEWAT %s: %s" % (os.path.relpath(p, akar), e))
    print("    Dikecilkan, hemat %d KB mentah%s" %
          (hemat_total / 1024, ", %d berkas dilewati" % dilewati if dilewati else ""))

if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else ".")
