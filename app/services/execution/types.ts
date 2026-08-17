import { ActionType, DecisionResult, MerchantDecisionSettings } from "../decision-engine/types";

export interface ExecutionContext {
  shop: string;
  orderId: string;
  decision: DecisionResult;
  customer: {
    id: string;
    phone?: string;
    email?: string;
  }; 
  merchantSettings: MerchantDecisionSettings;
  trigger: "WEBHOOK" | "MANUAL" | "SCHEDULED_RETRY";
}

export type ExecutionStatus = 
  | "PENDING"
  | "IN_PROGRESS"
  | "SENT"
  | "DELIVERED"
  | "FAILED"
  | "SKIPPED"
  | "ADVISORY_ONLY";

export type ProviderErrorCode = 
  | "INVALID_CONFIGURATION"
  | "PROVIDER_TIMEOUT"
  | "RATE_LIMITED"
  | "NETWORK_ERROR"
  | "INVALID_TEMPLATE"
  | "UNSUPPORTED_ACTION"
  | "SHOPIFY_MUTATION_FAILED"
  | "UNKNOWN_ERROR";

export interface ExecutionResult {
  success: boolean;
  action: ActionType;
  status: ExecutionStatus;
  provider: string;
  externalId?: string;
  retryable: boolean;
  errorCode?: ProviderErrorCode;
  timestamp: Date;
  message: string;
  metrics: {
    executionTimeMs: number;
    retryCount: number;
    providerLatencyMs: number;
  };
}

export interface ActionExecutor {
  execute(context: ExecutionContext): Promise<ExecutionResult>;
}

export interface ExecutionEvent {
  eventId: string;
  shop: string;
  orderId: string;
  eventType: "OTP_SENT" | "OTP_FAILED" | "WHATSAPP_SENT" | "WHATSAPP_FAILED" | "COD_BLOCKED" | "PAYMENT_LINK_SENT" | "PREPAID_ONLY_APPLIED" | "ALLOW_COD_APPLIED" | "EXECUTION_SKIPPED";
  timestamp: Date;
  payload: any;
}
