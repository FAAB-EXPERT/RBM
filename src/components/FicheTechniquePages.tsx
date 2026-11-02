import React, { useMemo } from 'react';
import {
  Printer,
  FileText,
  BarChart3,
  PieChart,
  GanttChart,
  Calendar,
  ListChecks,
  Network,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';
import { Dossier, UserProfile, CurrencyCode, LanguageCode, PertNode } from '../types';
import { formatCurrency } from '../i18n';
import {
  STANDARD_PHASES,
  computeDossierPertSummary,
  computeTaskMetrics,
  getTodayISO
} from '../pertUtils';
import { ACRONYMS_LIST, generateDirectWhitePDF } from '../pdfExport';
import { AppLogo } from './AppLogo';

interface FicheTechniquePagesProps {
  dossier: Dossier;
  userProfile: UserProfile;
  currency: CurrencyCode;
  language: LanguageCode;
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  if (arr.length === 0) return [[]];
  const res: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    res.push(arr.slice(i, i + size));
  }
  return res;
}

export const FicheTechniquePages: React.FC<FicheTechniquePagesProps> = ({
  dossier,
  userProfile,
  currency,
  language
}) => {
  const todayISO = getTodayISO();

  const pertSummaries = useMemo(
    () => computeDossierPertSummary(dossier, todayISO),
    [dossier, todayISO]
  );

  const allNodes = useMemo<PertNode[]>(
    () => pertSummaries.flatMap(p => p.nodes),
    [pertSummaries]
  );

  // Unified items for Gantt & Tableaux 1 and 2
  const unifiedRows = useMemo(() => {
    const list: Array<{
      code: string;
      label: string;
      type: 'tache' | 'jalon';
      projectName: string;
      assignee: string;
      budget: number;
      monthLabel: string;
      monthNum: number;
      antecedentCode: string;
      startDate: string;
      endDate: string;
      durationLabel: string;
      actualStartDate: string;
      actualEndDate: string;
      realDurationLabel: string;
      statusLabel: string;
      ecartDebutLabel: string;
      ecartFinLabel: string;
      ecartDebutDays: number;
      ecartFinDays: number;
    }> = [];

    (dossier.axes || []).forEach(axe => {
      (axe.projects || []).forEach(proj => {
        const codeMap = new Map<string, string>();
        STANDARD_PHASES.forEach((pName, pIdx) => {
          const pTasks = (proj.tasks || []).filter(tk => tk.phase === pName);
          pTasks.forEach((tk, tIdx) => {
            codeMap.set(
              tk.id,
              `${tk.type === 'jalon' ? 'J' : 'T'}.${pIdx + 1}.${tIdx + 1}`
            );
          });
        });

        (proj.tasks || []).forEach((task, idx) => {
          const metrics = computeTaskMetrics(task, todayISO);
          const code =
            codeMap.get(task.id) ||
            `${task.type === 'jalon' ? 'J' : 'T'}.1.${idx + 1}`;
          const antCode =
            task.antecedent && task.antecedent !== '—'
              ? codeMap.get(task.antecedent) || task.antecedent
              : '—';
          const startD = new Date(task.startDate);
          const monthNum = !isNaN(startD.getTime()) ? startD.getMonth() + 1 : 1;
          const monthLabel = !isNaN(startD.getTime())
            ? startD.toLocaleString('fr-FR', { month: 'short', year: '2-digit' })
            : `M${monthNum}`;

          list.push({
            code,
            label: task.type === 'jalon' ? `◆ ${task.name}` : task.name,
            type: task.type,
            projectName: proj.name,
            assignee: (task.assignee || '').trim() || userProfile.fullName || '—',
            budget: Number(task.budget) || 0,
            monthLabel,
            monthNum,
            antecedentCode: antCode,
            startDate: task.startDate || '—',
            endDate: task.endDate || '—',
            durationLabel: metrics.plannedDurationLabel,
            actualStartDate: metrics.effectiveActualStartDate || '—',
            actualEndDate: metrics.effectiveActualEndDate || '—',
            realDurationLabel: metrics.realDurationLabel,
            statusLabel: metrics.effectiveStatus,
            ecartDebutLabel: metrics.ecartDebutLabel,
            ecartFinLabel: metrics.ecartFinLabel,
            ecartDebutDays: metrics.ecartDebutDays,
            ecartFinDays: metrics.ecartFinDays
          });
        });
      });
    });

    return list;
  }, [dossier, todayISO]);

  const totalAxes = (dossier.axes || []).length;
  const allProjects = useMemo(
    () => (dossier.axes || []).flatMap(a => a.projects || []),
    [dossier]
  );
  const totalBudget = useMemo(
    () => unifiedRows.reduce((acc, r) => acc + r.budget, 0),
    [unifiedRows]
  );

  const statusCounts = useMemo(() => {
    const counts = {
      Terminé: 0,
      'En cours': 0,
      'À faire': 0,
      Bloqué: 0
    };
    unifiedRows.forEach(r => {
      if (r.statusLabel === 'Terminé') counts.Terminé++;
      else if (r.statusLabel === 'En cours') counts['En cours']++;
      else if (r.statusLabel === 'Bloqué') counts.Bloqué++;
      else counts['À faire']++;
    });
    return counts;
  }, [unifiedRows]);

  const completionPct =
    unifiedRows.length > 0
      ? Math.round((statusCounts.Terminé / unifiedRows.length) * 100)
      : 0;

  // Paginate Gantt, Tableau 1, Tableau 2, and PERT so pages remain very airy
  const ganttChunks = useMemo(() => chunkArray(unifiedRows, 15), [unifiedRows]);
  const tab1Chunks = useMemo(() => chunkArray(unifiedRows, 13), [unifiedRows]);
  const tab2Chunks = useMemo(() => chunkArray(unifiedRows, 13), [unifiedRows]);
  const pertChunks = useMemo(() => chunkArray(allNodes, 13), [allNodes]);

  const totalPages =
    4 + ganttChunks.length + tab1Chunks.length + tab2Chunks.length + pertChunks.length;

  let currentPageCounter = 1;
  const page1Num = currentPageCounter++;
  const page2Num = currentPageCounter++;
  const page3Num = currentPageCounter++;
  const page4Num = currentPageCounter++;

  const ganttStartPage = currentPageCounter;
  const tab1StartPage = ganttStartPage + ganttChunks.length;
  const tab2StartPage = tab1StartPage + tab1Chunks.length;
  const pertStartPage = tab2StartPage + tab2Chunks.length;

  const renderPageHeader = (sectionTitle: string) => (
    <div className="border-b-2 border-[#c2410c] pb-3 mb-6 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <AppLogo className="w-12 h-12" />
        <div>
          <div className="text-xs font-black uppercase tracking-wider text-[#c2410c]">
            {language === 'EN'
              ? 'faab gar — TECHNICAL SHEET & EXECUTIVE SUMMARY'
              : 'faab gar — FICHE TECHNIQUE & RÉSUMÉ EXÉCUTIF'}
          </div>
          <div className="text-[11px] font-bold text-slate-600">
            Dossier : {dossier.name} • {sectionTitle}
          </div>
        </div>
      </div>
      <div className="text-right text-[10px] font-bold text-slate-500">
        <div>
          {language === 'EN' ? 'Issued on' : 'Édité le'}{' '}
          {new Date().toLocaleDateString(language === 'EN' ? 'en-US' : 'fr-FR')}
        </div>
        <div className="text-[#ea580c]">Horizon : {dossier.horizonPlan}</div>
      </div>
    </div>
  );

  const renderPageFooter = (pageNum: number) => (
    <div className="mt-auto pt-4 border-t border-slate-200 flex items-center justify-between text-[10px] font-bold text-slate-500">
      <span>
        {language === 'EN'
          ? 'faab gar • Consolidated Executive Document'
          : 'faab gar • Document Exécutif Consolidé'}
      </span>
      <span>
        {userProfile.institution ||
          (language === 'EN'
            ? 'Institutional & Universal Use'
            : 'Usage Institutionnel & Universel')}
      </span>
      <span className="text-[#c2410c] font-black">
        Page {pageNum} / {totalPages}
      </span>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Top Action Bar */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-3.5 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-[#fdba74]/30 text-[#c2410c] dark:text-[#fdba74] flex items-center justify-center">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-white uppercase tracking-tight">
              {language === 'EN'
                ? 'Multi-Page Technical Sheet & Executive Summary (A4)'
                : 'Fiche Technique & Résumé Exécutif Multi-Pages (A4)'}
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {language === 'EN'
                ? `Consolidated Executive Document (${totalPages} A4 pages): Cover, Table of Contents, Acronyms, Executive Summary & 2 Charts, Gantt, Tables 1 & 2, and PERT Network`
                : `Document Exécutif Consolidé très aéré (${totalPages} pages A4) : Présentation, Sommaire, Acronymes, Synthèse & 2 Graphiques, Gantt, Tableaux 1 & 2 et Réseau PERT`}
            </p>
          </div>
        </div>

        <button
          onClick={() =>
            generateDirectWhitePDF(dossier, userProfile, currency, language)
          }
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#c2410c] hover:bg-[#9a3412] text-white text-xs font-black uppercase tracking-wider shadow-sm transition-all cursor-pointer"
        >
          <Printer className="w-4 h-4 text-[#fdba74]" />
          {language === 'EN'
            ? `Download A4 PDF (${totalPages} Pages)`
            : `Télécharger le PDF A4 (${totalPages} Pages)`}
        </button>
      </div>

      {/* MULTI-PAGE A4 PREVIEW CONTAINER */}
      <div className="space-y-8 overflow-x-auto pb-8">
        {/* =========================================================
            PAGE 1 : PRÉSENTATION DU DOCUMENT & IDENTITÉ DU RESPONSABLE
            ========================================================= */}
        <div className="a4-page flex flex-col justify-between">
          <div>
            {renderPageHeader('Page 1 — Présentation du Document Exécutif Consolidé')}

            <div className="my-6 rounded-2xl bg-[#c2410c] text-white p-7 border-b-8 border-[#fdba74] shadow-md text-center space-y-3">
              <div className="inline-block px-4 py-1 rounded-full bg-[#fdba74] text-slate-950 text-xs font-black uppercase tracking-widest">
                DOCUMENT EXÉCUTIF CONSOLIDÉ
              </div>
              <h1 className="text-xl sm:text-2xl font-black uppercase tracking-tight leading-tight">
                FICHE TECHNIQUE & RÉSUMÉ EXÉCUTIF DE PILOTAGE STRATÉGIQUE ET OPÉRATIONNEL
              </h1>
              <p className="text-xs sm:text-sm text-[#fdba74] font-semibold max-w-xl mx-auto">
                Dossier / Portefeuille :{' '}
                <span className="text-white font-black">{dossier.name}</span> (Horizon{' '}
                {dossier.horizonPlan})
              </p>
            </div>

            {/* Présentation du Document Exécutif Consolidé */}
            <div className="mb-6 rounded-xl border border-slate-200 bg-slate-50 p-5 space-y-3">
              <h2 className="text-xs sm:text-sm font-black uppercase tracking-wider text-[#c2410c] border-b border-slate-200 pb-2">
                1. Présentation du Document Exécutif Consolidé
              </h2>
              <p className="text-xs leading-relaxed text-slate-700 text-justify">
                Le présent <strong>Document Exécutif Consolidé</strong> constitue le rapport
                institutionnel de référence du portefeuille{' '}
                <strong>« {dossier.name} »</strong>. Conçu selon les normes internationales de
                Gestion Axée sur les Résultats (GAR) et d’ordonnancement par Chemin Critique
                (PERT/CPM), il offre une lecture structurée, aérée et exhaustive de la
                planification macroscopique, du suivi d’exécution, des écarts calendaires et de la
                performance budgétaire.
              </p>
              {dossier.description && (
                <p className="text-xs leading-relaxed text-slate-600 italic bg-white p-3 rounded-lg border border-slate-200">
                  <strong>Objet Stratégique :</strong> {dossier.description}
                </p>
              )}
            </div>

            {/* Identité du Responsable & Organisation */}
            <div className="rounded-xl border-2 border-[#fdba74] bg-white p-5 space-y-4">
              <h2 className="text-xs sm:text-sm font-black uppercase tracking-wider text-[#c2410c] border-b border-slate-200 pb-2">
                2. Identité du Responsable & Organisation
              </h2>
              <div className="grid grid-cols-2 gap-3.5 text-xs">
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <div className="text-[10px] font-bold uppercase text-slate-400">
                    Nom & Prénoms du Responsable
                  </div>
                  <div className="text-sm font-black text-slate-900 mt-0.5">
                    {userProfile.fullName || 'Non renseigné'}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <div className="text-[10px] font-bold uppercase text-slate-400">
                    Fonction / Titre Officiel
                  </div>
                  <div className="text-sm font-black text-slate-900 mt-0.5">
                    {userProfile.role || 'Chef de Projet / Coordonnateur'}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <div className="text-[10px] font-bold uppercase text-slate-400">
                    Organisation / Institution
                  </div>
                  <div className="text-sm font-black text-slate-900 mt-0.5">
                    {userProfile.institution || dossier.institution || 'Organisation'}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <div className="text-[10px] font-bold uppercase text-slate-400">
                    Horizon & Type de Portefeuille
                  </div>
                  <div className="text-sm font-black text-slate-900 mt-0.5">
                    {dossier.horizonPlan} ({dossier.horizonYears} ans) • {dossier.type}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <div className="text-[10px] font-bold uppercase text-slate-400">
                    Adresse Email Professionnelle
                  </div>
                  <div className="text-xs font-bold text-slate-800 mt-0.5">
                    {userProfile.email || '—'}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <div className="text-[10px] font-bold uppercase text-slate-400">
                    Contact Téléphonique & Devise
                  </div>
                  <div className="text-xs font-bold text-slate-800 mt-0.5">
                    {userProfile.phone || '—'} • Devise : {currency}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {renderPageFooter(page1Num)}
        </div>

        {/* =========================================================
            PAGE 2 : LE SOMMAIRE
            ========================================================= */}
        <div className="a4-page flex flex-col justify-between">
          <div>
            {renderPageHeader('Page 2 — Le Sommaire Exécutif')}

            <div className="my-4">
              <h2 className="text-xl font-black uppercase tracking-tight text-[#c2410c] mb-2">
                SOMMAIRE DU DOCUMENT EXÉCUTIF CONSOLIDÉ
              </h2>
              <p className="text-xs text-slate-600 mb-6">
                Table des matières détaillée et pagination normalisée du dossier{' '}
                <strong>{dossier.name}</strong> :
              </p>

              <div className="space-y-3.5">
                {[
                  {
                    num: 'CHAPITRE I',
                    title: 'Document Exécutif Consolidé & Identité du Responsable et de l’Organisation',
                    desc: 'Présentation officielle du dossier, périmètre stratégique et coordonnées du responsable.',
                    page: 1
                  },
                  {
                    num: 'CHAPITRE II',
                    title: 'Le Sommaire Exécutif',
                    desc: 'Architecture séquentielle et indexation des chapitres, graphiques et tableaux.',
                    page: 2
                  },
                  {
                    num: 'CHAPITRE III',
                    title: 'Les Acronymes & Abréviations Techniques',
                    desc: 'Référentiel des sigles normalisés (GAR, PERT, CPM, WBS, ES/EF, LS/LF, OCDE/CAD).',
                    page: 3
                  },
                  {
                    num: 'CHAPITRE IV',
                    title: 'Synthèse Financière & Avancement Opérationnel (avec les 2 Graphiques du Tableau de Bord)',
                    desc: 'Bilan budgétaire consolidé et graphiques décisionnels (Répartition par Projet & par Statut).',
                    page: 4
                  },
                  {
                    num: 'CHAPITRE V',
                    title: 'Diagramme de Gantt Simplifié & Épuré',
                    desc: 'Chronogramme visuel comparatif Prévu vs Exécuté sans débordement.',
                    page: ganttStartPage
                  },
                  {
                    num: 'CHAPITRE VI',
                    title: 'Tableau 1 — Planification Macro des Activités & Jalons',
                    desc: 'Matrice complète : Code, Activité/Jalon, Responsable, Budget, Mois, Antécéd., Déb. Prév, Fin Prév, Durée.',
                    page: tab1StartPage
                  },
                  {
                    num: 'CHAPITRE VII',
                    title: 'Tableau 2 — Suivi de l’Exécution des Activités & Écarts',
                    desc: 'Matrice de suivi : Code, Activité/Jalon, Responsable, Statut, Dates Prév/Exéc, Réel, Écart Début et Écart Fin.',
                    page: tab2StartPage
                  },
                  {
                    num: 'CHAPITRE VIII',
                    title: 'Interprétation Dynamique du Réseau PERT & Chemin Critique (CPM)',
                    desc: 'Analyse des dates au plus tôt/tard, marges totales/libres et recommandations sur le chemin critique.',
                    page: pertStartPage
                  }
                ].map(item => (
                  <div
                    key={item.num}
                    className="flex items-start justify-between gap-4 p-3.5 rounded-xl border border-slate-200 bg-slate-50/70"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded bg-[#c2410c] text-white text-[10px] font-black">
                          {item.num}
                        </span>
                        <span className="text-xs font-black text-slate-900 uppercase">
                          {item.title}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600 pl-1">{item.desc}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <span className="inline-block px-3 py-1 rounded-lg bg-[#fdba74]/40 text-[#c2410c] font-black text-xs">
                        Page {item.page}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {renderPageFooter(page2Num)}
        </div>

        {/* =========================================================
            PAGE 3 : LES ACRONYMES
            ========================================================= */}
        <div className="a4-page flex flex-col justify-between">
          <div>
            {renderPageHeader('Page 3 — Les Acronymes & Sigles Officiels')}

            <div className="my-4">
              <h2 className="text-xl font-black uppercase tracking-tight text-[#c2410c] mb-2">
                RÉFÉRENTIEL DES ACRONYMES & ABRÉVIATIONS
              </h2>
              <p className="text-xs text-slate-600 mb-5">
                Définitions normalisées des sigles employés dans la Fiche Technique et les tableaux
                de pilotage :
              </p>

              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="bg-[#c2410c] text-white">
                    <th className="w-28 text-left px-3 py-2.5 font-black uppercase border border-[#c2410c]">
                      Acronyme
                    </th>
                    <th className="w-60 text-left px-3 py-2.5 font-black uppercase border border-[#c2410c]">
                      Intitulé Complet
                    </th>
                    <th className="text-left px-3 py-2.5 font-black uppercase border border-[#c2410c]">
                      Définition Opérationnelle
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {ACRONYMS_LIST.map(([sigle, full, desc], idx) => (
                    <tr key={sigle} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                      <td className="px-3 py-2.5 font-mono font-black text-[#c2410c] border border-slate-200">
                        {sigle}
                      </td>
                      <td className="px-3 py-2.5 font-bold text-slate-800 border border-slate-200">
                        {full}
                      </td>
                      <td className="px-3 py-2.5 text-slate-700 border border-slate-200">
                        {desc}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {renderPageFooter(page3Num)}
        </div>

        {/* =========================================================
            PAGE 4 : SYNTHÈSE FINANCIÈRE & AVANCEMENT + LES 2 GRAPHIQUES
            ========================================================= */}
        <div className="a4-page flex flex-col justify-between">
          <div>
            {renderPageHeader('Page 4 — Synthèse Financière & Graphiques du Tableau de Bord')}

            <h2 className="text-lg font-black uppercase tracking-tight text-[#c2410c] mb-4">
              SYNTHÈSE FINANCIÈRE & AVANCEMENT OPÉRATIONNEL
            </h2>

            {/* 4 KPI Cards */}
            <div className="grid grid-cols-4 gap-3 mb-6">
              <div className="p-3.5 rounded-xl bg-slate-50 border-l-4 border-[#c2410c] border border-slate-200">
                <div className="text-[10px] font-bold uppercase text-slate-500">
                  Axes & Projets
                </div>
                <div className="text-lg font-black text-slate-900 mt-1">
                  {totalAxes} Axes / {allProjects.length} Proj.
                </div>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-50 border-l-4 border-[#ea580c] border border-slate-200">
                <div className="text-[10px] font-bold uppercase text-slate-500">
                  Activités & Jalons
                </div>
                <div className="text-lg font-black text-slate-900 mt-1">
                  {unifiedRows.length} Élément(s)
                </div>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-50 border-l-4 border-emerald-600 border border-slate-200">
                <div className="text-[10px] font-bold uppercase text-slate-500">
                  Budget Global Consolidé
                </div>
                <div className="text-sm font-black text-slate-900 mt-1">
                  {formatCurrency(totalBudget, currency, language)}
                </div>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-50 border-l-4 border-[#fdba74] border border-slate-200">
                <div className="text-[10px] font-bold uppercase text-slate-500">
                  Taux d’Achèvement
                </div>
                <div className="text-2xl font-black text-[#c2410c] mt-1">{completionPct}%</div>
              </div>
            </div>

            {/* LES 2 GRAPHIQUES DU TABLEAU DE BORD */}
            <div className="space-y-5">
              {/* Graphique 1 : Répartition Opérationnelle par Projet */}
              <div className="rounded-xl border border-slate-200 p-4 bg-white">
                <h3 className="text-xs font-black uppercase tracking-wider text-[#c2410c] mb-3 flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-[#ea580c]" />
                  Graphique 1 — Répartition Opérationnelle & Taux d’Avancement par Projet
                </h3>
                <div className="space-y-3">
                  {allProjects.map((proj, pIdx) => {
                    const pTasks = proj.tasks || [];
                    const pDone = pTasks.filter(
                      tk => computeTaskMetrics(tk, todayISO).effectiveStatus === 'Terminé'
                    ).length;
                    const pPct =
                      pTasks.length > 0 ? Math.round((pDone / pTasks.length) * 100) : 0;
                    const pBud = pTasks.reduce(
                      (acc, tk) => acc + (Number(tk.budget) || 0),
                      0
                    );
                    return (
                      <div key={proj.id} className="space-y-1">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-bold text-slate-800">
                            <strong className="font-mono text-[#c2410c]">
                              PRJ {pIdx + 1}
                            </strong>{' '}
                            — {proj.name}
                          </span>
                          <span className="font-bold text-slate-600">
                            {formatCurrency(pBud, currency, language)} •{' '}
                            <strong className="text-[#c2410c]">{pPct}%</strong>
                          </span>
                        </div>
                        <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                          <div
                            className="h-full bg-gradient-to-r from-[#c2410c] to-[#ea580c] rounded-full"
                            style={{ width: `${Math.min(100, Math.max(0, pPct))}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Graphique 2 : Répartition par Statut */}
              <div className="rounded-xl border border-slate-200 p-4 bg-white">
                <h3 className="text-xs font-black uppercase tracking-wider text-[#c2410c] mb-3 flex items-center gap-2">
                  <PieChart className="w-4 h-4 text-[#ea580c]" />
                  Graphique 2 — Répartition des Activités & Jalons par Statut d’Exécution
                </h3>
                <div className="grid grid-cols-4 gap-3">
                  {[
                    {
                      label: 'Terminé',
                      count: statusCounts.Terminé,
                      bg: 'bg-emerald-50 border-emerald-200 text-emerald-800',
                      bar: 'bg-emerald-500'
                    },
                    {
                      label: 'En cours',
                      count: statusCounts['En cours'],
                      bg: 'bg-orange-50 border-orange-200 text-orange-900',
                      bar: 'bg-[#ea580c]'
                    },
                    {
                      label: 'À faire',
                      count: statusCounts['À faire'],
                      bg: 'bg-slate-50 border-slate-200 text-slate-800',
                      bar: 'bg-slate-400'
                    },
                    {
                      label: 'Bloqué',
                      count: statusCounts.Bloqué,
                      bg: 'bg-amber-50 border-amber-200 text-amber-900',
                      bar: 'bg-amber-500'
                    }
                  ].map(st => {
                    const pct =
                      unifiedRows.length > 0
                        ? Math.round((st.count / unifiedRows.length) * 100)
                        : 0;
                    return (
                      <div key={st.label} className={`p-3 rounded-lg border ${st.bg}`}>
                        <div className="text-[10px] font-bold uppercase">{st.label}</div>
                        <div className="text-lg font-black mt-0.5">
                          {st.count}{' '}
                          <span className="text-xs font-semibold opacity-75">({pct}%)</span>
                        </div>
                        <div className="w-full h-2 bg-white rounded-full overflow-hidden mt-1.5">
                          <div className={`h-full ${st.bar}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {renderPageFooter(page4Num)}
        </div>

        {/* =========================================================
            PAGE 5+ : DIAGRAMME DE GANTT SIMPLIFIÉ & ÉPURÉ
            ========================================================= */}
        {ganttChunks.map((chunk, chunkIdx) => {
          const pNum = currentPageCounter++;
          return (
            <div key={`gantt-${chunkIdx}`} className="a4-page flex flex-col justify-between">
              <div>
                {renderPageHeader(
                  `Diagramme de Gantt Simplifié & Épuré (${chunkIdx + 1}/${ganttChunks.length})`
                )}

                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-base font-black uppercase tracking-tight text-[#c2410c] flex items-center gap-2">
                    <GanttChart className="w-4 h-4 text-[#ea580c]" />
                    DIAGRAMME DE GANTT SIMPLIFIÉ & ÉPURÉ (M1 À M12)
                  </h2>
                  <div className="flex items-center gap-3 text-[10px] font-bold">
                    <span className="inline-flex items-center gap-1">
                      <span className="w-3 h-2 bg-[#fdba74] border border-[#ea580c] inline-block" />{' '}
                      Prévu
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="w-3 h-2 bg-emerald-500 inline-block" /> Exécuté
                    </span>
                  </div>
                </div>

                <table className="w-full border-collapse text-[10px]">
                  <thead>
                    <tr className="bg-[#c2410c] text-white">
                      <th className="w-12 px-1.5 py-2 text-left border border-[#c2410c]">Code</th>
                      <th className="w-48 px-2 py-2 text-left border border-[#c2410c]">
                        Activité / Jalon
                      </th>
                      <th className="w-24 px-1.5 py-2 text-left border border-[#c2410c]">Resp.</th>
                      <th className="w-12 px-1 py-2 text-center border border-[#c2410c]">Durée</th>
                      {Array.from({ length: 12 }, (_, m) => (
                        <th
                          key={m}
                          className="w-6 px-0.5 py-2 text-center border border-[#c2410c] font-bold"
                        >
                          M{m + 1}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {chunk.map((r, i) => {
                      const pStartM =
                        r.startDate !== '—' ? new Date(r.startDate).getMonth() + 1 : r.monthNum;
                      const pEndM =
                        r.endDate !== '—' ? new Date(r.endDate).getMonth() + 1 : pStartM;
                      const aStartM =
                        r.actualStartDate !== '—'
                          ? new Date(r.actualStartDate).getMonth() + 1
                          : null;
                      const aEndM =
                        r.actualEndDate !== '—'
                          ? new Date(r.actualEndDate).getMonth() + 1
                          : aStartM;

                      return (
                        <tr
                          key={`${r.code}-${i}`}
                          className={r.type === 'jalon' ? 'bg-orange-50/50' : 'bg-white'}
                        >
                          <td className="px-1.5 py-1.5 font-mono font-bold text-[#c2410c] border border-slate-200">
                            {r.code}
                          </td>
                          <td className="px-2 py-1.5 font-semibold text-slate-800 border border-slate-200 whitespace-normal break-words">
                            {r.label}
                          </td>
                          <td className="px-1.5 py-1.5 text-slate-600 border border-slate-200 whitespace-normal break-words">
                            {r.assignee}
                          </td>
                          <td className="px-1 py-1.5 text-center font-bold text-[#c2410c] border border-slate-200">
                            {r.durationLabel}
                          </td>
                          {Array.from({ length: 12 }, (_, mIdx) => {
                            const m = mIdx + 1;
                            const inPlan =
                              m >= Math.min(pStartM, pEndM) && m <= Math.max(pStartM, pEndM);
                            const inAct =
                              aStartM !== null &&
                              aEndM !== null &&
                              m >= Math.min(aStartM, aEndM) &&
                              m <= Math.max(aStartM, aEndM);
                            return (
                              <td
                                key={m}
                                className="px-0.5 py-1 border border-slate-200 align-middle"
                              >
                                <div className="flex flex-col gap-0.5">
                                  {inPlan && <div className="h-1.5 w-full bg-[#fdba74]" />}
                                  {inAct && <div className="h-1.5 w-full bg-emerald-500" />}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {renderPageFooter(pNum)}
            </div>
          );
        })}

        {/* =========================================================
            PAGE 6+ : TABLEAU 1 — PLANIFICATION MACRO DES ACTIVITÉS & JALONS
            ========================================================= */}
        {tab1Chunks.map((chunk, chunkIdx) => {
          const pNum = currentPageCounter++;
          return (
            <div key={`tab1-${chunkIdx}`} className="a4-page flex flex-col justify-between">
              <div>
                {renderPageHeader(
                  `Tableau 1 — Planification Macro des Activités & Jalons (${chunkIdx + 1}/${
                    tab1Chunks.length
                  })`
                )}

                <h2 className="text-base font-black uppercase tracking-tight text-[#c2410c] mb-3 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-[#ea580c]" />
                  TABLEAU 1 — PLANIFICATION MACRO DES ACTIVITÉS & JALONS
                </h2>

                <table className="w-full border-collapse text-[10px]">
                  <thead>
                    <tr className="bg-[#c2410c] text-white">
                      <th className="w-12 px-1.5 py-2 text-left border border-[#c2410c]">Code</th>
                      <th className="w-44 px-2 py-2 text-left border border-[#c2410c]">
                        Activité / Jalon
                      </th>
                      <th className="w-24 px-1.5 py-2 text-left border border-[#c2410c]">
                        Responsable
                      </th>
                      <th className="w-24 px-1.5 py-2 text-right border border-[#c2410c]">
                        Budget ({currency})
                      </th>
                      <th className="w-12 px-1 py-2 text-center border border-[#c2410c]">Mois</th>
                      <th className="w-14 px-1.5 py-2 text-center border border-[#c2410c]">
                        Antécéd.
                      </th>
                      <th className="w-20 px-1.5 py-2 text-center border border-[#c2410c]">
                        Déb. Prév
                      </th>
                      <th className="w-20 px-1.5 py-2 text-center border border-[#c2410c]">
                        Fin Prév
                      </th>
                      <th className="w-12 px-1 py-2 text-center border border-[#c2410c]">
                        Durée
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {chunk.map((r, i) => (
                      <tr
                        key={`${r.code}-t1-${i}`}
                        className={r.type === 'jalon' ? 'bg-orange-50/50' : 'bg-white'}
                      >
                        <td className="px-1.5 py-1.5 font-mono font-bold text-[#c2410c] border border-slate-200">
                          {r.code}
                        </td>
                        <td className="px-2 py-1.5 font-semibold text-slate-800 border border-slate-200 whitespace-normal break-words">
                          {r.label}
                        </td>
                        <td className="px-1.5 py-1.5 text-slate-700 border border-slate-200 whitespace-normal break-words">
                          {r.assignee}
                        </td>
                        <td className="px-1.5 py-1.5 text-right font-mono font-bold text-slate-800 border border-slate-200">
                          {formatCurrency(r.budget, currency, language)}
                        </td>
                        <td className="px-1 py-1.5 text-center font-bold border border-slate-200">
                          {r.monthLabel}
                        </td>
                        <td className="px-1.5 py-1.5 text-center font-mono text-slate-600 border border-slate-200">
                          {r.antecedentCode}
                        </td>
                        <td className="px-1.5 py-1.5 text-center border border-slate-200">
                          {r.startDate}
                        </td>
                        <td className="px-1.5 py-1.5 text-center border border-slate-200">
                          {r.endDate}
                        </td>
                        <td className="px-1 py-1.5 text-center font-bold text-[#c2410c] border border-slate-200">
                          {r.durationLabel}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {renderPageFooter(pNum)}
            </div>
          );
        })}

        {/* =========================================================
            PAGE 7+ : TABLEAU 2 — SUIVI DE L'EXÉCUTION DES ACTIVITÉS & ÉCARTS
            ========================================================= */}
        {tab2Chunks.map((chunk, chunkIdx) => {
          const pNum = currentPageCounter++;
          return (
            <div key={`tab2-${chunkIdx}`} className="a4-page flex flex-col justify-between">
              <div>
                {renderPageHeader(
                  `Tableau 2 — Suivi de l'Exécution des Activités & Écarts (${chunkIdx + 1}/${
                    tab2Chunks.length
                  })`
                )}

                <h2 className="text-base font-black uppercase tracking-tight text-[#c2410c] mb-3 flex items-center gap-2">
                  <ListChecks className="w-4 h-4 text-[#ea580c]" />
                  TABLEAU 2 — SUIVI DE L’EXÉCUTION DES ACTIVITÉS & ÉCARTS
                </h2>

                <table className="w-full border-collapse text-[9.5px]">
                  <thead>
                    <tr className="bg-[#c2410c] text-white">
                      <th className="w-11 px-1 py-2 text-left border border-[#c2410c]">Code</th>
                      <th className="w-36 px-1.5 py-2 text-left border border-[#c2410c]">
                        Activité / Jalon
                      </th>
                      <th className="w-20 px-1 py-2 text-left border border-[#c2410c]">Resp.</th>
                      <th className="w-16 px-1 py-2 text-center border border-[#c2410c]">Statut</th>
                      <th className="w-16 px-1 py-2 text-center border border-[#c2410c]">
                        Déb. Prév
                      </th>
                      <th className="w-16 px-1 py-2 text-center border border-[#c2410c]">
                        Fin Prév
                      </th>
                      <th className="w-10 px-1 py-2 text-center border border-[#c2410c]">Durée</th>
                      <th className="w-16 px-1 py-2 text-center border border-[#c2410c]">
                        Déb. Exéc
                      </th>
                      <th className="w-16 px-1 py-2 text-center border border-[#c2410c]">
                        Fin Exéc
                      </th>
                      <th className="w-10 px-1 py-2 text-center border border-[#c2410c]">Réel</th>
                      <th className="w-16 px-1 py-2 text-center border border-[#c2410c]">
                        Écart début
                      </th>
                      <th className="w-16 px-1 py-2 text-center border border-[#c2410c]">
                        Écart fin
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {chunk.map((r, i) => (
                      <tr
                        key={`${r.code}-t2-${i}`}
                        className={r.type === 'jalon' ? 'bg-orange-50/50' : 'bg-white'}
                      >
                        <td className="px-1 py-1.5 font-mono font-bold text-[#c2410c] border border-slate-200">
                          {r.code}
                        </td>
                        <td className="px-1.5 py-1.5 font-semibold text-slate-800 border border-slate-200 whitespace-normal break-words">
                          {r.label}
                        </td>
                        <td className="px-1 py-1.5 text-slate-700 border border-slate-200 whitespace-normal break-words">
                          {r.assignee}
                        </td>
                        <td className="px-1 py-1.5 text-center font-bold border border-slate-200">
                          {r.statusLabel}
                        </td>
                        <td className="px-1 py-1.5 text-center border border-slate-200">
                          {r.startDate}
                        </td>
                        <td className="px-1 py-1.5 text-center border border-slate-200">
                          {r.endDate}
                        </td>
                        <td className="px-1 py-1.5 text-center font-bold border border-slate-200">
                          {r.durationLabel}
                        </td>
                        <td className="px-1 py-1.5 text-center border border-slate-200">
                          {r.actualStartDate}
                        </td>
                        <td className="px-1 py-1.5 text-center border border-slate-200">
                          {r.actualEndDate}
                        </td>
                        <td className="px-1 py-1.5 text-center font-bold text-[#c2410c] border border-slate-200">
                          {r.realDurationLabel}
                        </td>
                        <td
                          className={`px-1 py-1.5 text-center font-bold border border-slate-200 ${
                            r.ecartDebutDays > 0
                              ? 'text-amber-700'
                              : r.ecartDebutDays < 0
                              ? 'text-emerald-700'
                              : 'text-slate-600'
                          }`}
                        >
                          {r.ecartDebutLabel}
                        </td>
                        <td
                          className={`px-1 py-1.5 text-center font-bold border border-slate-200 ${
                            r.ecartFinDays > 0
                              ? 'text-amber-700'
                              : r.ecartFinDays < 0
                              ? 'text-emerald-700'
                              : 'text-slate-600'
                          }`}
                        >
                          {r.ecartFinLabel}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {renderPageFooter(pNum)}
            </div>
          );
        })}

        {/* =========================================================
            FINAL PAGE(S) : INTERPRÉTATION DYNAMIQUE DU RÉSEAU PERT & CHEMIN CRITIQUE
            ========================================================= */}
        {pertChunks.map((chunk, chunkIdx) => {
          const pNum = currentPageCounter++;
          return (
            <div key={`pert-${chunkIdx}`} className="a4-page flex flex-col justify-between">
              <div>
                {renderPageHeader(
                  `Interprétation Dynamique du Réseau PERT & Chemin Critique (${chunkIdx + 1}/${
                    pertChunks.length
                  })`
                )}

                <h2 className="text-base font-black uppercase tracking-tight text-[#c2410c] mb-3 flex items-center gap-2">
                  <Network className="w-4 h-4 text-[#ea580c]" />
                  INTERPRÉTATION DYNAMIQUE DU RÉSEAU PERT & CHEMIN CRITIQUE (CPM)
                </h2>

                {chunkIdx === 0 && pertSummaries.length > 0 && (
                  <div className="mb-4 p-4 rounded-xl bg-orange-50 border border-[#fdba74] space-y-2.5">
                    {pertSummaries.map(ps => (
                      <div key={ps.projectId} className="space-y-1 text-[11px] text-slate-700">
                        <div className="font-black text-[#c2410c] uppercase flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-[#ea580c]" />
                          {ps.projectName} — Durée Optimale : {ps.projectDuration}j (Chemin
                          Critique : {ps.criticalPathCodes.join(' → ') || 'N/A'})
                        </div>
                        <p className="pl-5 text-slate-700">{ps.interpretation.criticalPathSummary}</p>
                        <p className="pl-5 text-slate-600">{ps.interpretation.slackSummary}</p>
                        <p className="pl-5 font-semibold text-slate-800">
                          {ps.interpretation.riskAndSteeringSummary}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                <table className="w-full border-collapse text-[10px]">
                  <thead>
                    <tr className="bg-[#c2410c] text-white">
                      <th className="px-2 py-2 text-left border border-[#c2410c]">Code</th>
                      <th className="px-2 py-2 text-left border border-[#c2410c]">
                        Activité / Jalon
                      </th>
                      <th className="px-1.5 py-2 text-center border border-[#c2410c]">Antécéd.</th>
                      <th className="px-1.5 py-2 text-center border border-[#c2410c]">Précéd.</th>
                      <th className="px-1.5 py-2 text-center border border-[#c2410c]">Durée</th>
                      <th className="px-1.5 py-2 text-center border border-[#c2410c]">ES (Tôt)</th>
                      <th className="px-1.5 py-2 text-center border border-[#c2410c]">EF (Tôt)</th>
                      <th className="px-1.5 py-2 text-center border border-[#c2410c]">LS (Tard)</th>
                      <th className="px-1.5 py-2 text-center border border-[#c2410c]">LF (Tard)</th>
                      <th className="px-1.5 py-2 text-center border border-[#c2410c]">
                        Marge Tot.
                      </th>
                      <th className="px-1.5 py-2 text-center border border-[#c2410c]">Criticité</th>
                    </tr>
                  </thead>
                  <tbody>
                    {chunk.map((node: PertNode) => (
                      <tr
                        key={node.id}
                        className={node.isCritical ? 'bg-amber-50/70 font-bold' : 'bg-white'}
                      >
                        <td className="px-2 py-1.5 font-mono font-bold text-[#c2410c] border border-slate-200">
                          {node.code}
                        </td>
                        <td className="px-2 py-1.5 text-slate-800 border border-slate-200 whitespace-normal break-words">
                          {node.name}
                        </td>
                        <td className="px-1.5 py-1.5 text-center font-mono border border-slate-200">
                          {node.antecedentCode}
                        </td>
                        <td className="px-1.5 py-1.5 text-center font-mono text-[9px] border border-slate-200">
                          {node.precedingChainCodes}
                        </td>
                        <td className="px-1.5 py-1.5 text-center border border-slate-200">
                          {node.duration}j
                        </td>
                        <td className="px-1.5 py-1.5 text-center border border-slate-200">
                          J+{node.es}
                        </td>
                        <td className="px-1.5 py-1.5 text-center border border-slate-200">
                          J+{node.ef}
                        </td>
                        <td className="px-1.5 py-1.5 text-center border border-slate-200">
                          J+{node.ls}
                        </td>
                        <td className="px-1.5 py-1.5 text-center border border-slate-200">
                          J+{node.lf}
                        </td>
                        <td className="px-1.5 py-1.5 text-center border border-slate-200">
                          {node.totalFloat}j
                        </td>
                        <td className="px-1.5 py-1.5 text-center border border-slate-200">
                          {node.isCritical ? (
                            <span className="inline-flex items-center gap-1 text-amber-800 font-black">
                              <AlertTriangle className="w-3 h-3" /> CRITIQUE
                            </span>
                          ) : (
                            <span className="text-emerald-700">Souple</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {renderPageFooter(pNum)}
            </div>
          );
        })}
      </div>
    </div>
  );
};
