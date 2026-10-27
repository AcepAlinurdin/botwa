const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const readline = require('readline');
const fs = require('fs');
const path = require('path');

const config = require('./config');
const { handleMessage } = require('./lib/messageHandler');

// Pastikan folder direktori yang dibutuhkan tersedia
if (!fs.existsSync(config.dirs.temp)) {
    fs.mkdirSync(config.dirs.temp, { recursive: true });
}
if (!fs.existsSync(config.dirs.session)) {
    fs.mkdirSync(config.dirs.session, { recursive: true });
}

// Setup input terminal untuk nomor pairing code jika diperlukan
const rl = readline.createInterface({ 
    input: process.stdin, 
    output: process.stdout 
});
const question = (query) => new Promise((resolve) => rl.question(query, resolve));

let isPairingRequested = false;

async function startBot() {
    console.log(`\n========================================`);
    console.log(`  🤖 ${config.botName}`);
    console.log(`========================================\n`);

    // Inisialisasi Auth State (multi-file)
    const { state, saveCreds } = await useMultiFileAuthState(config.dirs.session);
    const { version, isLatest } = await fetchLatestBaileysVersion().catch(() => ({ version: [2, 3000, 1015901307], isLatest: true }));

    console.log(`Menggunakan WA Baileys Versi: ${version.join('.')} (Latest: ${isLatest})`);

    // Logger pino diset ke 'silent' agar tidak mengotori terminal dengan debug log
    const logger = pino({ level: 'silent' });

    const sock = makeWASocket({
        version,
        logger,
        printQRInTerminal: false, // Ditangani sendiri via qrcode-terminal
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, logger)
        },
        browser: ['Ubuntu', 'Chrome', '20.0.04'],
        generateHighQualityLinkPreview: true,
        syncFullHistory: false
    });

    const isUsePairingCode = config.usePairingCode || process.argv.includes('--pairing');

    // Jika belum login dan mode pairing code aktif
    if (isUsePairingCode && !sock.authState.creds.registered && !isPairingRequested) {
        isPairingRequested = true;
        setTimeout(async () => {
            let phoneNumber = config.pairingNumber;
            if (!phoneNumber) {
                phoneNumber = await question('\n📱 Masukkan nomor WhatsApp bot Anda (contoh 628123456789): ');
            }
            phoneNumber = phoneNumber.replace(/[^0-9]/g, '');

            if (!phoneNumber) {
                console.log('Nomor tidak valid! Restart bot untuk mencoba kembali.');
                return;
            }

            try {
                let code = await sock.requestPairingCode(phoneNumber);
                code = code?.match(/.{1,4}/g)?.join('-') || code;
                console.log(`\n=============================================`);
                console.log(`🔑 KODE PAIRING ANDA: ${code}`);
                console.log(`=============================================`);
                console.log(`1. Buka WhatsApp di HP Anda`);
                console.log(`2. Ketuk ikon titik tiga (Android) atau Pengaturan (iOS)`);
                console.log(`3. Pilih "Perangkat Tertaut" > "Tautkan Perangkat"`);
                console.log(`4. Pilih "Tautkan dengan nomor telepon saja"`);
                console.log(`5. Masukkan kode di atas: ${code}\n`);
            } catch (err) {
                console.error('Gagal meminta Pairing Code:', err.message);
            }
        }, 3000);
    }

    // Event perubahan koneksi (QR Code, Terhubung, atau Terputus)
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr && !isUsePairingCode && !sock.authState.creds.registered) {
            console.log('\nScan QR Code berikut menggunakan WhatsApp Anda:\n');
            qrcode.generate(qr, { small: true });
            console.log('\n👉 Buka WhatsApp -> Titik Tiga / Pengaturan -> Perangkat Tertaut -> Tautkan Perangkat\n');
        }

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

            console.log(`[KONEKSI TERPUTUS] Status code: ${statusCode}. Reconnect: ${shouldReconnect}`);

            if (shouldReconnect) {
                console.log('Menghubungkan ulang ke WhatsApp dalam 3 detik...');
                setTimeout(startBot, 3000);
            } else {
                console.log('Sesi telah Logout dari WhatsApp. Menghapus data sesi lama...');
                fs.rmSync(config.dirs.session, { recursive: true, force: true });
                console.log('Silakan jalankan ulang bot untuk login kembali: npm start');
                process.exit(0);
            }
        } else if (connection === 'open') {
            console.log('\n========================================');
            console.log('✅ BOT WHATSAPP BERHASIL TERHUBUNG!');
            console.log(`Nomor Bot: ${sock.user?.id?.split(':')[0] || 'Unknown'}`);
            console.log(`Nama Bot: ${sock.user?.name || config.botName}`);
            console.log('========================================\n');
            console.log('Bot siap mendeteksi dan mengonversi video dokumen!\n');
        }
    });

    // Event simpan kredensial sesi
    sock.ev.on('creds.update', saveCreds);

    // Event pesan masuk
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;

        for (const msg of messages) {
            // Abaikan jika pesan kosong atau pesan dari bot itu sendiri
            if (!msg.message || msg.key.fromMe) continue;

            try {
                await handleMessage(sock, msg);
            } catch (err) {
                console.error('[HANDLE ERROR]', err);
            }
        }
    });
}

// Menangani shutdown bersih jika ditekan Ctrl+C
process.on('SIGINT', () => {
    console.log('\nMenutup bot secara aman...');
    process.exit(0);
});

startBot().catch((err) => {
    console.error('Fatal Error saat menjalankan bot:', err);
});
