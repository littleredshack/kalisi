import {
  PresetBadgeStyle,
  PresetColorStyle,
  PresetDashStyle,
  PresetEdgeStyle,
  PresetIconStyle,
  PresetLabelStyle,
  PresetNodeStyle,
  PresetPalette,
  PresetSizeStyle
} from './view-presets';

export interface BadgePresentation {
  readonly text: string;
  readonly color?: string;
}

export interface NodePresentation {
  readonly fill?: string;
  readonly stroke?: string;
  readonly icon?: string;
  readonly label?: string;
  readonly labelVisible?: boolean;
  readonly badges?: ReadonlyArray<BadgePresentation>;
  readonly width?: number;
  readonly height?: number;
}

export interface EdgePresentation {
  readonly stroke?: string;
  readonly strokeWidth?: number;
  readonly strokeDashArray?: ReadonlyArray<number> | null;
  readonly label?: string;
  readonly labelVisible?: boolean;
}

const DEFAULT_NODE_COLOR = '#1f2937';

export function resolveNodePresentation(
  metadata: Record<string, unknown>,
  style: PresetNodeStyle | undefined,
  palette: PresetPalette
): NodePresentation {
  const fill = resolveColor(metadata, style?.color, palette) ?? DEFAULT_NODE_COLOR;
  const stroke = resolveBorderColor(metadata, style, palette, fill);
  const icon = resolveIcon(metadata, style?.icon);
  const labelVisibility = deriveLabelVisibility(style?.label);
  const label = resolveLabel(metadata, style?.label);
  const badge = resolveBadge(metadata, style?.badge, palette);
  const size = resolveSize(metadata, style?.size);

  return {
    fill,
    stroke,
    icon,
    label,
    labelVisible: labelVisibility,
    badges: badge ? [badge] : undefined,
    width: size?.width,
    height: size?.height
  };
}

export function resolveEdgePresentation(
  metadata: Record<string, unknown>,
  style: PresetEdgeStyle | undefined,
  palette: PresetPalette
): EdgePresentation {
  const stroke = resolveColor(metadata, style?.color, palette);
  const strokeWidth = resolveLineWidth(metadata, style?.width);
  const labelVisibility = deriveLabelVisibility(style?.label);
  const label = resolveLabel(metadata, style?.label);
  const dashArray = resolveDash(metadata, style?.dash);

  return {
    stroke,
    strokeWidth,
    strokeDashArray: dashArray,
    label,
    labelVisible: labelVisibility
  };
}

function resolveColor(
  metadata: Record<string, unknown>,
  style: PresetColorStyle | undefined,
  palette: PresetPalette
): string | undefined {
  if (!style) {
    return undefined;
  }
  return resolveColorStyle(metadata, style, palette);
}

function resolveBorderColor(
  metadata: Record<string, unknown>,
  style: PresetNodeStyle | undefined,
  palette: PresetPalette,
  fillColor: string
): string {
  if (style?.borderColor) {
    const resolved = resolveColorStyle(metadata, style.borderColor, palette);
    if (resolved) {
      return resolved;
    }
  }
  return adjustColor(fillColor, -12);
}

function resolveIcon(metadata: Record<string, unknown>, style: PresetIconStyle | undefined): string | undefined {
  if (!style) {
    return undefined;
  }
  const value = getFieldValue(metadata, style.field);
  if (value !== undefined && value !== null && style.map) {
    const mapped = style.map[String(value)];
    if (mapped) {
      return mapped;
    }
  }
  return style.default;
}

function resolveBadge(
  metadata: Record<string, unknown>,
  style: PresetBadgeStyle | undefined,
  palette: PresetPalette
): BadgePresentation | undefined {
  if (!style) {
    return undefined;
  }
  const value = getFieldValue(metadata, style.field);
  if (value === undefined || value === null) {
    return undefined;
  }
  const key = String(value);
  const text = style.map?.[key] ?? key;
  const color = style.palette?.[key] ?? palette.accent ?? '#64748b';
  return {
    text: [style.prefix, text, style.suffix].filter(Boolean).join(' ').trim(),
    color
  };
}

function resolveSize(
  metadata: Record<string, unknown>,
  style: PresetSizeStyle | undefined
): { width: number; height: number } | undefined {
  if (!style) {
    return undefined;
  }
  const defaultSize = style.default ?? 200;
  const valueRaw = getFieldValue(metadata, style.field);
  const numeric = typeof valueRaw === 'number' ? valueRaw : valueRaw !== undefined ? Number(valueRaw) : undefined;
  if (numeric === undefined || Number.isNaN(numeric)) {
    return {
      width: defaultSize,
      height: defaultSize * 0.6
    };
  }
  const min = style.min ?? 140;
  const max = style.max ?? 260;
  const clamped = clamp(mapRange(numeric, min, max), min, max);
  return {
    width: clamped,
    height: clamped * 0.6
  };
}

function resolveLineWidth(metadata: Record<string, unknown>, style: PresetSizeStyle | undefined): number | undefined {
  if (!style) {
    return undefined;
  }
  const defaultWidth = style.default ?? 2;
  const valueRaw = getFieldValue(metadata, style.field);
  const numeric = typeof valueRaw === 'number' ? valueRaw : valueRaw !== undefined ? Number(valueRaw) : undefined;
  if (numeric === undefined || Number.isNaN(numeric)) {
    return defaultWidth;
  }
  const min = style.min ?? 1;
  const max = style.max ?? 6;
  const mapped = mapRange(numeric, min, max);
  return clamp(mapped, min, max);
}

function resolveDash(metadata: Record<string, unknown>, dash: PresetDashStyle | undefined): ReadonlyArray<number> | null {
  if (!dash?.field) {
    return null;
  }
  const value = getFieldValue(metadata, dash.field);
  if (value === undefined || value === null) {
    return null;
  }
  if (!dash.values || dash.values.length === 0) {
    return dash.pattern ?? [6, 4];
  }
  return dash.values.includes(String(value)) ? dash.pattern ?? [6, 4] : null;
}

function resolveLabel(
  metadata: Record<string, unknown>,
  style: PresetLabelStyle | undefined
): string | undefined {
  if (!style) {
    return undefined;
  }

  if (style.visible === false) {
    return '';
  }

  const value = style.field ? getFieldValue(metadata, style.field) : undefined;
  let label = style.template && typeof value === 'object'
    ? applyTemplate(style.template, metadata)
    : value;

  if (label === undefined || label === null) {
    label = style.fallback;
  }

  if (label === undefined || label === null) {
    return undefined;
  }

  const stringLabel = String(label);

  if (style.maxLength && stringLabel.length > style.maxLength) {
    return `${stringLabel.slice(0, style.maxLength - 1)}…`;
  }

  return stringLabel;
}

function deriveLabelVisibility(style: PresetLabelStyle | undefined): boolean | undefined {
  if (!style || style.visible === undefined) {
    return undefined;
  }
  return style.visible;
}

function resolveColorStyle(
  metadata: Record<string, unknown>,
  style: PresetColorStyle,
  palette: PresetPalette
): string | undefined {
  const value = getFieldValue(metadata, style.field);

  if (style.map && value !== undefined && value !== null) {
    const key = String(value);
    if (style.map[key]) {
      return style.map[key];
    }
  }

  if (typeof value === 'number' && style.gradient) {
    return resolveGradientColor(value, style.gradient.stops, style.gradient.min, style.gradient.max);
  }

  return style.default ?? palette.primary ?? DEFAULT_NODE_COLOR;
}

function resolveGradientColor(
  value: number,
  stops: ReadonlyArray<{ value: number; color: string }>,
  min?: number,
  max?: number
): string {
  if (!stops || stops.length === 0) {
    return DEFAULT_NODE_COLOR;
  }

  const sorted = [...stops].sort((a, b) => a.value - b.value);
  const lowerBound = min ?? sorted[0].value;
  const upperBound = max ?? sorted[sorted.length - 1].value;
  const clamped = clamp(value, lowerBound, upperBound);

  for (let i = 0; i < sorted.length; i++) {
    if (clamped <= sorted[i].value) {
      if (i === 0) {
        return sorted[i].color;
      }
      const prev = sorted[i - 1];
      const curr = sorted[i];
      const ratio = (clamped - prev.value) / Math.max(1, curr.value - prev.value);
      return interpolateColor(prev.color, curr.color, ratio);
    }
  }

  return sorted[sorted.length - 1].color;
}

function applyTemplate(template: string, metadata: Record<string, unknown>): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_, field) => {
    const value = getFieldValue(metadata, field.trim());
    return value === undefined || value === null ? '' : String(value);
  });
}

function interpolateColor(from: string, to: string, ratio: number): string {
  const [fr, fg, fb] = hexToRgb(from);
  const [tr, tg, tb] = hexToRgb(to);
  const r = Math.round(fr + (tr - fr) * ratio);
  const g = Math.round(fg + (tg - fg) * ratio);
  const b = Math.round(fb + (tb - fb) * ratio);
  return rgbToHex(r, g, b);
}

function adjustColor(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  const adjust = (channel: number) => clamp(channel + amount, 0, 255);
  return rgbToHex(adjust(r), adjust(g), adjust(b));
}

function hexToRgb(color: string): [number, number, number] {
  const normalized = color.replace('#', '');
  const bigint = parseInt(normalized.length === 3 ? normalized.repeat(2) : normalized, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return [r, g, b];
}

function rgbToHex(r: number, g: number, b: number): string {
  const value =
    (1 << 24) +
    (clamp(r, 0, 255) << 16) +
    (clamp(g, 0, 255) << 8) +
    clamp(b, 0, 255);
  return `#${value.toString(16).slice(1)}`;
}

function clamp<T extends number>(value: T, min: number, max: number): T {
  return Math.min(Math.max(value, min), max) as T;
}

function mapRange(value: number, min: number, max: number): number {
  const range = max - min;
  if (range === 0) {
    return min;
  }
  return min + ((value - min) / range) * range;
}

function getFieldValue(metadata: Record<string, unknown>, field?: string): unknown {
  if (!field) {
    return undefined;
  }

  const path = field.split('.');
  let cursor: unknown = metadata;

  for (const key of path) {
    if (cursor && typeof cursor === 'object' && key in (cursor as Record<string, unknown>)) {
      cursor = (cursor as Record<string, unknown>)[key];
      continue;
    }

    if (
      cursor &&
      typeof cursor === 'object' &&
      'rawEntity' in (cursor as Record<string, unknown>) &&
      (cursor as { rawEntity?: { properties?: Record<string, unknown> } }).rawEntity?.properties &&
      key in ((cursor as { rawEntity?: { properties?: Record<string, unknown> } }).rawEntity!.properties!)
    ) {
      cursor = (cursor as { rawEntity?: { properties?: Record<string, unknown> } }).rawEntity!.properties![key];
      continue;
    }

    return undefined;
  }

  return cursor;
}
