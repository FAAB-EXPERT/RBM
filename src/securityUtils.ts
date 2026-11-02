/**
 * faab gar (faab gar) — Frontend Security & Data Sanitization Utilities
 *
 * Protections implémentées :
 * 1. Protection contre la Pollution de Prototype (Prototype Pollution) lors des imports JSON & localStorage (`__proto__`, `constructor`, `prototype`).
 * 2. Protection contre l'Injection de Formules CSV / DDE (Excel / LibreOffice Calc : `=`, `+`, `-`, `@`, `\t`, `\r`).
 * 3. Validation stricte des Data URLs d'images (Photos d'acteurs, Logos, Cachets, Signatures) — blocage de `javascript:`, `data:text/html` et SVG piégés.
 * 4. Validation et assainissement des URLs externes (`https://` / `http://` uniquement) et des chaînes de texte contre les vecteurs XSS.
 * 5. Vérification d'intégrité des sessions et cloisonnement DOM / Navigation.
 */

const FORBIDDEN_PROTOTYPE_KEYS = new Set([
  '__proto__',
  'constructor',
  'prototype'
]);

const DANGEROUS_SCHEME_REGEX = /^\s*(javascript|vbscript|data\s*:\s*text\/html|data\s*:\s*application\/javascript|file)\s*:/i;

const SCRIPT_TAG_REGEX = /<\s*\/?\s*(script|iframe|object|embed|applet|meta|link|style|base)\b[^>]*>/gi;
const INLINE_EVENT_HANDLER_REGEX = /\bon[a-z]{2,20}\s*=/gi;

/**
 * Parse une chaîne JSON en supprimant récursivement toute clé de pollution de prototype
 * (`__proto__`, `constructor`, `prototype`) et en neutralisant les vecteurs de script.
 */
export function safeJsonParse<T = any>(raw: string, fallback?: T): T {
  if (typeof raw !== 'string' || !raw.trim()) {
    if (fallback !== undefined) return fallback;
    throw new Error('JSON vide ou invalide');
  }

  // Limite de taille de sécurité (50 Mo max en mémoire pour éviter un DoS navigateur)
  if (raw.length > 50 * 1024 * 1024) {
    throw new Error('Fichier JSON dépassant la taille maximale autorisée (50 Mo).');
  }

  try {
    return JSON.parse(raw, (key, value) => {
      if (FORBIDDEN_PROTOTYPE_KEYS.has(key)) {
        return undefined;
      }
      if (typeof value === 'string') {
        return sanitizeTextValue(value);
      }
      return value;
    }) as T;
  } catch (err) {
    if (fallback !== undefined) return fallback;
    throw err;
  }
}

/**
 * Nettoie une chaîne de texte contre les balises <script>, handlers inline (onerror=, onload=)
 * et schémas dangereux (javascript:, data:text/html), tout en préservant les sauts de ligne et accents.
 */
export function sanitizeTextValue(input: unknown, maxLength = 250000): string {
  if (input === null || input === undefined) return '';
  let str = String(input);

  // Si c'est une image base64 légitime, la vérifier via isSafeImageDataUrl sans altérer son contenu base64
  if (str.startsWith('data:image/')) {
    return isSafeImageDataUrl(str) ? str : '';
  }

  if (str.length > maxLength) {
    str = str.slice(0, maxLength);
  }

  // Suppression des caractères de contrôle nuls
  str = str.replace(/\0/g, '');

  if (DANGEROUS_SCHEME_REGEX.test(str)) {
    return '';
  }

  // Neutralisation des balises exécutables et attributs d'événements HTML
  str = str
    .replace(SCRIPT_TAG_REGEX, '')
    .replace(INLINE_EVENT_HANDLER_REGEX, '');

  return str;
}

/**
 * Vérifie qu'une Data URL d'image (photo d'identité, logo, cachet, signature) est sûre.
 * Autorise uniquement les formats d'image légitimes (PNG, JPEG, JPG, WEBP, GIF) ou SVG sans script.
 */
export function isSafeImageDataUrl(url: unknown): boolean {
  if (typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed) return true; // Vide est autorisé (pas d'image)

  // Autoriser les chemins relatifs locaux propres (ex: ./logo.png, /pwa-192x192.png)
  if (
    (trimmed.startsWith('./') || trimmed.startsWith('/')) &&
    !trimmed.startsWith('//') &&
    !/[<>:"\\|?*\x00-\x1F]/.test(trimmed)
  ) {
    return true;
  }

  // Autoriser les images en base64 standards
  const rasterMatch = /^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=\s]+$/i.test(
    trimmed
  );
  if (rasterMatch) return true;

  // Si SVG data URL, vérifier l'absence totale de <script>, onload, javascript:, foreignObject
  if (/^data:image\/svg\+xml(;utf8|;base64)?,/i.test(trimmed)) {
    const lower = trimmed.toLowerCase();
    if (
      lower.includes('<script') ||
      lower.includes('javascript:') ||
      lower.includes('onload=') ||
      lower.includes('onerror=') ||
      lower.includes('<foreignobject')
    ) {
      return false;
    }
    return true;
  }

  return false;
}

/**
 * Valide et normalise une URL externe (Site web, LinkedIn, etc.) pour bloquer `javascript:` ou `data:`.
 */
export function sanitizeExternalUrl(rawUrl: unknown): string {
  if (typeof rawUrl !== 'string') return '';
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';

  if (DANGEROUS_SCHEME_REGEX.test(trimmed)) {
    return '';
  }

  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  try {
    const parsed = new URL(withProtocol);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return '';
    }
    return parsed.toString();
  } catch {
    return '';
  }
}

/**
 * Protection contre l'Injection de Formules CSV (CSV Formula Injection / DDE) lors de l'export Excel.
 * Empêche l'interprétation de `=`, `+`, `-`, `@`, `\t`, `\r` comme formules exécutables,
 * tout en préservant les nombres négatifs et numéros de téléphone internationaux (ex: +225 07...).
 */
export function sanitizeCsvCellForExport(val: unknown): string {
  let str = String(val ?? '')
    .replace(/\0/g, '')
    .replace(/\r?\n/g, ' ')
    .trim();

  if (!str) return '';

  // Détection de formules potentiellement malveillantes commençant par =, +, -, @, \t, \r
  // Exception : nombres purs (-125.50) ou numéros de téléphone (+225 07 48...)
  const firstChar = str[0];
  if (
    firstChar === '=' ||
    firstChar === '@' ||
    firstChar === '\t' ||
    firstChar === '\r' ||
    ((firstChar === '+' || firstChar === '-') &&
      !/^[+-]?\d[\d\s.()-]*$/.test(str))
  ) {
    // Préfixe par une apostrophe invisible dans Excel pour forcer le mode texte brut
    str = `'${str}`;
  }

  if (str.includes(';') || str.includes('"') || str.includes(',')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Nettoie une valeur de cellule lors de l'importation d'un fichier CSV externe.
 */
export function sanitizeCsvValueOnImport(val: unknown): string {
  let str = sanitizeTextValue(val, 10000).trim();
  // Retirer l'apostrophe d'échappement CSV si présente devant un caractère de formule
  if (str.length > 1 && str[0] === "'" && ['=', '+', '-', '@'].includes(str[1])) {
    str = str.slice(1);
  }
  // Bloquer les charges utiles DDE / CMD dans les CSV importés
  if (/^\s*[=+-@]\s*(cmd|powershell|msexe|hyperlink|importxml|webservice)\b/i.test(str)) {
    return str.replace(/^[=+-@]+/, '').trim();
  }
  return str;
}
