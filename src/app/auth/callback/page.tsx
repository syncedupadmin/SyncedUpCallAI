'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Loader2 } from 'lucide-react';

export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Exchange the code in the URL for a session
        // This handles both regular auth and password recovery
        const { data, error } = await supabase.auth.exchangeCodeForSession(window.location.href);

        if (error) {
          console.error('Auth callback error:', error);
          setError(error.message);
          setTimeout(() => {
            router.push(`/login?error=${encodeURIComponent(error.message)}`);
          }, 2000);
          return;
        }

        // Check if this is a password recovery session
        const urlParams = new URLSearchParams(window.location.search);
        const type = urlParams.get('type');

        if (type === 'recovery') {
          // This is a password reset - redirect to reset password page
          router.push('/reset-password');
        } else {
          // Regular authentication - redirect to dashboard
          router.push('/dashboard');
        }
      } catch (err: any) {
        console.error('Unexpected error in auth callback:', err);
        setError(err?.message || 'Authentication failed');
        setTimeout(() => {
          router.push('/login?error=Authentication%20failed');
        }, 2000);
      }
    };

    handleCallback();
  }, [router, supabase]);

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-red-500 mb-4">Error: {error}</p>
          <p className="text-gray-400">Redirecting to login...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 flex items-center justify-center p-4">
      <div className="text-center">
        <Loader2 className="w-12 h-12 text-cyan-500 animate-spin mx-auto mb-4" />
        <p className="text-white text-lg">Processing authentication...</p>
      </div>
    </div>
  );
}