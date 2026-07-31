import { useState, useEffect, useCallback } from "react";
import { Button, Text, InlineStack } from "@shopify/polaris";

interface TourStep {
  target: string; // CSS selector
  title: string;
  description: string;
  position?: "top" | "bottom" | "left" | "right";
}

const TOUR_STEPS: TourStep[] = [
  {
    target: "#sync-orders-btn",
    title: "📊 Your Command Center",
    description: "This is your dashboard. Revenue, profit, RTO — everything at a glance. Hit Sync to pull your latest Shopify data.",
    position: "bottom",
  },
  {
    target: "#prx-metric-rto",
    title: "🛡️ Risk Intelligence",
    description: "Monitor your RTO rate here. ProfitRx automatically scores orders and flags high-risk pincodes and customers.",
    position: "bottom",
  },
  {
    target: "#prx-metric-profit",
    title: "💰 True Profit",
    description: "This is your real profit — after COGS, shipping, gateway fees, and RTO losses. Not just revenue minus costs.",
    position: "bottom",
  },
  {
    target: "[data-tour='reports']",
    title: "📈 Reports",
    description: "Export daily, weekly, and monthly profit reports. Download CSV, Excel, or print directly.",
    position: "right",
  },
  {
    target: "[data-tour='settings']",
    title: "⚙️ Settings",
    description: "Configure your shipping costs, packaging, gateway fees, GST, and notification preferences here.",
    position: "right",
  },
];

const TOUR_STORAGE_KEY = "profitrx-tour-completed";

export function ProductTour() {
  const [active, setActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const completed = localStorage.getItem(TOUR_STORAGE_KEY);
    if (!completed) {
      // Delay tour start to allow page to render
      const timer = setTimeout(() => setActive(true), 2000);
      return () => clearTimeout(timer);
    }
  }, []);

  const updateTargetRect = useCallback(() => {
    if (!active) return;
    const step = TOUR_STEPS[currentStep];
    if (!step) return;
    const el = document.querySelector(step.target);
    if (el) {
      setTargetRect(el.getBoundingClientRect());
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    } else {
      setTargetRect(null);
    }
  }, [active, currentStep]);

  useEffect(() => {
    updateTargetRect();
    window.addEventListener("resize", updateTargetRect);
    return () => window.removeEventListener("resize", updateTargetRect);
  }, [updateTargetRect]);

  const handleNext = () => {
    if (currentStep < TOUR_STEPS.length - 1) {
      setCurrentStep((s) => s + 1);
    } else {
      handleFinish();
    }
  };

  const handleSkip = () => {
    handleFinish();
  };

  const handleFinish = () => {
    setActive(false);
    if (typeof window !== "undefined") {
      localStorage.setItem(TOUR_STORAGE_KEY, "true");
    }
  };

  if (!active) return null;

  const step = TOUR_STEPS[currentStep];
  const isLast = currentStep === TOUR_STEPS.length - 1;

  // Calculate tooltip position
  const tooltipStyle: React.CSSProperties = {
    position: "fixed",
    zIndex: 10001,
    width: "min(340px, 85vw)",
    padding: 20,
    borderRadius: "var(--gg-radius-lg)",
    backgroundColor: "var(--gg-surface-1)",
    border: "1px solid var(--gg-border-accent)",
    boxShadow: "0 20px 60px rgba(0, 0, 0, 0.4), 0 0 0 2px rgba(37, 99, 235, 0.2)",
    animation: "prx-slideUp 0.25s ease",
  };

  if (targetRect) {
    const pos = step.position || "bottom";
    if (pos === "bottom") {
      tooltipStyle.top = targetRect.bottom + 12;
      tooltipStyle.left = Math.max(16, targetRect.left + targetRect.width / 2 - 170);
    } else if (pos === "top") {
      tooltipStyle.bottom = window.innerHeight - targetRect.top + 12;
      tooltipStyle.left = Math.max(16, targetRect.left + targetRect.width / 2 - 170);
    } else if (pos === "right") {
      tooltipStyle.top = targetRect.top;
      tooltipStyle.left = targetRect.right + 12;
    } else if (pos === "left") {
      tooltipStyle.top = targetRect.top;
      tooltipStyle.right = window.innerWidth - targetRect.left + 12;
    }
  } else {
    tooltipStyle.top = "30%";
    tooltipStyle.left = "50%";
    tooltipStyle.transform = "translateX(-50%)";
  }

  return (
    <>
      {/* Overlay */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 9999,
          pointerEvents: "none",
        }}
        aria-hidden="true"
      >
        <svg width="100%" height="100%">
          <defs>
            <mask id="tour-mask">
              <rect width="100%" height="100%" fill="white" />
              {targetRect && (
                <rect
                  x={targetRect.left - 6}
                  y={targetRect.top - 6}
                  width={targetRect.width + 12}
                  height={targetRect.height + 12}
                  rx="8"
                  fill="black"
                />
              )}
            </mask>
          </defs>
          <rect
            width="100%" height="100%"
            fill="rgba(0, 0, 0, 0.55)"
            mask="url(#tour-mask)"
          />
        </svg>
      </div>

      {/* Highlight ring */}
      {targetRect && (
        <div
          style={{
            position: "fixed",
            top: targetRect.top - 6,
            left: targetRect.left - 6,
            width: targetRect.width + 12,
            height: targetRect.height + 12,
            borderRadius: 8,
            border: "2px solid var(--gg-accent-blue)",
            boxShadow: "0 0 20px rgba(37, 99, 235, 0.4)",
            zIndex: 10000,
            pointerEvents: "none",
            animation: "prx-pulse 2s ease infinite",
          }}
          aria-hidden="true"
        />
      )}

      {/* Tooltip */}
      <div style={tooltipStyle} role="dialog" aria-label={step.title}>
        {/* Progress */}
        <div style={{
          display: "flex",
          gap: 4,
          marginBottom: 12,
        }}>
          {TOUR_STEPS.map((_, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                height: 3,
                borderRadius: 2,
                backgroundColor: i <= currentStep ? "var(--gg-accent-blue)" : "var(--gg-border)",
                transition: "background-color 0.3s ease",
              }}
            />
          ))}
        </div>

        <Text variant="headingSm" as="h3">{step.title}</Text>
        <div style={{ margin: "8px 0 16px", fontSize: 13, lineHeight: 1.5, color: "var(--gg-text-secondary)" }}>
          {step.description}
        </div>

        <InlineStack align="space-between" blockAlign="center">
          <Button variant="plain" onClick={handleSkip}>
            {isLast ? "Done" : "Skip tour"}
          </Button>
          <InlineStack gap="200">
            <Text variant="bodySm" as="span" tone="subdued">
              {currentStep + 1} / {TOUR_STEPS.length}
            </Text>
            <Button variant="primary" onClick={handleNext}>
              {isLast ? "Finish ✨" : "Next →"}
            </Button>
          </InlineStack>
        </InlineStack>
      </div>
    </>
  );
}
