<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { inquiriesApi } from '../../services/inquiriesApi';

const loading = ref(false);
const errorMsg = ref('');
const inquiries = ref<any[]>([]);
const totalInquiries = ref(0);
const page = ref(1);
const limit = ref(15);
const search = ref('');
const statusFilter = ref('');

// Modals
const showCreateModal = ref(false);
const showDetailModal = ref(false);
const selectedInquiry = ref<any | null>(null);

// Create form state
const newInquiry = ref({
  customerName: '',
  projectName: '',
  contactPerson: '',
  customerReference: '',
  requestedDeliveryDate: '',
  currency: 'USD',
  incoterms: 'FOB',
  paymentTerms: 'LC at sight',
  deliveryTerms: 'CIF Alexandria',
  notes: '',
  lines: [
    {
      cableDescription: 'Low Voltage Power Cable 4x16mm² XLPE/PVC',
      materialNumber: '',
      requestedLengthMeters: 1000,
      requestedQuantity: 1,
      quantityUom: 'KM',
      drumType: 'Wood Reel 220',
      notes: '',
    },
  ],
});

// New line in detail modal
const newLine = ref({
  cableDescription: '',
  materialNumber: '',
  requestedLengthMeters: 1000,
  requestedQuantity: 1,
  quantityUom: 'KM',
  drumType: 'Wood Reel 220',
});

async function fetchInquiries() {
  loading.value = true;
  errorMsg.value = '';
  try {
    const res = await inquiriesApi.listInquiries({
      page: page.value,
      limit: limit.value,
      search: search.value || undefined,
      status: statusFilter.value || undefined,
    });
    inquiries.value = res.items || [];
    totalInquiries.value = res.total || 0;
  } catch (err: any) {
    errorMsg.value = err.response?.data?.message || 'Failed to load inquiries.';
  } finally {
    loading.value = false;
  }
}

async function viewInquiry(id: string) {
  loading.value = true;
  try {
    const data = await inquiriesApi.getInquiry(id);
    selectedInquiry.value = data;
    showDetailModal.value = true;
  } catch (err: any) {
    errorMsg.value = err.response?.data?.message || 'Failed to load inquiry details.';
  } finally {
    loading.value = false;
  }
}

async function handleCreateInquiry() {
  if (!newInquiry.value.customerName.trim()) {
    alert('Customer name is required.');
    return;
  }

  loading.value = true;
  try {
    await inquiriesApi.createInquiry(newInquiry.value);
    showCreateModal.value = false;
    // Reset form
    newInquiry.value = {
      customerName: '',
      projectName: '',
      contactPerson: '',
      customerReference: '',
      requestedDeliveryDate: '',
      currency: 'USD',
      incoterms: 'FOB',
      paymentTerms: 'LC at sight',
      deliveryTerms: 'CIF Alexandria',
      notes: '',
      lines: [
        {
          cableDescription: '',
          materialNumber: '',
          requestedLengthMeters: 1000,
          requestedQuantity: 1,
          quantityUom: 'KM',
          drumType: 'Wood Reel 220',
          notes: '',
        },
      ],
    };
    await fetchInquiries();
  } catch (err: any) {
    alert(err.response?.data?.message || 'Failed to create inquiry.');
  } finally {
    loading.value = false;
  }
}

async function handleStatusChange(inquiryId: string, status: string) {
  try {
    loading.value = true;
    await inquiriesApi.updateStatus(inquiryId, status);
    if (selectedInquiry.value && selectedInquiry.value.id === inquiryId) {
      selectedInquiry.value = await inquiriesApi.getInquiry(inquiryId);
    }
    await fetchInquiries();
  } catch (err: any) {
    alert(err.response?.data?.message || 'Failed to update status.');
  } finally {
    loading.value = false;
  }
}

async function handleAddLine() {
  if (!selectedInquiry.value) return;
  if (!newLine.value.cableDescription.trim()) {
    alert('Cable description is required.');
    return;
  }

  try {
    loading.value = true;
    await inquiriesApi.addLine(selectedInquiry.value.id, newLine.value);
    selectedInquiry.value = await inquiriesApi.getInquiry(selectedInquiry.value.id);
    newLine.value = {
      cableDescription: '',
      materialNumber: '',
      requestedLengthMeters: 1000,
      requestedQuantity: 1,
      quantityUom: 'KM',
      drumType: 'Wood Reel 220',
    };
  } catch (err: any) {
    alert(err.response?.data?.message || 'Failed to add line item.');
  } finally {
    loading.value = false;
  }
}

async function handleDeleteLine(lineId: string) {
  if (!selectedInquiry.value || !confirm('Are you sure you want to delete this line?')) return;
  try {
    loading.value = true;
    await inquiriesApi.deleteLine(selectedInquiry.value.id, lineId);
    selectedInquiry.value = await inquiriesApi.getInquiry(selectedInquiry.value.id);
  } catch (err: any) {
    alert(err.response?.data?.message || 'Failed to delete line item.');
  } finally {
    loading.value = false;
  }
}

function addFormLine() {
  newInquiry.value.lines.push({
    cableDescription: '',
    materialNumber: '',
    requestedLengthMeters: 1000,
    requestedQuantity: 1,
    quantityUom: 'KM',
    drumType: 'Wood Reel 220',
    notes: '',
  });
}

function removeFormLine(idx: number) {
  if (newInquiry.value.lines.length > 1) {
    newInquiry.value.lines.splice(idx, 1);
  }
}

const statusBadgeClasses = (status: string) => {
  switch (status) {
    case 'DRAFT':
      return 'bg-slate-100 text-slate-700';
    case 'SUBMITTED':
      return 'bg-blue-50 text-blue-700 border border-blue-200';
    case 'UNDER_REVIEW':
      return 'bg-amber-50 text-amber-700 border border-amber-200';
    case 'QUOTED':
      return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
    case 'CANCELLED':
      return 'bg-rose-50 text-rose-700 border border-rose-200';
    default:
      return 'bg-slate-100 text-slate-700';
  }
};

onMounted(() => {
  fetchInquiries();
});
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 class="text-2xl font-bold tracking-tight text-slate-900">Commercial Inquiries</h1>
        <p class="text-sm text-slate-500">
          Manage B2B customer inquiries, multi-item cable specifications, and costing workflows.
        </p>
      </div>
      <div>
        <button
          @click="showCreateModal = true"
          class="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-blue-700 transition-colors"
        >
          <span>＋</span>
          <span>New Inquiry</span>
        </button>
      </div>
    </div>

    <!-- Error message banner -->
    <div v-if="errorMsg" class="rounded-lg bg-red-50 p-4 text-sm text-red-700 border border-red-200">
      {{ errorMsg }}
    </div>

    <!-- Filter & Search Toolbar -->
    <div class="flex flex-col gap-3 sm:flex-row sm:items-center bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
      <div class="relative flex-1">
        <input
          v-model="search"
          type="text"
          placeholder="Search by inquiry #, customer name, project, or reference..."
          class="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20"
          @keyup.enter="page = 1; fetchInquiries()"
        />
      </div>
      <div class="flex items-center gap-3">
        <select
          v-model="statusFilter"
          class="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-hidden"
          @change="page = 1; fetchInquiries()"
        >
          <option value="">All Statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="SUBMITTED">Submitted</option>
          <option value="UNDER_REVIEW">Under Review</option>
          <option value="QUOTED">Quoted</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
        <button
          @click="page = 1; fetchInquiries()"
          class="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200 transition-colors"
        >
          Refresh
        </button>
      </div>
    </div>

    <!-- Inquiries Table -->
    <div class="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
      <table class="min-w-full divide-y divide-slate-200 text-left text-sm">
        <thead class="bg-slate-50 text-slate-600 text-xs font-semibold uppercase tracking-wider">
          <tr>
            <th class="px-4 py-3">Inquiry #</th>
            <th class="px-4 py-3">Customer / Project</th>
            <th class="px-4 py-3">Lines</th>
            <th class="px-4 py-3">Delivery Terms</th>
            <th class="px-4 py-3">Incoterms / Currency</th>
            <th class="px-4 py-3">Status</th>
            <th class="px-4 py-3">Date</th>
            <th class="px-4 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          <tr v-if="loading && inquiries.length === 0">
            <td colspan="8" class="px-4 py-8 text-center text-slate-500">Loading inquiries...</td>
          </tr>
          <tr v-else-if="inquiries.length === 0">
            <td colspan="8" class="px-4 py-8 text-center text-slate-500">
              No inquiries found. Create your first inquiry using the button above!
            </td>
          </tr>
          <tr
            v-for="inq in inquiries"
            :key="inq.id"
            class="hover:bg-slate-50 transition-colors cursor-pointer"
            @click="viewInquiry(inq.id)"
          >
            <td class="px-4 py-3 font-semibold text-blue-600 font-mono">{{ inq.inquiryNumber }}</td>
            <td class="px-4 py-3">
              <span class="font-medium text-slate-900 block">{{ inq.customerName }}</span>
              <span v-if="inq.projectName" class="text-xs text-slate-500">{{ inq.projectName }}</span>
            </td>
            <td class="px-4 py-3 text-slate-600">
              <span class="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-800">
                {{ inq._count?.lines ?? inq.lines?.length ?? 0 }} items
              </span>
            </td>
            <td class="px-4 py-3 text-slate-600">{{ inq.deliveryTerms || 'Standard CIF' }}</td>
            <td class="px-4 py-3 text-slate-600">
              <span class="font-medium text-slate-800">{{ inq.incoterms || 'FOB' }}</span>
              <span class="text-xs text-slate-400 block">{{ inq.currency || 'USD' }}</span>
            </td>
            <td class="px-4 py-3">
              <span :class="['inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', statusBadgeClasses(inq.status)]">
                {{ inq.status }}
              </span>
            </td>
            <td class="px-4 py-3 text-xs text-slate-500">
              {{ new Date(inq.createdAt).toLocaleDateString() }}
            </td>
            <td class="px-4 py-3 text-right">
              <button
                class="rounded-md bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100"
                @click.stop="viewInquiry(inq.id)"
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
          Showing {{ inquiries.length }} of {{ totalInquiries }} inquiries
        </p>
        <div class="flex gap-2">
          <button
            :disabled="page <= 1"
            @click="page--; fetchInquiries()"
            class="rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 disabled:opacity-40"
          >
            Previous
          </button>
          <button
            :disabled="page * limit >= totalInquiries"
            @click="page++; fetchInquiries()"
            class="rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </div>

    <!-- ── INQUIRY DETAIL MODAL ────────────────────────────────────────────── -->
    <div
      v-if="showDetailModal && selectedInquiry"
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs"
      @click.self="showDetailModal = false"
    >
      <div class="w-full max-w-4xl rounded-2xl bg-white p-6 shadow-xl border border-slate-200 max-h-[90vh] overflow-y-auto">
        <!-- Header -->
        <div class="flex items-start justify-between border-b border-slate-100 pb-4">
          <div>
            <div class="flex items-center gap-3">
              <h2 class="text-xl font-bold font-mono text-slate-900">{{ selectedInquiry.inquiryNumber }}</h2>
              <span :class="['inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', statusBadgeClasses(selectedInquiry.status)]">
                {{ selectedInquiry.status }}
              </span>
            </div>
            <p class="text-sm text-slate-600 mt-1">
              Customer: <span class="font-semibold text-slate-900">{{ selectedInquiry.customerName }}</span>
              <span v-if="selectedInquiry.projectName"> • Project: {{ selectedInquiry.projectName }}</span>
            </p>
          </div>
          <button
            @click="showDetailModal = false"
            class="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            ✕
          </button>
        </div>

        <!-- Workflow Status Transition Buttons -->
        <div class="mt-4 flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 p-3 border border-slate-200">
          <span class="text-xs font-semibold text-slate-500 uppercase tracking-wider mr-2">Workflow Actions:</span>
          <button
            v-if="selectedInquiry.status === 'DRAFT'"
            @click="handleStatusChange(selectedInquiry.id, 'SUBMITTED')"
            class="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
          >
            Submit for Review
          </button>
          <button
            v-if="['SUBMITTED', 'DRAFT'].includes(selectedInquiry.status)"
            @click="handleStatusChange(selectedInquiry.id, 'UNDER_REVIEW')"
            class="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
          >
            Mark Under Review
          </button>
          <button
            v-if="['UNDER_REVIEW', 'SUBMITTED'].includes(selectedInquiry.status)"
            @click="handleStatusChange(selectedInquiry.id, 'QUOTED')"
            class="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
          >
            Generate Quotation (Mark Quoted)
          </button>
          <button
            v-if="selectedInquiry.status !== 'CANCELLED'"
            @click="handleStatusChange(selectedInquiry.id, 'CANCELLED')"
            class="rounded-lg bg-rose-50 border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"
          >
            Cancel Inquiry
          </button>
        </div>

        <!-- Commercial Terms Cards -->
        <div class="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div class="rounded-lg bg-slate-50 p-3">
            <span class="text-slate-400 block">Currency</span>
            <span class="font-bold text-slate-800">{{ selectedInquiry.currency }}</span>
          </div>
          <div class="rounded-lg bg-slate-50 p-3">
            <span class="text-slate-400 block">Incoterms</span>
            <span class="font-bold text-slate-800">{{ selectedInquiry.incoterms || 'FOB' }}</span>
          </div>
          <div class="rounded-lg bg-slate-50 p-3">
            <span class="text-slate-400 block">Payment Terms</span>
            <span class="font-bold text-slate-800">{{ selectedInquiry.paymentTerms || 'LC at sight' }}</span>
          </div>
          <div class="rounded-lg bg-slate-50 p-3">
            <span class="text-slate-400 block">Delivery Terms</span>
            <span class="font-bold text-slate-800">{{ selectedInquiry.deliveryTerms || 'CIF' }}</span>
          </div>
        </div>

        <!-- Lines Table -->
        <div class="mt-6">
          <div class="flex items-center justify-between mb-2">
            <h3 class="text-sm font-bold text-slate-800 uppercase tracking-wider">
              Cable Line Items ({{ selectedInquiry.lines?.length || 0 }})
            </h3>
          </div>

          <div class="overflow-hidden rounded-xl border border-slate-200">
            <table class="min-w-full divide-y divide-slate-200 text-xs">
              <thead class="bg-slate-50 text-slate-600 font-semibold">
                <tr>
                  <th class="px-3 py-2 text-left">#</th>
                  <th class="px-3 py-2 text-left">Specification / Description</th>
                  <th class="px-3 py-2 text-right">Length (M)</th>
                  <th class="px-3 py-2 text-right">Qty</th>
                  <th class="px-3 py-2 text-left">Drum Type</th>
                  <th class="px-3 py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                <tr v-for="l in selectedInquiry.lines" :key="l.id">
                  <td class="px-3 py-2 font-mono text-slate-500">{{ l.lineNumber }}</td>
                  <td class="px-3 py-2 font-medium text-slate-900">{{ l.cableDescription }}</td>
                  <td class="px-3 py-2 text-right font-semibold text-blue-600">{{ l.requestedLengthMeters }} m</td>
                  <td class="px-3 py-2 text-right">{{ l.requestedQuantity }} {{ l.quantityUom }}</td>
                  <td class="px-3 py-2 text-slate-600">{{ l.drumType }}</td>
                  <td class="px-3 py-2 text-right">
                    <button
                      @click="handleDeleteLine(l.id)"
                      class="text-rose-600 hover:text-rose-800 font-medium"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
                <tr v-if="!selectedInquiry.lines || selectedInquiry.lines.length === 0">
                  <td colspan="6" class="px-3 py-4 text-center text-slate-400">No cable lines added yet.</td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Quick Add Line Item Form -->
          <div class="mt-4 rounded-xl bg-slate-50 p-4 border border-slate-200">
            <h4 class="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Add New Line Item</h4>
            <div class="grid grid-cols-1 sm:grid-cols-4 gap-2 text-xs">
              <input
                v-model="newLine.cableDescription"
                type="text"
                placeholder="Cable specification description..."
                class="sm:col-span-2 rounded-lg border border-slate-300 bg-white p-2 text-xs focus:border-blue-500 focus:outline-hidden"
              />
              <input
                v-model.number="newLine.requestedLengthMeters"
                type="number"
                placeholder="Length in meters"
                class="rounded-lg border border-slate-300 bg-white p-2 text-xs focus:border-blue-500 focus:outline-hidden"
              />
              <button
                @click="handleAddLine"
                class="rounded-lg bg-blue-600 p-2 text-xs font-bold text-white hover:bg-blue-700 transition-colors"
              >
                + Add Line
              </button>
            </div>
          </div>
        </div>

        <div class="mt-6 flex justify-end">
          <button
            @click="showDetailModal = false"
            class="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200"
          >
            Close
          </button>
        </div>
      </div>
    </div>

    <!-- ── CREATE INQUIRY MODAL ───────────────────────────────────────────── -->
    <div
      v-if="showCreateModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs"
      @click.self="showCreateModal = false"
    >
      <div class="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl border border-slate-200 max-h-[90vh] overflow-y-auto">
        <div class="flex items-center justify-between border-b border-slate-100 pb-4">
          <h2 class="text-xl font-bold text-slate-900">Create New Commercial Inquiry</h2>
          <button
            @click="showCreateModal = false"
            class="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            ✕
          </button>
        </div>

        <form @submit.prevent="handleCreateInquiry" class="mt-4 space-y-4 text-sm">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-semibold text-slate-700 mb-1">Customer Name *</label>
              <input
                v-model="newInquiry.customerName"
                type="text"
                required
                placeholder="e.g. Elsewedy Electric, Eland UK..."
                class="w-full rounded-lg border border-slate-300 p-2.5 text-sm focus:border-blue-500 focus:outline-hidden"
              />
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-700 mb-1">Project Name</label>
              <input
                v-model="newInquiry.projectName"
                type="text"
                placeholder="e.g. Benban Solar Park Phase 2"
                class="w-full rounded-lg border border-slate-300 p-2.5 text-sm focus:border-blue-500 focus:outline-hidden"
              />
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-700 mb-1">Customer Reference / PO</label>
              <input
                v-model="newInquiry.customerReference"
                type="text"
                placeholder="e.g. RFQ-2026-99"
                class="w-full rounded-lg border border-slate-300 p-2.5 text-sm focus:border-blue-500 focus:outline-hidden"
              />
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-700 mb-1">Requested Delivery Date</label>
              <input
                v-model="newInquiry.requestedDeliveryDate"
                type="date"
                class="w-full rounded-lg border border-slate-300 p-2.5 text-sm focus:border-blue-500 focus:outline-hidden"
              />
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-700 mb-1">Currency</label>
              <select
                v-model="newInquiry.currency"
                class="w-full rounded-lg border border-slate-300 p-2.5 text-sm focus:border-blue-500 focus:outline-hidden"
              >
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
                <option value="GBP">GBP (£)</option>
                <option value="EGP">EGP (E£)</option>
              </select>
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-700 mb-1">Incoterms</label>
              <input
                v-model="newInquiry.incoterms"
                type="text"
                placeholder="FOB Alexandria / CIF"
                class="w-full rounded-lg border border-slate-300 p-2.5 text-sm focus:border-blue-500 focus:outline-hidden"
              />
            </div>
          </div>

          <!-- Initial Line Items -->
          <div class="border-t border-slate-200 pt-4">
            <div class="flex items-center justify-between mb-2">
              <label class="block text-xs font-bold text-slate-800 uppercase tracking-wider">Cable Requirements</label>
              <button
                type="button"
                @click="addFormLine"
                class="text-xs font-semibold text-blue-600 hover:text-blue-800"
              >
                + Add Another Cable
              </button>
            </div>

            <div class="space-y-3">
              <div
                v-for="(line, idx) in newInquiry.lines"
                :key="idx"
                class="flex flex-col sm:flex-row gap-2 rounded-lg bg-slate-50 p-3 border border-slate-200 items-center"
              >
                <input
                  v-model="line.cableDescription"
                  type="text"
                  required
                  placeholder="Cable description (e.g. CU/XLPE/SWA/PVC 4x25)"
                  class="flex-1 rounded-md border border-slate-300 bg-white p-2 text-xs focus:border-blue-500 focus:outline-hidden"
                />
                <input
                  v-model.number="line.requestedLengthMeters"
                  type="number"
                  placeholder="Length (Meters)"
                  class="w-32 rounded-md border border-slate-300 bg-white p-2 text-xs focus:border-blue-500 focus:outline-hidden"
                />
                <button
                  type="button"
                  @click="removeFormLine(idx)"
                  class="text-xs text-rose-500 hover:text-rose-700 p-1"
                >
                  ✕
                </button>
              </div>
            </div>
          </div>

          <div class="mt-6 flex justify-end gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              @click="showCreateModal = false"
              class="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              :disabled="loading"
              class="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {{ loading ? 'Saving...' : 'Create Inquiry' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
