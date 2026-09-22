import { apiClient } from '@/src/lib/api-client';
import type {
  DashboardDTO,
  PresetDetailDTO,
  PresetListDTO,
  PresetRequestDTO,
} from '@/src/types/api';

export function getPresets(): Promise<PresetListDTO[]> {
  return apiClient.get<PresetListDTO[]>('/api/v1/presets');
}

export function getPreset(id: number): Promise<PresetDetailDTO> {
  return apiClient.get<PresetDetailDTO>(`/api/v1/presets/${encodeURIComponent(String(id))}`);
}

export function createPreset(request: PresetRequestDTO): Promise<PresetDetailDTO> {
  return apiClient.post<PresetDetailDTO, PresetRequestDTO>('/api/v1/presets', request);
}

export function updatePreset(id: number, request: PresetRequestDTO): Promise<PresetDetailDTO> {
  return apiClient.put<PresetDetailDTO, PresetRequestDTO>(
    `/api/v1/presets/${encodeURIComponent(String(id))}`,
    request
  );
}

export function deletePreset(id: number): Promise<void> {
  return apiClient.delete<void>(`/api/v1/presets/${encodeURIComponent(String(id))}`);
}

export function getDashboard(): Promise<DashboardDTO> {
  return apiClient.get<DashboardDTO>('/api/v1/me/dashboard');
}
