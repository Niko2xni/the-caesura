import type { Metadata } from 'next';
import { Archivo, IBM_Plex_Sans } from 'next/font/google';
import './globals.css';

const archivo = Archivo({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
});

const ibmPlexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-body',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'The Caesura — Back-of-House Inventory',
  description: 'Single-site inventory system for small cafés with batch-level expiry tracking and AI receiving.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${archivo.variable} ${ibmPlexSans.variable}`}>
      <body className="min-h-screen bg-[var(--color-paper)] text-[var(--color-ink)] antialiased font-[family-name:var(--font-body)]">
        {children}
      </body>
    </html>
  );
}

