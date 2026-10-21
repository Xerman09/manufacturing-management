import {
    CalculatorBootstrapData,
    BomVersionOption,
    CalculationRequestPayload,
    CalculationResult
} from "../types";

export async function fetchCalculatorBootstrap(): Promise<CalculatorBootstrapData> {
    const res = await fetch("/api/manufacturing/overview-and-planning/raw-materials-requirement-calculator?action=bootstrap", {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
    });

    if (!res.ok) {
        let message = `Failed to load calculator setup (HTTP ${res.status})`;
        try {
            const err = await res.json();
            if (err?.error) message = err.error;
        } catch {
            // ignore
        }
        throw new Error(message);
    }

    return res.json();
}

export async function fetchProductVersions(productId: number): Promise<BomVersionOption[]> {
    const res = await fetch(
        `/api/manufacturing/overview-and-planning/raw-materials-requirement-calculator?action=versions&productId=${productId}`,
        {
            method: "GET",
            headers: { "Content-Type": "application/json" },
            cache: "no-store",
        }
    );

    if (!res.ok) {
        let message = `Failed to load BOM versions (HTTP ${res.status})`;
        try {
            const err = await res.json();
            if (err?.error) message = err.error;
        } catch {
            // ignore
        }
        throw new Error(message);
    }

    return res.json();
}

export async function calculateMaterialRequirements(
    payload: CalculationRequestPayload
): Promise<CalculationResult> {
    const res = await fetch("/api/manufacturing/overview-and-planning/raw-materials-requirement-calculator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });

    if (!res.ok) {
        let message = `Calculation failed (HTTP ${res.status})`;
        try {
            const err = await res.json();
            if (err?.error) message = err.error;
        } catch {
            // ignore
        }
        throw new Error(message);
    }

    return res.json();
}
