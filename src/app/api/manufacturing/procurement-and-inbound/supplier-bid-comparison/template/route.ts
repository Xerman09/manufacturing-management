import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
    const csvHeader = [
        "Supplier",
        "Type",
        "Country",
        "Currency",
        "Incoterm",
        "Item",
        "Specifications",
        "Qty",
        "HS Code",
        "Item Duty %",
        "Kg/Unit",
        "CBM/Unit",
        "Unit Price",
        "Min Qty",
        "Discount %",
        "Freight Basis",
        "Freight",
        "Freight Min",
        "Freight Currency",
        "Insurance Basis",
        "Insurance",
        "FTA",
        "FTA Duty %",
        "VAT %",
        "Prices incl VAT",
        "Brokerage",
        "Customs",
        "Inland",
        "Bank Fee",
        "Shipment Type",
        "Containers 20ft",
        "Containers 40ft",
        "Shipments",
        "Paid by LC",
        "Lead Days",
        "Down %",
        "Net Days",
        "Early Pay %",
        "Early Pay Days",
        "Valid Until",
        "Quality",
        "Notes",
        "Supplier ID",
        "Quotation Ref",
        "Quote Date",
        "Contact Person",
        "Contact Email",
        "Contact Phone",
        "Insurance Currency",
        "Duty Mode",
        "Single Duty %",
        "Take Early Pay",
    ].join(",");

    const content = `\uFEFF${csvHeader}\n`;

    return new NextResponse(content, {
        headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="Supplier-Bid-Import-Template.csv"`,
        },
    });
}
