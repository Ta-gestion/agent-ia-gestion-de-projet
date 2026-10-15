// src/services/queueService.js
const { Queue, Worker } = require('bullmq');
const aiService = require('./aiService');
const aiTools = require('./aiTools');
const excelService = require('./excelService');
const pdfService = require('./pdfService');
const { saveAndGetPath } = require('../utils/fileUtils');
const { fillExcelTemplate } = require('./pythonService');
const AdmZip = require('adm-zip');
const crypto = require('crypto');

// Importation du service de Cache Sémantique
const { searchCache, saveToCache, connectRedis } = require('./cacheService');

// Connexion à Redis (BullMQ)
const connection = { host: 'localhost', port: 6379 };
const aiQueue = new Queue('ai-tasks', { connection });

// Initialisation du cache au démarrage
connectRedis().catch(console.error);

// 1. LE PRÉFIXE COMMUN (Sera mis en cache par l'IA pour optimiser les coûts FinOps)
const BASE_SYSTEM_PROMPT = `Tu es un expert mondial en gestion de projet, certifié PMP (Project Management Professional) et aligné sur les standards du PMBOK.
        Analyse les balises requises et adapte STRICTEMENT ta posture selon le type de document détecté :
        
        1. S'il s'agit d'un ÉCHÉANCIER / WBS :
            - Structure le tableau de manière hiérarchique. Tu DOIS impérativement générer les lignes de grandes phases de niveau 1 (ex: WBS = "1", "2") ET leurs sous-tâches associées (ex: WBS = "1.1", "1.2", "2.1").
            - Sur les lignes de grandes phases (ex: "1"), laisse les colonnes secondaires (Responsable, Dates, Livrables) vides ou non applicables.
            - Fais progresser les dates de début et de fin de manière chronologique et logique de haut en bas.

        2. S'il s'agit d'un REGISTRE DES RISQUES :
            - Identifie des risques réels, techniques, opérationnels et humains spécifiquement liés au contexte du projet.
            - Formule des plans de réponse (Atténuation, Évitement, Transfert, Acceptation) concrets.

        3. S'il s'agit d'un REGISTRE DES PARTIES PRENANTES :
            - Liste les acteurs clés (Sponsor, Client, Équipe, Fournisseurs, Régulateurs).
            - Évalue correctement leur niveau d'influence et d'intérêt, et définis des stratégies de communication adaptées.

        4. S'il s'agit d'une CHARTE DE PROJET / LIVRABLE TEXTUEL :
            - Rédige des descriptions macroscopiques professionnelles, des objectifs SMART et des critères de succès clairs.

        RÈGLES DE CONTENU ABSOLUES ET CRUCIALES :
        - ANTI-RÉPÉTITION : Chaque ligne du tableau 'rows' doit être TOTALEMENT UNIQUE et apporter une valeur distincte. Les copier-coller ou répétitions de texte d'une ligne à l'autre sont strictement interdits.
        - CHOIX MULTIPLES : Respecte STRICTEMENT les contraintes de choix imposées pour les colonnes à choix multiples. Tu dois utiliser uniquement les termes exacts fournis dans les listes d'options (enum).
        
        Génère entre 15 et 25 lignes de données (pour le tableau 'rows') très détaillées et professionnelles.
        
        RÈGLES CRITIQUES DE TAILLE POUR LE JSON (LIRE ATTENTIVEMENT) :
        1. Ta réponse JSON totale ne doit pas dépasser 4000 tokens. Sois EXTRÊMEMENT concis.
        2. Pour remplir l'objet "metadata", écris au MAXIMUM 3 phrases par champ. Si le champ demande un contexte, fais un paragraphe de 50 mots maximum. N'écris pas de romans.
        3. Les clés de ton JSON doivent être EXACTEMENT les noms des balises. NE LAISSE AUCUN CHAMP VIDE.
        4. Ne modifie JAMAIS l'orthographe des clés.`;

const worker = new Worker('ai-tasks', async (job) => {
    
    // --- 1. Préparation de la Compound Key ---
    const { projectInfo, userQuery, aiSettings } = job.data;
    
    // ==========================================
    // 1. VÉRIFICATION DU CACHE SÉMANTIQUE (Compound Key)
    // ==========================================
    // La clé composée garantit l'isolation Multi-Tenant (l'utilisateur B ne voit pas le cache de A)
    const tenantId = aiSettings.apiKey ? aiSettings.apiKey.slice(-8) : 'local_shared';
    
     // 1. On hashe le contexte (Projet + Fichier si template) pour qu'il ne domine pas le vecteur
    let contextToHash = projectInfo;
    if (job.name === 'generate-template') {
        const fileBuffer = Buffer.from(job.data.fileBuffer, 'base64');
        contextToHash += fileBuffer.toString('hex'); 
    }
    const contextHash = crypto.createHash('md5').update(contextToHash).digest('hex');

    // 2. On ne vectorise que la demande de l'utilisateur (l'intention)
    const cachePrompt = userQuery;

    await job.updateProgress(10);

    // 3. On passe le contextHash au cache au lieu du long texte
    const cachedResponse = await searchCache(tenantId, contextHash, cachePrompt, aiSettings);
    if (cachedResponse) {
        await job.updateProgress(100);
        return { ...cachedResponse, cacheHit: true };
    }

    // ==========================================
    // CAS 1 : MODE TEMPLATE (Upload de fichier)
    // ==========================================
    if (job.name === 'generate-template') {
        const { isWord } = job.data;
        const fileBuffer = Buffer.from(job.data.fileBuffer, 'base64');
        
        await job.updateProgress(20);

        // 1. Analyser le fichier (AdmZip)
        let fileText = '';
        const zip = new AdmZip(fileBuffer);
        if (isWord) {
            const docXmlEntry = zip.getEntry('word/document.xml');
            if (docXmlEntry) fileText = docXmlEntry.getData().toString('utf8').replace(/<[^>]+>/g, '');
        } else {
            const sharedStringsEntry = zip.getEntry('xl/sharedStrings.xml');
            if (sharedStringsEntry) {
                fileText = sharedStringsEntry.getData().toString('utf8').replace(/<[^>]+>/g, '');
            } else {
                const sheetEntries = zip.getEntries().filter(e => e.entryName.match(/xl\/worksheets\/sheet\d+\.xml/));
                sheetEntries.forEach(entry => { fileText += entry.getData().toString('utf8').replace(/<[^>]+>/g, ''); });
            }
        }

        // 2. Extraction des balises
        const allTagsConfig = {};
        const matches = fileText.match(/\{\{([^}]+)\}\}|\[([^\]]+)\]/g);
        if (matches) {
            matches.forEach(m => {
                const rawContent = m.replace(/[\{\}\[\]]/g, '');
                const parts = rawContent.split(':');
                let tagKey = parts[0].trim().replace(/\s+/g, '_').replace(/_+/g, '_');
                if (tagKey.startsWith('row.')) tagKey = tagKey.slice(4);
                else if (tagKey.startsWith('r.')) tagKey = tagKey.slice(2);
                if (parts.length > 1) {
                    allTagsConfig[tagKey] = { enum: parts[1].split(',').map(c => c.trim()) };
                } else if (!allTagsConfig[tagKey]) {
                    allTagsConfig[tagKey] = { type: "string" };
                }
            });
        }
        const allTagsArray = Object.keys(allTagsConfig);
        if (allTagsArray.length === 0) throw new Error("Aucune balise trouvée dans le fichier.");

        // 3. Construction du schéma
        const buildProperties = (keysSubset) => {
            return keysSubset.reduce((acc, key) => {
                if (allTagsConfig[key] && allTagsConfig[key].enum) {
                    acc[key] = { type: "STRING", enum: allTagsConfig[key].enum, description: `Choisis STRICTEMENT l'une de ces valeurs : ${allTagsConfig[key].enum.join(', ')}` };
                } else { acc[key] = { type: "STRING" }; }
                return acc;
            }, {});
        };
        const jsonSchema = {
            type: "OBJECT",
            properties: {
                metadata: { type: "OBJECT", description: "Informations globales du document.", properties: buildProperties(allTagsArray) },
                rows: { type: "ARRAY", description: "Lignes du tableau dynamique.", items: { type: "OBJECT", properties: buildProperties(allTagsArray), required: allTagsArray } }
            },
            required: ["rows"]
        };

        // 4. PROMPTS (Préfixe commun + Suffixe spécifique au Template)
        const systemPrompt = `${BASE_SYSTEM_PROMPT}
        MODE TEMPLATE : Remplis l'objet "metadata" avec les infos globales et le tableau "rows" avec les lignes de données. NE LAISSE AUCUN CHAMP VIDE.`;

        const userPrompt = `Informations du projet : ${projectInfo}.
        Demande de l'utilisateur : ${userQuery}.
        Balises attendues : ${allTagsArray.join(', ')}.`;
        
        await job.updateProgress(40);
        const { data: args, usage } = await aiService.getAiStructuredJson(aiSettings, systemPrompt, userPrompt, jsonSchema);
        
        await job.updateProgress(70);
        const finalBuffer = await fillExcelTemplate(fileBuffer, args, isWord);
        
        await job.updateProgress(90);
        
        // 1. On définit le nom et le type du fichier
        const outputFilename = isWord ? "document_rempli.docx" : "document_rempli.xlsx";
        const outputMime = isWord 
            ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" 
            : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
            
        // 2. On le sauvegarde sur le disque
        const tempFilePath = saveAndGetPath(finalBuffer, outputFilename);

        // 3. On prépare le résultat à renvoyer
        const templateResult = { 
            files: [{ 
                filename: outputFilename, 
                base64: finalBuffer.toString('base64'), 
                mimeType: outputMime, 
                path: encodeURIComponent(tempFilePath) 
            }],
            usage: usage,
            warnings: []
        };

        // 4. ON SAUVEGARDE DANS LE CACHE avec la Compound Key (contextHash + userQuery)
        await saveToCache(tenantId, contextHash, cachePrompt, templateResult, aiSettings);

        return templateResult;
    }

    // ==========================================
    // CAS 2 : MODE STANDARD
    // ==========================================
    await job.updateProgress(20);
    
    // 1. PROMPTS (Préfixe commun + Suffixe spécifique au Mode Standard)
    const systemPrompt = `${BASE_SYSTEM_PROMPT}
    MODE STANDARD : Utilise les fonctions (Tools) à ta disposition pour générer les fichiers demandés.`;

    const userPrompt = `Voici les informations du projet: ${projectInfo}. 
    Demande de l'utilisateur: ${userQuery}.`;

    const { calls: functionCalls, usage } = await aiService.getAiFunctionCalls(aiSettings, systemPrompt, userPrompt, aiTools);
    
    if (!functionCalls || functionCalls.length === 0) {
        return { files: [], usage, warnings: [], text: "L'IA n'a généré aucun fichier." };
    }

    await job.updateProgress(50);
    const filesToDownload = [];
    let allWarnings = [];
    
    for (const call of functionCalls) {
        const funcName = call.name;
        let args = call.args;
        
        // === APPEL DES GARDE-FOUS ===
        const validationResult = validateAndSanitizeArgs(funcName, args);
        args = validationResult.args;
        allWarnings = allWarnings.concat(validationResult.warnings);

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

    await job.updateProgress(90);
    
    // 1. On prépare le résultat à renvoyer
    const finalResult = { files: filesToDownload, usage, warnings: allWarnings };

    // ==========================================
    // 2. SAUVEGARDE DANS LE CACHE SÉMANTIQUE
    // ==========================================
    // On sauvegarde avec la Compound Key (contextHash + cachePrompt)
    await saveToCache(tenantId, contextHash, cachePrompt, finalResult, aiSettings);

    return finalResult;

}, { connection });


// ==========================================
// FONCTION DE GARDE-FOU (Output Guardrails)
// ==========================================
function validateAndSanitizeArgs(funcName, args) {
    let warnings = [];
    
    // 1. Validation de l'Échéancier
    if (funcName === "create_schedule" && args.tasks) {
        args.tasks.forEach((task, i) => {
            if (task.wbs && task.wbs.startsWith('0')) {
                task.wbs = task.wbs.replace(/^0/, '1');
                warnings.push(`WBS corrigé pour la tâche ${i+1}.`);
            }
            if (task.pourcentage !== undefined) {
                let pct = parseFloat(task.pourcentage);
                let wasCorrected = false;
                if (isNaN(pct)) { pct = 0; wasCorrected = true; }
                if (pct > 1) { pct = pct / 100; wasCorrected = true; }
                if (pct < 0) { pct = 0; wasCorrected = true; }
                if (pct > 1) { pct = 1; wasCorrected = true; }
                task.pourcentage = pct;
                if (wasCorrected) warnings.push(`Pourcentage corrigé pour la tâche ${i+1}.`);
            }
            if (task.date_debut && task.date_fin) {
                let d1 = new Date(task.date_debut);
                let d2 = new Date(task.date_fin);
                if (d2 < d1) {
                    task.date_fin = task.date_debut;
                    warnings.push(`Date de fin antérieure corrigée pour la tâche ${i+1}.`);
                }
            }
        });
    }
    
    // 2. Validation du Registre de Risques
    if (funcName === "create_risk_register" && args.risks) {
        args.risks.forEach((risk, i) => {
            let p = parseInt(risk.probabilite) || 1;
            let imp = parseInt(risk.impact) || 1;
            if (p < 1) p = 1; if (p > 5) p = 5;
            if (imp < 1) imp = 1; if (imp > 5) imp = 5;
            risk.probabilite = p;
            risk.impact = imp;
            let expectedScore = p * imp;
            if (parseInt(risk.cote_risque) !== expectedScore) {
                risk.cote_risque = expectedScore;
                warnings.push(`Cote de risque recalculée pour la ligne ${i+1}.`);
            }
        });
    }
    
    return { args, warnings };
}

worker.on('completed', (job) => {
    console.log(`✅ Tâche ${job.id} terminée avec succès !`);
});

worker.on('failed', (job, err) => {
    console.error(`❌ Tâche ${job ? job.id : 'inconnue'} échouée : ${err.message}`);
});

module.exports = { aiQueue };