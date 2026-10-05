import api from './api';

export interface InquiryFilterParams {
  search?: string;
  status?: string;
  customerId?: string;
  page?: number;
  limit?: number;
}

export const inquiriesApi = {
  async listInquiries(params?: InquiryFilterParams) {
    const res = await api.get('/inquiries', { params });
    return res.data;
  },

  async getInquiry(id: string) {
    const res = await api.get(`/inquiries/${id}`);
    return res.data;
  },

  async createInquiry(data: any) {
    const res = await api.post('/inquiries', data);
    return res.data;
  },

  async updateInquiry(id: string, data: any) {
    const res = await api.patch(`/inquiries/${id}`, data);
    return res.data;
  },

  async submitInquiry(id: string) {
    const res = await api.post(`/inquiries/${id}/submit`);
    return res.data;
  },

  async cancelInquiry(id: string, reason?: string) {
    const res = await api.post(`/inquiries/${id}/cancel`, { reason });
    return res.data;
  },

  async updateStatus(id: string, status: string) {
    const res = await api.post(`/inquiries/${id}/status`, { status });
    return res.data;
  },

  async addLine(inquiryId: string, lineData: any) {
    const res = await api.post(`/inquiries/${inquiryId}/lines`, lineData);
    return res.data;
  },

  async updateLine(inquiryId: string, lineId: string, lineData: any) {
    const res = await api.patch(`/inquiries/${inquiryId}/lines/${lineId}`, lineData);
    return res.data;
  },

  async deleteLine(inquiryId: string, lineId: string) {
    const res = await api.delete(`/inquiries/${inquiryId}/lines/${lineId}`);
    return res.data;
  },
};

export default inquiriesApi;
