'use client';

import { useState } from 'react';
import { useAgencyContext } from '@/contexts/AgencyContext';
import { Building2, ChevronDown, Check, AlertCircle, Loader } from 'lucide-react';

export function AgencySelector() {
  const { agencies, selectedAgencyId, setSelectedAgencyId, loading, error } = useAgencyContext();
  const [isOpen, setIsOpen] = useState(false);

  const selectedAgency = agencies.find(agency => agency.agency_id === selectedAgencyId);

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg">
        <Loader className="h-4 w-4 animate-spin text-gray-400" />
        <span className="text-sm text-gray-400">Loading agencies...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-red-900/20 border border-red-700 rounded-lg">
        <AlertCircle className="h-4 w-4 text-red-400" />
        <span className="text-sm text-red-400">Error loading agencies</span>
      </div>
    );
  }

  if (agencies.length === 0) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg">
        <Building2 className="h-4 w-4 text-gray-400" />
        <span className="text-sm text-gray-400">No agencies found</span>
      </div>
    );
  }

  if (agencies.length === 1) {
    // If only one agency, just show it without dropdown
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg">
        <Building2 className="h-4 w-4 text-blue-400" />
        <div className="flex flex-col">
          <span className="text-sm font-medium text-white">{agencies[0].agency_name}</span>
          <span className="text-xs text-gray-400 capitalize">{agencies[0].role}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg hover:bg-gray-700 transition-colors w-full min-w-[200px]"
      >
        <Building2 className="h-4 w-4 text-blue-400" />
        <div className="flex flex-col items-start flex-1">
          {selectedAgency ? (
            <>
              <span className="text-sm font-medium text-white">{selectedAgency.agency_name}</span>
              <span className="text-xs text-gray-400 capitalize">{selectedAgency.role}</span>
            </>
          ) : (
            <span className="text-sm text-gray-400">Select Agency</span>
          )}
        </div>
        <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />

          {/* Dropdown */}
          <div className="absolute top-full left-0 right-0 mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-lg z-20 max-h-60 overflow-y-auto">
            {agencies.map((agency) => (
              <button
                key={agency.agency_id}
                onClick={() => {
                  setSelectedAgencyId(agency.agency_id);
                  setIsOpen(false);
                }}
                className="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-700 transition-colors text-left"
              >
                <div className="flex-1">
                  <div className="text-sm font-medium text-white">{agency.agency_name}</div>
                  <div className="text-xs text-gray-400 capitalize">{agency.role}</div>
                </div>
                {selectedAgencyId === agency.agency_id && (
                  <Check className="h-4 w-4 text-blue-400" />
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}