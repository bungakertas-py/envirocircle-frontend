#!/usr/bin/env python3
"""Server lokal anti-cache untuk seluruh pohon Envirocircle.

SATU server untuk tiga hal sekaligus, landing page dan dua app peta. Dulu tiap
repo punya dev_server sendiri, dan sejak ketiganya disatukan itu tidak masuk
akal lagi.

Header no-store dipasang untuk SEMUA balasan. Alasannya app peta memuat ratusan
PNG dan JSON dengan nama berkas yang sama antar run, jadi tanpa itu browser
menyajikan frame kemarin dan orang mengira pipeline-nya rusak.

Jalankan dari akar proyek:
    python dev_server.py            # port bawaan 8013
    python dev_server.py 8080       # port lain

Lalu buka:
    http://127.0.0.1:8013/                  landing page
    http://127.0.0.1:8013/atmosight/        peta cuaca
    http://127.0.0.1:8013/smokewatch/       peta kualitas udara

Salinan yang dibagikan sengaja TIDAK membawa keluaran model. Jadi dua app itu
akan terbuka dalam mode kosong, peta dan antarmukanya jalan tapi lapisannya
belum ada. Cara mengisinya ada di README.md.
"""
from __future__ import annotations

import http.server
import os
import socketserver
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8013
ROOT = os.path.dirname(os.path.abspath(__file__))


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    """SimpleHTTPRequestHandler yang selalu mematikan cache browser."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):
        # Bawaannya menulis tiap permintaan, dan app peta menembakkan ratusan
        # berkas sekali muat. Yang disisakan cuma yang bukan 200 dan 304, jadi
        # berkas hilang langsung kelihatan tanpa tenggelam di banjir log.
        kode = args[1] if len(args) > 1 else ""
        if kode not in ("200", "304"):
            super().log_message(fmt, *args)


class Server(socketserver.ThreadingTCPServer):
    # Tanpa ini, port-nya tersandera beberapa puluh detik tiap kali server
    # dimatikan, dan menjalankan ulang langsung gagal.
    allow_reuse_address = True
    daemon_threads = True


if __name__ == "__main__":
    with Server(("127.0.0.1", PORT), NoCacheHandler) as httpd:
        print(f"Envirocircle jalan di http://127.0.0.1:{PORT}/")
        print(f"  landing     http://127.0.0.1:{PORT}/")
        print(f"  Atmosight   http://127.0.0.1:{PORT}/atmosight/")
        print(f"  Smokewatch  http://127.0.0.1:{PORT}/smokewatch/")
        print("Ctrl+C untuk berhenti.")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nBerhenti.")
