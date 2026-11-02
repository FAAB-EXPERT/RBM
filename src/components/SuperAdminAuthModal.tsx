import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  User as UserIcon,
  Lock,
  Unlock,
  KeyRound,
  Fingerprint,
  ScanFace,
  Mail,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  LogOut,
  Eye,
  EyeOff
} from 'lucide-react';
import {
  FirebaseUser,
  DEFAULT_SUPER_ADMIN_PIN,
  isSuperAdminEmail,
  auth,
  googleProvider,
  signInWithPopup,
  sendPasswordResetEmail,
  mapFirebaseSdkUser
} from '../firebase';
import {
  verifyAccountPin,
  syncAccountSecurityFromFirestore,
  resetAccountPinToDefault,
  updateAccountPin,
  authenticateWithDeviceBiometrics,
  isPlatformBiometricsSupported
} from '../services/superAdminService';

export type AuthModalStep =
  | 'pin_and_biometric'
  | 'forgot_pin_gmail'
  | 'device_locked';

interface SuperAdminAuthModalProps {
  isOpen: boolean;
  initialStep?: AuthModalStep;
  currentUser: FirebaseUser | null;
  language: 'FR' | 'EN';
  onClose: () => void;
  onAuthenticatedSuccess: (
    user: FirebaseUser,
    assignedRole: 'super_admin' | 'user'
  ) => void;
  onSignOut?: () => void;
}

export const SuperAdminAuthModal: React.FC<SuperAdminAuthModalProps> = ({
  isOpen,
  initialStep = 'pin_and_biometric',
  currentUser,
  language,
  onAuthenticatedSuccess,
  onSignOut
}) => {
  const isEn = language === 'EN';

  const [step, setStep] = useState<AuthModalStep>(initialStep);
  const [pinInput, setPinInput] = useState<string>('');
  const [showPin, setShowPin] = useState<boolean>(false);
  const [newPinAfterReset, setNewPinAfterReset] = useState<string>('');
  const [isBusy, setIsBusy] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [biometricsAvailable, setBiometricsAvailable] = useState<boolean>(true);

  useEffect(() => {
    if (isOpen) {
      setStep(
        initialStep === 'device_locked' ? 'device_locked' : 'pin_and_biometric'
      );
      setPinInput('');
      setNewPinAfterReset('');
      setErrorMsg(null);
      setSuccessMsg(null);
      isPlatformBiometricsSupported().then(supported => {
        setBiometricsAvailable(supported);
      });
      if (currentUser) {
        void syncAccountSecurityFromFirestore(currentUser);
      }
    }
  }, [isOpen, initialStep, currentUser?.uid]);

  if (!isOpen || !currentUser) return null;

  // Règle stricte : Seul "fabien.frikupgeneration@gmail.com" est reconnu comme Super Administrateur.
  // Tous les autres emails sont reconnus exclusivement comme Utilisateurs.
  const isSuperAdmin = isSuperAdminEmail(currentUser.email);
  const assignedRole: 'super_admin' | 'user' = isSuperAdmin
    ? 'super_admin'
    : 'user';
  const accountEmail = currentUser.email || '';

  // Validation du Code PIN saisi au clavier de l'appareil (par défaut "0000")
  const handleVerifyPinSubmit = (e?: React.FormEvent | React.MouseEvent) => {
    if (e) e.preventDefault();
    setErrorMsg(null);

    const enteredPin = pinInput.trim();
    if (!enteredPin) {
      setErrorMsg(
        isEn
          ? 'Please type your PIN code using your device keyboard (default: "0000").'
          : 'Veuillez saisir votre Code PIN avec le clavier de votre appareil (par défaut : « 0000 »).'
      );
      return;
    }

    if (!verifyAccountPin(enteredPin, accountEmail)) {
      setErrorMsg(
        isEn
          ? 'Incorrect PIN code. Default PIN is "0000" (or reset via your Gmail account below).'
          : 'Code PIN incorrect. Le code PIN par défaut est « 0000 » (ou réinitialisez via votre compte Gmail ci-dessous).'
      );
      return;
    }

    onAuthenticatedSuccess(currentUser, assignedRole);
  };

  // Déverrouillage avec Touch ID / Face ID (WebAuthn sur ordinateur, tablette et mobile)
  const handleBiometricUnlock = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      setIsBusy(true);
      const ok = await authenticateWithDeviceBiometrics(
        accountEmail,
        currentUser.displayName || accountEmail
      );
      if (!ok) {
        setErrorMsg(
          isEn
            ? 'Touch ID / Face ID verification was cancelled or failed.'
            : 'La vérification Touch ID / Face ID a été annulée ou a échoué.'
        );
        return;
      }

      setSuccessMsg(
        isEn
          ? 'Touch ID / Face ID verified successfully!'
          : 'Déverrouillage Touch ID / Face ID validé avec succès !'
      );

      onAuthenticatedSuccess(currentUser, assignedRole);
    } catch {
      setErrorMsg(
        isEn
          ? 'Touch ID / Face ID could not be completed in this context. Please type your PIN code with your device keyboard (default: 0000).'
          : 'Touch ID / Face ID n’a pas pu aboutir dans ce contexte. Veuillez saisir votre Code PIN avec le clavier de votre appareil (par défaut : 0000).'
      );
    } finally {
      setIsBusy(false);
    }
  };

  // Réinitialisation du Code PIN / Mot de passe via le compte Gmail de l'utilisateur ou du Super Admin
  const handleResetViaGmailPopup = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      setIsBusy(true);
      googleProvider.setCustomParameters({
        login_hint: accountEmail,
        prompt: 'select_account'
      });
      const res = await signInWithPopup(auth, googleProvider);
      const signedEmail = (res.user?.email || '').trim().toLowerCase();

      if (signedEmail !== accountEmail.trim().toLowerCase()) {
        setErrorMsg(
          isEn
            ? `Verification failed: please authenticate with your Gmail account (${accountEmail}).`
            : `Vérification refusée : veuillez vous authentifier avec votre compte Gmail (${accountEmail}).`
        );
        return;
      }

      const mapped = mapFirebaseSdkUser(res.user);

      if (newPinAfterReset.trim().length >= 4) {
        await updateAccountPin(newPinAfterReset.trim(), mapped);
        setSuccessMsg(
          isEn
            ? 'Gmail identity verified! Your new PIN code is now active.'
            : 'Identité Gmail vérifiée ! Votre nouveau code PIN est désormais actif.'
        );
      } else {
        await resetAccountPinToDefault(mapped);
        setSuccessMsg(
          isEn
            ? 'Gmail identity verified! Your PIN code has been reset to default "0000".'
            : 'Identité Gmail vérifiée ! Votre code PIN a été réinitialisé à la valeur par défaut « 0000 ».'
        );
      }

      setTimeout(() => {
        onAuthenticatedSuccess(
          mapped,
          isSuperAdminEmail(mapped.email) ? 'super_admin' : 'user'
        );
      }, 800);
    } catch (err: any) {
      setErrorMsg(
        err?.message ||
          (isEn
            ? 'Error verifying Gmail account.'
            : 'Erreur lors de la vérification du compte Gmail.')
      );
    } finally {
      setIsBusy(false);
    }
  };

  // Envoi d'un email officiel Firebase de réinitialisation sur le compte Gmail
  const handleSendFirebaseResetEmail = async () => {
    if (!accountEmail) return;
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      setIsBusy(true);
      await sendPasswordResetEmail(auth, accountEmail);
      setSuccessMsg(
        isEn
          ? `A password reset link has been sent to ${accountEmail}.`
          : `Un email officiel de réinitialisation a été envoyé à ${accountEmail}.`
      );
    } catch {
      setErrorMsg(
        isEn
          ? `Your account (${accountEmail}) is authenticated via Google Sign-In. Click "Verify with my Gmail account & Reset PIN" above for immediate reset.`
          : `Votre compte (${accountEmail}) utilise Google Sign-In. Cliquez sur le bouton « Vérifier avec mon compte Gmail & Réinitialiser » ci-dessus pour réinitialiser immédiatement votre code PIN.`
      );
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-3 sm:p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label={
        isEn
          ? 'faab gar PIN Code & Biometric Security'
          : 'Sécurité Code PIN & Biométrie faab gar'
      }
    >
      <div className="relative w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 border-2 border-[#fdba74] shadow-2xl overflow-hidden text-slate-900 dark:text-white my-auto">
        {/* EN-TÊTE DU POPUP DE SÉCURITÉ */}
        <div className="bg-gradient-to-r from-[#c2410c] via-[#9a3412] to-[#c2410c] px-5 py-4 text-white border-b-2 border-[#fdba74] flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-[#fdba74]/20 border border-[#fdba74] flex items-center justify-center shrink-0">
              {step === 'device_locked' ? (
                <Lock className="w-5 h-5 text-[#fdba74]" />
              ) : isSuperAdmin ? (
                <ShieldCheck className="w-5 h-5 text-amber-300" />
              ) : (
                <UserIcon className="w-5 h-5 text-[#fdba74]" />
              )}
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-black uppercase tracking-wider text-white truncate">
                {step === 'device_locked'
                  ? isEn
                    ? 'faab gar — Device Locked'
                    : 'faab gar — Appareil Verrouillé'
                  : step === 'forgot_pin_gmail'
                  ? isEn
                    ? 'Reset PIN via Gmail Account'
                    : 'Réinitialisation par Compte Gmail'
                  : isSuperAdmin
                  ? isEn
                    ? 'Super Administrator Access — PIN Code'
                    : 'Accès Super Administrateur — Code PIN'
                  : isEn
                  ? 'User Access — PIN Code'
                  : 'Accès Utilisateur — Code PIN'}
              </h2>
              <p className="text-[11px] font-semibold text-[#fdba74] truncate">
                {isSuperAdmin
                  ? isEn
                    ? 'Exclusive Super Admin Account Recognized'
                    : 'Compte reconnu : Super Administrateur Exclusif'
                  : isEn
                  ? 'Standard User Account Recognized'
                  : 'Compte reconnu : Utilisateur Standard'}
              </p>
            </div>
          </div>
        </div>

        {/* CORPS DU POPUP */}
        <div className="p-5 sm:p-6 space-y-4">
          {/* BADGE DU COMPTE GOOGLE AUTHENTIFIÉ ET DE SON RÔLE EXCLUSIF */}
          <div className="p-3.5 rounded-2xl bg-orange-50 dark:bg-orange-950/60 border border-[#fdba74]/60 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              {currentUser.photoURL ? (
                <img
                  src={currentUser.photoURL}
                  alt={currentUser.displayName || 'User'}
                  className="w-9 h-9 rounded-full border-2 border-[#ea580c] object-cover shrink-0"
                />
              ) : (
                <div className="w-9 h-9 rounded-full bg-[#c2410c] text-[#fdba74] flex items-center justify-center font-black text-xs shrink-0">
                  {(accountEmail || 'U').charAt(0).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                      isSuperAdmin
                        ? 'bg-amber-400 text-slate-950'
                        : 'bg-[#c2410c] text-[#fdba74]'
                    }`}
                  >
                    {isSuperAdmin
                      ? isEn
                        ? 'Super Administrator'
                        : 'Super Administrateur'
                      : isEn
                      ? 'User'
                      : 'Utilisateur'}
                  </span>
                </div>
                <div className="text-xs font-extrabold text-slate-800 dark:text-white truncate mt-0.5">
                  {accountEmail}
                </div>
              </div>
            </div>
          </div>

          {errorMsg && (
            <div className="p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-700 text-rose-800 dark:text-rose-200 text-xs font-bold flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-200 text-xs font-bold flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* SAISIE DU CODE PIN AU CLAVIER DE L'APPAREIL (AUCUN BOUTON DE CHIFFRE À L'ÉCRAN) + TOUCH ID / FACE ID */}
          {(step === 'pin_and_biometric' || step === 'device_locked') && (
            <form onSubmit={handleVerifyPinSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="account-pin-keyboard-input"
                  className="block text-xs font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-200 mb-1.5"
                >
                  {isEn
                    ? 'Enter your PIN Code using your device keyboard (default "0000"):'
                    : 'Saisissez votre Code PIN avec le clavier de votre appareil (par défaut « 0000 ») :'}
                </label>
                <div className="relative flex items-center">
                  <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5" />
                  <input
                    id="account-pin-keyboard-input"
                    type={showPin ? 'text' : 'password'}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    autoFocus
                    maxLength={12}
                    value={pinInput}
                    onChange={e => {
                      setPinInput(e.target.value);
                      setErrorMsg(null);
                    }}
                    placeholder={DEFAULT_SUPER_ADMIN_PIN}
                    className="w-full pl-10 pr-12 py-3 rounded-2xl border-2 border-[#ea580c] bg-slate-50 dark:bg-slate-800 text-center text-lg font-black tracking-[0.35em] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#fdba74]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPin(v => !v)}
                    className="absolute right-3 p-1.5 rounded-lg text-slate-500 hover:text-slate-800 dark:hover:text-white cursor-pointer"
                    aria-label={
                      showPin
                        ? isEn
                          ? 'Hide PIN'
                          : 'Masquer le code PIN'
                        : isEn
                        ? 'Show PIN'
                        : 'Afficher le code PIN'
                    }
                  >
                    {showPin ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* BOUTON DE VALIDATION DU CODE PIN */}
              <button
                type="submit"
                disabled={isBusy}
                onClick={handleVerifyPinSubmit}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-2xl bg-[#c2410c] hover:bg-[#9a3412] disabled:opacity-50 text-white border-2 border-[#fdba74] text-xs sm:text-sm font-black uppercase tracking-wider shadow-lg transition-all cursor-pointer"
              >
                <Unlock className="w-4 h-4 text-[#fdba74]" />
                <span>
                  {isBusy
                    ? isEn
                      ? 'Verifying...'
                      : 'Vérification en cours...'
                    : isEn
                    ? 'Validate PIN & Unlock'
                    : 'Valider le Code PIN & Accéder'}
                </span>
              </button>

              {/* BOUTON DÉVERROUILLAGE BIOMÉTRIQUE : TOUCH ID / FACE ID (ORDINATEUR, TABLETTE, MOBILE) */}
              {biometricsAvailable && (
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={handleBiometricUnlock}
                  className="w-full flex items-center justify-center gap-2.5 py-3 px-4 rounded-2xl bg-emerald-700 hover:bg-emerald-600 text-white border-2 border-emerald-300 text-xs sm:text-sm font-black uppercase tracking-wider shadow-md transition-all cursor-pointer"
                >
                  <Fingerprint className="w-4 h-4 shrink-0" />
                  <ScanFace className="w-4 h-4 shrink-0" />
                  <span>
                    {isEn
                      ? 'Unlock with Touch ID / Face ID'
                      : 'Déverrouiller avec Touch ID / Face ID'}
                  </span>
                </button>
              )}

              {/* LIENS BAS DE POPUP : RÉINITIALISATION GMAIL + DÉCONNEXION GOOGLE */}
              <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setErrorMsg(null);
                    setSuccessMsg(null);
                    setStep('forgot_pin_gmail');
                  }}
                  className="font-extrabold text-[#ea580c] dark:text-[#fdba74] hover:underline cursor-pointer flex items-center gap-1"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>
                    {isEn
                      ? 'Forgot PIN / Password? Reset via Gmail'
                      : 'Code PIN oublié ? Réinitialiser via Gmail'}
                  </span>
                </button>

                {onSignOut && (
                  <button
                    type="button"
                    onClick={onSignOut}
                    className="font-extrabold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer flex items-center gap-1"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>{isEn ? 'Sign Out' : 'Se déconnecter'}</span>
                  </button>
                )}
              </div>
            </form>
          )}

          {/* RÉINITIALISATION DU CODE PIN / MOT DE PASSE PAR COMPTE GMAIL */}
          {step === 'forgot_pin_gmail' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-700 text-xs text-amber-900 dark:text-amber-200 space-y-1">
                <div className="font-black uppercase tracking-wider">
                  {isEn
                    ? 'Account Recovery via Gmail'
                    : 'Réinitialisation sécurisée via votre compte Gmail'}
                </div>
                <p className="font-medium leading-relaxed">
                  {isEn
                    ? `Authenticate with your Gmail account (${accountEmail}) to immediately reset your PIN code to "0000" or set a new PIN.`
                    : `Authentifiez-vous avec votre compte Gmail (${accountEmail}) pour réinitialiser immédiatement votre Code PIN à « 0000 » ou définir un nouveau code.`}
                </p>
              </div>

              <div>
                <label
                  htmlFor="new-pin-reset-input"
                  className="block text-xs font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-200 mb-1.5"
                >
                  {isEn
                    ? 'Optional — New PIN code (leave blank to reset to "0000"):'
                    : 'Optionnel — Nouveau Code PIN (laisser vide pour remettre « 0000 ») :'}
                </label>
                <input
                  id="new-pin-reset-input"
                  type="password"
                  inputMode="numeric"
                  maxLength={12}
                  value={newPinAfterReset}
                  onChange={e => setNewPinAfterReset(e.target.value)}
                  placeholder={DEFAULT_SUPER_ADMIN_PIN}
                  className="w-full px-4 py-2.5 rounded-xl border-2 border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-black tracking-widest text-slate-900 dark:text-white"
                />
              </div>

              <button
                type="button"
                disabled={isBusy}
                onClick={handleResetViaGmailPopup}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-2xl bg-[#c2410c] hover:bg-[#9a3412] text-white border-2 border-[#fdba74] text-xs font-black uppercase tracking-wider shadow-lg transition-all cursor-pointer"
              >
                <Mail className="w-4 h-4 text-[#fdba74]" />
                <span>
                  {isBusy
                    ? isEn
                      ? 'Verifying Gmail Account...'
                      : 'Vérification Gmail en cours...'
                    : isEn
                    ? 'Verify with my Gmail Account & Reset PIN'
                    : 'Vérifier avec mon compte Gmail & Réinitialiser'}
                </span>
              </button>

              <button
                type="button"
                disabled={isBusy}
                onClick={handleSendFirebaseResetEmail}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 text-xs font-bold transition-all cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>
                  {isEn
                    ? `Send Password Reset Email to ${accountEmail}`
                    : `Envoyer un lien de réinitialisation par email à ${accountEmail}`}
                </span>
              </button>

              <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex justify-between">
                <button
                  type="button"
                  onClick={() => setStep('pin_and_biometric')}
                  className="text-xs font-bold text-slate-600 dark:text-slate-400 hover:underline cursor-pointer"
                >
                  {isEn
                    ? '← Back to PIN entry'
                    : '← Retour à la saisie du Code PIN'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
