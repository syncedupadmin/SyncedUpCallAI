// Discovery Engine - Pattern Recognition and Analysis System

export interface LyingPattern {
  type: 'dental_scam' | 'price_deception' | 'feature_misrepresentation' | 'customer_contradiction';
  pattern: string;
  markers: string[];
  examples: string[];
  severity: 'high' | 'medium' | 'low';
}

// Specific lying patterns for dental/insurance scams
export const LYING_PATTERNS: LyingPattern[] = [
  {
    type: 'dental_scam',
    pattern: 'Free dental services that are not actually free',
    markers: [
      'free dental exam',
      'free cleanings',
      'complimentary x-rays',
      'no cost bite wing',
      'included at no charge',
      'absolutely free'
    ],
    examples: [
      'Agent: "You get free dental exams twice a year" (but requires paid membership)',
      'Agent: "Cleanings are completely free" (but has copays)',
      'Agent: "Bite wing x-rays included at no cost" (but billed separately)'
    ],
    severity: 'high'
  },
  {
    type: 'price_deception',
    pattern: 'Misleading or changing prices during the call',
    markers: [
      'only costs',
      'just pays',
      'low as',
      'starting at',
      'mumbled price',
      'rushed pricing'
    ],
    examples: [
      'Early: "Only $49/month" → Later: "$89 with fees"',
      'Vague: "It\'s very affordable" when asked for specific price',
      'Hidden: Mentions price quickly or unclearly'
    ],
    severity: 'high'
  },
  {
    type: 'feature_misrepresentation',
    pattern: 'Promising features or coverage that doesn\'t exist',
    markers: [
      'covers everything',
      'no limitations',
      'unlimited',
      'all procedures',
      'any doctor',
      'nationwide coverage'
    ],
    examples: [
      'Agent: "This covers all dental procedures" (many exclusions)',
      'Agent: "You can see any dentist" (network restrictions)',
      'Agent: "No waiting periods" (has waiting periods)'
    ],
    severity: 'medium'
  },
  {
    type: 'customer_contradiction',
    pattern: 'Customer provides conflicting information',
    markers: [
      'earlier you said',
      'but you mentioned',
      'I thought you said',
      'wait, you have',
      'defensive response',
      'story changes'
    ],
    examples: [
      'Customer: "I don\'t have insurance" → Later: "My current plan..."',
      'Customer: "I\'m healthy" → Later: "My medications..."'
    ],
    severity: 'low'
  }
];

// Opening quality scoring system
export interface OpeningAnalysis {
  duration: number; // seconds until first customer response
  greeting_quality: number; // 0-100
  permission_asked: boolean;
  company_mentioned: boolean;
  agent_name_given: boolean;
  purpose_stated: boolean;
  energy_level: 'high' | 'medium' | 'low';
  customer_response: 'positive' | 'neutral' | 'negative' | 'hangup';
  score: number; // 0-100
}

export const analyzeOpening = (transcript: string, duration: number): OpeningAnalysis => {
  const firstMinute = transcript.substring(0, 1000); // Approximate first minute

  const analysis: OpeningAnalysis = {
    duration: 0,
    greeting_quality: 0,
    permission_asked: false,
    company_mentioned: false,
    agent_name_given: false,
    purpose_stated: false,
    energy_level: 'medium',
    customer_response: 'neutral',
    score: 0
  };

  // Check components
  analysis.company_mentioned = /(?:calling from|with|representing)\s+\w+/i.test(firstMinute);
  analysis.agent_name_given = /(?:my name is|this is|I'm)\s+\w+/i.test(firstMinute);
  analysis.permission_asked = /(?:do you have|can I have|is this a good time|few minutes)/i.test(firstMinute);
  analysis.purpose_stated = /(?:calling about|regarding|to discuss|to help you with)/i.test(firstMinute);

  // Detect energy level
  if (/!|excited|fantastic|wonderful|great/i.test(firstMinute)) {
    analysis.energy_level = 'high';
  } else if (/um|uh|sorry/i.test(firstMinute)) {
    analysis.energy_level = 'low';
  }

  // Detect customer response
  if (duration < 5) {
    analysis.customer_response = 'hangup';
    analysis.score = 0;
  } else {
    // Calculate score
    let score = 50; // Base score
    if (analysis.company_mentioned) score += 15;
    if (analysis.agent_name_given) score += 10;
    if (analysis.permission_asked) score += 15;
    if (analysis.purpose_stated) score += 10;
    if (analysis.energy_level === 'high') score += 10;
    if (analysis.energy_level === 'low') score -= 10;
    if (analysis.customer_response === 'hangup') score = 0;

    analysis.score = Math.min(100, Math.max(0, score));
  }

  return analysis;
};

// Rebuttal tracking
export interface RebuttalAnalysis {
  objection_count: number;
  rebuttal_attempts: number;
  gave_up_count: number; // Times agent didn't attempt rebuttal
  successful_rebuttals: number;
  common_objections: string[];
  weak_points: string[]; // Where agents commonly give up
}

export const analyzeRebuttals = (transcript: string): RebuttalAnalysis => {
  const analysis: RebuttalAnalysis = {
    objection_count: 0,
    rebuttal_attempts: 0,
    gave_up_count: 0,
    successful_rebuttals: 0,
    common_objections: [],
    weak_points: []
  };

  // Common objections
  const objectionPatterns = [
    /not interested/i,
    /already have/i,
    /too expensive/i,
    /don't need/i,
    /no thanks/i,
    /can't afford/i,
    /bad time/i,
    /spouse.*decide/i,
    /think about it/i
  ];

  // Rebuttal indicators
  const rebuttalIndicators = [
    /I understand/i,
    /let me explain/i,
    /actually/i,
    /but what if/i,
    /however/i,
    /the reason/i,
    /just to clarify/i,
    /before you go/i
  ];

  // Giving up indicators
  const giveUpIndicators = [
    /okay.*thank you/i,
    /alright.*bye/i,
    /no problem/i,
    /have a.*day/i,
    /I'll let you go/i,
    /sorry to bother/i
  ];

  // Split transcript into exchanges
  const lines = transcript.split('\n');

  for (let i = 0; i < lines.length - 1; i++) {
    const currentLine = lines[i];
    const nextLine = lines[i + 1] || '';

    // Check for objections
    const hasObjection = objectionPatterns.some(pattern => pattern.test(currentLine));
    if (hasObjection) {
      analysis.objection_count++;

      // Check if agent attempted rebuttal
      const attemptedRebuttal = rebuttalIndicators.some(pattern => pattern.test(nextLine));
      const gaveUp = giveUpIndicators.some(pattern => pattern.test(nextLine));

      if (attemptedRebuttal) {
        analysis.rebuttal_attempts++;
      } else if (gaveUp) {
        analysis.gave_up_count++;
        analysis.weak_points.push(currentLine.substring(0, 50) + '...');
      }
    }
  }

  return analysis;
};

// Hangup detection (especially early hangups)
export interface HangupAnalysis {
  total_hangups: number;
  early_hangups: number; // Within 15 seconds
  instant_hangups: number; // Within 5 seconds
  agent_caused_hangups: number; // Agent hanging up on "hello"
  hangup_timestamps: number[]; // Seconds into call
  average_hangup_time: number;
}

export const detectHangups = (calls: any[]): HangupAnalysis => {
  const analysis: HangupAnalysis = {
    total_hangups: 0,
    early_hangups: 0,
    instant_hangups: 0,
    agent_caused_hangups: 0,
    hangup_timestamps: [],
    average_hangup_time: 0
  };

  for (const call of calls) {
    const duration = call.duration_sec || 0;

    // Check for hangup indicators
    if (call.disposition === 'HUNG_UP' || call.disposition === 'HANGUP' || duration < 30) {
      analysis.total_hangups++;
      analysis.hangup_timestamps.push(duration);

      if (duration <= 5) {
        analysis.instant_hangups++;

        // Check if agent caused it (customer says hello but no response)
        if (call.transcript?.includes('Hello') && !call.transcript?.includes('Hi') && !call.transcript?.includes('Good')) {
          analysis.agent_caused_hangups++;
        }
      } else if (duration <= 15) {
        analysis.early_hangups++;
      }
    }
  }

  if (analysis.hangup_timestamps.length > 0) {
    analysis.average_hangup_time =
      analysis.hangup_timestamps.reduce((a, b) => a + b, 0) / analysis.hangup_timestamps.length;
  }

  return analysis;
};

// Main discovery processor
export interface DiscoverySession {
  id: string;
  status: 'initializing' | 'pulling' | 'analyzing' | 'complete' | 'error';
  progress: number;
  processed: number;
  total: number;
  startTime: Date;
  metrics: {
    closeRate: number;
    pitchesDelivered: number;
    successfulCloses: number;
    openingScore: number;
    rebuttalFailures: number;
    hangupRate: number;
    earlyHangups: number;
    lyingDetected: number;
    agentMetrics: any[];
  };
  insights: string[];
  errors: string[];
}

// Pattern detection prompts for GPT-4
export const DISCOVERY_PROMPTS = {
  lying_detection: `
    Analyze this transcript for potential deception or misrepresentation.
    Focus especially on:
    1. Free dental/medical services that aren't actually free
    2. Price changes or vague pricing
    3. Overpromising features or coverage
    4. Contradictions in customer or agent statements

    Look for these specific phrases:
    - "free dental exam" "free cleanings" "bite wing x-ray"
    - Price mentioned early differs from price mentioned later
    - "Covers everything" when there are exclusions

    Return specific quotes and timestamps where deception occurs.
    Rate severity: HIGH (outright lies), MEDIUM (misleading), LOW (vague)
  `,

  opening_analysis: `
    Analyze the first 30 seconds of this call.
    Score the opening based on:
    1. Did agent state their name and company?
    2. Did they ask permission to continue?
    3. Energy level and enthusiasm
    4. How quickly did customer respond positively/negatively?
    5. If customer hung up in <5 seconds, why?

    Return an opening score 0-100 and specific issues found.
  `,

  rebuttal_tracking: `
    Find all customer objections and agent responses.
    For each objection:
    1. What was the objection?
    2. Did agent attempt a rebuttal?
    3. If no rebuttal, did they give up immediately?
    4. Was the rebuttal successful?

    Count how many times agents gave up without trying.
    Identify weak points where agents commonly surrender.
  `,

  pattern_discovery: `
    Compare successful calls (SALE disposition) vs failed calls.
    Find:
    1. What successful agents say that failed ones don't
    2. Average time to each transition point
    3. Key phrases that correlate with success
    4. Where calls commonly fail

    Don't assume standard segments - discover THIS business's actual structure.
  `
};