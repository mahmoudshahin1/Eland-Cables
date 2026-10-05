export interface WorkflowTaskSummary {
  id: string;
  stepCode: string;
  title: string;
  status: string;
  assignments: Array<{ assignmentType: string; assigneeRef: string }>;
}

export interface WorkflowStageTimingSummary {
  id: string;
  stepCode: string;
  name: string;
  startedAt: string;
  completedAt: string | null;
  durationSeconds: number | null;
  owner: string | null;
  isCurrent: boolean;
}

export interface WorkflowInstanceSummary {
  id: string;
  templateCode: string;
  templateVersion: number;
  currentStepCode: string;
  currentStep: { stepCode: string; name: string } | null;
  status: string;
  startedAt?: string;
  totalDurationSeconds?: number;
  stageTimings?: WorkflowStageTimingSummary[];
  template?: {
    steps: Array<{ stepCode: string; name: string; sortOrder: number; isTerminal: boolean }>;
  };
  openTasks: WorkflowTaskSummary[];
}

export interface MyWorkflowTask {
  id: string;
  stepCode: string;
  title: string;
  status: string;
  instanceId: string;
  entityId: string;
  currentStepCode: string;
}

function authHeaders(token?: string): HeadersInit {
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function fetchWorkflowForInquiry(
  inquiryId: string,
  token?: string
): Promise<WorkflowInstanceSummary | null> {
  const res = await fetch(`/api/v2/workflows/by-entity/CommercialInquiry/${encodeURIComponent(inquiryId)}`, {
    headers: authHeaders(token),
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Failed to load workflow (${res.status})`);
  }
  return res.json();
}

export async function fetchMyWorkflowTasks(token?: string): Promise<MyWorkflowTask[]> {
  const res = await fetch('/api/v2/workflows/my-tasks', { headers: authHeaders(token) });
  if (!res.ok) return [];
  const body = await res.json().catch(() => ({ tasks: [] }));
  return Array.isArray(body.tasks) ? body.tasks : [];
}
