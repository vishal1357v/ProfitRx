export interface WhatsappProvider {
  sendTemplate(phone: string, templateId: string, variables: Record<string, string>): Promise<{ success: true; messageId: string } | { success: false; error: any }>;
}
