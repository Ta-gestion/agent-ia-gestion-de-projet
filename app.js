// app.js
const express = require('express');
const path = require('path');
const app = express();

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// On importe les routes
const askRoutes = require('./src/routes/askRoutes');
const templateRoutes = require('./src/routes/templateRoutes');
const fileRoutes = require('./src/routes/fileRoutes');

// On les utilise
app.use('/api', askRoutes);
app.use('/api', templateRoutes);
app.use('/api', fileRoutes);

module.exports = app;