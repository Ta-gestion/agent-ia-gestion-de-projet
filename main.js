const { app, BrowserWindow } = require('electron');

// Fonction pour démarrer votre serveur Express (votre server.js)
function startServer() {
    require('./server.js');
}

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 850,
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    // On donne 2 secondes à Express pour démarrer avant de charger la page
    setTimeout(() => {
        mainWindow.loadURL('http://localhost:3000');
    }, 2000);
}

// Quand l'application est prête, on lance le serveur et la fenêtre
app.whenReady().then(() => {
    startServer();
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

// Fermer proprement le serveur quand on quitte l'application
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
        process.exit(0); // Force la fermeture du serveur Node en arrière-plan
    }
});