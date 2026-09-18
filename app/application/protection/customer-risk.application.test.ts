import { describe, it, expect, vi, beforeEach } from "vitest";
import { CustomerRiskApplicationService } from "./customer-risk.application";
import { CustomerRepository } from "../../infrastructure/repositories/customer.repository";
import { AuditLogService } from "../../services/compliance/audit-log.service";

describe("CustomerRiskApplicationService", () => {
  const shop = "test-store.myshopify.com";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calculates customer risk metrics and summary correctly", async () => {
    const mockProfiles = [
      {
        id: "cr_1",
        shop,
        customerId: "cust_1",
        phone: "+919876543210",
        email: "buyer1@example.com",
        totalOrders: 5,
        codOrders: 4,
        prepaidOrders: 1,
        successfulDeliveries: 2,
        rtoCount: 2,
        cancellationCount: 0,
        aov: 1200,
        lifetimeSpend: 4800,
        lastOrderDate: new Date("2026-01-15"),
        riskScore: 75,
        riskLevel: "CRITICAL",
        updatedAt: new Date(),
      },
      {
        id: "cr_2",
        shop,
        customerId: "cust_2",
        phone: "+919123456789",
        email: "buyer2@example.com",
        totalOrders: 3,
        codOrders: 3,
        prepaidOrders: 0,
        successfulDeliveries: 3,
        rtoCount: 0,
        cancellationCount: 0,
        aov: 800,
        lifetimeSpend: 2400,
        lastOrderDate: new Date("2026-02-01"),
        riskScore: 15,
        riskLevel: "LOW",
        updatedAt: new Date(),
      },
    ];

    vi.spyOn(CustomerRepository, "findRiskProfilesByShop").mockResolvedValue(mockProfiles as any);
    vi.spyOn(AuditLogService, "logAccess").mockResolvedValue(undefined);

    const result = await CustomerRiskApplicationService.getCustomerRiskData(shop);

    expect(result.shop).toBe(shop);
    expect(result.summary.totalOffenders).toBe(1);
    expect(result.summary.highRiskCount).toBe(1);
    expect(result.summary.totalLoss).toBe(500); // 2 RTOs * 250
    expect(result.summary.avgRtoRate).toBe(50); // 2 / 4 = 50%
    expect(result.customers).toHaveLength(2);

    expect(result.customers[0].rtoRate).toBe(50);
    expect(result.customers[0].deliveryRate).toBe(40);
    expect(result.customers[1].rtoRate).toBe(0);
    expect(result.customers[1].deliveryRate).toBe(100);
  });

  it("updates customer risk action and logs audit event", async () => {
    const updateSpy = vi.spyOn(CustomerRepository, "updateRiskLevel").mockResolvedValue({} as any);
    const auditSpy = vi.spyOn(AuditLogService, "logAccess").mockResolvedValue(undefined);

    const res = await CustomerRiskApplicationService.updateCustomerRiskAction(shop, "cust_123", "FORCE_PREPAID");

    expect(res.success).toBe(true);
    expect(updateSpy).toHaveBeenCalledWith(shop, "cust_123", {
      riskLevel: "CRITICAL",
      riskScore: 85,
    });
    expect(auditSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        shop,
        resource: "CUSTOMER_RISK_ACTION",
        resourceId: "cust_123",
      })
    );
  });
});
