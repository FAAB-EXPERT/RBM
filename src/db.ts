import {
  ActorCategoryType,
  AppPersistedState,
  CategorizedActor,
  CustomDocsMap,
  Dossier,
  InternalActorProfile,
  UserProfile
} from './types';
import { safeJsonParse } from './securityUtils';

const DB_NAME = 'faab_plan_strategic_idb';
const DB_VERSION = 2;
const STORE_NAME = 'app_state';
const PROGRAMMES_STORE = 'programmes_store';
const ACTOR_PROFILES_STORE = 'actor_profiles_store';
const STATE_KEY = 'main_state';

// Strict per-user isolation: each authenticated Regular User (UID) has their own isolated IndexedDB key.
// Unauthenticated visitors and the Super Administrator never read or write any user workspace.
let activeUserStorageUid: string | null = null;

export function setActiveUserStorageUid(uid: string | null): void {
  const cleaned = (uid || '').trim();
  activeUserStorageUid = cleaned ? cleaned : null;
}

export function getActiveUserStorageUid(): string | null {
  return activeUserStorageUid;
}

function getScopedStateKey(explicitUid?: string | null): string | null {
  const uid = (explicitUid ?? activeUserStorageUid ?? '').trim();
  if (!uid) return null;
  return `${STATE_KEY}_uid_${uid}`;
}

function getScopedDossierKey(
  dossierId: string,
  explicitUid?: string | null
): string {
  const uid = (explicitUid ?? activeUserStorageUid ?? 'anon').trim() || 'anon';
  return `${uid}::${dossierId}`;
}


export const defaultUserProfile: UserProfile = {
  fullName: 'KOFFIE Fabien Michael',
  email: 'fabien.frikupgeneration@gmail.com',
  phone: '00225 0748082739',
  institution: 'Direction Générale de la Stratégie & Pilotage des Projets',
  role: 'Architecte Principal & Coordonnateur du Pilotage Stratégique (PMO / GAR)',
  intervenesAsProgramActor: true,
  nationality: 'Ivoirienne',
  birthDate: '14/05/1984',
  residenceCity: 'Abidjan, Côte d’Ivoire',
  linkedIn: 'linkedin.com/in/koffie-fabien-michael',
  yearsExperience: '+15 ans d’expérience internationale en Ingénierie de Projet, PMO, GAR & S&E',
  cvExecutivePitch:
    'Directeur de Programme International et Expert Senior certifié PMP® / ISO 21500 capitalisant plus de 15 années d’expérience dans la conception, l’ordonnancement algorithmique PERT/CPM, la Gestion Axée sur les Résultats (GAR) et le Suivi-Évaluation (normes OCDE/CAD et UNEG) de programmes financés par la Banque Mondiale, la BAD, l’UE et le PNUD.',
  cvKeySkills:
    'Ingénierie de Projet & PMO (PMBOK 7, ISO 21500, WBS, PERT/CPM, EVM) | Suivi-Évaluation & GAR (Cadre Logique, Théorie du Changement, OCDE/CAD, UNEG) | Gouvernance, Fiduciaire & Passation des Marchés (RACI, Board RAID, PTBA, Directives BM/BAD/UE)',
  cvEducationDiplomas:
    '2009–2011 : Master Exécutif / DEA en Ingénierie de Projets, Économie du Développement & Planification Stratégique (Mention Très Bien).\n2005–2009 : Diplôme d’Ingénieur / Maîtrise en Sciences de Gestion, Statistique Appliquée & Systèmes d’Information.',
  cvCertifications:
    'Project Management Professional (PMP® — PMI) · Lead Project Manager ISO 21500:2021 · Certificat International en Gestion Axée sur les Résultats (GAR / PNUD) · Accréditation Évaluation des Politiques Publiques & Programmes (CLEAR / Banque Mondiale / UNEG) · PRINCE2® Practitioner',
  cvMajorExperiences:
    '2022–2026 : Directeur de Programme & Chef de Mission PMO — Portefeuilles Stratégiques Multisectoriels (PNUD / BM / BAD) : Pilotage WBS/PERT, maîtrise du chemin critique et exécution rigoureuse du PTBA.\n2018–2022 : Expert Principal en Suivi-Évaluation & GAR — Programme Régional de Modernisation & Gouvernance (UE / BAD) : Conception du dispositif S&E informatisé et réalisation des revues à mi-parcours et finales.\n2014–2018 : Coordonnateur Technique d’Unité de Gestion de Projet (UGP) — Projet d’Investissement Sectoriel (Banque Mondiale) : Coordination opérationnelle, supervision fiduciaire et renforcement des capacités.',
  cvCountriesAndDonors:
    'Pays d’intervention : Côte d’Ivoire, Sénégal, Burkina Faso, Bénin, Togo, Guinée, Mali, Cameroun, RDC, Maroc.\nBailleurs pratiqués : Banque Mondiale (IDA/BIRD), Banque Africaine de Développement (BAD), Union Européenne (FED/NDICI), PNUD, UNICEF, AFD, GIZ, FIDA.',
  cvLanguages:
    'Français : Lu (C2 - Excellent), Écrit (C2 - Excellent), Parlé (C2 - Langue maternelle) | Anglais : Lu (C1 - Avancé), Écrit (C1 - Avancé), Parlé (C1 - Courant professionnel) | Espagnol / Portugais : Notions opérationnelles (B1)',
  cvSoftwareTools:
    'faab gar, MS Project, Primavera P6, Power BI, KoboToolbox / ODK, SPSS, R, Excel Avancé (Modélisation EVM & Tableaux de Bord)',
  cvPublicationsAffiliations:
    'Publications : (1) « Modélisation algorithmique du chemin critique PERT/CPM et pilotage par la Valeur Acquise (EVM) dans les projets financés par les banques multilatérales », 2024 ; (2) « Guide méthodologique de triangulation mixte OCDE/CAD et d’assurance qualité GEROS ». Affiliations : Membre actif du Project Management Institute (PMI®), du Réseau Francophone de l’Évaluation (RFE) et de l’Association Africaine d’Évaluation (AfrEA).',
  cvReferences:
    'Référence 1 : Dr. Kouadio Jean-Baptiste — Directeur Général de la Planification | Email : dg.plan@gouv.ci | Tél : +225 27 20 00 11 22.\nRéférence 2 : Mme Aminata Touré — Spécialiste Senior en Gestion de Projets & S&E (BM / PNUD) | Email : atoure.se@worldbank-undp.org | Tél : +221 33 859 00 00.\nRéférence 3 : M. Marc-Antoine Lefèvre — Chef de Coopération & Gouvernance (UE / BAD) | Email : ma.lefevre@intl-coop.eu | Tél : +32 2 299 11 11.',
  cvAvailability:
    'Disponibilité immédiate pour missions de direction de programme, d’assistance technique perlée ou résidentielle et d’évaluation indépendante.'
};

export const defaultCustomDocsData: CustomDocsMap = {
  tdr: {
    referenceCode: 'TDR-FAAB-2026-001',
    recipientOrg: 'Partenaires Techniques et Financiers (PNUD / Banque Mondiale / BAD / UE)',
    donorDepartment: 'Direction des Opérations & Financements de Projets',
    executingOrgName: 'Organisation / Entreprise / Institution Publique ou Privée',
    executingDepartment: 'Direction Générale de la Stratégie & Pilotage des Projets (PMO / S&E)',
    recipientRepresentative: 'Chef de Mission / Consultant Principal',
    contextJustification: 'La présente mission s’inscrit dans le cadre de la mise en œuvre opérationnelle du portefeuille stratégique afin de garantir l’atteinte des résultats dans les délais, coûts et standards de qualité internationaux.',
    specificObjectives: '1. Structurer le cadre méthodologique et opérationnel ;\n2. Assurer le déploiement et le suivi rigoureux des livrables sur le chemin critique ;\n3. Transférer les compétences aux équipes internes.',
    methodologyApproach: 'Approche participative axée sur les résultats (GAR), ordonnancement PERT/CPM, revues périodiques de performance et validation par jalons.',
    confidentialityClauses: 'Respect strict de la confidentialité des données stratégiques, financières et opérationnelles collectées durant la mission.',
    governanceModalities: 'Comité de Pilotage mensuel et réunions techniques hebdomadaires de suivi des écarts.',
    recommendationsLessons: 'Aligner systématiquement les ressources sur les activités à marge nulle (chemin critique).',
    locationCity: 'Abidjan'
  },
  note_methodo: {
    referenceCode: 'NM-FAAB-2026-002',
    recipientOrg: 'Comité de Pilotage & Partenaires Techniques et Financiers',
    donorDepartment: 'Direction de la Planification & de l’Assurance Qualité',
    executingOrgName: 'Organisation / Entreprise / Institution Publique ou Privée',
    executingDepartment: 'Direction Générale de la Stratégie & Pilotage des Projets (PMO / S&E)',
    recipientRepresentative: 'Président du Comité de Pilotage',
    contextJustification: 'Définition du dispositif méthodologique de planification, d’ordonnancement PERT/CPM et de suivi-évaluation des activités du programme.',
    specificObjectives: 'Harmoniser les outils de collecte, fiabiliser le calcul des écarts de début et de fin, et sécuriser les jalons décisionnels.',
    methodologyApproach: 'Démarche en 5 phases normées (Avant-Projet, Conception, Planification, Exécution & Suivi, Clôture) couplée à l’analyse prédictive du réseau PERT.',
    confidentialityClauses: 'Diffusion restreinte aux membres accrédités de l’équipe projet et aux partenaires institutionnels.',
    governanceModalities: 'Validation méthodologique par le Comité Technique avant déploiement opérationnel.',
    recommendationsLessons: 'Mettre à jour hebdomadairement les dates d’exécution réelles dans l’onglet Suivi des tâches.',
    locationCity: 'Abidjan'
  },
  nda: {
    referenceCode: 'NDA-FAAB-2026-003',
    recipientOrg: 'Partenaire Technique / Institution Commanditaire',
    donorDepartment: 'Direction des Affaires Juridiques & de la Conformité',
    executingOrgName: 'Organisation / Entreprise / Institution Publique ou Privée',
    executingDepartment: 'Direction Générale de la Stratégie & Pilotage des Projets (PMO / S&E)',
    recipientRepresentative: 'Représentant Légal du Partenaire',
    contextJustification: 'Protection juridique des informations sensibles, bases de données, budgets et livrables échangés dans le cadre de l’exécution du portefeuille.',
    specificObjectives: 'Prévenir toute divulgation non autorisée et encadrer l’usage exclusif des données aux fins de la mission.',
    methodologyApproach: 'Traçabilité documentaire, chiffrement des échanges et destruction ou restitution des supports en fin de contrat.',
    confidentialityClauses: 'Engagement irrévocable de non-divulgation pendant toute la durée du projet et durant cinq (5) ans après sa clôture officielle.',
    governanceModalities: 'Juridiction compétente en cas de litige et contrôle de conformité par la Direction Juridique.',
    recommendationsLessons: 'Faire signer le présent accord avant tout partage du fichier JSON ou des rapports exécutifs.',
    locationCity: 'Abidjan'
  },
  lettre_mission: {
    referenceCode: 'LM-FAAB-2026-004',
    recipientOrg: 'Autorité Commanditaire / Comité de Pilotage & Bailleurs',
    donorDepartment: 'Direction Générale / Présidence du Comité de Pilotage',
    executingOrgName: 'Organisation / Entreprise / Institution Publique ou Privée',
    executingDepartment: 'Direction Générale de la Stratégie & Pilotage des Projets (PMO / S&E)',
    recipientRepresentative: 'Chef de Projet Opérationnel',
    contextJustification: 'Mandat officiel conféré au responsable pour conduire, coordonner et superviser la réalisation des activités inscrites au plan.',
    specificObjectives: 'Livrer l’ensemble des activités dans le respect de l’enveloppe budgétaire allouée et du calendrier prévisionnel.',
    methodologyApproach: 'Mobilisation des équipes, arbitrage des priorités selon le réseau PERT et reporting régulier à la Direction.',
    confidentialityClauses: 'Obligation de réserve et de loyauté institutionnelle.',
    governanceModalities: 'Compte-rendu direct au Coordonnateur Général du Pilotage Stratégique.',
    recommendationsLessons: 'Signaler immédiatement tout blocage via le statut « Bloqué » pour déclencher un arbitrage rapide.',
    locationCity: 'Abidjan'
  },
  cadrage: {
    referenceCode: 'RCP-FAAB-2026-005',
    recipientOrg: 'Comité Stratégique & Partenaires Techniques et Financiers',
    donorDepartment: 'Direction des Programmes & Partenariats Institutionnels',
    executingOrgName: 'Organisation / Entreprise / Institution Publique ou Privée',
    executingDepartment: 'Direction Générale de la Stratégie & Pilotage des Projets (PMO / S&E)',
    recipientRepresentative: 'Directeur Général / Sponsor Exécutif',
    contextJustification: 'Consolidation du périmètre fonctionnel, de la macro-planification, de la matrice des responsabilités et de l’allocation budgétaire initiale.',
    specificObjectives: 'Valider la ligne de référence (Baseline) du calendrier et du budget avant le lancement des opérations.',
    methodologyApproach: 'Structuration WBS par Axes et Projets, modélisation du réseau PERT et identification préventive des goulots d’étranglement.',
    confidentialityClauses: 'Document officiel de référence interne et contractuel.',
    governanceModalities: 'Approbation formelle de la Baseline en séance plénière du Comité de Cadrage.',
    recommendationsLessons: 'Maintenir une réserve de contingence sur les tâches critiques identifiées dans le réseau PERT.',
    locationCity: 'Abidjan'
  },
  demarrage: {
    referenceCode: 'RD-FAAB-2026-006',
    recipientOrg: 'Autorité de Tutelle / Comité de Pilotage & Bailleurs',
    donorDepartment: 'Secrétariat Technique du Comité de Pilotage',
    executingOrgName: 'Organisation / Entreprise / Institution Publique ou Privée',
    executingDepartment: 'Direction Générale de la Stratégie & Pilotage des Projets (PMO / S&E)',
    recipientRepresentative: 'Secrétariat Technique du Comité',
    contextJustification: 'Constatation officielle de la mobilisation effective des ressources humaines, matérielles et financières pour le démarrage des activités.',
    specificObjectives: 'Confirmer la disponibilité des prérequis opérationnels et actualiser le calendrier initial d’exécution.',
    methodologyApproach: 'Revue de lancement (Kick-off), vérification des antécédents initiaux et lancement des premières tâches de la phase Avant-Projet.',
    confidentialityClauses: 'Usage institutionnel interne.',
    governanceModalities: 'Validation du procès-verbal de démarrage.',
    recommendationsLessons: 'Sécuriser les approvisionnements initiaux dès le premier mois pour éviter tout retard au démarrage.',
    locationCity: 'Abidjan'
  },
  cap: {
    referenceCode: 'CAP-FAAB-2026-007',
    recipientOrg: 'Partenaires Techniques et Financiers & Autorité de Tutelle',
    donorDepartment: 'Direction du Suivi-Évaluation & Contrôle de Gestion',
    executingOrgName: 'Organisation / Entreprise / Institution Publique ou Privée',
    executingDepartment: 'Direction Générale de la Stratégie & Pilotage des Projets (PMO / S&E)',
    recipientRepresentative: 'Contrôleur Général de Gestion',
    contextJustification: 'Contrôle périodique de l’avancement physique et financier, analyse des écarts de début et de fin, et surveillance des activités bloquées.',
    specificObjectives: 'Mesurer la performance réelle par rapport aux prévisions et prescrire des actions correctives immédiates.',
    methodologyApproach: 'Audit des indicateurs GAR, calcul des glissements calendaires sur le chemin critique et réajustement dynamique via le Kanban.',
    confidentialityClauses: 'Document d’audit interne soumis au devoir de confidentialité.',
    governanceModalities: 'Revue périodique d’exécution avec les responsables d’axes et de projets.',
    recommendationsLessons: 'Débloquer en priorité les tâches critiques affichant un écart positif supérieur à 5 jours.',
    locationCity: 'Abidjan',
    fieldPhotosAnnexTitle: 'ANNEXE 3 — REPORTAGE PHOTOGRAPHIQUE & CONSTATS VISUELS DE TERRAIN (CONTRÔLE D’AVANCEMENT PÉRIODIQUE)'
  },
  grille_evaluation: {
    referenceCode: 'GEV-FAAB-2026-010',
    recipientOrg: 'Comité d’Évaluation Indépendant & Partenaires Techniques et Financiers (PTF)',
    donorDepartment: 'Département de l’Évaluation Indépendante & Qualité (UNEG / OCDE-CAD)',
    executingOrgName: 'Organisation / Entreprise / Institution Publique ou Privée',
    executingDepartment: 'Direction Générale de la Stratégie & Pilotage des Projets (PMO / S&E)',
    recipientRepresentative: 'Chef de Mission d’Évaluation / Expert Principal S&E (UNEG / OCDE-CAD)',
    contextJustification: 'Construction du référentiel analytique et de la matrice d’évaluation croisant les 6 critères internationaux OCDE/CAD (Pertinence, Cohérence, Efficacité, Efficience, Impact, Durabilité) avec des indicateurs SMART, des barèmes de notation (1 à 5) et une triangulation rigoureuse des sources.',
    specificObjectives: '1. Décliner les questions évaluatives principales et sous-questions par critère OCDE/CAD ;\n2. Objectiver le jugement évaluatif via une échelle de notation normée (Score 1 à 5) ;\n3. Garantir la traçabilité des preuves, des méthodes de collecte et l’analyse des risques/biais méthodologiques.',
    methodologyApproach: 'Méthodes mixtes (quantitatives et qualitatives), triangulation systématique des sources primaires et secondaires, échantillonnage stratifié et contrôle qualité conforme aux normes UNEG et GEROS.',
    confidentialityClauses: 'Respect strict des principes éthiques d’évaluation des Nations Unies (UNEG) : indépendance, impartialité, anonymat des répondants, consentement éclairé et protection des données.',
    governanceModalities: 'Validation de la grille par le Groupe de Référence de l’Évaluation (GRE) et le Comité de Pilotage avant déploiement des outils de collecte.',
    recommendationsLessons: 'Pondérer les scores d’efficacité et d’efficience en fonction de l’exécution réelle des activités situées sur le chemin critique PERT/CPM.',
    locationCity: 'Abidjan'
  },
  mi_parcours: {
    referenceCode: 'REMP-FAAB-2026-008',
    recipientOrg: 'Comité d’Évaluation & Partenaires Techniques et Financiers',
    donorDepartment: 'Direction du Suivi-Évaluation & des Opérations',
    executingOrgName: 'Organisation / Entreprise / Institution Publique ou Privée',
    executingDepartment: 'Direction Générale de la Stratégie & Pilotage des Projets (PMO / S&E)',
    recipientRepresentative: 'Président de la Commission d’Évaluation',
    contextJustification: 'Bilan critique à mi-parcours et annuel selon les critères internationaux OCDE/CAD : pertinence, cohérence, efficacité, efficience, impact et durabilité.',
    specificObjectives: 'Apprécier le taux de réalisation global à mi-étape / annuel et réorienter si nécessaire la trajectoire opérationnelle et budgétaire.',
    methodologyApproach: 'Analyse croisée des tableaux de planification et de suivi, évaluation du chemin critique résiduel et revue documentaire des livrables.',
    confidentialityClauses: 'Diffusion contrôlée auprès des parties prenantes accréditées.',
    governanceModalities: 'Atelier de restitution et validation des recommandations à mi-parcours et annuelles.',
    recommendationsLessons: 'Réallouer les marges libres des tâches non critiques vers les activités sous tension.',
    locationCity: 'Abidjan',
    fieldPhotosAnnexTitle: 'ANNEXE 3 — DOCUMENTATION PHOTOGRAPHIQUE DE TERRAIN & PREUVES VISUELLES (ÉVALUATION À MI-PARCOURS & ANNUELLE)'
  },
  rapport_final: {
    referenceCode: 'RFA-FAAB-2026-009',
    recipientOrg: 'Direction Générale, Conseil d’Administration & Bailleurs de Fonds',
    donorDepartment: 'Direction des Opérations, de l’Audit & de la Clôture',
    executingOrgName: 'Organisation / Entreprise / Institution Publique ou Privée',
    executingDepartment: 'Direction Générale de la Stratégie & Pilotage des Projets (PMO / S&E)',
    recipientRepresentative: 'Directeur Général / Autorité Contractante',
    contextJustification: 'Synthèse récapitulative annuelle et de clôture présentant le bilan définitif des réalisations physiques, l’exécution budgétaire et la capitalisation des acquis.',
    specificObjectives: 'Documenter l’atteinte des objectifs annuels et finaux, réceptionner les livrables et capitaliser les bonnes pratiques.',
    methodologyApproach: 'Comparaison finale Prévu vs Réalisé, analyse rétrospective des écarts de début/fin et quitus opérationnel.',
    confidentialityClauses: 'Archivage institutionnel légal et propriété intellectuelle des livrables.',
    governanceModalities: 'Clôture officielle et décharge prononcée par le Comité de Pilotage.',
    recommendationsLessons: 'Pérenniser les acquis du projet et archiver la sauvegarde JSON finale ainsi que le rapport PDF officiel.',
    locationCity: 'Abidjan',
    fieldPhotosAnnexTitle: 'ANNEXE 3 — ALBUM PHOTOGRAPHIQUE DES RÉALISATIONS DE TERRAIN & IMPACTS VISUELS (ÉVALUATION ANNUELLE & FINALE)'
  },
  courrier_admin: {
    referenceCode: 'COUR-FAAB-2026-011',
    recipientOrg: 'Direction Générale & Partenaires Institutionnels',
    recipientRepresentative: 'Monsieur / Madame le Directeur Général',
    contextJustification: 'Transmission officielle des éléments de cadrage, de planification et d’état d’avancement du portefeuille stratégique.',
    specificObjectives: 'Madame, Monsieur,\n\nJ’ai l’honneur de vous soumettre par le présent courrier administratif les éléments consolidés relatifs au pilotage opérationnel et budgétaire de notre portefeuille de projets.',
    methodologyApproach: 'Conformément aux référentiels de gouvernance et de Gestion Axée sur les Résultats (GAR), l’ordonnancement des activités, le suivi du chemin critique PERT/CPM ainsi que la matrice des responsabilités RACI ont été rigoureusement arrêtés.',
    confidentialityClauses: 'Pièces jointes (P.J.) : 01 Dossier Technique Exécutif & État d’Avancement.\nAmpliations : Présidence du Comité de Pilotage (COPIL) / Archives PMO.',
    governanceModalities: 'À ce titre, nous sollicitons votre bienveillante approbation sur les jalons décisionnels en cours et restons à votre entière disposition pour toute séance de travail ou d’arbitrage complémentaire.',
    recommendationsLessons: 'Veuillez agréer, Madame, Monsieur, l’expression de ma haute considération et de mon profond respect institutionnel.',
    locationCity: 'Abidjan'
  },
  cv_executif: {
    referenceCode: 'CV-EXEC-FAAB-2026-012',
    locationCity: 'Abidjan, Côte d’Ivoire',
    recipientOrg: 'PNUD / Banque Mondiale / BAD / Union Européenne',
    recipientRepresentative: 'KOFFIE FABIEN MICHAEL — Directeur de Programme International & Expert Senior PMP® / S&E | Tél : 00225 0748082739 | Email : fabien.frikupgeneration@gmail.com | LinkedIn : linkedin.com/in/koffie-fabien-michael | Abidjan, Côte d’Ivoire | Nationalité : Ivoirienne',
    contextJustification: 'Directeur de Programme International et Expert Senior certifié PMP® / ISO 21500 capitalisant plus de 15 années d’expérience dans la conception, l’ordonnancement PERT/CPM, la Gestion Axée sur les Résultats (GAR) et le Suivi-Évaluation (OCDE/CAD, UNEG) de portefeuilles multisectoriels financés par les bailleurs internationaux (Banque Mondiale, BAD, PNUD, UE).',
    specificObjectives: 'Ingénierie de Projet & PMO (PMBOK 7, ISO 21500, WBS, PERT/CPM, EVM) | Suivi-Évaluation & GAR (Cadre Logique, Théorie du Changement, OCDE/CAD, UNEG) | Gouvernance, Fiduciaire & Passation des Marchés (RACI, Board RAID, PTBA, Directives BM/BAD/UE)',
    methodologyApproach: '2022–2026 : Directeur de Programme & Chef de Mission PMO — Portefeuille Stratégique faab gar (PNUD / BM / BAD) : Pilotage de 2 axes stratégiques, 100% de maîtrise du chemin critique PERT/CPM et exécution rigoureuse du PTBA.\n2018–2022 : Expert Principal en Suivi-Évaluation & GAR — Programme Régional de Modernisation & Gouvernance (UE / BAD) : Conception du dispositif S&E informatisé et réalisation des revues à mi-parcours et finales.\n2014–2018 : Coordonnateur Technique d’Unité de Gestion de Projet (UGP) — Projet d’Investissement Sectoriel (Banque Mondiale) : Coordination opérationnelle, supervision fiduciaire et renforcement des capacités nationales.',
    governanceModalities: 'Master Exécutif / Diplôme d’Ingénieur en Management de Projets Internationaux & Développement | Certifications : PMP® (PMI), ISO 21500 Lead Project Manager, Certificat International en Suivi-Évaluation (GAR / UNEG / CLEAR) & PRINCE2® Practitioner',
    confidentialityClauses: 'Langues : Français (C2 — Langue maternelle / Expert) · Anglais (C1 — Courant professionnel, négociation et rédaction de rapports bailleurs) | Logiciels & Outils S&E : faab gar, MS Project, Primavera P6, Power BI, KoboToolbox / ODK, SPSS, R, Excel Avancé (EVM)',
    recommendationsLessons: 'Disponibilité immédiate pour missions de direction de programme, d’assistance technique perlée ou résidentielle et d’évaluation indépendante.'
  },
  cv_detaille: {
    referenceCode: 'CV-AOI-FAAB-2026-013',
    locationCity: 'Abidjan, Côte d’Ivoire',
    recipientOrg: 'Banque Mondiale (Format WB Form TECH-6) / BAD / Union Européenne (EuropeAid) / PNUD / Nations Unies (P11)',
    recipientRepresentative: 'Nom & Prénoms : KOFFIE FABIEN MICHAEL | Date de naissance : 14/05/1984 | Nationalité : Ivoirienne | Résidence : Abidjan, Côte d’Ivoire | Tél : 00225 0748082739 | Email : fabien.frikupgeneration@gmail.com | Poste proposé : Chef de Mission / Directeur de Programme & Expert Principal S&E (Catégorie I)',
    contextJustification: 'Expert Senior de Catégorie I (> 15 ans d’expérience internationale) spécialisé en ingénierie de projets de développement, planification stratégique pluriannuelle, ordonnancement algorithmique PERT/CPM, contrôle budgétaire par la Valeur Acquise (EVM) et évaluations indépendantes selon les normes UNEG et les 6 critères du réseau OCDE/CAD.',
    specificObjectives: '2009–2011 : Master / DEA en Ingénierie de Projets, Économie du Développement & Planification Stratégique (Mention Très Bien).\n2005–2009 : Diplôme d’Ingénieur / Maîtrise en Sciences de Gestion, Statistique Appliquée & Systèmes d’Information.',
    methodologyApproach: 'Certifications Internationales : Project Management Professional (PMP® — PMI) · Lead Project Manager ISO 21500:2021 · Certificat Avancé en Gestion Axée sur les Résultats (GAR / PNUD) · Accréditation Évaluation des Politiques Publiques & Programmes (CLEAR / Banque Mondiale / UNEG) · Passation des Marchés FIDIC & Nouveau Cadre de Passation de la Banque Mondiale.',
    governanceModalities: 'Pays d’intervention : Côte d’Ivoire, Sénégal, Burkina Faso, Bénin, Togo, Guinée, Mali, Cameroun, RDC, Maroc.\nBailleurs pratiqués : Banque Mondiale (IDA/BIRD), Banque Africaine de Développement (BAD), Union Européenne (FED/NDICI), PNUD, UNICEF, AFD, GIZ, FIDA.',
    confidentialityClauses: 'Publications : (1) « Modélisation algorithmique du chemin critique PERT/CPM et pilotage par la Valeur Acquise (EVM) dans les projets financés par les banques multilatérales », Revue Internationale de Management Public, 2024 ; (2) « Guide méthodologique de triangulation mixte OCDE/CAD et d’assurance qualité GEROS ». Affiliations : Membre actif du Project Management Institute (PMI®), du Réseau Francophone de l’Évaluation (RFE) et de l’Association Africaine d’Évaluation (AfrEA).',
    recommendationsLessons: 'Référence 1 : Dr. Kouadio Jean-Baptiste — Directeur Général de la Planification, Ministère du Plan & du Développement | Email : dg.plan@gouv.ci | Tél : +225 27 20 00 11 22.\nRéférence 2 : Mme Aminata Touré — Spécialiste Senior en Gestion de Projets & S&E, Représentation Régionale Banque Mondiale / PNUD | Email : atoure.se@worldbank-undp.org | Tél : +221 33 859 00 00.\nRéférence 3 : M. Marc-Antoine Lefèvre — Chef de Coopération & Gouvernance, Délégation de l’Union Européenne / BAD | Email : ma.lefevre@intl-coop.eu | Tél : +32 2 299 11 11.',
    extraField1: 'Historique détaillé des missions synchronisé automatiquement avec les Projets, Livrables (M9), Budgets (M5) et Résultats (M1) du portefeuille actif.',
    extraField2: 'Français : Lu (C2 - Excellent), Écrit (C2 - Excellent), Parlé (C2 - Langue maternelle) | Anglais : Lu (C1 - Avancé), Écrit (C1 - Avancé), Parlé (C1 - Courant professionnel) | Espagnol / Portugais : Notions opérationnelles (B1).'
  },
  pv_reunion: {
    referenceCode: 'PV-COPIL-FAAB-2026-014',
    locationCity: 'Abidjan — Salle de Conférence Principale UGP & Visioconférence Hybride',
    recipientOrg: 'Comité de Pilotage Stratégique (COPIL) & Unité de Gestion du Programme (UGP)',
    recipientRepresentative: 'Type de réunion : Session Ordinaire d’Arbitrage du Comité de Pilotage (COPIL) | Horaire : 09h00 – 12h30 | Président de séance : Président du Comité de Pilotage | Secrétaire de séance (Rapporteur) : KOFFIE FABIEN MICHAEL (Coordonnateur PMO)',
    contextJustification: '1. Vérification du quorum, ouverture de la séance et adoption de l’ordre du jour ;\n2. Présentation de l’état d’avancement physique (WBS/Kanban) et du chemin critique PERT/CPM ;\n3. Examen de l’exécution budgétaire PTBA / Valeur Acquise (EVM) et revue des risques (Board RAID) ;\n4. Arbitrages sur les points de blocage, adoption des résolutions et calendrier de la prochaine séance.',
    specificObjectives: 'Les travaux se sont déroulés dans un climat constructif et rigoureux. L’Unité de Gestion a présenté le tableau de bord consolidé faisant ressortir le taux d’exécution physique, l’état des jalons critiques PERT/CPM ainsi que la situation des décaissements par projet. Les échanges ont porté sur la levée rapide des goulots d’étranglement identifiés et la sécurisation des livrables de la période.',
    methodologyApproach: 'DÉCISION N°01 : Approbation sans réserve du bilan d’exécution physique et financier présenté par le Coordonnateur PMO.\nDÉCISION N°02 : Instruction ferme de déblocage prioritaire des activités en alerte sur le chemin critique PERT/CPM sous huitaine.\nDÉCISION N°03 : Autorisation d’engagement des tranches budgétaires liées aux livrables réceptionnés et validés.',
    governanceModalities: 'Liste officielle des participants synchronisée avec la Matrice des Parties Prenantes (M4) et la Matrice RACI (M3) du portefeuille.',
    confidentialityClauses: 'Matrice des décisions et plan d’actions immédiat synchronisés avec la Matrice M10 (Plan d’Action CAP) et la Matrice M7 (Risques RAID).',
    recommendationsLessons: 'Prochaine séance du Comité de Pilotage fixée au mois prochain à 09h00. Ordre du jour prévisionnel : vérification de l’exécution des résolutions de la présente séance et revue des livrables d’étape. L’ordre du jour étant épuisé, la séance est levée à 12h30.'
  },
  tdr_simplifie: {
    referenceCode: 'TDRS-PTBA-2026-015',
    locationCity: 'Abidjan & Zones d’Intervention du Projet',
    recipientOrg: 'Unité de Gestion du Projet (UGP) & Partenaires Techniques et Financiers',
    recipientRepresentative: 'Durée : 30 Hommes-Jours (H/J) | Période souhaitée : T2–T3 2026 | Superviseur direct : KOFFIE FABIEN MICHAEL — Coordonnateur PMO & Chef de Projet',
    contextJustification: 'Dans le cadre de l’exécution du Plan de Travail et Budget Annuel (PTBA) du portefeuille actif, la présente activité opérationnelle vise à mobiliser une expertise technique ciblée afin d’accélérer la livraison des jalons inscrits sur le chemin critique PERT/CPM et de garantir la conformité qualitative des extrants.',
    specificObjectives: 'Objectif Global : Assurer la réalisation intégrale, dans les délais impartis et selon les standards internationaux (ISO 21500 / GAR), des livrables opérationnels de l’activité.\nObjectifs Spécifiques : (1) Conduire le diagnostic opérationnel et valider le protocole d’intervention ; (2) Produire les livrables techniques et animer les séances de restitution ; (3) Transférer les compétences et clôturer l’activité avec quitus technique.',
    methodologyApproach: 'Approche opérationnelle agile en 3 étapes : Phase 1 — Cadrage rapide, revue documentaire et note méthodologique (J+1 à J+5) ; Phase 2 — Déploiement opérationnel, collecte/production technique et travaux d’atelier (J+6 à J+22) ; Phase 3 — Consolidation, assurance qualité, restitution et remise des livrables finaux (J+23 à J+30).',
    governanceModalities: 'Profil requis : Expert Consultant Senior (Bac+5 minimum en Ingénierie, Gestion de Projet, Économie, Suivi-Évaluation ou discipline connexe) justifiant d’au moins 8 à 10 ans d’expérience avérée sur des missions similaires financées par les bailleurs internationaux, avec maîtrise parfaite des outils GAR et PERT/CPM.',
    confidentialityClauses: 'Modalités de paiement conditionnées à l’approbation des livrables (Matrice M9) : 20% au démarrage sur validation de la Note de cadrage (L1) ; 40% à la remise du Rapport/Livrable provisoire (L2) ; 40% au solde après validation finale et signature du PV de réception définitive (L3).',
    recommendationsLessons: 'Dossier de soumission rapide : (1) Lettre de manifestation d’intérêt datée et signée ; (2) CV détaillé actualisé de l’expert (format Doc 12 ou Doc 13) + copies des diplômes et attestations de bonne exécution ; (3) Note méthodologique succincte (3 pages max) et chronogramme ; (4) Proposition financière détaillée HT/TTC.'
  },
  ptba: {
    referenceCode: 'PTBA-FAAB-2026-016',
    locationCity: 'Abidjan & Zones d’Intervention',
    recipientOrg: 'Partenaires Techniques et Financiers (PNUD / Banque Mondiale / BAD / UNICEF / UE)',
    donorDepartment: 'Direction des Opérations, du Portefeuille & des Financements',
    executingOrgName: 'Organisation / Entreprise / Institution Publique ou Privée',
    executingDepartment: 'Unité de Gestion du Projet (UGP / AGEX) & Cellule Suivi-Évaluation (S&E)',
    recipientRepresentative: 'Adoption COPIL : 15 Janvier 2026 · Avis de Non-Objection (ANO) Bailleur : Réf. ANO-IDA-PNUD-2026-004',
    extraField1: 'Sommaire exécutif paginé, liste officielle des sigles et note d’orientation stratégique résumant les priorités annuelles et les arbitrages budgétaires du Comité de Pilotage.',
    contextJustification: 'Bilan d’exécution physique et financière de l’exercice N-1 : taux de réalisation physique WBS, taux de décaissement et analyse des écarts EVM (CV, CPI).',
    extraField2: 'Enseignements clés de l’exercice N-1, réussites opérationnelles majeures, analyse des goulots d’étranglement et justification formelle des reports d’activités sur l’année N.',
    extraField3: 'Processus participatif d’élaboration, d’arbitrage budgétaire intersectoriel, d’examen technique et de validation officielle du PTBA par le Comité de Pilotage et le Bailleur.',
    specificObjectives: 'Alignement stratégique de l’année N, objectifs annuels SMART, contribution aux indicateurs d’effet (Outcomes) et d’extrant (Outputs), valeurs de référence (Baseline), cibles annuelles et hypothèses critiques (Matrice M1).',
    extraField4: 'Déclinaison narrative détaillée par Axe Stratégique / Composante, Sous-composante, Activités, Sous-activités et résultats attendus (extrants).',
    extraField5: 'Ciblage des bénéficiaires directs/indirects et stratégie opérationnelle d’engagement et de mise en œuvre des acteurs et parties prenantes (Matrice M4).',
    methodologyApproach: 'Matrice d’activités WBS et chronogramme annuel Gantt par trimestre (Q1, Q2, Q3, Q4), responsables et livrables attendus (Matrice M2 — [TXT_WBS_PTBA_M2]).',
    extraField6: 'Ordonnancement algorithmique du chemin critique PERT/CPM (durées, antécédents, marges libres et totales) et sécurisation des cibles physiques annuelles.',
    extraField7: 'Budget annuel consolidé par source de financement (Bailleur vs Contrepartie Nationale) et par catégorie de dépense (Matrice M5 — [TXT_BUDGET_EVM_M5]).',
    extraField8: 'Programmation financière trimestrielle (Q1, Q2, Q3, Q4), suivi des engagements, coût réel (AC), valeur acquise (EV), indice CPI et synthèse globale PTBA.',
    extraField9: 'Plan de décaissement prévisionnel, rythme mensuel/trimestriel de consommation des crédits, mobilisation de la contrepartie nationale et seuils de Demande de Renouvellement de Fonds (DRF).',
    extraField10: 'Plan Annuel de Passation des Marchés — PPM Synthétique : fournitures, services de consultants et travaux, méthodes de passation et calendrier DAO/AMI/Contrat (Matrice M8).',
    governanceModalities: 'Gouvernance RACI, organigramme de l’UGP/AGEX, experts mobilisés, qualifications et répartition des charges en Hommes/Jours (Matrice M3 — [TXT_RACI_RH_M3]).',
    confidentialityClauses: 'Dispositif de Suivi-Évaluation GAR, calendrier des revues trimestrielles, missions de supervision, audits et livrables contractuels (Matrice M9 — [TXT_QUALITE_LIVRABLES_M9]).',
    recommendationsLessons: 'Registre annuel des risques opérationnels, fiduciaires et stratégiques (Board RAID — Matrice M7) et mesures d’atténuation préventives.',
    extraField11: 'Annexes opérationnelles : Fiches synthétiques de contractualisation des lots critiques selon la règle des 3R (Responsable unique, Résultat concret, Ressources allouées).',
    fieldPhotosAnnexTitle: 'ANNEXE PHOTOGRAPHIQUE — ILLUSTRATIONS OPÉRATIONNELLES & TERRAIN DU PTBA'
  },
  ptt: {
    referenceCode: 'PTT-FAAB-2026-Q1-017',
    locationCity: 'Abidjan & Sites Opérationnels du Trimestre',
    recipientOrg: 'Comité de Pilotage (COPIL) & Partenaires Techniques et Financiers (PNUD / BM / BAD / UNICEF / UE)',
    donorDepartment: 'Direction du Suivi des Opérations & Contrôle d’Exécution Trimestrielle',
    executingOrgName: 'Organisation / Entreprise / Institution Publique ou Privée',
    executingDepartment: 'Unité de Gestion du Projet (UGP) & Cellule Suivi-Évaluation (S&E)',
    recipientRepresentative: 'Trimestre 1 (Q1 — Horizon 90 jours) · Statut : Validé par l’Unité de Gestion du Projet (UGP)',
    activeQuarter: 'Q1',
    contextJustification: 'Bilan succinct du trimestre écoulé : activités achevées, activités en retard ou reportées, analyse des écarts Kanban/Suivi et arbitrages opérationnels.',
    specificObjectives: 'Priorités opérationnelles extraites du PTBA pour les 90 jours à venir, cibles trimestrielles par projet et sécurisation du chemin critique PERT/CPM.',
    methodologyApproach: 'Planning opérationnel de proximité mois par mois (Mois 1, Mois 2, Mois 3) formulé en verbes d’action avec responsables, associés et livrables attendus à M3 (Matrice M2).',
    extraField1: 'Budget opérationnel et plan de trésorerie trimestriel : besoins réels en liquidités sur Mois 1, Mois 2 et Mois 3 par rubrique et source de financement (Matrice M5).',
    governanceModalities: 'Grille RACI trimestrielle d’équipe (Chef de Projet/Coordonnateur, Responsable S&E, Spécialiste Passation, Comptable/RAF, Consultant/Prestataire — Matrice M3).',
    confidentialityClauses: 'Tableau des livrables opérationnels attendus à 90 jours, critères de contrôle qualité et conditions de validation UGP (Matrice M9).',
    recommendationsLessons: 'Gestion des risques immédiats à 90 jours, contraintes logistiques de terrain et actions correctives immédiates (Matrice M7).',
    fieldPhotosAnnexTitle: 'ANNEXE PHOTOGRAPHIQUE — OPÉRATIONS TERRAIN DU TRIMESTRE (PTT)'
  },
  slides_tdr: {
    referenceCode: 'SLIDES-TDR-2026-016',
    locationCity: 'Abidjan, République de Côte d’Ivoire',
    recipientOrg: 'Partenaires Techniques et Financiers (PNUD / Banque Mondiale / BAD / UE)',
    donorDepartment: 'Direction des Opérations & Financements de Programmes',
    executingOrgName: 'Organisation / Entreprise / Institution Publique ou Privée',
    executingDepartment: 'Direction Générale de la Stratégie & Pilotage des Projets (PMO / S&E)',
    recipientRepresentative: 'Chef de Mission / Coordonnateur du Programme',
    contextJustification: 'Présentation exécutive du Programme basée sur les Termes de Référence (TDR).',
    specificObjectives: 'Validation des objectifs SMART, de l’architecture par composantes, du chemin critique PERT/CPM et du budget.',
    methodologyApproach: 'Approche GAR, planification WBS/PERT (M2), gouvernance RACI (M3) et contrôle qualité des livrables (M9).',
    confidentialityClauses: 'Support officiel de réunion de présentation du programme (TDR).',
    governanceModalities: 'Comité de Pilotage & Équipe Technique PMO.',
    recommendationsLessons: 'Approbation des TDR et lancement immédiat de la mobilisation.',
    slidesConfigJson: ''
  },
  slides_cadrage: {
    referenceCode: 'SLIDES-CAD-2026-017',
    locationCity: 'Abidjan, République de Côte d’Ivoire',
    recipientOrg: 'Comité de Pilotage Stratégique (COPIL) & Partenaires Techniques et Financiers',
    donorDepartment: 'Direction des Programmes & Partenariats Institutionnels',
    executingOrgName: 'Organisation / Entreprise / Institution Publique ou Privée',
    executingDepartment: 'Unité de Gestion du Projet (UGP) & Cellule Suivi-Évaluation (S&E)',
    recipientRepresentative: 'Coordonnateur National / Chef de Mission PMO',
    contextJustification: 'Présentation officielle du Rapport de Cadrage & Cahier des Charges (ProDoc).',
    specificObjectives: 'Validation du diagnostic initial, de la Théorie du Changement (M1), du périmètre théorique vs réel et de la cartographie des parties prenantes (M4).',
    methodologyApproach: 'Structuration WBS/PERT (M2), gouvernance RACI (M3), budget baseline (M5), livrables (M9) et risques (M7).',
    confidentialityClauses: 'Support officiel de réunion de validation du Rapport de Cadrage.',
    governanceModalities: 'Validation en séance plénière du Comité de Pilotage.',
    recommendationsLessons: 'Verrouillage de la Baseline du projet et autorisation de démarrage.',
    slidesConfigJson: ''
  },
  slides_demarrage: {
    referenceCode: 'SLIDES-DEM-2026-018',
    locationCity: 'Abidjan, République de Côte d’Ivoire',
    recipientOrg: 'Autorité Contractante, Comité de Pilotage & Partenaires Techniques et Financiers',
    donorDepartment: 'Secrétariat Technique du COPIL & Direction des Opérations',
    executingOrgName: 'Organisation / Entreprise / Institution Publique ou Privée',
    executingDepartment: 'Unité de Gestion du Projet (UGP) & Équipe de Démarrage (Inception)',
    recipientRepresentative: 'Chef de Mission / Coordonnateur Opérationnel',
    contextJustification: 'Présentation du Rapport de Démarrage (Inception Report) & Kick-Off Meeting officiel.',
    specificObjectives: 'Bilan de la mobilisation des ressources, revue documentaire initiale, outils de collecte (M6) et planning WBS/PERT actualisé (M2).',
    methodologyApproach: 'Déploiement logistique terrain, matrice RACI (M3), calendrier des livrables (M9) et plan d’urgence des risques au démarrage (M7).',
    confidentialityClauses: 'Support officiel de l’Atelier de Démarrage (Kick-Off / Inception).',
    governanceModalities: 'Comité de Pilotage & Équipe Technique UGP.',
    recommendationsLessons: 'Feuille de route immédiate des 30 prochains jours et quitus de démarrage.',
    slidesConfigJson: ''
  },
  slides_ptba: {
    referenceCode: 'SLIDES-PTBA-2026-019',
    locationCity: 'Abidjan & Zones d’Intervention',
    recipientOrg: 'Comité de Pilotage (COPIL) & Partenaires Techniques et Financiers (PNUD / BM / BAD / UE)',
    donorDepartment: 'Direction des Opérations, du Portefeuille & des Financements',
    executingOrgName: 'Organisation / Entreprise / Institution Publique ou Privée',
    executingDepartment: 'Unité de Gestion du Projet (UGP / AGEX) & Cellule Suivi-Évaluation (S&E)',
    recipientRepresentative: 'Coordonnateur UGP & Responsable Administratif et Financier (RAF)',
    activeQuarter: 'Q1',
    slidePtbaPttMode: 'PTBA',
    contextJustification: 'Présentation du Plan de Travail et Budget Annuel (PTBA) pour adoption COPIL et Avis de Non-Objection (ANO) du Bailleur.',
    specificObjectives: 'Bilan de l’exercice N-1, priorités annuelles GAR (M1), déclinaison par composante/axe et chronogramme annuel Gantt Q1–Q4 (M2).',
    methodologyApproach: 'Sécurisation du chemin critique PERT/CPM, budget annuel consolidé Bailleur/Contrepartie (M5), plan de décaissement DRF et passation des marchés PPM (M8).',
    confidentialityClauses: 'Mobilisation RH & RACI (M3), livrables annuels attendus (M9) et risques fiduciaires/opérationnels (M7).',
    governanceModalities: 'Adoption par résolution du Comité de Pilotage et octroi de l’ANO Bailleur.',
    recommendationsLessons: 'Synthèse budgétaire annuelle soumise à approbation et mise en exécution.',
    slidesConfigJson: ''
  },
  slides_ptt: {
    referenceCode: 'SLIDES-PTT-2026-Q1-020',
    locationCity: 'Abidjan & Sites Opérationnels du Trimestre',
    recipientOrg: 'Comité de Pilotage (COPIL) & Unité de Gestion du Projet (UGP)',
    donorDepartment: 'Direction du Suivi des Opérations & Contrôle d’Exécution Trimestrielle',
    executingOrgName: 'Organisation / Entreprise / Institution Publique ou Privée',
    executingDepartment: 'Unité de Gestion du Projet (UGP) & Cellule Suivi-Évaluation (S&E)',
    recipientRepresentative: 'Coordonnateur UGP & Chefs de Projets Opérationnels',
    activeQuarter: 'Q1',
    slidePtbaPttMode: 'PTT',
    contextJustification: 'Présentation du Plan de Travail Trimestriel (PTT — Horizon 90 jours : Mois 1, Mois 2, Mois 3).',
    specificObjectives: 'Bilan rapide du trimestre écoulé, priorités à 90 jours extraites du PTBA et planning opérationnel mois par mois (M2).',
    methodologyApproach: 'Besoin en trésorerie sur 3 mois (M5), grille RACI d’équipe (M3), livrables à 90 jours (M9) et risques immédiats de terrain (M7).',
    confidentialityClauses: 'Support officiel de revue opérationnelle trimestrielle (PTT).',
    governanceModalities: 'Validation opérationnelle par la Coordination UGP et le Comité Technique.',
    recommendationsLessons: 'Autorisation d’exécution des opérations des 90 prochains jours.',
    slidesConfigJson: ''
  },
  slides_mi_parcours: {
    referenceCode: 'SLIDES-EMP-2026-021',
    locationCity: 'Abidjan & Sites Évalués à Mi-Parcours',
    recipientOrg: 'Commission d’Évaluation à Mi-Parcours, Comité de Pilotage & Bailleurs (PNUD / BM / BAD / UE)',
    donorDepartment: 'Comité Conjoint de Suivi à Mi-Parcours & Assurance Qualité (UNEG / OCDE-CAD)',
    executingOrgName: 'Organisation / Entreprise / Institution Publique ou Privée',
    executingDepartment: 'Coordination Nationale, Cellule S&E & Mission de Revue à Mi-Parcours',
    recipientRepresentative: 'Chef de Mission d’Évaluation à Mi-Parcours / Président du Comité',
    contextJustification: 'Présentation de l’Évaluation à Mi-Parcours (Mid-Term Review — MTR) selon les 6 critères internationaux OCDE/CAD.',
    specificObjectives: 'Analyse de la performance à mi-étape (Pertinence, Cohérence, Efficacité M1, Efficience EVM M5), revue des écarts (M2) et viabilité précoce.',
    methodologyApproach: 'Triangulation à 3 niveaux, notation chiffrée OCDE/CAD sur 5 (M6), contraintes structurelles (M7) et plan de réorientation stratégique pour la seconde moitié (M10).',
    confidentialityClauses: 'Support officiel de restitution de la Revue à Mi-Parcours.',
    governanceModalities: 'Groupe de Référence de l’Évaluation (GRE) & Comité de Pilotage (COPIL).',
    recommendationsLessons: 'Validation des ajustements à mi-parcours et adoption du plan d’action correctif (M10).',
    slidesConfigJson: ''
  },
  slides_evaluation_finale: {
    referenceCode: 'SLIDES-EVF-2026-022',
    locationCity: 'Abidjan & Ensemble des Zones d’Intervention',
    recipientOrg: 'Conseil d’Administration, Autorité Contractante & Partenaires Techniques et Financiers',
    donorDepartment: 'Département de l’Évaluation Indépendante, Clôture & Quitus (ICR / UNEG)',
    executingOrgName: 'Organisation / Entreprise / Institution Publique ou Privée',
    executingDepartment: 'Direction Générale, Cellule de Capitalisation & Mission d’Évaluation Finale',
    recipientRepresentative: 'Chef de Mission d’Évaluation Finale / Autorité de Clôture',
    contextJustification: 'Présentation de l’Évaluation Finale & d’Achèvement (Terminal Evaluation / ICR) et Clôture Officielle du Programme.',
    specificObjectives: 'Bilan sommatif définitif selon les 6 critères OCDE/CAD (M6), atteinte finale des extrants et effets (M1), rendement budgétaire final EVM (M5) et impacts durables.',
    methodologyApproach: 'Audit complet des livrables homologués (M9), passation des acquis, stratégie de sortie, capitalisation des leçons apprises et recommandations stratégiques futures (M10).',
    confidentialityClauses: 'Support officiel d’Atelier de Clôture et de délivrance du Quitus Final.',
    governanceModalities: 'Comité de Pilotage, Bailleurs de Fonds & Autorité de Tutelle.',
    recommendationsLessons: 'Approbation du Rapport Final d’Achèvement et octroi du Quitus définitif.',
    slidesConfigJson: ''
  }
};

export const initialDossiers: Dossier[] = [
  {
    id: 'dossier-faab-2026-2030',
    name: 'Plan Stratégique de Développement & Transformation (2026-2030)',
    horizonPlan: '2026-2030',
    psdYear: 2026,
    horizonYears: 5,
    isReadOnly: false,
    type: 'Portefeuille Stratégique',
    institution: 'Organisation / Entreprise / Institution Publique ou Privée',
    description: 'Cadre universel de planification stratégique, d’ordonnancement PERT/CPM, de maîtrise budgétaire et de suivi opérationnel axé sur les résultats (GAR).',
    axes: [
      {
        id: 'axe-1-transfo',
        name: 'Axe 1 : Modernisation des Infrastructures & Transformation Opérationnelle',
        projects: [
          {
            id: 'proj-digital-core',
            name: 'Projet 1 : Déploiement de la Plateforme Intégrée & Digitalisation des Processus',
            tasks: [
              {
                id: 'task-dig-1',
                type: 'tache',
                phase: 'AVANT PROJET',
                name: 'Étude de cadrage architectural et audit des processus métiers existants',
                startDate: '2026-01-10',
                endDate: '2026-02-28',
                actualStartDate: '2026-01-12',
                actualEndDate: '2026-02-25',
                status: 'Terminé',
                assignee: 'Spécialiste PMO / Coordonnateur UGP, Architecte SI & Lead Tech UGP',
                autorite: 'Ministère de Tutelle & COPIL',
                consulte: 'Collectif des Bénéficiaires & Usagers Finaux',
                informe: 'Banque Mondiale & Partenaires Financiers (PTF)',
                responsabilite: 'Architecte Urbaniste SI',
                livrable: 'Schéma directeur & Rapport d’audit',
                budget: 18500000,
                validated: true,
                antecedent: '—'
              },
              {
                id: 'task-dig-jalon-1',
                type: 'jalon',
                phase: 'AVANT PROJET',
                name: 'Validation officielle du Cahier des Charges par le Comité de Pilotage',
                startDate: '2026-03-05',
                endDate: '2026-03-05',
                actualStartDate: '2026-03-05',
                actualEndDate: '2026-03-05',
                status: 'Terminé',
                assignee: 'Spécialiste PMO / Coordonnateur UGP',
                autorite: 'Ministère de Tutelle & COPIL',
                consulte: 'Banque Mondiale & Partenaires Financiers (PTF)',
                informe: 'Collectif des Bénéficiaires & Usagers Finaux',
                responsabilite: 'Président COPIL',
                livrable: 'PV de validation signé',
                budget: 2500000,
                validated: true,
                antecedent: 'task-dig-1'
              },
              {
                id: 'task-dig-2',
                type: 'tache',
                phase: 'CONCEPTION',
                name: 'Conception détaillée des modules fonctionnels et maquettage UX/UI',
                startDate: '2026-03-10',
                endDate: '2026-05-15',
                actualStartDate: '2026-03-14',
                actualEndDate: '2026-05-18',
                status: 'Terminé',
                assignee: 'Consortium Tech & Cabinet Ingénierie (Prestataire), Architecte SI & Lead Tech UGP',
                autorite: 'Spécialiste PMO / Coordonnateur UGP',
                consulte: 'Collectif des Bénéficiaires & Usagers Finaux',
                informe: 'Ministère de Tutelle & COPIL',
                responsabilite: 'Lead Product Designer',
                livrable: 'Dossier de spécifications détaillées',
                budget: 24000000,
                validated: true,
                antecedent: 'task-dig-jalon-1'
              },
              {
                id: 'task-dig-3',
                type: 'tache',
                phase: 'PLANIFICATION',
                name: 'Acquisition des serveurs sécurisés et configuration des environnements Cloud',
                startDate: '2026-05-20',
                endDate: '2026-07-15',
                actualStartDate: '2026-05-25',
                actualEndDate: '',
                status: 'En cours',
                assignee: 'Consortium Tech & Cabinet Ingénierie (Prestataire)',
                autorite: 'Spécialiste PMO / Coordonnateur UGP',
                consulte: 'Autorité Nationale de Régulation & Contrôle',
                informe: 'Banque Mondiale & Partenaires Financiers (PTF)',
                responsabilite: 'Ingénieur DevOps Senior',
                livrable: 'Cluster Cloud Haute Disponibilité',
                budget: 42000000,
                validated: false,
                antecedent: 'task-dig-2'
              },
              {
                id: 'task-dig-4',
                type: 'tache',
                phase: 'EXÉCUTION & SUIVI',
                name: 'Intégration des API d’interopérabilité et migration des bases historiques',
                startDate: '2026-06-01',
                endDate: '2026-08-20',
                actualStartDate: '2026-06-10',
                actualEndDate: '',
                status: 'Bloqué',
                manualBlocked: true,
                assignee: 'Architecte SI & Lead Tech UGP, Cellule Data & Sécurité UGP',
                autorite: 'Spécialiste PMO / Coordonnateur UGP',
                consulte: 'Autorité Nationale de Régulation & Contrôle',
                informe: 'Ministère de Tutelle & COPIL',
                responsabilite: 'Ingénieur Data',
                livrable: 'Passerelles API & Données migrées',
                budget: 31000000,
                validated: false,
                antecedent: 'task-dig-2'
              },
              {
                id: 'task-dig-5',
                type: 'tache',
                phase: 'EXÉCUTION & SUIVI',
                name: 'Tests de charge, audit de cybersécurité et recette utilisateur finale (UAT)',
                startDate: '2026-08-25',
                endDate: '2026-10-30',
                actualStartDate: '',
                actualEndDate: '',
                status: 'À faire',
                assignee: 'Cellule Data & Sécurité UGP',
                autorite: 'Autorité Nationale de Régulation & Contrôle',
                consulte: 'Collectif des Bénéficiaires & Usagers Finaux',
                informe: 'Banque Mondiale & Partenaires Financiers (PTF)',
                responsabilite: 'Responsable QA / RSSI',
                livrable: 'Certificat d’homologation sécurité',
                budget: 19500000,
                validated: false,
                antecedent: 'task-dig-3'
              },
              {
                id: 'task-dig-jalon-2',
                type: 'jalon',
                phase: 'CLÔTURE',
                name: 'Mise en production officielle (Go-Live) et transfert de compétences',
                startDate: '2026-11-15',
                endDate: '2026-11-15',
                actualStartDate: '',
                actualEndDate: '',
                status: 'À faire',
                assignee: 'Spécialiste PMO / Coordonnateur UGP',
                autorite: 'Ministère de Tutelle & COPIL',
                consulte: 'Banque Mondiale & Partenaires Financiers (PTF)',
                informe: 'Collectif des Bénéficiaires & Usagers Finaux',
                responsabilite: 'Directeur de Projet',
                livrable: 'PV de réception définitive',
                budget: 8500000,
                validated: false,
                antecedent: 'task-dig-5'
              }
            ]
          },
          {
            id: 'proj-cap-humain',
            name: 'Projet 2 : Renforcement des Capacités & Conduite du Changement',
            tasks: [
              {
                id: 'task-rh-1',
                type: 'tache',
                phase: 'AVANT PROJET',
                name: 'Cartographie des compétences et évaluation des besoins en formation',
                startDate: '2026-02-01',
                endDate: '2026-03-31',
                actualStartDate: '2026-02-03',
                actualEndDate: '2026-03-28',
                status: 'Terminé',
                assignee: 'Directeur RH & Conduite du Changement',
                autorite: 'Spécialiste PMO / Coordonnateur UGP',
                consulte: 'Collectif des Bénéficiaires & Usagers Finaux',
                informe: 'Ministère de Tutelle & COPIL',
                responsabilite: 'Responsable Formation',
                livrable: 'Plan directeur de formation',
                budget: 12000000,
                validated: true,
                antecedent: '—'
              },
              {
                id: 'task-rh-2',
                type: 'tache',
                phase: 'EXÉCUTION & SUIVI',
                name: 'Sessions de formation certifiantes au pilotage par les résultats (GAR & PERT)',
                startDate: '2026-04-10',
                endDate: '2026-07-20',
                actualStartDate: '2026-04-15',
                actualEndDate: '',
                status: 'En cours',
                assignee: 'Cabinet Partenaire & Formateurs (Prestataire)',
                autorite: 'Directeur RH & Conduite du Changement',
                consulte: 'Spécialiste PMO / Coordonnateur UGP',
                informe: 'Banque Mondiale & Partenaires Financiers (PTF), Collectif des Bénéficiaires & Usagers Finaux',
                responsabilite: 'Expert Formateur PMP/GAR',
                livrable: '120 cadres et chefs de projets certifiés',
                budget: 26500000,
                validated: false,
                antecedent: 'task-rh-1'
              }
            ]
          }
        ]
      },
      {
        id: 'axe-2-gouvernance',
        name: 'Axe 2 : Excellence Opérationnelle, Qualité & Performance Durable',
        projects: [
          {
            id: 'proj-iso-qualite',
            name: 'Projet 1 : Certification Qualité ISO 9001 & Optimisation de la Chaîne Logistique',
            tasks: [
              {
                id: 'task-iso-1',
                type: 'tache',
                phase: 'AVANT PROJET',
                name: 'Diagnostic initial de conformité aux normes internationales ISO 9001',
                startDate: '2026-01-15',
                endDate: '2026-03-15',
                actualStartDate: '2026-01-15',
                actualEndDate: '2026-03-14',
                status: 'Terminé',
                assignee: 'Cellule Data & Sécurité UGP',
                autorite: 'Spécialiste PMO / Coordonnateur UGP',
                consulte: 'Autorité Nationale de Régulation & Contrôle',
                informe: 'Ministère de Tutelle & COPIL',
                responsabilite: 'Auditeur Qualité Principal',
                livrable: 'Rapport de diagnostic qualité',
                budget: 15000000,
                validated: true,
                antecedent: '—'
              },
              {
                id: 'task-iso-2',
                type: 'tache',
                phase: 'CONCEPTION',
                name: 'Rédaction du manuel qualité et formalisation des procédures opérationnelles',
                startDate: '2026-03-20',
                endDate: '2026-06-30',
                actualStartDate: '2026-03-25',
                actualEndDate: '',
                status: 'En cours',
                assignee: 'Spécialiste PMO / Coordonnateur UGP, Directeur RH & Conduite du Changement',
                autorite: 'Ministère de Tutelle & COPIL',
                consulte: 'Banque Mondiale & Partenaires Financiers (PTF)',
                informe: 'Collectif des Bénéficiaires & Usagers Finaux',
                responsabilite: 'Responsable Management Qualité',
                livrable: 'Référentiel des procédures validé',
                budget: 21000000,
                validated: false,
                antecedent: 'task-iso-1'
              }
            ]
          }
        ]
      }
    ]
  },
  {
    id: 'dossier-programme-annuel',
    name: 'Programme Opérationnel Annuel & Investissements Prioritaires (2025-2026)',
    horizonPlan: '2025-2026',
    psdYear: 2025,
    horizonYears: 2,
    isReadOnly: false,
    type: 'Programme Opérationnel',
    institution: 'Direction des Opérations & Projets',
    description: 'Portefeuille de suivi rapproché des projets d’investissement à impact rapide et d’exécution budgétaire annuelle.',
    axes: [
      {
        id: 'axe-ops-1',
        name: 'Axe 1 : Déploiement Régional & Équipements Stratégiques',
        projects: [
          {
            id: 'proj-ops-equip',
            name: 'Projet d’aménagement et d’équipement des unités opérationnelles régionales',
            tasks: [
              {
                id: 'task-eq-1',
                type: 'tache',
                phase: 'AVANT PROJET',
                name: 'Passation des marchés et sélection des fournisseurs agréés',
                startDate: '2025-03-01',
                endDate: '2025-05-30',
                actualStartDate: '2025-03-04',
                actualEndDate: '2025-05-28',
                status: 'Terminé',
                assignee: 'Spécialiste Passation des Marchés (SPM), Spécialiste PMO / Coordonnateur UGP',
                autorite: 'Ministère de Tutelle & COPIL',
                consulte: 'Banque Mondiale & Partenaires Financiers (PTF)',
                informe: 'Collectif des Bénéficiaires & Usagers Finaux',
                responsabilite: 'Spécialiste Passation des Marchés',
                livrable: 'Contrats attribués et notifiés',
                budget: 35000000,
                validated: true,
                antecedent: '—'
              },
              {
                id: 'task-eq-2',
                type: 'jalon',
                phase: 'CLÔTURE',
                name: 'Réception définitive et mise en service des équipements sur sites',
                startDate: '2025-11-15',
                endDate: '2025-11-15',
                actualStartDate: '2025-11-15',
                actualEndDate: '2025-11-15',
                status: 'Terminé',
                assignee: 'Consortium Tech & Cabinet Ingénierie (Prestataire)',
                autorite: 'Spécialiste PMO / Coordonnateur UGP',
                consulte: 'Autorité Nationale de Régulation & Contrôle',
                informe: 'Collectif des Bénéficiaires & Usagers Finaux',
                responsabilite: 'Chef de Service Logistique',
                livrable: 'Procès-verbal de réception',
                budget: 14000000,
                validated: true,
                antecedent: 'task-eq-1'
              }
            ]
          }
        ]
      }
    ]
  }
];

/**
 * Déduit automatiquement la catégorie métier parmi les 5 catégories obligatoires :
 * 1. Bénéficiaires
 * 2. Interne
 * 3. Externe
 * 4. Prestataire
 * 5. Partenaire Financier
 */
export function inferActorCategory(
  actorName: string,
  userProfile?: UserProfile
): ActorCategoryType {
  const clean = (actorName || '').trim().toLowerCase();
  if (!clean) return 'Interne';

  if (
    userProfile?.fullName &&
    clean === userProfile.fullName.trim().toLowerCase()
  ) {
    return 'Interne';
  }

  // 1. Bénéficiaires
  if (
    /bénéficiair|beneficiair|population|communaut|usager|citoyen|coopérativ|cooperativ|ménage|menage|jeune|femme|producteur|élève|eleve|étudiant|etudiant|patient|groupement des usagers|cible|association locale/.test(
      clean
    )
  ) {
    return 'Bénéficiaires';
  }

  // 5. Partenaire Financier
  if (
    /bailleur|banque mondiale|bm\b|ida\b|bird\b|bad\b|banque africaine|union européenne|\bue\b|pnud|undp|afd\b|kfw|giz|fida|unicef|fmi|bid\b|boad|partenaire financier|partenaires financiers|ptf\b|fonds/.test(
      clean
    )
  ) {
    return 'Partenaire Financier';
  }

  // 4. Prestataire
  if (
    /prestataire|cabinet|consultant|entreprise|fournisseur|opérateur|operateur|bureau d'études|bureau d’études|groupement d'entreprises|btp|adjudicataire|contractant|société|societe|consortium|formateur/.test(
      clean
    )
  ) {
    return 'Prestataire';
  }

  // 3. Externe (Tutelle, État, Régulation, Contrôle, Comité interministériel)
  if (
    /ministère|ministere|tutelle|autorité|autorite|régulat|regulat|contrôle|controle|inspection|cour des comptes|préfet|prefet|mairie|collectivité|collectivite|état|etat|douane|impôt|impot|comité de pilotage|comite de pilotage|copil|secrétariat général du gouvernement|direction générale du budget|dgb|marchés publics|anrmp|dmp/.test(
      clean
    )
  ) {
    return 'Externe';
  }

  // 2. Interne (par défaut pour l'équipe projet UGP/AGEX/PMO, coordonnateur, experts internes, directions internes)
  return 'Interne';
}

const SEED_ACTOR_DETAILS: Record<
  string,
  Partial<CategorizedActor>
> = {
  'spécialiste pmo / coordonnateur ugp': {
    category: 'Interne',
    roleOrFunction: 'Coordonnateur Général & Architecte du Pilotage Stratégique (PMO / GAR)',
    organization: 'Direction Générale de la Stratégie & Pilotage des Projets (UGP)',
    department: 'Coordination Générale & Unité de Gestion (UGP / PMO)',
    email: 'coordonnateur.pmo@ugp-programme.ci',
    phone: '+225 07 48 08 27 39',
    address: 'Siège UGP — Plateau, Abidjan, Côte d’Ivoire',
    governanceInstance: 'COPIL & COPROJ'
  },
  'architecte si & lead tech ugp': {
    category: 'Interne',
    roleOrFunction: 'Architecte Urbaniste SI & Lead Technique UGP',
    organization: 'Direction Générale de la Stratégie & Pilotage des Projets (UGP)',
    department: 'Direction Technique & Architecture Numérique',
    email: 'arch.tech@ugp-programme.ci',
    phone: '+225 07 08 45 12 90',
    address: 'Abidjan — Cocody Riviera 3, Côte d’Ivoire',
    governanceInstance: 'COPROJ'
  },
  'directeur rh & conduite du changement': {
    category: 'Interne',
    roleOrFunction: 'Directeur des Ressources Humaines & Conduite du Changement',
    organization: 'Direction Générale de la Stratégie & Pilotage des Projets (UGP)',
    department: 'Département Capital Humain & Renforcement des Capacités',
    email: 'drh.changement@ugp-programme.ci',
    phone: '+225 05 04 33 21 10',
    address: 'Abidjan — Plateau, Avenue Lamblin',
    governanceInstance: 'COPROJ'
  },
  'spécialiste passation des marchés (spm)': {
    category: 'Interne',
    roleOrFunction: 'Spécialiste Principal en Passation des Marchés (SPM)',
    organization: 'Direction des Opérations & Projets (UGP)',
    department: 'Cellule Passation des Marchés & Contrats Publics',
    email: 'spm.marches@ugp-programme.ci',
    phone: '+225 27 20 25 88 99',
    address: 'Siège UGP — Abidjan, Côte d’Ivoire',
    governanceInstance: 'COPROJ'
  },
  'koffie fabien michael': {
    category: 'Interne',
    roleOrFunction: 'Coordonnateur Général & Architecte du Pilotage Stratégique (PMO / GAR)',
    organization: 'Direction Générale de la Stratégie & Pilotage des Projets (UGP)',
    department: 'Coordination Générale & Unité de Gestion (UGP / PMO)',
    email: 'coordonnateur.pmo@ugp-programme.ci',
    phone: '+225 07 48 08 27 39',
    address: 'Siège UGP — Plateau, Abidjan, Côte d’Ivoire',
    governanceInstance: 'COPIL & COPROJ'
  },
  'kouassi marc': {
    category: 'Interne',
    roleOrFunction: 'Architecte Urbaniste SI & Lead Technique UGP',
    organization: 'Direction Générale de la Stratégie & Pilotage des Projets (UGP)',
    department: 'Direction Technique & Architecture Numérique',
    email: 'arch.tech@ugp-programme.ci',
    phone: '+225 07 08 45 12 90',
    address: 'Abidjan — Cocody Riviera 3, Côte d’Ivoire',
    governanceInstance: 'COPROJ'
  },
  'bamba aminata (drh ugp)': {
    category: 'Interne',
    roleOrFunction: 'Directrice des Ressources Humaines & Conduite du Changement',
    organization: 'Direction Générale de la Stratégie & Pilotage des Projets (UGP)',
    department: 'Département Capital Humain & Renforcement des Capacités',
    email: 'drh.changement@ugp-programme.ci',
    phone: '+225 05 04 33 21 10',
    address: 'Abidjan — Plateau, Avenue Lamblin',
    governanceInstance: 'COPROJ'
  },
  'cellule data & sécurité ugp': {
    category: 'Interne',
    roleOrFunction: 'Équipe Ingénierie Data, Qualité ISO 9001 & Cybersécurité (RSSI)',
    organization: 'Direction Générale de la Stratégie & Pilotage des Projets (UGP)',
    department: 'Cellule Qualité, Sécurité & Gouvernance des Données',
    email: 'data.securite@ugp-programme.ci',
    phone: '+225 27 20 31 44 55',
    address: 'Abidjan — Centre Technique Numérique UGP',
    governanceInstance: 'COPROJ'
  },
  'commission des marchés ugp': {
    category: 'Interne',
    roleOrFunction: 'Spécialiste Principal en Passation des Marchés (SPM)',
    organization: 'Direction des Opérations & Projets (UGP)',
    department: 'Cellule Passation des Marchés & Contrats Publics',
    email: 'spm.marches@ugp-programme.ci',
    phone: '+225 27 20 25 88 99',
    address: 'Siège UGP — Abidjan, Côte d’Ivoire',
    governanceInstance: 'COPROJ'
  },
  'ministère de tutelle & copil': {
    category: 'Externe',
    roleOrFunction: 'Présidence du Comité de Pilotage, Tutelle & Approbation Stratégique',
    organization: 'Ministère de Tutelle Technique & Cabinet Ministériel',
    department: 'Direction Générale de la Planification & du Suivi des Programmes',
    email: 'president.copil@ministere-tutelle.gouv.ci',
    phone: '+225 27 20 21 00 11',
    address: 'Cité Administrative Tour B, Plateau, Abidjan',
    governanceInstance: 'COPIL'
  },
  'autorité nationale de régulation & contrôle': {
    category: 'Externe',
    roleOrFunction: 'Autorité de Régulation, Visas Réglementaires & Audit de Conformité',
    organization: 'Autorité Nationale de Régulation & Inspection Générale',
    department: 'Direction du Contrôle des Normes, Visas & Homologations',
    email: 'controle.conformite@regulation.gouv.ci',
    phone: '+225 27 20 22 44 66',
    address: 'Plateau, Boulevard Angoulvant, Abidjan',
    governanceInstance: 'COPIL'
  },
  'consortium tech & cabinet ingénierie (prestataire)': {
    category: 'Prestataire',
    roleOrFunction: 'Groupement Titulaire du Marché & Déploiement des Infrastructures SI',
    organization: 'Consortium Tech International & Bureau d’Études Associé',
    department: 'Direction de Projet Adjudicataire & Ingénierie Cloud',
    email: 'direction.mission@consortium-tech.com',
    phone: '+225 07 59 88 77 66',
    address: 'Zone 4C, Marcory, Abidjan, Côte d’Ivoire',
    governanceInstance: 'Opérationnel / Aucun'
  },
  'cabinet partenaire & formateurs (prestataire)': {
    category: 'Prestataire',
    roleOrFunction: 'Cabinet Certifié PMP / GAR / Suivi-Évaluation & Ingénierie Pédagogique',
    organization: 'Institut International de Management & Conseil (IIMC)',
    department: 'Pôle Certification & Formation Continue des Cadres',
    email: 'formation.gar@cabinet-iimc.org',
    phone: '+225 01 02 90 80 70',
    address: 'Cocody Deux-Plateaux Vallons, Abidjan',
    governanceInstance: 'Opérationnel / Aucun'
  },
  'banque mondiale & partenaires financiers (ptf)': {
    category: 'Partenaire Financier',
    roleOrFunction: 'Bailleur de Fonds, Supervision Fiduciaire & Avis de Non-Objection (ANO)',
    organization: 'Groupe de la Banque Mondiale / BAD / Union Européenne / PNUD',
    department: 'Division des Opérations & Financements de Projets Pays',
    email: 'ttl.operations@worldbank-ptf.org',
    phone: '+225 27 22 40 02 00',
    address: 'Cocody Ambassades, Rue Booker Washington, Abidjan',
    governanceInstance: 'COPIL'
  },
  'collectif des bénéficiaires & usagers finaux': {
    category: 'Bénéficiaires',
    roleOrFunction: 'Représentants des Populations Cibles, Usagers & Organisations Bénéficiaires',
    organization: 'Fédération Nationale des Usagers & Comités Locaux Bénéficiaires',
    department: 'Comité Participatif de Suivi Citoyen & Réception Sociale',
    email: 'porte.parole@beneficiaires-programme.ci',
    phone: '+225 07 09 11 22 33',
    address: 'District Autonome d’Abidjan & Régions Cibles',
    governanceInstance: 'Opérationnel / Aucun'
  }
};

/**
 * Construit et synchronise la liste des acteurs classés dans les 5 catégories obligatoires
 * pour un Programme donné (ventilés par Axe et par Projet), en dépendance à 100 % avec l'onglet RACI.
 * Aucun acteur fantôme n'est injecté : seuls les acteurs figurant dans les tâches RACI du programme apparaissent.
 */
export function ensureDossierCategorizedActors(
  dossier: Dossier,
  userProfile: UserProfile = defaultUserProfile
): CategorizedActor[] {
  const existing = Array.isArray(dossier.categorizedActors)
    ? dossier.categorizedActors
    : [];

  // Map des métadonnées existantes (modifiées par l'utilisateur dans l'onglet Catégorie)
  const existingByKey = new Map<string, CategorizedActor>();
  const existingById = new Map<string, CategorizedActor>();
  existing.forEach(item => {
    if (item && item.name) {
      existingByKey.set(item.name.trim().toLowerCase(), item);
      if (item.id) existingById.set(item.id, item);
    }
  });

  const baseOrg =
    dossier.institution ||
    userProfile.institution ||
    'Unité de Gestion du Programme (UGP / AGEX)';

  const splitNames = (raw?: string): string[] => {
    if (!raw) return [];
    return raw
      .split(',')
      .map(s => s.trim())
      .filter(
        s =>
          s.length > 0 &&
          s !== '—' &&
          s !== '-' &&
          s.toLowerCase() !== 'néant' &&
          s.toLowerCase() !== 'neant' &&
          s.toLowerCase() !== 'none' &&
          s.toLowerCase() !== 'n/a'
      );
  };

  // Parcourir exclusivement les tâches WBS / RACI du programme actif
  const activeRaciMap = new Map<
    string,
    {
      displayName: string;
      roles: Set<'R' | 'A' | 'C' | 'I'>;
      axeIds: Set<string>;
      projectIds: Set<string>;
      firstAxeId: string;
      firstProjectId: string;
      firstProjectName: string;
      firstAxeName: string;
    }
  >();

  (dossier.axes || []).forEach(axe => {
    (axe.projects || []).forEach(proj => {
      (proj.tasks || []).forEach(task => {
        const registerNames = (names: string[], role: 'R' | 'A' | 'C' | 'I') => {
          names.forEach(rawName => {
            const normKey = rawName.toLowerCase();
            let entry = activeRaciMap.get(normKey);
            if (!entry) {
              entry = {
                displayName: rawName,
                roles: new Set<'R' | 'A' | 'C' | 'I'>(),
                axeIds: new Set<string>(),
                projectIds: new Set<string>(),
                firstAxeId: axe.id,
                firstProjectId: proj.id,
                firstProjectName: proj.name,
                firstAxeName: axe.name
              };
              activeRaciMap.set(normKey, entry);
            }
            entry.roles.add(role);
            entry.axeIds.add(axe.id);
            entry.projectIds.add(proj.id);
          });
        };

        const rNames = splitNames(task.assignee || task.raciR || task.responsabilite);
        const aNames = splitNames(task.autorite || task.raciA);
        const cNames = splitNames(task.consulte || task.raciC);
        const iNames = splitNames(task.informe || task.raciI);

        registerNames(rNames, 'R');
        registerNames(aNames, 'A');
        registerNames(cNames, 'C');
        registerNames(iNames, 'I');
      });
    });
  });

  const result: CategorizedActor[] = [];
  let seq = 1;

  activeRaciMap.forEach((raciInfo, normKey) => {
    const saved = existingByKey.get(normKey);
    const seedMeta = SEED_ACTOR_DETAILS[normKey] || {};
    const isPrincipalUser =
      userProfile?.fullName &&
      normKey === userProfile.fullName.trim().toLowerCase();

    const inferredCat =
      saved?.category ||
      seedMeta.category ||
      inferActorCategory(raciInfo.displayName, userProfile);

    const codeSuffix = String(seq++).padStart(3, '0');
    const rolesArr = Array.from(raciInfo.roles);

    const defaultOrgByCat: Record<ActorCategoryType, string> = {
      Bénéficiaires: 'Fédération Nationale des Usagers & Communautés Cibles',
      Interne: baseOrg,
      Externe: 'Ministère de Tutelle & Autorité Nationale de Régulation',
      Prestataire: 'Consortium d’Exécution Technique & Cabinet Adjudicataire',
      'Partenaire Financier':
        'Partenaires Techniques et Financiers (BM / BAD / UE / PNUD)'
    };
    const defaultDeptByCat: Record<ActorCategoryType, string> = {
      Bénéficiaires: 'Comité Participatif de Suivi Citoyen & Réception Sociale',
      Interne: 'Unité de Gestion du Programme (UGP / Direction Technique)',
      Externe: 'Direction Générale de la Tutelle & Contrôle de Conformité',
      Prestataire: 'Direction de Mission & Équipe d’Ingénierie Conseil',
      'Partenaire Financier': 'Division des Opérations & Financements de Projets'
    };

    const defaultGovernance =
      saved?.governanceInstance ||
      seedMeta.governanceInstance ||
      (inferredCat === 'Externe' || inferredCat === 'Partenaire Financier'
        ? 'COPIL'
        : inferredCat === 'Interne'
        ? isPrincipalUser
          ? 'COPIL & COPROJ'
          : 'COPROJ'
        : 'Opérationnel / Aucun');

    // Rattachement Axe / Projet : si l'acteur n'intervient que sur un Axe/Projet ou si l'utilisateur l'a affecté, le conserver
    const resolvedAxeId =
      saved?.axeId && saved.axeId !== 'ALL' && raciInfo.axeIds.has(saved.axeId)
        ? saved.axeId
        : raciInfo.firstAxeId;
    const resolvedProjectId =
      saved?.projectId &&
      saved.projectId !== 'ALL' &&
      raciInfo.projectIds.has(saved.projectId)
        ? saved.projectId
        : raciInfo.firstProjectId;

    result.push({
      id: saved?.id || `cat-act-${dossier.id}-${codeSuffix}`,
      name: saved?.name || raciInfo.displayName,
      category: inferredCat,
      dossierId: dossier.id,
      axeId: resolvedAxeId,
      projectId: resolvedProjectId,
      roleOrFunction:
        saved?.roleOrFunction ||
        seedMeta.roleOrFunction ||
        (isPrincipalUser
          ? userProfile.role ||
            'Coordonnateur Général & Architecte du Pilotage Stratégique (PMO)'
          : inferredCat === 'Interne'
          ? `Responsable Opérationnel & Expert UGP (${rolesArr.join('/')})`
          : inferredCat === 'Externe'
          ? 'Autorité d’Approbation, Visa Réglementaire & Contrôle'
          : inferredCat === 'Prestataire'
          ? 'Opérateur Économique Titulaire & Exécution des Livrables'
          : inferredCat === 'Partenaire Financier'
          ? 'Chargé de Programme & Avis de Non-Objection (ANO)'
          : 'Représentant des Bénéficiaires & Usagers Finaux'),
      organization:
        saved?.organization ||
        seedMeta.organization ||
        (isPrincipalUser
          ? userProfile.institution || baseOrg
          : defaultOrgByCat[inferredCat]),
      department:
        saved?.department ||
        seedMeta.department ||
        defaultDeptByCat[inferredCat],
      email:
        saved?.email ||
        seedMeta.email ||
        (isPrincipalUser
          ? userProfile.email
          : `${raciInfo.displayName
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '.')
              .replace(/^\.+|\.+$/g, '')}@${
              inferredCat === 'Interne'
                ? 'ugp-programme.ci'
                : 'partenaire-projet.org'
            }`),
      phone:
        saved?.phone ||
        seedMeta.phone ||
        (isPrincipalUser ? userProfile.phone : '+225 27 20 00 12 34'),
      address:
        saved?.address ||
        seedMeta.address ||
        (isPrincipalUser
          ? userProfile.residenceCity || 'Abidjan, Côte d’Ivoire'
          : 'Abidjan, Côte d’Ivoire'),
      website: saved?.website || 'www.programme-pilote.org',
      matricule:
        saved?.matricule ||
        (inferredCat === 'Interne'
          ? `MAT-UGP-${codeSuffix}`
          : `EXT-${inferredCat.slice(0, 3).toUpperCase()}-${codeSuffix}`),
      raciRoles: rolesArr.length > 0 ? rolesArr : ['R'],
      accreditationLevel:
        saved?.accreditationLevel ||
        (inferredCat === 'Interne'
          ? 'ZONE A — ACCÈS TOTAL UGP & SITES'
          : 'ACCÈS PARTENAIRE / INSTANCE DE GOUVERNANCE'),
      badgeValidity: saved?.badgeValidity || '31/12/2026',
      influenceLevel:
        saved?.influenceLevel ||
        (rolesArr.includes('A') || rolesArr.includes('R') ? 'Élevée' : 'Moyenne'),
      expectationsAndRole:
        saved?.expectationsAndRole ||
        `Intervention RACI [${rolesArr.join('/')}] sur « ${raciInfo.firstProjectName} » (${raciInfo.firstAxeName}).`,
      photoDataUrl:
        saved?.photoDataUrl ||
        (isPrincipalUser ? userProfile.cvPhotoDataUrl || '' : ''),
      governanceInstance: defaultGovernance
    });
  });

  // Trier selon l'ordre strict des 5 catégories : 1. Bénéficiaires, 2. Interne, 3. Externe, 4. Prestataire, 5. Partenaire Financier
  const orderMap: Record<ActorCategoryType, number> = {
    Bénéficiaires: 1,
    Interne: 2,
    Externe: 3,
    Prestataire: 4,
    'Partenaire Financier': 5
  };

  return result.sort((a, b) => {
    const diff = (orderMap[a.category] || 99) - (orderMap[b.category] || 99);
    if (diff !== 0) return diff;
    return a.name.localeCompare(b.name);
  });
}

/**
 * Renomme un acteur dans toutes les cellules RACI (R, A, C, I) des tâches d'un Programme
 * afin de maintenir la synchronisation à 100 % entre l'onglet Catégorie et l'onglet RACI.
 */
export function renameActorInDossierTasks(
  dossier: Dossier,
  oldName: string,
  newName: string
): Dossier {
  const cleanOld = (oldName || '').trim().toLowerCase();
  const cleanNew = (newName || '').trim();
  if (!cleanOld || !cleanNew || cleanOld === cleanNew.toLowerCase()) {
    return dossier;
  }

  const replaceInList = (raw?: string): string | undefined => {
    if (!raw) return raw;
    const parts = raw.split(',').map(p => p.trim());
    let changed = false;
    const updated = parts.map(p => {
      if (p.toLowerCase() === cleanOld) {
        changed = true;
        return cleanNew;
      }
      return p;
    });
    return changed ? updated.join(', ') : raw;
  };

  return {
    ...dossier,
    axes: (dossier.axes || []).map(axe => ({
      ...axe,
      projects: (axe.projects || []).map(proj => ({
        ...proj,
        tasks: (proj.tasks || []).map(task => ({
          ...task,
          assignee: replaceInList(task.assignee) || task.assignee,
          raciR: replaceInList(task.raciR),
          autorite: replaceInList(task.autorite),
          raciA: replaceInList(task.raciA),
          consulte: replaceInList(task.consulte),
          raciC: replaceInList(task.raciC),
          informe: replaceInList(task.informe),
          raciI: replaceInList(task.raciI)
        }))
      }))
    }))
  };
}

/**
 * Retourne exclusivement les noms des acteurs classés dans la catégorie « Interne »
 * (ainsi que l'utilisateur principal connecté) pour la génération de CV, Carte de Visite et Badge d'Accès.
 */
export function resolveInternalOnlyActorsForDossier(
  dossier: Dossier,
  userProfile: UserProfile
): CategorizedActor[] {
  const allCategorized = ensureDossierCategorizedActors(dossier, userProfile);
  return allCategorized.filter(actor => actor.category === 'Interne');
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB non supporté'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
      if (!db.objectStoreNames.contains(PROGRAMMES_STORE)) {
        db.createObjectStore(PROGRAMMES_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(ACTOR_PROFILES_STORE)) {
        db.createObjectStore(ACTOR_PROFILES_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadActorProfilesFromIDB(
  dossierId: string
): Promise<Record<string, InternalActorProfile>> {
  const scopedKey = getScopedDossierKey(dossierId);
  try {
    const db = await openDB();
    return new Promise(resolve => {
      const tx = db.transaction(ACTOR_PROFILES_STORE, 'readonly');
      const store = tx.objectStore(ACTOR_PROFILES_STORE);
      const req = store.get(scopedKey);
      req.onsuccess = () => {
        if (req.result && typeof req.result === 'object') {
          resolve(req.result);
        } else {
          try {
            const fallback = localStorage.getItem(
              `faab_plan_internal_actors_${scopedKey}`
            );
            resolve(fallback ? safeJsonParse(fallback, {}) : {});
          } catch {
            resolve({});
          }
        }
      };
      req.onerror = () => resolve({});
    });
  } catch {
    try {
      const fallback = localStorage.getItem(
        `faab_plan_internal_actors_${scopedKey}`
      );
      return fallback ? safeJsonParse(fallback, {}) : {};
    } catch {
      return {};
    }
  }
}

export async function saveActorProfilesToIDB(
  dossierId: string,
  profiles: Record<string, InternalActorProfile>
): Promise<void> {
  const scopedKey = getScopedDossierKey(dossierId);
  try {
    localStorage.setItem(
      `faab_plan_internal_actors_${scopedKey}`,
      JSON.stringify(profiles)
    );
  } catch {
    // Ignore localStorage quota limits; IndexedDB handles unlimited binary/photo storage
  }
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(ACTOR_PROFILES_STORE, 'readwrite');
      const store = tx.objectStore(ACTOR_PROFILES_STORE);
      const req = store.put(profiles, scopedKey);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Erreur sauvegarde profils acteurs dans IndexedDB:', err);
  }
}

export async function loadAppStateFromIDB(
  explicitUid?: string | null
): Promise<Partial<AppPersistedState> | null> {
  const scopedStateKey = getScopedStateKey(explicitUid);
  // Strict isolation: if no authenticated Regular User UID is active, never load any user workspace
  if (!scopedStateKey) {
    return null;
  }
  const uid = (explicitUid ?? activeUserStorageUid ?? '').trim();

  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(
        [STORE_NAME, PROGRAMMES_STORE, ACTOR_PROFILES_STORE],
        'readonly'
      );
      const store = tx.objectStore(STORE_NAME);
      const progStore = tx.objectStore(PROGRAMMES_STORE);
      const req = store.get(scopedStateKey);
      req.onsuccess = () => {
        const mainState = (req.result || null) as Partial<AppPersistedState> | null;
        if (!mainState) {
          resolve(null);
          return;
        }
        // Reconcile only programmes belonging to this exact user UID
        const getAllReq = progStore.getAll();
        getAllReq.onsuccess = () => {
          const prefix = `${uid}::`;
          const storedProgrammes = (getAllReq.result || []) as Array<
            Dossier & { _originalId?: string }
          >;
          if (storedProgrammes.length > 0 && Array.isArray(mainState.dossiers)) {
            const mapById = new Map<string, Dossier>();
            storedProgrammes.forEach(p => {
              if (p && typeof p.id === 'string' && p.id.startsWith(prefix)) {
                const realId = p._originalId || p.id.slice(prefix.length);
                const cleanProg: Dossier = { ...p, id: realId };
                delete (cleanProg as any)._originalId;
                mapById.set(realId, cleanProg);
              }
            });
            mainState.dossiers = mainState.dossiers.map(
              d => mapById.get(d.id) || d
            );
          }
          resolve(mainState);
        };
        getAllReq.onerror = () => resolve(mainState);
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Fallback lecture localStorage:', err);
    try {
      const raw = localStorage.getItem(scopedStateKey);
      return raw ? safeJsonParse(raw, null) : null;
    } catch {
      return null;
    }
  }
}

export async function saveAppStateToIDB(
  state: AppPersistedState,
  explicitUid?: string | null
): Promise<void> {
  const scopedStateKey = getScopedStateKey(explicitUid);
  // Strict isolation: never persist workspace if no Regular User UID is active
  if (!scopedStateKey) {
    return;
  }

  try {
    localStorage.setItem(scopedStateKey, JSON.stringify(state));
  } catch {
    // Ignore storage quota warnings on fallback
  }
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(
        [STORE_NAME, PROGRAMMES_STORE, ACTOR_PROFILES_STORE],
        'readwrite'
      );
      const store = tx.objectStore(STORE_NAME);
      const progStore = tx.objectStore(PROGRAMMES_STORE);
      const profilesStore = tx.objectStore(ACTOR_PROFILES_STORE);

      store.put(state, scopedStateKey);

      // Save each Programme (Dossier) strictly scoped to the current user's UID
      (state.dossiers || []).forEach(dossier => {
        if (dossier && dossier.id) {
          const scopedProgKey = getScopedDossierKey(dossier.id, explicitUid);
          progStore.put({
            ...dossier,
            id: scopedProgKey,
            _originalId: dossier.id
          });
          if (
            dossier.actorProfiles &&
            Object.keys(dossier.actorProfiles).length > 0
          ) {
            profilesStore.put(dossier.actorProfiles, scopedProgKey);
          }
        }
      });

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('Erreur sauvegarde IndexedDB:', err);
  }
}

export function createInitialState(): AppPersistedState {
  const clonedDossiers: Dossier[] = JSON.parse(JSON.stringify(initialDossiers));
  const enrichedDossiers = clonedDossiers.map(d => ({
    ...d,
    categorizedActors: ensureDossierCategorizedActors(d, defaultUserProfile),
    actorProfiles: d.actorProfiles || {},
    customDocsData: d.customDocsData || JSON.parse(JSON.stringify(defaultCustomDocsData))
  }));

  return {
    userProfile: { ...defaultUserProfile },
    dossiers: enrichedDossiers,
    activeDossierId: enrichedDossiers[0].id,
    language: 'FR',
    currency: 'FCFA',
    theme: 'light',
    lastJsonFileName: 'FAAB_PLAN_Portefeuille.json',
    activeTab: 'landing',
    customDocsData: { ...defaultCustomDocsData }
  };
}

export async function loadStateFromDB(): Promise<AppPersistedState> {
  const initial = createInitialState();
  const loaded = await loadAppStateFromIDB();
  if (!loaded) return initial;
  const mergedUserProfile: UserProfile = {
    ...initial.userProfile,
    ...(loaded.userProfile || {})
  };
  const rawDossiers =
    Array.isArray(loaded.dossiers) && loaded.dossiers.length > 0
      ? loaded.dossiers
      : initial.dossiers;

  // One-time migration for pre-existing IndexedDB states so the initial seed tasks have full RACI (R, A, C, I) across all 5 categories, while keeping any user edits/deletions 100% permanent afterwards
  let needsSeedUpgrade = false;
  try {
    if (!localStorage.getItem('faab_raci_seed_v3')) {
      needsSeedUpgrade = true;
      localStorage.setItem('faab_raci_seed_v3', '1');
    }
  } catch {
    // ignore storage errors
  }

  const seedTaskMap = new Map<string, any>();
  if (needsSeedUpgrade) {
    initialDossiers.forEach(initDos => {
      (initDos.axes || []).forEach(ax => {
        (ax.projects || []).forEach(pr => {
          (pr.tasks || []).forEach(tk => {
            seedTaskMap.set(tk.id, tk);
          });
        });
      });
    });
  }

  // Ensure every programme container has its categorizedActors, customDocsData and actorProfiles
  const dossiers: Dossier[] = rawDossiers.map(d => {
    const upgradedAxes = needsSeedUpgrade
      ? (d.axes || []).map(ax => ({
          ...ax,
          projects: (ax.projects || []).map(pr => ({
            ...pr,
            tasks: (pr.tasks || []).map(tk => {
              const seedTk = seedTaskMap.get(tk.id);
              if (seedTk && !tk.autorite && !tk.consulte && !tk.informe) {
                return {
                  ...tk,
                  assignee: seedTk.assignee,
                  autorite: seedTk.autorite,
                  consulte: seedTk.consulte,
                  informe: seedTk.informe
                };
              }
              return tk;
            })
          }))
        }))
      : d.axes || [];

    const upgradedDossier: Dossier = {
      ...d,
      axes: upgradedAxes
    };

    return {
      ...upgradedDossier,
      categorizedActors: ensureDossierCategorizedActors(
        upgradedDossier,
        mergedUserProfile
      ),
      actorProfiles: d.actorProfiles || {},
      customDocsData: {
        ...defaultCustomDocsData,
        ...(d.customDocsData || {})
      }
    };
  });

  const activeDossierId =
    loaded.activeDossierId && dossiers.some(d => d.id === loaded.activeDossierId)
      ? loaded.activeDossierId
      : dossiers[0].id;
  const validTabs = new Set([
    'landing',
    'accueil',
    'profil',
    'projects',
    'planification',
    'suivi',
    'processus',
    'raci',
    'categorie',
    'dashboard',
    'gantt',
    'pert',
    'kanban',
    'fiche',
    'docgen',
    'super_admin'
  ]);
  let normalizedTab = loaded.activeTab || 'landing';
  if (!validTabs.has(normalizedTab)) normalizedTab = 'landing';

  const activeDossierObj = dossiers.find(d => d.id === activeDossierId) || dossiers[0];

  return {
    ...initial,
    ...loaded,
    activeTab: normalizedTab,
    userProfile: mergedUserProfile,
    dossiers,
    activeDossierId,
    customDocsData: {
      ...defaultCustomDocsData,
      ...(loaded.customDocsData || {}),
      ...(activeDossierObj?.customDocsData || {})
    }
  };
}

export const saveStateToDB = saveAppStateToIDB;

export async function resetDatabaseToInitial(): Promise<AppPersistedState> {
  const fresh = createInitialState();
  await saveAppStateToIDB(fresh);
  return fresh;
}


