# INDUSTRIAL ICONOGRAPHY — Energya Connect

> A coherent **line-icon** system for the cable-manufacturing domain, mapped to the existing registry at `src/components/ui/icons/index.ts` (lucide-react v0.546 + bespoke SVGs). Goal: **no generic-SaaS icon soup** — every domain concept has one semantic icon, imported as `icons.<name>` so the visual language stays consistent and swappable.
>
> Convention (existing): all icons are `React.ComponentType<SVGProps>`, render 24×24 with `currentColor`, sized via Tailwind (`h-4 w-4 text-brand-600`).

## 1. Existing registry (adopt as-is)

| Domain concept | `icons.` key | Component | Source | Status |
| --- | --- | --- | --- | --- |
| Cable (generic) | `cable` | `Cable` | lucide | ✅ |
| Cable cross-section | `cableCrossSection` | `CableCrossSectionIcon` | **bespoke SVG** | ✅ |
| Conductor | `conductor` | `CircuitBoard` | lucide | ✅ |
| Insulation | `insulation` | `Layers` | lucide | ✅ |
| Screen | `screen` | `ShieldHalf` | lucide | ✅ |
| Armour | `armour` | `Shield` | lucide | ✅ |
| Sheath | `sheath` | `Package` | lucide | ✅ |
| Drum / reel | `drum` | `WoodenDrumIcon` | **bespoke SVG** | ✅ |
| Engineering | `engineering` | `Wrench` | lucide | ✅ |
| Technical Office | `technicalOffice` | `Ruler` | lucide | ✅ |
| Factory | `factory` | `Factory` | lucide | ✅ |
| Testing | `testing` | `FlaskConical` | lucide | ✅ |
| Gauge | `gauge` | `Gauge` | lucide | ✅ |
| Costing | `costing` | `Calculator` | lucide | ✅ |
| Quotation | `quotation` | `FileText` | lucide | ✅ |
| Inquiry | `inquiry` | `MessageSquareText` | lucide | ✅ |
| Order | `order` | `ClipboardList` | lucide | ✅ |
| Warehouse | `warehouse` | `Warehouse` | lucide | ✅ |
| Logistics | `logistics` | `Truck` | lucide | ✅ |
| Inventory | `inventory` | `Boxes` | lucide | ✅ |
| Reports | `reports` | `BarChart3` | lucide | ✅ |
| Administration | `administration` | `Settings` | lucide | ✅ |
| Customers | `customers` | `Building2` | lucide | ✅ |
| Users | `users` | `Users` | lucide | ✅ |

## 2. Proposed additions (➕ presentation-only, all lucide unless marked bespoke)

Requested coverage the current registry lacks. These are **icon registry additions only** — no behavior change.

| Domain concept | Proposed `icons.` key | Component | Rationale |
| --- | --- | --- | --- |
| Copper metal | `copper` | `Gem` (tinted `copper-500`) | Distinguish Cu in metal pricing/BOM. |
| Aluminium metal | `aluminium` | `Gem` (tinted `aluminium-500`) | Distinguish Al. Color carries the meaning. |
| Metal cost component | `metalComponent` | `Component` | Matches costing sub-nav "Metal Cost Components". |
| Quality / QA | `quality` | `BadgeCheck` | Trusted Quality / QA gates. |
| Certification / standards | `certification` | `ScrollText` or `FileCheck` | Standards & Specification, CPR, TDS. |
| Production readiness | `productionReadiness` | `ShieldCheck` | Costing production-readiness gate. |
| Raw material | `rawMaterial` | `Package` (or bespoke spool) | RM master. |
| Bedding / inner sheath | `bedding` | `Layers2` | Distinguish bedding from outer sheath. |
| Outer semi-conductor | `semiconductor` | `Waves` | Semi-con layer. |
| Water blocking | `waterBlocking` | `Droplets` | Water-tight parameters. |
| Termite / rodent | `termiteProtection` | `Bug` | Termite/rodent protection param. |
| CPR / fire class | `fireClass` | `Flame` | CPR Euroclass. |
| Voltage / power | `voltage` | `Zap` | Voltage class/rating (already used on login hero). |
| Cores | `cores` | `CircleDot` / bespoke multi-core | No. of cores + core colors. |
| Cutting length | `cutting` | `Scissors` | Cutting length & schedule. |
| Container / packing | `container` | `Container` | 20ft/40HC optimizer. |
| Exchange / FX | `exchange` | `ArrowLeftRight` | Currency & FX (already used in costing nav). |
| Currency | `currency` | `Coins` | Currency master. |
| Scrap | `scrap` | `Percent` | Scrap rules (already used in costing nav). |
| Audit / history | `audit` | `History` | Audit trail. |
| Validation | `validation` | `ClipboardCheck` | Validation panel. |
| Attachment | `attachment` | `Paperclip` | Technical Offer / documents. |
| BOM | `bom` | `Layers3` | BOM explorer (already used in costing nav). |

> **Bespoke SVG candidates (optional ➕):** a proper **cable reel/spool** glyph distinct from `WoodenDrumIcon`, a **multi-core cross-section** variant, and a **conductor strand** glyph. Only add bespoke SVGs where lucide has no faithful match, following the existing `CableCrossSectionIcon` pattern (24×24, `currentColor`, `SVGProps`). None are required for the redesign.

## 3. Usage rules

1. **Import from the registry, not lucide directly** in business code: `import { icons } from '@/components/ui/icons'` → `<icons.inquiry className="h-4 w-4" />`.
2. **One concept, one icon** — do not use `FileText` for both quotation and generic document; quotation=`quotation`, document/attachment=`attachment`.
3. **Color conveys metal/material**: copper vs aluminium share `Gem` but differ by `copper-500` / `aluminium-500` tint.
4. **Sizing:** nav `h-5 w-5`; inline/table `h-4 w-4`; stat chips `h-5 w-5` on a tinted rounded square; buttons inherit `iconSize` from `ui/Button`.
5. **Sidebar mapping (keep current choices):** the internal/customer nav already uses semantically appropriate lucide icons (LayoutDashboard, Calculator, ShoppingCart, Box, Cpu, Sliders, DollarSign, Factory, Truck, FileUp, PieChart, Users). Keep them; only ensure they route through the registry where practical.
6. **Never** introduce playful/rounded generic-SaaS icon packs; stay within the lucide line style + bespoke industrial SVGs to match the approved image's technical tone.
