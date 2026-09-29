import sys
import json
from docx import Document
import re as regex_lib
import openpyxl
from copy import copy, deepcopy
from datetime import datetime
import unicodedata

# Normalise le texte (supprime accents, espaces, majuscules)
def normalize_key(key_str):
    if not isinstance(key_str, str): return ""
    # Supprime les accents
    nfkd_form = unicodedata.normalize('NFKD', key_str)
    without_accents = "".join([c for c in nfkd_form if not unicodedata.combining(c)])
    # Met en minuscule et remplace espaces/tirets par tiret bas
    return without_accents.lower().replace(" ", "_").replace("-", "_").strip()

def main(excel_path, json_path):
    with open(json_path, 'r', encoding='utf-8') as f:
        ai_data = json.load(f)

        if excel_path.lower().endswith('.docx'):
            print("--- DÉBUT TRAITEMENT WORD (MÉTHODE INFAILLIBLE) ---")
            
            doc = Document(excel_path)
            
            metadata = ai_data.get('metadata', {})
            rows_data = ai_data.get('rows', [])
            
            # 1. Nettoyage des clés
            def clean_data_keys(data):
                if isinstance(data, dict):
                    return {k.replace(' ', '_').replace('r.', '').replace('row.', ''): clean_data_keys(v) for k, v in data.items()}
                elif isinstance(data, list):
                    return [clean_data_keys(item) for item in data]
                return data

            cleaned_metadata = clean_data_keys(metadata)
            cleaned_rows = clean_data_keys(rows_data)

            # 2. Identifier les clés qui sont UNIQUEMENT dans 'rows' (pour éviter de dupliquer les en-têtes)
            row_only_keys = set()
            if cleaned_rows:
                for row in cleaned_rows:
                    for key in row.keys():
                        if key not in cleaned_metadata:
                            row_only_keys.add(key)
                
                # Si l'IA a tout mis dans rows (bug de l'IA), on prend tout
                if not row_only_keys:
                    for row in cleaned_rows:
                        for key in row.keys():
                            row_only_keys.add(key)

            # 3. Fonction de remplacement sécurisée
            def replace_token_in_paragraph(paragraph, key, value):
                tokens = [f"[{key}]", f"{{{{{key}}}}}"]
                full_text = paragraph.text
                
                replaced = False
                for token in tokens:
                    if token in full_text:
                        if isinstance(value, str) and len(value) > 2000:
                            value = value[:2000] + "..."
                        full_text = full_text.replace(token, str(value if value is not None else ''))
                        replaced = True

                if replaced:
                    for run in paragraph.runs:
                        run.text = ''
                    if paragraph.runs:
                        paragraph.runs[0].text = full_text
                    else:
                        paragraph.add_run(full_text)

            # 4. Remplacement des variables simples (metadata) dans les paragraphes
            for p in doc.paragraphs:
                for key, val in cleaned_metadata.items():
                    replace_token_in_paragraph(p, key, val)

            # 5. Traitement dynamique des tableaux
            for table in doc.tables:
                row_to_duplicate = None
                
                # Étape A : Recherche de la ligne modèle
                # On ne duplique la ligne QUE si elle contient une clé exclusive à 'rows'
                for row in table.rows:
                    found_row_key = False
                    for cell in row.cells:
                        for key in row_only_keys:
                            if (f"[{key}]" in cell.text or f"{{{{{key}}}}}" in cell.text):
                                found_row_key = True
                                break
                        if found_row_key:
                            break
                    
                    if found_row_key:
                        row_to_duplicate = row
                        break 
                
                # Étape B : Duplication et remplissage
                if row_to_duplicate and cleaned_rows:
                    template_row = row_to_duplicate
                    last_inserted_tr = template_row._tr
                    
                    for index, data_row in enumerate(cleaned_rows):
                        if index == 0:
                            current_row = template_row
                        else:
                            new_tr = deepcopy(template_row._tr)
                            last_inserted_tr.addnext(new_tr)
                            current_row = table.rows[-1] 
                            last_inserted_tr = new_tr 
                        
                        for cell in current_row.cells:
                            for p in cell.paragraphs:
                                for key, val in data_row.items():
                                    replace_token_in_paragraph(p, key, val)
                                            
                # Étape C : Remplacement des métadonnées simples dans les tableaux (pour les en-têtes)
                for row in table.rows:
                    for cell in row.cells:
                        for p in cell.paragraphs:
                            for key, val in cleaned_metadata.items():
                                replace_token_in_paragraph(p, key, val)

            # 6. NETTOYAGE FINAL : Effacer les balises non remplies
            def clean_remaining_tokens(paragraph):
                full_text = paragraph.text
                if '[' in full_text or '{' in full_text:
                    tokens = regex_lib.findall(r'\[([^\]]+)\]|\{\{([^}]+)\}\}', full_text)
                    for token_group in tokens:
                        token = token_group[0] if token_group[0] else token_group[1]
                        if '_' in token or any(c.isupper() for c in token):
                            full_text = full_text.replace(f"[{token}]", "").replace(f"{{{{{token}}}}}", "")
                
                if full_text != paragraph.text:
                    for run in paragraph.runs:
                        run.text = ''
                    if paragraph.runs:
                        paragraph.runs[0].text = full_text
                    else:
                        paragraph.add_run(full_text)

            for p in doc.paragraphs:
                clean_remaining_tokens(p)

            for table in doc.tables:
                for row in table.rows:
                    for cell in row.cells:
                        for p in cell.paragraphs:
                            clean_remaining_tokens(p)

            # 7. Sauvegarde
            doc.save(excel_path)
            print("Rendu Word réussi ! (Sans duplication, sans balises vides)")
            print("Succès Word")
            return
    
    # ---- TRAITEMENT EXCEL
    wb = openpyxl.load_workbook(excel_path)
    ws = wb.active

    # 1. Préparation des données : on crée des versions "normalisées" des clés de l'IA
    normalized_metadata = {normalize_key(k): v for k, v in ai_data.get('metadata', {}).items()}
    
    normalized_rows = []
    if 'rows' in ai_data and ai_data['rows']:
        for row in ai_data['rows']:
            normalized_rows.append({normalize_key(k): v for k, v in row.items()})

    # 2. TROUVER LA LIGNE DE BASE DU TABLEAU
    row_keys = set()
    if normalized_rows:
        row_keys = set(normalized_rows[0].keys())
    
    template_row_idx = None
    max_matches = 0

    if row_keys:
        for row in ws.iter_rows():
            current_row_tags = set()
            for cell in row:
                if cell.value and isinstance(cell.value, str) and '{{' in cell.value:
                    found_tags = regex_lib.findall(r'\{\{([^}:]+)(?::[^}]+)?\}\}', cell.value)
                    for tag in found_tags:
                        # ON NORMALISE LES BALISES EXCEL ICI AUSSI
                        current_row_tags.add(normalize_key(tag.strip()))
            
            matching_tags = current_row_tags & row_keys
            if len(matching_tags) > max_matches:
                max_matches = len(matching_tags)
                template_row_idx = row[0].row

        if not template_row_idx or max_matches == 0:
            print("Avertissement : L'IA n'a pas généré de tableau (rows) correspondant au fichier. Remplissage des métadonnées uniquement.")
    else:
        print("Avertissement : L'IA n'a pas renvoyé de 'rows'. Remplissage des métadonnées uniquement.")

    def clean_and_convert_value(key, value):
        if value is None:
            return ""
        value_str = str(value).strip()

        if any(k in key.lower() for k in ['date', 'debut', 'fin', 'start', 'end']):
            if len(value_str) >= 10 and value_str[4] == '-' and value_str[7] == '-':
                value_str = value_str[:10]
            date_formats = ['%Y-%m-%d', '%d/%m/%Y', '%m/%d/%Y', '%Y/%m/%d']
            for fmt in date_formats:
                try:
                    return datetime.strptime(value_str, fmt).date()
                except ValueError:
                    continue
        
        if any(k in key.lower() for k in ['duree', 'duration', 'avancement', 'progress', 'jour', 'days', 'nombre_de_jour', 'wbs', 'probabilite', 'impact']):
            try:
                if "%" in value_str:
                    return float(value_str.replace("%", "").strip()) / 100
                if '.' in value_str or ',' in value_str:
                    return float(value_str.replace(',', '.'))
                return int(value_str)
            except ValueError:
                pass

        return value_str

    # Sauvegarde du modèle original en mémoire RAM
    template_cells_backup = {}
    if template_row_idx:
        for col_idx in range(1, ws.max_column + 1):
            cell = ws.cell(row=template_row_idx, column=col_idx)
            template_cells_backup[col_idx] = {
                "value": cell.value,
                "font": copy(cell.font) if cell.has_style else None,
                "fill": copy(cell.fill) if cell.has_style else None,
                "border": copy(cell.border) if cell.has_style else None,
                "alignment": copy(cell.alignment) if cell.has_style else None,
                "number_format": cell.number_format if cell.has_style else None,
                "has_style": cell.has_style
            }

    # 3. Remplir les lignes de tableau (rows)
    if template_row_idx and normalized_rows:
        num_rows_to_add = len(normalized_rows)
        if num_rows_to_add > 1:
            ws.insert_rows(template_row_idx + 1, amount=num_rows_to_add - 1)

        for i, row_data in enumerate(normalized_rows):
            target_row_idx = template_row_idx + i
            # On combine metadata et row normalisés
            combined_data = {**normalized_metadata, **row_data}
            
            for col_idx in range(1, ws.max_column + 1):
                target_cell = ws.cell(row=target_row_idx, column=col_idx)
                backup = template_cells_backup[col_idx]
                
                if backup["has_style"] and i > 0:
                    if backup["font"]: target_cell.font = copy(backup["font"])
                    if backup["fill"]: target_cell.fill = copy(backup["fill"])
                    if backup["border"]: target_cell.border = copy(backup["border"])
                    if backup["alignment"]: target_cell.alignment = copy(backup["alignment"])
                    target_cell.number_format = backup["number_format"]

                if backup["value"] is not None:
                    val_str = str(backup["value"])
                    if '{{' in val_str:
                        pure_tag_match = regex_lib.match(r'^\{\{([^}:]+)(?::[^}]+)?\}\}$', val_str.strip())
                        if pure_tag_match:
                            tag_key = pure_tag_match.group(1).strip()
                            norm_tag_key = normalize_key(tag_key)
                            if norm_tag_key in combined_data:
                                target_cell.value = clean_and_convert_value(tag_key, combined_data[norm_tag_key])
                        else:
                            for key, value in combined_data.items():
                                # Pour le remplacement dans le texte, on utilise la clé originale pour ne pas casser le texte
                                original_key = next((k for k, v in row_data.items() if normalize_key(k) == key), key)
                                val_str = regex_lib.sub(r'\{\{' + regex_lib.escape(original_key) + r'(?::[^}]+)?\}\}', str(value), val_str)
                            target_cell.value = val_str
                    else:
                        if i > 0:
                            if isinstance(backup["value"], str) and backup["value"].startswith('='):
                                target_cell.value = adjust_formula(backup["value"], template_row_idx, target_row_idx)
                            else:
                                target_cell.value = backup["value"]

    # 4. Remplacer les balises simples (metadata) UNIQUEMENT en dehors du tableau
    if normalized_metadata:
        end_table_idx = template_row_idx + len(normalized_rows) if template_row_idx else 0
        for row in ws.iter_rows():
            if template_row_idx and (template_row_idx <= row[0].row < end_table_idx):
                continue
            for cell in row:
                if cell.value and isinstance(cell.value, str) and '{{' in cell.value:
                    val_str = cell.value
                    pure_tag_match = regex_lib.match(r'^\{\{([^}:]+)(?::[^}]+)?\}\}$', val_str.strip())
                    if pure_tag_match:
                        tag_key = pure_tag_match.group(1).strip()
                        norm_tag_key = normalize_key(tag_key)
                        if norm_tag_key in normalized_metadata:
                            cell.value = clean_and_convert_value(tag_key, normalized_metadata[norm_tag_key])
                    else:
                        for key, value in normalized_metadata.items():
                            val_str = regex_lib.sub(r'\{\{' + regex_lib.escape(key) + r'(?::[^}]+)?\}\}', str(value), val_str)
                        cell.value = val_str

    wb.save(excel_path)
    print("Succès")

# (Assurez-vous que la fonction adjust_formula est bien présente au-dessus)
def adjust_formula(formula_str, source_row, target_row):
    if not isinstance(formula_str, str) or not formula_str.startswith('='):
        return formula_str
    delta = target_row - source_row
    if delta == 0:
        return formula_str
    def replace_row(match):
        col_part = match.group(1)
        row_abs = match.group(2)
        row_num = int(match.group(3))
        if row_abs == '$':
            return match.group(0)
        new_row_num = row_num + delta
        return f"{col_part}{row_abs}{new_row_num}"
    pattern = r'(\$?[A-Z]{1,3})(\$?)(\d+)'
    return regex_lib.sub(pattern, replace_row, formula_str)

if __name__ == '__main__':
    if len(sys.argv) < 3:
        print("Erreur : arguments manquants.")
        sys.exit(1)
    main(sys.argv[-2], sys.argv[-1])