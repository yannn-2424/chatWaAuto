# 🚀 AutoWA - WhatsApp Automation & Message Scheduler

Aplikasi web full-stack untuk penjadwalan dan otomatisasi pengiriman pesan WhatsApp (Personal & Grup) berbasis Node.js, Baileys, Express, SQLite, React, dan Tailwind CSS.

---

## 🛠️ Cara Menjalankan Aplikasi

### 1. Menjalankan Server Backend (Port 5000)
```bash
cd server
npm start
```

### 2. Menjalankan Frontend Web UI (Port 3000)
```bash
cd client
npm run dev
```

Buka browser dan navigasi ke **`http://localhost:3000`**.

---

## 📌 Fitur Utama

1. **WhatsApp Web Gateway**:
   - Autentikasi mudah via **Scan QR Code** langsung di web dashboard.
   - Penanganan status koneksi secara otomatis (Connected, Disconnected, Reconnecting).
2. **Penjadwalan Pesan Fleksibel**:
   - **Target**: Grup WhatsApp maupun kontak pribadi/nomor kustom.
   - **Tipe Jadwal**:
     - *Sekali Kirim (One-Time)*: Bebas menentukan tanggal & jam.
     - *Setiap Hari (Daily)*: Mengirim pesan rutin setiap hari di jam tertentu.
     - *Hari Spesifik (Weekly)*: Memilih hari-hari aktif (misal: Senin, Rabu, Jumat).
3. **Pesan Kustom & Dynamic Placeholders**:
   - `{nama}`: Otomatis diganti dengan nama grup / kontak target.
   - `{tanggal}`: Otomatis diganti dengan tanggal hari pengiriman.
   - `{jam}`: Otomatis diganti dengan jam pengiriman.
4. **Uji Coba Pengiriman (Instant Test Send)**:
   - Fitur pengujian pesan langsung untuk memastikan koneksi WhatsApp berjalan lancar.
5. **Log Riwayat & Statistik**:
   - Pemantauan real-time status pengiriman pesan (*Sukses*, *Gagal*, atau *Pending*).
