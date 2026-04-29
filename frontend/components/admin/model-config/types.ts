export type ModelTarget = 'metadata' | 'analysis' | 'translation';

export interface ModelTargetOptions {
  target: ModelTarget;
  priority: number;
  enabled: boolean;
  weight: number;
  is_primary: boolean;
  qps: number;
  pool_max_workers: number | null;
  no_auto_extract_glossary: boolean;
  disable_rich_text_translate: boolean;
}

export interface ModelConfig {
  id: number;
  target: ModelTarget;
  name: string;
  request_format: string;
  base_url: string | null;
  proxy: string | null;
  model: string;
  priority: number;
  enabled: boolean;
  has_api_key: boolean;
  api_key?: string | null;
  weight?: number | null;
  is_primary?: boolean | null;
  qps?: number | null;
  pool_max_workers?: number | null;
  no_auto_extract_glossary?: boolean | null;
  disable_rich_text_translate?: boolean | null;
  last_success_at?: string | null;
  last_failure_at?: string | null;
  last_error?: string | null;
  avg_latency_ms?: number | null;
  created_at?: string | null;
}

export interface ModelConfigFormData {
  name: string;
  request_format: string;
  base_url: string;
  proxy: string;
  api_key: string;
  model: string;
  targets: ModelTargetOptions[];
}

export const MODEL_TARGET_LABELS: Record<ModelTarget, string> = {
  metadata: '元数据提取',
  analysis: '深度分析',
  translation: 'PDF 翻译',
};

export const MODEL_TARGET_DESCRIPTIONS: Record<ModelTarget, string> = {
  metadata: '提取论文标题、作者、期刊等信息，适合响应快的小模型。',
  analysis: '生成摘要和深度分析，适合推理能力更强的模型。',
  translation: '执行 PDF 全文翻译，包含 QPS 与并发等翻译专属参数。',
};

export const MODEL_TARGETS: ModelTarget[] = ['metadata', 'analysis', 'translation'];

