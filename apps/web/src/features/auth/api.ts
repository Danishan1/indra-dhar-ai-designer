import {
  acceptedResponseSchema,
  type ChangePasswordRequest,
  type LoginRequest,
  meSchema,
  type RegisterRequest,
  sessionResponseSchema,
  type UpdateMeRequest,
} from '@ai-designer/contracts';
import { z } from 'zod';

import { apiRequest } from '@/lib/api/client';

export const authApi = {
  me: (signal?: AbortSignal) =>
    apiRequest('/v1/me', { schema: meSchema, ...(signal ? { signal } : {}) }),
  updateMe: (body: UpdateMeRequest) =>
    apiRequest('/v1/me', { method: 'PATCH', body, schema: meSchema }),
  register: (body: RegisterRequest) =>
    apiRequest('/v1/auth/register', { method: 'POST', body, schema: acceptedResponseSchema }),
  verifyEmail: (token: string) =>
    apiRequest('/v1/auth/verify-email', {
      method: 'POST',
      body: { token },
      schema: z.object({ status: z.literal('verified') }),
    }),
  resendVerification: (email: string) =>
    apiRequest('/v1/auth/resend-verification', {
      method: 'POST',
      body: { email },
      schema: acceptedResponseSchema,
    }),
  login: (body: LoginRequest) =>
    apiRequest('/v1/auth/login', { method: 'POST', body, schema: sessionResponseSchema }),
  logout: () => apiRequest('/v1/auth/logout', { method: 'POST' }),
  forgotPassword: (email: string) =>
    apiRequest('/v1/auth/password/forgot', {
      method: 'POST',
      body: { email },
      schema: acceptedResponseSchema,
    }),
  resetPassword: (token: string, newPassword: string) =>
    apiRequest('/v1/auth/password/reset', {
      method: 'POST',
      body: { token, newPassword },
      schema: z.object({ status: z.literal('password_reset') }),
    }),
  changePassword: (body: ChangePasswordRequest) =>
    apiRequest('/v1/auth/password/change', { method: 'POST', body }),
};
