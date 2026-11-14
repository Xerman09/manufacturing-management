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
    ].join(",");

    const exampleRows = [
        `"ABC Trading","Local","Philippines","PHP","Delivered","LED panel light 60x60",500,"9405.11",0,3.5,0.025,1450,1,0,"","","","","","",0,12,"No",0,0,0,0,"",0,0,1,"No",7,0,30,0,0,"2026-12-31",4,"Local ISO supplier"`,
        `"ABC Trading","Local","Philippines","PHP","Delivered","LED panel light 60x60",500,"9405.11",0,3.5,0.025,1390,300,0,"","","","","","",0,12,"No",0,0,0,0,"",0,0,1,"No",7,0,30,0,0,"2026-12-31",4,"Volume price break"`,
        `"Overseas Lighting Co.","International","China","CNY","FOB","LED panel light 60x60",500,"9405.11",0,3.5,0.025,110,200,3,"CBM",380,2500,"CNY","%",0.3,"ACFTA",0,12,"No",9000,2500,7000,1500,"FCL",1,0,1,"No",35,30,0,2,10,"2026-12-15",4,"ACFTA Form E"`,
    ].join("\n");

    const content = `${csvHeader}\n${exampleRows}\n`;

    return new NextResponse(content, {
        headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="Supplier-Bid-Import-Template.csv"`,
        },
    });
}
