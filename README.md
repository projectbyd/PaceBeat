# Japanese Walking Timer

Timer interval untuk treadmill, dibuat khusus untuk metode **Japanese Walking
(Interval Walking Training)**. Berjalan langsung di browser — tidak perlu
build step, backend, atau instalasi apa pun.

## Fitur

- Countdown per tahap dengan cincin progress + timeline keseluruhan
- Pemberitahuan otomatis (suara & voice bahasa Indonesia) saat speed atau
  incline berubah
- Aba-aba beep di 5 detik terakhir sebelum tahap berganti
- Program default 30 menit (8 tahap) ala Japanese Walking
- **Editor program sendiri**: ubah nama tahap, durasi, speed, dan incline,
  atau tambah/hapus tahap sesuka hati
- Toggle suara, kontrol mulai/jeda/reset

## Menjalankan

Cukup buka `index.html` di browser — tidak perlu server.

Untuk deploy ke **GitHub Pages**:

1. Push folder ini ke repo GitHub.
2. Buka **Settings → Pages**.
3. Pilih branch (mis. `main`) dan folder root (`/`), lalu simpan.
4. Situs akan tersedia di `https://<username>.github.io/<repo>/`.

## Struktur proyek

```
japanese-walking-timer/
├── index.html      # markup halaman
├── css/
│   └── style.css   # semua styling (tokens, layout, komponen)
├── js/
│   └── app.js       # logic timer, audio, dan editor program
└── README.md
```

## Catatan teknis

- Suara pakai [Web Audio API](https://developer.mozilla.org/docs/Web/API/Web_Audio_API)
  (beep) dan [SpeechSynthesis API](https://developer.mozilla.org/docs/Web/API/SpeechSynthesis)
  (voice). Browser akan minta izin audio saat tombol **Mulai** ditekan
  pertama kali (kebijakan autoplay browser).
- Program custom disimpan di memori (state JS) selama halaman terbuka —
  belum persisten lintas reload/sesi. Kalau butuh penyimpanan permanen
  (mis. `localStorage`), tinggal tambahkan di `js/app.js`.
- Tidak ada dependency eksternal selain Google Fonts (Bebas Neue, IBM Plex
  Sans, IBM Plex Mono).

## Lisensi

Bebas dipakai dan dimodifikasi untuk keperluan pribadi.
