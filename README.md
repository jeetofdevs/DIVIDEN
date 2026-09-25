# DIVIDEN

Bot **auto-distribusi fee token ke holder**, untuk token yang di-launch di [Long.xyz](https://app.long.xyz) (Robinhood Chain) atau chain EVM mana pun.

Fee yang Anda klaim dikirim ke wallet distributor. Bot lalu secara berkala:

1. **Menukar fee ke $AI:** fee dari pair masuk dalam token Anda dan $AI. Bagian token Anda otomatis ditukar ke $AI lewat DEX, dengan proteksi slippage.
2. **Membagi hasilnya: 90% dividen ke holder, 10% ke wallet operasional.**
3. **Memindai holder** dari event `Transfer` token Anda (inkremental, tidak perlu API pihak ketiga).
4. **Menyaring** holder: pool LP, kontrak Long.xyz, dan smart contract lain, alamat burn, serta daftar pengecualian Anda.
5. **Menghitung jatah** tiap holder secara proporsional dengan saldo token.
6. **Mengirim** $AI, ETH, atau ERC-20 (misalnya **Stock Token NVDA**) ke setiap holder. Dengan kontrak Disperse, 100 holder bisa dibayar dalam 1 transaksi.
7. **Mengumumkan** hasilnya ke Telegram (opsional).

```
Fee pair (TOKEN + $AI) ──klaim──► Wallet distributor
                                        │  bot tiap N menit
                                        ├─ swap TOKEN → $AI
                                        ├─ 10% $AI → wallet operasional
                                        └─ 90% $AI → semua holder (proporsional)
```

## Fitur keamanan

- **`DRY_RUN=true` (default):** hanya menampilkan simulasi siapa dapat berapa, tanpa mengirim apa pun.
- **Tidak pernah kirim dobel:** setiap transaksi ditandatangani dan disimpan di `data/state.json` *sebelum* di-broadcast. Kalau bot mati di tengah distribusi, saat dijalankan lagi ia melanjutkan transaksi yang sama. Transaksi yang sudah masuk tidak diulang.
- **Jatah kecil diakumulasi:** holder yang jatahnya di bawah `MIN_PAYOUT` tidak dikirimi dulu, supaya gas tidak lebih mahal dari dividennya. Jatahnya ditahan dan dibayar setelah terkumpul.
- **Transaksi gagal dijadwalkan ulang:** jumlahnya dikembalikan ke saldo pending holder.
- **Cadangan gas:** `GAS_RESERVE` ETH selalu disisakan di wallet.

## Website & logo (AIDIVIDEND)

Folder `web/` berisi landing page berbahasa Inggris (HTML statis, tanpa build) dan aset brand:

| File | Kegunaan |
|---|---|
| `web/index.html` | Landing page: hero, cara kerja, tokenomics 90/10, kalkulator dividen, FAQ |
| `web/assets/logo.svg` / `logo-512.png` | Logo koin (untuk PFP X/Telegram, logo token di Long.xyz) |
| `web/assets/logo-horizontal.svg` / `.png` | Logo + wordmark (banner, header) |
| `web/assets/mascot.jpg` | Maskot asli "Divi" |

Deploy: upload folder `web/` ke Vercel, Netlify, Cloudflare Pages, atau GitHub Pages. Setelah launch, ganti `TBA at launch` di `index.html` dengan contract address.

## Cara pakai

Syarat: Node.js 22+.

```bash
npm install
cp .env.example .env     # lalu isi
npm run once             # satu putaran (DRY_RUN=true → simulasi saja)
npm start                # jalan terus, distribusi tiap awal jam (INTERVAL_MINUTES=60)
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

### Dividen $AI (90% holder / 10% operasional)

```env
PAYOUT_TOKEN=0x...alamat $AI
OPERATIONS_WALLET=0x...wallet operasional
OPERATIONS_BPS=1000          # 10%
SWAP_ROUTER=0x...router DEX tempat pair TOKEN/$AI berada
SWAP_ROUTER_TYPE=v2          # atau v3 + SWAP_QUOTER
SWAP_MAX_AMOUNT=1000000      # jual maks 1 jt TOKEN per putaran
```

Contoh: dalam satu putaran wallet menerima 5 $AI dan 1.000 TOKEN. TOKEN ditukar menjadi 6 $AI, jadi totalnya 11 $AI. Dari situ **1,1 $AI** masuk ke wallet operasional dan **9,9 $AI** dibagikan ke holder sesuai porsi token masing-masing.

> ⚠️ Menjual fee dalam token Anda sendiri menambah tekanan jual. Gunakan `SWAP_MAX_AMOUNT` supaya penjualannya dicicil per putaran.
> Alamat router/quoter DEX di Robinhood Chain **harus Anda pastikan sendiri** (lihat pair token Anda di explorer). Coba dulu dengan `SWAP_MAX_AMOUNT` kecil.

### Contoh pembagian treasury lain

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
| `src/swap.ts` | Auto-swap fee ke token payout (router V2 / V3) |
| `src/notify.ts` | Pengumuman Telegram |
| `contracts/Disperse.sol` | Kontrak kirim-massal ETH/ERC-20 |

## Catatan

- **Klaim fee dari Long.xyz masih manual.** Integrasi klaim otomatis bisa ditambahkan setelah alamat dan ABI kontrak fee Long.xyz diketahui.
- Biarkan `EXCLUDE_CONTRACTS=true`, supaya pool LP dan kontrak launchpad tidak "menyedot" dividen, dan supaya pengiriman ETH ke kontrak yang menolak ETH tidak menggagalkan satu batch.
- `data/state.json` berisi riwayat distribusi. Jangan dihapus saat ada distribusi yang sedang berjalan, dan backup secara berkala.
- Skema bagi hasil ke holder bisa dianggap sekuritas di sebagian yurisdiksi. Pertimbangkan aspek hukumnya.
