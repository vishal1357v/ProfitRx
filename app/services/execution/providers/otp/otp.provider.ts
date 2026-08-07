export interface OtpProvider {
  sendOtp(phone: string, messageTemplate: string): Promise<{ success: true; messageId: string } | { success: false; error: any }>;
}
