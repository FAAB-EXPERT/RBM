import React, { useState } from 'react';
import { ShieldAlert, Copy, Check, ExternalLink, X, RefreshCw, KeyRound, AlertTriangle } from 'lucide-react';

interface FirebaseAuthHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRetryGooglePopup: () => void;
  onContinueLocalSession?: () => void;
  errorCode: string;
  errorMessage?: string;
  language: 'FR' | 'EN';
}

export const FirebaseAuthHelpModal: React.FC<FirebaseAuthHelpModalProps> = ({
  isOpen,
  onClose,
  onRetryGooglePopup,
  onContinueLocalSession,
  errorCode,
  errorMessage,
  language
}) => {
  const [copied, setCopied] = useState(false);
  if (!isOpen) return null;

  const currentDomain = typeof window !== 'undefined' ? window.location.hostname : '';
  const isEn = language === 'EN';

  const handleCopy = () => {
    if (navigator?.clipboard && currentDomain) {
      navigator.clipboard.writeText(currentDomain);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border-2 border-rose-500/80 dark:border-rose-400 overflow-hidden z-10 flex flex-col max-h-[92vh]">
        {/* En-tête */}
        <div className="px-5 py-4 bg-gradient-to-r from-slate-900 via-rose-950 to-slate-900 text-white flex items-center justify-between border-b border-rose-500/30">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-rose-500/20 rounded-xl text-rose-400 border border-rose-500/30">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-black uppercase tracking-wider text-white">
                {isEn ? 'Firebase Authentication Diagnostic' : 'Diagnostic Firebase Authentication'}
              </h3>
              <p className="text-[11px] text-rose-200 font-medium">
                {isEn
                  ? 'Domain authorization required in Firebase Console'
                  : 'Autorisation du domaine requise dans la console Firebase'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/10 hover:bg-rose-600 text-white flex items-center justify-center transition-colors cursor-pointer"
            title={isEn ? 'Close' : 'Fermer'}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Corps */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs text-slate-700 dark:text-slate-200">
          {/* Diagnostic Code Erreur Exact */}
          <div className="p-3.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-rose-800 dark:text-rose-300 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" />
                {isEn ? 'Exact Firebase Error Code :' : 'Code d’erreur Firebase exact :'}
              </span>
              <span className="px-2 py-0.5 rounded font-mono text-[11px] font-black bg-rose-600 text-white">
                {errorCode || 'auth/unauthorized-domain'}
              </span>
            </div>
            {errorMessage && (
              <p className="text-[11px] font-mono text-rose-900 dark:text-rose-200 break-words leading-relaxed pt-1 border-t border-rose-200/60 dark:border-rose-800/60">
                {errorMessage}
              </p>
            )}
          </div>

          {/* Domaine Actuel à Copier en 1 Clic */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5 text-[#ea580c] dark:text-[#fdba74]" />
              {isEn
                ? 'Current domain to add in Firebase Console (1-Click Copy) :'
                : 'Nom exact du domaine actuel à copier (1 Clic) :'}
            </label>
            <div className="flex items-center gap-2 p-2.5 bg-slate-100 dark:bg-slate-800/90 rounded-xl border border-slate-300 dark:border-slate-700 font-mono text-xs">
              <span className="flex-1 truncate font-black text-[#c2410c] dark:text-[#fdba74] select-all">
                {currentDomain}
              </span>
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-lg bg-[#c2410c] hover:bg-[#ea580c] text-white font-black text-[11px] transition-colors cursor-pointer shrink-0 shadow-xs"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? (isEn ? 'Copied!' : 'Copié !') : (isEn ? 'Copy domain' : 'Copier le domaine')}</span>
              </button>
            </div>
          </div>

          {/* Procédure étape par étape */}
          <div className="p-3.5 bg-orange-50 dark:bg-orange-950/40 border border-orange-200 dark:border-orange-800 rounded-xl space-y-2">
            <div className="font-black text-[#c2410c] dark:text-[#fdba74] text-[11px] uppercase tracking-wider">
              {isEn
                ? 'Step-by-step setup in Firebase Console (Project faab-projet) :'
                : 'Procédure dans la Console Firebase (Projet faab-projet) :'}
            </div>
            <ol className="list-decimal list-inside space-y-1.5 text-[11px] text-slate-700 dark:text-slate-300 leading-normal">
              <li>
                {isEn ? 'Open' : 'Ouvrez'}{' '}
                <a
                  href="https://console.firebase.google.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-bold text-[#ea580c] dark:text-[#fdba74] underline"
                >
                  Firebase Console
                  <ExternalLink className="w-3 h-3" />
                </a>{' '}
                &gt; {isEn ? 'project' : 'projet'} <strong>faab-projet</strong>.
              </li>
              <li>
                {isEn ? 'Go to' : 'Rendez-vous dans'}{' '}
                <strong>Authentication</strong> &gt; {isEn ? 'tab' : 'onglet'}{' '}
                <strong>{isEn ? 'Settings' : 'Paramètres'}</strong>.
              </li>
              <li>
                {isEn ? 'Under' : 'Dans la section'}{' '}
                <strong>{isEn ? 'Authorized domains' : 'Domaines autorisés'}</strong>,{' '}
                {isEn ? 'click' : 'cliquez sur'}{' '}
                <strong>« {isEn ? 'Add domain' : 'Ajouter un domaine'} »</strong>.
              </li>
              <li>
                {isEn
                  ? 'Paste the exact domain copied above and click Save.'
                  : 'Collez le nom de domaine copié ci-dessus et cliquez sur « Enregistrer ».'}
              </li>
              <li>
                {isEn
                  ? 'Once saved, click "Retry Google Sign-In" below: the official Google Gmail popup will open immediately.'
                  : 'Une fois enregistré, cliquez sur « Réessayer la connexion Google » ci-dessous : la vraie fenêtre Google (sélection de compte Gmail & mot de passe) s’ouvrira immédiatement.'}
              </li>
            </ol>
          </div>
        </div>

        {/* Pied de page avec Réessayer, Mode Local & Fermer */}
        <div className="px-5 py-3.5 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-2 rounded-xl bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-white text-xs font-black transition-colors cursor-pointer"
          >
            {isEn ? 'Close' : 'Fermer'}
          </button>

          <div className="flex flex-wrap items-center gap-2">
            {onContinueLocalSession && (
              <button
                type="button"
                onClick={onContinueLocalSession}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black transition-all cursor-pointer shadow-sm"
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>
                  {isEn
                    ? 'Open Workspace (Local Session / PIN 0000)'
                    : 'Accéder à l’Espace (Session Locale / PIN 0000)'}
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={onRetryGooglePopup}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#c2410c] hover:bg-[#ea580c] text-white text-xs font-black transition-all cursor-pointer shadow-md hover:shadow-lg"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>{isEn ? 'Retry Google Sign-In' : 'Réessayer la connexion Google'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
