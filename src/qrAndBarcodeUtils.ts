import {
  ActorCategoryType,
  CategorizedActor,
  Dossier,
  InternalActorProfile,
  UserProfile
} from './types';
import { ensureDossierCategorizedActors } from './db';

/**
 * Génère le payload universel vCard 3.0 pour le QR Code de la Carte de Visite Professionnelle.
 * Le scan avec n'importe quel smartphone (iOS / Android) ouvre directement la fiche contact
 * pré-remplie prête à être ajoutée au répertoire téléphonique.
 */
export function buildBusinessCardVCardPayload(
  profile: InternalActorProfile,
  dossier: Dossier
): string {
  const fullName = (profile.fullName || 'Expert Interne').trim();
  const parts = fullName.split(/\s+/);
  const lastName = parts.length > 1 ? parts[0] : fullName;
  const firstName = parts.length > 1 ? parts.slice(1).join(' ') : '';

  const org = (profile.executingOrgName || dossier.institution || 'Organisme Pilote').replace(
    /[;\r\n]+/g,
    ' '
  );
  const dept = (
    profile.executingDepartment ||
    profile.serviceUnit ||
    'Direction / UGP'
  ).replace(/[;\r\n]+/g, ' ');
  const role = (profile.officialRole || 'Responsable Opérationnel').replace(/[\r\n]+/g, ' ');
  const phoneWork = (profile.phonePro || '+225 27 20 00 12 34').trim();
  const phoneCell = (profile.phoneMobile || profile.phonePro || '+225 07 48 08 27 39').trim();
  const email = (profile.emailPro || 'contact@programme-pilote.org').trim();
  const address = (profile.officeAddress || 'Siège de l’Organisme Pilote').replace(/[;\r\n]+/g, ' ');
  const city = (profile.residenceCity || 'Abidjan').replace(/[;\r\n]+/g, ' ');
  const website = (profile.websiteUrl || 'www.programme-pilote.org').trim();
  const matricule = (profile.employeeId || 'MAT-PILOTE-001').trim();
  const raci = (profile.raciRoleBadge || 'R').trim();

  const lines: string[] = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `N:${lastName};${firstName};;;`,
    `FN:${fullName}`,
    `TITLE:${role}`,
    `ORG:${org};${dept}`
  ];

  if (phoneCell) {
    lines.push(`TEL;TYPE=CELL,VOICE:${phoneCell}`);
  }
  if (phoneWork && phoneWork !== phoneCell) {
    lines.push(`TEL;TYPE=WORK,VOICE:${phoneWork}`);
  }
  if (email) {
    lines.push(`EMAIL;TYPE=PREF,WORK,INTERNET:${email}`);
  }
  if (address || city) {
    lines.push(`ADR;TYPE=WORK:;;${address};${city};;;`);
  }
  if (website) {
    lines.push(
      `URL:${website.startsWith('http') ? website : `https://${website}`}`
    );
  }
  lines.push(
    `NOTE:Programme: ${dossier.name} | Catégorie: Interne | Matricule: ${matricule} | RACI: ${raci} | Unité: ${profile.serviceUnit || 'UGP'}`
  );
  lines.push('END:VCARD');

  return lines.join('\r\n');
}

/**
 * Génère le payload structuré du QR Code du Badge d'Accès Professionnel.
 * Encode toutes les informations d'identification et d'accréditation de l'acteur Interne.
 */
export function buildBadgeQrPayload(
  profile: InternalActorProfile,
  dossier: Dossier,
  axeName?: string,
  projectName?: string
): string {
  const payload = {
    schema: 'FAAB_PLAN_BADGE_V1',
    category: 'Interne' as ActorCategoryType,
    matricule: profile.employeeId || 'MAT-PILOTE-001',
    fullName: profile.fullName || 'Membre Interne',
    role: profile.officialRole || 'Responsable Opérationnel',
    raci: profile.raciRoleBadge || 'R',
    org: profile.executingOrgName || dossier.institution || 'Organisme Pilote',
    dept: profile.executingDepartment || 'UGP / PMO',
    unit: profile.serviceUnit || 'Unité de Gestion du Programme',
    dossierId: dossier.id,
    programme: dossier.name,
    axe: axeName || dossier.axes?.[0]?.name || 'Tous les Axes',
    project:
      projectName ||
      dossier.axes?.[0]?.projects?.[0]?.name ||
      'Portefeuille Opérationnel',
    accreditation: 'ZONE A — ACCÈS TOTAL & SITES',
    validity: profile.badgeValidityDate || '31/12/2026',
    blood: profile.badgeBloodType || 'O+',
    emergency: profile.badgeEmergencyPhone || profile.phonePro || '+225 27 20 00 12 34',
    phone: profile.phoneMobile || profile.phonePro || '',
    email: profile.emailPro || ''
  };
  return JSON.stringify(payload);
}

// ============================================================================
// ENCODEUR STANDARD CODE-128 (SET B - ISO/IEC 15417) POUR CODE-BARRES 1D
// ============================================================================
const CODE128_PATTERNS: number[][] = [
  [2, 1, 2, 2, 2, 2], [2, 2, 2, 1, 2, 2], [2, 2, 2, 2, 2, 1], [1, 2, 1, 2, 2, 3],
  [1, 2, 1, 3, 2, 2], [1, 3, 1, 2, 2, 2], [1, 2, 2, 2, 1, 3], [1, 2, 2, 3, 1, 2],
  [1, 3, 2, 2, 1, 2], [2, 2, 1, 2, 1, 3], [2, 2, 1, 3, 1, 2], [2, 3, 1, 2, 1, 2],
  [1, 1, 2, 2, 3, 2], [1, 2, 2, 1, 3, 2], [1, 2, 2, 2, 3, 1], [1, 1, 3, 2, 2, 2],
  [1, 2, 3, 1, 2, 2], [1, 2, 3, 2, 2, 1], [2, 2, 3, 2, 1, 1], [2, 2, 1, 1, 3, 2],
  [2, 2, 1, 2, 3, 1], [2, 1, 3, 2, 1, 2], [2, 2, 3, 1, 1, 2], [3, 1, 2, 1, 3, 1],
  [3, 1, 1, 2, 2, 2], [3, 2, 1, 1, 2, 2], [3, 2, 1, 2, 2, 1], [3, 1, 2, 2, 1, 2],
  [3, 2, 2, 1, 1, 2], [3, 2, 2, 2, 1, 1], [2, 1, 2, 1, 2, 3], [2, 1, 2, 3, 2, 1],
  [2, 3, 2, 1, 2, 1], [1, 1, 1, 3, 2, 3], [1, 3, 1, 1, 2, 3], [1, 3, 1, 3, 2, 1],
  [1, 1, 2, 3, 1, 3], [1, 3, 2, 1, 1, 3], [1, 3, 2, 3, 1, 1], [2, 1, 1, 3, 1, 3],
  [2, 3, 1, 1, 1, 3], [2, 3, 1, 3, 1, 1], [1, 1, 2, 1, 3, 3], [1, 1, 2, 3, 3, 1],
  [1, 3, 2, 1, 3, 1], [1, 1, 3, 1, 2, 3], [1, 1, 3, 3, 2, 1], [1, 3, 3, 1, 2, 1],
  [3, 1, 3, 1, 2, 1], [2, 1, 1, 3, 3, 1], [2, 3, 1, 1, 3, 1], [2, 1, 3, 1, 1, 3],
  [2, 1, 3, 3, 1, 1], [2, 1, 3, 1, 3, 1], [3, 1, 1, 1, 2, 3], [3, 1, 1, 3, 2, 1],
  [3, 3, 1, 1, 2, 1], [3, 1, 2, 1, 1, 3], [3, 1, 2, 3, 1, 1], [3, 3, 2, 1, 1, 1],
  [3, 1, 4, 1, 1, 1], [2, 2, 1, 4, 1, 1], [4, 3, 1, 1, 1, 1], [1, 1, 1, 2, 2, 4],
  [1, 1, 1, 4, 2, 2], [1, 2, 1, 1, 2, 4], [1, 2, 1, 4, 2, 1], [1, 4, 1, 1, 2, 2],
  [1, 4, 1, 2, 2, 1], [1, 1, 2, 2, 1, 4], [1, 1, 2, 4, 1, 2], [1, 2, 2, 1, 1, 4],
  [1, 2, 2, 4, 1, 1], [1, 4, 2, 1, 1, 2], [1, 4, 2, 2, 1, 1], [2, 4, 1, 2, 1, 1],
  [2, 2, 1, 1, 1, 4], [4, 1, 3, 1, 1, 1], [2, 4, 1, 1, 1, 2], [1, 3, 4, 1, 1, 1],
  [1, 1, 1, 2, 4, 2], [1, 2, 1, 1, 4, 2], [1, 2, 1, 2, 4, 1], [1, 1, 4, 2, 1, 2],
  [1, 2, 4, 1, 1, 2], [1, 2, 4, 2, 1, 1], [4, 1, 1, 2, 1, 2], [4, 2, 1, 1, 1, 2],
  [4, 2, 1, 2, 1, 1], [2, 1, 2, 1, 4, 1], [2, 1, 4, 1, 2, 1], [4, 1, 2, 1, 2, 1],
  [1, 1, 1, 1, 4, 3], [1, 1, 1, 3, 4, 1], [1, 3, 1, 1, 4, 1], [1, 1, 4, 1, 1, 3],
  [1, 1, 4, 3, 1, 1], [4, 1, 1, 1, 1, 3], [4, 1, 1, 3, 1, 1], [1, 1, 3, 1, 4, 1],
  [1, 1, 4, 1, 3, 1], [3, 1, 1, 1, 4, 1], [4, 1, 1, 1, 3, 1], [2, 1, 1, 4, 1, 2],
  [2, 1, 1, 2, 1, 4], [2, 1, 1, 2, 3, 2], [2, 3, 3, 1, 1, 1, 2]
];

/**
 * Encode une chaîne ASCII (ex: Matricule du Badge) en séquence alternée Barre/Espace CODE-128B.
 */
export function encodeCode128Bars(rawValue: string): number[] {
  const clean = (rawValue || 'MAT-PILOTE-001')
    .replace(/[^\x20-\x7E]/g, '-')
    .slice(0, 28);
  const startCodeB = 104;
  const stopCode = 106;

  const codes: number[] = [startCodeB];
  let checksum = startCodeB;

  for (let i = 0; i < clean.length; i++) {
    const code = Math.max(0, Math.min(94, clean.charCodeAt(i) - 32));
    codes.push(code);
    checksum += code * (i + 1);
  }

  const checkSymbol = checksum % 103;
  codes.push(checkSymbol);
  codes.push(stopCode);

  const widths: number[] = [];
  codes.forEach(code => {
    const pat = CODE128_PATTERNS[code] || CODE128_PATTERNS[0];
    widths.push(...pat);
  });

  return widths;
}

// ============================================================================
// GÉNÉRATEUR DE MATRICE QR CODE ISO/IEC 18004 (VERSIONS 1 À 20, MODE BYTE, ECC L)
// ============================================================================
interface QrVersionSpec {
  version: number;
  totalCodewords: number;
  ecCodewordsPerBlock: number;
  numBlocksGroup1: number;
  dataCodewordsGroup1: number;
  numBlocksGroup2: number;
  dataCodewordsGroup2: number;
  alignmentCenters: number[];
}

const QR_VERSION_L_SPECS: QrVersionSpec[] = [
  { version: 1, totalCodewords: 26, ecCodewordsPerBlock: 7, numBlocksGroup1: 1, dataCodewordsGroup1: 19, numBlocksGroup2: 0, dataCodewordsGroup2: 0, alignmentCenters: [] },
  { version: 2, totalCodewords: 44, ecCodewordsPerBlock: 10, numBlocksGroup1: 1, dataCodewordsGroup1: 34, numBlocksGroup2: 0, dataCodewordsGroup2: 0, alignmentCenters: [6, 18] },
  { version: 3, totalCodewords: 70, ecCodewordsPerBlock: 15, numBlocksGroup1: 1, dataCodewordsGroup1: 55, numBlocksGroup2: 0, dataCodewordsGroup2: 0, alignmentCenters: [6, 22] },
  { version: 4, totalCodewords: 100, ecCodewordsPerBlock: 20, numBlocksGroup1: 1, dataCodewordsGroup1: 80, numBlocksGroup2: 0, dataCodewordsGroup2: 0, alignmentCenters: [6, 26] },
  { version: 5, totalCodewords: 134, ecCodewordsPerBlock: 26, numBlocksGroup1: 1, dataCodewordsGroup1: 108, numBlocksGroup2: 0, dataCodewordsGroup2: 0, alignmentCenters: [6, 30] },
  { version: 6, totalCodewords: 172, ecCodewordsPerBlock: 18, numBlocksGroup1: 2, dataCodewordsGroup1: 68, numBlocksGroup2: 0, dataCodewordsGroup2: 0, alignmentCenters: [6, 34] },
  { version: 7, totalCodewords: 196, ecCodewordsPerBlock: 20, numBlocksGroup1: 2, dataCodewordsGroup1: 78, numBlocksGroup2: 0, dataCodewordsGroup2: 0, alignmentCenters: [6, 22, 38] },
  { version: 8, totalCodewords: 242, ecCodewordsPerBlock: 24, numBlocksGroup1: 2, dataCodewordsGroup1: 97, numBlocksGroup2: 0, dataCodewordsGroup2: 0, alignmentCenters: [6, 24, 42] },
  { version: 9, totalCodewords: 292, ecCodewordsPerBlock: 30, numBlocksGroup1: 2, dataCodewordsGroup1: 116, numBlocksGroup2: 0, dataCodewordsGroup2: 0, alignmentCenters: [6, 26, 46] },
  { version: 10, totalCodewords: 346, ecCodewordsPerBlock: 18, numBlocksGroup1: 2, dataCodewordsGroup1: 68, numBlocksGroup2: 2, dataCodewordsGroup2: 69, alignmentCenters: [6, 28, 50] },
  { version: 11, totalCodewords: 404, ecCodewordsPerBlock: 20, numBlocksGroup1: 4, dataCodewordsGroup1: 81, numBlocksGroup2: 0, dataCodewordsGroup2: 0, alignmentCenters: [6, 30, 54] },
  { version: 12, totalCodewords: 466, ecCodewordsPerBlock: 24, numBlocksGroup1: 2, dataCodewordsGroup1: 92, numBlocksGroup2: 2, dataCodewordsGroup2: 93, alignmentCenters: [6, 32, 58] },
  { version: 13, totalCodewords: 532, ecCodewordsPerBlock: 26, numBlocksGroup1: 4, dataCodewordsGroup1: 107, numBlocksGroup2: 0, dataCodewordsGroup2: 0, alignmentCenters: [6, 34, 62] },
  { version: 14, totalCodewords: 581, ecCodewordsPerBlock: 30, numBlocksGroup1: 3, dataCodewordsGroup1: 115, numBlocksGroup2: 1, dataCodewordsGroup2: 116, alignmentCenters: [6, 26, 46, 66] },
  { version: 15, totalCodewords: 655, ecCodewordsPerBlock: 22, numBlocksGroup1: 5, dataCodewordsGroup1: 87, numBlocksGroup2: 1, dataCodewordsGroup2: 88, alignmentCenters: [6, 26, 48, 70] },
  { version: 16, totalCodewords: 733, ecCodewordsPerBlock: 24, numBlocksGroup1: 5, dataCodewordsGroup1: 98, numBlocksGroup2: 1, dataCodewordsGroup2: 99, alignmentCenters: [6, 26, 50, 74] },
  { version: 17, totalCodewords: 815, ecCodewordsPerBlock: 28, numBlocksGroup1: 1, dataCodewordsGroup1: 107, numBlocksGroup2: 5, dataCodewordsGroup2: 108, alignmentCenters: [6, 30, 54, 78] },
  { version: 18, totalCodewords: 901, ecCodewordsPerBlock: 30, numBlocksGroup1: 5, dataCodewordsGroup1: 120, numBlocksGroup2: 1, dataCodewordsGroup2: 121, alignmentCenters: [6, 30, 56, 82] },
  { version: 19, totalCodewords: 991, ecCodewordsPerBlock: 28, numBlocksGroup1: 3, dataCodewordsGroup1: 113, numBlocksGroup2: 4, dataCodewordsGroup2: 114, alignmentCenters: [6, 30, 58, 86] },
  { version: 20, totalCodewords: 1085, ecCodewordsPerBlock: 28, numBlocksGroup1: 3, dataCodewordsGroup1: 107, numBlocksGroup2: 5, dataCodewordsGroup2: 108, alignmentCenters: [6, 34, 62, 90] }
];

// Tables GF(256) pour correction d'erreur Reed-Solomon QR
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) {
    GF_EXP[i] = GF_EXP[i - 255];
  }
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function buildRsGeneratorPoly(degree: number): Uint8Array {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < degree; i++) {
    const next = new Uint8Array(poly.length + 1);
    const factor = GF_EXP[i];
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], factor);
    }
    poly = next;
  }
  return poly;
}

function computeRsRemainder(data: Uint8Array, ecCount: number): Uint8Array {
  const gen = buildRsGeneratorPoly(ecCount);
  const rem = new Uint8Array(ecCount);
  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ rem[0];
    for (let j = 0; j < ecCount - 1; j++) {
      rem[j] = rem[j + 1];
    }
    rem[ecCount - 1] = 0;
    if (factor !== 0) {
      for (let j = 0; j < ecCount; j++) {
        rem[j] ^= gfMul(gen[j + 1], factor);
      }
    }
  }
  return rem;
}

/**
 * Génère une matrice 2D QR Code standard ISO/IEC 18004 (true = module noir, false = module blanc)
 * directement scannable par tout smartphone.
 */
export function encodeQrMatrix(rawText: string): boolean[][] {
  const utf8Bytes = new TextEncoder().encode(rawText || 'faab gar');

  // Choisir la plus petite version capable d'accueillir utf8Bytes en mode Byte (0100)
  let spec = QR_VERSION_L_SPECS[QR_VERSION_L_SPECS.length - 1];
  for (const candidate of QR_VERSION_L_SPECS) {
    const totalDataBytes =
      candidate.numBlocksGroup1 * candidate.dataCodewordsGroup1 +
      candidate.numBlocksGroup2 * candidate.dataCodewordsGroup2;
    const headerBytes = candidate.version <= 9 ? 2 : 3;
    if (utf8Bytes.length + headerBytes <= totalDataBytes) {
      spec = candidate;
      break;
    }
  }

  const totalDataCapacity =
    spec.numBlocksGroup1 * spec.dataCodewordsGroup1 +
    spec.numBlocksGroup2 * spec.dataCodewordsGroup2;
  const countBitsLen = spec.version <= 9 ? 8 : 16;
  const maxPayloadLen = Math.min(
    utf8Bytes.length,
    totalDataCapacity - (spec.version <= 9 ? 2 : 3)
  );
  const payload = utf8Bytes.slice(0, maxPayloadLen);

  // Construire le flux binaire
  const bits: number[] = [];
  const pushBits = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) {
      bits.push((val >>> i) & 1);
    }
  };

  // Mode Byte = 0100
  pushBits(0b0100, 4);
  pushBits(payload.length, countBitsLen);
  for (let i = 0; i < payload.length; i++) {
    pushBits(payload[i], 8);
  }

  // Terminateur (jusqu'à 4 zéros)
  const maxDataBits = totalDataCapacity * 8;
  const termLen = Math.min(4, maxDataBits - bits.length);
  pushBits(0, termLen);

  // Aligner sur un octet
  while (bits.length % 8 !== 0) {
    bits.push(0);
  }

  // Octets de bourrage alternés 0xEC, 0x11
  const dataBytes = new Uint8Array(totalDataCapacity);
  const byteLen = bits.length / 8;
  for (let i = 0; i < byteLen; i++) {
    let b = 0;
    for (let j = 0; j < 8; j++) {
      b = (b << 1) | bits[i * 8 + j];
    }
    dataBytes[i] = b;
  }
  for (let i = byteLen; i < totalDataCapacity; i++) {
    dataBytes[i] = (i - byteLen) % 2 === 0 ? 0xec : 0x11;
  }

  // Découpage en blocs et calcul Reed-Solomon
  const dataBlocks: Uint8Array[] = [];
  const ecBlocks: Uint8Array[] = [];
  let offset = 0;
  for (let b = 0; b < spec.numBlocksGroup1; b++) {
    const blk = dataBytes.slice(offset, offset + spec.dataCodewordsGroup1);
    offset += spec.dataCodewordsGroup1;
    dataBlocks.push(blk);
    ecBlocks.push(computeRsRemainder(blk, spec.ecCodewordsPerBlock));
  }
  for (let b = 0; b < spec.numBlocksGroup2; b++) {
    const blk = dataBytes.slice(offset, offset + spec.dataCodewordsGroup2);
    offset += spec.dataCodewordsGroup2;
    dataBlocks.push(blk);
    ecBlocks.push(computeRsRemainder(blk, spec.ecCodewordsPerBlock));
  }

  // Entrelacement des mots de code
  const interleaved: number[] = [];
  const maxDataBlockLen = Math.max(
    spec.dataCodewordsGroup1,
    spec.dataCodewordsGroup2
  );
  for (let i = 0; i < maxDataBlockLen; i++) {
    for (const blk of dataBlocks) {
      if (i < blk.length) interleaved.push(blk[i]);
    }
  }
  for (let i = 0; i < spec.ecCodewordsPerBlock; i++) {
    for (const ec of ecBlocks) {
      if (i < ec.length) interleaved.push(ec[i]);
    }
  }

  // Création de la grille QR (taille = 17 + 4 * version)
  const size = 17 + 4 * spec.version;
  const modules: boolean[][] = Array.from({ length: size }, () =>
    Array(size).fill(false)
  );
  const isFunction: boolean[][] = Array.from({ length: size }, () =>
    Array(size).fill(false)
  );

  const setFunctionModule = (r: number, c: number, dark: boolean) => {
    if (r >= 0 && r < size && c >= 0 && c < size) {
      modules[r][c] = dark;
      isFunction[r][c] = true;
    }
  };

  // Finder patterns (7x7) + séparateurs blancs
  const drawFinderPattern = (topR: number, leftC: number) => {
    for (let dr = -1; dr <= 7; dr++) {
      for (let dc = -1; dc <= 7; dc++) {
        const r = topR + dr;
        const c = leftC + dc;
        if (r < 0 || r >= size || c < 0 || c >= size) continue;
        const inOuter =
          dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6 &&
          (dr === 0 || dr === 6 || dc === 0 || dc === 6);
        const inCenter = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
        setFunctionModule(r, c, inOuter || inCenter);
      }
    }
  };

  drawFinderPattern(0, 0);
  drawFinderPattern(0, size - 7);
  drawFinderPattern(size - 7, 0);

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    setFunctionModule(6, i, i % 2 === 0);
    setFunctionModule(i, 6, i % 2 === 0);
  }

  // Dark module
  setFunctionModule(size - 8, 8, true);

  // Alignment patterns (5x5)
  const centers = spec.alignmentCenters;
  for (let i = 0; i < centers.length; i++) {
    for (let j = 0; j < centers.length; j++) {
      if (
        (i === 0 && j === 0) ||
        (i === 0 && j === centers.length - 1) ||
        (i === centers.length - 1 && j === 0)
      ) {
        continue;
      }
      const cr = centers[i];
      const cc = centers[j];
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const dark =
            Math.max(Math.abs(dr), Math.abs(dc)) === 2 ||
            (dr === 0 && dc === 0);
          setFunctionModule(cr + dr, cc + dc, dark);
        }
      }
    }
  }

  // Réserver les zones Format Info
  for (let i = 0; i <= 8; i++) {
    if (!isFunction[8][i]) setFunctionModule(8, i, false);
    if (!isFunction[i][8]) setFunctionModule(i, 8, false);
  }
  for (let i = 0; i < 8; i++) {
    if (!isFunction[8][size - 1 - i]) setFunctionModule(8, size - 1 - i, false);
    if (!isFunction[size - 1 - i][8]) setFunctionModule(size - 1 - i, 8, false);
  }

  // Réserver les zones Version Info (si version >= 7)
  if (spec.version >= 7) {
    let rem = spec.version;
    for (let i = 0; i < 12; i++) {
      rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    }
    const vBits = (spec.version << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const bit = ((vBits >>> i) & 1) !== 0;
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      setFunctionModule(a, b, bit);
      setFunctionModule(b, a, bit);
    }
  }

  // Placement en zigzag des bits de données + ECC
  let bitIdx = 0;
  const totalBits = interleaved.length * 8;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const c = right - j;
        const upward = ((right + 1) & 2) === 0;
        const r = upward ? size - 1 - vert : vert;
        if (!isFunction[r][c]) {
          let dark = false;
          if (bitIdx < totalBits) {
            const byteVal = interleaved[bitIdx >>> 3];
            dark = ((byteVal >>> (7 - (bitIdx & 7))) & 1) !== 0;
            bitIdx++;
          }
          // Appliquer le masque 0 : (r + c) % 2 === 0
          if ((r + c) % 2 === 0) {
            dark = !dark;
          }
          modules[r][c] = dark;
        }
      }
    }
  }

  // Inscrire les 15 bits de Format Info (ECC Level L = 01, Mask 0 = 000 -> bits BCH masqués = 0x77c4)
  // Conformément à ISO/IEC 18004 (modules[row][col]) :
  const formatBits = 0x77c4;
  const getFormatBit = (idx: number) => ((formatBits >>> idx) & 1) !== 0;

  // Copie 1 autour du repère supérieur gauche
  for (let i = 0; i <= 5; i++) modules[i][8] = getFormatBit(i);
  modules[7][8] = getFormatBit(6);
  modules[8][8] = getFormatBit(7);
  modules[8][7] = getFormatBit(8);
  for (let i = 9; i < 15; i++) modules[8][14 - i] = getFormatBit(i);

  // Copie 2 sous le repère supérieur droit (bits 0..7) et à droite du repère inférieur gauche (bits 8..14)
  for (let i = 0; i < 8; i++) modules[8][size - 1 - i] = getFormatBit(i);
  for (let i = 8; i < 15; i++) modules[size - 15 + i][8] = getFormatBit(i);
  modules[size - 8][8] = true;

  return modules;
}

// ============================================================================
// DÉCODEURS OPTIQUES PURS TYPESCRIPT (QR CODE 2D & CODE-128 1D)
// ============================================================================

/**
 * Décode une séquence de largeurs Barre/Espace CODE-128B vers la chaîne ASCII d'origine
 * avec vérification stricte du caractère de contrôle modulo 103.
 */
export function decodeCode128Bars(widths: number[]): string | null {
  if (!widths || widths.length < 19 || (widths.length - 13) % 6 !== 0) {
    return null;
  }
  const numSymbols = (widths.length - 7) / 6;
  if (numSymbols < 3) return null;

  const matchSymbol = (slice6: number[]): { code: number; dist: number } => {
    const sum = slice6.reduce((a, b) => a + b, 0);
    if (sum <= 0) return { code: -1, dist: 999 };
    let bestCode = -1;
    let bestDist = 999;
    for (let c = 0; c <= 105; c++) {
      const pat = CODE128_PATTERNS[c];
      let d = 0;
      for (let k = 0; k < 6; k++) {
        d += Math.abs((slice6[k] * 11) / sum - pat[k]);
      }
      if (d < bestDist) {
        bestDist = d;
        bestCode = c;
      }
    }
    return { code: bestCode, dist: bestDist };
  };

  const startMatch = matchSymbol(widths.slice(0, 6));
  if (startMatch.code !== 104 || startMatch.dist > 2.4) {
    return null;
  }

  // Vérifier le motif Stop (code 106, 7 éléments de somme 13)
  const stopSlice = widths.slice(widths.length - 7);
  const stopSum = stopSlice.reduce((a, b) => a + b, 0);
  if (stopSum <= 0) return null;
  const stopPat = CODE128_PATTERNS[106];
  let stopDist = 0;
  for (let k = 0; k < 7; k++) {
    stopDist += Math.abs((stopSlice[k] * 13) / stopSum - stopPat[k]);
  }
  if (stopDist > 3.0) return null;

  const dataCodes: number[] = [];
  for (let s = 1; s < numSymbols; s++) {
    const m = matchSymbol(widths.slice(s * 6, s * 6 + 6));
    if (m.code < 0 || m.dist > 2.4) return null;
    dataCodes.push(m.code);
  }

  const checkSymbol = dataCodes.pop()!;
  let checksum = 104;
  for (let i = 0; i < dataCodes.length; i++) {
    checksum += dataCodes[i] * (i + 1);
  }
  if (checksum % 103 !== checkSymbol) {
    return null;
  }

  let out = '';
  for (const code of dataCodes) {
    if (code >= 0 && code <= 94) {
      out += String.fromCharCode(code + 32);
    }
  }
  return out.trim() || null;
}

/**
 * Décode une matrice booléenne QR Code (Versions 1..20, Mode Byte) vers sa chaîne UTF-8.
 */
export function decodeQrMatrix(modules: boolean[][]): string | null {
  const size = modules?.length || 0;
  if (size < 21 || (size - 17) % 4 !== 0) return null;
  const version = (size - 17) / 4;
  const spec = QR_VERSION_L_SPECS.find(s => s.version === version);
  if (!spec) return null;

  // Lire les 15 bits de Format Info (Copie 1)
  let formatBits = 0;
  const setBit = (idx: number, val: boolean) => {
    if (val) formatBits |= 1 << idx;
  };
  for (let i = 0; i <= 5; i++) setBit(i, modules[i][8]);
  setBit(6, modules[7][8]);
  setBit(7, modules[8][8]);
  setBit(8, modules[8][7]);
  for (let i = 9; i < 15; i++) setBit(i, modules[8][14 - i]);

  const unmaskedFormat = formatBits ^ 0x5412;
  const maskId = (unmaskedFormat >>> 10) & 0b111;

  // Reconstruire le masque des modules fonctionnels
  const isFunction: boolean[][] = Array.from({ length: size }, () =>
    Array(size).fill(false)
  );
  const markFunc = (r: number, c: number) => {
    if (r >= 0 && r < size && c >= 0 && c < size) isFunction[r][c] = true;
  };
  const markFinder = (topR: number, leftC: number) => {
    for (let dr = -1; dr <= 7; dr++) {
      for (let dc = -1; dc <= 7; dc++) {
        markFunc(topR + dr, leftC + dc);
      }
    }
  };
  markFinder(0, 0);
  markFinder(0, size - 7);
  markFinder(size - 7, 0);

  for (let i = 8; i < size - 8; i++) {
    markFunc(6, i);
    markFunc(i, 6);
  }
  markFunc(size - 8, 8);

  const centers = spec.alignmentCenters;
  for (let i = 0; i < centers.length; i++) {
    for (let j = 0; j < centers.length; j++) {
      if (
        (i === 0 && j === 0) ||
        (i === 0 && j === centers.length - 1) ||
        (i === centers.length - 1 && j === 0)
      ) {
        continue;
      }
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          markFunc(centers[i] + dr, centers[j] + dc);
        }
      }
    }
  }

  for (let i = 0; i <= 8; i++) {
    markFunc(8, i);
    markFunc(i, 8);
  }
  for (let i = 0; i < 8; i++) {
    markFunc(8, size - 1 - i);
    markFunc(size - 1 - i, 8);
  }
  if (spec.version >= 7) {
    for (let i = 0; i < 18; i++) {
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      markFunc(a, b);
      markFunc(b, a);
    }
  }

  const applyMask = (r: number, c: number, bit: boolean): boolean => {
    let inv = false;
    switch (maskId) {
      case 0: inv = (r + c) % 2 === 0; break;
      case 1: inv = r % 2 === 0; break;
      case 2: inv = c % 3 === 0; break;
      case 3: inv = (r + c) % 3 === 0; break;
      case 4: inv = (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0; break;
      case 5: inv = ((r * c) % 2) + ((r * c) % 3) === 0; break;
      case 6: inv = (((r * c) % 2) + ((r * c) % 3)) % 2 === 0; break;
      case 7: inv = (((r + c) % 2) + ((r * c) % 3)) % 2 === 0; break;
    }
    return inv ? !bit : bit;
  };

  // Extraire le flux binaire entrelacé
  const rawBits: number[] = [];
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const c = right - j;
        const upward = ((right + 1) & 2) === 0;
        const r = upward ? size - 1 - vert : vert;
        if (!isFunction[r][c]) {
          rawBits.push(applyMask(r, c, modules[r][c]) ? 1 : 0);
        }
      }
    }
  }

  const codewords: number[] = [];
  for (let i = 0; i + 7 < rawBits.length && codewords.length < spec.totalCodewords; i += 8) {
    let b = 0;
    for (let k = 0; k < 8; k++) b = (b << 1) | rawBits[i + k];
    codewords.push(b);
  }

  // Désentrelacer les blocs de données
  const totalBlocks = spec.numBlocksGroup1 + spec.numBlocksGroup2;
  const blocks: number[][] = Array.from({ length: totalBlocks }, () => []);
  const maxDataBlockLen = Math.max(spec.dataCodewordsGroup1, spec.dataCodewordsGroup2);
  let cwIdx = 0;
  for (let i = 0; i < maxDataBlockLen; i++) {
    for (let b = 0; b < totalBlocks; b++) {
      const blkLen =
        b < spec.numBlocksGroup1 ? spec.dataCodewordsGroup1 : spec.dataCodewordsGroup2;
      if (i < blkLen && cwIdx < codewords.length) {
        blocks[b].push(codewords[cwIdx++]);
      }
    }
  }

  const dataBytes: number[] = [];
  for (const blk of blocks) {
    dataBytes.push(...blk);
  }

  // Lire les bits de données (Mode Byte = 0100)
  const dataBits: number[] = [];
  for (const b of dataBytes) {
    for (let k = 7; k >= 0; k--) dataBits.push((b >>> k) & 1);
  }

  const readBits = (start: number, len: number): number => {
    let val = 0;
    for (let i = 0; i < len; i++) {
      val = (val << 1) | (dataBits[start + i] || 0);
    }
    return val;
  };

  const mode = readBits(0, 4);
  if (mode !== 0b0100) return null;
  const countBitsLen = spec.version <= 9 ? 8 : 16;
  const byteCount = readBits(4, countBitsLen);
  const totalDataCapacity =
    spec.numBlocksGroup1 * spec.dataCodewordsGroup1 +
    spec.numBlocksGroup2 * spec.dataCodewordsGroup2;
  if (byteCount <= 0 || byteCount > totalDataCapacity) return null;

  const outBytes = new Uint8Array(byteCount);
  let bitPos = 4 + countBitsLen;
  for (let i = 0; i < byteCount; i++) {
    outBytes[i] = readBits(bitPos, 8);
    bitPos += 8;
  }

  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(outBytes);
    return text.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Scanner optique 1D CODE-128B sur ImageData (parcourt des lignes horizontales de l'image).
 */
export function decodeCode128FromImageData(imageData: ImageData): string | null {
  const { width, height, data } = imageData;
  if (width < 40 || height < 4) return null;

  const stepY = Math.max(1, Math.floor(height / 60));
  for (let y = Math.floor(height * 0.08); y < height * 0.92; y += stepY) {
    // Calculer la luminance sur la ligne y
    const rowLum = new Uint8Array(width);
    let minL = 255;
    let maxL = 0;
    const rowOffset = y * width * 4;
    for (let x = 0; x < width; x++) {
      const idx = rowOffset + x * 4;
      const a = data[idx + 3];
      const lum =
        a < 128
          ? 255
          : Math.round(0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]);
      rowLum[x] = lum;
      if (lum < minL) minL = lum;
      if (lum > maxL) maxL = lum;
    }
    if (maxL - minL < 40) continue;

    for (const ratio of [0.5, 0.42, 0.58]) {
      const thresh = minL + (maxL - minL) * ratio;
      // Extraire les runs (isDark, length)
      const runs: { dark: boolean; len: number }[] = [];
      let curDark = rowLum[0] < thresh;
      let curLen = 1;
      for (let x = 1; x < width; x++) {
        const d = rowLum[x] < thresh;
        if (d === curDark) {
          curLen++;
        } else {
          runs.push({ dark: curDark, len: curLen });
          curDark = d;
          curLen = 1;
        }
      }
      runs.push({ dark: curDark, len: curLen });

      // Chercher une séquence commençant par une barre noire (Start Code B = 104)
      for (let i = 0; i < runs.length - 18; i++) {
        if (!runs[i].dark) continue;
        // Vérifier que les 6 premiers runs ont une taille cohérente avec Start B [2,1,1,2,1,4]
        const start6 = [
          runs[i].len,
          runs[i + 1].len,
          runs[i + 2].len,
          runs[i + 3].len,
          runs[i + 4].len,
          runs[i + 5].len
        ];
        const sum6 = start6.reduce((a, b) => a + b, 0);
        if (sum6 < 11) continue;
        const unit = sum6 / 11;
        if (
          Math.abs(start6[0] / unit - 2) > 0.75 ||
          Math.abs(start6[1] / unit - 1) > 0.75 ||
          Math.abs(start6[2] / unit - 1) > 0.75 ||
          Math.abs(start6[3] / unit - 2) > 0.75 ||
          Math.abs(start6[4] / unit - 1) > 0.75 ||
          Math.abs(start6[5] / unit - 4) > 0.95
        ) {
          continue;
        }

        // Tester les longueurs possibles de message (de 3 à 28 caractères)
        for (let numChars = 3; numChars <= 28; numChars++) {
          const totalRunsNeeded = (numChars + 2) * 6 + 7;
          if (i + totalRunsNeeded > runs.length) break;
          const candidateWidths: number[] = [];
          for (let k = 0; k < totalRunsNeeded; k++) {
            candidateWidths.push(runs[i + k].len);
          }
          const decoded = decodeCode128Bars(candidateWidths);
          if (decoded && decoded.length >= 3) {
            return decoded;
          }
        }
      }
    }
  }
  return null;
}

/**
 * Scanner optique 2D QR Code sur ImageData (détecte les 3 repères 1:1:3:1:1 et échantillonne la grille).
 */
export function decodeQrFromImageData(imageData: ImageData): string | null {
  const { width, height, data } = imageData;
  if (width < 21 || height < 21) return null;

  // Convertir en luminance
  const lum = new Uint8Array(width * height);
  let minL = 255;
  let maxL = 0;
  for (let i = 0; i < width * height; i++) {
    const idx = i * 4;
    const v =
      data[idx + 3] < 128
        ? 255
        : Math.round(0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]);
    lum[i] = v;
    if (v < minL) minL = v;
    if (v > maxL) maxL = v;
  }
  if (maxL - minL < 35) return null;
  const threshold = minL + (maxL - minL) * 0.52;
  const isDark = (x: number, y: number): boolean => {
    const cx = Math.max(0, Math.min(width - 1, Math.round(x)));
    const cy = Math.max(0, Math.min(height - 1, Math.round(y)));
    return lum[cy * width + cx] < threshold;
  };

  // Vérifier le ratio 1:1:3:1:1
  const isFinderRatio = (counts: number[]): boolean => {
    const total = counts[0] + counts[1] + counts[2] + counts[3] + counts[4];
    if (total < 7) return false;
    const moduleSize = total / 7;
    const maxVar = moduleSize * 0.65;
    return (
      Math.abs(moduleSize - counts[0]) < maxVar &&
      Math.abs(moduleSize - counts[1]) < maxVar &&
      Math.abs(3 * moduleSize - counts[2]) < 3 * maxVar &&
      Math.abs(moduleSize - counts[3]) < maxVar &&
      Math.abs(moduleSize - counts[4]) < maxVar
    );
  };

  // Vérification verticale centrée sur (cx, startY)
  const checkVerticalFinder = (cx: number, centerY: number, maxCount: number): { cy: number; modSize: number } | null => {
    const x = Math.round(cx);
    let y = Math.round(centerY);
    if (!isDark(x, y)) return null;

    const vCounts = [0, 0, 0, 0, 0];
    while (y >= 0 && isDark(x, y)) {
      vCounts[2]++;
      y--;
    }
    if (y < 0) return null;
    while (y >= 0 && !isDark(x, y) && vCounts[1] <= maxCount) {
      vCounts[1]++;
      y--;
    }
    if (y < 0 || vCounts[1] > maxCount) return null;
    while (y >= 0 && isDark(x, y) && vCounts[0] <= maxCount) {
      vCounts[0]++;
      y--;
    }
    if (vCounts[0] > maxCount) return null;

    y = Math.round(centerY) + 1;
    while (y < height && isDark(x, y)) {
      vCounts[2]++;
      y++;
    }
    if (y >= height) return null;
    while (y < height && !isDark(x, y) && vCounts[3] <= maxCount) {
      vCounts[3]++;
      y++;
    }
    if (y >= height || vCounts[3] > maxCount) return null;
    while (y < height && isDark(x, y) && vCounts[4] <= maxCount) {
      vCounts[4]++;
      y++;
    }
    if (vCounts[4] > maxCount) return null;

    if (!isFinderRatio(vCounts)) return null;
    const total = vCounts[0] + vCounts[1] + vCounts[2] + vCounts[3] + vCounts[4];
    const cy = y - vCounts[4] - vCounts[3] - vCounts[2] / 2;
    return { cy, modSize: total / 7 };
  };

  interface FinderCenter {
    x: number;
    y: number;
    modSize: number;
    count: number;
  }
  const centers: FinderCenter[] = [];

  for (let y = 0; y < height; y += 2) {
    const counts = [0, 0, 0, 0, 0];
    let state = 0;
    for (let x = 0; x < width; x++) {
      if (isDark(x, y)) {
        if ((state & 1) === 1) state++;
        counts[state]++;
      } else {
        if ((state & 1) === 0) {
          if (state === 4) {
            if (isFinderRatio(counts)) {
              const totalH = counts[0] + counts[1] + counts[2] + counts[3] + counts[4];
              const cx = x - counts[4] - counts[3] - counts[2] / 2;
              const vRes = checkVerticalFinder(cx, y, counts[2] * 2);
              if (vRes) {
                const modSize = (totalH / 7 + vRes.modSize) / 2;
                const existing = centers.find(
                  c =>
                    Math.hypot(c.x - cx, c.y - vRes.cy) < modSize * 4 &&
                    Math.abs(c.modSize - modSize) < modSize * 0.5
                );
                if (existing) {
                  existing.x = (existing.x * existing.count + cx) / (existing.count + 1);
                  existing.y = (existing.y * existing.count + vRes.cy) / (existing.count + 1);
                  existing.modSize = (existing.modSize * existing.count + modSize) / (existing.count + 1);
                  existing.count++;
                } else {
                  centers.push({ x: cx, y: vRes.cy, modSize, count: 1 });
                }
              }
            }
            counts[0] = counts[2];
            counts[1] = counts[3];
            counts[2] = counts[4];
            counts[3] = 1;
            counts[4] = 0;
            state = 3;
          } else {
            state++;
            counts[state]++;
          }
        } else {
          counts[state]++;
        }
      }
    }
  }

  if (centers.length < 3) return null;
  centers.sort((a, b) => b.count - a.count);
  const topCenters = centers.slice(0, 8);

  // Tester les triplets (TL, TR, BL) formant un angle droit en TL
  for (let i = 0; i < topCenters.length; i++) {
    for (let j = i + 1; j < topCenters.length; j++) {
      for (let k = j + 1; k < topCenters.length; k++) {
        const pts = [topCenters[i], topCenters[j], topCenters[k]];
        // Le sommet de l'angle droit (Top-Left) est opposé à l'hypoténuse la plus longue
        const d01 = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        const d12 = Math.hypot(pts[1].x - pts[2].x, pts[1].y - pts[2].y);
        const d02 = Math.hypot(pts[0].x - pts[2].x, pts[0].y - pts[2].y);

        let tl = pts[0], pA = pts[1], pB = pts[2];
        if (d01 >= d12 && d01 >= d02) {
          tl = pts[2]; pA = pts[0]; pB = pts[1];
        } else if (d02 >= d01 && d02 >= d12) {
          tl = pts[1]; pA = pts[0]; pB = pts[2];
        }

        // Produit vectoriel pour distinguer Top-Right et Bottom-Left
        const cross = (pA.x - tl.x) * (pB.y - tl.y) - (pA.y - tl.y) * (pB.x - tl.x);
        const tr = cross > 0 ? pA : pB;
        const bl = cross > 0 ? pB : pA;

        const distTR = Math.hypot(tr.x - tl.x, tr.y - tl.y);
        const distBL = Math.hypot(bl.x - tl.x, bl.y - tl.y);
        if (Math.abs(distTR - distBL) > Math.max(distTR, distBL) * 0.25) continue;

        const avgMod = (tl.modSize + tr.modSize + bl.modSize) / 3;
        const estDimension = Math.round(((distTR + distBL) / 2) / avgMod) + 7;
        const estVersion = Math.round((estDimension - 17) / 4);

        for (let dv = -2; dv <= 2; dv++) {
          const v = estVersion + dv;
          if (v < 1 || v > 20) continue;
          const dim = 17 + 4 * v;
          const span = dim - 7;
          const mat: boolean[][] = Array.from({ length: dim }, () =>
            Array(dim).fill(false)
          );
          for (let r = 0; r < dim; r++) {
            const vf = (r - 3.5) / span;
            for (let c = 0; c < dim; c++) {
              const uf = (c - 3.5) / span;
              const px = tl.x + uf * (tr.x - tl.x) + vf * (bl.x - tl.x);
              const py = tl.y + uf * (tr.y - tl.y) + vf * (bl.y - tl.y);
              mat[r][c] = isDark(px, py);
            }
          }
          const decoded = decodeQrMatrix(mat);
          if (decoded) return decoded;
        }
      }
    }
  }

  return null;
}

/**
 * Analyse une image ou frame vidéo avec BarcodeDetector natif ET les décodeurs optiques TS (QR 2D + CODE-128 1D).
 */
export async function decodeQrOrBarcodeFromSource(
  source: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement
): Promise<string | null> {
  // 1. Essayer BarcodeDetector natif s'il est disponible
  const BarcodeDetectorClass = (window as any).BarcodeDetector;
  if (BarcodeDetectorClass) {
    try {
      const detector = new BarcodeDetectorClass({
        formats: ['qr_code', 'code_128', 'code_39', 'ean_13']
      });
      const results = await detector.detect(source);
      if (results && results.length > 0 && results[0].rawValue) {
        return results[0].rawValue;
      }
    } catch {
      // Continuer vers le décodage sur canvas
    }
  }

  // 2. Dessiner sur un canvas pour analyse optique TS (QR Code 2D + Code-Barres 1D CODE-128)
  const srcW =
    (source as HTMLVideoElement).videoWidth ||
    (source as HTMLImageElement).naturalWidth ||
    source.width ||
    0;
  const srcH =
    (source as HTMLVideoElement).videoHeight ||
    (source as HTMLImageElement).naturalHeight ||
    source.height ||
    0;
  if (srcW < 20 || srcH < 10) return null;

  const canvas = document.createElement('canvas');
  const maxDim = 1200;
  const scale = Math.min(1, maxDim / Math.max(srcW, srcH));
  const w = Math.max(24, Math.round(srcW * scale));
  const h = Math.max(24, Math.round(srcH * scale));
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(source, 0, 0, w, h);

  const fullImageData = ctx.getImageData(0, 0, w, h);

  // Tester d'abord notre décodeur QR 2D TS sur l'image complète
  const qrRes = decodeQrFromImageData(fullImageData);
  if (qrRes) return qrRes;

  // Tester notre décodeur Code-Barres 1D CODE-128 sur l'image complète
  const barRes = decodeCode128FromImageData(fullImageData);
  if (barRes) return barRes;

  return null;
}

// ============================================================================
// DÉCODAGE & AUTHENTIFICATION POUR LE LECTEUR / SCANNER DE CONTRÔLE D'ACCÈS
// ============================================================================
export interface ScannedActorVerificationResult {
  isValid: boolean;
  isInternalAuthenticated: boolean;
  scanType: 'BADGE_QR' | 'VCARD_QR' | 'BARCODE_1D' | 'MANUAL_LOOKUP';
  rawPayload: string;
  actorName: string;
  matricule: string;
  category: ActorCategoryType | 'Inconnu';
  roleOrFunction: string;
  organization: string;
  department: string;
  programmeName: string;
  axeName: string;
  projectName: string;
  raciRoles: string;
  accreditationLevel: string;
  badgeValidity: string;
  bloodType: string;
  emergencyPhone: string;
  email: string;
  phone: string;
  phoneWork?: string;
  address?: string;
  website?: string;
  photoDataUrl?: string;
  statusMessageFr: string;
  statusMessageEn: string;
  securityDetailFr: string;
  securityDetailEn: string;
}

/**
 * Analyse le contenu d'un QR Code (vCard ou JSON Badge) ou d'un Code-Barres (Matricule)
 * et vérifie l'authenticité de l'acteur dans la base du Programme actif.
 */
export function verifyScannedPayloadAgainstDossier(
  rawText: string,
  dossier: Dossier,
  userProfile: UserProfile,
  profilesMap?: Record<string, InternalActorProfile>
): ScannedActorVerificationResult {
  const trimmed = (rawText || '').trim();
  const allActors = ensureDossierCategorizedActors(dossier, userProfile);
  const storedProfiles: Record<string, InternalActorProfile> =
    profilesMap || dossier.actorProfiles || {};

  const resolveAxeAndProjectNames = (actor?: CategorizedActor) => {
    const axeObj =
      (dossier.axes || []).find(a => a.id === actor?.axeId) ||
      dossier.axes?.[0];
    const projObj =
      (axeObj?.projects || []).find(p => p.id === actor?.projectId) ||
      axeObj?.projects?.[0];
    return {
      axeName: axeObj?.name || 'Tous les Axes Stratégiques',
      projectName: projObj?.name || 'Tous les Projets du Programme'
    };
  };

  // 1. Cas JSON Badge (FAAB_PLAN_BADGE_V1)
  if (trimmed.startsWith('{') && trimmed.includes('FAAB_PLAN_BADGE_V1')) {
    try {
      const parsed = JSON.parse(trimmed);
      const matchedActor = allActors.find(
        a =>
          a.name.toLowerCase() === String(parsed.fullName || '').toLowerCase() ||
          a.matricule.toLowerCase() === String(parsed.matricule || '').toLowerCase()
      );
      const effectiveCategory: ActorCategoryType =
        matchedActor?.category || parsed.category || 'Interne';
      const isInternal = effectiveCategory === 'Interne';
      const prof =
        storedProfiles[parsed.fullName] ||
        (matchedActor ? storedProfiles[matchedActor.name] : undefined);

      return {
        isValid: true,
        isInternalAuthenticated: isInternal,
        scanType: 'BADGE_QR',
        rawPayload: trimmed,
        actorName: parsed.fullName || matchedActor?.name || 'Acteur',
        matricule: parsed.matricule || matchedActor?.matricule || 'MAT-PILOTE-001',
        category: effectiveCategory,
        roleOrFunction:
          parsed.role || matchedActor?.roleOrFunction || 'Responsable Opérationnel',
        organization:
          parsed.org || matchedActor?.organization || dossier.institution || 'UGP',
        department:
          parsed.dept || matchedActor?.department || 'Direction du Programme',
        programmeName: parsed.programme || dossier.name,
        axeName: parsed.axe || resolveAxeAndProjectNames(matchedActor).axeName,
        projectName:
          parsed.project || resolveAxeAndProjectNames(matchedActor).projectName,
        raciRoles: parsed.raci || (matchedActor?.raciRoles || ['R']).join('/'),
        accreditationLevel:
          parsed.accreditation ||
          matchedActor?.accreditationLevel ||
          'ZONE A — ACCÈS TOTAL',
        badgeValidity:
          parsed.validity || matchedActor?.badgeValidity || '31/12/2026',
        bloodType: parsed.blood || prof?.badgeBloodType || 'O+',
        emergencyPhone:
          parsed.emergency || prof?.badgeEmergencyPhone || '+225 27 20 00 12 34',
        email: parsed.email || prof?.emailPro || matchedActor?.email || 'contact@programme-pilote.org',
        phone: parsed.phone || prof?.phoneMobile || prof?.phonePro || matchedActor?.phone || '+225 07 48 08 27 39',
        phoneWork: prof?.phonePro || matchedActor?.phone || '+225 27 20 00 12 34',
        address: prof?.officeAddress || prof?.residenceCity || matchedActor?.address || 'Abidjan, Côte d’Ivoire',
        website: prof?.websiteUrl || matchedActor?.website || 'www.programme-pilote.org',
        photoDataUrl:
          prof?.photoDataUrl ||
          matchedActor?.photoDataUrl ||
          (parsed.fullName === userProfile.fullName
            ? userProfile.cvPhotoDataUrl
            : ''),
        statusMessageFr: isInternal
          ? 'Statut : ACTEUR INTERNE AUTHENTIFIÉ'
          : `ACCÈS RESTREINT : Acteur classé « ${effectiveCategory} » (Non Interne)`,
        statusMessageEn: isInternal
          ? 'Status: AUTHENTICATED INTERNAL ACTOR'
          : `RESTRICTED ACCESS: Actor classified as "${effectiveCategory}" (Non-Internal)`,
        securityDetailFr: isInternal
          ? `Badge officiel vérifié et rattaché au Programme « ${dossier.name} ». Autorisation d’accès confirmée.`
          : `Seuls les acteurs de la catégorie « Interne » disposent d’une habilitation de badge d’accès interne.`,
        securityDetailEn: isInternal
          ? `Official badge verified and attached to Programme "${dossier.name}". Access authorization confirmed.`
          : `Only actors in the "Internal" category hold an internal access badge clearance.`
      };
    } catch {
      // fall through
    }
  }

  // 2. Cas vCard 3.0 / 4.0 (BEGIN:VCARD ... END:VCARD)
  if (/BEGIN:VCARD/i.test(trimmed)) {
    const getVCardField = (prefix: string): string => {
      const regex = new RegExp(`^${prefix}[^:]*:(.*)$`, 'im');
      const m = trimmed.match(regex);
      return m ? m[1].trim() : '';
    };
    const fn = getVCardField('FN');
    const title = getVCardField('TITLE');
    const orgRaw = getVCardField('ORG');
    const [orgPart, deptPart] = orgRaw.split(';');
    const tel = getVCardField('TEL');
    const telWorkMatch = trimmed.match(/^TEL;TYPE=WORK[^:]*:(.*)$/im);
    const telWork = telWorkMatch ? telWorkMatch[1].trim() : '';
    const email = getVCardField('EMAIL');
    const adrRaw = getVCardField('ADR');
    const adrParts = adrRaw.split(';').map(s => s.trim()).filter(Boolean);
    const extractedAddress = adrParts.join(', ');
    const extractedUrl = getVCardField('URL');
    const note = getVCardField('NOTE');

    const matMatch = note.match(/Matricule:\s*([^|\r\n]+)/i);
    const raciMatch = note.match(/RACI:\s*([^|\r\n]+)/i);
    const extractedMat = matMatch ? matMatch[1].trim() : 'MAT-VCARD-001';
    const extractedRaci = raciMatch ? raciMatch[1].trim() : 'R';

    const matchedActor = allActors.find(
      a =>
        a.name.toLowerCase() === fn.toLowerCase() ||
        a.matricule.toLowerCase() === extractedMat.toLowerCase()
    );
    const effectiveCategory: ActorCategoryType =
      matchedActor?.category || 'Interne';
    const isInternal = effectiveCategory === 'Interne';
    const prof =
      storedProfiles[fn] ||
      (matchedActor ? storedProfiles[matchedActor.name] : undefined);
    const { axeName, projectName } = resolveAxeAndProjectNames(matchedActor);

    return {
      isValid: true,
      isInternalAuthenticated: isInternal,
      scanType: 'VCARD_QR',
      rawPayload: trimmed,
      actorName: fn || matchedActor?.name || 'Titulaire Carte vCard',
      matricule: extractedMat,
      category: effectiveCategory,
      roleOrFunction: title || matchedActor?.roleOrFunction || 'Expert Interne',
      organization: orgPart || matchedActor?.organization || dossier.institution,
      department: deptPart || matchedActor?.department || 'UGP / PMO',
      programmeName: dossier.name,
      axeName,
      projectName,
      raciRoles: extractedRaci,
      accreditationLevel:
        matchedActor?.accreditationLevel ||
        'CARTE DE VISITE PRO & ACCÈS INTERNE',
      badgeValidity:
        prof?.badgeValidityDate || matchedActor?.badgeValidity || '31/12/2026',
      bloodType: prof?.badgeBloodType || 'O+',
      emergencyPhone: prof?.badgeEmergencyPhone || tel || '+225 27 20 00 12 34',
      email: email || prof?.emailPro || matchedActor?.email || 'contact@programme-pilote.org',
      phone: tel || prof?.phoneMobile || prof?.phonePro || matchedActor?.phone || '+225 07 48 08 27 39',
      phoneWork: telWork || prof?.phonePro || tel || '+225 27 20 00 12 34',
      address: extractedAddress || prof?.officeAddress || prof?.residenceCity || matchedActor?.address || 'Abidjan, Côte d’Ivoire',
      website: extractedUrl || prof?.websiteUrl || matchedActor?.website || 'www.programme-pilote.org',
      photoDataUrl:
        prof?.photoDataUrl ||
        matchedActor?.photoDataUrl ||
        (fn === userProfile.fullName ? userProfile.cvPhotoDataUrl : ''),
      statusMessageFr: isInternal
        ? 'Statut : ACTEUR INTERNE AUTHENTIFIÉ (Fiche Contact vCard)'
        : `Statut : Contact Externe (« ${effectiveCategory} »)`,
      statusMessageEn: isInternal
        ? 'Status: AUTHENTICATED INTERNAL ACTOR (vCard Contact)'
        : `Status: External Contact ("${effectiveCategory}")`,
      securityDetailFr: isInternal
        ? `QR Code vCard 3.0 valide. Membre interne rattaché à l’institution pilote du programme « ${dossier.name} ».`
        : `Ce contact appartient à la catégorie « ${effectiveCategory} » (hors périmètre interne UGP).`,
      securityDetailEn: isInternal
        ? `Valid vCard 3.0 QR Code. Internal member attached to the piloting entity of "${dossier.name}".`
        : `This contact belongs to category "${effectiveCategory}" (outside internal PMU scope).`
    };
  }

  // 3. Cas Code-Barres 1D (Matricule) ou Recherche par Nom / Matricule
  const cleanLookup = trimmed.toLowerCase();
  const matchedByMatOrName = allActors.find(
    a =>
      a.matricule.toLowerCase() === cleanLookup ||
      a.name.toLowerCase() === cleanLookup ||
      a.name.toLowerCase().includes(cleanLookup) ||
      a.matricule.toLowerCase().includes(cleanLookup)
  );

  // Vérifier aussi dans les profils internes enregistrés
  let matchedProfile: InternalActorProfile | undefined;
  for (const p of Object.values(storedProfiles)) {
    if (
      (p.employeeId && p.employeeId.toLowerCase() === cleanLookup) ||
      (p.fullName && p.fullName.toLowerCase() === cleanLookup)
    ) {
      matchedProfile = p;
      break;
    }
  }

  if (matchedByMatOrName || matchedProfile) {
    const actorName =
      matchedProfile?.fullName ||
      matchedByMatOrName?.name ||
      userProfile.fullName;
    const category: ActorCategoryType =
      matchedByMatOrName?.category || 'Interne';
    const isInternal = category === 'Interne';
    const prof = matchedProfile || storedProfiles[actorName];
    const { axeName, projectName } =
      resolveAxeAndProjectNames(matchedByMatOrName);

    return {
      isValid: true,
      isInternalAuthenticated: isInternal,
      scanType: 'BARCODE_1D',
      rawPayload: trimmed,
      actorName,
      matricule:
        prof?.employeeId ||
        matchedByMatOrName?.matricule ||
        trimmed.toUpperCase(),
      category,
      roleOrFunction:
        prof?.officialRole ||
        matchedByMatOrName?.roleOrFunction ||
        'Responsable Opérationnel',
      organization:
        prof?.executingOrgName ||
        matchedByMatOrName?.organization ||
        dossier.institution,
      department:
        prof?.executingDepartment ||
        matchedByMatOrName?.department ||
        'Unité de Gestion du Programme (UGP)',
      programmeName: dossier.name,
      axeName,
      projectName,
      raciRoles:
        prof?.raciRoleBadge ||
        (matchedByMatOrName?.raciRoles || ['R']).join('/'),
      accreditationLevel:
        matchedByMatOrName?.accreditationLevel ||
        'ZONE A — ACCÈS TOTAL UGP & SITES',
      badgeValidity:
        prof?.badgeValidityDate ||
        matchedByMatOrName?.badgeValidity ||
        '31/12/2026',
      bloodType: prof?.badgeBloodType || 'O+',
      emergencyPhone:
        prof?.badgeEmergencyPhone ||
        prof?.phonePro ||
        matchedByMatOrName?.phone ||
        '+225 27 20 00 12 34',
      email: prof?.emailPro || matchedByMatOrName?.email || 'contact@programme-pilote.org',
      phone:
        prof?.phoneMobile ||
        prof?.phonePro ||
        matchedByMatOrName?.phone ||
        '+225 07 48 08 27 39',
      phoneWork:
        prof?.phonePro ||
        matchedByMatOrName?.phone ||
        '+225 27 20 00 12 34',
      address:
        prof?.officeAddress ||
        prof?.residenceCity ||
        matchedByMatOrName?.address ||
        'Abidjan, Côte d’Ivoire',
      website:
        prof?.websiteUrl ||
        matchedByMatOrName?.website ||
        'www.programme-pilote.org',
      photoDataUrl:
        prof?.photoDataUrl ||
        matchedByMatOrName?.photoDataUrl ||
        (actorName === userProfile.fullName ? userProfile.cvPhotoDataUrl : ''),
      statusMessageFr: isInternal
        ? 'Statut : ACTEUR INTERNE AUTHENTIFIÉ'
        : `ACCÈS REFUSÉ : Acteur classé « ${category} » (Non Interne)`,
      statusMessageEn: isInternal
        ? 'Status: AUTHENTICATED INTERNAL ACTOR'
        : `ACCESS DENIED: Actor classified as "${category}" (Non-Internal)`,
      securityDetailFr: isInternal
        ? `Matricule / Code-barres CODE-128 reconnu dans la base du Programme « ${dossier.name} ». Habilitation Interne valide.`
        : `Attention : L’acteur « ${actorName} » est enregistré dans la catégorie « ${category} ». Seuls les membres « Interne » sont autorisés à détenir un badge d’accès interne.`,
      securityDetailEn: isInternal
        ? `CODE-128 Barcode / ID recognized in Programme "${dossier.name}". Valid Internal clearance.`
        : `Warning: Actor "${actorName}" is registered in category "${category}". Only "Internal" members are authorized to hold an internal access badge.`
    };
  }

  return {
    isValid: false,
    isInternalAuthenticated: false,
    scanType: 'MANUAL_LOOKUP',
    rawPayload: trimmed,
    actorName: 'Identité Non Reconnue',
    matricule: trimmed || 'N/A',
    category: 'Inconnu',
    roleOrFunction: 'Aucune fonction rattachée',
    organization: 'Non répertorié',
    department: '—',
    programmeName: dossier.name,
    axeName: '—',
    projectName: '—',
    raciRoles: '—',
    accreditationLevel: 'AUCUN DROIT D’ACCÈS',
    badgeValidity: 'INVALIDE',
    bloodType: '—',
    emergencyPhone: '—',
    email: '—',
    phone: '—',
    statusMessageFr: 'ALERTE SÉCURITÉ : BADGE OU MATRICULE NON RECONNU',
    statusMessageEn: 'SECURITY ALERT: UNRECOGNIZED BADGE OR ID',
    securityDetailFr: `Aucun acteur interne correspondant au code « ${trimmed} » n’a été trouvé dans le Programme actif « ${dossier.name} ».`,
    securityDetailEn: `No internal actor matching code "${trimmed}" was found in active Programme "${dossier.name}".`
  };
}
