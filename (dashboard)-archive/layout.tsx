import Navigation from '@/components/Navigation';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Navigation />
      <main style={{
        position: 'relative',
        zIndex: 10,
        minHeight: 'calc(100vh - 65px)'
      }}>
        {children}
      </main>
    </>
  );
}