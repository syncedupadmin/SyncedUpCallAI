/**
 * Stripe Configuration and Plan Definitions
 */

export const STRIPE_CONFIG = {
  apiVersion: '2025-08-27.basil' as const,
  currency: 'usd',
  trialDays: 14,
  webhookEndpoint: '/api/stripe/webhook'
};

export const PLANS = {
  starter: {
    id: 'starter',
    name: 'Starter',
    description: 'Perfect for small teams getting started',
    price: 297,
    priceId: process.env.NEXT_PUBLIC_STRIPE_STARTER_PRICE_ID!,
    features: {
      calls: 1000,
      transcriptionMinutes: 5000,
      teamMembers: 5,
      storage: 50, // GB
      support: 'email',
      apiAccess: false,
      customIntegrations: false,
      advancedAnalytics: false
    },
    limits: {
      dailyCalls: 50,
      concurrentProcessing: 2
    }
  },
  growth: {
    id: 'growth',
    name: 'Growth',
    description: 'For growing agencies with higher volume',
    price: 597,
    priceId: process.env.NEXT_PUBLIC_STRIPE_GROWTH_PRICE_ID!,
    popular: true,
    features: {
      calls: 5000,
      transcriptionMinutes: 25000,
      teamMembers: 15,
      storage: 200, // GB
      support: 'priority',
      apiAccess: true,
      customIntegrations: false,
      advancedAnalytics: true
    },
    limits: {
      dailyCalls: 250,
      concurrentProcessing: 5
    }
  },
  scale: {
    id: 'scale',
    name: 'Scale',
    description: 'For high-volume operations',
    price: 997,
    priceId: process.env.NEXT_PUBLIC_STRIPE_SCALE_PRICE_ID!,
    features: {
      calls: 15000,
      transcriptionMinutes: 75000,
      teamMembers: 50,
      storage: 500, // GB
      support: 'dedicated',
      apiAccess: true,
      customIntegrations: true,
      advancedAnalytics: true
    },
    limits: {
      dailyCalls: 1000,
      concurrentProcessing: 10
    }
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    description: 'Custom solutions for large organizations',
    price: null, // Custom pricing
    priceId: null,
    custom: true,
    features: {
      calls: 'unlimited',
      transcriptionMinutes: 'unlimited',
      teamMembers: 'unlimited',
      storage: 'unlimited',
      support: '24/7',
      apiAccess: true,
      customIntegrations: true,
      advancedAnalytics: true,
      whiteLabel: true,
      sla: true
    },
    limits: {
      dailyCalls: null,
      concurrentProcessing: null
    }
  }
} as const;

export type PlanId = keyof typeof PLANS;
export type Plan = typeof PLANS[PlanId];

// Metered billing metrics
export const USAGE_METRICS = {
  calls_processed: {
    name: 'Calls Processed',
    unit: 'call',
    overage_price: 0.50 // per call over limit
  },
  minutes_transcribed: {
    name: 'Minutes Transcribed',
    unit: 'minute',
    overage_price: 0.02 // per minute over limit
  },
  storage_gb: {
    name: 'Storage Used',
    unit: 'GB',
    overage_price: 0.10 // per GB over limit
  }
} as const;

export type UsageMetric = keyof typeof USAGE_METRICS;

// Helper functions
export function getPlanById(planId: string): Plan | undefined {
  return PLANS[planId as PlanId];
}

export function getPlanByPriceId(priceId: string): Plan | undefined {
  return Object.values(PLANS).find(plan => plan.priceId === priceId);
}

export function formatPrice(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0
  }).format(cents / 100);
}

export function calculateOverage(
  metric: UsageMetric,
  used: number,
  limit: number
): { overage: number; cost: number } {
  const overage = Math.max(0, used - limit);
  const cost = overage * USAGE_METRICS[metric].overage_price;
  return { overage, cost };
}