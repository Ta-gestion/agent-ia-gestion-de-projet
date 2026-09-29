// src/routes/askRoutes.js
const express = require('express');
const router = express.Router();
const askController = require('../controllers/askController');

router.post('/ask', askController.handleAsk);

module.exports = router;