/**
 * AI Governance & Human-in-the-Loop (HITL) Standards
 * Always leave behind comments on all changes and development of workflows for efficient long-term coding
 *
 * Implements:
 * - EU AI Act Article 14 (Human Oversight) guarantees
 * - Non-bypassable legal disclaimer injection
 * - Universal base system prompt boundary constraints preventing autonomous execution
 */

import { AiGovernanceMetadata } from './types';

export const STANDARD_LEGAL_DISCLAIMER =
    'AI insights and recommendations are strictly advisory and require human review. They do not post ERP transactions, modify inventory states, or alter contractual agreements.';

/**
 * Universal base system instructions injected across all AI modules
 * Strictly enforces that LLM remains an advisory copilot, not a decider
 */
export const BASE_GOVERNANCE_DIRECTIVES = `
You are an expert AI Analyst supporting enterprise operations in the Industrial Distribution System (IDS).
STRICT OPERATIONAL & GOVERNANCE BOUNDARIES:
1. ADVISORY ONLY: You have zero authorization to execute transactions, post database changes, or cancel orders.
2. HUMAN-IN-THE-LOOP (EU AI Act Article 14): Your outputs are purely analytical suggestions subject to human validation.
3. OBJECTIVE DATA GROUNDING: Base all assertions strictly on the empirical metrics provided. Never fabricate numbers or operational records.
4. PRIVACY: Never ask for or output confidential passwords, banking tokens, or personal identifiers.
`;

/**
 * Generates immutable governance metadata for an AI response
 */
export function createGovernanceMetadata(
    modelUsed: string,
    isFallback: boolean = false,
    customDisclaimer?: string
): AiGovernanceMetadata {
    return {
        isAdvisoryOnly: true,
        requiresHumanReview: true,
        disclaimer: customDisclaimer || STANDARD_LEGAL_DISCLAIMER,
        modelUsed,
        isFallback,
        generatedAt: new Date().toISOString(),
    };
}

