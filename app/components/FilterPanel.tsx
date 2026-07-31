import { useState, useCallback } from "react";
import { BlockStack, InlineStack, TextField, Select, Button, Tag, Text, RangeSlider, Divider } from "@shopify/polaris";

export interface FilterConfig {
  dateFrom?: string;
  dateTo?: string;
  status?: string;
  paymentType?: string;
  profitMin?: string;
  profitMax?: string;
  riskLevel?: string;
  courier?: string;
  product?: string;
  customer?: string;
}

interface FilterPanelProps {
  filters: FilterConfig;
  onChange: (filters: FilterConfig) => void;
  onClear: () => void;
  showFields?: Array<keyof FilterConfig>;
  id?: string;
}

const STATUS_OPTIONS = [
  { label: "All", value: "" },
  { label: "Paid", value: "paid" },
  { label: "Pending", value: "pending" },
  { label: "Refunded", value: "refunded" },
  { label: "Fulfilled", value: "fulfilled" },
  { label: "RTO", value: "RTO" },
];

const PAYMENT_OPTIONS = [
  { label: "All", value: "" },
  { label: "COD", value: "cod" },
  { label: "Prepaid", value: "prepaid" },
];

const RISK_OPTIONS = [
  { label: "All", value: "" },
  { label: "Low", value: "LOW" },
  { label: "Medium", value: "MEDIUM" },
  { label: "High", value: "HIGH" },
  { label: "Critical", value: "CRITICAL" },
];

export function FilterPanel({
  filters,
  onChange,
  onClear,
  showFields = ["dateFrom", "dateTo", "status", "paymentType", "riskLevel"],
  id,
}: FilterPanelProps) {
  const updateFilter = useCallback(
    (key: keyof FilterConfig, value: string) => {
      onChange({ ...filters, [key]: value });
    },
    [filters, onChange],
  );

  const activeCount = Object.values(filters).filter(Boolean).length;

  return (
    <div
      id={id}
      className="prx-filter-panel"
      role="search"
      aria-label="Filter results"
      style={{
        padding: 16,
        borderRadius: "var(--gg-radius-lg)",
        border: "1px solid var(--gg-border)",
        background: "var(--gg-surface-2)",
      }}
    >
      <BlockStack gap="300">
        <InlineStack align="space-between" blockAlign="center">
          <InlineStack gap="200" blockAlign="center">
            <Text variant="headingSm" as="h3">Filters</Text>
            {activeCount > 0 && (
              <Tag>{activeCount} active</Tag>
            )}
          </InlineStack>
          {activeCount > 0 && (
            <Button variant="plain" onClick={onClear}>Clear all</Button>
          )}
        </InlineStack>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          {showFields.includes("dateFrom") && (
            <div style={{ flex: "1 1 140px", maxWidth: 180 }}>
              <TextField
                label="From"
                type="date"
                value={filters.dateFrom || ""}
                onChange={(v) => updateFilter("dateFrom", v)}
                autoComplete="off"
              />
            </div>
          )}
          {showFields.includes("dateTo") && (
            <div style={{ flex: "1 1 140px", maxWidth: 180 }}>
              <TextField
                label="To"
                type="date"
                value={filters.dateTo || ""}
                onChange={(v) => updateFilter("dateTo", v)}
                autoComplete="off"
              />
            </div>
          )}
          {showFields.includes("status") && (
            <div style={{ flex: "1 1 140px", maxWidth: 180 }}>
              <Select
                label="Status"
                options={STATUS_OPTIONS}
                value={filters.status || ""}
                onChange={(v) => updateFilter("status", v)}
              />
            </div>
          )}
          {showFields.includes("paymentType") && (
            <div style={{ flex: "1 1 140px", maxWidth: 180 }}>
              <Select
                label="Payment"
                options={PAYMENT_OPTIONS}
                value={filters.paymentType || ""}
                onChange={(v) => updateFilter("paymentType", v)}
              />
            </div>
          )}
          {showFields.includes("riskLevel") && (
            <div style={{ flex: "1 1 140px", maxWidth: 180 }}>
              <Select
                label="Risk Level"
                options={RISK_OPTIONS}
                value={filters.riskLevel || ""}
                onChange={(v) => updateFilter("riskLevel", v)}
              />
            </div>
          )}
          {showFields.includes("profitMin") && (
            <div style={{ flex: "1 1 140px", maxWidth: 180 }}>
              <TextField
                label="Min Profit (₹)"
                type="number"
                value={filters.profitMin || ""}
                onChange={(v) => updateFilter("profitMin", v)}
                autoComplete="off"
              />
            </div>
          )}
          {showFields.includes("profitMax") && (
            <div style={{ flex: "1 1 140px", maxWidth: 180 }}>
              <TextField
                label="Max Profit (₹)"
                type="number"
                value={filters.profitMax || ""}
                onChange={(v) => updateFilter("profitMax", v)}
                autoComplete="off"
              />
            </div>
          )}
          {showFields.includes("courier") && (
            <div style={{ flex: "1 1 140px", maxWidth: 180 }}>
              <TextField
                label="Courier"
                value={filters.courier || ""}
                onChange={(v) => updateFilter("courier", v)}
                placeholder="e.g. Delhivery"
                autoComplete="off"
              />
            </div>
          )}
          {showFields.includes("product") && (
            <div style={{ flex: "1 1 200px", maxWidth: 240 }}>
              <TextField
                label="Product"
                value={filters.product || ""}
                onChange={(v) => updateFilter("product", v)}
                placeholder="Search product..."
                autoComplete="off"
              />
            </div>
          )}
          {showFields.includes("customer") && (
            <div style={{ flex: "1 1 200px", maxWidth: 240 }}>
              <TextField
                label="Customer"
                value={filters.customer || ""}
                onChange={(v) => updateFilter("customer", v)}
                placeholder="Name or email..."
                autoComplete="off"
              />
            </div>
          )}
        </div>
      </BlockStack>
    </div>
  );
}

/** Sync filters to/from URL search params */
export function filtersToParams(filters: FilterConfig): URLSearchParams {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  return params;
}

export function paramsToFilters(params: URLSearchParams): FilterConfig {
  return {
    dateFrom: params.get("dateFrom") || "",
    dateTo: params.get("dateTo") || "",
    status: params.get("status") || "",
    paymentType: params.get("paymentType") || "",
    profitMin: params.get("profitMin") || "",
    profitMax: params.get("profitMax") || "",
    riskLevel: params.get("riskLevel") || "",
    courier: params.get("courier") || "",
    product: params.get("product") || "",
    customer: params.get("customer") || "",
  };
}
