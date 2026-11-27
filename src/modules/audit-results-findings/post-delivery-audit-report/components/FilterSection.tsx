import React from "react";
import { FileText, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "./SearchableSelect";

interface FilterSectionProps {
  searchDispatchNo: string;
  setSearchDispatchNo: (val: string) => void;
  handleSearch: () => void;
  driverId: string;
  setDriverId: (val: string) => void;
  drivers: { id: number; first_name: string; last_name: string }[];
  dateFrom: string;
  setDateFrom: (val: string) => void;
  dateTo: string;
  setDateTo: (val: string) => void;
  sortBy: string;
  setSortBy: (val: string) => void;
}

export function FilterSection({
  searchDispatchNo,
  setSearchDispatchNo,
  handleSearch,
  driverId,
  setDriverId,
  drivers,
  dateFrom,
  setDateFrom,
  dateTo,
  setDateTo,
  sortBy,
  setSortBy,
}: FilterSectionProps) {
  return (
    <div className="p-6 border-b border-border flex flex-col gap-4 bg-card">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
          <FileText className="text-muted-foreground" size={20} />
          Posted Dispatch Plans
        </h2>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
            <input 
              type="text" 
              placeholder="Search Dispatch No..." 
              value={searchDispatchNo}
              onChange={(e) => setSearchDispatchNo(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="w-full pl-9 pr-4 py-2 bg-muted border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/25"
            />
          </div>
          <Button onClick={handleSearch} variant="secondary" className="rounded-xl shrink-0">Search</Button>
        </div>
      </div>
      
      <div className="flex flex-wrap items-center gap-3">
        <SearchableSelect 
          value={driverId}
          onChange={(val) => setDriverId(val)}
          options={[
            { value: "", label: "All Drivers" },
            ...drivers.map(d => ({ value: String(d.id), label: `${d.first_name} ${d.last_name}` }))
          ]}
          placeholder="All Drivers"
          className="flex-1 min-w-[200px]"
        />

        <div className="flex items-center gap-2 bg-muted border border-border rounded-lg px-3 py-2 flex-1 min-w-[280px]">
          <span className="text-xs font-bold text-muted-foreground uppercase">Date:</span>
          <input 
            type="date" 
            value={dateFrom}
            max={dateTo || undefined}
            onChange={(e) => {
              const val = e.target.value;
              setDateFrom(val);
              if (dateTo && val > dateTo) {
                setDateTo(val);
              }
            }}
            className="bg-transparent text-sm outline-none w-full"
          />
          <span className="text-slate-300">-</span>
          <input 
            type="date" 
            value={dateTo}
            min={dateFrom || undefined}
            onChange={(e) => {
              const val = e.target.value;
              setDateTo(val);
              if (dateFrom && val < dateFrom) {
                setDateFrom(val);
              }
            }}
            className="bg-transparent text-sm outline-none w-full"
          />
        </div>

        <SearchableSelect 
          value={sortBy}
          onChange={(val) => setSortBy(val)}
          options={[
            { value: "percentage_desc", label: "Percentage (High - Low)" },
            { value: "percentage_asc", label: "Percentage (Low - High)" },
            { value: "tod_desc", label: "Time of Dispatch (Newest)" },
            { value: "tod_asc", label: "Time of Dispatch (Oldest)" }
          ]}
          className="flex-1 min-w-[220px]"
        />
      </div>
    </div>
  );
}

