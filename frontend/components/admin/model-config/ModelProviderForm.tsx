'use client';

import type { ModelConfig, ModelConfigFormData, ModelTarget, ModelTargetOptions } from './types';
import { MODEL_TARGET_DESCRIPTIONS, MODEL_TARGET_LABELS, MODEL_TARGETS } from './types';

const REQUEST_FORMATS = [
  { value: 'openai', label: 'OpenAI Chat Completions', hint: 'https://api.openai.com/v1 或兼容网关' },
  { value: 'openai_response', label: 'OpenAI Responses', hint: 'https://api.openai.com/v1' },
  { value: 'gemini', label: 'Google Gemini', hint: 'https://generativelanguage.googleapis.com/v1beta' },
  { value: 'anthropic', label: 'Anthropic Claude', hint: 'https://api.anthropic.com' },
];

export const createTargetOptions = (target: ModelTarget): ModelTargetOptions => ({
  target,
  priority: target === 'translation' ? 100 : 1,
  enabled: true,
  weight: 10,
  is_primary: false,
  qps: 4,
  pool_max_workers: null,
  no_auto_extract_glossary: false,
  disable_rich_text_translate: false,
});

interface Props {
  value: ModelConfigFormData;
  editingConfig: ModelConfig | null;
  saveStatus: 'idle' | 'saving' | 'saved' | 'error';
  onChange: (value: ModelConfigFormData) => void;
  onCancel: () => void;
  onSubmit: () => void;
}

export function ModelProviderForm({
  value,
  editingConfig,
  saveStatus,
  onChange,
  onCancel,
  onSubmit,
}: Props) {
  const selectedFormat = REQUEST_FORMATS.find(item => item.value === value.request_format) ?? REQUEST_FORMATS[0];
  const selectedTargets = new Set(value.targets.map(item => item.target));
  const isEditing = Boolean(editingConfig);

  const updateTarget = (target: ModelTarget, patch: Partial<ModelTargetOptions>) => {
    onChange({
      ...value,
      targets: value.targets.map(item => (item.target === target ? { ...item, ...patch } : item)),
    });
  };

  const toggleTarget = (target: ModelTarget) => {
    const exists = selectedTargets.has(target);
    onChange({
      ...value,
      targets: exists
        ? value.targets.filter(item => item.target !== target)
        : [...value.targets, createTargetOptions(target)],
    });
  };

  const canSubmit =
    value.name.trim().length > 0 &&
    value.model.trim().length > 0 &&
    value.targets.length > 0 &&
    saveStatus !== 'saving';

  return (
    <div className="fluent-card p-6 border-2 border-purple-500/50 mb-6 fluent-scale-in">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h3 className="text-lg font-semibold text-[var(--fluent-foreground)]">
            {isEditing ? '编辑模型配置' : '添加模型配置'}
          </h3>
          <p className="text-sm text-[var(--fluent-foreground-secondary)] mt-1">
            {isEditing ? '编辑当前功能下的模型参数。' : '录入一次模型信息，并分配到一个或多个功能。'}
          </p>
        </div>
        <button className="fluent-button px-3 py-1.5" onClick={onCancel}>
          取消
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div>
          <label className="block text-sm font-medium text-[var(--fluent-foreground)] mb-2">名称</label>
          <input
            className="fluent-input w-full"
            value={value.name}
            onChange={event => onChange({ ...value, name: event.target.value })}
            placeholder="例如：OpenAI GPT-4o"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-[var(--fluent-foreground)] mb-2">请求格式</label>
          <select
            className="fluent-select w-full"
            value={value.request_format}
            onChange={event => onChange({ ...value, request_format: event.target.value })}
          >
            {REQUEST_FORMATS.map(item => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-[var(--fluent-foreground)] mb-2">Base URL</label>
          <input
            className="fluent-input w-full"
            value={value.base_url}
            onChange={event => onChange({ ...value, base_url: event.target.value })}
            placeholder={selectedFormat.hint}
          />
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-[var(--fluent-foreground)] mb-2">Proxy</label>
          <input
            className="fluent-input w-full"
            value={value.proxy}
            onChange={event => onChange({ ...value, proxy: event.target.value })}
            placeholder="http://127.0.0.1:7890"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-[var(--fluent-foreground)] mb-2">API Key</label>
          <input
            className="fluent-input w-full"
            type="password"
            value={value.api_key}
            onChange={event => onChange({ ...value, api_key: event.target.value })}
            placeholder={isEditing ? '留空表示不修改' : 'sk-...'}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-[var(--fluent-foreground)] mb-2">模型名称</label>
          <input
            className="fluent-input w-full"
            value={value.model}
            onChange={event => onChange({ ...value, model: event.target.value })}
            placeholder="gpt-4o-mini"
          />
        </div>
      </div>

      {!isEditing && (
        <div className="mt-5">
          <label className="block text-sm font-medium text-[var(--fluent-foreground)] mb-3">分配目标</label>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {MODEL_TARGETS.map(target => (
              <label key={target} className="fluent-card p-4 flex items-start gap-3 cursor-pointer">
                <input
                  className="mt-1"
                  type="checkbox"
                  checked={selectedTargets.has(target)}
                  onChange={() => toggleTarget(target)}
                />
                <span>
                  <span className="block font-medium text-[var(--fluent-foreground)]">
                    {MODEL_TARGET_LABELS[target]}
                  </span>
                  <span className="block text-xs text-[var(--fluent-foreground-secondary)] mt-1">
                    {MODEL_TARGET_DESCRIPTIONS[target]}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="mt-5 space-y-4">
        {value.targets.map(options => (
          <div key={options.target} className="fluent-card p-4">
            <div className="font-medium text-[var(--fluent-foreground)] mb-3">
              {MODEL_TARGET_LABELS[options.target]} 参数
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <label className="block text-sm text-[var(--fluent-foreground-secondary)]">
                优先级
                <input
                  className="fluent-input w-full mt-1"
                  type="number"
                  value={options.priority}
                  onChange={event => updateTarget(options.target, { priority: Number(event.target.value) })}
                />
              </label>
              <label className="flex items-center gap-2 text-sm text-[var(--fluent-foreground-secondary)] md:mt-7">
                <input
                  type="checkbox"
                  checked={options.enabled}
                  onChange={event => updateTarget(options.target, { enabled: event.target.checked })}
                />
                启用
              </label>
              {options.target !== 'translation' && (
                <>
                  <label className="block text-sm text-[var(--fluent-foreground-secondary)]">
                    权重
                    <input
                      className="fluent-input w-full mt-1"
                      type="number"
                      value={options.weight}
                      onChange={event => updateTarget(options.target, { weight: Number(event.target.value) })}
                    />
                  </label>
                  <label className="flex items-center gap-2 text-sm text-[var(--fluent-foreground-secondary)] md:mt-7">
                    <input
                      type="checkbox"
                      checked={options.is_primary}
                      onChange={event => updateTarget(options.target, { is_primary: event.target.checked })}
                    />
                    主模型
                  </label>
                </>
              )}
              {options.target === 'translation' && (
                <>
                  <label className="block text-sm text-[var(--fluent-foreground-secondary)]">
                    QPS
                    <input
                      className="fluent-input w-full mt-1"
                      type="number"
                      value={options.qps}
                      onChange={event => updateTarget(options.target, { qps: Number(event.target.value) })}
                    />
                  </label>
                  <label className="block text-sm text-[var(--fluent-foreground-secondary)]">
                    最大工作线程
                    <input
                      className="fluent-input w-full mt-1"
                      type="number"
                      value={options.pool_max_workers ?? ''}
                      onChange={event => updateTarget(options.target, {
                        pool_max_workers: event.target.value ? Number(event.target.value) : null,
                      })}
                    />
                  </label>
                  <label className="flex items-center gap-2 text-sm text-[var(--fluent-foreground-secondary)]">
                    <input
                      type="checkbox"
                      checked={options.no_auto_extract_glossary}
                      onChange={event => updateTarget(options.target, { no_auto_extract_glossary: event.target.checked })}
                    />
                    禁用自动术语提取
                  </label>
                  <label className="flex items-center gap-2 text-sm text-[var(--fluent-foreground-secondary)]">
                    <input
                      type="checkbox"
                      checked={options.disable_rich_text_translate}
                      onChange={event => updateTarget(options.target, { disable_rich_text_translate: event.target.checked })}
                    />
                    禁用富文本翻译
                  </label>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-end gap-3 mt-6">
        <button className="fluent-button px-5 py-2" onClick={onCancel}>
          取消
        </button>
        <button
          className="fluent-button fluent-button-accent px-5 py-2"
          onClick={onSubmit}
          disabled={!canSubmit}
        >
          {saveStatus === 'saving' ? '保存中...' : saveStatus === 'saved' ? '已保存' : '保存'}
        </button>
      </div>
    </div>
  );
}

