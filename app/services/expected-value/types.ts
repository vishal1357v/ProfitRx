export interface ExpectedValueResult {
  expectedValue: number;       // The ultimate output (Expected Contribution Margin)
  expectedROI: number;         // expectedValue / grossOrderValue
  expectedLoss: number;        // rtoScenario.totalLoss * rtoProbability
  
  deliveryProbability: number;
  rtoProbability: number;
  
  deliveredScenario: DeliveredScenario;
  rtoScenario: RTOScenario;
  
  assumptions: FinancialAssumptions;
  metadata: {
    serviceVersion: string;
    formulaVersion: string;
    assumptionsVersion: string;
    calculationDate: Date;
  };
}

export interface DeliveredScenario {
  revenue: number;             // netOrderValue
  shippingRevenue: number;     // customerPaidShipping
  
  cogs: number;
  forwardShippingCost: number;
  paymentFee: number;
  codFee: number;
  packaging: number;
  adCost: number;              // 0 if un-attributed
  
  contributionProfit: number;  // Net profit if successfully delivered
}

export interface RTOScenario {
  recoveredInventoryValue: number; // cogs * inventoryRecoveryRate
  inventoryDamage: number;         // cogs * (1 - inventoryRecoveryRate)
  
  forwardShipping: number;
  returnShipping: number;
  packaging: number;
  
  customerShippingRefund: number;  // 0 or customerPaidShipping (merchant setting)
  codFee: number;                  // 0 or codFee (merchant setting)
  
  totalLoss: number;               // Sum of all lost capital (Positive number)
}

export interface FinancialAssumptions {
  inventoryRecoveryRate: number;   // e.g., 0.95 (5% shrinkage)
  refundsShippingOnRTO: boolean;
  chargesCodFeeOnRTO: boolean;
  includesAdCost: boolean;
}
