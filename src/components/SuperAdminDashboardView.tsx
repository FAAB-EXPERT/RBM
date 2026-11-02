import React, { useState, useEffect, useMemo } from 'react';
import {
  ShieldCheck,
  Users,
  TrendingUp,
  Calendar,
  Clock,
  KeyRound,
  Fingerprint,
  ScanFace,
  Lock,
  LogOut,
  Save,
  Search,
  Copy,
  Check,
  Download,
  RefreshCw,
  UserCheck,
  Building2,
  Phone,
  Mail,
  Briefcase,
  ArrowLeftRight
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from 'recharts';
import {
  SuperAdminProfile,
  PlatformUserRecord,
  defaultSuperAdminProfile,
  loadSuperAdminProfile,
  saveSuperAdminProfile,
  subscribeToPlatformUsers,
  updateSuperAdminPin,
  resetSuperAdminPinToDefault,
  registerDeviceBiometrics,
  authenticateWithDeviceBiometrics,
  hasRegisteredBiometricCredential
} from '../services/superAdminService';
import { SUPER_ADMIN_EMAIL, FirebaseUser } from '../firebase';
import { saveProgramFile } from '../services/exportStorage';
import { sanitizeCsvCellForExport } from '../securityUtils';

interface SuperAdminDashboardViewProps {
  currentUser: FirebaseUser;
  language: 'FR' | 'EN';
  onSwitchToUserMode?: () => void;
  onLockDevice: () => void;
  onSignOut: () => void;
  onShowToast: (msg: string) => void;
}

export const SuperAdminDashboardView: React.FC<SuperAdminDashboardViewProps> = ({
  currentUser,
  language,
  onSwitchToUserMode,
  onLockDevice,
  onSignOut,
  onShowToast
}) => {
  const isEn = language === 'EN';

  // Profil du Super Administrateur ("nom", "prenoms", "email", "contact", "fonction", "organisation")
  const [adminProfile, setAdminProfile] = useState<SuperAdminProfile>(
    defaultSuperAdminProfile
  );
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Liste temps réel des utilisateurs enregistrés (Firebase Auth + Firestore)
  const [users, setUsers] = useState<PlatformUserRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedUid, setCopiedUid] = useState<string | null>(null);

  // Gestion du Code PIN et Touch ID / Face ID
  const [newPin, setNewPin] = useState('');
  const [biometricConfigured, setBiometricConfigured] = useState<boolean>(
    hasRegisteredBiometricCredential()
  );

  useEffect(() => {
    loadSuperAdminProfile().then(loaded => {
      setAdminProfile(loaded);
    });
    const unsubscribe = subscribeToPlatformUsers(list => {
      setUsers(list);
    });
    return () => unsubscribe();
  }, []);

  const handleSaveAdminProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingProfile(true);
    try {
      const saved = await saveSuperAdminProfile(adminProfile);
      setAdminProfile(saved);
      onShowToast(
        isEn
          ? 'Super Administrator profile saved successfully!'
          : 'Profil Super Administrateur enregistré avec succès !'
      );
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleUpdatePin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPin.trim().length < 4) {
      onShowToast(
        isEn
          ? 'PIN code must contain at least 4 digits.'
          : 'Le code PIN doit comporter au moins 4 chiffres.'
      );
      return;
    }
    await updateSuperAdminPin(newPin.trim());
    setNewPin('');
    onShowToast(
      isEn
        ? 'Super Admin PIN code updated successfully!'
        : 'Code PIN Super Administrateur mis à jour avec succès !'
    );
  };

  const handleResetPinDefault = async () => {
    await resetSuperAdminPinToDefault();
    onShowToast(
      isEn
        ? 'PIN code reset to default "0000".'
        : 'Code PIN réinitialisé à la valeur par défaut « 0000 ».'
    );
  };

  const handleConfigureTouchIdFaceId = async () => {
    try {
      const ok = await registerDeviceBiometrics(
        SUPER_ADMIN_EMAIL,
        `${adminProfile.nom} ${adminProfile.prenoms}`.trim()
      );
      if (ok) {
        setBiometricConfigured(true);
        onShowToast(
          isEn
            ? 'Touch ID / Face ID activated on this device!'
            : 'Touch ID / Face ID activé avec succès sur cet appareil !'
        );
      }
    } catch {
      onShowToast(
        isEn
          ? 'Biometric enrollment requires a compatible device screen lock (Touch ID / Face ID / Windows Hello).'
          : 'L’activation biométrique requiert un capteur Touch ID / Face ID / Windows Hello actif sur l’appareil.'
      );
    }
  };

  const handleTestBiometricUnlock = async () => {
    try {
      const ok = await authenticateWithDeviceBiometrics();
      if (ok) {
        setBiometricConfigured(true);
        onShowToast(
          isEn
            ? 'Touch ID / Face ID verification succeeded!'
            : 'Vérification Touch ID / Face ID réussie !'
        );
      }
    } catch {
      onShowToast(
        isEn
          ? 'Biometric check cancelled or unavailable.'
          : 'Vérification Touch ID / Face ID annulée ou indisponible.'
      );
    }
  };

  // Formatage lisible des dates Firebase Auth (Date de création & Dernière connexion)
  const formatDateTime = (isoStr: string): string => {
    if (!isoStr) return '—';
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return isoStr;
    return d.toLocaleString(isEn ? 'en-GB' : 'fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Filtrage de la table des utilisateurs enregistrés
  const filteredUsers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      u =>
        (u.identifier || '').toLowerCase().includes(q) ||
        (u.displayName || '').toLowerCase().includes(q) ||
        (u.uid || '').toLowerCase().includes(q) ||
        (u.providers || []).join(' ').toLowerCase().includes(q)
    );
  }, [users, searchQuery]);

  // Calcul des KPIs et des séries temporelles d'évolution des personnes enregistrées
  const dashboardStats = useMemo(() => {
    const now = Date.now();
    const sevenDaysMs = 7 * 24 * 3600 * 1000;
    const thirtyDaysMs = 30 * 24 * 3600 * 1000;

    let newLast30Days = 0;
    let activeLast7Days = 0;
    let googleProviderCount = 0;

    users.forEach(u => {
      const createdMs = new Date(u.createdAt).getTime();
      const lastLoginMs = new Date(u.lastLoginAt).getTime();
      if (!isNaN(createdMs) && now - createdMs <= thirtyDaysMs) {
        newLast30Days++;
      }
      if (!isNaN(lastLoginMs) && now - lastLoginMs <= sevenDaysMs) {
        activeLast7Days++;
      }
      if ((u.providers || []).some(p => p.includes('google'))) {
        googleProviderCount++;
      }
    });

    // Construction de la courbe d'évolution des personnes enregistrées par date de création
    const sortedByCreation = [...users].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

    const bucketMap = new Map<
      string,
      { label: string; nouveaux: number; connexions: number; cumul: number }
    >();

    sortedByCreation.forEach(u => {
      const d = new Date(u.createdAt);
      const key = isNaN(d.getTime())
        ? '2026-01'
        : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
            d.getDate()
          ).padStart(2, '0')}`;
      const label = isNaN(d.getTime())
        ? 'Jan 2026'
        : d.toLocaleDateString(isEn ? 'en-GB' : 'fr-FR', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
          });
      const existing = bucketMap.get(key) || {
        label,
        nouveaux: 0,
        connexions: 0,
        cumul: 0
      };
      existing.nouveaux += 1;
      existing.connexions += Number(u.loginCount) || 1;
      bucketMap.set(key, existing);
    });

    let runningTotal = 0;
    const evolutionSeries = Array.from(bucketMap.entries())
      .sort(([k1], [k2]) => k1.localeCompare(k2))
      .map(([, item]) => {
        runningTotal += item.nouveaux;
        return {
          ...item,
          cumul: runningTotal
        };
      });

    // Si un seul point de date existe, ajouter un point d'origine (0) pour afficher une belle courbe d'évolution
    if (evolutionSeries.length === 1) {
      evolutionSeries.unshift({
        label: isEn ? 'Platform Launch' : 'Lancement',
        nouveaux: 0,
        connexions: 0,
        cumul: 0
      });
    }

    return {
      totalUsers: users.length,
      newLast30Days,
      activeLast7Days,
      googleProviderCount,
      evolutionSeries
    };
  }, [users, isEn]);

  // Export CSV de la table des utilisateurs enregistrés
  const handleExportUsersCsv = async () => {
    const headers = [
      'Identifiant',
      'Nom_Complet',
      'Fournisseurs',
      'Date_ de_creation',
      'Derniere_connexion',
      'ID_utilisateur',
      'Role',
      'Nombre_connexions'
    ];
    const rows = [headers.join(';')];
    filteredUsers.forEach(u => {
      rows.push(
        [
          u.identifier,
          u.displayName,
          (u.providers || ['google.com']).join(', '),
          formatDateTime(u.createdAt),
          formatDateTime(u.lastLoginAt),
          u.uid,
          u.role === 'super_admin' ? 'Super Administrateur' : 'Utilisateur',
          u.loginCount || 1
        ]
          .map(sanitizeCsvCellForExport)
          .join(';')
      );
    });

    const csvContent = '\uFEFF' + rows.join('\r\n');
    const fileName = 'FAAB_PLAN_Utilisateurs_Enregistres_Firebase.csv';
    const res = await saveProgramFile({
      programName: 'Administration Super Admin',
      fileName,
      content: csvContent,
      mimeType: 'text/csv;charset=utf-8;'
    });

    onShowToast(
      isEn
        ? `Registered users exported to ${res.path}`
        : `Liste des utilisateurs exportée dans : ${res.path}`
    );
  };

  return (
    <div className="space-y-6 pb-10">
      {/* BANNIÈRE PRINCIPALE DU SUPER ADMINISTRATEUR */}
      <div className="rounded-3xl bg-gradient-to-r from-[#c2410c] via-[#9a3412] to-[#c2410c] text-white p-5 sm:p-6 border-2 border-[#fdba74] shadow-xl flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex items-start sm:items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-[#fdba74] text-slate-950 flex items-center justify-center shrink-0 shadow-lg font-black">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-0.5 rounded-full bg-amber-400 text-slate-950 text-[10px] font-black uppercase tracking-widest mb-1">
              <span>
                {isEn
                  ? 'SUPER ADMINISTRATOR CONSOLE'
                  : 'CONSOLE SUPER ADMINISTRATEUR faab gar'}
              </span>
            </div>
            <h2 className="text-lg sm:text-2xl font-black tracking-tight text-white">
              {adminProfile.nom} {adminProfile.prenoms}
            </h2>
            <p className="text-xs sm:text-sm text-[#fdba74] font-semibold">
              {adminProfile.fonction} • {adminProfile.organisation} (
              {SUPER_ADMIN_EMAIL})
            </p>
          </div>
        </div>

        {/* ACTIONS RAPIDES : VERROUILLER APPAREIL (TOUCH ID / FACE ID / PIN) & DÉCONNEXION */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onLockDevice}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 border border-amber-200 text-xs font-black shadow-md transition-all cursor-pointer"
          >
            <Lock className="w-4 h-4 shrink-0" />
            <span>
              {isEn
                ? 'Lock Device (PIN / Touch ID / Face ID)'
                : 'Verrouiller l’appareil (PIN / Touch ID / Face ID)'}
            </span>
          </button>

          <button
            type="button"
            onClick={onSignOut}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white border border-rose-300 text-xs font-black shadow-md transition-all cursor-pointer"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            <span>{isEn ? 'Sign Out' : 'Se déconnecter'}</span>
          </button>
        </div>
      </div>

      {/* SECTION 1 : FORMULAIRE DE PROFIL DU SUPER ADMIN + SÉCURITÉ CODE PIN & TOUCH ID / FACE ID */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* CHAMPS DE SAISIE DU PROFIL SUPER ADMIN : NOM, PRÉNOMS, EMAIL, CONTACT, FONCTION, ORGANISATION */}
        <form
          onSubmit={handleSaveAdminProfile}
          className="lg:col-span-2 rounded-3xl bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 p-5 sm:p-6 shadow-md space-y-4"
        >
          <div className="flex items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
            <div className="flex items-center gap-2.5">
              <UserCheck className="w-5 h-5 text-[#ea580c] dark:text-[#fdba74]" />
              <h3 className="text-sm sm:text-base font-black uppercase tracking-wider text-slate-900 dark:text-white">
                {isEn
                  ? 'Super Administrator Profile'
                  : 'Profil du Super Administrateur'}
              </h3>
            </div>
            <button
              type="submit"
              disabled={isSavingProfile}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#c2410c] hover:bg-[#9a3412] text-white border border-[#fdba74] text-xs font-black shadow-sm transition-all cursor-pointer"
            >
              <Save className="w-3.5 h-3.5 text-[#fdba74]" />
              <span>
                {isSavingProfile
                  ? isEn
                    ? 'Saving...'
                    : 'Enregistrement...'
                  : isEn
                  ? 'Save Profile'
                  : 'Enregistrer le Profil'}
              </span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* NOM */}
            <div>
              <label className="block text-[11px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
                {isEn ? 'Last Name (Nom)' : 'Nom'}
              </label>
              <input
                type="text"
                value={adminProfile.nom}
                onChange={e =>
                  setAdminProfile(prev => ({ ...prev, nom: e.target.value }))
                }
                placeholder="KOFFIE"
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs sm:text-sm font-bold text-slate-900 dark:text-white"
              />
            </div>

            {/* PRÉNOMS */}
            <div>
              <label className="block text-[11px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
                {isEn ? 'First Names (Prénoms)' : 'Prénoms'}
              </label>
              <input
                type="text"
                value={adminProfile.prenoms}
                onChange={e =>
                  setAdminProfile(prev => ({
                    ...prev,
                    prenoms: e.target.value
                  }))
                }
                placeholder="Fabien Michael"
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs sm:text-sm font-bold text-slate-900 dark:text-white"
              />
            </div>

            {/* EMAIL (OFFICIEL SUPER ADMIN) */}
            <div>
              <label className="block text-[11px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
                <span className="inline-flex items-center gap-1">
                  <Mail className="w-3.5 h-3.5 text-[#ea580c]" />
                  <span>Email Super Admin</span>
                </span>
              </label>
              <input
                type="email"
                value={adminProfile.email}
                readOnly
                className="w-full px-3.5 py-2 rounded-xl border border-orange-300 dark:border-orange-800 bg-orange-50/70 dark:bg-orange-950/40 text-xs sm:text-sm font-black text-[#c2410c] dark:text-[#fdba74]"
              />
            </div>

            {/* CONTACT */}
            <div>
              <label className="block text-[11px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
                <span className="inline-flex items-center gap-1">
                  <Phone className="w-3.5 h-3.5 text-[#ea580c]" />
                  <span>{isEn ? 'Phone / Contact' : 'Contact'}</span>
                </span>
              </label>
              <input
                type="text"
                value={adminProfile.contact}
                onChange={e =>
                  setAdminProfile(prev => ({
                    ...prev,
                    contact: e.target.value
                  }))
                }
                placeholder="00225 0748082739"
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs sm:text-sm font-bold text-slate-900 dark:text-white"
              />
            </div>

            {/* FONCTION */}
            <div>
              <label className="block text-[11px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
                <span className="inline-flex items-center gap-1">
                  <Briefcase className="w-3.5 h-3.5 text-[#ea580c]" />
                  <span>{isEn ? 'Role / Title (Fonction)' : 'Fonction'}</span>
                </span>
              </label>
              <input
                type="text"
                value={adminProfile.fonction}
                onChange={e =>
                  setAdminProfile(prev => ({
                    ...prev,
                    fonction: e.target.value
                  }))
                }
                placeholder="Super Administrateur & Architecte Principal"
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs sm:text-sm font-bold text-slate-900 dark:text-white"
              />
            </div>

            {/* ORGANISATION */}
            <div>
              <label className="block text-[11px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
                <span className="inline-flex items-center gap-1">
                  <Building2 className="w-3.5 h-3.5 text-[#ea580c]" />
                  <span>
                    {isEn ? 'Organization (Organisation)' : 'Organisation'}
                  </span>
                </span>
              </label>
              <input
                type="text"
                value={adminProfile.organisation}
                onChange={e =>
                  setAdminProfile(prev => ({
                    ...prev,
                    organisation: e.target.value
                  }))
                }
                placeholder="faab gar — Direction Générale"
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs sm:text-sm font-bold text-slate-900 dark:text-white"
              />
            </div>
          </div>
        </form>

        {/* PANNEAU CODE PIN (DÉFAUT "0000") & BIOMÉTRIE TOUCH ID / FACE ID */}
        <div className="rounded-3xl bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 p-5 sm:p-6 shadow-md space-y-4">
          <div className="flex items-center gap-2.5 border-b border-slate-200 dark:border-slate-800 pb-3">
            <KeyRound className="w-5 h-5 text-amber-500" />
            <h3 className="text-sm sm:text-base font-black uppercase tracking-wider text-slate-900 dark:text-white">
              {isEn
                ? 'PIN Code & Touch ID / Face ID'
                : 'Code PIN & Touch ID / Face ID'}
            </h3>
          </div>

          <form onSubmit={handleUpdatePin} className="space-y-2.5">
            <label className="block text-[11px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-300">
              {isEn
                ? 'Change Security PIN (Default: "0000")'
                : 'Modifier le Code PIN (Par défaut : « 0000 »)'}
            </label>
            <div className="flex items-center gap-2">
              <input
                type="password"
                inputMode="numeric"
                maxLength={12}
                value={newPin}
                onChange={e => setNewPin(e.target.value)}
                placeholder="0000"
                className="flex-1 px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-black tracking-widest text-slate-900 dark:text-white"
              />
              <button
                type="submit"
                className="px-3.5 py-2 rounded-xl bg-[#c2410c] hover:bg-[#9a3412] text-white text-xs font-black cursor-pointer shrink-0"
              >
                {isEn ? 'Update PIN' : 'Définir PIN'}
              </button>
            </div>
            <button
              type="button"
              onClick={handleResetPinDefault}
              className="text-[11px] font-extrabold text-[#ea580c] dark:text-[#fdba74] hover:underline cursor-pointer"
            >
              {isEn
                ? 'Reset PIN to default "0000"'
                : 'Réinitialiser le PIN par défaut (« 0000 »)'}
            </button>
          </form>

          <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
            <div className="text-[11px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-300">
              {isEn
                ? 'Device Biometrics (MacBook, iPad, iPhone, Android, PC)'
                : 'Déverrouillage Appareil (Touch ID / Face ID / Empreinte)'}
            </div>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={handleConfigureTouchIdFaceId}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-black shadow-sm transition-all cursor-pointer"
              >
                <Fingerprint className="w-4 h-4 shrink-0" />
                <ScanFace className="w-4 h-4 shrink-0" />
                <span>
                  {biometricConfigured
                    ? isEn
                      ? 'Re-configure Touch ID / Face ID'
                      : 'Reconfigurer Touch ID / Face ID'
                    : isEn
                    ? 'Activate Touch ID / Face ID on this Device'
                    : 'Activer Touch ID / Face ID sur cet appareil'}
                </span>
              </button>
              {biometricConfigured && (
                <button
                  type="button"
                  onClick={handleTestBiometricUnlock}
                  className="w-full py-2 px-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-700 text-xs font-bold cursor-pointer"
                >
                  {isEn
                    ? '✓ Touch ID / Face ID Active — Click to Test'
                    : '✓ Touch ID / Face ID Actif — Tester le déverrouillage'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 2 : TABLEAU DE BORD INDIQUANT L'ÉVOLUTION DES PERSONNES ENREGISTRÉES */}
      <div className="rounded-3xl bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 p-5 sm:p-6 shadow-md space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <TrendingUp className="w-5 h-5 text-[#ea580c] dark:text-[#fdba74]" />
            <div>
              <h3 className="text-sm sm:text-base font-black uppercase tracking-wider text-slate-900 dark:text-white">
                {isEn
                  ? 'Dashboard — Evolution of Registered Users (Firebase Auth)'
                  : 'Tableau de Bord — Évolution des Personnes Enregistrées (Firebase Auth)'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {isEn
                  ? 'Real-time synchronization of account creation dates, sign-ins and identity providers'
                  : 'Suivi dynamique des inscriptions cumulées, nouvelles créations de comptes et connexions'}
              </p>
            </div>
          </div>
        </div>

        {/* CARTES KPI */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="p-4 rounded-2xl bg-orange-50 dark:bg-orange-950/50 border border-orange-200 dark:border-orange-800">
            <div className="text-[11px] font-black uppercase tracking-wider text-[#c2410c] dark:text-[#fdba74]">
              {isEn ? 'Total Registered Users' : 'Utilisateurs Enregistrés'}
            </div>
            <div className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white mt-1">
              {dashboardStats.totalUsers}
            </div>
            <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mt-0.5">
              {isEn ? 'Firebase Auth accounts' : 'Comptes Firebase Auth'}
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800">
            <div className="text-[11px] font-black uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
              {isEn ? 'New Registrations (30d)' : 'Nouveaux Inscrits (30j)'}
            </div>
            <div className="text-2xl sm:text-3xl font-black text-emerald-700 dark:text-emerald-300 mt-1">
              +{dashboardStats.newLast30Days}
            </div>
            <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mt-0.5">
              {isEn ? 'Last 30 days growth' : 'Croissance sur 30 jours'}
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800">
            <div className="text-[11px] font-black uppercase tracking-wider text-indigo-800 dark:text-indigo-300">
              {isEn ? 'Active Connections (7d)' : 'Connexions Actives (7j)'}
            </div>
            <div className="text-2xl sm:text-3xl font-black text-indigo-700 dark:text-indigo-300 mt-1">
              {dashboardStats.activeLast7Days}
            </div>
            <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mt-0.5">
              {isEn ? 'Recent sign-ins' : 'Dernières connexions < 7j'}
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800">
            <div className="text-[11px] font-black uppercase tracking-wider text-amber-900 dark:text-amber-300">
              {isEn ? 'Google / Gmail Provider' : 'Fournisseur Google / Gmail'}
            </div>
            <div className="text-2xl sm:text-3xl font-black text-amber-700 dark:text-amber-300 mt-1">
              {dashboardStats.googleProviderCount} / {dashboardStats.totalUsers}
            </div>
            <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mt-0.5">
              google.com (OAuth 2.0)
            </div>
          </div>
        </div>

        {/* GRAPHIQUES D'ÉVOLUTION DES PERSONNES ENREGISTRÉES */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2">
          {/* Courbe d'évolution cumulée */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-200 mb-3">
              {isEn
                ? 'Cumulative Evolution of Registered Users'
                : 'Courbe d’Évolution Cumulée des Personnes Enregistrées'}
            </h4>
            <div className="h-60 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dashboardStats.evolutionSeries}>
                  <defs>
                    <linearGradient id="colorCumul" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ea580c" stopOpacity={0.65} />
                      <stop offset="95%" stopColor="#ea580c" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Area
                    type="monotone"
                    dataKey="cumul"
                    name={
                      isEn ? 'Total Registered Users' : 'Total Inscrits Cumulés'
                    }
                    stroke="#ea580c"
                    strokeWidth={3}
                    fillOpacity={1}
                    fill="url(#colorCumul)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Histogramme des nouvelles inscriptions et connexions */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-200 mb-3">
              {isEn
                ? 'New Registrations & Sign-In Activity by Date'
                : 'Nouvelles Inscriptions & Volume de Connexions par Date'}
            </h4>
            <div className="h-60 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dashboardStats.evolutionSeries}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Bar
                    dataKey="nouveaux"
                    name={isEn ? 'New Users' : 'Nouveaux Inscrits'}
                    fill="#10b981"
                    radius={[6, 6, 0, 0]}
                  />
                  <Bar
                    dataKey="connexions"
                    name={isEn ? 'Sign-Ins' : 'Connexions'}
                    fill="#c2410c"
                    radius={[6, 6, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 3 : TABLEAU DES UTILISATEURS ENREGISTRÉS (IDENTIFIANT | FOURNISSEURS | DATE DE CRÉATION | DERNIÈRE CONNEXION | ID UTILISATEUR) */}
      <div className="rounded-3xl bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 p-5 sm:p-6 shadow-md space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
          <div className="flex items-center gap-2.5">
            <Users className="w-5 h-5 text-[#ea580c] dark:text-[#fdba74]" />
            <div>
              <h3 className="text-sm sm:text-base font-black uppercase tracking-wider text-slate-900 dark:text-white">
                {isEn
                  ? 'Registered Platform Users (Firebase Authentication)'
                  : 'Liste des Utilisateurs Enregistrés sur la Plateforme (Firebase Authentication)'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {isEn
                  ? 'Columns: Identifier • Providers • Creation Date • Last Sign-In • User ID'
                  : 'Colonnes : Identifiant • Fournisseurs • Date de création • Dernière connexion • ID utilisateur'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder={
                  isEn
                    ? 'Search identifier, UID, provider...'
                    : 'Rechercher identifiant, UID, fournisseur...'
                }
                className="pl-9 pr-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-white w-60 sm:w-72"
              />
            </div>

            <button
              type="button"
              onClick={handleExportUsersCsv}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-black shadow-sm transition-all cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isEn ? 'Export CSV' : 'Exporter CSV'}</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#c2410c] text-white text-[11px] font-black uppercase tracking-wider">
                <th className="py-3 px-4">
                  {isEn ? 'Identifier (Identifiant)' : 'Identifiant'}
                </th>
                <th className="py-3 px-4">
                  {isEn ? 'Providers (Fournisseurs)' : 'Fournisseurs'}
                </th>
                <th className="py-3 px-4">
                  {isEn ? 'Creation Date' : 'Date de création'}
                </th>
                <th className="py-3 px-4">
                  {isEn ? 'Last Sign-In' : 'Dernière connexion'}
                </th>
                <th className="py-3 px-4">
                  {isEn ? 'User ID (ID utilisateur)' : 'ID utilisateur'}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
              {filteredUsers.map(u => {
                const isSuper =
                  u.role === 'super_admin' ||
                  u.identifier.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase();
                return (
                  <tr
                    key={u.uid}
                    className="hover:bg-orange-50/60 dark:hover:bg-slate-800/60 transition-colors"
                  >
                    {/* IDENTIFIANT */}
                    <td className="py-3 px-4 font-bold text-slate-900 dark:text-white">
                      <div className="flex items-center gap-2.5">
                        {u.photoURL ? (
                          <img
                            src={u.photoURL}
                            alt={u.displayName}
                            className="w-8 h-8 rounded-full border border-[#ea580c] object-cover shrink-0"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-[#c2410c] text-[#fdba74] flex items-center justify-center font-black text-xs shrink-0">
                            {(u.identifier || 'U').charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-black text-slate-900 dark:text-white">
                              {u.identifier}
                            </span>
                            {isSuper && (
                              <span className="px-2 py-0.5 rounded-full bg-amber-400 text-slate-950 text-[10px] font-black uppercase">
                                Super Admin
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">
                            {u.displayName}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* FOURNISSEURS */}
                    <td className="py-3 px-4">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {(u.providers && u.providers.length > 0
                          ? u.providers
                          : ['google.com']
                        ).map(prov => (
                          <span
                            key={prov}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-orange-100 dark:bg-orange-950 text-[#c2410c] dark:text-[#fdba74] border border-orange-300 dark:border-orange-800 text-[11px] font-extrabold"
                          >
                            <span>
                              {prov === 'google.com'
                                ? 'Google / Gmail (google.com)'
                                : prov}
                            </span>
                          </span>
                        ))}
                      </div>
                    </td>

                    {/* DATE DE CRÉATION */}
                    <td className="py-3 px-4 font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{formatDateTime(u.createdAt)}</span>
                      </div>
                    </td>

                    {/* DERNIÈRE CONNEXION */}
                    <td className="py-3 px-4 font-semibold text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 shrink-0" />
                        <span>{formatDateTime(u.lastLoginAt)}</span>
                      </div>
                    </td>

                    {/* ID UTILISATEUR */}
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-700 dark:text-slate-300">
                      <div className="inline-flex items-center gap-2 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700">
                        <span className="truncate max-w-[180px]" title={u.uid}>
                          {u.uid}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard?.writeText(u.uid);
                            setCopiedUid(u.uid);
                            setTimeout(() => setCopiedUid(null), 1800);
                          }}
                          title={isEn ? 'Copy User ID' : 'Copier l’ID utilisateur'}
                          className="text-slate-500 hover:text-[#ea580c] dark:hover:text-[#fdba74] cursor-pointer"
                        >
                          {copiedUid === u.uid ? (
                            <Check className="w-3.5 h-3.5 text-emerald-500" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
