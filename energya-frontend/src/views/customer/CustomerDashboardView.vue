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

const customerKpis = [
  { label: 'My Inquiries', value: '—', icon: '📋', color: 'bg-blue-50 text-blue-700', border: 'border-blue-200' },
  { label: 'Active Quotations', value: '—', icon: '💰', color: 'bg-amber-50 text-amber-700', border: 'border-amber-200' },
  { label: 'Open Tickets', value: '—', icon: '🎧', color: 'bg-emerald-50 text-emerald-700', border: 'border-emerald-200' },
];
</script>

<template>
  <div class="space-y-6">
    <!-- Welcome banner -->
    <div class="rounded-xl bg-gradient-to-r from-slate-700 to-slate-900 p-6 text-white shadow-lg">
      <h2 class="text-2xl font-bold">
        {{ greeting }}, {{ userDisplayName }} 👋
      </h2>
      <p class="mt-1 text-slate-300 text-sm">
        Welcome to your customer portal. Manage your inquiries and track your orders.
      </p>
    </div>

    <!-- KPI Cards -->
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <div
        v-for="kpi in customerKpis"
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

    <!-- Quick Actions -->
    <div class="rounded-xl border border-slate-200 bg-white p-5">
      <h3 class="text-base font-semibold text-slate-800 mb-4">Quick Actions</h3>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button class="flex items-center gap-3 rounded-lg border border-slate-200 p-4 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:border-blue-300 hover:text-blue-700 transition-all text-left">
          <span class="text-2xl">➕</span>
          <div>
            <p class="font-semibold">New Inquiry</p>
            <p class="text-xs text-slate-400 font-normal">Submit a new cable inquiry</p>
          </div>
        </button>
        <button class="flex items-center gap-3 rounded-lg border border-slate-200 p-4 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:border-blue-300 hover:text-blue-700 transition-all text-left">
          <span class="text-2xl">🎧</span>
          <div>
            <p class="font-semibold">Contact Support</p>
            <p class="text-xs text-slate-400 font-normal">Get help from our team</p>
          </div>
        </button>
      </div>
    </div>
  </div>
</template>
