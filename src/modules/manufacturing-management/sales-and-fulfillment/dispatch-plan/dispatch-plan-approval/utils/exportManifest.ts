import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { DispatchPlanDetail } from "../../shared.types";

const formatPDFCurrency = (val: number) =>
  `PHP ${(val || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

type AutoTableCell =
  | string
  | {
      content: string;
      styles?: Record<string, unknown>;
      colSpan?: number;
      rowSpan?: number;
      halign?: "left" | "center" | "right";
      valign?: "top" | "middle" | "bottom";
      fontStyle?: string;
      fontSize?: number;
      textColor?: number | number[];
      fillColor?: number | number[] | boolean;
      lineWidth?: number | { top?: number; bottom?: number; left?: number; right?: number };
      cellPadding?: number | { top?: number; bottom?: number; left?: number; right?: number };
    };
type AutoTableRow = AutoTableCell[];

export const exportDispatchManifestPDF = (plan: DispatchPlanDetail | null) => {
  if (!plan) return;

  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const driver = plan.driver_name && plan.driver_name !== "-" ? plan.driver_name : "External 3PL Driver";
  const helpers = plan.helper_name && plan.helper_name !== "-" ? plan.helper_name : "None";
  const depTime = plan.departure_date ? new Date(plan.departure_date).toLocaleString("en-PH") : "TBD";

  // --- 1. COMPACT HEADER ---
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0);
  doc.text(`MANIFEST: ${plan.dispatch_no}`, 14, 16);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`Driver: ${driver}  |  Helpers: ${helpers}`, 14, 22);
  doc.text(`Dispatch: ${depTime}  |  Distance: - km`, pageWidth - 14, 22, { align: "right" });

  let currentY = 26;

  // --- 2. ROUTE & CARGO TABLE ---
  const routeBody: AutoTableRow[] = [];
  const invoiceSummary: AutoTableRow[] = [];

  const stops = plan.stops && plan.stops.length > 0
    ? plan.stops
    : plan.sales_orders.map((s, idx) => ({
        id: `so-${s.sales_order_id}`,
        type: "DELIVERY" as const,
        sequence: idx + 1,
        sales_order_id: s.sales_order_id,
        order_no: s.order_no,
        order_status: s.order_status,
        customer_name: s.customer_name,
        store_name: s.store_name,
        city: s.city,
        invoices: s.invoices,
        amount: s.amount,
      }));

  stops.forEach((stop, idx) => {
    const seq = stop.sequence || idx + 1;
    const isDelivery = stop.type === "DELIVERY";
    const isManual = stop.type === "MANUAL";
    const isPO = stop.type === "PO";

    const stopName = isDelivery
      ? (stop.store_name || stop.customer_name || "CUSTOMER").toUpperCase()
      : isManual
      ? (stop.remarks || "MANUAL STOP").toUpperCase()
      : (stop.po_no || "PURCHASE ORDER").toUpperCase();

    const docNo = isDelivery
      ? stop.invoices && stop.invoices.length > 0
        ? stop.invoices.map((i) => i.invoice_no).join(", ")
        : stop.order_no || "-"
      : isPO
      ? stop.po_no || "-"
      : "-";

    const stopAmount = Number(stop.amount || 0);

    if (isDelivery) {
      invoiceSummary.push([
        stop.store_name || stop.customer_name || "Customer",
        docNo,
        formatPDFCurrency(stopAmount),
      ]);
    }

    // Stop Header
    routeBody.push([
      {
        content: `[  ] ${seq}. ${stop.type} - ${stopName} ${docNo !== "-" ? `(Doc: ${docNo})` : ""}`,
        colSpan: 2,
        styles: {
          fontStyle: "bold",
          fontSize: 9,
          textColor: 0,
          lineWidth: { top: 0.5 },
          cellPadding: { top: 3, bottom: 1, left: 2, right: 2 },
        },
      },
      {
        content: stopAmount > 0 ? `COLLECT: ${formatPDFCurrency(stopAmount)}` : "-",
        styles: {
          fontStyle: "bold",
          fontSize: 9,
          halign: "right",
          textColor: 0,
          lineWidth: { top: 0.5 },
          cellPadding: { top: 3, bottom: 1, left: 2, right: 2 },
        },
      },
    ]);

    // Items line
    if (isDelivery && stop.invoices && stop.invoices.length > 0) {
      stop.invoices.forEach((inv) => {
        routeBody.push([
          { content: "", styles: { cellWidth: 5 } },
          {
            content: `Invoice ${inv.invoice_no} (${stop.city || "-"})`,
            styles: { fontSize: 8, textColor: 30, cellPadding: 1 },
          },
          {
            content: formatPDFCurrency(inv.total_amount),
            styles: { halign: "right", fontSize: 8, textColor: 50, cellPadding: 1 },
          },
        ]);
      });
    } else if (isPO) {
      routeBody.push([
        { content: "", styles: { cellWidth: 5 } },
        {
          content: `PO Pickup: ${stop.po_no} ${stop.supplier_name ? `(${stop.supplier_name})` : ""}`,
          styles: { fontSize: 8, textColor: 30, cellPadding: 1 },
        },
        { content: "-", styles: { halign: "right", fontSize: 8, textColor: 50, cellPadding: 1 } },
      ]);
    } else {
      routeBody.push([
        "",
        {
          content: isManual ? (stop.remarks ? `Stop note: ${stop.remarks}` : "No cargo items.") : "No cargo items.",
          colSpan: 2,
          styles: { fontStyle: "italic", fontSize: 8, textColor: 100, cellPadding: 1 },
        },
      ]);
    }

    // Signature line attached to delivery & PO stops
    if (stop.type !== "MANUAL") {
      routeBody.push([
        {
          content: "Sign: ___________________________   Date: ______________",
          colSpan: 3,
          styles: {
            fontSize: 8,
            fontStyle: "italic",
            halign: "right",
            textColor: 60,
            cellPadding: { top: 1, bottom: 3 },
          },
        },
      ]);
    }
  });

  autoTable(doc, {
    startY: currentY,
    head: [["", "Destination & Cargo", "Amount"]],
    body: routeBody,
    theme: "plain",
    headStyles: {
      fillColor: false,
      textColor: 0,
      fontStyle: "bold",
      fontSize: 8,
      lineWidth: { bottom: 0.5 },
      cellPadding: 2,
    },
    columnStyles: {
      0: { cellWidth: 5 },
      1: { cellWidth: "auto" },
      2: { cellWidth: 40 },
    },
    styles: { font: "helvetica" },
  });

  currentY = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

  // Flatten Budget
  const budgetBody: AutoTableRow[] =
    plan.budget_rows && plan.budget_rows.length > 0
      ? plan.budget_rows.map((b) => [
          { content: b.account_title || b.remarks || "Budget", styles: { cellPadding: 1 } },
          { content: formatPDFCurrency(b.amount), styles: { halign: "right", cellPadding: 1 } },
        ])
      : [[{ content: "No budget requested.", colSpan: 2, styles: { fontStyle: "italic", cellPadding: 1 } }]];

  const totalBudget = plan.budget_rows?.reduce((sum, b) => sum + Number(b.amount || 0), 0) || 0;
  if (totalBudget > 0) {
    budgetBody.push([
      { content: "TOTAL CASH", styles: { fontStyle: "bold", cellPadding: 1 } },
      {
        content: formatPDFCurrency(totalBudget),
        styles: { fontStyle: "bold", halign: "right", cellPadding: 1 },
      },
    ]);
  }

  // Page break protection for summaries
  if (currentY > pageHeight - 60) {
    doc.addPage();
    currentY = 20;
  }

  // A. Supplier Cargo Summary (Left Column)
  autoTable(doc, {
    startY: currentY,
    margin: { left: 14, right: pageWidth / 2 + 5 },
    head: [["Supplier Cargo Summary", "Qty"]],
    body: [["No supplier data.", ""]],
    theme: "plain",
    headStyles: {
      fillColor: false,
      textColor: 0,
      fontStyle: "bold",
      fontSize: 8,
      lineWidth: { bottom: 0.5 },
      cellPadding: 2,
    },
    styles: { fontSize: 7, textColor: 0 },
  });

  const suppTableY = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

  // B. Budget Summary (Right Column)
  autoTable(doc, {
    startY: currentY,
    margin: { left: pageWidth / 2 + 5, right: 14 },
    head: [["Trip Budget", "Amount"]],
    body: budgetBody,
    theme: "plain",
    headStyles: {
      fillColor: false,
      textColor: 0,
      fontStyle: "bold",
      fontSize: 8,
      lineWidth: { bottom: 0.5 },
      cellPadding: 2,
    },
    styles: { fontSize: 7, textColor: 0 },
  });

  const budgetTableY = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

  // C. Invoice/Deliveries Summary (Full Width)
  currentY = Math.max(suppTableY, budgetTableY) + 6;

  if (currentY > pageHeight - 40) {
    doc.addPage();
    currentY = 20;
  }

  const finalInvoiceSummary: AutoTableRow[] =
    invoiceSummary.length > 0
      ? [...invoiceSummary]
      : [[{ content: "No deliveries logged.", colSpan: 3, styles: { fontStyle: "italic", cellPadding: 1.5 } }]];

  const totalInvoiceAmount = stops.reduce(
    (sum, stop) => (stop.type === "DELIVERY" ? sum + Number(stop.amount || 0) : sum),
    0
  );

  finalInvoiceSummary.push([
    { content: "TOTAL", colSpan: 2, styles: { fontStyle: "bold", halign: "right", cellPadding: 1.5 } },
    { content: formatPDFCurrency(totalInvoiceAmount), styles: { fontStyle: "bold", halign: "right", cellPadding: 1.5 } },
  ]);

  autoTable(doc, {
    startY: currentY,
    head: [["Customer Name", "Invoice No.", "Amount"]],
    body: finalInvoiceSummary,
    theme: "plain",
    headStyles: {
      fillColor: false,
      textColor: 0,
      fontStyle: "bold",
      fontSize: 8,
      lineWidth: { bottom: 0.5 },
      cellPadding: 2,
    },
    columnStyles: {
      0: { cellWidth: "auto" },
      1: { cellWidth: 50 },
      2: { cellWidth: 40, halign: "right" },
    },
    styles: { fontSize: 7, textColor: 0, cellPadding: 1.5 },
  });

  // --- 4. END OF TRIP CLEARANCE SIGN-OFF ---
  currentY = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 12;
  if (currentY > pageHeight - 20) {
    doc.addPage();
    currentY = 20;
  }

  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text("END OF TRIP CLEARANCE", 14, currentY);
  doc.setFont("helvetica", "normal");
  doc.text("Driver: ___________________________", 14, currentY + 8);
  doc.text("Dispatcher: ___________________________", pageWidth / 2, currentY + 8);

  // --- 5. PAGINATION ---
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(100);
    doc.text(
      `Page ${i} of ${pageCount}  |  ${plan.dispatch_no}  |  Generated: ${new Date().toLocaleString("en-PH")}`,
      pageWidth / 2,
      pageHeight - 6,
      { align: "center" }
    );
  }

  doc.save(`Manifest_${plan.dispatch_no}.pdf`);
};
