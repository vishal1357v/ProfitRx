import { OtpProvider } from "./otp.provider";
import { WhatsAppService } from "../../../whatsapp.service";

export class RealOtpProvider implements OtpProvider {
  async sendOtp(
    phone: string,
    messageTemplate: string
  ): Promise<{ success: true; messageId: string } | { success: false; error: any }> {
    try {
      const res = await WhatsAppService.sendSMSOrWhatsApp(phone, messageTemplate);
      if (res.success) {
        return {
          success: true,
          messageId: res.messageId || `msg_${Date.now()}`,
        };
      }
      return {
        success: false,
        error: new Error(
          res.provider === "unconfigured"
            ? "SMS/WhatsApp messaging gateway is unconfigured in Store Settings (Meta or Twilio credentials missing)."
            : `External messaging provider (${res.provider}) failed to dispatch OTP.`
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
