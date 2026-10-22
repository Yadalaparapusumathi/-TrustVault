import { api, fetchCsrf } from './client';
import { ApiError } from './errors';
import type { ChangePasswordRequest, LoginRequest, Me } from './types';

export const authApi = {
  csrf: fetchCsrf,

  /** Returns the current user, or null when there is no valid session. */
  async me(signal?: AbortSignal): Promise<Me | null> {
    try {
      return await api.get<Me>('/auth/me', { signal, skipAuthRedirect: true });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return null;
      throw e;
    }
  },

  login: (body: LoginRequest) => api.post<Me>('/auth/login', body, { skipAuthRedirect: true }),
  logout: () => api.post<void>('/auth/logout', undefined, { skipAuthRedirect: true }),
  changePassword: (body: ChangePasswordRequest) => api.post<void>('/auth/change-password', body),
};
