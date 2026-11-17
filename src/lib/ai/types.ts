/**
 * Core AI Type Definitions
 * Always leave behind comments on all changes and development of workflows for efficient long-term coding
 *
 * Implements contracts for:
 * - Subscription tiers and entitlements
 * - GDPR sanitization options
 * - Human-in-the-Loop (HITL) and EU AI Act Article 14 governance metadata
 * - Core AI execution requests and responses
 */

export type GlobalAiTierSlug = 'basic' | 'pro' | 'executive';

/**
 * Standard governance metadata for EU AI Act Article 14 & HITL compliance
 */
export interface AiGovernanceMetadata {
    /** True to confirm outputs are non-binding and non-executable */
    isAdvisoryOnly: boolean;
    /** Enforces explicit human approval before any operational decision is taken */
    requiresHumanReview: boolean;
    /** Legal advisory notice displayed in UI and audit reports */
    disclaimer: string;
    /** Model provenance and fallback indicator */
    modelUsed: string;
    /** Indicates if response was produced by rule-based deterministic fallback */
    isFallback: boolean;
    /** Timestamp when analysis was generated */
    generatedAt: string;
}

/**
 * Tier Policy defining resource ceilings and permissions per subscription level
 */
export interface TierPolicy {
    slug: GlobalAiTierSlug;
    level: number;
    name: string;
    maxTokens: number;
    temperature: number;
    allowedFeatures: string[];
}

/**
 * Configuration options for payload sanitization and GDPR compliance
 */
export interface SanitizationOptions {
    /** Strip sensitive object keys like password, bank, tin, ssn */
    stripSensitiveKeys?: boolean;
    /** Redact emails, phone numbers, IP addresses with regex */
    redactPii?: boolean;
    /** Max array items allowed to prevent accidental bulk data exposure (GDPR Article 5) */
    maxItemsCap?: number;
    /** Additional custom sensitive field keys to redact */
    customBlockedKeys?: string[];
}

/**
 * Core Request payload passed into runCoreAiAnalysis
 */
export interface CoreAiRequestOptions<TPayload, TResult> {
    /** Name of calling module for telemetry, auditing, and rate limiting */
    moduleName: string;
    /** The user's active subscription tier slug */
    tierSlug: GlobalAiTierSlug;
    /** Raw payload from module to be sanitized before sending to LLM */
    payload: TPayload;
    /** System instruction specific to module domain */
    domainSystemInstruction: string;
    /** Formatted user prompt text or function to build it from sanitized data */
    buildPrompt: (sanitizedData: TPayload) => string;
    /** Deterministic offline fallback engine function when LLM calls fail or API key is absent */
    fallbackEngine: (sanitizedData: TPayload, tier: TierPolicy) => TResult;
    /** Custom validator or parser for the LLM response */
    parseResponse?: (rawText: string) => TResult | null;
    /** Sanitization overrides */
    sanitization?: SanitizationOptions;
}

/**
 * Standard Core AI Response wrapper containing result and governance metadata
 */
export interface CoreAiResponse<TResult> {
    data: TResult;
    governance: AiGovernanceMetadata;
    tier: TierPolicy;
}

