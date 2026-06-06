# Scan LJK

Aplikasi web statis untuk memindai Lembar Jawaban Komputer (LJK) PSAT seperti template SMP Negeri 12 Kota Sukabumi. Aplikasi ini dirancang agar bisa langsung dipublikasikan melalui GitHub Pages.

## Fitur

- Input gambar melalui upload file JPG/PNG atau kamera perangkat.
- Deteksi 4 kotak hitam sudut kertas, koreksi perspektif, lalu baca jawaban nomor 1-40.
- Input kunci jawaban dalam format berurutan (`ABCD...`) atau bernomor (`1:A, 2:B, ...`).
- Nilai langsung muncul setiap selesai scan.
- Koreksi manual jika ada jawaban yang ragu/tidak terbaca.
- Simpan banyak hasil scan di browser dan download rekap dalam format Excel (`.xlsx`).
- Tidak membutuhkan backend; seluruh pemrosesan berjalan di browser pengguna.

## Cara menjalankan lokal

Karena aplikasi memakai kamera dan library dari CDN, jalankan dengan server lokal, misalnya:

```bash
python3 -m http.server 8000
```

Lalu buka `http://localhost:8000`.

## Publikasi GitHub Pages

1. Push repository ini ke GitHub.
2. Buka **Settings → Pages**.
3. Pilih sumber branch yang berisi `index.html`.
4. Simpan, lalu akses URL GitHub Pages yang diberikan.

## Catatan akurasi scan

- Pastikan 4 kotak hitam penanda sudut terlihat penuh.
- Foto sebaiknya diambil dari atas, cukup terang, dan tidak terlalu miring.
- Area jawaban pada template dipetakan untuk 40 soal dengan pilihan A-D. Jika template LJK berubah, koordinat bubble di `app.js` perlu disesuaikan.
