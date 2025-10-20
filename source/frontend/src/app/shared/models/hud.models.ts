export interface PanelState {
  id: string;
  visible: boolean;
  position: { x: number; y: number };
  opacity: number;
  zIndex: number;
}

export interface PanelMetadata {
  id: string;
  title: string;
  icon: string;
  defaultPosition: { x: number; y: number };
  defaultVisible: boolean;
}

export interface HudSettings {
  version: number;
  panels: {
    [panelId: string]: {
      position: { x: number; y: number };
      opacity: number;
      visible: boolean;
      zIndex: number;
    }
  };
  theme: {
    glowColor: 'cyan' | 'green' | 'amber';
    glowIntensity: number;
  };
}
