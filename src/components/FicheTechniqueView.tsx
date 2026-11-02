import React from 'react';
import { Printer } from 'lucide-react';
import { CurrencyCode, Dossier, LanguageCode, Task, UserProfile } from '../types';
import { computeDossierPertSummary, computeTaskMetrics, getTodayISO, STANDARD_PHASES } from '../pertUtils';
import { formatCurrencyValue } from '../i18n';
import { AppLogo } from './AppLogo';

interface FicheTechniqueViewProps {
  activeDossier: Dossier;
  userProfile: UserProfile;
  currency: CurrencyCode;
  language: LanguageCode;
  onExportPDF: () => void;
}

function chunkArray<T>(items: T[], size: number): T[][] {
  if (items.length === 0) return [[]];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export const FicheTechniqueView: React.FC<FicheTechniqueViewProps> = ({
  activeDossier,
  userProfile,
  currency,
  onExportPDF
}) => {
  const todayISO = getTodayISO();

  // Gather all tasks ordered by project and phase with exact codes
  const allRows: {
    code: string;
    task: Task;
    projectName: string;
    axeName: string;
    antCode: string;
  }[] = [];

  const allProjects: {
    id: string;
    name: string;
    axeName: string;
    tasks: Task[];
  }[] = [];

  (activeDossier.axes || []).forEach(ax => {
    (ax.projects || []).forEach(pr => {
      allProjects.push({
        id: pr.id,
        name: pr.name,
        axeName: ax.name,
        tasks: pr.tasks || []
      });

      const ordered: { task: Task; code: string }[] = [];
      STANDARD_PHASES.forEach((pName, pIdx) => {
        (pr.tasks || [])
          .filter(t => t.phase === pName)
          .forEach((tk, tIdx) => {
            ordered.push({
              task: tk,
              code: `${tk.type === 'jalon' ? 'J' : 'T'}.${pIdx + 1}.${tIdx + 1}`
            });
          });
      });

      const codeMap = new Map<string, string>();
      ordered.forEach(o => codeMap.set(o.task.id, o.code));

      ordered.forEach(o => {
        const antCode =
          o.task.antecedent && codeMap.has(o.task.antecedent)
            ? codeMap.get(o.task.antecedent)!
            : '—';
        allRows.push({
          code: o.code,
          task: o.task,
          projectName: pr.name,
          axeName: ax.name,
          antCode
        });
      });
    });
  });

  // Portfolio KPIs
  const totalBudget = allRows.reduce((s, r) => s + (Number(r.task.budget) || 0), 0);
  const doneCount = allRows.filter(r => computeTaskMetrics(r.task, todayISO).effectiveStatus === 'Terminé').length;
  const inProgressCount = allRows.filter(r => computeTaskMetrics(r.task, todayISO).effectiveStatus === 'En cours').length;
  const blockedCount = allRows.filter(r => computeTaskMetrics(r.task, todayISO).effectiveStatus === 'Bloqué').length;
  const todoCount = allRows.filter(r => computeTaskMetrics(r.task, todayISO).effectiveStatus === 'À faire').length;
  const rate = allRows.length > 0 ? Math.round((doneCount / allRows.length) * 100) : 0;

  // Timeline bounds for simplified Gantt
  let minMs = Infinity;
  let maxMs = -Infinity;
  allRows.forEach(r => {
    const s = new Date(r.task.startDate).getTime();
    const e = new Date(r.task.endDate).getTime();
    if (!isNaN(s) && s < minMs) minMs = s;
    if (!isNaN(e) && e > maxMs) maxMs = e;
  });
  if (!isFinite(minMs) || !isFinite(maxMs) || maxMs <= minMs) {
    minMs = new Date(`${activeDossier.psdYear || 2025}-01-01`).getTime();
    maxMs = new Date(`${(activeDossier.psdYear || 2025) + 1}-12-31`).getTime();
  }
  const totalTimelineMs = Math.max(86400000, maxMs - minMs);

  // Chunks for multi-page A4 pagination so nothing is ever crushed
  const ganttChunks = chunkArray(allRows, 16);
  const planChunks = chunkArray(allRows, 14);
  const suiviChunks = chunkArray(allRows, 14);
  const pertSummaries = computeDossierPertSummary(activeDossier, todayISO);
  const pertChunks = chunkArray(pertSummaries, 2);

  // Compute dynamic page numbers for Sommaire
  const page1 = 1; // Couverture & Identité
  const page2 = 2; // Sommaire
  const page3 = 3; // Acronymes
  const page4 = 4; // Synthèse Financière & 2 Graphiques
  const pageGanttStart = 5;
  const pagePlanStart = pageGanttStart + ganttChunks.length;
  const pageSuiviStart = pagePlanStart + planChunks.length;
  const pagePertStart = pageSuiviStart + suiviChunks.length;
  const totalPages = pagePertStart + pertChunks.length - 1;

  const renderPageHeader = (sectionLabel: string, pageNum: number) => (
    <div className="flex items-center justify-between border-b-2 border-[#fdba74] pb-3 mb-6">
      <div className="flex items-center gap-2.5">
        <AppLogo className="w-9 h-9" />
        <div>
          <p className="text-[9px] font-black uppercase tracking-widest text-[#ea580c]">
            faab gar — DOCUMENT EXÉCUTIF CONSOLIDÉ
          </p>
          <p className="text-xs font-black text-slate-900 uppercase">{activeDossier.name}</p>
        </div>
      </div>
      <div className="text-right">
        <span className="inline-block px-2.5 py-0.5 rounded bg-[#fff7ed] border border-[#fdba74] text-[9px] font-black uppercase text-[#c2410c]">
          {sectionLabel}
        </span>
        <p className="text-[9px] font-bold text-slate-500 mt-0.5">
          Page {pageNum} / {totalPages}
        </p>
      </div>
    </div>
  );

  const renderPageFooter = (pageNum: number) => (
    <div className="mt-auto pt-4 border-t border-slate-200 flex items-center justify-between text-[9px] font-bold text-slate-500">
      <span>faab gar • {activeDossier.institution || userProfile.institution || 'Portefeuille Stratégique'}</span>
      <span>Édité le {new Date().toLocaleDateString('fr-FR')}</span>
      <span>
        Page {pageNum} sur {totalPages}
      </span>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Top Action Bar */}
      <div className="flex flex-wrap justify-between items-center gap-3 bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <span className="text-[10px] font-black uppercase tracking-widest text-[#ea580c] dark:text-[#fdba74] block">
            ÉDITION MULTI-PAGES A4 HAUTE LISIBILITÉ • FOND BLANC PUR (#FFFFFF)
          </span>
          <h3 className="text-sm font-black text-slate-900 dark:text-white">
            Fiche Technique & Résumé Exécutif ({totalPages} pages A4 consolidées)
          </h3>
        </div>
        <button
          onClick={onExportPDF}
          className="px-4 py-2 rounded-lg bg-[#fdba74] hover:bg-[#7bc8f6] text-slate-950 text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-sm transition cursor-pointer"
        >
          <Printer className="w-4 h-4" /> Exporter PDF Direct (Fond Blanc)
        </button>
      </div>

      {/* MULTI-PAGE A4 CONTAINER */}
      <div className="space-y-8 pb-8">
        {/* =========================================================
            PAGE 1 : PRÉSENTATION DU DOCUMENT & IDENTITÉ DU RESPONSABLE
           ========================================================= */}
        <div className="a4-page flex flex-col justify-between">
          <div>
            {/* Top Institutional Banner */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b-4 border-[#fdba74] pb-6 mb-8">
              <div className="flex items-center gap-4">
                <AppLogo className="w-16 h-16 sm:w-20 sm:h-20" />
                <div>
                  <span className="inline-block px-3 py-1 rounded bg-[#c2410c] text-[#fdba74] text-[10px] font-black uppercase tracking-widest mb-1.5">
                    faab gar — INGÉNIERIE DE PROJETS
                  </span>
                  <h1 className="text-xl sm:text-2xl font-black uppercase tracking-tight text-slate-950 leading-tight">
                    DOCUMENT EXÉCUTIF CONSOLIDÉ
                  </h1>
                  <p className="text-xs font-bold text-slate-600 mt-1">
                    Fiche Technique Officielle, Planification Macro, Suivi d’Exécution & Analyse PERT
                  </p>
                </div>
              </div>
              <div className="bg-[#fff7ed] border border-[#fdba74] rounded-xl p-3 text-left sm:text-right shrink-0">
                <p className="text-[9px] font-black uppercase text-[#ea580c]">Référence Dossier</p>
                <p className="text-xs font-black text-slate-950 mt-0.5">{activeDossier.id.toUpperCase()}</p>
                <p className="text-[10px] font-bold text-slate-600 mt-1">
                  Date : {new Date().toLocaleDateString('fr-FR')}
                </p>
              </div>
            </div>

            {/* Cover Title Card */}
            <div className="bg-[#f8fafc] border-2 border-[#fdba74] rounded-2xl p-6 sm:p-8 mb-8 shadow-sm">
              <span className="text-[10px] font-black uppercase tracking-widest text-[#ea580c] block mb-2">
                INTITULÉ OFFICIEL DU PORTEFEUILLE / PROGRAMME
              </span>
              <h2 className="text-lg sm:text-2xl font-black text-slate-950 uppercase leading-snug mb-3">
                {activeDossier.name}
              </h2>
              <p className="text-xs sm:text-sm text-slate-700 leading-relaxed mb-6">
                {activeDossier.description ||
                  'Portefeuille opérationnel structuré selon les standards internationaux de planification stratégique, budgétisation et maîtrise des délais.'}
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t border-slate-200">
                <div className="bg-white p-3 rounded-lg border border-slate-200">
                  <span className="text-[9px] font-black uppercase text-slate-400 block">Horizon temporel</span>
                  <span className="text-xs font-black text-slate-900">{activeDossier.horizonPlan || '—'}</span>
                </div>
                <div className="bg-white p-3 rounded-lg border border-slate-200">
                  <span className="text-[9px] font-black uppercase text-slate-400 block">Type de dossier</span>
                  <span className="text-xs font-black text-slate-900">{activeDossier.type || 'Portefeuille'}</span>
                </div>
                <div className="bg-white p-3 rounded-lg border border-slate-200">
                  <span className="text-[9px] font-black uppercase text-slate-400 block">Axes & Projets</span>
                  <span className="text-xs font-black text-slate-900">
                    {(activeDossier.axes || []).length} Axes / {allProjects.length} Projets
                  </span>
                </div>
                <div className="bg-white p-3 rounded-lg border border-slate-200">
                  <span className="text-[9px] font-black uppercase text-slate-400 block">Activités & Jalons</span>
                  <span className="text-xs font-black text-[#ea580c]">{allRows.length} enregistrés</span>
                </div>
              </div>
            </div>

            {/* Section : Identité du Responsable & Organisation */}
            <div className="bg-white border-2 border-slate-200 rounded-2xl p-6 mb-6">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3 mb-5">
                <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-[#c2410c]">
                  1. Identité du Responsable & Organisation Tutelle
                </h3>
                <span className="px-2.5 py-0.5 rounded bg-[#fff7ed] text-[#ea580c] text-[9px] font-black uppercase">
                  Responsabilité Opérationnelle
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="text-[9px] font-black uppercase text-slate-400 block mb-1">
                    Responsable / Chef de Portefeuille
                  </span>
                  <span className="font-black text-slate-900 text-sm">
                    {userProfile.fullName || 'Non renseigné'}
                  </span>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="text-[9px] font-black uppercase text-slate-400 block mb-1">
                    Fonction / Titre Officiel
                  </span>
                  <span className="font-black text-slate-900 text-sm">
                    {userProfile.role || 'Non renseigné'}
                  </span>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="text-[9px] font-black uppercase text-slate-400 block mb-1">
                    Institution / Organisation
                  </span>
                  <span className="font-black text-slate-900 text-sm">
                    {userProfile.institution || activeDossier.institution || 'Non renseigné'}
                  </span>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="text-[9px] font-black uppercase text-slate-400 block mb-1">
                    Coordonnées Professionnelles (Email / Tél.)
                  </span>
                  <span className="font-bold text-slate-800">
                    {userProfile.email || '—'} {userProfile.phone ? `• ${userProfile.phone}` : ''}
                  </span>
                </div>
              </div>
            </div>

            {/* Objectif du document exécutif */}
            <div className="p-5 rounded-xl bg-[#fff7ed] border border-[#fdba74] text-xs text-slate-800 leading-relaxed">
              <p className="font-black uppercase text-[#c2410c] mb-1">
                Objet du Document Exécutif Consolidé
              </p>
              <p>
                Le présent document constitue la synthèse officielle et certifiée du dossier{' '}
                <strong>« {activeDossier.name} »</strong>. Il regroupe de manière aérée et structurée les indicateurs
                financiers, la répartition graphique de l’avancement, le calendrier Gantt, la matrice complète de
                planification macro, l’état d’exécution réel avec calcul des écarts ainsi que le diagnostic du chemin
                critique PERT/CPM.
              </p>
            </div>
          </div>

          {renderPageFooter(page1)}
        </div>

        {/* =========================================================
            PAGE 2 : LE SOMMAIRE (TABLE DES MATIÈRES)
           ========================================================= */}
        <div className="a4-page flex flex-col justify-between">
          <div>
            {renderPageHeader('SOMMAIRE EXÉCUTIF', page2)}

            <div className="my-6">
              <span className="text-[10px] font-black uppercase tracking-widest text-[#ea580c] block mb-1">
                ARCHITECTURE DOCUMENTAIRE NORMALISÉE
              </span>
              <h2 className="text-xl font-black text-slate-950 uppercase tracking-tight mb-6">
                SOMMAIRE DU DOCUMENT EXÉCUTIF CONSOLIDÉ
              </h2>

              <div className="space-y-4">
                {[
                  {
                    num: '01',
                    title: 'Présentation du Document Exécutif Consolidé & Identité du Responsable',
                    desc: 'Identification officielle du dossier, gouvernance, responsable du portefeuille et périmètre stratégique.',
                    page: page1
                  },
                  {
                    num: '02',
                    title: 'Sommaire Général & Structure Documentaire',
                    desc: 'Indexation paginée des chapitres, tableaux analytiques et représentations graphiques.',
                    page: page2
                  },
                  {
                    num: '03',
                    title: 'Table des Acronymes, Sigles & Abréviations Normalisées',
                    desc: 'Référentiel méthodologique des termes techniques de planification, budgétisation et PERT/CPM.',
                    page: page3
                  },
                  {
                    num: '04',
                    title: 'Synthèse Financière, Avancement Opérationnel & Graphiques du Tableau de Bord',
                    desc: 'Indicateurs clés de performance (KPI), répartition opérationnelle par projet et répartition par statut.',
                    page: page4
                  },
                  {
                    num: '05',
                    title: 'Diagramme de Gantt Simplifié & Épuré',
                    desc: 'Visualisation chronologique des barres d’activités et jalons sur l’horizon du dossier.',
                    page: pageGanttStart
                  },
                  {
                    num: '06',
                    title: 'Tableau 1 — Planification Macro des Activités & Jalons',
                    desc: 'Matrice prévisionnelle complète : codes WBS, budgets, mois cibles, antécédents et durées prévues.',
                    page: pagePlanStart
                  },
                  {
                    num: '07',
                    title: 'Tableau 2 — Suivi de l’Exécution des Activités & Écarts',
                    desc: 'Comparaison entre dates prévues et dates réelles d’exécution avec calcul des avances et retards.',
                    page: pageSuiviStart
                  },
                  {
                    num: '08',
                    title: 'Interprétation Dynamique du Réseau PERT & Chemin Critique (CPM)',
                    desc: 'Analyse algorithmique des marges totales/libres, identification du chemin critique et recommandations.',
                    page: pagePertStart
                  }
                ].map(item => (
                  <div
                    key={item.num}
                    className="flex items-start justify-between gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200 hover:border-[#fdba74] transition"
                  >
                    <div className="flex items-start gap-3.5">
                      <span className="w-8 h-8 rounded-lg bg-[#c2410c] text-[#fdba74] font-black text-xs flex items-center justify-center shrink-0">
                        {item.num}
                      </span>
                      <div>
                        <h4 className="text-xs sm:text-sm font-black text-slate-900 uppercase">
                          {item.title}
                        </h4>
                        <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">{item.desc}</p>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <span className="inline-block px-2.5 py-1 rounded bg-white border border-slate-200 text-xs font-black text-[#c2410c]">
                        Page {item.page}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {renderPageFooter(page2)}
        </div>

        {/* =========================================================
            PAGE 3 : LES ACRONYMES
           ========================================================= */}
        <div className="a4-page flex flex-col justify-between">
          <div>
            {renderPageHeader('ACRONYMES & SIGLES', page3)}

            <div className="my-6">
              <span className="text-[10px] font-black uppercase tracking-widest text-[#ea580c] block mb-1">
                NOMENCLATURE INTERNATIONALE DE GESTION DE PROJET
              </span>
              <h2 className="text-xl font-black text-slate-950 uppercase tracking-tight mb-6">
                LISTE DES ACRONYMES & ABRÉVIATIONS OFFICIELLES
              </h2>

              <table className="w-full text-left border-collapse border border-slate-200 text-xs">
                <thead>
                  <tr className="bg-[#c2410c] text-white uppercase text-[10px] font-black">
                    <th className="p-3 border border-slate-300 w-36">Acronyme / Sigle</th>
                    <th className="p-3 border border-slate-300">Signification Complète & Définition Opérationnelle</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {[
                    [
                      'faab gar',
                      'Plateforme Universelle de Planification Opérationnelle, Suivi-Évaluation et Pilotage Stratégique de Projets.'
                    ],
                    [
                      'WBS (SDP)',
                      'Work Breakdown Structure / Structure de Découpage du Projet en Axes, Projets, Phases, Tâches et Jalons.'
                    ],
                    [
                      'PERT',
                      'Program Evaluation and Review Technique — Méthode d’ordonnancement en réseau par graphe de dépendances.'
                    ],
                    [
                      'CPM',
                      'Critical Path Method — Méthode du Chemin Critique déterminant la séquence incompressible du projet.'
                    ],
                    [
                      'ES / EF',
                      'Early Start / Early Finish — Dates de début et de fin au plus tôt calculées par passe avant (Forward Pass).'
                    ],
                    [
                      'LS / LF',
                      'Late Start / Late Finish — Dates de début et de fin au plus tard calculées par passe arrière (Backward Pass).'
                    ],
                    [
                      'MT / ML',
                      'Marge Totale / Marge Libre — Délai de battement dont dispose une tâche sans retarder la fin du projet (MT) ou son successeur (ML).'
                    ],
                    [
                      'TDR / ToR',
                      'Termes de Référence (Terms of Reference) — Cahier des charges méthodologique et contractuel d’une mission.'
                    ],
                    [
                      'CAP',
                      'Contrôle d’Avancement Périodique — Audit régulier de l’exécution physique, calendaire et budgétaire.'
                    ],
                    [
                      'KPI',
                      'Key Performance Indicator — Indicateur Clé de Performance mesurant l’atteinte des résultats et jalons.'
                    ],
                    [
                      'NDA',
                      'Non-Disclosure Agreement — Accord / Contrat de Confidentialité et de protection des données stratégiques.'
                    ],
                    [
                      'FCFA / EUR / USD',
                      'Devises monétaires de référence utilisées pour la valorisation budgétaire multi-devises du portefeuille.'
                    ]
                  ].map(([sigle, def], idx) => (
                    <tr key={sigle} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                      <td className="p-3 border border-slate-200 font-black text-[#c2410c] whitespace-nowrap">
                        {sigle}
                      </td>
                      <td className="p-3 border border-slate-200 text-slate-700 leading-relaxed">{def}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {renderPageFooter(page3)}
        </div>

        {/* =========================================================
            PAGE 4 : SYNTHÈSE FINANCIÈRE & AVANCEMENT + LES 2 GRAPHIQUES DU TABLEAU DE BORD
           ========================================================= */}
        <div className="a4-page flex flex-col justify-between">
          <div>
            {renderPageHeader('SYNTHÈSE & GRAPHIQUES', page4)}

            <div className="my-4 space-y-6">
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-[#ea580c] block mb-1">
                  INDICATEURS CONSOLIDÉS DU PORTEFEUILLE
                </span>
                <h2 className="text-xl font-black text-slate-950 uppercase tracking-tight">
                  SYNTHÈSE FINANCIÈRE & AVANCEMENT OPÉRATIONNEL
                </h2>
              </div>

              {/* 4 KPI Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
                <div className="p-4 rounded-xl bg-[#fff7ed] border-2 border-[#fdba74]">
                  <span className="text-[9px] font-black uppercase text-[#ea580c] block">
                    Budget Global Consolidé
                  </span>
                  <span className="text-base font-black text-slate-950 mt-1 block">
                    {formatCurrencyValue(totalBudget, currency)}
                  </span>
                  <span className="text-[10px] text-slate-600 font-semibold">
                    Sur {allProjects.length} projet(s)
                  </span>
                </div>

                <div className="p-4 rounded-xl bg-emerald-50 border-2 border-emerald-200">
                  <span className="text-[9px] font-black uppercase text-emerald-700 block">
                    Taux d’Avancement Global
                  </span>
                  <span className="text-base font-black text-emerald-800 mt-1 block">{rate}%</span>
                  <span className="text-[10px] text-emerald-700 font-semibold">
                    {doneCount} / {allRows.length} terminés
                  </span>
                </div>

                <div className="p-4 rounded-xl bg-orange-50 border-2 border-orange-200">
                  <span className="text-[9px] font-black uppercase text-orange-700 block">
                    Activités En Cours
                  </span>
                  <span className="text-base font-black text-orange-900 mt-1 block">{inProgressCount}</span>
                  <span className="text-[10px] text-orange-700 font-semibold">
                    À faire : {todoCount}
                  </span>
                </div>

                <div className="p-4 rounded-xl bg-red-50 border-2 border-red-200">
                  <span className="text-[9px] font-black uppercase text-red-700 block">
                    Points de Blocage
                  </span>
                  <span className="text-base font-black text-red-700 mt-1 block">{blockedCount}</span>
                  <span className="text-[10px] text-red-600 font-semibold">
                     Surveillance prioritaire
                  </span>
                </div>
              </div>

              {/* LES 2 GRAPHIQUES DU TABLEAU DE BORD */}
              <div className="grid grid-cols-1 gap-6 pt-2">
                {/* Graphique 1 : Répartition Opérationnelle par Projet */}
                <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200">
                  <h4 className="text-xs font-black uppercase tracking-wider text-[#c2410c] mb-4 border-b border-slate-200 pb-2">
                    Graphique 1 — Répartition Opérationnelle & Budgétaire par Projet
                  </h4>
                  <div className="space-y-3.5">
                    {allProjects.map(p => {
                      const pTasks = p.tasks || [];
                      const pDone = pTasks.filter(
                        t => computeTaskMetrics(t, todayISO).effectiveStatus === 'Terminé'
                      ).length;
                      const pPct = pTasks.length > 0 ? Math.round((pDone / pTasks.length) * 100) : 0;
                      const pBud = pTasks.reduce((s, t) => s + (Number(t.budget) || 0), 0);
                      return (
                        <div key={p.id} className="space-y-1.5 bg-white p-3 rounded-xl border border-slate-200">
                          <div className="flex justify-between items-center text-xs font-bold">
                            <span className="text-slate-900">{p.name}</span>
                            <span className="text-[#ea580c] font-black">
                              {pPct}% ({pDone}/{pTasks.length}) • {formatCurrencyValue(pBud, currency)}
                            </span>
                          </div>
                          <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                            <div
                              className="h-full bg-[#ea580c] rounded-full"
                              style={{ width: `${Math.max(3, pPct)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Graphique 2 : Répartition par Statut */}
                <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200">
                  <h4 className="text-xs font-black uppercase tracking-wider text-[#c2410c] mb-4 border-b border-slate-200 pb-2">
                    Graphique 2 — Répartition Globale des Activités & Jalons par Statut d’Exécution
                  </h4>
                  <div className="space-y-3 bg-white p-4 rounded-xl border border-slate-200">
                    {(
                      [
                        { label: 'Terminé', count: doneCount, color: 'bg-emerald-500', text: 'text-emerald-700' },
                        { label: 'En cours', count: inProgressCount, color: 'bg-[#ea580c]', text: 'text-orange-700' },
                        { label: 'À faire', count: todoCount, color: 'bg-slate-400', text: 'text-slate-700' },
                        { label: 'Bloqué', count: blockedCount, color: 'bg-red-500', text: 'text-red-700' }
                      ] as const
                    ).map(st => {
                      const pct = allRows.length > 0 ? Math.round((st.count / allRows.length) * 100) : 0;
                      return (
                        <div key={st.label} className="space-y-1">
                          <div className="flex justify-between text-xs font-bold">
                            <span className={st.text}>{st.label}</span>
                            <span className="text-slate-900 font-black">
                              {st.count} tâche(s) ({pct}%)
                            </span>
                          </div>
                          <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                            <div className={`h-full ${st.color}`} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {renderPageFooter(page4)}
        </div>

        {/* =========================================================
            PAGE 5+ : DIAGRAMME DE GANTT SIMPLIFIÉ & ÉPURÉ
           ========================================================= */}
        {ganttChunks.map((chunk, cIdx) => {
          const currentPage = pageGanttStart + cIdx;
          return (
            <div key={`gantt-page-${cIdx}`} className="a4-page flex flex-col justify-between">
              <div>
                {renderPageHeader(
                  `DIAGRAMME DE GANTT SIMPLIFIÉ (${cIdx + 1}/${ganttChunks.length})`,
                  currentPage
                )}

                <div className="my-4">
                  <span className="text-[10px] font-black uppercase tracking-widest text-[#ea580c] block mb-1">
                    CALENDRIER VISUEL DES ACTIVITÉS & JALONS
                  </span>
                  <h2 className="text-lg font-black text-slate-950 uppercase tracking-tight mb-4">
                    DIAGRAMME DE GANTT SIMPLIFIÉ & ÉPURÉ{' '}
                    {ganttChunks.length > 1 ? `— PARTIE ${cIdx + 1}/${ganttChunks.length}` : ''}
                  </h2>

                  <div className="border border-slate-300 rounded-xl overflow-hidden">
                    <div className="grid grid-cols-12 bg-[#c2410c] text-white text-[9px] font-black uppercase py-2.5 px-3">
                      <div className="col-span-1">Code</div>
                      <div className="col-span-4">Activité / Jalon</div>
                      <div className="col-span-2">Période Prévue</div>
                      <div className="col-span-5">Chronologie Visuelle Gantt</div>
                    </div>
                    <div className="divide-y divide-slate-200">
                      {chunk.map(({ code, task, projectName }) => {
                        const m = computeTaskMetrics(task, todayISO);
                        const sMs = new Date(task.startDate).getTime();
                        const eMs = new Date(task.endDate).getTime();
                        const leftPct = !isNaN(sMs)
                          ? Math.max(0, Math.min(94, ((sMs - minMs) / totalTimelineMs) * 100))
                          : 0;
                        const widthPct =
                          !isNaN(sMs) && !isNaN(eMs)
                            ? Math.max(3, Math.min(100 - leftPct, ((eMs - sMs) / totalTimelineMs) * 100))
                            : 5;

                        const barColor =
                          m.effectiveStatus === 'Terminé'
                            ? 'bg-emerald-500'
                            : m.effectiveStatus === 'Bloqué'
                            ? 'bg-red-500'
                            : m.effectiveStatus === 'En cours'
                            ? 'bg-[#ea580c]'
                            : 'bg-slate-400';

                        return (
                          <div
                            key={task.id}
                            className="grid grid-cols-12 items-center py-2.5 px-3 text-[10px] bg-white hover:bg-slate-50"
                          >
                            <div className="col-span-1 font-black text-[#c2410c]">{code}</div>
                            <div className="col-span-4 pr-2 whitespace-normal break-words">
                              <span className="font-bold text-slate-900 block leading-snug">{task.name}</span>
                              <span className="text-[8px] text-slate-500 uppercase">{projectName}</span>
                            </div>
                            <div className="col-span-2 text-[9px] font-mono text-slate-700">
                              {task.startDate} → {task.endDate}
                            </div>
                            <div className="col-span-5 relative h-5 bg-slate-100 rounded-md border border-slate-200 overflow-hidden">
                              {task.type === 'jalon' ? (
                                <div
                                  className="w-3 h-3 bg-amber-500 rotate-45 absolute top-1"
                                  style={{ left: `calc(${leftPct}% - 4px)` }}
                                />
                              ) : (
                                <div
                                  className={`h-3 rounded ${barColor} absolute top-1`}
                                  style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                                />
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {renderPageFooter(currentPage)}
            </div>
          );
        })}

        {/* =========================================================
            PAGES SUIVANTES : TABLEAU 1 — PLANIFICATION MACRO
           ========================================================= */}
        {planChunks.map((chunk, cIdx) => {
          const currentPage = pagePlanStart + cIdx;
          return (
            <div key={`plan-page-${cIdx}`} className="a4-page flex flex-col justify-between">
              <div>
                {renderPageHeader(
                  `TABLEAU 1 : PLANIFICATION MACRO (${cIdx + 1}/${planChunks.length})`,
                  currentPage
                )}

                <div className="my-4">
                  <span className="text-[10px] font-black uppercase tracking-widest text-[#ea580c] block mb-1">
                    MATRICE PRÉVISIONNELLE OFFICIELLE
                  </span>
                  <h2 className="text-lg font-black text-slate-950 uppercase tracking-tight mb-4">
                    TABLEAU 1 — PLANIFICATION MACRO DES ACTIVITÉS & JALONS{' '}
                    {planChunks.length > 1 ? `(${cIdx + 1}/${planChunks.length})` : ''}
                  </h2>

                  <table className="w-full text-left border-collapse border border-slate-300 text-[10px]">
                    <thead>
                      <tr className="bg-[#c2410c] text-white uppercase text-[9px] font-black">
                        <th className="p-2 border border-slate-300 w-12">Code</th>
                        <th className="p-2 border border-slate-300 w-44">Activité / Jalon</th>
                        <th className="p-2 border border-slate-300">Responsable</th>
                        <th className="p-2 border border-slate-300">Budget ({currency})</th>
                        <th className="p-2 border border-slate-300">Mois</th>
                        <th className="p-2 border border-slate-300">Antécéd.</th>
                        <th className="p-2 border border-slate-300">Déb. Prév</th>
                        <th className="p-2 border border-slate-300">Fin Prév</th>
                        <th className="p-2 border border-slate-300">Durée</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {chunk.map(({ code, task, projectName, antCode }, idx) => {
                        const m = computeTaskMetrics(task, todayISO);
                        const monthLabel = task.startDate
                          ? new Date(task.startDate).toLocaleDateString('fr-FR', {
                              month: 'short',
                              year: 'numeric'
                            })
                          : '—';
                        return (
                          <tr key={task.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                            <td className="p-2 border border-slate-200 font-black text-[#c2410c]">{code}</td>
                            <td className="p-2 border border-slate-200 whitespace-normal break-words">
                              <span className="font-bold text-slate-900 block leading-snug">{task.name}</span>
                              <span className="text-[8px] text-slate-500 uppercase">{projectName}</span>
                            </td>
                            <td className="p-2 border border-slate-200 font-semibold text-slate-800">
                              {task.assignee || '—'}
                            </td>
                            <td className="p-2 border border-slate-200 font-bold text-slate-900 whitespace-nowrap">
                              {formatCurrencyValue(task.budget || 0, currency)}
                            </td>
                            <td className="p-2 border border-slate-200 uppercase text-slate-700">{monthLabel}</td>
                            <td className="p-2 border border-slate-200 font-bold text-slate-700">{antCode}</td>
                            <td className="p-2 border border-slate-200 font-mono text-slate-800 whitespace-nowrap">
                              {task.startDate}
                            </td>
                            <td className="p-2 border border-slate-200 font-mono text-slate-800 whitespace-nowrap">
                              {task.endDate}
                            </td>
                            <td className="p-2 border border-slate-200 font-black text-[#ea580c]">
                              {m.plannedDurationLabel}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {renderPageFooter(currentPage)}
            </div>
          );
        })}

        {/* =========================================================
            PAGES SUIVANTES : TABLEAU 2 — SUIVI DE L'EXÉCUTION & ÉCARTS
           ========================================================= */}
        {suiviChunks.map((chunk, cIdx) => {
          const currentPage = pageSuiviStart + cIdx;
          return (
            <div key={`suivi-page-${cIdx}`} className="a4-page flex flex-col justify-between">
              <div>
                {renderPageHeader(
                  `TABLEAU 2 : SUIVI & ÉCARTS (${cIdx + 1}/${suiviChunks.length})`,
                  currentPage
                )}

                <div className="my-4">
                  <span className="text-[10px] font-black uppercase tracking-widest text-[#ea580c] block mb-1">
                    CONTRÔLE OPÉRATIONNEL & ANALYSE DES RETARDS / AVANCES
                  </span>
                  <h2 className="text-lg font-black text-slate-950 uppercase tracking-tight mb-4">
                    TABLEAU 2 — SUIVI DE L’EXÉCUTION DES ACTIVITÉS & ÉCARTS{' '}
                    {suiviChunks.length > 1 ? `(${cIdx + 1}/${suiviChunks.length})` : ''}
                  </h2>

                  <table className="w-full text-left border-collapse border border-slate-300 text-[9.5px]">
                    <thead>
                      <tr className="bg-[#c2410c] text-white uppercase text-[8.5px] font-black">
                        <th className="p-2 border border-slate-300 w-11">Code</th>
                        <th className="p-2 border border-slate-300 w-40">Activité / Jalon</th>
                        <th className="p-2 border border-slate-300">Resp.</th>
                        <th className="p-2 border border-slate-300">Statut</th>
                        <th className="p-2 border border-slate-300">Déb. Prév</th>
                        <th className="p-2 border border-slate-300">Fin Prév</th>
                        <th className="p-2 border border-slate-300">Durée</th>
                        <th className="p-2 border border-slate-300">Déb. Exéc</th>
                        <th className="p-2 border border-slate-300">Fin Exéc</th>
                        <th className="p-2 border border-slate-300">Réel</th>
                        <th className="p-2 border border-slate-300">Écart Déb.</th>
                        <th className="p-2 border border-slate-300">Écart Fin</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {chunk.map(({ code, task, projectName }, idx) => {
                        const m = computeTaskMetrics(task, todayISO);
                        return (
                          <tr key={task.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                            <td className="p-2 border border-slate-200 font-black text-[#c2410c]">{code}</td>
                            <td className="p-2 border border-slate-200 whitespace-normal break-words">
                              <span className="font-bold text-slate-900 block leading-snug">{task.name}</span>
                              <span className="text-[8px] text-slate-500 uppercase">{projectName}</span>
                            </td>
                            <td className="p-2 border border-slate-200 font-semibold text-slate-800">
                              {task.assignee || '—'}
                            </td>
                            <td className="p-2 border border-slate-200 font-black">{m.effectiveStatus}</td>
                            <td className="p-2 border border-slate-200 font-mono whitespace-nowrap">
                              {task.startDate}
                            </td>
                            <td className="p-2 border border-slate-200 font-mono whitespace-nowrap">
                              {task.endDate}
                            </td>
                            <td className="p-2 border border-slate-200 font-bold">{m.plannedDurationLabel}</td>
                            <td className="p-2 border border-slate-200 font-mono whitespace-nowrap">
                              {task.actualStartDate || '—'}
                            </td>
                            <td className="p-2 border border-slate-200 font-mono whitespace-nowrap">
                              {task.actualEndDate || '—'}
                            </td>
                            <td className="p-2 border border-slate-200 font-bold">{m.realDurationLabel}</td>
                            <td
                              className={`p-2 border border-slate-200 font-black ${
                                m.ecartDebutDays > 0
                                  ? 'text-red-600'
                                  : m.ecartDebutDays < 0
                                  ? 'text-emerald-600'
                                  : 'text-slate-600'
                              }`}
                            >
                              {m.ecartDebutLabel}
                            </td>
                            <td
                              className={`p-2 border border-slate-200 font-black ${
                                m.ecartFinDays > 0
                                  ? 'text-red-600'
                                  : m.ecartFinDays < 0
                                  ? 'text-emerald-600'
                                  : 'text-slate-600'
                              }`}
                            >
                              {m.ecartFinLabel}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {renderPageFooter(currentPage)}
            </div>
          );
        })}

        {/* =========================================================
            DERNIÈRE(S) PAGE(S) : INTERPRÉTATION DYNAMIQUE DU RÉSEAU PERT
           ========================================================= */}
        {pertChunks.map((chunk, cIdx) => {
          const currentPage = pagePertStart + cIdx;
          return (
            <div key={`pert-page-${cIdx}`} className="a4-page flex flex-col justify-between">
              <div>
                {renderPageHeader(
                  `DIAGNOSTIC PERT & CHEMIN CRITIQUE (${cIdx + 1}/${pertChunks.length})`,
                  currentPage
                )}

                <div className="my-4 space-y-6">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-[#ea580c] block mb-1">
                      ALGORITHME D’ORDONNANCEMENT CPM (FORWARD / BACKWARD PASS)
                    </span>
                    <h2 className="text-lg font-black text-slate-950 uppercase tracking-tight">
                      INTERPRÉTATION DYNAMIQUE DU RÉSEAU PERT & CHEMIN CRITIQUE
                    </h2>
                  </div>

                  {chunk.map(res => (
                    <div
                      key={res.projectId}
                      className="p-5 rounded-2xl bg-slate-50 border-2 border-[#fdba74] space-y-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
                        <h3 className="text-sm font-black uppercase text-[#c2410c]">{res.projectName}</h3>
                        <span className="px-3 py-1 rounded-full bg-[#c2410c] text-[#fdba74] text-[10px] font-black uppercase">
                          Durée Incompressible : {res.projectDuration} jour(s) • {res.criticalPathNodes.length}{' '}
                          tâche(s) critique(s)
                        </span>
                      </div>

                      <div className="space-y-2.5 text-xs text-slate-800 leading-relaxed">
                        <div className="p-3 rounded-xl bg-white border border-slate-200">
                          <span className="font-black text-red-600 uppercase block text-[10px] mb-0.5">
                            1. Séquence du Chemin Critique (Marge Totale = 0j)
                          </span>
                          <p>{res.interpretation.criticalPathSummary}</p>
                        </div>

                        <div className="p-3 rounded-xl bg-white border border-slate-200">
                          <span className="font-black text-[#ea580c] uppercase block text-[10px] mb-0.5">
                            2. Réserve de Souplesse & Marges Positives
                          </span>
                          <p>{res.interpretation.slackSummary}</p>
                        </div>

                        <div className="p-3 rounded-xl bg-white border border-slate-200">
                          <span className="font-black text-amber-700 uppercase block text-[10px] mb-0.5">
                            3. Diagnostic des Risques & Recommandations de Pilotage
                          </span>
                          <p>{res.interpretation.riskAndSteeringSummary}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {renderPageFooter(currentPage)}
            </div>
          );
        })}
      </div>
    </div>
  );
};
