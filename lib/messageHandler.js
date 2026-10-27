const fs = require('fs');
const path = require('path');
const config = require('../config');
const { downloadMedia } = require('./downloader');
const { convertVideo, safeDelete } = require('./converter');

/**
 * Mengurai isi pesan dari pembungkus seperti ephemeralMessage, viewOnce, dll.
 * @param {Object} message - Objek pesan dari Baileys
 * @returns {Object} Objek pesan inti
 */
function unwrapMessage(message) {
    if (!message) return null;
    let curr = message;
    while (curr) {
        if (curr.ephemeralMessage) {
            curr = curr.ephemeralMessage.message;
        } else if (curr.viewOnceMessage) {
            curr = curr.viewOnceMessage.message;
        } else if (curr.viewOnceMessageV2) {
            curr = curr.viewOnceMessageV2.message;
        } else if (curr.documentWithCaptionMessage) {
            curr = curr.documentWithCaptionMessage.message;
        } else {
            break;
        }
    }
    return curr;
}

/**
 * Memeriksa apakah suatu dokumen merupakan file video berdasarkan mimetype atau ekstensi
 * @param {Object} doc - Objek documentMessage
 * @returns {boolean}
 */
function isVideoDocument(doc) {
    if (!doc) return false;

    const mimetype = (doc.mimetype || '').toLowerCase();
    if (mimetype.startsWith('video/')) return true;

    const fileName = (doc.fileName || doc.title || '').toLowerCase();
    for (const ext of config.supportedExtensions) {
        if (fileName.endsWith(ext)) return true;
    }

    return false;
}

/**
 * Mengubah detik menjadi format mm:ss atau hh:mm:ss
 * @param {number} sec 
 * @returns {string}
 */
function formatDuration(sec) {
    if (!sec || isNaN(sec)) return '00:00';
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    if (h > 0) {
        return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

/**
 * Handler utama untuk setiap pesan yang masuk
 * @param {Object} sock - Instance Baileys socket
 * @param {Object} msg - Pesan yang masuk
 */
async function handleMessage(sock, msg) {
    const rawMsg = msg.message;
    if (!rawMsg) return;

    const content = unwrapMessage(rawMsg);
    if (!content) return;

    const chatJid = msg.key.remoteJid;
    const isGroup = chatJid.endsWith('@g.us');

    // Mendapatkan teks pesan jika ada
    const text = (
        content.conversation ||
        content.extendedTextMessage?.text ||
        content.documentMessage?.caption ||
        content.imageMessage?.caption ||
        content.videoMessage?.caption ||
        ''
    ).trim();

    // Memeriksa dokumen langsung di pesan ini
    const directDoc = content.documentMessage;

    // Memeriksa dokumen di pesan yang di-reply (quoted message)
    const contextInfo = (
        content.extendedTextMessage?.contextInfo ||
        content.imageMessage?.contextInfo ||
        content.videoMessage?.contextInfo ||
        content.documentMessage?.contextInfo
    );
    const quotedContent = unwrapMessage(contextInfo?.quotedMessage);
    const quotedDoc = quotedContent?.documentMessage;

    // Logika deteksi perintah
    const lowerText = text.toLowerCase();
    const hasCommandPrefix = config.prefix.some(p => lowerText.startsWith(p));
    const cleanCommand = hasCommandPrefix 
        ? lowerText.slice(1).split(/\s+/)[0] 
        : lowerText.split(/\s+/)[0];

    // Perintah bantuan .help / .menu
    if (['help', 'menu', 'bantuan', 'start'].includes(cleanCommand)) {
        const helpText = 
`🤖 *${config.botName}*

Bot ini berfungsi untuk mengonversi video berformat dokumen menjadi video biasa yang bisa langsung diputar di WhatsApp.

📌 *Cara Penggunaan:*
1. *Chat Pribadi (DM):*
   Cukup kirimkan file video dalam bentuk dokumen (.mp4, .mkv, .mov, dll), bot akan otomatis mengonversi dan mengirimkannya kembali sebagai video langsung putar.

2. *Di Grup:*
   Balas (reply) pesan video dokumen dengan mengetik:
   👉 *.tovideo* atau *.video*

3. *Format yang didukung:*
   MP4, MKV, MOV, AVI, WEBM, 3GP, FLV, WMV, TS, dll.
   Maksimal ukuran: ${config.maxFileSizeMB} MB

⚡ *Perintah Lainnya:*
• *.ping* - Cek status bot
• *.help* - Tampilkan petunjuk ini`;

        await sock.sendMessage(chatJid, { text: helpText }, { quoted: msg });
        return;
    }

    // Perintah .ping
    if (['ping', 'p'].includes(cleanCommand)) {
        await sock.sendMessage(chatJid, { text: '🏓 Pong! Bot aktif dan siap mengonversi video.' }, { quoted: msg });
        return;
    }

    // Menentukan target dokumen video yang akan diproses
    let targetDoc = null;
    let shouldConvert = false;
    let originalCaption = '';

    const isConvertCommand = ['tovideo', 'video', 'convert', 'tomp4', 'putar'].includes(cleanCommand);

    if (directDoc && isVideoDocument(directDoc)) {
        // Kasus 1: Video dokumen dikirim langsung
        originalCaption = directDoc.caption || '';
        if (!isGroup && config.autoConvertInPrivate) {
            shouldConvert = true;
        } else if (isGroup && (config.autoConvertInGroup || isConvertCommand)) {
            shouldConvert = true;
        } else if (isConvertCommand) {
            shouldConvert = true;
        }
    } else if (quotedDoc && isVideoDocument(quotedDoc)) {
        // Kasus 2: Video dokumen dibalas (reply) dengan perintah atau pesan
        originalCaption = quotedDoc.caption || '';
        if (isConvertCommand || (!isGroup && (cleanCommand === 'video' || hasCommandPrefix))) {
            shouldConvert = true;
        } else if (isGroup && isConvertCommand) {
            shouldConvert = true;
        }
    }

    if (!shouldConvert) return;

    targetDoc = directDoc && isVideoDocument(directDoc) ? directDoc : quotedDoc;

    let downloadedInputPath = null;
    let convertedOutputPath = null;

    try {
        console.log(`[CONVERT] Memulai proses konversi dari ${chatJid} (File: ${targetDoc.fileName || 'video'})...`);

        // Kirim status awal ke pengguna
        await sock.sendMessage(chatJid, {
            text: '⏳ *Sedang memproses...*\nVideo dokumen sedang diunduh dan disiapkan agar bisa langsung diputar di WhatsApp.'
        }, { quoted: msg });

        // 1. Download media dari WhatsApp
        const downloadRes = await downloadMedia(targetDoc, 'document');
        downloadedInputPath = downloadRes.filePath;

        // 2. Siapkan file output
        const outputUniqueId = `${Date.now()}_${Math.floor(Math.random() * 10000)}`;
        convertedOutputPath = path.join(config.dirs.temp, `output_${outputUniqueId}.mp4`);

        // 3. Konversi ke H.264 MP4 faststart
        const convertRes = await convertVideo(downloadedInputPath, convertedOutputPath);

        // 4. Buat caption informatif
        const fileName = downloadRes.fileName || targetDoc.fileName || 'Video';
        const formattedSize = (convertRes.size / (1024 * 1024)).toFixed(2);
        const durationText = formatDuration(convertRes.duration);

        let finalCaption = `✅ *Video Siap Diputar!*\n\n`;
        finalCaption += `📁 *Nama:* ${fileName}\n`;
        finalCaption += `⏱ *Durasi:* ${durationText}\n`;
        finalCaption += `📦 *Ukuran:* ${formattedSize} MB\n`;
        if (originalCaption) {
            finalCaption += `\n💬 *Caption Asli:*\n${originalCaption}`;
        }

        // 5. Kirim kembali sebagai video message yang langsung bisa diputar
        console.log(`[CONVERT] Mengirim video hasil konversi (${formattedSize} MB) ke ${chatJid}...`);
        await sock.sendMessage(chatJid, {
            video: fs.readFileSync(convertedOutputPath),
            caption: finalCaption,
            mimetype: 'video/mp4',
            fileName: 'video.mp4',
            gifPlayback: false
        }, { quoted: msg });

        console.log(`[CONVERT] Berhasil dikirim ke ${chatJid}!`);
    } catch (err) {
        console.error('[CONVERT ERROR]', err);
        const errorMessage = `❌ *Gagal mengonversi video*\n\nAlasan: ${err.message || 'Terjadi kesalahan internal saat memproses video.'}`;
        await sock.sendMessage(chatJid, { text: errorMessage }, { quoted: msg });
    } finally {
        // 6. Bersihkan file sementara agar penyimpanan disk tetap bersih
        safeDelete(downloadedInputPath, convertedOutputPath);
    }
}

module.exports = {
    handleMessage
};
