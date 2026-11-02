import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  X,
  CreditCard,
  FileText,
  UserCheck,
  Building2,
  Phone,
  Mail,
  MapPin,
  Award,
  Sparkles,
  Printer,
  Copy,
  Download,
  Check,
  ImagePlus,
  Trash2,
  ShieldCheck,
  Camera,
  Eye,
  ExternalLink,
  QrCode,
  CheckCircle2,
  Clock,
  Layers,
  ChevronRight,
  FileCheck
} from 'lucide-react';
import {
  InternalActorProfile,
  UserProfile,
  Dossier,
  LanguageCode,
  CurrencyCode,
  CustomDocFields,
  InstitutionalDocType
} from '../types';
import { safeJsonParse, isSafeImageDataUrl } from '../securityUtils';
import {
  buildInstitutionalDocPages,
  buildDynamicFieldsFromAppTabs,
  StructuredA4Page
} from '../docTemplates';
import {
  generateInstitutionalDocumentPDF,
  generateBusinessCardPDF,
  generateProfessionalBadgePDF
} from '../pdfExport';
import { saveProgramFile } from '../services/exportStorage';
import {
  defaultCustomDocsData,
  resolveInternalOnlyActorsForDossier,
  loadActorProfilesFromIDB,
  saveActorProfilesToIDB
} from '../db';
import { AppLogo } from './AppLogo';
import {
  buildBusinessCardVCardPayload,
  buildBadgeQrPayload
} from '../qrAndBarcodeUtils';
import {
  ScannableQrCodeSvg,
  ScannableCode128BarcodeSvg
} from './QrAndBarcodeSvg';
import { QrBarcodeScannerModal } from './QrBarcodeScannerModal';


interface InternalActorProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialActorName?: string;
  allActorsList: string[];
  raciContextInfo?: {
    rList: string[];
    aList: string[];
    cList: string[];
    iList: string[];
  };
  dossier: Dossier;
  userProfile: UserProfile;
  language: LanguageCode;
  currency?: CurrencyCode;
  executingOrgName: string;
  executingDepartment: string;
  companyLogoDefaultUrl?: string;
  onApplyToDoc: (
    docType: InstitutionalDocType,
    fields: Partial<CustomDocFields>
  ) => void;
  onSelectDocType?: (docType: InstitutionalDocType) => void;
  onUpdateUserProfile?: (profile: UserProfile) => void;
}

type TabType = 'business_card' | 'badge_pro' | 'cv_executif' | 'cv_detaille';
type ViewSubMode = 'split' | 'form' | 'preview';

export const InternalActorProfileModal: React.FC<InternalActorProfileModalProps> = ({
  isOpen,
  onClose,
  initialActorName,
  allActorsList,
  raciContextInfo,
  dossier,
  userProfile,
  language,
  currency = 'FCFA',
  executingOrgName,
  executingDepartment,
  companyLogoDefaultUrl,
  onApplyToDoc,
  onSelectDocType,
  onUpdateUserProfile
}) => {
  const isEn = language === 'EN';

  // Restriction stricte aux seuls Acteurs de la Catégorie « Interne » + Utilisateur principal connecté
  const internalOnlyActorsSet = useMemo(() => {
    const internalActors = resolveInternalOnlyActorsForDossier(
      dossier,
      userProfile
    );
    const set = new Set<string>();
    if (userProfile.fullName) {
      set.add(userProfile.fullName.trim().toLowerCase());
    }
    internalActors.forEach(a => {
      if (a.name) set.add(a.name.trim().toLowerCase());
    });
    return set;
  }, [dossier, userProfile]);

  // Liste consolidée des acteurs sélectionnables (EXCLUSIVEMENT « Interne » + Utilisateur principal)
  const consolidatedActors = useMemo(() => {
    const list: string[] = [];
    const defaultName = userProfile.fullName || 'Profil Utilisateur';
    list.push(defaultName);

    // Ajouter d'abord les acteurs internes issus de l'onglet Catégorie
    const internalFromDossier = resolveInternalOnlyActorsForDossier(
      dossier,
      userProfile
    );
    internalFromDossier.forEach(item => {
      if (item.name && !list.includes(item.name)) {
        list.push(item.name);
      }
    });

    // Filtrer allActorsList pour n'accepter que les acteurs classés « Interne »
    allActorsList.forEach(act => {
      if (
        act &&
        !list.includes(act) &&
        internalOnlyActorsSet.has(act.trim().toLowerCase())
      ) {
        list.push(act);
      }
    });
    return list;
  }, [userProfile, dossier, allActorsList, internalOnlyActorsSet]);

  const [selectedActor, setSelectedActor] = useState<string>(() => {
    if (
      initialActorName &&
      internalOnlyActorsSet.has(initialActorName.trim().toLowerCase())
    ) {
      return initialActorName;
    }
    return userProfile.fullName || consolidatedActors[0] || 'Coordonnateur';
  });

  const [activeTab, setActiveTab] = useState<TabType>('business_card');
  const [cvExecViewMode, setCvExecViewMode] = useState<ViewSubMode>('split');
  const [cvDetailViewMode, setCvDetailViewMode] = useState<ViewSubMode>('split');
  const [cvDetailPageIdx, setCvDetailPageIdx] = useState<number>(0);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scannerPayload, setScannerPayload] = useState<string | undefined>(
    undefined
  );
  const cardPrintRef = useRef<HTMLDivElement>(null);
  const badgePrintRef = useRef<HTMLDivElement>(null);

  // Storage key
  const storageKey = `faab_plan_internal_actors_${dossier.id}`;


  // Helper pour déduire le badge de rôle RACI
  const getActorRaciBadge = (name: string): string => {
    if (!raciContextInfo) return 'R';
    const roles: string[] = [];
    if (raciContextInfo.rList.includes(name)) roles.push('R');
    if (raciContextInfo.aList.includes(name)) roles.push('A');
    if (raciContextInfo.cList.includes(name)) roles.push('C');
    if (raciContextInfo.iList.includes(name)) roles.push('I');
    return roles.length > 0 ? roles.join('/') : 'R';
  };

  // Helper pour initialiser un profil par défaut pour un acteur
  const createDefaultProfileForActor = (name: string): InternalActorProfile => {
    const isDefaultUser = name === userProfile.fullName;
    const raciBadge = getActorRaciBadge(name);

    let defaultRole = 'Expert & Responsable Opérationnel';
    if (raciBadge.includes('A')) defaultRole = 'Autorité d’Approbation & Direction Pilote';
    else if (raciBadge.includes('R')) defaultRole = 'Responsable de Mise en Œuvre & Coordination Opérationnelle';
    else if (raciBadge.includes('C')) defaultRole = 'Expert Conseiller & Spécialiste Métier';
    else if (raciBadge.includes('I')) defaultRole = 'Point Focal Institutionnel & Chargé de Reporting';

    const baseOrg = executingOrgName || userProfile.institution || 'Organisation Pilote du Programme';
    const baseDept = executingDepartment || 'Direction du Pilotage Stratégique & PMO';

    if (isDefaultUser) {
      return {
        id: name,
        actorName: name,
        isInternalPilotActor: true,
        executingOrgName: baseOrg,
        executingDepartment: baseDept,
        serviceUnit: 'Unité de Gestion du Programme (UGP / PMO)',
        employeeId: 'MAT-PILOTE-001',
        officialRole: userProfile.role || defaultRole,
        raciRoleBadge: raciBadge,
        fullName: userProfile.fullName,
        nationality: userProfile.nationality || 'Ivoirienne',
        birthDate: userProfile.birthDate || '14/05/1984',
        residenceCity: userProfile.residenceCity || 'Abidjan, Côte d’Ivoire',
        phonePro: userProfile.phone || '+225 27 20 00 00 00',
        phoneMobile: userProfile.phone || '+225 07 48 08 27 39',
        emailPro: userProfile.email || 'coordination.pmo@programme-pilote.org',
        websiteUrl: 'www.programme-pilote.org',
        linkedInUrl: userProfile.linkedIn || 'linkedin.com/in/expert-programme',
        officeAddress: 'Immeuble du Gouvernement / Siège du Programme, Tour C, 8ème étage',
        photoDataUrl: userProfile.cvPhotoDataUrl || '',
        companyLogoDataUrl: companyLogoDefaultUrl || '',

        businessCardSlogan: 'Excellence Opérationnelle, Rigueur Fiduciaire & Gestion Axée sur les Résultats (GAR)',
        businessCardAccreditation: 'Accrédité PMO & Conduite de Programme International',

        badgeValidityDate: '31/12/2026',
        badgeBloodType: 'O+',
        badgeEmergencyPhone: '+225 07 48 08 27 39',

        cvExecPitch: userProfile.cvExecutivePitch ||
          'Directeur de Programme International et Expert Senior certifié en Ingénierie de Projet, ordonnancement PERT/CPM et Suivi-Évaluation (GAR / OCDE-CAD / UNEG). Solide expérience dans l’encadrement technique d’équipes pluridisciplinaires et le dialogue avec les bailleurs.',
        cvExecYearsExp: userProfile.yearsExperience || '+15 ans d’expérience',
        cvExecKeySkills: userProfile.cvKeySkills ||
          'Ingénierie de Projet & PMO (WBS, PERT/CPM, EVM) | Suivi-Évaluation & GAR | Gouvernance, Fiduciaire & Marchés Publics | Négociation Institutionnelle',
        cvExecMajorMissions: userProfile.cvMajorExperiences ||
          `Pilotage stratégique et coordination opérationnelle du portefeuille « ${dossier.name} ». Supervision des activités WBS sur le chemin critique, contrôle des engagements budgétaires et validation des livrables contractuels.`,
        cvExecEducation: userProfile.cvEducationDiplomas ||
          'Master Exécutif en Ingénierie de Projets & Économie du Développement (Mention Très Bien)',
        cvExecCertifications: userProfile.cvCertifications ||
          'Project Management Professional (PMP® - PMI) · Lead ISO 21500:2021 · Certificat International en GAR (PNUD)',
        cvExecLanguagesTools: `${userProfile.cvLanguages || 'Français (C2), Anglais (C1)'} | ${userProfile.cvSoftwareTools || 'faab gar, MS Project, Power BI'}`,
        cvExecAvailability: userProfile.cvAvailability || 'Disponibilité immédiate pour la conduite du programme',

        cvDetailQualificationsSummary:
          'Expertise internationale approfondie dans la conduite opérationnelle de programmes d’envergure financés par les bailleurs multilatéraux (Banque Mondiale, BAD, Union Européenne, PNUD). Maîtrise éprouvée des procédures de passation de marchés, du cadre de mesure de rendement et de la gestion des risques RAID.',
        cvDetailCompleteEducation: userProfile.cvEducationDiplomas ||
          'Doctorat / Master Exécutif en Sciences de Gestion, Planification Stratégique et Ingénierie des Projets — Université Félix Houphouët-Boigny / Institut International de Management.',
        cvDetailCertifications: userProfile.cvCertifications ||
          'Project Management Professional (PMP®) · Lead Manager ISO 21500 · Spécialiste Certifié en Passation des Marchés et Gestion Fiduciaire Banque Mondiale.',
        cvDetailCountriesDonors: userProfile.cvCountriesAndDonors ||
          'Côte d’Ivoire, Sénégal, Bénin, Burkina Faso, Togo, Cameroun, RDC | Banque Mondiale, BAD, Union Européenne, PNUD, AFD, KFW.',
        cvDetailProjectHistory: userProfile.cvMajorExperiences ||
          `2023–2026 : Coordonnateur Général — Programme « ${dossier.name} » (Budget : 4.5 Mds FCFA). Ordonnancement PERT/CPM, sécurisation du chemin critique et reporting trimestriel.\n2018–2022 : Chef de Mission — Projet d’Appui Institutionnel BAD (Budget : 12 M USD) : Mise en œuvre du cadre logique et validation de 100% des jalons.`,
        cvDetailPublications: userProfile.cvPublicationsAffiliations ||
          'Guide méthodologique sur l’ordonnancement PERT/CPM dans les projets publics en Afrique de l’Ouest (2023) · Membre titulaire du PMI et de l’Association Ouest-Africaine d’Évaluation.',
        cvDetailLanguagesMatrix: 'Français (Langue maternelle C2) | Anglais (Courant professionnel C1) | Espagnol (Opérationnel B1)',
        cvDetailSoftwareTools: userProfile.cvSoftwareTools || 'faab gar, MS Project, Primavera P6, Power BI, SPSS, KoboToolbox, ERP SAP',
        cvDetailReferences: userProfile.cvReferences ||
          'M. le Secrétaire Général du Ministère de Tutelle (sg@ministere.gouv.ci) · Directeur des Opérations Banque Mondiale Région Afrique de l’Ouest (operations@worldbank.org).',
        cvDetailHonorAttestation:
          'Je soussigné certifie sur l’honneur l’exactitude et la véracité des informations professionnelles consignées dans le présent document.'
      };
    }

    return {
      id: name,
      actorName: name,
      isInternalPilotActor: true,
      executingOrgName: baseOrg,
      executingDepartment: baseDept,
      serviceUnit: 'Unité de Gestion Opérationnelle (UGP)',
      employeeId: `MAT-${name.slice(0, 3).toUpperCase()}-2026`,
      officialRole: defaultRole,
      raciRoleBadge: raciBadge,
      fullName: name,
      nationality: 'Ivoirienne',
      birthDate: '15/06/1986',
      residenceCity: 'Abidjan, Côte d’Ivoire',
      phonePro: '+225 27 20 00 12 34',
      phoneMobile: '+225 07 00 00 00 00',
      emailPro: `${name.toLowerCase().replace(/\s+/g, '.')}@organisme-pilote.ci`,
      websiteUrl: 'www.organisme-pilote.ci',
      linkedInUrl: `linkedin.com/in/${name.toLowerCase().replace(/\s+/g, '-')}`,
      officeAddress: 'Siège de l’Organisme Pilote, Bâtiment Administratif, Bureau 402',
      photoDataUrl: '',
      companyLogoDataUrl: companyLogoDefaultUrl || '',

      businessCardSlogan: 'Pilotage Rigoureux, Intégrité Institutionnelle & Performance Durable',
      businessCardAccreditation: 'Membre Titulaire de l’Équipe Projet de l’Organisme Pilote',

      badgeValidityDate: '31/12/2026',
      badgeBloodType: 'A+',
      badgeEmergencyPhone: '+225 27 20 00 12 34',

      cvExecPitch: `Expert interne de l’organisme pilote mobilisé sur le Programme « ${dossier.name} ». Spécialiste des livrables opérationnels, de l’animation des ateliers techniques et de la sécurisation des jalons contractuels.`,
      cvExecYearsExp: '+10 ans d’expérience',
      cvExecKeySkills: 'Coordination Opérationnelle | Gestion de Livrables WBS | Suivi-Évaluation Terrain | Contrôle Qualité | Reporting Partenaires',
      cvExecMajorMissions: `Mise en œuvre des activités assignées sous le code RACI [${raciBadge}] pour le portefeuille « ${dossier.name} ». Respect scrupuleux des délais, contrôle qualité des livrables et gestion des points de blocage.`,
      cvExecEducation: 'Diplôme d’Ingénieur / Master en Gestion de Projet ou Spécialité Sectorielle',
      cvExecCertifications: 'Certifications professionnelles en gestion de projet et conformité environnementale/sociale',
      cvExecLanguagesTools: 'Français (C2), Anglais (B2) | Pack Office, faab gar, MS Project',
      cvExecAvailability: 'Mobilisation à temps plein au sein de la structure pilote',

      cvDetailQualificationsSummary: `Parcours professionnel confirmé au sein de l’organisme pilote avec un historique rigoureux d’exécution des projets publics et multilatéraux. Compétences éprouvées dans le suivi technique d'exécution et la conformité contractuelle.`,
      cvDetailCompleteEducation: 'Diplôme Universitaire Supérieur (Bac+5) délivré par une grande école ou université reconnue.',
      cvDetailCertifications: 'Formations qualifiantes en gestion axée sur les résultats et passation de marchés publics.',
      cvDetailCountriesDonors: 'Interventions nationales et sous-régionales avec les partenaires institutionnels et bailleurs de fonds.',
      cvDetailProjectHistory: `Contribution majeure aux projets du programme « ${dossier.name} » sous l’autorité de la Direction Pilote. Coordination des équipes de terrain et validation des réceptions techniques.`,
      cvDetailPublications: 'Rapports techniques d’évaluation, fiches de suivi d’activités et notes de synthèse opérationnelle.',
      cvDetailLanguagesMatrix: 'Français (Lu C2, Écrit C2, Parlé C2) | Anglais (Lu B2, Écrit B2, Parlé B2)',
      cvDetailSoftwareTools: 'Logiciels de gestion de projets, tableaux de bord de suivi, outils bureautiques avancés',
      cvDetailReferences: 'Direction des Ressources Humaines & Direction Opérationnelle de l’Organisme Pilote.',
      cvDetailHonorAttestation: 'Je certifie sur l’honneur que les informations mentionnées ci-dessus sont rigoureusement exactes.'
    };
  };

  // State des profils par acteur (persisté dans IndexedDB par Programme)
  const [profilesMap, setProfilesMap] = useState<Record<string, InternalActorProfile>>(() => {
    if (dossier.actorProfiles && Object.keys(dossier.actorProfiles).length > 0) {
      return dossier.actorProfiles;
    }
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        return safeJsonParse(stored, {});
      }
    } catch {
      // ignore
    }
    return {};
  });

  useEffect(() => {
    let mounted = true;
    loadActorProfilesFromIDB(dossier.id).then(loaded => {
      if (mounted && loaded && Object.keys(loaded).length > 0) {
        setProfilesMap(prev => ({ ...loaded, ...prev }));
      }
    });
    return () => {
      mounted = false;
    };
  }, [dossier.id]);

  // Current active profile
  const currentProfile: InternalActorProfile = useMemo(() => {
    if (profilesMap[selectedActor]) {
      return profilesMap[selectedActor];
    }
    return createDefaultProfileForActor(selectedActor);
  }, [profilesMap, selectedActor, userProfile, raciContextInfo, executingOrgName, executingDepartment, companyLogoDefaultUrl]);

  // Synchronisation lors de changement de initialActorName (uniquement si Interne)
  useEffect(() => {
    if (
      initialActorName &&
      initialActorName !== selectedActor &&
      internalOnlyActorsSet.has(initialActorName.trim().toLowerCase())
    ) {
      setSelectedActor(initialActorName);
    }
  }, [initialActorName, internalOnlyActorsSet]);

  const updateCurrentProfile = (updater: Partial<InternalActorProfile>) => {
    setProfilesMap(prev => {
      const updated = {
        ...prev,
        [selectedActor]: {
          ...currentProfile,
          ...updater
        }
      };
      saveActorProfilesToIDB(dossier.id, updated);
      return updated;
    });
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3200);
  };

  const handleSaveProfile = () => {
    try {
      const updated = {
        ...profilesMap,
        [selectedActor]: currentProfile
      };
      saveActorProfilesToIDB(dossier.id, updated);
      setProfilesMap(updated);

      if (selectedActor === userProfile.fullName && onUpdateUserProfile) {
        onUpdateUserProfile({
          ...userProfile,
          role: currentProfile.officialRole,
          phone: currentProfile.phonePro || userProfile.phone,
          email: currentProfile.emailPro || userProfile.email,
          institution: currentProfile.executingOrgName || userProfile.institution,
          cvExecutivePitch: currentProfile.cvExecPitch || userProfile.cvExecutivePitch,
          cvKeySkills: currentProfile.cvExecKeySkills || userProfile.cvKeySkills,
          cvMajorExperiences: currentProfile.cvExecMajorMissions || userProfile.cvMajorExperiences,
          cvEducationDiplomas: currentProfile.cvExecEducation || userProfile.cvEducationDiplomas,
          cvCertifications: currentProfile.cvExecCertifications || userProfile.cvCertifications,
          cvPhotoDataUrl: currentProfile.photoDataUrl || userProfile.cvPhotoDataUrl
        });
      }

      showToast(isEn ? '✓ Profile saved in IndexedDB!' : '✓ Fiche membre interne enregistrée dans IndexedDB !');
    } catch {
      showToast(isEn ? 'Error saving profile' : 'Erreur lors de l’enregistrement');
    }
  };

  const handleResetCurrentProfile = () => {
    setProfilesMap(prev => {
      const copy = { ...prev };
      delete copy[selectedActor];
      saveActorProfilesToIDB(dossier.id, copy);
      return copy;
    });
    showToast(isEn ? 'Values reset to defaults' : 'Valeurs réinitialisées avec succès');
  };


  // Helper pour logo effectif de l'entreprise
  const effectiveCompanyLogo = currentProfile.companyLogoDataUrl || companyLogoDefaultUrl || '';

  // Upload du logo de l'entreprise
  const handleCompanyLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      showToast(isEn ? 'Image file too large (max 8 MB)' : 'Fichier image trop volumineux (max 8 Mo)');
      return;
    }
    const reader = new FileReader();
    reader.onload = ev => {
      const dataUrl = ev.target?.result as string;
      if (dataUrl && isSafeImageDataUrl(dataUrl)) {
        updateCurrentProfile({ companyLogoDataUrl: dataUrl });
        showToast(isEn ? 'Company logo updated' : 'Logo de l’entreprise mis à jour avec succès');
      } else {
        showToast(isEn ? 'Unsupported or unsafe image format' : 'Format d’image non autorisé ou invalide');
      }
    };
    reader.readAsDataURL(file);
  };

  // Upload de la photo du collaborateur
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      showToast(isEn ? 'Photo file too large (max 8 MB)' : 'Photo trop volumineuse (max 8 Mo)');
      return;
    }
    const reader = new FileReader();
    reader.onload = ev => {
      const dataUrl = ev.target?.result as string;
      if (dataUrl && isSafeImageDataUrl(dataUrl)) {
        updateCurrentProfile({ photoDataUrl: dataUrl });
        showToast(isEn ? 'Member photo updated' : 'Photo du collaborateur mise à jour avec succès');
      } else {
        showToast(isEn ? 'Unsupported or unsafe photo format' : 'Format de photo non autorisé ou invalide');
      }
    };
    reader.readAsDataURL(file);
  };

  // Injection dans le Document 12 (CV Exécutif)
  const handleApplyToCvExecutif = (andOpenDoc = false) => {
    const repLine = `${currentProfile.fullName.toUpperCase()} | ${currentProfile.officialRole} (${currentProfile.cvExecYearsExp || '10+ ans'})${currentProfile.birthDate ? ` · Né(e) le ${currentProfile.birthDate}` : ''} | Tél : ${currentProfile.phonePro || currentProfile.phoneMobile} | Email : ${currentProfile.emailPro} | ${currentProfile.residenceCity} | Organisme Pilote : ${currentProfile.executingOrgName} | Nationalité : ${currentProfile.nationality || 'Ivoirienne'}`;

    onApplyToDoc('cv_executif', {
      recipientRepresentative: repLine,
      contextJustification: currentProfile.cvExecPitch || '',
      specificObjectives: currentProfile.cvExecKeySkills || '',
      methodologyApproach: currentProfile.cvExecMajorMissions || '',
      governanceModalities: `${currentProfile.cvExecEducation || ''}\n${currentProfile.cvExecCertifications || ''}`.trim(),
      confidentialityClauses: currentProfile.cvExecLanguagesTools || '',
      recommendationsLessons: currentProfile.cvExecAvailability || 'Disponibilité immédiate',
      profilePhotoDataUrl: currentProfile.photoDataUrl || ''
    });

    if (andOpenDoc && onSelectDocType) {
      onSelectDocType('cv_executif');
      onClose();
    } else {
      showToast(
        isEn
          ? `✓ Data injected into Document 12 (Executive CV) for ${currentProfile.fullName}!`
          : `✓ Données injectées dans le Document 12 (CV Exécutif) pour ${currentProfile.fullName} !`
      );
    }
  };

  // Injection dans le Document 13 (CV Détaillé)
  const handleApplyToCvDetaille = (andOpenDoc = false) => {
    const repLine = `${currentProfile.fullName.toUpperCase()} | Né(e) le ${currentProfile.birthDate || 'N/A'} | Nationalité : ${currentProfile.nationality || 'N/A'} | Résidence : ${currentProfile.residenceCity} | Tél : ${currentProfile.phonePro || currentProfile.phoneMobile} | Email : ${currentProfile.emailPro} | Poste proposé : ${currentProfile.officialRole} (${currentProfile.executingOrgName})`;

    onApplyToDoc('cv_detaille', {
      recipientRepresentative: repLine,
      contextJustification: currentProfile.cvDetailQualificationsSummary || currentProfile.cvExecPitch || '',
      specificObjectives: currentProfile.cvDetailCompleteEducation || currentProfile.cvExecEducation || '',
      methodologyApproach: currentProfile.cvDetailCertifications || currentProfile.cvExecCertifications || '',
      governanceModalities: currentProfile.cvDetailCountriesDonors || '',
      extraField1: currentProfile.cvDetailProjectHistory || currentProfile.cvExecMajorMissions || '',
      confidentialityClauses: currentProfile.cvDetailPublications || '',
      extraField2: currentProfile.cvDetailLanguagesMatrix || '',
      recommendationsLessons: `${currentProfile.cvDetailReferences || ''}\n\nAttestation : ${currentProfile.cvDetailHonorAttestation || ''}`.trim(),
      profilePhotoDataUrl: currentProfile.photoDataUrl || ''
    });

    if (andOpenDoc && onSelectDocType) {
      onSelectDocType('cv_detaille');
      onClose();
    } else {
      showToast(
        isEn
          ? `✓ Data injected into Document 13 (Detailed CV) for ${currentProfile.fullName}!`
          : `✓ Données injectées dans le Document 13 (CV Détaillé) pour ${currentProfile.fullName} !`
      );
    }
  };

  // Payloads dynamiques QR Code vCard 3.0 (Carte de Visite) et QR Code Badge d'Accès
  const activeVCardPayload = useMemo(
    () => buildBusinessCardVCardPayload(currentProfile, dossier),
    [currentProfile, dossier]
  );

  const activeBadgeQrPayload = useMemo(
    () => buildBadgeQrPayload(currentProfile, dossier),
    [currentProfile, dossier]
  );

  // Copie de la vCard textuelle
  const handleCopyVCard = () => {
    navigator.clipboard.writeText(activeVCardPayload).then(() => {
      setIsCopied(true);
      showToast(isEn ? '✓ Contact card copied!' : '✓ Coordonnées vCard 3.0 copiées dans le presse-papier !');
      setTimeout(() => setIsCopied(false), 2000);
    });
  };

  // Téléchargement du fichier .vcf dans le sous-dossier du programme actif + déclenchement de la fiche contact téléphonique
  const handleDownloadVcf = async () => {
    const fileName = `carte_visite_${currentProfile.fullName.replace(/\s+/g, '_').toLowerCase()}.vcf`;
    const res = await saveProgramFile({
      programName: dossier.name,
      fileName,
      content: activeVCardPayload,
      mimeType: 'text/vcard;charset=utf-8'
    });
    if (res.mode === 'directory') {
      try {
        const blob = new Blob([activeVCardPayload], { type: 'text/vcard;charset=utf-8' });
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
    showToast(
      isEn
        ? `✓ Phone contact (.vcf) ready & saved in: ${res.path}`
        : `✓ Contact téléphonique (.vcf) prêt et enregistré dans : ${res.path}`
    );
  };


  // Profil utilisateur virtualisé pour l'acteur interne actif (garantit 100% de concordance avec le générateur de documents)
  const actorUserProfile = useMemo<UserProfile>(() => {
    return {
      ...userProfile,
      fullName: currentProfile.fullName,
      role: currentProfile.officialRole,
      phone: currentProfile.phonePro || currentProfile.phoneMobile || userProfile.phone,
      email: currentProfile.emailPro || userProfile.email,
      institution: currentProfile.executingOrgName || userProfile.institution,
      residenceCity: currentProfile.residenceCity || userProfile.residenceCity,
      nationality: currentProfile.nationality || userProfile.nationality,
      birthDate: currentProfile.birthDate || userProfile.birthDate,
      linkedIn: currentProfile.linkedInUrl || userProfile.linkedIn,
      cvExecutivePitch: currentProfile.cvExecPitch || userProfile.cvExecutivePitch,
      cvKeySkills: currentProfile.cvExecKeySkills || userProfile.cvKeySkills,
      cvMajorExperiences: currentProfile.cvDetailProjectHistory || currentProfile.cvExecMajorMissions || userProfile.cvMajorExperiences,
      cvEducationDiplomas: currentProfile.cvDetailCompleteEducation || currentProfile.cvExecEducation || userProfile.cvEducationDiplomas,
      cvCertifications: currentProfile.cvDetailCertifications || currentProfile.cvExecCertifications || userProfile.cvCertifications,
      cvPhotoDataUrl: currentProfile.photoDataUrl || userProfile.cvPhotoDataUrl,
      cvCountriesAndDonors: currentProfile.cvDetailCountriesDonors || userProfile.cvCountriesAndDonors,
      cvSoftwareTools: currentProfile.cvDetailSoftwareTools || userProfile.cvSoftwareTools,
      cvLanguages: currentProfile.cvDetailLanguagesMatrix || userProfile.cvLanguages,
      cvPublicationsAffiliations: currentProfile.cvDetailPublications || userProfile.cvPublicationsAffiliations,
      cvReferences: currentProfile.cvDetailReferences || userProfile.cvReferences,
      cvAvailability: currentProfile.cvExecAvailability || userProfile.cvAvailability
    };
  }, [userProfile, currentProfile]);

  // Champs consolidés du CV Exécutif (Doc 12)
  const cvExecFields = useMemo<CustomDocFields>(() => {
    const baseDefaults = defaultCustomDocsData['cv_executif'] || {};
    const pureLive = buildDynamicFieldsFromAppTabs(
      'cv_executif',
      baseDefaults,
      dossier,
      actorUserProfile,
      currency,
      language
    );

    const repLine = `${currentProfile.fullName.toUpperCase()} | ${currentProfile.officialRole} (${currentProfile.cvExecYearsExp || '10+ ans'})${currentProfile.birthDate ? ` · Né(e) le ${currentProfile.birthDate}` : ''} | Tél : ${currentProfile.phonePro || currentProfile.phoneMobile} | Email : ${currentProfile.emailPro} | ${currentProfile.residenceCity} | Organisme Pilote : ${currentProfile.executingOrgName} | Nationalité : ${currentProfile.nationality || 'Ivoirienne'}`;

    return {
      ...baseDefaults,
      ...pureLive,
      referenceCode: currentProfile.employeeId
        ? `CV-EXEC-${currentProfile.employeeId}`
        : `CV-EXEC-${currentProfile.fullName.replace(/\s+/g, '-').toUpperCase().slice(0, 10)}-2026`,
      locationCity: currentProfile.residenceCity || 'Abidjan',
      recipientRepresentative: repLine,
      contextJustification: currentProfile.cvExecPitch || pureLive.contextJustification || '',
      specificObjectives: currentProfile.cvExecKeySkills || pureLive.specificObjectives || '',
      methodologyApproach: currentProfile.cvExecMajorMissions || pureLive.methodologyApproach || '',
      governanceModalities: `${currentProfile.cvExecEducation || ''}\n${currentProfile.cvExecCertifications || ''}`.trim() || pureLive.governanceModalities || '',
      confidentialityClauses: currentProfile.cvExecLanguagesTools || pureLive.confidentialityClauses || '',
      recommendationsLessons: currentProfile.cvExecAvailability || pureLive.recommendationsLessons || 'Disponibilité immédiate',
      profilePhotoDataUrl: currentProfile.photoDataUrl || actorUserProfile.cvPhotoDataUrl || undefined,
      rightLogoDataUrl: effectiveCompanyLogo || undefined,
      excludedFieldsJson: '[]'
    };
  }, [currentProfile, dossier, actorUserProfile, currency, language, effectiveCompanyLogo]);

  // Champs consolidés du CV Détaillé Bailleurs (Doc 13)
  const cvDetailFields = useMemo<CustomDocFields>(() => {
    const baseDefaults = defaultCustomDocsData['cv_detaille'] || {};
    const pureLive = buildDynamicFieldsFromAppTabs(
      'cv_detaille',
      baseDefaults,
      dossier,
      actorUserProfile,
      currency,
      language
    );

    const repLine = `${currentProfile.fullName.toUpperCase()} | Né(e) le ${currentProfile.birthDate || 'N/A'} | Nationalité : ${currentProfile.nationality || 'N/A'} | Résidence : ${currentProfile.residenceCity} | Tél : ${currentProfile.phonePro || currentProfile.phoneMobile} | Email : ${currentProfile.emailPro} | Poste proposé : ${currentProfile.officialRole} (${currentProfile.executingOrgName})`;

    return {
      ...baseDefaults,
      ...pureLive,
      referenceCode: currentProfile.employeeId
        ? `CV-DET-${currentProfile.employeeId}`
        : `CV-DET-${currentProfile.fullName.replace(/\s+/g, '-').toUpperCase().slice(0, 10)}-2026`,
      locationCity: currentProfile.residenceCity || 'Abidjan',
      recipientRepresentative: repLine,
      contextJustification: currentProfile.cvDetailQualificationsSummary || currentProfile.cvExecPitch || pureLive.contextJustification || '',
      specificObjectives: currentProfile.cvDetailCompleteEducation || currentProfile.cvExecEducation || pureLive.specificObjectives || '',
      methodologyApproach: currentProfile.cvDetailCertifications || currentProfile.cvExecCertifications || pureLive.methodologyApproach || '',
      governanceModalities: currentProfile.cvDetailCountriesDonors || pureLive.governanceModalities || '',
      extraField1: currentProfile.cvDetailProjectHistory || currentProfile.cvExecMajorMissions || pureLive.extraField1 || '',
      confidentialityClauses: currentProfile.cvDetailPublications || pureLive.confidentialityClauses || '',
      extraField2: currentProfile.cvDetailLanguagesMatrix || pureLive.extraField2 || '',
      recommendationsLessons: `${currentProfile.cvDetailReferences || ''}\n\nAttestation : ${currentProfile.cvDetailHonorAttestation || ''}`.trim() || pureLive.recommendationsLessons || '',
      profilePhotoDataUrl: currentProfile.photoDataUrl || actorUserProfile.cvPhotoDataUrl || undefined,
      rightLogoDataUrl: effectiveCompanyLogo || undefined,
      excludedFieldsJson: '[]'
    };
  }, [currentProfile, dossier, actorUserProfile, currency, language, effectiveCompanyLogo]);

  // Pages A4 identiques au générateur de documents
  const cvExecPages = useMemo(() => {
    return buildInstitutionalDocPages(
      'cv_executif',
      cvExecFields,
      dossier,
      actorUserProfile,
      currency,
      language
    );
  }, [cvExecFields, dossier, actorUserProfile, currency, language]);

  const cvDetailPages = useMemo(() => {
    return buildInstitutionalDocPages(
      'cv_detaille',
      cvDetailFields,
      dossier,
      actorUserProfile,
      currency,
      language
    );
  }, [cvDetailFields, dossier, actorUserProfile, currency, language]);

  // Téléchargement direct du PDF pour le CV Exécutif (Doc 12)
  const handleDownloadCvExecPdf = async () => {
    try {
      const res = await generateInstitutionalDocumentPDF(
        'cv_executif',
        cvExecFields,
        dossier,
        actorUserProfile,
        currency,
        language
      );
      showToast(
        isEn
          ? `✓ Executive CV (Doc 12) saved in: ${res.path}`
          : `✓ CV Exécutif (Doc 12) enregistré dans : ${res.path}`
      );
    } catch (err) {
      console.error('PDF error:', err);
      showToast(isEn ? 'PDF download error' : 'Erreur lors du téléchargement du PDF');
    }
  };

  // Téléchargement direct du PDF pour le CV Détaillé Bailleurs (Doc 13)
  const handleDownloadCvDetailPdf = async () => {
    try {
      const res = await generateInstitutionalDocumentPDF(
        'cv_detaille',
        cvDetailFields,
        dossier,
        actorUserProfile,
        currency,
        language
      );
      showToast(
        isEn
          ? `✓ Detailed CV (Doc 13) saved in: ${res.path}`
          : `✓ CV Détaillé (Doc 13) enregistré dans : ${res.path}`
      );
    } catch (err) {
      console.error('PDF error:', err);
      showToast(isEn ? 'PDF download error' : 'Erreur lors du téléchargement du PDF');
    }
  };

  // Impression / Téléchargement PDF direct de la Carte de Visite (85 x 55 mm — Papier A4 & Cartes PVC)
  const handlePrintBusinessCardPdf = async () => {
    try {
      const res = await generateBusinessCardPDF(
        currentProfile,
        dossier,
        effectiveCompanyLogo,
        language
      );
      showToast(
        isEn
          ? `✓ Business Card (Paper A4 & PVC 85×55mm) saved in: ${res.path}`
          : `✓ Carte de Visite (Papier A4 & PVC 85×55mm) enregistrée dans : ${res.path}`
      );
    } catch (err) {
      console.error('Business Card PDF error:', err);
      showToast(
        isEn
          ? 'Error generating Business Card PDF'
          : 'Erreur lors de la génération de la Carte de Visite'
      );
    }
  };

  // Impression / Téléchargement PDF direct du Badge Professionnel CR80 (54 x 86 mm — Papier A4 & Cartes PVC)
  const handlePrintBadgePdf = async () => {
    try {
      const res = await generateProfessionalBadgePDF(
        currentProfile,
        dossier,
        effectiveCompanyLogo,
        language
      );
      showToast(
        isEn
          ? `✓ Professional Badge (Paper A4 & PVC CR80 54×86mm) saved in: ${res.path}`
          : `✓ Badge Professionnel (Papier A4 & PVC CR80 54×86mm) enregistré dans : ${res.path}`
      );
    } catch (err) {
      console.error('Badge PDF error:', err);
      showToast(
        isEn
          ? 'Error generating Badge PDF'
          : 'Erreur lors de la génération du Badge Professionnel'
      );
    }
  };

  // Rendu universel d'une page A4 conforme au Générateur de Documents (0 débordement CV & Pied de page)
  const renderInstitutionalA4Page = (
    page: StructuredA4Page,
    pageIdx: number,
    totalPages: number,
    docFields: CustomDocFields,
    docConfigLabel: string
  ) => {
    return (
      <div
        key={pageIdx}
        style={{ padding: '1.15rem 1.25rem', minHeight: 'auto' }}
        className="a4-page flex flex-col justify-between overflow-hidden text-left mb-5 w-full max-w-[650px] shadow-xl bg-white border border-slate-300 rounded-xl box-border"
      >
        <div className="min-w-0 w-full overflow-hidden">
          {/* En-tête institutionnel */}
          <div className="border-b-2 border-[#c2410c] pb-2.5 mb-4 flex items-start justify-between gap-2.5 min-w-0 w-full">
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              {docFields.rightLogoDataUrl ? (
                <img
                  src={docFields.rightLogoDataUrl}
                  alt="Logo Agence d'Exécution"
                  className="w-10 h-10 object-contain rounded bg-white p-0.5 border border-slate-200 shrink-0"
                />
              ) : (
                <AppLogo className="w-10 h-10 shrink-0" />
              )}
              <div className="min-w-0 flex-1 overflow-hidden">
                <div className="text-[11px] font-black uppercase tracking-wider text-[#c2410c] leading-[1.2] break-words [overflow-wrap:anywhere]">
                  {page.pageTitle}
                </div>
                <div className="text-[9.5px] font-bold text-slate-600 leading-[1.3] break-words [overflow-wrap:anywhere] mt-0.5">
                  {page.pageSubtitle}
                </div>
              </div>
            </div>
            <div className="text-right text-[9.5px] font-bold text-slate-500 shrink-0 max-w-[130px] sm:max-w-[150px] break-words [overflow-wrap:anywhere]">
              <div className="font-extrabold text-[#c2410c] leading-tight">
                Réf: {docFields.referenceCode}
              </div>
              <div className="text-[#ea580c] leading-tight mt-0.5">
                {docFields.locationCity || 'Abidjan'}
              </div>
            </div>
          </div>

          {/* Sections de la page */}
          <div className="space-y-4 min-w-0 w-full">
            {page.sections.map((sec, sIdx) => (
              <div key={sIdx} className="space-y-2 min-w-0 w-full overflow-hidden">
                <h3 className="text-[10.5px] sm:text-[11px] font-black uppercase tracking-wider text-[#c2410c] bg-orange-50 px-2.5 py-1.5 rounded-lg border-l-4 border-[#ea580c] leading-[1.25] break-words [overflow-wrap:anywhere]">
                  {sec.heading}
                </h3>

                {/* Bandeau d'en-tête CV avec Photo (sans débordement) */}
                {sec.cvHeaderBanner && (
                  <div className="rounded-xl border-2 border-[#c2410c] bg-white p-3 sm:p-3.5 shadow-xs overflow-hidden w-full box-border">
                    <div className="flex flex-col sm:flex-row items-start justify-between gap-3 min-w-0 w-full">
                      <div className="flex-1 space-y-1.5 text-left min-w-0 w-full overflow-hidden">
                        <div className="inline-block max-w-full px-2 py-0.5 rounded-md bg-[#c2410c] text-[#fdba74] text-[8.5px] font-black uppercase tracking-wider break-words [overflow-wrap:anywhere] leading-snug">
                          {sec.cvHeaderBanner.docBadge}
                        </div>
                        <div className="text-sm sm:text-base font-black uppercase tracking-tight text-[#c2410c] leading-tight break-words [overflow-wrap:anywhere]">
                          {sec.cvHeaderBanner.fullNameUpper}
                        </div>
                        <div className="text-[11px] font-extrabold text-[#ea580c] leading-snug break-words [overflow-wrap:anywhere]">
                          {sec.cvHeaderBanner.expertTitleLine}
                        </div>
                        <div className="text-[10px] font-bold text-slate-700 leading-relaxed break-words [overflow-wrap:anywhere] pt-1 border-t border-slate-200">
                          {sec.cvHeaderBanner.contactLine}
                        </div>
                        {sec.cvHeaderBanner.metaSubLine && (
                          <div className="p-2 rounded-lg bg-orange-50/80 border border-orange-200 text-[9.5px] font-semibold text-slate-800 whitespace-pre-line break-words [overflow-wrap:anywhere] leading-snug">
                            {sec.cvHeaderBanner.metaSubLine}
                          </div>
                        )}
                      </div>

                      {sec.cvHeaderBanner.profilePhotoDataUrl && (
                        <div className="flex flex-col items-center sm:items-end justify-start shrink-0 self-center sm:self-start">
                          <div className="w-[96px] h-[124px] sm:w-[110px] sm:h-[142px] rounded-md border border-slate-300 bg-slate-50 overflow-hidden flex flex-col items-center justify-center shadow-2xs shrink-0 box-border">
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

                {/* Lignes Clé-Valeur */}
                {sec.keyValueRows && sec.keyValueRows.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 min-w-0">
                    {sec.keyValueRows.map(([k, v], kIdx) => {
                      const hasCurrency = /\b(FCFA|EUR|USD)\b/.test(v);
                      return (
                        <div
                          key={kIdx}
                          className="p-2 rounded-lg bg-slate-50 border border-slate-200 min-w-0 overflow-hidden"
                        >
                          <div className="text-[8.5px] font-bold uppercase text-slate-400 break-words [overflow-wrap:anywhere]">
                            {k}
                          </div>
                          <div
                            className={`text-[10px] font-extrabold mt-0.5 whitespace-normal break-words [overflow-wrap:anywhere] leading-[1.35] ${
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

                {/* Paragraphes */}
                {sec.paragraphs &&
                  sec.paragraphs.map((p, pIdx) => (
                    <p
                      key={pIdx}
                      className="text-[10.5px] leading-[1.45] text-slate-700 text-left sm:text-justify whitespace-pre-line break-words [overflow-wrap:anywhere] px-0.5 max-w-full"
                    >
                      {p}
                    </p>
                  ))}

                {/* Puces */}
                {sec.bullets && sec.bullets.length > 0 && (
                  <ul className="list-disc pl-4 space-y-1 text-[10.5px] leading-[1.45] text-slate-700 max-w-full overflow-hidden">
                    {sec.bullets.map((bItem, bIdx) => (
                      <li key={bIdx} className="leading-[1.45] break-words [overflow-wrap:anywhere]">
                        {bItem}
                      </li>
                    ))}
                  </ul>
                )}

                {/* Tableaux structurés */}
                {sec.table && (
                  <div className="pt-1 w-full overflow-hidden break-inside-avoid">
                    <table className="w-full table-fixed border-collapse text-[8px] sm:text-[8.5px] leading-[1.35]">
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
                                className={`px-1.5 py-1 font-black uppercase border border-[#c2410c] break-words [overflow-wrap:anywhere] leading-[1.2] align-middle ${
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
                                    className={`px-1.5 py-1 border border-slate-200 whitespace-pre-line break-words [overflow-wrap:anywhere] align-top ${
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

            {/* Bloc de Signatures */}
            {page.isSignaturePage && (
              <div className="mt-4 pt-3 border-t-2 border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs break-inside-avoid min-w-0">
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5 min-w-0 overflow-hidden">
                  <div className="font-black uppercase text-[#c2410c] text-[9.5px] break-words [overflow-wrap:anywhere]">
                    POUR L’ORGANISATION ({actorUserProfile.institution || 'AUTORITÉ PILOTE'})
                  </div>
                  <div className="text-[10.5px] font-bold text-slate-800 break-words [overflow-wrap:anywhere]">
                    {actorUserProfile.fullName} — {actorUserProfile.role}
                  </div>
                  {page.orgStampDataUrl && (
                    <div className="py-1">
                      <img
                        src={page.orgStampDataUrl}
                        alt="Signature et Cachet Organisation"
                        className="max-h-14 w-auto object-contain rounded bg-white p-1 border border-slate-200"
                      />
                    </div>
                  )}
                  <div className="text-[9.5px] text-slate-500 pt-1 break-words">
                    Signature & Cachet Officiel : ___________________
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5 min-w-0 overflow-hidden">
                  <div className="font-black uppercase text-[#c2410c] text-[9.5px] break-words [overflow-wrap:anywhere]">
                    POUR LA PARTIE PRENANTE ({docFields.recipientOrg || 'PARTENAIRE'})
                  </div>
                  <div className="text-[10.5px] font-bold text-slate-800 break-words [overflow-wrap:anywhere]">
                    {docFields.recipientRepresentative || 'Représentant Habilité'}
                  </div>
                  {page.partnerStampDataUrl && (
                    <div className="py-1">
                      <img
                        src={page.partnerStampDataUrl}
                        alt="Signature et Cachet Partenaire"
                        className="max-h-14 w-auto object-contain rounded bg-white p-1 border border-slate-200"
                      />
                    </div>
                  )}
                  <div className="text-[9.5px] text-slate-500 pt-1 break-words">
                    Signature (« Lu et approuvé ») : ___________________
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Pied de page officiel A4 (Zéro débordement) */}
        <div className="mt-5 pt-2.5 border-t border-slate-200 grid grid-cols-[1fr_auto] items-center gap-2 text-[8.5px] sm:text-[9px] font-bold text-slate-500 w-full min-w-0 overflow-hidden">
          <div className="min-w-0 break-words [overflow-wrap:anywhere] leading-snug text-left">
            <span className="font-extrabold text-slate-700">faab gar</span> • {docConfigLabel} (
            <span className="text-[#c2410c] font-extrabold">{docFields.referenceCode}</span>) •{' '}
            {actorUserProfile.institution || 'Usage Institutionnel'}
          </div>
          <span className="px-2 py-0.5 rounded bg-orange-50 border border-orange-200 text-[#c2410c] font-black text-[8.5px] sm:text-[9px] shrink-0 whitespace-nowrap">
            Page {pageIdx + 1} / {totalPages}
          </span>
        </div>
      </div>
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-2 sm:p-4 overflow-y-auto">
      <div className="relative w-full max-w-6xl bg-white dark:bg-slate-900 rounded-2xl border-2 border-[#fdba74] shadow-2xl overflow-hidden flex flex-col max-h-[95vh]">
        {/* TOAST FLOTTANT */}
        {toastMessage && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl bg-emerald-600 text-white font-extrabold text-xs shadow-xl flex items-center gap-2 animate-bounce">
            <CheckCircle2 className="w-4 h-4 text-emerald-200" />
            <span>{toastMessage}</span>
          </div>
        )}

        {/* EN-TÊTE PRINCIPAL DE LA MODALE */}
        <div className="bg-gradient-to-r from-[#c2410c] via-[#9a3412] to-[#ea580c] p-3 sm:p-4 text-white flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-6 h-6 text-[#fdba74]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-md bg-[#fdba74] text-[#c2410c] text-[9.5px] font-black uppercase tracking-wider">
                  Organisme Pilote du Programme
                </span>
                <span className="text-[10px] text-orange-200 font-bold hidden sm:inline">
                  • {dossier.name}
                </span>
              </div>
              <h2 className="text-base sm:text-lg font-black uppercase tracking-tight text-white leading-tight">
                Fiche Acteur Interne : Carte de Visite, Badge & 2 Modèles de CV
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setScannerPayload(
                  activeTab === 'business_card'
                    ? activeVCardPayload
                    : activeBadgeQrPayload
                );
                setIsScannerOpen(true);
              }}
              className="px-3 py-1.5 rounded-lg bg-[#fdba74] hover:bg-orange-200 text-[#c2410c] text-xs font-black shadow-sm transition-all cursor-pointer flex items-center gap-1.5"
              title="Ouvrir le lecteur/scanner QR Code & Code-Barres"
            >
              <QrCode className="w-3.5 h-3.5" />
              <span>{isEn ? 'Scan QR / Barcode' : 'Scanner QR & Code-Barres'}</span>
            </button>
            <button
              type="button"
              onClick={handleSaveProfile}
              className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-black shadow-sm transition-all cursor-pointer flex items-center gap-1.5"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{isEn ? 'Save' : 'Enregistrer'}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
              title={isEn ? 'Close' : 'Fermer'}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>


        {/* BANDEAU SÉLECTEUR D'ACTEUR & STATUT D'ANCRAGE */}
        <div className="p-3 bg-orange-50/80 dark:bg-slate-800/80 border-b border-orange-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs font-black uppercase text-[#c2410c] dark:text-[#fdba74] flex items-center gap-1.5">
              <UserCheck className="w-4 h-4 text-[#ea580c]" />
              <span>{isEn ? 'Select Actor / Member:' : 'Sélectionner l’acteur / membre :'}</span>
            </label>
            <div className="flex items-center gap-1 bg-white dark:bg-slate-900 border border-orange-300 dark:border-slate-600 rounded-lg p-0.5">
              <select
                value={selectedActor}
                onChange={e => setSelectedActor(e.target.value)}
                className="px-2.5 py-1 text-xs font-bold bg-transparent text-slate-800 dark:text-slate-100 focus:outline-none cursor-pointer"
              >
                {consolidatedActors.map(name => {
                  const badge = getActorRaciBadge(name);
                  const isDefault = name === userProfile.fullName;
                  return (
                    <option key={name} value={name} className="dark:bg-slate-900 text-slate-900 dark:text-white">
                      {isDefault ? '★ ' : '• '} {name} [{badge}] {isDefault ? '(Profil par défaut)' : ''}
                    </option>
                  );
                })}
              </select>
            </div>

            <label className="inline-flex items-center gap-2 ml-2 px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={currentProfile.isInternalPilotActor}
                onChange={e =>
                  updateCurrentProfile({ isInternalPilotActor: e.target.checked })
                }
                className="rounded border-slate-300 text-[#c2410c] focus:ring-[#fdba74]"
              />
              <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200">
                {isEn
                  ? 'Internal member of piloting entity'
                  : 'Membre interne de l’organisme qui pilote le programme'}
              </span>
            </label>
          </div>

          {/* Quick buttons */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleResetCurrentProfile}
              className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-[10.5px] font-bold transition-colors cursor-pointer"
              title={isEn ? 'Reset fields' : 'Réinitialiser les champs'}
            >
              {isEn ? 'Reset' : 'Réinitialiser'}
            </button>
          </div>
        </div>

        {/* 4 ONGLETS DE LA FICHE */}
        <div className="flex border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-2 sm:px-4 shrink-0 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('business_card')}
            className={`inline-flex items-center gap-2 px-3 sm:px-4 py-2.5 text-xs font-black uppercase tracking-wider border-b-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'business_card'
                ? 'border-[#ea580c] text-[#c2410c] dark:text-[#fdba74] bg-white dark:bg-slate-900 shadow-sm'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <CreditCard className="w-4 h-4 text-[#ea580c]" />
            <span>{isEn ? '1. Business Card' : '1. Carte de Visite Pro'}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('badge_pro')}
            className={`inline-flex items-center gap-2 px-3 sm:px-4 py-2.5 text-xs font-black uppercase tracking-wider border-b-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'badge_pro'
                ? 'border-[#ea580c] text-[#c2410c] dark:text-[#fdba74] bg-white dark:bg-slate-900 shadow-sm'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <ShieldCheck className="w-4 h-4 text-orange-600" />
            <span>{isEn ? '2. Professional Badge' : '2. Badge Professionnel (Photo)'}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('cv_executif')}
            className={`inline-flex items-center gap-2 px-3 sm:px-4 py-2.5 text-xs font-black uppercase tracking-wider border-b-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'cv_executif'
                ? 'border-[#ea580c] text-[#c2410c] dark:text-[#fdba74] bg-white dark:bg-slate-900 shadow-sm'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <FileText className="w-4 h-4 text-emerald-600" />
            <span>{isEn ? '3. Executive CV (Doc 12)' : '3. CV Exécutif (Doc 12 — 1 Page)'}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('cv_detaille')}
            className={`inline-flex items-center gap-2 px-3 sm:px-4 py-2.5 text-xs font-black uppercase tracking-wider border-b-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'cv_detaille'
                ? 'border-[#ea580c] text-[#c2410c] dark:text-[#fdba74] bg-white dark:bg-slate-900 shadow-sm'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Award className="w-4 h-4 text-purple-600" />
            <span>{isEn ? '4. Detailed CV (Doc 13)' : '4. CV Détaillé Bailleurs (Doc 13 — 4 Pages)'}</span>
          </button>
        </div>

        {/* CORPS DE CONTENU PAR ONGLET */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {/* ========================================================================= */}
          {/* ONGLET 1 : CARTE DE VISITE PROFESSIONNELLE (AVEC LOGO ENTREPRISE INSÉRÉ) */}
          {/* ========================================================================= */}
          {activeTab === 'business_card' && (
            <div className="space-y-5">
              <div className="p-3 rounded-xl bg-orange-50/70 dark:bg-slate-800/70 border border-[#fdba74]/60 text-xs text-slate-700 dark:text-slate-300 flex items-start gap-2.5">
                <ShieldCheck className="w-5 h-5 text-[#ea580c] shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-bold text-[#c2410c] dark:text-[#fdba74]">
                    {isEn
                      ? 'Official Business Card of the Piloting Entity with Company Logo'
                      : 'Carte de Visite Professionnelle Officielle avec Logo de l’Entreprise Inséré'}
                  </p>
                  <p className="text-[11px] leading-relaxed">
                    {isEn
                      ? `Renseignez les champs institutionnels et insérez le logo de l'entreprise pour générer la carte de visite de ${currentProfile.fullName} (85 mm × 55 mm standard).`
                      : `Renseignez les champs institutionnels et importez le logo de l’entreprise pour afficher la carte de visite de ${currentProfile.fullName} aux normes internationales (85 mm × 55 mm) avec export vCard.`}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                {/* Formulaire de configuration */}
                <div className="lg:col-span-6 space-y-3.5 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                  <h3 className="text-xs font-black uppercase text-[#c2410c] dark:text-[#fdba74] flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-[#ea580c]" />
                    <span>{isEn ? 'Institutional & Contact Fields' : 'Champs Institutionnels & Logo Entreprise'}</span>
                  </h3>

                  {/* SECTION IMPORTATION DU LOGO DE L'ENTREPRISE */}
                  <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border-2 border-dashed border-[#ea580c]/50 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-[#ea580c]" />
                        <span className="text-[11px] font-black uppercase text-[#c2410c] dark:text-[#fdba74]">
                          Logo Officiel de l’Entreprise / Organisme Pilote
                        </span>
                      </div>
                      <label className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#c2410c] hover:bg-[#9a3412] text-white text-[10px] font-bold cursor-pointer transition-colors">
                        <ImagePlus className="w-3 h-3 text-[#fdba74]" />
                        <span>{effectiveCompanyLogo ? 'Remplacer logo' : 'Importer le logo'}</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleCompanyLogoUpload}
                          className="hidden"
                        />
                      </label>
                    </div>

                    {effectiveCompanyLogo ? (
                      <div className="flex items-center justify-between gap-3 p-2 rounded-lg bg-orange-50 dark:bg-slate-800 border border-orange-200 dark:border-slate-700">
                        <div className="flex items-center gap-3">
                          <img
                            src={effectiveCompanyLogo}
                            alt="Logo de l'entreprise"
                            className="h-10 max-w-[130px] object-contain rounded bg-white p-1 border border-slate-200"
                          />
                          <div className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400">
                            ✓ Logo actif inséré sur les cartes de visite et le badge
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => updateCurrentProfile({ companyLogoDataUrl: '' })}
                          className="p-1 rounded bg-rose-50 text-rose-600 hover:bg-rose-100 cursor-pointer"
                          title="Supprimer le logo"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <p className="text-[10px] text-slate-500 italic">
                        Aucun logo inséré. Cliquez sur « Importer le logo » pour afficher le blason de l’entreprise sur la carte et le badge.
                      </p>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <label className="block text-[10.5px] font-black uppercase text-slate-600 dark:text-slate-300 mb-1">
                        {isEn ? 'Full Name & Surname' : 'Nom & Prénom du Membre'}
                      </label>
                      <input
                        type="text"
                        value={currentProfile.fullName}
                        onChange={e => updateCurrentProfile({ fullName: e.target.value })}
                        className="w-full px-3 py-1.5 text-xs font-bold rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600"
                      />
                    </div>

                    <div className="col-span-2">
                      <label className="block text-[10.5px] font-black uppercase text-slate-600 dark:text-slate-300 mb-1">
                        {isEn ? 'Official Title in Piloting Entity' : 'Titre Officiel / Fonction au sein de l’Organisme Pilote'}
                      </label>
                      <input
                        type="text"
                        value={currentProfile.officialRole}
                        onChange={e => updateCurrentProfile({ officialRole: e.target.value })}
                        className="w-full px-3 py-1.5 text-xs font-bold rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600"
                        placeholder="Ex: Coordonnateur Général de l’UGP / Chef de Projet"
                      />
                    </div>

                    <div>
                      <label className="block text-[10.5px] font-black uppercase text-slate-600 dark:text-slate-300 mb-1">
                        {isEn ? 'Piloting Entity Name' : 'Nom de l’Organisme Pilote'}
                      </label>
                      <input
                        type="text"
                        value={currentProfile.executingOrgName}
                        onChange={e => updateCurrentProfile({ executingOrgName: e.target.value })}
                        className="w-full px-3 py-1.5 text-xs font-semibold rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600"
                      />
                    </div>

                    <div>
                      <label className="block text-[10.5px] font-black uppercase text-slate-600 dark:text-slate-300 mb-1">
                        {isEn ? 'Department / Direction' : 'Direction / Département Pilote'}
                      </label>
                      <input
                        type="text"
                        value={currentProfile.executingDepartment}
                        onChange={e => updateCurrentProfile({ executingDepartment: e.target.value })}
                        className="w-full px-3 py-1.5 text-xs font-semibold rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600"
                      />
                    </div>

                    <div>
                      <label className="block text-[10.5px] font-black uppercase text-slate-600 dark:text-slate-300 mb-1">
                        {isEn ? 'Service / Project Unit' : 'Pôle / Unité de Gestion (UGP)'}
                      </label>
                      <input
                        type="text"
                        value={currentProfile.serviceUnit || ''}
                        onChange={e => updateCurrentProfile({ serviceUnit: e.target.value })}
                        className="w-full px-3 py-1.5 text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600"
                        placeholder="Ex: Unité de Coordination PMO"
                      />
                    </div>

                    <div>
                      <label className="block text-[10.5px] font-black uppercase text-slate-600 dark:text-slate-300 mb-1">
                        {isEn ? 'Internal ID / Registration' : 'Matricule Interne / Réf. Agent'}
                      </label>
                      <input
                        type="text"
                        value={currentProfile.employeeId || ''}
                        onChange={e => updateCurrentProfile({ employeeId: e.target.value })}
                        className="w-full px-3 py-1.5 text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600"
                        placeholder="Ex: MAT-PILOTE-2026-08"
                      />
                    </div>

                    <div>
                      <label className="block text-[10.5px] font-black uppercase text-slate-600 dark:text-slate-300 mb-1">
                        {isEn ? 'Direct Line' : 'Téléphone Fixe Professionnel'}
                      </label>
                      <input
                        type="text"
                        value={currentProfile.phonePro || ''}
                        onChange={e => updateCurrentProfile({ phonePro: e.target.value })}
                        className="w-full px-3 py-1.5 text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600"
                        placeholder="+225 27 20 00 00 00"
                      />
                    </div>

                    <div>
                      <label className="block text-[10.5px] font-black uppercase text-slate-600 dark:text-slate-300 mb-1">
                        {isEn ? 'Mobile / WhatsApp' : 'Mobile / WhatsApp'}
                      </label>
                      <input
                        type="text"
                        value={currentProfile.phoneMobile || ''}
                        onChange={e => updateCurrentProfile({ phoneMobile: e.target.value })}
                        className="w-full px-3 py-1.5 text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600"
                        placeholder="+225 07 48 08 27 39"
                      />
                    </div>

                    <div className="col-span-2">
                      <label className="block text-[10.5px] font-black uppercase text-slate-600 dark:text-slate-300 mb-1">
                        {isEn ? 'Institutional Email' : 'Email Professionnel Institutionnel'}
                      </label>
                      <input
                        type="email"
                        value={currentProfile.emailPro || ''}
                        onChange={e => updateCurrentProfile({ emailPro: e.target.value })}
                        className="w-full px-3 py-1.5 text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600"
                        placeholder="nom.prenom@organisme-pilote.ci"
                      />
                    </div>

                    <div className="col-span-2">
                      <label className="block text-[10.5px] font-black uppercase text-slate-600 dark:text-slate-300 mb-1">
                        {isEn ? 'Office / Physical Address' : 'Bureau Physique / Siège & Localisation'}
                      </label>
                      <input
                        type="text"
                        value={currentProfile.officeAddress || ''}
                        onChange={e => updateCurrentProfile({ officeAddress: e.target.value })}
                        className="w-full px-3 py-1.5 text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600"
                        placeholder="Immeuble Administratif, Tour C, 8ème étage"
                      />
                    </div>

                    <div className="col-span-2">
                      <label className="block text-[10.5px] font-black uppercase text-slate-600 dark:text-slate-300 mb-1">
                        {isEn ? 'Institutional Motto / Slogan' : 'Devise / Slogan Institutionnel sur la Carte'}
                      </label>
                      <input
                        type="text"
                        value={currentProfile.businessCardSlogan || ''}
                        onChange={e => updateCurrentProfile({ businessCardSlogan: e.target.value })}
                        className="w-full px-3 py-1.5 text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600"
                        placeholder="Excellence Opérationnelle & Gestion Axée sur les Résultats"
                      />
                    </div>
                  </div>
                </div>

                {/* Visualisation interactive Haute Fidélité de la Carte (Recto & Verso avec Logo) */}
                <div className="lg:col-span-6 space-y-4 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-black uppercase text-[#c2410c] dark:text-[#fdba74] flex items-center gap-1.5">
                        <CreditCard className="w-4 h-4 text-[#ea580c]" />
                        <span>{isEn ? 'Live Preview — Standard 85 x 55 mm' : 'Aperçu Direct — Format Standard 85 x 55 mm'}</span>
                      </span>
                      <span className="px-2 py-0.5 rounded bg-orange-100 dark:bg-orange-950/60 text-[#c2410c] dark:text-[#fdba74] text-[9.5px] font-extrabold uppercase">
                        Recto & Verso avec Logo
                      </span>
                    </div>

                    <div ref={cardPrintRef} className="space-y-3.5 flex flex-col items-center">
                      {/* RECTO AVEC LOGO DE L'ENTREPRISE */}
                      <div className="w-full max-w-[420px] aspect-[85/55] rounded-xl bg-gradient-to-br from-[#c2410c] via-[#9a3412] to-[#c2410c] text-white p-3.5 shadow-xl border border-orange-300/40 relative overflow-hidden flex flex-col justify-between">
                        <div className="absolute -right-12 -top-12 w-40 h-40 rounded-full bg-white/5 pointer-events-none" />
                        <div className="absolute right-10 -bottom-10 w-32 h-32 rounded-full bg-[#fdba74]/10 pointer-events-none" />

                        {/* En-tête de la carte avec LOGO DE L'ENTREPRISE */}
                        <div className="flex items-start justify-between gap-2 relative z-10">
                          <div className="flex items-center gap-2 min-w-0">
                            {effectiveCompanyLogo ? (
                              <img
                                src={effectiveCompanyLogo}
                                alt="Logo Entreprise"
                                className="h-9 max-w-[85px] object-contain rounded bg-white p-0.5 border border-white/40 shrink-0 shadow-xs"
                              />
                            ) : (
                              <div className="h-8 w-8 rounded bg-white/15 border border-white/30 flex items-center justify-center shrink-0">
                                <Building2 className="w-4 h-4 text-[#fdba74]" />
                              </div>
                            )}
                            <div className="min-w-0">
                              <div className="text-[8.5px] font-black uppercase tracking-wider text-[#fdba74] truncate max-w-[210px]">
                                {currentProfile.executingOrgName || 'ORGANISME PILOTE'}
                              </div>
                              <div className="text-[7px] font-bold text-orange-100/90 truncate max-w-[210px]">
                                {currentProfile.executingDepartment}
                              </div>
                            </div>
                          </div>
                          <span className="px-1.5 py-0.5 rounded bg-white/15 border border-white/25 text-[7px] font-black uppercase text-[#fdba74] shrink-0">
                            RACI: {currentProfile.raciRoleBadge || 'R'}
                          </span>
                        </div>

                        {/* Corps central : Nom et rôle */}
                        <div className="my-auto relative z-10 py-1 min-w-0">
                          <h4 className="text-xs sm:text-sm font-black uppercase tracking-tight text-white leading-tight drop-shadow-sm truncate">
                            {currentProfile.fullName}
                          </h4>
                          <div className="text-[8.5px] sm:text-[9.5px] font-extrabold text-[#fdba74] leading-snug truncate">
                            {currentProfile.officialRole}
                          </div>
                          {currentProfile.serviceUnit && (
                            <div className="text-[7px] sm:text-[7.5px] text-orange-200 font-medium truncate">
                              {currentProfile.serviceUnit}
                            </div>
                          )}
                        </div>

                        {/* Coordonnées en bas */}
                        <div className="pt-1.5 border-t border-orange-400/30 grid grid-cols-2 gap-x-2 gap-y-0.5 text-[7.5px] text-orange-100 relative z-10 font-semibold">
                          <div className="truncate flex items-center gap-1">
                            <Phone className="w-2.5 h-2.5 text-[#fdba74] shrink-0" />
                            <span>{currentProfile.phonePro || currentProfile.phoneMobile || 'Tél: N/A'}</span>
                          </div>
                          <div className="truncate flex items-center gap-1">
                            <Mail className="w-2.5 h-2.5 text-[#fdba74] shrink-0" />
                            <span>{currentProfile.emailPro || 'email@programme.org'}</span>
                          </div>
                          <div className="truncate col-span-2 flex items-center gap-1">
                            <MapPin className="w-2.5 h-2.5 text-[#fdba74] shrink-0" />
                            <span>{currentProfile.officeAddress || currentProfile.residenceCity}</span>
                          </div>
                        </div>
                      </div>

                      {/* VERSO AVEC LOGO ET QR CODE */}
                      <div className="w-full max-w-[420px] aspect-[85/55] rounded-xl bg-slate-900 text-white p-3.5 shadow-xl border border-slate-700 relative overflow-hidden flex flex-col justify-between items-center text-center">
                        <div className="absolute inset-0 bg-gradient-to-tr from-[#c2410c]/40 via-transparent to-[#ea580c]/20 pointer-events-none" />

                        <div className="w-full flex items-center justify-between gap-2 text-[7px] font-black uppercase tracking-widest text-[#fdba74] relative z-10 min-w-0">
                          <span className="shrink-0">{currentProfile.employeeId || 'MAT-2026-PILOTE'}</span>
                          <span className="truncate">PROGRAMME : {dossier.name}</span>
                        </div>

                        {/* Logo d'entreprise centré + QR Code Universel vCard 3.0 */}
                        <div className="flex items-center justify-center gap-2.5 sm:gap-3.5 relative z-10 my-auto w-full min-w-0">
                          <div
                            className="p-1.5 rounded-lg bg-white shadow-md shrink-0 cursor-pointer hover:ring-2 hover:ring-emerald-400 transition-all"
                            onClick={() => {
                              setScannerPayload(activeVCardPayload);
                              setIsScannerOpen(true);
                            }}
                            title="QR Code vCard 3.0 (Scannable par téléphone ou cliquer pour ouvrir le lecteur et enregistrer le contact)"
                          >
                            <ScannableQrCodeSvg
                              value={activeVCardPayload}
                              size={74}
                              fgColor="#c2410c"
                              bgColor="#ffffff"
                            />
                          </div>

                          <div className="text-left space-y-1 min-w-0 flex-1">
                            {effectiveCompanyLogo && (
                              <img
                                src={effectiveCompanyLogo}
                                alt="Logo"
                                className="h-6 w-auto max-w-[90px] object-contain rounded bg-white p-0.5"
                              />
                            )}
                            <div className="text-[8px] sm:text-[8.5px] font-black uppercase text-white truncate">
                              {currentProfile.executingOrgName}
                            </div>
                            <div className="text-[7px] sm:text-[7.5px] italic text-[#fdba74] leading-snug line-clamp-2 break-words">
                              « {currentProfile.businessCardSlogan || 'Excellence Opérationnelle & Rigueur'} »
                            </div>
                            <div className="text-[6.5px] text-emerald-300 font-bold truncate">
                              QR vCard 3.0 : Scan → Ajout direct aux Contacts
                            </div>
                          </div>
                        </div>

                        <div className="text-[6.5px] sm:text-[7px] text-slate-400 border-t border-slate-800 w-full pt-1 truncate">
                          {currentProfile.websiteUrl || 'www.programme-pilote.org'} · Carte Officielle d’Accréditation (Catégorie : Interne)
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Actions sur la carte */}
                  <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                    <button
                      type="button"
                      onClick={handlePrintBusinessCardPdf}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#c2410c] hover:bg-[#9a3412] text-white text-xs font-bold transition-colors cursor-pointer shadow-xs"
                    >
                      <Printer className="w-3.5 h-3.5 text-[#fdba74]" />
                      <span>
                        {isEn
                          ? 'Download & Print Card (Paper A4 & PVC 85×55mm)'
                          : 'Télécharger & Imprimer Carte (Papier A4 & PVC 85×55mm)'}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setScannerPayload(activeVCardPayload);
                        setIsScannerOpen(true);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors cursor-pointer shadow-xs"
                    >
                      <QrCode className="w-3.5 h-3.5" />
                      <span>{isEn ? 'Scan QR vCard' : 'Scanner le QR vCard'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleCopyVCard}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 hover:bg-slate-100 text-xs font-bold transition-colors cursor-pointer"
                    >
                      {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{isCopied ? 'Copié !' : 'Copier vCard'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleDownloadVcf}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-50 dark:bg-slate-800 border border-orange-300 dark:border-slate-700 text-[#c2410c] dark:text-[#fdba74] hover:bg-orange-100 text-xs font-bold transition-colors cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>
                        {isEn
                          ? 'Save to Phone Contacts (.vcf)'
                          : 'Enregistrer dans le Contact Téléphonique (.vcf)'}
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}


          {/* ========================================================================= */}
          {/* ONGLET 2 : BADGE PROFESSIONNEL (FORMAT 54x86 MM AVEC PHOTO & LOGO)       */}
          {/* ========================================================================= */}
          {activeTab === 'badge_pro' && (
            <div className="space-y-5">
              <div className="p-3 rounded-xl bg-orange-50/70 dark:bg-slate-800/70 border border-[#fdba74]/60 text-xs text-slate-700 dark:text-slate-300 flex items-start gap-2.5">
                <ShieldCheck className="w-5 h-5 text-[#ea580c] shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-bold text-[#c2410c] dark:text-[#fdba74]">
                    {isEn
                      ? 'Official Professional Access Badge (CR80 Standard — 54 × 86 mm)'
                      : 'Badge Professionnel d’Accès & Accréditation (Format Standard CR80 — 54 × 86 mm)'}
                  </p>
                  <p className="text-[11px] leading-relaxed">
                    {isEn
                      ? 'Vertical professional access card with direct photo upload slot, company logo, security barcode and access level.'
                      : 'Badge d’identification officiel avec fente de lanière, logo de l’entreprise, zone d’insertion directe de la photo du collaborateur, code d’accès sécurisé et verso institutionnel.'}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                {/* Paramètres du Badge */}
                <div className="lg:col-span-5 space-y-3.5 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                  <h3 className="text-xs font-black uppercase text-[#c2410c] dark:text-[#fdba74] flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-[#ea580c]" />
                    <span>Paramètres du Badge & Sécurité</span>
                  </h3>

                  {/* Insérer la photo sur le badge */}
                  <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-black uppercase text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                        <Camera className="w-3.5 h-3.5 text-[#ea580c]" />
                        <span>Photo du Collaborateur sur le Badge</span>
                      </span>
                      <label className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-[#c2410c] hover:bg-[#9a3412] text-white text-[10px] font-bold cursor-pointer">
                        <ImagePlus className="w-3 h-3 text-[#fdba74]" />
                        <span>{currentProfile.photoDataUrl ? 'Changer' : 'Importer'}</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handlePhotoUpload}
                          className="hidden"
                        />
                      </label>
                    </div>

                    <div className="flex items-center gap-3">
                      {currentProfile.photoDataUrl ? (
                        <div className="relative group">
                          <img
                            src={currentProfile.photoDataUrl}
                            alt={currentProfile.fullName}
                            className="w-14 h-18 object-cover rounded-md border border-[#ea580c] shadow-xs"
                          />
                          <button
                            type="button"
                            onClick={() => updateCurrentProfile({ photoDataUrl: '' })}
                            className="absolute -top-1 -right-1 p-0.5 rounded-full bg-rose-600 text-white cursor-pointer"
                            title="Supprimer la photo"
                          >
                            <Trash2 className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="w-14 h-18 rounded-md bg-slate-100 dark:bg-slate-800 border-2 border-dashed border-slate-300 dark:border-slate-600 flex flex-col items-center justify-center text-slate-400 text-center p-1">
                          <Camera className="w-5 h-5 mb-0.5" />
                          <span className="text-[7px] font-bold">Sans photo</span>
                        </div>
                      )}
                      <div className="text-[10px] text-slate-600 dark:text-slate-400 leading-tight">
                        Vous pouvez aussi cliquer directement sur la zone photo du badge ci-contre pour charger votre portrait officiel.
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="block text-[10px] font-black uppercase text-slate-600 dark:text-slate-300 mb-1">
                        Validité du Badge
                      </label>
                      <input
                        type="text"
                        value={currentProfile.badgeValidityDate || '31/12/2026'}
                        onChange={e => updateCurrentProfile({ badgeValidityDate: e.target.value })}
                        className="w-full px-2.5 py-1.5 rounded bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-xs font-bold"
                        placeholder="31/12/2026"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-black uppercase text-slate-600 dark:text-slate-300 mb-1">
                        Groupe Sanguin
                      </label>
                      <input
                        type="text"
                        value={currentProfile.badgeBloodType || 'O+'}
                        onChange={e => updateCurrentProfile({ badgeBloodType: e.target.value })}
                        className="w-full px-2.5 py-1.5 rounded bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-xs font-bold"
                        placeholder="O+, A+, B+..."
                      />
                    </div>

                    <div className="col-span-2">
                      <label className="block text-[10px] font-black uppercase text-slate-600 dark:text-slate-300 mb-1">
                        Contact d’Urgence (Verso)
                      </label>
                      <input
                        type="text"
                        value={currentProfile.badgeEmergencyPhone || '+225 27 20 00 12 34'}
                        onChange={e => updateCurrentProfile({ badgeEmergencyPhone: e.target.value })}
                        className="w-full px-2.5 py-1.5 rounded bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-xs"
                        placeholder="+225 07 00 00 00 00"
                      />
                    </div>
                  </div>
                </div>

                {/* VISUALISATION HAUTE FIDÉLITÉ DU BADGE (FORMAT 54 x 86 mm) */}
                <div className="lg:col-span-7 space-y-4 flex flex-col items-center">
                  <div className="flex items-center justify-between w-full max-w-[560px]">
                    <span className="text-xs font-black uppercase text-[#c2410c] dark:text-[#fdba74] flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-[#ea580c]" />
                      <span>Rendu Réel Badge CR80 (54 × 86 mm) — Recto & Verso</span>
                    </span>
                    <span className="px-2 py-0.5 rounded bg-orange-100 text-[#c2410c] text-[9.5px] font-black uppercase">
                      Accès Sécurisé
                    </span>
                  </div>

                  <div ref={badgePrintRef} className="flex flex-wrap items-center justify-center gap-6">
                    {/* RECTO DU BADGE VERTICAL */}
                    <div className="w-[240px] h-[380px] rounded-2xl bg-white border-2 border-slate-300 dark:border-slate-700 shadow-2xl relative overflow-hidden flex flex-col justify-between p-3 text-slate-900 text-center">
                      {/* Fente cordon lanière */}
                      <div className="w-12 h-2.5 rounded-full bg-slate-200 dark:bg-slate-700 mx-auto border border-slate-300 shadow-inner mb-1" />

                      {/* Header Badge avec Logo Entreprise */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-center gap-2">
                          {effectiveCompanyLogo ? (
                            <img
                              src={effectiveCompanyLogo}
                              alt="Logo"
                              className="h-7 max-w-[80px] object-contain rounded bg-white p-0.5"
                            />
                          ) : (
                            <Building2 className="w-5 h-5 text-[#c2410c]" />
                          )}
                        </div>
                        <div className="text-[8.5px] font-black uppercase tracking-tight text-[#c2410c] truncate">
                          {currentProfile.executingOrgName || 'ORGANISME PILOTE'}
                        </div>
                        <div className="text-[7px] font-bold text-slate-500 uppercase tracking-widest">
                          CARTE D'IDENTIFICATION & D'ACCÈS
                        </div>
                      </div>

                      {/* Photo insérée directement sur le badge avec bouton de sélection */}
                      <div className="relative mx-auto my-1">
                        <label className="cursor-pointer block relative group">
                          {currentProfile.photoDataUrl ? (
                            <img
                              src={currentProfile.photoDataUrl}
                              alt={currentProfile.fullName}
                              className="w-20 h-24 object-cover rounded-lg border-2 border-[#c2410c] shadow-md mx-auto"
                            />
                          ) : (
                            <div className="w-20 h-24 rounded-lg bg-orange-50 border-2 border-dashed border-[#ea580c] flex flex-col items-center justify-center text-[#ea580c] p-1 mx-auto hover:bg-orange-100 transition-colors">
                              <Camera className="w-6 h-6 mb-1 text-[#ea580c]" />
                              <span className="text-[7.5px] font-black uppercase text-center leading-tight">
                                Insérer Photo
                              </span>
                            </div>
                          )}
                          <div className="absolute inset-0 bg-slate-900/50 rounded-lg opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center text-white text-[8px] font-bold transition-opacity">
                            <Camera className="w-4 h-4 mb-0.5" />
                            <span>Changer photo</span>
                          </div>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handlePhotoUpload}
                            className="hidden"
                          />
                        </label>
                      </div>

                      {/* Identité du collaborateur */}
                      <div className="space-y-0.5">
                        <h4 className="text-xs font-black uppercase text-[#c2410c] leading-tight truncate px-1">
                          {currentProfile.fullName}
                        </h4>
                        <div className="text-[8.5px] font-extrabold text-[#ea580c] leading-tight truncate px-1">
                          {currentProfile.officialRole}
                        </div>
                        <div className="inline-block px-2 py-0.5 rounded-full bg-[#c2410c] text-[#fdba74] text-[7px] font-black uppercase">
                          RÔLE RACI : {currentProfile.raciRoleBadge || 'R'} • {currentProfile.employeeId || 'MAT-001'}
                        </div>
                      </div>

                      {/* Code-Barres 1D Standard CODE-128 & Bande inférieure */}
                      <div className="pt-1 border-t border-slate-200 space-y-1">
                        <div
                          className="flex justify-center items-center px-2 cursor-pointer"
                          onClick={() => {
                            setScannerPayload(
                              currentProfile.employeeId || 'MAT-PILOTE-001'
                            );
                            setIsScannerOpen(true);
                          }}
                          title="Code-Barres 1D CODE-128 Scannable (Cliquer pour vérifier avec le lecteur)"
                        >
                          <ScannableCode128BarcodeSvg
                            value={currentProfile.employeeId || 'MAT-PILOTE-001'}
                            width={195}
                            height={24}
                            showText={false}
                          />
                        </div>
                        <div className="flex items-center justify-between text-[6.5px] font-bold text-slate-500 uppercase px-1">
                          <span>ZONE A • ACCÈS TOTAL</span>
                          <span>VAL : {currentProfile.badgeValidityDate || '31/12/2026'}</span>
                        </div>
                      </div>
                    </div>

                    {/* VERSO DU BADGE VERTICAL */}
                    <div className="w-[240px] h-[380px] rounded-2xl bg-slate-900 border-2 border-slate-700 shadow-2xl relative overflow-hidden flex flex-col justify-between p-3 text-white text-center">
                      {/* Fente cordon lanière */}
                      <div className="w-12 h-2.5 rounded-full bg-slate-800 mx-auto border border-slate-700 shadow-inner mb-1" />

                      {/* Bande magnétique supérieure simulée */}
                      <div className="w-full h-8 bg-black -mx-3 mb-2 flex items-center justify-center">
                        <span className="text-[6.5px] font-mono tracking-widest text-slate-500">
                          MAGNETIC STRIPE • SECURE ACCESS SYSTEM
                        </span>
                      </div>

                      {/* Consignes de sécurité */}
                      <div className="space-y-1.5 text-[7px] text-slate-300 text-left px-1 leading-relaxed">
                        <p className="font-bold text-[#fdba74] uppercase">
                          CONSIGNES DE SÉCURITÉ & PROPRIÉTÉ :
                        </p>
                        <p>
                          Ce badge est la propriété exclusive de « {currentProfile.executingOrgName} ». Il est strictement personnel et doit être porté de manière visible dans les emprises du programme.
                        </p>
                        <p>
                          En cas de perte ou de découverte, prière de le rapporter au poste de sécurité ou de contacter le : {currentProfile.badgeEmergencyPhone || currentProfile.phonePro || '+225 27 20 00 12 34'}.
                        </p>
                      </div>

                      {/* Informations médicales et QR Code sécurité complet */}
                      <div className="p-1.5 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-between gap-2 text-left">
                        <div>
                          <div className="text-[6.5px] text-slate-400 uppercase">GROUPE SANGUIN :</div>
                          <div className="text-xs font-black text-rose-400">{currentProfile.badgeBloodType || 'O+'}</div>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-[6.5px] text-slate-400 uppercase">PROGRAMME :</div>
                          <div className="text-[8px] font-bold text-orange-200 truncate">{dossier.name}</div>
                          <div className="text-[6.5px] text-emerald-400 font-bold">Catégorie : Interne</div>
                        </div>
                        <div
                          className="p-1 rounded bg-white shrink-0 cursor-pointer hover:ring-2 hover:ring-emerald-400 transition-all"
                          onClick={() => {
                            setScannerPayload(activeBadgeQrPayload);
                            setIsScannerOpen(true);
                          }}
                          title="QR Code Complet du Badge (Cliquer pour scanner)"
                        >
                          <ScannableQrCodeSvg
                            value={activeBadgeQrPayload}
                            size={60}
                            fgColor="#0f172a"
                            bgColor="#ffffff"
                          />
                        </div>
                      </div>

                      <div className="text-[6.5px] text-slate-500 border-t border-slate-800 pt-1">
                        Direction de la Sécurité & des Ressources Humaines
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                    <button
                      type="button"
                      onClick={handlePrintBadgePdf}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#c2410c] hover:bg-[#9a3412] text-white text-xs font-bold transition-colors cursor-pointer shadow-xs"
                    >
                      <Printer className="w-3.5 h-3.5 text-[#fdba74]" />
                      <span>
                        {isEn
                          ? 'Download & Print Badge (Paper A4 & PVC CR80 54×86mm)'
                          : 'Télécharger & Imprimer Badge (Papier A4 & PVC CR80 54×86mm)'}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setScannerPayload(activeBadgeQrPayload);
                        setIsScannerOpen(true);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors cursor-pointer shadow-xs"
                    >
                      <QrCode className="w-3.5 h-3.5" />
                      <span>
                        {isEn
                          ? 'Scan Badge QR Code'
                          : 'Scanner le QR du Badge'}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setScannerPayload(currentProfile.employeeId || 'MAT-PILOTE-001');
                        setIsScannerOpen(true);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-700 hover:bg-orange-800 text-white text-xs font-bold transition-colors cursor-pointer shadow-xs"
                    >
                      <ShieldCheck className="w-3.5 h-3.5 text-[#fdba74]" />
                      <span>
                        {isEn
                          ? 'Scan 1D Barcode (CODE-128)'
                          : 'Scanner le Code-Barres 1D (CODE-128)'}
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}


          {/* ========================================================================= */}
          {/* ONGLET 3 : CV EXÉCUTIF (DOC 12 — 1 PAGE A4 AVEC APERÇU DIRECT DU DOC)   */}
          {/* ========================================================================= */}
          {activeTab === 'cv_executif' && (
            <div className="space-y-4">
              {/* Barre de contrôle supérieure : Mode de vue & Action directe */}
              <div className="p-3 rounded-xl bg-emerald-50/80 dark:bg-slate-800/80 border border-emerald-300 dark:border-slate-700 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <FileText className="w-5 h-5 text-emerald-600 shrink-0" />
                  <div>
                    <h3 className="text-xs font-black uppercase text-emerald-900 dark:text-emerald-300">
                      Document 12 : CV Professionnel Exécutif (1 Page A4 Stricte — Format Bailleurs)
                    </h3>
                    <p className="text-[10.5px] text-slate-600 dark:text-slate-300">
                      Renseignez les champs et visualisez directement le document A4 généré en temps réel.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {/* Commutateur de vue */}
                  <div className="inline-flex items-center rounded-lg border border-emerald-400 bg-white dark:bg-slate-900 p-0.5 text-xs font-bold">
                    <button
                      type="button"
                      onClick={() => setCvExecViewMode('form')}
                      className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                        cvExecViewMode === 'form'
                          ? 'bg-emerald-600 text-white'
                          : 'text-slate-700 dark:text-slate-200 hover:bg-emerald-50'
                      }`}
                    >
                      Saisie
                    </button>
                    <button
                      type="button"
                      onClick={() => setCvExecViewMode('split')}
                      className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer hidden md:inline-block ${
                        cvExecViewMode === 'split'
                          ? 'bg-emerald-600 text-white'
                          : 'text-slate-700 dark:text-slate-200 hover:bg-emerald-50'
                      }`}
                    >
                      Côte à côte
                    </button>
                    <button
                      type="button"
                      onClick={() => setCvExecViewMode('preview')}
                      className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                        cvExecViewMode === 'preview'
                          ? 'bg-emerald-600 text-white'
                          : 'text-slate-700 dark:text-slate-200 hover:bg-emerald-50'
                      }`}
                    >
                      Aperçu Document A4
                    </button>
                  </div>

                  {/* Bouton de téléchargement direct du PDF */}
                  <button
                    type="button"
                    onClick={handleDownloadCvExecPdf}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black shadow-sm transition-all cursor-pointer"
                    title={isEn ? 'Download official 1-page A4 PDF' : 'Télécharger directement le PDF officiel (1 Page A4)'}
                  >
                    <Download className="w-3.5 h-3.5 text-emerald-100" />
                    <span>{isEn ? 'Download PDF (Doc 12)' : 'Télécharger le PDF (Doc 12 — 1 Page)'}</span>
                  </button>

                  {/* Boutons d'injection */}
                  <button
                    type="button"
                    onClick={() => handleApplyToCvExecutif(false)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-700 hover:bg-orange-800 text-white text-xs font-black shadow-sm transition-all cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-orange-200" />
                    <span>Injecter dans Doc 12</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleApplyToCvExecutif(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#c2410c] hover:bg-[#9a3412] text-white text-xs font-black shadow-sm transition-all cursor-pointer"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-[#fdba74]" />
                    <span>Ouvrir dans le Générateur A4</span>
                  </button>
                </div>
              </div>

              {/* Disposition Formulaire / Document A4 généré */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                {/* COLONNE GAUCHE : FORMULAIRE DE SAISIE */}
                {(cvExecViewMode === 'form' || cvExecViewMode === 'split') && (
                  <div className={`${cvExecViewMode === 'split' ? 'lg:col-span-6' : 'lg:col-span-12'} space-y-3.5`}>
                    {/* Photo d'identité */}
                    <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center gap-4">
                      {currentProfile.photoDataUrl ? (
                        <div className="relative group shrink-0">
                          <img
                            src={currentProfile.photoDataUrl}
                            alt={currentProfile.fullName}
                            className="w-16 h-20 object-cover rounded-lg border-2 border-emerald-600 shadow-sm"
                          />
                          <button
                            type="button"
                            onClick={() => updateCurrentProfile({ photoDataUrl: '' })}
                            className="absolute -top-1 -right-1 p-1 rounded-full bg-rose-600 text-white cursor-pointer"
                            title="Supprimer la photo"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <div className="w-16 h-20 rounded-lg bg-slate-100 dark:bg-slate-800 border-2 border-dashed border-slate-300 dark:border-slate-600 flex flex-col items-center justify-center text-slate-400 p-1 shrink-0">
                          <ImagePlus className="w-5 h-5 mb-0.5 text-slate-400" />
                          <span className="text-[7.5px] font-bold">Photo 3.5x4.5cm</span>
                        </div>
                      )}

                      <div className="flex-1 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-black uppercase text-[#c2410c] dark:text-[#fdba74]">
                            Photo d’Identité pour le CV
                          </span>
                          <label className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#c2410c] hover:bg-[#9a3412] text-white text-[10px] font-bold cursor-pointer">
                            <ImagePlus className="w-3 h-3 text-[#fdba74]" />
                            <span>{currentProfile.photoDataUrl ? 'Changer' : 'Importer'}</span>
                            <input
                              type="file"
                              accept="image/*"
                              onChange={handlePhotoUpload}
                              className="hidden"
                            />
                          </label>
                        </div>
                        <p className="text-[10px] text-slate-500">
                          Format officiel 3,5 cm × 4,5 cm avec cadre institutionnel sur la page A4.
                        </p>
                      </div>
                    </div>

                    {/* Champs textuels */}
                    <div className="space-y-3">
                      <div>
                        <label className="block text-[10.5px] font-black uppercase text-slate-700 dark:text-slate-200 mb-1">
                          1. Synthèse Exécutive & Pitch de Carrière
                        </label>
                        <textarea
                          rows={3}
                          value={currentProfile.cvExecPitch || ''}
                          onChange={e => updateCurrentProfile({ cvExecPitch: e.target.value })}
                          className="w-full px-3 py-2 text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 leading-relaxed"
                          placeholder="Directeur de projet international / Spécialiste senior..."
                        />
                      </div>

                      <div>
                        <label className="block text-[10.5px] font-black uppercase text-slate-700 dark:text-slate-200 mb-1">
                          2. Compétences Clés & Domaines d'Expertise
                        </label>
                        <textarea
                          rows={2}
                          value={currentProfile.cvExecKeySkills || ''}
                          onChange={e => updateCurrentProfile({ cvExecKeySkills: e.target.value })}
                          className="w-full px-3 py-2 text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
                          placeholder="Ingénierie de Projet (WBS, PERT/CPM, EVM) | Suivi-Évaluation & GAR..."
                        />
                      </div>

                      <div>
                        <label className="block text-[10.5px] font-black uppercase text-slate-700 dark:text-slate-200 mb-1">
                          3. Réalisations Phares & Expérience sur le Programme
                        </label>
                        <textarea
                          rows={4}
                          value={currentProfile.cvExecMajorMissions || ''}
                          onChange={e => updateCurrentProfile({ cvExecMajorMissions: e.target.value })}
                          className="w-full px-3 py-2 text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-mono text-[11px]"
                          placeholder="2023–2026 : Coordonnateur du Programme « Portfolio »..."
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[10.5px] font-black uppercase text-slate-700 dark:text-slate-200 mb-1">
                            4. Diplôme Universitaire le Plus Élevé
                          </label>
                          <textarea
                            rows={2}
                            value={currentProfile.cvExecEducation || ''}
                            onChange={e => updateCurrentProfile({ cvExecEducation: e.target.value })}
                            className="w-full px-3 py-1.5 text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
                            placeholder="Master Exécutif en Ingénierie de Projets..."
                          />
                        </div>
                        <div>
                          <label className="block text-[10.5px] font-black uppercase text-slate-700 dark:text-slate-200 mb-1">
                            5. Certifications Internationales
                          </label>
                          <textarea
                            rows={2}
                            value={currentProfile.cvExecCertifications || ''}
                            onChange={e => updateCurrentProfile({ cvExecCertifications: e.target.value })}
                            className="w-full px-3 py-1.5 text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
                            placeholder="PMP® (PMI), Lead ISO 21500, GAR (PNUD)..."
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[10.5px] font-black uppercase text-slate-700 dark:text-slate-200 mb-1">
                            Langues & Outils Informatiques
                          </label>
                          <input
                            type="text"
                            value={currentProfile.cvExecLanguagesTools || ''}
                            onChange={e => updateCurrentProfile({ cvExecLanguagesTools: e.target.value })}
                            className="w-full px-3 py-1.5 text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
                            placeholder="Français (C2), Anglais (C1) | faab gar, MS Project"
                          />
                        </div>
                        <div>
                          <label className="block text-[10.5px] font-black uppercase text-slate-700 dark:text-slate-200 mb-1">
                            Disponibilité Opérationnelle
                          </label>
                          <input
                            type="text"
                            value={currentProfile.cvExecAvailability || ''}
                            onChange={e => updateCurrentProfile({ cvExecAvailability: e.target.value })}
                            className="w-full px-3 py-1.5 text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
                            placeholder="Disponibilité immédiate pour la conduite du programme"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* COLONNE DROITE : RENDU RÉEL ET VRAI DOCUMENT A4 GÉNÉRÉ (IDENTIQUE AU GÉNÉRATEUR) */}
                {(cvExecViewMode === 'preview' || cvExecViewMode === 'split') && (
                  <div className={`${cvExecViewMode === 'split' ? 'lg:col-span-6' : 'lg:col-span-12'} space-y-2`}>
                    <div className="flex items-center justify-between text-xs font-black uppercase text-[#c2410c] dark:text-[#fdba74] px-1">
                      <span className="flex items-center gap-1.5">
                        <Eye className="w-4 h-4 text-[#ea580c]" />
                        <span>Aperçu Réel du Document A4 Généré (Doc 12 — 1 Page Stricte)</span>
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleDownloadCvExecPdf}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-700 hover:bg-emerald-800 text-white text-[10.5px] font-bold shadow-xs transition-colors cursor-pointer"
                        >
                          <Download className="w-3 h-3 text-emerald-200" />
                          <span>{isEn ? 'Download PDF' : 'Télécharger le PDF'}</span>
                        </button>
                        <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[9px] font-black">
                          Format Bailleurs
                        </span>
                      </div>
                    </div>

                    {/* Rendu fidèle et identique au Document Generator */}
                    <div className="bg-slate-200 dark:bg-slate-950 p-2 sm:p-4 rounded-xl border border-slate-300 dark:border-slate-800 flex flex-col items-center overflow-x-auto max-h-[750px] overflow-y-auto">
                      {cvExecPages.map((page, pIdx) =>
                        renderInstitutionalA4Page(
                          page,
                          pIdx,
                          cvExecPages.length,
                          cvExecFields,
                          'CV Exécutif — Format Décideurs & Bailleurs'
                        )
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* ONGLET 4 : CV DÉTAILLÉ BAILLEURS (DOC 13 — 4 PAGES A4 TECH-6)            */}
          {/* ========================================================================= */}
          {activeTab === 'cv_detaille' && (
            <div className="space-y-4">
              {/* Barre de contrôle supérieure */}
              <div className="p-3 rounded-xl bg-purple-50/80 dark:bg-slate-800/80 border border-purple-300 dark:border-slate-700 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <Award className="w-5 h-5 text-purple-600 shrink-0" />
                  <div>
                    <h3 className="text-xs font-black uppercase text-purple-900 dark:text-purple-300">
                      Document 13 : CV Détaillé Multilatéral (Format Standard TECH-6 — 4 Pages A4)
                    </h3>
                    <p className="text-[10.5px] text-slate-600 dark:text-slate-300">
                      Format standardisé Banque Mondiale, BAD, Union Européenne et PNUD en 4 pages denses.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {/* Commutateur de vue */}
                  <div className="inline-flex items-center rounded-lg border border-purple-400 bg-white dark:bg-slate-900 p-0.5 text-xs font-bold">
                    <button
                      type="button"
                      onClick={() => setCvDetailViewMode('form')}
                      className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                        cvDetailViewMode === 'form'
                          ? 'bg-purple-600 text-white'
                          : 'text-slate-700 dark:text-slate-200 hover:bg-purple-50'
                      }`}
                    >
                      Saisie
                    </button>
                    <button
                      type="button"
                      onClick={() => setCvDetailViewMode('split')}
                      className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer hidden md:inline-block ${
                        cvDetailViewMode === 'split'
                          ? 'bg-purple-600 text-white'
                          : 'text-slate-700 dark:text-slate-200 hover:bg-purple-50'
                      }`}
                    >
                      Côte à côte
                    </button>
                    <button
                      type="button"
                      onClick={() => setCvDetailViewMode('preview')}
                      className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                        cvDetailViewMode === 'preview'
                          ? 'bg-purple-600 text-white'
                          : 'text-slate-700 dark:text-slate-200 hover:bg-purple-50'
                      }`}
                    >
                      Aperçu 4 Pages A4
                    </button>
                  </div>

                  {/* Bouton de téléchargement direct du PDF */}
                  <button
                    type="button"
                    onClick={handleDownloadCvDetailPdf}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-700 hover:bg-purple-800 text-white text-xs font-black shadow-sm transition-all cursor-pointer"
                    title={isEn ? 'Download official 4-page A4 PDF' : 'Télécharger directement le PDF officiel (4 Pages A4)'}
                  >
                    <Download className="w-3.5 h-3.5 text-purple-100" />
                    <span>{isEn ? 'Download PDF (Doc 13)' : 'Télécharger le PDF (Doc 13 — 4 Pages)'}</span>
                  </button>

                  {/* Boutons d'injection */}
                  <button
                    type="button"
                    onClick={() => handleApplyToCvDetaille(false)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-700 hover:bg-orange-800 text-white text-xs font-black shadow-sm transition-all cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-orange-200" />
                    <span>Injecter dans Doc 13</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleApplyToCvDetaille(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#c2410c] hover:bg-[#9a3412] text-white text-xs font-black shadow-sm transition-all cursor-pointer"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-[#fdba74]" />
                    <span>Ouvrir dans le Générateur A4</span>
                  </button>
                </div>
              </div>

              {/* Disposition Formulaire / Document 4 Pages A4 */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                {/* COLONNE GAUCHE : FORMULAIRE COMPLET */}
                {(cvDetailViewMode === 'form' || cvDetailViewMode === 'split') && (
                  <div className={`${cvDetailViewMode === 'split' ? 'lg:col-span-6' : 'lg:col-span-12'} space-y-3.5`}>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-[10.5px] font-black uppercase text-slate-700 dark:text-slate-200 mb-1">
                          1. Résumé Global des Qualifications (TECH-6 Part A)
                        </label>
                        <textarea
                          rows={3}
                          value={currentProfile.cvDetailQualificationsSummary || ''}
                          onChange={e => updateCurrentProfile({ cvDetailQualificationsSummary: e.target.value })}
                          className="w-full px-3 py-2 text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 leading-relaxed"
                          placeholder="Expertise internationale approfondie dans la conduite opérationnelle de programmes d’envergure..."
                        />
                      </div>

                      <div>
                        <label className="block text-[10.5px] font-black uppercase text-slate-700 dark:text-slate-200 mb-1">
                          2. Cursus Universitaire & Académique Supérieur Exhaustif
                        </label>
                        <textarea
                          rows={3}
                          value={currentProfile.cvDetailCompleteEducation || ''}
                          onChange={e => updateCurrentProfile({ cvDetailCompleteEducation: e.target.value })}
                          className="w-full px-3 py-2 text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
                          placeholder="Doctorat, Master, Ingénieur (Universités, années, mentions)..."
                        />
                      </div>

                      <div>
                        <label className="block text-[10.5px] font-black uppercase text-slate-700 dark:text-slate-200 mb-1">
                          3. Formations Continues, Séminaires & Certifications Bailleurs
                        </label>
                        <textarea
                          rows={2}
                          value={currentProfile.cvDetailCertifications || ''}
                          onChange={e => updateCurrentProfile({ cvDetailCertifications: e.target.value })}
                          className="w-full px-3 py-2 text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
                          placeholder="Certifications PMP®, PRINCE2, Passation des marchés Banque Mondiale..."
                        />
                      </div>

                      <div>
                        <label className="block text-[10.5px] font-black uppercase text-slate-700 dark:text-slate-200 mb-1">
                          4. Expérience Pays d’Intervention & Bailleurs Multilatéraux
                        </label>
                        <input
                          type="text"
                          value={currentProfile.cvDetailCountriesDonors || ''}
                          onChange={e => updateCurrentProfile({ cvDetailCountriesDonors: e.target.value })}
                          className="w-full px-3 py-1.5 text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
                          placeholder="Côte d’Ivoire, Sénégal, Bénin | Banque Mondiale, BAD, UE, PNUD"
                        />
                      </div>

                      <div>
                        <label className="block text-[10.5px] font-black uppercase text-slate-700 dark:text-slate-200 mb-1">
                          5. Historique Exhaustif des Missions & Postes Occupés
                        </label>
                        <textarea
                          rows={5}
                          value={currentProfile.cvDetailProjectHistory || ''}
                          onChange={e => updateCurrentProfile({ cvDetailProjectHistory: e.target.value })}
                          className="w-full px-3 py-2 text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 font-mono text-[11px] leading-relaxed"
                          placeholder="Historique chronologique inversé des missions avec dates, bailleurs, budgets gérés et réalisations..."
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[10.5px] font-black uppercase text-slate-700 dark:text-slate-200 mb-1">
                            6. Publications & Affiliations
                          </label>
                          <textarea
                            rows={2}
                            value={currentProfile.cvDetailPublications || ''}
                            onChange={e => updateCurrentProfile({ cvDetailPublications: e.target.value })}
                            className="w-full px-3 py-1.5 text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
                            placeholder="Articles scientifiques, guides méthodologiques..."
                          />
                        </div>

                        <div>
                          <label className="block text-[10.5px] font-black uppercase text-slate-700 dark:text-slate-200 mb-1">
                            7. Matrice des Langues (CECRL)
                          </label>
                          <textarea
                            rows={2}
                            value={currentProfile.cvDetailLanguagesMatrix || ''}
                            onChange={e => updateCurrentProfile({ cvDetailLanguagesMatrix: e.target.value })}
                            className="w-full px-3 py-1.5 text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
                            placeholder="Français (C2) | Anglais (C1) | Espagnol (B1)"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[10.5px] font-black uppercase text-slate-700 dark:text-slate-200 mb-1">
                          8. Références Professionnelles Vérifiables
                        </label>
                        <textarea
                          rows={2}
                          value={currentProfile.cvDetailReferences || ''}
                          onChange={e => updateCurrentProfile({ cvDetailReferences: e.target.value })}
                          className="w-full px-3 py-1.5 text-xs rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
                          placeholder="Nom, Titre, Organisation, Téléphone, Email..."
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* COLONNE DROITE : RENDU RÉEL 4 PAGES DU DOCUMENT A4 (IDENTIQUE AU GÉNÉRATEUR) */}
                {(cvDetailViewMode === 'preview' || cvDetailViewMode === 'split') && (
                  <div className={`${cvDetailViewMode === 'split' ? 'lg:col-span-6' : 'lg:col-span-12'} space-y-2`}>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-black uppercase text-[#c2410c] dark:text-[#fdba74] px-1">
                      <span className="flex items-center gap-1.5">
                        <Eye className="w-4 h-4 text-[#ea580c]" />
                        <span>Aperçu Réel Document A4 (Doc 13 — Format TECH-6 Multilatéral)</span>
                      </span>

                      <div className="flex items-center gap-2">
                        {/* Sélecteur de page 1 à 4 ou Vue continue */}
                        <div className="flex items-center gap-1 bg-white dark:bg-slate-900 p-0.5 rounded-lg border border-purple-300">
                          <button
                            type="button"
                            onClick={() => setCvDetailPageIdx(-1)}
                            className={`px-2 py-0.5 rounded text-[10px] font-extrabold cursor-pointer ${
                              cvDetailPageIdx === -1
                                ? 'bg-purple-600 text-white'
                                : 'text-slate-600 dark:text-slate-300 hover:bg-purple-50'
                            }`}
                          >
                            Toutes (1 à 4)
                          </button>
                          {[0, 1, 2, 3].map(pIdx => (
                            <button
                              key={pIdx}
                              type="button"
                              onClick={() => setCvDetailPageIdx(pIdx)}
                              className={`px-2 py-0.5 rounded text-[10px] font-extrabold cursor-pointer ${
                                cvDetailPageIdx === pIdx
                                  ? 'bg-purple-600 text-white'
                                  : 'text-slate-600 dark:text-slate-300 hover:bg-purple-50'
                              }`}
                            >
                              Page {pIdx + 1}
                            </button>
                          ))}
                        </div>

                        {/* Téléchargement direct du PDF */}
                        <button
                          type="button"
                          onClick={handleDownloadCvDetailPdf}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-purple-700 hover:bg-purple-800 text-white text-[10.5px] font-bold shadow-xs transition-colors cursor-pointer"
                        >
                          <Download className="w-3 h-3 text-purple-200" />
                          <span>{isEn ? 'PDF (4 Pages)' : 'Télécharger le PDF'}</span>
                        </button>
                      </div>
                    </div>

                    {/* Rendu fidèle et identique au Document Generator */}
                    <div className="bg-slate-200 dark:bg-slate-950 p-2 sm:p-4 rounded-xl border border-slate-300 dark:border-slate-800 flex flex-col items-center overflow-x-auto max-h-[750px] overflow-y-auto">
                      {cvDetailPageIdx === -1
                        ? cvDetailPages.map((page, pIdx) =>
                            renderInstitutionalA4Page(
                              page,
                              pIdx,
                              cvDetailPages.length,
                              cvDetailFields,
                              'CV Détaillé Bailleurs (TECH-6)'
                            )
                          )
                        : cvDetailPages[cvDetailPageIdx]
                        ? renderInstitutionalA4Page(
                            cvDetailPages[cvDetailPageIdx],
                            cvDetailPageIdx,
                            cvDetailPages.length,
                            cvDetailFields,
                            'CV Détaillé Bailleurs (TECH-6)'
                          )
                        : null}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* LECTEUR / SCANNER DE CONTRÔLE D'ACCÈS INTERNE INTÉGRÉ */}
      {isScannerOpen && (
        <QrBarcodeScannerModal
          isOpen={isScannerOpen}
          onClose={() => setIsScannerOpen(false)}
          dossier={dossier}
          userProfile={userProfile}
          language={language}
          initialScanPayload={scannerPayload}
        />
      )}
    </div>
  );
};

