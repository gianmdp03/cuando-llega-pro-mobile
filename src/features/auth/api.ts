import type {
  AdminCreateUserRequest,
  AuthRequest,
  AuthResponse,
  AuthenticatedUser,
} from '@/src/types/api';

import { apiClient } from '@/src/lib/api-client';

export function login(request: AuthRequest): Promise<AuthResponse> {
  return apiClient.post<AuthResponse, AuthRequest>('/api/v1/auth/login', request);
}

export function createUserAdmin(request: AdminCreateUserRequest): Promise<AuthenticatedUser> {
  return apiClient.post<AuthenticatedUser, AdminCreateUserRequest>('/api/v1/admin/users', request);
}
