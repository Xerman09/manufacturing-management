/**
 * Core AI Client & Execution Engine
 * Always leave behind comments on all changes and development of workflows for efficient long-term coding
 *
 * Implements:
 * - Enterprise model orchestration with automatic fallback cascade
 * - GDPR sanitization of inputs
 * - EU AI Act Article 14 Human-in-the-Loop governance metadata
 * - Zero-crash deterministic fallback guarantee
 */

import { GoogleGenAI } from '@google/genai';
import { CoreAiRequestOptions, CoreAiResponse } from './types';
import { resolveAuthorizedTier } from './tiers';
import { sanitizePayload, redactPiiFromString } from './guardrails';
import { BASE_GOVERNANCE_DIRECTIVES, createGovernanceMetadata } from './governance';
import { recordAiTelemetry } from './telemetry';

const PRIMARY_MODEL = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
const FALLBACK_MODEL = 'gemini-2.5-flash-lite';

/**
 * Cleanly strips markdown code fences and parses JSON safely
 */
export function parseJsonSafe<T = unknown>(text: string): T | null {
    try {
        const cleaned = text
            .replace(/^```json/im, '')
            .replace(/^```/im, '')
            .replace(/```$/im, '')
            .trim();
        return JSON.parse(cleaned) as T;
    } catch {
        return null;
    }
}

/**
 * Primary Core execution function for all modules
 * Sanitizes input with a dual-pass defense (structured object + final compiled prompt string),
 * enforces tier entitlements, coordinates model calls with fallbacks,
 * and attaches standard governance and human-in-the-loop metadata.
 */
export async function runCoreAiAnalysis<TPayload, TResult>(
    options: CoreAiRequestOptions<TPayload, TResult>,
    userSubscriptionLevel: number = 1
): Promise<CoreAiResponse<TResult>> {
    const startTime = Date.now();
    const authorizedTier = resolveAuthorizedTier(userSubscriptionLevel, options.tierSlug);

    // 1. GDPR Sanitization Pass 1: Structured Object Scrubbing (Key stripping & data minimization)
    const sanitizedPayload = sanitizePayload(options.payload, options.sanitization);

    const apiKey = process.env.GEMINI_API_KEY;

    // 2. Check for missing API Key -> immediate deterministic fallback
    if (!apiKey) {
        console.warn(`[Core AI Engine] No GEMINI_API_KEY found. Routing ${options.moduleName} to deterministic fallback.`);
        const fallbackData = options.fallbackEngine(sanitizedPayload, authorizedTier);
        recordAiTelemetry({
            moduleName: options.moduleName,
            tier: authorizedTier.slug,
            model: 'Deterministic Rule Engine (Offline)',
            isFallback: true,
            durationMs: Date.now() - startTime,
            success: true,
        });

        return {
            data: fallbackData,
            governance: createGovernanceMetadata('Deterministic Rule Engine (Offline)', true),
            tier: authorizedTier,
        };
    }

    // 3. Prepare AI Prompt & Directives
    const ai = new GoogleGenAI({ apiKey });
    const fullSystemInstruction = `${BASE_GOVERNANCE_DIRECTIVES}\n${options.domainSystemInstruction}`;

    // GDPR Sanitization Pass 2: Defense-in-depth string scrubbing on compiled user prompt
    // Guarantees no PII escapes even if template interpolations or raw strings are injected by module developers
    const rawCompiledPrompt = options.buildPrompt(sanitizedPayload);
    const userPrompt = redactPiiFromString(rawCompiledPrompt);

    let rawText = '';
    let usedModel = PRIMARY_MODEL;
    let isFallback = false;

    // 4. Attempt 1: Primary Model
    try {
        const result = await ai.models.generateContent({
            model: PRIMARY_MODEL,
            contents: userPrompt,
            config: {
                systemInstruction: fullSystemInstruction,
                temperature: authorizedTier.temperature,
                maxOutputTokens: authorizedTier.maxTokens,
            },
        });
        rawText = result.text || '';
    } catch (primaryErr: unknown) {
        console.warn(`[Core AI Engine] Primary model ${PRIMARY_MODEL} failed for ${options.moduleName}:`, primaryErr);

        // Attempt 2: Fallback Model with slight delay
        try {
            await new Promise((resolve) => setTimeout(resolve, 800));
            usedModel = FALLBACK_MODEL;
            isFallback = true;
            console.info(`[Core AI Engine] Retrying ${options.moduleName} with fallback model: ${FALLBACK_MODEL}...`);

            const fallbackResult = await ai.models.generateContent({
                model: FALLBACK_MODEL,
                contents: userPrompt,
                config: {
                    systemInstruction: fullSystemInstruction,
                    temperature: authorizedTier.temperature,
                    maxOutputTokens: authorizedTier.maxTokens,
                },
            });
            rawText = fallbackResult.text || '';
        } catch (fallbackErr: unknown) {
            console.error(`[Core AI Engine] Remote models failed. Invoking deterministic fallback:`, fallbackErr);
            const fallbackData = options.fallbackEngine(sanitizedPayload, authorizedTier);
            recordAiTelemetry({
                moduleName: options.moduleName,
                tier: authorizedTier.slug,
                model: 'Deterministic Rule Engine (Spike/Failover)',
                isFallback: true,
                durationMs: Date.now() - startTime,
                success: true,
                error: String(fallbackErr),
            });

            return {
                data: fallbackData,
                governance: createGovernanceMetadata('Deterministic Rule Engine (Failover)', true),
                tier: authorizedTier,
            };
        }
    }

    // 5. Parse response using custom parser or safe JSON
    let parsedData: TResult | null = null;
    if (options.parseResponse) {
        parsedData = options.parseResponse(rawText);
    } else {
        parsedData = parseJsonSafe<TResult>(rawText);
    }

    // 6. If parsing failed, fallback to deterministic engine to prevent client crashing
    if (!parsedData) {
        console.warn(`[Core AI Engine] Output from ${usedModel} could not be parsed. Using deterministic engine.`);
        const fallbackData = options.fallbackEngine(sanitizedPayload, authorizedTier);
        return {
            data: fallbackData,
            governance: createGovernanceMetadata(`${usedModel} (Parsed as Fallback)`, true),
            tier: authorizedTier,
        };
    }

    recordAiTelemetry({
        moduleName: options.moduleName,
        tier: authorizedTier.slug,
        model: usedModel,
        isFallback,
        durationMs: Date.now() - startTime,
        success: true,
    });

    return {
        data: parsedData,
        governance: createGovernanceMetadata(usedModel, isFallback),
        tier: authorizedTier,
    };
}

