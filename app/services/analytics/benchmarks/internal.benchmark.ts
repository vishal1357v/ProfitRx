import { BenchmarkProvider } from "./benchmark.provider";

export class InternalBenchmark implements BenchmarkProvider {
  getBenchmark(metricId: string, shopCategory: string): number | null {
    // In Phase 7, we stub this out. 
    // Later, this queries a materialized view of all cross-merchant data.
    
    if (metricId === "financial.rto_rate" && shopCategory === "FASHION") {
      return 23; // e.g. 23% industry average
    }
    
    return null;
  }
}
