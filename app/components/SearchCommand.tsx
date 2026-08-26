import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router";
import { Icon, Text, Badge } from "@shopify/polaris";
import { SearchIcon } from "@shopify/polaris-icons";

interface SearchResult {
  id: string;
  title: string;
  subtitle?: string;
  category: "order" | "product" | "customer" | "pincode" | "risk";
  url: string;
  icon: string;
}

const CATEGORY_META: Record<string, { label: string; icon: string; color: string }> = {
  order: { label: "Orders", icon: "📦", color: "var(--gg-accent-blue)" },
  product: { label: "Products", icon: "🏷️", color: "var(--gg-accent-purple)" },
  customer: { label: "Customers", icon: "👤", color: "var(--gg-accent-green)" },
  pincode: { label: "Pincodes", icon: "📍", color: "var(--gg-accent-amber)" },
  risk: { label: "Risk Orders", icon: "🛡️", color: "var(--gg-accent-red)" },
};

interface SearchCommandProps {
  shop: string;
  host: string;
}

export function SearchCommand({ shop, host }: SearchCommandProps) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Keyboard shortcut: Ctrl+K / Cmd+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
      if (e.key === "Escape" && open) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  // Focus input when opening
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery("");
      setResults([]);
      setSelectedIndex(0);
    }
  }, [open]);

  // Debounced search
  const doSearch = useCallback(
    async (q: string) => {
      if (!q.trim()) {
        setResults([]);
        return;
      }
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&shop=${encodeURIComponent(shop)}`);
        if (res.ok) {
          const data = await res.json();
          setResults(data.results || []);
        }
      } catch {
        // Silently fail search
      } finally {
        setLoading(false);
      }
    },
    [shop],
  );

  const handleQueryChange = (value: string) => {
    setQuery(value);
    setSelectedIndex(0);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(value), 250);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[selectedIndex]) {
      navigate(results[selectedIndex].url);
      setOpen(false);
    }
  };

  const handleNavigate = (url: string) => {
    navigate(url);
    setOpen(false);
  };

  // Group results by category
  const grouped = results.reduce<Record<string, SearchResult[]>>((acc, r) => {
    (acc[r.category] = acc[r.category] || []).push(r);
    return acc;
  }, {});

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="prx-search-backdrop"
        onClick={() => setOpen(false)}
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          backgroundColor: "rgba(0, 0, 0, 0.5)",
          backdropFilter: "blur(4px)",
          zIndex: 9998,
          animation: "prx-fadeIn 0.15s ease",
        }}
      />

      {/* Search Modal */}
      <div
        className="prx-search-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Global search"
        style={{
          position: "fixed",
          top: "15%",
          left: "50%",
          transform: "translateX(-50%)",
          width: "min(600px, 90vw)",
          maxHeight: "70vh",
          backgroundColor: "var(--gg-surface-1)",
          borderRadius: "var(--gg-radius-xl)",
          border: "1px solid var(--gg-border)",
          boxShadow: "0 24px 80px rgba(0, 0, 0, 0.4)",
          zIndex: 9999,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          animation: "prx-slideUp 0.2s ease",
        }}
      >
        {/* Search Input */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "16px 20px",
          borderBottom: "1px solid var(--gg-border)",
        }}>
          <Icon source={SearchIcon} tone="subdued" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search orders, products, customers, pincodes..."
            aria-label="Search"
            autoComplete="off"
            style={{
              flex: 1,
              border: "none",
              outline: "none",
              background: "transparent",
              fontSize: 16,
              fontFamily: "'Inter', sans-serif",
              color: "var(--gg-text-primary)",
            }}
          />
          <kbd style={{
            padding: "2px 8px",
            borderRadius: 4,
            border: "1px solid var(--gg-border)",
            fontSize: 11,
            color: "var(--gg-text-muted)",
            fontFamily: "monospace",
          }}>
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div style={{ overflowY: "auto", maxHeight: "calc(70vh - 60px)", padding: "8px 0" }}>
          {loading && (
            <div style={{ padding: "16px 20px", textAlign: "center" }}>
              <Text variant="bodySm" as="p" tone="subdued">Searching...</Text>
            </div>
          )}

          {!loading && query && results.length === 0 && (
            <div style={{ padding: "32px 20px", textAlign: "center" }}>
              <span style={{ fontSize: 32, display: "block", marginBottom: 8 }}>🔍</span>
              <Text variant="bodySm" as="p" tone="subdued">{`No results for "${query}"`}</Text>
            </div>
          )}

          {!loading && !query && (
            <div style={{ padding: "24px 20px", textAlign: "center" }}>
              <Text variant="bodySm" as="p" tone="subdued">
                Type to search across orders, products, customers, and pincodes
              </Text>
              <div style={{ marginTop: 12, display: "flex", justifyContent: "center", gap: 8, flexWrap: "wrap" }}>
                {Object.entries(CATEGORY_META).map(([key, meta]) => (
                  <Badge key={key} tone="info">{`${meta.icon} ${meta.label}`}</Badge>
                ))}
              </div>
            </div>
          )}

          {Object.entries(grouped).map(([category, items]) => {
            const meta = CATEGORY_META[category] || { label: category, icon: "📄", color: "var(--gg-text-muted)" };
            return (
              <div key={category}>
                <div style={{
                  padding: "8px 20px 4px",
                  fontSize: 11,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  color: "var(--gg-text-muted)",
                }}>
                  {meta.icon} {meta.label}
                </div>
                {items.map((item) => {
                  const globalIdx = results.indexOf(item);
                  const isSelected = globalIdx === selectedIndex;
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleNavigate(item.url)}
                      onMouseEnter={() => setSelectedIndex(globalIdx)}
                      aria-label={`Go to ${item.title}`}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        width: "100%",
                        padding: "10px 20px",
                        border: "none",
                        background: isSelected ? "var(--gg-surface-hover)" : "transparent",
                        cursor: "pointer",
                        textAlign: "left",
                        fontFamily: "'Inter', sans-serif",
                        color: "var(--gg-text-primary)",
                        transition: "background 0.1s ease",
                      }}
                    >
                      <span style={{ fontSize: 16 }} aria-hidden="true">{item.icon || meta.icon}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {item.title}
                        </div>
                        {item.subtitle && (
                          <div style={{ fontSize: 12, color: "var(--gg-text-muted)", marginTop: 1 }}>
                            {item.subtitle}
                          </div>
                        )}
                      </div>
                      {isSelected && (
                        <kbd style={{
                          padding: "1px 6px",
                          borderRadius: 3,
                          border: "1px solid var(--gg-border)",
                          fontSize: 10,
                          color: "var(--gg-text-muted)",
                          fontFamily: "monospace",
                        }}>
                          ↵
                        </kbd>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{
          padding: "8px 20px",
          borderTop: "1px solid var(--gg-border)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: 11,
          color: "var(--gg-text-muted)",
        }}>
          <span>
            <kbd style={{ padding: "1px 4px", border: "1px solid var(--gg-border)", borderRadius: 3, fontFamily: "monospace", fontSize: 10 }}>↑↓</kbd> navigate
            {" "}
            <kbd style={{ padding: "1px 4px", border: "1px solid var(--gg-border)", borderRadius: 3, fontFamily: "monospace", fontSize: 10 }}>↵</kbd> select
          </span>
          <span>
            <kbd style={{ padding: "1px 4px", border: "1px solid var(--gg-border)", borderRadius: 3, fontFamily: "monospace", fontSize: 10 }}>Ctrl+K</kbd> toggle
          </span>
        </div>
      </div>
    </>
  );
}

/** Compact search trigger button for header */
export function SearchTrigger({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="prx-search-trigger"
      aria-label="Open search (Ctrl+K)"
      title="Search (Ctrl+K)"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 14px",
        borderRadius: "var(--gg-radius-md)",
        border: "1px solid var(--gg-border)",
        background: "var(--gg-surface-2)",
        cursor: "pointer",
        fontSize: 13,
        fontFamily: "'Inter', sans-serif",
        color: "var(--gg-text-muted)",
        transition: "all 0.2s ease",
      }}
    >
      <Icon source={SearchIcon} tone="subdued" />
      <span className="gg-desktop-only">Search...</span>
      <kbd className="gg-desktop-only" style={{
        padding: "1px 6px",
        borderRadius: 4,
        border: "1px solid var(--gg-border)",
        fontSize: 10,
        fontFamily: "monospace",
        color: "var(--gg-text-muted)",
        marginLeft: 8,
      }}>
        ⌘K
      </kbd>
    </button>
  );
}
