import { MetricDefinition } from "../types";

export interface BenchmarkProvider {
  getBenchmark(metricId: string, shopCategory: string): number | null;
}
