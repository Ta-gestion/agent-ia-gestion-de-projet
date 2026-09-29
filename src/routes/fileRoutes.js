// src/routes/fileRoutes.js
const express = require('express');
const router = express.Router();
const { openFile } = require('../utils/fileUtils');

router.get('/open-file', async (req, res) => {
    const filePath = decodeURIComponent(req.query.path);
    try {
        await openFile(filePath);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Impossible d'ouvrir le fichier." });
    }
});

module.exports = router;