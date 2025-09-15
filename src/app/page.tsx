'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Phone,
  Brain,
  Zap,
  BarChart3,
  ArrowRight,
  Play,
  Users,
  Shield,
  Globe,
  Sparkles
} from 'lucide-react';
import AuthModal from '@/src/components/Auth/AuthModal';
import ParticleBackground from '@/src/components/Home/ParticleBackground';
import AnimatedStats from '@/src/components/Home/AnimatedStats';
import { createClient } from '@/src/lib/supabase/client';

export default function Home() {
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [user, setUser] = useState<any>(null);
  const supabase = createClient();

  useEffect(() => {
    // Check if user is logged in
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const openAuth = (mode: 'login' | 'signup') => {
    setAuthMode(mode);
    setShowAuthModal(true);
  };

  const features = [
    {
      icon: Brain,
      title: 'AI-Powered Analysis',
      description: 'Advanced NLP understands context and sentiment from every conversation',
      gradient: 'from-purple-500 to-pink-500'
    },
    {
      icon: Zap,
      title: 'Real-Time Transcription',
      description: '99.9% accuracy with instant processing of your call recordings',
      gradient: 'from-blue-500 to-cyan-500'
    },
    {
      icon: BarChart3,
      title: 'Actionable Insights',
      description: 'Transform conversations into metrics that drive business decisions',
      gradient: 'from-green-500 to-emerald-500'
    },
    {
      icon: Shield,
      title: 'Enterprise Security',
      description: 'Bank-level encryption with HIPAA compliance options available',
      gradient: 'from-orange-500 to-red-500'
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 via-black to-gray-900 text-white overflow-hidden">
      <ParticleBackground />

      {/* Navigation */}
      <nav className="relative z-10 px-6 py-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center space-x-2"
          >
            <Sparkles className="w-8 h-8 text-cyan-400" />
            <span className="text-2xl font-bold bg-gradient-to-r from-cyan-400 to-purple-600 bg-clip-text text-transparent">
              SyncedUp AI
            </span>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center space-x-4"
          >
            {user ? (
              <>
                <a href="/dashboard" className="px-4 py-2 text-gray-300 hover:text-white transition">
                  Dashboard
                </a>
                <button
                  onClick={() => supabase.auth.signOut()}
                  className="px-4 py-2 text-gray-300 hover:text-white transition"
                >
                  Sign Out
                </button>
              </>
            ) : (
              <>
                <a
                  href="/login"
                  className="px-4 py-2 text-gray-300 hover:text-white transition"
                >
                  Login
                </a>
                <a
                  href="/signup"
                  className="px-6 py-2 bg-gradient-to-r from-cyan-500 to-purple-600 rounded-full font-semibold hover:shadow-lg hover:shadow-cyan-500/25 transition duration-300"
                >
                  Get Started
                </a>
              </>
            )}
          </motion.div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative z-10 px-6 pt-20 pb-32">
        <div className="max-w-7xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <h1 className="text-5xl md:text-7xl font-bold mb-6">
              Transform Your
              <span className="block bg-gradient-to-r from-cyan-400 via-purple-500 to-pink-500 bg-clip-text text-transparent">
                Call Intelligence
              </span>
            </h1>
            <p className="text-xl md:text-2xl text-gray-400 mb-8 max-w-3xl mx-auto">
              AI-powered insights from every conversation. Transcribe, analyze, and unlock the
              full potential of your call center data in real-time.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="flex flex-col sm:flex-row gap-4 justify-center mb-12"
          >
            <button
              onClick={() => user ? window.location.href = '/dashboard' : openAuth('signup')}
              className="group px-8 py-4 bg-gradient-to-r from-cyan-500 to-purple-600 rounded-full font-semibold text-lg hover:shadow-lg hover:shadow-cyan-500/25 transition duration-300 flex items-center justify-center"
            >
              {user ? 'Go to Dashboard' : 'Start Free Trial'}
              <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition" />
            </button>
            <button className="group px-8 py-4 bg-white/10 backdrop-blur-sm border border-white/20 rounded-full font-semibold text-lg hover:bg-white/20 transition duration-300 flex items-center justify-center">
              <Play className="mr-2 w-5 h-5" />
              Watch Demo
            </button>
          </motion.div>

          {/* Animated Stats */}
          <AnimatedStats />
        </div>
      </section>

      {/* Features Grid */}
      <section className="relative z-10 px-6 py-20">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl md:text-5xl font-bold mb-4">
              Powerful Features for
              <span className="block bg-gradient-to-r from-cyan-400 to-purple-600 bg-clip-text text-transparent">
                Modern Call Centers
              </span>
            </h2>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                viewport={{ once: true }}
                whileHover={{ y: -5, transition: { duration: 0.2 } }}
                className="relative group"
              >
                <div className="absolute inset-0 bg-gradient-to-r opacity-0 group-hover:opacity-100 transition duration-300 rounded-2xl blur-xl"
                  style={{ backgroundImage: `linear-gradient(to right, var(--tw-gradient-stops))` }}
                />
                <div className="relative bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-2xl p-6 hover:border-gray-600 transition duration-300">
                  <div className={`w-12 h-12 bg-gradient-to-r ${feature.gradient} rounded-lg flex items-center justify-center mb-4`}>
                    <feature.icon className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
                  <p className="text-gray-400">{feature.description}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Live Demo Section */}
      <section className="relative z-10 px-6 py-20">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
            className="relative"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/20 to-purple-600/20 blur-3xl" />
            <div className="relative bg-gray-800/30 backdrop-blur-xl border border-gray-700 rounded-3xl p-8 md:p-12">
              <div className="text-center mb-8">
                <h2 className="text-3xl md:text-4xl font-bold mb-4">
                  See It In Action
                </h2>
                <p className="text-gray-400 text-lg">
                  Real-time call analytics dashboard with live data processing
                </p>
              </div>

              {/* Mock Dashboard Preview */}
              <div className="relative aspect-video bg-gray-900/50 rounded-xl overflow-hidden border border-gray-700">
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <div className="w-20 h-20 bg-gradient-to-r from-cyan-500 to-purple-600 rounded-full flex items-center justify-center mb-4 mx-auto animate-pulse">
                      <Play className="w-10 h-10 text-white ml-1" />
                    </div>
                    <p className="text-gray-400">Click to play demo</p>
                  </div>
                </div>

                {/* Blur overlay with sample metrics */}
                <div className="absolute inset-0 bg-gray-900/80 backdrop-blur-sm flex items-center justify-center">
                  <div className="grid grid-cols-3 gap-8 text-center">
                    <div>
                      <div className="text-3xl font-bold text-cyan-400">98.7%</div>
                      <div className="text-gray-400">Accuracy</div>
                    </div>
                    <div>
                      <div className="text-3xl font-bold text-purple-400">2.3s</div>
                      <div className="text-gray-400">Avg Response</div>
                    </div>
                    <div>
                      <div className="text-3xl font-bold text-pink-400">24/7</div>
                      <div className="text-gray-400">Monitoring</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative z-10 px-6 py-20">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
          >
            <h2 className="text-4xl md:text-5xl font-bold mb-6">
              Ready to Transform Your Call Center?
            </h2>
            <p className="text-xl text-gray-400 mb-8">
              Join thousands of companies using AI to unlock insights from every conversation
            </p>
            <button
              onClick={() => user ? window.location.href = '/dashboard' : openAuth('signup')}
              className="group px-8 py-4 bg-gradient-to-r from-cyan-500 to-purple-600 rounded-full font-semibold text-lg hover:shadow-lg hover:shadow-cyan-500/25 transition duration-300 inline-flex items-center"
            >
              {user ? 'Go to Dashboard' : 'Get Started Now'}
              <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition" />
            </button>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-gray-800 px-6 py-8">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center">
          <div className="flex items-center space-x-2 mb-4 md:mb-0">
            <Sparkles className="w-6 h-6 text-cyan-400" />
            <span className="text-lg font-semibold">SyncedUp AI</span>
          </div>
          <div className="text-gray-400 text-sm">
            © 2024 SyncedUp AI. All rights reserved.
          </div>
        </div>
      </footer>

      {/* Auth Modal */}
      {showAuthModal && (
        <AuthModal
          mode={authMode}
          onClose={() => setShowAuthModal(false)}
        />
      )}
    </div>
  );
}