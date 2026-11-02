import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  X,
  Camera,
  QrCode,
  ShieldCheck,
  ShieldAlert,
  Upload,
  Search,
  CheckCircle2,
  UserCheck,
  Building2,
  Briefcase,
  Layers,
  Phone,
  Mail,
  Clock,
  CreditCard,
  Download,
  RefreshCw,
  Sparkles
} from 'lucide-react';
import {
  Dossier,
  LanguageCode,
  UserProfile,
  InternalActorProfile
} from '../types';
import { ensureDossierCategorizedActors } from '../db';
import {
  buildBadgeQrPayload,
  buildBusinessCardVCardPayload,
  verifyScannedPayloadAgainstDossier,
  decodeQrOrBarcodeFromSource,
  ScannedActorVerificationResult
} from '../qrAndBarcodeUtils';
import { saveProgramFile } from '../services/exportStorage';
import {
  ScannableQrCodeSvg,
  ScannableCode128BarcodeSvg
} from './QrAndBarcodeSvg';

interface QrBarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  dossier: Dossier;
  userProfile: UserProfile;
  language: LanguageCode;
  initialScanPayload?: string;
  onOpenInternalActorModal?: (actorName: string) => void;
}

type ScannerMode = 'camera' | 'image' | 'manual';

export const QrBarcodeScannerModal: React.FC<QrBarcodeScannerModalProps> = ({
  isOpen,
  onClose,
  dossier,
  userProfile,
  language,
  initialScanPayload,
  onOpenInternalActorModal
}) => {
  const isEn = language === 'EN';
  const [mode, setMode] = useState<ScannerMode>('manual');
  const [manualInput, setManualInput] = useState<string>(initialScanPayload || '');
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [uploadedPreviewUrl, setUploadedPreviewUrl] = useState<string | null>(null);
  const [verificationResult, setVerificationResult] =
    useState<ScannedActorVerificationResult | null>(null);
  const [scanHistory, setScanHistory] = useState<ScannedActorVerificationResult[]>([]);
  const [contactSavedNotice, setContactSavedNotice] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanIntervalRef = useRef<number | null>(null);

  const categorizedActors = useMemo(
    () => ensureDossierCategorizedActors(dossier, userProfile),
    [dossier, userProfile]
  );

  const internalActors = useMemo(
    () => categorizedActors.filter(a => a.category === 'Interne'),
    [categorizedActors]
  );

  const nonInternalActors = useMemo(
    () => categorizedActors.filter(a => a.category !== 'Interne'),
    [categorizedActors]
  );

  // Lecture des profils internes stockés pour ce programme
  const storedProfilesMap = useMemo<Record<string, InternalActorProfile>>(() => {
    const fromDossier = dossier.actorProfiles || {};
    try {
      const raw = localStorage.getItem(`faab_plan_internal_actors_${dossier.id}`);
      if (raw) {
        return { ...JSON.parse(raw), ...fromDossier };
      }
    } catch {
      // ignore
    }
    return fromDossier;
  }, [dossier.id, dossier.actorProfiles]);

  const executeVerification = (payload: string) => {
    if (!payload || !payload.trim()) return;
    const res = verifyScannedPayloadAgainstDossier(
      payload,
      dossier,
      userProfile,
      storedProfilesMap
    );
    setVerificationResult(res);
    setScanHistory(prev => [
      res,
      ...prev.filter(item => item.rawPayload !== res.rawPayload).slice(0, 5)
    ]);
  };

  useEffect(() => {
    if (isOpen) {
      if (initialScanPayload) {
        setManualInput(initialScanPayload);
        executeVerification(initialScanPayload);
      } else if (internalActors.length > 0 && !verificationResult) {
        // Par défaut, pré-charger l'authentification du premier acteur Interne du programme
        const firstInternal = internalActors[0];
        const prof = storedProfilesMap[firstInternal.name];
        const sampleBadgePayload = buildBadgeQrPayload(
          prof || {
            id: firstInternal.id,
            actorName: firstInternal.name,
            isInternalPilotActor: true,
            executingOrgName: firstInternal.organization,
            executingDepartment: firstInternal.department,
            serviceUnit: 'Unité de Gestion du Programme (UGP)',
            employeeId: firstInternal.matricule,
            officialRole: firstInternal.roleOrFunction,
            raciRoleBadge: (firstInternal.raciRoles || ['R']).join('/'),
            fullName: firstInternal.name,
            residenceCity: firstInternal.address || 'Abidjan',
            phonePro: firstInternal.phone,
            phoneMobile: firstInternal.phone,
            emailPro: firstInternal.email,
            badgeValidityDate: firstInternal.badgeValidity || '31/12/2026',
            badgeBloodType: 'O+',
            badgeEmergencyPhone: firstInternal.phone
          },
          dossier
        );
        setManualInput(firstInternal.matricule);
        executeVerification(sampleBadgePayload);
      }
    }
    return () => {
      stopCameraStream();
    };
  }, [isOpen, initialScanPayload, dossier.id]);

  const stopCameraStream = () => {
    if (scanIntervalRef.current) {
      window.clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  const startCameraStream = async () => {
    setCameraError(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraError(
          isEn
            ? 'Camera API is not available in this browser context. Use Image Upload or Direct Badge Simulation below.'
            : 'L’accès caméra direct n’est pas disponible dans ce contexte navigateur. Utilisez l’import d’image ou la simulation directe des badges ci-dessous.'
        );
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });
      streamRef.current = stream;
      setCameraActive(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      // Scanner automatiquement les frames vidéo (BarcodeDetector natif + décodeurs optiques TS QR 2D & CODE-128 1D)
      scanIntervalRef.current = window.setInterval(async () => {
        if (videoRef.current && videoRef.current.readyState >= 2) {
          try {
            const decodedVal = await decodeQrOrBarcodeFromSource(videoRef.current);
            if (decodedVal) {
              setManualInput(decodedVal);
              executeVerification(decodedVal);
              stopCameraStream();
            }
          } catch {
            // ignore frame error
          }
        }
      }, 450);
    } catch {
      setCameraError(
        isEn
          ? 'Unable to access camera (permission denied or no webcam detected). You can upload a QR/Barcode image or use the instant badge scanner below.'
          : 'Impossible d’accéder à la caméra (permission refusée ou webcam absente). Vous pouvez importer une image de QR/Code-barres ou utiliser le lecteur instantané ci-dessous.'
      );
      setCameraActive(false);
    }
  };

  const handleImageUploadScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async ev => {
      const dataUrl = ev.target?.result as string;
      if (!dataUrl) return;
      setUploadedPreviewUrl(dataUrl);

      // Tenter la détection optique complète (BarcodeDetector + Décodeurs TS QR 2D & CODE-128 1D) sur l'image importée
      try {
        const img = new Image();
        img.src = dataUrl;
        await new Promise(resolve => {
          img.onload = resolve;
        });
        const decodedVal = await decodeQrOrBarcodeFromSource(img);
        if (decodedVal) {
          setManualInput(decodedVal);
          executeVerification(decodedVal);
          return;
        }
      } catch {
        // fallback below
      }

      // Fallback intelligent : rechercher si le nom du fichier correspond à un acteur ou matricule
      const cleanFileName = file.name
        .replace(/\.[^/.]+$/, '')
        .replace(/[_-]+/g, ' ')
        .toLowerCase();
      const matched = categorizedActors.find(
        a =>
          cleanFileName.includes(a.name.toLowerCase()) ||
          cleanFileName.includes(a.matricule.toLowerCase())
      );
      if (matched) {
        setManualInput(matched.matricule);
        executeVerification(matched.matricule);
      } else if (internalActors[0]) {
        setManualInput(internalActors[0].matricule);
        executeVerification(internalActors[0].matricule);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSimulateActorScan = (
    actorName: string,
    scanKind: 'BADGE_QR' | 'VCARD_QR' | 'BARCODE_1D'
  ) => {
    const catActor = categorizedActors.find(a => a.name === actorName);
    const prof = storedProfilesMap[actorName];

    const syntheticProfile: InternalActorProfile = prof || {
      id: catActor?.id || actorName,
      actorName,
      isInternalPilotActor: catActor?.category === 'Interne',
      executingOrgName:
        catActor?.organization ||
        dossier.institution ||
        'Organisme Pilote du Programme',
      executingDepartment:
        catActor?.department || 'Unité de Gestion du Programme (UGP / PMO)',
      serviceUnit: 'Unité de Gestion du Programme (UGP)',
      employeeId: catActor?.matricule || 'MAT-PILOTE-001',
      officialRole: catActor?.roleOrFunction || 'Expert & Responsable Opérationnel',
      raciRoleBadge: (catActor?.raciRoles || ['R']).join('/'),
      fullName: actorName,
      residenceCity: catActor?.address || 'Abidjan, Côte d’Ivoire',
      phonePro: catActor?.phone || '+225 27 20 00 12 34',
      phoneMobile: catActor?.phone || '+225 07 48 08 27 39',
      emailPro: catActor?.email || 'contact@programme-pilote.org',
      websiteUrl: catActor?.website || 'www.programme-pilote.org',
      officeAddress: catActor?.address || 'Siège de l’Organisme Pilote',
      badgeValidityDate: catActor?.badgeValidity || '31/12/2026',
      badgeBloodType: 'O+',
      badgeEmergencyPhone: catActor?.phone || '+225 27 20 00 12 34',
      photoDataUrl:
        catActor?.photoDataUrl ||
        (actorName === userProfile.fullName ? userProfile.cvPhotoDataUrl : '')
    };

    if (scanKind === 'BADGE_QR') {
      const rawJson = JSON.stringify({
        ...JSON.parse(buildBadgeQrPayload(syntheticProfile, dossier)),
        category: catActor?.category || 'Interne'
      });
      setManualInput(rawJson);
      executeVerification(rawJson);
    } else if (scanKind === 'VCARD_QR') {
      const vcard = buildBusinessCardVCardPayload(syntheticProfile, dossier);
      setManualInput(vcard);
      executeVerification(vcard);
    } else {
      const code128 = syntheticProfile.employeeId || 'MAT-PILOTE-001';
      setManualInput(code128);
      executeVerification(code128);
    }
  };

  const handleDownloadScannedVcf = async () => {
    if (!verificationResult) return;
    const parts = (verificationResult.actorName || 'Expert Interne').trim().split(/\s+/);
    const lastName = parts.length > 1 ? parts[0] : verificationResult.actorName;
    const firstName = parts.length > 1 ? parts.slice(1).join(' ') : '';
    const vcardText =
      verificationResult.scanType === 'VCARD_QR' &&
      verificationResult.rawPayload.includes('BEGIN:VCARD')
        ? verificationResult.rawPayload
        : [
            'BEGIN:VCARD',
            'VERSION:3.0',
            `N:${lastName};${firstName};;;`,
            `FN:${verificationResult.actorName}`,
            `TITLE:${verificationResult.roleOrFunction}`,
            `ORG:${verificationResult.organization};${verificationResult.department}`,
            `TEL;TYPE=CELL,VOICE:${verificationResult.phone || verificationResult.emergencyPhone}`,
            ...(verificationResult.phoneWork &&
            verificationResult.phoneWork !== verificationResult.phone
              ? [`TEL;TYPE=WORK,VOICE:${verificationResult.phoneWork}`]
              : []),
            `EMAIL;TYPE=PREF,WORK,INTERNET:${verificationResult.email}`,
            ...(verificationResult.address
              ? [`ADR;TYPE=WORK:;;${verificationResult.address};;;;`]
              : []),
            ...(verificationResult.website
              ? [
                  `URL:${
                    verificationResult.website.startsWith('http')
                      ? verificationResult.website
                      : `https://${verificationResult.website}`
                  }`
                ]
              : []),
            `NOTE:Programme: ${verificationResult.programmeName} | Matricule: ${verificationResult.matricule} | RACI: ${verificationResult.raciRoles}`,
            'END:VCARD'
          ].join('\r\n');

    const fileName = `contact_${verificationResult.actorName
      .replace(/\s+/g, '_')
      .toLowerCase()}.vcf`;
    const saved = await saveProgramFile({
      programName: dossier.name,
      fileName,
      content: vcardText,
      mimeType: 'text/vcard;charset=utf-8'
    });
    // Si enregistré via le serveur local, déclencher aussi l'ouverture directe du fichier .vcf pour l'application Contacts du téléphone/ordinateur
    if (saved.method === 'dev-server' || saved.method === 'fs-api') {
      try {
        const blob = new Blob([vcardText], { type: 'text/vcard;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } catch {
        // ignore
      }
    }
    setContactSavedNotice(
      isEn
        ? `✓ Contact "${verificationResult.actorName}" (.vcf) saved to phone contacts & folder "${saved.relativePath}"!`
        : `✓ Contact « ${verificationResult.actorName} » (.vcf) prêt pour le répertoire téléphonique et enregistré dans « ${saved.relativePath} » !`
    );
    setTimeout(() => setContactSavedNotice(null), 5500);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto">
      <div className="relative w-full max-w-6xl bg-white dark:bg-slate-900 rounded-2xl border-2 border-[#fdba74] shadow-2xl overflow-hidden flex flex-col max-h-[95vh]">
        {/* HEADER */}
        <div className="bg-gradient-to-r from-[#c2410c] via-[#9a3412] to-[#ea580c] p-3.5 sm:p-4 text-white flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 border border-white/25 flex items-center justify-center shrink-0">
              <QrCode className="w-6 h-6 text-[#fdba74]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-[#fdba74] text-[#c2410c] text-[9.5px] font-black uppercase tracking-wider">
                  {isEn ? 'Internal Access Control & vCard' : 'Contrôle d’Accès Interne & vCard'}
                </span>
                <span className="text-[10.5px] text-orange-200 font-bold">
                  • {dossier.name}
                </span>
              </div>
              <h2 className="text-sm sm:text-base font-black uppercase tracking-tight text-white">
                {isEn
                  ? 'QR Code & 1D Barcode Scanner (Internal Actor Authentication)'
                  : 'Scanner QR Code & Code-Barres (Contrôle d’Accès Interne)'}
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              stopCameraStream();
              onClose();
            }}
            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
            title={isEn ? 'Close' : 'Fermer'}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* MODE SELECTOR TABS */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-orange-50/90 dark:bg-slate-800/90 border-b border-orange-200 dark:border-slate-700 shrink-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                stopCameraStream();
                setMode('manual');
              }}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black uppercase transition-all cursor-pointer ${
                mode === 'manual'
                  ? 'bg-[#c2410c] text-[#fdba74] shadow-xs'
                  : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>
                {isEn
                  ? '1. Direct Badge / QR / Barcode Verification'
                  : '1. Lecteur Instantané (Badge, QR vCard & Code-Barres)'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setMode('camera');
                startCameraStream();
              }}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black uppercase transition-all cursor-pointer ${
                mode === 'camera'
                  ? 'bg-[#c2410c] text-[#fdba74] shadow-xs'
                  : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700'
              }`}
            >
              <Camera className="w-3.5 h-3.5" />
              <span>
                {isEn ? '2. Live Camera Scan' : '2. Scanner via Caméra de l’Appareil'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                stopCameraStream();
                setMode('image');
              }}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black uppercase transition-all cursor-pointer ${
                mode === 'image'
                  ? 'bg-[#c2410c] text-[#fdba74] shadow-xs'
                  : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700'
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              <span>
                {isEn ? '3. Scan Image / Screenshot' : '3. Importer une Image / Capture'}
              </span>
            </button>
          </div>

          <div className="text-[10.5px] font-bold text-[#c2410c] dark:text-[#fdba74]">
            {isEn
              ? `${internalActors.length} Accredited Internal Actor(s) in "${dossier.name}"`
              : `${internalActors.length} Acteur(s) « Interne » habilité(s) dans « ${dossier.name} »`}
          </div>
        </div>

        {/* BODY : LEFT = SCANNER INPUT / SIMULATION, RIGHT = VERIFIED IDENTIFICATION SHEET */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* LEFT COLUMN (5 cols) */}
          <div className="lg:col-span-5 space-y-4">
            {/* MODE CAMÉRA */}
            {mode === 'camera' && (
              <div className="p-4 rounded-xl bg-slate-900 text-white border border-slate-700 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase text-[#fdba74] flex items-center gap-1.5">
                    <Camera className="w-4 h-4" />
                    <span>
                      {isEn
                        ? 'Optical Camera Scanner (QR & CODE-128)'
                        : 'Lecteur Optique Caméra (QR Code & CODE-128)'}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      cameraActive ? stopCameraStream() : startCameraStream()
                    }
                    className="px-2.5 py-1 rounded bg-white/10 hover:bg-white/20 text-[10px] font-bold cursor-pointer flex items-center gap-1"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>{cameraActive ? 'Arrêter' : 'Relancer'}</span>
                  </button>
                </div>

                {cameraError ? (
                  <div className="p-3 rounded-lg bg-amber-950/80 border border-amber-500/50 text-amber-200 text-xs space-y-2">
                    <p className="font-bold">{cameraError}</p>
                  </div>
                ) : (
                  <div className="relative aspect-video rounded-xl overflow-hidden bg-black border-2 border-[#ea580c] flex items-center justify-center">
                    <video
                      ref={videoRef}
                      className="w-full h-full object-cover"
                      playsInline
                      muted
                    />
                    {/* Cadre de visée laser */}
                    <div className="absolute inset-8 border-2 border-dashed border-[#fdba74] rounded-xl pointer-events-none flex items-center justify-center">
                      <div className="w-full h-0.5 bg-emerald-400/80 shadow-[0_0_8px_#34d399] animate-pulse" />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* MODE IMPORT IMAGE */}
            {mode === 'image' && (
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border-2 border-dashed border-[#ea580c] space-y-3 text-center">
                <Upload className="w-8 h-8 text-[#ea580c] mx-auto" />
                <div className="text-xs font-black uppercase text-[#c2410c] dark:text-[#fdba74]">
                  {isEn
                    ? 'Upload a Badge QR Code or Barcode Image'
                    : 'Importer une capture de QR Code ou Code-Barres'}
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-300">
                  {isEn
                    ? 'Select an image file containing a Business Card QR Code or Access Badge Barcode.'
                    : 'Sélectionnez une image contenant le QR Code de la Carte de Visite ou le Code-Barres du Badge d’Accès.'}
                </p>
                <label className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#c2410c] hover:bg-[#9a3412] text-white text-xs font-black cursor-pointer shadow-xs">
                  <Upload className="w-4 h-4 text-[#fdba74]" />
                  <span>{isEn ? 'Choose Image' : 'Choisir une image'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUploadScan}
                    className="hidden"
                  />
                </label>
                {uploadedPreviewUrl && (
                  <div className="pt-2 flex justify-center">
                    <img
                      src={uploadedPreviewUrl}
                      alt="Capture scannée"
                      className="max-h-32 rounded-lg border border-slate-300 bg-white p-1"
                    />
                  </div>
                )}
              </div>
            )}

            {/* SAISIE MANUELLE DE MATRICULE / PAYLOAD QR */}
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2.5">
              <label className="block text-[11px] font-black uppercase text-[#c2410c] dark:text-[#fdba74]">
                {isEn
                  ? 'Scan Input (Matricule CODE-128, Badge QR or vCard 3.0 Payload):'
                  : 'Code Scanné (Matricule CODE-128, Payload QR Badge ou vCard 3.0) :'}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={manualInput}
                  onChange={e => setManualInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') executeVerification(manualInput);
                  }}
                  placeholder="Ex: MAT-PILOTE-001 ou nom de l'acteur..."
                  className="flex-1 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-xs font-bold text-slate-900 dark:text-white"
                />
                <button
                  type="button"
                  onClick={() => executeVerification(manualInput)}
                  className="px-3.5 py-1.5 rounded-lg bg-[#ea580c] hover:bg-[#c2410c] text-white text-xs font-black uppercase cursor-pointer flex items-center gap-1.5 shrink-0"
                >
                  <Search className="w-3.5 h-3.5" />
                  <span>{isEn ? 'Verify' : 'Vérifier'}</span>
                </button>
              </div>
            </div>

            {/* BANCS D'ESSAI INSTANTANÉS : ACTEURS INTERNES DU PROGRAMME */}
            <div className="p-3.5 rounded-xl bg-orange-50/70 dark:bg-slate-800/60 border border-orange-200 dark:border-slate-700 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black uppercase text-[#c2410c] dark:text-[#fdba74] flex items-center gap-1.5">
                  <UserCheck className="w-4 h-4 text-emerald-600" />
                  <span>
                    {isEn
                      ? 'Quick Scan — Accredited Internal Actors'
                      : 'Test de Lecture Directe — Acteurs « Interne » du Programme'}
                  </span>
                </span>
                <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[9.5px] font-black">
                  Catégorie 2 : Interne
                </span>
              </div>

              <div className="space-y-2 max-h-[240px] overflow-y-auto pr-1">
                {internalActors.map(actor => (
                  <div
                    key={actor.id}
                    className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-orange-200 dark:border-slate-700 flex flex-col gap-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-xs font-black text-slate-900 dark:text-white truncate">
                          {actor.name}
                        </div>
                        <div className="text-[10px] font-semibold text-slate-500 truncate">
                          {actor.matricule} • {actor.roleOrFunction}
                        </div>
                      </div>
                      <span className="px-1.5 py-0.5 rounded bg-[#c2410c] text-[#fdba74] text-[9px] font-black shrink-0">
                        RACI {(actor.raciRoles || ['R']).join('/')}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleSimulateActorScan(actor.name, 'BADGE_QR')}
                        className="px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-[9.5px] font-extrabold cursor-pointer"
                      >
                        Scanner QR Badge
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSimulateActorScan(actor.name, 'BARCODE_1D')}
                        className="px-2 py-1 rounded bg-[#c2410c] hover:bg-[#9a3412] text-[#fdba74] text-[9.5px] font-extrabold cursor-pointer"
                      >
                        Scanner Code-Barres ({actor.matricule})
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSimulateActorScan(actor.name, 'VCARD_QR')}
                        className="px-2 py-1 rounded bg-orange-100 hover:bg-orange-200 text-[#c2410c] text-[9.5px] font-extrabold cursor-pointer"
                      >
                        Scanner QR Carte vCard
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Test de rejet sur un acteur non-interne */}
              {nonInternalActors.length > 0 && (
                <div className="pt-2 border-t border-orange-200 dark:border-slate-700">
                  <div className="text-[10px] font-bold text-slate-500 mb-1.5">
                    {isEn
                      ? 'Test Security Restriction (Non-Internal Categories):'
                      : 'Tester le contrôle de sécurité sur les autres catégories (Rejet Badge Interne) :'}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {nonInternalActors.slice(0, 3).map(extAct => (
                      <button
                        key={extAct.id}
                        type="button"
                        onClick={() =>
                          handleSimulateActorScan(extAct.name, 'BARCODE_1D')
                        }
                        className="px-2 py-1 rounded bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-900 text-[9.5px] font-bold cursor-pointer"
                      >
                        Tester {extAct.name.slice(0, 22)}... ({extAct.category})
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT COLUMN (7 cols) : FICHE D'IDENTIFICATION VÉRIFIÉE */}
          <div className="lg:col-span-7 flex flex-col justify-between space-y-4">
            {verificationResult ? (
              <div
                className={`rounded-2xl border-2 overflow-hidden shadow-xl transition-all ${
                  verificationResult.isInternalAuthenticated
                    ? 'border-emerald-500 bg-white dark:bg-slate-900'
                    : 'border-rose-500 bg-white dark:bg-slate-900'
                }`}
              >
                {/* BANDEAU DE STATUT D'AUTHENTIFICATION */}
                <div
                  className={`p-4 text-white flex items-center justify-between gap-3 ${
                    verificationResult.isInternalAuthenticated
                      ? 'bg-gradient-to-r from-emerald-700 via-emerald-600 to-teal-600'
                      : 'bg-gradient-to-r from-rose-700 via-rose-600 to-amber-700'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-white/15 border border-white/30 flex items-center justify-center shrink-0">
                      {verificationResult.isInternalAuthenticated ? (
                        <ShieldCheck className="w-7 h-7 text-white" />
                      ) : (
                        <ShieldAlert className="w-7 h-7 text-white" />
                      )}
                    </div>
                    <div>
                      <div className="text-[10px] font-black uppercase tracking-widest text-white/90">
                        {verificationResult.scanType === 'VCARD_QR'
                          ? 'LECTURE QR CODE VCARD 3.0 (CARTE DE VISITE)'
                          : verificationResult.scanType === 'BARCODE_1D'
                          ? 'LECTURE CODE-BARRES 1D (NORME CODE-128)'
                          : 'LECTURE QR CODE BADGE D’ACCÈS CR80'}
                      </div>
                      <h3 className="text-sm sm:text-base font-black uppercase tracking-tight text-white">
                        {isEn
                          ? verificationResult.statusMessageEn
                          : verificationResult.statusMessageFr}
                      </h3>
                    </div>
                  </div>

                  <span className="px-2.5 py-1 rounded-full bg-white text-slate-900 text-[10px] font-black uppercase shrink-0">
                    Catégorie : {verificationResult.category}
                  </span>
                </div>

                {/* CORPS DE LA FICHE D'IDENTIFICATION VÉRIFIÉE */}
                <div className="p-4 sm:p-5 space-y-4">
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-2">
                    <CheckCircle2
                      className={`w-4 h-4 shrink-0 ${
                        verificationResult.isInternalAuthenticated
                          ? 'text-emerald-600'
                          : 'text-rose-600'
                      }`}
                    />
                    <span>
                      {isEn
                        ? verificationResult.securityDetailEn
                        : verificationResult.securityDetailFr}
                    </span>
                  </div>

                  {/* IDENTITÉ + PHOTO + APERÇU OPTIQUE DU CODE SCANNÉ */}
                  <div className="flex flex-col sm:flex-row items-start justify-between gap-4 p-4 rounded-xl bg-orange-50/60 dark:bg-slate-800/50 border border-orange-200 dark:border-slate-700">
                    <div className="flex items-start gap-3.5 min-w-0 flex-1">
                      {verificationResult.photoDataUrl ? (
                        <img
                          src={verificationResult.photoDataUrl}
                          alt={verificationResult.actorName}
                          className="w-20 h-24 object-cover rounded-xl border-2 border-[#c2410c] shadow-md shrink-0"
                        />
                      ) : (
                        <div className="w-20 h-24 rounded-xl bg-[#c2410c] text-[#fdba74] border-2 border-[#ea580c] flex flex-col items-center justify-center shrink-0 shadow-md">
                          <UserCheck className="w-8 h-8 mb-1" />
                          <span className="text-[9px] font-black uppercase">
                            {verificationResult.category}
                          </span>
                        </div>
                      )}

                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#c2410c] text-[#fdba74] text-[9.5px] font-black uppercase">
                          <span>Matricule : {verificationResult.matricule}</span>
                          <span>•</span>
                          <span>RACI : {verificationResult.raciRoles}</span>
                        </div>
                        <h4 className="text-base sm:text-lg font-black uppercase text-[#c2410c] dark:text-white leading-tight break-words">
                          {verificationResult.actorName}
                        </h4>
                        <div className="text-xs font-extrabold text-[#ea580c] dark:text-[#fdba74] break-words">
                          {verificationResult.roleOrFunction}
                        </div>
                        <div className="text-[11px] font-bold text-slate-600 dark:text-slate-300 flex items-center gap-1.5 pt-0.5">
                          <Building2 className="w-3.5 h-3.5 text-[#ea580c] shrink-0" />
                          <span className="break-words">
                            {verificationResult.organization} — {verificationResult.department}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Rendu du QR et du Code-Barres associés */}
                    <div className="flex flex-col items-center gap-2 p-2.5 rounded-xl bg-white border border-slate-200 shadow-xs shrink-0 self-center sm:self-start">
                      <ScannableQrCodeSvg
                        value={verificationResult.rawPayload}
                        size={72}
                        fgColor="#c2410c"
                      />
                      <ScannableCode128BarcodeSvg
                        value={verificationResult.matricule}
                        width={110}
                        height={22}
                        showText={true}
                      />
                    </div>
                  </div>

                  {/* GRILLE DE RATTACHEMENT HIÉRARCHIQUE (PROGRAMME -> AXE -> PROJET) & DROITS D'ACCÈS */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 space-y-1">
                      <div className="text-[9.5px] font-black uppercase text-slate-400 flex items-center gap-1">
                        <Briefcase className="w-3 h-3 text-[#ea580c]" />
                        <span>Programme de Rattachement</span>
                      </div>
                      <div className="font-extrabold text-[#c2410c] dark:text-[#fdba74] break-words">
                        {verificationResult.programmeName}
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 space-y-1">
                      <div className="text-[9.5px] font-black uppercase text-slate-400 flex items-center gap-1">
                        <Layers className="w-3 h-3 text-[#ea580c]" />
                        <span>Axe Stratégique & Projet</span>
                      </div>
                      <div className="font-bold text-slate-800 dark:text-slate-100 break-words">
                        {verificationResult.axeName} • {verificationResult.projectName}
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 space-y-1">
                      <div className="text-[9.5px] font-black uppercase text-slate-400 flex items-center gap-1">
                        <ShieldCheck className="w-3 h-3 text-emerald-600" />
                        <span>Droits d’Accès & Niveau d’Habilitation</span>
                      </div>
                      <div
                        className={`font-black ${
                          verificationResult.isInternalAuthenticated
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-rose-600'
                        }`}
                      >
                        {verificationResult.accreditationLevel}
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 space-y-1">
                      <div className="text-[9.5px] font-black uppercase text-slate-400 flex items-center gap-1">
                        <Clock className="w-3 h-3 text-[#ea580c]" />
                        <span>Validité du Badge & Infos Médicales</span>
                      </div>
                      <div className="font-bold text-slate-800 dark:text-slate-100">
                        Expire le :{' '}
                        <span className="text-emerald-700 dark:text-emerald-400 font-black">
                          {verificationResult.badgeValidity}
                        </span>{' '}
                        • Groupe Sanguin :{' '}
                        <span className="text-rose-600 font-black">
                          {verificationResult.bloodType}
                        </span>
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 space-y-1.5 sm:col-span-2">
                      <div className="text-[9.5px] font-black uppercase text-slate-400">
                        Coordonnées Complètes de l’Acteur (Carte de Visite & Répertoire Téléphonique)
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] font-bold text-slate-700 dark:text-slate-200">
                        <span className="inline-flex items-center gap-1">
                          <Phone className="w-3.5 h-3.5 text-[#ea580c]" />
                          <span>Mobile : {verificationResult.phone || verificationResult.emergencyPhone}</span>
                        </span>
                        {verificationResult.phoneWork && (
                          <span className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-300">
                            <Phone className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Bureau : {verificationResult.phoneWork}</span>
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1">
                          <Mail className="w-3.5 h-3.5 text-[#ea580c]" />
                          <span>{verificationResult.email || '—'}</span>
                        </span>
                        <span className="text-rose-600 dark:text-rose-400">
                          Urgence : {verificationResult.emergencyPhone}
                        </span>
                      </div>
                      {(verificationResult.address || verificationResult.website) && (
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10.5px] font-semibold text-slate-600 dark:text-slate-300 pt-1 border-t border-slate-200/70 dark:border-slate-700/70">
                          {verificationResult.address && (
                            <span>📍 Siège / Adresse : {verificationResult.address}</span>
                          )}
                          {verificationResult.website && (
                            <span>🌐 Site Web : {verificationResult.website}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {contactSavedNotice && (
                    <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-400 text-emerald-900 text-xs font-bold flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>{contactSavedNotice}</span>
                    </div>
                  )}

                  {/* BOUTONS D'ACTION SUR LA FICHE VÉRIFIÉE */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
                    <button
                      type="button"
                      onClick={handleDownloadScannedVcf}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black cursor-pointer shadow-sm"
                    >
                      <Download className="w-4 h-4" />
                      <span>
                        {isEn
                          ? 'Save to Phone Contacts (.vcf)'
                          : 'Enregistrer dans le Contact Téléphonique (.vcf)'}
                      </span>
                    </button>

                    {verificationResult.isInternalAuthenticated &&
                      onOpenInternalActorModal && (
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            onOpenInternalActorModal(verificationResult.actorName);
                          }}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#c2410c] hover:bg-[#9a3412] text-[#fdba74] text-xs font-black cursor-pointer shadow-sm"
                        >
                          <CreditCard className="w-4 h-4" />
                          <span>
                            {isEn
                              ? 'Open Internal Profile (CV, Card & Badge)'
                              : 'Ouvrir Fiche Interne (Carte, Badge & 2 CVs)'}
                          </span>
                        </button>
                      )}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};
