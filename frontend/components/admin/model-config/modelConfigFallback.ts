import type { ModelConfig, ModelTarget } from './types';

interface LegacyLlmProvider {
  id: number;
  name: string;
  base_url: string | null;
  api_key?: string | null;
  proxy?: string | null;
  pool_type: string;
  api_type?: string | null;
  request_format?: string | null;
  is_primary: boolean;
  weight: number;
  priority: number;
  models: string;
  enabled: boolean;
  last_success_at?: string | null;
  last_failure_at?: string | null;
  last_error?: string | null;
  avg_latency_ms?: number | null;
}

interface LegacyTranslationProvider {
  id: number;
  name: string;
  engine_type?: string | null;
  request_format?: string | null;
  base_url: string | null;
  proxy?: string | null;
  model: string | null;
  priority: number;
  qps: number;
  pool_max_workers: number | null;
  no_auto_extract_glossary: boolean;
  disable_rich_text_translate: boolean;
  enabled: boolean;
  created_at?: string | null;
  has_api_key?: boolean;
}

const LLM_TARGETS = new Set<ModelTarget>(['metadata', 'analysis']);

export function mapLegacyLlmProvider(provider: LegacyLlmProvider): ModelConfig | null {
  const target = provider.pool_type as ModelTarget;
  if (!LLM_TARGETS.has(target)) return null;

  return {
    id: provider.id,
    target,
    name: provider.name,
    request_format: provider.request_format || provider.api_type || 'openai',
    base_url: provider.base_url,
    proxy: provider.proxy ?? null,
    model: provider.models,
    priority: provider.priority,
    enabled: provider.enabled,
    has_api_key: Boolean(provider.api_key),
    api_key: provider.api_key ?? null,
    weight: provider.weight,
    is_primary: provider.is_primary,
    last_success_at: provider.last_success_at ?? null,
    last_failure_at: provider.last_failure_at ?? null,
    last_error: provider.last_error ?? null,
    avg_latency_ms: provider.avg_latency_ms ?? null,
  };
}

export function mapLegacyTranslationProvider(provider: LegacyTranslationProvider): ModelConfig {
  return {
    id: provider.id,
    target: 'translation',
    name: provider.name,
    request_format: provider.request_format || provider.engine_type || 'openai',
    base_url: provider.base_url,
    proxy: provider.proxy ?? null,
    model: provider.model || '',
    priority: provider.priority,
    enabled: provider.enabled,
    has_api_key: Boolean(provider.has_api_key),
    qps: provider.qps,
    pool_max_workers: provider.pool_max_workers,
    no_auto_extract_glossary: provider.no_auto_extract_glossary,
    disable_rich_text_translate: provider.disable_rich_text_translate,
    created_at: provider.created_at ?? null,
  };
}

export async function loadLegacyModelConfigs(
  getLlmProviders: () => Promise<LegacyLlmProvider[]>,
  getTranslationProviders: () => Promise<{ providers: LegacyTranslationProvider[] }>,
): Promise<ModelConfig[]> {
  const [llmProviders, translationData] = await Promise.all([
    getLlmProviders(),
    getTranslationProviders(),
  ]);

  return [
    ...llmProviders.map(mapLegacyLlmProvider).filter((item): item is ModelConfig => item !== null),
    ...translationData.providers.map(mapLegacyTranslationProvider),
  ];
}
