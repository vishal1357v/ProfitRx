import type { LoaderFunctionArgs } from "react-router";
import { CODManagementService } from "../services/cod-management.service";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop") || "";

  const settings = shop ? await CODManagementService.getCODSettings(shop) : null;
  const blockedPincodes = settings?.codBlockedPincodes || [];
  const isBlockingActive = settings?.codBlockingEnabled ?? false;

  const scriptContent = `
(function() {
  console.log("[ProfitRx COD Shield] Active for store: ${shop}");
  const blockedList = ${JSON.stringify(blockedPincodes)};
  const isBlockingEnabled = ${isBlockingActive};

  function evaluatePincode(zipCode) {
    if (!isBlockingEnabled || !zipCode) return;
    const cleanZip = zipCode.toString().trim();
    const isBlocked = blockedList.includes(cleanZip);

    const codElements = document.querySelectorAll('[data-gateway-group="manual"], input[value*="cod" i], label:has(input[value*="cod" i])');
    let banner = document.getElementById("profitrx-cod-banner");

    if (isBlocked) {
      codElements.forEach(el => {
        el.style.display = "none";
        if (el instanceof HTMLInputElement) el.disabled = true;
      });

      if (!banner) {
        banner = document.createElement("div");
        banner.id = "profitrx-cod-banner";
        banner.style.cssText = "padding: 12px 16px; margin: 12px 0; background: #fee2e2; border: 1px solid #ef4444; color: #991b1b; border-radius: 8px; font-weight: 600; font-family: sans-serif; font-size: 14px;";
        const container = document.querySelector('.step__sections') || document.body;
        container.prepend(banner);
      }
      banner.innerText = "🛑 Cash on Delivery is unavailable for pincode " + cleanZip + " due to high return rates. Please choose Prepaid.";
    } else {
      codElements.forEach(el => {
        el.style.display = "";
        if (el instanceof HTMLInputElement) el.disabled = false;
      });
      if (banner) banner.remove();
    }
  }

  document.addEventListener("DOMContentLoaded", function() {
    const zipInput = document.querySelector('input[name="checkout[shipping_address][zip]"], #checkout_shipping_address_zip');
    if (zipInput) {
      zipInput.addEventListener("input", function(e) {
        evaluatePincode(e.target.value);
      });
      evaluatePincode(zipInput.value);
    }
  });
})();
`;

  return new Response(scriptContent, {
    headers: {
      "Content-Type": "application/javascript",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=300",
    },
  });
};
