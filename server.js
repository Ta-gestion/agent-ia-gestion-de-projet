// server.js
const app = require('./app');
const PORT = 3000;

app.listen(PORT, () => {
    console.log(`✅ Serveur démarré sur http://localhost:${PORT}`);
});