import React, { useEffect, useRef, useState } from 'react';
import {
  ShieldCheck,
  Calendar,
  Network,
  Kanban,
  FileCheck2,
  HardDrive,
  Save,
  Award,
  CheckSquare,
  GitBranch,
  User,
  Folder,
  FileText,
  Download,
  Upload,
  Printer,
  Users,
  FileSpreadsheet,
  Table2,
  Image as ImageIcon,
  CheckCircle2,
  Briefcase,
  BookOpen,
  GraduationCap,
  Building2,
  Stethoscope,
  HardHat,
  Cpu,
  Sprout,
  Landmark,
  Layers,
  Presentation,
  QrCode,
  Sparkles,
  Check,
  CreditCard,
  ArrowRight,
  TrendingUp,
  SlidersHorizontal,
  FileDown,
  Monitor,
  Smartphone,
  Tablet,
  RefreshCw,
  Share,
  PlusSquare,
  X
} from 'lucide-react';
import { AppLogo } from './AppLogo';
import { LanguageCode } from '../types';
import { translations } from '../i18n';

interface LandingPageProps {
  isDark: boolean;
  language: LanguageCode;
  lastJsonFileName: string;
  onOpenSlidebar: () => void;
  onNavigateTab: (tab: string) => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  isDark,
  language,
  lastJsonFileName,
  onOpenSlidebar,
  onNavigateTab
}) => {
  const isEn = language === 'EN';
  const t = translations[language];
  const containerRef = useRef<HTMLDivElement>(null);
  const bgVideoRef = useRef<HTMLVideoElement>(null);

  // Animation d'introduction de 5 secondes à l'atterrissage sur la plateforme :
  // - 0s à 3s : 'video_only' (l'animation vidéo plein écran démarre)
  // - 3s à 5s : 'logo_visible' (le nouveau logo apparaît à la 3e seconde dans l'animation)
  // - Dès la 5e seconde : 'completed' (la page d'accueil apparaît et la vidéo passe en arrière-plan)
  const [introPhase, setIntroPhase] = useState<'video_only' | 'logo_visible' | 'completed'>('video_only');

  useEffect(() => {
    if (bgVideoRef.current) {
      bgVideoRef.current.play().catch(() => {
        // Autoplay muted handled by browser
      });
    }
    const logoTimer = window.setTimeout(() => {
      setIntroPhase('logo_visible');
    }, 3000);
    const completeTimer = window.setTimeout(() => {
      setIntroPhase('completed');
    }, 5000);

    return () => {
      window.clearTimeout(logoTimer);
      window.clearTimeout(completeTimer);
    };
  }, []);

  // États PWA ("F-PLLAN") & Mise à jour sur la page d'accueil
  const [deferredPrompt, setDeferredPrompt] = useState<any>(() =>
    typeof window !== 'undefined' ? (window as any).__fpllanDeferredPrompt || null : null
  );
  const [activeInstallHelper, setActiveInstallHelper] = useState<
    'apple' | 'desktop' | 'android' | null
  >(null);
  const [isUpdatingApp, setIsUpdatingApp] = useState<boolean>(false);
  const [pwaNotice, setPwaNotice] = useState<string | null>(null);

  useEffect(() => {
    const syncPrompt = () => {
      setDeferredPrompt((window as any).__fpllanDeferredPrompt || null);
    };
    const onInstalled = () => {
      setDeferredPrompt(null);
      setPwaNotice(
        isEn
          ? '✓ Application "F-PLLAN" successfully installed on your device!'
          : '✓ L’application « F-PLLAN » a été installée avec succès sur votre appareil !'
      );
    };
    window.addEventListener('beforeinstallprompt', syncPrompt);
    window.addEventListener('fpllan-pwa-installable', syncPrompt);
    window.addEventListener('fpllan-pwa-installed', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', syncPrompt);
      window.removeEventListener('fpllan-pwa-installable', syncPrompt);
      window.removeEventListener('fpllan-pwa-installed', onInstalled);
    };
  }, [isEn]);

  const handleInstallPwaPlatform = async (platform: 'desktop' | 'android' | 'apple') => {
    if (platform === 'apple') {
      setActiveInstallHelper(prev => (prev === 'apple' ? null : 'apple'));
      return;
    }
    const promptEvent = deferredPrompt || (window as any).__fpllanDeferredPrompt;
    if (promptEvent && typeof promptEvent.prompt === 'function') {
      try {
        await promptEvent.prompt();
        const choice = await promptEvent.userChoice;
        if (choice && choice.outcome === 'accepted') {
          (window as any).__fpllanDeferredPrompt = null;
          setDeferredPrompt(null);
          setActiveInstallHelper(null);
          setPwaNotice(
            isEn
              ? '✓ Installation of "F-PLLAN" launched!'
              : '✓ Téléchargement et installation de « F-PLLAN » lancés !'
          );
          return;
        }
      } catch {
        // fall through to helper explanation
      }
    }
    setActiveInstallHelper(prev => (prev === platform ? null : platform));
  };

  const handleReloadAndUpdateApp = async () => {
    setIsUpdatingApp(true);
    setPwaNotice(
      isEn
        ? 'Updating and reloading F-PLLAN...'
        : 'Mise à jour et rechargement de l’application F-PLLAN en cours...'
    );
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(
          regs.map(async reg => {
            try {
              reg.active?.postMessage({ type: 'CLEAR_AND_UPDATE' });
              reg.waiting?.postMessage({ type: 'SKIP_WAITING' });
              await reg.update();
            } catch {
              // ignore
            }
          })
        );
      }
      if ('caches' in window) {
        const keys = await window.caches.keys();
        await Promise.all(keys.map(k => window.caches.delete(k)));
      }
    } catch {
      // ignore
    }
    setTimeout(() => {
      window.location.reload();
    }, 350);
  };

  // Bidirectional Scroll Reveal (triggers both when scrolling down AND when scrolling up, with direction awareness)
  useEffect(() => {
    const rootEl = containerRef.current;
    if (!rootEl) return;

    let lastScrollY = window.scrollY || window.pageYOffset;
    rootEl.setAttribute('data-scroll-dir', 'down');

    const handleScrollDirection = () => {
      const currentScrollY = window.scrollY || window.pageYOffset;
      const dir = currentScrollY >= lastScrollY ? 'down' : 'up';
      rootEl.setAttribute('data-scroll-dir', dir);
      lastScrollY = currentScrollY;
    };

    window.addEventListener('scroll', handleScrollDirection, { passive: true });

    const elements = rootEl.querySelectorAll(
      '.scroll-reveal-left, .scroll-reveal-right, .scroll-reveal-up'
    );

    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-revealed');
          } else {
            entry.target.classList.remove('is-revealed');
          }
        });
      },
      {
        threshold: 0.05,
        rootMargin: '-35px 0px -35px 0px'
      }
    );

    elements.forEach(el => observer.observe(el));

    return () => {
      window.removeEventListener('scroll', handleScrollDirection);
      observer.disconnect();
    };
  }, [language]);

  const appModules = isEn
    ? [
        {
          step: '01',
          id: 'profil',
          title: 'User Profile & Identity',
          desc: 'Enter your professional details once (Full Name, Role, Organization, Email, Phone). They are automatically injected into all your portfolios, your Technical Sheet, and your 15 PDF documents.',
          icon: User,
          direction: 'left'
        },
        {
          step: '02',
          id: 'projects',
          title: 'Strategic Portfolios, Axes & Projects',
          desc: 'Create multi-year portfolios, structure your Strategic Axes, and add Operational Projects across any sector (company, public administration, NGO, consulting firm).',
          icon: Folder,
          direction: 'right'
        },
        {
          step: '03',
          id: 'planification',
          title: 'Macro-Planning of Activities & Milestones',
          desc: 'Enter in a unified table per project and phase the code (Task/Milestone), title, responsible lead, budget, logical predecessor, and planned dates (Planned Start, Planned End). Month and duration are calculated automatically.',
          icon: Calendar,
          direction: 'left'
        },
        {
          step: '04',
          id: 'processus',
          title: 'Task Tracking & Automated Variance Calculation',
          desc: 'Track real execution day by day: status evolves automatically based on today’s date, only the "Blocked" status is manually toggleable, and start/finish variances are computed instantaneously.',
          icon: CheckSquare,
          direction: 'right'
        },
        {
          step: '05',
          id: 'raci',
          title: 'RACI Responsibility Matrix',
          desc: 'Clearly assign roles on every activity and milestone: Responsible (R, synchronized with the Lead), Accountable Authority (A), Consulted (C), and Informed (I).',
          icon: Users,
          direction: 'left'
        },
        {
          step: '06',
          id: 'gantt',
          title: 'Multi-Scale Gantt Chart & WBS Tree',
          desc: 'Visualize timelines by Day, Week, Month, Quarter, Semester, or Year with Project Phases, Responsible Lead filter, sticky Code/Activity columns on the left, and an interactive WBS tree.',
          icon: GitBranch,
          direction: 'right'
        },
        {
          step: '07',
          id: 'pert',
          title: 'PERT Network & Critical Path (CPM)',
          desc: 'Switch between the Predecessor/Successor matrix and the PERT graph zoomable down to 10% with dynamic interpretation of free/total floats and critical path risks.',
          icon: Network,
          direction: 'left'
        },
        {
          step: '08',
          id: 'kanban',
          title: 'Auto-Recalculated Interactive Kanban Board',
          desc: 'Move tasks from one status column to another based on real execution: planned dates recalculate automatically while preserving duration and dependency logic.',
          icon: Kanban,
          direction: 'right'
        },
        {
          step: '09',
          id: 'fiche',
          title: 'Multi-Page A4 Technical Sheet & Executive Summary',
          desc: 'Edit and download the multi-page A4 Technical Sheet (Cover page, Table of contents, Acronyms, Executive synthesis & charts, Gantt, Tables 1 & 2, PERT Network) on pure white background.',
          icon: FileText,
          direction: 'left'
        },
        {
          step: '10',
          id: 'docgen',
          title: '22-Document Generator (15 A4 + 7 Slides 16:9) & 10 Master Matrices',
          desc: 'Generate 22 complete institutional documents and presentations (ToR, ProDoc, M&E Reports, OECD/DAC Grid, Letters, CVs, Minutes, plus 7 Landscape 16:9 Slide Decks) synchronized 100% with your data and 10 master matrices.',
          icon: FileSpreadsheet,
          direction: 'right'
        },
        {
          step: '11',
          id: 'categorie',
          title: 'Actor Categories & Internal Profiles (CVs, Cards & Badges)',
          desc: 'Strict 5-Category classification (1. Beneficiaries, 2. Internal, 3. External, 4. Contractor, 5. Financial Partner) synchronized with RACI, per-axis authorizations, and instant generation for internal actors of 2 CV models (1-page Executive & 2-4 page Detailed), Business Cards, and secured 54×86mm Badges with vCard QR Code and CODE-128 Barcode.',
          icon: Layers,
          direction: 'left'
        }
      ]
    : [
        {
          step: '01',
          id: 'profil',
          title: 'Profil Utilisateur & Identité',
          desc: 'Renseignez une seule fois vos coordonnées professionnelles (Nom, Fonction, Organisation, Email, Téléphone). Elles sont automatiquement injectées dans tous vos dossiers, votre Fiche Technique et vos 15 documents PDF.',
          icon: User,
          direction: 'left'
        },
        {
          step: '02',
          id: 'projects',
          title: 'Dossiers Stratégiques, Axes & Projets',
          desc: 'Créez vos portefeuilles multi-annuels, structurez vos Axes Stratégiques et ajoutez vos Projets Opérationnels quel que soit votre secteur d’activité (entreprise, administration, ONG, cabinet).',
          icon: Folder,
          direction: 'right'
        },
        {
          step: '03',
          id: 'planification',
          title: 'Planification Macro des Activités & Jalons',
          desc: 'Saisissez dans un tableau unique par projet et phase le code (Tâche/Jalon), l’intitulé, le responsable, le budget, l’antécédent logique et les dates prévues (Déb. Prév, Fin Prév). Le mois et la durée se calculent automatiquement.',
          icon: Calendar,
          direction: 'left'
        },
        {
          step: '04',
          id: 'processus',
          title: 'Suivi des Tâches & Calcul Automatisé des Écarts',
          desc: 'Suivez l’exécution réelle au jour le jour : le statut évolue automatiquement selon la date d’aujourd’hui, seul le statut « Bloqué » est commutable manuellement, et les écarts de début et de fin sont calculés instantanément.',
          icon: CheckSquare,
          direction: 'right'
        },
        {
          step: '05',
          id: 'raci',
          title: 'Matrice des Responsabilités RACI',
          desc: 'Définissez clairement les rôles sur chaque activité et jalon : Réalisateur (R, synchronisé avec le Responsable), Autorité d’approbation (A), Consulté (C) et Informé (I).',
          icon: Users,
          direction: 'left'
        },
        {
          step: '06',
          id: 'gantt',
          title: 'Diagramme de Gantt Multi-Échelles & Arbre WBS',
          desc: 'Visualisez l’évolution temporelle par Jours, Semaine, Mois, Trimestre, Semestre ou Année avec les Phases de Projet, filtre par Responsable, colonnes Code/Activité figées à gauche et organigramme WBS interactif.',
          icon: GitBranch,
          direction: 'right'
        },
        {
          step: '07',
          id: 'pert',
          title: 'Réseau PERT & Chemin Critique (CPM)',
          desc: 'Basculez entre la matrice des Antécédents/Précédents et le graphe PERT dézoomable jusqu’à 10% avec interprétation dynamique des marges libres/totales et des risques sur le chemin critique.',
          icon: Network,
          direction: 'left'
        },
        {
          step: '08',
          id: 'kanban',
          title: 'Tableau Kanban Interactif Auto-Recalculé',
          desc: 'Déplacez vos tâches d’une colonne de statut à une autre selon l’exécution réelle : les dates prévues se recalculent automatiquement en conservant la durée et la logique des dépendances.',
          icon: Kanban,
          direction: 'right'
        },
        {
          step: '09',
          id: 'fiche',
          title: 'Fiche Technique & Résumé Exécutif Multi-Pages A4',
          desc: 'Éditez et téléchargez la Fiche Technique multi-pages A4 (Page de garde, Sommaire, Acronymes, Synthèse & Graphiques, Gantt, Tableaux 1 & 2, Réseau PERT) sur fond blanc pur.',
          icon: FileText,
          direction: 'left'
        },
        {
          step: '10',
          id: 'docgen',
          title: 'Générateur de 22 Documents (15 A4 + 7 Slides 16:9) & 10 Matrices',
          desc: 'Générez 22 documents institutionnels et présentations complets (TDR, ProDoc, Rapports S&E, Grille OCDE/CAD, Courrier, CVs avec photo, PV de réunion, plus 7 Présentations Slides 16:9 Paysage) synchronisés à 100% avec vos données et vos 10 matrices.',
          icon: FileSpreadsheet,
          direction: 'right'
        },
        {
          step: '11',
          id: 'categorie',
          title: 'Catégories d’Acteurs & Fiches Internes (CVs, Cartes & Badges)',
          desc: 'Classification stricte en 5 Catégories (1. Bénéficiaires, 2. Interne, 3. Externe, 4. Prestataire, 5. Partenaire Financier) synchronisée à 100% avec le RACI, habilitations par Axe/Projet, et génération instantanée pour les acteurs internes de 2 modèles de CVs (Exécutif 1 page & Détaillé 2-4 pages), Cartes de Visite et Badges sécurisés 54×86mm avec QR Code vCard et Code-Barres CODE-128.',
          icon: Layers,
          direction: 'left'
        }
      ];

  const institutionalDocuments = isEn
    ? [
        {
          num: '01',
          title: 'Official Terms of Reference (ToR)',
          category: 'Category B · 5 A4 Pages (With Cover Page)',
          standards: 'UNDP, World Bank, AfDB, EU & ISO 21500 Standards',
          desc: 'Comprehensive scoping of a study, audit, or technical assistance mission: strategic context, SMART objectives, expected outputs & deliverables, key expert profiles, technical/financial evaluation grid (70/30), RACI governance, and detailed budget.'
        },
        {
          num: '02',
          title: 'Mission Letter & Operational Mandate',
          category: 'Category B · 2 A4 Pages (With Cover Page)',
          standards: 'International PMO, PMBOK® 7 & RBM Standards',
          desc: 'Official charter assigning responsibility for a project or portfolio to a Project Manager / Lead Officer: mandate scope, physical & financial performance targets, decision-making authority, allocated resources, Steering Committee accountability, and priority roadmap.'
        },
        {
          num: '03',
          title: 'Scoping Report & Project Document (ProDoc)',
          category: 'Category C · 10 A4 Pages (With Cover Page)',
          standards: 'UNDP ProDoc, World Bank, UNEG & OECD/DAC Frameworks',
          desc: 'Reference baseline project document: initial diagnosis, Theory of Change (ToC), RBM results chain (Impacts, Outcomes, Outputs), baseline vs actual scope, WBS/AWPB breakdown, RACI matrix, logical framework, and RAID risk register.'
        },
        {
          num: '04',
          title: 'Operational Inception Report',
          category: 'Category C · 10 A4 Pages (With Cover Page)',
          standards: 'UNEG Guidelines, EuropeAid (EU), AfDB & PMBOK® 7',
          desc: 'Kick-off deliverable validating the completion of the mobilization phase: team deployment status, desk review findings, validation of data collection & sampling tools, updated PERT/CPM schedule, and initial risk mitigation plan.'
        },
        {
          num: '05',
          title: 'CAP Report (Findings, Analysis, Prescriptions)',
          category: 'Category C · 10 A4 Pages (With Cover Page)',
          standards: 'RBM Performance Audit, Management Control & PMBOK® 7',
          desc: 'Periodic progress and audit report structured into three pillars: Factual Findings on physical and schedule execution, Root-Cause Analysis of start/finish variances and critical path bottlenecks, and operational catch-up Prescriptions.'
        },
        {
          num: '06',
          title: 'Institutional Evaluation Grid (OECD/DAC & UNEG Matrix)',
          category: 'Category B · 5 A4 Pages (With Cover Page)',
          standards: 'UNEG Norms, OECD/DAC Network (6 Criteria) & UNICEF GEROS',
          desc: 'Methodological evaluation instrument breaking down the 6 OECD/DAC criteria (Relevance, Coherence, Effectiveness, Efficiency, Impact, Sustainability) into evaluative questions, sub-questions, SMART indicators, verification sources, 3-level triangulation, and 1–5 scoring scale.'
        },
        {
          num: '07',
          title: 'Mid-Term Evaluation Report (Mid-Term Review)',
          category: 'Category C · 10 A4 Pages (With Cover Page)',
          standards: 'OECD/DAC Criteria, UNEG, UNDP, UNICEF & World Bank Norms',
          desc: 'In-depth mid-stage review measuring progress toward expected outputs and outcomes, budget efficiency (cost-effectiveness & disbursement pace), partnership governance, structural constraints, and reorientation action plan for the second half.'
        },
        {
          num: '08',
          title: 'Final Evaluation & Completion Report (ICR / Terminal Evaluation)',
          category: 'Category C · 10 A4 Pages (With Cover Page)',
          standards: 'Implementation Completion Report (WB), Terminal Evaluation (UNDP/UNEG)',
          desc: 'Summative completion assessment: final evaluation across the 6 OECD/DAC criteria, final budget return, long-term impact and sustainability analysis, asset handover & ownership transfer, operational discharge, and lessons learned capitalization.'
        },
        {
          num: '09',
          title: 'Methodological Note & Monitoring-Evaluation (M&E) Protocol',
          category: 'Category B · 5 A4 Pages (With Cover Page)',
          standards: 'ISO 21500:2021, PMBOK® 7, UNDP RBM & UNEG Guides',
          desc: 'Technical project engineering framework explaining the 5 standardized phases, the mathematical PERT/CPM network model (early/late dates ES/EF/LS/LF and float calculation), data quality control workflow, and hybrid IndexedDB/JSON persistence protocol.'
        },
        {
          num: '10',
          title: 'Institutional Non-Disclosure & Confidentiality Agreement (NDA)',
          category: 'Category B · 3 A4 Pages (With Cover Page)',
          standards: 'International Contract Law, ISO/IEC 27001 & Data Protection',
          desc: 'Legal contract protecting all sensitive portfolio information (budgets, JSON files, deliverables, databases, and intellectual property) with security clauses, confidentiality obligations, penalties, and end-of-mission return protocol.'
        },
        {
          num: '11',
          title: 'Classic Administrative Letter (Strict 1 Page)',
          category: 'Category A · Strict 1 A4 Page (Without Cover Page)',
          standards: 'International Administrative Drafting Standards & PMO Protocol',
          desc: 'Standardized official correspondence fitting on a single A4 page: dual-logo header stamp, registration number, place and date, recipient block, subject line, 3-paragraph structured body (integrating progress and budget data), salutation, attachments, copies, and signature.'
        },
        {
          num: '12',
          title: 'Executive Project Manager / Expert CV (With Photo)',
          category: 'Category D · Strict 1 A4 Page (Without Cover Page · 3.5×4.5 cm Photo)',
          standards: 'International HR & Executive Consulting Standards (PMP® / ISO 21500 / RBM)',
          desc: 'High-readability 1-page executive Curriculum Vitae with professional ID photo slot (3.5 × 4.5 cm), executive pitch, core areas of expertise, quantified flagship achievements (budgets & donors), degrees, international certifications, and mastered software.'
        },
        {
          num: '13',
          title: 'Detailed Professional CV / Donor Tender Format (With Photo)',
          category: 'Category D · 2 to 4 A4 Pages (Without Cover Page · Photo & Signature)',
          standards: 'World Bank (Form TECH-6), AfDB, EuropeAid (EU) & UN (P11) Formats',
          desc: 'Comprehensive Curriculum Vitae for international tender submissions: ID photo, civil status & proposed position, in-depth qualification summary, academic background, country/donor experience, detailed mission history, CEFR language matrix, 3 references, and signed certification.'
        },
        {
          num: '14',
          title: 'Official Meeting Minutes & Decision Record',
          category: 'Category D · 1 to 2 A4 Pages (Without Cover Page)',
          standards: 'Steering Committee (COPIL) / Technical Committee & ISO 21500 Governance',
          desc: 'Official governance minutes (Steering Committee, technical meeting, kick-off, or arbitration) including dual-logo header banner, session identification box, synchronized attendance sheet (Matrix M4), agenda, summary of discussions, firm decisions, action matrix (M10/M7), and co-signature block.'
        },
        {
          num: '15',
          title: 'Simplified Operational Terms of Reference (ToR) with Tables',
          category: 'Category D · 1 to 3 A4 Pages (Without Cover Page)',
          standards: 'Operational AWPB Execution, RBM & Donor Procurement Procedures',
          desc: 'Agile operational scoping to rapidly launch an AWPB activity or short-term consultancy: synoptic identification card, direct justification, operational objectives, task & deliverable matrix (M2/M9), 100-point evaluation grid (M3), payment schedule, and estimated budget (M5).'
        },
        {
          num: '16',
          title: 'Program Presentation (ToR Slide Deck)',
          category: 'Presentation Slide Deck · 10 to 12 Landscape Slides 16:9',
          standards: 'UNDP, World Bank, AfDB, EU Standards & ISO 21500',
          desc: 'Comprehensive executive program pitch: strategic context, rationale, SMART objectives, axes & components, RACI matrix, total budget, milestone schedule, and expected results.'
        },
        {
          num: '17',
          title: 'Scoping Report Presentation (ProDoc Slide Deck)',
          category: 'Presentation Slide Deck · 10 to 12 Landscape Slides 16:9',
          standards: 'ProDoc, UNEG Standards & Theory of Change',
          desc: 'Methodological and strategic baseline: in-depth diagnosis, Theory of Change (ToC), RBM results chain, WBS scope, RAID risk register, and decision-making governance.'
        },
        {
          num: '18',
          title: 'Inception Report Presentation (Kick-Off Slide Deck)',
          category: 'Presentation Slide Deck · 10 to 12 Landscape Slides 16:9',
          standards: 'Kick-Off, UNEG & EuropeAid Standards',
          desc: 'Preparatory phase validation: team mobilization status, validated data collection tools, updated PERT/CPM schedule, baseline adjustments, and operational launch.'
        },
        {
          num: '19',
          title: 'AWPB Presentation (Annual Work Plan & Budget Slide Deck)',
          category: 'Presentation Slide Deck · 12 to 15 Landscape Slides 16:9',
          standards: 'Budget Management & Public Expenditure Norms',
          desc: 'Annual contractual roadmap: physical activity scheduling, budget allocation across axes and projects, disbursement milestones, RACI matrix, and consolidated yearly targets.'
        },
        {
          num: '20',
          title: 'QWP Presentation (Quarterly Work Plan Slide Deck)',
          category: 'Presentation Slide Deck · 8 to 10 Landscape Slides 16:9',
          standards: 'Proximity Operational Steering (90-Day Horizon)',
          desc: 'Agile short-term steering tool: quarterly targets (Q1–Q4), critical path priority tasks, weekly resource allocation, and 90-day deliverable matrices.'
        },
        {
          num: '21',
          title: 'Mid-Term Evaluation Presentation Slide Deck',
          category: 'Presentation Slide Deck · 12 to 15 Landscape Slides 16:9',
          standards: 'Mid-Term Review OECD/DAC & UNEG Norms',
          desc: 'Mid-term assessment for Steering Committees and donors: physical vs financial completion rates, early outcomes, bottleneck analysis, and corrective realignment prescriptions.'
        },
        {
          num: '22',
          title: 'Final Evaluation & Program Closure Presentation Slide Deck',
          category: 'Presentation Slide Deck · 15 to 18 Landscape Slides 16:9',
          standards: 'Terminal Evaluation & Capitalization OECD/DAC',
          desc: 'Summative completion debrief: definitive performance across the 6 OECD/DAC criteria, final budget efficiency, sustainability of outcomes, discharge, and lessons learned.'
        }
      ]
    : [
        {
          num: '01',
          title: 'Termes de Référence Officiels (TDR)',
          category: 'Catégorie B · 5 Pages A4 (Avec Page de Garde)',
          standards: 'Standards PNUD, Banque Mondiale, BAD, UE & ISO 21500',
          desc: 'Cadrage complet d’une mission d’étude, d’audit ou d’assistance technique : contexte stratégique, objectifs SMART, résultats et livrables attendus, profils des experts clés, grille d’évaluation technique/financière (70/30), gouvernance RACI et budget prévisionnel détaillé.'
        },
        {
          num: '02',
          title: 'Lettre de Mission & Mandat Opérationnel',
          category: 'Catégorie B · 2 Pages A4 (Avec Page de Garde)',
          standards: 'Standards Internationaux PMO, PMBOK® 7 & GAR',
          desc: 'Acte officiel d’investiture confiant la responsabilité d’un projet ou portefeuille à un Chef de Projet / Mandataire : périmètre du mandat, cibles de performance physique et budgétaire, prérogatives décisionnelles, moyens alloués, redevabilité COPIL et feuille de route prioritaire.'
        },
        {
          num: '03',
          title: 'Rapport de Cadrage & Cahier des Charges (ProDoc)',
          category: 'Catégorie C · 10 Pages A4 (Avec Page de Garde)',
          standards: 'Référentiels ProDoc PNUD, Banque Mondiale, UNEG & OCDE/CAD',
          desc: 'Document de projet de référence (Baseline) : diagnostic initial, Théorie du Changement (TdC), chaîne de résultats GAR (Impacts, Effets, Extrants), périmètre théorique vs réel, découpage WBS/PTBA, matrice RACI, cadre logique et gestion des risques (Board RAID).'
        },
        {
          num: '04',
          title: 'Rapport de Démarrage Opérationnel (Inception Report)',
          category: 'Catégorie C · 10 Pages A4 (Avec Page de Garde)',
          standards: 'Lignes Directrices UNEG, EuropeAid (UE), BAD & PMBOK® 7',
          desc: 'Livrable de lancement (Kick-Off) validant la fin de la phase de mobilisation : bilan de déploiement des équipes, enseignements de la revue documentaire, validation des outils de collecte et d’échantillonnage, calendrier PERT/CPM actualisé et plan de maîtrise des risques initiaux.'
        },
        {
          num: '05',
          title: 'Rapport CAP (Constatations, Analyses, Prescriptions)',
          category: 'Catégorie C · 10 Pages A4 (Avec Page de Garde)',
          standards: 'Audit de Performance GAR, Contrôle de Gestion & PMBOK® 7',
          desc: 'Rapport d’avancement et d’audit périodique structuré en trois volets : Constatations factuelles sur l’exécution physique et calendaire, Analyse causale des écarts (début/fin) et des goulots d’étranglement sur le chemin critique, et Prescriptions opérationnelles de rattrapage.'
        },
        {
          num: '06',
          title: 'Grille d’Évaluation Institutionnelle (Matrice OCDE/CAD & UNEG)',
          category: 'Catégorie B · 5 Pages A4 (Avec Page de Garde)',
          standards: 'Normes UNEG, Réseau OCDE/CAD (6 critères) & UNICEF GEROS',
          desc: 'Instrument méthodologique d’évaluation déclinant les 6 critères OCDE/CAD (Pertinence, Cohérence, Efficacité, Efficience, Impact, Durabilité) en questions évaluatives, sous-questions, indicateurs SMART, sources de vérification, triangulation à 3 niveaux et barème de notation de 1 à 5.'
        },
        {
          num: '07',
          title: 'Rapport d’Évaluation à Mi-Parcours (Mid-Term Review)',
          category: 'Catégorie C · 10 Pages A4 (Avec Page de Garde)',
          standards: 'Critères OCDE/CAD, Normes UNEG, PNUD, UNICEF & Banque Mondiale',
          desc: 'Revue approfondie à mi-étape mesurant la progression vers les extrants et effets attendus, l’efficience budgétaire (coût-efficacité et rythme de décaissement), la gouvernance partenariale, les contraintes structurelles et le plan d’action de réorientation pour la seconde moitié du projet.'
        },
        {
          num: '08',
          title: 'Rapport d’Évaluation Finale & Clôture (ICR / Terminal Evaluation)',
          category: 'Catégorie C · 10 Pages A4 (Avec Page de Garde)',
          standards: 'Implementation Completion Report (BM), Terminal Evaluation (PNUD/UNEG)',
          desc: 'Bilan sommatif d’achèvement : évaluation définitive selon les 6 critères OCDE/CAD, rendement budgétaire final, analyse des impacts à long terme et de la durabilité, passation des acquis et transfert de patrimoine, quitus opérationnel et capitalisation des leçons apprises.'
        },
        {
          num: '09',
          title: 'Note Méthodologique & Protocole de Suivi-Évaluation (S&E)',
          category: 'Catégorie B · 5 Pages A4 (Avec Page de Garde)',
          standards: 'Normes ISO 21500:2021, PMBOK® 7, Guides GAR PNUD & UNEG',
          desc: 'Dispositif technique d’ingénierie de projet expliquant l’architecture en 5 phases normées, le modèle mathématique du réseau PERT/CPM (calcul des dates au plus tôt/tard ES/EF/LS/LF et marges), le circuit de contrôle qualité des données et le protocole de sauvegarde hybride IndexedDB/JSON.'
        },
        {
          num: '10',
          title: 'Accord Institutionnel de Confidentialité & Non-Divulgation (NDA)',
          category: 'Catégorie B · 3 Pages A4 (Avec Page de Garde)',
          standards: 'Droit des Contrats Internationaux, ISO/IEC 27001 & Protection des Données',
          desc: 'Contrat juridique protégeant l’ensemble des informations sensibles du portefeuille (budgets, fichiers JSON, livrables, bases de données et propriété intellectuelle) avec clauses de sécurité, obligations de réserve, pénalités et protocole de restitution en fin de mission.'
        },
        {
          num: '11',
          title: 'Courrier Administratif Classique (1 Page Stricte)',
          category: 'Catégorie A · 1 Page A4 Stricte (Sans Page de Garde)',
          standards: 'Normes de Rédaction Administrative Internationale & Protocole PMO',
          desc: 'Correspondance officielle normée tenant sur une seule page A4 : timbre d’en-tête avec logos, numéro d’enregistrement, lieu et date, bloc destinataire, objet, corps structuré en 3 paragraphes argumentés (intégrant les données d’avancement et budget), formule de politesse, pièces jointes, ampliations et signature.'
        },
        {
          num: '12',
          title: 'CV Professionnel Exécutif Chef de Projet / Expert (Avec Photo)',
          category: 'Catégorie D · 1 Page A4 Stricte (Sans Page de Garde · Photo 3,5×4,5 cm)',
          standards: 'Standards Internationaux RH & Consulting Exécutif (PMP® / ISO 21500 / GAR)',
          desc: 'Curriculum Vitae synthétique haute lisibilité sur 1 page stricte avec emplacement photo d’identité professionnelle (3,5 × 4,5 cm), pitch exécutif, domaines d’expertise clés, expériences phares chiffrées (budgets et bailleurs), diplômes, certifications internationales et logiciels maîtrisés.'
        },
        {
          num: '13',
          title: 'CV Professionnel Détaillé / Appel d’Offres Bailleurs (Avec Photo)',
          category: 'Catégorie D · 2 à 4 Pages A4 (Sans Page de Garde · Photo & Signature)',
          standards: 'Formats Banque Mondiale (Form TECH-6), BAD, EuropeAid (UE) & ONU (P11)',
          desc: 'Curriculum Vitae complet pour soumissions aux appels d’offres internationaux : photo d’identité, état civil et poste proposé, synthèse approfondie des qualifications, cursus académique, expériences par pays et bailleurs, historique détaillé des missions, matrice linguistique CECRL, 3 personnes de référence et attestation de sincérité signée.'
        },
        {
          num: '14',
          title: 'Procès-Verbal (PV) Officiel de Réunion & Relevé de Décisions',
          category: 'Catégorie D · 1 à 2 Pages A4 (Sans Page de Garde)',
          standards: 'Standards de Gouvernance COPIL / Comité Technique & ISO 21500',
          desc: 'Compte-rendu officiel d’instance (COPIL, réunion technique, démarrage ou arbitrage) comprenant le bandeau d’en-tête à double logo, la fiche signalétique de séance, la feuille de présence synchronisée (Matrice M4), l’ordre du jour, le résumé des débats, les décisions fermes, la matrice d’actions (M10/M7) et le bloc de co-signature (Président de séance & Rapporteur).'
        },
        {
          num: '15',
          title: 'Termes de Référence (TDR) Simplifiés Opérationnels avec Tableaux',
          category: 'Catégorie D · 1 à 3 Pages A4 (Sans Page de Garde)',
          standards: 'Normes Opérationnelles d’Exécution PTBA, GAR & Procédures Bailleurs',
          desc: 'Cadrage opérationnel agile pour lancer rapidement une activité du PTBA ou une consultation courte : fiche synoptique d’identification, justification directe, objectifs opérationnels, matrice des tâches et livrables (M2/M9), grille d’évaluation sur 100 points (M3), échéancier de paiement et budget estimatif (M5).'
        },
        {
          num: '16',
          title: 'Présentation du Programme (TDR)',
          category: 'Présentation Slides · 10 à 12 Slides 16:9 Paysage',
          standards: 'Standard Bailleurs (PNUD, BM, BAD, UE) & ISO 21500',
          desc: 'Restitution exécutive complète du programme : contexte stratégique, justification, objectifs SMART, axes & composantes, matrice RACI, budget global, calendrier jalons et résultats attendus.'
        },
        {
          num: '17',
          title: 'Présentation du Rapport de Cadrage',
          category: 'Présentation Slides · 10 à 12 Slides 16:9 Paysage',
          standards: 'Standards ProDoc, UNEG & Théorie du Changement',
          desc: 'Cadrage méthodologique et stratégique : diagnostic approfondi, Théorie du Changement (TdC), chaîne d’effets GAR, périmètre WBS, registre des risques RAID et gouvernance décisionnelle.'
        },
        {
          num: '18',
          title: 'Présentation du Rapport de Démarrage (Inception)',
          category: 'Présentation Slides · 10 à 12 Slides 16:9 Paysage',
          standards: 'Standards Kick-Off, UNEG & EuropeAid',
          desc: 'Bilan de la phase préparatoire : déploiement effectif des experts, outils de collecte validés, calendrier PERT/CPM révisé, ajustements de baseline et lancement opérationnel.'
        },
        {
          num: '19',
          title: 'Présentation du PTBA (Plan de Travail & Budget Annuel)',
          category: 'Présentation Slides · 12 à 15 Slides 16:9 Paysage',
          standards: 'Normes de Gestion Budgétaire & Dépense Publique',
          desc: 'Feuille de route contractuelle annuelle : programmation physique des activités, ventilation budgétaire par axe et projet, jalons de décaissement, matrice RACI et cibles annuelles consolidées.'
        },
        {
          num: '20',
          title: 'Présentation du PTT (Plan de Travail Trimestriel)',
          category: 'Présentation Slides · 8 à 10 Slides 16:9 Paysage',
          standards: 'Pilotage Opérationnel de Proximité (Horizon 90 jours)',
          desc: 'Outil de conduite agile à court terme : objectifs trimestriels Q1/Q2/Q3/Q4, tâches prioritaires sur le chemin critique, allocation hebdomadaire des ressources et matrice des livrables à 90 jours.'
        },
        {
          num: '21',
          title: 'Présentation de l’Évaluation à Mi-Parcours',
          category: 'Présentation Slides · 12 à 15 Slides 16:9 Paysage',
          standards: 'Revue à Mi-Étape OCDE/CAD & UNEG',
          desc: 'Bilan de mi-parcours pour le COPIL et bailleurs : taux d’exécution physique vs financière, mesure des effets préliminaires, goulots d’étranglement et prescriptions de réorientation.'
        },
        {
          num: '22',
          title: 'Présentation de l’Évaluation Finale & Clôture',
          category: 'Présentation Slides · 15 à 18 Slides 16:9 Paysage',
          standards: 'Terminal Evaluation & Capitalisation OCDE/CAD',
          desc: 'Restitution sommative d’achèvement : performance définitive sur les 6 critères OCDE/CAD, efficience budgétaire finale, durabilité des acquis, quitus d’exécution et leçons apprises.'
        }
      ];

  const masterMatricesList = isEn
    ? [
        { code: 'M1', name: 'Results Framework Matrix (RBM) & SMART Indicators' },
        { code: 'M2', name: 'Operational Planning Matrix WBS, AWPB & Critical Path' },
        { code: 'M3', name: 'Technical & Financial Bid Evaluation Grid (70/30 or 100 pts)' },
        { code: 'M4', name: 'Stakeholder Mapping & Official Attendance Sheet' },
        { code: 'M5', name: 'Budget Matrix by Deliverable, Category & Disbursement Schedule' },
        { code: 'M6', name: 'RACI Responsibility Assignment Matrix (R-A-C-I)' },
        { code: 'M7', name: 'Master Register of Risks, Assumptions, Issues & Dependencies (RAID)' },
        { code: 'M8', name: 'Normative Evaluation Matrix across the 6 OECD/DAC Criteria & Scale (1–5)' },
        { code: 'M9', name: 'Master Deliverables Schedule, Quality Control & Validation Bodies' },
        { code: 'M10', name: 'Prescriptions, Governance Decisions & Corrective Action Plan Matrix' }
      ]
    : [
        { code: 'M1', name: 'Matrice du Cadre de Résultats (GAR) & Indicateurs SMART' },
        { code: 'M2', name: 'Matrice de Planification Opérationnelle WBS, PTBA & Chemin Critique' },
        { code: 'M3', name: 'Grille d’Évaluation Technique & Financière des Offres (70/30 ou 100 pts)' },
        { code: 'M4', name: 'Cartographie des Parties Prenantes & Feuille de Présence Officielle' },
        { code: 'M5', name: 'Matrice Budgétaire par Livrable, Rubrique & Échéancier de Décaissement' },
        { code: 'M6', name: 'Matrice d’Attribution des Responsabilités RACI (R-A-C-I)' },
        { code: 'M7', name: 'Registre Maître des Risques, Hypothèses, Incidents & Dépendances (RAID)' },
        { code: 'M8', name: 'Matrice Normative d’Évaluation selon les 6 Critères OCDE/CAD & Barème (1–5)' },
        { code: 'M9', name: 'Calendrier Directeur des Livrables, Contrôle Qualité & Instances de Validation' },
        { code: 'M10', name: 'Matrice des Prescriptions, Décisions d’Instance & Plan d’Actions Correctives' }
      ];

  return (
    <div
      ref={containerRef}
      className={`relative flex flex-col overflow-x-hidden ${
        isDark ? 'text-slate-100' : 'text-slate-900'
      }`}
    >
      {/* VIDÉO D'ANIMATION : Couvre tout l'écran (z-[9999], masquant le header et les sections) pendant 5 secondes (0s-5s), apparition du logo PNG transparent à la 3e seconde (3s-5s), puis passage en arrière-plan (z-0) sur la page d'accueil à la 5e seconde */}
      <div
        className={`fixed inset-0 pointer-events-none overflow-hidden transition-all duration-700 ${
          introPhase !== 'completed' ? 'z-[9999] bg-black' : 'z-0 bg-black'
        }`}
        aria-hidden="true"
      >
        <video
          ref={bgVideoRef}
          src="./assets/aistudio/smoke-intro_6dd80e7b.mp4"
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          className="w-full h-full object-cover"
        />
        {/* Voile léger de lisibilité actif uniquement lorsque la vidéo est en arrière-plan de la page d'accueil (après la 5e seconde) */}
        <div
          className={`absolute inset-0 transition-opacity duration-700 ${
            introPhase === 'completed'
              ? isDark
                ? 'bg-slate-950/60 opacity-100'
                : 'bg-white/65 opacity-100'
              : 'opacity-0'
          }`}
        />

        {/* Apparition du nouveau logo PNG transparent à la 3e seconde des 5 secondes dans l'animation vidéo (sans fond blanc) */}
        <div
          className={`absolute inset-0 flex flex-col items-center justify-center p-6 transition-all duration-700 ease-out ${
            introPhase === 'logo_visible'
              ? 'opacity-100 scale-100'
              : 'opacity-0 scale-75'
          }`}
        >
          <img
            src="/faab-gar-logo.svg"
            alt="faab gar"
            className="w-48 h-48 sm:w-64 sm:h-64 md:w-72 md:h-72 object-contain drop-shadow-[0_0_35px_rgba(110,55,17,0.85)] select-none"
          />
        </div>
      </div>

      {/* CONTENU DE LA PAGE D'ACCUEIL : Apparaît à la 5e seconde au-dessus de la vidéo en arrière-plan */}
      <div
        className={`relative z-10 flex flex-col transition-opacity duration-700 ${
          introPhase === 'completed'
            ? 'opacity-100'
            : 'opacity-0 pointer-events-none select-none'
        }`}
      >
      {/* SECTION 1: PRESENTATION GENERALE DE LA PLATEFORME */}
      <section
        id="section-presentation"
        className="scroll-mt-28 sm:scroll-mt-32 relative overflow-hidden py-8 sm:py-14 border-b border-[#90D5FF]/50 dark:border-slate-800"
      >
        <div className="max-w-7xl mx-auto px-2 sm:px-4">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            <div className="lg:col-span-7 space-y-5 scroll-reveal-left">
              <div className="text-xs font-extrabold uppercase tracking-wider text-[#0284c7] flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 shrink-0" />
                <span>{t.home.heroBadge}</span>
              </div>
              <h2
                className={`text-2xl sm:text-4xl lg:text-5xl font-black tracking-tight leading-tight ${
                  isDark ? 'text-white' : 'text-slate-900'
                }`}
              >
                {t.home.heroTitle}
              </h2>
              <p
                className={`text-sm sm:text-base leading-relaxed font-medium ${
                  isDark ? 'text-slate-300' : 'text-slate-700'
                }`}
              >
                {t.home.heroDesc}
              </p>

              <div
                onClick={onOpenSlidebar}
                className={`p-4 rounded-xl border-l-4 border-[#0284c7] cursor-pointer transition hover:opacity-95 ${
                  isDark
                    ? 'bg-slate-900/90 text-slate-200'
                    : 'bg-[#90D5FF]/20 text-slate-900'
                } text-xs sm:text-sm font-bold flex items-center space-x-3`}
              >
                <Award className="w-5 h-5 text-[#0284c7] shrink-0" />
                <span>{t.home.menuInstruction}</span>
              </div>

              {/* Capacités générales de la plateforme */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                <div
                  className={`p-3.5 rounded-xl border scroll-reveal-left ${
                    isDark
                      ? 'bg-slate-900 border-slate-800'
                      : 'bg-white border-[#90D5FF]'
                  }`}
                >
                  <div className="text-[10px] font-extrabold uppercase text-[#0284c7]">
                    {isEn ? 'Methodologies' : 'Méthodologies'}
                  </div>
                  <div className="text-sm sm:text-base font-black mt-1">
                    {isEn ? 'RBM · PERT · RACI' : 'GAR · PERT · RACI'}
                  </div>
                </div>
                <div
                  className={`p-3.5 rounded-xl border scroll-reveal-up ${
                    isDark
                      ? 'bg-slate-900 border-slate-800'
                      : 'bg-white border-[#90D5FF]'
                  }`}
                >
                  <div className="text-[10px] font-extrabold uppercase text-[#0284c7]">
                    {isEn ? 'Gantt Scales' : 'Échelles Gantt'}
                  </div>
                  <div className="text-sm sm:text-base font-black mt-1">
                    {isEn ? 'Day to Year' : 'Jour à Année'}
                  </div>
                </div>
                <div
                  className={`p-3.5 rounded-xl border scroll-reveal-up ${
                    isDark
                      ? 'bg-slate-900 border-slate-800'
                      : 'bg-white border-[#90D5FF]'
                  }`}
                >
                  <div className="text-[10px] font-extrabold uppercase text-[#0284c7]">
                    {isEn ? 'Multi-Currency' : 'Multi-Devises'}
                  </div>
                  <div className="text-sm sm:text-base font-black mt-1">
                    FCFA · EUR · USD
                  </div>
                </div>
                <div
                  onClick={() => {
                    const el = document.getElementById('section-documents');
                    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}
                  className={`p-3.5 rounded-xl border cursor-pointer transition hover:border-[#0284c7] scroll-reveal-right ${
                    isDark
                      ? 'bg-slate-900 border-slate-800'
                      : 'bg-white border-[#90D5FF]'
                  }`}
                >
                  <div className="text-[10px] font-extrabold uppercase text-[#0284c7]">
                    {isEn ? 'PDF & Slides Generation' : 'Génération PDF & Slides'}
                  </div>
                  <div className="text-sm sm:text-base font-black mt-1">
                    {isEn ? '22 Docs & 10 Matrices' : '22 Docs & 10 Matrices'}
                  </div>
                </div>
              </div>
            </div>

            {/* Carte Visuelle Officielle faab gar */}
            <div className="lg:col-span-5 flex justify-center scroll-reveal-right">
              <div
                className={`w-full max-w-md p-6 sm:p-8 rounded-3xl border-2 shadow-xl flex flex-col items-center text-center ${
                  isDark
                    ? 'bg-gradient-to-br from-slate-900 via-[#0c4a6e]/40 to-slate-900 border-[#90D5FF]/50'
                    : 'bg-gradient-to-br from-[#FFFFFF] via-[#90D5FF]/25 to-[#90D5FF]/40 border-[#90D5FF]'
                }`}
              >
                <div className="mb-4 flex items-center justify-center">
                  <AppLogo className="w-40 h-40 sm:w-48 sm:h-48 md:w-52 md:h-52 drop-shadow-[0_10px_25px_rgba(2,132,199,0.35)]" />
                </div>
                <div className="text-xs font-black uppercase tracking-widest text-[#0284c7]">
                  {isEn
                    ? 'UNIVERSAL PROJECT STEERING SYSTEM'
                    : 'SYSTÈME UNIVERSEL DE PILOTAGE DE PROJETS'}
                </div>
                <h3
                  className={`mt-2 text-lg sm:text-xl font-black ${
                    isDark ? 'text-white' : 'text-[#0c4a6e]'
                  }`}
                >
                  {isEn
                    ? 'faab gar — Engineering & Operational Tracking'
                    : 'faab gar — Ingénierie & Suivi Opérationnel'}
                </h3>
                <p
                  className={`mt-2 text-xs leading-relaxed font-medium ${
                    isDark ? 'text-slate-300' : 'text-slate-700'
                  }`}
                >
                  {isEn
                    ? 'An all-in-one solution to structure your portfolios, schedule tasks on the critical path, classify stakeholders in 5 categories, track real execution, and automatically generate 22 official documents (15 A4 + 7 16:9 Slide Decks), Executive CVs, and Badges.'
                    : 'Une solution tout-en-un pour structurer vos portefeuilles, ordonnancer vos tâches sur le chemin critique, classifier les acteurs en 5 catégories, suivre l’exécution réelle et générer automatiquement 22 documents officiels (15 A4 + 7 Présentations Slides 16:9), CVs exécutifs et Badges.'}
                </p>
              </div>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* BLOC D'INSTALLATION PWA MULTI-PLATEFORMES (« F-PLLAN ») & MISE À JOUR    */}
          {/* ========================================================================= */}
          <div
            className={`mt-8 p-4 sm:p-6 rounded-2xl border-2 shadow-lg transition-all ${
              isDark
                ? 'bg-slate-900/95 border-[#90D5FF]/60 text-slate-100'
                : 'bg-gradient-to-r from-sky-50 via-white to-sky-50 border-[#0284c7] text-slate-900'
            }`}
          >
            <div className="flex flex-col gap-4">
              <div className="space-y-2 w-full min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#0c4a6e] text-[#90D5FF] text-[10px] sm:text-[11px] font-black uppercase tracking-wider">
                    <Download className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      {isEn
                        ? 'PWA Application · Installed Name: "F-PLLAN"'
                        : 'Application PWA · Nom installé : « F-PLLAN »'}
                    </span>
                  </span>
                  <span className="text-[11px] sm:text-xs font-extrabold text-emerald-600 dark:text-emerald-400">
                    {isEn
                      ? '• MacBook, Windows, Linux, iPhone, iPad & Android'
                      : '• MacBook, Windows, Linux, iPhone, iPad & Android'}
                  </span>
                </div>
                <h3
                  className={`text-sm sm:text-base md:text-lg font-black leading-snug break-words ${
                    isDark ? 'text-white' : 'text-[#0c4a6e]'
                  }`}
                >
                  {isEn
                    ? 'Download & Install "F-PLLAN" on your Computer, Tablet or Smartphone'
                    : 'Télécharger & Installer l’application « F-PLLAN » sur votre Ordinateur, Tablette ou Téléphone'}
                </h3>
                <p
                  className={`text-xs sm:text-sm leading-relaxed break-words ${
                    isDark ? 'text-slate-300' : 'text-slate-600'
                  }`}
                >
                  {isEn
                    ? 'Install the official "F-PLLAN" app directly onto your device (MacBook, Windows, Linux, Android or Apple iPhone/iPad) for 1-click desktop/home-screen launch and offline access. Use the Update icon button anytime to reload the latest version.'
                    : 'Installez l’application officielle sous le nom « F-PLLAN » directement sur votre appareil (ordinateur MacBook, Windows, Linux, ou téléphone et tablette Android / Apple) pour y accéder en 1 clic depuis votre bureau ou écran d’accueil. Utilisez le bouton icône « Mise à jour » à droite pour recharger et actualiser l’application.'}
                </p>
              </div>

              {/* Boutons de téléchargement par plateforme + Bouton en icône "Mise à jour" */}
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:flex xl:flex-wrap xl:items-center gap-2.5 w-full pt-2 border-t border-sky-200/70 dark:border-slate-800">
                {/* 1. Ordinateurs : MacBook / Windows / Linux */}
                <button
                  type="button"
                  onClick={() => handleInstallPwaPlatform('desktop')}
                  className="inline-flex items-center justify-center sm:justify-start gap-2 px-3.5 py-2.5 rounded-xl bg-[#0c4a6e] hover:bg-[#075985] text-white text-xs font-black shadow-sm transition-all cursor-pointer border border-[#90D5FF]/50 w-full xl:w-auto"
                >
                  <Monitor className="w-4 h-4 text-[#90D5FF] shrink-0" />
                  <span className="text-left leading-tight">
                    {isEn
                      ? 'MacBook / Windows / Linux'
                      : 'Ordinateur (MacBook · Windows · Linux)'}
                  </span>
                </button>

                {/* 2. Mobile & Tablette Android */}
                <button
                  type="button"
                  onClick={() => handleInstallPwaPlatform('android')}
                  className="inline-flex items-center justify-center sm:justify-start gap-2 px-3.5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black shadow-sm transition-all cursor-pointer w-full xl:w-auto"
                >
                  <Smartphone className="w-4 h-4 text-white shrink-0" />
                  <span className="text-left leading-tight">
                    {isEn
                      ? 'Android Phone & Tablet'
                      : 'Mobile & Tablette Android'}
                  </span>
                </button>

                {/* 3. Mobile & Tablette Apple (iPhone & iPad) -> Ouvre le petit champ d'explication */}
                <button
                  type="button"
                  onClick={() => handleInstallPwaPlatform('apple')}
                  aria-expanded={activeInstallHelper === 'apple'}
                  className={`inline-flex items-center justify-center sm:justify-start gap-2 px-3.5 py-2.5 rounded-xl text-xs font-black shadow-sm transition-all cursor-pointer border w-full xl:w-auto ${
                    activeInstallHelper === 'apple'
                      ? 'bg-[#90D5FF] text-slate-950 border-[#0c4a6e] ring-2 ring-[#0284c7]'
                      : isDark
                      ? 'bg-slate-800 hover:bg-slate-700 text-white border-[#90D5FF]/60'
                      : 'bg-white hover:bg-sky-100 text-[#0c4a6e] border-[#0284c7]'
                  }`}
                >
                  <Tablet className="w-4 h-4 text-[#0284c7] shrink-0" />
                  <span className="text-left leading-tight">
                    {isEn
                      ? 'Apple iPhone & iPad (Guide)'
                      : 'Mobile & Tablette Apple (iPhone / iPad)'}
                  </span>
                </button>

                {/* 4. Bouton en icône "Mise à jour" (uniquement l'icône, sans intitulé) pour recharger l'application */}
                <button
                  type="button"
                  onClick={handleReloadAndUpdateApp}
                  title={
                    isEn
                      ? 'Update & Reload F-PLLAN Application'
                      : 'Mise à jour : Recharger l’application F-PLLAN pour appliquer la dernière version'
                  }
                  aria-label={isEn ? 'Update App' : 'Mise à jour'}
                  className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 shadow-sm transition-all cursor-pointer shrink-0 xl:ml-auto"
                >
                  <RefreshCw
                    className={`w-4 h-4 shrink-0 ${
                      isUpdatingApp ? 'animate-spin' : ''
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Notification d'état PWA */}
            {pwaNotice && (
              <div className="mt-3 p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-400 text-emerald-900 dark:text-emerald-200 text-xs font-bold flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="break-words">{pwaNotice}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setPwaNotice(null)}
                  className="text-emerald-700 dark:text-emerald-300 hover:opacity-75 cursor-pointer shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* PETIT CHAMP D'EXPLICATION INTERACTIF POUR MOBILE & TABLETTE APPLE (iPhone & iPad) */}
            {activeInstallHelper === 'apple' && (
              <div
                className={`mt-4 p-4 rounded-xl border-2 transition-all ${
                  isDark
                    ? 'bg-slate-800/95 border-[#90D5FF] text-slate-100'
                    : 'bg-white border-[#0284c7] text-slate-900 shadow-md'
                }`}
              >
                <div className="flex items-start justify-between gap-3 mb-2.5">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-[#0c4a6e] text-[#90D5FF] flex items-center justify-center shrink-0">
                      <Tablet className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs sm:text-sm font-black uppercase text-[#0c4a6e] dark:text-[#90D5FF]">
                        {isEn
                          ? 'How to install "F-PLLAN" on Apple iPhone & iPad (iOS / iPadOS)'
                          : 'Comment télécharger « F-PLLAN » sur iPhone et Tablette iPad (Apple)'}
                      </h4>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {isEn
                          ? 'Follow these 3 quick steps in Safari or Chrome on your Apple device:'
                          : 'Suivez ces 3 étapes simples depuis Safari (ou Chrome) sur votre appareil Apple :'}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveInstallHelper(null)}
                    className="p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 cursor-pointer shrink-0"
                    title={isEn ? 'Close explanation' : 'Fermer l’explication'}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div className="p-3 rounded-lg bg-sky-50/80 dark:bg-slate-900 border border-sky-200 dark:border-slate-700 space-y-1">
                    <div className="font-black text-[#0284c7] flex items-center gap-1.5">
                      <Share className="w-4 h-4 shrink-0" />
                      <span>{isEn ? '1. Tap "Share"' : '1. Appuyez sur « Partager »'}</span>
                    </div>
                    <p className="text-[11px] leading-relaxed text-slate-700 dark:text-slate-300">
                      {isEn
                        ? 'Tap the Share icon (square with an upward arrow ↑) at the bottom of your iPhone screen or top-right on your iPad.'
                        : 'Appuyez sur l’icône Partager (le carré avec une flèche vers le haut ↑) située en bas de l’écran sur iPhone ou en haut à droite sur iPad.'}
                    </p>
                  </div>

                  <div className="p-3 rounded-lg bg-sky-50/80 dark:bg-slate-900 border border-sky-200 dark:border-slate-700 space-y-1">
                    <div className="font-black text-[#0284c7] flex items-center gap-1.5">
                      <PlusSquare className="w-4 h-4 shrink-0" />
                      <span>
                        {isEn
                          ? '2. "Add to Home Screen"'
                          : '2. « Sur l’écran d’accueil »'}
                      </span>
                    </div>
                    <p className="text-[11px] leading-relaxed text-slate-700 dark:text-slate-300">
                      {isEn
                        ? 'Scroll down the share menu and select "Add to Home Screen" (+).'
                        : 'Faites défiler la liste des options vers le bas puis appuyez sur « Sur l’écran d’accueil » (+).'}
                    </p>
                  </div>

                  <div className="p-3 rounded-lg bg-sky-50/80 dark:bg-slate-900 border border-sky-200 dark:border-slate-700 space-y-1">
                    <div className="font-black text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>
                        {isEn
                          ? '3. Confirm "F-PLLAN"'
                          : '3. Validez l’application « F-PLLAN »'}
                      </span>
                    </div>
                    <p className="text-[11px] leading-relaxed text-slate-700 dark:text-slate-300">
                      {isEn
                        ? 'The name "F-PLLAN" appears automatically. Tap "Add" at the top right: the app is now installed on your iPhone/iPad!'
                        : 'Le nom « F-PLLAN » s’affiche automatiquement. Appuyez sur « Ajouter » en haut à droite : l’icône F-PLLAN est installée sur votre écran d’accueil !'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* PETIT CHAMP D'EXPLICATION POUR ORDINATEUR (MacBook / Windows / Linux) SI DÉJÀ INSTALLÉ OU SAFARI */}
            {activeInstallHelper === 'desktop' && (
              <div
                className={`mt-4 p-4 rounded-xl border-2 transition-all ${
                  isDark
                    ? 'bg-slate-800/95 border-[#90D5FF] text-slate-100'
                    : 'bg-white border-[#0284c7] text-slate-900 shadow-md'
                }`}
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2">
                    <Monitor className="w-5 h-5 text-[#0284c7] shrink-0" />
                    <h4 className="text-xs sm:text-sm font-black uppercase text-[#0c4a6e] dark:text-[#90D5FF]">
                      {isEn
                        ? 'Install "F-PLLAN" on MacBook (macOS), Windows & Linux'
                        : 'Installation de « F-PLLAN » sur Ordinateur (MacBook, Windows & Linux)'}
                    </h4>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveInstallHelper(null)}
                    className="p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 cursor-pointer shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="p-3 rounded-lg bg-sky-50/80 dark:bg-slate-900 border border-sky-200 dark:border-slate-700">
                    <div className="font-black text-[#0c4a6e] dark:text-[#90D5FF] mb-1">
                      • Google Chrome / Microsoft Edge / Brave (Windows, Mac, Linux) :
                    </div>
                    <p className="text-[11px] leading-relaxed text-slate-700 dark:text-slate-300">
                      Cliquez sur l’icône <strong>Installer « F-PLLAN »</strong> (petit écran avec une flèche vers le bas) située tout à droite de la barre d’adresse de votre navigateur, ou dans le menu <strong>⋮ → Enregistrer et partager → Installer F-PLLAN</strong>.
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-sky-50/80 dark:bg-slate-900 border border-sky-200 dark:border-slate-700">
                    <div className="font-black text-[#0c4a6e] dark:text-[#90D5FF] mb-1">
                      • Safari sur MacBook / iMac (macOS) :
                    </div>
                    <p className="text-[11px] leading-relaxed text-slate-700 dark:text-slate-300">
                      Dans la barre de menu en haut de l’écran, cliquez sur <strong>Fichier → Ajouter au Dock...</strong> (ou sur le bouton Partager → <strong>Ajouter au Dock</strong>) et validez le nom <strong>« F-PLLAN »</strong>.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* PETIT CHAMP D'EXPLICATION POUR ANDROID (Mobile & Tablette) */}
            {activeInstallHelper === 'android' && (
              <div
                className={`mt-4 p-4 rounded-xl border-2 transition-all ${
                  isDark
                    ? 'bg-slate-800/95 border-[#90D5FF] text-slate-100'
                    : 'bg-white border-emerald-600 text-slate-900 shadow-md'
                }`}
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2">
                    <Smartphone className="w-5 h-5 text-emerald-600 shrink-0" />
                    <h4 className="text-xs sm:text-sm font-black uppercase text-emerald-800 dark:text-emerald-300">
                      {isEn
                        ? 'Install "F-PLLAN" on Android Phone & Tablet'
                        : 'Installation de « F-PLLAN » sur Téléphone & Tablette Android'}
                    </h4>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveInstallHelper(null)}
                    className="p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 cursor-pointer shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                  Dans Chrome ou Samsung Internet sur Android, appuyez sur le menu <strong>⋮</strong> (en haut à droite) puis sélectionnez <strong>« Installer l’application »</strong> ou <strong>« Ajouter à l’écran d’accueil »</strong>. Confirmez l’installation : l’application <strong>« F-PLLAN »</strong> est immédiatement ajoutée à vos applications Android.
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* SECTION 2: COMMENT UTILISER L'APPLICATION & SON CONTENU EN GENERAL */}
      <section
        id="section-utilisation"
        className={`scroll-mt-28 sm:scroll-mt-32 py-10 sm:py-14 border-b rounded-2xl my-4 ${
          isDark
            ? 'bg-slate-900/40 border-slate-800'
            : 'bg-sky-50/40 border-[#90D5FF]/40'
        }`}
      >
        <div className="max-w-7xl mx-auto px-3 sm:px-6 space-y-8">
          <div className="max-w-3xl scroll-reveal-left">
            <div className="text-xs font-extrabold uppercase tracking-widest text-[#0284c7]">
              {isEn
                ? 'Complete User Guide & Platform Modules'
                : 'Mode d’Emploi Complet & Contenu de la Plateforme'}
            </div>
            <h2
              className={`text-xl sm:text-3xl font-black mt-1 ${
                isDark ? 'text-white' : 'text-slate-900'
              }`}
            >
              {isEn
                ? 'How to use faab gar step by step?'
                : 'Comment utiliser faab gar étape par étape ?'}
            </h2>
            <p
              className={`text-xs sm:text-sm mt-2 leading-relaxed ${
                isDark ? 'text-slate-300' : 'text-slate-600'
              }`}
            >
              {isEn
                ? 'Discover the complete architecture of the application and the role of each module accessible from the slide-out menu (☰):'
                : 'Découvrez l’architecture complète de l’application et le rôle de chaque module accessible depuis le menu déroulant (☰) :'}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {appModules.map(mod => {
              const Icon = mod.icon;
              const animClass =
                mod.direction === 'left'
                  ? 'scroll-reveal-left'
                  : 'scroll-reveal-right';
              return (
                <div
                  key={mod.id}
                  className={`${animClass} p-5 rounded-2xl border transition flex items-start gap-4 shadow-2xs ${
                    isDark
                      ? 'bg-slate-900 border-slate-800'
                      : 'bg-[#FFFFFF] border-[#90D5FF]/70'
                  }`}
                >
                  <div className="w-11 h-11 rounded-xl bg-[#90D5FF] text-slate-950 flex flex-col items-center justify-center shrink-0 font-black text-xs shadow-xs">
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-mono font-black text-[#0284c7]">
                        {isEn ? `STEP ${mod.step}` : `ÉTAPE ${mod.step}`}
                      </span>
                      <h3
                        className={`text-sm font-black ${
                          isDark ? 'text-white' : 'text-[#0c4a6e]'
                        }`}
                      >
                        {mod.title}
                      </h3>
                    </div>
                    <p
                      className={`text-xs leading-relaxed ${
                        isDark ? 'text-slate-300' : 'text-slate-600'
                      }`}
                    >
                      {mod.desc}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* SECTION 3: GENERATEUR DE DOCUMENTS INSTITUTIONNELS & OPERATIONNELS (15 DOCUMENTS + FICHE TECHNIQUE + 10 MATRICES) */}
      <section
        id="section-documents"
        className="scroll-mt-28 sm:scroll-mt-32 py-10 sm:py-14 border-b border-[#90D5FF]/50 dark:border-slate-800"
      >
        <div className="max-w-7xl mx-auto px-2 sm:px-4 space-y-8">
          {/* En-tête de la section Génération Documentaire */}
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 scroll-reveal-left">
            <div className="max-w-4xl space-y-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-[#0c4a6e] text-[#90D5FF] text-[11px] font-extrabold uppercase tracking-widest">
                <FileSpreadsheet className="w-4 h-4" />
                <span>
                  {isEn
                    ? 'Document Engineering & International Accountability'
                    : 'Ingénierie Documentaire & Redevabilité Internationale'}
                </span>
              </div>
              <h2
                className={`text-xl sm:text-3xl font-black leading-tight ${
                  isDark ? 'text-white' : 'text-slate-900'
                }`}
              >
                {isEn
                  ? 'The Platform Automatically Generates 15 Official A4 Documents, the Executive Technical Sheet & 10 Master Matrices'
                  : 'La Plateforme Génère Automatiquement 15 Documents Officiels A4, la Fiche Technique Exécutive & 10 Matrices Maîtresses'}
              </h2>
              <p
                className={`text-xs sm:text-sm leading-relaxed ${
                  isDark ? 'text-slate-300' : 'text-slate-700'
                }`}
              >
                {isEn ? (
                  <>
                    faab gar embeds a high-precision document publishing engine compliant with international frameworks (
                    <strong>
                      UNDP, UNICEF, World Bank, AfDB, European Union, UNEG, OECD/DAC, PMBOK® 7 and ISO 21500:2021
                    </strong>
                    ). Every document automatically retrieves live data entered across the other tabs of the application (Profile, Portfolio, Axes, Projects, Activities, Milestones, FCFA/EUR/USD Budget, RACI, PERT, and Variance Tracking) and exports to{' '}
                    <strong>A4 PDF on pure white background (#FFFFFF)</strong>.
                  </>
                ) : (
                  <>
                    faab gar intègre un moteur d’édition documentaire haute
                    précision conforme aux référentiels internationaux (
                    <strong>
                      PNUD, UNICEF, Banque Mondiale, BAD, Union Européenne, UNEG,
                      OCDE/CAD, PMBOK® 7 et ISO 21500:2021
                    </strong>
                    ). Chaque document récupère automatiquement les données saisies
                    dans les autres onglets de l’application (Profil, Dossier, Axes,
                    Projets, Activités, Jalons, Budget FCFA/EUR/USD, RACI, PERT et
                    Suivi des écarts) et s’exporte en{' '}
                    <strong>PDF A4 sur fond blanc pur (#FFFFFF)</strong>.
                  </>
                )}
              </p>
            </div>

            <div className="px-4 py-2.5 rounded-xl bg-[#0c4a6e] text-[#90D5FF] font-black text-xs flex items-center gap-2 shadow-sm border border-[#90D5FF]/60 shrink-0 select-none">
              <FileSpreadsheet className="w-4 h-4 text-[#90D5FF] shrink-0" />
              <span>
                {isEn
                  ? 'Access via Top Burger Menu (☰)'
                  : 'Accès via le Menu Burger (☰) en haut'}
              </span>
            </div>
          </div>

          {/* 3 Capacités Clés du Moteur Documentaire */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div
              className={`p-4 sm:p-5 rounded-2xl border scroll-reveal-left ${
                isDark
                  ? 'bg-slate-900 border-slate-800'
                  : 'bg-sky-50/60 border-[#90D5FF]'
              }`}
            >
              <div className="flex items-center gap-2.5 mb-2">
                <div className="w-9 h-9 rounded-xl bg-[#0c4a6e] text-[#90D5FF] flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <h3
                  className={`text-xs sm:text-sm font-black ${
                    isDark ? 'text-white' : 'text-[#0c4a6e]'
                  }`}
                >
                  {isEn
                    ? '1. Automatic Multi-Tab Synchronization'
                    : '1. Synchronisation Automatique Multi-Onglets'}
                </h3>
              </div>
              <p
                className={`text-xs leading-relaxed ${
                  isDark ? 'text-slate-300' : 'text-slate-600'
                }`}
              >
                {isEn
                  ? 'Zero double entry: AWPB budgets, number of axes and projects, PERT critical path, RACI leads, and real completion rates dynamically feed the body and tables of every generated document.'
                  : 'Aucune double saisie : les budgets PTBA, le nombre d’axes et de projets, le chemin critique PERT, les responsables RACI et les taux d’avancement réels alimentent en temps réel le corps et les tableaux de chaque document généré.'}
              </p>
            </div>

            <div
              className={`p-4 sm:p-5 rounded-2xl border scroll-reveal-up ${
                isDark
                  ? 'bg-slate-900 border-slate-800'
                  : 'bg-sky-50/60 border-[#90D5FF]'
              }`}
            >
              <div className="flex items-center gap-2.5 mb-2">
                <div className="w-9 h-9 rounded-xl bg-[#0c4a6e] text-[#90D5FF] flex items-center justify-center shrink-0">
                  <Table2 className="w-5 h-5" />
                </div>
                <h3
                  className={`text-xs sm:text-sm font-black ${
                    isDark ? 'text-white' : 'text-[#0c4a6e]'
                  }`}
                >
                  {isEn
                    ? '2. Interactive Filter for 10 Master Matrices'
                    : '2. Filtre Interactif des 10 Matrices Maîtresses'}
                </h3>
              </div>
              <p
                className={`text-xs leading-relaxed ${
                  isDark ? 'text-slate-300' : 'text-slate-600'
                }`}
              >
                {isEn
                  ? 'Directly edit the 10 standardized matrices (RBM Logical Framework, AWPB/WBS, 100-pt Grid, Stakeholders, Deliverable Budget, RACI, RAID Risks, OECD/DAC Grid, Deliverables, Action Plan) automatically injected into the documents.'
                  : 'Éditez directement les 10 matrices normées (Cadre logique GAR, PTBA/WBS, Grille 100 pts, Parties prenantes, Budget par livrable, RACI, Risques RAID, Grille OCDE/CAD, Livrables, Plan d’actions) qui s’injectent automatiquement aux emplacements exacts des documents.'}
              </p>
            </div>

            <div
              className={`p-4 sm:p-5 rounded-2xl border scroll-reveal-right ${
                isDark
                  ? 'bg-slate-900 border-slate-800'
                  : 'bg-sky-50/60 border-[#90D5FF]'
              }`}
            >
              <div className="flex items-center gap-2.5 mb-2">
                <div className="w-9 h-9 rounded-xl bg-[#0c4a6e] text-[#90D5FF] flex items-center justify-center shrink-0">
                  <ImageIcon className="w-5 h-5" />
                </div>
                <h3
                  className={`text-xs sm:text-sm font-black ${
                    isDark ? 'text-white' : 'text-[#0c4a6e]'
                  }`}
                >
                  {isEn
                    ? '3. Image, Logo, ID Photo & Stamp Upload'
                    : '3. Importation d’Images, Logos, Photos & Cachets'}
                </h3>
              </div>
              <p
                className={`text-xs leading-relaxed ${
                  isDark ? 'text-slate-300' : 'text-slate-600'
                }`}
              >
                {isEn
                  ? 'Import Donor and Implementing Agency logos, cover banners, technical diagrams, professional ID photos (3.5×4.5 cm for CVs), as well as official validation signatures and stamps.'
                  : 'Importez les logos du Bailleur et de l’Agence d’exécution, la bannière de couverture, les schémas techniques, la photo d’identité (3,5×4,5 cm pour les CV) ainsi que les signatures et cachets officiels de validation.'}
              </p>
            </div>
          </div>

          {/* Encadré Spécial : La Fiche Technique & Résumé Exécutif Multi-Pages A4 */}
          <div
            className={`p-5 sm:p-6 rounded-2xl border-2 border-[#0284c7] transition scroll-reveal-left ${
              isDark
                ? 'bg-slate-900/90 text-white'
                : 'bg-gradient-to-r from-[#0c4a6e] to-[#082f49] text-white'
            }`}
          >
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1.5">
                <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded bg-[#90D5FF] text-slate-950 text-[10px] font-black uppercase tracking-wider">
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>
                    {isEn
                      ? 'Cross-Cutting Portfolio Deliverable (Dedicated Tab)'
                      : 'Livrable Transversal du Portefeuille (Onglet Dédié)'}
                  </span>
                </div>
                <h3 className="text-base sm:text-lg font-black">
                  {isEn
                    ? 'Multi-Page A4 Technical Sheet & Executive Summary (8 Standardized Sections)'
                    : 'Fiche Technique & Résumé Exécutif Multi-Pages A4 (8 Sections Normées)'}
                </h3>
                <p className="text-xs text-sky-100 leading-relaxed max-w-4xl">
                  {isEn ? (
                    <>
                      In addition to the 15 generator documents, faab gar automatically produces the complete{' '}
                      <strong>Technical Sheet & Executive Summary</strong> of the portfolio:{' '}
                      <em>
                        1. Institutional cover page · 2. Executive table of contents · 3. Acronyms table · 4. Executive synthesis & performance charts · 5. Multi-scale Gantt chart · 6. Table 1 Macro-Planning · 7. Table 2 Variance Tracking · 8. PERT Network & Critical Path
                      </em>
                      .
                    </>
                  ) : (
                    <>
                      En complément des 15 documents du générateur, faab gar
                      produit automatiquement la{' '}
                      <strong>Fiche Technique & Résumé Exécutif</strong> complète du
                      portefeuille :{' '}
                      <em>
                        1. Page de garde institutionnelle · 2. Sommaire exécutif ·
                        3. Table des acronymes · 4. Synthèse exécutive & graphiques
                        de performance · 5. Diagramme de Gantt multi-échelles · 6.
                        Tableau 1 de Planification macro · 7. Tableau 2 de Suivi des
                        écarts · 8. Réseau PERT & Chemin Critique
                      </em>
                      .
                    </>
                  )}
                </p>
              </div>
              <span className="px-3.5 py-2 rounded-xl bg-[#90D5FF] text-slate-950 font-black text-xs whitespace-nowrap self-start md:self-center select-none">
                {isEn
                  ? 'Menu Burger (☰) → Technical Sheet'
                  : 'Menu Burger (☰) → Fiche Technique'}
              </span>
            </div>
          </div>

          {/* Liste intégrale et explication détaillée des 15 Documents générés */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#90D5FF]/50 dark:border-slate-800 pb-3 scroll-reveal-up">
              <div>
                <h3
                  className={`text-base sm:text-xl font-black ${
                    isDark ? 'text-white' : 'text-[#0c4a6e]'
                  }`}
                >
                  {isEn
                    ? 'Detailed Catalog of the 15 Documents Generated by faab gar'
                    : 'Catalogue Détaillé des 15 Documents Générés par faab gar'}
                </h3>
                <p
                  className={`text-xs ${
                    isDark ? 'text-slate-400' : 'text-slate-600'
                  }`}
                >
                  {isEn
                    ? 'Open the top Burger Menu (☰) to access the Institutional Document Generator and these templates:'
                    : 'Ouvrez le Menu Burger (☰) en haut pour accéder au Générateur de Documents Institutionnels et à ces modèles :'}
                </p>
              </div>
              <div className="flex flex-wrap gap.1.5 gap-1.5 text-[10px] font-black">
                <span className="px-2.5 py-1 rounded-md bg-sky-100 text-[#0c4a6e] dark:bg-slate-800 dark:text-[#90D5FF]">
                  {isEn ? 'Cat. A: Strict 1 Page' : 'Cat. A : 1 Page Stricte'}
                </span>
                <span className="px-2.5 py-1 rounded-md bg-sky-100 text-[#0c4a6e] dark:bg-slate-800 dark:text-[#90D5FF]">
                  {isEn ? 'Cat. B: 2 to 5 Pages' : 'Cat. B : 2 à 5 Pages'}
                </span>
                <span className="px-2.5 py-1 rounded-md bg-sky-100 text-[#0c4a6e] dark:bg-slate-800 dark:text-[#90D5FF]">
                  {isEn ? 'Cat. C: 10 Pages (Major Reports)' : 'Cat. C : 10 Pages (Grands Rapports)'}
                </span>
                <span className="px-2.5 py-1 rounded-md bg-sky-100 text-[#0c4a6e] dark:bg-slate-800 dark:text-[#90D5FF]">
                  {isEn
                    ? 'Cat. D: Operational & CVs (No Cover Page)'
                    : 'Cat. D : Opérationnels & CV (Sans Page de Garde)'}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {institutionalDocuments.map((doc, idx) => {
                const revealClass =
                  idx % 3 === 0
                    ? 'scroll-reveal-left'
                    : idx % 3 === 1
                    ? 'scroll-reveal-up'
                    : 'scroll-reveal-right';
                return (
                <div
                  key={doc.num}
                  className={`${revealClass} p-4 sm:p-5 rounded-2xl border transition flex flex-col justify-between gap-3 shadow-2xs ${
                    isDark
                      ? 'bg-slate-900 border-slate-800'
                      : 'bg-white border-[#90D5FF]/80'
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <span className="px-2.5 py-1 rounded-lg bg-[#0c4a6e] text-[#90D5FF] font-mono text-xs font-black shrink-0">
                        DOC {doc.num}
                      </span>
                      <span
                        className={`text-[10px] font-extrabold px-2 py-0.5 rounded border text-right leading-tight ${
                          isDark
                            ? 'bg-slate-800 border-slate-700 text-sky-300'
                            : 'bg-sky-50 border-[#90D5FF] text-[#0c4a6e]'
                        }`}
                      >
                        {doc.category}
                      </span>
                    </div>

                    <h4
                      className={`text-sm font-black leading-snug ${
                        isDark ? 'text-white' : 'text-[#0c4a6e]'
                      }`}
                    >
                      {doc.title}
                    </h4>

                    <p
                      className={`text-xs leading-relaxed ${
                        isDark ? 'text-slate-300' : 'text-slate-600'
                      }`}
                    >
                      {doc.desc}
                    </p>
                  </div>

                  <div
                    className={`pt-2.5 border-t text-[10px] font-bold flex items-center gap-1.5 ${
                      isDark
                        ? 'border-slate-800 text-[#90D5FF]'
                        : 'border-slate-100 text-[#0284c7]'
                    }`}
                  >
                    <Briefcase className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{doc.standards}</span>
                  </div>
                </div>
                );
              })}
            </div>
          </div>

          {/* Récapitulatif des 10 Matrices Maîtresses Interactives intégrées aux 22 Documents & Slides */}
          <div
            className={`p-5 sm:p-6 rounded-2xl border scroll-reveal-up ${
              isDark
                ? 'bg-slate-900 border-slate-800'
                : 'bg-sky-50/50 border-[#90D5FF]'
            }`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
              <div>
                <div className="text-[10px] font-extrabold uppercase tracking-widest text-[#0284c7]">
                  {isEn
                    ? 'Dynamic Tables Embedded in Documents'
                    : 'Tableaux Dynamiques Embarqués dans les Documents'}
                </div>
                <h3
                  className={`text-sm sm:text-base font-black ${
                    isDark ? 'text-white' : 'text-[#0c4a6e]'
                  }`}
                >
                  {isEn
                    ? 'The 10 Interactive Master Matrices (M1 to M10) Linked to the 22 Documents & Slides'
                    : 'Les 10 Matrices Maîtresses Interactives (M1 à M10) Associées aux 22 Documents & Slides'}
                </h3>
              </div>
              <span className="px-3 py-1.5 rounded-lg bg-[#90D5FF] text-slate-950 font-black text-xs self-start sm:self-center select-none">
                {isEn
                  ? 'Menu Burger (☰) → Matrices M1-M10'
                  : 'Menu Burger (☰) → Matrices M1-M10'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
              {masterMatricesList.map((m, mIdx) => (
                <div
                  key={m.code}
                  className={`${
                    mIdx % 2 === 0 ? 'scroll-reveal-left' : 'scroll-reveal-right'
                  } p-3 rounded-xl border text-xs flex items-start gap-2 ${
                    isDark
                      ? 'bg-slate-800/80 border-slate-700 text-slate-200'
                      : 'bg-white border-slate-200 text-slate-700'
                  }`}
                >
                  <span className="px-1.5 py-0.5 rounded bg-[#0c4a6e] text-[#90D5FF] font-mono text-[10px] font-black shrink-0">
                    {m.code}
                  </span>
                  <span className="font-bold leading-snug text-[11px]">
                    {m.name}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* BLOC : SOUPLESSE ET FACILITÉ DE GÉNÉRATION DES DOCUMENTS */}
          <div
            className={`p-6 sm:p-8 rounded-3xl border-2 scroll-reveal-up ${
              isDark
                ? 'bg-gradient-to-br from-slate-900 via-sky-950/40 to-slate-900 border-[#90D5FF]/40'
                : 'bg-gradient-to-br from-white via-sky-50/70 to-[#90D5FF]/20 border-[#90D5FF]'
            }`}
          >
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-[#90D5FF]/40 dark:border-slate-800">
              <div className="space-y-1">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-[#0c4a6e] text-[#90D5FF] text-[10px] font-black uppercase tracking-wider">
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  <span>{isEn ? 'Unrivaled Flexibility' : 'Souplesse & Ergonomie Maximale'}</span>
                </div>
                <h3
                  className={`text-base sm:text-xl font-black ${
                    isDark ? 'text-white' : 'text-[#0c4a6e]'
                  }`}
                >
                  {isEn
                    ? 'Effortless Side-by-Side Generation & 1-Click Synchronization'
                    : 'Génération Fluide en Vis-à-Vis Direct & Synchronisation en 1 Clic'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => onNavigateTab('docgen')}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-[#0c4a6e] to-[#0284c7] hover:from-[#075985] hover:to-[#0369a1] text-white text-xs font-black shadow-md cursor-pointer transition-all self-start lg:self-center"
              >
                <Sparkles className="w-4 h-4 text-[#90D5FF]" />
                <span>
                  {isEn ? 'Open Document Generator' : 'Ouvrir le Générateur de Documents'}
                </span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-5">
              <div
                className={`p-4 rounded-2xl border ${
                  isDark
                    ? 'bg-slate-900/80 border-slate-800'
                    : 'bg-white border-sky-200'
                } space-y-2`}
              >
                <div className="w-8 h-8 rounded-lg bg-sky-100 dark:bg-slate-800 text-[#0284c7] dark:text-[#90D5FF] flex items-center justify-center font-black">
                  <SlidersHorizontal className="w-4 h-4" />
                </div>
                <h4
                  className={`text-xs font-black uppercase tracking-wide ${
                    isDark ? 'text-white' : 'text-slate-900'
                  }`}
                >
                  {isEn ? '1. Direct Side-by-Side Alignment' : '1. Alignement en Vis-à-Vis Direct'}
                </h4>
                <p className={`text-xs leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                  {isEn
                    ? 'Every single input field on the left is positioned directly opposite its exact rendered section in the A4 document or 16:9 slide on the right. No guesswork, no jumping between screens.'
                    : 'Chaque champ de saisie à gauche est situé en vis-à-vis direct de la section correspondante du document A4 ou de la slide 16:9 à droite. Zéro navigation aveugle, visualisation instantanée.'}
                </p>
              </div>

              <div
                className={`p-4 rounded-2xl border ${
                  isDark
                    ? 'bg-slate-900/80 border-slate-800'
                    : 'bg-white border-sky-200'
                } space-y-2`}
              >
                <div className="w-8 h-8 rounded-lg bg-sky-100 dark:bg-slate-800 text-[#0284c7] dark:text-[#90D5FF] flex items-center justify-center font-black">
                  <Sparkles className="w-4 h-4" />
                </div>
                <h4
                  className={`text-xs font-black uppercase tracking-wide ${
                    isDark ? 'text-white' : 'text-slate-900'
                  }`}
                >
                  {isEn ? '2. Instant 1-Click Tab Sync' : '2. Synchronisation 1-Clic avec les Onglets'}
                </h4>
                <p className={`text-xs leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                  {isEn
                    ? 'The « Sync with tabs » button automatically injects real-time data from Dossiers, Planning, Tracking, RACI, Categories, PERT, and Kanban. You never retype project data twice.'
                    : 'Le bouton « Synchroniser avec les onglets » réinjecte automatiquement en temps réel les données de Dossiers, Planification, Suivi, RACI, Catégories, PERT et Kanban. Aucune double saisie manuelle.'}
                </p>
              </div>

              <div
                className={`p-4 rounded-2xl border ${
                  isDark
                    ? 'bg-slate-900/80 border-slate-800'
                    : 'bg-white border-sky-200'
                } space-y-2`}
              >
                <div className="w-8 h-8 rounded-lg bg-sky-100 dark:bg-slate-800 text-[#0284c7] dark:text-[#90D5FF] flex items-center justify-center font-black">
                  <FileDown className="w-4 h-4" />
                </div>
                <h4
                  className={`text-xs font-black uppercase tracking-wide ${
                    isDark ? 'text-white' : 'text-slate-900'
                  }`}
                >
                  {isEn ? '3. Pure White `#FFFFFF` PDF Ready' : '3. Export PDF & Impression Fond Blanc Pur'}
                </h4>
                <p className={`text-xs leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                  {isEn
                    ? 'Single-click PDF generation on pure white background, compliant with donor standards, ready for physical stamp, signature, and distribution to Steering Committees and partners.'
                    : 'Édition PDF et impression directe en 1 clic sur fond blanc pur `#FFFFFF` normé bailleurs, prêt pour apposition de cachets, signatures officielles et comités de pilotage.'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 4: PUBLICS CIBLES & CAS D'USAGE MÉTIER (ÉTUDIANTS, CHEFS DE PROJETS, CHEFS DE DÉPARTEMENT) */}
      <section
        id="section-cibles"
        className={`scroll-mt-28 sm:scroll-mt-32 py-10 sm:py-16 border-b ${
          isDark
            ? 'bg-slate-900/60 border-slate-800'
            : 'bg-sky-50/50 border-[#90D5FF]/50'
        }`}
      >
        <div className="max-w-7xl mx-auto px-3 sm:px-6 space-y-10">
          <div className="max-w-3xl space-y-2 scroll-reveal-left">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#0c4a6e] text-[#90D5FF] text-[10px] sm:text-[11px] font-black uppercase tracking-widest">
              <Users className="w-3.5 h-3.5" />
              <span>{isEn ? 'Target Audiences & Business Impact' : 'Publics Cibles & Cas d’Usage Métier'}</span>
            </div>
            <h2
              className={`text-xl sm:text-3xl lg:text-4xl font-black ${
                isDark ? 'text-white' : 'text-slate-900'
              }`}
            >
              {isEn
                ? 'Who is faab gar designed for and why is it essential?'
                : 'À qui s’adresse faab gar et pourquoi est-il indispensable ?'}
            </h2>
            <p className={`text-xs sm:text-sm leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
              {isEn
                ? 'From university lecture halls to international donor steering committees, faab gar empowers individuals and organizations with professional-grade project engineering and operational agility.'
                : 'Des amphithéâtres universitaires jusqu’aux comités de pilotage des bailleurs internationaux, faab gar apporte une rigueur d’ingénierie et une agilité opérationnelle adaptées à chaque profil.'}
            </p>
          </div>

          {/* Grille des 3 grands profils cibles */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* 1. ÉTUDIANTS, DOCTORANTS & ENSEIGNANTS */}
            <div
              className={`p-6 rounded-3xl border-2 scroll-reveal-left flex flex-col justify-between gap-4 shadow-sm ${
                isDark
                  ? 'bg-slate-900 border-[#90D5FF]/60'
                  : 'bg-white border-[#0284c7]'
              }`}
            >
              <div className="space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#0c4a6e] to-[#0284c7] text-[#90D5FF] flex items-center justify-center shadow-sm">
                  <GraduationCap className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-[10px] font-mono font-black uppercase text-[#0284c7] tracking-wider">
                    {isEn ? 'ACADEMIA & CAREER BOOST' : 'UNIVERSITÉS & INSERTION PRO'}
                  </span>
                  <h3 className={`text-base sm:text-lg font-black ${isDark ? 'text-white' : 'text-[#0c4a6e]'}`}>
                    {isEn
                      ? 'Students, PhD Candidates & Future Managers'
                      : 'Étudiants, Doctorants & Futurs Managers'}
                  </h3>
                </div>
                <div className="space-y-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                  <p className="font-bold text-[#0c4a6e] dark:text-[#90D5FF]">
                    {isEn
                      ? 'Why is faab gar a game changer for students?'
                      : 'Pourquoi faab gar est un tremplin décisif pour les étudiants ?'}
                  </p>
                  <ul className="space-y-1.5 text-[11.5px]">
                    <li className="flex items-start gap-2">
                      <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                      <span>
                        <strong>{isEn ? 'Hands-on Mastery:' : 'Apprentissage pratique immédiat :'}</strong>{' '}
                        {isEn
                          ? 'Concrete practice of RBM results chains, PERT/CPM critical paths, WBS and RACI matrices without expensive corporate software.'
                          : 'Maîtrise concrète de la GAR, du réseau PERT, du chemin critique, du WBS et du RACI sans logiciels coûteux.'}
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                      <span>
                        <strong>{isEn ? 'Job Insertion & Internships:' : 'Tremplin d’insertion professionnelle :'}</strong>{' '}
                        {isEn
                          ? 'Generate 2 international donor-grade CV models (1-page Executive & 2-4 page Detailed), professional Business Cards, and Badges with vCard QR Code for networking.'
                          : 'Génération de 2 modèles de CVs certifiés bailleurs (Exécutif 1 page & Détaillé 2-4 pages), Cartes de Visite et Badges avec QR Code vCard.'}
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                      <span>
                        <strong>{isEn ? 'Master Theses & Capstone Projects:' : 'Projets tutorés & Mémoires PFE :'}</strong>{' '}
                        {isEn
                          ? 'Instantly build professional reports (ToR, ProDoc, Evaluation Grids) to score top grades with real-world institutional standards.'
                          : 'Rapports normés clés en main (TDR, ProDoc, Grille OCDE) pour soutenir des mémoires et projets de fin d’études d’excellence.'}
                      </span>
                    </li>
                  </ul>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-sky-50 dark:bg-slate-800/80 text-[10.5px] font-bold text-[#0c4a6e] dark:text-[#90D5FF]">
                {isEn
                  ? 'Disciplines: Project Management, Economics, MBA, Civil Engineering, Public Health, IT, Agronomy.'
                  : 'Filières : Gestion de Projets, Économie, MBA, Ingénierie, Santé Publique, Informatique, Agronomie.'}
              </div>
            </div>

            {/* 2. CHEFS DE PROJETS & ÉQUIPES DE PLANIFICATION / PMO */}
            <div
              className={`p-6 rounded-3xl border-2 scroll-reveal-up flex flex-col justify-between gap-4 shadow-sm ${
                isDark
                  ? 'bg-slate-900 border-[#90D5FF]/60'
                  : 'bg-white border-[#0c4a6e]'
              }`}
            >
              <div className="space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#0c4a6e] to-[#0284c7] text-[#90D5FF] flex items-center justify-center shadow-sm">
                  <Briefcase className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-[10px] font-mono font-black uppercase text-[#0284c7] tracking-wider">
                    {isEn ? 'INSTITUTIONS & DONORS' : 'INSTITUTIONS & BAILLEURS'}
                  </span>
                  <h3 className={`text-base sm:text-lg font-black ${isDark ? 'text-white' : 'text-[#0c4a6e]'}`}>
                    {isEn
                      ? 'Project Managers & PMO Planning Teams'
                      : 'Chefs de Projets & Équipes de Planification / PMO'}
                  </h3>
                </div>
                <div className="space-y-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                  <p className="font-bold text-[#0c4a6e] dark:text-[#90D5FF]">
                    {isEn
                      ? 'Rigorous multi-year program engineering:'
                      : 'Rigueur absolue pour programmes multi-annuels :'}
                  </p>
                  <ul className="space-y-1.5 text-[11.5px]">
                    <li className="flex items-start gap-2">
                      <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                      <span>
                        <strong>{isEn ? 'Critical Path Control:' : 'Maîtrise du Chemin Critique :'}</strong>{' '}
                        {isEn
                          ? 'Dynamic CPM graph zoomable to 10%, automated calculation of free/total floats, and early bottleneck alerts.'
                          : 'Graphe CPM zoomable à 10%, calcul dynamique des marges et détection précoce des goulots d’étranglement.'}
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                      <span>
                        <strong>{isEn ? 'Automated Variance Audit:' : 'Audit automatique des écarts :'}</strong>{' '}
                        {isEn
                          ? 'Automatic start and finish variance calculation compared to today’s date, with physical and financial tracking.'
                          : 'Calcul instantané des écarts calendaires et budgétaires par rapport à la date du jour.'}
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                      <span>
                        <strong>{isEn ? 'Donor Reporting Standards:' : 'Conformité Bailleurs internationaux :'}</strong>{' '}
                        {isEn
                          ? 'Direct generation of ToR, ProDoc, AWPB, CAP Audits, Mid-Term and Final Evaluations compliant with World Bank, AfDB, EU, and UNDP.'
                          : 'Génération directe des TDR, ProDoc, PTBA, Rapports CAP et Évaluations conformes Banque Mondiale, BAD, UE, PNUD.'}
                      </span>
                    </li>
                  </ul>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-sky-50 dark:bg-slate-800/80 text-[10.5px] font-bold text-[#0c4a6e] dark:text-[#90D5FF]">
                {isEn
                  ? 'Beneficiaries: PMO Directors, Project Coordinators, M&E Officers, Planning Units.'
                  : 'Bénéficiaires : Directeurs de PMO, Coordonnateurs de Projets, Responsables S&E, Cellules de Planification.'}
              </div>
            </div>

            {/* 3. CHEFS DE DÉPARTEMENT, SERVICES & DIRECTEURS OPÉRATIONNELS */}
            <div
              className={`p-6 rounded-3xl border-2 scroll-reveal-right flex flex-col justify-between gap-4 shadow-sm ${
                isDark
                  ? 'bg-slate-900 border-[#90D5FF]/60'
                  : 'bg-white border-[#0284c7]'
              }`}
            >
              <div className="space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#0c4a6e] to-[#0284c7] text-[#90D5FF] flex items-center justify-center shadow-sm">
                  <Building2 className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-[10px] font-mono font-black uppercase text-[#0284c7] tracking-wider">
                    {isEn ? 'CORPORATE & PUBLIC SECTOR' : 'SERVICES & DIRECTIONS OPÉRATIONNELLES'}
                  </span>
                  <h3 className={`text-base sm:text-lg font-black ${isDark ? 'text-white' : 'text-[#0c4a6e]'}`}>
                    {isEn
                      ? 'Department Heads & Service Managers'
                      : 'Chefs de Département & Chefs de Service'}
                  </h3>
                </div>
                <div className="space-y-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                  <p className="font-bold text-[#0c4a6e] dark:text-[#90D5FF]">
                    {isEn
                      ? 'Why is faab gar powerful beyond institutional projects?'
                      : 'Pourquoi l’application est bénéfique pour piloter tout service ?'}
                  </p>
                  <ul className="space-y-1.5 text-[11.5px]">
                    <li className="flex items-start gap-2">
                      <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                      <span>
                        <strong>{isEn ? 'Service Action Plans:' : 'Plans d’action de service :'}</strong>{' '}
                        {isEn
                          ? 'Track 90-day operational priorities (QWP) and annual service roadmaps (AWPB) with clear task distribution.'
                          : 'Pilotage des priorités opérationnelles à 90 jours (PTT) et des feuilles de route annuelles de département (PTBA).'}
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                      <span>
                        <strong>{isEn ? 'Role Accountability (RACI):' : 'Responsabilisation d’équipe (RACI) :'}</strong>{' '}
                        {isEn
                          ? 'End ambiguous responsibilities: assign who executes (R), who approves (A), who is consulted (C), and who is informed (I).'
                          : 'Fin des ambiguïtés : définition limpide de qui exécute (R), qui valide (A), qui est consulté (C) et informé (I).'}
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                      <span>
                        <strong>{isEn ? 'Governance & Decisions:' : 'Gouvernance & arbitrage rapide :'}</strong>{' '}
                        {isEn
                          ? 'Produce formal meeting minutes (Minutes / Decisions), official administrative letters, and slide presentations in minutes.'
                          : 'Édition immédiate de procès-verbaux officiels (PV), courriers administratifs et présentations slides pour la Direction.'}
                      </span>
                    </li>
                  </ul>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-sky-50 dark:bg-slate-800/80 text-[10.5px] font-bold text-[#0c4a6e] dark:text-[#90D5FF]">
                {isEn
                  ? 'Roles: Operational Directors, HR Managers, Finance Directors, Technical Leads, Public Officers.'
                  : 'Rôles : Directeurs Opérationnels, DRH, DAF, Directeurs Techniques, Cadres de l’Administration.'}
              </div>
            </div>
          </div>

          {/* Domaines d'activité cités concrètement */}
          <div className="space-y-4 pt-4">
            <div className="border-b border-[#90D5FF]/40 dark:border-slate-800 pb-2 scroll-reveal-left">
              <h3 className={`text-sm sm:text-base font-black uppercase tracking-wider ${isDark ? 'text-white' : 'text-[#0c4a6e]'}`}>
                {isEn ? 'Key Business Sectors & Fields of Application' : '8 Domaines d’Activité Concrets d’Application'}
              </h3>
              <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                {isEn
                  ? 'faab gar adapts natively to all professional sectors requiring structured planning, resource allocation, and audited outputs:'
                  : 'faab gar s’adapte nativement à tous les secteurs professionnels nécessitant planification, suivi et livrables normés :'}
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                {
                  icon: Building2,
                  name: isEn ? 'Public Administration & Municipalities' : 'Administration Publique & Collectivités',
                  detail: isEn ? 'PIP investment plans, administrative reforms, state budgets' : 'Plans d’investissement PIP, réformes étatiques, budgets décentralisés'
                },
                {
                  icon: Stethoscope,
                  name: isEn ? 'Healthcare & Hospital Sector' : 'Santé & Secteur Hospitalier',
                  detail: isEn ? 'Health master plans, supply chains, medical audit campaigns' : 'Programmes sanitaires, chaîne d’approvisionnement, audits hospitaliers'
                },
                {
                  icon: HardHat,
                  name: isEn ? 'Construction, Civil Engineering & Infra' : 'BTP, Génie Civil & Infrastructures',
                  detail: isEn ? 'Site works, CPM milestones, contractor RACI oversight' : 'Chantiers d’envergure, jalons critiques, suivi sous-traitants et réceptions'
                },
                {
                  icon: Cpu,
                  name: isEn ? 'IT, Telecoms & Digital Systems' : 'Technologies, SI & Télécoms (IT)',
                  detail: isEn ? 'ERP deployment, software sprints, cyber audits, deliverables' : 'Déploiement ERP, transformation digitale, cybersécurité, livrables'
                },
                {
                  icon: Sprout,
                  name: isEn ? 'Agribusiness, Forestry & Rural Dev.' : 'Agro-industrie, Forêt & Dév. Rural',
                  detail: isEn ? 'Value chains, climate resilience, cooperative programs' : 'Filières agricoles, agroforesterie, résilience climatique, coopératives'
                },
                {
                  icon: Landmark,
                  name: isEn ? 'Banking, Finance & Microfinance' : 'Banque, Finance & Microfinance',
                  detail: isEn ? 'Regulatory compliance, Basel audits, financial inclusion' : 'Conformité réglementaire, audits Bâle, lancements de produits financiers'
                },
                {
                  icon: GraduationCap,
                  name: isEn ? 'Higher Education & Research' : 'Éducation & Enseignement Supérieur',
                  detail: isEn ? 'Degree accreditation, research labs, student projects' : 'Accréditation académique, programmes de recherche, projets tutorés'
                },
                {
                  icon: TrendingUp,
                  name: isEn ? 'Commerce, Industry & Supply Chain' : 'Commerce, Industrie & Logistique',
                  detail: isEn ? 'Industrial maintenance, supply chain optimization, ISO' : 'Maintenance d’usines, optimisation logistique, conformité ISO'
                }
              ].map((sec, idx) => {
                const Icon = sec.icon;
                return (
                  <div
                    key={idx}
                    className={`p-3.5 rounded-2xl border transition shadow-2xs ${
                      isDark
                        ? 'bg-slate-900 border-slate-800'
                        : 'bg-white border-[#90D5FF]/60'
                    }`}
                  >
                    <div className="w-8 h-8 rounded-lg bg-[#90D5FF]/30 text-[#0c4a6e] dark:text-[#90D5FF] flex items-center justify-center mb-2">
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className={`text-xs font-black leading-tight ${isDark ? 'text-white' : 'text-[#0c4a6e]'}`}>
                      {sec.name}
                    </div>
                    <div className={`text-[10px] mt-1 leading-snug ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                      {sec.detail}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 5: OFFRES COMMERCIALES (CLASSIQUE, ÉTUDIANTE, PMO, INSTITUTION) */}
      <section
        id="section-offres"
        className="scroll-mt-28 sm:scroll-mt-32 py-10 sm:py-16 border-b border-[#90D5FF]/40 dark:border-slate-800"
      >
        <div className="max-w-7xl mx-auto px-3 sm:px-6 space-y-10">
          <div className="max-w-3xl space-y-2 scroll-reveal-left">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#0c4a6e] text-[#90D5FF] text-[10px] sm:text-[11px] font-black uppercase tracking-widest">
              <Award className="w-3.5 h-3.5" />
              <span>{isEn ? 'Pricing & Service Packages' : 'Offres Commerciales & Formules'}</span>
            </div>
            <h2
              className={`text-xl sm:text-3xl lg:text-4xl font-black ${
                isDark ? 'text-white' : 'text-slate-900'
              }`}
            >
              {isEn
                ? 'Flexible solutions adapted to every scale of ambition'
                : 'Des formules adaptées à chaque échelle d’ambition'}
            </h2>
            <p className={`text-xs sm:text-sm leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
              {isEn
                ? 'Choose the commercial package tailored to your exact profile, from academic initiation to full-scale institutional deployment:'
                : 'Choisissez la formule commerciale adaptée à votre profil, de l’initiation académique jusqu’au déploiement ministériel :'}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* 1. OFFRE ÉTUDIANTE */}
            <div
              className={`p-6 rounded-3xl border-2 scroll-reveal-left flex flex-col justify-between gap-5 shadow-sm transition hover:scale-[1.02] ${
                isDark
                  ? 'bg-slate-900 border-sky-600/70'
                  : 'bg-white border-[#0284c7]'
              }`}
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="px-2.5 py-1 rounded-lg bg-sky-100 text-[#0c4a6e] dark:bg-slate-800 dark:text-[#90D5FF] text-[10px] font-mono font-black uppercase">
                    {isEn ? 'STUDENT & ACADEMIC' : 'ÉTUDIANTS & CHERCHEURS'}
                  </span>
                  <GraduationCap className="w-5 h-5 text-[#0284c7]" />
                </div>
                <div>
                  <h3 className={`text-lg font-black ${isDark ? 'text-white' : 'text-[#0c4a6e]'}`}>
                    {isEn ? 'Student Package' : 'Offre Étudiante'}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    {isEn
                      ? 'Solidarity rate for students, interns, and young graduates.'
                      : 'Tarif solidaire accessible aux étudiants, stagiaires et doctorants.'}
                  </p>
                </div>
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2 text-xs">
                  <div className="font-extrabold text-[11px] text-[#0c4a6e] dark:text-[#90D5FF] uppercase">
                    {isEn ? 'Included Features:' : 'Inclus dans la formule :'}
                  </div>
                  <ul className="space-y-1.5 text-slate-600 dark:text-slate-300 text-[11.5px]">
                    <li className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      <span>{isEn ? 'All methodology modules (GAR, PERT, RACI)' : 'Tous les modules méthodologiques (GAR, PERT, RACI)'}</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      <span>{isEn ? '2 Donor-compliant CVs + Business Card + Badge' : '2 Modèles de CVs Bailleurs + Carte + Badge 54×86mm'}</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      <span>{isEn ? 'Full A4 Document & Slides Generator' : 'Générateur de documents A4 & Slides de soutenance'}</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      <span>{isEn ? 'Local IndexedDB & JSON sovereign backup' : 'Sauvegarde locale souveraine IndexedDB & JSON'}</span>
                    </li>
                  </ul>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 text-center">
                <span className="text-[11px] font-black text-[#0284c7] uppercase tracking-wider">
                  {isEn ? 'Academic License' : 'Licence Académique'}
                </span>
              </div>
            </div>

            {/* 2. OFFRE CLASSIQUE */}
            <div
              className={`p-6 rounded-3xl border-2 scroll-reveal-up flex flex-col justify-between gap-5 shadow-sm transition hover:scale-[1.02] ${
                isDark
                  ? 'bg-slate-900 border-[#90D5FF]/60'
                  : 'bg-white border-[#90D5FF]'
              }`}
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="px-2.5 py-1 rounded-lg bg-sky-100 text-[#0c4a6e] dark:bg-slate-800 dark:text-[#90D5FF] text-[10px] font-mono font-black uppercase">
                    {isEn ? 'PRO & FREELANCE' : 'PROFESSIONNELS & PME'}
                  </span>
                  <User className="w-5 h-5 text-[#0284c7]" />
                </div>
                <div>
                  <h3 className={`text-lg font-black ${isDark ? 'text-white' : 'text-[#0c4a6e]'}`}>
                    {isEn ? 'Classic Package' : 'Offre Classique'}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    {isEn
                      ? 'For independent consultants, expert advisors, and service heads.'
                      : 'Pour consultants indépendants, experts, PME et chefs de service.'}
                  </p>
                </div>
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2 text-xs">
                  <div className="font-extrabold text-[11px] text-[#0c4a6e] dark:text-[#90D5FF] uppercase">
                    {isEn ? 'Included Features:' : 'Inclus dans la formule :'}
                  </div>
                  <ul className="space-y-1.5 text-slate-600 dark:text-slate-300 text-[11.5px]">
                    <li className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      <span>{isEn ? 'Unlimited multi-dossier management' : 'Gestion multi-dossiers et multi-axes illimitée'}</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      <span>{isEn ? 'Multi-scale Gantt + Interactive Kanban board' : 'Diagramme de Gantt multi-échelles + Tableau Kanban'}</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      <span>{isEn ? 'Full export of 22 documents & 10 matrices' : 'Export complet des 22 documents & 10 matrices'}</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      <span>{isEn ? 'Automated CSV Import / Export engine' : 'Moteur d’importation et d’exportation CSV'}</span>
                    </li>
                  </ul>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 text-center">
                <span className="text-[11px] font-black text-[#0c4a6e] dark:text-[#90D5FF] uppercase tracking-wider">
                  {isEn ? 'Professional License' : 'Licence Professionnelle'}
                </span>
              </div>
            </div>

            {/* 3. OFFRE PMO */}
            <div
              className={`p-6 rounded-3xl border-2 scroll-reveal-up flex flex-col justify-between gap-5 shadow-md relative transition hover:scale-[1.02] ${
                isDark
                  ? 'bg-slate-900 border-[#90D5FF]'
                  : 'bg-gradient-to-b from-white to-sky-50 border-[#0c4a6e]'
              }`}
            >
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-[#0c4a6e] text-[#90D5FF] text-[9px] font-black uppercase tracking-wider border border-[#90D5FF]">
                {isEn ? 'MOST POPULAR PMO' : 'RECOMMANDÉ PMO'}
              </div>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="px-2.5 py-1 rounded-lg bg-[#0c4a6e] text-[#90D5FF] text-[10px] font-mono font-black uppercase">
                    {isEn ? 'PMO & PLANNING UNITS' : 'BUREAU DE GESTION (PMO)'}
                  </span>
                  <Network className="w-5 h-5 text-[#0284c7]" />
                </div>
                <div>
                  <h3 className={`text-lg font-black ${isDark ? 'text-white' : 'text-[#0c4a6e]'}`}>
                    {isEn ? 'PMO Package' : 'Offre PMO'}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    {isEn
                      ? 'For Project Management Offices, planning directors, and consulting firms.'
                      : 'Pour bureaux PMO, directions de la planification et cabinets de conseil.'}
                  </p>
                </div>
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2 text-xs">
                  <div className="font-extrabold text-[11px] text-[#0c4a6e] dark:text-[#90D5FF] uppercase">
                    {isEn ? 'Included Features:' : 'Inclus dans la formule :'}
                  </div>
                  <ul className="space-y-1.5 text-slate-600 dark:text-slate-300 text-[11.5px]">
                    <li className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      <span>{isEn ? 'Consolidation of Master Matrices M1 to M10' : 'Consolidation des 10 Matrices Maîtresses M1 à M10'}</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      <span>{isEn ? '5-Category Stakeholder mapping & authorizations' : 'Habilitations et gestion des 5 catégories d’acteurs'}</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      <span>{isEn ? 'Executive CAP Audits & M&E Steering Protocols' : 'Audits de performance CAP et protocoles S&E complets'}</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      <span>{isEn ? 'Dedicated priority methodology support' : 'Support méthodologique et assistance PMO prioritaire'}</span>
                    </li>
                  </ul>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 text-center">
                <span className="text-[11px] font-black text-[#0c4a6e] dark:text-[#90D5FF] uppercase tracking-wider">
                  {isEn ? 'PMO & Multi-Project License' : 'Licence PMO & Multi-Programmes'}
                </span>
              </div>
            </div>

            {/* 4. OFFRE INSTITUTION */}
            <div
              className={`p-6 rounded-3xl border-2 scroll-reveal-right flex flex-col justify-between gap-5 shadow-sm transition hover:scale-[1.02] ${
                isDark
                  ? 'bg-slate-900 border-[#90D5FF]'
                  : 'bg-white border-[#0284c7]'
              }`}
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 text-[10px] font-mono font-black uppercase">
                    {isEn ? 'MINISTRIES & DONORS' : 'MINISTÈRES & BAILLEURS'}
                  </span>
                  <Building2 className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <h3 className={`text-lg font-black ${isDark ? 'text-white' : 'text-[#0c4a6e]'}`}>
                    {isEn ? 'Institution Package' : 'Offre Institution'}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    {isEn
                      ? 'For ministries, state agencies, development banks, and UN agencies.'
                      : 'Pour ministères, agences d’État, banques de développement et ONG.'}
                  </p>
                </div>
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2 text-xs">
                  <div className="font-extrabold text-[11px] text-[#0c4a6e] dark:text-[#90D5FF] uppercase">
                    {isEn ? 'Included Features:' : 'Inclus dans la formule :'}
                  </div>
                  <ul className="space-y-1.5 text-slate-600 dark:text-slate-300 text-[11.5px]">
                    <li className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      <span>{isEn ? 'Enterprise-wide deployment & custom branding' : 'Déploiement institutionnel & personnalisation aux armoiries'}</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      <span>{isEn ? 'Custom donor matrix alignment (WB, AfDB, EU)' : 'Adaptation aux canevas spécifiques des bailleurs'}</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      <span>{isEn ? 'Executive training workshops & certification' : 'Ateliers de formation certifiants pour équipes dirigeantes'}</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      <span>{isEn ? 'Dedicated advisory & governance coaching' : 'Coaching stratégique et accompagnement sur mesure'}</span>
                    </li>
                  </ul>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 text-center">
                <span className="text-[11px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
                  {isEn ? 'Institutional Agreement' : 'Convention Institutionnelle'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 6: LES 4 PILIERS METHODOLOGIQUES ET LES 4 ICONES D'ACTION */}
      <section
        id="section-methodologie"
        className="scroll-mt-28 sm:scroll-mt-32 py-10 sm:py-14 border-b border-[#90D5FF]/40 dark:border-slate-800"
      >
        <div className="max-w-7xl mx-auto px-2 sm:px-4 space-y-10">
          <div className="max-w-3xl scroll-reveal-right">
            <div className="text-xs font-extrabold uppercase tracking-widest text-[#0284c7]">
              {isEn ? 'Methodological Engineering' : 'Ingénierie Méthodologique'}
            </div>
            <h2
              className={`text-xl sm:text-3xl font-black mt-1 ${
                isDark ? 'text-white' : 'text-slate-900'
              }`}
            >
              {t.home.pillarsTitle}
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {[
              {
                title: t.home.pillar1Title,
                desc: t.home.pillar1Desc,
                icon: Calendar,
                dir: 'left'
              },
              {
                title: t.home.pillar2Title,
                desc: t.home.pillar2Desc,
                icon: Network,
                dir: 'left'
              },
              {
                title: t.home.pillar3Title,
                desc: t.home.pillar3Desc,
                icon: Kanban,
                dir: 'right'
              },
              {
                title: t.home.pillar4Title,
                desc: t.home.pillar4Desc,
                icon: FileCheck2,
                dir: 'right'
              }
            ].map((pillar, i) => {
              const Icon = pillar.icon;
              return (
                <div
                  key={i}
                  className={`${
                    pillar.dir === 'left'
                      ? 'scroll-reveal-left'
                      : 'scroll-reveal-right'
                  } p-5 rounded-2xl border transition shadow-xs ${
                    isDark
                      ? 'bg-slate-900 border-slate-800'
                      : 'bg-[#FFFFFF] border-[#90D5FF]/70'
                  }`}
                >
                  <div className="w-10 h-10 rounded-xl bg-[#90D5FF] text-slate-950 flex items-center justify-center mb-4 shadow-xs">
                    <Icon className="w-5 h-5" />
                  </div>
                  <h4
                    className={`text-sm font-black mb-2 ${
                      isDark ? 'text-white' : 'text-slate-900'
                    }`}
                  >
                    {pillar.title}
                  </h4>
                  <p
                    className={`text-xs leading-relaxed ${
                      isDark ? 'text-slate-300' : 'text-slate-600'
                    }`}
                  >
                    {pillar.desc}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Explication des 4 icônes supérieures du menu déroulant */}
          <div
            className={`p-6 rounded-2xl border scroll-reveal-up ${
              isDark
                ? 'bg-slate-900 border-slate-800'
                : 'bg-sky-50/40 border-[#90D5FF]'
            }`}
          >
            <h3
              className={`text-sm sm:text-base font-black mb-4 ${
                isDark ? 'text-[#90D5FF]' : 'text-[#0c4a6e]'
              }`}
            >
              {isEn
                ? 'How the 4 Quick Action Icons Work (at the top of the Slide-Out Menu ☰)'
                : 'Fonctionnement des 4 Icônes d’Action Rapide (en haut du Menu Déroulant ☰)'}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
              <div
                className={`p-3.5 rounded-xl border scroll-reveal-left ${
                  isDark
                    ? 'bg-slate-800 border-slate-700'
                    : 'bg-white border-slate-200'
                }`}
              >
                <div className="flex items-center gap-2 font-black text-[#0284c7] mb-1">
                  <Download className="w-4 h-4" />
                  <span>{isEn ? '1. Import JSON' : '1. Importer JSON'}</span>
                </div>
                <p className={isDark ? 'text-slate-300' : 'text-slate-600'}>
                  {isEn
                    ? 'Load an existing `.json` backup file from your computer or phone to restore all your portfolios.'
                    : 'Chargez un fichier de sauvegarde `.json` existant depuis votre ordinateur ou téléphone pour restaurer tous vos dossiers.'}
                </p>
              </div>
              <div
                className={`p-3.5 rounded-xl border scroll-reveal-left ${
                  isDark
                    ? 'bg-slate-800 border-slate-700'
                    : 'bg-white border-slate-200'
                }`}
              >
                <div className="flex items-center gap-2 font-black text-[#0284c7] mb-1">
                  <Save className="w-4 h-4" />
                  <span>
                    {isEn ? '2. Save / Overwrite JSON' : '2. Enregistrer / Mettre à jour JSON'}
                  </span>
                </div>
                <p className={isDark ? 'text-slate-300' : 'text-slate-600'}>
                  {isEn
                    ? 'Directly overwrites and updates your local `.json` file without creating multiple duplicate files.'
                    : 'Écrase et met à jour directement votre fichier `.json` local sans créer de doublons multiples.'}
                </p>
              </div>
              <div
                className={`p-3.5 rounded-xl border scroll-reveal-right ${
                  isDark
                    ? 'bg-slate-800 border-slate-700'
                    : 'bg-white border-slate-200'
                }`}
              >
                <div className="flex items-center gap-2 font-black text-[#0284c7] mb-1">
                  <Upload className="w-4 h-4" />
                  <span>
                    {isEn ? '3. Export JSON Copy' : '3. Exporter une copie JSON'}
                  </span>
                </div>
                <p className={isDark ? 'text-slate-300' : 'text-slate-600'}>
                  {isEn
                    ? 'Generates a new dated `.json` archive to snapshot a milestone or share with a colleague.'
                    : 'Génère une nouvelle archive `.json` datée pour archiver une étape clé ou la transmettre à un collaborateur.'}
                </p>
              </div>
              <div
                className={`p-3.5 rounded-xl border scroll-reveal-right ${
                  isDark
                    ? 'bg-slate-800 border-slate-700'
                    : 'bg-white border-slate-200'
                }`}
              >
                <div className="flex items-center gap-2 font-black text-[#0284c7] mb-1">
                  <Printer className="w-4 h-4" />
                  <span>
                    {isEn ? '4. Download PDF Report' : '4. Télécharger le Rapport PDF'}
                  </span>
                </div>
                <p className={isDark ? 'text-slate-300' : 'text-slate-600'}>
                  {isEn
                    ? 'Instantly publishes the multi-page Technical Sheet & Executive Summary in A4 format on pure white `#FFFFFF` background.'
                    : 'Édite instantanément la Fiche Technique & Résumé Exécutif multi-pages au format A4 sur fond blanc pur `#FFFFFF`.'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 5: GUIDE DE SAUVEGARDE JSON & PERSISTANCE INDEXEDDB */}
      <section
        id="section-sauvegarde"
        className="scroll-mt-28 sm:scroll-mt-32 py-10 sm:py-14 border-b border-[#90D5FF]/40 dark:border-slate-800"
      >
        <div className="max-w-7xl mx-auto px-2 sm:px-4">
          <div
            className={`p-6 sm:p-8 rounded-3xl border-2 scroll-reveal-right ${
              isDark
                ? 'bg-slate-900 border-[#90D5FF]/40'
                : 'bg-[#90D5FF]/15 border-[#90D5FF]'
            }`}
          >
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-[#90D5FF]/50 dark:border-slate-800">
              <div>
                <div className="text-xs font-extrabold uppercase tracking-widest text-[#0284c7]">
                  {isEn
                    ? 'Hybrid IndexedDB & File System Access Persistence'
                    : 'Persistance Hybride IndexedDB & File System Access'}
                </div>
                <h2
                  className={`text-xl sm:text-2xl font-black mt-1 ${
                    isDark ? 'text-white' : 'text-slate-900'
                  }`}
                >
                  {t.home.backupTitle}
                </h2>
                <p
                  className={`text-xs sm:text-sm mt-1 font-medium ${
                    isDark ? 'text-slate-300' : 'text-slate-700'
                  }`}
                >
                  {t.home.backupSubtitle}
                </p>
              </div>
              <div className="flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-[#0c4a6e] text-white text-xs font-bold shrink-0">
                <Save className="w-4 h-4 text-[#90D5FF]" />
                <span>
                  {isEn
                    ? `Active local database: ${lastJsonFileName}`
                    : `Base locale active : ${lastJsonFileName}`}
                </span>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              <div
                className={`lg:col-span-5 p-5 rounded-2xl border scroll-reveal-left ${
                  isDark
                    ? 'bg-slate-800/80 border-slate-700'
                    : 'bg-white border-[#90D5FF]'
                }`}
              >
                <h3 className="text-sm font-black text-[#0284c7] flex items-center gap-2 mb-2">
                  <HardDrive className="w-4 h-4" />
                  <span>{t.home.backupHowTitle}</span>
                </h3>
                <p
                  className={`text-xs leading-relaxed ${
                    isDark ? 'text-slate-200' : 'text-slate-700'
                  }`}
                >
                  {t.home.backupHowDesc}
                </p>
              </div>

              <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                  {
                    title: t.home.backupWhy1Title,
                    desc: t.home.backupWhy1Desc,
                    dir: 'right'
                  },
                  {
                    title: t.home.backupWhy2Title,
                    desc: t.home.backupWhy2Desc,
                    dir: 'left'
                  },
                  {
                    title: t.home.backupWhy3Title,
                    desc: t.home.backupWhy3Desc,
                    dir: 'right'
                  }
                ].map((w, idx) => (
                  <div
                    key={idx}
                    className={`${
                      w.dir === 'left'
                        ? 'scroll-reveal-left'
                        : 'scroll-reveal-right'
                    } p-4 rounded-2xl border ${
                      isDark
                        ? 'bg-slate-800/50 border-slate-700'
                        : 'bg-white border-slate-200'
                    }`}
                  >
                    <h4
                      className={`text-xs font-black mb-1.5 ${
                        isDark ? 'text-[#90D5FF]' : 'text-[#0c4a6e]'
                      }`}
                    >
                      {w.title}
                    </h4>
                    <p
                      className={`text-[11px] leading-relaxed ${
                        isDark ? 'text-slate-300' : 'text-slate-600'
                      }`}
                    >
                      {w.desc}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 6: CREDITS D'INGENIERIE & CONTRAT DE CONFIDENTIALITE / PROPRIETE INTELLECTUELLE */}
      <section
        id="section-credits"
        className="scroll-mt-28 sm:scroll-mt-32 py-10 sm:py-14"
      >
        <div className="max-w-7xl mx-auto px-2 sm:px-4 grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div
            className={`lg:col-span-5 p-6 rounded-2xl border scroll-reveal-left ${
              isDark
                ? 'bg-slate-900 border-slate-800'
                : 'bg-white border-[#90D5FF]'
            }`}
          >
            <div className="flex items-center space-x-3 mb-4">
              <div className="p-2.5 rounded-xl bg-[#90D5FF] text-slate-950">
                <Award className="w-5 h-5" />
              </div>
              <div>
                <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#0284c7]">
                  {t.home.creditsTitle}
                </div>
                <h3
                  className={`text-base font-black ${
                    isDark ? 'text-white' : 'text-slate-900'
                  }`}
                >
                  KOFFIE FABIEN MICHAEL
                </h3>
              </div>
            </div>
            <div
              className={`space-y-2 text-xs ${
                isDark ? 'text-slate-300' : 'text-slate-700'
              }`}
            >
              <p>
                <strong className="font-bold">{t.home.creatorLabel} :</strong>{' '}
                KOFFIE FABIEN MICHAEL
              </p>
              <p>
                <strong className="font-bold">Email :</strong>{' '}
                <span className="font-mono text-[#0284c7] font-semibold">
                  fabien.frikupgeneration@gmail.com
                </span>
              </p>
              <p>
                <strong className="font-bold">
                  {isEn ? 'Contact / Phone:' : 'Contact / Téléphone :'}
                </strong>{' '}
                <span className="font-mono font-bold">00225 0748082739</span>
              </p>
            </div>
          </div>

          <div
            id="section-propriete"
            className={`lg:col-span-7 p-6 rounded-2xl border scroll-reveal-right ${
              isDark
                ? 'bg-slate-900 border-slate-800'
                : 'bg-sky-50/40 border-[#90D5FF]'
            }`}
          >
            <h3
              className={`text-sm font-black uppercase tracking-wider mb-2 flex items-center gap-2 ${
                isDark ? 'text-[#90D5FF]' : 'text-[#0c4a6e]'
              }`}
            >
              <ShieldCheck className="w-4 h-4" />
              <span>{t.home.legalTitle}</span>
            </h3>
            <p
              className={`text-xs leading-relaxed text-justify ${
                isDark ? 'text-slate-300' : 'text-slate-700'
              }`}
            >
              {t.home.legalText}
            </p>
          </div>
        </div>
      </section>
      </div>
    </div>
  );
};
