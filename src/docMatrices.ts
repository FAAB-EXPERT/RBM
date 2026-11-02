import {
  CategorizedActor,
  CurrencyCode,
  CustomDocFields,
  Dossier,
  InstitutionalDocType,
  LanguageCode,
  UserProfile
} from './types';
import { formatCurrency } from './i18n';
import {
  STANDARD_PHASES,
  computeDossierPertSummary,
  computeTaskMetrics,
  getTodayISO
} from './pertUtils';
import { StructuredA4Table } from './docTemplates';
import { ensureDossierCategorizedActors } from './db';


export type MasterMatrixId =
  | 'M1'
  | 'M2'
  | 'M3'
  | 'M4'
  | 'M5'
  | 'M6'
  | 'M7'
  | 'M8'
  | 'M9'
  | 'M10';

export type MatrixCellInputType =
  | 'text'
  | 'number'
  | 'date'
  | 'select'
  | 'textarea'
  | 'computed';

export interface MatrixColumnConfig {
  key: string;
  label: string;
  inputType: MatrixCellInputType;
  options?: string[];
  placeholder?: string;
  minWidthPx?: number;
  isRightAligned?: boolean;
  helperFormula?: string;
}

export interface MasterMatrixDefinition {
  id: MasterMatrixId;
  chipLabel: string;
  fullTitle: string;
  normativeRef: string;
  txtVariable: string;
  associatedDocs: InstitutionalDocType[];
  associatedDocsLabels: string;
  columns: MatrixColumnConfig[];
}

export type MatrixRowData = Record<string, string>;
export type AllMatricesData = Record<MasterMatrixId, MatrixRowData[]>;

function formatCleanAmount(
  amountFCFA: number,
  currency: CurrencyCode,
  lang: LanguageCode
): string {
  return formatCurrency(amountFCFA, currency, lang).replace(/[\u202F\u00A0]/g, ' ');
}

export function parseNumericValue(raw: string | number | undefined): number {
  if (raw === undefined || raw === null) return 0;
  if (typeof raw === 'number') return isNaN(raw) ? 0 : raw;
  const cleaned = String(raw)
    .replace(/[\u202F\u00A0\s]/g, '')
    .replace(/,/g, '.')
    .replace(/[^0-9.-]/g, '');
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

/**
 * Applique en temps réel les formules de calcul automatique :
 * - M1 : Taux_Realisation_% = (Valeur_Atteinte / Cible) * 100
 * - M2 : Taux_Avancement_% = (Valeur_Atteinte / Cible) * 100
 * - M5 : Ecart_Cout_CV = EV - AC ; Taux_Decaissement_% = (Cout_Reel_AC / Budget_Initial_BAC) * 100 ; Indice_CPI = Valeur_Acquise_EV / Cout_Reel_AC
 * - M7 : Criticite_PxI = Probabilite_1_5 * Impact_1_5
 */
export function computeMatrixRowCalculations(
  matrixId: MasterMatrixId,
  row: MatrixRowData
): MatrixRowData {
  const next = { ...row };

  if (matrixId === 'M1') {
    const cible = parseNumericValue(next.Cible);
    const atteint = parseNumericValue(next.Valeur_Atteinte);
    if (cible > 0) {
      const pct = Math.round((atteint / cible) * 1000) / 10;
      next['Taux_Realisation_%'] = `${pct}%`;
    } else {
      next['Taux_Realisation_%'] = '0%';
    }
  } else if (matrixId === 'M2') {
    const cible = parseNumericValue(next.Cible);
    const atteint = parseNumericValue(next.Valeur_Atteinte);
    if (cible > 0) {
      const pct = Math.round((atteint / cible) * 1000) / 10;
      next['Taux_Avancement_%'] = `${pct}%`;
    } else {
      next['Taux_Avancement_%'] = '0%';
    }
  } else if (matrixId === 'M5') {
    const bac = parseNumericValue(next.Budget_Initial_BAC);
    const ac = parseNumericValue(next.Cout_Reel_AC);
    const ev = parseNumericValue(next.Valeur_Acquise_EV);
    const cv = ev - ac;
    next.Ecart_Cout_CV = `${cv >= 0 ? '+' : ''}${Math.round(cv).toLocaleString('fr-FR').replace(/[\u202F\u00A0]/g, ' ')}`;
    if (bac > 0) {
      const decPct = Math.round((ac / bac) * 1000) / 10;
      next['Taux_Decaissement_%'] = `${decPct}%`;
    } else {
      next['Taux_Decaissement_%'] = '0%';
    }
    if (ac > 0) {
      const cpi = (ev / ac).toFixed(2);
      next.Indice_CPI = cpi;
    } else {
      next.Indice_CPI = ev > 0 ? '1.00' : '0.00';
    }
  } else if (matrixId === 'M7') {
    const prob = Math.min(5, Math.max(1, Math.round(parseNumericValue(next.Probabilite_1_5) || 1)));
    const imp = Math.min(5, Math.max(1, Math.round(parseNumericValue(next.Impact_1_5) || 1)));
    const pxi = prob * imp;
    const level =
      pxi >= 16
        ? 'Critique'
        : pxi >= 10
        ? 'Élevée'
        : pxi >= 5
        ? 'Moyenne'
        : 'Faible';
    next.Criticite_PxI = `${pxi} (${level})`;
  }

  return next;
}

/**
 * Définition officielle et exhaustive des 10 Matrices Maîtresses (M1 à M10)
 * avec leurs colonnes exactes et leur routage par type de document.
 */
export const MASTER_MATRICES_DEFINITIONS: MasterMatrixDefinition[] = [
  {
    id: 'M1',
    chipLabel: 'M1. Cadre Logique',
    fullTitle: 'MATRICE M1 : CADRE LOGIQUE & CHAÎNE DE RÉSULTATS (GAR / TdC)',
    normativeRef: 'Normes GAR PNUD / Banque Mondiale / UE / UNEG (Chaîne Impact - Effets - Extrants - Activités)',
    txtVariable: '[TXT_CADRE_LOGIQUE_M1]',
    associatedDocs: [
      'note_methodo',
      'cadrage',
      'demarrage',
      'cap',
      'mi_parcours',
      'grille_evaluation',
      'rapport_final',
      'cv_executif',
      'cv_detaille',
      'ptba',
      'slides_tdr',
      'slides_cadrage',
      'slides_demarrage',
      'slides_ptba',
      'slides_mi_parcours',
      'slides_evaluation_finale'
    ],
    associatedDocsLabels: 'Docs 3 (Note Méthodo), 5 (Cadrage), 6 (Démarrage), 7 (CAP), 8 (Mi-Parcours), 9 (Grille OCDE), 11 (Final), 12 (CV Exécutif), 13 (CV Détaillé), PTBA, Slides 16 à 22',
    columns: [
      { key: 'Code_Resultat', label: '1. Code_Resultat', inputType: 'text', placeholder: 'Ex: IMP-1, EFF-1, EXT-1.1', minWidthPx: 105 },
      {
        key: 'Niveau_GAR',
        label: '2. Niveau_GAR',
        inputType: 'select',
        options: ['Impact', 'Effet / Outcome', 'Extrant / Output', 'Activité'],
        minWidthPx: 145
      },
      { key: 'Intitule_Resultat', label: '3. Intitule_Resultat', inputType: 'textarea', placeholder: 'Intitulé du résultat attendu...', minWidthPx: 220 },
      { key: 'Indicateur_SMART', label: '4. Indicateur_SMART', inputType: 'textarea', placeholder: 'Indicateur objectivement vérifiable...', minWidthPx: 200 },
      { key: 'Baseline', label: '5. Baseline (Réf.)', inputType: 'text', placeholder: 'Ex: 0', minWidthPx: 105, isRightAligned: true },
      { key: 'Cible', label: '6. Cible', inputType: 'number', placeholder: 'Ex: 100', minWidthPx: 95, isRightAligned: true },
      { key: 'Valeur_Atteinte', label: '7. Valeur_Atteinte', inputType: 'number', placeholder: 'Ex: 65', minWidthPx: 115, isRightAligned: true },
      {
        key: 'Taux_Realisation_%',
        label: '8. Taux_Realisation_% (Auto)',
        inputType: 'computed',
        helperFormula: '(Valeur_Atteinte / Cible) * 100',
        minWidthPx: 130,
        isRightAligned: true
      },
      { key: 'Source_Verification', label: '9. Source_Verification (MdV)', inputType: 'text', placeholder: 'Rapports CAP, PV, Enquêtes...', minWidthPx: 175 },
      {
        key: 'Frequence_Collecte',
        label: '10. Frequence_Collecte',
        inputType: 'select',
        options: ['Mensuelle', 'Trimestrielle', 'Semestrielle', 'Annuelle'],
        minWidthPx: 135
      },
      { key: 'Responsable_Collecte', label: '11. Responsable_Collecte', inputType: 'text', placeholder: 'Ex: Cellule S&E / PMO', minWidthPx: 150 },
      { key: 'Hypotheses_Critiques', label: '12. Hypotheses_Critiques', inputType: 'textarea', placeholder: 'Conditions externes de réussite...', minWidthPx: 190 }
    ]
  },
  {
    id: 'M2',
    chipLabel: 'M2. WBS & PTBA',
    fullTitle: 'MATRICE M2 : PLANIFICATION OPÉRATIONNELLE (WBS, GANTT, CHEMIN CRITIQUE PERT & PTBA)',
    normativeRef: 'Standards PMBOK 7th Ed., ISO 21500:2021, Algorithme PERT/CPM & PTBA',
    txtVariable: '[TXT_WBS_PTBA_M2]',
    associatedDocs: [
      'tdr',
      'note_methodo',
      'lettre_mission',
      'cadrage',
      'demarrage',
      'cap',
      'mi_parcours',
      'rapport_final',
      'tdr_simplifie',
      'ptba',
      'ptt',
      'slides_tdr',
      'slides_cadrage',
      'slides_demarrage',
      'slides_ptba',
      'slides_ptt',
      'slides_mi_parcours',
      'slides_evaluation_finale'
    ],
    associatedDocsLabels: 'Docs 2 (TDR), 3 (Note Méthodo), 4 (Lettre Mission), 5 (Cadrage), 6 (Démarrage), 7 (CAP), 8 (Mi-Parcours), 11 (Final), 15 (TDR Simplifiés), PTBA, PTT, Slides 16 à 22',
    columns: [
      { key: 'Code_WBS', label: '1. Code_WBS', inputType: 'text', placeholder: 'Ex: 1.1, T.1.1', minWidthPx: 95 },
      { key: 'Phase_Lot', label: '2. Phase_Lot', inputType: 'text', placeholder: 'Ex: AVANT PROJET', minWidthPx: 145 },
      { key: 'Intitule_Tache_Activite', label: '3. Intitule_Tache_Activite', inputType: 'textarea', placeholder: 'Intitulé de la tâche ou activité...', minWidthPx: 220 },
      { key: 'Taches_Predecesseurs', label: '4. Taches_Predecesseurs', inputType: 'text', placeholder: 'Ex: Aucun, T.1.1', minWidthPx: 120 },
      { key: 'Duree_Jours', label: '5. Duree_Jours', inputType: 'number', placeholder: 'Ex: 30', minWidthPx: 95, isRightAligned: true },
      { key: 'Date_Debut_Prevue', label: '6. Date_Debut_Prevue', inputType: 'date', minWidthPx: 135 },
      { key: 'Date_Fin_Prevue', label: '7. Date_Fin_Prevue', inputType: 'date', minWidthPx: 135 },
      { key: 'Date_Fin_Reelle', label: '8. Date_Fin_Reelle', inputType: 'date', minWidthPx: 135 },
      { key: 'Jalon_Associe', label: '9. Jalon_Associe', inputType: 'text', placeholder: 'Livrable ou jalon associé...', minWidthPx: 165 },
      {
        key: 'Chemin_Critique_PERT',
        label: '10. Chemin_Critique_PERT',
        inputType: 'select',
        options: ['Oui - Critique', 'Non - Marge libre'],
        minWidthPx: 150
      },
      { key: 'Valeur_Atteinte', label: '11. Valeur_Atteinte', inputType: 'number', placeholder: 'Ex: 100', minWidthPx: 110, isRightAligned: true },
      { key: 'Cible', label: '12. Cible', inputType: 'number', placeholder: 'Ex: 100', minWidthPx: 95, isRightAligned: true },
      {
        key: 'Taux_Avancement_%',
        label: '13. Taux_Avancement_% (Auto)',
        inputType: 'computed',
        helperFormula: '(Valeur_Atteinte / Cible) * 100',
        minWidthPx: 130,
        isRightAligned: true
      },
      {
        key: 'Statut_Execution',
        label: '14. Statut_Execution',
        inputType: 'select',
        options: ['Terminé', 'En cours', 'En retard', 'Non démarré'],
        minWidthPx: 135
      }
    ]
  },
  {
    id: 'M3',
    chipLabel: 'M3. RACI & RH',
    fullTitle: 'MATRICE M3 : GOUVERNANCE, RESPONSABILITÉS (RACI) & RESSOURCES HUMAINES (EXPERTS)',
    normativeRef: 'Matrice RACI Normée ISO 21500 & Référentiel des Experts Clés (TDR / ProDoc)',
    txtVariable: '[TXT_RACI_RH_M3]',
    associatedDocs: [
      'tdr',
      'note_methodo',
      'lettre_mission',
      'cadrage',
      'demarrage',
      'nda',
      'cv_executif',
      'cv_detaille',
      'tdr_simplifie',
      'ptba',
      'ptt',
      'slides_tdr',
      'slides_cadrage',
      'slides_demarrage',
      'slides_ptba',
      'slides_ptt'
    ],
    associatedDocsLabels: 'Docs 2 (TDR), 3 (Note Méthodo), 4 (Lettre Mission), 5 (Cadrage), 6 (Démarrage), 10 (NDA), 12 (CV Exécutif), 13 (CV Détaillé), 15 (TDR Simplifiés), PTBA, PTT, Slides 16 à 20',
    columns: [
      { key: 'Code_Acteur_Lot', label: '1. Code_Acteur_Lot', inputType: 'text', placeholder: 'Ex: EXP-01 / T.1.1', minWidthPx: 110 },
      { key: 'Domaine_Livrable_Activite', label: '2. Domaine_Livrable_Activite', inputType: 'textarea', placeholder: 'Activité ou lot sous responsabilité...', minWidthPx: 210 },
      { key: 'Role_Poste_Expert', label: '3. Role_Poste_Expert', inputType: 'text', placeholder: 'Ex: Chef de Mission / Architecte SI', minWidthPx: 165 },
      { key: 'Entite_Organisation', label: '4. Entite_Organisation', inputType: 'text', placeholder: 'Ex: UGP / Direction Générale', minWidthPx: 160 },
      { key: 'Qualification_Niveau', label: '5. Qualification_Niveau', inputType: 'text', placeholder: 'Ex: Bac+5 / PMP (10 ans exp.)', minWidthPx: 175 },
      { key: 'Charge_Homme_Jours', label: '6. Charge_Homme_Jours (H/J)', inputType: 'number', placeholder: 'Ex: 45', minWidthPx: 115, isRightAligned: true },
      { key: 'R_Realisateur', label: '7. R_Realisateur', inputType: 'text', placeholder: 'Responsable opérationnel (R)', minWidthPx: 145 },
      { key: 'A_Approbateur', label: '8. A_Approbateur', inputType: 'text', placeholder: 'Autorité de validation (A)', minWidthPx: 145 },
      { key: 'C_Consulte', label: '9. C_Consulte', inputType: 'text', placeholder: 'Expert consulté (C)', minWidthPx: 145 },
      { key: 'I_Informe', label: '10. I_Informe', inputType: 'text', placeholder: 'Partie informée (I)', minWidthPx: 145 }
    ]
  },
  {
    id: 'M4',
    chipLabel: 'M4. Parties Prenantes',
    fullTitle: 'MATRICE M4 : PARTIES PRENANTES, ENGAGEMENT & COMMUNICATION',
    normativeRef: 'Cartographie Pouvoir/Intérêt (PMBOK 7 / Normes d’Engagement des Parties Prenantes BM & PNUD)',
    txtVariable: '[TXT_PARTIES_PRENANTES_M4]',
    associatedDocs: [
      'cadrage',
      'demarrage',
      'grille_evaluation',
      'nda',
      'rapport_final',
      'pv_reunion',
      'ptba',
      'slides_cadrage',
      'slides_demarrage',
      'slides_ptba'
    ],
    associatedDocsLabels: 'Docs 5 (Cadrage), 6 (Démarrage), 9 (Grille OCDE), 10 (NDA), 11 (Final), 14 (PV de Réunion), PTBA, Slides 17, 18, 19',
    columns: [
      { key: 'Code_PP', label: '1. Code_PP', inputType: 'text', placeholder: 'Ex: PP-01', minWidthPx: 95 },
      { key: 'Nom_Institution_Groupe', label: '2. Nom_Institution_Groupe', inputType: 'text', placeholder: 'Nom de l’institution ou groupe...', minWidthPx: 185 },
      {
        key: 'Categorie_Acteur',
        label: '3. Categorie_Acteur',
        inputType: 'select',
        options: [
          'Bénéficiaires',
          'Interne',
          'Externe',
          'Prestataire',
          'Partenaire Financier',
          'Commanditaire',
          'Bailleur',
          "Agence d'exécution",
          'Autorité locale',
          'Société civile'
        ],
        minWidthPx: 160
      },

      { key: 'Role_Dans_Projet', label: '4. Role_Dans_Projet', inputType: 'textarea', placeholder: 'Rôle et prérogatives dans le projet...', minWidthPx: 195 },
      { key: 'Niveau_Pouvoir_1_5', label: '5. Niveau_Pouvoir (1-5)', inputType: 'select', options: ['5', '4', '3', '2', '1'], minWidthPx: 115, isRightAligned: true },
      { key: 'Niveau_Interet_1_5', label: '6. Niveau_Interet (1-5)', inputType: 'select', options: ['5', '4', '3', '2', '1'], minWidthPx: 115, isRightAligned: true },
      { key: 'Attentes_Enjeux_Majeurs', label: '7. Attentes_Enjeux_Majeurs', inputType: 'textarea', placeholder: 'Enjeux et attentes spécifiques...', minWidthPx: 200 },
      { key: 'Strategie_Engagement', label: '8. Strategie_Engagement', inputType: 'textarea', placeholder: 'Stratégie de mobilisation et concertation...', minWidthPx: 195 },
      { key: 'Canal_Frequence_Comm', label: '9. Canal_Frequence_Comm', inputType: 'text', placeholder: 'Ex: COPIL Mensuel / Rapports CAP', minWidthPx: 170 }
    ]
  },
  {
    id: 'M5',
    chipLabel: 'M5. Budget & EVM',
    fullTitle: 'MATRICE M5 : BUDGET ANALYTIQUE, EXÉCUTION FINANCIÈRE & VALEUR ACQUISE (EVM)',
    normativeRef: 'Gestion de la Valeur Acquise (Earned Value Management - BAC, EV, AC, CV, CPI) & Suivi PTBA',
    txtVariable: '[TXT_BUDGET_EVM_M5]',
    associatedDocs: [
      'tdr',
      'lettre_mission',
      'cadrage',
      'demarrage',
      'cap',
      'mi_parcours',
      'rapport_final',
      'cv_executif',
      'cv_detaille',
      'tdr_simplifie',
      'ptba',
      'ptt',
      'slides_tdr',
      'slides_cadrage',
      'slides_demarrage',
      'slides_ptba',
      'slides_ptt',
      'slides_mi_parcours',
      'slides_evaluation_finale'
    ],
    associatedDocsLabels: 'Docs 2 (TDR), 4 (Lettre Mission), 5 (Cadrage), 6 (Démarrage), 7 (CAP), 8 (Mi-Parcours), 11 (Final), 12 (CV Exécutif), 13 (CV Détaillé), 15 (TDR Simplifiés), PTBA, PTT, Slides 16 à 22',
    columns: [
      { key: 'Code_Ligne_Budget', label: '1. Code_Ligne_Budget', inputType: 'text', placeholder: 'Ex:LB-01', minWidthPx: 110 },
      { key: 'Rubrique_Activite_PTBA', label: '2. Rubrique_Activite_PTBA', inputType: 'textarea', placeholder: 'Intitulé de la ligne budgétaire PTBA...', minWidthPx: 210 },
      { key: 'Source_Financement', label: '3. Source_Financement', inputType: 'text', placeholder: 'Ex: Bailleur / État / Fonds Propres', minWidthPx: 155 },
      { key: 'Unite', label: '4. Unite', inputType: 'select', options: ['Forfait', 'H/J', 'Kit', 'Mois', 'Lot'], minWidthPx: 100 },
      { key: 'Quantite', label: '5. Quantite', inputType: 'number', placeholder: 'Ex: 1', minWidthPx: 90, isRightAligned: true },
      { key: 'Cout_Unitaire', label: '6. Cout_Unitaire', inputType: 'number', placeholder: 'Montant unitaire', minWidthPx: 125, isRightAligned: true },
      { key: 'Budget_Initial_BAC', label: '7. Budget_Initial_BAC', inputType: 'number', placeholder: 'Budget voté (BAC)', minWidthPx: 135, isRightAligned: true },
      { key: 'Budget_Engage', label: '8. Budget_Engage', inputType: 'number', placeholder: 'Montant engagé', minWidthPx: 130, isRightAligned: true },
      { key: 'Cout_Reel_AC', label: '9. Cout_Reel_AC (Décaissé)', inputType: 'number', placeholder: 'Décaissé réel (AC)', minWidthPx: 135, isRightAligned: true },
      { key: 'Valeur_Acquise_EV', label: '10. Valeur_Acquise_EV', inputType: 'number', placeholder: 'Valeur acquise (EV)', minWidthPx: 135, isRightAligned: true },
      {
        key: 'Ecart_Cout_CV',
        label: '11. Ecart_Cout_CV (EV-AC)',
        inputType: 'computed',
        helperFormula: 'EV - AC',
        minWidthPx: 130,
        isRightAligned: true
      },
      {
        key: 'Taux_Decaissement_%',
        label: '12. Taux_Decaissement_% (Auto)',
        inputType: 'computed',
        helperFormula: '(Cout_Reel_AC / Budget_Initial_BAC) * 100',
        minWidthPx: 135,
        isRightAligned: true
      },
      {
        key: 'Indice_CPI',
        label: '13. Indice_CPI (Auto)',
        inputType: 'computed',
        helperFormula: 'Valeur_Acquise_EV / Cout_Reel_AC',
        minWidthPx: 115,
        isRightAligned: true
      }
    ]
  },
  {
    id: 'M6',
    chipLabel: 'M6. Grille OCDE',
    fullTitle: "MATRICE M6 : GRILLE D'ÉVALUATION INTERNATIONALE (6 CRITÈRES OCDE/CAD & UNEG)",
    normativeRef: 'Réseau OCDE/CAD (6 Critères), Normes UNEG & Système GEROS (Triangulation 3 Niveaux)',
    txtVariable: '[TXT_GRILLE_OCDE_M6]',
    associatedDocs: [
      'note_methodo',
      'mi_parcours',
      'grille_evaluation',
      'rapport_final',
      'slides_cadrage',
      'slides_demarrage',
      'slides_mi_parcours',
      'slides_evaluation_finale'
    ],
    associatedDocsLabels: 'Docs 3 (Note Méthodo), 8 (Mi-Parcours), 9 (Grille OCDE), 11 (Final), Slides 17, 18, 21, 22',
    columns: [
      { key: 'Code_QE', label: '1. Code_QE', inputType: 'text', placeholder: 'Ex: QE-1.1', minWidthPx: 95 },
      {
        key: 'Critere_OCDE_CAD',
        label: '2. Critere_OCDE_CAD',
        inputType: 'select',
        options: ['Pertinence', 'Cohérence', 'Efficacité', 'Efficience', 'Impact', 'Durabilité'],
        minWidthPx: 135
      },
      { key: 'Poids_Critere_%', label: '3. Poids_Critere_%', inputType: 'text', placeholder: 'Ex: 15%', minWidthPx: 105, isRightAligned: true },
      { key: 'Question_Evaluative_Principale', label: '4. Question_Evaluative_Principale', inputType: 'textarea', placeholder: 'Question évaluative centrale...', minWidthPx: 225 },
      { key: 'Sous_Questions_Jugement', label: '5. Sous_Questions_Jugement', inputType: 'textarea', placeholder: 'Critères de jugement et sous-questions...', minWidthPx: 200 },
      { key: 'Indicateur_Reponse', label: '6. Indicateur_Reponse', inputType: 'textarea', placeholder: 'Indicateur SMART de réponse...', minWidthPx: 185 },
      { key: 'Sources_Triangulation_3_Niveaux', label: '7. Sources_Triangulation_3_Niveaux', inputType: 'textarea', placeholder: '1. Doc | 2. Quantitatif | 3. Qualitatif', minWidthPx: 215 },
      { key: 'Methode_Outil_Collecte', label: '8. Methode_Outil_Collecte', inputType: 'text', placeholder: 'Revue doc, KII, Focus Group, Audit...', minWidthPx: 170 },
      { key: 'Cible_Repondants', label: '9. Cible_Repondants', inputType: 'text', placeholder: 'COPIL, UGP, Bénéficiaires, PTF...', minWidthPx: 160 },
      { key: 'Score_1_a_5', label: '10. Score_1_a_5', inputType: 'select', options: ['5', '4', '3', '2', '1'], minWidthPx: 100, isRightAligned: true },
      {
        key: 'Appreciation_Normative',
        label: '11. Appreciation_Normative',
        inputType: 'select',
        options: ['Très satisfaisant', 'Satisfaisant', 'Moyen', 'Insuffisant', 'Critique'],
        minWidthPx: 150
      }
    ]
  },
  {
    id: 'M7',
    chipLabel: 'M7. Risques RAID',
    fullTitle: 'MATRICE M7 : REGISTRE DES RISQUES, HYPOTHÈSES, PROBLÈMES & DÉPENDANCES (BOARD RAID)',
    normativeRef: 'ISO 31000 / PMBOK 7 (Risks, Assumptions, Issues, Dependencies & Biais UNEG)',
    txtVariable: '[TXT_RISQUES_RAID_M7]',
    associatedDocs: [
      'note_methodo',
      'cadrage',
      'demarrage',
      'cap',
      'mi_parcours',
      'grille_evaluation',
      'nda',
      'rapport_final',
      'pv_reunion',
      'ptba',
      'ptt',
      'slides_cadrage',
      'slides_demarrage',
      'slides_ptba',
      'slides_ptt',
      'slides_mi_parcours',
      'slides_evaluation_finale'
    ],
    associatedDocsLabels: 'Docs 3 (Note Méthodo), 5 (Cadrage), 6 (Démarrage), 7 (CAP), 8 (Mi-Parcours), 9 (Grille OCDE), 10 (NDA), 11 (Final), 14 (PV de Réunion), PTBA, PTT, Slides 17 à 22',
    columns: [
      { key: 'Code_RAID', label: '1. Code_RAID', inputType: 'text', placeholder: 'Ex: R-01, I-02', minWidthPx: 95 },
      {
        key: 'Type_Element',
        label: '2. Type_Element',
        inputType: 'select',
        options: [
          'Risque',
          'Hypothèse',
          'Problème / Issue',
          'Dépendance',
          'Biais méthodologique',
          'Risque Sécurité'
        ],
        minWidthPx: 155
      },
      { key: 'Categorie', label: '3. Categorie', inputType: 'text', placeholder: 'Opérationnel, Financier, Fiduciaire...', minWidthPx: 145 },
      { key: 'Description_Precise', label: '4. Description_Precise', inputType: 'textarea', placeholder: 'Description précise du risque ou problème...', minWidthPx: 215 },
      { key: 'Cause_Racine', label: '5. Cause_Racine', inputType: 'textarea', placeholder: 'Facteur déclencheur / cause racine...', minWidthPx: 185 },
      { key: 'Consequence_Impact_Projet', label: '6. Consequence_Impact_Projet', inputType: 'textarea', placeholder: 'Effet potentiel sur délais/coûts/qualité...', minWidthPx: 190 },
      { key: 'Probabilite_1_5', label: '7. Probabilite (1-5)', inputType: 'select', options: ['1', '2', '3', '4', '5'], minWidthPx: 110, isRightAligned: true },
      { key: 'Impact_1_5', label: '8. Impact (1-5)', inputType: 'select', options: ['1', '2', '3', '4', '5'], minWidthPx: 105, isRightAligned: true },
      {
        key: 'Criticite_PxI',
        label: '9. Criticite_PxI (Auto)',
        inputType: 'computed',
        helperFormula: 'Probabilite_1_5 * Impact_1_5',
        minWidthPx: 135,
        isRightAligned: true
      },
      {
        key: 'Strategie_Reponse',
        label: '10. Strategie_Reponse',
        inputType: 'select',
        options: ['Atténuer', 'Éviter', 'Transférer', 'Accepter', 'Escalader'],
        minWidthPx: 135
      },
      { key: 'Plan_Action_Mitigation', label: '11. Plan_Action_Mitigation', inputType: 'textarea', placeholder: 'Mesures préventives et correctives...', minWidthPx: 215 },
      { key: 'Proprietaire_Risque', label: '12. Proprietaire_Risque', inputType: 'text', placeholder: 'Responsable du suivi...', minWidthPx: 145 },
      {
        key: 'Statut_RAID',
        label: '13. Statut_RAID',
        inputType: 'select',
        options: ['Ouvert', 'Sous contrôle', 'Fermé'],
        minWidthPx: 125
      }
    ]
  },
  {
    id: 'M8',
    chipLabel: 'M8. Marchés PPM',
    fullTitle: 'MATRICE M8 : PLAN DE PASSATION DES MARCHÉS (PPM) & LOGISTIQUE',
    normativeRef: 'Directives de Passation des Marchés Banque Mondiale / BAD / UE & Code des Marchés Publics',
    txtVariable: '[TXT_MARCHES_PPM_M8]',
    associatedDocs: ['cadrage', 'mi_parcours', 'rapport_final', 'ptba', 'slides_cadrage', 'slides_ptba', 'slides_mi_parcours', 'slides_evaluation_finale'],
    associatedDocsLabels: 'Docs 5 (Cadrage / ProDoc), 8 (Mi-Parcours), 11 (Final), PTBA, Slides 17, 19, 21, 22',
    columns: [
      { key: 'Code_Marche', label: '1. Code_Marche', inputType: 'text', placeholder: 'Ex: PPM-2026-01', minWidthPx: 110 },
      { key: 'Designation_Acquisition', label: '2. Designation_Acquisition', inputType: 'textarea', placeholder: 'Intitulé du marché ou acquisition...', minWidthPx: 215 },
      {
        key: 'Categorie_Marche',
        label: '3. Categorie_Marche',
        inputType: 'select',
        options: [
          'Travaux',
          'Fournitures / Équipements',
          'Services de Consultants',
          'Services Courants'
        ],
        minWidthPx: 165
      },
      {
        key: 'Mode_Passation',
        label: '4. Mode_Passation',
        inputType: 'select',
        options: [
          'AON',
          'AOI',
          'Consultation Restreinte',
          'Entente Directe',
          'Demande de Cotation'
        ],
        minWidthPx: 160
      },
      {
        key: 'Revue_Bailleur',
        label: '5. Revue_Bailleur',
        inputType: 'select',
        options: ['Revue a priori / ANO', 'Revue a posteriori'],
        minWidthPx: 155
      },
      { key: 'Montant_Estime', label: '6. Montant_Estime', inputType: 'number', placeholder: 'Montant estimatif', minWidthPx: 135, isRightAligned: true },
      { key: 'Montant_Contractuel_Reel', label: '7. Montant_Contractuel_Reel', inputType: 'number', placeholder: 'Montant signé', minWidthPx: 145, isRightAligned: true },
      { key: 'Date_Lancement_DAO', label: '8. Date_Lancement_DAO', inputType: 'date', minWidthPx: 135 },
      { key: 'Date_Attribution_Signature', label: '9. Date_Attribution_Signature', inputType: 'date', minWidthPx: 145 },
      { key: 'Date_Reception_Prevue_Reelle', label: '10. Date_Reception_Prevue_Reelle', inputType: 'date', minWidthPx: 145 },
      {
        key: 'Statut_Marche',
        label: '11. Statut_Marche',
        inputType: 'select',
        options: ['Planifié', 'En cours', 'Attribué', 'Exécuté / Réceptionné'],
        minWidthPx: 155
      }
    ]
  },
  {
    id: 'M9',
    chipLabel: 'M9. Qualité & Livrables',
    fullTitle: "MATRICE M9 : LIVRABLES CONTRACTUELS, ASSURANCE QUALITÉ & CRITÈRES D'ACCEPTATION",
    normativeRef: 'Assurance Qualité ISO 9001 / ISO 21500, Normes UNEG & Conditionnalités de Décaissement',
    txtVariable: '[TXT_QUALITE_LIVRABLES_M9]',
    associatedDocs: [
      'tdr',
      'lettre_mission',
      'cadrage',
      'demarrage',
      'cap',
      'mi_parcours',
      'nda',
      'rapport_final',
      'cv_detaille',
      'tdr_simplifie',
      'ptba',
      'ptt',
      'slides_tdr',
      'slides_cadrage',
      'slides_demarrage',
      'slides_ptba',
      'slides_ptt',
      'slides_mi_parcours',
      'slides_evaluation_finale'
    ],
    associatedDocsLabels: 'Docs 2 (TDR), 4 (Lettre Mission), 5 (Cadrage), 6 (Démarrage), 7 (CAP), 8 (Mi-Parcours), 10 (NDA), 11 (Final), 13 (CV Détaillé), 15 (TDR Simplifiés), PTBA, PTT, Slides 16 à 22',
    columns: [
      { key: 'Code_Livrable', label: '1. Code_Livrable', inputType: 'text', placeholder: 'Ex: LIV-01', minWidthPx: 100 },
      { key: 'Intitule_Livrable_Actif', label: '2. Intitule_Livrable_Actif', inputType: 'textarea', placeholder: 'Nom du livrable ou actif documentaire...', minWidthPx: 210 },
      { key: 'Description_Format_Attendu', label: '3. Description_Format_Attendu', inputType: 'text', placeholder: 'Ex: Rapport PDF A4 + Base JSON signée', minWidthPx: 185 },
      { key: 'Date_Echeance_Prevue', label: '4. Date_Echeance_Prevue', inputType: 'date', minWidthPx: 135 },
      { key: 'Date_Remise_Reelle', label: '5. Date_Remise_Reelle', inputType: 'date', minWidthPx: 135 },
      { key: 'Criteres_Qualite_Acceptation', label: '6. Criteres_Qualite_Acceptation', inputType: 'textarea', placeholder: 'Critères normatifs ISO/UNEG/TDR...', minWidthPx: 205 },
      { key: 'Instance_Approbation', label: '7. Instance_Approbation', inputType: 'text', placeholder: 'Ex: COPIL / Comité Technique', minWidthPx: 160 },
      { key: 'Tranche_Paiement_Associee_%', label: '8. Tranche_Paiement_%', inputType: 'text', placeholder: 'Ex: 20%', minWidthPx: 120, isRightAligned: true },
      {
        key: 'Statut_Validation',
        label: '9. Statut_Validation',
        inputType: 'select',
        options: [
          'Validé sans réserve',
          'Validé sous réserve',
          'En révision',
          'En attente',
          'Rejeté'
        ],
        minWidthPx: 155
      }
    ]
  },
  {
    id: 'M10',
    chipLabel: 'M10. Capitalisation & Réponse',
    fullTitle: "MATRICE M10 : CAPITALISATION, PLAN D'ACTION CORRECTIF (CAP) & RÉPONSE MANAGÉRIALE",
    normativeRef: 'Management Response Matrix (PNUD / UNEG / Banque Mondiale) & Prescriptions CAP',
    txtVariable: '[TXT_CAPITALISATION_M10]',
    associatedDocs: ['cap', 'mi_parcours', 'rapport_final', 'pv_reunion', 'slides_mi_parcours', 'slides_evaluation_finale'],
    associatedDocsLabels: 'Docs 7 (Rapport CAP), 8 (Évaluation Mi-Parcours), 11 (Évaluation Finale & Clôture), 14 (PV de Réunion), Slides 21 & 22',
    columns: [
      { key: 'Code_Action_Rec', label: '1. Code_Action_Rec', inputType: 'text', placeholder: 'Ex: REC-01 / CAP-01', minWidthPx: 110 },
      { key: 'Constat_Ecart_Lecon_Identifiee', label: '2. Constat_Ecart_Lecon_Identifiee', inputType: 'textarea', placeholder: 'Constat factuel, écart ou leçon apprise...', minWidthPx: 215 },
      { key: 'Analyse_Causale_Synthetique', label: '3. Analyse_Causale_Synthetique', inputType: 'textarea', placeholder: 'Cause racine du constat ou glissement...', minWidthPx: 200 },
      { key: 'Recommandation_Prescription_Action', label: '4. Recommandation_Prescription_Action', inputType: 'textarea', placeholder: 'Prescription corrective ou décision managériale...', minWidthPx: 225 },
      {
        key: 'Priorite',
        label: '5. Priorite',
        inputType: 'select',
        options: ['Critique / Urgente', 'Haute', 'Moyenne'],
        minWidthPx: 145
      },
      { key: 'Indicateur_Verif_Mise_En_Oeuvre', label: '6. Indicateur_Verif_Mise_En_Oeuvre', inputType: 'text', placeholder: 'Preuve de levée de réserve / PV...', minWidthPx: 185 },
      { key: 'Responsable_Execution', label: '7. Responsable_Execution', inputType: 'text', placeholder: 'Acteur chargé de l’action...', minWidthPx: 155 },
      { key: 'Echeance_Cible', label: '8. Echeance_Cible', inputType: 'date', minWidthPx: 135 },
      { key: 'Budget_Additionnel_Requis', label: '9. Budget_Additionnel_Requis', inputType: 'number', placeholder: '0', minWidthPx: 140, isRightAligned: true },
      {
        key: 'Statut_Mise_En_Oeuvre',
        label: '10. Statut_Mise_En_Oeuvre',
        inputType: 'select',
        options: ['Réalisé', 'En cours', 'Non échu', 'En retard'],
        minWidthPx: 135
      }
    ]
  }
];

export const DOC_TO_MATRICES_MAP: Record<InstitutionalDocType, MasterMatrixId[]> = {
  courrier_admin: [], // Doc 1 : Aucune matrice lourde (1 page stricte)
  tdr: ['M2', 'M3', 'M5', 'M9'], // Doc 2
  note_methodo: ['M1', 'M2', 'M3', 'M6', 'M7'], // Doc 3
  lettre_mission: ['M2', 'M3', 'M5', 'M9'], // Doc 4
  cadrage: ['M1', 'M2', 'M3', 'M4', 'M5', 'M7', 'M8', 'M9'], // Doc 5
  demarrage: ['M1', 'M2', 'M3', 'M4', 'M5', 'M7', 'M9'], // Doc 6
  cap: ['M1', 'M2', 'M5', 'M7', 'M9', 'M10'], // Doc 7
  mi_parcours: ['M1', 'M2', 'M5', 'M6', 'M7', 'M8', 'M9', 'M10'], // Doc 8
  grille_evaluation: ['M1', 'M4', 'M6', 'M7'], // Doc 9
  nda: ['M3', 'M4', 'M7', 'M9'], // Doc 10
  rapport_final: ['M1', 'M2', 'M4', 'M5', 'M6', 'M7', 'M8', 'M9', 'M10'], // Doc 11
  cv_executif: ['M3', 'M1', 'M5'], // Doc 12 : CV Professionnel Exécutif (1 page)
  cv_detaille: ['M3', 'M1', 'M5', 'M9'], // Doc 13 : CV Professionnel Détaillé Bailleurs (2 à 4 pages)
  pv_reunion: ['M4', 'M7', 'M10'], // Doc 14 : Procès-Verbal Officiel de Réunion (1 à 2 pages)
  tdr_simplifie: ['M2', 'M3', 'M5', 'M9'], // Doc 15 : TDR Simplifiés avec Tableaux (1 à 3 pages)
  ptba: ['M1', 'M2', 'M3', 'M4', 'M5', 'M7', 'M8', 'M9'], // Doc 16 : Plan de Travail et Budget Annuel (PTBA - 8 matrices)
  ptt: ['M2', 'M3', 'M5', 'M7', 'M9'], // Doc 17 : Plan de Travail Trimestriel (PTT - 5 matrices)
  slides_tdr: ['M1', 'M2', 'M3', 'M5', 'M9'], // 16. Présentation du Programme (basée sur les TDR)
  slides_cadrage: ['M1', 'M2', 'M3', 'M4', 'M5', 'M7', 'M8', 'M9'], // 17. Présentation du Rapport de Cadrage
  slides_demarrage: ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M9'], // 18. Présentation du Rapport de Démarrage (Inception)
  slides_ptba: ['M1', 'M2', 'M3', 'M4', 'M5', 'M7', 'M8', 'M9'], // 19. Présentation du PTBA (Plan de Travail et Budget Annuel)
  slides_ptt: ['M2', 'M3', 'M5', 'M7', 'M9'], // 20. Présentation du PTT (Plan de Travail Trimestriel)
  slides_mi_parcours: ['M1', 'M2', 'M5', 'M6', 'M7', 'M8', 'M9', 'M10'], // 21. Présentation de l'Évaluation à Mi-Parcours
  slides_evaluation_finale: ['M1', 'M2', 'M4', 'M5', 'M6', 'M7', 'M8', 'M9', 'M10'] // 22. Présentation de l'Évaluation Finale & Clôture
};

export function getMatrixDefinition(id: MasterMatrixId): MasterMatrixDefinition {
  return MASTER_MATRICES_DEFINITIONS.find(m => m.id === id) || MASTER_MATRICES_DEFINITIONS[0];
}

export function createEmptyMatrixRow(matrixId: MasterMatrixId, index: number): MatrixRowData {
  const def = getMatrixDefinition(matrixId);
  const row: MatrixRowData = {};
  def.columns.forEach(col => {
    if (col.inputType === 'select' && col.options && col.options.length > 0) {
      row[col.key] = col.options[0];
    } else if (col.key.startsWith('Code_')) {
      row[col.key] = `${matrixId}-${String(index + 1).padStart(2, '0')}`;
    } else {
      row[col.key] = '';
    }
  });
  return computeMatrixRowCalculations(matrixId, row);
}

export interface ProgramRaciContext {
  intervenesAsProgramActor: boolean;
  hasRaciActors: boolean;
  hasAnyRaciActor: boolean;
  rActors: string[];
  aActors: string[];
  cActors: string[];
  iActors: string[];
  allRaciActors: string[];
  rList: string[];
  aList: string[];
  cList: string[];
  iList: string[];
  allActors: string[];
  internalOnlyActors: string[];
  categorizedActors: CategorizedActor[];
  effectiveLeadName: string;
  effectiveLeadRole: string;
  leadActorName: string;
  leadActorRole: string;
  effectiveAuthorityName: string;
  effectiveConsultedList: string;
  effectiveInformedList: string;
  primaryR: string;
  primaryA: string;
  primaryC: string;
  primaryI: string;
}

/**
 * Analyse les acteurs renseignés dans l'onglet RACI et l'onglet Catégorie du programme sélectionné.
 * - S'il n'y a aucun acteur renseigné dans RACI, ce sont les informations du Profil Utilisateur qui s'affichent par défaut.
 * - Fournit également la liste stricte des acteurs classés « Interne » pour le filtrage exclusif des CV, Cartes de Visite et Badges.
 */
export function resolveProgramRaciContext(
  dossier: Dossier,
  userProfile: UserProfile
): ProgramRaciContext {
  const isNeantVal = (v?: string): boolean => {
    const clean = (v || '').trim().toLowerCase();
    return clean === 'néant' || clean === 'neant' || clean === 'none';
  };

  const splitActors = (raw?: string): string[] => {
    if (!raw) return [];
    return raw
      .split(',')
      .map(s => s.trim())
      .filter(s => s.length > 0 && s !== '—' && !isNeantVal(s));
  };

  const rSet = new Set<string>();
  const aSet = new Set<string>();
  const cSet = new Set<string>();
  const iSet = new Set<string>();

  (dossier.axes || []).forEach(axe => {
    (axe.projects || []).forEach(proj => {
      (proj.tasks || []).forEach(tk => {
        splitActors(tk.raciR || tk.responsabilite || tk.assignee).forEach(x =>
          rSet.add(x)
        );
        splitActors(tk.raciA || tk.autorite).forEach(x => aSet.add(x));
        splitActors(tk.raciC || tk.consulte).forEach(x => cSet.add(x));
        splitActors(tk.raciI || tk.informe).forEach(x => iSet.add(x));
      });
    });
  });

  const categorizedActors = ensureDossierCategorizedActors(dossier, userProfile);
  categorizedActors.forEach(catAct => {
    if (catAct.raciRoles?.includes('R')) rSet.add(catAct.name);
    if (catAct.raciRoles?.includes('A')) aSet.add(catAct.name);
    if (catAct.raciRoles?.includes('C')) cSet.add(catAct.name);
    if (catAct.raciRoles?.includes('I')) iSet.add(catAct.name);
  });

  const internalOnlySet = new Set<string>();
  categorizedActors
    .filter(a => a.category === 'Interne')
    .forEach(a => internalOnlySet.add(a.name));
  const internalOnlyActors = Array.from(internalOnlySet);

  const rActors = Array.from(rSet);
  const aActors = Array.from(aSet);
  const cActors = Array.from(cSet);
  const iActors = Array.from(iSet);
  const allSet = new Set<string>([...rActors, ...aActors, ...cActors, ...iActors]);
  const allRaciActors = Array.from(allSet);
  const hasRaciActors = allRaciActors.length > 0;

  const defaultUserName = userProfile.fullName || 'Coordonnateur Général PMO';
  const defaultUserRole =
    userProfile.role || 'Spécialiste en Gestion de Projet & Pilotage Stratégique';

  const userIntervenes = userProfile.intervenesAsProgramActor !== false;

  const effectiveLeadName = !hasRaciActors
    ? defaultUserName
    : userIntervenes
    ? defaultUserName
    : internalOnlyActors[0] || rActors[0] || aActors[0] || defaultUserName;

  const effectiveLeadRole = !hasRaciActors
    ? defaultUserRole
    : userIntervenes
    ? defaultUserRole
    : rActors[0]
    ? 'Responsable Opérationnel du Programme (RACI-R)'
    : aActors[0]
    ? 'Autorité d’Approbation du Programme (RACI-A)'
    : defaultUserRole;

  const effectiveAuthorityName =
    aActors[0] || defaultUserName || 'Président du Comité de Pilotage (COPIL)';
  const effectiveConsultedList =
    cActors.join(', ') || `${defaultUserName} (${defaultUserRole})`;
  const effectiveInformedList =
    iActors.join(', ') ||
    userProfile.institution ||
    dossier.institution ||
    defaultUserName;

  const primaryR = rActors[0] || effectiveLeadName;
  const primaryA = effectiveAuthorityName;
  const primaryC = cActors[0] || defaultUserName;
  const primaryI = iActors[0] || userProfile.institution || dossier.institution || defaultUserName;

  return {
    intervenesAsProgramActor: userIntervenes,
    hasRaciActors,
    hasAnyRaciActor: hasRaciActors,
    rActors,
    aActors,
    cActors,
    iActors,
    allRaciActors,
    rList: rActors,
    aList: aActors,
    cList: cActors,
    iList: iActors,
    allActors: allRaciActors,
    internalOnlyActors,
    categorizedActors,
    effectiveLeadName,
    effectiveLeadRole,
    leadActorName: effectiveLeadName,
    leadActorRole: effectiveLeadRole,
    effectiveAuthorityName,
    effectiveConsultedList,
    effectiveInformedList,
    primaryR,
    primaryA,
    primaryC,
    primaryI
  };
}


/**
 * Pré-remplit automatiquement les 10 Matrices Maîtresses (M1 à M10)
 * à partir des données réelles du Dossier actif, des onglets Planification,
 * Suivi des tâches et RACI, du Réseau PERT et du Profil Utilisateur.
 */
export function buildDefaultMatricesFromApp(
  dossier: Dossier,
  fields: CustomDocFields,
  userProfile: UserProfile,
  currency: CurrencyCode = 'FCFA',
  lang: LanguageCode = 'FR'
): AllMatricesData {
  const todayISO = getTodayISO();
  const pertSummaries = computeDossierPertSummary(dossier, todayISO);
  const allNodes = pertSummaries.flatMap(p => p.nodes);
  const nodeMap = new Map(allNodes.map(n => [n.id, n]));
  const raciCtx = resolveProgramRaciContext(dossier, userProfile);

  const orgName =
    dossier.institution ||
    userProfile.institution ||
    'Direction Générale de la Stratégie & Pilotage';
  const donorName =
    fields.recipientOrg ||
    dossier.institution ||
    'Partenaires Techniques et Financiers (PNUD / BM / UE)';
  const leadName = raciCtx.effectiveLeadName;
  const recipientRep =
    fields.recipientRepresentative || raciCtx.effectiveAuthorityName;

  let totalTasks = 0;
  let completedTasks = 0;
  let inProgressTasks = 0;
  let blockedTasks = 0;
  let delayedTasks = 0;
  let totalBudgetFCFA = 0;
  let completedBudgetFCFA = 0;
  let inProgressBudgetFCFA = 0;

  const m1Rows: MatrixRowData[] = [];
  const m2Rows: MatrixRowData[] = [];
  const m3Rows: MatrixRowData[] = [];
  const m4Rows: MatrixRowData[] = [];
  const m5Rows: MatrixRowData[] = [];
  const m6Rows: MatrixRowData[] = [];
  const m7Rows: MatrixRowData[] = [];
  const m8Rows: MatrixRowData[] = [];
  const m9Rows: MatrixRowData[] = [];
  const m10Rows: MatrixRowData[] = [];

  const uniqueAssignees = new Set<string>(raciCtx.rActors);
  const uniqueAuthorities = new Set<string>(raciCtx.aActors);

  (dossier.axes || []).forEach((axe, aIdx) => {
    (axe.projects || []).forEach((proj, pIdx) => {
      const codeMap = new Map<string, string>();
      STANDARD_PHASES.forEach((pName, phIdx) => {
        const pTasks = (proj.tasks || []).filter(tk => tk.phase === pName);
        pTasks.forEach((tk, tIdx) => {
          codeMap.set(tk.id, `${tk.type === 'jalon' ? 'J' : 'T'}.${phIdx + 1}.${tIdx + 1}`);
        });
      });

      (proj.tasks || []).forEach((task, tIdx) => {
        totalTasks++;
        const metrics = computeTaskMetrics(task, todayISO);
        const pertNode = nodeMap.get(task.id);
        const b = Number(task.budget) || 0;
        totalBudgetFCFA += b;

        const taskR = (task.assignee || '').trim() || leadName;
        const taskA = (task.autorite || '').trim() || raciCtx.effectiveAuthorityName;
        const taskC = (task.consulte || '').trim() || raciCtx.effectiveConsultedList;
        const taskI = (task.informe || '').trim() || raciCtx.effectiveInformedList;
        const taskLivrable =
          (task.livrable || '').trim() || `Livrable de l’activité ${task.name}`;

        let valAtteinte = 0;
        let statutM2 = 'Non démarré';
        let acTask = 0;
        let evTask = 0;

        if (metrics.effectiveStatus === 'Terminé') {
          completedTasks++;
          completedBudgetFCFA += b;
          valAtteinte = 100;
          statutM2 = 'Terminé';
          acTask = b;
          evTask = b;
        } else if (metrics.effectiveStatus === 'En cours') {
          inProgressTasks++;
          inProgressBudgetFCFA += b;
          valAtteinte = 55;
          statutM2 = metrics.ecartFinDays > 0 ? 'En retard' : 'En cours';
          acTask = Math.round(b * 0.6);
          evTask = Math.round(b * 0.55);
        } else if (metrics.effectiveStatus === 'Bloqué') {
          blockedTasks++;
          valAtteinte = 20;
          statutM2 = 'En retard';
          acTask = Math.round(b * 0.25);
          evTask = Math.round(b * 0.2);
        } else {
          valAtteinte = 0;
          statutM2 = metrics.ecartDebutDays > 0 ? 'En retard' : 'Non démarré';
          acTask = 0;
          evTask = 0;
        }

        if (metrics.ecartDebutDays > 0 || metrics.ecartFinDays > 0) {
          delayedTasks++;
        }

        const code =
          codeMap.get(task.id) || `${task.type === 'jalon' ? 'J' : 'T'}.${aIdx + 1}.${tIdx + 1}`;
        const antCode =
          task.antecedent && task.antecedent !== '—'
            ? codeMap.get(task.antecedent) || task.antecedent
            : 'Aucun';
        const durationDays = pertNode?.duration || Math.max(1, metrics.plannedDurationDays || 10);
        const hjAllocated = Math.max(1, Math.round(durationDays * 0.8));

        // M2: WBS, Chronogramme Gantt, Chemin Critique PERT & PTBA (synchronisé avec Planification & Suivi des tâches)
        m2Rows.push(
          computeMatrixRowCalculations('M2', {
            Code_WBS: code,
            Phase_Lot: task.phase || 'EXÉCUTION & SUIVI',
            Intitule_Tache_Activite: task.name,
            Taches_Predecesseurs: antCode,
            Duree_Jours: String(durationDays),
            Date_Debut_Prevue: task.startDate || todayISO,
            Date_Fin_Prevue: task.endDate || todayISO,
            Date_Fin_Reelle:
              metrics.effectiveStatus === 'Terminé'
                ? metrics.effectiveActualEndDate
                : '',
            Jalon_Associe: taskLivrable,
            Chemin_Critique_PERT: pertNode?.isCritical ? 'Oui - Critique' : 'Non - Marge libre',
            Valeur_Atteinte: String(valAtteinte),
            Cible: '100',
            'Taux_Avancement_%': `${valAtteinte}%`,
            Statut_Execution: statutM2
          })
        );

        // M3: Gouvernance RACI & Ressources Humaines (synchronisé avec l'onglet RACI / Profil Utilisateur par défaut)
        m3Rows.push({
          Code_Acteur_Lot: `RH-${code}`,
          Domaine_Livrable_Activite: `${task.name} (${taskLivrable})`,
          Role_Poste_Expert:
            task.responsabilite ||
            (taskR === userProfile.fullName
              ? userProfile.role
              : 'Expert Technique / Responsable Opérationnel'),
          Entite_Organisation: orgName,
          Qualification_Niveau:
            userProfile.cvCertifications ||
            'Bac+5 / Ingénieur ou Expert Senior (7+ ans exp.)',
          Charge_Homme_Jours: String(hjAllocated),
          R_Realisateur: taskR,
          A_Approbateur: taskA,
          C_Consulte: taskC,
          I_Informe: taskI
        });

        // M5: Budget Analytique, Exécution Financière & EVM (synchronisé avec Planification & Suivi des tâches)
        const engageTask =
          metrics.effectiveStatus === 'Terminé'
            ? b
            : metrics.effectiveStatus === 'En cours'
            ? Math.round(b * 0.8)
            : metrics.effectiveStatus === 'Bloqué'
            ? Math.round(b * 0.4)
            : 0;
        m5Rows.push(
          computeMatrixRowCalculations('M5', {
            Code_Ligne_Budget: `PTBA-${aIdx + 1}.${pIdx + 1}.${tIdx + 1}`,
            Rubrique_Activite_PTBA: `${proj.name} — ${task.name}`,
            Source_Financement: donorName,
            Unite: task.type === 'jalon' ? 'Forfait' : 'Lot',
            Quantite: '1',
            Cout_Unitaire: String(b),
            Budget_Initial_BAC: String(b),
            Budget_Engage: String(engageTask),
            Cout_Reel_AC: String(acTask),
            Valeur_Acquise_EV: String(evTask),
            Ecart_Cout_CV: '0',
            'Taux_Decaissement_%': '0%',
            Indice_CPI: '1.00'
          })
        );

        // M9: Livrables Contractuels, Assurance Qualité & Critères d'Acceptation (synchronisé avec la colonne Livrable de Planification Macro)
        const tranchePct =
          totalTasks > 0 ? `${Math.max(5, Math.round(100 / Math.max(1, (proj.tasks || []).length)))}%` : '20%';
        const statutValid =
          metrics.effectiveStatus === 'Terminé'
            ? 'Validé sans réserve'
            : metrics.effectiveStatus === 'En cours'
            ? 'En révision'
            : metrics.effectiveStatus === 'Bloqué'
            ? 'Validé sous réserve'
            : 'En attente';

        m9Rows.push({
          Code_Livrable: `LIV-${code}`,
          Intitule_Livrable_Actif: taskLivrable,
          Description_Format_Attendu: 'Rapport technique A4 (PDF) + Pièces justificatives & PV',
          Date_Echeance_Prevue: task.endDate || todayISO,
          Date_Remise_Reelle:
            metrics.effectiveStatus === 'Terminé'
              ? metrics.effectiveActualEndDate
              : '',
          Criteres_Qualite_Acceptation: 'Conformité aux TDR, validation RACI (Autorité A) et respect des normes ISO 21500 / UNEG',
          Instance_Approbation: taskA,
          'Tranche_Paiement_Associee_%': tranchePct,
          Statut_Validation: statutValid
        });

        // M8: Plan de Passation des Marchés
        if (b > 0 && task.type === 'tache') {
          const isConsult =
            /étude|audit|conception|cadrage|évaluation|formation/i.test(task.name);
          const isEquip =
            /serveur|équipement|acquisition|cloud|matériel|fourniture|infrastructure/i.test(
              task.name
            );
          m8Rows.push({
            Code_Marche: `PPM-${dossier.psdYear || 2026}-${String(m8Rows.length + 1).padStart(2, '0')}`,
            Designation_Acquisition: `${task.name} — Livrable : ${taskLivrable}`,
            Categorie_Marche: isEquip
              ? 'Fournitures / Équipements'
              : isConsult
              ? 'Services de Consultants'
              : 'Services Courants',
            Mode_Passation: b >= 25000000 ? 'AON' : b >= 10000000 ? 'Consultation Restreinte' : 'Demande de Cotation',
            Revue_Bailleur: b >= 20000000 ? 'Revue a priori / ANO' : 'Revue a posteriori',
            Montant_Estime: String(b),
            Montant_Contractuel_Reel: metrics.effectiveStatus === 'Terminé' || metrics.effectiveStatus === 'En cours' ? String(b) : '',
            Date_Lancement_DAO: task.startDate || todayISO,
            Date_Attribution_Signature:
              metrics.effectiveStatus !== 'À faire'
                ? metrics.effectiveActualStartDate || task.startDate || ''
                : '',
            Date_Reception_Prevue_Reelle:
              metrics.effectiveStatus === 'Terminé'
                ? metrics.effectiveActualEndDate || task.endDate || ''
                : task.endDate || '',
            Statut_Marche:
              metrics.effectiveStatus === 'Terminé'
                ? 'Exécuté / Réceptionné'
                : metrics.effectiveStatus === 'En cours'
                ? 'Attribué'
                : 'Planifié'
          });
        }

        // M10: Capitalisation & Plan d'Action Correctif (pour les tâches bloquées ou en écart dans Suivi des tâches)
        if (
          metrics.effectiveStatus === 'Bloqué' ||
          metrics.ecartDebutDays > 0 ||
          metrics.ecartFinDays > 0
        ) {
          m10Rows.push({
            Code_Action_Rec: `CAP-${String(m10Rows.length + 1).padStart(2, '0')}`,
            Constat_Ecart_Lecon_Identifiee: `Activité « ${task.name} » (${code}) — Statut : ${metrics.effectiveStatus} (Écart Début : ${metrics.ecartDebutLabel} / Fin : ${metrics.ecartFinLabel})`,
            Analyse_Causale_Synthetique:
              metrics.effectiveStatus === 'Bloqué'
                ? 'Goulot d’étranglement opérationnel ou attente de validation inter-services sur prérequis technique.'
                : 'Glissement calendaire lié à la mobilisation séquentielle des ressources sur la chaîne critique.',
            Recommandation_Prescription_Action: `Prioriser le déblocage immédiat en réunion restreinte, réallouer l’appui technique auprès de ${taskR} et sécuriser le livrable « ${taskLivrable} ».`,
            Priorite: pertNode?.isCritical || metrics.effectiveStatus === 'Bloqué' ? 'Critique / Urgente' : 'Haute',
            Indicateur_Verif_Mise_En_Oeuvre: `PV de réception signé par ${taskA} et statut passé à « Terminé »`,
            Responsable_Execution: taskR,
            Echeance_Cible: task.endDate || todayISO,
            Budget_Additionnel_Requis: '0',
            Statut_Mise_En_Oeuvre: metrics.effectiveStatus === 'Terminé' ? 'Réalisé' : 'En cours'
          });
        }
      });
    });
  });

  const progressPct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  const criticalNodes = allNodes.filter(n => n.isCritical);
  const criticalSeq = criticalNodes.map(n => n.code).join(' -> ') || 'T.1.1 -> T.2.1';
  const maxDur = pertSummaries.reduce((acc, p) => Math.max(acc, p.projectDuration), 0);
  const committedBudgetFCFA = completedBudgetFCFA + Math.round(inProgressBudgetFCFA * 0.6);
  const financialExecPct =
    totalBudgetFCFA > 0 ? Math.round((committedBudgetFCFA / totalBudgetFCFA) * 100) : 0;

  // M1: Cadre Logique & Chaîne de Résultats
  m1Rows.push(
    computeMatrixRowCalculations('M1', {
      Code_Resultat: 'IMP-1',
      Niveau_GAR: 'Impact',
      Intitule_Resultat: `Contribuer durablement à la performance et à la transformation via le portefeuille « ${dossier.name} » (${dossier.horizonPlan})`,
      Indicateur_SMART: 'Taux global d’impact stratégique et d’atteinte des cibles du portefeuille (%)',
      Baseline: '0%',
      Cible: '100',
      Valeur_Atteinte: String(progressPct),
      'Taux_Realisation_%': `${progressPct}%`,
      Source_Verification: 'Rapport d’Évaluation Finale (ICR / UNEG) & Enquêtes d’Impact',
      Frequence_Collecte: 'Annuelle',
      Responsable_Collecte: `${leadName} (${orgName})`,
      Hypotheses_Critiques: 'Stabilité institutionnelle, macroéconomique et maintien des engagements des partenaires.'
    })
  );

  (dossier.axes || []).forEach((axe, aIdx) => {
    const axeTasks = (axe.projects || []).flatMap(p => p.tasks || []);
    const axeDone = axeTasks.filter(t => computeTaskMetrics(t, todayISO).effectiveStatus === 'Terminé').length;
    const axePct = axeTasks.length > 0 ? Math.round((axeDone / axeTasks.length) * 100) : 0;

    m1Rows.push(
      computeMatrixRowCalculations('M1', {
        Code_Resultat: `EFF-${aIdx + 1}`,
        Niveau_GAR: 'Effet / Outcome',
        Intitule_Resultat: `${axe.name}`,
        Indicateur_SMART: `Taux d’achèvement des projets opérationnels de l’Axe ${aIdx + 1} (%)`,
        Baseline: '0%',
        Cible: '100',
        Valeur_Atteinte: String(axePct),
        'Taux_Realisation_%': `${axePct}%`,
        Source_Verification: 'Rapports CAP, Revue à Mi-Parcours & PV du Comité de Pilotage',
        Frequence_Collecte: 'Semestrielle',
        Responsable_Collecte: raciCtx.cActors[0] || leadName,
        Hypotheses_Critiques: 'Adhésion des parties prenantes et fluidité des arbitrages du COPIL.'
      })
    );

    (axe.projects || []).forEach((proj, pIdx) => {
      const pTasks = proj.tasks || [];
      const pDone = pTasks.filter(t => computeTaskMetrics(t, todayISO).effectiveStatus === 'Terminé').length;
      const pLivrables = pTasks.map(t => t.livrable).filter(Boolean).slice(0, 3).join(', ');
      m1Rows.push(
        computeMatrixRowCalculations('M1', {
          Code_Resultat: `EXT-${aIdx + 1}.${pIdx + 1}`,
          Niveau_GAR: 'Extrant / Output',
          Intitule_Resultat: `Livrables opérationnels du projet « ${proj.name} » produits et validés${pLivrables ? ` (${pLivrables})` : ''}`,
          Indicateur_SMART: `Nombre d’activités et jalons validés sur le projet P${pIdx + 1}`,
          Baseline: '0',
          Cible: String(Math.max(1, pTasks.length)),
          Valeur_Atteinte: String(pDone),
          'Taux_Realisation_%': '0%',
          Source_Verification: 'Bordereaux de réception, PV de validation et Tableau Kanban',
          Frequence_Collecte: 'Trimestrielle',
          Responsable_Collecte: (pTasks[0]?.assignee || '').trim() || leadName,
          Hypotheses_Critiques: 'Disponibilité à temps des intrants techniques et levée des blocages.'
        })
      );
    });
  });

  m1Rows.push(
    computeMatrixRowCalculations('M1', {
      Code_Resultat: 'ACT-GLOBAL',
      Niveau_GAR: 'Activité',
      Intitule_Resultat: `Exécution coordonnée des ${totalTasks} activités/jalons sur un chemin critique PERT de ${maxDur} jours ouvrés`,
      Indicateur_SMART: `Taux d’absorption budgétaire sur l’enveloppe de ${formatCleanAmount(totalBudgetFCFA, currency, lang)} (%)`,
      Baseline: '0%',
      Cible: '100',
      Valeur_Atteinte: String(financialExecPct),
      'Taux_Realisation_%': `${financialExecPct}%`,
      Source_Verification: 'États d’exécution PTBA, Comptabilité Projet & Réseau PERT',
      Frequence_Collecte: 'Mensuelle',
      Responsable_Collecte: leadName,
      Hypotheses_Critiques: 'Décaissement régulier des tranches budgétaires sans rupture de trésorerie.'
    })
  );

  // M4: Parties Prenantes, Engagement & Communication (synchronisé avec l'onglet Catégorie en 5 catégories & RACI)
  raciCtx.categorizedActors.slice(0, 10).forEach((catActor, idx) => {
    const powerByCat =
      catActor.category === 'Interne' ||
      catActor.category === 'Partenaire Financier' ||
      catActor.category === 'Externe'
        ? '5'
        : catActor.category === 'Prestataire'
        ? '3'
        : '2';
    const strategyByCat =
      catActor.category === 'Bénéficiaires'
        ? 'Consultations participatives, focus groups, mécanisme de gestion des plaintes et appropriation'
        : catActor.category === 'Interne'
        ? 'Pilotage proactif quotidien, revues hebdomadaires UGP/PMO et coordination RACI'
        : catActor.category === 'Externe'
        ? 'Concertation institutionnelle, soumission des dossiers de conformité, visas et laisser-passer'
        : catActor.category === 'Prestataire'
        ? 'Suivi contractuel rigoureux, réunions de chantier et contrôle de réception des livrables'
        : 'Transparence fiduciaire totale, demandes d’ANO anticipées et revues conjointes de supervision';
    const freqByCat =
      catActor.category === 'Interne'
        ? 'Réunions UGP Hebdomadaires & Tableau Kanban'
        : catActor.category === 'Partenaire Financier'
        ? 'Sessions du COPIL Trimestrielles & Missions de Supervision'
        : catActor.category === 'Externe'
        ? 'Comités Techniques Mensuels & Courriers Officiels'
        : catActor.category === 'Prestataire'
        ? 'Points d’Avancement Hebdomadaires & Bordereaux de Livrables'
        : 'Ateliers de Concertation & Enquêtes CAP Semestrielles';

    m4Rows.push({
      Code_PP: `PP-${String(idx + 1).padStart(2, '0')}`,
      Nom_Institution_Groupe: `${catActor.name} (${catActor.organization})`,
      Categorie_Acteur: catActor.category,
      Role_Dans_Projet: `${catActor.roleOrFunction} [RACI: ${(catActor.raciRoles || ['R']).join('/')}]`,
      Niveau_Pouvoir_1_5: powerByCat,
      Niveau_Interet_1_5: '5',
      Attentes_Enjeux_Majeurs:
        catActor.expectationsAndRole ||
        `Contribution de catégorie « ${catActor.category} » à l’atteinte des résultats du programme`,
      Strategie_Engagement: strategyByCat,
      Canal_Frequence_Comm: freqByCat
    });
  });


  // M6: Grille d'Évaluation Internationale (6 Critères OCDE/CAD & UNEG)
  const effScore = progressPct >= 80 ? '5' : progressPct >= 55 ? '4' : progressPct >= 30 ? '3' : '2';
  const efcScore = blockedTasks === 0 ? '4' : blockedTasks <= 2 ? '3' : '2';
  m6Rows.push(
    {
      Code_QE: 'QE-1.1',
      Critere_OCDE_CAD: 'Pertinence',
      'Poids_Critere_%': '15%',
      Question_Evaluative_Principale: `Dans quelle mesure les objectifs du portefeuille « ${dossier.name} » répondent-ils aux besoins prioritaires des bénéficiaires et aux stratégies institutionnelles ?`,
      Sous_Questions_Jugement: 'Adéquation du diagnostic initial ; Alignement avec les ODD et le plan stratégique ; Réalisme de la Théorie du Changement.',
      Indicateur_Reponse: `Taux d’alignement des ${(dossier.axes || []).length} axe(s) stratégique(s) avec les priorités nationales/institutionnelles (Cible : 100%)`,
      Sources_Triangulation_3_Niveaux: '1. Doc : ProDoc & Cadre Logique | 2. Quantitatif : Statistiques de référence | 3. Qualitatif : Entretiens KII avec Sponsor & PTF',
      Methode_Outil_Collecte: 'Revue documentaire systématique & Guides d’entretiens semi-directifs (KII)',
      Cible_Repondants: `${orgName}, ${donorName}, Représentants des bénéficiaires`,
      Score_1_a_5: '5',
      Appreciation_Normative: 'Très satisfaisant'
    },
    {
      Code_QE: 'QE-2.1',
      Critere_OCDE_CAD: 'Cohérence',
      'Poids_Critere_%': '10%',
      Question_Evaluative_Principale: 'Quelle est la cohérence interne entre les axes/projets du portefeuille et la cohérence externe avec les interventions des autres partenaires ?',
      Sous_Questions_Jugement: 'Articulation logique WBS/PERT ; Synergies inter-projets ; Absence de duplication avec les autres programmes.',
      Indicateur_Reponse: `Pourcentage de projets disposant de liens d’antécédence PERT/CPM et d’une gouvernance RACI harmonisée (100% sur ${pertSummaries.length} projet(s))`,
      Sources_Triangulation_3_Niveaux: '1. Doc : Matrices WBS & RACI | 2. Quantitatif : Réseau PERT | 3. Qualitatif : Focus groups avec chefs de projets',
      Methode_Outil_Collecte: 'Analyse structurelle du réseau PERT & Entretiens de coordination',
      Cible_Repondants: Array.from(uniqueAssignees).join(', ') || leadName,
      Score_1_a_5: '4',
      Appreciation_Normative: 'Satisfaisant'
    },
    {
      Code_QE: 'QE-3.1',
      Critere_OCDE_CAD: 'Efficacité',
      'Poids_Critere_%': '25%',
      Question_Evaluative_Principale: 'Dans quelle mesure les extrants (livrables) et les effets directs attendus ont-ils été atteints ou sont-ils en voie de l’être dans les délais ?',
      Sous_Questions_Jugement: 'Taux d’exécution physique des activités ; Qualité des livrables réceptionnés ; Respect des jalons critiques.',
      Indicateur_Reponse: `Taux de réalisation physique global : ${progressPct}% (${completedTasks}/${totalTasks} activités terminées, ${inProgressTasks} en cours)`,
      Sources_Triangulation_3_Niveaux: '1. Doc : Rapports CAP & PV | 2. Quantitatif : Base de suivi Kanban | 3. Qualitatif : Visites de vérification terrain',
      Methode_Outil_Collecte: 'Audit physique contradictoire des livrables & Calcul des écarts Début/Fin',
      Cible_Repondants: `Responsables RACI (R : ${Array.from(uniqueAssignees).join(', ') || leadName} ; A : ${Array.from(uniqueAuthorities).join(', ') || recipientRep})`,
      Score_1_a_5: effScore,
      Appreciation_Normative: Number(effScore) >= 4 ? 'Satisfaisant' : 'Moyen'
    },
    {
      Code_QE: 'QE-4.1',
      Critere_OCDE_CAD: 'Efficience',
      'Poids_Critere_%': '20%',
      Question_Evaluative_Principale: 'Les ressources financières, humaines et temporelles ont-elles été converties de manière optimale en résultats (analyse coût-efficacité) ?',
      Sous_Questions_Jugement: 'Adéquation entre décaissement et avancement physique ; Maîtrise des coûts unitaires ; Respect du chemin critique PERT.',
      Indicateur_Reponse: `Exécution financière de ${financialExecPct}% sur ${formatCleanAmount(totalBudgetFCFA, currency, lang)} ; Chemin critique de ${maxDur}j (${blockedTasks} blocage(s))`,
      Sources_Triangulation_3_Niveaux: '1. Doc : États financiers PTBA | 2. Quantitatif : Valeur Acquise (EVM / CPI) | 3. Qualitatif : Entretiens DAF & Auditeurs',
      Methode_Outil_Collecte: 'Audit budgétaire EVM (BAC, EV, AC, CPI) & Analyse des marges PERT',
      Cible_Repondants: `Direction Financière & ${leadName}`,
      Score_1_a_5: efcScore,
      Appreciation_Normative: Number(efcScore) >= 4 ? 'Satisfaisant' : 'Moyen'
    },
    {
      Code_QE: 'QE-5.1',
      Critere_OCDE_CAD: 'Impact',
      'Poids_Critere_%': '15%',
      Question_Evaluative_Principale: 'Quels sont les changements durables, positifs ou négatifs, directs ou indirects, induits par l’intervention sur l’organisation et les bénéficiaires ?',
      Sous_Questions_Jugement: 'Transformation structurelle observée ; Effets catalytiques sur l’écosystème ; Changements à l’horizon du plan.',
      Indicateur_Reponse: `Degré de transformation stratégique mesuré sur l’horizon ${dossier.horizonPlan} (${dossier.horizonYears} ans)`,
      Sources_Triangulation_3_Niveaux: '1. Doc : Études d’impact | 2. Quantitatif : Comparaison Baseline/Endline | 3. Qualitatif : Témoignages bénéficiaires',
      Methode_Outil_Collecte: 'Enquêtes mixtes Baseline/Endline & Outcome Harvesting (Récolte des effets)',
      Cible_Repondants: 'Direction Générale, Bénéficiaires finaux, Autorités de tutelle',
      Score_1_a_5: '4',
      Appreciation_Normative: 'Satisfaisant'
    },
    {
      Code_QE: 'QE-6.1',
      Critere_OCDE_CAD: 'Durabilité',
      'Poids_Critere_%': '15%',
      Question_Evaluative_Principale: 'Les bénéfices et acquis du projet se maintiendront-ils durablement après la clôture du financement initial ?',
      Sous_Questions_Jugement: 'Appropriation institutionnelle et technique ; Capacité financière récurrente ; Transfert effectif des compétences.',
      Indicateur_Reponse: 'Pourcentage de livrables dotés d’un protocole de transfert d’acquis et d’une équipe RACI pérenne (Cible : 100%)',
      Sources_Triangulation_3_Niveaux: '1. Doc : PV de transfert & Manuels | 2. Quantitatif : Budget récurrent | 3. Qualitatif : Audit des capacités internes',
      Methode_Outil_Collecte: 'Évaluation de la viabilité institutionnelle et financière post-projet',
      Cible_Repondants: 'Structures pérennes d’exploitation, Direction RH & Technique',
      Score_1_a_5: '4',
      Appreciation_Normative: 'Satisfaisant'
    }
  );

  // M7: Registre des Risques, Hypothèses, Problèmes & Dépendances (Board RAID)
  m7Rows.push(
    computeMatrixRowCalculations('M7', {
      Code_RAID: 'R-01',
      Type_Element: 'Risque',
      Categorie: 'Opérationnel & Calendaire',
      Description_Precise: `Glissement calendaire sur la séquence du chemin critique PERT (${criticalSeq}) d’une durée incompressible de ${maxDur} jours ouvrés`,
      Cause_Racine: 'Retards cumulés dans la livraison des tâches antécédentes à marge totale nulle (Total Float = 0j)',
      Consequence_Impact_Projet: 'Décalage direct de la date de clôture globale du portefeuille et retard sur les jalons contractuels',
      Probabilite_1_5: delayedTasks > 0 ? '4' : '3',
      Impact_1_5: '5',
      Criticite_PxI: '15',
      Strategie_Reponse: 'Atténuer',
      Plan_Action_Mitigation: 'Surveillance hebdomadaire prioritaire des nœuds critiques et réallocation des ressources depuis les tâches à marge libre',
      Proprietaire_Risque: leadName,
      Statut_RAID: delayedTasks > 0 ? 'Ouvert' : 'Sous contrôle'
    }),
    computeMatrixRowCalculations('M7', {
      Code_RAID: 'I-02',
      Type_Element: 'Problème / Issue',
      Categorie: 'Opérationnel & Gouvernance',
      Description_Precise:
        blockedTasks > 0
          ? `${blockedTasks} activité(s) actuellement au statut « Bloqué » dans le portefeuille nécessitant une levée immédiate de contrainte`
          : 'Risque de goulot d’étranglement lors des validations inter-services ou de la réception des livrables techniques',
      Cause_Racine: 'Délais d’approbation RACI ou prérequis techniques externes non encore finalisés',
      Consequence_Impact_Projet: 'Paralysie des activités successeurs dépendantes et sous-absorption des crédits alloués',
      Probabilite_1_5: blockedTasks > 0 ? '5' : '2',
      Impact_1_5: '4',
      Criticite_PxI: '20',
      Strategie_Reponse: blockedTasks > 0 ? 'Escalader' : 'Atténuer',
      Plan_Action_Mitigation: 'Convocation d’une réunion extraordinaire d’arbitrage COPIL et application de délais plafonds de validation (5 jours ouvrés)',
      Proprietaire_Risque: recipientRep,
      Statut_RAID: blockedTasks > 0 ? 'Ouvert' : 'Sous contrôle'
    }),
    computeMatrixRowCalculations('M7', {
      Code_RAID: 'A-03',
      Type_Element: 'Hypothèse',
      Categorie: 'Financier & Fiduciaire',
      Description_Precise: `Disponibilité et décaissement régulier des tranches sur l’enveloppe globale de ${formatCleanAmount(totalBudgetFCFA, currency, lang)}`,
      Cause_Racine: 'Procédures d’appels de fonds et de justification des dépenses antérieures auprès du bailleur',
      Consequence_Impact_Projet: 'Rupture de trésorerie ralentissant le démarrage des marchés et prestations programmés au PTBA',
      Probabilite_1_5: '3',
      Impact_1_5: '4',
      Criticite_PxI: '12',
      Strategie_Reponse: 'Atténuer',
      Plan_Action_Mitigation: 'Synchronisation stricte des demandes de retrait de fonds (DRF) avec les PV de validation des jalons physiques',
      Proprietaire_Risque: `Direction Financière & ${donorName}`,
      Statut_RAID: 'Sous contrôle'
    }),
    computeMatrixRowCalculations('M7', {
      Code_RAID: 'B-04',
      Type_Element: 'Biais méthodologique',
      Categorie: 'Suivi-Évaluation & Qualité',
      Description_Precise: 'Biais déclaratif sur l’avancement physique ou asymétrie d’information lors de la collecte des indicateurs S&E',
      Cause_Racine: 'Absence de vérification documentaire contradictoire avant passage d’une tâche au statut « Terminé »',
      Consequence_Impact_Projet: 'Surestimation du taux de réalisation physique et distorsion des indicateurs de valeur acquise (EVM)',
      Probabilite_1_5: '2',
      Impact_1_5: '4',
      Criticite_PxI: '8',
      Strategie_Reponse: 'Éviter',
      Plan_Action_Mitigation: 'Application stricte de la triangulation à 3 niveaux (UNEG) et obligation de joindre le livrable validé avant clôture',
      Proprietaire_Risque: raciCtx.cActors[0] || leadName,
      Statut_RAID: 'Sous contrôle'
    })
  );

  if (m8Rows.length === 0) {
    m8Rows.push({
      Code_Marche: `PPM-${dossier.psdYear || 2026}-01`,
      Designation_Acquisition: `Prestation d’appui technique et d’accompagnement pour « ${dossier.name} »`,
      Categorie_Marche: 'Services de Consultants',
      Mode_Passation: 'Consultation Restreinte',
      Revue_Bailleur: 'Revue a priori / ANO',
      Montant_Estime: String(totalBudgetFCFA || 15000000),
      Montant_Contractuel_Reel: String(committedBudgetFCFA || 15000000),
      Date_Lancement_DAO: todayISO,
      Date_Attribution_Signature: todayISO,
      Date_Reception_Prevue_Reelle: '',
      Statut_Marche: 'En cours'
    });
  }

  if (m10Rows.length === 0) {
    m10Rows.push(
      {
        Code_Action_Rec: 'REC-01',
        Constat_Ecart_Lecon_Identifiee: `Nécessité de sécuriser la séquence critique PERT (${criticalSeq}) sur une durée totale de ${maxDur} jours ouvrés`,
        Analyse_Causale_Synthetique: 'Absence de marge libre (Total Float = 0j) sur les activités structurantes du chemin critique',
        Recommandation_Prescription_Action: 'Maintenir une revue hebdomadaire dédiée aux tâches critiques et anticiper la mobilisation des experts RACI',
        Priorite: 'Critique / Urgente',
        Indicateur_Verif_Mise_En_Oeuvre: '0 jour de glissement calendaire sur le chemin critique PERT',
        Responsable_Execution: leadName,
        Echeance_Cible: todayISO,
        Budget_Additionnel_Requis: '0',
        Statut_Mise_En_Oeuvre: 'En cours'
      },
      {
        Code_Action_Rec: 'REC-02',
        Constat_Ecart_Lecon_Identifiee: `Alignement du rythme de décaissement financier (${financialExecPct}%) avec l’avancement physique (${progressPct}%)`,
        Analyse_Causale_Synthetique: 'Décalage temporel entre la réception technique des livrables et la liquidation comptable des factures',
        Recommandation_Prescription_Action: 'Coupler systématiquement la signature des PV de réception (Matrice M9) avec le déclenchement des paiements PTBA (Matrice M5)',
        Priorite: 'Haute',
        Indicateur_Verif_Mise_En_Oeuvre: 'Indice de performance des coûts (CPI) maintenu >= 1.00',
        Responsable_Execution: `Direction Financière & ${recipientRep}`,
        Echeance_Cible: todayISO,
        Budget_Additionnel_Requis: '0',
        Statut_Mise_En_Oeuvre: 'En cours'
      }
    );
  }

  return {
    M1: m1Rows,
    M2: m2Rows,
    M3: m3Rows,
    M4: m4Rows,
    M5: m5Rows,
    M6: m6Rows,
    M7: m7Rows,
    M8: m8Rows,
    M9: m9Rows,
    M10: m10Rows
  };
}

/**
 * Résout l'état complet des 10 matrices en fusionnant les données pré-remplies
 * en temps réel depuis les onglets Planification, Suivi des tâches et RACI du programme sélectionné
 * avec les éventuelles personnalisations spécifiques au programme.
 */
export function resolveActiveMatricesData(
  dossier: Dossier,
  fields: CustomDocFields,
  userProfile: UserProfile,
  currency: CurrencyCode,
  lang: LanguageCode,
  sharedMatricesJson?: string
): AllMatricesData {
  const defaults = buildDefaultMatricesFromApp(dossier, fields, userProfile, currency, lang);
  const rawJson = fields.matricesJson || sharedMatricesJson;
  if (!rawJson) return defaults;

  try {
    const parsed = JSON.parse(rawJson) as Partial<AllMatricesData>;
    const merged: AllMatricesData = { ...defaults };
    (Object.keys(defaults) as MasterMatrixId[]).forEach(mId => {
      const savedRows = parsed[mId];
      if (Array.isArray(savedRows)) {
        merged[mId] = savedRows.map(row => computeMatrixRowCalculations(mId, row));
      }
    });
    return merged;
  } catch {
    return defaults;
  }
}

/**
 * Compte les cellules vides ("À compléter") et les cellules renseignées dans une matrice
 */
export function getMatrixCompletionStats(
  matrixId: MasterMatrixId,
  rows: MatrixRowData[]
): { totalCells: number; filledCells: number; missingCells: number } {
  const def = getMatrixDefinition(matrixId);
  const editableCols = def.columns.filter(c => c.inputType !== 'computed');
  let totalCells = 0;
  let filledCells = 0;

  rows.forEach(r => {
    editableCols.forEach(c => {
      totalCells++;
      const val = (r[c.key] || '').trim();
      if (val !== '') filledCells++;
    });
  });

  return {
    totalCells,
    filledCells,
    missingCells: Math.max(0, totalCells - filledCells)
  };
}

/**
 * Sérialise une matrice en tableau Markdown propre pour les variables [TXT_...]
 */
export function serializeMatrixToMarkdown(
  matrixId: MasterMatrixId,
  rows: MatrixRowData[]
): string {
  const def = getMatrixDefinition(matrixId);
  const headers = def.columns.map(c => c.key);
  const sep = def.columns.map(c => (c.isRightAligned ? '---:' : ':---'));
  const bodyLines = rows.map(r =>
    def.columns
      .map(c => {
        const val = (r[c.key] || '—').replace(/\r?\n/g, ' ').replace(/\|/g, '/');
        return val;
      })
      .join(' | ')
  );

  return [
    `| ${headers.join(' | ')} |`,
    `| ${sep.join(' | ')} |`,
    ...bodyLines.map(line => `| ${line} |`)
  ].join('\n');
}

/**
 * Génère le dictionnaire complet des variables [TXT_...] pour l'injection dans le Prompt / Document
 */
export function buildAllTxtMatrixVariables(matrices: AllMatricesData): Record<string, string> {
  const result: Record<string, string> = {};
  MASTER_MATRICES_DEFINITIONS.forEach(def => {
    result[def.txtVariable] = serializeMatrixToMarkdown(def.id, matrices[def.id] || []);
  });
  return result;
}

/**
 * Convertit chacune des 10 Matrices Maîtresses (M1 à M10) en un tableau A4
 * calibré (5 à 6 colonnes max avec ratios explicites totalisant 100%)
 * pour une injection directe sans aucun débordement dans l'aperçu A4 et l'export PDF.
 */
export function buildStructuredA4TableFromMatrix(
  matrixId: MasterMatrixId,
  matrices: AllMatricesData,
  currency: CurrencyCode = 'FCFA',
  lang: LanguageCode = 'FR'
): StructuredA4Table {
  const rows = matrices[matrixId] || [];
  const fmtAmt = (val: string) => {
    const num = parseNumericValue(val);
    if (!val || val.trim() === '') return 'À compléter';
    if (/\b(FCFA|EUR|USD)\b/.test(val)) return val;
    return formatCleanAmount(num, currency, lang);
  };

  switch (matrixId) {
    case 'M1':
      return {
        headers: [
          'Code & Niveau GAR (14%)',
          'Intitulé du Résultat (24%)',
          'Indicateur SMART (22%)',
          'Baseline / Cible / Réalisé (18%)',
          'Vérification & Fréq. (11%)',
          'Hypothèses & Resp. (11%)'
        ],
        columnWidths: [14, 24, 22, 18, 11, 11],
        rows: rows.map(r => [
          `${r.Code_Resultat || '—'}\n(${r.Niveau_GAR || '—'})`,
          r.Intitule_Resultat || '—',
          r.Indicateur_SMART || '—',
          `Base : ${r.Baseline || '0'}\nCible : ${r.Cible || '0'}\nAtteint : ${r.Valeur_Atteinte || '0'} (${r['Taux_Realisation_%'] || '0%'})`,
          `${r.Source_Verification || '—'}\n[${r.Frequence_Collecte || '—'}]`,
          `${r.Hypotheses_Critiques || '—'}\n(${r.Responsable_Collecte || '—'})`
        ])
      };

    case 'M2':
      return {
        headers: [
          'Code WBS (9%)',
          'Phase & Intitulé Activité (27%)',
          'Antéc., Durée & PERT (16%)',
          'Calendrier Prévu / Réel (18%)',
          'Jalon & Avancement (16%)',
          'Statut (14%)'
        ],
        columnWidths: [9, 27, 16, 18, 16, 14],
        rows: rows.map(r => [
          r.Code_WBS || '—',
          `[${r.Phase_Lot || 'Phase'}]\n${r.Intitule_Tache_Activite || '—'}`,
          `Préd. : ${r.Taches_Predecesseurs || 'Aucun'}\nDurée : ${r.Duree_Jours || '0'}j\nPERT : ${r.Chemin_Critique_PERT || '—'}`,
          `Prév. : ${r.Date_Debut_Prevue || '—'} -> ${r.Date_Fin_Prevue || '—'}\nRéel : ${r.Date_Fin_Reelle || 'En cours'}`,
          `${r.Jalon_Associe || '—'}\n(${r.Valeur_Atteinte || '0'}/${r.Cible || '100'} soit ${r['Taux_Avancement_%'] || '0%'})`,
          r.Statut_Execution || '—'
        ])
      };

    case 'M3':
      return {
        headers: [
          'Code & Lot (14%)',
          'Domaine / Activité & Poste (24%)',
          'Qualification & Charge (18%)',
          'Réalisateur R (15%)',
          'Approbateur A (15%)',
          'Consulté C / Informé I (14%)'
        ],
        columnWidths: [14, 24, 18, 15, 15, 14],
        rows: rows.map(r => [
          `${r.Code_Acteur_Lot || '—'}\n(${r.Entite_Organisation || '—'})`,
          `${r.Domaine_Livrable_Activite || '—'}\nPoste : ${r.Role_Poste_Expert || '—'}`,
          `${r.Qualification_Niveau || '—'}\nCharge : ${r.Charge_Homme_Jours || '0'} H/J`,
          r.R_Realisateur || '—',
          r.A_Approbateur || '—',
          `C : ${r.C_Consulte || '—'}\nI : ${r.I_Informe || '—'}`
        ])
      };

    case 'M4':
      return {
        headers: [
          'Code & Acteur (18%)',
          'Catégorie & Rôle (22%)',
          'Pouvoir / Intérêt (12%)',
          'Attentes & Enjeux Majeurs (20%)',
          'Stratégie d’Engagement (16%)',
          'Canal & Fréq. (12%)'
        ],
        columnWidths: [18, 22, 12, 20, 16, 12],
        rows: rows.map(r => [
          `${r.Code_PP || '—'}\n${r.Nom_Institution_Groupe || '—'}`,
          `[${r.Categorie_Acteur || '—'}]\n${r.Role_Dans_Projet || '—'}`,
          `Pouvoir : ${r.Niveau_Pouvoir_1_5 || '5'}/5\nIntérêt : ${r.Niveau_Interet_1_5 || '5'}/5`,
          r.Attentes_Enjeux_Majeurs || '—',
          r.Strategie_Engagement || '—',
          r.Canal_Frequence_Comm || '—'
        ])
      };

    case 'M5': {
      let totalBac = 0;
      let totalEng = 0;
      let totalAc = 0;
      let totalEv = 0;
      const bodyRows = rows.map(r => {
        const bac = parseNumericValue(r.Budget_Initial_BAC);
        const eng = parseNumericValue(r.Budget_Engage);
        const ac = parseNumericValue(r.Cout_Reel_AC);
        const ev = parseNumericValue(r.Valeur_Acquise_EV);
        totalBac += bac;
        totalEng += eng;
        totalAc += ac;
        totalEv += ev;
        return [
          `${r.Code_Ligne_Budget || '—'}\n(${r.Unite || 'Lot'} x ${r.Quantite || '1'})`,
          `${r.Rubrique_Activite_PTBA || '—'}\nSource : ${r.Source_Financement || '—'}`,
          fmtAmt(r.Budget_Initial_BAC),
          `Eng. : ${fmtAmt(r.Budget_Engage)}\nAC : ${fmtAmt(r.Cout_Reel_AC)}`,
          `EV : ${fmtAmt(r.Valeur_Acquise_EV)}\nCV : ${fmtAmt(String(ev - ac))}`,
          `Déc. : ${r['Taux_Decaissement_%'] || '0%'}\nCPI : ${r.Indice_CPI || '1.00'}`
        ];
      });
      const globalDecPct = totalBac > 0 ? Math.round((totalAc / totalBac) * 1000) / 10 : 0;
      const globalCpi = totalAc > 0 ? (totalEv / totalAc).toFixed(2) : '1.00';
      bodyRows.push([
        'TOTAL CONSOLIDÉ EVM',
        `${rows.length} ligne(s) budgétaire(s) PTBA`,
        formatCleanAmount(totalBac, currency, lang),
        `Eng. : ${formatCleanAmount(totalEng, currency, lang)}\nAC : ${formatCleanAmount(totalAc, currency, lang)}`,
        `EV : ${formatCleanAmount(totalEv, currency, lang)}\nCV : ${formatCleanAmount(totalEv - totalAc, currency, lang)}`,
        `Déc. : ${globalDecPct}%\nCPI : ${globalCpi}`
      ]);
      return {
        headers: [
          'Ligne & Unité (12%)',
          'Rubrique PTBA & Financement (24%)',
          'Budget Initial BAC (16%)',
          'Engagé & Coût Réel AC (18%)',
          'Valeur Acquise EV & CV (18%)',
          'Taux & CPI (12%)'
        ],
        columnWidths: [12, 24, 16, 18, 18, 12],
        rightAlignCols: [2, 3, 4, 5],
        rows: bodyRows
      };
    }

    case 'M6':
      return {
        headers: [
          'Code, Critère & Poids (14%)',
          'Question Évaluative & Jugement (24%)',
          'Indicateur SMART de Réponse (18%)',
          'Triangulation à 3 Niveaux (18%)',
          'Méthode & Cibles (14%)',
          'Score & Appréciation (12%)'
        ],
        columnWidths: [14, 24, 18, 18, 14, 12],
        rows: rows.map(r => [
          `${r.Code_QE || '—'}\n${r.Critere_OCDE_CAD || '—'} (${r['Poids_Critere_%'] || '—'})`,
          `${r.Question_Evaluative_Principale || '—'}\n[Jugement : ${r.Sous_Questions_Jugement || '—'}]`,
          r.Indicateur_Reponse || '—',
          r.Sources_Triangulation_3_Niveaux || '—',
          `${r.Methode_Outil_Collecte || '—'}\nCibles : ${r.Cible_Repondants || '—'}`,
          `Score : ${r.Score_1_a_5 || '4'} / 5\n(${r.Appreciation_Normative || 'Satisfaisant'})`
        ])
      };

    case 'M7':
      return {
        headers: [
          'Code, Type & Catégorie (14%)',
          'Description Précise & Cause Racine (24%)',
          'Conséquence sur le Projet (16%)',
          'P x I & Criticité (12%)',
          'Stratégie & Plan de Mitigation (22%)',
          'Propriétaire & Statut (12%)'
        ],
        columnWidths: [14, 24, 16, 12, 22, 12],
        rows: rows.map(r => [
          `${r.Code_RAID || '—'}\n[${r.Type_Element || 'Risque'}]\n${r.Categorie || '—'}`,
          `${r.Description_Precise || '—'}\nCause : ${r.Cause_Racine || '—'}`,
          r.Consequence_Impact_Projet || '—',
          `P=${r.Probabilite_1_5 || '3'} x I=${r.Impact_1_5 || '3'}\nScore : ${r.Criticite_PxI || '9'}`,
          `[${r.Strategie_Reponse || 'Atténuer'}] ${r.Plan_Action_Mitigation || '—'}`,
          `${r.Proprietaire_Risque || '—'}\n(${r.Statut_RAID || 'Ouvert'})`
        ])
      };

    case 'M8':
      return {
        headers: [
          'Code & Catégorie (15%)',
          'Désignation de l’Acquisition (23%)',
          'Mode & Revue Bailleur (16%)',
          'Montant Estimé / Réel (18%)',
          'Calendrier DAO / Sign. / Récep. (16%)',
          'Statut Marché (12%)'
        ],
        columnWidths: [15, 23, 16, 18, 16, 12],
        rightAlignCols: [3],
        rows: rows.map(r => [
          `${r.Code_Marche || '—'}\n[${r.Categorie_Marche || '—'}]`,
          r.Designation_Acquisition || '—',
          `${r.Mode_Passation || '—'}\n(${r.Revue_Bailleur || '—'})`,
          `Est. : ${fmtAmt(r.Montant_Estime)}\nRéel : ${r.Montant_Contractuel_Reel ? fmtAmt(r.Montant_Contractuel_Reel) : 'À compléter'}`,
          `DAO : ${r.Date_Lancement_DAO || '—'}\nSign. : ${r.Date_Attribution_Signature || '—'}\nRéc. : ${r.Date_Reception_Prevue_Reelle || 'À compléter'}`,
          r.Statut_Marche || 'Planifié'
        ])
      };

    case 'M9':
      return {
        headers: [
          'Code Livrable (10%)',
          'Intitulé du Livrable & Format (24%)',
          'Échéance Prévue / Réelle (16%)',
          'Critères Qualité & Approbation (24%)',
          'Tranche Paiement (12%)',
          'Statut Validation (14%)'
        ],
        columnWidths: [10, 24, 16, 24, 12, 14],
        rightAlignCols: [4],
        rows: rows.map(r => [
          r.Code_Livrable || '—',
          `${r.Intitule_Livrable_Actif || '—'}\nFormat : ${r.Description_Format_Attendu || '—'}`,
          `Prév. : ${r.Date_Echeance_Prevue || '—'}\nRéel : ${r.Date_Remise_Reelle || 'En cours'}`,
          `${r.Criteres_Qualite_Acceptation || '—'}\nInstance : ${r.Instance_Approbation || 'COPIL'}`,
          r['Tranche_Paiement_Associee_%'] || '—',
          r.Statut_Validation || 'En attente'
        ])
      };

    case 'M10':
    default:
      return {
        headers: [
          'Code & Priorité (13%)',
          'Constat, Écart ou Leçon Identifiée (22%)',
          'Analyse Causale Synthétique (18%)',
          'Recommandation / Prescription CAP (23%)',
          'Indicateur & Responsable (13%)',
          'Échéance, Coût & Statut (11%)'
        ],
        columnWidths: [13, 22, 18, 23, 13, 11],
        rows: rows.map(r => [
          `${r.Code_Action_Rec || '—'}\n[${r.Priorite || 'Haute'}]`,
          r.Constat_Ecart_Lecon_Identifiee || '—',
          r.Analyse_Causale_Synthetique || '—',
          r.Recommandation_Prescription_Action || '—',
          `${r.Indicateur_Verif_Mise_En_Oeuvre || '—'}\nResp. : ${r.Responsable_Execution || '—'}`,
          `Éch. : ${r.Echeance_Cible || '—'}\nCoût : ${fmtAmt(r.Budget_Additionnel_Requis || '0')}\n[${r.Statut_Mise_En_Oeuvre || 'En cours'}]`
        ])
      };
  }
}
