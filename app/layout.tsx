import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.APP_URL && process.env.APP_URL.startsWith('http')
      ? process.env.APP_URL
      : 'http://localhost:3000'
  ),
  title: 'faab gar',
  description:
    'faab gar : Plateforme Universelle & Multi-Projets de Gestion Axée sur les Résultats (GAR), Arbres à Problèmes & Solutions, Cadre Logique (CLAR), Ordonnancement PERT/CPM, Gantt, Kanban, RACI & Génération Documentaire.',
  applicationName: 'faab gar',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    title: 'faab gar',
    statusBarStyle: 'black-translucent'
  },
  openGraph: {
    title: 'faab gar',
    description:
      'Plateforme Universelle de Gestion Axée sur les Résultats (GAR), Arbres à Problèmes & Solutions, Cadre de Rendement, CMR, CLAR, Réseau PERT/CPM, Gantt, Kanban, RACI & Génération Documentaire.',
    type: 'website',
    images: ['/faab-gar-logo.svg', '/assets/aistudio/logo_faab_gar_a9b4b287.png?v=3']
  },
  twitter: {
    card: 'summary_large_image',
    title: 'faab gar',
    description:
      'Plateforme Universelle de Gestion Axée sur les Résultats (GAR), Réseau PERT/CPM, Gantt, Kanban, RACI & Génération Documentaire.',
    images: ['/faab-gar-logo.svg', '/assets/aistudio/logo_faab_gar_a9b4b287.png?v=3']
  },
  icons: {
    icon: [
      { url: '/faab-gar-logo.svg', type: 'image/svg+xml' },
      { url: '/assets/aistudio/logo_faab_gar_a9b4b287.png?v=3', sizes: '512x512', type: 'image/png' },
      { url: '/pwa-192x192.png?v=3', sizes: '192x192', type: 'image/png' },
      { url: '/favicon.png?v=3', sizes: '64x64', type: 'image/png' }
    ],
    shortcut: ['/faab-gar-logo.svg', '/favicon.png?v=3'],
    apple: [{ url: '/apple-touch-icon.png?v=3', sizes: '180x180', type: 'image/png' }]
  }
};

export const viewport: Viewport = {
  themeColor: '#6e3711',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <head>
        <meta httpEquiv="X-Content-Type-Options" content="nosniff" />
        <meta name="referrer" content="strict-origin-when-cross-origin" />
        <link rel="icon" type="image/svg+xml" href="/faab-gar-logo.svg" />
        <link rel="icon" type="image/png" href="/assets/aistudio/logo_faab_gar_a9b4b287.png?v=3" />
        <link rel="shortcut icon" href="/faab-gar-logo.svg" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png?v=3" />
        <link rel="manifest" href="/manifest.json" />
      </head>
      <body suppressHydrationWarning className="antialiased selection:bg-[#debdb0] selection:text-slate-950">
        {children}
      </body>
    </html>
  );
}
