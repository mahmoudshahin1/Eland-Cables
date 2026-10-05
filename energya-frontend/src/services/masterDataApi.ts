import api from './api';

export interface CableFilterParams {
  search?: string;
  family?: string;
  voltage?: string;
  status?: string;
  page?: number;
  limit?: number;
}

export interface RawMaterialParams {
  search?: string;
  category?: string;
  pricingCategory?: string;
  status?: string;
  page?: number;
  limit?: number;
}

export const masterDataApi = {
  async getCables(params?: CableFilterParams) {
    const res = await api.get('/master/cables', { params });
    return res.data;
  },

  async getCable(materialNumber: string) {
    const res = await api.get(`/master/cables/${encodeURIComponent(materialNumber)}`);
    return res.data;
  },

  async createCable(data: any) {
    const res = await api.post('/master/cables', data);
    return res.data;
  },

  async updateCable(materialNumber: string, data: any) {
    const res = await api.put(`/master/cables/${encodeURIComponent(materialNumber)}`, data);
    return res.data;
  },

  async getRawMaterials(params?: RawMaterialParams) {
    const res = await api.get('/master/raw-materials', { params });
    return res.data;
  },

  async getRawMaterialPrices(rawMaterialCode?: string) {
    const res = await api.get('/master/raw-material-prices', {
      params: rawMaterialCode ? { rawMaterialCode } : undefined,
    });
    return res.data;
  },

  async getBoms(params?: { materialNumber?: string; page?: number; limit?: number }) {
    const res = await api.get('/master/boms', { params });
    return res.data;
  },

  async getDrums(params?: { search?: string; page?: number; limit?: number }) {
    const res = await api.get('/master/drums', { params });
    return res.data;
  },
};

export default masterDataApi;
