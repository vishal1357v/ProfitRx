import { useState } from "react";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { useLoaderData, useSubmit, useNavigation } from "react-router";
import { CodVerificationApplicationService } from "../application/operations/cod-verification.application";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop") || "";
  const orderId = url.searchParams.get("orderId") || "";
  const token = url.searchParams.get("token") || "";

  if (!shop || !orderId || !token) {
    return { error: "Invalid verification link. Missing shop, order details, or security token." };
  }

  const result = await CodVerificationApplicationService.getVerificationDetails(shop, orderId, token);
  if (!result.success) {
    return { error: result.error || "Unable to load verification details." };
  }

  return {
    shop: result.shop,
    orderId: result.orderId,
    orderNumber: result.orderNumber,
    totalPrice: result.totalPrice,
    customerName: result.customerName,
    status: result.status,
    verified: result.verified,
    phone: result.phone,
    token: result.token,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const formData = await request.formData();
    const intent = formData.get("intent") as string;
    const shop = formData.get("shop") as string;
    const orderId = formData.get("orderId") as string;
    const token = formData.get("token") as string;

    if (!shop || !orderId || !token) {
      return Response.json({ error: "Missing required parameters" }, { status: 400 });
    }

    if (!CodVerificationApplicationService.validateToken(shop, orderId, token)) {
      return Response.json({ error: "Unauthorized request signature" }, { status: 401 });
    }

    if (intent === "verify_otp") {
      const otp = formData.get("otp") as string;
      if (!otp || otp.length !== 6) {
        return Response.json({ success: false, message: "Please enter a valid 6-digit OTP." });
      }
      const res = await CodVerificationApplicationService.verifyCustomerOtp(shop, orderId, otp);
      return Response.json(res);
    }

    if (intent === "resend_otp") {
      const res = await CodVerificationApplicationService.resendCustomerOtp(shop, orderId);
      return Response.json(res);
    }

    if (intent === "cancel_order") {
      const res = await CodVerificationApplicationService.cancelCustomerOrder(shop, orderId);
      return Response.json(res);
    }

    return Response.json({ error: "Invalid intent" }, { status: 400 });
  } catch (err: any) {
    console.error("[verify-cod action error]:", err);
    return Response.json({ error: "An internal error occurred" }, { status: 500 });
  }
};

export default function VerifyCODPage() {
  const data = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const [otp, setOtp] = useState("");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  if ("error" in data) {
    return (
      <div className="verify-container error-state">
        <div className="verify-card">
          <div className="icon-badge error">🛑</div>
          <h2>Verification Failed</h2>
          <p>{data.error}</p>
        </div>
      </div>
    );
  }

  const { shop, orderId, orderNumber, totalPrice, customerName, verified, phone, status, token } = data as any;

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length !== 6) {
      setMessage({ type: "error", text: "Please enter a valid 6-digit OTP code." });
      return;
    }

    setLoadingAction("verify");
    setMessage(null);

    try {
      const fd = new FormData();
      fd.append("intent", "verify_otp");
      fd.append("shop", shop);
      fd.append("orderId", orderId);
      fd.append("token", token as string);
      fd.append("otp", otp);

      const response = await fetch("", { method: "POST", body: fd });
      const res = await response.json();

      if (res.success) {
        setMessage({ type: "success", text: "Order verified successfully! You can close this window now." });
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      } else {
        setMessage({ type: "error", text: res.message || "Invalid OTP code. Please try again." });
      }
    } catch (err) {
      setMessage({ type: "error", text: "Network error. Please try again." });
    } finally {
      setLoadingAction(null);
    }
  };

  const handleResend = async () => {
    setLoadingAction("resend");
    setMessage(null);

    try {
      const fd = new FormData();
      fd.append("intent", "resend_otp");
      fd.append("shop", shop);
      fd.append("orderId", orderId);
      fd.append("token", token as string);

      const response = await fetch("", { method: "POST", body: fd });
      const res = await response.json();

      if (res.success) {
        setMessage({ type: "success", text: "OTP code resent successfully!" });
      } else {
        setMessage({ type: "error", text: res.message || "Failed to resend OTP. Please try again." });
      }
    } catch (err) {
      setMessage({ type: "error", text: "Network error. Please try again." });
    } finally {
      setLoadingAction(null);
    }
  };

  const handleCancel = async () => {
    if (!confirm("Are you sure you want to cancel this order? This action cannot be undone.")) return;

    setLoadingAction("cancel");
    setMessage(null);

    try {
      const fd = new FormData();
      fd.append("intent", "cancel_order");
      fd.append("shop", shop);
      fd.append("orderId", orderId);
      fd.append("token", token as string);

      const response = await fetch("", { method: "POST", body: fd });
      const res = await response.json();

      if (res.success) {
        setMessage({ type: "success", text: "Order has been canceled successfully." });
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      } else {
        setMessage({ type: "error", text: res.message || "Failed to cancel order. Please contact support." });
      }
    } catch (err) {
      setMessage({ type: "error", text: "Network error. Please try again." });
    } finally {
      setLoadingAction(null);
    }
  };

  return (
    <div className="verify-container">
      <style>{`
        body {
          margin: 0;
          padding: 0;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          background: radial-gradient(circle at top left, #121829, #0a0c16);
          color: #f3f4f6;
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .verify-container {
          padding: 20px;
          width: 100%;
          max-width: 450px;
          box-sizing: border-box;
        }
        .verify-card {
          background: rgba(255, 255, 255, 0.03);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 20px;
          padding: 30px;
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
          text-align: center;
        }
        .icon-badge {
          width: 60px;
          height: 60px;
          border-radius: 50%;
          background: rgba(59, 130, 246, 0.15);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 28px;
          margin: 0 auto 20px;
        }
        .icon-badge.success {
          background: rgba(16, 185, 129, 0.15);
        }
        .icon-badge.error {
          background: rgba(239, 68, 68, 0.15);
        }
        h2 {
          margin: 0 0 10px 0;
          font-size: 22px;
          font-weight: 700;
          letter-spacing: -0.5px;
        }
        p.subtitle {
          color: #9ca3af;
          font-size: 14px;
          line-height: 1.5;
          margin: 0 0 24px 0;
        }
        .order-summary {
          background: rgba(255, 255, 255, 0.02);
          border-radius: 12px;
          padding: 16px;
          margin-bottom: 24px;
          border: 1px solid rgba(255, 255, 255, 0.04);
          text-align: left;
          font-size: 14px;
        }
        .summary-row {
          display: flex;
          justify-content: space-between;
          margin-bottom: 8px;
        }
        .summary-row:last-child {
          margin-bottom: 0;
        }
        .summary-label {
          color: #9ca3af;
        }
        .summary-value {
          font-weight: 600;
        }
        .otp-form {
          margin-bottom: 20px;
        }
        .otp-input-wrapper {
          position: relative;
          margin-bottom: 16px;
        }
        .otp-input {
          width: 100%;
          box-sizing: border-box;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 10px;
          padding: 14px;
          color: #fff;
          font-size: 20px;
          font-weight: 700;
          text-align: center;
          letter-spacing: 4px;
          transition: all 0.2s;
        }
        .otp-input:focus {
          outline: none;
          background: rgba(255, 255, 255, 0.08);
          border-color: #3b82f6;
          box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.25);
        }
        .verify-btn {
          width: 100%;
          background: #3b82f6;
          color: #fff;
          border: none;
          border-radius: 10px;
          padding: 14px;
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.2s;
        }
        .verify-btn:hover {
          background: #2563eb;
        }
        .verify-btn:disabled {
          background: #4b5563;
          color: #9ca3af;
          cursor: not-allowed;
        }
        .message-banner {
          padding: 12px;
          border-radius: 8px;
          font-size: 13.5px;
          font-weight: 500;
          margin-bottom: 20px;
          text-align: left;
        }
        .message-banner.success {
          background: rgba(16, 185, 129, 0.1);
          border: 1px solid rgba(16, 185, 129, 0.2);
          color: #34d399;
        }
        .message-banner.error {
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.2);
          color: #f87171;
        }
        .action-links {
          display: flex;
          justify-content: space-between;
          font-size: 13px;
        }
        .action-btn {
          background: none;
          border: none;
          color: #60a5fa;
          cursor: pointer;
          padding: 0;
          text-decoration: underline;
        }
        .action-btn:hover {
          color: #93c5fd;
        }
        .action-btn.cancel {
          color: #f87171;
        }
        .action-btn.cancel:hover {
          color: #fca5a5;
        }
        .action-btn:disabled {
          color: #4b5563;
          cursor: not-allowed;
          text-decoration: none;
        }
        .verified-badge {
          background: rgba(16, 185, 129, 0.1);
          border: 1px solid rgba(16, 185, 129, 0.2);
          color: #34d399;
          border-radius: 30px;
          padding: 8px 16px;
          display: inline-block;
          font-weight: 600;
          font-size: 14px;
        }
        .canceled-badge {
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.2);
          color: #f87171;
          border-radius: 30px;
          padding: 8px 16px;
          display: inline-block;
          font-weight: 600;
          font-size: 14px;
        }
      `}</style>

      <div className="verify-card">
        {verified ? (
          <>
            <div className="icon-badge success">✓</div>
            <h2>Order Verified</h2>
            <p className="subtitle">Thank you for confirming your order, {customerName}. Your shipment is now being processed.</p>
            <div className="order-summary">
              <div className="summary-row">
                <span className="summary-label">Order Number:</span>
                <span className="summary-value">#{orderNumber}</span>
              </div>
              <div className="summary-row">
                <span className="summary-label">Total Amount:</span>
                <span className="summary-value">₹{totalPrice.toLocaleString()}</span>
              </div>
            </div>
            <div className="verified-badge">✓ Verified Cash on Delivery</div>
          </>
        ) : status === "CANCELLED" || status === "CANCELED" ? (
          <>
            <div className="icon-badge error">✕</div>
            <h2>Order Canceled</h2>
            <p className="subtitle">This order has been canceled. If this was a mistake, please reach out to the store support.</p>
            <div className="order-summary">
              <div className="summary-row">
                <span className="summary-label">Order Number:</span>
                <span className="summary-value">#{orderNumber}</span>
              </div>
            </div>
            <div className="canceled-badge">✕ Canceled</div>
          </>
        ) : (
          <>
            <div className="icon-badge">💬</div>
            <h2>Confirm COD Order</h2>
            <p className="subtitle">
              Hello {customerName}. We've sent a 6-digit WhatsApp OTP verification code to <strong>{phone}</strong>. Please enter the code below to verify your order.
            </p>

            {message && (
              <div className={`message-banner ${message.type}`}>
                {message.text}
              </div>
            )}

            <form onSubmit={handleVerify} className="otp-form">
              <div className="otp-input-wrapper">
                <input
                  type="text"
                  placeholder="------"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                  className="otp-input"
                  disabled={loadingAction !== null}
                />
              </div>
              <button
                type="submit"
                className="verify-btn"
                disabled={loadingAction !== null || otp.length !== 6}
              >
                {loadingAction === "verify" ? "Verifying..." : "Confirm COD Order"}
              </button>
            </form>

            <div className="action-links">
              <button
                type="button"
                onClick={handleResend}
                disabled={loadingAction !== null}
                className="action-btn"
              >
                {loadingAction === "resend" ? "Sending..." : "Resend OTP"}
              </button>
              <button
                type="button"
                onClick={handleCancel}
                disabled={loadingAction !== null}
                className="action-btn cancel"
              >
                {loadingAction === "cancel" ? "Canceling..." : "Cancel Order"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
