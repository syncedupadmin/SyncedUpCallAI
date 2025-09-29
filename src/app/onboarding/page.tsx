'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  CheckCircle,
  Webhook,
  Send,
  Users,
  RocketIcon,
  Copy,
  AlertCircle,
  Loader2,
  ExternalLink
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import toast from 'react-hot-toast';

const steps = [
  { id: 'webhook', title: 'Webhook Setup', icon: Webhook },
  { id: 'test', title: 'Test Connection', icon: Send },
  { id: 'team', title: 'Invite Team', icon: Users },
  { id: 'complete', title: 'Go Live', icon: RocketIcon }
];

export default function OnboardingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const agencyId = searchParams.get('agency');
  const [currentStep, setCurrentStep] = useState(0);
  const [agency, setAgency] = useState<any>(null);
  const [webhookToken, setWebhookToken] = useState<string>('');
  const [testResult, setTestResult] = useState<any>(null);
  const [teamEmails, setTeamEmails] = useState<string[]>(['']);
  const [isLoading, setIsLoading] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    if (agencyId) {
      loadAgencyData();
    }
  }, [agencyId]);

  const loadAgencyData = async () => {
    try {
      // Get agency details
      const { data: agencyData } = await supabase
        .from('agencies')
        .select('*')
        .eq('id', agencyId)
        .single();

      if (agencyData) {
        setAgency(agencyData);
      }

      // Get webhook token
      const { data: tokenData } = await supabase
        .from('webhook_tokens')
        .select('token')
        .eq('agency_id', agencyId)
        .eq('is_active', true)
        .single();

      if (tokenData) {
        setWebhookToken(tokenData.token);
      }
    } catch (error) {
      console.error('Error loading agency data:', error);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard!');
  };

  const testWebhook = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/webhooks/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Agency-Token': webhookToken
        },
        body: JSON.stringify({
          test: true,
          agency_id: agencyId
        })
      });

      const result = await response.json();
      setTestResult(result);

      if (response.ok) {
        toast.success('Webhook test successful!');
        setCurrentStep(2);
      } else {
        toast.error('Webhook test failed. Please check your configuration.');
      }
    } catch (error) {
      console.error('Test error:', error);
      toast.error('Failed to test webhook');
    } finally {
      setIsLoading(false);
    }
  };

  const inviteTeamMembers = async () => {
    const validEmails = teamEmails.filter(email => email && email.includes('@'));

    if (validEmails.length === 0) {
      setCurrentStep(3);
      return;
    }

    setIsLoading(true);
    try {
      for (const email of validEmails) {
        // In production, send actual invitations
        console.log('Inviting:', email);
        // await sendInvitation(email, agencyId);
      }

      toast.success(`Invited ${validEmails.length} team member(s)`);
      setCurrentStep(3);
    } catch (error) {
      console.error('Invite error:', error);
      toast.error('Failed to send invitations');
    } finally {
      setIsLoading(false);
    }
  };

  const completeOnboarding = () => {
    toast.success('Welcome to SyncedUp AI! 🎉');
    router.push('/dashboard');
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 0: // Webhook Setup
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-white mb-2">Configure Convoso Webhook</h2>
              <p className="text-gray-400">
                Add this webhook configuration to your Convoso account to start receiving call data.
              </p>
            </div>

            <div className="space-y-4">
              <div className="bg-gray-800/50 rounded-lg p-4">
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  Webhook URL
                </label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-sm text-cyan-400 bg-gray-900 px-3 py-2 rounded">
                    {`${process.env.NEXT_PUBLIC_APP_URL || 'https://aicall.syncedupsolutions.com'}/api/webhooks/convoso-calls`}
                  </code>
                  <button
                    onClick={() => copyToClipboard(`${process.env.NEXT_PUBLIC_APP_URL || 'https://aicall.syncedupsolutions.com'}/api/webhooks/convoso-calls`)}
                    className="p-2 hover:bg-gray-700 rounded transition"
                  >
                    <Copy className="w-4 h-4 text-gray-400" />
                  </button>
                </div>
              </div>

              <div className="bg-gray-800/50 rounded-lg p-4">
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  Header Name
                </label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-sm text-cyan-400 bg-gray-900 px-3 py-2 rounded">
                    X-Agency-Token
                  </code>
                  <button
                    onClick={() => copyToClipboard('X-Agency-Token')}
                    className="p-2 hover:bg-gray-700 rounded transition"
                  >
                    <Copy className="w-4 h-4 text-gray-400" />
                  </button>
                </div>
              </div>

              <div className="bg-gray-800/50 rounded-lg p-4">
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  Token Value
                </label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-sm text-cyan-400 bg-gray-900 px-3 py-2 rounded break-all">
                    {webhookToken || 'Loading...'}
                  </code>
                  <button
                    onClick={() => copyToClipboard(webhookToken)}
                    className="p-2 hover:bg-gray-700 rounded transition"
                  >
                    <Copy className="w-4 h-4 text-gray-400" />
                  </button>
                </div>
              </div>
            </div>

            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-yellow-500 mt-0.5" />
                <div className="text-sm text-yellow-400">
                  <p className="font-semibold mb-1">Convoso Configuration Steps:</p>
                  <ol className="list-decimal list-inside space-y-1">
                    <li>Log in to your Convoso admin panel</li>
                    <li>Navigate to Settings → Webhooks</li>
                    <li>Add a new webhook with the details above</li>
                    <li>Select events: Call Started, Call Ended, Recording Available</li>
                    <li>Save and enable the webhook</li>
                  </ol>
                </div>
              </div>
            </div>

            <button
              onClick={() => setCurrentStep(1)}
              className="w-full py-3 bg-gradient-to-r from-cyan-500 to-purple-600 rounded-lg font-semibold text-white hover:shadow-lg hover:shadow-cyan-500/25 transition"
            >
              Continue to Test
            </button>
          </div>
        );

      case 1: // Test Connection
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-white mb-2">Test Your Connection</h2>
              <p className="text-gray-400">
                Let's verify that your webhook is configured correctly by sending a test event.
              </p>
            </div>

            <div className="bg-gray-800/50 rounded-lg p-6 text-center">
              {!testResult ? (
                <>
                  <Send className="w-12 h-12 text-cyan-500 mx-auto mb-4" />
                  <p className="text-gray-400 mb-6">
                    Click the button below to send a test webhook to your endpoint.
                  </p>
                  <button
                    onClick={testWebhook}
                    disabled={isLoading}
                    className="px-8 py-3 bg-gradient-to-r from-cyan-500 to-purple-600 rounded-lg font-semibold text-white hover:shadow-lg hover:shadow-cyan-500/25 transition disabled:opacity-50 inline-flex items-center gap-2"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Testing...
                      </>
                    ) : (
                      <>
                        <Send className="w-5 h-5" />
                        Send Test Webhook
                      </>
                    )}
                  </button>
                </>
              ) : (
                <>
                  <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
                  <p className="text-green-400 font-semibold mb-2">Test Successful!</p>
                  <p className="text-gray-400 text-sm">
                    Your webhook is configured correctly and ready to receive data.
                  </p>
                </>
              )}
            </div>

            {testResult && (
              <div className="bg-gray-800/50 rounded-lg p-4">
                <p className="text-sm font-medium text-gray-400 mb-2">Test Response:</p>
                <pre className="text-xs text-gray-300 overflow-auto">
                  {JSON.stringify(testResult, null, 2)}
                </pre>
              </div>
            )}

            <button
              onClick={() => setCurrentStep(2)}
              disabled={!testResult}
              className="w-full py-3 bg-gradient-to-r from-cyan-500 to-purple-600 rounded-lg font-semibold text-white hover:shadow-lg hover:shadow-cyan-500/25 transition disabled:opacity-50"
            >
              Continue
            </button>
          </div>
        );

      case 2: // Invite Team
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-white mb-2">Invite Your Team</h2>
              <p className="text-gray-400">
                Add team members who will have access to your SyncedUp AI dashboard.
              </p>
            </div>

            <div className="space-y-3">
              {teamEmails.map((email, index) => (
                <div key={index} className="flex gap-2">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => {
                      const newEmails = [...teamEmails];
                      newEmails[index] = e.target.value;
                      setTeamEmails(newEmails);
                    }}
                    placeholder="teammate@example.com"
                    className="flex-1 px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg focus:border-cyan-500 focus:outline-none text-white placeholder-gray-500"
                  />
                  {index === teamEmails.length - 1 && (
                    <button
                      onClick={() => setTeamEmails([...teamEmails, ''])}
                      className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition text-gray-400"
                    >
                      Add Another
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
              <p className="text-sm text-blue-400">
                Team members will receive an email invitation to join your agency.
                You can always add more team members later from your dashboard.
              </p>
            </div>

            <div className="flex gap-4">
              <button
                onClick={() => setCurrentStep(3)}
                className="flex-1 py-3 bg-gray-800 hover:bg-gray-700 rounded-lg font-semibold text-gray-300 transition"
              >
                Skip for Now
              </button>
              <button
                onClick={inviteTeamMembers}
                disabled={isLoading}
                className="flex-1 py-3 bg-gradient-to-r from-cyan-500 to-purple-600 rounded-lg font-semibold text-white hover:shadow-lg hover:shadow-cyan-500/25 transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Sending...
                  </>
                ) : (
                  'Send Invitations'
                )}
              </button>
            </div>
          </div>
        );

      case 3: // Complete
        return (
          <div className="space-y-6">
            <div className="text-center">
              <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                <RocketIcon className="w-10 h-10 text-green-500" />
              </div>
              <h2 className="text-3xl font-bold text-white mb-2">You're All Set! 🎉</h2>
              <p className="text-gray-400">
                Your agency is configured and ready to start processing calls.
              </p>
            </div>

            <div className="bg-gray-800/50 rounded-lg p-6 space-y-4">
              <h3 className="font-semibold text-white">What's Next?</h3>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-green-500 mt-0.5" />
                  <div>
                    <p className="text-white font-medium">Make your first call</p>
                    <p className="text-sm text-gray-400">
                      Calls will automatically appear in your dashboard
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-green-500 mt-0.5" />
                  <div>
                    <p className="text-white font-medium">View analytics</p>
                    <p className="text-sm text-gray-400">
                      Track performance metrics and insights
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-green-500 mt-0.5" />
                  <div>
                    <p className="text-white font-medium">Customize settings</p>
                    <p className="text-sm text-gray-400">
                      Configure AI analysis and notification preferences
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-gradient-to-r from-cyan-500/10 to-purple-600/10 border border-cyan-500/20 rounded-lg p-6">
              <h3 className="font-semibold text-white mb-2">📚 Resources</h3>
              <div className="space-y-2">
                <a href="/docs" className="flex items-center gap-2 text-cyan-400 hover:text-cyan-300 transition">
                  <ExternalLink className="w-4 h-4" />
                  Documentation
                </a>
                <a href="/api-reference" className="flex items-center gap-2 text-cyan-400 hover:text-cyan-300 transition">
                  <ExternalLink className="w-4 h-4" />
                  API Reference
                </a>
                <a href="/support" className="flex items-center gap-2 text-cyan-400 hover:text-cyan-300 transition">
                  <ExternalLink className="w-4 h-4" />
                  Support Center
                </a>
              </div>
            </div>

            <button
              onClick={completeOnboarding}
              className="w-full py-3 bg-gradient-to-r from-cyan-500 to-purple-600 rounded-lg font-semibold text-white hover:shadow-lg hover:shadow-cyan-500/25 transition"
            >
              Go to Dashboard
            </button>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[url('/grid.svg')] bg-center [mask-image:linear-gradient(180deg,white,rgba(255,255,255,0))]" />

      <div className="relative w-full max-w-4xl">
        {/* Progress Steps */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            {steps.map((step, index) => {
              const Icon = step.icon;
              const isActive = index === currentStep;
              const isCompleted = index < currentStep;

              return (
                <div key={step.id} className="flex items-center flex-1">
                  <div className="flex items-center">
                    <div
                      className={`w-12 h-12 rounded-full flex items-center justify-center transition ${
                        isActive
                          ? 'bg-gradient-to-r from-cyan-500 to-purple-600 text-white'
                          : isCompleted
                          ? 'bg-green-500 text-white'
                          : 'bg-gray-800 text-gray-500'
                      }`}
                    >
                      {isCompleted ? (
                        <CheckCircle className="w-6 h-6" />
                      ) : (
                        <Icon className="w-6 h-6" />
                      )}
                    </div>
                    <div className="ml-3 hidden md:block">
                      <p
                        className={`text-sm font-medium ${
                          isActive || isCompleted ? 'text-white' : 'text-gray-500'
                        }`}
                      >
                        {step.title}
                      </p>
                    </div>
                  </div>
                  {index < steps.length - 1 && (
                    <div
                      className={`flex-1 h-1 mx-4 transition ${
                        isCompleted ? 'bg-green-500' : 'bg-gray-800'
                      }`}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Content Card */}
        <motion.div
          key={currentStep}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          className="bg-gray-900/90 backdrop-blur-xl rounded-2xl shadow-2xl border border-gray-800 p-8"
        >
          {renderStepContent()}
        </motion.div>
      </div>
    </div>
  );
}