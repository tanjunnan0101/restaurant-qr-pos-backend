import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Owner Web',
    template: '%s | Owner Web',
  },
  description: 'Owner console for Restaurant QR POS setup and operations.',
};

export const viewport: Viewport = {
  colorScheme: 'light',
  themeColor: '#f7f0e5',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
