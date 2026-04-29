import assert from 'node:assert/strict';
import {
  mapLegacyLlmProvider,
  mapLegacyTranslationProvider,
} from '../frontend/components/admin/model-config/modelConfigFallback.ts';

const llmProvider = mapLegacyLlmProvider({
  id: 1,
  name: 'metadata-openai',
  base_url: 'https://api.example.com/v1',
  api_key: 'sk-test',
  proxy: null,
  pool_type: 'metadata',
  api_type: 'openai',
  request_format: 'openai_response',
  is_primary: true,
  weight: 10,
  priority: 2,
  models: 'gpt-4.1-mini',
  enabled: true,
  last_success_at: '2026-04-29T00:00:00',
  last_failure_at: null,
  last_error: null,
  avg_latency_ms: 123,
});

assert.deepEqual(llmProvider, {
  id: 1,
  target: 'metadata',
  name: 'metadata-openai',
  request_format: 'openai_response',
  base_url: 'https://api.example.com/v1',
  proxy: null,
  model: 'gpt-4.1-mini',
  priority: 2,
  enabled: true,
  has_api_key: true,
  api_key: 'sk-test',
  weight: 10,
  is_primary: true,
  last_success_at: '2026-04-29T00:00:00',
  last_failure_at: null,
  last_error: null,
  avg_latency_ms: 123,
});

assert.equal(mapLegacyLlmProvider({ ...llmProvider, pool_type: 'other' }), null);

const translationProvider = mapLegacyTranslationProvider({
  id: 3,
  name: 'translation-gemini',
  engine_type: 'gemini',
  request_format: null,
  base_url: null,
  proxy: 'http://127.0.0.1:7890',
  model: 'gemini-2.5-flash',
  priority: 1,
  qps: 4,
  pool_max_workers: null,
  no_auto_extract_glossary: true,
  disable_rich_text_translate: false,
  enabled: false,
  created_at: '2026-04-29T01:00:00',
  has_api_key: true,
});

assert.deepEqual(translationProvider, {
  id: 3,
  target: 'translation',
  name: 'translation-gemini',
  request_format: 'gemini',
  base_url: null,
  proxy: 'http://127.0.0.1:7890',
  model: 'gemini-2.5-flash',
  priority: 1,
  enabled: false,
  has_api_key: true,
  qps: 4,
  pool_max_workers: null,
  no_auto_extract_glossary: true,
  disable_rich_text_translate: false,
  created_at: '2026-04-29T01:00:00',
});
