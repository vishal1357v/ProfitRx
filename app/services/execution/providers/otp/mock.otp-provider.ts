import { OtpProvider } from "./otp.provider";

export class MockOtpProvider implements OtpProvider {
  async sendOtp(phone: string, messageTemplate: string): Promise<{ success: true; messageId: string; } | { success: false; error: any; }> {
    // Simulate some logic for tests
    if (phone === "FAIL_TIMEOUT") {
      return { success: false, error: new Error("Connection timeout") };
    }
    if (phone === "FAIL_UNAUTHORIZED") {
      return { success: false, error: { status: 401, message: "Invalid API Key" } };
    }
    
    return { success: true, messageId: `mock-otp-${Date.now()}` };
  }
}
