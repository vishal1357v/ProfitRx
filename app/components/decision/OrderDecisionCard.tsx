import React, { useState } from "react";
import {
  Card,
  Text,
  BlockStack,
  InlineStack,
  Badge,
  Box,
  Divider,
  Button,
  ButtonGroup,
  Banner,
  DataTable,
  Tooltip,
  Modal,
  Select,
  TextField,
  Icon,
} from "@shopify/polaris";
import {
  ShieldCheckMarkIcon,
  AlertBubbleIcon,
  CashDollarIcon,
  InfoIcon,
  EditIcon,
  DeliveryIcon,
  PersonIcon,
  CheckIcon,
} from "@shopify/polaris-icons";
import { OrderDecisionCardDTO } from "../../application/decision/decision-engine.application";

interface OrderDecisionCardProps {
  decision: OrderDecisionCardDTO;
  onOverrideAction?: (action: string, reason: string) => void;
  isSubmitting?: boolean;
  compact?: boolean;
}

export function OrderDecisionCard({
  decision,
  onOverrideAction,
  isSubmitting = false,
  compact = false,
}: OrderDecisionCardProps) {
  const { order, economics, risk, recommendation, decisionState, outcome } = decision;

  const [isOverrideModalOpen, setIsOverrideModalOpen] = useState(false);
  const [selectedAction, setSelectedAction] = useState<string>(decisionState.currentAction || recommendation.action);
  const [overrideReason, setOverrideReason] = useState<string>("");

  const handleConfirmOverride = () => {
    if (onOverrideAction) {
      onOverrideAction(selectedAction, overrideReason || "Manual merchant override");
    }
    setIsOverrideModalOpen(false);
  };

  const getRecommendationBadge = (action: string) => {
    switch (action) {
      case "ALLOW_COD":
        return <Badge tone="success" size="large">ALLOW COD (Fulfill Normally)</Badge>;
      case "VERIFY":
      case "OTP_VERIFY":
        return <Badge tone="attention" size="large">VERIFY INTENT (Dispatch OTP)</Badge>;
      case "PREPAID_ONLY":
        return <Badge tone="warning" size="large">REQUIRE PREPAID PAYMENT</Badge>;
      case "BLOCK_COD":
        return <Badge tone="critical" size="large">BLOCK COD (Hold Order)</Badge>;
      default:
        return <Badge size="large">{action}</Badge>;
    }
  };

  const getRiskTone = (band: string): "success" | "warning" | "critical" => {
    if (band === "CRITICAL" || band === "HIGH") return "critical";
    if (band === "MEDIUM") return "warning";
    return "success";
  };

  const getTextRiskTone = (band: string): "success" | "caution" | "critical" => {
    if (band === "CRITICAL" || band === "HIGH") return "critical";
    if (band === "MEDIUM") return "caution";
    return "success";
  };

  const getPrecisionBadge = (state: string) => {
    switch (state) {
      case "ACTUAL":
        return <Badge tone="success">ACTUAL</Badge>;
      case "ESTIMATED":
        return <Badge tone="warning">ESTIMATED</Badge>;
      case "EXPECTED":
        return <Badge tone="info">EXPECTED</Badge>;
      case "INCOMPLETE":
        return <Badge tone="critical">INCOMPLETE</Badge>;
      default:
        return <Badge>{state}</Badge>;
    }
  };

  const currencySymbol = economics.currency === "USD" ? "$" : "₹";
  const rtoProbabilityPct = risk.riskScore;

  return (
    <BlockStack gap="400">
      {/* ── 1. MAIN RECOMMENDATION & FINANCIAL DECISION ── */}
      <Card>
        <BlockStack gap="300">
          <InlineStack align="space-between" blockAlign="center" wrap>
            <InlineStack gap="200" blockAlign="center">
              <Text variant="headingMd" as="h2">
                Order Decision Engine
              </Text>
              {decisionState.isOverridden && (
                <Badge tone="info">Merchant Override Active</Badge>
              )}
            </InlineStack>
            <InlineStack gap="200" blockAlign="center">
              {getRecommendationBadge(decisionState.currentAction)}
              {onOverrideAction && (
                <Button
                  size="slim"
                  icon={EditIcon}
                  onClick={() => setIsOverrideModalOpen(true)}
                >
                  Change Action
                </Button>
              )}
            </InlineStack>
          </InlineStack>

          {/* Economic Justification Box */}
          <Box padding="300" background="bg-surface-secondary" borderRadius="200">
            <BlockStack gap="150">
              <InlineStack gap="100" blockAlign="center">
                <Text variant="bodyMd" fontWeight="semibold" as="p">
                  Economic Verdict:
                </Text>
                <Text variant="bodyMd" as="p">
                  {recommendation.economicJustification}
                </Text>
              </InlineStack>
              <Text variant="bodySm" tone="subdued" as="p">
                <strong>Why this action:</strong> {recommendation.explanation}
              </Text>
            </BlockStack>
          </Box>

          {/* Incomplete Data / Currency Warnings */}
          {(!economics.dataCompleteness.hasActualCogs ||
            !economics.dataCompleteness.hasActualShipping ||
            !economics.currencyMatch) && (
            <Banner tone="warning">
              <BlockStack gap="100">
                <Text variant="bodySm" fontWeight="semibold" as="p">
                  Data Quality & Completeness Notice:
                </Text>
                <ul style={{ margin: 0, paddingLeft: "20px" }}>
                  {!economics.dataCompleteness.hasActualCogs && (
                    <li>
                      <Text variant="bodySm" as="span">
                        SKU Cost of Goods Sold (COGS) missing; estimated using store default percentage.
                      </Text>
                    </li>
                  )}
                  {!economics.dataCompleteness.hasActualShipping && (
                    <li>
                      <Text variant="bodySm" as="span">
                        Courier shipping rate missing; calculated from default weight slab freight rates.
                      </Text>
                    </li>
                  )}
                  {!economics.currencyMatch && (
                    <li>
                      <Text variant="bodySm" as="span">
                        Order currency ({economics.currency}) differs from store settings. Calculation estimates may be incomplete.
                      </Text>
                    </li>
                  )}
                </ul>
              </BlockStack>
            </Banner>
          )}

          {/* 4-Stat Core Decision Metrics */}
          <Divider />
          <InlineStack align="space-between" wrap>
            <Box minWidth="130px">
              <BlockStack gap="050">
                <Text variant="bodyXs" tone="subdued" as="span">
                  RTO Risk Band
                </Text>
                <InlineStack gap="100" blockAlign="center">
                  <Text variant="headingLg" tone={getTextRiskTone(risk.riskBand)} as="p">
                    {risk.riskScore}%
                  </Text>
                  <Badge tone={getRiskTone(risk.riskBand)}>{risk.riskBand}</Badge>
                </InlineStack>
                <Text variant="bodyXs" tone="subdued" as="span">
                  Confidence: {Math.round(risk.confidence * 100)}%
                </Text>
              </BlockStack>
            </Box>

            <Box minWidth="140px">
              <BlockStack gap="050">
                <Text variant="bodyXs" tone="subdued" as="span">
                  Expected Contribution ($EV$)
                </Text>
                <Text
                  variant="headingLg"
                  tone={economics.expectedContribution >= 0 ? "success" : "critical"}
                  as="p"
                >
                  {economics.expectedContribution >= 0
                    ? `+${currencySymbol}${Math.round(economics.expectedContribution).toLocaleString("en-IN")}`
                    : `-${currencySymbol}${Math.abs(Math.round(economics.expectedContribution)).toLocaleString("en-IN")}`}
                </Text>
                {getPrecisionBadge(economics.expectedContributionState)}
              </BlockStack>
            </Box>

            <Box minWidth="140px">
              <BlockStack gap="050">
                <Text variant="bodyXs" tone="subdued" as="span">
                  Delivered Contribution
                </Text>
                <Text
                  variant="headingLg"
                  tone={economics.deliveredContribution >= 0 ? "success" : "critical"}
                  as="p"
                >
                  +{currencySymbol}{Math.round(economics.deliveredContribution).toLocaleString("en-IN")}
                </Text>
                <Text variant="bodyXs" tone="subdued" as="span">
                  If customer accepts
                </Text>
              </BlockStack>
            </Box>

            <Box minWidth="140px">
              <BlockStack gap="050">
                <Text variant="bodyXs" tone="subdued" as="span">
                  RTO Financial Exposure
                </Text>
                <Text variant="headingLg" tone="critical" as="p">
                  -{currencySymbol}{Math.round(economics.rtoLossExposure).toLocaleString("en-IN")}
                </Text>
                <Text variant="bodyXs" tone="subdued" as="span">
                  If order returns
                </Text>
              </BlockStack>
            </Box>
          </InlineStack>
        </BlockStack>
      </Card>

      {/* ── 2. RISK ASSESSMENT & SIGNALS ── */}
      <Card>
        <BlockStack gap="300">
          <InlineStack align="space-between" blockAlign="center">
            <Text variant="headingSm" as="h3">
              Risk Assessment & Signal Breakdown
            </Text>
            <Badge tone={risk.isFlagged ? "attention" : "success"}>
              {risk.isFlagged ? "Order Flagged for Review" : "Low Risk Profile"}
            </Badge>
          </InlineStack>

          <BlockStack gap="200">
            {/* Customer Signal */}
            <Box padding="200" background="bg-surface-secondary" borderRadius="100">
              <InlineStack align="space-between" blockAlign="center" wrap>
                <InlineStack gap="150" blockAlign="center">
                  <Icon source={PersonIcon} tone="subdued" />
                  <Text variant="bodySm" fontWeight="semibold" as="span">
                    Customer History:
                  </Text>
                  <Text variant="bodySm" as="span">
                    {risk.customerSignals.isRepeatCustomer
                      ? `Repeat buyer (${risk.customerSignals.totalOrders} orders, ${risk.customerSignals.successfulDeliveries} delivered, ${risk.customerSignals.rtoCount} RTO)`
                      : "First-time customer"}
                  </Text>
                </InlineStack>
                {risk.customerSignals.hasDeliveryTrackRecord ? (
                  <Badge tone="success">Verified Track Record</Badge>
                ) : risk.customerSignals.rtoCount > 0 ? (
                  <Badge tone="critical">{`${risk.customerSignals.rtoCount} Past RTOs`}</Badge>
                ) : (
                  <Badge tone="info">New Buyer</Badge>
                )}
              </InlineStack>
            </Box>

            {/* Pincode Signal */}
            <Box padding="200" background="bg-surface-secondary" borderRadius="100">
              <InlineStack align="space-between" blockAlign="center" wrap>
                <InlineStack gap="150" blockAlign="center">
                  <Icon source={DeliveryIcon} tone="subdued" />
                  <Text variant="bodySm" fontWeight="semibold" as="span">
                    Destination Area:
                  </Text>
                  <Text variant="bodySm" as="span">
                    {risk.pincodeHistory.pincode
                      ? `${risk.pincodeHistory.pincode} (${risk.pincodeHistory.city || "Region"}, ${risk.pincodeHistory.province || ""}) — ${risk.pincodeHistory.rtoRate}% historical RTO`
                      : "Missing shipping pincode"}
                  </Text>
                </InlineStack>
                {risk.pincodeHistory.isBlocked ? (
                  <Badge tone="critical">Pincode Blocked</Badge>
                ) : risk.pincodeHistory.rtoRate >= 30 ? (
                  <Badge tone="warning">High RTO Area</Badge>
                ) : (
                  <Badge tone="success">Normal Deliverability</Badge>
                )}
              </InlineStack>
            </Box>

            {/* Contributing Risk Factors */}
            {risk.riskFactors.length > 0 && (
              <Box padding="200" background="bg-surface-secondary" borderRadius="100">
                <BlockStack gap="100">
                  <Text variant="bodyXs" fontWeight="bold" tone="subdued" as="span">
                    CONTRIBUTING RISK FACTORS
                  </Text>
                  {risk.riskFactors.map((f, i) => (
                    <InlineStack key={i} align="space-between" blockAlign="center">
                      <Text variant="bodySm" as="span">
                        • {f.explanation}
                      </Text>
                      <Badge tone={f.contribution > 0 ? "critical" : "success"}>
                        {f.contribution > 0 ? `+${f.contribution}%` : `${f.contribution}%`}
                      </Badge>
                    </InlineStack>
                  ))}
                </BlockStack>
              </Box>
            )}
          </BlockStack>
        </BlockStack>
      </Card>

      {/* ── 3. DETAILED ORDER ECONOMICS TABLE ── */}
      {!compact && (
        <Card>
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center">
              <Text variant="headingSm" as="h3">
                Financial Decision Model
              </Text>
              <Text variant="bodyXs" tone="subdued" as="span">
                Canonical Economics Calculation (Zero Double-Counting)
              </Text>
            </InlineStack>

            <Box padding="200" background="bg-surface-secondary" borderRadius="100">
              <Text variant="bodySm" as="p">
                <strong>Expected Contribution Formula:</strong> (1 − {rtoProbabilityPct / 100}) × +{currencySymbol}{Math.round(economics.deliveredContribution)} + ({rtoProbabilityPct / 100}) × -{currencySymbol}{Math.round(economics.rtoLossExposure)} ={" "}
                <strong>
                  {economics.expectedContribution >= 0 ? `+${currencySymbol}` : `-${currencySymbol}`}
                  {Math.abs(Math.round(economics.expectedContribution))}
                </strong>
              </Text>
            </Box>

            <DataTable
              columnContentTypes={["text", "numeric", "text"]}
              headings={["Cost / Revenue Component", "Amount", "Data Precision"]}
              rows={[
                [
                  "Gross Order Value",
                  `+${currencySymbol}${Math.round(economics.grossOrderValue).toLocaleString("en-IN")}`,
                  <Badge tone="success" key="rev">ACTUAL</Badge>,
                ],
                [
                  "Product COGS",
                  `-${currencySymbol}${Math.round(economics.cogs).toLocaleString("en-IN")}`,
                  getPrecisionBadge(economics.cogsState),
                ],
                [
                  "Forward Shipping Freight",
                  `-${currencySymbol}${Math.round(economics.forwardShipping)}`,
                  getPrecisionBadge(economics.dataCompleteness.hasActualShipping ? "ACTUAL" : "ESTIMATED"),
                ],
                [
                  "Packaging & Materials",
                  `-${currencySymbol}${Math.round(economics.packaging)}`,
                  getPrecisionBadge("ESTIMATED"),
                ],
                order.isCOD
                  ? [
                      "COD Courier Handling Fee",
                      `-${currencySymbol}${Math.round(economics.codFee)}`,
                      getPrecisionBadge("ESTIMATED"),
                    ]
                  : [
                      "Payment Gateway Fee (+18% GST)",
                      `-${currencySymbol}${Math.round(economics.gatewayFee)}`,
                      getPrecisionBadge("ACTUAL"),
                    ],
                [
                  <Text variant="bodyMd" fontWeight="bold" as="span" key="del-lbl">
                    = Delivered Contribution Profit
                  </Text>,
                  <Text
                    variant="bodyMd"
                    fontWeight="bold"
                    tone={economics.deliveredContribution >= 0 ? "success" : "critical"}
                    as="span"
                    key="del-val"
                  >
                    +{currencySymbol}{Math.round(economics.deliveredContribution).toLocaleString("en-IN")}
                  </Text>,
                  getPrecisionBadge(economics.cogsState === "ACTUAL" ? "ACTUAL" : "ESTIMATED"),
                ],
                [
                  <Text variant="bodyMd" fontWeight="bold" as="span" key="rto-lbl">
                    = Reverse Logistics Loss Exposure (If RTO)
                  </Text>,
                  <Text variant="bodyMd" fontWeight="bold" tone="critical" as="span" key="rto-val">
                    -{currencySymbol}{Math.round(economics.rtoLossExposure).toLocaleString("en-IN")}
                  </Text>,
                  <Badge tone="critical" key="rto-b">EXPOSURE</Badge>,
                ],
              ]}
            />
          </BlockStack>
        </Card>
      )}

      {/* ── 4. PROFITRX DECISION HISTORY & OUTCOME FEEDBACK LOOP ── */}
      {(decisionState.isOverridden || outcome) && (
        <Card>
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center">
              <Text variant="headingSm" as="h3">
                ProfitRx Decision History & Outcome Tracking
              </Text>
              {outcome ? (
                <Badge tone={outcome.outcomeState === "DELIVERED" ? "success" : outcome.outcomeState === "RTO" ? "critical" : "warning"}>
                  {`Outcome: ${outcome.outcomeState}`}
                </Badge>
              ) : (
                <Badge tone="info">Awaiting Delivery Outcome</Badge>
              )}
            </InlineStack>

            <BlockStack gap="200">
              <InlineStack align="space-between">
                <Text variant="bodySm" tone="subdued" as="span">Initial ProfitRx Recommendation:</Text>
                <Text variant="bodySm" fontWeight="semibold" as="span">{decisionState.initialRecommendation}</Text>
              </InlineStack>
              <InlineStack align="space-between">
                <Text variant="bodySm" tone="subdued" as="span">Merchant Selected Action:</Text>
                <Text variant="bodySm" fontWeight="semibold" as="span">{decisionState.currentAction}</Text>
              </InlineStack>
              {decisionState.overrideReason && (
                <InlineStack align="space-between">
                  <Text variant="bodySm" tone="subdued" as="span">Override Reason:</Text>
                  <Text variant="bodySm" as="span"><em>&ldquo;{decisionState.overrideReason}&rdquo;</em></Text>
                </InlineStack>
              )}
              <InlineStack align="space-between">
                <Text variant="bodySm" tone="subdued" as="span">Shopify Execution Status:</Text>
                <Badge tone={decisionState.executionStatus === "SUCCESS" ? "success" : decisionState.executionStatus === "FAILED" ? "critical" : undefined}>
                  {decisionState.executionStatus}
                </Badge>
              </InlineStack>

              {outcome && (
                <>
                  <Divider />
                  <Box padding="200" background="bg-surface-secondary" borderRadius="100">
                    <BlockStack gap="100">
                      <Text variant="bodySm" fontWeight="bold" as="p">
                        Outcome Financial Verification:
                      </Text>
                      <Text variant="bodySm" as="p">
                        {outcome.explanation}
                      </Text>
                      <InlineStack align="space-between">
                        <Text variant="bodySm" as="span">Estimated Expected Value ($EV$):</Text>
                        <Text variant="bodySm" fontWeight="semibold" as="span">
                          {currencySymbol}{Math.round(outcome.comparison.estimatedExpectedValue)}
                        </Text>
                      </InlineStack>
                      <InlineStack align="space-between">
                        <Text variant="bodySm" as="span">Actual Realized Profit / Loss:</Text>
                        <Text
                          variant="bodySm"
                          fontWeight="bold"
                          tone={outcome.realizedProfit >= 0 ? "success" : "critical"}
                          as="span"
                        >
                          {outcome.realizedProfit >= 0 ? `+${currencySymbol}` : `-${currencySymbol}`}
                          {Math.abs(Math.round(outcome.realizedProfit))}
                        </Text>
                      </InlineStack>
                      {outcome.verifiedSavings > 0 && (
                        <InlineStack align="space-between">
                          <Text variant="bodySm" tone="success" as="span">Verified RTO Savings Avoided:</Text>
                          <Text variant="bodySm" fontWeight="bold" tone="success" as="span">
                            +{currencySymbol}{Math.round(outcome.verifiedSavings)}
                          </Text>
                        </InlineStack>
                      )}
                    </BlockStack>
                  </Box>
                </>
              )}
            </BlockStack>
          </BlockStack>
        </Card>
      )}

      {/* ── OVERRIDE MODAL ── */}
      <Modal
        open={isOverrideModalOpen}
        onClose={() => setIsOverrideModalOpen(false)}
        title={`Change Decision for Order #${order.orderNumber}`}
        primaryAction={{
          content: "Apply Action",
          onAction: handleConfirmOverride,
          loading: isSubmitting,
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: () => setIsOverrideModalOpen(false),
          },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            <Banner tone="info">
              <Text variant="bodySm" as="p">
                ProfitRx recommends <strong>{recommendation.actionLabel}</strong> based on an estimated payoff of {currencySymbol}{Math.round(economics.expectedContribution)}.
                Merchant overrides are recorded in the decision audit trail.
              </Text>
            </Banner>

            <Select
              label="Selected Action"
              options={[
                { label: "Allow COD (Fulfill Normally)", value: "ALLOW_COD" },
                { label: "Verify Order (Dispatch OTP Intent Check)", value: "VERIFY" },
                { label: "Require Prepaid Payment Only", value: "PREPAID_ONLY" },
                { label: "Block COD (Hold/Cancel Order)", value: "BLOCK_COD" },
              ]}
              value={selectedAction}
              onChange={setSelectedAction}
            />

            <TextField
              label="Reason for Action / Override"
              value={overrideReason}
              onChange={setOverrideReason}
              placeholder="e.g. Customer confirmed shipping address and intent via telephone"
              autoComplete="off"
              multiline={3}
            />
          </BlockStack>
        </Modal.Section>
      </Modal>
    </BlockStack>
  );
}
