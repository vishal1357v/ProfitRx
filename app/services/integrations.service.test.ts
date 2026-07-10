import { describe, it, expect, vi, beforeEach } from "vitest";
import prisma from "../db.server";
import { CODManagementService } from "./cod-management.service";
import { AdSpendService } from "./ad-spend.service";
import { WhatsAppService } from "./whatsapp.service";
import { ProfitIntelligenceService } from "./profit-intelligence.service";
import { unauthenticated } from "../shopify.server";

// Mock the Shopify Server authenticator
vi.mock("../shopify.server", () => {
  return {
    authenticate: {
      admin: vi.fn(),
      webhook: vi.fn(),
    },
    unauthenticated: {
      admin: vi.fn().mockResolvedValue({
        admin: {
          graphql: vi.fn().mockResolvedValue({
            json: vi.fn().mockResolvedValue({
              data: {
                orderUpdate: {
                  order: { id: "gid://shopify/Order/123", tags: ["COD_Verified"] },
                  userErrors: []
                },
                orderCancel: {
                  order: { id: "gid://shopify/Order/123", cancelledAt: "2026-07-10T12:00:00Z" },
                  userErrors: []
                }
              }
            })
          })
        }
      })
    }
  };
});

// Mock the Prisma DB client
vi.mock("../db.server", () => {
  return {
    default: {
      storeSettings: {
        findUnique: vi.fn(),
        upsert: vi.fn(),
        update: vi.fn(),
        create: vi.fn(),
      },
      adSpend: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        upsert: vi.fn(),
        updateMany: vi.fn(),
      },
      adSpendDaily: {
        findMany: vi.fn(),
        upsert: vi.fn(),
      },
      order: {
        count: vi.fn(),
        findMany: vi.fn(),
      },
      rTOEvent: {
        findMany: vi.fn(),
      },
      pincodeStats: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
      },
      customerProfile: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
      },
      cODOrder: {
        upsert: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
      },
    },
  };
});

// Mock the global fetch API
global.fetch = vi.fn();

describe("ProfitRx Integrations & Logic Test Suite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("CODManagementService Tests", () => {
    it("1) verifyOTP returns success on exact OTP match", async () => {
      const mockRecord = {
        shop: "test-shop.myshopify.com",
        orderId: "12345",
        otp: "654321",
        otpVerified: false,
      };

      (prisma.cODOrder.findUnique as any).mockResolvedValue(mockRecord);
      (prisma.cODOrder.update as any).mockResolvedValue({ ...mockRecord, otpVerified: true, status: "VERIFIED" });

      const res = await CODManagementService.verifyOTP("test-shop.myshopify.com", "12345", "654321");
      expect(res.success).toBe(true);
      expect(res.message).toContain("successfully");
    });

    it("2) verifyOTP returns failure on mismatched OTP code", async () => {
      const mockRecord = {
        shop: "test-shop.myshopify.com",
        orderId: "12345",
        otp: "654321",
        otpVerified: false,
      };

      (prisma.cODOrder.findUnique as any).mockResolvedValue(mockRecord);

      const res = await CODManagementService.verifyOTP("test-shop.myshopify.com", "12345", "111111");
      expect(res.success).toBe(false);
      expect(res.message).toContain("Invalid OTP");
    });
  });

  describe("AdSpendService Tests", () => {
    it("3) fetchAdSpendFromPlatform calls Google Ads API successfully", async () => {
      const mockConn = {
        shop: "test-shop.myshopify.com",
        platform: "google",
        accessToken: "ya29.googleads_token",
        accountId: "123-456-7890",
        isConnected: true,
      };

      (prisma.adSpend.findUnique as any).mockResolvedValue(mockConn);

      // Mock fetch Google Ads response
      (fetch as any).mockResolvedValue({
        json: vi.fn().mockResolvedValue({
          results: [{
            metrics: {
              costMicros: "1000000", // $1 -> ~₹83
              clicks: "12",
              impressions: "150",
            }
          }]
        })
      });

      const res = await AdSpendService.fetchAdSpendFromPlatform("test-shop.myshopify.com", "google", "2026-07-10");
      expect(res.spend).toBeCloseTo(83, 1);
      expect(res.clicks).toBe(12);
      expect(res.impressions).toBe(150);
    });

    it("4) fetchAdSpendFromPlatform returns fallback on API exception", async () => {
      const mockConn = {
        shop: "test-shop.myshopify.com",
        platform: "meta",
        accessToken: "token_meta_123",
        accountId: "act_12345",
        isConnected: true,
      };

      (prisma.adSpend.findUnique as any).mockResolvedValue(mockConn);
      (fetch as any).mockRejectedValue(new Error("API Timeout"));

      // Fallback seed calculation spend will be deterministic: non-zero
      const res = await AdSpendService.fetchAdSpendFromPlatform("test-shop.myshopify.com", "meta", "2026-07-10");
      expect(res.spend).toBeGreaterThan(0);
    });
  });

  describe("WhatsAppService Tests", () => {
    it("5) sendOTP triggers simulated WhatsApp OTP sending", async () => {
      (fetch as any).mockResolvedValue({
        json: vi.fn().mockResolvedValue({ messages: [{ id: "msg_123" }] })
      });

      // Simulation mode fallback or credentials mock
      process.env.META_WHATSAPP_TOKEN = "test_token";
      process.env.META_WHATSAPP_PHONE_ID = "test_phone";

      const res = await WhatsAppService.sendOTP("+919876543210", "444444");
      expect(res.success).toBe(true);
      expect(res.provider).toBe("meta_whatsapp");
    });
  });
});
