# PRD — Cahier (HEM Genève)

> **Cahier** est une application web / mobile (PWA) personnelle, minimaliste et *offline-first*, conçue pour consigner, dicter et suivre ses devoirs et son planning hebdomadaire au conservatoire (Haute école de musique de Genève — Musique et Mouvement / Rythmique Dalcroze).

---

## 1. Vision & Objectifs

### Problème
L’utilisateur est étudiant en musique et mouvement à la HEM Genève. En cours (piano, rythmique, solfège, improvisation), il doit noter un devoir en quelques secondes, sans friction, idéalement à la voix, sur son iPhone. À l'école, son Mac reste chez lui : **l'application doit impérativement fonctionner sur mobile de manière 100 % autonome**, sans dépendre d'un serveur local ou d'un tunnel sur son ordinateur personnel.

### Objectifs clés
1. **Indépendance totale du Mac** : L'app est accessible partout (5G, Wi-Fi campus, hors-ligne) via une URL HTTPS permanente ou en PWA installée sur l'écran d'accueil iOS.
2. **Dictée vocale immédiate** : Un bouton « Dicter » transcrit la voix directement dans le texte du devoir et l'associe automatiquement au cours cité ou sélectionné, sans lecteur audio ni modal de confirmation inutile.
3. **Planning hebdomadaire HEM intégré** : Consultation rapide de l'emploi du temps récurrent (salles, enseignants, horaires) avec devoirs associés à chaque cours.
4. **Zéro friction technique** : Architecture statique légère (HTML / CSS / Vanilla JS / IndexedDB), sans dépendance complexe, avec Service Worker pour fonctionnement offline garanti.
5. **Esthétique sobre & éditoriale** : Design inspiré de l'architecture et de l'édition (fond crème papier `#f4f2ec`, encre `#161616`, typographies Playfair Display & Helvetica, absence de photos superflues).

---

## 2. Utilisateur & Contexte d'utilisation

- **Utilisateur unique** : Lucas Cortés, étudiant HEM Genève (Département Musique et Mouvement / Dalcroze).
- **Appareil principal** : iPhone (Safari iOS, mode PWA « Sur l'écran d'accueil »).
- **Appareil secondaire** : MacBook (consultation et modifications éventuelles).
- **Environnement réseau** : 
  - Wi-Fi campus HEM (souvent restrictif, ports filtrés, isolation client).
  - Réseau cellulaire 4G/5G.
  - Mode hors-ligne (sous-sol, salles insonorisées).

---

## 3. Architecture Technique & Choix Structurants

```
                    ┌──────────────────────────────────────────────┐
                    │               iPhone (Safari)                │
                    │   PWA « Sur l'écran d'accueil » (Standalone)   │
                    └──────────────────────┬───────────────────────┘
                                           │
                        ┌──────────────────┴──────────────────┐
                        ▼                                     ▼
             ┌─────────────────────┐               ┌─────────────────────┐
             │   Service Worker    │               │  Web Speech API /   │
             │   Cache Hors-Ligne  │               │   webkitSpeechRec   │
             │   (HTML/CSS/JS)     │               └─────────────────────┘
             └──────────┬──────────┘
                        ▼
             ┌─────────────────────┐
             │      IndexedDB      │
             │   (Stockage local   │
             │   Devoirs/Planning) │
             └─────────────────────┘
```

### Principes
1. **Offline-First & Local-First** : Toutes les données (cours, devoirs, planning) sont stockées dans le navigateur (`IndexedDB`). L'application se charge instantanément même sans réseau.
2. **Vanilla Web Platform** : Pas de bundler lourd, pas de Node/npm obligatoire. Modules ES natifs (`import`/`export`), HTML5, CSS3 pur.
3. **Déploiement statique permanent** : Fichiers hébergeables sur n'importe quel CDN statique gratuit (GitHub Pages, Cloudflare Pages, Netlify) ou exécutable en local sur le Mac si besoin. L'accès mobile ne dépend plus d'un tunnel éphémère (`localhost.run`, `cloudflared`).

---

## 4. Spécifications Fonctionnelles

### 4.1. Onglet « Devoirs »

#### Dictée vocale directe (priorité absolue)
- **Bouton principal** : `Dicter un devoir` dans l'en-tête de section, ou `Dicter pour ce cours` sous chaque bloc de cours.
- **Fonctionnement** :
  1. L'utilisateur clique sur le bouton : le micro s'ouvre (`SpeechRecognition` / `webkitSpeechRecognition` en français `fr-FR`).
  2. L'utilisateur parle (ex. : *« Piano : déchiffrer page 12 et métronome à 72 »*).
  3. L'app extrait le cours s'il est cité (alias : *piano*, *solfège*, *tamaé*, *sourisse*, *impro*, *rythmique*, *emilio*, *pascale*).
  4. Le texte nettoyé est directement consigné comme nouveau devoir pour ce cours.
  5. **Aucun lecteur audio n'est conservé** ni affiché : seule la note textuelle compte.
  6. Si le micro n'est pas supporté ou refusé, bascule transparente vers la saisie manuelle.

#### Saisie textuelle classique
- Bouton `Écrire un devoir` ouvrant un panneau sobre (consigne textuelle + sélection du cours par pastilles).

#### Suivi et cycle de vie d'un devoir
- **Statuts possibles** :
  - **À faire (`todo`)** : État initial par défaut.
  - **À revoir (`repeat`)** : Marque le devoir pour répétition, incrémente un compteur discret (`Répété X fois`).
  - **Validé (`done`)** : Devoir terminé, barré/atténué avec possibilité de remise à faire.
- **Actions par devoir** :
  - `Valider` / `Remettre à faire`
  - `À revoir`
  - `Semaine suivante` (duplique ou reporte le devoir sur le lundi suivant)
  - `Supprimer` (confirmation discrète)

#### Filtres & Navigation temporelle
- Sélecteur de semaine : `Précédent`, `Semaine du X au Y` (clic = retour immédiat à la semaine en cours), `Suivant`.
- Filtres horizontaux par cours : `Tous les cours` ou cours individuel avec décompte des devoirs actifs.
- Barre de progression hebdomadaire discrète (`X/Y validés`).

---

### 4.2. Onglet « Planning » (Emploi du temps HEM)

#### Grille hebdomadaire récurrente
Affichage clair, lisible et sans photos parasites, structuré par jour (Lundi à Dimanche) avec date correspondante à la semaine affichée. Mise en avant automatique du jour actuel (`Aujourd'hui`).

#### Horaires officiels pré-configurés
| Jour | Heures | Cours | Salle | Enseignant / Remarques |
| :--- | :--- | :--- | :--- | :--- |
| **Lundi** | 13:30 – 15:00 | Improvisation pour le mouvement | 103 | Pascale Rochat Martinet |
| **Lundi** | 15:20 – 16:40 | Improvisation | 408 | Laurent Sourisse |
| **Mardi** | 09:00 – 11:00 | Solfège | 103 | Tamaé Gennai |
| **Mardi** | 13:00 – 14:30 | Technique et créativité corporelle | 101 | Emilio Artessero Quesada |
| **Mercredi** | 11:50 – 13:05 | Rythmique | 021 | Florence Jaccottet |
| **Jeudi** | 10:45 – 11:30 | Piano | 408 | Sarah Branchi |

#### Interactions sur le planning
- **Devoirs liés** : Chaque bloc horaire affiche immédiatement les devoirs de la semaine associés à cette matière.
- **Bouton `Ajouter un devoir`** direct depuis le bloc de cours du planning.
- **CRUD horaire** : Modifier un créneau (horaires, salle, professeur) ou ajouter un cours exceptionnel.

---

### 4.3. Gestion des Cours

- Bouton `Gérer les cours` accessible depuis les deux onglets.
- Liste des cours actifs.
- Ajout d'un nouveau cours (nom libre, génération automatique d'un identifiant slug).
- Suppression d'un cours (avec protection si des devoirs ou des créneaux y sont rattachés).

---

## 5. Spécifications des Données (`IndexedDB`)

- **Base de données** : `cahier-db` (version courante : `3`).
- **Magasins d'objets (`objectStores`)** :
  1. `homework` :
     - `id` (string UUID / timestamp-rand) [clé primaire]
     - `weekStart` (string `YYYY-MM-DD`, lundi) [index]
     - `classType` (string id du cours) [index]
     - `notes` (string, consigne textuelle)
     - `status` (`'todo'` | `'repeat'` | `'done'`)
     - `repeatCount` (number)
     - `createdAt` (timestamp)
     - `updatedAt` (timestamp)
  2. `schedule` :
     - `id` (string) [clé primaire]
     - `day` (number 0..6, 0 = Lundi)
     - `start` (string `HH:mm`)
     - `end` (string `HH:mm`)
     - `classType` (string)
     - `room` (string)
     - `notes` (string, enseignant)
  3. `settings` :
     - `key` (string, ex. `'config'`) [clé primaire]
     - `classes` (array d'objets `{ id, label }`)
     - `lastClassType` (string)
     - `timetableVersion` (string, contrôle de version pour l'initialisation du planning)

---

## 6. Design System & Ergonomie Mobile

### Palette
- **Fond de page** : `#f4f2ec` (papier chaud / crème).
- **Fond mobile externe** : `#0b0b0b` (barre d'état iOS et letterbox).
- **Texte principal** : `#161616` (encre noire profonde).
- **Texte atténué** : `#8a877f` (gris chaud).
- **Lignes & séparateurs** : `#dedcd4` (filet fin 1px).
- **Accent validation** : `#2e6930` (vert sobre pour les devoirs validés).

### Typographie
- **Titres / Logo / Éléments forts** : `Playfair Display`, serif, 400 / 500.
- **Corps de texte / Boutons / Métadonnées** : `Helvetica Neue`, Helvetica, Arial, sans-serif.

### Ergonomie iOS Safari
- `viewport-fit=cover` avec gestion des `safe-area-inset-*` (Dynamic Island / encoche / barre inférieure).
- PWA `standalone` (`apple-mobile-web-app-capable`).
- Boutons tactiles avec zone minimale de 44×44 px.
- Défilement fluide sans zoom intempestif (`font-size: 16px` minimum sur les champs de saisie).

---

## 7. Solution d'Indépendance du Téléphone (Déploiement)

Pour que l'iPhone puisse ouvrir l'application à l'école sans que le Mac soit allumé :

### Option A — Hébergement Web Statique Permanent (Recommandé)
Déployer les fichiers statiques (`index.html`, `styles.css`, `manifest.json`, `sw.js`, `js/`) sur une plateforme statique permanente et gratuite avec certificat HTTPS valide :
- **GitHub Pages** (ex. `https://lucascortes.github.io/cahier/`)
- ou **Cloudflare Pages** / **Vercel** / **Netlify**
- **Avantage** : Accessible en permanence depuis n'importe quel réseau (Wi-Fi école, 5G, chez soi), HTTPS natif (indispensable pour l'API microphone Safari), mise à jour simple.

### Option B — PWA Locale Complètement Mise en Cache (Service Worker)
- Une fois chargée une première fois en HTTPS, l'application est entièrement mise en cache par le Service Worker.
- L'utilisateur peut l'ouvrir même en mode avion, IndexedDB stockant toutes les données sur l'iPhone.

---

## 8. Roadmap de Réalisation

| Étape | Description | Statut |
| :--- | :--- | :--- |
| **1. Stabilisation du Code Statique** | Nettoyage complet : suppression des reliquats audio, fiabilisation de la reconnaissance vocale sans doublon, audit du Service Worker offline. | ⏳ Prêt |
| **2. Publication sur URL Permanente** | Choix du support (ex. GitHub Pages ou Cloudflare Pages) pour éliminer définitivement le besoin de laisser le Mac allumé. | 🎯 Prochaine étape |
| **3. Installation & Validation Mobile** | Ajout sur l'écran d'accueil iPhone, validation de la dictée vocale en 5G et hors-ligne. | 🎯 À finaliser |
