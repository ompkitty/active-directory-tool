import type { Metadata } from 'next';
import './globals.css';
import { Sidebar } from '@/components/layout/sidebar';
import { THEME_INIT_SCRIPT } from '@/lib/theme';

export const metadata: Metadata = {
  title: 'Active Directory Tool',
  description: 'Development-only web panel for authorized Active Directory administration over LDAPS.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full bg-muted text-foreground">
        <div className="flex min-h-screen">
          <Sidebar />
          <main className="min-w-0 flex-1">{children}</main>
        </div>
      </body>
    </html>
  );
}
