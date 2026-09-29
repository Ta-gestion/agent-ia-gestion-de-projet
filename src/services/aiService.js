// src/services/aiService.js
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { OpenAI } = require('openai');
const { jsonrepair } = require('jsonrepair');

// ==========================================
// FONCTIONS UNIVERSELLES POUR N'IMPORTE QUELLE IA
// ==========================================

// Fonction récursive pour convertir les "STRING" en "string" (Standard OpenAI)
function deepConvertTypesToLowercase(node) {
    if (Array.isArray(node)) {
        return node.map(deepConvertTypesToLowercase);
    } else if (typeof node === 'object' && node !== null) {
        const newNode = {};
        for (const key in node) {
            if (key === 'type' && typeof node[key] === 'string') {
                newNode[key] = node[key].toLowerCase(); // Conversion ici
            } else {
                newNode[key] = deepConvertTypesToLowercase(node[key]);
            }
        }
        return newNode;
    }
    return node;
}

// Convertit les outils Gemini vers le format OpenAI
function convertGeminiToolsToOpenAI(aiTools) {
    if (!aiTools || !aiTools[0] || !aiTools[0].functionDeclarations) return [];
    return aiTools[0].functionDeclarations.map(fd => {
        // On copie les propriétés et on convertit les types en minuscules
        const convertedParams = deepConvertTypesToLowercase(fd.parameters);
        return {
            type: "function",
            function: {
                name: fd.name,
                description: fd.description,
                parameters: convertedParams
            }
        };
    });
}

// Appelle l'IA (Cloud ou Local) et retourne les appels de fonction standardisés
async function getAiFunctionCalls(settings, prompt, aiTools) {
    const { provider, apiKey, baseUrl, model } = settings;
    if (!model) throw new Error("Le nom du modèle est obligatoire.");
    const modelName = model;

    if (provider === 'gemini') {
        // GEMINI : On garde les outils tels quels (avec les MAJUSCULES)
        const genAI = new GoogleGenerativeAI(apiKey);
        const modelInstance = genAI.getGenerativeModel({ model: modelName, tools: aiTools });
        const chat = modelInstance.startChat();
        const result = await chat.sendMessage(prompt);
        const calls = result.response.functionCalls();
        return calls && calls.length > 0 ? calls.map(c => ({ name: c.name, args: c.args })) : [];
    } else {
        let clientBaseUrl = 'https://api.openai.com/v1';
        if (provider === 'ollama') clientBaseUrl = baseUrl || 'http://localhost:11434/v1';
        if (provider === 'openrouter') clientBaseUrl = 'https://openrouter.ai/api/v1';

        const client = new OpenAI({ apiKey: apiKey || "ollama-no-key", baseURL: clientBaseUrl });
        
        // OPENAI/OLLAMA : On convertit en minuscules
        const openaiTools = convertGeminiToolsToOpenAI(aiTools);
        
        const response = await client.chat.completions.create({
            model: modelName,
            messages: [{ role: "user", content: prompt }],
            tools: openaiTools,
            tool_choice: "auto",
            max_tokens: 8000
        });

        const toolCalls = response.choices[0].message.tool_calls;
        return toolCalls && toolCalls.length > 0 ? toolCalls.map(tc => ({ name: tc.function.name, args: JSON.parse(tc.function.arguments) })) : [];
    }
}

// FONCTION DE SAUVETAGE ET RÉPARATION POUR LES MODÈLES LOCAUX
function safeJsonParse(content) {
    if (!content) throw new Error("L'IA n'a renvoyé aucun contenu.");
    
    content = content.trim();
    if (content.startsWith("```json")) content = content.substring(7);
    if (content.startsWith("```")) content = content.substring(3);
    if (content.endsWith("```")) content = content.slice(0, -3);
    content = content.trim();

    // Tentative 1 : Parse direct
    try {
        return JSON.parse(content);
    } catch (e) {
        console.log("Parse direct échoué, tentative de réparation...");
    }

    // Tentative 2 : Réparation automatique avec jsonrepair
    try {
        const repaired = jsonrepair(content);
        return JSON.parse(repaired);
    } catch (e2) {
        console.log("Réparation globale échouée, tentative d'extraction...");
    }

    // Tentative 3 : Extraction entre la première '{' et la dernière '}', puis réparation
    const firstBrace = content.indexOf('{');
    const lastBrace = content.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        let jsonString = content.substring(firstBrace, lastBrace + 1);
        try {
            const repaired = jsonrepair(jsonString);
            return JSON.parse(repaired);
        } catch (e3) {
            console.error("Réparation échouée. Contenu brut reçu de l'IA :", content);
            throw new Error("L'IA locale a généré un JSON illisible ou coupé. Réessayez ou réduisez le nombre de lignes.");
        }
    }

    throw new Error("Aucun JSON valide trouvé dans la réponse de l'IA.");
}

// Appelle l'IA en mode JSON structuré (pour les templates Excel)
async function getAiStructuredJson(settings, prompt, jsonSchema) {
    const { provider, apiKey, baseUrl, model } = settings;
    if (!model) throw new Error("Le nom du modèle est obligatoire.");
    const modelName = model;

    if (provider === 'gemini') {
        const genAI = new GoogleGenerativeAI(apiKey);
        const modelInstance = genAI.getGenerativeModel({ 
            model: modelName,
            generationConfig: {
                responseMimeType: "application/json",
                responseSchema: jsonSchema,
                maxOutputTokens: 8000 // <-- ON LIMITE À 8000 TOKENS
            }
        });
        const result = await modelInstance.generateContent(prompt);
        let content = result.response.text();
        
        // SÉCURITÉ MAX : Si l'IA a généré un JSON de plus de 50 000 caractères, on la stoppe
        if (content.length > 50000) {
            console.warn("JSON trop massif détecté (" + content.length + " caractères). Tentative de troncation...");
            // On coupe proprement avant la dernière virgule pour éviter le crash
            let lastComma = content.lastIndexOf(',');
            if (lastComma > 0) {
                content = content.substring(0, lastComma) + ']}]}'; // On ferme le tableau et les objets
            }
        }
        
        // ON UTILISE LE RÉPARATEUR DE JSON MÊME POUR GEMINI
        return safeJsonParse(content);
    } else {
        let clientBaseUrl = 'https://api.openai.com/v1';
        if (provider === 'ollama') clientBaseUrl = baseUrl || 'http://localhost:11434/v1';
        if (provider === 'openrouter') clientBaseUrl = 'https://openrouter.ai/api/v1';

        const client = new OpenAI({ apiKey: apiKey || "ollama-no-key", baseURL: clientBaseUrl });
        
        // OPENAI/OLLAMA : On convertit le schéma en minuscules
        const safeSchema = deepConvertTypesToLowercase(jsonSchema);
        const schemaStr = JSON.stringify(safeSchema, null, 2);
        
        const enhancedPrompt = `${prompt}\n\nTu dois répondre STRICTEMENT avec un objet JSON valide qui respecte ce schéma:\n${schemaStr}`;
        
        const response = await client.chat.completions.create({
            model: modelName,
            messages: [{ role: "user", content: enhancedPrompt }],
            response_format: { type: "json_object" },
            max_tokens: 16000,
            // OPTIONS SPÉCIFIQUES POUR OLLAMA : On force la fenêtre de contexte à 32k
            options: {
                num_ctx: 32768,
                num_predict: 8000
            }
        });

        let content = response.choices[0].message.content;
        
        // ON UTILISE LE SAUVETAGE ICI
        return safeJsonParse(content);
    }
}

module.exports = { getAiFunctionCalls, getAiStructuredJson };