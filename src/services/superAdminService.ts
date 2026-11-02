/**
 * faab gar (faab gar) — Super Admin & Standard User Security Service
 *
 * Règles strictes d'architecture et de sécurité :
 * 1. Dissociation stricte des 2 accès :
 *    - Un seul Super Administrateur : "fabien.frikupgeneration@gmail.com" -> Accès EXCLUSIF à la Console Super Administrateur (aucun accès à l'espace Utilisateur classique).
 *    - Tous les autres emails authentifiés via Google Sign-In -> Accès EXCLUSIF à l'espace Utilisateur classique (aucun accès à la Console Super Administrateur).
 * 2. Authentification Google Sign-In obligatoire en premier (à la connexion et après chaque déconnexion).
 * 3. Popup Code PIN (par défaut "0000" sans pavé de chiffres à l'écran, saisie directe au clavier de l'ordinateur/tablette/mobile) + Touch ID / Face ID + Réinitialisation par compte Gmail, avec la même configuration pour le Super Administrateur et pour les Utilisateurs.
 */

import {
  db,
  doc,
  setDoc,
  getDoc,
  collection,
  onSnapshot,
  FirebaseUser,
  SUPER_ADMIN_EMAIL,
  DEFAULT_SUPER_ADMIN_PIN,
  isSuperAdminEmail
} from '../firebase';
import { safeJsonParse, sanitizeTextValue } from '../securityUtils';

export interface SuperAdminProfile {
  nom: string;
  prenoms: string;
  email: string;
  contact: string;
  fonction: string;
  organisation: string;
  updatedAt?: string;
}

export interface PlatformUserRecord {
  uid: string;
  identifier: string;
  displayName: string;
  photoURL?: string;
  providers: string[];
  createdAt: string;
  lastLoginAt: string;
  loginCount: number;
  role: 'super_admin' | 'user';
  updatedAt?: string;
}

const LOCAL_SUPER_ADMIN_PROFILE_KEY = 'faab_super_admin_profile_v1';
const LOCAL_SUPER_ADMIN_PIN_HASH_KEY = 'faab_super_admin_pin_hash_v2';
const LOCAL_USER_PIN_PREFIX = 'faab_user_pin_hash_v2_';
const LOCAL_BIOMETRIC_CRED_PREFIX = 'faab_biometric_cred_v2_';
const LOCAL_PLATFORM_USERS_KEY = 'faab_platform_users_registry_v1';
const SESSION_PIN_VERIFIED_UID_KEY = 'faab_session_pin_verified_uid_v2';

export const defaultSuperAdminProfile: SuperAdminProfile = {
  nom: 'KOFFIE',
  prenoms: 'Fabien Michael',
  email: SUPER_ADMIN_EMAIL,
  contact: '00225 0748082739',
  fonction: 'Super Administrateur & Architecte Principal (PMO / GAR)',
  organisation: 'faab gar (faab gar) — Direction Générale du Pilotage Stratégique'
};

function getAccountPinStorageKey(emailOrUid?: string | null): string {
  const clean = (emailOrUid || '').trim().toLowerCase();
  if (!clean || isSuperAdminEmail(clean)) {
    return LOCAL_SUPER_ADMIN_PIN_HASH_KEY;
  }
  return `${LOCAL_USER_PIN_PREFIX}${clean}`;
}

function getAccountBiometricStorageKey(emailOrUid?: string | null): string {
  const clean = (emailOrUid || SUPER_ADMIN_EMAIL).trim().toLowerCase();
  return `${LOCAL_BIOMETRIC_CRED_PREFIX}${clean}`;
}

/**
 * Hachage déterministe du code PIN par compte (Super Admin ou Utilisateur)
 */
function computePinHashForAccount(
  pin: string,
  accountIdentifier: string = SUPER_ADMIN_EMAIL
): string {
  const cleanPin = pin.trim();
  const cleanId = (accountIdentifier || SUPER_ADMIN_EMAIL).trim().toLowerCase();
  const salted = `faab_plan_pin_salt_2026::${cleanId}::${cleanPin}`;
  let h1 = 0xdeadbeef ^ salted.length;
  let h2 = 0x41c6ce57 ^ salted.length;
  for (let i = 0, ch; i < salted.length; i++) {
    ch = salted.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 =
    Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
    Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 =
    Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
    Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (
    (h2 >>> 0).toString(16).padStart(8, '0') +
    (h1 >>> 0).toString(16).padStart(8, '0')
  );
}

/**
 * Synchronise le hachage du Code PIN et l'identifiant biométrique depuis Cloud Firestore
 * (/super_admin_config/main_profile pour le Super Admin, /user_security_config/{uid} pour un Utilisateur)
 */
export async function syncAccountSecurityFromFirestore(
  user?: { uid?: string; email?: string | null } | null
): Promise<void> {
  if (!user) return;
  const acctEmail = (user.email || SUPER_ADMIN_EMAIL).trim().toLowerCase();
  const storageKey = getAccountPinStorageKey(acctEmail);
  const bioKey = getAccountBiometricStorageKey(acctEmail);

  try {
    if (isSuperAdminEmail(acctEmail)) {
      const snap = await getDoc(doc(db, 'super_admin_config', 'main_profile'));
      if (snap.exists()) {
        const data = snap.data() as {
          pinHash?: string;
          biometricCredentialId?: string;
        };
        if (data.pinHash) {
          try {
            localStorage.setItem(storageKey, data.pinHash);
          } catch {}
        }
        if (data.biometricCredentialId) {
          try {
            localStorage.setItem(bioKey, data.biometricCredentialId);
          } catch {}
        }
      }
    } else if (user.uid) {
      const snap = await getDoc(doc(db, 'user_security_config', user.uid));
      if (snap.exists()) {
        const data = snap.data() as {
          pinHash?: string;
          biometricCredentialId?: string;
        };
        if (data.pinHash) {
          try {
            localStorage.setItem(storageKey, data.pinHash);
          } catch {}
        }
        if (data.biometricCredentialId) {
          try {
            localStorage.setItem(bioKey, data.biometricCredentialId);
          } catch {}
        }
      }
    }
  } catch {
    // Fallback sur le cache local si hors-ligne
  }
}

/**
 * Vérifie si le code PIN saisi correspond au code PIN du compte (par défaut "0000" pour le Super Admin comme pour chaque Utilisateur)
 */
export function verifyAccountPin(
  inputPin: string,
  emailOrUid?: string | null
): boolean {
  const cleaned = String(inputPin || '').trim();
  if (!cleaned) return false;
  const acct = (emailOrUid || SUPER_ADMIN_EMAIL).trim().toLowerCase();
  const storageKey = getAccountPinStorageKey(acct);
  try {
    const storedHash = localStorage.getItem(storageKey);
    if (!storedHash) {
      return cleaned === DEFAULT_SUPER_ADMIN_PIN;
    }
    return computePinHashForAccount(cleaned, acct) === storedHash;
  } catch {
    return cleaned === DEFAULT_SUPER_ADMIN_PIN;
  }
}

/**
 * Vérifie le code PIN en sollicitant d'abord Cloud Firestore pour garantir que toute modification
 * ou réinitialisation du mot de passe / PIN enregistrée dans Firestore est immédiatement prise en compte.
 */
export async function verifyAccountPinWithFirestore(
  inputPin: string,
  user?: { uid?: string; email?: string | null } | null
): Promise<boolean> {
  await syncAccountSecurityFromFirestore(user);
  return verifyAccountPin(inputPin, user?.email);
}

// Alias rétrocompatible
export const verifySuperAdminPin = (inputPin: string) =>
  verifyAccountPin(inputPin, SUPER_ADMIN_EMAIL);

/**
 * Met à jour le code PIN pour le Super Administrateur ou pour un Utilisateur
 * et persiste immédiatement le nouveau hachage dans Cloud Firestore.
 */
export async function updateAccountPin(
  newPin: string,
  user?: { uid?: string; email?: string | null } | null
): Promise<void> {
  const cleaned = String(newPin || '').trim();
  if (cleaned.length < 4) {
    throw new Error('Le code PIN doit comporter au moins 4 caractères.');
  }
  const acctEmail = (user?.email || SUPER_ADMIN_EMAIL).trim().toLowerCase();
  const hash = computePinHashForAccount(cleaned, acctEmail);
  const storageKey = getAccountPinStorageKey(acctEmail);

  try {
    localStorage.setItem(storageKey, hash);
  } catch {
    // ignore
  }

  try {
    if (isSuperAdminEmail(acctEmail)) {
      await setDoc(
        doc(db, 'super_admin_config', 'main_profile'),
        {
          pinHash: hash,
          updatedAt: new Date().toISOString()
        },
        { merge: true }
      );
    } else if (user?.uid) {
      await setDoc(
        doc(db, 'user_security_config', user.uid),
        {
          uid: user.uid,
          email: acctEmail,
          pinHash: hash,
          updatedAt: new Date().toISOString()
        },
        { merge: true }
      );
    }
  } catch {
    // Mode local ou règles en attente
  }
}

export const updateSuperAdminPin = (newPin: string) =>
  updateAccountPin(newPin, { email: SUPER_ADMIN_EMAIL });

/**
 * Réinitialise le code PIN à la valeur par défaut "0000" (après vérification Google Sign-In)
 * et met à jour immédiatement Cloud Firestore (/user_security_config/{uid} ou /super_admin_config/main_profile).
 */
export async function resetAccountPinToDefault(
  user?: { uid?: string; email?: string | null } | null
): Promise<void> {
  const acctEmail = (user?.email || SUPER_ADMIN_EMAIL).trim().toLowerCase();
  const defaultHash = computePinHashForAccount(
    DEFAULT_SUPER_ADMIN_PIN,
    acctEmail
  );
  const storageKey = getAccountPinStorageKey(acctEmail);

  try {
    localStorage.setItem(storageKey, defaultHash);
  } catch {
    // ignore
  }

  try {
    if (isSuperAdminEmail(acctEmail)) {
      await setDoc(
        doc(db, 'super_admin_config', 'main_profile'),
        {
          pinHash: defaultHash,
          updatedAt: new Date().toISOString()
        },
        { merge: true }
      );
    } else if (user?.uid) {
      await setDoc(
        doc(db, 'user_security_config', user.uid),
        {
          uid: user.uid,
          email: acctEmail,
          pinHash: defaultHash,
          updatedAt: new Date().toISOString()
        },
        { merge: true }
      );
    }
  } catch {
    // ignore
  }
}

export const resetSuperAdminPinToDefault = () =>
  resetAccountPinToDefault({ email: SUPER_ADMIN_EMAIL });

/**
 * Gestion de l'état de validation du Code PIN pour la session en cours.
 * Dès que l'utilisateur ou le Super Admin se déconnecte, cet état est effacé :
 * il devra obligatoirement se ré-authentifier via Google Sign-In puis saisir son Code PIN.
 */
export function isSessionPinVerifiedForUser(uid?: string | null): boolean {
  if (!uid) return false;
  try {
    return sessionStorage.getItem(SESSION_PIN_VERIFIED_UID_KEY) === uid;
  } catch {
    return false;
  }
}

export function setSessionPinVerifiedForUser(
  uid: string | null,
  verified: boolean
): void {
  try {
    if (verified && uid) {
      sessionStorage.setItem(SESSION_PIN_VERIFIED_UID_KEY, uid);
    } else {
      sessionStorage.removeItem(SESSION_PIN_VERIFIED_UID_KEY);
    }
  } catch {
    // ignore
  }
}

/**
 * Charge le profil du Super Admin depuis localStorage / Firestore
 */
export async function loadSuperAdminProfile(): Promise<SuperAdminProfile> {
  let localProfile: SuperAdminProfile = { ...defaultSuperAdminProfile };
  try {
    const raw = localStorage.getItem(LOCAL_SUPER_ADMIN_PROFILE_KEY);
    if (raw) {
      const parsed = safeJsonParse<Partial<SuperAdminProfile>>(raw, {});
      localProfile = {
        ...defaultSuperAdminProfile,
        ...parsed,
        email: SUPER_ADMIN_EMAIL
      };
    }
  } catch {
    // ignore
  }

  try {
    const snap = await getDoc(doc(db, 'super_admin_config', 'main_profile'));
    if (snap.exists()) {
      const data = snap.data() as Partial<SuperAdminProfile> & { pinHash?: string };
      if (data.pinHash) {
        try {
          localStorage.setItem(LOCAL_SUPER_ADMIN_PIN_HASH_KEY, data.pinHash);
        } catch {}
      }
      const merged: SuperAdminProfile = {
        nom: sanitizeTextValue(data.nom || localProfile.nom, 120),
        prenoms: sanitizeTextValue(data.prenoms || localProfile.prenoms, 160),
        email: SUPER_ADMIN_EMAIL,
        contact: sanitizeTextValue(data.contact || localProfile.contact, 80),
        fonction: sanitizeTextValue(data.fonction || localProfile.fonction, 200),
        organisation: sanitizeTextValue(
          data.organisation || localProfile.organisation,
          200
        ),
        updatedAt: data.updatedAt || localProfile.updatedAt
      };
      try {
        localStorage.setItem(LOCAL_SUPER_ADMIN_PROFILE_KEY, JSON.stringify(merged));
      } catch {}
      return merged;
    }
  } catch {
    // Fallback local
  }

  return localProfile;
}

/**
 * Enregistre le profil du Super Admin dans localStorage et Firestore
 */
export async function saveSuperAdminProfile(
  profile: SuperAdminProfile
): Promise<SuperAdminProfile> {
  const sanitized: SuperAdminProfile = {
    nom: sanitizeTextValue(profile.nom, 120).trim() || defaultSuperAdminProfile.nom,
    prenoms:
      sanitizeTextValue(profile.prenoms, 160).trim() ||
      defaultSuperAdminProfile.prenoms,
    email: SUPER_ADMIN_EMAIL,
    contact:
      sanitizeTextValue(profile.contact, 80).trim() ||
      defaultSuperAdminProfile.contact,
    fonction:
      sanitizeTextValue(profile.fonction, 200).trim() ||
      defaultSuperAdminProfile.fonction,
    organisation:
      sanitizeTextValue(profile.organisation, 200).trim() ||
      defaultSuperAdminProfile.organisation,
    updatedAt: new Date().toISOString()
  };

  try {
    localStorage.setItem(LOCAL_SUPER_ADMIN_PROFILE_KEY, JSON.stringify(sanitized));
  } catch {
    // ignore
  }

  try {
    await setDoc(doc(db, 'super_admin_config', 'main_profile'), sanitized, {
      merge: true
    });
  } catch {
    // Fallback local
  }

  return sanitized;
}

/**
 * Normalise une date Firebase Auth en ISO 8601
 */
function normalizeAuthDateToIso(dateStr: string | null | undefined): string {
  if (!dateStr) return new Date().toISOString();
  const parsed = new Date(dateStr);
  if (isNaN(parsed.getTime())) return new Date().toISOString();
  return parsed.toISOString();
}

/**
 * Lit le registre local des utilisateurs enregistrés
 */
export function getLocalPlatformUsers(): PlatformUserRecord[] {
  try {
    const raw = localStorage.getItem(LOCAL_PLATFORM_USERS_KEY);
    if (raw) {
      const parsed = safeJsonParse<PlatformUserRecord[]>(raw, []);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map(u => ({
          ...u,
          // Garantit qu'UN SEUL email est Super Administrateur et tous les autres sont Utilisateurs
          role: isSuperAdminEmail(u.identifier) ? 'super_admin' : 'user'
        }));
      }
    }
  } catch {
    // ignore
  }

  const initialAdminRecord: PlatformUserRecord = {
    uid: 'super-admin-fabien-koffie',
    identifier: SUPER_ADMIN_EMAIL,
    displayName: 'KOFFIE Fabien Michael',
    photoURL: '',
    providers: ['google.com'],
    createdAt: '2026-01-15T08:30:00.000Z',
    lastLoginAt: new Date().toISOString(),
    loginCount: 1,
    role: 'super_admin',
    updatedAt: new Date().toISOString()
  };
  return [initialAdminRecord];
}

function saveLocalPlatformUsers(users: PlatformUserRecord[]): void {
  try {
    localStorage.setItem(LOCAL_PLATFORM_USERS_KEY, JSON.stringify(users));
  } catch {
    // ignore
  }
}

/**
 * Synchronise un utilisateur authentifié via Firebase Authentication dans Firestore (`platform_users`)
 * et dans le registre local persistant.
 * RÈGLE STRICTE : Seul "fabien.frikupgeneration@gmail.com" a le rôle 'super_admin', tous les autres ont 'user'.
 */
export async function syncFirebaseUserToRegistry(
  user: FirebaseUser
): Promise<PlatformUserRecord> {
  const email = (user.email || '').trim().toLowerCase();
  const isSuper = isSuperAdminEmail(email);
  const createdIso = normalizeAuthDateToIso(user.creationTime);
  const lastLoginIso = normalizeAuthDateToIso(user.lastSignInTime);
  const providers =
    Array.isArray(user.providers) && user.providers.length > 0
      ? user.providers
      : ['google.com'];

  const localList = getLocalPlatformUsers();
  const existingLocal = localList.find(
    u =>
      u.uid === user.uid ||
      (email && u.identifier.toLowerCase() === email)
  );

  const record: PlatformUserRecord = {
    uid: user.uid,
    identifier: user.email || user.displayName || user.uid,
    displayName:
      user.displayName ||
      existingLocal?.displayName ||
      (isSuper ? 'KOFFIE Fabien Michael' : email.split('@')[0] || 'Utilisateur'),
    photoURL: user.photoURL || existingLocal?.photoURL || '',
    providers: Array.from(
      new Set([...(existingLocal?.providers || []), ...providers])
    ),
    createdAt: existingLocal?.createdAt
      ? new Date(existingLocal.createdAt) < new Date(createdIso)
        ? existingLocal.createdAt
        : createdIso
      : createdIso,
    lastLoginAt: lastLoginIso,
    loginCount: (existingLocal?.loginCount || 0) + 1,
    role: isSuper ? 'super_admin' : 'user',
    updatedAt: new Date().toISOString()
  };

  const filtered = localList.filter(
    u =>
      u.uid !== user.uid &&
      !(email && u.identifier.toLowerCase() === email && u.uid === 'super-admin-fabien-koffie')
  );
  const updatedList = [record, ...filtered].sort(
    (a, b) => new Date(b.lastLoginAt).getTime() - new Date(a.lastLoginAt).getTime()
  );
  saveLocalPlatformUsers(updatedList);

  try {
    await setDoc(doc(db, 'platform_users', user.uid), record, { merge: true });
  } catch {
    // Fallback local
  }

  return record;
}

/**
 * Souscrit en temps réel à la liste des utilisateurs enregistrés (réservé au Super Admin)
 */
export function subscribeToPlatformUsers(
  onUpdate: (users: PlatformUserRecord[]) => void
): () => void {
  const mergeAndEmit = (remoteUsers: PlatformUserRecord[]) => {
    const localUsers = getLocalPlatformUsers();
    const mapByKey = new Map<string, PlatformUserRecord>();

    for (const u of localUsers) {
      mapByKey.set(u.uid, {
        ...u,
        role: isSuperAdminEmail(u.identifier) ? 'super_admin' : 'user'
      });
    }
    for (const r of remoteUsers) {
      if (!r || !r.uid) continue;
      if (isSuperAdminEmail(r.identifier) && r.uid !== 'super-admin-fabien-koffie') {
        mapByKey.delete('super-admin-fabien-koffie');
      }
      const prev = mapByKey.get(r.uid);
      mapByKey.set(r.uid, {
        ...prev,
        ...r,
        role: isSuperAdminEmail(r.identifier) ? 'super_admin' : 'user',
        providers: Array.from(
          new Set([...(prev?.providers || []), ...(r.providers || ['google.com'])])
        )
      });
    }

    const merged = Array.from(mapByKey.values()).sort(
      (a, b) =>
        new Date(b.lastLoginAt || b.createdAt).getTime() -
        new Date(a.lastLoginAt || a.createdAt).getTime()
    );
    saveLocalPlatformUsers(merged);
    onUpdate(merged);
  };

  mergeAndEmit([]);

  try {
    const unsubscribe = onSnapshot(
      collection(db, 'platform_users'),
      snapshot => {
        const remote: PlatformUserRecord[] = [];
        snapshot.forEach(docSnap => {
          const data = docSnap.data() as Partial<PlatformUserRecord>;
          if (data && (data.uid || docSnap.id)) {
            const identifier = data.identifier || 'Utilisateur';
            remote.push({
              uid: data.uid || docSnap.id,
              identifier,
              displayName: data.displayName || identifier,
              photoURL: data.photoURL || '',
              providers: Array.isArray(data.providers)
                ? data.providers
                : ['google.com'],
              createdAt: data.createdAt || new Date().toISOString(),
              lastLoginAt: data.lastLoginAt || new Date().toISOString(),
              loginCount: Number(data.loginCount) || 1,
              role: isSuperAdminEmail(identifier) ? 'super_admin' : 'user',
              updatedAt: data.updatedAt
            });
          }
        });
        mergeAndEmit(remote);
      },
      () => {
        mergeAndEmit([]);
      }
    );
    return unsubscribe;
  } catch {
    return () => {};
  }
}

/**
 * ============================================================================
 * BIOMÉTRIE WEBAUTHN (TOUCH ID / FACE ID / WINDOWS HELLO / EMPREINTE ANDROID)
 * ============================================================================
 */

export async function isPlatformBiometricsSupported(): Promise<boolean> {
  if (
    typeof window === 'undefined' ||
    typeof window.PublicKeyCredential === 'undefined' ||
    !navigator.credentials
  ) {
    return false;
  }
  try {
    if (
      typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable ===
      'function'
    ) {
      return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    }
    return true;
  } catch {
    return false;
  }
}

export function hasRegisteredBiometricCredential(
  email?: string | null
): boolean {
  try {
    return Boolean(
      localStorage.getItem(getAccountBiometricStorageKey(email))
    );
  } catch {
    return false;
  }
}

function bufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBuffer(base64url: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64url.length % 4)) % 4);
  const base64 = (base64url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray.buffer;
}

/**
 * Enregistre le capteur biométrique de l'appareil (Touch ID, Face ID, Windows Hello, Android Biometrics)
 * pour le compte connecté (Super Admin ou Utilisateur).
 */
export async function registerDeviceBiometrics(
  email: string = SUPER_ADMIN_EMAIL,
  displayName: string = 'Utilisateur faab gar'
): Promise<boolean> {
  if (typeof window === 'undefined' || !navigator.credentials) {
    throw new Error('Capteur biométrique WebAuthn non disponible sur ce navigateur.');
  }

  const cleanEmail = (email || SUPER_ADMIN_EMAIL).trim().toLowerCase();
  const challenge = new Uint8Array(32);
  window.crypto.getRandomValues(challenge);
  const userIdBytes = new TextEncoder().encode(cleanEmail);

  const publicKey: PublicKeyCredentialCreationOptions = {
    challenge,
    rp: {
      name: 'faab gar (faab gar)',
      id: window.location.hostname || 'localhost'
    },
    user: {
      id: userIdBytes,
      name: cleanEmail,
      displayName: displayName || cleanEmail
    },
    pubKeyCredParams: [
      { type: 'public-key', alg: -7 },
      { type: 'public-key', alg: -257 }
    ],
    authenticatorSelection: {
      authenticatorAttachment: 'platform',
      userVerification: 'required',
      residentKey: 'preferred'
    },
    timeout: 60000,
    attestation: 'none'
  };

  const credential = (await navigator.credentials.create({
    publicKey
  })) as PublicKeyCredential | null;

  if (!credential || !credential.rawId) {
    return false;
  }

  const credIdB64 = bufferToBase64Url(credential.rawId);
  try {
    localStorage.setItem(getAccountBiometricStorageKey(cleanEmail), credIdB64);
  } catch {
    // ignore
  }
  return true;
}

/**
 * Déverrouille l'appareil / l'accès (Super Admin ou Utilisateur) avec Touch ID / Face ID / Empreinte
 */
export async function authenticateWithDeviceBiometrics(
  email?: string | null,
  displayName?: string | null
): Promise<boolean> {
  if (typeof window === 'undefined' || !navigator.credentials) {
    throw new Error('Touch ID / Face ID non supporté sur cet appareil.');
  }

  const cleanEmail = (email || SUPER_ADMIN_EMAIL).trim().toLowerCase();
  const storedCredId = localStorage.getItem(
    getAccountBiometricStorageKey(cleanEmail)
  );
  if (!storedCredId) {
    return await registerDeviceBiometrics(
      cleanEmail,
      displayName || cleanEmail
    );
  }

  const challenge = new Uint8Array(32);
  window.crypto.getRandomValues(challenge);

  const publicKey: PublicKeyCredentialRequestOptions = {
    challenge,
    rpId: window.location.hostname || 'localhost',
    allowCredentials: [
      {
        type: 'public-key',
        id: base64UrlToBuffer(storedCredId),
        transports: ['internal']
      }
    ],
    userVerification: 'required',
    timeout: 60000
  };

  const assertion = (await navigator.credentials.get({
    publicKey
  })) as PublicKeyCredential | null;

  return Boolean(assertion);
}
