/* eslint-disable @typescript-eslint/no-explicit-any */
import { Resend } from "resend";
import prisma from "../db.server";

export class AlertService {
  /**
   * Log an alert in the database and dispatch an email via Resend if email setting exists
   */
  static async triggerAlert(
    shop: string,
    type: "PROFIT_DROP" | "HIGH_RTO" | "LOW_MARGIN",
    severity: "INFO" | "WARNING" | "CRITICAL",
    message: string,
    additionalData?: any
  ) {
    console.log(`[AlertService.triggerAlert] Triggering alert for ${shop}: [${severity}] ${type} - ${message}`);

    // 1. Persist alert in database
    const alert = await prisma.alert.create({
      data: {
        shop,
        type,
        severity,
        message,
        data: additionalData || undefined,
      },
    });
    console.log(`[AlertService.triggerAlert] Saved alert in DB: id=${alert.id}`);

    // 2. Fetch alert settings
    const settings = await prisma.storeSettings.findUnique({
      where: { shop },
    });

    if (!settings?.alertEmail) {
      console.log(`[AlertService.triggerAlert] No alert email configured for shop: ${shop}. Skipping email dispatch.`);
      return alert;
    }

    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey) {
      console.warn(`[AlertService.triggerAlert] RESEND_API_KEY is not configured in environment. Skipping email dispatch.`);
      return alert;
    }

    // 3. Dispatch Email via Resend
    try {
      const resend = new Resend(resendApiKey);
      const emailResponse = await resend.emails.send({
        from: "Greek God SaaS <alerts@greek-god.saas>", // If not using custom domain, Resend onboarding uses onboarding@resend.dev but requires verified domains for custom addresses. Standard default fallback:
        to: settings.alertEmail,
        subject: `[${severity}] Greek God Alert: ${message.slice(0, 50)}`,
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #eaeaea; border-radius: 5px; max-width: 600px;">
            <h2 style="color: #d9534f;">Greek God Alert</h2>
            <p>We detected a metrics issue on your shop: <strong>${shop}</strong></p>
            <hr style="border: 0; border-top: 1px solid #eaeaea; margin: 20px 0;" />
            <table style="width: 100%;">
              <tr>
                <td style="padding: 5px 0; font-weight: bold; width: 120px;">Alert Type:</td>
                <td style="padding: 5px 0;">${type}</td>
              </tr>
              <tr>
                <td style="padding: 5px 0; font-weight: bold;">Severity:</td>
                <td style="padding: 5px 0;"><span style="background-color: ${severity === "CRITICAL" ? "#d9534f" : "#f0ad4e"}; color: white; padding: 2px 6px; border-radius: 3px; font-size: 12px;">${severity}</span></td>
              </tr>
              <tr>
                <td style="padding: 5px 0; font-weight: bold; vertical-align: top;">Message:</td>
                <td style="padding: 5px 0;">${message}</td>
              </tr>
            </table>
            <hr style="border: 0; border-top: 1px solid #eaeaea; margin: 20px 0;" />
            <p style="font-size: 12px; color: #777;">Please log in to your Shopify store admin and open Greek God SaaS to review your dashboard metrics.</p>
          </div>
        `,
      });

      console.log(`[AlertService.triggerAlert] Email dispatched successfully: id=${emailResponse.data?.id}`);
    } catch (err) {
      console.error(`[AlertService.triggerAlert] Failed to send email alert via Resend:`, err);
    }

    return alert;
  }
}
