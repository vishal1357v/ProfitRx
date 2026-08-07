import { FeatureDefinition } from "../../types";

export interface FeaturePlugin {
  definition: FeatureDefinition;
  calculate(inputData: any): number;
  serialize(): string;
  validate(value: number): boolean;
}

export class FeatureRegistry {
  private static plugins: Map<string, FeaturePlugin> = new Map();

  static register(plugin: FeaturePlugin) {
    this.plugins.set(plugin.definition.id, plugin);
  }

  static get(id: string): FeaturePlugin {
    const plugin = this.plugins.get(id);
    if (!plugin) throw new Error(`Feature plugin ${id} not found`);
    return plugin;
  }

  static getAll(): FeaturePlugin[] {
    return Array.from(this.plugins.values());
  }
}
