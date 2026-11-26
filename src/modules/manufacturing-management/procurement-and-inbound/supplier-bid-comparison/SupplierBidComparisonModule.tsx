"use client";

import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Lock, Copy, Plus, Users } from "lucide-react";
import { ACTIVE_PROJECT_ID_KEY, useBidComparisonStore, isRfqProjectLocked } from "./hooks/useBidComparisonState";
import { TopBar } from "./components/layout/TopBar";
import { StepNavigation } from "./components/layout/StepNavigation";
import { StepFooterNavigation } from "./components/layout/StepFooterNavigation";
import { ImportExportModal } from "./components/shared/ImportExportModal";
import { ExportModal } from "./components/shared/ExportModal";
import { SelectProjectModal } from "./components/shared/SelectProjectModal";
import { ExecutiveRfqDirectory } from "./components/directory/ExecutiveRfqDirectory";

// Step 1: Setup Components
import { ProjectDetailsCard } from "./components/setup/ProjectDetailsCard";
import { CostAssumptionsCard } from "./components/setup/CostAssumptionsCard";
import { RequestedItemsTable } from "./components/setup/RequestedItemsTable";
import { QualityCriteriaCard } from "./components/setup/QualityCriteriaCard";
import { CustomsAndPortChargesCard } from "./components/setup/CustomsAndPortChargesCard";
import { ExchangeRatesCard } from "./components/setup/ExchangeRatesCard";

// Step 2: Bids Components
import { SupplierSidebar } from "./components/bids/SupplierSidebar";
import { SupplierDetailsForm } from "./components/bids/SupplierDetailsForm";
import { ItemQuotationsTable } from "./components/bids/ItemQuotationsTable";
import { DeliveryTermsCard } from "./components/bids/DeliveryTermsCard";
import { PaymentTermsCard } from "./components/bids/PaymentTermsCard";
import { QualityEvaluationForm } from "./components/bids/QualityEvaluationForm";
import { LandedCostBreakdownCard } from "./components/bids/LandedCostBreakdownCard";
import { BidValidationChecks } from "./components/bids/BidValidationChecks";
import { BidAttachmentsCard } from "./components/bids/BidAttachmentsCard";

// Step 3: Compare Components
import { ComparisonKpiCards } from "./components/compare/ComparisonKpiCards";
import { ScoringWeightsControls } from "./components/compare/ScoringWeightsControls";
import { LandedCostMatrixTable } from "./components/compare/LandedCostMatrixTable";
import { QualityComparisonTable } from "./components/compare/QualityComparisonTable";
import { SupplierSummaryTable } from "./components/compare/SupplierSummaryTable";
import { LandedCostStackedChart } from "./components/compare/LandedCostStackedChart";

// Step 4: Award & Approval Components
import { AwardStrategyToolbar } from "./components/award/AwardStrategyToolbar";
import { AwardSummaryMetrics } from "./components/award/AwardSummaryMetrics";
import { SplitAwardImpactNotice } from "./components/award/SplitAwardImpactNotice";
import { ItemAwardSelectionTable } from "./components/award/ItemAwardSelectionTable";
import { ApprovalWorkflowCard } from "./components/award/ApprovalWorkflowCard";
import { ApprovalHistoryAudit } from "./components/award/ApprovalHistoryAudit";

// Step 5: Abstract of Bids Components
import { AbstractOfBidsDocument } from "./components/abstract/AbstractOfBidsDocument";

import { SupplierBid, ItemQuotation, PassFailResult, Incoterm } from "./types";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

interface SupplierBidComparisonModuleProps {
  currentUser?: {
    name?: string;
    email?: string;
    avatar?: string;
  };
}

export function generateNextQuotationRef(existingBids: SupplierBid[]): string {
  const currentYear = new Date().getFullYear();
  const prefix = `QT-${currentYear}-`;
  let maxSeq = 0;
  for (const b of existingBids) {
    if (b.quotationRef && b.quotationRef.startsWith(prefix)) {
      const numPart = parseInt(b.quotationRef.slice(prefix.length), 10);
      if (!isNaN(numPart) && numPart > maxSeq) {
        maxSeq = numPart;
      }
    }
  }
  return `${prefix}${String(maxSeq + 1).padStart(3, "0")}`;
}

const SupplierBidComparisonModule: React.FC<SupplierBidComparisonModuleProps> = ({ currentUser }) => {
  const setCurrentUser = useBidComparisonStore((s) => s.setCurrentUser);

  useEffect(() => {
    if (currentUser) {
      setCurrentUser(currentUser);
    }
  }, [currentUser, setCurrentUser]);

  const {
    currentStep,
    setCurrentStep,
    currentProject,
    activeBidId,
    setActiveBidId,
    updateProject,
    fetchLookups,
    fetchProjects,
    isLoadingProject,
  } = useBidComparisonStore();

  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isSelectProjectOpen, setIsSelectProjectOpen] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [supplierFilter, setSupplierFilter] = useState<"ALL" | "LOCAL" | "INTERNATIONAL">("ALL");

  const hasInitializedRef = React.useRef(false);

  // Initial load: Restore remembered project on refresh, or prompt user to select first
  useEffect(() => {
    if (hasInitializedRef.current) return;
    hasInitializedRef.current = true;

    fetchLookups();
    fetchProjects().then(async () => {
      const store = useBidComparisonStore.getState();
      const rememberedId = typeof window !== "undefined"
        ? localStorage.getItem(ACTIVE_PROJECT_ID_KEY)
        : null;

      if (rememberedId) {
        const foundInList = store.projectsList.some((p) => p.id === rememberedId);
        const hasLocalCache = typeof window !== "undefined" && !!localStorage.getItem(`mm_rfq_project_${rememberedId}`);

        if (foundInList || hasLocalCache) {
          if (typeof window !== "undefined" && localStorage.getItem(ACTIVE_PROJECT_ID_KEY) === rememberedId) {
            await store.selectProject(rememberedId);
          }
          setIsInitialLoading(false);
          return;
        }
      }

      // No remembered project: Land directly on Executive RFQ Directory
      setIsInitialLoading(false);
    });
  }, [fetchLookups, fetchProjects]);

  // Browser Close Prevention & Ctrl+S Shortcut
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const { isDirty, isSaving, emergencyKeepaliveSave } = useBidComparisonStore.getState();
      if (isDirty || isSaving) {
        emergencyKeepaliveSave();
        e.preventDefault();
        e.returnValue = "You have unsaved changes in this RFQ project. Are you sure you want to leave?";
        return e.returnValue;
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        const { saveProjectNow, isDirty } = useBidComparisonStore.getState();
        if (isDirty) {
          saveProjectNow();
          toast.success("Saving project to database...");
        } else {
          toast.info("Project is already up to date.");
        }
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const handlePrint = () => {
    setCurrentStep(5);
    if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    window.scrollTo(0, 0);
    document.querySelectorAll("main").forEach((el) => {
      el.scrollTop = 0;
    });
    setTimeout(() => {
      window.print();
    }, 350);
  };

  const handleAddSupplier = (type: "LOCAL" | "INTERNATIONAL") => {
    if (!currentProject || isRfqProjectLocked(currentProject)) return;
    const newBidId = `bid-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

    const initialQuotes: Record<string, ItemQuotation> = {};
    (currentProject.items || []).forEach((it) => {
      initialQuotes[it.id] = {
        id: "quote-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        rfqItemId: it.id,
        discountPct: 0,
        priceBreaks: [
          {
            id: "break-1",
            minQuantity: 1,
            unitPrice: it.targetUnitPrice || 0,
          },
        ],
      };
    });

    const initialScores: Record<string, { passFailResult: PassFailResult; score: number | null; evidenceRemarks: string }> = {};
    (currentProject.qualityCriteria || []).forEach((c) => {
      initialScores[c.id] = {
        passFailResult: c.criterionType === "PASS_FAIL" ? "PASS" : "NOT_CHECKED",
        score: c.criterionType === "SCORED" ? 5 : null,
        evidenceRemarks: "",
      };
    });

    const nextQuoteRef = generateNextQuotationRef(currentProject.bids || []);

    const newBid: SupplierBid = {
      id: newBidId,
      supplierName: type === "LOCAL" ? "New Local Supplier" : "New Overseas Supplier",
      supplierType: type,
      country: type === "LOCAL" ? "Philippines" : "",
      contactPerson: "",
      contactEmail: "",
      contactPhone: "",
      quoteCurrency: type === "LOCAL" ? "PHP" : "",
      quotationRef: nextQuoteRef,
      quoteDate: new Date().toISOString().split("T")[0],
      validUntil: "",
      leadTimeDays: type === "LOCAL" ? 14 : 35,
      notes: "",
      incoterm: (type === "LOCAL" ? "DELIVERED" : "FOB") as Incoterm,
      vatPct: currentProject.defaultVatPct ?? 12,
      pricesIncludeVat: false,
      inlandTruckingCompCurr: 0,
      freightBasis: "PER_CBM",
      freightRate: 0,
      freightMinimum: 0,
      freightCurrency: type === "LOCAL" ? "PHP" : "",
      insuranceBasis: "PCT_GOODS_AND_FREIGHT",
      insuranceRateOrAmount: 0.3,
      insuranceCurrency: type === "LOCAL" ? "PHP" : "",
      dutyMode: "PER_ITEM",
      brokerageCompCurr: 0,
      otherPortChargesCompCurr: 0,
      shipmentType: "AUTO",
      containers20ft: 0,
      containers40ft: 0,
      declarationsCount: 1,
      paidByLc: false,
      downPaymentPct: 0,
      balanceDueDays: 30,
      earlyPayDiscountPct: 0,
      earlyPayDiscountDays: 0,
      takeEarlyPayDiscount: false,
      bankFeePerPaymentCompCurr: type === "LOCAL" ? 0 : 1500,
      quotations: initialQuotes,
      scores: initialScores,
      attachments: [],
    };

    updateProject((prev) => ({
      ...prev,
      bids: [...prev.bids, newBid],
    }));
    setActiveBidId(newBid.id);
    toast.success(`Added new ${type.toLowerCase()} supplier quotation (${nextQuoteRef})`);
  };

  const handleDuplicateBid = (bidId: string) => {
    if (!currentProject || isRfqProjectLocked(currentProject)) return;
    const bidToDup = currentProject.bids.find((b) => b.id === bidId);
    if (!bidToDup) return;
    const newBidId = `bid-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const nextQuoteRef = generateNextQuotationRef(currentProject.bids || []);
    const duplicatedBid: SupplierBid = {
      ...bidToDup,
      id: newBidId,
      quotationRef: nextQuoteRef,
      supplierName: `${bidToDup.supplierName} (Copy)`,
      quotations: JSON.parse(JSON.stringify(bidToDup.quotations || {})),
      scores: JSON.parse(JSON.stringify(bidToDup.scores || {})),
      attachments: [],
    };
    updateProject((prev) => ({
      ...prev,
      bids: [...prev.bids, duplicatedBid],
    }));
    setActiveBidId(newBidId);
    toast.success(`Duplicated quotation for "${bidToDup.supplierName}"`);
  };

  const handleRemoveBid = (bidId: string) => {
    if (!currentProject || isRfqProjectLocked(currentProject)) return;
    updateProject((prev) => ({
      ...prev,
      bids: prev.bids.filter((b) => b.id !== bidId),
      awards: prev.awards.filter((a) => a.rfqBidId !== bidId),
    }));
    const remaining = currentProject.bids.filter((b) => b.id !== bidId);
    setActiveBidId(remaining.length > 0 ? remaining[0].id : null);
    toast.success("Supplier quotation removed");
  };

  if (isInitialLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-muted-foreground gap-3">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        <p className="text-sm">Loading Supplier Comparison workspace...</p>
      </div>
    );
  }

  if (!currentProject) {
    const store = useBidComparisonStore.getState();
    return (
      <div className="flex flex-col w-full min-h-screen bg-background text-foreground print:hidden">
        <main className="flex-1 w-full p-2 sm:p-4 md:p-6 overflow-y-auto">
          <ExecutiveRfqDirectory
            projects={store.projectsList}
            onSelectProject={(id) => {
              store.selectProject(id);
            }}
            onOpenNewProjectDialog={() => {
              store.createNewProject();
            }}
            onOpenImportModal={() => setIsImportModalOpen(true)}
          />
        </main>

        {isImportModalOpen && (
          <ImportExportModal
            isOpen={isImportModalOpen}
            onClose={() => setIsImportModalOpen(false)}
          />
        )}
      </div>
    );
  }

  const activeBid = currentProject.bids.find((b) => b.id === activeBidId) || currentProject.bids[0];
  const isLocked = isRfqProjectLocked(currentProject);

  const awardedDistinctSuppliersCount = new Set(
    (currentProject.awards || []).map((a) => a.rfqBidId).filter(Boolean)
  ).size;

  return (
    <div className="flex flex-col w-full min-h-screen bg-background text-foreground print:bg-white print:min-h-0 print:h-auto print:block">
      {/* Top action bar: Project switcher, status, actions */}
      <TopBar
        onOpenImportModal={() => setIsImportModalOpen(true)}
        onOpenExportModal={() => setIsExportModalOpen(true)}
        onTriggerPrint={handlePrint}
      />

      {/* 5-Step Navigation Header */}
      <StepNavigation />

      {/* Non-intrusive inline Locked-State Banner */}
      {isLocked && (
        <div className="mx-3 sm:mx-5 md:mx-6 mt-4 px-4 py-2.5 rounded-lg border border-amber-300/80 bg-amber-50/90 dark:bg-amber-950/30 dark:border-amber-800/70 flex flex-wrap items-center justify-between gap-2 text-xs print:hidden">
          <div className="flex items-center gap-2 text-amber-900 dark:text-amber-200 font-medium">
            <Lock className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span>
              This RFQ is locked in <strong>{currentProject.status === "Approved" ? "Awarded" : currentProject.status}</strong> status and cannot be edited. Use <strong>Duplicate</strong> to create an editable copy, or reopen to Draft in Step 4.
            </span>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => useBidComparisonStore.getState().duplicateProject()}
            className="h-7 text-xs gap-1.5 bg-background border-amber-300 hover:bg-amber-100/60 dark:border-amber-700"
          >
            <Copy className="h-3 w-3" />
            Duplicate Copy
          </Button>
        </div>
      )}

      {/* Switching Project Subtle Indicator */}
      {isLoadingProject && (
        <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full border bg-background/95 px-3.5 py-2 shadow-lg backdrop-blur-xs text-xs font-medium text-foreground transition-all">
          <Loader2 className="h-4 w-4 text-primary animate-spin shrink-0" />
          <span>Switching RFQ project...</span>
        </div>
      )}

      {/* Main Tab Content with Full-Width Layout */}
      <main className="flex-1 p-3 sm:p-5 md:p-6 w-full max-w-none print:p-0 print:m-0 print:bg-white print:overflow-visible print:h-auto print:block">
        <AnimatePresence mode="wait">
          {/* STEP 1: SETUP */}
          {currentStep === 1 && (
            <motion.div
              key="step-1"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
              className="space-y-6 print:hidden"
            >
              {/* Row 1: Project Details (7 cols) & Financial Assumptions (5 cols) */}
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-stretch">
                <div className="xl:col-span-7">
                  <ProjectDetailsCard />
                </div>
                <div className="xl:col-span-5">
                  <CostAssumptionsCard />
                </div>
              </div>

              {/* Row 2: Requested Items Table (Full Width 12 cols) */}
              <div className="w-full">
                <RequestedItemsTable />
              </div>

              {/* Row 3: Philippine Customs & Port Charges (Full Width 12 cols) */}
              <div className="w-full">
                <CustomsAndPortChargesCard />
              </div>

              {/* Row 4: 1.5 Scored Quality Criteria & 1.6 Pass/Fail Mandatory Requirements */}
              <div className="w-full">
                <QualityCriteriaCard />
              </div>

              {/* Row 5: 1.7 Evaluation Exchange Rates (Full Width) */}
              <div className="w-full">
                <ExchangeRatesCard />
              </div>
            </motion.div>
          )}

          {/* STEP 2: BIDS */}
          {currentStep === 2 && (
            <motion.div
              key="step-2"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
              className="flex flex-col lg:flex-row gap-6 items-start w-full print:hidden"
            >
              {/* Supplier Left Sidebar */}
              <SupplierSidebar onAddSupplier={handleAddSupplier} />

              {/* Active Bid Content Area */}
              <div className="flex-1 w-full space-y-6 min-w-0">
                {activeBid ? (
                  <>
                    <SupplierDetailsForm
                      bid={activeBid}
                      onDuplicate={() => handleDuplicateBid(activeBid.id)}
                      onRemove={() => handleRemoveBid(activeBid.id)}
                    />

                    <ItemQuotationsTable bid={activeBid} />

                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                      <DeliveryTermsCard bid={activeBid} />
                      <PaymentTermsCard bid={activeBid} />
                    </div>

                    {/* 2.5 Technical Quality Evaluation (Full row) */}
                    <QualityEvaluationForm bid={activeBid} />

                    {/* 2.6 Checks & 2.7 Attachments (Two separate standalone cards side-by-side) */}
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
                      <BidValidationChecks bid={activeBid} />
                      <BidAttachmentsCard bid={activeBid} />
                    </div>

                    <LandedCostBreakdownCard bid={activeBid} />
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center p-12 border-2 border-dashed rounded-xl bg-card text-center space-y-4">
                    <div className="p-4 rounded-full bg-primary/10 text-primary">
                      <Users className="w-8 h-8" />
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-base font-semibold">No Supplier Bids Added Yet</h3>
                      <p className="text-xs text-muted-foreground max-w-sm">
                        Add local or international supplier quotations to start comparing landed costs, delivery terms, and quality scores.
                      </p>
                    </div>
                    <div className="flex items-center gap-2 pt-2">
                      <Button
                        size="sm"
                        disabled={isLocked}
                        onClick={() => handleAddSupplier("LOCAL")}
                        className="text-xs gap-1.5"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        + Add Local Supplier
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isLocked}
                        onClick={() => handleAddSupplier("INTERNATIONAL")}
                        className="text-xs gap-1.5"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        + Add Overseas Supplier
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* STEP 3: COMPARE */}
          {currentStep === 3 && (
            <motion.div
              key="step-3"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
              className="space-y-6 w-full print:hidden"
            >
              <ComparisonKpiCards />
              <ScoringWeightsControls
                supplierFilter={supplierFilter}
                onFilterChange={setSupplierFilter}
              />
              <LandedCostMatrixTable supplierFilter={supplierFilter} />
              <LandedCostStackedChart supplierFilter={supplierFilter} />
              <QualityComparisonTable supplierFilter={supplierFilter} />
              <SupplierSummaryTable supplierFilter={supplierFilter} />
            </motion.div>
          )}

          {/* STEP 4: AWARD & APPROVAL */}
          {currentStep === 4 && (
            <motion.div
              key="step-4"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
              className="space-y-6 w-full print:hidden"
            >
              <AwardStrategyToolbar />
              <AwardSummaryMetrics />
              <SplitAwardImpactNotice
                supplierCount={awardedDistinctSuppliersCount}
                totalItems={currentProject.items.length}
                currency={currentProject.comparisonCurrency}
              />
              <ItemAwardSelectionTable />
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <ApprovalWorkflowCard />
                <ApprovalHistoryAudit />
              </div>
            </motion.div>
          )}

          {/* STEP 5: ABSTRACT OF BIDS (Interactive Screen View) */}
          {currentStep === 5 && (
            <motion.div
              key="step-5"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
              className="space-y-6 w-full print:hidden"
            >
              <AbstractOfBidsDocument onPrint={handlePrint} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Bottom Previous / Next Navigation with Step Validation */}
        <StepFooterNavigation />

        {/* Dedicated Print Tree for Abstract of Bids — Always mounted to guarantee instant, reliable printing from any step or export modal */}
        <div className="hidden print:block w-full print:p-0 print:m-0 print:opacity-100">
          <AbstractOfBidsDocument onPrint={handlePrint} />
        </div>
      </main>

      {/* CSV / Excel Import Modal - Conditionally mounted to eliminate Radix dialog backdrop latency */}
      {isImportModalOpen && (
        <ImportExportModal
          isOpen={isImportModalOpen}
          onClose={() => setIsImportModalOpen(false)}
        />
      )}

      {/* Dynamic Export Modal */}
      {isExportModalOpen && (
        <ExportModal
          isOpen={isExportModalOpen}
          onClose={() => setIsExportModalOpen(false)}
          project={currentProject}
          onTriggerPrint={handlePrint}
        />
      )}

      {/* Select Project Modal */}
      {isSelectProjectOpen && (
        <SelectProjectModal
          isOpen={isSelectProjectOpen}
          onClose={() => setIsSelectProjectOpen(false)}
          projects={useBidComparisonStore.getState().projectsList}
          currentProjectId={currentProject?.id}
          onSelectProject={(id) => {
            useBidComparisonStore.getState().selectProject(id);
          }}
          onOpenNewProjectDialog={() => {
            useBidComparisonStore.getState().createNewProject();
          }}
          allowDismiss={true}
        />
      )}
    </div>
  );
};

export default SupplierBidComparisonModule;
