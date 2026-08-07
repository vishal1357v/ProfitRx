import { ExecutionContext, ExecutionResult } from "../types";
import { ActionExecutor } from "./executor.interface";
import { OtpProvider } from "../providers/otp/otp.provider";
import { ProviderErrorNormalizer } from "../providers/normalizer/error-normalizer";

export class OtpExecutor implements ActionExecutor {
  constructor(private provider: OtpProvider) {}

  async execute(context: ExecutionContext): Promise<ExecutionResult> {
    const startTime = performance.now();
    let providerLatencyMs = 0;

    const phone = context.customer.phone;
    if (!phone) {
      return {
        success: false,
        action: "OTP_VERIFY",
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
    const result = await this.provider.sendOtp(phone, "Your OTP for {{shop}} is {{otp}}.");
    providerLatencyMs = performance.now() - providerStart;

    if (result.success) {
      return {
        success: true,
        action: "OTP_VERIFY",
        status: "SENT",
        provider: "OtpProvider",
        externalId: result.messageId,
        retryable: false,
        timestamp: new Date(),
        message: "OTP sent successfully.",
        metrics: { executionTimeMs: performance.now() - startTime, retryCount: 0, providerLatencyMs }
      };
    } else {
      const errorCode = ProviderErrorNormalizer.normalize(result.error);
      return {
        success: false,
        action: "OTP_VERIFY",
        status: "FAILED",
        provider: "OtpProvider",
        retryable: ProviderErrorNormalizer.isRetryable(errorCode),
        errorCode,
        timestamp: new Date(),
        message: "Failed to send OTP.",
        metrics: { executionTimeMs: performance.now() - startTime, retryCount: 0, providerLatencyMs }
      };
    }
  }
}
