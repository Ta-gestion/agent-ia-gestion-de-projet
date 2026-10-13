// src/routes/askRoutes.js
const express = require('express');
const router = express.Router();
const { aiQueue } = require('../services/queueService');

// 1. Créer une nouvelle tâche (Job)
router.post('/ask', async (req, res) => {
    try {
        const { projectInfo, userQuery, aiSettings } = req.body;
        
        // On ajoute la tâche dans la file d'attente
        const job = await aiQueue.add('generate-doc', {
            projectInfo,
            userQuery,
            aiSettings
        });

        // On renvoie l'ID du job au frontend immédiatement
        res.json({ jobId: job.id });
    } catch (error) {
        console.error("Erreur lors de la création du Job:", error);
        res.status(500).json({ error: error.message });
    }
});

// 2. Vérifier le statut d'une tâche (Polling)
router.get('/status/:jobId', async (req, res) => {
    try {
        const job = await aiQueue.getJob(req.params.jobId);
        
        if (!job) {
            return res.status(404).json({ error: "Tâche introuvable." });
        }

        const state = await job.getState();
        const progress = job.progress || 0;
        const result = job.returnvalue || null;

        if (state === 'completed') {
            res.json({ status: 'completed', progress: 100, data: result });
        } else if (state === 'failed') {
            res.json({ status: 'failed', error: job.failedReason || "Erreur inconnue" });
        } else {
            // En file d'attente ou en cours
            res.json({ status: 'processing', progress: progress });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;