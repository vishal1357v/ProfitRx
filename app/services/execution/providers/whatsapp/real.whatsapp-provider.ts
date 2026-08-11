import { WhatsappProvider } from "./whatsapp.provider";
import { WhatsAppService } from "../../../whatsapp.service";

export class RealWhatsappProvider implements WhatsappProvider {
  async sendTemplate(
    phone: string,
    templateId: string,
    variables: Record<string, string>
  ): Promise<{ success: true; messageId: string } | { success: false; error: any }> {
    try {
      let message = `Template: ${templateId}`;
      if (Object.keys(variables).length > 0) {
        message = Object.entries(variables).reduce((msg, [k, v]) => msg.replace(`{{${k}}}`, v), templateId);
      }
      const res = await WhatsAppService.sendSMSOrWhatsApp(phone, message);
      if (res.success) {
        return {
          success: true,
          messageId: res.messageId || `wa_${Date.now()}`,
        };
      }
      return {
        success: false,
        error: new Error(
          res.provider === "unconfigured"
            ? "WhatsApp/SMS provider is unconfigured in Store Settings (Meta or Twilio credentials missing)."
            : `External messaging provider (${res.provider}) failed to deliver message.`
        ),
      };
    } catch (err: any) {
      return {
        success: false,
        error: err instanceof Error ? err : new Error(String(err)),
      };
    }
  }
}
