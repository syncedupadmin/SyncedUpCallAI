import { ReactNode } from 'react';
import Link from 'next/link';
import { Shield, BarChart3, FileText, Users, Settings } from 'lucide-react';

export default function ComplianceLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-900">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
              <Shield className="w-8 h-8 text-cyan-500" />
              <div>
                <h1 className="text-xl font-bold text-white">Compliance Portal</h1>
                <p className="text-xs text-gray-400">Post-Close Verification</p>
              </div>
            </div>
            <nav className="flex gap-6">
              <Link href="/compliance/dashboard" className="text-gray-300 hover:text-white transition-colors flex items-center gap-2">
                <BarChart3 className="w-4 h-4" />
                <span className="hidden sm:inline">Dashboard</span>
              </Link>
              <Link href="/compliance/scripts" className="text-gray-300 hover:text-white transition-colors flex items-center gap-2">
                <FileText className="w-4 h-4" />
                <span className="hidden sm:inline">Scripts</span>
              </Link>
              <Link href="/compliance/results" className="text-gray-300 hover:text-white transition-colors flex items-center gap-2">
                <Shield className="w-4 h-4" />
                <span className="hidden sm:inline">Results</span>
              </Link>
              <Link href="/compliance/agents" className="text-gray-300 hover:text-white transition-colors flex items-center gap-2">
                <Users className="w-4 h-4" />
                <span className="hidden sm:inline">Agents</span>
              </Link>
              <Link href="/compliance/settings" className="text-gray-300 hover:text-white transition-colors flex items-center gap-2">
                <Settings className="w-4 h-4" />
                <span className="hidden sm:inline">Settings</span>
              </Link>
            </nav>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}
