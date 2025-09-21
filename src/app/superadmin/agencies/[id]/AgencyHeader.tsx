import { Calendar, Building2, User, Hash } from 'lucide-react';
import Link from 'next/link';

interface AgencyHeaderProps {
  agency: {
    id: string;
    name: string;
    slug?: string;
    owner_user_id?: string;
    created_at: string;
  };
}

export function AgencyHeader({ agency }: AgencyHeaderProps) {
  const formatDate = (date: string) => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date(date));
  };

  const formatShortId = (id: string | null | undefined) => {
    if (!id) return '—';
    return id.slice(0, 8);
  };

  return (
    <div className="mb-8">
      {/* Back link */}
      <Link
        href="/superadmin/agencies"
        className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors mb-4"
      >
        ← Back to Agencies
      </Link>

      {/* Header content */}
      <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
              <Building2 className="h-8 w-8 text-blue-500" />
              {agency.name}
            </h1>

            <div className="mt-4 space-y-2">
              {agency.slug && (
                <div className="flex items-center gap-2 text-gray-400">
                  <Hash className="h-4 w-4" />
                  <span className="text-sm">Slug:</span>
                  <span className="font-mono bg-gray-800 px-2 py-1 rounded text-sm text-gray-300">
                    {agency.slug}
                  </span>
                </div>
              )}

              {agency.owner_user_id && (
                <div className="flex items-center gap-2 text-gray-400">
                  <User className="h-4 w-4" />
                  <span className="text-sm">Owner:</span>
                  <span className="font-mono bg-gray-800 px-2 py-1 rounded text-sm text-gray-300">
                    {formatShortId(agency.owner_user_id)}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="text-sm text-gray-400 flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Created {formatDate(agency.created_at)}
          </div>
        </div>
      </div>
    </div>
  );
}