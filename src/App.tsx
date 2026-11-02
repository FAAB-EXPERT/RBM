import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  Suspense,
  lazy,
  startTransition
} from 'react';
import {
  Menu,
  X,
  Home,
  LayoutDashboard,
  GanttChart,
  Kanban,
  FileText,
  Download,
  Upload,
  Plus,
  Trash2,
  FolderOpen,
  Sun,
  Moon,
  User,
  CheckCircle2,
  AlertTriangle,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  RefreshCw,
  Printer,
  Filter,
  Target,
  Briefcase,
  Layers,
  Award,
  DollarSign,
  TrendingUp,
  HelpCircle,
  Network,
  Calendar,
  ListChecks,
  FileSpreadsheet,
  FileUp,
  FileDown,
  Save,
  Users,
  Globe,
  QrCode,
  ShieldCheck,
  GitBranch,
  Lightbulb,
  MapPin,
  Activity,
  ShieldAlert,
  PackageCheck,
  BookOpen
} from 'lucide-react';
import {
  CurrencyCode,
  LanguageCode,
  ThemeMode,
  UserProfile,
  Dossier,
  Axe,
  Project,
  Task,
  CustomDocsMap,
  CustomDocFields,
  InstitutionalDocType,
  CategorizedActor
} from './types';
import {
  defaultUserProfile,
  defaultCustomDocsData,
  initialDossiers,
  loadAppStateFromIDB,
  saveAppStateToIDB,
  setActiveUserStorageUid,
  ensureDossierCategorizedActors,
  renameActorInDossierTasks
} from './db';
import { translations, formatCurrency } from './i18n';
import { generateDirectWhitePDF } from './pdfExport';
import {
  saveProgramFile,
  initExportStorage,
  setActiveExportUserUid,
  pickFaabPlanFolder,
  downloadProgramFolderZip
} from './services/exportStorage';
import {
  STANDARD_PHASES,
  getTodayISO,
  computeTaskMetrics,
  recalculateProjectTasksOnKanbanMove,
  computeDossierPertSummary
} from './pertUtils';
import { AppLogo } from './components/AppLogo';
import { LandingPage } from './components/LandingPage';
import {
  UserProfileView,
  DossiersAndProjectsView
} from './components/UserProfileAndDossiersView';
import { resolveProgramRaciContext } from './docMatrices';
import {
  safeJsonParse,
  sanitizeCsvCellForExport,
  sanitizeCsvValueOnImport
} from './securityUtils';

// Chargement asynchrone code-splitté (Next.js / React 19 Suspense + Préchargement Idle) pour une fluidité maximale
const GanttAndTreeView = lazy(() =>
  import('./components/GanttAndTreeView').then(m => ({
    default: m.GanttAndTreeView
  }))
);
const FicheTechniquePages = lazy(() =>
  import('./components/FicheTechniquePages').then(m => ({
    default: m.FicheTechniquePages
  }))
);
const DocumentGeneratorView = lazy(() =>
  import('./components/DocumentGeneratorView').then(m => ({
    default: m.DocumentGeneratorView
  }))
);
const OperationalMatrices = lazy(() =>
  import('./components/OperationalMatrices').then(m => ({
    default: m.OperationalMatrices
  }))
);
const CategoriesActorsView = lazy(() =>
  import('./components/CategoriesActorsView').then(m => ({
    default: m.CategoriesActorsView
  }))
);
const QrBarcodeScannerModal = lazy(() =>
  import('./components/QrBarcodeScannerModal').then(m => ({
    default: m.QrBarcodeScannerModal
  }))
);
const InternalActorProfileModal = lazy(() =>
  import('./components/InternalActorProfileModal').then(m => ({
    default: m.InternalActorProfileModal
  }))
);
const SuperAdminDashboardView = lazy(() =>
  import('./components/SuperAdminDashboardView').then(m => ({
    default: m.SuperAdminDashboardView
  }))
);
const GarMethodologyViews = lazy(() =>
  import('./components/GarMethodologyViews').then(m => ({
    default: m.GarMethodologyViews
  }))
);
import { isGarTab } from './components/GarMethodologyViews';
import {
  auth,
  googleProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  FirebaseUser,
  isSuperAdminEmail,
  mapFirebaseSdkUser
} from './firebase';
import {
  syncFirebaseUserToRegistry,
  isSessionPinVerifiedForUser,
  setSessionPinVerifiedForUser
} from './services/superAdminService';
import {
  SuperAdminAuthModal,
  AuthModalStep
} from './components/SuperAdminAuthModal';
import { AuthStatusButton } from './components/AuthStatusButton';
import { FirebaseAuthHelpModal } from './components/FirebaseAuthHelpModal';

export function App() {
  const [isHydrated, setIsHydrated] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile>(defaultUserProfile);
  const [dossiers, setDossiers] = useState<Dossier[]>(initialDossiers);
  const [activeDossierId, setActiveDossierId] = useState<string>(
    initialDossiers[0].id
  );
  const [language, setLanguage] = useState<LanguageCode>('FR');
  const [currency, setCurrency] = useState<CurrencyCode>('FCFA');
  const [theme, setTheme] = useState<ThemeMode>('light');
  const [lastJsonFileName, setLastJsonFileName] = useState<string>(
    'faab_plan_sauvegarde.json'
  );
  const [activeTab, setActiveTab] = useState<string>('accueil');
  const [customDocsData, setCustomDocsData] =
    useState<CustomDocsMap>(defaultCustomDocsData);

  // Firebase Authentication, PIN Verification & Exclusive Role States
  const [authUser, setAuthUser] = useState<FirebaseUser | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState<boolean>(true);
  const [isSigningIn, setIsSigningIn] = useState<boolean>(false);
  const [isAuthHelpModalOpen, setIsAuthHelpModalOpen] = useState<boolean>(false);
  const [authErrorCode, setAuthErrorCode] = useState<string>('auth/unauthorized-domain');
  const [authErrorMessage, setAuthErrorMessage] = useState<string>('');
  const [isPinVerified, setIsPinVerified] = useState<boolean>(false);
  const [isSuperAdminAuthModalOpen, setIsSuperAdminAuthModalOpen] =
    useState<boolean>(false);
  const [superAdminAuthModalStep, setSuperAdminAuthModalStep] =
    useState<AuthModalStep>('pin_and_biometric');
  const [isDeviceLocked, setIsDeviceLocked] = useState<boolean>(false);

  // Slidebar & UI states
  const [isSlidebarOpen, setIsSlidebarOpen] = useState(false);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isGlobalScannerOpen, setIsGlobalScannerOpen] = useState(false);
  const [isCategoryProfileModalOpen, setIsCategoryProfileModalOpen] = useState(false);
  const [selectedCategoryActorName, setSelectedCategoryActorName] = useState<string>(
    defaultUserProfile.fullName
  );

  // Filters
  const [filterAxeId, setFilterAxeId] = useState<string>('ALL');
  const [filterProjectId, setFilterProjectId] = useState<string>('ALL');

  // PERT View & Zoom (down to 10% = 0.10)
  const [pertZoom, setPertZoom] = useState<number>(1);
  const [pertViewMode, setPertViewMode] = useState<'graph' | 'table'>('graph');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const csvPlanInputRef = useRef<HTMLInputElement>(null);
  const csvRaciInputRef = useRef<HTMLInputElement>(null);
  const fileHandleRef = useRef<any>(null);
  const [csvMenuOpen, setCsvMenuOpen] = useState<
    'slidebar-import' | 'slidebar-export' | 'header-import' | 'header-export' | null
  >(null);

  // Homepage section scroll-spy & horizontal centering in navbar
  const [activeHomeSection, setActiveHomeSection] = useState<string>(
    'section-presentation'
  );
  const homeNavScrollRef = useRef<HTMLDivElement>(null);
  const homeNavBtnRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    if (activeTab !== 'accueil') return;

    const sectionIds = [
      'section-presentation',
      'section-utilisation',
      'section-documents',
      'section-cibles',
      'section-offres',
      'section-methodologie',
      'section-sauvegarde',
      'section-credits'
    ];

    const detectActiveSection = () => {
      const scrollY = window.scrollY || window.pageYOffset;
      const viewportHeight = window.innerHeight;
      const docHeight = document.documentElement.scrollHeight;

      if (scrollY < 50) {
        setActiveHomeSection('section-presentation');
        return;
      }

      if (scrollY + viewportHeight >= docHeight - 40) {
        setActiveHomeSection('section-credits');
        return;
      }

      const readingLine = Math.min(200, viewportHeight * 0.28);
      let currentId = sectionIds[0];

      for (const id of sectionIds) {
        const el = document.getElementById(id);
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (rect.top <= readingLine) {
          currentId = id;
        }
      }

      setActiveHomeSection(currentId);
    };

    detectActiveSection();
    window.addEventListener('scroll', detectActiveSection, { passive: true });
    window.addEventListener('resize', detectActiveSection, { passive: true });
    return () => {
      window.removeEventListener('scroll', detectActiveSection);
      window.removeEventListener('resize', detectActiveSection);
    };
  }, [activeTab]);

  // Horizontally center the active section title in the navbar whenever activeHomeSection changes
  useEffect(() => {
    if (activeTab !== 'accueil') return;
    const navContainer = homeNavScrollRef.current;
    const activeBtn = homeNavBtnRefs.current[activeHomeSection];
    if (!navContainer || !activeBtn) return;

    const centerActiveButton = () => {
      const navRect = navContainer.getBoundingClientRect();
      const btnRect = activeBtn.getBoundingClientRect();
      const currentScrollLeft = navContainer.scrollLeft;
      const btnCenterInScroll =
        btnRect.left - navRect.left + currentScrollLeft + btnRect.width / 2;
      const targetScrollLeft = btnCenterInScroll - navContainer.clientWidth / 2;
      navContainer.scrollTo({
        left: Math.max(0, targetScrollLeft),
        behavior: 'smooth'
      });
    };

    const rafId = requestAnimationFrame(centerActiveButton);
    return () => cancelAnimationFrame(rafId);
  }, [activeHomeSection, activeTab, language]);

  // Hydrate isolated workspace from IndexedDB strictly for the authenticated Regular User (UID)
  // Neither other users nor the Super Administrator can access another user's programmes or profile.
  const [hydratedUid, setHydratedUid] = useState<string | null>(null);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    // If not authenticated or if Super Administrator, clear active storage UID and reset in-memory workspace
    if (!authUser || isSuperAdminEmail(authUser.email)) {
      setActiveUserStorageUid(null);
      setActiveExportUserUid(null);
      setHydratedUid(null);
      setUserProfile({ ...defaultUserProfile });
      setDossiers(JSON.parse(JSON.stringify(initialDossiers)));
      setActiveDossierId(initialDossiers[0].id);
      setCustomDocsData({ ...defaultCustomDocsData });
      return;
    }

    const currentUid = authUser.uid;
    setActiveUserStorageUid(currentUid);
    setActiveExportUserUid(currentUid);
    void initExportStorage();

    let cancelled = false;
    loadAppStateFromIDB(currentUid).then(saved => {
      if (cancelled) return;
      if (saved) {
        if (saved.userProfile) {
          setUserProfile(saved.userProfile);
        } else {
          setUserProfile({
            ...defaultUserProfile,
            fullName:
              authUser.displayName ||
              authUser.email?.split('@')[0] ||
              'Utilisateur faab gar',
            email: authUser.email || ''
          });
        }
        if (Array.isArray(saved.dossiers) && saved.dossiers.length > 0) {
          setDossiers(saved.dossiers);
        } else {
          setDossiers(JSON.parse(JSON.stringify(initialDossiers)));
        }
        if (saved.activeDossierId) {
          setActiveDossierId(saved.activeDossierId);
        } else {
          setActiveDossierId(initialDossiers[0].id);
        }
        if (saved.language) setLanguage(saved.language);
        if (saved.currency) setCurrency(saved.currency);
        if (saved.theme) setTheme(saved.theme);
        if (saved.lastJsonFileName) setLastJsonFileName(saved.lastJsonFileName);
        if (saved.customDocsData) {
          setCustomDocsData({
            ...defaultCustomDocsData,
            ...saved.customDocsData
          });
        } else {
          setCustomDocsData({ ...defaultCustomDocsData });
        }
      } else {
        // First login for this specific Regular User UID -> fresh isolated workspace
        const freshDossiers: Dossier[] = JSON.parse(
          JSON.stringify(initialDossiers)
        );
        const freshProfile: UserProfile = {
          ...defaultUserProfile,
          fullName:
            authUser.displayName ||
            authUser.email?.split('@')[0] ||
            'Utilisateur faab gar',
          email: authUser.email || ''
        };
        setUserProfile(freshProfile);
        setDossiers(freshDossiers);
        setActiveDossierId(freshDossiers[0].id);
        setCustomDocsData({ ...defaultCustomDocsData });
      }
      setHydratedUid(currentUid);
    });

    return () => {
      cancelled = true;
    };
  }, [authUser?.uid, authUser?.email]);

  // Auto-persist to IndexedDB (strictly scoped to the authenticated Regular User UID) & sync dark mode
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    document.documentElement.lang = language === 'EN' ? 'en' : 'fr';

    if (
      !isHydrated ||
      !authUser ||
      isSuperAdminEmail(authUser.email) ||
      hydratedUid !== authUser.uid
    ) {
      return;
    }

    void saveAppStateToIDB(
      {
        userProfile,
        dossiers,
        activeDossierId,
        language,
        currency,
        theme,
        lastJsonFileName,
        activeTab,
        customDocsData
      },
      authUser.uid
    );
  }, [
    isHydrated,
    hydratedUid,
    authUser,
    userProfile,
    dossiers,
    activeDossierId,
    language,
    currency,
    theme,
    lastJsonFileName,
    activeTab,
    customDocsData
  ]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Firebase Auth State Listener (Strictly driven by Firebase SDK)
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, user => {
      if (user) {
        const mapped = mapFirebaseSdkUser(user);
        setAuthUser(mapped);
        void syncFirebaseUserToRegistry(mapped);

        const alreadyPinVerified = isSessionPinVerifiedForUser(mapped.uid);
        setIsPinVerified(alreadyPinVerified);

        if (alreadyPinVerified) {
          // Dissociation stricte : le Super Admin n'a accès qu'à 'super_admin' (ou 'accueil'), l'utilisateur qu'aux onglets utilisateurs
          if (isSuperAdminEmail(mapped.email)) {
            setActiveTab(prev => (prev === 'accueil' ? 'accueil' : 'super_admin'));
          } else {
            setActiveTab(prev => (prev === 'super_admin' ? 'projects' : prev));
          }
        } else {
          // Demander systématiquement le Code PIN (défaut "0000") ou Touch ID / Face ID après l'authentification Google
          setSuperAdminAuthModalStep('pin_and_biometric');
          setIsSuperAdminAuthModalOpen(true);
        }

        try {
          localStorage.setItem(
            'faab_auth_session',
            JSON.stringify({
              uid: user.uid,
              authenticatedAt: Date.now()
            })
          );
        } catch {}
      } else {
        setAuthUser(null);
        setIsPinVerified(false);
        setSessionPinVerifiedForUser(null, false);
        setIsDeviceLocked(false);
        setIsSuperAdminAuthModalOpen(false);
        setActiveTab('accueil');
        try {
          localStorage.removeItem('faab_auth_session');
        } catch {}
      }
      setIsAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Préchargement asynchrone en tâche de fond (Idle Prefetching) des modules selon le rôle exclusif
  useEffect(() => {
    if (!isHydrated || !authUser) return;
    const preloadModules = () => {
      if (isSuperAdminEmail(authUser.email)) {
        void import('./components/SuperAdminDashboardView');
      } else {
        void import('./components/OperationalMatrices');
        void import('./components/GanttAndTreeView');
        void import('./components/CategoriesActorsView');
        void import('./components/FicheTechniquePages');
        void import('./components/DocumentGeneratorView');
      }
    };
    if (typeof (window as any).requestIdleCallback === 'function') {
      const id = (window as any).requestIdleCallback(preloadModules, {
        timeout: 2000
      });
      return () => (window as any).cancelIdleCallback?.(id);
    } else {
      const timer = setTimeout(preloadModules, 800);
      return () => clearTimeout(timer);
    }
  }, [isHydrated, authUser]);

  // Lorsqu'on clique sur "Se connecter", Google Sign-In authentifie EN PREMIER, puis ouvre immédiatement le popup Code PIN (défaut "0000") / Touch ID / Face ID
  const handleGoogleSignIn = async () => {
    // Si déjà authentifié par Google mais en attente de validation du Code PIN, ré-afficher le popup PIN
    if (authUser && !isPinVerified) {
      setSuperAdminAuthModalStep('pin_and_biometric');
      setIsSuperAdminAuthModalOpen(true);
      return;
    }

    try {
      setIsSigningIn(true);
      googleProvider.setCustomParameters({ prompt: 'select_account' });
      const res = await signInWithPopup(auth, googleProvider);
      if (res.user) {
        const mapped = mapFirebaseSdkUser(res.user);
        setAuthUser(mapped);
        void syncFirebaseUserToRegistry(mapped);
        // Exiger la saisie du Code PIN (par défaut "0000") ou Touch ID / Face ID à chaque nouvelle connexion Google
        setIsPinVerified(false);
        setSessionPinVerifiedForUser(mapped.uid, false);
        setSuperAdminAuthModalStep('pin_and_biometric');
        setIsSuperAdminAuthModalOpen(true);
      }
    } catch (err: any) {
      const code = err?.code || 'auth/unknown-error';
      const msg = err?.message || 'Erreur lors de la connexion Google Firebase.';
      setAuthErrorCode(code);
      setAuthErrorMessage(msg);
      if (
        code !== 'auth/popup-closed-by-user' &&
        code !== 'auth/cancelled-popup-request'
      ) {
        setIsAuthHelpModalOpen(true);
      }
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleDirectGooglePopupRetry = handleGoogleSignIn;

  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.warn('Sign Out notice:', err);
    } finally {
      try {
        localStorage.removeItem('faab_auth_session');
      } catch {}
      setAuthUser(null);
      setIsPinVerified(false);
      setSessionPinVerifiedForUser(null, false);
      setIsDeviceLocked(false);
      setIsSuperAdminAuthModalOpen(false);
      setIsSlidebarOpen(false);
      setActiveTab('accueil');
      showToast(
        language === 'EN'
          ? 'You have been logged out. Please sign in with Google to reconnect.'
          : 'Vous avez été déconnecté. Authentifiez-vous via Google Sign-In pour vous reconnecter.'
      );
    }
  };

  const activeDossier = useMemo<Dossier>(() => {
    return dossiers.find(d => d.id === activeDossierId) || dossiers[0];
  }, [dossiers, activeDossierId]);

  const todayISO = getTodayISO();
  const t = translations[language] || translations.FR;

  // Filtered Axes & Projects for operational views
  const filteredAxes = useMemo<Axe[]>(() => {
    const axes = activeDossier.axes || [];
    if (filterAxeId === 'ALL') return axes;
    return axes.filter(a => a.id === filterAxeId);
  }, [activeDossier, filterAxeId]);

  const availableProjectsInFilter = useMemo<Project[]>(() => {
    return filteredAxes.flatMap(a => a.projects || []);
  }, [filteredAxes]);

  const filteredProjects = useMemo<Project[]>(() => {
    if (filterProjectId === 'ALL') return availableProjectsInFilter;
    return availableProjectsInFilter.filter(p => p.id === filterProjectId);
  }, [availableProjectsInFilter, filterProjectId]);

  // Flatten tasks with codes & metrics for Dashboard & Kanban
  const flatTaskRows = useMemo(() => {
    const list: Array<{
      axeId: string;
      axeName: string;
      projectId: string;
      projectName: string;
      task: Task;
      code: string;
      antecedentCode: string;
      allProjectTasks: Array<{ id: string; code: string; name: string }>;
      metrics: ReturnType<typeof computeTaskMetrics>;
    }> = [];

    filteredAxes.forEach(axe => {
      (axe.projects || [])
        .filter(pr => filterProjectId === 'ALL' || pr.id === filterProjectId)
        .forEach(proj => {
          const rawTasks = proj.tasks || [];
          const codeMap = new Map<string, string>();
          const projectTaskOptions: Array<{
            id: string;
            code: string;
            name: string;
          }> = [];

          STANDARD_PHASES.forEach((pName, pIdx) => {
            const pTasks = rawTasks.filter(tk => tk.phase === pName);
            pTasks.forEach((tk, tIdx) => {
              const c = `${tk.type === 'jalon' ? 'J' : 'T'}.${pIdx + 1}.${
                tIdx + 1
              }`;
              codeMap.set(tk.id, c);
              projectTaskOptions.push({ id: tk.id, code: c, name: tk.name });
            });
          });

          rawTasks.forEach((tk, idx) => {
            const code =
              codeMap.get(tk.id) ||
              `${tk.type === 'jalon' ? 'J' : 'T'}.1.${idx + 1}`;
            const antCode =
              tk.antecedent && tk.antecedent !== '—'
                ? codeMap.get(tk.antecedent) || tk.antecedent
                : '—';
            const metrics = computeTaskMetrics(tk, todayISO);
            list.push({
              axeId: axe.id,
              axeName: axe.name,
              projectId: proj.id,
              projectName: proj.name,
              task: tk,
              code,
              antecedentCode: antCode,
              allProjectTasks: projectTaskOptions.filter(o => o.id !== tk.id),
              metrics
            });
          });
        });
    });

    return list;
  }, [filteredAxes, filterProjectId, todayISO]);

  // Global Dossier KPIs
  const allDossierTasks = useMemo(() => {
    return (activeDossier.axes || []).flatMap(a =>
      (a.projects || []).flatMap(p => p.tasks || [])
    );
  }, [activeDossier]);

  const totalBudgetFCFA = useMemo(
    () => allDossierTasks.reduce((acc, tk) => acc + (Number(tk.budget) || 0), 0),
    [allDossierTasks]
  );

  const statusCounts = useMemo(() => {
    const counts = {
      Terminé: 0,
      'En cours': 0,
      'À faire': 0,
      Bloqué: 0
    };
    allDossierTasks.forEach(tk => {
      const st = computeTaskMetrics(tk, todayISO).effectiveStatus;
      counts[st] = (counts[st] || 0) + 1;
    });
    return counts;
  }, [allDossierTasks, todayISO]);

  const completionPct =
    allDossierTasks.length > 0
      ? Math.round((statusCounts.Terminé / allDossierTasks.length) * 100)
      : 0;

  const activeRaciContext = useMemo(
    () => resolveProgramRaciContext(activeDossier, userProfile),
    [activeDossier, userProfile]
  );

  if (!isHydrated || isAuthLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white p-6">
        <div className="flex flex-col items-center gap-5">
          <div className="bg-white p-4 sm:p-5 rounded-3xl border-4 border-[#90D5FF] shadow-2xl flex items-center justify-center">
            <AppLogo className="w-44 h-44 sm:w-56 sm:h-56 animate-pulse" />
          </div>
          <div className="flex items-center gap-2.5 text-xs sm:text-sm font-extrabold tracking-widest uppercase text-[#90D5FF] text-center">
            <div className="w-4 h-4 border-2 border-[#90D5FF] border-t-transparent rounded-full animate-spin" />
            <span>
              {!isHydrated
                ? 'Hydratation IndexedDB faab gar en cours...'
                : language === 'EN'
                ? 'Verifying secure session...'
                : 'Vérification de la session sécurisée...'}
            </span>
          </div>
        </div>
      </div>
    );
  }

  // Strict security flags:
  // 1. User must be authenticated via Google Sign-In AND have verified their PIN (or Touch ID / Face ID) AND not have locked the device.
  // 2. Super Admin ('fabien.frikupgeneration@gmail.com') and Standard Users (all other emails) are strictly dissociated:
  //    - Super Admin ONLY has access to 'super_admin' (and 'accueil').
  //    - Standard Users ONLY have access to classic user modules (and NEVER 'super_admin').
  const isUnlocked = Boolean(authUser && isPinVerified && !isDeviceLocked);
  const isSuperAdminUnlocked = Boolean(
    isUnlocked && isSuperAdminEmail(authUser?.email)
  );
  const isRegularUserUnlocked = Boolean(
    isUnlocked && !isSuperAdminEmail(authUser?.email)
  );

  const navigateTo = (tab: string) => {
    if (tab === 'accueil') {
      setIsSlidebarOpen(false);
      startTransition(() => {
        setActiveTab('accueil');
      });
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    // 1. If not signed in with Google yet -> authenticate via Google Sign-In first
    if (!authUser) {
      handleGoogleSignIn();
      return;
    }

    // 2. If signed in with Google, but PIN is not verified or device is locked -> open PIN popup
    if (!isPinVerified || isDeviceLocked) {
      setIsSlidebarOpen(false);
      setSuperAdminAuthModalStep(
        isDeviceLocked ? 'device_locked' : 'pin_and_biometric'
      );
      setIsSuperAdminAuthModalOpen(true);
      return;
    }

    // 3. Strict dissociation: Super Admin ('fabien.frikupgeneration@gmail.com') cannot access user tabs
    if (isSuperAdminEmail(authUser.email)) {
      if (tab !== 'super_admin') {
        setIsSlidebarOpen(false);
        startTransition(() => {
          setActiveTab('super_admin');
        });
        showToast(
          language === 'EN'
            ? 'Super Administrator account is strictly dissociated from the User workspace.'
            : 'Le compte Super Administrateur est strictement dissocié de l’espace Utilisateur.'
        );
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      setIsSlidebarOpen(false);
      startTransition(() => {
        setActiveTab('super_admin');
      });
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    // 4. Strict dissociation: Standard User cannot access 'super_admin'
    if (tab === 'super_admin') {
      showToast(
        language === 'EN'
          ? 'Access strictly reserved for the Super Administrator.'
          : 'Accès strictement réservé au Super Administrateur (fabien.frikupgeneration@gmail.com).'
      );
      return;
    }

    setIsSlidebarOpen(false);
    startTransition(() => {
      setActiveTab(tab);
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // JSON Save / Overwrite or Export (uniquely for the selected programme)
  const handleSaveOrExportJSON = async () => {
    const safeProgSlug = (activeDossier.name || 'programme')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40);

    const activeDossierDocsData: CustomDocsMap = {
      ...defaultCustomDocsData,
      ...(activeDossier.customDocsData || {})
    };

    const payload = {
      programmeSelectionne: {
        ...activeDossier,
        customDocsData: activeDossierDocsData
      },
      dossiers: [
        {
          ...activeDossier,
          customDocsData: activeDossierDocsData
        }
      ],
      activeDossierId: activeDossier.id,
      userProfile,
      language,
      currency,
      theme,
      lastJsonFileName,
      activeTab,
      customDocsData: activeDossierDocsData
    };
    const jsonString = JSON.stringify(payload, null, 2);

    const filename = `FAAB_PLAN_${safeProgSlug.toUpperCase() || 'PROGRAMME'}.json`;

    const res = await saveProgramFile({
      programName: activeDossier.name,
      fileName: filename,
      content: jsonString,
      mimeType: 'application/json'
    });

    setLastJsonFileName(filename);
    if (res.mode === 'directory' || res.mode === 'savepicker') {
      showToast(
        language === 'EN'
          ? `Programme "${activeDossier.name}" saved & overwritten in: ${res.path}`
          : `Programme "${activeDossier.name}" enregistré et écrasé dans : ${res.path}`
      );
    } else {
      showToast(
        res.warning ||
          (language === 'EN'
            ? `Programme "${activeDossier.name}" exported (${filename} -> ${res.path})`
            : `Programme "${activeDossier.name}" exporté (${filename} -> dossier : ${res.path})`)
      );
    }
  };

  // JSON Import
  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = evt => {
      try {
        const parsed = safeJsonParse(evt.target?.result as string);
        const importedDossiers: Dossier[] | null = Array.isArray(parsed?.dossiers)
          ? parsed.dossiers
          : parsed?.programmeSelectionne
          ? [parsed.programmeSelectionne]
          : null;

        if (importedDossiers && importedDossiers.length > 0) {
          if (importedDossiers.length === 1) {
            const singleProg = importedDossiers[0];
            setDossiers(prev => {
              const exists = prev.some(d => d.id === singleProg.id);
              return exists
                ? prev.map(d => (d.id === singleProg.id ? singleProg : d))
                : [...prev, singleProg];
            });
            setActiveDossierId(singleProg.id);
          } else {
            setDossiers(importedDossiers);
            if (parsed.activeDossierId) {
              setActiveDossierId(parsed.activeDossierId);
            } else {
              setActiveDossierId(importedDossiers[0].id);
            }
          }
          if (parsed.userProfile) setUserProfile(parsed.userProfile);
          if (parsed.currency) setCurrency(parsed.currency);
          if (parsed.language) setLanguage(parsed.language);
          if (parsed.customDocsData) {
            setCustomDocsData({
              ...defaultCustomDocsData,
              ...parsed.customDocsData
            });
          }
          setLastJsonFileName(file.name);
          showToast(`Programme restauré depuis : ${file.name}`);
        } else {
          showToast('Fichier JSON non reconnu.');
        }
      } catch {
        showToast('Erreur de lecture du fichier JSON.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Dossier / Axe / Project / Task mutations
  const updateActiveDossier = (updater: (d: Dossier) => Dossier) => {
    setDossiers(prev =>
      prev.map(d => (d.id === activeDossier.id ? updater(d) : d))
    );
  };

  // CSV Round-Trip Helpers (UTF-8 with BOM \uFEFF + semicolon separator for Excel + Anti-Formula Injection)
  const escapeCsvCell = (val: unknown): string => {
    return sanitizeCsvCellForExport(val);
  };

  const parseCsvText = (rawText: string): Array<Record<string, string>> => {
    const cleanText = rawText.replace(/^\uFEFF/, '').trim();
    if (!cleanText) return [];

    const lines: string[] = [];
    let currentLine = '';
    let inQuotes = false;
    for (let i = 0; i < cleanText.length; i++) {
      const ch = cleanText[i];
      if (ch === '"') {
        if (inQuotes && cleanText[i + 1] === '"') {
          currentLine += '""';
          i++;
        } else {
          inQuotes = !inQuotes;
          currentLine += ch;
        }
      } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
        if (ch === '\r' && cleanText[i + 1] === '\n') i++;
        if (currentLine.trim().length > 0) lines.push(currentLine);
        currentLine = '';
      } else {
        currentLine += ch;
      }
    }
    if (currentLine.trim().length > 0) lines.push(currentLine);
    if (lines.length < 2) return [];

    const headerLine = lines[0];
    const semiCount = (headerLine.match(/;/g) || []).length;
    const commaCount = (headerLine.match(/,/g) || []).length;
    const delimiter = semiCount >= commaCount ? ';' : ',';

    const splitRow = (rowStr: string): string[] => {
      const cells: string[] = [];
      let cur = '';
      let quoted = false;
      for (let i = 0; i < rowStr.length; i++) {
        const c = rowStr[i];
        if (c === '"') {
          if (quoted && rowStr[i + 1] === '"') {
            cur += '"';
            i++;
          } else {
            quoted = !quoted;
          }
        } else if (c === delimiter && !quoted) {
          cells.push(cur.trim());
          cur = '';
        } else {
          cur += c;
        }
      }
      cells.push(cur.trim());
      return cells;
    };

    const normalizeKey = (k: string) =>
      k
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9_]/g, '');

    const rawHeaders = splitRow(lines[0]).map(normalizeKey);
    const records: Array<Record<string, string>> = [];

    for (let r = 1; r < lines.length; r++) {
      const vals = splitRow(lines[r]);
      if (vals.every(v => !v)) continue;
      const rec: Record<string, string> = {};
      rawHeaders.forEach((h, idx) => {
        if (h) rec[h] = sanitizeCsvValueOnImport(vals[idx] ?? '');
      });
      records.push(rec);
    }
    return records;
  };

  const triggerCsvDownload = (filename: string, csvLines: string[]) => {
    const bom = '\uFEFF';
    const content = bom + csvLines.join('\r\n');
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPlanificationCSV = async () => {
    const headers = [
      'TaskID',
      'Code',
      'AxeID',
      'Axe',
      'ProjectID',
      'Projet',
      'Phase',
      'Type',
      'Activite',
      'Antecedent',
      'DateDebutPrevue',
      'DateFinPrevue',
      'Budget',
      'Statut',
      'DateDebutReelle',
      'DateFinReelle',
      'Livrable'
    ];
    const rows: string[] = [headers.join(';')];

    (activeDossier.axes || []).forEach(axe => {
      (axe.projects || []).forEach(proj => {
        const rawTasks = proj.tasks || [];
        const codeMap = new Map<string, string>();
        STANDARD_PHASES.forEach((pName, pIdx) => {
          rawTasks
            .filter(tk => tk.phase === pName)
            .forEach((tk, tIdx) => {
              codeMap.set(
                tk.id,
                `${tk.type === 'jalon' ? 'J' : 'T'}.${pIdx + 1}.${tIdx + 1}`
              );
            });
        });

        rawTasks.forEach((tk, idx) => {
          const code =
            codeMap.get(tk.id) ||
            `${tk.type === 'jalon' ? 'J' : 'T'}.1.${idx + 1}`;
          rows.push(
            [
              tk.id,
              code,
              axe.id,
              axe.name,
              proj.id,
              proj.name,
              tk.phase || 'PLANIFICATION',
              tk.type || 'tache',
              tk.name || '',
              tk.antecedent || '—',
              tk.startDate || todayISO,
              tk.endDate || todayISO,
              Number(tk.budget) || 0,
              tk.status || 'À faire',
              tk.actualStartDate || '',
              tk.actualEndDate || '',
              tk.livrable || ''
            ]
              .map(escapeCsvCell)
              .join(';')
          );
        });
      });
    });

    const safeSlug = (activeDossier.name || 'programme')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .slice(0, 30);
    const filename = `FAAB_PLAN_Planification_${safeSlug}.csv`;
    const bom = '\uFEFF';
    const csvContent = bom + rows.join('\r\n');

    const res = await saveProgramFile({
      programName: activeDossier.name,
      fileName: filename,
      content: csvContent,
      mimeType: 'text/csv;charset=utf-8;'
    });

    setCsvMenuOpen(null);
    if (res.mode === 'directory' || res.mode === 'savepicker') {
      showToast(
        language === 'EN'
          ? `Planning CSV saved & overwritten in: ${res.path}`
          : `Planification CSV enregistrée et écrasée dans : ${res.path}`
      );
    } else {
      showToast(
        res.warning ||
          (language === 'EN'
            ? `Planning CSV exported: ${filename} (target: ${res.path})`
            : `Planification exportée en CSV : ${filename} (dossier : ${res.path})`)
      );
    }
  };

  const handleExportRaciCSV = async () => {
    const headers = [
      'TaskID',
      'Code',
      'AxeID',
      'Axe',
      'ProjectID',
      'Projet',
      'Phase',
      'Activite',
      'R_Responsable',
      'A_Autorite',
      'C_Consulte',
      'I_Informe',
      'Livrable',
      'Statut'
    ];
    const rows: string[] = [headers.join(';')];

    (activeDossier.axes || []).forEach(axe => {
      (axe.projects || []).forEach(proj => {
        const rawTasks = proj.tasks || [];
        const codeMap = new Map<string, string>();
        STANDARD_PHASES.forEach((pName, pIdx) => {
          rawTasks
            .filter(tk => tk.phase === pName)
            .forEach((tk, tIdx) => {
              codeMap.set(
                tk.id,
                `${tk.type === 'jalon' ? 'J' : 'T'}.${pIdx + 1}.${tIdx + 1}`
              );
            });
        });

        rawTasks.forEach((tk, idx) => {
          const code =
            codeMap.get(tk.id) ||
            `${tk.type === 'jalon' ? 'J' : 'T'}.1.${idx + 1}`;
          rows.push(
            [
              tk.id,
              code,
              axe.id,
              axe.name,
              proj.id,
              proj.name,
              tk.phase || 'PLANIFICATION',
              tk.name || '',
              tk.assignee || tk.raciR || tk.responsabilite || '',
              tk.autorite || tk.raciA || '',
              tk.consulte || tk.raciC || '',
              tk.informe || tk.raciI || '',
              tk.livrable || '',
              tk.status || 'À faire'
            ]
              .map(escapeCsvCell)
              .join(';')
          );
        });
      });
    });

    const safeSlug = (activeDossier.name || 'programme')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .slice(0, 30);
    const filename = `FAAB_PLAN_Matrice_RACI_${safeSlug}.csv`;
    const bom = '\uFEFF';
    const csvContent = bom + rows.join('\r\n');

    const res = await saveProgramFile({
      programName: activeDossier.name,
      fileName: filename,
      content: csvContent,
      mimeType: 'text/csv;charset=utf-8;'
    });

    setCsvMenuOpen(null);
    if (res.mode === 'directory' || res.mode === 'savepicker') {
      showToast(
        language === 'EN'
          ? `RACI Matrix CSV saved & overwritten in: ${res.path}`
          : `Matrice RACI CSV enregistrée et écrasée dans : ${res.path}`
      );
    } else {
      showToast(
        res.warning ||
          (language === 'EN'
            ? `RACI Matrix exported: ${filename} (target: ${res.path})`
            : `Matrice RACI exportée en CSV : ${filename} (dossier : ${res.path})`)
      );
    }
  };

  const handleImportPlanificationCSV = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = evt => {
      try {
        const records = parseCsvText(String(evt.target?.result || ''));
        if (records.length === 0) {
          showToast('Fichier CSV vide ou format non valide.');
          return;
        }

        let updatedCount = 0;
        let createdCount = 0;

        updateActiveDossier(d => {
          const nextAxes: Axe[] = (d.axes || []).map(a => ({
            ...a,
            projects: (a.projects || []).map(p => ({
              ...p,
              tasks: [...(p.tasks || [])]
            }))
          }));

          records.forEach((rec, idx) => {
            const taskId = rec.taskid || rec.id || '';
            const axeId = rec.axeid || '';
            const axeName = rec.axe || '';
            const projId = rec.projectid || rec.projetid || '';
            const projName = rec.projet || rec.project || '';
            const actName =
              rec.activite || rec.tache || rec.name || rec.intitule || '';
            if (!actName && !taskId) return;

            const rawPhase = (rec.phase || '').toUpperCase().trim();
            const validPhase = STANDARD_PHASES.includes(rawPhase as any)
              ? rawPhase
              : STANDARD_PHASES.find(p =>
                  rawPhase.includes(p.slice(0, 6))
                ) || 'PLANIFICATION';

            const rawType = (rec.type || '').toLowerCase().trim();
            const validType: 'tache' | 'jalon' =
              rawType === 'jalon' || rawType === 'j' ? 'jalon' : 'tache';

            const rawStatus = (rec.statut || rec.status || '').trim();
            const validStatus: Task['status'] =
              rawStatus === 'Terminé' ||
              rawStatus === 'En cours' ||
              rawStatus === 'Bloqué' ||
              rawStatus === 'À faire'
                ? rawStatus
                : 'À faire';

            const cleanBudget =
              Number(
                String(rec.budget || '0')
                  .replace(/\s/g, '')
                  .replace(',', '.')
                  .replace(/[^0-9.-]/g, '')
              ) || 0;

            // 1. Try finding existing task by ID or by Project+Name
            let matchedTask: Task | undefined;
            for (const ax of nextAxes) {
              for (const pr of ax.projects || []) {
                const found = (pr.tasks || []).find(
                  tk =>
                    (taskId && tk.id === taskId) ||
                    (!taskId &&
                      actName &&
                      tk.name.trim().toLowerCase() ===
                        actName.trim().toLowerCase() &&
                      (!projName ||
                        pr.name.trim().toLowerCase() ===
                          projName.trim().toLowerCase()))
                );
                if (found) {
                  matchedTask = found;
                  break;
                }
              }
              if (matchedTask) break;
            }

            if (matchedTask) {
              if (actName) matchedTask.name = actName;
              if (rec.phase) matchedTask.phase = validPhase;
              if (rec.type) matchedTask.type = validType;
              if (rec.antecedent !== undefined && rec.antecedent !== '') {
                matchedTask.antecedent = rec.antecedent;
              }
              if (rec.datedebutprevue || rec.startdate) {
                matchedTask.startDate = rec.datedebutprevue || rec.startdate;
              }
              if (rec.datefinprevue || rec.enddate) {
                matchedTask.endDate = rec.datefinprevue || rec.enddate;
              }
              if (rec.budget !== undefined && rec.budget !== '') {
                matchedTask.budget = cleanBudget;
              }
              if (rec.statut || rec.status) {
                matchedTask.status = validStatus;
              }
              if (rec.datedebutreelle !== undefined) {
                matchedTask.actualStartDate = rec.datedebutreelle;
              }
              if (rec.datefinreelle !== undefined) {
                matchedTask.actualEndDate = rec.datefinreelle;
              }
              if (rec.livrable !== undefined) {
                matchedTask.livrable = rec.livrable;
              }
              updatedCount++;
            } else {
              // Find or create target Axe & Project
              let targetAxe =
                nextAxes.find(
                  a =>
                    (axeId && a.id === axeId) ||
                    (axeName &&
                      a.name.trim().toLowerCase() ===
                        axeName.trim().toLowerCase())
                ) || nextAxes[0];

              if (!targetAxe) {
                targetAxe = {
                  id: axeId || `axe-csv-${Date.now()}`,
                  name: axeName || 'Axe 1 : Axe Importé CSV',
                  projects: []
                };
                nextAxes.push(targetAxe);
              }

              let targetProj =
                (targetAxe.projects || []).find(
                  p =>
                    (projId && p.id === projId) ||
                    (projName &&
                      p.name.trim().toLowerCase() ===
                        projName.trim().toLowerCase())
                ) || (targetAxe.projects || [])[0];

              if (!targetProj) {
                targetProj = {
                  id: projId || `proj-csv-${Date.now()}-${idx}`,
                  name: projName || 'Projet Importé CSV',
                  tasks: []
                };
                targetAxe.projects = [...(targetAxe.projects || []), targetProj];
              }

              const newTk: Task = {
                id: taskId || `tk-csv-${Date.now()}-${idx}`,
                type: validType,
                phase: validPhase,
                name: actName || `Activité CSV ${idx + 1}`,
                startDate: rec.datedebutprevue || rec.startdate || todayISO,
                endDate: rec.datefinprevue || rec.enddate || todayISO,
                actualStartDate: rec.datedebutreelle || '',
                actualEndDate: rec.datefinreelle || '',
                status: validStatus,
                assignee: rec.r_responsable || rec.responsable || '',
                autorite: rec.a_autorite || rec.autorite || '',
                consulte: rec.c_consulte || rec.consulte || '',
                informe: rec.i_informe || rec.informe || '',
                livrable: rec.livrable || '',
                budget: cleanBudget,
                antecedent: rec.antecedent || '—'
              };
              targetProj.tasks = [...(targetProj.tasks || []), newTk];
              createdCount++;
            }
          });

          const nextDossier: Dossier = { ...d, axes: nextAxes };
          return {
            ...nextDossier,
            categorizedActors: ensureDossierCategorizedActors(nextDossier)
          };
        });

        showToast(
          `CSV Planification importé (${updatedCount} mis à jour, ${createdCount} ajouté(s)).`
        );
      } catch {
        showToast("Erreur lors de l'importation du CSV Planification.");
      }
    };
    reader.readAsText(file, 'UTF-8');
    e.target.value = '';
    setCsvMenuOpen(null);
  };

  const handleImportRaciCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = evt => {
      try {
        const records = parseCsvText(String(evt.target?.result || ''));
        if (records.length === 0) {
          showToast('Fichier CSV RACI vide ou format non valide.');
          return;
        }

        let updatedCount = 0;
        let createdCount = 0;

        updateActiveDossier(d => {
          const nextAxes: Axe[] = (d.axes || []).map(a => ({
            ...a,
            projects: (a.projects || []).map(p => ({
              ...p,
              tasks: [...(p.tasks || [])]
            }))
          }));

          records.forEach((rec, idx) => {
            const taskId = rec.taskid || rec.id || '';
            const axeId = rec.axeid || '';
            const axeName = rec.axe || '';
            const projId = rec.projectid || rec.projetid || '';
            const projName = rec.projet || rec.project || '';
            const actName =
              rec.activite || rec.tache || rec.name || rec.intitule || '';
            if (!actName && !taskId) return;

            const rVal =
              rec.r_responsable ??
              rec.rresponsable ??
              rec.responsable ??
              rec.r ??
              undefined;
            const aVal =
              rec.a_autorite ??
              rec.aautorite ??
              rec.autorite ??
              rec.a ??
              undefined;
            const cVal =
              rec.c_consulte ??
              rec.cconsulte ??
              rec.consulte ??
              rec.c ??
              undefined;
            const iVal =
              rec.i_informe ??
              rec.iinforme ??
              rec.informe ??
              rec.i ??
              undefined;

            let matchedTask: Task | undefined;
            for (const ax of nextAxes) {
              for (const pr of ax.projects || []) {
                const found = (pr.tasks || []).find(
                  tk =>
                    (taskId && tk.id === taskId) ||
                    (!taskId &&
                      actName &&
                      tk.name.trim().toLowerCase() ===
                        actName.trim().toLowerCase() &&
                      (!projName ||
                        pr.name.trim().toLowerCase() ===
                          projName.trim().toLowerCase()))
                );
                if (found) {
                  matchedTask = found;
                  break;
                }
              }
              if (matchedTask) break;
            }

            if (matchedTask) {
              if (actName) matchedTask.name = actName;
              if (rVal !== undefined) {
                matchedTask.assignee = rVal;
                matchedTask.raciR = rVal;
                matchedTask.responsabilite = rVal;
              }
              if (aVal !== undefined) {
                matchedTask.autorite = aVal;
                matchedTask.raciA = aVal;
              }
              if (cVal !== undefined) {
                matchedTask.consulte = cVal;
                matchedTask.raciC = cVal;
              }
              if (iVal !== undefined) {
                matchedTask.informe = iVal;
                matchedTask.raciI = iVal;
              }
              if (rec.livrable !== undefined) {
                matchedTask.livrable = rec.livrable;
              }
              if (rec.statut || rec.status) {
                const st = (rec.statut || rec.status).trim();
                if (
                  st === 'Terminé' ||
                  st === 'En cours' ||
                  st === 'Bloqué' ||
                  st === 'À faire'
                ) {
                  matchedTask.status = st;
                }
              }
              updatedCount++;
            } else {
              let targetAxe =
                nextAxes.find(
                  a =>
                    (axeId && a.id === axeId) ||
                    (axeName &&
                      a.name.trim().toLowerCase() ===
                        axeName.trim().toLowerCase())
                ) || nextAxes[0];

              if (!targetAxe) {
                targetAxe = {
                  id: axeId || `axe-raci-${Date.now()}`,
                  name: axeName || 'Axe 1 : Axe Importé RACI',
                  projects: []
                };
                nextAxes.push(targetAxe);
              }

              let targetProj =
                (targetAxe.projects || []).find(
                  p =>
                    (projId && p.id === projId) ||
                    (projName &&
                      p.name.trim().toLowerCase() ===
                        projName.trim().toLowerCase())
                ) || (targetAxe.projects || [])[0];

              if (!targetProj) {
                targetProj = {
                  id: projId || `proj-raci-${Date.now()}-${idx}`,
                  name: projName || 'Projet Importé RACI',
                  tasks: []
                };
                targetAxe.projects = [...(targetAxe.projects || []), targetProj];
              }

              const rawPhase = (rec.phase || '').toUpperCase().trim();
              const validPhase = STANDARD_PHASES.includes(rawPhase as any)
                ? rawPhase
                : 'PLANIFICATION';

              const newTk: Task = {
                id: taskId || `tk-raci-${Date.now()}-${idx}`,
                type: 'tache',
                phase: validPhase,
                name: actName || `Activité RACI ${idx + 1}`,
                startDate: todayISO,
                endDate: todayISO,
                status: 'À faire',
                assignee: rVal || '',
                raciR: rVal || '',
                responsabilite: rVal || '',
                autorite: aVal || '',
                raciA: aVal || '',
                consulte: cVal || '',
                raciC: cVal || '',
                informe: iVal || '',
                raciI: iVal || '',
                livrable: rec.livrable || '',
                budget: 0,
                antecedent: '—'
              };
              targetProj.tasks = [...(targetProj.tasks || []), newTk];
              createdCount++;
            }
          });

          const nextDossier: Dossier = { ...d, axes: nextAxes };
          return {
            ...nextDossier,
            categorizedActors: ensureDossierCategorizedActors(nextDossier)
          };
        });

        showToast(
          `CSV Matrice RACI importé (${updatedCount} mis à jour, ${createdCount} ajouté(s)).`
        );
      } catch {
        showToast("Erreur lors de l'importation du CSV RACI.");
      }
    };
    reader.readAsText(file, 'UTF-8');
    e.target.value = '';
    setCsvMenuOpen(null);
  };

  const createDossierDirect = (
    name: string,
    desc: string,
    horizon: string = '2026-2030'
  ) => {
    const newId = `dossier-${Date.now()}`;
    const newDossier: Dossier = {
      id: newId,
      name,
      horizonPlan: horizon,
      psdYear: new Date().getFullYear(),
      horizonYears: 5,
      type: 'Portefeuille Stratégique',
      institution: userProfile.institution || 'Organisation',
      description:
        desc || 'Portefeuille de projets planifié et suivi dans faab gar.',
      axes: [
        {
          id: `axe-${Date.now()}`,
          name: 'Axe 1 : Orientation Stratégique Principale',
          projects: [
            {
              id: `proj-${Date.now()}`,
              name: 'Projet 1.1 : Projet Opérationnel Pilote',
              tasks: [
                {
                  id: `task-${Date.now()}`,
                  type: 'tache',
                  phase: 'AVANT PROJET',
                  name: 'Cadrage initial et lancement opérationnel',
                  startDate: todayISO,
                  endDate: todayISO,
                  status: 'En cours',
                  assignee: userProfile.fullName || 'Chef de Projet',
                  autorite: 'Comité de Pilotage (COPIL)',
                  consulte: 'Experts Techniques',
                  informe: 'Parties Prenantes',
                  budget: 5000000,
                  antecedent: '—'
                }
              ]
            }
          ]
        }
      ]
    };

    setDossiers(prev => [...prev, newDossier]);
    setActiveDossierId(newId);
    setFilterAxeId('ALL');
    setFilterProjectId('ALL');
    showToast(`Nouveau dossier "${newDossier.name}" créé et activé.`);
  };

  const handleUpdateDossier = (
    id: string,
    patch: Partial<Pick<Dossier, 'name' | 'description' | 'horizonPlan'>>
  ) => {
    setDossiers(prev =>
      prev.map(d => (d.id === id ? { ...d, ...patch } : d))
    );
    showToast('Programme mis à jour.');
  };

  const handleDeleteDossier = (id: string) => {
    if (dossiers.length <= 1) {
      showToast('Impossible de supprimer le dernier dossier.');
      return;
    }
    const remaining = dossiers.filter(d => d.id !== id);
    setDossiers(remaining);
    if (activeDossierId === id) {
      setActiveDossierId(remaining[0].id);
    }
    showToast('Dossier supprimé.');
  };

  const handleAddAxe = () => {
    const nextNum = (activeDossier.axes || []).length + 1;
    const newAxe: Axe = {
      id: `axe-${Date.now()}`,
      name: `Axe ${nextNum} : Nouvel Axe Stratégique`,
      projects: [
        {
          id: `proj-${Date.now()}`,
          name: `Projet ${nextNum}.1 : Nouveau Projet Opérationnel`,
          tasks: []
        }
      ]
    };
    updateActiveDossier(d => ({
      ...d,
      axes: [...(d.axes || []), newAxe]
    }));
    showToast(`Nouvel Axe ${nextNum} ajouté.`);
  };

  const handleUpdateAxeName = (axeId: string, name: string) => {
    updateActiveDossier(d => ({
      ...d,
      axes: (d.axes || []).map(a => (a.id === axeId ? { ...a, name } : a))
    }));
  };

  const handleDeleteAxe = (axeId: string) => {
    if ((activeDossier.axes || []).length <= 1) {
      showToast('Le dossier doit conserver au moins un Axe Stratégique.');
      return;
    }
    updateActiveDossier(d => ({
      ...d,
      axes: (d.axes || []).filter(a => a.id !== axeId)
    }));
    if (filterAxeId === axeId) setFilterAxeId('ALL');
    showToast('Axe supprimé.');
  };

  const handleAddProject = (targetAxeId?: string) => {
    const targetAxe = targetAxeId
      ? (activeDossier.axes || []).find(a => a.id === targetAxeId)
      : filterAxeId !== 'ALL'
      ? (activeDossier.axes || []).find(a => a.id === filterAxeId)
      : (activeDossier.axes || [])[0];
    if (!targetAxe) {
      handleAddAxe();
      return;
    }
    const nextNum = (targetAxe.projects || []).length + 1;
    const newProj: Project = {
      id: `proj-${Date.now()}`,
      name: `Projet ${nextNum} : Nouveau Projet Opérationnel`,
      tasks: []
    };
    updateActiveDossier(d => ({
      ...d,
      axes: (d.axes || []).map(a =>
        a.id === targetAxe.id
          ? { ...a, projects: [...(a.projects || []), newProj] }
          : a
      )
    }));
    showToast(`Projet ajouté dans ${targetAxe.name}.`);
  };

  const handleUpdateProjectName = (projectId: string, name: string) => {
    updateActiveDossier(d => ({
      ...d,
      axes: (d.axes || []).map(a => ({
        ...a,
        projects: (a.projects || []).map(p =>
          p.id === projectId ? { ...p, name } : p
        )
      }))
    }));
  };

  const handleDeleteProject = (projectId: string) => {
    updateActiveDossier(d => ({
      ...d,
      axes: (d.axes || []).map(a => ({
        ...a,
        projects: (a.projects || []).filter(p => p.id !== projectId)
      }))
    }));
    if (filterProjectId === projectId) setFilterProjectId('ALL');
    showToast('Projet supprimé.');
  };

  const handleAddTaskInPhase = (
    projectId: string,
    phaseName: string,
    type: 'tache' | 'jalon' = 'tache'
  ) => {
    const newTask: Task = {
      id: `tk-${Date.now()}`,
      type,
      phase: phaseName,
      name:
        type === 'jalon'
          ? `Nouveau Jalon (${phaseName})`
          : `Nouvelle Activité (${phaseName})`,
      startDate: todayISO,
      endDate: todayISO,
      actualStartDate: '',
      actualEndDate: '',
      status: 'À faire',
      assignee:
        userProfile.intervenesAsProgramActor !== false
          ? userProfile.fullName || ''
          : '',
      autorite: '',
      consulte: '',
      informe: '',
      livrable: '',
      budget: type === 'jalon' ? 0 : 2500000,
      antecedent: '—'
    };

    updateActiveDossier(d => ({
      ...d,
      axes: (d.axes || []).map(a => ({
        ...a,
        projects: (a.projects || []).map(p =>
          p.id === projectId
            ? { ...p, tasks: [...(p.tasks || []), newTask] }
            : p
        )
      }))
    }));
    showToast(
      `${type === 'jalon' ? 'Jalon' : 'Activité'} ajouté(e) dans la phase « ${phaseName} ».`
    );
  };

  const handleAddTask = (type: 'tache' | 'jalon' = 'tache') => {
    const targetProj =
      filterProjectId !== 'ALL'
        ? availableProjectsInFilter.find(p => p.id === filterProjectId)
        : availableProjectsInFilter[0];
    if (!targetProj) {
      showToast("Veuillez d'abord créer un Projet.");
      return;
    }
    handleAddTaskInPhase(targetProj.id, 'PLANIFICATION', type);
  };

  const handleUpdateTask = (
    projectId: string,
    taskId: string,
    patch: Partial<Task>
  ) => {
    updateActiveDossier(d => ({
      ...d,
      axes: (d.axes || []).map(a => ({
        ...a,
        projects: (a.projects || []).map(p =>
          p.id === projectId
            ? {
                ...p,
                tasks: (p.tasks || []).map(tk =>
                  tk.id === taskId ? { ...tk, ...patch } : tk
                )
              }
            : p
        )
      }))
    }));
  };

  const handleDeleteTask = (projectId: string, taskId: string) => {
    updateActiveDossier(d => ({
      ...d,
      axes: (d.axes || []).map(a => ({
        ...a,
        projects: (a.projects || []).map(p =>
          p.id === projectId
            ? {
                ...p,
                tasks: (p.tasks || []).filter(tk => tk.id !== taskId)
              }
            : p
        )
      }))
    }));
  };

  const handleMoveTaskInKanban = (
    projectId: string,
    taskId: string,
    newStatus: Task['status']
  ) => {
    updateActiveDossier(d => ({
      ...d,
      axes: (d.axes || []).map(a => ({
        ...a,
        projects: (a.projects || []).map(p => {
          if (p.id !== projectId) return p;
          const updatedTasks = recalculateProjectTasksOnKanbanMove(
            p.tasks || [],
            taskId,
            newStatus,
            todayISO
          );
          return { ...p, tasks: updatedTasks };
        })
      }))
    }));
    showToast(
      `Statut changé vers "${newStatus}" (dates prévues recalculées automatiquement).`
    );
  };

  // Document generator field handlers — scoped per selected programme (activeDossier)
  const activeProgramCustomDocsData: CustomDocsMap = {
    ...defaultCustomDocsData,
    ...(activeDossier.customDocsData || {})
  };

  const handleUpdateDocField = (
    docType: InstitutionalDocType,
    fieldKey: keyof CustomDocFields,
    value: string
  ) => {
    const isSharedImageKey =
      fieldKey === 'leftLogoDataUrl' ||
      fieldKey === 'rightLogoDataUrl' ||
      fieldKey === 'bannerImageDataUrl' ||
      fieldKey === 'figureImageDataUrl' ||
      fieldKey === 'orgStampDataUrl' ||
      fieldKey === 'partnerStampDataUrl';

    updateActiveDossier(d => {
      const prev = {
        ...defaultCustomDocsData,
        ...(d.customDocsData || {})
      };
      if (isSharedImageKey && value === '') {
        const cleaned = { ...prev };
        (Object.keys(cleaned) as InstitutionalDocType[]).forEach(k => {
          if (cleaned[k]) {
            cleaned[k] = { ...cleaned[k], [fieldKey]: '' };
          }
        });
        return { ...d, customDocsData: cleaned };
      }
      return {
        ...d,
        customDocsData: {
          ...prev,
          [docType]: {
            ...(prev[docType] || defaultCustomDocsData[docType]),
            [fieldKey]: value
          }
        }
      };
    });
  };

  const handleResetDocDefaults = (docType: InstitutionalDocType) => {
    updateActiveDossier(d => {
      const prev = {
        ...defaultCustomDocsData,
        ...(d.customDocsData || {})
      };
      const existing = prev[docType];
      const cleanedDocsData = { ...prev };
      (Object.keys(cleanedDocsData) as InstitutionalDocType[]).forEach(k => {
        if (cleanedDocsData[k]) {
          cleanedDocsData[k] = {
            ...cleanedDocsData[k],
            matricesJson: ''
          };
        }
      });
      return {
        ...d,
        customDocsData: {
          ...cleanedDocsData,
          [docType]: {
            ...defaultCustomDocsData[docType],
            leftLogoDataUrl: existing?.leftLogoDataUrl,
            rightLogoDataUrl: existing?.rightLogoDataUrl,
            bannerImageDataUrl: existing?.bannerImageDataUrl,
            figureImageDataUrl: existing?.figureImageDataUrl,
            orgStampDataUrl: existing?.orgStampDataUrl,
            partnerStampDataUrl: existing?.partnerStampDataUrl,
            matricesJson: '',
            slidesConfigJson: '',
            excludedFieldsJson: ''
          }
        }
      };
    });
    showToast('Champs, slides et matrices synchronisés à 100% avec les onglets (Dossiers, Planification, Suivi, RACI, PERT, Kanban).');
  };

  const handleUpdateCategorizedActors = (nextList: CategorizedActor[]) => {
    updateActiveDossier(d => ({
      ...d,
      categorizedActors: nextList
    }));
  };

  const handleOpenInternalActorProfileFromCategory = (actorName: string) => {
    setSelectedCategoryActorName(actorName || userProfile.fullName);
    setIsCategoryProfileModalOpen(true);
  };

  // Shared Macro Filter Bar (2x size on mobile portrait & landscape — Filters ONLY)
  const renderMacroFilterBar = () => (
    <div className="bg-white dark:bg-slate-900 rounded-md sm:rounded-xl border border-slate-200 dark:border-slate-800 p-1 sm:p-1.5 md:p-2.5 shadow-xs mb-1.5 sm:mb-3">
      <div className="grid grid-cols-2 gap-1 sm:gap-2 items-center">
        <div className="flex items-center gap-1 sm:gap-1.5 bg-slate-50 dark:bg-slate-800/80 px-2 py-1 md:px-2.5 md:py-1 rounded border border-slate-200 dark:border-slate-700 h-7 sm:h-7 md:h-auto">
          <Filter className="hidden sm:block w-3 h-3 sm:w-3.5 sm:h-3.5 text-[#0284c7] dark:text-[#90D5FF] shrink-0" />
          <div className="flex-1 min-w-0">
            <label className="hidden md:block text-[8px] font-bold uppercase text-slate-400 leading-none">
              {language === 'EN' ? '1. Strategic Axis' : '1. Axe Stratégique'}
            </label>
            <select
              value={filterAxeId}
              onChange={e => {
                setFilterAxeId(e.target.value);
                setFilterProjectId('ALL');
              }}
              className="w-full bg-transparent text-[13px] sm:text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none truncate leading-tight"
            >
              <option value="ALL">
                {language === 'EN'
                  ? `Axis: All (${(activeDossier.axes || []).length})`
                  : `Axe : Tous (${(activeDossier.axes || []).length})`}
              </option>
              {(activeDossier.axes || []).map(ax => (
                <option key={ax.id} value={ax.id}>
                  {ax.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-1 sm:gap-1.5 bg-slate-50 dark:bg-slate-800/80 px-2 py-1 md:px-2.5 md:py-1 rounded border border-slate-200 dark:border-slate-700 h-7 sm:h-7 md:h-auto">
          <Briefcase className="hidden sm:block w-3 h-3 sm:w-3.5 sm:h-3.5 text-[#0284c7] dark:text-[#90D5FF] shrink-0" />
          <div className="flex-1 min-w-0">
            <label className="hidden md:block text-[8px] font-bold uppercase text-slate-400 leading-none">
              {language === 'EN' ? '2. Operational Project' : '2. Projet Opérationnel'}
            </label>
            <select
              value={filterProjectId}
              onChange={e => setFilterProjectId(e.target.value)}
              className="w-full bg-transparent text-[13px] sm:text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none truncate leading-tight"
            >
              <option value="ALL">
                {language === 'EN'
                  ? `Project: All (${availableProjectsInFilter.length})`
                  : `Projet : Tous (${availableProjectsInFilter.length})`}
              </option>
              {availableProjectsInFilter.map(pr => (
                <option key={pr.id} value={pr.id}>
                  {pr.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </div>
  );

  // ============================================================================
  // SLIDEBAR MENU (Burger ☰) — Portefeuille / Dossier selector ONLY + Ordered Tabs
  // ============================================================================
  const renderSlidebar = () => {
    // STRICT SECURITY & DISSOCIATION:
    // - Never mount slidebar if not authenticated, if PIN is not verified, if device is locked, or if drawer closed.
    // - Super Admin ('fabien.frikupgeneration@gmail.com') is strictly dissociated from the classic User workspace,
    //   so the classic User Slidebar is ONLY available to authenticated & PIN-verified Regular Users.
    if (!isRegularUserUnlocked || !isSlidebarOpen) return null;

    // Reorganized into the exact 4 groups with spacing between groups (Strictly Regular User modules):
    // Group 1: Accueil & Présentation, Profil Utilisateur
    // Group 2: Dossiers & Projets, Fiche Technique & Résumé Exécutif, Générateur de Documents
    // Group 3: Tableau de Bord Décisionnel, Réseau PERT, Tableau Kanban Interactif, Diagramme de Gantt & Arbre
    // Group 4: Planification, Suivi des tâches, RACI
    const navGroups: Array<
      Array<{
        id: string;
        label: string;
        icon: React.ReactNode;
        badge?: string;
      }>
    > = [
      [
        { id: 'accueil', label: t.nav.accueil, icon: <Home className="w-4 h-4" /> },
        {
          id: 'profil',
          label: t.nav.profil,
          icon: <User className="w-4 h-4" />
        }
      ],
      [
        {
          id: 'projects',
          label: t.nav.projects,
          icon: <FolderOpen className="w-4 h-4" />,
          badge: `${dossiers.length}`
        },
        {
          id: 'fiche',
          label: t.nav.fiche,
          icon: <FileText className="w-4 h-4" />
        },
        {
          id: 'docgen',
          label: t.nav.docgen,
          icon: <FileSpreadsheet className="w-4 h-4" />,
          badge: '10 Docs'
        }
      ],
      [
        {
          id: 'dashboard',
          label: t.nav.dashboard,
          icon: <LayoutDashboard className="w-4 h-4" />
        },
        {
          id: 'pert',
          label: t.nav.pert,
          icon: <Network className="w-4 h-4" />
        },
        {
          id: 'kanban',
          label: t.nav.kanban,
          icon: <Kanban className="w-4 h-4" />
        },
        {
          id: 'gantt',
          label: t.nav.gantt,
          icon: <GanttChart className="w-4 h-4" />
        }
      ],
      [
        {
          id: 'planification',
          label: t.nav.planification,
          icon: <Calendar className="w-4 h-4" />,
          badge: `${allDossierTasks.length}`
        },
        {
          id: 'processus',
          label: t.nav.processus,
          icon: <ListChecks className="w-4 h-4" />,
          badge: `${completionPct}%`
        },
        {
          id: 'raci',
          label: t.nav.raci,
          icon: <Users className="w-4 h-4" />,
          badge: 'R-A-C-I'
        },
        {
          id: 'categorie',
          label: t.nav.categorie,
          icon: <Layers className="w-4 h-4" />,
          badge: '5 Cat.'
        }
      ],
      [
        {
          id: 'arbre',
          label: t.nav.arbre,
          icon: <GitBranch className="w-4 h-4" />,
          badge: 'GAR 1'
        },
        {
          id: 'solutions',
          label: t.nav.solutions,
          icon: <Lightbulb className="w-4 h-4" />,
          badge: 'GAR 2'
        },
        {
          id: 'registre_parties',
          label: t.nav.registre_parties,
          icon: <Users className="w-4 h-4" />,
          badge: 'GAR 3'
        },
        {
          id: 'terrain',
          label: t.nav.terrain,
          icon: <MapPin className="w-4 h-4" />,
          badge: 'GAR 4'
        },
        {
          id: 'parties',
          label: t.nav.parties,
          icon: <Award className="w-4 h-4" />,
          badge: '5 Volets'
        },
        {
          id: 'rendement',
          label: t.nav.rendement,
          icon: <TrendingUp className="w-4 h-4" />,
          badge: 'GAR 6'
        },
        {
          id: 'cmr',
          label: t.nav.cmr,
          icon: <Activity className="w-4 h-4" />,
          badge: 'CMR'
        },
        {
          id: 'risques_hypo',
          label: t.nav.risques_hypo,
          icon: <ShieldAlert className="w-4 h-4" />,
          badge: 'GAR 8'
        },
        {
          id: 'extrants',
          label: t.nav.extrants,
          icon: <PackageCheck className="w-4 h-4" />,
          badge: 'GAR 9'
        },
        {
          id: 'clar',
          label: t.nav.clar,
          icon: <BookOpen className="w-4 h-4" />,
          badge: 'CLAR'
        }
      ]
    ];

    return (
      <div className="fixed inset-0 z-50 flex">
        <div
          className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs transition-opacity"
          onClick={() => setIsSlidebarOpen(false)}
        />

        <aside className="relative z-10 w-80 sm:w-96 max-w-[92vw] h-full bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col">
          {/* Sticky Top Bar: Action Icons + CSV Import/Export right next to Theme Toggle + Close Button */}
          <div className="relative px-3.5 py-2.5 bg-[#0c4a6e] text-white flex items-center justify-between border-b border-sky-800 shrink-0 z-30">
            <div className="flex items-center gap-1.5">
              {/* 1. Import JSON */}
              <button
                onClick={() => fileInputRef.current?.click()}
                title={t.actions.importJson}
                className="w-8 h-8 rounded-lg bg-white/10 hover:bg-[#90D5FF] hover:text-slate-950 flex items-center justify-center transition-colors cursor-pointer"
              >
                <Upload className="w-4 h-4" />
              </button>
              {/* 2. Save / Overwrite JSON */}
              <button
                onClick={handleSaveOrExportJSON}
                title={t.actions.saveJson}
                className="w-8 h-8 rounded-lg bg-white/10 hover:bg-[#90D5FF] hover:text-slate-950 flex items-center justify-center transition-colors cursor-pointer"
              >
                <Save className="w-4 h-4" />
              </button>
              {/* 3. Export PDF Fiche Technique */}
              <button
                onClick={() =>
                  generateDirectWhitePDF(
                    activeDossier,
                    userProfile,
                    currency,
                    language
                  )
                }
                title={t.actions.exportPdf}
                className="w-8 h-8 rounded-lg bg-white/10 hover:bg-[#90D5FF] hover:text-slate-950 flex items-center justify-center transition-colors cursor-pointer"
              >
                <Printer className="w-4 h-4" />
              </button>
              {/* Connecter le dossier local faab-plan */}
              <button
                type="button"
                onClick={async () => {
                  const h = await pickFaabPlanFolder();
                  if (h) {
                    showToast(
                      language === 'EN'
                        ? `Local workspace folder connected: ${h.name} -> faab-plan/${activeDossier.name}/`
                        : `Dossier local connecté : ${h.name} -> faab-plan/${activeDossier.name}/`
                    );
                  } else {
                    showToast(
                      language === 'EN'
                        ? 'Direct disk access cancelled or restricted by browser.'
                        : 'Accès dossier local annulé ou restreint par le navigateur.'
                    );
                  }
                }}
                title={
                  language === 'EN'
                    ? 'Connect local folder (faab-plan) on your computer'
                    : 'Connecter le dossier local sur mon ordinateur (faab-plan)'
                }
                className="w-8 h-8 rounded-lg bg-white/10 hover:bg-[#90D5FF] hover:text-slate-950 flex items-center justify-center transition-colors cursor-pointer"
              >
                <FolderOpen className="w-4 h-4" />
              </button>
              {/* 4. Theme Toggle (Dark / Light Mode) */}
              <button
                onClick={() =>
                  setTheme(prev => (prev === 'dark' ? 'light' : 'dark'))
                }
                title={t.actions.theme}
                className="w-8 h-8 rounded-lg bg-white/10 hover:bg-[#90D5FF] hover:text-slate-950 flex items-center justify-center transition-colors cursor-pointer"
              >
                {theme === 'dark' ? (
                  <Sun className="w-4 h-4 text-[#90D5FF]" />
                ) : (
                  <Moon className="w-4 h-4" />
                )}
              </button>

              {/* Scanner QR Code / Code-Barres Badge (Uniquement dans l'app, jamais sur l'accueil) */}
              {activeTab !== 'accueil' && (
                <button
                  type="button"
                  onClick={() => {
                    setCsvMenuOpen(null);
                    setIsSlidebarOpen(false);
                    setIsGlobalScannerOpen(true);
                  }}
                  title={
                    language === 'EN'
                      ? 'Scan QR Code / Badge Barcode'
                      : 'Scanner un QR Code / Badge'
                  }
                  className="w-8 h-8 rounded-lg bg-white/10 hover:bg-[#90D5FF] hover:text-slate-950 flex items-center justify-center transition-colors cursor-pointer text-[#90D5FF]"
                >
                  <QrCode className="w-4 h-4" />
                </button>
              )}

              {/* 5. Icon 1 right of Theme Toggle: Importer CSV (Icon only, no text) */}
              <button
                type="button"
                onClick={() =>
                  setCsvMenuOpen(prev =>
                    prev === 'slidebar-import' ? null : 'slidebar-import'
                  )
                }
                title="Importer CSV"
                aria-label="Importer CSV"
                className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
                  csvMenuOpen === 'slidebar-import'
                    ? 'bg-[#90D5FF] text-slate-950'
                    : 'bg-white/10 hover:bg-[#90D5FF] hover:text-slate-950'
                }`}
              >
                <FileUp className="w-4 h-4" />
              </button>

              {/* 6. Icon 2 right of Theme Toggle: Exporter CSV (Icon only, no text) */}
              <button
                type="button"
                onClick={() =>
                  setCsvMenuOpen(prev =>
                    prev === 'slidebar-export' ? null : 'slidebar-export'
                  )
                }
                title="Exporter CSV"
                aria-label="Exporter CSV"
                className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
                  csvMenuOpen === 'slidebar-export'
                    ? 'bg-[#90D5FF] text-slate-950'
                    : 'bg-white/10 hover:bg-[#90D5FF] hover:text-slate-950'
                }`}
              >
                <FileDown className="w-4 h-4" />
              </button>
            </div>

            <button
              onClick={() => {
                setCsvMenuOpen(null);
                setIsSlidebarOpen(false);
              }}
              className="w-8 h-8 rounded-lg bg-white/10 hover:bg-rose-500 text-white flex items-center justify-center transition-colors cursor-pointer"
              title={language === 'EN' ? 'Close menu' : 'Fermer le menu'}
            >
              <X className="w-4 h-4" />
            </button>

            {/* Dropdown Menu Importer CSV — Contenu strictement dans les limites du panneau latéral */}
            {csvMenuOpen === 'slidebar-import' && (
              <div className="absolute left-2 right-2 top-full mt-1.5 max-w-[calc(100vw-24px)] rounded-xl bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xl border-2 border-[#0284c7] dark:border-[#90D5FF] p-1.5 z-[9999] whitespace-normal">
                <div className="px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-[#0c4a6e] dark:text-[#90D5FF] border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <span>Importer un fichier CSV (UTF-8)</span>
                  <button
                    type="button"
                    onClick={() => setCsvMenuOpen(null)}
                    className="text-slate-400 hover:text-slate-700 dark:hover:text-white font-bold cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => csvPlanInputRef.current?.click()}
                  className="w-full px-2.5 py-2 text-left text-[11px] font-extrabold hover:bg-sky-50 dark:hover:bg-sky-950/60 rounded-lg flex items-start gap-2 transition-colors cursor-pointer whitespace-normal break-words leading-snug"
                >
                  <FileSpreadsheet className="w-4 h-4 text-[#0284c7] dark:text-[#90D5FF] shrink-0 mt-0.5" />
                  <span className="flex-1">
                    Importer la Planification (Macroplanning) depuis un CSV
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => csvRaciInputRef.current?.click()}
                  className="w-full px-2.5 py-2 text-left text-[11px] font-extrabold hover:bg-sky-50 dark:hover:bg-sky-950/60 rounded-lg flex items-start gap-2 border-t border-slate-100 dark:border-slate-800 transition-colors cursor-pointer whitespace-normal break-words leading-snug"
                >
                  <Users className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                  <span className="flex-1">
                    Importer la Matrice RACI depuis un CSV
                  </span>
                </button>
              </div>
            )}

            {/* Dropdown Menu Exporter CSV — Contenu strictement dans les limites du panneau latéral */}
            {csvMenuOpen === 'slidebar-export' && (
              <div className="absolute left-2 right-2 top-full mt-1.5 max-w-[calc(100vw-24px)] rounded-xl bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xl border-2 border-[#0284c7] dark:border-[#90D5FF] p-1.5 z-[9999] whitespace-normal">
                <div className="px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-[#0c4a6e] dark:text-[#90D5FF] border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <span>Exporter en CSV Excel (UTF-8 BOM)</span>
                  <button
                    type="button"
                    onClick={() => setCsvMenuOpen(null)}
                    className="text-slate-400 hover:text-slate-700 dark:hover:text-white font-bold cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
                <button
                  type="button"
                  onClick={handleExportPlanificationCSV}
                  className="w-full px-2.5 py-2 text-left text-[11px] font-extrabold hover:bg-sky-50 dark:hover:bg-sky-950/60 rounded-lg flex items-start gap-2 transition-colors cursor-pointer whitespace-normal break-words leading-snug"
                >
                  <FileSpreadsheet className="w-4 h-4 text-[#0284c7] dark:text-[#90D5FF] shrink-0 mt-0.5" />
                  <span className="flex-1">
                    Exporter la Planification (Macroplanning) en CSV
                  </span>
                </button>
                <button
                  type="button"
                  onClick={handleExportRaciCSV}
                  className="w-full px-2.5 py-2 text-left text-[11px] font-extrabold hover:bg-sky-50 dark:hover:bg-sky-950/60 rounded-lg flex items-start gap-2 border-t border-slate-100 dark:border-slate-800 transition-colors cursor-pointer whitespace-normal break-words leading-snug"
                >
                  <Users className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                  <span className="flex-1">
                    Exporter la Matrice RACI en CSV
                  </span>
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const ok = await downloadProgramFolderZip(activeDossier.name);
                    setCsvMenuOpen(null);
                    if (ok) {
                      showToast(
                        language === 'EN'
                          ? `Complete folder "faab-plan/${activeDossier.name}/" exported as ZIP.`
                          : `Dossier complet "faab-plan/${activeDossier.name}/" exporté en archive ZIP.`
                      );
                    } else {
                      showToast(
                        language === 'EN'
                          ? `Please save at least one document for "${activeDossier.name}" first.`
                          : `Veuillez d'abord enregistrer au moins un document pour le programme "${activeDossier.name}".`
                      );
                    }
                  }}
                  className="w-full px-2.5 py-2 text-left text-[11px] font-extrabold hover:bg-sky-50 dark:hover:bg-sky-950/60 rounded-lg flex items-start gap-2 border-t border-slate-100 dark:border-slate-800 transition-colors cursor-pointer whitespace-normal break-words leading-snug"
                >
                  <FolderOpen className="w-4 h-4 text-[#0284c7] dark:text-[#90D5FF] shrink-0 mt-0.5" />
                  <span className="flex-1">
                    {language === 'EN'
                      ? `Export entire folder: faab-plan/${activeDossier.name}/*.zip`
                      : `Exporter tout le dossier : faab-plan/${activeDossier.name}/*.zip`}
                  </span>
                </button>
              </div>
            )}
          </div>

          {/* Executive Google Auth Status in Slidebar */}
          <AuthStatusButton
            user={authUser}
            isAuthLoading={isAuthLoading}
            isSigningIn={isSigningIn}
            onSignIn={handleGoogleSignIn}
            onSignOut={handleSignOut}
            language={language}
            variant="slidebar"
            onLockDevice={() => {
              setIsSlidebarOpen(false);
              setIsDeviceLocked(true);
              setSuperAdminAuthModalStep('device_locked');
              setIsSuperAdminAuthModalOpen(true);
            }}
          />

          {/* SCROLLABLE CONTAINER: Logo + Description below the icons scrolls up with mobile swipe! */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-200 dark:divide-slate-800">
            {/* Scrollable Logo & Brand Header */}
            <div className="p-4 bg-gradient-to-b from-[#0c4a6e] to-[#082f49] text-white">
              <div className="flex items-center gap-3">
                <div className="shrink-0 flex items-center justify-center">
                  <AppLogo className="w-16 h-16 sm:w-20 sm:h-20" />
                </div>
                <div className="min-w-0">
                  <div className="inline-block px-2 py-0.5 rounded bg-[#90D5FF] text-slate-950 text-[9px] font-black uppercase tracking-widest mb-1">
                    {language === 'EN' ? 'UNIVERSAL PLATFORM' : 'PLATEFORME UNIVERSELLE'}
                  </div>
                  <h2 className="text-base font-black tracking-tight uppercase truncate">
                    faab gar
                  </h2>
                  <p className="text-[11px] text-[#90D5FF] font-medium leading-snug">
                    {language === 'EN'
                      ? 'Strategic Planning, PERT Network, RACI, M&E & Reports'
                      : 'Planification Stratégique, Réseau PERT, RACI, Suivi & Rapports'}
                  </p>
                </div>
              </div>
              {lastJsonFileName && (
                <div className="mt-2.5 px-2.5 py-1 rounded bg-white/10 text-[10px] font-mono text-[#90D5FF] truncate">
                  {language === 'EN' ? 'Active JSON:' : 'JSON actif :'} {lastJsonFileName}
                </div>
              )}
            </div>

            {/* Contenu du menu déroulant sous le header : taille de police 12px en mode mobile */}
            <div className="slidebar-menu-content divide-y divide-slate-200 dark:divide-slate-800">
              {/* Sélecteur de Portefeuille / Dossier UNIQUEMENT */}
              <div className="p-2.5 sm:p-3 bg-sky-50/60 dark:bg-slate-800/50 space-y-1 sm:space-y-1.5">
                <label className="block text-[12px] sm:text-[10px] font-black uppercase tracking-wider text-[#0284c7] dark:text-[#90D5FF] leading-none">
                  {language === 'EN' ? 'Portfolio / Dossier' : 'Portefeuille / Dossier'}
                </label>
                <select
                  value={activeDossier.id}
                  onChange={e => {
                    setActiveDossierId(e.target.value);
                    setFilterAxeId('ALL');
                    setFilterProjectId('ALL');
                    const found = dossiers.find(d => d.id === e.target.value);
                    if (found)
                      showToast(
                        language === 'EN'
                          ? `Selected dossier: ${found.name}`
                          : `Dossier sélectionné : ${found.name}`
                      );
                  }}
                  className="w-full h-8 sm:h-auto bg-white dark:bg-slate-900 px-2 py-1 sm:px-2.5 sm:py-1.5 rounded-md sm:rounded-lg border border-[#90D5FF] dark:border-slate-700 text-[12px] sm:text-xs font-extrabold text-slate-900 dark:text-white focus:outline-none truncate"
                >
                  {dossiers.map(d => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Navigation Modules organized into 5 groups (including GAR Methodology) */}
              <div className="p-3 space-y-4">
                {navGroups.map((group, groupIdx) => (
                  <div
                    key={groupIdx}
                    className={`space-y-1 ${
                      groupIdx > 0
                        ? 'pt-3 border-t border-slate-200/80 dark:border-slate-800'
                        : ''
                    }`}
                  >
                    {groupIdx === 4 && (
                      <div className="px-2.5 py-1.5 mb-1.5 rounded-lg bg-gradient-to-r from-[#0c4a6e] to-[#082f49] text-[#90D5FF] text-[10px] font-black uppercase tracking-wider flex items-center justify-between border border-[#0284c7]/60 shadow-2xs">
                        <span>{t.nav.garPhase}</span>
                        <span className="px-1.5 py-0.5 rounded bg-[#90D5FF] text-slate-950 text-[9px] font-black">
                          10 Onglets
                        </span>
                      </div>
                    )}
                    {group.map(item => {
                      const isActive = activeTab === item.id;
                      return (
                        <button
                          key={item.id}
                          onClick={() => navigateTo(item.id)}
                          className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-[12px] sm:text-xs font-bold transition-all cursor-pointer ${
                            isActive
                              ? 'bg-[#0c4a6e] text-white shadow-xs'
                              : 'text-slate-700 dark:text-slate-200 hover:bg-sky-50 dark:hover:bg-slate-800'
                          }`}
                        >
                          <span className="flex items-center gap-2.5 truncate">
                            <span
                              className={
                                isActive ? 'text-[#90D5FF]' : 'text-[#0284c7]'
                              }
                            >
                              {item.icon}
                            </span>
                            <span className="truncate text-[12px] sm:text-xs">{item.label}</span>
                          </span>
                          {item.badge && (
                            <span
                              className={`px-1.5 py-0.5 rounded text-[12px] sm:text-[10px] font-black ${
                                isActive
                                  ? 'bg-[#90D5FF] text-slate-950'
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                              }`}
                            >
                              {item.badge}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </aside>
      </div>
    );
  };

  // ============================================================================
  // VIEW: TABLEAU DE BORD DÉCISIONNEL (Exact 2 Charts from User Screenshot!)
  // ============================================================================
  const renderDashboardView = () => {
    const delayedRows = flatTaskRows.filter(
      r =>
        r.metrics.effectiveStatus === 'Bloqué' ||
        r.metrics.ecartFinDays > 0 ||
        r.metrics.ecartDebutDays > 0
    );

    // Prepare per-project operational breakdown for Chart 1
    const projectChartData = filteredProjects.map(proj => {
      const pTasks = proj.tasks || [];
      let done = 0;
      let inProgress = 0;
      let todo = 0;
      let blocked = 0;
      let late = 0;

      pTasks.forEach(tk => {
        const m = computeTaskMetrics(tk, todayISO);
        if (m.effectiveStatus === 'Terminé') done++;
        else if (m.effectiveStatus === 'En cours') inProgress++;
        else if (m.effectiveStatus === 'Bloqué') blocked++;
        else todo++;

        if (m.ecartFinDays > 0 || m.ecartDebutDays > 0) {
          late++;
        }
      });

      return {
        id: proj.id,
        name: proj.name,
        done,
        inProgress,
        todo,
        blocked,
        total: pTasks.length,
        late
      };
    });

    const maxBarValue = Math.max(
      8,
      ...projectChartData.map(d => Math.max(d.total, d.late, 1))
    );
    const yAxisMax = Math.ceil(maxBarValue / 2) * 2;
    const yTicks = [
      0,
      Math.round(yAxisMax * 0.25),
      Math.round(yAxisMax * 0.5),
      Math.round(yAxisMax * 0.75),
      yAxisMax
    ];

    // Prepare Donut Chart segments for Chart 2 ("Répartition par Statut")
    const totalActiveOps = allDossierTasks.length;
    const donutSegments = [
      {
        label: language === 'EN' ? 'Blocked' : 'Bloquées',
        count: statusCounts.Bloqué,
        color: '#ef4444'
      },
      {
        label: language === 'EN' ? 'In Progress' : 'En cours',
        count: statusCounts['En cours'],
        color: '#0ea5e9'
      },
      {
        label: language === 'EN' ? 'Completed' : 'Terminées',
        count: statusCounts.Terminé,
        color: '#10b981'
      },
      {
        label: language === 'EN' ? 'To Do' : 'À faire',
        count: statusCounts['À faire'],
        color: '#94a3b8'
      }
    ];

    const donutRadius = 64;
    const donutCircumference = 2 * Math.PI * donutRadius;
    let cumulativeFraction = 0;

    return (
      <div className="space-y-2.5 sm:space-y-5">
        {renderMacroFilterBar()}

        {/* 4 KPI Cards (Reduced size & font-size on mobile!) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-1.5 sm:gap-3">
          <div className="bg-white dark:bg-slate-900 p-2 sm:p-4 rounded-lg sm:rounded-xl border border-slate-200 dark:border-slate-800 border-l-3 sm:border-l-4 border-l-[#0c4a6e] shadow-xs">
            <div className="flex items-center justify-between text-[8.5px] sm:text-xs font-bold text-slate-500 dark:text-slate-400 uppercase leading-tight">
              <span className="truncate">
                {language === 'EN' ? 'Axes & Projects' : 'Axes & Projets'}
              </span>
              <Layers className="w-3 h-3 sm:w-4 sm:h-4 text-[#0284c7] shrink-0" />
            </div>
            <div className="mt-0.5 sm:mt-2 text-xs sm:text-2xl font-black text-slate-900 dark:text-white leading-tight truncate">
              {(activeDossier.axes || []).length} Axes /{' '}
              {availableProjectsInFilter.length} Proj.
            </div>
            <div className="mt-0.5 sm:mt-1 text-[8px] sm:text-[11px] text-slate-500 truncate leading-tight">
              Dossier : <strong className="text-[#0284c7]">{activeDossier.name}</strong>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-2 sm:p-4 rounded-lg sm:rounded-xl border border-slate-200 dark:border-slate-800 border-l-3 sm:border-l-4 border-l-[#0284c7] shadow-xs">
            <div className="flex items-center justify-between text-[8.5px] sm:text-xs font-bold text-slate-500 dark:text-slate-400 uppercase leading-tight">
              <span className="truncate">
                {language === 'EN' ? 'Activities & Milestones' : 'Activités & Jalons'}
              </span>
              <Target className="w-3 h-3 sm:w-4 sm:h-4 text-[#0284c7] shrink-0" />
            </div>
            <div className="mt-0.5 sm:mt-2 text-xs sm:text-2xl font-black text-slate-900 dark:text-white leading-tight truncate">
              {allDossierTasks.length} {language === 'EN' ? 'Item(s)' : 'Élément(s)'}
            </div>
            <div className="mt-0.5 sm:mt-1 text-[8px] sm:text-[11px] text-emerald-600 font-bold truncate leading-tight">
              {statusCounts.Terminé} {language === 'EN' ? 'done' : 'terminé(s)'} •{' '}
              {statusCounts['En cours']} {language === 'EN' ? 'in progress' : 'en cours'}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-2 sm:p-4 rounded-lg sm:rounded-xl border border-slate-200 dark:border-slate-800 border-l-3 sm:border-l-4 border-l-emerald-500 shadow-xs">
            <div className="flex items-center justify-between text-[8.5px] sm:text-xs font-bold text-slate-500 dark:text-slate-400 uppercase leading-tight">
              <span className="truncate">
                {language === 'EN' ? 'Consolidated Budget' : 'Budget Consolidé'}
              </span>
              <DollarSign className="w-3 h-3 sm:w-4 sm:h-4 text-emerald-500 shrink-0" />
            </div>
            <div className="mt-0.5 sm:mt-2 text-[11px] sm:text-xl font-black text-slate-900 dark:text-white truncate leading-tight">
              {formatCurrency(totalBudgetFCFA, currency, language)}
            </div>
            <div className="mt-0.5 sm:mt-1 text-[8px] sm:text-[11px] text-slate-500 truncate leading-tight">
              Horizon : {activeDossier.horizonPlan}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-2 sm:p-4 rounded-lg sm:rounded-xl border border-slate-200 dark:border-slate-800 border-l-3 sm:border-l-4 border-l-[#90D5FF] shadow-xs">
            <div className="flex items-center justify-between text-[8.5px] sm:text-xs font-bold text-slate-500 dark:text-slate-400 uppercase leading-tight">
              <span className="truncate">
                {language === 'EN' ? 'Completion Rate' : 'Taux d’Achèvement'}
              </span>
              <TrendingUp className="w-3 h-3 sm:w-4 sm:h-4 text-[#0284c7] shrink-0" />
            </div>
            <div className="mt-0.5 sm:mt-2 text-xs sm:text-2xl font-black text-[#0284c7] dark:text-[#90D5FF] leading-tight">
              {completionPct}%
            </div>
            <div className="w-full h-1 sm:h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden mt-1 sm:mt-2">
              <div
                className="h-full bg-[#0284c7]"
                style={{ width: `${Math.min(100, completionPct)}%` }}
              />
            </div>
          </div>
        </div>

        {/* THE 2 EXACT CHARTS FROM ATTACHED SCREENSHOT (2/3 Left + 1/3 Right) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-2.5 sm:gap-4">
          {/* Chart 1 (2/3 width): Répartition opérationnelle par Projet */}
          <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 p-2.5 sm:p-5 shadow-sm flex flex-col justify-between">
            <div>
              <h3 className="text-[11px] sm:text-base font-extrabold text-slate-800 dark:text-white mb-1.5 sm:mb-3 flex items-center gap-1.5 sm:gap-2">
                <Briefcase className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-rose-600 dark:text-[#90D5FF] shrink-0" />
                <span>
                  {language === 'EN'
                    ? 'Operational Breakdown by Project'
                    : 'Répartition opérationnelle par Projet'}
                </span>
              </h3>

              {/* Legend matching the screenshot */}
              <div className="flex flex-wrap items-center justify-center gap-x-2.5 sm:gap-x-4 gap-y-1 text-[8.5px] sm:text-[11px] font-medium mb-2 sm:mb-4">
                <span className="inline-flex items-center gap-1 text-[#ef4444]">
                  <span className="w-2 h-2 sm:w-3 sm:h-3 rounded-xs bg-[#ef4444] inline-block" />
                  {language === 'EN' ? 'Blocked (Bottlenecks)' : 'Bloquées (Goulots)'}
                </span>
                <span className="inline-flex items-center gap-1 text-[#8b5cf6]">
                  <span className="w-2 h-2 sm:w-3 sm:h-3 rounded-xs bg-[#8b5cf6] inline-block" />
                  {language === 'EN' ? 'Delayed' : 'En Retard'}
                </span>
                <span className="inline-flex items-center gap-1 text-[#0ea5e9]">
                  <span className="w-2 h-2 sm:w-3 sm:h-3 rounded-xs bg-[#0ea5e9] inline-block" />
                  {language === 'EN' ? 'In Progress' : 'En cours'}
                </span>
                <span className="inline-flex items-center gap-1 text-[#10b981]">
                  <span className="w-2 h-2 sm:w-3 sm:h-3 rounded-xs bg-[#10b981] inline-block" />
                  {language === 'EN' ? 'Completed' : 'Terminées'}
                </span>
                <span className="inline-flex items-center gap-1 text-[#64748b]">
                  <span className="w-2 h-2 sm:w-3 sm:h-3 rounded-xs bg-[#64748b] inline-block" />
                  {language === 'EN' ? 'Total Tasks' : 'Total Tâches'}
                </span>
                <span className="inline-flex items-center gap-1 text-[#94a3b8]">
                  <span className="w-2 h-2 sm:w-3 sm:h-3 rounded-xs bg-[#94a3b8] inline-block" />
                  {language === 'EN' ? 'To Do' : 'À faire'}
                </span>
              </div>
            </div>

            {projectChartData.length === 0 ? (
              <p className="text-xs text-slate-400 italic py-8 sm:py-12 text-center">
                {language === 'EN'
                  ? 'No project for this filter.'
                  : 'Aucun projet pour ce filtre.'}
              </p>
            ) : (
              <div className="relative pt-1 sm:pt-2 pb-1">
                {/* Chart Plot Area */}
                <div className="flex items-end h-36 sm:h-56">
                  {/* Y-axis labels */}
                  <div className="flex flex-col justify-between h-28 sm:h-48 pr-1.5 sm:pr-2 text-[8.5px] sm:text-[11px] font-mono text-slate-400 select-none">
                    {[...yTicks].reverse().map((tick, idx) => (
                      <span key={idx} className="leading-none">
                        {tick}
                      </span>
                    ))}
                  </div>

                  {/* Bars + Horizontal Gridlines */}
                  <div className="relative flex-1 h-28 sm:h-48 border-l border-b border-slate-300 dark:border-slate-700 flex items-end justify-around px-1.5 sm:px-6">
                    {/* Horizontal dashed gridlines */}
                    <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
                      {yTicks.map((_, idx) => (
                        <div
                          key={idx}
                          className="w-full border-t border-dashed border-slate-200 dark:border-slate-800"
                        />
                      ))}
                    </div>

                    {/* Grouped Bars per Project */}
                    {projectChartData.map(proj => {
                      const scalePct = (val: number) =>
                        yAxisMax > 0
                          ? Math.min(100, (val / yAxisMax) * 100)
                          : 0;

                      const donePct = scalePct(proj.done);
                      const inProgPct = scalePct(proj.inProgress);
                      const todoPct = scalePct(proj.todo);
                      const blockedPct = scalePct(proj.blocked);
                      const totalPct = scalePct(proj.total);
                      const latePct = scalePct(proj.late);

                      return (
                        <div
                          key={proj.id}
                          className="relative z-10 flex flex-col items-center h-full justify-end group max-w-[140px] flex-1"
                        >
                          <div className="flex items-end justify-center gap-1 sm:gap-2 w-full h-full px-0.5 sm:px-1">
                            {/* Bar 1: Stacked Status Breakdown (Terminées + En cours + À faire + Bloquées) */}
                            <div
                              className="w-3.5 sm:w-7 h-full flex flex-col-reverse justify-start rounded-t overflow-hidden"
                              title={`${proj.name} — Terminées: ${proj.done}, En cours: ${proj.inProgress}, À faire: ${proj.todo}, Bloquées: ${proj.blocked}`}
                            >
                              {proj.done > 0 && (
                                <div
                                  style={{ height: `${donePct}%` }}
                                  className="w-full bg-[#10b981] transition-all"
                                />
                              )}
                              {proj.inProgress > 0 && (
                                <div
                                  style={{ height: `${inProgPct}%` }}
                                  className="w-full bg-[#0ea5e9] transition-all"
                                />
                              )}
                              {proj.todo > 0 && (
                                <div
                                  style={{ height: `${todoPct}%` }}
                                  className="w-full bg-[#94a3b8] transition-all"
                                />
                              )}
                              {proj.blocked > 0 && (
                                <div
                                  style={{ height: `${blockedPct}%` }}
                                  className="w-full bg-[#ef4444] transition-all"
                                />
                              )}
                            </div>

                            {/* Bar 2: Total Tâches */}
                            <div className="w-3.5 sm:w-7 h-full flex items-end">
                              <div
                                style={{ height: `${totalPct}%` }}
                                className="w-full bg-[#64748b] rounded-t transition-all"
                                title={`${proj.name} — Total Tâches: ${proj.total}`}
                              />
                            </div>

                            {/* Bar 3: En Retard */}
                            <div className="w-3.5 sm:w-7 h-full flex items-end">
                              <div
                                style={{
                                  height: `${
                                    proj.late > 0 ? Math.max(4, latePct) : 0
                                  }%`
                                }}
                                className="w-full bg-[#8b5cf6] rounded-t transition-all"
                                title={`${proj.name} — En Retard: ${proj.late}`}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* X-axis Project Labels */}
                <div className="flex pl-4 sm:pl-6 pt-1 sm:pt-2 justify-around gap-1 sm:gap-2">
                  {projectChartData.map(proj => (
                    <div
                      key={proj.id}
                      className="text-center text-[8.5px] sm:text-[11px] font-medium text-slate-600 dark:text-slate-300 max-w-[140px] flex-1 leading-tight line-clamp-2"
                      title={proj.name}
                    >
                      {proj.name}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Chart 2 (1/3 width): Répartition par Statut (Donut Chart) */}
          <div className="bg-white dark:bg-slate-900 rounded-xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 p-2.5 sm:p-5 shadow-sm flex flex-col justify-between">
            <h3 className="text-[11px] sm:text-base font-extrabold text-slate-800 dark:text-white mb-1 sm:mb-2 flex items-center gap-1.5 sm:gap-2">
              <TrendingUp className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-rose-600 dark:text-[#90D5FF] shrink-0" />
              <span>
                {language === 'EN' ? 'Breakdown by Status' : 'Répartition par Statut'}
              </span>
            </h3>

            {/* SVG Donut Chart */}
            <div className="flex flex-col items-center justify-center my-1 sm:my-2">
              <div className="relative w-28 h-28 sm:w-44 sm:h-44 flex items-center justify-center">
                <svg
                  className="w-28 h-28 sm:w-44 sm:h-44 -rotate-90"
                  viewBox="0 0 160 160"
                >
                  {totalActiveOps === 0 ? (
                    <circle
                      cx="80"
                      cy="80"
                      r={donutRadius}
                      fill="transparent"
                      stroke="#e2e8f0"
                      strokeWidth="22"
                    />
                  ) : (
                    donutSegments.map(seg => {
                      if (seg.count <= 0) return null;
                      const fraction = seg.count / totalActiveOps;
                      const dashLength = Math.max(
                        0,
                        fraction * donutCircumference - 2
                      );
                      const dashOffset =
                        -cumulativeFraction * donutCircumference;
                      cumulativeFraction += fraction;

                      return (
                        <circle
                          key={seg.label}
                          cx="80"
                          cy="80"
                          r={donutRadius}
                          fill="transparent"
                          stroke={seg.color}
                          strokeWidth="22"
                          strokeDasharray={`${dashLength} ${donutCircumference}`}
                          strokeDashoffset={dashOffset}
                        >
                          <title>{`${seg.label}: ${seg.count}`}</title>
                        </circle>
                      );
                    })
                  )}
                </svg>
              </div>

              {/* Donut Legend */}
              <div className="flex flex-wrap items-center justify-center gap-x-2.5 sm:gap-x-4 gap-y-1 text-[8.5px] sm:text-xs font-medium mt-2 sm:mt-3">
                <span className="inline-flex items-center gap-1 text-[#ef4444]">
                  <span className="w-2 h-2 sm:w-3 sm:h-3 rounded-xs bg-[#ef4444] inline-block" />
                  {language === 'EN' ? 'Blocked' : 'Bloquées'}
                </span>
                <span className="inline-flex items-center gap-1 text-[#0ea5e9]">
                  <span className="w-2 h-2 sm:w-3 sm:h-3 rounded-xs bg-[#0ea5e9] inline-block" />
                  {language === 'EN' ? 'In Progress' : 'En cours'}
                </span>
                <span className="inline-flex items-center gap-1 text-[#10b981]">
                  <span className="w-2 h-2 sm:w-3 sm:h-3 rounded-xs bg-[#10b981] inline-block" />
                  {language === 'EN' ? 'Completed' : 'Terminées'}
                </span>
                <span className="inline-flex items-center gap-1 text-[#94a3b8]">
                  <span className="w-2 h-2 sm:w-3 sm:h-3 rounded-xs bg-[#94a3b8] inline-block" />
                  {language === 'EN' ? 'To Do' : 'À faire'}
                </span>
              </div>
            </div>

            {/* Footer Total */}
            <div className="pt-2 sm:pt-3 border-t border-slate-100 dark:border-slate-800 text-center text-[9.5px] sm:text-xs text-slate-500 dark:text-slate-400">
              {language === 'EN'
                ? 'Total active operations:'
                : 'Total des opérations actives :'}{' '}
              <strong className="text-slate-900 dark:text-white font-black">
                {totalActiveOps}
              </strong>
            </div>
          </div>
        </div>

        {/* BOTTLENECKS & ALERTS SECTION (BELOW THE 2 CHARTS) */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm">
          <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-slate-900 dark:text-white mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            {language === 'EN'
              ? `Bottlenecks & Variance Alerts (${delayedRows.length})`
              : `Goulots d’étranglement & Alertes d’Écarts (${delayedRows.length})`}
          </h3>
          {delayedRows.length === 0 ? (
            <div className="p-4 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 text-xs font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              {language === 'EN'
                ? 'No bottleneck or critical variance detected on active tasks.'
                : 'Aucun goulot d’étranglement ni écart critique détecté sur les tâches actives.'}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {delayedRows.map(r => (
                <div
                  key={r.task.id}
                  className="p-3 rounded-lg bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 flex items-start justify-between gap-3"
                >
                  <div>
                    <div className="text-xs font-black text-slate-900 dark:text-white">
                      <span className="font-mono text-[#0c4a6e] dark:text-[#90D5FF] mr-1.5">
                        [{r.code}]
                      </span>
                      {r.task.name}
                    </div>
                    <div className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
                      {language === 'EN' ? 'Owner:' : 'Responsable :'}{' '}
                      <strong>{r.task.assignee}</strong> •{' '}
                      {language === 'EN' ? 'Planned end:' : 'Fin prévue :'}{' '}
                      {r.task.endDate}
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-amber-500 text-slate-950 text-[10px] font-black shrink-0">
                    {r.metrics.effectiveStatus === 'Bloqué'
                      ? language === 'EN'
                        ? 'BLOCKED'
                        : 'BLOQUÉ'
                      : r.metrics.ecartFinLabel}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  // ============================================================================
  // VIEW: RÉSEAU PERT (Zoom out down to 10% = 0.10!)
  // ============================================================================
  const renderPertView = () => {
    const pertSummaries = computeDossierPertSummary(activeDossier, todayISO).filter(
      ps => filterProjectId === 'ALL' || ps.projectId === filterProjectId
    );
    const allNodes = pertSummaries.flatMap(p => p.nodes);

    // Group nodes by level for SVG layout
    const levelsMap = new Map<number, typeof allNodes>();
    allNodes.forEach(n => {
      const list = levelsMap.get(n.level) || [];
      list.push(n);
      levelsMap.set(n.level, list);
    });
    const maxLevel = Math.max(0, ...Array.from(levelsMap.keys()));
    const maxNodesInLevel = Math.max(
      1,
      ...Array.from(levelsMap.values()).map(l => l.length)
    );

    const colWidth = 250;
    const rowHeight = 130;
    const svgWidth = Math.max(820, (maxLevel + 1) * colWidth + 120);
    const svgHeight = Math.max(420, maxNodesInLevel * rowHeight + 100);

    const nodePositions = new Map<string, { x: number; y: number }>();
    Array.from(levelsMap.entries()).forEach(([lvl, nodes]) => {
      nodes.forEach((node, idx) => {
        const x = 60 + lvl * colWidth;
        const y = 50 + idx * rowHeight;
        nodePositions.set(node.id, { x, y });
      });
    });

    return (
      <div className="space-y-4">
        {renderMacroFilterBar()}

        {/* PERT Controls Bar (Zoom down to 10% = 0.10) */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-3 shadow-sm flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-white uppercase tracking-tight flex items-center gap-2">
              <Network className="w-4 h-4 text-[#0284c7] dark:text-[#90D5FF]" />
              {language === 'EN'
                ? 'PERT Network & Critical Path (CPM)'
                : 'Réseau PERT & Chemin Critique (CPM)'}
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {language === 'EN'
                ? 'Zoom out down to 10% to view the entire PERT graph on mobile and desktop'
                : 'Dézoomez jusqu’à 10% pour visualiser l’intégralité du graphe PERT sur mobile et ordinateur'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Switch Graph / Table */}
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
              <button
                onClick={() => setPertViewMode('graph')}
                className={`px-3 py-1 rounded text-xs font-bold transition-all cursor-pointer ${
                  pertViewMode === 'graph'
                    ? 'bg-[#0c4a6e] text-white'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                {language === 'EN' ? 'PERT Graph View' : 'Vue Graphique PERT'}
              </button>
              <button
                onClick={() => setPertViewMode('table')}
                className={`px-3 py-1 rounded text-xs font-bold transition-all cursor-pointer ${
                  pertViewMode === 'table'
                    ? 'bg-[#0c4a6e] text-white'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                {language === 'EN'
                  ? 'Predecessor / Chain Table View'
                  : 'Vue Tableau Antécéd. / Précéd.'}
              </button>
            </div>

            {/* Zoom Controls allowing down to 10% (0.10) */}
            {pertViewMode === 'graph' && (
              <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-lg">
                <button
                  onClick={() =>
                    setPertZoom(z => Math.max(0.1, Number((z - 0.1).toFixed(2))))
                  }
                  className="p-1 rounded hover:bg-white dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 cursor-pointer"
                  title={
                    language === 'EN' ? 'Zoom out down to 10%' : "Dézoomer jusqu'à 10%"
                  }
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="text-[11px] font-black text-slate-800 dark:text-slate-200 min-w-[44px] text-center">
                  {Math.round(pertZoom * 100)}%
                </span>
                <button
                  onClick={() =>
                    setPertZoom(z => Math.min(2.0, Number((z + 0.1).toFixed(2))))
                  }
                  className="p-1 rounded hover:bg-white dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 cursor-pointer"
                  title={language === 'EN' ? 'Zoom in +' : 'Zoomer +'}
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setPertZoom(0.1)}
                  className="px-1.5 py-0.5 rounded bg-sky-100 dark:bg-slate-700 text-[#0c4a6e] dark:text-[#90D5FF] text-[9px] font-black cursor-pointer"
                  title={language === 'EN' ? 'Zoom out to 10%' : 'Dézoomer à 10%'}
                >
                  10%
                </button>
                <button
                  onClick={() => setPertZoom(1)}
                  className="p-1 rounded hover:bg-white dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 cursor-pointer"
                  title={language === 'EN' ? 'Reset to 100%' : 'Réinitialiser à 100%'}
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Dynamic PERT Interpretation Cards */}
        <div className="space-y-3">
          {pertSummaries.map(ps => (
            <div
              key={ps.projectId}
              className="bg-sky-50/80 dark:bg-slate-900 rounded-xl border border-[#90D5FF] dark:border-sky-800 p-4 space-y-2"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-black uppercase tracking-wider text-[#0c4a6e] dark:text-[#90D5FF]">
                  {ps.projectName} —{' '}
                  {language === 'EN' ? 'Total Duration:' : 'Durée Totale :'}{' '}
                  {ps.projectDuration}j
                </span>
                <span className="px-2.5 py-0.5 rounded bg-[#0c4a6e] text-white text-[10px] font-black">
                  {language === 'EN' ? 'Critical Path:' : 'Chemin Critique :'}{' '}
                  {ps.criticalPathCodes.join(' → ') || 'N/A'}
                </span>
              </div>
              <p className="text-xs text-slate-700 dark:text-slate-300">
                {ps.interpretation.criticalPathSummary}
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                {ps.interpretation.slackSummary}
              </p>
              <p className="text-xs font-bold text-slate-900 dark:text-white">
                {ps.interpretation.riskAndSteeringSummary}
              </p>
            </div>
          ))}
        </div>

        {pertViewMode === 'graph' ? (
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm overflow-auto max-h-[70vh]">
            <div
              style={{
                transform: `scale(${pertZoom})`,
                transformOrigin: 'top left',
                width: svgWidth * pertZoom,
                height: svgHeight * pertZoom
              }}
            >
              <svg width={svgWidth} height={svgHeight} className="overflow-visible">
                <defs>
                  <marker
                    id="arrow-normal"
                    markerWidth="8"
                    markerHeight="8"
                    refX="6"
                    refY="4"
                    orient="auto"
                  >
                    <path d="M0,0 L8,4 L0,8 Z" fill="#0284c7" />
                  </marker>
                  <marker
                    id="arrow-crit"
                    markerWidth="8"
                    markerHeight="8"
                    refX="6"
                    refY="4"
                    orient="auto"
                  >
                    <path d="M0,0 L8,4 L0,8 Z" fill="#f59e0b" />
                  </marker>
                </defs>

                {/* Dependency Edges */}
                {allNodes.map(node => {
                  if (!node.antecedentId || node.antecedentId === '—') return null;
                  const from = nodePositions.get(node.antecedentId);
                  const to = nodePositions.get(node.id);
                  if (!from || !to) return null;
                  const predNode = allNodes.find(n => n.id === node.antecedentId);
                  const isCritEdge = node.isCritical && predNode?.isCritical;

                  const x1 = from.x + 175;
                  const y1 = from.y + 42;
                  const x2 = to.x;
                  const y2 = to.y + 42;
                  const midX = (x1 + x2) / 2;

                  return (
                    <path
                      key={`${node.antecedentId}->${node.id}`}
                      d={`M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`}
                      fill="none"
                      stroke={isCritEdge ? '#f59e0b' : '#0284c7'}
                      strokeWidth={isCritEdge ? 3 : 1.8}
                      strokeDasharray={isCritEdge ? undefined : '4 2'}
                      markerEnd={
                        isCritEdge ? 'url(#arrow-crit)' : 'url(#arrow-normal)'
                      }
                    />
                  );
                })}

                {/* PERT Nodes */}
                {allNodes.map(node => {
                  const pos = nodePositions.get(node.id);
                  if (!pos) return null;
                  return (
                    <g
                      key={node.id}
                      transform={`translate(${pos.x}, ${pos.y})`}
                    >
                      <rect
                        width={175}
                        height={86}
                        rx={10}
                        fill={node.isCritical ? '#fffbeb' : '#f0f9ff'}
                        stroke={node.isCritical ? '#f59e0b' : '#0284c7'}
                        strokeWidth={node.isCritical ? 2.5 : 1.5}
                      />
                      <text
                        x={10}
                        y={18}
                        fontSize={11}
                        fontWeight="900"
                        fill="#0c4a6e"
                      >
                        {node.code} ({node.duration}j)
                      </text>
                      {node.isCritical && (
                        <text
                          x={114}
                          y={18}
                          fontSize={9}
                          fontWeight="900"
                          fill="#d97706"
                        >
                          CRITIQUE
                        </text>
                      )}
                      <text x={10} y={34} fontSize={9.5} fill="#334155">
                        {node.name.length > 24
                          ? `${node.name.slice(0, 24)}…`
                          : node.name}
                      </text>
                      <line
                        x1={8}
                        y1={42}
                        x2={167}
                        y2={42}
                        stroke="#cbd5e1"
                        strokeWidth={1}
                      />
                      <text x={10} y={56} fontSize={9} fill="#0f172a">
                        ES: J+{node.es} | EF: J+{node.ef}
                      </text>
                      <text x={10} y={70} fontSize={9} fill="#0f172a">
                        LS: J+{node.ls} | LF: J+{node.lf}
                      </text>
                      <text
                        x={114}
                        y={78}
                        fontSize={8.5}
                        fontWeight="bold"
                        fill={node.totalFloat === 0 ? '#d97706' : '#0284c7'}
                      >
                        MT: {node.totalFloat}j
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>
        ) : (
          /* PERT Table: Code | Activité / Jalon | Antécéd. | Précéd. */
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-x-auto">
            <table className="w-full border-collapse table-compact">
              <thead>
                <tr className="bg-[#0c4a6e] text-white">
                  <th className="text-left">Code</th>
                  <th className="text-left">
                    {language === 'EN' ? 'Activity / Milestone' : 'Activité / Jalon'}
                  </th>
                  <th className="text-center">
                    {language === 'EN' ? 'Predec.' : 'Antécéd.'}
                  </th>
                  <th className="text-left">
                    {language === 'EN'
                      ? 'Preceding (Full Chain)'
                      : 'Précéd. (Chaîne Complète)'}
                  </th>
                  <th className="text-center">
                    {language === 'EN' ? 'Duration' : 'Durée'}
                  </th>
                  <th className="text-center">
                    {language === 'EN' ? 'ES (Early)' : 'ES (Tôt)'}
                  </th>
                  <th className="text-center">
                    {language === 'EN' ? 'EF (Early)' : 'EF (Tôt)'}
                  </th>
                  <th className="text-center">
                    {language === 'EN' ? 'LS (Late)' : 'LS (Tard)'}
                  </th>
                  <th className="text-center">
                    {language === 'EN' ? 'LF (Late)' : 'LF (Tard)'}
                  </th>
                  <th className="text-center">
                    {language === 'EN' ? 'Total Float' : 'Marge Totale'}
                  </th>
                  <th className="text-center">
                    {language === 'EN' ? 'Critical Path' : 'Chemin Critique'}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {allNodes.map(node => (
                  <tr
                    key={node.id}
                    className={
                      node.isCritical
                        ? 'bg-amber-50/60 dark:bg-amber-950/30 font-bold'
                        : 'bg-white dark:bg-slate-900'
                    }
                  >
                    <td className="font-mono text-[#0c4a6e] dark:text-[#90D5FF] font-black">
                      {node.code}
                    </td>
                    <td className="text-slate-900 dark:text-white whitespace-normal break-words">
                      {node.name}
                    </td>
                    <td className="text-center font-mono text-slate-700 dark:text-slate-300">
                      {node.antecedentCode}
                    </td>
                    <td className="font-mono text-slate-600 dark:text-slate-400">
                      {node.precedingChainCodes}
                    </td>
                    <td className="text-center font-mono">{node.duration}j</td>
                    <td className="text-center font-mono">J+{node.es}</td>
                    <td className="text-center font-mono">J+{node.ef}</td>
                    <td className="text-center font-mono">J+{node.ls}</td>
                    <td className="text-center font-mono">J+{node.lf}</td>
                    <td className="text-center font-mono">{node.totalFloat}j</td>
                    <td className="text-center">
                      {node.isCritical ? (
                        <span className="px-2 py-0.5 rounded bg-amber-500 text-slate-950 text-[9px] font-black">
                          {language === 'EN' ? 'CRITICAL' : 'CRITIQUE'}
                        </span>
                      ) : (
                        <span className="text-[10px] text-emerald-600 font-bold">
                          {language === 'EN' ? 'Flexible' : 'Souple'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  // ============================================================================
  // VIEW: TABLEAU KANBAN INTERACTIF (Execution-driven + Date Recalculation)
  // ============================================================================
  const renderKanbanView = () => {
    const columns: Array<{
      status: Task['status'];
      title: string;
      headerBg: string;
    }> = [
      {
        status: 'À faire',
        title: language === 'EN' ? 'To Do' : 'À Faire',
        headerBg: 'bg-slate-700 text-white'
      },
      {
        status: 'En cours',
        title: language === 'EN' ? 'In Execution' : 'En Cours d’Exécution',
        headerBg: 'bg-[#0284c7] text-white'
      },
      {
        status: 'Bloqué',
        title: language === 'EN' ? 'Blocked / Delayed' : 'Bloqué / Retard',
        headerBg: 'bg-amber-500 text-slate-950'
      },
      {
        status: 'Terminé',
        title: language === 'EN' ? 'Completed' : 'Terminé',
        headerBg: 'bg-emerald-600 text-white'
      }
    ];

    return (
      <div className="space-y-2.5 sm:space-y-4">
        {renderMacroFilterBar()}

        <div className="bg-white dark:bg-slate-900 rounded-lg sm:rounded-xl border border-slate-200 dark:border-slate-800 p-2 sm:p-3 shadow-sm">
          <h2 className="text-xs sm:text-base font-black text-slate-900 dark:text-white uppercase tracking-tight flex items-center gap-1.5 sm:gap-2">
            <Kanban className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#0284c7] dark:text-[#90D5FF] shrink-0" />
            <span>
              {language === 'EN'
                ? 'Kanban Board (Consultation Mode)'
                : 'Tableau Kanban (Mode Consultation)'}
            </span>
          </h2>
          <p className="text-[9.5px] sm:text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
            {language === 'EN'
              ? 'View task status and progress per execution column in read-only mode.'
              : 'Consultez le statut et l’avancement des tâches par colonne d’exécution en mode lecture seule.'}
          </p>
        </div>

        {/* HORIZONTAL KANBAN COLUMNS (Side-by-side horizontally on mobile & desktop!) */}
        <div className="flex flex-row overflow-x-auto lg:grid lg:grid-cols-4 gap-2 sm:gap-3 pb-2">
          {columns.map(col => {
            const colRows = flatTaskRows.filter(
              r => r.metrics.effectiveStatus === col.status
            );

            return (
              <div
                key={col.status}
                className="min-w-[205px] w-[205px] sm:min-w-[245px] sm:w-[245px] lg:min-w-0 lg:w-auto shrink-0 bg-slate-100/80 dark:bg-slate-900/70 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden"
              >
                <div
                  className={`px-2.5 py-2 sm:px-3 sm:py-2.5 ${col.headerBg} flex items-center justify-between font-black text-[10px] sm:text-xs uppercase`}
                >
                  <span className="truncate">{col.title}</span>
                  <span className="px-1.5 sm:px-2 py-0.5 rounded-full bg-black/20 text-[9px] sm:text-[10px] shrink-0">
                    {colRows.length}
                  </span>
                </div>

                <div className="p-2 sm:p-2.5 space-y-2 sm:space-y-2.5 flex-1 max-h-[65vh] overflow-y-auto">
                  {colRows.map(r => {
                    const { task, code, projectId, metrics } = r;
                    const isJalon = task.type === 'jalon';

                    return (
                      <div
                        key={task.id}
                        className={`rounded-lg border p-2 sm:p-3 shadow-xs space-y-1.5 sm:space-y-2 ${
                          isJalon
                            ? 'bg-sky-50/80 dark:bg-slate-800/70 border-[#90D5FF]'
                            : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-1.5 sm:gap-2">
                          <span
                            className={`px-1.5 py-0.5 rounded font-mono text-[9px] sm:text-[10px] font-black shrink-0 ${
                              isJalon
                                ? 'bg-[#90D5FF] text-slate-950'
                                : 'bg-[#0c4a6e] text-white'
                            }`}
                          >
                            {code}
                          </span>
                          <span className="text-[8.5px] sm:text-[10px] font-black text-[#0284c7] dark:text-[#90D5FF] text-right leading-tight">
                            {task.phase} • {metrics.plannedDurationLabel}
                          </span>
                        </div>

                        <div className="text-[10.5px] sm:text-xs font-extrabold text-slate-900 dark:text-white leading-snug">
                          {isJalon ? `◆ ${task.name}` : task.name}
                        </div>

                        <div className="text-[9px] sm:text-[10px] text-slate-500 dark:text-slate-400 space-y-0.5">
                          <div className="truncate">
                            {language === 'EN' ? 'Assignee:' : 'Réalisateur :'}{' '}
                            {task.assignee}
                          </div>
                          <div>
                            {language === 'EN' ? 'Planned:' : 'Prévu:'}{' '}
                            {task.startDate} → {task.endDate}
                          </div>
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
    );
  };

  return (
    <div
      className={`min-h-screen flex flex-col ${
        !isUnlocked || activeTab === 'accueil'
          ? 'bg-transparent'
          : 'bg-slate-50 dark:bg-slate-950'
      } text-slate-900 dark:text-slate-100`}
    >
      {/* Hidden JSON & CSV File Inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        onChange={handleImportJSON}
        className="hidden"
      />
      <input
        ref={csvPlanInputRef}
        type="file"
        accept=".csv,text/csv"
        onChange={handleImportPlanificationCSV}
        className="hidden"
      />
      <input
        ref={csvRaciInputRef}
        type="file"
        accept=".csv,text/csv"
        onChange={handleImportRaciCSV}
        className="hidden"
      />

      {/* Slidebar Drawer */}
      {renderSlidebar()}

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-4 right-4 z-50 bg-[#0c4a6e] text-white px-4 py-2.5 rounded-xl shadow-xl border border-[#90D5FF] flex items-center gap-2 text-xs font-bold">
          <CheckCircle2 className="w-4 h-4 text-[#90D5FF] shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* MOBILE ONLY ON OTHER TABS (activeTab !== 'accueil'): Burger Icon (Regular Users) + App Icon right next to it */}
      {isUnlocked && activeTab !== 'accueil' && (
        <div className="md:hidden fixed top-2 left-2 z-40 flex items-center gap-1.5 no-print">
          {isRegularUserUnlocked && (
            <button
              onClick={() => setIsSlidebarOpen(true)}
              aria-label="Ouvrir le menu déroulant"
              title="Menu faab gar"
              className="w-10 h-10 rounded-xl bg-[#0c4a6e] text-[#90D5FF] hover:bg-[#90D5FF] hover:text-slate-950 flex items-center justify-center transition-all border border-[#90D5FF]/70 shadow-md cursor-pointer shrink-0"
            >
              <Menu className="w-6 h-6" />
            </button>
          )}

          <button
            onClick={() => navigateTo('accueil')}
            aria-label="Accueil faab gar"
            title="Accueil faab gar"
            className="w-10 h-10 rounded-xl bg-[#0c4a6e]/90 p-0.5 flex items-center justify-center border border-[#90D5FF]/80 shadow-md cursor-pointer shrink-0"
          >
            <AppLogo className="w-full h-full" />
          </button>
        </div>
      )}

      {/* INSTITUTIONAL NAVBAR: Locked at top of screen on scroll (fixed top-0 left-0 right-0 z-40). Visible on ALL screens on Home Page (accueil), and on Tablet/Desktop (md:block) on other tabs (No header on Mobile on other tabs) */}
      <header
        className={`${
          !isUnlocked || activeTab === 'accueil' ? 'block' : 'hidden md:block'
        } fixed top-0 left-0 right-0 z-40 bg-[#0c4a6e] text-white border-b-2 border-[#90D5FF] shadow-md no-print`}
      >
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2 sm:py-2.5 flex items-center gap-2.5 sm:gap-4">
          {/* Burger Menu Button (STRICT DOM REMOVAL: Only mounted when Regular User is unlocked; Super Admin has a dedicated Console button) */}
          {isRegularUserUnlocked && (
            <button
              onClick={() => setIsSlidebarOpen(true)}
              aria-label="Ouvrir le menu déroulant"
              title="Ouvrir le menu déroulant"
              className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-sky-950/80 text-[#90D5FF] hover:bg-[#90D5FF] hover:text-slate-950 flex items-center justify-center transition-all border border-[#90D5FF]/60 shadow-sm cursor-pointer shrink-0"
            >
              <Menu className="w-6 h-6" />
            </button>
          )}
          {isSuperAdminUnlocked && activeTab === 'accueil' && (
            <button
              onClick={() => navigateTo('super_admin')}
              aria-label="Ouvrir la Console Super Admin"
              title="Ouvrir la Console Super Admin"
              className="px-3 h-10 sm:h-11 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 flex items-center gap-1.5 transition-all border border-amber-300 shadow-sm cursor-pointer shrink-0 text-xs font-black uppercase tracking-wider"
            >
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">Console Admin</span>
            </button>
          )}

          <div
            onClick={() => navigateTo('accueil')}
            className="flex items-center gap-2.5 sm:gap-3 cursor-pointer select-none min-w-0 flex-1"
          >
            <div className="w-11 h-11 sm:w-12 sm:h-12 shrink-0 flex items-center justify-center">
              <AppLogo className="w-full h-full" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-black tracking-wider text-white leading-tight truncate">
                faab gar
              </h1>
              <p className="text-[10px] sm:text-[11px] font-semibold text-[#90D5FF] leading-tight truncate">
                {t.appSubtitle}
              </p>
            </div>
          </div>

          {/* Bouton en icône "Mise à jour" sur la page d'accueil pour recharger et actualiser l'application faab gar */}
          {(!isUnlocked || activeTab === 'accueil') && (
            <button
              type="button"
              onClick={async () => {
                showToast(
                  language === 'EN'
                    ? 'Updating faab gar application...'
                    : 'Mise à jour et rechargement de faab gar en cours...'
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
                }, 300);
              }}
              title={
                language === 'EN'
                  ? 'Update & Reload faab gar Application'
                  : 'Mise à jour : Recharger l’application pour la mettre à jour'
              }
              aria-label={language === 'EN' ? 'Update App' : 'Mise à jour'}
              className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 border border-amber-300 transition-all cursor-pointer shrink-0 shadow-sm"
            >
              <RefreshCw className="w-4 h-4 shrink-0" />
            </button>
          )}

          {/* Le bouton de Scanner QR / Badge apparaît UNIQUEMENT dans l'espace Utilisateur déverrouillé (jamais pour Super Admin ni sur l'accueil) */}
          {isRegularUserUnlocked && activeTab !== 'accueil' && (
            <button
              type="button"
              onClick={() => setIsGlobalScannerOpen(true)}
              title={
                language === 'EN'
                  ? 'Scan QR Code (vCard) or Badge Barcode (CODE-128)'
                  : 'Scanner un QR Code (vCard) ou Code-Barres Badge (CODE-128)'
              }
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 h-9 rounded-xl bg-sky-950/90 hover:bg-[#90D5FF] text-[#90D5FF] hover:text-slate-950 border border-[#90D5FF]/60 text-[10px] sm:text-xs font-extrabold transition-all cursor-pointer shrink-0 shadow-sm"
            >
              <QrCode className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">
                {language === 'EN' ? 'QR / Badge Scanner' : 'Scanner QR / Badge'}
              </span>
            </button>
          )}

          {/* Bouton d'État Authentification Google / Gmail */}
          <AuthStatusButton
            user={authUser}
            isAuthLoading={isAuthLoading}
            isSigningIn={isSigningIn}
            onSignIn={handleGoogleSignIn}
            onSignOut={handleSignOut}
            language={language}
            variant="header"
            onLockDevice={() => {
              setIsDeviceLocked(true);
              setSuperAdminAuthModalStep('device_locked');
              setIsSuperAdminAuthModalOpen(true);
            }}
          />
        </div>

        {/* BARRE DE NAVIGATION DES SECTIONS DE LA PAGE D'ACCUEIL (Uniquement sur la page d'accueil, en dessous du logo et de l'intitulé) */}
        {(!isUnlocked || activeTab === 'accueil') && (
          <nav
            aria-label="Sections explicatives de la page d'accueil"
            className="border-t border-sky-800/80 bg-[#082f49]/95 backdrop-blur-xs relative"
          >
            <div
              ref={homeNavScrollRef}
              className="max-w-7xl mx-auto py-2 flex items-center gap-2 sm:gap-3 overflow-x-auto hide-scrollbar scroll-smooth"
            >
              {/* Left spacer so the first section title can also position horizontally at the exact center of the navbar */}
              <div
                className="shrink-0 w-[36vw] sm:w-[40vw] lg:w-[42%]"
                aria-hidden="true"
              />
              {[
                {
                  id: 'section-presentation',
                  label:
                    language === 'FR'
                      ? '1. Présentation Générale'
                      : '1. Overview'
                },
                {
                  id: 'section-utilisation',
                  label:
                    language === 'FR'
                      ? '2. Mode d’Emploi & Modules'
                      : '2. Modules & Workflow'
                },
                {
                  id: 'section-documents',
                  label:
                    language === 'FR'
                      ? '3. Documents & Matrices'
                      : '3. 22 Documents & Matrices'
                },
                {
                  id: 'section-cibles',
                  label:
                    language === 'FR'
                      ? '4. Publics Cibles & Domaines'
                      : '4. Target Audiences & Sectors'
                },
                {
                  id: 'section-offres',
                  label:
                    language === 'FR'
                      ? '5. Offres Commerciales'
                      : '5. Commercial Plans'
                },
                {
                  id: 'section-methodologie',
                  label:
                    language === 'FR'
                      ? '6. Méthodologie GAR & PERT'
                      : '6. RBM & PERT Methodology'
                },
                {
                  id: 'section-sauvegarde',
                  label:
                    language === 'FR'
                      ? '7. Sauvegarde JSON'
                      : '7. JSON Backup'
                },
                {
                  id: 'section-credits',
                  label:
                    language === 'FR'
                      ? '8. Crédits & Légal'
                      : '8. Credits & Legal'
                }
              ].map(sec => {
                const isActiveSec = activeHomeSection === sec.id;
                return (
                  <button
                    key={sec.id}
                    ref={el => {
                      homeNavBtnRefs.current[sec.id] = el;
                    }}
                    type="button"
                    aria-current={isActiveSec ? 'location' : undefined}
                    onClick={() => {
                      setActiveHomeSection(sec.id);
                      const el = document.getElementById(sec.id);
                      if (el) {
                        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }
                    }}
                    className={`px-3 sm:px-3.5 py-1.5 rounded-lg text-[10px] sm:text-xs font-extrabold tracking-tight whitespace-nowrap transition-all duration-300 cursor-pointer shrink-0 flex items-center gap-1.5 ${
                      isActiveSec
                        ? 'bg-[#90D5FF] text-slate-950 border-2 border-white ring-2 ring-[#90D5FF]/70 shadow-lg scale-105'
                        : 'bg-sky-900/60 hover:bg-[#90D5FF]/80 text-sky-100/80 hover:text-slate-950 border border-[#90D5FF]/30 hover:border-[#90D5FF] opacity-80 hover:opacity-100 scale-95'
                    }`}
                  >
                    {isActiveSec && (
                      <span className="w-2 h-2 rounded-full bg-[#0c4a6e] animate-pulse shrink-0" />
                    )}
                    <span>{sec.label}</span>
                  </button>
                );
              })}
              {/* Right spacer so the last section title can also position horizontally at the exact center of the navbar */}
              <div
                className="shrink-0 w-[36vw] sm:w-[40vw] lg:w-[42%]"
                aria-hidden="true"
              />
            </div>
          </nav>
        )}
      </header>

      {/* Compensating Spacer for Fixed Header (so content is never covered at the top) */}
      <div
        aria-hidden="true"
        className={
          !isUnlocked || activeTab === 'accueil'
            ? 'h-[98px] sm:h-[106px] shrink-0 no-print'
            : 'hidden md:block md:h-[62px] shrink-0 no-print'
        }
      />

      {/* MAIN CONTENT AREA */}
      <main
        className={`flex-1 max-w-7xl w-full mx-auto px-2 sm:px-6 ${
          !isUnlocked || activeTab === 'accueil' ? 'pt-3 md:pt-5' : 'pt-14 md:pt-5'
        } pb-4`}
      >
        {(!isUnlocked || activeTab === 'accueil') && (
          <LandingPage
            isDark={theme === 'dark'}
            language={language}
            lastJsonFileName={lastJsonFileName}
            onOpenSlidebar={() => {
              if (!authUser) {
                handleGoogleSignIn();
                return;
              }
              if (!isPinVerified || isDeviceLocked) {
                setSuperAdminAuthModalStep(
                  isDeviceLocked ? 'device_locked' : 'pin_and_biometric'
                );
                setIsSuperAdminAuthModalOpen(true);
                return;
              }
              if (isSuperAdminEmail(authUser.email)) {
                navigateTo('super_admin');
              } else {
                setIsSlidebarOpen(true);
              }
            }}
            onNavigateTab={navigateTo}
          />
        )}

        {isRegularUserUnlocked && activeTab === 'profil' && (
          <UserProfileView
            userProfile={userProfile}
            setUserProfile={setUserProfile}
            currency={currency}
            setCurrency={setCurrency}
            language={language}
            setLanguage={setLanguage}
            onNavigateTab={navigateTo}
            currentUser={authUser}
            onShowToast={showToast}
          />
        )}

        {isRegularUserUnlocked &&
          (activeTab === 'projects' || activeTab === 'super_admin') && (
          <DossiersAndProjectsView
            dossiers={dossiers}
            activeDossier={activeDossier}
            setActiveDossierId={setActiveDossierId}
            onCreateDossier={createDossierDirect}
            onUpdateDossier={handleUpdateDossier}
            onDeleteDossier={handleDeleteDossier}
            onAddAxe={handleAddAxe}
            onUpdateAxeName={handleUpdateAxeName}
            onDeleteAxe={handleDeleteAxe}
            onAddProject={handleAddProject}
            onUpdateProjectName={handleUpdateProjectName}
            onDeleteProject={handleDeleteProject}
            currency={currency}
            language={language}
            onNavigateTab={navigateTo}
          />
        )}

        {isRegularUserUnlocked && activeTab === 'dashboard' && renderDashboardView()}

        <Suspense
          fallback={
            <div className="py-12 flex flex-col items-center justify-center gap-3 text-slate-600 dark:text-slate-300 animate-pulse">
              <div className="w-7 h-7 border-3 border-[#0c4a6e] dark:border-[#90D5FF] border-t-transparent rounded-full animate-spin" />
              <span className="text-xs font-extrabold uppercase tracking-wider">
                {language === 'EN'
                  ? 'Loading faab gar module...'
                  : 'Chargement fluide du module faab gar...'}
              </span>
            </div>
          }
        >
          {isRegularUserUnlocked && activeTab === 'gantt' && (
            <GanttAndTreeView
              dossier={activeDossier}
              currency={currency}
              language={language}
              filterAxeId={filterAxeId}
              setFilterAxeId={setFilterAxeId}
              filterProjectId={filterProjectId}
              setFilterProjectId={setFilterProjectId}
              onUpdateTask={handleUpdateTask}
            />
          )}

          {isRegularUserUnlocked &&
            (activeTab === 'planification' ||
              activeTab === 'processus' ||
              activeTab === 'raci') && (
            <OperationalMatrices
              mode={activeTab as 'planification' | 'processus' | 'raci'}
              dossier={activeDossier}
              currency={currency}
              language={language}
              filterAxeId={filterAxeId}
              setFilterAxeId={setFilterAxeId}
              filterProjectId={filterProjectId}
              setFilterProjectId={setFilterProjectId}
              onAddAxe={handleAddAxe}
              onUpdateAxeName={handleUpdateAxeName}
              onDeleteAxe={handleDeleteAxe}
              onAddProject={handleAddProject}
              onUpdateProjectName={handleUpdateProjectName}
              onDeleteProject={handleDeleteProject}
              onAddTaskInPhase={handleAddTaskInPhase}
              onUpdateTask={handleUpdateTask}
              onDeleteTask={handleDeleteTask}
            />
          )}

          {isRegularUserUnlocked && activeTab === 'categorie' && (
            <CategoriesActorsView
              dossier={activeDossier}
              dossiers={dossiers}
              onSelectDossier={setActiveDossierId}
              userProfile={userProfile}
              onUpdateUserProfile={setUserProfile}
              language={language}
              filterAxeId={filterAxeId}
              setFilterAxeId={setFilterAxeId}
              filterProjectId={filterProjectId}
              setFilterProjectId={setFilterProjectId}
              onUpdateCategorizedActors={handleUpdateCategorizedActors}
              onRenameActorInRaci={(oldName, newName) => {
                updateActiveDossier(d =>
                  renameActorInDossierTasks(d, oldName, newName)
                );
              }}
              onApplyProfileToDoc={(docType, fields) => {
                Object.entries(fields).forEach(([k, v]) => {
                  if (v !== undefined) {
                    handleUpdateDocField(
                      docType,
                      k as keyof CustomDocFields,
                      String(v)
                    );
                  }
                });
              }}
              onNavigateToDocGen={() => {
                navigateTo('docgen');
              }}
            />
          )}

          {isRegularUserUnlocked && activeTab === 'pert' && renderPertView()}

          {isRegularUserUnlocked && activeTab === 'kanban' && renderKanbanView()}

          {isRegularUserUnlocked && activeTab === 'fiche' && (
            <FicheTechniquePages
              dossier={activeDossier}
              userProfile={userProfile}
              currency={currency}
              language={language}
            />
          )}

          {isSuperAdminUnlocked &&
            activeTab !== 'accueil' &&
            authUser && (
              <SuperAdminDashboardView
                currentUser={authUser}
                language={language}
                onLockDevice={() => {
                  setIsDeviceLocked(true);
                  setSuperAdminAuthModalStep('device_locked');
                  setIsSuperAdminAuthModalOpen(true);
                }}
                onSignOut={handleSignOut}
                onShowToast={showToast}
              />
            )}

          {isRegularUserUnlocked && activeTab === 'docgen' && (
            <DocumentGeneratorView
              dossier={activeDossier}
              userProfile={userProfile}
              currency={currency}
              language={language}
              customDocsData={activeProgramCustomDocsData}
              onUpdateDocField={handleUpdateDocField}
              onResetDocDefaults={handleResetDocDefaults}
              filterAxeId={filterAxeId}
              setFilterAxeId={setFilterAxeId}
              filterProjectId={filterProjectId}
              setFilterProjectId={setFilterProjectId}
            />
          )}

          {isRegularUserUnlocked && isGarTab(activeTab) && (
            <GarMethodologyViews
              activeTab={activeTab}
              onNavigateTab={navigateTo}
              activeDossier={activeDossier}
              onUpdateDossier={updateActiveDossier}
              userProfile={userProfile}
              currency={currency}
              language={language}
              filterAxeId={filterAxeId}
              filterProjectId={filterProjectId}
              renderMacroFilterBar={renderMacroFilterBar}
              showToast={showToast}
            />
          )}
        </Suspense>
      </main>

      {/* Modale Fiche Acteur Interne ouverte depuis l'onglet Catégorie */}
      {isRegularUserUnlocked && isCategoryProfileModalOpen && (
        <Suspense fallback={null}>
          <InternalActorProfileModal
            isOpen={isCategoryProfileModalOpen}
            onClose={() => setIsCategoryProfileModalOpen(false)}
            initialActorName={selectedCategoryActorName}
            allActorsList={activeRaciContext.internalOnlyActors}
            raciContextInfo={{
              rList: activeRaciContext.rList,
              aList: activeRaciContext.aList,
              cList: activeRaciContext.cList,
              iList: activeRaciContext.iList
            }}
            dossier={activeDossier}
            userProfile={userProfile}
            language={language}
            currency={currency}
            executingOrgName={
              activeDossier.institution ||
              userProfile.institution ||
              'Organisation Pilote du Programme'
            }
            executingDepartment="Direction du Pilotage Stratégique & PMO"
            onApplyToDoc={(docType, fields) => {
              Object.entries(fields).forEach(([k, v]) => {
                if (v !== undefined) {
                  handleUpdateDocField(docType, k as keyof CustomDocFields, v);
                }
              });
            }}
            onSelectDocType={docType => {
              navigateTo('docgen');
            }}
          />
        </Suspense>
      )}

      {/* Modale Globale Scanner QR Code & Code-Barres (Contrôle d'Accès Interne & vCard) */}
      {isRegularUserUnlocked && isGlobalScannerOpen && (
        <Suspense fallback={null}>
          <QrBarcodeScannerModal
            isOpen={isGlobalScannerOpen}
            onClose={() => setIsGlobalScannerOpen(false)}
            dossier={activeDossier}
            userProfile={userProfile}
            language={language}
          />
        </Suspense>
      )}

      {/* Modale de Sécurité Post-Google Sign-In : Code PIN (0000 par défaut, saisie clavier appareil), Touch ID / Face ID & Réinitialisation Gmail */}
      <SuperAdminAuthModal
        isOpen={isSuperAdminAuthModalOpen || isDeviceLocked}
        initialStep={
          isDeviceLocked ? 'device_locked' : superAdminAuthModalStep
        }
        currentUser={authUser}
        language={language}
        onClose={() => {
          if (!isDeviceLocked && isPinVerified) {
            setIsSuperAdminAuthModalOpen(false);
          }
        }}
        onAuthenticatedSuccess={(verifiedUser, assignedRole) => {
          setAuthUser(verifiedUser);
          void syncFirebaseUserToRegistry(verifiedUser);
          setIsPinVerified(true);
          setSessionPinVerifiedForUser(verifiedUser.uid, true);
          setIsDeviceLocked(false);
          setIsSuperAdminAuthModalOpen(false);

          if (
            assignedRole === 'super_admin' ||
            isSuperAdminEmail(verifiedUser.email)
          ) {
            setActiveTab('super_admin');
            showToast(
              language === 'EN'
                ? 'Welcome Super Administrator! Exclusive Console unlocked.'
                : 'Bienvenue Super Administrateur ! Console exclusive déverrouillée.'
            );
          } else {
            setActiveTab(prev =>
              prev === 'accueil' || prev === 'super_admin'
                ? 'projects'
                : prev
            );
            showToast(
              language === 'EN'
                ? `Welcome! User workspace unlocked (${verifiedUser.email})`
                : `Bienvenue ! Espace Utilisateur déverrouillé (${verifiedUser.email})`
            );
          }
        }}
        onSignOut={handleSignOut}
      />

      {/* Modale de Diagnostic Domaine Firebase non autorisé & Popups bloquées */}
      {isAuthHelpModalOpen && (
        <FirebaseAuthHelpModal
          isOpen={isAuthHelpModalOpen}
          onClose={() => setIsAuthHelpModalOpen(false)}
          onRetryGooglePopup={() => {
            setIsAuthHelpModalOpen(false);
            handleDirectGooglePopupRetry();
          }}
          onContinueLocalSession={() => {
            setIsAuthHelpModalOpen(false);
            const localUser: FirebaseUser = {
              uid: 'local-faab-gar-user',
              email: userProfile.email || 'utilisateur@faab-gar.org',
              displayName: userProfile.fullName || 'Utilisateur FAAB GAR',
              photoURL: null
            };
            setAuthUser(localUser);
            void syncFirebaseUserToRegistry(localUser);
            setIsPinVerified(false);
            setSessionPinVerifiedForUser(localUser.uid, false);
            setSuperAdminAuthModalStep('pin_and_biometric');
            setIsSuperAdminAuthModalOpen(true);
          }}
          errorCode={authErrorCode}
          errorMessage={authErrorMessage}
          language={language}
        />
      )}

      {/* INSTITUTIONAL FOOTER — ONLY ON HOME PAGE (accueil) OR WHEN UNCONNECTED / LOCKED */}
      {(!isUnlocked || activeTab === 'accueil') && (
        <footer className="relative z-10 bg-[#0c4a6e] text-white border-t-4 border-[#90D5FF] mt-12">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="shrink-0 flex items-center justify-center">
                <AppLogo className="w-16 h-16 sm:w-20 sm:h-20" />
              </div>
              <div>
                <div className="text-sm font-black uppercase tracking-wider text-white">
                  {language === 'EN'
                    ? 'faab gar — STRATEGIC & OPERATIONAL STEERING'
                    : 'faab gar — PILOTAGE STRATÉGIQUE & OPÉRATIONNEL'}
                </div>
                <div className="text-xs text-[#90D5FF]">
                  {language === 'EN'
                    ? 'Creator & Lead Architect: KOFFIE FABIEN MICHAEL'
                    : 'Créateur & Architecte Principal : KOFFIE FABIEN MICHAEL'}
                </div>
                <div className="text-[11px] text-sky-200 mt-0.5">
                  {language === 'EN'
                    ? 'Local IndexedDB Persistence • JSON Backup • Pure White A4 PDF Exports'
                    : 'Persistance Locale IndexedDB • Sauvegarde JSON • Exports PDF A4 Fond Blanc Pur'}
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:items-end items-center gap-2.5 text-center sm:text-right text-xs text-sky-200">
              {/* Language & Currency Selectors in Footer of Homepage */}
              <div className="flex flex-wrap items-center justify-center sm:justify-end gap-2">
                <div className="flex items-center gap-2 bg-sky-950/80 border border-[#90D5FF]/50 rounded-xl px-3 py-1.5 shadow-sm">
                  <Globe className="w-4 h-4 text-[#90D5FF] shrink-0" />
                  <label
                    htmlFor="footer-language-select"
                    className="text-[11px] font-bold uppercase tracking-wider text-[#90D5FF]"
                  >
                    {language === 'EN' ? 'Language :' : 'Langue :'}
                  </label>
                  <select
                    id="footer-language-select"
                    value={language}
                    onChange={e => setLanguage(e.target.value as LanguageCode)}
                    className="bg-[#0c4a6e] text-white text-xs font-extrabold px-2 py-0.5 rounded-lg border border-[#90D5FF]/60 focus:outline-none focus:ring-2 focus:ring-[#90D5FF] cursor-pointer"
                  >
                    <option value="FR">Français (FR)</option>
                    <option value="EN">English (EN)</option>
                  </select>
                </div>

                <div className="flex items-center gap-2 bg-sky-950/80 border border-[#90D5FF]/50 rounded-xl px-3 py-1.5 shadow-sm">
                  <DollarSign className="w-4 h-4 text-[#90D5FF] shrink-0" />
                  <label
                    htmlFor="footer-currency-select"
                    className="text-[11px] font-bold uppercase tracking-wider text-[#90D5FF]"
                  >
                    {language === 'EN' ? 'Currency :' : 'Devise :'}
                  </label>
                  <select
                    id="footer-currency-select"
                    value={currency}
                    onChange={e => setCurrency(e.target.value as CurrencyCode)}
                    className="bg-[#0c4a6e] text-white text-xs font-extrabold px-2 py-0.5 rounded-lg border border-[#90D5FF]/60 focus:outline-none focus:ring-2 focus:ring-[#90D5FF] cursor-pointer"
                  >
                    <option value="FCFA">FCFA (XOF)</option>
                    <option value="EUR">Euro (€ - EUR)</option>
                    <option value="USD">Dollar ($ - USD)</option>
                  </select>
                </div>
              </div>

              <div>
                <div className="font-bold text-white">
                  © {new Date().getFullYear()} faab gar •{' '}
                  {language === 'EN' ? 'All rights reserved' : 'Tous droits réservés'}
                </div>
                <div className="text-[11px] text-[#90D5FF]">
                  {language === 'EN'
                    ? 'Universal & Multi-Project Web Application'
                    : 'Application Web Universelle & Multi-Projets'}
                </div>
              </div>
            </div>
          </div>
        </footer>
      )}
    </div>
  );
}

export default App;
