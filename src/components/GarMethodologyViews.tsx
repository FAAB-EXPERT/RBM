import React, { useState, useMemo } from 'react';
import {
  Network,
  Lightbulb,
  BookOpen,
  LayoutDashboard,
  Users,
  Target,
  Activity,
  ShieldAlert,
  CheckCircle2,
  Plus,
  Trash2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  ListFilter,
  FileDown,
  X,
  Layers
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import {
  Dossier,
  CurrencyCode,
  LanguageCode,
  UserProfile,
  GarDossierData,
  GarResourceItem,
  GarStakeholderItem,
  GarCmrRow,
  GarRiskRow
} from '../types';
import { formatCurrency, convertFromFCFA, convertToFCFA } from '../i18n';

export type GarTabId =
  | 'arbre'
  | 'solutions'
  | 'registre_parties'
  | 'terrain'
  | 'parties'
  | 'rendement'
  | 'cmr'
  | 'risques_hypo'
  | 'extrants'
  | 'clar';

export const GAR_TAB_IDS: GarTabId[] = [
  'arbre',
  'solutions',
  'registre_parties',
  'terrain',
  'parties',
  'rendement',
  'cmr',
  'risques_hypo',
  'extrants',
  'clar'
];

export function isGarTab(tab: string): tab is GarTabId {
  return GAR_TAB_IDS.includes(tab as GarTabId);
}

const ensureArray = (val: any): string[] => {
  if (!val) return [];
  if (Array.isArray(val)) return val.map(v => String(v ?? ''));
  if (typeof val === 'string') {
    const split = val
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean);
    return split.length > 0 ? split : [''];
  }
  return [String(val)];
};

const getSafe2D = (arr: any, k: number): GarResourceItem[] => {
  if (!Array.isArray(arr)) return [];
  if (arr.length > 0 && !Array.isArray(arr[0])) return k === 0 ? arr : [];
  return arr[k] || [];
};

export const parseGarAmountFCFA = (val: any): number => {
  if (!val) return 0;
  const strVal = String(val);
  const cleaned = strVal
    .replace(/\s+/g, '')
    .replace(/FCFA|CFA|EUR|USD|€|\$|F/gi, '')
    .replace(',', '.');
  const match = cleaned.match(/-?\d+(?:\.\d+)?/);
  if (!match) return 0;
  const num = parseFloat(match[0]);
  return isNaN(num) ? 0 : num;
};

export const calculateGarActivityTotalFCFA = (proj: any, k: number): { sum: number; hasAmounts: boolean } => {
  let sum = 0;
  let hasAmounts = false;
  const process = (items: any) => {
    if (!Array.isArray(items)) return;
    items.forEach((item: any) => {
      if (typeof item === 'object' && item?.amount) {
        const val = parseGarAmountFCFA(item.amount);
        if (val > 0) {
          sum += val;
          hasAmounts = true;
        }
      }
    });
  };
  process(getSafe2D(proj?.intrants_rh, k));
  process(getSafe2D(proj?.intrants_mat, k));
  return { sum, hasAmounts };
};

export const getGarProjectEffectiveCostFCFA = (proj: any): number => {
  if (!proj) return 0;
  const actCount = Math.max(ensureArray(proj.activites).length, 1);
  let total = 0;
  for (let k = 0; k < actCount; k++) {
    const { sum } = calculateGarActivityTotalFCFA(proj, k);
    total += sum;
  }
  return total;
};

/**
 * Construit ou synchronise les données GAR (`GarDossierData`) à partir de la structure
 * `axes` / `projects` / `tasks` / `categorizedActors` d'un `Dossier` faab gar.
 */
export function ensureDossierGarData(dossier: Dossier): GarDossierData {
  const existing = dossier.garData;
  const axes = dossier.axes || [];

  const branches = axes.map((axe, aIdx) => {
    const existingBranch = existing?.problems?.branches?.[aIdx];
    const details = (axe.projects || []).map((proj, pIdx) => {
      const existingDet = existingBranch?.details?.[pIdx];
      const taskCount = Math.max((proj.tasks || []).length, 1);
      const defaultCauses =
        (proj.tasks || []).length > 0
          ? (proj.tasks || []).map(
              tk => `Insuffisance opérationnelle liée à : ${tk.name}`
            )
          : ['Cause racine à préciser'];
      const defaultBesoins =
        (proj.tasks || []).length > 0
          ? (proj.tasks || []).map(
              tk => `Besoin de réalisation : ${tk.livrable || tk.name}`
            )
          : ['Besoin opérationnel à préciser'];

      return {
        contrainte:
          existingDet?.contrainte ??
          `Contrainte opérationnelle sur « ${proj.name} »`,
        cause:
          existingDet?.cause && existingDet.cause.length > 0
            ? existingDet.cause
            : defaultCauses.slice(0, taskCount),
        besoin:
          existingDet?.besoin && existingDet.besoin.length > 0
            ? existingDet.besoin
            : defaultBesoins.slice(0, taskCount)
      };
    });

    return {
      axeName: existingBranch?.axeName || axe.name,
      central:
        existingBranch?.central ??
        `Déficit de performance et de structuration sur ${axe.name}`,
      details
    };
  });

  const rendementAxes = axes.map((axe, aIdx) => {
    const existingAxe = existing?.rendement?.axes?.[aIdx];
    const projets = (axe.projects || []).map((proj, pIdx) => {
      const existingProj = existingAxe?.projets?.[pIdx];
      const tasks = proj.tasks || [];
      const activites =
        existingProj?.activites && existingProj.activites.length > 0
          ? existingProj.activites
          : tasks.length > 0
          ? tasks.map(t => t.name)
          : ['Activité principale à définir'];

      const intrants_rh: GarResourceItem[][] = activites.map((_, k) => {
        const exRh = getSafe2D(existingProj?.intrants_rh, k);
        if (exRh.length > 0) return exRh;
        const tk = tasks[k];
        if (!tk) return [{ label: 'Équipe Projet / Expert', amount: '0' }];
        const rhShare = Math.round((Number(tk.budget) || 0) * 0.4);
        return [
          {
            label: tk.assignee || 'Équipe Projet UGP',
            amount: String(rhShare)
          }
        ];
      });

      const intrants_mat: GarResourceItem[][] = activites.map((_, k) => {
        const exMat = getSafe2D(existingProj?.intrants_mat, k);
        if (exMat.length > 0) return exMat;
        const tk = tasks[k];
        if (!tk) return [{ label: 'Logistique & Équipements', amount: '0' }];
        const matShare = Math.round((Number(tk.budget) || 0) * 0.6);
        return [
          {
            label: tk.livrable || 'Moyens matériels & techniques',
            amount: String(matShare)
          }
        ];
      });

      return {
        extrant: existingProj?.extrant || proj.name,
        extrantCmr: existingProj?.extrantCmr || '',
        activites,
        intrants_rh,
        intrants_mat,
        couts: existingProj?.couts || activites.map(() => ''),
        responsable:
          existingProj?.responsable ||
          tasks[0]?.assignee ||
          'Coordonnateur Projet',
        periode: existingProj?.periode || dossier.horizonPlan || '2026-2030'
      };
    });

    return {
      nom: existingAxe?.nom || axe.name,
      effet:
        existingAxe?.effet ??
        `Amélioration durable de la performance : ${axe.name}`,
      budget: existingAxe?.budget || '0 FCFA',
      projets
    };
  });

  // Seed stakeholders from dossier.categorizedActors if empty
  const buildDefaultStakeholders = () => {
    const sh = {
      beneficiaires: [...(existing?.stakeholders?.beneficiaires || [])],
      instCentralises: [...(existing?.stakeholders?.instCentralises || [])],
      instDecentralises: [...(existing?.stakeholders?.instDecentralises || [])],
      operateursTechniques: [
        ...(existing?.stakeholders?.operateursTechniques || [])
      ],
      ptf: [...(existing?.stakeholders?.ptf || [])]
    };

    const hasAny =
      sh.beneficiaires.length > 0 ||
      sh.instCentralises.length > 0 ||
      sh.instDecentralises.length > 0 ||
      sh.operateursTechniques.length > 0 ||
      sh.ptf.length > 0;

    if (!hasAny) {
      // Seed across axes and projects so every project has initial stakeholders
      axes.forEach((ax, aIdx) => {
        (ax.projects || []).forEach((pr, pIdx) => {
          const firstTask = pr.tasks?.[0];
          sh.beneficiaires.push({
            nom:
              firstTask?.consulte ||
              'Collectif des Bénéficiaires & Usagers Finaux',
            intervention: pr.name,
            competence: 'Usage direct des livrables et retour terrain',
            attentes: 'Accessibilité, qualité et continuité du service',
            contraintes: 'Adaptation aux nouveaux outils et procédures',
            pointFort: 'Forte mobilisation communautaire et institutionnelle',
            pointFaible: 'Besoin d’accompagnement au changement',
            problemes: 'Accès inégal aux infrastructures existantes',
            axe: aIdx + 1,
            projetIndex: pIdx
          });
          sh.instCentralises.push({
            nom:
              firstTask?.assignee?.split(',')[0]?.trim() ||
              'Unité de Gestion du Programme (UGP / PMO)',
            intervention: 'Pilotage opérationnel, coordination & S&E',
            competence: 'Ingénierie de projet, GAR, ordonnancement PERT/CPM',
            attentes: 'Respect des délais, du budget et de la qualité',
            contraintes: 'Multiplicité des chantiers simultanés',
            pointFort: 'Maîtrise méthodologique PMP / ISO 21500 / GAR',
            pointFaible: 'Charge opérationnelle élevée sur le chemin critique',
            problemes: 'Coordination inter-services',
            axe: aIdx + 1,
            projetIndex: pIdx
          });
          sh.instDecentralises.push({
            nom:
              firstTask?.autorite ||
              'Ministère de Tutelle & Autorité de Régulation (COPIL)',
            intervention: 'Supervision stratégique, arbitrages & conformité',
            competence: 'Régulation sectorielle, visas et autorisations',
            attentes: 'Conformité réglementaire et atteinte des cibles publiques',
            contraintes: 'Calendrier des sessions d’approbation',
            pointFort: 'Légitimité institutionnelle et pouvoir d’arbitrage',
            pointFaible: 'Délais administratifs de validation',
            problemes: 'Harmonisation des procédures interministérielles',
            axe: aIdx + 1,
            projetIndex: pIdx
          });
          sh.operateursTechniques.push({
            nom: 'Consortium Technique & Cabinet d’Ingénierie (Prestataire)',
            intervention: `Exécution technique : ${pr.name}`,
            competence: 'Déploiement technologique, génie civil et formation',
            attentes: 'Cahier des charges clair et décaissements réguliers',
            contraintes: 'Délais d’approvisionnement logistique',
            pointFort: 'Expertise spécialisée et équipes dédiées',
            pointFaible: 'Dépendance aux validations préalables',
            problemes: 'Disponibilité des intrants critiques',
            axe: aIdx + 1,
            projetIndex: pIdx
          });
          sh.ptf.push({
            nom:
              firstTask?.informe ||
              'Banque Mondiale / BAD / PNUD / Union Européenne (PTF)',
            intervention: 'Financement, Avis de Non-Objection (ANO) & Audit',
            competence: 'Appui financier, fiduciaire et assurance qualité',
            attentes: 'Exécution transparente du PTBA et atteinte des IOV',
            contraintes: 'Strict respect des directives de passation',
            pointFort: 'Capacité financière et appui technique international',
            pointFaible: 'Conditionnalité de décaissement par tranche',
            problemes: 'Rythme d’absorption des crédits',
            axe: aIdx + 1,
            projetIndex: pIdx
          });
        });
      });
    }
    return sh;
  };

  // Seed CMR rows
  const defaultCmr: GarCmrRow[] =
    existing?.cmr && existing.cmr.length > 0
      ? [...existing.cmr]
      : [
          {
            niveau: 'IMPACT GLOBAL',
            resultat: `Impact global : ${dossier.description}`,
            indicateur: 'Taux global de transformation et de satisfaction (%)',
            ref: '25%',
            cible: '95%',
            real: '62%',
            freq: 'Annuelle',
            source: 'Rapport d’Évaluation Indépendante OCDE/CAD',
            responsable: 'Coordonnateur Général PMO / S&E',
            axe: 0
          },
          ...rendementAxes.flatMap((ax, aIdx) => [
            {
              niveau: 'EFFET',
              resultat: ax.effet,
              indicateur: `Indice de performance opérationnelle — ${ax.nom}`,
              ref: '30%',
              cible: '90%',
              real: '65%',
              freq: 'Semestrielle',
              source: 'Rapport de Revue à Mi-Parcours & CAP',
              responsable: 'Chef de Composante / Responsable S&E',
              axe: aIdx + 1
            },
            ...(ax.projets || []).map((pr, pIdx) => ({
              niveau: `EXTRANT ${pIdx + 1}`,
              resultat: pr.extrant,
              indicateur: `Taux de livraison conforme des livrables (${pr.extrant})`,
              ref: '0%',
              cible: '100%',
              real: '70%',
              freq: 'Trimestrielle',
              source: 'Procès-verbaux de réception & Rapports PTBA/PTT',
              responsable: pr.responsable || 'Chef de Projet',
              axe: aIdx + 1
            }))
          ])
        ];

  // Seed Risks rows
  const defaultRisks: GarRiskRow[] =
    existing?.risks && existing.risks.length > 0
      ? [...existing.risks]
      : rendementAxes.flatMap((ax, aIdx) => [
          {
            id: `risk-effet-${aIdx + 1}`,
            niveau: 'EFFET',
            logique: ax.effet,
            hypothese:
              'Adhésion continue des parties prenantes et stabilité du cadre institutionnel',
            contrainte: branches[aIdx]?.central || '',
            cause: 'Retard dans les arbitrages stratégiques',
            level: 'MOYEN',
            responsable:
              'Ministère de Tutelle & Autorité de Régulation (COPIL)',
            mitigation:
              'Sessions mensuelles d’arbitrage COPIL et suivi préventif des jalons',
            axe: aIdx + 1,
            linkedAxeIndex: null,
            linkedBranchIndex: null
          },
          ...(ax.projets || []).map((pr, pIdx) => ({
            id: `risk-ext-${aIdx + 1}-${pIdx + 1}`,
            niveau: `EXTRANT ${pIdx + 1}`,
            logique: pr.extrant,
            hypothese:
              'Disponibilité à temps des ressources financières et validation rapide des livrables',
            contrainte: branches[aIdx]?.details?.[pIdx]?.contrainte || '',
            cause: (branches[aIdx]?.details?.[pIdx]?.cause || []).join('\n'),
            level: 'ÉLEVÉ',
            responsable:
              pr.responsable || 'Unité de Gestion du Programme (UGP / PMO)',
            mitigation:
              'Priorisation des tâches situées sur le chemin critique PERT/CPM et réserve de contingence',
            axe: aIdx + 1,
            linkedAxeIndex: null,
            linkedBranchIndex: null
          }))
        ]);

  return {
    cadrageStrategique: {
      vision:
        existing?.cadrageStrategique?.vision ||
        `Excellence opérationnelle et impact durable à l’horizon ${dossier.horizonPlan}`,
      mission:
        existing?.cadrageStrategique?.mission ||
        dossier.description ||
        'Assurer la planification, l’exécution et le suivi-évaluation axés sur les résultats.',
      objectifGeneral:
        existing?.cadrageStrategique?.objectifGeneral ||
        `Atteindre 100% des objectifs stratégiques du portefeuille « ${dossier.name} » sur la période ${dossier.horizonPlan}.`
    },
    stakeholders: buildDefaultStakeholders(),
    problems: {
      consequenceGlobale:
        existing?.problems?.consequenceGlobale ||
        `Faible performance globale et retard dans l’atteinte des objectifs de développement (${dossier.name})`,
      branches
    },
    rendement: {
      impact:
        existing?.rendement?.impact ||
        `Transformation positive durable et atteinte des résultats stratégiques de « ${dossier.name} » (${dossier.horizonPlan})`,
      axes: rendementAxes
    },
    cmr: defaultCmr,
    risks: defaultRisks,
    fiche: {
      lieu: existing?.fiche?.lieu || 'Abidjan & Zones d’Intervention',
      duree: existing?.fiche?.duree || `${dossier.horizonPlan} (${dossier.horizonYears || 5} ans)`,
      moa: existing?.fiche?.moa || dossier.institution,
      moe: existing?.fiche?.moe || 'Unité de Gestion du Programme (UGP / PMO)',
      partenaires:
        existing?.fiche?.partenaires ||
        'Banque Mondiale, BAD, PNUD, Union Européenne',
      strategie:
        existing?.fiche?.strategie ||
        'Gestion Axée sur les Résultats (GAR) couplée à l’ordonnancement du chemin critique PERT/CPM'
    }
  };
}

/**
 * Génère un rapport PDF officiel GAR 100% fond blanc aux couleurs institutionnelles (#c2410c)
 */
export function generateOfficialGarWhitePdf(
  dossier: Dossier,
  garData: GarDossierData,
  currency: CurrencyCode,
  language: LanguageCode,
  userProfile: UserProfile
): void {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const isEn = language === 'EN';
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  const paintPureWhiteBackground = () => {
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, pageWidth, pageHeight, 'F');
  };

  paintPureWhiteBackground();

  const checkPageBreak = (neededHeight: number) => {
    if (y + neededHeight > pageHeight - 16) {
      doc.addPage();
      paintPureWhiteBackground();
      y = margin;
    }
  };

  const drawSectionHeader = (title: string, r = 12, g = 74, b = 110) => {
    checkPageBreak(14);
    doc.setFillColor(r, g, b);
    doc.roundedRect(margin, y, contentWidth, 8, 1.5, 1.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(255, 255, 255);
    doc.text(title.toUpperCase(), margin + 3, y + 5.5);
    y += 11;
    doc.setTextColor(15, 23, 42);
  };

  const drawKeyValueRow = (label: string, value: string, highlight = false) => {
    const safeVal = value && value.trim() !== '' ? value.trim() : '-';
    const lines = doc.splitTextToSize(safeVal, contentWidth - 52);
    const rowHeight = Math.max(lines.length * 4.5 + 3, 7.5);
    checkPageBreak(rowHeight + 1);

    doc.setFillColor(241, 245, 249);
    doc.setDrawColor(203, 213, 225);
    doc.rect(margin, y, 48, rowHeight, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(194, 65, 12);
    const labelLines = doc.splitTextToSize(label, 44);
    doc.text(labelLines, margin + 2, y + 4.5);

    if (highlight) {
      doc.setFillColor(255, 247, 237);
    } else {
      doc.setFillColor(255, 255, 255);
    }
    doc.rect(margin + 48, y, contentWidth - 48, rowHeight, 'FD');
    doc.setFont('helvetica', highlight ? 'bold' : 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(highlight ? 12 : 15, highlight ? 74 : 23, highlight ? 110 : 42);
    doc.text(lines, margin + 50, y + 4.5);

    y += rowHeight;
  };

  // Header Banner (#c2410c)
  doc.setFillColor(194, 65, 12);
  doc.roundedRect(margin, y, contentWidth, 22, 2, 2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(255, 255, 255);
  doc.text(
    isEn
      ? 'OFFICIAL REPORT - RESULTS-BASED MANAGEMENT (faab gar)'
      : 'RAPPORT OFFICIEL - GESTION AXÉE SUR LES RÉSULTATS (faab gar)',
    margin + 4,
    y + 8
  );
  doc.setFontSize(9.5);
  doc.setTextColor(253, 186, 116);
  doc.text(
    `${isEn ? 'Portfolio / Programme' : 'Portefeuille / Programme'} : ${dossier.name || '-'}`,
    margin + 4,
    y + 14.5
  );
  doc.setFontSize(8);
  doc.setTextColor(224, 242, 254);
  doc.text(
    `${isEn ? 'Institution' : 'Institution'} : ${userProfile.institution || dossier.institution || '-'}   |   ${
      isEn ? 'Currency' : 'Devise'
    } : ${currency}   |   Date : ${new Date().toLocaleDateString(isEn ? 'en-US' : 'fr-FR')}`,
    margin + 4,
    y + 19.5
  );
  y += 26;

  // Section 1
  drawSectionHeader(
    isEn
      ? '1. Portfolio Identification & Lead Officer'
      : '1. Identification du Portefeuille & Responsable'
  );
  drawKeyValueRow(isEn ? 'Programme Name' : 'Intitulé du Programme', dossier.name);
  drawKeyValueRow(isEn ? 'Description' : 'Description', dossier.description);
  drawKeyValueRow(isEn ? 'Lead Officer' : 'Responsable / Concepteur', `${userProfile.fullName} (${userProfile.role})`);
  drawKeyValueRow(isEn ? 'Horizon / Duration' : 'Horizon / Durée', garData.fiche?.duree || dossier.horizonPlan);
  drawKeyValueRow(
    isEn ? 'General Objective' : 'Objectif Général',
    garData.cadrageStrategique?.objectifGeneral || '-'
  );

  const axes = garData.rendement?.axes || [];
  let grandTotalFCFA = 0;
  axes.forEach(axe => {
    (axe.projets || []).forEach(proj => {
      grandTotalFCFA += getGarProjectEffectiveCostFCFA(proj);
    });
  });
  drawKeyValueRow(
    isEn ? 'Consolidated GAR Budget' : 'Budget Consolidé GAR',
    formatCurrency(grandTotalFCFA, currency, language),
    true
  );
  y += 4;

  // Section 2: Problem Tree
  drawSectionHeader(
    isEn ? '2. Causal Diagnosis (Problem Tree)' : '2. Diagnostic Causal (Arbre à Problèmes)'
  );
  drawKeyValueRow(
    isEn ? 'Global Negative Consequence' : 'Conséquence Globale',
    garData.problems?.consequenceGlobale || '-'
  );
  (garData.problems?.branches || []).forEach((branch, i) => {
    drawKeyValueRow(
      `${branch.axeName || `Axe ${i + 1}`} — ${isEn ? 'Central Problem' : 'Problème Central'}`,
      branch.central || '-'
    );
    (branch.details || []).forEach((det, j) => {
      drawKeyValueRow(
        `  ${isEn ? 'Sub-Problem' : 'Sous-Problème'} ${j + 1}`,
        `${det.contrainte || '-'}\n• Causes : ${ensureArray(det.cause).join(' ; ')}\n• ${
          isEn ? 'Needs' : 'Besoins'
        } : ${ensureArray(det.besoin).join(' ; ')}`
      );
    });
  });
  y += 4;

  // Section 3: Performance Framework
  drawSectionHeader(
    isEn
      ? '3. Performance Framework, Outputs, Activities & Budgets'
      : '3. Cadre de Rendement, Extrants, Activités & Budgets',
    234, 88, 12
  );
  drawKeyValueRow(
    isEn ? 'Global Positive Impact' : 'Impact Positif Global',
    garData.rendement?.impact || '-',
    true
  );
  axes.forEach((axe, i) => {
    drawKeyValueRow(
      `${axe.nom} — ${isEn ? 'OUTCOME (EFFET)' : 'EFFET ATTENDU'}`,
      axe.effet || '-',
      true
    );
    (axe.projets || []).forEach((proj, pIdx) => {
      const pCost = getGarProjectEffectiveCostFCFA(proj);
      drawKeyValueRow(
        `  ${isEn ? 'Output / Project' : 'Extrant / Projet'} ${pIdx + 1}`,
        `${proj.extrant || '-'} — Budget : ${formatCurrency(pCost, currency, language)}`
      );
    });
  });
  y += 4;

  // Section 4: CMR
  drawSectionHeader(
    isEn
      ? '4. Performance Measurement Framework (PMF / CMR)'
      : '4. Cadre de Mesure du Rendement (CMR / KPI)'
  );
  (garData.cmr || []).forEach(row => {
    drawKeyValueRow(
      `${row.niveau} ${row.axe ? `(Axe ${row.axe})` : ''}`,
      `KPI : ${row.indicateur || '-'} | Réf: ${row.ref || '0'} | Cible: ${row.cible || '0'} | Réal: ${
        row.real || '0'
      } | Fréq: ${row.freq || '-'} | Source: ${row.source || '-'} | Resp: ${row.responsable || '-'}`
    );
  });

  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setDrawColor(203, 213, 225);
    doc.line(margin, pageHeight - 10, pageWidth - margin, pageHeight - 10);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `faab gar — ${dossier.name} (${currency}) — ${userProfile.fullName}`,
      margin,
      pageHeight - 6
    );
    doc.text(`Page ${p} / ${totalPages}`, pageWidth - margin - 18, pageHeight - 6);
  }

  const safeName = (dossier.name || 'FAAB_GAR_Rapport')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_');
  doc.save(`${safeName}_GAR_${currency}.pdf`);
}

// ============================================================================
// EDITABLE CELL & RESOURCE LIST COMPONENTS (Styled in #c2410c / #ea580c / #fdba74)
// ============================================================================

interface EditableCellProps {
  isEditable?: boolean;
  value: any;
  onChange: (val: any) => void;
  type?: 'text' | 'textarea' | 'list' | 'numberList';
  placeholder?: string;
  fixedPrefix?: string;
}

const EditableCell: React.FC<EditableCellProps> = ({
  isEditable = true,
  value,
  onChange,
  type = 'text',
  placeholder = '...',
  fixedPrefix = ''
}) => {
  let displayValue = value ?? '';
  if (
    fixedPrefix &&
    typeof displayValue === 'string' &&
    !displayValue.startsWith(fixedPrefix)
  ) {
    displayValue = fixedPrefix + displayValue;
  }

  if (!isEditable) {
    if (type === 'list' || type === 'numberList') {
      const arr = ensureArray(displayValue).filter(Boolean);
      if (arr.length === 0) return <span className="text-slate-400">-</span>;
      const ListTag = type === 'numberList' ? 'ol' : 'ul';
      return (
        <ListTag
          className={`${
            type === 'numberList' ? 'list-decimal' : 'list-disc'
          } pl-3.5 space-y-0.5 text-[10px] sm:text-[11px] text-slate-800 dark:text-slate-200`}
        >
          {arr.map((v, i) => (
            <li key={i}>{v}</li>
          ))}
        </ListTag>
      );
    }
    return (
      <span className="whitespace-pre-line text-[10px] sm:text-[11px] text-slate-800 dark:text-slate-200">
        {displayValue || '-'}
      </span>
    );
  }

  if (type === 'textarea' || type === 'list' || type === 'numberList') {
    const textVal = Array.isArray(displayValue)
      ? displayValue.join('\n')
      : displayValue;
    return (
      <textarea
        className="w-full bg-orange-50/70 dark:bg-slate-800/90 border border-orange-200 dark:border-slate-700 rounded-lg p-1.5 text-slate-900 dark:text-white text-[10px] sm:text-[11px] font-medium focus:ring-1 focus:ring-[#ea580c] focus:border-[#ea580c] outline-none min-h-[38px] transition-all leading-tight"
        value={textVal || ''}
        onChange={e => {
          let val = e.target.value;
          if (fixedPrefix && !val.startsWith(fixedPrefix)) val = fixedPrefix;
          onChange(
            type === 'list' || type === 'numberList' ? val.split('\n') : val
          );
        }}
        placeholder={placeholder}
      />
    );
  }

  return (
    <input
      type="text"
      className="w-full bg-orange-50/70 dark:bg-slate-800/90 border border-orange-200 dark:border-slate-700 rounded-lg p-1.5 text-slate-900 dark:text-white text-[10px] sm:text-[11px] font-medium focus:ring-1 focus:ring-[#ea580c] focus:border-[#ea580c] outline-none transition-all"
      value={displayValue || ''}
      onChange={e => {
        let val = e.target.value;
        if (fixedPrefix && !val.startsWith(fixedPrefix)) val = fixedPrefix;
        onChange(val);
      }}
      placeholder={placeholder}
    />
  );
};

interface EditableResourceListProps {
  isEditable?: boolean;
  items: any;
  onChange?: (val: GarResourceItem[]) => void;
  placeholderLabel?: string;
  currency: CurrencyCode;
  language: LanguageCode;
}

const EditableResourceList: React.FC<EditableResourceListProps> = ({
  isEditable = true,
  items,
  onChange = () => {},
  placeholderLabel = 'Désignation...',
  currency,
  language
}) => {
  const normalizedArr = useMemo<GarResourceItem[]>(() => {
    if (!items) return [];
    if (!Array.isArray(items)) {
      if (typeof items === 'string') {
        return items
          .split('\n')
          .filter(s => s.trim())
          .map(s => ({ label: s.trim(), amount: '' }));
      }
      return [];
    }
    return items.map((item: any) =>
      typeof item === 'string'
        ? { label: item, amount: '' }
        : { label: item?.label || '', amount: String(item?.amount ?? '') }
    );
  }, [items]);

  if (!isEditable) {
    if (normalizedArr.length === 0) {
      return <p className="text-[9px] italic text-slate-400">Non défini</p>;
    }
    return (
      <ul className="text-[9.5px] sm:text-[10.5px] leading-tight font-medium text-slate-800 dark:text-slate-200 list-disc pl-3.5 space-y-0.5">
        {normalizedArr.map((item, idx) => (
          <li key={idx} className="break-words">
            {item.label || '-'}{' '}
            {item.amount && (
              <span className="font-bold text-[#ea580c] dark:text-[#fdba74] ml-1 font-mono">
                ({formatCurrency(parseGarAmountFCFA(item.amount), currency, language)})
              </span>
            )}
          </li>
        ))}
      </ul>
    );
  }

  const updateItem = (idx: number, field: 'label' | 'amount', val: string) => {
    const newArr = [...normalizedArr];
    newArr[idx] = { ...newArr[idx], [field]: val };
    onChange(newArr);
  };

  const addItem = () => onChange([...normalizedArr, { label: '', amount: '' }]);
  const removeItem = (idx: number) =>
    onChange(normalizedArr.filter((_, i) => i !== idx));

  return (
    <div className="space-y-1 w-full">
      {normalizedArr.map((item, idx) => {
        const displayAmount =
          currency === 'FCFA'
            ? item.amount
            : item.amount
            ? String(
                Math.round(
                  convertFromFCFA(parseGarAmountFCFA(item.amount), currency) * 100
                ) / 100
              )
            : '';

        return (
          <div
            key={idx}
            className="flex items-center gap-1 bg-white dark:bg-slate-900 p-1 rounded-lg border border-slate-200 dark:border-slate-700 shadow-2xs"
          >
            <input
              type="text"
              className="flex-1 min-w-0 bg-transparent text-[9.5px] sm:text-[10.5px] font-bold text-slate-900 dark:text-white focus:outline-none placeholder:text-slate-400"
              value={item.label || ''}
              onChange={e => updateItem(idx, 'label', e.target.value)}
              placeholder={placeholderLabel}
            />
            <input
              type="text"
              className="w-18 sm:w-22 min-w-0 bg-orange-50 dark:bg-slate-800 text-[9.5px] sm:text-[10.5px] font-mono font-black text-[#c2410c] dark:text-[#fdba74] border-l border-slate-200 dark:border-slate-700 pl-1.5 py-0.5 rounded-r focus:outline-none placeholder:text-slate-400"
              value={displayAmount}
              onChange={e => {
                const rawNum = parseGarAmountFCFA(e.target.value);
                const fcfaVal =
                  currency === 'FCFA'
                    ? e.target.value
                    : String(convertToFCFA(rawNum, currency));
                updateItem(idx, 'amount', fcfaVal);
              }}
              placeholder={`Coût (${currency})`}
            />
            <button
              type="button"
              onClick={() => removeItem(idx)}
              className="text-rose-500 hover:text-rose-700 px-0.5 cursor-pointer"
              title="Supprimer"
            >
              <X size={12} />
            </button>
          </div>
        );
      })}
      <button
        type="button"
        onClick={addItem}
        className="flex items-center justify-center w-full gap-1 py-1 bg-orange-50/80 dark:bg-slate-800 hover:bg-orange-100 dark:hover:bg-slate-700 text-[#c2410c] dark:text-[#fdba74] rounded-lg border border-dashed border-[#ea580c]/50 transition-colors text-[9px] font-black uppercase tracking-wider cursor-pointer"
      >
        <Plus size={10} /> {language === 'EN' ? 'Add Input' : 'Ajouter Intrant'}
      </button>
    </div>
  );
};

const AxeHeaderRow: React.FC<{ axeName: string; colSpan: number }> = ({
  axeName,
  colSpan
}) => (
  <tr className="bg-orange-100/90 dark:bg-slate-800 border-y border-orange-300 dark:border-slate-700">
    <td
      colSpan={colSpan}
      className="sticky left-0 z-10 px-3 py-1.5 font-black text-[#c2410c] dark:text-[#fdba74] text-[10px] sm:text-xs uppercase tracking-wider"
    >
      {axeName || 'Axe Stratégique'}
    </td>
  </tr>
);

const ProjHeaderRow: React.FC<{
  projName: string;
  pIdx: number;
  colSpan: number;
}> = ({ projName, pIdx, colSpan }) => (
  <tr className="bg-slate-100 dark:bg-slate-800/60 border-y border-slate-300 dark:border-slate-700">
    <td
      colSpan={colSpan}
      className="sticky left-0 z-10 px-3 py-1 font-bold text-slate-700 dark:text-slate-300 uppercase text-[9.5px] tracking-wider"
    >
      Sous-Problème {pIdx + 1} (Projet {pIdx + 1}) : {projName || 'Projet sans nom'}
    </td>
  </tr>
);

// ============================================================================
// MAIN GAR METHODOLOGY VIEWS COMPONENT
// ============================================================================

interface GarMethodologyViewsProps {
  activeTab: GarTabId;
  onNavigateTab: (tab: string) => void;
  activeDossier: Dossier;
  onUpdateDossier: (updater: (d: Dossier) => Dossier) => void;
  filterAxeId: string;
  filterProjectId: string;
  renderMacroFilterBar: () => React.ReactNode;
  currency: CurrencyCode;
  language: LanguageCode;
  userProfile: UserProfile;
  showToast: (msg: string) => void;
}

const PARTIES_SUB_TABS = [
  'Bénéficiaires',
  "Interne à l'Institution",
  "Externe à l'Institution",
  'Partenaires Techniques',
  'Partenaires Financiers'
] as const;

export const GarMethodologyViews: React.FC<GarMethodologyViewsProps> = ({
  activeTab,
  onNavigateTab,
  activeDossier,
  onUpdateDossier,
  filterAxeId,
  filterProjectId,
  renderMacroFilterBar,
  currency,
  language,
  userProfile,
  showToast
}) => {
  const isEn = language === 'EN';
  const [treeViewMode, setTreeViewMode] = useState<'tree' | 'list'>('tree');
  const [treeZoom, setTreeZoom] = useState<number>(0.85);
  const [activePartiesSubTab, setActivePartiesSubTab] = useState<string>(
    PARTIES_SUB_TABS[0]
  );

  const garData = useMemo<GarDossierData>(
    () => ensureDossierGarData(activeDossier),
    [activeDossier]
  );

  // Mutate garData inside activeDossier and keep axe/project titles synced
  const updateGarData = (mutator: (draft: GarDossierData, d: Dossier) => void) => {
    onUpdateDossier(d => {
      const nextGar: GarDossierData = JSON.parse(
        JSON.stringify(ensureDossierGarData(d))
      );
      const nextDossier: Dossier = JSON.parse(JSON.stringify(d));
      mutator(nextGar, nextDossier);

      // Keep dossier.axes names and project names aligned with GAR axes/projects
      if (nextGar.rendement?.axes && Array.isArray(nextDossier.axes)) {
        nextGar.rendement.axes.forEach((gAxe, aIdx) => {
          if (nextDossier.axes[aIdx]) {
            if (gAxe.nom) nextDossier.axes[aIdx].name = gAxe.nom;
            if (nextGar.problems?.branches?.[aIdx]) {
              nextGar.problems.branches[aIdx].axeName = gAxe.nom;
            }
            (gAxe.projets || []).forEach((gProj, pIdx) => {
              if (nextDossier.axes[aIdx].projects?.[pIdx] && gProj.extrant) {
                nextDossier.axes[aIdx].projects[pIdx].name = gProj.extrant;
              }
            });
          }
        });
      }

      return {
        ...nextDossier,
        garData: nextGar
      };
    });
  };

  // Visibility helpers synced with faab gar's Macro Filter Bar (filterAxeId & filterProjectId)
  const isAxeVisible = (axeIdx: number): boolean => {
    if (filterAxeId === 'ALL') return true;
    const targetAxe = activeDossier.axes?.[axeIdx];
    return targetAxe ? targetAxe.id === filterAxeId : true;
  };

  const isProjVisible = (axeIdx: number, projIdx: number): boolean => {
    if (!isAxeVisible(axeIdx)) return false;
    if (filterProjectId === 'ALL') return true;
    const targetProj = activeDossier.axes?.[axeIdx]?.projects?.[projIdx];
    return targetProj ? targetProj.id === filterProjectId : true;
  };

  // Structural mutations (Add/Remove Axe, Project, Cause/Activity)
  const handleAddAxe = () => {
    updateGarData((g, d) => {
      const idx = (g.rendement.axes?.length || 0) + 1;
      const axeTitle = `Axe ${idx} : Nouvel Axe Stratégique`;
      g.rendement.axes.push({
        nom: axeTitle,
        effet: '',
        budget: '0 FCFA',
        projets: [
          {
            extrant: `Projet ${idx}.1 : Nouveau Projet`,
            activites: [''],
            intrants_rh: [[]],
            intrants_mat: [[]],
            couts: [''],
            responsable: userProfile.fullName || '',
            periode: d.horizonPlan || '2026-2030'
          }
        ]
      });
      g.problems.branches.push({
        axeName: axeTitle,
        central: '',
        details: [{ contrainte: '', cause: [''], besoin: [''] }]
      });
      d.axes.push({
        id: `axe-gar-${Date.now()}`,
        name: axeTitle,
        projects: [
          {
            id: `proj-gar-${Date.now()}`,
            name: `Projet ${idx}.1 : Nouveau Projet`,
            tasks: []
          }
        ]
      });
    });
    showToast(isEn ? 'New Strategic Axis added.' : 'Nouvel Axe Stratégique ajouté.');
  };

  const handleDeleteAxe = (axeIdx: number) => {
    if ((garData.rendement.axes || []).length <= 1) {
      showToast(
        isEn
          ? 'The portfolio must keep at least one axis.'
          : 'Le dossier doit conserver au moins un Axe Stratégique.'
      );
      return;
    }
    updateGarData((g, d) => {
      g.rendement.axes.splice(axeIdx, 1);
      g.problems.branches.splice(axeIdx, 1);
      if (d.axes?.[axeIdx]) d.axes.splice(axeIdx, 1);
    });
    showToast(isEn ? 'Axis removed.' : 'Axe supprimé.');
  };

  const handleAddProject = (axeIdx: number) => {
    updateGarData((g, d) => {
      const pIdx = (g.rendement.axes[axeIdx]?.projets?.length || 0) + 1;
      const projTitle = `Projet ${axeIdx + 1}.${pIdx} : Nouvel Extrant`;
      g.rendement.axes[axeIdx].projets.push({
        extrant: projTitle,
        activites: [''],
        intrants_rh: [[]],
        intrants_mat: [[]],
        couts: [''],
        responsable: userProfile.fullName || '',
        periode: d.horizonPlan || '2026-2030'
      });
      g.problems.branches[axeIdx].details.push({
        contrainte: '',
        cause: [''],
        besoin: ['']
      });
      if (d.axes?.[axeIdx]) {
        d.axes[axeIdx].projects.push({
          id: `proj-gar-${Date.now()}`,
          name: projTitle,
          tasks: []
        });
      }
    });
    showToast(isEn ? 'New Project / Output added.' : 'Nouveau Projet / Extrant ajouté.');
  };

  const handleDeleteProject = (axeIdx: number, projIdx: number) => {
    updateGarData((g, d) => {
      g.rendement.axes[axeIdx]?.projets?.splice(projIdx, 1);
      g.problems.branches[axeIdx]?.details?.splice(projIdx, 1);
      if (d.axes?.[axeIdx]?.projects?.[projIdx]) {
        d.axes[axeIdx].projects.splice(projIdx, 1);
      }
    });
    showToast(isEn ? 'Project removed.' : 'Projet supprimé.');
  };

  const handleAddCauseActivity = (axeIdx: number, projIdx: number) => {
    updateGarData(g => {
      const detail = g.problems.branches[axeIdx]?.details?.[projIdx];
      const proj = g.rendement.axes[axeIdx]?.projets?.[projIdx];
      if (!detail || !proj) return;

      const causes = ensureArray(detail.cause);
      const besoins = ensureArray(detail.besoin);
      const acts = ensureArray(proj.activites);
      causes.push('');
      besoins.push('');
      acts.push('');
      detail.cause = causes;
      detail.besoin = besoins;
      proj.activites = acts;

      if (!Array.isArray(proj.intrants_rh)) proj.intrants_rh = [];
      proj.intrants_rh.push([]);
      if (!Array.isArray(proj.intrants_mat)) proj.intrants_mat = [];
      proj.intrants_mat.push([]);
    });
  };

  const handleRemoveCauseActivity = (
    axeIdx: number,
    projIdx: number,
    itemIdx: number
  ) => {
    updateGarData(g => {
      const detail = g.problems.branches[axeIdx]?.details?.[projIdx];
      const proj = g.rendement.axes[axeIdx]?.projets?.[projIdx];
      if (!detail || !proj) return;

      const causes = ensureArray(detail.cause);
      const besoins = ensureArray(detail.besoin);
      const acts = ensureArray(proj.activites);
      const rh = Array.isArray(proj.intrants_rh) ? [...proj.intrants_rh] : [];
      const mat = Array.isArray(proj.intrants_mat) ? [...proj.intrants_mat] : [];

      const removeAt = (arr: any[]) => {
        if (arr.length > 1) arr.splice(itemIdx, 1);
        else arr[0] = Array.isArray(arr[0]) ? [] : '';
      };

      removeAt(causes);
      removeAt(besoins);
      removeAt(acts);
      removeAt(rh);
      removeAt(mat);

      detail.cause = causes;
      detail.besoin = besoins;
      proj.activites = acts;
      proj.intrants_rh = rh;
      proj.intrants_mat = mat;
    });
  };

  const updateIntrants = (
    axeIdx: number,
    projIdx: number,
    actIdx: number,
    field: 'intrants_rh' | 'intrants_mat',
    val: GarResourceItem[]
  ) => {
    updateGarData(g => {
      const proj = g.rendement.axes[axeIdx]?.projets?.[projIdx];
      if (!proj) return;
      let arr = proj[field];
      if (!Array.isArray(arr)) arr = [];
      while (arr.length <= actIdx) arr.push([]);
      arr[actIdx] = val;
      proj[field] = arr;
    });
  };

  const updateCmr = (
    axeIdx: number,
    niveau: string,
    field: keyof GarCmrRow,
    value: string
  ) => {
    updateGarData(g => {
      let row = g.cmr.find(c => c.axe === axeIdx && c.niveau === niveau);
      if (!row) {
        row = {
          niveau,
          resultat: '',
          indicateur: '',
          ref: '0',
          cible: '100',
          real: '0',
          freq: 'Annuelle',
          source: 'Rapport de suivi',
          responsable: '',
          axe: axeIdx
        };
        g.cmr.push(row);
      }
      (row as any)[field] = value;
    });
  };

  const updateRisk = (
    axeIdx: number,
    niveau: string,
    field: keyof GarRiskRow,
    value: any
  ) => {
    updateGarData(g => {
      let row = g.risks.find(c => c.axe === axeIdx && c.niveau === niveau);
      if (!row) {
        row = {
          id: `risk-${Date.now()}`,
          niveau,
          logique: '',
          hypothese: '',
          contrainte: '',
          cause: '',
          level: 'MOYEN',
          responsable: '',
          mitigation: '',
          axe: axeIdx
        };
        g.risks.push(row);
      }
      (row as any)[field] = value;
    });
  };

  const getStakeholderKey = (
    subTabName: string
  ): keyof GarDossierData['stakeholders'] => {
    if (subTabName === 'Bénéficiaires') return 'beneficiaires';
    if (subTabName === "Interne à l'Institution") return 'instCentralises';
    if (subTabName === "Externe à l'Institution") return 'instDecentralises';
    if (subTabName === 'Partenaires Techniques') return 'operateursTechniques';
    return 'ptf';
  };

  const addStakeholder = (
    key: keyof GarDossierData['stakeholders'],
    axeNum: number,
    pIdx: number
  ) => {
    updateGarData(g => {
      if (!g.stakeholders[key]) g.stakeholders[key] = [];
      g.stakeholders[key].push({
        nom: '',
        intervention: '',
        competence: '',
        attentes: '',
        contraintes: '',
        pointFort: '',
        pointFaible: '',
        problemes: '',
        axe: axeNum,
        projetIndex: pIdx
      });
    });
  };

  const updateStakeholder = (
    key: keyof GarDossierData['stakeholders'],
    absIdx: number,
    field: keyof GarStakeholderItem,
    value: any
  ) => {
    updateGarData(g => {
      if (g.stakeholders[key]?.[absIdx]) {
        (g.stakeholders[key][absIdx] as any)[field] = value;
      }
    });
  };

  const deleteStakeholder = (
    key: keyof GarDossierData['stakeholders'],
    absIdx: number
  ) => {
    updateGarData(g => {
      if (g.stakeholders[key]) {
        g.stakeholders[key].splice(absIdx, 1);
      }
    });
  };

  const getAvailableActorsForProject = (axeNum: number, pIdx: number): string[] => {
    const actors: string[] = [];
    (['instCentralises', 'instDecentralises', 'operateursTechniques', 'ptf'] as const).forEach(
      key => {
        (garData.stakeholders[key] || []).forEach(a => {
          if (a.axe === axeNum && a.projetIndex === pIdx && a.nom?.trim()) {
            actors.push(a.nom.trim());
          }
        });
      }
    );
    (activeDossier.categorizedActors || []).forEach(ca => {
      if (ca.name?.trim()) actors.push(ca.name.trim());
    });
    return Array.from(new Set(actors));
  };

  const renderActivityCostBadge = (proj: any, k: number) => {
    const { sum } = calculateGarActivityTotalFCFA(proj, k);
    return (
      <div className="text-center p-1.5 bg-orange-50 dark:bg-slate-800 rounded-lg border border-[#fdba74] dark:border-orange-800 shadow-2xs w-full">
        <span className="text-[10px] font-mono font-black text-[#c2410c] dark:text-[#fdba74] block">
          {formatCurrency(sum, currency, language)}
        </span>
        <span className="text-[7.5px] uppercase font-bold text-[#ea580c] dark:text-orange-400 block mt-0.5 tracking-wider">
          {isEn ? 'Auto-calc' : 'Calcul auto'}
        </span>
      </div>
    );
  };

  const tabTitleMap: Record<GarTabId, { titleFr: string; titleEn: string; subtitleFr: string; subtitleEn: string }> = {
    arbre: {
      titleFr: 'Arbre à Problèmes (Diagnostic Causal GAR)',
      titleEn: 'Problem Tree (RBM Causal Diagnosis)',
      subtitleFr: 'Modélisation hiérarchique : Conséquence Globale, Problèmes Centraux par Axe, Contraintes, Causes profondes et Besoins.',
      subtitleEn: 'Hierarchical modeling: Global Consequence, Central Problems by Axis, Constraints, Root Causes, and Needs.'
    },
    solutions: {
      titleFr: 'Arbre à Solutions & Objectifs (Transposition Positive)',
      titleEn: 'Solution & Objective Tree (Positive Transposition)',
      subtitleFr: 'Transposition directe des problèmes en résultats : Impact Positif, Effets par Axe, Extrants, Activités et Intrants.',
      subtitleEn: 'Direct transposition of problems into results: Positive Impact, Outcomes by Axis, Outputs, Activities, and Inputs.'
    },
    registre_parties: {
      titleFr: 'Registre Consolidé des Parties Prenantes (5 Catégories)',
      titleEn: 'Consolidated Stakeholder Register (5 Categories)',
      subtitleFr: 'Cartographie synoptique des Bénéficiaires, Acteurs Internes, Acteurs Externes, Partenaires Techniques et Bailleurs (PTF).',
      subtitleEn: 'Synoptic mapping of Beneficiaries, Internal Actors, External Actors, Technical Partners, and Financial Donors.'
    },
    terrain: {
      titleFr: 'Analyse des Problèmes & Correspondance GAR',
      titleEn: 'Problem Analysis & RBM Alignment Matrix',
      subtitleFr: 'Tableau de correspondance entre Problèmes Centraux, Contraintes, Causes, Besoins, Acteurs sollicités et Activités.',
      subtitleEn: 'Alignment matrix linking Central Problems, Constraints, Causes, Needs, Mobilized Actors, and Activities.'
    },
    parties: {
      titleFr: 'Analyse Détaillée des Parties Prenantes',
      titleEn: 'Detailed Stakeholder Analysis',
      subtitleFr: 'Diagnostic approfondi par catégorie d’acteurs : compétences, attentes, contraintes, forces, faiblesses et enjeux.',
      subtitleEn: 'In-depth diagnosis by stakeholder category: skills, expectations, constraints, strengths, weaknesses, and issues.'
    },
    rendement: {
      titleFr: 'Cadre de Rendement & Budgétisation par Intrants',
      titleEn: 'Performance Framework & Input-Based Budgeting',
      subtitleFr: 'Chaîne des résultats (Impact → Effets → Extrants → Activités) et quantification financière des Intrants RH et Matériels.',
      subtitleEn: 'Results chain (Impact → Outcomes → Outputs → Activities) and financial quantification of HR and Material Inputs.'
    },
    cmr: {
      titleFr: 'Cadre de Mesure du Rendement (CMR / KPI)',
      titleEn: 'Performance Measurement Framework (PMF / KPI)',
      subtitleFr: 'Suivi des Indicateurs Clés de Performance (KPI), valeurs de référence (Baseline), cibles, réalisations et sources de vérification.',
      subtitleEn: 'Tracking of Key Performance Indicators (KPI), baselines, targets, actuals, frequencies, and verification sources.'
    },
    risques_hypo: {
      titleFr: 'Matrice des Hypothèses Conditionnelles & Risques',
      titleEn: 'Conditional Assumptions &的风险 Matrix',
      subtitleFr: 'Analyse des hypothèses inter-branches, événements critiques, niveaux de criticité et plans d’atténuation.',
      subtitleEn: 'Analysis of cross-branch assumptions, critical events, criticality levels, and mitigation plans.'
    },
    extrants: {
      titleFr: 'Matrice des Extrants, Activités, Intrants & Coûts',
      titleEn: 'Outputs, Activities, Inputs & Costs Matrix',
      subtitleFr: 'Consolidation opérationnelle des livrables, ressources mobilisées, budgets auto-calculés et partenaires associés.',
      subtitleEn: 'Operational consolidation of deliverables, mobilized resources, auto-calculated budgets, and associated partners.'
    },
    clar: {
      titleFr: 'Cadre Logique Axé sur les Résultats (CLAR)',
      titleEn: 'Results-Based Logical Framework (LFA / CLAR)',
      subtitleFr: 'Synthèse matricielle normalisée croisant Logique d’Intervention, Indicateurs/Ressources, Sources/Coûts et Hypothèses.',
      subtitleEn: 'Standardized Logical Framework Matrix crossing Intervention Logic, Indicators/Resources, Sources/Costs, and Assumptions.'
    }
  };

  const currentMeta = tabTitleMap[activeTab];

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Macro Filter Bar from faab gar */}
      {renderMacroFilterBar()}

      {/* Unified GAR Section Header Banner matching faab gar (#c2410c / #ea580c / #fdba74) */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-3 sm:p-4 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <div className="p-2 rounded-xl bg-gradient-to-br from-[#c2410c] to-[#ea580c] text-white shadow-xs shrink-0">
            {activeTab === 'arbre' && <Network className="w-4 h-4 sm:w-5 sm:h-5" />}
            {activeTab === 'solutions' && <Lightbulb className="w-4 h-4 sm:w-5 sm:h-5" />}
            {activeTab === 'registre_parties' && <BookOpen className="w-4 h-4 sm:w-5 sm:h-5" />}
            {activeTab === 'terrain' && <LayoutDashboard className="w-4 h-4 sm:w-5 sm:h-5" />}
            {activeTab === 'parties' && <Users className="w-4 h-4 sm:w-5 sm:h-5" />}
            {activeTab === 'rendement' && <Target className="w-4 h-4 sm:w-5 sm:h-5" />}
            {activeTab === 'cmr' && <Activity className="w-4 h-4 sm:w-5 sm:h-5" />}
            {activeTab === 'risques_hypo' && <ShieldAlert className="w-4 h-4 sm:w-5 sm:h-5" />}
            {activeTab === 'extrants' && <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5" />}
            {activeTab === 'clar' && <Layers className="w-4 h-4 sm:w-5 sm:h-5" />}
          </div>
          <div>
            <h2 className="text-xs sm:text-sm md:text-base font-black text-slate-900 dark:text-white uppercase tracking-tight">
              {isEn ? currentMeta.titleEn : currentMeta.titleFr}
            </h2>
            <p className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {isEn ? currentMeta.subtitleEn : currentMeta.subtitleFr}
            </p>
          </div>
        </div>

        {/* Right Controls: Tree/List toggle + Zoom (for Arbre/Solutions) + Direct GAR PDF Button */}
        <div className="flex flex-wrap items-center gap-2">
          {(activeTab === 'arbre' || activeTab === 'solutions') && (
            <>
              <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
                <button
                  type="button"
                  onClick={() => setTreeViewMode('tree')}
                  className={`px-2.5 py-1 rounded text-[11px] font-bold flex items-center gap-1 transition-all cursor-pointer ${
                    treeViewMode === 'tree'
                      ? 'bg-[#c2410c] text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  <Network className="w-3.5 h-3.5" />
                  <span>{isEn ? 'Tree View' : 'Vue Arbre'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTreeViewMode('list')}
                  className={`px-2.5 py-1 rounded text-[11px] font-bold flex items-center gap-1 transition-all cursor-pointer ${
                    treeViewMode === 'list'
                      ? 'bg-[#c2410c] text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  <ListFilter className="w-3.5 h-3.5" />
                  <span>{isEn ? 'List View' : 'Vue Liste'}</span>
                </button>
              </div>

              {treeViewMode === 'tree' && (
                <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-lg">
                  <button
                    type="button"
                    onClick={() =>
                      setTreeZoom(z => Math.max(0.25, Number((z - 0.1).toFixed(2))))
                    }
                    className="p-1 rounded hover:bg-white dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 cursor-pointer"
                    title="Zoom -"
                  >
                    <ZoomOut className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-[11px] font-black text-slate-800 dark:text-slate-200 min-w-[42px] text-center font-mono">
                    {Math.round(treeZoom * 100)}%
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setTreeZoom(z => Math.min(1.5, Number((z + 0.1).toFixed(2))))
                    }
                    className="p-1 rounded hover:bg-white dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 cursor-pointer"
                    title="Zoom +"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setTreeZoom(0.85)}
                    className="p-1 rounded hover:bg-white dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 cursor-pointer"
                    title="Reset"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </>
          )}

          <button
            type="button"
            onClick={() => {
              generateOfficialGarWhitePdf(
                activeDossier,
                garData,
                currency,
                language,
                userProfile
              );
              showToast(
                isEn
                  ? `Official GAR PDF report downloaded (${currency})`
                  : `Rapport PDF officiel GAR téléchargé (${currency})`
              );
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#c2410c] hover:bg-[#ea580c] text-white text-[11px] font-black shadow-xs transition-colors cursor-pointer"
          >
            <FileDown className="w-3.5 h-3.5 text-[#fdba74]" />
            <span>{isEn ? 'Export GAR PDF' : 'Exporter PDF GAR'}</span>
          </button>
        </div>
      </div>

      {/* Sub-navigation bar for Analyse Parties Prenantes ('parties') */}
      {activeTab === 'parties' && (
        <div className="flex flex-wrap gap-1.5 bg-white dark:bg-slate-900 p-2 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs">
          {PARTIES_SUB_TABS.map(sub => {
            const isActive = activePartiesSubTab === sub;
            return (
              <button
                key={sub}
                type="button"
                onClick={() => setActivePartiesSubTab(sub)}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-extrabold transition-all cursor-pointer ${
                  isActive
                    ? 'bg-[#c2410c] text-white shadow-xs ring-1 ring-[#fdba74]'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-orange-50 dark:hover:bg-slate-700'
                }`}
              >
                {sub}
              </button>
            );
          })}
        </div>
      )}

      {/* =====================================================================
          1. ONGLET : ARBRE À PROBLÈMES ('arbre')
      ===================================================================== */}
      {activeTab === 'arbre' &&
        (treeViewMode === 'list' ? (
          <div className="space-y-3">
            {/* Conséquence Globale Card */}
            <div className="bg-gradient-to-r from-[#c2410c] via-[#9a3412] to-[#9a3412] text-white rounded-xl p-3.5 border-2 border-[#fdba74]/60 shadow-sm">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-black uppercase tracking-widest text-[#fdba74]">
                  {isEn
                    ? 'Global Consequence (Negative Impact)'
                    : 'Conséquence Globale (Impact Négatif)'}
                </span>
                <button
                  type="button"
                  onClick={handleAddAxe}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#ea580c] hover:bg-orange-500 text-white text-[10px] font-black cursor-pointer"
                >
                  <Plus size={12} /> {isEn ? 'Add Axis' : 'Ajouter Axe'}
                </button>
              </div>
              <textarea
                rows={2}
                value={garData.problems?.consequenceGlobale || ''}
                onChange={e =>
                  updateGarData(g => {
                    g.problems.consequenceGlobale = e.target.value;
                  })
                }
                placeholder="Décrivez la conséquence globale..."
                className="w-full rounded-lg bg-slate-950/40 border border-[#fdba74]/50 text-white p-2 text-xs font-bold focus:outline-none"
              />
            </div>

            {(garData.problems?.branches || []).map((branch, i) => {
              if (!isAxeVisible(i)) return null;
              return (
                <div
                  key={i}
                  className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 border-l-4 border-l-[#c2410c] p-3.5 shadow-xs space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
                    <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                      <span className="px-2 py-0.5 rounded bg-[#c2410c] text-white text-[10px] font-black uppercase">
                        Axe {i + 1}
                      </span>
                      <input
                        type="text"
                        value={branch.axeName || ''}
                        onChange={e =>
                          updateGarData(g => {
                            g.problems.branches[i].axeName = e.target.value;
                            if (g.rendement.axes[i]) {
                              g.rendement.axes[i].nom = e.target.value;
                            }
                          })
                        }
                        className="flex-1 bg-orange-50/70 dark:bg-slate-800 border border-orange-200 dark:border-slate-700 rounded-lg px-2.5 py-1 text-xs font-black text-[#c2410c] dark:text-[#fdba74] focus:outline-none"
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleAddProject(i)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-orange-50 dark:bg-slate-800 text-[#c2410c] dark:text-[#fdba74] border border-[#ea580c]/40 text-[10px] font-black cursor-pointer"
                      >
                        <Plus size={12} /> {isEn ? 'Sub-Problem' : 'Sous-Problème'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteAxe(i)}
                        className="p-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/50 text-rose-600 hover:bg-rose-100 cursor-pointer"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-500 dark:text-slate-400 block mb-1">
                      {isEn ? 'Central Problem of Axis' : 'Problème Central de l’Axe'}
                    </label>
                    <textarea
                      rows={2}
                      value={branch.central || ''}
                      onChange={e =>
                        updateGarData(g => {
                          g.problems.branches[i].central = e.target.value;
                        })
                      }
                      className="w-full rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 p-2 text-xs font-bold text-slate-900 dark:text-white focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {(branch.details || []).map((det, j) => {
                      if (!isProjVisible(i, j)) return null;
                      const causes = ensureArray(det.cause);
                      const besoins = ensureArray(det.besoin);
                      const count = Math.max(causes.length, besoins.length, 1);

                      return (
                        <div
                          key={j}
                          className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 p-3 space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-black uppercase text-[#ea580c] dark:text-[#fdba74]">
                              Sous-Problème {j + 1} (Contrainte)
                            </span>
                            <button
                              type="button"
                              onClick={() => handleDeleteProject(i, j)}
                              className="text-rose-500 hover:text-rose-700 cursor-pointer"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                          <textarea
                            rows={2}
                            value={det.contrainte || ''}
                            onChange={e =>
                              updateGarData(g => {
                                g.problems.branches[i].details[j].contrainte =
                                  e.target.value;
                              })
                            }
                            placeholder="Contrainte..."
                            className="w-full rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 p-1.5 text-xs font-bold text-slate-900 dark:text-white"
                          />
                          <div className="space-y-2 pt-1">
                            {Array.from({ length: count }).map((_, k) => (
                              <div
                                key={k}
                                className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 space-y-1.5"
                              >
                                <div className="flex items-center justify-between">
                                  <span className="text-[9px] font-black uppercase text-slate-500">
                                    Cause {k + 1} & Besoin {k + 1}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveCauseActivity(i, j, k)}
                                    className="text-rose-500 hover:text-rose-700 cursor-pointer"
                                  >
                                    <X size={11} />
                                  </button>
                                </div>
                                <textarea
                                  rows={2}
                                  value={causes[k] || ''}
                                  onChange={e =>
                                    updateGarData(g => {
                                      const arr = ensureArray(
                                        g.problems.branches[i].details[j].cause
                                      );
                                      arr[k] = e.target.value;
                                      g.problems.branches[i].details[j].cause = arr;
                                    })
                                  }
                                  placeholder={`Cause ${k + 1}...`}
                                  className="w-full rounded bg-orange-50/50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-1.5 text-[11px] text-slate-900 dark:text-white"
                                />
                                <textarea
                                  rows={2}
                                  value={besoins[k] || ''}
                                  onChange={e =>
                                    updateGarData(g => {
                                      const arr = ensureArray(
                                        g.problems.branches[i].details[j].besoin
                                      );
                                      arr[k] = e.target.value;
                                      g.problems.branches[i].details[j].besoin = arr;
                                    })
                                  }
                                  placeholder={`Besoin ${k + 1}...`}
                                  className="w-full rounded bg-emerald-50/40 dark:bg-slate-800 border border-emerald-200 dark:border-slate-700 p-1.5 text-[11px] text-slate-900 dark:text-white"
                                />
                              </div>
                            ))}
                            <button
                              type="button"
                              onClick={() => handleAddCauseActivity(i, j)}
                              className="w-full py-1 rounded-lg border border-dashed border-[#ea580c] text-[#c2410c] dark:text-[#fdba74] text-[10px] font-black uppercase hover:bg-orange-50 dark:hover:bg-slate-800 cursor-pointer"
                            >
                              + Ajouter Cause & Besoin
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* TREE VIEW FOR ARBRE À PROBLÈMES */
          <div className="bg-slate-100/80 dark:bg-slate-900/90 rounded-xl border border-slate-200 dark:border-slate-800 overflow-auto max-h-[76vh] p-4 shadow-inner">
            <div
              className="min-w-max flex justify-center pb-8 transition-transform duration-150"
              style={{
                transform: `scale(${treeZoom})`,
                transformOrigin: 'top center'
              }}
            >
              <div className="flex flex-col items-center">
                {/* RACINE : CONSÉQUENCE GLOBALE */}
                <div className="bg-gradient-to-r from-[#c2410c] to-[#9a3412] text-white p-3 rounded-xl shadow-lg border-2 border-[#fdba74] w-[300px] sm:w-[340px] text-center z-10 relative">
                  <h4 className="text-[9.5px] uppercase font-black mb-1 text-[#fdba74] tracking-wider">
                    Conséquence Globale (Impact Négatif)
                  </h4>
                  <textarea
                    rows={2}
                    value={garData.problems?.consequenceGlobale || ''}
                    onChange={e =>
                      updateGarData(g => {
                        g.problems.consequenceGlobale = e.target.value;
                      })
                    }
                    className="w-full bg-slate-950/50 text-white text-[11px] font-bold text-center border border-[#fdba74]/50 rounded-lg p-1.5 focus:outline-none resize-none"
                  />
                </div>

                {/* CONNECTEUR AJOUT AXE */}
                <div className="flex flex-col items-center">
                  <div className="w-0.5 h-3.5 bg-[#ea580c]" />
                  <button
                    type="button"
                    onClick={handleAddAxe}
                    className="bg-[#c2410c] hover:bg-[#ea580c] text-white rounded-full p-1.5 shadow-md border border-[#fdba74] cursor-pointer z-20"
                    title="Ajouter un Axe"
                  >
                    <Plus size={13} />
                  </button>
                  {(garData.problems?.branches || []).length > 0 && (
                    <div className="w-0.5 h-3.5 bg-[#ea580c]" />
                  )}
                </div>

                {/* AXES */}
                <div className="flex justify-center relative">
                  {(garData.problems?.branches || []).map((branch, i) => {
                    if (!isAxeVisible(i)) return null;
                    const branches = garData.problems.branches || [];
                    const isOnlyAxe = branches.length === 1;
                    return (
                      <div
                        key={i}
                        className="flex flex-col items-center relative px-2"
                      >
                        {isOnlyAxe ? (
                          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-0.5 h-5 bg-[#ea580c]" />
                        ) : (
                          <>
                            {i !== 0 && (
                              <div className="absolute top-0 left-0 w-1/2 h-0.5 bg-[#ea580c]" />
                            )}
                            {i !== branches.length - 1 && (
                              <div className="absolute top-0 right-0 w-1/2 h-0.5 bg-[#ea580c]" />
                            )}
                            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-0.5 h-5 bg-[#ea580c]" />
                          </>
                        )}

                        <div className="bg-orange-50 dark:bg-slate-800 text-slate-900 dark:text-white p-2.5 rounded-xl shadow-sm border-2 border-[#ea580c] w-[260px] sm:w-[280px] text-center z-10 relative mt-5">
                          <div className="flex justify-between items-center mb-1 gap-1">
                            <input
                              type="text"
                              value={branch.axeName || ''}
                              onChange={e =>
                                updateGarData(g => {
                                  g.problems.branches[i].axeName = e.target.value;
                                  if (g.rendement.axes[i]) {
                                    g.rendement.axes[i].nom = e.target.value;
                                  }
                                })
                              }
                              className="flex-1 bg-white dark:bg-slate-900 border border-orange-300 dark:border-slate-700 rounded px-1.5 py-0.5 text-[9.5px] font-black uppercase text-[#c2410c] dark:text-[#fdba74] focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => handleDeleteAxe(i)}
                              className="text-rose-500 hover:text-rose-700 p-0.5 cursor-pointer"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                          <span className="text-[8.5px] uppercase font-black text-[#ea580c] dark:text-[#fdba74] block mb-0.5">
                            Problème Central
                          </span>
                          <textarea
                            rows={2}
                            value={branch.central || ''}
                            onChange={e =>
                              updateGarData(g => {
                                g.problems.branches[i].central = e.target.value;
                              })
                            }
                            className="w-full bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-[10.5px] font-bold text-center border border-orange-200 dark:border-slate-700 rounded p-1 focus:outline-none resize-none"
                          />
                        </div>

                        {/* CONNECTEUR AJOUT SOUS-PROBLÈME */}
                        <div className="flex flex-col items-center">
                          <div className="w-0.5 h-3 bg-slate-400" />
                          <button
                            type="button"
                            onClick={() => handleAddProject(i)}
                            className="bg-[#ea580c] hover:bg-[#c2410c] text-white rounded-full p-1 shadow-xs cursor-pointer z-20"
                            title="Ajouter un Sous-Problème"
                          >
                            <Plus size={11} />
                          </button>
                          {(branch.details || []).length > 0 && (
                            <div className="w-0.5 h-3 bg-slate-400" />
                          )}
                        </div>

                        {/* SOUS-PROBLÈMES (CONTRAINTES -> CAUSES -> BESOINS) */}
                        <div className="flex justify-center relative">
                          {(branch.details || []).map((det, j) => {
                            if (!isProjVisible(i, j)) return null;
                            const details = branch.details || [];
                            const isOnlyDet = details.length === 1;
                            const causes = ensureArray(det.cause);
                            const besoins = ensureArray(det.besoin);
                            const maxItems = Math.max(causes.length, besoins.length, 1);

                            return (
                              <div
                                key={j}
                                className="flex flex-col items-center relative px-1.5"
                              >
                                {isOnlyDet ? (
                                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-0.5 h-4 bg-slate-400" />
                                ) : (
                                  <>
                                    {j !== 0 && (
                                      <div className="absolute top-0 left-0 w-1/2 h-0.5 bg-slate-400" />
                                    )}
                                    {j !== details.length - 1 && (
                                      <div className="absolute top-0 right-0 w-1/2 h-0.5 bg-slate-400" />
                                    )}
                                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-0.5 h-4 bg-slate-400" />
                                  </>
                                )}

                                {/* Contrainte */}
                                <div className="bg-white dark:bg-slate-900 p-2 rounded-xl shadow-xs border-2 border-[#c2410c] dark:border-[#fdba74] w-[210px] text-center z-10 relative mt-4">
                                  <div className="flex justify-between items-center mb-1">
                                    <span className="text-[8.5px] uppercase font-black text-[#c2410c] dark:text-[#fdba74]">
                                      Sous-Problème {j + 1} (Contrainte)
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteProject(i, j)}
                                      className="text-rose-500 hover:text-rose-700 cursor-pointer"
                                    >
                                      <Trash2 size={11} />
                                    </button>
                                  </div>
                                  <textarea
                                    rows={2}
                                    value={det.contrainte || ''}
                                    onChange={e =>
                                      updateGarData(g => {
                                        g.problems.branches[i].details[j].contrainte =
                                          e.target.value;
                                      })
                                    }
                                    className="w-full bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-[10px] font-bold text-center border border-slate-300 dark:border-slate-700 rounded p-1 focus:outline-none resize-none"
                                  />
                                </div>

                                <div className="flex flex-col items-center">
                                  <div className="w-0.5 h-2.5 bg-slate-400" />
                                  <button
                                    type="button"
                                    onClick={() => handleAddCauseActivity(i, j)}
                                    className="bg-slate-700 hover:bg-[#c2410c] text-white rounded-full p-0.5 shadow-2xs cursor-pointer"
                                    title="Ajouter Cause & Besoin"
                                  >
                                    <Plus size={10} />
                                  </button>
                                  <div className="w-0.5 h-2.5 bg-slate-400" />
                                </div>

                                {/* Causes & Besoins */}
                                <div className="flex justify-center gap-1.5">
                                  {Array.from({ length: maxItems }).map((_, k) => (
                                    <div
                                      key={k}
                                      className="flex flex-col items-center w-[175px]"
                                    >
                                      <div className="bg-amber-50/90 dark:bg-slate-800 border border-amber-300 dark:border-amber-700 rounded-lg p-1.5 w-full text-center shadow-2xs">
                                        <div className="flex justify-between items-center mb-0.5">
                                          <span className="text-[8px] font-black uppercase text-amber-800 dark:text-amber-300">
                                            Cause {k + 1}
                                          </span>
                                          <button
                                            type="button"
                                            onClick={() =>
                                              handleRemoveCauseActivity(i, j, k)
                                            }
                                            className="text-rose-500 hover:text-rose-700 cursor-pointer"
                                          >
                                            <X size={10} />
                                          </button>
                                        </div>
                                        <textarea
                                          rows={2}
                                          value={causes[k] || ''}
                                          onChange={e =>
                                            updateGarData(g => {
                                              const arr = ensureArray(
                                                g.problems.branches[i].details[j].cause
                                              );
                                              arr[k] = e.target.value;
                                              g.problems.branches[i].details[j].cause =
                                                arr;
                                            })
                                          }
                                          className="w-full bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-[9.5px] font-medium text-center border border-amber-200 dark:border-slate-700 rounded p-1 focus:outline-none resize-none"
                                        />
                                      </div>

                                      <div className="w-0.5 h-3 bg-slate-400" />

                                      <div className="bg-orange-50 dark:bg-slate-800 border border-orange-300 dark:border-orange-700 rounded-lg p-1.5 w-full text-center shadow-2xs">
                                        <span className="text-[8px] font-black uppercase text-[#c2410c] dark:text-[#fdba74] block mb-0.5">
                                          Besoin {k + 1}
                                        </span>
                                        <textarea
                                          rows={2}
                                          value={besoins[k] || ''}
                                          onChange={e =>
                                            updateGarData(g => {
                                              const arr = ensureArray(
                                                g.problems.branches[i].details[j].besoin
                                              );
                                              arr[k] = e.target.value;
                                              g.problems.branches[i].details[j].besoin =
                                                arr;
                                            })
                                          }
                                          className="w-full bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-[9.5px] font-medium text-center border border-orange-200 dark:border-slate-700 rounded p-1 focus:outline-none resize-none"
                                        />
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        ))}

      {/* =====================================================================
          2. ONGLET : ARBRE À SOLUTIONS ('solutions')
      ===================================================================== */}
      {activeTab === 'solutions' &&
        (treeViewMode === 'list' ? (
          <div className="space-y-3">
            {/* Impact Positif Global */}
            <div className="bg-gradient-to-r from-[#c2410c] via-[#9a3412] to-[#9a3412] text-white rounded-xl p-3.5 border-2 border-[#fdba74]/60 shadow-sm">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-black uppercase tracking-widest text-[#fdba74]">
                  {isEn ? 'Global Positive Impact' : 'Impact Positif Global'}
                </span>
                <button
                  type="button"
                  onClick={handleAddAxe}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#ea580c] hover:bg-orange-500 text-white text-[10px] font-black cursor-pointer"
                >
                  <Plus size={12} /> {isEn ? 'Add Axis' : 'Ajouter Axe'}
                </button>
              </div>
              <textarea
                rows={2}
                value={garData.rendement?.impact || ''}
                onChange={e =>
                  updateGarData(g => {
                    g.rendement.impact = e.target.value;
                  })
                }
                className="w-full rounded-lg bg-slate-950/40 border border-[#fdba74]/50 text-white p-2 text-xs font-bold focus:outline-none"
              />
            </div>

            {(garData.rendement?.axes || []).map((axe, i) => {
              if (!isAxeVisible(i)) return null;
              return (
                <div
                  key={i}
                  className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 border-l-4 border-l-emerald-600 p-3.5 shadow-xs space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
                    <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                      <span className="px-2 py-0.5 rounded bg-[#c2410c] text-white text-[10px] font-black uppercase">
                        Axe {i + 1}
                      </span>
                      <input
                        type="text"
                        value={axe.nom || ''}
                        onChange={e =>
                          updateGarData(g => {
                            g.rendement.axes[i].nom = e.target.value;
                            if (g.problems.branches[i]) {
                              g.problems.branches[i].axeName = e.target.value;
                            }
                          })
                        }
                        className="flex-1 bg-orange-50/70 dark:bg-slate-800 border border-orange-200 dark:border-slate-700 rounded-lg px-2.5 py-1 text-xs font-black text-[#c2410c] dark:text-[#fdba74]"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => handleAddProject(i)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-orange-50 dark:bg-slate-800 text-[#c2410c] dark:text-[#fdba74] border border-[#ea580c]/40 text-[10px] font-black cursor-pointer"
                    >
                      <Plus size={12} /> {isEn ? 'Add Output' : 'Ajouter Extrant'}
                    </button>
                  </div>

                  <div>
                    <label className="text-[10px] font-black uppercase text-emerald-700 dark:text-emerald-400 block mb-1">
                      {isEn ? 'Expected Outcome (Effet)' : 'Effet Attendu de l’Axe'}
                    </label>
                    <textarea
                      rows={2}
                      value={axe.effet || ''}
                      onChange={e =>
                        updateGarData(g => {
                          g.rendement.axes[i].effet = e.target.value;
                        })
                      }
                      className="w-full rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 p-2 text-xs font-bold text-slate-900 dark:text-white"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {(axe.projets || []).map((proj, j) => {
                      if (!isProjVisible(i, j)) return null;
                      const acts = ensureArray(proj.activites);
                      return (
                        <div
                          key={j}
                          className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 p-3 space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-black uppercase text-[#ea580c] dark:text-[#fdba74]">
                              Extrant {j + 1} (Projet {j + 1})
                            </span>
                            <span className="text-[10px] font-mono font-black text-emerald-700 dark:text-emerald-400">
                              {formatCurrency(
                                getGarProjectEffectiveCostFCFA(proj),
                                currency,
                                language
                              )}
                            </span>
                          </div>
                          <textarea
                            rows={2}
                            value={proj.extrant || ''}
                            onChange={e =>
                              updateGarData(g => {
                                g.rendement.axes[i].projets[j].extrant =
                                  e.target.value;
                              })
                            }
                            className="w-full rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 p-1.5 text-xs font-bold text-slate-900 dark:text-white"
                          />
                          {acts.map((act, k) => (
                            <div
                              key={k}
                              className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 space-y-2"
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-[9px] font-black uppercase text-[#c2410c] dark:text-[#fdba74]">
                                  Activité {k + 1}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveCauseActivity(i, j, k)}
                                  className="text-rose-500 hover:text-rose-700 cursor-pointer"
                                >
                                  <X size={11} />
                                </button>
                              </div>
                              <textarea
                                rows={2}
                                value={act || ''}
                                onChange={e =>
                                  updateGarData(g => {
                                    const a = ensureArray(
                                      g.rendement.axes[i].projets[j].activites
                                    );
                                    a[k] = e.target.value;
                                    g.rendement.axes[i].projets[j].activites = a;
                                  })
                                }
                                className="w-full rounded bg-orange-50/50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-1.5 text-[11px] text-slate-900 dark:text-white"
                              />
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <div>
                                  <span className="text-[8.5px] font-black uppercase text-slate-500 block mb-1">
                                    Intrants RH
                                  </span>
                                  <EditableResourceList
                                    items={getSafe2D(proj.intrants_rh, k)}
                                    onChange={v =>
                                      updateIntrants(i, j, k, 'intrants_rh', v)
                                    }
                                    placeholderLabel="Ressource RH..."
                                    currency={currency}
                                    language={language}
                                  />
                                </div>
                                <div>
                                  <span className="text-[8.5px] font-black uppercase text-slate-500 block mb-1">
                                    Intrants Matériels
                                  </span>
                                  <EditableResourceList
                                    items={getSafe2D(proj.intrants_mat, k)}
                                    onChange={v =>
                                      updateIntrants(i, j, k, 'intrants_mat', v)
                                    }
                                    placeholderLabel="Matériel..."
                                    currency={currency}
                                    language={language}
                                  />
                                </div>
                              </div>
                            </div>
                          ))}
                          <button
                            type="button"
                            onClick={() => handleAddCauseActivity(i, j)}
                            className="w-full py-1 rounded-lg border border-dashed border-[#ea580c] text-[#c2410c] dark:text-[#fdba74] text-[10px] font-black uppercase hover:bg-orange-50 dark:hover:bg-slate-800 cursor-pointer"
                          >
                            + Ajouter Activité & Intrants
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* TREE VIEW FOR ARBRE À SOLUTIONS */
          <div className="bg-slate-100/80 dark:bg-slate-900/90 rounded-xl border border-slate-200 dark:border-slate-800 overflow-auto max-h-[76vh] p-4 shadow-inner">
            <div
              className="min-w-max flex justify-center pb-8 transition-transform duration-150"
              style={{
                transform: `scale(${treeZoom})`,
                transformOrigin: 'top center'
              }}
            >
              <div className="flex flex-col items-center">
                {/* RACINE : IMPACT POSITIF GLOBAL */}
                <div className="bg-gradient-to-r from-[#c2410c] to-[#9a3412] text-white p-3 rounded-xl shadow-lg border-2 border-[#fdba74] w-[300px] sm:w-[340px] text-center z-10 relative">
                  <h4 className="text-[9.5px] uppercase font-black mb-1 text-[#fdba74] tracking-wider">
                    Impact Positif Global
                  </h4>
                  <textarea
                    rows={2}
                    value={garData.rendement?.impact || ''}
                    onChange={e =>
                      updateGarData(g => {
                        g.rendement.impact = e.target.value;
                      })
                    }
                    className="w-full bg-slate-950/50 text-white text-[11px] font-bold text-center border border-[#fdba74]/50 rounded-lg p-1.5 focus:outline-none resize-none"
                  />
                </div>

                <div className="flex flex-col items-center">
                  <div className="w-0.5 h-3.5 bg-[#ea580c]" />
                  <button
                    type="button"
                    onClick={handleAddAxe}
                    className="bg-[#c2410c] hover:bg-[#ea580c] text-white rounded-full p-1.5 shadow-md border border-[#fdba74] cursor-pointer z-20"
                  >
                    <Plus size={13} />
                  </button>
                  {(garData.rendement?.axes || []).length > 0 && (
                    <div className="w-0.5 h-3.5 bg-[#ea580c]" />
                  )}
                </div>

                {/* AXES / EFFETS */}
                <div className="flex justify-center relative">
                  {(garData.rendement?.axes || []).map((axe, i) => {
                    if (!isAxeVisible(i)) return null;
                    const axes = garData.rendement.axes || [];
                    const isOnlyAxe = axes.length === 1;
                    return (
                      <div
                        key={i}
                        className="flex flex-col items-center relative px-2"
                      >
                        {isOnlyAxe ? (
                          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-0.5 h-5 bg-[#ea580c]" />
                        ) : (
                          <>
                            {i !== 0 && (
                              <div className="absolute top-0 left-0 w-1/2 h-0.5 bg-[#ea580c]" />
                            )}
                            {i !== axes.length - 1 && (
                              <div className="absolute top-0 right-0 w-1/2 h-0.5 bg-[#ea580c]" />
                            )}
                            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-0.5 h-5 bg-[#ea580c]" />
                          </>
                        )}

                        <div className="bg-orange-50 dark:bg-slate-800 text-slate-900 dark:text-white p-2.5 rounded-xl shadow-sm border-2 border-[#ea580c] w-[260px] sm:w-[280px] text-center z-10 relative mt-5">
                          <div className="flex justify-between items-center mb-1 gap-1">
                            <input
                              type="text"
                              value={axe.nom || ''}
                              onChange={e =>
                                updateGarData(g => {
                                  g.rendement.axes[i].nom = e.target.value;
                                  if (g.problems.branches[i]) {
                                    g.problems.branches[i].axeName = e.target.value;
                                  }
                                })
                              }
                              className="flex-1 bg-white dark:bg-slate-900 border border-orange-300 dark:border-slate-700 rounded px-1.5 py-0.5 text-[9.5px] font-black uppercase text-[#c2410c] dark:text-[#fdba74]"
                            />
                            <button
                              type="button"
                              onClick={() => handleDeleteAxe(i)}
                              className="text-rose-500 hover:text-rose-700 p-0.5 cursor-pointer"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                          <span className="text-[8.5px] uppercase font-black text-emerald-700 dark:text-emerald-400 block mb-0.5">
                            Effet Attendu (Outcome)
                          </span>
                          <textarea
                            rows={2}
                            value={axe.effet || ''}
                            onChange={e =>
                              updateGarData(g => {
                                g.rendement.axes[i].effet = e.target.value;
                              })
                            }
                            className="w-full bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-[10.5px] font-bold text-center border border-orange-200 dark:border-slate-700 rounded p-1 focus:outline-none resize-none"
                          />
                        </div>

                        <div className="flex flex-col items-center">
                          <div className="w-0.5 h-3 bg-slate-400" />
                          <button
                            type="button"
                            onClick={() => handleAddProject(i)}
                            className="bg-[#ea580c] hover:bg-[#c2410c] text-white rounded-full p-1 shadow-xs cursor-pointer"
                          >
                            <Plus size={11} />
                          </button>
                          {(axe.projets || []).length > 0 && (
                            <div className="w-0.5 h-3 bg-slate-400" />
                          )}
                        </div>

                        {/* EXTRANTS & ACTIVITÉS */}
                        <div className="flex justify-center relative">
                          {(axe.projets || []).map((proj, j) => {
                            if (!isProjVisible(i, j)) return null;
                            const projs = axe.projets || [];
                            const isOnlyProj = projs.length === 1;
                            const acts = ensureArray(proj.activites);

                            return (
                              <div
                                key={j}
                                className="flex flex-col items-center relative px-1.5"
                              >
                                {isOnlyProj ? (
                                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-0.5 h-4 bg-slate-400" />
                                ) : (
                                  <>
                                    {j !== 0 && (
                                      <div className="absolute top-0 left-0 w-1/2 h-0.5 bg-slate-400" />
                                    )}
                                    {j !== projs.length - 1 && (
                                      <div className="absolute top-0 right-0 w-1/2 h-0.5 bg-slate-400" />
                                    )}
                                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-0.5 h-4 bg-slate-400" />
                                  </>
                                )}

                                <div className="bg-white dark:bg-slate-900 p-2 rounded-xl shadow-xs border-2 border-emerald-600 w-[220px] text-center z-10 relative mt-4">
                                  <div className="flex justify-between items-center mb-1">
                                    <span className="text-[8.5px] uppercase font-black text-emerald-700 dark:text-emerald-400">
                                      Extrant {j + 1} (Projet {j + 1})
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteProject(i, j)}
                                      className="text-rose-500 hover:text-rose-700 cursor-pointer"
                                    >
                                      <Trash2 size={11} />
                                    </button>
                                  </div>
                                  <textarea
                                    rows={2}
                                    value={proj.extrant || ''}
                                    onChange={e =>
                                      updateGarData(g => {
                                        g.rendement.axes[i].projets[j].extrant =
                                          e.target.value;
                                      })
                                    }
                                    className="w-full bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-[10px] font-bold text-center border border-slate-300 dark:border-slate-700 rounded p-1 focus:outline-none resize-none"
                                  />
                                </div>

                                <div className="flex flex-col items-center">
                                  <div className="w-0.5 h-2.5 bg-slate-400" />
                                  <button
                                    type="button"
                                    onClick={() => handleAddCauseActivity(i, j)}
                                    className="bg-slate-700 hover:bg-[#c2410c] text-white rounded-full p-0.5 shadow-2xs cursor-pointer"
                                  >
                                    <Plus size={10} />
                                  </button>
                                  <div className="w-0.5 h-2.5 bg-slate-400" />
                                </div>

                                <div className="flex justify-center gap-2">
                                  {acts.map((act, k) => (
                                    <div
                                      key={k}
                                      className="flex flex-col items-center w-[210px]"
                                    >
                                      <div className="bg-orange-50 dark:bg-slate-800 border border-[#ea580c] rounded-lg p-1.5 w-full text-center shadow-2xs">
                                        <div className="flex justify-between items-center mb-0.5">
                                          <span className="text-[8px] font-black uppercase text-[#c2410c] dark:text-[#fdba74]">
                                            Activité {k + 1}
                                          </span>
                                          <button
                                            type="button"
                                            onClick={() =>
                                              handleRemoveCauseActivity(i, j, k)
                                            }
                                            className="text-rose-500 hover:text-rose-700 cursor-pointer"
                                          >
                                            <X size={10} />
                                          </button>
                                        </div>
                                        <textarea
                                          rows={2}
                                          value={act || ''}
                                          onChange={e =>
                                            updateGarData(g => {
                                              const a = ensureArray(
                                                g.rendement.axes[i].projets[j]
                                                  .activites
                                              );
                                              a[k] = e.target.value;
                                              g.rendement.axes[i].projets[
                                                j
                                              ].activites = a;
                                            })
                                          }
                                          className="w-full bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-[9.5px] font-medium text-center border border-orange-200 dark:border-slate-700 rounded p-1 focus:outline-none resize-none"
                                        />
                                      </div>

                                      <div className="w-0.5 h-2.5 bg-slate-400" />

                                      {/* Intrants RH & Matériel */}
                                      <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg p-2 w-full space-y-2 shadow-2xs text-left">
                                        <div>
                                          <span className="text-[8px] font-black uppercase text-[#c2410c] dark:text-[#fdba74] block mb-0.5">
                                            Intrants Humains (RH)
                                          </span>
                                          <EditableResourceList
                                            items={getSafe2D(proj.intrants_rh, k)}
                                            onChange={v =>
                                              updateIntrants(
                                                i,
                                                j,
                                                k,
                                                'intrants_rh',
                                                v
                                              )
                                            }
                                            currency={currency}
                                            language={language}
                                          />
                                        </div>
                                        <div className="border-t border-slate-200 dark:border-slate-800 pt-1.5">
                                          <span className="text-[8px] font-black uppercase text-[#ea580c] dark:text-orange-400 block mb-0.5">
                                            Intrants Matériels
                                          </span>
                                          <EditableResourceList
                                            items={getSafe2D(proj.intrants_mat, k)}
                                            onChange={v =>
                                              updateIntrants(
                                                i,
                                                j,
                                                k,
                                                'intrants_mat',
                                                v
                                              )
                                            }
                                            currency={currency}
                                            language={language}
                                          />
                                        </div>
                                        {renderActivityCostBadge(proj, k)}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        ))}

      {/* =====================================================================
          3. ONGLET : REGISTRE PARTIES PRENANTES ('registre_parties')
      ===================================================================== */}
      {activeTab === 'registre_parties' && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
          <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] font-black uppercase tracking-wider text-[#c2410c] dark:text-[#fdba74]">
              {isEn
                ? 'Synoptic Register by Axis & Project'
                : 'Registre Synoptique par Axe Stratégique & Projet'}
            </span>
            <button
              type="button"
              onClick={() => onNavigateTab('parties')}
              className="px-3 py-1 rounded-lg bg-[#c2410c] hover:bg-[#ea580c] text-white text-[10.5px] font-black cursor-pointer"
            >
              {isEn
                ? 'Edit in Stakeholder Analysis →'
                : 'Éditer dans Analyse Parties Prenantes →'}
            </button>
          </div>
          <div className="overflow-x-auto max-h-[75vh]">
            <table className="w-full compact-table border-collapse min-w-[760px]">
              <thead className="bg-[#c2410c] text-white">
                <tr>
                  <th className="border-r border-orange-800 text-left w-1/5">
                    1. Bénéficiaires
                  </th>
                  <th className="border-r border-orange-800 text-left w-1/5">
                    2. Interne à l’Institution
                  </th>
                  <th className="border-r border-orange-800 text-left w-1/5">
                    3. Externe à l’Institution
                  </th>
                  <th className="border-r border-orange-800 text-left w-1/5">
                    4. Partenaires Techniques
                  </th>
                  <th className="text-left w-1/5">5. Partenaires Financiers</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {(garData.rendement?.axes || []).map((axe, i) => {
                  if (!isAxeVisible(i)) return null;
                  const axeNum = i + 1;
                  return (
                    <React.Fragment key={i}>
                      <AxeHeaderRow axeName={axe.nom} colSpan={5} />
                      {(axe.projets || []).map((proj, pIdx) => {
                        if (!isProjVisible(i, pIdx)) return null;
                        const sh = garData.stakeholders;
                        const benefs = (sh.beneficiaires || []).filter(
                          b => b.axe === axeNum && b.projetIndex === pIdx
                        );
                        const internes = (sh.instCentralises || []).filter(
                          b => b.axe === axeNum && b.projetIndex === pIdx
                        );
                        const externes = (sh.instDecentralises || []).filter(
                          b => b.axe === axeNum && b.projetIndex === pIdx
                        );
                        const techs = (sh.operateursTechniques || []).filter(
                          b => b.axe === axeNum && b.projetIndex === pIdx
                        );
                        const ptfs = (sh.ptf || []).filter(
                          b => b.axe === axeNum && b.projetIndex === pIdx
                        );
                        const maxRows = Math.max(
                          benefs.length,
                          internes.length,
                          externes.length,
                          techs.length,
                          ptfs.length,
                          1
                        );

                        return (
                          <React.Fragment key={pIdx}>
                            <ProjHeaderRow
                              projName={proj.extrant}
                              pIdx={pIdx}
                              colSpan={5}
                            />
                            {Array.from({ length: maxRows }).map((_, rIdx) => (
                              <tr
                                key={rIdx}
                                className="bg-white dark:bg-slate-900 hover:bg-orange-50/40 dark:hover:bg-slate-800/50"
                              >
                                <td className="border-r border-slate-200 dark:border-slate-800 align-top font-semibold text-slate-900 dark:text-white">
                                  {benefs[rIdx]?.nom || '-'}
                                </td>
                                <td className="border-r border-slate-200 dark:border-slate-800 align-top font-semibold text-[#c2410c] dark:text-[#fdba74]">
                                  {internes[rIdx]?.nom || '-'}
                                </td>
                                <td className="border-r border-slate-200 dark:border-slate-800 align-top font-semibold text-slate-800 dark:text-slate-200">
                                  {externes[rIdx]?.nom || '-'}
                                </td>
                                <td className="border-r border-slate-200 dark:border-slate-800 align-top font-semibold text-slate-800 dark:text-slate-200">
                                  {techs[rIdx]?.nom || '-'}
                                </td>
                                <td className="align-top font-semibold text-emerald-700 dark:text-emerald-400">
                                  {ptfs[rIdx]?.nom || '-'}
                                </td>
                              </tr>
                            ))}
                          </React.Fragment>
                        );
                      })}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =====================================================================
          4. ONGLET : ANALYSE DES PROBLÈMES ('terrain')
      ===================================================================== */}
      {activeTab === 'terrain' && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
          <div className="overflow-x-auto max-h-[76vh]">
            <table className="w-full compact-table border-collapse min-w-[860px]">
              <thead className="bg-[#c2410c] text-white">
                <tr>
                  <th className="border-r border-orange-800 text-left w-[16%]">
                    Problème Central
                  </th>
                  <th className="border-r border-orange-800 text-left w-[16%]">
                    Contrainte
                  </th>
                  <th className="border-r border-orange-800 text-left w-[18%]">
                    Causes Profondes
                  </th>
                  <th className="border-r border-orange-800 text-left w-[18%]">
                    Besoins Identifiés
                  </th>
                  <th className="border-r border-orange-800 text-left w-[14%]">
                    Acteurs (Int. / Ext.)
                  </th>
                  <th className="text-left w-[18%]">
                    Solutions Retenues (Activités)
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {(garData.problems?.branches || []).map((branch, i) => {
                  if (!isAxeVisible(i)) return null;
                  const axeObj = garData.rendement?.axes?.[i] || {
                    nom: branch.axeName,
                    projets: []
                  };
                  return (
                    <React.Fragment key={i}>
                      <AxeHeaderRow
                        axeName={axeObj.nom || branch.axeName}
                        colSpan={6}
                      />
                      {(branch.details || []).map((detail, j) => {
                        if (!isProjVisible(i, j)) return null;
                        const projObj = axeObj.projets?.[j] || {
                          extrant: '',
                          activites: [''],
                          responsable: ''
                        };
                        const causes = ensureArray(detail.cause);
                        const besoins = ensureArray(detail.besoin);
                        const acts = ensureArray(projObj.activites);
                        const rowCount = Math.max(
                          causes.length,
                          besoins.length,
                          acts.length,
                          1
                        );
                        const availActors = getAvailableActorsForProject(i + 1, j);

                        return (
                          <React.Fragment key={j}>
                            <ProjHeaderRow
                              projName={projObj.extrant}
                              pIdx={j}
                              colSpan={6}
                            />
                            <tr className="bg-white dark:bg-slate-900">
                              <td className="border-r border-slate-200 dark:border-slate-800 align-top font-bold bg-orange-50/40 dark:bg-slate-800/40">
                                <EditableCell
                                  type="textarea"
                                  value={branch.central}
                                  onChange={v =>
                                    updateGarData(g => {
                                      g.problems.branches[i].central = v;
                                    })
                                  }
                                />
                              </td>
                              <td className="border-r border-slate-200 dark:border-slate-800 align-top font-bold">
                                <EditableCell
                                  type="textarea"
                                  value={detail.contrainte}
                                  onChange={v =>
                                    updateGarData(g => {
                                      g.problems.branches[i].details[j].contrainte =
                                        v;
                                    })
                                  }
                                />
                              </td>
                              <td className="border-r border-slate-200 dark:border-slate-800 p-0 align-top">
                                {Array.from({ length: rowCount }).map((_, k) => (
                                  <div
                                    key={k}
                                    className={`p-1.5 ${
                                      k > 0
                                        ? 'border-t border-slate-200 dark:border-slate-800'
                                        : ''
                                    }`}
                                  >
                                    <span className="text-[8.5px] font-black uppercase text-amber-700 dark:text-amber-400 block mb-0.5">
                                      Cause {k + 1}
                                    </span>
                                    <EditableCell
                                      type="textarea"
                                      value={causes[k] || ''}
                                      onChange={v =>
                                        updateGarData(g => {
                                          const arr = ensureArray(
                                            g.problems.branches[i].details[j].cause
                                          );
                                          arr[k] = v;
                                          g.problems.branches[i].details[j].cause =
                                            arr;
                                        })
                                      }
                                    />
                                  </div>
                                ))}
                              </td>
                              <td className="border-r border-slate-200 dark:border-slate-800 p-0 align-top">
                                {Array.from({ length: rowCount }).map((_, k) => (
                                  <div
                                    key={k}
                                    className={`p-1.5 ${
                                      k > 0
                                        ? 'border-t border-slate-200 dark:border-slate-800'
                                        : ''
                                    }`}
                                  >
                                    <span className="text-[8.5px] font-black uppercase text-[#ea580c] dark:text-[#fdba74] block mb-0.5">
                                      Besoin {k + 1}
                                    </span>
                                    <EditableCell
                                      type="textarea"
                                      value={besoins[k] || ''}
                                      onChange={v =>
                                        updateGarData(g => {
                                          const arr = ensureArray(
                                            g.problems.branches[i].details[j].besoin
                                          );
                                          arr[k] = v;
                                          g.problems.branches[i].details[j].besoin =
                                            arr;
                                        })
                                      }
                                    />
                                  </div>
                                ))}
                              </td>
                              <td className="border-r border-slate-200 dark:border-slate-800 align-top">
                                <select
                                  value={projObj.responsable || ''}
                                  onChange={e =>
                                    updateGarData(g => {
                                      if (g.rendement.axes[i]?.projets?.[j]) {
                                        g.rendement.axes[i].projets[j].responsable =
                                          e.target.value;
                                      }
                                    })
                                  }
                                  className="w-full bg-orange-50 dark:bg-slate-800 border border-orange-200 dark:border-slate-700 rounded-lg p-1.5 text-[10px] font-bold text-slate-900 dark:text-white"
                                >
                                  <option value="">-- Sélectionner Acteur --</option>
                                  {availActors.map((act, idx) => (
                                    <option key={idx} value={act}>
                                      {act}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td className="p-0 align-top">
                                {Array.from({ length: rowCount }).map((_, k) => (
                                  <div
                                    key={k}
                                    className={`p-1.5 ${
                                      k > 0
                                        ? 'border-t border-slate-200 dark:border-slate-800'
                                        : ''
                                    }`}
                                  >
                                    <span className="text-[8.5px] font-black uppercase text-emerald-700 dark:text-emerald-400 block mb-0.5">
                                      Activité {k + 1}
                                    </span>
                                    <EditableCell
                                      type="textarea"
                                      value={acts[k] || ''}
                                      onChange={v =>
                                        updateGarData(g => {
                                          const arr = ensureArray(
                                            g.rendement.axes[i].projets[j].activites
                                          );
                                          arr[k] = v;
                                          g.rendement.axes[i].projets[j].activites =
                                            arr;
                                        })
                                      }
                                    />
                                  </div>
                                ))}
                              </td>
                            </tr>
                          </React.Fragment>
                        );
                      })}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =====================================================================
          5. ONGLET : ANALYSE PARTIES PRENANTES ('parties')
      ===================================================================== */}
      {activeTab === 'parties' && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
          <div className="overflow-x-auto max-h-[75vh]">
            {(() => {
              const key = getStakeholderKey(activePartiesSubTab);
              const isBenef = activePartiesSubTab === 'Bénéficiaires';
              const isPartner =
                activePartiesSubTab === 'Partenaires Techniques' ||
                activePartiesSubTab === 'Partenaires Financiers';
              const colSpan = isBenef ? 7 : isPartner ? 7 : 8;

              return (
                <table className="w-full compact-table border-collapse min-w-[820px]">
                  <thead className="bg-[#c2410c] text-white">
                    <tr>
                      <th className="border-r border-orange-800 text-left">
                        {isBenef
                          ? 'Bénéficiaires'
                          : isPartner
                          ? 'Partenaire / Organisation'
                          : 'Acteur / Institution'}
                      </th>
                      {!isBenef && (
                        <th className="border-r border-orange-800 text-left">
                          Domaine d’Intervention
                        </th>
                      )}
                      {!isBenef && !isPartner && (
                        <th className="border-r border-orange-800 text-left">
                          Compétence / Mandat
                        </th>
                      )}
                      <th className="border-r border-orange-800 text-left">
                        Attentes
                      </th>
                      <th className="border-r border-orange-800 text-left">
                        Contraintes
                      </th>
                      <th className="border-r border-orange-800 text-left">
                        Points Forts
                      </th>
                      <th className="border-r border-orange-800 text-left">
                        Points Faibles
                      </th>
                      <th className="border-r border-orange-800 text-left">
                        Problèmes / Enjeux
                      </th>
                      <th className="text-center w-12">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {(garData.rendement?.axes || []).map((axe, i) => {
                      if (!isAxeVisible(i)) return null;
                      const axeNum = i + 1;
                      return (
                        <React.Fragment key={i}>
                          <AxeHeaderRow axeName={axe.nom} colSpan={colSpan} />
                          {(axe.projets || []).map((proj, pIdx) => {
                            if (!isProjVisible(i, pIdx)) return null;
                            const fullList = garData.stakeholders[key] || [];
                            const indexedItems = fullList
                              .map((item, absIdx) => ({ item, absIdx }))
                              .filter(
                                x =>
                                  x.item.axe === axeNum &&
                                  x.item.projetIndex === pIdx
                              );

                            return (
                              <React.Fragment key={pIdx}>
                                <ProjHeaderRow
                                  projName={proj.extrant}
                                  pIdx={pIdx}
                                  colSpan={colSpan}
                                />
                                {indexedItems.map(({ item, absIdx }) => (
                                  <tr
                                    key={absIdx}
                                    className="bg-white dark:bg-slate-900"
                                  >
                                    <td className="border-r border-slate-200 dark:border-slate-800 align-top font-bold">
                                      <EditableCell
                                        type="textarea"
                                        value={item.nom}
                                        onChange={v =>
                                          updateStakeholder(key, absIdx, 'nom', v)
                                        }
                                      />
                                    </td>
                                    {!isBenef && (
                                      <td className="border-r border-slate-200 dark:border-slate-800 align-top">
                                        <EditableCell
                                          type="textarea"
                                          value={item.intervention}
                                          onChange={v =>
                                            updateStakeholder(
                                              key,
                                              absIdx,
                                              'intervention',
                                              v
                                            )
                                          }
                                        />
                                      </td>
                                    )}
                                    {!isBenef && !isPartner && (
                                      <td className="border-r border-slate-200 dark:border-slate-800 align-top">
                                        <EditableCell
                                          type="textarea"
                                          value={item.competence}
                                          onChange={v =>
                                            updateStakeholder(
                                              key,
                                              absIdx,
                                              'competence',
                                              v
                                            )
                                          }
                                        />
                                      </td>
                                    )}
                                    <td className="border-r border-slate-200 dark:border-slate-800 align-top">
                                      <EditableCell
                                        type="textarea"
                                        value={item.attentes}
                                        onChange={v =>
                                          updateStakeholder(
                                            key,
                                            absIdx,
                                            'attentes',
                                            v
                                          )
                                        }
                                      />
                                    </td>
                                    <td className="border-r border-slate-200 dark:border-slate-800 align-top">
                                      <EditableCell
                                        type="textarea"
                                        value={item.contraintes}
                                        onChange={v =>
                                          updateStakeholder(
                                            key,
                                            absIdx,
                                            'contraintes',
                                            v
                                          )
                                        }
                                      />
                                    </td>
                                    <td className="border-r border-slate-200 dark:border-slate-800 align-top">
                                      <EditableCell
                                        type="textarea"
                                        value={item.pointFort}
                                        onChange={v =>
                                          updateStakeholder(
                                            key,
                                            absIdx,
                                            'pointFort',
                                            v
                                          )
                                        }
                                      />
                                    </td>
                                    <td className="border-r border-slate-200 dark:border-slate-800 align-top">
                                      <EditableCell
                                        type="textarea"
                                        value={item.pointFaible}
                                        onChange={v =>
                                          updateStakeholder(
                                            key,
                                            absIdx,
                                            'pointFaible',
                                            v
                                          )
                                        }
                                      />
                                    </td>
                                    <td className="border-r border-slate-200 dark:border-slate-800 align-top">
                                      <EditableCell
                                        type="textarea"
                                        value={item.problemes}
                                        onChange={v =>
                                          updateStakeholder(
                                            key,
                                            absIdx,
                                            'problemes',
                                            v
                                          )
                                        }
                                      />
                                    </td>
                                    <td className="text-center align-middle">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          deleteStakeholder(key, absIdx)
                                        }
                                        className="p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg cursor-pointer"
                                      >
                                        <Trash2 size={13} />
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                                <tr className="bg-slate-50/70 dark:bg-slate-800/40">
                                  <td colSpan={colSpan} className="p-1.5">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        addStakeholder(key, axeNum, pIdx)
                                      }
                                      className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-orange-50 dark:bg-slate-800 hover:bg-orange-100 text-[#c2410c] dark:text-[#fdba74] border border-[#ea580c]/40 text-[10px] font-black uppercase cursor-pointer"
                                    >
                                      <Plus size={12} /> Ajouter dans{' '}
                                      {activePartiesSubTab} (Projet {pIdx + 1})
                                    </button>
                                  </td>
                                </tr>
                              </React.Fragment>
                            );
                          })}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              );
            })()}
          </div>
        </div>
      )}

      {/* =====================================================================
          6. ONGLET : CADRE DE RENDEMENT ('rendement')
      ===================================================================== */}
      {activeTab === 'rendement' && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
          <div className="overflow-x-auto max-h-[76vh]">
            <table className="w-full compact-table border-collapse min-w-[900px]">
              <thead className="bg-[#c2410c] text-white">
                <tr>
                  <th className="border-r border-orange-800 text-left w-[14%]">
                    Impact Positif Global
                  </th>
                  <th className="border-r border-orange-800 text-left w-[14%]">
                    Effet Attendu (Axe)
                  </th>
                  <th className="border-r border-orange-800 text-left w-[14%]">
                    Extrant (Projet)
                  </th>
                  <th className="border-r border-orange-800 text-left w-[18%]">
                    Activités Opérationnelles
                  </th>
                  <th className="border-r border-orange-800 text-left w-[15%]">
                    Intrants Humains (RH)
                  </th>
                  <th className="border-r border-orange-800 text-left w-[15%]">
                    Intrants Matériels
                  </th>
                  <th className="text-center w-[10%]">
                    Coût ({currency})
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {(garData.rendement?.axes || []).map((axe, i) => {
                  if (!isAxeVisible(i)) return null;
                  return (
                    <React.Fragment key={i}>
                      <AxeHeaderRow axeName={axe.nom} colSpan={7} />
                      {(axe.projets || []).map((proj, pIdx) => {
                        if (!isProjVisible(i, pIdx)) return null;
                        const acts = ensureArray(proj.activites);
                        return (
                          <React.Fragment key={pIdx}>
                            <ProjHeaderRow
                              projName={proj.extrant}
                              pIdx={pIdx}
                              colSpan={7}
                            />
                            <tr className="bg-white dark:bg-slate-900">
                              <td className="border-r border-slate-200 dark:border-slate-800 align-top font-bold bg-orange-50/40 dark:bg-slate-800/40">
                                <EditableCell
                                  type="textarea"
                                  value={garData.rendement.impact}
                                  onChange={v =>
                                    updateGarData(g => {
                                      g.rendement.impact = v;
                                    })
                                  }
                                />
                              </td>
                              <td className="border-r border-slate-200 dark:border-slate-800 align-top font-bold">
                                <EditableCell
                                  type="textarea"
                                  value={axe.effet}
                                  onChange={v =>
                                    updateGarData(g => {
                                      g.rendement.axes[i].effet = v;
                                    })
                                  }
                                />
                              </td>
                              <td className="border-r border-slate-200 dark:border-slate-800 align-top font-bold text-[#c2410c] dark:text-[#fdba74]">
                                <EditableCell
                                  type="textarea"
                                  value={proj.extrant}
                                  onChange={v =>
                                    updateGarData(g => {
                                      g.rendement.axes[i].projets[pIdx].extrant =
                                        v;
                                    })
                                  }
                                />
                              </td>
                              <td className="border-r border-slate-200 dark:border-slate-800 p-0 align-top">
                                {acts.map((act, k) => (
                                  <div
                                    key={k}
                                    className={`p-1.5 ${
                                      k > 0
                                        ? 'border-t border-slate-200 dark:border-slate-800'
                                        : ''
                                    }`}
                                  >
                                    <span className="text-[8.5px] font-black uppercase text-[#c2410c] dark:text-[#fdba74] block mb-0.5">
                                      Activité {k + 1}
                                    </span>
                                    <EditableCell
                                      type="textarea"
                                      value={act}
                                      onChange={v =>
                                        updateGarData(g => {
                                          const arr = ensureArray(
                                            g.rendement.axes[i].projets[pIdx]
                                              .activites
                                          );
                                          arr[k] = v;
                                          g.rendement.axes[i].projets[
                                            pIdx
                                          ].activites = arr;
                                        })
                                      }
                                    />
                                  </div>
                                ))}
                              </td>
                              <td className="border-r border-slate-200 dark:border-slate-800 p-0 align-top">
                                {acts.map((_, k) => (
                                  <div
                                    key={k}
                                    className={`p-1.5 ${
                                      k > 0
                                        ? 'border-t border-slate-200 dark:border-slate-800'
                                        : ''
                                    }`}
                                  >
                                    <EditableResourceList
                                      items={getSafe2D(proj.intrants_rh, k)}
                                      onChange={v =>
                                        updateIntrants(
                                          i,
                                          pIdx,
                                          k,
                                          'intrants_rh',
                                          v
                                        )
                                      }
                                      currency={currency}
                                      language={language}
                                    />
                                  </div>
                                ))}
                              </td>
                              <td className="border-r border-slate-200 dark:border-slate-800 p-0 align-top">
                                {acts.map((_, k) => (
                                  <div
                                    key={k}
                                    className={`p-1.5 ${
                                      k > 0
                                        ? 'border-t border-slate-200 dark:border-slate-800'
                                        : ''
                                    }`}
                                  >
                                    <EditableResourceList
                                      items={getSafe2D(proj.intrants_mat, k)}
                                      onChange={v =>
                                        updateIntrants(
                                          i,
                                          pIdx,
                                          k,
                                          'intrants_mat',
                                          v
                                        )
                                      }
                                      currency={currency}
                                      language={language}
                                    />
                                  </div>
                                ))}
                              </td>
                              <td className="p-0 align-top">
                                {acts.map((_, k) => (
                                  <div
                                    key={k}
                                    className={`p-1.5 ${
                                      k > 0
                                        ? 'border-t border-slate-200 dark:border-slate-800'
                                        : ''
                                    }`}
                                  >
                                    {renderActivityCostBadge(proj, k)}
                                  </div>
                                ))}
                              </td>
                            </tr>
                          </React.Fragment>
                        );
                      })}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =====================================================================
          7. ONGLET : CADRE DE MESURE DU RENDEMENT ('cmr')
      ===================================================================== */}
      {activeTab === 'cmr' && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
          <div className="overflow-x-auto max-h-[76vh]">
            <table className="w-full compact-table border-collapse min-w-[900px]">
              <thead className="bg-[#c2410c] text-white">
                <tr>
                  <th className="border-r border-orange-800 text-left w-[11%]">
                    Niveau GAR
                  </th>
                  <th className="border-r border-orange-800 text-left w-[20%]">
                    Résultat Attendu
                  </th>
                  <th className="border-r border-orange-800 text-left w-[21%]">
                    Indicateur Clé (KPI)
                  </th>
                  <th className="border-r border-orange-800 text-center w-[7%]">
                    Réf.
                  </th>
                  <th className="border-r border-orange-800 text-center w-[7%]">
                    Cible
                  </th>
                  <th className="border-r border-orange-800 text-center w-[7%]">
                    Réal.
                  </th>
                  <th className="border-r border-orange-800 text-center w-[9%]">
                    Fréquence
                  </th>
                  <th className="border-r border-orange-800 text-left w-[10%]">
                    Source de Vérif.
                  </th>
                  <th className="text-left w-[8%]">Responsable</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {/* IMPACT GLOBAL ROW */}
                {(() => {
                  const impRow =
                    (garData.cmr || []).find(
                      c => c.niveau === 'IMPACT GLOBAL' || c.axe === 0
                    ) || ({} as Partial<GarCmrRow>);
                  return (
                    <tr className="bg-orange-50/80 dark:bg-slate-800/80 border-b-2 border-[#ea580c]">
                      <td className="border-r border-slate-200 dark:border-slate-700 font-black text-[#c2410c] dark:text-[#fdba74] uppercase">
                        IMPACT GLOBAL
                      </td>
                      <td className="border-r border-slate-200 dark:border-slate-700 font-bold">
                        {garData.rendement?.impact || '-'}
                      </td>
                      <td className="border-r border-slate-200 dark:border-slate-700">
                        <EditableCell
                          type="textarea"
                          value={impRow.indicateur}
                          onChange={v =>
                            updateCmr(0, 'IMPACT GLOBAL', 'indicateur', v)
                          }
                        />
                      </td>
                      <td className="border-r border-slate-200 dark:border-slate-700 text-center">
                        <EditableCell
                          value={impRow.ref}
                          onChange={v => updateCmr(0, 'IMPACT GLOBAL', 'ref', v)}
                        />
                      </td>
                      <td className="border-r border-slate-200 dark:border-slate-700 text-center">
                        <EditableCell
                          value={impRow.cible}
                          onChange={v =>
                            updateCmr(0, 'IMPACT GLOBAL', 'cible', v)
                          }
                        />
                      </td>
                      <td className="border-r border-slate-200 dark:border-slate-700 text-center">
                        <EditableCell
                          value={impRow.real}
                          onChange={v =>
                            updateCmr(0, 'IMPACT GLOBAL', 'real', v)
                          }
                        />
                      </td>
                      <td className="border-r border-slate-200 dark:border-slate-700 text-center">
                        <EditableCell
                          value={impRow.freq || 'Annuelle'}
                          onChange={v =>
                            updateCmr(0, 'IMPACT GLOBAL', 'freq', v)
                          }
                        />
                      </td>
                      <td className="border-r border-slate-200 dark:border-slate-700">
                        <EditableCell
                          value={impRow.source}
                          onChange={v =>
                            updateCmr(0, 'IMPACT GLOBAL', 'source', v)
                          }
                        />
                      </td>
                      <td>
                        <EditableCell
                          value={impRow.responsable}
                          onChange={v =>
                            updateCmr(0, 'IMPACT GLOBAL', 'responsable', v)
                          }
                        />
                      </td>
                    </tr>
                  );
                })()}

                {/* AXES & PROJECTS CMR ROWS */}
                {(garData.rendement?.axes || []).map((axe, i) => {
                  if (!isAxeVisible(i)) return null;
                  const axeNum = i + 1;
                  const effetRow =
                    (garData.cmr || []).find(
                      c => c.axe === axeNum && c.niveau === 'EFFET'
                    ) || ({} as Partial<GarCmrRow>);

                  return (
                    <React.Fragment key={i}>
                      <AxeHeaderRow axeName={axe.nom} colSpan={9} />
                      <tr className="bg-white dark:bg-slate-900">
                        <td className="border-r border-slate-200 dark:border-slate-800 font-black text-emerald-700 dark:text-emerald-400">
                          EFFET (AXE {axeNum})
                        </td>
                        <td className="border-r border-slate-200 dark:border-slate-800 font-bold">
                          {axe.effet || '-'}
                        </td>
                        <td className="border-r border-slate-200 dark:border-slate-800">
                          <EditableCell
                            type="textarea"
                            value={effetRow.indicateur}
                            onChange={v =>
                              updateCmr(axeNum, 'EFFET', 'indicateur', v)
                            }
                          />
                        </td>
                        <td className="border-r border-slate-200 dark:border-slate-800 text-center">
                          <EditableCell
                            value={effetRow.ref}
                            onChange={v => updateCmr(axeNum, 'EFFET', 'ref', v)}
                          />
                        </td>
                        <td className="border-r border-slate-200 dark:border-slate-800 text-center">
                          <EditableCell
                            value={effetRow.cible}
                            onChange={v =>
                              updateCmr(axeNum, 'EFFET', 'cible', v)
                            }
                          />
                        </td>
                        <td className="border-r border-slate-200 dark:border-slate-800 text-center">
                          <EditableCell
                            value={effetRow.real}
                            onChange={v => updateCmr(axeNum, 'EFFET', 'real', v)}
                          />
                        </td>
                        <td className="border-r border-slate-200 dark:border-slate-800 text-center">
                          <EditableCell
                            value={effetRow.freq || 'Semestrielle'}
                            onChange={v => updateCmr(axeNum, 'EFFET', 'freq', v)}
                          />
                        </td>
                        <td className="border-r border-slate-200 dark:border-slate-800">
                          <EditableCell
                            value={effetRow.source}
                            onChange={v =>
                              updateCmr(axeNum, 'EFFET', 'source', v)
                            }
                          />
                        </td>
                        <td>
                          <EditableCell
                            value={effetRow.responsable}
                            onChange={v =>
                              updateCmr(axeNum, 'EFFET', 'responsable', v)
                            }
                          />
                        </td>
                      </tr>

                      {(axe.projets || []).map((proj, pIdx) => {
                        if (!isProjVisible(i, pIdx)) return null;
                        const levelKey = `EXTRANT ${pIdx + 1}`;
                        const extRow =
                          (garData.cmr || []).find(
                            c => c.axe === axeNum && c.niveau === levelKey
                          ) || ({} as Partial<GarCmrRow>);

                        return (
                          <React.Fragment key={pIdx}>
                            <ProjHeaderRow
                              projName={proj.extrant}
                              pIdx={pIdx}
                              colSpan={9}
                            />
                            <tr className="bg-white dark:bg-slate-900">
                              <td className="border-r border-slate-200 dark:border-slate-800 font-black text-[#ea580c] dark:text-[#fdba74]">
                                {levelKey}
                              </td>
                              <td className="border-r border-slate-200 dark:border-slate-800 font-bold">
                                {proj.extrant || '-'}
                              </td>
                              <td className="border-r border-slate-200 dark:border-slate-800">
                                <EditableCell
                                  type="textarea"
                                  value={extRow.indicateur}
                                  onChange={v =>
                                    updateCmr(axeNum, levelKey, 'indicateur', v)
                                  }
                                />
                              </td>
                              <td className="border-r border-slate-200 dark:border-slate-800 text-center">
                                <EditableCell
                                  value={extRow.ref}
                                  onChange={v =>
                                    updateCmr(axeNum, levelKey, 'ref', v)
                                  }
                                />
                              </td>
                              <td className="border-r border-slate-200 dark:border-slate-800 text-center">
                                <EditableCell
                                  value={extRow.cible}
                                  onChange={v =>
                                    updateCmr(axeNum, levelKey, 'cible', v)
                                  }
                                />
                              </td>
                              <td className="border-r border-slate-200 dark:border-slate-800 text-center">
                                <EditableCell
                                  value={extRow.real}
                                  onChange={v =>
                                    updateCmr(axeNum, levelKey, 'real', v)
                                  }
                                />
                              </td>
                              <td className="border-r border-slate-200 dark:border-slate-800 text-center">
                                <EditableCell
                                  value={extRow.freq || 'Trimestrielle'}
                                  onChange={v =>
                                    updateCmr(axeNum, levelKey, 'freq', v)
                                  }
                                />
                              </td>
                              <td className="border-r border-slate-200 dark:border-slate-800">
                                <EditableCell
                                  value={extRow.source}
                                  onChange={v =>
                                    updateCmr(axeNum, levelKey, 'source', v)
                                  }
                                />
                              </td>
                              <td>
                                <EditableCell
                                  value={extRow.responsable}
                                  onChange={v =>
                                    updateCmr(axeNum, levelKey, 'responsable', v)
                                  }
                                />
                              </td>
                            </tr>
                          </React.Fragment>
                        );
                      })}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =====================================================================
          8. ONGLET : HYPOTHÈSES & RISQUES ('risques_hypo')
      ===================================================================== */}
      {activeTab === 'risques_hypo' && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
          <div className="overflow-x-auto max-h-[76vh]">
            <table className="w-full compact-table border-collapse min-w-[900px]">
              <thead className="bg-[#c2410c] text-white">
                <tr>
                  <th className="border-r border-orange-800 text-left w-[10%]">
                    Niveau
                  </th>
                  <th className="border-r border-orange-800 text-left w-[16%]">
                    Logique d’Intervention
                  </th>
                  <th className="border-r border-orange-800 text-left w-[18%]">
                    Hypothèse Conditionnelle
                  </th>
                  <th className="border-r border-orange-800 text-left w-[14%]">
                    Événement Critique (Contrainte)
                  </th>
                  <th className="border-r border-orange-800 text-left w-[14%]">
                    Risque Identifié (Cause)
                  </th>
                  <th className="border-r border-orange-800 text-center w-[8%]">
                    Criticité
                  </th>
                  <th className="border-r border-orange-800 text-left w-[10%]">
                    Responsable
                  </th>
                  <th className="text-left w-[10%]">Plan d’Atténuation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {(garData.rendement?.axes || []).map((axe, i) => {
                  if (!isAxeVisible(i)) return null;
                  const axeNum = i + 1;
                  const branch = garData.problems?.branches?.[i] || {
                    central: '',
                    details: []
                  };
                  const riskEffet =
                    (garData.risks || []).find(
                      r => r.axe === axeNum && r.niveau === 'EFFET'
                    ) || ({} as Partial<GarRiskRow>);

                  return (
                    <React.Fragment key={i}>
                      <AxeHeaderRow axeName={axe.nom} colSpan={8} />
                      <tr className="bg-orange-50/40 dark:bg-slate-800/50">
                        <td className="border-r border-slate-200 dark:border-slate-800 font-black text-[#c2410c] dark:text-[#fdba74]">
                          EFFET
                        </td>
                        <td className="border-r border-slate-200 dark:border-slate-800 font-bold">
                          {axe.effet || '-'}
                        </td>
                        <td className="border-r border-slate-200 dark:border-slate-800">
                          <EditableCell
                            type="textarea"
                            value={riskEffet.hypothese}
                            onChange={v =>
                              updateRisk(axeNum, 'EFFET', 'hypothese', v)
                            }
                          />
                        </td>
                        <td className="border-r border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-medium">
                          {branch.central || '-'}
                        </td>
                        <td className="border-r border-slate-200 dark:border-slate-800">
                          <EditableCell
                            type="textarea"
                            value={riskEffet.cause}
                            onChange={v =>
                              updateRisk(axeNum, 'EFFET', 'cause', v)
                            }
                          />
                        </td>
                        <td className="border-r border-slate-200 dark:border-slate-800 text-center">
                          <select
                            value={riskEffet.level || 'MOYEN'}
                            onChange={e =>
                              updateRisk(axeNum, 'EFFET', 'level', e.target.value)
                            }
                            className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded p-1 text-[10px] font-black"
                          >
                            <option value="FAIBLE">Faible</option>
                            <option value="MOYEN">Moyen</option>
                            <option value="ÉLEVÉ">Élevé</option>
                            <option value="CRITIQUE">Critique</option>
                          </select>
                        </td>
                        <td className="border-r border-slate-200 dark:border-slate-800">
                          <EditableCell
                            value={riskEffet.responsable}
                            onChange={v =>
                              updateRisk(axeNum, 'EFFET', 'responsable', v)
                            }
                          />
                        </td>
                        <td>
                          <EditableCell
                            type="textarea"
                            value={riskEffet.mitigation}
                            onChange={v =>
                              updateRisk(axeNum, 'EFFET', 'mitigation', v)
                            }
                          />
                        </td>
                      </tr>

                      {(axe.projets || []).map((proj, pIdx) => {
                        if (!isProjVisible(i, pIdx)) return null;
                        const rowLevel = `EXTRANT ${pIdx + 1}`;
                        const detail = branch.details?.[pIdx] || {
                          contrainte: '',
                          cause: []
                        };
                        const risk =
                          (garData.risks || []).find(
                            r => r.axe === axeNum && r.niveau === rowLevel
                          ) || ({} as Partial<GarRiskRow>);
                        const availActors = getAvailableActorsForProject(
                          axeNum,
                          pIdx
                        );

                        return (
                          <React.Fragment key={pIdx}>
                            <ProjHeaderRow
                              projName={proj.extrant}
                              pIdx={pIdx}
                              colSpan={8}
                            />
                            <tr className="bg-white dark:bg-slate-900">
                              <td className="border-r border-slate-200 dark:border-slate-800 font-black text-[#ea580c] dark:text-[#fdba74]">
                                {rowLevel}
                              </td>
                              <td className="border-r border-slate-200 dark:border-slate-800 font-bold">
                                {proj.extrant || '-'}
                              </td>
                              <td className="border-r border-slate-200 dark:border-slate-800">
                                <EditableCell
                                  type="textarea"
                                  value={risk.hypothese}
                                  onChange={v =>
                                    updateRisk(axeNum, rowLevel, 'hypothese', v)
                                  }
                                />
                              </td>
                              <td className="border-r border-slate-200 dark:border-slate-800 font-medium text-slate-700 dark:text-slate-300">
                                {detail.contrainte || '-'}
                              </td>
                              <td className="border-r border-slate-200 dark:border-slate-800 font-medium text-slate-700 dark:text-slate-300 whitespace-pre-line">
                                {ensureArray(detail.cause).join('\n') || '-'}
                              </td>
                              <td className="border-r border-slate-200 dark:border-slate-800 text-center">
                                <select
                                  value={risk.level || 'MOYEN'}
                                  onChange={e =>
                                    updateRisk(
                                      axeNum,
                                      rowLevel,
                                      'level',
                                      e.target.value
                                    )
                                  }
                                  className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded p-1 text-[10px] font-black"
                                >
                                  <option value="FAIBLE">Faible</option>
                                  <option value="MOYEN">Moyen</option>
                                  <option value="ÉLEVÉ">Élevé</option>
                                  <option value="CRITIQUE">Critique</option>
                                </select>
                              </td>
                              <td className="border-r border-slate-200 dark:border-slate-800">
                                <select
                                  value={risk.responsable || ''}
                                  onChange={e =>
                                    updateRisk(
                                      axeNum,
                                      rowLevel,
                                      'responsable',
                                      e.target.value
                                    )
                                  }
                                  className="w-full bg-orange-50 dark:bg-slate-800 border border-orange-200 dark:border-slate-700 rounded p-1 text-[10px] font-bold"
                                >
                                  <option value="">-- Acteur --</option>
                                  {availActors.map((a, idx) => (
                                    <option key={idx} value={a}>
                                      {a}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td>
                                <EditableCell
                                  type="textarea"
                                  value={risk.mitigation}
                                  onChange={v =>
                                    updateRisk(axeNum, rowLevel, 'mitigation', v)
                                  }
                                />
                              </td>
                            </tr>
                          </React.Fragment>
                        );
                      })}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =====================================================================
          9. ONGLET : MATRICE EXTRANTS & ACTIVITÉS ('extrants')
      ===================================================================== */}
      {activeTab === 'extrants' && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
          <div className="overflow-x-auto max-h-[76vh]">
            <table className="w-full compact-table border-collapse min-w-[860px]">
              <thead className="bg-[#c2410c] text-white">
                <tr>
                  <th className="border-r border-orange-800 text-left w-[10%]">
                    Niveau
                  </th>
                  <th className="border-r border-orange-800 text-left w-[20%]">
                    Extrants (Projets)
                  </th>
                  <th className="border-r border-orange-800 text-left w-[24%]">
                    Activités Nécessaires
                  </th>
                  <th className="border-r border-orange-800 text-left w-[20%]">
                    Intrants (RH & Matériels)
                  </th>
                  <th className="border-r border-orange-800 text-center w-[12%]">
                    Coût Estimatif ({currency})
                  </th>
                  <th className="text-left w-[14%]">
                    Partenaires Tech. & Fin.
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {(garData.rendement?.axes || []).map((axe, i) => {
                  if (!isAxeVisible(i)) return null;
                  const axeNum = i + 1;
                  return (
                    <React.Fragment key={i}>
                      <AxeHeaderRow axeName={axe.nom} colSpan={6} />
                      {(axe.projets || []).map((proj, pIdx) => {
                        if (!isProjVisible(i, pIdx)) return null;
                        const acts = ensureArray(proj.activites);
                        const techPartners = (
                          garData.stakeholders.operateursTechniques || []
                        )
                          .filter(
                            a =>
                              a.axe === axeNum &&
                              a.projetIndex === pIdx &&
                              a.nom?.trim()
                          )
                          .map(a => a.nom.trim());
                        const finPartners = (garData.stakeholders.ptf || [])
                          .filter(
                            a =>
                              a.axe === axeNum &&
                              a.projetIndex === pIdx &&
                              a.nom?.trim()
                          )
                          .map(a => a.nom.trim());
                        const allPartners = Array.from(
                          new Set([...techPartners, ...finPartners])
                        );

                        return (
                          <React.Fragment key={pIdx}>
                            <ProjHeaderRow
                              projName={proj.extrant}
                              pIdx={pIdx}
                              colSpan={6}
                            />
                            <tr className="bg-white dark:bg-slate-900">
                              <td className="border-r border-slate-200 dark:border-slate-800 font-black text-[#c2410c] dark:text-[#fdba74] align-top">
                                PROJET {pIdx + 1}
                              </td>
                              <td className="border-r border-slate-200 dark:border-slate-800 font-bold align-top">
                                {proj.extrant}
                              </td>
                              <td className="border-r border-slate-200 dark:border-slate-800 p-0 align-top">
                                {acts.map((act, k) => (
                                  <div
                                    key={k}
                                    className={`p-1.5 ${
                                      k > 0
                                        ? 'border-t border-slate-200 dark:border-slate-800'
                                        : ''
                                    }`}
                                  >
                                    <span className="text-[8.5px] font-black text-[#ea580c] dark:text-[#fdba74] uppercase block mb-0.5">
                                      Activité {k + 1} :
                                    </span>
                                    {act || '-'}
                                  </div>
                                ))}
                              </td>
                              <td className="border-r border-slate-200 dark:border-slate-800 p-0 align-top">
                                {acts.map((_, k) => (
                                  <div
                                    key={k}
                                    className={`p-1.5 space-y-1 ${
                                      k > 0
                                        ? 'border-t border-slate-200 dark:border-slate-800'
                                        : ''
                                    }`}
                                  >
                                    <div>
                                      <span className="text-[8px] font-bold uppercase text-slate-500">
                                        RH :
                                      </span>
                                      <EditableResourceList
                                        isEditable={false}
                                        items={getSafe2D(proj.intrants_rh, k)}
                                        currency={currency}
                                        language={language}
                                      />
                                    </div>
                                    <div>
                                      <span className="text-[8px] font-bold uppercase text-slate-500">
                                        Matériel :
                                      </span>
                                      <EditableResourceList
                                        isEditable={false}
                                        items={getSafe2D(proj.intrants_mat, k)}
                                        currency={currency}
                                        language={language}
                                      />
                                    </div>
                                  </div>
                                ))}
                              </td>
                              <td className="border-r border-slate-200 dark:border-slate-800 p-0 align-top text-center">
                                {acts.map((_, k) => (
                                  <div
                                    key={k}
                                    className={`p-1.5 ${
                                      k > 0
                                        ? 'border-t border-slate-200 dark:border-slate-800'
                                        : ''
                                    }`}
                                  >
                                    {renderActivityCostBadge(proj, k)}
                                  </div>
                                ))}
                                <div className="p-1.5 border-t-2 border-[#c2410c] bg-orange-50 dark:bg-slate-800">
                                  <span className="text-[8px] uppercase font-black text-slate-500 block">
                                    Total Projet :
                                  </span>
                                  <span className="font-mono font-black text-[#c2410c] dark:text-[#fdba74]">
                                    {formatCurrency(
                                      getGarProjectEffectiveCostFCFA(proj),
                                      currency,
                                      language
                                    )}
                                  </span>
                                </div>
                              </td>
                              <td className="align-top">
                                {allPartners.length > 0 ? (
                                  <ul className="list-disc pl-3.5 space-y-0.5 text-[10px] font-semibold">
                                    {allPartners.map((pt, idx) => (
                                      <li key={idx}>{pt}</li>
                                    ))}
                                  </ul>
                                ) : (
                                  <span className="text-slate-400 italic text-[10px]">
                                    Aucun partenaire lié
                                  </span>
                                )}
                              </td>
                            </tr>
                          </React.Fragment>
                        );
                      })}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =====================================================================
          10. ONGLET : CADRE LOGIQUE - CLAR ('clar')
      ===================================================================== */}
      {activeTab === 'clar' && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
          <div className="overflow-x-auto max-h-[76vh]">
            <table className="w-full compact-table border-collapse min-w-[820px]">
              <thead className="bg-[#c2410c] text-white">
                <tr>
                  <th className="border-r border-orange-800 text-left w-[12%]">
                    Niveau
                  </th>
                  <th className="border-r border-orange-800 text-left w-[25%]">
                    Logique d’Intervention
                  </th>
                  <th className="border-r border-orange-800 text-left w-[23%]">
                    Indicateurs (IOV) / Ressources
                  </th>
                  <th className="border-r border-orange-800 text-left w-[18%]">
                    Sources / Coûts ({currency})
                  </th>
                  <th className="text-left w-[22%]">
                    Hypothèses / Conditions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {/* IMPACT GLOBAL */}
                <tr className="bg-orange-50/90 dark:bg-slate-800 border-b-2 border-[#c2410c]">
                  <td className="border-r border-slate-200 dark:border-slate-700 font-black bg-[#c2410c] text-white">
                    IMPACT GLOBAL
                  </td>
                  <td className="border-r border-slate-200 dark:border-slate-700 font-bold text-[#c2410c] dark:text-[#fdba74]">
                    {garData.rendement?.impact || '-'}
                  </td>
                  <td className="border-r border-slate-200 dark:border-slate-700 font-medium">
                    {(garData.cmr || []).find(
                      c => c.niveau === 'IMPACT GLOBAL' || c.axe === 0
                    )?.indicateur || '-'}
                  </td>
                  <td className="border-r border-slate-200 dark:border-slate-700">
                    {(garData.cmr || []).find(
                      c => c.niveau === 'IMPACT GLOBAL' || c.axe === 0
                    )?.source || 'Rapport d’Évaluation'}
                  </td>
                  <td className="text-slate-500 italic">
                    Stabilité macroéconomique et institutionnelle
                  </td>
                </tr>

                {(garData.rendement?.axes || []).map((axe, i) => {
                  if (!isAxeVisible(i)) return null;
                  const axeNum = i + 1;
                  const effetCmr = (garData.cmr || []).find(
                    c => c.axe === axeNum && c.niveau === 'EFFET'
                  );
                  const riskEffet = (garData.risks || []).find(
                    r => r.axe === axeNum && r.niveau === 'EFFET'
                  );

                  return (
                    <React.Fragment key={i}>
                      <AxeHeaderRow axeName={axe.nom} colSpan={5} />
                      <tr className="bg-white dark:bg-slate-900">
                        <td className="border-r border-slate-200 dark:border-slate-800 font-black bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300">
                          EFFET
                        </td>
                        <td className="border-r border-slate-200 dark:border-slate-800 font-bold">
                          {axe.effet || '-'}
                        </td>
                        <td className="border-r border-slate-200 dark:border-slate-800 font-medium">
                          {effetCmr?.indicateur || '-'}
                        </td>
                        <td className="border-r border-slate-200 dark:border-slate-800">
                          {effetCmr?.source || 'Rapport de suivi'}
                        </td>
                        <td className="font-medium text-[#c2410c] dark:text-[#fdba74]">
                          {riskEffet?.hypothese || '-'}
                        </td>
                      </tr>

                      {(axe.projets || []).map((proj, pIdx) => {
                        if (!isProjVisible(i, pIdx)) return null;
                        const levelKey = `EXTRANT ${pIdx + 1}`;
                        const extCmr = (garData.cmr || []).find(
                          c => c.axe === axeNum && c.niveau === levelKey
                        );
                        const riskExt = (garData.risks || []).find(
                          r => r.axe === axeNum && r.niveau === levelKey
                        );
                        const acts = ensureArray(proj.activites);

                        return (
                          <React.Fragment key={pIdx}>
                            <ProjHeaderRow
                              projName={proj.extrant}
                              pIdx={pIdx}
                              colSpan={5}
                            />
                            <tr className="bg-white dark:bg-slate-900">
                              <td className="border-r border-slate-200 dark:border-slate-800 font-black bg-orange-50 dark:bg-slate-800 text-[#c2410c] dark:text-[#fdba74]">
                                {levelKey}
                              </td>
                              <td className="border-r border-slate-200 dark:border-slate-800 font-bold">
                                {proj.extrant || '-'}
                              </td>
                              <td className="border-r border-slate-200 dark:border-slate-800 font-medium">
                                {extCmr?.indicateur || '-'}
                              </td>
                              <td className="border-r border-slate-200 dark:border-slate-800">
                                {extCmr?.source || 'Rapport PTBA / PV'}
                              </td>
                              <td className="font-medium text-[#c2410c] dark:text-[#fdba74]">
                                {riskExt?.hypothese || '-'}
                              </td>
                            </tr>

                            <tr className="bg-white dark:bg-slate-900">
                              <td className="border-r border-slate-200 dark:border-slate-800 font-black bg-amber-50/70 dark:bg-amber-950/30 text-amber-900 dark:text-amber-300 align-top">
                                ACTIVITÉS {pIdx + 1}
                              </td>
                              <td className="border-r border-slate-200 dark:border-slate-800 p-0 align-top">
                                {acts.map((act, k) => (
                                  <div
                                    key={k}
                                    className={`p-1.5 ${
                                      k > 0
                                        ? 'border-t border-slate-200 dark:border-slate-800'
                                        : ''
                                    }`}
                                  >
                                    <span className="text-[8.5px] font-black text-[#ea580c] dark:text-[#fdba74] uppercase block mb-0.5">
                                      Activité {k + 1} :
                                    </span>
                                    {act || '-'}
                                  </div>
                                ))}
                              </td>
                              <td className="border-r border-slate-200 dark:border-slate-800 p-0 align-top bg-slate-50/60 dark:bg-slate-800/30">
                                {acts.map((_, k) => (
                                  <div
                                    key={k}
                                    className={`p-1.5 space-y-1 ${
                                      k > 0
                                        ? 'border-t border-slate-200 dark:border-slate-800'
                                        : ''
                                    }`}
                                  >
                                    <div>
                                      <span className="text-[8px] font-bold uppercase text-slate-500">
                                        Humaines :
                                      </span>
                                      <EditableResourceList
                                        isEditable={false}
                                        items={getSafe2D(proj.intrants_rh, k)}
                                        currency={currency}
                                        language={language}
                                      />
                                    </div>
                                    <div>
                                      <span className="text-[8px] font-bold uppercase text-slate-500">
                                        Matérielles :
                                      </span>
                                      <EditableResourceList
                                        isEditable={false}
                                        items={getSafe2D(proj.intrants_mat, k)}
                                        currency={currency}
                                        language={language}
                                      />
                                    </div>
                                  </div>
                                ))}
                              </td>
                              <td className="border-r border-slate-200 dark:border-slate-800 p-0 align-top text-center">
                                {acts.map((_, k) => (
                                  <div
                                    key={k}
                                    className={`p-1.5 ${
                                      k > 0
                                        ? 'border-t border-slate-200 dark:border-slate-800'
                                        : ''
                                    }`}
                                  >
                                    {renderActivityCostBadge(proj, k)}
                                  </div>
                                ))}
                                <div className="p-1.5 border-t-2 border-[#c2410c] bg-orange-50 dark:bg-slate-800">
                                  <span className="text-[8px] uppercase font-black text-slate-500 block">
                                    Total :
                                  </span>
                                  <span className="font-mono font-black text-[#c2410c] dark:text-[#fdba74]">
                                    {formatCurrency(
                                      getGarProjectEffectiveCostFCFA(proj),
                                      currency,
                                      language
                                    )}
                                  </span>
                                </div>
                              </td>
                              <td className="align-top text-slate-600 dark:text-slate-400 italic">
                                Mobilisation effective des ressources et respect du chemin critique PERT/CPM
                              </td>
                            </tr>
                          </React.Fragment>
                        );
                      })}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
