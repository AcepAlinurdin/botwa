const path = require('path');

module.exports = {
    // Nama bot yang ditampilkan di console
    botName: 'WA Video Document to Video Converter',

    // Karakter prefix untuk perintah (contoh: .tovideo atau !tovideo)
    prefix: ['.', '!', '/', '#'],

    // Otomatis convert video dokumen yang dikirim di chat pribadi (DM) tanpa harus ketik perintah
    autoConvertInPrivate: true,

    // Otomatis convert video dokumen di grup (jika false, harus me-reply video dengan perintah .tovideo)
    autoConvertInGroup: false,

    // Batas maksimal ukuran file yang diproses (dalam MegaBytes)
    // WhatsApp umumnya membatasi pengiriman video hingga ~64-100MB
    maxFileSizeMB: 100,

    // Format ekstensi video yang didukung
    supportedExtensions: [
        '.mp4', '.mkv', '.mov', '.avi', '.webm', 
        '.flv', '.wmv', '.3gp', '.m4v', '.ts', 
        '.mpeg', '.mpg', '.ogv'
    ],

    // Folder direktori
    dirs: {
        temp: path.join(__dirname, 'temp'),
        session: path.join(__dirname, 'session')
    }
};
