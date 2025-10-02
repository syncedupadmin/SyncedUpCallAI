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
  Monitor,
  ShieldCheck,
  CreditCard,
  ChevronDown
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
  const [testDropdownOpen, setTestDropdownOpen] = useState(false);
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
      name: 'Billing',
      href: '/superadmin/billing',
      icon: CreditCard,
      description: 'Billing & subscriptions'
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
      name: 'Audit',
      href: '/superadmin/audit-dashboard',
      icon: ShieldCheck,
      description: 'Portal security audit'
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
      name: 'Post Close',
      href: '/superadmin/post-close',
      icon: ShieldCheck,
      description: 'Script compliance verification'
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
      <div className="w-full px-4 sm:px-6 lg:px-8">
        <div className="flex items-center h-16">
          {/* Logo - Fixed width */}
          <div className="flex-shrink-0 flex items-center min-w-fit">
            <Crown className="w-8 h-8 text-purple-500" />
            <span className="ml-2 text-xl font-bold bg-gradient-to-r from-purple-500 to-pink-500 bg-clip-text text-transparent whitespace-nowrap">
              Super Admin
            </span>
          </div>

          {/* Desktop Navigation - Flexible center with overflow handling */}
          <div className="hidden md:flex flex-1 mx-4 overflow-x-auto">
            <div className="flex items-baseline space-x-0.5 mx-auto">
              {/* Dashboard */}
              {navItems.slice(0, 1).map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);

                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={`flex items-center gap-1 px-1.5 py-2 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
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

              {/* TEST CALLS DROPDOWN */}
              <div className="relative">
                <button
                  onClick={() => setTestDropdownOpen(!testDropdownOpen)}
                  onBlur={() => setTimeout(() => setTestDropdownOpen(false), 150)}
                  className={`flex items-center gap-1 px-1.5 py-2 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                    pathname.startsWith('/analyze-demo')
                      ? 'bg-gradient-to-r from-purple-500/20 to-pink-500/20 text-white border border-purple-500/30'
                      : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                  }`}
                >
                  <Phone className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>TEST CALLS HERE</span>
                  <ChevronDown className={`w-3 h-3 transition-transform ${testDropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                {testDropdownOpen && (
                  <div className="absolute left-0 mt-1 w-56 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50">
                    <div className="py-1">
                      <Link
                        href="/analyze-demo"
                        className="block px-3 py-2 text-xs text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
                        onClick={() => setTestDropdownOpen(false)}
                      >
                        <div className="font-medium">V1 Analysis (Legacy)</div>
                        <div className="text-[10px] text-gray-500">2-pass analysis system</div>
                      </Link>
                      <Link
                        href="/analyze-demo-v2-10.2.25"
                        className="block px-3 py-2 text-xs text-purple-300 hover:bg-gray-700 hover:text-purple-200 transition-colors border-t border-gray-700"
                        onClick={() => setTestDropdownOpen(false)}
                      >
                        <div className="font-medium flex items-center gap-1">
                          V2 Analysis (NEW - 10.2.25)
                          <span className="px-1 py-0.5 bg-purple-500/20 text-purple-400 rounded text-[9px] font-bold">NEW</span>
                        </div>
                        <div className="text-[10px] text-purple-400/70">3-pass sequential analysis</div>
                      </Link>
                    </div>
                  </div>
                )}
              </div>

              {/* Rest of nav items */}
              {navItems.slice(1).map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);

                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={`flex items-center gap-1 px-1.5 py-2 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
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

          {/* User Menu - Fixed on right */}
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
            {/* Dashboard */}
            {navItems.slice(0, 1).map((item) => {
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

            {/* TEST CALLS DROPDOWN - Mobile */}
            <div>
              <button
                onClick={() => setTestDropdownOpen(!testDropdownOpen)}
                className={`w-full flex items-center justify-between gap-3 px-3 py-3 rounded-lg text-base font-medium transition-all ${
                  pathname.startsWith('/analyze-demo')
                    ? 'bg-gradient-to-r from-purple-500/20 to-pink-500/20 text-white border border-purple-500/30'
                    : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Phone className="w-5 h-5" />
                  <div>
                    <div>TEST CALLS HERE</div>
                    <div className="text-xs text-gray-500">Test call analysis</div>
                  </div>
                </div>
                <ChevronDown className={`w-4 h-4 transition-transform ${testDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {testDropdownOpen && (
                <div className="ml-8 mt-1 space-y-1">
                  <Link
                    href="/analyze-demo"
                    onClick={() => {
                      setTestDropdownOpen(false);
                      setMobileMenuOpen(false);
                    }}
                    className="block px-3 py-2 text-sm text-gray-300 hover:bg-gray-800 rounded-lg transition-colors"
                  >
                    <div className="font-medium">V1 Analysis (Legacy)</div>
                    <div className="text-xs text-gray-500">2-pass analysis system</div>
                  </Link>
                  <Link
                    href="/analyze-demo-v2-10.2.25"
                    onClick={() => {
                      setTestDropdownOpen(false);
                      setMobileMenuOpen(false);
                    }}
                    className="block px-3 py-2 text-sm text-purple-300 hover:bg-gray-800 rounded-lg transition-colors"
                  >
                    <div className="font-medium flex items-center gap-1">
                      V2 Analysis (NEW - 10.2.25)
                      <span className="px-1 py-0.5 bg-purple-500/20 text-purple-400 rounded text-[9px] font-bold">NEW</span>
                    </div>
                    <div className="text-xs text-purple-400/70">3-pass sequential analysis</div>
                  </Link>
                </div>
              )}
            </div>

            {/* Rest of nav items */}
            {navItems.slice(1).map((item) => {
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