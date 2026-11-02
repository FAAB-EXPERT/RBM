import React, { useMemo, useState } from 'react';
import {
  Printer,
  FileSpreadsheet,
  SlidersHorizontal,
  Sparkles,
  ImagePlus,
  Trash2,
  AlertTriangle,
  Filter,
  Briefcase,
  CheckSquare,
  Plus,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  Users,
  CreditCard,
  UserCheck,
  QrCode,
  ShieldCheck
} from 'lucide-react';
import {
  InstitutionalDocType,
  CustomDocFields,
  CustomDocsMap,
  FieldPhotoItem,
  UserProfile,
  Dossier,
  CurrencyCode,
  LanguageCode
} from '../types';
import {
  DOC_TEMPLATE_CONFIGS,
  getDocImageFieldDescriptors,
  DocTemplateConfig,
  DocFieldDescriptor,
  DocImageFieldKey,
  buildDynamicFieldsFromAppTabs,
  buildInstitutionalDocPages,
  supportsFieldPhotosAnnex,
  parseFieldPhotos,
  parseExcludedFields,
  getDocFieldHierarchyAndAlignment,
  HIDE_SIGNATURES_KEY
} from '../docTemplates';
import {
  MASTER_MATRICES_DEFINITIONS,
  DOC_TO_MATRICES_MAP,
  MasterMatrixId,
  AllMatricesData,
  buildDefaultMatricesFromApp,
  resolveActiveMatricesData,
  computeMatrixRowCalculations,
  createEmptyMatrixRow,
  getMatrixCompletionStats,
  serializeMatrixToMarkdown,
  resolveProgramRaciContext
} from '../docMatrices';
import { defaultCustomDocsData } from '../db';
import { generateInstitutionalDocumentPDF } from '../pdfExport';
import { convertFromFCFA, convertToFCFA, formatCurrency } from '../i18n';
import { AppLogo } from './AppLogo';
import {
  buildInstitutionalSlideDeck,
  isSlidePresentationDoc
} from '../slidePresentations';
import { SlideDeckWorkspace } from './SlideDeckWorkspace';
import { InternalActorProfileModal } from './InternalActorProfileModal';
import { QrBarcodeScannerModal } from './QrBarcodeScannerModal';

interface DocumentGeneratorViewProps {
  dossier: Dossier;
  userProfile: UserProfile;
  currency: CurrencyCode;
  language: LanguageCode;
  customDocsData: CustomDocsMap;
  onUpdateDocField: (
    docType: InstitutionalDocType,
    fieldKey: keyof CustomDocFields,
    value: string
  ) => void;
  onResetDocDefaults: (docType: InstitutionalDocType) => void;
  filterAxeId?: string;
  setFilterAxeId?: (id: string) => void;
  filterProjectId?: string;
  setFilterProjectId?: (id: string) => void;
}

type MatrixFilterSelection = 'AUTO_DOC' | 'ALL' | MasterMatrixId;
type CompletionFilterMode = 'ALL' | 'MISSING' | 'PREFILLED';

export const DocumentGeneratorView: React.FC<DocumentGeneratorViewProps> = ({
  dossier,
  userProfile,
  currency,
  language,
  customDocsData,
  onUpdateDocField,
  onResetDocDefaults,
  filterAxeId = 'ALL',
  setFilterAxeId,
  filterProjectId = 'ALL',
  setFilterProjectId
}) => {
  const [selectedDocType, setSelectedDocType] = useState<InstitutionalDocType>('tdr');
  const [localAxeId, setLocalAxeId] = useState<string>('ALL');
  const [localProjectId, setLocalProjectId] = useState<string>('ALL');
  const [pendingImageDelete, setPendingImageDelete] = useState<{
    key: DocImageFieldKey;
    label: string;
  } | null>(null);

  // États du panneau « Filtrer & Renseigner les Matrices (M1 - M10) »
  const [isMatricesPanelOpen, setIsMatricesPanelOpen] = useState<boolean>(false);
  const [matrixFilterMode, setMatrixFilterMode] = useState<MatrixFilterSelection>('AUTO_DOC');
  const [completionFilter, setCompletionFilter] = useState<CompletionFilterMode>('ALL');
  const [copiedMatrixToken, setCopiedMatrixToken] = useState<string | null>(null);
  const [pendingMatrixRowDelete, setPendingMatrixRowDelete] = useState<{
    matrixId: MasterMatrixId;
    rowIndex: number;
    rowCode: string;
  } | null>(null);

  // Tiroirs auxiliaires repliables sur Desktop & Tablette pour maintenir les Champs Spécifiques en vis-à-vis direct des sections A4
  const [showDesktopImagesDrawer, setShowDesktopImagesDrawer] = useState<boolean>(false);
  const [showDesktopRaciDrawer, setShowDesktopRaciDrawer] = useState<boolean>(false);
  const [showDesktopPhotosDrawer, setShowDesktopPhotosDrawer] = useState<boolean>(false);

  // État de la page / modale des données spécifiques de l'acteur interne à l'organisme pilote
  const [selectedActorForModal, setSelectedActorForModal] = useState<string>(
    userProfile.fullName || 'Coordonnateur'
  );
  const [isActorProfileModalOpen, setIsActorProfileModalOpen] = useState<boolean>(false);
  const [isScannerModalOpen, setIsScannerModalOpen] = useState<boolean>(false);
  const [exportToastMsg, setExportToastMsg] = useState<string | null>(null);

  const showExportToast = (msg: string) => {
    setExportToastMsg(msg);
    setTimeout(() => {
      setExportToastMsg(prev => (prev === msg ? null : prev));
    }, 4500);
  };

  const handleOpenActorModal = (actorName?: string) => {
    if (actorName) {
      setSelectedActorForModal(actorName);
    }
    setIsActorProfileModalOpen(true);
  };

  const handleApplyProfileToDoc = (
    docType: InstitutionalDocType,
    fields: Partial<CustomDocFields>
  ) => {
    Object.entries(fields).forEach(([k, v]) => {
      if (v !== undefined) {
        onUpdateDocField(docType, k as keyof CustomDocFields, v);
      }
    });
  };

  const activeAxeFilter = setFilterAxeId ? filterAxeId : localAxeId;
  const activeProjectFilter = setFilterProjectId ? filterProjectId : localProjectId;

  const handleAxeChange = (val: string) => {
    if (setFilterAxeId) setFilterAxeId(val);
    else setLocalAxeId(val);
    if (setFilterProjectId) setFilterProjectId('ALL');
    else setLocalProjectId('ALL');
  };

  const handleProjectChange = (val: string) => {
    if (setFilterProjectId) setFilterProjectId(val);
    else setLocalProjectId(val);
  };

  const availableProjects = useMemo(() => {
    const axes =
      activeAxeFilter === 'ALL'
        ? dossier.axes || []
        : (dossier.axes || []).filter(a => a.id === activeAxeFilter);
    return axes.flatMap(a => a.projects || []);
  }, [dossier, activeAxeFilter]);

  // Filtered dossier view reflecting the selected Axe / Project from the app tabs
  const effectiveDossier = useMemo<Dossier>(() => {
    if (activeAxeFilter === 'ALL' && activeProjectFilter === 'ALL') {
      return dossier;
    }
    const filteredAxes = (dossier.axes || [])
      .filter(a => activeAxeFilter === 'ALL' || a.id === activeAxeFilter)
      .map(a => ({
        ...a,
        projects: (a.projects || []).filter(
          p => activeProjectFilter === 'ALL' || p.id === activeProjectFilter
        )
      }))
      .filter(a => a.projects.length > 0 || activeProjectFilter === 'ALL');

    return {
      ...dossier,
      axes: filteredAxes
    };
  }, [dossier, activeAxeFilter, activeProjectFilter]);

  const configList = useMemo<DocTemplateConfig[]>(
    () => Object.values(DOC_TEMPLATE_CONFIGS),
    []
  );

  const currentConfig = useMemo<DocTemplateConfig>(
    () => DOC_TEMPLATE_CONFIGS[selectedDocType] || DOC_TEMPLATE_CONFIGS.tdr,
    [selectedDocType]
  );

  // Automatically synchronize untouched default fields with live data from all other tabs
  const currentFields = useMemo<CustomDocFields>(() => {
    const baseDefaults = defaultCustomDocsData[selectedDocType];
    const saved = customDocsData?.[selectedDocType] || ({} as Partial<CustomDocFields>);
    const liveSynced = buildDynamicFieldsFromAppTabs(
      selectedDocType,
      {
        ...baseDefaults,
        activeQuarter: saved.activeQuarter || baseDefaults.activeQuarter,
        slidePtbaPttMode: saved.slidePtbaPttMode || baseDefaults.slidePtbaPttMode
      },
      effectiveDossier,
      userProfile,
      currency,
      language
    );

    const resolveField = (key: keyof CustomDocFields): string => {
      const savedVal = saved[key];
      const defaultVal = baseDefaults[key];
      const liveVal = liveSynced[key];
      // If user customized the field away from static default, keep user value; otherwise use live data from app tabs
      if (savedVal && savedVal.trim() !== '' && savedVal !== defaultVal) {
        return savedVal;
      }
      return (liveVal as string) || (savedVal as string) || (defaultVal as string) || '';
    };

    // Share uploaded logos/images across documents if the current document doesn't have its own override yet
    const findSharedImage = (imgKey: DocImageFieldKey): string | undefined => {
      if (saved[imgKey]) return saved[imgKey];
      for (const docKey of Object.keys(customDocsData || {}) as InstitutionalDocType[]) {
        const candidate = customDocsData?.[docKey]?.[imgKey];
        if (candidate) return candidate;
      }
      return undefined;
    };

    // Share user-edited matrices across documents if the current document doesn't have its own override yet
    // When an Axe or Project filter is active, bypass static saved matricesJson so the filtered perimeter is reflected in real time
    const findSharedMatricesJson = (): string | undefined => {
      if (activeAxeFilter !== 'ALL' || activeProjectFilter !== 'ALL') {
        return undefined;
      }
      if (saved.matricesJson) return saved.matricesJson;
      for (const docKey of Object.keys(customDocsData || {}) as InstitutionalDocType[]) {
        const candidate = customDocsData?.[docKey]?.matricesJson;
        if (candidate) return candidate;
      }
      return undefined;
    };

    return {
      ...baseDefaults,
      ...liveSynced,
      ...saved,
      activeQuarter: saved.activeQuarter || liveSynced.activeQuarter || baseDefaults.activeQuarter || 'Q1',
      slidePtbaPttMode:
        saved.slidePtbaPttMode ||
        liveSynced.slidePtbaPttMode ||
        baseDefaults.slidePtbaPttMode ||
        'PTBA',
      slidesConfigJson: saved.slidesConfigJson || '',
      referenceCode: resolveField('referenceCode'),
      locationCity: resolveField('locationCity'),
      recipientOrg: resolveField('recipientOrg'),
      donorDepartment: resolveField('donorDepartment'),
      executingOrgName: resolveField('executingOrgName'),
      executingDepartment: resolveField('executingDepartment'),
      recipientRepresentative: resolveField('recipientRepresentative'),
      contextJustification: resolveField('contextJustification'),
      specificObjectives: resolveField('specificObjectives'),
      methodologyApproach: resolveField('methodologyApproach'),
      confidentialityClauses: resolveField('confidentialityClauses'),
      governanceModalities: resolveField('governanceModalities'),
      recommendationsLessons: resolveField('recommendationsLessons'),
      extraField1: resolveField('extraField1'),
      extraField2: resolveField('extraField2'),
      extraField3: resolveField('extraField3'),
      extraField4: resolveField('extraField4'),
      extraField5: resolveField('extraField5'),
      extraField6: resolveField('extraField6'),
      extraField7: resolveField('extraField7'),
      extraField8: resolveField('extraField8'),
      extraField9: resolveField('extraField9'),
      extraField10: resolveField('extraField10'),
      extraField11: resolveField('extraField11'),
      leftLogoDataUrl: findSharedImage('leftLogoDataUrl'),
      rightLogoDataUrl: findSharedImage('rightLogoDataUrl'),
      bannerImageDataUrl: findSharedImage('bannerImageDataUrl'),
      figureImageDataUrl: findSharedImage('figureImageDataUrl'),
      orgStampDataUrl: findSharedImage('orgStampDataUrl'),
      partnerStampDataUrl: findSharedImage('partnerStampDataUrl'),
      profilePhotoDataUrl:
        findSharedImage('profilePhotoDataUrl') || userProfile.cvPhotoDataUrl || undefined,
      fieldPhotosAnnexTitle: resolveField('fieldPhotosAnnexTitle'),
      fieldPhotosJson: saved.fieldPhotosJson || baseDefaults.fieldPhotosJson || '',
      matricesJson: findSharedMatricesJson(),
      excludedFieldsJson: saved.excludedFieldsJson || ''
    };
  }, [
    selectedDocType,
    customDocsData,
    effectiveDossier,
    userProfile,
    currency,
    language,
    activeAxeFilter,
    activeProjectFilter
  ]);

  const excludedFieldKeys = useMemo<string[]>(
    () => parseExcludedFields(currentFields.excludedFieldsJson),
    [currentFields.excludedFieldsJson]
  );

  const excludedFieldsSet = useMemo<Set<string>>(
    () => new Set(excludedFieldKeys),
    [excludedFieldKeys]
  );

  const handleToggleExcludeField = (fieldKey: keyof CustomDocFields) => {
    const keyStr = String(fieldKey);
    const nextList = excludedFieldsSet.has(keyStr)
      ? excludedFieldKeys.filter(k => k !== keyStr)
      : [...excludedFieldKeys, keyStr];
    onUpdateDocField(selectedDocType, 'excludedFieldsJson', JSON.stringify(nextList));
  };

  const includeSignatures = !excludedFieldsSet.has(HIDE_SIGNATURES_KEY);

  const handleToggleSignatureBlock = () => {
    const nextList = excludedFieldsSet.has(HIDE_SIGNATURES_KEY)
      ? excludedFieldKeys.filter(k => k !== HIDE_SIGNATURES_KEY)
      : [...excludedFieldKeys, HIDE_SIGNATURES_KEY];
    onUpdateDocField(selectedDocType, 'excludedFieldsJson', JSON.stringify(nextList));
  };

  const raciContext = useMemo(
    () => resolveProgramRaciContext(effectiveDossier, userProfile),
    [effectiveDossier, userProfile]
  );

  const hasFieldPhotosSupport = useMemo(
    () => supportsFieldPhotosAnnex(selectedDocType),
    [selectedDocType]
  );

  const fieldPhotosList = useMemo<FieldPhotoItem[]>(
    () => parseFieldPhotos(currentFields.fieldPhotosJson),
    [currentFields.fieldPhotosJson]
  );

  const persistFieldPhotosList = (nextList: FieldPhotoItem[]) => {
    onUpdateDocField(selectedDocType, 'fieldPhotosJson', JSON.stringify(nextList));
  };

  // Liste dynamique des champs d'importation d'images ([IMAGE_...]) spécifiques au document sélectionné
  const activeImageFieldDescriptors = useMemo(
    () => getDocImageFieldDescriptors(selectedDocType),
    [selectedDocType]
  );

  // Données complètes des 10 Matrices Maîtresses (M1 - M10) pré-remplies depuis l'appli + modifications utilisateur
  const matricesData = useMemo<AllMatricesData>(
    () =>
      resolveActiveMatricesData(
        effectiveDossier,
        currentFields,
        userProfile,
        currency,
        language,
        currentFields.matricesJson
      ),
    [effectiveDossier, currentFields, userProfile, currency, language]
  );

  // Liste des matrices requises automatiquement par le document sélectionné (Doc 1 à 11)
  const docRequiredMatrixIds = useMemo<MasterMatrixId[]>(
    () => DOC_TO_MATRICES_MAP[selectedDocType] || [],
    [selectedDocType]
  );

  // Matrices visibles selon le filtre actif (Auto par Document, Toutes M1-M10, ou M1..M10 individuel)
  const visibleMatrixDefinitions = useMemo(() => {
    let baseList = MASTER_MATRICES_DEFINITIONS;
    if (matrixFilterMode === 'AUTO_DOC') {
      baseList = MASTER_MATRICES_DEFINITIONS.filter(m =>
        docRequiredMatrixIds.includes(m.id)
      );
    } else if (matrixFilterMode !== 'ALL') {
      baseList = MASTER_MATRICES_DEFINITIONS.filter(m => m.id === matrixFilterMode);
    }
    return baseList;
  }, [matrixFilterMode, docRequiredMatrixIds]);

  // Statistiques globales de complétion sur les matrices du document actif
  const activeDocMatricesStats = useMemo(() => {
    const targetIds =
      docRequiredMatrixIds.length > 0
        ? docRequiredMatrixIds
        : (MASTER_MATRICES_DEFINITIONS.map(m => m.id) as MasterMatrixId[]);
    let totalCells = 0;
    let filledCells = 0;
    let missingCells = 0;
    targetIds.forEach(mId => {
      const st = getMatrixCompletionStats(mId, matricesData[mId] || []);
      totalCells += st.totalCells;
      filledCells += st.filledCells;
      missingCells += st.missingCells;
    });
    return { totalCells, filledCells, missingCells };
  }, [docRequiredMatrixIds, matricesData]);

  // Sauvegarde d'une modification dans les matrices M1 - M10
  const persistMatricesUpdate = (nextMatrices: AllMatricesData) => {
    onUpdateDocField(selectedDocType, 'matricesJson', JSON.stringify(nextMatrices));
  };

  const handleMatrixCellChange = (
    matrixId: MasterMatrixId,
    rowIndex: number,
    colKey: string,
    newValue: string
  ) => {
    const currentRows = [...(matricesData[matrixId] || [])];
    const updatedRow = computeMatrixRowCalculations(matrixId, {
      ...(currentRows[rowIndex] || {}),
      [colKey]: newValue
    });
    currentRows[rowIndex] = updatedRow;
    persistMatricesUpdate({
      ...matricesData,
      [matrixId]: currentRows
    });
  };

  const handleAddMatrixRow = (matrixId: MasterMatrixId) => {
    const currentRows = [...(matricesData[matrixId] || [])];
    const newRow = createEmptyMatrixRow(matrixId, currentRows.length);
    currentRows.push(newRow);
    persistMatricesUpdate({
      ...matricesData,
      [matrixId]: currentRows
    });
  };

  const confirmDeleteMatrixRow = () => {
    if (!pendingMatrixRowDelete) return;
    const { matrixId, rowIndex } = pendingMatrixRowDelete;
    const currentRows = [...(matricesData[matrixId] || [])];
    currentRows.splice(rowIndex, 1);
    persistMatricesUpdate({
      ...matricesData,
      [matrixId]: currentRows
    });
    setPendingMatrixRowDelete(null);
  };

  const handleResetSingleMatrixFromApp = (matrixId: MasterMatrixId) => {
    const pureLiveFields = buildDynamicFieldsFromAppTabs(
      selectedDocType,
      defaultCustomDocsData[selectedDocType],
      effectiveDossier,
      userProfile,
      currency,
      language
    );
    const appDefaults = buildDefaultMatricesFromApp(
      effectiveDossier,
      pureLiveFields,
      userProfile,
      currency,
      language
    );
    persistMatricesUpdate({
      ...matricesData,
      [matrixId]: appDefaults[matrixId]
    });
  };

  const handleResetAllMatricesFromApp = () => {
    onResetDocDefaults(selectedDocType);
  };

  const handleCopyMatrixMarkdown = (matrixId: MasterMatrixId, txtVar: string) => {
    const md = serializeMatrixToMarkdown(matrixId, matricesData[matrixId] || []);
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(md).catch(() => {});
    }
    setCopiedMatrixToken(txtVar);
    setTimeout(() => setCopiedMatrixToken(null), 2000);
  };

  const isSlideMode = useMemo(
    () => isSlidePresentationDoc(selectedDocType),
    [selectedDocType]
  );

  // Build multi-page A4 document pages synchronized with all tabs & M1-M10 matrices
  const pages = useMemo(
    () =>
      isSlideMode
        ? []
        : buildInstitutionalDocPages(
            selectedDocType,
            currentFields,
            effectiveDossier,
            userProfile,
            currency,
            language
          ),
    [isSlideMode, selectedDocType, currentFields, effectiveDossier, userProfile, currency, language]
  );

  // Build 16:9 Landscape Slide Deck when a presentation template (Docs 16 to 19) is selected
  const slides = useMemo(
    () =>
      isSlideMode
        ? buildInstitutionalSlideDeck(
            selectedDocType,
            currentFields,
            effectiveDossier,
            userProfile,
            currency,
            language
          )
        : [],
    [isSlideMode, selectedDocType, currentFields, effectiveDossier, userProfile, currency, language]
  );

  const activeSlidesCount = useMemo(
    () => slides.filter(s => !s.excluded).length,
    [slides]
  );

  const handleDownloadPDF = async () => {
    const res = await generateInstitutionalDocumentPDF(
      selectedDocType,
      currentFields,
      { ...effectiveDossier, name: dossier.name },
      userProfile,
      currency,
      language
    );
    if (res) {
      showExportToast(
        language === 'EN'
          ? `✓ Document saved in programme subfolder: ${res.path}`
          : `✓ Document généré et enregistré dans le sous-dossier du programme : ${res.path}`
      );
    }
  };

  const optimizeImageFileToDataUrl = (file: File): Promise<string> => {
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = () => {
        const rawDataUrl = reader.result as string;
        const img = new Image();
        img.onload = () => {
          const maxDim = 1200;
          let w = img.naturalWidth || img.width;
          let h = img.naturalHeight || img.height;
          if (w > maxDim || h > maxDim) {
            if (w > h) {
              h = Math.round((h * maxDim) / w);
              w = maxDim;
            } else {
              w = Math.round((w * maxDim) / h);
              h = maxDim;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, w, h);
            resolve(canvas.toDataURL('image/png'));
          } else {
            resolve(rawDataUrl);
          }
        };
        img.onerror = () => resolve(rawDataUrl);
        img.src = rawDataUrl;
      };
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file);
    });
  };

  // Compress/convert uploaded image to DataURL (preserving PNG transparency & exact aspect ratio)
  const handleImageFileSelect = async (
    imageKey: DocImageFieldKey,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const optimizedDataUrl = await optimizeImageFileToDataUrl(file);
    if (optimizedDataUrl) {
      onUpdateDocField(selectedDocType, imageKey, optimizedDataUrl);
    }
  };

  const handleAddFieldPhotoSlot = () => {
    const nextIdx = fieldPhotosList.length + 1;
    const newItem: FieldPhotoItem = {
      id: `fp-${Date.now()}-${nextIdx}`,
      dataUrl: '',
      locationDate: `${currentFields.locationCity || 'Site d’intervention'} — ${new Date().toLocaleDateString(
        language === 'EN' ? 'en-US' : 'fr-FR'
      )}`,
      caption:
        language === 'EN'
          ? `Field observation #${nextIdx}: Physical verification of deliverables, site progress, and compliance with technical specifications.`
          : `Constat visuel de terrain N°${nextIdx} : Vérification physique des réalisations, état d’avancement sur site et conformité aux spécifications techniques du projet.`
    };
    persistFieldPhotosList([...fieldPhotosList, newItem]);
  };

  const handleUploadNewFieldPhotos = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files: File[] = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;

    const addedItems: FieldPhotoItem[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const dataUrl = await optimizeImageFileToDataUrl(f);
      const nextIdx = fieldPhotosList.length + addedItems.length + 1;
      const cleanName = f.name.replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' ');
      addedItems.push({
        id: `fp-${Date.now()}-${i}-${nextIdx}`,
        dataUrl,
        locationDate: `${currentFields.locationCity || 'Site d’intervention'} — ${new Date().toLocaleDateString(
          language === 'EN' ? 'en-US' : 'fr-FR'
        )}`,
        caption:
          language === 'EN'
            ? `Field photo #${nextIdx} (${cleanName}): Visual evidence of physical execution and field monitoring.`
            : `Image de terrain N°${nextIdx} (${cleanName}) : Constat visuel d’exécution physique et d’avancement opérationnel sur le terrain.`
      });
    }
    persistFieldPhotosList([...fieldPhotosList, ...addedItems]);
  };

  const handleReplaceFieldPhotoImage = async (
    photoId: string,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const dataUrl = await optimizeImageFileToDataUrl(file);
    if (!dataUrl) return;
    persistFieldPhotosList(
      fieldPhotosList.map(item => (item.id === photoId ? { ...item, dataUrl } : item))
    );
  };

  const handleUpdateFieldPhotoItem = (
    photoId: string,
    key: 'caption' | 'locationDate',
    val: string
  ) => {
    persistFieldPhotosList(
      fieldPhotosList.map(item => (item.id === photoId ? { ...item, [key]: val } : item))
    );
  };

  const handleRemoveFieldPhotoItem = (photoId: string) => {
    persistFieldPhotosList(fieldPhotosList.filter(item => item.id !== photoId));
  };

  const confirmRemoveImage = () => {
    if (!pendingImageDelete) return;
    onUpdateDocField(selectedDocType, pendingImageDelete.key, '');
    setPendingImageDelete(null);
  };

  return (
    <div className="space-y-3 sm:space-y-5 w-full max-w-full min-w-0">
      {exportToastMsg && (
        <div className="fixed bottom-5 right-5 z-[9999] max-w-md rounded-xl bg-[#c2410c] text-white border-2 border-[#fdba74] px-4 py-3 shadow-2xl flex items-center gap-2.5 text-xs font-extrabold">
          <Check className="w-4 h-4 text-[#fdba74] shrink-0" />
          <span className="leading-snug break-words">{exportToastMsg}</span>
        </div>
      )}
      {/* Validation Modal before deleting an uploaded image */}
      {pendingImageDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border-2 border-[#fdba74] max-w-md w-full p-5 shadow-2xl space-y-4 text-left">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-950/60 text-rose-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-black uppercase tracking-wider text-slate-900 dark:text-white">
                  {language === 'EN'
                    ? 'Deletion Confirmation Required'
                    : 'Validation de Suppression Requise'}
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                  {language === 'EN'
                    ? 'Do you confirm the permanent deletion of the uploaded image for « '
                    : 'Confirmez-vous la suppression définitive de l’image importée pour « '}
                  <strong className="text-[#c2410c] dark:text-[#fdba74]">
                    {pendingImageDelete.label}
                  </strong>{' '}
                  » ?
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setPendingImageDelete(null)}
                className="px-3.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer"
              >
                {language === 'EN' ? 'Cancel' : 'Annuler'}
              </button>
              <button
                type="button"
                onClick={confirmRemoveImage}
                className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-black uppercase cursor-pointer"
              >
                {language === 'EN' ? 'Confirm deletion' : 'Valider la suppression'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Validation Modal before deleting a Matrix Row */}
      {pendingMatrixRowDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border-2 border-[#fdba74] max-w-md w-full p-5 shadow-2xl space-y-4 text-left">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-950/60 text-rose-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-black uppercase tracking-wider text-slate-900 dark:text-white">
                  {language === 'EN'
                    ? 'Row Deletion Confirmation'
                    : 'Validation de Suppression de Ligne'}
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                  {language === 'EN'
                    ? 'Do you confirm the permanent deletion of row « '
                    : 'Confirmez-vous la suppression définitive de la ligne « '}
                  <strong className="text-[#c2410c] dark:text-[#fdba74]">
                    {pendingMatrixRowDelete.rowCode}
                  </strong>{' '}
                  {language === 'EN' ? '» in matrix ' : '» dans la matrice '}
                  <strong className="text-[#c2410c] dark:text-[#fdba74]">
                    {pendingMatrixRowDelete.matrixId}
                  </strong>{' '}
                  ?
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setPendingMatrixRowDelete(null)}
                className="px-3.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer"
              >
                {language === 'EN' ? 'Cancel' : 'Annuler'}
              </button>
              <button
                type="button"
                onClick={confirmDeleteMatrixRow}
                className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-black uppercase cursor-pointer"
              >
                {language === 'EN' ? 'Delete row' : 'Supprimer la ligne'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Centered Popover / Modal for "Acteurs RACI & Profil" (100% visible on Mobile, Tablet & Desktop without overflow) */}
      {showDesktopRaciDrawer && (
        <>
          <div
            className="fixed inset-0 z-[9998] bg-slate-950/60 backdrop-blur-xs"
            onClick={() => setShowDesktopRaciDrawer(false)}
          />
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[9999] w-[min(92vw,480px)] max-w-[calc(100vw-24px)] max-h-[82vh] overflow-y-auto rounded-2xl bg-white dark:bg-slate-900 border-2 border-[#c2410c] dark:border-[#fdba74] shadow-2xl p-3.5 sm:p-4 space-y-3 text-left">
            <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-1.5 min-w-0">
                <Users className="w-4 h-4 text-[#ea580c] shrink-0" />
                <span className="text-xs font-black uppercase text-[#c2410c] dark:text-[#fdba74] truncate">
                  {language === 'EN'
                    ? `RACI Actors & Internal CVs (${effectiveDossier.name})`
                    : `Acteurs RACI & Profil (${effectiveDossier.name})`}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowDesktopRaciDrawer(false)}
                className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-500 hover:text-slate-800 dark:hover:text-white cursor-pointer shrink-0"
              >
                ✕
              </button>
            </div>

            {/* Sélecteur d'Acteur Interne (Catégorie 2) pour CV, Carte de visite & Badge */}
            <div className="p-2.5 rounded-lg bg-orange-50/80 dark:bg-slate-800/80 border border-orange-200 dark:border-slate-700 space-y-2">
              <label className="text-[10.5px] font-extrabold uppercase text-slate-700 dark:text-slate-200 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-[#ea580c] shrink-0" />
                <span>
                  {language === 'EN'
                    ? 'Select "Interne" Actor (CVs, Card & Badge):'
                    : 'Acteur « Interne » (CVs, Carte de Visite & Badge) :'}
                </span>
              </label>
              <select
                value={selectedActorForModal}
                onChange={e => setSelectedActorForModal(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs font-bold rounded bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white focus:outline-none cursor-pointer"
              >
                <option value={userProfile.fullName}>
                  ★ {userProfile.fullName} (
                  {language === 'EN'
                    ? 'Main User / Internal'
                    : 'Utilisateur Principal / Interne'}
                  )
                </option>
                {raciContext.internalOnlyActors
                  .filter(
                    act =>
                      act.toLowerCase() !==
                      userProfile.fullName.toLowerCase()
                  )
                  .map(act => {
                    const roles: string[] = [];
                    if (raciContext.rList.includes(act)) roles.push('R');
                    if (raciContext.aList.includes(act)) roles.push('A');
                    if (raciContext.cList.includes(act)) roles.push('C');
                    if (raciContext.iList.includes(act)) roles.push('I');
                    return (
                      <option key={act} value={act}>
                        • {act} [Cat. 2 : Interne — RACI:{' '}
                        {roles.join('/') || 'R'}]
                      </option>
                    );
                  })}
              </select>

              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    handleOpenActorModal(selectedActorForModal);
                    setShowDesktopRaciDrawer(false);
                  }}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-gradient-to-r from-[#c2410c] to-[#ea580c] hover:from-[#9a3412] hover:to-[#c2410c] text-white text-[11px] font-black shadow-2xs cursor-pointer"
                >
                  <CreditCard className="w-3.5 h-3.5 text-[#fdba74] shrink-0" />
                  <span>
                    {language === 'EN'
                      ? 'Open CVs, Card & Badge'
                      : 'Ouvrir 2 CVs, Carte & Badge'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsScannerModalOpen(true);
                    setShowDesktopRaciDrawer(false);
                  }}
                  className="inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#c2410c] hover:bg-[#9a3412] text-[#fdba74] border border-[#fdba74]/40 text-[11px] font-black cursor-pointer"
                >
                  <QrCode className="w-3.5 h-3.5 shrink-0" />
                  <span>Scanner QR</span>
                </button>
              </div>
            </div>

            {/* Liste déroulante cliquable des acteurs RACI pour mention rapide + accès Page & CVs pour les Internes */}
            <div className="space-y-1.5">
              <div className="text-[10px] font-extrabold uppercase text-slate-500 dark:text-slate-400">
                {language === 'EN'
                  ? 'Click an actor to mention in document (Page & CVs reserved for Interne):'
                  : 'Cliquer sur un acteur pour le mentionner dans le document :'}
              </div>
              <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
                {/* Utilisateur Principal */}
                <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-[#c2410c] text-white text-[10.5px] font-extrabold">
                  <button
                    type="button"
                    onClick={() => {
                      onUpdateDocField(
                        selectedDocType,
                        'recipientRepresentative',
                        `${userProfile.fullName} (${userProfile.role})`
                      );
                      setShowDesktopRaciDrawer(false);
                    }}
                    className="text-left text-[#fdba74] hover:underline truncate flex-1 cursor-pointer"
                  >
                    ★ {userProfile.fullName} (Mentionner dans le document)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      handleOpenActorModal(userProfile.fullName);
                      setShowDesktopRaciDrawer(false);
                    }}
                    className="px-2 py-1 rounded bg-orange-900 hover:bg-[#ea580c] text-white flex items-center gap-1 shrink-0 cursor-pointer"
                  >
                    <CreditCard className="w-3 h-3 text-[#fdba74]" />
                    <span>Page & CVs</span>
                  </button>
                </div>

                {raciContext.allActors.map(actor => {
                  const roles: string[] = [];
                  if (raciContext.rList.includes(actor)) roles.push('R');
                  if (raciContext.aList.includes(actor)) roles.push('A');
                  if (raciContext.cList.includes(actor)) roles.push('C');
                  if (raciContext.iList.includes(actor)) roles.push('I');
                  const roleBadge = roles.join('/');
                  const isInternalActor =
                    raciContext.internalOnlyActors.some(
                      ia => ia.toLowerCase() === actor.toLowerCase()
                    );

                  return (
                    <div
                      key={actor}
                      className="flex items-center justify-between gap-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[10.5px] font-bold"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          const cur =
                            currentFields.recipientRepresentative || '';
                          const next = cur.includes(actor)
                            ? cur
                            : cur
                            ? `${cur} | ${actor} (RACI-${roleBadge})`
                            : `${actor} (RACI-${roleBadge})`;
                          onUpdateDocField(
                            selectedDocType,
                            'recipientRepresentative',
                            next
                          );
                          setShowDesktopRaciDrawer(false);
                        }}
                        className="text-left text-[#c2410c] dark:text-[#fdba74] hover:underline truncate flex-1 cursor-pointer"
                      >
                        + {actor} [{roleBadge}]
                      </button>
                      {isInternalActor && (
                        <button
                          type="button"
                          onClick={() => {
                            handleOpenActorModal(actor);
                            setShowDesktopRaciDrawer(false);
                          }}
                          className="px-2 py-1 rounded bg-orange-100 hover:bg-[#c2410c] hover:text-white dark:bg-slate-700 text-[#c2410c] dark:text-[#fdba74] flex items-center gap-1 shrink-0 cursor-pointer"
                        >
                          <CreditCard className="w-3 h-3 text-[#ea580c]" />
                          <span>Page & CVs</span>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}

      {/* TOP BAR: 11-Document Selector + Grille d'évaluation Filter + Matrices Filter Button + Axe/Projet Sync + ICON-ONLY PDF Download Button */}
      <div className="bg-white dark:bg-slate-900 rounded-lg sm:rounded-xl border border-slate-200 dark:border-slate-800 p-2 sm:p-3.5 shadow-sm space-y-2 w-full max-w-full min-w-0">
        <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center justify-between gap-2 sm:gap-3 w-full max-w-full min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 sm:w-9 sm:h-9 rounded-lg bg-[#fdba74]/30 text-[#c2410c] dark:text-[#fdba74] flex items-center justify-center shrink-0">
              <FileSpreadsheet className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-[10.5px] sm:text-base font-black text-slate-900 dark:text-white uppercase tracking-tight truncate">
                {language === 'EN'
                  ? 'Institutional Document Generator'
                  : 'Générateur de Documents Institutionnels'}
              </h2>
              <p className="text-[9px] sm:text-[11px] text-slate-500 dark:text-slate-400 truncate">
                {isSlideMode
                  ? `${currentConfig.badgeText} • ${activeSlidesCount} Slide(s) 16:9 Paysage consolidée(s) • Exportable en PDF Paysage (1 Slide = 1 Page)`
                  : selectedDocType === 'ptba'
                  ? `${currentConfig.badgeText} • 15 page(s) A4 consolidée(s) • Document Contractuel Annuel & Base Juridique d'Engagement`
                  : selectedDocType === 'ptt'
                  ? `${currentConfig.badgeText} • 6 page(s) A4 consolidée(s) • Outil de Pilotage Opérationnel de Proximité (90 jours)`
                  : `${currentConfig.badgeText} • ${pages.length} ${
                      language === 'EN'
                        ? 'consolidated A4 page(s)'
                        : 'page(s) A4 consolidée(s)'
                    }`}
              </p>
            </div>
          </div>

          {/* Filter Selector + Dedicated "Grille d'évaluation" Filter Button + M1-M10 Matrices Button + Icon-Only PDF Button */}
          <div className="flex flex-wrap items-center gap-1 sm:gap-2 w-full sm:w-auto min-w-0 max-w-full">
            <select
              value={selectedDocType}
              onChange={e => setSelectedDocType(e.target.value as InstitutionalDocType)}
              aria-label={
                language === 'EN'
                  ? 'Document template filter'
                  : 'Filtre de modèle de document'
              }
              className="min-w-0 w-0 flex-1 sm:w-64 h-8 sm:h-auto px-2 py-1 sm:px-3 sm:py-2 rounded-md sm:rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-[13px] sm:text-xs font-extrabold text-slate-900 dark:text-white focus:outline-none focus:ring-1 sm:focus:ring-2 focus:ring-[#fdba74] truncate"
            >
              <optgroup
                label={
                  language === 'EN'
                    ? 'Categories A, B & C : Institutional Project & M&E Documents (Docs 1 to 11 + PTBA/PTT)'
                    : 'Catégories A, B & C : Documents Institutionnels de Gestion de Projet & S&E (Docs 1 à 11 + PTBA/PTT)'
                }
              >
                {configList
                  .filter(cfg => cfg.category !== 'D' && cfg.category !== 'S')
                  .map(cfg => (
                    <option key={cfg.id} value={cfg.id}>
                      {cfg.selectLabel}
                    </option>
                  ))}
              </optgroup>
              <optgroup
                label={
                  language === 'EN'
                    ? 'Category D : Operational & HR Documents (No Cover Page)'
                    : 'Catégorie D : Documents Opérationnels & RH (Sans Page de Garde)'
                }
              >
                {configList
                  .filter(cfg => cfg.category === 'D')
                  .map(cfg => (
                    <option key={cfg.id} value={cfg.id}>
                      {cfg.selectLabel}
                    </option>
                  ))}
              </optgroup>
              <optgroup
                label={
                  language === 'EN'
                    ? 'Meeting Presentations (16:9 Landscape Slides exportable to PDF — Docs 16 to 22)'
                    : 'Présentations de Réunion (Format Slides 16:9 Paysage exportables en PDF — Docs 16 à 22)'
                }
              >
                {configList
                  .filter(cfg => cfg.category === 'S')
                  .map(cfg => (
                    <option key={cfg.id} value={cfg.id}>
                      {cfg.selectLabel}
                    </option>
                  ))}
              </optgroup>
            </select>

            {/* Sélecteur de Trimestre actif (Q1, Q2, Q3, Q4) pour le PTT A4 et la Présentation du PTT (Doc 20) */}
            {(selectedDocType === 'ptt' || selectedDocType === 'slides_ptt') && (
              <select
                value={currentFields.activeQuarter || 'Q1'}
                onChange={e =>
                  onUpdateDocField(
                    selectedDocType,
                    'activeQuarter',
                    e.target.value as 'Q1' | 'Q2' | 'Q3' | 'Q4'
                  )
                }
                aria-label="Sélecteur de trimestre actif du PTT"
                className="h-8 sm:h-auto px-2 py-1 sm:px-2.5 sm:py-2 rounded-md sm:rounded-lg bg-[#c2410c] text-[#fdba74] border border-[#fdba74] text-[12px] sm:text-xs font-extrabold focus:outline-none focus:ring-2 focus:ring-[#fdba74] cursor-pointer shrink-0"
              >
                <option value="Q1">Trimestre 1 (Q1)</option>
                <option value="Q2">Trimestre 2 (Q2)</option>
                <option value="Q3">Trimestre 3 (Q3)</option>
                <option value="Q4">Trimestre 4 (Q4)</option>
              </select>
            )}

            {/* Quick Document Filter Button for "Grille d'évaluation" */}
            <button
              type="button"
              onClick={() => setSelectedDocType('grille_evaluation')}
              title={
                language === 'EN'
                  ? 'Filter on: Evaluation Grid (OECD/DAC & UNEG Matrix)'
                  : "Filtrer sur : Grille d'évaluation (Matrice OCDE/CAD & UNEG)"
              }
              className={`h-8 sm:h-auto px-2 py-1 sm:px-2.5 sm:py-2 rounded-md sm:rounded-lg border text-[12px] sm:text-xs font-extrabold flex items-center gap-1 shrink-0 transition-all cursor-pointer ${
                selectedDocType === 'grille_evaluation'
                  ? 'bg-[#c2410c] text-[#fdba74] border-[#fdba74] shadow-xs'
                  : 'bg-orange-50 dark:bg-slate-800 text-[#c2410c] dark:text-[#fdba74] border-orange-200 dark:border-slate-700 hover:bg-orange-100'
              }`}
            >
              <CheckSquare className="w-3.5 h-3.5 sm:w-3.5 sm:h-3.5 shrink-0" />
              <span className="truncate max-w-[110px] sm:max-w-none">
                {language === 'EN' ? 'Evaluation Grid' : 'Grille d’évaluation'}
              </span>
            </button>

            {/* BOUTON PRINCIPAL : 📊 Filtrer & Renseigner les Matrices (M1 - M10) */}
            <button
              type="button"
              onClick={() => setIsMatricesPanelOpen(prev => !prev)}
              title={
                language === 'EN'
                  ? 'Open interactive filter & editing panel for the 10 Master Matrices (M1 to M10)'
                  : "Ouvrir le panneau de filtrage et d'édition interactive des 10 Matrices Maîtresses (M1 à M10)"
              }
              className={`h-8 sm:h-auto px-2 py-1 sm:px-3 sm:py-2 rounded-md sm:rounded-lg border text-[12px] sm:text-xs font-extrabold flex items-center gap-1.5 shrink-0 transition-all cursor-pointer ${
                isMatricesPanelOpen
                  ? 'bg-[#c2410c] text-white border-[#fdba74] shadow-sm ring-2 ring-[#fdba74]/50'
                  : 'bg-orange-50 dark:bg-slate-800 text-[#c2410c] dark:text-[#fdba74] border-[#fdba74] dark:border-slate-700 hover:bg-orange-100'
              }`}
            >
              <span className="truncate max-w-[180px] sm:max-w-none">
                {language === 'EN'
                  ? '📊 Filter & Fill Matrices (M1 - M10)'
                  : '📊 Filtrer & Renseigner les Matrices (M1 - M10)'}
              </span>
              <span
                className={`px-1.5 py-0.5 rounded-full text-[10px] sm:text-[10px] font-black tabular-nums ${
                  isMatricesPanelOpen
                    ? 'bg-[#fdba74] text-slate-950'
                    : 'bg-[#c2410c] text-[#fdba74]'
                }`}
              >
                {docRequiredMatrixIds.length}{' '}
                {language === 'EN'
                  ? 'active'
                  : `active${docRequiredMatrixIds.length > 1 ? 's' : ''}`}
              </span>
              {isMatricesPanelOpen ? (
                <ChevronUp className="w-3.5 h-3.5 sm:w-3.5 sm:h-3.5 shrink-0" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 sm:w-3.5 sm:h-3.5 shrink-0" />
              )}
            </button>

            {/* ICON-ONLY PDF DOWNLOAD BUTTON */}
            <button
              onClick={handleDownloadPDF}
              title={
                language === 'EN'
                  ? `Download ${currentConfig.selectLabel} as A4 PDF`
                  : `Télécharger ${currentConfig.selectLabel} en PDF A4`
              }
              aria-label={
                language === 'EN'
                  ? `Download ${currentConfig.selectLabel} as A4 PDF`
                  : `Télécharger ${currentConfig.selectLabel} en PDF A4`
              }
              className="w-8 h-8 sm:w-10 sm:h-10 rounded-md sm:rounded-lg bg-[#c2410c] hover:bg-[#9a3412] text-white flex items-center justify-center shadow-sm transition-all shrink-0 cursor-pointer border border-[#fdba74]/40"
            >
              <Printer className="w-4 h-4 sm:w-4 sm:h-4 text-[#fdba74]" />
            </button>
          </div>
        </div>

        {/* Compact Filter Bar Synchronized with Other Tabs (Axe Stratégique & Projet Opérationnel) */}
        <div className="grid grid-cols-2 gap-1 sm:gap-2 pt-1.5 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-1 sm:gap-1.5 bg-slate-50 dark:bg-slate-800/80 px-2 py-1 sm:px-2.5 sm:py-1 rounded border border-slate-200 dark:border-slate-700 h-7 sm:h-auto min-w-0">
            <Filter className="hidden sm:block w-3.5 h-3.5 text-[#ea580c] dark:text-[#fdba74] shrink-0" />
            <select
              value={activeAxeFilter}
              onChange={e => handleAxeChange(e.target.value)}
              className="w-full bg-transparent text-[13px] sm:text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none truncate leading-tight"
            >
              <option value="ALL">
                {language === 'EN'
                  ? `Axis: All (${(dossier.axes || []).length})`
                  : `Axe : Tous (${(dossier.axes || []).length})`}
              </option>
              {(dossier.axes || []).map(ax => (
                <option key={ax.id} value={ax.id}>
                  {ax.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1 sm:gap-1.5 bg-slate-50 dark:bg-slate-800/80 px-2 py-1 sm:px-2.5 sm:py-1 rounded border border-slate-200 dark:border-slate-700 h-7 sm:h-auto min-w-0">
            <Briefcase className="hidden sm:block w-3.5 h-3.5 text-[#ea580c] dark:text-[#fdba74] shrink-0" />
            <select
              value={activeProjectFilter}
              onChange={e => handleProjectChange(e.target.value)}
              className="w-full bg-transparent text-[13px] sm:text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none truncate leading-tight"
            >
              <option value="ALL">
                {language === 'EN'
                  ? `Project: All (${availableProjects.length})`
                  : `Projet : Tous (${availableProjects.length})`}
              </option>
              {availableProjects.map(pr => (
                <option key={pr.id} value={pr.id}>
                  {pr.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* PANNEAU INTÉGRÉ : SYSTÈME DE FILTRAGE ET D'ÉDITION INTERACTIVE DES 10 MATRICES MAÎTRESSES (M1 - M10) */}
      {isMatricesPanelOpen && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border-2 border-[#fdba74] dark:border-orange-800 p-3 sm:p-5 shadow-md space-y-4 w-full max-w-full min-w-0">
          {/* En-tête du Panneau des Matrices */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
            <div className="space-y-0.5 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-md bg-[#c2410c] text-[#fdba74] text-[10px] font-black uppercase tracking-wider">
                  ARCHITECTURE M1 - M10
                </span>
                <h3 className="text-xs sm:text-sm font-black uppercase tracking-tight text-slate-900 dark:text-white">
                  {language === 'EN'
                    ? 'Interactive Filtering & Data Entry of the 10 Master Matrices'
                    : 'Filtrage & Renseignement Interactif des 10 Matrices Maîtresses'}
                </h3>
              </div>
              <p className="text-[10px] sm:text-xs text-slate-600 dark:text-slate-400">
                {language === 'EN'
                  ? 'Automatic pre-filling from application tabs (Dossiers, Planning, Tracking, RACI, PERT, Kanban) with real-time calculations and direct injection into the A4 preview and PDF.'
                  : 'Pré-remplissage automatique depuis les onglets de l’application (Dossiers, Planification, Suivi, RACI, PERT, Kanban) avec calculs temps réel et injection directe dans l’aperçu A4 et le PDF.'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto max-w-full">
              <button
                type="button"
                onClick={handleResetAllMatricesFromApp}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-orange-50 dark:bg-slate-800 hover:bg-orange-100 text-[#c2410c] dark:text-[#fdba74] border border-orange-200 dark:border-slate-700 text-[10px] sm:text-xs font-extrabold cursor-pointer transition-colors"
                title={
                  language === 'EN'
                    ? 'Reset all matrices (M1 to M10) from current application tab data'
                    : "Réinitialiser toutes les matrices (M1 à M10) depuis les données actuelles des onglets de l'application"
                }
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>
                  {language === 'EN'
                    ? 'Reset from app fields'
                    : 'Réinitialiser depuis les champs de l’appli'}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setIsMatricesPanelOpen(false)}
                className="px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 text-[10px] sm:text-xs font-bold cursor-pointer"
              >
                {language === 'EN' ? 'Collapse panel' : 'Réduire le panneau'}
              </button>
            </div>
          </div>

          {/* 3.2. BARRE DE FILTRES INTELLIGENTE (3 MODES DE FILTRAGE COMBINABLES) */}
          <div className="space-y-3 bg-slate-50/90 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
            {/* Mode 1 & 3 : Filtre Automatique par Document + Filtre d'État de Complétion */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 pb-2.5 border-b border-slate-200/80 dark:border-slate-700">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] font-black uppercase tracking-wider text-[#c2410c] dark:text-[#fdba74] mr-1">
                  {language === 'EN' ? '1. Targeting Mode:' : '1. Mode de Ciblage :'}
                </span>
                <button
                  type="button"
                  onClick={() => setMatrixFilterMode('AUTO_DOC')}
                  className={`px-2.5 py-1 rounded-lg text-[10px] sm:text-xs font-extrabold border transition-all cursor-pointer ${
                    matrixFilterMode === 'AUTO_DOC'
                      ? 'bg-[#c2410c] text-white border-[#c2410c] shadow-2xs'
                      : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:bg-orange-50'
                  }`}
                >
                  {language === 'EN'
                    ? `Auto Filter by Document (${currentConfig.selectLabel} : ${docRequiredMatrixIds.length} matrix/matrices)`
                    : `Filtre Auto par Document (${currentConfig.selectLabel} : ${docRequiredMatrixIds.length} matrice${docRequiredMatrixIds.length > 1 ? 's' : ''})`}
                </button>
                <button
                  type="button"
                  onClick={() => setMatrixFilterMode('ALL')}
                  className={`px-2.5 py-1 rounded-lg text-[10px] sm:text-xs font-extrabold border transition-all cursor-pointer ${
                    matrixFilterMode === 'ALL'
                      ? 'bg-[#c2410c] text-white border-[#c2410c] shadow-2xs'
                      : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:bg-orange-50'
                  }`}
                >
                  {language === 'EN'
                    ? 'All Matrices (M1 - M10)'
                    : 'Toutes les Matrices (M1 - M10)'}
                </button>
              </div>

              {/* Mode 3 : Filtre d'État de Complétion */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] font-black uppercase tracking-wider text-[#c2410c] dark:text-[#fdba74] mr-1">
                  {language === 'EN'
                    ? '3. Completion Status:'
                    : '3. État de Complétion :'}
                </span>
                <button
                  type="button"
                  onClick={() => setCompletionFilter('ALL')}
                  className={`px-2.5 py-1 rounded-lg text-[10px] sm:text-xs font-extrabold border transition-all cursor-pointer ${
                    completionFilter === 'ALL'
                      ? 'bg-[#ea580c] text-white border-[#ea580c]'
                      : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:bg-orange-50'
                  }`}
                >
                  {language === 'EN' ? 'All' : 'Tous'} ({activeDocMatricesStats.totalCells})
                </button>
                <button
                  type="button"
                  onClick={() => setCompletionFilter('MISSING')}
                  className={`px-2.5 py-1 rounded-lg text-[10px] sm:text-xs font-extrabold border transition-all cursor-pointer ${
                    completionFilter === 'MISSING'
                      ? 'bg-amber-600 text-white border-amber-600'
                      : 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800 hover:bg-amber-100'
                  }`}
                >
                  {language === 'EN'
                    ? `Missing fields to complete (${activeDocMatricesStats.missingCells})`
                    : `Champs manquants à compléter (${activeDocMatricesStats.missingCells})`}
                </button>
                <button
                  type="button"
                  onClick={() => setCompletionFilter('PREFILLED')}
                  className={`px-2.5 py-1 rounded-lg text-[10px] sm:text-xs font-extrabold border transition-all cursor-pointer ${
                    completionFilter === 'PREFILLED'
                      ? 'bg-emerald-700 text-white border-emerald-700'
                      : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800 hover:bg-emerald-100'
                  }`}
                >
                  {language === 'EN'
                    ? `Pre-filled data (${activeDocMatricesStats.filledCells})`
                    : `Données pré-remplies (${activeDocMatricesStats.filledCells})`}
                </button>
              </div>
            </div>

            {/* Mode 2 : Filtre Manuel par Matrice (Puces cliquables Toutes + M1 à M10) */}
            <div className="space-y-1.5">
              <div className="text-[10px] font-black uppercase tracking-wider text-[#c2410c] dark:text-[#fdba74]">
                {language === 'EN'
                  ? '2. Manual Filter by Master Matrix:'
                  : '2. Filtre Manuel par Matrice Maîtresse :'}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setMatrixFilterMode('ALL')}
                  className={`px-2.5 py-1 rounded-lg text-[10px] sm:text-[11px] font-extrabold border transition-all cursor-pointer ${
                    matrixFilterMode === 'ALL'
                      ? 'bg-[#c2410c] text-[#fdba74] border-[#c2410c]'
                      : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-[#ea580c]'
                  }`}
                >
                  {language === 'EN' ? 'All' : 'Toutes'}
                </button>
                {MASTER_MATRICES_DEFINITIONS.map(def => {
                  const isRequiredByDoc = docRequiredMatrixIds.includes(def.id);
                  const isSelected = matrixFilterMode === def.id;
                  const stats = getMatrixCompletionStats(def.id, matricesData[def.id] || []);
                  return (
                    <button
                      key={def.id}
                      type="button"
                      onClick={() => setMatrixFilterMode(def.id)}
                      className={`px-2.5 py-1 rounded-lg text-[10px] sm:text-[11px] font-extrabold border flex items-center gap-1.5 transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-[#c2410c] text-[#fdba74] border-[#c2410c] shadow-2xs'
                          : isRequiredByDoc
                          ? 'bg-orange-50/90 dark:bg-slate-800 text-[#c2410c] dark:text-[#fdba74] border-[#fdba74] hover:bg-orange-100'
                          : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <span>{def.chipLabel}</span>
                      {isRequiredByDoc && (
                        <span
                          className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"
                          title={
                            language === 'EN'
                              ? 'Matrix required for the selected document'
                              : 'Matrice requise pour le document sélectionné'
                          }
                        />
                      )}
                      {stats.missingCells > 0 && (
                        <span
                          className="px-1 rounded bg-amber-100 text-amber-800 text-[9px] font-black"
                          title={
                            language === 'EN'
                              ? `${stats.missingCells} cell(s) to complete`
                              : `${stats.missingCells} cellule(s) à compléter`
                          }
                        >
                          {stats.missingCells}{' '}
                          {language === 'EN' ? 'to fill' : 'à compl.'}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Message spécifique si Doc 1 (Courrier Administratif 1 page) est en filtre Auto */}
          {visibleMatrixDefinitions.length === 0 ? (
            <div className="p-4 rounded-xl bg-orange-50/70 dark:bg-slate-800/70 border border-orange-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="text-xs font-black uppercase text-[#c2410c] dark:text-[#fdba74]">
                  {language === 'EN'
                    ? 'Category A Protocol — Official Administrative Letter (Strict 1 Page)'
                    : 'Protocole Catégorie A — Courrier Administratif Classique (1 Page Stricte)'}
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-300">
                  {language === 'EN'
                    ? 'In accordance with international editing standards, the 1-page Administrative Letter does not include heavy matrices by default. However, you can manually view or edit any matrix (M1 to M10) by clicking the chips above.'
                    : 'Conformément aux normes internationales d’édition, le Courrier Administratif d’une page ne comporte aucune matrice lourde par défaut. Vous pouvez toutefois consulter ou éditer manuellement n’importe quelle matrice (M1 à M10) en cliquant sur les puces ci-dessus.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMatrixFilterMode('ALL')}
                className="px-3 py-1.5 rounded-lg bg-[#c2410c] text-white text-xs font-extrabold shrink-0 cursor-pointer hover:bg-[#9a3412]"
              >
                {language === 'EN'
                  ? 'Show all matrices (M1 - M10)'
                  : 'Afficher toutes les matrices (M1 - M10)'}
              </button>
            </div>
          ) : (
            <div className="space-y-5">
              {visibleMatrixDefinitions.map(def => {
                const allRowsForMatrix = matricesData[def.id] || [];
                const stats = getMatrixCompletionStats(def.id, allRowsForMatrix);
                const editableCols = def.columns.filter(c => c.inputType !== 'computed');

                // Filtrage des lignes selon completionFilter
                const filteredRowEntries = allRowsForMatrix
                  .map((row, idx) => ({ row, originalIndex: idx }))
                  .filter(({ row }) => {
                    if (completionFilter === 'ALL') return true;
                    const hasMissing = editableCols.some(
                      c => !(row[c.key] || '').trim()
                    );
                    const hasFilled = editableCols.some(
                      c => Boolean((row[c.key] || '').trim())
                    );
                    if (completionFilter === 'MISSING') return hasMissing;
                    if (completionFilter === 'PREFILLED') return hasFilled && !hasMissing;
                    return true;
                  });

                return (
                  <div
                    key={def.id}
                    className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xs overflow-hidden"
                  >
                    {/* En-tête de la Matrice */}
                    <div className="p-3 sm:p-4 bg-orange-50/70 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="px-2 py-0.5 rounded bg-[#c2410c] text-[#fdba74] text-[10px] font-black uppercase">
                            {def.id}
                          </span>
                          <h4 className="text-xs sm:text-sm font-black uppercase text-[#c2410c] dark:text-[#fdba74] break-words">
                            {def.fullTitle}
                          </h4>
                          <span className="px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 text-[9.5px] font-extrabold">
                            {stats.filledCells}/{stats.totalCells}{' '}
                            {language === 'EN' ? 'pre-filled' : 'pré-remplis'}
                          </span>
                          {stats.missingCells > 0 && (
                            <span className="px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 text-[9.5px] font-extrabold">
                              {stats.missingCells}{' '}
                              {language === 'EN' ? 'to complete' : 'à compléter'}
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-600 dark:text-slate-400 flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span>
                            <strong>
                              {language === 'EN' ? 'Standard:' : 'Référentiel :'}
                            </strong>{' '}
                            {def.normativeRef}
                          </span>
                          <span>•</span>
                          <span>
                            <strong>
                              {language === 'EN'
                                ? 'Associated documents:'
                                : 'Documents associés :'}
                            </strong>{' '}
                            {def.associatedDocsLabels}
                          </span>
                        </div>
                      </div>

                      {/* Boutons d'action par matrice : Variable [TXT_...], + Ajouter une ligne, Réinitialiser */}
                      <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleCopyMatrixMarkdown(def.id, def.txtVariable)}
                          title={
                            language === 'EN'
                              ? `Copy serialized Markdown table for variable ${def.txtVariable}`
                              : `Copier la table Markdown sérialisée pour la variable ${def.txtVariable}`
                          }
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-[9.5px] sm:text-[10.5px] font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 cursor-pointer"
                        >
                          {copiedMatrixToken === def.txtVariable ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-600" />
                              <span className="text-emerald-600">
                                {language === 'EN' ? 'Copied' : 'Copié'}{' '}
                                {def.txtVariable}
                              </span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3 text-[#ea580c]" />
                              <span>{def.txtVariable}</span>
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleAddMatrixRow(def.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#c2410c] hover:bg-[#9a3412] text-white text-[10px] sm:text-xs font-extrabold cursor-pointer transition-colors"
                        >
                          <Plus className="w-3.5 h-3.5 text-[#fdba74]" />
                          <span>
                            {language === 'EN' ? '+ Add row' : '+ Ajouter une ligne'}
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleResetSingleMatrixFromApp(def.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-orange-100/80 dark:bg-slate-800 hover:bg-orange-200/70 text-[#c2410c] dark:text-[#fdba74] text-[10px] sm:text-xs font-bold cursor-pointer transition-colors"
                          title={
                            language === 'EN'
                              ? 'Reset this matrix from application fields'
                              : "Réinitialiser cette matrice depuis les champs de l'application"
                          }
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>
                            {language === 'EN'
                              ? 'Reset from app fields'
                              : 'Réinitialiser depuis les champs de l’appli'}
                          </span>
                        </button>
                      </div>
                    </div>

                    {/* Tableau interactif à défilement horizontal fluide et en-têtes figés */}
                    {filteredRowEntries.length === 0 ? (
                      <div className="p-4 text-center text-xs text-slate-500 dark:text-slate-400">
                        {language === 'EN'
                          ? `No row matches status filter for ${def.chipLabel}.`
                          : `Aucune ligne ne correspond au filtre d’état « ${
                              completionFilter === 'MISSING'
                                ? 'Champs manquants à compléter'
                                : 'Données pré-remplies'
                            } » pour ${def.chipLabel}.`}{' '}
                        <button
                          type="button"
                          onClick={() => setCompletionFilter('ALL')}
                          className="text-[#ea580c] font-bold underline cursor-pointer ml-1"
                        >
                          {language === 'EN'
                            ? `Show all rows (${allRowsForMatrix.length})`
                            : `Afficher toutes les lignes (${allRowsForMatrix.length})`}
                        </button>
                      </div>
                    ) : (
                      <div className="overflow-x-auto max-h-[420px]">
                        <table className="w-full border-collapse text-left text-[10.5px] sm:text-xs">
                          <thead className="sticky top-0 z-10 bg-[#c2410c] text-white shadow-2xs">
                            <tr>
                              {def.columns.map(col => {
                                const isCurrencyCol = [
                                  'Cout_Unitaire',
                                  'Budget_Initial_BAC',
                                  'Budget_Engage',
                                  'Cout_Reel_AC',
                                  'Valeur_Acquise_EV',
                                  'Ecart_Cout_CV',
                                  'Montant_Estime',
                                  'Montant_Contractuel_Reel',
                                  'Budget_Additionnel_Requis'
                                ].includes(col.key);
                                return (
                                  <th
                                    key={col.key}
                                    style={{ minWidth: col.minWidthPx ? `${col.minWidthPx}px` : '130px' }}
                                    className={`px-2.5 py-2 font-black uppercase tracking-wider border-r border-orange-800 text-[9.5px] sm:text-[10px] leading-tight ${
                                      col.isRightAligned ? 'text-right' : 'text-left'
                                    }`}
                                  >
                                    <div>
                                      {col.label}
                                      {isCurrencyCol ? ` (${currency})` : ''}
                                    </div>
                                    {col.helperFormula && (
                                      <div className="text-[8.5px] font-semibold text-[#fdba74] normal-case mt-0.5">
                                        {language === 'EN' ? 'Formula:' : 'Formule :'}{' '}
                                        {col.helperFormula}
                                      </div>
                                    )}
                                  </th>
                                );
                              })}
                              <th className="px-2.5 py-2 font-black uppercase tracking-wider text-center text-[9.5px] sm:text-[10px] w-24 shrink-0">
                                Action
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                            {filteredRowEntries.map(({ row, originalIndex }) => {
                              const firstColKey = def.columns[0]?.key || 'Code';
                              const rowCodeLabel =
                                row[firstColKey] || `Ligne #${originalIndex + 1}`;
                              return (
                                <tr
                                  key={originalIndex}
                                  className="hover:bg-orange-50/40 dark:hover:bg-slate-800/50 transition-colors"
                                >
                                  {def.columns.map(col => {
                                    const cellVal = row[col.key] ?? '';
                                    const isMonetaryInputCol = [
                                      'Cout_Unitaire',
                                      'Budget_Initial_BAC',
                                      'Budget_Engage',
                                      'Cout_Reel_AC',
                                      'Valeur_Acquise_EV',
                                      'Montant_Estime',
                                      'Montant_Contractuel_Reel',
                                      'Budget_Additionnel_Requis'
                                    ].includes(col.key);
                                    const isMissing =
                                      col.inputType !== 'computed' &&
                                      cellVal.trim() === '';

                                    if (col.inputType === 'computed') {
                                      const displayComputed =
                                        col.key === 'Ecart_Cout_CV'
                                          ? formatCurrency(
                                              Number(String(cellVal).replace(/[^\d.-]/g, '')) || 0,
                                              currency,
                                              language
                                            )
                                          : cellVal || '0%';
                                      return (
                                        <td
                                          key={col.key}
                                          className="px-2.5 py-2 bg-orange-50/70 dark:bg-slate-800/90 border-r border-slate-200 dark:border-slate-800 align-top text-right font-black tabular-nums text-[#c2410c] dark:text-[#fdba74]"
                                        >
                                          <div className="px-2 py-1 rounded bg-white/90 dark:bg-slate-900 border border-orange-200 dark:border-slate-700 inline-block min-w-[70px] text-right">
                                            {displayComputed}
                                          </div>
                                          <div className="text-[8px] font-bold uppercase text-[#ea580c] dark:text-orange-400 mt-0.5">
                                            {language === 'EN'
                                              ? 'Auto calc.'
                                              : 'Calcul auto'}
                                          </div>
                                        </td>
                                      );
                                    }

                                    return (
                                      <td
                                        key={col.key}
                                        className={`p-1.5 border-r border-slate-200 dark:border-slate-800 align-top ${
                                          isMissing
                                            ? 'bg-amber-50/60 dark:bg-amber-950/20'
                                            : ''
                                        }`}
                                      >
                                        {col.inputType === 'select' && col.options ? (
                                          <select
                                            value={cellVal}
                                            onChange={e =>
                                              handleMatrixCellChange(
                                                def.id,
                                                originalIndex,
                                                col.key,
                                                e.target.value
                                              )
                                            }
                                            className="w-full px-2 py-1.5 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#fdba74]"
                                          >
                                            {col.options.map(opt => (
                                              <option key={opt} value={opt}>
                                                {opt}
                                              </option>
                                            ))}
                                          </select>
                                        ) : col.inputType === 'textarea' ? (
                                          <textarea
                                            rows={2}
                                            value={cellVal}
                                            placeholder={
                                              col.placeholder ||
                                              (language === 'EN'
                                                ? 'To complete...'
                                                : 'À compléter...')
                                            }
                                            onChange={e =>
                                              handleMatrixCellChange(
                                                def.id,
                                                originalIndex,
                                                col.key,
                                                e.target.value
                                              )
                                            }
                                            className={`w-full px-2 py-1 rounded-md bg-white dark:bg-slate-800 border text-[11px] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#fdba74] ${
                                              isMissing
                                                ? 'border-amber-400 dark:border-amber-600'
                                                : 'border-slate-200 dark:border-slate-700'
                                            }`}
                                          />
                                        ) : (
                                          <input
                                            type={
                                              col.inputType === 'date'
                                                ? 'date'
                                                : col.inputType === 'number'
                                                ? 'number'
                                                : 'text'
                                            }
                                            value={
                                              isMonetaryInputCol && cellVal !== '' && !Number.isNaN(Number(cellVal))
                                                ? Math.round(convertFromFCFA(Number(cellVal), currency))
                                                : cellVal
                                            }
                                            placeholder={
                                              col.placeholder ||
                                              (language === 'EN'
                                                ? 'To complete...'
                                                : 'À compléter...')
                                            }
                                            onChange={e => {
                                              const rawVal = e.target.value;
                                              const storedVal =
                                                isMonetaryInputCol && rawVal !== '' && !Number.isNaN(Number(rawVal))
                                                  ? String(convertToFCFA(Number(rawVal), currency))
                                                  : rawVal;
                                              handleMatrixCellChange(
                                                def.id,
                                                originalIndex,
                                                col.key,
                                                storedVal
                                              );
                                            }}
                                            className={`w-full px-2 py-1.5 rounded-md bg-white dark:bg-slate-800 border text-[11px] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#fdba74] ${
                                              col.isRightAligned
                                                ? 'text-right font-bold tabular-nums'
                                                : ''
                                            } ${
                                              isMissing
                                                ? 'border-amber-400 dark:border-amber-600'
                                                : 'border-slate-200 dark:border-slate-700'
                                            }`}
                                          />
                                        )}
                                        {isMissing && (
                                          <div className="mt-0.5 text-[8.5px] font-extrabold text-amber-700 dark:text-amber-400 flex items-center gap-1">
                                            <span>
                                              {language === 'EN'
                                                ? '⚠ To complete'
                                                : '⚠ À compléter'}
                                            </span>
                                          </div>
                                        )}
                                      </td>
                                    );
                                  })}

                                  {/* Bouton Supprimer la ligne */}
                                  <td className="p-1.5 text-center align-middle">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setPendingMatrixRowDelete({
                                          matrixId: def.id,
                                          rowIndex: originalIndex,
                                          rowCode: rowCodeLabel
                                        })
                                      }
                                      title={
                                        language === 'EN'
                                          ? 'Delete row'
                                          : 'Supprimer la ligne'
                                      }
                                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 text-rose-600 dark:text-rose-400 text-[10px] font-bold cursor-pointer transition-colors"
                                    >
                                      <Trash2 className="w-3 h-3 shrink-0" />
                                      <span>
                                        {language === 'EN' ? 'Delete' : 'Supprimer'}
                                      </span>
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* MOBILE ONLY (< md): STACKED LAYOUT (CHAMPS SPÉCIFIQUES ABOVE, A4 PREVIEW BELOW) */}
      {isSlideMode ? (
        <div className="md:hidden">
          <SlideDeckWorkspace
            selectedDocType={selectedDocType}
            currentConfig={currentConfig}
            currentFields={currentFields}
            effectiveDossier={effectiveDossier}
            userProfile={userProfile}
            currency={currency}
            language={language}
            slides={slides}
            includeSignatures={includeSignatures}
            onToggleSignatureBlock={handleToggleSignatureBlock}
            onUpdateDocField={onUpdateDocField}
            onResetDocDefaults={onResetDocDefaults}
            activeImageFieldDescriptors={activeImageFieldDescriptors}
            onImageFileSelect={handleImageFileSelect}
            onRequestImageDelete={setPendingImageDelete}
            fieldPhotosList={fieldPhotosList}
            onUploadNewFieldPhotos={handleUploadNewFieldPhotos}
            onAddFieldPhotoSlot={handleAddFieldPhotoSlot}
            onReplaceFieldPhotoImage={handleReplaceFieldPhotoImage}
            onUpdateFieldPhotoItem={handleUpdateFieldPhotoItem}
            onRemoveFieldPhotoItem={handleRemoveFieldPhotoItem}
            optimizeImageFileToDataUrl={optimizeImageFileToDataUrl}
          />
        </div>
      ) : (
      <div className="md:hidden grid grid-cols-1 gap-3 items-start">
        {/* MOBILE SPECIFIC SUPPLEMENTARY FORM FIELDS + IMAGE UPLOAD FIELDS */}
        <div className="h-auto bg-white dark:bg-slate-900 rounded-lg sm:rounded-xl border border-slate-200 dark:border-slate-800 p-2.5 sm:p-4 pb-6 shadow-sm space-y-2.5 sm:space-y-3.5 w-full max-w-full min-w-0">
          <div className="space-y-2 pb-2.5 border-b border-slate-100 dark:border-slate-800 w-full max-w-full">
            <div className="flex items-start gap-2 min-w-0">
              <SlidersHorizontal className="w-4 h-4 text-[#ea580c] dark:text-[#fdba74] shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <h3 className="text-[10.5px] sm:text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white leading-snug">
                  {language === 'EN' ? 'Specific Fields' : 'Champs Spécifiques'} —{' '}
                  {currentConfig.selectLabel}
                </h3>
                <p className="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                  {language === 'EN'
                    ? 'Each input field on the left is positioned directly opposite its corresponding preview section in the generated A4 document on the right.'
                    : 'Chaque champ de saisie à gauche est situé en vis-à-vis direct de la section de prévisualisation correspondante du document généré à droite.'}
                </p>
              </div>
            </div>

            {/* Barre de boutons multi-lignes adaptative (100% visible et cliquable sur Mobile & Tablette) */}
            <div className="flex flex-wrap items-center gap-2 w-full max-w-full pt-1">
              <label
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-extrabold cursor-pointer select-none transition-all ${
                  includeSignatures
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700'
                    : 'bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-300 border-amber-300 dark:border-amber-700'
                }`}
              >
                <input
                  type="checkbox"
                  checked={includeSignatures}
                  onChange={handleToggleSignatureBlock}
                  className="rounded border-slate-300 text-[#c2410c] focus:ring-[#fdba74] cursor-pointer"
                />
                <span>
                  {language === 'EN'
                    ? 'Display signature block'
                    : 'Afficher le bloc de signature'}
                </span>
              </label>

              <button
                type="button"
                onClick={() => setShowDesktopImagesDrawer(prev => !prev)}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[10px] font-extrabold cursor-pointer transition-all ${
                  showDesktopImagesDrawer
                    ? 'bg-[#c2410c] text-white border-[#fdba74]'
                    : 'bg-orange-50 dark:bg-slate-800 text-[#c2410c] dark:text-[#fdba74] border-orange-200 dark:border-slate-700'
                }`}
              >
                <ImagePlus className="w-3 h-3 shrink-0" />
                <span>
                  {language === 'EN'
                    ? `Logos & Images (${activeImageFieldDescriptors.length})`
                    : `Logos & Images (${activeImageFieldDescriptors.length})`}
                </span>
              </button>

              {hasFieldPhotosSupport && (
                <button
                  type="button"
                  onClick={() => setShowDesktopPhotosDrawer(prev => !prev)}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[10px] font-extrabold cursor-pointer transition-all ${
                    showDesktopPhotosDrawer
                      ? 'bg-[#c2410c] text-white border-[#fdba74]'
                      : 'bg-emerald-50 dark:bg-slate-800 text-[#c2410c] dark:text-[#fdba74] border-emerald-300 dark:border-slate-700'
                  }`}
                >
                  <ImagePlus className="w-3 h-3 shrink-0" />
                  <span>
                    {language === 'EN'
                      ? `Field Photos Annex (${fieldPhotosList.length})`
                      : `Annexe Photos Terrain (${fieldPhotosList.length})`}
                  </span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setShowDesktopRaciDrawer(prev => !prev)}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[10px] font-extrabold cursor-pointer transition-all ${
                  showDesktopRaciDrawer
                    ? 'bg-[#c2410c] text-white border-[#fdba74]'
                    : 'bg-orange-50 dark:bg-slate-800 text-[#c2410c] dark:text-[#fdba74] border-orange-200 dark:border-slate-700'
                }`}
              >
                <Users className="w-3 h-3 shrink-0" />
                <span>
                  {language === 'EN'
                    ? `RACI Actors & Profile (${raciContext.allActors.length})`
                    : `Acteurs RACI & Profil (${raciContext.allActors.length})`}
                </span>
                {showDesktopRaciDrawer ? (
                  <ChevronUp className="w-3 h-3 shrink-0" />
                ) : (
                  <ChevronDown className="w-3 h-3 shrink-0" />
                )}
              </button>

              <button
                type="button"
                onClick={() => onResetDocDefaults(selectedDocType)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#c2410c] hover:bg-[#9a3412] text-[#fdba74] text-[10px] font-extrabold transition-colors cursor-pointer"
                title={
                  language === 'EN'
                    ? 'Restore and automatically synchronize with data from other tabs'
                    : 'Restaurer et synchroniser automatiquement avec les données des autres onglets'
                }
              >
                <Sparkles className="w-3 h-3 shrink-0" />
                <span>
                  {language === 'EN'
                    ? 'Sync with tabs'
                    : 'Synchroniser avec les onglets'}
                </span>
              </button>
            </div>
          </div>

          <p className="text-[9.5px] sm:text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
            {currentConfig.subtitle} ({currentConfig.normativeReference}).{' '}
            {language === 'EN'
              ? 'All data from other tabs (Dossiers & Projects, Planning, Task Tracking, RACI, PERT Network, Kanban, Gantt, Dashboard, and User Profile) are automatically retrieved.'
              : 'Toutes les données des autres onglets (Dossiers & Projets, Planification, Suivi des tâches, RACI, Réseau PERT, Kanban, Gantt, Tableau de Bord et Profil Utilisateur) sont récupérées automatiquement.'}
          </p>

          {/* SÉLECTEUR DE TRIMESTRE ACTIF POUR LE PTT (MOBILE) */}
          {selectedDocType === 'ptt' && (
            <div className="p-2.5 sm:p-3 rounded-xl bg-orange-50 dark:bg-slate-800/80 border border-[#fdba74] flex items-center justify-between gap-2">
              <span className="text-[10px] sm:text-[11px] font-extrabold text-[#c2410c] dark:text-[#fdba74]">
                Trimestre actif (Horizon 90 jours) :
              </span>
              <select
                value={currentFields.activeQuarter || 'Q1'}
                onChange={e =>
                  onUpdateDocField(
                    'ptt',
                    'activeQuarter',
                    e.target.value as 'Q1' | 'Q2' | 'Q3' | 'Q4'
                  )
                }
                className="px-2.5 py-1 rounded-lg bg-[#c2410c] text-[#fdba74] border border-[#fdba74] text-[10px] sm:text-xs font-extrabold cursor-pointer"
              >
                <option value="Q1">Trimestre 1 (Q1)</option>
                <option value="Q2">Trimestre 2 (Q2)</option>
                <option value="Q3">Trimestre 3 (Q3)</option>
                <option value="Q4">Trimestre 4 (Q4)</option>
              </select>
            </div>
          )}

          {/* GESTION CONDITIONNELLE DU BLOC DE SIGNATURE (MOBILE) */}
          <div className="p-2.5 sm:p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2">
            <label className="inline-flex items-center gap-2 text-[10px] sm:text-[11px] font-extrabold text-[#c2410c] dark:text-[#fdba74] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={includeSignatures}
                onChange={handleToggleSignatureBlock}
                className="rounded border-slate-300 text-[#c2410c] focus:ring-[#fdba74] cursor-pointer"
              />
              <span>
                {language === 'EN'
                  ? 'Display signature block / Include signatures'
                  : 'Afficher le bloc de signature / Inclure les signatures'}
              </span>
            </label>
            <span
              className={`px-2 py-0.5 rounded text-[8.5px] font-black uppercase shrink-0 ${
                includeSignatures
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                  : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
              }`}
            >
              {includeSignatures
                ? language === 'EN'
                  ? 'Included'
                  : 'Activé'
                : language === 'EN'
                ? 'Hidden'
                : 'Masqué'}
            </span>
          </div>

          {/* SECTION : CHAMPS D'IMPORTATION D'IMAGES & LOGOS OFFICIELS */}
          <div className="p-2.5 sm:p-3 rounded-xl bg-orange-50/60 dark:bg-slate-800/60 border border-[#fdba74]/70 dark:border-slate-700 space-y-2.5">
            <div className="flex items-center gap-1.5 text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-[#c2410c] dark:text-[#fdba74]">
              <ImagePlus className="w-3.5 h-3.5 shrink-0" />
              <span>
                {language === 'EN'
                  ? 'Image & Official Logo Upload Fields'
                  : 'Champs d’Importation d’Images & Logos'}
              </span>
            </div>
            <p className="text-[9px] sm:text-[10px] text-slate-600 dark:text-slate-400 leading-tight">
              {language === 'EN'
                ? 'Upload logos, banners, figures, and stamps/signatures for the different sections of the A4 document:'
                : 'Importez les logos, bannières, figures et cachets/signatures pour les différentes parties du document A4 :'}
            </p>

            <div className="grid grid-cols-1 gap-2">
              {activeImageFieldDescriptors.map(imgField => {
                const currentImgUrl = currentFields[imgField.key];
                return (
                  <div
                    key={imgField.key}
                    className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      <div className="min-w-0">
                        <div className="text-[9.5px] sm:text-[10.5px] font-extrabold text-slate-800 dark:text-slate-100 truncate">
                          {imgField.label}
                        </div>
                        <div className="text-[8.5px] font-bold text-[#ea580c] dark:text-[#fdba74] truncate">
                          {language === 'EN' ? 'Location:' : 'Emplacement :'}{' '}
                          {imgField.targetSection}
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <label className="inline-flex items-center gap-1 px-2 py-1 rounded bg-[#c2410c] hover:bg-[#9a3412] text-white text-[8.5px] sm:text-[9.5px] font-bold cursor-pointer transition-colors">
                          <ImagePlus className="w-3 h-3 text-[#fdba74]" />
                          <span>
                            {currentImgUrl
                              ? language === 'EN'
                                ? 'Change'
                                : 'Changer'
                              : language === 'EN'
                              ? 'Upload'
                              : 'Importer'}
                          </span>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={e => handleImageFileSelect(imgField.key, e)}
                            className="hidden"
                          />
                        </label>
                        {currentImgUrl && (
                          <button
                            type="button"
                            onClick={() =>
                              setPendingImageDelete({
                                key: imgField.key,
                                label: imgField.label
                              })
                            }
                            title={
                              language === 'EN'
                                ? 'Delete this image (confirmation required)'
                                : 'Supprimer cette image (validation requise)'
                            }
                            className="p-1 rounded bg-rose-50 dark:bg-rose-950/50 text-rose-600 hover:bg-rose-100 cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>

                    {currentImgUrl ? (
                      <div className="flex items-center gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
                        <img
                          src={currentImgUrl}
                          alt={imgField.label}
                          className="h-10 w-auto max-w-[110px] object-contain rounded border border-slate-200 bg-white p-0.5"
                        />
                        <span className="text-[8.5px] font-semibold text-emerald-600 dark:text-emerald-400">
                          {language === 'EN'
                            ? '✓ Image inserted in document'
                            : '✓ Image insérée dans le document'}
                        </span>
                      </div>
                    ) : (
                      <div className="text-[8.5px] text-slate-400 leading-tight">
                        {imgField.helperText}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* SECTION SPÉCIALE (RAPPORTS CAP, MI-PARCOURS & ANNUEL/FINAL) : ANNEXE IMAGES DU TERRAIN & DESCRIPTIFS SOUS CHAQUE IMAGE */}
          {hasFieldPhotosSupport && (
            <div className="p-2.5 sm:p-3.5 rounded-xl bg-emerald-50/60 dark:bg-slate-800/80 border-2 border-[#ea580c]/60 dark:border-orange-700 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <div className="flex items-center gap-1.5 text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-[#c2410c] dark:text-[#fdba74]">
                  <ImagePlus className="w-3.5 h-3.5 text-[#ea580c] shrink-0" />
                  <span>
                    {language === 'EN'
                      ? 'Annex — Field Photos & Captions Below Images'
                      : 'En Annexe — Images du Terrain & Descriptifs sous chaque Image'}
                  </span>
                </div>
                <span className="px-2 py-0.5 rounded-full bg-[#c2410c] text-[#fdba74] text-[8.5px] font-black uppercase">
                  {fieldPhotosList.length}{' '}
                  {language === 'EN'
                    ? `field photo(s)`
                    : `image${fieldPhotosList.length > 1 ? 's' : ''} terrain`}
                </span>
              </div>

              <p className="text-[9px] sm:text-[10px] text-slate-600 dark:text-slate-300 leading-snug">
                {language === 'EN'
                  ? 'Define the title of this Annex section and add multiple field photos with their detailed description displayed directly below each image in the A4 report and PDF.'
                  : 'Définissez le titre de cette partie en annexe et ajoutez autant d’images du terrain que nécessaire avec leur descriptif détaillé figurant juste en dessous de chaque image (Aperçu A4 & PDF).'}
              </p>

              {/* Titre de la partie en Annexe */}
              <div className="space-y-1">
                <label className="block text-[9.5px] sm:text-[10.5px] font-extrabold uppercase tracking-wider text-[#c2410c] dark:text-[#fdba74] text-left">
                  {language === 'EN'
                    ? 'Title of the Field Photos Annex Section :'
                    : 'Titre de la Partie en Annexe (Images du Terrain) :'}
                </label>
                <input
                  type="text"
                  value={currentFields.fieldPhotosAnnexTitle || ''}
                  onChange={e =>
                    onUpdateDocField(selectedDocType, 'fieldPhotosAnnexTitle', e.target.value)
                  }
                  placeholder={
                    language === 'EN'
                      ? 'Ex: ANNEX 3 — PHOTOGRAPHIC REPORT & FIELD OBSERVATIONS'
                      : 'Ex: ANNEXE 3 — REPORTAGE PHOTOGRAPHIQUE & CONSTATS VISUELS DE TERRAIN'
                  }
                  className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-[11px] font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#fdba74]"
                />
              </div>

              {/* Boutons d'ajout d'images de terrain + descriptifs */}
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#c2410c] hover:bg-[#9a3412] text-white text-[9.5px] sm:text-[10.5px] font-extrabold cursor-pointer transition-colors shadow-2xs">
                  <ImagePlus className="w-3.5 h-3.5 text-[#fdba74] shrink-0" />
                  <span>
                    {language === 'EN'
                      ? '+ Upload Field Photo(s)'
                      : '+ Importer Image(s) du Terrain'}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleUploadNewFieldPhotos}
                    className="hidden"
                  />
                </label>

                <button
                  type="button"
                  onClick={handleAddFieldPhotoSlot}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 hover:bg-orange-50 text-[#c2410c] dark:text-[#fdba74] border border-[#ea580c] text-[9.5px] sm:text-[10.5px] font-extrabold cursor-pointer transition-colors"
                >
                  <Plus className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    {language === 'EN'
                      ? '+ Add Photo Slot & Caption'
                      : '+ Ajouter un Emplacement & Descriptif'}
                  </span>
                </button>
              </div>

              {/* Liste des images de terrain avec descriptifs */}
              {fieldPhotosList.length === 0 ? (
                <div className="p-2.5 rounded-lg bg-white/80 dark:bg-slate-900/80 border border-dashed border-slate-300 dark:border-slate-700 text-[9.5px] text-slate-500 dark:text-slate-400 text-center">
                  {language === 'EN'
                    ? 'No field photo added yet. Click "+ Upload Field Photo(s)" or "+ Add Photo Slot & Caption" above to insert field images with captions below them in the Annex.'
                    : 'Aucune image de terrain ajoutée pour l’instant. Cliquez sur « + Importer Image(s) du Terrain » ou « + Ajouter un Emplacement & Descriptif » ci-dessus pour insérer des photos de terrain avec leur descriptif en dessous en annexe.'}
                </div>
              ) : (
                <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-0.5">
                  {fieldPhotosList.map((photo, pIdx) => (
                    <div
                      key={photo.id}
                      className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xs space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-slate-100 dark:border-slate-800">
                        <span className="px-2 py-0.5 rounded bg-[#c2410c] text-[#fdba74] text-[9px] font-black uppercase">
                          {language === 'EN'
                            ? `Field Photo #${pIdx + 1}`
                            : `Image de Terrain N°${pIdx + 1}`}
                        </span>

                        <div className="flex items-center gap-1">
                          <label className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-orange-50 dark:bg-slate-800 hover:bg-orange-100 text-[#c2410c] dark:text-[#fdba74] border border-orange-200 dark:border-slate-700 text-[9px] font-bold cursor-pointer">
                            <ImagePlus className="w-3 h-3 shrink-0" />
                            <span>
                              {photo.dataUrl
                                ? language === 'EN'
                                  ? 'Change image'
                                  : 'Changer l’image'
                                : language === 'EN'
                                ? 'Select image'
                                : 'Choisir l’image'}
                            </span>
                            <input
                              type="file"
                              accept="image/*"
                              onChange={e => handleReplaceFieldPhotoImage(photo.id, e)}
                              className="hidden"
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() => handleRemoveFieldPhotoItem(photo.id)}
                            title={
                              language === 'EN'
                                ? 'Remove this field photo and caption'
                                : 'Supprimer cette image de terrain et son descriptif'
                            }
                            className="p-1 rounded bg-rose-50 dark:bg-rose-950/50 text-rose-600 hover:bg-rose-100 cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>

                      {/* Aperçu proportionnel de l'image de terrain */}
                      {photo.dataUrl ? (
                        <div className="p-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex justify-center">
                          <img
                            src={photo.dataUrl}
                            alt={`Terrain ${pIdx + 1}`}
                            className="max-h-28 w-auto max-w-full object-contain rounded bg-white p-0.5 border border-slate-200"
                          />
                        </div>
                      ) : (
                        <div className="p-2 rounded-lg bg-amber-50/70 dark:bg-amber-950/30 border border-dashed border-amber-300 dark:border-amber-800 text-[9px] font-semibold text-amber-800 dark:text-amber-300 text-center">
                          {language === 'EN'
                            ? 'Reserved field photo slot — Click "Select image" to upload the photo.'
                            : 'Emplacement réservé — Cliquez sur « Choisir l’image » pour importer la photo de terrain.'}
                        </div>
                      )}

                      {/* Lieu / Site & Date */}
                      <div>
                        <label className="block text-[8.5px] font-black uppercase text-slate-500 dark:text-slate-400 mb-0.5 text-left">
                          {language === 'EN'
                            ? 'Site / Location & Date :'
                            : 'Site / Localité & Date de prise de vue :'}
                        </label>
                        <input
                          type="text"
                          value={photo.locationDate || ''}
                          onChange={e =>
                            handleUpdateFieldPhotoItem(photo.id, 'locationDate', e.target.value)
                          }
                          placeholder={
                            language === 'EN'
                              ? 'Ex: Project Site Zone A — October 2026'
                              : 'Ex: Site d’intervention Zone A — Octobre 2026'
                          }
                          className="w-full px-2 py-1 rounded bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[10px] font-semibold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-[#fdba74]"
                        />
                      </div>

                      {/* Descriptif en dessous de l'image */}
                      <div>
                        <label className="block text-[8.5px] font-black uppercase text-[#c2410c] dark:text-[#fdba74] mb-0.5 text-left">
                          {language === 'EN'
                            ? `Caption / Description Below Image #${pIdx + 1} :`
                            : `Descriptif en dessous de l’Image N°${pIdx + 1} :`}
                        </label>
                        <textarea
                          rows={2}
                          value={photo.caption || ''}
                          onChange={e =>
                            handleUpdateFieldPhotoItem(photo.id, 'caption', e.target.value)
                          }
                          placeholder={
                            language === 'EN'
                              ? 'Detailed description displayed directly underneath the field photo in the Annex...'
                              : 'Descriptif détaillé et constat terrain qui figurera juste en dessous de l’image en annexe...'
                          }
                          className="w-full px-2 py-1 rounded bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[10.5px] text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-[#fdba74]"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* SECTION : CHAMPS TEXTUELS SPÉCIFIQUES DU DOCUMENT (VERSION MOBILE EMPILÉE) */}
          <div className="grid grid-cols-1 gap-3">
            {currentConfig.fields.map((field: DocFieldDescriptor) => {
              const val = (currentFields[field.key] as string) || '';

              return (
                <div key={String(field.key)} className="col-span-1">
                  <label className="block text-[10.5px] sm:text-[11px] font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1 text-left">
                    {field.label}
                  </label>
                  {field.multiline ? (
                    <textarea
                      rows={field.rows || 3}
                      value={val}
                      onChange={e =>
                        onUpdateDocField(selectedDocType, field.key, e.target.value)
                      }
                      placeholder={field.placeholder}
                      className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#fdba74]"
                    />
                  ) : (
                    <input
                      type="text"
                      value={val}
                      onChange={e =>
                        onUpdateDocField(selectedDocType, field.key, e.target.value)
                      }
                      placeholder={field.placeholder}
                      className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#fdba74]"
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* MOBILE PREVIEW: MULTI-PAGE A4 DOCUMENT PREVIEW */}
        <div className="min-w-0 space-y-6 overflow-x-auto pb-8">
          {pages.map((page, pageIdx) => (
            <React.Fragment key={pageIdx}>
              {pageIdx > 0 && (
                <div className="flex items-center gap-3 px-2 select-none" aria-hidden="true">
                  <div className="flex-1 border-t-2 border-dashed border-orange-300 dark:border-slate-700" />
                  <span className="px-2.5 py-0.5 rounded bg-orange-100 dark:bg-slate-800 text-[9px] font-black uppercase tracking-widest text-[#c2410c] dark:text-[#fdba74]">
                    {language === 'EN'
                      ? `--- A4 PAGE BREAK (PAGE ${pageIdx + 1} / ${pages.length}) ---`
                      : `--- SAUT DE PAGE A4 (PAGE ${pageIdx + 1} / ${pages.length}) ---`}
                  </span>
                  <div className="flex-1 border-t-2 border-dashed border-orange-300 dark:border-slate-700" />
                </div>
              )}

              <div className="a4-page flex flex-col justify-between overflow-hidden">
                <div className="min-w-0">
                  {/* Institutional Header */}
                  <div className="border-b-2 border-[#c2410c] pb-3 mb-5 flex items-start justify-between gap-3 min-w-0">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      {currentFields.rightLogoDataUrl ? (
                        <img
                          src={currentFields.rightLogoDataUrl}
                          alt="Logo Agence d'Exécution"
                          className="w-11 h-11 object-contain rounded bg-white p-0.5 border border-slate-200 shrink-0"
                        />
                      ) : (
                        <AppLogo className="w-11 h-11 shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-black uppercase tracking-wider text-[#c2410c] leading-[1.2] break-words">
                          {page.pageTitle}
                        </div>
                        <div className="text-[10.5px] font-bold text-slate-600 leading-[1.3] break-words mt-0.5">
                          {page.pageSubtitle}
                        </div>
                      </div>
                    </div>
                    <div className="text-right text-[10px] font-bold text-slate-500 shrink-0 max-w-[155px] break-words">
                      {!excludedFieldsSet.has('referenceCode') && (
                        <div className="font-extrabold text-[#c2410c]">
                          Réf: {currentFields.referenceCode}
                        </div>
                      )}
                      {!excludedFieldsSet.has('locationCity') && (
                        <div className="text-[#ea580c]">{currentFields.locationCity}</div>
                      )}
                    </div>
                  </div>

                  {/* Page Sections */}
                  <div className="space-y-6 min-w-0">
                    {page.sections.map((sec, sIdx) => (
                      <div key={sIdx} className="space-y-3 min-w-0">
                        <h3 className="text-xs font-black uppercase tracking-wider text-[#c2410c] bg-orange-50 px-3 py-1.5 rounded-lg border-l-4 border-[#ea580c] leading-[1.2] break-words">
                          {sec.heading}
                        </h3>

                        {/* Official Cover Page Placement Chart (Page 1) */}
                        {sec.coverChart && (
                          <div className="rounded-xl border-2 border-[#c2410c] bg-white p-4 sm:p-5 shadow-sm space-y-5 overflow-hidden">
                            {/* Top Logos & Institutions Header (Synchronized 2-Column Grid with Centered Logos & Aligned Baselines) */}
                            <div className="border-b border-dashed border-slate-300 pb-3.5">
                              <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 px-3 sm:px-5 py-3.5 rounded-lg bg-slate-50 border border-slate-200 items-start">
                                {/* Row 1: Logos centered directly above their respective text blocks */}
                                {(sec.coverChart.leftLogoDataUrl || sec.coverChart.rightLogoDataUrl) && (
                                  <>
                                    <div className="w-full max-w-[67%] mr-auto flex items-center justify-center min-h-[68px] pb-1">
                                      {sec.coverChart.leftLogoDataUrl && (
                                        <img
                                          src={sec.coverChart.leftLogoDataUrl}
                                          alt="Logo Bailleur / Commanditaire"
                                          className="max-h-[62px] max-w-[150px] w-auto object-contain object-center mx-auto rounded bg-white p-1 border border-slate-200 shadow-2xs"
                                        />
                                      )}
                                    </div>
                                    <div className="w-full max-w-[67%] ml-auto flex items-center justify-center min-h-[68px] pb-1">
                                      {sec.coverChart.rightLogoDataUrl && (
                                        <img
                                          src={sec.coverChart.rightLogoDataUrl}
                                          alt="Logo Agence d'Exécution"
                                          className="max-h-[62px] max-w-[150px] w-auto object-contain object-center mx-auto rounded bg-white p-1 border border-slate-200 shadow-2xs"
                                        />
                                      )}
                                    </div>
                                  </>
                                )}

                                {/* Row 2: Organization / Institution Names (Bold, strictly aligned on the same horizontal baseline) */}
                                {(sec.coverChart.leftLogo || sec.coverChart.rightLogo) && (
                                  <>
                                    <div className="w-full max-w-[67%] mr-auto text-center self-start text-[10.5px] font-bold text-slate-900 whitespace-pre-line break-words leading-snug min-w-0">
                                      {sec.coverChart.leftLogo || ''}
                                    </div>
                                    <div className="w-full max-w-[67%] ml-auto text-center self-start text-[10.5px] font-bold text-slate-900 whitespace-pre-line break-words leading-snug min-w-0">
                                      {sec.coverChart.rightLogo || ''}
                                    </div>
                                  </>
                                )}

                                {/* Row 3: Direction / Department Names (Normal weight, strictly aligned on the same horizontal baseline) */}
                                {(sec.coverChart.leftDepartment || sec.coverChart.rightDepartment) && (
                                  <>
                                    <div className="w-full max-w-[67%] mr-auto text-center self-start text-[9.5px] font-normal text-slate-600 whitespace-pre-line break-words leading-snug min-w-0">
                                      {sec.coverChart.leftDepartment || ''}
                                    </div>
                                    <div className="w-full max-w-[67%] ml-auto text-center self-start text-[9.5px] font-normal text-slate-600 whitespace-pre-line break-words leading-snug min-w-0">
                                      {sec.coverChart.rightDepartment || ''}
                                    </div>
                                  </>
                                )}
                              </div>
                            </div>

                            {/* Centered Visual Intervention Banner */}
                            <div className="rounded-xl bg-[#c2410c] text-white p-5 border-b-4 border-[#fdba74] text-center space-y-3">
                              <div className="inline-block px-3 py-0.5 rounded-full bg-[#fdba74] text-slate-950 text-[9.5px] font-black uppercase tracking-widest max-w-full break-words">
                                {currentConfig.badgeText}
                              </div>
                              {sec.coverChart.bannerImageDataUrl && (
                                <div className="py-1.5 flex justify-center">
                                  <img
                                    src={sec.coverChart.bannerImageDataUrl}
                                    alt="Bannière de l'Intervention"
                                    className="max-h-[160px] w-auto max-w-full mx-auto object-contain rounded-lg border-2 border-[#fdba74] bg-white/95 p-1.5 shadow-md"
                                  />
                                </div>
                              )}
                              {sec.coverChart.bannerTitle && (
                                <div className="text-xs sm:text-sm font-black uppercase tracking-wider text-[#fdba74] whitespace-pre-line break-words leading-[1.25]">
                                  {sec.coverChart.bannerTitle}
                                </div>
                              )}
                              {sec.coverChart.bannerSubtitle && (
                                <div className="text-[10px] text-orange-100 italic break-words">
                                  {sec.coverChart.bannerSubtitle}
                                </div>
                              )}
                            </div>

                            {/* Centered Document Title & Subtitle / Project Code */}
                            <div className="py-4 px-3 rounded-xl bg-orange-50/70 border border-orange-200 text-center space-y-1.5">
                              <div className="text-base sm:text-lg font-black uppercase tracking-tight text-[#c2410c] leading-[1.2] break-words">
                                {sec.coverChart.docTitle}
                              </div>
                              {sec.coverChart.docSubtitle && (
                                <div className="text-[11px] font-extrabold text-slate-700 whitespace-pre-line break-words leading-[1.4]">
                                  {sec.coverChart.docSubtitle}
                                </div>
                              )}
                            </div>

                            {/* Bottom Metadata Row */}
                            <div className="grid grid-cols-2 gap-4 items-center border-t border-dashed border-slate-300 pt-3">
                              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-left space-y-1 min-w-0">
                                {sec.coverChart.bottomLeftStructure && (
                                  <div className="text-[10px] font-extrabold text-slate-800 whitespace-pre-line break-words">
                                    {sec.coverChart.bottomLeftStructure}
                                  </div>
                                )}
                                {sec.coverChart.bottomLeftZone && (
                                  <div className="text-[10px] font-bold text-[#ea580c] whitespace-pre-line break-words">
                                    {sec.coverChart.bottomLeftZone}
                                  </div>
                                )}
                              </div>
                              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-right space-y-1 min-w-0">
                                {sec.coverChart.bottomRightDateVersion && (
                                  <div className="text-[10px] font-extrabold text-slate-800 whitespace-pre-line break-words">
                                    {sec.coverChart.bottomRightDateVersion}
                                  </div>
                                )}
                                {sec.coverChart.bottomRightStatus && (
                                  <div className="text-[10px] font-black text-emerald-700 whitespace-pre-line break-words">
                                    {sec.coverChart.bottomRightStatus}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Classic 1-Page Administrative Letter Header Block */}
                        {sec.adminLetterHeader && (
                          <div className="rounded-xl border-2 border-[#c2410c] bg-white p-4 shadow-sm space-y-3.5 overflow-hidden">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-3 border-b border-dashed border-slate-300">
                              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-left space-y-1 min-w-0">
                                <div className="text-[9px] font-black uppercase tracking-wider text-[#ea580c]">
                                  EXPÉDITEUR / TIMBRE OFFICIEL
                                </div>
                                {(sec.adminLetterHeader.rightLogoDataUrl ||
                                  sec.adminLetterHeader.leftLogoDataUrl) && (
                                  <div className="py-1 flex justify-start gap-2">
                                    {sec.adminLetterHeader.rightLogoDataUrl && (
                                      <img
                                        src={sec.adminLetterHeader.rightLogoDataUrl}
                                        alt="Logo Structure Émettrice"
                                        className="max-h-12 max-w-[120px] object-contain rounded bg-white p-0.5 border border-slate-200"
                                      />
                                    )}
                                    {sec.adminLetterHeader.leftLogoDataUrl && (
                                      <img
                                        src={sec.adminLetterHeader.leftLogoDataUrl}
                                        alt="Logo Partenaire"
                                        className="max-h-12 max-w-[120px] object-contain rounded bg-white p-0.5 border border-slate-200"
                                      />
                                    )}
                                  </div>
                                )}
                                <div className="text-[11px] font-black uppercase text-[#c2410c] break-words">
                                  {sec.adminLetterHeader.senderInstitution}
                                </div>
                                <div className="text-[10.5px] font-extrabold text-slate-900 break-words">
                                  {sec.adminLetterHeader.senderName} — {sec.adminLetterHeader.senderRole}
                                </div>
                                <div className="text-[9.5px] text-slate-600 break-words">
                                  {sec.adminLetterHeader.senderContact}
                                </div>
                                {sec.adminLetterHeader.referenceCode && (
                                  <div className="pt-1 text-[10px] font-black text-[#c2410c] break-words">
                                    N° Réf : {sec.adminLetterHeader.referenceCode}
                                  </div>
                                )}
                              </div>

                              <div className="p-3 rounded-lg bg-orange-50/50 border border-orange-200 text-left sm:text-right flex flex-col justify-between space-y-2 min-w-0">
                                <div className="text-[10.5px] font-extrabold text-slate-800 break-words">
                                  {sec.adminLetterHeader.cityAndDate}
                                </div>
                                <div className="space-y-1">
                                  <div className="text-[9px] font-black uppercase tracking-wider text-[#ea580c]">
                                    À L’ATTENTION DE :
                                  </div>
                                  <div className="text-[11px] font-black text-slate-900 break-words">
                                    {sec.adminLetterHeader.recipientTitle}
                                  </div>
                                  <div className="text-[10.5px] font-extrabold text-[#c2410c] break-words">
                                    {sec.adminLetterHeader.recipientOrg}
                                  </div>
                                </div>
                              </div>
                            </div>

                            {sec.adminLetterHeader.subjectLine && (
                              <div className="p-3 rounded-lg bg-orange-50/80 border-l-4 border-[#c2410c] space-y-1 text-left">
                                <div className="text-[11px] font-black text-[#c2410c] break-words">
                                  <span className="underline">OBJET</span> :{' '}
                                  <span className="text-slate-900 font-extrabold">
                                    {sec.adminLetterHeader.subjectLine}
                                  </span>
                                </div>
                                <div className="text-[10px] font-bold text-slate-600 break-words tabular-nums">
                                  <span className="font-black text-[#ea580c]">RÉF. DOSSIER :</span>{' '}
                                  {sec.adminLetterHeader.dossierRefLine}
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {sec.cvHeaderBanner && (
                          <div className="rounded-xl border-2 border-[#c2410c] bg-white p-3.5 sm:p-4 shadow-sm overflow-hidden w-full box-border">
                            <div className="flex flex-col sm:flex-row items-start justify-between gap-3.5 min-w-0 w-full">
                              <div className="flex-1 space-y-2 text-left min-w-0 w-full overflow-hidden">
                                <div className="inline-block max-w-full px-2.5 py-0.5 rounded-md bg-[#c2410c] text-[#fdba74] text-[8.5px] sm:text-[9px] font-black uppercase tracking-wider break-words [overflow-wrap:anywhere] leading-snug">
                                  {sec.cvHeaderBanner.docBadge}
                                </div>
                                <div className="text-base sm:text-lg font-black uppercase tracking-tight text-[#c2410c] leading-tight break-words [overflow-wrap:anywhere]">
                                  {sec.cvHeaderBanner.fullNameUpper}
                                </div>
                                <div className="text-xs font-extrabold text-[#ea580c] leading-snug break-words [overflow-wrap:anywhere]">
                                  {sec.cvHeaderBanner.expertTitleLine}
                                </div>
                                <div className="text-[10.5px] font-bold text-slate-700 leading-relaxed break-words [overflow-wrap:anywhere] pt-1 border-t border-slate-200">
                                  {sec.cvHeaderBanner.contactLine}
                                </div>
                                {sec.cvHeaderBanner.metaSubLine && (
                                  <div className="p-2 rounded-lg bg-orange-50/80 border border-orange-200 text-[10px] font-semibold text-slate-800 whitespace-pre-line break-words [overflow-wrap:anywhere] leading-snug">
                                    {sec.cvHeaderBanner.metaSubLine}
                                  </div>
                                )}
                              </div>

                              {sec.cvHeaderBanner.profilePhotoDataUrl && (
                                <div className="flex flex-col items-center sm:items-end justify-start shrink-0 self-center sm:self-start">
                                  <div className="w-[104px] h-[134px] sm:w-[120px] sm:h-[154px] rounded-md border border-slate-300 bg-slate-50 overflow-hidden flex flex-col items-center justify-center shadow-2xs shrink-0 box-border">
                                    <img
                                      src={sec.cvHeaderBanner.profilePhotoDataUrl}
                                      alt="Photo de profil de l'Expert"
                                      className="w-full h-full object-cover"
                                    />
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {sec.operationalHeaderBanner && (
                          <div className="rounded-xl border-2 border-[#c2410c] bg-white p-3.5 shadow-sm space-y-2.5 overflow-hidden">
                            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center pb-2.5 border-b border-dashed border-slate-300">
                              <div className="sm:col-span-3 p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-left flex flex-col items-start justify-center min-h-[72px] min-w-0">
                                {sec.operationalHeaderBanner.rightLogoDataUrl && (
                                  <img
                                    src={sec.operationalHeaderBanner.rightLogoDataUrl}
                                    alt="Logo Structure Émettrice"
                                    className="max-h-[60px] w-auto max-w-full object-contain rounded bg-white p-0.5 border border-slate-200 mb-1.5"
                                  />
                                )}
                                {sec.operationalHeaderBanner.leftLogoLabel && (
                                  <div className="text-[9.5px] font-extrabold text-slate-800 whitespace-pre-line break-words leading-tight">
                                    {sec.operationalHeaderBanner.leftLogoLabel}
                                  </div>
                                )}
                              </div>

                              <div className="sm:col-span-6 p-2.5 rounded-lg bg-[#c2410c] text-white text-center space-y-1 border-b-2 border-[#fdba74]">
                                <div className="text-xs sm:text-sm font-black uppercase tracking-wider text-[#fdba74] break-words leading-tight">
                                  {sec.operationalHeaderBanner.centerDocTitle}
                                </div>
                                <div className="text-[10px] font-bold text-white break-words leading-snug">
                                  {sec.operationalHeaderBanner.centerSubTitle}
                                </div>
                                <div className="text-[9px] text-orange-200 font-semibold break-words">
                                  {sec.operationalHeaderBanner.referenceAndDateLine}
                                </div>
                              </div>

                              <div className="sm:col-span-3 p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-right flex flex-col items-end justify-center min-h-[72px] min-w-0">
                                {sec.operationalHeaderBanner.leftLogoDataUrl && (
                                  <img
                                    src={sec.operationalHeaderBanner.leftLogoDataUrl}
                                    alt="Logo Partenaire / Bailleur"
                                    className="max-h-[60px] w-auto max-w-full object-contain rounded bg-white p-0.5 border border-slate-200 mb-1.5"
                                  />
                                )}
                                {sec.operationalHeaderBanner.rightLogoLabel && (
                                  <div className="text-[9.5px] font-extrabold text-slate-800 whitespace-pre-line break-words leading-tight">
                                    {sec.operationalHeaderBanner.rightLogoLabel}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        )}

                        {sec.keyValueRows && sec.keyValueRows.length > 0 && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                            {sec.keyValueRows.map(([k, v], kIdx) => {
                              const hasCurrency = /\b(FCFA|EUR|USD)\b/.test(v);
                              return (
                                <div
                                  key={kIdx}
                                  className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 min-w-0"
                                >
                                  <div className="text-[9px] font-bold uppercase text-slate-400 break-words">
                                    {k}
                                  </div>
                                  <div
                                    className={`text-[10.5px] font-extrabold mt-0.5 whitespace-normal break-words [overflow-wrap:anywhere] leading-[1.4] ${
                                      hasCurrency ? 'text-[#c2410c] tabular-nums' : 'text-slate-900'
                                    }`}
                                  >
                                    {v}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {sec.paragraphs &&
                          sec.paragraphs.map((p, pIdx) => (
                            <p
                              key={pIdx}
                              className="text-[11px] leading-[1.5] text-slate-700 text-left sm:text-justify whitespace-pre-line break-words [overflow-wrap:anywhere] px-1 max-w-full"
                            >
                              {p}
                            </p>
                          ))}

                        {sec.bullets && sec.bullets.length > 0 && (
                          <ul className="list-disc pl-5 space-y-1.5 text-[11px] leading-[1.5] text-slate-700 max-w-full overflow-hidden">
                            {sec.bullets.map((bItem, bIdx) => (
                              <li key={bIdx} className="leading-[1.5] break-words [overflow-wrap:anywhere]">
                                {bItem}
                              </li>
                            ))}
                          </ul>
                        )}

                        {sec.figureImage && sec.figureImage.dataUrl && (
                          <div className="my-3 p-3 rounded-xl bg-slate-50 border border-slate-200 text-center space-y-2 break-inside-avoid">
                            <img
                              src={sec.figureImage.dataUrl}
                              alt={sec.figureImage.caption}
                              className="max-h-52 w-auto max-w-full mx-auto object-contain rounded-lg border border-slate-200 bg-white p-1.5 shadow-xs"
                            />
                            <div className="text-[10px] font-extrabold text-[#c2410c] italic break-words">
                              {sec.figureImage.caption}
                            </div>
                          </div>
                        )}

                        {sec.fieldPhotosAnnex && sec.fieldPhotosAnnex.photos.length > 0 && (
                          <div className="my-3 space-y-3 break-inside-avoid">
                            <div
                              className={`grid grid-cols-1 ${
                                sec.fieldPhotosAnnex.photos.length === 1
                                  ? 'sm:grid-cols-1 max-w-xl mx-auto'
                                  : 'sm:grid-cols-2'
                              } gap-3.5`}
                            >
                              {sec.fieldPhotosAnnex.photos.map((photo, pIdx) => (
                                <div
                                  key={photo.id || pIdx}
                                  className="rounded-xl border-2 border-[#c2410c]/80 bg-white overflow-hidden shadow-xs flex flex-col justify-between break-inside-avoid"
                                >
                                  <div className="bg-[#c2410c] text-white px-3 py-1.5 flex items-center justify-between gap-2 text-[9px] font-black uppercase tracking-wider">
                                    <span className="text-[#fdba74]">
                                      {language === 'EN'
                                        ? `FIELD PHOTO #${pIdx + 1}`
                                        : `IMAGE DE TERRAIN N°${pIdx + 1}`}
                                    </span>
                                    {photo.locationDate && (
                                      <span className="text-orange-100 font-bold truncate max-w-[60%]">
                                        {photo.locationDate}
                                      </span>
                                    )}
                                  </div>

                                  {photo.dataUrl && (
                                    <div className="p-2.5 bg-slate-50 flex items-center justify-center min-h-[145px] border-b border-slate-200">
                                      <img
                                        src={photo.dataUrl}
                                        alt={`Image de terrain N°${pIdx + 1}`}
                                        className="max-h-48 w-auto max-w-full object-contain rounded border border-slate-200 bg-white p-1 shadow-2xs"
                                      />
                                    </div>
                                  )}

                                  {photo.caption && (
                                    <div className="p-2.5 bg-orange-50/70 text-left space-y-0.5">
                                      <div className="text-[8.5px] font-black uppercase tracking-wider text-[#ea580c]">
                                        {language === 'EN'
                                          ? `Field Observation #${pIdx + 1} :`
                                          : `Descriptif & Constat Visuel N°${pIdx + 1} :`}
                                      </div>
                                      <p className="text-[10px] font-semibold text-slate-800 leading-[1.4] whitespace-pre-line break-words">
                                        {photo.caption}
                                      </p>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {sec.table && (
                          <div className="pt-1 w-full overflow-hidden break-inside-avoid">
                            <table className="w-full table-fixed border-collapse text-[8.5px] sm:text-[9px] leading-[1.45]">
                              {sec.table.columnWidths &&
                                sec.table.columnWidths.length === sec.table.headers.length && (
                                  <colgroup>
                                    {sec.table.columnWidths.map((w, colIdx) => (
                                      <col key={colIdx} style={{ width: `${w}%` }} />
                                    ))}
                                  </colgroup>
                                )}
                              <thead>
                                <tr className="bg-[#c2410c] text-white">
                                  {sec.table.headers.map((h, hIdx) => {
                                    const isRightAligned = sec.table?.rightAlignCols?.includes(hIdx);
                                    return (
                                      <th
                                        key={hIdx}
                                        className={`px-1.5 py-1.5 font-black uppercase border border-[#c2410c] break-words [overflow-wrap:anywhere] leading-[1.2] align-middle ${
                                          isRightAligned ? 'text-right' : 'text-left'
                                        }`}
                                      >
                                        {h}
                                      </th>
                                    );
                                  })}
                                </tr>
                              </thead>
                              <tbody>
                                {sec.table.rows.map((row, rIdx) => {
                                  const isTotalRow =
                                    row[0]?.startsWith('TOTAL') ||
                                    row[0]?.startsWith('SCORE GLOBAL') ||
                                    row[0]?.startsWith('NOTE GLOBALE');
                                  return (
                                    <tr
                                      key={rIdx}
                                      className={
                                        isTotalRow
                                          ? 'bg-orange-50/90 font-extrabold'
                                          : rIdx % 2 === 0
                                          ? 'bg-white'
                                          : 'bg-slate-50'
                                      }
                                    >
                                      {row.map((cell, cIdx) => {
                                        const isRightCol = sec.table?.rightAlignCols?.includes(cIdx);
                                        const isMonetaryCell = /\b(FCFA|EUR|USD)\b/.test(cell);
                                        return (
                                          <td
                                            key={cIdx}
                                            className={`px-1.5 py-1.5 border border-slate-200 whitespace-pre-line break-words [overflow-wrap:anywhere] align-top ${
                                              isRightCol || isMonetaryCell
                                                ? 'text-right font-extrabold tabular-nums text-[#c2410c]'
                                                : cIdx === 0
                                                ? 'font-bold text-slate-900'
                                                : 'text-slate-800'
                                            }`}
                                          >
                                            {cell}
                                          </td>
                                        );
                                      })}
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    ))}

                    {page.isSignaturePage && (
                      <div className="mt-6 pt-4 border-t-2 border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 text-xs break-inside-avoid">
                        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2 min-w-0">
                          <div className="font-black uppercase text-[#c2410c] text-[10px] break-words">
                            POUR L’ORGANISATION ({userProfile.institution || 'AUTORITÉ PILOTE'})
                          </div>
                          <div className="text-[11px] font-bold text-slate-800 break-words">
                            {userProfile.fullName} — {userProfile.role}
                          </div>
                          {page.orgStampDataUrl && (
                            <div className="py-1.5">
                              <img
                                src={page.orgStampDataUrl}
                                alt="Signature et Cachet Organisation"
                                className="max-h-16 w-auto object-contain rounded bg-white p-1 border border-slate-200"
                              />
                            </div>
                          )}
                          <div className="text-[10px] text-slate-500 pt-2">
                            Signature & Cachet Officiel : _______________________
                          </div>
                        </div>

                        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2 min-w-0">
                          <div className="font-black uppercase text-[#c2410c] text-[10px] break-words">
                            POUR LA PARTIE PRENANTE ({currentFields.recipientOrg || 'PARTENAIRE'})
                          </div>
                          <div className="text-[11px] font-bold text-slate-800 break-words">
                            {currentFields.recipientRepresentative || 'Représentant Habilité'}
                          </div>
                          {page.partnerStampDataUrl && (
                            <div className="py-1.5">
                              <img
                                src={page.partnerStampDataUrl}
                                alt="Signature et Cachet Partenaire"
                                className="max-h-16 w-auto object-contain rounded bg-white p-1 border border-slate-200"
                              />
                            </div>
                          )}
                          <div className="text-[10px] text-slate-500 pt-2">
                            Signature (« Lu et approuvé ») : _______________________
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Page Footer */}
                <div className="mt-6 pt-3 border-t border-slate-200 grid grid-cols-[1fr_auto] items-center gap-2 text-[9px] font-bold text-slate-500 w-full min-w-0 overflow-hidden">
                  <div className="min-w-0 break-words [overflow-wrap:anywhere] leading-snug text-left">
                    <span className="font-extrabold text-slate-700">faab gar</span> •{' '}
                    {currentConfig.officialTitle || currentConfig.selectLabel} (
                    <span className="text-[#c2410c] font-extrabold">
                      {currentFields.referenceCode}
                    </span>
                    ) • {userProfile.institution || 'Usage Institutionnel & Universel'}
                  </div>
                  <span className="px-2 py-0.5 rounded bg-orange-50 border border-orange-200 text-[#c2410c] font-black text-[9px] shrink-0 whitespace-nowrap">
                    Page {pageIdx + 1} / {pages.length}
                  </span>
                </div>
              </div>
            </React.Fragment>
          ))}
        </div>
      </div>
      )}

      {/* ========================================================================
          VERSION ORDINATEUR (DESKTOP) & TABLETTE EXCLUSIVEMENT (hidden md:block) :
          1. Affichage côte à côte en vis-à-vis direct : chaque champ de saisie à gauche
             est positionné directement en face de la section de prévisualisation correspondante à droite.
          2. Textarea à hauteur augmentée + spellCheck="true" dynamique (lang="fr" / lang="en").
          3. Case à cocher « Ne pas afficher dans le document / Exclure » grisant le champ sans perdre
             la donnée saisie et retirant immédiatement la section correspondante du document à droite.
          4. Indication explicite du niveau hiérarchique (« Niveau 1 — ... », « Niveau 2 — ... »).
         ======================================================================== */}
      <div className="hidden md:block space-y-5 w-full max-w-full min-w-0">
        {/* Barre d'en-tête & Tiroirs repliables (Images, RACI, Photos Terrain) pour préserver l'alignement vis-à-vis direct */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm space-y-3 w-full max-w-full min-w-0">
          <div className="space-y-2.5 w-full max-w-full min-w-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-[#c2410c] text-[#fdba74] flex items-center justify-center shrink-0">
                <SlidersHorizontal className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-xs lg:text-sm font-black uppercase tracking-wider text-slate-900 dark:text-white">
                    {language === 'EN'
                      ? 'Specific Fields (Direct Side-by-Side Vis-à-Vis Alignment)'
                      : 'Champs Spécifiques (Alignement Côte à Côte en Vis-à-Vis Direct)'}{' '}
                    — {currentConfig.selectLabel}
                  </h3>
                  <span className="px-2 py-0.5 rounded bg-orange-100 dark:bg-slate-800 text-[#c2410c] dark:text-[#fdba74] text-[10px] font-black uppercase">
                    {language === 'EN' ? 'Spellcheck: EN' : 'Orthographe : FR'}
                  </span>
                  {excludedFieldKeys.length > 0 && (
                    <span className="px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 text-[10px] font-black uppercase">
                      {excludedFieldKeys.length}{' '}
                      {language === 'EN'
                        ? 'excluded section(s)'
                        : `section(s) masquée(s)`}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  {language === 'EN'
                    ? 'Each input field on the left is positioned directly opposite its corresponding preview section in the generated A4 document on the right.'
                    : 'Chaque champ de saisie à gauche est situé en vis-à-vis direct de la section de prévisualisation correspondante du document généré à droite.'}
                </p>
              </div>
            </div>

            {/* Barre de boutons multi-lignes adaptative (100% visible et cliquable sur Tablette & Ordinateur) */}
            <div className="flex flex-wrap items-center gap-2 w-full max-w-full pt-2.5 border-t border-slate-100 dark:border-slate-800">
              {/* Sélecteur de Trimestre actif (Q1, Q2, Q3, Q4) dans la barre d'outils CHAMPS SPÉCIFIQUES pour le PTT */}
              {selectedDocType === 'ptt' && (
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#c2410c] text-[#fdba74] border border-[#fdba74] text-xs font-extrabold">
                  <span>Trimestre actif :</span>
                  <select
                    value={currentFields.activeQuarter || 'Q1'}
                    onChange={e =>
                      onUpdateDocField(
                        'ptt',
                        'activeQuarter',
                        e.target.value as 'Q1' | 'Q2' | 'Q3' | 'Q4'
                      )
                    }
                    className="bg-transparent text-white font-black focus:outline-none cursor-pointer"
                  >
                    <option value="Q1" className="text-slate-900">
                      Trimestre 1 (Q1)
                    </option>
                    <option value="Q2" className="text-slate-900">
                      Trimestre 2 (Q2)
                    </option>
                    <option value="Q3" className="text-slate-900">
                      Trimestre 3 (Q3)
                    </option>
                    <option value="Q4" className="text-slate-900">
                      Trimestre 4 (Q4)
                    </option>
                  </select>
                </div>
              )}

              <label
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-extrabold cursor-pointer select-none transition-all ${
                  includeSignatures
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700'
                    : 'bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-300 border-amber-300 dark:border-amber-700'
                }`}
                title={
                  language === 'EN'
                    ? 'Enable or completely hide the formal signature block on the final generated document'
                    : 'Activer ou masquer complètement la zone de signature (lignes, mentions, tampons) sur le document final généré'
                }
              >
                <input
                  type="checkbox"
                  checked={includeSignatures}
                  onChange={handleToggleSignatureBlock}
                  className="rounded border-slate-300 text-[#c2410c] focus:ring-[#fdba74] cursor-pointer"
                />
                <span>
                  {language === 'EN'
                    ? 'Display signature block'
                    : 'Afficher le bloc de signature'}
                </span>
              </label>

              <button
                type="button"
                onClick={() => setShowDesktopImagesDrawer(prev => !prev)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-extrabold cursor-pointer transition-all ${
                  showDesktopImagesDrawer
                    ? 'bg-[#c2410c] text-white border-[#fdba74]'
                    : 'bg-orange-50 dark:bg-slate-800 text-[#c2410c] dark:text-[#fdba74] border-orange-200 dark:border-slate-700 hover:bg-orange-100'
                }`}
              >
                <ImagePlus className="w-3.5 h-3.5 shrink-0" />
                <span>
                  {language === 'EN'
                    ? `Logos & Images (${activeImageFieldDescriptors.length})`
                    : `Logos & Images (${activeImageFieldDescriptors.length})`}
                </span>
                {showDesktopImagesDrawer ? (
                  <ChevronUp className="w-3.5 h-3.5 shrink-0" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5 shrink-0" />
                )}
              </button>

              {hasFieldPhotosSupport && (
                <button
                  type="button"
                  onClick={() => setShowDesktopPhotosDrawer(prev => !prev)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-extrabold cursor-pointer transition-all ${
                    showDesktopPhotosDrawer
                      ? 'bg-[#c2410c] text-white border-[#fdba74]'
                      : 'bg-emerald-50 dark:bg-slate-800 text-[#c2410c] dark:text-[#fdba74] border-emerald-300 dark:border-slate-700 hover:bg-emerald-100'
                  }`}
                >
                  <ImagePlus className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    {language === 'EN'
                      ? `Field Photos Annex (${fieldPhotosList.length})`
                      : `Annexe Photos Terrain (${fieldPhotosList.length})`}
                  </span>
                  {showDesktopPhotosDrawer ? (
                    <ChevronUp className="w-3.5 h-3.5 shrink-0" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5 shrink-0" />
                  )}
                </button>
              )}

              {/* Bouton d'ouverture de la modale centrée : Acteurs RACI & Profil */}
              <button
                type="button"
                onClick={() => setShowDesktopRaciDrawer(prev => !prev)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-extrabold cursor-pointer transition-all ${
                  showDesktopRaciDrawer
                    ? 'bg-[#c2410c] text-white border-[#fdba74]'
                    : 'bg-orange-50 dark:bg-slate-800 text-[#c2410c] dark:text-[#fdba74] border-orange-200 dark:border-slate-700 hover:bg-orange-100'
                }`}
              >
                <Users className="w-3.5 h-3.5 shrink-0" />
                <span>
                  {language === 'EN'
                    ? `RACI Actors & Profile (${raciContext.allActors.length})`
                    : `Acteurs RACI & Profil (${raciContext.allActors.length})`}
                </span>
                {showDesktopRaciDrawer ? (
                  <ChevronUp className="w-3.5 h-3.5 shrink-0" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5 shrink-0" />
                )}
              </button>

              <button
                type="button"
                onClick={() => onResetDocDefaults(selectedDocType)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#c2410c] hover:bg-[#9a3412] text-[#fdba74] text-xs font-extrabold transition-colors cursor-pointer"
                title={
                  language === 'EN'
                    ? 'Restore and automatically synchronize with data from other tabs'
                    : 'Restaurer et synchroniser automatiquement avec les données des autres onglets'
                }
              >
                <Sparkles className="w-3.5 h-3.5 shrink-0" />
                <span>
                  {language === 'EN'
                    ? 'Sync with tabs'
                    : 'Synchroniser avec les onglets'}
                </span>
              </button>
            </div>
          </div>

          {/* Tiroir repliable : Logos & Images */}
          {showDesktopImagesDrawer && (
            <div className="p-3.5 rounded-xl bg-orange-50/70 dark:bg-slate-800/70 border border-[#fdba74] dark:border-slate-700 space-y-2.5">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {activeImageFieldDescriptors.map(imgField => {
                  const currentImgUrl = currentFields[imgField.key];
                  return (
                    <div
                      key={imgField.key}
                      className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-[10.5px] font-extrabold text-slate-800 dark:text-slate-100 truncate">
                            {imgField.label}
                          </div>
                          <div className="text-[9px] font-bold text-[#ea580c] dark:text-[#fdba74] truncate">
                            {imgField.targetSection}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <label className="inline-flex items-center gap-1 px-2 py-1 rounded bg-[#c2410c] hover:bg-[#9a3412] text-white text-[9.5px] font-bold cursor-pointer">
                            <ImagePlus className="w-3 h-3 text-[#fdba74]" />
                            <span>
                              {currentImgUrl
                                ? language === 'EN'
                                  ? 'Change'
                                  : 'Changer'
                                : language === 'EN'
                                ? 'Upload'
                                : 'Importer'}
                            </span>
                            <input
                              type="file"
                              accept="image/*"
                              onChange={e => handleImageFileSelect(imgField.key, e)}
                              className="hidden"
                            />
                          </label>
                          {currentImgUrl && (
                            <button
                              type="button"
                              onClick={() =>
                                setPendingImageDelete({
                                  key: imgField.key,
                                  label: imgField.label
                                })
                              }
                              className="p-1 rounded bg-rose-50 dark:bg-rose-950/50 text-rose-600 hover:bg-rose-100 cursor-pointer"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                      {currentImgUrl ? (
                        <div className="flex items-center gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
                          <img
                            src={currentImgUrl}
                            alt={imgField.label}
                            className="h-9 w-auto max-w-[100px] object-contain rounded border border-slate-200 bg-white p-0.5"
                          />
                          <span className="text-[9px] font-semibold text-emerald-600 dark:text-emerald-400">
                            {language === 'EN' ? '✓ Inserted' : '✓ Insérée'}
                          </span>
                        </div>
                      ) : (
                        <div className="text-[9px] text-slate-400 leading-tight">
                          {imgField.helperText}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Tiroir repliable : Annexe Photos Terrain */}
          {hasFieldPhotosSupport && showDesktopPhotosDrawer && (
            <div className="p-3.5 rounded-xl bg-emerald-50/70 dark:bg-slate-800/80 border border-[#ea580c]/60 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-[#c2410c] text-[#fdba74] text-[10px] font-black uppercase">
                    {language === 'EN' ? 'Level 1 — Annex 3' : 'Niveau 1 — Annexe 3'}
                  </span>
                  <span className="text-xs font-black uppercase text-[#c2410c] dark:text-[#fdba74]">
                    {language === 'EN'
                      ? 'Field Photos Annex & Captions'
                      : 'Annexe — Images du Terrain & Descriptifs'}
                  </span>
                </div>
                <label className="inline-flex items-center gap-1.5 cursor-pointer text-xs font-bold text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={excludedFieldsSet.has('fieldPhotosAnnexTitle')}
                    onChange={() => handleToggleExcludeField('fieldPhotosAnnexTitle')}
                    className="rounded border-slate-300 text-[#c2410c] focus:ring-[#fdba74]"
                  />
                  <span>
                    {language === 'EN'
                      ? 'Do not display in document / Exclude'
                      : 'Ne pas afficher dans le document / Exclure'}
                  </span>
                </label>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  spellCheck={true}
                  lang={language === 'EN' ? 'en' : 'fr'}
                  value={currentFields.fieldPhotosAnnexTitle || ''}
                  onChange={e =>
                    onUpdateDocField(selectedDocType, 'fieldPhotosAnnexTitle', e.target.value)
                  }
                  placeholder="ANNEXE 3 — REPORTAGE PHOTOGRAPHIQUE & CONSTATS VISUELS DE TERRAIN"
                  className="flex-1 min-w-[260px] px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-900 dark:text-white"
                />
                <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#c2410c] hover:bg-[#9a3412] text-white text-xs font-extrabold cursor-pointer">
                  <ImagePlus className="w-3.5 h-3.5 text-[#fdba74]" />
                  <span>
                    {language === 'EN'
                      ? '+ Upload Field Photo(s)'
                      : '+ Importer Image(s) du Terrain'}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleUploadNewFieldPhotos}
                    className="hidden"
                  />
                </label>
                <button
                  type="button"
                  onClick={handleAddFieldPhotoSlot}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 text-[#c2410c] dark:text-[#fdba74] border border-[#ea580c] text-xs font-extrabold cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>
                    {language === 'EN'
                      ? '+ Add Slot & Caption'
                      : '+ Ajouter un Emplacement & Descriptif'}
                  </span>
                </button>
              </div>
              {fieldPhotosList.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[340px] overflow-y-auto">
                  {fieldPhotosList.map((photo, pIdx) => (
                    <div
                      key={photo.id}
                      className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="px-2 py-0.5 rounded bg-[#c2410c] text-[#fdba74] text-[9.5px] font-black uppercase">
                          Image N°{pIdx + 1}
                        </span>
                        <div className="flex items-center gap-1">
                          <label className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-orange-50 dark:bg-slate-800 text-[#c2410c] dark:text-[#fdba74] border border-orange-200 text-[9.5px] font-bold cursor-pointer">
                            <ImagePlus className="w-3 h-3" />
                            <span>{photo.dataUrl ? 'Changer' : 'Choisir'}</span>
                            <input
                              type="file"
                              accept="image/*"
                              onChange={e => handleReplaceFieldPhotoImage(photo.id, e)}
                              className="hidden"
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() => handleRemoveFieldPhotoItem(photo.id)}
                            className="p-1 rounded bg-rose-50 text-rose-600 hover:bg-rose-100 cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                      <input
                        type="text"
                        spellCheck={true}
                        lang={language === 'EN' ? 'en' : 'fr'}
                        value={photo.locationDate || ''}
                        onChange={e =>
                          handleUpdateFieldPhotoItem(photo.id, 'locationDate', e.target.value)
                        }
                        placeholder="Site & Date..."
                        className="w-full px-2 py-1 rounded bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
                      />
                      <textarea
                        rows={3}
                        spellCheck={true}
                        lang={language === 'EN' ? 'en' : 'fr'}
                        value={photo.caption || ''}
                        onChange={e =>
                          handleUpdateFieldPhotoItem(photo.id, 'caption', e.target.value)
                        }
                        className="w-full px-2 py-1 rounded bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* GRILLE CÔTE À CÔTE PAGE PAR PAGE (DESKTOP & TABLETTE) :
            À GAUCHE : Les Champs Spécifiques en vis-à-vis direct des sections de la page A4 (ou de chaque Slide 16:9).
            À DROITE : La page A4 (ou la Slide 16:9) correspondante générée en temps réel. */}
        {isSlideMode ? (
          <SlideDeckWorkspace
            selectedDocType={selectedDocType}
            currentConfig={currentConfig}
            currentFields={currentFields}
            effectiveDossier={effectiveDossier}
            userProfile={userProfile}
            currency={currency}
            language={language}
            slides={slides}
            includeSignatures={includeSignatures}
            onToggleSignatureBlock={handleToggleSignatureBlock}
            onUpdateDocField={onUpdateDocField}
            onResetDocDefaults={onResetDocDefaults}
            activeImageFieldDescriptors={activeImageFieldDescriptors}
            onImageFileSelect={handleImageFileSelect}
            onRequestImageDelete={setPendingImageDelete}
            fieldPhotosList={fieldPhotosList}
            onUploadNewFieldPhotos={handleUploadNewFieldPhotos}
            onAddFieldPhotoSlot={handleAddFieldPhotoSlot}
            onReplaceFieldPhotoImage={handleReplaceFieldPhotoImage}
            onUpdateFieldPhotoItem={handleUpdateFieldPhotoItem}
            onRemoveFieldPhotoItem={handleRemoveFieldPhotoItem}
            optimizeImageFileToDataUrl={optimizeImageFileToDataUrl}
          />
        ) : (
        <div className="space-y-8 pb-8">
          {pages.map((page, pageIdx) => {
            const fieldsForThisPage = currentConfig.fields
              .map((field, fIdx) => ({
                field,
                fIdx,
                meta: getDocFieldHierarchyAndAlignment(
                  selectedDocType,
                  field,
                  fIdx,
                  language
                )
              }))
              .filter(({ meta }) => {
                const clampedTarget = Math.min(
                  Math.max(0, meta.targetPageIndex),
                  Math.max(0, pages.length - 1)
                );
                return clampedTarget === pageIdx;
              });

            return (
              <div key={pageIdx} className="space-y-3">
                {pageIdx > 0 && (
                  <div className="flex items-center gap-3 px-2 select-none" aria-hidden="true">
                    <div className="flex-1 border-t-2 border-dashed border-orange-300 dark:border-slate-700" />
                    <span className="px-3 py-0.5 rounded bg-orange-100 dark:bg-slate-800 text-[10px] font-black uppercase tracking-widest text-[#c2410c] dark:text-[#fdba74]">
                      {language === 'EN'
                        ? `--- A4 PAGE ${pageIdx + 1} / ${pages.length} (DIRECT VIS-À-VIS ALIGNMENT) ---`
                        : `--- PAGE A4 N°${pageIdx + 1} / ${pages.length} (ALIGNEMENT EN VIS-À-VIS DIRECT) ---`}
                    </span>
                    <div className="flex-1 border-t-2 border-dashed border-orange-300 dark:border-slate-700" />
                  </div>
                )}

                <div className="grid grid-cols-12 gap-4 lg:gap-6 items-start">
                  {/* COLONNE GAUCHE (DESKTOP & TABLETTE) : CHAMPS SPÉCIFIQUES EN VIS-À-VIS DIRECT DE CETTE PAGE A4 */}
                  <div className="col-span-5 space-y-3.5">
                    <div className="px-3 py-2 rounded-lg bg-[#c2410c] text-white flex items-center justify-between gap-2 shadow-xs">
                      <span className="text-[11px] font-black uppercase tracking-wider text-[#fdba74] truncate">
                        {language === 'EN'
                          ? `Page ${pageIdx + 1} Specific Fields (${fieldsForThisPage.length})`
                          : `Champs Spécifiques — Page ${pageIdx + 1} (${fieldsForThisPage.length})`}
                      </span>
                      <span className="text-[9.5px] font-bold text-orange-200 shrink-0">
                        {language === 'EN' ? '→ Direct Vis-à-Vis' : '→ Vis-à-vis direct'}
                      </span>
                    </div>

                    {fieldsForThisPage.length === 0 ? (
                      <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-700 space-y-2 text-left shadow-2xs">
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-orange-50 dark:bg-slate-800 text-[#c2410c] dark:text-[#fdba74] text-[10px] font-black uppercase">
                          {language === 'EN'
                            ? `Level 1 — Page ${pageIdx + 1} Automated Matrices & Tables`
                            : `Niveau 1 — Page ${pageIdx + 1} (Tableaux & Matrices Automatisés)`}
                        </div>
                        <div className="text-xs font-extrabold text-slate-800 dark:text-slate-200">
                          {page.pageTitle}
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                          {language === 'EN'
                            ? 'The sections on this A4 page opposite are automatically generated and synchronized in real time from the programme tabs (Planning, Task Tracking, RACI, PERT) and Master Matrices (M1–M10).'
                            : 'Les sections de cette page A4 en vis-à-vis à droite sont générées et synchronisées automatiquement en temps réel depuis les onglets du programme (Planification, Suivi des tâches, RACI, PERT) et les Matrices M1–M10.'}
                        </p>
                      </div>
                    ) : (
                      fieldsForThisPage.map(({ field, meta }) => {
                        const fieldKeyStr = String(field.key);
                        const val = (currentFields[field.key] as string) || '';
                        const isExcluded = excludedFieldsSet.has(fieldKeyStr);
                        const expandedRows = Math.max((field.rows || 3) * 2 + 3, 8);

                        return (
                          <div
                            key={fieldKeyStr}
                            className={`rounded-xl border p-3.5 transition-all shadow-xs space-y-2.5 ${
                              isExcluded
                                ? 'bg-slate-100/90 dark:bg-slate-900/40 border-dashed border-slate-300 dark:border-slate-700 opacity-60'
                                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-[#ea580c]'
                            }`}
                          >
                            {/* 4. Hiérarchie et numérotation des niveaux + 3. Case à cocher d'exclusion conditionnelle */}
                            <div className="flex flex-wrap items-start justify-between gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
                              <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                                <span className="px-2 py-0.5 rounded bg-[#c2410c] text-[#fdba74] text-[10px] font-black uppercase tracking-wider">
                                  {meta.hierarchyBadge}
                                </span>
                                {meta.subHierarchyBadge && (
                                  <span className="px-2 py-0.5 rounded bg-orange-100 dark:bg-slate-800 text-[#c2410c] dark:text-[#fdba74] border border-orange-200 dark:border-slate-700 text-[9.5px] font-extrabold">
                                    {meta.subHierarchyBadge}
                                  </span>
                                )}
                              </div>

                              {/* Case à cocher : Ne pas afficher dans le document / Exclure */}
                              <label
                                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-[10px] font-extrabold cursor-pointer select-none shrink-0 transition-colors ${
                                  isExcluded
                                    ? 'bg-amber-100 dark:bg-amber-950/70 text-amber-900 dark:text-amber-300 border-amber-400'
                                    : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-rose-50 hover:text-rose-700'
                                }`}
                                title={
                                  language === 'EN'
                                    ? 'Hide/exclude this section from the generated document on the right without losing the entered data'
                                    : 'Masquer / retirer immédiatement cette section du document généré à droite sans perdre les données saisies'
                                }
                              >
                                <input
                                  type="checkbox"
                                  checked={isExcluded}
                                  onChange={() => handleToggleExcludeField(field.key)}
                                  className="rounded border-slate-300 text-[#c2410c] focus:ring-[#fdba74] cursor-pointer"
                                />
                                <span>
                                  {language === 'EN'
                                    ? 'Do not display / Exclude'
                                    : 'Ne pas afficher / Exclure'}
                                </span>
                              </label>
                            </div>

                            {/* Libellé du champ + Indication de la section en vis-à-vis à droite */}
                            <div className="space-y-0.5 text-left">
                              <label className="block text-[11px] font-black uppercase tracking-wider text-slate-800 dark:text-slate-200 leading-snug">
                                {field.label}
                              </label>
                              <div className="text-[9.5px] font-bold text-[#ea580c] dark:text-orange-400 flex items-center gap-1 truncate">
                                <span>
                                  {language === 'EN'
                                    ? '⇄ Opposite section on right:'
                                    : '⇄ Section en vis-à-vis à droite :'}
                                </span>
                                <span className="font-extrabold text-[#c2410c] dark:text-[#fdba74] truncate">
                                  {meta.targetSectionHeading}
                                </span>
                              </div>
                            </div>

                            {/* 2. Zone de saisie (Textarea à hauteur augmentée + spellCheck="true" + lang="fr"|"en") */}
                            {field.multiline ? (
                              <textarea
                                rows={expandedRows}
                                spellCheck={true}
                                lang={language === 'EN' ? 'en' : 'fr'}
                                value={val}
                                onChange={e =>
                                  onUpdateDocField(selectedDocType, field.key, e.target.value)
                                }
                                placeholder={field.placeholder}
                                className={`w-full min-h-[160px] px-3 py-2.5 rounded-lg border text-xs leading-relaxed focus:outline-none focus:ring-2 focus:ring-[#fdba74] resize-y transition-colors ${
                                  isExcluded
                                    ? 'bg-slate-200/70 dark:bg-slate-800/40 border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400 line-through decoration-slate-400/50'
                                    : 'bg-slate-50 dark:bg-slate-800/90 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white'
                                }`}
                              />
                            ) : (
                              <input
                                type="text"
                                spellCheck={true}
                                lang={language === 'EN' ? 'en' : 'fr'}
                                value={val}
                                onChange={e =>
                                  onUpdateDocField(selectedDocType, field.key, e.target.value)
                                }
                                placeholder={field.placeholder}
                                className={`w-full px-3 py-2 rounded-lg border text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#fdba74] transition-colors ${
                                  isExcluded
                                    ? 'bg-slate-200/70 dark:bg-slate-800/40 border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400 line-through'
                                    : 'bg-slate-50 dark:bg-slate-800/90 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white'
                                }`}
                              />
                            )}

                            {isExcluded && (
                              <div className="text-[10px] font-bold text-amber-800 dark:text-amber-300 bg-amber-50/90 dark:bg-amber-950/40 px-2.5 py-1 rounded border border-amber-200 dark:border-amber-800 text-left">
                                {language === 'EN'
                                  ? 'Section hidden from the generated document on the right (entered data is preserved).'
                                  : 'Section retirée du document généré à droite (vos données saisies sont conservées).'}
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}

                    {/* RESTAURATION DIRECTE DANS LES « CHAMPS SPÉCIFIQUES » (PAGE 1) :
                        1. Logo institutionnel / logos des partenaires
                        2. Bannière / Image de l'intervention
                        3. Figure / Photo d'illustration technique */}
                    {pageIdx === 0 && (
                      <div className="p-3.5 rounded-xl bg-orange-50/70 dark:bg-slate-900 border-2 border-[#fdba74] dark:border-slate-700 space-y-3 shadow-xs">
                        <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-orange-200/70 dark:border-slate-800">
                          <div className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-[#c2410c] dark:text-[#fdba74]">
                            <ImagePlus className="w-4 h-4 shrink-0" />
                            <span>
                              {language === 'EN'
                                ? 'Logos, Intervention Banner & Illustration'
                                : 'Logos Institutionnels, Bannière & Illustration'}
                            </span>
                          </div>
                          <span className="px-2 py-0.5 rounded bg-[#c2410c] text-[#fdba74] text-[9.5px] font-black uppercase">
                            {language === 'EN' ? 'Vis-à-Vis Page 1' : 'Vis-à-vis Page 1'}
                          </span>
                        </div>
                        <p className="text-[10.5px] text-slate-600 dark:text-slate-300 leading-snug text-left">
                          {language === 'EN'
                            ? 'Upload the institutional logo, partner/donor logo, intervention banner image, and illustration figure directly inserted into the generated document on the right:'
                            : 'Importez le logo institutionnel, le logo partenaire/bailleur, la bannière/image de l’intervention et la figure d’illustration qui s’insèrent directement dans le document à droite :'}
                        </p>

                        <div className="grid grid-cols-1 gap-2.5">
                          {activeImageFieldDescriptors
                            .filter(
                              d =>
                                d.key !== 'orgStampDataUrl' && d.key !== 'partnerStampDataUrl'
                            )
                            .map(imgField => {
                              const currentImgUrl = currentFields[imgField.key];
                              return (
                                <div
                                  key={imgField.key}
                                  className="p-2.5 rounded-lg bg-white dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 space-y-1.5 text-left"
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="min-w-0">
                                      <div className="text-[11px] font-extrabold text-slate-800 dark:text-slate-100 truncate">
                                        {imgField.label}
                                      </div>
                                      <div className="text-[9.5px] font-bold text-[#ea580c] dark:text-[#fdba74] truncate">
                                        ⇄ {imgField.targetSection}
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                      <label className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#c2410c] hover:bg-[#9a3412] text-white text-[10px] font-bold cursor-pointer transition-colors">
                                        <ImagePlus className="w-3 h-3 text-[#fdba74]" />
                                        <span>
                                          {currentImgUrl
                                            ? language === 'EN'
                                              ? 'Change'
                                              : 'Changer'
                                            : language === 'EN'
                                            ? 'Upload'
                                            : 'Importer'}
                                        </span>
                                        <input
                                          type="file"
                                          accept="image/*"
                                          onChange={e =>
                                            handleImageFileSelect(imgField.key, e)
                                          }
                                          className="hidden"
                                        />
                                      </label>
                                      {currentImgUrl && (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setPendingImageDelete({
                                              key: imgField.key,
                                              label: imgField.label
                                            })
                                          }
                                          className="p-1 rounded bg-rose-50 dark:bg-rose-950/50 text-rose-600 hover:bg-rose-100 cursor-pointer"
                                          title={
                                            language === 'EN'
                                              ? 'Remove image'
                                              : 'Supprimer l’image'
                                          }
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                  {currentImgUrl ? (
                                    <div className="flex items-center gap-2 pt-1.5 border-t border-slate-100 dark:border-slate-700">
                                      <img
                                        src={currentImgUrl}
                                        alt={imgField.label}
                                        className="h-11 w-auto max-w-[120px] object-contain rounded border border-slate-200 bg-white p-0.5"
                                      />
                                      <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                                        {language === 'EN'
                                          ? '✓ Displayed in document'
                                          : '✓ Affichée dans le document'}
                                      </span>
                                    </div>
                                  ) : (
                                    <div className="text-[9.5px] text-slate-400 leading-tight">
                                      {imgField.helperText}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                        </div>
                      </div>
                    )}

                    {/* RESTAURATION DIRECTE DANS LES « CHAMPS SPÉCIFIQUES » (DERNIÈRE PAGE / BAS DU DOCUMENT) :
                        - Images des opérations terrain / photos d'illustration avec descriptif
                        - Gestion conditionnelle du bloc de signature (Case à cocher + Cachets/Signatures) */}
                    {pageIdx === pages.length - 1 && (
                      <>
                        {/* BLOC : IMAGES DES OPÉRATIONS TERRAIN / PHOTOS D'ILLUSTRATION */}
                        <div className="p-3.5 rounded-xl bg-emerald-50/70 dark:bg-slate-900 border-2 border-emerald-400/70 dark:border-emerald-800 space-y-3 shadow-xs text-left">
                          <div className="flex flex-wrap items-center justify-between gap-2 pb-1.5 border-b border-emerald-200/70 dark:border-slate-800">
                            <div className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-[#c2410c] dark:text-[#fdba74]">
                              <ImagePlus className="w-4 h-4 text-emerald-600 shrink-0" />
                              <span>
                                {language === 'EN'
                                  ? 'Field Operations Images & Illustration Photos'
                                  : 'Images des Opérations Terrain / Photos d’Illustration'}
                              </span>
                            </div>
                            <span className="px-2 py-0.5 rounded-full bg-[#c2410c] text-[#fdba74] text-[9.5px] font-black uppercase">
                              {fieldPhotosList.length}{' '}
                              {language === 'EN' ? 'photo(s)' : 'photo(s)'}
                            </span>
                          </div>

                          <div className="space-y-1">
                            <label className="block text-[10.5px] font-extrabold uppercase tracking-wider text-[#c2410c] dark:text-[#fdba74]">
                              {language === 'EN'
                                ? 'Title of the Field Photos / Illustrations Section :'
                                : 'Intitulé de la Section (Images des Opérations Terrain) :'}
                            </label>
                            <input
                              type="text"
                              spellCheck={true}
                              lang={language === 'EN' ? 'en' : 'fr'}
                              value={currentFields.fieldPhotosAnnexTitle || ''}
                              onChange={e =>
                                onUpdateDocField(
                                  selectedDocType,
                                  'fieldPhotosAnnexTitle',
                                  e.target.value
                                )
                              }
                              placeholder={
                                language === 'EN'
                                  ? 'Ex: ANNEX — FIELD OPERATIONS PHOTOS & VISUAL ILLUSTRATIONS'
                                  : 'Ex: ANNEXE — REPORTAGE PHOTOGRAPHIQUE & OPÉRATIONS DE TERRAIN'
                              }
                              className="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#fdba74]"
                            />
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#c2410c] hover:bg-[#9a3412] text-white text-xs font-extrabold cursor-pointer transition-colors shadow-2xs">
                              <ImagePlus className="w-3.5 h-3.5 text-[#fdba74]" />
                              <span>
                                {language === 'EN'
                                  ? '+ Upload Field Photo(s)'
                                  : '+ Importer Image(s) Terrain'}
                              </span>
                              <input
                                type="file"
                                accept="image/*"
                                multiple
                                onChange={handleUploadNewFieldPhotos}
                                className="hidden"
                              />
                            </label>
                            <button
                              type="button"
                              onClick={handleAddFieldPhotoSlot}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 hover:bg-orange-50 text-[#c2410c] dark:text-[#fdba74] border border-[#ea580c] text-xs font-extrabold cursor-pointer transition-colors"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>
                                {language === 'EN'
                                  ? '+ Add Photo Slot & Caption'
                                  : '+ Ajouter Emplacement & Descriptif'}
                              </span>
                            </button>
                          </div>

                          {fieldPhotosList.length > 0 && (
                            <div className="space-y-2.5 max-h-[360px] overflow-y-auto pr-1">
                              {fieldPhotosList.map((photo, pIdx) => (
                                <div
                                  key={photo.id}
                                  className="p-2.5 rounded-lg bg-white dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 space-y-2"
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="px-2 py-0.5 rounded bg-[#c2410c] text-[#fdba74] text-[9.5px] font-black uppercase">
                                      {language === 'EN'
                                        ? `Field Photo #${pIdx + 1}`
                                        : `Image Terrain N°${pIdx + 1}`}
                                    </span>
                                    <div className="flex items-center gap-1">
                                      <label className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-orange-50 dark:bg-slate-700 text-[#c2410c] dark:text-[#fdba74] border border-orange-200 dark:border-slate-600 text-[9.5px] font-bold cursor-pointer">
                                        <ImagePlus className="w-3 h-3" />
                                        <span>
                                          {photo.dataUrl
                                            ? language === 'EN'
                                              ? 'Change'
                                              : 'Changer'
                                            : language === 'EN'
                                            ? 'Select'
                                            : 'Choisir'}
                                        </span>
                                        <input
                                          type="file"
                                          accept="image/*"
                                          onChange={e =>
                                            handleReplaceFieldPhotoImage(photo.id, e)
                                          }
                                          className="hidden"
                                        />
                                      </label>
                                      <button
                                        type="button"
                                        onClick={() => handleRemoveFieldPhotoItem(photo.id)}
                                        className="p-1 rounded bg-rose-50 dark:bg-rose-950/50 text-rose-600 hover:bg-rose-100 cursor-pointer"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  </div>

                                  {photo.dataUrl && (
                                    <div className="p-1.5 rounded bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex justify-center">
                                      <img
                                        src={photo.dataUrl}
                                        alt={`Terrain ${pIdx + 1}`}
                                        className="max-h-24 w-auto object-contain rounded bg-white p-0.5"
                                      />
                                    </div>
                                  )}

                                  <input
                                    type="text"
                                    spellCheck={true}
                                    lang={language === 'EN' ? 'en' : 'fr'}
                                    value={photo.locationDate || ''}
                                    onChange={e =>
                                      handleUpdateFieldPhotoItem(
                                        photo.id,
                                        'locationDate',
                                        e.target.value
                                      )
                                    }
                                    placeholder={
                                      language === 'EN'
                                        ? 'Location & Date...'
                                        : 'Site d’opération & Date...'
                                    }
                                    className="w-full px-2.5 py-1.5 rounded bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-900 dark:text-white"
                                  />
                                  <textarea
                                    rows={4}
                                    spellCheck={true}
                                    lang={language === 'EN' ? 'en' : 'fr'}
                                    value={photo.caption || ''}
                                    onChange={e =>
                                      handleUpdateFieldPhotoItem(
                                        photo.id,
                                        'caption',
                                        e.target.value
                                      )
                                    }
                                    placeholder={
                                      language === 'EN'
                                        ? 'Visual description displayed below the field photo...'
                                        : 'Descriptif visuel affiché sous l’image de terrain...'
                                    }
                                    className="w-full px-2.5 py-1.5 rounded bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs leading-relaxed text-slate-900 dark:text-white"
                                  />
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* BLOC : GESTION CONDITIONNELLE DU BLOC DE SIGNATURE & CACHETS OFFICIELS */}
                        <div
                          className={`p-3.5 rounded-xl border-2 space-y-3 shadow-xs text-left transition-all ${
                            includeSignatures
                              ? 'bg-white dark:bg-slate-900 border-[#c2410c]/60 dark:border-orange-700'
                              : 'bg-slate-100/80 dark:bg-slate-900/40 border-dashed border-slate-300 dark:border-slate-700 opacity-75'
                          }`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
                            <span className="px-2 py-0.5 rounded bg-[#c2410c] text-[#fdba74] text-[10px] font-black uppercase tracking-wider">
                              {language === 'EN'
                                ? 'Signature & Official Stamps Block'
                                : 'Bloc de Signature & Cachets Officiels'}
                            </span>

                            <label className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-orange-50 dark:bg-slate-800 border border-orange-200 dark:border-slate-700 text-[10.5px] font-extrabold text-[#c2410c] dark:text-[#fdba74] cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={includeSignatures}
                                onChange={handleToggleSignatureBlock}
                                className="rounded border-slate-300 text-[#c2410c] focus:ring-[#fdba74] cursor-pointer"
                              />
                              <span>
                                {language === 'EN'
                                  ? 'Include signatures in document'
                                  : 'Afficher le bloc de signature'}
                              </span>
                            </label>
                          </div>

                          <p className="text-[10.5px] text-slate-600 dark:text-slate-300 leading-snug">
                            {includeSignatures
                              ? language === 'EN'
                                ? 'The signature zone (signatories, mentions, and official stamps) is active at the bottom of the document on the right.'
                                : 'La zone de signature (lignes de signature, mentions « Lu et approuvé » et cachets officiels) est affichée au bas du document à droite.'
                              : language === 'EN'
                              ? 'The signature block is completely hidden from the generated document on the right without leaving empty space.'
                              : 'La zone de signature est entièrement masquée sur le document final généré à droite, sans laisser d’espace vide inutile.'}
                          </p>

                          {includeSignatures && (
                            <div className="grid grid-cols-1 gap-2 pt-1">
                              {activeImageFieldDescriptors
                                .filter(
                                  d =>
                                    d.key === 'orgStampDataUrl' ||
                                    d.key === 'partnerStampDataUrl'
                                )
                                .map(stampField => {
                                  const currentStampUrl = currentFields[stampField.key];
                                  return (
                                    <div
                                      key={stampField.key}
                                      className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2"
                                    >
                                      <div className="min-w-0">
                                        <div className="text-[10.5px] font-extrabold text-slate-800 dark:text-slate-100 truncate">
                                          {stampField.label}
                                        </div>
                                        {currentStampUrl && (
                                          <img
                                            src={currentStampUrl}
                                            alt={stampField.label}
                                            className="h-9 w-auto object-contain rounded border border-slate-200 bg-white p-0.5 mt-1"
                                          />
                                        )}
                                      </div>
                                      <div className="flex items-center gap-1 shrink-0">
                                        <label className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[#c2410c] hover:bg-[#9a3412] text-white text-[10px] font-bold cursor-pointer">
                                          <ImagePlus className="w-3 h-3 text-[#fdba74]" />
                                          <span>
                                            {currentStampUrl
                                              ? language === 'EN'
                                                ? 'Change'
                                                : 'Changer'
                                              : language === 'EN'
                                              ? 'Upload'
                                              : 'Importer'}
                                          </span>
                                          <input
                                            type="file"
                                            accept="image/*"
                                            onChange={e =>
                                              handleImageFileSelect(stampField.key, e)
                                            }
                                            className="hidden"
                                          />
                                        </label>
                                        {currentStampUrl && (
                                          <button
                                            type="button"
                                            onClick={() =>
                                              setPendingImageDelete({
                                                key: stampField.key,
                                                label: stampField.label
                                              })
                                            }
                                            className="p-1 rounded bg-rose-50 dark:bg-rose-950/50 text-rose-600 hover:bg-rose-100 cursor-pointer"
                                          >
                                            <Trash2 className="w-3.5 h-3.5" />
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>

                  {/* COLONNE DROITE (DESKTOP & TABLETTE) : PRÉVISUALISATION DE LA PAGE A4 EN VIS-À-VIS DIRECT */}
                  <div className="col-span-7 min-w-0 overflow-x-auto">
                    <div className="a4-page flex flex-col justify-between overflow-hidden">
                      <div className="min-w-0">
                        {/* Institutional Header */}
                        <div className="border-b-2 border-[#c2410c] pb-3 mb-5 flex items-start justify-between gap-3 min-w-0">
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            {currentFields.rightLogoDataUrl ? (
                              <img
                                src={currentFields.rightLogoDataUrl}
                                alt="Logo Agence d'Exécution"
                                className="w-11 h-11 object-contain rounded bg-white p-0.5 border border-slate-200 shrink-0"
                              />
                            ) : (
                              <AppLogo className="w-11 h-11 shrink-0" />
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-black uppercase tracking-wider text-[#c2410c] leading-[1.2] break-words">
                                {page.pageTitle}
                              </div>
                              <div className="text-[10.5px] font-bold text-slate-600 leading-[1.3] break-words mt-0.5">
                                {page.pageSubtitle}
                              </div>
                            </div>
                          </div>
                          <div className="text-right text-[10px] font-bold text-slate-500 shrink-0 max-w-[155px] break-words">
                            {!excludedFieldsSet.has('referenceCode') && (
                              <div className="font-extrabold text-[#c2410c]">
                                Réf: {currentFields.referenceCode}
                              </div>
                            )}
                            {!excludedFieldsSet.has('locationCity') && (
                              <div className="text-[#ea580c]">{currentFields.locationCity}</div>
                            )}
                          </div>
                        </div>

                        {/* Page Sections */}
                        <div className="space-y-6 min-w-0">
                          {page.sections.map((sec, sIdx) => (
                            <div key={sIdx} className="space-y-3 min-w-0">
                              <h3 className="text-xs font-black uppercase tracking-wider text-[#c2410c] bg-orange-50 px-3 py-1.5 rounded-lg border-l-4 border-[#ea580c] leading-[1.2] break-words">
                                {sec.heading}
                              </h3>

                              {sec.coverChart && (
                                <div className="rounded-xl border-2 border-[#c2410c] bg-white p-4 sm:p-5 shadow-sm space-y-5 overflow-hidden">
                                  {/* Top Logos & Institutions Header (Synchronized 2-Column Grid with Centered Logos & Aligned Baselines) */}
                                  <div className="border-b border-dashed border-slate-300 pb-3.5">
                                    <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 px-3 sm:px-5 py-3.5 rounded-lg bg-slate-50 border border-slate-200 items-start">
                                      {/* Row 1: Logos centered directly above their respective text blocks */}
                                      {(sec.coverChart.leftLogoDataUrl || sec.coverChart.rightLogoDataUrl) && (
                                        <>
                                          <div className="w-full max-w-[67%] mr-auto flex items-center justify-center min-h-[68px] pb-1">
                                            {sec.coverChart.leftLogoDataUrl && (
                                              <img
                                                src={sec.coverChart.leftLogoDataUrl}
                                                alt="Logo Bailleur / Commanditaire"
                                                className="max-h-[62px] max-w-[150px] w-auto object-contain object-center mx-auto rounded bg-white p-1 border border-slate-200 shadow-2xs"
                                              />
                                            )}
                                          </div>
                                          <div className="w-full max-w-[67%] ml-auto flex items-center justify-center min-h-[68px] pb-1">
                                            {sec.coverChart.rightLogoDataUrl && (
                                              <img
                                                src={sec.coverChart.rightLogoDataUrl}
                                                alt="Logo Agence d'Exécution"
                                                className="max-h-[62px] max-w-[150px] w-auto object-contain object-center mx-auto rounded bg-white p-1 border border-slate-200 shadow-2xs"
                                              />
                                            )}
                                          </div>
                                        </>
                                      )}

                                      {/* Row 2: Organization / Institution Names (Bold, strictly aligned on the same horizontal baseline) */}
                                      {(sec.coverChart.leftLogo || sec.coverChart.rightLogo) && (
                                        <>
                                          <div className="w-full max-w-[67%] mr-auto text-center self-start text-[10.5px] font-bold text-slate-900 whitespace-pre-line break-words leading-snug min-w-0">
                                            {sec.coverChart.leftLogo || ''}
                                          </div>
                                          <div className="w-full max-w-[67%] ml-auto text-center self-start text-[10.5px] font-bold text-slate-900 whitespace-pre-line break-words leading-snug min-w-0">
                                            {sec.coverChart.rightLogo || ''}
                                          </div>
                                        </>
                                      )}

                                      {/* Row 3: Direction / Department Names (Normal weight, strictly aligned on the same horizontal baseline) */}
                                      {(sec.coverChart.leftDepartment || sec.coverChart.rightDepartment) && (
                                        <>
                                          <div className="w-full max-w-[67%] mr-auto text-center self-start text-[9.5px] font-normal text-slate-600 whitespace-pre-line break-words leading-snug min-w-0">
                                            {sec.coverChart.leftDepartment || ''}
                                          </div>
                                          <div className="w-full max-w-[67%] ml-auto text-center self-start text-[9.5px] font-normal text-slate-600 whitespace-pre-line break-words leading-snug min-w-0">
                                            {sec.coverChart.rightDepartment || ''}
                                          </div>
                                        </>
                                      )}
                                    </div>
                                  </div>

                                  <div className="rounded-xl bg-[#c2410c] text-white p-5 border-b-4 border-[#fdba74] text-center space-y-3">
                                    <div className="inline-block px-3 py-0.5 rounded-full bg-[#fdba74] text-slate-950 text-[9.5px] font-black uppercase tracking-widest max-w-full break-words">
                                      {currentConfig.badgeText}
                                    </div>
                                    {sec.coverChart.bannerImageDataUrl && (
                                      <div className="py-1.5 flex justify-center">
                                        <img
                                          src={sec.coverChart.bannerImageDataUrl}
                                          alt="Bannière de l'Intervention"
                                          className="max-h-[160px] w-auto max-w-full mx-auto object-contain rounded-lg border-2 border-[#fdba74] bg-white/95 p-1.5 shadow-md"
                                        />
                                      </div>
                                    )}
                                    {sec.coverChart.bannerTitle && (
                                      <div className="text-xs sm:text-sm font-black uppercase tracking-wider text-[#fdba74] whitespace-pre-line break-words leading-[1.25]">
                                        {sec.coverChart.bannerTitle}
                                      </div>
                                    )}
                                    {sec.coverChart.bannerSubtitle && (
                                      <div className="text-[10px] text-orange-100 italic break-words">
                                        {sec.coverChart.bannerSubtitle}
                                      </div>
                                    )}
                                  </div>

                                  <div className="py-4 px-3 rounded-xl bg-orange-50/70 border border-orange-200 text-center space-y-1.5">
                                    <div className="text-base sm:text-lg font-black uppercase tracking-tight text-[#c2410c] leading-[1.2] break-words">
                                      {sec.coverChart.docTitle}
                                    </div>
                                    {sec.coverChart.docSubtitle && (
                                      <div className="text-[11px] font-extrabold text-slate-700 whitespace-pre-line break-words leading-[1.4]">
                                        {sec.coverChart.docSubtitle}
                                      </div>
                                    )}
                                  </div>

                                  <div className="grid grid-cols-2 gap-4 items-center border-t border-dashed border-slate-300 pt-3">
                                    <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-left space-y-1 min-w-0">
                                      {sec.coverChart.bottomLeftStructure && (
                                        <div className="text-[10px] font-extrabold text-slate-800 whitespace-pre-line break-words">
                                          {sec.coverChart.bottomLeftStructure}
                                        </div>
                                      )}
                                      {sec.coverChart.bottomLeftZone && (
                                        <div className="text-[10px] font-bold text-[#ea580c] whitespace-pre-line break-words">
                                          {sec.coverChart.bottomLeftZone}
                                        </div>
                                      )}
                                    </div>
                                    <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-right space-y-1 min-w-0">
                                      {sec.coverChart.bottomRightDateVersion && (
                                        <div className="text-[10px] font-extrabold text-slate-800 whitespace-pre-line break-words">
                                          {sec.coverChart.bottomRightDateVersion}
                                        </div>
                                      )}
                                      {sec.coverChart.bottomRightStatus && (
                                        <div className="text-[10px] font-black text-emerald-700 whitespace-pre-line break-words">
                                          {sec.coverChart.bottomRightStatus}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              )}

                              {sec.adminLetterHeader && (
                                <div className="rounded-xl border-2 border-[#c2410c] bg-white p-4 shadow-sm space-y-3.5 overflow-hidden">
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-3 border-b border-dashed border-slate-300">
                                    <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-left space-y-1 min-w-0">
                                      <div className="text-[9px] font-black uppercase tracking-wider text-[#ea580c]">
                                        EXPÉDITEUR / TIMBRE OFFICIEL
                                      </div>
                                      {(sec.adminLetterHeader.rightLogoDataUrl ||
                                        sec.adminLetterHeader.leftLogoDataUrl) && (
                                        <div className="py-1 flex justify-start gap-2">
                                          {sec.adminLetterHeader.rightLogoDataUrl && (
                                            <img
                                              src={sec.adminLetterHeader.rightLogoDataUrl}
                                              alt="Logo Structure Émettrice"
                                              className="max-h-12 max-w-[120px] object-contain rounded bg-white p-0.5 border border-slate-200"
                                            />
                                          )}
                                          {sec.adminLetterHeader.leftLogoDataUrl && (
                                            <img
                                              src={sec.adminLetterHeader.leftLogoDataUrl}
                                              alt="Logo Partenaire"
                                              className="max-h-12 max-w-[120px] object-contain rounded bg-white p-0.5 border border-slate-200"
                                            />
                                          )}
                                        </div>
                                      )}
                                      <div className="text-[11px] font-black uppercase text-[#c2410c] break-words">
                                        {sec.adminLetterHeader.senderInstitution}
                                      </div>
                                      <div className="text-[10.5px] font-extrabold text-slate-900 break-words">
                                        {sec.adminLetterHeader.senderName} — {sec.adminLetterHeader.senderRole}
                                      </div>
                                      <div className="text-[9.5px] text-slate-600 break-words">
                                        {sec.adminLetterHeader.senderContact}
                                      </div>
                                      {sec.adminLetterHeader.referenceCode && (
                                        <div className="pt-1 text-[10px] font-black text-[#c2410c] break-words">
                                          N° Réf : {sec.adminLetterHeader.referenceCode}
                                        </div>
                                      )}
                                    </div>

                                    <div className="p-3 rounded-lg bg-orange-50/50 border border-orange-200 text-left sm:text-right flex flex-col justify-between space-y-2 min-w-0">
                                      <div className="text-[10.5px] font-extrabold text-slate-800 break-words">
                                        {sec.adminLetterHeader.cityAndDate}
                                      </div>
                                      <div className="space-y-1">
                                        <div className="text-[9px] font-black uppercase tracking-wider text-[#ea580c]">
                                          À L’ATTENTION DE :
                                        </div>
                                        <div className="text-[11px] font-black text-slate-900 break-words">
                                          {sec.adminLetterHeader.recipientTitle}
                                        </div>
                                        <div className="text-[10.5px] font-extrabold text-[#c2410c] break-words">
                                          {sec.adminLetterHeader.recipientOrg}
                                        </div>
                                      </div>
                                    </div>
                                  </div>

                                  {sec.adminLetterHeader.subjectLine && (
                                    <div className="p-3 rounded-lg bg-orange-50/80 border-l-4 border-[#c2410c] space-y-1 text-left">
                                      <div className="text-[11px] font-black text-[#c2410c] break-words">
                                        <span className="underline">OBJET</span> :{' '}
                                        <span className="text-slate-900 font-extrabold">
                                          {sec.adminLetterHeader.subjectLine}
                                        </span>
                                      </div>
                                      <div className="text-[10px] font-bold text-slate-600 break-words tabular-nums">
                                        <span className="font-black text-[#ea580c]">RÉF. DOSSIER :</span>{' '}
                                        {sec.adminLetterHeader.dossierRefLine}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}

                              {sec.cvHeaderBanner && (
                                <div className="rounded-xl border-2 border-[#c2410c] bg-white p-3.5 sm:p-4 shadow-sm overflow-hidden w-full box-border">
                                  <div className="flex flex-col sm:flex-row items-start justify-between gap-3.5 min-w-0 w-full">
                                    <div className="flex-1 space-y-2 text-left min-w-0 w-full overflow-hidden">
                                      <div className="inline-block max-w-full px-2.5 py-0.5 rounded-md bg-[#c2410c] text-[#fdba74] text-[8.5px] sm:text-[9px] font-black uppercase tracking-wider break-words [overflow-wrap:anywhere] leading-snug">
                                        {sec.cvHeaderBanner.docBadge}
                                      </div>
                                      <div className="text-base sm:text-lg font-black uppercase tracking-tight text-[#c2410c] leading-tight break-words [overflow-wrap:anywhere]">
                                        {sec.cvHeaderBanner.fullNameUpper}
                                      </div>
                                      <div className="text-xs font-extrabold text-[#ea580c] leading-snug break-words [overflow-wrap:anywhere]">
                                        {sec.cvHeaderBanner.expertTitleLine}
                                      </div>
                                      <div className="text-[10.5px] font-bold text-slate-700 leading-relaxed break-words [overflow-wrap:anywhere] pt-1 border-t border-slate-200">
                                        {sec.cvHeaderBanner.contactLine}
                                      </div>
                                      {sec.cvHeaderBanner.metaSubLine && (
                                        <div className="p-2 rounded-lg bg-orange-50/80 border border-orange-200 text-[10px] font-semibold text-slate-800 whitespace-pre-line break-words [overflow-wrap:anywhere] leading-snug">
                                          {sec.cvHeaderBanner.metaSubLine}
                                        </div>
                                      )}
                                    </div>

                                    {sec.cvHeaderBanner.profilePhotoDataUrl && (
                                      <div className="flex flex-col items-center sm:items-end justify-start shrink-0 self-center sm:self-start">
                                        <div className="w-[104px] h-[134px] sm:w-[120px] sm:h-[154px] rounded-md border border-slate-300 bg-slate-50 overflow-hidden flex flex-col items-center justify-center shadow-2xs shrink-0 box-border">
                                          <img
                                            src={sec.cvHeaderBanner.profilePhotoDataUrl}
                                            alt="Photo de profil de l'Expert"
                                            className="w-full h-full object-cover"
                                          />
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}

                              {sec.operationalHeaderBanner && (
                                <div className="rounded-xl border-2 border-[#c2410c] bg-white p-3.5 shadow-sm space-y-2.5 overflow-hidden">
                                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center pb-2.5 border-b border-dashed border-slate-300">
                                    <div className="sm:col-span-3 p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-left flex flex-col items-start justify-center min-h-[72px] min-w-0">
                                      {sec.operationalHeaderBanner.rightLogoDataUrl && (
                                        <img
                                          src={sec.operationalHeaderBanner.rightLogoDataUrl}
                                          alt="Logo Structure Émettrice"
                                          className="max-h-[60px] w-auto max-w-full object-contain rounded bg-white p-0.5 border border-slate-200 mb-1.5"
                                        />
                                      )}
                                      {sec.operationalHeaderBanner.leftLogoLabel && (
                                        <div className="text-[9.5px] font-extrabold text-slate-800 whitespace-pre-line break-words leading-tight">
                                          {sec.operationalHeaderBanner.leftLogoLabel}
                                        </div>
                                      )}
                                    </div>

                                    <div className="sm:col-span-6 p-2.5 rounded-lg bg-[#c2410c] text-white text-center space-y-1 border-b-2 border-[#fdba74]">
                                      <div className="text-xs sm:text-sm font-black uppercase tracking-wider text-[#fdba74] break-words leading-tight">
                                        {sec.operationalHeaderBanner.centerDocTitle}
                                      </div>
                                      <div className="text-[10px] font-bold text-white break-words leading-snug">
                                        {sec.operationalHeaderBanner.centerSubTitle}
                                      </div>
                                      <div className="text-[9px] text-orange-200 font-semibold break-words">
                                        {sec.operationalHeaderBanner.referenceAndDateLine}
                                      </div>
                                    </div>

                                    <div className="sm:col-span-3 p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-right flex flex-col items-end justify-center min-h-[72px] min-w-0">
                                      {sec.operationalHeaderBanner.leftLogoDataUrl && (
                                        <img
                                          src={sec.operationalHeaderBanner.leftLogoDataUrl}
                                          alt="Logo Partenaire / Bailleur"
                                          className="max-h-[60px] w-auto max-w-full object-contain rounded bg-white p-0.5 border border-slate-200 mb-1.5"
                                        />
                                      )}
                                      {sec.operationalHeaderBanner.rightLogoLabel && (
                                        <div className="text-[9.5px] font-extrabold text-slate-800 whitespace-pre-line break-words leading-tight">
                                          {sec.operationalHeaderBanner.rightLogoLabel}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              )}

                              {sec.keyValueRows && sec.keyValueRows.length > 0 && (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                                  {sec.keyValueRows.map(([k, v], kIdx) => {
                                    const hasCurrency = /\b(FCFA|EUR|USD)\b/.test(v);
                                    return (
                                      <div
                                        key={kIdx}
                                        className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 min-w-0"
                                      >
                                        <div className="text-[9px] font-bold uppercase text-slate-400 break-words">
                                          {k}
                                        </div>
                                        <div
                                          className={`text-[10.5px] font-extrabold mt-0.5 whitespace-normal break-words [overflow-wrap:anywhere] leading-[1.4] ${
                                            hasCurrency ? 'text-[#c2410c] tabular-nums' : 'text-slate-900'
                                          }`}
                                        >
                                          {v}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}

                              {sec.paragraphs &&
                                sec.paragraphs.map((p, pIdx) => (
                                  <p
                                    key={pIdx}
                                    className="text-[11px] leading-[1.5] text-slate-700 text-left sm:text-justify whitespace-pre-line break-words [overflow-wrap:anywhere] px-1 max-w-full"
                                  >
                                    {p}
                                  </p>
                                ))}

                              {sec.bullets && sec.bullets.length > 0 && (
                                <ul className="list-disc pl-5 space-y-1.5 text-[11px] leading-[1.5] text-slate-700 max-w-full overflow-hidden">
                                  {sec.bullets.map((bItem, bIdx) => (
                                    <li key={bIdx} className="leading-[1.5] break-words [overflow-wrap:anywhere]">
                                      {bItem}
                                    </li>
                                  ))}
                                </ul>
                              )}

                              {sec.figureImage && sec.figureImage.dataUrl && (
                                <div className="my-3 p-3 rounded-xl bg-slate-50 border border-slate-200 text-center space-y-2 break-inside-avoid">
                                  <img
                                    src={sec.figureImage.dataUrl}
                                    alt={sec.figureImage.caption}
                                    className="max-h-52 w-auto max-w-full mx-auto object-contain rounded-lg border border-slate-200 bg-white p-1.5 shadow-xs"
                                  />
                                  <div className="text-[10px] font-extrabold text-[#c2410c] italic break-words">
                                    {sec.figureImage.caption}
                                  </div>
                                </div>
                              )}

                              {sec.fieldPhotosAnnex && sec.fieldPhotosAnnex.photos.length > 0 && (
                                <div className="my-3 space-y-3 break-inside-avoid">
                                  <div
                                    className={`grid grid-cols-1 ${
                                      sec.fieldPhotosAnnex.photos.length === 1
                                        ? 'sm:grid-cols-1 max-w-xl mx-auto'
                                        : 'sm:grid-cols-2'
                                    } gap-3.5`}
                                  >
                                    {sec.fieldPhotosAnnex.photos.map((photo, pIdx) => (
                                      <div
                                        key={photo.id || pIdx}
                                        className="rounded-xl border-2 border-[#c2410c]/80 bg-white overflow-hidden shadow-xs flex flex-col justify-between break-inside-avoid"
                                      >
                                        <div className="bg-[#c2410c] text-white px-3 py-1.5 flex items-center justify-between gap-2 text-[9px] font-black uppercase tracking-wider">
                                          <span className="text-[#fdba74]">
                                            {language === 'EN'
                                              ? `FIELD PHOTO #${pIdx + 1}`
                                              : `IMAGE DE TERRAIN N°${pIdx + 1}`}
                                          </span>
                                          {photo.locationDate && (
                                            <span className="text-orange-100 font-bold truncate max-w-[60%]">
                                              {photo.locationDate}
                                            </span>
                                          )}
                                        </div>
                                        {photo.dataUrl && (
                                          <div className="p-2.5 bg-slate-50 flex items-center justify-center min-h-[145px] border-b border-slate-200">
                                            <img
                                              src={photo.dataUrl}
                                              alt={`Image de terrain N°${pIdx + 1}`}
                                              className="max-h-48 w-auto max-w-full object-contain rounded border border-slate-200 bg-white p-1 shadow-2xs"
                                            />
                                          </div>
                                        )}
                                        {photo.caption && (
                                          <div className="p-2.5 bg-orange-50/70 text-left space-y-0.5">
                                            <div className="text-[8.5px] font-black uppercase tracking-wider text-[#ea580c]">
                                              {language === 'EN'
                                                ? `Field Observation #${pIdx + 1} :`
                                                : `Descriptif & Constat Visuel N°${pIdx + 1} :`}
                                            </div>
                                            <p className="text-[10px] font-semibold text-slate-800 leading-[1.4] whitespace-pre-line break-words">
                                              {photo.caption}
                                            </p>
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {sec.table && (
                                <div className="pt-1 w-full overflow-hidden break-inside-avoid">
                                  <table className="w-full table-fixed border-collapse text-[8.5px] sm:text-[9px] leading-[1.45]">
                                    {sec.table.columnWidths &&
                                      sec.table.columnWidths.length === sec.table.headers.length && (
                                        <colgroup>
                                          {sec.table.columnWidths.map((w, colIdx) => (
                                            <col key={colIdx} style={{ width: `${w}%` }} />
                                          ))}
                                        </colgroup>
                                      )}
                                    <thead>
                                      <tr className="bg-[#c2410c] text-white">
                                        {sec.table.headers.map((h, hIdx) => {
                                          const isRightAligned =
                                            sec.table?.rightAlignCols?.includes(hIdx);
                                          return (
                                            <th
                                              key={hIdx}
                                              className={`px-1.5 py-1.5 font-black uppercase border border-[#c2410c] break-words [overflow-wrap:anywhere] leading-[1.2] align-middle ${
                                                isRightAligned ? 'text-right' : 'text-left'
                                              }`}
                                            >
                                              {h}
                                            </th>
                                          );
                                        })}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {sec.table.rows.map((row, rIdx) => {
                                        const isTotalRow =
                                          row[0]?.startsWith('TOTAL') ||
                                          row[0]?.startsWith('SCORE GLOBAL') ||
                                          row[0]?.startsWith('NOTE GLOBALE');
                                        return (
                                          <tr
                                            key={rIdx}
                                            className={
                                              isTotalRow
                                                ? 'bg-orange-50/90 font-extrabold'
                                                : rIdx % 2 === 0
                                                ? 'bg-white'
                                                : 'bg-slate-50'
                                            }
                                          >
                                            {row.map((cell, cIdx) => {
                                              const isRightCol =
                                                sec.table?.rightAlignCols?.includes(cIdx);
                                              const isMonetaryCell = /\b(FCFA|EUR|USD)\b/.test(
                                                cell
                                              );
                                              return (
                                                <td
                                                  key={cIdx}
                                                  className={`px-1.5 py-1.5 border border-slate-200 whitespace-pre-line break-words [overflow-wrap:anywhere] align-top ${
                                                    isRightCol || isMonetaryCell
                                                      ? 'text-right font-extrabold tabular-nums text-[#c2410c]'
                                                      : cIdx === 0
                                                      ? 'font-bold text-slate-900'
                                                      : 'text-slate-800'
                                                  }`}
                                                >
                                                  {cell}
                                                </td>
                                              );
                                            })}
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          ))}

                          {page.isSignaturePage && (
                            <div className="mt-6 pt-4 border-t-2 border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 text-xs break-inside-avoid">
                              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2 min-w-0">
                                <div className="font-black uppercase text-[#c2410c] text-[10px] break-words">
                                  POUR L’ORGANISATION ({userProfile.institution || 'AUTORITÉ PILOTE'})
                                </div>
                                <div className="text-[11px] font-bold text-slate-800 break-words">
                                  {userProfile.fullName} — {userProfile.role}
                                </div>
                                {page.orgStampDataUrl && (
                                  <div className="py-1.5">
                                    <img
                                      src={page.orgStampDataUrl}
                                      alt="Signature et Cachet Organisation"
                                      className="max-h-16 w-auto object-contain rounded bg-white p-1 border border-slate-200"
                                    />
                                  </div>
                                )}
                                <div className="text-[10px] text-slate-500 pt-2">
                                  Signature & Cachet Officiel : _______________________
                                </div>
                              </div>

                              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2 min-w-0">
                                <div className="font-black uppercase text-[#c2410c] text-[10px] break-words">
                                  POUR LA PARTIE PRENANTE ({currentFields.recipientOrg || 'PARTENAIRE'})
                                </div>
                                <div className="text-[11px] font-bold text-slate-800 break-words">
                                  {currentFields.recipientRepresentative || 'Représentant Habilité'}
                                </div>
                                {page.partnerStampDataUrl && (
                                  <div className="py-1.5">
                                    <img
                                      src={page.partnerStampDataUrl}
                                      alt="Signature et Cachet Partenaire"
                                      className="max-h-16 w-auto object-contain rounded bg-white p-1 border border-slate-200"
                                    />
                                  </div>
                                )}
                                <div className="text-[10px] text-slate-500 pt-2">
                                  Signature (« Lu et approuvé ») : _______________________
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Page Footer */}
                      <div className="mt-6 pt-3 border-t border-slate-200 grid grid-cols-[1fr_auto] items-center gap-2 text-[9px] font-bold text-slate-500 w-full min-w-0 overflow-hidden">
                        <div className="min-w-0 break-words [overflow-wrap:anywhere] leading-snug text-left">
                          <span className="font-extrabold text-slate-700">faab gar</span> •{' '}
                          {currentConfig.officialTitle || currentConfig.selectLabel} (
                          <span className="text-[#c2410c] font-extrabold">
                            {currentFields.referenceCode}
                          </span>
                          ) • {userProfile.institution || 'Usage Institutionnel & Universel'}
                        </div>
                        <span className="px-2 py-0.5 rounded bg-orange-50 border border-orange-200 text-[#c2410c] font-black text-[9px] shrink-0 whitespace-nowrap">
                          Page {pageIdx + 1} / {pages.length}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        )}
      </div>

      {/* Modale Fiche Membre & Données Spécifiques (CV Exécutif, CV Détaillé, Carte de Visite vCard & Badge CODE-128) — Strictement réservée aux acteurs Interne + Utilisateur Principal */}
      {isActorProfileModalOpen && (
        <InternalActorProfileModal
          isOpen={isActorProfileModalOpen}
          onClose={() => setIsActorProfileModalOpen(false)}
          initialActorName={selectedActorForModal}
          allActorsList={raciContext.internalOnlyActors}
          raciContextInfo={{
            rList: raciContext.rList,
            aList: raciContext.aList,
            cList: raciContext.cList,
            iList: raciContext.iList
          }}
          dossier={effectiveDossier}
          userProfile={userProfile}
          language={language}
          currency={currency}
          executingOrgName={
            currentFields.executingOrgName ||
            effectiveDossier.institution ||
            userProfile.institution ||
            'Organisation Pilote du Programme'
          }
          executingDepartment={
            currentFields.executingDepartment ||
            'Direction du Pilotage Stratégique & PMO'
          }
          companyLogoDefaultUrl={currentFields.rightLogoDataUrl || currentFields.leftLogoDataUrl}
          onApplyToDoc={handleApplyProfileToDoc}
          onSelectDocType={setSelectedDocType}
        />
      )}

      {/* Modale Scanner QR Code & Code-Barres (Contrôle d'Accès Interne & vCard) */}
      {isScannerModalOpen && (
        <QrBarcodeScannerModal
          isOpen={isScannerModalOpen}
          onClose={() => setIsScannerModalOpen(false)}
          dossier={effectiveDossier}
          userProfile={userProfile}
          language={language}
        />
      )}
    </div>
  );
};

