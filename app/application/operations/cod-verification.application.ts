import * as crypto from "crypto";
import { CodOrderRepository } from "../../infrastructure/repositories/cod-order.repository";
import { OrderRepository } from "../../infrastructure/repositories/order.repository";
import { CODManagementService } from "../../services/cod-management.service";
import { ShopifyService } from "../../services/shopify.service";

export interface VerificationDetailsDTO {
  success: boolean;
  error?: string;
  shop?: string;
  orderId?: string;
  orderNumber?: number | string;
  totalPrice?: number;
  customerName?: string;
  status?: string;
  verified?: boolean;
  phone?: string;
  token?: string;
}

export class CodVerificationApplicationService {
  /**
   * Validate HMAC signature token for customer verification links.
   */
  static validateToken(shop: string, orderId: string, token: string): boolean {
    const secret = process.env.SHOPIFY_API_SECRET;
    if (!secret || !shop || !orderId || !token) return false;
    const cleanId = orderId.replace("gid://shopify/Order/", "");
    const expectedToken = crypto
      .createHmac("sha256", secret)
      .update(`${shop}:${cleanId}`)
      .digest("hex");

    // Also support token generated with full GID if applicable
    const expectedGidToken = crypto
      .createHmac("sha256", secret)
      .update(`${shop}:${orderId}`)
      .digest("hex");

    return token === expectedToken || token === expectedGidToken;
  }

  /**
   * Get safe customer-facing details for the verification page.
   */
  static async getVerificationDetails(
    shop: string,
    orderId: string,
    token: string
  ): Promise<VerificationDetailsDTO> {
    if (!this.validateToken(shop, orderId, token)) {
      return {
        success: false,
        error: "Invalid or expired security token. Please check your verification link.",
      };
    }

    const cleanOrderId = orderId.replace("gid://shopify/Order/", "");
    const [codOrder, orderRecord] = await Promise.all([
      CodOrderRepository.findByCleanOrderId(cleanOrderId),
      OrderRepository.findById(shop, cleanOrderId).then(async (o) => {
        if (o) return o;
        return OrderRepository.findById(shop, `gid://shopify/Order/${cleanOrderId}`);
      }),
    ]);

    if (!codOrder || codOrder.shop !== shop) {
      return {
        success: false,
        error: "No Cash on Delivery verification record found for this order.",
      };
    }

    return {
      success: true,
      shop,
      orderId: cleanOrderId,
      orderNumber: orderRecord?.orderNumber || "N/A",
      totalPrice: orderRecord?.totalPrice || 0,
      customerName: orderRecord?.customerName || "Valued Customer",
      status: codOrder.status,
      verified: codOrder.otpVerified,
      phone: codOrder.phone ? `******${codOrder.phone.slice(-4)}` : "your registered number",
      token,
    };
  }

  /**
   * Process customer OTP verification submission.
   */
  static async verifyCustomerOtp(
    shop: string,
    orderId: string,
    otp: string
  ): Promise<{ success: boolean; message?: string }> {
    const cleanId = orderId.replace("gid://shopify/Order/", "");
    return CODManagementService.verifyOTP(shop, cleanId, otp);
  }

  /**
   * Resend OTP to customer.
   */
  static async resendCustomerOtp(
    shop: string,
    orderId: string
  ): Promise<{ success: boolean; message?: string }> {
    const cleanId = orderId.replace("gid://shopify/Order/", "");
    const codOrder = await CodOrderRepository.findByOrderId(shop, cleanId);
    if (!codOrder) {
      return { success: false, message: "Order verification record not found." };
    }
    return CODManagementService.createCODOrderVerification(shop, cleanId, codOrder.phone);
  }

  /**
   * Cancel order via Shopify API and update verification status.
   */
  static async cancelCustomerOrder(
    shop: string,
    orderId: string
  ): Promise<{ success: boolean; message?: string }> {
    const cleanId = orderId.replace("gid://shopify/Order/", "");
    const codOrder = await CodOrderRepository.findByOrderId(shop, cleanId);
    if (!codOrder) {
      return { success: false, message: "Order verification record not found." };
    }

    if (codOrder.otpVerified) {
      return {
        success: false,
        message: "Verified orders cannot be cancelled online. Please contact store support.",
      };
    }

    if (codOrder.status === "CANCELLED" || codOrder.status === "CANCELED") {
      return { success: false, message: "Order is already cancelled." };
    }

    const res = await ShopifyService.cancelOrder(shop, cleanId);
    if (res.success) {
      await CodOrderRepository.updateStatus(shop, cleanId, "CANCELLED");
    }
    return res;
  }

  /**
   * Get COD Profit Breakdown for COD dashboard.
   */
  static async getDashboardProfitBreakdown(shop: string, host: string) {
    return CODManagementService.getCODProfitBreakdown(shop, host);
  }
}
