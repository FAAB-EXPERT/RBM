import React, { useMemo, useRef, useState } from 'react';
import {
  CheckSquare,
  ChevronDown,
  ChevronUp,
  Download,
  Eye,
  EyeOff,
  FileSpreadsheet,
  Image as ImageIcon,
  Layers,
  LayoutGrid,
  Plus,
  Presentation,
  RefreshCw,
  Square,
  Stamp,
  Table as TableIcon,
  Trash2,
  Upload,
  ZoomIn,
  ZoomOut
} from 'lucide-react';
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
} from '../types';
import {
  DOC_TO_MATRICES_MAP,
  MASTER_MATRICES_DEFINITIONS,
  MasterMatrixId,
  MatrixRowData,
  resolveActiveMatricesData
} from '../docMatrices';
import {
  DOC_TEMPLATE_CONFIGS,
  DocImageFieldDescriptor,
  DocImageFieldKey,
  DocTemplateConfig,
  HIDE_SIGNATURES_KEY,
  parseExcludedFields,
  parseFieldPhotos
} from '../docTemplates';
import {
  SlideChartConfig,
  StructuredSlidePage,
  buildInstitutionalSlideDeck,
  parseSlidesOverrides,
  serializeSlidesOverrides
} from '../slidePresentations';

export interface SlideDeckWorkspaceProps {
  selectedDocType: InstitutionalDocType;
  currentConfig?: DocTemplateConfig;
  currentFields: CustomDocFields;
  effectiveDossier?: Dossier;
  selectedDossier?: Dossier;
  userProfile: UserProfile;
  currency: CurrencyCode;
  language: LanguageCode;
  slides?: StructuredSlidePage[];
  includeSignatures?: boolean;
  onToggleSignatureBlock?: () => void;
  onUpdateDocField: (
    docType: InstitutionalDocType,
    fieldKey: keyof CustomDocFields,
    value: string
  ) => void;
  onResetDocDefaults?: (docType: InstitutionalDocType) => void;
  activeImageFieldDescriptors?: DocImageFieldDescriptor[];
  onImageFileSelect?: (
    imageKey: DocImageFieldKey,
    e: React.ChangeEvent<HTMLInputElement>
  ) => void | Promise<void>;
  onRequestImageDelete?: (info: { key: DocImageFieldKey; label: string }) => void;
  fieldPhotosList?: FieldPhotoItem[];
  onUploadNewFieldPhotos?: (
    e: React.ChangeEvent<HTMLInputElement>
  ) => void | Promise<void>;
  onAddFieldPhotoSlot?: () => void;
  onReplaceFieldPhotoImage?: (
    photoId: string,
    e: React.ChangeEvent<HTMLInputElement>
  ) => void | Promise<void>;
  onUpdateFieldPhotoItem?: (
    photoId: string,
    key: 'caption' | 'locationDate',
    val: string
  ) => void;
  onRemoveFieldPhotoItem?: (photoId: string) => void;
  optimizeImageFileToDataUrl?: (file: File) => Promise<string>;
  zoomPct?: number;
  setZoomPct?: React.Dispatch<React.SetStateAction<number>>;
  onSyncFromTabs?: () => void;
  onExportPDF?: () => void;
}

function parseStoredMatrices(
  jsonStr?: string
): Partial<Record<MasterMatrixId, MatrixRowData[]>> {
  if (!jsonStr || !jsonStr.trim()) return {};
  try {
    const parsed = JSON.parse(jsonStr);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function serializeMatrices(
  data: Partial<Record<MasterMatrixId, MatrixRowData[]>>
): string {
  return JSON.stringify(data);
}

function serializeExcludedFields(keys: string[]): string {
  return JSON.stringify(Array.from(new Set(keys)));
}

function serializeFieldPhotos(photos: FieldPhotoItem[]): string {
  return JSON.stringify(photos);
}

export const SlideDeckWorkspace: React.FC<SlideDeckWorkspaceProps> = ({
  selectedDocType,
  currentConfig,
  currentFields,
  effectiveDossier,
  selectedDossier: propSelectedDossier,
  userProfile,
  currency,
  language,
  zoomPct: propZoomPct,
  setZoomPct: propSetZoomPct,
  onUpdateDocField,
  onResetDocDefaults,
  onSyncFromTabs,
  onExportPDF
}) => {
  const selectedDossier = (effectiveDossier || propSelectedDossier)!;
  const [localZoomPct, setLocalZoomPct] = useState<number>(100);
  const zoomPct = propZoomPct !== undefined ? propZoomPct : localZoomPct;
  const setZoomPct = propSetZoomPct || setLocalZoomPct;

  const [activeMatrixTab, setActiveMatrixTab] = useState<MasterMatrixId>(() => {
    const connected = DOC_TO_MATRICES_MAP[selectedDocType] || ['M1'];
    return connected[0] || 'M1';
  });
  const [matricesAccordionOpen, setMatricesAccordionOpen] = useState<boolean>(false);
  const [brandingAccordionOpen, setBrandingAccordionOpen] = useState<boolean>(false);
  const [photosAccordionOpen, setPhotosAccordionOpen] = useState<boolean>(false);
  const [focusedSlideNumber, setFocusedSlideNumber] = useState<number>(1);

  const slideRefs = useRef<Record<number, HTMLDivElement | null>>({});

  const activeTemplateConfig = useMemo(
    () => currentConfig || DOC_TEMPLATE_CONFIGS[selectedDocType],
    [currentConfig, selectedDocType]
  );

  const connectedMatrixIds = useMemo(
    () => DOC_TO_MATRICES_MAP[selectedDocType] || ['M1', 'M2', 'M3', 'M5', 'M9'],
    [selectedDocType]
  );

  const resolvedMatrices = useMemo(
    () =>
      resolveActiveMatricesData(
        selectedDossier,
        currentFields,
        userProfile,
        currency,
        language,
        currentFields.matricesJson
      ),
    [selectedDossier, currentFields, userProfile, currency, language]
  );

  const slideOverrides = useMemo(
    () => parseSlidesOverrides(currentFields.slidesConfigJson),
    [currentFields.slidesConfigJson]
  );

  const excludedFields = useMemo(
    () => parseExcludedFields(currentFields.excludedFieldsJson),
    [currentFields.excludedFieldsJson]
  );

  const hideSignatures = excludedFields.includes(HIDE_SIGNATURES_KEY);

  const fieldPhotos = useMemo(
    () => parseFieldPhotos(currentFields.fieldPhotosJson),
    [currentFields.fieldPhotosJson]
  );

  const allSlides = useMemo(
    () =>
      buildInstitutionalSlideDeck(
        selectedDocType,
        currentFields,
        selectedDossier,
        userProfile,
        currency,
        language
      ),
    [selectedDocType, currentFields, selectedDossier, userProfile, currency, language]
  );

  const activeSlides = useMemo(
    () => allSlides.filter(s => !s.excluded),
    [allSlides]
  );

  const updateSlideOverride = (
    slideNumber: number,
    patch: Partial<SlideCustomOverride>
  ) => {
    const next: Record<number, SlideCustomOverride> = {
      ...slideOverrides,
      [slideNumber]: {
        ...(slideOverrides[slideNumber] || {}),
        slideNumber,
        ...patch
      }
    };
    onUpdateDocField(
      selectedDocType,
      'slidesConfigJson',
      serializeSlidesOverrides(next)
    );
  };

  const resetAllSlideOverrides = () => {
    onUpdateDocField(selectedDocType, 'slidesConfigJson', '');
    if (onResetDocDefaults) onResetDocDefaults(selectedDocType);
    if (onSyncFromTabs) onSyncFromTabs();
  };

  const toggleAllSlides = (excludeAll: boolean) => {
    const next: Record<number, SlideCustomOverride> = { ...slideOverrides };
    allSlides.forEach(s => {
      next[s.slideNumber] = {
        ...(next[s.slideNumber] || {}),
        excluded: excludeAll ? s.slideNumber !== 1 : false
      };
    });
    onUpdateDocField(
      selectedDocType,
      'slidesConfigJson',
      serializeSlidesOverrides(next)
    );
  };

  const toggleHideSignatures = () => {
    const next = hideSignatures
      ? excludedFields.filter(k => k !== HIDE_SIGNATURES_KEY)
      : [...excludedFields, HIDE_SIGNATURES_KEY];
    onUpdateDocField(
      selectedDocType,
      'excludedFieldsJson',
      serializeExcludedFields(next)
    );
  };

  const handleImageFileUpload = (
    file: File | undefined,
    onLoaded: (dataUrl: string) => void
  ) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        onLoaded(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleMatrixCellChange = (
    matrixId: MasterMatrixId,
    rowIdx: number,
    colKey: string,
    val: string
  ) => {
    const stored = parseStoredMatrices(currentFields.matricesJson) || {};
    const currentRows: MatrixRowData[] = [
      ...(stored[matrixId] || resolvedMatrices[matrixId] || [])
    ];
    if (!currentRows[rowIdx]) return;
    currentRows[rowIdx] = {
      ...currentRows[rowIdx],
      [colKey]: val
    };
    const nextStored = {
      ...resolvedMatrices,
      ...stored,
      [matrixId]: currentRows
    };
    onUpdateDocField(
      selectedDocType,
      'matricesJson',
      serializeMatrices(nextStored)
    );
  };

  const handleAddMatrixRow = (matrixId: MasterMatrixId) => {
    const def = MASTER_MATRICES_DEFINITIONS.find(d => d.id === matrixId);
    if (!def) return;
    const stored = parseStoredMatrices(currentFields.matricesJson) || {};
    const currentRows: MatrixRowData[] = [
      ...(stored[matrixId] || resolvedMatrices[matrixId] || [])
    ];
    const newRow: MatrixRowData = {};
    def.columns.forEach((col, i) => {
      newRow[col.key] = i === 0 ? `${matrixId}-${currentRows.length + 1}` : '—';
    });
    const nextStored = {
      ...resolvedMatrices,
      ...stored,
      [matrixId]: [...currentRows, newRow]
    };
    onUpdateDocField(
      selectedDocType,
      'matricesJson',
      serializeMatrices(nextStored)
    );
  };

  const handleRemoveMatrixRow = (matrixId: MasterMatrixId, rowIdx: number) => {
    const stored = parseStoredMatrices(currentFields.matricesJson) || {};
    const currentRows: MatrixRowData[] = [
      ...(stored[matrixId] || resolvedMatrices[matrixId] || [])
    ];
    if (currentRows.length <= 1) return;
    const nextRows = currentRows.filter((_, idx) => idx !== rowIdx);
    const nextStored = {
      ...resolvedMatrices,
      ...stored,
      [matrixId]: nextRows
    };
    onUpdateDocField(
      selectedDocType,
      'matricesJson',
      serializeMatrices(nextStored)
    );
  };

  const handleAddFieldPhoto = (file: File | undefined) => {
    if (!file) return;
    handleImageFileUpload(file, dataUrl => {
      const newPhoto: FieldPhotoItem = {
        id: `photo-${Date.now()}`,
        dataUrl,
        caption: `Illustration terrain #${fieldPhotos.length + 1} (${selectedDossier.name})`
      };
      onUpdateDocField(
        selectedDocType,
        'fieldPhotosJson',
        serializeFieldPhotos([...fieldPhotos, newPhoto])
      );
    });
  };

  const handleUpdatePhotoCaption = (id: string, caption: string) => {
    const next = fieldPhotos.map(p => (p.id === id ? { ...p, caption } : p));
    onUpdateDocField(
      selectedDocType,
      'fieldPhotosJson',
      serializeFieldPhotos(next)
    );
  };

  const handleDeleteFieldPhoto = (id: string) => {
    const next = fieldPhotos.filter(p => p.id !== id);
    onUpdateDocField(
      selectedDocType,
      'fieldPhotosJson',
      serializeFieldPhotos(next)
    );
  };

  const scrollToSlide = (slideNum: number) => {
    setFocusedSlideNumber(slideNum);
    const node = slideRefs.current[slideNum];
    if (node) {
      node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  // ============================================================================
  // RENDU D'UNE CARTE GRAPHIQUE VECTORIEL (CAMEMBERT/DONUT SVG OU BARRES CSS/SVG)
  // ============================================================================
  const renderSlideChartCard = (chart: SlideChartConfig) => {
    if (!chart || !chart.items || chart.items.length === 0) return null;

    if (chart.type === 'donut') {
      const totalVal = chart.items.reduce((acc, it) => acc + Math.max(0, it.value), 0) || 1;
      const radius = 50;
      const circumference = 2 * Math.PI * radius;
      let cumulativeFraction = 0;

      return (
        <div className="rounded-xl border border-orange-200 bg-white p-3.5 shadow-xs flex flex-col justify-between gap-3">
          <div className="border-b border-slate-100 pb-2">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-[11px] font-black uppercase tracking-wide text-[#c2410c] whitespace-normal break-words [overflow-wrap:anywhere]">
                {chart.title}
              </h4>
              <span className="px-2 py-0.5 rounded-md bg-orange-50 border border-orange-200 text-[9px] font-black text-[#ea580c] shrink-0">
                GRAPHIQUE DONUT SVG
              </span>
            </div>
            <p className="text-[10px] font-medium text-slate-500 mt-0.5 whitespace-normal break-words [overflow-wrap:anywhere]">
              {chart.subtitle}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-4 my-auto">
            {/* Donut SVG */}
            <div className="relative w-[132px] h-[132px] shrink-0 flex items-center justify-center">
              <svg viewBox="0 0 132 132" className="w-full h-full -rotate-90">
                <circle
                  cx="66"
                  cy="66"
                  r={radius}
                  fill="transparent"
                  stroke="#f1f5f9"
                  strokeWidth="18"
                />
                {chart.items.map((item, idx) => {
                  const fraction = Math.max(0, item.value) / totalVal;
                  const dashLength = fraction * circumference;
                  const dashOffset = -cumulativeFraction * circumference;
                  cumulativeFraction += fraction;
                  if (fraction <= 0) return null;
                  return (
                    <circle
                      key={idx}
                      cx="66"
                      cy="66"
                      r={radius}
                      fill="transparent"
                      stroke={item.colorHex}
                      strokeWidth="18"
                      strokeDasharray={`${dashLength} ${circumference}`}
                      strokeDashoffset={dashOffset}
                    />
                  );
                })}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-2">
                {chart.centerLabel && (
                  <span className="text-[8px] font-bold uppercase tracking-wider text-slate-400 leading-tight">
                    {chart.centerLabel}
                  </span>
                )}
                {chart.centerValue && (
                  <span className="text-[14px] font-black text-[#c2410c] leading-tight mt-0.5">
                    {chart.centerValue}
                  </span>
                )}
              </div>
            </div>

            {/* Légende détaillée à droite sans chevauchement */}
            <div className="flex-1 w-full space-y-2">
              {chart.items.map((item, idx) => (
                <div
                  key={idx}
                  className="rounded-lg border border-slate-100 bg-slate-50/80 px-2.5 py-1.5 flex items-start justify-between gap-2"
                >
                  <div className="flex items-start gap-2 min-w-0">
                    <span
                      className="w-3 h-3 rounded-xs shrink-0 mt-0.5 shadow-2xs"
                      style={{ backgroundColor: item.colorHex }}
                    />
                    <div className="min-w-0">
                      <p className="text-[10px] font-extrabold text-slate-800 leading-snug whitespace-normal break-words [overflow-wrap:anywhere]">
                        {item.label}
                      </p>
                      {item.sublabel && (
                        <p className="text-[9px] text-slate-500 leading-tight whitespace-normal break-words [overflow-wrap:anywhere]">
                          {item.sublabel}
                        </p>
                      )}
                    </div>
                  </div>
                  <span className="text-[10px] font-black text-[#c2410c] shrink-0 text-right">
                    {item.displayValue}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }

    // Graphique en Barres / Histogramme Horizontal haute précision
    return (
      <div className="rounded-xl border border-orange-200 bg-white p-3.5 shadow-xs flex flex-col justify-between gap-3">
        <div className="border-b border-slate-100 pb-2">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-[11px] font-black uppercase tracking-wide text-[#c2410c] whitespace-normal break-words [overflow-wrap:anywhere]">
              {chart.title}
            </h4>
            <span className="px-2 py-0.5 rounded-md bg-orange-50 border border-orange-200 text-[9px] font-black text-[#ea580c] shrink-0">
              HISTOGRAMME / BARRES
            </span>
          </div>
          <p className="text-[10px] font-medium text-slate-500 mt-0.5 whitespace-normal break-words [overflow-wrap:anywhere]">
            {chart.subtitle}
          </p>
        </div>

        <div className="space-y-2.5 my-auto">
          {chart.items.map((item, idx) => {
            const safePct = Math.min(100, Math.max(4, item.pct || 0));
            return (
              <div key={idx} className="space-y-1">
                <div className="flex items-baseline justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-[10px] font-extrabold text-slate-800 whitespace-normal break-words [overflow-wrap:anywhere]">
                      {item.label}
                    </span>
                    {item.sublabel && (
                      <span className="ml-1.5 text-[9px] font-medium text-slate-500 whitespace-normal break-words [overflow-wrap:anywhere]">
                        ({item.sublabel})
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] font-black text-[#c2410c] shrink-0">
                    {item.displayValue}
                  </span>
                </div>
                <div className="w-full h-3 rounded-full bg-slate-100 overflow-hidden border border-slate-200/70 p-0.5">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${safePct}%`,
                      backgroundColor: item.colorHex
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // ============================================================================
  // RENDU D'UNE SLIDE 16:9 PAYSAGE DANS L'APERÇU DE DROITE (ZÉRO TRONCATURE)
  // ============================================================================
  const renderSlideCard16x9 = (slide: StructuredSlidePage) => {
    const isFocused = focusedSlideNumber === slide.slideNumber;
    const toneColors: Record<
      NonNullable<StructuredSlidePage['kpiCards'][number]['accent']>,
      string
    > = {
      primary: 'border-[#c2410c] bg-[#fff7ed] text-[#c2410c]',
      sky: 'border-[#ea580c] bg-orange-50/90 text-[#c2410c]',
      emerald: 'border-emerald-600 bg-emerald-50/90 text-emerald-900',
      amber: 'border-amber-500 bg-amber-50/90 text-amber-900',
      rose: 'border-rose-600 bg-rose-50/90 text-rose-900'
    };

    // --------------------------------------------------------------------------
    // SLIDE 1 : COUVERTURE OFFICIELLE 16:9 (CHARTE INSTITUTIONNELLE SYMÉTRIQUE)
    // --------------------------------------------------------------------------
    if (slide.isCoverSlide && slide.coverData) {
      const c = slide.coverData;
      const leftOrg = c.leftOrgName || c.leftLogo || 'Partenaires Techniques & Financiers';
      const leftDept = c.leftDeptName || c.leftDepartment || 'Direction des Opérations';
      const rightOrg = c.rightOrgName || c.rightLogo || selectedDossier.institution || 'Structure Pilote du Programme';
      const rightDept = c.rightDeptName || c.rightDepartment || 'Unité de Gestion du Projet (UGP)';
      const badgeLabel = c.meetingBadge || 'PRÉSENTATION OFFICIELLE 16:9';
      const refAndDateLabel = c.referenceAndDate || (c.referenceCode ? `Réf. ${c.referenceCode}` : '');

      return (
        <div
          key={slide.slideNumber}
          ref={el => {
            slideRefs.current[slide.slideNumber] = el;
          }}
          onClick={() => setFocusedSlideNumber(slide.slideNumber)}
          className={`w-full rounded-xl bg-white shadow-xl border-2 transition-all flex flex-col justify-between select-none cursor-pointer overflow-hidden ${
            isFocused
              ? 'border-[#ea580c] ring-4 ring-orange-400/30'
              : 'border-slate-300 hover:border-orange-400'
          }`}
          style={{ minHeight: '470px', height: 'auto' }}
        >
          {/* Bandeau supérieur marine sans aucun texte "undefined" */}
          <div className="bg-[#c2410c] text-white px-5 py-2.5 border-b-4 border-[#fdba74] flex flex-wrap items-center justify-between gap-2 rounded-t-[10px]">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <span className="px-2.5 py-0.5 rounded-md bg-[#fdba74] text-[#c2410c] text-[10px] font-black uppercase tracking-wider shrink-0">
                SLIDE {slide.displaySlideNumber} / {slide.totalDisplaySlides}
              </span>
              <span className="text-[11px] font-extrabold text-[#ffedd5] uppercase tracking-wider whitespace-normal break-words [overflow-wrap:anywhere]">
                {badgeLabel}
              </span>
            </div>
            <span className="text-[10px] font-bold text-[#fdba74] whitespace-normal break-words [overflow-wrap:anywhere] text-right">
              {refAndDateLabel}
            </span>
          </div>

          {/* Corps de la Slide 1 avec espacement vertical fluide (gap: 14px) */}
          <div className="flex-1 flex flex-col justify-between gap-[14px] px-6 py-4 bg-gradient-to-br from-white via-orange-50/25 to-slate-50">
            {/* 1. En-tête Institutionnel Symétrique : Logos agrandis (65-80px) + Zone de texte réduite d'un tiers (67%) */}
            <div className="grid grid-cols-2 gap-6 items-start pb-3 border-b border-orange-200/80">
              {/* Bloc Gauche : Bailleur / Commanditaire */}
              <div className="flex flex-col items-center text-center">
                <div className="h-[74px] flex items-center justify-center mb-2">
                  {c.leftLogoDataUrl ? (
                    <img
                      src={c.leftLogoDataUrl}
                      alt="Logo Bailleur / Commanditaire"
                      style={{ height: '72px', width: 'auto', objectFit: 'contain' }}
                      className="rounded-md bg-white p-1 border border-slate-200 shadow-2xs"
                    />
                  ) : (
                    <div
                      style={{ height: '68px', minWidth: '88px' }}
                      className="px-3 rounded-lg bg-[#c2410c] text-[#fdba74] flex flex-col items-center justify-center font-black text-[11px] border border-[#ea580c] shadow-2xs"
                    >
                      <span>BAILLEUR / PTF</span>
                      <span className="text-[9px] font-semibold text-white/80 mt-0.5">COMMANDITAIRE</span>
                    </div>
                  )}
                </div>
                <div className="w-[67%] max-w-[67%] mx-auto flex flex-col items-center">
                  <p className="text-[11px] font-bold text-[#c2410c] uppercase leading-snug whitespace-normal break-words [overflow-wrap:anywhere]">
                    {leftOrg}
                  </p>
                  <p className="text-[10px] font-normal text-slate-600 leading-snug mt-0.5 whitespace-normal break-words [overflow-wrap:anywhere]">
                    {leftDept}
                  </p>
                </div>
              </div>

              {/* Bloc Droit : Agence d'Exécution / Structure Pilote */}
              <div className="flex flex-col items-center text-center">
                <div className="h-[74px] flex items-center justify-center mb-2">
                  {c.rightLogoDataUrl ? (
                    <img
                      src={c.rightLogoDataUrl}
                      alt="Logo Agence d'Exécution"
                      style={{ height: '72px', width: 'auto', objectFit: 'contain' }}
                      className="rounded-md bg-white p-1 border border-slate-200 shadow-2xs"
                    />
                  ) : (
                    <div
                      style={{ height: '68px', minWidth: '88px' }}
                      className="px-3 rounded-lg bg-[#ea580c] text-white flex flex-col items-center justify-center font-black text-[11px] border border-[#c2410c] shadow-2xs"
                    >
                      <span>UGP / PILOTE</span>
                      <span className="text-[9px] font-semibold text-orange-100 mt-0.5">EXÉCUTION</span>
                    </div>
                  )}
                </div>
                <div className="w-[67%] max-w-[67%] mx-auto flex flex-col items-center">
                  <p className="text-[11px] font-bold text-[#c2410c] uppercase leading-snug whitespace-normal break-words [overflow-wrap:anywhere]">
                    {rightOrg}
                  </p>
                  <p className="text-[10px] font-normal text-slate-600 leading-snug mt-0.5 whitespace-normal break-words [overflow-wrap:anywhere]">
                    {rightDept}
                  </p>
                </div>
              </div>
            </div>

            {/* 2. Bannière / Image de l'intervention bien centrée sous l'en-tête institutionnel */}
            {c.bannerImageDataUrl && (
              <div className="w-full flex justify-center">
                <div className="w-[82%] max-w-[680px] h-28 rounded-xl overflow-hidden border-2 border-orange-200 shadow-sm bg-slate-100">
                  <img
                    src={c.bannerImageDataUrl}
                    alt="Bannière de l'intervention"
                    className="w-full h-full object-cover object-center"
                  />
                </div>
              </div>
            )}

            {/* 3. Cartouche Central du Titre Principal (Zéro débordement horizontal ni vertical) */}
            <div className="rounded-xl bg-[#c2410c] text-white p-5 border-l-8 border-[#fdba74] shadow-md text-center overflow-hidden">
              <div className="inline-block max-w-full px-3 py-0.5 rounded-full bg-[#ea580c] text-[#ffedd5] text-[10px] font-black uppercase tracking-widest mb-2 whitespace-normal break-words [overflow-wrap:anywhere]">
                {slide.matrixBadge}
              </div>
              <h2 className="text-lg sm:text-xl font-black tracking-tight leading-snug uppercase text-white whitespace-normal break-words [overflow-wrap:anywhere]">
                {slide.title}
              </h2>
              <p className="text-xs font-semibold text-[#fdba74] mt-1.5 leading-relaxed whitespace-normal break-words [overflow-wrap:anywhere]">
                {slide.subtitle}
              </p>
              <div className="mt-3 pt-2.5 border-t border-orange-400/30 flex flex-col items-center gap-0.5 text-[10px] leading-snug">
                <p className="font-bold text-[#ffedd5] whitespace-normal break-words [overflow-wrap:anywhere] max-w-full">
                  {c.presenterLine}
                </p>
                <p className="font-semibold text-[#fdba74] whitespace-normal break-words [overflow-wrap:anywhere] max-w-full">
                  {c.locationAndDate || c.locationLine}
                </p>
              </div>
            </div>

            {/* 4. Bande des Cartes KPI (Zéro troncature) */}
            {slide.kpiCards.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {slide.kpiCards.slice(0, 4).map((kpi, idx) => {
                  const toneKey = kpi.accent || kpi.tone || 'primary';
                  return (
                    <div
                      key={idx}
                      className={`rounded-lg border-l-4 p-2.5 shadow-2xs ${toneColors[toneKey]}`}
                    >
                      <p className="text-[9px] font-extrabold uppercase tracking-wider opacity-80 whitespace-normal break-words [overflow-wrap:anywhere]">
                        {kpi.label}
                      </p>
                      <p className="text-sm font-black mt-0.5 leading-snug whitespace-normal break-words [overflow-wrap:anywhere]">
                        {kpi.value}
                      </p>
                      <p className="text-[9px] font-medium opacity-85 mt-0.5 leading-snug whitespace-normal break-words [overflow-wrap:anywhere]">
                        {kpi.subtext}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 5. Pied de page de la Slide 1 */}
          <div className="bg-slate-900 text-white px-5 py-2 flex flex-wrap items-center justify-between gap-2 text-[10px] border-t border-slate-700 rounded-b-[10px]">
            <span className="font-bold text-[#fdba74] whitespace-normal break-words [overflow-wrap:anywhere]">
              {c.presenterLine}
            </span>
            <span className="text-slate-300 font-semibold whitespace-normal break-words [overflow-wrap:anywhere]">
              {c.locationAndDate || c.locationLine}
            </span>
          </div>
        </div>
      );
    }

    // --------------------------------------------------------------------------
    // SLIDES INTERNES (2 À N) : CONTENEUR FLEX FLUIDE (GAP: 14PX, ZÉRO TRONCATURE)
    // --------------------------------------------------------------------------
    const hasChart = Boolean(slide.chart);
    const hasTable = Boolean(slide.table && slide.table.rows.length > 0);
    const hasThreeCards = Boolean(slide.threeCards && slide.threeCards.length > 0);
    const hasVisualMedia = Boolean(
      slide.imageDataUrl || (slide.fieldPhotos && slide.fieldPhotos.length > 0)
    );

    return (
      <div
        key={slide.slideNumber}
        ref={el => {
          slideRefs.current[slide.slideNumber] = el;
        }}
        onClick={() => setFocusedSlideNumber(slide.slideNumber)}
        className={`w-full rounded-xl bg-white shadow-xl border-2 transition-all flex flex-col justify-between select-none cursor-pointer overflow-hidden ${
          isFocused
            ? 'border-[#ea580c] ring-4 ring-orange-400/30'
            : 'border-slate-300 hover:border-orange-400'
        }`}
        style={{ minHeight: '450px', height: 'auto' }}
      >
        {/* (1) En-tête de la Slide (Sans aucune classe truncate / line-clamp-1) */}
        <div className="bg-[#c2410c] text-white px-5 py-3 border-b-4 border-[#fdba74] flex items-start justify-between gap-4 rounded-t-[10px]">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="px-2 py-0.5 rounded-sm bg-[#fdba74] text-[#c2410c] text-[9px] font-black uppercase tracking-wider shrink-0">
                SLIDE {slide.displaySlideNumber} / {slide.totalDisplaySlides}
              </span>
              <span className="text-[9px] font-bold text-[#fdba74] uppercase tracking-wider whitespace-normal break-words [overflow-wrap:anywhere]">
                {slide.matrixBadge}
              </span>
            </div>
            <h3 className="text-sm sm:text-[15px] font-black uppercase tracking-tight text-white leading-snug whitespace-normal break-words [overflow-wrap:anywhere]">
              {slide.title}
            </h3>
            <p className="text-[11px] text-[#ffedd5] font-medium leading-snug mt-1 whitespace-normal break-words [overflow-wrap:anywhere]">
              {slide.subtitle}
            </p>
          </div>
          <div className="text-right shrink-0 hidden sm:block max-w-[190px]">
            <span className="text-[9px] font-extrabold uppercase tracking-wider text-[#fdba74] block leading-tight whitespace-normal break-words [overflow-wrap:anywhere]">
              {selectedDossier.name}
            </span>
            <span className="text-[8px] text-slate-300 block mt-0.5">
              Horizon {selectedDossier.horizonPlan}
            </span>
          </div>
        </div>

        {/* Conteneur Flex Vertical Fluide avec gap: 14px minimum */}
        <div className="flex-1 flex flex-col justify-between gap-[14px] p-4 bg-slate-50/50">
          {/* (2) Bande des Cartes KPI (Zéro troncature) */}
          {slide.kpiCards.length > 0 && (
            <div
              className={`grid gap-3 ${
                slide.kpiCards.length >= 4
                  ? 'grid-cols-2 sm:grid-cols-4'
                  : 'grid-cols-1 sm:grid-cols-3'
              }`}
            >
              {slide.kpiCards.slice(0, 4).map((kpi, idx) => {
                const toneKey = kpi.accent || kpi.tone || 'primary';
                return (
                  <div
                    key={idx}
                    className={`rounded-lg border-l-4 px-3 py-2 shadow-2xs ${toneColors[toneKey]}`}
                  >
                    <p className="text-[9px] font-extrabold uppercase tracking-wider opacity-80 whitespace-normal break-words [overflow-wrap:anywhere]">
                      {kpi.label}
                    </p>
                    <p className="text-xs sm:text-sm font-black leading-snug mt-0.5 whitespace-normal break-words [overflow-wrap:anywhere]">
                      {kpi.value}
                    </p>
                    <p className="text-[9px] font-medium opacity-80 leading-snug mt-0.5 whitespace-normal break-words [overflow-wrap:anywhere]">
                      {kpi.subtext}
                    </p>
                  </div>
                );
              })}
            </div>
          )}

          {/* (3) Corps central de la Slide (Grille 3 cartes / Tableau / 2 Colonnes + Graphiques Vectoriels) */}
          <div className="flex-1 flex flex-col gap-[14px]">
            {/* Cas A : La slide possède un Graphique Vectoriel (Donut SVG ou Histogramme Barres) */}
            {hasChart && slide.chart && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-[14px] items-stretch">
                {/* Carte Graphique dédiée (7 colonnes) */}
                <div className="lg:col-span-7 flex flex-col">
                  {renderSlideChartCard(slide.chart)}
                </div>

                {/* Colonne complémentaire (5 colonnes) : Cartes ou Points clés */}
                <div className="lg:col-span-5 flex flex-col justify-between gap-2.5">
                  {hasThreeCards ? (
                    slide.threeCards.slice(0, 3).map((card, cIdx) => (
                      <div
                        key={cIdx}
                        className="rounded-xl border border-slate-200 bg-white p-3 shadow-2xs flex flex-col gap-1.5"
                      >
                        <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-1">
                          <h4 className="text-[11px] font-black text-[#c2410c] uppercase leading-snug whitespace-normal break-words [overflow-wrap:anywhere]">
                            {card.title}
                          </h4>
                          {card.badge && (
                            <span className="px-2 py-0.5 rounded-sm bg-orange-50 text-[#ea580c] border border-orange-200 text-[9px] font-extrabold shrink-0">
                              {card.badge}
                            </span>
                          )}
                        </div>
                        <ul className="space-y-1">
                          {(card.bullets || card.items || []).slice(0, 3).map((it, iIdx) => (
                            <li
                              key={iIdx}
                              className="text-[10px] text-slate-700 leading-snug flex items-start gap-1.5"
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-[#ea580c] mt-1 shrink-0" />
                              <span className="whitespace-normal break-words [overflow-wrap:anywhere]">
                                {it}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs h-full flex flex-col justify-between">
                      <h4 className="text-[11px] font-black uppercase tracking-wider text-[#c2410c] mb-2 border-b border-slate-100 pb-1.5">
                        Analyse & Points Clés Opérationnels
                      </h4>
                      <ul className="space-y-2 my-auto">
                        {slide.bullets.map((b, bIdx) => (
                          <li
                            key={bIdx}
                            className="text-[10.5px] text-slate-700 leading-snug flex items-start gap-2"
                          >
                            <span className="w-4 h-4 rounded-full bg-[#c2410c] text-[#fdba74] text-[9px] font-black flex items-center justify-center shrink-0 mt-0.5">
                              {bIdx + 1}
                            </span>
                            <span className="font-medium whitespace-normal break-words [overflow-wrap:anywhere]">
                              {b}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Si la slide a AUSSI un tableau en dessous du graphique */}
            {hasChart && hasTable && slide.table && (
              <div className="rounded-xl border border-slate-300 bg-white overflow-x-auto shadow-2xs">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="bg-[#c2410c] text-white">
                      {slide.table.headers.map((h, hIdx) => (
                        <th
                          key={hIdx}
                          className="px-2.5 py-1.5 text-[9px] font-extrabold uppercase tracking-wider border-r border-orange-800 last:border-r-0"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {slide.table.rows.slice(0, 4).map((row, rIdx) => (
                      <tr
                        key={rIdx}
                        className={rIdx % 2 === 0 ? 'bg-white' : 'bg-orange-50/40'}
                      >
                        {row.map((cell, cIdx) => (
                          <td
                            key={cIdx}
                            className={`px-2.5 py-1.5 text-[9.5px] leading-snug ${
                              cIdx === 0
                                ? 'font-bold text-[#c2410c]'
                                : 'text-slate-700 font-medium'
                            }`}
                          >
                            <div className="whitespace-normal break-words [overflow-wrap:anywhere]">
                              {cell}
                            </div>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Cas B : Pas de graphique, Layout = Grille 3 Cartes (ou threeCards présentes sans table) */}
            {!hasChart && (slide.layout === 'three_cards' || (hasThreeCards && !hasTable)) && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-[14px]">
                {(slide.threeCards.length > 0
                  ? slide.threeCards
                  : [
                      {
                        title: '1. Constats & Diagnostic',
                        badge: 'Analyse',
                        bullets: slide.bullets.slice(0, 2)
                      },
                      {
                        title: '2. Dispositif Opérationnel',
                        badge: 'Exécution',
                        bullets: slide.bullets.slice(2, 4)
                      },
                      {
                        title: '3. Décisions & Cibles',
                        badge: 'Validation',
                        bullets: slide.bullets.slice(4, 6)
                      }
                    ]
                ).map((card, cIdx) => (
                  <div
                    key={cIdx}
                    className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs flex flex-col justify-between gap-2"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-2 pb-1.5 border-b border-slate-100">
                        <h4 className="text-[11px] font-black text-[#c2410c] uppercase leading-snug whitespace-normal break-words [overflow-wrap:anywhere]">
                          {card.title}
                        </h4>
                        {card.badge && (
                          <span className="px-2 py-0.5 rounded-sm bg-orange-50 text-[#ea580c] border border-orange-200 text-[9px] font-extrabold shrink-0">
                            {card.badge}
                          </span>
                        )}
                      </div>
                      <ul className="space-y-1.5">
                        {(card.bullets || card.items || []).map((it, iIdx) => (
                          <li
                            key={iIdx}
                            className="text-[10.5px] text-slate-700 leading-snug flex items-start gap-1.5"
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-[#ea580c] mt-1.5 shrink-0" />
                            <span className="whitespace-normal break-words [overflow-wrap:anywhere]">
                              {it}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Cas C : Pas de graphique, Tableau / Matrice Pleine Largeur */}
            {!hasChart && hasTable && slide.table && (
              <div className="rounded-xl border border-slate-300 bg-white overflow-x-auto shadow-2xs">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="bg-[#c2410c] text-white">
                      {slide.table.headers.map((h, hIdx) => (
                        <th
                          key={hIdx}
                          className="px-2.5 py-2 text-[9.5px] font-extrabold uppercase tracking-wider border-r border-orange-800 last:border-r-0"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {slide.table.rows.slice(0, 6).map((row, rIdx) => (
                      <tr
                        key={rIdx}
                        className={rIdx % 2 === 0 ? 'bg-white' : 'bg-orange-50/40'}
                      >
                        {row.map((cell, cIdx) => (
                          <td
                            key={cIdx}
                            className={`px-2.5 py-1.5 text-[10px] leading-snug ${
                              cIdx === 0
                                ? 'font-bold text-[#c2410c]'
                                : 'text-slate-700 font-medium'
                            }`}
                          >
                            <div className="whitespace-normal break-words [overflow-wrap:anywhere]">
                              {cell}
                            </div>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Cas D : Pas de graphique ni table ni 3 cartes -> 2 Colonnes Texte + Visuel */}
            {!hasChart && !hasTable && !hasThreeCards && slide.layout !== 'three_cards' && (
              <div className="grid grid-cols-1 md:grid-cols-12 gap-[14px]">
                <div className={hasVisualMedia ? 'md:col-span-7' : 'md:col-span-12'}>
                  <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs">
                    <h4 className="text-[11px] font-black uppercase tracking-wider text-[#c2410c] mb-2 border-b border-slate-100 pb-1">
                      Points Clés & Argumentaire Décisionnel
                    </h4>
                    <ul className="space-y-1.5">
                      {slide.bullets.map((b, bIdx) => (
                        <li
                          key={bIdx}
                          className="text-[10.5px] text-slate-700 leading-snug flex items-start gap-2"
                        >
                          <span className="w-4 h-4 rounded-full bg-[#c2410c] text-[#fdba74] text-[9px] font-black flex items-center justify-center shrink-0 mt-0.5">
                            {bIdx + 1}
                          </span>
                          <span className="font-medium whitespace-normal break-words [overflow-wrap:anywhere]">
                            {b}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
                {hasVisualMedia && (
                  <div className="md:col-span-5">
                    <div className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-2xs flex flex-col items-center justify-center">
                      {slide.imageDataUrl ? (
                        <>
                          <img
                            src={slide.imageDataUrl}
                            alt={slide.imageCaption || slide.title}
                            className="max-h-40 w-auto object-contain rounded-md border border-slate-100"
                          />
                          {slide.imageCaption && (
                            <p className="text-[9px] font-semibold text-slate-500 mt-1 text-center whitespace-normal break-words">
                              {slide.imageCaption}
                            </p>
                          )}
                        </>
                      ) : (
                        slide.fieldPhotos &&
                        slide.fieldPhotos.length > 0 && (
                          <div className="grid grid-cols-2 gap-2 w-full">
                            {slide.fieldPhotos.slice(0, 2).map(ph => (
                              <div
                                key={ph.id}
                                className="rounded-md overflow-hidden border border-slate-200 bg-slate-50 flex flex-col"
                              >
                                <img
                                  src={ph.dataUrl}
                                  alt={ph.caption}
                                  className="h-24 w-full object-cover"
                                />
                                <span className="text-[8px] font-medium text-slate-600 px-1.5 py-0.5 whitespace-normal break-words">
                                  {ph.caption}
                                </span>
                              </div>
                            ))}
                          </div>
                        )
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* (4) Encadré de synthèse des puces en bas (Bien séparé, ne recouvre jamais les blocs) */}
          {slide.bullets.length > 0 && (hasTable || hasThreeCards) && (
            <div className="rounded-lg bg-[#fff7ed] border border-orange-200 px-3.5 py-2.5">
              <p className="text-[9px] font-black uppercase tracking-wider text-[#c2410c] mb-1">
                Synthèse Décisionnelle & Points d’Attention :
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                {slide.bullets.slice(0, 4).map((b, bIdx) => (
                  <p
                    key={bIdx}
                    className="text-[10px] font-semibold text-[#c2410c] leading-snug flex items-start gap-1.5"
                  >
                    <span className="text-[#ea580c] font-black shrink-0">•</span>
                    <span className="whitespace-normal break-words [overflow-wrap:anywhere]">
                      {b}
                    </span>
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* Bloc Signatures / Cachets sur la Slide Finale */}
          {slide.isFinalSlide && slide.includeSignatures && (
            <div className="rounded-lg border border-orange-200 bg-white px-4 py-2.5 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-extrabold text-[#c2410c] uppercase">
                  Visa Structure Pilote :
                </span>
                {slide.orgStampDataUrl ? (
                  <img
                    src={slide.orgStampDataUrl}
                    alt="Cachet Organisation"
                    className="h-9 w-auto object-contain"
                  />
                ) : (
                  <span className="text-[9px] italic text-slate-400">
                    [Signature & Cachet Officiel]
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-extrabold text-[#c2410c] uppercase">
                  Visa Bailleur / Comité :
                </span>
                {slide.partnerStampDataUrl ? (
                  <img
                    src={slide.partnerStampDataUrl}
                    alt="Cachet Partenaire"
                    className="h-9 w-auto object-contain"
                  />
                ) : (
                  <span className="text-[9px] italic text-slate-400">
                    [Approbation & Quitus Séance]
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* (5) Pied de page de la Slide */}
        <div className="bg-slate-900 text-white px-5 py-2 flex items-center justify-between gap-2 text-[9.5px] border-t border-slate-700 rounded-b-[10px]">
          <span className="font-semibold text-slate-300 whitespace-normal break-words [overflow-wrap:anywhere]">
            {activeTemplateConfig.officialTitle} • {selectedDossier.name}
          </span>
          <span className="font-black text-[#fdba74] shrink-0">
            Slide {slide.displaySlideNumber} / {slide.totalDisplaySlides}
          </span>
        </div>
      </div>
    );
  };

  const currentMatrixDef = useMemo(
    () =>
      MASTER_MATRICES_DEFINITIONS.find(d => d.id === activeMatrixTab) ||
      MASTER_MATRICES_DEFINITIONS[0],
    [activeMatrixTab]
  );

  const currentMatrixRows = useMemo(
    () => resolvedMatrices[activeMatrixTab] || [],
    [resolvedMatrices, activeMatrixTab]
  );

  return (
    <div className="flex-1 flex flex-col lg:flex-row overflow-hidden bg-slate-100 dark:bg-slate-950">
      {/* ==================================================================== */}
      {/* VOLET GAUCHE (44%) : ÉDITEUR STRUCTURÉ SLIDE PAR SLIDE & MATRICES    */}
      {/* ==================================================================== */}
      <div className="w-full lg:w-[44%] xl:w-[42%] h-full overflow-y-auto border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-4">
        {/* Bandeau de contrôle rapide du Deck 16:9 */}
        <div className="rounded-xl bg-gradient-to-r from-[#c2410c] to-[#9a3412] text-white p-4 shadow-md border border-[#fdba74]/40">
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#fdba74] text-[#c2410c] text-[10px] font-black uppercase tracking-wider">
                <Presentation className="w-3.5 h-3.5" />
                DECK DE PRÉSENTATION 16:9 PAYSAGE
              </span>
              <h2 className="text-sm font-black mt-1.5 leading-snug">
                {activeTemplateConfig.selectLabel}
              </h2>
              <p className="text-[11px] text-orange-100/90 mt-0.5">
                {activeSlides.length} diapositives actives sur {allSlides.length} • 100% synchronisé avec les onglets & Matrices {connectedMatrixIds.join(', ')}
              </p>
            </div>
            <button
              type="button"
              onClick={resetAllSlideOverrides}
              title="Réinitialiser toutes les diapositives avec les données temps réel des onglets"
              className="px-2.5 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white border border-white/30 text-[11px] font-extrabold flex items-center gap-1.5 shrink-0 cursor-pointer transition-all"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Synchroniser
            </button>
          </div>

          {/* Barre de sélection : Trimestre PTT (uniquement pour la Présentation 20 : slides_ptt) */}
          {selectedDocType === 'slides_ptt' && (
            <div className="mt-3 pt-3 border-t border-orange-400/30 flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-bold text-[#fdba74]">
                Trimestre actif du PTT (90 jours) :
              </span>
              <div className="flex items-center gap-1 ml-auto">
                {(['Q1', 'Q2', 'Q3', 'Q4'] as const).map(q => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => onUpdateDocField('slides_ptt', 'activeQuarter', q)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-black cursor-pointer transition-all ${
                      (currentFields.activeQuarter || 'Q1') === q
                        ? 'bg-[#fdba74] text-[#c2410c]'
                        : 'bg-orange-950/60 text-orange-200 hover:bg-orange-900'
                    }`}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Boutons Tout cocher / Tout décocher */}
          <div className="mt-3 pt-3 border-t border-orange-400/30 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => toggleAllSlides(false)}
                className="px-2.5 py-1 rounded-md bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-300/40 text-emerald-100 text-[10px] font-extrabold flex items-center gap-1 cursor-pointer"
              >
                <CheckSquare className="w-3 h-3" />
                Activer les {allSlides.length} slides
              </button>
              <button
                type="button"
                onClick={() => toggleAllSlides(true)}
                className="px-2.5 py-1 rounded-md bg-slate-800/60 hover:bg-slate-800 border border-slate-500/40 text-slate-200 text-[10px] font-extrabold flex items-center gap-1 cursor-pointer"
              >
                <Square className="w-3 h-3" />
                Garder Slide 1 seule
              </button>
            </div>

            <button
              type="button"
              onClick={toggleHideSignatures}
              className={`px-2.5 py-1 rounded-md border text-[10px] font-extrabold flex items-center gap-1 cursor-pointer ${
                !hideSignatures
                  ? 'bg-[#fdba74] text-[#c2410c] border-white'
                  : 'bg-slate-800/60 text-slate-300 border-slate-600'
              }`}
            >
              <Stamp className="w-3 h-3" />
              {!hideSignatures ? 'Signatures & Cachets : OUI' : 'Signatures : Masquées'}
            </button>
          </div>
        </div>

        {/* Accordéon 1 : En-tête Institutionnel, Logos, Noms des Organisations & Cachets */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 overflow-hidden">
          <button
            type="button"
            onClick={() => setBrandingAccordionOpen(!brandingAccordionOpen)}
            className="w-full px-4 py-2.5 flex items-center justify-between text-left bg-white dark:bg-slate-900 border-b border-slate-200/80 dark:border-slate-800 cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <ImageIcon className="w-4 h-4 text-[#ea580c]" />
              <span className="text-xs font-black uppercase tracking-wider text-[#c2410c] dark:text-[#fdba74]">
                Charte Slide 1 : Logos, Organisations, Directions, Bannière & Cachets
              </span>
            </div>
            {brandingAccordionOpen ? (
              <ChevronUp className="w-4 h-4 text-slate-500" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-500" />
            )}
          </button>

          {brandingAccordionOpen && (
            <div className="p-3.5 space-y-3 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                    Organisation Gauche (Bailleur / Commanditaire — GRAS)
                  </label>
                  <input
                    type="text"
                    value={currentFields.recipientOrg || ''}
                    onChange={e =>
                      onUpdateDocField(selectedDocType, 'recipientOrg', e.target.value)
                    }
                    placeholder="Ex: Banque Mondiale / PNUD / BAD"
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                    Organisation Droite (Agence d’Exécution / Pilote — GRAS)
                  </label>
                  <input
                    type="text"
                    value={currentFields.executingOrgName || ''}
                    onChange={e =>
                      onUpdateDocField(
                        selectedDocType,
                        'executingOrgName',
                        e.target.value
                      )
                    }
                    placeholder="Ex: Ministère / Direction Générale"
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                    Direction / Unité Gauche (Style normal non gras)
                  </label>
                  <input
                    type="text"
                    value={currentFields.donorDepartment || ''}
                    onChange={e =>
                      onUpdateDocField(selectedDocType, 'donorDepartment', e.target.value)
                    }
                    placeholder="Ex: Direction des Opérations & Financements"
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                    Direction / Unité Droite (Style normal non gras)
                  </label>
                  <input
                    type="text"
                    value={currentFields.executingDepartment || ''}
                    onChange={e =>
                      onUpdateDocField(
                        selectedDocType,
                        'executingDepartment',
                        e.target.value
                      )
                    }
                    placeholder="Ex: Unité de Gestion du Projet (UGP)"
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                    Référence Officielle du Deck
                  </label>
                  <input
                    type="text"
                    value={currentFields.referenceCode || ''}
                    onChange={e =>
                      onUpdateDocField(selectedDocType, 'referenceCode', e.target.value)
                    }
                    placeholder="Ex: SLIDES-COPIL-2026-01"
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                    Orateur / Présentateur Principal
                  </label>
                  <input
                    type="text"
                    value={currentFields.recipientRepresentative || ''}
                    onChange={e =>
                      onUpdateDocField(
                        selectedDocType,
                        'recipientRepresentative',
                        e.target.value
                      )
                    }
                    placeholder="Nom & Fonction du présentateur"
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                  />
                </div>
              </div>

              {/* Uploads Logos, Bannière & Cachets */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
                {[
                  {
                    key: 'leftLogoDataUrl' as const,
                    label: 'Logo Gauche (65-80px)'
                  },
                  {
                    key: 'rightLogoDataUrl' as const,
                    label: 'Logo Droit (65-80px)'
                  },
                  {
                    key: 'bannerImageDataUrl' as const,
                    label: 'Bannière Slide 1'
                  },
                  {
                    key: 'orgStampDataUrl' as const,
                    label: 'Cachet UGP'
                  },
                  {
                    key: 'partnerStampDataUrl' as const,
                    label: 'Cachet Bailleur'
                  }
                ].map(item => (
                  <div
                    key={item.key}
                    className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2 flex flex-col items-center text-center gap-1"
                  >
                    <span className="text-[9px] font-extrabold text-slate-600 dark:text-slate-300">
                      {item.label}
                    </span>
                    {currentFields[item.key] ? (
                      <div className="relative group">
                        <img
                          src={currentFields[item.key]}
                          alt={item.label}
                          className="h-9 w-auto object-contain rounded-xs"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateDocField(selectedDocType, item.key, '')
                          }
                          className="mt-1 text-[9px] text-rose-600 font-bold hover:underline cursor-pointer"
                        >
                          Supprimer
                        </button>
                      </div>
                    ) : (
                      <label className="w-full py-1.5 px-2 rounded-md bg-orange-50 hover:bg-orange-100 text-[#c2410c] text-[9px] font-bold cursor-pointer flex items-center justify-center gap-1">
                        <Upload className="w-3 h-3" />
                        Importer
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={e =>
                            handleImageFileUpload(e.target.files?.[0], dataUrl =>
                              onUpdateDocField(selectedDocType, item.key, dataUrl)
                            )
                          }
                        />
                      </label>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Accordéon 2 : Matrices Maîtresses Connectées (M1 à M10) */}
        <div className="rounded-xl border border-orange-200 dark:border-slate-800 bg-orange-50/40 dark:bg-slate-800/40 overflow-hidden">
          <button
            type="button"
            onClick={() => setMatricesAccordionOpen(!matricesAccordionOpen)}
            className="w-full px-4 py-2.5 flex items-center justify-between text-left bg-white dark:bg-slate-900 border-b border-orange-200/80 dark:border-slate-800 cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-[#ea580c]" />
              <span className="text-xs font-black uppercase tracking-wider text-[#c2410c] dark:text-[#fdba74]">
                Matrices Maîtresses Connectées aux Slides & Graphiques ({connectedMatrixIds.join(', ')})
              </span>
            </div>
            {matricesAccordionOpen ? (
              <ChevronUp className="w-4 h-4 text-slate-500" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-500" />
            )}
          </button>

          {matricesAccordionOpen && (
            <div className="p-3.5 space-y-3">
              {/* Onglets des matrices connectées */}
              <div className="flex flex-wrap gap-1.5">
                {MASTER_MATRICES_DEFINITIONS.filter(def =>
                  connectedMatrixIds.includes(def.id)
                ).map(def => (
                  <button
                    key={def.id}
                    type="button"
                    onClick={() => setActiveMatrixTab(def.id)}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-black transition-all cursor-pointer ${
                      activeMatrixTab === def.id
                        ? 'bg-[#c2410c] text-[#fdba74] shadow-xs'
                        : 'bg-white text-slate-700 border border-slate-200 hover:bg-orange-50'
                    }`}
                  >
                    {def.chipLabel}
                  </button>
                ))}
              </div>

              {/* Éditeur tabulaire de la matrice active */}
              <div className="rounded-lg border border-slate-200 bg-white p-2.5 overflow-x-auto">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <h4 className="text-[11px] font-black text-[#c2410c]">
                      {currentMatrixDef.fullTitle}
                    </h4>
                    <p className="text-[10px] text-slate-500">
                      Réf. normative : {currentMatrixDef.normativeRef}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleAddMatrixRow(activeMatrixTab)}
                    className="px-2.5 py-1 rounded-md bg-[#c2410c] text-[#fdba74] text-[10px] font-extrabold flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    Ajouter ligne
                  </button>
                </div>

                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700">
                      {currentMatrixDef.columns.map(col => (
                        <th
                          key={col.key}
                          className="px-2 py-1 text-[9px] font-extrabold uppercase border border-slate-200"
                        >
                          {col.label}
                        </th>
                      ))}
                      <th className="px-2 py-1 text-[9px] font-extrabold uppercase border border-slate-200 w-8">
                        Suppr.
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentMatrixRows.map((row, rIdx) => (
                      <tr key={rIdx} className="hover:bg-orange-50/30">
                        {currentMatrixDef.columns.map(col => (
                          <td
                            key={col.key}
                            className="p-1 border border-slate-200"
                          >
                            <input
                              type="text"
                              value={row[col.key] || ''}
                              onChange={e =>
                                handleMatrixCellChange(
                                  activeMatrixTab,
                                  rIdx,
                                  col.key,
                                  e.target.value
                                )
                              }
                              className="w-full px-1.5 py-1 text-[10px] bg-transparent focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#ea580c] rounded-xs"
                            />
                          </td>
                        ))}
                        <td className="p-1 border border-slate-200 text-center">
                          <button
                            type="button"
                            onClick={() =>
                              handleRemoveMatrixRow(activeMatrixTab, rIdx)
                            }
                            className="p-1 text-rose-500 hover:bg-rose-50 rounded-xs cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Accordéon 3 : Galerie Photos & Illustrations Terrain */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 overflow-hidden">
          <button
            type="button"
            onClick={() => setPhotosAccordionOpen(!photosAccordionOpen)}
            className="w-full px-4 py-2.5 flex items-center justify-between text-left bg-white dark:bg-slate-900 border-b border-slate-200/80 dark:border-slate-800 cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#ea580c]" />
              <span className="text-xs font-black uppercase tracking-wider text-[#c2410c] dark:text-[#fdba74]">
                Photos de Terrain & Preuves Visuelles ({fieldPhotos.length})
              </span>
            </div>
            {photosAccordionOpen ? (
              <ChevronUp className="w-4 h-4 text-slate-500" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-500" />
            )}
          </button>

          {photosAccordionOpen && (
            <div className="p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-600">
                  Ajoutez des photos de terrain pour illustrer vos diapositives :
                </span>
                <label className="px-3 py-1.5 rounded-lg bg-[#c2410c] text-[#fdba74] text-[10px] font-extrabold flex items-center gap-1.5 cursor-pointer">
                  <Upload className="w-3.5 h-3.5" />
                  Ajouter une photo
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={e => handleAddFieldPhoto(e.target.files?.[0])}
                  />
                </label>
              </div>

              {fieldPhotos.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {fieldPhotos.map(ph => (
                    <div
                      key={ph.id}
                      className="rounded-lg border border-slate-200 bg-white p-2 flex items-center gap-2.5"
                    >
                      <img
                        src={ph.dataUrl}
                        alt={ph.caption}
                        className="w-14 h-14 object-cover rounded-md border border-slate-200 shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <input
                          type="text"
                          value={ph.caption}
                          onChange={e =>
                            handleUpdatePhotoCaption(ph.id, e.target.value)
                          }
                          className="w-full px-2 py-1 text-[10px] font-semibold border border-slate-200 rounded-md"
                        />
                        <button
                          type="button"
                          onClick={() => handleDeleteFieldPhoto(ph.id)}
                          className="mt-1 text-[10px] text-rose-600 font-bold flex items-center gap-1 hover:underline cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
                          Retirer
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ==================================================================== */}
        {/* LISTE DES CARTES D'ÉDITION SLIDE PAR SLIDE (SLIDE 1 À SLIDE N)       */}
        {/* ==================================================================== */}
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
              Édition Structurée Diapositive par Diapositive ({allSlides.length} Slides)
            </h3>
            <span className="text-[10px] font-bold text-[#ea580c]">
              Cliquez sur une slide pour centrer l’aperçu 16:9
            </span>
          </div>

          {allSlides.map(slide => {
            const isFocused = focusedSlideNumber === slide.slideNumber;
            return (
              <div
                key={slide.slideNumber}
                onClick={() => scrollToSlide(slide.slideNumber)}
                className={`rounded-xl border transition-all p-3.5 space-y-2.5 cursor-pointer ${
                  slide.excluded
                    ? 'bg-slate-100/80 border-slate-200 opacity-60'
                    : isFocused
                    ? 'bg-orange-50/60 dark:bg-slate-800/90 border-[#ea580c] ring-2 ring-orange-400/20 shadow-sm'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-orange-300'
                }`}
              >
                {/* En-tête de la carte d'édition de la Slide */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        updateSlideOverride(slide.slideNumber, {
                          excluded: !slide.excluded
                        });
                      }}
                      className={`px-2 py-1 rounded-md text-[10px] font-black flex items-center gap-1 cursor-pointer ${
                        slide.excluded
                          ? 'bg-slate-200 text-slate-600'
                          : 'bg-[#c2410c] text-[#fdba74]'
                      }`}
                    >
                      {slide.excluded ? (
                        <>
                          <EyeOff className="w-3 h-3" />
                          Exclue
                        </>
                      ) : (
                        <>
                          <Eye className="w-3 h-3" />
                          Slide {slide.displaySlideNumber}/{slide.totalDisplaySlides}
                        </>
                      )}
                    </button>
                    <span className="text-[10px] font-extrabold text-[#ea580c] uppercase whitespace-normal break-words">
                      {slide.matrixBadge}
                    </span>
                  </div>

                  {/* Sélecteur de disposition (Layout) de la Slide */}
                  {!slide.isCoverSlide && !slide.excluded && (
                    <div
                      className="flex items-center gap-1 shrink-0"
                      onClick={e => e.stopPropagation()}
                    >
                      {(
                        [
                          {
                            id: 'two_columns' as SlideLayoutMode,
                            label: '2 Col.',
                            icon: Layers
                          },
                          {
                            id: 'full_matrix' as SlideLayoutMode,
                            label: 'Tableau',
                            icon: TableIcon
                          },
                          {
                            id: 'three_cards' as SlideLayoutMode,
                            label: '3 Cartes',
                            icon: LayoutGrid
                          }
                        ] as const
                      ).map(mode => {
                        const IconComp = mode.icon;
                        return (
                          <button
                            key={mode.id}
                            type="button"
                            onClick={() =>
                              updateSlideOverride(slide.slideNumber, {
                                layout: mode.id
                              })
                            }
                            className={`px-2 py-0.5 rounded-sm text-[9px] font-extrabold flex items-center gap-1 cursor-pointer ${
                              slide.layout === mode.id
                                ? 'bg-[#ea580c] text-white'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            <IconComp className="w-2.5 h-2.5" />
                            {mode.label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {!slide.excluded && (
                  <div
                    className="space-y-2 pt-1"
                    onClick={e => e.stopPropagation()}
                  >
                    {/* Titre de la Slide */}
                    <div>
                      <label className="block text-[9px] font-extrabold uppercase text-slate-500 mb-0.5">
                        Titre de la Slide (Affichage intégral multi-lignes)
                      </label>
                      <input
                        type="text"
                        value={slide.title}
                        onChange={e =>
                          updateSlideOverride(slide.slideNumber, {
                            title: e.target.value
                          })
                        }
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-extrabold text-[#c2410c] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#ea580c]"
                      />
                    </div>

                    {/* Sous-titre / Accroche de la Slide */}
                    <div>
                      <label className="block text-[9px] font-extrabold uppercase text-slate-500 mb-0.5">
                        Sous-titre / Message Clé
                      </label>
                      <input
                        type="text"
                        value={slide.subtitle}
                        onChange={e =>
                          updateSlideOverride(slide.slideNumber, {
                            subtitle: e.target.value
                          })
                        }
                        className="w-full px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px] font-medium text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-[#ea580c]"
                      />
                    </div>

                    {/* Puces / Contenu synthétique de la Slide */}
                    <div>
                      <div className="flex items-center justify-between mb-0.5">
                        <label className="text-[9px] font-extrabold uppercase text-slate-500">
                          Points Clés de la Slide (1 ligne = 1 puce)
                        </label>
                        {slide.connectedMatrixId && (
                          <button
                            type="button"
                            onClick={() => {
                              setActiveMatrixTab(slide.connectedMatrixId!);
                              setMatricesAccordionOpen(true);
                            }}
                            className="text-[9px] font-extrabold text-[#ea580c] hover:underline cursor-pointer"
                          >
                            Éditer la Matrice {slide.connectedMatrixId} →
                          </button>
                        )}
                      </div>
                      <textarea
                        rows={4}
                        value={slide.contentText}
                        onChange={e =>
                          updateSlideOverride(slide.slideNumber, {
                            content: e.target.value
                          })
                        }
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px] leading-relaxed text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#ea580c]"
                      />
                    </div>

                    {/* Image spécifique optionnelle pour cette Slide */}
                    {!slide.isCoverSlide && (
                      <div className="flex items-center justify-between gap-2 pt-1">
                        <label className="px-2.5 py-1 rounded-md bg-slate-100 hover:bg-orange-50 text-slate-700 border border-slate-200 text-[10px] font-bold flex items-center gap-1.5 cursor-pointer">
                          <ImageIcon className="w-3 h-3 text-[#ea580c]" />
                          {slide.imageDataUrl
                            ? 'Changer le visuel de la slide'
                            : 'Insérer un graphique / image sur cette slide'}
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={e =>
                              handleImageFileUpload(
                                e.target.files?.[0],
                                dataUrl =>
                                  updateSlideOverride(slide.slideNumber, {
                                    imageDataUrl: dataUrl
                                  })
                              )
                            }
                          />
                        </label>
                        {slide.imageDataUrl && (
                          <button
                            type="button"
                            onClick={() =>
                              updateSlideOverride(slide.slideNumber, {
                                imageDataUrl: ''
                              })
                            }
                            className="text-[10px] font-bold text-rose-600 hover:underline cursor-pointer"
                          >
                            Retirer l’image
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ==================================================================== */}
      {/* VOLET DROIT (56%) : APERÇU HAUTE FIDÉLITÉ DES SLIDES 16:9 PAYSAGE    */}
      {/* ==================================================================== */}
      <div className="flex-1 h-full flex flex-col overflow-hidden bg-slate-200/80 dark:bg-slate-950">
        {/* Barre d'outils supérieure de l'aperçu 16:9 */}
        <div className="px-4 py-2.5 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-md bg-[#c2410c] text-[#fdba74] text-[10px] font-black uppercase tracking-wider">
              APERÇU DIRECT 16:9 PAYSAGE ({activeSlides.length} SLIDES)
            </span>
            <div className="hidden xl:flex items-center gap-1 overflow-x-auto max-w-md py-0.5">
              {activeSlides.map(s => (
                <button
                  key={s.slideNumber}
                  type="button"
                  onClick={() => scrollToSlide(s.slideNumber)}
                  className={`w-6 h-6 rounded-md text-[10px] font-black transition-all cursor-pointer ${
                    focusedSlideNumber === s.slideNumber
                      ? 'bg-[#ea580c] text-white shadow-xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-orange-100'
                  }`}
                >
                  {s.displaySlideNumber}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
              <button
                type="button"
                onClick={() => setZoomPct(z => Math.max(70, z - 10))}
                className="p-1 rounded-md hover:bg-white text-slate-700 dark:text-slate-200 cursor-pointer"
                title="Réduire le zoom"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="text-[11px] font-extrabold px-1.5 text-slate-700 dark:text-slate-200">
                {zoomPct}%
              </span>
              <button
                type="button"
                onClick={() => setZoomPct(z => Math.min(125, z + 10))}
                className="p-1 rounded-md hover:bg-white text-slate-700 dark:text-slate-200 cursor-pointer"
                title="Augmenter le zoom"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </div>

            {onExportPDF && (
              <button
                type="button"
                onClick={onExportPDF}
                className="px-3.5 py-1.5 rounded-lg bg-[#c2410c] hover:bg-[#9a3412] text-[#fdba74] border border-[#fdba74] text-xs font-extrabold flex items-center gap-1.5 shadow-xs cursor-pointer transition-all"
              >
                <Download className="w-3.5 h-3.5" />
                Exporter Deck PDF 16:9 ({activeSlides.length} Slides)
              </button>
            )}
          </div>
        </div>

        {/* Pile verticale des diapositives 16:9 */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          <div
            className="mx-auto space-y-6 transition-all origin-top"
            style={{
              maxWidth: `${Math.round((920 * zoomPct) / 100)}px`
            }}
          >
            {activeSlides.map(slide => renderSlideCard16x9(slide))}
          </div>
        </div>
      </div>
    </div>
  );
};
