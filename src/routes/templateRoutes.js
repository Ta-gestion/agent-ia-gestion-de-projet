// src/routes/templateRoutes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });
const { aiQueue } = require('../services/queueService');

router.post('/fill-template', upload.single('excelTemplate'), async (req, res) => {
    try {
        const { projectInfo, userQuery } = req.body;
        let aiSettings = req.body.aiSettings;
        if (typeof aiSettings === 'string') aiSettings = JSON.parse(aiSettings);

        const fileBuffer = req.file.buffer;
        const originalName = req.file.originalname.toLowerCase();
        const isWord = originalName.endsWith('.docx');

        // On met la tâche dans la file d'attente avec un nom spécifique 'generate-template'
        const job = await aiQueue.add('generate-template', {
            projectInfo,
            userQuery,
            aiSettings,
            fileBuffer: fileBuffer.toString('base64'), // On convertit le fichier en base64 pour Redis
            isWord
        });

        res.json({ jobId: job.id });
    } catch (error) {
        console.error("Erreur /api/fill-template:", error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;