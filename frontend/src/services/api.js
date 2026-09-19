import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000,
});

// Interceptor para inyectar token de autenticación JWT
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('prisma_lab_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Interceptor para manejo global de errores
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token inválido o expirado
      const currentToken = localStorage.getItem('prisma_lab_token');
      if (currentToken && !window.location.pathname.includes('/login')) {
        localStorage.removeItem('prisma_lab_token');
        localStorage.removeItem('prisma_lab_user');
        window.location.reload();
      }
    }
    console.error('API Error:', error.response ? error.response.data : error.message);
    return Promise.reject(error);
  }
);

// Services por módulo
export const configService = {
  getConfigs: () => api.get('/config'),
  updateConfig: (data) => api.post('/config', data),
  getDiscounts: () => api.get('/config/discounts'),
  createDiscount: (data) => api.post('/config/discounts', data),
  updateDiscount: (id, data) => api.put(`/config/discounts/${id}`, data),
  deleteDiscount: (id) => api.delete(`/config/discounts/${id}`),
};

export const inventoryService = {
  getMaterials: (params) => api.get('/inventory/materials', { params }),
  createMaterial: (data) => api.post('/inventory/materials', data),
  updateMaterial: (id, data) => api.put(`/inventory/materials/${id}`, data),
  deleteMaterial: (id) => api.delete(`/inventory/materials/${id}`),
  
  getProducts: () => api.get('/inventory/products'),
  createProduct: (data) => api.post('/inventory/products', data),
  sellProduct: (id, data) => api.post(`/inventory/products/${id}/sell`, data),
  deleteProduct: (id) => api.delete(`/inventory/products/${id}`),

  getAdditionalSupplies: (params) => api.get('/inventory/additional-supplies', { params }),
  createAdditionalSupply: (data) => api.post('/inventory/additional-supplies', data),
  updateAdditionalSupply: (id, data) => api.put(`/inventory/additional-supplies/${id}`, data),
  deleteAdditionalSupply: (id) => api.delete(`/inventory/additional-supplies/${id}`),
};

export const productionService = {
  calculate: (data) => api.post('/production/calculate', data),
  getHistory: () => api.get('/production'),
  getNextCode: () => api.get('/production/next-code'),
  deleteCalculation: (id) => api.delete(`/production/${id}`),
  updateCalculation: (id, data) => api.put(`/production/${id}`, data),
};

export const salesService = {
  getCustomers: () => api.get('/sales/customers'),
  createCustomer: (data) => api.post('/sales/customers', data),
  updateCustomer: (id, data) => api.put(`/sales/customers/${id}`, data),
  deleteCustomer: (id) => api.delete(`/sales/customers/${id}`),
  getDocuments: (docType) => api.get('/sales/documents', { params: { doc_type: docType } }),
  createDocument: (data) => api.post('/sales/documents', data),
  convertToInvoice: (id, payload) => api.post(`/sales/documents/${id}/convert-to-invoice`, payload),
  updateDocumentDate: (id, data) => api.put(`/sales/documents/${id}/date`, data),
  deleteDocument: (id) => api.delete(`/sales/documents/${id}`),
};

export const accountingService = {
  getPuc: () => api.get('/accounting/puc'),
  createPuc: (data) => api.post('/accounting/puc', data),
  deletePuc: (id) => api.delete(`/accounting/puc/${id}`),
  getJournal: (params) => api.get('/accounting/journal', { params }),
  createJournal: (data) => api.post('/accounting/journal', data),
  deleteJournal: (entryNumber) => api.delete(`/accounting/journal/${entryNumber}`),
  getCashFlow: () => api.get('/accounting/cashflow'),
  createCashFlow: (data) => api.post('/accounting/cashflow', data),
  deleteCashFlow: (id) => api.delete(`/accounting/cashflow/${id}`),
  getPnlReport: () => api.get('/accounting/reports/pnl'),
  getBalanceReport: () => api.get('/accounting/reports/balance'),
  getMonthlyTrend: () => api.get('/accounting/reports/monthly-trend'),
  getMonthlyCashFlow: (params) => api.get('/accounting/reports/monthly-cashflow', { params }),
  getMonthlyPnl: (params) => api.get('/accounting/reports/monthly-pnl', { params }),
  getBalanceGeneral: (params) => api.get('/accounting/reports/balance-general', { params }),
};

export const authService = {
  login: (username, password) => api.post('/auth/login', { username, password }),
  getMe: () => api.get('/auth/me'),
  changePassword: (data) => api.post('/auth/change-password', data),
  getUsers: () => api.get('/auth/users'),
  createUser: (data) => api.post('/auth/users', data),
  updateUser: (id, data) => api.put(`/auth/users/${id}`, data),
  resetUserPassword: (id, new_password) => api.post(`/auth/users/${id}/reset-password`, { new_password }),
  deleteUser: (id) => api.delete(`/auth/users/${id}`),
  getAuditLogs: (params) => api.get('/auth/audit-logs', { params }),
};

export default api;
