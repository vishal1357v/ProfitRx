/**
 * Centralized logic for mapping fulfillment status from Shopify payloads (GraphQL and REST webhooks).
 * This ensures that RTO detection is identical whether syncing historical orders
 * or processing real-time webhooks.
 */

export function determineFulfillmentStatus(
  baseStatus: string | null | undefined, 
  tags: string[], 
  fulfillments: any[], 
  rtoPattern: string, 
  isGraphQL: boolean
): string {
  const rtoTags = (rtoPattern || "").split(",").map(t => t.trim().toLowerCase()).filter(Boolean);
  
  const hasRtoTag = tags.some((tag: string) => 
    rtoTags.some(term => tag.toLowerCase().includes(term))
  );

  let hasRtoEvent = false;

  if (isGraphQL) {
    // GraphQL format: from admin.graphql queries
    for (const f of fulfillments) {
      const events = f.events?.edges || [];
      for (const e of events) {
        const msg = (e.node.message || "").toLowerCase();
        const status = (e.node.status || "").toLowerCase();
        
        if (
          rtoTags.some(term => msg.includes(term)) || 
          (status === "failure" && msg.includes("undelivered"))
        ) {
          hasRtoEvent = true;
          break;
        }
      }
      if (hasRtoEvent) break;
    }
  } else {
    // REST format: from webhooks
    for (const f of fulfillments) {
      const status = (f.status || "").toLowerCase();
      const shipmentStatus = (f.shipment_status || "").toLowerCase();
      const trackingCompany = (f.tracking_company || "").toLowerCase();
      
      if (
        status === "failure" || 
        shipmentStatus === "rto" || 
        shipmentStatus === "returned" ||
        rtoTags.some(term => shipmentStatus.includes(term) || trackingCompany.includes(term))
      ) {
        hasRtoEvent = true;
        break;
      }
    }
  }

  const isRTO = hasRtoTag || hasRtoEvent;
  
  if (isRTO) {
    return "RTO";
  }
  
  if (!baseStatus) {
    return "UNFULFILLED";
  }
  
  return baseStatus.toUpperCase();
}
