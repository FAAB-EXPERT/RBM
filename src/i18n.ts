import { CurrencyCode, LanguageCode } from './types';

// Base amounts are stored in FCFA
// 1 EUR = 655.957 FCFA, 1 USD = 605 FCFA
export function convertFromFCFA(amountFCFA: number = 0, currency: CurrencyCode): number {
  const safe = Number(amountFCFA) || 0;
  if (currency === 'EUR') return safe / 655.957;
  if (currency === 'USD') return safe / 605;
  return safe;
}

export function convertToFCFA(amountInCurrency: number = 0, currency: CurrencyCode): number {
  const safe = Number(amountInCurrency) || 0;
  if (currency === 'EUR') return Math.round(safe * 655.957);
  if (currency === 'USD') return Math.round(safe * 605);
  return Math.round(safe);
}

export function formatCurrency(amountFCFA: number = 0, currency: CurrencyCode, lang: LanguageCode = 'FR'): string {
  const converted = convertFromFCFA(amountFCFA, currency);
  const locale = lang === 'FR' ? 'fr-FR' : 'en-US';
  if (currency === 'FCFA') {
    const numStr = Math.round(converted).toLocaleString(locale).replace(/[\u202F\u00A0]/g, ' ');
    return `${numStr} FCFA`;
  }
  if (currency === 'EUR') {
    const numStr = converted
      .toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      .replace(/[\u202F\u00A0]/g, ' ');
    return `${numStr} EUR`;
  }
  const numStr = converted
    .toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .replace(/[\u202F\u00A0]/g, ' ');
  return `${numStr} USD`;
}

export const formatCurrencyValue = formatCurrency;

export const translations = {
  FR: {
    appName: 'faab gar',
    appSubtitle: 'Plateforme Universelle de Planification Stratégique, Réseau PERT, Suivi Opérationnel & Génération Documentaire',
    nav: {
      accueil: 'Accueil & Présentation',
      profil: 'Profil Utilisateur',
      projects: 'Dossiers & Projets',
      fiche: 'Fiche Technique & Résumé Exécutif',
      docgen: 'Générateur de Documents',
      dashboard: 'Tableau de Bord Décisionnel',
      planification: 'Planification',
      processus: 'Suivi des tâches',
      raci: 'RACI',
      categorie: 'Catégorie',
      gantt: 'Diagramme de Gantt & Arbre',
      pert: 'Réseau PERT',
      kanban: 'Tableau Kanban Interactif',
      arbre: 'Arbre à problèmes',
      solutions: 'Arbre à solutions',
      registre_parties: 'Registre Parties Prenantes',
      terrain: 'Analyse des problèmes',
      parties: 'Analyse Parties Prenantes',
      rendement: 'Cadre de Rendement',
      cmr: 'Cadre Mesure Rendement (CMR)',
      risques_hypo: 'Hypothèses & Risques',
      extrants: 'Matrice Extrants & Activités',
      clar: 'Cadre Logique (CLAR)',
      prepPhase: 'PHASE PRÉPARATOIRE & CADRAGE',
      execPhase: 'PILOTAGE & EXÉCUTION OPÉRATIONNELLE',
      garPhase: 'GESTION AXÉE SUR LES RÉSULTATS (GAR)'
    },
    actions: {
      importJson: 'Importer JSON',
      saveJson: 'Enregistrer / Mettre à jour JSON',
      exportJson: 'Exporter une copie JSON',
      exportPdf: 'Télécharger le rapport PDF',
      activeDossier: 'Dossier / Projet Actif',
      currency: 'Devise Monétaire',
      language: 'Langue / Language',
      theme: 'Thème Visuel',
      lightMode: 'Mode Clair (#FFFFFF)',
      darkMode: 'Mode Sombre (#0f172a)',
      zoomIn: 'Zoom +',
      zoomOut: 'Zoom -',
      zoomReset: '100%',
      graphView: 'Vue Graphique / Arbre',
      listView: 'Vue Liste / Tableau'
    },
    home: {
      anchorPresentation: 'Présentation Générale',
      anchorUsage: 'Mode d’Emploi (Modules)',
      anchorDocs: 'Générateur de 15 Documents',
      anchorMethodology: 'Méthodologie GAR & PERT',
      anchorBackup: 'Sauvegarde JSON',
      anchorCredits: 'Crédits & Propriété',
      anchorLegal: 'Propriété Intellectuelle',
      heroBadge: 'Planification Stratégique Universelle · Méthode PERT/CPM & Gestion Axée sur les Résultats (GAR)',
      heroTitle: 'faab gar — Planifiez, Suivez et Pilotez Tous Vos Projets avec Précision',
      heroDesc: 'Conçue pour toutes les entreprises, institutions publiques, ONG, bureaux d’études et chefs de projets : faab gar intègre la macro-planification, le suivi automatisé des écarts d’exécution, le calcul dynamique du Réseau PERT (Chemin Critique), le Kanban auto-recalculé et un générateur de 15 documents institutionnels et opérationnels aux normes internationales.',
      menuInstruction: 'Utilisez exclusivement l’icône du Menu Burger (☰) située en haut à gauche pour naviguer vers les modules de l’application.',
      pillarsTitle: 'Architecture Fonctionnelle & Méthodologie de Pilotage faab gar',
      pillar1Title: '01. Planification Macro & Suivi Automatisé des Tâches',
      pillar1Desc: 'Séparation claire entre la Planification (budget, antécédents, dates prévues) et le Suivi des tâches (statut dynamique selon la date du jour, calcul des écarts de début et de fin).',
      pillar2Title: '02. Réseau PERT & Chemin Critique Dynamique',
      pillar2Desc: 'Modélisation interactive du graphe PERT et de la matrice des antécédents/précédents pour identifier les tâches à marge nulle et anticiper tout glissement calendaire.',
      pillar3Title: '03. Kanban Intelligent & Multi-Devises',
      pillar3Desc: 'Le déplacement d’une tâche dans le Kanban recalcule automatiquement les dates prévues en conservant sa durée et la logique des dépendances, avec conversion FCFA / EUR / USD.',
      pillar4Title: '04. Générateur de 15 Documents & 10 Matrices aux Normes Internationales',
      pillar4Desc: 'Production instantanée en PDF fond blanc pur de 15 livrables officiels (TDR, Lettre de Mission, ProDoc, Démarrage, CAP, Grille OCDE/CAD, Mi-Parcours, Rapport Final, Note S&E, NDA, Courrier, CV Exécutif, CV Détaillé, PV de Réunion, TDR Simplifiés) synchronisés avec les 10 Matrices Maîtresses.',
      backupTitle: 'Guide Pédagogique : Sauvegarde & Mise à Jour du Fichier JSON',
      backupSubtitle: 'Comment utiliser l’icône Disquette du menu déroulant et pourquoi adopter cette discipline ?',
      backupHowTitle: 'Comment enregistrer / écraser votre fichier JSON ?',
      backupHowDesc: 'Ouvrez le menu déroulant (☰) et cliquez sur la 2ème icône en haut (Disquette "Enregistrer / Mettre à jour JSON"). Grâce à l’API File System Access intégrée, l’application écrase et met à jour directement votre fichier .json existant sur votre appareil sans créer de fichiers multiples numérotés.',
      backupWhy1Title: '1. Unicité de la version sans doublons',
      backupWhy1Desc: 'Évite la prolifération de fichiers "projet(1).json", "projet(2).json" dans vos téléchargements et garantit une source unique de vérité.',
      backupWhy2Title: '2. Double sécurité IndexedDB + Fichier local',
      backupWhy2Desc: 'Vos saisies sont sauvegardées en temps réel dans la base IndexedDB de l’appareil ET consolidées sur votre disque dur en un clic.',
      backupWhy3Title: '3. Portabilité, audit et partage universel',
      backupWhy3Desc: 'Transférez votre portefeuille complet entre ordinateur, tablette et smartphone ou transmettez-le à vos partenaires et comités de pilotage.',
      creditsTitle: 'Crédits de Conception & Ingénierie Logicielle',
      creatorLabel: 'Créateur & Architecte Principal',
      legalTitle: 'Accord de Confidentialité & Propriété Intellectuelle',
      legalText: 'La présente plateforme (« faab gar »), incluant son architecture structurelle, ses algorithmes de calcul de réseau PERT et chemin critique (CPM), son générateur documentaire normé, son moteur de persistance hybride IndexedDB/JSON et son design d’interface, constitue une œuvre de l’esprit originale protégée par le droit d’auteur national et international, propriété exclusive de KOFFIE FABIEN MICHAEL. Toute reproduction, copie, décompilation, ingénierie inverse, modification ou diffusion non expressément autorisée par écrit par son auteur est formellement interdite et passible de poursuites civiles et pénales.'
    },
    profile: {
      title: 'Profil Utilisateur & Identité du Responsable',
      subtitle: 'Ces informations sont enregistrées automatiquement dans l’IndexedDB et reportées dans tous les dossiers, la Fiche Technique, le Générateur de Documents et les rapports PDF.',
      fullName: 'Nom & Prénoms',
      email: 'Adresse Email Professionnelle',
      phone: 'Contact / Téléphone',
      institution: 'Organisation / Entreprise / Institution',
      role: 'Fonction / Titre Officiel',
      savedNotice: 'Synchronisé automatiquement dans l’IndexedDB de l’appareil'
    }
  },
  EN: {
    appName: 'faab gar',
    appSubtitle: 'Universal Strategic Planning, PERT Network, Operational Tracking & Institutional Document Generator',
    nav: {
      accueil: 'Home & Overview',
      profil: 'User Profile',
      projects: 'Portfolios & Projects',
      fiche: 'Technical Sheet & Executive Summary',
      docgen: 'Document Generator',
      dashboard: 'Executive Dashboard',
      planification: 'Planning',
      processus: 'Task Tracking',
      raci: 'RACI',
      categorie: 'Category',
      gantt: 'Gantt Chart & WBS Tree',
      pert: 'PERT Network',
      kanban: 'Interactive Kanban Board',
      arbre: 'Problem Tree',
      solutions: 'Solution Tree',
      registre_parties: 'Stakeholder Register',
      terrain: 'Problem Analysis',
      parties: 'Stakeholder Analysis',
      rendement: 'Performance Framework',
      cmr: 'Performance Measurement (PMF)',
      risques_hypo: 'Assumptions & Risks',
      extrants: 'Outputs & Activities Matrix',
      clar: 'Logical Framework (LFA)',
      prepPhase: 'PREPARATORY PHASE & SCOPING',
      execPhase: 'STEERING & OPERATIONAL EXECUTION',
      garPhase: 'RESULTS-BASED MANAGEMENT (RBM / GAR)'
    },
    actions: {
      importJson: 'Import JSON',
      saveJson: 'Save / Overwrite JSON',
      exportJson: 'Export JSON Copy',
      exportPdf: 'Download PDF Report',
      activeDossier: 'Active Portfolio / Project',
      currency: 'Monetary Currency',
      language: 'Language / Langue',
      theme: 'Visual Theme',
      lightMode: 'Light Mode (#FFFFFF)',
      darkMode: 'Dark Mode (#0f172a)',
      zoomIn: 'Zoom +',
      zoomOut: 'Zoom -',
      zoomReset: '100%',
      graphView: 'Graphic / Network View',
      listView: 'Table / List View'
    },
    home: {
      anchorPresentation: 'Overview',
      anchorUsage: 'User Guide (Modules)',
      anchorDocs: '15-Document Generator',
      anchorMethodology: 'RBM & PERT Methodology',
      anchorBackup: 'JSON Backup',
      anchorCredits: 'Credits & IP',
      anchorLegal: 'Intellectual Property',
      heroBadge: 'Universal Strategic Planning · PERT/CPM Method & Results-Based Management (RBM)',
      heroTitle: 'faab gar — Plan, Track and Steer All Your Projects with Precision',
      heroDesc: 'Built for all companies, public institutions, NGOs, consulting firms, and project managers: faab gar integrates macro-planning, automated execution variance tracking, dynamic PERT Network (Critical Path) calculation, auto-rescheduling Kanban, and a generator for 15 international-standard institutional and operational documents.',
      menuInstruction: 'Exclusively use the Burger Menu icon (☰) at the top left to access the application modules.',
      pillarsTitle: 'faab gar Functional Architecture & Steering Methodology',
      pillar1Title: '01. Macro-Planning & Automated Task Tracking',
      pillar1Desc: 'Clear separation between Macro-Planning (budget, predecessors, planned dates) and Task Tracking (dynamic status based on today’s date, start and finish variance calculation).',
      pillar2Title: '02. Dynamic PERT Network & Critical Path',
      pillar2Desc: 'Interactive PERT network graph and predecessor matrix to identify zero-float critical tasks and anticipate schedule slippage.',
      pillar3Title: '03. Smart Kanban & Multi-Currency Control',
      pillar3Desc: 'Moving a task across Kanban status columns automatically recalculates planned dates while preserving duration and dependency logic, with instant FCFA / EUR / USD conversion.',
      pillar4Title: '04. International-Standard 15-Document & 10-Matrix Generator',
      pillar4Desc: 'Instant pure-white PDF generation for 15 official deliverables (ToR, Mission Letter, ProDoc, Inception Report, CAP, OECD/DAC Grid, Mid-Term Review, Final Report, M&E Note, NDA, Admin Letter, Executive CV, Detailed CV, Meeting Minutes, Simplified ToR) synchronized with 10 Master Matrices.',
      backupTitle: 'Educational Guide: Saving & Updating Your JSON File',
      backupSubtitle: 'How to use the Floppy Disk icon in the slide-out menu and why this workflow matters',
      backupHowTitle: 'How to save / overwrite your JSON file?',
      backupHowDesc: 'Open the slide-out menu (☰) and click the 2nd icon at the top (Floppy Disk "Save / Overwrite JSON"). Using the File System Access API, the app directly overwrites your existing .json file without cluttering your folder with duplicates.',
      backupWhy1Title: '1. Single authoritative version without duplicates',
      backupWhy1Desc: 'Prevents file clutter like "project(1).json", "project(2).json" and guarantees a single source of truth.',
      backupWhy2Title: '2. Dual safety: IndexedDB + Local File',
      backupWhy2Desc: 'Your changes are saved in real time inside the device IndexedDB AND consolidated on your local drive in one click.',
      backupWhy3Title: '3. Universal portability, audit & sharing',
      backupWhy3Desc: 'Seamlessly transfer your complete portfolio across desktop, tablet, and smartphone or share it with your steering committee.',
      creditsTitle: 'Design & Software Engineering Credits',
      creatorLabel: 'Creator & Lead Software Architect',
      legalTitle: 'Confidentiality Agreement & Intellectual Property',
      legalText: 'This platform ("faab gar"), including its structural architecture, PERT/CPM critical path algorithms, standardized document generator, hybrid IndexedDB/JSON persistence engine, and interface design, is an original intellectual work protected by national and international copyright laws, owned exclusively by KOFFIE FABIEN MICHAEL. Any unauthorized reproduction, copying, reverse engineering, modification, or distribution is strictly prohibited and subject to legal prosecution.'
    },
    profile: {
      title: 'User Profile & Lead Officer Identity',
      subtitle: 'This information is automatically persisted in IndexedDB and reflected across all portfolios, the Technical Sheet, the Document Generator, and PDF reports.',
      fullName: 'Full Name',
      email: 'Professional Email Address',
      phone: 'Phone / Contact Number',
      institution: 'Organization / Company / Institution',
      role: 'Official Role / Title',
      savedNotice: 'Automatically synchronized in device IndexedDB'
    }
  }
};
