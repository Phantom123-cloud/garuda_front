import axios from 'axios';

export const api = axios.create({ baseURL: '/api', withCredentials: true });

// Redirect to login on 401
api.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.status === 401 && typeof window !== 'undefined') {
      const path = window.location.pathname;
      if (path !== '/login' && path !== '/operator-login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  },
);

// ─── Auth ─────────────────────────────────────────────────────────────────────
export const authApi = {
  login: (login: string, password: string) =>
    api.post('/auth/login', { login, password }).then(r => r.data),
  operatorLogin: (login: string, password: string) =>
    api.post('/auth/operator-login', { login, password }).then(r => r.data),
  logout: () => api.post('/auth/logout').then(r => r.data),
  operatorLogout: () => api.post('/auth/operator-logout').then(r => r.data),
  me: () => api.get('/auth/me').then(r => r.data),
  operatorMe: () => api.get('/auth/operator-me').then(r => r.data),
};

// ─── Teams ────────────────────────────────────────────────────────────────────
export const teamsApi = {
  getAll: () => api.get('/teams').then(r => r.data),
  getOne: (id: number) => api.get(`/teams/${id}`).then(r => r.data),
  create: (data: any) => api.post('/teams', data).then(r => r.data),
  update: (id: number, data: any) => api.patch(`/teams/${id}`, data).then(r => r.data),
  toggleStatus: (id: number) => api.patch(`/teams/${id}/toggle-status`).then(r => r.data),
  remove: (id: number) => api.delete(`/teams/${id}`),
};

// ─── Operators ────────────────────────────────────────────────────────────────
export const operatorsApi = {
  getAll: (teamId?: number) => api.get('/operators', { params: teamId ? { teamId } : {} }).then(r => r.data),
  getOne: (id: number) => api.get(`/operators/${id}`).then(r => r.data),
  create: (data: any) => api.post('/operators', data).then(r => r.data),
  update: (id: number, data: any) => api.patch(`/operators/${id}`, data).then(r => r.data),
  toggleStatus: (id: number) => api.patch(`/operators/${id}/toggle-status`).then(r => r.data),
  remove: (id: number) => api.delete(`/operators/${id}`),
  setActiveCampaign: (id: number, campaignId: number | null) =>
    api.patch(`/operators/${id}/active-campaign`, { campaignId }).then(r => r.data),
  setAvailable: (id: number, available: boolean) =>
    api.patch(`/operators/${id}/available`, { available }).then(r => r.data),
  setOnlineStatus: (id: number, onlineStatus: string, pauseReasonLabel?: string | null) =>
    api.patch(`/operators/${id}/online-status`, { onlineStatus, pauseReasonLabel }).then(r => r.data),
};

// ─── Users ────────────────────────────────────────────────────────────────────
export const usersApi = {
  getAll: () => api.get('/users').then(r => r.data),
  create: (data: any) => api.post('/users', data).then(r => r.data),
  update: (id: number, data: any) => api.patch(`/users/${id}`, data).then(r => r.data),
  toggleStatus: (id: number) => api.patch(`/users/${id}/toggle-status`).then(r => r.data),
  remove: (id: number) => api.delete(`/users/${id}`),
};

// ─── Pause Reasons ────────────────────────────────────────────────────────────
export const pauseReasonsApi = {
  getAll: () => api.get('/pause-reasons').then(r => r.data),
  getActive: () => api.get('/pause-reasons/active').then(r => r.data),
  create: (data: { label: string; order?: number }) => api.post('/pause-reasons', data).then(r => r.data),
  update: (id: number, data: { label?: string; order?: number; active?: boolean }) => api.patch(`/pause-reasons/${id}`, data).then(r => r.data),
  remove: (id: number) => api.delete(`/pause-reasons/${id}`),
};

// ─── Roles ────────────────────────────────────────────────────────────────────
export const rolesApi = {
  getAll: () => api.get('/roles').then(r => r.data),
  create: (data: { name: string; permissions: string[] }) => api.post('/roles', data).then(r => r.data),
  update: (id: number, data: { name?: string; permissions?: string[] }) => api.patch(`/roles/${id}`, data).then(r => r.data),
  remove: (id: number) => api.delete(`/roles/${id}`),
};

// ─── Campaigns ────────────────────────────────────────────────────────────────
export const campaignsApi = {
  getAll: () => api.get('/campaigns').then(r => r.data),
  getOne: (id: number) => api.get(`/campaigns/${id}`).then(r => r.data),
  create: (data: any) => api.post('/campaigns', data).then(r => r.data),
  update: (id: number, data: any) => api.patch(`/campaigns/${id}`, data).then(r => r.data),
  toggleStatus: (id: number) => api.patch(`/campaigns/${id}/toggle-status`).then(r => r.data),
  setStatus: (id: number, status: 'ACTIVE' | 'STOPPED' | 'BLOCKED') =>
    api.patch(`/campaigns/${id}/set-status`, { status }).then(r => r.data),
  remove: (id: number) => api.delete(`/campaigns/${id}`),
  getResultCounts: (id: number): Promise<Record<string, number>> =>
    api.get(`/campaigns/${id}/result-counts`).then(r => r.data),
};

// ─── Dialer ───────────────────────────────────────────────────────────────────
export const dialerApi = {
  start:  (campaignId: number) => api.post(`/dialer/campaigns/${campaignId}/start`).then(r => r.data),
  stop:   (campaignId: number) => api.post(`/dialer/campaigns/${campaignId}/stop`).then(r => r.data),
  status: (campaignId: number) => api.get(`/dialer/campaigns/${campaignId}/status`).then(r => r.data),
  manualCall: (numberId: number, campaignId: number) =>
    api.post('/dialer/manual-call', { numberId, campaignId }).then(r => r.data),
  callPhone: (phone: string, campaignId: number) =>
    api.post('/dialer/call-phone', { phone, campaignId }).then(r => r.data),
};

// ─── Forms ────────────────────────────────────────────────────────────────────
export const formsApi = {
  getAll: () => api.get('/forms').then(r => r.data),
  getOne: (id: number) => api.get(`/forms/${id}`).then(r => r.data),
  create: (data: any) => api.post('/forms', data).then(r => r.data),
  update: (id: number, data: any) => api.put(`/forms/${id}`, data).then(r => r.data),
  remove: (id: number) => api.delete(`/forms/${id}`),
};

// ─── Providers ────────────────────────────────────────────────────────────────
export const providersApi = {
  getAll: () => api.get('/providers').then(r => r.data),
  create: (data: any) => api.post('/providers', data).then(r => r.data),
  update: (id: number, data: any) => api.patch(`/providers/${id}`, data).then(r => r.data),
  toggleStatus: (id: number) => api.patch(`/providers/${id}/toggle-status`).then(r => r.data),
  remove: (id: number) => api.delete(`/providers/${id}`),
};

// ─── Calls ────────────────────────────────────────────────────────────────────
export const callsApi = {
  getAll: (params?: { campaignId?: number; operatorId?: number; limit?: number; offset?: number }) =>
    api.get('/calls', { params }).then(r => r.data),
  count: (params?: { campaignId?: number; operatorId?: number }) =>
    api.get('/calls/count', { params }).then(r => r.data),
  getStats: () => api.get('/calls/stats').then(r => r.data),
  getCampaignStats: (campaignId: number) =>
    api.get(`/calls/campaign/${campaignId}/stats`).then(r => r.data),
  getOperatorToday: (operatorId: number) =>
    api.get(`/calls/operator/${operatorId}/today`).then(r => r.data),
  getCampaignCalls: (campaignId: number, page = 1, operatorId?: number) =>
    api.get('/calls', { params: { campaignId, ...(operatorId ? { operatorId } : {}), limit: 20, offset: (page - 1) * 20 } }).then(r => r.data),
  getGroupedByPhone: (campaignId: number, page = 1, operatorId?: number) =>
    api.get(`/calls/campaign/${campaignId}/grouped`, { params: { page, ...(operatorId ? { operatorId } : {}) } }).then(r => r.data),
  getByPhone: (phone: string, limit = 20) =>
    api.get('/calls', { params: { phone, limit } }).then(r => r.data),
  updateFormData: (callId: number, data: { result?: string; formData?: any }) =>
    api.patch(`/calls/${callId}/form-data`, data).then(r => r.data),
  manualEntry: (data: { campaignId: number; phone: string; formData?: any; result?: string }) =>
    api.post('/calls/manual-entry', data).then(r => r.data),
  exportBilling: (campaignId: number) =>
    api.get(`/calls/campaign/${campaignId}/export-billing`).then(r => r.data),
};

// ─── Reports ─────────────────────────────────────────────────────────────────
export const reportsApi = {
  getFilterOptions: () => api.get('/reports/filter-options').then(r => r.data),
  getCalls: (params: {
    dateFrom: string;
    dateTo: string;
    groupBy: 'operator' | 'campaign' | 'day' | 'team';
    operatorIds?: number[];
    campaignIds?: number[];
    teamIds?: number[];
  }) => {
    const p: Record<string, any> = {
      dateFrom: params.dateFrom,
      dateTo: params.dateTo,
      groupBy: params.groupBy,
    };
    if (params.operatorIds?.length) p.operatorIds = params.operatorIds;
    if (params.campaignIds?.length) p.campaignIds = params.campaignIds;
    if (params.teamIds?.length) p.teamIds = params.teamIds;
    return api.get('/reports/calls', { params: p }).then(r => r.data);
  },
};

// ─── Scripts ──────────────────────────────────────────────────────────────────
export const scriptsApi = {
  getAll: () => api.get('/scripts').then(r => r.data),
  getOne: (id: number) => api.get(`/scripts/${id}`).then(r => r.data),
  create: (data: any) => api.post('/scripts', data).then(r => r.data),
  update: (id: number, data: any) => api.patch(`/scripts/${id}`, data).then(r => r.data),
  toggleStatus: (id: number) => api.patch(`/scripts/${id}/toggle-status`).then(r => r.data),
  remove: (id: number) => api.delete(`/scripts/${id}`),
};

// ─── Blacklist ────────────────────────────────────────────────────────────────
export const blacklistApi = {
  getAll: (search?: string) => api.get('/blacklist', { params: search ? { search } : {} }).then(r => r.data),
  add: (data: { phone: string; reason?: string }) => api.post('/blacklist', data).then(r => r.data),
  addBulk: (phones: string[], reason?: string) => api.post('/blacklist', { phones, reason }).then(r => r.data),
  remove: (id: number) => api.delete(`/blacklist/${id}`),
};

// ─── Numbers (CampaignNumbers) ────────────────────────────────────────────────
export interface PhoneEntry { phone: string; data?: Record<string, string> }

export const numbersApi = {
  getByCampaign: (campaignId: number, page = 1) =>
    api.get(`/numbers/campaign/${campaignId}`, { params: { page, limit: 100 } }).then(r => r.data),
  getPending: (campaignId: number, page = 1, limit = 50) =>
    api.get(`/numbers/campaign/${campaignId}`, { params: { page, limit, pending: true } }).then(r => r.data),
  add: (campaignId: number, phones: string[], opts?: { filename?: string; initiator?: string }) =>
    api.post(`/numbers/campaign/${campaignId}`, { phones, ...opts }).then(r => r.data),
  addWithData: (campaignId: number, entries: PhoneEntry[], opts?: { filename?: string; initiator?: string }) =>
    api.post(`/numbers/campaign/${campaignId}`, { entries, ...opts }).then(r => r.data),
  remove: (id: number) => api.delete(`/numbers/${id}`),
  clear: (campaignId: number) => api.delete(`/numbers/campaign/${campaignId}/clear`),
  getStats: (campaignId: number) =>
    api.get(`/numbers/campaign/${campaignId}/stats`).then(r => r.data),
  deleteBulk: (campaignId: number, phones: string[], opts?: { filename?: string; initiator?: string }) =>
    api.post(`/numbers/campaign/${campaignId}/delete-bulk`, { phones, ...opts }).then(r => r.data),
  resetByDialResult: (campaignId: number, dialResult: string | null) =>
    api.post(`/numbers/campaign/${campaignId}/reset-by-dial-result`, { dialResult }).then(r => r.data),
  resetByAgentResult: (campaignId: number, agentResult: string | null) =>
    api.post(`/numbers/campaign/${campaignId}/reset-by-agent-result`, { agentResult }).then(r => r.data),
  getPhonesByDialResult: (campaignId: number, dialResult: string) =>
    api.get(`/numbers/campaign/${campaignId}/phones-by-dial-result`, { params: { dialResult } }).then(r => r.data),
  getPhonesByAgentResult: (campaignId: number, result: string) =>
    api.get(`/numbers/campaign/${campaignId}/phones-by-agent-result`, { params: { result } }).then(r => r.data),
  exportNumbers: (campaignId: number, dialResult?: string) =>
    api.get(`/numbers/campaign/${campaignId}/export`, { params: dialResult ? { dialResult } : {} }).then(r => r.data),
  getCallbacks: () =>
    api.get('/numbers/callbacks').then(r => r.data),
};

// ─── Import Logs ──────────────────────────────────────────────────────────────
export const importLogsApi = {
  getAll: (campaignId?: number) =>
    api.get('/import-logs', { params: campaignId ? { campaignId } : {} }).then(r => r.data),
};

// ─── Monitor ─────────────────────────────────────────────────────────────────
export const monitorApi = {
  getData: () => api.get('/operators/monitor').then(r => r.data),
  kick: (operatorId: number) => api.patch(`/operators/${operatorId}/kick`).then(r => r.data),
  setBreak: (operatorId: number, pauseReasonLabel: string) =>
    api.patch(`/operators/${operatorId}/set-break`, { pauseReasonLabel }).then(r => r.data),
  moveToCampaign: (operatorId: number, campaignId: number) =>
    api.patch(`/operators/${operatorId}/move-campaign`, { campaignId }).then(r => r.data),
};

// ─── Messages ─────────────────────────────────────────────────────────────────
export const messagesApi = {
  send: (toId: number, body: string) => api.post('/messages', { toId, body }).then(r => r.data),
  getSent: () => api.get('/messages/sent').then(r => r.data),
  getMy: (unread = false) => api.get('/messages/my', { params: unread ? { unread: 'true' } : {} }).then(r => r.data),
  markRead: (id: number) => api.patch(`/messages/${id}/read`).then(r => r.data),
  markAllRead: (operatorId: number) => api.patch(`/messages/mark-all-read/${operatorId}`).then(r => r.data),
};

// ─── Types ────────────────────────────────────────────────────────────────────
export interface Team {
  id: number; name: string; manager?: { id: number; name: string } | null;
  managerId?: number | null; status: 'ACTIVE' | 'BLOCKED'; createdAt: string;
  _count?: { operators: number };
}
export interface Operator {
  id: number; name: string; login: string; extension?: string | null;
  team?: { id: number; name: string } | null;
  teamId?: number | null; status: 'ACTIVE' | 'BLOCKED'; createdAt: string;
  canReceiveInbound?: boolean;
}
export interface Role {
  id: number; name: string; permissions: string[];
  createdAt: string; updatedAt: string;
  _count?: { users: number };
}
export interface User {
  id: number; name: string; login: string;
  status: 'ACTIVE' | 'BLOCKED'; createdAt: string;
  customRoleId?: number | null;
  customRole?: { id: number; name: string; permissions: string[] } | null;
  permissions?: string[];
}
export interface PauseReason {
  id: number; label: string; order: number; active: boolean; createdAt: string;
}

export interface Campaign {
  id: number; name: string; dialMode: 'PREDICTIVE' | 'PROGRESSIVE' | 'MANUAL';
  dialOverheadPct: number; maxAttempts: number; retryInterval: number;
  timeFrom: string; timeTo: string;
  forcedConnection?: boolean;
  allowInbound?: boolean;
  isGeneralInbound?: boolean;
  acwTimeout?: number | null;
  resultLimits?: Record<string, number> | null;
  provider?: { id: number; name: string } | null;
  form?: { id: number; name: string } | null;
  script?: { id: number; name: string } | null;
  campaignTeams?: { team: { id: number; name: string } }[];
  status: 'ACTIVE' | 'STOPPED' | 'BLOCKED'; createdAt: string;
  _count?: { numbers: number; calls: number };
}
export interface Form {
  id: number; name: string; createdAt: string;
  fields: FormField[];
}
export interface FormField {
  id: number; formId: number; label: string;
  type: 'NUMBER' | 'STRING' | 'NOTE' | 'CHECKBOX' | 'DATE_EVENT' | 'DATE_CALLBACK' | 'DROPDOWN' | 'RESULT';
  order: number; required: boolean; config?: any;
}
export type ProviderType = 'SIP_REGISTRATION' | 'SIP_PEER' | 'IAX2';

export interface Provider {
  id: number;
  type: ProviderType;
  name: string;
  host: string;
  port: number;
  login?: string | null;
  transport: string;
  maxChannels: number;
  callerIds: string[];
  status: 'ACTIVE' | 'BLOCKED';
  createdAt: string;
}
export interface Call {
  id: number; phone: string; startedAt: string; answeredAt?: string | null;
  endedAt?: string | null; duration?: number | null; result?: string | null;
  operator?: { id: number; name: string } | null;
  campaign?: { id: number; name: string } | null;
  recording?: { id: number; filePath: string; fileSize?: number | null } | null;
}

export type CreateTeamPayload = { name: string; managerId?: number | null };
export type CreateOperatorPayload = { name: string; login: string; password: string; extension?: string; teamId?: number | null; canReceiveInbound?: boolean };

// ─── Platform Admin API ───────────────────────────────────────────────────────
export const platformApi = axios.create({ baseURL: '/api', withCredentials: true });

platformApi.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.status === 401 && typeof window !== 'undefined') {
      const path = window.location.pathname;
      if (path.startsWith('/platform') && path !== '/platform/login') {
        window.location.href = '/platform/login';
      }
    }
    return Promise.reject(err);
  },
);

export const platformAuthApi = {
  login: (login: string, password: string) =>
    platformApi.post('/platform/auth/login', { login, password }).then(r => r.data),
  logout: () => platformApi.post('/platform/auth/logout').then(r => r.data),
  me: () => platformApi.get('/platform/auth/me').then(r => r.data),
};

export type WorkspaceStatus = 'ACTIVE' | 'BLOCKED' | 'SUSPENDED';
export interface Workspace {
  id: number;
  name: string;
  slug: string;
  status: WorkspaceStatus;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { users: number };
}

export const workspacesApi = {
  getAll: () => platformApi.get('/platform/workspaces').then(r => r.data as Workspace[]),
  getOne: (id: number) => platformApi.get(`/platform/workspaces/${id}`).then(r => r.data as Workspace),
  getStats: () => platformApi.get('/platform/workspaces/stats').then(r => r.data),
  create: (data: { name: string; slug: string; expiresAt?: string }) =>
    platformApi.post('/platform/workspaces', data).then(r => r.data as Workspace),
  update: (id: number, data: { name?: string; expiresAt?: string }) =>
    platformApi.patch(`/platform/workspaces/${id}`, data).then(r => r.data as Workspace),
  setStatus: (id: number, status: WorkspaceStatus) =>
    platformApi.patch(`/platform/workspaces/${id}/status`, { status }).then(r => r.data as Workspace),
  remove: (id: number) => platformApi.delete(`/platform/workspaces/${id}`),
};
