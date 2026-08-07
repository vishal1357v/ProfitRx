import { ExecutionContext, ExecutionResult } from "../types";
import { ActionExecutor } from "./executor.interface";
import { WhatsappProvider } from "../providers/whatsapp/whatsapp.provider";
import { ProviderErrorNormalizer } from "../providers/normalizer/error-normalizer";

export class WhatsappExecutor implements ActionExecutor {
  constructor(private provider: WhatsappProvider) {}

  async execute(context: ExecutionContext): Promise<ExecutionResult> {
    const startTime = performance.now();
    let providerLatencyMs = 0;

    const phone = context.customer.phone;
    if (!phone) {
      return {
        success: false,
        action: "WHATSAPP_VERIFY",
        status: "FAILED",
        provider: "Internal",
        retryable: false,
        errorCode: "INVALID_CONFIGURATION",
        timestamp: new Date(),
        message: "Customer phone number is missing.",
        metrics: { executionTimeMs: performance.now() - startTime, retryCount: 0, providerLatencyMs: 0 }
      };
    }

    const providerStart = performance.now();
    const result = await this.provider.sendTemplate(phone, "verify_cod_v1", { shop: context.shop, orderId: context.orderId });
    providerLatencyMs = performance.now() - providerStart;

    if (result.success) {
      return {
        success: true,
        action: "WHATSAPP_VERIFY",
        status: "SENT",
        provider: "WhatsappProvider",
        externalId: result.messageId,
        retryable: false,
        timestamp: new Date(),
        message: "WhatsApp verification sent.",
        metrics: { executionTimeMs: performance.now() - startTime, retryCount: 0, providerLatencyMs }
      };
    } else {
      const errorCode = ProviderErrorNormalizer.normalize(result.error);
      return {
        success: false,
        action: "WHATSAPP_VERIFY",
        status: "FAILED",
        provider: "WhatsappProvider",
        retryable: ProviderErrorNormalizer.isRetryable(errorCode),
        errorCode,
        timestamp: new Date(),
        message: "Failed to send WhatsApp message.",
        metrics: { executionTimeMs: performance.now() - startTime, retryCount: 0, providerLatencyMs }
      };
    }
  }
}
