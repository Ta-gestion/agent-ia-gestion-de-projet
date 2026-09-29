// src/services/excelService.js
const ExcelJS = require('exceljs');

// Génération de l'échéancier
async function generateScheduleExcel(data) {
    try {
        console.log("=== DÉBUT GÉNÉRATION ÉCHÉANCIER GANTT ===");

        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('GanttChart', {
            views: [{ showGridLines: true }]
        });

        const NUM_DAYS = 60; // Nombre de jours affichés (K à BN)
        const START_COL_INDEX = 11; // Colonne 11 = K

        // Helper pour convertir un numéro de colonne en lettres (11 = K, 66 = BN, etc.)
        const getColLetter = (colIdx) => {
            let temp, letter = '';
            while (colIdx > 0) {
                temp = (colIdx - 1) % 26;
                letter = String.fromCharCode(65 + temp) + letter;
                colIdx = (colIdx - temp - 1) / 26;
            }
            return letter;
        };

        const lastColLetter = getColLetter(START_COL_INDEX + NUM_DAYS - 1); // 'BN'
        const totalCols = START_COL_INDEX + NUM_DAYS - 1;

        // -------------------------------------------------------------
        // 1. STYLE ET FUSION DES LIGNES 1 À 6
        // -------------------------------------------------------------

        // --- LIGNE 1 ---
        // Fusionnée de A1 à BN1, alignée à gauche, Arial 18, Texte Blanc, Fond #4F81BD
        sheet.mergeCells(1, 1, 1, totalCols);
        const cellA1 = sheet.getCell('A1');
        cellA1.value = (data && typeof data.project_name === 'string') ? data.project_name : 'Nom du Projet';
        cellA1.font = { name: 'Arial', size: 18, bold: true, color: { argb: 'FFFFFFFF' } };
        cellA1.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
        
        // Application du fond #4F81BD sur toute la ligne 1
        for (let col = 1; col <= totalCols; col++) {
            sheet.getCell(1, col).fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FF4F81BD' }
            };
        }
        sheet.getRow(1).height = 30;

        // --- LIGNE 2 ---
        // Fusionnée et centrée avec fond #95B3D7
        sheet.mergeCells(2, 1, 2, totalCols);
        for (let col = 1; col <= totalCols; col++) {
            sheet.getCell(2, col).fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FF95B3D7' }
            };
            sheet.getCell(2, col).alignment = { vertical: 'middle', horizontal: 'center' };
        }
        sheet.getRow(2).height = 15;

        // --- LIGNES 3, 4, 5, 6 ---
        // Fusionnées et centrées par bloc avec la couleur de fond #DCE6F1
        for (let r = 3; r <= 6; r++) {
            for (let col = 1; col <= totalCols; col++) {
                sheet.getCell(r, col).fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FFDCE6F1' }
                };
            }
        }

        // Données d'en-tête (Placées dans la zone d'informations Lignes 4 & 5)
        sheet.getCell('B4').value = 'Date de début du projet';
        sheet.getCell('B4').font = { bold: true };
        
        let projStartDate = new Date();
        if (data && data.start_date) {
            const d = new Date(data.start_date);
            if (!isNaN(d.getTime())) projStartDate = d;
        }
        sheet.getCell('C4').value = projStartDate;
        sheet.getCell('C4').numFmt = 'yyyy-mm-dd';

        sheet.getCell('H4').value = 'Semaine';
        sheet.getCell('H4').font = { bold: true };
        sheet.getCell('I4').value = 1;

        sheet.getCell('B5').value = 'Gestionnaire de projets';
        sheet.getCell('B5').font = { bold: true };
        sheet.getCell('C5').value = (data && typeof data.manager_name === 'string') ? data.manager_name : '';

        // -------------------------------------------------------------
        // 2. EN-TÊTES DU TABLEAU (Ligne 7)
        // -------------------------------------------------------------
        const headers = ["WBS", "Tache", "Responsable", "PREDECESSOR", "Date de début", "Date de fin", "Jour", "% ", "Jrs ouvr."];
        
        for (let c = 1; c <= headers.length; c++) {
            const cell = sheet.getCell(7, c);
            cell.value = headers[c - 1];
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F497D' } };
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
        }

        // Largeurs des colonnes principales
        sheet.getColumn(1).width = 10; // WBS
        sheet.getColumn(2).width = 35; // Tache
        sheet.getColumn(3).width = 16; // Responsable
        sheet.getColumn(4).width = 14; // PREDECESSOR
        sheet.getColumn(5).width = 14; // Date de début
        sheet.getColumn(6).width = 14; // Date de fin
        sheet.getColumn(7).width = 8;  // Jour
        sheet.getColumn(8).width = 10; // %
        sheet.getColumn(9).width = 10; // Jrs ouvr.

        // -------------------------------------------------------------
        // 3. CALENDRIER GANTT (Lignes 4 à 7 - Colonnes K à BN)
        // -------------------------------------------------------------
        for (let i = 0; i < NUM_DAYS; i++) {
            const colIdx = START_COL_INDEX + i;
            const colLetter = getColLetter(colIdx);
            sheet.getColumn(colIdx).width = 4.5;

            // Semaines (ligne 4)
            if (i % 7 === 0) {
                const weekCell = sheet.getCell(4, colIdx);
                weekCell.value = { formula: `="Semaine "&(${colLetter}6-($C$4-WEEKDAY($C$4,1)+2))/7+1` };
                weekCell.font = { bold: true, size: 9 };
                weekCell.alignment = { horizontal: 'center', vertical: 'middle' };
            }

            // Dates dynamiques (ligne 6)
            if (i === 0) {
                sheet.getCell(6, colIdx).value = { formula: `=C4-WEEKDAY(C4,1)+2+7*(I4-1)` };
            } else {
                const prevColLetter = getColLetter(colIdx - 1);
                sheet.getCell(6, colIdx).value = { formula: `=${prevColLetter}6+1` };
            }

            const dateCell = sheet.getCell(6, colIdx);
            dateCell.numFmt = 'dd';
            dateCell.alignment = { horizontal: 'center', vertical: 'middle' };

            // Nom du jour S/M/T/W/T/F/S (ligne 7)
            const dayNameCell = sheet.getCell(7, colIdx);
            dayNameCell.value = { formula: `=CHOOSE(WEEKDAY(${colLetter}6,1),"S","M","T","W","T","F","S")` };
            dayNameCell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            dayNameCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F497D' } };
            dayNameCell.alignment = { horizontal: 'center', vertical: 'middle' };
        }

        // -------------------------------------------------------------
        // 4. DONNÉES DES TÂCHES (Lignes 8 à 33)
        // -------------------------------------------------------------
        const tasks = (data && Array.isArray(data.tasks)) ? data.tasks : [];
        const startRow = 8;
        const totalRows = Math.max(tasks.length, 26); // Lignes 8 à 33 minimum
        const lastRow = startRow + totalRows - 1;

        for (let idx = 0; idx < totalRows; idx++) {
            const rowIdx = startRow + idx;
            const task = tasks[idx] || {};

            const wbs = task.wbs || (idx + 1).toString();
            const label = task.tache || '';
            const resp = task.responsable || '';
            const pred = task.predecessor || '';
            const duration = (task.jour !== undefined && task.jour !== null) ? task.jour : 1;
            const pct = (task.pourcentage !== undefined) ? (task.pourcentage > 1 ? task.pourcentage / 100 : task.pourcentage) : 0;

            let startDate = null;
            if (task.date_debut) {
                const d = new Date(task.date_debut);
                if (!isNaN(d.getTime())) startDate = d;
            }

            // Données et Formules Excel
            sheet.getCell(rowIdx, 1).value = wbs;
            sheet.getCell(rowIdx, 2).value = label;
            sheet.getCell(rowIdx, 3).value = resp;
            sheet.getCell(rowIdx, 4).value = pred;
            
            if (startDate) {
                sheet.getCell(rowIdx, 5).value = startDate;
            }
            sheet.getCell(rowIdx, 5).numFmt = 'yyyy-mm-dd';

            // Date de fin
            sheet.getCell(rowIdx, 6).value = { formula: `IF(ISBLANK(E${rowIdx}),"",IF(G${rowIdx}=0,E${rowIdx},E${rowIdx}+G${rowIdx}-1))` };
            sheet.getCell(rowIdx, 6).numFmt = 'yyyy-mm-dd';

            sheet.getCell(rowIdx, 7).value = duration;
            sheet.getCell(rowIdx, 8).value = pct;
            sheet.getCell(rowIdx, 8).numFmt = '0%';

            // Jours ouvrés
            sheet.getCell(rowIdx, 9).value = { formula: `IF(OR(F${rowIdx}=0,E${rowIdx}=0),0,NETWORKDAYS(E${rowIdx},F${rowIdx}))` };

            for (let c = 1; c <= 9; c++) {
                const cell = sheet.getCell(rowIdx, c);
                if ([1, 4, 5, 6, 7, 8, 9].includes(c)) {
                    cell.alignment = { horizontal: 'center' };
                }
            }
        }

        // -------------------------------------------------------------
        // 5. MISES EN FORME CONDITIONNELLES
        // -------------------------------------------------------------

        // --- NOUVELLES RÈGLES : Couleur #BFBFBF appliquée à la colonne H ---
        const rangesBFBFBF = ['H8:H27', 'H28', 'H29:H30', 'H31', 'H32:H33'];
        rangesBFBFBF.forEach(rangeRef => {
            sheet.addConditionalFormatting({
                ref: rangeRef,
                rules: [{
                    type: 'expression',
                    formulae: ['TRUE'],
                    style: {
                        fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFBFBFBF' } }
                    }
                }]
            });
        });

        // --- RÈGLES DU PLANNING GANTT (K à BN) ---

        // 1. Aujourd'hui Blanc (K6:BN33)
        sheet.addConditionalFormatting({
            ref: `K6:${lastColLetter}${lastRow}`,
            rules: [{
                type: 'expression',
                formulae: ['K$6=TODAY()'],
                style: {
                    fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFFFFFF' } }
                }
            }]
        });

        // 2. En-tête Aujourd'hui Orange (K6:BM7)
        const colBM = getColLetter(START_COL_INDEX + NUM_DAYS - 2);
        sheet.addConditionalFormatting({
            ref: `K6:${colBM}7`,
            rules: [{
                type: 'expression',
                formulae: ['K$6=TODAY()'],
                style: {
                    fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFE26B0A' } },
                    font: { color: { argb: 'FFFFFFFF' }, bold: true }
                }
            }]
        });

        // 3. Progression Gris #808080 (K8:BN33)
        sheet.addConditionalFormatting({
            ref: `K8:${lastColLetter}${lastRow}`,
            rules: [{
                type: 'expression',
                formulae: ['AND($E8<=K$6,ROUNDDOWN(($F8-$E8+1)*$H8,0)+$E8-1>=K$6)'],
                style: {
                    fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FF808080' } }
                }
            }]
        });

        // 4. Durée Tâche Bleu #0070C0 (K8:BN33)
        sheet.addConditionalFormatting({
            ref: `K8:${lastColLetter}${lastRow}`,
            rules: [{
                type: 'expression',
                formulae: ['AND(NOT(ISBLANK($E8)),$E8<=K$6,$F8>=K$6)'],
                style: {
                    fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FF0070C0' } }
                }
            }]
        });

        console.log("=== GÉNÉRATION RÉUSSIE ===");
        const buffer = await workbook.xlsx.writeBuffer();
        return buffer;

    } catch (error) {
        console.error("!!! ERREUR DANS generateScheduleExcel !!!", error);
        throw new Error("Erreur lors de la génération: " + error.message);
    }
}

// NOUVELLE FONCTION EXCEL POUR LE REGISTRE DES PARTIES PRENANTES
async function generateStakeholderRegisterExcel(data) {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Feuil1');

    // Ligne 1 : Titre principal fusionné sur les 6 colonnes (A à F)
    sheet.mergeCells('A1:F1');
    const titleCell = sheet.getCell('A1');
    titleCell.value = 'Grille d’analyse des parties prenantes';
    titleCell.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
    titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F81BD' } };
    sheet.getRow(1).height = 25; // Hauteur de la ligne de titre

    // Ligne 2 : En-têtes du tableau
    const headers = [
        "Nom de la Partie prenante", 
        "Intérêts, Objectifs de la partie prenante", 
        "Forces de la partie prenante", 
        "Faiblesses de la partie prenante", 
        "Stratégie de la partie prenante pour aider ou nuire au projet", 
        "Stratégie de l'équipe pour influencer positivement le projet"
    ];

    const headerRow = sheet.addRow(headers);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF8EAADB' } };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    sheet.getRow(2).height = 45; // Hauteur pour voir tout le texte

    // Définition des largeurs de colonnes
    sheet.getColumn(1).width = 25;
    sheet.getColumn(2).width = 35;
    sheet.getColumn(3).width = 35;
    sheet.getColumn(4).width = 35;
    sheet.getColumn(5).width = 35;
    sheet.getColumn(6).width = 35;

    // Lignes 3+ : Ajout des parties prenantes générées par l'IA
    if (data.stakeholders && data.stakeholders.length > 0) {
        data.stakeholders.forEach((st) => {
            const row = sheet.addRow([
                st.nom || '', 
                st.interets_objectifs || '', 
                st.forces || '', 
                st.faiblesses || '', 
                st.strategie_partie_prenante || '', 
                st.strategie_equipe || ''
            ]);
            // Activer le retour à la ligne automatique pour les textes longs
            row.alignment = { vertical: 'top', wrapText: true };
        });
    }

    return await workbook.xlsx.writeBuffer();
}

// NOUVELLE FONCTION EXCEL POUR LE REGISTRE DE RISQUES
async function generateRiskRegisterExcel(data) {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Feuil1');

    // Métadonnées en haut du fichier
    sheet.getCell('A1').value = 'Nom du projet:';
    sheet.getCell('B1').value = data.project_name || '';
    sheet.getCell('A2').value = 'Phase en cours:';
    sheet.getCell('B2').value = data.current_phase || '';
    sheet.getCell('A3').value = 'Dernière mise à jour:';
    sheet.getCell('B3').value = data.last_update || '';

    // Mise en gras des libellés
    for (let i = 1; i <= 5; i++) {
        sheet.getCell(`A${i}`).font = { bold: true };
    }

    // Ligne 6 : En-têtes du tableau
    const headers = [
        "#", "Nom", "Type", "Description du risque", 
        "Probabilité (P)", "Impact (I)", "Cote de Risque (P) * (I)", 
        "Coûts ($)", "Mesure d'atténuation", "Statut", 
        "Responsable du risque", "Date de révision", "Commentaires"
    ];
    
    const headerRow = sheet.addRow(headers);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F81BD' } };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };

    // Définition des largeurs de colonnes
    sheet.getColumn(1).width = 5;
    sheet.getColumn(2).width = 20;
    sheet.getColumn(3).width = 15;
    sheet.getColumn(4).width = 50;
    sheet.getColumn(5).width = 15;
    sheet.getColumn(6).width = 10;
    sheet.getColumn(7).width = 20;
    sheet.getColumn(8).width = 15;
    sheet.getColumn(9).width = 40;
    sheet.getColumn(10).width = 15;
    sheet.getColumn(11).width = 20;
    sheet.getColumn(12).width = 15;
    sheet.getColumn(13).width = 30;

    // Ligne 7 : Ligne d'exemple "Si... Alors..."
    const exampleRow = sheet.addRow([
        '*', '*', '*', " (Le risque et la conséquence...)", 
        '*', '*', 0, '*', '*', '*', '*', '*', '*'
    ]);
    exampleRow.font = { italic: true, color: { argb: 'FF808080' } };

    // Lignes 8+ : Ajout des risques générés par l'IA
    if (data.risks && data.risks.length > 0) {
        data.risks.forEach((risk, index) => {
            sheet.addRow([
                index + 1, // Numéro
                risk.nom || '', 
                risk.type || '', 
                risk.description || '', 
                risk.probabilite || '', 
                risk.impact || '', 
                risk.cote_risque || 0, 
                risk.couts || '', 
                risk.mesure_attenuation || '', 
                risk.statut || '', 
                risk.responsable || '', 
                risk.date_revision || '', 
                risk.commentaires || ''
            ]);
        });
    }

    return await workbook.xlsx.writeBuffer();
}

module.exports = { generateScheduleExcel, generateRiskRegisterExcel, generateStakeholderRegisterExcel };