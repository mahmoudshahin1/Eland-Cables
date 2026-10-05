<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import { adminApi } from '../../services/adminApi';

const activeTab = ref<'users' | 'roles' | 'customers'>('users');
const loading = ref(false);
const errorMsg = ref('');
const successMsg = ref('');

// ── Users State ──────────────────────────────────────────────────────────────
const users = ref<any[]>([]);
const userTotal = ref(0);
const userPage = ref(1);
const userSearch = ref('');
const showAddUserModal = ref(false);

const newUser = ref({
  username: '',
  email: '',
  fullName: '',
  jobTitle: '',
  department: '',
  userType: 'internal',
  password: '',
});

// ── Roles State ──────────────────────────────────────────────────────────────
const roles = ref<any[]>([]);

// ── Customers State ──────────────────────────────────────────────────────────
const customers = ref<any[]>([]);
const customerTotal = ref(0);
const customerPage = ref(1);
const customerSearch = ref('');
const showAddCustomerModal = ref(false);

const newCustomer = ref({
  code: '',
  name: '',
  legalName: '',
  countryCode: 'EG',
  defaultCurrency: 'USD',
  paymentTerms: 'LC at sight',
  deliveryTerms: 'CIF',
});

// ── Fetchers ─────────────────────────────────────────────────────────────────
async function fetchUsers() {
  loading.value = true;
  errorMsg.value = '';
  try {
    const res = await adminApi.listUsers({
      page: userPage.value,
      limit: 15,
      search: userSearch.value || undefined,
    });
    users.value = res.items || [];
    userTotal.value = res.total || 0;
  } catch (err: any) {
    errorMsg.value = err.response?.data?.message || 'Failed to load users.';
  } finally {
    loading.value = false;
  }
}

async function fetchRoles() {
  loading.value = true;
  errorMsg.value = '';
  try {
    roles.value = await adminApi.listRoles();
  } catch (err: any) {
    errorMsg.value = err.response?.data?.message || 'Failed to load roles.';
  } finally {
    loading.value = false;
  }
}

async function fetchCustomers() {
  loading.value = true;
  errorMsg.value = '';
  try {
    const res = await adminApi.listCustomers({
      page: customerPage.value,
      limit: 15,
      search: customerSearch.value || undefined,
    });
    customers.value = res.items || [];
    customerTotal.value = res.total || 0;
  } catch (err: any) {
    errorMsg.value = err.response?.data?.message || 'Failed to load customers.';
  } finally {
    loading.value = false;
  }
}

// ── User Actions ─────────────────────────────────────────────────────────────
async function handleCreateUser() {
  if (!newUser.value.username || !newUser.value.email || !newUser.value.fullName) {
    alert('Please fill all required fields.');
    return;
  }

  loading.value = true;
  try {
    await adminApi.createUser(newUser.value);
    showAddUserModal.value = false;
    successMsg.value = `User '${newUser.value.username}' created successfully!`;
    newUser.value = {
      username: '',
      email: '',
      fullName: '',
      jobTitle: '',
      department: '',
      userType: 'internal',
      password: '',
    };
    await fetchUsers();
  } catch (err: any) {
    alert(err.response?.data?.message || 'Failed to create user.');
  } finally {
    loading.value = false;
  }
}

async function toggleLock(user: any) {
  loading.value = true;
  try {
    if (user.isLocked) {
      await adminApi.unlockUser(user.id);
      user.isLocked = false;
    } else {
      await adminApi.lockUser(user.id);
      user.isLocked = true;
    }
  } catch (err: any) {
    alert(err.response?.data?.message || 'Failed to toggle user lock status.');
  } finally {
    loading.value = false;
  }
}

async function resetPassword(user: any) {
  if (!confirm(`Are you sure you want to reset password for user '${user.username}'?`)) return;
  loading.value = true;
  try {
    const res = await adminApi.resetPassword(user.id);
    alert(res.message + (res.temporaryPassword ? `\nTemporary password: ${res.temporaryPassword}` : ''));
  } catch (err: any) {
    alert(err.response?.data?.message || 'Failed to reset password.');
  } finally {
    loading.value = false;
  }
}

// ── Customer Actions ─────────────────────────────────────────────────────────
async function handleCreateCustomer() {
  if (!newCustomer.value.code || !newCustomer.value.name) {
    alert('Please fill customer code and name.');
    return;
  }

  loading.value = true;
  try {
    await adminApi.createCustomer(newCustomer.value);
    showAddCustomerModal.value = false;
    successMsg.value = `Customer '${newCustomer.value.name}' added successfully!`;
    newCustomer.value = {
      code: '',
      name: '',
      legalName: '',
      countryCode: 'EG',
      defaultCurrency: 'USD',
      paymentTerms: 'LC at sight',
      deliveryTerms: 'CIF',
    };
    await fetchCustomers();
  } catch (err: any) {
    alert(err.response?.data?.message || 'Failed to create customer.');
  } finally {
    loading.value = false;
  }
}

watch(activeTab, (tab) => {
  if (tab === 'users') fetchUsers();
  if (tab === 'roles') fetchRoles();
  if (tab === 'customers') fetchCustomers();
});

onMounted(() => {
  fetchUsers();
});
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 class="text-2xl font-bold tracking-tight text-slate-900">Administration & Identity Hub</h1>
        <p class="text-sm text-slate-500">
          Manage user accounts, RBAC role definitions, security policies, and customer masters.
        </p>
      </div>
      <div class="flex items-center gap-2">
        <button
          v-if="activeTab === 'users'"
          @click="showAddUserModal = true"
          class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-xs hover:bg-blue-700 transition-colors"
        >
          ＋ Add User
        </button>
        <button
          v-if="activeTab === 'customers'"
          @click="showAddCustomerModal = true"
          class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-xs hover:bg-blue-700 transition-colors"
        >
          ＋ Add Customer
        </button>
      </div>
    </div>

    <!-- Alert Messages -->
    <div v-if="successMsg" class="rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800 border border-emerald-200">
      {{ successMsg }}
    </div>
    <div v-if="errorMsg" class="rounded-lg bg-red-50 p-4 text-sm text-red-700 border border-red-200">
      {{ errorMsg }}
    </div>

    <!-- Tabs -->
    <div class="border-b border-slate-200 bg-white rounded-t-xl px-4 pt-3 shadow-xs">
      <nav class="-mb-px flex space-x-6">
        <button
          @click="activeTab = 'users'"
          :class="[
            'pb-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2',
            activeTab === 'users'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300',
          ]"
        >
          <span>👤 User Accounts</span>
          <span class="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{{ userTotal }}</span>
        </button>

        <button
          @click="activeTab = 'roles'"
          :class="[
            'pb-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2',
            activeTab === 'roles'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300',
          ]"
        >
          <span>🛡️ Roles & Permissions</span>
          <span class="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{{ roles.length }}</span>
        </button>

        <button
          @click="activeTab = 'customers'"
          :class="[
            'pb-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2',
            activeTab === 'customers'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300',
          ]"
        >
          <span>🏢 Customer Masters</span>
          <span class="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{{ customerTotal }}</span>
        </button>
      </nav>
    </div>

    <!-- ── TAB 1: USER ACCOUNTS ────────────────────────────────────────────── -->
    <div v-if="activeTab === 'users'" class="space-y-4">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
        <div class="relative flex-1">
          <input
            v-model="userSearch"
            type="text"
            placeholder="Search users by name, username, email, or department..."
            class="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-hidden"
            @keyup.enter="userPage = 1; fetchUsers()"
          />
        </div>
        <button
          @click="userPage = 1; fetchUsers()"
          class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
        >
          Search
        </button>
      </div>

      <div class="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
        <table class="min-w-full divide-y divide-slate-200 text-left text-sm">
          <thead class="bg-slate-50 text-slate-600 text-xs font-semibold uppercase tracking-wider">
            <tr>
              <th class="px-4 py-3">User</th>
              <th class="px-4 py-3">Role / Department</th>
              <th class="px-4 py-3">Type</th>
              <th class="px-4 py-3">Status</th>
              <th class="px-4 py-3">Security</th>
              <th class="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            <tr v-if="loading && users.length === 0">
              <td colspan="6" class="px-4 py-8 text-center text-slate-500">Loading user accounts...</td>
            </tr>
            <tr v-else-if="users.length === 0">
              <td colspan="6" class="px-4 py-8 text-center text-slate-500">No users found.</td>
            </tr>
            <tr v-for="user in users" :key="user.id" class="hover:bg-slate-50 transition-colors">
              <td class="px-4 py-3">
                <div class="flex items-center gap-3">
                  <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 font-bold text-blue-700 text-xs uppercase">
                    {{ user.username.slice(0, 2) }}
                  </div>
                  <div>
                    <span class="font-semibold text-slate-900 block">{{ user.fullName }}</span>
                    <span class="text-xs text-slate-400 font-mono">{{ user.email }} • @{{ user.username }}</span>
                  </div>
                </div>
              </td>
              <td class="px-4 py-3 text-slate-600">
                <span class="font-medium text-slate-800 block">{{ user.jobTitle || 'Staff Member' }}</span>
                <span class="text-xs text-slate-400">{{ user.department || 'Operations' }}</span>
              </td>
              <td class="px-4 py-3">
                <span
                  :class="[
                    'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium uppercase',
                    user.userType === 'customer'
                      ? 'bg-amber-50 text-amber-700'
                      : 'bg-blue-50 text-blue-700',
                  ]"
                >
                  {{ user.userType }}
                </span>
              </td>
              <td class="px-4 py-3">
                <span
                  :class="[
                    'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                    user.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600',
                  ]"
                >
                  {{ user.isActive ? 'Active' : 'Inactive' }}
                </span>
              </td>
              <td class="px-4 py-3">
                <span
                  :class="[
                    'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                    user.isLocked ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-600',
                  ]"
                >
                  {{ user.isLocked ? '🔒 Locked' : 'Unlocked' }}
                </span>
              </td>
              <td class="px-4 py-3 text-right space-x-2">
                <button
                  @click="toggleLock(user)"
                  :class="[
                    'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                    user.isLocked
                      ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                      : 'bg-amber-50 text-amber-700 hover:bg-amber-100',
                  ]"
                >
                  {{ user.isLocked ? 'Unlock' : 'Lock' }}
                </button>
                <button
                  @click="resetPassword(user)"
                  class="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200"
                >
                  Reset Pwd
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- ── TAB 2: ROLES & PERMISSIONS ──────────────────────────────────────── -->
    <div v-if="activeTab === 'roles'" class="space-y-4">
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div
          v-for="role in roles"
          :key="role.id"
          class="rounded-xl border border-slate-200 bg-white p-5 shadow-xs hover:border-blue-300 transition-colors"
        >
          <div class="flex items-start justify-between">
            <div>
              <span class="inline-flex rounded-md bg-blue-50 px-2 py-0.5 text-xs font-bold text-blue-700 font-mono">
                {{ role.code }}
              </span>
              <h3 class="text-base font-bold text-slate-900 mt-2">{{ role.name }}</h3>
            </div>
            <span class="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600">
              {{ role.userType }}
            </span>
          </div>
          <p class="text-xs text-slate-500 mt-2 min-h-[32px]">
            {{ role.description || 'Pre-configured system role with tailored portal permissions.' }}
          </p>
          <div class="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
            <span>👥 {{ role._count?.users ?? 0 }} Assigned Users</span>
            <span>🔑 {{ role._count?.permissions ?? 'Full' }} Permissions</span>
          </div>
        </div>
      </div>
    </div>

    <!-- ── TAB 3: CUSTOMER MASTERS ────────────────────────────────────────── -->
    <div v-if="activeTab === 'customers'" class="space-y-4">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
        <div class="relative flex-1">
          <input
            v-model="customerSearch"
            type="text"
            placeholder="Search customers by code, name, or country..."
            class="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-hidden"
            @keyup.enter="customerPage = 1; fetchCustomers()"
          />
        </div>
        <button
          @click="customerPage = 1; fetchCustomers()"
          class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
        >
          Search
        </button>
      </div>

      <div class="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
        <table class="min-w-full divide-y divide-slate-200 text-left text-sm">
          <thead class="bg-slate-50 text-slate-600 text-xs font-semibold uppercase tracking-wider">
            <tr>
              <th class="px-4 py-3">Customer Code</th>
              <th class="px-4 py-3">Company Name</th>
              <th class="px-4 py-3">Country</th>
              <th class="px-4 py-3">Currency</th>
              <th class="px-4 py-3">Payment Terms</th>
              <th class="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            <tr v-if="loading && customers.length === 0">
              <td colspan="6" class="px-4 py-8 text-center text-slate-500">Loading customer accounts...</td>
            </tr>
            <tr v-else-if="customers.length === 0">
              <td colspan="6" class="px-4 py-8 text-center text-slate-500">No customers registered yet.</td>
            </tr>
            <tr v-for="c in customers" :key="c.id" class="hover:bg-slate-50">
              <td class="px-4 py-3 font-mono font-bold text-blue-600">{{ c.code }}</td>
              <td class="px-4 py-3">
                <span class="font-semibold text-slate-900 block">{{ c.name }}</span>
                <span v-if="c.legalName" class="text-xs text-slate-400">{{ c.legalName }}</span>
              </td>
              <td class="px-4 py-3 text-slate-600">{{ c.countryCode || 'EG' }}</td>
              <td class="px-4 py-3 font-semibold text-slate-700">{{ c.defaultCurrency || 'USD' }}</td>
              <td class="px-4 py-3 text-slate-600">{{ c.paymentTerms || 'Standard' }}</td>
              <td class="px-4 py-3">
                <span class="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                  {{ c.status }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- ── ADD USER MODAL ─────────────────────────────────────────────────── -->
    <div
      v-if="showAddUserModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs"
      @click.self="showAddUserModal = false"
    >
      <div class="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl border border-slate-200">
        <div class="flex items-center justify-between border-b border-slate-100 pb-3">
          <h2 class="text-lg font-bold text-slate-900">Add New User Account</h2>
          <button @click="showAddUserModal = false" class="text-slate-400 hover:text-slate-600">✕</button>
        </div>

        <form @submit.prevent="handleCreateUser" class="mt-4 space-y-3 text-sm">
          <div>
            <label class="block text-xs font-semibold text-slate-700 mb-1">Full Name *</label>
            <input
              v-model="newUser.fullName"
              type="text"
              required
              placeholder="e.g. Ahmed Hassan"
              class="w-full rounded-lg border border-slate-300 p-2.5 text-sm focus:border-blue-500 focus:outline-hidden"
            />
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-semibold text-slate-700 mb-1">Username *</label>
              <input
                v-model="newUser.username"
                type="text"
                required
                placeholder="ahmed.hassan"
                class="w-full rounded-lg border border-slate-300 p-2.5 text-sm focus:border-blue-500 focus:outline-hidden"
              />
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-700 mb-1">Email *</label>
              <input
                v-model="newUser.email"
                type="email"
                required
                placeholder="ahmed@energya.com"
                class="w-full rounded-lg border border-slate-300 p-2.5 text-sm focus:border-blue-500 focus:outline-hidden"
              />
            </div>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-semibold text-slate-700 mb-1">Job Title</label>
              <input
                v-model="newUser.jobTitle"
                type="text"
                placeholder="Technical Office Engineer"
                class="w-full rounded-lg border border-slate-300 p-2.5 text-sm focus:border-blue-500 focus:outline-hidden"
              />
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-700 mb-1">Department</label>
              <input
                v-model="newUser.department"
                type="text"
                placeholder="Engineering / Costing"
                class="w-full rounded-lg border border-slate-300 p-2.5 text-sm focus:border-blue-500 focus:outline-hidden"
              />
            </div>
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-700 mb-1">User Type</label>
            <select
              v-model="newUser.userType"
              class="w-full rounded-lg border border-slate-300 p-2.5 text-sm focus:border-blue-500 focus:outline-hidden"
            >
              <option value="internal">Internal Staff</option>
              <option value="customer">Customer Portal User</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-700 mb-1">Initial Password</label>
            <input
              v-model="newUser.password"
              type="password"
              placeholder="Leave blank for auto-generated temporary password"
              class="w-full rounded-lg border border-slate-300 p-2.5 text-sm focus:border-blue-500 focus:outline-hidden"
            />
          </div>

          <div class="mt-6 flex justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              @click="showAddUserModal = false"
              class="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              :disabled="loading"
              class="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Create Account
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- ── ADD CUSTOMER MODAL ─────────────────────────────────────────────── -->
    <div
      v-if="showAddCustomerModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs"
      @click.self="showAddCustomerModal = false"
    >
      <div class="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl border border-slate-200">
        <div class="flex items-center justify-between border-b border-slate-100 pb-3">
          <h2 class="text-lg font-bold text-slate-900">Register New Customer</h2>
          <button @click="showAddCustomerModal = false" class="text-slate-400 hover:text-slate-600">✕</button>
        </div>

        <form @submit.prevent="handleCreateCustomer" class="mt-4 space-y-3 text-sm">
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-semibold text-slate-700 mb-1">Customer Code *</label>
              <input
                v-model="newCustomer.code"
                type="text"
                required
                placeholder="CUST-UK-01"
                class="w-full rounded-lg border border-slate-300 p-2.5 text-sm uppercase focus:border-blue-500 focus:outline-hidden"
              />
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-700 mb-1">Country</label>
              <input
                v-model="newCustomer.countryCode"
                type="text"
                placeholder="GB / EG"
                class="w-full rounded-lg border border-slate-300 p-2.5 text-sm uppercase focus:border-blue-500 focus:outline-hidden"
              />
            </div>
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-700 mb-1">Company Trading Name *</label>
            <input
              v-model="newCustomer.name"
              type="text"
              required
              placeholder="Eland Cables Ltd"
              class="w-full rounded-lg border border-slate-300 p-2.5 text-sm focus:border-blue-500 focus:outline-hidden"
            />
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-700 mb-1">Legal Name</label>
            <input
              v-model="newCustomer.legalName"
              type="text"
              placeholder="Eland Cables International Limited"
              class="w-full rounded-lg border border-slate-300 p-2.5 text-sm focus:border-blue-500 focus:outline-hidden"
            />
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-semibold text-slate-700 mb-1">Default Currency</label>
              <select
                v-model="newCustomer.defaultCurrency"
                class="w-full rounded-lg border border-slate-300 p-2.5 text-sm focus:border-blue-500 focus:outline-hidden"
              >
                <option value="GBP">GBP (£)</option>
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
                <option value="EGP">EGP (E£)</option>
              </select>
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-700 mb-1">Payment Terms</label>
              <input
                v-model="newCustomer.paymentTerms"
                type="text"
                placeholder="Net 60 Days"
                class="w-full rounded-lg border border-slate-300 p-2.5 text-sm focus:border-blue-500 focus:outline-hidden"
              />
            </div>
          </div>

          <div class="mt-6 flex justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              @click="showAddCustomerModal = false"
              class="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              :disabled="loading"
              class="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Register Customer
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
