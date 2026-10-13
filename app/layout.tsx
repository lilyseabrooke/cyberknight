import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'CYBERKNIGHT',
  description: 'A self-playing cyberpunk sword-and-sorcery roguelite. You are the lab assistant.',
};

export const viewport: Viewport = { themeColor: '#0a0612', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
