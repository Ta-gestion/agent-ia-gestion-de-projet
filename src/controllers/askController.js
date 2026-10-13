// src/controllers/askController.js
const aiService = require('../services/aiService');
const aiTools = require('../services/aiTools');
const excelService = require('../services/excelService');
const pdfService = require('../services/pdfService');
const { saveAndGetPath } = require('../utils/fileUtils');

// Fonction de Garde-fou de sortie (Output Guardrails)
function validateAndSanitizeArgs(funcName, args) {
    let warnings = [];
    
    // 1. Validation de l'Échéancier (Schedule)
    if (funcName === "create_schedule" && args.tasks) {
        args.tasks.forEach((task, i) => {
            // A. Correction du WBS commençant à 0
            if (task.wbs && task.wbs.startsWith('0')) {
                task.wbs = task.wbs.replace(/^0/, '1');
                warnings.push(`WBS corrigé pour la tâche ${i+1} (commençait par 0).`);
            }
            
            // B. Correction du pourcentage d'avancement
            if (task.pourcentage !== undefined) {
                let pct = parseFloat(task.pourcentage);
                if (isNaN(pct)) pct = 0;
                if (pct > 1) pct = pct / 100; // Si l'IA a mis 50 au lieu de 0.5
                if (pct < 0) pct = 0;
                if (pct > 1) pct = 1; // Max 100%
                task.pourcentage = pct;
            }
            
            // C. Correction des dates (Fin avant Début)
            if (task.date_debut && task.date_fin) {
                let d1 = new Date(task.date_debut);
                let d2 = new Date(task.date_fin);
                if (d2 < d1) {
                    task.date_fin = task.date_debut; // On force la fin à être au moins égale au début
                    warnings.push(`Date de fin antérieure au début corrigée pour la tâche ${i+1}.`);
                }
            }
        });
    }
    
    // 2. Validation du Registre de Risques
    if (funcName === "create_risk_register" && args.risks) {
        args.risks.forEach((risk, i) => {
            // A. Probabilité et Impact entre 1 et 5
            let p = parseInt(risk.probabilite) || 1;
            let imp = parseInt(risk.impact) || 1;
            if (p < 1) p = 1; if (p > 5) p = 5;
            if (imp < 1) imp = 1; if (imp > 5) imp = 5;
            risk.probabilite = p;
            risk.impact = imp;
            
            // B. La cote du risque DOIT être P * I
            let expectedScore = p * imp;
            if (parseInt(risk.cote_risque) !== expectedScore) {
                risk.cote_risque = expectedScore;
                warnings.push(`Cote de risque recalculée pour la ligne ${i+1}.`);
            }
        });
    }
    
    return { args, warnings };
}
// ==========================================
// CONTRÔLEUR POUR LE CHAT (MODE STANDARD)
// ==========================================

exports.handleAsk = async (req, res) => {
    const { projectInfo, userQuery, aiSettings } = req.body;
    
    try {
        const prompt = `Tu es un expert mondial en gestion de projet, certifié PMP (Project Management Professional) et aligné sur les standards du PMBOK. 
        Voici les informations du projet: ${projectInfo}. 
        Demande de l'utilisateur: ${userQuery}. 
        Utilise les fonctions à ta disposition pour générer les fichiers demandés.`;
        
        // On récupère maintenant un objet { calls, usage }
        const { calls: functionCalls, usage } = await aiService.getAiFunctionCalls(aiSettings, prompt, aiTools);
        
        if (functionCalls && functionCalls.length > 0) {
            const filesToDownload = [];
            let allWarnings = []; // Pour les Output Guardrails
            
            for (const call of functionCalls) {
                const funcName = call.name;
                let args = call.args;
                let buffer;
                
                // === APPEL DES GARDE-FOUS ===
                const validationResult = validateAndSanitizeArgs(funcName, args);
                args = validationResult.args;
                allWarnings = allWarnings.concat(validationResult.warnings);
                
                if (funcName === "create_risk_register") {
                    buffer = await excelService.generateRiskRegisterExcel(args);
                    const filePath = saveAndGetPath(buffer, "registre_risque.xlsx");
                    filesToDownload.push({ 
                        filename: "registre_risque.xlsx", 
                        base64: buffer.toString('base64'), 
                        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                        path: encodeURIComponent(filePath)
                    });
                }
                else if (funcName === "create_schedule") {
                    buffer = await excelService.generateScheduleExcel(args);
                    const filePath = saveAndGetPath(buffer, "echeancier_gantt.xlsx");
                    filesToDownload.push({ 
                        filename: "echeancier_gantt.xlsx", 
                        base64: buffer.toString('base64'), 
                        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                        path: encodeURIComponent(filePath)
                    });
                }
                else if (funcName === "create_project_charter") {
                    buffer = await pdfService.generateProjectCharterPdf(args);
                    const filePath = saveAndGetPath(buffer, "charte_projet.pdf");
                    filesToDownload.push({ 
                        filename: "charte_projet.pdf", 
                        base64: buffer.toString('base64'), 
                        mimeType: "application/pdf",
                        path: encodeURIComponent(filePath)
                    });
                } 
                else if (funcName === "create_stakeholder_register") {
                    buffer = await excelService.generateStakeholderRegisterExcel(args);
                    const filePath = saveAndGetPath(buffer, "registre_parties_prenantes.xlsx");
                    filesToDownload.push({ 
                        filename: "registre_parties_prenantes.xlsx", 
                        base64: buffer.toString('base64'), 
                        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                        path: encodeURIComponent(filePath)
                    });
                }
                else if (funcName === "create_critical_path_report") {
                    buffer = await pdfService.generateCriticalPathPdf(args);
                    const filePath = saveAndGetPath(buffer, "rapport_chemin_critique_cpm.pdf");
                    filesToDownload.push({ 
                        filename: "rapport_chemin_critique_cpm.pdf", 
                        base64: buffer.toString('base64'), 
                        mimeType: "application/pdf",
                        path: encodeURIComponent(filePath)
                    });
                }
                else if (funcName === "create_analysis_report") {
                    buffer = await pdfService.generateAnalysisPdf(args);
                    const filePath = saveAndGetPath(buffer, "rapport_analyse_evm_projet.pdf");
                    filesToDownload.push({ 
                        filename: "rapport_analyse_evm_projet.pdf", 
                        base64: buffer.toString('base64'), 
                        mimeType: "application/pdf",
                        path: encodeURIComponent(filePath)
                    });
                }
            }
            res.json({ 
                files: filesToDownload,
                usage: usage,
                warnings: allWarnings
            });
        } else {
            res.json({ text: "L'IA n'a généré aucun fichier pour cette demande." });
        }
    } catch (error) {
        console.error("Erreur:", error);
        res.status(500).json({ error: error.message });
    }
};