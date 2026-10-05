<script setup lang="ts">
import { computed } from 'vue';
import { useAuthStore } from '../../stores/auth';

const authStore = useAuthStore();

const greeting = computed(() => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
});

const userDisplayName = computed(() => {
  const u = authStore.currentUser as any;
  if (!u) return '';
  return u.displayName || u.fullName || u.userName || u.username || '';
});

// Placeholder KPI data — will be replaced with real API calls
const kpis = [
  { label: 'Open Inquiries', value: '—', icon: '📋', color: 'bg-blue-50 text-blue-700', border: 'border-blue-200' },
  { label: 'Pending Quotations', value: '—', icon: '💰', color: 'bg-amber-50 text-amber-700', border: 'border-amber-200' },
  { label: 'Active Cables', value: '—', icon: '🔌', color: 'bg-emerald-50 text-emerald-700', border: 'border-emerald-200' },
  { label: 'Technical Requests', value: '—', icon: '🔧', color: 'bg-purple-50 text-purple-700', border: 'border-purple-200' },
];
</script>

<template>
  <div class="space-y-6">
    <!-- Welcome banner -->
    <div class="rounded-xl bg-gradient-to-r from-blue-600 to-blue-800 p-6 text-white shadow-lg">
      <h2 class="text-2xl font-bold">
        {{ greeting }}, {{ userDisplayName }} 👋
      </h2>
      <p class="mt-1 text-blue-100 text-sm">
        Welcome to the Energya Connect Platform. Here's your overview.
      </p>
    </div>

    <!-- KPI Cards -->
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <div
        v-for="kpi in kpis"
        :key="kpi.label"
        :class="[
          'rounded-xl border bg-white p-5 transition-shadow hover:shadow-md',
          kpi.border,
        ]"
      >
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm font-medium text-slate-500">{{ kpi.label }}</p>
            <p class="mt-1 text-2xl font-bold text-slate-900">{{ kpi.value }}</p>
          </div>
          <div :class="['flex h-11 w-11 items-center justify-center rounded-lg text-xl', kpi.color]">
            {{ kpi.icon }}
          </div>
        </div>
      </div>
    </div>

    <!-- Placeholder sections -->
    <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <!-- Recent Activity -->
      <div class="rounded-xl border border-slate-200 bg-white p-5">
        <h3 class="text-base font-semibold text-slate-800 mb-4">Recent Activity</h3>
        <div class="flex flex-col items-center justify-center py-8 text-slate-400">
          <span class="text-3xl mb-2">📭</span>
          <p class="text-sm">No recent activity to show</p>
          <p class="text-xs mt-1">Activity will appear here as you use the platform</p>
        </div>
      </div>

      <!-- Quick Actions -->
      <div class="rounded-xl border border-slate-200 bg-white p-5">
        <h3 class="text-base font-semibold text-slate-800 mb-4">Quick Actions</h3>
        <div class="grid grid-cols-2 gap-3">
          <button class="flex flex-col items-center gap-2 rounded-lg border border-slate-200 p-4 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:border-blue-300 hover:text-blue-700 transition-all">
            <span class="text-2xl">➕</span>
            New Inquiry
          </button>
          <button class="flex flex-col items-center gap-2 rounded-lg border border-slate-200 p-4 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:border-blue-300 hover:text-blue-700 transition-all">
            <span class="text-2xl">🔍</span>
            Search Cables
          </button>
          <button class="flex flex-col items-center gap-2 rounded-lg border border-slate-200 p-4 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:border-blue-300 hover:text-blue-700 transition-all">
            <span class="text-2xl">📊</span>
            View Reports
          </button>
          <button class="flex flex-col items-center gap-2 rounded-lg border border-slate-200 p-4 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:border-blue-300 hover:text-blue-700 transition-all">
            <span class="text-2xl">⚙️</span>
            Settings
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
