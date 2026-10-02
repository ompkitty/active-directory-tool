import type { Metadata } from 'next';
import Script from 'next/script';
import './globals.css';
import { Sidebar } from '@/components/layout/sidebar';
import { THEME_INIT_SCRIPT } from '@/lib/theme';

export const metadata: Metadata = {
  title: 'Active Directory Tool',
  description: 'Development-only web panel for authorized Active Directory administration over LDAPS.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: the theme script toggles a class on <html>
    // before React hydrates, which is an intentional server/client difference.
    <html lang="en" className="h-full" suppressHydrationWarning>
      <body className="min-h-full bg-muted text-foreground">
        <Script id="theme-init" strategy="beforeInteractive">
          {THEME_INIT_SCRIPT}
        </Script>
        <div className="flex min-h-screen">
          <Sidebar />
          <main className="min-w-0 flex-1">{children}</main>
        </div>
      </body>
    </html>
  );
}
