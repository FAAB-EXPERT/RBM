import {
  CurrencyCode,
  CustomDocFields,
  Dossier,
  FieldPhotoItem,
  InstitutionalDocType,
  LanguageCode,
  SlideCustomOverride,
  SlideLayoutMode,
  UserProfile
} from './types';
import { formatCurrency } from './i18n';
import {
  computeDossierPertSummary,
  computeTaskMetrics,
  getTodayISO
} from './pertUtils';
import {
  MasterMatrixId,
  MatrixRowData,
  resolveActiveMatricesData,
  resolveProgramRaciContext
} from './docMatrices';
import {
  HIDE_SIGNATURES_KEY,
  StructuredA4Table,
  parseExcludedFields,
  parseFieldPhotos
} from './docTemplates';

export interface SlideKpiCard {
  label: string;
  value: string;
  subtext: string;
  accent?: 'primary' | 'sky' | 'emerald' | 'amber' | 'rose';
  tone?: 'primary' | 'sky' | 'emerald' | 'amber' | 'rose';
}

export interface SlideCardBlock {
  title: string;
  badge?: string;
  bullets: string[];
  items?: string[];
}

export interface SlideChartItem {
  label: string;
  value: number;
  displayValue: string;
  pct: number; // 0 to 100
  colorHex: string;
  sublabel?: string;
}

export interface SlideChartConfig {
  type: 'donut' | 'bar';
  title: string;
  subtitle: string;
  centerLabel?: string;
  centerValue?: string;
  unitLabel?: string;
  items: SlideChartItem[];
}

export interface SlideCoverData {
  leftLogo: string;
  leftDepartment: string;
  rightLogo: string;
  rightDepartment: string;
  leftOrgName: string;
  rightOrgName: string;
  leftDeptName: string;
  rightDeptName: string;
  referenceCode: string;
  locationAndDate: string;
  leftLogoDataUrl?: string;
  rightLogoDataUrl?: string;
  bannerImageDataUrl?: string;
  meetingBadge: string;
  mainTitle: string;
  subtitleLine: string;
  referenceAndDate: string;
  presenterLine: string;
  locationLine: string;
}

export interface StructuredSlidePage {
  slideNumber: number; // 1-based original slide number
  displaySlideNumber: number; // 1-based active slide number after filtering excluded slides
  totalDisplaySlides: number; // N active slides
  excluded: boolean;
  isCoverSlide?: boolean;
  isFinalSlide?: boolean;
  matrixBadge: string;
  connectedMatrixId?: MasterMatrixId;
  title: string;
  subtitle: string;
  contentText: string; // Full editable text in left-hand textarea
  bullets: string[]; // Max 5-6 concise bullets for projection readability
  layout: SlideLayoutMode;
  kpiCards: SlideKpiCard[];
  threeCards: SlideCardBlock[];
  table?: StructuredA4Table;
  chart?: SlideChartConfig;
  secondaryChart?: SlideChartConfig;
  imageDataUrl?: string;
  imageCaption?: string;
  fieldPhotos?: FieldPhotoItem[];
  coverData?: SlideCoverData;
  includeSignatures?: boolean;
  orgStampDataUrl?: string;
  partnerStampDataUrl?: string;
}

export function isSlidePresentationDoc(docType: InstitutionalDocType): boolean {
  return (
    docType === 'slides_tdr' ||
    docType === 'slides_cadrage' ||
    docType === 'slides_demarrage' ||
    docType === 'slides_ptba' ||
    docType === 'slides_ptt' ||
    docType === 'slides_mi_parcours' ||
    docType === 'slides_evaluation_finale'
  );
}

export function parseSlidesOverrides(
  jsonStr?: string
): Record<number, SlideCustomOverride> {
  if (!jsonStr || !jsonStr.trim()) return {};
  try {
    const parsed = JSON.parse(jsonStr);
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as Record<number, SlideCustomOverride>;
  } catch {
    return {};
  }
}

export function serializeSlidesOverrides(
  overrides: Record<number, SlideCustomOverride>
): string {
  return JSON.stringify(overrides);
}

function formatSlideAmount(
  amountFCFA: number = 0,
  currency: CurrencyCode = 'FCFA',
  lang: LanguageCode = 'FR'
): string {
  return formatCurrency(amountFCFA, currency, lang).replace(/[\u202F\u00A0]/g, ' ');
}

function extractConciseBullets(text: string, maxBullets: number = 6): string[] {
  if (!text || !text.trim()) return [];
  const rawLines = text
    .split(/\n+/)
    .map(l => l.replace(/^[•\-*]\s*/, '').trim())
    .filter(Boolean);
  return rawLines.slice(0, maxBullets);
}

function buildCompactSlideMatrixTable(
  matrixId: MasterMatrixId,
  rows: MatrixRowData[],
  currency: CurrencyCode,
  maxRows: number = 5
): StructuredA4Table {
  const sliced = rows.slice(0, maxRows);

  if (matrixId === 'M1') {
    return {
      headers: ['Code', 'Niveau GAR', 'Résultat Attendu', 'Indicateur SMART', 'Réf.', 'Cible', 'Atteint', 'Taux'],
      columnWidths: [9, 13, 24, 24, 7, 7, 8, 8],
      rightAlignCols: [4, 5, 6, 7],
      rows: sliced.map(r => [
        r.Code_Resultat || '—',
        r.Niveau_GAR || '—',
        r.Intitule_Resultat || '—',
        r.Indicateur_SMART || '—',
        r.Baseline || '0',
        r.Cible || '100',
        r.Valeur_Atteinte || '0',
        r['Taux_Realisation_%'] || '0%'
      ])
    };
  }

  if (matrixId === 'M2') {
    return {
      headers: ['WBS', 'Phase', 'Activité / Tâche Opérationnelle', 'Durée', 'Début Prév.', 'Fin Prév.', 'PERT / CPM', 'Avancement', 'Statut'],
      columnWidths: [8, 12, 27, 7, 10, 10, 11, 7, 8],
      rightAlignCols: [3, 7],
      rows: sliced.map(r => [
        r.Code_WBS || '—',
        r.Phase_Lot || '—',
        r.Intitule_Tache_Activite || '—',
        `${r.Duree_Jours || '0'}j`,
        r.Date_Debut_Prevue || '—',
        r.Date_Fin_Prevue || '—',
        r.Chemin_Critique_PERT || '—',
        r['Taux_Avancement_%'] || '0%',
        r.Statut_Execution || '—'
      ])
    };
  }

  if (matrixId === 'M3') {
    return {
      headers: ['Code', 'Domaine / Activité', 'Rôle / Expert', 'Charge H/J', 'R (Réalisateur)', 'A (Approbateur)', 'C (Consulté)', 'I (Informé)'],
      columnWidths: [8, 22, 16, 8, 13, 11, 11, 11],
      rightAlignCols: [3],
      rows: sliced.map(r => [
        r.Code_Acteur_Lot || '—',
        r.Domaine_Livrable_Activite || '—',
        r.Role_Poste_Expert || '—',
        `${r.Charge_Homme_Jours || '0'} H/J`,
        r.R_Realisateur || '—',
        r.A_Approbateur || '—',
        r.C_Consulte || '—',
        r.I_Informe || '—'
      ])
    };
  }

  if (matrixId === 'M4') {
    return {
      headers: ['Code', 'Institution / Groupe', 'Catégorie', 'Rôle dans le Projet', 'Pouvoir', 'Intérêt', 'Stratégie d’Engagement'],
      columnWidths: [8, 20, 14, 22, 8, 8, 20],
      rightAlignCols: [4, 5],
      rows: sliced.map(r => [
        r.Code_PP || '—',
        r.Nom_Institution_Groupe || '—',
        r.Categorie_Acteur || '—',
        r.Role_Dans_Projet || '—',
        `${r.Niveau_Pouvoir_1_5 || '5'}/5`,
        `${r.Niveau_Interet_1_5 || '5'}/5`,
        r.Strategie_Engagement || '—'
      ])
    };
  }

  if (matrixId === 'M5') {
    return {
      headers: ['Code', 'Rubrique / Activité PTBA', 'Source', `Budget (${currency})`, 'Engagé', 'Décaissé AC', 'Valeur EV', 'Déc.%', 'CPI'],
      columnWidths: [8, 25, 11, 12, 11, 11, 10, 6, 6],
      rightAlignCols: [3, 4, 5, 6, 7, 8],
      rows: sliced.map(r => [
        r.Code_Ligne_Budget || '—',
        r.Rubrique_Activite_PTBA || '—',
        r.Source_Financement || '—',
        r.Budget_Initial_BAC || '0',
        r.Budget_Engage || '0',
        r.Cout_Reel_AC || '0',
        r.Valeur_Acquise_EV || '0',
        r['Taux_Decaissement_%'] || '0%',
        r.Indice_CPI || '1.00'
      ])
    };
  }

  if (matrixId === 'M6') {
    return {
      headers: ['Code', 'Critère OCDE/CAD', 'Poids', 'Question Évaluative Principale', 'Indicateur SMART', 'Score /5', 'Appréciation'],
      columnWidths: [8, 14, 8, 30, 20, 8, 12],
      rightAlignCols: [2, 5],
      rows: sliced.map(r => [
        r.Code_QE || '—',
        r.Critere_OCDE_CAD || '—',
        r['Poids_Critere_%'] || '—',
        r.Question_Evaluative_Principale || '—',
        r.Indicateur_Reponse || '—',
        `${r.Score_1_a_5 || '4'}/5`,
        r.Appreciation_Normative || '—'
      ])
    };
  }

  if (matrixId === 'M7') {
    return {
      headers: ['Code', 'Type', 'Catégorie', 'Description du Risque / Enjeu', 'Criticité PxI', 'Stratégie & Plan d’Atténuation', 'Propriétaire', 'Statut'],
      columnWidths: [8, 11, 11, 24, 10, 20, 9, 7],
      rightAlignCols: [4],
      rows: sliced.map(r => [
        r.Code_RAID || '—',
        r.Type_Element || '—',
        r.Categorie || '—',
        r.Description_Precise || '—',
        r.Criticite_PxI || '—',
        r.Plan_Action_Mitigation || '—',
        r.Proprietaire_Risque || '—',
        r.Statut_RAID || '—'
      ])
    };
  }

  if (matrixId === 'M8') {
    return {
      headers: ['Code', 'Désignation du Marché / Acquisition', 'Catégorie', 'Mode', 'Revue', `Montant Estimé (${currency})`, 'Date DAO', 'Statut'],
      columnWidths: [9, 26, 14, 11, 11, 13, 8, 8],
      rightAlignCols: [5],
      rows: sliced.map(r => [
        r.Code_Marche || '—',
        r.Designation_Acquisition || '—',
        r.Categorie_Marche || '—',
        r.Mode_Passation || '—',
        r.Revue_Bailleur || '—',
        r.Montant_Estime || '0',
        r.Date_Lancement_DAO || '—',
        r.Statut_Marche || '—'
      ])
    };
  }

  if (matrixId === 'M9') {
    return {
      headers: ['Code', 'Intitulé du Livrable Contractuel', 'Échéance', 'Critères Qualité & Acceptation', 'Instance', 'Tranche %', 'Validation'],
      columnWidths: [9, 26, 11, 24, 12, 8, 10],
      rightAlignCols: [5],
      rows: sliced.map(r => [
        r.Code_Livrable || '—',
        r.Intitule_Livrable_Actif || '—',
        r.Date_Echeance_Prevue || '—',
        r.Criteres_Qualite_Acceptation || '—',
        r.Instance_Approbation || '—',
        r['Tranche_Paiement_Associee_%'] || '—',
        r.Statut_Validation || '—'
      ])
    };
  }

  // M10
  return {
    headers: ['Code', 'Constat / Écart Identifié', 'Recommandation & Action Corrective (CAP)', 'Priorité', 'Responsable', 'Échéance', 'Statut'],
    columnWidths: [9, 24, 28, 11, 11, 9, 8],
    rows: sliced.map(r => [
      r.Code_Action_Rec || '—',
      r.Constat_Ecart_Lecon_Identifiee || '—',
      r.Recommandation_Prescription_Action || '—',
      r.Priorite || 'Haute',
      r.Responsable_Execution || '—',
      r.Echeance_Cible || '—',
      r.Statut_Mise_En_Oeuvre || 'En cours'
    ])
  };
}

/**
 * Construit l'intégralité des diapositives 16:9 Paysage pour les 7 présentations dissociées (Docs 16 à 22)
 * en dépendance à 100 % aux onglets de l'application (Dossiers, Planification, Suivi, RACI, PERT, Kanban)
 * et aux Matrices Maîtresses M1 à M10.
 */
export function buildInstitutionalSlideDeck(
  docType: InstitutionalDocType,
  rawFields: CustomDocFields,
  dossier: Dossier,
  userProfile: UserProfile,
  currency: CurrencyCode,
  lang: LanguageCode
): StructuredSlidePage[] {
  const todayISO = getTodayISO();
  const pertSummaries = computeDossierPertSummary(dossier, todayISO);
  const allNodes = pertSummaries.flatMap(p => p.nodes);
  const raciCtx = resolveProgramRaciContext(dossier, userProfile);
  const matricesData = resolveActiveMatricesData(
    dossier,
    rawFields,
    userProfile,
    currency,
    lang,
    rawFields.matricesJson
  );

  const excludedList = parseExcludedFields(rawFields.excludedFieldsJson);
  const hideSignatures = excludedList.includes(HIDE_SIGNATURES_KEY);
  const parsedFieldPhotos = parseFieldPhotos(rawFields.fieldPhotosJson);
  const slideOverrides = parseSlidesOverrides(rawFields.slidesConfigJson);

  let totalTasks = 0;
  let completedTasks = 0;
  let inProgressTasks = 0;
  let blockedTasks = 0;
  let todoTasks = 0;
  let delayedTasks = 0;
  let totalBudgetFCFA = 0;
  let completedBudFCFA = 0;
  let inProgressBudFCFA = 0;
  let livrablesCount = 0;

  const axeSummaries: Array<{
    name: string;
    projectCount: number;
    taskCount: number;
    doneCount: number;
    budgetFCFA: number;
    projectsList: string[];
  }> = [];

  (dossier.axes || []).forEach(axe => {
    let aTasks = 0;
    let aDone = 0;
    let aBud = 0;
    const pNames: string[] = [];

    (axe.projects || []).forEach(proj => {
      pNames.push(proj.name);
      (proj.tasks || []).forEach(tk => {
        totalTasks++;
        aTasks++;
        const m = computeTaskMetrics(tk, todayISO);
        const b = Number(tk.budget) || 0;
        totalBudgetFCFA += b;
        aBud += b;
        if (tk.livrable && tk.livrable.trim()) livrablesCount++;
        if (m.effectiveStatus === 'Terminé') {
          completedTasks++;
          aDone++;
          completedBudFCFA += b;
        } else if (m.effectiveStatus === 'En cours') {
          inProgressTasks++;
          inProgressBudFCFA += b;
        } else if (m.effectiveStatus === 'Bloqué') {
          blockedTasks++;
        } else {
          todoTasks++;
        }
        if (m.ecartDebutDays > 0 || m.ecartFinDays > 0) delayedTasks++;
      });
    });

    axeSummaries.push({
      name: axe.name,
      projectCount: (axe.projects || []).length,
      taskCount: aTasks,
      doneCount: aDone,
      budgetFCFA: aBud,
      projectsList: pNames
    });
  });

  const progressPct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  const criticalNodes = allNodes.filter(n => n.isCritical);
  const criticalSeq = criticalNodes.map(n => n.code).join(' → ') || 'N/A';
  const maxDur = pertSummaries.reduce((acc, p) => Math.max(acc, p.projectDuration), 0);
  const budgetFormatted = formatSlideAmount(totalBudgetFCFA, currency, lang);

  const committedFCFA = completedBudFCFA + Math.round(inProgressBudFCFA * 0.6);
  const actualFCFA = completedBudFCFA + Math.round(inProgressBudFCFA * 0.5);
  const earnedFCFA = completedBudFCFA + Math.round(inProgressBudFCFA * 0.5);
  const committedPct =
    totalBudgetFCFA > 0 ? Math.min(100, Math.round((committedFCFA / totalBudgetFCFA) * 100)) : 0;
  const disbursementPct =
    totalBudgetFCFA > 0 ? Math.min(100, Math.round((actualFCFA / totalBudgetFCFA) * 100)) : 0;
  const earnedPct =
    totalBudgetFCFA > 0 ? Math.min(100, Math.round((earnedFCFA / totalBudgetFCFA) * 100)) : 0;
  const cpiVal = actualFCFA > 0 ? (earnedFCFA / actualFCFA).toFixed(2) : '1.00';
  const spiVal =
    totalTasks > 0
      ? Math.min(
          1.15,
          Math.max(0.75, (completedTasks + inProgressTasks * 0.5) / Math.max(1, totalTasks * 0.7))
        ).toFixed(2)
      : '1.00';

  const donorShareFCFA = Math.round(totalBudgetFCFA * 0.8);
  const nationalShareFCFA = Math.max(0, totalBudgetFCFA - donorShareFCFA);

  const donorOrg =
    rawFields.recipientOrg ||
    'Partenaires Techniques et Financiers (PNUD / Banque Mondiale / BAD / UE)';
  const donorDept =
    rawFields.donorDepartment ||
    'Direction des Opérations & du Financement des Programmes';
  const execOrg =
    rawFields.executingOrgName ||
    dossier.institution ||
    userProfile.institution ||
    'Direction Générale de la Stratégie & Pilotage des Projets';
  const execDept =
    rawFields.executingDepartment ||
    'Unité de Gestion du Projet (UGP) & Cellule Suivi-Évaluation (S&E)';
  const presenterName =
    rawFields.recipientRepresentative ||
    `${raciCtx.leadActorName} (${raciCtx.leadActorRole})`;
  const locationCity = rawFields.locationCity || 'Abidjan, République de Côte d’Ivoire';
  const dateFormatted = new Date().toLocaleDateString(lang === 'EN' ? 'en-US' : 'fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });

  // Helper function for CoverData
  const makeCoverData = (
    refCode: string,
    meetingBadge: string,
    mainTitle: string,
    subtitleLine: string
  ): SlideCoverData => ({
    leftLogo: donorOrg,
    leftDepartment: donorDept,
    rightLogo: execOrg,
    rightDepartment: execDept,
    leftOrgName: donorOrg,
    leftDeptName: donorDept,
    rightOrgName: execOrg,
    rightDeptName: execDept,
    referenceCode: refCode,
    locationAndDate: `${locationCity} • ${dateFormatted}`,
    leftLogoDataUrl: rawFields.leftLogoDataUrl,
    rightLogoDataUrl: rawFields.rightLogoDataUrl,
    bannerImageDataUrl: rawFields.bannerImageDataUrl,
    meetingBadge,
    mainTitle,
    subtitleLine,
    referenceAndDate: `Réf. ${refCode} • ${dateFormatted}`,
    presenterLine: `Présenté par : ${presenterName}`,
    locationLine: locationCity
  });

  // ============================================================================
  // GRAPHIQUES VECTORIELS TEMPS RÉEL (CAMEMBERTS / DONUTS & HISTOGRAMMES SVG/CSS)
  // ============================================================================
  const safeTotalTasks = Math.max(1, totalTasks);
  const donePct = Math.round((completedTasks / safeTotalTasks) * 100);
  const inProgPct = Math.round((inProgressTasks / safeTotalTasks) * 100);
  const delayOrTodoCount = Math.max(0, delayedTasks > 0 ? delayedTasks : todoTasks);
  const delayPct = Math.round((delayOrTodoCount / safeTotalTasks) * 100);
  const blockedPct = Math.max(0, Math.round((blockedTasks / safeTotalTasks) * 100));

  const wbsStatusDonutChart: SlideChartConfig = {
    type: 'donut',
    title: 'Répartition du Statut des Tâches WBS / Kanban',
    subtitle: `Suivi temps réel sur ${totalTasks} activité(s) opérationnelle(s) du portefeuille`,
    centerLabel: 'Avancement',
    centerValue: `${progressPct}%`,
    items: [
      {
        label: 'Terminées (Validées)',
        value: Math.max(completedTasks, donePct > 0 ? completedTasks : 1),
        displayValue: `${completedTasks} tâche(s) (${donePct}%)`,
        pct: donePct,
        colorHex: '#10b981',
        sublabel: 'Livrables réceptionnés'
      },
      {
        label: 'En cours d’exécution',
        value: Math.max(inProgressTasks, 1),
        displayValue: `${inProgressTasks} tâche(s) (${inProgPct}%)`,
        pct: inProgPct,
        colorHex: '#ea580c',
        sublabel: 'Mobilisation active'
      },
      {
        label: delayedTasks > 0 ? 'En retard / Écart planning' : 'À lancer / Planifiées',
        value: Math.max(delayOrTodoCount, 1),
        displayValue: `${delayOrTodoCount} tâche(s) (${delayPct}%)`,
        pct: delayPct,
        colorHex: '#f59e0b',
        sublabel: delayedTasks > 0 ? 'Vigilance chemin critique' : 'File d’attente WBS'
      },
      {
        label: 'Bloquées (Goulots)',
        value: Math.max(blockedTasks, 0),
        displayValue: `${blockedTasks} tâche(s) (${blockedPct}%)`,
        pct: blockedPct,
        colorHex: '#e11d48',
        sublabel: 'Arbitrage requis'
      }
    ]
  };

  const axeColors = ['#c2410c', '#ea580c', '#10b981', '#f59e0b', '#6366f1', '#ec4899'];
  const budgetSplitDonutChart: SlideChartConfig = {
    type: 'donut',
    title: 'Ventilation Budgétaire par Axe / Source (Matrice M5)',
    subtitle: `Enveloppe globale : ${budgetFormatted} (80% PTF / 20% État)`,
    centerLabel: 'Budget Total',
    centerValue: `${axeSummaries.length || 1} Axe(s)`,
    items:
      axeSummaries.length > 0
        ? axeSummaries.map((ax, i) => {
            const pct =
              totalBudgetFCFA > 0 ? Math.round((ax.budgetFCFA / totalBudgetFCFA) * 100) : Math.round(100 / axeSummaries.length);
            return {
              label: ax.name,
              value: Math.max(1, ax.budgetFCFA),
              displayValue: `${formatSlideAmount(ax.budgetFCFA, currency, lang)} (${pct}%)`,
              pct,
              colorHex: axeColors[i % axeColors.length],
              sublabel: `${ax.projectCount} projet(s) • ${ax.taskCount} tâches`
            };
          })
        : [
            {
              label: 'Financement Bailleur (PTF - 80%)',
              value: Math.max(1, donorShareFCFA),
              displayValue: `${formatSlideAmount(donorShareFCFA, currency, lang)} (80%)`,
              pct: 80,
              colorHex: '#c2410c',
              sublabel: 'Concours extérieur'
            },
            {
              label: 'Contrepartie Nationale (État - 20%)',
              value: Math.max(1, nationalShareFCFA),
              displayValue: `${formatSlideAmount(nationalShareFCFA, currency, lang)} (20%)`,
              pct: 20,
              colorHex: '#10b981',
              sublabel: 'Ressources propres'
            }
          ]
  };

  const evmComparisonBarChart: SlideChartConfig = {
    type: 'bar',
    title: 'Comparaison Financière EVM (Matrice M5)',
    subtitle: `Indice d’Efficience des Coûts CPI = ${cpiVal} • Indice de Délai SPI = ${spiVal}`,
    unitLabel: currency,
    items: [
      {
        label: 'Budget Initial (BAC)',
        value: totalBudgetFCFA,
        displayValue: `${budgetFormatted} (100%)`,
        pct: 100,
        colorHex: '#c2410c',
        sublabel: 'Dotation de référence'
      },
      {
        label: 'Budget Engagé (Contrats)',
        value: committedFCFA,
        displayValue: `${formatSlideAmount(committedFCFA, currency, lang)} (${committedPct}%)`,
        pct: committedPct,
        colorHex: '#ea580c',
        sublabel: 'Engagements juridiques'
      },
      {
        label: 'Coût Réel Décaissé (AC)',
        value: actualFCFA,
        displayValue: `${formatSlideAmount(actualFCFA, currency, lang)} (${disbursementPct}%)`,
        pct: disbursementPct,
        colorHex: '#f59e0b',
        sublabel: 'Paiements effectifs'
      },
      {
        label: 'Valeur Acquise (EV)',
        value: earnedFCFA,
        displayValue: `${formatSlideAmount(earnedFCFA, currency, lang)} (${earnedPct}%)`,
        pct: earnedPct,
        colorHex: '#10b981',
        sublabel: 'Valeur physique produite'
      }
    ]
  };

  // Calcul des scores OCDE/CAD (sur 5) depuis la Matrice M6
  const ocdeCriteriaDefaults = [
    { key: 'Pertinence', color: '#c2410c', defaultScore: 4.5 },
    { key: 'Cohérence', color: '#ea580c', defaultScore: 4.3 },
    { key: 'Efficacité', color: '#10b981', defaultScore: progressPct >= 75 ? 4.4 : progressPct >= 50 ? 3.9 : 3.5 },
    { key: 'Efficience', color: '#0d9488', defaultScore: Number(cpiVal) >= 1 ? 4.3 : 3.7 },
    { key: 'Impact', color: '#f59e0b', defaultScore: 4.1 },
    { key: 'Durabilité', color: '#6366f1', defaultScore: 4.0 }
  ];

  const ocdeChartItems: SlideChartItem[] = ocdeCriteriaDefaults.map((crit, idx) => {
    const row = matricesData.M6[idx] || matricesData.M6.find(r => (r.Critere_OCDE_CAD || '').toLowerCase().includes(crit.key.toLowerCase()));
    const parsedScore = row ? parseFloat(String(row.Score_1_a_5 || '').replace(',', '.')) : NaN;
    const score = !isNaN(parsedScore) && parsedScore > 0 ? Math.min(5, parsedScore) : crit.defaultScore;
    const pct = Math.round((score / 5) * 100);
    return {
      label: crit.key,
      value: score,
      displayValue: `${score.toFixed(1)} / 5 (${pct}%)`,
      pct,
      colorHex: crit.color,
      sublabel: row?.Appreciation_Normative || (score >= 4 ? 'Très satisfaisant' : 'Satisfaisant')
    };
  });

  const avgOcdeScore = (
    ocdeChartItems.reduce((acc, item) => acc + item.value, 0) / Math.max(1, ocdeChartItems.length)
  ).toFixed(1);

  const ocdeScoresBarChart: SlideChartConfig = {
    type: 'bar',
    title: 'Scores par Critère OCDE / CAD (Notés sur 5)',
    subtitle: `Note globale consolidée : ${avgOcdeScore} / 5 • Standards OCDE/CAD & UNEG`,
    unitLabel: '/ 5',
    items: ocdeChartItems
  };

  // Graphique Taux d'exécution trimestriel (Q1, Q2, Q3, Q4) pour PTBA (Doc 19)
  const q1Bud = Math.round(totalBudgetFCFA * 0.2);
  const q2Bud = Math.round(totalBudgetFCFA * 0.3);
  const q3Bud = Math.round(totalBudgetFCFA * 0.3);
  const q4Bud = Math.max(0, totalBudgetFCFA - q1Bud - q2Bud - q3Bud);

  const quarterlyPtbaBarChart: SlideChartConfig = {
    type: 'bar',
    title: 'Taux d’Exécution & Programmation Trimestrielle (Q1 à Q4)',
    subtitle: `Ventilation annuelle PTBA sur ${budgetFormatted} • Cible d’absorption : 100%`,
    unitLabel: '%',
    items: [
      {
        label: 'Trimestre 1 (Q1 - Amorçage)',
        value: q1Bud,
        displayValue: `${formatSlideAmount(q1Bud, currency, lang)} (20% du PTBA)`,
        pct: Math.min(100, Math.max(20, progressPct > 20 ? 95 : 65)),
        colorHex: '#c2410c',
        sublabel: '20% allocation annuelle'
      },
      {
        label: 'Trimestre 2 (Q2 - Montée en charge)',
        value: q2Bud,
        displayValue: `${formatSlideAmount(q2Bud, currency, lang)} (30% du PTBA)`,
        pct: Math.min(100, Math.max(30, progressPct > 50 ? 88 : 60)),
        colorHex: '#ea580c',
        sublabel: '30% allocation annuelle'
      },
      {
        label: 'Trimestre 3 (Q3 - Plein régime)',
        value: q3Bud,
        displayValue: `${formatSlideAmount(q3Bud, currency, lang)} (30% du PTBA)`,
        pct: Math.min(100, Math.max(30, progressPct > 75 ? 82 : 55)),
        colorHex: '#10b981',
        sublabel: '30% allocation annuelle'
      },
      {
        label: 'Trimestre 4 (Q4 - Clôture annuelle)',
        value: q4Bud,
        displayValue: `${formatSlideAmount(q4Bud, currency, lang)} (20% du PTBA)`,
        pct: Math.min(100, Math.max(20, progressPct > 90 ? 90 : 45)),
        colorHex: '#f59e0b',
        sublabel: '20% allocation annuelle'
      }
    ]
  };

  // Graphique Taux d'exécution mensuel (M1, M2, M3) pour PTT (Doc 20)
  const activeQuarter = rawFields.activeQuarter || 'Q1';
  const quarterWeight = activeQuarter === 'Q1' || activeQuarter === 'Q4' ? 0.25 : 0.3;
  const quarterBudFCFA = Math.round(totalBudgetFCFA * quarterWeight);
  const m1Bud = Math.round(quarterBudFCFA * 0.3);
  const m2Bud = Math.round(quarterBudFCFA * 0.4);
  const m3Bud = Math.max(0, quarterBudFCFA - m1Bud - m2Bud);

  const monthlyPttBarChart: SlideChartConfig = {
    type: 'bar',
    title: `Taux d’Exécution Mensuel (M1, M2, M3) — Trimestre ${activeQuarter}`,
    subtitle: `Dotation trimestrielle ${activeQuarter} : ${formatSlideAmount(quarterBudFCFA, currency, lang)} ( Horizon 90 jours )`,
    unitLabel: '%',
    items: [
      {
        label: `Mois 1 (${activeQuarter}-M1 : Lancement)`,
        value: m1Bud,
        displayValue: `${formatSlideAmount(m1Bud, currency, lang)} (30% de ${activeQuarter})`,
        pct: Math.min(100, Math.max(35, progressPct + 15)),
        colorHex: '#c2410c',
        sublabel: 'Cadrage & ordres de service'
      },
      {
        label: `Mois 2 (${activeQuarter}-M2 : Production)`,
        value: m2Bud,
        displayValue: `${formatSlideAmount(m2Bud, currency, lang)} (40% de ${activeQuarter})`,
        pct: Math.min(100, Math.max(40, progressPct)),
        colorHex: '#ea580c',
        sublabel: 'Exécution terrain & livrables'
      },
      {
        label: `Mois 3 (${activeQuarter}-M3 : Réception)`,
        value: m3Bud,
        displayValue: `${formatSlideAmount(m3Bud, currency, lang)} (30% de ${activeQuarter})`,
        pct: Math.min(100, Math.max(30, disbursementPct)),
        colorHex: '#10b981',
        sublabel: 'Validation & décomptes'
      }
    ]
  };

  type RawSlideSeed = Omit<
    StructuredSlidePage,
    'slideNumber' | 'displaySlideNumber' | 'totalDisplaySlides' | 'excluded' | 'bullets'
  >;

  const rawSlides: RawSlideSeed[] = [];

  // ============================================================================
  // 16. PRÉSENTATION DU PROGRAMME (BASÉE SUR LES TDR) — 10 SLIDES
  // Matrices auto-activées : M1, M2, M3, M5, M9
  // ============================================================================
  if (docType === 'slides_tdr') {
    const refCode = rawFields.referenceCode || `SLIDES-TDR-${dossier.psdYear || 2026}-016`;

    // Slide 1 : Couverture 16:9
    rawSlides.push({
      isCoverSlide: true,
      matrixBadge: 'COUVERTURE OFFICIELLE 16:9 • PRÉSENTATION DU PROGRAMME (TDR)',
      title: 'PRÉSENTATION DU PROGRAMME (BASÉE SUR LES TERMES DE RÉFÉRENCE — TDR)',
      subtitle: `${dossier.name} • Horizon ${dossier.horizonPlan} • Enveloppe : ${budgetFormatted}`,
      contentText: [
        `Intitulé du Programme : ${dossier.name} (${dossier.horizonPlan})`,
        `Périmètre : ${(dossier.axes || []).length} Axe(s) Stratégique(s) • ${pertSummaries.length} Projet(s) • ${totalTasks} Activités & Jalons WBS`,
        `Chemin Critique PERT/CPM : ${criticalSeq} (Durée critique incompressible : ${maxDur} jours ouvrés)`,
        `Enveloppe Budgétaire Globale : ${budgetFormatted} (${currency})`,
        `Orateur / Chef de Mission : ${presenterName}`
      ].join('\n'),
      layout: 'two_columns',
      kpiCards: [
        { label: 'Axes Stratégiques', value: String((dossier.axes || []).length), subtext: `${pertSummaries.length} Projet(s) actifs`, accent: 'primary' },
        { label: 'Activités WBS', value: String(totalTasks), subtext: `${livrablesCount || totalTasks} Livrables attendus`, accent: 'sky' },
        { label: 'Durée Critique PERT', value: `${maxDur}j`, subtext: `${criticalNodes.length} tâches critiques`, accent: 'amber' },
        { label: 'Budget Consolidé', value: budgetFormatted, subtext: `Devise : ${currency}`, accent: 'emerald' }
      ],
      threeCards: [],
      coverData: makeCoverData(
        refCode,
        'PRÉSENTATION OFFICIELLE DU PROGRAMME (TDR)',
        'PRÉSENTATION DU PROGRAMME (BASÉE SUR LES TDR)',
        `${dossier.name} (${dossier.horizonPlan})`
      )
    });

    // Slide 2 : Contexte Stratégique, Justification & Alignement Institutionnel
    rawSlides.push({
      matrixBadge: 'CADRAGE STRATÉGIQUE • ALIGNEMENT INSTITUTIONNEL',
      title: 'CONTEXTE STRATÉGIQUE, JUSTIFICATION & ALIGNEMENT INSTITUTIONNEL',
      subtitle: `Ancrage dans le Plan Stratégique (${dossier.horizonPlan}) et réponse aux défis sectoriels prioritaires`,
      contentText: [
        rawFields.contextJustification ||
          `Le programme « ${dossier.name} » opérationnalise la vision stratégique de ${execOrg} sur la période ${dossier.horizonPlan}.`,
        `Problématique centrale : Nécessité d’accélérer la délivrance des résultats opérationnels sur ${(dossier.axes || []).length} axe(s) d’intervention.`,
        `Alignement avec les priorités nationales (PND) et les engagements auprès des Partenaires Techniques et Financiers (${donorOrg}).`,
        `Approche axée sur la Gestion Axée sur les Résultats (GAR), la maîtrise du chemin critique PERT et la redevabilité RACI.`,
        `Objectif de transformation : Maximiser l’impact mesurable auprès des bénéficiaires cibles dans le respect de l’enveloppe de ${budgetFormatted}.`
      ].join('\n'),
      layout: 'three_cards',
      kpiCards: [
        { label: 'Horizon Programme', value: dossier.horizonPlan || '2025-2027', subtext: `Année réf. ${dossier.psdYear || 2026}`, accent: 'primary' },
        { label: 'Ancrage GAR', value: '100%', subtext: `${matricesData.M1.length} Résultats M1`, accent: 'emerald' },
        { label: 'Portefeuille Actif', value: `${pertSummaries.length} Projets`, subtext: `${totalTasks} activités WBS`, accent: 'sky' }
      ],
      threeCards: [
        {
          title: '1. Diagnostic & Enjeux',
          badge: 'Justification',
          bullets: [
            `Réponse structurée aux besoins prioritaires identifiés dans le dossier « ${dossier.name} »`,
            `Structuration en ${(dossier.axes || []).length} axe(s) stratégique(s) complémentaires`,
            'Concentration des ressources sur les activités à fort impact'
          ]
        },
        {
          title: '2. Alignement Stratégique',
          badge: 'Conformité PTF',
          bullets: [
            `Conformité aux standards internationaux (OCDE/CAD, Banque Mondiale, PNUD)`,
            `Synergie directe avec les orientations de ${execOrg}`,
            'Traçabilité complète entre objectifs, livrables et budget'
          ]
        },
        {
          title: '3. Valeur Ajoutée du Programme',
          badge: 'Impact Cible',
          bullets: [
            `Ordonnancement scientifique par réseau PERT (${maxDur} jours ouvrés)`,
            `Gouvernance RACI claire mobilisant ${raciCtx.allActors.length} acteurs clés`,
            'Mécanisme de suivi-évaluation intégré dès la conception'
          ]
        }
      ]
    });

    // Slide 3 : Objectifs du Programme & Cadre de Résultats GAR (M1)
    rawSlides.push({
      matrixBadge: 'MATRICE M1 • CADRE LOGIQUE & RÉSULTATS GAR',
      connectedMatrixId: 'M1',
      title: 'OBJECTIFS DU PROGRAMME & CADRE DE RÉSULTATS GAR (MATRICE M1)',
      subtitle: 'Hiérarchie logique entre Impact global, Effets par Axe et Produits opérationnels mesurables',
      contentText: [
        rawFields.specificObjectives ||
          `Objectif Général : Assurer la réalisation intégrale des ${(dossier.axes || []).length} axes stratégiques du portefeuille « ${dossier.name} ».`,
        `Indicateurs SMART suivis dans la Matrice M1 : ${matricesData.M1.length} ligne(s) de résultats (Impact, Effets, Produits).`,
        `Taux d’avancement physique consolidé à date : ${progressPct}% (${completedTasks} tâches terminées sur ${totalTasks}).`,
        `Chaque produit est adossé à une valeur de référence (Baseline), une cible chiffrée et des sources de vérification officielles.`
      ].join('\n'),
      layout: 'full_matrix',
      kpiCards: [
        { label: 'Chaîne de Résultats M1', value: `${matricesData.M1.length} Lignes`, subtext: 'Impact • Effets • Produits', accent: 'primary' },
        { label: 'Avancement Physique', value: `${progressPct}%`, subtext: `${completedTasks}/${totalTasks} activités validées`, accent: 'emerald' },
        { label: 'Cible d’Achèvement', value: '100%', subtext: 'Conformité aux TDR', accent: 'sky' }
      ],
      threeCards: [],
      table: buildCompactSlideMatrixTable('M1', matricesData.M1, currency, 5)
    });

    // Slide 4 : Architecture des Axes Stratégiques & Composantes + Donut WBS
    rawSlides.push({
      matrixBadge: 'ARCHITECTURE DU PORTEFEUILLE • AXES & STATUT WBS',
      title: 'ARCHITECTURE DES AXES STRATÉGIQUES & STATUT OPÉRATIONNEL WBS',
      subtitle: 'Déclinaison opérationnelle du programme en axes d’intervention et répartition temps réel des tâches',
      contentText: axeSummaries
        .map(
          (ax, idx) =>
            `Axe ${idx + 1} — ${ax.name} : ${ax.projectCount} projet(s), ${ax.taskCount} activités (${ax.doneCount} terminées), Budget = ${formatSlideAmount(ax.budgetFCFA, currency, lang)}`
        )
        .concat([
          `Total consolidé : ${(dossier.axes || []).length} Axe(s), ${pertSummaries.length} Projet(s), ${totalTasks} Tâches WBS pour un budget de ${budgetFormatted}.`
        ])
        .join('\n'),
      layout: 'two_columns',
      chart: wbsStatusDonutChart,
      kpiCards: [
        { label: 'Axes Stratégiques', value: String((dossier.axes || []).length), subtext: 'Composantes majeures', accent: 'primary' },
        { label: 'Projets Rattachés', value: String(pertSummaries.length), subtext: 'Lots opérationnels', accent: 'sky' },
        { label: 'Enveloppe Globale', value: budgetFormatted, subtext: '100% ventilée par axe', accent: 'emerald' }
      ],
      threeCards: axeSummaries.slice(0, 3).map((ax, idx) => ({
        title: `Axe ${idx + 1} : ${ax.name}`,
        badge: formatSlideAmount(ax.budgetFCFA, currency, lang),
        bullets: [
          `${ax.projectCount} projet(s) : ${ax.projectsList.join(', ') || 'Projets rattachés'}`,
          `${ax.taskCount} activité(s) programmée(s) (${ax.doneCount} achevée(s))`,
          `Poids budgétaire : ${totalBudgetFCFA > 0 ? Math.round((ax.budgetFCFA / totalBudgetFCFA) * 100) : 0}% du portefeuille`
        ]
      }))
    });

    // Slide 5 : Périmètre Technique, Méthodologie & Plan de Travail WBS (M2)
    rawSlides.push({
      matrixBadge: 'MATRICE M2 • STRUCTURE DE DÉCOUPAGE WBS & MÉTHODOLOGIE',
      connectedMatrixId: 'M2',
      title: 'PÉRIMÈTRE TECHNIQUE, MÉTHODOLOGIE & PLAN DE TRAVAIL WBS (M2)',
      subtitle: 'Découpage analytique des tâches, durées unitaires, séquencement et jalons de contrôle',
      contentText: [
        rawFields.methodologyApproach ||
          `Approche méthodologique structurée autour de ${totalTasks} activités WBS codifiées et reliées par dépendances logiques.`,
        `Décomposition granulaire dans la Matrice M2 : chaque tâche possède une durée (jours), une date de début/fin et un statut Kanban.`,
        `État d’exécution actuel : ${completedTasks} Terminée(s), ${inProgressTasks} En cours, ${todoTasks} À faire, ${blockedTasks} Bloquée(s).`,
        `Contrôle qualité systématique à chaque fin de phase avant passage au lot suivant.`
      ].join('\n'),
      layout: 'full_matrix',
      kpiCards: [
        { label: 'Tâches WBS (M2)', value: String(totalTasks), subtext: `${completedTasks} terminées • ${inProgressTasks} en cours`, accent: 'primary' },
        { label: 'Tâches Critiques', value: String(criticalNodes.length), subtext: 'Marge totale nulle (0j)', accent: 'amber' },
        { label: 'Goulots / Blocages', value: String(blockedTasks), subtext: `${delayedTasks} tâche(s) avec écart`, accent: blockedTasks > 0 ? 'rose' : 'emerald' }
      ],
      threeCards: [],
      table: buildCompactSlideMatrixTable('M2', matricesData.M2, currency, 5)
    });

    // Slide 6 : Calendrier Maître & Analyse du Chemin Critique PERT/CPM
    rawSlides.push({
      matrixBadge: 'INGÉNIERIE TEMPORELLE • RÉSEAU PERT / CPM (M2)',
      connectedMatrixId: 'M2',
      title: 'CALENDRIER MAÎTRE D’EXÉCUTION & CHEMIN CRITIQUE PERT / CPM',
      subtitle: `Séquence critique incompressible : ${criticalSeq} • Durée totale : ${maxDur} jours ouvrés`,
      contentText: [
        `Durée totale incompressible du programme (Chemin Critique CPM) : ${maxDur} jours ouvrés.`,
        `Séquence des tâches critiques (Marge Libre = 0j / Marge Totale = 0j) : ${criticalSeq}.`,
        `Nombre d’activités sur le chemin critique : ${criticalNodes.length} sur ${totalTasks} tâches (${totalTasks > 0 ? Math.round((criticalNodes.length / totalTasks) * 100) : 0}%).`,
        `Surveillance prioritaire : Tout retard d’un jour sur l’une des tâches (${criticalSeq}) décale d’autant la date de livraison finale.`,
        `Mesure de maîtrise : Allocation prioritaire des ressources aux activités à marge nulle et revue hebdomadaire d’avancement.`
      ].join('\n'),
      layout: 'three_cards',
      kpiCards: [
        { label: 'Durée Critique Totale', value: `${maxDur} Jours`, subtext: 'Horizon incompressible', accent: 'primary' },
        { label: 'Chaîne Critique CPM', value: `${criticalNodes.length} Tâches`, subtext: criticalSeq, accent: 'amber' },
        { label: 'Activités à Marge > 0', value: `${Math.max(0, totalTasks - criticalNodes.length)} Tâches`, subtext: 'Flexibilité opérationnelle', accent: 'emerald' }
      ],
      threeCards: [
        {
          title: '1. Nœuds Critiques (Marge 0j)',
          badge: 'Priorité Absolue',
          bullets: criticalNodes.slice(0, 4).map(
            n => `[${n.code}] ${n.name} — Durée : ${n.duration}j (ES:${n.es} → EF:${n.ef})`
          )
        },
        {
          title: '2. Gestion des Marges Libres',
          badge: 'Optimisation',
          bullets: [
            `${Math.max(0, totalTasks - criticalNodes.length)} activité(s) disposent d’une marge de manœuvre positive`,
            'Possibilité de lissage des ressources sans impacter la date de fin',
            'Absorption maîtrisée des aléas mineurs hors chemin critique'
          ]
        },
        {
          title: '3. Dispositif Anti-Dérive',
          badge: `SPI = ${spiVal}`,
          bullets: [
            `Suivi en temps réel des écarts de début et de fin (${delayedTasks} écart(s) détecté(s))`,
            'Replanification dynamique en cas de blocage technique',
            'Validation formelle de chaque jalon critique en comité restreint'
          ]
        }
      ]
    });

    // Slide 7 : Livrables Attendus & Critères de Validation Qualité (M9)
    rawSlides.push({
      matrixBadge: 'MATRICE M9 • CATALOGUE DES LIVRABLES & QUALITÉ',
      connectedMatrixId: 'M9',
      title: 'LIVRABLES ATTENDUS, ÉCHÉANCES & CRITÈRES D’ACCEPTATION (M9)',
      subtitle: 'Nomenclature contractuelle des livrables, normes de contrôle qualité et conditionnalité des paiements',
      contentText: [
        rawFields.governanceModalities ||
          `Le programme génère ${matricesData.M9.length} livrable(s) contractuel(s) tracé(s) dans la Matrice M9.`,
        `Chaque livrable fait l’objet d’une revue technique contradictoire avant émission du Procès-Verbal de réception.`,
        `Conditionnalité financière : Les décaissements par tranches sont directement indexés sur la validation des livrables clés.`,
        `Archivage probant : Constitution d’un dossier de preuves documentaires et visuelles pour chaque extrant validé.`
      ].join('\n'),
      layout: 'full_matrix',
      kpiCards: [
        { label: 'Livrables Contractuels', value: String(matricesData.M9.length), subtext: 'Matrice M9 connectée', accent: 'primary' },
        { label: 'Livrables Validés', value: String(completedTasks), subtext: `Taux : ${progressPct}%`, accent: 'emerald' },
        { label: 'Instance d’Approbation', value: 'COPIL / UGP', subtext: 'Validation contradictoire', accent: 'sky' }
      ],
      threeCards: [],
      table: buildCompactSlideMatrixTable('M9', matricesData.M9, currency, 5)
    });

    // Slide 8 : Équipe Clé, Profils d'Experts & Matrice RACI (M3)
    rawSlides.push({
      matrixBadge: 'MATRICE M3 • EXPERTISE CLÉ & GOUVERNANCE RACI',
      connectedMatrixId: 'M3',
      title: 'PROFILS DES EXPERTS CLÉS, CHARGES H/J & MATRICE RACI (M3)',
      subtitle: `Distribution des responsabilités (R, A, C, I) autour du Chef de Mission : ${raciCtx.leadActorName}`,
      contentText: [
        rawFields.governanceModalities ||
          `Mobilisation d’une équipe pluridisciplinaire de ${raciCtx.allActors.length} acteur(s) référencé(s) dans la matrice RACI du programme.`,
        `Chef de Projet / Responsable Principal : ${raciCtx.leadActorName} (${raciCtx.leadActorRole}).`,
        `Clarification stricte des rôles : Réalisateur opérationnel (R), Approbateur unique (A), Experts consultés (C) et Parties informées (I).`,
        `Adéquation charge / capacité vérifiée sur les ${maxDur} jours ouvrés d’exécution.`
      ].join('\n'),
      layout: 'full_matrix',
      kpiCards: [
        { label: 'Équipe Mobilisée', value: `${raciCtx.allActors.length} Acteurs`, subtext: 'Matrice RACI active', accent: 'primary' },
        { label: 'Chef de Mission (A/R)', value: raciCtx.leadActorName, subtext: raciCtx.leadActorRole, accent: 'sky' },
        { label: 'Couverture RACI', value: '100%', subtext: `${matricesData.M3.length} lots d’affectation`, accent: 'emerald' }
      ],
      threeCards: [],
      table: buildCompactSlideMatrixTable('M3', matricesData.M3, currency, 5)
    });

    // Slide 9 : Enveloppe Budgétaire Prévisionnelle & Ventilation par Axe (M5) + Donut Budget
    rawSlides.push({
      matrixBadge: 'MATRICE M5 • STRUCTURE BUDGÉTAIRE & FINANCEMENT',
      connectedMatrixId: 'M5',
      title: 'BUDGET PRÉVISIONNEL, VENTILATION PAR AXE & MODALITÉS DE PAIEMENT (M5)',
      subtitle: `Enveloppe globale : ${budgetFormatted} • Répartition par composante et échéancier de décaissement`,
      contentText: [
        `Dotation budgétaire totale arrêtée pour le programme : ${budgetFormatted} (${currency}).`,
        `Part Partenaires Techniques & Financiers (80%) : ${formatSlideAmount(donorShareFCFA, currency, lang)}.`,
        `Part Contrepartie Nationale / Structure Pilote (20%) : ${formatSlideAmount(nationalShareFCFA, currency, lang)}.`,
        `Modalités de règlement : 20% à la signature/démarrage, 40% sur livrables intermédiaires, 40% à la réception finale.`,
        `Indice d’efficience budgétaire cible (CPI) : ≥ 1.00 (actuel : ${cpiVal}).`
      ].join('\n'),
      layout: 'two_columns',
      chart: budgetSplitDonutChart,
      kpiCards: [
        { label: 'Budget Total (BAC)', value: budgetFormatted, subtext: `${matricesData.M5.length} lignes budgétaires M5`, accent: 'primary' },
        { label: 'Financement Bailleur', value: formatSlideAmount(donorShareFCFA, currency, lang), subtext: '80% de l’enveloppe', accent: 'sky' },
        { label: 'Contrepartie Nationale', value: formatSlideAmount(nationalShareFCFA, currency, lang), subtext: '20% de cofinancement', accent: 'emerald' }
      ],
      threeCards: [],
      table: buildCompactSlideMatrixTable('M5', matricesData.M5, currency, 4)
    });

    // Slide 10 : Gouvernance, Prochaines Étapes & Validation des TDR
    rawSlides.push({
      isFinalSlide: true,
      matrixBadge: 'DÉCISION DU COMITÉ • APPROBATION DES TDR & LANCEMENT',
      title: 'GOUVERNANCE, FEUILLE DE ROUTE DE MOBILISATION & VALIDATION DES TDR',
      subtitle: 'Instances de pilotage, jalons immédiats de démarrage et signature pour approbation officielle',
      contentText: [
        `Validation officielle des Termes de Référence (TDR) et de l’architecture des ${(dossier.axes || []).length} axe(s) stratégique(s).`,
        `Approbation de l’enveloppe budgétaire de ${budgetFormatted} et du calendrier maître de ${maxDur} jours ouvrés.`,
        `Mandat donné à ${raciCtx.leadActorName} (${execOrg}) pour enclencher immédiatement la phase de mobilisation.`,
        `Prochain jalon statutaire : Atelier de cadrage méthodologique et soumission du Rapport de Démarrage (Inception Report).`,
        `Décision soumise au Comité : Approbation sans réserve et lancement opérationnel des activités.`
      ].join('\n'),
      layout: 'three_cards',
      kpiCards: [
        { label: 'Statut des TDR', value: 'Prêt pour Accord', subtext: `Réf. ${refCode}`, accent: 'emerald' },
        { label: 'Délai Mobilisation', value: 'J + 7', subtext: 'Notification & Ordre de service', accent: 'primary' },
        { label: 'Instance Décisionnelle', value: 'COPIL', subtext: donorOrg, accent: 'sky' }
      ],
      threeCards: [
        {
          title: '1. Validation Immédiate (J0)',
          badge: 'Décision Séance',
          bullets: [
            'Approbation du périmètre technique et des objectifs GAR (M1)',
            `Validation du budget de ${budgetFormatted} (M5)`,
            'Adoption de la matrice RACI et des profils clés (M3)'
          ]
        },
        {
          title: '2. Mobilisation (J+1 à J+15)',
          badge: 'Court Terme',
          bullets: [
            'Émission de l’Ordre de Service de démarrage',
            'Installation de l’équipe projet et collecte documentaire',
            `Lancement des premières tâches du chemin critique (${criticalSeq})`
          ]
        },
        {
          title: '3. Suivi & Redevabilité',
          badge: 'Cycle Continu',
          bullets: [
            'Point d’avancement hebdomadaire sur les tâches WBS',
            'Réception formelle des livrables selon la Matrice M9',
            'Reporting mensuel et trimestriel au Comité de Pilotage'
          ]
        }
      ],
      includeSignatures: !hideSignatures,
      orgStampDataUrl: hideSignatures ? undefined : rawFields.orgStampDataUrl,
      partnerStampDataUrl: hideSignatures ? undefined : rawFields.partnerStampDataUrl
    });
  }

  // ============================================================================
  // 17. PRÉSENTATION DU RAPPORT DE CADRAGE — 11 SLIDES
  // Matrices auto-activées : M1, M2, M3, M4, M5, M7, M9
  // ============================================================================
  else if (docType === 'slides_cadrage') {
    const refCode = rawFields.referenceCode || `SLIDES-CAD-${dossier.psdYear || 2026}-017`;

    // Slide 1 : Couverture 16:9
    rawSlides.push({
      isCoverSlide: true,
      matrixBadge: 'COUVERTURE OFFICIELLE 16:9 • PRÉSENTATION DU RAPPORT DE CADRAGE',
      title: 'PRÉSENTATION DU RAPPORT DE CADRAGE MÉTHODOLOGIQUE & OPÉRATIONNEL',
      subtitle: `${dossier.name} • Périmètre stabilisé, gouvernance et feuille de route de référence`,
      contentText: [
        `Objet de la séance : Validation de la Note de Cadrage Méthodologique du programme « ${dossier.name} »`,
        `Périmètre stabilisé : ${(dossier.axes || []).length} Axe(s), ${pertSummaries.length} Projet(s), ${totalTasks} Activités WBS`,
        `Gouvernance : ${raciCtx.allActors.length} acteurs RACI mobilisés et ${matricesData.M4.length} parties prenantes cartographiées`,
        `Plafond budgétaire validé : ${budgetFormatted} • Durée critique PERT : ${maxDur} jours ouvrés`,
        `Chef de Mission : ${presenterName}`
      ].join('\n'),
      layout: 'two_columns',
      kpiCards: [
        { label: 'Portée Cadrage', value: `${(dossier.axes || []).length} Axes / ${pertSummaries.length} Projets`, subtext: `${totalTasks} activités WBS`, accent: 'primary' },
        { label: 'Parties Prenantes', value: String(matricesData.M4.length), subtext: `${raciCtx.allActors.length} acteurs RACI`, accent: 'sky' },
        { label: 'Chemin Critique', value: `${maxDur}j`, subtext: `${criticalNodes.length} nœuds critiques`, accent: 'amber' },
        { label: 'Plafond Budgétaire', value: budgetFormatted, subtext: 'Baseline financière M5', accent: 'emerald' }
      ],
      threeCards: [],
      coverData: makeCoverData(
        refCode,
        'COMITÉ DE VALIDATION DU RAPPORT DE CADRAGE',
        'PRÉSENTATION DU RAPPORT DE CADRAGE',
        `${dossier.name} (${dossier.horizonPlan})`
      )
    });

    // Slide 2 : Rappel du Mandat, Enjeux & Alignement Stratégique
    rawSlides.push({
      matrixBadge: 'MANDAT INSTITUTIONNEL • OBJECTIFS DU CADRAGE',
      title: 'RAPPEL DU MANDAT, ENJEUX DE CADRAGE & ALIGNEMENT STRATÉGIQUE',
      subtitle: 'Stabilisation du périmètre d’intervention, des hypothèses structurantes et des attentes du Commanditaire',
      contentText: [
        rawFields.contextJustification ||
          `La phase de cadrage vise à sécuriser toutes les conditions méthodologiques, techniques et institutionnelles du programme « ${dossier.name} ».`,
        `Alignement confirmé entre les attentes de ${donorOrg} et la capacité d’exécution de ${execOrg}.`,
        `Clarification des frontières du projet (In-Scope / Out-of-Scope) autour de ${(dossier.axes || []).length} axe(s) stratégique(s).`,
        `Validation des normes de qualité applicables aux ${matricesData.M9.length} livrables contractuels.`
      ].join('\n'),
      layout: 'three_cards',
      kpiCards: [
        { label: 'Axes Stabilisés', value: String((dossier.axes || []).length), subtext: 'Périmètre confirmé', accent: 'primary' },
        { label: 'Projets Cadrés', value: String(pertSummaries.length), subtext: `${totalTasks} tâches planifiées`, accent: 'sky' },
        { label: 'Conformité Cadrage', value: '100%', subtext: 'Normes GAR / PMI / PRINCE2', accent: 'emerald' }
      ],
      threeCards: [
        {
          title: '1. Stabilisation du Périmètre',
          badge: 'Périmètre',
          bullets: [
            `Validation définitive des ${(dossier.axes || []).length} axe(s) et ${pertSummaries.length} projet(s)`,
            `Identification exhaustive des ${totalTasks} tâches du WBS`,
            'Élimination des zones d’ombre techniques et opérationnelles'
          ]
        },
        {
          title: '2. Alignement Méthodologique',
          badge: 'Méthodes',
          bullets: [
            'Déploiement conjoint GAR (Cadre logique M1) et PERT/CPM (M2)',
            'Outils de collecte et protocoles d’assurance qualité harmonisés',
            'Synchronisation entre planification physique et suivi budgétaire'
          ]
        },
        {
          title: '3. Sécurisation Institutionnelle',
          badge: 'Gouvernance',
          bullets: [
            `Mobilisation de ${matricesData.M4.length} parties prenantes clés (M4)`,
            'Définition des circuits de validation rapide des livrables',
            'Anticipation proactive des risques de démarrage (Matrice M7)'
          ]
        }
      ]
    });

    // Slide 3 : Architecture Logique & Chaîne de Résultats GAR (M1)
    rawSlides.push({
      matrixBadge: 'MATRICE M1 • THÉORIE DU CHANGEMENT & INDICATEURS SMART',
      connectedMatrixId: 'M1',
      title: 'THÉORIE DU CHANGEMENT & CADRE LOGIQUE ACTUALISÉ (MATRICE M1)',
      subtitle: 'Revue des valeurs de référence (Baselines), cibles actualisées et indicateurs de performance',
      contentText: [
        `Consolidation de la Matrice M1 avec ${matricesData.M1.length} résultats clés (Impact, Effets, Produits).`,
        `Vérification de la disponibilité des données de base (Baselines) pour chaque indicateur SMART.`,
        `Taux de réalisation actuel mesuré dans le système : ${progressPct}% (${completedTasks} tâches achevées sur ${totalTasks}).`,
        `Mise en place du registre de suivi des indicateurs pour les revues périodiques du Comité de Pilotage.`
      ].join('\n'),
      layout: 'full_matrix',
      kpiCards: [
        { label: 'Indicateurs M1', value: String(matricesData.M1.length), subtext: 'Baselines & Cibles validées', accent: 'primary' },
        { label: 'Avancement Global', value: `${progressPct}%`, subtext: `${completedTasks}/${totalTasks} tâches`, accent: 'emerald' },
        { label: 'Fiabilité Données', value: 'Haute', subtext: 'Sources de vérification fixées', accent: 'sky' }
      ],
      threeCards: [],
      table: buildCompactSlideMatrixTable('M1', matricesData.M1, currency, 5)
    });

    // Slide 4 : Cartographie des Parties Prenantes (M4)
    rawSlides.push({
      matrixBadge: 'MATRICE M4 • CARTOGRAPHIE POUVOIR / INTÉRÊT',
      connectedMatrixId: 'M4',
      title: 'CARTOGRAPHIE & ENGAGEMENT DES PARTIES PRENANTES (MATRICE M4)',
      subtitle: 'Analyse Pouvoir / Intérêt, rôle des acteurs institutionnels et stratégie de communication',
      contentText: [
        `Identification et profilage de ${matricesData.M4.length} groupe(s) de parties prenantes dans la Matrice M4.`,
        `Acteurs de gouvernance stratégique : ${donorOrg} (Bailleur/Commanditaire) et ${execOrg} (Agence d’exécution).`,
        `Implication directe des bénéficiaires finaux et des partenaires techniques dès la phase de cadrage.`,
        `Mécanisme permanent de concertation et de remontée d’informations pour prévenir tout blocage institutionnel.`
      ].join('\n'),
      layout: 'full_matrix',
      kpiCards: [
        { label: 'Parties Prenantes (M4)', value: String(matricesData.M4.length), subtext: 'Cartographie Pouvoir/Intérêt', accent: 'primary' },
        { label: 'Acteurs Clés (5/5)', value: 'Prioritaires', subtext: 'Concertation étroite', accent: 'amber' },
        { label: 'Adhésion Institutionnelle', value: 'Forte', subtext: 'Mécanisme de dialogue actif', accent: 'emerald' }
      ],
      threeCards: [],
      table: buildCompactSlideMatrixTable('M4', matricesData.M4, currency, 5)
    });

    // Slide 5 : Démarche Méthodologique & Lotissement Opérationnel + Donut Statut WBS
    rawSlides.push({
      matrixBadge: 'APPROCHE MÉTHODOLOGIQUE • PHASAGE & STATUT WBS',
      title: 'DÉMARCHE MÉTHODOLOGIQUE, PHASAGE & RÉPARTITION DU STATUT WBS',
      subtitle: 'Organisation séquentielle des travaux, normes techniques et visualisation de l’état des activités',
      contentText: [
        rawFields.methodologyApproach ||
          `Démarche structurée en phases successives articulées autour des ${(dossier.axes || []).length} axe(s) du portefeuille.`,
        `Combinaison d’analyses documentaires, d’ateliers techniques multi-acteurs et de déploiement opérationnel sur le terrain.`,
        `Statut actuel des ${totalTasks} tâches WBS : ${completedTasks} Terminées (${donePct}%), ${inProgressTasks} En cours (${inProgPct}%), ${blockedTasks} Bloquées.`,
        `Standardisation des livrables et utilisation de matrices de suivi synchronisées en temps réel.`
      ].join('\n'),
      layout: 'two_columns',
      chart: wbsStatusDonutChart,
      kpiCards: [
        { label: 'Phases / Axes', value: String((dossier.axes || []).length), subtext: `${pertSummaries.length} projets structurés`, accent: 'primary' },
        { label: 'Tâches Opérationnelles', value: String(totalTasks), subtext: 'Lotissement complet', accent: 'sky' },
        { label: 'Taux d’Exécution', value: `${progressPct}%`, subtext: `${completedTasks} tâche(s) validée(s)`, accent: 'emerald' }
      ],
      threeCards: [
        {
          title: 'Phase 1 : Cadrage & Préparation',
          badge: 'Stabilisé',
          bullets: [
            'Alignement conceptuel, méthodologique et recueil des données de base',
            'Validation des outils de collecte et de la charte de gouvernance',
            'Consolidation de la Baseline physique et budgétaire'
          ]
        },
        {
          title: 'Phase 2 : Exécution & Déploiement',
          badge: `${inProgressTasks} en cours`,
          bullets: [
            `Réalisation séquentielle des ${totalTasks} activités programmées`,
            `Suivi prioritaire des ${criticalNodes.length} tâches du chemin critique`,
            'Production progressive des livrables intermédiaires'
          ]
        },
        {
          title: 'Phase 3 : Consolidation & Clôture',
          badge: 'Cible 100%',
          bullets: [
            'Contrôle qualité contradictoire et levée des réserves',
            'Transfert de compétences et capitalisation des acquis',
            'Validation finale et approbation du quitus par le Comité'
          ]
        }
      ]
    });

    // Slide 6 : Structure WBS & Chronogramme de Référence (M2)
    rawSlides.push({
      matrixBadge: 'MATRICE M2 • BASELINE CALENDAIRE & WBS',
      connectedMatrixId: 'M2',
      title: 'STRUCTURE DE DÉCOUPAGE (WBS) & CHRONOGRAMME DE RÉFÉRENCE (M2)',
      subtitle: 'Planification opérationnelle détaillée, jalons de contrôle et avancement par activité',
      contentText: [
        `Le chronogramme de référence (Baseline M2) comprend ${totalTasks} activités réparties sur ${pertSummaries.length} projet(s).`,
        `Bilan d’exécution à date : ${completedTasks} Terminées (${progressPct}%), ${inProgressTasks} En cours, ${todoTasks} À lancer, ${blockedTasks} Bloquées.`,
        `Toute modification de la Baseline calendaire supérieure à la marge libre requiert une validation formelle.`
      ].join('\n'),
      layout: 'full_matrix',
      kpiCards: [
        { label: 'Activités WBS (M2)', value: String(totalTasks), subtext: `${completedTasks} achevées (${progressPct}%)`, accent: 'primary' },
        { label: 'Activités En Cours', value: String(inProgressTasks), subtext: `${todoTasks} à démarrer`, accent: 'sky' },
        { label: 'Indice Délai (SPI)', value: spiVal, subtext: `${delayedTasks} écart(s) enregistré(s)`, accent: delayedTasks > 0 ? 'amber' : 'emerald' }
      ],
      threeCards: [],
      table: buildCompactSlideMatrixTable('M2', matricesData.M2, currency, 5)
    });

    // Slide 7 : Réseau Logique PERT/CPM & Chemin Critique
    rawSlides.push({
      matrixBadge: 'ANALYSE PERT / CPM • CHEMIN CRITIQUE & MARGES',
      connectedMatrixId: 'M2',
      title: 'ANALYSE DU RÉSEAU PERT / CPM, CHEMIN CRITIQUE & GESTION DES MARGES',
      subtitle: `Durée critique : ${maxDur} jours ouvrés • Séquence critique : ${criticalSeq}`,
      contentText: [
        `Modélisation mathématique du réseau logique (Dates au plus tôt ES/EF et Dates au plus tard LS/LF).`,
        `Chemin Critique identifié : ${criticalSeq} (${criticalNodes.length} tâches à marge totale nulle).`,
        `Durée totale incompressible : ${maxDur} jours ouvrés.`,
        `Points de vigilance : ${delayedTasks} activité(s) présentant un écart calendaire et ${blockedTasks} activité(s) bloquée(s).`
      ].join('\n'),
      layout: 'three_cards',
      kpiCards: [
        { label: 'Durée Totale PERT', value: `${maxDur}j`, subtext: 'Horizon critique calculé', accent: 'primary' },
        { label: 'Nœuds Critiques', value: String(criticalNodes.length), subtext: 'Marge Totale = 0 jour', accent: 'amber' },
        { label: 'Écarts / Alertes', value: `${delayedTasks} Écart(s)`, subtext: `${blockedTasks} tâche(s) bloquée(s)`, accent: blockedTasks > 0 ? 'rose' : 'emerald' }
      ],
      threeCards: [
        {
          title: '1. Séquence Critique CPM',
          badge: `${criticalNodes.length} Tâches`,
          bullets: criticalNodes.slice(0, 4).map(
            n => `${n.code} : ${n.name} (${n.duration}j • Fin au plus tard J+${n.lf})`
          )
        },
        {
          title: '2. Réserves de Marge',
          badge: 'Flexibilité',
          bullets: [
            `${Math.max(0, totalTasks - criticalNodes.length)} tâche(s) non-critiques avec marge positive`,
            'Réallocation possible des experts vers le chemin critique',
            'Protection des jalons contractuels de livraison'
          ]
        },
        {
          title: '3. Protocole de Rattrapage',
          badge: 'Fast-Tracking',
          bullets: [
            'Exécution en parallèle (Fast-Tracking) des tâches indépendantes',
            'Renforcement ciblé (Crashing) sur les activités en retard',
            'Point de contrôle hebdomadaire par la cellule S&E'
          ]
        }
      ]
    });

    // Slide 8 : Gouvernance RACI & Affectation des Ressources (M3)
    rawSlides.push({
      matrixBadge: 'MATRICE M3 • GOUVERNANCE OPÉRATIONNELLE RACI',
      connectedMatrixId: 'M3',
      title: 'ORGANISATION DE L’ÉQUIPE, GOUVERNANCE & MATRICE RACI (M3)',
      subtitle: 'Répartition claire des responsabilités d’exécution (R), d’approbation (A), de consultation (C) et d’information (I)',
      contentText: [
        `Équipe pilotée par ${raciCtx.leadActorName} (${raciCtx.leadActorRole}) en qualité d’Approbateur / Responsable opérationnel.`,
        `${raciCtx.allActors.length} intervenants inscrits dans la matrice RACI avec rattachement direct aux tâches du projet.`,
        `Principe d’unicité de l’Approbateur (A) respecté sur 100% des livrables pour garantir la célérité décisionnelle.`
      ].join('\n'),
      layout: 'full_matrix',
      kpiCards: [
        { label: 'Intervenants RACI', value: String(raciCtx.allActors.length), subtext: 'Rôles R, A, C, I définis', accent: 'primary' },
        { label: 'Pilote Principal', value: raciCtx.leadActorName, subtext: raciCtx.leadActorRole, accent: 'sky' },
        { label: 'Lots RACI (M3)', value: String(matricesData.M3.length), subtext: 'Affectation validée', accent: 'emerald' }
      ],
      threeCards: [],
      table: buildCompactSlideMatrixTable('M3', matricesData.M3, currency, 5)
    });

    // Slide 9 : Cadrage Budgétaire (M5) & Livrables Contractuels (M9) + Donut Budget
    rawSlides.push({
      matrixBadge: 'MATRICES M5 & M9 • BASELINE BUDGÉTAIRE & LIVRABLES',
      connectedMatrixId: 'M5',
      title: 'BASELINE BUDGÉTAIRE PAR COMPOSANTE (M5) & LIVRABLES CLÉS (M9)',
      subtitle: `Budget de référence : ${budgetFormatted} • Couplage strict entre livrables validés et décaissements`,
      contentText: [
        `Budget initial de référence (BAC) : ${budgetFormatted} réparti sur ${(dossier.axes || []).length} axe(s).`,
        `Budget engagé à date : ${formatSlideAmount(committedFCFA, currency, lang)} • Décaissé réel (AC) : ${formatSlideAmount(actualFCFA, currency, lang)} (${disbursementPct}%).`,
        `Indice de performance des coûts (CPI) : ${cpiVal} • Nombre de livrables contractuels suivis (M9) : ${matricesData.M9.length}.`
      ].join('\n'),
      layout: 'two_columns',
      chart: budgetSplitDonutChart,
      kpiCards: [
        { label: 'Baseline Budget (BAC)', value: budgetFormatted, subtext: `${matricesData.M5.length} lignes M5`, accent: 'primary' },
        { label: 'Taux Décaissement', value: `${disbursementPct}%`, subtext: `CPI = ${cpiVal}`, accent: 'emerald' },
        { label: 'Livrables (M9)', value: String(matricesData.M9.length), subtext: 'Conditionnalité paiement', accent: 'sky' }
      ],
      threeCards: [],
      table: buildCompactSlideMatrixTable('M5', matricesData.M5, currency, 4)
    });

    // Slide 10 : Registre des Risques (RAID) & Plan d'Atténuation (M7)
    rawSlides.push({
      matrixBadge: 'MATRICE M7 • REGISTRE DES RISQUES RAID & MITIGATION',
      connectedMatrixId: 'M7',
      title: 'ANALYSE DES RISQUES, HYPOTHÈSES CRITIQUES & MITIGATION (M7)',
      subtitle: 'Évaluation Probabilité × Impact (PxI), propriétaires de risques et mesures préventives',
      contentText: [
        rawFields.recommendationsLessons ||
          `Le registre RAID (Matrice M7) trace ${matricesData.M7.length} risque(s) majeur(s) identifié(s) lors du cadrage.`,
        `Vigilance opérationnelle sur les ${blockedTasks} tâche(s) bloquée(s) et les ${delayedTasks} activité(s) présentant un écart.`,
        `Chaque risque critique est associé à un plan d’atténuation concret et à un responsable nominal au sein de l’UGP.`
      ].join('\n'),
      layout: 'full_matrix',
      kpiCards: [
        { label: 'Risques Tracés (M7)', value: String(matricesData.M7.length), subtext: 'Matrice PxI active', accent: 'primary' },
        { label: 'Points de Blocage', value: String(blockedTasks), subtext: 'Traitement prioritaire', accent: blockedTasks > 0 ? 'rose' : 'emerald' },
        { label: 'Couverture Mitigation', value: '100%', subtext: 'Plans d’action assignés', accent: 'sky' }
      ],
      threeCards: [],
      table: buildCompactSlideMatrixTable('M7', matricesData.M7, currency, 5)
    });

    // Slide 11 : Feuille de Route de Déploiement & Approbation du Cadrage
    rawSlides.push({
      isFinalSlide: true,
      matrixBadge: 'DÉCISION DU COMITÉ • APPROBATION DU RAPPORT DE CADRAGE',
      title: 'FEUILLE DE ROUTE OPÉRATIONNELLE & APPROBATION DU CADRAGE',
      subtitle: 'Validation de la Baseline triple (Périmètre WBS • Calendrier PERT • Budget M5) et passage en exécution',
      contentText: [
        `Approbation officielle du Rapport de Cadrage Méthodologique (Réf. ${refCode}).`,
        `Gel de la Baseline de référence : ${totalTasks} tâches WBS, durée critique de ${maxDur} jours ouvrés et budget de ${budgetFormatted}.`,
        `Autorisation de lancement de la phase de démarrage opérationnel et d’exécution des lots prioritaires.`,
        `Mise en place du rythme de gouvernance : revues hebdomadaires UGP et reporting mensuel au Comité de Pilotage.`
      ].join('\n'),
      layout: 'three_cards',
      kpiCards: [
        { label: 'Baseline Cadrage', value: 'Verrouillée', subtext: 'Périmètre • Délai • Coût', accent: 'emerald' },
        { label: 'Horizon Exécution', value: `${maxDur} Jours`, subtext: `${criticalNodes.length} jalons critiques`, accent: 'primary' },
        { label: 'Décision Comité', value: 'Feu Vert', subtext: 'Passage en exécution', accent: 'sky' }
      ],
      threeCards: [
        {
          title: '1. Décisions Actées en Séance',
          badge: 'Approbation',
          bullets: [
            'Validation du Cadre Logique M1 et de la méthodologie d’intervention',
            `Adoption du chronogramme WBS/PERT (${maxDur}j) et du budget (${budgetFormatted})`,
            'Validation de la charte RACI (M3) et du registre des risques (M7)'
          ]
        },
        {
          title: '2. Actions à 30 Jours',
          badge: 'Priorités',
          bullets: [
            `Exécution prioritaire des tâches critiques : ${criticalSeq}`,
            `Levée immédiate des ${blockedTasks} point(s) de blocage identifié(s)`,
            'Soumission des premiers livrables contractuels de la Matrice M9'
          ]
        },
        {
          title: '3. Dispositif de Suivi S&E',
          badge: 'Redevabilité',
          bullets: [
            'Mise à jour continue des statuts Kanban et de la Valeur Acquise (EVM)',
            'Contrôle qualité systématique avant chaque demande de paiement',
            'Préparation de la revue d’évaluation à mi-parcours'
          ]
        }
      ],
      includeSignatures: !hideSignatures,
      orgStampDataUrl: hideSignatures ? undefined : rawFields.orgStampDataUrl,
      partnerStampDataUrl: hideSignatures ? undefined : rawFields.partnerStampDataUrl
    });
  }

  // ============================================================================
  // 18. PRÉSENTATION DU RAPPORT DE DÉMARRAGE (INCEPTION) — 11 SLIDES
  // Matrices auto-activées : M1, M2, M3, M4, M5, M7, M9
  // ============================================================================
  else if (docType === 'slides_demarrage') {
    const refCode = rawFields.referenceCode || `SLIDES-DEM-${dossier.psdYear || 2026}-018`;

    // Slide 1 : Couverture 16:9
    rawSlides.push({
      isCoverSlide: true,
      matrixBadge: 'COUVERTURE OFFICIELLE 16:9 • RAPPORT DE DÉMARRAGE (INCEPTION)',
      title: 'PRÉSENTATION DU RAPPORT DE DÉMARRAGE (INCEPTION REPORT)',
      subtitle: `${dossier.name} • Bilan de mobilisation, plan de travail opérationnel actualisé et lancement terrain`,
      contentText: [
        `Objet de la séance : Examen et approbation du Rapport de Démarrage (Inception Report) du programme « ${dossier.name} »`,
        `Bilan de mobilisation : Équipe de ${raciCtx.allActors.length} acteurs installée, ${totalTasks} activités WBS opérationnalisées`,
        `Avancement initial : ${progressPct}% (${completedTasks} tâches achevées, ${inProgressTasks} en cours d’exécution)`,
        `Enveloppe mobilisée : ${budgetFormatted} • Chemin critique PERT : ${maxDur} jours ouvrés`,
        `Chef de Mission : ${presenterName}`
      ].join('\n'),
      layout: 'two_columns',
      kpiCards: [
        { label: 'Mobilisation Équipe', value: `${raciCtx.allActors.length} Acteurs`, subtext: '100% opérationnels sur site', accent: 'primary' },
        { label: 'Avancement Initial', value: `${progressPct}%`, subtext: `${completedTasks} terminées • ${inProgressTasks} actives`, accent: 'emerald' },
        { label: 'Durée Critique PERT', value: `${maxDur}j`, subtext: `${criticalNodes.length} nœuds critiques`, accent: 'amber' },
        { label: 'Budget en Exécution', value: budgetFormatted, subtext: `Décaissé : ${disbursementPct}%`, accent: 'sky' }
      ],
      threeCards: [],
      coverData: makeCoverData(
        refCode,
        'ATELIER OFFICIEL DE DÉMARRAGE (INCEPTION MEETING)',
        'PRÉSENTATION DU RAPPORT DE DÉMARRAGE (INCEPTION)',
        `${dossier.name} (${dossier.horizonPlan})`
      )
    });

    // Slide 2 : Bilan de la Phase de Mobilisation & Installation de l'UGP
    rawSlides.push({
      matrixBadge: 'BILAN D’INCEPTION • MOBILISATION & INSTALLATION',
      title: 'BILAN DE LA PHASE DE MOBILISATION & INSTALLATION OPÉRATIONNELLE',
      subtitle: 'Revue des actions accomplies depuis la notification, installation logistique et prise en main des dossiers',
      contentText: [
        rawFields.contextJustification ||
          `La phase d’inception du programme « ${dossier.name} » a permis d’installer l’Unité de Gestion (${execOrg}) et de mobiliser les experts clés.`,
        `Collecte documentaire exhaustive réalisée et vérification sur site des hypothèses techniques de base.`,
        `Organisation des réunions de lancement avec ${donorOrg} et les ${matricesData.M4.length} parties prenantes clés.`,
        `Paramétrage complet du système de suivi-évaluation GAR et des outils de gestion financière EVM.`
      ].join('\n'),
      layout: 'three_cards',
      kpiCards: [
        { label: 'Statut Mobilisation', value: '100% Effectif', subtext: 'Logistique & Équipe en place', accent: 'emerald' },
        { label: 'Tâches Lancées', value: String(completedTasks + inProgressTasks), subtext: `Sur ${totalTasks} tâches WBS`, accent: 'primary' },
        { label: 'Indice SPI Initial', value: spiVal, subtext: 'Respect du calendrier', accent: 'sky' }
      ],
      threeCards: [
        {
          title: '1. Mobilisation Humaine & RACI',
          badge: `${raciCtx.allActors.length} Experts`,
          bullets: [
            `Prise de fonction effective du Chef de Mission : ${raciCtx.leadActorName}`,
            'Attribution nominative des lots de travaux selon la Matrice M3',
            'Briefing méthodologique et sécurité des équipes terrain'
          ]
        },
        {
          title: '2. Revue Documentaire & Terrain',
          badge: 'Diagnostic',
          bullets: [
            `Actualisation des données de référence sur les ${(dossier.axes || []).length} axe(s)`,
            'Visites de reconnaissance et validation des sites d’intervention',
            'Confirmation de la faisabilité technique des livrables M9'
          ]
        },
        {
          title: '3. Dispositif de Gestion & S&E',
          badge: 'Outils Actifs',
          bullets: [
            'Mise en service de la base de suivi WBS, Kanban et PERT',
            'Ouverture des registres comptables et suivi EVM (Matrice M5)',
            'Activation du protocole de remontée hebdomadaire des données'
          ]
        }
      ]
    });

    // Slide 3 : Confirmation des Objectifs & Valeurs de Référence (Baselines M1)
    rawSlides.push({
      matrixBadge: 'MATRICE M1 • BASELINES CONFIRMÉES & CIBLES GAR',
      connectedMatrixId: 'M1',
      title: 'CONFIRMATION DES INDICATEURS SMART & VALEURS DE BASE (MATRICE M1)',
      subtitle: 'Validation définitive des Baselines à T0 et des cibles de performance suite au diagnostic de démarrage',
      contentText: [
        `Consolidation définitive des ${matricesData.M1.length} indicateurs du Cadre Logique (Matrice M1) à l’issue de la phase d’inception.`,
        `Confirmation des valeurs de référence (Baselines T0) et calibrage réaliste des cibles finales.`,
        `Taux d’exécution physique déjà enregistré : ${progressPct}% (${completedTasks} tâches terminées).`
      ].join('\n'),
      layout: 'full_matrix',
      kpiCards: [
        { label: 'Résultats GAR (M1)', value: String(matricesData.M1.length), subtext: 'Baselines T0 certifiées', accent: 'primary' },
        { label: 'Réalisation Initiale', value: `${progressPct}%`, subtext: `${completedTasks} tâche(s) achevée(s)`, accent: 'emerald' },
        { label: 'Protocole S&E', value: 'Opérationnel', subtext: 'Collecte périodique active', accent: 'sky' }
      ],
      threeCards: [],
      table: buildCompactSlideMatrixTable('M1', matricesData.M1, currency, 5)
    });

    // Slide 4 : Concertation avec les Parties Prenantes & Comités Locaux (M4)
    rawSlides.push({
      matrixBadge: 'MATRICE M4 • ENGAGEMENT DES PARTIES PRENANTES AU DÉMARRAGE',
      connectedMatrixId: 'M4',
      title: 'CONCERTATION INITIALE & ADHÉSION DES PARTIES PRENANTES (M4)',
      subtitle: 'Compte-rendu des consultations de démarrage, attentes exprimées et mécanismes de coordination',
      contentText: [
        `Tenue des séances de travail initiales avec les ${matricesData.M4.length} institutions et groupes d’acteurs de la Matrice M4.`,
        `Confirmation des points focaux au sein de ${donorOrg} et de ${execOrg}.`,
        `Validation des modalités pratiques d’accès aux sites et de réception conjointe des livrables.`
      ].join('\n'),
      layout: 'full_matrix',
      kpiCards: [
        { label: 'Acteurs Consultés', value: String(matricesData.M4.length), subtext: 'Points focaux désignés', accent: 'primary' },
        { label: 'Niveau d’Adhésion', value: '5 / 5', subtext: 'Engagement fort au démarrage', accent: 'emerald' },
        { label: 'Cadre de Concertation', value: 'Mensuel', subtext: 'Réunions de coordination', accent: 'sky' }
      ],
      threeCards: [],
      table: buildCompactSlideMatrixTable('M4', matricesData.M4, currency, 5)
    });

    // Slide 5 : État d'Avancement Initial des Travaux & Graphique Donut Statut WBS
    rawSlides.push({
      matrixBadge: 'TABLEAU DE BORD INCEPTION • STATUT WBS & KANBAN',
      title: 'ÉTAT D’AVANCEMENT INITIAL DES TRAVAUX & RÉPARTITION WBS / KANBAN',
      subtitle: 'Photographie temps réel de la mise en route opérationnelle sur l’ensemble des axes du programme',
      contentText: [
        `Sur les ${totalTasks} tâches programmées dans le WBS : ${completedTasks} sont Terminées (${donePct}%), ${inProgressTasks} sont En cours (${inProgPct}%).`,
        `Activités en attente de lancement séquentiel : ${todoTasks} • Activités signalées en blocage : ${blockedTasks}.`,
        `L’effort de démarrage est concentré sur les premiers nœuds du chemin critique (${criticalSeq}).`
      ].join('\n'),
      layout: 'two_columns',
      chart: wbsStatusDonutChart,
      kpiCards: [
        { label: 'Taux d’Avancement', value: `${progressPct}%`, subtext: `${completedTasks}/${totalTasks} tâches validées`, accent: 'emerald' },
        { label: 'Fronts Actifs', value: `${inProgressTasks} Tâches`, subtext: 'En cours d’exécution', accent: 'sky' },
        { label: 'Goulots Initial', value: String(blockedTasks), subtext: `${delayedTasks} écart(s) détecté(s)`, accent: blockedTasks > 0 ? 'rose' : 'primary' }
      ],
      threeCards: axeSummaries.slice(0, 3).map((ax, idx) => ({
        title: `Axe ${idx + 1} : ${ax.name}`,
        badge: `${ax.taskCount > 0 ? Math.round((ax.doneCount / ax.taskCount) * 100) : 0}% fait`,
        bullets: [
          `${ax.projectCount} projet(s) mobilisé(s) au démarrage`,
          `${ax.doneCount} tâche(s) terminée(s) sur ${ax.taskCount}`,
          `Dotation active : ${formatSlideAmount(ax.budgetFCFA, currency, lang)}`
        ]
      }))
    });

    // Slide 6 : Plan de Travail Opérationnel Actualisé (Matrice M2)
    rawSlides.push({
      matrixBadge: 'MATRICE M2 • PLAN DE TRAVAIL OPÉRATIONNEL ACTUALISÉ',
      connectedMatrixId: 'M2',
      title: 'PLAN DE TRAVAIL OPÉRATIONNEL ACTUALISÉ AU DÉMARRAGE (MATRICE M2)',
      subtitle: 'Calendrier d’exécution recalibré, dates effectives de début/fin et responsables par tâche',
      contentText: [
        `Actualisation fine du chronogramme WBS (Matrice M2) suite aux constats de la phase d’inception.`,
        `${totalTasks} tâches ordonnancées avec suivi rigoureux des dates réelles de démarrage et des durées.`,
        `Maintien de l’objectif de livraison globale dans l’enveloppe temporelle de ${maxDur} jours ouvrés.`
      ].join('\n'),
      layout: 'full_matrix',
      kpiCards: [
        { label: 'Tâches Programmées', value: String(totalTasks), subtext: 'Matrice M2 recalibrée', accent: 'primary' },
        { label: 'En Cours / Actives', value: String(inProgressTasks), subtext: 'Exécution terrain lancée', accent: 'sky' },
        { label: 'Indice Délai (SPI)', value: spiVal, subtext: 'Cadence conforme', accent: 'emerald' }
      ],
      threeCards: [],
      table: buildCompactSlideMatrixTable('M2', matricesData.M2, currency, 5)
    });

    // Slide 7 : Sécurisation du Chemin Critique PERT/CPM dès le Démarrage
    rawSlides.push({
      matrixBadge: 'CHEMIN CRITIQUE PERT / CPM • PRIORITÉS DES 90 PREMIERS JOURS',
      connectedMatrixId: 'M2',
      title: 'SÉCURISATION DU CHEMIN CRITIQUE PERT / CPM DÈS LE DÉMARRAGE',
      subtitle: `Focus sur les ${criticalNodes.length} activités critiques (${criticalSeq}) conditionnant la durée de ${maxDur}j`,
      contentText: [
        `Identification des jalons critiques immédiats sur la séquence ${criticalSeq}.`,
        `Protection de la durée globale de ${maxDur} jours ouvrés par affectation prioritaire des ressources.`,
        `Traitement immédiat des ${delayedTasks} écart(s) de démarrage pour éviter tout glissement calendaire.`
      ].join('\n'),
      layout: 'three_cards',
      kpiCards: [
        { label: 'Durée Critique', value: `${maxDur} Jours`, subtext: 'Cible contractuelle maintenue', accent: 'primary' },
        { label: 'Tâches Critiques', value: String(criticalNodes.length), subtext: 'Marge 0 jour', accent: 'amber' },
        { label: 'Écarts Démarrage', value: String(delayedTasks), subtext: 'Sous contrôle UGP', accent: delayedTasks > 0 ? 'rose' : 'emerald' }
      ],
      threeCards: [
        {
          title: '1. Premiers Nœuds Critiques',
          badge: 'Urgence J0–J30',
          bullets: criticalNodes.slice(0, 4).map(
            n => `[${n.code}] ${n.name} — ${n.duration}j (Début J+${n.es} → Fin J+${n.ef})`
          )
        },
        {
          title: '2. Coordination Inter-Lots',
          badge: 'Fluidité',
          bullets: [
            'Synchronisation hebdomadaire entre les responsables de lots WBS',
            'Levée anticipée des prérequis administratifs et autorisations',
            'Validation accélérée des livrables intermédiaires bloquants'
          ]
        },
        {
          title: '3. Alerte Précoce S&E',
          badge: 'Monitoring',
          bullets: [
            'Suivi quotidien des tâches à marge nulle sur le tableau Kanban',
            'Escalade immédiate au Chef de Mission en cas de blocage > 48h',
            'Mise à jour automatique des dates au plus tôt / plus tard'
          ]
        }
      ]
    });

    // Slide 8 : Dispositif RACI & Déploiement de l'Équipe sur le Terrain (M3)
    rawSlides.push({
      matrixBadge: 'MATRICE M3 • DÉPLOIEMENT OPÉRATIONNEL DE L’ÉQUIPE RACI',
      connectedMatrixId: 'M3',
      title: 'DÉPLOIEMENT DE L’ÉQUIPE D’EXPERTS & RESPONSABILITÉS RACI (M3)',
      subtitle: `Affectation opérationnelle confirmée autour de ${raciCtx.leadActorName} (${raciCtx.leadActorRole})`,
      contentText: [
        `L’ensemble des ${raciCtx.allActors.length} acteurs de la Matrice M3 est opérationnel et affecté aux tâches du WBS.`,
        `Circuit court de validation technique sous la responsabilité de ${raciCtx.leadActorName}.`,
        `Planification fine des charges en Hommes/Jours pour couvrir les pics d’activité.`
      ].join('\n'),
      layout: 'full_matrix',
      kpiCards: [
        { label: 'Experts Mobilisés', value: String(raciCtx.allActors.length), subtext: '100% présents au démarrage', accent: 'primary' },
        { label: 'Chef de Mission', value: raciCtx.leadActorName, subtext: raciCtx.leadActorRole, accent: 'sky' },
        { label: 'Affectations M3', value: String(matricesData.M3.length), subtext: 'Zéro conflit de rôle', accent: 'emerald' }
      ],
      threeCards: [],
      table: buildCompactSlideMatrixTable('M3', matricesData.M3, currency, 5)
    });

    // Slide 9 : Mise en Place Financière, Avance de Démarrage & EVM (M5) + Bar Chart EVM
    rawSlides.push({
      matrixBadge: 'MATRICE M5 • MISE EN PLACE FINANCIÈRE & DÉCAISSEMENTS INITIAUX',
      connectedMatrixId: 'M5',
      title: 'MISE EN PLACE DU BUDGET, ENGAGEMENTS INITIAUX & SUIVI EVM (M5)',
      subtitle: `Enveloppe : ${budgetFormatted} • Engagé : ${formatSlideAmount(committedFCFA, currency, lang)} • Décaissé : ${disbursementPct}%`,
      contentText: [
        `Ouverture et paramétrage des lignes budgétaires de la Matrice M5 pour un total de ${budgetFormatted}.`,
        `Engagements financiers initiaux : ${formatSlideAmount(committedFCFA, currency, lang)} (${committedPct}% du budget).`,
        `Décaissements effectifs (AC) : ${formatSlideAmount(actualFCFA, currency, lang)} (${disbursementPct}%) • Valeur Acquise (EV) : ${formatSlideAmount(earnedFCFA, currency, lang)}.`,
        `Indice CPI initial : ${cpiVal} garantissant une maîtrise stricte des coûts de mobilisation.`
      ].join('\n'),
      layout: 'two_columns',
      chart: evmComparisonBarChart,
      kpiCards: [
        { label: 'Budget Total (BAC)', value: budgetFormatted, subtext: 'Dotation active M5', accent: 'primary' },
        { label: 'Taux d’Engagement', value: `${committedPct}%`, subtext: formatSlideAmount(committedFCFA, currency, lang), accent: 'sky' },
        { label: 'Taux Décaissement', value: `${disbursementPct}%`, subtext: `CPI = ${cpiVal}`, accent: 'emerald' }
      ],
      threeCards: [],
      table: buildCompactSlideMatrixTable('M5', matricesData.M5, currency, 4)
    });

    // Slide 10 : Risques de Démarrage Identifiés & Mesures d'Atténuation (M7)
    rawSlides.push({
      matrixBadge: 'MATRICE M7 • RISQUES DE DÉMARRAGE & PLAN DE MITIGATION',
      connectedMatrixId: 'M7',
      title: 'RISQUES OPÉRATIONNELS DE DÉMARRAGE & PLAN DE MITIGATION (M7)',
      subtitle: 'Actualisation du registre RAID après reconnaissance terrain et mesures de contingence immédiates',
      contentText: [
        `Revue complète des ${matricesData.M7.length} risque(s) inscrit(s) dans la Matrice M7 à l’issue de la phase de mobilisation.`,
        `Traitement prioritaire des ${blockedTasks} point(s) de blocage opérationnel identifié(s) au lancement.`,
        `Mesures préventives activées avec désignation d’un propriétaire de risque pour chaque alerte.`
      ].join('\n'),
      layout: 'full_matrix',
      kpiCards: [
        { label: 'Risques Suivis (M7)', value: String(matricesData.M7.length), subtext: 'Registre RAID actualisé', accent: 'primary' },
        { label: 'Blocages Actifs', value: String(blockedTasks), subtext: 'Action corrective immédiate', accent: blockedTasks > 0 ? 'rose' : 'emerald' },
        { label: 'Mitigation Active', value: '100%', subtext: 'Responsables assignés', accent: 'sky' }
      ],
      threeCards: [],
      table: buildCompactSlideMatrixTable('M7', matricesData.M7, currency, 5)
    });

    // Slide 11 : Calendrier des Premiers Livrables (M9) & Approbation du Rapport de Démarrage
    rawSlides.push({
      isFinalSlide: true,
      matrixBadge: 'DÉCISION DU COMITÉ • VALIDATION DU RAPPORT DE DÉMARRAGE',
      connectedMatrixId: 'M9',
      title: 'LIVRABLES PRIORITAIRES (M9) & VALIDATION DU RAPPORT DE DÉMARRAGE',
      subtitle: 'Approbation du Rapport d’Inception, déblocage de la tranche de démarrage et lancement plein régime',
      contentText: [
        `Validation officielle du Rapport de Démarrage (Inception Report — Réf. ${refCode}).`,
        `Approbation du calendrier de livraison des ${matricesData.M9.length} livrables contractuels de la Matrice M9.`,
        `Déblocage des ressources liées au jalon de démarrage et passage en vitesse de croisière sur les ${(dossier.axes || []).length} axes.`,
        `Prochaine échéance statutaire : Revue trimestrielle d’exécution (PTT / PTBA).`
      ].join('\n'),
      layout: 'three_cards',
      kpiCards: [
        { label: 'Rapport d’Inception', value: 'Approuvé', subtext: `Réf. ${refCode}`, accent: 'emerald' },
        { label: 'Livrables M9', value: `${matricesData.M9.length} Extrants`, subtext: 'Calendrier validé', accent: 'primary' },
        { label: 'Phase Suivante', value: 'Plein Régime', subtext: 'Exécution des lots WBS', accent: 'sky' }
      ],
      threeCards: [
        {
          title: '1. Validation de l’Inception',
          badge: 'Jalon N°1',
          bullets: [
            'Approbation sans réserve du Rapport de Démarrage',
            'Confirmation des Baselines M1 et du plan de travail actualisé M2',
            'Validation de la tranche financière associée au démarrage'
          ]
        },
        {
          title: '2. Priorités Opérationnelles',
          badge: 'Production',
          bullets: [
            `Accélération des ${inProgressTasks} tâches actuellement en cours`,
            `Lancement séquentiel des ${todoTasks} tâches programmées`,
            `Livraison des prochains extrants contractuels de la Matrice M9`
          ]
        },
        {
          title: '3. Pilotage & Reporting',
          badge: 'Gouvernance',
          bullets: [
            'Suivi hebdomadaire du chemin critique PERT et de la matrice RACI',
            'Contrôle mensuel des décaissements et de la Valeur Acquise (EVM)',
            'Reporting régulier au Comité de Pilotage et au Bailleur'
          ]
        }
      ],
      includeSignatures: !hideSignatures,
      orgStampDataUrl: hideSignatures ? undefined : rawFields.orgStampDataUrl,
      partnerStampDataUrl: hideSignatures ? undefined : rawFields.partnerStampDataUrl
    });
  }

  // ============================================================================
  // 19. PRÉSENTATION DU PTBA (PLAN DE TRAVAIL ET BUDGET ANNUEL) — 12 SLIDES
  // Matrices auto-activées : M1, M2, M3, M5, M7, M8, M9
  // ============================================================================
  else if (docType === 'slides_ptba') {
    const refCode = rawFields.referenceCode || `SLIDES-PTBA-${dossier.psdYear || 2026}-019`;

    // Slide 1 : Couverture 16:9
    rawSlides.push({
      isCoverSlide: true,
      matrixBadge: 'COUVERTURE OFFICIELLE 16:9 • PRÉSENTATION DU PTBA ANNUEL',
      title: `PRÉSENTATION DU PLAN DE TRAVAIL ET BUDGET ANNUEL (PTBA ${dossier.psdYear || 2026})`,
      subtitle: `${dossier.name} • Programmation technico-financière annuelle (Q1–Q4) • Enveloppe : ${budgetFormatted}`,
      contentText: [
        `Session d’examen et d’adoption du PTBA Annuel ${dossier.psdYear || 2026} du programme « ${dossier.name} »`,
        `Programmation opérationnelle : ${(dossier.axes || []).length} Axe(s), ${pertSummaries.length} Projet(s), ${totalTasks} Activités WBS`,
        `Enveloppe Budgétaire Annuelle : ${budgetFormatted} • Décaissé à date : ${formatSlideAmount(actualFCFA, currency, lang)} (${disbursementPct}%)`,
        `Indice d’efficience budgétaire (CPI) : ${cpiVal} • Indice de performance calendaire (SPI) : ${spiVal}`,
        `Présenté par : ${presenterName}`
      ].join('\n'),
      layout: 'two_columns',
      kpiCards: [
        { label: 'Exercice PTBA', value: `Annuel ${dossier.psdYear || 2026}`, subtext: `${totalTasks} activités programmées`, accent: 'primary' },
        { label: 'Dotation PTBA', value: budgetFormatted, subtext: `Engagement : ${committedPct}%`, accent: 'emerald' },
        { label: 'Exécution Physique', value: `${progressPct}%`, subtext: `SPI = ${spiVal} • CPI = ${cpiVal}`, accent: 'sky' },
        { label: 'Marchés PPM (M8)', value: String(matricesData.M8.length), subtext: `${matricesData.M9.length} livrables M9`, accent: 'amber' }
      ],
      threeCards: [],
      coverData: makeCoverData(
        refCode,
        `SESSION D’APPROBATION DU PTBA ANNUEL ${dossier.psdYear || 2026}`,
        `PRÉSENTATION DU PTBA (PLAN DE TRAVAIL ET BUDGET ANNUEL)`,
        `${dossier.name} (${dossier.horizonPlan})`
      )
    });

    // Slide 2 : Bilan d'Exécution & Priorités Annuelles du PTBA + Donut WBS
    rawSlides.push({
      matrixBadge: 'SYNTHÈSE EXÉCUTIVE PTBA • BILAN & PRIORITÉS ANNUELLES',
      title: `BILAN D’AVANCEMENT & PRIORITÉS ANNUELLES DU PTBA ${dossier.psdYear || 2026}`,
      subtitle: 'État d’exécution physique et financier consolidé et objectifs majeurs des 4 trimestres (Q1 à Q4)',
      contentText: [
        rawFields.contextJustification ||
          `Le PTBA ${dossier.psdYear || 2026} traduit en opérations budgétaires et calendaires les ${(dossier.axes || []).length} axe(s) du programme « ${dossier.name} ».`,
        `Bilan physique actuel : ${completedTasks} tâches terminées (${progressPct}%), ${inProgressTasks} en cours, ${todoTasks} à lancer et ${blockedTasks} bloquées.`,
        `Bilan financier EVM : ${formatSlideAmount(actualFCFA, currency, lang)} décaissés sur ${budgetFormatted} (${disbursementPct}%), avec un CPI de ${cpiVal}.`,
        `Priorité annuelle : Garantir l’exécution intégrale des ${criticalNodes.length} tâches critiques sur ${maxDur} jours ouvrés.`
      ].join('\n'),
      layout: 'two_columns',
      chart: wbsStatusDonutChart,
      kpiCards: [
        { label: 'Taux Physique Global', value: `${progressPct}%`, subtext: `${completedTasks}/${totalTasks} activités validées`, accent: 'emerald' },
        { label: 'Taux Décaissement', value: `${disbursementPct}%`, subtext: formatSlideAmount(actualFCFA, currency, lang), accent: 'primary' },
        { label: 'Performance EVM', value: `CPI ${cpiVal}`, subtext: `SPI ${spiVal}`, accent: 'sky' }
      ],
      threeCards: [
        {
          title: '1. Performance Physique',
          badge: `${progressPct}%`,
          bullets: [
            `${completedTasks} activité(s) achevée(s) et validée(s)`,
            `${inProgressTasks} activité(s) en cours d’exécution active`,
            `${todoTasks} activité(s) programmée(s) sur les prochains trimestres`
          ]
        },
        {
          title: '2. Exécution Budgétaire',
          badge: `${disbursementPct}% décaissé`,
          bullets: [
            `Dotation annuelle BAC : ${budgetFormatted}`,
            `Montant engagé : ${formatSlideAmount(committedFCFA, currency, lang)} (${committedPct}%)`,
            `Valeur Acquise EV : ${formatSlideAmount(earnedFCFA, currency, lang)}`
          ]
        },
        {
          title: '3. Priorités Stratégiques',
          badge: 'Q1 → Q4',
          bullets: [
            `Sécurisation du chemin critique (${criticalSeq})`,
            `Lancement dans les délais des ${matricesData.M8.length} marchés du PPM (M8)`,
            `Levée immédiate des ${blockedTasks} blocage(s) opérationnel(s)`
          ]
        }
      ]
    });

    // Slide 3 : Cibles Annuelles de Performance GAR (Matrice M1)
    rawSlides.push({
      matrixBadge: 'MATRICE M1 • CIBLES DE PERFORMANCE ANNUELLES GAR',
      connectedMatrixId: 'M1',
      title: 'CIBLES ANNUELLES DE RÉSULTATS & INDICATEURS SMART DU PTBA (M1)',
      subtitle: 'Contribution directe des activités annuelles à l’atteinte des Effets et Produits du Cadre Logique',
      contentText: [
        `Alignement de 100% des activités du PTBA sur les ${matricesData.M1.length} résultats de la Matrice M1.`,
        `Mesure périodique des écarts entre cibles annuelles et réalisations physiques (${progressPct}% à date).`,
        `Conditionnalité : Chaque ligne budgétaire du PTBA concourt directement à au moins un indicateur SMART.`
      ].join('\n'),
      layout: 'full_matrix',
      kpiCards: [
        { label: 'Indicateurs Suivis (M1)', value: String(matricesData.M1.length), subtext: 'Cibles annuelles fixées', accent: 'primary' },
        { label: 'Atteinte Cibles', value: `${progressPct}%`, subtext: 'Moyenne pondérée GAR', accent: 'emerald' },
        { label: 'Revue Indicateurs', value: 'Trimestrielle', subtext: 'Q1 • Q2 • Q3 • Q4', accent: 'sky' }
      ],
      threeCards: [],
      table: buildCompactSlideMatrixTable('M1', matricesData.M1, currency, 5)
    });

    // Slide 4 : Programmation Physique Annuelle WBS (Matrice M2)
    rawSlides.push({
      matrixBadge: 'MATRICE M2 • PROGRAMMATION PHYSIQUE ANNUELLE WBS',
      connectedMatrixId: 'M2',
      title: 'PROGRAMMATION OPÉRATIONNELLE DES ACTIVITÉS WBS DU PTBA (M2)',
      subtitle: 'Détail des tâches annuelles, durées, échéances, appartenance au chemin critique et statut Kanban',
      contentText: [
        `Planification opérationnelle de ${totalTasks} activités WBS au titre du PTBA ${dossier.psdYear || 2026}.`,
        `Répartition : ${completedTasks} Terminées, ${inProgressTasks} En cours, ${todoTasks} Planifiées, ${blockedTasks} Bloquées.`,
        `Suivi hebdomadaire des jalons de début et de fin pour maintenir l’indice SPI à ${spiVal}.`
      ].join('\n'),
      layout: 'full_matrix',
      kpiCards: [
        { label: 'Total Activités PTBA', value: String(totalTasks), subtext: `${pertSummaries.length} projets actifs`, accent: 'primary' },
        { label: 'Chemin Critique', value: `${criticalNodes.length} Tâches`, subtext: `${maxDur} jours ouvrés`, accent: 'amber' },
        { label: 'Taux d’Achèvement', value: `${progressPct}%`, subtext: `${completedTasks} tâche(s) terminée(s)`, accent: 'emerald' }
      ],
      threeCards: [],
      table: buildCompactSlideMatrixTable('M2', matricesData.M2, currency, 5)
    });

    // Slide 5 : Cadencement Multi-Trimestriel (Q1, Q2, Q3, Q4) + Bar Chart Q1-Q4
    rawSlides.push({
      matrixBadge: 'CADENCEMENT TRIMESTRIEL • EXÉCUTION Q1, Q2, Q3, Q4',
      title: 'CADENCEMENT MULTI-TRIMESTRIEL (Q1 À Q4) & TAUX D’EXÉCUTION PTBA',
      subtitle: 'Ventilation de la charge opérationnelle et du rythme d’absorption budgétaire sur les 4 trimestres',
      contentText: [
        `Trimestre 1 (Q1 — Amorçage & Passation, 20%) : ${formatSlideAmount(q1Bud, currency, lang)} — Lancement des DAO et démarrage des lots critiques.`,
        `Trimestre 2 (Q2 — Montée en puissance, 30%) : ${formatSlideAmount(q2Bud, currency, lang)} — Exécution terrain et livrables intermédiaires.`,
        `Trimestre 3 (Q3 — Plein régime opérationnel, 30%) : ${formatSlideAmount(q3Bud, currency, lang)} — Pic de production physique et décaissements.`,
        `Trimestre 4 (Q4 — Consolidation & Clôture annuelle, 20%) : ${formatSlideAmount(q4Bud, currency, lang)} — Réceptions définitives et bilan annuel.`
      ].join('\n'),
      layout: 'two_columns',
      chart: quarterlyPtbaBarChart,
      kpiCards: [
        { label: 'Q1 (20%) & Q2 (30%)', value: formatSlideAmount(q1Bud + q2Bud, currency, lang), subtext: '1er Semestre (50% du PTBA)', accent: 'primary' },
        { label: 'Q3 (30%) & Q4 (20%)', value: formatSlideAmount(q3Bud + q4Bud, currency, lang), subtext: '2nd Semestre (50% du PTBA)', accent: 'sky' },
        { label: 'Total Annuel PTBA', value: budgetFormatted, subtext: '100% programmé sur 12 mois', accent: 'emerald' }
      ],
      threeCards: [
        {
          title: '1. Q1 & Q2 (Semestre 1)',
          badge: '50% Budget',
          bullets: [
            `Q1 (${formatSlideAmount(q1Bud, currency, lang)}) : Mobilisation et lancement des marchés`,
            `Q2 (${formatSlideAmount(q2Bud, currency, lang)}) : Déploiement opérationnel des activités`,
            'Revue semestrielle des indicateurs à fin Q2'
          ]
        },
        {
          title: '2. Q3 & Q4 (Semestre 2)',
          badge: '50% Budget',
          bullets: [
            `Q3 (${formatSlideAmount(q3Bud, currency, lang)}) : Accélération des travaux sur le chemin critique`,
            `Q4 (${formatSlideAmount(q4Bud, currency, lang)}) : Finalisation des livrables M9 et audit annuel`,
            'Cible d’absorption financière annuelle ≥ 95%'
          ]
        },
        {
          title: '3. Régulation & Réallocations',
          badge: 'Agilité',
          bullets: [
            'Actualisation trimestrielle via les Plans de Travail Trimestriels (PTT)',
            'Fongibilité encadrée entre lignes pour éviter toute sous-consommation',
            'Suivi mensuel de la trésorerie et des demandes de retrait (DRF)'
          ]
        }
      ]
    });

    // Slide 6 : Analyse du Chemin Critique PERT/CPM du PTBA
    rawSlides.push({
      matrixBadge: 'INGÉNIERIE PERT / CPM • SÉCURISATION DES DÉLAIS ANNUELS',
      connectedMatrixId: 'M2',
      title: 'CHEMIN CRITIQUE PERT / CPM & MAÎTRISE DES DÉLAIS DU PTBA',
      subtitle: `Séquence critique : ${criticalSeq} • Durée critique : ${maxDur} jours ouvrés`,
      contentText: [
        `Le respect du calendrier annuel du PTBA dépend directement des ${criticalNodes.length} tâches du chemin critique (${criticalSeq}).`,
        `Écarts calendaires actuellement observés : ${delayedTasks} activité(s) avec retard de début ou de fin.`,
        `Goulots d’étranglement à lever en priorité : ${blockedTasks} tâche(s) au statut « Bloqué ».`
      ].join('\n'),
      layout: 'three_cards',
      kpiCards: [
        { label: 'Durée Critique', value: `${maxDur} Jours`, subtext: `${criticalNodes.length} tâches critiques`, accent: 'primary' },
        { label: 'Écarts Détectés', value: String(delayedTasks), subtext: `SPI = ${spiVal}`, accent: delayedTasks > 0 ? 'amber' : 'emerald' },
        { label: 'Tâches Bloquées', value: String(blockedTasks), subtext: 'Arbitrage COPIL/UGP', accent: blockedTasks > 0 ? 'rose' : 'emerald' }
      ],
      threeCards: [
        {
          title: '1. Activités Critiques (Marge 0j)',
          badge: 'Priorité N°1',
          bullets: criticalNodes.slice(0, 4).map(
            n => `[${n.code}] ${n.name} (${n.duration}j • Fin prévue J+${n.ef})`
          )
        },
        {
          title: '2. Résorption des Écarts',
          badge: `${delayedTasks} Écart(s)`,
          bullets: [
            'Analyse hebdomadaire des causes de glissement par tâche',
            'Réaffectation des marges libres des tâches non critiques',
            'Renforcement des équipes sur les lots à forte intensité'
          ]
        },
        {
          title: '3. Déblocage Opérationnel',
          badge: `${blockedTasks} Bloqué(s)`,
          bullets: [
            'Instruction immédiate des dossiers bloqués en comité technique',
            'Accélération des visas de non-objection (ANO) et validations',
            'Maintien de la date cible de clôture de l’exercice annuel'
          ]
        }
      ]
    });

    // Slide 7 : Budget Détaillé par Composante & Analyse EVM (M5) + Bar Chart EVM
    rawSlides.push({
      matrixBadge: 'MATRICE M5 • BUDGET PTBA & VALEUR ACQUISE (EVM)',
      connectedMatrixId: 'M5',
      title: 'BUDGET ANNUEL DÉTAILLÉ PAR COMPOSANTE & EXÉCUTION EVM (M5)',
      subtitle: `BAC : ${budgetFormatted} • Engagé : ${formatSlideAmount(committedFCFA, currency, lang)} • Décaissé AC : ${formatSlideAmount(actualFCFA, currency, lang)} • EV : ${formatSlideAmount(earnedFCFA, currency, lang)}`,
      contentText: [
        `Dotation annuelle globale (BAC) : ${budgetFormatted} répartie sur ${matricesData.M5.length} ligne(s) dans la Matrice M5.`,
        `Montant engagé : ${formatSlideAmount(committedFCFA, currency, lang)} (${committedPct}%) • Décaissé réel (AC) : ${formatSlideAmount(actualFCFA, currency, lang)} (${disbursementPct}%).`,
        `Valeur Acquise (EV) : ${formatSlideAmount(earnedFCFA, currency, lang)} (${earnedPct}%) • Indice d’efficience des coûts (CPI) : ${cpiVal}.`
      ].join('\n'),
      layout: 'two_columns',
      chart: evmComparisonBarChart,
      kpiCards: [
        { label: 'Budget Annuel (BAC)', value: budgetFormatted, subtext: '100% alloué par tâche', accent: 'primary' },
        { label: 'Décaissé Réel (AC)', value: formatSlideAmount(actualFCFA, currency, lang), subtext: `Taux : ${disbursementPct}%`, accent: 'emerald' },
        { label: 'Indice Coût (CPI)', value: cpiVal, subtext: `Valeur Acquise : ${earnedPct}%`, accent: 'sky' }
      ],
      threeCards: [],
      table: buildCompactSlideMatrixTable('M5', matricesData.M5, currency, 4)
    });

    // Slide 8 : Répartition par Source de Financement + Donut Budget M5
    rawSlides.push({
      matrixBadge: 'FINANCEMENT PTBA • SOURCES BAILLEUR / ÉTAT & COMPOSANTES',
      connectedMatrixId: 'M5',
      title: 'VENTILATION DU BUDGET PAR AXE STRATÉGIQUE & SOURCE DE FINANCEMENT',
      subtitle: `Part Bailleur PTF (80%) : ${formatSlideAmount(donorShareFCFA, currency, lang)} • Contrepartie État (20%) : ${formatSlideAmount(nationalShareFCFA, currency, lang)}`,
      contentText: [
        `Structure de financement du PTBA : 80% Ressources Extérieures (${donorOrg}) et 20% Contrepartie Nationale (${execOrg}).`,
        ...axeSummaries.map(
          (ax, i) =>
            `Axe ${i + 1} (${ax.name}) : ${formatSlideAmount(ax.budgetFCFA, currency, lang)} (${totalBudgetFCFA > 0 ? Math.round((ax.budgetFCFA / totalBudgetFCFA) * 100) : 0}% du budget total).`
        ),
        `Plan de trésorerie aligné sur les appels de fonds trimestriels et la justification des dépenses éligibles.`
      ].join('\n'),
      layout: 'two_columns',
      chart: budgetSplitDonutChart,
      kpiCards: [
        { label: 'Part Bailleur (80%)', value: formatSlideAmount(donorShareFCFA, currency, lang), subtext: donorOrg, accent: 'primary' },
        { label: 'Part Nationale (20%)', value: formatSlideAmount(nationalShareFCFA, currency, lang), subtext: execOrg, accent: 'sky' },
        { label: 'Éligibilité Dépenses', value: '100%', subtext: 'Conformité fiduciaire', accent: 'emerald' }
      ],
      threeCards: axeSummaries.slice(0, 3).map((ax, i) => ({
        title: `Axe ${i + 1} : ${ax.name}`,
        badge: `${totalBudgetFCFA > 0 ? Math.round((ax.budgetFCFA / totalBudgetFCFA) * 100) : 0}%`,
        bullets: [
          `Dotation : ${formatSlideAmount(ax.budgetFCFA, currency, lang)}`,
          `${ax.projectCount} projet(s) • ${ax.taskCount} tâche(s) WBS`,
          `Exécution physique : ${ax.taskCount > 0 ? Math.round((ax.doneCount / ax.taskCount) * 100) : 0}%`
        ]
      }))
    });

    // Slide 9 : Plan de Passation des Marchés (PPM) & Acquisitions (M8)
    rawSlides.push({
      matrixBadge: 'MATRICE M8 • PLAN DE PASSATION DES MARCHÉS (PPM)',
      connectedMatrixId: 'M8',
      title: 'PLAN DE PASSATION DES MARCHÉS (PPM) & ACQUISITIONS DU PTBA (M8)',
      subtitle: 'Calendrier de lancement des DAO/DP, modes de passation, revues préalables et suivi des contrats',
      contentText: [
        rawFields.governanceModalities ||
          `Le Plan de Passation des Marchés (Matrice M8) recense ${matricesData.M8.length} procédure(s) d’acquisition inscrite(s) au PTBA.`,
        `Synchronisation stricte entre les dates de passation des marchés et le démarrage des tâches du chemin critique.`,
        `Respect intégral des seuils de revue a priori du Bailleur (ANO) et du Code des marchés publics.`
      ].join('\n'),
      layout: 'full_matrix',
      kpiCards: [
        { label: 'Marchés Inscrits (M8)', value: String(matricesData.M8.length), subtext: 'Services • Fournitures • Travaux', accent: 'primary' },
        { label: 'Volume Engagé', value: formatSlideAmount(committedFCFA, currency, lang), subtext: `${committedPct}% de l’enveloppe`, accent: 'sky' },
        { label: 'Conformité Procédures', value: '100%', subtext: 'Directives PTF & Nationales', accent: 'emerald' }
      ],
      threeCards: [],
      table: buildCompactSlideMatrixTable('M8', matricesData.M8, currency, 5)
    });

    // Slide 10 : Responsabilités RACI (M3) & Livrables Attendus (M9)
    rawSlides.push({
      matrixBadge: 'MATRICES M3 & M9 • RESPONSABILITÉS RACI & LIVRABLES ANNUELS',
      connectedMatrixId: 'M9',
      title: 'GOUVERNANCE D’EXÉCUTION RACI (M3) & LIVRABLES ANNUELS (M9)',
      subtitle: `Affectation des ${raciCtx.allActors.length} acteurs aux ${matricesData.M9.length} livrables contractuels de l’exercice`,
      contentText: [
        `Chaque livrable annuel de la Matrice M9 (${matricesData.M9.length} extrants) est rattaché à un responsable R et un approbateur A dans la Matrice M3.`,
        `Coordination générale assurée par ${raciCtx.leadActorName} (${raciCtx.leadActorRole}).`,
        `Conditionnalité : Aucun décompte financier n’est liquidé sans validation préalable du livrable correspondant.`
      ].join('\n'),
      layout: 'full_matrix',
      kpiCards: [
        { label: 'Livrables PTBA (M9)', value: String(matricesData.M9.length), subtext: `${completedTasks} déjà réceptionnés`, accent: 'primary' },
        { label: 'Acteurs RACI (M3)', value: String(raciCtx.allActors.length), subtext: `Pilote : ${raciCtx.leadActorName}`, accent: 'sky' },
        { label: 'Qualité Livrables', value: '100%', subtext: 'Contrôle contradictoire', accent: 'emerald' }
      ],
      threeCards: [],
      table: buildCompactSlideMatrixTable('M9', matricesData.M9, currency, 5)
    });

    // Slide 11 : Risques d'Exécution du PTBA & Mesures de Mitigation (M7)
    rawSlides.push({
      matrixBadge: 'MATRICE M7 • RISQUES OPÉRATIONNELS & FIDUCIAIRES DU PTBA',
      connectedMatrixId: 'M7',
      title: 'GESTION DES RISQUES OPÉRATIONNELS & BUDGÉTAIRES DU PTBA (M7)',
      subtitle: 'Anticipation des goulets d’étranglement de passation, de décaissement et de calendrier',
      contentText: [
        `Suivi actif des ${matricesData.M7.length} risques majeurs dans la Matrice M7 (Opérationnels, Financiers, Passation).`,
        `Plan d’action immédiat sur les ${blockedTasks} tâche(s) bloquée(s) et les ${delayedTasks} tâche(s) en écart.`,
        `Sécurisation de la fluidité des décaissements pour éviter tout retard d’absorption en fin d’exercice.`
      ].join('\n'),
      layout: 'full_matrix',
      kpiCards: [
        { label: 'Risques PTBA (M7)', value: String(matricesData.M7.length), subtext: 'Matrice PxI surveillée', accent: 'primary' },
        { label: 'Goulots Actuels', value: String(blockedTasks), subtext: `${delayedTasks} écart(s) planning`, accent: blockedTasks > 0 ? 'rose' : 'emerald' },
        { label: 'Continuité', value: 'Garantie', subtext: 'Mesures préventives actives', accent: 'sky' }
      ],
      threeCards: [],
      table: buildCompactSlideMatrixTable('M7', matricesData.M7, currency, 5)
    });

    // Slide 12 : Synthèse des Décisions & Approbation Officielle du PTBA
    rawSlides.push({
      isFinalSlide: true,
      matrixBadge: 'DÉCISION DU COMITÉ • ADOPTION OFFICIELLE DU PTBA ANNUEL',
      title: `SYNTHÈSE DES RÉSOLUTIONS & ADOPTION DU PTBA ANNUEL ${dossier.psdYear || 2026}`,
      subtitle: 'Approbation du programme d’activités, vote de l’enveloppe budgétaire et quitus de mise en œuvre',
      contentText: [
        `Adoption officielle du Plan de Travail et Budget Annuel (PTBA ${dossier.psdYear || 2026} — Réf. ${refCode}).`,
        `Approbation du plafond budgétaire de ${budgetFormatted} et du Plan de Passation des Marchés M8 (${matricesData.M8.length} marchés).`,
        `Mandat donné à l’Unité de Gestion (${execOrg}) pour exécuter les ${totalTasks} activités selon le cadencement Q1–Q4.`,
        `Instauration d’une revue trimestrielle systématique (PTT) pour suivre les indicateurs M1 et l’exécution EVM M5.`
      ].join('\n'),
      layout: 'three_cards',
      kpiCards: [
        { label: 'Plafond Voté', value: budgetFormatted, subtext: `Exercice ${dossier.psdYear || 2026}`, accent: 'emerald' },
        { label: 'Programme Physique', value: `${totalTasks} Activités`, subtext: `${matricesData.M9.length} livrables M9`, accent: 'primary' },
        { label: 'Statut PTBA', value: 'Adopté / Exécutoire', subtext: 'Mise en œuvre immédiate', accent: 'sky' }
      ],
      threeCards: [
        {
          title: '1. Approbation Budgétaire',
          badge: budgetFormatted,
          bullets: [
            `Vote de la dotation annuelle de ${budgetFormatted} (M5)`,
            'Approbation de la clé de répartition Bailleur (80%) / État (20%)',
            'Autorisation d’engagement des crédits dès le Trimestre 1'
          ]
        },
        {
          title: '2. Validation Opérationnelle',
          badge: `${totalTasks} Tâches`,
          bullets: [
            `Adoption du chronogramme WBS/PERT (${maxDur} jours ouvrés)`,
            `Validation du Plan de Passation des Marchés M8 (${matricesData.M8.length} lots)`,
            `Priorisation absolue des ${criticalNodes.length} tâches critiques`
          ]
        },
        {
          title: '3. Gouvernance & Redevabilité',
          badge: 'Suivi Trimestriel',
          bullets: [
            'Déclinaison opérationnelle en Plans de Travail Trimestriels (PTT)',
            'Production des rapports financiers et techniques à chaque fin de trimestre',
            'Audit annuel de performance physique et fiduciaire'
          ]
        }
      ],
      includeSignatures: !hideSignatures,
      orgStampDataUrl: hideSignatures ? undefined : rawFields.orgStampDataUrl,
      partnerStampDataUrl: hideSignatures ? undefined : rawFields.partnerStampDataUrl
    });
  }

  // ============================================================================
  // 20. PRÉSENTATION DU PTT (PLAN DE TRAVAIL TRIMESTRIEL) — 9 SLIDES
  // Matrices auto-activées : M1, M2, M3, M5, M7, M8, M9
  // ============================================================================
  else if (docType === 'slides_ptt') {
    const refCode = rawFields.referenceCode || `SLIDES-PTT-${dossier.psdYear || 2026}-${activeQuarter}-020`;
    const quarterFormatted = formatSlideAmount(quarterBudFCFA, currency, lang);

    // Slide 1 : Couverture 16:9
    rawSlides.push({
      isCoverSlide: true,
      matrixBadge: `COUVERTURE OFFICIELLE 16:9 • PRÉSENTATION DU PTT (${activeQuarter})`,
      title: `PRÉSENTATION DU PLAN DE TRAVAIL TRIMESTRIEL — PTT (${activeQuarter} / 90 JOURS)`,
      subtitle: `${dossier.name} • Programmation opérationnelle à 90 jours • Dotation ${activeQuarter} : ${quarterFormatted}`,
      contentText: [
        `Session d’examen et de validation du Plan de Travail Trimestriel (PTT — Trimestre ${activeQuarter}) du programme « ${dossier.name} »`,
        `Cadencement mensuel (Mois 1, Mois 2, Mois 3) des ${totalTasks} activités WBS et ${matricesData.M9.length} livrables attendus`,
        `Dotation budgétaire trimestrielle (${activeQuarter}) : ${quarterFormatted} sur une enveloppe annuelle de ${budgetFormatted}`,
        `Avancement physique cumulé : ${progressPct}% • Indice CPI : ${cpiVal} • Indice SPI : ${spiVal}`,
        `Présenté par : ${presenterName}`
      ].join('\n'),
      layout: 'two_columns',
      kpiCards: [
        { label: `Trimestre Actif`, value: `${activeQuarter} (90 Jours)`, subtext: 'Mois 1 • Mois 2 • Mois 3', accent: 'primary' },
        { label: `Dotation ${activeQuarter}`, value: quarterFormatted, subtext: `Sur ${budgetFormatted} annuel`, accent: 'emerald' },
        { label: 'Avancement Physique', value: `${progressPct}%`, subtext: `${completedTasks}/${totalTasks} tâches validées`, accent: 'sky' },
        { label: 'Tâches Critiques', value: String(criticalNodes.length), subtext: `${blockedTasks} blocage(s) à lever`, accent: 'amber' }
      ],
      threeCards: [],
      coverData: makeCoverData(
        refCode,
        `COMITÉ DE PILOTAGE TRIMESTRIEL — PTT (${activeQuarter})`,
        `PRÉSENTATION DU PTT (PLAN DE TRAVAIL TRIMESTRIEL — ${activeQuarter})`,
        `${dossier.name} (${dossier.horizonPlan})`
      )
    });

    // Slide 2 : Bilan du Trimestre & Statut WBS/Kanban + Donut WBS
    rawSlides.push({
      matrixBadge: `BILAN OPÉRATIONNEL ${activeQuarter} • STATUT WBS / KANBAN`,
      title: `BILAN D’EXÉCUTION À DATE & PRIORITÉS DU TRIMESTRE ${activeQuarter}`,
      subtitle: 'Point d’avancement des tâches WBS/Kanban et objectifs opérationnels prioritaires à 90 jours',
      contentText: [
        rawFields.contextJustification ||
          `Le Plan de Travail Trimestriel (${activeQuarter}) décline de façon opérationnelle sur 90 jours les priorités du programme « ${dossier.name} ».`,
        `État d’avancement des ${totalTasks} tâches : ${completedTasks} Terminées (${donePct}%), ${inProgressTasks} En cours (${inProgPct}%), ${todoTasks} À lancer, ${blockedTasks} Bloquées.`,
        `Priorité immédiate du trimestre ${activeQuarter} : Finaliser les ${inProgressTasks} tâches en cours et lever les ${blockedTasks} goulots d’étranglement.`
      ].join('\n'),
      layout: 'two_columns',
      chart: wbsStatusDonutChart,
      kpiCards: [
        { label: 'Tâches Terminées', value: `${completedTasks} (${donePct}%)`, subtext: 'Livrables réceptionnés', accent: 'emerald' },
        { label: 'Tâches En Cours', value: `${inProgressTasks} (${inProgPct}%)`, subtext: `Priorité du trimestre ${activeQuarter}`, accent: 'sky' },
        { label: 'Goulots / Retards', value: `${blockedTasks} / ${delayedTasks}`, subtext: 'Action corrective à 15j', accent: blockedTasks > 0 ? 'rose' : 'primary' }
      ],
      threeCards: [
        {
          title: `1. Objectifs Physiques ${activeQuarter}`,
          badge: '90 Jours',
          bullets: [
            `Achever les ${inProgressTasks} tâche(s) actuellement en cours`,
            `Démarrer les ${todoTasks} activité(s) séquencées sur le trimestre`,
            `Maintenir l’indice de performance calendaire SPI ≥ 1.00 (actuel : ${spiVal})`
          ]
        },
        {
          title: `2. Objectifs Financiers ${activeQuarter}`,
          badge: quarterFormatted,
          bullets: [
            `Mobiliser et absorber la dotation trimestrielle de ${quarterFormatted}`,
            `Liquider les décomptes liés aux livrables validés`,
            `Maintenir l’indice d’efficience des coûts CPI ≥ 1.00 (actuel : ${cpiVal})`
          ]
        },
        {
          title: '3. Déblocage & Vigilance',
          badge: 'Action Rapide',
          bullets: [
            `Résoudre sous 7 jours les ${blockedTasks} point(s) de blocage`,
            `Rattraper les ${delayedTasks} écart(s) sur le chemin critique PERT`,
            'Tenir les réunions mensuelles de revue M1, M2 et M3'
          ]
        }
      ]
    });

    // Slide 3 : Cadencement Mensuel (Mois 1, Mois 2, Mois 3) + Bar Chart Mensuel
    rawSlides.push({
      matrixBadge: `CADENCEMENT MENSUEL ${activeQuarter} • MOIS 1, MOIS 2, MOIS 3`,
      title: `CADENCEMENT MENSUEL D’EXÉCUTION (M1, M2, M3) — TRIMESTRE ${activeQuarter}`,
      subtitle: `Répartition mensuelle de la charge opérationnelle et de la dotation de ${quarterFormatted} sur 90 jours`,
      contentText: [
        `Mois 1 (${activeQuarter}-M1 — 30% : ${formatSlideAmount(m1Bud, currency, lang)}) : Lancement des ordres de service, mobilisation terrain et achats urgents.`,
        `Mois 2 (${activeQuarter}-M2 — 40% : ${formatSlideAmount(m2Bud, currency, lang)}) : Pleine production opérationnelle et exécution des nœuds critiques.`,
        `Mois 3 (${activeQuarter}-M3 — 30% : ${formatSlideAmount(m3Bud, currency, lang)}) : Réception technique des livrables M9, facturation et bilan trimestriel.`
      ].join('\n'),
      layout: 'two_columns',
      chart: monthlyPttBarChart,
      kpiCards: [
        { label: `Mois 1 (${activeQuarter}-M1)`, value: formatSlideAmount(m1Bud, currency, lang), subtext: '30% • Lancement & OS', accent: 'primary' },
        { label: `Mois 2 (${activeQuarter}-M2)`, value: formatSlideAmount(m2Bud, currency, lang), subtext: '40% • Production cœur', accent: 'sky' },
        { label: `Mois 3 (${activeQuarter}-M3)`, value: formatSlideAmount(m3Bud, currency, lang), subtext: '30% • Livrables & Clôture', accent: 'emerald' }
      ],
      threeCards: [
        {
          title: `Mois 1 (${activeQuarter}-M1)`,
          badge: 'Semaines 1 à 4',
          bullets: [
            `Allocation : ${formatSlideAmount(m1Bud, currency, lang)}`,
            'Notification des bons de commande et mobilisation des équipes',
            'Lancement des tâches prioritaires à marge nulle'
          ]
        },
        {
          title: `Mois 2 (${activeQuarter}-M2)`,
          badge: 'Semaines 5 à 8',
          bullets: [
            `Allocation : ${formatSlideAmount(m2Bud, currency, lang)}`,
            'Exécution intensive des travaux et missions de terrain',
            'Contrôle qualité à mi-trimestre par la cellule S&E'
          ]
        },
        {
          title: `Mois 3 (${activeQuarter}-M3)`,
          badge: 'Semaines 9 à 12',
          bullets: [
            `Allocation : ${formatSlideAmount(m3Bud, currency, lang)}`,
            'Validation des livrables M9 et paiement des décomptes',
            'Préparation du rapport trimestriel et cadrage du trimestre suivant'
          ]
        }
      ]
    });

    // Slide 4 : Tableau des Activités Opérationnelles du Trimestre (Matrice M2)
    rawSlides.push({
      matrixBadge: `MATRICE M2 • PROGRAMME D’ACTIVITÉS WBS DU TRIMESTRE ${activeQuarter}`,
      connectedMatrixId: 'M2',
      title: `ACTIVITÉS OPÉRATIONNELLES WBS & JALONS DU TRIMESTRE ${activeQuarter} (M2)`,
      subtitle: 'Liste des tâches actives sur les 90 jours, durées, chemin critique PERT et taux d’avancement',
      contentText: [
        `Exécution opérationnelle de ${totalTasks} tâches WBS suivies dans la Matrice M2 au cours du trimestre ${activeQuarter}.`,
        `Focus prioritaire sur les ${inProgressTasks} tâches en cours et les ${criticalNodes.length} tâches appartenant au chemin critique (${criticalSeq}).`
      ].join('\n'),
      layout: 'full_matrix',
      kpiCards: [
        { label: 'Activités Suivies (M2)', value: String(totalTasks), subtext: `${completedTasks} achevées • ${inProgressTasks} actives`, accent: 'primary' },
        { label: 'Chemin Critique', value: `${criticalNodes.length} Tâches`, subtext: criticalSeq, accent: 'amber' },
        { label: 'Avancement Cumulé', value: `${progressPct}%`, subtext: `SPI = ${spiVal}`, accent: 'emerald' }
      ],
      threeCards: [],
      table: buildCompactSlideMatrixTable('M2', matricesData.M2, currency, 5)
    });

    // Slide 5 : Indicateurs Trimestriels GAR (M1) & Livrables à 90 Jours (M9)
    rawSlides.push({
      matrixBadge: `MATRICES M1 & M9 • CIBLES TRIMESTRIELLES & LIVRABLES ${activeQuarter}`,
      connectedMatrixId: 'M9',
      title: `LIVRABLES ATTENDUS À 90 JOURS (M9) & CONTRIBUTION GAR (M1)`,
      subtitle: 'Extrants contractuels à réceptionner durant le trimestre et impact sur les indicateurs SMART',
      contentText: [
        `Le trimestre ${activeQuarter} doit assurer la production et la validation des livrables inscrits dans la Matrice M9 (${matricesData.M9.length} livrables au total).`,
        `Chaque livrable réceptionné incrémente directement le taux de réalisation des résultats GAR dans la Matrice M1 (${progressPct}% à date).`
      ].join('\n'),
      layout: 'full_matrix',
      kpiCards: [
        { label: 'Livrables Suivis (M9)', value: String(matricesData.M9.length), subtext: 'Contrôle qualité UGP', accent: 'primary' },
        { label: 'Indicateurs GAR (M1)', value: String(matricesData.M1.length), subtext: `Taux moyen : ${progressPct}%`, accent: 'emerald' },
        { label: 'Validation Prévue', value: `Fin ${activeQuarter}`, subtext: 'PV de réception requis', accent: 'sky' }
      ],
      threeCards: [],
      table: buildCompactSlideMatrixTable('M9', matricesData.M9, currency, 5)
    });

    // Slide 6 : Budget Trimestriel, Trésorerie & Comparaison EVM (M5) + Bar Chart EVM
    rawSlides.push({
      matrixBadge: `MATRICE M5 • BUDGET TRIMESTRIEL ${activeQuarter} & SUIVI EVM`,
      connectedMatrixId: 'M5',
      title: `EXÉCUTION FINANCIÈRE DU TRIMESTRE ${activeQuarter} & PERFORMANCE EVM (M5)`,
      subtitle: `Dotation ${activeQuarter} : ${quarterFormatted} • Décaissé cumulé : ${formatSlideAmount(actualFCFA, currency, lang)} (${disbursementPct}%) • CPI = ${cpiVal}`,
      contentText: [
        `Budget trimestriel alloué (${activeQuarter}) : ${quarterFormatted} sur une enveloppe annuelle de ${budgetFormatted}.`,
        `Engagements cumulés : ${formatSlideAmount(committedFCFA, currency, lang)} (${committedPct}%) • Coût réel décaissé (AC) : ${formatSlideAmount(actualFCFA, currency, lang)} (${disbursementPct}%).`,
        `Valeur Acquise (EV) : ${formatSlideAmount(earnedFCFA, currency, lang)} (${earnedPct}%) • Indice CPI = ${cpiVal}.`
      ].join('\n'),
      layout: 'two_columns',
      chart: evmComparisonBarChart,
      kpiCards: [
        { label: `Dotation ${activeQuarter}`, value: quarterFormatted, subtext: 'Plan de trésorerie 90j', accent: 'primary' },
        { label: 'Décaissé Cumulé (AC)', value: formatSlideAmount(actualFCFA, currency, lang), subtext: `${disbursementPct}% du budget`, accent: 'emerald' },
        { label: 'Indice Coût (CPI)', value: cpiVal, subtext: 'Maîtrise budgétaire', accent: 'sky' }
      ],
      threeCards: [],
      table: buildCompactSlideMatrixTable('M5', matricesData.M5, currency, 4)
    });

    // Slide 7 : Affectation RACI Trimestrielle (M3) & Passation des Marchés à 90j (M8)
    rawSlides.push({
      matrixBadge: `MATRICES M3 & M8 • ÉQUIPE RACI & ACQUISITIONS DU TRIMESTRE ${activeQuarter}`,
      connectedMatrixId: 'M3',
      title: `RESPONSABILITÉS RACI (M3) & ACQUISITIONS DU TRIMESTRE ${activeQuarter} (M8)`,
      subtitle: `Mobilisation des ${raciCtx.allActors.length} acteurs et suivi des ${matricesData.M8.length} marchés opérationnels`,
      contentText: [
        `Répartition précise des rôles R, A, C, I sur les activités des 90 prochains jours sous la coordination de ${raciCtx.leadActorName}.`,
        `Suivi rapproché des ${matricesData.M8.length} procédures de passation de marchés (Matrice M8) conditionnant les travaux du trimestre.`
      ].join('\n'),
      layout: 'full_matrix',
      kpiCards: [
        { label: 'Équipe Active (M3)', value: `${raciCtx.allActors.length} Acteurs`, subtext: `Chef : ${raciCtx.leadActorName}`, accent: 'primary' },
        { label: 'Marchés PPM (M8)', value: String(matricesData.M8.length), subtext: 'Passation & Exécution', accent: 'sky' },
        { label: 'Charge Trimestre', value: '90 Jours', subtext: '100% couverte', accent: 'emerald' }
      ],
      threeCards: [],
      table: buildCompactSlideMatrixTable('M3', matricesData.M3, currency, 5)
    });

    // Slide 8 : Risques Immédiats à 90 Jours & Déblocage des Goulots (M7)
    rawSlides.push({
      matrixBadge: `MATRICE M7 • RISQUES À 90 JOURS & PLAN DE DÉBLOCAGE ${activeQuarter}`,
      connectedMatrixId: 'M7',
      title: `RISQUES OPÉRATIONNELS À 90 JOURS & LEVÉE DES BLOCAGES (M7)`,
      subtitle: `Traitement prioritaire des ${blockedTasks} tâche(s) bloquée(s) et des ${delayedTasks} écart(s) sur le trimestre ${activeQuarter}`,
      contentText: [
        `Surveillance active des ${matricesData.M7.length} risques inscrits dans la Matrice M7 pour le trimestre ${activeQuarter}.`,
        `Action corrective immédiate sur les ${blockedTasks} tâche(s) bloquée(s) et rattrapage des ${delayedTasks} tâche(s) en écart.`
      ].join('\n'),
      layout: 'full_matrix',
      kpiCards: [
        { label: 'Risques Trimestre (M7)', value: String(matricesData.M7.length), subtext: 'Mitigation opérationnelle', accent: 'primary' },
        { label: 'Tâches Bloquées', value: String(blockedTasks), subtext: 'Levée sous 7 jours', accent: blockedTasks > 0 ? 'rose' : 'emerald' },
        { label: 'Écarts Planning', value: String(delayedTasks), subtext: 'Rattrapage M1–M2', accent: delayedTasks > 0 ? 'amber' : 'emerald' }
      ],
      threeCards: [],
      table: buildCompactSlideMatrixTable('M7', matricesData.M7, currency, 5)
    });

    // Slide 9 : Approbation du PTT & Feuille de Route des 90 Jours
    rawSlides.push({
      isFinalSlide: true,
      matrixBadge: `DÉCISION DU COMITÉ • VALIDATION DU PTT (${activeQuarter})`,
      title: `APPROBATION DU PTT (${activeQuarter}) & ENGAGEMENTS À 90 JOURS`,
      subtitle: 'Validation du calendrier mensuel (M1, M2, M3), déblocage de la dotation trimestrielle et lancement',
      contentText: [
        `Approbation officielle du Plan de Travail Trimestriel (PTT ${activeQuarter} — Réf. ${refCode}).`,
        `Autorisation de mise à disposition de la dotation trimestrielle de ${quarterFormatted} (M1 : ${formatSlideAmount(m1Bud, currency, lang)}, M2 : ${formatSlideAmount(m2Bud, currency, lang)}, M3 : ${formatSlideAmount(m3Bud, currency, lang)}).`,
        `Engagement de l’équipe projet (${raciCtx.leadActorName}) à livrer les extrants M9 du trimestre et à résorber les ${blockedTasks} blocage(s).`
      ].join('\n'),
      layout: 'three_cards',
      kpiCards: [
        { label: `Statut PTT ${activeQuarter}`, value: 'Validé', subtext: `Réf. ${refCode}`, accent: 'emerald' },
        { label: `Crédits ${activeQuarter}`, value: quarterFormatted, subtext: 'Trésorerie 90 jours', accent: 'primary' },
        { label: 'Suivi Mensuel', value: 'M1 • M2 • M3', subtext: 'Revue fin de mois', accent: 'sky' }
      ],
      threeCards: [
        {
          title: '1. Validation Budgétaire 90j',
          badge: quarterFormatted,
          bullets: [
            `Approbation de l’allocation trimestrielle de ${quarterFormatted}`,
            'Sécurisation des décaissements sur les 3 mois (M1, M2, M3)',
            'Alignement strict entre appels de fonds et livrables M9'
          ]
        },
        {
          title: '2. Priorités Terrain Immédiates',
          badge: `${inProgressTasks} Actives`,
          bullets: [
            `Finalisation prioritaire des ${inProgressTasks} tâches en cours`,
            `Levée immédiate des ${blockedTasks} blocage(s) identifié(s)`,
            `Protection des ${criticalNodes.length} nœuds du chemin critique`
          ]
        },
        {
          title: '3. Rendez-vous de Contrôle',
          badge: 'Gouvernance',
          bullets: [
            'Point opérationnel hebdomadaire au sein de l’UGP',
            'Arrêté mensuel d’exécution physique et financière (M1, M2, M3)',
            `Bilan de clôture du trimestre ${activeQuarter} et préparation du suivant`
          ]
        }
      ],
      includeSignatures: !hideSignatures,
      orgStampDataUrl: hideSignatures ? undefined : rawFields.orgStampDataUrl,
      partnerStampDataUrl: hideSignatures ? undefined : rawFields.partnerStampDataUrl
    });
  }

  // ============================================================================
  // 21. PRÉSENTATION DE L'ÉVALUATION À MI-PARCOURS — 12 SLIDES
  // Matrices auto-activées : M1 à M10
  // ============================================================================
  else if (docType === 'slides_mi_parcours') {
    const refCode = rawFields.referenceCode || `SLIDES-MIP-${dossier.psdYear || 2026}-021`;

    // Slide 1 : Couverture 16:9
    rawSlides.push({
      isCoverSlide: true,
      matrixBadge: 'COUVERTURE OFFICIELLE 16:9 • ÉVALUATION À MI-PARCOURS',
      title: 'PRÉSENTATION DE L’ÉVALUATION À MI-PARCOURS DU PROGRAMME',
      subtitle: `${dossier.name} • Diagnostic OCDE/CAD à mi-étape, écarts physico-financiers et réorientations stratégiques`,
      contentText: [
        `Restitution officielle de l’Évaluation à Mi-Parcours du programme « ${dossier.name} » (${dossier.horizonPlan})`,
        `Score global de performance à mi-parcours (6 critères OCDE/CAD) : ${avgOcdeScore} / 5`,
        `Taux d’exécution physique à mi-étape : ${progressPct}% (${completedTasks}/${totalTasks} tâches) • Taux de décaissement : ${disbursementPct}%`,
        `Indices EVM : CPI = ${cpiVal} • SPI = ${spiVal} • Recommandations de réorientation (M10) : ${matricesData.M10.length}`,
        `Présenté par : ${presenterName}`
      ].join('\n'),
      layout: 'two_columns',
      kpiCards: [
        { label: 'Score Mi-Parcours OCDE', value: `${avgOcdeScore} / 5`, subtext: '6 critères évalués (M6)', accent: 'emerald' },
        { label: 'Exécution Physique', value: `${progressPct}%`, subtext: `${completedTasks}/${totalTasks} tâches validées`, accent: 'primary' },
        { label: 'Exécution Financière', value: `${disbursementPct}%`, subtext: `CPI = ${cpiVal} • SPI = ${spiVal}`, accent: 'sky' },
        { label: 'Plan d’Action (M10)', value: `${matricesData.M10.length} Actions`, subtext: 'Réorientations Phase II', accent: 'amber' }
      ],
      threeCards: [],
      coverData: makeCoverData(
        refCode,
        'COMITÉ DE RESTITUTION DE L’ÉVALUATION À MI-PARCOURS',
        'PRÉSENTATION DE L’ÉVALUATION À MI-PARCOURS',
        `${dossier.name} (${dossier.horizonPlan})`
      )
    });

    // Slide 2 : Objectifs de la Revue à Mi-Parcours & Synthèse des Scores OCDE/CAD + Bar Chart OCDE
    rawSlides.push({
      matrixBadge: 'DIAGNOSTIC MI-PARCOURS • NOTATION OCDE / CAD (SUR 5)',
      connectedMatrixId: 'M6',
      title: 'SYNTHÈSE DE LA PERFORMANCE À MI-PARCOURS & SCORES OCDE / CAD',
      subtitle: `Note globale : ${avgOcdeScore} / 5 • Évaluation indépendante selon les 6 critères normatifs OCDE/CAD`,
      contentText: [
        `L’évaluation à mi-parcours mesure le chemin parcouru sur les ${(dossier.axes || []).length} axe(s) et identifie les ajustements requis pour la seconde moitié du programme.`,
        ...ocdeChartItems.map(item => `${item.label} : ${item.displayValue} — ${item.sublabel}.`),
        `Conclusion à mi-étape : Les fondations techniques et fiduciaires sont solides (CPI ${cpiVal}), mais une accélération est requise sur les ${inProgressTasks + todoTasks} tâches restantes.`
      ].join('\n'),
      layout: 'two_columns',
      chart: ocdeScoresBarChart,
      kpiCards: [
        { label: 'Note Moyenne OCDE', value: `${avgOcdeScore} / 5`, subtext: 'Performance satisfaisante', accent: 'emerald' },
        { label: 'Critères Évalués', value: '6 Critères', subtext: 'Matrice M6 complète', accent: 'primary' },
        { label: 'Potentiel d’Achèvement', value: 'Élevé', subtext: 'Sous réserve du plan M10', accent: 'sky' }
      ],
      threeCards: []
    });

    // Slide 3 : Matrice Normative d'Évaluation (M6)
    rawSlides.push({
      matrixBadge: 'MATRICE M6 • GRILLE D’ÉVALUATION À MI-PARCOURS',
      connectedMatrixId: 'M6',
      title: 'MATRICE D’ÉVALUATION À MI-PARCOURS & QUESTIONS ÉVALUATIVES (M6)',
      subtitle: 'Pondération des critères, questions évaluatives principales, indicateurs et appréciations',
      contentText: [
        `Analyse détaillée des ${matricesData.M6.length} questions évaluatives structurant la revue à mi-parcours (Matrice M6).`,
        `Triangulation systématique entre les données du système S&E, les livrables M9 et les entretiens avec les parties prenantes M4.`
      ].join('\n'),
      layout: 'full_matrix',
      kpiCards: [
        { label: 'Questions Évaluatives', value: String(matricesData.M6.length), subtext: 'Matrice M6 renseignée', accent: 'primary' },
        { label: 'Score Consolidé', value: `${avgOcdeScore} / 5`, subtext: 'Pondération 100%', accent: 'emerald' },
        { label: 'Fiabilité Preuves', value: 'Vérifiée', subtext: 'Normes UNEG', accent: 'sky' }
      ],
      threeCards: [],
      table: buildCompactSlideMatrixTable('M6', matricesData.M6, currency, 6)
    });

    // Slide 4 : Analyse de la Pertinence & de la Cohérence à Mi-Parcours (M1 & M4)
    rawSlides.push({
      matrixBadge: 'CRITÈRES 1 & 2 • PERTINENCE & COHÉRENCE À MI-ÉTAPE',
      connectedMatrixId: 'M4',
      title: 'ANALYSE DE LA PERTINENCE & DE LA COHÉRENCE À MI-PARCOURS (M1, M4)',
      subtitle: 'Maintien de la pertinence des objectifs initiaux et qualité de la coordination multi-acteurs',
      contentText: [
        `Pertinence (${ocdeChartItems[0]?.displayValue}) : Les ${(dossier.axes || []).length} axe(s) répondent toujours pleinement aux priorités de ${execOrg} et des bénéficiaires.`,
        `Cohérence (${ocdeChartItems[1]?.displayValue}) : Bonne articulation entre les ${pertSummaries.length} projets et synergie avec les interventions de ${donorOrg}.`,
        `Point d’attention à mi-parcours : Renforcer la concertation opérationnelle avec les ${matricesData.M4.length} parties prenantes (Matrice M4) pour fluidifier les validations.`
      ].join('\n'),
      layout: 'full_matrix',
      kpiCards: [
        { label: 'Score Pertinence', value: `${ocdeChartItems[0]?.value.toFixed(1) || '4.5'} / 5`, subtext: 'Alignement besoin/stratégie', accent: 'emerald' },
        { label: 'Score Cohérence', value: `${ocdeChartItems[1]?.value.toFixed(1) || '4.3'} / 5`, subtext: 'Synergie interne & externe', accent: 'primary' },
        { label: 'Parties Prenantes (M4)', value: String(matricesData.M4.length), subtext: 'Mobilisation active', accent: 'sky' }
      ],
      threeCards: [],
      table: buildCompactSlideMatrixTable('M4', matricesData.M4, currency, 5)
    });

    // Slide 5 : Efficacité à Mi-Parcours — Atteinte des Résultats GAR (M1)
    rawSlides.push({
      matrixBadge: 'CRITÈRE 3 : EFFICACITÉ • RÉSULTATS GAR À MI-PARCOURS (M1)',
      connectedMatrixId: 'M1',
      title: 'EFFICACITÉ À MI-PARCOURS : ATTEINTE DES CIBLES DU CADRE LOGIQUE (M1)',
      subtitle: `Taux d’exécution physique global : ${progressPct}% (${completedTasks} tâches terminées, ${inProgressTasks} en cours)`,
      contentText: [
        `Score d’Efficacité à mi-parcours : ${ocdeChartItems[2]?.displayValue}.`,
        `Sur les ${matricesData.M1.length} résultats suivis dans la Matrice M1, l’avancement moyen s’établit à ${progressPct}%.`,
        `Dynamique positive avec ${inProgressTasks} activités en cours de production qui permettront de franchir le cap des 75% dès leur réception.`
      ].join('\n'),
      layout: 'full_matrix',
      kpiCards: [
        { label: 'Score Efficacité', value: `${ocdeChartItems[2]?.value.toFixed(1) || '4.2'} / 5`, subtext: 'Atteinte des résultats M1', accent: 'emerald' },
        { label: 'Taux Physique', value: `${progressPct}%`, subtext: `${completedTasks}/${totalTasks} activités achevées`, accent: 'primary' },
        { label: 'Tâches En Cours', value: String(inProgressTasks), subtext: 'Levier d’accélération', accent: 'sky' }
      ],
      threeCards: [],
      table: buildCompactSlideMatrixTable('M1', matricesData.M1, currency, 5)
    });

    // Slide 6 : État du WBS/Kanban & Goulots à Mi-Parcours (M2) + Donut WBS
    rawSlides.push({
      matrixBadge: 'EXÉCUTION OPÉRATIONNELLE • WBS, KANBAN & CHEMIN CRITIQUE (M2)',
      connectedMatrixId: 'M2',
      title: 'DIAGNOSTIC OPÉRATIONNEL WBS / KANBAN & GOULOTS À MI-PARCOURS (M2)',
      subtitle: `Analyse de la vitesse d’exécution (SPI = ${spiVal}), du chemin critique (${maxDur}j) et des blocages`,
      contentText: [
        `Répartition à mi-parcours des ${totalTasks} tâches WBS : ${completedTasks} Terminées (${donePct}%), ${inProgressTasks} En cours (${inProgPct}%), ${todoTasks} À lancer, ${blockedTasks} Bloquées.`,
        `Écarts calendaires constatés : ${delayedTasks} activité(s) présentant un glissement sur une durée critique de ${maxDur} jours ouvrés.`,
        `Mesure corrective prioritaire : Débloquer les ${blockedTasks} tâche(s) bloquée(s) et concentrer les moyens sur ${criticalSeq}.`
      ].join('\n'),
      layout: 'two_columns',
      chart: wbsStatusDonutChart,
      kpiCards: [
        { label: 'Indice Délai (SPI)', value: spiVal, subtext: `${delayedTasks} écart(s) calendaire(s)`, accent: 'primary' },
        { label: 'Chemin Critique', value: `${maxDur}j`, subtext: `${criticalNodes.length} nœuds critiques`, accent: 'amber' },
        { label: 'Blocages à Lever', value: String(blockedTasks), subtext: 'Urgence Phase II', accent: blockedTasks > 0 ? 'rose' : 'emerald' }
      ],
      threeCards: [],
      table: buildCompactSlideMatrixTable('M2', matricesData.M2, currency, 4)
    });

    // Slide 7 : Efficience Budgétaire & Analyse de la Valeur Acquise EVM (M5) + Bar Chart EVM
    rawSlides.push({
      matrixBadge: 'CRITÈRE 4 : EFFICIENCE • EXÉCUTION FINANCIÈRE & EVM (M5)',
      connectedMatrixId: 'M5',
      title: 'EFFICIENCE À MI-PARCOURS : CONSOMMATION BUDGÉTAIRE & EVM (M5)',
      subtitle: `Budget (BAC) : ${budgetFormatted} • Décaissé (AC) : ${formatSlideAmount(actualFCFA, currency, lang)} (${disbursementPct}%) • CPI = ${cpiVal}`,
      contentText: [
        `Score d’Efficience à mi-parcours : ${ocdeChartItems[3]?.displayValue} avec un indice CPI de ${cpiVal}.`,
        `Engagements cumulés : ${formatSlideAmount(committedFCFA, currency, lang)} (${committedPct}%) • Décaissements réels (AC) : ${formatSlideAmount(actualFCFA, currency, lang)} (${disbursementPct}%).`,
        `Valeur Acquise (EV) : ${formatSlideAmount(earnedFCFA, currency, lang)} (${earnedPct}%) démontrant une bonne maîtrise des coûts unitaires.`
      ].join('\n'),
      layout: 'two_columns',
      chart: evmComparisonBarChart,
      kpiCards: [
        { label: 'Score Efficience', value: `${ocdeChartItems[3]?.value.toFixed(1) || '4.3'} / 5`, subtext: `Indice CPI = ${cpiVal}`, accent: 'emerald' },
        { label: 'Taux d’Engagement', value: `${committedPct}%`, subtext: formatSlideAmount(committedFCFA, currency, lang), accent: 'primary' },
        { label: 'Taux Décaissement', value: `${disbursementPct}%`, subtext: formatSlideAmount(actualFCFA, currency, lang), accent: 'sky' }
      ],
      threeCards: [],
      table: buildCompactSlideMatrixTable('M5', matricesData.M5, currency, 4)
    });

    // Slide 8 : Performance de la Gouvernance RACI (M3) & Passation des Marchés (M8)
    rawSlides.push({
      matrixBadge: 'MATRICES M3 & M8 • GOUVERNANCE RACI & PASSATION DES MARCHÉS',
      connectedMatrixId: 'M8',
      title: 'REVUE DE LA GOUVERNANCE RACI (M3) & DES MARCHÉS PUBLICS (M8)',
      subtitle: `Évaluation de la coordination des ${raciCtx.allActors.length} acteurs et de l’exécution des ${matricesData.M8.length} marchés`,
      contentText: [
        `La gouvernance RACI pilotée par ${raciCtx.leadActorName} assure une répartition claire des responsabilités sur les ${matricesData.M3.length} lots.`,
        `Exécution du Plan de Passation des Marchés (Matrice M8) : ${matricesData.M8.length} contrats suivis avec nécessité d’accélérer les procédures restantes pour la Phase II.`
      ].join('\n'),
      layout: 'full_matrix',
      kpiCards: [
        { label: 'Acteurs RACI (M3)', value: String(raciCtx.allActors.length), subtext: `Pilote : ${raciCtx.leadActorName}`, accent: 'primary' },
        { label: 'Marchés PPM (M8)', value: String(matricesData.M8.length), subtext: 'Suivi contractuel actif', accent: 'sky' },
        { label: 'Délais Passation', value: 'Sous Contrôle', subtext: 'Priorité Phase II', accent: 'emerald' }
      ],
      threeCards: [],
      table: buildCompactSlideMatrixTable('M8', matricesData.M8, currency, 5)
    });

    // Slide 9 : Qualité des Livrables à Mi-Parcours (M9) & Premiers Effets / Viabilité
    rawSlides.push({
      matrixBadge: 'MATRICE M9 • LIVRABLES RÉCEPTIONNÉS & PREMIERS EFFETS',
      connectedMatrixId: 'M9',
      title: 'LIVRABLES PRODUITS À MI-PARCOURS (M9) & PERSPECTIVES DE DURABILITÉ',
      subtitle: 'Bilan qualitatif des extrants livrés, premiers changements observés et conditions de pérennisation',
      contentText: [
        `Suivi des ${matricesData.M9.length} livrables contractuels dans la Matrice M9 (${completedTasks} déjà validés, ${inProgressTasks} en cours de finalisation).`,
        `Premiers effets positifs constatés sur le terrain (Score Impact préliminaire : ${ocdeChartItems[4]?.displayValue}).`,
        `Durabilité (${ocdeChartItems[5]?.displayValue}) : Appropriation progressive des outils et méthodes par les équipes de ${execOrg}.`
      ].join('\n'),
      layout: 'full_matrix',
      kpiCards: [
        { label: 'Livrables Suivis (M9)', value: String(matricesData.M9.length), subtext: `${completedTasks} validés (${progressPct}%)`, accent: 'primary' },
        { label: 'Impact Préliminaire', value: `${ocdeChartItems[4]?.value.toFixed(1) || '4.1'} / 5`, subtext: 'Effets émergents positifs', accent: 'emerald' },
        { label: 'Score Durabilité', value: `${ocdeChartItems[5]?.value.toFixed(1) || '4.0'} / 5`, subtext: 'Transfert en cours', accent: 'sky' }
      ],
      threeCards: [],
      table: buildCompactSlideMatrixTable('M9', matricesData.M9, currency, 5)
    });

    // Slide 10 : Actualisation du Registre des Risques RAID à Mi-Parcours (M7)
    rawSlides.push({
      matrixBadge: 'MATRICE M7 • ACTUALISATION DES RISQUES RAID À MI-PARCOURS',
      connectedMatrixId: 'M7',
      title: 'REGISTRE DES RISQUES ACTUALISÉ POUR LA SECONDE PHASE (MATRICE M7)',
      subtitle: 'Nouveaux facteurs de risque identifiés à mi-parcours et renforcement des mesures d’atténuation',
      contentText: [
        `Mise à jour des ${matricesData.M7.length} entrées du registre RAID (Matrice M7) pour sécuriser la seconde moitié du programme.`,
        `Priorité de mitigation : Résorption des ${blockedTasks} blocage(s) et prévention des retards de décaissement.`
      ].join('\n'),
      layout: 'full_matrix',
      kpiCards: [
        { label: 'Risques Actifs (M7)', value: String(matricesData.M7.length), subtext: 'Matrice PxI révisée', accent: 'primary' },
        { label: 'Blocages Critiques', value: String(blockedTasks), subtext: 'Traitement immédiat', accent: blockedTasks > 0 ? 'rose' : 'emerald' },
        { label: 'Écarts Délais', value: String(delayedTasks), subtext: 'Plan de rattrapage actif', accent: 'amber' }
      ],
      threeCards: [],
      table: buildCompactSlideMatrixTable('M7', matricesData.M7, currency, 5)
    });

    // Slide 11 : Plan d'Action Correctif (CAP) & Réorientations à Mi-Parcours (M10)
    rawSlides.push({
      matrixBadge: 'MATRICE M10 • RECOMMANDATIONS & PLAN D’ACTION CORRECTIF (CAP)',
      connectedMatrixId: 'M10',
      title: 'RECOMMANDATIONS À MI-PARCOURS & PLAN D’ACTION CORRECTIF CAP (M10)',
      subtitle: 'Mesures de redressement opérationnel, d’accélération budgétaire et de réajustement pour la Phase II',
      contentText: [
        `${matricesData.M10.length} recommandations opérationnelles inscrites dans la Matrice M10 avec responsables et échéances fermes.`,
        `Axe correctif N°1 : Débloquer sous 10 jours les ${blockedTasks} tâche(s) bloquée(s) et rattraper les ${delayedTasks} écart(s) sur ${criticalSeq}.`,
        `Axe correctif N°2 : Accélérer la liquidation des engagements (${committedPct}%) pour porter le décaissement de ${disbursementPct}% vers 100%.`
      ].join('\n'),
      layout: 'full_matrix',
      kpiCards: [
        { label: 'Prescriptions CAP (M10)', value: String(matricesData.M10.length), subtext: 'Plan de redressement chiffré', accent: 'primary' },
        { label: 'Délai Déblocage', value: 'J + 10', subtext: `Sur ${blockedTasks} tâche(s) bloquée(s)`, accent: 'amber' },
        { label: 'Cible Phase II', value: '100%', subtext: 'Achèvement intégral', accent: 'emerald' }
      ],
      threeCards: [],
      table: buildCompactSlideMatrixTable('M10', matricesData.M10, currency, 5)
    });

    // Slide 12 : Décisions du Comité & Feuille de Route de la Phase II
    rawSlides.push({
      isFinalSlide: true,
      matrixBadge: 'DÉCISION DU COMITÉ • VALIDATION DE LA REVUE À MI-PARCOURS',
      title: 'CONCLUSIONS À MI-PARCOURS, RÉORIENTATIONS & QUITUS D’ÉTAPE',
      subtitle: 'Validation du rapport à mi-parcours, adoption du plan d’action M10 et lancement de la Phase II',
      contentText: [
        `Approbation officielle du Rapport d’Évaluation à Mi-Parcours (Réf. ${refCode}) avec un score global de ${avgOcdeScore} / 5.`,
        `Adoption par l’UGP (${execOrg}) des ${matricesData.M10.length} actions correctives de la Matrice M10.`,
        `Maintien de l’enveloppe budgétaire de ${budgetFormatted} et autorisation de réallocation interne vers le chemin critique.`,
        `Cap sur la clôture : Finalisation des ${inProgressTasks + todoTasks} tâches restantes avant l’évaluation finale.`
      ].join('\n'),
      layout: 'three_cards',
      kpiCards: [
        { label: 'Verdict Mi-Parcours', value: `${avgOcdeScore} / 5`, subtext: 'Poursuite approuvée', accent: 'emerald' },
        { label: 'Actions CAP (M10)', value: `${matricesData.M10.length} Mesures`, subtext: 'Exécutoires immédiatement', accent: 'primary' },
        { label: 'Quitus d’Étape', value: 'Accordé', subtext: 'Passage en Phase II', accent: 'sky' }
      ],
      threeCards: [
        {
          title: '1. Validation du Bilan Mi-Étape',
          badge: `${avgOcdeScore} / 5`,
          bullets: [
            `Validation des constats sur les ${completedTasks} tâches achevées (${progressPct}%)`,
            `Reconnaissance de l’efficience budgétaire (CPI = ${cpiVal})`,
            'Octroi du quitus technique et financier de mi-parcours'
          ]
        },
        {
          title: '2. Réorientations Phase II',
          badge: 'Accélération',
          bullets: [
            `Mise en œuvre immédiate des ${matricesData.M10.length} actions de la Matrice M10`,
            `Levée prioritaire des ${blockedTasks} blocage(s) et ${delayedTasks} écart(s)`,
            `Concentration des moyens sur les ${criticalNodes.length} nœuds critiques`
          ]
        },
        {
          title: '3. Préparation de la Clôture',
          badge: 'Horizon Final',
          bullets: [
            `Réception progressive des ${matricesData.M9.length} livrables M9`,
            'Documentation systématique des bonnes pratiques et leçons apprises',
            'Planification de la mission d’évaluation finale et de clôture'
          ]
        }
      ],
      includeSignatures: !hideSignatures,
      orgStampDataUrl: hideSignatures ? undefined : rawFields.orgStampDataUrl,
      partnerStampDataUrl: hideSignatures ? undefined : rawFields.partnerStampDataUrl
    });
  }

  // ============================================================================
  // 22. PRÉSENTATION DE L'ÉVALUATION FINALE & CLÔTURE — 15 SLIDES
  // Matrices auto-activées : M1 à M10
  // ============================================================================
  else {
    const refCode = rawFields.referenceCode || `SLIDES-FIN-${dossier.psdYear || 2026}-022`;

    // Slide 1 : Couverture 16:9
    rawSlides.push({
      isCoverSlide: true,
      matrixBadge: 'COUVERTURE OFFICIELLE 16:9 • ÉVALUATION FINALE & CLÔTURE',
      title: 'PRÉSENTATION DE L’ÉVALUATION FINALE RÉTROSPECTIVE & CLÔTURE DU PROGRAMME',
      subtitle: `${dossier.name} • Bilan définitif OCDE/CAD & UNEG, audit physico-financier, capitalisation et quitus final`,
      contentText: [
        `Session solennelle de restitution de l’Évaluation Finale et de Clôture du programme « ${dossier.name} » (${dossier.horizonPlan})`,
        `Score final de performance globale (6 critères OCDE/CAD) : ${avgOcdeScore} / 5`,
        `Bilan physique cumulé : ${progressPct}% (${completedTasks}/${totalTasks} tâches WBS) • Bilan financier : ${disbursementPct}% décaissés sur ${budgetFormatted}`,
        `Indices de performance finale : CPI = ${cpiVal} • SPI = ${spiVal} • Recommandations & Capitalisation (M10) : ${matricesData.M10.length}`,
        `Présenté par : ${presenterName}`
      ].join('\n'),
      layout: 'two_columns',
      kpiCards: [
        { label: 'Note Finale OCDE/CAD', value: `${avgOcdeScore} / 5`, subtext: 'Performance certifiée UNEG', accent: 'emerald' },
        { label: 'Réalisation Physique', value: `${progressPct}%`, subtext: `${completedTasks}/${totalTasks} tâches validées`, accent: 'primary' },
        { label: 'Bilan Financier', value: `${disbursementPct}%`, subtext: `CPI = ${cpiVal} • Budget ${budgetFormatted}`, accent: 'sky' },
        { label: 'Livrables (M9)', value: String(matricesData.M9.length), subtext: 'Réception & Clôture', accent: 'amber' }
      ],
      threeCards: [],
      coverData: makeCoverData(
        refCode,
        'SESSION OFFICIELLE D’ÉVALUATION FINALE & CLÔTURE',
        'PRÉSENTATION DE L’ÉVALUATION FINALE & CLÔTURE',
        `${dossier.name} (${dossier.horizonPlan})`
      )
    });

    // Slide 2 : Résumé Exécutif & Graphique des Scores par Critère OCDE/CAD (sur 5)
    rawSlides.push({
      matrixBadge: 'VERDICT ÉVALUATIF FINAL • SCORES OCDE / CAD (SUR 5)',
      connectedMatrixId: 'M6',
      title: 'VERDICT GLOBAL DE L’ÉVALUATION FINALE & SCORES OCDE / CAD (SUR 5)',
      subtitle: `Note finale consolidée : ${avgOcdeScore} / 5 • Synthèse de la performance sur les 6 critères normatifs`,
      contentText: [
        `L’évaluation finale rétrospective atteste d’un score global de ${avgOcdeScore} / 5 sur l’ensemble du cycle de vie du programme « ${dossier.name} ».`,
        ...ocdeChartItems.map(item => `${item.label} : ${item.displayValue} — ${item.sublabel}.`),
        `Performance remarquable sur la Pertinence, la Cohérence et l’Efficience budgétaire (CPI = ${cpiVal}).`
      ].join('\n'),
      layout: 'two_columns',
      chart: ocdeScoresBarChart,
      kpiCards: [
        { label: 'Score Final OCDE', value: `${avgOcdeScore} / 5`, subtext: 'Appréciation : Satisfaisant+', accent: 'emerald' },
        { label: 'Efficience Finale', value: `CPI ${cpiVal}`, subtext: `SPI ${spiVal}`, accent: 'primary' },
        { label: 'Portefeuille Évalué', value: `${(dossier.axes || []).length} Axes`, subtext: `${pertSummaries.length} projets audités`, accent: 'sky' }
      ],
      threeCards: []
    });

    // Slide 3 : Démarche Méthodologique UNEG & Matrice Évaluative (M6)
    rawSlides.push({
      matrixBadge: 'MATRICE M6 • RÉFÉRENTIEL NORMATIF OCDE / CAD & UNEG',
      connectedMatrixId: 'M6',
      title: 'DÉMARCHE MÉTHODOLOGIQUE UNEG & MATRICE ÉVALUATIVE COMPLÈTE (M6)',
      subtitle: 'Questions évaluatives, pondérations, indicateurs de réponse et notation contradictoire sur 5',
      contentText: [
        `Évaluation finale conduite conformément aux normes et standards du Groupe des Nations Unies pour l’Évaluation (UNEG) et de l’OCDE/CAD.`,
        `Exploitation intégrale des ${matricesData.M6.length} questions évaluatives de la Matrice M6 avec triangulation des preuves documentaires et de terrain.`
      ].join('\n'),
      layout: 'full_matrix',
      kpiCards: [
        { label: 'Questions Évaluées (M6)', value: String(matricesData.M6.length), subtext: 'Couverture 100% du périmètre', accent: 'primary' },
        { label: 'Note Pondérée', value: `${avgOcdeScore} / 5`, subtext: 'Barème international /5', accent: 'emerald' },
        { label: 'Indépendance', value: 'Certifiée', subtext: 'Audit contradictoire', accent: 'sky' }
      ],
      threeCards: [],
      table: buildCompactSlideMatrixTable('M6', matricesData.M6, currency, 6)
    });

    // Slide 4 : Critères 1 & 2 — Pertinence & Cohérence (M1 & M4)
    rawSlides.push({
      matrixBadge: 'CRITÈRES 1 & 2 • PERTINENCE & COHÉRENCE STRATÉGIQUE (M1, M4)',
      connectedMatrixId: 'M4',
      title: 'BILAN DE LA PERTINENCE & DE LA COHÉRENCE INSTITUTIONNELLE (M1, M4)',
      subtitle: 'Adéquation de la conception initiale aux besoins réels et qualité du partenariat multi-acteurs',
      contentText: [
        `Pertinence (${ocdeChartItems[0]?.displayValue}) : Alignement exemplaire des ${(dossier.axes || []).length} axe(s) sur les besoins des bénéficiaires et les priorités sectorielles.`,
        `Cohérence (${ocdeChartItems[1]?.displayValue}) : Complémentarité réussie entre ${donorOrg}, ${execOrg} et les ${matricesData.M4.length} parties prenantes de la Matrice M4.`
      ].join('\n'),
      layout: 'full_matrix',
      kpiCards: [
        { label: 'Pertinence Finale', value: `${ocdeChartItems[0]?.value.toFixed(1) || '4.5'} / 5`, subtext: 'Adéquation stratégique', accent: 'emerald' },
        { label: 'Cohérence Finale', value: `${ocdeChartItems[1]?.value.toFixed(1) || '4.3'} / 5`, subtext: 'Synergie institutionnelle', accent: 'primary' },
        { label: 'Acteurs Impliqués (M4)', value: String(matricesData.M4.length), subtext: 'Concertation durable', accent: 'sky' }
      ],
      threeCards: [],
      table: buildCompactSlideMatrixTable('M4', matricesData.M4, currency, 5)
    });

    // Slide 5 : Critère 3 — Efficacité & Atteinte Finale des Résultats GAR (M1)
    rawSlides.push({
      matrixBadge: 'CRITÈRE 3 : EFFICACITÉ • BILAN FINAL DES RÉSULTATS GAR (M1)',
      connectedMatrixId: 'M1',
      title: 'EFFICACITÉ FINALE : BILAN D’ATTEINTE DES CIBLES DU CADRE LOGIQUE (M1)',
      subtitle: `Comparaison Référence (Baseline) vs Cible finale vs Réalisation effective (${progressPct}% global)`,
      contentText: [
        `Score final d’Efficacité : ${ocdeChartItems[2]?.displayValue}.`,
        `Bilan des ${matricesData.M1.length} lignes de résultats de la Matrice M1 : taux de réalisation consolidé de ${progressPct}%.`,
        `Production effective de ${completedTasks} activités terminées sur ${totalTasks} et avancement avancé sur les ${inProgressTasks} tâches en cours de clôture.`
      ].join('\n'),
      layout: 'full_matrix',
      kpiCards: [
        { label: 'Efficacité Finale', value: `${ocdeChartItems[2]?.value.toFixed(1) || '4.2'} / 5`, subtext: 'Résultats GAR audités', accent: 'emerald' },
        { label: 'Taux Réalisation', value: `${progressPct}%`, subtext: `${completedTasks}/${totalTasks} tâches validées`, accent: 'primary' },
        { label: 'Indicateurs M1', value: String(matricesData.M1.length), subtext: 'Mesurés à la clôture', accent: 'sky' }
      ],
      threeCards: [],
      table: buildCompactSlideMatrixTable('M1', matricesData.M1, currency, 5)
    });

    // Slide 6 : Bilan d'Exécution WBS/Kanban & Chemin Critique (M2) + Donut WBS
    rawSlides.push({
      matrixBadge: 'BILAN OPÉRATIONNEL FINAL • WBS, KANBAN & PERT (M2)',
      connectedMatrixId: 'M2',
      title: 'BILAN D’EXÉCUTION OPÉRATIONNELLE WBS / KANBAN & RESPECT DES DÉLAIS (M2)',
      subtitle: `Répartition finale des ${totalTasks} tâches WBS et performance sur le chemin critique (${maxDur}j)`,
      contentText: [
        `Bilan final sur les ${totalTasks} activités du WBS : ${completedTasks} Terminées (${donePct}%), ${inProgressTasks} En cours de clôture (${inProgPct}%), ${blockedTasks} en réserve.`,
        `Indice final de respect des délais (SPI) : ${spiVal} sur une durée critique de référence de ${maxDur} jours ouvrés.`
      ].join('\n'),
      layout: 'two_columns',
      chart: wbsStatusDonutChart,
      kpiCards: [
        { label: 'Tâches Achevées', value: `${completedTasks}/${totalTasks}`, subtext: `${donePct}% validées`, accent: 'emerald' },
        { label: 'Indice Délai (SPI)', value: spiVal, subtext: `Durée réf. ${maxDur}j`, accent: 'primary' },
        { label: 'Solde à Clôturer', value: String(inProgressTasks + todoTasks), subtext: 'En phase de réception', accent: 'sky' }
      ],
      threeCards: [],
      table: buildCompactSlideMatrixTable('M2', matricesData.M2, currency, 4)
    });

    // Slide 7 : Critère 4 — Efficience Budgétaire & Bilan EVM (M5) + Bar Chart EVM
    rawSlides.push({
      matrixBadge: 'CRITÈRE 4 : EFFICIENCE • AUDIT FINANCIER & BILAN EVM (M5)',
      connectedMatrixId: 'M5',
      title: 'EFFICIENCE FINALE : AUDIT D’EXÉCUTION BUDGÉTAIRE & VALEUR ACQUISE (M5)',
      subtitle: `Dotation (BAC) : ${budgetFormatted} • Décaissé (AC) : ${formatSlideAmount(actualFCFA, currency, lang)} (${disbursementPct}%) • CPI = ${cpiVal}`,
      contentText: [
        `Score final d’Efficience : ${ocdeChartItems[3]?.displayValue} avec un indice CPI de ${cpiVal}.`,
        `Sur un budget global de ${budgetFormatted}, ${formatSlideAmount(committedFCFA, currency, lang)} ont été engagés (${committedPct}%) et ${formatSlideAmount(actualFCFA, currency, lang)} décaissés (${disbursementPct}%).`,
        `La Valeur Acquise (EV) s’établit à ${formatSlideAmount(earnedFCFA, currency, lang)} (${earnedPct}%), confirmant l’absence de dépassement budgétaire.`
      ].join('\n'),
      layout: 'two_columns',
      chart: evmComparisonBarChart,
      kpiCards: [
        { label: 'Efficience Finale', value: `${ocdeChartItems[3]?.value.toFixed(1) || '4.3'} / 5`, subtext: `CPI = ${cpiVal}`, accent: 'emerald' },
        { label: 'Total Décaissé (AC)', value: formatSlideAmount(actualFCFA, currency, lang), subtext: `${disbursementPct}% du budget BAC`, accent: 'primary' },
        { label: 'Valeur Acquise (EV)', value: formatSlideAmount(earnedFCFA, currency, lang), subtext: `${earnedPct}% de valeur créée`, accent: 'sky' }
      ],
      threeCards: [],
      table: buildCompactSlideMatrixTable('M5', matricesData.M5, currency, 4)
    });

    // Slide 8 : Bilan de la Passation des Marchés & Clôture des Contrats (M8)
    rawSlides.push({
      matrixBadge: 'MATRICE M8 • AUDIT DES MARCHÉS PUBLICS & CONTRATS',
      connectedMatrixId: 'M8',
      title: 'BILAN DE LA PASSATION DES MARCHÉS & EXÉCUTION CONTRACTUELLE (M8)',
      subtitle: 'Audit de conformité fiduciaire des acquisitions, délais de passation et clôture des engagements',
      contentText: [
        `Audit complet des ${matricesData.M8.length} marchés inscrits dans le Plan de Passation des Marchés (Matrice M8).`,
        `Respect des procédures de mise en concurrence et des avis de non-objection (ANO) de ${donorOrg}.`,
        `Apurement progressif des engagements financiers en vue de la clôture comptable définitive.`
      ].join('\n'),
      layout: 'full_matrix',
      kpiCards: [
        { label: 'Marchés Audités (M8)', value: String(matricesData.M8.length), subtext: '100% conformes', accent: 'primary' },
        { label: 'Montant Engagé', value: formatSlideAmount(committedFCFA, currency, lang), subtext: `${committedPct}% du budget`, accent: 'sky' },
        { label: 'Conformité Fiduciaire', value: 'Sans Réserve', subtext: 'Normes PTF respectées', accent: 'emerald' }
      ],
      threeCards: [],
      table: buildCompactSlideMatrixTable('M8', matricesData.M8, currency, 5)
    });

    // Slide 9 : Réception Définitive des Livrables & Actifs du Programme (M9)
    rawSlides.push({
      matrixBadge: 'MATRICE M9 • RÉCEPTION DÉFINITIVE DES LIVRABLES & EXTRANTS',
      connectedMatrixId: 'M9',
      title: 'RÉCEPTION DÉFINITIVE DES LIVRABLES CONTRACTUELS & PATRIMOINE (M9)',
      subtitle: 'Vérification contradictoire des extrants, procès-verbaux de réception et transfert de propriété',
      contentText: [
        `Revue finale des ${matricesData.M9.length} livrables contractuels répertoriés dans la Matrice M9.`,
        `Conformité technique vérifiée et documentation probante archivée pour chaque livrable réceptionné.`,
        `Transfert officiel des ouvrages, études et outils réalisés au profit de ${execOrg} et des bénéficiaires.`
      ].join('\n'),
      layout: 'full_matrix',
      kpiCards: [
        { label: 'Livrables Audités (M9)', value: String(matricesData.M9.length), subtext: 'Catalogue contractuel', accent: 'primary' },
        { label: 'Taux Validation', value: `${progressPct}%`, subtext: `${completedTasks} PV signés`, accent: 'emerald' },
        { label: 'Transfert Actifs', value: 'Opéré', subtext: execOrg, accent: 'sky' }
      ],
      threeCards: [],
      table: buildCompactSlideMatrixTable('M9', matricesData.M9, currency, 5)
    });

    // Slide 10 : Critères 5 & 6 — Impact Global & Durabilité / Pérennité + Donut Budget
    rawSlides.push({
      matrixBadge: 'CRITÈRES 5 & 6 • IMPACT TANGIBLE & VIABILITÉ POST-PROJET',
      title: 'ANALYSE DE L’IMPACT GLOBAL & DE LA DURABILITÉ POST-PROGRAMME',
      subtitle: `Score Impact : ${ocdeChartItems[4]?.displayValue} • Score Durabilité : ${ocdeChartItems[5]?.displayValue}`,
      contentText: [
        `Impact (${ocdeChartItems[4]?.displayValue}) : Changements structurels positifs générés sur les ${(dossier.axes || []).length} axe(s) du portefeuille « ${dossier.name} ».`,
        `Durabilité (${ocdeChartItems[5]?.displayValue}) : Capacité institutionnelle, technique et financière de ${execOrg} à maintenir les acquis après la clôture.`,
        `Répartition équilibrée de l’investissement (${budgetFormatted}) garantissant un effet de levier durable.`
      ].join('\n'),
      layout: 'two_columns',
      chart: budgetSplitDonutChart,
      kpiCards: [
        { label: 'Score Impact', value: `${ocdeChartItems[4]?.value.toFixed(1) || '4.1'} / 5`, subtext: 'Effets durables mesurés', accent: 'emerald' },
        { label: 'Score Durabilité', value: `${ocdeChartItems[5]?.value.toFixed(1) || '4.0'} / 5`, subtext: 'Viabilité institutionnelle', accent: 'primary' },
        { label: 'Appropriation', value: 'Forte', subtext: `${raciCtx.allActors.length} acteurs formés`, accent: 'sky' }
      ],
      threeCards: [
        {
          title: '1. Impacts Directs & Indirects',
          badge: `${ocdeChartItems[4]?.value.toFixed(1) || '4.1'}/5`,
          bullets: [
            'Amélioration mesurable des indicateurs d’effet de la Matrice M1',
            'Renforcement durable des capacités opérationnelles des équipes',
            'Bénéfices tangibles pour les usagers et institutions cibles'
          ]
        },
        {
          title: '2. Viabilité Institutionnelle',
          badge: `${ocdeChartItems[5]?.value.toFixed(1) || '4.0'}/5`,
          bullets: [
            `Intégration des acquis dans le fonctionnement courant de ${execOrg}`,
            'Maîtrise interne des outils de planification et de suivi',
            'Maintien des mécanismes de coordination inter-acteurs (M4)'
          ]
        },
        {
          title: '3. Pérennité Financière',
          badge: 'Relais État',
          bullets: [
            `Mobilisation effective de la contrepartie nationale (${formatSlideAmount(nationalShareFCFA, currency, lang)})`,
            'Prise en charge des coûts récurrents d’exploitation post-projet',
            'Perspectives de mise à l’échelle (Scaling-up) sur une phase subséquente'
          ]
        }
      ]
    });

    // Slide 11 : Bilan de la Gouvernance RACI & Performance de l'Équipe (M3)
    rawSlides.push({
      matrixBadge: 'MATRICE M3 • BILAN DE LA GOUVERNANCE RACI & ÉQUIPE',
      connectedMatrixId: 'M3',
      title: 'BILAN DE LA GOUVERNANCE RACI & PERFORMANCE DE L’ÉQUIPE (M3)',
      subtitle: `Évaluation de la mobilisation des ${raciCtx.allActors.length} acteurs sous la direction de ${raciCtx.leadActorName}`,
      contentText: [
        `Bilan très positif de la gouvernance RACI (Matrice M3) ayant assuré la coordination des ${totalTasks} tâches du programme.`,
        `Engagement continu du Chef de Mission (${raciCtx.leadActorName}) et transfert de compétences réussi vers les cadres internes.`
      ].join('\n'),
      layout: 'full_matrix',
      kpiCards: [
        { label: 'Équipe Mobilisée (M3)', value: `${raciCtx.allActors.length} Acteurs`, subtext: '100% des lots couverts', accent: 'primary' },
        { label: 'Chef de Mission', value: raciCtx.leadActorName, subtext: raciCtx.leadActorRole, accent: 'sky' },
        { label: 'Transfert Savoir-Faire', value: 'Accompli', subtext: 'Capitalisation interne', accent: 'emerald' }
      ],
      threeCards: [],
      table: buildCompactSlideMatrixTable('M3', matricesData.M3, currency, 5)
    });

    // Slide 12 : Bilan de la Gestion des Risques & Résilience du Programme (M7)
    rawSlides.push({
      matrixBadge: 'MATRICE M7 • BILAN DE LA GESTION DES RISQUES & RÉSILIENCE',
      connectedMatrixId: 'M7',
      title: 'BILAN DE LA MAÎTRISE DES RISQUES (RAID) & RISQUES RÉSIDUELS POST-CLÔTURE (M7)',
      subtitle: 'Analyse rétrospective des aléas rencontrés, efficacité des mitigations et veille post-projet',
      contentText: [
        `Tout au long du cycle de vie, ${matricesData.M7.length} risques majeurs ont été suivis et maîtrisés via la Matrice M7.`,
        `Point de clôture : Apurement des ${blockedTasks} point(s) de blocage résiduel(s) avant fermeture administrative des comptes.`
      ].join('\n'),
      layout: 'full_matrix',
      kpiCards: [
        { label: 'Risques Traités (M7)', value: String(matricesData.M7.length), subtext: 'Résilience démontrée', accent: 'primary' },
        { label: 'Réserves Résiduelles', value: String(blockedTasks), subtext: 'Levée avant quitus', accent: blockedTasks > 0 ? 'amber' : 'emerald' },
        { label: 'Veille Post-Clôture', value: 'Activée', subtext: 'Passage de témoin', accent: 'sky' }
      ],
      threeCards: [],
      table: buildCompactSlideMatrixTable('M7', matricesData.M7, currency, 5)
    });

    // Slide 13 : Enseignements Tirés (Lessons Learned) & Bonnes Pratiques Capitalisées
    rawSlides.push({
      matrixBadge: 'CAPITALISATION INSTITUTIONNELLE • LEÇONS APPRISES & BONNES PRATIQUES',
      title: 'ENSEIGNEMENTS TIRÉS (LESSONS LEARNED) & BONNES PRATIQUES À RÉPLIQUER',
      subtitle: 'Facteurs clés de succès identifiés et capitalisation méthodologique pour les futurs programmes',
      contentText: [
        `Leçon Apprise N°1 (Ingénierie PERT/CPM) : L’identification précoce des ${criticalNodes.length} tâches critiques (${criticalSeq}) a permis de protéger l’horizon de ${maxDur} jours ouvrés.`,
        `Leçon Apprise N°2 (Gouvernance RACI M3) : La désignation d’un Approbateur unique (A) par livrable a considérablement réduit les délais de validation.`,
        `Leçon Apprise N°3 (Couplage Livrables M9 / Budget M5) : Indexer chaque décaissement sur un livrable validé garantit un CPI optimal (${cpiVal}).`
      ].join('\n'),
      layout: 'three_cards',
      kpiCards: [
        { label: 'Piliers Capitalisés', value: '3 Modèles', subtext: 'PERT • RACI • GAR/EVM', accent: 'emerald' },
        { label: 'Efficience Prouvée', value: `CPI ${cpiVal}`, subtext: 'Référence sectorielle', accent: 'primary' },
        { label: 'Réplicabilité', value: '100%', subtext: 'Standardisable', accent: 'sky' }
      ],
      threeCards: [
        {
          title: '1. Pilotage par le Chemin Critique',
          badge: 'Leçon N°1',
          bullets: [
            'Priorisation objective des tâches à marge nulle',
            'Alerte précoce sur les écarts de début et de fin',
            'Protection efficace de la date d’achèvement globale'
          ]
        },
        {
          title: '2. Redevabilité RACI & Livrables',
          badge: 'Leçon N°2',
          bullets: [
            'Clarté absolue des rôles R, A, C et I sur chaque lot',
            'Conditionnalité stricte : Livrable validé → Paiement autorisé',
            'Qualité documentaire conforme aux standards internationaux'
          ]
        },
        {
          title: '3. Intégration Physico-Financière',
          badge: 'Leçon N°3',
          bullets: [
            'Synchronisation permanente entre WBS et budget EVM',
            'Traçabilité complète du budget voté au décaissé réel',
            'Capitalisation directe pour la conception de la Phase II'
          ]
        }
      ]
    });

    // Slide 14 : Matrice des Recommandations Stratégiques & Plan Post-Clôture (M10)
    rawSlides.push({
      matrixBadge: 'MATRICE M10 • RECOMMANDATIONS STRATÉGIQUES & PLAN POST-CLÔTURE',
      connectedMatrixId: 'M10',
      title: 'MATRICE DES RECOMMANDATIONS FINALES & PLAN D’ACTION CAP (M10)',
      subtitle: 'Prescriptions pour la clôture administrative/financière et la pérennisation des acquis du programme',
      contentText: [
        `${matricesData.M10.length} recommandations stratégiques et opérationnelles inscrites dans la Matrice M10.`,
        `Prescription N°1 : Clôturer les ${inProgressTasks} tâche(s) finale(s) et lever les ${blockedTasks} réserve(s) résiduelle(s).`,
        `Prescription N°2 : Finaliser l’apurement comptable du solde budgétaire et archiver l’intégralité des dossiers M8 et M9.`
      ].join('\n'),
      layout: 'full_matrix',
      kpiCards: [
        { label: 'Recommandations (M10)', value: String(matricesData.M10.length), subtext: 'Endossées par le Management', accent: 'primary' },
        { label: 'Clôture Comptable', value: 'Sous 30j', subtext: 'Apurement final M5/M8', accent: 'amber' },
        { label: 'Suivi Post-Projet', value: 'Assuré', subtext: 'Responsables désignés', accent: 'emerald' }
      ],
      threeCards: [],
      table: buildCompactSlideMatrixTable('M10', matricesData.M10, currency, 5)
    });

    // Slide 15 : Conclusion Générale, Réponse Managériale, Quitus Définitif & Clôture
    rawSlides.push({
      isFinalSlide: true,
      matrixBadge: 'DÉCISION SOLENNELLE • QUITUS DÉFINITIF & CLÔTURE OFFICIELLE',
      title: 'CONCLUSION GÉNÉRALE, RÉPONSE MANAGÉRIALE, QUITUS DÉFINITIF & CLÔTURE',
      subtitle: 'Approbation du Rapport d’Évaluation Finale, délivrance du quitus de bonne exécution et clôture officielle',
      contentText: [
        `Conclusion Générale : Avec une note finale OCDE/CAD de ${avgOcdeScore} / 5, un taux de réalisation physique de ${progressPct}% et un indice CPI de ${cpiVal}, la performance globale du programme est jugée pleinement satisfaisante.`,
        `Réponse Managériale : ${execOrg} endosse les ${matricesData.M10.length} recommandations de la Matrice M10 pour la pérennisation des acquis.`,
        `Décision Solennelle du Comité : Approbation du Rapport d’Évaluation Finale (Réf. ${refCode}) et délivrance du Quitus Définitif de clôture.`,
        `Remerciements officiels aux équipes opérationnelles, au Comité de Pilotage et aux Partenaires Techniques et Financiers (${donorOrg}).`
      ].join('\n'),
      layout: 'three_cards',
      kpiCards: [
        { label: 'Note Finale Certifiée', value: `${avgOcdeScore} / 5`, subtext: 'Standards OCDE/CAD & UNEG', accent: 'emerald' },
        { label: 'Plan Post-Clôture', value: `${matricesData.M10.length} Actions`, subtext: 'Adopté par l’Institution', accent: 'primary' },
        { label: 'Décision Finale', value: 'Quitus Définitif', subtext: 'Clôture prononcée', accent: 'sky' }
      ],
      threeCards: [
        {
          title: '1. Verdict Évaluatif Final',
          badge: `${avgOcdeScore} / 5`,
          bullets: [
            'Pertinence, cohérence et efficacité confirmées sur le terrain',
            `Discipline budgétaire exemplaire (CPI = ${cpiVal})`,
            'Impacts positifs durables auprès des bénéficiaires'
          ]
        },
        {
          title: '2. Réponse Managériale & Relais',
          badge: 'Pérennisation',
          bullets: [
            `Mise en œuvre des ${matricesData.M10.length} recommandations de la Matrice M10`,
            'Prise en relais des acquis par les directions pérennes',
            'Archivage probant des livrables M9 et dossiers fiduciaires'
          ]
        },
        {
          title: '3. Quitus & Clôture Officielle',
          badge: 'Quitus Accordé',
          bullets: [
            'Approbation définitive du Rapport d’Évaluation Finale',
            'Octroi du quitus technique, administratif et financier',
            'Signature solennelle du procès-verbal de clôture'
          ]
        }
      ],
      includeSignatures: !hideSignatures,
      orgStampDataUrl: hideSignatures ? undefined : rawFields.orgStampDataUrl,
      partnerStampDataUrl: hideSignatures ? undefined : rawFields.partnerStampDataUrl
    });
  }

  // Apply per-slide user overrides (title, subtitle, content, layout, imageDataUrl, imageCaption, excluded)
  const mergedSlides: StructuredSlidePage[] = rawSlides.map((seed, idx) => {
    const slideNum = idx + 1;
    const ov = slideOverrides[slideNum];
    const finalTitle = ov?.title !== undefined ? ov.title : seed.title;
    const finalSubtitle = ov?.subtitle !== undefined ? ov.subtitle : seed.subtitle;
    const finalContent = ov?.content !== undefined ? ov.content : seed.contentText;
    const finalLayout: SlideLayoutMode = ov?.layout || seed.layout;
    const finalImage = ov?.imageDataUrl !== undefined ? ov.imageDataUrl : seed.imageDataUrl;
    const finalCaption = ov?.imageCaption !== undefined ? ov.imageCaption : seed.imageCaption;
    const isExcluded = Boolean(ov?.excluded);

    return {
      ...seed,
      slideNumber: slideNum,
      displaySlideNumber: slideNum,
      totalDisplaySlides: rawSlides.length,
      excluded: isExcluded,
      title: finalTitle,
      subtitle: finalSubtitle,
      contentText: finalContent,
      bullets: extractConciseBullets(finalContent, 6),
      layout: finalLayout,
      imageDataUrl: finalImage,
      imageCaption: finalCaption
    };
  });

  // Compute displaySlideNumber and totalDisplaySlides dynamically for active (non-excluded) slides
  const activeCount = mergedSlides.filter(s => !s.excluded).length;
  let currentActiveIdx = 0;

  return mergedSlides.map(slide => {
    if (!slide.excluded) {
      currentActiveIdx++;
    }
    return {
      ...slide,
      displaySlideNumber: slide.excluded ? 0 : currentActiveIdx,
      totalDisplaySlides: Math.max(1, activeCount)
    };
  });
}
