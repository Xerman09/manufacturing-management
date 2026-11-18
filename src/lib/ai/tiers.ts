/**
 * AI Subscription Tiers & Resource Entitlement Policies
 * Always leave behind comments on all changes and development of workflows for efficient long-term coding
 *
 * Enforces:
 * - Subscription tier ceilings (basic, pro, executive)
 * - Maximum token budgets per tier to avoid unexpected API overages
 * - Prevention of unauthorized privilege escalation
 */

import { GlobalAiTierSlug, TierPolicy } from './types';

/**
 * Global Tier Policies defining capabilities and budget constraints
 */
export const TIER_POLICIES: Record<GlobalAiTierSlug, TierPolicy> = {
    basic: {
        slug: 'basic',
        level: 1,
        name: 'Basic Operational',
        maxTokens: 800,
        temperature: 0.2,
        allowedFeatures: ['summary', 'keyExposures', 'strategicActions'],
    },
    pro: {
        slug: 'pro',
        level: 2,
        name: 'Pro Diagnostic',
        maxTokens: 1500,
        temperature: 0.2,
        allowedFeatures: ['summary', 'keyExposures', 'strategicActions', 'rootCauseAnalysis'],
    },
    executive: {
        slug: 'executive',
        level: 3,
        name: 'Executive Strategic',
        maxTokens: 3000,
        temperature: 0.25,
        allowedFeatures: [
            'summary',
            'keyExposures',
            'strategicActions',
            'rootCauseAnalysis',
            'negotiationNotes',
            'contractualLeverage',
        ],
    },
};

/**
 * Resolves authorized tier for user, clamping requests to their subscription ceiling
 * Prevents client-side tampering where a Basic subscriber asks for an Executive prompt
 *
 * @param userSubscriptionLevel Numeric subscription rank (1: basic, 2: pro, 3: executive)
 * @param requestedTier The tier requested by the module
 * @returns Validated TierPolicy
 */
export function resolveAuthorizedTier(
    userSubscriptionLevel: number = 1,
    requestedTier: GlobalAiTierSlug = 'basic'
): TierPolicy {
    const policy = TIER_POLICIES[requestedTier] || TIER_POLICIES.basic;

    // If user's subscription level is less than the requested tier level, clamp down to their maximum allowed tier
    if (userSubscriptionLevel < policy.level) {
        if (userSubscriptionLevel >= 2) {
            return TIER_POLICIES.pro;
        }
        return TIER_POLICIES.basic;
    }

    return policy;
}

