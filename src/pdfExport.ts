import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  CurrencyCode,
  CustomDocFields,
  Dossier,
  InstitutionalDocType,
  InternalActorProfile,
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
import {
  DOC_TEMPLATE_CONFIGS,
  HIDE_SIGNATURES_KEY,
  buildInstitutionalDocPages,
  parseExcludedFields
} from './docTemplates';
import {
  buildBusinessCardVCardPayload,
  buildBadgeQrPayload,
  encodeQrMatrix,
  encodeCode128Bars
} from './qrAndBarcodeUtils';
import {
  buildInstitutionalSlideDeck,
  isSlidePresentationDoc
} from './slidePresentations';
import {
  ensureProgramDirectoryAccessBeforeHeavyTask,
  saveProgramFile,
  SaveProgramFileResult
} from './services/exportStorage';

export const ACRONYMS_LIST: Array<[string, string, string]> = [
  ['GAR', 'Gestion Axée sur les Résultats (Results-Based Management)', 'Méthodologie de pilotage orientée vers l’atteinte mesurable des impacts et livrables.'],
  ['PERT', 'Program Evaluation and Review Technique', 'Méthode d’ordonnancement en réseau modélisant les dépendances logiques entre tâches.'],
  ['CPM', 'Critical Path Method (Méthode du Chemin Critique)', 'Algorithme identifiant la séquence de tâches à marge nulle déterminant la durée minimale du projet.'],
  ['WBS', 'Work Breakdown Structure (Organigramme des Tâches)', 'Découpage hiérarchique du portefeuille en Axes, Projets, Phases et Activités.'],
  ['ES / EF', 'Early Start / Early Finish (Début / Fin au plus tôt)', 'Dates calendaires les plus précoces auxquelles une activité peut démarrer ou se terminer.'],
  ['LS / LF', 'Late Start / Late Finish (Début / Fin au plus tard)', 'Dates limites au-delà desquelles tout retard décale la date de fin globale du projet.'],
  ['CAP', 'Contrôle Périodique d’Avancement', 'Audit régulier mesurant les écarts physiques, calendaires et financiers.'],
  ['TDR', 'Termes de Référence (Terms of Reference)', 'Cahier des charges normé définissant le périmètre d’une mission ou prestation.'],
  ['NDA', 'Non-Disclosure Agreement (Contrat de Confidentialité)', 'Accord juridique protégeant la confidentialité des données et livrables du projet.'],
  ['OCDE / CAD', 'Comité d’Aide au Développement de l’OCDE', 'Référentiel international des 6 critères d’évaluation (Pertinence, Cohérence, Efficacité, Efficience, Impact, Durabilité).'],
  ['PMO', 'Project Management Office (Bureau de Pilotage)', ' Cellule centrale assurant la gouvernance, la consolidation et le suivi méthodologique.'],
  ['COPIL', 'Comité de Pilotage Stratégique', 'Instance décisionnelle supérieure chargée de valider les orientations et d’arbitrer les blocages.']
];

export async function generateDirectWhitePDF(
  dossier: Dossier,
  userProfile: UserProfile,
  currency: CurrencyCode,
  lang: LanguageCode
): Promise<SaveProgramFileResult> {
  await ensureProgramDirectoryAccessBeforeHeavyTask();
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const cleanPdfText = (val: string = ''): string =>
    String(val || '')
      .replace(/[\u202F\u00A0]/g, ' ')
      .replace(/→/g, '->')
      .replace(/◆/g, '[Jalon]')
      .replace(/≥/g, '>=')
      .replace(/≤/g, '<=');

  const pageWidth = doc.internal.pageSize.getWidth(); // 210mm
  const pageHeight = doc.internal.pageSize.getHeight(); // 297mm
  const marginX = 14;
  const usableWidth = pageWidth - marginX * 2; // 182mm
  const todayISO = getTodayISO();
  const dateStr = cleanPdfText(
    new Date().toLocaleDateString(lang === 'FR' ? 'fr-FR' : 'en-US', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    })
  );

  const headerTitle =
    lang === 'EN'
      ? 'faab gar — TECHNICAL SHEET & EXECUTIVE SUMMARY'
      : 'faab gar — FICHE TECHNIQUE & RÉSUMÉ EXÉCUTIF';

  const drawTopHeaderBannerOnly = (subtitle: string) => {
    doc.setFillColor(194, 65, 12); // #c2410c
    doc.rect(0, 0, pageWidth, 24, 'F');
    doc.setFillColor(253, 186, 116); // #fdba74
    doc.rect(0, 24, pageWidth, 2.5, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.text(cleanPdfText(headerTitle), marginX, 10);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    const maxSubW = usableWidth - 42;
    const subLines = doc.splitTextToSize(cleanPdfText(subtitle), maxSubW);
    doc.text(subLines[0] || '', marginX, 18);
    doc.text(dateStr, pageWidth - marginX, 14, { align: 'right' });
  };

  const drawPageHeader = (subtitle: string) => {
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, pageWidth, pageHeight, 'F');
    drawTopHeaderBannerOnly(subtitle);
  };

  // Prepare all data
  const pertSummaries = computeDossierPertSummary(dossier, todayISO);
  const allNodes = pertSummaries.flatMap(p => p.nodes);

  const planningRows: string[][] = [];
  const trackingRows: string[][] = [];
  let totalTasks = 0;
  let completedTasks = 0;
  let inProgressTasks = 0;
  let blockedTasks = 0;
  let totalBudgetFCFA = 0;

  (dossier.axes || []).forEach(axe => {
    (axe.projects || []).forEach(proj => {
      const codeMap = new Map<string, string>();
      STANDARD_PHASES.forEach((pName, pIdx) => {
        const pTasks = (proj.tasks || []).filter(tk => tk.phase === pName);
        pTasks.forEach((tk, tIdx) => {
          codeMap.set(tk.id, `${tk.type === 'jalon' ? 'J' : 'T'}.${pIdx + 1}.${tIdx + 1}`);
        });
      });

      (proj.tasks || []).forEach((task, idx) => {
        totalTasks++;
        const metrics = computeTaskMetrics(task, todayISO);
        if (metrics.effectiveStatus === 'Terminé') completedTasks++;
        if (metrics.effectiveStatus === 'En cours') inProgressTasks++;
        if (metrics.effectiveStatus === 'Bloqué') blockedTasks++;
        const taskBudget = Number(task.budget) || 0;
        totalBudgetFCFA += taskBudget;

        const code = codeMap.get(task.id) || `${task.type === 'jalon' ? 'J' : 'T'}.1.${idx + 1}`;
        const antCode =
          task.antecedent && task.antecedent !== '—'
            ? codeMap.get(task.antecedent) || task.antecedent
            : '—';
        const startD = new Date(task.startDate);
        const monthStr = !isNaN(startD.getTime())
          ? startD.toLocaleString(lang === 'EN' ? 'en-US' : 'fr-FR', {
              month: 'short',
              year: '2-digit'
            })
          : '—';

        planningRows.push([
          cleanPdfText(code),
          cleanPdfText(task.name),
          cleanPdfText(task.assignee || '—'),
          cleanPdfText(formatCurrency(taskBudget, currency, lang)),
          cleanPdfText(monthStr),
          cleanPdfText(antCode),
          cleanPdfText(task.startDate || '—'),
          cleanPdfText(task.endDate || '—'),
          cleanPdfText(metrics.plannedDurationLabel)
        ]);

        trackingRows.push([
          cleanPdfText(code),
          cleanPdfText(task.name),
          cleanPdfText(task.assignee || '—'),
          cleanPdfText(metrics.effectiveStatus),
          cleanPdfText(task.startDate || '—'),
          cleanPdfText(task.endDate || '—'),
          cleanPdfText(metrics.plannedDurationLabel),
          cleanPdfText(task.actualStartDate || '—'),
          cleanPdfText(task.actualEndDate || '—'),
          cleanPdfText(metrics.realDurationLabel),
          cleanPdfText(metrics.ecartDebutLabel),
          cleanPdfText(metrics.ecartFinLabel)
        ]);
      });
    });
  });

  const progressPct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  // ==========================================================================
  // PAGE 1 : PRÉSENTATION DU DOCUMENT EXÉCUTIF CONSOLIDÉ & IDENTITÉ DU RESPONSABLE
  // ==========================================================================
  const p1Subtitle = `Page de Garde Officielle · Horizon ${dossier.horizonPlan}`;
  drawPageHeader(p1Subtitle);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  const splitDossierName = doc.splitTextToSize(
    cleanPdfText(dossier.name || 'Portefeuille Stratégique'),
    usableWidth - 12
  );

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  const splitDesc = doc.splitTextToSize(
    cleanPdfText(dossier.description || ''),
    usableWidth - 12
  );

  const nameBlockH = Math.max(6, splitDossierName.length * 4.8);
  const descBlockH = Math.max(8, splitDesc.length * 4.2);
  const bannerBoxY = 33;
  const bannerBoxH = Math.min(72, 18 + nameBlockH + descBlockH);

  doc.setDrawColor(253, 186, 116);
  doc.setLineWidth(0.6);
  doc.setFillColor(255, 247, 237);
  doc.roundedRect(marginX, bannerBoxY, usableWidth, bannerBoxH, 3, 3, 'FD');

  doc.setTextColor(194, 65, 12);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11.5);
  doc.text(
    cleanPdfText(
      lang === 'EN' ? 'CONSOLIDATED EXECUTIVE DOCUMENT' : 'DOCUMENT EXÉCUTIF CONSOLIDÉ'
    ),
    marginX + 6,
    bannerBoxY + 9
  );

  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text(splitDossierName, marginX + 6, bannerBoxY + 16);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(51, 65, 85);
  doc.text(splitDesc.slice(0, 8), marginX + 6, bannerBoxY + 16 + nameBlockH + 2);

  autoTable(doc, {
    startY: bannerBoxY + bannerBoxH + 7,
    margin: { top: 34, bottom: 16, left: marginX, right: marginX },
    tableWidth: usableWidth,
    rowPageBreak: 'avoid',
    head: [
      [
        cleanPdfText(
          lang === 'EN'
            ? '1. MANAGER IDENTITY & HOST ORGANIZATION'
            : '1. IDENTITÉ DU RESPONSABLE & ORGANISATION DE RATTACHEMENT'
        ),
        cleanPdfText(lang === 'EN' ? 'OFFICIAL DETAILS' : 'DÉTAILS OFFICIELS')
      ]
    ],
    body: [
      ['Nom & Prénoms du Responsable', cleanPdfText(userProfile.fullName)],
      ['Fonction / Titre Officiel', cleanPdfText(userProfile.role)],
      ['Organisation / Institution', cleanPdfText(userProfile.institution || dossier.institution)],
      ['Adresse Email Professionnelle', cleanPdfText(userProfile.email)],
      ['Contact Téléphonique', cleanPdfText(userProfile.phone)],
      ['Intitulé du Portefeuille', cleanPdfText(dossier.name)],
      ['Horizon Stratégique', cleanPdfText(`${dossier.horizonPlan} (${dossier.horizonYears} ans)`)],
      ['Devise de Consolidation', cleanPdfText(currency)]
    ],
    theme: 'grid',
    styles: {
      fillColor: [255, 255, 255],
      textColor: [15, 23, 42],
      fontSize: 9,
      cellPadding: 3.5,
      overflow: 'linebreak'
    },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 68, fillColor: [248, 250, 252] },
      1: { cellWidth: usableWidth - 68 }
    },
    headStyles: {
      fillColor: [194, 65, 12],
      textColor: [255, 255, 255],
      fontSize: 9,
      fontStyle: 'bold',
      overflow: 'linebreak'
    },
    didDrawPage: () => {
      drawTopHeaderBannerOnly(p1Subtitle);
    }
  });

  // ==========================================================================
  // PAGE 2 : LE SOMMAIRE EXÉCUTIF
  // ==========================================================================
  doc.addPage();
  const p2Subtitle = 'Sommaire Exécutif & Architecture Documentaire';
  drawPageHeader(p2Subtitle);

  autoTable(doc, {
    startY: 34,
    margin: { top: 34, bottom: 16, left: marginX, right: marginX },
    tableWidth: usableWidth,
    rowPageBreak: 'avoid',
    head: [['SECTION', 'INTITULÉ DE LA RUBRIQUE DOCUMENTAIRE', 'CONTENU & NORMES']],
    body: [
      ['Section I', 'Présentation du Document Exécutif Consolidé & Identité du Responsable', 'Métadonnées institutionnelles & Profil'],
      ['Section II', 'Sommaire Exécutif Détaillé', 'Structure séquentielle multi-pages A4'],
      ['Section III', 'Table des Sigles, Acronymes & Abréviations', 'Référentiel normatif GAR, PERT, CPM, OCDE'],
      ['Section IV', 'Synthèse Financière & Avancement Opérationnel (Graphiques & KPIs)', 'Consolidation budgétaire & Répartition par statut'],
      ['Section V', 'Diagramme de Gantt Simplifié & Épuré', 'Visualisation temporelle proportionnelle sans débordement'],
      ['Section VI', 'Tableau 1 — Planification Macro des Activités & Jalons', 'Code, Activité, Responsable, Budget, Antécéd., Dates Prév.'],
      ['Section VII', 'Tableau 2 — Suivi de l’Exécution des Activités & Écarts', 'Statut à date, Dates Exéc., Écart début & Écart fin'],
      ['Section VIII', 'Interprétation Dynamique du Réseau PERT & Chemin Critique (CPM)', 'Séquences critiques, Marges libres/totales & Alertes']
    ].map(r => r.map(c => cleanPdfText(c))),
    theme: 'grid',
    styles: {
      fillColor: [255, 255, 255],
      textColor: [15, 23, 42],
      fontSize: 9,
      cellPadding: 4,
      overflow: 'linebreak'
    },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 26, fillColor: [255, 247, 237] },
      1: { fontStyle: 'bold', cellWidth: 92 },
      2: { cellWidth: usableWidth - 118 }
    },
    headStyles: {
      fillColor: [194, 65, 12],
      textColor: [255, 255, 255],
      fontSize: 9,
      fontStyle: 'bold',
      overflow: 'linebreak'
    },
    didDrawPage: () => {
      drawTopHeaderBannerOnly(p2Subtitle);
    }
  });

  // ==========================================================================
  // PAGE 3 : LES ACRONYMES
  // ==========================================================================
  doc.addPage();
  const p3Subtitle = 'Table des Sigles, Acronymes & Abréviations Officiels';
  drawPageHeader(p3Subtitle);

  autoTable(doc, {
    startY: 34,
    margin: { top: 34, bottom: 16, left: marginX, right: marginX },
    tableWidth: usableWidth,
    rowPageBreak: 'avoid',
    head: [['SIGLE / ACRONYME', 'SIGNIFICATION COMPLÈTE', 'DÉFINITION OPÉRATIONNELLE']],
    body: ACRONYMS_LIST.map(r => r.map(c => cleanPdfText(c))),
    theme: 'grid',
    styles: {
      fillColor: [255, 255, 255],
      textColor: [15, 23, 42],
      fontSize: 8.5,
      cellPadding: 3.2,
      overflow: 'linebreak'
    },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 30, fillColor: [255, 247, 237] },
      1: { fontStyle: 'bold', cellWidth: 62 },
      2: { cellWidth: usableWidth - 92 }
    },
    headStyles: {
      fillColor: [194, 65, 12],
      textColor: [255, 255, 255],
      fontSize: 8.8,
      fontStyle: 'bold',
      overflow: 'linebreak'
    },
    didDrawPage: () => {
      drawTopHeaderBannerOnly(p3Subtitle);
    }
  });

  // ==========================================================================
  // PAGE 4 : SYNTHÈSE FINANCIÈRE & AVANCEMENT OPÉRATIONNEL
  // ==========================================================================
  doc.addPage();
  const p4Subtitle = `Synthèse Financière & Avancement Opérationnel (${currency})`;
  drawPageHeader(p4Subtitle);

  autoTable(doc, {
    startY: 34,
    margin: { top: 34, bottom: 16, left: marginX, right: marginX },
    tableWidth: usableWidth,
    rowPageBreak: 'avoid',
    head: [['INDICATEUR EXÉCUTIF', 'VALEUR CONSOLIDÉE', 'INTERPRÉTATION']],
    body: [
      [`Budget Global Consolidé (${currency})`, formatCurrency(totalBudgetFCFA, currency, lang), 'Enveloppe financière totale programmée'],
      ['Total des Activités & Jalons', String(totalTasks), 'Volume global du portefeuille'],
      ['Activités Terminées', `${completedTasks} (${progressPct}%)`, 'Livrables réceptionnés et validés'],
      ['Activités En Cours', String(inProgressTasks), 'Opérations actives à la date du jour'],
      ['Activités Bloquées (Goulots)', String(blockedTasks), 'Points d’attention nécessitant un arbitrage']
    ].map(r => r.map(c => cleanPdfText(c))),
    theme: 'grid',
    styles: {
      fillColor: [255, 255, 255],
      textColor: [15, 23, 42],
      fontSize: 8.5,
      cellPadding: 3,
      overflow: 'linebreak'
    },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 62, fillColor: [255, 247, 237] },
      1: { fontStyle: 'bold', halign: 'center', cellWidth: 46 },
      2: { cellWidth: usableWidth - 108 }
    },
    headStyles: {
      fillColor: [194, 65, 12],
      textColor: [255, 255, 255],
      fontSize: 8.8,
      fontStyle: 'bold',
      overflow: 'linebreak'
    },
    didDrawPage: () => {
      drawTopHeaderBannerOnly(p4Subtitle);
    }
  });

  const projBreakdownRows = pertSummaries.map((p, idx) => {
    const pTerm = p.nodes.filter(n => n.status === 'Terminé').length;
    const pEnc = p.nodes.filter(n => n.status === 'En cours').length;
    const pBloq = p.nodes.filter(n => n.status === 'Bloqué').length;
    const pAf = p.nodes.filter(n => n.status === 'À faire').length;
    const pBud = p.nodes.reduce((acc, n) => acc + n.budget, 0);
    return [
      cleanPdfText(`P${idx + 1} — ${p.projectName}`),
      String(pTerm),
      String(pEnc),
      String(pBloq),
      String(pAf),
      cleanPdfText(formatCurrency(pBud, currency, lang))
    ];
  });

  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 8,
    margin: { top: 34, bottom: 16, left: marginX, right: marginX },
    tableWidth: usableWidth,
    rowPageBreak: 'avoid',
    head: [['PROJET OPÉRATIONNEL', 'TERMINÉES', 'EN COURS', 'BLOQUÉES', 'À FAIRE', `BUDGET (${currency})`]],
    body: projBreakdownRows,
    theme: 'grid',
    styles: {
      fillColor: [255, 255, 255],
      textColor: [15, 23, 42],
      fontSize: 8,
      cellPadding: 2.8,
      overflow: 'linebreak'
    },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 66 },
      1: { halign: 'center', cellWidth: 18 },
      2: { halign: 'center', cellWidth: 18 },
      3: { halign: 'center', cellWidth: 18 },
      4: { halign: 'center', cellWidth: 16 },
      5: { fontStyle: 'bold', halign: 'right', cellWidth: 46 }
    },
    headStyles: {
      fillColor: [234, 88, 12],
      textColor: [255, 255, 255],
      fontSize: 8,
      fontStyle: 'bold',
      overflow: 'linebreak'
    },
    didDrawPage: () => {
      drawTopHeaderBannerOnly(p4Subtitle);
    }
  });

  // ==========================================================================
  // PAGE 5 : DIAGRAMME DE GANTT SIMPLIFIÉ & ÉPURÉ
  // ==========================================================================
  doc.addPage();
  const p5Subtitle = 'Diagramme de Gantt Simplifié & Épuré';
  drawPageHeader(p5Subtitle);

  const ganttRows = allNodes.map(n => [
    cleanPdfText(n.code),
    cleanPdfText(n.name),
    cleanPdfText(n.startDate),
    cleanPdfText(n.endDate),
    cleanPdfText(`${n.duration}j`),
    cleanPdfText(n.isCritical ? 'CRITIQUE (CPM)' : `Marge +${n.totalFloat}j`),
    cleanPdfText(n.status)
  ]);

  autoTable(doc, {
    startY: 34,
    margin: { top: 34, bottom: 16, left: marginX, right: marginX },
    tableWidth: usableWidth,
    rowPageBreak: 'avoid',
    head: [['Code', 'Activité / Jalon', 'Déb. Prév', 'Fin Prév', 'Durée', 'Criticité PERT', 'Statut']],
    body: ganttRows,
    theme: 'grid',
    styles: {
      fillColor: [255, 255, 255],
      textColor: [15, 23, 42],
      fontSize: 7.8,
      cellPadding: 2.4,
      overflow: 'linebreak'
    },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 14 },
      1: { cellWidth: 62 },
      2: { halign: 'center', cellWidth: 20 },
      3: { halign: 'center', cellWidth: 20 },
      4: { halign: 'center', fontStyle: 'bold', cellWidth: 14 },
      5: { halign: 'center', fontStyle: 'bold', cellWidth: 30 },
      6: { halign: 'center', fontStyle: 'bold', cellWidth: 22 }
    },
    headStyles: {
      fillColor: [194, 65, 12],
      textColor: [255, 255, 255],
      fontSize: 8,
      fontStyle: 'bold',
      overflow: 'linebreak'
    },
    didDrawPage: () => {
      drawTopHeaderBannerOnly(p5Subtitle);
    }
  });

  // ==========================================================================
  // PAGE 6+ : TABLEAU 1 — PLANIFICATION MACRO DES ACTIVITÉS & JALONS
  // ==========================================================================
  doc.addPage();
  const p6Subtitle = 'Tableau 1 — Planification Macro des Activités & Jalons';
  drawPageHeader(p6Subtitle);

  autoTable(doc, {
    startY: 34,
    margin: { top: 34, bottom: 16, left: marginX, right: marginX },
    tableWidth: usableWidth,
    rowPageBreak: 'avoid',
    head: [['Code', 'Activité / Jalon', 'Responsable', `Budget (${currency})`, 'Mois', 'Antécéd.', 'Déb. Prév', 'Fin Prév', 'Durée']],
    body: planningRows,
    theme: 'grid',
    styles: {
      fillColor: [255, 255, 255],
      textColor: [15, 23, 42],
      fontSize: 7.2,
      cellPadding: 2,
      overflow: 'linebreak'
    },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 12 },
      1: { cellWidth: 46 },
      2: { cellWidth: 24 },
      3: { fontStyle: 'bold', halign: 'right', cellWidth: 28 },
      4: { halign: 'center', cellWidth: 14 },
      5: { halign: 'center', cellWidth: 14 },
      6: { halign: 'center', cellWidth: 16 },
      7: { halign: 'center', cellWidth: 16 },
      8: { fontStyle: 'bold', halign: 'center', cellWidth: 12 }
    },
    headStyles: {
      fillColor: [194, 65, 12],
      textColor: [255, 255, 255],
      fontSize: 7.4,
      fontStyle: 'bold',
      overflow: 'linebreak'
    },
    didDrawPage: () => {
      drawTopHeaderBannerOnly(p6Subtitle);
    }
  });

  // ==========================================================================
  // PAGE 7+ : TABLEAU 2 — SUIVI DE L’EXÉCUTION DES ACTIVITÉS & ÉCARTS
  // ==========================================================================
  doc.addPage();
  const p7Subtitle = 'Tableau 2 — Suivi de l’Exécution des Activités & Écarts';
  drawPageHeader(p7Subtitle);

  autoTable(doc, {
    startY: 34,
    margin: { top: 34, bottom: 16, left: marginX, right: marginX },
    tableWidth: usableWidth,
    rowPageBreak: 'avoid',
    head: [['Code', 'Activité / Jalon', 'Resp.', 'Statut', 'Déb. Prév', 'Fin Prév', 'Durée', 'Déb. Exéc', 'Fin Exéc', 'Réel', 'Écart déb.', 'Écart fin']],
    body: trackingRows,
    theme: 'grid',
    styles: {
      fillColor: [255, 255, 255],
      textColor: [15, 23, 42],
      fontSize: 6.5,
      cellPadding: 1.6,
      overflow: 'linebreak'
    },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 10 },
      1: { cellWidth: 35 },
      2: { cellWidth: 19 },
      3: { fontStyle: 'bold', halign: 'center', cellWidth: 14 },
      4: { halign: 'center', cellWidth: 14 },
      5: { halign: 'center', cellWidth: 14 },
      6: { halign: 'center', cellWidth: 10 },
      7: { halign: 'center', cellWidth: 14 },
      8: { halign: 'center', cellWidth: 14 },
      9: { fontStyle: 'bold', halign: 'center', cellWidth: 10 },
      10: { fontStyle: 'bold', halign: 'center', cellWidth: 14 },
      11: { fontStyle: 'bold', halign: 'center', cellWidth: 14 }
    },
    headStyles: {
      fillColor: [234, 88, 12],
      textColor: [255, 255, 255],
      fontSize: 6.8,
      fontStyle: 'bold',
      overflow: 'linebreak'
    },
    didDrawPage: () => {
      drawTopHeaderBannerOnly(p7Subtitle);
    }
  });

  // ==========================================================================
  // DERNIÈRE PAGE : INTERPRÉTATION DYNAMIQUE DU RÉSEAU PERT & CHEMIN CRITIQUE
  // ==========================================================================
  doc.addPage();
  const p8Subtitle = 'Interprétation Dynamique du Réseau PERT & Chemin Critique (CPM)';
  drawPageHeader(p8Subtitle);

  const pertInterpRows = pertSummaries.map(p => [
    cleanPdfText(p.projectName),
    cleanPdfText(`${p.projectDuration} jour(s)`),
    cleanPdfText(p.criticalPathCodes.join(' -> ') || '—'),
    cleanPdfText(
      `${p.interpretation.criticalPathSummary}\n\n${p.interpretation.slackSummary}\n\n${p.interpretation.riskAndSteeringSummary}`
    )
  ]);

  autoTable(doc, {
    startY: 34,
    margin: { top: 34, bottom: 16, left: marginX, right: marginX },
    tableWidth: usableWidth,
    rowPageBreak: 'avoid',
    head: [['Projet Opérationnel', 'Durée Critique', 'Chemin Critique', 'Interprétation Dynamique & Recommandations']],
    body: pertInterpRows,
    theme: 'grid',
    styles: {
      fillColor: [255, 255, 255],
      textColor: [15, 23, 42],
      fontSize: 7.8,
      cellPadding: 2.8,
      overflow: 'linebreak'
    },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 38 },
      1: { fontStyle: 'bold', halign: 'center', cellWidth: 22 },
      2: { fontStyle: 'bold', cellWidth: 34 },
      3: { cellWidth: 88 }
    },
    headStyles: {
      fillColor: [194, 65, 12],
      textColor: [255, 255, 255],
      fontSize: 8.2,
      fontStyle: 'bold',
      overflow: 'linebreak'
    },
    didDrawPage: () => {
      drawTopHeaderBannerOnly(p8Subtitle);
    }
  });

  // Number all pages cleanly
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFontSize(7.2);
    doc.setTextColor(100, 116, 139);
    doc.text(
      cleanPdfText(
        `faab gar · Conception & Architecture : KOFFIE FABIEN MICHAEL (fabien.frikupgeneration@gmail.com | 00225 0748082739) · Page ${p} / ${totalPages}`
      ),
      pageWidth / 2,
      pageHeight - 6,
      { align: 'center' }
    );
  }

  const cleanFileName = (dossier.name || 'Fiche_Technique')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_');
  const pdfFileName = `FAAB_PLAN_${cleanFileName}_${currency}.pdf`;

  try {
    const pdfBlob = doc.output('blob');
    return await saveProgramFile({
      programName: dossier.name,
      fileName: pdfFileName,
      content: pdfBlob,
      mimeType: 'application/pdf'
    });
  } catch {
    doc.save(pdfFileName);
    return {
      success: true,
      mode: 'download',
      path: `faab-plan/${dossier.name}/${pdfFileName}`,
      fileName: pdfFileName
    };
  }
}

/**
 * Génère le PDF A4 multi-pages spécifique à chacun des 15 documents institutionnels & opérationnels
 */
export async function generateInstitutionalDocumentPDF(
  docType: InstitutionalDocType,
  customFields: CustomDocFields,
  dossier: Dossier,
  userProfile: UserProfile,
  currency: CurrencyCode,
  lang: LanguageCode
): Promise<SaveProgramFileResult> {
  if (isSlidePresentationDoc(docType)) {
    return await generateSlidePresentationLandscapePDF(
      docType,
      customFields,
      dossier,
      userProfile,
      currency,
      lang
    );
  }

  await ensureProgramDirectoryAccessBeforeHeavyTask();
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const cleanPdfText = (val: string = ''): string =>
    String(val || '')
      .replace(/[\u202F\u00A0]/g, ' ')
      .replace(/→/g, '->')
      .replace(/◆/g, '[Jalon]')
      .replace(/≥/g, '>=')
      .replace(/≤/g, '<=');

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const usableWidth = pageWidth - 28; // 14mm left + 14mm right margin = 182mm on A4
  const dateStr = cleanPdfText(
    new Date().toLocaleDateString(lang === 'FR' ? 'fr-FR' : 'en-US', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    })
  );

  const pages = buildInstitutionalDocPages(docType, customFields, dossier, userProfile, currency, lang);
  const cfg = DOC_TEMPLATE_CONFIGS[docType];

  const drawTopBannerOnly = (title: string, subtitle: string) => {
    doc.setFillColor(194, 65, 12);
    doc.rect(0, 0, pageWidth, 26, 'F');
    doc.setFillColor(253, 186, 116);
    doc.rect(0, 26, pageWidth, 2.5, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    const titleLines = doc.splitTextToSize(cleanPdfText(title), usableWidth - 36);
    doc.text(titleLines[0] || '', 14, 11);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.6);
    const subLines = doc.splitTextToSize(cleanPdfText(subtitle), usableWidth - 36);
    doc.text(subLines[0] || '', 14, 19);
    doc.text(dateStr, pageWidth - 14, 15, { align: 'right' });
  };

  const drawPageHeaderBanner = (title: string, subtitle: string) => {
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, pageWidth, pageHeight, 'F');
    drawTopBannerOnly(title, subtitle);
  };

  /**
   * Calcule les dimensions (w, h) en mm préservant strictement le ratio naturel de l'image
   * à l'intérieur d'une boîte maximale (maxW, maxH), sans jamais écraser ni aplatir l'image.
   */
  const getScaledImageDimensions = (
    dataUrl: string | undefined,
    maxW: number,
    maxH: number
  ): { w: number; h: number } | null => {
    if (!dataUrl || !dataUrl.startsWith('data:image/')) return null;
    try {
      const props = doc.getImageProperties(dataUrl);
      if (props && props.width > 0 && props.height > 0) {
        const ratio = props.width / props.height;
        let w = maxW;
        let h = w / ratio;
        if (h > maxH) {
          h = maxH;
          w = h * ratio;
        }
        return { w: Number(w.toFixed(2)), h: Number(h.toFixed(2)) };
      }
    } catch {
      // Fallback
    }
    return { w: maxW, h: maxH };
  };

  /**
   * Insère une image dans un cadre (boxX, boxY, maxW, maxH) en conservant 100% de ses proportions naturelles.
   */
  const safeAddImageFit = (
    dataUrl: string | undefined,
    boxX: number,
    boxY: number,
    maxW: number,
    maxH: number,
    alignX: 'left' | 'center' | 'right' = 'center',
    alignY: 'top' | 'center' | 'bottom' = 'center'
  ) => {
    if (!dataUrl || !dataUrl.startsWith('data:image/')) return;
    try {
      const dims = getScaledImageDimensions(dataUrl, maxW, maxH);
      if (!dims) return;
      let drawX = boxX;
      if (alignX === 'center') {
        drawX = boxX + (maxW - dims.w) / 2;
      } else if (alignX === 'right') {
        drawX = boxX + (maxW - dims.w);
      }

      let drawY = boxY;
      if (alignY === 'center') {
        drawY = boxY + (maxH - dims.h) / 2;
      } else if (alignY === 'bottom') {
        drawY = boxY + (maxH - dims.h);
      }

      const format =
        dataUrl.includes('image/jpeg') || dataUrl.includes('image/jpg') ? 'JPEG' : 'PNG';
      doc.addImage(dataUrl, format, drawX, drawY, dims.w, dims.h);
    } catch {
      // Fallback silently if image format cannot be embedded
    }
  };

  const isCvExecDoc = docType === 'cv_executif';
  const isCvDetailDoc = docType === 'cv_detaille';
  const isAnyCvDoc = isCvExecDoc || isCvDetailDoc;
  const sectionGapMm = isCvExecDoc ? 2.2 : isCvDetailDoc ? 2.8 : 4.2;
  const bottomSafeMarginMm = 18;

  pages.forEach((pageData, pageIdx) => {
    if (pageIdx > 0) {
      doc.addPage();
    }

    drawPageHeaderBanner(pageData.pageTitle, pageData.pageSubtitle);

    let currentY = isCvExecDoc ? 31.5 : 33.5;

    const ensurePageSpace = (minNeededMm: number = 32) => {
      if (isCvExecDoc) {
        // Keep CV Exécutif strictly on 1 page A4
        return;
      }
      if (currentY > pageHeight - Math.max(minNeededMm, bottomSafeMarginMm + 12)) {
        doc.addPage();
        drawPageHeaderBanner(pageData.pageTitle, pageData.pageSubtitle);
        currentY = 33.5;
      }
    };

    pageData.sections.forEach(sec => {
      if (sec.coverChart) {
        ensurePageSpace(65);
        const covChart = sec.coverChart;
        // Inset blocks from page borders and keep 67% max-width per column
        const edgeInset = 6;
        const halfColInnerWidth = usableWidth / 2 - edgeInset - 4;
        const headerTextMaxWidth = halfColInnerWidth * 0.67;
        const logoBoxMaxW = Math.min(46, headerTextMaxWidth);

        const leftLogoDims = getScaledImageDimensions(covChart.leftLogoDataUrl, logoBoxMaxW, 20);
        const rightLogoDims = getScaledImageDimensions(covChart.rightLogoDataUrl, logoBoxMaxW, 20);
        const bannerDims = getScaledImageDimensions(
          covChart.bannerImageDataUrl,
          usableWidth - 20,
          48
        );

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.2);
        const leftOrgLines: string[] = covChart.leftLogo
          ? doc.splitTextToSize(cleanPdfText(covChart.leftLogo), headerTextMaxWidth)
          : [];
        const rightOrgLines: string[] = covChart.rightLogo
          ? doc.splitTextToSize(cleanPdfText(covChart.rightLogo), headerTextMaxWidth)
          : [];

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.6);
        const leftDeptLines: string[] = covChart.leftDepartment
          ? doc.splitTextToSize(cleanPdfText(covChart.leftDepartment), headerTextMaxWidth)
          : [];
        const rightDeptLines: string[] = covChart.rightDepartment
          ? doc.splitTextToSize(cleanPdfText(covChart.rightDepartment), headerTextMaxWidth)
          : [];

        // Synchronized horizontal row heights so left & right Organization and Department lines start at the exact same Y
        const sharedLogoBandH =
          covChart.leftLogoDataUrl || covChart.rightLogoDataUrl
            ? Math.max(leftLogoDims?.h || 0, rightLogoDims?.h || 0, 14)
            : 0;
        const maxOrgLines = Math.max(leftOrgLines.length, rightOrgLines.length);
        const maxDeptLines = Math.max(leftDeptLines.length, rightDeptLines.length);

        const orgRowTopOffset = sharedLogoBandH > 0 ? sharedLogoBandH + 6.5 : 5.5;
        const deptRowTopOffset = orgRowTopOffset + maxOrgLines * 3.6 + (maxOrgLines > 0 ? 1.2 : 0);
        const headerRowMinHeight = Math.max(
          deptRowTopOffset + (maxDeptLines > 0 ? maxDeptLines * 3.4 : 0) + 4,
          20
        );

        autoTable(doc, {
          startY: currentY,
          margin: { top: 34, bottom: 15, left: 14, right: 14 },
          tableWidth: usableWidth,
          head: [[
            {
              content: '',
              styles: {
                halign: 'left',
                valign: 'top',
                minCellHeight: headerRowMinHeight
              }
            } as any,
            {
              content: '',
              styles: {
                halign: 'right',
                valign: 'top',
                minCellHeight: headerRowMinHeight
              }
            } as any
          ]],
          body: [
            [
              {
                content: cleanPdfText(
                  [covChart.bannerTitle, covChart.bannerSubtitle].filter(Boolean).join('\n')
                ),
                colSpan: 2,
                styles: {
                  halign: 'center',
                  fillColor: [194, 65, 12],
                  textColor: [255, 255, 255],
                  fontStyle: 'bold',
                  fontSize: 9.2,
                  cellPadding: bannerDims
                    ? { top: bannerDims.h + 6, right: 4.5, bottom: 4.5, left: 4.5 }
                    : 4.5
                }
              } as any
            ],
            [
              {
                content: cleanPdfText(
                  [covChart.docTitle, covChart.docSubtitle].filter(Boolean).join('\n\n')
                ),
                colSpan: 2,
                styles: {
                  halign: 'center',
                  fillColor: [255, 247, 237],
                  textColor: [194, 65, 12],
                  fontStyle: 'bold',
                  fontSize: 10,
                  cellPadding: 5
                }
              } as any
            ],
            [
              cleanPdfText(
                [covChart.bottomLeftStructure, covChart.bottomLeftZone].filter(Boolean).join('\n\n')
              ),
              cleanPdfText(
                [covChart.bottomRightDateVersion, covChart.bottomRightStatus].filter(Boolean).join('\n\n')
              )
            ]
          ],
          theme: 'grid',
          styles: {
            fillColor: [255, 255, 255],
            textColor: [15, 23, 42],
            fontSize: 8,
            cellPadding: 3,
            valign: 'middle',
            overflow: 'linebreak'
          },
          columnStyles: {
            0: { halign: 'left', valign: 'middle', fontStyle: 'bold', cellWidth: usableWidth / 2 },
            1: { halign: 'right', valign: 'middle', fontStyle: 'bold', cellWidth: usableWidth / 2 }
          },
          headStyles: {
            fillColor: [248, 250, 252],
            textColor: [194, 65, 12],
            fontSize: 8.2,
            fontStyle: 'normal',
            valign: 'top',
            minCellHeight: headerRowMinHeight,
            cellPadding: 3.5
          },
          didDrawCell: data => {
            if (data.section === 'head' && data.row.index === 0) {
              const orgStartY = data.cell.y + orgRowTopOffset;
              const deptStartY = data.cell.y + deptRowTopOffset;

              if (data.column.index === 0) {
                const leftBlockX = data.cell.x + edgeInset;
                const leftCenterX = leftBlockX + headerTextMaxWidth / 2;

                if (covChart.leftLogoDataUrl && leftLogoDims) {
                  safeAddImageFit(
                    covChart.leftLogoDataUrl,
                    leftCenterX - logoBoxMaxW / 2,
                    data.cell.y + 2.5,
                    logoBoxMaxW,
                    sharedLogoBandH,
                    'center',
                    'center'
                  );
                }
                if (leftOrgLines.length > 0) {
                  let textY = orgStartY;
                  doc.setFont('helvetica', 'bold');
                  doc.setFontSize(8.2);
                  doc.setTextColor(15, 23, 42);
                  leftOrgLines.forEach(line => {
                    doc.text(line, leftCenterX, textY, { align: 'center' });
                    textY += 3.6;
                  });
                }
                if (leftDeptLines.length > 0) {
                  let textY = deptStartY;
                  doc.setFont('helvetica', 'normal');
                  doc.setFontSize(7.6);
                  doc.setTextColor(71, 85, 105);
                  leftDeptLines.forEach(line => {
                    doc.text(line, leftCenterX, textY, { align: 'center' });
                    textY += 3.4;
                  });
                }
              }
              if (data.column.index === 1) {
                const rightBlockRightX = data.cell.x + data.cell.width - edgeInset;
                const rightCenterX = rightBlockRightX - headerTextMaxWidth / 2;

                if (covChart.rightLogoDataUrl && rightLogoDims) {
                  safeAddImageFit(
                    covChart.rightLogoDataUrl,
                    rightCenterX - logoBoxMaxW / 2,
                    data.cell.y + 2.5,
                    logoBoxMaxW,
                    sharedLogoBandH,
                    'center',
                    'center'
                  );
                }
                if (rightOrgLines.length > 0) {
                  let textY = orgStartY;
                  doc.setFont('helvetica', 'bold');
                  doc.setFontSize(8.2);
                  doc.setTextColor(15, 23, 42);
                  rightOrgLines.forEach(line => {
                    doc.text(line, rightCenterX, textY, { align: 'center' });
                    textY += 3.6;
                  });
                }
                if (rightDeptLines.length > 0) {
                  let textY = deptStartY;
                  doc.setFont('helvetica', 'normal');
                  doc.setFontSize(7.6);
                  doc.setTextColor(71, 85, 105);
                  rightDeptLines.forEach(line => {
                    doc.text(line, rightCenterX, textY, { align: 'center' });
                    textY += 3.4;
                  });
                }
              }
            }
            if (
              data.section === 'body' &&
              data.row.index === 0 &&
              data.column.index === 0 &&
              covChart.bannerImageDataUrl &&
              bannerDims
            ) {
              safeAddImageFit(
                covChart.bannerImageDataUrl,
                data.cell.x + 10,
                data.cell.y + 2.5,
                data.cell.width - 20,
                bannerDims.h,
                'center',
                'top'
              );
            }
          },
          didDrawPage: () => {
            drawTopBannerOnly(pageData.pageTitle, pageData.pageSubtitle);
          }
        });
        currentY = (doc as any).lastAutoTable.finalY + 4.5;
      }

      if (sec.adminLetterHeader) {
        ensurePageSpace(45);
        const hdr = sec.adminLetterHeader;
        const logoUrl = hdr.rightLogoDataUrl || hdr.leftLogoDataUrl;
        const logoDims = getScaledImageDimensions(logoUrl, 42, 16);

        autoTable(doc, {
          startY: currentY,
          margin: { top: 34, bottom: 15, left: 14, right: 14 },
          tableWidth: usableWidth,
          head: [['EXPÉDITEUR / TIMBRE OFFICIEL', 'LIEU, DATE & DESTINATAIRE']],
          body: [
            [
              {
                content: cleanPdfText(
                  `${hdr.senderInstitution}\n${hdr.senderName} — ${hdr.senderRole}\n${hdr.senderContact}\nN° Réf : ${hdr.referenceCode}`
                ),
                styles: {
                  cellPadding: logoDims
                    ? { top: logoDims.h + 5, right: 3, bottom: 3, left: 3 }
                    : 3
                }
              } as any,
              cleanPdfText(
                `${hdr.cityAndDate}\n\nÀ L’ATTENTION DE :\n${hdr.recipientTitle}\n${hdr.recipientOrg}`
              )
            ],
            [
              {
                content: cleanPdfText(`OBJET : ${hdr.subjectLine}\nRÉF. DOSSIER : ${hdr.dossierRefLine}`),
                colSpan: 2,
                styles: {
                  fillColor: [255, 247, 237],
                  textColor: [194, 65, 12],
                  fontStyle: 'bold',
                  fontSize: 8.3,
                  cellPadding: 3.2
                }
              } as any
            ]
          ],
          theme: 'grid',
          styles: {
            fillColor: [255, 255, 255],
            textColor: [15, 23, 42],
            fontSize: 8,
            cellPadding: 3,
            overflow: 'linebreak'
          },
          columnStyles: {
            0: { halign: 'left', fontStyle: 'bold', cellWidth: usableWidth / 2 },
            1: { halign: 'right', fontStyle: 'bold', cellWidth: usableWidth / 2 }
          },
          headStyles: { fillColor: [194, 65, 12], textColor: [255, 255, 255], fontSize: 7.8, fontStyle: 'bold' },
          didDrawCell: data => {
            if (data.section === 'body' && data.row.index === 0 && data.column.index === 0 && logoUrl && logoDims) {
              safeAddImageFit(logoUrl, data.cell.x + 3, data.cell.y + 2, 42, logoDims.h, 'left', 'top');
            }
          },
          didDrawPage: () => {
            drawTopBannerOnly(pageData.pageTitle, pageData.pageSubtitle);
          }
        });
        currentY = (doc as any).lastAutoTable.finalY + 4;
      }

      if (sec.cvHeaderBanner) {
        ensurePageSpace(isCvExecDoc ? 38 : 46);
        const cvHdr = sec.cvHeaderBanner;
        const hasProfilePhoto = Boolean(cvHdr.profilePhotoDataUrl);
        const photoCellMinH = isCvExecDoc ? 36 : 42;
        const maxPhotoW = isCvExecDoc ? 27 : 31;
        const maxPhotoH = isCvExecDoc ? 34 : 40;
        const bannerTextParts = [
          cvHdr.fullNameUpper,
          cvHdr.expertTitleLine,
          cvHdr.contactLine,
          cvHdr.metaSubLine
        ].filter(Boolean);

        autoTable(doc, {
          startY: currentY,
          margin: { top: 32, bottom: bottomSafeMarginMm, left: 14, right: 14 },
          tableWidth: usableWidth,
          rowPageBreak: 'avoid',
          head: hasProfilePhoto
            ? [[cleanPdfText(cvHdr.docBadge), 'PHOTO D’IDENTITÉ']]
            : [[cleanPdfText(cvHdr.docBadge)]],
          body: [
            hasProfilePhoto
              ? [
                  cleanPdfText(bannerTextParts.join(isCvExecDoc ? '\n' : '\n\n')),
                  {
                    content: '',
                    styles: {
                      minCellHeight: photoCellMinH,
                      valign: 'middle',
                      halign: 'center'
                    }
                  } as any
                ]
              : [cleanPdfText(bannerTextParts.join(isCvExecDoc ? '\n' : '\n\n'))]
          ],
          theme: 'grid',
          styles: {
            fillColor: [255, 255, 255],
            textColor: [15, 23, 42],
            fontSize: isCvExecDoc ? 7.4 : 7.8,
            cellPadding: isCvExecDoc ? 2 : 2.5,
            overflow: 'linebreak'
          },
          columnStyles: hasProfilePhoto
            ? {
                0: { halign: 'left', fontStyle: 'bold', cellWidth: Number((usableWidth * 0.78).toFixed(2)) },
                1: { halign: 'center', fontStyle: 'bold', cellWidth: Number((usableWidth * 0.22).toFixed(2)) }
              }
            : {
                0: { halign: 'left', fontStyle: 'bold', cellWidth: usableWidth }
              },
          headStyles: {
            fillColor: [194, 65, 12],
            textColor: [255, 255, 255],
            fontSize: isCvExecDoc ? 7.2 : 7.5,
            fontStyle: 'bold',
            cellPadding: isCvExecDoc ? 1.6 : 2,
            overflow: 'linebreak'
          },
          didDrawCell: data => {
            if (data.section === 'body' && data.row.index === 0 && data.column.index === 1 && cvHdr.profilePhotoDataUrl) {
              const fitW = Math.min(maxPhotoW, data.cell.width - 4);
              const fitH = Math.min(maxPhotoH, data.cell.height - 4);
              const boxX = data.cell.x + (data.cell.width - fitW) / 2;
              const boxY = data.cell.y + (data.cell.height - fitH) / 2;
              safeAddImageFit(
                cvHdr.profilePhotoDataUrl,
                boxX,
                boxY,
                fitW,
                fitH,
                'center',
                'center'
              );
            }
          },
          didDrawPage: () => {
            drawTopBannerOnly(pageData.pageTitle, pageData.pageSubtitle);
          }
        });
        currentY = (doc as any).lastAutoTable.finalY + sectionGapMm;
      }

      if (sec.operationalHeaderBanner) {
        ensurePageSpace(42);
        const opHdr = sec.operationalHeaderBanner;
        const leftLogoDims = getScaledImageDimensions(opHdr.rightLogoDataUrl, 38, 16);
        const rightLogoDims = getScaledImageDimensions(opHdr.leftLogoDataUrl, 38, 16);

        autoTable(doc, {
          startY: currentY,
          margin: { top: 34, bottom: 15, left: 14, right: 14 },
          tableWidth: usableWidth,
          head: [['STRUCTURE ÉMETTRICE / PILOTE', 'EN-TÊTE OPÉRATIONNEL OFFICIEL', 'INSTITUTION PARTENAIRE / BAILLEUR']],
          body: [
            [
              {
                content: cleanPdfText(opHdr.leftLogoLabel),
                styles: {
                  valign: 'middle',
                  cellPadding: leftLogoDims
                    ? { top: leftLogoDims.h + 4.5, right: 2.8, bottom: 2.8, left: 2.8 }
                    : 2.8
                }
              } as any,
              cleanPdfText(
                `${opHdr.centerDocTitle}\n\n${opHdr.centerSubTitle}\n${opHdr.referenceAndDateLine}`
              ),
              {
                content: cleanPdfText(opHdr.rightLogoLabel),
                styles: {
                  valign: 'middle',
                  cellPadding: rightLogoDims
                    ? { top: rightLogoDims.h + 4.5, right: 2.8, bottom: 2.8, left: 2.8 }
                    : 2.8
                }
              } as any
            ]
          ],
          theme: 'grid',
          styles: {
            fillColor: [255, 255, 255],
            textColor: [15, 23, 42],
            fontSize: 7.8,
            cellPadding: 2.8,
            valign: 'middle',
            overflow: 'linebreak'
          },
          columnStyles: {
            0: { halign: 'left', valign: 'middle', fontStyle: 'bold', cellWidth: Number((usableWidth * 0.24).toFixed(2)) },
            1: {
              halign: 'center',
              valign: 'middle',
              fontStyle: 'bold',
              fillColor: [255, 247, 237],
              textColor: [194, 65, 12],
              cellWidth: Number((usableWidth * 0.52).toFixed(2))
            },
            2: { halign: 'right', valign: 'middle', fontStyle: 'bold', cellWidth: Number((usableWidth * 0.24).toFixed(2)) }
          },
          headStyles: { fillColor: [194, 65, 12], textColor: [255, 255, 255], fontSize: 7.4, fontStyle: 'bold' },
          didDrawCell: data => {
            if (data.section === 'body' && data.row.index === 0) {
              if (data.column.index === 0 && opHdr.rightLogoDataUrl && leftLogoDims) {
                safeAddImageFit(
                  opHdr.rightLogoDataUrl,
                  data.cell.x + 3,
                  data.cell.y + 2,
                  38,
                  leftLogoDims.h,
                  'left',
                  'top'
                );
              }
              if (data.column.index === 2 && opHdr.leftLogoDataUrl && rightLogoDims) {
                safeAddImageFit(
                  opHdr.leftLogoDataUrl,
                  data.cell.x + data.cell.width - 41,
                  data.cell.y + 2,
                  38,
                  rightLogoDims.h,
                  'right',
                  'top'
                );
              }
            }
          },
          didDrawPage: () => {
            drawTopBannerOnly(pageData.pageTitle, pageData.pageSubtitle);
          }
        });
        currentY = (doc as any).lastAutoTable.finalY + 4;
      }

      if (sec.keyValueRows && sec.keyValueRows.length > 0) {
        ensurePageSpace(30);
        autoTable(doc, {
          startY: currentY,
          margin: { top: 34, bottom: bottomSafeMarginMm, left: 14, right: 14 },
          tableWidth: usableWidth,
          rowPageBreak: 'avoid',
          head: [[cleanPdfText(sec.heading), 'INFORMATIONS OFFICIELLES']],
          body: sec.keyValueRows.map(([k, v]) => [cleanPdfText(k), cleanPdfText(v)]),
          theme: 'grid',
          styles: {
            fillColor: [255, 255, 255],
            textColor: [15, 23, 42],
            fontSize: isAnyCvDoc ? 7.5 : 8,
            cellPadding: isAnyCvDoc ? 1.8 : 2.5,
            overflow: 'linebreak'
          },
          columnStyles: {
            0: { fontStyle: 'bold', cellWidth: 64, fillColor: [255, 247, 237] },
            1: { cellWidth: usableWidth - 64 }
          },
          headStyles: {
            fillColor: [194, 65, 12],
            textColor: [255, 255, 255],
            fontSize: isAnyCvDoc ? 7.5 : 8.2,
            fontStyle: 'bold',
            cellPadding: isAnyCvDoc ? 1.6 : 2.2,
            overflow: 'linebreak'
          },
          didDrawPage: () => {
            drawTopBannerOnly(pageData.pageTitle, pageData.pageSubtitle);
          }
        });
        currentY = (doc as any).lastAutoTable.finalY + sectionGapMm;
      }

      if ((sec.paragraphs && sec.paragraphs.length > 0) || (sec.bullets && sec.bullets.length > 0)) {
        ensurePageSpace(28);
        const textRows: string[][] = [];
        if (sec.paragraphs) {
          sec.paragraphs.forEach(p => textRows.push([cleanPdfText(p)]));
        }
        if (sec.bullets) {
          sec.bullets.forEach(b => textRows.push([cleanPdfText(`• ${b}`)]));
        }
        autoTable(doc, {
          startY: currentY,
          margin: { top: 34, bottom: bottomSafeMarginMm, left: 14, right: 14 },
          tableWidth: usableWidth,
          rowPageBreak: 'avoid',
          head: [[cleanPdfText(sec.heading)]],
          body: textRows,
          theme: 'grid',
          styles: {
            fillColor: [255, 255, 255],
            textColor: [15, 23, 42],
            fontSize: isCvExecDoc ? 7.2 : isCvDetailDoc ? 7.5 : 8,
            cellPadding: isCvExecDoc ? 1.6 : isCvDetailDoc ? 2 : 2.5,
            overflow: 'linebreak'
          },
          headStyles: {
            fillColor: [234, 88, 12],
            textColor: [255, 255, 255],
            fontSize: isCvExecDoc ? 7.3 : isCvDetailDoc ? 7.6 : 8.2,
            fontStyle: 'bold',
            cellPadding: isCvExecDoc ? 1.5 : isCvDetailDoc ? 1.8 : 2.2,
            overflow: 'linebreak'
          },
          didDrawPage: () => {
            drawTopBannerOnly(pageData.pageTitle, pageData.pageSubtitle);
          }
        });
        currentY = (doc as any).lastAutoTable.finalY + sectionGapMm;
      }

      if (sec.figureImage && sec.figureImage.dataUrl) {
        const figImg = sec.figureImage;
        const figDims = getScaledImageDimensions(figImg.dataUrl, usableWidth - 16, 62);
        const cellH = (figDims?.h || 42) + 6;
        ensurePageSpace(cellH + 16);

        autoTable(doc, {
          startY: currentY,
          margin: { top: 34, bottom: 15, left: 14, right: 14 },
          tableWidth: usableWidth,
          rowPageBreak: 'avoid',
          head: [[cleanPdfText(figImg.caption)]],
          body: [
            [
              {
                content: '',
                styles: { minCellHeight: cellH }
              } as any
            ]
          ],
          theme: 'grid',
          styles: { fillColor: [255, 255, 255], textColor: [15, 23, 42], fontSize: 7.8, halign: 'center' },
          headStyles: { fillColor: [194, 65, 12], textColor: [255, 255, 255], fontSize: 7.8, fontStyle: 'bold', halign: 'center' },
          didDrawCell: data => {
            if (data.section === 'body' && data.row.index === 0 && figDims) {
              safeAddImageFit(
                figImg.dataUrl,
                data.cell.x + 8,
                data.cell.y + 3,
                data.cell.width - 16,
                figDims.h,
                'center',
                'center'
              );
            }
          },
          didDrawPage: () => {
            drawTopBannerOnly(pageData.pageTitle, pageData.pageSubtitle);
          }
        });
        currentY = (doc as any).lastAutoTable.finalY + 4.5;
      }

      // Annexe Photographique de Terrain (Images du Terrain + Descriptifs en dessous de chaque image)
      if (sec.fieldPhotosAnnex) {
        const photos = (sec.fieldPhotosAnnex.photos || []).filter(p => Boolean(p.dataUrl || p.caption));
        if (photos.length > 0) {
          ensurePageSpace(65);
          // Group field photos in pairs (2 per row) with natural aspect ratio & caption row directly below each image
          for (let i = 0; i < photos.length; i += 2) {
            const leftPhoto = photos[i];
            const rightPhoto = photos[i + 1];
            const isSingleInPair = !rightPhoto;

            const maxImgW = isSingleInPair ? usableWidth - 24 : usableWidth / 2 - 10;
            const maxImgH = isSingleInPair ? 60 : 48;

            const leftDims = getScaledImageDimensions(leftPhoto?.dataUrl, maxImgW, maxImgH);
            const rightDims = getScaledImageDimensions(rightPhoto?.dataUrl, maxImgW, maxImgH);
            const rowImgCellH = Math.max(leftDims?.h || 32, rightDims?.h || 0) + 6;

            ensurePageSpace(rowImgCellH + 26);

            const leftHeaderLabel = `IMAGE DE TERRAIN N°${i + 1}${
              leftPhoto?.locationDate ? ` — ${leftPhoto.locationDate}` : ''
            }`;
            const rightHeaderLabel = rightPhoto
              ? `IMAGE DE TERRAIN N°${i + 2}${
                  rightPhoto.locationDate ? ` — ${rightPhoto.locationDate}` : ''
                }`
              : '';

            const sectionTitleRow =
              i === 0
                ? [
                    [
                      {
                        content: cleanPdfText(sec.heading),
                        colSpan: isSingleInPair ? 1 : 2,
                        styles: {
                          fillColor: [194, 65, 12],
                          textColor: [255, 255, 255],
                          fontSize: 8.2,
                          fontStyle: 'bold',
                          halign: 'left'
                        }
                      } as any
                    ]
                  ]
                : [];

            autoTable(doc, {
              startY: currentY,
              margin: { top: 34, bottom: 15, left: 14, right: 14 },
              tableWidth: usableWidth,
              rowPageBreak: 'avoid',
              head: [
                ...sectionTitleRow,
                isSingleInPair
                  ? [cleanPdfText(leftHeaderLabel)]
                  : [cleanPdfText(leftHeaderLabel), cleanPdfText(rightHeaderLabel)]
              ],
              body: [
                // Row 0: Field Image(s)
                isSingleInPair
                  ? [
                      {
                        content: '',
                        styles: {
                          minCellHeight: rowImgCellH,
                          halign: 'center',
                          valign: 'middle'
                        }
                      } as any
                    ]
                  : [
                      {
                        content: '',
                        styles: {
                          minCellHeight: rowImgCellH,
                          halign: 'center',
                          valign: 'middle'
                        }
                      } as any,
                      {
                        content: '',
                        styles: {
                          minCellHeight: rowImgCellH,
                          halign: 'center',
                          valign: 'middle'
                        }
                      } as any
                    ],
                // Row 1: Descriptive Caption(s) directly below the field image(s)
                isSingleInPair
                  ? [
                      {
                        content: cleanPdfText(
                          `Descriptif sous l’Image N°${i + 1} :\n${
                            leftPhoto?.caption || 'Descriptif du constat visuel de terrain.'
                          }`
                        ),
                        styles: {
                          fillColor: [255, 247, 237],
                          textColor: [15, 23, 42],
                          fontSize: 7.8,
                          cellPadding: 3
                        }
                      } as any
                    ]
                  : [
                      {
                        content: cleanPdfText(
                          `Descriptif sous l’Image N°${i + 1} :\n${
                            leftPhoto?.caption || 'Descriptif du constat visuel de terrain.'
                          }`
                        ),
                        styles: {
                          fillColor: [255, 247, 237],
                          textColor: [15, 23, 42],
                          fontSize: 7.8,
                          cellPadding: 3
                        }
                      } as any,
                      {
                        content: cleanPdfText(
                          `Descriptif sous l’Image N°${i + 2} :\n${
                            rightPhoto?.caption || 'Descriptif du constat visuel de terrain.'
                          }`
                        ),
                        styles: {
                          fillColor: [255, 247, 237],
                          textColor: [15, 23, 42],
                          fontSize: 7.8,
                          cellPadding: 3
                        }
                      } as any
                    ]
              ],
              theme: 'grid',
              styles: {
                fillColor: [255, 255, 255],
                textColor: [15, 23, 42],
                fontSize: 7.8,
                cellPadding: 2.5,
                overflow: 'linebreak'
              },
              columnStyles: isSingleInPair
                ? { 0: { cellWidth: usableWidth } }
                : {
                    0: { cellWidth: usableWidth / 2 },
                    1: { cellWidth: usableWidth / 2 }
                  },
              headStyles: {
                fillColor: [234, 88, 12],
                textColor: [255, 255, 255],
                fontSize: 7.6,
                fontStyle: 'bold',
                overflow: 'linebreak'
              },
              didDrawCell: data => {
                if (data.section === 'body' && data.row.index === 0) {
                  if (data.column.index === 0 && leftPhoto?.dataUrl && leftDims) {
                    safeAddImageFit(
                      leftPhoto.dataUrl,
                      data.cell.x + 4,
                      data.cell.y + 3,
                      data.cell.width - 8,
                      data.cell.height - 6,
                      'center',
                      'center'
                    );
                  }
                  if (data.column.index === 1 && rightPhoto?.dataUrl && rightDims) {
                    safeAddImageFit(
                      rightPhoto.dataUrl,
                      data.cell.x + 4,
                      data.cell.y + 3,
                      data.cell.width - 8,
                      data.cell.height - 6,
                      'center',
                      'center'
                    );
                  }
                }
              },
              didDrawPage: () => {
                drawTopBannerOnly(pageData.pageTitle, pageData.pageSubtitle);
              }
            });
            currentY = (doc as any).lastAutoTable.finalY + 4;
          }
        }
      }

      if (sec.table) {
        ensurePageSpace(30);
        const dynamicColStyles: Record<number, any> = {};
        const colWidths = sec.table.columnWidths;
        const rightCols = sec.table.rightAlignCols || [];

        if (colWidths && colWidths.length === sec.table.headers.length) {
          colWidths.forEach((pct, cIdx) => {
            dynamicColStyles[cIdx] = {
              cellWidth: Number(((usableWidth * pct) / 100).toFixed(2)),
              ...(rightCols.includes(cIdx) ? { halign: 'right', fontStyle: 'bold' } : {}),
              ...(cIdx === 0 ? { fontStyle: 'bold' } : {})
            };
          });
        } else {
          rightCols.forEach(cIdx => {
            dynamicColStyles[cIdx] = { halign: 'right', fontStyle: 'bold' };
          });
        }

        autoTable(doc, {
          startY: currentY,
          margin: { top: 34, bottom: bottomSafeMarginMm, left: 14, right: 14 },
          tableWidth: usableWidth,
          head: [sec.table.headers.map(h => cleanPdfText(h))],
          body: sec.table.rows.map(row => row.map(c => cleanPdfText(c))),
          theme: 'grid',
          rowPageBreak: 'avoid',
          styles: {
            fillColor: [255, 255, 255],
            textColor: [15, 23, 42],
            fontSize: isCvExecDoc ? 6.9 : 7.2,
            cellPadding: isCvExecDoc ? 1.5 : 2,
            overflow: 'linebreak'
          },
          columnStyles: dynamicColStyles,
          headStyles: {
            fillColor: [194, 65, 12],
            textColor: [255, 255, 255],
            fontSize: isCvExecDoc ? 7.1 : 7.4,
            fontStyle: 'bold',
            cellPadding: isCvExecDoc ? 1.5 : 1.8,
            overflow: 'linebreak'
          },
          didDrawPage: () => {
            drawTopBannerOnly(pageData.pageTitle, pageData.pageSubtitle);
          }
        });
        currentY = (doc as any).lastAutoTable.finalY + sectionGapMm;
      }
    });

    if (pageData.isSignaturePage) {
      const orgStampDims = getScaledImageDimensions(pageData.orgStampDataUrl, 48, 22);
      const partnerStampDims = getScaledImageDimensions(pageData.partnerStampDataUrl, 48, 22);
      const maxStampH = Math.max(orgStampDims?.h || 0, partnerStampDims?.h || 0);

      if (currentY > pageHeight - (50 + maxStampH)) {
        doc.addPage();
        drawPageHeaderBanner(pageData.pageTitle, `${pageData.pageSubtitle} (Approbation & Signatures)`);
        currentY = 36;
      }
      autoTable(doc, {
        startY: currentY + 2,
        margin: { top: 34, bottom: bottomSafeMarginMm, left: 14, right: 14 },
        tableWidth: usableWidth,
        rowPageBreak: 'avoid',
        head: [[
          cleanPdfText(`POUR L’INSTITUTION (${userProfile.institution || 'AUTORITÉ PILOTE'})`),
          cleanPdfText(`POUR LA PARTIE PRENANTE (${customFields.recipientOrg || customFields.recipientRepresentative || 'PARTENAIRE'})`)
        ]],
        body: [[
          {
            content: cleanPdfText(
              `Nom : ${userProfile.fullName}\nFonction : ${userProfile.role}\nFait à ${customFields.locationCity}, le ${dateStr}\n\nSignature & Cachet Officiel :`
            ),
            styles: {
              cellPadding:
                maxStampH > 0
                  ? { top: 3, right: 3, bottom: maxStampH + 6, left: 3 }
                  : { top: 3, right: 3, bottom: 14, left: 3 }
            }
          } as any,
          {
            content: cleanPdfText(
              `Nom / Entité : ${customFields.recipientRepresentative || customFields.recipientOrg || '______________________'}\nFait à ${customFields.locationCity}, le ${dateStr}\n\nSignature & Cachet (« Lu et approuvé ») :`
            ),
            styles: {
              cellPadding:
                maxStampH > 0
                  ? { top: 3, right: 3, bottom: maxStampH + 6, left: 3 }
                  : { top: 3, right: 3, bottom: 14, left: 3 }
            }
          } as any
        ]],
        theme: 'grid',
        styles: {
          fillColor: [255, 255, 255],
          textColor: [15, 23, 42],
          fontSize: 7.8,
          cellPadding: 3,
          overflow: 'linebreak'
        },
        columnStyles: {
          0: { cellWidth: usableWidth / 2 },
          1: { cellWidth: usableWidth / 2 }
        },
        headStyles: { fillColor: [3, 105, 161], textColor: [255, 255, 255], fontSize: 7.8, fontStyle: 'bold', halign: 'center' },
        didDrawCell: data => {
          if (data.section === 'body' && data.row.index === 0) {
            if (data.column.index === 0 && pageData.orgStampDataUrl && orgStampDims) {
              safeAddImageFit(
                pageData.orgStampDataUrl,
                data.cell.x + 8,
                data.cell.y + data.cell.height - orgStampDims.h - 3,
                48,
                orgStampDims.h,
                'left',
                'bottom'
              );
            }
            if (data.column.index === 1 && pageData.partnerStampDataUrl && partnerStampDims) {
              safeAddImageFit(
                pageData.partnerStampDataUrl,
                data.cell.x + 8,
                data.cell.y + data.cell.height - partnerStampDims.h - 3,
                48,
                partnerStampDims.h,
                'left',
                'bottom'
              );
            }
          }
        },
        didDrawPage: () => {
          drawTopBannerOnly(pageData.pageTitle, pageData.pageSubtitle);
        }
      });
    }
  });

  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    // Clean white footer mask + top rule so footer never overlaps content or overflows horizontally
    doc.setFillColor(255, 255, 255);
    doc.rect(0, pageHeight - 13.5, pageWidth, 13.5, 'F');
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.25);
    doc.line(14, pageHeight - 12, pageWidth - 14, pageHeight - 12);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.8);
    doc.setTextColor(100, 116, 139);
    const shortTitle = cleanPdfText(cfg.officialTitle || cfg.selectLabel);
    const leftFooterStr = cleanPdfText(
      `faab gar · ${shortTitle} (${customFields.referenceCode || docType.toUpperCase()}) · ${
        userProfile.institution || 'Usage Institutionnel'
      }`
    );
    const clampedFooterLines = doc.splitTextToSize(leftFooterStr, usableWidth - 28);
    doc.text(clampedFooterLines[0] || '', 14, pageHeight - 7);

    // Right page badge
    doc.setFillColor(194, 65, 12);
    doc.roundedRect(pageWidth - 14 - 24, pageHeight - 10.5, 24, 5, 1, 1, 'F');
    doc.setTextColor(253, 186, 116);
    doc.setFontSize(6.8);
    doc.text(`Page ${p} / ${totalPages}`, pageWidth - 14 - 12, pageHeight - 7.1, {
      align: 'center'
    });
  }

  const pdfFileName = `FAAB_PLAN_${docType.toUpperCase()}_${(customFields.referenceCode || 'OFFICIEL').replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`;
  try {
    const pdfBlob = doc.output('blob');
    return await saveProgramFile({
      programName: dossier.name,
      fileName: pdfFileName,
      content: pdfBlob,
      mimeType: 'application/pdf'
    });
  } catch {
    doc.save(pdfFileName);
    return {
      success: true,
      mode: 'download',
      path: `faab-plan/${dossier.name}/${pdfFileName}`,
      fileName: pdfFileName
    };
  }
}

/**
 * Génère le PDF Paysage 16:9 (297mm x 167.06mm) pour les 7 Présentations de Réunion (Docs 16 à 22)
 * Règle stricte : 1 Slide active = 1 Page Paysage complète sans coupure ni troncature, avec graphiques vectoriels.
 */
async function generateSlidePresentationLandscapePDF(
  docType: InstitutionalDocType,
  customFields: CustomDocFields,
  dossier: Dossier,
  userProfile: UserProfile,
  currency: CurrencyCode,
  lang: LanguageCode
): Promise<SaveProgramFileResult> {
  await ensureProgramDirectoryAccessBeforeHeavyTask();
  const slideW = 297;
  const slideH = 167.06; // Ratio 16:9 exact (297 / 16 * 9)

  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: [slideW, slideH]
  });

  const cleanPdfText = (val: string = ''): string =>
    String(val || '')
      .replace(/[\u202F\u00A0]/g, ' ')
      .replace(/→/g, '->')
      .replace(/◆/g, '[Jalon]')
      .replace(/≥/g, '>=')
      .replace(/≤/g, '<=')
      .replace(/▸/g, '>');

  const hexToRgb = (hex: string): [number, number, number] => {
    const clean = (hex || '#c2410c').replace('#', '').trim();
    if (clean.length === 6) {
      const r = parseInt(clean.slice(0, 2), 16);
      const g = parseInt(clean.slice(2, 4), 16);
      const b = parseInt(clean.slice(4, 6), 16);
      if (!isNaN(r) && !isNaN(g) && !isNaN(b)) return [r, g, b];
    }
    return [194, 65, 12];
  };

  const dateStr = cleanPdfText(
    new Date().toLocaleDateString(lang === 'FR' ? 'fr-FR' : 'en-US', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    })
  );

  const cfg = DOC_TEMPLATE_CONFIGS[docType];
  const allSlides = buildInstitutionalSlideDeck(
    docType,
    customFields,
    dossier,
    userProfile,
    currency,
    lang
  );
  const activeSlides = allSlides.filter(s => !s.excluded);
  const excludedSet = new Set(parseExcludedFields(customFields.excludedFieldsJson));
  const includeSignatures = !excludedSet.has(HIDE_SIGNATURES_KEY);

  const getScaledDims = (
    dataUrl: string | undefined,
    maxW: number,
    maxH: number
  ): { w: number; h: number } | null => {
    if (!dataUrl || !dataUrl.startsWith('data:image/')) return null;
    try {
      const props = doc.getImageProperties(dataUrl);
      if (props && props.width > 0 && props.height > 0) {
        const ratio = props.width / props.height;
        let w = maxW;
        let h = w / ratio;
        if (h > maxH) {
          h = maxH;
          w = h * ratio;
        }
        return { w: Number(w.toFixed(2)), h: Number(h.toFixed(2)) };
      }
    } catch {
      // ignore
    }
    return { w: maxW, h: maxH };
  };

  const drawFittedImage = (
    dataUrl: string | undefined,
    boxX: number,
    boxY: number,
    maxW: number,
    maxH: number
  ) => {
    if (!dataUrl || !dataUrl.startsWith('data:image/')) return;
    try {
      const dims = getScaledDims(dataUrl, maxW, maxH);
      if (!dims) return;
      const drawX = boxX + (maxW - dims.w) / 2;
      const drawY = boxY + (maxH - dims.h) / 2;
      const fmt =
        dataUrl.includes('image/jpeg') || dataUrl.includes('image/jpg') ? 'JPEG' : 'PNG';
      doc.addImage(dataUrl, fmt, drawX, drawY, dims.w, dims.h);
    } catch {
      // ignore
    }
  };

  // Dessine un secteur angulaire plein (pour le Camembert / Donut vectoriel dans jsPDF)
  const drawPieSlice = (
    cx: number,
    cy: number,
    r: number,
    startAngleRad: number,
    endAngleRad: number,
    rgb: [number, number, number]
  ) => {
    const span = endAngleRad - startAngleRad;
    if (span <= 0.001) return;
    const steps = Math.max(8, Math.ceil((span / (2 * Math.PI)) * 48));
    doc.setFillColor(rgb[0], rgb[1], rgb[2]);
    doc.setDrawColor(rgb[0], rgb[1], rgb[2]);
    doc.setLineWidth(0.1);
    for (let i = 0; i < steps; i++) {
      const a1 = startAngleRad + (span * i) / steps;
      const a2 = startAngleRad + (span * (i + 1)) / steps;
      const x1 = cx + r * Math.cos(a1);
      const y1 = cy + r * Math.sin(a1);
      const x2 = cx + r * Math.cos(a2);
      const y2 = cy + r * Math.sin(a2);
      doc.triangle(cx, cy, x1, y1, x2, y2, 'FD');
    }
  };

  // Dessine un Graphique Vectoriel (Donut/Camembert ou Histogramme Barres) dans une carte dédiée
  const drawSlideChartInPDF = (
    chart: NonNullable<typeof activeSlides[number]['chart']>,
    boxX: number,
    boxY: number,
    boxW: number,
    boxH: number
  ) => {
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(186, 230, 253);
    doc.setLineWidth(0.35);
    doc.roundedRect(boxX, boxY, boxW, boxH, 2, 2, 'FD');
    doc.setFillColor(234, 88, 12);
    doc.rect(boxX, boxY, 1.8, boxH, 'F');

    // En-tête de la carte graphique
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.2);
    doc.setTextColor(194, 65, 12);
    const chartTitleLines = doc
      .splitTextToSize(cleanPdfText(chart.title.toUpperCase()), boxW - 10)
      .slice(0, 2);
    doc.text(chartTitleLines, boxX + 4.5, boxY + 5);

    const subTitleY = boxY + 5 + chartTitleLines.length * 3.4;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    doc.setTextColor(100, 116, 139);
    const chartSubLines = doc
      .splitTextToSize(cleanPdfText(chart.subtitle), boxW - 10)
      .slice(0, 1);
    doc.text(chartSubLines, boxX + 4.5, subTitleY);

    const separatorY = subTitleY + 2.2;
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.2);
    doc.line(boxX + 4, separatorY, boxX + boxW - 4, separatorY);

    const innerTopY = separatorY + 2.5;
    const innerH = boxY + boxH - innerTopY - 2;

    if (chart.type === 'donut') {
      const totalVal =
        chart.items.reduce((acc, it) => acc + Math.max(0, it.value), 0) || 1;
      const outerR = Math.min(18, Math.max(12, innerH / 2 - 2));
      const innerR = outerR * 0.58;
      const donutCx = boxX + 6 + outerR;
      const donutCy = innerTopY + innerH / 2;

      let currentAngle = -Math.PI / 2;
      chart.items.forEach(item => {
        const val = Math.max(0, item.value);
        if (val <= 0) return;
        const sliceAngle = (val / totalVal) * (2 * Math.PI);
        const rgb = hexToRgb(item.colorHex);
        drawPieSlice(donutCx, donutCy, outerR, currentAngle, currentAngle + sliceAngle, rgb);
        currentAngle += sliceAngle;
      });

      // Trou central du Donut
      doc.setFillColor(255, 255, 255);
      doc.circle(donutCx, donutCy, innerR, 'F');

      if (chart.centerLabel) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(5.5);
        doc.setTextColor(100, 116, 139);
        doc.text(
          cleanPdfText(chart.centerLabel.toUpperCase()),
          donutCx,
          donutCy - 1.2,
          { align: 'center' }
        );
      }
      if (chart.centerValue) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.2);
        doc.setTextColor(194, 65, 12);
        doc.text(cleanPdfText(chart.centerValue), donutCx, donutCy + 2.8, {
          align: 'center'
        });
      }

      // Légende claire à droite du Donut
      const legX = donutCx + outerR + 6;
      const legW = boxX + boxW - legX - 3.5;
      const itemCount = Math.min(5, chart.items.length);
      const rowStep = Math.min(11, innerH / Math.max(1, itemCount));
      let curLegY = innerTopY + 2;

      chart.items.slice(0, itemCount).forEach(item => {
        const rgb = hexToRgb(item.colorHex);
        doc.setFillColor(rgb[0], rgb[1], rgb[2]);
        doc.roundedRect(legX, curLegY, 3, 3, 0.5, 0.5, 'F');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        doc.setTextColor(15, 23, 42);
        const lblLine =
          doc.splitTextToSize(cleanPdfText(item.label), legW - 5)[0] || '';
        doc.text(lblLine, legX + 4.5, curLegY + 2.4);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.8);
        doc.setTextColor(194, 65, 12);
        const valLine =
          doc.splitTextToSize(
            cleanPdfText(
              `${item.displayValue}${item.sublabel ? ` • ${item.sublabel}` : ''}`
            ),
            legW - 5
          )[0] || '';
        doc.text(valLine, legX + 4.5, curLegY + 5.8);

        curLegY += rowStep;
      });
    } else {
      // Histogramme / Barres Horizontales
      const items = chart.items.slice(0, 6);
      const rowStep = Math.min(9.5, innerH / Math.max(1, items.length));
      let curBarY = innerTopY + 1.5;
      const barTrackX = boxX + 5;
      const barTrackW = boxW - 10;

      items.forEach(item => {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.8);
        doc.setTextColor(15, 23, 42);
        const leftLbl = cleanPdfText(
          `${item.label}${item.sublabel ? ` (${item.sublabel})` : ''}`
        );
        const rightVal = cleanPdfText(item.displayValue);
        const maxLeftW = barTrackW - doc.getTextWidth(rightVal) - 4;
        const clampedLeft =
          doc.splitTextToSize(leftLbl, Math.max(30, maxLeftW))[0] || '';
        doc.text(clampedLeft, barTrackX, curBarY + 2.3);

        doc.setTextColor(194, 65, 12);
        doc.text(rightVal, barTrackX + barTrackW, curBarY + 2.3, {
          align: 'right'
        });

        // Piste grise de la barre
        const trackY = curBarY + 3.4;
        const trackH = Math.min(3.2, Math.max(2.2, rowStep - 5.2));
        doc.setFillColor(241, 245, 249);
        doc.roundedRect(barTrackX, trackY, barTrackW, trackH, 1, 1, 'F');

        // Barre colorée
        const pct = Math.min(100, Math.max(4, item.pct || 0));
        const fillW = Math.max(2.5, (barTrackW * pct) / 100);
        const rgb = hexToRgb(item.colorHex);
        doc.setFillColor(rgb[0], rgb[1], rgb[2]);
        doc.roundedRect(barTrackX, trackY, fillW, trackH, 1, 1, 'F');

        curBarY += rowStep;
      });
    }
  };

  const marginX = 10;
  const usableW = slideW - marginX * 2; // 277mm

  activeSlides.forEach((slide, idx) => {
    if (idx > 0) {
      doc.addPage([slideW, slideH], 'landscape');
    }

    // Fond blanc pur et bordure institutionnelle 16:9
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, slideW, slideH, 'F');
    doc.setDrawColor(194, 65, 12);
    doc.setLineWidth(0.7);
    doc.roundedRect(3, 3, slideW - 6, slideH - 6, 2, 2, 'S');

    // ========================================================================
    // SLIDE 1 : PAGE DE GARDE (CHARTE INSTITUTIONNELLE SYMÉTRIQUE A4)
    // ========================================================================
    if (slide.isCoverSlide && slide.coverData) {
      const cov = slide.coverData;
      const leftOrg =
        cov.leftOrgName || cov.leftLogo || 'Partenaires Techniques et Financiers';
      const leftDept =
        cov.leftDeptName || cov.leftDepartment || 'Direction des Opérations';
      const rightOrg =
        cov.rightOrgName ||
        cov.rightLogo ||
        dossier.institution ||
        'Structure Pilote du Programme';
      const rightDept =
        cov.rightDeptName ||
        cov.rightDepartment ||
        'Unité de Gestion du Projet (UGP)';
      const refCodeClean =
        cov.referenceCode || customFields.referenceCode || docType.toUpperCase();

      // 1. En-tête Institutionnel Symétrique (Bailleur à gauche | Agence Pilote à droite)
      const hdrY = 6.0;
      const hdrH = 34.0;
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.3);
      doc.roundedRect(marginX, hdrY, usableW, hdrH, 2, 2, 'FD');

      const colHalfW = usableW / 2 - 6;
      const textBlockW = Number((colHalfW * 0.72).toFixed(2));
      const leftCenterX = marginX + colHalfW / 2 + 2;
      const rightCenterX = marginX + usableW - colHalfW / 2 - 2;

      // Logos centrés horizontalement au-dessus de leur zone de texte
      if (cov.leftLogoDataUrl) {
        drawFittedImage(cov.leftLogoDataUrl, leftCenterX - 21, hdrY + 1.5, 42, 15.2);
      } else {
        doc.setFillColor(194, 65, 12);
        doc.roundedRect(leftCenterX - 18, hdrY + 2.0, 36, 13.5, 1.5, 1.5, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.2);
        doc.setTextColor(253, 186, 116);
        doc.text('BAILLEUR / PTF', leftCenterX, hdrY + 7.8, { align: 'center' });
        doc.setFontSize(5.8);
        doc.setTextColor(255, 255, 255);
        doc.text('COMMANDITAIRE', leftCenterX, hdrY + 12.2, { align: 'center' });
      }

      if (cov.rightLogoDataUrl) {
        drawFittedImage(cov.rightLogoDataUrl, rightCenterX - 21, hdrY + 1.5, 42, 15.2);
      } else {
        doc.setFillColor(234, 88, 12);
        doc.roundedRect(rightCenterX - 18, hdrY + 2.0, 36, 13.5, 1.5, 1.5, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.2);
        doc.setTextColor(255, 255, 255);
        doc.text('UGP / PILOTE', rightCenterX, hdrY + 7.8, { align: 'center' });
        doc.setFontSize(5.8);
        doc.setTextColor(224, 242, 254);
        doc.text('AGENCE D’EXÉCUTION', rightCenterX, hdrY + 12.2, { align: 'center' });
      }

      // Ligne 1 sous les logos : Nom de l'Organisation en GRAS alignés sur la même ligne horizontale
      const orgBaselineY = hdrY + 20.5;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.8);
      doc.setTextColor(194, 65, 12);
      const leftOrgLines = doc
        .splitTextToSize(cleanPdfText(leftOrg.toUpperCase()), textBlockW)
        .slice(0, 2);
      const rightOrgLines = doc
        .splitTextToSize(cleanPdfText(rightOrg.toUpperCase()), textBlockW)
        .slice(0, 2);

      leftOrgLines.forEach((l: string, lIdx: number) => {
        doc.text(l, leftCenterX, orgBaselineY + lIdx * 3.2, { align: 'center' });
      });
      rightOrgLines.forEach((l: string, lIdx: number) => {
        doc.text(l, rightCenterX, orgBaselineY + lIdx * 3.2, { align: 'center' });
      });

      // Ligne 2 : Nom de la Direction / Unité de Gestion en style normal non gras alignés sur la même ligne horizontale
      const maxOrgLinesCount = Math.max(leftOrgLines.length, rightOrgLines.length, 1);
      const deptBaselineY = orgBaselineY + maxOrgLinesCount * 3.2 + 0.6;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.0);
      doc.setTextColor(71, 85, 105);
      const leftDeptLines = doc
        .splitTextToSize(cleanPdfText(leftDept), textBlockW)
        .slice(0, 2);
      const rightDeptLines = doc
        .splitTextToSize(cleanPdfText(rightDept), textBlockW)
        .slice(0, 2);

      leftDeptLines.forEach((l: string, lIdx: number) => {
        doc.text(l, leftCenterX, deptBaselineY + lIdx * 2.9, { align: 'center' });
      });
      rightDeptLines.forEach((l: string, lIdx: number) => {
        doc.text(l, rightCenterX, deptBaselineY + lIdx * 2.9, { align: 'center' });
      });

      let curCoverY = hdrY + hdrH + 2.5;

      // 2. Bannière / Image de l'intervention bien centrée sous l'en-tête institutionnel
      const coverImageToUse = cov.bannerImageDataUrl || slide.imageDataUrl;
      const hasCoverVisual = Boolean(
        coverImageToUse && coverImageToUse.startsWith('data:image/')
      );

      if (hasCoverVisual && coverImageToUse) {
        const bannerBoxW = 175;
        const bannerBoxH = 21.5;
        const bannerBoxX = marginX + (usableW - bannerBoxW) / 2;
        doc.setFillColor(248, 250, 252);
        doc.setDrawColor(186, 230, 253);
        doc.roundedRect(bannerBoxX, curCoverY, bannerBoxW, bannerBoxH, 2, 2, 'FD');
        drawFittedImage(
          coverImageToUse,
          bannerBoxX + 2,
          curCoverY + 1.2,
          bannerBoxW - 4,
          bannerBoxH - 2.4
        );
        curCoverY += bannerBoxH + 2.5;
      }

      // 3. Cartouche Central du Titre Complet du Document (Zéro débordement horizontal ou vertical)
      const kpiReserveH = slide.kpiCards && slide.kpiCards.length > 0 ? 25.5 : 0;
      const titleBoxH = Math.max(42, 150.5 - curCoverY - kpiReserveH);

      doc.setFillColor(194, 65, 12);
      doc.roundedRect(marginX, curCoverY, usableW, titleBoxH, 2.5, 2.5, 'F');
      doc.setFillColor(253, 186, 116);
      doc.rect(marginX, curCoverY + titleBoxH - 2, usableW, 2, 'F');

      // Badge Réunion + Référence (mesuré après application de la police exacte et borné à la largeur du cartouche)
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.0);
      const rawBadgeStr = cleanPdfText(
        `${cov.meetingBadge || slide.matrixBadge}  •  Réf. ${refCodeClean}`
      );
      const badgeStr =
        doc.splitTextToSize(rawBadgeStr, usableW - 26)[0] || rawBadgeStr;
      const badgeW = Math.min(
        usableW - 14,
        Math.max(85, doc.getTextWidth(badgeStr) + 12)
      );
      doc.setFillColor(234, 88, 12);
      doc.roundedRect(
        marginX + (usableW - badgeW) / 2,
        curCoverY + 3.0,
        badgeW,
        5.4,
        1.5,
        1.5,
        'F'
      );
      doc.setTextColor(224, 242, 254);
      doc.text(badgeStr, marginX + usableW / 2, curCoverY + 6.7, {
        align: 'center'
      });

      // Préparation des lignes du bas du cartouche (Présentateur & Lieu/Date) avec retour à la ligne automatique
      const presenterClean = cleanPdfText(cov.presenterLine || '');
      const locDateClean = cleanPdfText(
        cov.locationAndDate || cov.locationLine || dateStr
      );
      const combinedMetaStr =
        presenterClean && locDateClean
          ? `${presenterClean}   |   ${locDateClean}`
          : presenterClean || locDateClean;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.0);
      const maxMetaWidth = usableW - 16;
      let metaLines: string[] = [];
      if (combinedMetaStr) {
        if (doc.getTextWidth(combinedMetaStr) <= maxMetaWidth) {
          metaLines = [combinedMetaStr];
        } else if (presenterClean && locDateClean) {
          const pWrapped = doc
            .splitTextToSize(presenterClean, maxMetaWidth)
            .slice(0, 1);
          const lWrapped = doc
            .splitTextToSize(locDateClean, maxMetaWidth)
            .slice(0, 1);
          metaLines = [...pWrapped, ...lWrapped].filter(Boolean);
        } else {
          metaLines = doc
            .splitTextToSize(combinedMetaStr, maxMetaWidth)
            .slice(0, 2);
        }
      }

      const metaLineStep = 3.1;
      const metaBandHeight =
        metaLines.length > 0 ? metaLines.length * metaLineStep + 3.5 : 2;
      const maxSubBottomY = curCoverY + titleBoxH - metaBandHeight - 1.5;

      // Titre Principal Complet (ajusté automatiquement pour ne jamais entrer en collision avec le bas du cartouche)
      doc.setFont('helvetica', 'bold');
      const titleFontSize = hasCoverVisual ? 13 : 15;
      const titleLineStep = hasCoverVisual ? 5.1 : 5.6;
      doc.setFontSize(titleFontSize);
      doc.setTextColor(255, 255, 255);
      const maxTitleLines = hasCoverVisual ? 2 : 3;
      const titleLines = doc
        .splitTextToSize(cleanPdfText(slide.title), usableW - 18)
        .slice(0, maxTitleLines);
      const titleStartY = curCoverY + (hasCoverVisual ? 13.8 : 15.8);
      titleLines.forEach((line: string, lIdx: number) => {
        doc.text(line, marginX + usableW / 2, titleStartY + lIdx * titleLineStep, {
          align: 'center'
        });
      });

      // Sous-titre Complet
      const subY = titleStartY + titleLines.length * titleLineStep + 1.0;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(hasCoverVisual ? 8.6 : 9.2);
      doc.setTextColor(253, 186, 116);
      const subLineStep = hasCoverVisual ? 3.7 : 4.0;
      const rawSubLines = doc
        .splitTextToSize(cleanPdfText(slide.subtitle), usableW - 20)
        .slice(0, 2);
      rawSubLines.forEach((line: string, lIdx: number) => {
        const lineY = subY + lIdx * subLineStep;
        if (lineY <= maxSubBottomY) {
          doc.text(line, marginX + usableW / 2, lineY, {
            align: 'center'
          });
        }
      });

      // Présentateur & Lieu/Date strictement contenus à l'intérieur du cartouche marine
      if (metaLines.length > 0) {
        const sepMetaY =
          curCoverY + titleBoxH - 2 - metaLines.length * metaLineStep - 2.2;
        if (sepMetaY > subY + 2) {
          doc.setDrawColor(234, 88, 12);
          doc.setLineWidth(0.2);
          doc.line(marginX + 12, sepMetaY, marginX + usableW - 12, sepMetaY);
        }
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.0);
        doc.setTextColor(255, 247, 237);
        const firstMetaY =
          curCoverY +
          titleBoxH -
          2 -
          (metaLines.length - 1) * metaLineStep -
          2.0;
        metaLines.forEach((mLine: string, mIdx: number) => {
          doc.text(
            mLine,
            marginX + usableW / 2,
            firstMetaY + mIdx * metaLineStep,
            { align: 'center' }
          );
        });
      }

      // 4. Bande des Cartes KPI en bas de la Slide 1 (Sans aucune troncature ni débordement)
      if (slide.kpiCards && slide.kpiCards.length > 0) {
        const kpiY = curCoverY + titleBoxH + 2.5;
        const kpiH = 23.0;
        const kpiCount = Math.min(4, slide.kpiCards.length);
        const gap = 3;
        const kpiW = (usableW - gap * (kpiCount - 1)) / kpiCount;

        slide.kpiCards.slice(0, kpiCount).forEach((kpi, kIdx) => {
          const kx = marginX + kIdx * (kpiW + gap);
          doc.setFillColor(255, 247, 237);
          doc.setDrawColor(186, 230, 253);
          doc.roundedRect(kx, kpiY, kpiW, kpiH, 2, 2, 'FD');
          doc.setFillColor(234, 88, 12);
          doc.rect(kx, kpiY, 1.8, kpiH, 'F');

          doc.setFont('helvetica', 'bold');
          doc.setFontSize(6.4);
          doc.setTextColor(71, 85, 105);
          const lblLines = doc
            .splitTextToSize(cleanPdfText(kpi.label.toUpperCase()), kpiW - 5.5)
            .slice(0, 2);
          doc.text(lblLines, kx + 3.5, kpiY + 4.2);

          const valStartY = kpiY + 4.2 + lblLines.length * 2.6 + 2.0;
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(10.0);
          const cleanVal = cleanPdfText(kpi.value);
          if (doc.getTextWidth(cleanVal) > kpiW - 6) {
            doc.setFontSize(8.6);
          }
          doc.setTextColor(194, 65, 12);
          const valLines = doc
            .splitTextToSize(cleanVal, kpiW - 5.5)
            .slice(0, 2);
          doc.text(valLines, kx + 3.5, valStartY);

          if (kpi.subtext) {
            const subStartY = valStartY + valLines.length * 3.4 + 0.8;
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(6.0);
            doc.setTextColor(100, 116, 139);
            const subKpiLines = doc
              .splitTextToSize(cleanPdfText(kpi.subtext), kpiW - 5.5)
              .slice(0, 2);
            subKpiLines.forEach((sLine: string, sIdx: number) => {
              const sy = subStartY + sIdx * 2.3;
              if (sy <= kpiY + kpiH - 1.2) {
                doc.text(sLine, kx + 3.5, sy);
              }
            });
          }
        });
      }
    } else {
      // ======================================================================
      // SLIDES 2 À N : EN-TÊTE INTÉGRAL + KPI + CORPS FLUIDE + GRAPHIQUES
      // ======================================================================
      const topY = 6.5;
      let titleStartX = marginX;

      if (customFields.leftLogoDataUrl) {
        drawFittedImage(customFields.leftLogoDataUrl, marginX, topY, 20, 12);
        titleStartX = marginX + 23;
      }

      let rightLimitX = marginX + usableW;
      if (customFields.rightLogoDataUrl) {
        drawFittedImage(
          customFields.rightLogoDataUrl,
          marginX + usableW - 20,
          topY,
          20,
          12
        );
        rightLimitX = marginX + usableW - 23;
      }

      const availHeaderW = rightLimitX - titleStartX;

      // Badge Matrice au-dessus du titre (police définie avant getTextWidth pour éviter tout débordement)
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.4);
      const rawBadgeText = cleanPdfText(slide.matrixBadge);
      const badgeText =
        doc.splitTextToSize(rawBadgeText, availHeaderW - 6)[0] || rawBadgeText;
      const badgeBoxW = Math.min(
        availHeaderW,
        Math.max(48, doc.getTextWidth(badgeText) + 7)
      );
      doc.setFillColor(194, 65, 12);
      doc.roundedRect(titleStartX, topY, badgeBoxW, 4.6, 1, 1, 'F');
      doc.setTextColor(253, 186, 116);
      doc.text(badgeText, titleStartX + 2.5, topY + 3.3);

      // Titre Principal de la Slide affiché intégralement sur 1 à 2 lignes (sans troncature)
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11.5);
      doc.setTextColor(15, 23, 42);
      const slideTitleLines = doc
        .splitTextToSize(cleanPdfText(slide.title), availHeaderW)
        .slice(0, 2);
      doc.text(slideTitleLines, titleStartX, topY + 9);

      const nextHeaderY = topY + 9 + slideTitleLines.length * 4.3;
      let subBottomY = nextHeaderY;
      if (slide.subtitle) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.0);
        doc.setTextColor(71, 85, 105);
        const slideSubLines = doc
          .splitTextToSize(cleanPdfText(slide.subtitle), availHeaderW)
          .slice(0, 2);
        doc.text(slideSubLines, titleStartX, nextHeaderY);
        subBottomY = nextHeaderY + (slideSubLines.length - 1) * 3.2 + 2.8;
      }

      const separatorLineY = Math.max(23.5, subBottomY);
      doc.setDrawColor(194, 65, 12);
      doc.setLineWidth(0.45);
      doc.line(marginX, separatorLineY, marginX + usableW, separatorLineY);

      let contentTopY = separatorLineY + 2.5;

      // (2) Bande des Cartes KPI (Sans aucune troncature ni débordement)
      if (slide.kpiCards && slide.kpiCards.length > 0) {
        const kpiH = 20.5;
        const kpiCount = Math.min(4, slide.kpiCards.length);
        const gap = 3;
        const kpiW = (usableW - gap * (kpiCount - 1)) / kpiCount;

        slide.kpiCards.slice(0, kpiCount).forEach((kpi, kIdx) => {
          const kx = marginX + kIdx * (kpiW + gap);
          doc.setFillColor(248, 250, 252);
          doc.setDrawColor(203, 213, 225);
          doc.roundedRect(kx, contentTopY, kpiW, kpiH, 1.8, 1.8, 'FD');
          doc.setFillColor(234, 88, 12);
          doc.rect(kx, contentTopY, 1.6, kpiH, 'F');

          doc.setFont('helvetica', 'bold');
          doc.setFontSize(6.2);
          doc.setTextColor(71, 85, 105);
          const kpiLblLines = doc
            .splitTextToSize(cleanPdfText(kpi.label.toUpperCase()), kpiW - 5.5)
            .slice(0, 2);
          doc.text(kpiLblLines, kx + 3.2, contentTopY + 4.0);

          const kpiValY = contentTopY + 4.0 + kpiLblLines.length * 2.5 + 1.8;
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(9.5);
          const cleanKpiVal = cleanPdfText(kpi.value);
          if (doc.getTextWidth(cleanKpiVal) > kpiW - 6) {
            doc.setFontSize(8.2);
          }
          doc.setTextColor(194, 65, 12);
          const kpiValLines = doc
            .splitTextToSize(cleanKpiVal, kpiW - 5.5)
            .slice(0, 2);
          doc.text(kpiValLines, kx + 3.2, kpiValY);

          if (kpi.subtext) {
            const kpiSubY = kpiValY + kpiValLines.length * 3.2 + 0.6;
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(5.8);
            doc.setTextColor(100, 116, 139);
            const kpiSubLines = doc
              .splitTextToSize(cleanPdfText(kpi.subtext), kpiW - 5.5)
              .slice(0, 2);
            kpiSubLines.forEach((sLine: string, sIdx: number) => {
              const sy = kpiSubY + sIdx * 2.2;
              if (sy <= contentTopY + kpiH - 1.2) {
                doc.text(sLine, kx + 3.2, sy);
              }
            });
          }
        });

        contentTopY += kpiH + 3.2;
      }

      const reserveBottomForSig = slide.isFinalSlide && includeSignatures ? 22 : 0;
      const bodyMaxBottomY = 151 - reserveBottomForSig;
      const availBodyH = bodyMaxBottomY - contentTopY;

      const hasChart = Boolean(slide.chart && slide.chart.items.length > 0);
      const hasTable = Boolean(slide.table && slide.table.rows.length > 0);
      const hasThreeCards = Boolean(slide.threeCards && slide.threeCards.length > 0);

      // (3) Cas A : La Slide contient un Graphique Vectoriel (Donut ou Histogramme Barres)
      if (hasChart && slide.chart) {
        const chartBoxW = Number((usableW * (hasTable ? 0.50 : 0.56)).toFixed(2));
        const rightColX = marginX + chartBoxW + 4;
        const rightColW = usableW - chartBoxW - 4;

        drawSlideChartInPDF(slide.chart, marginX, contentTopY, chartBoxW, availBodyH);

        // Colonne droite à côté du graphique : Tableau compact, ou 3 cartes empilées, ou Synthèse
        if (hasTable && slide.table) {
          autoTable(doc, {
            startY: contentTopY,
            margin: { left: rightColX, right: marginX },
            tableWidth: rightColW,
            head: [slide.table.headers.map(h => cleanPdfText(h))],
            body: slide.table.rows.slice(0, 4).map(r => r.map(c => cleanPdfText(c))),
            theme: 'grid',
            styles: {
              fillColor: [255, 255, 255],
              textColor: [15, 23, 42],
              fontSize: 6.2,
              cellPadding: 1.1,
              overflow: 'linebreak'
            },
            headStyles: {
              fillColor: [194, 65, 12],
              textColor: [255, 255, 255],
              fontSize: 6.4,
              fontStyle: 'bold'
            }
          });
        } else if (hasThreeCards) {
          const cards = slide.threeCards.slice(0, 3);
          const cardGap = 2.5;
          const eachCardH =
            (availBodyH - cardGap * (cards.length - 1)) / Math.max(1, cards.length);

          cards.forEach((card, cIdx) => {
            const cy = contentTopY + cIdx * (eachCardH + cardGap);
            doc.setFillColor(248, 250, 252);
            doc.setDrawColor(203, 213, 225);
            doc.roundedRect(rightColX, cy, rightColW, eachCardH, 1.8, 1.8, 'FD');
            doc.setFillColor(234, 88, 12);
            doc.rect(rightColX, cy, 1.5, eachCardH, 'F');

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(7.5);
            doc.setTextColor(194, 65, 12);
            const cTitleLines = doc
              .splitTextToSize(
                cleanPdfText(
                  `${card.title}${card.badge ? ` (${card.badge})` : ''}`
                ),
                rightColW - 6
              )
              .slice(0, 2);
            doc.text(cTitleLines, rightColX + 3.5, cy + 4.5);

            let bulY = cy + 4.5 + cTitleLines.length * 3 + 1;
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(6.8);
            doc.setTextColor(51, 65, 85);
            (card.bullets || card.items || []).slice(0, 3).forEach(it => {
              if (bulY < cy + eachCardH - 1.5) {
                const bLines = doc
                  .splitTextToSize(cleanPdfText(`• ${it}`), rightColW - 6)
                  .slice(0, 2);
                doc.text(bLines, rightColX + 3.5, bulY);
                bulY += bLines.length * 2.8 + 0.8;
              }
            });
          });
        } else {
          doc.setFillColor(248, 250, 252);
          doc.setDrawColor(203, 213, 225);
          doc.roundedRect(rightColX, contentTopY, rightColW, availBodyH, 2, 2, 'FD');
          doc.setFillColor(194, 65, 12);
          doc.rect(rightColX, contentTopY, 1.8, availBodyH, 'F');

          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8.2);
          doc.setTextColor(194, 65, 12);
          doc.text('ANALYSE & POINTS CLÉS', rightColX + 4, contentTopY + 6);

          let by = contentTopY + 11.5;
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7.6);
          doc.setTextColor(15, 23, 42);
          slide.bullets.slice(0, 5).forEach(b => {
            if (by < contentTopY + availBodyH - 3) {
              const lines = doc
                .splitTextToSize(cleanPdfText(`• ${b}`), rightColW - 7)
                .slice(0, 3);
              doc.text(lines, rightColX + 4, by);
              by += lines.length * 3.5 + 1.8;
            }
          });
        }
      } else if (
        slide.layout === 'three_cards' &&
        slide.threeCards &&
        slide.threeCards.length > 0
      ) {
        // Cas B : Grille 3 Cartes sans écrasement vertical ni troncature de titre
        const cardsCount = Math.min(3, slide.threeCards.length);
        const gap = 3.5;
        const cardW = (usableW - gap * (cardsCount - 1)) / cardsCount;
        const hasBottomBullets = slide.bullets.length > 0;
        const synthBoxH = hasBottomBullets ? 17.5 : 0;
        const cardH = Math.max(40, availBodyH - (hasBottomBullets ? synthBoxH + 3 : 0));

        slide.threeCards.slice(0, cardsCount).forEach((card, cIdx) => {
          const cx = marginX + cIdx * (cardW + gap);
          doc.setFillColor(248, 250, 252);
          doc.setDrawColor(203, 213, 225);
          doc.roundedRect(cx, contentTopY, cardW, cardH, 2, 2, 'FD');
          doc.setFillColor(234, 88, 12);
          doc.rect(cx, contentTopY, 1.8, cardH, 'F');

          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8.8);
          doc.setTextColor(194, 65, 12);
          const cardTitleLines = doc
            .splitTextToSize(cleanPdfText(card.title), cardW - 7)
            .slice(0, 2);
          doc.text(cardTitleLines, cx + 4, contentTopY + 5.5);

          let itemY = contentTopY + 5.5 + cardTitleLines.length * 3.8;
          if (card.badge) {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(6.8);
            doc.setTextColor(234, 88, 12);
            doc.text(
              doc.splitTextToSize(cleanPdfText(card.badge), cardW - 7)[0] || '',
              cx + 4,
              itemY + 1
            );
            itemY += 5;
          } else {
            itemY += 2;
          }

          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7.8);
          doc.setTextColor(51, 65, 85);
          (card.bullets || card.items || []).slice(0, 4).forEach(it => {
            if (itemY < contentTopY + cardH - 3) {
              const lines = doc
                .splitTextToSize(cleanPdfText(`• ${it}`), cardW - 7)
                .slice(0, 3);
              doc.text(lines, cx + 4, itemY);
              itemY += lines.length * 3.5 + 1.4;
            }
          });
        });

        // Bandeau de synthèse bien séparé en bas (ne recouvre jamais les 3 cartes et gère le retour à la ligne)
        if (hasBottomBullets) {
          const synthY = contentTopY + cardH + 3;
          doc.setFillColor(255, 247, 237);
          doc.setDrawColor(186, 230, 253);
          doc.roundedRect(marginX, synthY, usableW, synthBoxH, 1.8, 1.8, 'FD');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7);
          doc.setTextColor(194, 65, 12);
          let by = synthY + 4.3;
          slide.bullets.slice(0, 3).forEach(b => {
            const bLines = doc
              .splitTextToSize(cleanPdfText(`• ${b}`), usableW - 8)
              .slice(0, 2);
            const neededH = (bLines.length - 1) * 3.1;
            if (by + neededH <= synthY + synthBoxH - 1.5) {
              doc.text(bLines, marginX + 4, by);
              by += bLines.length * 3.1 + 1;
            } else if (by <= synthY + synthBoxH - 1.5 && bLines.length > 0) {
              doc.text(bLines[0], marginX + 4, by);
              by += 4;
            }
          });
        }
      } else if (slide.layout === 'full_matrix' && slide.table) {
        autoTable(doc, {
          startY: contentTopY,
          margin: { left: marginX, right: marginX },
          tableWidth: usableW,
          head: [slide.table.headers.map(h => cleanPdfText(h))],
          body: slide.table.rows.slice(0, 6).map(r => r.map(c => cleanPdfText(c))),
          theme: 'grid',
          styles: {
            fillColor: [255, 255, 255],
            textColor: [15, 23, 42],
            fontSize: 7.2,
            cellPadding: 1.6,
            overflow: 'linebreak'
          },
          headStyles: {
            fillColor: [194, 65, 12],
            textColor: [255, 255, 255],
            fontSize: 7.4,
            fontStyle: 'bold'
          }
        });

        const afterTableY = (doc as any).lastAutoTable.finalY + 3;
        if (afterTableY < bodyMaxBottomY - 9 && slide.bullets.length > 0) {
          const remH = bodyMaxBottomY - afterTableY;
          doc.setFillColor(255, 247, 237);
          doc.setDrawColor(186, 230, 253);
          doc.roundedRect(marginX, afterTableY, usableW, remH, 1.5, 1.5, 'FD');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7);
          doc.setTextColor(194, 65, 12);
          let by = afterTableY + 4.3;
          slide.bullets.slice(0, 3).forEach(b => {
            const bLines = doc
              .splitTextToSize(cleanPdfText(`• ${b}`), usableW - 8)
              .slice(0, 2);
            const neededH = (bLines.length - 1) * 3.1;
            if (by + neededH <= bodyMaxBottomY - 1.5) {
              doc.text(bLines, marginX + 4, by);
              by += bLines.length * 3.1 + 1;
            } else if (by <= bodyMaxBottomY - 1.5 && bLines.length > 0) {
              doc.text(bLines[0], marginX + 4, by);
              by += 4;
            }
          });
        }
      } else {
        // Mode 2 Colonnes (Texte + Tableau ou Image)
        const hasRightTable = Boolean(slide.table && slide.table.rows.length > 0);
        const textBoxW = hasRightTable ? Number((usableW * 0.48).toFixed(2)) : usableW;

        doc.setFillColor(248, 250, 252);
        doc.setDrawColor(203, 213, 225);
        doc.roundedRect(marginX, contentTopY, textBoxW, availBodyH, 2, 2, 'FD');
        doc.setFillColor(234, 88, 12);
        doc.rect(marginX, contentTopY, 2, availBodyH, 'F');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(194, 65, 12);
        doc.text('SYNTHÈSE EXÉCUTIVE & POINTS CLÉS', marginX + 5, contentTopY + 6.5);

        let bulletY = contentTopY + 12.5;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.4);
        doc.setTextColor(15, 23, 42);
        slide.bullets.slice(0, 6).forEach(b => {
          if (bulletY < contentTopY + availBodyH - 4) {
            const lines = doc
              .splitTextToSize(cleanPdfText(`• ${b}`), textBoxW - 9)
              .slice(0, 2);
            doc.text(lines, marginX + 5, bulletY);
            bulletY += lines.length * 4 + 1.8;
          }
        });

        if (hasRightTable && slide.table) {
          const tblX = marginX + textBoxW + 4;
          const tblW = usableW - textBoxW - 4;
          autoTable(doc, {
            startY: contentTopY,
            margin: { left: tblX, right: marginX },
            tableWidth: tblW,
            head: [slide.table.headers.map(h => cleanPdfText(h))],
            body: slide.table.rows.slice(0, 5).map(r => r.map(c => cleanPdfText(c))),
            theme: 'grid',
            styles: {
              fillColor: [255, 255, 255],
              textColor: [15, 23, 42],
              fontSize: 7,
              cellPadding: 1.5,
              overflow: 'linebreak'
            },
            headStyles: {
              fillColor: [194, 65, 12],
              textColor: [255, 255, 255],
              fontSize: 7.2,
              fontStyle: 'bold'
            }
          });
        }
      }

      // Bloc de Signature conditionnel sur la dernière Slide (Zéro débordement horizontal)
      if (slide.isFinalSlide && includeSignatures) {
        const sigY = 130.5;
        const sigH = 19.5;
        const boxW = (usableW - 4) / 2;

        doc.setFillColor(248, 250, 252);
        doc.setDrawColor(203, 213, 225);
        doc.roundedRect(marginX, sigY, boxW, sigH, 1.5, 1.5, 'FD');
        doc.roundedRect(marginX + boxW + 4, sigY, boxW, sigH, 1.5, 1.5, 'FD');

        // Boîte gauche : Équipe Projet / UGP
        const leftTextMaxW = customFields.orgStampDataUrl ? boxW - 27 : boxW - 6;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.2);
        doc.setTextColor(194, 65, 12);
        const leftOrgLines = doc
          .splitTextToSize(
            cleanPdfText(
              `POUR L'ÉQUIPE PROJET / UGP (${userProfile.institution || 'STRUCTURE PILOTE'})`
            ),
            leftTextMaxW
          )
          .slice(0, 2);
        doc.text(leftOrgLines, marginX + 3, sigY + 4.2);

        const leftRepStartY = sigY + 4.2 + leftOrgLines.length * 2.7 + 0.6;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.2);
        doc.setTextColor(15, 23, 42);
        const leftRepLines = doc
          .splitTextToSize(
            cleanPdfText(`${userProfile.fullName} — ${userProfile.role}`),
            leftTextMaxW
          )
          .slice(0, 2);
        doc.text(leftRepLines, marginX + 3, leftRepStartY);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6);
        doc.setTextColor(100, 116, 139);
        doc.text('Visa & Signature : _______________________', marginX + 3, sigY + 17.2);

        if (customFields.orgStampDataUrl) {
          drawFittedImage(
            customFields.orgStampDataUrl,
            marginX + boxW - 23,
            sigY + 2,
            20,
            15
          );
        }

        // Boîte droite : Comité de Pilotage / Bailleur
        const rX = marginX + boxW + 4;
        const rightTextMaxW = customFields.partnerStampDataUrl ? boxW - 27 : boxW - 6;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.2);
        doc.setTextColor(194, 65, 12);
        const rightOrgLines = doc
          .splitTextToSize(
            cleanPdfText(
              `POUR LE COMITÉ DE PILOTAGE / BAILLEUR (${customFields.recipientOrg || 'PARTENAIRE'})`
            ),
            rightTextMaxW
          )
          .slice(0, 2);
        doc.text(rightOrgLines, rX + 3, sigY + 4.2);

        const rightRepStartY = sigY + 4.2 + rightOrgLines.length * 2.7 + 0.6;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.2);
        doc.setTextColor(15, 23, 42);
        const rightRepLines = doc
          .splitTextToSize(
            cleanPdfText(
              customFields.recipientRepresentative || 'Président du Comité de Pilotage'
            ),
            rightTextMaxW
          )
          .slice(0, 2);
        doc.text(rightRepLines, rX + 3, rightRepStartY);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6);
        doc.setTextColor(100, 116, 139);
        doc.text(
          'Décision & Quitus (« Lu et approuvé ») : _______________________',
          rX + 3,
          sigY + 17.2
        );

        if (customFields.partnerStampDataUrl) {
          drawFittedImage(
            customFields.partnerStampDataUrl,
            rX + boxW - 23,
            sigY + 2,
            20,
            15
          );
        }
      }
    }

    // ========================================================================
    // PIED DE SLIDE (FOOTER) :
    // [Nom du Projet / Code] • [Titre de la Présentation] • [Date] • Slide X / N
    // ========================================================================
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.line(marginX, 154, marginX + usableW, 154);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.4);
    doc.setTextColor(100, 116, 139);
    const footerLeft = cleanPdfText(
      `${dossier.name} (${customFields.referenceCode || docType.toUpperCase()})  •  ${cfg.officialTitle}  •  ${dateStr}`
    );
    doc.text(
      doc.splitTextToSize(footerLeft, usableW - 35)[0] || '',
      marginX,
      159.5
    );

    doc.setFillColor(194, 65, 12);
    doc.roundedRect(marginX + usableW - 26, 155.5, 26, 5.5, 1, 1, 'F');
    doc.setTextColor(253, 186, 116);
    doc.setFontSize(7.8);
    doc.text(
      `Slide ${slide.displaySlideNumber} / ${slide.totalDisplaySlides}`,
      marginX + usableW - 13,
      159.3,
      { align: 'center' }
    );
  });

  const pdfFileName = `FAAB_PLAN_${docType.toUpperCase()}_16x9_${(customFields.referenceCode || 'SLIDES').replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`;
  try {
    const pdfBlob = doc.output('blob');
    return await saveProgramFile({
      programName: dossier.name,
      fileName: pdfFileName,
      content: pdfBlob,
      mimeType: 'application/pdf'
    });
  } catch {
    doc.save(pdfFileName);
    return {
      success: true,
      mode: 'download',
      path: `faab-plan/${dossier.name}/${pdfFileName}`,
      fileName: pdfFileName
    };
  }
}

/**
 * Génère et imprime/télécharge la Planche Officielle de Carte de Visite Professionnelle (Format Standard 85 x 55 mm — Recto & Verso avec Logo & traits de coupe)
 */
export async function generateBusinessCardPDF(
  profile: InternalActorProfile,
  dossier: Dossier,
  effectiveCompanyLogo: string,
  lang: LanguageCode
): Promise<SaveProgramFileResult> {
  await ensureProgramDirectoryAccessBeforeHeavyTask();
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const cleanText = (val: string = ''): string =>
    String(val || '')
      .replace(/[\u202F\u00A0]/g, ' ')
      .replace(/→/g, '->');

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const dateStr = cleanText(
    new Date().toLocaleDateString(lang === 'FR' ? 'fr-FR' : 'en-US', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    })
  );

  const safeDrawImage = (
    dataUrl: string | undefined,
    boxX: number,
    boxY: number,
    maxW: number,
    maxH: number
  ) => {
    if (!dataUrl || !dataUrl.startsWith('data:image/')) return false;
    try {
      const props = doc.getImageProperties(dataUrl);
      let w = maxW;
      let h = maxH;
      if (props && props.width > 0 && props.height > 0) {
        const ratio = props.width / props.height;
        w = maxW;
        h = w / ratio;
        if (h > maxH) {
          h = maxH;
          w = h * ratio;
        }
      }
      const drawX = boxX + (maxW - w) / 2;
      const drawY = boxY + (maxH - h) / 2;
      const fmt =
        dataUrl.includes('image/jpeg') || dataUrl.includes('image/jpg') ? 'JPEG' : 'PNG';
      doc.addImage(dataUrl, fmt, drawX, drawY, w, h);
      return true;
    } catch {
      return false;
    }
  };

  const drawCropMarks = (x: number, y: number, w: number, h: number) => {
    doc.setDrawColor(148, 163, 184);
    doc.setLineWidth(0.25);
    const len = 3.5;
    const gap = 1.2;
    // Top-left
    doc.line(x - gap - len, y, x - gap, y);
    doc.line(x, y - gap - len, x, y - gap);
    // Top-right
    doc.line(x + w + gap, y, x + w + gap + len, y);
    doc.line(x + w, y - gap - len, x + w, y - gap);
    // Bottom-left
    doc.line(x - gap - len, y + h, x - gap, y + h);
    doc.line(x, y + h + gap, x, y + h + gap + len);
    // Bottom-right
    doc.line(x + w + gap, y + h, x + w + gap + len, y + h);
    doc.line(x + w, y + h + gap, x + w, y + h + gap + len);
  };

  const vCardQrMatrix = encodeQrMatrix(
    buildBusinessCardVCardPayload(profile, dossier)
  );

  const drawVectorQrCode = (qx: number, qy: number, qSize: number) => {
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(qx, qy, qSize, qSize, 1.2, 1.2, 'F');
    doc.setFillColor(194, 65, 12);
    const n = vCardQrMatrix.length;
    const quiet = 3.5;
    const u = qSize / (n + quiet * 2);
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (vCardQrMatrix[r][c]) {
          doc.rect(
            qx + (c + quiet) * u,
            qy + (r + quiet) * u,
            u + 0.03,
            u + 0.03,
            'F'
          );
        }
      }
    }
  };


  const drawBusinessCardRecto = (
    rectoX: number,
    rowY: number,
    cardW: number,
    cardH: number,
    isFullBleedPvc = false
  ) => {
    doc.setFillColor(194, 65, 12);
    if (isFullBleedPvc) {
      doc.rect(rectoX, rowY, cardW, cardH, 'F');
    } else {
      doc.roundedRect(rectoX, rowY, cardW, cardH, 2.5, 2.5, 'F');
    }
    // Subtle decorative accent band at top
    doc.setFillColor(3, 105, 161);
    doc.rect(rectoX, rowY + 16.5, cardW, 0.6, 'F');

    // Company Logo Box (top-left)
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(rectoX + 3.5, rowY + 3, 16, 11, 1.2, 1.2, 'F');
    const hasLogo = safeDrawImage(
      effectiveCompanyLogo,
      rectoX + 4,
      rowY + 3.5,
      15,
      10
    );
    if (!hasLogo) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(194, 65, 12);
      doc.text('LOGO', rectoX + 11.5, rowY + 9.5, { align: 'center' });
    }

    // Organization & Department next to logo
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(253, 186, 116);
    const orgLines = doc.splitTextToSize(
      cleanText((profile.executingOrgName || 'ORGANISME PILOTE').toUpperCase()),
      46
    );
    doc.text(orgLines.slice(0, 2), rectoX + 21.5, rowY + 6.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.6);
    doc.setTextColor(224, 242, 254);
    const deptLines = doc.splitTextToSize(
      cleanText(profile.executingDepartment || 'Direction du Pilotage Stratégique'),
      46
    );
    doc.text(deptLines.slice(0, 2), rectoX + 21.5, rowY + 12);

    // RACI Badge (top-right)
    doc.setFillColor(7, 89, 133);
    doc.setDrawColor(253, 186, 116);
    doc.setLineWidth(0.2);
    doc.roundedRect(rectoX + cardW - 15.5, rowY + 3.2, 12, 5, 1, 1, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.5);
    doc.setTextColor(253, 186, 116);
    doc.text(
      cleanText(`RACI: ${profile.raciRoleBadge || 'R'}`),
      rectoX + cardW - 9.5,
      rowY + 6.4,
      { align: 'center' }
    );

    // Center Identity (Full Name, Role, Service Unit)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(255, 255, 255);
    const nameLines = doc.splitTextToSize(
      cleanText((profile.fullName || 'MEMBRE INTERNE').toUpperCase()),
      cardW - 7
    );
    doc.text(nameLines[0] || '', rectoX + 3.5, rowY + 23.5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.2);
    doc.setTextColor(253, 186, 116);
    const roleLines = doc.splitTextToSize(
      cleanText(profile.officialRole || 'Responsable Opérationnel'),
      cardW - 7
    );
    doc.text(roleLines.slice(0, 2), rectoX + 3.5, rowY + 28.2);

    if (profile.serviceUnit) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(5.8);
      doc.setTextColor(186, 230, 253);
      const unitLines = doc.splitTextToSize(cleanText(profile.serviceUnit), cardW - 7);
      doc.text(unitLines[0] || '', rectoX + 3.5, rowY + 35.2);
    }

    // Bottom Contact Block
    doc.setDrawColor(56, 189, 248);
    doc.setLineWidth(0.2);
    doc.line(rectoX + 3.5, rowY + 38.5, rectoX + cardW - 3.5, rowY + 38.5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.8);
    doc.setTextColor(255, 247, 237);
    const telStr = cleanText(
      `Tél : ${profile.phonePro || profile.phoneMobile || 'N/A'}${
        profile.phoneMobile && profile.phoneMobile !== profile.phonePro
          ? `  |  Mob : ${profile.phoneMobile}`
          : ''
      }`
    );
    doc.text(doc.splitTextToSize(telStr, cardW - 7)[0] || '', rectoX + 3.5, rowY + 42.5);

    const emailStr = cleanText(`Email : ${profile.emailPro || 'contact@programme.org'}`);
    doc.text(doc.splitTextToSize(emailStr, cardW - 7)[0] || '', rectoX + 3.5, rowY + 46.5);

    doc.setFont('helvetica', 'normal');
    const addrStr = cleanText(
      `Siège : ${profile.officeAddress || profile.residenceCity || 'Abidjan, Côte d’Ivoire'}`
    );
    doc.text(doc.splitTextToSize(addrStr, cardW - 7)[0] || '', rectoX + 3.5, rowY + 50.5);
  };

  const drawBusinessCardVerso = (
    versoX: number,
    rowY: number,
    cardW: number,
    cardH: number,
    isFullBleedPvc = false
  ) => {
    doc.setFillColor(15, 23, 42);
    if (isFullBleedPvc) {
      doc.rect(versoX, rowY, cardW, cardH, 'F');
    } else {
      doc.roundedRect(versoX, rowY, cardW, cardH, 2.5, 2.5, 'F');
    }

    // Top metadata line on Verso
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.5);
    doc.setTextColor(253, 186, 116);
    doc.text(
      cleanText(profile.employeeId || 'MAT-2026-PILOTE'),
      versoX + 4,
      rowY + 5.5
    );
    const progShort = doc.splitTextToSize(
      cleanText(`PROGRAMME : ${dossier.name}`),
      48
    )[0] || '';
    doc.text(progShort, versoX + cardW - 4, rowY + 5.5, { align: 'right' });

    // QR Code on Verso left
    drawVectorQrCode(versoX + 4.5, rowY + 11.5, 25.5);

    // Company Logo & Slogan on Verso right
    const vRightX = versoX + 33;
    const vRightW = cardW - 37;
    if (effectiveCompanyLogo) {
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(vRightX, rowY + 12.5, 20, 9.5, 1, 1, 'F');
      safeDrawImage(effectiveCompanyLogo, vRightX + 0.8, rowY + 13, 18.4, 8.5);
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.6);
    doc.setTextColor(255, 255, 255);
    const vOrgLines = doc.splitTextToSize(
      cleanText((profile.executingOrgName || 'ORGANISME PILOTE').toUpperCase()),
      vRightW
    );
    doc.text(vOrgLines.slice(0, 2), vRightX, rowY + (effectiveCompanyLogo ? 25.5 : 17));

    doc.setFont('helvetica', 'italic');
    doc.setFontSize(5.6);
    doc.setTextColor(253, 186, 116);
    const sloganLines = doc.splitTextToSize(
      cleanText(`« ${profile.businessCardSlogan || 'Excellence Opérationnelle & Rigueur'} »`),
      vRightW
    );
    doc.text(
      sloganLines.slice(0, 3),
      vRightX,
      rowY + (effectiveCompanyLogo ? 31.5 : 24)
    );

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5);
    doc.setTextColor(148, 163, 184);
    doc.text(
      'Scanner pour enregistrer le contact vCard',
      vRightX,
      rowY + 41.5
    );

    // Bottom line on Verso
    doc.setDrawColor(51, 65, 85);
    doc.setLineWidth(0.2);
    doc.line(versoX + 4, rowY + 46.5, versoX + cardW - 4, rowY + 46.5);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.4);
    doc.setTextColor(148, 163, 184);
    const webFooter = cleanText(
      `${profile.websiteUrl || 'www.programme-pilote.org'} · Carte Officielle d’Accréditation`
    );
    doc.text(
      doc.splitTextToSize(webFooter, cardW - 8)[0] || '',
      versoX + cardW / 2,
      rowY + 50.8,
      { align: 'center' }
    );
  };

  const drawSingleBusinessCardPair = (rowY: number, pairNumber: number) => {
    const cardW = 85;
    const cardH = 55;
    const rectoX = 16;
    const versoX = 109;

    // Labels above cards
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(194, 65, 12);
    doc.text(
      `JEU #${pairNumber} — RECTO OFFICIEL (85 × 55 mm — Échelle 1:1 Papier & PVC)`,
      rectoX,
      rowY - 2.5
    );
    doc.text(
      `JEU #${pairNumber} — VERSO INSTITUTIONNEL & QR VCARD (85 × 55 mm — Échelle 1:1)`,
      versoX,
      rowY - 2.5
    );

    drawCropMarks(rectoX, rowY, cardW, cardH);
    drawBusinessCardRecto(rectoX, rowY, cardW, cardH, false);

    drawCropMarks(versoX, rowY, cardW, cardH);
    drawBusinessCardVerso(versoX, rowY, cardW, cardH, false);
  };

  // Top A4 Header Banner
  doc.setFillColor(194, 65, 12);
  doc.rect(0, 0, pageWidth, 26, 'F');
  doc.setFillColor(253, 186, 116);
  doc.rect(0, 26, pageWidth, 2.2, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text(
    cleanText('PLANCHE D’IMPRESSION OFFICIELLE — CARTE DE VISITE PRO (85 × 55 MM)'),
    14,
    11
  );
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.6);
  doc.text(
    cleanText(
      `Organisme Pilote : ${profile.executingOrgName} · Membre : ${profile.fullName} [RACI : ${
        profile.raciRoleBadge || 'R'
      }]`
    ),
    14,
    19
  );
  doc.text(dateStr, pageWidth - 14, 15, { align: 'right' });

  // Draw 2 cutting pairs (4 cards total on the A4 print sheet)
  drawSingleBusinessCardPair(42, 1);
  drawSingleBusinessCardPair(114, 2);

  // Summary Table of Card Holder Data at the bottom of the sheet
  autoTable(doc, {
    startY: 182,
    margin: { left: 16, right: 16, bottom: 18 },
    tableWidth: pageWidth - 32,
    head: [['PARAMÈTRE D’ACCRÉDITATION', 'VALEUR ENREGISTRÉE SUR LA CARTE DE VISITE (85 × 55 MM)']],
    body: [
      ['Titulaire & Fonction Officielle', cleanText(`${profile.fullName} — ${profile.officialRole}`)],
      ['Organisme Pilote & Direction', cleanText(`${profile.executingOrgName} / ${profile.executingDepartment}`)],
      ['Pôle / Unité & Matricule', cleanText(`${profile.serviceUnit || 'UGP'} · Réf : ${profile.employeeId || 'MAT-001'} · RACI : ${profile.raciRoleBadge || 'R'}`)],
      ['Coordonnées Téléphoniques & Email', cleanText(`Fixe : ${profile.phonePro || '—'} · Mobile : ${profile.phoneMobile || '—'} · Email : ${profile.emailPro || '—'}`)],
      ['Adresse Physique & Siège', cleanText(`${profile.officeAddress || profile.residenceCity || 'Abidjan'}`)],
      ['Slogan / Devise Institutionnelle', cleanText(profile.businessCardSlogan || 'Excellence Opérationnelle & Rigueur')]
    ],
    theme: 'grid',
    styles: {
      fontSize: 7.5,
      cellPadding: 2.2,
      textColor: [15, 23, 42],
      overflow: 'linebreak'
    },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 62, fillColor: [255, 247, 237] },
      1: { cellWidth: pageWidth - 32 - 62 }
    },
    headStyles: {
      fillColor: [194, 65, 12],
      textColor: [255, 255, 255],
      fontSize: 7.8,
      fontStyle: 'bold'
    }
  });

  // Clean Footer
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.25);
  doc.line(16, pageHeight - 12, pageWidth - 16, pageHeight - 12);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text(
    cleanText(
      `faab gar · Planche Carte de Visite (85×55mm Papier A4 & Cartes PVC) · ${profile.fullName}`
    ),
    16,
    pageHeight - 7
  );
  doc.text('Page 1 / 3 (Planche Papier A4)', pageWidth - 16, pageHeight - 7, { align: 'right' });

  // Pages 2 & 3 : Format Natif 85 x 55 mm (Échelle 1:1 Plein Bord pour Imprimantes Cartes PVC)
  doc.addPage([85, 55], 'landscape');
  drawBusinessCardRecto(0, 0, 85, 55, true);

  doc.addPage([85, 55], 'landscape');
  drawBusinessCardVerso(0, 0, 85, 55, true);

  try {
    doc.autoPrint();
  } catch {
    // ignore if autoPrint unsupported
  }

  const safeSlug = (profile.fullName || 'ACTEUR')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .toUpperCase();
  const pdfFileName = `FAAB_PLAN_CARTE_VISITE_85x55MM_${safeSlug}.pdf`;
  try {
    const pdfBlob = doc.output('blob');
    const saved = await saveProgramFile({
      programName: dossier.name,
      fileName: pdfFileName,
      content: pdfBlob,
      mimeType: 'application/pdf'
    });
    if (saved.method === 'dev-server' || saved.method === 'fs-api') {
      try {
        doc.save(pdfFileName);
      } catch {
        // ignore
      }
    }
    return saved;
  } catch {
    doc.save(pdfFileName);
    return {
      success: true,
      mode: 'download',
      path: `faab-plan/${dossier.name}/${pdfFileName}`,
      fileName: pdfFileName
    };
  }
}

/**
 * Génère et imprime/télécharge la Planche Officielle du Badge Professionnel CR80 (Format Standard 54 x 86 mm — Recto & Verso avec Photo, Logo, Code-barres & Sécurité)
 */
export async function generateProfessionalBadgePDF(
  profile: InternalActorProfile,
  dossier: Dossier,
  effectiveCompanyLogo: string,
  lang: LanguageCode
): Promise<SaveProgramFileResult> {
  await ensureProgramDirectoryAccessBeforeHeavyTask();
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const cleanText = (val: string = ''): string =>
    String(val || '')
      .replace(/[\u202F\u00A0]/g, ' ')
      .replace(/→/g, '->');

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const dateStr = cleanText(
    new Date().toLocaleDateString(lang === 'FR' ? 'fr-FR' : 'en-US', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    })
  );

  const safeDrawImage = (
    dataUrl: string | undefined,
    boxX: number,
    boxY: number,
    maxW: number,
    maxH: number,
    coverBox: boolean = false
  ) => {
    if (!dataUrl || !dataUrl.startsWith('data:image/')) return false;
    try {
      const props = doc.getImageProperties(dataUrl);
      let w = maxW;
      let h = maxH;
      if (props && props.width > 0 && props.height > 0 && !coverBox) {
        const ratio = props.width / props.height;
        w = maxW;
        h = w / ratio;
        if (h > maxH) {
          h = maxH;
          w = h * ratio;
        }
      }
      const drawX = boxX + (maxW - w) / 2;
      const drawY = boxY + (maxH - h) / 2;
      const fmt =
        dataUrl.includes('image/jpeg') || dataUrl.includes('image/jpg') ? 'JPEG' : 'PNG';
      doc.addImage(dataUrl, fmt, drawX, drawY, w, h);
      return true;
    } catch {
      return false;
    }
  };

  const drawCropMarks = (x: number, y: number, w: number, h: number) => {
    doc.setDrawColor(148, 163, 184);
    doc.setLineWidth(0.25);
    const len = 4;
    const gap = 1.2;
    // Top-left
    doc.line(x - gap - len, y, x - gap, y);
    doc.line(x, y - gap - len, x, y - gap);
    // Top-right
    doc.line(x + w + gap, y, x + w + gap + len, y);
    doc.line(x + w, y - gap - len, x + w, y - gap);
    // Bottom-left
    doc.line(x - gap - len, y + h, x - gap, y + h);
    doc.line(x, y + h + gap, x, y + h + gap + len);
    // Bottom-right
    doc.line(x + w + gap, y + h, x + w + gap + len, y + h);
    doc.line(x + w, y + h + gap, x + w, y + h + gap + len);
  };

  // Top A4 Header Banner
  doc.setFillColor(194, 65, 12);
  doc.rect(0, 0, pageWidth, 26, 'F');
  doc.setFillColor(253, 186, 116);
  doc.rect(0, 26, pageWidth, 2.2, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text(
    cleanText('PLANCHE D’IMPRESSION OFFICIELLE — BADGE PROFESSIONNEL CR80 (54 × 86 MM)'),
    14,
    11
  );
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.6);
  doc.text(
    cleanText(
      `Organisme Pilote : ${profile.executingOrgName} · Titulaire : ${profile.fullName} · Matricule : ${
        profile.employeeId || 'MAT-001'
      }`
    ),
    14,
    19
  );
  doc.text(dateStr, pageWidth - 14, 15, { align: 'right' });

  // Exact CR80 Vertical Dimensions: 54 mm width x 86 mm height
  const badgeW = 54;
  const badgeH = 86;
  const rectoX = 36;
  const versoX = 120;
  const badgeY = 44;

  // Labels above Recto & Verso
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(194, 65, 12);
  doc.text(
    'FACE A — RECTO DU BADGE (54 × 86 mm — Échelle 1:1)',
    rectoX + badgeW / 2,
    badgeY - 3,
    { align: 'center' }
  );
  doc.text(
    'FACE B — VERSO SÉCURITÉ (54 × 86 mm — Échelle 1:1)',
    versoX + badgeW / 2,
    badgeY - 3,
    { align: 'center' }
  );

  // =========================================================================
  // 1. RECTO DU BADGE VERTICAL (54 x 86 mm)
  // =========================================================================
  const drawBadgeRecto = (
    rx: number,
    by: number,
    bw: number,
    bh: number,
    isFullBleedPvc = false
  ) => {
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(194, 65, 12);
    doc.setLineWidth(0.45);
    if (isFullBleedPvc) {
      doc.rect(rx, by, bw, bh, 'F');
    } else {
      doc.roundedRect(rx, by, bw, bh, 3, 3, 'FD');
    }

    // Lanyard Slot (Fente cordon lanière)
    doc.setFillColor(226, 232, 240);
    doc.setDrawColor(148, 163, 184);
    doc.setLineWidth(0.25);
    doc.roundedRect(rx + (bw - 13) / 2, by + 3, 13, 2.6, 1.2, 1.2, 'FD');

    // Company Logo on Badge Header
    if (effectiveCompanyLogo) {
      safeDrawImage(
        effectiveCompanyLogo,
        rx + (bw - 24) / 2,
        by + 7.2,
        24,
        8.5,
        false
      );
    } else {
      doc.setFillColor(194, 65, 12);
      doc.roundedRect(rx + (bw - 14) / 2, by + 7.5, 14, 7, 1, 1, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(5.5);
      doc.setTextColor(253, 186, 116);
      doc.text('PILOTE', rx + bw / 2, by + 12, { align: 'center' });
    }

    // Executing Org Name & Badge Subtitle
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.2);
    doc.setTextColor(194, 65, 12);
    const orgBadgeLines = doc.splitTextToSize(
      cleanText((profile.executingOrgName || 'ORGANISME PILOTE').toUpperCase()),
      bw - 5
    );
    doc.text(orgBadgeLines[0] || '', rx + bw / 2, by + 19, { align: 'center' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(4.7);
    doc.setTextColor(100, 116, 139);
    doc.text(
      "CARTE D'IDENTIFICATION & D'ACCES",
      rx + bw / 2,
      by + 22.2,
      { align: 'center' }
    );

    // Collaborator Photo Frame (24 mm x 30 mm)
    const photoW = 24;
    const photoH = 30;
    const photoX = rx + (bw - photoW) / 2;
    const photoY = by + 24.5;
    doc.setFillColor(255, 247, 237);
    doc.setDrawColor(194, 65, 12);
    doc.setLineWidth(0.5);
    doc.roundedRect(photoX, photoY, photoW, photoH, 1.5, 1.5, 'FD');

    const hasMemberPhoto = safeDrawImage(
      profile.photoDataUrl,
      photoX + 0.6,
      photoY + 0.6,
      photoW - 1.2,
      photoH - 1.2,
      true
    );
    if (!hasMemberPhoto) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(234, 88, 12);
      doc.text('PHOTO', rx + bw / 2, photoY + photoH / 2 - 1, { align: 'center' });
      doc.setFontSize(5);
      doc.text('OFFICIELLE', rx + bw / 2, photoY + photoH / 2 + 2.5, {
        align: 'center'
      });
    }

    // Collaborator Name, Role & RACI Pill
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.4);
    doc.setTextColor(194, 65, 12);
    const bNameLines = doc.splitTextToSize(
      cleanText((profile.fullName || 'MEMBRE INTERNE').toUpperCase()),
      bw - 4
    );
    doc.text(bNameLines[0] || '', rx + bw / 2, by + 58.8, { align: 'center' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.8);
    doc.setTextColor(234, 88, 12);
    const bRoleLines = doc.splitTextToSize(
      cleanText(profile.officialRole || 'Responsable Opérationnel'),
      bw - 4
    );
    doc.text(bRoleLines.slice(0, 2), rx + bw / 2, by + 62.5, {
      align: 'center'
    });

    // RACI & Matricule Pill
    doc.setFillColor(194, 65, 12);
    doc.roundedRect(rx + 4, by + 67.5, bw - 8, 4.5, 2, 2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.2);
    doc.setTextColor(253, 186, 116);
    doc.text(
      cleanText(
        `RÔLE RACI : ${profile.raciRoleBadge || 'R'} • ${profile.employeeId || 'MAT-001'}`
      ),
      rx + bw / 2,
      by + 70.6,
      { align: 'center' }
    );

    // Bottom Separator + Vector Barcode + Validity
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.25);
    doc.line(rx + 3, by + 73.5, rx + bw - 3, by + 73.5);

    // Code-Barres 1D Standard CODE-128 encodant le Matricule Unique du Badge
    const code128Widths = encodeCode128Bars(
      profile.employeeId || 'MAT-PILOTE-001'
    );
    const totalCode128Units = code128Widths.reduce((acc, v) => acc + v, 0);
    const barcodeW = 42;
    const unitMm = barcodeW / Math.max(1, totalCode128Units);
    let curBarX = rx + (bw - barcodeW) / 2;
    doc.setFillColor(15, 23, 42);
    code128Widths.forEach((w, idx) => {
      const segW = w * unitMm;
      if (idx % 2 === 0) {
        doc.rect(curBarX, by + 74.6, segW, 5.6, 'F');
      }
      curBarX += segW;
    });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(4.7);
    doc.setTextColor(100, 116, 139);
    doc.text('ZONE A • ACCÈS TOTAL', rx + 3.5, by + 83.2);
    doc.text(
      cleanText(`VAL : ${profile.badgeValidityDate || '31/12/2026'}`),
      rx + bw - 3.5,
      by + 83.2,
      { align: 'right' }
    );
  };

  const badgeQrMatrix = encodeQrMatrix(buildBadgeQrPayload(profile, dossier));

  const drawBadgeVerso = (
    vx: number,
    by: number,
    bw: number,
    bh: number,
    isFullBleedPvc = false
  ) => {
    doc.setFillColor(15, 23, 42);
    doc.setDrawColor(51, 65, 85);
    doc.setLineWidth(0.45);
    if (isFullBleedPvc) {
      doc.rect(vx, by, bw, bh, 'F');
    } else {
      doc.roundedRect(vx, by, bw, bh, 3, 3, 'FD');
    }

    // Lanyard Slot on Verso
    doc.setFillColor(30, 41, 59);
    doc.setDrawColor(71, 85, 105);
    doc.setLineWidth(0.25);
    doc.roundedRect(vx + (bw - 13) / 2, by + 3, 13, 2.6, 1.2, 1.2, 'FD');

    // Simulated Magnetic Stripe
    doc.setFillColor(0, 0, 0);
    doc.rect(vx, by + 8, bw, 8.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(4.6);
    doc.setTextColor(148, 163, 184);
    doc.text(
      'MAGNETIC STRIPE • SECURE ACCESS SYSTEM',
      vx + bw / 2,
      by + 13.2,
      { align: 'center' }
    );

    // Security & Property Instructions
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.5);
    doc.setTextColor(253, 186, 116);
    doc.text('CONSIGNES DE SÉCURITÉ & PROPRIÉTÉ :', vx + 3.5, by + 22);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.1);
    doc.setTextColor(226, 232, 240);
    const secText1 = doc.splitTextToSize(
      cleanText(
        `Ce badge est la propriété exclusive de « ${profile.executingOrgName} ». Il est strictement personnel et doit être porté de manière visible dans les emprises du programme.`
      ),
      bw - 7
    );
    doc.text(secText1, vx + 3.5, by + 26);

    const secText2 = doc.splitTextToSize(
      cleanText(
        `En cas de perte ou de découverte, prière de le rapporter au poste de sécurité ou de contacter le : ${
          profile.badgeEmergencyPhone || profile.phonePro || '+225 27 20 00 12 34'
        }.`
      ),
      bw - 7
    );
    doc.text(secText2, vx + 3.5, by + 41.5);

    // Medical & QR Security Box
    const medBoxY = by + 58;
    doc.setFillColor(30, 41, 59);
    doc.setDrawColor(71, 85, 105);
    doc.setLineWidth(0.25);
    doc.roundedRect(vx + 3, medBoxY, bw - 6, 18, 1.5, 1.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(4.6);
    doc.setTextColor(148, 163, 184);
    doc.text('GROUPE SANGUIN :', vx + 5, medBoxY + 4.5);
    doc.setFontSize(8.5);
    doc.setTextColor(251, 113, 133);
    doc.text(cleanText(profile.badgeBloodType || 'O+'), vx + 5, medBoxY + 9.5);

    doc.setFontSize(4.6);
    doc.setTextColor(148, 163, 184);
    doc.text('PROGRAMME :', vx + 5, medBoxY + 13);
    doc.setFontSize(5.2);
    doc.setTextColor(186, 230, 253);
    const progLines = doc.splitTextToSize(cleanText(dossier.name), 28);
    doc.text(progLines[0] || '', vx + 5, medBoxY + 16);

    // Real QR Code plate on right of medBox encoding all badge holder data
    const qx = vx + bw - 20;
    const qy = medBoxY + 1.25;
    const qSize = 15.5;
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(qx, qy, qSize, qSize, 0.8, 0.8, 'F');
    doc.setFillColor(15, 23, 42);
    const bN = badgeQrMatrix.length;
    const bQuiet = 3.2;
    const bUnit = qSize / (bN + bQuiet * 2);
    for (let r = 0; r < bN; r++) {
      for (let c = 0; c < bN; c++) {
        if (badgeQrMatrix[r][c]) {
          doc.rect(
            qx + (c + bQuiet) * bUnit,
            qy + (r + bQuiet) * bUnit,
            bUnit + 0.03,
            bUnit + 0.03,
            'F'
          );
        }
      }
    }

    // Verso Footer
    doc.setDrawColor(51, 65, 85);
    doc.line(vx + 3.5, by + 79.5, vx + bw - 3.5, by + 79.5);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(4.7);
    doc.setTextColor(148, 163, 184);
    doc.text(
      'Direction de la Sécurité & des Ressources Humaines',
      vx + bw / 2,
      by + 83.2,
      { align: 'center' }
    );
  };

  drawCropMarks(rectoX, badgeY, badgeW, badgeH);
  drawBadgeRecto(rectoX, badgeY, badgeW, badgeH, false);

  drawCropMarks(versoX, badgeY, badgeW, badgeH);
  drawBadgeVerso(versoX, badgeY, badgeW, badgeH, false);

  // =========================================================================
  // 3. FICHE D'ATTRIBUTION & D'ACCRÉDITATION DU BADGE (BAS DE FEUILLE A4)
  // =========================================================================
  autoTable(doc, {
    startY: 144,
    margin: { left: 16, right: 16, bottom: 18 },
    tableWidth: pageWidth - 32,
    head: [['REGISTRE D’ATTRIBUTION DU BADGE PROFESSIONNEL CR80 (54 × 86 MM)', 'INFORMATIONS DE SÉCURITÉ & ACCÈS']],
    body: [
      ['Nom & Prénom du Collaborateur', cleanText(profile.fullName)],
      ['Fonction Officielle & Rôle RACI', cleanText(`${profile.officialRole} — Rôle RACI : [${profile.raciRoleBadge || 'R'}]`)],
      ['Organisme Pilote & Direction', cleanText(`${profile.executingOrgName} — ${profile.executingDepartment}`)],
      ['Matricule & Pôle / Unité', cleanText(`${profile.employeeId || 'MAT-001'} · ${profile.serviceUnit || 'UGP / PMO'}`)],
      ['Date d’Expiration & Zone d’Accès', cleanText(`Validité : ${profile.badgeValidityDate || '31/12/2026'} · Niveau : ZONE A — ACCÈS TOTAL`)],
      ['Groupe Sanguin & Contact d’Urgence', cleanText(`Groupe Sanguin : ${profile.badgeBloodType || 'O+'} · Urgence : ${profile.badgeEmergencyPhone || profile.phonePro || 'N/A'}`)],
      ['Portefeuille / Programme de Rattachement', cleanText(`${dossier.name} (${dossier.horizonPlan})`)]
    ],
    theme: 'grid',
    styles: {
      fontSize: 7.6,
      cellPadding: 2.3,
      textColor: [15, 23, 42],
      overflow: 'linebreak'
    },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 66, fillColor: [255, 247, 237] },
      1: { cellWidth: pageWidth - 32 - 66 }
    },
    headStyles: {
      fillColor: [194, 65, 12],
      textColor: [255, 255, 255],
      fontSize: 7.8,
      fontStyle: 'bold'
    }
  });

  // Visa de remise du badge
  const afterTableY = (doc as any).lastAutoTable.finalY + 6;
  autoTable(doc, {
    startY: afterTableY,
    margin: { left: 16, right: 16, bottom: 18 },
    tableWidth: pageWidth - 32,
    head: [['VISA DE DÉLIVRANCE (DIRECTION / SÉCURITÉ UGP)', 'ACCUSÉ DE RÉCEPTION DU TITULAIRE DU BADGE']],
    body: [
      [
        cleanText(`Délivré par : ${profile.executingOrgName}\nDate : ${dateStr}\n\nSignature & Cachet : ______________________`),
        cleanText(`Titulaire : ${profile.fullName}\nMatricule : ${profile.employeeId || 'MAT-001'}\n\nSignature du collaborateur : ______________________`)
      ]
    ],
    theme: 'grid',
    styles: {
      fontSize: 7.5,
      cellPadding: 3,
      textColor: [15, 23, 42]
    },
    columnStyles: {
      0: { cellWidth: (pageWidth - 32) / 2 },
      1: { cellWidth: (pageWidth - 32) / 2 }
    },
    headStyles: {
      fillColor: [3, 105, 161],
      textColor: [255, 255, 255],
      fontSize: 7.5,
      fontStyle: 'bold',
      halign: 'center'
    }
  });

  // Clean Footer
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.25);
  doc.line(16, pageHeight - 12, pageWidth - 16, pageHeight - 12);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text(
    cleanText(
      `faab gar · Planche Badge Professionnel CR80 (54×86mm Papier A4 & Cartes PVC) · ${profile.fullName}`
    ),
    16,
    pageHeight - 7
  );
  doc.text('Page 1 / 3 (Planche Papier A4)', pageWidth - 16, pageHeight - 7, { align: 'right' });

  // Pages 2 & 3 : Format Natif CR80 ISO/IEC 7810 (54 x 86 mm — Plein Bord pour Imprimantes Badges PVC)
  doc.addPage([54, 86], 'portrait');
  drawBadgeRecto(0, 0, 54, 86, true);

  doc.addPage([54, 86], 'portrait');
  drawBadgeVerso(0, 0, 54, 86, true);

  try {
    doc.autoPrint();
  } catch {
    // ignore
  }

  const safeSlug = (profile.fullName || 'ACTEUR')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .toUpperCase();
  const pdfFileName = `FAAB_PLAN_BADGE_PRO_54x86MM_${safeSlug}.pdf`;
  try {
    const pdfBlob = doc.output('blob');
    const saved = await saveProgramFile({
      programName: dossier.name,
      fileName: pdfFileName,
      content: pdfBlob,
      mimeType: 'application/pdf'
    });
    if (saved.method === 'dev-server' || saved.method === 'fs-api') {
      try {
        doc.save(pdfFileName);
      } catch {
        // ignore
      }
    }
    return saved;
  } catch {
    doc.save(pdfFileName);
    return {
      success: true,
      mode: 'download',
      path: `faab-plan/${dossier.name}/${pdfFileName}`,
      fileName: pdfFileName
    };
  }
}


