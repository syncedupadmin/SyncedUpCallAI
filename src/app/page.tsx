export default function HomePage() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">SyncedUp Call AI</h1>
      <p className="text-gray-600 mb-6">Call analysis and webhook processing system</p>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <a href="/calls" className="p-4 border rounded-lg hover:bg-gray-50">
          <h2 className="font-semibold">Calls</h2>
          <p className="text-sm text-gray-600">View all calls</p>
        </a>
        
        <a href="/library" className="p-4 border rounded-lg hover:bg-gray-50">
          <h2 className="font-semibold">Library</h2>
          <p className="text-sm text-gray-600">Best/worst calls</p>
        </a>
        
        <a href="/search" className="p-4 border rounded-lg hover:bg-gray-50">
          <h2 className="font-semibold">Search</h2>
          <p className="text-sm text-gray-600">Semantic search</p>
        </a>
        
        <a href="/reports/value" className="p-4 border rounded-lg hover:bg-gray-50">
          <h2 className="font-semibold">Value Report</h2>
          <p className="text-sm text-gray-600">Lost value analysis</p>
        </a>
      </div>
    </div>
  );
}