# 🤖 Agent IA Desktop pour la Gestion de Projet (PMP)
Application desktop hybride (Electron.js + Node.js + Python) transformant les LLMs (Gemini, OpenAI, Ollama) en véritables assistants de gestion de projet.

L'application génère des livrables professionnels au format Excel, Word et PDF, capables de réaliser des calculs mathématiques complexes (Valeur Acquise, Chemin Critique) sans hallucination, et de s'adapter aux modèles de documents existants de l'entreprise.

<img width="852" height="807" alt="interface" src="https://github.com/user-attachments/assets/fb35c7b5-92c4-4415-afd6-39798298c2cb" />

## 🎯 Le Problème Résolu
Les LLMs standards (comme ChatGPT) sont incapables de générer des diagrammes de Gantt Excel avec des mises en forme conditionnelles, de calculer un Chemin Critique (CPM) sans erreurs, ou de remplir un modèle Word d'entreprise sans en détruire la mise en page.

Cette application agit comme un "cerveau exécutif" : l'IA fournit le contexte et les données, tandis que le backend (Node.js/Python) se charge de la logique mathématique et de la génération des fichiers complexes.

# ✨ Fonctionnalités Clés
## 1. Génération de documents standards (De zéro)
L'IA génère des documents complexes avec une mise en page professionnelle intégrée :

### Excel (.xlsx) : 
- Échéanciers de projet (Gantt avec couleurs, jours ouvrés et formules).
- Registres des risques (avec scores et calculs).
-  Registres des parties prenantes.

### PDF (.pdf) : 
- Charte de projet formelle (avec signatures).
- Rapport d'analyse du Chemin Critique (CPM).
- Rapport d'analyse de la Valeur Acquise (EVM).
## 2. Remplissage de modèles existants (Mode Template)
L'utilisateur peut uploader ses propres **fichiers Excel (.xlsx)** ou **Word (.docx)** contenant son logo, ses couleurs et ses formules complexes.

<img width="642" height="185" alt="partieprenante" src="https://github.com/user-attachments/assets/91ecfb6b-7dc3-4fbc-97f3-59d1e5fc433f" />

**Balises intelligentes** : L'utilisateur place des balises ({{**Nom_Tache**}} pour **Excel**, [**Nom_Tache**] pour **Word**) dans ses cellules ou paragraphes.

**Injection sécurisée** : Un pont Python (openpyxl et python-docx) lit le fichier, l'IA génère les données, et Python injecte le tout en dupliquant les lignes de tableaux, en incrémentant les formules Excel et en préservant 100% de la mise en forme d'origine (sans jamais corrompre le fichier).
### 3. Zéro Hallucination Mathématique
Pour l'analyse de la Valeur Acquise (EVM) et du Chemin Critique (CPM), l'IA ne fait que fournir les tâches. Ce sont les algorithmes Node.js qui calculent les marges (Forward/Backward Pass), les KPIs (CPI, SPI) et la durée minimale du projet avec une précision absolue.

### 4. Architecture 100% Multi-IA avec Option en Privée
L'application intègre un routeur dynamique permettant à l'utilisateur de choisir son moteur IA en temps réel depuis l'interface (aucun fichier de configuration .env requis) :

**Cloud** : 
- Google Gemini
- OpenAI (GPT-4o)
- OpenRouter (Claude, Llama, GLM).

**Local** :
- Ollama / LM Studio (pour une confidentialité 100% locale, idéale pour les projets confidentiels).

## 🏗️ Architecture Logicielle
Le projet suit le principe de responsabilité unique (Architecture en couches) :

- Frontend : HTML/JS natif (Interface utilisateur légère et réactive).
- Backend (Node.js) : Electron.js, Express, API REST.
- src/routes/ : Aiguillage des requêtes.
- src/controllers/ : Logique métier et orchestration.
- src/services/ : Gestion multi-IA (Gemini/OpenAI/Ollama), génération de fichiers (ExcelJS, PDFKit).
- Pont Python : fill_template.py utilisant openpyxl et python-docx pour l'injection de données dans les modèles Office existants.

## 🚀 Installation et Lancement
Prérequis
Node.js installé.
Python installé.

## Étapes

### 1. Cloner le dépôt :
```
git clone https://github.com/Ta-gestion/agent-ia-gestion-de-projet.git
cd agent-ia-gestion-de-projet
```

### 2. Installer les dépendances Node.js :
```
npm install
```
### 3. Configurer l'environnement Python :
```
python -m venv venv
# Windows
.\venv\Scripts\activate
# Mac/Linux
source venv/bin/activate

pip install openpyxl python-docx
```
### 4. Lancer l'application :
**Mode Web (développement)** : ```npm run dev``` (accessible sur ```http://localhost:3000```)

**Mode Application Desktop (Electron)** : ```npm start```

#### 5. Configuration de l'IA :
Au premier lancement, ouvrez le panneau "Paramètres du Moteur IA" dans l'application, sélectionnez votre fournisseur (Gemini, OpenAI, Ollama, etc.) et entrez votre clé API. Les paramètres sont sauvegardés localement sur votre machine.

## 🛠️ Stack Technique
```Node.js``` ```Electron.js``` ```Express``` ```Python``` ```OpenPyXL``` ```Python-Docx``` ```ExcelJS``` ```PDFKit``` ```Google Gemini API``` ```OpenAI API``` ```Ollama```

## ⚖️ Licence et Mentions Légales
**Code Source**
Copyright (c) 2026 TA Gestion. Tous droits réservés.

Ce code source et son contenu associé sont la propriété exclusive de l'auteur. L'accès à ce dépôt est accordé à titre consultatif pour démontrer les compétences techniques de l'auteur. Aucune partie de ce logiciel ne peut être reproduite, modifiée, distribuée, sublicenciée ou vendue, en tout ou en partie, sans l'autorisation écrite préalable de l'auteur.

## Librairies Tierces
Ce projet utilise des technologies Open Source (MIT, Apache 2.0, ISC, etc.). La liste complète des licences et des droits d'auteur des bibliothèques tierces utilisées est disponible dans le fichier legal/THIRD_PARTY_LICENSES.txt.

## Responsabilité
L'utilisation de ce logiciel nécessite une clé API provenant de votre fournisseur d'IA. L'utilisateur est seul responsable des coûts engendrés et du respect des conditions d'utilisation de ces services tiers.

⚠️ Ce projet est un portfolio de démonstration. Aucun support technique n'est fourni. LE LOGICIEL EST FOURNI "TEL QUEL", SANS AUCUNE GARANTIE.

**Développé en alignement avec les standards du PMBOK (PMP).**
