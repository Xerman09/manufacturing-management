/**
 * GDPR & Enterprise Data Privacy Guardrails
 * Always leave behind comments on all changes and development of workflows for efficient long-term coding
 *
 * Implements:
 * - GDPR Article 5(1)(c) Data Minimization: Array length capping
 * - GDPR Article 6 & 9: Stripping sensitive financial/PII keys
 * - PII Masking: Redacting emails, phone numbers, and IP addresses via regex
 */

import { SanitizationOptions } from './types';

/**
 * Standard sensitive key patterns to recursively strip from any object before LLM ingestion
 */
const DEFAULT_SENSITIVE_KEY_PATTERNS = [
    /password/i,
    /secret/i,
    /token/i,
    /api[-_]?key/i,
    /bearer/i,
    /bank/i,
    /account[-_]?no/i,
    /account[-_]?number/i,
    /iban/i,
    /swift/i,
    /tin/i,
    /ssn/i,
    /tax[-_]?id/i,
    /credit[-_]?card/i,
    /cvv/i,
    /salary/i,
    /pin/i,
];

/**
 * Regular expressions for matching PII patterns in string fields
 */
const PII_PATTERNS = {
    email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    phone: /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
    ipv4: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
};

/**
 * Redacts common PII patterns in strings
 */
export function redactPiiFromString(text: string): string {
    if (!text || typeof text !== 'string') return text;
    return text
        .replace(PII_PATTERNS.email, '[EMAIL_REDACTED]')
        .replace(PII_PATTERNS.phone, '[PHONE_REDACTED]')
        .replace(PII_PATTERNS.ipv4, '[IP_REDACTED]');
}

/**
 * Recursively scrubs an object or array to remove sensitive keys and redact PII
 *
 * @param data The raw data structure
 * @param options Sanitization options
 * @returns Clean, privacy-compliant cloned object
 */
export function sanitizePayload<T>(data: T, options?: SanitizationOptions): T {
    const stripKeys = options?.stripSensitiveKeys ?? true;
    const redactPii = options?.redactPii ?? true;
    const maxItemsCap = options?.maxItemsCap ?? 30;
    const customBlockedKeys = options?.customBlockedKeys || [];

    function isKeySensitive(key: string): boolean {
        if (customBlockedKeys.some((cbk) => cbk.toLowerCase() === key.toLowerCase())) {
            return true;
        }
        return DEFAULT_SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
    }

    function processValue(val: unknown): unknown {
        if (val === null || val === undefined) return val;

        if (typeof val === 'string') {
            return redactPii ? redactPiiFromString(val) : val;
        }

        if (Array.isArray(val)) {
            // Apply GDPR Article 5(1)(c) Data Minimization cap on arrays
            const capped = val.slice(0, maxItemsCap);
            return capped.map(processValue);
        }

        if (typeof val === 'object') {
            const cleanObj: Record<string, unknown> = {};
            for (const [k, v] of Object.entries(val)) {
                if (stripKeys && isKeySensitive(k)) {
                    continue; // Skip sensitive key completely
                }
                cleanObj[k] = processValue(v);
            }
            return cleanObj;
        }

        return val;
    }

    return processValue(data) as T;
}

