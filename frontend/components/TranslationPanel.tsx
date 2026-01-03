'use client';

import { useState, useEffect } from 'react';
import DownloadButtons from './DownloadButtons';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface TranslationPanelProps {
  paperId: number;
  paperTitle?: string;  // 论文标题，用于生成下载文件名
  hasFile: boolean;
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
  onTranslationComplete
}: TranslationPanelProps) {
  const [status, setStatus] = useState<TranslationStatus | null>(null);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 获取翻译状态
  const fetchStatus = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE}/api/translate/papers/${paperId}/status`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch (err) {
      console.error('获取翻译状态失败:', err);
    }
  };

  // 获取翻译提供商列表
  const fetchProviders = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE}/api/translate/providers`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setProviders(data.providers.filter((p: Provider) => p.enabled));
      }
    } catch (err) {
      console.error('获取提供商列表失败:', err);
    }
  };

  useEffect(() => {
    fetchStatus();
    fetchProviders();
  }, [paperId]);

  // 监听翻译进度（SSE）
  useEffect(() => {
    if (status?.status === 'processing') {
      const token = localStorage.getItem('token');
      const eventSource = new EventSource(
        `${API_BASE}/api/translate/papers/${paperId}/stream?token=${token}`
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
  }, [status?.status, paperId]);

  // 开始翻译
  const startTranslation = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE}/api/translate/papers/${paperId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          provider_id: selectedProvider
        })
      });

      if (res.ok) {
        fetchStatus();
      } else {
        const data = await res.json();
        setError(data.detail || '添加翻译任务失败');
      }
    } catch (err) {
      setError('网络错误');
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
    return (
      <div className="fluent-card p-5">
        <h3 className="text-lg font-semibold text-[var(--fluent-foreground)] mb-2">📄 论文翻译</h3>
        <p className="text-[var(--fluent-foreground-secondary)] text-sm">此论文没有关联的 PDF 文件，无法翻译</p>
      </div>
    );
  }

  return (
    <div className="fluent-card p-5">
      <h3 className="text-lg font-semibold text-[var(--fluent-foreground)] mb-4">📄 论文翻译</h3>
      
      {/* 状态显示 */}
      <div className="mb-4">
        <span className={`font-medium ${getStatusColor()}`}>
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
    </div>
  );
}