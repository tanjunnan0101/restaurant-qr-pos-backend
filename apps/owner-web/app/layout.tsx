import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Owner Console',
    template: '%s | Owner Console',
  },
  description: 'Restaurant owner and outlet administration console.',
};

export const viewport: Viewport = {
  colorScheme: 'light',
  themeColor: '#f3efe7',
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
