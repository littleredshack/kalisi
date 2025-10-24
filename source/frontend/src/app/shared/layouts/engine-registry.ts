import { LayoutOrchestrator } from './core/layout-orchestrator';
import { ContainmentRuntimeLayoutEngine } from './engines/containment-runtime-layout.engine';
import { ForceDirectedLayoutEngine } from './engines/force-directed-layout.engine';

export function registerDefaultLayoutEngines(orchestrator: LayoutOrchestrator): LayoutOrchestrator {
  orchestrator.registerEngine(new ContainmentRuntimeLayoutEngine());
  orchestrator.registerEngine(new ForceDirectedLayoutEngine());
  return orchestrator;
}
