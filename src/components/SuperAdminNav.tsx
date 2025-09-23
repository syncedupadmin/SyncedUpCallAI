'use client';

import { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import {
  LayoutDashboard,
  Phone,
  BarChart3,
  Users,
  LogOut,
  Menu,
  X,
  Shield,
  User,
  Wrench,
  Crown,
  Upload,
  Activity,
  Mic,
  Building2,
  CheckCircle2,
  TrendingUp,
  Monitor
} from 'lucide-react';
import { OfficeSelector } from '@/components/OfficeSelector';

interface NavItem {
  name: string;
  href: string;
  icon: React.ElementType;
  description?: string;
}

export default function SuperAdminNav() {
  const [user, setUser] = useState<any>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    checkAuthStatus();
  }, []);

  const navItems: NavItem[] = [
    {
      name: 'Dashboard',
      href: '/superadmin',
      icon: LayoutDashboard,
      description: 'Super admin dashboard'
    },
    {
      name: 'Agencies',
      href: '/superadmin/agencies',
      icon: Building2,
      description: 'Agency management'
    },
    {
      name: 'Users',
      href: '/superadmin/agencies',
      icon: Shield,
      description: 'All users & admins'
    },
    {
      name: 'KPI',
      href: '/kpi',
      icon: TrendingUp,
      description: 'Key performance indicators'
    },
    {
      name: 'Calls',
      href: '/superadmin/calls',
      icon: Phone,
      description: 'View all calls'
    },
    {
      name: 'Processed',
      href: '/superadmin/processed-calls',
      icon: CheckCircle2,
      description: 'Processed & analyzed calls'
    },
    {
      name: 'Analytics',
      href: '/superadmin/analytics',
      icon: BarChart3,
      description: 'System analytics'
    },
    {
      name: 'Operations',
      href: '/superadmin/operations',
      icon: Monitor,
      description: 'System health & monitoring'
    },
    {
      name: 'Bulk Upload',
      href: '/superadmin/bulk-upload',
      icon: Upload,
      description: 'Import CSV/Excel data'
    },
    {
      name: 'Openings',
      href: '/superadmin/openings',
      icon: Mic,
      description: 'Opening analysis & training'
    },
    {
      name: 'Discovery Test',
      href: '/superadmin/discovery-test',
      icon: Activity,
      description: 'AI pattern discovery'
    },
    {
      name: 'Test Tools',
      href: '/superadmin/test-tools',
      icon: Wrench,
      description: 'Development & testing'
    }
  ];

  const checkAuthStatus = async () => {
    try {
      const res = await fetch('/api/auth/admin', {
        method: 'GET',
        credentials: 'include'
      });

      if (res.ok) {
        const data = await res.json();
        if (data.authenticated && data.isAdmin) {
          setUser(data.user);

          // Get user level from Supabase
          const { data: levelData } = await supabase.rpc('get_user_level');
          if (levelData !== 'super_admin') {
            // Redirect to regular admin if not super admin
            router.push('/admin');
          }
        }
      }
    } catch (error) {
      console.error('Error checking auth status:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      // Call the admin auth endpoint to clear the cookie and sign out
      await fetch('/api/auth/admin', {
        method: 'DELETE',
        credentials: 'include'
      });

      // Redirect to home page
      window.location.href = '/';
    } catch (error) {
      console.error('Error signing out:', error);
      // Force redirect even if the API call fails
      window.location.href = '/';
    }
  };

  const isActive = (href: string) => {
    if (href === '/superadmin' && pathname === '/superadmin') return true;
    if (href !== '/superadmin' && pathname.startsWith(href)) return true;
    return false;
  };

  if (loading) {
    return (
      <nav className="bg-gray-900/95 backdrop-blur-xl border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="text-gray-400">Loading...</div>
          </div>
        </div>
      </nav>
    );
  }

  return (
    <nav className="bg-gray-900/95 backdrop-blur-xl border-b border-gray-800 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo and Desktop Navigation */}
          <div className="flex items-center flex-1">
            <div className="flex-shrink-0 flex items-center">
              <Crown className="w-8 h-8 text-purple-500" />
              <span className="ml-2 text-xl font-bold bg-gradient-to-r from-purple-500 to-pink-500 bg-clip-text text-transparent">
                Super Admin
              </span>
            </div>

            {/* Desktop Navigation */}
            <div className="hidden md:block ml-6 flex-1">
              <div className="flex items-baseline space-x-0.5">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.href);

                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      className={`flex items-center gap-1.5 px-2 py-2 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                        active
                          ? 'bg-gradient-to-r from-purple-500/20 to-pink-500/20 text-white border border-purple-500/30'
                          : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>{item.name}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>

          {/* User Menu */}
          <div className="hidden md:flex items-center gap-2 flex-shrink-0">
            <OfficeSelector />
            {user && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-800/50 rounded-lg">
                <User className="w-3.5 h-3.5 text-gray-400" />
                <div className="text-xs">
                  <div className="text-gray-300">{user.email}</div>
                  <div className="text-xs text-gray-500 uppercase tracking-wider">
                    Super Admin
                  </div>
                </div>
              </div>
            )}

            <button
              onClick={handleSignOut}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 text-purple-400 hover:text-purple-300"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="text-xs font-medium">Sign Out</span>
            </button>
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="inline-flex items-center justify-center p-2 rounded-md text-gray-400 hover:text-white hover:bg-gray-800 focus:outline-none"
            >
              {mobileMenuOpen ? (
                <X className="w-6 h-6" />
              ) : (
                <Menu className="w-6 h-6" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-gray-900/95 border-t border-gray-800">
          <div className="px-2 pt-2 pb-3 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);

              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-3 py-3 rounded-lg text-base font-medium transition-all ${
                    active
                      ? 'bg-gradient-to-r from-purple-500/20 to-pink-500/20 text-white border border-purple-500/30'
                      : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <div>
                    <div>{item.name}</div>
                    {item.description && (
                      <div className="text-xs text-gray-500">{item.description}</div>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>

          <div className="px-4 py-3 border-t border-gray-800">
            {user && (
              <div className="flex items-center gap-3 px-3 py-2 mb-3 bg-gray-800/50 rounded-lg">
                <User className="w-5 h-5 text-gray-400" />
                <div>
                  <div className="text-sm text-gray-300">{user.email}</div>
                  <div className="text-xs text-gray-500 uppercase tracking-wider">
                    Super Admin
                  </div>
                </div>
              </div>
            )}

            <button
              onClick={handleSignOut}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg transition-all bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 text-purple-400 hover:text-purple-300"
            >
              <LogOut className="w-5 h-5" />
              <span className="font-medium">Sign Out</span>
            </button>
          </div>
        </div>
      )}
    </nav>
  );
}