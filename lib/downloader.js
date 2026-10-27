const fs = require('fs');
const path = require('path');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const config = require('../config');

/**
 * Mengunduh media dokumen dari pesan WhatsApp dan menyimpannya ke folder temp
 * 
 * @param {Object} docMsg - Objek documentMessage dari Baileys
 * @param {string} mediaType - Tipe media ('document' atau 'video')
 * @returns {Promise<{ filePath: string, fileName: string, fileSize: number }>}
 */
async function downloadMedia(docMsg, mediaType = 'document') {
    const rawFileName = docMsg.fileName || docMsg.title || 'video.mp4';
    let ext = path.extname(rawFileName);
    if (!ext) {
        // Fallback jika tidak ada ekstensi di filename
        if (docMsg.mimetype) {
            if (docMsg.mimetype.includes('mkv')) ext = '.mkv';
            else if (docMsg.mimetype.includes('quicktime')) ext = '.mov';
            else if (docMsg.mimetype.includes('webm')) ext = '.webm';
            else if (docMsg.mimetype.includes('avi')) ext = '.avi';
            else ext = '.mp4';
        } else {
            ext = '.mp4';
        }
    }

    const uniqueId = `${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const tempInputPath = path.join(config.dirs.temp, `input_${uniqueId}${ext}`);

    // Cek batas ukuran file awal jika tersedia di metadata
    const expectedSize = Number(docMsg.fileLength || 0);
    const maxSizeBytes = config.maxFileSizeMB * 1024 * 1024;
    if (expectedSize > maxSizeBytes) {
        throw new Error(
            `Ukuran file (${(expectedSize / 1024 / 1024).toFixed(1)} MB) melebihi batas maksimal bot (${config.maxFileSizeMB} MB)`
        );
    }

    const stream = await downloadContentFromMessage(docMsg, mediaType);
    const writeStream = fs.createWriteStream(tempInputPath);

    let downloadedBytes = 0;

    await new Promise((resolve, reject) => {
        stream.on('data', (chunk) => {
            downloadedBytes += chunk.length;
            if (downloadedBytes > maxSizeBytes) {
                stream.destroy();
                writeStream.destroy();
                reject(new Error(`Ukuran file melebihi batas maksimal ${config.maxFileSizeMB} MB saat proses download.`));
            }
        });

        stream.pipe(writeStream);

        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
        stream.on('error', reject);
    });

    return {
        filePath: tempInputPath,
        fileName: rawFileName,
        fileSize: downloadedBytes
    };
}

module.exports = {
    downloadMedia
};
