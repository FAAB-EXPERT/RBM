import React from 'react';
import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 text-white p-6 text-center">
      <h1 className="text-2xl font-black text-[#fdba74] uppercase tracking-wider mb-2">
        faab gar — Page introuvable (404)
      </h1>
      <p className="text-xs text-slate-300 mb-4">
        La ressource demandée n&apos;existe pas ou a été déplacée.
      </p>
      <Link
        href="/"
        className="px-4 py-2 rounded-xl bg-[#c2410c] hover:bg-[#ea580c] text-white text-xs font-black uppercase tracking-wider border border-[#fdba74]"
      >
        Retour à l&apos;application faab gar
      </Link>
    </div>
  );
}
