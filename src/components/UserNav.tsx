'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { AgencySelector } from './AgencySelector';
import {
  LogOut,
  User,
  Settings,
  ChevronDown,
  Home,
  Phone,
  BarChart3,
  FileText,
  Users
} from 'lucide-react';
import Link from 'next/link';

interface UserNavProps {
  currentPath?: string;
}

export function UserNav({ currentPath }: UserNavProps) {
  const [user, setUser] = useState<any>(null);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const supabase = createClient();
  const router = useRouter();

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
    };
    getUser();
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const navItems = [
    { href: '/dashboard', icon: Home, label: 'Dashboard' },
    { href: '/calls', icon: Phone, label: 'Calls' },
    { href: '/kpi', icon: BarChart3, label: 'KPIs' },
    { href: '/library', icon: FileText, label: 'Library' },
  ];

  return (
    <nav className="bg-gray-900 border-b border-gray-800 px-4 py-3">
      <div className="flex items-center justify-between max-w-7xl mx-auto">
        {/* Left side - Logo and main nav */}
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="text-xl font-bold text-white">
            SyncedUp AI
          </Link>

          <div className="hidden md:flex items-center gap-4">
            {navItems.map((item) => {
              const isActive = currentPath === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-300 hover:text-white hover:bg-gray-800'
                  }`}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>

        {/* Center - Agency Selector */}
        <div className="hidden md:block">
          <AgencySelector />
        </div>

        {/* Right side - User menu */}
        <div className="flex items-center gap-4">
          {/* Mobile agency selector */}
          <div className="md:hidden">
            <AgencySelector />
          </div>

          {/* User menu */}
          <div className="relative">
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center gap-2 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg hover:bg-gray-700 transition-colors"
            >
              <User className="h-4 w-4 text-gray-400" />
              <span className="text-sm text-white hidden sm:block">
                {user?.email?.split('@')[0] || 'User'}
              </span>
              <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${showUserMenu ? 'rotate-180' : ''}`} />
            </button>

            {showUserMenu && (
              <>
                {/* Backdrop */}
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowUserMenu(false)}
                />

                {/* Menu */}
                <div className="absolute top-full right-0 mt-1 w-48 bg-gray-800 border border-gray-700 rounded-lg shadow-lg z-20">
                  <div className="px-3 py-2 border-b border-gray-700">
                    <p className="text-sm text-white font-medium truncate">
                      {user?.email}
                    </p>
                  </div>

                  <button
                    onClick={handleSignOut}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 transition-colors"
                  >
                    <LogOut className="h-4 w-4" />
                    Sign out
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Mobile nav menu */}
      <div className="md:hidden mt-3 pt-3 border-t border-gray-800">
        <div className="flex flex-wrap gap-2">
          {navItems.map((item) => {
            const isActive = currentPath === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-300 hover:text-white hover:bg-gray-800'
                }`}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}