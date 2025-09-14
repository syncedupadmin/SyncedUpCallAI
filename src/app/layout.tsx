import '@/src/styles/globals.css';
import Navigation from '../components/Navigation';

export const metadata = {
  title: 'SyncedUp Portal | AI Call Intelligence',
  description: 'Advanced call analytics and intelligence platform',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Navigation />
        
        <main style={{ 
          position: 'relative',
          zIndex: 10,
          minHeight: 'calc(100vh - 65px)'
        }}>
          {children}
        </main>
        
      </body>
    </html>
  );
}