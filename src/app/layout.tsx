import '@/src/styles/globals.css';

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
        <nav style={{ 
          background: 'rgba(10, 10, 15, 0.8)',
          backdropFilter: 'blur(20px)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          position: 'sticky',
          top: 0,
          zIndex: 1000,
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4)'
        }}>
          <div style={{ 
            maxWidth: 1400, 
            margin: '0 auto', 
            padding: '16px 32px',
            display: 'flex', 
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 48 }}>
              <a href="/" style={{ 
                background: 'linear-gradient(135deg, #00d4ff 0%, #7c3aed 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                textDecoration: 'none',
                fontWeight: 700,
                fontSize: 20,
                letterSpacing: '-0.5px',
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ minWidth: 24 }}>
                  <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="url(#gradient)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M2 17L12 22L22 17" stroke="url(#gradient)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M2 12L12 17L22 12" stroke="url(#gradient)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <defs>
                    <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#00d4ff" />
                      <stop offset="100%" stopColor="#7c3aed" />
                    </linearGradient>
                  </defs>
                </svg>
                SyncedUp Portal
              </a>
              
              <div style={{ display: 'flex', gap: 8 }}>
                <a href="/dashboard" className="nav-link">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="7" height="7" />
                    <rect x="14" y="3" width="7" height="7" />
                    <rect x="14" y="14" width="7" height="7" />
                    <rect x="3" y="14" width="7" height="7" />
                  </svg>
                  Dashboard
                </a>
                <a href="/calls" className="nav-link">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
                  </svg>
                  Calls
                </a>
                <a href="/library" className="nav-link">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                  </svg>
                  Library
                </a>
                <a href="/search" className="nav-link">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8" />
                    <path d="m21 21-4.35-4.35" />
                  </svg>
                  Search
                </a>
                <a href="/reports/value" className="nav-link">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="12" y1="20" x2="12" y2="10" />
                    <line x1="18" y1="20" x2="18" y2="4" />
                    <line x1="6" y1="20" x2="6" y2="16" />
                  </svg>
                  Analytics
                </a>
              </div>
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: '#10b981',
                boxShadow: '0 0 10px rgba(16, 185, 129, 0.5)',
                animation: 'pulse 2s infinite'
              }} />
              <span style={{ 
                fontSize: 12, 
                color: '#a8a8b3',
                textTransform: 'uppercase',
                letterSpacing: '0.5px'
              }}>
                System Online
              </span>
            </div>
          </div>
        </nav>
        
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