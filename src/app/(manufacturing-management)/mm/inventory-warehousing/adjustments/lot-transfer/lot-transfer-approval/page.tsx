import { redirect } from "next/navigation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function LotTransferApprovalPage() {
    redirect("/mm/inventory-warehousing/adjustments/lot-transfer/lot-transfer-posting");
}
export const metadata = {
    title: "Lot Transfer Approval | Manufacturing Management",
    description: "Approve lot transfers within the Manufacturing Management."
};