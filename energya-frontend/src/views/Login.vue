<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const router = useRouter();
const authStore = useAuthStore();

const email = ref('');
const password = ref('');
const showPassword = ref(false);
const rememberMe = ref(true);
const error = ref<string | null>(null);
const loading = ref(false);

const handleLogin = async () => {
  error.value = null;
  const identifier = email.value.trim();
  
  if (!identifier || !password.value) {
    error.value = 'Please enter your email and password.';
    return;
  }
  
  loading.value = true;
  const res = await authStore.loginWithJwt(identifier, password.value, rememberMe.value);
  loading.value = false;
  
  if (res.success && res.user) {
    const redirect = (router.currentRoute.value.query.redirect as string) || null;
    if (redirect) {
      router.push(redirect);
    } else {
      const target = res.user.userType === 'customer'
        ? '/customer/dashboard'
        : '/internal/dashboard';
      router.push(target);
    }
  } else {
    error.value = res.message || 'Invalid email or password.';
  }
};
</script>

<template>
  <div class="relative min-h-dvh overflow-x-hidden bg-white">
    <div class="relative grid min-h-dvh lg:grid-cols-2 xl:grid-cols-[minmax(0,1.15fr)_minmax(400px,0.85fr)]">
      
      <!-- Left side Hero (Hidden on mobile) -->
      <aside class="relative hidden overflow-hidden lg:flex">
        <div class="absolute inset-0 bg-blue-900" />
        <div class="relative z-10 flex w-full max-w-xl flex-col justify-center px-10 py-12 pe-16 xl:px-16 xl:py-16 xl:pe-20 text-white">
          <h1 class="mt-10 text-4xl font-bold leading-tight tracking-tight xl:text-5xl">
            Energya Digital Platform
          </h1>
          <p class="mt-3 max-w-md text-base leading-relaxed xl:text-lg opacity-90">
            Design. Configure. Request. All in one platform.
          </p>
        </div>
      </aside>

      <!-- Right side Login Form -->
      <main class="relative flex min-h-dvh items-center justify-center px-5 py-8 sm:px-8">
        <div class="w-full max-w-[420px]">
          <h2 class="text-3xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Sign in to your account
          </h2>
          <p class="mt-1.5 text-sm text-slate-500">
            Access the Energya Digital Platform
          </p>

          <div v-if="error" role="alert" class="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <span>{{ error }}</span>
          </div>

          <form @submit.prevent="handleLogin" class="mt-6 space-y-4" novalidate>
            <div>
              <label for="email" class="mb-1.5 block text-sm font-medium text-slate-700">Email or Username</label>
              <div class="relative">
                <input
                  id="email"
                  v-model="email"
                  type="email"
                  autocomplete="email"
                  required
                  class="w-full min-h-11 rounded-lg border border-slate-300 bg-white py-2.5 px-3 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                  placeholder="name@energya.com"
                />
              </div>
            </div>

            <div>
              <label for="password" class="mb-1.5 block text-sm font-medium text-slate-700">Password</label>
              <div class="relative">
                <input
                  id="password"
                  v-model="password"
                  :type="showPassword ? 'text' : 'password'"
                  autocomplete="current-password"
                  required
                  class="w-full min-h-11 rounded-lg border border-slate-300 bg-white py-2.5 px-3 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  @click="showPassword = !showPassword"
                  class="absolute end-0 top-0 flex h-full items-center justify-center px-3 text-slate-400 hover:text-slate-600 focus:outline-none"
                >
                  <span class="text-xs font-bold">{{ showPassword ? 'Hide' : 'Show' }}</span>
                </button>
              </div>
            </div>

            <div class="flex items-center justify-between mt-4">
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" v-model="rememberMe" class="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500/40" />
                <span class="text-sm text-slate-600">Remember me</span>
              </label>
              <button type="button" class="text-sm font-medium text-blue-600 hover:text-blue-700 hover:underline focus:outline-none">
                Forgot password?
              </button>
            </div>

            <button
              type="submit"
              :disabled="loading"
              class="mt-6 flex w-full min-h-11 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/40 disabled:opacity-70"
            >
              <span v-if="loading">Signing in...</span>
              <span v-else>Sign in</span>
            </button>
          </form>
        </div>
      </main>
    </div>
  </div>
</template>
