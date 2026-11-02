import React from 'react';
import {
  LogOut,
  User as UserIcon,
  Loader2,
  ShieldCheck,
  Lock
} from 'lucide-react';
import { FirebaseUser, isSuperAdminEmail } from '../firebase';

interface AuthStatusButtonProps {
  user: FirebaseUser | null;
  isAuthLoading: boolean;
  isSigningIn: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
  language: 'FR' | 'EN';
  variant?: 'header' | 'slidebar';
  onLockDevice?: () => void;
}

export const AuthStatusButton: React.FC<AuthStatusButtonProps> = ({
  user,
  isAuthLoading,
  isSigningIn,
  onSignIn,
  onSignOut,
  language,
  variant = 'header',
  onLockDevice
}) => {
  const isEn = language === 'EN';
  const isSuperUser = isSuperAdminEmail(user?.email);

  const GoogleIcon = () => (
    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
      />
    </svg>
  );

  if (isAuthLoading) {
    return (
      <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-orange-950/70 border border-[#fdba74]/40 text-[#fdba74] text-xs font-bold shrink-0">
        <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
        <span className="hidden sm:inline text-[11px]">
          {isEn ? 'Checking...' : 'Vérification...'}
        </span>
      </div>
    );
  }

  // SLIDEBAR VARIANT
  if (variant === 'slidebar') {
    if (!user) {
      return (
        <div className="p-3 bg-orange-950/80 border-b border-orange-800 text-white">
          <button
            type="button"
            onClick={onSignIn}
            disabled={isSigningIn}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-white text-slate-900 hover:bg-orange-50 text-xs font-black shadow-md cursor-pointer transition-all border border-[#fdba74]"
          >
            {isSigningIn ? (
              <Loader2 className="w-4 h-4 animate-spin text-[#ea580c]" />
            ) : (
              <GoogleIcon />
            )}
            <span>{isEn ? 'Sign In with Gmail' : 'Se connecter avec Gmail'}</span>
          </button>
        </div>
      );
    }

    return (
      <div className="p-3 bg-gradient-to-r from-[#c2410c] to-[#9a3412] text-white border-b border-orange-800 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {user.photoURL ? (
              <img
                src={user.photoURL}
                alt={user.displayName || 'User'}
                className="w-8 h-8 rounded-full border-2 border-[#fdba74] shrink-0 object-cover shadow-xs"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-[#fdba74] text-slate-950 flex items-center justify-center font-black shrink-0">
                <UserIcon className="w-4 h-4" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 ring-2 ring-emerald-400/40 animate-pulse shrink-0" />
                <span className="text-[10px] font-black uppercase tracking-wider text-[#fdba74]">
                  {isSuperUser
                    ? isEn
                      ? 'Super Admin'
                      : 'Super Administrateur'
                    : isEn
                    ? 'User'
                    : 'Utilisateur'}
                </span>
              </div>
              <div className="text-xs font-black truncate text-white leading-tight">
                {user.displayName || user.email?.split('@')[0]}
              </div>
              <div className="text-[10px] text-orange-200 truncate leading-tight">
                {user.email}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {onLockDevice && (
              <button
                type="button"
                onClick={onLockDevice}
                title={
                  isEn
                    ? 'Lock Device (Touch ID / Face ID / PIN)'
                    : 'Verrouiller l’appareil (Touch ID / Face ID / PIN)'
                }
                className="p-1.5 rounded-lg bg-orange-950 hover:bg-amber-500 text-[#fdba74] hover:text-slate-950 border border-[#fdba74]/50 cursor-pointer transition-all"
              >
                <Lock className="w-3.5 h-3.5" />
              </button>
            )}

            <button
              type="button"
              onClick={onSignOut}
              title={isEn ? 'Sign Out' : 'Se déconnecter'}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-600 text-rose-200 hover:text-white border border-rose-400/40 text-[11px] font-bold cursor-pointer transition-all shrink-0"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">
                {isEn ? 'Sign Out' : 'Déconnexion'}
              </span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // HEADER VARIANT
  if (!user) {
    return (
      <button
        type="button"
        onClick={onSignIn}
        disabled={isSigningIn}
        title={
          isEn
            ? 'Sign in with your Google / Gmail account'
            : 'Se connecter avec votre compte Google / Gmail'
        }
        aria-label={isEn ? 'Sign in' : 'Se connecter'}
        className="inline-flex items-center gap-2 px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl bg-white hover:bg-orange-50 text-slate-900 border border-[#fdba74] text-[11px] sm:text-xs font-black shadow-md cursor-pointer transition-all shrink-0 hover:shadow-lg active:scale-95"
      >
        {isSigningIn ? (
          <Loader2 className="w-4 h-4 animate-spin text-[#ea580c]" />
        ) : (
          <GoogleIcon />
        )}
        <span className="leading-none">{isEn ? 'Sign In' : 'Se connecter'}</span>
      </button>
    );
  }

  return (
    <div className="relative inline-flex items-center gap-1.5 sm:gap-2 shrink-0">
      {/* Badge Rôle Exclusif (Super Administrateur vs Utilisateur) */}
      <span
        className={`hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider border ${
          isSuperUser
            ? 'bg-amber-400 text-slate-950 border-white'
            : 'bg-orange-900/90 text-[#fdba74] border-[#fdba74]/50'
        }`}
      >
        {isSuperUser ? (
          <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
        ) : (
          <UserIcon className="w-3.5 h-3.5 shrink-0" />
        )}
        <span>
          {isSuperUser
            ? isEn
              ? 'Super Admin'
              : 'Super Admin'
            : isEn
            ? 'User'
            : 'Utilisateur'}
        </span>
      </span>

      {/* Bouton Verrouiller Appareil (Touch ID / Face ID / PIN) pour Super Admin ET pour Utilisateur */}
      {onLockDevice && (
        <button
          type="button"
          onClick={onLockDevice}
          title={
            isEn
              ? 'Lock Device (Unlock with Touch ID / Face ID or PIN)'
              : 'Verrouiller l’appareil (Déverrouillage Touch ID / Face ID ou Code PIN)'
          }
          className="inline-flex items-center justify-center p-1.5 sm:p-2 rounded-xl bg-orange-950/90 hover:bg-amber-500 text-[#fdba74] hover:text-slate-950 border border-[#fdba74]/50 transition-all cursor-pointer shrink-0"
        >
          <Lock className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
        </button>
      )}

      {/* Badge Connecté */}
      <div
        title={`${user.displayName || ''} (${user.email || ''})`}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-xl bg-orange-950/90 border border-[#fdba74]/60 text-white shadow-xs max-w-[150px] sm:max-w-[200px]"
      >
        {user.photoURL ? (
          <img
            src={user.photoURL}
            alt={user.displayName || 'User'}
            className="w-5 h-5 sm:w-6 sm:h-6 rounded-full border border-[#fdba74] shrink-0 object-cover"
          />
        ) : (
          <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-[#fdba74] text-slate-950 flex items-center justify-center font-bold text-[10px] shrink-0">
            <UserIcon className="w-3.5 h-3.5" />
          </div>
        )}
        <div className="min-w-0 flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-400 ring-2 ring-emerald-400/40 animate-pulse shrink-0" />
          <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-[#fdba74] truncate">
            {isEn ? 'Connected' : 'Connecté'}
          </span>
          <span className="hidden md:inline text-[11px] text-orange-200 truncate max-w-[85px]">
            {user.displayName?.split(' ')[0] || user.email?.split('@')[0]}
          </span>
        </div>
      </div>

      {/* Bouton direct Se déconnecter */}
      <button
        type="button"
        onClick={onSignOut}
        title={
          isEn ? `Sign Out (${user.email})` : `Se déconnecter (${user.email})`
        }
        aria-label={isEn ? 'Sign Out' : 'Se déconnecter'}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 sm:px-3 sm:py-1.5 rounded-xl bg-orange-950/80 hover:bg-rose-600 text-orange-200 hover:text-white border border-[#fdba74]/50 hover:border-rose-400 text-[10px] sm:text-xs font-extrabold transition-all cursor-pointer shrink-0 shadow-xs"
      >
        <LogOut className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
        <span className="hidden sm:inline">
          {isEn ? 'Sign Out' : 'Se déconnecter'}
        </span>
      </button>
    </div>
  );
};
