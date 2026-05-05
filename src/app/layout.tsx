import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'RoutePlan - Monthly Route Planner',
  description: 'Plan your monthly visits from a list of places',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
