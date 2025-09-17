import { Metadata } from 'next';
import SuperAdminNav from '@/src/components/SuperAdminNav';
import { OfficeProvider } from '@/src/contexts/OfficeContext';

export const metadata: Metadata = {
  title: 'Super Admin Portal - SyncedUp Call AI',
  description: 'Super Administrative dashboard for SyncedUp Call AI',
};

export default function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <OfficeProvider>
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900">
        <SuperAdminNav />
        <main className="relative">
          {children}
        </main>
      </div>
    </OfficeProvider>
  );
}