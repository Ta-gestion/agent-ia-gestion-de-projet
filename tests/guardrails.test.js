// tests/guardrails.test.js
// Ce script simule une réponse erronée de l'IA et vérifie que vos Garde-fous la corrigent.

// On importe la logique (ici on la copie localement pour le test, ou vous pouvez l'exporter de queueService.js)
function validateAndSanitizeArgs(funcName, args) {
    let warnings = [];
    if (funcName === "create_schedule" && args.tasks) {
        args.tasks.forEach((task, i) => {
            // Correction WBS
            if (task.wbs && task.wbs.startsWith('0')) {
                task.wbs = task.wbs.replace(/^0/, '1');
                warnings.push(`WBS corrigé.`);
            }
            // Correction Dates
            if (task.date_debut && task.date_fin) {
                let d1 = new Date(task.date_debut);
                let d2 = new Date(task.date_fin);
                if (d2 < d1) {
                    task.date_fin = task.date_debut;
                    warnings.push(`Date de fin corrigée.`);
                }
            }
        });
    }
    return { args, warnings };
}

// --- DÉBUT DU TEST ---
console.log("🧪 Lancement des tests des Garde-fous...");

// Simulation d'une réponse hallucinée de l'IA (WBS à 0, date de fin avant date de début)
const fakeAiResponse = {
    tasks: [
        { wbs: "0.1", date_debut: "2025-03-10", date_fin: "2025-03-05" } 
    ]
};

const result = validateAndSanitizeArgs("create_schedule", fakeAiResponse);

// Vérifications
if (result.args.tasks[0].wbs === "1.1" && result.args.tasks[0].date_fin === "2025-03-10" && result.warnings.length === 2) {
    console.log("✅ TEST RÉUSSI : Les garde-fous ont corrigé le WBS et les dates avec succès.");
    process.exit(0); // Code 0 = Succès pour GitHub
} else {
    console.error("❌ TEST ÉCHOUÉ : Les garde-fous n'ont pas corrigé les erreurs correctement.");
    console.error("Résultat obtenu :", result);
    process.exit(1); // Code 1 = Échec pour GitHub
}