import type { BadgeTone } from '../ui';

export function formatSupportDate(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function caseStatusLabel(status: string): string {
  switch (status) {
    case 'OPEN':
      return 'Open';
    case 'IN_PROGRESS':
      return 'In Progress';
    case 'AWAITING_CUSTOMER':
      return 'Awaiting Your Response';
    case 'RESOLVED':
      return 'Resolved';
    case 'CLOSED':
      return 'Closed';
    default:
      return status.replace(/_/g, ' ');
  }
}

export function caseStatusTone(status: string): BadgeTone {
  switch (status) {
    case 'OPEN':
      return 'info';
    case 'IN_PROGRESS':
      return 'warning';
    case 'AWAITING_CUSTOMER':
      return 'copper';
    case 'RESOLVED':
      return 'success';
    case 'CLOSED':
      return 'neutral';
    default:
      return 'neutral';
  }
}

export function casePriorityLabel(priority: string): string {
  switch (priority) {
    case 'LOW':
      return 'Low';
    case 'MEDIUM':
      return 'Medium';
    case 'HIGH':
      return 'High';
    case 'URGENT':
      return 'Urgent';
    default:
      return priority;
  }
}

export function supportPageNumbers(page: number, pageCount: number, max = 9): number[] {
  const total = Math.max(1, pageCount);
  const current = Math.min(Math.max(1, page), total);
  if (total <= max) return Array.from({ length: total }, (_, i) => i + 1);
  const half = Math.floor(max / 2);
  let start = Math.max(1, current - half);
  let end = Math.min(total, start + max - 1);
  start = Math.max(1, end - max + 1);
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}
