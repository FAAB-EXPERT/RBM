'use client';

import React, { useEffect } from 'react';
import dynamic from 'next/dynamic';

const App = dynamic(() => import('../src/App').then(mod => mod.App), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">
      <div className="flex items-center gap-3 text-xs sm:text-sm font-extrabold uppercase tracking-widest text-[#debdb0]">
        <div className="w-4 h-4 border-2 border-[#debdb0] border-t-transparent rounded-full animate-spin" />
        <span>Initialisation fluide faab gar...</span>
      </div>
    </div>
  )
});

export default function NextHomePage() {
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .catch(() => {
          // Mode local ou aperçu sans SW
        });
    }
  }, []);

  return <App />;
}
