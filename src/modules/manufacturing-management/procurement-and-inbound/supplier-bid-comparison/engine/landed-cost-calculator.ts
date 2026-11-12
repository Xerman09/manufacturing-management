import {
    CustomsChargesConfig,
    Incoterm,
    IpcBracket,
    ItemLandedCostBreakdown,
    RequestedItem,
    RfqProject,
    SupplierBid,
    SupplierLandedCostResult,
} from "../types";
import { INCOTERMS_CONFIG } from "../constants/incoterms";

/**
 * Resolves the exchange rate of a given currency against the comparison currency.
 * If currency is comparison currency, returns 1.0.
 */
export function getExchangeRate(
    currency: string,
    comparisonCurrency: string,
    rates: Record<string, number>
): number {
    const cur = (currency || "").toUpperCase().trim();
    const comp = (comparisonCurrency || "PHP").toUpperCase().trim();
    if (!cur || cur === comp) return 1.0;
    return rates[cur] || 1.0;
}

/**
 * Lookup IPC bracket fee based on dutiable value per declaration.
 */
export function lookupIpcCharge(dutiableValuePerDeclaration: number, brackets: IpcBracket[]): number {
    const sorted = [...brackets].sort((a, b) => a.bracketOrder - b.bracketOrder);
    for (const b of sorted) {
        if (b.maxDutiableValueCompCurr !== null) {
            if (dutiableValuePerDeclaration <= b.maxDutiableValueCompCurr) {
                return b.chargeCompCurr;
            }
        } else {
            return b.chargeCompCurr; // Highest bracket
        }
    }
    return 2000;
}

/**
 * Computes containers needed for FCL based on total volume.
 * Usable: 40' container ≈ 58 m³, 20' container ≈ 28 m³.
 */
export function estimateContainers(totalVolumeM3: number): {
    containers20ft: number;
    containers40ft: number;
    teuCount: number;
} {
    if (totalVolumeM3 <= 0) {
        return { containers20ft: 0, containers40ft: 0, teuCount: 0 };
    }
    const c40 = Math.floor(totalVolumeM3 / 58);
    const rem = totalVolumeM3 - c40 * 58;
    let c20 = 0;
    let extra40 = 0;

    if (rem > 0) {
        if (rem <= 28) {
            c20 = 1;
        } else {
            extra40 = 1;
        }
    }

    const containers40ft = c40 + extra40;
    const containers20ft = c20;
    const teuCount = containers20ft * 1 + containers40ft * 2;

    return { containers20ft, containers40ft, teuCount };
}

/**
 * Calculates landed cost for a single supplier bid across the requested items.
 * Can restrict calculation to a subset of item IDs (for split-award optimization).
 */
export function calculateSupplierLandedCost(
    project: Pick<
        RfqProject,
        | "comparisonCurrency"
        | "fxRiskBufferPct"
        | "costOfMoneyPctPerYear"
        | "defaultVatPct"
        | "countVatAsCost"
        | "calcCustomsAuto"
        | "customsRates"
        | "ipcBrackets"
        | "exchangeRates"
        | "qualityCriteria"
        | "budget"
    >,
    items: RequestedItem[],
    bid: SupplierBid,
    awardedItemIds?: Set<string>
): SupplierLandedCostResult {
    const compCurr = project.comparisonCurrency || "PHP";
    const ratesMap: Record<string, number> = {};
    for (const r of project.exchangeRates || []) {
        ratesMap[r.currencyCode.toUpperCase()] = r.rateToComparison;
    }

    const supplierFxRate = getExchangeRate(bid.quoteCurrency, compCurr, ratesMap);
    const freightFxRate = getExchangeRate(bid.freightCurrency, compCurr, ratesMap);
    const insuranceFxRate = getExchangeRate(bid.insuranceCurrency, compCurr, ratesMap);
    const usdFxRate = getExchangeRate("USD", compCurr, ratesMap);

    const incoterm = INCOTERMS_CONFIG[bid.incoterm || "DELIVERED"] || INCOTERMS_CONFIG.DELIVERED;
    const isLocal = bid.supplierType === "LOCAL";

    const warnings: string[] = [];
    const blockingIssues: string[] = [];

    // Filter items if awardedItemIds is provided
    const evaluatedItems = awardedItemIds
        ? items.filter((it) => awardedItemIds.has(it.id))
        : items;

    // 1. Quoted Goods Total
    let goodsQuotedForeign = 0;
    let goodsAfterDiscountForeign = 0;
    let goodsQuotedCompCurr = 0;
    let goodsAfterDiscountCompCurr = 0;
    let discountTotalCompCurr = 0;

    let totalWeightKg = 0;
    let totalVolumeM3 = 0;

    let quotedItemCount = 0;
    const itemBreakdowns: Record<string, ItemLandedCostBreakdown> = {};

    for (const item of items) {
        const isAwarded = !awardedItemIds || awardedItemIds.has(item.id);
        const quote = bid.quotations?.[item.id];

        if (!quote || !quote.priceBreaks || quote.priceBreaks.length === 0) {
            itemBreakdowns[item.id] = {
                rfqItemId: item.id,
                quotedUnitPrice: 0,
                appliedUnitPriceForeign: 0,
                discountPct: 0,
                unitPriceDiscountedForeign: 0,
                goodsForeign: 0,
                goodsCompCurr: 0,
                freightCompCurr: 0,
                insuranceCompCurr: 0,
                cifCompCurr: 0,
                fxBufferCompCurr: 0,
                dutyRatePct: 0,
                dutyCompCurr: 0,
                vatCompCurr: 0,
                fixedChargesCompCurr: 0,
                totalLandedCompCurr: 0,
                landedUnitCostCompCurr: 0,
                targetPriceCompCurr: item.targetUnitPrice,
                varianceVsTargetCompCurr: 0,
                varianceVsTargetPct: 0,
                isBelowMoq: false,
                nextBreakUnitsNeeded: null,
                nextBreakSavingsCompCurr: null,
                hasQuote: false,
            };
            if (isAwarded) {
                warnings.push(`Item unquoted: "${item.itemName}" has no submitted quotation`);
            }
            continue;
        }

        quotedItemCount += 1;
        const discountPct = quote.discountPct || 0;
        const sortedBreaks = [...quote.priceBreaks].sort((a, b) => a.minQuantity - b.minQuantity);

        // Find applicable break where orderQty >= minQuantity
        let chosenBreak = sortedBreaks[0];
        let isBelowMoq = false;

        const matchingBreaks = sortedBreaks.filter((br) => item.quantity >= br.minQuantity);
        if (matchingBreaks.length > 0) {
            // Take lowest unit price among matching breaks
            chosenBreak = matchingBreaks.reduce((prev, curr) =>
                curr.unitPrice < prev.unitPrice ? curr : prev
            );
        } else {
            // Below MOQ: use first break and flag
            chosenBreak = sortedBreaks[0];
            isBelowMoq = true;
            if (isAwarded) {
                warnings.push(`"${item.itemName}": Order quantity (${item.quantity.toLocaleString()} ${item.uom}) is below supplier minimum order quantity of ${chosenBreak.minQuantity.toLocaleString()} ${item.uom}`);
            }
        }

        // Check if ordering slightly more drops unit price
        let nextBreakUnitsNeeded: number | null = null;
        let nextBreakSavingsCompCurr: number | null = null;
        const higherBreaks = sortedBreaks.filter(
            (br) => br.minQuantity > item.quantity && br.unitPrice < chosenBreak.unitPrice
        );
        if (higherBreaks.length > 0) {
            const nextBreak = higherBreaks[0];
            const extraUnits = nextBreak.minQuantity - item.quantity;
            nextBreakUnitsNeeded = extraUnits;
            const currentCost = chosenBreak.unitPrice * item.quantity * (1 - discountPct / 100);
            const nextCost = nextBreak.unitPrice * nextBreak.minQuantity * (1 - discountPct / 100);
            const savings = currentCost - nextCost;
            if (savings > 0) {
                nextBreakSavingsCompCurr = Number((savings * supplierFxRate).toFixed(2));
            }
        }

        const quotedUnitPrice = chosenBreak.unitPrice;
        const unitPriceDiscountedForeign = quotedUnitPrice * (1 - discountPct / 100);
        const itemGoodsForeign = quotedUnitPrice * item.quantity;
        const itemGoodsAfterDiscountForeign = unitPriceDiscountedForeign * item.quantity;

        const itemGoodsCompCurr = Number((itemGoodsForeign * supplierFxRate).toFixed(2));
        const itemGoodsAfterDiscountCompCurr = Number((itemGoodsAfterDiscountForeign * supplierFxRate).toFixed(2));
        const itemDiscountCompCurr = Number((itemGoodsCompCurr - itemGoodsAfterDiscountCompCurr).toFixed(2));

        if (isAwarded) {
            goodsQuotedForeign += itemGoodsForeign;
            goodsAfterDiscountForeign += itemGoodsAfterDiscountForeign;
            goodsQuotedCompCurr += itemGoodsCompCurr;
            goodsAfterDiscountCompCurr += itemGoodsAfterDiscountCompCurr;
            discountTotalCompCurr += itemDiscountCompCurr;

            totalWeightKg += item.quantity * (item.weightPerUnitKg || 0);
            totalVolumeM3 += item.quantity * (item.cbmPerUnit || 0);
        }

        itemBreakdowns[item.id] = {
            rfqItemId: item.id,
            quotedUnitPrice,
            appliedUnitPriceForeign: quotedUnitPrice,
            discountPct,
            unitPriceDiscountedForeign,
            goodsForeign: itemGoodsAfterDiscountForeign,
            goodsCompCurr: itemGoodsAfterDiscountCompCurr,
            freightCompCurr: 0,
            insuranceCompCurr: 0,
            cifCompCurr: 0,
            fxBufferCompCurr: 0,
            dutyRatePct: 0,
            dutyCompCurr: 0,
            vatCompCurr: 0,
            fixedChargesCompCurr: 0,
            totalLandedCompCurr: 0,
            landedUnitCostCompCurr: 0,
            targetPriceCompCurr: item.targetUnitPrice,
            varianceVsTargetCompCurr: 0,
            varianceVsTargetPct: 0,
            isBelowMoq,
            nextBreakUnitsNeeded,
            nextBreakSavingsCompCurr,
            hasQuote: true,
        };
    }

    const isFullBid = quotedItemCount === items.length;
    const revenueTons = Math.max(totalVolumeM3, totalWeightKg / 1000);

    // 2. Shipment Sizing
    let shipmentType = bid.shipmentType || "AUTO";
    if (shipmentType === "AUTO") {
        if (bid.freightBasis === "PER_KG") {
            shipmentType = "AIR";
        } else if (totalVolumeM3 >= 15.0) {
            shipmentType = "FCL";
        } else {
            shipmentType = "LCL";
        }
    }

    let estimatedContainers20ft = bid.containers20ft || 0;
    let estimatedContainers40ft = bid.containers40ft || 0;
    let teuCount = estimatedContainers20ft * 1 + estimatedContainers40ft * 2;

    if (shipmentType === "FCL") {
        if (estimatedContainers20ft === 0 && estimatedContainers40ft === 0) {
            const autoEst = estimateContainers(totalVolumeM3);
            estimatedContainers20ft = autoEst.containers20ft;
            estimatedContainers40ft = autoEst.containers40ft;
            teuCount = autoEst.teuCount;
        }
    }

    // 3. Freight & Insurance
    let freightCompCurr = 0;
    let insuranceCompCurr = 0;

    if (!isLocal && incoterm.buyerPaysFreight) {
        if (bid.freightBasis === "LUMP_SUM") {
            freightCompCurr = Number((bid.freightRate * freightFxRate).toFixed(2));
        } else if (bid.freightBasis === "PER_CBM") {
            const calculated = bid.freightRate * totalVolumeM3;
            const applied = Math.max(calculated, bid.freightMinimum || 0);
            freightCompCurr = Number((applied * freightFxRate).toFixed(2));
        } else if (bid.freightBasis === "PER_KG") {
            const calculated = bid.freightRate * totalWeightKg;
            const applied = Math.max(calculated, bid.freightMinimum || 0);
            freightCompCurr = Number((applied * freightFxRate).toFixed(2));
        } else if (bid.freightBasis === "PCT_GOODS") {
            const applied = (bid.freightRate / 100) * goodsAfterDiscountForeign;
            freightCompCurr = Number((applied * supplierFxRate).toFixed(2));
        }

        if (freightCompCurr === 0 && goodsAfterDiscountCompCurr > 0) {
            warnings.push(`Under ${bid.incoterm} terms, freight is payable by the buyer but no freight rate has been entered`);
        }
    }

    if (!isLocal && incoterm.buyerPaysInsurance) {
        if (bid.insuranceBasis === "PCT_GOODS_AND_FREIGHT") {
            const baseCompCurr = goodsAfterDiscountCompCurr + freightCompCurr;
            insuranceCompCurr = Number(((bid.insuranceRateOrAmount / 100) * baseCompCurr).toFixed(2));
        } else {
            insuranceCompCurr = Number((bid.insuranceRateOrAmount * insuranceFxRate).toFixed(2));
        }
    }

    const cifDutiableValueCompCurr = isLocal
        ? goodsAfterDiscountCompCurr
        : Number((goodsAfterDiscountCompCurr + freightCompCurr + insuranceCompCurr).toFixed(2));

    // 4. FX Risk Buffer
    let fxBufferCompCurr = 0;
    const fxRiskPct = project.fxRiskBufferPct || 0;
    if (fxRiskPct > 0 && !isLocal) {
        let bufferBaseCompCurr = 0;
        if (bid.quoteCurrency.toUpperCase() !== compCurr) {
            bufferBaseCompCurr += goodsAfterDiscountCompCurr;
        }
        if (
            bid.freightBasis !== "PCT_GOODS" &&
            bid.freightCurrency.toUpperCase() !== compCurr &&
            incoterm.buyerPaysFreight
        ) {
            bufferBaseCompCurr += freightCompCurr;
        }
        if (
            bid.insuranceBasis === "FIXED_AMOUNT" &&
            bid.insuranceCurrency.toUpperCase() !== compCurr &&
            incoterm.buyerPaysInsurance
        ) {
            bufferBaseCompCurr += insuranceCompCurr;
        }
        fxBufferCompCurr = Number(((fxRiskPct / 100) * bufferBaseCompCurr).toFixed(2));
    }

    // 5. Import Duty
    let dutyCompCurr = 0;
    if (!isLocal && incoterm.buyerPaysDutyAndVat) {
        for (const item of evaluatedItems) {
            const breakdown = itemBreakdowns[item.id];
            if (!breakdown || !breakdown.hasQuote) continue;

            // Allocate share of freight and insurance to item
            let freightShare = 0;
            if (freightCompCurr > 0) {
                if (bid.freightBasis === "PER_CBM" && totalVolumeM3 > 0) {
                    freightShare = (item.quantity * item.cbmPerUnit / totalVolumeM3) * freightCompCurr;
                } else if (bid.freightBasis === "PER_KG" && totalWeightKg > 0) {
                    freightShare = (item.quantity * item.weightPerUnitKg / totalWeightKg) * freightCompCurr;
                } else if (goodsAfterDiscountCompCurr > 0) {
                    freightShare = (breakdown.goodsCompCurr / goodsAfterDiscountCompCurr) * freightCompCurr;
                }
            }

            let insuranceShare = 0;
            if (insuranceCompCurr > 0 && goodsAfterDiscountCompCurr > 0) {
                insuranceShare = (breakdown.goodsCompCurr / goodsAfterDiscountCompCurr) * insuranceCompCurr;
            }

            const itemCif = breakdown.goodsCompCurr + freightShare + insuranceShare;
            breakdown.freightCompCurr = Number(freightShare.toFixed(2));
            breakdown.insuranceCompCurr = Number(insuranceShare.toFixed(2));
            breakdown.cifCompCurr = Number(itemCif.toFixed(2));

            let dutyRate = item.dutyPct || 0;
            if (bid.dutyMode === "FTA") {
                dutyRate = bid.ftaDutyPct || 0;
            } else if (bid.dutyMode === "ONE_RATE") {
                dutyRate = bid.singleDutyPct || 0;
            }

            breakdown.dutyRatePct = dutyRate;
            const itemDuty = Number(((dutyRate / 100) * itemCif).toFixed(2));
            breakdown.dutyCompCurr = itemDuty;
            dutyCompCurr += itemDuty;
        }
        dutyCompCurr = Number(dutyCompCurr.toFixed(2));
    }

    // 6. Customs & Port Charges (Philippine BOC)
    const declarationsCount = Math.max(bid.declarationsCount || 1, 1);
    const dutiablePerDeclaration = cifDutiableValueCompCurr / declarationsCount;

    let ipcCompCurr = 0;
    let cdsCompCurr = 0;
    let birDstCompCurr = 0;
    let arrastreCompCurr = 0;
    let wharfageCompCurr = 0;
    let containerSecurityCompCurr = 0;
    let lcBankChargeCompCurr = 0;
    let otherPortChargesCompCurr = bid.otherPortChargesCompCurr || 0;
    let brokerageCompCurr = 0;

    if (!isLocal && incoterm.buyerPaysBrokerageAndCustoms) {
        brokerageCompCurr = bid.brokerageCompCurr || 0;

        if (project.calcCustomsAuto) {
            const customsRates = project.customsRates;
            // IPC
            const ipcChargePerDecl = lookupIpcCharge(dutiablePerDeclaration, project.ipcBrackets);
            ipcCompCurr = ipcChargePerDecl * declarationsCount;

            // CDS & DST
            cdsCompCurr = (customsRates.cdsCompCurr || 100) * declarationsCount;
            birDstCompCurr = (customsRates.birDstCompCurr || 30) * declarationsCount;

            // Arrastre & Wharfage
            if (incoterm.buyerPaysArrastreAndWharfage) {
                if (shipmentType === "FCL") {
                    arrastreCompCurr = Number(
                        (
                            estimatedContainers20ft * customsRates.arrastre20ftCompCurr +
                            estimatedContainers40ft * customsRates.arrastre40ftCompCurr
                        ).toFixed(2)
                    );
                    wharfageCompCurr = Number(
                        (
                            estimatedContainers20ft * customsRates.wharfage20ftCompCurr +
                            estimatedContainers40ft * customsRates.wharfage40ftCompCurr
                        ).toFixed(2)
                    );
                    containerSecurityCompCurr = Number(
                        (teuCount * customsRates.containerSecurityUsd * usdFxRate).toFixed(2)
                    );
                } else if (shipmentType === "LCL") {
                    arrastreCompCurr = Number((revenueTons * customsRates.lclArrastrePerRtCompCurr).toFixed(2));
                    wharfageCompCurr = Number((revenueTons * customsRates.lclWharfagePerRtCompCurr).toFixed(2));
                }
            }

            // LC bank charge
            if (bid.paidByLc) {
                const lcRate = (customsRates.lcBankChargePct || 0.125) / 100;
                lcBankChargeCompCurr = Number((cifDutiableValueCompCurr * lcRate).toFixed(2));
            }
        }
    }

    const customsAndPortTotalCompCurr = Number(
        (
            brokerageCompCurr +
            ipcCompCurr +
            cdsCompCurr +
            birDstCompCurr +
            arrastreCompCurr +
            wharfageCompCurr +
            containerSecurityCompCurr +
            lcBankChargeCompCurr +
            otherPortChargesCompCurr
        ).toFixed(2)
    );

    // 7. Value Added Tax (VAT)
    let vatBaseCompCurr = 0;
    let vatCompCurr = 0;
    const vatPct = bid.vatPct ?? project.defaultVatPct ?? 12.0;

    if (isLocal) {
        if (bid.pricesIncludeVat) {
            // Price already includes VAT - no additional VAT is added to landed cost
            vatCompCurr = 0;
            vatBaseCompCurr = Number((goodsAfterDiscountCompCurr / (1 + vatPct / 100)).toFixed(2));
        } else {
            vatCompCurr = Number(((vatPct / 100) * goodsAfterDiscountCompCurr).toFixed(2));
            vatBaseCompCurr = goodsAfterDiscountCompCurr;
        }
    } else if (incoterm.buyerPaysDutyAndVat) {
        // Import VAT Base excludes BIR DST and Container Security Charge
        vatBaseCompCurr = Number(
            (
                cifDutiableValueCompCurr +
                dutyCompCurr +
                brokerageCompCurr +
                otherPortChargesCompCurr +
                ipcCompCurr +
                cdsCompCurr +
                arrastreCompCurr +
                wharfageCompCurr +
                lcBankChargeCompCurr
            ).toFixed(2)
        );
        vatCompCurr = Number(((vatPct / 100) * vatBaseCompCurr).toFixed(2));
    }

    // 8. Inland Trucking
    let inlandTruckingCompCurr = 0;
    if (incoterm.buyerPaysInlandTrucking) {
        inlandTruckingCompCurr = bid.inlandTruckingCompCurr || 0;
    }

    // 9. Bank Fees
    const downPaymentPct = bid.downPaymentPct || 0;
    let paymentCount = 0;
    if (goodsAfterDiscountCompCurr > 0) {
        paymentCount = (downPaymentPct > 0 && downPaymentPct < 100) ? 2 : 1;
    }
    const bankFeeRate = bid.bankFeePerPaymentCompCurr || 0;
    const bankFeesCompCurr = Number((bankFeeRate * paymentCount).toFixed(2));

    // 10. Payment Terms Financing Cost
    // Down payment is strictly defined as % * Goods after discount
    const downPaymentCompCurr = Number(((downPaymentPct / 100) * goodsAfterDiscountCompCurr).toFixed(2));
    const balanceBeforeDiscount = goodsAfterDiscountCompCurr - downPaymentCompCurr;

    let earlyPayDiscountAmountCompCurr = 0;
    let balanceDaysAfterDelivery = bid.balanceDueDays || 0;

    if (bid.takeEarlyPayDiscount && (bid.earlyPayDiscountPct || 0) > 0) {
        earlyPayDiscountAmountCompCurr = Number(
            (((bid.earlyPayDiscountPct || 0) / 100) * balanceBeforeDiscount).toFixed(2)
        );
        balanceDaysAfterDelivery = bid.earlyPayDiscountDays || 0;
    }

    const netBalanceDueCompCurr = balanceBeforeDiscount - earlyPayDiscountAmountCompCurr;
    const costOfMoney = (project.costOfMoneyPctPerYear || 8.0) / 100;
    const leadTimeDays = bid.leadTimeDays || 0;

    const carryingCostDownPayment = (costOfMoney * downPaymentCompCurr * leadTimeDays) / 365;
    const workingCapitalBenefitBalance = (costOfMoney * netBalanceDueCompCurr * balanceDaysAfterDelivery) / 365;

    const paymentTermsCostCompCurr = Number(
        (carryingCostDownPayment - workingCapitalBenefitBalance).toFixed(2)
    );

    // 11. Total Landed Cost
    const vatCostToAdd = project.countVatAsCost ? vatCompCurr : 0;

    let totalLandedCostCompCurr = Number(
        (
            goodsAfterDiscountCompCurr +
            freightCompCurr +
            insuranceCompCurr +
            fxBufferCompCurr +
            dutyCompCurr +
            customsAndPortTotalCompCurr +
            vatCostToAdd +
            inlandTruckingCompCurr +
            bankFeesCompCurr +
            paymentTermsCostCompCurr -
            earlyPayDiscountAmountCompCurr
        ).toFixed(2)
    );

    // 12. Allocate Landed Cost to Individual Items (§8.3)
    const fixedChargesTotal =
        customsAndPortTotalCompCurr +
        inlandTruckingCompCurr +
        bankFeesCompCurr +
        paymentTermsCostCompCurr -
        earlyPayDiscountAmountCompCurr;

    for (const item of evaluatedItems) {
        const breakdown = itemBreakdowns[item.id];
        if (!breakdown || !breakdown.hasQuote) continue;

        const valueShare =
            goodsAfterDiscountCompCurr > 0 ? breakdown.goodsCompCurr / goodsAfterDiscountCompCurr : 0;

        // FX Buffer allocated specifically to each item's foreign goods and freight share
        const fG = bid.quoteCurrency.toUpperCase() !== compCurr;
        const fF = bid.freightCurrency.toUpperCase() !== compCurr;
        const itemFxBase =
            (fG ? breakdown.goodsCompCurr : 0) +
            (fF && bid.freightBasis !== "PCT_GOODS" ? breakdown.freightCompCurr : 0) +
            (fF && bid.insuranceBasis !== "PCT_GOODS_AND_FREIGHT" ? breakdown.insuranceCompCurr : 0);
        breakdown.fxBufferCompCurr = Number(((fxRiskPct / 100) * itemFxBase).toFixed(2));

        // VAT allocated in proportion to (CIF + Duty) for import, or valueShare for local
        if (project.countVatAsCost && vatCompCurr > 0) {
            let vatShare = valueShare;
            if (!isLocal) {
                const itemCifAndDuty = breakdown.cifCompCurr + breakdown.dutyCompCurr;
                const totalCifAndDuty = cifDutiableValueCompCurr + dutyCompCurr;
                vatShare = totalCifAndDuty > 0 ? itemCifAndDuty / totalCifAndDuty : valueShare;
            }
            breakdown.vatCompCurr = Number((vatShare * vatCompCurr).toFixed(2));
        } else {
            breakdown.vatCompCurr = 0;
        }

        // Fixed charges allocated by value
        breakdown.fixedChargesCompCurr = Number((valueShare * fixedChargesTotal).toFixed(2));

        // Total item landed cost
        const itemLandedTotal = Number(
            (
                breakdown.goodsCompCurr +
                breakdown.freightCompCurr +
                breakdown.insuranceCompCurr +
                breakdown.fxBufferCompCurr +
                breakdown.dutyCompCurr +
                breakdown.vatCompCurr +
                breakdown.fixedChargesCompCurr
            ).toFixed(2)
        );

        breakdown.totalLandedCompCurr = itemLandedTotal;
        breakdown.landedUnitCostCompCurr =
            item.quantity > 0 ? Number((itemLandedTotal / item.quantity).toFixed(2)) : 0;

        const variance = breakdown.landedUnitCostCompCurr - item.targetUnitPrice;
        breakdown.varianceVsTargetCompCurr = Number(variance.toFixed(2));
        breakdown.varianceVsTargetPct =
            item.targetUnitPrice > 0
                ? Number(((variance / item.targetUnitPrice) * 100).toFixed(2))
                : 0;
    }

    // 13. Quality Evaluation & Validity
    let isDisqualified = false;
    let isExpired = false;
    let expiresInDays = 999;

    if (bid.validUntil) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const validDate = new Date(bid.validUntil);
        const diffMs = validDate.getTime() - today.getTime();
        expiresInDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        if (expiresInDays < 0) {
            isExpired = true;
            blockingIssues.push(`Quote expired on ${bid.validUntil} (${Math.abs(expiresInDays)} day(s) ago)`);
        } else if (expiresInDays <= 7) {
            warnings.push(`Quote expires soon in ${expiresInDays} day(s) on ${bid.validUntil}`);
        }
    } else {
        warnings.push("Quote validity period has not been specified by supplier");
    }

    // Check pass/fail requirements explicitly by criterion name
    const passFailCriteria = (project.qualityCriteria || []).filter((c) => c.criterionType === "PASS_FAIL");
    for (const crit of passFailCriteria) {
        const evalResult = bid.scores?.[crit.id];
        if (!evalResult || evalResult.passFailResult === "NOT_CHECKED") {
            warnings.push(`Mandatory requirement pending evaluation: "${crit.criterionName}"`);
        } else if (evalResult.passFailResult === "FAIL") {
            isDisqualified = true;
            const remarks = evalResult.evidenceRemarks ? ` - Reason: ${evalResult.evidenceRemarks}` : "";
            blockingIssues.push(`Disqualified: Failed mandatory requirement "${crit.criterionName}"${remarks}`);
        }
    }

    const isValid = !isExpired && !isDisqualified;

    // Quality Score (0 to 100)
    let qualityScore = 0;
    let totalScoreWeight = 0;
    let weightedScoreSum = 0;

    for (const crit of (project as any).qualityCriteria || []) {
        if (crit.criterionType === "SCORED") {
            const scoreObj = bid.scores?.[crit.id];
            if (scoreObj && typeof scoreObj.score === "number" && scoreObj.score >= 1) {
                totalScoreWeight += crit.weightPct;
                weightedScoreSum += crit.weightPct * (scoreObj.score / 5);
            }
        }
    }

    if (totalScoreWeight > 0) {
        qualityScore = Number(((weightedScoreSum / totalScoreWeight) * 100).toFixed(2));
    }

    return {
        bidId: bid.id,
        supplierName: bid.supplierName,
        isValid,
        isDisqualified,
        isExpired,
        expiresInDays,
        isFullBid,
        quotedItemCount,
        totalItemCount: items.length,
        goodsQuotedCompCurr,
        discountTotalCompCurr,
        goodsAfterDiscountCompCurr,
        totalWeightKg: Number(totalWeightKg.toFixed(2)),
        totalVolumeM3: Number(totalVolumeM3.toFixed(4)),
        revenueTons: Number(revenueTons.toFixed(4)),
        estimatedContainers20ft,
        estimatedContainers40ft,
        teuCount,
        freightCompCurr,
        insuranceCompCurr,
        cifDutiableValueCompCurr,
        fxBufferCompCurr,
        dutyCompCurr,
        brokerageCompCurr,
        ipcCompCurr,
        cdsCompCurr,
        birDstCompCurr,
        arrastreCompCurr,
        wharfageCompCurr,
        containerSecurityCompCurr,
        lcBankChargeCompCurr,
        otherPortChargesCompCurr,
        customsAndPortTotalCompCurr,
        vatBaseCompCurr,
        vatCompCurr,
        inlandTruckingCompCurr,
        bankFeesCompCurr,
        downPaymentCompCurr,
        balanceDueCompCurr: Number(netBalanceDueCompCurr.toFixed(2)),
        earlyPayDiscountAmountCompCurr,
        paymentTermsCostCompCurr,
        totalLandedCostCompCurr,
        items: itemBreakdowns,
        qualityScore,
        priceScore: 0, // Populated during comparison across suppliers
        leadTimeScore: 0,
        overallScore: 0,
        ranking: 0,
        isRecommended: false,
        isLowest: false,
        isTopQuality: false,
        isFastest: false,
        warnings,
        blockingIssues,
    };
}
