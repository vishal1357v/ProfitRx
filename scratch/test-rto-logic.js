// test-rto-logic.js
// Verification tests for RTO Signal-based detection rules

const rtoDetectionPattern = "rto,returned,undelivered,failed_delivery,rto-initiated,rto_initiated,shipped-rto,shiprocket-rto,delhivery_rto,rto-delhivery,rto-bluedart,return-to-origin,returned-to-sender";

function detectRto(node, pattern) {
  const tagsList = node.tags || [];
  const rtoTags = pattern.split(",").map(t => t.trim().toLowerCase()).filter(Boolean);
  
  // 1. Check tags
  const hasRtoTag = tagsList.some(tag => 
    rtoTags.some(term => tag.toLowerCase().includes(term))
  );

  // 2. Check events
  let hasRtoEvent = false;
  const fulfillments = node.fulfillments || [];
  for (const f of fulfillments) {
    const events = f.events || [];
    for (const e of events) {
      const msg = (e.message || "").toLowerCase();
      const status = (e.status || "").toLowerCase();
      const matchesTerm = rtoTags.some(term => msg.includes(term));
      if (
        matchesTerm || 
        (status === "failure" && msg.includes("undelivered"))
      ) {
        hasRtoEvent = true;
        break;
      }
    }
    if (hasRtoEvent) break;
  }

  return hasRtoTag || hasRtoEvent;
}

// Mock Order Test Cases
const testOrders = [
  {
    name: "#1001 - Delhivery Courier RTO Tagged",
    tags: ["Delhivery", "rto-delhivery", "prepaid"],
    fulfillments: []
  },
  {
    name: "#1002 - Shiprocket RTO Tagged",
    tags: ["SR-RTO", "COD"],
    fulfillments: []
  },
  {
    name: "#1003 - Bluedart Event RTO Message",
    tags: ["COD"],
    fulfillments: [
      {
        events: [
          { status: "in_transit", message: "Out for delivery" },
          { status: "failure", message: "Returned to sender (RTO)" }
        ]
      }
    ]
  },
  {
    name: "#1004 - Delhivery Event Undelivered Failure",
    tags: ["prepaid"],
    fulfillments: [
      {
        events: [
          { status: "failure", message: "Customer refused delivery, package undelivered" }
        ]
      }
    ]
  },
  {
    name: "#1005 - Standard Delivered Order (No RTO)",
    tags: ["COD"],
    fulfillments: [
      {
        events: [
          { status: "success", message: "Delivered successfully" }
        ]
      }
    ]
  }
];

console.log("=== RTO SIGNAL DETECTION TEST SUITE ===");
testOrders.forEach(o => {
  const isRto = detectRto(o, rtoDetectionPattern);
  console.log(`Order ${o.name} -> Detected RTO: ${isRto ? "✅ YES (RTO)" : "❌ NO"}`);
});
