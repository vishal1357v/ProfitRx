import { LabelDefinition } from "../types";

export interface LabelCalculator {
  definition: LabelDefinition;
  extract(record: any): number | boolean | string | null;
}

export class LabelRegistry {
  private static calculators: Map<string, LabelCalculator> = new Map();

  static register(calculator: LabelCalculator) {
    this.calculators.set(calculator.definition.id, calculator);
  }

  static get(id: string): LabelCalculator {
    const calc = this.calculators.get(id);
    if (!calc) throw new Error(`Label calculator ${id} not found`);
    return calc;
  }
}
