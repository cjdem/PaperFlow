import { apiClient, ApiClientError } from '@/lib/apiClient';
import { loadLegacyModelConfigs } from './modelConfigFallback';
import type { ModelConfig, ModelConfigFormData, ModelTarget } from './types';

export type ModelConfigUpdatePayload = Partial<{
  name: string;
  request_format: string;
  base_url: string;
  api_key: string;
  proxy: string;
  model: string;
  priority: number;
  enabled: boolean;
  weight: number;
  is_primary: boolean;
  qps: number;
  pool_max_workers: number | null;
  no_auto_extract_glossary: boolean;
  disable_rich_text_translate: boolean;
}>;

export const modelConfigApi = {
  list: async () => {
    try {
      return await apiClient.get<ModelConfig[]>('/api/admin/model-configs');
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 404) {
        return loadLegacyModelConfigs(
          () => apiClient.get('/api/admin/llm-providers'),
          () => apiClient.get('/api/translate/providers'),
        );
      }
      throw error;
    }
  },

  create: (payload: ModelConfigFormData) =>
    apiClient.post<ModelConfig[]>('/api/admin/model-configs', payload),

  update: (target: ModelTarget, id: number, payload: ModelConfigUpdatePayload) =>
    apiClient.put<ModelConfig>(`/api/admin/model-configs/${target}/${id}`, payload),

  remove: (target: ModelTarget, id: number) =>
    apiClient.delete(`/api/admin/model-configs/${target}/${id}`),

  toggle: (target: ModelTarget, id: number) =>
    apiClient.post<{ enabled: boolean }>(`/api/admin/model-configs/${target}/${id}/toggle`),

  setPrimary: (target: ModelTarget, id: number) =>
    apiClient.post(`/api/admin/model-configs/${target}/${id}/set-primary`),

  test: (target: ModelTarget, id: number) =>
    apiClient.post<{
      success: boolean;
      message: string;
      latency_ms?: number;
      model?: string;
      request_format?: string;
      sample?: string;
    }>(`/api/admin/model-configs/${target}/${id}/test`),
};
