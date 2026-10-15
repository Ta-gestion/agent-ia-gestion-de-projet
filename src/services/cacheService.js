// src/services/cacheService.js
const { createClient } = require('redis');

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const INDEX_NAME = 'ai_semantic_cache';
const VECTOR_DIMS = 1536;

const redisClient = createClient({ url: REDIS_URL });

async function connectRedis() {
    if (!redisClient.isOpen) {
        await redisClient.connect();
        await createIndexIfNotExists();
    }
}

async function createIndexIfNotExists() {
    try {
        await redisClient.ft.info(INDEX_NAME);
        console.log("✅ [CACHE] Index de Cache Sémantique déjà existant.");
    } catch (err) {
        console.log("Création de l'index de Cache Sémantique...");
        try {
            await redisClient.ft.create(INDEX_NAME, {
                '$.tenant_id': { type: 'TAG', AS: 'tenant_id' },
                '$.context_hash': { type: 'TAG', AS: 'context_hash' }, // <-- NOUVEAU FILTRE
                '$.prompt': { type: 'TEXT', AS: 'prompt', NOINDEX: true }, 
                '$.response': { type: 'TEXT', AS: 'response', NOINDEX: true },
                '$.embedding': {
                    type: 'VECTOR',
                    AS: 'embedding',
                    ALGORITHM: 'HNSW',
                    TYPE: 'FLOAT32',
                    DIM: VECTOR_DIMS,
                    DISTANCE_METRIC: 'COSINE'
                }
            }, {
                ON: 'JSON',
                PREFIX: 'cache:'
            });
            console.log("✅ [CACHE] Index créé avec succès.");
        } catch (createErr) {
            console.error("❌ [CACHE] Erreur lors de la création de l'index:", createErr.message);
        }
    }
}

async function getEmbedding(text, aiSettings) {
    const { OpenAI } = require('openai');
    let clientBaseUrl = 'https://api.openai.com/v1';
    
    if (aiSettings.provider === 'ollama') clientBaseUrl = aiSettings.baseUrl || 'http://localhost:11434/v1';
    if (aiSettings.provider === 'openrouter') clientBaseUrl = 'https://openrouter.ai/api/v1';
    
    const client = new OpenAI({ apiKey: aiSettings.apiKey || "no-key", baseURL: clientBaseUrl });
    
    let model = 'text-embedding-3-small';
    if (aiSettings.provider === 'ollama') model = 'nomic-embed-text'; 
    if (aiSettings.provider === 'openrouter') model = 'openai/text-embedding-3-small'; 
    
    const response = await client.embeddings.create({ model, input: text });
    return response.data[0].embedding;
}

// La fonction prend contextHash
async function searchCache(tenantId, contextHash, promptText, aiSettings) {
    await connectRedis();
    
    let embedding;
    try {
        embedding = await getEmbedding(promptText, aiSettings);
    } catch (err) {
        console.error("❌ [CACHE] Erreur génération embedding (Recherche):", err.message);
        return null;
    }

    const vectorBuffer = Buffer.from(new Float32Array(embedding).buffer);

    try {
        // On filtre par tenant_id ET par context_hash
        const results = await redisClient.ft.search(INDEX_NAME, `(@tenant_id:{${tenantId}} @context_hash:{${contextHash}})=>[KNN 1 @embedding $BLOB]`, {
            PARAMS: { BLOB: vectorBuffer },
            RETURN: ['response', '__embedding_score'],
            LIMIT: { from: 0, size: 1 },
            DIALECT: 2
        });

        if (results.documents && results.documents.length > 0) {
            const score = results.documents[0].value['__embedding_score'];
            const response = results.documents[0].value['response'];

            if (score < 0.15) {
                console.log(`💚 [CACHE] CACHE HIT ! Réponse trouvée (Distance: ${score}).`);
                if (typeof response === 'string') return JSON.parse(response);
                return response;
            }
        }
        return null;
    } catch (err) {
        console.error("❌ [CACHE] Erreur recherche Redis:", err.message);
        return null;
    }
}

// La fonction prend maintenant contextHash au lieu de promptText
async function saveToCache(tenantId, contextHash, promptText, responseData, aiSettings) {
    let embedding;
    try {
        embedding = await getEmbedding(promptText, aiSettings);
    } catch (err) {
        console.error("❌ [CACHE] Erreur génération embedding (Sauvegarde):", err.message);
        return;
    }

    const vectorBuffer = Array.from(new Float32Array(embedding));
    const cacheId = `cache:${tenantId}:${Date.now()}`;
    
    try {
        await redisClient.json.set(cacheId, '$', {
            tenant_id: tenantId,
            context_hash: contextHash, // <-- NOUVEAU
            prompt: promptText,
            response: JSON.stringify(responseData),
            embedding: vectorBuffer
        });
        await redisClient.expire(cacheId, 86400);
        console.log(`💾 [CACHE] Sauvegarde réussie.`);
    } catch (err) {
        console.error("❌ [CACHE] Erreur sauvegarde Redis:", err.message);
    }
}

module.exports = { searchCache, saveToCache, connectRedis };