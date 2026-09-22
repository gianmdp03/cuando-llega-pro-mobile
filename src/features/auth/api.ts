import type { AuthRequest, AuthResponse, RegisterRequest } from '@/src/types/api';

import { apiClient } from '@/src/lib/api-client';

export function login(request: AuthRequest): Promise<AuthResponse> {
  return apiClient.post<AuthResponse, AuthRequest>('/api/v1/auth/login', request);
}

export function register(request: RegisterRequest): Promise<AuthResponse> {
  return apiClient.post<AuthResponse, RegisterRequest>('/api/v1/auth/register', request);
}
