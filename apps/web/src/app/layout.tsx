import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Amsterdam Pollution Twin Copilot',
  description: 'Validated, auditable Urban Pollution Digital Twin for Amsterdam',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
