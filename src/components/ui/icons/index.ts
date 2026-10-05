/**
 * Centralized icon registry for the Energya Connect design system.
 *
 * ONE source of truth mapping domain concepts → concrete icon components.
 * Business/domain code should import named icons from here rather than
 * reaching into `lucide-react` directly, so the visual language stays
 * consistent and swappable.
 *
 * Strategy:
 *  - Prefer the already-installed `lucide-react` (v0.546) for generic glyphs.
 *  - Reuse the existing bespoke `WoodenDrumIcon` (cable reel / drum).
 *  - Add bespoke SVGs only for cable-manufacturing glyphs lucide lacks
 *    (e.g. `CableCrossSectionIcon`).
 *
 * All icons share the same signature: `React.ComponentType<{ className?: string }>`
 * (SVG props), render at 24×24 with `currentColor`, so they inherit text color
 * and size via Tailwind classes (e.g. `className="h-4 w-4 text-brand-600"`).
 */
import type React from 'react';
import {
  Cable,
  CircuitBoard,
  ShieldHalf,
  Shield,
  Layers,
  Wrench,
  Calculator,
  FileText,
  MessageSquareText,
  ClipboardList,
  Building2,
  Warehouse,
  Truck,
  BarChart3,
  Settings,
  Users,
  Package,
  Boxes,
  Factory,
  Gauge,
  FlaskConical,
  Ruler,
} from 'lucide-react';
import { WoodenDrumIcon } from '../../common/WoodenDrumIcon';
import { CableCrossSectionIcon } from './CableCrossSectionIcon';

export type DsIcon = React.ComponentType<React.SVGProps<SVGSVGElement>>;

/**
 * Domain concept → icon. Keys are the vocabulary of the cable business
 * so call sites read semantically (e.g. `icons.quotation`).
 */
export const icons = {
  // Cable construction layers
  cable: Cable,
  cableCrossSection: CableCrossSectionIcon,
  conductor: CircuitBoard,
  insulation: Layers,
  screen: ShieldHalf,
  armour: Shield,
  sheath: Package,
  drum: WoodenDrumIcon,

  // Engineering & manufacturing
  engineering: Wrench,
  technicalOffice: Ruler,
  factory: Factory,
  testing: FlaskConical,
  gauge: Gauge,

  // Commercial workflow
  costing: Calculator,
  quotation: FileText,
  inquiry: MessageSquareText,
  order: ClipboardList,

  // Operations
  warehouse: Warehouse,
  logistics: Truck,
  inventory: Boxes,
  reports: BarChart3,

  // Administration
  administration: Settings,
  customers: Building2,
  users: Users,
} as const;

export type IconName = keyof typeof icons;

export { CableCrossSectionIcon, WoodenDrumIcon };
