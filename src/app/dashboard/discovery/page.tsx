'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Key, AlertCircle, ChevronRight, Loader2, HelpCircle, Eye, EyeOff, Users, CheckCircle2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import toast from 'react-hot-toast';

interface Agent {
  user_id: string;
  name: string;
  email?: string;
  callCount: number;
  avgDuration: number;
}

type WizardStep = 'auth' | 'agents' | 'confirm';

function DiscoverySetupContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [currentStep, setCurrentStep] = useState<WizardStep>('auth');
  const [loading, setLoading] = useState(false);
  const [showAuthToken, setShowAuthToken] = useState(false);
  const [agencyName, setAgencyName] = useState('');
  const [authToken, setAuthToken] = useState('');
  const [error, setError] = useState('');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgents, setSelectedAgents] = useState<Set<string>>(new Set());
  const [loadingStage, setLoadingStage] = useState(0);
  const [progress, setProgress] = useState(0);
  const isRetry = searchParams.get('retry') === 'true';

  const loadingStages = [
    'Connecting to Convoso API',
    'Authenticating credentials',
    'Scanning last 30 days of data',
    'Filtering calls (10+ seconds only)',
    'Extracting agent information',
    'Finalizing agent profiles'
  ];

  // Smooth progress animation within each stage
  useEffect(() => {
    if (!loading) {
      setProgress(0);
      return;
    }

    const baseProgress = (loadingStage / loadingStages.length) * 100;
    const targetProgress = ((loadingStage + 0.9) / loadingStages.length) * 100; // Fill to 90% of next stage

    setProgress(baseProgress);

    // Gradually fill to target over the duration of the stage
    const duration = 500; // ms
    const steps = 20;
    const increment = (targetProgress - baseProgress) / steps;
    let currentStep = 0;

    const interval = setInterval(() => {
      currentStep++;
      if (currentStep >= steps) {
        clearInterval(interval);
      } else {
        setProgress(prev => Math.min(prev + increment, targetProgress));
      }
    }, duration / steps);

    return () => clearInterval(interval);
  }, [loadingStage, loading]);

  useEffect(() => {
    // Get agency name for personalization
    const fetchAgency = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase
          .from('user_agencies')
          .select('agencies!inner(name)')
          .eq('user_id', user.id)
          .single();
        if (data) {
          const agencies = (data as any).agencies;
          if (agencies?.name) {
            setAgencyName(agencies.name);
          }
        }
      }
    };
    fetchAgency();
  }, []);

  const validateForm = () => {
    if (!authToken.trim()) {
      setError('Auth Token is required');
      return false;
    }
    setError('');
    return true;
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setLoading(true);
    setError('');
    setLoadingStage(0);

    try {
      // Stage 0: Connecting to Convoso API (visible immediately)
      await new Promise(resolve => setTimeout(resolve, 600));
      setLoadingStage(1);

      // Stage 1: Authenticating credentials
      await new Promise(resolve => setTimeout(resolve, 500));
      setLoadingStage(2);

      // Make API call during stage 2 transition
      const storeResponse = await fetch('/api/discovery/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          convoso_auth_token: authToken.trim(),
          validate_only: true
        })
      });

      const storeData = await storeResponse.json();

      if (!storeResponse.ok) {
        throw new Error(storeData.error || 'Failed to validate credentials');
      }

      if (storeData.skipped) {
        toast.error(storeData.reason || 'Not enough data to run discovery');
        setLoading(false);
        router.push(storeData.redirectTo || '/dashboard');
        return;
      }

      // Stage 2: Scanning last 30 days
      await new Promise(resolve => setTimeout(resolve, 700));
      setLoadingStage(3);

      // Stage 3: Filtering calls
      await new Promise(resolve => setTimeout(resolve, 600));
      setLoadingStage(4);

      // Stage 4: Extracting agent information - fetch agents during this stage
      const agentsResponse = await fetch('/api/discovery/get-agents');
      const agentsData = await agentsResponse.json();

      if (!agentsResponse.ok) {
        throw new Error(agentsData.error || 'Failed to fetch agents');
      }

      if (!agentsData.agents || agentsData.agents.length === 0) {
        toast.error('No agents found with calls 10+ seconds in the last 30 days');
        setLoading(false);
        return;
      }

      // Ensure we stay on stage 4 for at least a moment before finalizing
      await new Promise(resolve => setTimeout(resolve, 400));
      setLoadingStage(5);

      // Stage 5: Finalizing
      await new Promise(resolve => setTimeout(resolve, 500));

      setAgents(agentsData.agents);

      // Select all agents by default
      const allAgentIds = new Set<string>(agentsData.agents.map((a: Agent) => a.user_id));
      setSelectedAgents(allAgentIds);

      // Move to agent selection step
      setCurrentStep('agents');
      setLoading(false);
      toast.success(`Found ${agentsData.agents.length} agents`);

    } catch (error: any) {
      toast.error(error.message);
      setLoading(false);
      setLoadingStage(0);
    }
  };

  const toggleAgent = (agentId: string) => {
    const newSelected = new Set(selectedAgents);
    if (newSelected.has(agentId)) {
      newSelected.delete(agentId);
    } else {
      newSelected.add(agentId);
    }
    setSelectedAgents(newSelected);
  };

  const toggleAllAgents = () => {
    if (selectedAgents.size === agents.length) {
      setSelectedAgents(new Set());
    } else {
      setSelectedAgents(new Set(agents.map(a => a.user_id)));
    }
  };

  const handleStartDiscovery = async () => {
    if (selectedAgents.size === 0) {
      toast.error('Please select at least one agent');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/discovery/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selected_agent_ids: Array.from(selectedAgents)
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to start discovery');
      }

      toast.success('Discovery started! Analyzing your calls...');
      router.push(`/dashboard/discovery/results?session=${data.sessionId}`);
    } catch (error: any) {
      toast.error(error.message);
      setLoading(false);
    }
  };

  const getStepNumber = (step: WizardStep) => {
    return step === 'auth' ? 1 : step === 'agents' ? 2 : 3;
  };

  const totalCallsSelected = agents
    .filter(a => selectedAgents.has(a.user_id))
    .reduce((sum, a) => sum + a.callCount, 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[url('/grid.svg')] bg-center [mask-image:linear-gradient(180deg,white,rgba(255,255,255,0))]" />
      <div className="relative max-w-4xl w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-4">
            {currentStep === 'auth' && (isRetry ? 'Retry Discovery Setup' : `Welcome to SyncedUp${agencyName ? `, ${agencyName}` : ''}!`)}
            {currentStep === 'agents' && 'Select Your Agents'}
            {currentStep === 'confirm' && 'Ready to Start Discovery'}
          </h1>
          <p className="text-xl text-gray-400">
            {currentStep === 'auth' && "Let's connect to your Convoso account and analyze your call performance"}
            {currentStep === 'agents' && 'Choose which agents to include in the analysis'}
            {currentStep === 'confirm' && "We'll analyze your selected calls and generate insights"}
          </p>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center justify-center mb-8">
          <div className="flex items-center space-x-2">
            <div className="flex items-center">
              <div className={`w-10 h-10 rounded-full ${currentStep === 'auth' ? 'bg-blue-600' : 'bg-green-600'} text-white flex items-center justify-center font-bold`}>
                {currentStep === 'auth' ? '1' : <CheckCircle2 className="w-6 h-6" />}
              </div>
              <span className={`ml-2 ${currentStep === 'auth' ? 'text-white font-medium' : 'text-green-400'}`}>Connect Convoso</span>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-500 mx-2" />
            <div className="flex items-center">
              <div className={`w-10 h-10 rounded-full ${currentStep === 'agents' ? 'bg-blue-600' : currentStep === 'confirm' ? 'bg-green-600' : 'bg-gray-700'} text-${currentStep === 'agents' || currentStep === 'confirm' ? 'white' : 'gray-400'} flex items-center justify-center font-bold`}>
                {currentStep === 'confirm' ? <CheckCircle2 className="w-6 h-6" /> : '2'}
              </div>
              <span className={`ml-2 ${currentStep === 'agents' ? 'text-white font-medium' : currentStep === 'confirm' ? 'text-green-400' : 'text-gray-400'}`}>Select Agents</span>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-500 mx-2" />
            <div className="flex items-center">
              <div className={`w-10 h-10 rounded-full ${currentStep === 'confirm' ? 'bg-blue-600' : 'bg-gray-700'} text-${currentStep === 'confirm' ? 'white' : 'gray-400'} flex items-center justify-center font-bold`}>
                3
              </div>
              <span className={`ml-2 ${currentStep === 'confirm' ? 'text-white font-medium' : 'text-gray-400'}`}>Start Analysis</span>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="bg-gray-900/50 backdrop-blur-sm rounded-2xl p-8 border border-gray-800 shadow-xl">
          {/* Step 1: Auth Token */}
          {currentStep === 'auth' && (
            <>
              {isRetry && (
                <div className="mb-6 p-4 bg-yellow-900/20 border border-yellow-800 rounded-lg">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-yellow-500 mt-0.5" />
                    <div>
                      <p className="text-yellow-200 font-medium">Previous attempt failed</p>
                      <p className="text-yellow-300/80 text-sm mt-1">
                        Please verify your Convoso credentials and try again
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="mb-6">
                <h2 className="text-2xl font-bold text-white mb-2 flex items-center gap-2">
                  <Key className="w-6 h-6 text-blue-500" />
                  Enter Your Convoso Auth Token
                </h2>
                <p className="text-gray-400">
                  We'll use this to securely access your call data
                </p>
              </div>

              <form onSubmit={handleAuthSubmit} className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Convoso Auth Token
                    <button
                      type="button"
                      className="ml-2 text-gray-500 hover:text-gray-300"
                      title="Find this in Convoso Admin → Settings → API"
                    >
                      <HelpCircle className="w-4 h-4 inline" />
                    </button>
                  </label>
                  <div className="relative">
                    <input
                      type={showAuthToken ? "text" : "password"}
                      value={authToken}
                      onChange={(e) => setAuthToken(e.target.value)}
                      className={`w-full bg-gray-800 border ${error ? 'border-red-500' : 'border-gray-700'} rounded-lg px-4 py-3 pr-12 text-white placeholder-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none`}
                      placeholder="Enter your Convoso auth token"
                      disabled={loading}
                    />
                    <button
                      type="button"
                      onClick={() => setShowAuthToken(!showAuthToken)}
                      className="absolute right-3 top-3.5 text-gray-400 hover:text-gray-200"
                    >
                      {showAuthToken ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                  {error && (
                    <p className="mt-1 text-sm text-red-400">{error}</p>
                  )}
                </div>

                {!loading ? (
                  <div className="bg-blue-900/20 border border-blue-800 rounded-lg p-4">
                    <h3 className="text-blue-200 font-medium mb-2">What happens next?</h3>
                    <ul className="text-blue-300/80 text-sm space-y-1">
                      <li>• We'll validate your auth token with Convoso</li>
                      <li>• Fetch your agents with calls from the last 30 days</li>
                      <li>• You can select which agents to include in analysis</li>
                      <li>• Only calls 10+ seconds will be analyzed</li>
                    </ul>
                  </div>
                ) : (
                  <div className="bg-gray-900/80 border border-gray-700 rounded-lg p-6 backdrop-blur-sm">
                    <div className="mb-4">
                      <div className="flex justify-between items-center mb-3">
                        <span className="text-gray-300 font-medium text-sm tracking-wide uppercase">Processing</span>
                        <span className="text-blue-400 font-bold text-sm">{Math.round(progress)}%</span>
                      </div>
                      <div className="bg-gray-800 rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-gradient-to-r from-blue-500 via-blue-600 to-purple-600 h-full transition-all duration-300 ease-out"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>

                    <div className="space-y-2.5">
                      {loadingStages.map((stage, index) => {
                        const isComplete = index < loadingStage;
                        const isCurrent = index === loadingStage;
                        const isPending = index > loadingStage;

                        return (
                          <div
                            key={index}
                            className={`flex items-center gap-3 transition-all duration-300 ${
                              isCurrent ? 'scale-105' : 'scale-100'
                            }`}
                          >
                            <div className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all duration-300 ${
                              isComplete
                                ? 'bg-green-500 border-green-500'
                                : isCurrent
                                  ? 'bg-blue-500 border-blue-500 animate-pulse'
                                  : 'bg-gray-800 border-gray-600'
                            }`}>
                              {isComplete && (
                                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                              )}
                              {isCurrent && (
                                <div className="w-2 h-2 bg-white rounded-full" />
                              )}
                            </div>
                            <span className={`text-sm transition-all duration-300 ${
                              isComplete
                                ? 'text-green-400 font-medium'
                                : isCurrent
                                  ? 'text-white font-semibold'
                                  : 'text-gray-500'
                            }`}>
                              {stage}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white font-bold py-4 px-6 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      {loadingStages[loadingStage]}
                    </>
                  ) : (
                    <>
                      Continue to Agent Selection
                      <ChevronRight className="w-5 h-5" />
                    </>
                  )}
                </button>
              </form>

              <div className="mt-8 pt-6 border-t border-gray-800">
                <p className="text-center text-gray-400 text-sm">
                  Need help finding your auth token?{' '}
                  <a
                    href="https://help.convoso.com/api"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300 underline"
                  >
                    View Convoso API docs
                  </a>
                  {' or '}
                  <a
                    href="mailto:support@syncedupsolutions.com"
                    className="text-blue-400 hover:text-blue-300 underline"
                  >
                    contact support
                  </a>
                </p>
              </div>
            </>
          )}

          {/* Step 2: Agent Selection */}
          {currentStep === 'agents' && (
            <>
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-white mb-2 flex items-center gap-2">
                  <Users className="w-6 h-6 text-blue-500" />
                  Select Agents to Analyze
                </h2>
                <p className="text-gray-400">
                  Choose which agents to include in your discovery analysis
                </p>
              </div>

              <div className="bg-blue-900/20 border border-blue-800 rounded-lg p-3 mb-6">
                <p className="text-blue-200 text-sm">
                  ℹ️ Only showing calls 10 seconds or longer for meaningful analysis
                </p>
              </div>

              {/* Select All Toggle */}
              <div className="mb-4 p-4 bg-gray-800/50 rounded-lg border border-gray-700">
                <label className="flex items-center justify-between cursor-pointer">
                  <div>
                    <span className="text-white font-medium">
                      {selectedAgents.size === agents.length ? '✓ All Agents Selected' : 'Select All Agents'}
                    </span>
                    <span className="text-gray-400 text-sm ml-2">
                      ({selectedAgents.size}/{agents.length} selected)
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={toggleAllAgents}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    {selectedAgents.size === agents.length ? 'Deselect All' : 'Select All'}
                  </button>
                </label>
              </div>

              {/* Agent Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6 max-h-96 overflow-y-auto">
                {agents.map((agent) => (
                  <div
                    key={agent.user_id}
                    onClick={() => toggleAgent(agent.user_id)}
                    className={`p-4 rounded-lg border-2 transition-all cursor-pointer ${
                      selectedAgents.has(agent.user_id)
                        ? 'border-blue-500 bg-blue-900/20'
                        : 'border-gray-700 bg-gray-800/30 hover:border-gray-600'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center ${
                        selectedAgents.has(agent.user_id)
                          ? 'bg-blue-600 border-blue-600'
                          : 'border-gray-500'
                      }`}>
                        {selectedAgents.has(agent.user_id) && (
                          <CheckCircle2 className="w-4 h-4 text-white" />
                        )}
                      </div>
                      <div className="flex-1">
                        <h3 className="text-white font-medium">{agent.name}</h3>
                        {agent.email && (
                          <p className="text-gray-400 text-sm">{agent.email}</p>
                        )}
                        <p className="text-gray-500 text-sm mt-1">
                          📞 {agent.callCount} calls (10+ sec) · Avg {agent.avgDuration}s
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Summary */}
              <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4 mb-6">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400">Selected Agents:</span>
                  <span className="text-white font-medium">{selectedAgents.size}</span>
                </div>
                <div className="flex items-center justify-between text-sm mt-2">
                  <span className="text-gray-400">Total Calls to Analyze:</span>
                  <span className="text-white font-medium">~{totalCallsSelected}</span>
                </div>
              </div>

              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={() => setCurrentStep('auth')}
                  className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-bold py-4 px-6 rounded-lg transition-colors"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleStartDiscovery}
                  disabled={selectedAgents.size === 0 || loading}
                  className="flex-1 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-bold py-4 px-6 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Starting Analysis...
                    </>
                  ) : (
                    <>
                      Start Discovery Analysis
                      <ChevronRight className="w-5 h-5" />
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function DiscoverySetupPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    }>
      <DiscoverySetupContent />
    </Suspense>
  );
}
