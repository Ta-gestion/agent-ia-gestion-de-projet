// src/controllers/templateController.js
const { fillExcelTemplate } = require('../services/pythonService');
const aiService = require('../services/aiService');
const { saveAndGetPath } = require('../utils/fileUtils');
const AdmZip = require('adm-zip');

// ==========================================
// CONTRÔLEUR POUR L'UPLOAD DE MODÈLE
// ==========================================

exports.handleFillTemplate = async (req, res) => {
    try {
        const { projectInfo, userQuery } = req.body;
        let aiSettings = req.body.aiSettings;
        if (typeof aiSettings === 'string') {
            aiSettings = JSON.parse(aiSettings);
        }
        
        const fileBuffer = req.file.buffer;
        const originalName = req.file.originalname.toLowerCase();
        const isWord = originalName.endsWith('.docx');

        // 1. ANALYSE ROBUSTE PAR EXTRACTION XML (AdmZip)
        let fileText = '';
        
        try {
            const zip = new AdmZip(fileBuffer);
            if (isWord) {
                const docXmlEntry = zip.getEntry('word/document.xml');
                if (docXmlEntry) {
                    fileText = docXmlEntry.getData().toString('utf8').replace(/<[^>]+>/g, ''); 
                }
            } else {
                const sharedStringsEntry = zip.getEntry('xl/sharedStrings.xml');
                if (sharedStringsEntry) {
                    fileText = sharedStringsEntry.getData().toString('utf8').replace(/<[^>]+>/g, '');
                } else {
                    const sheetEntries = zip.getEntries().filter(e => e.entryName.match(/xl\/worksheets\/sheet\d+\.xml/));
                    sheetEntries.forEach(entry => {
                        fileText += entry.getData().toString('utf8').replace(/<[^>]+>/g, '');
                    });
                }
            }
        } catch (e) {
            console.error("Erreur lecture ZIP:", e);
            return res.status(400).json({ error: "Fichier invalide ou corrompu." });
        }

        // Extraction des balises {{...}} (Excel) OU [...] (Word)
        const allTagsConfig = {};
        const matches = fileText.match(/\{\{([^}]+)\}\}|\[([^\]]+)\]/g);
        
        if (matches) {
            matches.forEach(m => {
                const rawContent = m.replace(/[\{\}\[\]]/g, '');
                const parts = rawContent.split(':');
                let tagKey = parts[0].trim();
                
                tagKey = tagKey.replace(/\s+/g, '_');
                tagKey = tagKey.replace(/_+/g, '_');
                
                if (tagKey.startsWith('row.')) {
                    tagKey = tagKey.slice(4);
                } else if (tagKey.startsWith('r.')) {
                    tagKey = tagKey.slice(2);
                }
                
                if (parts.length > 1) {
                    const choices = parts[1].split(',').map(c => c.trim());
                    allTagsConfig[tagKey] = { enum: choices };
                } else if (!allTagsConfig[tagKey]) {
                    allTagsConfig[tagKey] = { type: "string" };
                }
            });
        }

        const allTagsArray = Object.keys(allTagsConfig);
        if (allTagsArray.length === 0) {
            return res.status(400).json({ error: "Aucune balise {{...}} trouvée dans le fichier." });
        }

        // 2. CONSTRUCTION DYNAMIQUE DU SCHÉMA DE L'IA 
        const buildProperties = (keysSubset) => {
            return keysSubset.reduce((acc, key) => {
                if (allTagsConfig[key] && allTagsConfig[key].enum) {
                    acc[key] = { 
                        type: "STRING", 
                        enum: allTagsConfig[key].enum,
                        description: `Choisis STRICTEMENT l'une de ces valeurs : ${allTagsConfig[key].enum.join(', ')}`
                    };
                } else {
                    acc[key] = { type: "STRING" };
                }
                return acc;
            }, {});
        };

        const jsonSchema = {
            type: "OBJECT",
            properties: {
                metadata: {
                    type: "OBJECT",
                    description: "Informations globales du document (ex: Nom du projet). Laisse vide si le document n'est qu'un tableau.",
                    properties: buildProperties(allTagsArray)
                },
                rows: {
                    type: "ARRAY",
                    description: "Lignes du tableau dynamique (Parties prenantes, Risques, Tâches).",
                    items: {
                        type: "OBJECT",
                        properties: buildProperties(allTagsArray),
                        required: allTagsArray
                    }
                }
            },
            required: ["rows"]
        };

        // 3. CONFIGURATION DU MODÈLE ET PROMPT UNIVERSEL PMBOK / PMP
        const prompt = `Tu es un expert mondial en gestion de projet, certifié PMP (Project Management Professional) et aligné sur les standards du PMBOK.
        Informations du projet : ${projectInfo}.
        Demande de l'utilisateur : ${userQuery}.

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
        
        // APPEL VIA LE SERVICE IA
        const args = await aiService.getAiStructuredJson(aiSettings, prompt, jsonSchema);

        // SÉCURITÉ
        if (!args || (!args.metadata && !args.rows)) {
            return res.status(500).json({ error: "L'IA a renvoyé un JSON vide ou incomplet. Veuillez réessayer en demandant moins de lignes." });
        }

        console.log("=== DONNÉES REÇUES DE L'IA (Mode Template) ===");
        console.log(JSON.stringify(args, null, 2));
        console.log("=============================================");

        // 4. Injecter les données via le script Python
        const finalBuffer = await fillExcelTemplate(fileBuffer, args, isWord);
        
        const outputFilename = isWord ? "document_rempli.docx" : "document_rempli.xlsx";
        const outputMime = isWord 
            ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" 
            : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

        const tempFilePath = saveAndGetPath(finalBuffer, outputFilename);
        
        res.json({
            files: [{
                filename: outputFilename,
                base64: finalBuffer.toString('base64'),
                mimeType: outputMime,
                path: encodeURIComponent(tempFilePath)
            }]
        });

    } catch (error) {
        console.error("Erreur /api/fill-template:", error);
        res.status(500).json({ error: error.message });
    }
};