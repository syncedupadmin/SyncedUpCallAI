'use client';

import { useOfficeContext } from '@/src/contexts/OfficeContext';
import { Building2 } from 'lucide-react';

export function OfficeSelector({ className }: { className?: string }) {
  const { memberships, selectedOfficeId, setSelectedOfficeId } = useOfficeContext();

  // Hide if user has no memberships or only one office
  if (!memberships?.length || memberships.length === 1) {
    return null;
  }

  return (
    <div className={`flex items-center gap-2 ${className || ''}`}>
      <Building2 className="w-4 h-4 text-gray-400" />
      <select
        className="bg-gray-800 text-gray-300 text-sm rounded-lg px-3 py-1.5 border border-gray-700 focus:border-purple-500 focus:outline-none"
        value={selectedOfficeId ?? ''}
        onChange={(e) => {
          const next = Number(e.target.value);
          setSelectedOfficeId(Number.isNaN(next) ? null : next);
        }}
      >
        <option value="" disabled>
          Select office...
        </option>
        {memberships
          .slice()
          .sort((a, b) => a.office_name.localeCompare(b.office_name))
          .map((m) => (
            <option key={m.office_id} value={m.office_id}>
              {m.office_name} {m.role === 'admin' ? '(Admin)' : ''}
            </option>
          ))}
      </select>
    </div>
  );
}