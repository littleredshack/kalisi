import { LayoutOrchestrator } from './core/layout-orchestrator';
import { ContainmentRuntimeLayoutEngine } from './engines/containment-runtime-layout.engine';

export function registerDefaultLayoutEngines(orchestrator: LayoutOrchestrator): LayoutOrchestrator {
  // Only containment-runtime engine - all legacy engines removed
  orchestrator.registerEngine(new ContainmentRuntimeLayoutEngine());
  return orchestrator;
}
