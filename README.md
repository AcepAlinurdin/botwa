# 🤖 Bot WhatsApp - Video Document to Video Player

Bot WhatsApp otomatis yang berfungsi untuk mengonversi **video yang dikirim sebagai dokumen** (seperti file `.mp4`, `.mkv`, `.mov`, `.avi`, `.webm`, dll) menjadi **video biasa** yang bisa langsung diputar dan ditonton langsung di aplikasi WhatsApp.

---

## ✨ Fitur Utama

- ⚡ **Auto Convert di Chat Pribadi (DM):** Kirim file video dokumen apa saja ke bot, bot akan langsung mengunduh dan mengirimkannya kembali sebagai video langsung putar tanpa perlu mengetik perintah apa pun!
- 👥 **Dukungan Grup:** Bisa digunakan di grup WhatsApp dengan me-reply video dokumen menggunakan perintah `.tovideo`.
- 🚀 **Optimasi FFmpeg Super Cepat:**
  - Jika video aslinya sudah H.264/AAC, bot melakukan *fast remux* (< 1 detik).
  - Jika formatnya lain (MKV, HEVC/H.265, AVI, WEBM, dll), bot melakukan *transcode* otomatis ke standar H.264 + AAC + `yuv420p` dengan `+faststart` agar kompatibel 100% di semua HP (Android & iOS).
  - Kompresi cerdas jika ukuran melebihi batas 64 MB WhatsApp.
- 🧹 **Auto Cleanup:** File temporary langsung otomatis dihapus setelah dikirim sehingga memori penyimpanan disk tidak penuh.
- 📱 **2 Pilihan Login:**
  - **Scan QR Code:** Cukup scan QR code yang muncul di terminal.
  - **Pairing Code:** Login tanpa scan kamera, cukup masukkan nomor telepon dan ketik kode 8-digit di WhatsApp.
- 🔄 **Auto Reconnect:** Sesi otomatis disimpan di folder `session/`. Jika koneksi terputus, bot akan menghubungkan ulang secara otomatis.

---

## 🛠️ Persyaratan Sistem

- **Node.js** (v18 atau lebih baru)
- **FFmpeg & FFprobe** (Sudah terpasang di sistem)

---

## 🚀 Cara Menjalankan Bot

### 1. Mode Scan QR Code (Standar)
Jalankan perintah berikut di terminal:
```bash
npm start
```
Akan muncul QR Code di terminal. Buka **WhatsApp di HP** > **Perangkat Tertaut** > **Tautkan Perangkat** > Scan QR Code tersebut.

---

### 2. Mode Pairing Code (Login via Nomor HP)
Jika tidak ingin menggunakan kamera untuk scan QR, Anda bisa menggunakan kode pairing:
```bash
npm run pairing
```
1. Masukkan nomor WhatsApp bot Anda (contoh: `628123456789`).
2. Bot akan menampilkan 8 digit kode pairing (misal: `ABCD-1234`).
3. Di HP Anda: Buka **WhatsApp** > **Perangkat Tertaut** > **Tautkan Perangkat** > Pilih **Tautkan dengan nomor telepon saja**.
4. Masukkan kode 8 digit tersebut.

---

## 📖 Cara Penggunaan

### 1. Di Chat Pribadi (DM)
- Langsung kirimkan file video sebagai dokumen (`.mp4`, `.mkv`, `.mov`, dll).
- Bot otomatis membalas dengan status:
  `⏳ Sedang memproses...`
- Setelah selesai, bot mengirimkan video yang bisa langsung ditonton!

### 2. Di Grup
- Balas (reply/quote) pesan video dokumen yang ingin diubah.
- Ketik perintah:
  ```text
  .tovideo
  ```
  *(atau `.video`)*

### 3. Perintah Tambahan
- `.help` / `.menu` : Menampilkan petunjuk penggunaan.
- `.ping` : Mengecek apakah bot aktif.

---

## ⚙️ Konfigurasi (`config.js`)

Anda dapat menyesuaikan pengaturan pada file `config.js`:
- `autoConvertInPrivate`: Jika `true`, video dokumen di chat pribadi otomatis dikonversi tanpa perintah.
- `autoConvertInGroup`: Jika `true`, video dokumen di grup juga otomatis dikonversi (default: `false` agar tidak spam di grup).
- `maxFileSizeMB`: Batas maksimal ukuran video yang diproses (default: 100 MB).
- `prefix`: Daftar prefix perintah (contoh: `['.', '!', '/', '#']`).

---

## 📂 Struktur Folder

```text
botwa/
├── config.js               # Konfigurasi bot
├── index.js                # File utama & koneksi Baileys
├── lib/
│   ├── converter.js        # Modul FFmpeg & konversi video
│   ├── downloader.js       # Modul pengunduh media dokumen
│   └── messageHandler.js   # Handler pemrosesan pesan masuk
├── session/                # Sesi login WhatsApp (tersimpan otomatis)
├── temp/                   # Folder temporary selama proses konversi
├── package.json
└── README.md
```
