<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import { masterDataApi } from '../../services/masterDataApi';

const activeTab = ref<'cables' | 'boms' | 'rawMaterials' | 'drums'>('cables');
const loading = ref(false);
const errorMsg = ref('');

// ── Cables state ─────────────────────────────────────────────────────────────
const cables = ref<any[]>([]);
const cableTotal = ref(0);
const cablePage = ref(1);
const cableLimit = ref(15);
const cableSearch = ref('');
const cableFamily = ref('');
const cableStatus = ref('');
const selectedCable = ref<any | null>(null);
const showCableDetailModal = ref(false);

// ── Raw materials state ──────────────────────────────────────────────────────
const rawMaterials = ref<any[]>([]);
const rmTotal = ref(0);
const rmPage = ref(1);
const rmSearch = ref('');
const rmCategory = ref('');

// ── BOM state ────────────────────────────────────────────────────────────────
const boms = ref<any[]>([]);
const bomTotal = ref(0);
const bomPage = ref(1);
const bomSearchCable = ref('');

// ── Drums state ──────────────────────────────────────────────────────────────
const drums = ref<any[]>([]);
const drumTotal = ref(0);
const drumPage = ref(1);
const drumSearch = ref('');

// ── Fetchers ─────────────────────────────────────────────────────────────────
async function fetchCables() {
  loading.value = true;
  errorMsg.value = '';
  try {
    const res = await masterDataApi.getCables({
      page: cablePage.value,
      limit: cableLimit.value,
      search: cableSearch.value,
      family: cableFamily.value || undefined,
      status: cableStatus.value || undefined,
    });
    cables.value = res.items || [];
    cableTotal.value = res.total || 0;
  } catch (err: any) {
    errorMsg.value = err.response?.data?.message || 'Failed to load cables master data.';
  } finally {
    loading.value = false;
  }
}

async function fetchRawMaterials() {
  loading.value = true;
  errorMsg.value = '';
  try {
    const res = await masterDataApi.getRawMaterials({
      page: rmPage.value,
      limit: 15,
      search: rmSearch.value,
      category: rmCategory.value || undefined,
    });
    rawMaterials.value = res.items || [];
    rmTotal.value = res.total || 0;
  } catch (err: any) {
    errorMsg.value = err.response?.data?.message || 'Failed to load raw materials.';
  } finally {
    loading.value = false;
  }
}

async function fetchBoms() {
  loading.value = true;
  errorMsg.value = '';
  try {
    const res = await masterDataApi.getBoms({
      page: bomPage.value,
      limit: 15,
      materialNumber: bomSearchCable.value || undefined,
    });
    boms.value = res.items || [];
    bomTotal.value = res.total || 0;
  } catch (err: any) {
    errorMsg.value = err.response?.data?.message || 'Failed to load BOM records.';
  } finally {
    loading.value = false;
  }
}

async function fetchDrums() {
  loading.value = true;
  errorMsg.value = '';
  try {
    const res = await masterDataApi.getDrums({
      page: drumPage.value,
      limit: 15,
      search: drumSearch.value,
    });
    drums.value = res.items || [];
    drumTotal.value = res.total || 0;
  } catch (err: any) {
    errorMsg.value = err.response?.data?.message || 'Failed to load drum specifications.';
  } finally {
    loading.value = false;
  }
}

async function viewCableDetail(cable: any) {
  try {
    loading.value = true;
    const detail = await masterDataApi.getCable(cable.materialNumber);
    selectedCable.value = detail;
    showCableDetailModal.value = true;
  } catch (err: any) {
    selectedCable.value = cable;
    showCableDetailModal.value = true;
  } finally {
    loading.value = false;
  }
}

// ── Watch tab changes ────────────────────────────────────────────────────────
watch(activeTab, (tab) => {
  if (tab === 'cables') fetchCables();
  if (tab === 'rawMaterials') fetchRawMaterials();
  if (tab === 'boms') fetchBoms();
  if (tab === 'drums') fetchDrums();
});

onMounted(() => {
  fetchCables();
});
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 class="text-2xl font-bold tracking-tight text-slate-900">Master Data Hub</h1>
        <p class="text-sm text-slate-500">
          Official engineering specifications, raw materials, bills of materials, and drums registry.
        </p>
      </div>
      <div class="flex items-center gap-2">
        <span class="inline-flex items-center rounded-md bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
          Source of Truth: Prisma DB
        </span>
      </div>
    </div>

    <!-- Error message banner -->
    <div v-if="errorMsg" class="rounded-lg bg-red-50 p-4 text-sm text-red-700 border border-red-200">
      {{ errorMsg }}
    </div>

    <!-- Navigation Tabs -->
    <div class="border-b border-slate-200 bg-white rounded-t-xl px-4 pt-3 shadow-xs">
      <nav class="-mb-px flex space-x-6">
        <button
          @click="activeTab = 'cables'"
          :class="[
            'pb-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2',
            activeTab === 'cables'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300',
          ]"
        >
          <span>⚡ Cables Catalog</span>
          <span class="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{{ cableTotal }}</span>
        </button>

        <button
          @click="activeTab = 'boms'"
          :class="[
            'pb-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2',
            activeTab === 'boms'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300',
          ]"
        >
          <span>📑 Bill of Materials (BOM)</span>
          <span class="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{{ bomTotal }}</span>
        </button>

        <button
          @click="activeTab = 'rawMaterials'"
          :class="[
            'pb-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2',
            activeTab === 'rawMaterials'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300',
          ]"
        >
          <span>🧱 Raw Materials & Pricing</span>
          <span class="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{{ rmTotal }}</span>
        </button>

        <button
          @click="activeTab = 'drums'"
          :class="[
            'pb-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2',
            activeTab === 'drums'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300',
          ]"
        >
          <span>🛢️ Drum Masters</span>
          <span class="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{{ drumTotal }}</span>
        </button>
      </nav>
    </div>

    <!-- ── TAB 1: CABLES CATALOG ───────────────────────────────────────────── -->
    <div v-if="activeTab === 'cables'" class="space-y-4">
      <!-- Filter Bar -->
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
        <div class="relative flex-1">
          <input
            v-model="cableSearch"
            type="text"
            placeholder="Search by material number, description, or code..."
            class="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20"
            @keyup.enter="cablePage = 1; fetchCables()"
          />
        </div>
        <div class="flex items-center gap-3">
          <input
            v-model="cableFamily"
            type="text"
            placeholder="Family (e.g. XLPE)"
            class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-hidden w-36"
            @change="cablePage = 1; fetchCables()"
          />
          <button
            @click="cablePage = 1; fetchCables()"
            class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            Filter
          </button>
        </div>
      </div>

      <!-- Cables Table -->
      <div class="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
        <table class="min-w-full divide-y divide-slate-200 text-left text-sm">
          <thead class="bg-slate-50 text-slate-600 text-xs font-semibold uppercase tracking-wider">
            <tr>
              <th class="px-4 py-3">Material #</th>
              <th class="px-4 py-3">Description</th>
              <th class="px-4 py-3">Family / Voltage</th>
              <th class="px-4 py-3">Conductor & Size</th>
              <th class="px-4 py-3">Diameter (mm)</th>
              <th class="px-4 py-3">Weight (kg/km)</th>
              <th class="px-4 py-3">Status</th>
              <th class="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            <tr v-if="loading && cables.length === 0">
              <td colspan="8" class="px-4 py-8 text-center text-slate-500">Loading cables...</td>
            </tr>
            <tr v-else-if="cables.length === 0">
              <td colspan="8" class="px-4 py-8 text-center text-slate-500">
                No cables found matching your criteria.
              </td>
            </tr>
            <tr
              v-for="cable in cables"
              :key="cable.id"
              class="hover:bg-slate-50 transition-colors cursor-pointer"
              @click="viewCableDetail(cable)"
            >
              <td class="px-4 py-3 font-semibold text-blue-600">{{ cable.materialNumber }}</td>
              <td class="px-4 py-3 text-slate-800 max-w-xs truncate" :title="cable.description">
                {{ cable.description }}
              </td>
              <td class="px-4 py-3 text-slate-600">
                <span class="font-medium text-slate-800">{{ cable.family || '—' }}</span>
                <span v-if="cable.voltage" class="text-xs text-slate-400 block">{{ cable.voltage }}</span>
              </td>
              <td class="px-4 py-3 text-slate-600">
                {{ cable.conductor || '—' }} {{ cable.conductorSize ? `${cable.conductorSize} mm²` : '' }}
              </td>
              <td class="px-4 py-3 text-slate-600">{{ cable.diameter ?? '—' }}</td>
              <td class="px-4 py-3 text-slate-600">{{ cable.weight ?? '—' }}</td>
              <td class="px-4 py-3">
                <span
                  :class="[
                    'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                    cable.status === 'ACTIVE'
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-slate-100 text-slate-600',
                  ]"
                >
                  {{ cable.status }}
                </span>
              </td>
              <td class="px-4 py-3 text-right">
                <button
                  class="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200"
                  @click.stop="viewCableDetail(cable)"
                >
                  Inspect
                </button>
              </td>
            </tr>
          </tbody>
        </table>

        <!-- Pagination -->
        <div class="flex items-center justify-between border-t border-slate-200 px-4 py-3 bg-slate-50">
          <p class="text-xs text-slate-500">
            Showing {{ cables.length }} of {{ cableTotal }} cables
          </p>
          <div class="flex gap-2">
            <button
              :disabled="cablePage <= 1"
              @click="cablePage--; fetchCables()"
              class="rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 disabled:opacity-40"
            >
              Previous
            </button>
            <button
              :disabled="cablePage * cableLimit >= cableTotal"
              @click="cablePage++; fetchCables()"
              class="rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ── TAB 2: BOM (BILL OF MATERIALS) ─────────────────────────────────── -->
    <div v-if="activeTab === 'boms'" class="space-y-4">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
        <div class="relative flex-1">
          <input
            v-model="bomSearchCable"
            type="text"
            placeholder="Filter by cable material number (e.g. 10009487)..."
            class="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-hidden"
            @keyup.enter="bomPage = 1; fetchBoms()"
          />
        </div>
        <button
          @click="bomPage = 1; fetchBoms()"
          class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
        >
          Search BOM
        </button>
      </div>

      <div class="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
        <table class="min-w-full divide-y divide-slate-200 text-left text-sm">
          <thead class="bg-slate-50 text-slate-600 text-xs font-semibold uppercase tracking-wider">
            <tr>
              <th class="px-4 py-3">Cable Material #</th>
              <th class="px-4 py-3">Raw Material Code</th>
              <th class="px-4 py-3">Raw Material Description</th>
              <th class="px-4 py-3">Consumption</th>
              <th class="px-4 py-3">Scrap (%)</th>
              <th class="px-4 py-3">UOM</th>
              <th class="px-4 py-3">BOM Version</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            <tr v-if="loading && boms.length === 0">
              <td colspan="7" class="px-4 py-8 text-center text-slate-500">Loading BOM lines...</td>
            </tr>
            <tr v-else-if="boms.length === 0">
              <td colspan="7" class="px-4 py-8 text-center text-slate-500">No BOM lines recorded.</td>
            </tr>
            <tr v-for="line in boms" :key="line.id" class="hover:bg-slate-50">
              <td class="px-4 py-3 font-semibold text-blue-600">{{ line.cableMaterialNumber }}</td>
              <td class="px-4 py-3 font-mono text-xs text-slate-700">{{ line.rawMaterialCode }}</td>
              <td class="px-4 py-3 text-slate-800">{{ line.rawMaterial?.description || '—' }}</td>
              <td class="px-4 py-3 font-medium text-slate-900">{{ line.consumption }}</td>
              <td class="px-4 py-3 text-slate-600">{{ line.scrap ?? 0 }}%</td>
              <td class="px-4 py-3 text-slate-500 uppercase">{{ line.uom }}</td>
              <td class="px-4 py-3 text-slate-600">v{{ line.bomVersion }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- ── TAB 3: RAW MATERIALS ───────────────────────────────────────────── -->
    <div v-if="activeTab === 'rawMaterials'" class="space-y-4">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
        <div class="relative flex-1">
          <input
            v-model="rmSearch"
            type="text"
            placeholder="Search raw material code or description..."
            class="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-hidden"
            @keyup.enter="rmPage = 1; fetchRawMaterials()"
          />
        </div>
        <button
          @click="rmPage = 1; fetchRawMaterials()"
          class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
        >
          Search
        </button>
      </div>

      <div class="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
        <table class="min-w-full divide-y divide-slate-200 text-left text-sm">
          <thead class="bg-slate-50 text-slate-600 text-xs font-semibold uppercase tracking-wider">
            <tr>
              <th class="px-4 py-3">RM Code</th>
              <th class="px-4 py-3">Description</th>
              <th class="px-4 py-3">Category</th>
              <th class="px-4 py-3">Pricing Category</th>
              <th class="px-4 py-3">Latest Price</th>
              <th class="px-4 py-3">UOM</th>
              <th class="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            <tr v-if="loading && rawMaterials.length === 0">
              <td colspan="7" class="px-4 py-8 text-center text-slate-500">Loading raw materials...</td>
            </tr>
            <tr v-else-if="rawMaterials.length === 0">
              <td colspan="7" class="px-4 py-8 text-center text-slate-500">No raw materials found.</td>
            </tr>
            <tr v-for="rm in rawMaterials" :key="rm.code" class="hover:bg-slate-50">
              <td class="px-4 py-3 font-mono font-semibold text-slate-900">{{ rm.code }}</td>
              <td class="px-4 py-3 text-slate-800">{{ rm.description }}</td>
              <td class="px-4 py-3 text-slate-600">{{ rm.category || 'General' }}</td>
              <td class="px-4 py-3">
                <span class="inline-flex rounded-sm bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                  {{ rm.pricingCategory }}
                </span>
              </td>
              <td class="px-4 py-3 font-semibold text-emerald-600">
                <span v-if="rm.prices && rm.prices[0]">
                  {{ rm.prices[0].price }} {{ rm.prices[0].currency || 'USD' }}/{{ rm.prices[0].uom || 'kg' }}
                </span>
                <span v-else class="text-xs text-slate-400">Not configured</span>
              </td>
              <td class="px-4 py-3 text-slate-500 uppercase">{{ rm.uom }}</td>
              <td class="px-4 py-3">
                <span class="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                  {{ rm.status }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- ── TAB 4: DRUM MASTERS ────────────────────────────────────────────── -->
    <div v-if="activeTab === 'drums'" class="space-y-4">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
        <div class="relative flex-1">
          <input
            v-model="drumSearch"
            type="text"
            placeholder="Search drum code or description..."
            class="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-hidden"
            @keyup.enter="drumPage = 1; fetchDrums()"
          />
        </div>
        <button
          @click="drumPage = 1; fetchDrums()"
          class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
        >
          Search
        </button>
      </div>

      <div class="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
        <table class="min-w-full divide-y divide-slate-200 text-left text-sm">
          <thead class="bg-slate-50 text-slate-600 text-xs font-semibold uppercase tracking-wider">
            <tr>
              <th class="px-4 py-3">Drum Code</th>
              <th class="px-4 py-3">Type / Description</th>
              <th class="px-4 py-3">Flange (mm)</th>
              <th class="px-4 py-3">Barrel (mm)</th>
              <th class="px-4 py-3">Outer Width (mm)</th>
              <th class="px-4 py-3">Capacity (m³)</th>
              <th class="px-4 py-3">Max Load (kg)</th>
              <th class="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            <tr v-if="loading && drums.length === 0">
              <td colspan="8" class="px-4 py-8 text-center text-slate-500">Loading drums...</td>
            </tr>
            <tr v-else-if="drums.length === 0">
              <td colspan="8" class="px-4 py-8 text-center text-slate-500">No drum masters found.</td>
            </tr>
            <tr v-for="drum in drums" :key="drum.id" class="hover:bg-slate-50">
              <td class="px-4 py-3 font-semibold text-slate-900">{{ drum.drumCode }}</td>
              <td class="px-4 py-3 text-slate-700">{{ drum.drumType || drum.description || '—' }}</td>
              <td class="px-4 py-3 text-slate-600">{{ drum.flange }}</td>
              <td class="px-4 py-3 text-slate-600">{{ drum.barrel }}</td>
              <td class="px-4 py-3 text-slate-600">{{ drum.outerWidth }}</td>
              <td class="px-4 py-3 text-slate-600">{{ drum.capacity }}</td>
              <td class="px-4 py-3 font-medium text-slate-800">{{ drum.maxWeight ?? '—' }}</td>
              <td class="px-4 py-3">
                <span class="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                  {{ drum.status }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- ── CABLE DETAIL MODAL ──────────────────────────────────────────────── -->
    <div
      v-if="showCableDetailModal && selectedCable"
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs"
      @click.self="showCableDetailModal = false"
    >
      <div class="w-full max-w-3xl rounded-2xl bg-white p-6 shadow-xl border border-slate-200 max-h-[90vh] overflow-y-auto">
        <div class="flex items-center justify-between border-b border-slate-100 pb-4">
          <div>
            <h2 class="text-xl font-bold text-slate-900">{{ selectedCable.materialNumber }}</h2>
            <p class="text-sm text-slate-500">{{ selectedCable.description }}</p>
          </div>
          <button
            @click="showCableDetailModal = false"
            class="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            ✕
          </button>
        </div>

        <div class="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div class="rounded-lg bg-slate-50 p-3">
            <span class="text-xs text-slate-500 block">Family</span>
            <span class="font-semibold text-slate-800">{{ selectedCable.family || '—' }}</span>
          </div>
          <div class="rounded-lg bg-slate-50 p-3">
            <span class="text-xs text-slate-500 block">Voltage</span>
            <span class="font-semibold text-slate-800">{{ selectedCable.voltage || '—' }}</span>
          </div>
          <div class="rounded-lg bg-slate-50 p-3">
            <span class="text-xs text-slate-500 block">Conductor</span>
            <span class="font-semibold text-slate-800">{{ selectedCable.conductor || '—' }}</span>
          </div>
          <div class="rounded-lg bg-slate-50 p-3">
            <span class="text-xs text-slate-500 block">Conductor Size</span>
            <span class="font-semibold text-slate-800">{{ selectedCable.conductorSize ? `${selectedCable.conductorSize} mm²` : '—' }}</span>
          </div>
          <div class="rounded-lg bg-slate-50 p-3">
            <span class="text-xs text-slate-500 block">Diameter</span>
            <span class="font-semibold text-slate-800">{{ selectedCable.diameter }} mm</span>
          </div>
          <div class="rounded-lg bg-slate-50 p-3">
            <span class="text-xs text-slate-500 block">Weight</span>
            <span class="font-semibold text-slate-800">{{ selectedCable.weight }} kg/km</span>
          </div>
          <div class="rounded-lg bg-slate-50 p-3">
            <span class="text-xs text-slate-500 block">Insulation</span>
            <span class="font-semibold text-slate-800">{{ selectedCable.insulation || '—' }}</span>
          </div>
          <div class="rounded-lg bg-slate-50 p-3">
            <span class="text-xs text-slate-500 block">Sheath</span>
            <span class="font-semibold text-slate-800">{{ selectedCable.sheath || '—' }}</span>
          </div>
        </div>

        <!-- BOM breakdown in modal -->
        <div class="mt-6">
          <h3 class="text-sm font-bold text-slate-800 uppercase tracking-wider mb-2">
            Associated Bill of Materials (BOM)
          </h3>
          <div v-if="selectedCable.bomLines && selectedCable.bomLines.length > 0" class="overflow-hidden rounded-lg border border-slate-200">
            <table class="min-w-full divide-y divide-slate-200 text-xs">
              <thead class="bg-slate-50 text-slate-600 font-semibold">
                <tr>
                  <th class="px-3 py-2 text-left">RM Code</th>
                  <th class="px-3 py-2 text-left">Description</th>
                  <th class="px-3 py-2 text-right">Consumption</th>
                  <th class="px-3 py-2 text-right">Scrap</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                <tr v-for="b in selectedCable.bomLines" :key="b.id">
                  <td class="px-3 py-2 font-mono text-slate-700">{{ b.rawMaterialCode }}</td>
                  <td class="px-3 py-2 text-slate-800">{{ b.rawMaterial?.description || 'Raw Material' }}</td>
                  <td class="px-3 py-2 text-right font-medium text-slate-900">{{ b.consumption }} {{ b.uom }}</td>
                  <td class="px-3 py-2 text-right text-slate-600">{{ b.scrap ?? 0 }}%</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p v-else class="text-xs text-slate-400 italic">No BOM lines linked directly to this cable record.</p>
        </div>

        <div class="mt-6 flex justify-end">
          <button
            @click="showCableDetailModal = false"
            class="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
