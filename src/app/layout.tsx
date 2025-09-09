export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en"><body style={{fontFamily:'Inter, system-ui, Arial', background:'#0b0f14', color:'#dbe2ea'}}>
      <div style={{maxWidth: 1200, margin: '0 auto', padding: 24}}>
        <h1 style={{fontSize: 24, marginBottom: 12}}>SyncedUp Call AI</h1>
        <nav style={{marginBottom:16}}>
          <a href="/calls" style={{marginRight:12}}>Calls</a>
          <a href="/library" style={{marginRight:12}}>Library</a>
          <a href="/reports/value" style={{marginRight:12}}>Revenue</a>
          <a href="/search" style={{marginRight:12}}>Search</a>
        </nav>
        {children}
      </div>
    </body></html>
  );
}
