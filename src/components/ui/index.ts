/**
 * Energya Connect shared UI / design-system layer (Phase 2 foundation).
 *
 * Existing primitives (Button, Badge, Form, Table, Modal, MobileBottomNav, …)
 * are already consumed by some V1 screens — do not restyle them in P1.5-02A.
 * P1.5-02A adds unwired Stepper / SnapshotBanner / ValidationSummary /
 * PermissionState / EmptyState / ErrorState only. CostingUiPrimitives stay
 * costing-owned. BrandLogo remains the logo renderer.
 *
 * Usage:
 *   import { Button, Card, StatCard, icons, Stepper } from '../ui';
 */
export { Button } from './Button';
export type { ButtonProps, ButtonVariant, ButtonSize } from './Button';

export { Card } from './Card';
export type { CardProps } from './Card';

export { StatCard } from './StatCard';
export type { StatCardProps, StatCardIcon } from './StatCard';

export { Badge, StatusBadge, statusToTone } from './Badge';
export type { BadgeProps, BadgeTone, StatusBadgeProps } from './Badge';

export { Table, THead, TBody, Tr, Th, Td } from './Table';

export { Field, Input, Select, Textarea } from './Form';
export type { FieldProps } from './Form';

export { Modal, ModalHeader, Drawer } from './Modal';
export type { OverlayProps } from './Modal';

export { PageHeader } from './PageHeader';
export type { PageHeaderProps, Breadcrumb } from './PageHeader';

export { Tabs } from './Tabs';
export type { TabsProps, TabItem } from './Tabs';

export { MobileBottomNav } from './MobileBottomNav';
export type { MobileBottomNavProps, MobileNavItem } from './MobileBottomNav';

export { icons } from './icons';
export type { IconName, DsIcon } from './icons';
export { CableCrossSectionIcon, WoodenDrumIcon } from './icons';

export { responsive, breakpoints, MOBILE_NAV_MAX_BREAKPOINT } from './responsive';
export type { Breakpoint } from './responsive';

export { Stepper, resolveStepperState } from './Stepper';
export type { StepperProps, StepperStep, StepperStageState } from './Stepper';

export { SnapshotBanner, snapshotBannerFreezeCopy } from './SnapshotBanner';
export type { SnapshotBannerProps, SnapshotLifecycle } from './SnapshotBanner';

export { ValidationSummary } from './ValidationSummary';
export type { ValidationSummaryProps, ValidationSummaryTone } from './ValidationSummary';

export { PermissionState } from './PermissionState';
export type { PermissionStateProps } from './PermissionState';

export { EmptyState } from './EmptyState';
export type { EmptyStateProps } from './EmptyState';

export { ErrorState } from './ErrorState';
export type { ErrorStateProps, ErrorStateKind } from './ErrorState';

// Re-export the official brand logo so the design system has one entry point.
export { BrandLogo } from '../BrandLogo';
