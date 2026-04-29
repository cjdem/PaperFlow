'use client';

import type { ModelConfig, ModelTarget } from './types';
import { MODEL_TARGET_DESCRIPTIONS, MODEL_TARGET_LABELS } from './types';

interface Props {
  target: ModelTarget;
  configs: ModelConfig[];
  testingId: string | null;
  onAdd: (target: ModelTarget) => void;
  onEdit: (config: ModelConfig) => void;
  onDelete: (config: ModelConfig) => void;
  onToggle: (config: ModelConfig) => void;
  onSetPrimary: (config: ModelConfig) => void;
  onTest: (config: ModelConfig) => void;
}

export function ModelTargetSection({
  target,
  configs,
  testingId,
  onAdd,
  onEdit,
  onDelete,
  onToggle,
  onSetPrimary,
  onTest,
}: Props) {
  return (
    <section className="fluent-card p-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
        <div>
          <h3 className="text-xl font-bold text-[var(--fluent-foreground)]">{MODEL_TARGET_LABELS[target]}</h3>
          <p className="text-sm text-[var(--fluent-foreground-secondary)] mt-1">
            {MODEL_TARGET_DESCRIPTIONS[target]}
          </p>
        </div>
        <button className="fluent-button fluent-button-accent px-4 py-2" onClick={() => onAdd(target)}>
          添加模型
        </button>
      </div>

      <div className="space-y-3">
        {configs.map(config => {
          const key = `${config.target}:${config.id}`;
          return (
            <div key={key} className="fluent-card p-4">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-[var(--fluent-foreground)]">{config.name}</span>
                    {config.is_primary && <span className="fluent-badge fluent-badge-success">主模型</span>}
                    <span className={`fluent-badge ${config.enabled ? 'fluent-badge-success' : ''}`}>
                      {config.enabled ? '启用' : '停用'}
                    </span>
                    <span className="fluent-badge">{config.request_format}</span>
                  </div>
                  <div className="text-sm text-purple-300 mt-2 break-all">{config.model}</div>
                  <div className="text-xs text-[var(--fluent-foreground-secondary)] mt-1 break-all">
                    {config.base_url || '未配置 Base URL'}
                  </div>
                  <div className="text-xs text-[var(--fluent-foreground-secondary)] mt-1">
                    优先级 {config.priority}
                    {target !== 'translation' && ` · 权重 ${config.weight ?? 10}`}
                    {target === 'translation' && ` · QPS ${config.qps ?? 4}`}
                    {config.avg_latency_ms ? ` · 平均延迟 ${config.avg_latency_ms}ms` : ''}
                  </div>
                  {config.last_error && (
                    <div className="text-xs text-red-400 mt-1 break-all">{config.last_error}</div>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    className="fluent-button px-3 py-1.5"
                    onClick={() => onTest(config)}
                    disabled={testingId === key}
                  >
                    {testingId === key ? '测试中...' : '测试'}
                  </button>
                  {target !== 'translation' && (
                    <button className="fluent-button px-3 py-1.5" onClick={() => onSetPrimary(config)}>
                      设为主模型
                    </button>
                  )}
                  <button className="fluent-button px-3 py-1.5" onClick={() => onToggle(config)}>
                    {config.enabled ? '停用' : '启用'}
                  </button>
                  <button className="fluent-button px-3 py-1.5" onClick={() => onEdit(config)}>
                    编辑
                  </button>
                  <button className="fluent-button px-3 py-1.5" onClick={() => onDelete(config)}>
                    删除
                  </button>
                </div>
              </div>
            </div>
          );
        })}
        {configs.length === 0 && (
          <div className="text-center py-10 text-[var(--fluent-foreground-secondary)]">
            尚未配置 {MODEL_TARGET_LABELS[target]} 模型
          </div>
        )}
      </div>
    </section>
  );
}

