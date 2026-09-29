// src/services/pythonService.js
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

async function fillExcelTemplate(templateBuffer, aiData, isWord = false) {
    const tempDir = os.tmpdir();
    const ext = isWord ? '.docx' : '.xlsx';
    const tempFilePath = path.join(tempDir, `template_${Date.now()}${ext}`);
    const tempJsonPath = path.join(tempDir, `data_${Date.now()}.json`);

    fs.writeFileSync(tempFilePath, templateBuffer);
    fs.writeFileSync(tempJsonPath, JSON.stringify(aiData));

    return new Promise((resolve, reject) => {
        // On utilise process.cwd() pour pointer vers la racine du projet
        const pythonCmd = process.platform === 'win32' 
            ? path.join(process.cwd(), 'venv', 'Scripts', 'python.exe') 
            : path.join(process.cwd(), 'venv', 'bin', 'python');
        
        const scriptPath = path.join(process.cwd(), 'fill_template.py');
        
        execFile(pythonCmd, [scriptPath, tempFilePath, tempJsonPath], (error, stdout, stderr) => {
            fs.unlinkSync(tempJsonPath); // Nettoyage du JSON

            if (error) {
                console.error(`\n--- [CRASH DIAGNOSTIC PYTHON] ---`);
                console.error(`Sortie d'erreur (stderr) : ${stderr}`);
                console.error(`Sortie standard (stdout) : ${stdout}`);
                console.error(`---------------------------------\n`);

                if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
                reject(new Error(`Erreur du script Python : ${stderr || stdout}`));
                return;
            }

            const finalBuffer = fs.readFileSync(tempFilePath);
            fs.unlinkSync(tempFilePath); // Nettoyage du fichier
            
            resolve(finalBuffer);
        });
    });
}

module.exports = { fillExcelTemplate };