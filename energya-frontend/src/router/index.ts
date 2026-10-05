import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '../stores/auth';

// ── Lazy-loaded views ───────────────────────────────────────────────────────
const Login = () => import('../views/Login.vue');
const MainLayout = () => import('../layouts/MainLayout.vue');
const InternalDashboard = () => import('../views/internal/DashboardView.vue');
const CustomerDashboard = () => import('../views/customer/CustomerDashboardView.vue');
const MasterDataView = () => import('../views/internal/MasterDataView.vue');
const InquiriesView = () => import('../views/internal/InquiriesView.vue');
const AdminView = () => import('../views/internal/AdminView.vue');
const CustomerInquiriesView = () => import('../views/customer/CustomerInquiriesView.vue');

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    // ── Public routes ─────────────────────────────────────────────────
    {
      path: '/login',
      name: 'login',
      component: Login,
      meta: { guest: true },
    },

    // ── Internal (staff) routes ───────────────────────────────────────
    {
      path: '/internal',
      component: MainLayout,
      meta: { requiresAuth: true },
      children: [
        {
          path: '',
          redirect: '/internal/dashboard',
        },
        {
          path: 'dashboard',
          name: 'internal-dashboard',
          component: InternalDashboard,
          meta: { title: 'Dashboard' },
        },
        {
          path: 'master-data',
          name: 'internal-master-data',
          component: MasterDataView,
          meta: { title: 'Master Data Hub' },
        },
        {
          path: 'inquiries',
          name: 'internal-inquiries',
          component: InquiriesView,
          meta: { title: 'Commercial Inquiries' },
        },
        {
          path: 'admin',
          name: 'internal-admin',
          component: AdminView,
          meta: { title: 'Administration' },
        },
      ],
    },

    // ── Customer portal routes ────────────────────────────────────────
    {
      path: '/customer',
      component: MainLayout,
      meta: { requiresAuth: true },
      children: [
        {
          path: '',
          redirect: '/customer/dashboard',
        },
        {
          path: 'dashboard',
          name: 'customer-dashboard',
          component: CustomerDashboard,
          meta: { title: 'My Dashboard' },
        },
        {
          path: 'inquiries',
          name: 'customer-inquiries',
          component: CustomerInquiriesView,
          meta: { title: 'My Inquiries' },
        },
      ],
    },

    // ── Root redirect ─────────────────────────────────────────────────
    {
      path: '/',
      redirect: '/login',
    },

    // ── Catch-all → login ─────────────────────────────────────────────
    {
      path: '/:pathMatch(.*)*',
      redirect: '/login',
    },
  ],
});

// ── Navigation Guard ──────────────────────────────────────────────────────
router.beforeEach(async (to, _from, next) => {
  const authStore = useAuthStore();

  // Wait for session restore on first load
  if (!authStore.hasCheckedSession) {
    await authStore.restoreSession();
  }

  const requiresAuth = to.matched.some((r) => r.meta.requiresAuth);
  const isGuestOnly = to.meta.guest;

  if (requiresAuth && !authStore.isAuthenticated) {
    // Not logged in → send to login
    return next({ name: 'login', query: { redirect: to.fullPath } });
  }

  if (isGuestOnly && authStore.isAuthenticated) {
    // Already logged in → send to appropriate dashboard
    const target =
      authStore.currentUser?.userType === 'customer'
        ? '/customer/dashboard'
        : '/internal/dashboard';
    return next(target);
  }

  next();
});

export default router;
