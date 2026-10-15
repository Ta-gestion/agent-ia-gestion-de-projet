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
// ==========================================
// FONCTION 1 : MODE STANDARD (Function Calling)
// ==========================================
async function getAiFunctionCalls(settings, systemPrompt, userPrompt, aiTools) {
    const { provider, apiKey, baseUrl, model } = settings;
    if (!model) throw new Error("Le nom du modèle est obligatoire.");
    const modelName = model;

    if (provider === 'gemini') {
        const genAI = new GoogleGenerativeAI(apiKey);
        // GEMINI : On utilise systemInstruction pour optimiser le cache
        const modelInstance = genAI.getGenerativeModel({ 
            model: modelName, 
            tools: aiTools,
            systemInstruction: systemPrompt 
        });
        const chat = modelInstance.startChat();
        const result = await chat.sendMessage(userPrompt);
        const calls = result.response.functionCalls();
        
        const usage = result.response.usageMetadata || {};
        const tokenData = {
            prompt: usage.promptTokenCount || 0,
            completion: usage.candidatesTokenCount || 0,
            total: usage.totalTokenCount || 0
        };
        
        return {
            calls: calls && calls.length > 0 ? calls.map(c => ({ name: c.name, args: c.args })) : [],
            usage: tokenData
        };
    } else {
        let clientBaseUrl = 'https://api.openai.com/v1';
        if (provider === 'ollama') clientBaseUrl = baseUrl || 'http://localhost:11434/v1';
        if (provider === 'openrouter') clientBaseUrl = 'https://openrouter.ai/api/v1';

        const client = new OpenAI({ apiKey: apiKey || "ollama-no-key", baseURL: clientBaseUrl });
        const openaiTools = convertGeminiToolsToOpenAI(aiTools);
        
        // Construction des messages avec cache_control pour le prompt système
        let messages = [];
        if (provider === 'openrouter' || provider === 'openai') {
            // CLOUD : On utilise l'attribut cache_control (OpenAI/Anthropic natif)
            messages = [
                { 
                    role: "system", 
                    content: [
                        { type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }
                    ]
                },
                { role: "user", content: userPrompt }
            ];
        } else {
            // LOCAL (Ollama) : Le moteur llama.cpp gère le Prefix KV Cache automatiquement
            messages = [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ];
        }
        
        const response = await client.chat.completions.create({
            model: modelName,
            messages: messages,
            tools: openaiTools,
            tool_choice: "auto",
            max_tokens: 8000
        });

        const toolCalls = response.choices[0].message.tool_calls;
        const usage = response.usage || {};
        const tokenData = {
            prompt: usage.prompt_tokens || 0,
            completion: usage.completion_tokens || 0,
            total: usage.total_tokens || 0
        };

        return {
            calls: toolCalls && toolCalls.length > 0 ? toolCalls.map(tc => ({ name: tc.function.name, args: safeJsonParse(tc.function.arguments) })) : [],
            usage: tokenData
        };
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

// ==========================================
// FONCTION 2 : MODE TEMPLATE (JSON Structuré)
// ==========================================
async function getAiStructuredJson(settings, systemPrompt, userPrompt, jsonSchema) {
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
                maxOutputTokens: 8000
            },
            systemInstruction: systemPrompt 
        });
        const result = await modelInstance.generateContent(userPrompt);
        let content = result.response.text();
        
        if (content.length > 50000) {
            console.warn("JSON trop massif détecté. Tentative de troncation...");
            let lastComma = content.lastIndexOf(',');
            if (lastComma > 0) { content = content.substring(0, lastComma) + ']}]}'; }
        }
        
        const parsedData = safeJsonParse(content);
        const usage = result.response.usageMetadata || {};
        const tokenData = {
            prompt: usage.promptTokenCount || 0,
            completion: usage.candidatesTokenCount || 0,
            total: usage.totalTokenCount || 0
        };

        return { data: parsedData, usage: tokenData };
    } else {
        let clientBaseUrl = 'https://api.openai.com/v1';
        if (provider === 'ollama') clientBaseUrl = baseUrl || 'http://localhost:11434/v1';
        if (provider === 'openrouter') clientBaseUrl = 'https://openrouter.ai/api/v1';

        const client = new OpenAI({ apiKey: apiKey || "ollama-no-key", baseURL: clientBaseUrl });
        const safeSchema = deepConvertTypesToLowercase(jsonSchema);
        const schemaStr = JSON.stringify(safeSchema, null, 2);
        
        const enhancedUserPrompt = `${userPrompt}\n\nTu dois répondre STRICTEMENT avec un objet JSON valide qui respecte ce schéma:\n${schemaStr}`;
        
        // Construction des messages avec cache_control
        let messages = [];
        if (provider === 'openrouter' || provider === 'openai') {
            messages = [
                { 
                    role: "system", 
                    content: [ { type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } } ] 
                },
                { role: "user", content: enhancedUserPrompt }
            ];
        } else {
            messages = [
                { role: "system", content: systemPrompt },
                { role: "user", content: enhancedUserPrompt }
            ];
        }

        const response = await client.chat.completions.create({
            model: modelName,
            messages: messages,
            response_format: { type: "json_object" },
            max_tokens: 16000,
            options: {
                num_ctx: 32768,
                num_predict: 8000
            }
        });

        let content = response.choices[0].message.content;
        const parsedData = safeJsonParse(content);
        
        const usage = response.usage || {};
        const tokenData = {
            prompt: usage.prompt_tokens || 0,
            completion: usage.completion_tokens || 0,
            total: usage.total_tokens || 0
        };

        return { data: parsedData, usage: tokenData };
    }
}

module.exports = { getAiFunctionCalls, getAiStructuredJson, safeJsonParse, deepConvertTypesToLowercase, convertGeminiToolsToOpenAI };