const { execFile } = require('child_process');
const fs = require('fs');

/**
 * Mendapatkan informasi metadata video menggunakan ffprobe
 * @param {string} filePath - Path file video
 * @returns {Promise<Object>} Metadata video
 */
function probeVideo(filePath) {
    return new Promise((resolve, reject) => {
        const args = [
            '-v', 'quiet',
            '-print_format', 'json',
            '-show_format',
            '-show_streams',
            filePath
        ];

        execFile('ffprobe', args, (error, stdout, stderr) => {
            if (error) {
                return reject(new Error(`Gagal membaca metadata video: ${error.message}`));
            }

            try {
                const info = JSON.parse(stdout);
                const format = info.format || {};
                const streams = info.streams || [];
                const videoStream = streams.find(s => s.codec_type === 'video');
                const audioStream = streams.find(s => s.codec_type === 'audio');

                resolve({
                    duration: parseFloat(format.duration || 0),
                    size: parseInt(format.size || 0, 10),
                    videoCodec: videoStream ? videoStream.codec_name : null,
                    audioCodec: audioStream ? audioStream.codec_name : null,
                    pixFmt: videoStream ? videoStream.pix_fmt : null,
                    width: videoStream ? videoStream.width : null,
                    height: videoStream ? videoStream.height : null
                });
            } catch (err) {
                reject(new Error(`Gagal mem-parsing output ffprobe: ${err.message}`));
            }
        });
    });
}

/**
 * Menjalankan perintah ffmpeg via execFile
 * @param {string[]} args - Argumen ffmpeg
 * @returns {Promise<void>}
 */
function runFfmpeg(args) {
    return new Promise((resolve, reject) => {
        execFile('ffmpeg', args, (error, stdout, stderr) => {
            if (error) {
                return reject(new Error(`FFmpeg error: ${stderr || error.message}`));
            }
            resolve();
        });
    });
}

/**
 * Mengonversi file video dokumen menjadi video MP4 standar WhatsApp
 * (H.264 + AAC + yuv420p + faststart) agar bisa langsung diputar di WhatsApp mobile & web.
 * 
 * @param {string} inputPath - File video dokumen asal
 * @param {string} outputPath - File tujuan .mp4
 * @returns {Promise<{ duration: number, size: number, method: string }>}
 */
async function convertVideo(inputPath, outputPath) {
    let probe = null;
    try {
        probe = await probeVideo(inputPath);
    } catch (e) {
        // Jika ffprobe gagal membaca, kita tetap coba transcode langsung
        console.warn('Peringatan: probeVideo gagal, mencoba langsung transcode:', e.message);
    }

    // Cek apakah video sudah berformat H.264 + AAC + yuv420p dan dalam kontainer MP4
    const isMp4 = inputPath.toLowerCase().endsWith('.mp4');
    const isH264 = probe?.videoCodec === 'h264';
    const isAac = probe?.audioCodec === 'aac' || !probe?.audioCodec;
    const isYuv420p = probe?.pixFmt === 'yuv420p';

    if (isMp4 && isH264 && isAac && isYuv420p) {
        // Fast remux: hanya memindahkan moov atom ke depan tanpa re-encode (sangat cepat < 1 detik)
        try {
            console.log('Video sudah kompatibel H.264/AAC. Melakukan fast remux (faststart)...');
            await runFfmpeg([
                '-y',
                '-i', inputPath,
                '-c', 'copy',
                '-movflags', '+faststart',
                outputPath
            ]);

            const stat = fs.statSync(outputPath);
            return {
                duration: probe?.duration || 0,
                size: stat.size,
                method: 'fast_remux'
            };
        } catch (err) {
            console.warn('Fast remux gagal, beralih ke full transcode:', err.message);
        }
    }

    // Transcode penuh ke H.264/AAC MP4 yang dijamin kompatibel di semua versi WhatsApp
    console.log('Mengonversi video ke H.264/AAC dengan faststart...');
    const transcodeArgs = [
        '-y',
        '-i', inputPath,
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-crf', '23',
        '-pix_fmt', 'yuv420p',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-ac', '2',
        '-movflags', '+faststart',
        outputPath
    ];

    await runFfmpeg(transcodeArgs);

    let stat = fs.statSync(outputPath);

    // Jika file hasil konversi melebihi 64 MB (batas pengiriman video WhatsApp),
    // lakukan kompresi tambahan dengan CRF 28 agar muat
    if (stat.size > 64 * 1024 * 1024) {
        console.log(`Ukuran video (${(stat.size / 1024 / 1024).toFixed(1)} MB) > 64MB. Mengompresi lebih lanjut...`);
        const compressedPath = outputPath.replace('.mp4', '_compressed.mp4');
        await runFfmpeg([
            '-y',
            '-i', inputPath,
            '-c:v', 'libx264',
            '-preset', 'veryfast',
            '-crf', '28',
            '-pix_fmt', 'yuv420p',
            '-c:a', 'aac',
            '-b:a', '96k',
            '-ac', '2',
            '-movflags', '+faststart',
            compressedPath
        ]);

        if (fs.existsSync(compressedPath)) {
            fs.unlinkSync(outputPath);
            fs.renameSync(compressedPath, outputPath);
            stat = fs.statSync(outputPath);
        }
    }

    return {
        duration: probe?.duration || 0,
        size: stat.size,
        method: 'transcode'
    };
}

/**
 * Menghapus file secara aman tanpa memicu crash jika file tidak ada
 * @param {...string} filePaths - Daftar file yang ingin dihapus
 */
function safeDelete(...filePaths) {
    for (const filePath of filePaths) {
        try {
            if (filePath && fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        } catch (err) {
            console.error(`Gagal menghapus file temporary (${filePath}):`, err.message);
        }
    }
}

module.exports = {
    probeVideo,
    convertVideo,
    safeDelete
};
