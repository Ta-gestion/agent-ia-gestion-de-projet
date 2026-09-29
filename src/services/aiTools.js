// ==========================================
// OUTILS POUR L'IA
// ==========================================
// src/services/aiTools.js
const aiTools = [
    {
        functionDeclarations: [
            {
                name: "create_risk_register",
                description: "Crée un registre des risques structuré au format Excel avec en-tête de projet et tableau détaillé.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        project_name: { type: "STRING", description: "Numéro et Nom du projet" },
                        current_phase: { type: "STRING", description: "Phase en cours du projet" },
                        last_update: { type: "STRING", description: "Date de dernière mise à jour" },
                        risks: { 
                            type: "ARRAY", 
                            items: { 
                                type: "OBJECT", 
                                properties: { 
                                    nom: { type: "STRING" }, 
                                    type: { type: "STRING" }, 
                                    description: { type: "STRING", description: "Format: Titre du risque Si (décrire le risque...), alors (décrire la conséquence...)" }, 
                                    probabilite: { type: "INTEGER", minimum: 1, maximum: 5, description: "Probabilité du risque (entier entre 1 et 5)" }, 
                                    impact: { type: "INTEGER", minimum: 1, maximum: 5, description: "Impact du risque (entier entre 1 et 5)" }, 
                                    cote_risque: { type: "INTEGER", description: "Cote de Risque. Doit être EXACTEMENT le résultat de la multiplication : Probabilité * Impact." }, 
                                    couts: { type: "STRING" }, 
                                    mesure_attenuation: { type: "STRING" }, 
                                    statut: { type: "STRING" }, 
                                    responsable: { type: "STRING" }, 
                                    date_revision: { type: "STRING" }, 
                                    commentaires: { type: "STRING" } 
                                },
                                required: ["nom", "type", "description", "probabilite", "impact", "cote_risque", "couts", "mesure_attenuation", "statut", "responsable", "date_revision", "commentaires"] 
                            } 
                        }
                    },
                    required: ["project_name", "risks"]
                }
            },
            {
                name: "create_schedule",
                description: "Crée un échéancier de projet (Gantt) au format Excel avec colonnes WBS, Tâche, Responsable, Dates et Durée.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        project_name: { type: "STRING", description: "Nom du projet" },
                        manager_name: { type: "STRING", description: "Nom du gestionnaire de projets" },
                        start_date: { type: "STRING", description: "Date de début du projet (format YYYY-MM-DD)" },
                        tasks: { 
                            type: "ARRAY", 
                            items: { 
                                type: "OBJECT", 
                                properties: { 
                                    wbs: { type: "STRING", description: "Code WBS ex: 1.1, 1.2" }, 
                                    tache: { type: "STRING", description: "Nom de la tâche" }, 
                                    responsable: { type: "STRING", description: "Nom du responsable" }, 
                                    predecessor: { type: "STRING", description: "Tâche précédente (WBS)" }, 
                                    date_debut: { type: "STRING", description: "Date de début (YYYY-MM-DD)" },  
                                    jour: { type: "STRING", description: "Durée en jours" }, 
                                    pourcentage: { type: "STRING", description: "Pourcentage d'avancement ex: 0%, 100%" } 
                                },
                                required: ["wbs", "tache", "responsable", "predecessor", "date_debut", "jour", "pourcentage"]
                            } 
                        }
                    },
                    required: ["project_name", "tasks"]
                }
            },
            {
                name: "create_stakeholder_register",
                description: "Crée un registre des parties prenantes au format Excel selon une grille d'analyse spécifique.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        stakeholders: { 
                            type: "ARRAY", 
                            items: { 
                                type: "OBJECT", 
                                properties: { 
                                    nom: { type: "STRING", description: "Nom de la partie prenante" }, 
                                    interets_objectifs: { type: "STRING", description: "Comment est-ce une partie prenante ? (intérêts, objectifs)" }, 
                                    forces: { type: "STRING", description: "Comment la partie prenante peut aider le projet" }, 
                                    faiblesses: { type: "STRING", description: "Comment la partie prenante peut nuire au projet" }, 
                                    strategie_partie_prenante: { type: "STRING", description: "Stratégie probable de la partie prenante pour aider/nuire au projet" }, 
                                    strategie_equipe: { type: "STRING", description: "Stratégie de l'équipe pour influencer positivement le projet" } 
                                },
                                required: ["nom", "interets_objectifs", "forces", "faiblesses", "strategie_partie_prenante", "strategie_equipe"]
                            } 
                        }
                    },
                    required: ["stakeholders"]
                }
            },
            // Génère rapport de l'analyse du chemin critique
            {
                name: "create_critical_path_report",
                description: "Génère un rapport PDF d'analyse du chemin critique (CPM / Critical Path Method) identifiant les tâches critiques, les marges libres/totales, la durée minimale du projet et les goulets d'étranglement.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        project_name: {
                            type: "STRING",
                            description: "Nom du projet"
                        },
                        manager_name: {
                            type: "STRING",
                            description: "Nom du gestionnaire de projet"
                        },
                        tasks: {
                            type: "ARRAY",
                            description: "Liste des tâches avec leurs dépendances (prédécesseurs)",
                            items: {
                                type: "OBJECT",
                                properties: {
                                    wbs: { type: "STRING" },
                                    tache: { type: "STRING" },
                                    jour: { type: "NUMBER", description: "Durée de la tâche en jours" },
                                    predecessor: { type: "STRING", description: "Identifiant WBS de la tâche précédente (ex: '1.1' ou '1, 2')" }
                                },
                                required: ["wbs", "tache", "jour"]
                            }
                        }
                    },
                    required: ["project_name", "tasks"]
                }
            },
            // Rapport de la valeur acquise
            {
                name: "create_analysis_report",
                description: "Génère un rapport PDF complet d'analyse de la valeur acquise (EVM) pour le projet avec des KPI détaillés (PV, EV, AC, CPI, SPI, dérives).",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        project_name: {
                            type: "STRING",
                            description: "Nom du projet"
                        },
                        manager_name: {
                            type: "STRING",
                            description: "Nom du gestionnaire de projet"
                        },
                        tasks: {
                            type: "ARRAY",
                            description: "Liste des tâches du projet",
                            items: {
                                type: "OBJECT",
                                properties: {
                                    wbs: { type: "STRING" },
                                    tache: { type: "STRING" },
                                    jour: { type: "NUMBER", description: "Durée en jours" },
                                    pourcentage: { type: "NUMBER", description: "Avancement en % (0 à 100 ou 0 à 1)" },
                                    cout_prevu: { type: "NUMBER", description: "Coût budgété (BAC du lot)" },
                                    cout_reel: { type: "NUMBER", description: "Coût réellement dépensé" }
                                },
                                required: ["tache"]
                            }
                        }
                    },
                    required: ["project_name", "tasks"]
                }
            },
            // CHARTE DE PROJET MISE À JOUR ET ENRICHIE
            {
                name: "create_project_charter",
                description: "Crée une charte de projet au format PDF en respectant une structure formelle (Contexte, Portée, Livrables, Jalons, GO/NO GO, etc.).",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        titre_projet: { type: "STRING", description: "Titre du projet" },
                        client: { type: "STRING", description: "Nom du client" },
                        responsable_realisation: { type: "STRING", description: "Responsable de la réalisation" },
                        gestionnaire_projet: { type: "STRING", description: "Gestionnaire du projet" },
                        date_creation: { type: "STRING", description: "Date de création" },
                        date_modification: { type: "STRING", description: "Date de dernière modification" },
                        version: { type: "STRING", description: "Numéro de version" },
                        contexte_projet: { type: "STRING", description: "Contexte du projet" },
                        objectifs_affaires: { type: "STRING", description: "Objectifs d’affaires atteints par le projet" },
                        portee_projet: { type: "STRING", description: "Portée du projet (comment les objectifs se concrétisent)" },
                        livrables_inclus: { type: "STRING", description: "Ce que le projet inclut" },
                        livrables_exclus: { type: "STRING", description: "Ce que le projet exclut" },
                        zones_grises: { type: "STRING", description: "Éléments à confirmer durant la faisabilité" },
                        parties_prenantes: { type: "STRING", description: "Liste des parties prenantes" },
                        risques_projet: { type: "STRING", description: "Risques internes ou externes du projet" },
                        contraintes: { type: "STRING", description: "Contraintes budgétaires, temporelles, réglementaires" },
                        hypotheses: { type: "STRING", description: "Hypothèses critiques du projet" },
                        budget_initial: { type: "STRING", description: "Budget initial ou plafond budgétaire" },
                        benefices: { type: "STRING", description: "Bénéfices tangibles et intangibles" },
                        facteurs_succes: { type: "STRING", description: "Facteurs de succès du projet" },
                        jalons: { 
                            type: "ARRAY", 
                            items: { 
                                type: "OBJECT", 
                                properties: { 
                                    phase: { type: "STRING" }, 
                                    jalon: { type: "STRING" }, 
                                    echeance: { type: "STRING" } 
                                } 
                            } 
                        },
                        recommandations: { type: "STRING", description: "Recommandations et commentaires" },
                        signataire_nom: { type: "STRING", description: "Nom du signataire" }
                    },
                    required: ["titre_projet", "contexte_projet", "objectifs_affaires", "portee_projet"]
                }
            }
        ]
    }
];

module.exports = aiTools;