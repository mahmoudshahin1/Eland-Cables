<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { inquiriesApi } from '../../services/inquiriesApi';

const loading = ref(false);
const errorMsg = ref('');
const inquiries = ref<any[]>([]);
const showNewInquiryModal = ref(false);

const newRFQ = ref({
  projectName: '',
  customerReference: '',
  requestedDeliveryDate: '',
  currency: 'USD',
  notes: '',
  lines: [
    {
      cableDescription: '',
      requestedLengthMeters: 1000,
      requestedQuantity: 1,
      quantityUom: 'KM',
    },
  ],
});

async function fetchMyInquiries() {
  loading.value = true;
  errorMsg.value = '';
  try {
    const res = await inquiriesApi.listInquiries({ limit: 50 });
    inquiries.value = res.items || [];
  } catch (err: any) {
    errorMsg.value = err.response?.data?.message || 'Failed to load your inquiries.';
  } finally {
    loading.value = false;
  }
}

async function handleSubmitRFQ() {
  if (!newRFQ.value.lines[0].cableDescription.trim()) {
    alert('Please enter at least one cable specification.');
    return;
  }

  loading.value = true;
  try {
    await inquiriesApi.createInquiry({
      ...newRFQ.value,
      status: 'SUBMITTED', // Customers submit directly for review
    });
    showNewInquiryModal.value = false;
    newRFQ.value = {
      projectName: '',
      customerReference: '',
      requestedDeliveryDate: '',
      currency: 'USD',
      notes: '',
      lines: [
        {
          cableDescription: '',
          requestedLengthMeters: 1000,
          requestedQuantity: 1,
          quantityUom: 'KM',
        },
      ],
    };
    await fetchMyInquiries();
  } catch (err: any) {
    alert(err.response?.data?.message || 'Failed to submit RFQ.');
  } finally {
    loading.value = false;
  }
}

function addLine() {
  newRFQ.value.lines.push({
    cableDescription: '',
    requestedLengthMeters: 1000,
    requestedQuantity: 1,
    quantityUom: 'KM',
  });
}

function removeLine(idx: number) {
  if (newRFQ.value.lines.length > 1) {
    newRFQ.value.lines.splice(idx, 1);
  }
}

const statusBadge = (status: string) => {
  switch (status) {
    case 'SUBMITTED':
      return { label: 'Received / In Queue', class: 'bg-blue-50 text-blue-700 border-blue-200' };
    case 'UNDER_REVIEW':
      return { label: 'Engineering Review', class: 'bg-amber-50 text-amber-700 border-amber-200' };
    case 'QUOTED':
      return { label: 'Quotation Ready', class: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
    case 'CANCELLED':
      return { label: 'Cancelled', class: 'bg-slate-100 text-slate-600 border-slate-200' };
    default:
      return { label: status, class: 'bg-slate-100 text-slate-700 border-slate-200' };
  }
};

onMounted(() => {
  fetchMyInquiries();
});
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 class="text-2xl font-bold tracking-tight text-slate-900">My Inquiries & RFQs</h1>
        <p class="text-sm text-slate-500">
          Request official cable quotations, configure custom specifications, and monitor status.
        </p>
      </div>
      <div>
        <button
          @click="showNewInquiryModal = true"
          class="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-blue-700 transition-colors"
        >
          <span>＋</span>
          <span>Request New Quote</span>
        </button>
      </div>
    </div>

    <!-- Error message banner -->
    <div v-if="errorMsg" class="rounded-lg bg-red-50 p-4 text-sm text-red-700 border border-red-200">
      {{ errorMsg }}
    </div>

    <!-- Inquiries List -->
    <div class="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
      <table class="min-w-full divide-y divide-slate-200 text-left text-sm">
        <thead class="bg-slate-50 text-slate-600 text-xs font-semibold uppercase tracking-wider">
          <tr>
            <th class="px-4 py-3">Inquiry Reference</th>
            <th class="px-4 py-3">Project / PO Ref</th>
            <th class="px-4 py-3">Cables Requested</th>
            <th class="px-4 py-3">Status</th>
            <th class="px-4 py-3">Date Submitted</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          <tr v-if="loading && inquiries.length === 0">
            <td colspan="5" class="px-4 py-8 text-center text-slate-500">Loading your inquiries...</td>
          </tr>
          <tr v-else-if="inquiries.length === 0">
            <td colspan="5" class="px-4 py-8 text-center text-slate-500">
              You haven't submitted any cable inquiries yet. Click "Request New Quote" to begin!
            </td>
          </tr>
          <tr v-for="inq in inquiries" :key="inq.id" class="hover:bg-slate-50 transition-colors">
            <td class="px-4 py-3 font-semibold font-mono text-blue-600">{{ inq.inquiryNumber }}</td>
            <td class="px-4 py-3">
              <span class="font-medium text-slate-900 block">{{ inq.projectName || 'Standard RFQ' }}</span>
              <span v-if="inq.customerReference" class="text-xs text-slate-500">Ref: {{ inq.customerReference }}</span>
            </td>
            <td class="px-4 py-3 text-slate-700 font-medium">
              {{ inq._count?.lines ?? inq.lines?.length ?? 0 }} cable items
            </td>
            <td class="px-4 py-3">
              <span
                :class="[
                  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold border',
                  statusBadge(inq.status).class,
                ]"
              >
                {{ statusBadge(inq.status).label }}
              </span>
            </td>
            <td class="px-4 py-3 text-xs text-slate-500">
              {{ new Date(inq.createdAt).toLocaleDateString() }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- ── REQUEST NEW QUOTE MODAL ───────────────────────────────────────── -->
    <div
      v-if="showNewInquiryModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs"
      @click.self="showNewInquiryModal = false"
    >
      <div class="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl border border-slate-200 max-h-[90vh] overflow-y-auto">
        <div class="flex items-center justify-between border-b border-slate-100 pb-4">
          <h2 class="text-xl font-bold text-slate-900">Request a Cable Quotation</h2>
          <button
            @click="showNewInquiryModal = false"
            class="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            ✕
          </button>
        </div>

        <form @submit.prevent="handleSubmitRFQ" class="mt-4 space-y-4 text-sm">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-semibold text-slate-700 mb-1">Project Name</label>
              <input
                v-model="newRFQ.projectName"
                type="text"
                placeholder="e.g. Substation Upgrade 2026"
                class="w-full rounded-lg border border-slate-300 p-2.5 text-sm focus:border-blue-500 focus:outline-hidden"
              />
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-700 mb-1">Your PO / RFQ Reference</label>
              <input
                v-model="newRFQ.customerReference"
                type="text"
                placeholder="e.g. PO-8849"
                class="w-full rounded-lg border border-slate-300 p-2.5 text-sm focus:border-blue-500 focus:outline-hidden"
              />
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-700 mb-1">Target Delivery Date</label>
              <input
                v-model="newRFQ.requestedDeliveryDate"
                type="date"
                class="w-full rounded-lg border border-slate-300 p-2.5 text-sm focus:border-blue-500 focus:outline-hidden"
              />
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-700 mb-1">Preferred Currency</label>
              <select
                v-model="newRFQ.currency"
                class="w-full rounded-lg border border-slate-300 p-2.5 text-sm focus:border-blue-500 focus:outline-hidden"
              >
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
                <option value="GBP">GBP (£)</option>
                <option value="EGP">EGP (E£)</option>
              </select>
            </div>
          </div>

          <!-- Lines -->
          <div class="border-t border-slate-200 pt-4">
            <div class="flex items-center justify-between mb-2">
              <label class="block text-xs font-bold text-slate-800 uppercase tracking-wider">Required Cables</label>
              <button
                type="button"
                @click="addLine"
                class="text-xs font-semibold text-blue-600 hover:text-blue-800"
              >
                + Add Another Cable
              </button>
            </div>

            <div class="space-y-3">
              <div
                v-for="(line, idx) in newRFQ.lines"
                :key="idx"
                class="flex flex-col sm:flex-row gap-2 rounded-lg bg-slate-50 p-3 border border-slate-200 items-center"
              >
                <input
                  v-model="line.cableDescription"
                  type="text"
                  required
                  placeholder="Cable description (e.g. MV 18/30kV 3x240 Al/XLPE/AWA/PVC)"
                  class="flex-1 rounded-md border border-slate-300 bg-white p-2 text-xs focus:border-blue-500 focus:outline-hidden"
                />
                <input
                  v-model.number="line.requestedLengthMeters"
                  type="number"
                  placeholder="Length in meters"
                  class="w-36 rounded-md border border-slate-300 bg-white p-2 text-xs focus:border-blue-500 focus:outline-hidden"
                />
                <button
                  type="button"
                  @click="removeLine(idx)"
                  class="text-xs text-rose-500 hover:text-rose-700 p-1"
                >
                  ✕
                </button>
              </div>
            </div>
          </div>

          <div>
            <label class="block text-xs font-semibold text-slate-700 mb-1">Additional Project Specifications / Notes</label>
            <textarea
              v-model="newRFQ.notes"
              rows="3"
              placeholder="Provide any custom standards (BS, IEC), drum constraints, or delivery instructions..."
              class="w-full rounded-lg border border-slate-300 p-2.5 text-sm focus:border-blue-500 focus:outline-hidden"
            ></textarea>
          </div>

          <div class="mt-6 flex justify-end gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              @click="showNewInquiryModal = false"
              class="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              :disabled="loading"
              class="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {{ loading ? 'Submitting...' : 'Submit Request' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
