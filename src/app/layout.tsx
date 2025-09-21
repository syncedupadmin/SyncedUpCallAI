import '@/styles/globals.css';
import { Inter } from 'next/font/google';
import { PrefsProvider } from "@/components/PrefsProvider";
import { AgencyProvider } from "@/contexts/AgencyContext";

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata = {
  title: 'SyncedUp AI | AI-Powered Call Intelligence',
  description: 'Transform your call center with AI-powered insights, real-time transcription, and actionable analytics',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.className}>
      <head>
        <script src="/unregister-sw.js" defer />
      </head>
      <body className="antialiased">
        <PrefsProvider>
          <AgencyProvider>
            {children}
          </AgencyProvider>
        </PrefsProvider>
      </body>
    </html>
  );
}