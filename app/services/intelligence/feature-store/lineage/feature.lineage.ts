import { FeatureRegistry } from "../registry/feature.registry";

export class FeatureLineage {
  /**
   * Generates a topological sort of all registered features to ensure
   * dependencies are calculated before the features that depend on them.
   */
  static getExecutionOrder(): string[] {
    const plugins = FeatureRegistry.getAll();
    const order: string[] = [];
    const visited = new Set<string>();
    const temp = new Set<string>();

    const visit = (featureId: string) => {
      if (temp.has(featureId)) throw new Error(`Circular dependency detected involving ${featureId}`);
      if (!visited.has(featureId)) {
        temp.add(featureId);
        const plugin = FeatureRegistry.get(featureId);
        for (const dep of plugin.definition.dependencies) {
          visit(dep);
        }
        temp.delete(featureId);
        visited.add(featureId);
        order.push(featureId);
      }
    };

    for (const plugin of plugins) {
      if (!visited.has(plugin.definition.id)) {
        visit(plugin.definition.id);
      }
    }

    return order;
  }
}
