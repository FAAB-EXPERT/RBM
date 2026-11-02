import {
  CurrencyCode,
  CustomDocFields,
  Dossier,
  FieldPhotoItem,
  InstitutionalDocType,
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
  DOC_TO_MATRICES_MAP,
  buildAllTxtMatrixVariables,
  buildStructuredA4TableFromMatrix,
  getMatrixDefinition,
  resolveActiveMatricesData,
  resolveProgramRaciContext
} from './docMatrices';

export interface DocFieldDescriptor {
  key: keyof CustomDocFields;
  label: string;
  placeholder: string;
  multiline?: boolean;
  rows?: number;
}

export type DocImageFieldKey =
  | 'leftLogoDataUrl'
  | 'rightLogoDataUrl'
  | 'bannerImageDataUrl'
  | 'figureImageDataUrl'
  | 'orgStampDataUrl'
  | 'partnerStampDataUrl'
  | 'profilePhotoDataUrl';

export interface DocImageFieldDescriptor {
  key: DocImageFieldKey;
  label: string;
  targetSection: string;
  helperText: string;
}

export const DOC_IMAGE_FIELD_DESCRIPTORS: DocImageFieldDescriptor[] = [
  {
    key: 'leftLogoDataUrl',
    label: '1. Logo Bailleur / Commanditaire',
    targetSection: 'Page de Garde (En-tête Haut Gauche)',
    helperText: 'Inséré dans le bloc [LOGO BAILLEUR / COMMANDITAIRE] en haut à gauche de la Page 1.'
  },
  {
    key: 'rightLogoDataUrl',
    label: '2. Logo Agence d’Exécution / Structure Pilote',
    targetSection: 'Page de Garde (En-tête Haut Droite) & En-têtes A4',
    helperText: 'Inséré dans le bloc [LOGO AGENCE D’EXÉCUTION] en haut à droite de la Page 1 et dans l’en-tête des pages.'
  },
  {
    key: 'bannerImageDataUrl',
    label: '3. Bannière / Image de l’Intervention',
    targetSection: 'Page de Garde (Visuel Contextuel Centré)',
    helperText: 'Inséré au centre de la Page 1 dans le cadre [BANNIÈRE / IMAGE DE L’INTERVENTION].'
  },
  {
    key: 'figureImageDataUrl',
    label: '4. Figure / Schéma ou Illustration Technique',
    targetSection: 'Section Figures & Corps du Document',
    helperText: 'Inséré dans la section des Figures & Schémas conceptuels et dans le corps du document.'
  },
  {
    key: 'orgStampDataUrl',
    label: '5. Signature & Cachet — Organisation Pilote',
    targetSection: 'Dernière Page (Bloc d’Approbation Gauche)',
    helperText: 'Inséré dans le cadre de signature officiel de l’Organisation / Autorité Pilote.'
  },
  {
    key: 'partnerStampDataUrl',
    label: '6. Signature & Cachet — Bailleur / Partie Prenante',
    targetSection: 'Dernière Page (Bloc d’Approbation Droite)',
    helperText: 'Inséré dans le cadre de signature « Lu et approuvé » du Partenaire / Bailleur.'
  }
];

/**
 * Retourne dynamiquement UNIQUEMENT les champs d'importation d'images ([IMAGE_...])
 * spécifiques au document sélectionné (en particulier pour la Catégorie D : Docs 12 à 15).
 */
export function getDocImageFieldDescriptors(
  docType: InstitutionalDocType
): DocImageFieldDescriptor[] {
  if (docType === 'cv_executif' || docType === 'cv_detaille') {
    return [
      {
        key: 'profilePhotoDataUrl',
        label: '[IMAGE_PHOTO_PROFIL] — Photo Professionnelle Format Identité (Portrait 3.5 cm x 4.5 cm)',
        targetSection: 'Bandeau d’En-tête CV (Haut Droite — 3.5 cm x 4.5 cm)',
        helperText:
          'Photo d’identité professionnelle positionnée en haut à droite de l’en-tête du CV.'
      },
      ...DOC_IMAGE_FIELD_DESCRIPTORS
    ];
  }
  return DOC_IMAGE_FIELD_DESCRIPTORS;
}

export type DocPaginationCategory = 'A' | 'B' | 'C' | 'D' | 'S';

export interface DocTemplateConfig {
  id: InstitutionalDocType;
  category: DocPaginationCategory;
  selectLabel: string;
  officialTitle: string;
  subtitle: string;
  badgeText: string;
  normativeReference: string;
  fields: DocFieldDescriptor[];
}

export interface CoverChartData {
  leftLogo: string;
  leftDepartment?: string;
  rightLogo: string;
  rightDepartment?: string;
  bannerTitle: string;
  bannerSubtitle: string;
  docTitle: string;
  docSubtitle: string;
  bottomLeftStructure: string;
  bottomLeftZone: string;
  bottomRightDateVersion: string;
  bottomRightStatus: string;
  leftLogoDataUrl?: string;
  rightLogoDataUrl?: string;
  bannerImageDataUrl?: string;
}

export interface AdminLetterHeaderData {
  senderInstitution: string;
  senderName: string;
  senderRole: string;
  senderContact: string;
  referenceCode: string;
  cityAndDate: string;
  recipientTitle: string;
  recipientOrg: string;
  subjectLine: string;
  dossierRefLine: string;
  leftLogoDataUrl?: string;
  rightLogoDataUrl?: string;
}

export interface CvHeaderBannerData {
  variant: 'cv_executif' | 'cv_detaille';
  docBadge: string;
  fullNameUpper: string;
  expertTitleLine: string;
  contactLine: string;
  metaSubLine: string;
  profilePhotoDataUrl?: string;
}

export interface OperationalHeaderBannerData {
  variant: 'pv_reunion' | 'tdr_simplifie';
  leftLogoLabel: string;
  rightLogoLabel: string;
  leftLogoDataUrl?: string;
  rightLogoDataUrl?: string;
  centerDocTitle: string;
  centerSubTitle: string;
  referenceAndDateLine: string;
}

export interface StructuredA4Table {
  headers: string[];
  rows: string[][];
  /** Ratios de largeur des colonnes en % (total = 100) pour table-layout: fixed */
  columnWidths?: number[];
  /** Indices des colonnes (0-based) à aligner à droite (ex: montants budgétaires) */
  rightAlignCols?: number[];
}

export interface StructuredA4Section {
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
  keyValueRows?: Array<[string, string]>;
  table?: StructuredA4Table;
  coverChart?: CoverChartData;
  adminLetterHeader?: AdminLetterHeaderData;
  cvHeaderBanner?: CvHeaderBannerData;
  operationalHeaderBanner?: OperationalHeaderBannerData;
  figureImage?: {
    dataUrl: string;
    caption: string;
  };
  fieldPhotosAnnex?: {
    annexTitle: string;
    photos: FieldPhotoItem[];
  };
}

export const HIDE_SIGNATURES_KEY = '__HIDE_SIGNATURES__';

export function supportsFieldPhotosAnnex(_docType: InstitutionalDocType): boolean {
  return true;
}

export function parseFieldPhotos(jsonStr?: string): FieldPhotoItem[] {
  if (!jsonStr || !jsonStr.trim()) return [];
  try {
    const parsed = JSON.parse(jsonStr);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(item => item && typeof item === 'object');
  } catch {
    return [];
  }
}

export function parseExcludedFields(jsonStr?: string): string[] {
  if (!jsonStr || !jsonStr.trim()) return [];
  try {
    const parsed = JSON.parse(jsonStr);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(item => typeof item === 'string');
  } catch {
    return [];
  }
}

export interface DocFieldHierarchyAlignment {
  hierarchyBadge: string;
  subHierarchyBadge?: string;
  targetPageIndex: number;
  targetSectionHeading: string;
}

/**
 * Retourne pour chaque champ spécifique d'un document :
 * - Son niveau hiérarchique explicite (Niveau 1 / Niveau 2) et sa numérotation dans le document généré
 * - L'index exact de la page A4 cible (targetPageIndex) et l'intitulé de la section en vis-à-vis à droite
 */
export function getDocFieldHierarchyAndAlignment(
  docType: InstitutionalDocType,
  field: DocFieldDescriptor,
  fieldIdx: number,
  lang: LanguageCode = 'FR'
): DocFieldHierarchyAlignment {
  const lvl1 = lang === 'EN' ? 'Level 1' : 'Niveau 1';
  const lvl2 = lang === 'EN' ? 'Level 2' : 'Niveau 2';
  const key = field.key;

  if (docType === 'courrier_admin') {
    const map: Partial<Record<keyof CustomDocFields, DocFieldHierarchyAlignment>> = {
      referenceCode: {
        hierarchyBadge: `${lvl1} — 1. Timbre Administratif`,
        subHierarchyBadge: `${lvl2} — 1.1 N° de Référence`,
        targetPageIndex: 0,
        targetSectionHeading: 'TIMBRE ADMINISTRATIF, COORDONNÉES DES PARTIES & OBJET OFFICIEL'
      },
      locationCity: {
        hierarchyBadge: `${lvl1} — 1. Timbre Administratif`,
        subHierarchyBadge: `${lvl2} — 1.2 Lieu & Date d’Émission`,
        targetPageIndex: 0,
        targetSectionHeading: 'TIMBRE ADMINISTRATIF, COORDONNÉES DES PARTIES & OBJET OFFICIEL'
      },
      recipientRepresentative: {
        hierarchyBadge: `${lvl1} — 1. Timbre Administratif`,
        subHierarchyBadge: `${lvl2} — 1.3 Destinataire & Fonction`,
        targetPageIndex: 0,
        targetSectionHeading: 'TIMBRE ADMINISTRATIF, COORDONNÉES DES PARTIES & OBJET OFFICIEL'
      },
      recipientOrg: {
        hierarchyBadge: `${lvl1} — 1. Timbre Administratif`,
        subHierarchyBadge: `${lvl2} — 1.4 Structure Destinataire`,
        targetPageIndex: 0,
        targetSectionHeading: 'TIMBRE ADMINISTRATIF, COORDONNÉES DES PARTIES & OBJET OFFICIEL'
      },
      contextJustification: {
        hierarchyBadge: `${lvl1} — 2. Objet Officiel du Courrier`,
        subHierarchyBadge: `${lvl2} — 2.1 Ligne d’Objet & Réf. Dossier`,
        targetPageIndex: 0,
        targetSectionHeading: 'TIMBRE ADMINISTRATIF, COORDONNÉES DES PARTIES & OBJET OFFICIEL'
      },
      specificObjectives: {
        hierarchyBadge: `${lvl1} — 3. Corps de la Correspondance`,
        subHierarchyBadge: `${lvl2} — 3.1 Paragraphe 1 (Formule d’Appel & Contexte)`,
        targetPageIndex: 0,
        targetSectionHeading: 'CORPS DE LA CORRESPONDANCE ADMINISTRATIVE (STRUCTURE NORMÉE EN 3 PARAGRAPHES)'
      },
      methodologyApproach: {
        hierarchyBadge: `${lvl1} — 3. Corps de la Correspondance`,
        subHierarchyBadge: `${lvl2} — 3.2 Paragraphe 2 (Argumentaire Technique, PERT & Financier)`,
        targetPageIndex: 0,
        targetSectionHeading: 'CORPS DE LA CORRESPONDANCE ADMINISTRATIVE (STRUCTURE NORMÉE EN 3 PARAGRAPHES)'
      },
      governanceModalities: {
        hierarchyBadge: `${lvl1} — 3. Corps de la Correspondance`,
        subHierarchyBadge: `${lvl2} — 3.3 Paragraphe 3 (Action Attendue & Conclusion)`,
        targetPageIndex: 0,
        targetSectionHeading: 'CORPS DE LA CORRESPONDANCE ADMINISTRATIVE (STRUCTURE NORMÉE EN 3 PARAGRAPHES)'
      },
      recommendationsLessons: {
        hierarchyBadge: `${lvl1} — 3. Corps de la Correspondance`,
        subHierarchyBadge: `${lvl2} — 3.4 Formule de Politesse Administrative`,
        targetPageIndex: 0,
        targetSectionHeading: 'CORPS DE LA CORRESPONDANCE ADMINISTRATIVE (STRUCTURE NORMÉE EN 3 PARAGRAPHES)'
      },
      confidentialityClauses: {
        hierarchyBadge: `${lvl1} — 4. Synthèse Chiffrée & Mentions Finales`,
        subHierarchyBadge: `${lvl2} — 4.1 Pièces Jointes (P.J.) & Ampliations (C.C.)`,
        targetPageIndex: 0,
        targetSectionHeading: 'SYNTHÈSE CHIFFRÉE DU DOSSIER DE RÉFÉRENCE & MENTIONS (P.J. / AMPLIATIONS)'
      }
    };
    if (map[key]) return map[key]!;
  }

  if (docType === 'cv_executif') {
    const map: Partial<Record<keyof CustomDocFields, DocFieldHierarchyAlignment>> = {
      recipientRepresentative: {
        hierarchyBadge: `${lvl1} — 0. Bandeau d’En-tête Exécutif`,
        subHierarchyBadge: `${lvl2} — 0.1 Identité, Titre & Coordonnées`,
        targetPageIndex: 0,
        targetSectionHeading: 'BANDEAU D’EN-TÊTE EXÉCUTIF & COORDONNÉES PROFESSIONNELLES (SANS PAGE DE GARDE)'
      },
      contextJustification: {
        hierarchyBadge: `${lvl1} — 1. Profil Exécutif & Proposition de Valeur`,
        subHierarchyBadge: `${lvl2} — 1.1 Pitch Exécutif & Synthèse Quantitative`,
        targetPageIndex: 0,
        targetSectionHeading: '1. PROFIL EXÉCUTIF & PROPOSITION DE VALEUR'
      },
      specificObjectives: {
        hierarchyBadge: `${lvl1} — 2. Matrice des Compétences Clés`,
        subHierarchyBadge: `${lvl2} — 2.1 Ingénierie · 2.2 S&E/GAR · 2.3 Gouvernance`,
        targetPageIndex: 0,
        targetSectionHeading: '2. MATRICE DES COMPÉTENCES CLÉS & CERTIFICATIONS (SYNCHRONISÉE PROFIL CV / M3 / GAR / EVM)'
      },
      methodologyApproach: {
        hierarchyBadge: `${lvl1} — 3. Expériences Professionnelles Significatives`,
        subHierarchyBadge: `${lvl2} — 3.1 à 3.4 Postes Clés & Réalisations Chiffrées`,
        targetPageIndex: 0,
        targetSectionHeading: '3. EXPÉRIENCES PROFESSIONNELLES SIGNIFICATIVES (SÉLECTION EXÉCUTIVE QUANTIFIÉE)'
      },
      governanceModalities: {
        hierarchyBadge: `${lvl1} — 4. Formation Académique & Accréditations`,
        subHierarchyBadge: `${lvl2} — 4.1 Certifications · 4.2 Diplômes Universitaires`,
        targetPageIndex: 0,
        targetSectionHeading: '4. FORMATION ACADÉMIQUE, DIPLÔMES & ACCRÉDITATIONS INTERNATIONALES'
      },
      confidentialityClauses: {
        hierarchyBadge: `${lvl1} — 5. Langues (CECRL), Logiciels & Disponibilité`,
        subHierarchyBadge: `${lvl2} — 5.1 Compétences Linguistiques & Outils S&E`,
        targetPageIndex: 0,
        targetSectionHeading: '5. LANGUES (CADRE CECRL), LOGICIELS TECHNIQUES & DISPONIBILITÉ'
      }
    };
    if (map[key]) return map[key]!;
  }

  if (docType === 'cv_detaille') {
    const map: Partial<Record<keyof CustomDocFields, DocFieldHierarchyAlignment>> = {
      recipientRepresentative: {
        hierarchyBadge: `${lvl1} — 1. Fiche Synoptique de l’Expert`,
        subHierarchyBadge: `${lvl2} — 1.1 État Civil, Coordonnées & Poste Proposé`,
        targetPageIndex: 0,
        targetSectionHeading: '1. FICHE SYNOPTIQUE DE L’EXPERT (ÉTAT CIVIL, COORDONNÉES & PORTÉE INTERNATIONALE)'
      },
      governanceModalities: {
        hierarchyBadge: `${lvl1} — 1. Fiche Synoptique de l’Expert`,
        subHierarchyBadge: `${lvl2} — 1.4 Synthèse des Pays & Bailleurs Pratiqués`,
        targetPageIndex: 0,
        targetSectionHeading: '1. FICHE SYNOPTIQUE DE L’EXPERT (ÉTAT CIVIL, COORDONNÉES & PORTÉE INTERNATIONALE)'
      },
      contextJustification: {
        hierarchyBadge: `${lvl1} — 2. Résumé Exécutif des Qualifications`,
        subHierarchyBadge: `${lvl2} — 2.1 Qualifications Pertinentes pour la Mission`,
        targetPageIndex: 0,
        targetSectionHeading: '2. RÉSUMÉ EXÉCUTIF DES QUALIFICATIONS & VALEUR AJOUTÉE POUR LA MISSION'
      },
      specificObjectives: {
        hierarchyBadge: `${lvl1} — 3. Cursus Universitaire & Diplômes`,
        subHierarchyBadge: `${lvl2} — 3.1 Diplômes Académiques Supérieurs`,
        targetPageIndex: 0,
        targetSectionHeading: '3. CURSUS UNIVERSITAIRE, DIPLÔMES & CERTIFICATIONS INTERNATIONALES'
      },
      methodologyApproach: {
        hierarchyBadge: `${lvl1} — 3. Cursus Universitaire & Certifications`,
        subHierarchyBadge: `${lvl2} — 3.2 Accréditations Internationales (PMP®, ISO 21500, GAR)`,
        targetPageIndex: 0,
        targetSectionHeading: '3. CURSUS UNIVERSITAIRE, DIPLÔMES & CERTIFICATIONS INTERNATIONALES'
      },
      extraField2: {
        hierarchyBadge: `${lvl1} — 4. Compétences Linguistiques (CECRL) & 5. Logiciels`,
        subHierarchyBadge: `${lvl2} — 4.1 Niveau Lu, Écrit, Parlé par Langue`,
        targetPageIndex: 0,
        targetSectionHeading: '4. COMPÉTENCES LINGUISTIQUES (CADRE EUROPÉEN CECRL) & 5. MAÎTRISE DES LOGICIELS S&E'
      },
      extraField1: {
        hierarchyBadge: `${lvl1} — 6. Expériences Professionnelles Détaillées`,
        subHierarchyBadge: `${lvl2} — 6.1 Fiches Détaillées des Missions & Projets Gérés`,
        targetPageIndex: 1,
        targetSectionHeading: '6.1 FICHES DÉTAILLÉES DES MISSIONS SUR LE PORTEFEUILLE ACTIF & EXPÉRIENCES ANTÉRIEURES'
      },
      confidentialityClauses: {
        hierarchyBadge: `${lvl1} — 7. Publications Scientifiques & 8. Affiliations`,
        subHierarchyBadge: `${lvl2} — 7.1 Études Majeures & Associations (PMI, RFE, AfrEA)`,
        targetPageIndex: 3,
        targetSectionHeading: '7. PUBLICATIONS SCIENTIFIQUES, MANUELS MÉTHODOLOGIQUES & 8. AFFILIATIONS PROFESSIONNELLES'
      },
      recommendationsLessons: {
        hierarchyBadge: `${lvl1} — 9. Personnes de Référence & 10. Attestation`,
        subHierarchyBadge: `${lvl2} — 9.1 Références Vérifiables & 10.1 Attestation sur l’Honneur`,
        targetPageIndex: 3,
        targetSectionHeading: '9. PERSONNES DE RÉFÉRENCE PROFESSIONNELLE VÉRIFIABLES (MINIMUM 3 RÉFÉRENCES)'
      }
    };
    if (map[key]) return map[key]!;
  }

  if (docType === 'pv_reunion') {
    const map: Partial<Record<keyof CustomDocFields, DocFieldHierarchyAlignment>> = {
      recipientRepresentative: {
        hierarchyBadge: `${lvl1} — 1. Fiche Signalétique de la Séance`,
        subHierarchyBadge: `${lvl2} — 1.1 Métadonnées, Président & Quorum`,
        targetPageIndex: 0,
        targetSectionHeading: '1. FICHE SIGNALÉTIQUE DE LA SÉANCE'
      },
      governanceModalities: {
        hierarchyBadge: `${lvl1} — 2. Feuille de Présence Officielle`,
        subHierarchyBadge: `${lvl2} — 2.1 Participants Présents, Excusés & Absents`,
        targetPageIndex: 0,
        targetSectionHeading: '2. FEUILLE DE PRÉSENCE OFFICIELLE (PARTICIPANTS, EXCUSÉS & ABSENTS — CONNECTÉE MATRICE M4 & RACI)'
      },
      contextJustification: {
        hierarchyBadge: `${lvl1} — 3. Ordre du Jour Approuvé`,
        subHierarchyBadge: `${lvl2} — 3.1 Points Inscrits à l’Ordre du Jour`,
        targetPageIndex: 0,
        targetSectionHeading: '3. ORDRE DU JOUR APPROUVÉ EN OUVERTURE DE SÉANCE'
      },
      specificObjectives: {
        hierarchyBadge: `${lvl1} — 4. Déroulement des Travaux & Débats`,
        subHierarchyBadge: `${lvl2} — 4.1 Synthèse Factuelle des Présentations et Débats`,
        targetPageIndex: 0,
        targetSectionHeading: '4. DÉROULEMENT DES TRAVAUX, SYNTHÈSE DES DÉBATS ET ARBITRAGES PAR POINT DE L’ODJ'
      },
      methodologyApproach: {
        hierarchyBadge: `${lvl1} — 4. Déroulement des Travaux & Arbitrages`,
        subHierarchyBadge: `${lvl2} — 4.2 Résolutions Fermes et Arbitrages Validés`,
        targetPageIndex: 0,
        targetSectionHeading: '4. DÉROULEMENT DES TRAVAUX, SYNTHÈSE DES DÉBATS ET ARBITRAGES PAR POINT DE L’ODJ'
      },
      confidentialityClauses: {
        hierarchyBadge: `${lvl1} — 5. Matrice de Suivi des Décisions & Actions`,
        subHierarchyBadge: `${lvl2} — 5.1 Plan d’Actions Immédiat (M10/M7)`,
        targetPageIndex: 1,
        targetSectionHeading: '5. MATRICE DE SUIVI DES DÉCISIONS ET PLAN D’ACTIONS IMMÉDIAT (CONNECTÉE MATRICE M10)'
      },
      recommendationsLessons: {
        hierarchyBadge: `${lvl1} — 6. Prochaine Séance & Clôture`,
        subHierarchyBadge: `${lvl2} — 6.1 Date Prévisionnelle & Heure de Levée de Séance`,
        targetPageIndex: 1,
        targetSectionHeading: '6. PROCHAINE SÉANCE & CLÔTURE OFFICIELLE DES TRAVAUX'
      }
    };
    if (map[key]) return map[key]!;
  }

  if (docType === 'tdr_simplifie') {
    const map: Partial<Record<keyof CustomDocFields, DocFieldHierarchyAlignment>> = {
      recipientRepresentative: {
        hierarchyBadge: `${lvl1} — 1. Fiche Synoptique de l’Activité`,
        subHierarchyBadge: `${lvl2} — 1.1 Identification PTBA, Durée & Superviseur`,
        targetPageIndex: 0,
        targetSectionHeading: '1. FICHE SYNOPTIQUE DE L’ACTIVITÉ (TABLEAU D’IDENTIFICATION OPÉRATIONNELLE)'
      },
      contextJustification: {
        hierarchyBadge: `${lvl1} — 2. Contexte et Justification Opérationnelle`,
        subHierarchyBadge: `${lvl2} — 2.1 Synthèse Ciblée de l’Activité`,
        targetPageIndex: 0,
        targetSectionHeading: '2. CONTEXTE ET JUSTIFICATION OPÉRATIONNELLE (SYNTHÈSE CIBLÉE)'
      },
      specificObjectives: {
        hierarchyBadge: `${lvl1} — 3. Objectifs de la Prestation / Activité`,
        subHierarchyBadge: `${lvl2} — 3.1 Objectif Global & 3.2 Objectifs Spécifiques`,
        targetPageIndex: 0,
        targetSectionHeading: '3. OBJECTIFS DE LA PRESTATION / ACTIVITÉ (3.1 OBJECTIF GLOBAL & 3.2 OBJECTIFS SPÉCIFIQUES)'
      },
      methodologyApproach: {
        hierarchyBadge: `${lvl1} — 3. Objectifs & Méthodologie`,
        subHierarchyBadge: `${lvl2} — 3.3 Étapes Méthodologiques & Tâches Clés`,
        targetPageIndex: 0,
        targetSectionHeading: '3. OBJECTIFS DE LA PRESTATION / ACTIVITÉ (3.1 OBJECTIF GLOBAL & 3.2 OBJECTIFS SPÉCIFIQUES)'
      },
      extraField1: {
        hierarchyBadge: `${lvl1} — 4. Matrice des Tâches & Livrables Attendus`,
        subHierarchyBadge: `${lvl2} — 4.1 Résultats, Livrables & Instances de Validation`,
        targetPageIndex: 0,
        targetSectionHeading: '4. MATRICE DES TÂCHES, MÉTHODOLOGIE ET LIVRABLES ATTENDUS (CONNECTÉE MATRICES M2 & M9)'
      },
      governanceModalities: {
        hierarchyBadge: `${lvl1} — 5. Profil Requis & Grille sur 100 Points`,
        subHierarchyBadge: `${lvl2} — 5.1 Qualifications Clés & Barème Technique`,
        targetPageIndex: 1,
        targetSectionHeading: '5. PROFIL REQUIS (MATRICE M3) ET GRILLE D’ÉVALUATION RAPIDE SUR 100 POINTS'
      },
      confidentialityClauses: {
        hierarchyBadge: `${lvl1} — 6. Échéancier & Modalités de Paiement`,
        subHierarchyBadge: `${lvl2} — 6.1 Tranches de Paiement par Livrable (M9)`,
        targetPageIndex: 1,
        targetSectionHeading: '6. TABLEAU D’ÉCHÉANCIER, JOURS-HOMMES ET MODALITÉS DE PAIEMENT (CONNECTÉ MATRICE M9)'
      },
      recommendationsLessons: {
        hierarchyBadge: `${lvl1} — 7. Budget Prévisionnel & Dossier de Soumission`,
        subHierarchyBadge: `${lvl2} — 7.1 Enveloppe Estimative & Pièces de Candidature`,
        targetPageIndex: 1,
        targetSectionHeading: '7. BUDGET PRÉVISIONNEL DE L’ACTIVITÉ (MATRICE M5) & DOSSIER DE SOUMISSION RAPIDE'
      }
    };
    if (map[key]) return map[key]!;
  }

  // Champs d'en-tête / Cartouche communs aux Catégories B et C
  const page0Title =
    docType === 'ptt'
      ? `${lvl1} — Page 1 : Page de Garde Trimestrielle & Fiche de Validation (Trimestre Q1, Q2, Q3 ou Q4)`
      : docType === 'ptba'
      ? `${lvl1} — Page 1 : Page de Garde Officielle & Fiche d'Approbation (Comité de Pilotage & ANO Bailleur)`
      : `${lvl1} — 0. Page de Garde & Fiche Signalétique`;
  const page0SectionHeading =
    docType === 'ptt'
      ? '0. PAGE DE GARDE TRIMESTRIELLE & FICHE DE VALIDATION (TRIMESTRE Q1, Q2, Q3 OU Q4)'
      : docType === 'ptba'
      ? "0. PAGE DE GARDE OFFICIELLE & FICHE D'APPROBATION (COMITÉ DE PILOTAGE & ANO BAILLEUR)"
      : 'CHARTE OFFICIELLE DE PAGE DE GARDE & FICHE SIGNALÉTIQUE';

  if (key === 'referenceCode') {
    return {
      hierarchyBadge: page0Title,
      subHierarchyBadge:
        docType === 'ptba'
          ? `${lvl2} — 0.1 Code Projet, Année N & Référence Officielle du PTBA`
          : docType === 'ptt'
          ? `${lvl2} — 0.1 Code Projet & Référence du Plan Trimestriel (PTT)`
          : `${lvl2} — 0.1 Code Projet / Référence Documentaire`,
      targetPageIndex: 0,
      targetSectionHeading: page0SectionHeading
    };
  }
  if (key === 'locationCity') {
    return {
      hierarchyBadge: page0Title,
      subHierarchyBadge: `${lvl2} — 0.2 Zone Géographique / Pays & Ville`,
      targetPageIndex: 0,
      targetSectionHeading: page0SectionHeading
    };
  }
  if (key === 'recipientOrg') {
    return {
      hierarchyBadge: `${lvl1} — 0. Page de Garde & En-tête (Bloc Gauche : Bailleur / Commanditaire)`,
      subHierarchyBadge: `${lvl2} — 0.3 Bailleur de Fonds / Commanditaire : Nom de l’Organisation`,
      targetPageIndex: 0,
      targetSectionHeading: page0SectionHeading
    };
  }
  if (key === 'donorDepartment') {
    return {
      hierarchyBadge: `${lvl1} — 0. Page de Garde & En-tête (Bloc Gauche : Bailleur / Commanditaire)`,
      subHierarchyBadge: `${lvl2} — 0.3b Bailleur de Fonds / Commanditaire : Direction / Département`,
      targetPageIndex: 0,
      targetSectionHeading: page0SectionHeading
    };
  }
  if (key === 'executingOrgName') {
    return {
      hierarchyBadge: `${lvl1} — 0. Page de Garde & En-tête (Bloc Droite : Agence d’Exécution / Structure Pilote)`,
      subHierarchyBadge:
        docType === 'ptba'
          ? `${lvl2} — 0.4 Structure Pilote (UGP/AGEX) : Nom de l’Organisation`
          : `${lvl2} — 0.4 Agence d’Exécution / Structure Pilote : Nom de l’Organisation`,
      targetPageIndex: 0,
      targetSectionHeading: page0SectionHeading
    };
  }
  if (key === 'executingDepartment') {
    return {
      hierarchyBadge: `${lvl1} — 0. Page de Garde & En-tête (Bloc Droite : Agence d’Exécution / Structure Pilote)`,
      subHierarchyBadge:
        docType === 'ptba'
          ? `${lvl2} — 0.4b Structure Pilote (UGP/AGEX) : Direction / Département`
          : `${lvl2} — 0.4b Agence d’Exécution / Structure Pilote : Direction / Département`,
      targetPageIndex: 0,
      targetSectionHeading: page0SectionHeading
    };
  }
  if (key === 'recipientRepresentative') {
    return {
      hierarchyBadge: page0Title,
      subHierarchyBadge:
        docType === 'ptba'
          ? `${lvl2} — 0.5 Date d'Adoption COPIL & Référence de l'Avis de Non-Objection (ANO) du Bailleur`
          : docType === 'ptt'
          ? `${lvl2} — 0.5 Identification du Trimestre (90 jours) & Statut de Validation UGP`
          : `${lvl2} — 0.5 Autorité / Mandataire / Chef de Mission`,
      targetPageIndex: 0,
      targetSectionHeading: page0SectionHeading
    };
  }

  // Catégorie B : Documents courts (2 à 5 pages)
  if (docType === 'lettre_mission') {
    const map: Partial<Record<keyof CustomDocFields, DocFieldHierarchyAlignment>> = {
      contextJustification: {
        hierarchyBadge: `${lvl1} — 1. Contexte Institutionnel & Objet du Mandat`,
        subHierarchyBadge: `${lvl2} — 1.1 Cadre d’Investiture & 1.2 Portée`,
        targetPageIndex: 0,
        targetSectionHeading: '1. CONTEXTE INSTITUTIONNEL, OBJET DU MANDAT ET INVESTITURE OFFICIELLE'
      },
      specificObjectives: {
        hierarchyBadge: `${lvl1} — 2. Objectifs Assignés & Cibles SMART`,
        subHierarchyBadge: `${lvl2} — 2.1 Résultats Attendus & Indicateurs de Mandat`,
        targetPageIndex: 0,
        targetSectionHeading: '2. OBJECTIFS ASSIGNÉS, RÉSULTATS ATTENDUS ET CIBLES DE PERFORMANCE'
      },
      methodologyApproach: {
        hierarchyBadge: `${lvl1} — 3. Prérogatives, Moyens & Délégation`,
        subHierarchyBadge: `${lvl2} — 3.1 Autorité Fonctionnelle et Moyens Alloués`,
        targetPageIndex: 1,
        targetSectionHeading: '3. PRÉROGATIVES, MOYENS ALLOUÉS ET ENVELOPPE BUDGÉTAIRE SOUS DÉLÉGATION (MATRICE M5)'
      },
      governanceModalities: {
        hierarchyBadge: `${lvl1} — 3. Prérogatives & Gouvernance`,
        subHierarchyBadge: `${lvl2} — 3.2 Modalités de Reporting et Gouvernance COPIL`,
        targetPageIndex: 1,
        targetSectionHeading: '3. PRÉROGATIVES, MOYENS ALLOUÉS ET ENVELOPPE BUDGÉTAIRE SOUS DÉLÉGATION (MATRICE M5)'
      },
      confidentialityClauses: {
        hierarchyBadge: `${lvl1} — 3. Prérogatives & Déontologie`,
        subHierarchyBadge: `${lvl2} — 3.3 Déontologie et Obligation de Réserve`,
        targetPageIndex: 1,
        targetSectionHeading: '3. PRÉROGATIVES, MOYENS ALLOUÉS ET ENVELOPPE BUDGÉTAIRE SOUS DÉLÉGATION (MATRICE M5)'
      },
      recommendationsLessons: {
        hierarchyBadge: `${lvl1} — 4. Feuille de Route WBS & Instructions`,
        subHierarchyBadge: `${lvl2} — 4.1 Instructions Prioritaires & Priorités Immédiates`,
        targetPageIndex: 1,
        targetSectionHeading: '4. FEUILLE DE ROUTE WBS (M2), MATRICE RACI (M3) & LIVRABLES ATTENDUS (M9)'
      }
    };
    if (map[key]) return map[key]!;
  }

  if (docType === 'nda') {
    const map: Partial<Record<keyof CustomDocFields, DocFieldHierarchyAlignment>> = {
      contextJustification: {
        hierarchyBadge: `${lvl1} — Article 1 : Objet de l’Accord`,
        subHierarchyBadge: `${lvl2} — Article 1.1 Objet & Cadre de Coopération`,
        targetPageIndex: 0,
        targetSectionHeading: 'PRÉAMBULE & ARTICLE 1 — OBJET DE L’ACCORD ET PÉRIMÈTRE DU PORTEFEUILLE PROTÉGÉ'
      },
      specificObjectives: {
        hierarchyBadge: `${lvl1} — Article 1 & Article 2 : Informations Confidentielles`,
        subHierarchyBadge: `${lvl2} — Article 1.2 Périmètre des Données Protégées`,
        targetPageIndex: 0,
        targetSectionHeading: 'PRÉAMBULE & ARTICLE 1 — OBJET DE L’ACCORD ET PÉRIMÈTRE DU PORTEFEUILLE PROTÉGÉ'
      },
      methodologyApproach: {
        hierarchyBadge: `${lvl1} — Article 3 : Sécurité Logique ISO 27001`,
        subHierarchyBadge: `${lvl2} — Article 3.1 Protocole de Sécurité & Chiffrement`,
        targetPageIndex: 1,
        targetSectionHeading: 'ARTICLE 3 — MESURES DE SÉCURITÉ LOGIQUE, CHIFFREMENT & TRAÇABILITÉ (ISO/IEC 27001)'
      },
      confidentialityClauses: {
        hierarchyBadge: `${lvl1} — Article 4 : Non-Divulgation & Sanctions`,
        subHierarchyBadge: `${lvl2} — Article 4.1 Obligations Strictes & Durée Légale`,
        targetPageIndex: 1,
        targetSectionHeading: 'ARTICLE 3 — MESURES DE SÉCURITÉ LOGIQUE, CHIFFREMENT & TRAÇABILITÉ (ISO/IEC 27001)'
      },
      governanceModalities: {
        hierarchyBadge: `${lvl1} — Article 6 : Juridiction & Contrôle`,
        subHierarchyBadge: `${lvl2} — Article 6.1 Règlement des Différends & Arbitrage`,
        targetPageIndex: 2,
        targetSectionHeading: 'ARTICLE 6 — JURIDICTION COMPÉTENTE, CONTRÔLE ET RESTITUTION / DESTRUCTION DES SUPPORTS'
      },
      recommendationsLessons: {
        hierarchyBadge: `${lvl1} — Article 6 : Restitution & Clôture`,
        subHierarchyBadge: `${lvl2} — Article 6.2 Clôture des Accès & Destruction des Copies`,
        targetPageIndex: 2,
        targetSectionHeading: 'ARTICLE 6 — JURIDICTION COMPÉTENTE, CONTRÔLE ET RESTITUTION / DESTRUCTION DES SUPPORTS'
      }
    };
    if (map[key]) return map[key]!;
  }

  if (docType === 'tdr') {
    const map: Partial<Record<keyof CustomDocFields, DocFieldHierarchyAlignment>> = {
      contextJustification: {
        hierarchyBadge: `${lvl1} — 1. Contexte Stratégique & Justification`,
        subHierarchyBadge: `${lvl2} — 1.1 Contexte Général & 1.2 Ancrage Stratégique`,
        targetPageIndex: 1,
        targetSectionHeading: '1. CONTEXTE STRATÉGIQUE, JUSTIFICATION DE LA MISSION ET ALIGNEMENT INSTITUTIONNEL'
      },
      specificObjectives: {
        hierarchyBadge: `${lvl1} — 2. Objectifs de la Mission (SMART)`,
        subHierarchyBadge: `${lvl2} — 2.1 Objectif Général, Spécifiques & Extrants par Axe`,
        targetPageIndex: 1,
        targetSectionHeading: '2. OBJECTIFS DE LA MISSION (OBJECTIF GÉNÉRAL, OBJECTIFS SPÉCIFIQUES SMART & EXTRANTS)'
      },
      methodologyApproach: {
        hierarchyBadge: `${lvl1} — 3. Périmètre & Approche Méthodologique`,
        subHierarchyBadge: `${lvl2} — 3.1 Démarche Normée & 3.2 Structuration en 5 Phases`,
        targetPageIndex: 1,
        targetSectionHeading: '3. PÉRIMÈTRE D’INTERVENTION ET APPROCHE MÉTHODOLOGIQUE EXIGÉE'
      },
      governanceModalities: {
        hierarchyBadge: `${lvl1} — 6. Planification WBS/PERT & Gouvernance`,
        subHierarchyBadge: `${lvl2} — 6.1 Gouvernance & Circuit d’Approbation`,
        targetPageIndex: 3,
        targetSectionHeading: '6. PLANIFICATION OPÉRATIONNELLE WBS, CHRONOGRAMME GANTT & CHEMIN CRITIQUE PERT (MATRICE M2)'
      },
      recommendationsLessons: {
        hierarchyBadge: `${lvl1} — 8. Grille d’Évaluation des Offres (70/30)`,
        subHierarchyBadge: `${lvl2} — 8.1 Critères de Sélection & Points de Vigilance`,
        targetPageIndex: 4,
        targetSectionHeading: '8. GRILLE D’ÉVALUATION DES OFFRES (PONDÉRATION TECHNIQUE 70% / FINANCIÈRE 30%)'
      },
      confidentialityClauses: {
        hierarchyBadge: `${lvl1} — 8. Grille d’Évaluation & Déontologie`,
        subHierarchyBadge: `${lvl2} — 8.2 Clauses Déontologiques & Propriété Intellectuelle`,
        targetPageIndex: 4,
        targetSectionHeading: '8. GRILLE D’ÉVALUATION DES OFFRES (PONDÉRATION TECHNIQUE 70% / FINANCIÈRE 30%)'
      }
    };
    if (map[key]) return map[key]!;
  }

  if (docType === 'note_methodo') {
    const map: Partial<Record<keyof CustomDocFields, DocFieldHierarchyAlignment>> = {
      contextJustification: {
        hierarchyBadge: `${lvl1} — 1. Compréhension Critique du Contexte`,
        subHierarchyBadge: `${lvl2} — 1.1 Justification du Dispositif Méthodologique`,
        targetPageIndex: 1,
        targetSectionHeading: '1. COMPRÉHENSION CRITIQUE DU CONTEXTE, DES ENJEUX ET DES OBJECTIFS MÉTHODOLOGIQUES'
      },
      specificObjectives: {
        hierarchyBadge: `${lvl1} — 1. Compréhension Critique & Objectifs`,
        subHierarchyBadge: `${lvl2} — 1.2 Objectifs de Fiabilisation et de Pilotage`,
        targetPageIndex: 1,
        targetSectionHeading: '1. COMPRÉHENSION CRITIQUE DU CONTEXTE, DES ENJEUX ET DES OBJECTIFS MÉTHODOLOGIQUES'
      },
      methodologyApproach: {
        hierarchyBadge: `${lvl1} — 2. Architecture en 5 Phases & PERT/CPM`,
        subHierarchyBadge: `${lvl2} — 2.1 Démarche Opérationnelle & 2.2 Algorithme PERT`,
        targetPageIndex: 2,
        targetSectionHeading: '2. ARCHITECTURE MÉTHODOLOGIQUE EN 5 PHASES ET PLANIFICATION WBS / PERT (MATRICE M2)'
      },
      governanceModalities: {
        hierarchyBadge: `${lvl1} — 4. Organisation du Travail & Gouvernance RACI`,
        subHierarchyBadge: `${lvl2} — 4.1 Gouvernance des Données et Rituels de Validation`,
        targetPageIndex: 3,
        targetSectionHeading: '4. ORGANISATION DU TRAVAIL, CHARGE D’EXPERTS ET MATRICE RACI (MATRICE M3)'
      },
      confidentialityClauses: {
        hierarchyBadge: `${lvl1} — 5. Assurance Qualité & Sécurité S&E`,
        subHierarchyBadge: `${lvl2} — 5.1 Sécurité et Intégrité Documentaire`,
        targetPageIndex: 4,
        targetSectionHeading: '5. DISPOSITIF D’ASSURANCE QUALITÉ, SÉCURITÉ HYBRIDE (INDEXEDDB / JSON) ET LIMITES'
      },
      recommendationsLessons: {
        hierarchyBadge: `${lvl1} — 5. Assurance Qualité & Recommandations`,
        subHierarchyBadge: `${lvl2} — 5.2 Recommandations d’Exploitation`,
        targetPageIndex: 4,
        targetSectionHeading: '5. DISPOSITIF D’ASSURANCE QUALITÉ, SÉCURITÉ HYBRIDE (INDEXEDDB / JSON) ET LIMITES'
      }
    };
    if (map[key]) return map[key]!;
  }

  if (docType === 'grille_evaluation') {
    const map: Partial<Record<keyof CustomDocFields, DocFieldHierarchyAlignment>> = {
      contextJustification: {
        hierarchyBadge: `${lvl1} — 1. Note Méthodologique de la Grille`,
        subHierarchyBadge: `${lvl2} — 1.1 Objectif et Articulation avec la TdC`,
        targetPageIndex: 1,
        targetSectionHeading: '1. NOTE MÉTHODOLOGIQUE D’UTILISATION DE LA GRILLE ET ÉCHELLE DE NOTATION (1 À 5)'
      },
      specificObjectives: {
        hierarchyBadge: `${lvl1} — 1. Note Méthodologique & Questions OCDE/CAD`,
        subHierarchyBadge: `${lvl2} — 1.2 Structuration des Questions Évaluatives`,
        targetPageIndex: 1,
        targetSectionHeading: '1. NOTE MÉTHODOLOGIQUE D’UTILISATION DE LA GRILLE ET ÉCHELLE DE NOTATION (1 À 5)'
      },
      recommendationsLessons: {
        hierarchyBadge: `${lvl1} — 3. Grille d’Appréciation Chiffrée & Score`,
        subHierarchyBadge: `${lvl2} — 3.1 Règles de Pondération et Seuils d’Alerte`,
        targetPageIndex: 3,
        targetSectionHeading: '3. GRILLE D’APPRÉCIATION CHIFFRÉE ET SCORE PONDÉRÉ DU PORTEFEUILLE ACTIF'
      },
      methodologyApproach: {
        hierarchyBadge: `${lvl1} — 5. Registre des Risques & Biais de l’Évaluation`,
        subHierarchyBadge: `${lvl2} — 5.1 Triangulation Systématique à 3 Niveaux`,
        targetPageIndex: 4,
        targetSectionHeading: '5. REGISTRE DES RISQUES ET BIAIS MÉTHODOLOGIQUES DE L’ÉVALUATION (MATRICE M7)'
      },
      governanceModalities: {
        hierarchyBadge: `${lvl1} — 5. Registre des Risques & Gouvernance GRE`,
        subHierarchyBadge: `${lvl2} — 5.2 Gouvernance du Groupe de Référence (GRE)`,
        targetPageIndex: 4,
        targetSectionHeading: '5. REGISTRE DES RISQUES ET BIAIS MÉTHODOLOGIQUES DE L’ÉVALUATION (MATRICE M7)'
      },
      confidentialityClauses: {
        hierarchyBadge: `${lvl1} — 5. Registre des Risques & Éthique UNEG`,
        subHierarchyBadge: `${lvl2} — 5.3 Conformité Déontologique et Éthique UNEG`,
        targetPageIndex: 4,
        targetSectionHeading: '5. REGISTRE DES RISQUES ET BIAIS MÉTHODOLOGIQUES DE L’ÉVALUATION (MATRICE M7)'
      }
    };
    if (map[key]) return map[key]!;
  }

  // DOC 16 : PTBA (15 PAGES A4 CONSOLIDÉES EN VIS-À-VIS DIRECT — PAGES 1 À 15)
  if (docType === 'ptba') {
    const map: Partial<Record<keyof CustomDocFields, DocFieldHierarchyAlignment>> = {
      extraField1: {
        hierarchyBadge: `${lvl1} — Page 2 : Sommaire Exécutif, Liste des Sigles & Note d'Orientation Stratégique`,
        subHierarchyBadge: `${lvl2} — 0.6 Note d'Orientation Stratégique : Priorités Annuelles & Arbitrages Budgétaires`,
        targetPageIndex: 1,
        targetSectionHeading: "SOMMAIRE EXÉCUTIF, LISTE DES SIGLES & NOTE D'ORIENTATION STRATÉGIQUE"
      },
      contextJustification: {
        hierarchyBadge: `${lvl1} — Section 1 : Contexte, Processus d'Élaboration & Bilan de l'Année N-1`,
        subHierarchyBadge: `${lvl2} — 1.1 Bilan d'exécution physique et financière de l'exercice précédent (WBS, Décaissement, EVM)`,
        targetPageIndex: 2,
        targetSectionHeading: "SECTION 1 — CONTEXTE, PROCESSUS D'ÉLABORATION & BILAN DE L'ANNÉE N-1"
      },
      extraField2: {
        hierarchyBadge: `${lvl1} — Section 1 : Contexte, Processus d'Élaboration & Bilan de l'Année N-1`,
        subHierarchyBadge: `${lvl2} — 1.2 Enseignements clés, réussites, goulots d'étranglement et justification des reports sur l'année N`,
        targetPageIndex: 2,
        targetSectionHeading: "SECTION 1 — CONTEXTE, PROCESSUS D'ÉLABORATION & BILAN DE L'ANNÉE N-1"
      },
      extraField3: {
        hierarchyBadge: `${lvl1} — Section 1 : Contexte, Processus d'Élaboration & Bilan de l'Année N-1`,
        subHierarchyBadge: `${lvl2} — 1.3 Processus participatif d'élaboration, d'arbitrage et de validation du PTBA`,
        targetPageIndex: 2,
        targetSectionHeading: "SECTION 1 — CONTEXTE, PROCESSUS D'ÉLABORATION & BILAN DE L'ANNÉE N-1"
      },
      specificObjectives: {
        hierarchyBadge: `${lvl1} — Section 2 : Orientations Stratégiques de l'Année N & Cadre Logique Annuel (Matrice M1)`,
        subHierarchyBadge: `${lvl2} — 2.1 Alignement stratégique, objectifs annuels, Outcomes/Outputs, cibles et hypothèses critiques (M1)`,
        targetPageIndex: 3,
        targetSectionHeading: "SECTION 2 — ORIENTATIONS STRATÉGIQUES DE L'ANNÉE N & CADRE LOGIQUE ANNUEL (MATRICE M1)"
      },
      extraField4: {
        hierarchyBadge: `${lvl1} — Section 3 (Page 5) : Description Narrative des Composantes, Projets et Activités`,
        subHierarchyBadge: `${lvl2} — 3.1 Déclinaison narrative détaillée par Axe Stratégique / Composante, Sous-composante, Activités & Extrants`,
        targetPageIndex: 4,
        targetSectionHeading: 'SECTION 3 (PARTIE 1) — DESCRIPTION NARRATIVE DES COMPOSANTES, PROJETS ET ACTIVITÉS'
      },
      extraField5: {
        hierarchyBadge: `${lvl1} — Section 3 (Page 6) : Bénéficiaires & Stratégie de Mise en Œuvre des Acteurs (Matrice M4)`,
        subHierarchyBadge: `${lvl2} — 3.2 Ciblage des bénéficiaires et stratégie de mise en œuvre des acteurs et parties prenantes (Matrice M4)`,
        targetPageIndex: 5,
        targetSectionHeading: 'SECTION 3 (PARTIE 2) — BÉNÉFICIAIRES CIBLES & STRATÉGIE DE MISE EN ŒUVRE DES ACTEURS (MATRICE M4)'
      },
      methodologyApproach: {
        hierarchyBadge: `${lvl1} — Section 4 (Page 7) : Matrice d'Activités & Chronogramme Annuel Gantt par Trimestre (Matrice M2)`,
        subHierarchyBadge: `${lvl2} — 4.1 Programmation opérationnelle WBS & Gantt trimestriel Q1-Q4 ([TXT_WBS_PTBA_M2])`,
        targetPageIndex: 6,
        targetSectionHeading: "SECTION 4 (PARTIE 1) — MATRICE D'ACTIVITÉS & CHRONOGRAMME ANNUEL GANTT PAR TRIMESTRE (MATRICE M2)"
      },
      extraField6: {
        hierarchyBadge: `${lvl1} — Section 4 (Page 8) : Suite du Chronogramme Annuel Gantt Q1-Q4 & Chemin Critique PERT/CPM (Matrice M2)`,
        subHierarchyBadge: `${lvl2} — 4.2 Ordonnancement PERT/CPM (durées, marges libres/totales) et cibles physiques annuelles`,
        targetPageIndex: 7,
        targetSectionHeading: 'SECTION 4 (PARTIE 2) — SUITE DU CHRONOGRAMME ANNUEL GANTT Q1-Q4 & ANALYSE PERT/CPM (MATRICE M2)'
      },
      extraField7: {
        hierarchyBadge: `${lvl1} — Section 5 (Page 9) : Budget Annuel Consolidé par Source de Financement & Catégorie (Matrice M5)`,
        subHierarchyBadge: `${lvl2} — 5.1 Ventilation analytique Bailleur / Contrepartie Nationale et catégories de dépenses ([TXT_BUDGET_EVM_M5])`,
        targetPageIndex: 8,
        targetSectionHeading: 'SECTION 5 (PARTIE 1) — BUDGET ANNUEL CONSOLIDÉ PAR SOURCE DE FINANCEMENT & CATÉGORIE (MATRICE M5)'
      },
      extraField8: {
        hierarchyBadge: `${lvl1} — Section 5 (Page 10) : Répartition Trimestrielle Q1-Q4, EVM & Total Global PTBA (Matrice M5)`,
        subHierarchyBadge: `${lvl2} — 5.2 Synthèse budgétaire trimestrielle Q1-Q4, Engagé, AC, CPI et Total Budget Global PTBA`,
        targetPageIndex: 9,
        targetSectionHeading: 'SECTION 5 (PARTIE 2) — SYNTHÈSE BUDGÉTAIRE PAR COMPOSANTE, RÉPARTITION Q1-Q4 & PERFORMANCE EVM (MATRICE M5)'
      },
      extraField9: {
        hierarchyBadge: `${lvl1} — Section 6 (Page 11) : Plan de Décaissement Prévisionnel, Trésorerie & Appel de Fonds (DRF)`,
        subHierarchyBadge: `${lvl2} — 6.1 Plan de consommation des crédits, contrepartie nationale et seuils de réapprovisionnement (DRF)`,
        targetPageIndex: 10,
        targetSectionHeading: 'SECTION 6 — PLAN DE DÉCAISSEMENT PRÉVISIONNEL, TRÉSORERIE & APPEL DE FONDS (DRF)'
      },
      extraField10: {
        hierarchyBadge: `${lvl1} — Section 7 (Page 12) : Plan Annuel de Passation des Marchés - PPM Synthétique (Matrice M8)`,
        subHierarchyBadge: `${lvl2} — 7.1 Programmation des marchés (Fournitures, Services, Travaux), méthodes et calendrier DAO/Contrat (M8)`,
        targetPageIndex: 11,
        targetSectionHeading: 'SECTION 7 — PLAN ANNUEL DE PASSATION DES MARCHÉS - PPM SYNTHÉTIQUE (MATRICE M8)'
      },
      governanceModalities: {
        hierarchyBadge: `${lvl1} — Section 8 (Page 13) : Gouvernance RACI, Ressources Humaines & Organigramme (Matrice M3)`,
        subHierarchyBadge: `${lvl2} — 8.1 Répartition des responsabilités institutionnelles, experts mobilisés et charges H/J ([TXT_RACI_RH_M3])`,
        targetPageIndex: 12,
        targetSectionHeading: 'SECTION 8 — GOUVERNANCE RACI, RESSOURCES HUMAINES & ORGANIGRAMME (MATRICE M3)'
      },
      confidentialityClauses: {
        hierarchyBadge: `${lvl1} — Section 9 (Page 14) : Dispositif de Suivi-Évaluation, Livrables (M9) & Risques (M7)`,
        subHierarchyBadge: `${lvl2} — 9.1 Revues trimestrielles, supervision, audits et livrables contractuels ([TXT_QUALITE_LIVRABLES_M9])`,
        targetPageIndex: 13,
        targetSectionHeading: 'SECTION 9 — DISPOSITIF DE SUIVI-ÉVALUATION, LIVRABLES (MATRICE M9) & GESTION DES RISQUES (MATRICE M7)'
      },
      recommendationsLessons: {
        hierarchyBadge: `${lvl1} — Section 9 (Page 14) : Dispositif de Suivi-Évaluation, Livrables (M9) & Risques (M7)`,
        subHierarchyBadge: `${lvl2} — 9.2 Registre des risques RAID et mesures d'atténuation (Matrice M7)`,
        targetPageIndex: 13,
        targetSectionHeading: 'SECTION 9 — DISPOSITIF DE SUIVI-ÉVALUATION, LIVRABLES (MATRICE M9) & GESTION DES RISQUES (MATRICE M7)'
      },
      extraField11: {
        hierarchyBadge: `${lvl1} — Section 10 (Page 15) : Annexes Opérationnelles (Fiches de Tâches / Lots WBS) & Signatures`,
        subHierarchyBadge: `${lvl2} — 10.1 Fiches synthétiques de contractualisation des lots critiques (3R : Responsable, Résultat, Ressources)`,
        targetPageIndex: 14,
        targetSectionHeading: 'SECTION 10 — ANNEXES OPÉRATIONNELLES (FICHES DE TÂCHES / LOTS WBS — RÈGLE DES 3R) & SIGNATURES'
      }
    };
    if (map[key]) return map[key]!;
  }

  // DOC 17 : PTT (6 PAGES A4 CONSOLIDÉES EN VIS-À-VIS DIRECT — PAGES 1 À 6)
  if (docType === 'ptt') {
    const map: Partial<Record<keyof CustomDocFields, DocFieldHierarchyAlignment>> = {
      contextJustification: {
        hierarchyBadge: `${lvl1} — Section 1 : Rappel des Objectifs du Trimestre & Bilan Succinct du Trimestre Écoulé`,
        subHierarchyBadge: `${lvl2} — 1.1 Bilan rapide du trimestre précédent (activités achevées, en retard ou reportées et arbitrages)`,
        targetPageIndex: 1,
        targetSectionHeading: 'SECTION 1 — RAPPEL DES OBJECTIFS DU TRIMESTRE & BILAN SUCCINCT DU TRIMESTRE ÉCOULÉ'
      },
      specificObjectives: {
        hierarchyBadge: `${lvl1} — Section 1 : Rappel des Objectifs du Trimestre & Bilan Succinct du Trimestre Écoulé`,
        subHierarchyBadge: `${lvl2} — 1.2 Priorités opérationnelles extraites du PTBA pour les 90 jours à venir et sécurisation PERT/CPM`,
        targetPageIndex: 1,
        targetSectionHeading: 'SECTION 1 — RAPPEL DES OBJECTIFS DU TRIMESTRE & BILAN SUCCINCT DU TRIMESTRE ÉCOULÉ'
      },
      methodologyApproach: {
        hierarchyBadge: `${lvl1} — Section 2 : Planning Opérationnel Mois par Mois (Gantt Trimestriel - Matrice M2)`,
        subHierarchyBadge: `${lvl2} — 2.1 Activités de proximité par verbe d'action (Mois 1, Mois 2, Mois 3) & Livrables à M3 ([TXT_WBS_PTBA_M2])`,
        targetPageIndex: 2,
        targetSectionHeading: 'SECTION 2 — PLANNING OPÉRATIONNEL MOIS PAR MOIS (GANTT TRIMESTRIEL - MATRICE M2)'
      },
      extraField1: {
        hierarchyBadge: `${lvl1} — Section 3 : Budget Opérationnel & Plan de Trésorerie Trimestriel (Matrice M5)`,
        subHierarchyBadge: `${lvl2} — 3.1 Besoins réels en liquidités sur 3 mois (Mois 1, Mois 2, Mois 3) & Décaissement ([TXT_BUDGET_EVM_M5])`,
        targetPageIndex: 3,
        targetSectionHeading: 'SECTION 3 — BUDGET OPÉRATIONNEL & PLAN DE TRÉSORERIE TRIMESTRIEL (MATRICE M5)'
      },
      governanceModalities: {
        hierarchyBadge: `${lvl1} — Section 4 : Matrice RACI Trimestrielle d'Équipe (Matrice M3) & Livrables à 90 Jours (Matrice M9)`,
        subHierarchyBadge: `${lvl2} — 4.1 Grille RACI opérationnelle d'équipe (Coordonnateur, S&E, Passation, RAF, Consultant — [TXT_RACI_RH_M3])`,
        targetPageIndex: 4,
        targetSectionHeading: "SECTION 4 — MATRICE RACI TRIMESTRIELLE D'ÉQUIPE (MATRICE M3) & LIVRABLES À 90 JOURS (MATRICE M9)"
      },
      confidentialityClauses: {
        hierarchyBadge: `${lvl1} — Section 4 : Matrice RACI Trimestrielle d'Équipe (Matrice M3) & Livrables à 90 Jours (Matrice M9)`,
        subHierarchyBadge: `${lvl2} — 4.2 Tableau des livrables opérationnels attendus sur le trimestre (90 jours — [TXT_QUALITE_LIVRABLES_M9])`,
        targetPageIndex: 4,
        targetSectionHeading: "SECTION 4 — MATRICE RACI TRIMESTRIELLE D'ÉQUIPE (MATRICE M3) & LIVRABLES À 90 JOURS (MATRICE M9)"
      },
      recommendationsLessons: {
        hierarchyBadge: `${lvl1} — Section 5 : Gestion des Risques Immédiats, Contraintes Logistiques (Matrice M7) & Signatures`,
        subHierarchyBadge: `${lvl2} — 5.1 Goulots d'étranglement anticipés sur les 90 jours et actions correctives immédiates (Matrice M7)`,
        targetPageIndex: 5,
        targetSectionHeading: 'SECTION 5 — GESTION DES RISQUES IMMÉDIATS, CONTRAINTES LOGISTIQUES (MATRICE M7) & SIGNATURES'
      }
    };
    if (map[key]) return map[key]!;
  }

  // Catégorie C : Rapports lourds de 10 pages (cadrage, demarrage, cap, mi_parcours, rapport_final)
  const catCMap: Partial<Record<keyof CustomDocFields, DocFieldHierarchyAlignment>> = {
    contextJustification: {
      hierarchyBadge: `${lvl1} — 1. Diagnostic, Contexte & Constatations`,
      subHierarchyBadge: `${lvl2} — 1.1 Diagnostic / Faits Saillants & Résumé 6.1.2`,
      targetPageIndex: 6,
      targetSectionHeading: '1. DIAGNOSTIC INITIAL / CONSTATATIONS FACTUELLES / CONTEXTE (PAGE 7)'
    },
    specificObjectives: {
      hierarchyBadge: `${lvl1} — 1. Objectifs, TdC & Analyse des Écarts`,
      subHierarchyBadge: `${lvl2} — 1.2 Chaîne de Résultats / Analyse Causale & Résumé 6.1.3`,
      targetPageIndex: 6,
      targetSectionHeading: '1. DIAGNOSTIC INITIAL / CONSTATATIONS FACTUELLES / CONTEXTE (PAGE 7)'
    },
    methodologyApproach: {
      hierarchyBadge: `${lvl1} — 3. / 4. Exécution Financière EVM & Méthodologie`,
      subHierarchyBadge: `${lvl2} — 3.1 / 4.1 Analyse Coût-Efficacité & Démarche`,
      targetPageIndex: 7,
      targetSectionHeading: '3. / 4. EXÉCUTION FINANCIÈRE EVM & APPROCHE MÉTHODOLOGIQUE (PAGE 8)'
    },
    governanceModalities: {
      hierarchyBadge: `${lvl1} — 4. Gouvernance RACI, Coordination & Qualité`,
      subHierarchyBadge: `${lvl2} — 4.1 / 4.2 Instances COPIL & Arbitrages`,
      targetPageIndex: 7,
      targetSectionHeading: '4. GOUVERNANCE RACI, CONTRÔLE QUALITÉ & COORDINATION (PAGE 8)'
    },
    confidentialityClauses: {
      hierarchyBadge:
        docType === 'mi_parcours' || docType === 'rapport_final'
          ? `${lvl1} — 7. Capitalisation & Leçons Apprises`
          : `${lvl1} — 3. / 4. Conformité Fiduciaire & Éthique`,
      subHierarchyBadge:
        docType === 'mi_parcours' || docType === 'rapport_final'
          ? `${lvl2} — 7.1 Enseignements Tirés & Facteurs Explicatifs`
          : `${lvl2} — 3.2 / 4.3 Procédures Fiduciaires & Sécurité`,
      targetPageIndex: docType === 'mi_parcours' || docType === 'rapport_final' ? 8 : 7,
      targetSectionHeading:
        docType === 'mi_parcours' || docType === 'rapport_final'
          ? '7. CAPITALISATION DES LEÇONS APPRISES ET MATRICE DE RÉPONSE MANAGÉRIALE (PAGE 9)'
          : '3. / 4. CONFORMITÉ FIDUCIAIRE, ÉTHIQUE & SÉCURITÉ DES DONNÉES (PAGE 8)'
    },
    recommendationsLessons: {
      hierarchyBadge: `${lvl1} — 6. / 7. Prescriptions, Risques & Recommandations`,
      subHierarchyBadge: `${lvl2} — 6.1 / 7.2 Plan d’Action Prioritaire (M10)`,
      targetPageIndex: 8,
      targetSectionHeading: '6. / 7. PRESCRIPTIONS OPÉRATIONNELLES & RÉPONSE MANAGÉRIALE (PAGE 9)'
    }
  };
  if (catCMap[key]) return catCMap[key]!;

  return {
    hierarchyBadge: `${lvl1} — ${fieldIdx + 1}. ${field.label.split('—')[0].trim()}`,
    targetPageIndex: 0,
    targetSectionHeading: field.label
  };
}

export interface StructuredA4Page {
  pageTitle: string;
  pageSubtitle: string;
  sections: StructuredA4Section[];
  isSignaturePage?: boolean;
  orgStampDataUrl?: string;
  partnerStampDataUrl?: string;
}

/**
 * Formateur monétaire haute précision pour les documents A4 et exports PDF :
 * remplace tout espace insécable (\u202F, \u00A0) par un espace ASCII standard
 * afin d'éliminer tout caractère parasite dans jsPDF et garantir un affichage net.
 */
export function formatDocAmount(
  amountFCFA: number = 0,
  currency: CurrencyCode = 'FCFA',
  lang: LanguageCode = 'FR'
): string {
  return formatCurrency(amountFCFA, currency, lang).replace(/[\u202F\u00A0]/g, ' ');
}

export const INTERNATIONAL_ACRONYMS_TABLE: string[][] = [
  ['GAR / RBM', 'Gestion Axée sur les Résultats (Results-Based Management)', 'Approche de gestion centrée sur la performance et l’atteinte mesurable des effets et impacts (PNUD / OCDE).'],
  ['OCDE / CAD', 'Comité d’Aide au Développement de l’OCDE', 'Référentiel normatif des 6 critères d’évaluation : Pertinence, Cohérence, Efficacité, Efficience, Impact, Durabilité.'],
  ['UNEG', 'Groupe des Nations Unies pour l’Évaluation (UN Evaluation Group)', 'Normes et règles d’éthique, d’indépendance, d’impartialité et de qualité des évaluations institutionnelles.'],
  ['PMBOK 7 / ISO 21500', 'Project Management Body of Knowledge / Norme ISO 21500:2021', 'Standards internationaux de gouvernance, d’ordonnancement et de maîtrise intégrée de projet.'],
  ['PERT / CPM', 'Program Evaluation and Review Technique / Critical Path Method', 'Modélisation algorithmique du réseau logique des tâches et identification du chemin critique à marge nulle.'],
  ['WBS / SDP', 'Work Breakdown Structure (Structure de Découpage du Projet)', 'Décomposition hiérarchique du portefeuille en Axes, Projets, Phases et Livrables élémentaires.'],
  ['RACI', 'Responsable (Réalisateur), Approbateur, Consulté, Informé', 'Matrice d’attribution des rôles et des responsabilités décisionnelles et opérationnelles par activité.'],
  ['RAID', 'Risks, Assumptions, Issues, Dependencies', 'Tableau de bord de maîtrise des Risques, Hypothèses, Problèmes/Incidents et Dépendances critiques.'],
  ['PTBA', 'Plan de Travail et Budget Annuel', 'Instrument de programmation opérationnelle et financière articulant les activités, jalons et crédits alloués.'],
  ['TdC / ToC', 'Théorie du Changement (Theory of Change)', 'Modèle causal expliquant comment les intrants et activités génèrent les extrants, effets directs et impacts.'],
  ['SMART', 'Spécifique, Mesurable, Atteignable, Réaliste, Temporellement défini', 'Standard de formulation et de validation des indicateurs de performance du Cadre de Résultats.'],
  ['GEROS / CLEAR', 'Global Evaluation Reports Oversight System (UNICEF / BM)', 'Système international d’assurance qualité et de notation des rapports et grilles d’évaluation.']
];

export const DOC_TEMPLATE_CONFIGS: Record<InstitutionalDocType, DocTemplateConfig> = {
  tdr: {
    id: 'tdr',
    category: 'B',
    selectLabel: '1. Termes de Référence (TDR)',
    officialTitle: 'TERMES DE RÉFÉRENCE OFFICIELS (TDR)',
    subtitle: 'Protocole Catégorie B (5 Pages) · Cadrage de Mission, Livrables, Profils d’Experts, Gouvernance RACI & Budget',
    badgeText: 'PROTOCOLE CATÉGORIE B — STANDARD PNUD / BANQUE MONDIALE / UE',
    normativeReference: 'Normes PNUD, Banque Mondiale, BAD, UE, PMBOK 7th Ed. & ISO 21500:2021',
    fields: [
      { key: 'referenceCode', label: 'Code Projet / Référence TDR', placeholder: 'Ex: TDR-FAAB-2026-001' },
      { key: 'locationCity', label: 'Zone Géographique / Pays & Ville', placeholder: 'Ex: Abidjan, Côte d’Ivoire' },
      { key: 'recipientOrg', label: 'Bailleur de Fonds / Commanditaire — Nom de l’Organisation / Bailleur', placeholder: 'Ex: Banque Mondiale / PNUD / UE' },
      { key: 'donorDepartment', label: 'Bailleur de Fonds / Commanditaire — Direction / Département du Bailleur', placeholder: 'Ex: Département des Opérations & Financements' },
      { key: 'executingOrgName', label: 'Agence d’Exécution / Structure Pilote — Nom de l’Organisation / Institution Pilote', placeholder: 'Ex: Ministère / Agence Nationale d’Exécution' },
      { key: 'executingDepartment', label: 'Agence d’Exécution / Structure Pilote — Direction / Département Pilote', placeholder: 'Ex: Unité de Gestion du Projet (UGP) / Direction Générale' },
      { key: 'recipientRepresentative', label: 'Profil / Chef de Mission & Équipe Clé', placeholder: 'Ex: Chef de Mission Senior (15 ans d’exp.)' },
      { key: 'contextJustification', label: '1. Contexte Stratégique, Justification & Alignement (ODD, Politique Nationale)', placeholder: 'Contexte, justification et alignement stratégique...', multiline: true, rows: 3 },
      { key: 'specificObjectives', label: '2. Objectif Général, Objectifs Spécifiques SMART & Résultats Attendus', placeholder: 'Objectif global, objectifs spécifiques et livrables...', multiline: true, rows: 3 },
      { key: 'methodologyApproach', label: '3. Périmètre d’Intervention & Approche Méthodologique Exigée', placeholder: 'Approche GAR, PERT/CPM, démarche participative...', multiline: true, rows: 3 },
      { key: 'governanceModalities', label: '5. Gouvernance, Comité de Pilotage & Modalités de Paiement par Livrable', placeholder: 'Instances de validation, tranches de paiement...', multiline: true, rows: 2 },
      { key: 'confidentialityClauses', label: '7. Clauses Déontologiques, Propriété Intellectuelle & Confidentialité', placeholder: 'Propriété des livrables, réserve et éthique...', multiline: true, rows: 2 },
      { key: 'recommendationsLessons', label: '8. Critères d’Évaluation Technique/Financière & Points de Vigilance', placeholder: 'Pondération 70/30 et maîtrise du chemin critique...', multiline: true, rows: 2 }
    ]
  },
  lettre_mission: {
    id: 'lettre_mission',
    category: 'B',
    selectLabel: '2. Lettre de Mission Officielle',
    officialTitle: 'LETTRE DE MISSION & MANDAT OPÉRATIONNEL',
    subtitle: 'Protocole Catégorie B (2 Pages) · Investiture Officielle, Cibles de Performance, Moyens Alloués & Feuille de Route',
    badgeText: 'PROTOCOLE CATÉGORIE B — MANDAT EXÉCUTIF PMO / ISO 21500',
    normativeReference: 'Standards Internationaux de Gouvernance Publique/Privée, PMBOK 7th Ed. & GAR',
    fields: [
      { key: 'referenceCode', label: 'N° de Référence du Mandat', placeholder: 'Ex: LM-FAAB-2026-004' },
      { key: 'locationCity', label: 'Zone Géographique / Lieu d’Émission', placeholder: 'Ex: Abidjan, Côte d’Ivoire' },
      { key: 'recipientOrg', label: 'Bailleur de Fonds / Commanditaire — Nom de l’Organisation / Bailleur', placeholder: 'Ex: Conseil d’Administration / Sponsor Institutionnel' },
      { key: 'donorDepartment', label: 'Bailleur de Fonds / Commanditaire — Direction / Département du Bailleur', placeholder: 'Ex: Présidence du Comité de Pilotage (COPIL)' },
      { key: 'executingOrgName', label: 'Agence d’Exécution / Structure Pilote — Nom de l’Organisation / Institution Pilote', placeholder: 'Ex: Unité de Gestion du Programme Stratégique' },
      { key: 'executingDepartment', label: 'Agence d’Exécution / Structure Pilote — Direction / Département Pilote', placeholder: 'Ex: Direction des Opérations & du Pilotage PMO' },
      { key: 'recipientRepresentative', label: 'Mandataire Désigné (Nom, Prénoms & Titre)', placeholder: 'Ex: M./Mme le Chef de Projet Opérationnel' },
      { key: 'contextJustification', label: '1. Contexte Institutionnel & Objet du Mandat', placeholder: 'Enjeux stratégiques et mandat confié...', multiline: true, rows: 3 },
      { key: 'specificObjectives', label: '2. Objectifs Assignés, Cibles de Performance & Livrables Clés', placeholder: 'Cibles de réalisation physique, calendaire et budgétaire...', multiline: true, rows: 3 },
      { key: 'methodologyApproach', label: '3. Prérogatives, Moyens Alloués & Délégation Budgétaire', placeholder: 'Autorité fonctionnelle, arbitrage PERT et gestion d’équipe...', multiline: true, rows: 2 },
      { key: 'governanceModalities', label: '4. Redevabilité, Reporting Périodique & Instances (COPIL)', placeholder: 'Fréquence des revues et reporting au Sponsor...', multiline: true, rows: 2 },
      { key: 'confidentialityClauses', label: '5. Éthique, Obligation de Réserve & Loyauté Institutionnelle', placeholder: 'Règles déontologiques et prévention des conflits d’intérêts...', multiline: true, rows: 2 },
      { key: 'recommendationsLessons', label: '6. Feuille de Route Critique & Priorités Immédiates', placeholder: 'Actions prioritaires des 30 premiers jours...', multiline: true, rows: 2 }
    ]
  },
  cadrage: {
    id: 'cadrage',
    category: 'C',
    selectLabel: '3. Rapport de Cadrage & Cahier des Charges (ProDoc)',
    officialTitle: 'RAPPORT DE CADRAGE & DOCUMENT DE PROJET (PRODOC)',
    subtitle: 'Protocole Catégorie C (10 Pages) · Théorie du Changement, Périmètre Théorique vs Réel, WBS/PTBA, RACI & Cadre Logique',
    badgeText: 'PROTOCOLE CATÉGORIE C — STANDARD PRODOC PNUD / BANQUE MONDIALE',
    normativeReference: 'Référentiels PNUD (ProDoc), Banque Mondiale, UNEG, OCDE/CAD & ISO 21500:2021',
    fields: [
      { key: 'referenceCode', label: 'Code Document / Référence Baseline', placeholder: 'Ex: RCP-FAAB-2026-005' },
      { key: 'locationCity', label: 'Zone Géographique / Pays d’Intervention', placeholder: 'Ex: Abidjan, Côte d’Ivoire' },
      { key: 'recipientOrg', label: 'Bailleur de Fonds / Commanditaire — Nom de l’Organisation / Bailleur', placeholder: 'Ex: Partenaires Techniques et Financiers (PNUD / BM)' },
      { key: 'donorDepartment', label: 'Bailleur de Fonds / Commanditaire — Direction / Département du Bailleur', placeholder: 'Ex: Comité Stratégique & Division des Programmes' },
      { key: 'executingOrgName', label: 'Agence d’Exécution / Structure Pilote — Nom de l’Organisation / Institution Pilote', placeholder: 'Ex: Ministère de Tutelle / Agence Nationale d’Exécution' },
      { key: 'executingDepartment', label: 'Agence d’Exécution / Structure Pilote — Direction / Département Pilote', placeholder: 'Ex: Direction de la Planification & Cellule d’Exécution' },
      { key: 'recipientRepresentative', label: 'Sponsor Exécutif / Président du COPIL', placeholder: 'Ex: Directeur Général / Coordonnateur National' },
      { key: 'contextJustification', label: '1. Diagnostic Initial, Problématique & Justification du Cadrage', placeholder: 'Diagnostic initial, problématique et alignement stratégique...', multiline: true, rows: 3 },
      { key: 'specificObjectives', label: '2. Théorie du Changement (TdC) & Chaîne de Résultats (Impact/Effets/Extrants)', placeholder: 'Chaîne causale : Intrants -> Activités -> Extrants -> Effets -> Impact...', multiline: true, rows: 3 },
      { key: 'methodologyApproach', label: '3. Périmètre Théorique vs Réel, Évaluabilité & Spécifications Techniques', placeholder: 'Analyse de faisabilité, hypothèses critiques et approche mixte...', multiline: true, rows: 3 },
      { key: 'governanceModalities', label: '5. Architecture de Gouvernance (COPIL, Comité Technique, UGP & RACI)', placeholder: 'Mécanismes de coordination et circuit d’approbation...', multiline: true, rows: 2 },
      { key: 'confidentialityClauses', label: '6. Assurance Qualité, Normes Éthiques & Procédures Fiduciaires', placeholder: 'Standards ISO, contrôle interne et conformité...', multiline: true, rows: 2 },
      { key: 'recommendationsLessons', label: '7. Matrice des Risques (Board RAID) & Conditions Préalables', placeholder: 'Mesures d’atténuation des risques opérationnels et financiers...', multiline: true, rows: 2 }
    ]
  },
  demarrage: {
    id: 'demarrage',
    category: 'C',
    selectLabel: '4. Rapport de Démarrage (Inception Report)',
    officialTitle: 'RAPPORT DE DÉMARRAGE OPÉRATIONNEL (INCEPTION REPORT)',
    subtitle: 'Protocole Catégorie C (10 Pages) · Bilan de Mobilisation, Revue Documentaire, Outils de Collecte, PTBA Actualisé & Risques',
    badgeText: 'PROTOCOLE CATÉGORIE C — INCEPTION REPORT UNEG / UE / BAD',
    normativeReference: 'Lignes Directrices UNEG, EuropeAid (UE), BAD, PNUD & PMBOK 7th Ed.',
    fields: [
      { key: 'referenceCode', label: 'Référence du Rapport de Démarrage', placeholder: 'Ex: RD-FAAB-2026-006' },
      { key: 'locationCity', label: 'Zone Géographique / Site de Lancement', placeholder: 'Ex: Abidjan, Côte d’Ivoire' },
      { key: 'recipientOrg', label: 'Bailleur de Fonds / Commanditaire — Nom de l’Organisation / Bailleur', placeholder: 'Ex: Autorité Contractante & Partenaires Techniques et Financiers' },
      { key: 'donorDepartment', label: 'Bailleur de Fonds / Commanditaire — Direction / Département du Bailleur', placeholder: 'Ex: Secrétariat Technique du COPIL' },
      { key: 'executingOrgName', label: 'Agence d’Exécution / Structure Pilote — Nom de l’Organisation / Institution Pilote', placeholder: 'Ex: Agence d’Exécution / Structure Pilote' },
      { key: 'executingDepartment', label: 'Agence d’Exécution / Structure Pilote — Direction / Département Pilote', placeholder: 'Ex: Unité de Gestion du Projet (UGP) & Équipe de Démarrage' },
      { key: 'recipientRepresentative', label: 'Destinataire Officiel (Nom & Fonction)', placeholder: 'Ex: Président du Comité de Pilotage' },
      { key: 'contextJustification', label: '1. Rappel du Contexte & Bilan de la Phase de Mobilisation (Kick-Off)', placeholder: 'État de mobilisation des équipes, locaux et équipements...', multiline: true, rows: 3 },
      { key: 'specificObjectives', label: '2. Revue Documentaire Initiale & Ajustements Méthodologiques', placeholder: 'Enseignements de la revue documentaire et ajustements...', multiline: true, rows: 3 },
      { key: 'methodologyApproach', label: '3. Validation des Outils de Collecte, Échantillonnage & Logistique', placeholder: 'Guides d’entretien, questionnaires, plan de déploiement terrain...', multiline: true, rows: 2 },
      { key: 'governanceModalities', label: '4. Plan de Communication, Coordination & Réunions de Lancement', placeholder: 'Comptes-rendus de lancement et calendrier des revues...', multiline: true, rows: 2 },
      { key: 'confidentialityClauses', label: '5. Protocoles de Sécurité des Données & Conformité Éthique', placeholder: 'Habilitations, archivage et protection des données...', multiline: true, rows: 2 },
      { key: 'recommendationsLessons', label: '6. Risques Opérationnels Identifiés au Démarrage & Plan d’Urgence', placeholder: 'Mesures immédiates de déblocage et sécurisation des prérequis...', multiline: true, rows: 2 }
    ]
  },
  cap: {
    id: 'cap',
    category: 'C',
    selectLabel: '5. Rapport CAP (Constatations, Analyses, Prescriptions)',
    officialTitle: 'RAPPORT D’AVANCEMENT & D’EXÉCUTION PÉRIODIQUE (CAP)',
    subtitle: 'Protocole Catégorie C (10 Pages) · Constatations Factuelles, Analyse des Écarts, Suivi Budgétaire PTBA & Prescriptions',
    badgeText: 'PROTOCOLE CATÉGORIE C — AUDIT DE PERFORMANCE GAR & CONTRÔLE CAP',
    normativeReference: 'Standards GAR (Gestion Axée sur les Résultats), Contrôle de Gestion & PMBOK 7',
    fields: [
      { key: 'referenceCode', label: 'Référence du Rapport CAP', placeholder: 'Ex: CAP-FAAB-2026-007' },
      { key: 'locationCity', label: 'Zone Géographique / Périmètre Audité', placeholder: 'Ex: Abidjan, Côte d’Ivoire' },
      { key: 'recipientOrg', label: 'Bailleur de Fonds / Commanditaire — Nom de l’Organisation / Bailleur', placeholder: 'Ex: Comité de Pilotage & Bailleur de Fonds' },
      { key: 'donorDepartment', label: 'Bailleur de Fonds / Commanditaire — Direction / Département du Bailleur', placeholder: 'Ex: Direction du Suivi-Évaluation & de l’Audit de Performance' },
      { key: 'executingOrgName', label: 'Agence d’Exécution / Structure Pilote — Nom de l’Organisation / Institution Pilote', placeholder: 'Ex: Agence d’Exécution / Structure Pilote' },
      { key: 'executingDepartment', label: 'Agence d’Exécution / Structure Pilote — Direction / Département Pilote', placeholder: 'Ex: Cellule Centrale S&E & Contrôle de Gestion PMO' },
      { key: 'recipientRepresentative', label: 'Responsable Destinataire', placeholder: 'Ex: Coordonnateur Général / Contrôleur Général' },
      { key: 'contextJustification', label: '1. Constatations Factuelles sur l’Exécution Physique & Calendaire', placeholder: 'Faits saillants de la période, livrables produits et retards constatés...', multiline: true, rows: 3 },
      { key: 'specificObjectives', label: '2. Analyse Causale des Écarts (Début/Fin) & Goulots d’Étranglement', placeholder: 'Causes racines des glissements calendaires et des blocages...', multiline: true, rows: 3 },
      { key: 'methodologyApproach', label: '3. Exécution Budgétaire (PTBA vs Réalisé), Décaissement & Valeur Acquise', placeholder: 'Taux d’absorption budgétaire, efficience des dépenses...', multiline: true, rows: 2 },
      { key: 'governanceModalities', label: '4. Décisions d’Arbitrage Requises du Comité de Pilotage', placeholder: 'Réallocations budgétaires ou humains soumises à arbitrage...', multiline: true, rows: 2 },
      { key: 'confidentialityClauses', label: '5. Conformité aux Procédures Fiduciaires & Qualité des Livrables', placeholder: 'Vérification des pièces justificatives et validation des jalons...', multiline: true, rows: 2 },
      { key: 'recommendationsLessons', label: '6. Prescriptions Opérationnelles & Plan de Rattrapage Prioritaire', placeholder: 'Actions correctives chiffrées, responsables et échéances...', multiline: true, rows: 3 }
    ]
  },
  grille_evaluation: {
    id: 'grille_evaluation',
    category: 'B',
    selectLabel: '6. Grille d’évaluation (Matrice OCDE/CAD & UNEG)',
    officialTitle: 'GRILLE & MATRICE D’ÉVALUATION INSTITUTIONNELLE (OCDE/CAD)',
    subtitle: 'Protocole Catégorie B (5 Pages) · 6 Critères OCDE/CAD, Indicateurs SMART, Triangulation 3 Niveaux & Barème (1 à 5)',
    badgeText: 'PROTOCOLE CATÉGORIE B — NORME UNEG / OCDE-CAD / GEROS',
    normativeReference: 'Standards UNEG, Réseau OCDE/CAD (6 critères), UNICEF GEROS & Banque Mondiale',
    fields: [
      { key: 'referenceCode', label: 'Code de la Grille d’Évaluation', placeholder: 'Ex: GEV-FAAB-2026-010' },
      { key: 'locationCity', label: 'Zone Géographique / Périmètre Évalué', placeholder: 'Ex: Abidjan & Zones d’Intervention' },
      { key: 'recipientOrg', label: 'Bailleur de Fonds / Commanditaire — Nom de l’Organisation / Bailleur', placeholder: 'Ex: Comité d’Évaluation Indépendant & PTF (PNUD/BM/UE)' },
      { key: 'donorDepartment', label: 'Bailleur de Fonds / Commanditaire — Direction / Département du Bailleur', placeholder: 'Ex: Bureau Indépendant d’Évaluation & Assurance Qualité' },
      { key: 'executingOrgName', label: 'Agence d’Exécution / Structure Pilote — Nom de l’Organisation / Institution Pilote', placeholder: 'Ex: Structure Pilote du Programme' },
      { key: 'executingDepartment', label: 'Agence d’Exécution / Structure Pilote — Direction / Département Pilote', placeholder: 'Ex: Mission d’Évaluation & Cellule Suivi-Évaluation (S&E)' },
      { key: 'recipientRepresentative', label: 'Chef de Mission d’Évaluation / Expert Principal S&E', placeholder: 'Ex: Expert Senior en Suivi-Évaluation Certifié' },
      { key: 'contextJustification', label: '1. Note Méthodologique d’Utilisation de la Grille & Périmètre', placeholder: 'Objectif de la matrice d’évaluation, articulation avec la TdC et périmètre...', multiline: true, rows: 3 },
      { key: 'specificObjectives', label: '2. Structuration des Questions Évaluatives (Pertinence, Cohérence, Efficacité, Efficience, Impact, Durabilité)', placeholder: 'Questions clés par critère OCDE/CAD et critères de jugement...', multiline: true, rows: 3 },
      { key: 'methodologyApproach', label: '3. Protocole de Triangulation à 3 Niveaux & Collecte des Données', placeholder: 'Croisement des sources primaires/secondaires, méthodes mixtes...', multiline: true, rows: 3 },
      { key: 'governanceModalities', label: '4. Dispositif d’Assurance Qualité (Groupe de Référence GRE & Validation)', placeholder: 'Processus de revue par les pairs et validation de la grille...', multiline: true, rows: 2 },
      { key: 'confidentialityClauses', label: '5. Conformité Éthique UNEG, Biais Méthodologiques & Limites', placeholder: 'Indépendance, anonymat, consentement éclairé et gestion des biais...', multiline: true, rows: 2 },
      { key: 'recommendationsLessons', label: '6. Pondération du Barème (Score 1 à 5) & Seuils d’Alerte Décisionnels', placeholder: 'Règles de calcul du score global et déclenchement des recommandations...', multiline: true, rows: 2 }
    ]
  },
  mi_parcours: {
    id: 'mi_parcours',
    category: 'C',
    selectLabel: '7. Évaluation à Mi-Parcours (Mid-Term Review)',
    officialTitle: 'RAPPORT D’ÉVALUATION À MI-PARCOURS (MID-TERM REVIEW)',
    subtitle: 'Protocole Catégorie C (10 Pages) · Analyse des 6 Critères OCDE/CAD, Performance à Mi-Étape & Plan de Réorientation',
    badgeText: 'PROTOCOLE CATÉGORIE C — REVUE À MI-PARCOURS OCDE/CAD & UNEG',
    normativeReference: 'Critères OCDE/CAD, Normes UNEG, PNUD, UNICEF, Banque Mondiale & BAD',
    fields: [
      { key: 'referenceCode', label: 'Référence de l’Évaluation à Mi-Parcours', placeholder: 'Ex: REMP-FAAB-2026-008' },
      { key: 'locationCity', label: 'Zone Géographique / Pays Couvert', placeholder: 'Ex: Abidjan, Côte d’Ivoire' },
      { key: 'recipientOrg', label: 'Bailleur de Fonds / Commanditaire — Nom de l’Organisation / Bailleur', placeholder: 'Ex: Commission d’Évaluation & Partenaires Techniques et Financiers' },
      { key: 'donorDepartment', label: 'Bailleur de Fonds / Commanditaire — Direction / Département du Bailleur', placeholder: 'Ex: Comité Conjoint de Suivi à Mi-Parcours' },
      { key: 'executingOrgName', label: 'Agence d’Exécution / Structure Pilote — Nom de l’Organisation / Institution Pilote', placeholder: 'Ex: Agence d’Exécution / Structure Pilote' },
      { key: 'executingDepartment', label: 'Agence d’Exécution / Structure Pilote — Direction / Département Pilote', placeholder: 'Ex: Coordination Nationale & Unité S&E' },
      { key: 'recipientRepresentative', label: 'Président de la Commission / Évaluateur Principal', placeholder: 'Ex: Président de la Commission d’Évaluation' },
      { key: 'contextJustification', label: '1. Contexte de la Revue à Mi-Parcours & Rappel de la Théorie du Changement', placeholder: 'Justification de l’évaluation à mi-étape et évolution du contexte...', multiline: true, rows: 3 },
      { key: 'specificObjectives', label: '2. Pertinence, Cohérence & Efficacité à Mi-Parcours (Progrès vers les Extrants/Effets)', placeholder: 'Adéquation stratégique et degré d’atteinte des cibles à mi-étape...', multiline: true, rows: 3 },
      { key: 'methodologyApproach', label: '3. Efficience (Analyse Coût-Efficacité), Gouvernance & Viabilité Précoce', placeholder: 'Rythme de décaissement, respect des délais PERT et appropriation...', multiline: true, rows: 3 },
      { key: 'governanceModalities', label: '4. Fonctionnement Institutionnel, Coordination & Synergies Partenariales', placeholder: 'Efficacité du pilotage, du système S&E et de la coordination...', multiline: true, rows: 2 },
      { key: 'confidentialityClauses', label: '5. Contraintes Structurelles, Facteurs Externes & Leçons Apprises', placeholder: 'Facteurs ayant accéléré ou freiné la mise en œuvre...', multiline: true, rows: 2 },
      { key: 'recommendationsLessons', label: '6. Plan d’Action de Réorientation Stratégique & Opérationnelle (Seconde Moitié)', placeholder: 'Recommandations priorisées, réallocation budgétaire et calendrier révisé...', multiline: true, rows: 3 }
    ]
  },
  rapport_final: {
    id: 'rapport_final',
    category: 'C',
    selectLabel: '8. Rapport d’Évaluation Finale & Clôture',
    officialTitle: 'RAPPORT D’ÉVALUATION FINALE & D’ACHÈVEMENT (ICR / TERMINAL EVALUATION)',
    subtitle: 'Protocole Catégorie C (10 Pages) · Bilan Sommatif OCDE/CAD, Rendement Budgétaire Final, Impact, Durabilité & Quitus',
    badgeText: 'PROTOCOLE CATÉGORIE C — CLÔTURE & CAPITALISATION (ICR / UNEG)',
    normativeReference: 'Implementation Completion Report (Banque Mondiale), Terminal Evaluation (PNUD/UNEG) & ISO 21500',
    fields: [
      { key: 'referenceCode', label: 'Référence du Rapport Final', placeholder: 'Ex: RFA-FAAB-2026-009' },
      { key: 'locationCity', label: 'Zone Géographique / Lieu de Clôture', placeholder: 'Ex: Abidjan, Côte d’Ivoire' },
      { key: 'recipientOrg', label: 'Bailleur de Fonds / Commanditaire — Nom de l’Organisation / Bailleur', placeholder: 'Ex: Conseil d’Administration, Autorité Contractante & Bailleurs' },
      { key: 'donorDepartment', label: 'Bailleur de Fonds / Commanditaire — Direction / Département du Bailleur', placeholder: 'Ex: Direction des Opérations, Clôture & Quitus' },
      { key: 'executingOrgName', label: 'Agence d’Exécution / Structure Pilote — Nom de l’Organisation / Institution Pilote', placeholder: 'Ex: Agence d’Exécution / Structure Pilote' },
      { key: 'executingDepartment', label: 'Agence d’Exécution / Structure Pilote — Direction / Département Pilote', placeholder: 'Ex: Direction Générale & Cellule de Capitalisation' },
      { key: 'recipientRepresentative', label: 'Autorité de Clôture & Quitus', placeholder: 'Ex: Directeur Général / Représentant Résident' },
      { key: 'contextJustification', label: '1. Synthèse Rétrospective du Projet & Rappel de la Logique d’Intervention', placeholder: 'Historique complet du programme, de la conception à la clôture...', multiline: true, rows: 3 },
      { key: 'specificObjectives', label: '2. Bilan Définitif par Critère OCDE/CAD (Pertinence, Cohérence, Efficacité, Efficience)', placeholder: 'Évaluation sommative des extrants livrés et des effets obtenus...', multiline: true, rows: 3 },
      { key: 'methodologyApproach', label: '3. Analyse des Impacts à Long Terme, Effets Inattendus & Durabilité (Appropriation)', placeholder: 'Changements durables, viabilité financière/institutionnelle et stratégie de sortie...', multiline: true, rows: 3 },
      { key: 'governanceModalities', label: '4. Passation des Acquis, Transfert de Patrimoine & Dispositif Post-Projet', placeholder: 'Transfert des livrables aux structures pérennes et quitus...', multiline: true, rows: 2 },
      { key: 'confidentialityClauses', label: '5. Archivage Légal, Audit Financier Final & Propriété Intellectuelle', placeholder: 'Clôture des comptes, archivage numérique et conformité fiduciaire...', multiline: true, rows: 2 },
      { key: 'recommendationsLessons', label: '6. Capitalisation des Bonnes Pratiques & Recommandations Stratégiques Futures', placeholder: 'Enseignements majeurs pour la formulation des prochains programmes...', multiline: true, rows: 3 }
    ]
  },
  note_methodo: {
    id: 'note_methodo',
    category: 'B',
    selectLabel: '9. Note Méthodologique & Protocole S&E',
    officialTitle: 'NOTE MÉTHODOLOGIQUE & DISPOSITIF DE SUIVI-ÉVALUATION (S&E)',
    subtitle: 'Protocole Catégorie B (5 Pages) · Ingénierie GAR, Algorithme PERT/CPM, Échantillonnage, Assurance Qualité & Biais',
    badgeText: 'PROTOCOLE CATÉGORIE B — INGÉNIERIE GAR / PERT-CPM / ISO 21500',
    normativeReference: 'Normes ISO 21500:2021, PMBOK 7th Edition, Guides GAR PNUD & Standards UNEG',
    fields: [
      { key: 'referenceCode', label: 'Référence de la Note Méthodologique', placeholder: 'Ex: NM-FAAB-2026-002' },
      { key: 'locationCity', label: 'Zone Géographique / Lieu d’Établissement', placeholder: 'Ex: Abidjan, Côte d’Ivoire' },
      { key: 'recipientOrg', label: 'Bailleur de Fonds / Commanditaire — Nom de l’Organisation / Bailleur', placeholder: 'Ex: Comité Technique / COPIL / Bailleur de Fonds' },
      { key: 'donorDepartment', label: 'Bailleur de Fonds / Commanditaire — Direction / Département du Bailleur', placeholder: 'Ex: Direction des Études, de la Stratégie & du S&E' },
      { key: 'executingOrgName', label: 'Agence d’Exécution / Structure Pilote — Nom de l’Organisation / Institution Pilote', placeholder: 'Ex: Structure Pilote & Cabinet d’Ingénierie' },
      { key: 'executingDepartment', label: 'Agence d’Exécution / Structure Pilote — Direction / Département Pilote', placeholder: 'Ex: Département Ingénierie GAR & Modélisation PERT/CPM' },
      { key: 'recipientRepresentative', label: 'Autorité de Validation Méthodologique', placeholder: 'Ex: Président du Comité de Pilotage' },
      { key: 'contextJustification', label: '1. Compréhension Critique du Contexte & Enjeux de Pilotage', placeholder: 'Pourquoi cette architecture méthodologique est retenue...', multiline: true, rows: 3 },
      { key: 'specificObjectives', label: '2. Objectifs Méthodologiques, Fiabilisation des Indicateurs & Calcul des Écarts', placeholder: 'Résultats attendus de la démarche de planification et de suivi...', multiline: true, rows: 3 },
      { key: 'methodologyApproach', label: '3. Architecture en 5 Phases Normées, Modélisation PERT/CPM & Kanban', placeholder: 'Détail des 5 phases, calcul ES/EF/LS/LF et suivi temps réel...', multiline: true, rows: 3 },
      { key: 'governanceModalities', label: '4. Circuit de Collecte, Contrôle Qualité des Données & Validation des Jalons', placeholder: 'Rituels de revue, fréquence de mise à jour et validation...', multiline: true, rows: 2 },
      { key: 'confidentialityClauses', label: '5. Sécurité du Système d’Information S&E, Biais & Sauvegarde (IndexedDB / JSON)', placeholder: 'Règles d’accès, intégrité et traçabilité des sauvegardes...', multiline: true, rows: 2 },
      { key: 'recommendationsLessons', label: '6. Facteurs Clés de Succès & Recommandations d’Exploitation', placeholder: 'Bonnes pratiques pour maintenir la fiabilité du dispositif...', multiline: true, rows: 2 }
    ]
  },
  nda: {
    id: 'nda',
    category: 'B',
    selectLabel: '10. Accord de Confidentialité (NDA)',
    officialTitle: 'ACCORD INSTITUTIONNEL DE CONFIDENTIALITÉ & NON-DIVULGATION (NDA)',
    subtitle: 'Protocole Catégorie B (3 Pages) · Protection Juridique des Données Stratégiques, Budgets, Livrables & Propriété Intellectuelle',
    badgeText: 'PROTOCOLE CATÉGORIE B — INSTRUMENT JURIDIQUE & ISO/IEC 27001',
    normativeReference: 'Droit des Contrats Internationaux, Standards ISO/IEC 27001 & Protection des Données',
    fields: [
      { key: 'referenceCode', label: 'Référence de l’Accord NDA', placeholder: 'Ex: NDA-FAAB-2026-003' },
      { key: 'locationCity', label: 'Lieu de Juridiction & Signature', placeholder: 'Ex: Abidjan, Côte d’Ivoire' },
      { key: 'recipientOrg', label: 'Bailleur de Fonds / Commanditaire — Nom de l’Organisation (Partie Divulgatrice / Commanditaire)', placeholder: 'Ex: Autorité Contractante / Bailleur de Fonds' },
      { key: 'donorDepartment', label: 'Bailleur de Fonds / Commanditaire — Direction / Département (Direction Juridique)', placeholder: 'Ex: Direction des Affaires Juridiques & de la Conformité' },
      { key: 'executingOrgName', label: 'Agence d’Exécution / Structure Pilote — Nom de l’Organisation (Partie Réceptrice / Pilote)', placeholder: 'Ex: Partenaire Technique / Structure d’Exécution' },
      { key: 'executingDepartment', label: 'Agence d’Exécution / Structure Pilote — Direction / Département Pilote', placeholder: 'Ex: Direction Générale & Sécurité de l’Information' },
      { key: 'recipientRepresentative', label: 'Représentant Légal Habilité', placeholder: 'Ex: Directeur Général / Consultant Principal' },
      { key: 'contextJustification', label: 'Article 1 — Objet de l’Accord & Périmètre du Portefeuille Protégé', placeholder: 'Cadre de coopération justifiant l’échange d’informations sensibles...', multiline: true, rows: 3 },
      { key: 'specificObjectives', label: 'Article 2 — Définition des Informations Confidentielles & Données Couvertes', placeholder: 'Périmètre des données techniques, financières, JSON et PDF protégées...', multiline: true, rows: 3 },
      { key: 'methodologyApproach', label: 'Article 3 — Mesures de Sécurité, Chiffrement & Traçabilité Documentaire', placeholder: 'Protocoles de protection physique et logique exigés...', multiline: true, rows: 2 },
      { key: 'confidentialityClauses', label: 'Article 4 — Obligations de Non-Divulgation, Durée Légale & Sanctions', placeholder: 'Engagements stricts, durée de validité post-clôture et pénalités...', multiline: true, rows: 3 },
      { key: 'governanceModalities', label: 'Article 5 — Juridiction Compétente, Arbitrage & Contrôle de Conformité', placeholder: 'Règlement des différends et autorité de contrôle...', multiline: true, rows: 2 },
      { key: 'recommendationsLessons', label: 'Article 6 — Restitution / Destruction des Supports en Fin de Mission', placeholder: 'Protocole de clôture des accès et attestation de destruction...', multiline: true, rows: 2 }
    ]
  },
  courrier_admin: {
    id: 'courrier_admin',
    category: 'A',
    selectLabel: '11. Courrier Administratif Classique (1 Page)',
    officialTitle: 'COURRIER ADMINISTRATIF OFFICIEL',
    subtitle: 'Protocole Catégorie A (1 Page A4 Stricte) · Correspondance Administrative & Institutionnelle Normée Sans Page de Garde',
    badgeText: 'PROTOCOLE CATÉGORIE A — CORRESPONDANCE OFFICIELLE 1 PAGE A4',
    normativeReference: 'Normes de Rédaction Administrative Internationale, Protocole Institutionnel & Gouvernance PMO',
    fields: [
      { key: 'referenceCode', label: 'N° de Référence / Enregistrement du Courrier', placeholder: 'Ex: N° 011/FAAB/DG/PMO/2026' },
      { key: 'locationCity', label: 'Lieu d’Émission (Ville)', placeholder: 'Ex: Abidjan' },
      { key: 'recipientRepresentative', label: 'Destinataire (Civilité, Titre / Fonction)', placeholder: 'Ex: À l’attention de Monsieur / Madame le Directeur Général' },
      { key: 'recipientOrg', label: 'Structure / Institution Destinataire & Localité', placeholder: 'Ex: Direction Générale / Partenaire Institutionnel — Abidjan' },
      { key: 'contextJustification', label: 'Objet du Courrier Administratif', placeholder: 'Ex: Transmission de l’état d’avancement et demande d’approbation...', multiline: true, rows: 2 },
      { key: 'specificObjectives', label: 'Paragraphe 1 — Formule d’Appel, Contexte & Fait Générateur', placeholder: 'Ex: Madame, Monsieur, Faisant suite aux conclusions de notre revue...', multiline: true, rows: 3 },
      { key: 'methodologyApproach', label: 'Paragraphe 2 — Argumentaire Technique, Calendaire (PERT) & Financier', placeholder: 'Exposé factuel de la situation, avancement, budget et jalons...', multiline: true, rows: 4 },
      { key: 'governanceModalities', label: 'Paragraphe 3 — Action Attendue, Échéance & Conclusion', placeholder: 'Suites attendues, demande de validation ou d’audience...', multiline: true, rows: 3 },
      { key: 'recommendationsLessons', label: 'Formule de Politesse Administrative', placeholder: 'Ex: Veuillez agréer, Madame, Monsieur, l’expression de ma haute considération.', multiline: true, rows: 2 },
      { key: 'confidentialityClauses', label: 'Pièces Jointes (P.J.) & Copies (C.C. / Ampliations)', placeholder: 'Ex: P.J. : 01 Dossier Exécutif · C.C. : COPIL, Direction Financière, Archives', multiline: true, rows: 2 }
    ]
  },
  cv_executif: {
    id: 'cv_executif',
    category: 'D',
    selectLabel: 'Document 12 : CV Professionnel Exécutif Chef de Projet / Expert (1 Page stricte - Avec Photo)',
    officialTitle: 'CURRICULUM VITAE EXÉCUTIF — CHEF DE PROJET / EXPERT INTERNATIONAL',
    subtitle: 'Catégorie D (1 Page A4 Stricte · Sans Page de Garde · Avec Photo 3.5x4.5cm) · Profil Exécutif, Compétences Clés, Expériences Chiffrées & Certifications',
    badgeText: 'CATÉGORIE D — CV EXÉCUTIF 1 PAGE STRICTE (AVEC PHOTO)',
    normativeReference: 'Standards Internationaux RH & Consulting Exécutif (PMP® / PMBOK® 7 / ISO 21500 / GAR / S&E)',
    fields: [
      {
        key: 'recipientRepresentative',
        label: '[TXT_CV1_NOM_TITRE_COORDONNEES] — Nom complet, Titre d’expertise, Téléphone, Email, LinkedIn, Ville/Pays, Nationalité',
        placeholder: 'Ex: KOFFIE FABIEN MICHAEL | Directeur de Programme & Expert PMP® / S&E | +225 0748082739 | Email | Abidjan, Côte d’Ivoire | Nationalité : Ivoirienne',
        multiline: true,
        rows: 2
      },
      {
        key: 'contextJustification',
        label: '[TXT_CV1_PROFIL_EXECUTIF] — Pitch exécutif (4 à 5 lignes résumant les années d’expérience, les bailleurs pratiqués et le volume budgétaire cumulé géré)',
        placeholder: 'Pitch exécutif percutant avec années d’expérience, bailleurs (BM, BAD, UE, PNUD) et budget cumulé géré...',
        multiline: true,
        rows: 3
      },
      {
        key: 'specificObjectives',
        label: '[TXT_CV1_COMPETENCES_CLES] — Domaines d’expertise (Gestion de cycle de projet, GAR, S&E, Passation de marchés, Leadership)',
        placeholder: 'Ingénierie de projet & PMO | Suivi-Évaluation & GAR | Gouvernance, Fiduciaire & Passation de marchés...',
        multiline: true,
        rows: 3
      },
      {
        key: 'methodologyApproach',
        label: '[TXT_CV1_EXPERIENCES_MAJEURES] — 3 à 4 expériences phares (Période, Poste, Employeur/Bailleur, Budget géré, 3 réalisations chiffrées par poste)',
        placeholder: '2022–2026 : Directeur de Programme... | 2018–2022 : Expert Principal S&E... | 2014–2018 : Coordonnateur UGP...',
        multiline: true,
        rows: 4
      },
      {
        key: 'governanceModalities',
        label: '[TXT_CV1_FORMATIONS_CERTIFICATIONS] — Diplômes universitaires (Master, Ingénieur, Doctorat) et certifications (PMP®, PRINCE2®, ISO 21500, GAR)',
        placeholder: 'Master / Diplôme d’Ingénieur + Certifications PMP®, ISO 21500, GAR/UNEG, PRINCE2®...',
        multiline: true,
        rows: 2
      },
      {
        key: 'confidentialityClauses',
        label: '[TXT_CV1_LANGUES_OUTILS] — Langues parlées (niveau CECRL) et logiciels maîtrisés (MS Project, Primavera, KoboToolbox, Power BI, SPSS/R)',
        placeholder: 'Français (C2), Anglais (C1) | MS Project, Primavera P6, faab gar, KoboToolbox, Power BI, SPSS/R...',
        multiline: true,
        rows: 2
      }
    ]
  },
  cv_detaille: {
    id: 'cv_detaille',
    category: 'D',
    selectLabel: "Document 13 : CV Professionnel Détaillé / Appel d'Offres Bailleurs (2 à 4 Pages - Très Détaillé Avec Photo)",
    officialTitle: 'CURRICULUM VITAE DÉTAILLÉ — FORMAT INTERNATIONAL BAILLEURS (BM / BAD / UE / ONU)',
    subtitle: 'Catégorie D (4 Pages A4 · Sans Page de Garde · Avec Photo 3.5x4.5cm) · Format WB Form TECH-6 / EuropeAid / P11 ONU avec Attestation Signée',
    badgeText: 'CATÉGORIE D — CV DÉTAILLÉ APPEL D’OFFRES BAILLEURS (4 PAGES)',
    normativeReference: 'Formats Officiels Banque Mondiale (Form TECH-6), BAD, Union Européenne (EuropeAid) & Nations Unies (P11)',
    fields: [
      {
        key: 'recipientRepresentative',
        label: '[TXT_CVD_ETAT_CIVIL_COORDONNEES] — Nom, Prénoms, Date de naissance, Nationalité, Pays de résidence, Coordonnées complètes, Poste proposé sur la mission',
        placeholder: 'Nom, Prénoms, Date de naissance, Nationalité, Résidence, Tél, Email, Poste proposé sur la mission...',
        multiline: true,
        rows: 2
      },
      {
        key: 'contextJustification',
        label: '[TXT_CVD_SYNTHESE_QUALIFICATIONS] — Résumé approfondi des qualifications pertinentes pour la mission (10 à 15 lignes)',
        placeholder: 'Synthèse exécutive approfondie articulée autour de l’expertise technique, méthodologique et régionale...',
        multiline: true,
        rows: 3
      },
      {
        key: 'specificObjectives',
        label: '[TXT_CVD_EDUCATION_DIPLOMES] — Cursus académique complet (Institution, Pays, Diplôme obtenu, Dates, Spécialisation)',
        placeholder: 'Institution / Université, Pays, Période, Diplôme obtenu, Domaine de spécialisation...',
        multiline: true,
        rows: 2
      },
      {
        key: 'methodologyApproach',
        label: '[TXT_CVD_CERTIFICATIONS_FORMATIONS] — Formations continues, accréditations internationales et ateliers méthodologiques',
        placeholder: 'PMP®, ISO 21500, GAR PNUD, Évaluation CLEAR/UNEG, Passation des marchés BM/BAD/FIDIC...',
        multiline: true,
        rows: 2
      },
      {
        key: 'governanceModalities',
        label: '[TXT_CVD_EXPERIENCES_PAR_PAYS_BAILLEURS] — Synthèse des pays d’intervention et des bailleurs pratiqués (BM, BAD, UE, PNUD, UNICEF, AFD, etc.)',
        placeholder: 'Pays d’intervention et bailleurs bi/multilatéraux pratiqués...',
        multiline: true,
        rows: 2
      },
      {
        key: 'extraField1',
        label: '[TXT_CVD_HISTORIQUE_PROJETS_DETAILLE] — Détail exhaustif de chaque mission/poste (Dates, Pays, Bailleur, Intitulé du projet, Montant, Fonction, Tâches, Livrables)',
        placeholder: 'Détail chronologique inversé des missions, responsabilités techniques et livrables produits...',
        multiline: true,
        rows: 4
      },
      {
        key: 'confidentialityClauses',
        label: '[TXT_CVD_PUBLICATIONS_AFFILIATIONS] — Publications scientifiques, rapports majeurs rédigés et affiliations à des ordres/associations professionnels',
        placeholder: 'Publications, études de référence, manuels méthodologiques et affiliations (PMI, RFE, AfrEA)...',
        multiline: true,
        rows: 2
      },
      {
        key: 'extraField2',
        label: '[TXT_CVD_LANGUES_MATRICE] — Niveau détaillé (Lu, Écrit, Parlé — Cadre Européen CECRL) par langue',
        placeholder: 'Français (Lu C2, Écrit C2, Parlé C2) | Anglais (Lu C1, Écrit C1, Parlé C1)...',
        multiline: true,
        rows: 2
      },
      {
        key: 'recommendationsLessons',
        label: '[TXT_CVD_REFERENCES_ATTESTATION] — 3 Personnes de référence (Nom, Titre, Organisation, Email, Téléphone) + Texte d’attestation sur l’honneur',
        placeholder: '3 personnes de référence vérifiables (Nom, Fonction, Organisation, Email & Tél direct)...',
        multiline: true,
        rows: 3
      }
    ]
  },
  pv_reunion: {
    id: 'pv_reunion',
    category: 'D',
    selectLabel: 'Document 14 : Procès-Verbal (PV) Officiel de Réunion (1 à 2 Pages - Sans Page de Garde)',
    officialTitle: 'PROCÈS-VERBAL OFFICIEL DE RÉUNION & RELEVÉ DE DÉCISIONS',
    subtitle: 'Catégorie D (2 Pages A4 · Sans Page de Garde) · Fiche Signalétique, Feuille de Présence (M4), Débats, Arbitrages & Matrice d’Actions (M10/M7)',
    badgeText: 'CATÉGORIE D — PROCÈS-VERBAL OFFICIEL DE RÉUNION (SANS PAGE DE GARDE)',
    normativeReference: 'Standards de Gouvernance COPIL / Comité Technique, ISO 21500 & Suivi des Instances PMO',
    fields: [
      {
        key: 'recipientRepresentative',
        label: '[TXT_PV_METADONNEES_REUNION] — Intitulé du Projet, Type de réunion (COPIL, Réunion Technique, Démarrage, Arbitrage), Date, Heure début/fin, Lieu / Lien Visio, Président de séance, Rapporteur',
        placeholder: 'Type de réunion, Horaire, Lieu / Visio, Président de séance, Secrétaire de séance (Rapporteur)...',
        multiline: true,
        rows: 2
      },
      {
        key: 'governanceModalities',
        label: '[TXT_PV_LISTE_PARTICIPANTS] — Présents (Nom, Structure, Fonction, Contact), Excusés et Absents',
        placeholder: 'Liste des participants présents, excusés et absents (synchronisée avec la Matrice M4)...',
        multiline: true,
        rows: 3
      },
      {
        key: 'contextJustification',
        label: '[TXT_PV_ORDRE_DU_JOUR] — Liste numérotée des points inscrits à l’ordre du jour',
        placeholder: '1. Vérification du quorum... 2. État d’avancement WBS/PERT... 3. Exécution budgétaire PTBA... 4. Arbitrages...',
        multiline: true,
        rows: 3
      },
      {
        key: 'specificObjectives',
        label: '[TXT_PV_SYNTHESE_DEBATS_CONSTATS] — Résumé structuré des présentations, échanges, points d’accord et points de blocage par point de l’ordre du jour',
        placeholder: 'Synthèse factuelle des présentations, débats et constats point par point...',
        multiline: true,
        rows: 3
      },
      {
        key: 'methodologyApproach',
        label: '[TXT_PV_DECISIONS_ARBITRAGES] — Décisions fermes arrêtées en séance et arbitrages budgétaires ou méthodologiques validés',
        placeholder: 'DÉCISION N°01 : ... | DÉCISION N°02 : ... | DÉCISION N°03 : ...',
        multiline: true,
        rows: 3
      },
      {
        key: 'confidentialityClauses',
        label: '[TXT_PV_MATRICE_DECISIONS_ACTIONS] — Plan d’actions issu de la réunion (Action, Responsable, Échéance, Indicateur de réalisation)',
        placeholder: 'Actions immédiates arrêtées en séance (synchronisées avec les Matrices M10 et M7)...',
        multiline: true,
        rows: 2
      },
      {
        key: 'recommendationsLessons',
        label: '[TXT_PV_PROCHAINE_REUNION] — Date, lieu et ordre du jour prévisionnel de la prochaine séance + Heure de levée de séance',
        placeholder: 'Date et ordre du jour prévisionnel de la prochaine réunion + Heure exacte de levée de séance...',
        multiline: true,
        rows: 2
      }
    ]
  },
  tdr_simplifie: {
    id: 'tdr_simplifie',
    category: 'D',
    selectLabel: 'Document 15 : Termes de Référence (TDR) Simplifiés avec Tableaux (1 à 3 Pages - Sans Page de Garde)',
    officialTitle: 'TERMES DE RÉFÉRENCE SIMPLIFIÉS (OPÉRATIONNELS)',
    subtitle: 'Catégorie D (2 Pages A4 · Sans Page de Garde) · Fiche Synoptique, Matrice des Tâches/Livrables (M2/M9), Grille 100 pts (M3), Échéancier de Paiement & Budget (M5)',
    badgeText: 'CATÉGORIE D — TDR SIMPLIFIÉS OPÉRATIONNELS AVEC TABLEAUX (SANS PAGE DE GARDE)',
    normativeReference: 'Normes Opérationnelles d’Exécution PTBA, GAR, PMBOK 7 & Procédures Bailleurs (BM / BAD / UE / PNUD)',
    fields: [
      {
        key: 'recipientRepresentative',
        label: '[TXT_TDRS_IDENTIFICATION] — Intitulé de l’activité/consultation, Code activité (PTBA), Projet de rattachement, Lieu d’exécution, Durée (Jours/Hommes), Période souhaitée, Superviseur direct',
        placeholder: 'Code PTBA, Lieu d’exécution, Durée (H/J), Période souhaitée, Superviseur direct (UGP)...',
        multiline: true,
        rows: 2
      },
      {
        key: 'contextJustification',
        label: '[TXT_TDRS_CONTEXTE_JUSTIFICATION_BREF] — Contexte opérationnel direct et justification de l’activité (1 à 2 paragraphes ciblés)',
        placeholder: 'Contexte opérationnel direct expliquant pourquoi l’activité est lancée maintenant...',
        multiline: true,
        rows: 3
      },
      {
        key: 'specificObjectives',
        label: '[TXT_TDRS_OBJECTIFS_SPECIFIQUES] — Objectif global (1 phrase) et 2 à 4 objectifs spécifiques opérationnels',
        placeholder: 'Objectif global (3.1) et Objectifs spécifiques OS1, OS2, OS3 (3.2)...',
        multiline: true,
        rows: 3
      },
      {
        key: 'extraField1',
        label: '[TXT_TDRS_RESULTATS_LIVRABLES_TABLEAU] — Résultats attendus et livrables tangibles avec délais et critères de validation',
        placeholder: 'Synthèse des livrables attendus, formats, délais (J+X) et instances de validation...',
        multiline: true,
        rows: 2
      },
      {
        key: 'methodologyApproach',
        label: '[TXT_TDRS_METHODOLOGIE_TACHES] — Étapes clés d’exécution et tâches précises confiées à l’intervenant/équipe',
        placeholder: 'Étapes méthodologiques (Cadrage, Déploiement opérationnel, Restitution & Clôture)...',
        multiline: true,
        rows: 3
      },
      {
        key: 'governanceModalities',
        label: '[TXT_TDRS_PROFIL_QUALIFICATIONS] — Qualifications clés requises (Diplôme, années d’expérience, compétences techniques spécifiques)',
        placeholder: 'Diplôme requis (Bac+5), années d’expérience, compétences techniques et grille sur 100 points...',
        multiline: true,
        rows: 2
      },
      {
        key: 'confidentialityClauses',
        label: '[TXT_TDRS_CHRONOGRAMME_PAIEMENT] — Échéancier de réalisation et modalités de paiement par livrable',
        placeholder: 'Ventilation des paiements par livrable (ex: 20% L1 / 40% L2 / 40% L3) et conditions de déblocage...',
        multiline: true,
        rows: 2
      },
      {
        key: 'recommendationsLessons',
        label: '[TXT_TDRS_BUDGET_DOSSIER_CANDIDATURE] — Enveloppe budgétaire estimative (ou pièces constitutives du dossier de soumission rapide)',
        placeholder: 'Pièces constitutives du dossier de candidature rapide et instructions de soumission...',
        multiline: true,
        rows: 2
      }
    ]
  },

  ptba: {
    id: 'ptba',
    selectLabel: 'Plan de Travail et Budget Annuel (PTBA) (15 pages A4 consolidées)',
    officialTitle: 'PLAN DE TRAVAIL ET BUDGET ANNUEL (PTBA)',
    subtitle: '15 page(s) A4 consolidée(s) • Document Contractuel Annuel & Base Juridique d’Engagement',
    normativeReference: 'Standard PNUD / Banque Mondiale / BAD / UNICEF / UE / GAR (8 Matrices Maîtresses : M1, M2, M3, M4, M5, M7, M8, M9)',
    badgeText: 'PROTOCOLE CATÉGORIE B • STANDARD PNUD / BANQUE MONDIALE / UE',
    category: 'B',
    fields: [
      {
        key: 'referenceCode',
        label: 'Code Projet, Année N & Référence Officielle du PTBA (Page 1)',
        placeholder: 'Ex: PTBA-FAAB-2026-016',
        multiline: false
      },
      {
        key: 'locationCity',
        label: 'Zone Géographique / Pays & Ville d’Exécution (Page 1)',
        placeholder: 'Ex: Abidjan, République de Côte d’Ivoire',
        multiline: false
      },
      {
        key: 'recipientOrg',
        label: 'Bailleur de Fonds / Commanditaire : Nom de l’Organisation / Bailleur (Bloc Gauche — Page 1)',
        placeholder: 'Ex: Banque Mondiale / PNUD / BAD / UNICEF / Union Européenne',
        multiline: false
      },
      {
        key: 'donorDepartment',
        label: 'Bailleur de Fonds / Commanditaire : Direction / Département du Bailleur (Bloc Gauche — Page 1)',
        placeholder: 'Ex: Direction des Opérations & du Financement des Programmes',
        multiline: false
      },
      {
        key: 'executingOrgName',
        label: 'Structure Pilote (UGP/AGEX) : Nom de l’Organisation / Institution Pilote (Bloc Droite — Page 1)',
        placeholder: 'Ex: Ministère / Direction Générale / Agence d’Exécution',
        multiline: false
      },
      {
        key: 'executingDepartment',
        label: 'Structure Pilote (UGP/AGEX) : Direction / Département Pilote (Bloc Droite — Page 1)',
        placeholder: 'Ex: Unité de Gestion du Projet (UGP) & Cellule Suivi-Évaluation (S&E)',
        multiline: false
      },
      {
        key: 'recipientRepresentative',
        label: 'Date d’Adoption par le Comité de Pilotage (COPIL) & Référence de l’Avis de Non-Objection (ANO) du Bailleur (Page 1)',
        placeholder: 'Ex: Adoption COPIL : 15/01/2026 · Réf. ANO Bailleur : ANO-IDA-PNUD-2026-004',
        multiline: false
      },
      {
        key: 'extraField1',
        label: '0.6 Note d’Orientation Stratégique : Priorités Annuelles, Arbitrages Budgétaires & Liste des Sigles (Page 2)',
        placeholder: 'Synthèse exécutive des priorités annuelles, arbitrages du Comité de Pilotage et sigles clés...',
        multiline: true,
        rows: 5
      },
      {
        key: 'contextJustification',
        label: '1.1 Bilan d’Exécution Physique et Financière de l’Exercice Précédent N-1 (Taux WBS, Décaissement, Écarts EVM) (Page 3)',
        placeholder: 'Bilan chiffré N-1 : taux de réalisation WBS, taux de décaissement et analyse des écarts EVM...',
        multiline: true,
        rows: 5
      },
      {
        key: 'extraField2',
        label: '1.2 Enseignements Clés, Réussites, Goulots d’Étranglement & Justification des Reports sur l’Année N (Page 3)',
        placeholder: 'Leçons apprises N-1, blocages rencontrés et justification des activités reportées sur l’année N...',
        multiline: true,
        rows: 4
      },
      {
        key: 'extraField3',
        label: '1.3 Processus Participatif d’Élaboration, d’Arbitrage et de Validation du PTBA (Page 3)',
        placeholder: 'Ateliers participatifs, revue technique, arbitrage budgétaire COPIL et obtention de l’ANO...',
        multiline: true,
        rows: 4
      },
      {
        key: 'specificObjectives',
        label: '2.1 Orientations Stratégiques de l’Année N, Outcomes/Outputs, Cibles Annuelles & Hypothèses Critiques (Matrice M1 — Page 4)',
        placeholder: 'Objectifs annuels, contribution aux indicateurs d’effet et d’extrant, baselines, cibles et hypothèses...',
        multiline: true,
        rows: 5
      },
      {
        key: 'extraField4',
        label: '3.1 Description Narrative des Composantes, Sous-composantes, Projets, Activités & Extrants (Page 5)',
        placeholder: 'Déclinaison narrative détaillée par Axe Stratégique / Composante, projets, activités et résultats...',
        multiline: true,
        rows: 5
      },
      {
        key: 'extraField5',
        label: '3.2 Bénéficiaires Cibles & Stratégie de Mise en Œuvre des Acteurs et Parties Prenantes (Matrice M4 — Page 6)',
        placeholder: 'Populations/structures bénéficiaires et modalités d’implication des parties prenantes (Matrice M4)...',
        multiline: true,
        rows: 5
      },
      {
        key: 'methodologyApproach',
        label: '4.1 Matrice d’Activités WBS & Chronogramme Annuel Gantt par Trimestre Q1-Q4 (Matrice M2 - [TXT_WBS_PTBA_M2] — Page 7)',
        placeholder: 'Organisation opérationnelle des activités sur Q1, Q2, Q3, Q4, responsables et extrants...',
        multiline: true,
        rows: 5
      },
      {
        key: 'extraField6',
        label: '4.2 Suite du Chronogramme Annuel Gantt Q1-Q4 & Analyse du Chemin Critique PERT/CPM (Matrice M2 — Page 8)',
        placeholder: 'Analyse des durées, marges libres/totales PERT/CPM, jalons critiques et cibles annuelles...',
        multiline: true,
        rows: 5
      },
      {
        key: 'extraField7',
        label: '5.1 Budget Annuel Consolidé par Source de Financement (Bailleur / Contrepartie) & Catégorie (Matrice M5 - [TXT_BUDGET_EVM_M5] — Page 9)',
        placeholder: 'Ventilation financière analytique entre Bailleur et Contrepartie Nationale par catégorie de dépense...',
        multiline: true,
        rows: 5
      },
      {
        key: 'extraField8',
        label: '5.2 Programmation Budgétaire Trimestrielle Q1-Q4, Performance EVM (AC, EV, CPI) & Total Global PTBA (Matrice M5 — Page 10)',
        placeholder: 'Répartition trimestrielle des crédits (Q1 à Q4), engagements, indice CPI et synthèse globale PTBA...',
        multiline: true,
        rows: 5
      },
      {
        key: 'extraField9',
        label: '6.1 Plan de Décaissement Prévisionnel, Trésorerie & Appel de Fonds (DRF) (Page 11)',
        placeholder: 'Rythme de consommation des crédits, déblocage de la contrepartie nationale et seuils DRF...',
        multiline: true,
        rows: 5
      },
      {
        key: 'extraField10',
        label: '7.1 Plan Annuel de Passation des Marchés - PPM Synthétique (Matrice M8 — Page 12)',
        placeholder: 'Dispositions de passation des marchés (Fournitures, Services, Travaux), seuils, méthodes et calendrier DAO...',
        multiline: true,
        rows: 5
      },
      {
        key: 'governanceModalities',
        label: '8.1 Gouvernance RACI, Ressources Humaines, Qualifications & Charge H/J (Matrice M3 - [TXT_RACI_RH_M3] — Page 13)',
        placeholder: 'Répartition des responsabilités institutionnelles R/A/C/I, experts mobilisés et charges Homme/Jours...',
        multiline: true,
        rows: 5
      },
      {
        key: 'confidentialityClauses',
        label: '9.1 Dispositif de Suivi-Évaluation, Revues Trimestrielles, Audits & Livrables Contractuels (Matrice M9 - [TXT_QUALITE_LIVRABLES_M9] — Page 14)',
        placeholder: 'Calendrier des revues trimestrielles, missions de supervision, audits et livrables contractuels...',
        multiline: true,
        rows: 4
      },
      {
        key: 'recommendationsLessons',
        label: '9.2 Gestion des Risques Opérationnels, Fiduciaires & Mesures d’Atténuation (Matrice M7 — Page 14)',
        placeholder: 'Registre des risques RAID de l’exercice annuel et mesures d’atténuation...',
        multiline: true,
        rows: 4
      },
      {
        key: 'extraField11',
        label: '10.1 Annexes Opérationnelles : Fiches de Tâches / Lots WBS (Règle des 3R : Responsable, Résultat, Ressources — Page 15)',
        placeholder: 'Contractualisation interne des lots critiques selon la règle des 3R et dispositions de signature...',
        multiline: true,
        rows: 5
      }
    ]
  },

  ptt: {
    id: 'ptt',
    selectLabel: 'Plan de Travail Trimestriel (PTT) (6 pages A4 consolidées)',
    officialTitle: 'PLAN DE TRAVAIL TRIMESTRIEL (PTT)',
    subtitle: '6 page(s) A4 consolidée(s) • Outil de Pilotage Opérationnel de Proximité (90 jours)',
    normativeReference: 'Standard PNUD / Banque Mondiale / BAD / UNICEF / UE (5 Matrices Maîtresses : M2, M3, M5, M7, M9)',
    badgeText: 'PROTOCOLE CATÉGORIE B • STANDARD PNUD / BANQUE MONDIALE / UE',
    category: 'B',
    fields: [
      {
        key: 'referenceCode',
        label: 'Code Document / Référence Officielle du PTT (Page 1)',
        placeholder: 'Ex: PTT-FAAB-2026-Q1-017',
        multiline: false
      },
      {
        key: 'locationCity',
        label: 'Zone Géographique / Pays & Sites Opérationnels (Page 1)',
        placeholder: 'Ex: Abidjan & Zones d’Intervention',
        multiline: false
      },
      {
        key: 'recipientOrg',
        label: 'Bailleur de Fonds / Commanditaire : Nom de l’Organisation / Bailleur (Bloc Gauche — Page 1)',
        placeholder: 'Ex: Banque Mondiale / PNUD / BAD / UNICEF / Union Européenne',
        multiline: false
      },
      {
        key: 'donorDepartment',
        label: 'Bailleur de Fonds / Commanditaire : Direction / Département du Bailleur (Bloc Gauche — Page 1)',
        placeholder: 'Ex: Direction des Opérations & du Suivi de Portefeuille',
        multiline: false
      },
      {
        key: 'executingOrgName',
        label: 'Unité de Gestion du Projet (UGP / Structure Pilote) : Nom de l’Organisation (Bloc Droite — Page 1)',
        placeholder: 'Ex: Ministère / Direction Générale / Agence d’Exécution',
        multiline: false
      },
      {
        key: 'executingDepartment',
        label: 'Unité de Gestion du Projet (UGP) : Direction / Cellule Opérationnelle (Bloc Droite — Page 1)',
        placeholder: 'Ex: Unité de Gestion du Projet (UGP) & Cellule Suivi-Évaluation (S&E)',
        multiline: false
      },
      {
        key: 'recipientRepresentative',
        label: 'Identification du Trimestre (90 jours) & Statut de Validation par l’UGP (Page 1)',
        placeholder: 'Ex: Trimestre 1 (Q1 — 90 jours) · Statut : Validé par le Coordonnateur UGP',
        multiline: false
      },
      {
        key: 'contextJustification',
        label: '1.1 Bilan Rapide du Trimestre Précédent (Activités Achevées, en Retard ou Reportées & Arbitrages — Page 2)',
        placeholder: 'Synthèse rapide du trimestre écoulé : réalisations, glissements calendaires et arbitrages UGP...',
        multiline: true,
        rows: 5
      },
      {
        key: 'specificObjectives',
        label: '1.2 Priorités Opérationnelles Extraites du PTBA pour les 90 Jours à Venir & Sécurisation PERT/CPM (Page 2)',
        placeholder: 'Objectifs prioritaires à 90 jours, cibles trimestrielles et protection du chemin critique PERT/CPM...',
        multiline: true,
        rows: 5
      },
      {
        key: 'methodologyApproach',
        label: '2.1 Planning Opérationnel Mois par Mois par Verbe d’Action (Mois 1, Mois 2, Mois 3 — Matrice M2 - [TXT_WBS_PTBA_M2] — Page 3)',
        placeholder: 'Cadence opérationnelle sur Mois 1, Mois 2 et Mois 3, responsables associés et livrables à M3...',
        multiline: true,
        rows: 5
      },
      {
        key: 'extraField1',
        label: '3.1 Budget Opérationnel & Plan de Trésorerie Trimestriel sur 3 Mois (Matrice M5 - [TXT_BUDGET_EVM_M5] — Page 4)',
        placeholder: 'Besoins réels en liquidités sur Mois 1, Mois 2 et Mois 3 par rubrique et source de financement...',
        multiline: true,
        rows: 5
      },
      {
        key: 'governanceModalities',
        label: '4.1 Matrice RACI Trimestrielle d’Équipe (Coordonnateur, S&E, Passation, RAF, Consultant — Matrice M3 - [TXT_RACI_RH_M3] — Page 5)',
        placeholder: 'Répartition opérationnelle des rôles R, A, C, I au sein de l’équipe projet sur les 90 jours...',
        multiline: true,
        rows: 5
      },
      {
        key: 'confidentialityClauses',
        label: '4.2 Livrables Opérationnels Attendus à 90 Jours & Critères de Validation (Matrice M9 - [TXT_QUALITE_LIVRABLES_M9] — Page 5)',
        placeholder: 'Liste des livrables attendus sur le trimestre, échéances M1/M2/M3 et conditions d’approbation...',
        multiline: true,
        rows: 4
      },
      {
        key: 'recommendationsLessons',
        label: '5.1 Gestion des Risques Immédiats à 90 Jours & Contraintes Logistiques (Matrice M7 — Page 6)',
        placeholder: 'Goulots d’étranglement anticipés sur les 90 jours, contraintes terrain et actions correctives immédiates...',
        multiline: true,
        rows: 5
      }
    ]
  },

  // ==========================================================================
  // CATÉGORIE S — 7 PRÉSENTATIONS DE RÉUNION DISTINCTES (FORMAT SLIDES 16:9 PAYSAGE — DOCS 16 À 22)
  // ==========================================================================
  slides_tdr: {
    id: 'slides_tdr',
    selectLabel: '16. Présentation du Programme (basée sur les TDR) — 10 à 12 Slides',
    officialTitle: 'PRÉSENTATION DU PROGRAMME (TERMES DE RÉFÉRENCE — TDR)',
    subtitle: '10 Diapositives Paysage 16:9 • Présentation du Programme (TDR), Axes Stratégiques, PERT/CPM, RACI & Budget',
    normativeReference: 'Standard PNUD / Banque Mondiale / BAD / UE (5 Matrices Maîtresses : M1, M2, M3, M5, M9)',
    badgeText: 'PRÉSENTATION DE RÉUNION 16:9 PAYSAGE • PRÉSENTATION DU PROGRAMME (TDR)',
    category: 'S',
    fields: [
      {
        key: 'referenceCode',
        label: 'Code Projet & Référence Officielle de la Présentation TDR (Slide 1)',
        placeholder: 'Ex: SLIDES-TDR-FAAB-2026-016',
        multiline: false
      },
      {
        key: 'locationCity',
        label: 'Zone Géographique / Pays & Ville de la Réunion (Slide 1)',
        placeholder: 'Ex: Abidjan, République de Côte d’Ivoire',
        multiline: false
      },
      {
        key: 'recipientOrg',
        label: 'Bailleur de Fonds / Commanditaire : Nom de l’Organisation (Bloc Gauche — Slide 1)',
        placeholder: 'Ex: Banque Mondiale / PNUD / BAD / Union Européenne',
        multiline: false
      },
      {
        key: 'donorDepartment',
        label: 'Bailleur de Fonds / Commanditaire : Direction / Département (Bloc Gauche — Slide 1)',
        placeholder: 'Ex: Direction des Opérations & du Financement des Programmes',
        multiline: false
      },
      {
        key: 'executingOrgName',
        label: 'Agence d’Exécution / Structure Pilote : Nom de l’Organisation (Bloc Droite — Slide 1)',
        placeholder: 'Ex: Ministère / Direction Générale / Agence d’Exécution',
        multiline: false
      },
      {
        key: 'executingDepartment',
        label: 'Agence d’Exécution / Structure Pilote : Direction / Département (Bloc Droite — Slide 1)',
        placeholder: 'Ex: Unité de Gestion du Projet (UGP) & Cellule Suivi-Évaluation (S&E)',
        multiline: false
      },
      {
        key: 'recipientRepresentative',
        label: 'Présentateur(s), Instance Décisionnelle & Statut de la Session (Slide 1)',
        placeholder: 'Ex: Comité de Pilotage Stratégique (COPIL) — Session de Validation des TDR',
        multiline: false
      }
    ]
  },

  slides_cadrage: {
    id: 'slides_cadrage',
    selectLabel: '17. Présentation du Rapport de Cadrage — 10 à 12 Slides',
    officialTitle: 'PRÉSENTATION DU RAPPORT DE CADRAGE & DOCUMENT DE PROJET (PRODOC)',
    subtitle: '11 Diapositives Paysage 16:9 • Diagnostic Initial, Théorie du Changement (M1), Parties Prenantes (M4), WBS/PERT (M2), Budget (M5) & Risques (M7)',
    normativeReference: 'Standard ProDoc PNUD / Banque Mondiale / BAD / ISO 21500 (8 Matrices Maîtresses : M1, M2, M3, M4, M5, M7, M8, M9)',
    badgeText: 'PRÉSENTATION DE RÉUNION 16:9 PAYSAGE • RAPPORT DE CADRAGE (PRODOC)',
    category: 'S',
    fields: [
      {
        key: 'referenceCode',
        label: 'Code Projet & Référence Officielle de la Présentation de Cadrage (Slide 1)',
        placeholder: 'Ex: SLIDES-CAD-FAAB-2026-017',
        multiline: false
      },
      {
        key: 'locationCity',
        label: 'Zone Géographique / Pays & Lieu de la Session de Cadrage (Slide 1)',
        placeholder: 'Ex: Abidjan, République de Côte d’Ivoire',
        multiline: false
      },
      {
        key: 'recipientOrg',
        label: 'Bailleur de Fonds / Commanditaire : Nom de l’Organisation (Bloc Gauche — Slide 1)',
        placeholder: 'Ex: Banque Mondiale / PNUD / BAD / Union Européenne',
        multiline: false
      },
      {
        key: 'donorDepartment',
        label: 'Bailleur de Fonds / Commanditaire : Direction / Département (Bloc Gauche — Slide 1)',
        placeholder: 'Ex: Comité Stratégique & Division des Programmes',
        multiline: false
      },
      {
        key: 'executingOrgName',
        label: 'Agence d’Exécution / Structure Pilote : Nom de l’Organisation (Bloc Droite — Slide 1)',
        placeholder: 'Ex: Ministère / Direction Générale / Agence d’Exécution',
        multiline: false
      },
      {
        key: 'executingDepartment',
        label: 'Agence d’Exécution / Structure Pilote : Direction / Département (Bloc Droite — Slide 1)',
        placeholder: 'Ex: Unité de Gestion du Projet (UGP) & Cellule Suivi-Évaluation (S&E)',
        multiline: false
      },
      {
        key: 'recipientRepresentative',
        label: 'Présentateur(s), Sponsor Exécutif & Objet de la Session (Slide 1)',
        placeholder: 'Ex: Validation Officielle du Rapport de Cadrage (ProDoc) & Verrouillage de la Baseline',
        multiline: false
      }
    ]
  },

  slides_demarrage: {
    id: 'slides_demarrage',
    selectLabel: '18. Présentation du Rapport de Démarrage (Inception) — 10 à 12 Slides',
    officialTitle: 'PRÉSENTATION DU RAPPORT DE DÉMARRAGE OPÉRATIONNEL (INCEPTION REPORT)',
    subtitle: '11 Diapositives Paysage 16:9 • Kick-Off Meeting, Bilan de Mobilisation, Outils de Collecte (M6), Planning WBS/PERT (M2) & Feuille de Route à 30 Jours',
    normativeReference: 'Standard UNEG / EuropeAid (UE) / BAD / PNUD (8 Matrices Maîtresses : M1, M2, M3, M4, M5, M6, M7, M9)',
    badgeText: 'PRÉSENTATION DE RÉUNION 16:9 PAYSAGE • RAPPORT DE DÉMARRAGE (INCEPTION)',
    category: 'S',
    fields: [
      {
        key: 'referenceCode',
        label: 'Code Projet & Référence Officielle de la Présentation de Démarrage (Slide 1)',
        placeholder: 'Ex: SLIDES-DEM-FAAB-2026-018',
        multiline: false
      },
      {
        key: 'locationCity',
        label: 'Zone Géographique / Pays & Lieu du Kick-Off Meeting (Slide 1)',
        placeholder: 'Ex: Abidjan, République de Côte d’Ivoire',
        multiline: false
      },
      {
        key: 'recipientOrg',
        label: 'Bailleur de Fonds / Commanditaire : Nom de l’Organisation (Bloc Gauche — Slide 1)',
        placeholder: 'Ex: Autorité Contractante & Partenaires Techniques et Financiers',
        multiline: false
      },
      {
        key: 'donorDepartment',
        label: 'Bailleur de Fonds / Commanditaire : Direction / Département (Bloc Gauche — Slide 1)',
        placeholder: 'Ex: Secrétariat Technique du COPIL & Direction des Opérations',
        multiline: false
      },
      {
        key: 'executingOrgName',
        label: 'Agence d’Exécution / Structure Pilote : Nom de l’Organisation (Bloc Droite — Slide 1)',
        placeholder: 'Ex: Ministère / Direction Générale / Agence d’Exécution',
        multiline: false
      },
      {
        key: 'executingDepartment',
        label: 'Agence d’Exécution / Structure Pilote : Direction / Département (Bloc Droite — Slide 1)',
        placeholder: 'Ex: Unité de Gestion du Projet (UGP) & Équipe de Démarrage (Inception)',
        multiline: false
      },
      {
        key: 'recipientRepresentative',
        label: 'Présentateur(s), Chef de Mission & Instance de Validation (Slide 1)',
        placeholder: 'Ex: Atelier Officiel de Démarrage (Kick-Off) & Validation de l’Inception Report',
        multiline: false
      }
    ]
  },

  slides_ptba: {
    id: 'slides_ptba',
    selectLabel: '19. Présentation du PTBA (Plan de Travail et Budget Annuel) — 12 à 15 Slides',
    officialTitle: 'PRÉSENTATION DU PLAN DE TRAVAIL ET BUDGET ANNUEL (PTBA)',
    subtitle: '13 Diapositives Paysage 16:9 • Bilan N-1, Cibles Annuelles GAR (M1), Gantt Q1–Q4 & PERT (M2), Budget & EVM (M5), DRF, PPM (M8) & Adoption COPIL/ANO',
    normativeReference: 'Standard PNUD / Banque Mondiale / BAD / UNICEF / UE (8 Matrices Maîtresses : M1, M2, M3, M4, M5, M7, M8, M9)',
    badgeText: 'PRÉSENTATION DE RÉUNION 16:9 PAYSAGE • PRÉSENTATION DU PTBA ANNUEL',
    category: 'S',
    fields: [
      {
        key: 'referenceCode',
        label: 'Code Projet & Référence Officielle de la Présentation PTBA (Slide 1)',
        placeholder: 'Ex: SLIDES-PTBA-FAAB-2026-019',
        multiline: false
      },
      {
        key: 'locationCity',
        label: 'Zone Géographique / Pays & Lieu de la Session Budgétaire COPIL (Slide 1)',
        placeholder: 'Ex: Abidjan, République de Côte d’Ivoire',
        multiline: false
      },
      {
        key: 'recipientOrg',
        label: 'Bailleur de Fonds / Commanditaire : Nom de l’Organisation (Bloc Gauche — Slide 1)',
        placeholder: 'Ex: Banque Mondiale / PNUD / BAD / UNICEF / Union Européenne',
        multiline: false
      },
      {
        key: 'donorDepartment',
        label: 'Bailleur de Fonds / Commanditaire : Direction / Département (Bloc Gauche — Slide 1)',
        placeholder: 'Ex: Direction des Opérations & du Financement des Programmes',
        multiline: false
      },
      {
        key: 'executingOrgName',
        label: 'Agence d’Exécution / Structure Pilote : Nom de l’Organisation (Bloc Droite — Slide 1)',
        placeholder: 'Ex: Ministère / Direction Générale / Agence d’Exécution',
        multiline: false
      },
      {
        key: 'executingDepartment',
        label: 'Agence d’Exécution / Structure Pilote : Direction / Département (Bloc Droite — Slide 1)',
        placeholder: 'Ex: Unité de Gestion du Projet (UGP / AGEX) & Cellule Suivi-Évaluation (S&E)',
        multiline: false
      },
      {
        key: 'recipientRepresentative',
        label: 'Présentateur(s), Instance COPIL & Référence ANO Bailleur (Slide 1)',
        placeholder: 'Ex: Session d’Adoption du PTBA Annuel & Demande d’Avis de Non-Objection (ANO)',
        multiline: false
      }
    ]
  },

  slides_ptt: {
    id: 'slides_ptt',
    selectLabel: '20. Présentation du PTT (Plan de Travail Trimestriel) — 8 à 10 Slides',
    officialTitle: 'PRÉSENTATION DU PLAN DE TRAVAIL TRIMESTRIEL (PTT — HORIZON 90 JOURS)',
    subtitle: '9 Diapositives Paysage 16:9 • Bilan du Trimestre Écoulé, Priorités à 90 Jours, Planning Mois 1–Mois 2–Mois 3 (M2), Trésorerie (M5), RACI (M3) & Livrables (M9)',
    normativeReference: 'Standard Opérationnel PNUD / Banque Mondiale / BAD / UE (5 Matrices Maîtresses : M2, M3, M5, M7, M9)',
    badgeText: 'PRÉSENTATION DE RÉUNION 16:9 PAYSAGE • PRÉSENTATION DU PTT TRIMESTRIEL',
    category: 'S',
    fields: [
      {
        key: 'referenceCode',
        label: 'Code Projet & Référence Officielle de la Présentation PTT (Slide 1)',
        placeholder: 'Ex: SLIDES-PTT-FAAB-2026-Q1-020',
        multiline: false
      },
      {
        key: 'locationCity',
        label: 'Zone Géographique / Pays & Sites Opérationnels du Trimestre (Slide 1)',
        placeholder: 'Ex: Abidjan & Sites Opérationnels',
        multiline: false
      },
      {
        key: 'recipientOrg',
        label: 'Bailleur de Fonds / Commanditaire : Nom de l’Organisation (Bloc Gauche — Slide 1)',
        placeholder: 'Ex: Comité de Pilotage (COPIL) & Partenaires Techniques et Financiers',
        multiline: false
      },
      {
        key: 'donorDepartment',
        label: 'Bailleur de Fonds / Commanditaire : Direction / Département (Bloc Gauche — Slide 1)',
        placeholder: 'Ex: Direction du Suivi des Opérations & Contrôle Trimestriel',
        multiline: false
      },
      {
        key: 'executingOrgName',
        label: 'Agence d’Exécution / Structure Pilote : Nom de l’Organisation (Bloc Droite — Slide 1)',
        placeholder: 'Ex: Ministère / Direction Générale / Agence d’Exécution',
        multiline: false
      },
      {
        key: 'executingDepartment',
        label: 'Agence d’Exécution / Structure Pilote : Direction / Département (Bloc Droite — Slide 1)',
        placeholder: 'Ex: Unité de Gestion du Projet (UGP) & Cellule Suivi-Évaluation (S&E)',
        multiline: false
      },
      {
        key: 'recipientRepresentative',
        label: 'Présentateur(s), Trimestre Couvert (90 jours) & Validation UGP (Slide 1)',
        placeholder: 'Ex: Revue Opérationnelle Trimestrielle (Q1 — 90 jours) & Validation UGP',
        multiline: false
      }
    ]
  },

  slides_mi_parcours: {
    id: 'slides_mi_parcours',
    selectLabel: "21. Présentation de l'Évaluation à Mi-Parcours — 12 à 15 Slides",
    officialTitle: "PRÉSENTATION DE L'ÉVALUATION À MI-PARCOURS (MID-TERM REVIEW — MTR)",
    subtitle: '13 Diapositives Paysage 16:9 • Bilan à Mi-Étape selon les 6 Critères OCDE/CAD (M6), Avancement WBS/PERT (M2), EVM (M5) & Plan de Réorientation (M10)',
    normativeReference: 'Standard OCDE/CAD (6 Critères) & Normes UNEG / GEROS (8 Matrices Maîtresses : M1, M2, M5, M6, M7, M8, M9, M10)',
    badgeText: 'PRÉSENTATION DE RÉUNION 16:9 PAYSAGE • ÉVALUATION À MI-PARCOURS (MTR)',
    category: 'S',
    fields: [
      {
        key: 'referenceCode',
        label: 'Code Projet & Référence de la Présentation à Mi-Parcours (Slide 1)',
        placeholder: 'Ex: SLIDES-EMP-FAAB-2026-021',
        multiline: false
      },
      {
        key: 'locationCity',
        label: 'Zone Géographique / Pays & Lieu de Restitution à Mi-Parcours (Slide 1)',
        placeholder: 'Ex: Abidjan, République de Côte d’Ivoire',
        multiline: false
      },
      {
        key: 'recipientOrg',
        label: 'Bailleur de Fonds / Commanditaire : Nom de l’Organisation (Bloc Gauche — Slide 1)',
        placeholder: 'Ex: Commission d’Évaluation à Mi-Parcours & Partenaires Techniques et Financiers',
        multiline: false
      },
      {
        key: 'donorDepartment',
        label: 'Bailleur de Fonds / Commanditaire : Direction / Département (Bloc Gauche — Slide 1)',
        placeholder: 'Ex: Comité Conjoint de Suivi à Mi-Parcours & Assurance Qualité (UNEG)',
        multiline: false
      },
      {
        key: 'executingOrgName',
        label: 'Agence d’Exécution / Structure Pilote : Nom de l’Organisation (Bloc Droite — Slide 1)',
        placeholder: 'Ex: Ministère / Direction Générale / Agence d’Exécution',
        multiline: false
      },
      {
        key: 'executingDepartment',
        label: 'Agence d’Exécution / Structure Pilote : Direction / Département (Bloc Droite — Slide 1)',
        placeholder: 'Ex: Coordination Nationale, Cellule S&E & Mission de Revue à Mi-Parcours',
        multiline: false
      },
      {
        key: 'recipientRepresentative',
        label: 'Présentateur(s), Mission d’Évaluation à Mi-Parcours & Instance (Slide 1)',
        placeholder: 'Ex: Atelier de Restitution de la Revue à Mi-Parcours & Validation de la Réorientation',
        multiline: false
      }
    ]
  },

  slides_evaluation_finale: {
    id: 'slides_evaluation_finale',
    selectLabel: "22. Présentation de l'Évaluation Finale & Clôture — 15 à 18 Slides",
    officialTitle: "PRÉSENTATION DE L'ÉVALUATION FINALE, D'ACHÈVEMENT (ICR) & CLÔTURE OFFICIELLE",
    subtitle: '16 Diapositives Paysage 16:9 • Bilan Sommatif OCDE/CAD (M6), Rendement Budgétaire Final EVM (M5), Impacts, Durabilité, Passation des Acquis & Quitus Final',
    normativeReference: 'Standard ICR Banque Mondiale / Terminal Evaluation PNUD-UNEG / OCDE-CAD (9 Matrices Maîtresses : M1, M2, M4, M5, M6, M7, M8, M9, M10)',
    badgeText: 'PRÉSENTATION DE RÉUNION 16:9 PAYSAGE • ÉVALUATION FINALE & CLÔTURE (ICR)',
    category: 'S',
    fields: [
      {
        key: 'referenceCode',
        label: 'Code Projet & Référence de la Présentation Finale & Clôture (Slide 1)',
        placeholder: 'Ex: SLIDES-EVF-FAAB-2026-022',
        multiline: false
      },
      {
        key: 'locationCity',
        label: 'Zone Géographique / Pays & Lieu de l’Atelier de Clôture (Slide 1)',
        placeholder: 'Ex: Abidjan, République de Côte d’Ivoire',
        multiline: false
      },
      {
        key: 'recipientOrg',
        label: 'Bailleur de Fonds / Commanditaire : Nom de l’Organisation (Bloc Gauche — Slide 1)',
        placeholder: 'Ex: Conseil d’Administration, Autorité Contractante & Bailleurs de Fonds',
        multiline: false
      },
      {
        key: 'donorDepartment',
        label: 'Bailleur de Fonds / Commanditaire : Direction / Département (Bloc Gauche — Slide 1)',
        placeholder: 'Ex: Direction Indépendante de l’Évaluation, Clôture & Quitus (IEG / IEO)',
        multiline: false
      },
      {
        key: 'executingOrgName',
        label: 'Agence d’Exécution / Structure Pilote : Nom de l’Organisation (Bloc Droite — Slide 1)',
        placeholder: 'Ex: Ministère / Direction Générale / Agence d’Exécution',
        multiline: false
      },
      {
        key: 'executingDepartment',
        label: 'Agence d’Exécution / Structure Pilote : Direction / Département (Bloc Droite — Slide 1)',
        placeholder: 'Ex: Direction Générale, Cellule de Capitalisation & Mission d’Évaluation Finale',
        multiline: false
      },
      {
        key: 'recipientRepresentative',
        label: 'Présentateur(s), Mission d’Évaluation Finale & Autorité de Quitus (Slide 1)',
        placeholder: 'Ex: Atelier Officiel de Clôture, Capitalisation & Délivrance du Quitus Définitif',
        multiline: false
      }
    ]
  }
};

/**
 * Synchronise automatiquement les champs spécifiques d'un document avec les données
 * réelles renseignées dans tous les autres onglets de l'application (Profil, Dossiers & Projets,
 * Planification, Suivi des tâches, RACI, Réseau PERT, Kanban, Gantt et Tableau de Bord).
 */
export function buildDynamicFieldsFromAppTabs(
  docType: InstitutionalDocType,
  baseFields: CustomDocFields,
  dossier: Dossier,
  userProfile: UserProfile,
  currency: CurrencyCode,
  lang: LanguageCode
): CustomDocFields {
  const todayISO = getTodayISO();
  const pertSummaries = computeDossierPertSummary(dossier, todayISO);
  const allNodes = pertSummaries.flatMap(p => p.nodes);
  const raciCtx = resolveProgramRaciContext(dossier, userProfile);

  let totalTasks = 0;
  let completedTasks = 0;
  let inProgressTasks = 0;
  let blockedTasks = 0;
  let todoTasks = 0;
  let delayedTasks = 0;
  let totalBudgetFCFA = 0;

  const uniqueAssignees = new Set<string>(raciCtx.rList);
  const uniqueAuthorities = new Set<string>(raciCtx.aList);
  const uniqueConsulted = new Set<string>(raciCtx.cList);
  const uniqueInformed = new Set<string>(raciCtx.iList);

  (dossier.axes || []).forEach(axe => {
    (axe.projects || []).forEach(proj => {
      (proj.tasks || []).forEach(tk => {
        totalTasks++;
        const m = computeTaskMetrics(tk, todayISO);
        const b = Number(tk.budget) || 0;
        totalBudgetFCFA += b;
        if (m.effectiveStatus === 'Terminé') completedTasks++;
        else if (m.effectiveStatus === 'En cours') inProgressTasks++;
        else if (m.effectiveStatus === 'Bloqué') blockedTasks++;
        else todoTasks++;

        if (m.ecartDebutDays > 0 || m.ecartFinDays > 0) delayedTasks++;
      });
    });
  });

  const progressPct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  const criticalNodes = allNodes.filter(n => n.isCritical);
  const criticalSeq = criticalNodes.map(n => n.code).join(' -> ') || 'N/A';
  const maxDur = pertSummaries.reduce((acc, p) => Math.max(acc, p.projectDuration), 0);
  const budgetFormatted = formatDocAmount(totalBudgetFCFA, currency, lang);

  const axesNames = (dossier.axes || []).map((a, i) => `Axe ${i + 1} (${a.name})`).join(' ; ');
  const projectsNames = (dossier.axes || [])
    .flatMap(a => a.projects || [])
    .map((p, i) => `P${i + 1}: ${p.name}`)
    .join(' ; ');

  const docPrefix = docType.toUpperCase().slice(0, 4);
  const nationality = userProfile.nationality || 'Ivoirienne';
  const residenceCity = userProfile.residenceCity || baseFields.locationCity || 'Abidjan, Côte d’Ivoire';
  const yearsExp = userProfile.yearsExperience || '+15 ans';
  const linkedInStr = userProfile.linkedIn ? ` | LinkedIn : ${userProfile.linkedIn}` : '';
  const birthDateStr = userProfile.birthDate ? ` | Né(e) le : ${userProfile.birthDate}` : '';
  const leadActor = raciCtx.leadActorName;
  const leadRole = raciCtx.leadActorRole;
  const allRaciSummary = raciCtx.hasAnyRaciActor
    ? `Acteurs RACI du programme : R=[${raciCtx.rList.join(', ') || userProfile.fullName}] · A=[${raciCtx.aList.join(', ') || userProfile.fullName}] · C=[${raciCtx.cList.join(', ') || userProfile.fullName}] · I=[${raciCtx.iList.join(', ') || userProfile.institution}]`
    : `Aucun acteur renseigné dans RACI — Affichage par défaut du profil utilisateur : ${userProfile.fullName} (${userProfile.role})`;

  if (docType === 'courrier_admin') {
    return {
      ...baseFields,
      referenceCode: baseFields.referenceCode || `COUR-FAAB-${dossier.psdYear || 2026}-011`,
      locationCity: baseFields.locationCity || residenceCity.split(',')[0] || 'Abidjan',
      recipientOrg:
        dossier.institution ||
        userProfile.institution ||
        baseFields.recipientOrg ||
        'Direction Générale & Partenaires Institutionnels',
      recipientRepresentative:
        raciCtx.primaryA ||
        baseFields.recipientRepresentative ||
        'Monsieur / Madame le Président du Comité de Pilotage',
      contextJustification: `Transmission de l’état consolidé d’exécution et demande de validation des jalons du portefeuille « ${dossier.name} » (${progressPct}% réalisé · Budget : ${budgetFormatted}).`,
      specificObjectives: `Madame, Monsieur,\n\nFaisant suite aux orientations stratégiques arrêtées pour l’horizon ${dossier.horizonPlan}, j’ai l’honneur de soumettre à votre haute appréciation le point d’exécution actualisé du portefeuille « ${dossier.name} », coordonné par ${leadActor} (${leadRole}) au sein de ${dossier.institution || userProfile.institution}.`,
      methodologyApproach: `Sur le plan technique et financier, le portefeuille mobilise une enveloppe globale de ${budgetFormatted} répartie sur ${(dossier.axes || []).length} axe(s) stratégique(s), ${pertSummaries.length} projet(s) et ${totalTasks} activités/jalons. À ce jour, le taux de réalisation physique atteint ${progressPct}% (${completedTasks} activités terminées, ${inProgressTasks} en cours, ${blockedTasks} bloquées et ${todoTasks} à faire), avec un chemin critique PERT/CPM (${criticalSeq}) d’une durée incompressible de ${maxDur} jour(s) ouvré(s).`,
      governanceModalities: `Conformément aux dispositions de notre matrice de gouvernance RACI (${allRaciSummary}), nous sollicitons votre bienveillant accord sur les livrables réceptionnés ainsi que vos instructions d’arbitrage pour les opérations de la période à venir.`,
      confidentialityClauses: baseFields.confidentialityClauses,
      recommendationsLessons: baseFields.recommendationsLessons
    };
  }

  // CATÉGORIE D — DOC 12 : CV PROFESSIONNEL EXÉCUTIF (1 PAGE STRICTE - AVEC PHOTO)
  if (docType === 'cv_executif') {
    const projectExperiences = (dossier.axes || [])
      .flatMap(a => a.projects || [])
      .map((p, idx) => {
        const pTasks = p.tasks || [];
        const pBud = pTasks.reduce((s, t) => s + (Number(t.budget) || 0), 0);
        const pDone = pTasks.filter(t => computeTaskMetrics(t, todayISO).effectiveStatus === 'Terminé').length;
        const pPct = pTasks.length > 0 ? Math.round((pDone / pTasks.length) * 100) : 0;
        const pLivs = pTasks.map(t => t.livrable).filter(Boolean).slice(0, 3).join(', ');
        return `${dossier.horizonPlan} | ${userProfile.role.toUpperCase()} — ${p.name} (${dossier.institution || userProfile.institution}) · Budget géré : ${formatDocAmount(pBud, currency, lang)} · Réalisations : (${idx + 1}.1) Pilotage de ${pTasks.length} activités WBS avec ${pPct}% d’achèvement ; (${idx + 1}.2) Maîtrise du chemin critique PERT/CPM (${maxDur}j) ; (${idx + 1}.3) Livrables : ${pLivs || 'Conformité GAR & redevabilité bailleurs'}.`;
      })
      .join('\n');

    const combinedExperiences = [projectExperiences, userProfile.cvMajorExperiences]
      .filter(Boolean)
      .join('\n');

    const combinedDiplomasAndCerts = [
      userProfile.cvEducationDiplomas,
      userProfile.cvCertifications
    ]
      .filter(Boolean)
      .join('\n');

    const combinedLanguagesAndTools = [
      userProfile.cvLanguages ? `Langues parlées (CECRL) : ${userProfile.cvLanguages}` : '',
      userProfile.cvSoftwareTools ? `Logiciels & Outils maîtrisés : ${userProfile.cvSoftwareTools}` : ''
    ]
      .filter(Boolean)
      .join('\n');

    return {
      ...baseFields,
      profilePhotoDataUrl: baseFields.profilePhotoDataUrl || userProfile.cvPhotoDataUrl || '',
      referenceCode: baseFields.referenceCode || `CV-EXEC-${dossier.psdYear || 2026}-012`,
      locationCity: baseFields.locationCity || residenceCity,
      recipientOrg:
        dossier.institution ||
        userProfile.institution ||
        baseFields.recipientOrg ||
        'PNUD / Banque Mondiale / BAD / Union Européenne',
      recipientRepresentative: `${userProfile.fullName.toUpperCase()} | ${userProfile.role} (${yearsExp} d’exp.)${birthDateStr} | Tél : ${userProfile.phone} | Email : ${userProfile.email}${linkedInStr} | ${residenceCity} | Nationalité : ${nationality}`,
      contextJustification: userProfile.cvExecutivePitch
        ? `${userProfile.cvExecutivePitch}\nProgramme sélectionné : « ${dossier.name} » (${budgetFormatted} sous gestion · ${totalTasks} activités WBS · ${progressPct}% achevé · Posture : ${raciCtx.intervenesAsProgramActor ? 'Acteur direct du programme' : 'Spécialiste en Gestion de Projet / Appui Méthodologique PMO'}).`
        : `Directeur de Programme International et Expert Senior (${userProfile.role}) capitalisant ${yearsExp} d’expérience dans la conception, l’ordonnancement algorithmique PERT/CPM, la Gestion Axée sur les Résultats (GAR) et le Suivi-Évaluation (normes OCDE/CAD et UNEG). Programme sélectionné : « ${dossier.name} » (${budgetFormatted} sous gestion · ${totalTasks} activités WBS · ${progressPct}% achevé).`,
      specificObjectives:
        userProfile.cvKeySkills ||
        `Ingénierie & Gestion de Cycle de Projet : PMBOK® 7th Ed., ISO 21500:2021, WBS/PTBA, Réseau PERT/CPM (${criticalSeq}), Gestion de la Valeur Acquise (EVM).\nSuivi-Évaluation & GAR : Cadre Logique (M1), Théorie du Changement (TdC), Évaluations OCDE/CAD (6 critères), Normes UNEG & Assurance Qualité GEROS.\nGouvernance, Fiduciaire & Leadership : Coordination d’UGP, Matrice RACI (M3 — ${raciCtx.allActors.length || 1} acteur(s)), Maîtrise des Risques Board RAID (M7), Passation des Marchés (BM/BAD/UE).`,
      methodologyApproach:
        combinedExperiences || baseFields.methodologyApproach,
      governanceModalities: combinedDiplomasAndCerts || baseFields.governanceModalities,
      confidentialityClauses: combinedLanguagesAndTools || baseFields.confidentialityClauses,
      recommendationsLessons: userProfile.cvAvailability || baseFields.recommendationsLessons
    };
  }

  // CATÉGORIE D — DOC 13 : CV PROFESSIONNEL DÉTAILLÉ / APPEL D'OFFRES BAILLEURS (2 À 4 PAGES)
  if (docType === 'cv_detaille') {
    const detailedMissions = (dossier.axes || [])
      .flatMap((a, aIdx) =>
        (a.projects || []).map((p, pIdx) => {
          const pTasks = p.tasks || [];
          const pBud = pTasks.reduce((s, t) => s + (Number(t.budget) || 0), 0);
          const livrablesList = pTasks
            .map(t => t.livrable)
            .filter(Boolean)
            .slice(0, 6)
            .join(' ; ');
          return `Mission ${aIdx + 1}.${pIdx + 1} (${dossier.horizonPlan}) — Projet : « ${p.name} » (${a.name}) | Bailleur / Client : ${dossier.institution || userProfile.institution} | Financement : ${formatDocAmount(pBud, currency, lang)} | Poste : ${userProfile.role} (${raciCtx.intervenesAsProgramActor ? 'Chef de Mission / Acteur RACI' : 'Spécialiste en Gestion de Projet & Appui PMO'}) | Activités : Planification WBS de ${pTasks.length} tâches, calcul PERT/CPM, suivi budgétaire EVM et coordination RACI | Livrables produits : ${livrablesList || 'Rapports de cadrage, PTBA, Rapports CAP et PV de réception'}.`;
        })
      )
      .join('\n\n');

    const fullDetailedHistory = [detailedMissions, userProfile.cvMajorExperiences]
      .filter(Boolean)
      .join('\n\n');

    return {
      ...baseFields,
      profilePhotoDataUrl: baseFields.profilePhotoDataUrl || userProfile.cvPhotoDataUrl || '',
      referenceCode: baseFields.referenceCode || `CV-AOI-${dossier.psdYear || 2026}-013`,
      locationCity: baseFields.locationCity || residenceCity,
      recipientOrg:
        baseFields.recipientOrg ||
        'Banque Mondiale (Form TECH-6) / BAD / Union Européenne (EuropeAid) / Nations Unies (P11)',
      recipientRepresentative: `Nom & Prénoms : ${userProfile.fullName}${birthDateStr} | Titre : ${userProfile.role} (${yearsExp}) | Institution : ${userProfile.institution || dossier.institution} | Tél : ${userProfile.phone} | Email : ${userProfile.email}${linkedInStr} | Résidence : ${residenceCity} | Nationalité : ${nationality} | Poste proposé : ${userProfile.role} — Chef de Mission & Expert Principal S&E (Catégorie I)`,
      contextJustification: userProfile.cvExecutivePitch
        ? `${userProfile.cvExecutivePitch}\nPortefeuille actif modélisé et suivi : « ${dossier.name} » (${allNodes.length} nœuds PERT/CPM modélisés, durée critique ${maxDur}j, enveloppe de ${budgetFormatted}, ${progressPct}% d’avancement).`
        : `Expert Senior de Catégorie I (${yearsExp} d’expérience) spécialisé en direction de programmes complexes, ingénierie de planification stratégique, modélisation du chemin critique PERT/CPM (${allNodes.length} nœuds modélisés, durée critique ${maxDur}j), suivi budgétaire analytique EVM (enveloppe active de ${budgetFormatted} sur « ${dossier.name} ») et conduite d’évaluations selon les standards OCDE/CAD et UNEG.`,
      specificObjectives: userProfile.cvEducationDiplomas || baseFields.specificObjectives,
      methodologyApproach: userProfile.cvCertifications || baseFields.methodologyApproach,
      governanceModalities: userProfile.cvCountriesAndDonors || baseFields.governanceModalities,
      confidentialityClauses: userProfile.cvPublicationsAffiliations || baseFields.confidentialityClauses,
      recommendationsLessons: userProfile.cvReferences || baseFields.recommendationsLessons,
      extraField1: fullDetailedHistory || baseFields.extraField1,
      extraField2: userProfile.cvLanguages || baseFields.extraField2
    };
  }

  // CATÉGORIE D — DOC 14 : PROCÈS-VERBAL (PV) OFFICIEL DE RÉUNION (1 À 2 PAGES - SANS PAGE DE GARDE)
  if (docType === 'pv_reunion') {
    const participantsLines: string[] = [];
    if (raciCtx.intervenesAsProgramActor || !raciCtx.hasAnyRaciActor) {
      participantsLines.push(
        `1. ${userProfile.fullName} (${userProfile.role} — ${userProfile.institution || dossier.institution}) : PRÉSENT (Secrétaire de séance / Rapporteur)`
      );
    }
    Array.from(uniqueAuthorities).forEach((auth) => {
      participantsLines.push(
        `${participantsLines.length + 1}. ${auth} (Autorité d’Approbation COPIL / RACI-A) : PRÉSENT (Président de séance)`
      );
    });
    Array.from(uniqueAssignees).forEach((ass) => {
      participantsLines.push(
        `${participantsLines.length + 1}. ${ass} (Responsable Opérationnel / RACI-R) : PRÉSENT`
      );
    });
    Array.from(uniqueConsulted)
      .slice(0, 3)
      .forEach((con) => {
        participantsLines.push(
          `${participantsLines.length + 1}. ${con} (Expert Consulté / RACI-C) : PRÉSENT`
        );
      });
    Array.from(uniqueInformed)
      .slice(0, 2)
      .forEach((inf) => {
        participantsLines.push(
          `${participantsLines.length + 1}. ${inf} (Partie Prenante Informée / RACI-I) : EXCUSÉ`
        );
      });
    if (!raciCtx.intervenesAsProgramActor && raciCtx.hasAnyRaciActor) {
      participantsLines.push(
        `${participantsLines.length + 1}. ${userProfile.fullName} (${userProfile.role} — Spécialiste en Gestion de Projet / Appui Méthodologique PMO) : Rédacteur & Modélisateur`
      );
    }
    const participantsList = participantsLines.join('\n');

    return {
      ...baseFields,
      referenceCode: baseFields.referenceCode || `PV-COPIL-${dossier.psdYear || 2026}-014`,
      locationCity: baseFields.locationCity || 'Abidjan — Salle de Conférence UGP & Visioconférence',
      recipientOrg:
        dossier.institution ||
        userProfile.institution ||
        baseFields.recipientOrg ||
        'Comité de Pilotage Stratégique (COPIL) & Unité de Gestion (UGP)',
      recipientRepresentative: `Projet : « ${dossier.name} » (${dossier.horizonPlan}) | Instance : Session Ordinaire d’Arbitrage du Comité de Pilotage (COPIL) | Horaire : 09h00 – 12h30 | Président de séance : ${raciCtx.primaryA} | Secrétaire de séance (Rapporteur) : ${leadActor} (${leadRole})`,
      governanceModalities: participantsList || baseFields.governanceModalities,
      contextJustification: `1. Vérification du quorum, ouverture officielle de la séance et adoption de l’ordre du jour ;\n2. Examen de l’état d’avancement physique du portefeuille « ${dossier.name} » (${progressPct}% achevé sur ${totalTasks} activités) et revue du chemin critique PERT/CPM (${criticalSeq}) ;\n3. Audit de l’exécution budgétaire PTBA / Valeur Acquise (Enveloppe : ${budgetFormatted}) et revue des risques (Board RAID M7) ;\n4. Arbitrage des ${blockedTasks} point(s) de blocage et des ${delayedTasks} écart(s) calendaires, adoption de la Matrice de Décisions (M10) et clôture.`,
      specificObjectives: `Point 4.1 (Avancement Physique & PERT) : Le Rapporteur (${leadActor}) a présenté le bilan consolidé faisant état de ${completedTasks} activité(s) terminée(s) (${progressPct}%), ${inProgressTasks} en cours, ${blockedTasks} bloquée(s) et ${todoTasks} à faire, pour une durée critique incompressible de ${maxDur} jours ouvrés.\nPoint 4.2 (Exécution Financière PTBA/EVM) : L’enveloppe globale programmée s’établit à ${budgetFormatted}, répartie sur ${(dossier.axes || []).length} axe(s) et ${pertSummaries.length} projet(s).\nPoint 4.3 (Goulots d’Étranglement & Risques RAID) : Les échanges ont porté sur les mesures immédiates de déblocage des tâches critiques et la sécurisation des livrables attendus.`,
      methodologyApproach: `DÉCISION N°01 (Quitus d’étape) : Le Comité approuve l’état d’avancement physique (${progressPct}%) et financier (${budgetFormatted}) présenté.\nDÉCISION N°02 (Traitement du Chemin Critique) : Instruction ferme est donnée aux Responsables RACI (${raciCtx.rList.join(', ') || userProfile.fullName}) de résorber sous 7 jours ouvrés les ${blockedTasks} blocage(s) et ${delayedTasks} écart(s) sur la séquence critique (${criticalSeq}).\nDÉCISION N°03 (Validation des Livrables) : Autorisation de décaissement des tranches associées aux livrables homologués dans la Matrice M9.`,
      confidentialityClauses: baseFields.confidentialityClauses,
      recommendationsLessons: baseFields.recommendationsLessons
    };
  }

  // CATÉGORIE D — DOC 15 : TERMES DE RÉFÉRENCE (TDR) SIMPLIFIÉS AVEC TABLEAUX (1 À 3 PAGES - SANS PAGE DE GARDE)
  if (docType === 'tdr_simplifie') {
    const firstProjName =
      (dossier.axes || []).flatMap(a => a.projects || [])[0]?.name || dossier.name;
    return {
      ...baseFields,
      referenceCode: baseFields.referenceCode || `TDRS-PTBA-${dossier.psdYear || 2026}-015`,
      locationCity: baseFields.locationCity || 'Abidjan & Zones d’Intervention',
      recipientOrg:
        dossier.institution ||
        userProfile.institution ||
        baseFields.recipientOrg ||
        'Unité de Gestion du Projet (UGP) & Bailleur de Fonds',
      recipientRepresentative: `Intitulé : Appui Technique & Opérationnel à l’Exécution du Projet « ${firstProjName} » | Code PTBA : ${baseFields.referenceCode || 'PTBA-2026-A1'} | Portefeuille : ${dossier.name} (${dossier.horizonPlan}) | Durée : ${maxDur || 30} Hommes-Jours (H/J) | Superviseur direct : ${leadActor} (${leadRole})`,
      contextJustification: `Dans le cadre de la mise en œuvre opérationnelle du portefeuille « ${dossier.name} » (${dossier.horizonPlan}, budget consolidé de ${budgetFormatted}), la présente activité inscrite au PTBA vise à appuyer la réalisation des ${totalTasks} activités et jalons programmés (dont ${completedTasks} achevés à ${progressPct}%) et à sécuriser le chemin critique PERT/CPM (${criticalSeq}).`,
      specificObjectives: `3.1 Objectif Global : Assurer la production et la validation dans les délais prescrits des livrables opérationnels de l’activité conformément aux standards GAR et ISO 21500.\n3.2 Objectifs Spécifiques : (OS1) Conduire le cadrage opérationnel et stabiliser les outils d’intervention ; (OS2) Exécuter les tâches techniques sur les séquences critiques (${criticalSeq}) et lever les ${blockedTasks} goulot(s) identifié(s) ; (OS3) Soumettre les livrables finaux (Matrice M9) et assurer le transfert de compétences à l’UGP.`,
      extraField1: `Livrables synchronisés avec la Matrice M2 (WBS) et la Matrice M9 (Assurance Qualité & Paiements) du portefeuille actif.`,
      methodologyApproach: baseFields.methodologyApproach,
      governanceModalities: baseFields.governanceModalities,
      confidentialityClauses: baseFields.confidentialityClauses,
      recommendationsLessons: baseFields.recommendationsLessons
    };
  }

  // CATÉGORIE B — PLAN DE TRAVAIL ET BUDGET ANNUEL (PTBA — 15 PAGES A4 CONSOLIDÉES)
  if (docType === 'ptba') {
    let completedBudFCFA = 0;
    let inProgressBudFCFA = 0;
    let livrablesCount = 0;
    (dossier.axes || []).forEach(a => {
      (a.projects || []).forEach(p => {
        (p.tasks || []).forEach(tk => {
          const m = computeTaskMetrics(tk, todayISO);
          const b = Number(tk.budget) || 0;
          if (tk.livrable && tk.livrable.trim()) livrablesCount++;
          if (m.effectiveStatus === 'Terminé') completedBudFCFA += b;
          else if (m.effectiveStatus === 'En cours') inProgressBudFCFA += b;
        });
      });
    });
    const committedFCFA = completedBudFCFA + Math.round(inProgressBudFCFA * 0.6);
    const actualFCFA = completedBudFCFA + Math.round(inProgressBudFCFA * 0.5);
    const earnedFCFA = completedBudFCFA + Math.round(inProgressBudFCFA * 0.5);
    const cpiVal = actualFCFA > 0 ? (earnedFCFA / actualFCFA).toFixed(2) : '1.00';
    const donorShareFCFA = Math.round(totalBudgetFCFA * 0.8);
    const nationalShareFCFA = Math.max(0, totalBudgetFCFA - donorShareFCFA);
    const ptbaYear = dossier.psdYear || 2026;

    return {
      ...baseFields,
      referenceCode: baseFields.referenceCode || `PTBA-FAAB-${ptbaYear}-016`,
      locationCity: baseFields.locationCity || residenceCity.split(',')[0] || 'Abidjan',
      recipientOrg:
        baseFields.recipientOrg ||
        dossier.institution ||
        'Banque Mondiale / PNUD / BAD / UNICEF / Union Européenne',
      donorDepartment:
        baseFields.donorDepartment ||
        'Direction des Opérations & du Financement des Programmes',
      executingOrgName:
        dossier.institution ||
        userProfile.institution ||
        baseFields.executingOrgName ||
        'Direction Générale de la Stratégie & PMO',
      executingDepartment:
        baseFields.executingDepartment ||
        'Unité de Gestion du Projet (UGP / AGEX) & Cellule Suivi-Évaluation (S&E)',
      recipientRepresentative: `Adoption COPIL : 15 Janvier ${ptbaYear} · Réf. ANO Bailleur : ANO-${ptbaYear}-FAAB-001 (Ordonnateur : ${raciCtx.primaryA || leadActor})`,
      extraField1: `Le présent Plan de Travail et Budget Annuel (PTBA ${ptbaYear}, 15 pages A4 consolidées) constitue le document contractuel annuel et la base juridique d’engagement financier du portefeuille « ${dossier.name} » (${dossier.horizonPlan}). Il mobilise une enveloppe globale (BAC) de ${budgetFormatted} (dont 80% Financement Bailleur soit ${formatDocAmount(donorShareFCFA, currency, lang)} et 20% Contrepartie Nationale soit ${formatDocAmount(nationalShareFCFA, currency, lang)}) répartie sur ${(dossier.axes || []).length} composante(s)/axe(s), ${pertSummaries.length} projet(s) et ${totalTasks} activités WBS.`,
      contextJustification: `Au titre du bilan d’exécution physique et financière N-1 consolidé depuis les onglets Planification et Suivi des tâches : sur ${totalTasks} activité(s) inscrite(s) au portefeuille, ${completedTasks} sont achevées (${progressPct}% de réalisation physique WBS), ${inProgressTasks} sont en cours d’exécution, ${blockedTasks} sont bloquées et ${todoTasks} sont programmées pour démarrage. Sur le plan financier (EVM), le montant engagé s’établit à ${formatDocAmount(committedFCFA, currency, lang)}, le coût réel décaissé (AC) atteint ${formatDocAmount(actualFCFA, currency, lang)} et la valeur acquise (EV) ressort à ${formatDocAmount(earnedFCFA, currency, lang)}, soit un indice de performance des coûts CPI = ${cpiVal}.`,
      extraField2:
        blockedTasks > 0 || delayedTasks > 0
          ? `Les enseignements clés mettent en évidence la nécessité de lever prioritairement les ${blockedTasks} goulot(s) d’étranglement actif(s) et de résorber les ${delayedTasks} écart(s) calendaires identifiés dans l’onglet Suivi/Kanban. Les activités non soldées en N-1 (${inProgressTasks + todoTasks} tâches) sont intégralement reportées et re-phasées sur les trimestres Q1 à Q4 de l’année ${ptbaYear}.`
          : `Capitalisation N-1 : excellente maîtrise opérationnelle (${progressPct}% réalisé, 0 blocage critique). Les activités résiduelles (${inProgressTasks + todoTasks} tâches) sont programmées sur les trimestres Q1 à Q4 ${ptbaYear} avec préservation intégrale des marges du chemin critique PERT/CPM.`,
      extraField3: `Le PTBA ${ptbaYear} a été élaboré selon un processus participatif ascendant associant l’équipe de l’UGP/AGEX (${leadActor}, ${leadRole}), les responsables opérationnels RACI-R (${raciCtx.rList.slice(0, 4).join(', ') || raciCtx.primaryR}) et les experts consultés RACI-C, avant arbitrage par le Comité de Pilotage (${raciCtx.primaryA}) et délivrance de l’Avis de Non-Objection (ANO) du Bailleur.`,
      specificObjectives: `1. Déployer les ${(dossier.axes || []).length} axe(s) stratégique(s) [${axesNames || 'Axe principal'}] et ${pertSummaries.length} projet(s) [${projectsNames || 'Projet principal'}] en alignement strict avec la Matrice du Cadre Logique (Matrice M1) ;\n2. Livrer 100% des ${livrablesCount || totalTasks} extrants et livrables annuels en sécurisant le chemin critique PERT/CPM (${criticalSeq} — durée incompressible de ${maxDur} jours ouvrés) ;\n3. Maintenir un indice d’efficience budgétaire CPI ≥ 1.00 sur l’enveloppe annuelle de ${budgetFormatted}.`,
      extraField4: `Le portefeuille « ${dossier.name} » est structuré en ${(dossier.axes || []).length} Composante(s) / Axe(s) Stratégique(s) (${axesNames || 'Composante 1'}) regroupant ${pertSummaries.length} Sous-composante(s) / Projet(s) (${projectsNames || 'Projet 1'}) et ${totalTasks} activités/jalons opérationnels produisant des extrants mesurables et vérifiables.`,
      extraField5: `La stratégie de mise en œuvre et de ciblage des bénéficiaires s’appuie sur la Matrice des Parties Prenantes (Matrice M4) et la coordination entre le Commanditaire/Bailleur (${dossier.institution || userProfile.institution}), l’UGP/AGEX (${leadActor}) et les acteurs de terrain (${allRaciSummary}).`,
      methodologyApproach: `La matrice d’activités et le chronogramme annuel Gantt (Matrice M2) ventilent les ${totalTasks} activités sur les 4 trimestres de l’année ${ptbaYear} (Q1, Q2, Q3, Q4) avec identification précise du code WBS, du responsable RACI-R, du livrable attendu, de la durée PERT et de la cible annuelle.`,
      extraField6: `L’analyse algorithmique du réseau PERT/CPM couvre ${allNodes.length} nœuds reliés par leurs antécédents logiques. La durée minimale incompressible du portefeuille est de ${maxDur} jours ouvrés, pilotée par ${criticalNodes.length} activité(s) sur le chemin critique à marge totale nulle (${criticalSeq}).`,
      extraField7: `Le budget analytique annuel consolidé (Matrice M5) s’élève à ${budgetFormatted} (BAC), financé à hauteur de 80% par le Bailleur (${formatDocAmount(donorShareFCFA, currency, lang)}) et de 20% par la Contrepartie Nationale (${formatDocAmount(nationalShareFCFA, currency, lang)}), réparti entre Investissements/Équipements, Services de Consultants, Travaux/Opérations et Fonctionnement UGP.`,
      extraField8: `La programmation budgétaire trimestrielle (Q1 : 25% · Q2 : 30% · Q3 : 25% · Q4 : 20%) garantit l’adéquation entre l’avancement physique WBS (${progressPct}%) et l’exécution financière EVM (Engagé : ${formatDocAmount(committedFCFA, currency, lang)} · Décaissé AC : ${formatDocAmount(actualFCFA, currency, lang)} · Valeur Acquise EV : ${formatDocAmount(earnedFCFA, currency, lang)} · CPI : ${cpiVal}).`,
      extraField9: `Le plan de décaissement prévisionnel et d’appel de fonds (Demande de Renouvellement de Fonds — DRF / Avance de fonds) assure la liquidité continue du compte désigné du projet, avec un seuil de réapprovisionnement fixé à 50% de l’avance initiale et une mobilisation trimestrielle synchronisée de la contrepartie nationale.`,
      extraField10: `Le Plan Annuel de Passation des Marchés (PPM Synthétique — Matrice M8) recense l’ensemble des acquisitions de fournitures, services de consultants et travaux inscrites au PTBA ${ptbaYear}, avec leurs méthodes normées (AON, Consultation de Consultants, Demande de Cotation), le régime de revue (ANO a priori / a posteriori) et le calendrier DAO -> Attribution -> Fin de prestation.`,
      governanceModalities: `La gouvernance institutionnelle et la mobilisation des ressources humaines (Matrice M3) reposent sur une attribution RACI sans ambiguïté : Réalisateurs (R) [${raciCtx.rList.slice(0, 5).join(', ') || raciCtx.primaryR}] ; Autorité d’approbation (A) [${raciCtx.aList.join(', ') || raciCtx.primaryA}] ; Consultés (C) [${raciCtx.cList.slice(0, 4).join(', ') || raciCtx.primaryC}] ; Informés (I) [${raciCtx.iList.slice(0, 4).join(', ') || raciCtx.primaryI}].`,
      confidentialityClauses: `Le dispositif de Suivi-Évaluation GAR prévoit 4 revues trimestrielles d’exécution (PTT Q1 à Q4), 2 missions conjointes de supervision Bailleur/UGP et 1 audit financier et comptable annuel. Chaque livrable contractuel (Matrice M9) fait l’objet d’un contrôle qualité strict avant quitus.`,
      recommendationsLessons:
        blockedTasks > 0 || delayedTasks > 0
          ? `Registre des risques RAID (Matrice M7) : vigilance maximale sur les ${blockedTasks} tâche(s) bloquée(s) et ${delayedTasks} activité(s) en glissement calendaire ; application immédiate des mesures d’atténuation opérationnelles, fiduciaires et calendaires sur le chemin critique (${criticalSeq}).`
          : `Registre des risques RAID (Matrice M7) : maîtrise préventive des risques fiduciaires, de passation des marchés et de glissement calendaire afin de maintenir 0 blocage sur la séquence critique (${criticalSeq}).`,
      extraField11: `Les fiches de tâches / lots WBS en annexe contractualisent chaque lot prioritaire selon la règle opérationnelle des 3R : un Responsable unique (RACI-R), un Résultat concret mesurable (Livrable M9) et des Ressources budgétaires allouées (Ligne M5).`
    };
  }

  // CATÉGORIE B — PLAN DE TRAVAIL TRIMESTRIEL (PTT — 6 PAGES A4 CONSOLIDÉES)
  if (docType === 'ptt') {
    const currentMonthIdx = new Date().getMonth();
    const defaultQNum = Math.floor(currentMonthIdx / 3) + 1;
    const selectedQ: 'Q1' | 'Q2' | 'Q3' | 'Q4' =
      baseFields.activeQuarter || (`Q${defaultQNum}` as 'Q1' | 'Q2' | 'Q3' | 'Q4');
    const qNum = Number(selectedQ.replace('Q', '')) || 1;
    const prevQLabel = qNum === 1 ? `T4 ${(dossier.psdYear || 2026) - 1}` : `Q${qNum - 1} ${dossier.psdYear || 2026}`;

    const quarterMonthsMap: Record<number, string> = {
      1: 'Mois 1 (Janvier) · Mois 2 (Février) · Mois 3 (Mars)',
      2: 'Mois 1 (Avril) · Mois 2 (Mai) · Mois 3 (Juin)',
      3: 'Mois 1 (Juillet) · Mois 2 (Août) · Mois 3 (Septembre)',
      4: 'Mois 1 (Octobre) · Mois 2 (Novembre) · Mois 3 (Décembre)'
    };
    const quarterLabel = `Trimestre ${qNum} (${selectedQ} ${dossier.psdYear || 2026} — 90 jours : ${quarterMonthsMap[qNum]})`;

    let completedBudFCFA = 0;
    let inProgressBudFCFA = 0;
    (dossier.axes || []).forEach(a => {
      (a.projects || []).forEach(p => {
        (p.tasks || []).forEach(tk => {
          const m = computeTaskMetrics(tk, todayISO);
          const b = Number(tk.budget) || 0;
          if (m.effectiveStatus === 'Terminé') completedBudFCFA += b;
          else if (m.effectiveStatus === 'En cours') inProgressBudFCFA += b;
        });
      });
    });
    const committedFCFA = completedBudFCFA + Math.round(inProgressBudFCFA * 0.6);
    const actualFCFA = completedBudFCFA + Math.round(inProgressBudFCFA * 0.5);
    const earnedFCFA = completedBudFCFA + Math.round(inProgressBudFCFA * 0.5);
    const cpiVal = actualFCFA > 0 ? (earnedFCFA / actualFCFA).toFixed(2) : '1.00';
    const quarterCashNeedFCFA = Math.max(Math.round(totalBudgetFCFA * 0.25), Math.round((totalBudgetFCFA - actualFCFA) / Math.max(1, 5 - qNum)));

    return {
      ...baseFields,
      activeQuarter: selectedQ,
      referenceCode: `PTT-${selectedQ}-FAAB-${dossier.psdYear || 2026}-017`,
      locationCity: baseFields.locationCity || residenceCity.split(',')[0] || 'Abidjan',
      recipientOrg:
        baseFields.recipientOrg ||
        dossier.institution ||
        'Banque Mondiale / PNUD / BAD / UNICEF / Union Européenne',
      donorDepartment:
        baseFields.donorDepartment ||
        'Direction des Opérations & du Suivi de Portefeuille',
      executingOrgName:
        dossier.institution ||
        userProfile.institution ||
        baseFields.executingOrgName ||
        'Direction Générale de la Stratégie & PMO',
      executingDepartment:
        baseFields.executingDepartment ||
        'Unité de Gestion du Projet (UGP) & Cellule Suivi-Évaluation (S&E)',
      recipientRepresentative: `${quarterLabel} | Statut : Validé par l’UGP (${leadActor}) & Approuvé (${raciCtx.primaryA})`,
      contextJustification: `Bilan succinct du trimestre écoulé (${prevQLabel}) issu des onglets Suivi des tâches et Kanban : sur les ${totalTasks} activités du portefeuille « ${dossier.name} », ${completedTasks} sont achevées (${progressPct}%), ${inProgressTasks} sont en cours d’exécution, ${blockedTasks} sont bloquées et ${delayedTasks} présentent un écart calendaire (début ou fin) nécessitant un rattrapage immédiat sur le ${selectedQ}.`,
      specificObjectives: `Priorités opérationnelles des 90 prochains jours (${quarterLabel}) extraites du PTBA : (1) Achever les ${inProgressTasks} activité(s) en cours et démarrer les ${todoTasks} activité(s) planifiées ; (2) Lever dès le Mois 1 les ${blockedTasks} point(s) de blocage actif(s) ; (3) Protéger intégralement les jalons du chemin critique PERT/CPM (${criticalSeq} — durée critique ${maxDur}j).`,
      methodologyApproach: `Le planning opérationnel de proximité du ${selectedQ} (Matrice M2) décline chaque activité et sous-activité par un verbe d’action opérationnel sur les 3 mois consécutifs (${quarterMonthsMap[qNum]}), en assignant le responsable principal (RACI-R), les associés (RACI-C) et l’indicateur/livrable attendu à la fin du Mois 3 (M3).`,
      extraField1: `Le budget opérationnel et plan de trésorerie du ${selectedQ} (Matrice M5) établit un besoin réel en liquidités de ${formatDocAmount(quarterCashNeedFCFA, currency, lang)} sur 90 jours (ventilé sur Mois 1, Mois 2 et Mois 3), inscrit dans l’enveloppe annuelle de ${budgetFormatted} (Engagé à date : ${formatDocAmount(committedFCFA, currency, lang)} · Décaissé AC : ${formatDocAmount(actualFCFA, currency, lang)} · CPI = ${cpiVal}).`,
      governanceModalities: `La grille RACI trimestrielle d’équipe (Matrice M3) répartit les rôles opérationnels (R : Réalisateur, A : Approbateur, C : Consulté, I : Informé) entre le Chef de Projet / Coordonnateur (${leadActor}), le Responsable S&E, le Spécialiste Passation des Marchés, le Comptable / RAF et les Consultants / Prestataires (${raciCtx.rList.slice(0, 4).join(', ') || raciCtx.primaryR}).`,
      confidentialityClauses: `Les livrables opérationnels à 90 jours (Matrice M9) attendus aux échéances des Mois 1, Mois 2 et Mois 3 sont soumis à la vérification technique de la Cellule S&E et au visa de validation du Coordonnateur UGP (${leadActor}) avant approbation par ${raciCtx.primaryA}.`,
      recommendationsLessons:
        blockedTasks > 0 || delayedTasks > 0
          ? `Gestion des risques immédiats à 90 jours et contraintes logistiques (Matrice M7) : déploiement d’actions correctives immédiates pour débloquer les ${blockedTasks} tâche(s) à l’arrêt et résorber les ${delayedTasks} retard(s) sur la séquence critique (${criticalSeq}).`
          : `Gestion des risques immédiats à 90 jours et contraintes logistiques (Matrice M7) : anticipation des délais d’approvisionnement, disponibilité continue de la trésorerie trimestrielle et maintien de 0 blocage sur la séquence critique (${criticalSeq}).`
    };
  }

  // CATÉGORIE S — 7 PRÉSENTATIONS DE RÉUNION DISTINCTES (SLIDES 16:9 PAYSAGE — DOCS 16 À 22)
  if (
    docType === 'slides_tdr' ||
    docType === 'slides_cadrage' ||
    docType === 'slides_demarrage' ||
    docType === 'slides_ptba' ||
    docType === 'slides_ptt' ||
    docType === 'slides_mi_parcours' ||
    docType === 'slides_evaluation_finale'
  ) {
    const slideCodeMap: Record<string, string> = {
      slides_tdr: `SLIDES-TDR-${dossier.psdYear || 2026}-016`,
      slides_cadrage: `SLIDES-CAD-${dossier.psdYear || 2026}-017`,
      slides_demarrage: `SLIDES-DEM-${dossier.psdYear || 2026}-018`,
      slides_ptba: `SLIDES-PTBA-${dossier.psdYear || 2026}-019`,
      slides_ptt: `SLIDES-PTT-${baseFields.activeQuarter || 'Q1'}-${dossier.psdYear || 2026}-020`,
      slides_mi_parcours: `SLIDES-EMP-${dossier.psdYear || 2026}-021`,
      slides_evaluation_finale: `SLIDES-EVF-${dossier.psdYear || 2026}-022`
    };
    return {
      ...baseFields,
      slidePtbaPttMode: docType === 'slides_ptt' ? 'PTT' : 'PTBA',
      activeQuarter: baseFields.activeQuarter || 'Q1',
      referenceCode: baseFields.referenceCode || slideCodeMap[docType],
      locationCity: baseFields.locationCity || residenceCity.split(',')[0] || 'Abidjan',
      recipientOrg:
        baseFields.recipientOrg ||
        dossier.institution ||
        'Banque Mondiale / PNUD / BAD / UNICEF / Union Européenne',
      donorDepartment:
        baseFields.donorDepartment ||
        'Direction des Opérations & du Financement des Programmes',
      executingOrgName:
        dossier.institution ||
        userProfile.institution ||
        baseFields.executingOrgName ||
        'Direction Générale de la Stratégie & PMO',
      executingDepartment:
        baseFields.executingDepartment ||
        'Unité de Gestion du Projet (UGP) & Cellule Suivi-Évaluation (S&E)',
      recipientRepresentative: `${leadActor} (${leadRole}) · Approbateur COPIL : ${raciCtx.primaryA}`
    };
  }

  return {
    ...baseFields,
    referenceCode: baseFields.referenceCode || `${docPrefix}-FAAB-${dossier.psdYear || 2026}-001`,
    locationCity: baseFields.locationCity || residenceCity.split(',')[0] || 'Abidjan',
    recipientOrg:
      baseFields.recipientOrg ||
      dossier.institution ||
      'Comité de Pilotage & Partenaires Techniques et Financiers',
    donorDepartment:
      baseFields.donorDepartment ||
      'Direction des Opérations & du Financement des Programmes',
    executingOrgName:
      dossier.institution ||
      userProfile.institution ||
      baseFields.executingOrgName ||
      'Direction Générale de la Stratégie & PMO',
    executingDepartment:
      baseFields.executingDepartment ||
      'Unité de Gestion du Projet (UGP) & Cellule Suivi-Évaluation (S&E)',
    recipientRepresentative:
      raciCtx.primaryA ||
      leadActor ||
      baseFields.recipientRepresentative ||
      'Président du Comité de Pilotage',
    contextJustification: `${dossier.description || baseFields.contextJustification}\nPortefeuille actif : « ${dossier.name} » (${dossier.type}, Horizon ${dossier.horizonPlan}, ${dossier.horizonYears} ans), structuré autour de ${(dossier.axes || []).length} axe(s) stratégique(s) [${axesNames || 'Aucun axe'}] et ${pertSummaries.length} projet(s) opérationnel(s) [${projectsNames || 'Aucun projet'}], pour une enveloppe consolidée de ${budgetFormatted}.`,
    specificObjectives: `1. Piloter et livrer les ${totalTasks} activités et jalons programmés (${completedTasks} terminées soit ${progressPct}%, ${inProgressTasks} en cours, ${blockedTasks} bloquées, ${todoTasks} à faire) ;\n2. Sécuriser le chemin critique PERT/CPM (${criticalSeq}) d’une durée totale incompressible de ${maxDur} jour(s) ouvré(s) ;\n3. Garantir la redevabilité budgétaire (${budgetFormatted}) et la qualité des livrables sous la responsabilité de ${leadActor} (${leadRole}).`,
    methodologyApproach: `Démarche intégrée en 5 phases normées (Avant-Projet, Conception, Planification, Exécution & Suivi, Clôture) articulant la Gestion Axée sur les Résultats (GAR), l’ordonnancement algorithmique PERT/CPM (${allNodes.length} nœuds modélisés), le suivi temps réel par tableau Kanban et l’audit des écarts calendaires (${delayedTasks} activité(s) présentant un écart à date).`,
    governanceModalities: `Gouvernance RACI consolidée depuis l’onglet RACI : Réalisateurs (R) [${raciCtx.rList.slice(0, 5).join(', ') || raciCtx.primaryR}] ; Autorité d’approbation (A) [${raciCtx.aList.join(', ') || raciCtx.primaryA}] ; Consultés (C) [${raciCtx.cList.slice(0, 4).join(', ') || raciCtx.primaryC}] ; Informés (I) [${raciCtx.iList.slice(0, 4).join(', ') || raciCtx.primaryI}].`,
    confidentialityClauses: baseFields.confidentialityClauses,
    recommendationsLessons:
      blockedTasks > 0 || delayedTasks > 0
        ? `Priorité opérationnelle issue du Tableau de Bord & Suivi : lever immédiatement les ${blockedTasks} blocage(s) actif(s) et résorber les écarts sur les ${delayedTasks} activité(s) en glissement, en particulier sur la séquence critique PERT (${criticalSeq}).`
        : `Maintenir la cadence d’exécution actuelle (${progressPct}% achevé, 0 blocage critique) et protéger les marges nulles du chemin critique (${criticalSeq}).`
  };
}

/**
 * Construit les pages A4 normées selon le PROMPT SYSTÈME MAÎTRE : ARCHITECTURE MODULAIRE HAUTE PRÉCISION
 * en respectant strictement les 3 catégories de pagination (Catégorie A : 1 page stricte ;
 * Catégorie B : documents courts 2 à 5 pages avec Fiche Signalétique intégrée ;
 * Catégorie C : rapports lourds 10 pages avec protocole liminaire complet + corps spécifique + annexes).
 */
function buildRawInstitutionalDocPages(
  docType: InstitutionalDocType,
  rawFields: CustomDocFields,
  dossier: Dossier,
  userProfile: UserProfile,
  currency: CurrencyCode,
  lang: LanguageCode
): StructuredA4Page[] {
  const cfg = DOC_TEMPLATE_CONFIGS[docType];
  const todayISO = getTodayISO();
  const dateStr = new Date().toLocaleDateString(lang === 'FR' ? 'fr-FR' : 'en-US', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });
  const raciCtx = resolveProgramRaciContext(dossier, userProfile);

  // Résolution des 10 Matrices Maîtresses (M1 à M10) pré-remplies et/ou éditées par l'utilisateur
  const activeMatrices = resolveActiveMatricesData(
    dossier,
    rawFields,
    userProfile,
    currency,
    lang
  );
  const txtVarsMap = buildAllTxtMatrixVariables(activeMatrices);
  const injectTxtVars = (val?: string): string => {
    if (!val) return '';
    let out = val;
    Object.entries(txtVarsMap).forEach(([token, mdTable]) => {
      if (out.includes(token)) {
        out = out.split(token).join(`\n${mdTable}\n`);
      }
    });
    return out;
  };

  const fields: CustomDocFields = {
    ...rawFields,
    profilePhotoDataUrl: rawFields.profilePhotoDataUrl || userProfile.cvPhotoDataUrl || '',
    recipientRepresentative: injectTxtVars(rawFields.recipientRepresentative),
    contextJustification: injectTxtVars(rawFields.contextJustification),
    specificObjectives: injectTxtVars(rawFields.specificObjectives),
    methodologyApproach: injectTxtVars(rawFields.methodologyApproach),
    confidentialityClauses: injectTxtVars(rawFields.confidentialityClauses),
    governanceModalities: injectTxtVars(rawFields.governanceModalities),
    recommendationsLessons: injectTxtVars(rawFields.recommendationsLessons),
    extraField1: injectTxtVars(rawFields.extraField1),
    extraField2: injectTxtVars(rawFields.extraField2),
    extraField3: injectTxtVars(rawFields.extraField3),
    extraField4: injectTxtVars(rawFields.extraField4),
    extraField5: injectTxtVars(rawFields.extraField5),
    extraField6: injectTxtVars(rawFields.extraField6),
    extraField7: injectTxtVars(rawFields.extraField7),
    extraField8: injectTxtVars(rawFields.extraField8),
    extraField9: injectTxtVars(rawFields.extraField9),
    extraField10: injectTxtVars(rawFields.extraField10),
    extraField11: injectTxtVars(rawFields.extraField11)
  };

  const m1Table = buildStructuredA4TableFromMatrix('M1', activeMatrices, currency, lang);
  const m2Table = buildStructuredA4TableFromMatrix('M2', activeMatrices, currency, lang);
  const m3Table = buildStructuredA4TableFromMatrix('M3', activeMatrices, currency, lang);
  const m4Table = buildStructuredA4TableFromMatrix('M4', activeMatrices, currency, lang);
  const m5Table = buildStructuredA4TableFromMatrix('M5', activeMatrices, currency, lang);
  const m6Table = buildStructuredA4TableFromMatrix('M6', activeMatrices, currency, lang);
  const m7Table = buildStructuredA4TableFromMatrix('M7', activeMatrices, currency, lang);
  const m8Table = buildStructuredA4TableFromMatrix('M8', activeMatrices, currency, lang);
  const m9Table = buildStructuredA4TableFromMatrix('M9', activeMatrices, currency, lang);
  const m10Table = buildStructuredA4TableFromMatrix('M10', activeMatrices, currency, lang);

  const pertSummaries = computeDossierPertSummary(dossier, todayISO);
  const allNodes = pertSummaries.flatMap(p => p.nodes);

  let totalTasks = 0;
  let completedTasks = 0;
  let inProgressTasks = 0;
  let blockedTasks = 0;
  let todoTasks = 0;
  let delayedTasksCount = 0;
  let totalBudgetFCFA = 0;
  let completedBudgetFCFA = 0;
  let inProgressBudgetFCFA = 0;

  // Tableaux compacts et calibrés (5 à 6 colonnes max avec ratios explicites = 0 débordement !)
  const wbsBudgetRows: string[][] = [];
  const trackingRows: string[][] = [];
  const raciRows: string[][] = [];
  const deliverablesRows: string[][] = [];
  const ganttPertRows: string[][] = [];
  const projectDashboardRows: string[][] = [];
  const bottleneckRows: string[][] = [];
  const capFinancialRows: string[][] = [];

  (dossier.axes || []).forEach((axe, aIdx) => {
    (axe.projects || []).forEach((proj, prIdx) => {
      const codeMap = new Map<string, string>();
      STANDARD_PHASES.forEach((pName, pIdx) => {
        const pTasks = (proj.tasks || []).filter(tk => tk.phase === pName);
        pTasks.forEach((tk, tIdx) => {
          codeMap.set(tk.id, `${tk.type === 'jalon' ? 'J' : 'T'}.${pIdx + 1}.${tIdx + 1}`);
        });
      });

      let pDone = 0;
      let pInProg = 0;
      let pBlocked = 0;
      let pTodo = 0;
      let pLate = 0;
      let pBudget = 0;
      let pDisbursed = 0;

      (proj.tasks || []).forEach((task, idx) => {
        totalTasks++;
        const metrics = computeTaskMetrics(task, todayISO);
        const b = Number(task.budget) || 0;
        totalBudgetFCFA += b;
        pBudget += b;

        let taskDisbursed = 0;
        if (metrics.effectiveStatus === 'Terminé') {
          completedTasks++;
          completedBudgetFCFA += b;
          pDone++;
          taskDisbursed = b;
        } else if (metrics.effectiveStatus === 'En cours') {
          inProgressTasks++;
          inProgressBudgetFCFA += b;
          pInProg++;
          taskDisbursed = Math.round(b * 0.6);
        } else if (metrics.effectiveStatus === 'Bloqué') {
          blockedTasks++;
          pBlocked++;
          taskDisbursed = Math.round(b * 0.2);
        } else {
          todoTasks++;
          pTodo++;
          taskDisbursed = 0;
        }
        pDisbursed += taskDisbursed;

        if (metrics.ecartDebutDays > 0 || metrics.ecartFinDays > 0) {
          delayedTasksCount++;
          pLate++;
        }

        const code = codeMap.get(task.id) || `${task.type === 'jalon' ? 'J' : 'T'}.${aIdx + 1}.${idx + 1}`;
        const antCode =
          task.antecedent && task.antecedent !== '—'
            ? codeMap.get(task.antecedent) || task.antecedent
            : 'Aucun';
        const labelName = task.type === 'jalon' ? `[Jalon] ${task.name}` : task.name;
        const formattedTaskBudget = formatDocAmount(b, currency, lang);

        // 1. Planification WBS & Budget Analytique (6 colonnes calibrées : [9, 15, 28, 16, 16, 16])
        const resolvedR = (task.assignee || '').trim() || raciCtx.primaryR;
        const resolvedA = (task.autorite || '').trim() || raciCtx.primaryA;
        const resolvedC = (task.consulte || task.responsabilite || '').trim() || raciCtx.primaryC;
        const resolvedI = (task.informe || '').trim() || raciCtx.primaryI;
        const livrableLabel = (task.livrable || '').trim();

        wbsBudgetRows.push([
          code,
          task.phase,
          livrableLabel ? `${labelName}\n[Livrable : ${livrableLabel}]` : labelName,
          `${resolvedR}\n(Antéc. : ${antCode})`,
          `${task.startDate || '—'} au ${task.endDate || '—'} (${metrics.plannedDurationLabel})`,
          formattedTaskBudget
        ]);

        // 2. Suivi de l'Exécution & Écarts (6 colonnes calibrées : [9, 27, 14, 20, 16, 14])
        trackingRows.push([
          code,
          labelName,
          resolvedR,
          `Prév : ${task.startDate || '—'} au ${task.endDate || '—'}\nRéel : ${metrics.effectiveActualStartDate || '—'} au ${metrics.effectiveActualEndDate || '—'}`,
          `Déb : ${metrics.ecartDebutLabel}\nFin : ${metrics.ecartFinLabel}`,
          metrics.effectiveStatus
        ]);

        // 3. Matrice RACI (6 colonnes calibrées : [9, 27, 16, 16, 16, 16])
        raciRows.push([
          code,
          labelName,
          resolvedR,
          resolvedA,
          resolvedC,
          resolvedI
        ]);

        // 4. Livrables, Indicateurs & Crédits (6 colonnes calibrées : [9, 25, 24, 12, 14, 16])
        deliverablesRows.push([
          code,
          `Axe ${aIdx + 1} / P${prIdx + 1}\n${task.name}`,
          livrableLabel || 'Livrable opérationnel documenté & PV',
          task.endDate || '—',
          `${metrics.effectiveStatus}\n(${metrics.ecartFinLabel})`,
          formattedTaskBudget
        ]);

        // 5. Goulots d'étranglement & Alertes d'écarts (6 colonnes calibrées : [9, 27, 16, 14, 17, 17])
        if (metrics.effectiveStatus === 'Bloqué' || metrics.ecartFinDays > 0 || metrics.ecartDebutDays > 0) {
          bottleneckRows.push([
            code,
            `${proj.name} — ${task.name}`,
            resolvedR,
            metrics.effectiveStatus,
            `Déb : ${metrics.ecartDebutLabel}\nFin : ${metrics.ecartFinLabel}`,
            formattedTaskBudget
          ]);
        }
      });

      const pTotal = (proj.tasks || []).length;
      const pPct = pTotal > 0 ? Math.round((pDone / pTotal) * 100) : 0;
      const pExecFinPct = pBudget > 0 ? Math.round((pDisbursed / pBudget) * 100) : 0;

      // Synthèse par Projet (6 colonnes calibrées : [28, 12, 24, 10, 10, 16])
      projectDashboardRows.push([
        `Axe ${aIdx + 1} — P${prIdx + 1} : ${proj.name}`,
        `${pTotal} tâche(s)`,
        `${pDone} Term. · ${pInProg} En cours · ${pBlocked} Bloq. · ${pTodo} À faire`,
        `${pLate} écart(s)`,
        `${pPct}%`,
        formatDocAmount(pBudget, currency, lang)
      ]);

      // Suivi Financier PTBA par Projet pour le Rapport CAP & Clôture (6 colonnes : [24, 18, 18, 18, 10, 12])
      capFinancialRows.push([
        `P${prIdx + 1} — ${proj.name}`,
        formatDocAmount(pBudget, currency, lang),
        formatDocAmount(pDisbursed, currency, lang),
        formatDocAmount(Math.max(0, pBudget - pDisbursed), currency, lang),
        `${pExecFinPct}%`,
        `${pPct}%`
      ]);
    });
  });

  // 6. Ordonnancement PERT/CPM & Marges (6 colonnes calibrées : [9, 27, 14, 18, 18, 14])
  allNodes.forEach(n => {
    ganttPertRows.push([
      n.code,
      n.name,
      `Antéc. : ${n.antecedentCode || 'Aucun'}\nChaîne : ${n.precedingChainCodes || '—'}`,
      `Tôt : J+${n.es} -> J+${n.ef}\nTard : J+${n.ls} -> J+${n.lf}`,
      n.isCritical ? 'CRITIQUE (Marge 0j)' : `Souple (MT: +${n.totalFloat}j / ML: +${n.freeFloat}j)`,
      `${n.status}\n(${n.duration}j)`
    ]);
  });

  const progressPct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  const criticalNodes = allNodes.filter(n => n.isCritical);
  const criticalSequence = criticalNodes.map(n => n.code).join(' -> ') || 'Aucune séquence critique détectée';
  const maxProjectDuration = pertSummaries.reduce((acc, p) => Math.max(acc, p.projectDuration), 0);
  const committedBudgetFCFA = completedBudgetFCFA + Math.round(inProgressBudgetFCFA * 0.6);
  const remainingBudgetFCFA = Math.max(0, totalBudgetFCFA - committedBudgetFCFA);
  const financialExecutionPct = totalBudgetFCFA > 0 ? Math.round((committedBudgetFCFA / totalBudgetFCFA) * 100) : 0;

  const nomDuProjet = dossier.name || 'Portefeuille Stratégique faab gar';
  const organisationCommanditaire =
    fields.executingOrgName !== undefined
      ? fields.executingOrgName
      : dossier.institution || userProfile.institution || 'Direction Générale de la Stratégie & PMO';
  const directionPilote =
    fields.executingDepartment !== undefined
      ? fields.executingDepartment
      : 'Unité de Gestion du Projet (UGP) & Cellule S&E';
  const bailleurDeFonds =
    fields.recipientOrg !== undefined
      ? fields.recipientOrg
      : dossier.institution || 'Partenaires Techniques et Financiers (PNUD / BM / BAD / UE)';
  const directionBailleur =
    fields.donorDepartment !== undefined
      ? fields.donorDepartment
      : 'Direction des Opérations & Financements';
  const zoneGeographique = fields.locationCity || userProfile.residenceCity || 'Abidjan, République de Côte d’Ivoire';
  const budgetGlobalFormatted = formatDocAmount(totalBudgetFCFA, currency, lang);
  const committedBudgetFormatted = formatDocAmount(committedBudgetFCFA, currency, lang);
  const remainingBudgetFormatted = formatDocAmount(remainingBudgetFCFA, currency, lang);
  const dureeOuPeriode = `Horizon ${dossier.horizonPlan} (${dossier.horizonYears} ans · Chemin critique : ${maxProjectDuration} jours ouvrés)`;
  const objectifPrincipal = dossier.description || fields.specificObjectives;
  const leadActorName = raciCtx.leadActorName;
  const leadActorRole = raciCtx.leadActorRole;
  const userNationality = userProfile.nationality || 'Ivoirienne';
  const userYearsExp = userProfile.yearsExperience || '+15 ans';
  const userBirthDate = userProfile.birthDate ? ` (Né(e) le ${userProfile.birthDate})` : '';
  const userLinkedIn = userProfile.linkedIn ? ` | LinkedIn : ${userProfile.linkedIn}` : '';

  // ============================================================================
  // CATÉGORIE A (DOC 1 : COURRIER ADMINISTRATIF CLASSIQUE — 1 PAGE A4 STRICTE)
  // ============================================================================
  if (docType === 'courrier_admin') {
    const singlePageCourrier: StructuredA4Page = {
      pageTitle: `COURRIER ADMINISTRATIF OFFICIEL (1 PAGE A4 STRICTE)`,
      pageSubtitle: `Protocole Catégorie A · ${organisationCommanditaire} · Réf. ${fields.referenceCode}`,
      isSignaturePage: true,
      orgStampDataUrl: fields.orgStampDataUrl,
      partnerStampDataUrl: fields.partnerStampDataUrl,
      sections: [
        {
          heading: 'TIMBRE ADMINISTRATIF, COORDONNÉES DES PARTIES & OBJET OFFICIEL',
          adminLetterHeader: {
            senderInstitution: organisationCommanditaire,
            senderName: leadActorName,
            senderRole: leadActorRole,
            senderContact: `${userProfile.email} · Tél : ${userProfile.phone}`,
            referenceCode: fields.referenceCode || 'COUR-FAAB-2026-011',
            cityAndDate: `${fields.locationCity || 'Abidjan'}, le ${dateStr}`,
            recipientTitle: fields.recipientRepresentative || raciCtx.primaryA || 'Monsieur / Madame le Directeur Général',
            recipientOrg: fields.recipientOrg || 'Direction Générale & Partenaires Institutionnels',
            subjectLine: fields.contextJustification,
            dossierRefLine: `${nomDuProjet} (${dossier.horizonPlan} · Budget : ${budgetGlobalFormatted} · Exécution : ${progressPct}%)`,
            leftLogoDataUrl: fields.leftLogoDataUrl,
            rightLogoDataUrl: fields.rightLogoDataUrl
          }
        },
        {
          heading: 'CORPS DE LA CORRESPONDANCE ADMINISTRATIVE (STRUCTURE NORMÉE EN 3 PARAGRAPHES)',
          paragraphs: [
            fields.specificObjectives,
            fields.methodologyApproach,
            fields.governanceModalities,
            fields.recommendationsLessons
          ].filter(Boolean)
        },
        {
          heading: 'SYNTHÈSE CHIFFRÉE DU DOSSIER DE RÉFÉRENCE & MENTIONS (P.J. / AMPLIATIONS)',
          table: {
            headers: [
              'Portefeuille de Référence (24%)',
              'Structure WBS (16%)',
              'Bilan des Activités (24%)',
              'Chemin Critique PERT (18%)',
              `Budget Consolidé (18%)`
            ],
            columnWidths: [24, 16, 24, 18, 18],
            rightAlignCols: [4],
            rows: [
              [
                `${nomDuProjet} (${dossier.horizonPlan})`,
                `${(dossier.axes || []).length} Axe(s) / ${pertSummaries.length} Projet(s)`,
                `${completedTasks}/${totalTasks} Terminées (${progressPct}%) · ${inProgressTasks} En cours · ${blockedTasks} Bloquées`,
                `${maxProjectDuration}j (${criticalSequence})`,
                budgetGlobalFormatted
              ]
            ]
          },
          paragraphs: fields.confidentialityClauses ? [fields.confidentialityClauses] : undefined
        }
      ]
    };

    return [singlePageCourrier];
  }

  // ============================================================================
  // CATÉGORIE D : DOCUMENTS OPÉRATIONNELS & RH SANS PAGE DE GARDE (DOCS 12 À 15)
  // ============================================================================

  // ----------------------------------------------------------------------------
  // DOCUMENT 12 : CV PROFESSIONNEL EXÉCUTIF CHEF DE PROJET / EXPERT (1 PAGE STRICTE - AVEC PHOTO)
  // ----------------------------------------------------------------------------
  if (docType === 'cv_executif') {
    const m3Rows = activeMatrices.M3 || [];
    const m1Rows = activeMatrices.M1 || [];
    const m5Rows = activeMatrices.M5 || [];

    // Expériences phares synchronisées avec les Projets du Dossier + Matrices M3, M1, M5 + CV Utilisateur
    const expBullets: string[] = [];
    (dossier.axes || []).forEach((axe, aIdx) => {
      (axe.projects || []).forEach((proj, pIdx) => {
        const pTasks = proj.tasks || [];
        const pBud = pTasks.reduce((s, t) => s + (Number(t.budget) || 0), 0);
        const pDone = pTasks.filter(
          t => computeTaskMetrics(t, todayISO).effectiveStatus === 'Terminé'
        ).length;
        const pPct = pTasks.length > 0 ? Math.round((pDone / pTasks.length) * 100) : 0;
        const pLivs = pTasks.map(t => t.livrable).filter(Boolean).slice(0, 3).join(', ');
        expBullets.push(
          `[${dossier.horizonPlan}] ${userProfile.role.toUpperCase()} — Projet « ${proj.name} » (${organisationCommanditaire} / ${bailleurDeFonds}, ${zoneGeographique}) · Budget géré : ${formatDocAmount(pBud, currency, lang)} : (1) Pilotage opérationnel de ${pTasks.length} activités WBS sur l’Axe ${aIdx + 1}.${pIdx + 1} avec un taux de réalisation physique de ${pPct}% ; (2) Ordonnancement du chemin critique PERT/CPM (${maxProjectDuration}j) et maîtrise des coûts EVM ; (3) Livrables : ${pLivs || 'Coordination RACI et livraison des extrants GAR homologués'}.`
        );
      });
    });

    if (fields.methodologyApproach) {
      fields.methodologyApproach
        .split('\n')
        .map(l => l.trim())
        .filter(Boolean)
        .forEach(line => {
          if (expBullets.length < 5 && !expBullets.includes(line)) {
            expBullets.push(line);
          }
        });
    }

    const skillsLines = (fields.specificObjectives || userProfile.cvKeySkills || '')
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean);

    const diplomaCertLines = (fields.governanceModalities || '')
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean);

    const singlePageCvExec: StructuredA4Page = {
      pageTitle: `CURRICULUM VITAE EXÉCUTIF — ${userProfile.fullName.toUpperCase()}`,
      pageSubtitle: `Catégorie D (1 Page A4 Stricte · Sans Page de Garde · Avec Photo) · Réf. ${fields.referenceCode}`,
      sections: [
        {
          heading: 'BANDEAU D’EN-TÊTE EXÉCUTIF & COORDONNÉES PROFESSIONNELLES (SANS PAGE DE GARDE)',
          cvHeaderBanner: {
            variant: 'cv_executif',
            docBadge: 'CURRICULUM VITAE EXÉCUTIF — 1 PAGE A4 STRICTE (NORMES INTERNATIONALES)',
            fullNameUpper: userProfile.fullName.toUpperCase(),
            expertTitleLine: `${userProfile.role} (${userYearsExp} d’exp.)${userBirthDate} — Posture Programme : ${raciCtx.intervenesAsProgramActor ? 'Acteur Direct du Programme' : 'Spécialiste en Gestion de Projet (Appui PMO)'}`,
            contactLine: `${userProfile.residenceCity || zoneGeographique} | Tél : ${userProfile.phone} | Email : ${userProfile.email}${userLinkedIn} | Institution : ${userProfile.institution || organisationCommanditaire} | Nationalité : ${userNationality}`,
            metaSubLine: fields.recipientRepresentative,
            profilePhotoDataUrl: fields.profilePhotoDataUrl
          }
        },
        {
          heading: '1. PROFIL EXÉCUTIF & PROPOSITION DE VALEUR',
          paragraphs: [
            `${fields.contextJustification}\nSynthèse Quantitative Clé : ${userYearsExp} d’expérience internationale | Portefeuille actif : « ${nomDuProjet} » (${budgetGlobalFormatted} consolidés sur ${pertSummaries.length} projet(s) et ${totalTasks} activités WBS, ${progressPct}% réalisés) | Pays & Bailleurs : ${userProfile.cvCountriesAndDonors || 'Banque Mondiale, BAD, Union Européenne, PNUD, UNICEF'}.`
          ]
        },
        {
          heading: '2. MATRICE DES COMPÉTENCES CLÉS & CERTIFICATIONS (SYNCHRONISÉE PROFIL CV / M3 / GAR / EVM)',
          table: {
            headers: [
              'Ingénierie & Gestion de Projet (34%)',
              'Suivi-Évaluation & GAR (33%)',
              'Gouvernance, Fiduciaire & Outils (33%)'
            ],
            columnWidths: [34, 33, 33],
            rows: [
              [
                skillsLines[0] ||
                  `• Pilotage de portefeuilles & PMO (PMBOK® 7 / ISO 21500:2021)\n• Découpage WBS, PTBA & Ordonnancement PERT/CPM (${maxProjectDuration}j)\n• Gestion de la Valeur Acquise (EVM : BAC, EV, AC, CPI — ${m5Rows.length} lignes M5)`,
                skillsLines[1] ||
                  `• Conception de Cadres Logiques GAR (${m1Rows.length} résultats M1) & Théorie du Changement\n• Évaluations indépendantes selon les 6 critères OCDE/CAD & normes UNEG\n• Dispositifs S&E informatisés, indicateurs SMART & assurance qualité GEROS`,
                skillsLines[2] ||
                  `• Gouvernance COPIL, Matrice RACI (${m3Rows.length} postes M3) & Management d’UGP\n• Gestion des Risques Board RAID & Passation des Marchés (BM / BAD / UE)\n• Outils : ${userProfile.cvSoftwareTools || 'faab gar, MS Project, Primavera P6, Power BI, KoboToolbox'}`
              ]
            ]
          }
        },
        {
          heading: '3. EXPÉRIENCES PROFESSIONNELLES SIGNIFICATIVES (SÉLECTION EXÉCUTIVE QUANTIFIÉE)',
          bullets: expBullets.slice(0, 4)
        },
        {
          heading: '4. FORMATION ACADÉMIQUE, DIPLÔMES & ACCRÉDITATIONS INTERNATIONALES',
          table: {
            headers: [
              'Catégorie / Période (20%)',
              'Diplôme Universitaire / Certification Internationale (50%)',
              'Institution Académique / Organisme & Pays (30%)'
            ],
            columnWidths: [20, 50, 30],
            rows: [
              [
                'Certifications Internationales',
                userProfile.cvCertifications ||
                  diplomaCertLines[1] ||
                  'Project Management Professional (PMP®) · ISO 21500 Lead Project Manager · Certificat GAR/S&E (UNEG/CLEAR)',
                'PMI® / PECB / Banque Mondiale & PNUD'
              ],
              [
                'Cursus Académique & Diplômes',
                userProfile.cvEducationDiplomas ||
                  diplomaCertLines[0] ||
                  'Master Exécutif / Diplôme d’Ingénieur en Management de Projets Internationaux & Ingénierie du Développement',
                userProfile.institution || 'Grande École / Université Internationale'
              ]
            ]
          }
        },
        {
          heading: '5. LANGUES (CADRE CECRL), LOGICIELS TECHNIQUES & DISPONIBILITÉ',
          paragraphs: [
            `${fields.confidentialityClauses}${fields.recommendationsLessons ? `\nDisponibilité : ${fields.recommendationsLessons}` : ''}`
          ]
        }
      ]
    };

    return [singlePageCvExec];
  }

  // ----------------------------------------------------------------------------
  // DOCUMENT 13 : CV PROFESSIONNEL DÉTAILLÉ / APPEL D'OFFRES BAILLEURS (4 PAGES - AVEC PHOTO)
  // ----------------------------------------------------------------------------
  if (docType === 'cv_detaille') {
    const m1Rows = activeMatrices.M1 || [];
    const m5Rows = activeMatrices.M5 || [];

    // Construction des fiches de missions détaillées à partir des projets réels + M3/M5/M9 + CV Utilisateur
    const missionSummaryRows: string[][] = [];
    const missionDetailedParagraphs: string[] = [];

    (dossier.axes || []).forEach((axe, aIdx) => {
      (axe.projects || []).forEach((proj, pIdx) => {
        const pTasks = proj.tasks || [];
        const pBud = pTasks.reduce((s, t) => s + (Number(t.budget) || 0), 0);
        const pDone = pTasks.filter(
          t => computeTaskMetrics(t, todayISO).effectiveStatus === 'Terminé'
        ).length;
        const pPct = pTasks.length > 0 ? Math.round((pDone / pTasks.length) * 100) : 0;
        const livs = pTasks
          .map(t => t.livrable)
          .filter(Boolean)
          .join(' ; ');

        missionSummaryRows.push([
          `${dossier.horizonPlan}\n(${dossier.horizonYears} ans)`,
          zoneGeographique,
          `${organisationCommanditaire}\n(${bailleurDeFonds})`,
          `${userProfile.role}\n(${raciCtx.intervenesAsProgramActor ? 'Chef de Mission / Acteur RACI' : 'Spécialiste en Gestion de Projet PMO'})`,
          formatDocAmount(pBud, currency, lang)
        ]);

        missionDetailedParagraphs.push(
          `MISSION ${aIdx + 1}.${pIdx + 1} — PROJET : « ${proj.name.toUpperCase()} » (${axe.name})\n` +
            `• Période : ${dossier.horizonPlan} | Pays : ${zoneGeographique} | Client / Bailleur : ${bailleurDeFonds} | Financement géré : ${formatDocAmount(pBud, currency, lang)} | Poste : ${userProfile.role}\n` +
            `• Objectif global du projet : ${dossier.description}\n` +
            `• Responsabilités techniques exercées : (1) Structuration du découpage WBS en 5 phases normées (${pTasks.length} activités et jalons) ; (2) Modélisation du réseau PERT/CPM et pilotage des marges critiques ; (3) Supervision de l’exécution budgétaire PTBA et contrôle de la Valeur Acquise (EVM) ; (4) Coordination des équipes pluridisciplinaires selon la matrice RACI ; (5) Assurance qualité et réception des livrables (${pDone}/${pTasks.length} achevés soit ${pPct}%).\n` +
            `• Livrables produits et résultats atteints : ${livs || 'Rapport de cadrage ProDoc, PTBA consolidé, Rapports périodiques CAP et PV de réception définitive'}.`
        );
      });
    });

    const eduLines = (fields.specificObjectives || userProfile.cvEducationDiplomas || '')
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean);

    const langLines = (fields.extraField2 || userProfile.cvLanguages || '')
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean);

    const page1CvDetaille: StructuredA4Page = {
      pageTitle: `CV DÉTAILLÉ BAILLEURS (PAGE 1/4) — IDENTIFICATION, QUALIFICATIONS & ÉDUCATION`,
      pageSubtitle: `Format International WB Form TECH-6 / EuropeAid / P11 ONU · Sans Page de Garde · Avec Photo 3.5x4.5cm`,
      sections: [
        {
          heading: 'BANDEAU D’EN-TÊTE OFFICIEL BAILLEURS AVEC PHOTO D’IDENTITÉ (SANS PAGE DE GARDE)',
          cvHeaderBanner: {
            variant: 'cv_detaille',
            docBadge: 'CURRICULUM VITAE DÉTAILLÉ — FORMAT INTERNATIONAL BAILLEURS (BM / BAD / UE / ONU)',
            fullNameUpper: `EXPERT : ${userProfile.fullName.toUpperCase()}`,
            expertTitleLine: `POSTE PROPOSÉ : ${userProfile.role.toUpperCase()} — ${raciCtx.intervenesAsProgramActor ? 'CHEF DE MISSION / ACTEUR DU PROGRAMME' : 'SPÉCIALISTE EN GESTION DE PROJET & S&E'} (${userYearsExp})`,
            contactLine: `Nationalité : ${userNationality}${userBirthDate} | Résidence : ${userProfile.residenceCity || zoneGeographique} | Tél : ${userProfile.phone} | Email : ${userProfile.email}${userLinkedIn}`,
            metaSubLine: fields.recipientRepresentative,
            profilePhotoDataUrl: fields.profilePhotoDataUrl
          }
        },
        {
          heading: '1. FICHE SYNOPTIQUE DE L’EXPERT (ÉTAT CIVIL, COORDONNÉES & PORTÉE INTERNATIONALE)',
          table: {
            headers: [
              'Rubrique d’Identification (22%)',
              'Données Officielles de l’Expert (28%)',
              'Paramètre de Qualification (22%)',
              'Détails & Références Bailleurs (28%)'
            ],
            columnWidths: [22, 28, 22, 28],
            rows: [
              [
                'Nom & Prénoms complets',
                `${userProfile.fullName}${userBirthDate}`,
                'Poste & Posture sur le Programme',
                `${userProfile.role} (${raciCtx.intervenesAsProgramActor ? 'Acteur direct RACI' : 'Spécialiste PMO / Non-acteur RACI'})`
              ],
              [
                'Nationalité & Résidence',
                `${userNationality} — ${userProfile.residenceCity || zoneGeographique}`,
                'Années d’expérience cumulée',
                `${userYearsExp} en Ingénierie de Projet, PMO, GAR & S&E`
              ],
              [
                'Contacts directs vérifiables',
                `Tél : ${userProfile.phone}\nEmail : ${userProfile.email}${userProfile.linkedIn ? `\nLinkedIn : ${userProfile.linkedIn}` : ''}`,
                'Portefeuille actif géré / modélisé',
                `${nomDuProjet} (${budgetGlobalFormatted})`
              ],
              [
                'Institution de rattachement',
                userProfile.institution || organisationCommanditaire,
                'Pays & Bailleurs pratiqués',
                fields.governanceModalities || userProfile.cvCountriesAndDonors || 'UEMOA, CEDEAO — BM, BAD, UE, PNUD'
              ]
            ]
          }
        },
        {
          heading: '2. RÉSUMÉ EXÉCUTIF DES QUALIFICATIONS & VALEUR AJOUTÉE POUR LA MISSION',
          paragraphs: [fields.contextJustification]
        },
        {
          heading: '3. CURSUS UNIVERSITAIRE, DIPLÔMES & CERTIFICATIONS INTERNATIONALES',
          table: {
            headers: [
              'Institution / Organisme & Pays (28%)',
              'Période / Dates (14%)',
              'Diplôme Obtenu / Accréditation Internationale (34%)',
              'Spécialisation Principale (24%)'
            ],
            columnWidths: [28, 14, 34, 24],
            rows: [
              [
                'Grande École / Université Internationale',
                'Cursus Master / Ing.',
                eduLines[0] ||
                  'Master / DEA en Ingénierie de Projets & Économie du Développement',
                'Planification Stratégique, GAR, Évaluation & Finance de Projet'
              ],
              [
                'Université / Institut Polytechnique',
                'Cursus Supérieur',
                eduLines[1] ||
                  'Diplôme d’Ingénieur / Maîtrise en Sciences de Gestion & Statistique',
                'Modélisation PERT/CPM, Statistique & Systèmes d’Information'
              ],
              [
                'PMI® / PECB / Banque Mondiale / UNEG',
                'Accréditations Actives',
                fields.methodologyApproach || userProfile.cvCertifications || 'PMP®, ISO 21500, GAR/UNEG',
                'Standards PMBOK® 7, ISO 21500:2021, OCDE/CAD, UNEG & FIDIC'
              ]
            ]
          }
        },
        {
          heading: '4. COMPÉTENCES LINGUISTIQUES (CADRE EUROPÉEN CECRL) & 5. MAÎTRISE DES LOGICIELS S&E',
          table: {
            headers: [
              'Langue / Catégorie d’Outils (26%)',
              'Niveau Lu / Planification PMO (24%)',
              'Niveau Écrit / Collecte S&E (25%)',
              'Niveau Parlé / Analyse & BI (25%)'
            ],
            columnWidths: [26, 24, 25, 25],
            rows: [
              [
                'Langues de travail (CECRL)',
                langLines[0] || 'Français : C2 — Excellent (Expert)',
                langLines[1] || 'Anglais : C1 — Avancé professionnel',
                'Communication & Négociation COPIL / PTF'
              ],
              [
                'Logiciels & Systèmes Maîtrisés',
                userProfile.cvSoftwareTools || 'faab gar, MS Project, Primavera P6 (PERT/CPM & Gantt)',
                'KoboToolbox, ODK, SurveyCTO, DHIS2, Google Workspace',
                'Power BI, SPSS, R, Stata, Excel Avancé (Modélisation EVM)'
              ]
            ]
          }
        }
      ]
    };

    const page2CvDetaille: StructuredA4Page = {
      pageTitle: `CV DÉTAILLÉ BAILLEURS (PAGE 2/4) — EXPÉRIENCES PROFESSIONNELLES DÉTAILLÉES (PARTIE I)`,
      pageSubtitle: `Historique Chronologique Inversé des Missions de Direction de Programme & Pilotage PMO (Synchronisé M3 & M5)`,
      sections: [
        {
          heading: '6. EXPÉRIENCES PROFESSIONNELLES DÉTAILLÉES — SYNTHÈSE CHRONOLOGIQUE DES PROJETS GÉRÉS',
          table: {
            headers: [
              'Période & Durée (15%)',
              'Pays / Zone (16%)',
              'Employeur / Bailleur (23%)',
              'Poste Occupé & Rôle RACI (26%)',
              `Financement Géré (20%)`
            ],
            columnWidths: [15, 16, 23, 26, 20],
            rightAlignCols: [4],
            rows:
              missionSummaryRows.length > 0
                ? [
                    ...missionSummaryRows,
                    [
                      '2018 – 2022\n(4 ans)',
                      'Afrique de l’Ouest (UEMOA)',
                      'Union Européenne / BAD / PNUD',
                      'Expert Principal Suivi-Évaluation & GAR (Cat. I)',
                      formatDocAmount(450000000, currency, lang)
                    ],
                    [
                      '2014 – 2018\n(4 ans)',
                      'Côte d’Ivoire & Sous-région',
                      'Banque Mondiale (IDA) / UGP',
                      'Coordonnateur Technique & Spécialiste Planification',
                      formatDocAmount(320000000, currency, lang)
                    ]
                  ]
                : [
                    [
                      dossier.horizonPlan,
                      zoneGeographique,
                      bailleurDeFonds,
                      userProfile.role,
                      budgetGlobalFormatted
                    ]
                  ]
          }
        },
        {
          heading: '6.1 FICHES DÉTAILLÉES DES MISSIONS SUR LE PORTEFEUILLE ACTIF & EXPÉRIENCES ANTÉRIEURES',
          paragraphs: [
            ...missionDetailedParagraphs,
            ...(fields.extraField1 ? [fields.extraField1] : [])
          ]
        },
        {
          heading: '6.2 RESPONSABILITÉS DE GOUVERNANCE RACI & ÉQUIPE D’EXPERTS DU PROGRAMME (MATRICE M3)',
          table: m3Table
        }
      ]
    };

    const page3CvDetaille: StructuredA4Page = {
      pageTitle: `CV DÉTAILLÉ BAILLEURS (PAGE 3/4) — EXPÉRIENCES DÉTAILLÉES (PARTIE II : RÉSULTATS GAR M1, BUDGET EVM M5 & LIVRABLES M9)`,
      pageSubtitle: `Preuves Quantifiées de Performance : Cadre Logique Géré (M1), Exécution Budgétaire EVM (M5) & Livrables Homologués (M9)`,
      sections: [
        {
          heading: '6.3 RÉSULTATS GAR & INDICATEURS SMART ATTEINTS SUR LE PROGRAMME (MATRICE M1)',
          paragraphs: [
            `Dans le cadre du programme « ${nomDuProjet} », ${userProfile.fullName} (${raciCtx.intervenesAsProgramActor ? 'intervenant comme acteur du programme' : 'intervenant comme spécialiste en gestion de projet / PMO'}) assure le suivi des cibles suivantes inscrites au Cadre de Résultats (${m1Rows.length} indicateurs suivis) :`
          ],
          table: m1Table
        },
        {
          heading: '6.4 MAÎTRISE BUDGÉTAIRE PTBA & PERFORMANCE PAR LA VALEUR ACQUISE EVM (MATRICE M5)',
          table: m5Table
        },
        {
          heading: '6.5 INVENTAIRE DES LIVRABLES MAJEURS RÉDIGÉS, VALIDÉS ET HOMOLOGUÉS (MATRICE M9)',
          table: {
            headers: m9Table.headers,
            columnWidths: m9Table.columnWidths,
            rightAlignCols: m9Table.rightAlignCols,
            rows: (m9Table.rows || []).slice(0, 8)
          }
        }
      ]
    };

    // Parse 3 references from recommendationsLessons or userProfile.cvReferences
    const refLines = (fields.recommendationsLessons || userProfile.cvReferences || '')
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean);

    const pubLines = (fields.confidentialityClauses || userProfile.cvPublicationsAffiliations || '')
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean);

    const page4CvDetaille: StructuredA4Page = {
      pageTitle: `CV DÉTAILLÉ BAILLEURS (PAGE 4/4) — PUBLICATIONS, RÉFÉRENCES & ATTESTATION DE SINCÉRITÉ SIGNÉE`,
      pageSubtitle: `Sections 7, 8, 9 & 10 · Travaux Scientifiques, Personnes de Référence Vérifiables & Attestation Officielle WB/UE/ONU`,
      isSignaturePage: true,
      orgStampDataUrl: fields.orgStampDataUrl,
      partnerStampDataUrl: fields.partnerStampDataUrl,
      sections: [
        {
          heading: '7. PUBLICATIONS SCIENTIFIQUES, MANUELS MÉTHODOLOGIQUES & 8. AFFILIATIONS PROFESSIONNELLES',
          paragraphs: [fields.confidentialityClauses || userProfile.cvPublicationsAffiliations || ''],
          bullets:
            pubLines.length > 1
              ? pubLines
              : [
                  'Project Management Institute (PMI®) — Membre actif & Certifié PMP® (Respect du Code d’Éthique et de Conduite Professionnelle).',
                  'Réseau Francophone de l’Évaluation (RFE) & Association Africaine d’Évaluation (AfrEA) — Expert Évaluateur Senior.',
                  'Praticien certifié des normes du Groupe des Nations Unies pour l’Évaluation (UNEG) et des critères du Comité d’Aide au Développement (OCDE/CAD).'
                ]
        },
        {
          heading: '9. PERSONNES DE RÉFÉRENCE PROFESSIONNELLE VÉRIFIABLES (MINIMUM 3 RÉFÉRENCES)',
          table: {
            headers: [
              'Référence # (12%)',
              'Identité, Fonction, Institution & Coordonnées Directes Vérifiables (88%)'
            ],
            columnWidths: [12, 88],
            rows: [
              [
                'Réf. 01',
                refLines[0] || 'Dr. Kouadio Jean-Baptiste — Directeur Général de la Planification & du S&E | Ministère du Plan / COPIL | dg.plan@gouv.ci | +225 27 20 00 11 22'
              ],
              [
                'Réf. 02',
                refLines[1] || 'Mme Aminata Touré — Spécialiste Senior en Gestion de Projets & S&E | Banque Mondiale / PNUD | atoure.se@worldbank-undp.org | +221 33 859 00 00'
              ],
              [
                'Réf. 03',
                refLines[2] || 'M. Marc-Antoine Lefèvre — Chef de Coopération, Infrastructures & Gouvernance | Union Européenne / BAD | ma.lefevre@intl-coop.eu | +32 2 299 11 11'
              ]
            ]
          }
        },
        {
          heading: '10. ATTESTATION DE SINCÉRITÉ ET D’ENGAGEMENT DE DISPONIBILITÉ (NORME WB TECH-6 / EUROPEAID)',
          paragraphs: [
            `« Je, soussigné(e) ${userProfile.fullName}, certifie sur l’honneur, en toute conscience, que les renseignements ci-dessus rendent fidèlement compte de ma situation, de mes qualifications et de mon expérience. Disponibilité : ${userProfile.cvAvailability || 'Immédiate'}. Je m’engage à réaliser la mission au sein de « ${nomDuProjet} » conformément aux exigences méthodologiques et déontologiques. »`,
            `Fait à ${fields.locationCity || 'Abidjan'}, le ${dateStr} — Signature officielle de l’Expert :`
          ]
        }
      ]
    };

    return [page1CvDetaille, page2CvDetaille, page3CvDetaille, page4CvDetaille];
  }

  // ----------------------------------------------------------------------------
  // DOCUMENT 14 : PROCÈS-VERBAL (PV) OFFICIEL DE RÉUNION (2 PAGES - SANS PAGE DE GARDE)
  // ----------------------------------------------------------------------------
  if (docType === 'pv_reunion') {
    const m4Rows = activeMatrices.M4 || [];
    const m7Rows = activeMatrices.M7 || [];
    const m10Rows = activeMatrices.M10 || [];

    // Construction de la feuille de présence officielle à 6 colonnes depuis M4 + Équipe RACI / Utilisateur
    const attendanceRows: string[][] = [];
    if (raciCtx.intervenesAsProgramActor || !raciCtx.hasAnyRaciActor) {
      attendanceRows.push([
        '01',
        userProfile.fullName,
        organisationCommanditaire,
        `${userProfile.role} (Rapporteur / Secrétaire)`,
        `${userProfile.email}\n${userProfile.phone}`,
        'PRÉSENT (Émargé)'
      ]);
    }

    m4Rows.forEach((r, idx) => {
      const rowNum = attendanceRows.length + 1;
      attendanceRows.push([
        String(rowNum).padStart(2, '0'),
        r.Nom_Institution_Groupe || `Acteur #${rowNum}`,
        r.Categorie_Acteur || organisationCommanditaire,
        r.Role_Dans_Projet || 'Membre du Comité',
        r.Canal_Frequence_Comm || 'Contact officiel COPIL',
        idx < 5 ? 'PRÉSENT (Émargé)' : 'EXCUSÉ (Représenté)'
      ]);
    });

    // Construction de la Matrice de Suivi des Décisions et Plan d'Actions Immédiat (Section 5 — 6 colonnes) depuis M10 & M7
    const pvActionRows: string[][] = m10Rows.map((r, i) => [
      r.Code_Action_Rec || `DEC-${String(i + 1).padStart(2, '0')}`,
      r.Recommandation_Prescription_Action || r.Constat_Ecart_Lecon_Identifiee || 'Action décidée en séance',
      r.Responsable_Execution || raciCtx.primaryR,
      r.Echeance_Cible || todayISO,
      r.Indicateur_Verif_Mise_En_Oeuvre || 'PV / Livrable validé',
      `${r.Priorite || 'Haute'} (${r.Statut_Mise_En_Oeuvre || 'En cours'})`
    ]);

    if (pvActionRows.length === 0) {
      m7Rows.slice(0, 3).forEach((r, i) => {
        pvActionRows.push([
          `ACT-${String(i + 1).padStart(2, '0')}`,
          r.Plan_Action_Mitigation || r.Description_Precise,
          r.Proprietaire_Risque || raciCtx.primaryR,
          todayISO,
          'Rapport de levée de réserve',
          `Critique (${r.Statut_RAID || 'Ouvert'})`
        ]);
      });
    }

    const page1PvReunion: StructuredA4Page = {
      pageTitle: `PROCÈS-VERBAL OFFICIEL DE RÉUNION — ${fields.referenceCode}`,
      pageSubtitle: `Catégorie D (Page 1/2 · Sans Page de Garde) · Fiche Signalétique, Feuille de Présence (M4), Ordre du Jour & Débats`,
      sections: [
        {
          heading: 'BANDEAU D’EN-TÊTE OFFICIEL DE SÉANCE',
          operationalHeaderBanner: {
            variant: 'pv_reunion',
            leftLogoLabel: organisationCommanditaire,
            rightLogoLabel: bailleurDeFonds,
            leftLogoDataUrl: fields.leftLogoDataUrl,
            rightLogoDataUrl: fields.rightLogoDataUrl,
            centerDocTitle: `PROCÈS-VERBAL OFFICIEL DE RÉUNION — ${fields.referenceCode}`,
            centerSubTitle: `Portefeuille : « ${nomDuProjet} » (${dossier.horizonPlan} · Budget : ${budgetGlobalFormatted})`,
            referenceAndDateLine: `Séance tenue le ${dateStr} à ${fields.locationCity || 'Abidjan'} · Quorum vérifié et atteint`
          }
        },
        {
          heading: '1. FICHE SIGNALÉTIQUE DE LA SÉANCE',
          table: {
            headers: [
              'Paramètre de Séance (22%)',
              'Détails Officiels (28%)',
              'Gouvernance & Quorum (22%)',
              'Validation Institutionnelle (28%)'
            ],
            columnWidths: [22, 28, 22, 28],
            rows: [
              [
                'Projet / Programme',
                `${nomDuProjet} (${dossier.horizonPlan})`,
                'Président de Séance (RACI-A)',
                `${raciCtx.primaryA} (${fields.recipientOrg})`
              ],
              [
                'Type d’Instance',
                'Comité de Pilotage (COPIL) & Revue d’Avancement',
                'Secrétaire de Séance (Rapporteur)',
                `${leadActorName} (${leadActorRole})`
              ],
              [
                'Date & Horaire',
                `${dateStr} (09h00 – 12h30)`,
                'Lieu / Modalité',
                fields.locationCity || 'Salle de Conférence UGP & Hybride'
              ],
              [
                'Constatation du Quorum',
                'Le quorum réglementaire étant atteint, la séance est déclarée ouverte.',
                'État d’Avancement Audité',
                `${progressPct}% réalisé (${completedTasks}/${totalTasks} tâches) · Chemin critique : ${maxProjectDuration}j`
              ]
            ]
          }
        },
        {
          heading: '2. FEUILLE DE PRÉSENCE OFFICIELLE (PARTICIPANTS, EXCUSÉS & ABSENTS — CONNECTÉE MATRICE M4 & RACI)',
          table: {
            headers: [
              'N° (7%)',
              'Nom & Prénoms / Entité (23%)',
              'Institution / Structure (20%)',
              'Fonction / Rôle Projet (20%)',
              'Email / Téléphone / Canal (16%)',
              'Statut & Émargement (14%)'
            ],
            columnWidths: [7, 23, 20, 20, 16, 14],
            rows: attendanceRows
          }
        },
        {
          heading: '3. ORDRE DU JOUR APPROUVÉ EN OUVERTURE DE SÉANCE',
          paragraphs: [fields.contextJustification]
        },
        {
          heading: '4. DÉROULEMENT DES TRAVAUX, SYNTHÈSE DES DÉBATS ET ARBITRAGES PAR POINT DE L’ODJ',
          paragraphs: [
            `4.1 Synthèse Factuelle des Présentations et Débats :\n${fields.specificObjectives}`,
            `4.2 Résolutions Fermes et Arbitrages Validés en Séance :\n${fields.methodologyApproach}`
          ]
        }
      ]
    };

    const page2PvReunion: StructuredA4Page = {
      pageTitle: `PROCÈS-VERBAL OFFICIEL DE RÉUNION (PAGE 2/2) — MATRICE DES DÉCISIONS (M10/M7) & SIGNATURES`,
      pageSubtitle: `Sections 5, 6 & 7 · Plan d’Actions Immédiat, Risques Arbitrés, Prochaine Séance & Approbation Officielle`,
      isSignaturePage: true,
      orgStampDataUrl: fields.orgStampDataUrl,
      partnerStampDataUrl: fields.partnerStampDataUrl,
      sections: [
        {
          heading: '5. MATRICE DE SUIVI DES DÉCISIONS ET PLAN D’ACTIONS IMMÉDIAT (CONNECTÉE MATRICE M10)',
          paragraphs: fields.confidentialityClauses ? [fields.confidentialityClauses] : undefined,
          table: {
            headers: [
              'N° Action (10%)',
              'Décision / Action à Entreprendre (28%)',
              'Responsable Désigné (18%)',
              'Échéance Stricte (14%)',
              'Livrable / Preuve Attendue (18%)',
              'Priorité & Statut (12%)'
            ],
            columnWidths: [10, 28, 18, 14, 18, 12],
            rows: pvActionRows
          }
        },
        {
          heading: '5 BIS. POINT DE VIGILANCE SUR LES RISQUES & PROBLÈMES SOUMIS À ARBITRAGE (MATRICE M7 RAID)',
          table: {
            headers: m7Table.headers,
            columnWidths: m7Table.columnWidths,
            rightAlignCols: m7Table.rightAlignCols,
            rows: (m7Table.rows || []).slice(0, 4)
          }
        },
        {
          heading: '6. PROCHAINE SÉANCE & CLÔTURE OFFICIELLE DES TRAVAUX',
          paragraphs: [fields.recommendationsLessons]
        },
        {
          heading: '7. BLOC DE VALIDATION ET SIGNATURES OFFICIELLES',
          table: {
            headers: [
              `LE SECRÉTAIRE DE SÉANCE / RAPPORTEUR (${organisationCommanditaire})`,
              `LE PRÉSIDENT DE SÉANCE — POUR APPROBATION (${fields.recipientOrg})`
            ],
            columnWidths: [50, 50],
            rows: [
              [
                `Nom & Prénoms : ${leadActorName}\nFonction : ${leadActorRole}\nDate : ${dateStr}\nMention : « Certifié conforme aux délibérations »`,
                `Autorité (RACI-A) : ${raciCtx.primaryA}\nEntité : ${fields.recipientOrg}\nDate : ${dateStr}\nMention : « Lu et approuvé en séance »`
              ]
            ]
          }
        }
      ]
    };

    return [page1PvReunion, page2PvReunion];
  }

  // ----------------------------------------------------------------------------
  // DOCUMENT 15 : TERMES DE RÉFÉRENCE (TDR) SIMPLIFIÉS AVEC TABLEAUX (2 PAGES - SANS PAGE DE GARDE)
  // ----------------------------------------------------------------------------
  if (docType === 'tdr_simplifie') {
    const m2Rows = activeMatrices.M2 || [];
    const m3Rows = activeMatrices.M3 || [];
    const m5Rows = activeMatrices.M5 || [];
    const m9Rows = activeMatrices.M9 || [];

    // Section 4 : Matrice des Tâches, Méthodologie et Livrables Attendus (5 colonnes depuis M2 & M9)
    const tdrTasksLivrablesRows: string[][] = m2Rows.slice(0, 8).map((r, idx) => {
      const matchingLiv = m9Rows[idx] || m9Rows[0] || {};
      return [
        r.Phase_Lot || `Phase ${(idx % 5) + 1}`,
        `${r.Code_WBS} — ${r.Intitule_Tache_Activite}`,
        matchingLiv.Intitule_Livrable_Actif ||
          `${r.Jalon_Associe || 'Livrable opérationnel'} (${matchingLiv.Description_Format_Attendu || 'Rapport PDF + Données'})`,
        `${r.Duree_Jours || '15'}j (Éch. : ${r.Date_Fin_Prevue || todayISO})`,
        matchingLiv.Instance_Approbation || raciCtx.primaryA
      ];
    });

    // Section 6 : Tableau d'Échéancier, Jours-Hommes et Modalités de Paiement (5 colonnes depuis M9)
    const tdrPaymentScheduleRows: string[][] = m9Rows.slice(0, 6).map((r, idx) => {
      const hj = m3Rows[idx]?.Charge_Homme_Jours || String(Math.max(5, Math.round(maxProjectDuration / Math.max(1, m9Rows.length))));
      return [
        r.Code_Livrable || `L${idx + 1}`,
        `${r.Intitule_Livrable_Actif}\n(${r.Description_Format_Attendu || 'Format A4 PDF & Numérique'})`,
        `${hj} H/J`,
        r['Tranche_Paiement_Associee_%'] || (idx === 0 ? '20%' : idx === 1 ? '40%' : '40%'),
        `${r.Criteres_Qualite_Acceptation || 'Validation sans réserve'}\n(${r.Instance_Approbation || raciCtx.primaryA})`
      ];
    });

    // Section 7 : Budget Prévisionnel de l'Activité (5 colonnes condensées depuis M5)
    const tdrCondensedBudgetRows: string[][] = m5Rows.slice(0, 6).map(r => [
      `${r.Code_Ligne_Budget} — ${r.Rubrique_Activite_PTBA}`,
      r.Unite || 'Forfait',
      r.Quantite || '1',
      formatDocAmount(Number(r.Cout_Unitaire) || Number(r.Budget_Initial_BAC) || 0, currency, lang),
      formatDocAmount(Number(r.Budget_Initial_BAC) || 0, currency, lang)
    ]);
    tdrCondensedBudgetRows.push([
      'TOTAL BUDGET PRÉVISIONNEL DE L’ACTIVITÉ (HT / TTC)',
      'Global',
      '100%',
      '—',
      budgetGlobalFormatted
    ]);

    const page1TdrSimplifie: StructuredA4Page = {
      pageTitle: `TERMES DE RÉFÉRENCE SIMPLIFIÉS (OPÉRATIONNELS) — ${fields.referenceCode}`,
      pageSubtitle: `Catégorie D (Page 1/2 · Sans Page de Garde) · Fiche Synoptique, Contexte, Objectifs & Matrice des Tâches/Livrables (M2/M9)`,
      sections: [
        {
          heading: 'BANDEAU D’EN-TÊTE OPÉRATIONNEL DES TDR SIMPLIFIÉS',
          operationalHeaderBanner: {
            variant: 'tdr_simplifie',
            leftLogoLabel: organisationCommanditaire,
            rightLogoLabel: bailleurDeFonds,
            leftLogoDataUrl: fields.leftLogoDataUrl,
            rightLogoDataUrl: fields.rightLogoDataUrl,
            centerDocTitle: `TERMES DE RÉFÉRENCE SIMPLIFIÉS (OPÉRATIONNELS)`,
            centerSubTitle: `Portefeuille : « ${nomDuProjet} » · Code Activité PTBA : ${fields.referenceCode}`,
            referenceAndDateLine: `Lieu : ${zoneGeographique} · Durée critique : ${maxProjectDuration}j · Enveloppe : ${budgetGlobalFormatted}`
          }
        },
        {
          heading: '1. FICHE SYNOPTIQUE DE L’ACTIVITÉ (TABLEAU D’IDENTIFICATION OPÉRATIONNELLE)',
          table: {
            headers: [
              'Projet & Bailleur de Fonds (22%)',
              'Code & Ligne PTBA (18%)',
              'Lieu & Période d’Exécution (20%)',
              'Charge (H/J) & Budget Estimé (20%)',
              'Superviseur / Acteur RACI (20%)'
            ],
            columnWidths: [22, 18, 20, 20, 20],
            rightAlignCols: [3],
            rows: [
              [
                `${nomDuProjet}\n(${bailleurDeFonds})`,
                `${fields.referenceCode}\n(${(dossier.axes || []).length} Axe(s) / ${pertSummaries.length} Projet(s))`,
                `${zoneGeographique}\nHorizon ${dossier.horizonPlan}`,
                `${maxProjectDuration} Jours-Hommes\n${budgetGlobalFormatted}`,
                `${leadActorName}\n(${leadActorRole} — ${organisationCommanditaire})`
              ]
            ]
          },
          paragraphs: [fields.recipientRepresentative]
        },
        {
          heading: '2. CONTEXTE ET JUSTIFICATION OPÉRATIONNELLE (SYNTHÈSE CIBLÉE)',
          paragraphs: [fields.contextJustification]
        },
        {
          heading: '3. OBJECTIFS DE LA PRESTATION / ACTIVITÉ (3.1 OBJECTIF GLOBAL & 3.2 OBJECTIFS SPÉCIFIQUES)',
          paragraphs: [
            fields.specificObjectives,
            `Méthodologie d’intervention exigée : ${fields.methodologyApproach}`
          ]
        },
        {
          heading: '4. MATRICE DES TÂCHES, MÉTHODOLOGIE ET LIVRABLES ATTENDUS (CONNECTÉE MATRICES M2 & M9)',
          table: {
            headers: [
              'Phase / Étape (14%)',
              'Tâches Opérationnelles à Réaliser (28%)',
              'Livrables Attendus & Format (24%)',
              'Délai / Échéance (16%)',
              'Instance de Validation (18%)'
            ],
            columnWidths: [14, 28, 24, 16, 18],
            rows: tdrTasksLivrablesRows
          }
        }
      ]
    };

    const page2TdrSimplifie: StructuredA4Page = {
      pageTitle: `TERMES DE RÉFÉRENCE SIMPLIFIÉS (PAGE 2/2) — PROFIL (M3), ÉCHÉANCIER DE PAIEMENT (M9) & BUDGET (M5)`,
      pageSubtitle: `Sections 5, 6 & 7 · Qualifications & Grille 100 pts, Modalités de Paiement par Livrable & Budget Prévisionnel`,
      isSignaturePage: true,
      orgStampDataUrl: fields.orgStampDataUrl,
      partnerStampDataUrl: fields.partnerStampDataUrl,
      sections: [
        {
          heading: '5. PROFIL REQUIS (MATRICE M3) ET GRILLE D’ÉVALUATION RAPIDE SUR 100 POINTS',
          paragraphs: [fields.governanceModalities],
          table: {
            headers: [
              'CodeCritère (16%)',
              'Critère d’Évaluation Technique des Candidatures / Offres (64%)',
              'Barème / Note Max (20%)'
            ],
            columnWidths: [16, 64, 20],
            rightAlignCols: [2],
            rows: [
              [
                'CRIT-01',
                'Qualifications académiques (Bac+5 minimum : Ingénierie, Gestion de Projet, Économie, S&E) et certifications internationales (PMP®, ISO 21500, GAR)',
                '20 points'
              ],
              [
                'CRIT-02',
                'Expérience générale et spécifique avérée sur des missions similaires financées par les bailleurs internationaux (BM, BAD, UE, PNUD)',
                '50 points'
              ],
              [
                'CRIT-03',
                'Qualité de la note méthodologique opérationnelle, maîtrise du chemin critique PERT/CPM et adéquation du chronogramme',
                '30 points'
              ],
              [
                'TOTAL TECHNIQUE',
                'NOTE GLOBALE SUR 100 POINTS (Score technique minimal de qualification requis : 75 / 100 points)',
                '100 points'
              ]
            ]
          }
        },
        {
          heading: '6. TABLEAU D’ÉCHÉANCIER, JOURS-HOMMES ET MODALITÉS DE PAIEMENT (CONNECTÉ MATRICE M9)',
          paragraphs: [fields.confidentialityClauses],
          table: {
            headers: [
              'Code Livrable (12%)',
              'Désignation du Livrable Contractuel (30%)',
              'Effort Estimé (14%)',
              '% de Paiement (14%)',
              'Condition de Déblocage & Validation (30%)'
            ],
            columnWidths: [12, 30, 14, 14, 30],
            rightAlignCols: [2, 3],
            rows: tdrPaymentScheduleRows
          }
        },
        {
          heading: '7. BUDGET PRÉVISIONNEL DE L’ACTIVITÉ (MATRICE M5) & DOSSIER DE SOUMISSION RAPIDE',
          table: {
            headers: [
              'Rubrique Budgétaire PTBA (Honoraires, Logistique, Livrables) (32%)',
              'Unité (12%)',
              'Quantité (12%)',
              `Coût Unitaire (22%)`,
              `Montant Total (${currency}) (22%)`
            ],
            columnWidths: [32, 12, 12, 22, 22],
            rightAlignCols: [2, 3, 4],
            rows: tdrCondensedBudgetRows
          },
          paragraphs: [fields.recommendationsLessons]
        }
      ]
    };

    return [page1TdrSimplifie, page2TdrSimplifie];
  }

  // ============================================================================
  // BLOCS COMMUNS RÉUTILISABLES (CHARTE DE GARDE, CADRE LOGIQUE 4x4, BOARD RAID)
  // ============================================================================
  const coverChartBlock: CoverChartData = {
    leftLogo: bailleurDeFonds,
    leftDepartment: directionBailleur,
    rightLogo: organisationCommanditaire,
    rightDepartment: directionPilote,
    bannerTitle: nomDuProjet.toUpperCase(),
    bannerSubtitle: `${zoneGeographique} · ${dureeOuPeriode}`,
    docTitle: cfg.officialTitle,
    docSubtitle: `${cfg.subtitle}\nRéf. ${fields.referenceCode} · Portée : ${dossier.type.toUpperCase()}`,
    bottomLeftStructure: `${[organisationCommanditaire, directionPilote].filter(Boolean).join(' — ')}\nPilotage : ${leadActorName} (${leadActorRole})`,
    bottomLeftZone: zoneGeographique,
    bottomRightDateVersion: `Émis le ${dateStr} · Version 1.0 Consolidée`,
    bottomRightStatus: `Statut : Officiel · Normes : ${cfg.normativeReference}`,
    leftLogoDataUrl: fields.leftLogoDataUrl,
    rightLogoDataUrl: fields.rightLogoDataUrl,
    bannerImageDataUrl: fields.bannerImageDataUrl
  };

  const ficheSignaletiqueKeyValues: Array<[string, string]> = [
    ['1. Intitulé Officiel du Projet / Portefeuille', nomDuProjet],
    ['2. Référence & Protocole Documentaire', `${fields.referenceCode || 'REF-FAAB-2026'} — Catégorie ${cfg.category}`],
    ['3. Structure Pilote & Responsable RACI / PMO', `${organisationCommanditaire} (${leadActorName} — ${leadActorRole})`],
    ['4. Bailleur(s) de Fonds & Autorité (RACI-A)', `${bailleurDeFonds} (${fields.recipientRepresentative || raciCtx.primaryA})`],
    ['5. Zone Géographique & Période Couverte', `${zoneGeographique} · ${dureeOuPeriode}`],
    ['6. Enveloppe Budgétaire Globale Consolidée', `${budgetGlobalFormatted} (Engagé à date : ${committedBudgetFormatted} soit ${financialExecutionPct}%)`],
    ['7. État d’Avancement Opérationnel (Suivi des Tâches)', `${progressPct}% achevé (${completedTasks}/${totalTasks} terminées, ${inProgressTasks} en cours, ${blockedTasks} bloquées, ${delayedTasksCount} en écart)`],
    ['8. Chemin Critique PERT/CPM & Référentiel Normatif', `Durée minimale : ${maxProjectDuration}j (${criticalSequence}) · ${cfg.normativeReference}`]
  ];

  const logframeTable: StructuredA4Table = m1Table;
  const raidTable: StructuredA4Table = m7Table;

  // ============================================================================
  // CATÉGORIE B : DOCUMENTS COURTS DE 2 À 5 PAGES (SANS PAGES LOURDES DE LISTES)
  // ============================================================================

  // ----------------------------------------------------------------------------
  // DOC 4 : LETTRE DE MISSION / ORDRE DE MISSION (CATÉGORIE B — 2 PAGES)
  // ----------------------------------------------------------------------------
  if (docType === 'lettre_mission') {
    return [
      {
        pageTitle: `PAGE 1 — LETTRE DE MISSION & MANDAT OPÉRATIONNEL`,
        pageSubtitle: `Protocole Catégorie B (Page 1/2) · En-tête Exécutif, Fiche Signalétique du Mandat & Objectifs Assignés`,
        sections: [
          {
            heading: 'CHARTE EXÉCUTIVE D’INVESTITURE & IDENTIFICATION DU MANDAT',
            coverChart: coverChartBlock,
            keyValueRows: ficheSignaletiqueKeyValues
          },
          {
            heading: '1. CONTEXTE INSTITUTIONNEL, OBJET DU MANDAT ET INVESTITURE OFFICIELLE',
            paragraphs: [
              `1.1 Cadre d’Investiture : ${fields.contextJustification}`,
              `1.2 Portée Opérationnelle du Mandat : Par la présente Lettre de Mission (Réf. ${fields.referenceCode}), ${organisationCommanditaire} confie à ${fields.recipientRepresentative || userProfile.fullName} la responsabilité opérationnelle de coordonner, superviser et livrer les activités du portefeuille « ${nomDuProjet} » sur l’horizon ${dossier.horizonPlan}, dans le strict respect des normes ${cfg.normativeReference}.`
            ]
          },
          {
            heading: '2. OBJECTIFS ASSIGNÉS, RÉSULTATS ATTENDUS ET CIBLES DE PERFORMANCE',
            paragraphs: [fields.specificObjectives],
            table: {
              headers: [
                'Domaine de Performance (20%)',
                'Indicateur de Mandat SMART (32%)',
                'Cible Contractuelle Assignée (28%)',
                'Situation Actuelle (20%)'
              ],
              columnWidths: [20, 32, 28, 20],
              rows: [
                [
                  'Exécution Physique WBS',
                  'Taux de réalisation des activités et jalons programmés',
                  `100% des ${totalTasks} activités validées`,
                  `${progressPct}% (${completedTasks}/${totalTasks} terminées)`
                ],
                [
                  'Maîtrise du Chemin Critique',
                  'Respect de la durée critique incompressible PERT/CPM',
                  `<= ${maxProjectDuration} jours ouvrés (0 glissement)`,
                  `Séquence : ${criticalSequence}`
                ],
                [
                  'Performance Budgétaire',
                  'Exécution conforme au PTBA sans dépassement non autorisé',
                  `Plafond : ${budgetGlobalFormatted}`,
                  `Engagé : ${committedBudgetFormatted} (${financialExecutionPct}%)`
                ],
                [
                  'Qualité & Redevabilité',
                  'Taux de livrables approuvés par l’Autorité (A) RACI',
                  '100% des PV de réception signés',
                  `${blockedTasks} blocage(s) · ${delayedTasksCount} écart(s)`
                ]
              ]
            }
          }
        ]
      },
      {
        pageTitle: `PAGE 2 — MOYENS ALLOUÉS, GOUVERNANCE RACI, FEUILLE DE ROUTE & SIGNATURES`,
        pageSubtitle: `Protocole Catégorie B (Page 2/2) · Délégation de Moyens, Ordonnancement Critique & Approbation Conjointe`,
        isSignaturePage: true,
        orgStampDataUrl: fields.orgStampDataUrl,
        partnerStampDataUrl: fields.partnerStampDataUrl,
        sections: [
          {
            heading: '3. PRÉROGATIVES, MOYENS ALLOUÉS ET ENVELOPPE BUDGÉTAIRE SOUS DÉLÉGATION (MATRICE M5)',
            paragraphs: [
              `3.1 Autorité Fonctionnelle et Moyens : ${fields.methodologyApproach}`,
              `3.2 Modalités de Reporting et Gouvernance : ${fields.governanceModalities}`,
              `3.3 Déontologie et Obligation de Réserve : ${fields.confidentialityClauses}`
            ],
            table: m5Table
          },
          {
            heading: '4. FEUILLE DE ROUTE WBS (M2), MATRICE RACI (M3) & LIVRABLES ATTENDUS (M9)',
            paragraphs: [`4.1 Instructions Prioritaires : ${fields.recommendationsLessons}`],
            table: m3Table
          },
          {
            heading: '5. CALENDRIER DES LIVRABLES CONTRACTUELS SOUS MANDAT (MATRICE M9)',
            table: m9Table
          }
        ]
      }
    ];
  }

  // ----------------------------------------------------------------------------
  // DOC 10 : ACCORD DE CONFIDENTIALITÉ & NON-DIVULGATION - NDA (CATÉGORIE B — 3 PAGES)
  // ----------------------------------------------------------------------------
  if (docType === 'nda') {
    return [
      {
        pageTitle: `PAGE 1 — ACCORD DE CONFIDENTIALITÉ & NON-DIVULGATION (NDA)`,
        pageSubtitle: `Protocole Catégorie B (Page 1/3) · Identification Juridique des Parties, Fiche Signalétique & Préambule`,
        sections: [
          {
            heading: 'CHARTE OFFICIELLE & IDENTIFICATION DES PARTIES CONTRACTANTES',
            coverChart: coverChartBlock,
            keyValueRows: ficheSignaletiqueKeyValues
          },
          {
            heading: 'PRÉAMBULE & ARTICLE 1 — OBJET DE L’ACCORD ET PÉRIMÈTRE DU PORTEFEUILLE PROTÉGÉ',
            paragraphs: [
              `ENTRE LES SOUSSIGNÉS : D’une part, « ${organisationCommanditaire} », représentée par ${userProfile.fullName} (${userProfile.role}), ci-après dénommée « La Partie Divulgatrice » ; ET d’autre part, « ${bailleurDeFonds} », représentée par ${fields.recipientRepresentative || 'son Représentant Légal'}, ci-après dénommée « La Partie Réceptrice ».`,
              `Article 1.1 — Objet de l’Accord : ${fields.contextJustification}`,
              `Article 1.2 — Périmètre des Données Protégées : ${fields.specificObjectives}`
            ]
          }
        ]
      },
      {
        pageTitle: `PAGE 2 — INVENTAIRE DES ACTIFS PROTÉGÉS, SÉCURITÉ ISO 27001 & OBLIGATIONS`,
        pageSubtitle: `Protocole Catégorie B (Page 2/3) · Articles 2, 3 & 4 · Données Financières, Livrables & Engagements de Non-Divulgation`,
        sections: [
          {
            heading: 'ARTICLE 2 — INVENTAIRE DES LIVRABLES ET ACTIFS DOCUMENTAIRES COUVERTS PAR LE SECRET (MATRICE M9)',
            table: m9Table
          },
          {
            heading: 'ARTICLE 3 — MESURES DE SÉCURITÉ LOGIQUE, CHIFFREMENT & TRAÇABILITÉ (ISO/IEC 27001)',
            paragraphs: [
              `Article 3.1 — Protocole de Sécurité : ${fields.methodologyApproach}`,
              `Article 4.1 — Obligations Strictes de Non-Divulgation & Durée Légale : ${fields.confidentialityClauses}`
            ],
            bullets: [
              'Interdiction absolue de copie, diffusion, publication ou transmission des fichiers JSON, bases IndexedDB, états financiers et rapports PDF à des tiers non habilités.',
              'Obligation de chiffrement des supports numériques et de restriction des accès aux seuls acteurs inscrits dans la matrice RACI officielle.',
              'Maintien de l’obligation de confidentialité pendant toute la durée du programme et durant cinq (5) années après sa clôture définitive.'
            ]
          }
        ]
      },
      {
        pageTitle: `PAGE 3 — JURIDICTION, HABILITATIONS RACI (M3), PARTIES PRENANTES (M4), RISQUES (M7) & SIGNATURES`,
        pageSubtitle: `Protocole Catégorie B (Page 3/3) · Articles 5 & 6 · Registre des Personnes Habilitées & Engagements Signés`,
        isSignaturePage: true,
        orgStampDataUrl: fields.orgStampDataUrl,
        partnerStampDataUrl: fields.partnerStampDataUrl,
        sections: [
          {
            heading: 'ARTICLE 5 — REGISTRE DES HABILITATIONS D’ACCÈS SELON LA MATRICE RACI (MATRICE M3)',
            table: m3Table
          },
          {
            heading: 'ARTICLE 5 BIS — PARTIES PRENANTES ACCRÉDITÉES (M4) & RISQUES DE SÉCURITÉ (M7)',
            table: m4Table
          },
          {
            heading: 'ARTICLE 6 — JURIDICTION COMPÉTENTE, CONTRÔLE ET RESTITUTION / DESTRUCTION DES SUPPORTS',
            paragraphs: [
              `Article 6.1 — Règlement des Différends et Juridiction : ${fields.governanceModalities}`,
              `Article 6.2 — Clôture des Accès et Destruction des Copies : ${fields.recommendationsLessons}`
            ],
            table: m7Table
          }
        ]
      }
    ];
  }

  // ----------------------------------------------------------------------------
  // DOC 2 : TERMES DE RÉFÉRENCE OFFICIELS - TDR (CATÉGORIE B — 5 PAGES)
  // ----------------------------------------------------------------------------
  if (docType === 'tdr') {
    return [
      {
        pageTitle: `PAGE 1 — TERMES DE RÉFÉRENCE OFFICIELS (TDR)`,
        pageSubtitle: `Protocole Catégorie B (Page 1/5) · Page de Garde Condensée & Fiche Signalétique Intégrée`,
        sections: [
          {
            heading: 'CHARTE OFFICIELLE DE PAGE DE GARDE (TERMES DE RÉFÉRENCE — STANDARD PNUD / BM / UE)',
            coverChart: coverChartBlock
          },
          {
            heading: 'FICHE SIGNALÉTIQUE INTÉGRÉE DE LA MISSION (SYNTHÈSE CONTRACTUELLE)',
            keyValueRows: ficheSignaletiqueKeyValues
          }
        ]
      },
      {
        pageTitle: `PAGE 2 — CONTEXTE STRATÉGIQUE, OBJECTIFS SMART & APPROCHE MÉTHODOLOGIQUE`,
        pageSubtitle: `Protocole Catégorie B (Page 2/5) · Sections 1, 2 & 3 · Justification, Objectifs et Démarche Exigée`,
        sections: [
          {
            heading: '1. CONTEXTE STRATÉGIQUE, JUSTIFICATION DE LA MISSION ET ALIGNEMENT INSTITUTIONNEL',
            paragraphs: [
              `1.1 Contexte Général et Problématique : ${fields.contextJustification}`,
              `1.2 Ancrage Stratégique : La présente prestation s’inscrit dans l’exécution du portefeuille « ${nomDuProjet} » (${dossier.horizonPlan}) porté par ${organisationCommanditaire} en partenariat avec ${bailleurDeFonds}.`
            ],
            ...(fields.figureImageDataUrl
              ? {
                  figureImage: {
                    dataUrl: fields.figureImageDataUrl,
                    caption: `Schéma d’Intervention & Architecture du Portefeuille — ${nomDuProjet}`
                  }
                }
              : {})
          },
          {
            heading: '2. OBJECTIFS DE LA MISSION (OBJECTIF GÉNÉRAL, OBJECTIFS SPÉCIFIQUES SMART & EXTRANTS)',
            paragraphs: [fields.specificObjectives],
            bullets: (dossier.axes || []).map((axe, idx) => {
              const pCount = (axe.projects || []).length;
              const tCount = (axe.projects || []).reduce((acc, p) => acc + (p.tasks || []).length, 0);
              const aBud = (axe.projects || []).reduce(
                (acc, p) => acc + (p.tasks || []).reduce((s, t) => s + (Number(t.budget) || 0), 0),
                0
              );
              return `Axe Stratégique ${idx + 1} (${axe.name}) : ${pCount} projet(s), ${tCount} activité(s)/jalon(s), dotation de ${formatDocAmount(aBud, currency, lang)}.`;
            })
          },
          {
            heading: '3. PÉRIMÈTRE D’INTERVENTION ET APPROCHE MÉTHODOLOGIQUE EXIGÉE',
            paragraphs: [
              `3.1 Démarche Méthodologique Normée : ${fields.methodologyApproach}`,
              `3.2 Structuration en 5 Phases : Le prestataire articule son intervention autour des 5 phases normées ISO 21500 (Avant-Projet, Conception, Planification, Exécution & Suivi, Clôture) en maintenant l’intégrité du réseau PERT/CPM (${maxProjectDuration} jours ouvrés sur le chemin critique : ${criticalSequence}).`
            ]
          }
        ]
      },
      {
        pageTitle: `PAGE 3 — LIVRABLES ATTENDUS, MODALITÉS DE PAIEMENT & PROFILS D’EXPERTS`,
        pageSubtitle: `Protocole Catégorie B (Page 3/5) · Sections 4 & 5 · Calendrier des Livrables et Compétences Clés`,
        sections: [
          {
            heading: '4. TABLEAU DES LIVRABLES ATTENDUS, ASSURANCE QUALITÉ ET CONDITIONNALITÉS DE PAIEMENT (MATRICE M9)',
            table: m9Table
          },
          {
            heading: '5. PROFIL DE L’ÉQUIPE CLÉ EXIGÉE, CHARGE H/J ET MATRICE RACI (MATRICE M3)',
            table: m3Table
          }
        ]
      },
      {
        pageTitle: `PAGE 4 — PLANIFICATION OPÉRATIONNELLE WBS/PERT (M2) & BUDGET ANALYTIQUE EVM (M5)`,
        pageSubtitle: `Protocole Catégorie B (Page 4/5) · Sections 6 & 7 · Chronogramme WBS/PTBA et Allocation Budgétaire`,
        sections: [
          {
            heading: '6. PLANIFICATION OPÉRATIONNELLE WBS, CHRONOGRAMME GANTT & CHEMIN CRITIQUE PERT (MATRICE M2)',
            paragraphs: [`6.1 Gouvernance & Circuit d’Approbation : ${fields.governanceModalities}`],
            table: m2Table
          },
          {
            heading: '7. BUDGET ANALYTIQUE PTBA, EXÉCUTION FINANCIÈRE & VALEUR ACQUISE (MATRICE M5)',
            table: m5Table
          }
        ]
      },
      {
        pageTitle: `PAGE 5 — GRILLE D’ÉVALUATION DES OFFRES, DÉONTOLOGIE & APPROBATION`,
        pageSubtitle: `Protocole Catégorie B (Page 5/5) · Section 8 · Barème Technique/Financier (70/30), Risques RAID & Signatures`,
        isSignaturePage: true,
        orgStampDataUrl: fields.orgStampDataUrl,
        partnerStampDataUrl: fields.partnerStampDataUrl,
        sections: [
          {
            heading: '8. GRILLE D’ÉVALUATION DES OFFRES (PONDÉRATION TECHNIQUE 70% / FINANCIÈRE 30%)',
            paragraphs: [
              `8.1 Critères de Sélection : ${fields.recommendationsLessons}`,
              `8.2 Clauses Déontologiques et Propriété Intellectuelle : ${fields.confidentialityClauses}`
            ],
            table: {
              headers: [
                'Rubrique d’Évaluation (24%)',
                'Critères Détaillés d’Appréciation Technique & Financière (58%)',
                'Note Maximale (18%)'
              ],
              columnWidths: [24, 58, 18],
              rightAlignCols: [2],
              rows: [
                ['1. Compréhension des TDR', 'Qualité de l’analyse critique du contexte, pertinence des objectifs et maîtrise des enjeux du dossier.', '15 points'],
                ['2. Qualité de la Méthodologie', 'Robustesse de l’approche GAR, maîtrise de l’ordonnancement PERT/CPM, du Kanban et des outils S&E.', '30 points'],
                ['3. Qualification de l’Équipe Clé', 'Adéquation des diplômes, certifications PMP/ISO 21500 et références similaires du Chef de mission et des experts.', '35 points'],
                ['4. Organisation & Chronogramme', 'Réalisme du calendrier Gantt/PERT, respect du chemin critique et clarté de la matrice RACI.', '20 points'],
                ['TOTAL SCORE TECHNIQUE (Seuil : 70/100)', 'Pondération Technique = 70% · Pondération Financière (Moins-disant conforme) = 30%', '100 points']
              ]
            }
          },
          {
            heading: '9. MATRICE DES RISQUES DE LA MISSION (BOARD RAID SYNTHÉTIQUE)',
            table: raidTable
          }
        ]
      }
    ];
  }

  // ----------------------------------------------------------------------------
  // DOC 3 : NOTE MÉTHODOLOGIQUE & PROTOCOLE S&E (CATÉGORIE B — 5 PAGES)
  // ----------------------------------------------------------------------------
  if (docType === 'note_methodo') {
    return [
      {
        pageTitle: `PAGE 1 — NOTE MÉTHODOLOGIQUE & PROTOCOLE DE SUIVI-ÉVALUATION (S&E)`,
        pageSubtitle: `Protocole Catégorie B (Page 1/5) · Page de Garde Condensée & Fiche Signalétique Intégrée`,
        sections: [
          {
            heading: 'CHARTE OFFICIELLE DE LA NOTE MÉTHODOLOGIQUE (INGÉNIERIE GAR / PERT-CPM / ISO 21500)',
            coverChart: coverChartBlock
          },
          {
            heading: 'FICHE SIGNALÉTIQUE DU DISPOSITIF MÉTHODOLOGIQUE',
            keyValueRows: ficheSignaletiqueKeyValues
          }
        ]
      },
      {
        pageTitle: `PAGE 2 — SOMMAIRE CONDENSÉ, RÉSUMÉ EXÉCUTIF & COMPRÉHENSION DU MANDAT`,
        pageSubtitle: `Protocole Catégorie B (Page 2/5) · Synthèse de l’Approche et Relecture Critique des Enjeux`,
        sections: [
          {
            heading: 'SOMMAIRE EXÉCUTIF DE LA NOTE MÉTHODOLOGIQUE',
            table: {
              headers: ['Section (14%)', 'Intitulé de la Rubrique Méthodologique (54%)', 'Normes & Outils Mobilisés (20%)', 'Page (12%)'],
              columnWidths: [14, 54, 20, 12],
              rows: [
                ['Section 1', 'Compréhension Critique du Contexte, des Enjeux et de la Demande', 'GAR / Théorie du Changement', 'Page 2'],
                ['Section 2', 'Architecture Méthodologique en 5 Phases & Algorithme PERT/CPM', 'ISO 21500 / PMBOK 7 / CPM', 'Page 3'],
                ['Section 3', 'Dispositif de Collecte, Indicateurs SMART & Suivi Financier', 'UNEG / PTBA / Valeur Acquise', 'Page 4'],
                ['Section 4', 'Organisation du Travail, Gouvernance RACI & Chronogramme', 'Matrice RACI & Kanban', 'Page 4'],
                ['Section 5', 'Assurance Qualité des Données, Limites, Biais & Risques RAID', 'GEROS / Contrôle Interne', 'Page 5']
              ]
            }
          },
          {
            heading: '1. COMPRÉHENSION CRITIQUE DU CONTEXTE, DES ENJEUX ET DES OBJECTIFS MÉTHODOLOGIQUES',
            paragraphs: [
              `1.1 Justification du Dispositif : ${fields.contextJustification}`,
              `1.2 Objectifs de Fiabilisation et de Pilotage : ${fields.specificObjectives}`
            ],
            ...(fields.figureImageDataUrl
              ? {
                  figureImage: {
                    dataUrl: fields.figureImageDataUrl,
                    caption: `Architecture Conceptuelle du Dispositif S&E — ${nomDuProjet}`
                  }
                }
              : {})
          }
        ]
      },
      {
        pageTitle: `PAGE 3 — DÉMARCHE EN 5 PHASES NORMÉES & MODÉLISATION DU RÉSEAU PERT/CPM`,
        pageSubtitle: `Protocole Catégorie B (Page 3/5) · Section 2 · Ingénierie d’Ordonnancement et Calcul du Chemin Critique`,
        sections: [
          {
            heading: '2. ARCHITECTURE MÉTHODOLOGIQUE EN 5 PHASES ET PLANIFICATION WBS / PERT (MATRICE M2)',
            paragraphs: [
              `2.1 Démarche Opérationnelle : ${fields.methodologyApproach}`,
              `2.2 Formules d’Ordonnancement PERT/CPM : Le moteur faab gar calcule pour chaque nœud ses dates au plus tôt (ES, EF = ES + Durée) par passe avant, et ses dates au plus tard (LF, LS = LF - Durée) par passe arrière. La Marge Totale (MT = LS - ES) identifie le Chemin Critique (${criticalSequence}) de ${maxProjectDuration} jours ouvrés.`
            ],
            table: m2Table
          }
        ]
      },
      {
        pageTitle: `PAGE 4 — GRILLE D’ÉVALUATION OCDE/CAD (M6) & GOUVERNANCE RACI / RH (M3)`,
        pageSubtitle: `Protocole Catégorie B (Page 4/5) · Sections 3 & 4 · Référentiel Évaluatif OCDE et Attribution des Rôles`,
        sections: [
          {
            heading: '3. MATRICE DES QUESTIONS ÉVALUATIVES ET CRITÈRES OCDE/CAD (MATRICE M6)',
            table: m6Table
          },
          {
            heading: '4. ORGANISATION DU TRAVAIL, CHARGE D’EXPERTS ET MATRICE RACI (MATRICE M3)',
            paragraphs: [`4.1 Gouvernance des Données et Rituels de Validation : ${fields.governanceModalities}`],
            table: m3Table
          }
        ]
      },
      {
        pageTitle: `PAGE 5 — ASSURANCE QUALITÉ, GESTION DES BIAIS, RISQUES RAID & SIGNATURES`,
        pageSubtitle: `Protocole Catégorie B (Page 5/5) · Section 5 · Sécurité du Système d’Information S&E et Validation`,
        isSignaturePage: true,
        orgStampDataUrl: fields.orgStampDataUrl,
        partnerStampDataUrl: fields.partnerStampDataUrl,
        sections: [
          {
            heading: '5. DISPOSITIF D’ASSURANCE QUALITÉ, SÉCURITÉ HYBRIDE (INDEXEDDB / JSON) ET LIMITES',
            paragraphs: [
              `5.1 Sécurité et Intégrité Documentaire : ${fields.confidentialityClauses}`,
              `5.2 Recommandations d’Exploitation : ${fields.recommendationsLessons}`
            ],
            table: raidTable
          },
          {
            heading: '6. CADRE LOGIQUE SYNTHÉTIQUE DE RÉFÉRENCE (NORME 4x4)',
            table: logframeTable
          }
        ]
      }
    ];
  }

  // ----------------------------------------------------------------------------
  // DOC 9 : GRILLE / MATRICE D'ÉVALUATION OCDE/CAD & UNEG (CATÉGORIE B — 5 PAGES)
  // ----------------------------------------------------------------------------
  if (docType === 'grille_evaluation') {
    const relevanceScore = 5;
    const coherenceScore = 4;
    const effectivenessScore = progressPct >= 80 ? 5 : progressPct >= 55 ? 4 : progressPct >= 30 ? 3 : 2;
    const efficiencyScore = blockedTasks === 0 ? 4 : blockedTasks <= 2 ? 3 : 2;
    const impactScore = progressPct >= 50 ? 4 : 3;
    const sustainabilityScore = 4;
    const weightedAvg = (
      relevanceScore * 0.15 +
      coherenceScore * 0.10 +
      effectivenessScore * 0.25 +
      efficiencyScore * 0.20 +
      impactScore * 0.15 +
      sustainabilityScore * 0.15
    ).toFixed(2);

    const oecdMatrixRows: string[][] = [
      [
        '1. PERTINENCE\n(Relevance · 15%)',
        'Q1.1 : Dans quelle mesure les objectifs de l’intervention répondent-ils aux besoins prioritaires des bénéficiaires et aux stratégies nationales/ODD ?',
        '• Degré d’alignement stratégique ;\n• Taux d’adéquation aux besoins cibles.',
        `Baseline : Diagnostic ${dossier.psdYear}\nCible : 100% des axes alignés.`,
        '• ProDoc & Cadre Logique ;\n• Rapports nationaux & ODD.',
        '• Revue documentaire ;\n• Entretiens clés (KII).'
      ],
      [
        '2. COHÉRENCE\n(Coherence · 10%)',
        'Q2.1 : Quelle est la cohérence interne entre les axes/projets et la cohérence externe avec les interventions des autres partenaires (PTF) ?',
        '• Synergies inter-projets actives ;\n• Absence de chevauchement.',
        `Baseline : ${(dossier.axes || []).length} Axe(s) / ${pertSummaries.length} Projet(s)\nCible : 100% intégré.`,
        '• Matrices WBS et RACI ;\n• PV de coordination PTF.',
        '• Analyse structurelle WBS ;\n• Focus groups techniques.'
      ],
      [
        '3. EFFICACITÉ\n(Effectiveness · 25%)',
        'Q3.1 : Dans quelle mesure les extrants (livrables) et les effets directs attendus ont-ils été atteints dans les délais prévus ?',
        '• Taux de réalisation physique ;\n• % de jalons critiques validés.',
        `Actuel : ${progressPct}% (${completedTasks}/${totalTasks})\nCible finale : >= 95%.`,
        '• Rapports CAP ;\n• Bordereaux de réception.',
        '• Audit physique des livrables ;\n• Analyse des écarts Début/Fin.'
      ],
      [
        '4. EFFICIENCE\n(Efficiency · 20%)',
        'Q4.1 : Les ressources financières, humaines et temporelles ont-elles été converties de manière optimale en résultats (coût-efficacité) ?',
        `• Absorption budgétaire (${currency}) ;\n• Respect du chemin critique (${maxProjectDuration}j).`,
        `Budget : ${budgetGlobalFormatted}\nEngagé : ${financialExecutionPct}% (${committedBudgetFormatted}).`,
        '• Suivi PTBA & états financiers ;\n• Réseau PERT/CPM.',
        '• Analyse Coût-Efficacité ;\n• Audit des marges PERT.'
      ],
      [
        '5. IMPACT\n(Impact · 15%)',
        'Q5.1 : Quels sont les changements durables, positifs ou négatifs, directs ou indirects, générés sur l’écosystème et les bénéficiaires ?',
        '• Indice de transformation ;\n• Bénéficiaires durablement touchés.',
        `Horizon : ${dossier.horizonPlan}\nCible : Impact systémique vérifié.`,
        '• Enquêtes Baseline / Endline ;\n• Études de cas terrain.',
        '• Méthodes mixtes & Outcome Harvesting.'
      ],
      [
        '6. DURABILITÉ\n(Sustainability · 15%)',
        'Q6.1 : Les bénéfices et acquis se maintiendront-ils après la clôture du financement externe (viabilité financière, institutionnelle, technique) ?',
        '• Taux d’appropriation interne ;\n• Mécanisme de pérennisation actif.',
        'Cible : 100% des livrables transférés avec plan de continuité.',
        '• PV de transfert d’acquis ;\n• Manuels et budgets internes.',
        '• Audit institutionnel ;\n• Entretiens avec les bénéficiaires.'
      ]
    ];

    return [
      {
        pageTitle: `PAGE 1 — GRILLE & MATRICE D’ÉVALUATION INSTITUTIONNELLE (OCDE/CAD & UNEG)`,
        pageSubtitle: `Protocole Catégorie B (Page 1/5) · Page de Garde Condensée & Fiche Signalétique de l’Évaluation`,
        sections: [
          {
            heading: 'CHARTE OFFICIELLE DE LA GRILLE D’ÉVALUATION (STANDARDS UNEG / OCDE-CAD / GEROS)',
            coverChart: coverChartBlock
          },
          {
            heading: 'FICHE SIGNALÉTIQUE DE LA MISSION D’ÉVALUATION',
            keyValueRows: ficheSignaletiqueKeyValues
          }
        ]
      },
      {
        pageTitle: `PAGE 2 — MÉTHODOLOGIE DE NOTATION (ÉCHELLE 1 À 5) & RÈGLE DE TRIANGULATION`,
        pageSubtitle: `Protocole Catégorie B (Page 2/5) · Section 1 · Barème Normatif International, Pondération et Preuves`,
        sections: [
          {
            heading: '1. NOTE MÉTHODOLOGIQUE D’UTILISATION DE LA GRILLE ET ÉCHELLE DE NOTATION (1 À 5)',
            paragraphs: [
              `1.1 Objectif et Articulation avec la Théorie du Changement : ${fields.contextJustification}`,
              `1.2 Structuration des Questions Évaluatives : ${fields.specificObjectives}`,
              `1.3 Formule de Calcul du Score Global Pondéré : Score Global = (Pertinence × 15%) + (Cohérence × 10%) + (Efficacité × 25%) + (Efficience × 20%) + (Impact × 15%) + (Durabilité × 15%).`
            ],
            table: {
              headers: [
                'Score (12%)',
                'Qualification Normative (22%)',
                'Critère de Jugement Objectif (Standards UNEG / GEROS / BM) (44%)',
                'Seuil Décisionnel (22%)'
              ],
              columnWidths: [12, 22, 44, 22],
              rows: [
                ['5 / 5', 'Très Satisfaisant (Excellent)', 'Atteint ou dépasse 100% des cibles SMART sans aucune lacune opérationnelle ni dépassement.', 'Capitalisation & Modélisation'],
                ['4 / 5', 'Satisfaisant (Bon)', 'Atteint 80% à 99% des cibles avec des écarts mineurs n’affectant pas le chemin critique PERT.', 'Poursuite & Consolidation'],
                ['3 / 5', 'Moyennement Satisfaisant', 'Atteint 50% à 79% des cibles ; retards ou blocages modérés nécessitant des mesures correctives.', 'Plan de Rattrapage Requis'],
                ['2 / 5', 'Insatisfaisant (Faible)', 'Moins de 50% des cibles ; glissements majeurs sur le chemin critique ou sous-absorption sévère.', 'Réorientation Immédiate COPIL'],
                ['1 / 5', 'Très Insatisfaisant (Critique)', 'Échec opérationnel ou blocage systémique compromettant l’atteinte des effets du programme.', 'Suspension / Restructuration']
              ]
            }
          }
        ]
      },
      {
        pageTitle: `PAGE 3 — MATRICE MAÎTRESSE D’ÉVALUATION CROISANT LES 6 CRITÈRES OCDE/CAD (MATRICE M6)`,
        pageSubtitle: `Protocole Catégorie B (Page 3/5) · Section 2 · Questions Évaluatives, Indicateurs SMART, Triangulation & Scores`,
        sections: [
          {
            heading: '2. MATRICE COMPLÈTE D’ÉVALUATION SELON LES 6 CRITÈRES DU RÉSEAU OCDE/CAD (MATRICE M6)',
            table: m6Table
          }
        ]
      },
      {
        pageTitle: `PAGE 4 — CADRE LOGIQUE DE RÉFÉRENCE (M1) & SYNTHÈSE DES SCORES PONDÉRÉS`,
        pageSubtitle: `Protocole Catégorie B (Page 4/5) · Sections 3 & 4 · Chaîne de Résultats GAR et Notation Globale`,
        sections: [
          {
            heading: '3. GRILLE D’APPRÉCIATION CHIFFRÉE ET SCORE PONDÉRÉ DU PORTEFEUILLE ACTIF',
            paragraphs: [`3.1 Règles de Pondération et Seuils d’Alerte : ${fields.recommendationsLessons}`],
            table: {
              headers: [
                'Critère OCDE/CAD (16%)',
                'Poids (10%)',
                'Score (14%)',
                'Appréciation Normative (20%)',
                'Justification Factuelle & Preuves Issues du Dossier Actif (40%)'
              ],
              columnWidths: [16, 10, 14, 20, 40],
              rows: [
                ['1. Pertinence', '15%', `${relevanceScore} / 5`, 'Très Satisfaisant', `Alignement stratégique complet des ${(dossier.axes || []).length} axe(s) avec les priorités institutionnelles.`],
                ['2. Cohérence', '10%', `${coherenceScore} / 5`, 'Satisfaisant', `Articulation logique vérifiée entre ${pertSummaries.length} projet(s) et dépendances PERT modélisées.`],
                ['3. Efficacité', '25%', `${effectivenessScore} / 5`, effectivenessScore >= 4 ? 'Satisfaisant' : 'Moyennement Satisfaisant', `Taux d’achèvement physique de ${progressPct}% (${completedTasks} terminées, ${inProgressTasks} en cours sur ${totalTasks}).`],
                ['4. Efficience', '20%', `${efficiencyScore} / 5`, efficiencyScore >= 4 ? 'Satisfaisant' : 'Sous Vigilance', `Budget total de ${budgetGlobalFormatted} (${financialExecutionPct}% engagé soit ${committedBudgetFormatted}) ; ${blockedTasks} tâche(s) bloquée(s).`],
                ['5. Impact', '15%', `${impactScore} / 5`, 'Satisfaisant / En cours', `Effets structurants attendus sur l’horizon ${dossier.horizonPlan} (${dossier.horizonYears} ans).`],
                ['6. Durabilité', '15%', `${sustainabilityScore} / 5`, 'Satisfaisant', `Responsabilités RACI formalisées et livrables documentés pour l’appropriation interne.`],
                ['SCORE GLOBAL PONDÉRÉ', '100%', `${weightedAvg} / 5.00`, Number(weightedAvg) >= 4 ? 'PERFORMANCE SATISFAISANTE' : 'SOUS SURVEILLANCE ACTIVE', `Synthèse évaluative consolidée au ${dateStr}.`]
              ]
            }
          },
          {
            heading: '4. CADRE LOGIQUE ET CHAÎNE DE RÉSULTATS AUDITÉE (MATRICE M1)',
            table: m1Table
          }
        ]
      },
      {
        pageTitle: `PAGE 5 — TRIANGULATION, BIAIS & RISQUES RAID (M7), PARTIES PRENANTES (M4) & VALIDATION`,
        pageSubtitle: `Protocole Catégorie B (Page 5/5) · Section 5 · Conformité Éthique UNEG, Acteurs Consultés & Signatures`,
        isSignaturePage: true,
        orgStampDataUrl: fields.orgStampDataUrl,
        partnerStampDataUrl: fields.partnerStampDataUrl,
        sections: [
          {
            heading: '5. REGISTRE DES RISQUES ET BIAIS MÉTHODOLOGIQUES DE L’ÉVALUATION (MATRICE M7)',
            paragraphs: [
              `5.1 Triangulation Systématique : ${fields.methodologyApproach}`,
              `5.2 Gouvernance du Groupe de Référence (GRE) : ${fields.governanceModalities}`,
              `5.3 Conformité Déontologique et Éthique UNEG : ${fields.confidentialityClauses}`
            ],
            table: m7Table
          },
          {
            heading: '6. MATRICE DES PARTIES PRENANTES INTERROGÉES ET CIBLES D’ENQUÊTE (MATRICE M4)',
            table: m4Table
          }
        ]
      }
    ];
  }

  // ----------------------------------------------------------------------------
  // DOC 16 : PLAN DE TRAVAIL ET BUDGET ANNUEL (PTBA) (CATÉGORIE B — 15 PAGES A4)
  // Document Contractuel Annuel & Base Juridique d'Engagement (8 Matrices : M1, M2, M3, M4, M5, M7, M8, M9)
  // ----------------------------------------------------------------------------
  if (docType === 'ptba') {
    const ptbaYear = dossier.psdYear || new Date().getFullYear();
    const prevYear = ptbaYear - 1;

    // Calcul consolidé EVM (BAC, Engagé, AC, EV, CPI) depuis la Matrice M5 active
    const m5RowsList = activeMatrices.M5 || [];
    let sumBac = 0;
    let sumCommitted = 0;
    let sumAc = 0;
    let sumEv = 0;
    m5RowsList.forEach(r => {
      sumBac += Number(String(r.Budget_Initial_BAC || r.bac || '0').replace(/[^\d.-]/g, '')) || 0;
      sumCommitted += Number(String(r.Budget_Engage || r.committed || '0').replace(/[^\d.-]/g, '')) || 0;
      sumAc += Number(String(r.Cout_Reel_AC || r.ac || '0').replace(/[^\d.-]/g, '')) || 0;
      sumEv += Number(String(r.Valeur_Acquise_EV || r.ev || '0').replace(/[^\d.-]/g, '')) || 0;
    });
    if (sumBac === 0 && totalBudgetFCFA > 0) {
      sumBac = totalBudgetFCFA;
      sumCommitted = committedBudgetFCFA;
      sumAc = completedBudgetFCFA + Math.round(inProgressBudgetFCFA * 0.5);
      sumEv = completedBudgetFCFA + Math.round(inProgressBudgetFCFA * 0.5);
    }
    const globalCpi = sumAc > 0 ? (sumEv / sumAc).toFixed(2) : '1.00';
    const donorShareTotal = Math.round(sumBac * 0.8);
    const counterpartShareTotal = Math.max(0, sumBac - donorShareTotal);

    // PAGE 1 : Fiche signalétique & approbation (Comité de Pilotage & ANO Bailleur)
    const ptbaFicheSignaletique: Array<[string, string]> = [
      ['1. Code Projet & Référence Officielle du PTBA', `${fields.referenceCode || `PTBA-FAAB-${ptbaYear}-001`} · Portefeuille « ${nomDuProjet} »`],
      ['2. Année Budgétaire (Année N) & Horizon', `Exercice Budgétaire Annuel ${ptbaYear} (${dureeOuPeriode})`],
      ['3. Structure Pilote (UGP / AGEX)', `${organisationCommanditaire} — ${directionPilote} (Coordonnateur : ${leadActorName}, ${leadActorRole})`],
      ['4. Bailleur(s) de Fonds & Commanditaire', `${bailleurDeFonds} — ${directionBailleur}`],
      ['5. Enveloppe Annuelle Globale (BAC)', `${formatDocAmount(sumBac, currency, lang)} (Bailleur 80% : ${formatDocAmount(donorShareTotal, currency, lang)} · Contrepartie 20% : ${formatDocAmount(counterpartShareTotal, currency, lang)})`],
      ['6. Adoption Comité de Pilotage (COPIL) & ANO Bailleur', fields.recipientRepresentative || `Adopté en session COPIL (${raciCtx.primaryA}) · Réf. ANO Bailleur : ANO-${ptbaYear}-PTBA-01`],
      ['7. Périmètre Opérationnel Consolidé (Onglets Appli)', `${(dossier.axes || []).length} Axe(s) / Composante(s) · ${pertSummaries.length} Projet(s) · ${totalTasks} Activités WBS (${completedTasks} Term., ${inProgressTasks} En cours, ${blockedTasks} Bloq., ${todoTasks} À faire)`],
      ['8. Chemin Critique PERT/CPM & 8 Matrices Maîtresses', `Durée critique : ${maxProjectDuration}j (${criticalSequence}) · Matrices M1, M2, M3, M4, M5, M7, M8, M9`]
    ];

    // PAGE 2 : Sommaire Exécutif des 15 pages & Liste des Sigles
    const ptbaTocRows: string[][] = [
      ['Page 1', '0. Page de Garde Officielle & Fiche d’Approbation', 'En-tête institutionnel symétrique, Fiche signalétique COPIL & Référence ANO Bailleur'],
      ['Page 2', 'Sommaire Exécutif, Liste des Sigles & Note Stratégique', 'Architecture des 15 pages A4, Glossaire normatif & Note d’orientation stratégique Année N'],
      ['Page 3', 'Section 1 : Contexte, Élaboration & Bilan Année N-1', '1.1 Bilan physique & financier N-1 ; 1.2 Enseignements & reports ; 1.3 Processus participatif COPIL'],
      ['Page 4', 'Section 2 : Orientations Stratégiques & Cadre Logique (M1)', '2.1 Impact & Effets ; 2.2 Alignement PRODOC ; 2.3 Matrice du Cadre Logique Annuel (M1)'],
      ['Pages 5-6', 'Section 3 : Description Narrative des Composantes & Acteurs', 'Page 5 : Déclinaison Axe -> Projet -> Activité -> Extrant ; Page 6 : Cibles & Parties Prenantes (M4)'],
      ['Pages 7-8', 'Section 4 : Matrice d’Activités & Gantt Annuel Q1-Q4 (M2)', 'Chronogramme annuel sur 4 trimestres (Q1-Q4), Durées & Marges PERT/CPM (Matrice M2)'],
      ['Pages 9-10', 'Section 5 : Budget Annuel Consolidé par Source & Catégorie (M5)', 'Coûts unitaires, Ventilation Bailleur/Contrepartie & Q1-Q4, Ligne TOTAL BUDGET GLOBAL PTBA'],
      ['Page 11', 'Section 6 : Plan de Décaissement, Trésorerie & Appel de Fonds', 'Projection trimestrielle/mensuelle des décaissements, Contrepartie & Seuils DRF'],
      ['Page 12', 'Section 7 : Plan Annuel de Passation des Marchés — PPM (M8)', 'Acquisitions de Fournitures, Services et Travaux, Méthodes, DAO/AMI, Attribution & Fin'],
      ['Page 13', 'Section 8 : Gouvernance RACI, RH & Organigramme (M3)', 'Affectation R, A, C (avec support Néant), I (avec support Néant) & Charge Homme/Jours'],
      ['Page 14', 'Section 9 : Suivi-Évaluation, Livrables (M9) & Risques (M7)', 'Calendrier des livrables contractuels (M9), Supervision & Registre des risques RAID (M7)'],
      ['Page 15', 'Section 10 : Annexes Opérationnelles (Règle 3R) & Signatures', 'Fiches de lots WBS (Responsable, Résultat, Ressources) & Bloc officiel de signatures']
    ];

    const ptbaAcronymsRows: string[][] = [
      ['ANO / COPIL', 'Avis de Non-Objection du Bailleur de fonds / Comité de Pilotage Interministériel ou Institutionnel'],
      ['PTBA / PTT', 'Plan de Travail et Budget Annuel (15 pages, contractuel) / Plan de Travail Trimestriel (6 pages, 90 jours)'],
      ['UGP / AGEX', 'Unité de Gestion du Projet / Agence d’Exécution Opérationnelle'],
      ['GAR / PRODOC', 'Gestion Axée sur les Résultats (Chaîne Impact-Effets-Extrants-Activités) / Document de Projet'],
      ['WBS / PERT / CPM', 'Work Breakdown Structure (Structure de découpage) / Program Evaluation and Review Technique / Chemin Critique'],
      ['EVM / BAC / AC / EV / CPI', 'Earned Value Management (Valeur Acquise) / Budget at Completion / Coût Réel / Valeur Acquise / Indice de Performance des Coûts'],
      ['PPM / DAO / AMI / DRF', 'Plan de Passation des Marchés / Dossier d’Appel d’Offres / Appel à Manifestation d’Intérêt / Demande de Retrait de Fonds'],
      ['RACI (R, A, C, I)', 'Réalisateur (R), Approbateur (A), Consulté (C — ou Néant), Informé (I — ou Néant)']
    ];

    // PAGE 5 : Tableau narratif Axe / Composante -> Projet -> Activités principales -> Extrants attendus
    const narrativeComponentRows: string[][] = [];
    (dossier.axes || []).forEach((axe, aIdx) => {
      const axeProjs = axe.projects || [];
      if (axeProjs.length === 0) {
        narrativeComponentRows.push([
          `AXE ${aIdx + 1}`,
          axe.name,
          'Composante transversale',
          'Activités de coordination et de pilotage stratégique',
          'Livrables de gouvernance validés',
          formatDocAmount(0, currency, lang)
        ]);
      } else {
        axeProjs.forEach((proj, pIdx) => {
          const tasksList = proj.tasks || [];
          const projCost = tasksList.reduce((acc, t) => acc + (Number(t.budget) || 0), 0);
          const mainActs = tasksList.slice(0, 3).map(t => t.name).join(' ; ') || proj.name;
          const deliverablesList = tasksList
            .map(t => t.livrable)
            .filter(Boolean)
            .slice(0, 2)
            .join(' · ') || `Extrants opérationnels du projet ${proj.name} livrés à 100%`;
          narrativeComponentRows.push([
            `COMP-${aIdx + 1}.${pIdx + 1}`,
            `${axe.name}\n-> ${proj.name}`,
            `${tasksList.length} activité(s) / sous-activité(s)`,
            mainActs,
            deliverablesList,
            formatDocAmount(projCost, currency, lang)
          ]);
        });
      }
    });

    // PAGES 7 & 8 : Matrice d'Activités & Chronogramme Annuel Gantt par Trimestre (Matrice M2)
    // Colonnes exactes : [Code Act. / WBS | Composante / Intitulé de l'Activité & Sous-activité | Responsable | Extrant / Livrable Attendu | Q1 | Q2 | Q3 | Q4 | Durée & Marge PERT | Cible Annuelle]
    const m2RowsList = activeMatrices.M2 || [];
    const m3RowsList = activeMatrices.M3 || [];
    const m9RowsList = activeMatrices.M9 || [];

    const fullPtbaGanttRows: string[][] = m2RowsList.map((r, idx) => {
      const codeAct = r.Code_WBS || r.wbsCode || `WBS-1.${idx + 1}`;
      const compTitle = `${r.Phase_Lot || r.phaseLot || 'Composante'} — ${r.Intitule_Tache_Activite || r.taskTitle || 'Activité'}`;
      const matchingM3 = m3RowsList[idx];
      const respActor = matchingM3?.R_Realisateur || raciCtx.rList[idx % Math.max(1, raciCtx.rList.length)] || leadActorName;
      const matchingM9 = m9RowsList[idx];
      const deliverableOut =
        r.Jalon_Associe ||
        matchingM9?.Intitule_Livrable_Actif ||
        `Livrable ${codeAct} validé`;

      const startStr = r.Date_Debut_Prevue || r.plannedDates || '';
      const endStr = r.Date_Fin_Prevue || '';
      const dateCombined = `${startStr} ${endStr}`;
      const monthMatches = dateCombined.match(/\d{4}-(\d{2})/g);
      const activeQs = new Set<number>();
      if (monthMatches && monthMatches.length > 0) {
        const months = monthMatches.map(m => Number(m.split('-')[1])).filter(n => n >= 1 && n <= 12);
        const minM = Math.min(...months);
        const maxM = Math.max(...months);
        for (let m = minM; m <= maxM; m++) {
          activeQs.add(Math.floor((m - 1) / 3) + 1);
        }
      } else {
        activeQs.add((idx % 4) + 1);
        if (idx % 2 === 0) activeQs.add(((idx + 1) % 4) + 1);
      }

      const q1Cell = activeQs.has(1) ? '■■ Q1' : '—';
      const q2Cell = activeQs.has(2) ? '■■ Q2' : '—';
      const q3Cell = activeQs.has(3) ? '■■ Q3' : '—';
      const q4Cell = activeQs.has(4) ? '■■ Q4' : '—';

      const pertNode = allNodes[idx];
      const durDays = r.Duree_Jours || r.durationDays || (pertNode ? String(pertNode.duration) : '15');
      const pertMargin =
        r.Chemin_Critique_PERT ||
        (pertNode
          ? pertNode.isCritical
            ? 'Critique (Marge 0j)'
            : `Marge +${pertNode.totalFloat}j`
          : 'Marge 0j');
      const targetAnnual = `${r.Cible || '100%'} (Atteint : ${r['Taux_Avancement_%'] ? `${r['Taux_Avancement_%']}%` : `${progressPct}%`})`;

      return [
        codeAct,
        compTitle,
        respActor,
        deliverableOut,
        q1Cell,
        q2Cell,
        q3Cell,
        q4Cell,
        `${durDays}j · ${pertMargin}`,
        targetAnnual
      ];
    });

    const ganttSplitIdx = Math.max(1, Math.ceil(fullPtbaGanttRows.length / 2));
    const ptbaGanttPage7Rows = fullPtbaGanttRows.slice(0, ganttSplitIdx);
    const ptbaGanttPage8Rows =
      fullPtbaGanttRows.slice(ganttSplitIdx).length > 0
        ? fullPtbaGanttRows.slice(ganttSplitIdx)
        : fullPtbaGanttRows;

    const ptbaGanttHeaders = [
      'Code Act. / WBS (8%)',
      "Composante / Intitulé de l'Activité & Sous-activité (22%)",
      'Responsable (11%)',
      'Extrant / Livrable Attendu (15%)',
      'Q1 (6%)',
      'Q2 (6%)',
      'Q3 (6%)',
      'Q4 (6%)',
      'Durée & Marge PERT (10%)',
      'Cible Annuelle (10%)'
    ];
    const ptbaGanttColWidths = [8, 22, 11, 15, 6, 6, 6, 6, 10, 10];

    // PAGES 9 & 10 : Budget Annuel Consolidé par Source de Financement & Catégorie (Matrice M5)
    // Colonnes exactes : [Code Act. | Description de l'Activité (PTBA) | Catégorie de Dépense | Budget Bailleur | Budget Contrepartie | Budget Total (BAC) | Q1 | Q2 | Q3 | Q4 | Engagé / AC / CPI]
    const categoriesDepenseCycle = [
      'Services de Consultants & Expertise',
      'Travaux & Infrastructures',
      'Fournitures & Équipements Techniques',
      'Ateliers, Formations & Missions Terrain',
      'Fonctionnement UGP & Suivi-Évaluation'
    ];

    let totalQ1 = 0;
    let totalQ2 = 0;
    let totalQ3 = 0;
    let totalQ4 = 0;

    const fullPtbaBudgetRows: string[][] = m5RowsList.map((r, idx) => {
      const codeBudget = r.Code_Ligne_Budget || `ACT-${idx + 1}`;
      const descAct = r.Rubrique_Activite_PTBA || `Activité PTBA #${idx + 1}`;
      const catDep = categoriesDepenseCycle[idx % categoriesDepenseCycle.length];
      const rowBac = Number(String(r.Budget_Initial_BAC || r.bac || '0').replace(/[^\d.-]/g, '')) || 0;
      const rowCommitted = Number(String(r.Budget_Engage || r.committed || '0').replace(/[^\d.-]/g, '')) || 0;
      const rowAc = Number(String(r.Cout_Reel_AC || r.ac || '0').replace(/[^\d.-]/g, '')) || 0;
      const rowCpi = r.Indice_CPI || '1.00';

      const rowDonor = Math.round(rowBac * 0.8);
      const rowCounterpart = Math.max(0, rowBac - rowDonor);
      const q1Val = Math.round(rowBac * 0.25);
      const q2Val = Math.round(rowBac * 0.30);
      const q3Val = Math.round(rowBac * 0.25);
      const q4Val = Math.max(0, rowBac - q1Val - q2Val - q3Val);

      totalQ1 += q1Val;
      totalQ2 += q2Val;
      totalQ3 += q3Val;
      totalQ4 += q4Val;

      return [
        codeBudget,
        descAct,
        catDep,
        formatDocAmount(rowDonor, currency, lang),
        formatDocAmount(rowCounterpart, currency, lang),
        formatDocAmount(rowBac, currency, lang),
        formatDocAmount(q1Val, currency, lang),
        formatDocAmount(q2Val, currency, lang),
        formatDocAmount(q3Val, currency, lang),
        formatDocAmount(q4Val, currency, lang),
        `Eng: ${formatDocAmount(rowCommitted, currency, lang)} | AC: ${formatDocAmount(rowAc, currency, lang)} | CPI: ${rowCpi}`
      ];
    });

    const totalBudgetRow: string[] = [
      'TOTAL BUDGET GLOBAL PTBA',
      `Portefeuille consolidé « ${nomDuProjet} » (${m5RowsList.length} lignes budgétaires)`,
      'Toutes Catégories Consolidées',
      formatDocAmount(donorShareTotal, currency, lang),
      formatDocAmount(counterpartShareTotal, currency, lang),
      formatDocAmount(sumBac, currency, lang),
      formatDocAmount(totalQ1 || Math.round(sumBac * 0.25), currency, lang),
      formatDocAmount(totalQ2 || Math.round(sumBac * 0.30), currency, lang),
      formatDocAmount(totalQ3 || Math.round(sumBac * 0.25), currency, lang),
      formatDocAmount(totalQ4 || Math.round(sumBac * 0.20), currency, lang),
      `Eng: ${formatDocAmount(sumCommitted, currency, lang)} | AC: ${formatDocAmount(sumAc, currency, lang)} | CPI: ${globalCpi}`
    ];

    const budgetSplitIdx = Math.max(1, Math.ceil(fullPtbaBudgetRows.length / 2));
    const ptbaBudgetPage9Rows = [...fullPtbaBudgetRows.slice(0, budgetSplitIdx), totalBudgetRow];
    const ptbaBudgetPage10Rows =
      fullPtbaBudgetRows.slice(budgetSplitIdx).length > 0
        ? [...fullPtbaBudgetRows.slice(budgetSplitIdx), totalBudgetRow]
        : [...fullPtbaBudgetRows, totalBudgetRow];

    const ptbaBudgetHeaders = [
      'Code Act. (7%)',
      "Description de l'Activité (PTBA) (16%)",
      'Catégorie de Dépense (11%)',
      'Budget Bailleur (9%)',
      'Budget Contrepartie (9%)',
      'Budget Total (BAC) (10%)',
      'Q1 (6%)',
      'Q2 (6%)',
      'Q3 (6%)',
      'Q4 (6%)',
      'Engagé / AC / CPI (14%)'
    ];
    const ptbaBudgetColWidths = [7, 16, 11, 9, 9, 10, 6, 6, 6, 6, 14];

    // PAGE 11 : Plan de Décaissement Prévisionnel, Trésorerie & Appel de Fonds (DRF)
    const drfScheduleRows: string[][] = [
      [
        `DRF-01 / Q1 (${ptbaYear})`,
        'Janvier – Mars (M1 à M3)',
        formatDocAmount(Math.round(donorShareTotal * 0.25), currency, lang),
        formatDocAmount(Math.round(counterpartShareTotal * 0.25), currency, lang),
        formatDocAmount(totalQ1 || Math.round(sumBac * 0.25), currency, lang),
        '25%',
        'Avance de démarrage / Réapprovisionnement Compte Désigné (Seuil 30%)'
      ],
      [
        `DRF-02 / Q2 (${ptbaYear})`,
        'Avril – Juin (M4 à M6)',
        formatDocAmount(Math.round(donorShareTotal * 0.30), currency, lang),
        formatDocAmount(Math.round(counterpartShareTotal * 0.30), currency, lang),
        formatDocAmount(totalQ2 || Math.round(sumBac * 0.30), currency, lang),
        '30% (Cumul 55%)',
        'Justification ≥ 70% de la DRF-01 + Rapport Financier Intérimaire (RFI Q1)'
      ],
      [
        `DRF-03 / Q3 (${ptbaYear})`,
        'Juillet – Septembre (M7 à M9)',
        formatDocAmount(Math.round(donorShareTotal * 0.25), currency, lang),
        formatDocAmount(Math.round(counterpartShareTotal * 0.25), currency, lang),
        formatDocAmount(totalQ3 || Math.round(sumBac * 0.25), currency, lang),
        '25% (Cumul 80%)',
        'Validation revue mi-parcours + Paiements directs marchés majeurs PPM'
      ],
      [
        `DRF-04 / Q4 (${ptbaYear})`,
        'Octobre – Décembre (M10 à M12)',
        formatDocAmount(Math.round(donorShareTotal * 0.20), currency, lang),
        formatDocAmount(Math.round(counterpartShareTotal * 0.20), currency, lang),
        formatDocAmount(totalQ4 || Math.round(sumBac * 0.20), currency, lang),
        '20% (Cumul 100%)',
        'Apurement des engagements annuels, réceptions définitives & pré-audit'
      ],
      [
        'TOTAL ANNUEL DRF',
        `Exercice ${ptbaYear} (12 mois)`,
        formatDocAmount(donorShareTotal, currency, lang),
        formatDocAmount(counterpartShareTotal, currency, lang),
        formatDocAmount(sumBac, currency, lang),
        '100% du BAC',
        `Décaissé réel à date (AC) : ${formatDocAmount(sumAc, currency, lang)} · CPI = ${globalCpi}`
      ]
    ];

    // PAGE 12 : Plan Annuel de Passation des Marchés - PPM Synthétique (Matrice M8)
    // Colonnes exactes : [Réf. Marché | Description du Marché | Type (Fournitures / Services / Travaux) | Méthode de Passation | Budget Estimé | Lancement DAO/AMI | Attribution Contrat | Fin Prestation]
    const m8RowsList = activeMatrices.M8 || [];
    const ptbaPpmRows: string[][] = m8RowsList.map((r, idx) => [
      r.Code_Marche || `PPM-${ptbaYear}-0${idx + 1}`,
      r.Designation_Acquisition || `Marché d'acquisition #${idx + 1}`,
      r.Categorie_Marche || 'Services de Consultants / Fournitures',
      `${r.Mode_Passation || 'Appel d’Offres Ouvert (AOO)'} (${r.Revue_Bailleur || 'A priori'})`,
      formatDocAmount(
        Number(String(r.Montant_Estime || '0').replace(/[^\d.-]/g, '')) || Math.round(sumBac / Math.max(1, m8RowsList.length)),
        currency,
        lang
      ),
      r.Date_Lancement_DAO || `${ptbaYear}-02-15`,
      r.Date_Attribution_Signature || `${ptbaYear}-04-01`,
      `${r.Date_Reception_Prevue_Reelle || `${ptbaYear}-11-30`} (${r.Statut_Marche || 'En cours'})`
    ]);

    // PAGE 15 : Annexes Opérationnelles (Fiches de Tâches / Lots WBS - Règle des 3R : Responsable unique, Résultat concret, Ressources allouées)
    const lots3RRows: string[][] = m2RowsList.map((r, idx) => {
      const codeWbs = r.Code_WBS || `LOT-WBS-1.${idx + 1}`;
      const matchM3 = m3RowsList[idx];
      const matchM5 = m5RowsList[idx];
      const matchM9 = m9RowsList[idx];
      const rUnique = matchM3?.R_Realisateur || leadActorName;
      const aUnique = matchM3?.A_Approbateur || raciCtx.primaryA;
      const cConsulted = matchM3?.C_Consulte || 'Néant';
      const iInformed = matchM3?.I_Informe || 'Néant';
      const concreteResult =
        matchM9?.Intitule_Livrable_Actif ||
        r.Jalon_Associe ||
        `Livrable opérationnel ${codeWbs} réceptionné à 100%`;
      const allocatedRes = formatDocAmount(
        Number(String(matchM5?.Budget_Initial_BAC || '0').replace(/[^\d.-]/g, '')) ||
          Math.round(sumBac / Math.max(1, m2RowsList.length)),
        currency,
        lang
      );
      const hjLoad = matchM3?.Charge_Homme_Jours ? `${matchM3.Charge_Homme_Jours} H/J` : `${r.Duree_Jours || 15} H/J`;

      return [
        codeWbs,
        `${r.Phase_Lot || 'Lot'} — ${r.Intitule_Tache_Activite || 'Activité'}`,
        `1R — Responsable unique (R) : ${rUnique}\nApprobateur (A) : ${aUnique} · C : ${cConsulted} · I : ${iInformed}`,
        `2R — Résultat concret & mesurable :\n${concreteResult} (Cible : ${r.Cible || '100%'})`,
        `3R — Ressources allouées :\nBudget : ${allocatedRes} · Charge : ${hjLoad}`
      ];
    });

    return [
      // PAGE 1 / 15
      {
        pageTitle: `PAGE 1 — PAGE DE GARDE OFFICIELLE & FICHE D’APPROBATION (COMITÉ DE PILOTAGE & ANO BAILLEUR)`,
        pageSubtitle: `Protocole Catégorie B (Page 1/15) · Document Contractuel Annuel & Base Juridique d’Engagement`,
        sections: [
          {
            heading: '0. PAGE DE GARDE OFFICIELLE & FICHE D’APPROBATION DU PTBA',
            coverChart: coverChartBlock,
            keyValueRows: ptbaFicheSignaletique
          }
        ]
      },
      // PAGE 2 / 15
      {
        pageTitle: `PAGE 2 — SOMMAIRE EXÉCUTIF, LISTE DES SIGLES & NOTE D’ORIENTATION STRATÉGIQUE`,
        pageSubtitle: `Protocole Catégorie B (Page 2/15) · Architecture des 15 Pages A4, Glossaire des Acronymes & Synthèse Exécutive`,
        sections: [
          {
            heading: '0.1 SOMMAIRE EXÉCUTIF DÉTAILLÉ DU PTBA (15 PAGES A4 CONSOLIDÉES)',
            paragraphs: [fields.extraField1 || ''].filter(Boolean),
            table: {
              headers: ['Pagination (14%)', 'Section / Chapitre Officiel du PTBA (38%)', 'Contenu Normatif & Matrices Maîtresses Associées (48%)'],
              columnWidths: [14, 38, 48],
              rows: ptbaTocRows
            }
          },
          {
            heading: '0.2 LISTE OFFICIELLE DES SIGLES, ACRONYMES ET ABRÉVIATIONS',
            table: {
              headers: ['Sigle / Acronyme (24%)', 'Signification Officielle & Norme Internationale (PNUD / BM / BAD / UE) (76%)'],
              columnWidths: [24, 76],
              rows: ptbaAcronymsRows
            }
          }
        ]
      },
      // PAGE 3 / 15
      {
        pageTitle: `PAGE 3 — SECTION 1 : CONTEXTE, PROCESSUS D’ÉLABORATION & BILAN DE L’ANNÉE N-1`,
        pageSubtitle: `Protocole Catégorie B (Page 3/15) · Section 1 · Exécution Physique et Financière ${prevYear}, Goulots & Validation COPIL`,
        sections: [
          {
            heading: `1. CONTEXTE, PROCESSUS D’ÉLABORATION & BILAN DE L’ANNÉE ÉCOULÉE (${prevYear})`,
            paragraphs: [
              `1.1 Bilan d’exécution physique et financière de l’année écoulée (N-1) : ${fields.contextJustification}`,
              `1.2 Enseignements clés, réussites, goulots d’étranglement et activités non achevées reportées en N : ${fields.extraField2 || ''}`,
              `1.3 Processus participatif d’élaboration, d’arbitrage et de validation du PTBA : ${fields.extraField3 || ''}`
            ].filter(p => !p.endsWith(': ')),
            table: {
              headers: [
                'Axe Stratégique & Projet (28%)',
                'Volumétrie WBS (12%)',
                'Répartition des Statuts (24%)',
                'Écarts Calendaires (10%)',
                'Taux Physique (10%)',
                'Enveloppe BAC (16%)'
              ],
              columnWidths: [28, 12, 24, 10, 10, 16],
              rightAlignCols: [4, 5],
              rows:
                projectDashboardRows.length > 0
                  ? projectDashboardRows
                  : [
                      [
                        nomDuProjet,
                        `${totalTasks} tâche(s)`,
                        `${completedTasks} Term. · ${inProgressTasks} En cours · ${blockedTasks} Bloq.`,
                        `${delayedTasksCount} écart(s)`,
                        `${progressPct}%`,
                        budgetGlobalFormatted
                      ]
                    ]
            }
          }
        ]
      },
      // PAGE 4 / 15
      {
        pageTitle: `PAGE 4 — SECTION 2 : ORIENTATIONS STRATÉGIQUES DE L’ANNÉE N & CADRE LOGIQUE ANNUEL (MATRICE M1)`,
        pageSubtitle: `Protocole Catégorie B (Page 4/15) · Section 2 · Chaîne de Résultats GAR (Impact, Effets, Extrants) & Alignement PRODOC`,
        sections: [
          {
            heading: `2. ORIENTATIONS STRATÉGIQUES DE L’ANNÉE ${ptbaYear} & CADRE LOGIQUE ANNUEL (MATRICE M1)`,
            paragraphs: [
              `2.1 Rappel de l’objectif global (Impact), des objectifs spécifiques (Effets / Outcomes) et alignement PRODOC : ${fields.specificObjectives}`
            ],
            table: m1Table
          }
        ]
      },
      // PAGE 5 / 15
      {
        pageTitle: `PAGE 5 — SECTION 3 : DESCRIPTION NARRATIVE DES COMPOSANTES, PROJETS ET ACTIVITÉS (1/2)`,
        pageSubtitle: `Protocole Catégorie B (Page 5/15) · Section 3.1 · Déclinaison par Axe / Composante -> Sous-composante -> Activités -> Extrants`,
        sections: [
          {
            heading: '3.1 DÉCLINAISON NARRATIVE PAR AXE / COMPOSANTE, PROJETS, ACTIVITÉS PRINCIPALES ET EXTRANTS ATTENDUS',
            paragraphs: [fields.extraField4 || ''].filter(Boolean),
            table: {
              headers: [
                'Code Comp. (10%)',
                'Axe / Composante & Sous-composante (Projet) (22%)',
                'Volumétrie (12%)',
                'Activités Principales Programmées en Année N (24%)',
                'Résultats Attendus (Extrants / Outputs) (20%)',
                `Budget Alloué (${currency}) (12%)`
              ],
              columnWidths: [10, 22, 12, 24, 20, 12],
              rightAlignCols: [5],
              rows: narrativeComponentRows
            }
          }
        ]
      },
      // PAGE 6 / 15
      {
        pageTitle: `PAGE 6 — SECTION 3 : CIBLES BÉNÉFICIAIRES & STRATÉGIE DE MISE EN ŒUVRE DES ACTEURS (2/2 — MATRICE M4)`,
        pageSubtitle: `Protocole Catégorie B (Page 6/15) · Section 3.2 · Cartographie des Parties Prenantes, Bénéficiaires & Partenaires d’Exécution`,
        sections: [
          {
            heading: '3.2 CIBLES BÉNÉFICIAIRES ET STRATÉGIE D’ENGAGEMENT DES PARTIES PRENANTES (MATRICE M4 — [TXT_PARTIES_PRENANTES_M4])',
            paragraphs: [fields.extraField5 || ''].filter(Boolean),
            table: m4Table
          }
        ]
      },
      // PAGE 7 / 15
      {
        pageTitle: `PAGE 7 — SECTION 4 : MATRICE D’ACTIVITÉS & CHRONOGRAMME ANNUEL GANTT PAR TRIMESTRE (1/2 — MATRICE M2)`,
        pageSubtitle: `Protocole Catégorie B (Page 7/15) · Section 4.1 · Programmation Trimestrielle Q1, Q2, Q3, Q4, Responsables & Livrables`,
        sections: [
          {
            heading: '4.1 MATRICE D’ACTIVITÉS & CHRONOGRAMME ANNUEL GANTT SUR 4 TRIMESTRES Q1-Q4 (MATRICE M2 — PARTIE 1)',
            paragraphs: [fields.methodologyApproach].filter(Boolean),
            table: {
              headers: ptbaGanttHeaders,
              columnWidths: ptbaGanttColWidths,
              rows: ptbaGanttPage7Rows
            }
          }
        ]
      },
      // PAGE 8 / 15
      {
        pageTitle: `PAGE 8 — SECTION 4 : MATRICE D’ACTIVITÉS, SUITE DU GANTT Q1-Q4 & CHEMIN CRITIQUE PERT/CPM (2/2 — MATRICE M2)`,
        pageSubtitle: `Protocole Catégorie B (Page 8/15) · Section 4.2 · Ordonnancement Algorithmique PERT/CPM, Marges & Cibles Annuelles`,
        sections: [
          {
            heading: '4.2 SUITE DU CHRONOGRAMME ANNUEL GANTT Q1-Q4 & ORDONNANCEMENT DU CHEMIN CRITIQUE PERT/CPM (MATRICE M2 — PARTIE 2)',
            paragraphs: [fields.extraField6 || ''].filter(Boolean),
            table: {
              headers: ptbaGanttHeaders,
              columnWidths: ptbaGanttColWidths,
              rows: ptbaGanttPage8Rows
            }
          }
        ]
      },
      // PAGE 9 / 15
      {
        pageTitle: `PAGE 9 — SECTION 5 : BUDGET ANNUEL CONSOLIDÉ PAR SOURCE DE FINANCEMENT & CATÉGORIE (1/2 — MATRICE M5)`,
        pageSubtitle: `Protocole Catégorie B (Page 9/15) · Section 5.1 · Ventilation Bailleur / Contrepartie, Catégories de Dépense & Trimestres Q1-Q4`,
        sections: [
          {
            heading: '5.1 BUDGET ANNUEL CONSOLIDÉ PAR ACTIVITÉ, CATÉGORIE DE DÉPENSE ET SOURCE DE FINANCEMENT (MATRICE M5 — PARTIE 1)',
            paragraphs: [fields.extraField7 || ''].filter(Boolean),
            table: {
              headers: ptbaBudgetHeaders,
              columnWidths: ptbaBudgetColWidths,
              rightAlignCols: [3, 4, 5, 6, 7, 8, 9],
              rows: ptbaBudgetPage9Rows
            }
          }
        ]
      },
      // PAGE 10 / 15
      {
        pageTitle: `PAGE 10 — SECTION 5 : VENTILATION BUDGÉTAIRE TRIMESTRIELLE Q1-Q4 & EXÉCUTION EVM (2/2 — MATRICE M5)`,
        pageSubtitle: `Protocole Catégorie B (Page 10/15) · Section 5.2 · Suite du Budget Analytique, Valeur Acquise EVM (BAC, AC, EV, CPI) & Total Global`,
        sections: [
          {
            heading: '5.2 VENTILATION BUDGÉTAIRE TRIMESTRIELLE (Q1-Q4), PERFORMANCE EVM & TOTAL BUDGET GLOBAL PTBA (MATRICE M5 — PARTIE 2)',
            paragraphs: [fields.extraField8 || ''].filter(Boolean),
            table: {
              headers: ptbaBudgetHeaders,
              columnWidths: ptbaBudgetColWidths,
              rightAlignCols: [3, 4, 5, 6, 7, 8, 9],
              rows: ptbaBudgetPage10Rows
            }
          }
        ]
      },
      // PAGE 11 / 15
      {
        pageTitle: `PAGE 11 — SECTION 6 : PLAN DE DÉCAISSEMENT PRÉVISIONNEL, TRÉSORERIE & APPEL DE FONDS (DRF)`,
        pageSubtitle: `Protocole Catégorie B (Page 11/15) · Section 6 · Projection de Consommation des Crédits, Contrepartie Nationale & Compte Désigné`,
        sections: [
          {
            heading: '6. PLAN DE DÉCAISSEMENT PRÉVISIONNEL, TRÉSORERIE ANNUELLE & DEMANDES DE RETRAIT DE FONDS (DRF)',
            paragraphs: [fields.extraField9 || ''].filter(Boolean),
            table: {
              headers: [
                'Réf. Appel / Trimestre (13%)',
                'Période Calendaire (15%)',
                'Décaissement Bailleur (15%)',
                'Mobilisation Contrepartie (15%)',
                'Total Trésorerie Trim. (15%)',
                'Poids / Cumul (10%)',
                'Conditionnalité Fiduciaire & Seuil DRF (17%)'
              ],
              columnWidths: [13, 15, 15, 15, 15, 10, 17],
              rightAlignCols: [2, 3, 4, 5],
              rows: drfScheduleRows
            }
          }
        ]
      },
      // PAGE 12 / 15
      {
        pageTitle: `PAGE 12 — SECTION 7 : PLAN ANNUEL DE PASSATION DES MARCHÉS — PPM SYNTHÉTIQUE (MATRICE M8)`,
        pageSubtitle: `Protocole Catégorie B (Page 12/15) · Section 7 · Acquisitions de Fournitures, Services et Travaux, Méthodes & Chronogramme DAO`,
        sections: [
          {
            heading: '7. PLAN ANNUEL DE PASSATION DES MARCHÉS — PPM SYNTHÉTIQUE (MATRICE M8 — [TXT_MARCHES_PPM_M8])',
            paragraphs: [fields.extraField10 || ''].filter(Boolean),
            table: {
              headers: [
                'Réf. Marché (10%)',
                'Description du Marché (22%)',
                'Type (Fournitures / Services / Travaux) (14%)',
                'Méthode de Passation (14%)',
                'Budget Estimé (12%)',
                'Lancement DAO/AMI (9%)',
                'Attribution Contrat (9%)',
                'Fin Prestation (10%)'
              ],
              columnWidths: [10, 22, 14, 14, 12, 9, 9, 10],
              rightAlignCols: [4],
              rows: ptbaPpmRows
            }
          }
        ]
      },
      // PAGE 13 / 15
      {
        pageTitle: `PAGE 13 — SECTION 8 : GOUVERNANCE RACI, RESSOURCES HUMAINES & ORGANIGRAMME (MATRICE M3)`,
        pageSubtitle: `Protocole Catégorie B (Page 13/15) · Section 8 · Matrice RACI (R, A, C avec Néant, I avec Néant), Charge H/J & Coordination UGP`,
        sections: [
          {
            heading: '8. GOUVERNANCE RACI, RESSOURCES HUMAINES & ORGANIGRAMME DE GESTION (MATRICE M3 — [TXT_RACI_RH_M3])',
            paragraphs: [fields.governanceModalities].filter(Boolean),
            table: m3Table
          }
        ]
      },
      // PAGE 14 / 15
      {
        pageTitle: `PAGE 14 — SECTION 9 : DISPOSITIF DE SUIVI-ÉVALUATION, LIVRABLES (M9) & GESTION DES RISQUES (M7)`,
        pageSubtitle: `Protocole Catégorie B (Page 14/15) · Section 9 · Calendrier des Missions de Supervision, Livrables Contractuels & Matrice RAID`,
        sections: [
          {
            heading: '9.1 DISPOSITIF DE SUIVI-ÉVALUATION & CALENDRIER DES LIVRABLES CONTRACTUELS (MATRICE M9 — [TXT_QUALITE_LIVRABLES_M9])',
            paragraphs: [fields.confidentialityClauses].filter(Boolean),
            table: m9Table
          },
          {
            heading: '9.2 MATRICE DES RISQUES OPÉRATIONNELS, FINANCIERS ET SÉCURITAIRES & MESURES D’ATTÉNUATION (MATRICE M7 — [TXT_RISQUES_RAID_M7])',
            paragraphs: [fields.recommendationsLessons].filter(Boolean),
            table: m7Table
          }
        ]
      },
      // PAGE 15 / 15
      {
        pageTitle: `PAGE 15 — SECTION 10 : ANNEXES OPÉRATIONNELLES (FICHES DE LOTS WBS — RÈGLE DES 3R) & SIGNATURES`,
        pageSubtitle: `Protocole Catégorie B (Page 15/15) · Section 10 · Fiches des Lots de Travail (Responsable, Résultat, Ressources) & Adoption Officielle`,
        isSignaturePage: true,
        orgStampDataUrl: fields.orgStampDataUrl,
        partnerStampDataUrl: fields.partnerStampDataUrl,
        sections: [
          {
            heading: '10. ANNEXES OPÉRATIONNELLES : FICHES SYNTHÉTIQUES DES LOTS DE TRAVAIL WBS (RÈGLE DES 3R)',
            paragraphs: [fields.extraField11 || ''].filter(Boolean),
            table: {
              headers: [
                'Code Lot WBS (11%)',
                'Composante & Intitulé du Lot de Travail (21%)',
                '1R — Responsable Unique (R) & Gouvernance RACI (24%)',
                '2R — Résultat Concret & Livrable Mesurable (24%)',
                '3R — Ressources Allouées (Budget & H/J) (20%)'
              ],
              columnWidths: [11, 21, 24, 24, 20],
              rows: lots3RRows
            }
          }
        ]
      }
    ];
  }

  // ----------------------------------------------------------------------------
  // DOC 17 : PLAN DE TRAVAIL TRIMESTRIEL (PTT) (CATÉGORIE B — 6 PAGES A4)
  // Outil de Pilotage Opérationnel de Proximité (90 jours) (5 Matrices : M2, M3, M5, M7, M9)
  // ----------------------------------------------------------------------------
  if (docType === 'ptt') {
    const ptbaYear = dossier.psdYear || new Date().getFullYear();
    const curMonth = new Date().getMonth();
    const defaultQNum = Math.floor(curMonth / 3) + 1;
    const selectedQ =
      fields.activeQuarter ||
      rawFields.activeQuarter ||
      (`Q${defaultQNum}` as 'Q1' | 'Q2' | 'Q3' | 'Q4');
    const qNum = Number(selectedQ.replace('Q', '')) || defaultQNum;

    const qMonthsLabels: Record<number, [string, string, string]> = {
      1: ['Mois 1 (Janv.)', 'Mois 2 (Févr.)', 'Mois 3 (Mars)'],
      2: ['Mois 1 (Avril)', 'Mois 2 (Mai)', 'Mois 3 (Juin)'],
      3: ['Mois 1 (Juil.)', 'Mois 2 (Août)', 'Mois 3 (Sept.)'],
      4: ['Mois 1 (Oct.)', 'Mois 2 (Nov.)', 'Mois 3 (Déc.)']
    };
    const [m1Label, m2Label, m3Label] = qMonthsLabels[qNum] || ['Mois 1', 'Mois 2', 'Mois 3'];

    const m5RowsList = activeMatrices.M5 || [];
    let sumBac = 0;
    let sumCommitted = 0;
    let sumAc = 0;
    let sumEv = 0;
    m5RowsList.forEach(r => {
      sumBac += Number(String(r.Budget_Initial_BAC || r.bac || '0').replace(/[^\d.-]/g, '')) || 0;
      sumCommitted += Number(String(r.Budget_Engage || r.committed || '0').replace(/[^\d.-]/g, '')) || 0;
      sumAc += Number(String(r.Cout_Reel_AC || r.ac || '0').replace(/[^\d.-]/g, '')) || 0;
      sumEv += Number(String(r.Valeur_Acquise_EV || r.ev || '0').replace(/[^\d.-]/g, '')) || 0;
    });
    if (sumBac === 0 && totalBudgetFCFA > 0) {
      sumBac = totalBudgetFCFA;
      sumCommitted = committedBudgetFCFA;
      sumAc = completedBudgetFCFA + Math.round(inProgressBudgetFCFA * 0.5);
      sumEv = completedBudgetFCFA + Math.round(inProgressBudgetFCFA * 0.5);
    }
    const globalCpi = sumAc > 0 ? (sumEv / sumAc).toFixed(2) : '1.00';
    const quarterShareRatio = qNum === 2 ? 0.30 : qNum === 4 ? 0.20 : 0.25;
    const quarterlyDisbursementNeed = Math.max(
      0,
      Math.round(sumBac * quarterShareRatio)
    );

    // PAGE 1 : Fiche de validation trimestrielle (Q1, Q2, Q3 ou Q4)
    const pttValidationFiche: Array<[string, string]> = [
      ['1. Code Document PTT & Rattachement PTBA', `${fields.referenceCode || `PTT-${selectedQ}-FAAB-${ptbaYear}-001`} · Rattaché au PTBA-${ptbaYear} (6 pages A4)`],
      ['2. Trimestre Ciblé & Horizon Opérationnel (90 jours)', `Trimestre ${selectedQ} (${m1Label} · ${m2Label} · ${m3Label} — 90 jours)`],
      ['3. Statut de Validation UGP & Approbation', fields.recipientRepresentative || `Validé par l’UGP (${leadActorName}) & Approuvé (${raciCtx.primaryA})`],
      ['4. Structure Pilote (UGP) & Responsable S&E', `${organisationCommanditaire} — ${directionPilote} (${leadActorName}, ${leadActorRole})`],
      ['5. Bailleur(s) de Fonds & Commanditaire', `${bailleurDeFonds} — ${directionBailleur}`],
      ['6. Enveloppe Trimestrielle Allouée (Cash-Flow 90j)', `${formatDocAmount(quarterlyDisbursementNeed, currency, lang)} sur un BAC annuel de ${formatDocAmount(sumBac, currency, lang)} (Engagé : ${formatDocAmount(sumCommitted, currency, lang)} · CPI = ${globalCpi})`],
      ['7. État Physique Kanban / Suivi à l’Entrée du Trimestre', `${totalTasks} activités : ${inProgressTasks} en cours, ${todoTasks} à démarrer, ${completedTasks} achevées (${progressPct}%), ${blockedTasks} bloquée(s), ${delayedTasksCount} en écart`],
      ['8. Chemin Critique PERT/CPM & 5 Matrices Activées', `Séquence critique : ${criticalSequence} (${maxProjectDuration}j) · Matrices M2, M3, M5, M7, M9`]
    ];

    // PAGE 3 : Planning Opérationnel Mois par Mois (Gantt Trimestriel - Matrice M2)
    // Colonnes exactes : [Code Act. | Activités & Sous-activités de Proximité (Verbe d'action) | Responsable & Associés | Mois 1 | Mois 2 | Mois 3 | Indicateur & Livrable Attendu à M3]
    const actionVerbs = [
      'Réaliser et finaliser',
      'Organiser et déployer',
      'Exécuter et contrôler',
      'Coordonner et valider',
      'Élaborer et soumettre',
      'Superviser et réceptionner'
    ];
    const m2RowsList = activeMatrices.M2 || [];
    const m3RowsList = activeMatrices.M3 || [];
    const m9RowsList = activeMatrices.M9 || [];

    const pttMonthlyGanttRows: string[][] = m2RowsList.map((r, idx) => {
      const codeAct = r.Code_WBS || r.wbsCode || `ACT-${selectedQ}.${idx + 1}`;
      const rawTitle = r.Intitule_Tache_Activite || r.taskTitle || `Activité opérationnelle #${idx + 1}`;
      const verbPrefix = actionVerbs[idx % actionVerbs.length];
      const actionTitle = /^(réaliser|organiser|exécuter|coordonner|élaborer|superviser|conduire|déployer|assurer|finaliser|lancer)/i.test(
        rawTitle.trim()
      )
        ? `${rawTitle} (${r.Phase_Lot || 'Lot opérationnel'})`
        : `${verbPrefix} : ${rawTitle} (${r.Phase_Lot || 'Lot opérationnel'})`;

      const matchM3 = m3RowsList[idx];
      const respR = matchM3?.R_Realisateur || leadActorName;
      const assocC =
        matchM3?.C_Consulte && matchM3.C_Consulte !== 'Néant'
          ? `Associés (C) : ${matchM3.C_Consulte}`
          : 'Associés (C) : Néant';

      const m1Active = idx % 3 === 0 || idx % 2 === 0;
      const m2Active = true;
      const m3Active = idx % 3 !== 0 || idx === m2RowsList.length - 1;

      const matchM9 = m9RowsList[idx];
      const expectedM3Output =
        matchM9?.Intitule_Livrable_Actif ||
        r.Jalon_Associe ||
        `Cible M3 : ${r.Cible || '100%'} · Livrable ${codeAct} validé`;

      return [
        codeAct,
        actionTitle,
        `Resp. (R) : ${respR}\n${assocC}`,
        m1Active ? `■■ ${m1Label.split(' ')[1] || 'M1'}\n(S1-S4)` : '—',
        m2Active ? `■■ ${m2Label.split(' ')[1] || 'M2'}\n(S5-S8)` : '—',
        m3Active ? `■■ ${m3Label.split(' ')[1] || 'M3'}\n(S9-S12)` : '—',
        expectedM3Output
      ];
    });

    // PAGE 4 : Budget Opérationnel & Plan de Trésorerie Trimestriel (Matrice M5)
    // Colonnes exactes : [Code Act. | Intitulé de l'Activité | Besoins réels en dépenses (Rubriques) | Source | Besoin Mois 1 | Besoin Mois 2 | Besoin Mois 3 | Total Décaissement Trimestre]
    const expenseNeedsCycle = [
      'Honoraires consultants, expertise & frais de mission terrain',
      'Acquisition d’équipements, logistique & fournitures opérationnelles',
      'Organisation d’ateliers techniques, per diem & location de salles',
      'Travaux d’aménagement, suivi de chantier & contrôle qualité',
      ' Collecte de données S&E, supervision & validation des livrables'
    ];

    let sumM1Cash = 0;
    let sumM2Cash = 0;
    let sumM3Cash = 0;
    let sumQuarterCash = 0;

    const pttCashflowRows: string[][] = m5RowsList.map((r, idx) => {
      const codeAct = r.Code_Ligne_Budget || `ACT-${selectedQ}.${idx + 1}`;
      const actTitle = r.Rubrique_Activite_PTBA || `Activité opérationnelle #${idx + 1}`;
      const rubriqueNeed = expenseNeedsCycle[idx % expenseNeedsCycle.length].trim();
      const sourceFin = r.Source_Financement || `${bailleurDeFonds} (80%) / Contrepartie (20%)`;

      const rowAnnualBac = Number(String(r.Budget_Initial_BAC || r.bac || '0').replace(/[^\d.-]/g, '')) || 0;
      const rowQuarterTotal = Math.round(rowAnnualBac * quarterShareRatio);
      const m1Cash = Math.round(rowQuarterTotal * 0.35);
      const m2Cash = Math.round(rowQuarterTotal * 0.40);
      const m3Cash = Math.max(0, rowQuarterTotal - m1Cash - m2Cash);

      sumM1Cash += m1Cash;
      sumM2Cash += m2Cash;
      sumM3Cash += m3Cash;
      sumQuarterCash += rowQuarterTotal;

      return [
        codeAct,
        actTitle,
        rubriqueNeed,
        sourceFin,
        formatDocAmount(m1Cash, currency, lang),
        formatDocAmount(m2Cash, currency, lang),
        formatDocAmount(m3Cash, currency, lang),
        formatDocAmount(rowQuarterTotal, currency, lang)
      ];
    });

    const totalCashRow: string[] = [
      'TOTAL BESOIN EN LIQUIDITÉS (TRÉSORERIE)',
      `Trésorerie opérationnelle consolidée du ${selectedQ} (90 jours)`,
      'Total des décaissements immédiats requis sur Mois 1, Mois 2 et Mois 3',
      'Bailleur + Contrepartie',
      formatDocAmount(sumM1Cash || Math.round(quarterlyDisbursementNeed * 0.35), currency, lang),
      formatDocAmount(sumM2Cash || Math.round(quarterlyDisbursementNeed * 0.40), currency, lang),
      formatDocAmount(sumM3Cash || Math.round(quarterlyDisbursementNeed * 0.25), currency, lang),
      formatDocAmount(sumQuarterCash || quarterlyDisbursementNeed, currency, lang)
    ];

    // PAGE 5 : Matrice RACI Trimestrielle d'Équipe (Matrice M3)
    // Colonnes exactes : [Activités du Trimestre | Chef de Projet / Coordonnateur | Responsable S&E | Spécialiste Passation | Comptable / RAF | Consultant / Prestataire]
    const pttTeamRaciRows: string[][] = m3RowsList.map((r, idx) => {
      const actLabel = `${r.Code_Acteur_Lot || `ACT-${idx + 1}`} — ${r.Domaine_Livrable_Activite || 'Activité du trimestre'}`;
      const rActor = r.R_Realisateur || leadActorName;
      const aActor = r.A_Approbateur || raciCtx.primaryA;
      const cActor = r.C_Consulte || 'Néant';
      const iActor = r.I_Informe || 'Néant';

      return [
        actLabel,
        `A / R (${aActor})`,
        cActor === 'Néant' ? 'C : Néant · I : Suivi S&E' : `C (${cActor})`,
        idx % 2 === 0 ? 'R / C (Passation DAO/Contrat)' : 'I (Suivi PPM)',
        'C / R (Engagement & Décaissement)',
        `R (${rActor}) · I : ${iActor}`
      ];
    });

    return [
      // PAGE 1 / 6
      {
        pageTitle: `PAGE 1 — PAGE DE GARDE TRIMESTRIELLE & FICHE DE VALIDATION (TRIMESTRE ${selectedQ})`,
        pageSubtitle: `Protocole Catégorie B (Page 1/6) · Outil de Pilotage Opérationnel de Proximité (90 jours : ${m1Label}, ${m2Label}, ${m3Label})`,
        sections: [
          {
            heading: `0. PAGE DE GARDE TRIMESTRIELLE & FICHE DE VALIDATION (${selectedQ})`,
            coverChart: coverChartBlock,
            keyValueRows: pttValidationFiche
          }
        ]
      },
      // PAGE 2 / 6
      {
        pageTitle: `PAGE 2 — SECTION 1 : RAPPEL DES OBJECTIFS DU TRIMESTRE & BILAN SUCCINCT DU TRIMESTRE ÉCOULÉ`,
        pageSubtitle: `Protocole Catégorie B (Page 2/6) · Section 1 · État d’Avancement Kanban/Suivi, Cibles à 90 Jours & Jalons Critiques PERT`,
        sections: [
          {
            heading: `1. RAPPEL DES OBJECTIFS DU TRIMESTRE (${selectedQ}) & BILAN SUCCINCT DU TRIMESTRE ÉCOULÉ`,
            paragraphs: [
              `1.1 État d’avancement rapide du trimestre précédent (activités achevées, en cours, en retard ou bloquées issues du Kanban/Suivi) : ${fields.contextJustification}`,
              `1.2 Objectifs opérationnels prioritaires des 90 prochains jours (extraits du PTBA) et jalons critiques PERT à franchir : ${fields.specificObjectives}`
            ],
            table: {
              headers: [
                'Axe Stratégique & Projet (28%)',
                'Tâches Actives (12%)',
                'Statuts Kanban / Suivi (24%)',
                'Écarts à Résorber (10%)',
                `Cible Fin ${selectedQ} (10%)`,
                'Budget Engagé / BAC (16%)'
              ],
              columnWidths: [28, 12, 24, 10, 10, 16],
              rightAlignCols: [4, 5],
              rows:
                projectDashboardRows.length > 0
                  ? projectDashboardRows
                  : [
                      [
                        nomDuProjet,
                        `${totalTasks} tâche(s)`,
                        `${completedTasks} Term. · ${inProgressTasks} En cours · ${blockedTasks} Bloq.`,
                        `${delayedTasksCount} écart(s)`,
                        `${Math.min(100, progressPct + 25)}%`,
                        budgetGlobalFormatted
                      ]
                    ]
            }
          },
          {
            heading: '1.3 TABLEAU DE DÉBLOCAGE DES ACTIVITÉS EN ALERTE OU EN GLISSEMENT CALENDAIRE (KANBAN / SUIVI)',
            table: {
              headers: [
                'Code (9%)',
                'Projet & Activité en Alerte / Prioritaire (27%)',
                'Responsable RACI-R (16%)',
                'Statut Actuel (14%)',
                'Écart Début / Fin (17%)',
                `Enveloppe (${currency}) (17%)`
              ],
              columnWidths: [9, 27, 16, 14, 17, 17],
              rightAlignCols: [5],
              rows:
                bottleneckRows.length > 0
                  ? bottleneckRows
                  : [
                      [
                        'RAS-01',
                        `Aucune tâche bloquée ni en retard sur « ${nomDuProjet} » — Exécution nominale du chemin critique (${criticalSequence})`,
                        leadActorName,
                        'Nominal (0 blocage)',
                        'Écart : 0j (Conforme)',
                        budgetGlobalFormatted
                      ]
                    ]
            }
          }
        ]
      },
      // PAGE 3 / 6
      {
        pageTitle: `PAGE 3 — SECTION 2 : PLANNING OPÉRATIONNEL MOIS PAR MOIS (GANTT TRIMESTRIEL — MATRICE M2)`,
        pageSubtitle: `Protocole Catégorie B (Page 3/6) · Section 2 · Activités de Proximité (Verbes d’action) sur ${m1Label}, ${m2Label} et ${m3Label}`,
        sections: [
          {
            heading: `2. PLANNING OPÉRATIONNEL MOIS PAR MOIS DU TRIMESTRE ${selectedQ} (GANTT TRIMESTRIEL — MATRICE M2)`,
            paragraphs: [fields.methodologyApproach].filter(Boolean),
            table: {
              headers: [
                'Code Act. (9%)',
                "Activités & Sous-activités de Proximité (Verbe d'action) (27%)",
                'Responsable & Associés (18%)',
                `${m1Label} (10%)`,
                `${m2Label} (10%)`,
                `${m3Label} (10%)`,
                'Indicateur & Livrable Attendu à M3 (16%)'
              ],
              columnWidths: [9, 27, 18, 10, 10, 10, 16],
              rows: pttMonthlyGanttRows
            }
          }
        ]
      },
      // PAGE 4 / 6
      {
        pageTitle: `PAGE 4 — SECTION 3 : BUDGET OPÉRATIONNEL & PLAN DE TRÉSORERIE TRIMESTRIEL (MATRICE M5)`,
        pageSubtitle: `Protocole Catégorie B (Page 4/6) · Section 3 · Besoins Réels en Liquidités (Cash-Flow à 90 jours : Mois 1, Mois 2, Mois 3)`,
        sections: [
          {
            heading: `3. BUDGET OPÉRATIONNEL & PLAN DE TRÉSORERIE TRIMESTRIEL (${selectedQ} — MATRICE M5)`,
            paragraphs: [fields.extraField1 || ''].filter(Boolean),
            table: {
              headers: [
                'Code Act. (8%)',
                "Intitulé de l'Activité (18%)",
                'Besoins réels en dépenses (Rubriques) (20%)',
                'Source (12%)',
                `Besoin ${m1Label} (10%)`,
                `Besoin ${m2Label} (10%)`,
                `Besoin ${m3Label} (10%)`,
                'Total Décaissement Trimestre (12%)'
              ],
              columnWidths: [8, 18, 20, 12, 10, 10, 10, 12],
              rightAlignCols: [4, 5, 6, 7],
              rows: [...pttCashflowRows, totalCashRow]
            }
          }
        ]
      },
      // PAGE 5 / 6
      {
        pageTitle: `PAGE 5 — SECTION 4 : MATRICE RACI TRIMESTRIELLE D’ÉQUIPE (M3) & LIVRABLES À 90 JOURS (M9)`,
        pageSubtitle: `Protocole Catégorie B (Page 5/6) · Section 4 · Grille RACI d’Équipe (R, A, C/Néant, I/Néant) & Livrables Attendus sur 3 Mois`,
        sections: [
          {
            heading: '4.1 MATRICE RACI TRIMESTRIELLE D’ÉQUIPE (MATRICE M3 — LÉGENDE : R = RÉALISE, A = APPROUVE, C = CONSULTÉ / NÉANT, I = INFORMÉ / NÉANT)',
            paragraphs: [fields.governanceModalities].filter(Boolean),
            table: {
              headers: [
                'Activités du Trimestre (24%)',
                'Chef de Projet / Coordonnateur (16%)',
                'Responsable S&E (15%)',
                'Spécialiste Passation (15%)',
                'Comptable / RAF (15%)',
                'Consultant / Prestataire (15%)'
              ],
              columnWidths: [24, 16, 15, 15, 15, 15],
              rows: pttTeamRaciRows
            }
          },
          {
            heading: `4.2 LISTE DES LIVRABLES OPÉRATIONNELS ATTENDUS À 90 JOURS (${selectedQ} — MATRICE M9)`,
            paragraphs: [fields.confidentialityClauses].filter(Boolean),
            table: m9Table
          }
        ]
      },
      // PAGE 6 / 6
      {
        pageTitle: `PAGE 6 — SECTION 5 : GESTION DES RISQUES IMMÉDIATS, CONTRAINTES LOGISTIQUES (M7) & SIGNATURES`,
        pageSubtitle: `Protocole Catégorie B (Page 6/6) · Section 5 · Parades Opérationnelles à Court Terme & Validation UGP / Suivi-Évaluation`,
        isSignaturePage: true,
        orgStampDataUrl: fields.orgStampDataUrl,
        partnerStampDataUrl: fields.partnerStampDataUrl,
        sections: [
          {
            heading: `5. GESTION DES RISQUES IMMÉDIATS À 90 JOURS, CONTRAINTES LOGISTIQUES & ACTIONS CORRECTIVES (MATRICE M7)`,
            paragraphs: [fields.recommendationsLessons].filter(Boolean),
            table: m7Table
          }
        ]
      }
    ];
  }

  // ============================================================================
  // CATÉGORIE C : RAPPORTS LOURDS INSTITUTIONNELS (10 PAGES A4)
  // (cadrage, demarrage, cap, mi_parcours, rapport_final)
  // Pages Liminaires 1 à 6 + Corps Spécifique Pages 7 à 9 + Annexes Page 10
  // ============================================================================

  const getCategoryCTocRows = (): string[][] => {
    switch (docType) {
      case 'cadrage':
        return [
          ['1.', 'Introduction, Diagnostic Initial et Analyse de la Problématique', '1.1 Rappel du mandat ; 1.2 Arbre à problèmes ; 1.3 Alignement stratégique', 'Page 7'],
          ['2.', 'Reconstitution de la Théorie du Changement (TdC) et Chaîne GAR', '2.1 Modèle causal Intrants -> Activités -> Extrants -> Effets -> Impact', 'Page 7'],
          ['3.', 'Périmètre Théorique vs Réel, Évaluabilité et Structure WBS / PTBA', '3.1 Analyse de faisabilité ; 3.2 Découpage analytique WBS et budget Baseline', 'Page 7'],
          ['4.', 'Architecture de Gouvernance, Organigramme et Matrice RACI', '4.1 Rôle du COPIL et de l’UGP ; 4.2 Matrice RACI complète par activité', 'Page 8'],
          ['5.', 'Procédures Fiduciaires, Passation des Marchés et Assurance Qualité', '5.1 Circuit d’engagement financier ; 5.2 Contrôle qualité des livrables', 'Page 8'],
          ['6.', 'Modélisation du Réseau PERT/CPM, Chemin Critique et Marges', '6.1 Calcul ES/EF/LS/LF ; 6.2 Sécurisation des tâches à marge nulle', 'Page 9'],
          ['7.', 'Baseline du Suivi Opérationnel et Conditions Préalables au Lancement', '7.1 État initial des activités ; 7.2 Prérequis techniques et institutionnels', 'Page 9'],
          ['8.', 'Annexes Obligatoires : Cadre Logique 4x4, Board RAID & Approbation', '8.1 Matrice du Cadre Logique ; 8.2 Registre des risques RAID ; 8.3 Signatures', 'Page 10']
        ];
      case 'demarrage':
        return [
          ['1.', 'Rappel du Contexte et Bilan de la Phase de Mobilisation (Kick-Off)', '1.1 Installation de l’équipe ; 1.2 Disponibilité des locaux et ressources', 'Page 7'],
          ['2.', 'Conclusions de la Revue Documentaire Initiale et Ajustements', '2.1 Analyse critique de la base documentaire ; 2.2 Ajustements retenus', 'Page 7'],
          ['3.', 'Validation Définitive des Outils de Collecte et Plan de Déploiement', '3.1 Instruments quantitatifs et qualitatifs ; 3.2 Planification WBS/PTBA', 'Page 7'],
          ['4.', 'Dispositif de Gouvernance Opérationnelle et Matrice RACI de Démarrage', '4.1 Coordination terrain ; 4.2 Attribution des rôles R-A-C-I par tâche', 'Page 8'],
          ['5.', 'Plan de Communication, de Reporting et Sécurité des Données', '5.1 Circuit de validation des livrables ; 5.2 Protocole d’archivage', 'Page 8'],
          ['6.', 'Chronogramme d’Exécution Actualisé (Gantt/PERT) et Chemin Critique', '6.1 Séquence critique actualisée ; 6.2 Analyse des marges opérationnelles', 'Page 9'],
          ['7.', 'Point d’Exécution Initial et Plan d’Urgence (Contingency Plan)', '7.1 Suivi des premières tâches ; 7.2 Levée des contraintes de démarrage', 'Page 9'],
          ['8.', 'Annexes Obligatoires : Cadre Logique 4x4, Board RAID & Signatures', '8.1 Cadre de résultats ; 8.2 Risques initiaux RAID ; 8.3 PV de lancement', 'Page 10']
        ];
      case 'cap':
        return [
          ['1.', 'Constatations Factuelles sur l’Exécution Physique et Calendaire', '1.1 Faits saillants de la période ; 1.2 Bilan des livrables réceptionnés', 'Page 7'],
          ['2.', 'Analyse Causale des Écarts (Début/Fin) et Goulots d’Étranglement', '2.1 Diagnostic des retards ; 2.2 Impact sur la séquence critique PERT', 'Page 7'],
          ['3.', 'Suivi Détaillé du Plan de Travail et Budget Annuel (PTBA) par Activité', '3.1 Crédits alloués par phase ; 3.2 État des engagements par tâche', 'Page 7'],
          ['4.', 'Exécution Budgétaire et Financière Consolidée (PTBA vs Décaissement)', '4.1 Taux d’absorption par projet ; 4.2 Analyse de la valeur acquise', 'Page 8'],
          ['5.', 'Audit de la Gouvernance Opérationnelle et Respect de la Matrice RACI', '5.1 Réactivité des circuits d’approbation ; 5.2 Responsabilités RACI', 'Page 8'],
          ['6.', 'Analyse Dynamique du Réseau PERT/CPM et Tâches sous Tension', '6.1 État des marges libres et totales ; 6.2 Protection du chemin critique', 'Page 9'],
          ['7.', 'Prescriptions Correctives CAP et Décisions d’Arbitrage Soumises au COPIL', '7.1 Plan de rattrapage chiffré ; 7.2 Suivi individuel des écarts', 'Page 9'],
          ['8.', 'Annexes Obligatoires : Cadre Logique 4x4, Board RAID, Images du Terrain & Signatures', '8.1 Cadre de performance ; 8.2 Registre RAID actualisé ; 8.3 Annexe photographique terrain & descriptifs ; 8.4 Visa Contrôle', 'Page 10']
        ];
      case 'mi_parcours':
        return [
          ['1.', 'Contexte de la Revue à Mi-Parcours et Rappel de la Théorie du Changement', '1.1 Justification à mi-étape ; 1.2 Validité de la logique causale TdC', 'Page 7'],
          ['2.', 'Méthodologie d’Évaluation à Mi-Parcours et Triangulation des Preuves', '2.1 Approche mixte UNEG/OCDE-CAD ; 2.2 Limites et contrôle qualité', 'Page 7'],
          ['3.', 'Analyse de la Performance selon les 6 Critères OCDE/CAD à Mi-Étape', '3.1 Pertinence & Cohérence ; 3.2 Efficacité, Efficience, Impact & Viabilité', 'Page 7'],
          ['4.', 'Audit de la Gouvernance RACI, de la Gestion Fiduciaire et du Système S&E', '4.1 Performance du pilotage ; 4.2 Matrice RACI et exécution budgétaire', 'Page 8'],
          ['5.', 'Vérification des Livrables Produits à Mi-Parcours et Rythme de Décaissement', '5.1 État des livrables par projet ; 5.2 Analyse Coût-Efficacité', 'Page 8'],
          ['6.', 'Analyse du Chemin Critique Résiduel (PERT/CPM) pour la Seconde Moitié', '6.1 Marges disponibles ; 6.2 Réaménagement calendaire des phases', 'Page 9'],
          ['7.', 'Leçons Apprises et Plan d’Action de Réorientation (Réponse Managériale)', '7.1 Recommandations priorisées ; 7.2 Suivi des écarts à résorber', 'Page 9'],
          ['8.', 'Annexes Obligatoires : Cadre Logique Révisé, Board RAID, Images du Terrain & Signatures', '8.1 Cadre Logique 4x4 ; 8.2 Risques de 2nde phase ; 8.3 Annexe photographique terrain & descriptifs ; 8.4 Approbation MTR', 'Page 10']
        ];
      default: // rapport_final
        return [
          ['1.', 'Synthèse Rétrospective du Projet et Historique de la Logique d’Intervention', '1.1 Genèse et évolutions ; 1.2 Rappel de la Théorie du Changement', 'Page 7'],
          ['2.', 'Méthodologie de l’Évaluation Finale (ICR / Terminal Evaluation)', '2.1 Triangulation sommative UNEG ; 2.2 Fiabilité des données de clôture', 'Page 7'],
          ['3.', 'Bilan Définitif par Critère OCDE/CAD (Pertinence, Cohérence, Efficacité, Efficience)', '3.1 Notation finale 1 à 5 ; 3.2 Comparaison finale Prévu vs Réalisé', 'Page 7'],
          ['4.', 'Bilan Financier Définitif, Clôture du PTBA et Audit Fiduciaire', '4.1 Exécution budgétaire finale par projet ; 4.2 Coût-efficacité global', 'Page 8'],
          ['5.', 'Analyse des Impacts à Long Terme, Durabilité et Stratégie de Sortie', '5.1 Changements systémiques ; 5.2 Passation des acquis et RACI de transfert', 'Page 8'],
          ['6.', 'Bilan Rétrospectif de l’Ordonnancement PERT/CPM et des Livrables Réceptionnés', '6.1 Performance calendaire finale ; 6.2 Inventaire des livrables validés', 'Page 9'],
          ['7.', 'Capitalisation des Bonnes Pratiques, Leçons Apprises et Recommandations', '7.1 Enseignements stratégiques ; 7.2 Clôture des écarts opérationnels', 'Page 9'],
          ['8.', 'Annexes Obligatoires : Cadre Logique Final, Board RAID, Images du Terrain & Quitus Définitif', '8.1 Bilan du Cadre Logique 4x4 ; 8.2 Risques résiduels ; 8.3 Annexe photographique terrain & descriptifs ; 8.4 Quitus signé', 'Page 10']
        ];
    }
  };

  // PAGE 1 (CATÉGORIE C) : PAGE DE GARDE OFFICIELLE
  const page1CoverC: StructuredA4Page = {
    pageTitle: `PAGE 1 — PAGE DE GARDE OFFICIELLE`,
    pageSubtitle: `Protocole Catégorie C · ${cfg.officialTitle} · Réf. ${fields.referenceCode}`,
    sections: [
      {
        heading: 'CHARTE OFFICIELLE DE PAGE DE GARDE (STANDARDS INTERNATIONAUX PNUD / BM / UE / ISO 21500)',
        coverChart: coverChartBlock
      },
      {
        heading: 'CARTOUCHE D’IDENTIFICATION INSTITUTIONNELLE DU PORTEFEUILLE',
        keyValueRows: [
          ['Intitulé Officiel de l’Intervention', nomDuProjet],
          ['Type de Document & Catégorie Normative', `${cfg.selectLabel} — Protocole Institutionnel Complet (Catégorie C)`],
          ['Code / Référence Documentaire', fields.referenceCode || 'REF-FAAB-2026'],
          ['Organisation Commanditaire / Agence d’Exécution', organisationCommanditaire],
          ['Bailleur(s) de Fonds / Partenaire(s) Cible(s)', bailleurDeFonds],
          ['Autorité / Expert Signataire', `${userProfile.fullName} — ${userProfile.role} (${userProfile.email})`],
          ['Budget Global Consolidé', `${budgetGlobalFormatted} (${totalTasks} activités & jalons sur ${(dossier.axes || []).length} axe(s))`],
          ['Référentiels Normatifs Appliqués', cfg.normativeReference]
        ]
      }
    ]
  };

  // PAGE 2 (CATÉGORIE C) : FICHE SIGNALÉTIQUE & CONTRÔLE DU CYCLE DE VIE
  const page2ControlC: StructuredA4Page = {
    pageTitle: `PAGE 2 — FICHE SIGNALÉTIQUE & CONTRÔLE DU DOCUMENT`,
    pageSubtitle: `Cycle de Vie Documentaire, Historique des Révisions & Paramètres Dynamiques · ${fields.referenceCode}`,
    sections: [
      {
        heading: '2.1 FICHE SIGNALÉTIQUE DES VARIABLES STRUCTURANTES DU PROJET',
        keyValueRows: ficheSignaletiqueKeyValues
      },
      {
        heading: '2.2 CYCLE DE VIE DU DOCUMENT, AUTEURS, VALIDATEURS & HISTORIQUE DES RÉVISIONS',
        table: {
          headers: [
            'Version (12%)',
            'Date (14%)',
            'Auteur / Rédacteur (22%)',
            'Instance de Validation (24%)',
            'Statut & Modifications Majeures (28%)'
          ],
          columnWidths: [12, 14, 22, 24, 28],
          rows: [
            [
              'v0.1 (Draft)',
              todayISO,
              `${userProfile.fullName} (${userProfile.role})`,
              'Cellule Technique PMO & Suivi-Évaluation (S&E)',
              'Initialisation de la structure normative et extraction de la base de données.'
            ],
            [
              'v0.9 (Revue)',
              todayISO,
              `${userProfile.fullName} & Équipe Projet`,
              `Groupe de Référence / ${fields.recipientOrg || 'Comité Technique'}`,
              'Intégration des calculs PERT/CPM, de la matrice RACI et du Cadre Logique 4x4.'
            ],
            [
              'v1.0 (Final)',
              dateStr,
              `${userProfile.fullName} (${organisationCommanditaire})`,
              `Comité de Pilotage (COPIL) / ${fields.recipientRepresentative || 'Autorité Compétente'}`,
              'Version officielle consolidée et approuvée pour diffusion et exécution.'
            ]
          ]
        }
      },
      {
        heading: '2.3 LISTE DE DIFFUSION & CONTRÔLE D’ASSURANCE QUALITÉ',
        paragraphs: [
          `Le présent rapport institutionnel (Réf. ${fields.referenceCode}) est établi conformément aux standards ${cfg.normativeReference}. Toute révision de la ligne de référence (Baseline calendaire, budgétaire ou périmètre WBS) fait l’objet d’une traçabilité stricte approuvée en Comité de Pilotage.`
        ]
      }
    ]
  };

  // PAGE 3 (CATÉGORIE C) : SOMMAIRE & TABLE DES MATIÈRES HIÉRARCHISÉE
  const page3TocC: StructuredA4Page = {
    pageTitle: `PAGE 3 — SOMMAIRE & TABLE DES MATIÈRES HIÉRARCHISÉE`,
    pageSubtitle: `Architecture Documentaire Normée (1., 1.1., 1.1.1.) · ${cfg.officialTitle}`,
    sections: [
      {
        heading: '3.1 PROTOCOLE DES PAGES LIMINAIRES OBLIGATOIRES (CATÉGORIE C)',
        table: {
          headers: ['Page (12%)', 'Intitulé de la Page Liminaire (34%)', 'Contenu Normatif & Standards Appliqués (42%)', 'Folio (12%)'],
          columnWidths: [12, 34, 42, 12],
          rows: [
            ['PAGE 1', 'Page de Garde Officielle', 'Charte d’emplacement des logos, bannière, titre, code projet, structure, zone et statut.', 'Page 1'],
            ['PAGE 2', 'Fiche Signalétique & Contrôle des Révisions', 'Variables clés du projet, cycle de vie documentaire, auteurs, validateurs et versions.', 'Page 2'],
            ['PAGE 3', 'Sommaire / Table des Matières Hiérarchisée', 'Plan directeur du rapport avec numérotation hiérarchique (1., 1.1, 1.1.1...).', 'Page 3'],
            ['PAGE 4', 'Liste des Tableaux & Liste des Figures / Graphiques', 'Répertoire exhaustif des matrices analytiques et des visualisations du rapport.', 'Page 4'],
            ['PAGE 5', 'Liste Officielle des Sigles et Acronymes', 'Glossaire normatif international (GAR, OCDE/CAD, UNEG, PMBOK, PERT/CPM, WBS, RACI, RAID).', 'Page 5'],
            ['PAGE 6', 'Résumé Exécutif / Note de Synthèse Décisionnelle', 'Synthèse managériale pour décideurs, tableau de bord KPIs et alertes prioritaires.', 'Page 6']
          ]
        }
      },
      {
        heading: `3.2 CORPS DU RAPPORT & ANNEXES — PROTOCOLE SPÉCIFIQUE (${cfg.officialTitle})`,
        table: {
          headers: ['N° (8%)', 'Intitulé de la Section Thématique (40%)', 'Sous-sections Hiérarchiques (40%)', 'Folio (12%)'],
          columnWidths: [8, 40, 40, 12],
          rows: getCategoryCTocRows()
        }
      }
    ]
  };

  // PAGE 4 (CATÉGORIE C) : LISTE DES TABLEAUX & LISTE DES FIGURES / GRAPHIQUES
  const page4ListsC: StructuredA4Page = {
    pageTitle: `PAGE 4 — LISTE DES TABLEAUX & LISTE DES FIGURES`,
    pageSubtitle: `Répertoire des Matrices Fermées (avec Ratios de Colonnes) & Schémas Analytiques`,
    sections: [
      {
        heading: '4.1 LISTE OFFICIELLE DES TABLEAUX ET MATRICES DU RAPPORT',
        table: {
          headers: ['Réf. (14%)', 'Intitulé Complet du Tableau / Matrice (46%)', 'Source / Méthode (26%)', 'Emplacement (14%)'],
          columnWidths: [14, 46, 26, 14],
          rows: [
            ['Tableau 1', 'Fiche Signalétique & Historique du Cycle de Vie Documentaire', 'Métadonnées PMO & Contrôle Qualité', 'Page 2'],
            ['Tableau 2', 'Tableau de Bord Exécutif Consolidé par Axe et Projet Opérationnel', 'Consolidation GAR & Kanban', 'Page 6'],
            ['Tableau 3', 'Matrice des Goulots d’Étranglement et Alertes d’Écarts Calendaires', 'Module Suivi & Tableau de Bord', 'Page 6'],
            ['Tableau 4', 'Planification Analytique WBS, PTBA et Allocation Budgétaire par Activité', 'Onglet Planification & PTBA', 'Page 7'],
            ['Tableau 5', 'Exécution Financière Consolidée (Budget Initial vs Décaissement & Solde)', 'Contrôle Budgétaire & Valeur Acquise', 'Page 8'],
            ['Tableau 6', 'Matrice des Responsabilités Opérationnelles et Décisionnelles (RACI)', 'Onglet RACI du Dossier Actif', 'Page 8'],
            ['Tableau 7', 'Ordonnancement du Réseau PERT/CPM, Dates ES/EF/LS/LF et Marges', 'Moteur Algorithmique PERT/CPM', 'Page 9'],
            ['Tableau 8', 'Suivi Individuel de l’Exécution Physique, Livrables et Écarts Début/Fin', 'Onglet Suivi des Tâches', 'Page 9'],
            ['Tableau 9', 'Matrice du Cadre Logique 4x4 (Impact, Effets, Extrants, Activités & IOV)', 'Ingénierie GAR & TdC', 'Page 10'],
            ['Tableau 10', 'Registre des Risques Stratégiques et Opérationnels (Board RAID)', 'Gestion des Risques ISO 31000', 'Page 10']
          ]
        }
      },
      {
        heading: '4.2 LISTE DES FIGURES, DIAGRAMMES & VISUALISATIONS DE RÉFÉRENCE',
        bullets: [
          'Figure 1.1 — Charte Visuelle d’Emplacement des Logos, Bannière et Cartouche Officiel (Page 1).',
          'Figure 2.1 — Diagramme de la Théorie du Changement (TdC) : Chaîne causale Intrants -> Activités -> Extrants -> Effets directs -> Impact durable (Page 7).',
          `Figure 3.1 — Graphe du Réseau PERT/CPM et Séquence du Chemin Critique (${criticalSequence}) sur une durée minimale de ${maxProjectDuration} jours ouvrés (Page 9).`,
          `Figure 4.1 — Courbe d’Exécution Financière (${financialExecutionPct}% engagé sur ${budgetGlobalFormatted}) et d’Avancement Physique (${progressPct}%) par Axe Stratégique (Page 8).`
        ],
        ...(fields.figureImageDataUrl
          ? {
              figureImage: {
                dataUrl: fields.figureImageDataUrl,
                caption: `Figure Illustrative Officielle — ${nomDuProjet} (${cfg.selectLabel})`
              }
            }
          : {})
      }
    ]
  };

  // PAGE 5 (CATÉGORIE C) : LISTE OFFICIELLE DES SIGLES ET ACRONYMES
  const page5AcronymsC: StructuredA4Page = {
    pageTitle: `PAGE 5 — LISTE OFFICIELLE DES SIGLES ET ACRONYMES`,
    pageSubtitle: `Référentiel Terminologique International (PNUD, OCDE/CAD, UNEG, PMBOK 7, ISO 21500, PERT/CPM)`,
    sections: [
      {
        heading: '5.1 TABLEAU NORMALISÉ DES SIGLES, ACRONYMES ET ABRÉVIATIONS',
        table: {
          headers: [
            'Sigle / Acronyme (18%)',
            'Signification Complète (FR / EN) (34%)',
            'Définition Opérationnelle & Normative dans le Rapport (48%)'
          ],
          columnWidths: [18, 34, 48],
          rows: INTERNATIONAL_ACRONYMS_TABLE
        }
      }
    ]
  };

  // PAGE 6 (CATÉGORIE C) : RÉSUMÉ EXÉCUTIF / NOTE DE SYNTHÈSE DÉCISIONNELLE
  const page6ExecutiveSummaryC: StructuredA4Page = {
    pageTitle: `PAGE 6 — RÉSUMÉ EXÉCUTIF / NOTE DE SYNTHÈSE DÉCISIONNELLE`,
    pageSubtitle: `Synthèse Managériale, Indicateurs Clés (KPIs), Tableau de Bord par Projet & Alertes · ${nomDuProjet}`,
    sections: [
      {
        heading: '6.1 NOTE DE SYNTHÈSE MANAGÉRIALE & VISION D’ENSEMBLE',
        paragraphs: [
          `6.1.1 Contexte et Portée : Le présent rapport (« ${cfg.officialTitle} », réf. ${fields.referenceCode}) constitue l’instrument officiel de gouvernance, de redevabilité et d’aide à la décision pour le portefeuille « ${nomDuProjet} », conduit par ${organisationCommanditaire} sous la responsabilité de ${userProfile.fullName} (${userProfile.role}) à destination de ${bailleurDeFonds}.`,
          `6.1.2 Justification et Alignement : ${fields.contextJustification}`,
          `6.1.3 Objectifs Stratégiques et Opérationnels : ${fields.specificObjectives}`
        ],
        bullets: [
          `Architecture du portefeuille (Onglet Dossiers & Projets) : ${(dossier.axes || []).length} Axe(s) stratégique(s), ${pertSummaries.length} Projet(s) opérationnel(s) et ${totalTasks} activités/jalons élémentaires.`,
          `Enveloppe financière globale programmée (Onglet Planification) : ${budgetGlobalFormatted} (Montant engagé/absorbé estimé à ${committedBudgetFormatted} soit ${financialExecutionPct}% ; Solde disponible : ${remainingBudgetFormatted}).`,
          `Répartition Kanban & Suivi (Onglets Kanban & Suivi des tâches) : ${progressPct}% de réalisation globale (${completedTasks} Terminées, ${inProgressTasks} En cours, ${blockedTasks} Bloquées, ${todoTasks} À faire ; ${delayedTasksCount} activité(s) présentant un écart calendaire).`,
          `Ordonnancement PERT/CPM (Onglet Réseau PERT) : Durée critique incompressible de ${maxProjectDuration} jours ouvrés portée par ${criticalNodes.length} activité(s) critique(s) (${criticalSequence}).`
        ]
      },
      {
        heading: '6.2 TABLEAU DE BORD EXÉCUTIF CONSOLIDÉ PAR PROJET OPÉRATIONNEL',
        table: {
          headers: [
            'Axe & Projet Opérationnel (28%)',
            'Volume (12%)',
            'Répartition des Statuts Kanban (24%)',
            'Écarts (10%)',
            'Avanc. (10%)',
            `Budget Consolidé (16%)`
          ],
          columnWidths: [28, 12, 24, 10, 10, 16],
          rightAlignCols: [5],
          rows:
            projectDashboardRows.length > 0
              ? projectDashboardRows
              : [['Aucun projet enregistré', '0', '—', '0', '0%', formatDocAmount(0, currency, lang)]]
        }
      },
      {
        heading: '6.3 GOULOTS D’ÉTRANGLEMENT, ALERTES D’ÉCARTS & ORIENTATIONS PRIORITAIRES',
        paragraphs: [
          `6.3.1 Approche Méthodologique Retenue : ${fields.methodologyApproach}`,
          `6.3.2 Décisions et Prescriptions Prioritaires : ${fields.recommendationsLessons}`
        ],
        ...(bottleneckRows.length > 0
          ? {
              table: {
                headers: [
                  'Code (9%)',
                  'Projet & Activité en Alerte (27%)',
                  'Responsable (15%)',
                  'Statut (13%)',
                  'Écarts Début / Fin (20%)',
                  `Budget Enjeu (16%)`
                ],
                columnWidths: [9, 27, 15, 13, 20, 16],
                rightAlignCols: [5],
                rows: bottleneckRows
              }
            }
          : {
              bullets: ['Aucun goulot d’étranglement ni écart calendaire critique détecté à date dans le Tableau de Bord Décisionnel.']
            })
      }
    ]
  };

  // ============================================================================
  // PAGES 7, 8 & 9 (CATÉGORIE C) : CORPS SPÉCIFIQUE SELON LE TYPE DE RAPPORT
  // ============================================================================
  const bodyPagesC: StructuredA4Page[] = [];

  if (docType === 'cap') {
    // PROTOCOLE SPÉCIFIQUE DOC 8 : RAPPORT D'AVANCEMENT PÉRIODIQUE (CAP)
    bodyPagesC.push({
      pageTitle: `PAGE 7 — CORPS DU RAPPORT CAP : CONSTATATIONS PHYSIQUES & ANALYSE DES ÉCARTS`,
      pageSubtitle: `Sections 1, 2 & 3 · Bilan Physique Périodique, Causes des Écarts & Exécution du PTBA par Activité`,
      sections: [
        {
          heading: '1. CONSTATATIONS FACTUELLES SUR L’EXÉCUTION PHYSIQUE ET CALENDAIRE DE LA PÉRIODE',
          paragraphs: [
            `1.1 Faits Saillants et Réalisations Physiques : ${fields.contextJustification}`,
            `1.2 Analyse Causale des Écarts et Goulots d’Étranglement : ${fields.specificObjectives}`
          ]
        },
        {
          heading: '2. PLANIFICATION OPÉRATIONNELLE WBS, GANTT, PERT & PTBA (MATRICE M2)',
          table: m2Table
        }
      ]
    });

    bodyPagesC.push({
      pageTitle: `PAGE 8 — CORPS DU RAPPORT CAP : EXÉCUTION FINANCIÈRE EVM (M5) & LIVRABLES QUALITÉ (M9)`,
      pageSubtitle: `Sections 4 & 5 · Tableau Financier EVM (BAC, EV, AC, CPI) & Validation des Livrables`,
      sections: [
        {
          heading: '3. EXÉCUTION BUDGÉTAIRE, FINANCIÈRE ET VALEUR ACQUISE EVM (MATRICE M5)',
          paragraphs: [
            `3.1 Analyse Financière et Taux d’Absorption : ${fields.methodologyApproach}`,
            `3.2 Conformité Fiduciaire et Pièces Justificatives : ${fields.confidentialityClauses}`
          ],
          table: m5Table
        },
        {
          heading: '4. CONTRÔLE QUALITÉ DES LIVRABLES ET CONDITIONNALITÉS DE VALIDATION (MATRICE M9)',
          paragraphs: [`4.1 Arbitrages Soumis au Comité de Pilotage : ${fields.governanceModalities}`],
          table: m9Table
        }
      ]
    });

    bodyPagesC.push({
      pageTitle: `PAGE 9 — CORPS DU RAPPORT CAP : CHEMIN CRITIQUE PERT & PRESCRIPTIONS CAP (M10)`,
      pageSubtitle: `Sections 6 & 7 · Surveillance des Marges PERT/CPM & Matrice du Plan d’Action Correctif (M10)`,
      sections: [
        {
          heading: '5. SURVEILLANCE DU RÉSEAU PERT/CPM ET DES MARGES OPÉRATIONNELLES',
          table: {
            headers: [
              'Code (9%)',
              'Activité / Jalon (27%)',
              'Dépendances (14%)',
              'Dates PERT Tôt/Tard (18%)',
              'Criticité & Marges (18%)',
              'Statut & Durée (14%)'
            ],
            columnWidths: [9, 27, 14, 18, 18, 14],
            rows: ganttPertRows.length > 0 ? ganttPertRows : [['—', 'Aucune activité', '—', '—', '—', '0j']]
          }
        },
        {
          heading: '6. PRESCRIPTIONS OPÉRATIONNELLES CAP & RÉPONSE MANAGÉRIALE (MATRICE M10)',
          paragraphs: [`6.1 Prescriptions Opérationnelles Chiffrées : ${fields.recommendationsLessons}`],
          table: m10Table
        }
      ]
    });
  } else if (docType === 'mi_parcours' || docType === 'rapport_final') {
    // PROTOCOLE SPÉCIFIQUE DOCS 8 & 11 : ÉVALUATION À MI-PARCOURS (MTR) & ÉVALUATION FINALE (ICR)
    const isFinal = docType === 'rapport_final';

    bodyPagesC.push({
      pageTitle: `PAGE 7 — CORPS DE L’ÉVALUATION : GRILLE DES 6 CRITÈRES OCDE/CAD (M6) & WBS (M2)`,
      pageSubtitle: `Sections 1, 2 & 3 · Contexte, Méthodologie UNEG, Matrice OCDE/CAD (M6) et Bilan Physique (M2)`,
      sections: [
        {
          heading: `1. CONTEXTE, PORTÉE ET LOGIQUE D’INTERVENTION (${isFinal ? 'ÉVALUATION FINALE ICR' : 'REVUE À MI-PARCOURS MTR'})`,
          paragraphs: [
            `1.1 Rappel de la Logique d’Intervention (TdC) : ${fields.contextJustification}`,
            `1.2 Constats Évaluatifs Majeurs : ${fields.specificObjectives}`
          ]
        },
        {
          heading: '2. GRILLE D’ÉVALUATION INTERNATIONALE SELON LES 6 CRITÈRES OCDE/CAD & UNEG (MATRICE M6)',
          table: m6Table
        },
        {
          heading: '3. BILAN D’EXÉCUTION PHYSIQUE WBS, JALONS & AVANCEMENT (MATRICE M2)',
          table: m2Table
        }
      ]
    });

    bodyPagesC.push({
      pageTitle: `PAGE 8 — CORPS DE L’ÉVALUATION : BILAN FINANCIER EVM (M5), MARCHÉS PPM (M8) & LIVRABLES (M9)`,
      pageSubtitle: `Sections 4 & 5 · Analyse Coût-Efficacité EVM, Passation des Marchés & Réception des Livrables`,
      sections: [
        {
          heading: '4. ANALYSE DE L’EFFICIENCE FINANCIÈRE ET VALEUR ACQUISE EVM (MATRICE M5)',
          paragraphs: [
            `4.1 Analyse Coût-Efficacité et Viabilité : ${fields.methodologyApproach}`,
            `4.2 Gouvernance Institutionnelle et Passation : ${fields.governanceModalities}`
          ],
          table: m5Table
        },
        {
          heading: '5. EXÉCUTION DU PLAN DE PASSATION DES MARCHÉS (MATRICE M8) & LIVRABLES VALIDÉS (MATRICE M9)',
          table: m8Table
        },
        {
          heading: '5 BIS. INVENTAIRE DES LIVRABLES CONTRACTUELS ET ASSURANCE QUALITÉ (MATRICE M9)',
          table: m9Table
        }
      ]
    });

    bodyPagesC.push({
      pageTitle: `PAGE 9 — CORPS DE L’ÉVALUATION : PARTIES PRENANTES (M4) & RÉPONSE MANAGÉRIALE (M10)`,
      pageSubtitle: `Sections 6 & 7 · Engagement des Parties Prenantes, Leçons Apprises & Matrice de Réponse Managériale`,
      sections: [
        ...(isFinal
          ? [
              {
                heading: '6. BILAN D’ENGAGEMENT DES PARTIES PRENANTES ET APPROPRIATION (MATRICE M4)',
                table: m4Table
              }
            ]
          : [
              {
                heading: '6. AUDIT DU CHEMIN CRITIQUE PERT/CPM ET DES MARGES OPÉRATIONNELLES',
                table: {
                  headers: [
                    'Code (9%)',
                    'Activité / Jalon (27%)',
                    'Dépendances (14%)',
                    'Dates PERT Tôt/Tard (18%)',
                    'Criticité & Marges (18%)',
                    'Statut & Durée (14%)'
                  ],
                  columnWidths: [9, 27, 14, 18, 18, 14],
                  rows: ganttPertRows.length > 0 ? ganttPertRows : [['—', 'Aucune activité', '—', '—', '—', '0j']]
                }
              }
            ]),
        {
          heading: '7. CAPITALISATION DES LEÇONS APPRISES ET MATRICE DE RÉPONSE MANAGÉRIALE (MATRICE M10)',
          paragraphs: [
            `7.1 Enseignements Tirés et Facteurs Explicatifs : ${fields.confidentialityClauses}`,
            `7.2 Plan d’Action des Recommandations : ${fields.recommendationsLessons}`
          ],
          table: m10Table
        }
      ]
    });
  } else {
    // PROTOCOLE SPÉCIFIQUE DOCS 5 & 6 : RAPPORT DE CADRAGE / PRODOC (`cadrage`) & RAPPORT DE DÉMARRAGE (`demarrage`)
    bodyPagesC.push({
      pageTitle: `PAGE 7 — CORPS DU RAPPORT : CADRAGE STRATÉGIQUE, TdC, WBS (M2) & BUDGET EVM (M5)`,
      pageSubtitle: `Sections 1, 2 & 3 · Contexte, Théorie du Changement (TdC), Planification WBS (M2) et Budget PTBA (M5)`,
      sections: [
        {
          heading: '1. DIAGNOSTIC INITIAL, CONTEXTE STRATÉGIQUE ET THÉORIE DU CHANGEMENT (TdC)',
          paragraphs: [
            `1.1 Diagnostic et Justification : ${fields.contextJustification}`,
            `1.2 Objectifs et Chaîne de Résultats (GAR) : ${fields.specificObjectives}`,
            `1.3 Hypothèse Causale (Théorie du Changement) : Si l’enveloppe budgétaire de ${budgetGlobalFormatted} et les équipes techniques sont mobilisées selon l’ordonnancement PERT/CPM (${maxProjectDuration} jours ouvrés), ALORS les ${totalTasks} activités et jalons livreront les extrants prévus sur les ${(dossier.axes || []).length} axe(s) stratégique(s), CE QUI générera les effets directs et l’impact durable visés à l’horizon ${dossier.horizonPlan}.`
          ]
        },
        {
          heading: '2. PLANIFICATION OPÉRATIONNELLE WBS, CHRONOGRAMME GANTT & CHEMIN CRITIQUE PERT (MATRICE M2)',
          table: m2Table
        },
        {
          heading: '3. BUDGET ANALYTIQUE PTBA & LIGNE DE RÉFÉRENCE FINANCIÈRE EVM (MATRICE M5)',
          table: m5Table
        }
      ]
    });

    bodyPagesC.push({
      pageTitle: `PAGE 8 — CORPS DU RAPPORT : GOUVERNANCE RACI & RH (M3) ET PARTIES PRENANTES (M4)`,
      pageSubtitle: `Sections 4 & 5 · Démarche en 5 Phases Normées, Matrice RACI/Experts (M3) & Parties Prenantes (M4)`,
      sections: [
        {
          heading: '4. APPROCHE MÉTHODOLOGIQUE, GOUVERNANCE RACI & RESSOURCES HUMAINES (MATRICE M3)',
          paragraphs: [
            `4.1 Approche Méthodologique et Outils : ${fields.methodologyApproach}`,
            `4.2 Gouvernance Institutionnelle (COPIL, Comité Technique, UGP) : ${fields.governanceModalities}`,
            `4.3 Conformité Fiduciaire, Éthique et Sécurité des Données : ${fields.confidentialityClauses}`
          ],
          table: m3Table
        },
        {
          heading: '5. CARTOGRAPHIE DES PARTIES PRENANTES, ENGAGEMENT & COMMUNICATION (MATRICE M4)',
          table: m4Table
        }
      ]
    });

    bodyPagesC.push({
      pageTitle: `PAGE 9 — CORPS DU RAPPORT : LIVRABLES & QUALITÉ (M9)${docType === 'cadrage' ? ' + MARCHÉS PPM (M8)' : ' + RÉSEAU PERT'}`,
      pageSubtitle: `Sections 6 & 7 · Assurance Qualité des Livrables (M9) et Passation des Marchés / Ordonnancement`,
      sections: [
        {
          heading: '6. LIVRABLES CONTRACTUELS, ASSURANCE QUALITÉ & CRITÈRES D’ACCEPTATION (MATRICE M9)',
          paragraphs: [`6.1 Prescriptions et Points de Vigilance : ${fields.recommendationsLessons}`],
          table: m9Table
        },
        ...(docType === 'cadrage'
          ? [
              {
                heading: '7. PLAN DE PASSATION DES MARCHÉS (PPM) & ACQUISITIONS LOGISTIQUES (MATRICE M8)',
                table: m8Table
              }
            ]
          : [
              {
                heading: '7. MODÉLISATION DU RÉSEAU PERT/CPM ET ANALYSE DU CHEMIN CRITIQUE',
                table: {
                  headers: [
                    'Code (9%)',
                    'Activité / Jalon (27%)',
                    'Dépendances (14%)',
                    'Dates PERT Tôt/Tard (18%)',
                    'Criticité & Marges (18%)',
                    'Statut & Durée (14%)'
                  ],
                  columnWidths: [9, 27, 14, 18, 18, 14],
                  rows: ganttPertRows.length > 0 ? ganttPertRows : [['—', 'Aucune activité', '—', '—', '—', '0j']]
                }
              }
            ])
      ]
    });
  }

  // PAGE 10 (CATÉGORIE C) : ANNEXES OBLIGATOIRES (CADRE LOGIQUE M1, RISQUES RAID M7, IMAGES DE TERRAIN) & APPROBATION OFFICIELLE
  const activeDocMatrixIds = DOC_TO_MATRICES_MAP[docType] || [];
  const lastPageNumC = 6 + bodyPagesC.length + 1;
  const parsedFieldPhotos = parseFieldPhotos(fields.fieldPhotosJson);
  const hasFieldPhotosSection = parsedFieldPhotos.length > 0;
  const resolvedAnnexTitle =
    (fields.fieldPhotosAnnexTitle || '').trim() ||
    (docType === 'cap'
      ? 'ANNEXE 3 — REPORTAGE PHOTOGRAPHIQUE & CONSTATS VISUELS DE TERRAIN (CONTRÔLE D’AVANCEMENT PÉRIODIQUE)'
      : docType === 'mi_parcours'
      ? 'ANNEXE 3 — DOCUMENTATION PHOTOGRAPHIQUE DE TERRAIN & PREUVES VISUELLES (ÉVALUATION À MI-PARCOURS & ANNUELLE)'
      : 'ANNEXE 3 — ALBUM PHOTOGRAPHIQUE DES RÉALISATIONS DE TERRAIN & IMPACTS VISUELS (ÉVALUATION ANNUELLE & FINALE)');

  const pageAnnexesC: StructuredA4Page = {
    pageTitle: `PAGE ${lastPageNumC} — ANNEXES OBLIGATOIRES (${activeDocMatrixIds.join(', ')}) & APPROBATION OFFICIELLE`,
    pageSubtitle: hasFieldPhotosSection
      ? `Matrice du Cadre Logique (M1), Registre des Risques Board RAID (M7), Illustrations de Terrain & Bloc de Signatures`
      : `Matrice du Cadre Logique (M1), Registre des Risques Board RAID (M7) & Bloc de Signatures Officielles`,
    isSignaturePage: true,
    orgStampDataUrl: fields.orgStampDataUrl,
    partnerStampDataUrl: fields.partnerStampDataUrl,
    sections: [
      {
        heading: `ANNEXE 1 — ${getMatrixDefinition('M1').fullTitle}`,
        table: logframeTable
      },
      {
        heading: `ANNEXE 2 — ${getMatrixDefinition('M7').fullTitle}`,
        table: raidTable
      },
      ...(hasFieldPhotosSection
        ? [
            {
              heading: resolvedAnnexTitle,
              fieldPhotosAnnex: {
                annexTitle: resolvedAnnexTitle,
                photos: parsedFieldPhotos
              }
            }
          ]
        : [])
    ]
  };

  return [
    page1CoverC,
    page2ControlC,
    page3TocC,
    page4ListsC,
    page5AcronymsC,
    page6ExecutiveSummaryC,
    ...bodyPagesC,
    pageAnnexesC
  ];
}

const SENTINEL_REGEX = /__EXCLUDED_FIELD_[a-zA-Z0-9_]+__/g;
const HELPER_PLACEHOLDER_REGEX =
  /\[(?:LOGO[^\]]*|BANNIÈRE[^\]]*|NOM DE LA STRUCTURE[^\]]*|ZONE GÉOGRAPHIQUE[^\]]*|DATES & VERSION[^\]]*|STATUS[^\]]*|IMAGE_[^\]]*|EMPLACEMENT[^\]]*)\]|\(Aligné en haut à (?:gauche|droite)\)|\(H:\s*1\.5\s*cm\)/gi;

function hasSentinelToken(str?: string): boolean {
  if (!str) return false;
  return /__EXCLUDED_FIELD_[a-zA-Z0-9_]+__/.test(str);
}

function stripSentinelTokens(str?: string): string {
  if (!str) return '';
  return str
    .replace(SENTINEL_REGEX, '')
    .replace(HELPER_PLACEHOLDER_REGEX, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function isWholeSectionExcludedByField(
  docType: InstitutionalDocType,
  heading: string,
  excludedSet: Set<string>
): boolean {
  const h = heading.toUpperCase();
  if (docType === 'cv_executif') {
    if (excludedSet.has('recipientRepresentative') && h.includes('BANDEAU D’EN-TÊTE')) return true;
    if (excludedSet.has('contextJustification') && h.startsWith('1.')) return true;
    if (excludedSet.has('specificObjectives') && h.startsWith('2.')) return true;
    if (excludedSet.has('methodologyApproach') && h.startsWith('3.')) return true;
    if (excludedSet.has('governanceModalities') && h.startsWith('4.')) return true;
    if (excludedSet.has('confidentialityClauses') && h.startsWith('5.')) return true;
  }
  if (docType === 'cv_detaille') {
    if (excludedSet.has('recipientRepresentative') && h.startsWith('1. FICHE SYNOPTIQUE')) return true;
    if (excludedSet.has('contextJustification') && h.startsWith('2.')) return true;
    if (
      excludedSet.has('specificObjectives') &&
      excludedSet.has('methodologyApproach') &&
      h.startsWith('3.')
    )
      return true;
    if (excludedSet.has('extraField2') && h.startsWith('4.')) return true;
    if (excludedSet.has('extraField1') && h.startsWith('6.1')) return true;
    if (excludedSet.has('confidentialityClauses') && h.startsWith('7.')) return true;
    if (excludedSet.has('recommendationsLessons') && (h.startsWith('9.') || h.startsWith('10.')))
      return true;
  }
  if (docType === 'pv_reunion') {
    if (excludedSet.has('recipientRepresentative') && h.startsWith('1.')) return true;
    if (excludedSet.has('governanceModalities') && h.startsWith('2.')) return true;
    if (excludedSet.has('contextJustification') && h.startsWith('3.')) return true;
    if (
      excludedSet.has('specificObjectives') &&
      excludedSet.has('methodologyApproach') &&
      h.startsWith('4.')
    )
      return true;
    if (excludedSet.has('confidentialityClauses') && h.startsWith('5. MATRICE')) return true;
    if (excludedSet.has('recommendationsLessons') && h.startsWith('6.')) return true;
  }
  if (docType === 'tdr_simplifie') {
    if (excludedSet.has('recipientRepresentative') && h.startsWith('1.')) return true;
    if (excludedSet.has('contextJustification') && h.startsWith('2.')) return true;
    if (
      excludedSet.has('specificObjectives') &&
      excludedSet.has('methodologyApproach') &&
      h.startsWith('3.')
    )
      return true;
    if (excludedSet.has('extraField1') && h.startsWith('4.')) return true;
    if (excludedSet.has('governanceModalities') && h.startsWith('5.')) return true;
    if (excludedSet.has('confidentialityClauses') && h.startsWith('6.')) return true;
    if (excludedSet.has('recommendationsLessons') && h.startsWith('7.')) return true;
  }
  if (docType === 'courrier_admin') {
    if (excludedSet.has('confidentialityClauses') && h.includes('SYNTHÈSE CHIFFRÉE')) return true;
  }
  if (docType === 'tdr') {
    if (excludedSet.has('contextJustification') && h.startsWith('1. CONTEXTE')) return true;
    if (excludedSet.has('specificObjectives') && h.startsWith('2. OBJECTIFS')) return true;
    if (excludedSet.has('methodologyApproach') && h.startsWith('3. PÉRIMÈTRE')) return true;
    if (
      excludedSet.has('recommendationsLessons') &&
      excludedSet.has('confidentialityClauses') &&
      h.startsWith('8. GRILLE')
    )
      return true;
  }
  if (docType === 'lettre_mission') {
    if (excludedSet.has('contextJustification') && h.startsWith('1. CONTEXTE')) return true;
    if (excludedSet.has('specificObjectives') && h.startsWith('2. OBJECTIFS')) return true;
    if (
      excludedSet.has('methodologyApproach') &&
      excludedSet.has('governanceModalities') &&
      excludedSet.has('confidentialityClauses') &&
      h.startsWith('3. PRÉROGATIVES')
    )
      return true;
    if (excludedSet.has('recommendationsLessons') && h.startsWith('4. FEUILLE DE ROUTE')) return true;
  }
  if (docType === 'nda') {
    if (
      excludedSet.has('contextJustification') &&
      excludedSet.has('specificObjectives') &&
      h.includes('ARTICLE 1')
    )
      return true;
    if (
      excludedSet.has('methodologyApproach') &&
      excludedSet.has('confidentialityClauses') &&
      h.startsWith('ARTICLE 3')
    )
      return true;
    if (
      excludedSet.has('governanceModalities') &&
      excludedSet.has('recommendationsLessons') &&
      h.startsWith('ARTICLE 6')
    )
      return true;
  }
  if (docType === 'note_methodo') {
    if (
      excludedSet.has('contextJustification') &&
      excludedSet.has('specificObjectives') &&
      h.startsWith('1. COMPRÉHENSION')
    )
      return true;
    if (excludedSet.has('methodologyApproach') && h.startsWith('2. ARCHITECTURE')) return true;
    if (excludedSet.has('governanceModalities') && h.startsWith('4. ORGANISATION')) return true;
    if (
      excludedSet.has('confidentialityClauses') &&
      excludedSet.has('recommendationsLessons') &&
      h.startsWith('5. DISPOSITIF')
    )
      return true;
  }
  if (docType === 'grille_evaluation') {
    if (
      excludedSet.has('contextJustification') &&
      excludedSet.has('specificObjectives') &&
      h.startsWith('1. NOTE MÉTHODOLOGIQUE')
    )
      return true;
    if (excludedSet.has('recommendationsLessons') && h.startsWith('3. GRILLE D’APPRÉCIATION'))
      return true;
    if (
      excludedSet.has('methodologyApproach') &&
      excludedSet.has('governanceModalities') &&
      excludedSet.has('confidentialityClauses') &&
      h.startsWith('5. REGISTRE')
    )
      return true;
  }
  if (docType === 'ptba') {
    if (excludedSet.has('extraField1') && h.startsWith('0.1 SOMMAIRE EXÉCUTIF')) return true;
    if (
      excludedSet.has('contextJustification') &&
      excludedSet.has('extraField2') &&
      excludedSet.has('extraField3') &&
      h.startsWith('1. CONTEXTE')
    )
      return true;
    if (excludedSet.has('specificObjectives') && h.startsWith('2. ORIENTATIONS STRATÉGIQUES'))
      return true;
    if (excludedSet.has('extraField4') && h.startsWith('3.1 DÉCLINAISON NARRATIVE')) return true;
    if (excludedSet.has('extraField5') && h.startsWith('3.2 CIBLES BÉNÉFICIAIRES')) return true;
    if (excludedSet.has('methodologyApproach') && h.startsWith('4.1 MATRICE D’ACTIVITÉS'))
      return true;
    if (excludedSet.has('extraField6') && h.startsWith('4.2 SUITE DU CHRONOGRAMME')) return true;
    if (excludedSet.has('extraField7') && h.startsWith('5.1 BUDGET ANNUEL CONSOLIDÉ')) return true;
    if (excludedSet.has('extraField8') && h.startsWith('5.2 VENTILATION BUDGÉTAIRE')) return true;
    if (excludedSet.has('extraField9') && h.startsWith('6. PLAN DE DÉCAISSEMENT')) return true;
    if (excludedSet.has('extraField10') && h.startsWith('7. PLAN ANNUEL DE PASSATION')) return true;
    if (excludedSet.has('governanceModalities') && h.startsWith('8. GOUVERNANCE RACI')) return true;
    if (excludedSet.has('confidentialityClauses') && h.startsWith('9.1 DISPOSITIF DE SUIVI'))
      return true;
    if (excludedSet.has('recommendationsLessons') && h.startsWith('9.2 MATRICE DES RISQUES'))
      return true;
    if (excludedSet.has('extraField11') && h.startsWith('10. ANNEXES OPÉRATIONNELLES'))
      return true;
  }
  if (docType === 'ptt') {
    if (
      excludedSet.has('contextJustification') &&
      excludedSet.has('specificObjectives') &&
      h.startsWith('1. RAPPEL DES OBJECTIFS')
    )
      return true;
    if (excludedSet.has('methodologyApproach') && h.startsWith('2. PLANNING OPÉRATIONNEL'))
      return true;
    if (excludedSet.has('extraField1') && h.startsWith('3. BUDGET OPÉRATIONNEL')) return true;
    if (excludedSet.has('governanceModalities') && h.startsWith('4.1 MATRICE RACI TRIMESTRIELLE'))
      return true;
    if (excludedSet.has('confidentialityClauses') && h.startsWith('4.2 LISTE DES LIVRABLES'))
      return true;
    if (excludedSet.has('recommendationsLessons') && h.startsWith('5. GESTION DES RISQUES'))
      return true;
  }
  if (
    docType === 'cadrage' ||
    docType === 'demarrage' ||
    docType === 'cap' ||
    docType === 'mi_parcours' ||
    docType === 'rapport_final'
  ) {
    if (
      excludedSet.has('contextJustification') &&
      excludedSet.has('specificObjectives') &&
      (h.startsWith('1. DIAGNOSTIC') ||
        h.startsWith('1. CONSTATATIONS') ||
        h.startsWith('1. CONTEXTE'))
    )
      return true;
    if (excludedSet.has('recommendationsLessons') && h.startsWith('6. PRESCRIPTIONS')) return true;
    if (
      excludedSet.has('confidentialityClauses') &&
      excludedSet.has('recommendationsLessons') &&
      h.startsWith('7. CAPITALISATION')
    )
      return true;
  }
  if (excludedSet.has('fieldPhotosAnnexTitle') && h.includes('ANNEXE 3')) {
    return true;
  }
  if (excludedSet.has(HIDE_SIGNATURES_KEY)) {
    if (
      h.includes('SIGNATURES OFFICIELLES') ||
      h.includes('VALIDATION ET SIGNATURES') ||
      h.startsWith('10. ATTESTATION DE SINCÉRITÉ')
    ) {
      return true;
    }
  }
  return false;
}

export function buildInstitutionalDocPages(
  docType: InstitutionalDocType,
  rawFields: CustomDocFields,
  dossier: Dossier,
  userProfile: UserProfile,
  currency: CurrencyCode,
  lang: LanguageCode
): StructuredA4Page[] {
  const excludedList = parseExcludedFields(rawFields.excludedFieldsJson);
  const excludedSet = new Set<string>(excludedList);
  const hideSignatures = excludedSet.has(HIDE_SIGNATURES_KEY);
  const sentinelFields: CustomDocFields = { ...rawFields };

  const textKeys: Array<keyof CustomDocFields> = [
    'referenceCode',
    'locationCity',
    'recipientOrg',
    'donorDepartment',
    'executingOrgName',
    'executingDepartment',
    'recipientRepresentative',
    'contextJustification',
    'specificObjectives',
    'methodologyApproach',
    'confidentialityClauses',
    'governanceModalities',
    'recommendationsLessons',
    'extraField1',
    'extraField2',
    'extraField3',
    'extraField4',
    'extraField5',
    'extraField6',
    'extraField7',
    'extraField8',
    'extraField9',
    'extraField10',
    'extraField11'
  ];

  textKeys.forEach(k => {
    if (excludedSet.has(k)) {
      (sentinelFields as unknown as Record<string, string | undefined>)[k] = `__EXCLUDED_FIELD_${k}__`;
    }
  });

  const rawPages = buildRawInstitutionalDocPages(
    docType,
    sentinelFields,
    dossier,
    userProfile,
    currency,
    lang
  );

  // Vérifier si les images (Bannière, Figure d'illustration, Photos d'opérations terrain) sont déjà présentes dans les pages générées
  const hasCoverBannerInDoc = rawPages.some(p =>
    p.sections.some(s => Boolean(s.coverChart))
  );
  const hasFigureImageInDoc = rawPages.some(p =>
    p.sections.some(s => Boolean(s.figureImage?.dataUrl))
  );
  const hasFieldPhotosInDoc = rawPages.some(p =>
    p.sections.some(s => Boolean(s.fieldPhotosAnnex))
  );
  const parsedFieldPhotos = parseFieldPhotos(rawFields.fieldPhotosJson);
  const cfg = DOC_TEMPLATE_CONFIGS[docType] || DOC_TEMPLATE_CONFIGS.tdr;
  const resolvedAnnexTitle =
    (rawFields.fieldPhotosAnnexTitle || '').trim() ||
    'ANNEXE PHOTOGRAPHIQUE — IMAGES DES OPÉRATIONS TERRAIN & PHOTOS D’ILLUSTRATION';

  return rawPages.map((page, pageIdx) => {
    const filteredSections: StructuredA4Section[] = [];

    for (let sIdx = 0; sIdx < page.sections.length; sIdx++) {
      const sec = page.sections[sIdx];
      if (isWholeSectionExcludedByField(docType, sec.heading, excludedSet)) {
        continue;
      }

      const hadParagraphs = Boolean(sec.paragraphs && sec.paragraphs.length > 0);
      const nextParagraphs = sec.paragraphs
        ? sec.paragraphs
            .filter(p => !hasSentinelToken(p))
            .map(p => stripSentinelTokens(p))
            .filter(Boolean)
        : undefined;

      const hadBullets = Boolean(sec.bullets && sec.bullets.length > 0);
      const nextBullets = sec.bullets
        ? sec.bullets
            .filter(b => !hasSentinelToken(b))
            .map(b => stripSentinelTokens(b))
            .filter(Boolean)
        : undefined;

      const nextKeyValues = sec.keyValueRows
        ? sec.keyValueRows.filter(([, v]) => !hasSentinelToken(v))
        : undefined;

      const nextTable = sec.table
        ? {
            ...sec.table,
            rows: sec.table.rows
              .map(r => r.map(c => stripSentinelTokens(c)))
              .filter(r => r.some(c => c.length > 0))
          }
        : undefined;

      const nextCoverChart = sec.coverChart
        ? {
            ...sec.coverChart,
            leftLogo: stripSentinelTokens(sec.coverChart.leftLogo),
            leftDepartment: sec.coverChart.leftDepartment
              ? stripSentinelTokens(sec.coverChart.leftDepartment)
              : '',
            rightLogo: stripSentinelTokens(sec.coverChart.rightLogo),
            rightDepartment: sec.coverChart.rightDepartment
              ? stripSentinelTokens(sec.coverChart.rightDepartment)
              : '',
            bannerTitle: stripSentinelTokens(sec.coverChart.bannerTitle),
            bannerSubtitle: stripSentinelTokens(sec.coverChart.bannerSubtitle),
            docTitle: stripSentinelTokens(sec.coverChart.docTitle),
            docSubtitle: stripSentinelTokens(sec.coverChart.docSubtitle),
            bottomLeftStructure: stripSentinelTokens(sec.coverChart.bottomLeftStructure),
            bottomLeftZone: stripSentinelTokens(sec.coverChart.bottomLeftZone),
            bottomRightDateVersion: stripSentinelTokens(sec.coverChart.bottomRightDateVersion),
            bottomRightStatus: stripSentinelTokens(sec.coverChart.bottomRightStatus)
          }
        : undefined;

      const nextAdminLetterHeader = sec.adminLetterHeader
        ? {
            ...sec.adminLetterHeader,
            referenceCode: stripSentinelTokens(sec.adminLetterHeader.referenceCode),
            cityAndDate: stripSentinelTokens(sec.adminLetterHeader.cityAndDate),
            recipientTitle: stripSentinelTokens(sec.adminLetterHeader.recipientTitle),
            recipientOrg: stripSentinelTokens(sec.adminLetterHeader.recipientOrg),
            subjectLine: stripSentinelTokens(sec.adminLetterHeader.subjectLine),
            dossierRefLine: stripSentinelTokens(sec.adminLetterHeader.dossierRefLine)
          }
        : undefined;

      const nextCvHeaderBanner = sec.cvHeaderBanner
        ? {
            ...sec.cvHeaderBanner,
            metaSubLine: stripSentinelTokens(sec.cvHeaderBanner.metaSubLine)
          }
        : undefined;

      const nextOperationalHeaderBanner = sec.operationalHeaderBanner
        ? {
            ...sec.operationalHeaderBanner,
            centerDocTitle: stripSentinelTokens(sec.operationalHeaderBanner.centerDocTitle),
            centerSubTitle: stripSentinelTokens(sec.operationalHeaderBanner.centerSubTitle),
            referenceAndDateLine: stripSentinelTokens(
              sec.operationalHeaderBanner.referenceAndDateLine
            )
          }
        : undefined;

      // Injection automatique de la Bannière / Image de l'intervention sur la Page 1 si le document n'a pas de coverChart
      let resolvedFigureImage = sec.figureImage;
      if (
        !resolvedFigureImage &&
        !hasCoverBannerInDoc &&
        rawFields.bannerImageDataUrl &&
        pageIdx === 0 &&
        sIdx === 0
      ) {
        resolvedFigureImage = {
          dataUrl: rawFields.bannerImageDataUrl,
          caption: `Bannière / Image de l’Intervention — ${dossier.name || cfg.selectLabel}`
        };
      }

      // Injection automatique de la Figure / Photo d'illustration si elle n'est pas encore rattachée à une section du document
      const targetFigurePageIdx = rawPages.length > 1 ? 1 : 0;
      const targetFigureSecIdx = rawPages.length > 1 ? 0 : Math.min(1, page.sections.length - 1);
      if (
        !resolvedFigureImage &&
        !hasFigureImageInDoc &&
        rawFields.figureImageDataUrl &&
        pageIdx === targetFigurePageIdx &&
        sIdx === targetFigureSecIdx
      ) {
        resolvedFigureImage = {
          dataUrl: rawFields.figureImageDataUrl,
          caption: `Figure / Illustration Technique & Opérationnelle — ${dossier.name || cfg.selectLabel}`
        };
      }

      // Si une section reposait uniquement sur ses paragraphes/puces et qu'ils ont tous été exclus, retirer la section entière
      const hasRemainingBody =
        (nextParagraphs && nextParagraphs.length > 0) ||
        (nextBullets && nextBullets.length > 0) ||
        (nextKeyValues && nextKeyValues.length > 0) ||
        Boolean(nextTable) ||
        Boolean(nextCoverChart) ||
        Boolean(nextAdminLetterHeader) ||
        Boolean(nextCvHeaderBanner) ||
        Boolean(nextOperationalHeaderBanner) ||
        Boolean(resolvedFigureImage) ||
        Boolean(sec.fieldPhotosAnnex);

      const allParagraphsExcluded =
        hadParagraphs &&
        (!nextParagraphs || nextParagraphs.length === 0) &&
        !nextTable &&
        !nextCoverChart &&
        !nextAdminLetterHeader &&
        !nextCvHeaderBanner &&
        !nextOperationalHeaderBanner &&
        !resolvedFigureImage &&
        !sec.fieldPhotosAnnex &&
        (!hadBullets || !nextBullets || nextBullets.length === 0);

      if (!hasRemainingBody || allParagraphsExcluded) {
        continue;
      }

      filteredSections.push({
        ...sec,
        paragraphs: nextParagraphs,
        bullets: nextBullets,
        keyValueRows: nextKeyValues,
        table: nextTable,
        coverChart: nextCoverChart,
        adminLetterHeader: nextAdminLetterHeader,
        cvHeaderBanner: nextCvHeaderBanner,
        operationalHeaderBanner: nextOperationalHeaderBanner,
        figureImage: resolvedFigureImage
      });
    }

    // Si l'utilisateur a ajouté des images d'opérations terrain / photos d'illustration sur un document qui n'avait pas encore de section fieldPhotosAnnex, l'insérer sur la dernière page
    if (
      pageIdx === rawPages.length - 1 &&
      !hasFieldPhotosInDoc &&
      parsedFieldPhotos.length > 0 &&
      !excludedSet.has('fieldPhotosAnnexTitle')
    ) {
      filteredSections.push({
        heading: resolvedAnnexTitle,
        fieldPhotosAnnex: {
          annexTitle: resolvedAnnexTitle,
          photos: parsedFieldPhotos
        }
      });
    }

    return {
      ...page,
      pageTitle: stripSentinelTokens(page.pageTitle),
      pageSubtitle: stripSentinelTokens(page.pageSubtitle),
      isSignaturePage: hideSignatures ? false : page.isSignaturePage,
      orgStampDataUrl: hideSignatures ? undefined : page.orgStampDataUrl,
      partnerStampDataUrl: hideSignatures ? undefined : page.partnerStampDataUrl,
      sections: filteredSections
    };
  });
}

