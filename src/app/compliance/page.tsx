'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function ComplianceLanding() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to dashboard - auth handled by middleware
    router.push('/compliance/dashboard');
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-500 mx-auto"></div>
        <p className="mt-4 text-gray-400">Loading Compliance Portal...</p>
      </div>
    </div>
  );
}
