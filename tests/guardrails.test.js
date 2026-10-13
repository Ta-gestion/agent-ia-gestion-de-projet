// Ce script simule des réponses erronées de l'IA et vérifie que les Garde-fous les corrigent.

function validateAndSanitizeArgs(funcName, args) {
    let warnings = [];
    
    // 1. Validation de l'Échéancier (Schedule)
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

// ==========================================
// DÉBUT DES TESTS UNITAIRES
// ==========================================

let testsReussis = 0;
let testsEchoues = 0;

function assert(condition, message) {
    if (condition) {
        console.log(`✅ ${message}`);
        testsReussis++;
    } else {
        console.error(`❌ ${message}`);
        testsEchoues++;
    }
}

console.log("\n🧪 Lancement des tests des Garde-fous...\n");

// --- TEST 1 : ÉCHÉANCIER (WBS, Dates, Pourcentages) ---
console.log("➡️ Test 1 : Validation de l'Échéancier (create_schedule)");
const fakeSchedule = {
    tasks: [
        { 
            wbs: "0.1", 
            date_debut: "2025-03-10", 
            date_fin: "2025-03-05",
            pourcentage: "150" 
        }
    ]
};
const scheduleResult = validateAndSanitizeArgs("create_schedule", fakeSchedule);
const sTask = scheduleResult.args.tasks[0];

assert(sTask.wbs === "1.1", "Schedule : Le WBS a été corrigé de '0.1' à '1.1'");
assert(sTask.date_fin === "2025-03-10", "Schedule : La date de fin a été alignée sur la date de début");
assert(sTask.pourcentage === 1, "Schedule : Le pourcentage a été plafonné à 1 (100%)");
assert(scheduleResult.warnings.length === 3, "Schedule : 3 avertissements ont été générés");

console.log(""); 

// --- TEST 2 : REGISTRE DES RISQUES (Bornes et Calculs) ---
console.log("➡️ Test 2 : Validation du Registre des Risques (create_risk_register)");
const fakeRisk = {
    risks: [
        { 
            probabilite: 8,
            impact: 0,
            cote_risque: 25 
        }
    ]
};
const riskResult = validateAndSanitizeArgs("create_risk_register", fakeRisk);
const rRisk = riskResult.args.risks[0];

assert(rRisk.probabilite === 5, "Risques : La probabilité a été bornée à 5");
assert(rRisk.impact === 1, "Risques : L'impact a été borné à 1");
assert(rRisk.cote_risque === 5, "Risques : La cote a été recalculée à 5 (5*1)");
assert(riskResult.warnings.length === 1, "Risques : 1 avertissement a été généré pour la cote");

// --- RÉSULTAT FINAL ---
console.log("\n=========================================");
console.log(`📊 Résultats : ${testsReussis} réussis, ${testsEchoues} échoués`);
console.log("=========================================");

if (testsEchoues > 0) {
    console.error("💥 ÉCHEC DU PIPELINE CI : Au moins un test de Garde-fou a échoué.");
    process.exit(1);
} else {
    console.log("🎉 SUCCÈS : Tous les tests de Garde-fous sont passés !");
    process.exit(0);
}