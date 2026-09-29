// src/services/pdfService.js
const PDFDocument = require('pdfkit');

// Génère analyse du chemin critique
async function generateCriticalPathPdf(data) {
    return new Promise((resolve, reject) => {
        try {
            console.log("=== DÉBUT GÉNÉRATION RAPPORT CHEMIN CRITIQUE (CPM) ===");

            const doc = new PDFDocument({ margin: 40, size: 'A4' });
            const buffers = [];

            doc.on('data', buffers.push.bind(buffers));
            doc.on('end', () => {
                const pdfBuffer = Buffer.concat(buffers);
                console.log("=== GÉNÉRATION PDF CPM RÉUSSIE ===");
                resolve(pdfBuffer);
            });

            const rawTasks = Array.isArray(data.tasks) ? data.tasks : [];
            const projectName = data.project_name || 'Projet sans nom';
            const managerName = data.manager_name || 'Non spécifié';

            // -------------------------------------------------------------
            // ALGORITHME DU CHEMIN CRITIQUE (CPM : Forward & Backward Pass)
            // -------------------------------------------------------------
            const taskMap = new Map();
            rawTasks.forEach(t => {
                const wbs = (t.wbs || '').toString().trim();
                const preds = (t.predecessor || '')
                    .toString()
                    .split(/[,;]/)
                    .map(p => p.trim())
                    .filter(p => p.length > 0);

                taskMap.set(wbs, {
                    wbs,
                    name: t.tache || 'Tâche',
                    duration: Math.max(Number(t.jour) || 1, 0),
                    preds,
                    successors: [],
                    es: 0, // Early Start
                    ef: 0, // Early Finish
                    ls: 0, // Late Start
                    lf: 0, // Late Finish
                    float: 0, // Total Float
                    isCritical: false
                });
            });

            // Construire le réseau de successeurs
            taskMap.forEach(task => {
                task.preds.forEach(pWbs => {
                    if (taskMap.has(pWbs)) {
                        taskMap.get(pWbs).successors.push(task.wbs);
                    }
                });
            });

            // 1. FORWARD PASS (Calcul de ES et EF)
            let projectDuration = 0;
            taskMap.forEach(task => {
                if (task.preds.length === 0) {
                    task.es = 0;
                } else {
                    let maxEF = 0;
                    task.preds.forEach(pWbs => {
                        if (taskMap.has(pWbs)) {
                            maxEF = Math.max(maxEF, taskMap.get(pWbs).ef);
                        }
                    });
                    task.es = maxEF;
                }
                task.ef = task.es + task.duration;
                projectDuration = Math.max(projectDuration, task.ef);
            });

            // 2. BACKWARD PASS (Calcul de LS, LF et Float)
            const taskArray = Array.from(taskMap.values());
            for (let i = taskArray.length - 1; i >= 0; i--) {
                const task = taskArray[i];
                if (task.successors.length === 0) {
                    task.lf = projectDuration;
                } else {
                    let minLS = Infinity;
                    task.successors.forEach(sWbs => {
                        if (taskMap.has(sWbs)) {
                            minLS = Math.min(minLS, taskMap.get(sWbs).ls);
                        }
                    });
                    task.lf = minLS === Infinity ? projectDuration : minLS;
                }
                task.ls = task.lf - task.duration;
                task.float = task.ls - task.es;
                task.isCritical = task.float === 0;
            }

            const criticalTasks = taskArray.filter(t => t.isCritical);

            // -------------------------------------------------------------
            // CREATION DU DOCUMENT PDF
            // -------------------------------------------------------------

            // En-tête principal
            doc.rect(40, 40, 515, 60).fill('#1F497D');
            doc.fillColor('#FFFFFF')
               .font('Helvetica-Bold')
               .fontSize(16)
               .text("RAPPORT D'ANALYSE DU CHEMIN CRITIQUE (CPM)", 55, 53);
            doc.fontSize(10)
               .font('Helvetica')
               .text(`Projet : ${projectName}  |  Gestionnaire : ${managerName}`, 55, 76);

            // Section 1 : Résumé Exécutif / KPIs
            let currentY = 120;
            doc.fillColor('#1F497D').font('Helvetica-Bold').fontSize(13).text("1. Synthèse du Réseau & Délais", 40, currentY);
            doc.strokeColor('#1F497D').lineWidth(1).moveTo(40, currentY + 16).lineTo(555, currentY + 16).stroke();

            currentY += 25;
            const drawMetricBox = (x, y, label, value, color) => {
                doc.rect(x, y, 160, 50).fillAndStroke('#F2F4F7', '#DCE6F1');
                doc.fillColor('#333333').font('Helvetica').fontSize(9).text(label, x + 5, y + 8, { width: 150, align: 'center' });
                doc.fillColor(color).font('Helvetica-Bold').fontSize(13).text(value, x + 5, y + 26, { width: 150, align: 'center' });
            };

            drawMetricBox(40, currentY, "Durée Minimale du Projet", `${projectDuration} Jours`, '#1F497D');
            drawMetricBox(215, currentY, "Tâches Critiques", `${criticalTasks.length} / ${taskArray.length}`, '#C62828');
            drawMetricBox(390, currentY, "Flexibilité Globale", `${taskArray.length - criticalTasks.length} Tâches avec marge`, '#2E7D32');

            // Section 2 : Chaîne des tâches critiques
            currentY += 65;
            doc.fillColor('#1F497D').font('Helvetica-Bold').fontSize(13).text("2. Séquence du Chemin Critique (Marge = 0)", 40, currentY);
            doc.strokeColor('#1F497D').lineWidth(1).moveTo(40, currentY + 16).lineTo(555, currentY + 16).stroke();

            currentY += 25;
            doc.fillColor('#333333').font('Helvetica').fontSize(9);
            const pathString = criticalTasks.map(t => `[${t.wbs}] ${t.name}`).join('  ➔  ');
            doc.rect(40, currentY, 515, 35).fill('#FFEBEE');
            doc.fillColor('#C62828').font('Helvetica-Bold').text("Avertissement : Tout retard sur ces tâches d'impact direct décalera la date de fin du projet.", 48, currentY + 5);
            doc.fillColor('#333333').font('Helvetica').text(pathString, 48, currentY + 18, { width: 500 });

            // Section 3 : Tableau d'analyse détaillée (ES, EF, LS, LF, Float)
            currentY += 45;
            doc.fillColor('#1F497D').font('Helvetica-Bold').fontSize(13).text("3. Tableau d'Analyse des Marges (Forward/Backward Pass)", 40, currentY);
            doc.strokeColor('#1F497D').lineWidth(1).moveTo(40, currentY + 16).lineTo(555, currentY + 16).stroke();

            currentY += 23;
            // En-tête Tableau
            doc.rect(40, currentY, 515, 20).fill('#1F497D');
            doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8);
            doc.text("WBS", 45, currentY + 6, { width: 35 });
            doc.text("Tâche", 85, currentY + 6, { width: 170 });
            doc.text("Durée", 260, currentY + 6, { width: 35, align: 'center' });
            doc.text("Début/Fin (Tôt)", 300, currentY + 6, { width: 75, align: 'center' });
            doc.text("Début/Fin (Tard)", 380, currentY + 6, { width: 75, align: 'center' });
            doc.text("Marge", 460, currentY + 6, { width: 40, align: 'center' });
            doc.text("Statut", 505, currentY + 6, { width: 45, align: 'center' });

            currentY += 20;
            doc.font('Helvetica').fontSize(8);

            taskArray.slice(0, 22).forEach((t, idx) => {
                const bg = t.isCritical ? '#FFEBEE' : (idx % 2 === 0 ? '#FFFFFF' : '#F9FAFB');
                doc.rect(40, currentY, 515, 17).fill(bg);

                doc.fillColor(t.isCritical ? '#C62828' : '#333333');
                if (t.isCritical) doc.font('Helvetica-Bold'); else doc.font('Helvetica');

                doc.text(t.wbs, 45, currentY + 4, { width: 35 });
                doc.text(t.name.substring(0, 30), 85, currentY + 4, { width: 170 });
                doc.text(`${t.duration} j`, 260, currentY + 4, { width: 35, align: 'center' });
                doc.text(`J${t.es} ➔ J${t.ef}`, 300, currentY + 4, { width: 75, align: 'center' });
                doc.text(`J${t.ls} ➔ J${t.lf}`, 380, currentY + 4, { width: 75, align: 'center' });
                doc.text(`${t.float} j`, 460, currentY + 4, { width: 40, align: 'center' });
                doc.text(t.isCritical ? "CRITIQUE" : "Flexible", 505, currentY + 4, { width: 45, align: 'center' });

                currentY += 17;
            });

            // Pied de page
            doc.fontSize(8).fillColor('#808080').text("Généré automatiquement par le module d'Analyse du Chemin Critique (CPM)", 40, 780, { align: 'center' });

            doc.end();

        } catch (err) {
            console.error("!!! ERREUR DANS generateCriticalPathPdf !!!", err);
            reject(err);
        }
    });
}

// Génère analyse de la valeur acquise
async function generateAnalysisPdf(data) {
    return new Promise((resolve, reject) => {
        try {
            console.log("=== DÉBUT GÉNÉRATION RAPPORT PDF EVM ===");

            const doc = new PDFDocument({ margin: 40, size: 'A4' });
            const buffers = [];

            doc.on('data', buffers.push.bind(buffers));
            doc.on('end', () => {
                const pdfBuffer = Buffer.concat(buffers);
                console.log("=== GÉNÉRATION PDF RÉUSSIE ===");
                resolve(pdfBuffer);
            });

            const tasks = Array.isArray(data.tasks) ? data.tasks : [];
            const projectName = data.project_name || 'Projet sans nom';
            const managerName = data.manager_name || 'Non spécifié';

            // -------------------------------------------------------------
            // CALCUL DES MÉTRIQUES EVM (EARNED VALUE MANAGEMENT)
            // -------------------------------------------------------------
            let totalBAC = 0; // Budget at Completion (Coût total prévu)
            let totalEV = 0;  // Earned Value (Valeur acquise)
            let totalAC = 0;  // Actual Cost (Coût réel)
            let totalPV = 0;  // Planned Value (Valeur planifiée estimée)

            const analyzedTasks = tasks.map(task => {
                const pct = (task.pourcentage !== undefined) 
                    ? (task.pourcentage > 1 ? task.pourcentage / 100 : task.pourcentage) 
                    : 0;
                
                // Si les coûts ne sont pas spécifiés, on utilise la durée (jours) comme pondération
                const budget = task.cout_prevu || (task.jour ? task.jour * 100 : 100);
                const actual = task.cout_reel || (budget * pct * 1.05); // Estimation par défaut si absent

                const ev = budget * pct;
                const pv = budget; // Estimation globale au statut courant

                totalBAC += budget;
                totalEV += ev;
                totalAC += actual;
                totalPV += pv;

                return {
                    wbs: task.wbs || '-',
                    name: task.tache || 'Tâche',
                    pct: Math.round(pct * 100),
                    budget,
                    ev,
                    actual
                };
            });

            // Indicatifs globaux EVM
            const CV = totalEV - totalAC; // Cost Variance
            const SV = totalEV - totalPV; // Schedule Variance
            const CPI = totalAC > 0 ? (totalEV / totalAC) : 1; // Cost Performance Index
            const SPI = totalPV > 0 ? (totalEV / totalPV) : 1; // Schedule Performance Index

            // -------------------------------------------------------------
            // DESIGN & CONTENU DU PDF
            // -------------------------------------------------------------

            // En-tête / Bannière
            doc.rect(40, 40, 515, 60).fill('#1F497D');
            doc.fillColor('#FFFFFF')
               .font('Helvetica-Bold')
               .fontSize(18)
               .text("RAPPORT D'ANALYSE DE LA VALEUR ACQUISE (EVM)", 55, 55);
            doc.fontSize(11)
               .font('Helvetica')
               .text(`Projet : ${projectName}  |  Gestionnaire : ${managerName}`, 55, 80);

            doc.moveDown(3);

            // Section 1 : Résumé des Métriques Clés (KPIs)
            doc.fillColor('#1F497D').font('Helvetica-Bold').fontSize(14).text("1. Synthèse des Indicateurs EVM", 40, 120);
            doc.strokeColor('#1F497D').lineWidth(1).moveTo(40, 137).lineTo(555, 137).stroke();

            // Grille KPI (Tableau recap)
            const kpiTop = 150;
            const drawKPIBox = (x, y, label, value, color) => {
                doc.rect(x, y, 120, 50).fillAndStroke('#F2F4F7', '#DCE6F1');
                doc.fillColor('#333333').font('Helvetica').fontSize(9).text(label, x + 5, y + 8, { width: 110, align: 'center' });
                doc.fillColor(color).font('Helvetica-Bold').fontSize(13).text(value, x + 5, y + 26, { width: 110, align: 'center' });
            };

            drawKPIBox(40, kpiTop, "Budget Total (BAC)", `${totalBAC.toLocaleString()} €`, '#1F497D');
            drawKPIBox(170, kpiTop, "Valeur Acquise (EV)", `${Math.round(totalEV).toLocaleString()} €`, '#1F497D');
            drawKPIBox(300, kpiTop, "Coût Réel (AC)", `${Math.round(totalAC).toLocaleString()} €`, '#1F497D');
            drawKPIBox(430, kpiTop, "Écart Coût (CV)", `${Math.round(CV).toLocaleString()} €`, CV >= 0 ? '#2E7D32' : '#C62828');

            drawKPIBox(40, kpiTop + 60, "Indice Coût (CPI)", CPI.toFixed(2), CPI >= 1 ? '#2E7D32' : '#C62828');
            drawKPIBox(170, kpiTop + 60, "Indice Délais (SPI)", SPI.toFixed(2), SPI >= 1 ? '#2E7D32' : '#C62828');
            drawKPIBox(300, kpiTop + 60, "Écart Délais (SV)", `${Math.round(SV).toLocaleString()} €`, SV >= 0 ? '#2E7D32' : '#C62828');
            
            const healthStatus = (CPI >= 1 && SPI >= 1) ? "EXCELLENT" : (CPI >= 0.9 && SPI >= 0.9) ? "ATTENTION" : "CRITIQUE";
            const healthColor = healthStatus === "EXCELLENT" ? '#2E7D32' : healthStatus === "ATTENTION" ? '#E26B0A' : '#C62828';
            drawKPIBox(430, kpiTop + 60, "Santé du Projet", healthStatus, healthColor);

            // Section 2 : Interprétation
            let currentY = kpiTop + 130;
            doc.fillColor('#1F497D').font('Helvetica-Bold').fontSize(14).text("2. Diagnostic du Projet", 40, currentY);
            doc.strokeColor('#1F497D').lineWidth(1).moveTo(40, currentY + 17).lineTo(555, currentY + 17).stroke();

            currentY += 28;
            doc.fillColor('#333333').font('Helvetica').fontSize(10);
            
            const costDiag = CPI >= 1 
                ? "• Coûts : Le projet respecte son budget (CPI >= 1)." 
                : "• Coûts : Dépassement budgétaire détecté (CPI < 1).";
            const scheduleDiag = SPI >= 1 
                ? "• Délais : Le projet est dans les temps ou en avance (SPI >= 1)." 
                : "• Délais : Le projet accuse un retard par rapport au planning prévu (SPI < 1).";

            doc.text(costDiag, 45, currentY);
            doc.text(scheduleDiag, 45, currentY + 15);

            // Section 3 : Détail par Tâche
            currentY += 40;
            doc.fillColor('#1F497D').font('Helvetica-Bold').fontSize(14).text("3. Détail de l'avancement des tâches", 40, currentY);
            doc.strokeColor('#1F497D').lineWidth(1).moveTo(40, currentY + 17).lineTo(555, currentY + 17).stroke();

            // Tableau des tâches
            currentY += 25;
            doc.rect(40, currentY, 515, 20).fill('#4F81BD');
            doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(9);
            doc.text("WBS", 45, currentY + 5, { width: 40 });
            doc.text("Tâche", 90, currentY + 5, { width: 190 });
            doc.text("Avancement", 280, currentY + 5, { width: 70, align: 'center' });
            doc.text("Budget (BAC)", 350, currentY + 5, { width: 80, align: 'right' });
            doc.text("Valeur Acq. (EV)", 440, currentY + 5, { width: 80, align: 'right' });

            currentY += 20;
            doc.font('Helvetica').fontSize(9);

            analyzedTasks.slice(0, 18).forEach((task, idx) => {
                const bg = (idx % 2 === 0) ? '#FFFFFF' : '#F2F4F7';
                doc.rect(40, currentY, 515, 18).fill(bg);
                doc.fillColor('#333333');
                doc.text(task.wbs, 45, currentY + 4, { width: 40 });
                doc.text(task.name.substring(0, 32), 90, currentY + 4, { width: 190 });
                doc.text(`${task.pct}%`, 280, currentY + 4, { width: 70, align: 'center' });
                doc.text(`${Math.round(task.budget)} €`, 350, currentY + 4, { width: 80, align: 'right' });
                doc.text(`${Math.round(task.ev)} €`, 440, currentY + 4, { width: 80, align: 'right' });
                currentY += 18;
            });

            // Pied de page
            doc.fontSize(8).fillColor('#808080').text("Généré automatiquement via l'outil d'analyse EVM", 40, 780, { align: 'center' });

            doc.end();

        } catch (err) {
            console.error("!!! ERREUR DANS generateAnalysisPdf !!!", err);
            reject(err);
        }
    });
}

// FONCTION PDF COMPLÈTE POUR LA CHARTE
function generateProjectCharterPdf(data) {
    return new Promise((resolve) => {
        const doc = new PDFDocument({ margin: 50, size: 'A4' });
        const chunks = [];
        
        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        
        // Titre principal
        doc.fontSize(24).font('Helvetica-Bold').text('Charte de Projet', { align: 'center' });
        doc.moveDown(1);
        
        // En-tête infos
        doc.fontSize(14).font('Helvetica-Bold').text(data.titre_projet || 'Titre du projet');
        doc.moveDown(0.5);
        doc.fontSize(10).font('Helvetica');
        doc.text(`Client: ${data.client || 'N/A'}`, { continued: true });
        doc.text(`   Responsable de la réalisation: ${data.responsable_realisation || 'N/A'}`);
        doc.text(`Gestionnaire du projet: ${data.gestionnaire_projet || 'N/A'}`, { continued: true });
        doc.text(`   Date de création: ${data.date_creation || 'N/A'}`);
        doc.text(`Date de dernière modification: ${data.date_modification || 'N/A'}`, { continued: true });
        doc.text(`   No de version: ${data.version || '1'}`);
        
        doc.moveDown(1);
        doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke(); // Ligne séparatrice
        doc.moveDown(1);

        // Fonction utilitaire pour les sections
        const addSection = (title, content) => {
            if (content) {
                doc.fontSize(12).font('Helvetica-Bold').text(title.toUpperCase());
                doc.moveDown(0.2);
                doc.fontSize(10).font('Helvetica').text(content, { align: 'justify' });
                doc.moveDown(1);
            }
        };

        // Sections du document
        addSection("Contexte du projet", data.contexte_projet);
        addSection("Objectifs d’affaires", data.objectifs_affaires);
        addSection("Portée du projet", data.portee_projet);
        
        // Livrables (Inclus / Exclus)
        doc.fontSize(12).font('Helvetica-Bold').text("LIVRABLES PRINCIPAUX");
        doc.moveDown(0.2);
        doc.fontSize(10).font('Helvetica-Bold').text("Ce que le projet inclut:");
        doc.font('Helvetica').text(data.livrables_inclus || 'N/A', { align: 'justify' });
        doc.moveDown(0.2);
        doc.font('Helvetica-Bold').text("Ce que le projet exclut:");
        doc.font('Helvetica').text(data.livrables_exclus || 'N/A', { align: 'justify' });
        doc.moveDown(1);

        addSection("Zones grises", data.zones_grises);
        addSection("Parties prenantes", data.parties_prenantes);
        addSection("Risques du projet", data.risques_projet);

        // Contraintes & Hypothèses
        doc.fontSize(12).font('Helvetica-Bold').text("CONTRAINTES DU PROJET / HYPOTHÈSES CRITIQUES");
        doc.moveDown(0.2);
        doc.fontSize(10).font('Helvetica-Bold').text("Contraintes:");
        doc.font('Helvetica').text(data.contraintes || 'N/A', { align: 'justify' });
        doc.moveDown(0.2);
        doc.font('Helvetica-Bold').text("Hypothèses critiques:");
        doc.font('Helvetica').text(data.hypotheses || 'N/A', { align: 'justify' });
        doc.moveDown(1);

        addSection("Budget initial", data.budget_initial);
        addSection("Bénéfices", data.benefices);
        addSection("Facteurs de succès", data.facteurs_succes);

        // Jalons
        if (data.jalons && data.jalons.length > 0) {
            doc.fontSize(12).font('Helvetica-Bold').text("PRINCIPAUX JALONS");
            doc.moveDown(0.2);
            doc.fontSize(10).font('Helvetica-Bold').text("Phase     |     Jalon     |     Échéance");
            doc.font('Helvetica');
            data.jalons.forEach(j => {
                doc.text(`${j.phase || ''}     |     ${j.jalon || ''}     |     ${j.echeance || ''}`);
            });
            doc.moveDown(1);
        }

        // Approbation
        doc.moveDown(2);
        doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
        doc.moveDown(1);
        doc.fontSize(14).font('Helvetica-Bold').text("Approbation", { align: 'center' });
        doc.moveDown(0.5);
        doc.fontSize(10).font('Helvetica').text(`Approuvée: [  ]     Refusée: [  ]`);
        doc.moveDown(1);
        
        addSection("Recommandations / Commentaires", data.recommandations);

        // Signature
        doc.moveDown(2);
        doc.fontSize(10).font('Helvetica');
        doc.text(`Nom du signataire: ${data.signataire_nom || '______________________'}`);
        doc.moveDown(1);
        doc.text("Signature: ______________________");
        doc.moveDown(0.5);
        doc.text("Date: ______________________");
        
        doc.end();
    });
}

module.exports = { generateCriticalPathPdf, generateAnalysisPdf, generateProjectCharterPdf };