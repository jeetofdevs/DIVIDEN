# DIVIDEN

Bot **auto-distribusi fee token ke holder**, untuk token yang di-launch di [Long.xyz](https://app.long.xyz) (Robinhood Chain) atau chain EVM mana pun.

Fee creator yang Anda klaim dikirim ke wallet distributor. Bot lalu secara berkala:

1. **Memindai holder** dari event `Transfer` token Anda (inkremental, tidak perlu API pihak ketiga).
2. **Menyaring** holder: pool LP, kontrak Long.xyz, dan smart contract lain, alamat burn, serta daftar pengecualian Anda.
3. **Menghitung jatah** tiap holder secara proporsional dengan saldo token.
4. **Mengirim** ETH atau ERC-20 (misalnya **Stock Token NVDA**) ke setiap holder. Dengan kontrak Disperse, 100 holder bisa dibayar dalam 1 transaksi.
5. **Mengumumkan** hasilnya ke Telegram (opsional).

```
Fee Long.xyz ──klaim──► Wallet distributor ──bot tiap N menit──► semua holder
```

## Fitur keamanan

- **`DRY_RUN=true` (default):** hanya menampilkan simulasi siapa dapat berapa, tanpa mengirim apa pun.
- **Tidak pernah kirim dobel:** setiap transaksi ditandatangani dan disimpan di `data/state.json` *sebelum* di-broadcast. Kalau bot mati di tengah distribusi, saat dijalankan lagi ia melanjutkan transaksi yang sama. Transaksi yang sudah masuk tidak diulang.
- **Jatah kecil diakumulasi:** holder yang jatahnya di bawah `MIN_PAYOUT` tidak dikirimi dulu, supaya gas tidak lebih mahal dari dividennya. Jatahnya ditahan dan dibayar setelah terkumpul.
- **Transaksi gagal dijadwalkan ulang:** jumlahnya dikembalikan ke saldo pending holder.
- **Cadangan gas:** `GAS_RESERVE` ETH selalu disisakan di wallet.

## Cara pakai

Syarat: Node.js 22+.

```bash
npm install
cp .env.example .env     # lalu isi
npm run once             # satu putaran (DRY_RUN=true → simulasi saja)
npm start                # jalan terus, tiap INTERVAL_MINUTES
```

### Langkah setup

1. **Buat wallet baru khusus bot.** Isi sedikit ETH untuk gas. Jangan pakai wallet creator atau wallet utama.
2. **Isi `.env`**: `RPC_URL` dan `CHAIN_ID` Robinhood Chain, `TOKEN_ADDRESS`, dan `TOKEN_DEPLOY_BLOCK` (lihat di explorer).
3. **(Disarankan) Deploy `contracts/Disperse.sol`**, misalnya lewat [Remix](https://remix.ethereum.org), lalu isi `DISPERSE_ADDRESS`. Ini menghemat gas secara signifikan, dan gas di Robinhood Chain relatif mahal.
4. Jalankan `npm run once` dengan `DRY_RUN=true`, lalu **cek daftar holder dan jumlahnya**. Pastikan pool LP tidak ikut terhitung.
5. **Klaim fee** dari Long.xyz dan kirim ke wallet distributor.
6. Setelah yakin, ubah ke `DRY_RUN=false` lalu jalankan `npm start`. Pakai `pm2`, `systemd`, atau VPS supaya bot jalan 24 jam.

### Membagikan Stock Token (misalnya NVDA)

Set `PAYOUT_TOKEN` ke alamat Stock Token, lalu isi wallet distributor dengan token tersebut (swap fee ETH ke NVDA dulu). Bot akan membagikan NVDA ke holder. Wallet tetap butuh sedikit ETH untuk gas.

### Contoh pembagian treasury

Kalau hanya 70% fee yang ingin dibagikan ke holder, ada dua cara:

- kirim hanya 70% hasil klaim ke wallet distributor, **atau**
- set `DISTRIBUTE_BPS=7000`, dan sisa 30% akan tetap tinggal di wallet distributor.

## Konfigurasi

Semua opsi beserta penjelasannya ada di [`.env.example`](.env.example).

## Struktur

| File | Isi |
|---|---|
| `src/index.ts` | Loop utama: snapshot → hitung pool → alokasi → kirim |
| `src/holders.ts` | Pemindaian holder dari event `Transfer` + pengecualian kontrak |
| `src/allocate.ts` | Perhitungan jatah proporsional + akumulasi jatah kecil |
| `src/payout.ts` | Pengiriman idempoten (transfer biasa / Disperse) |
| `src/state.ts` | Penyimpanan state (`data/state.json`) |
| `src/notify.ts` | Pengumuman Telegram |
| `contracts/Disperse.sol` | Kontrak kirim-massal ETH/ERC-20 |

## Catatan

- **Klaim fee dari Long.xyz masih manual.** Integrasi klaim otomatis bisa ditambahkan setelah alamat dan ABI kontrak fee Long.xyz diketahui.
- Biarkan `EXCLUDE_CONTRACTS=true`, supaya pool LP dan kontrak launchpad tidak "menyedot" dividen, dan supaya pengiriman ETH ke kontrak yang menolak ETH tidak menggagalkan satu batch.
- `data/state.json` berisi riwayat distribusi. Jangan dihapus saat ada distribusi yang sedang berjalan, dan backup secara berkala.
- Skema bagi hasil ke holder bisa dianggap sekuritas di sebagian yurisdiksi. Pertimbangkan aspek hukumnya.
