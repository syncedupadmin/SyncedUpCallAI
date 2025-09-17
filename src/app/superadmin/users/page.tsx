'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function SuperAdminUsersRedirect() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to the actual agencies page
    router.replace('/superadmin/agencies');
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-gray-400">Redirecting to agencies page...</div>
    </div>
  );
}