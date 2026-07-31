import { useState, useCallback } from "react";
import { InlineStack, TextField, Button, Icon, Popover, ActionList, Tag } from "@shopify/polaris";
import { SearchIcon } from "@shopify/polaris-icons";

interface TableToolbarProps {
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  filters?: Array<{
    label: string;
    options: Array<{ label: string; value: string }>;
    value?: string;
    onChange?: (value: string) => void;
  }>;
  actions?: Array<{
    content: string;
    icon?: React.FunctionComponent;
    onAction: () => void;
    variant?: "primary" | "secondary";
    loading?: boolean;
  }>;
  activeFilters?: Array<{ label: string; onRemove: () => void }>;
  id?: string;
}

export function TableToolbar({
  searchValue = "",
  onSearchChange,
  searchPlaceholder = "Search...",
  filters = [],
  actions = [],
  activeFilters = [],
  id,
}: TableToolbarProps) {
  const [filterPopoverActive, setFilterPopoverActive] = useState<string | null>(null);

  const handleSearchChange = useCallback(
    (value: string) => onSearchChange?.(value),
    [onSearchChange],
  );

  return (
    <div id={id} className="prx-table-toolbar" role="toolbar" aria-label="Table controls">
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        {/* Search */}
        {onSearchChange && (
          <div style={{ flex: "1 1 200px", maxWidth: 360 }}>
            <TextField
              label=""
              labelHidden
              value={searchValue}
              onChange={handleSearchChange}
              placeholder={searchPlaceholder}
              prefix={<Icon source={SearchIcon} />}
              autoComplete="off"
              clearButton
              onClearButtonClick={() => handleSearchChange("")}
            />
          </div>
        )}

        {/* Filter Buttons */}
        {filters.map((filter) => (
          <Popover
            key={filter.label}
            active={filterPopoverActive === filter.label}
            activator={
              <Button
                onClick={() => setFilterPopoverActive(
                  filterPopoverActive === filter.label ? null : filter.label,
                )}
                disclosure={filterPopoverActive === filter.label ? "up" : "down"}
                size="slim"
              >
                {filter.label}
                {filter.value ? `: ${filter.value}` : ""}
              </Button>
            }
            onClose={() => setFilterPopoverActive(null)}
          >
            <ActionList
              items={filter.options.map((opt) => ({
                content: opt.label,
                active: filter.value === opt.value,
                onAction: () => {
                  filter.onChange?.(opt.value);
                  setFilterPopoverActive(null);
                },
              }))}
            />
          </Popover>
        ))}

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Action Buttons */}
        {actions.map((action) => (
          <Button
            key={action.content}
            onClick={action.onAction}
            variant={action.variant || "secondary"}
            size="slim"
            icon={action.icon}
            loading={action.loading}
          >
            {action.content}
          </Button>
        ))}
      </div>

      {/* Active Filters Tags */}
      {activeFilters.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
          {activeFilters.map((f) => (
            <Tag key={f.label} onRemove={f.onRemove}>{f.label}</Tag>
          ))}
        </div>
      )}
    </div>
  );
}
