import { Metadata } from 'next';
import AdminNav from '@/src/components/AdminNav';

export const metadata: Metadata = {
  title: 'Admin Portal - SyncedUp Call AI',
  description: 'Administrative dashboard for SyncedUp Call AI',
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900">
      <AdminNav />
      <main className="relative">
        {children}
      </main>
    </div>
  );
}