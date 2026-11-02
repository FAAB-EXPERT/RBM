import React, { useState, useEffect } from 'react';
import {
  User,
  Building2,
  Mail,
  Phone,
  Award,
  CheckCircle2,
  FolderOpen,
  FolderPlus,
  Plus,
  Trash2,
  Target,
  FolderKanban,
  ArrowRight,
  AlertTriangle,
  Pencil,
  Check,
  KeyRound,
  Lock,
  Fingerprint,
  ScanFace,
  RefreshCw,
  ShieldCheck
} from 'lucide-react';
import {
  UserProfile,
  Dossier,
  CurrencyCode,
  LanguageCode
} from '../types';
import { AppLogo } from './AppLogo';
import { formatCurrency } from '../i18n';
import {
  FirebaseUser,
  auth,
  googleProvider,
  signInWithPopup,
  mapFirebaseSdkUser,
  DEFAULT_SUPER_ADMIN_PIN
} from '../firebase';
import {
  verifyAccountPinWithFirestore,
  updateAccountPin,
  resetAccountPinToDefault,
  syncAccountSecurityFromFirestore,
  registerDeviceBiometrics,
  hasRegisteredBiometricCredential
} from '../services/superAdminService';

interface UserProfileViewProps {
  userProfile: UserProfile;
  setUserProfile: React.Dispatch<React.SetStateAction<UserProfile>>;
  currency: CurrencyCode;
  setCurrency: (c: CurrencyCode) => void;
  language: LanguageCode;
  setLanguage: (l: LanguageCode) => void;
  onNavigateTab: (tab: string) => void;
  currentUser?: FirebaseUser | null;
  onShowToast?: (msg: string) => void;
}

export const UserProfileView: React.FC<UserProfileViewProps> = ({
  userProfile,
  setUserProfile,
  currency,
  setCurrency,
  language,
  setLanguage,
  onNavigateTab,
  currentUser,
  onShowToast
}) => {
  const isEn = language === 'EN';

  // États pour le changement et la réinitialisation du Code PIN / Mot de passe de l'utilisateur
  const [oldPinInput, setOldPinInput] = useState<string>('');
  const [newPinInput, setNewPinInput] = useState<string>('');
  const [confirmPinInput, setConfirmPinInput] = useState<string>('');
  const [pinStatusMsg, setPinStatusMsg] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [isUpdatingPin, setIsUpdatingPin] = useState<boolean>(false);
  const [isResettingPin, setIsResettingPin] = useState<boolean>(false);
  const [biometricRegistered, setBiometricRegistered] = useState<boolean>(() =>
    hasRegisteredBiometricCredential(currentUser?.email || userProfile.email)
  );

  useEffect(() => {
    if (currentUser) {
      void syncAccountSecurityFromFirestore(currentUser).then(() => {
        setBiometricRegistered(
          hasRegisteredBiometricCredential(currentUser.email)
        );
      });
    }
  }, [currentUser?.uid, currentUser?.email]);

  const handleUpdateUserPinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinStatusMsg(null);
    const targetUser = currentUser || {
      uid: undefined,
      email: userProfile.email
    };

    try {
      setIsUpdatingPin(true);
      const isOldValid = await verifyAccountPinWithFirestore(
        oldPinInput,
        targetUser
      );
      if (!isOldValid) {
        setPinStatusMsg({
          type: 'error',
          text: isEn
            ? 'Current PIN code is incorrect (default is "0000"). You can also reset via Google Sign-In below.'
            : 'Le code PIN actuel est incorrect (par défaut « 0000 »). Vous pouvez aussi le réinitialiser via Google Sign-In ci-dessous.'
        });
        return;
      }

      if (newPinInput.trim().length < 4) {
        setPinStatusMsg({
          type: 'error',
          text: isEn
            ? 'New PIN code must contain at least 4 characters.'
            : 'Le nouveau code PIN doit comporter au moins 4 caractères.'
        });
        return;
      }

      if (newPinInput.trim() !== confirmPinInput.trim()) {
        setPinStatusMsg({
          type: 'error',
          text: isEn
            ? 'New PIN confirmation does not match.'
            : 'La confirmation du nouveau code PIN ne correspond pas.'
        });
        return;
      }

      await updateAccountPin(newPinInput.trim(), targetUser);
      setOldPinInput('');
      setNewPinInput('');
      setConfirmPinInput('');
      const okMsg = isEn
        ? 'Your new PIN code / password has been saved and synchronized in Cloud Firestore!'
        : 'Votre nouveau Code PIN / mot de passe a été enregistré et synchronisé dans Cloud Firestore !';
      setPinStatusMsg({ type: 'success', text: okMsg });
      onShowToast?.(okMsg);
    } catch (err: any) {
      setPinStatusMsg({
        type: 'error',
        text:
          err?.message ||
          (isEn
            ? 'Error updating PIN code.'
            : 'Erreur lors de la mise à jour du code PIN.')
      });
    } finally {
      setIsUpdatingPin(false);
    }
  };

  const handleResetUserPinViaGoogleSignIn = async () => {
    setPinStatusMsg(null);
    const expectedEmail = (
      currentUser?.email ||
      userProfile.email ||
      ''
    )
      .trim()
      .toLowerCase();

    try {
      setIsResettingPin(true);
      if (expectedEmail) {
        googleProvider.setCustomParameters({
          login_hint: expectedEmail,
          prompt: 'select_account'
        });
      } else {
        googleProvider.setCustomParameters({ prompt: 'select_account' });
      }

      // 1. Sollicitation de Google Sign-In pour vérifier l'identité du compte Gmail
      const res = await signInWithPopup(auth, googleProvider);
      const signedEmail = (res.user?.email || '').trim().toLowerCase();

      if (expectedEmail && signedEmail !== expectedEmail) {
        setPinStatusMsg({
          type: 'error',
          text: isEn
            ? `Verification refused: please authenticate with your account (${expectedEmail}).`
            : `Vérification refusée : veuillez vous authentifier avec votre compte (${expectedEmail}).`
        });
        return;
      }

      const mapped = mapFirebaseSdkUser(res.user);

      // 2. Sollicitation de Cloud Firestore (/user_security_config/{uid}) pour réinitialiser ou définir le nouveau PIN
      if (newPinInput.trim().length >= 4) {
        await updateAccountPin(newPinInput.trim(), mapped);
        setOldPinInput('');
        setNewPinInput('');
        setConfirmPinInput('');
        const msg = isEn
          ? 'Google Sign-In verified! Your new PIN has been saved in Cloud Firestore.'
          : 'Identité Google Sign-In vérifiée ! Votre nouveau Code PIN a été enregistré dans Cloud Firestore.';
        setPinStatusMsg({ type: 'success', text: msg });
        onShowToast?.(msg);
      } else {
        await resetAccountPinToDefault(mapped);
        setOldPinInput('');
        setNewPinInput('');
        setConfirmPinInput('');
        const msg = isEn
          ? 'Google Sign-In verified! Your PIN code has been reset to default "0000" in Cloud Firestore.'
          : 'Identité Google Sign-In vérifiée ! Votre Code PIN a été réinitialisé à « 0000 » dans Cloud Firestore.';
        setPinStatusMsg({ type: 'success', text: msg });
        onShowToast?.(msg);
      }
    } catch (err: any) {
      setPinStatusMsg({
        type: 'error',
        text:
          err?.message ||
          (isEn
            ? 'Google Sign-In verification cancelled or failed.'
            : 'Vérification Google Sign-In annulée ou échouée.')
      });
    } finally {
      setIsResettingPin(false);
    }
  };

  const handleRegisterUserBiometrics = async () => {
    setPinStatusMsg(null);
    const email = currentUser?.email || userProfile.email;
    const name = userProfile.fullName || currentUser?.displayName || email;
    try {
      const ok = await registerDeviceBiometrics(email, name);
      if (ok) {
        setBiometricRegistered(true);
        const msg = isEn
          ? 'Touch ID / Face ID activated on this device!'
          : 'Touch ID / Face ID activé avec succès sur cet appareil !';
        setPinStatusMsg({ type: 'success', text: msg });
        onShowToast?.(msg);
      }
    } catch {
      setPinStatusMsg({
        type: 'error',
        text: isEn
          ? 'Touch ID / Face ID could not be activated in this browser context.'
          : 'Touch ID / Face ID n’a pas pu être activé dans ce contexte navigateur.'
      });
    }
  };

  const handleCvPhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = evt => {
      const dataUrl = String(evt.target?.result || '');
      if (dataUrl) {
        setUserProfile(prev => ({ ...prev, cvPhotoDataUrl: dataUrl }));
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-[#c2410c] text-white rounded-2xl p-5 sm:p-6 border-b-4 border-[#fdba74] shadow-md flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="bg-white p-2 rounded-xl shadow-md shrink-0">
            <AppLogo className="w-14 h-14 sm:w-16 sm:h-16" />
          </div>
          <div>
            <div className="inline-block px-2.5 py-0.5 rounded-full bg-[#fdba74] text-slate-950 text-[10px] font-black uppercase tracking-widest mb-1">
              {isEn ? 'IDENTITY, CV & GOVERNANCE' : 'IDENTITÉ, CV & GOUVERNANCE'}
            </div>
            <h2 className="text-lg sm:text-xl font-black uppercase tracking-tight">
              {isEn
                ? 'User Profile & Lead Officer Identity'
                : 'Profil Utilisateur & Identité du Responsable'}
            </h2>
            <p className="text-xs text-[#fdba74] font-medium">
              {isEn
                ? 'Automatically saved in IndexedDB. Each programme is specific: generated documents depend on Macro-Planning, Task Tracking & RACI, and use your profile/CV by default if no actor is entered in RACI.'
                : 'Sauvegardé automatiquement dans l’IndexedDB. Chaque programme est spécifique : les documents générés dépendent de Planification, Suivi des tâches et RACI, et affichent vos informations par défaut si aucun acteur n’est renseigné dans RACI.'}
            </p>
          </div>
        </div>

        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-400/40 text-emerald-200 text-xs font-bold">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          {isEn
            ? 'Synchronized in real time (IndexedDB)'
            : 'Synchronisé en temps réel (IndexedDB)'}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Form Card (2 cols) */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6 shadow-sm space-y-5">
          <h3 className="text-sm font-black uppercase tracking-wider text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-3 flex items-center gap-2">
            <User className="w-4 h-4 text-[#ea580c] dark:text-[#fdba74]" />
            {isEn
              ? 'User Professional Information & Programme Posture'
              : 'Informations Professionnelles & Posture vis-à-vis du Programme'}
          </h3>

          {/* Posture d'intervention du Spécialiste en Gestion de Projet vis-à-vis du Programme & RACI */}
          <div className="p-3.5 rounded-xl bg-orange-50/80 dark:bg-slate-800/80 border border-[#fdba74] dark:border-orange-800 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] font-black uppercase tracking-wider text-[#c2410c] dark:text-[#fdba74]">
                {isEn
                  ? 'Project Management Specialist Posture (Programme & RACI Rule)'
                  : 'Posture du Spécialiste en Gestion de Projet (Règle Programme & RACI)'}
              </span>
              <span className="px-2 py-0.5 rounded bg-[#c2410c] text-[#fdba74] text-[9px] font-black uppercase">
                {userProfile.intervenesAsProgramActor !== false
                  ? isEn
                    ? 'Programme Actor + PMO Specialist'
                    : 'Acteur du Programme + Spécialiste PMO'
                  : isEn
                  ? 'PMO Specialist Only (RACI Actors Priority)'
                  : 'Spécialiste PMO / Rédacteur (Priorité Acteurs RACI)'}
              </span>
            </div>

            <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
              {isEn
                ? 'Each programme is specific. As a Project Management Specialist, you elaborate the Macro-Planning, track tasks, and configure documents. You may intervene as an operational actor of the programme or not. By default, your profile & CV info is displayed in generated documents if no actor is entered in the RACI tab; when actors are entered in RACI, the documents reflect those RACI actors.'
                : 'Chaque programme est spécifique : en tant que spécialiste en gestion de projet, vous élaborez le macro-planning, assurez le suivi des tâches et renseignez les documents. Vous pouvez intervenir comme acteur du programme ou ne pas intervenir comme acteur (par défaut, ce sont vos informations qui s’affichent dans les documents s’il n’y a aucun acteur renseigné dans l’onglet RACI, et vous pouvez mentionner d’autres personnes selon l’onglet RACI).'}
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() =>
                  setUserProfile(prev => ({
                    ...prev,
                    intervenesAsProgramActor: true
                  }))
                }
                className={`px-3 py-2 rounded-xl border text-left transition-all cursor-pointer ${
                  userProfile.intervenesAsProgramActor !== false
                    ? 'bg-[#c2410c] text-white border-[#fdba74] shadow-xs'
                    : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-[#fdba74]'
                }`}
              >
                <div className="text-[11px] font-black uppercase">
                  {isEn
                    ? '1. Intervene as Programme Actor'
                    : '1. Intervenir comme Acteur du Programme'}
                </div>
                <div className="text-[10px] opacity-85 mt-0.5">
                  {isEn
                    ? 'Your identity & CV are active alongside the RACI actors of the selected programme.'
                    : 'Vos informations et celles des acteurs de l’onglet RACI sont combinées dans les documents du programme.'}
                </div>
              </button>

              <button
                type="button"
                onClick={() =>
                  setUserProfile(prev => ({
                    ...prev,
                    intervenesAsProgramActor: false
                  }))
                }
                className={`px-3 py-2 rounded-xl border text-left transition-all cursor-pointer ${
                  userProfile.intervenesAsProgramActor === false
                    ? 'bg-[#c2410c] text-white border-[#fdba74] shadow-xs'
                    : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-[#fdba74]'
                }`}
              >
                <div className="text-[11px] font-black uppercase">
                  {isEn
                    ? '2. Do Not Intervene as Actor (RACI Priority)'
                    : '2. Ne pas intervenir comme Acteur (Priorité RACI)'}
                </div>
                <div className="text-[10px] opacity-85 mt-0.5">
                  {isEn
                    ? 'Displays RACI actors in documents (and falls back to your profile by default only if RACI has no actors).'
                    : 'Affiche les acteurs de l’onglet RACI dans les documents (et vos infos par défaut uniquement si RACI est vide).'}
                </div>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                {isEn ? 'Full Name of Lead Officer / Specialist' : 'Nom & Prénoms du Responsable / Spécialiste'}
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-[#ea580c] absolute left-3 top-3" />
                <input
                  type="text"
                  value={userProfile.fullName}
                  onChange={e =>
                    setUserProfile(prev => ({ ...prev, fullName: e.target.value }))
                  }
                  placeholder={isEn ? 'e.g. KOFFIE Fabien Michael' : 'Ex: KOFFIE Fabien Michael'}
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-[10px] sm:text-sm font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#fdba74]"
                />
              </div>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                {isEn ? 'Official Role / Title' : 'Fonction / Titre Officiel'}
              </label>
              <div className="relative">
                <Award className="w-4 h-4 text-[#ea580c] absolute left-3 top-3" />
                <input
                  type="text"
                  value={userProfile.role}
                  onChange={e =>
                    setUserProfile(prev => ({ ...prev, role: e.target.value }))
                  }
                  placeholder={
                    isEn
                      ? 'e.g. General Coordinator of Strategic Steering / Project Manager'
                      : 'Ex: Coordonnateur Général du Pilotage Stratégique / Chef de Projet'
                  }
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-[10px] sm:text-sm font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#fdba74]"
                />
              </div>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                {isEn
                  ? 'Organization / Company / Institution'
                  : 'Organisation / Entreprise / Institution'}
              </label>
              <div className="relative">
                <Building2 className="w-4 h-4 text-[#ea580c] absolute left-3 top-3" />
                <input
                  type="text"
                  value={userProfile.institution}
                  onChange={e =>
                    setUserProfile(prev => ({
                      ...prev,
                      institution: e.target.value
                    }))
                  }
                  placeholder={
                    isEn
                      ? 'e.g. Directorate General of Strategy & Project Steering'
                      : 'Ex: Direction Générale de la Stratégie & Pilotage des Projets'
                  }
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-[10px] sm:text-sm font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#fdba74]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                {isEn ? 'Professional Email Address' : 'Adresse Email Professionnelle'}
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-[#ea580c] absolute left-3 top-3" />
                <input
                  type="email"
                  value={userProfile.email}
                  onChange={e =>
                    setUserProfile(prev => ({ ...prev, email: e.target.value }))
                  }
                  placeholder={isEn ? 'e.g. contact@organization.org' : 'Ex: contact@organisation.org'}
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-[10px] sm:text-sm font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#fdba74]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                {isEn ? 'Contact / Phone Number' : 'Contact / Téléphone'}
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 text-[#ea580c] absolute left-3 top-3" />
                <input
                  type="text"
                  value={userProfile.phone}
                  onChange={e =>
                    setUserProfile(prev => ({ ...prev, phone: e.target.value }))
                  }
                  placeholder="Ex: +225 07 00 00 00 00"
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-[10px] sm:text-sm font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#fdba74]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                {isEn ? 'Display Monetary Currency' : 'Devise Monétaire d’Affichage'}
              </label>
              <select
                value={currency}
                onChange={e => setCurrency(e.target.value as CurrencyCode)}
                className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-[10px] sm:text-sm font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#fdba74]"
              >
                <option value="FCFA">FCFA (XOF / XAF)</option>
                <option value="EUR">Euro (€)</option>
                <option value="USD">{isEn ? 'US Dollar ($)' : 'Dollar US ($)'}</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                {isEn ? 'Interface Language' : 'Langue de l’Interface'}
              </label>
              <select
                value={language}
                onChange={e => setLanguage(e.target.value as LanguageCode)}
                className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-[10px] sm:text-sm font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#fdba74]"
              >
                <option value="FR">Français (FR)</option>
                <option value="EN">English (EN)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Live Official Badge Preview Card (1 col) */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border-2 border-[#fdba74] dark:border-orange-800 p-5 sm:p-6 shadow-sm flex flex-col justify-between space-y-5">
          <div className="space-y-4">
            <div className="text-xs font-black uppercase tracking-wider text-[#c2410c] dark:text-[#fdba74] border-b border-slate-100 dark:border-slate-800 pb-2">
              {isEn
                ? 'Official Title Block Preview (PDF Reports)'
                : 'Aperçu du Cartouche Officiel (Rapports PDF)'}
            </div>

            <div className="p-4 rounded-xl bg-orange-50/70 dark:bg-slate-800 border border-[#fdba74]/60 space-y-3">
              <div className="flex items-center gap-3">
                {userProfile.cvPhotoDataUrl ? (
                  <img
                    src={userProfile.cvPhotoDataUrl}
                    alt={userProfile.fullName}
                    className="w-12 h-14 rounded-lg object-cover border-2 border-[#c2410c] shrink-0"
                  />
                ) : (
                  <div className="w-11 h-11 rounded-full bg-[#c2410c] text-[#fdba74] flex items-center justify-center font-black text-base shrink-0">
                    {(userProfile.fullName || 'U').slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="text-sm font-black text-slate-900 dark:text-white truncate">
                    {userProfile.fullName || (isEn ? 'Full Name' : 'Nom & Prénoms')}
                  </div>
                  <div className="text-[11px] font-bold text-[#ea580c] dark:text-[#fdba74] truncate">
                    {userProfile.role || (isEn ? 'Role / Title' : 'Fonction / Rôle')}
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-200 dark:border-slate-700 space-y-1.5 text-xs text-slate-700 dark:text-slate-300">
                <div>
                  <strong className="text-slate-500">
                    {isEn ? 'Organization:' : 'Organisation :'}
                  </strong>{' '}
                  {userProfile.institution || '—'}
                </div>
                <div>
                  <strong className="text-slate-500">Email :</strong>{' '}
                  {userProfile.email || '—'}
                </div>
                <div>
                  <strong className="text-slate-500">
                    {isEn ? 'Phone:' : 'Téléphone :'}
                  </strong>{' '}
                  {userProfile.phone || '—'}
                </div>
                <div>
                  <strong className="text-slate-500">
                    {isEn ? 'Nationality / City:' : 'Nationalité / Ville :'}
                  </strong>{' '}
                  {userProfile.nationality || '—'} · {userProfile.residenceCity || '—'}
                </div>
                <div>
                  <strong className="text-slate-500">
                    {isEn ? 'Active Currency:' : 'Devise active :'}
                  </strong>{' '}
                  <span className="px-2 py-0.5 rounded bg-[#fdba74] text-slate-950 font-black text-[10px]">
                    {currency}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-2 pt-2">
            <button
              onClick={() => onNavigateTab('planification')}
              className="w-full py-2.5 px-4 rounded-xl bg-[#c2410c] hover:bg-[#9a3412] text-white text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <span>{isEn ? 'Go to Macro-Planning' : 'Aller à la Planification'}</span>
              <ArrowRight className="w-4 h-4 text-[#fdba74]" />
            </button>
            <button
              onClick={() => onNavigateTab('fiche')}
              className="w-full py-2 px-4 rounded-xl bg-orange-100 dark:bg-slate-800 hover:bg-[#fdba74] text-[#c2410c] dark:text-[#fdba74] hover:text-slate-950 text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <span>{isEn ? 'View A4 Technical Sheet' : 'Voir la Fiche Technique A4'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* SECTION COMPLÈTE : ÉLÉMENTS CONSTITUANT LE CV DE L'UTILISATEUR */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6 shadow-sm space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div>
            <h3 className="text-sm font-black uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-2">
              <Award className="w-4 h-4 text-[#ea580c] dark:text-[#fdba74]" />
              {isEn
                ? 'Elements Constituting the User Curriculum Vitae (CV Exécutif & CV Détaillé Bailleurs)'
                : 'Éléments Constituant le CV de l’Utilisateur (CV Exécutif & CV Détaillé Bailleurs)'}
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              {isEn
                ? 'These CV elements feed the Executive CV (Doc 12), Detailed Donor CV (Doc 13), and default expert qualifications across the selected programme documents.'
                : 'Ces éléments constituent votre CV complet (injectés automatiquement dans le CV Exécutif Doc 12, le CV Détaillé Bailleurs Doc 13 et par défaut dans les documents du programme sélectionné).'}
            </p>
          </div>

          {/* Upload Photo Identité CV */}
          <div className="flex items-center gap-2">
            <label className="px-3 py-1.5 rounded-xl bg-[#c2410c] hover:bg-[#9a3412] text-[#fdba74] text-[11px] font-black uppercase tracking-wider cursor-pointer transition-colors">
              {userProfile.cvPhotoDataUrl
                ? isEn
                  ? 'Change CV Photo'
                  : 'Changer Photo CV'
                : isEn
                ? '+ Add CV Identity Photo'
                : '+ Photo d’Identité CV'}
              <input
                type="file"
                accept="image/*"
                onChange={handleCvPhotoUpload}
                className="hidden"
              />
            </label>
            {userProfile.cvPhotoDataUrl && (
              <button
                type="button"
                onClick={() =>
                  setUserProfile(prev => ({ ...prev, cvPhotoDataUrl: undefined }))
                }
                className="px-2.5 py-1.5 rounded-xl bg-rose-100 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 text-[11px] font-bold cursor-pointer"
              >
                {isEn ? 'Remove Photo' : 'Retirer'}
              </button>
            )}
          </div>
        </div>

        {/* Ligne 1 : État civil, Nationalité, Résidence, LinkedIn, Années d'expérience */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
          <div>
            <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
              {isEn ? 'Nationality' : 'Nationalité'}
            </label>
            <input
              type="text"
              value={userProfile.nationality || ''}
              onChange={e =>
                setUserProfile(prev => ({ ...prev, nationality: e.target.value }))
              }
              placeholder="Ex: Ivoirienne"
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-[10px] sm:text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#fdba74]"
            />
          </div>

          <div>
            <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
              {isEn ? 'Date of Birth' : 'Date de Naissance'}
            </label>
            <input
              type="text"
              value={userProfile.birthDate || ''}
              onChange={e =>
                setUserProfile(prev => ({ ...prev, birthDate: e.target.value }))
              }
              placeholder="Ex: 14/05/1984"
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-[10px] sm:text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#fdba74]"
            />
          </div>

          <div>
            <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
              {isEn ? 'City & Country of Residence' : 'Ville & Pays de Résidence'}
            </label>
            <input
              type="text"
              value={userProfile.residenceCity || ''}
              onChange={e =>
                setUserProfile(prev => ({ ...prev, residenceCity: e.target.value }))
              }
              placeholder="Ex: Abidjan, Côte d’Ivoire"
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-[10px] sm:text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#fdba74]"
            />
          </div>

          <div>
            <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
              {isEn ? 'LinkedIn / Portfolio' : 'LinkedIn / Portfolio'}
            </label>
            <input
              type="text"
              value={userProfile.linkedIn || ''}
              onChange={e =>
                setUserProfile(prev => ({ ...prev, linkedIn: e.target.value }))
              }
              placeholder="Ex: linkedin.com/in/..."
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-[10px] sm:text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#fdba74]"
            />
          </div>

          <div>
            <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
              {isEn ? 'Cumulative Experience' : 'Années d’Expérience Cumulées'}
            </label>
            <input
              type="text"
              value={userProfile.yearsExperience || ''}
              onChange={e =>
                setUserProfile(prev => ({
                  ...prev,
                  yearsExperience: e.target.value
                }))
              }
              placeholder="Ex: +15 ans d’expérience"
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-[10px] sm:text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#fdba74]"
            />
          </div>
        </div>

        {/* Rubriques détaillées du CV */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
              {isEn
                ? '1. Executive Pitch & Summary of Qualifications'
                : '1. Pitch Exécutif & Synthèse des Qualifications'}
            </label>
            <textarea
              rows={3}
              value={userProfile.cvExecutivePitch || ''}
              onChange={e =>
                setUserProfile(prev => ({
                  ...prev,
                  cvExecutivePitch: e.target.value
                }))
              }
              placeholder={
                isEn
                  ? 'Executive summary of qualifications, years of experience, donors practiced...'
                  : 'Résumé exécutif des qualifications, années d’expérience, bailleurs pratiqués...'
              }
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-[10px] sm:text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#fdba74]"
            />
          </div>

          <div>
            <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
              {isEn
                ? '2. Key Skills & Areas of Expertise (PMO, GAR, S&E, Fiduciaire)'
                : '2. Compétences Clés & Domaines d’Expertise (PMO, GAR, S&E, Fiduciaire)'}
            </label>
            <textarea
              rows={3}
              value={userProfile.cvKeySkills || ''}
              onChange={e =>
                setUserProfile(prev => ({
                  ...prev,
                  cvKeySkills: e.target.value
                }))
              }
              placeholder={
                isEn
                  ? 'Project cycle management, WBS, PERT/CPM, GAR, M&E, Procurement...'
                  : 'Ingénierie de projet & PMO, WBS, PERT/CPM, GAR, Suivi-Évaluation, Passation de marchés...'
              }
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-[10px] sm:text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#fdba74]"
            />
          </div>

          <div>
            <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
              {isEn
                ? '3. Academic Education & University Degrees'
                : '3. Cursus Académique, Éducation & Diplômes Universitaires'}
            </label>
            <textarea
              rows={3}
              value={userProfile.cvEducationDiplomas || ''}
              onChange={e =>
                setUserProfile(prev => ({
                  ...prev,
                  cvEducationDiplomas: e.target.value
                }))
              }
              placeholder={
                isEn
                  ? 'Master, Engineering Degree, PhD, Universities, Dates...'
                  : 'Master, Diplôme d’Ingénieur, Doctorat, Institutions, Années et Spécialisations...'
              }
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-[10px] sm:text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#fdba74]"
            />
          </div>

          <div>
            <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
              {isEn
                ? '4. International Certifications & Accreditations'
                : '4. Certifications Internationales & Accréditations'}
            </label>
            <textarea
              rows={3}
              value={userProfile.cvCertifications || ''}
              onChange={e =>
                setUserProfile(prev => ({
                  ...prev,
                  cvCertifications: e.target.value
                }))
              }
              placeholder="Ex: PMP® (PMI), ISO 21500, GAR PNUD, CLEAR/UNEG, PRINCE2®..."
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-[10px] sm:text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#fdba74]"
            />
          </div>

          <div>
            <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
              {isEn
                ? '5. Major Professional Experiences & Career Track Record'
                : '5. Expériences Professionnelles Majeures & Parcours'}
            </label>
            <textarea
              rows={4}
              value={userProfile.cvMajorExperiences || ''}
              onChange={e =>
                setUserProfile(prev => ({
                  ...prev,
                  cvMajorExperiences: e.target.value
                }))
              }
              placeholder={
                isEn
                  ? 'Chronological positions, employers/donors, budgets managed, key achievements...'
                  : 'Périodes, Postes occupés, Organisations/Bailleurs, Budgets gérés et réalisations clés...'
              }
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-[10px] sm:text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#fdba74]"
            />
          </div>

          <div>
            <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
              {isEn
                ? '6. Countries of Intervention & Practicing Donors'
                : '6. Pays d’Intervention & Bailleurs Pratiqués'}
            </label>
            <textarea
              rows={4}
              value={userProfile.cvCountriesAndDonors || ''}
              onChange={e =>
                setUserProfile(prev => ({
                  ...prev,
                  cvCountriesAndDonors: e.target.value
                }))
              }
              placeholder="Ex: Côte d’Ivoire, Sénégal, Burkina Faso... | Banque Mondiale, BAD, UE, PNUD, AFD..."
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-[10px] sm:text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#fdba74]"
            />
          </div>

          <div>
            <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
              {isEn
                ? '7. Spoken Languages (CEFR Level: Read, Written, Spoken)'
                : '7. Langues Parlées (Niveau CECRL : Lu, Écrit, Parlé)'}
            </label>
            <textarea
              rows={2}
              value={userProfile.cvLanguages || ''}
              onChange={e =>
                setUserProfile(prev => ({
                  ...prev,
                  cvLanguages: e.target.value
                }))
              }
              placeholder="Ex: Français (C2), Anglais (C1)..."
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-[10px] sm:text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#fdba74]"
            />
          </div>

          <div>
            <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
              {isEn
                ? '8. Mastered Planning & M&E Software / Tools'
                : '8. Logiciels & Outils de Planification / S&E Maîtrisés'}
            </label>
            <textarea
              rows={2}
              value={userProfile.cvSoftwareTools || ''}
              onChange={e =>
                setUserProfile(prev => ({
                  ...prev,
                  cvSoftwareTools: e.target.value
                }))
              }
              placeholder="Ex: faab gar, MS Project, Primavera P6, Power BI, KoboToolbox, SPSS, R..."
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-[10px] sm:text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#fdba74]"
            />
          </div>

          <div>
            <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
              {isEn
                ? '9. Publications, Studies & Professional Affiliations'
                : '9. Publications, Études & Affiliations Professionnelles'}
            </label>
            <textarea
              rows={3}
              value={userProfile.cvPublicationsAffiliations || ''}
              onChange={e =>
                setUserProfile(prev => ({
                  ...prev,
                  cvPublicationsAffiliations: e.target.value
                }))
              }
              placeholder="Ex: Publications méthodologiques, affiliations PMI®, RFE, AfrEA..."
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-[10px] sm:text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#fdba74]"
            />
          </div>

          <div>
            <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
              {isEn
                ? '10. Verifiable References & Availability'
                : '10. Personnes de Référence Vérifiables & Disponibilité'}
            </label>
            <textarea
              rows={3}
              value={userProfile.cvReferences || ''}
              onChange={e =>
                setUserProfile(prev => ({
                  ...prev,
                  cvReferences: e.target.value
                }))
              }
              placeholder="Ex: 3 personnes de référence (Nom, Fonction, Institution, Email, Tél)..."
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-[10px] sm:text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#fdba74]"
            />
          </div>
        </div>
      </div>

      {/* SECTION SÉCURITÉ DU COMPTE UTILISATEUR : CHANGEMENT DU CODE PIN / MOT DE PASSE, RÉINITIALISATION GOOGLE SIGN-IN & FIRESTORE, ET BIOMÉTRIE */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border-2 border-[#fdba74] dark:border-orange-800 p-5 sm:p-6 shadow-sm space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div>
            <h3 className="text-sm font-black uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-[#ea580c] dark:text-[#fdba74]" />
              {isEn
                ? 'User Account Security: Change PIN Code / Password, Google Sign-In & Firestore Reset, Touch ID / Face ID'
                : 'Sécurité du Compte Utilisateur : Modifier le Code PIN / Mot de Passe, Réinitialisation Google Sign-In & Firestore, Touch ID / Face ID'}
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              {isEn
                ? 'Change your secret PIN code (default "0000"), reset it via Google Sign-In & Cloud Firestore (/user_security_config), or enable Touch ID / Face ID on your device.'
                : 'Modifiez votre Code PIN secret (par défaut « 0000 »), réinitialisez-le en sollicitant Google Sign-In et Cloud Firestore (/user_security_config), ou activez Touch ID / Face ID sur votre appareil.'}
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-50 dark:bg-orange-950/60 border border-[#fdba74]/60 text-[10px] font-black uppercase text-[#c2410c] dark:text-[#fdba74]">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
            {currentUser?.email || userProfile.email}
          </span>
        </div>

        {pinStatusMsg && (
          <div
            className={`p-3.5 rounded-xl border text-xs font-bold flex items-start gap-2.5 ${
              pinStatusMsg.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-200'
                : 'bg-rose-50 dark:bg-rose-950/60 border-rose-300 dark:border-rose-700 text-rose-800 dark:text-rose-200'
            }`}
          >
            {pinStatusMsg.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
            )}
            <span>{pinStatusMsg.text}</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Formulaire de modification du Code PIN / Mot de passe */}
          <form
            onSubmit={handleUpdateUserPinSubmit}
            className="lg:col-span-2 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-4"
          >
            <div className="text-xs font-black uppercase tracking-wider text-[#c2410c] dark:text-[#fdba74] flex items-center gap-2">
              <Lock className="w-4 h-4" />
              <span>
                {isEn
                  ? '1. Change my PIN Code / Access Password'
                  : '1. Changer mon Code PIN / Mot de Passe d’Accès'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                  {isEn
                    ? 'Current PIN (default 0000)'
                    : 'Code PIN Actuel (défaut 0000)'}
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={12}
                  value={oldPinInput}
                  onChange={e => setOldPinInput(e.target.value)}
                  placeholder={DEFAULT_SUPER_ADMIN_PIN}
                  className="w-full px-3 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-sm font-black tracking-widest text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#fdba74]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                  {isEn ? 'New PIN Code' : 'Nouveau Code PIN'}
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={12}
                  value={newPinInput}
                  onChange={e => setNewPinInput(e.target.value)}
                  placeholder="••••"
                  className="w-full px-3 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-sm font-black tracking-widest text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#fdba74]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                  {isEn ? 'Confirm New PIN' : 'Confirmer le Nouveau PIN'}
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={12}
                  value={confirmPinInput}
                  onChange={e => setConfirmPinInput(e.target.value)}
                  placeholder="••••"
                  className="w-full px-3 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-sm font-black tracking-widest text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#fdba74]"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="submit"
                disabled={isUpdatingPin}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#c2410c] hover:bg-[#9a3412] disabled:opacity-50 text-white border border-[#fdba74] text-xs font-black uppercase tracking-wider shadow-sm transition-all cursor-pointer"
              >
                <KeyRound className="w-4 h-4 text-[#fdba74]" />
                <span>
                  {isUpdatingPin
                    ? isEn
                      ? 'Saving to Firestore...'
                      : 'Enregistrement Firestore...'
                    : isEn
                    ? 'Save New PIN Code'
                    : 'Enregistrer le Nouveau Code PIN'}
                </span>
              </button>

              <button
                type="button"
                disabled={isResettingPin}
                onClick={handleResetUserPinViaGoogleSignIn}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 border border-amber-300 text-xs font-black uppercase tracking-wider shadow-sm transition-all cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                <span>
                  {isResettingPin
                    ? isEn
                      ? 'Verifying Google Sign-In & Firestore...'
                      : 'Vérification Google Sign-In & Firestore...'
                    : isEn
                    ? 'Forgot PIN? Reset via Google Sign-In & Firestore'
                    : 'Code PIN oublié ? Réinitialiser via Google Sign-In & Firestore'}
                </span>
              </button>
            </div>
          </form>

          {/* Carte Biométrie Touch ID / Face ID */}
          <div className="p-4 rounded-2xl bg-orange-50/70 dark:bg-slate-800 border border-[#fdba74]/60 flex flex-col justify-between space-y-4">
            <div className="space-y-2">
              <div className="text-xs font-black uppercase tracking-wider text-[#c2410c] dark:text-[#fdba74] flex items-center gap-2">
                <Fingerprint className="w-4 h-4" />
                <ScanFace className="w-4 h-4" />
                <span>
                  {isEn
                    ? '2. Touch ID / Face ID Unlock'
                    : '2. Déverrouillage Touch ID / Face ID'}
                </span>
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                {isEn
                  ? 'Enable biometric authentication (Touch ID, Face ID, Windows Hello, Android Fingerprint) to unlock your faab gar workspace on this device.'
                  : 'Activez l’empreinte biométrique (Touch ID, Face ID, Windows Hello ou empreinte Android) pour déverrouiller rapidement votre session sur cet appareil.'}
              </p>
              <div className="pt-1">
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase ${
                    biometricRegistered
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300'
                      : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {biometricRegistered
                    ? isEn
                      ? 'Touch ID / Face ID Active'
                      : 'Touch ID / Face ID Actif'
                    : isEn
                    ? 'Not configured on this device'
                    : 'Non configuré sur cet appareil'}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleRegisterUserBiometrics}
              className="w-full py-2.5 px-4 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white border border-emerald-400 text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
            >
              <Fingerprint className="w-4 h-4" />
              <ScanFace className="w-4 h-4" />
              <span>
                {biometricRegistered
                  ? isEn
                    ? 'Reconfigure Touch ID / Face ID'
                    : 'Reconfigurer Touch ID / Face ID'
                  : isEn
                  ? 'Activate Touch ID / Face ID'
                  : 'Activer Touch ID / Face ID'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

interface DossiersAndProjectsViewProps {
  dossiers: Dossier[];
  activeDossier: Dossier;
  setActiveDossierId: (id: string) => void;
  onCreateDossier: (name: string, desc: string, horizon: string) => void;
  onUpdateDossier: (
    id: string,
    patch: Partial<Pick<Dossier, 'name' | 'description' | 'horizonPlan'>>
  ) => void;
  onDeleteDossier: (id: string) => void;
  onAddAxe: () => void;
  onUpdateAxeName: (axeId: string, name: string) => void;
  onDeleteAxe: (axeId: string) => void;
  onAddProject: (axeId?: string) => void;
  onUpdateProjectName: (projectId: string, name: string) => void;
  onDeleteProject: (projectId: string) => void;
  currency: CurrencyCode;
  language: LanguageCode;
  onNavigateTab: (tab: string) => void;
}

export const DossiersAndProjectsView: React.FC<DossiersAndProjectsViewProps> = ({
  dossiers,
  activeDossier,
  setActiveDossierId,
  onCreateDossier,
  onUpdateDossier,
  onDeleteDossier,
  onAddAxe,
  onUpdateAxeName,
  onDeleteAxe,
  onAddProject,
  onUpdateProjectName,
  onDeleteProject,
  currency,
  language,
  onNavigateTab
}) => {
  const isEn = language === 'EN';
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [horizon, setHorizon] = useState('2026-2030');
  const [isEditingActiveDossier, setIsEditingActiveDossier] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onCreateDossier(name.trim(), desc.trim(), horizon.trim() || '2026-2030');
    setName('');
    setDesc('');
  };

  const [pendingDelete, setPendingDelete] = useState<{
    type: 'dossier' | 'axe' | 'project';
    id: string;
    label: string;
  } | null>(null);

  return (
    <div className="space-y-3 sm:space-y-6 max-w-full overflow-x-hidden">
      {/* VALIDATION MODAL FOR DELETION OF DOSSIER, AXE OR PROJECT */}
      {pendingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border-2 border-[#fdba74] max-w-md w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-950/60 text-rose-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-black uppercase tracking-wider text-slate-900 dark:text-white">
                  {isEn ? 'Deletion Confirmation Required' : 'Validation de Suppression Requise'}
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                  {isEn ? 'Do you confirm the permanent deletion of ' : 'Confirmez-vous la suppression définitive de '}
                  {pendingDelete.type === 'dossier'
                    ? isEn
                      ? 'this portfolio / program'
                      : 'ce dossier / programme'
                    : pendingDelete.type === 'axe'
                    ? isEn
                      ? 'this strategic axis'
                      : 'cet axe stratégique'
                    : isEn
                    ? 'this operational project'
                    : 'ce projet opérationnel'}{' '}
                  « <strong className="text-[#c2410c] dark:text-[#fdba74]">{pendingDelete.label}</strong> » ?
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setPendingDelete(null)}
                className="px-3.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer"
              >
                {isEn ? 'Cancel' : 'Annuler'}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (pendingDelete.type === 'dossier') {
                    onDeleteDossier(pendingDelete.id);
                  } else if (pendingDelete.type === 'axe') {
                    onDeleteAxe(pendingDelete.id);
                  } else {
                    onDeleteProject(pendingDelete.id);
                  }
                  setPendingDelete(null);
                }}
                className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-black uppercase cursor-pointer"
              >
                {isEn ? 'Confirm Deletion' : 'Valider la suppression'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Compact Header & Quick Dossier Selector Bar */}
      <div className="bg-white dark:bg-slate-900 rounded-xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 p-2.5 sm:p-5 shadow-sm flex flex-wrap items-center justify-between gap-2 sm:gap-4">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
          <div className="w-7 h-7 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-[#fdba74]/30 text-[#c2410c] dark:text-[#fdba74] flex items-center justify-center shrink-0">
            <FolderOpen className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-[11px] sm:text-base font-black uppercase tracking-tight text-slate-900 dark:text-white truncate">
              {isEn
                ? 'Portfolios, Strategic Axes & Projects Management'
                : 'Gestion des Dossiers, Axes & Projets'}
            </h2>
            <p className="text-[9.5px] sm:text-xs text-slate-500 dark:text-slate-400 truncate">
              {isEn ? 'Active Portfolio:' : 'Dossier Actif :'}{' '}
              <strong className="text-[#ea580c]">{activeDossier.name}</strong>
            </p>
          </div>
        </div>

        <button
          onClick={() => onNavigateTab('planification')}
          className="inline-flex items-center gap-1 sm:gap-2 px-2.5 py-1 sm:px-4 sm:py-2 rounded-lg sm:rounded-xl bg-[#c2410c] text-white text-[9.5px] sm:text-xs font-black uppercase cursor-pointer shrink-0"
        >
          <span>{isEn ? 'Planning' : 'Planification'}</span>
          <ArrowRight className="w-3 h-3 sm:w-4 sm:h-4 text-[#fdba74]" />
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-6">
        {/* Create New Dossier Form (Compact on mobile) */}
        <form
          onSubmit={handleSubmit}
          className="bg-white dark:bg-slate-900 rounded-xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 p-2.5 sm:p-5 shadow-sm space-y-2 sm:space-y-4"
        >
          <h3 className="text-[10px] sm:text-xs font-black uppercase tracking-wider text-[#c2410c] dark:text-[#fdba74] flex items-center gap-1.5 sm:gap-2">
            <FolderPlus className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
            <span>
              {isEn ? 'Create a New Portfolio / Program' : 'Créer un Nouveau Dossier / Programme'}
            </span>
          </h3>

          <div className="grid grid-cols-3 sm:grid-cols-1 gap-1.5 sm:gap-4">
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-[9px] sm:text-[11px] font-bold uppercase text-slate-500 mb-0.5 sm:mb-1">
                {isEn ? 'Portfolio / Program Name' : 'Nom du Dossier / Programme'}
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder={isEn ? 'e.g. Program 2026-2030' : 'Ex: Programme 2026-2030'}
                className="w-full px-2 py-1 sm:px-3 sm:py-2 rounded-md sm:rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-[10px] sm:text-xs font-bold text-slate-900 dark:text-white"
              />
            </div>

            <div className="col-span-1">
              <label className="block text-[9px] sm:text-[11px] font-bold uppercase text-slate-500 mb-0.5 sm:mb-1">
                {isEn ? 'Horizon' : 'Horizon'}
              </label>
              <input
                type="text"
                value={horizon}
                onChange={e => setHorizon(e.target.value)}
                placeholder="2026-2030"
                className="w-full px-2 py-1 sm:px-3 sm:py-2 rounded-md sm:rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-[10px] sm:text-xs font-bold text-slate-900 dark:text-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-[9px] sm:text-[11px] font-bold uppercase text-slate-500 mb-0.5 sm:mb-1">
              {isEn ? 'Description / Overall Objective' : 'Description / Objectif Global'}
            </label>
            <textarea
              rows={2}
              value={desc}
              onChange={e => setDesc(e.target.value)}
              placeholder={
                isEn
                  ? 'Briefly describe the portfolio objectives...'
                  : 'Décrivez brièvement les objectifs du portefeuille...'
              }
              className="w-full px-2 py-1 sm:px-3 sm:py-2 rounded-md sm:rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-[10px] sm:text-xs text-slate-900 dark:text-white"
            />
          </div>

          <button
            type="submit"
            className="w-full py-1.5 sm:py-2.5 rounded-lg sm:rounded-xl bg-[#c2410c] hover:bg-[#9a3412] text-white text-[10px] sm:text-xs font-black uppercase cursor-pointer"
          >
            {isEn ? '+ Create & Activate This Portfolio' : '+ Créer et Activer ce Dossier'}
          </button>
        </form>

        {/* List of Dossiers & Active Dossier Structure */}
        <div className="lg:col-span-2 space-y-3 sm:space-y-4 min-w-0">
          {/* Ultra-Compact Dossiers / Programmes Selector on Mobile, Full Grid on Tablet/Desktop */}
          <div className="bg-white dark:bg-slate-900 rounded-xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 p-2.5 sm:p-5 shadow-sm space-y-2 sm:space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-[10px] sm:text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white truncate">
                {isEn
                  ? `Portfolio / Program Selector (${dossiers.length})`
                  : `Sélecteur de Dossiers / Programmes (${dossiers.length})`}
              </h3>
              {dossiers.length > 1 && (
                <button
                  onClick={() =>
                    setPendingDelete({
                      type: 'dossier',
                      id: activeDossier.id,
                      label: activeDossier.name
                    })
                  }
                  className="sm:hidden inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-50 dark:bg-rose-950/40 text-rose-600 text-[9px] font-bold cursor-pointer shrink-0"
                  title={isEn ? 'Delete active portfolio' : 'Supprimer le dossier actif'}
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Mobile Ultra-Compact Select Dropdown + Active Dossier Edit Box */}
            <div className="sm:hidden space-y-2">
              <select
                value={activeDossier.id}
                onChange={e => {
                  setIsEditingActiveDossier(false);
                  setActiveDossierId(e.target.value);
                }}
                className="w-full h-7 px-2 py-0.5 rounded-md bg-orange-50/70 dark:bg-slate-800 border border-[#ea580c] text-[10px] font-extrabold text-slate-900 dark:text-white focus:outline-none truncate"
              >
                {dossiers.map(d => {
                  const dAxes = d.axes || [];
                  const dProjs = dAxes.flatMap(a => a.projects || []);
                  return (
                    <option key={d.id} value={d.id}>
                      {d.name} ({dAxes.length} {isEn ? 'Axes' : 'Axes'} • {dProjs.length} Proj.)
                    </option>
                  );
                })}
              </select>

              {/* Mobile Active Dossier Info & Direct Modification with Pencil / Check ("V") */}
              <div className="p-2.5 rounded-xl border-2 border-[#ea580c] bg-orange-50/60 dark:bg-orange-950/40 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="px-1.5 py-0.5 rounded bg-[#fdba74] text-slate-950 text-[9px] font-black uppercase shrink-0">
                      {isEn ? 'ACTIVE' : 'ACTIF'}
                    </span>
                    <span className="text-[10px] font-mono font-bold text-[#ea580c] dark:text-[#fdba74] truncate">
                      {isEn ? 'Horizon:' : 'Horizon :'} {activeDossier.horizonPlan || '2026-2030'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsEditingActiveDossier(prev => !prev)}
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-black transition-all cursor-pointer shrink-0 ${
                      isEditingActiveDossier
                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs'
                        : 'bg-[#c2410c] hover:bg-[#9a3412] text-[#fdba74]'
                    }`}
                    title={
                      isEditingActiveDossier
                        ? isEn
                          ? 'Validate modifications'
                          : 'Valider les modifications'
                        : isEn
                        ? 'Edit active program'
                        : 'Modifier le programme actif'
                    }
                  >
                    {isEditingActiveDossier ? (
                      <>
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                        <span>{isEn ? 'Validate' : 'Valider'}</span>
                      </>
                    ) : (
                      <>
                        <Pencil className="w-3 h-3" />
                        <span>{isEn ? 'Edit' : 'Modifier'}</span>
                      </>
                    )}
                  </button>
                </div>

                {isEditingActiveDossier ? (
                  <div className="space-y-1.5 pt-1 border-t border-orange-200/70 dark:border-slate-700">
                    <div>
                      <label className="block text-[9px] font-bold uppercase text-slate-600 dark:text-slate-300 mb-0.5">
                        {isEn ? 'Portfolio / Program Name' : 'Nom du Dossier / Programme'}
                      </label>
                      <input
                        type="text"
                        value={activeDossier.name}
                        onChange={e =>
                          onUpdateDossier(activeDossier.id, { name: e.target.value })
                        }
                        className="w-full px-2 py-1 rounded bg-white dark:bg-slate-900 border border-[#ea580c] text-[10px] font-bold text-slate-900 dark:text-white focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold uppercase text-slate-600 dark:text-slate-300 mb-0.5">
                        {isEn ? 'Horizon' : 'Horizon'}
                      </label>
                      <input
                        type="text"
                        value={activeDossier.horizonPlan || ''}
                        onChange={e =>
                          onUpdateDossier(activeDossier.id, {
                            horizonPlan: e.target.value
                          })
                        }
                        className="w-full px-2 py-1 rounded bg-white dark:bg-slate-900 border border-[#ea580c] text-[10px] font-bold text-slate-900 dark:text-white focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold uppercase text-slate-600 dark:text-slate-300 mb-0.5">
                        {isEn
                          ? 'Description / Overall Objective'
                          : 'Description / Objectif Global'}
                      </label>
                      <textarea
                        rows={2}
                        value={activeDossier.description || ''}
                        onChange={e =>
                          onUpdateDossier(activeDossier.id, {
                            description: e.target.value
                          })
                        }
                        className="w-full px-2 py-1 rounded bg-white dark:bg-slate-900 border border-[#ea580c] text-[10px] text-slate-900 dark:text-white focus:outline-none"
                      />
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="text-[11px] font-black text-slate-900 dark:text-white">
                      {activeDossier.name}
                    </div>
                    <p className="text-[10px] text-slate-600 dark:text-slate-300 mt-0.5">
                      {activeDossier.description}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Tablet & Desktop Cards Grid */}
            <div className="hidden sm:grid sm:grid-cols-2 gap-3">
              {dossiers.map(d => {
                const isAct = d.id === activeDossier.id;
                const dAxes = d.axes || [];
                const dProjs = dAxes.flatMap(a => a.projects || []);
                return (
                  <div
                    key={d.id}
                    className={`p-3.5 rounded-xl border-2 transition-all flex flex-col justify-between gap-2 ${
                      isAct
                        ? 'border-[#ea580c] bg-orange-50/60 dark:bg-orange-950/40'
                        : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40'
                    }`}
                  >
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <span className="text-xs font-black text-slate-900 dark:text-white block">
                            {d.name}
                          </span>
                          <span className="inline-block mt-0.5 text-[10px] font-mono font-bold text-[#ea580c] dark:text-[#fdba74]">
                            {isEn ? 'Horizon:' : 'Horizon :'} {d.horizonPlan || '2026-2030'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {isAct && (
                            <>
                              <button
                                type="button"
                                onClick={() => setIsEditingActiveDossier(prev => !prev)}
                                className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-black transition-all cursor-pointer ${
                                  isEditingActiveDossier
                                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs'
                                    : 'bg-[#c2410c] hover:bg-[#9a3412] text-[#fdba74]'
                                }`}
                                title={
                                  isEditingActiveDossier
                                    ? isEn
                                      ? 'Validate modifications'
                                      : 'Valider les modifications'
                                    : isEn
                                    ? 'Edit active program (Name, Horizon, Description)'
                                    : 'Modifier le programme actif (Nom, Horizon, Description)'
                                }
                              >
                                {isEditingActiveDossier ? (
                                  <>
                                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                                    <span>{isEn ? 'Validate' : 'Valider'}</span>
                                  </>
                                ) : (
                                  <Pencil className="w-3.5 h-3.5" />
                                )}
                              </button>
                              <span className="px-2 py-0.5 rounded bg-[#fdba74] text-slate-950 text-[9px] font-black uppercase shrink-0">
                                {isEn ? 'ACTIVE' : 'ACTIF'}
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      {isAct && isEditingActiveDossier ? (
                        <div className="space-y-2 pt-2 border-t border-orange-200/80 dark:border-slate-700">
                          <div>
                            <label className="block text-[10px] font-bold uppercase text-slate-600 dark:text-slate-300 mb-0.5">
                              {isEn
                                ? 'Portfolio / Program Name'
                                : 'Nom du Dossier / Programme'}
                            </label>
                            <input
                              type="text"
                              value={d.name}
                              onChange={e =>
                                onUpdateDossier(d.id, { name: e.target.value })
                              }
                              className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-[#ea580c] text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#fdba74]"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold uppercase text-slate-600 dark:text-slate-300 mb-0.5">
                              {isEn ? 'Horizon' : 'Horizon'}
                            </label>
                            <input
                              type="text"
                              value={d.horizonPlan || ''}
                              onChange={e =>
                                onUpdateDossier(d.id, {
                                  horizonPlan: e.target.value
                                })
                              }
                              className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-[#ea580c] text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#fdba74]"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold uppercase text-slate-600 dark:text-slate-300 mb-0.5">
                              {isEn
                                ? 'Description / Overall Objective'
                                : 'Description / Objectif Global'}
                            </label>
                            <textarea
                              rows={2}
                              value={d.description || ''}
                              onChange={e =>
                                onUpdateDossier(d.id, {
                                  description: e.target.value
                                })
                              }
                              className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-[#ea580c] text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#fdba74]"
                            />
                          </div>
                        </div>
                      ) : (
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                          {d.description}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-slate-200/70 dark:border-slate-700 text-[10px] font-bold">
                      <span className="text-[#ea580c] dark:text-[#fdba74]">
                        {dAxes.length} {isEn ? 'Axis/Axes' : 'Axe(s)'} • {dProjs.length}{' '}
                        {isEn ? 'Project(s)' : 'Projet(s)'}
                      </span>
                      <div className="flex items-center gap-1.5">
                        {!isAct && (
                          <button
                            onClick={() => {
                              setIsEditingActiveDossier(false);
                              setActiveDossierId(d.id);
                            }}
                            className="px-2 py-0.5 rounded bg-[#c2410c] text-white text-[10px] font-bold cursor-pointer"
                          >
                            {isEn ? 'Activate' : 'Activer'}
                          </button>
                        )}
                        {dossiers.length > 1 && (
                          <button
                            onClick={() =>
                              setPendingDelete({
                                type: 'dossier',
                                id: d.id,
                                label: d.name
                              })
                            }
                            className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                            title={isEn ? 'Delete this portfolio' : 'Supprimer ce dossier'}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Active Dossier Axes & Projects (No Word Crushing on Mobile!) */}
          <div className="bg-white dark:bg-slate-900 rounded-xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 p-2.5 sm:p-5 shadow-sm space-y-2.5 sm:space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-[10px] sm:text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white truncate min-w-0 flex-1">
                {isEn ? 'Structure:' : 'Structure :'} {activeDossier.name}
              </h3>
              <button
                onClick={onAddAxe}
                className="inline-flex items-center px-2 py-0.5 sm:px-3 sm:py-1 rounded-md sm:rounded-lg bg-[#fdba74] hover:bg-orange-200 text-slate-950 text-[9.5px] sm:text-[11px] font-black cursor-pointer transition-colors shrink-0"
              >
                {isEn ? '+Axis' : '+Axe'}
              </button>
            </div>

            <div className="space-y-2.5 sm:space-y-3">
              {(activeDossier.axes || []).map((ax, aIdx) => (
                <div
                  key={ax.id}
                  className="p-2 sm:p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 space-y-2"
                >
                  {/* AXE HEADER: Stacked cleanly on mobile so words never crush each other */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-2">
                    <div className="flex items-center justify-between sm:justify-start gap-1.5">
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#c2410c] text-[#fdba74] font-mono text-[9px] sm:text-[10px] font-black uppercase shrink-0">
                        <Target className="w-2.5 h-2.5 sm:w-3 sm:h-3 shrink-0" />
                        {isEn ? `AXIS ${aIdx + 1}` : `AXE ${aIdx + 1}`}
                      </span>

                      {/* Mobile Action Buttons for Axe */}
                      <div className="flex sm:hidden items-center gap-1 shrink-0">
                        <button
                          onClick={() => onAddProject(ax.id)}
                          className="px-2 py-0.5 rounded bg-[#c2410c] hover:bg-[#9a3412] text-white text-[9px] font-black cursor-pointer transition-colors"
                        >
                          {isEn ? '+ Project' : '+ Projet'}
                        </button>
                        {(activeDossier.axes || []).length > 1 && (
                          <button
                            onClick={() =>
                              setPendingDelete({
                                type: 'axe',
                                id: ax.id,
                                label: `${isEn ? 'AXIS' : 'AXE'} ${aIdx + 1} — ${ax.name}`
                              })
                            }
                            className="p-1 rounded text-slate-400 hover:text-rose-600 cursor-pointer"
                            title={isEn ? 'Delete this Axis' : 'Supprimer cet Axe'}
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>

                    <input
                      type="text"
                      value={ax.name}
                      onChange={e => onUpdateAxeName(ax.id, e.target.value)}
                      className="w-full min-w-0 flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-2 py-1 text-[10.5px] sm:text-xs font-black text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-[#ea580c]"
                    />

                    {/* Tablet/Desktop Action Buttons for Axe */}
                    <div className="hidden sm:flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => onAddProject(ax.id)}
                        className="px-2.5 py-1 rounded-lg bg-[#c2410c] hover:bg-[#9a3412] text-white text-[10px] font-black cursor-pointer transition-colors"
                      >
                        {isEn ? '+ Project' : '+ Projet'}
                      </button>
                      {(activeDossier.axes || []).length > 1 && (
                        <button
                          onClick={() =>
                            setPendingDelete({
                              type: 'axe',
                              id: ax.id,
                              label: `${isEn ? 'AXIS' : 'AXE'} ${aIdx + 1} — ${ax.name}`
                            })
                          }
                          className="p-1 rounded text-slate-400 hover:text-rose-600 cursor-pointer"
                          title={isEn ? 'Delete this Axis' : 'Supprimer cet Axe'}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* PROJECTS LIST UNDER AXE */}
                  <div className="pl-2 sm:pl-4 border-l-2 border-[#fdba74] space-y-1.5">
                    {(ax.projects || []).map((pr, pIdx) => {
                      const pTasks = pr.tasks || [];
                      const pBud = pTasks.reduce(
                        (s, tk) => s + (Number(tk.budget) || 0),
                        0
                      );
                      return (
                        <div
                          key={pr.id}
                          className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-2 text-[11px] bg-white dark:bg-slate-900 px-2 py-1.5 sm:px-3 sm:py-1.5 rounded-lg border border-slate-200 dark:border-slate-700"
                        >
                          <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 w-full min-w-0 flex-1">
                            <FolderKanban className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-[#ea580c] shrink-0" />
                            <span className="shrink-0 text-[9.5px] sm:text-[11px] font-black text-[#c2410c] dark:text-[#fdba74]">
                              PRJ {aIdx + 1}.{pIdx + 1} :
                            </span>
                            <input
                              type="text"
                              value={pr.name}
                              onChange={e =>
                                onUpdateProjectName(pr.id, e.target.value)
                              }
                              className="w-full min-w-0 flex-1 bg-slate-50/70 sm:bg-transparent border border-slate-200/80 sm:border-transparent hover:border-slate-200 dark:border-slate-700 focus:border-[#ea580c] rounded px-1.5 py-0.5 text-[10px] sm:text-xs font-bold text-slate-900 dark:text-white focus:outline-none"
                            />
                          </div>
                          <div className="flex items-center justify-between sm:justify-end gap-2 pl-4 sm:pl-0 shrink-0">
                            <span className="font-mono text-[9px] sm:text-[10px] font-bold text-slate-500 truncate">
                              {pTasks.length} {isEn ? 'task(s)' : 'tâche(s)'} •{' '}
                              {formatCurrency(pBud, currency, language)}
                            </span>
                            <button
                              onClick={() =>
                                setPendingDelete({
                                  type: 'project',
                                  id: pr.id,
                                  label: `PRJ ${aIdx + 1}.${pIdx + 1} — ${pr.name}`
                                })
                              }
                              className="p-0.5 sm:p-1 rounded text-slate-400 hover:text-rose-600 cursor-pointer shrink-0"
                              title={isEn ? 'Delete this Project' : 'Supprimer ce Projet'}
                            >
                              <Trash2 className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

