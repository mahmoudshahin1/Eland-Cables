<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();

const sidebarOpen = ref(true);
const mobileMenuOpen = ref(false);

// ── Navigation items based on user role ─────────────────────────────────
interface NavItem {
  label: string;
  icon: string;
  to: string;
  permission?: string;
}

const internalNavItems: NavItem[] = [
  { label: 'Dashboard', icon: '📊', to: '/internal/dashboard' },
  { label: 'Master Data', icon: '🗄️', to: '/internal/master-data', permission: 'masterDataAccess' },
  { label: 'Inquiries', icon: '📋', to: '/internal/inquiries', permission: 'commercialAccess' },
  { label: 'Quotations', icon: '💰', to: '/internal/quotations', permission: 'commercialAccess' },
  { label: 'Technical Office', icon: '🔧', to: '/internal/technical-office', permission: 'technicalOfficeAccess' },
  { label: 'Costing', icon: '🧮', to: '/internal/costing', permission: 'costingAccess' },
  { label: 'Administration', icon: '⚙️', to: '/internal/admin', permission: 'adminAccess' },
];

const customerNavItems: NavItem[] = [
  { label: 'Dashboard', icon: '📊', to: '/customer/dashboard' },
  { label: 'My Inquiries', icon: '📋', to: '/customer/inquiries' },
  { label: 'Support', icon: '🎧', to: '/customer/support' },
];

const isCustomer = computed(() => authStore.currentUser?.userType === 'customer');
const navItems = computed(() => (isCustomer.value ? customerNavItems : internalNavItems));

const userDisplayName = computed(() => {
  const u = authStore.currentUser as any;
  if (!u) return 'User';
  return u.displayName || u.fullName || u.userName || u.username || 'User';
});

const userInitials = computed(() => {
  const name = userDisplayName.value;
  const parts = name.split(' ').filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.substring(0, 2).toUpperCase();
});

const currentRoutePath = computed(() => route.path);

function isActive(to: string) {
  return currentRoutePath.value.startsWith(to);
}

async function handleLogout() {
  await authStore.logout();
  router.push('/login');
}

function toggleSidebar() {
  sidebarOpen.value = !sidebarOpen.value;
}
</script>

<template>
  <div class="flex h-dvh overflow-hidden bg-slate-50">
    <!-- ── Sidebar ──────────────────────────────────────────────────────── -->
    <aside
      :class="[
        'fixed inset-y-0 left-0 z-40 flex flex-col border-r border-slate-200 bg-white transition-all duration-300 lg:relative',
        sidebarOpen ? 'w-64' : 'w-[68px]',
        mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
      ]"
    >
      <!-- Logo -->
      <div class="flex h-16 items-center gap-3 border-b border-slate-200 px-4">
        <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-sm font-bold text-white">
          E
        </div>
        <transition name="fade">
          <span v-if="sidebarOpen" class="text-base font-semibold text-slate-800 truncate">
            Energya Connect
          </span>
        </transition>
      </div>

      <!-- Nav links -->
      <nav class="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        <router-link
          v-for="item in navItems"
          :key="item.to"
          :to="item.to"
          :class="[
            'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
            isActive(item.to)
              ? 'bg-blue-50 text-blue-700'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
          ]"
          @click="mobileMenuOpen = false"
        >
          <span class="text-lg shrink-0">{{ item.icon }}</span>
          <transition name="fade">
            <span v-if="sidebarOpen" class="truncate">{{ item.label }}</span>
          </transition>
        </router-link>
      </nav>

      <!-- Collapse button (desktop only) -->
      <button
        class="hidden lg:flex h-12 items-center justify-center border-t border-slate-200 text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors"
        @click="toggleSidebar"
      >
        <span class="text-sm">{{ sidebarOpen ? '◀' : '▶' }}</span>
      </button>
    </aside>

    <!-- Mobile overlay -->
    <transition name="fade">
      <div
        v-if="mobileMenuOpen"
        class="fixed inset-0 z-30 bg-black/30 lg:hidden"
        @click="mobileMenuOpen = false"
      />
    </transition>

    <!-- ── Main content area ──────────────────────────────────────────── -->
    <div class="flex flex-1 flex-col overflow-hidden">
      <!-- Top navbar -->
      <header class="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 lg:px-6">
        <div class="flex items-center gap-3">
          <!-- Mobile hamburger -->
          <button
            class="lg:hidden flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
            @click="mobileMenuOpen = !mobileMenuOpen"
          >
            <span class="text-xl">☰</span>
          </button>
          <h1 class="text-lg font-semibold text-slate-800 truncate">
            {{ route.meta.title || 'Dashboard' }}
          </h1>
        </div>

        <div class="flex items-center gap-3">
          <!-- Notification bell placeholder -->
          <button class="relative flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 transition-colors">
            <span class="text-lg">🔔</span>
            <span class="absolute top-1 right-1 h-2 w-2 rounded-full bg-red-500"></span>
          </button>

          <!-- User menu -->
          <div class="relative group">
            <button class="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-100 transition-colors">
              <div class="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
                {{ userInitials }}
              </div>
              <span class="hidden sm:block text-sm font-medium text-slate-700 max-w-[120px] truncate">
                {{ userDisplayName }}
              </span>
              <span class="hidden sm:block text-xs text-slate-400">▼</span>
            </button>

            <!-- Dropdown -->
            <div class="invisible opacity-0 group-hover:visible group-hover:opacity-100 absolute right-0 top-full mt-1 w-48 rounded-lg border border-slate-200 bg-white py-1 shadow-lg transition-all z-50">
              <div class="px-3 py-2 border-b border-slate-100">
                <p class="text-sm font-medium text-slate-800 truncate">{{ userDisplayName }}</p>
                <p class="text-xs text-slate-500 truncate">{{ authStore.currentUser?.email }}</p>
              </div>
              <button
                class="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
                @click="router.push('/profile')"
              >
                👤 Profile
              </button>
              <button
                class="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                @click="handleLogout"
              >
                🚪 Sign out
              </button>
            </div>
          </div>
        </div>
      </header>

      <!-- Page content -->
      <main class="flex-1 overflow-y-auto p-4 lg:p-6">
        <router-view />
      </main>
    </div>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
