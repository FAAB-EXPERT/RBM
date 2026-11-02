export type CurrencyCode = 'FCFA' | 'EUR' | 'USD';
export type LanguageCode = 'FR' | 'EN';
export type ThemeMode = 'light' | 'dark';

export type GanttTimeScale = 'day' | 'week' | 'month' | 'quarter' | 'semester' | 'year';

export type InstitutionalDocType =
  | 'tdr'
  | 'note_methodo'
  | 'nda'
  | 'lettre_mission'
  | 'cadrage'
  | 'demarrage'
  | 'cap'
  | 'grille_evaluation'
  | 'mi_parcours'
  | 'rapport_final'
  | 'courrier_admin'
  | 'cv_executif'
  | 'cv_detaille'
  | 'pv_reunion'
  | 'tdr_simplifie'
  | 'ptba'
  | 'ptt'
  | 'slides_tdr'
  | 'slides_cadrage'
  | 'slides_demarrage'
  | 'slides_ptba'
  | 'slides_ptt'
  | 'slides_mi_parcours'
  | 'slides_evaluation_finale';

export type SlideLayoutMode = 'two_columns' | 'three_cards' | 'full_matrix';

export interface SlideCustomOverride {
  slideNumber: number;
  excluded?: boolean;
  title?: string;
  subtitle?: string;
  content?: string;
  imageDataUrl?: string;
  imageCaption?: string;
  layout?: SlideLayoutMode;
}

export interface FieldPhotoItem {
  id: string;
  dataUrl: string;
  caption: string;
  locationDate?: string;
}

export interface CustomDocFields {
  referenceCode: string;
  locationCity: string;
  recipientOrg: string;
  donorDepartment?: string;
  executingOrgName?: string;
  executingDepartment?: string;
  recipientRepresentative: string;
  contextJustification: string;
  specificObjectives: string;
  methodologyApproach: string;
  confidentialityClauses: string;
  governanceModalities: string;
  recommendationsLessons: string;
  // Champs d'importation d'images et logos (Data URL base64)
  leftLogoDataUrl?: string;
  rightLogoDataUrl?: string;
  bannerImageDataUrl?: string;
  figureImageDataUrl?: string;
  orgStampDataUrl?: string;
  partnerStampDataUrl?: string;
  profilePhotoDataUrl?: string;
  // Annexe Photographique de Terrain (Rapports CAP, Mi-Parcours & Évaluation Annuelle/Finale)
  fieldPhotosAnnexTitle?: string;
  fieldPhotosJson?: string;
  // Document-specific extra fields
  extraField1?: string;
  extraField2?: string;
  extraField3?: string;
  extraField4?: string;
  extraField5?: string;
  extraField6?: string;
  extraField7?: string;
  extraField8?: string;
  extraField9?: string;
  extraField10?: string;
  extraField11?: string;
  // Trimestre actif pour le Plan de Travail Trimestriel (PTT : Q1, Q2, Q3, Q4)
  activeQuarter?: 'Q1' | 'Q2' | 'Q3' | 'Q4';
  // Sélecteur Annuel PTBA / Trimestriel PTT pour la Présentation Slides PTBA/PTT
  slidePtbaPttMode?: 'PTBA' | 'PTT';
  // Configuration personnalisée par diapositive (Présentations Slides 16:9)
  slidesConfigJson?: string;
  // Données sérialisées des 10 Matrices Maîtresses (M1 - M10)
  matricesJson?: string;
  // Liste JSON des clés de champs/sections exclus de l'affichage du document sans perdre la saisie
  excludedFieldsJson?: string;
}

export type CustomDocsMap = Record<InstitutionalDocType, CustomDocFields>;

export interface UserProfile {
  fullName: string;
  email: string;
  phone: string;
  institution: string;
  role: string;
  // Indique si l'utilisateur spécialiste en gestion de projet intervient comme acteur opérationnel du programme (true) ou uniquement comme spécialiste/rédacteur PMO externe (false)
  intervenesAsProgramActor?: boolean;
  // Éléments constituant le CV de l'utilisateur
  nationality?: string;
  birthDate?: string;
  residenceCity?: string;
  linkedIn?: string;
  yearsExperience?: string;
  cvExecutivePitch?: string;
  cvKeySkills?: string;
  cvEducationDiplomas?: string;
  cvCertifications?: string;
  cvMajorExperiences?: string;
  cvCountriesAndDonors?: string;
  cvLanguages?: string;
  cvSoftwareTools?: string;
  cvPublicationsAffiliations?: string;
  cvReferences?: string;
  cvAvailability?: string;
  cvPhotoDataUrl?: string;
}

export interface InternalActorProfile {
  id: string;
  actorName: string;
  isInternalPilotActor: boolean; // Acteur interne à l'organisme qui pilote le programme
  // Organisme qui pilote le programme
  executingOrgName: string;
  executingDepartment: string;
  serviceUnit?: string;
  employeeId?: string;
  officialRole: string;
  raciRoleBadge?: string;

  // Données personnelles & contact pro
  fullName: string;
  nationality?: string;
  birthDate?: string;
  residenceCity?: string;
  phonePro?: string;
  phoneMobile?: string;
  emailPro?: string;
  websiteUrl?: string;
  linkedInUrl?: string;
  officeAddress?: string;
  photoDataUrl?: string;
  companyLogoDataUrl?: string; // Logo de l'entreprise / organisme pilote inséré sur la carte de visite et le badge

  // Carte de Visite Professionnelle
  businessCardSlogan?: string;
  businessCardAccreditation?: string;

  // Badge Professionnel & Accréditation
  badgeValidityDate?: string;
  badgeBloodType?: string;
  badgeEmergencyPhone?: string;

  // CV Exécutif (Doc 12)
  cvExecPitch?: string;
  cvExecYearsExp?: string;
  cvExecKeySkills?: string;
  cvExecMajorMissions?: string;
  cvExecEducation?: string;
  cvExecCertifications?: string;
  cvExecLanguagesTools?: string;
  cvExecAvailability?: string;

  // CV Détaillé (Doc 13)
  cvDetailQualificationsSummary?: string;
  cvDetailCompleteEducation?: string;
  cvDetailCertifications?: string;
  cvDetailCountriesDonors?: string;
  cvDetailProjectHistory?: string;
  cvDetailPublications?: string;
  cvDetailLanguagesMatrix?: string;
  cvDetailSoftwareTools?: string;
  cvDetailReferences?: string;
  cvDetailHonorAttestation?: string;
}

export interface Task {
  id: string;
  type: 'tache' | 'jalon';
  phase: string;
  name: string;
  startDate: string;
  endDate: string;
  actualStartDate?: string;
  actualEndDate?: string;
  status: 'À faire' | 'En cours' | 'Terminé' | 'Bloqué';
  manualBlocked?: boolean;
  assignee: string;
  autorite?: string;
  consulte?: string;
  informe?: string;
  responsabilite?: string;
  raciR?: string;
  raciA?: string;
  raciC?: string;
  raciI?: string;
  livrable?: string;
  budget?: number; // Stored in base FCFA
  validated?: boolean;
  antecedent?: string;
  projectName?: string;
  projectId?: string;
  axeId?: string;
  axeName?: string;
  dossierId?: string;
  isReadOnly?: boolean;
}

export interface PertNode {
  id: string;
  code: string;
  name: string;
  type: 'tache' | 'jalon';
  phase: string;
  projectId: string;
  projectName: string;
  assignee: string;
  budget: number;
  startDate: string;
  endDate: string;
  actualStartDate?: string;
  actualEndDate?: string;
  status: Task['status'];
  duration: number;
  antecedentId: string;
  antecedentCode: string;
  precedingChainCodes: string;
  successorCodes: string[];
  es: number;
  ef: number;
  ls: number;
  lf: number;
  totalFloat: number;
  freeFloat: number;
  isCritical: boolean;
  startDelayDays: number;
  endDelayDays: number;
  level: number;
}

export interface Project {
  id: string;
  name: string;
  tasks: Task[];
  axeId?: string;
  axeName?: string;
  dossierId?: string;
  dossierName?: string;
  isReadOnly?: boolean;
}

export interface Axe {
  id: string;
  name: string;
  projects: Project[];
}

export type ActorCategoryType =
  | 'Bénéficiaires'
  | 'Interne'
  | 'Externe'
  | 'Prestataire'
  | 'Partenaire Financier';

export interface ActorCategoryDefinition {
  id: ActorCategoryType;
  order: number;
  labelFr: string;
  labelEn: string;
  shortBadgeFr: string;
  shortBadgeEn: string;
  definitionFr: string;
  definitionEn: string;
  allowsPersonalSupports: boolean;
}

export const ACTOR_CATEGORIES_ORDERED: ActorCategoryDefinition[] = [
  {
    id: 'Bénéficiaires',
    order: 1,
    labelFr: '1. Bénéficiaires',
    labelEn: '1. Beneficiaries',
    shortBadgeFr: 'Bénéficiaires',
    shortBadgeEn: 'Beneficiaries',
    definitionFr:
      'Acteurs, populations cibles ou entités qui bénéficient directement ou indirectement des résultats et extrants du projet/programme.',
    definitionEn:
      'Actors, target populations, or entities that directly or indirectly benefit from the outcomes and outputs of the project/programme.',
    allowsPersonalSupports: false
  },
  {
    id: 'Interne',
    order: 2,
    labelFr: '2. Interne',
    labelEn: '2. Internal (UGP / Pilot)',
    shortBadgeFr: 'Interne (Pilote / UGP)',
    shortBadgeEn: 'Internal (Pilot / PMU)',
    definitionFr:
      'Acteurs appartenant à l’institution porteuse ou à l’Unité de Gestion (UGP/AGEX) qui pilote et réalise le projet (équipe projet, coordonnateur, experts internes, directions internes).',
    definitionEn:
      'Actors belonging to the host institution or Management Unit (PMU/AGEX) that pilots and implements the project (project team, coordinator, internal experts, internal departments).',
    allowsPersonalSupports: true
  },
  {
    id: 'Externe',
    order: 3,
    labelFr: '3. Externe',
    labelEn: '3. External (State / Regulator)',
    shortBadgeFr: 'Externe (Tutelle / Contrôle)',
    shortBadgeEn: 'External (Ministry / Control)',
    definitionFr:
      'Organisations étatiques, ministères de tutelle, autorités de régulation ou organismes de contrôle nationaux/internationaux intervenant pour les prises de décisions, autorisations, laisser-passer, visas et contrôle de conformité.',
    definitionEn:
      'State organizations, line ministries, regulatory authorities, or national/international control bodies intervening for decision-making, authorizations, passes, visas, and compliance control.',
    allowsPersonalSupports: false
  },
  {
    id: 'Prestataire',
    order: 4,
    labelFr: '4. Prestataire',
    labelEn: '4. Contractor / Provider',
    shortBadgeFr: 'Prestataire (Marché / Contrat)',
    shortBadgeEn: 'Contractor (Public Contract)',
    definitionFr:
      'Opérateurs économiques, cabinets, consultants ou entreprises privées intervenant dans l’exécution opérationnelle des tâches après attribution d’un marché public/contrat.',
    definitionEn:
      'Economic operators, consulting firms, consultants, or private companies intervening in the operational execution of tasks after award of a public procurement contract.',
    allowsPersonalSupports: false
  },
  {
    id: 'Partenaire Financier',
    order: 5,
    labelFr: '5. Partenaire Financier',
    labelEn: '5. Financial Partner (Donor)',
    shortBadgeFr: 'Partenaire Financier (Bailleur)',
    shortBadgeEn: 'Financial Partner (Donor)',
    definitionFr:
      'Bailleurs de fonds et entités financières qui financent et décaissent les ressources pour la réalisation du projet/programme.',
    definitionEn:
      'Donors and financial entities that fund and disburse resources for the implementation of the project/programme.',
    allowsPersonalSupports: false
  }
];

export type ActorGovernanceInstance =
  | 'COPIL'
  | 'COPROJ'
  | 'COPIL & COPROJ'
  | 'Opérationnel / Aucun';

export interface CategorizedActor {
  id: string;
  name: string;
  category: ActorCategoryType;
  dossierId: string;
  axeId: string; // 'ALL' or specific Axe ID
  projectId: string; // 'ALL' or specific Project ID
  roleOrFunction: string;
  organization: string;
  department: string;
  email: string;
  phone: string;
  address?: string;
  website?: string;
  matricule: string;
  raciRoles: ('R' | 'A' | 'C' | 'I')[];
  accreditationLevel: string;
  badgeValidity: string;
  influenceLevel?: 'Élevée' | 'Moyenne' | 'Faible';
  expectationsAndRole?: string;
  photoDataUrl?: string;
  governanceInstance?: ActorGovernanceInstance;
}

export interface GarResourceItem {
  label: string;
  amount: string;
}

export interface GarStakeholderItem {
  nom: string;
  intervention?: string;
  competence?: string;
  attentes?: string;
  contraintes?: string;
  pointFort?: string;
  pointFaible?: string;
  problemes?: string;
  axe: number; // 1-indexed axe number
  projetIndex: number; // 0-indexed project index
}

export interface GarProblemDetail {
  contrainte: string;
  cause: string[];
  besoin: string[];
}

export interface GarProblemBranch {
  axeName: string;
  central: string;
  details: GarProblemDetail[];
}

export interface GarRendementProject {
  extrant: string;
  extrantCmr?: string;
  activites: string[];
  intrants_rh: GarResourceItem[][];
  intrants_mat: GarResourceItem[][];
  couts?: string[];
  cout?: string;
  responsable?: string;
  periode?: string;
}

export interface GarRendementAxe {
  nom: string;
  effet: string;
  budget?: string;
  projets: GarRendementProject[];
}

export interface GarCmrRow {
  niveau: string;
  resultat: string;
  indicateur: string;
  ref: string;
  cible: string;
  real: string;
  freq: string;
  source: string;
  responsable: string;
  axe: number;
}

export interface GarRiskRow {
  id: string;
  niveau: string;
  logique?: string;
  hypothese: string;
  contrainte?: string;
  cause?: string;
  level: string;
  responsable: string;
  mitigation: string;
  axe: number;
  linkedAxeIndex?: number | null;
  linkedBranchIndex?: number | null;
}

export interface GarDossierData {
  cadrageStrategique?: {
    vision?: string;
    mission?: string;
    objectifGeneral?: string;
  };
  stakeholders: {
    beneficiaires: GarStakeholderItem[];
    instCentralises: GarStakeholderItem[];
    instDecentralises: GarStakeholderItem[];
    operateursTechniques: GarStakeholderItem[];
    ptf: GarStakeholderItem[];
  };
  problems: {
    consequenceGlobale: string;
    branches: GarProblemBranch[];
  };
  rendement: {
    impact: string;
    axes: GarRendementAxe[];
  };
  cmr: GarCmrRow[];
  risks: GarRiskRow[];
  fiche?: {
    lieu?: string;
    duree?: string;
    moa?: string;
    moe?: string;
    partenaires?: string;
    strategie?: string;
  };
}

export interface Dossier {
  id: string;
  name: string;
  horizonPlan: string;
  psdYear: number;
  horizonYears: number;
  isReadOnly?: boolean;
  type: string;
  institution: string;
  description: string;
  axes: Axe[];
  customDocsData?: Partial<CustomDocsMap>;
  categorizedActors?: CategorizedActor[];
  actorProfiles?: Record<string, InternalActorProfile>;
  garData?: GarDossierData;
}

export interface AppPersistedState {
  userProfile: UserProfile;
  dossiers: Dossier[];
  activeDossierId: string;
  language: LanguageCode;
  currency: CurrencyCode;
  theme: ThemeMode;
  lastJsonFileName: string;
  activeTab: string;
  customDocsData?: CustomDocsMap;
}


