import type { DashboardBranch } from "../types/operations-dashboard.types";

export function eligibleDashboardBranches(rows: Array<Record<string, unknown>>): DashboardBranch[] {
    const unique = new Map<number, DashboardBranch>();
    for (const row of rows) {
        const id = Number(row.id);
        const name = String(row.branch_name ?? "").trim();
        if (!Number.isSafeInteger(id) || id <= 0 || !name || Number(row.isActive) !== 1 || Number(row.isBadStock) === 1) continue;
        if (!unique.has(id)) unique.set(id, { id, branch_name: name, branch_code: String(row.branch_code ?? "").trim() });
    }
    return [...unique.values()].sort((a, b) => a.branch_name.localeCompare(b.branch_name) || a.branch_code.localeCompare(b.branch_code) || a.id - b.id);
}

export function dashboardBranchOptions(branches: DashboardBranch[]) {
    const labels = branches.map(branch => `${branch.branch_name} (${branch.branch_code || `ID: ${branch.id}`})`);
    const counts = new Map<string, number>();
    labels.forEach(label => counts.set(label.toLowerCase(), (counts.get(label.toLowerCase()) ?? 0) + 1));
    return branches.map((branch, index) => ({
        value: String(branch.id),
        label: (counts.get(labels[index].toLowerCase()) ?? 0) > 1 ? `${labels[index]} [ID: ${branch.id}]` : labels[index],
    }));
}
