import { LayoutOrchestrator } from './core/layout-orchestrator';
import { TreeLayoutEngine } from './engines/tree-layout.engine';
import { ContainmentGridLayoutEngine } from './engines/containment-grid-layout.engine';
import { OrthogonalLayoutEngine } from './engines/orthogonal-layout.engine';
import { ForceLayoutEngine } from './engines/force-layout.engine';

export function registerDefaultLayoutEngines(orchestrator: LayoutOrchestrator): LayoutOrchestrator {
  orchestrator.registerEngine(new TreeLayoutEngine());
  orchestrator.registerEngine(new ContainmentGridLayoutEngine());
  orchestrator.registerEngine(new OrthogonalLayoutEngine());
  orchestrator.registerEngine(new ForceLayoutEngine());
  return orchestrator;
}
