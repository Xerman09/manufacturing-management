import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getJwtSubFromReq } from "@/lib/directus";
import {
    RfqProject,
    RequestedItem,
    QualityCriterion,
    ExchangeRateEntry,
    IpcBracket,
    SupplierBid,
    ItemQuotation,
    PriceBreak,
    ItemAward,
    ApprovalHistoryEntry,
    Incoterm,
    FreightBasis,
    InsuranceBasis,
    DutyMode,
    ShipmentType,
    ProjectStatus,
    AwardStrategy,
} from "@/modules/manufacturing-management/procurement-and-inbound/supplier-bid-comparison/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DIRECTUS_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "";
const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN || "";

function getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
    };
    if (DIRECTUS_STATIC_TOKEN) {
        headers["Authorization"] = `Bearer ${DIRECTUS_STATIC_TOKEN}`;
    }
    return headers;
}

/**
 * Safely parse numeric DB ID or null
 */
function parseDbId(val: unknown): number | null {
    if (typeof val === "number" && !isNaN(val)) return val;
    if (typeof val === "string") {
        const parsed = parseInt(val, 10);
        if (!isNaN(parsed) && parsed > 0 && String(parsed) === val.trim()) {
            return parsed;
        }
    }
    return null;
}

/**
 * Directus helper: fetch list with filter
 */
async function fetchCollection<T>(collection: string, query: string): Promise<T[]> {
    const res = await fetch(`${DIRECTUS_URL}/items/${collection}?${query}`, {
        headers: getHeaders(),
        cache: "no-store",
    });
    if (!res.ok) {
        if (res.status === 404 || res.status === 403) return [];
        throw new Error(`Directus ${collection} query failed: HTTP ${res.status}`);
    }
    const data = await res.json();
    return (data.data as T[]) || [];
}

/**
 * Directus helper: post new item
 */
async function postItem<T>(collection: string, payload: Record<string, unknown>): Promise<T> {
    const res = await fetch(`${DIRECTUS_URL}/items/${collection}`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify(payload),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(`Directus POST ${collection} failed: ${err?.errors?.[0]?.message || res.status}`);
    }
    const data = await res.json();
    return data.data as T;
}

/**
 * Directus helper: patch existing item
 */
async function patchItem<T>(collection: string, id: number | string, payload: Record<string, unknown>): Promise<T> {
    const res = await fetch(`${DIRECTUS_URL}/items/${collection}/${id}`, {
        method: "PATCH",
        headers: getHeaders(),
        body: JSON.stringify(payload),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(`Directus PATCH ${collection}/${id} failed: ${err?.errors?.[0]?.message || res.status}`);
    }
    const data = await res.json();
    return data.data as T;
}

/**
 * GET /api/manufacturing/procurement-and-inbound/supplier-bid-comparison
 * Query params:
 *   ?id=... (Fetch single full project with reconstructed child entities)
 *   or list all active RFQ headers
 */
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const rfqIdStr = searchParams.get("id");

        if (rfqIdStr) {
            const rfqId = parseInt(rfqIdStr, 10);
            if (isNaN(rfqId)) {
                return NextResponse.json({ error: "Invalid project ID" }, { status: 400 });
            }

            // 1. Fetch Header
            const headers = getHeaders();
            const res = await fetch(`${DIRECTUS_URL}/items/mm_rfq/${rfqId}`, {
                headers,
                cache: "no-store",
            });

            if (!res.ok) {
                if (res.status === 404) {
                    return NextResponse.json({ error: "Project not found", notFound: true }, { status: 404 });
                }
                throw new Error(`Directus mm_rfq returned HTTP ${res.status}`);
            }

            const headerData = await res.json();
            const h = headerData.data;

            // 2. Fetch all child collections concurrently
            const [
                itemsData,
                criteriaData,
                ratesData,
                customsData,
                ipcData,
                bidsData,
                awardsData,
                approvalData,
            ] = await Promise.all([
                fetchCollection<Record<string, unknown>>("mm_rfq_items", `filter[rfq_id][_eq]=${rfqId}&filter[deleted_at][_null]=true&sort=sort_order`),
                fetchCollection<Record<string, unknown>>("mm_rfq_quality_criteria", `filter[rfq_id][_eq]=${rfqId}&filter[deleted_at][_null]=true&sort=sort_order`),
                fetchCollection<Record<string, unknown>>("mm_rfq_exchange_rates", `filter[rfq_id][_eq]=${rfqId}&filter[deleted_at][_null]=true`),
                fetchCollection<Record<string, unknown>>("mm_rfq_customs_rates", `filter[rfq_id][_eq]=${rfqId}&filter[deleted_at][_null]=true&limit=1`),
                fetchCollection<Record<string, unknown>>("mm_rfq_ipc_brackets", `filter[rfq_id][_eq]=${rfqId}&filter[deleted_at][_null]=true&sort=bracket_order`),
                fetchCollection<Record<string, unknown>>("mm_rfq_bids", `filter[rfq_id][_eq]=${rfqId}&filter[deleted_at][_null]=true&sort=id`),
                fetchCollection<Record<string, unknown>>("mm_rfq_awards", `filter[rfq_id][_eq]=${rfqId}&filter[status][_eq]=ACTIVE`),
                fetchCollection<Record<string, unknown>>("mm_rfq_approval_history", `filter[rfq_id][_eq]=${rfqId}&sort=created_at`),
            ]);

            // Map Items
            const items: RequestedItem[] = itemsData.map((it) => ({
                id: String(it.id),
                dbId: Number(it.id),
                productId: it.product_id ? Number(it.product_id) : null,
                itemTemplateId: it.item_template_id ? Number(it.item_template_id) : null,
                itemVariantId: it.item_variant_id ? Number(it.item_variant_id) : null,
                itemName: String(it.item_name || ""),
                specifications: String(it.specifications || ""),
                quantity: Number(it.quantity || 1),
                uom: String(it.uom || "pcs"),
                targetUnitPrice: Number(it.target_unit_price || 0),
                hsCode: String(it.hs_code || ""),
                dutyPct: Number(it.duty_pct || 0),
                weightPerUnitKg: Number(it.weight_per_unit_kg || 0),
                cbmPerUnit: Number(it.cbm_per_unit || 0),
                sortOrder: Number(it.sort_order || 0),
            }));

            // Map Quality Criteria
            const qualityCriteria: QualityCriterion[] = criteriaData.map((c) => ({
                id: String(c.id),
                dbId: Number(c.id),
                criterionType: (c.criterion_type as "SCORED" | "PASS_FAIL") || "SCORED",
                criterionName: String(c.criterion_name || ""),
                weightPct: Number(c.weight_pct || 0),
                sortOrder: Number(c.sort_order || 0),
            }));

            // Map Exchange Rates
            const exchangeRates: ExchangeRateEntry[] = ratesData.map((r) => ({
                currencyCode: String(r.currency_code),
                rateToComparison: Number(r.rate_to_comparison || 1),
            }));

            // Map Customs Rates
            const cRow = customsData[0] || {};
            const customsRates = {
                cdsCompCurr: Number(cRow.cds_comp_curr ?? 100),
                birDstCompCurr: Number(cRow.bir_dst_comp_curr ?? 30),
                containerSecurityUsd: Number(cRow.container_security_usd ?? 5),
                arrastre20ftCompCurr: Number(cRow.arrastre_20ft_comp_curr ?? 4738),
                arrastre40ftCompCurr: Number(cRow.arrastre_40ft_comp_curr ?? 10869),
                wharfage20ftCompCurr: Number(cRow.wharfage_20ft_comp_curr ?? 519.35),
                wharfage40ftCompCurr: Number(cRow.wharfage_40ft_comp_curr ?? 779.05),
                lclArrastrePerRtCompCurr: Number(cRow.lcl_arrastre_per_rt_comp_curr ?? 149),
                lclWharfagePerRtCompCurr: Number(cRow.lcl_wharfage_per_rt_comp_curr ?? 30.55),
                lcBankChargePct: Number(cRow.lc_bank_charge_pct ?? 0.1250),
            };

            // Map IPC Brackets
            const ipcBrackets: IpcBracket[] = ipcData.map((b) => ({
                id: String(b.id),
                bracketOrder: Number(b.bracket_order || 1),
                maxDutiableValueCompCurr: b.max_dutiable_value_comp_curr != null ? Number(b.max_dutiable_value_comp_curr) : null,
                chargeCompCurr: Number(b.charge_comp_curr || 0),
            }));

            // Fetch nested Bid Quotations & Price Breaks & Scores for each bid
            const bids: SupplierBid[] = await Promise.all(
                bidsData.map(async (b) => {
                    const bidId = Number(b.id);
                    const [bidItemsData, scoresData, attachmentsData] = await Promise.all([
                        fetchCollection<Record<string, unknown>>("mm_rfq_bid_items", `filter[rfq_bid_id][_eq]=${bidId}&filter[deleted_at][_null]=true`),
                        fetchCollection<Record<string, unknown>>("mm_rfq_bid_scores", `filter[rfq_bid_id][_eq]=${bidId}&filter[deleted_at][_null]=true`),
                        fetchCollection<Record<string, unknown>>("mm_rfq_bid_attachments", `filter[rfq_bid_id][_eq]=${bidId}&filter[deleted_at][_null]=true`),
                    ]);

                    // For each bid item, fetch price breaks
                    const quotations: Record<string, ItemQuotation> = {};
                    for (const bi of bidItemsData) {
                        const biId = Number(bi.id);
                        const rfqItemIdStr = String(bi.rfq_item_id);
                        const pBreaksData = await fetchCollection<Record<string, unknown>>(
                            "mm_rfq_bid_price_breaks",
                            `filter[rfq_bid_item_id][_eq]=${biId}&filter[deleted_at][_null]=true&sort=min_quantity`
                        );
                        const priceBreaks: PriceBreak[] = pBreaksData.map((pb) => ({
                            id: String(pb.id),
                            dbId: Number(pb.id),
                            minQuantity: Number(pb.min_quantity || 1),
                            unitPrice: Number(pb.unit_price || 0),
                        }));

                        quotations[rfqItemIdStr] = {
                            id: String(bi.id),
                            dbId: Number(bi.id),
                            rfqItemId: rfqItemIdStr,
                            discountPct: Number(bi.discount_pct || 0),
                            priceBreaks,
                        };
                    }

                    // Map Scores
                    const scores: Record<string, { passFailResult: "PASS" | "FAIL" | "NOT_CHECKED"; score: number | null; evidenceRemarks: string }> = {};
                    for (const sc of scoresData) {
                        scores[String(sc.criterion_id)] = {
                            passFailResult: (sc.pass_fail_result as "PASS" | "FAIL" | "NOT_CHECKED") || "NOT_CHECKED",
                            score: sc.score != null ? Number(sc.score) : null,
                            evidenceRemarks: String(sc.evidence_remarks || ""),
                        };
                    }

                    // Map Attachments
                    const attachments = attachmentsData.map((att) => ({
                        id: String(att.id),
                        dbId: Number(att.id),
                        directusFileId: String(att.directus_file_id),
                        fileName: String(att.file_name),
                        mimeType: att.mime_type ? String(att.mime_type) : undefined,
                        fileSize: att.file_size ? Number(att.file_size) : undefined,
                        documentType: String(att.document_type || "Quotation"),
                        uploadedBy: att.uploaded_by ? Number(att.uploaded_by) : undefined,
                        uploadedAt: att.uploaded_at ? String(att.uploaded_at) : undefined,
                    }));

                    return {
                        id: String(b.id),
                        dbId: Number(b.id),
                        supplierId: b.supplier_id ? Number(b.supplier_id) : null,
                        supplierName: String(b.supplier_name || ""),
                        supplierType: (b.supplier_type as "LOCAL" | "INTERNATIONAL") || "LOCAL",
                        country: String(b.country || "Philippines"),
                        contactPerson: String(b.contact_person || ""),
                        contactEmail: String(b.contact_email || ""),
                        contactPhone: String(b.contact_phone || ""),
                        quoteCurrency: String(b.quote_currency || "PHP"),
                        quotationRef: String(b.quotation_ref || ""),
                        quoteDate: b.quote_date ? String(b.quote_date).slice(0, 10) : "",
                        validUntil: b.valid_until ? String(b.valid_until).slice(0, 10) : "",
                        leadTimeDays: Number(b.lead_time_days || 0),
                        notes: String(b.notes || ""),
                        incoterm: (b.incoterm as Incoterm) || "DELIVERED",
                        vatPct: Number(b.vat_pct ?? 12),
                        pricesIncludeVat: Boolean(b.prices_include_vat),
                        inlandTruckingCompCurr: Number(b.inland_trucking_comp_curr || 0),
                        freightBasis: (b.freight_basis as FreightBasis) || "LUMP_SUM",
                        freightRate: Number(b.freight_rate || 0),
                        freightMinimum: Number(b.freight_minimum || 0),
                        freightCurrency: String(b.freight_currency || "PHP"),
                        insuranceBasis: (b.insurance_basis as InsuranceBasis) || "PCT_GOODS_AND_FREIGHT",
                        insuranceRateOrAmount: Number(b.insurance_rate_or_amount || 0),
                        insuranceCurrency: String(b.insurance_currency || "PHP"),
                        dutyMode: (b.duty_mode as DutyMode) || "PER_ITEM",
                        ftaAgreementName: b.fta_agreement_name ? String(b.fta_agreement_name) : undefined,
                        ftaDutyPct: b.fta_duty_pct != null ? Number(b.fta_duty_pct) : undefined,
                        singleDutyPct: b.single_duty_pct != null ? Number(b.single_duty_pct) : undefined,
                        brokerageCompCurr: Number(b.brokerage_comp_curr || 0),
                        otherPortChargesCompCurr: Number(b.other_port_charges_comp_curr || 0),
                        shipmentType: (b.shipment_type as ShipmentType) || "AUTO",
                        containers20ft: Number(b.containers_20ft || 0),
                        containers40ft: Number(b.containers_40ft || 0),
                        declarationsCount: Number(b.declarations_count || 1),
                        paidByLc: Boolean(b.paid_by_lc),
                        downPaymentPct: Number(b.down_payment_pct || 0),
                        balanceDueDays: Number(b.balance_due_days || 0),
                        earlyPayDiscountPct: Number(b.early_pay_discount_pct || 0),
                        earlyPayDiscountDays: Number(b.early_pay_discount_days || 0),
                        takeEarlyPayDiscount: Boolean(b.take_early_pay_discount),
                        bankFeePerPaymentCompCurr: Number(b.bank_fee_per_payment_comp_curr || 0),
                        quotations,
                        scores,
                        attachments,
                    };
                })
            );

            // Map Awards
            const awards: ItemAward[] = awardsData.map((aw) => ({
                id: String(aw.id),
                dbId: Number(aw.id),
                rfqItemId: String(aw.rfq_item_id),
                rfqBidId: String(aw.rfq_bid_id),
                awardedSupplierId: aw.awarded_supplier_id ? Number(aw.awarded_supplier_id) : null,
                awardedLandedUnitCost: Number(aw.awarded_landed_unit_cost || 0),
                awardedLandedTotal: Number(aw.awarded_landed_total || 0),
                purchaseOrderId: aw.purchase_order_id ? Number(aw.purchase_order_id) : null,
            }));

            // Map Approval History
            const approvalHistory: ApprovalHistoryEntry[] = approvalData.map((ah) => ({
                id: String(ah.id),
                dbId: Number(ah.id),
                action: ah.action as ApprovalHistoryEntry["action"],
                fromStatus: ah.from_status as ProjectStatus,
                toStatus: ah.to_status as ProjectStatus,
                actorId: ah.actor_id ? Number(ah.actor_id) : null,
                actorName: String(ah.actor_name || ""),
                comment: String(ah.comment || ""),
                createdAt: String(ah.created_at || ""),
            }));

            // Reconstructed Full Project
            const project: RfqProject = {
                id: String(h.id),
                dbId: Number(h.id),
                rfqTitle: String(h.rfq_title || ""),
                rfqReference: String(h.rfq_reference || ""),
                parentRfqId: h.parent_rfq_id ? Number(h.parent_rfq_id) : null,
                roundNo: Number(h.round_no || 1),
                comparisonCurrency: String(h.comparison_currency || "PHP"),
                budget: h.budget != null ? Number(h.budget) : null,
                notes: String(h.notes || ""),
                fxRiskBufferPct: Number(h.fx_risk_buffer_pct ?? 3),
                costOfMoneyPctPerYear: Number(h.cost_of_money_pct_per_year ?? 8),
                defaultVatPct: Number(h.default_vat_pct ?? 12),
                countVatAsCost: Boolean(h.count_vat_as_cost),
                calcCustomsAuto: Boolean(h.calc_customs_auto),
                scoringWeightPricePct: Number(h.scoring_weight_price_pct ?? 50),
                scoringWeightQualityPct: Number(h.scoring_weight_quality_pct ?? 35),
                scoringWeightLeadTimePct: Number(h.scoring_weight_lead_time_pct ?? 15),
                status: (h.status as ProjectStatus) || "Draft",
                version: Number(h.version || 1),
                preparedBy: String(h.prepared_by || ""),
                preparedByTitle: String(h.prepared_by_title || ""),
                reviewedBy: String(h.reviewed_by || ""),
                reviewedByTitle: String(h.reviewed_by_title || ""),
                approvedBy: String(h.approved_by || ""),
                approvedByTitle: String(h.approved_by_title || ""),
                justification: String(h.justification || ""),
                rejectionReason: h.rejection_reason ? String(h.rejection_reason) : undefined,
                approvalRemarks: h.approval_remarks ? String(h.approval_remarks) : undefined,
                awardStrategy: (h.award_strategy as AwardStrategy) || "MANUAL",
                targetDate: h.target_date ? String(h.target_date).slice(0, 10) : undefined,
                createdBy: h.created_by ? Number(h.created_by) : null,
                createdAt: h.created_at ? String(h.created_at) : undefined,
                updatedBy: h.updated_by ? Number(h.updated_by) : null,
                updatedAt: h.updated_at ? String(h.updated_at) : undefined,
                items,
                qualityCriteria,
                exchangeRates,
                customsRates,
                ipcBrackets,
                bids,
                awards,
                approvalHistory,
            };

            return NextResponse.json({ success: true, project });
        }

        // List active RFQ headers
        const headers = getHeaders();
        const res = await fetch(
            `${DIRECTUS_URL}/items/mm_rfq?filter[deleted_at][_null]=true&sort=-updated_at&fields=id,rfq_title,rfq_reference,comparison_currency,budget,status,round_no,version,updated_at,prepared_by`,
            { headers, cache: "no-store" }
        );

        if (!res.ok) {
            if (res.status === 404 || res.status === 403) {
                return NextResponse.json({ success: true, projects: [], backendUnavailable: true });
            }
            throw new Error(`Directus returned HTTP ${res.status}`);
        }

        const data = await res.json();
        return NextResponse.json({ success: true, projects: data.data || [] });
    } catch (error) {
        return NextResponse.json(
            {
                success: false,
                error: (error as Error).message || "Failed to fetch RFQ projects",
                backendUnavailable: true,
            },
            { status: 200 }
        );
    }
}

/**
 * POST /api/manufacturing/procurement-and-inbound/supplier-bid-comparison
 * Creates initial project header and child rows
 */
export async function POST(request: NextRequest) {
    try {
        const userId = getJwtSubFromReq(request);
        const body: RfqProject = await request.json();
        const headers = getHeaders();

        const payload = {
            rfq_title: body.rfqTitle || "New RFQ Project",
            rfq_reference: body.rfqReference || `RFQ-${Date.now().toString().slice(-6)}`,
            parent_rfq_id: body.parentRfqId || null,
            round_no: body.roundNo || 1,
            comparison_currency: body.comparisonCurrency || "PHP",
            budget: body.budget,
            notes: body.notes || "",
            fx_risk_buffer_pct: body.fxRiskBufferPct ?? 3.0,
            cost_of_money_pct_per_year: body.costOfMoneyPctPerYear ?? 8.0,
            default_vat_pct: body.defaultVatPct ?? 12.0,
            count_vat_as_cost: body.countVatAsCost ? 1 : 0,
            calc_customs_auto: body.calcCustomsAuto ? 1 : 0,
            scoring_weight_price_pct: body.scoringWeightPricePct ?? 50.0,
            scoring_weight_quality_pct: body.scoringWeightQualityPct ?? 35.0,
            scoring_weight_lead_time_pct: body.scoringWeightLeadTimePct ?? 15.0,
            status: body.status || "Draft",
            version: 1,
            prepared_by: body.preparedBy || "",
            prepared_by_title: body.preparedByTitle || "",
            reviewed_by: body.reviewedBy || "",
            reviewed_by_title: body.reviewedByTitle || "",
            approved_by: body.approvedBy || "",
            approved_by_title: body.approvedByTitle || "",
            justification: body.justification || "",
            rejection_reason: body.rejectionReason || null,
            approval_remarks: body.approvalRemarks || null,
            award_strategy: body.awardStrategy || "MANUAL",
            target_date: body.targetDate ? body.targetDate.slice(0, 10) : null,
            created_by: userId,
        };

        const res = await fetch(`${DIRECTUS_URL}/items/mm_rfq`, {
            method: "POST",
            headers,
            body: JSON.stringify(payload),
        });

        if (!res.ok) {
            const errData = await res.json().catch(() => null);
            return NextResponse.json(
                { success: false, error: errData?.errors?.[0]?.message || `Directus error ${res.status}`, backendUnavailable: res.status === 404 },
                { status: res.status >= 500 ? 500 : 400 }
            );
        }

        const data = await res.json();
        const createdHeader = data.data;
        const newRfqId = Number(createdHeader.id);

        // Synchronize child entities for newly created project
        const fullProject: RfqProject = { ...body, id: String(newRfqId), dbId: newRfqId };
        await syncChildEntities(newRfqId, fullProject, userId);

        return NextResponse.json({ success: true, project: fullProject }, { status: 201 });
    } catch (error) {
        return NextResponse.json(
            { success: false, error: (error as Error).message || "Failed to create project", backendUnavailable: true },
            { status: 500 }
        );
    }
}

/**
 * PUT /api/manufacturing/procurement-and-inbound/supplier-bid-comparison
 * Performs relational diff-upsert of project header and all 12 child entities.
 * Automatically initializes and assigns a database ID if the project only has a client string ID.
 */
export async function PUT(request: NextRequest) {
    try {
        const userId = getJwtSubFromReq(request);
        const project: RfqProject = await request.json();
        if (!project || !project.id) {
            return NextResponse.json({ error: "Missing project id" }, { status: 400 });
        }

        const headers = getHeaders();
        let rfqDbId = parseDbId(project.id) || parseDbId(project.dbId);

        // If project does not yet have a numeric database ID, resolve or create it
        if (!rfqDbId) {
            // Check if project exists by reference and round
            try {
                const searchRes = await fetch(
                    `${DIRECTUS_URL}/items/mm_rfq?filter[rfq_reference][_eq]=${encodeURIComponent(project.rfqReference || "")}&filter[round_no][_eq]=${project.roundNo || 1}&filter[deleted_at][_null]=true&limit=1`,
                    { headers, cache: "no-store" }
                );
                if (searchRes.ok) {
                    const searchData = await searchRes.json();
                    if (searchData.data && searchData.data.length > 0) {
                        rfqDbId = Number(searchData.data[0].id);
                    }
                }
            } catch {
                // If query fails, fall through to create or local fallback
            }

            // If still no ID found in DB, create initial row in mm_rfq
            if (!rfqDbId) {
                const initialPayload = {
                    rfq_title: project.rfqTitle || "New RFQ Project",
                    rfq_reference: project.rfqReference || `RFQ-${Date.now().toString().slice(-6)}`,
                    parent_rfq_id: project.parentRfqId || null,
                    round_no: project.roundNo || 1,
                    comparison_currency: project.comparisonCurrency || "PHP",
                    budget: project.budget,
                    notes: project.notes || "",
                    fx_risk_buffer_pct: project.fxRiskBufferPct ?? 3.0,
                    cost_of_money_pct_per_year: project.costOfMoneyPctPerYear ?? 8.0,
                    default_vat_pct: project.defaultVatPct ?? 12.0,
                    count_vat_as_cost: project.countVatAsCost ? 1 : 0,
                    calc_customs_auto: project.calcCustomsAuto ? 1 : 0,
                    scoring_weight_price_pct: project.scoringWeightPricePct ?? 50.0,
                    scoring_weight_quality_pct: project.scoringWeightQualityPct ?? 35.0,
                    scoring_weight_lead_time_pct: project.scoringWeightLeadTimePct ?? 15.0,
                    status: project.status || "Draft",
                    version: 1,
                    prepared_by: project.preparedBy || "",
                    prepared_by_title: project.preparedByTitle || "",
                    reviewed_by: project.reviewedBy || "",
                    reviewed_by_title: project.reviewedByTitle || "",
                    approved_by: project.approvedBy || "",
                    approved_by_title: project.approvedByTitle || "",
                    justification: project.justification || "",
                    rejection_reason: project.rejectionReason || null,
                    approval_remarks: project.approvalRemarks || null,
                    award_strategy: project.awardStrategy || "MANUAL",
                    target_date: project.targetDate ? project.targetDate.slice(0, 10) : null,
                    created_by: userId,
                };

                try {
                    const createRes = await fetch(`${DIRECTUS_URL}/items/mm_rfq`, {
                        method: "POST",
                        headers,
                        body: JSON.stringify(initialPayload),
                    });

                    if (!createRes.ok) {
                        const errData = await createRes.json().catch(() => null);
                        return NextResponse.json(
                            {
                                success: false,
                                error: errData?.errors?.[0]?.message || `Directus unavailable: ${createRes.status}`,
                                backendUnavailable: true,
                            },
                            { status: 200 }
                        );
                    }

                    const createData = await createRes.json();
                    rfqDbId = Number(createData.data.id);
                } catch (err) {
                    return NextResponse.json(
                        {
                            success: false,
                            error: (err as Error).message || "Database connection offline",
                            backendUnavailable: true,
                        },
                        { status: 200 }
                    );
                }
            }
        }

        // 1. Fetch current header for status transition check
        let existingStatus = "Draft";
        try {
            const currentHeaderRes = await fetch(`${DIRECTUS_URL}/items/mm_rfq/${rfqDbId}?fields=id,status,version`, {
                headers,
                cache: "no-store",
            });
            if (currentHeaderRes.ok) {
                const curData = await currentHeaderRes.json();
                existingStatus = curData?.data?.status || "Draft";
            }
        } catch {
            // Best effort status check
        }

        // 2. Update mm_rfq Header
        const headerPayload = {
            rfq_title: project.rfqTitle,
            rfq_reference: project.rfqReference,
            parent_rfq_id: project.parentRfqId || null,
            round_no: project.roundNo || 1,
            comparison_currency: project.comparisonCurrency || "PHP",
            budget: project.budget,
            notes: project.notes || "",
            fx_risk_buffer_pct: project.fxRiskBufferPct ?? 3.0,
            cost_of_money_pct_per_year: project.costOfMoneyPctPerYear ?? 8.0,
            default_vat_pct: project.defaultVatPct ?? 12.0,
            count_vat_as_cost: project.countVatAsCost ? 1 : 0,
            calc_customs_auto: project.calcCustomsAuto ? 1 : 0,
            scoring_weight_price_pct: project.scoringWeightPricePct ?? 50.0,
            scoring_weight_quality_pct: project.scoringWeightQualityPct ?? 35.0,
            scoring_weight_lead_time_pct: project.scoringWeightLeadTimePct ?? 15.0,
            status: project.status || "Draft",
            version: (project.version || 1) + 1,
            prepared_by: project.preparedBy || "",
            prepared_by_title: project.preparedByTitle || "",
            reviewed_by: project.reviewedBy || "",
            reviewed_by_title: project.reviewedByTitle || "",
            approved_by: project.approvedBy || "",
            approved_by_title: project.approvedByTitle || "",
            justification: project.justification || "",
            rejection_reason: project.rejectionReason || null,
            approval_remarks: project.approvalRemarks || null,
            award_strategy: project.awardStrategy || "MANUAL",
            target_date: project.targetDate ? project.targetDate.slice(0, 10) : null,
            updated_by: userId,
        };

        const res = await fetch(`${DIRECTUS_URL}/items/mm_rfq/${rfqDbId}`, {
            method: "PATCH",
            headers,
            body: JSON.stringify(headerPayload),
        });

        if (!res.ok) {
            const errData = await res.json().catch(() => null);
            return NextResponse.json(
                {
                    success: false,
                    error: errData?.errors?.[0]?.message || `Failed to update RFQ: ${res.status}`,
                    backendUnavailable: res.status === 404 || res.status >= 500,
                },
                { status: 200 }
            );
        }

        // 3. Status Change Audit Log
        if (project.status && project.status !== existingStatus) {
            const action =
                project.status === "Approved"
                    ? "APPROVE"
                    : project.status === "Rejected"
                    ? "REJECT"
                    : project.status === "Submitted"
                    ? "SUBMIT"
                    : "REOPEN";

            const comment =
                project.status === "Rejected"
                    ? (project.rejectionReason || project.justification || "Award rejected")
                    : (project.approvalRemarks || project.justification || "");

            await postItem("mm_rfq_approval_history", {
                rfq_id: rfqDbId,
                action,
                from_status: existingStatus,
                to_status: project.status,
                actor_id: userId,
                actor_name: project.reviewedBy || project.preparedBy || "System User",
                comment,
            }).catch(() => null);
        }

        // 4. Diff-Upsert Child Entities
        await syncChildEntities(rfqDbId, project, userId);

        const updatedProject: RfqProject = {
            ...project,
            id: String(rfqDbId),
            dbId: rfqDbId,
        };

        return NextResponse.json({ success: true, project: updatedProject });
    } catch (error) {
        return NextResponse.json(
            {
                success: false,
                error: (error as Error).message || "Failed to update project",
                backendUnavailable: true,
            },
            { status: 200 }
        );
    }
}

/**
 * Child Entity Relational Diff-Upsert Orchestrator
 */
async function syncChildEntities(rfqId: number, project: RfqProject, userId: number | null) {
    const nowIso = new Date().toISOString();

    // Map client IDs to DB IDs
    const itemIdMap = new Map<string, number>();
    const critIdMap = new Map<string, number>();
    const bidIdMap = new Map<string, number>();
    const bidItemIdMap = new Map<string, number>();

    // -------------------------------------------------------------
    // A. Sync mm_rfq_items
    // -------------------------------------------------------------
    if (project.items && Array.isArray(project.items)) {
        const existingItems = await fetchCollection<Record<string, unknown>>(
            "mm_rfq_items",
            `filter[rfq_id][_eq]=${rfqId}&filter[deleted_at][_null]=true`
        );
        const existingMap = new Map<number, Record<string, unknown>>();
        existingItems.forEach((it) => existingMap.set(Number(it.id), it));

        const activeDbIds = new Set<number>();

        for (let i = 0; i < project.items.length; i++) {
            const item = project.items[i];
            const dbId = parseDbId(item.dbId) || parseDbId(item.id);
            const payload = {
                rfq_id: rfqId,
                product_id: item.productId || null,
                item_template_id: item.itemTemplateId || null,
                item_variant_id: item.itemVariantId || null,
                item_name: item.itemName,
                specifications: item.specifications || "",
                quantity: item.quantity,
                uom: item.uom || "pcs",
                target_unit_price: item.targetUnitPrice ?? 0,
                hs_code: item.hsCode || "",
                duty_pct: item.dutyPct ?? 0,
                weight_per_unit_kg: item.weightPerUnitKg ?? 0,
                cbm_per_unit: item.cbmPerUnit ?? 0,
                sort_order: item.sortOrder ?? i,
            };

            if (dbId && existingMap.has(dbId)) {
                await patchItem("mm_rfq_items", dbId, payload);
                itemIdMap.set(item.id, dbId);
                activeDbIds.add(dbId);
            } else {
                const created = await postItem<{ id: number }>("mm_rfq_items", payload);
                itemIdMap.set(item.id, Number(created.id));
                activeDbIds.add(Number(created.id));
            }
        }

        // Soft-delete removed items
        Array.from(existingMap.keys()).forEach(async (eId) => {
            if (!activeDbIds.has(eId)) {
                await patchItem("mm_rfq_items", eId, { deleted_at: nowIso, deleted_by: userId }).catch(() => null);
            }
        });
    }

    // -------------------------------------------------------------
    // B. Sync mm_rfq_quality_criteria
    // -------------------------------------------------------------
    if (project.qualityCriteria && Array.isArray(project.qualityCriteria)) {
        const existingCriteria = await fetchCollection<Record<string, unknown>>(
            "mm_rfq_quality_criteria",
            `filter[rfq_id][_eq]=${rfqId}&filter[deleted_at][_null]=true`
        );
        const existingMap = new Map<number, Record<string, unknown>>();
        existingCriteria.forEach((c) => existingMap.set(Number(c.id), c));

        const activeDbIds = new Set<number>();

        for (let i = 0; i < project.qualityCriteria.length; i++) {
            const crit = project.qualityCriteria[i];
            const dbId = parseDbId(crit.dbId) || parseDbId(crit.id);
            const payload = {
                rfq_id: rfqId,
                criterion_type: crit.criterionType || "SCORED",
                criterion_name: crit.criterionName,
                weight_pct: crit.weightPct ?? 0,
                sort_order: crit.sortOrder ?? i,
            };

            if (dbId && existingMap.has(dbId)) {
                await patchItem("mm_rfq_quality_criteria", dbId, payload);
                critIdMap.set(crit.id, dbId);
                activeDbIds.add(dbId);
            } else {
                const created = await postItem<{ id: number }>("mm_rfq_quality_criteria", payload);
                critIdMap.set(crit.id, Number(created.id));
                activeDbIds.add(Number(created.id));
            }
        }

        Array.from(existingMap.keys()).forEach(async (eId) => {
            if (!activeDbIds.has(eId)) {
                await patchItem("mm_rfq_quality_criteria", eId, { deleted_at: nowIso, deleted_by: userId }).catch(() => null);
            }
        });
    }

    // -------------------------------------------------------------
    // C. Sync mm_rfq_exchange_rates
    // -------------------------------------------------------------
    if (project.exchangeRates && Array.isArray(project.exchangeRates)) {
        const existingRates = await fetchCollection<Record<string, unknown>>(
            "mm_rfq_exchange_rates",
            `filter[rfq_id][_eq]=${rfqId}&filter[deleted_at][_null]=true`
        );
        const rateCodeMap = new Map<string, number>();
        existingRates.forEach((r) => rateCodeMap.set(String(r.currency_code), Number(r.id)));

        const activeCodes = new Set<string>();

        for (const er of project.exchangeRates) {
            activeCodes.add(er.currencyCode);
            const payload = {
                rfq_id: rfqId,
                currency_code: er.currencyCode,
                rate_to_comparison: er.rateToComparison ?? 1.0,
            };

            const existingId = rateCodeMap.get(er.currencyCode);
            if (existingId) {
                await patchItem("mm_rfq_exchange_rates", existingId, payload);
            } else {
                await postItem("mm_rfq_exchange_rates", payload);
            }
        }

        Array.from(rateCodeMap.entries()).forEach(async ([code, rId]) => {
            if (!activeCodes.has(code)) {
                await patchItem("mm_rfq_exchange_rates", rId, { deleted_at: nowIso, deleted_by: userId }).catch(() => null);
            }
        });
    }

    // -------------------------------------------------------------
    // D. Sync mm_rfq_customs_rates
    // -------------------------------------------------------------
    if (project.customsRates) {
        const cr = project.customsRates;
        const existingCustoms = await fetchCollection<Record<string, unknown>>(
            "mm_rfq_customs_rates",
            `filter[rfq_id][_eq]=${rfqId}&filter[deleted_at][_null]=true&limit=1`
        );

        const customsPayload = {
            rfq_id: rfqId,
            cds_comp_curr: cr.cdsCompCurr ?? 100,
            bir_dst_comp_curr: cr.birDstCompCurr ?? 30,
            container_security_usd: cr.containerSecurityUsd ?? 5,
            arrastre_20ft_comp_curr: cr.arrastre20ftCompCurr ?? 4738,
            arrastre_40ft_comp_curr: cr.arrastre40ftCompCurr ?? 10869,
            wharfage_20ft_comp_curr: cr.wharfage20ftCompCurr ?? 519.35,
            wharfage_40ft_comp_curr: cr.wharfage40ftCompCurr ?? 779.05,
            lcl_arrastre_per_rt_comp_curr: cr.lclArrastrePerRtCompCurr ?? 149,
            lcl_wharfage_per_rt_comp_curr: cr.lclWharfagePerRtCompCurr ?? 30.55,
            lc_bank_charge_pct: cr.lcBankChargePct ?? 0.1250,
        };

        if (existingCustoms.length > 0) {
            await patchItem("mm_rfq_customs_rates", Number(existingCustoms[0].id), customsPayload);
        } else {
            await postItem("mm_rfq_customs_rates", customsPayload);
        }
    }

    // -------------------------------------------------------------
    // E. Sync mm_rfq_ipc_brackets
    // -------------------------------------------------------------
    if (project.ipcBrackets && Array.isArray(project.ipcBrackets)) {
        const existingIpc = await fetchCollection<Record<string, unknown>>(
            "mm_rfq_ipc_brackets",
            `filter[rfq_id][_eq]=${rfqId}&filter[deleted_at][_null]=true`
        );
        const ipcOrderMap = new Map<number, number>();
        existingIpc.forEach((b) => ipcOrderMap.set(Number(b.bracket_order), Number(b.id)));

        const activeOrders = new Set<number>();

        for (const b of project.ipcBrackets) {
            activeOrders.add(b.bracketOrder);
            const payload = {
                rfq_id: rfqId,
                bracket_order: b.bracketOrder,
                max_dutiable_value_comp_curr: b.maxDutiableValueCompCurr ?? null,
                charge_comp_curr: b.chargeCompCurr,
            };

            const existingId = ipcOrderMap.get(b.bracketOrder);
            if (existingId) {
                await patchItem("mm_rfq_ipc_brackets", existingId, payload);
            } else {
                await postItem("mm_rfq_ipc_brackets", payload);
            }
        }

        Array.from(ipcOrderMap.entries()).forEach(async ([order, bId]) => {
            if (!activeOrders.has(order)) {
                await patchItem("mm_rfq_ipc_brackets", bId, { deleted_at: nowIso, deleted_by: userId }).catch(() => null);
            }
        });
    }

    // -------------------------------------------------------------
    // F. Sync mm_rfq_bids & child entities (bid_items, price_breaks, scores, attachments)
    // -------------------------------------------------------------
    if (project.bids && Array.isArray(project.bids)) {
        const existingBids = await fetchCollection<Record<string, unknown>>(
            "mm_rfq_bids",
            `filter[rfq_id][_eq]=${rfqId}&filter[deleted_at][_null]=true`
        );
        const existingBidMap = new Map<number, Record<string, unknown>>();
        existingBids.forEach((b) => existingBidMap.set(Number(b.id), b));

        const activeBidDbIds = new Set<number>();

        for (const bid of project.bids) {
            const bidDbId = parseDbId(bid.dbId) || parseDbId(bid.id);
            const bidPayload = {
                rfq_id: rfqId,
                supplier_id: bid.supplierId || null,
                supplier_name: bid.supplierName,
                supplier_type: bid.supplierType || "LOCAL",
                country: bid.country || "Philippines",
                contact_person: bid.contactPerson || "",
                contact_email: bid.contactEmail || "",
                contact_phone: bid.contactPhone || "",
                quote_currency: bid.quoteCurrency || "PHP",
                quotation_ref: bid.quotationRef || "",
                quote_date: bid.quoteDate ? bid.quoteDate.slice(0, 10) : null,
                valid_until: bid.validUntil ? bid.validUntil.slice(0, 10) : null,
                lead_time_days: bid.leadTimeDays ?? 0,
                notes: bid.notes || "",
                incoterm: bid.incoterm || "DELIVERED",
                vat_pct: bid.vatPct ?? 12.0,
                prices_include_vat: bid.pricesIncludeVat ? 1 : 0,
                inland_trucking_comp_curr: bid.inlandTruckingCompCurr ?? 0,
                freight_basis: bid.freightBasis || "LUMP_SUM",
                freight_rate: bid.freightRate ?? 0,
                freight_minimum: bid.freightMinimum ?? 0,
                freight_currency: bid.freightCurrency || "PHP",
                insurance_basis: bid.insuranceBasis || "PCT_GOODS_AND_FREIGHT",
                insurance_rate_or_amount: bid.insuranceRateOrAmount ?? 0,
                insurance_currency: bid.insuranceCurrency || "PHP",
                duty_mode: bid.dutyMode || "PER_ITEM",
                fta_agreement_name: bid.ftaAgreementName || null,
                fta_duty_pct: bid.ftaDutyPct ?? 0,
                single_duty_pct: bid.singleDutyPct ?? 0,
                brokerage_comp_curr: bid.brokerageCompCurr ?? 0,
                other_port_charges_comp_curr: bid.otherPortChargesCompCurr ?? 0,
                shipment_type: bid.shipmentType || "AUTO",
                containers_20ft: bid.containers20ft ?? 0,
                containers_40ft: bid.containers40ft ?? 0,
                declarations_count: bid.declarationsCount ?? 1,
                paid_by_lc: bid.paidByLc ? 1 : 0,
                down_payment_pct: bid.downPaymentPct ?? 0,
                balance_due_days: bid.balanceDueDays ?? 0,
                early_pay_discount_pct: bid.earlyPayDiscountPct ?? 0,
                early_pay_discount_days: bid.earlyPayDiscountDays ?? 0,
                take_early_pay_discount: bid.takeEarlyPayDiscount ? 1 : 0,
                bank_fee_per_payment_comp_curr: bid.bankFeePerPaymentCompCurr ?? 0,
            };

            let resolvedBidId: number;
            if (bidDbId && existingBidMap.has(bidDbId)) {
                await patchItem("mm_rfq_bids", bidDbId, bidPayload);
                resolvedBidId = bidDbId;
            } else {
                const created = await postItem<{ id: number }>("mm_rfq_bids", bidPayload);
                resolvedBidId = Number(created.id);
            }

            bidIdMap.set(bid.id, resolvedBidId);
            activeBidDbIds.add(resolvedBidId);

            // ---------------------------------------------------------
            // F1. Sync mm_rfq_bid_items & mm_rfq_bid_price_breaks
            // ---------------------------------------------------------
            if (bid.quotations && typeof bid.quotations === "object") {
                const existingBidItems = await fetchCollection<Record<string, unknown>>(
                    "mm_rfq_bid_items",
                    `filter[rfq_bid_id][_eq]=${resolvedBidId}&filter[deleted_at][_null]=true`
                );
                const existingBiMap = new Map<number, number>(); // rfq_item_id -> bid_item_id
                existingBidItems.forEach((bi) => existingBiMap.set(Number(bi.rfq_item_id), Number(bi.id)));

                const activeBiIds = new Set<number>();

                const quotationEntries = Object.entries(bid.quotations) as [string, ItemQuotation][];
                for (const [rfqItemId, quotation] of quotationEntries) {
                    const resolvedItemId = itemIdMap.get(rfqItemId) || parseDbId(rfqItemId);
                    if (!resolvedItemId) continue;

                    const biPayload = {
                        rfq_bid_id: resolvedBidId,
                        rfq_item_id: resolvedItemId,
                        discount_pct: quotation.discountPct ?? 0,
                    };

                    let resolvedBiId: number;
                    const existingBiId = existingBiMap.get(resolvedItemId);
                    if (existingBiId) {
                        await patchItem("mm_rfq_bid_items", existingBiId, biPayload);
                        resolvedBiId = existingBiId;
                    } else {
                        const created = await postItem<{ id: number }>("mm_rfq_bid_items", biPayload);
                        resolvedBiId = Number(created.id);
                    }

                    bidItemIdMap.set(`${bid.id}_${rfqItemId}`, resolvedBiId);
                    activeBiIds.add(resolvedBiId);

                    // Price Breaks for this bid item
                    if (quotation.priceBreaks && Array.isArray(quotation.priceBreaks)) {
                        const existingPbs = await fetchCollection<Record<string, unknown>>(
                            "mm_rfq_bid_price_breaks",
                            `filter[rfq_bid_item_id][_eq]=${resolvedBiId}&filter[deleted_at][_null]=true`
                        );
                        const existingPbQtyMap = new Map<number, number>(); // min_quantity -> id
                        existingPbs.forEach((pb) => existingPbQtyMap.set(Number(pb.min_quantity), Number(pb.id)));

                        const activePbIds = new Set<number>();

                        for (const pb of quotation.priceBreaks) {
                            const pbPayload = {
                                rfq_bid_item_id: resolvedBiId,
                                min_quantity: pb.minQuantity ?? 1,
                                unit_price: pb.unitPrice,
                            };

                            const existingPbId = existingPbQtyMap.get(Number(pb.minQuantity));
                            if (existingPbId) {
                                await patchItem("mm_rfq_bid_price_breaks", existingPbId, pbPayload);
                                activePbIds.add(existingPbId);
                            } else {
                                const createdPb = await postItem<{ id: number }>("mm_rfq_bid_price_breaks", pbPayload);
                                activePbIds.add(Number(createdPb.id));
                            }
                        }

                        for (const pb of existingPbs) {
                            const pbId = Number(pb.id);
                            if (!activePbIds.has(pbId)) {
                                await patchItem("mm_rfq_bid_price_breaks", pbId, { deleted_at: nowIso, deleted_by: userId }).catch(() => null);
                            }
                        }
                    }
                }

                // Soft-delete removed bid items
                for (const bi of existingBidItems) {
                    const biId = Number(bi.id);
                    if (!activeBiIds.has(biId)) {
                        await patchItem("mm_rfq_bid_items", biId, { deleted_at: nowIso, deleted_by: userId }).catch(() => null);
                    }
                }
            }

            // ---------------------------------------------------------
            // F2. Sync mm_rfq_bid_scores
            // ---------------------------------------------------------
            if (bid.scores && typeof bid.scores === "object") {
                const existingScores = await fetchCollection<Record<string, unknown>>(
                    "mm_rfq_bid_scores",
                    `filter[rfq_bid_id][_eq]=${resolvedBidId}&filter[deleted_at][_null]=true`
                );
                const scoreCritMap = new Map<number, number>(); // criterion_id -> score_id
                existingScores.forEach((sc) => scoreCritMap.set(Number(sc.criterion_id), Number(sc.id)));

                const activeCritIds = new Set<number>();

                const scoreEntries = Object.entries(bid.scores) as [
                    string,
                    { passFailResult?: "PASS" | "FAIL" | "NOT_CHECKED"; score?: number | null; evidenceRemarks?: string }
                ][];
                for (const [critId, scoreObj] of scoreEntries) {
                    const resolvedCritId = critIdMap.get(critId) || parseDbId(critId);
                    if (!resolvedCritId) continue;

                    // Ensure score is 1-5 or null per MySQL chk_bid_score_range
                    let sanitizedScore: number | null = null;
                    if (typeof scoreObj.score === "number" && scoreObj.score >= 1 && scoreObj.score <= 5) {
                        sanitizedScore = Math.round(scoreObj.score);
                    }

                    const scorePayload = {
                        rfq_bid_id: resolvedBidId,
                        criterion_id: resolvedCritId,
                        pass_fail_result: scoreObj.passFailResult || "NOT_CHECKED",
                        score: sanitizedScore,
                        evidence_remarks: scoreObj.evidenceRemarks || "",
                    };

                    activeCritIds.add(resolvedCritId);
                    const existingScoreId = scoreCritMap.get(resolvedCritId);
                    if (existingScoreId) {
                        await patchItem("mm_rfq_bid_scores", existingScoreId, scorePayload);
                    } else {
                        await postItem("mm_rfq_bid_scores", scorePayload);
                    }
                }

                Array.from(scoreCritMap.entries()).forEach(async ([cId, sId]) => {
                    if (!activeCritIds.has(cId)) {
                        await patchItem("mm_rfq_bid_scores", sId, { deleted_at: nowIso, deleted_by: userId }).catch(() => null);
                    }
                });
            }

            // ---------------------------------------------------------
            // F3. Sync mm_rfq_bid_attachments
            // ---------------------------------------------------------
            if (bid.attachments && Array.isArray(bid.attachments)) {
                const existingAttachments = await fetchCollection<Record<string, unknown>>(
                    "mm_rfq_bid_attachments",
                    `filter[rfq_bid_id][_eq]=${resolvedBidId}&filter[deleted_at][_null]=true`
                );
                const existingAttMap = new Map<number, number>(); // att.id -> id
                existingAttachments.forEach((att) => existingAttMap.set(Number(att.id), Number(att.id)));

                const activeAttIds = new Set<number>();

                for (const att of bid.attachments) {
                    const existingAttId = att.dbId || (typeof att.id === "number" ? att.id : parseDbId(att.id));

                    // Directus file ID must be a valid 36-char string per schema
                    const validDirectusId = (att.directusFileId && att.directusFileId.length === 36)
                        ? att.directusFileId
                        : crypto.randomUUID();

                    const attPayload = {
                        rfq_bid_id: resolvedBidId,
                        directus_file_id: validDirectusId,
                        file_name: att.fileName || "unnamed_document",
                        mime_type: att.mimeType || "application/octet-stream",
                        file_size: att.fileSize || 0,
                        document_type: att.documentType || "Quotation",
                    };

                    if (existingAttId && existingAttMap.has(existingAttId)) {
                        await patchItem("mm_rfq_bid_attachments", existingAttId, attPayload).catch(() => null);
                        activeAttIds.add(existingAttId);
                    } else {
                        const createdAtt = await postItem<{ id: number }>("mm_rfq_bid_attachments", attPayload).catch(() => null);
                        if (createdAtt?.id) {
                            activeAttIds.add(Number(createdAtt.id));
                        }
                    }
                }

                for (const att of existingAttachments) {
                    const attId = Number(att.id);
                    if (!activeAttIds.has(attId)) {
                        await patchItem("mm_rfq_bid_attachments", attId, { deleted_at: nowIso, deleted_by: userId }).catch(() => null);
                    }
                }
            }
        }

        // Soft-delete removed bids
        Array.from(existingBidMap.keys()).forEach(async (eBidId) => {
            if (!activeBidDbIds.has(eBidId)) {
                await patchItem("mm_rfq_bids", eBidId, { deleted_at: nowIso, deleted_by: userId }).catch(() => null);
            }
        });
    }

    // -------------------------------------------------------------
    // G. Sync mm_rfq_awards
    // -------------------------------------------------------------
    if (project.awards && Array.isArray(project.awards)) {
        const existingAwards = await fetchCollection<Record<string, unknown>>(
            "mm_rfq_awards",
            `filter[rfq_id][_eq]=${rfqId}&filter[status][_eq]=ACTIVE`
        );
        const existingAwardItemMap = new Map<number, number>(); // rfq_item_id -> award_id
        existingAwards.forEach((aw) => existingAwardItemMap.set(Number(aw.rfq_item_id), Number(aw.id)));

        const activeAwardItemIds = new Set<number>();

        for (const aw of project.awards) {
            const resolvedItemId = itemIdMap.get(aw.rfqItemId) || parseDbId(aw.rfqItemId);
            const resolvedBidId = bidIdMap.get(aw.rfqBidId) || parseDbId(aw.rfqBidId);
            const resolvedBidItemId = bidItemIdMap.get(`${aw.rfqBidId}_${aw.rfqItemId}`) || parseDbId(aw.id);

            if (!resolvedItemId || !resolvedBidId || !resolvedBidItemId) continue;

            activeAwardItemIds.add(resolvedItemId);

            const awardPayload = {
                rfq_id: rfqId,
                rfq_item_id: resolvedItemId,
                rfq_bid_id: resolvedBidId,
                awarded_bid_item_id: resolvedBidItemId,
                awarded_supplier_id: aw.awardedSupplierId || null,
                awarded_landed_unit_cost: aw.awardedLandedUnitCost,
                awarded_landed_total: aw.awardedLandedTotal,
                purchase_order_id: aw.purchaseOrderId || null,
                status: "ACTIVE",
            };

            const existingAwardId = existingAwardItemMap.get(resolvedItemId);
            if (existingAwardId) {
                await patchItem("mm_rfq_awards", existingAwardId, awardPayload);
            } else {
                await postItem("mm_rfq_awards", awardPayload);
            }
        }

        // Revoke active awards that are no longer selected
        Array.from(existingAwardItemMap.entries()).forEach(async ([itemDbId, awId]) => {
            if (!activeAwardItemIds.has(itemDbId)) {
                await patchItem("mm_rfq_awards", awId, {
                    status: "REVOKED",
                    revoked_at: nowIso,
                    revoked_by: userId,
                    revocation_reason: "Award updated in Supplier Bid Comparison module",
                }).catch(() => null);
            }
        });
    }
}

/**
 * DELETE /api/manufacturing/procurement-and-inbound/supplier-bid-comparison
 * Soft-deletes an RFQ project: sets deleted_at and deleted_by
 */
export async function DELETE(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const rfqId = searchParams.get("id");
        if (!rfqId) {
            return NextResponse.json({ error: "Missing project id" }, { status: 400 });
        }

        const userId = getJwtSubFromReq(request);
        const headers = getHeaders();

        const nowIso = new Date().toISOString();

        // 1. Soft delete project header
        const res = await fetch(`${DIRECTUS_URL}/items/mm_rfq/${rfqId}`, {
            method: "PATCH",
            headers,
            body: JSON.stringify({
                deleted_at: nowIso,
                deleted_by: userId,
            }),
        });

        if (!res.ok) {
            return NextResponse.json(
                { success: false, error: `Failed to soft-delete project: ${res.status}` },
                { status: res.status }
            );
        }

        // 2. Cascade soft-delete active child entities without hard deleting
        const childCollections = [
            "mm_rfq_items",
            "mm_rfq_quality_criteria",
            "mm_rfq_exchange_rates",
            "mm_rfq_customs_rates",
            "mm_rfq_ipc_brackets",
            "mm_rfq_bids",
        ];

        for (const col of childCollections) {
            try {
                const activeChildren = await fetchCollection<{ id: number }>(
                    col,
                    `filter[rfq_id][_eq]=${rfqId}&filter[deleted_at][_null]=true&fields=id`
                );
                for (const child of activeChildren) {
                    await patchItem(col, child.id, {
                        deleted_at: nowIso,
                        deleted_by: userId,
                    }).catch(() => null);
                }
            } catch {
                // Ignore child cascade errors to ensure response succeeds
            }
        }

        return NextResponse.json({ success: true, message: "Project soft-deleted successfully" });
    } catch (error) {
        return NextResponse.json(
            { success: false, error: (error as Error).message || "Failed to delete project" },
            { status: 500 }
        );
    }
}
