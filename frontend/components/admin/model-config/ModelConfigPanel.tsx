'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ModelProviderForm, createTargetOptions } from './ModelProviderForm';
import { ModelTargetSection } from './ModelTargetSection';
import { modelConfigApi } from './modelConfigApi';
import { MODEL_TARGETS } from './types';
import type { ModelConfig, ModelConfigFormData, ModelTarget } from './types';

const createEmptyFormData = (target: ModelTarget): ModelConfigFormData => ({
  name: '',
  request_format: 'openai',
  base_url: '',
  proxy: '',
  api_key: '',
  model: '',
  targets: [createTargetOptions(target)],
});

const formDataFromConfig = (config: ModelConfig): ModelConfigFormData => ({
  name: config.name,
  request_format: config.request_format,
  base_url: config.base_url || '',
  proxy: config.proxy || '',
  api_key: '',
  model: config.model,
  targets: [{
    target: config.target,
    priority: config.priority,
    enabled: config.enabled,
    weight: config.weight ?? 10,
    is_primary: Boolean(config.is_primary),
    qps: config.qps ?? 4,
    pool_max_workers: config.pool_max_workers ?? null,
    no_auto_extract_glossary: Boolean(config.no_auto_extract_glossary),
    disable_rich_text_translate: Boolean(config.disable_rich_text_translate),
  }],
});

export function ModelConfigPanel() {
  const [configs, setConfigs] = useState<ModelConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState<ModelConfigFormData | null>(null);
  const [editingConfig, setEditingConfig] = useState<ModelConfig | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [testingId, setTestingId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadConfigs = useCallback(async () => {
    try {
      const data = await modelConfigApi.list();
      setConfigs(data);
      setLoadError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : '加载模型配置失败';
      setLoadError(message);
      console.error('加载模型配置失败:', error);
    }
  }, []);

  useEffect(() => {
    loadConfigs().finally(() => setLoading(false));
  }, [loadConfigs]);

  const grouped = useMemo(() => ({
    metadata: configs.filter(item => item.target === 'metadata'),
    analysis: configs.filter(item => item.target === 'analysis'),
    translation: configs.filter(item => item.target === 'translation'),
  }), [configs]);

  const handleAdd = (target: ModelTarget) => {
    setEditingConfig(null);
    setSaveStatus('idle');
    setFormData(createEmptyFormData(target));
  };

  const handleEdit = (config: ModelConfig) => {
    setEditingConfig(config);
    setSaveStatus('idle');
    setFormData(formDataFromConfig(config));
  };

  const resetForm = () => {
    setEditingConfig(null);
    setFormData(null);
    setSaveStatus('idle');
  };

  const save = async () => {
    if (!formData) return;
    setSaveStatus('saving');
    try {
      if (editingConfig) {
        const targetOptions = formData.targets[0];
        await modelConfigApi.update(editingConfig.target, editingConfig.id, {
          name: formData.name,
          request_format: formData.request_format,
          base_url: formData.base_url,
          proxy: formData.proxy,
          api_key: formData.api_key,
          model: formData.model,
          priority: targetOptions.priority,
          enabled: targetOptions.enabled,
          weight: targetOptions.weight,
          is_primary: targetOptions.is_primary,
          qps: targetOptions.qps,
          pool_max_workers: targetOptions.pool_max_workers,
          no_auto_extract_glossary: targetOptions.no_auto_extract_glossary,
          disable_rich_text_translate: targetOptions.disable_rich_text_translate,
        });
      } else {
        await modelConfigApi.create(formData);
      }
      await loadConfigs();
      setSaveStatus('saved');
      resetForm();
    } catch (error) {
      console.error('保存模型配置失败:', error);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  };

  const remove = async (config: ModelConfig) => {
    if (!confirm('确定要删除这个模型配置吗？')) return;
    await modelConfigApi.remove(config.target, config.id);
    await loadConfigs();
  };

  const toggle = async (config: ModelConfig) => {
    await modelConfigApi.toggle(config.target, config.id);
    await loadConfigs();
  };

  const setPrimary = async (config: ModelConfig) => {
    await modelConfigApi.setPrimary(config.target, config.id);
    await loadConfigs();
  };

  const test = async (config: ModelConfig) => {
    const key = `${config.target}:${config.id}`;
    setTestingId(key);
    try {
      const result = await modelConfigApi.test(config.target, config.id);
      const latency = result.latency_ms !== undefined ? `（${result.latency_ms}ms）` : '';
      const model = result.model ? `\n模型：${result.model}` : '';
      alert(`✅ ${result.message}${latency}${model}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : '测试失败';
      alert(`❌ ${message}`);
    } finally {
      setTestingId(null);
    }
  };

  if (loading) {
    return <div className="text-[var(--fluent-foreground-secondary)]">加载中...</div>;
  }

  return (
    <div className="space-y-6 fluent-fade-in">
      {loadError && (
        <div className="fluent-card p-4 border border-red-500/40 bg-red-500/10">
          <div className="text-red-300 font-medium">模型配置加载失败</div>
          <p className="text-sm text-[var(--fluent-foreground-secondary)] mt-1">
            {loadError}。请确认后端服务已重启并加载了最新的 /api/admin/model-configs 接口。
          </p>
          <button className="fluent-button px-4 py-2 mt-3" onClick={loadConfigs}>
            重试
          </button>
        </div>
      )}
      {formData && (
        <ModelProviderForm
          value={formData}
          editingConfig={editingConfig}
          saveStatus={saveStatus}
          onChange={setFormData}
          onCancel={resetForm}
          onSubmit={save}
        />
      )}
      {MODEL_TARGETS.map(target => (
        <ModelTargetSection
          key={target}
          target={target}
          configs={grouped[target]}
          testingId={testingId}
          onAdd={handleAdd}
          onEdit={handleEdit}
          onDelete={remove}
          onToggle={toggle}
          onSetPrimary={setPrimary}
          onTest={test}
        />
      ))}
    </div>
  );
}
