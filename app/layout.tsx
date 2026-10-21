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
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@500;700&display=swap" />
      </head>
      <body>{children}</body>
    </html>
  );
}
