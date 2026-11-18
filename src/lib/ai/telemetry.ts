/**
 * AI Telemetry & Observability (Privacy Preserving)
 * Always leave behind comments on all changes and development of workflows for efficient long-term coding
 *
 * Implements:
 * - Latency, token usage, and model tracking
 * - Strict GDPR compliance: Deliberately DOES NOT log prompt contents or business data
 */

export interface AiTelemetryEvent {
    moduleName: string;
    tier: string;
    model: string;
    isFallback: boolean;
    durationMs: number;
    promptTokenEstimate?: number;
    responseTokenEstimate?: number;
    success: boolean;
    error?: string;
}

/**
 * Logs AI operations telemetry without persisting sensitive inputs
 */
export function recordAiTelemetry(event: AiTelemetryEvent): void {
    // In production, forward this to CloudWatch, Datadog, or OpenTelemetry
    const status = event.success ? 'SUCCESS' : 'FAILED';
    const fallbackTag = event.isFallback ? '[FALLBACK]' : '[LIVE]';

    if (!event.success) {
        console.warn(
            `[AI Telemetry] ${fallbackTag} ${event.moduleName} (${event.tier}) - ${status} in ${event.durationMs}ms - Error: ${event.error}`
        );
    } else {
        console.info(
            `[AI Telemetry] ${fallbackTag} ${event.moduleName} (${event.tier}) - Model: ${event.model} - ${event.durationMs}ms`
        );
    }
}

