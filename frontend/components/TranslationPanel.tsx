'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiClient, apiBaseUrl } from '@/lib/apiClient';
import DownloadButtons from './DownloadButtons';

interface TranslationPanelProps {
  paperId: number;
  paperTitle?: string;  // 论文标题，用于生成下载文件名
  hasFile: boolean;
  embedded?: boolean;
  onTranslationComplete?: () => void;
}

interface TranslationStatus {
  paper_id: number;
  status: string | null;
  progress: number;
  error: string | null;
  translated_file_path: string | null;
  translated_dual_path: string | null;
  translated_at: string | null;
}

interface Provider {
  id: number;
  name: string;
  engine_type: string;
  enabled: boolean;
}

export default function TranslationPanel({
  paperId,
  paperTitle,
  hasFile,
  embedded = false,
  onTranslationComplete
}: TranslationPanelProps) {
  const [status, setStatus] = useState<TranslationStatus | null>(null);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 获取翻译状态
  const fetchStatus = useCallback(async () => {
    try {
      const data = await apiClient.get<TranslationStatus>(`/api/translate/papers/${paperId}/status`);
      setStatus(data);
    } catch (err) {
      console.error('获取翻译状态失败:', err);
    }
  }, [paperId]);

  // 获取翻译提供商列表
  const fetchProviders = useCallback(async () => {
    try {
      const data = await apiClient.get<{ providers: Provider[] }>('/api/translate/providers');
      setProviders(data.providers.filter((p: Provider) => p.enabled));
    } catch (err) {
      console.error('获取提供商列表失败:', err);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    fetchProviders();
  }, [fetchProviders, fetchStatus]);

  // 监听翻译进度（SSE）
  useEffect(() => {
    if (status?.status === 'processing') {
      const token = localStorage.getItem('token');
      if (!token) return;
      const eventSource = new EventSource(
        `${apiBaseUrl}/api/translate/papers/${paperId}/stream?token=${encodeURIComponent(token)}`
      );

      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        setStatus(prev => prev ? { ...prev, ...data } : null);
        
        if (data.status === 'completed' || data.status === 'failed') {
          eventSource.close();
          fetchStatus();
          if (data.status === 'completed' && onTranslationComplete) {
            onTranslationComplete();
          }
        }
      };

      eventSource.onerror = () => {
        eventSource.close();
      };

      return () => {
        eventSource.close();
      };
    }
  }, [status?.status, paperId, fetchStatus, onTranslationComplete]);

  // 开始翻译
  const startTranslation = async () => {
    setLoading(true);
    setError(null);
    
    try {
      await apiClient.post(`/api/translate/papers/${paperId}`, {
        provider_id: selectedProvider
      });
      fetchStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : '网络错误');
    } finally {
      setLoading(false);
    }
  };

  // 获取状态显示文本
  const getStatusText = () => {
    switch (status?.status) {
      case 'pending':
        return '⏳ 等待翻译';
      case 'processing':
        return `🔄 翻译中 (${status.progress}%)`;
      case 'completed':
        return '✅ 翻译完成';
      case 'failed':
        return '❌ 翻译失败';
      default:
        return '未翻译';
    }
  };

  // 获取状态颜色
  const getStatusColor = () => {
    switch (status?.status) {
      case 'pending':
        return 'text-yellow-400';
      case 'processing':
        return 'text-blue-400';
      case 'completed':
        return 'text-green-400';
      case 'failed':
        return 'text-red-400';
      default:
        return 'text-gray-400';
    }
  };

  if (!hasFile) {
    const noFileContent = (
      <>
        <h3 className="text-lg font-semibold text-[var(--fluent-foreground)] mb-2">📄 论文翻译</h3>
        <p className="text-[var(--fluent-foreground-secondary)] text-sm">此论文没有关联的 PDF 文件，无法翻译</p>
      </>
    );
    if (embedded) {
      return noFileContent;
    }
    return <div className="fluent-card p-5">{noFileContent}</div>;
  }

  const content = (
    <>
      <h3 className="text-lg font-semibold text-[var(--fluent-foreground)] mb-4">📄 论文翻译</h3>
      
      {/* 状态显示 */}
      <div className="mb-4">
        <span className={`font-medium ${getStatusColor()}`} role="status" aria-live="polite">
          {getStatusText()}
        </span>
        {status?.error && (
          <p className="text-red-400 text-sm mt-1">{status.error}</p>
        )}
      </div>

      {/* 进度条 */}
      {status?.status === 'processing' && (
        <div className="mb-4">
          <div className="fluent-progress h-2">
            <div
              className="fluent-progress-bar h-2"
              style={{ width: `${status.progress}%` }}
            />
          </div>
          <p className="text-xs text-[var(--fluent-foreground-secondary)] mt-2">
            正在翻译中，请稍候...
          </p>
        </div>
      )}

      {/* 翻译按钮 */}
      {(!status?.status || status.status === 'failed') && (
        <div className="space-y-3">
          {providers.length > 0 && (
            <div>
              <label className="block text-[var(--fluent-foreground-secondary)] text-sm mb-2 font-medium">翻译引擎</label>
              <select
                value={selectedProvider || ''}
                onChange={(e) => setSelectedProvider(e.target.value ? Number(e.target.value) : null)}
                className="fluent-select w-full"
              >
                <option value="">自动选择</option>
                {providers.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.engine_type})
                  </option>
                ))}
              </select>
            </div>
          )}
          
          <button
            onClick={startTranslation}
            disabled={loading}
            className="fluent-button fluent-button-accent w-full py-2.5 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                添加中...
              </span>
            ) : '🚀 开始翻译'}
          </button>
          
          {error && (
            <p className="text-red-400 text-sm">{error}</p>
          )}
        </div>
      )}

      {/* 下载按钮 */}
      {status?.status === 'completed' && (
        <div className="space-y-3">
          <p className="text-[var(--fluent-foreground-secondary)] text-sm font-medium">📥 下载翻译结果</p>
          <DownloadButtons
            paperId={paperId}
            paperTitle={paperTitle}
            hasOriginal={hasFile}
            translationStatus={status.status}
          />
          {status.translated_at && (
            <p className="text-[var(--fluent-foreground-secondary)] text-xs mt-2 opacity-70">
              翻译完成于: {new Date(status.translated_at).toLocaleString()}
            </p>
          )}
        </div>
      )}

      {/* 等待中状态 */}
      {status?.status === 'pending' && (
        <div className="flex items-center gap-3 text-[var(--fluent-foreground-secondary)] text-sm">
          <div className="w-4 h-4 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin" />
          论文已加入翻译队列，请等待处理...
        </div>
      )}
    </>
  );

  if (embedded) {
    return content;
  }
  return <div className="fluent-card p-5">{content}</div>;
}
