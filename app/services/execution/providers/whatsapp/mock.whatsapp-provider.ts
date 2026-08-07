import { WhatsappProvider } from "./whatsapp.provider";

export class MockWhatsappProvider implements WhatsappProvider {
  async sendTemplate(phone: string, templateId: string, variables: Record<string, string>): Promise<{ success: true; messageId: string; } | { success: false; error: any; }> {
    if (phone === "FAIL_TIMEOUT") {
      return { success: false, error: new Error("Connection timeout") };
    }
    if (phone === "FAIL_UNAUTHORIZED") {
      return { success: false, error: { status: 401, message: "Invalid API Key" } };
    }
    
    return { success: true, messageId: `mock-wa-${Date.now()}` };
  }
}
