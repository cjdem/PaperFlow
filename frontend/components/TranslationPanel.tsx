'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiClient, apiBaseUrl } from '@/lib/apiClient';
import DownloadButtons from './DownloadButtons';
import { Loader2, Play } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

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
        return 'text-yellow-500';
      case 'processing':
        return 'text-blue-500';
      case 'completed':
        return 'text-green-500';
      case 'failed':
        return 'text-destructive';
      default:
        return 'text-muted-foreground';
    }
  };

  if (!hasFile) {
    const noFileContent = (
      <>
        <h3 className="text-lg font-semibold text-foreground mb-2">📄 论文翻译</h3>
        <p className="text-muted-foreground text-sm">此论文没有关联的 PDF 文件，无法翻译</p>
      </>
    );
    if (embedded) {
      return noFileContent;
    }
    return <div className="rounded-2xl bg-card border border-border p-5">{noFileContent}</div>;
  }

  const content = (
    <>
      <h3 className="text-lg font-semibold text-foreground mb-4">📄 论文翻译</h3>

      {/* 状态显示 */}
      <div className="mb-4">
        <Badge variant="outline" className={cn('font-medium', getStatusColor())} role="status" aria-live="polite">
          {getStatusText()}
        </Badge>
        {status?.error && (
          <p className="text-destructive text-sm mt-1">{status.error}</p>
        )}
      </div>

      {/* 进度条 */}
      {status?.status === 'processing' && (
        <div className="mb-4">
          <Progress value={status.progress} className="h-2" />
          <p className="text-xs text-muted-foreground mt-2">
            正在翻译中，请稍候...
          </p>
        </div>
      )}

      {/* 翻译按钮 */}
      {(!status?.status || status.status === 'failed') && (
        <div className="space-y-3">
          {providers.length > 0 && (
            <div>
              <label className="block text-muted-foreground text-sm mb-2 font-medium">翻译引擎</label>
              <Select
                value={selectedProvider !== null ? String(selectedProvider) : 'auto'}
                onValueChange={(val) => setSelectedProvider(val === 'auto' ? null : Number(val))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="自动选择" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">自动选择</SelectItem>
                  {providers.map(p => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.name} ({p.engine_type})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <Button
            onClick={startTranslation}
            disabled={loading}
            className="w-full py-2.5 font-medium"
          >
            {loading ? (
              <>
                <Loader2 className="animate-spin h-4 w-4" />
                添加中...
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                开始翻译
              </>
            )}
          </Button>

          {error && (
            <p className="text-destructive text-sm">{error}</p>
          )}
        </div>
      )}

      {/* 下载按钮 */}
      {status?.status === 'completed' && (
        <div className="space-y-3">
          <p className="text-muted-foreground text-sm font-medium">📥 下载翻译结果</p>
          <DownloadButtons
            paperId={paperId}
            paperTitle={paperTitle}
            hasOriginal={hasFile}
            translationStatus={status.status}
          />
          {status.translated_at && (
            <p className="text-muted-foreground text-xs mt-2 opacity-70">
              翻译完成于: {new Date(status.translated_at).toLocaleString()}
            </p>
          )}
        </div>
      )}

      {/* 等待中状态 */}
      {status?.status === 'pending' && (
        <div className="flex items-center gap-3 text-muted-foreground text-sm">
          <Loader2 className="animate-spin h-4 w-4 text-yellow-500" />
          论文已加入翻译队列，请等待处理...
        </div>
      )}
    </>
  );

  if (embedded) {
    return content;
  }
  return <div className="rounded-2xl bg-card border border-border p-5">{content}</div>;
}
