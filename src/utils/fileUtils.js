// src/utils/fileUtils.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const { exec } = require('child_process');

function saveAndGetPath(buffer, filename) {
    const tempFilePath = path.join(os.tmpdir(), filename);
    fs.writeFileSync(tempFilePath, buffer);
    return tempFilePath;
}

function openFile(filePath) {
    return new Promise((resolve, reject) => {
        if (!filePath.startsWith(os.tmpdir())) return reject("Accès refusé.");
        const cmd = process.platform === 'win32' ? `start "" "${filePath}"` : `open "${filePath}"`;
        exec(cmd, (err) => err ? reject(err) : resolve());
    });
}

module.exports = { saveAndGetPath, openFile };