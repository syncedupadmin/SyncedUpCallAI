'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Building2, Mail, Lock, User, Phone, Globe, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import Link from 'next/link';
import toast from 'react-hot-toast';

export default function RegisterAgencyPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    company_name: '',
    company_phone: '',
    company_website: '',
    admin_name: '',
    admin_email: '',
    admin_password: '',
    confirm_password: ''
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [registrationSuccess, setRegistrationSuccess] = useState(false);

  const validateStep1 = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.company_name) {
      newErrors.company_name = 'Company name is required';
    }

    if (!formData.admin_name) {
      newErrors.admin_name = 'Your name is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateStep2 = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.admin_email) {
      newErrors.admin_email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(formData.admin_email)) {
      newErrors.admin_email = 'Invalid email format';
    }

    if (!formData.admin_password) {
      newErrors.admin_password = 'Password is required';
    } else if (formData.admin_password.length < 8) {
      newErrors.admin_password = 'Password must be at least 8 characters';
    }

    if (formData.admin_password !== formData.confirm_password) {
      newErrors.confirm_password = 'Passwords do not match';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (step === 1 && validateStep1()) {
      setStep(2);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateStep2()) {
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch('/api/agencies/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Registration failed');
      }

      setRegistrationSuccess(true);
      toast.success('Registration successful! Check your email.');

    } catch (error: any) {
      console.error('Registration error:', error);
      toast.error(error.message || 'Failed to register agency');
      setIsLoading(false);
    }
  };

  if (registrationSuccess) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-gray-900/90 backdrop-blur-xl rounded-2xl shadow-2xl border border-gray-800 p-8 max-w-md w-full"
        >
          <div className="text-center">
            <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="w-10 h-10 text-green-500" />
            </div>
            <h2 className="text-3xl font-bold text-white mb-4">Registration Successful!</h2>

            <p className="text-gray-400 mb-6">
              We've sent a confirmation email to <span className="text-white font-medium">{formData.admin_email}</span>
            </p>

            <div className="bg-gray-800/50 rounded-lg p-4 mb-6 text-left">
              <h3 className="text-sm font-semibold text-gray-300 mb-2">Next Steps:</h3>
              <ol className="text-sm text-gray-400 space-y-2">
                <li>1. Check your email and click the confirmation link</li>
                <li>2. Log in to your account</li>
                <li>3. Connect your Convoso account</li>
                <li>4. We'll analyze your calls and show insights</li>
              </ol>
            </div>

            <p className="text-xs text-gray-500 mb-4">
              Didn't receive the email? Check your spam folder or contact support.
            </p>

            <button
              onClick={() => router.push('/login')}
              className="w-full bg-gradient-to-r from-cyan-500 to-purple-600 text-white font-semibold py-3 px-6 rounded-lg hover:opacity-90 transition"
            >
              Go to Login
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[url('/grid.svg')] bg-center [mask-image:linear-gradient(180deg,white,rgba(255,255,255,0))]" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative w-full max-w-2xl"
      >
        <div className="absolute inset-0 bg-gradient-to-r from-cyan-500 to-purple-600 rounded-2xl blur-3xl opacity-20" />

        <div className="relative bg-gray-900/90 backdrop-blur-xl rounded-2xl shadow-2xl border border-gray-800 overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-cyan-500 to-purple-600" />

          {/* Progress Bar */}
          <div className="px-8 pt-8">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center space-x-4">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  step >= 1 ? 'bg-cyan-500' : 'bg-gray-700'
                }`}>
                  {step > 1 ? <CheckCircle className="w-5 h-5 text-white" /> : '1'}
                </div>
                <div className={`h-1 w-24 ${step >= 2 ? 'bg-cyan-500' : 'bg-gray-700'}`} />
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  step >= 2 ? 'bg-cyan-500' : 'bg-gray-700'
                }`}>
                  2
                </div>
              </div>
            </div>
          </div>

          <div className="p-8 pt-0">
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
                {step === 1 ? 'Agency Information' : 'Create Your Account'}
              </h1>
              <p className="text-gray-400 mt-2">
                {step === 1
                  ? 'Tell us about your company'
                  : 'Set up your administrator account'
                }
              </p>
            </div>

            {errors.general && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-3"
              >
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                <span className="text-sm text-red-400">{errors.general}</span>
              </motion.div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              {step === 1 ? (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Company Name *
                    </label>
                    <div className="relative">
                      <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                      <input
                        type="text"
                        value={formData.company_name}
                        onChange={(e) => setFormData({...formData, company_name: e.target.value})}
                        className="w-full pl-11 pr-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 transition text-white placeholder-gray-500"
                        placeholder="Your Agency Name"
                      />
                    </div>
                    {errors.company_name && (
                      <p className="text-red-400 text-sm mt-1">{errors.company_name}</p>
                    )}
                  </div>

                  <div className="grid md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Phone Number
                      </label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                        <input
                          type="tel"
                          value={formData.company_phone}
                          onChange={(e) => setFormData({...formData, company_phone: e.target.value})}
                          className="w-full pl-11 pr-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 transition text-white placeholder-gray-500"
                          placeholder="(555) 123-4567"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Website
                      </label>
                      <div className="relative">
                        <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                        <input
                          type="url"
                          value={formData.company_website}
                          onChange={(e) => setFormData({...formData, company_website: e.target.value})}
                          className="w-full pl-11 pr-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 transition text-white placeholder-gray-500"
                          placeholder="https://example.com"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Your Name *
                    </label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                      <input
                        type="text"
                        value={formData.admin_name}
                        onChange={(e) => setFormData({...formData, admin_name: e.target.value})}
                        className="w-full pl-11 pr-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 transition text-white placeholder-gray-500"
                        placeholder="John Doe"
                      />
                    </div>
                    {errors.admin_name && (
                      <p className="text-red-400 text-sm mt-1">{errors.admin_name}</p>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={handleNext}
                    className="w-full py-3 bg-gradient-to-r from-cyan-500 to-purple-600 rounded-lg font-semibold text-white hover:shadow-lg hover:shadow-cyan-500/25 transition duration-300 flex items-center justify-center"
                  >
                    Continue
                  </button>
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Email Address *
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                      <input
                        type="email"
                        value={formData.admin_email}
                        onChange={(e) => setFormData({...formData, admin_email: e.target.value})}
                        className="w-full pl-11 pr-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 transition text-white placeholder-gray-500"
                        placeholder="admin@example.com"
                      />
                    </div>
                    {errors.admin_email && (
                      <p className="text-red-400 text-sm mt-1">{errors.admin_email}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Password *
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                      <input
                        type="password"
                        value={formData.admin_password}
                        onChange={(e) => setFormData({...formData, admin_password: e.target.value})}
                        className="w-full pl-11 pr-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 transition text-white placeholder-gray-500"
                        placeholder="Minimum 8 characters"
                      />
                    </div>
                    {errors.admin_password && (
                      <p className="text-red-400 text-sm mt-1">{errors.admin_password}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Confirm Password *
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                      <input
                        type="password"
                        value={formData.confirm_password}
                        onChange={(e) => setFormData({...formData, confirm_password: e.target.value})}
                        className="w-full pl-11 pr-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 transition text-white placeholder-gray-500"
                        placeholder="Re-enter your password"
                      />
                    </div>
                    {errors.confirm_password && (
                      <p className="text-red-400 text-sm mt-1">{errors.confirm_password}</p>
                    )}
                  </div>

                  <div className="flex gap-4">
                    <button
                      type="button"
                      onClick={() => setStep(1)}
                      className="flex-1 py-3 bg-gray-800 rounded-lg font-semibold text-gray-300 hover:bg-gray-700 transition"
                    >
                      Back
                    </button>
                    <button
                      type="submit"
                      disabled={isLoading}
                      className="flex-1 py-3 bg-gradient-to-r from-cyan-500 to-purple-600 rounded-lg font-semibold text-white hover:shadow-lg hover:shadow-cyan-500/25 transition duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin mr-2" />
                          Creating Agency...
                        </>
                      ) : (
                        'Create Agency'
                      )}
                    </button>
                  </div>
                </>
              )}
            </form>

            <div className="mt-8 text-center">
              <p className="text-gray-400">
                Already have an account?{' '}
                <Link href="/login" className="text-cyan-400 hover:text-cyan-300 transition">
                  Sign In
                </Link>
              </p>
            </div>

            {step === 1 && (
              <div className="mt-6 p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                <p className="text-xs text-blue-400 text-center">
                  🎉 Start your 14-day free trial. No credit card required.
                </p>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}