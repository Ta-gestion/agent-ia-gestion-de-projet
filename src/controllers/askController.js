// src/controllers/askController.js
const aiService = require('../services/aiService');
const aiTools = require('../services/aiTools');
const excelService = require('../services/excelService');
const pdfService = require('../services/pdfService');
const { saveAndGetPath } = require('../utils/fileUtils');

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
        
        // APPEL DYNAMIQUE À L'IA CHOISIE
        const functionCalls = await aiService.getAiFunctionCalls(aiSettings, prompt, aiTools);
        
        if (functionCalls && functionCalls.length > 0) {
            const filesToDownload = [];
            
            for (const call of functionCalls) {
                const funcName = call.name;
                const args = call.args;
                let buffer;
                
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
            res.json({ files: filesToDownload });
        } else {
            res.json({ text: "L'IA n'a généré aucun fichier pour cette demande." });
        }
    } catch (error) {
        console.error("Erreur:", error);
        res.status(500).json({ error: error.message });
    }
};