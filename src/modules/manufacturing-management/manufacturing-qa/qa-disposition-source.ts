// Existing inspection remarks carry provenance without changing the external schema.
export function qaDispositionSource(ledgerId: number): string {
    return `[daily-qa-ledger:${ledgerId}]`;
}

export function isDispositionForYield(disposition: Record<string, unknown>, ledgerId: number): boolean {
    return String(disposition.inspection_remarks || "").startsWith(qaDispositionSource(ledgerId) + "\n");
}
