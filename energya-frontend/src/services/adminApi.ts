import api from './api';

export interface UserFilterParams {
  search?: string;
  userType?: string;
  status?: string;
  page?: number;
  limit?: number;
}

export interface CustomerFilterParams {
  search?: string;
  status?: string;
  page?: number;
  limit?: number;
}

export const adminApi = {
  // ── Users ─────────────────────────────────────────────────────────────
  async listUsers(params?: UserFilterParams) {
    const res = await api.get('/admin/users', { params });
    return res.data;
  },

  async getUser(id: string) {
    const res = await api.get(`/admin/users/${id}`);
    return res.data;
  },

  async createUser(data: any) {
    const res = await api.post('/admin/users', data);
    return res.data;
  },

  async updateUser(id: string, data: any) {
    const res = await api.patch(`/admin/users/${id}`, data);
    return res.data;
  },

  async lockUser(id: string) {
    const res = await api.post(`/admin/users/${id}/lock`);
    return res.data;
  },

  async unlockUser(id: string) {
    const res = await api.post(`/admin/users/${id}/unlock`);
    return res.data;
  },

  async resetPassword(id: string, newPassword?: string) {
    const res = await api.post(`/admin/users/${id}/reset-password`, { newPassword });
    return res.data;
  },

  // ── Roles ─────────────────────────────────────────────────────────────
  async listRoles() {
    const res = await api.get('/admin/roles');
    return res.data;
  },

  // ── Customers ─────────────────────────────────────────────────────────
  async listCustomers(params?: CustomerFilterParams) {
    const res = await api.get('/admin/customers', { params });
    return res.data;
  },

  async getCustomer(id: string) {
    const res = await api.get(`/admin/customers/${id}`);
    return res.data;
  },

  async createCustomer(data: any) {
    const res = await api.post('/admin/customers', data);
    return res.data;
  },

  async updateCustomer(id: string, data: any) {
    const res = await api.patch(`/admin/customers/${id}`, data);
    return res.data;
  },

  async assignUser(customerId: string, userId: string) {
    const res = await api.post(`/admin/customers/${customerId}/assign-user`, { userId });
    return res.data;
  },
};

export default adminApi;
