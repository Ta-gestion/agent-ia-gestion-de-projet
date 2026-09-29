// src/routes/templateRoutes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });
const templateController = require('../controllers/templateController');

router.post('/fill-template', upload.single('excelTemplate'), templateController.handleFillTemplate);

module.exports = router;