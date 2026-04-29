'use client';

import { useCallback, useRef, useState } from 'react';
import { apiClient } from '@/lib/apiClient';
import { usePolling } from '@/lib/usePolling';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

interface QueueStats {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  untranslated_papers: number;
  is_running: boolean;
}

interface QueueTask {
  id: number;
  paper_id: number;
  paper_title: string | null;
  user_id: number;
  status: string;
  progress: number;
  current_stage: string | null;
  error_message: string | null;
  retry_count: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

interface ProviderSummary {
  id: number;
  enabled: boolean;
}

const STATUS_LABELS: Record<string, string> = {
  pending: '待处理',
  processing: '处理中',
  completed: '已完成',
  failed: '失败',
  cancelled: '已取消',
};

const getStatusBadge = (status: string) => {
  const styles: Record<string, string> = {
    pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    processing: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    completed: 'bg-green-500/20 text-green-400 border-green-500/30',
    failed: 'bg-destructive/20 text-destructive border-destructive/30',
    cancelled: 'bg-muted text-muted-foreground border-border',
  };
  return styles[status] || 'bg-muted text-muted-foreground border-border';
};

export default function TranslationMonitor() {
  const [stats, setStats] = useState<QueueStats | null>(null);
  const [tasks, setTasks] = useState<QueueTask[]>([]);
  const [providers, setProviders] = useState<ProviderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const initialLoadRef = useRef(false);

  const fetchStats = useCallback(async () => {
    try {
      const data = await apiClient.get<QueueStats>('/api/translate/queue/stats');
      setStats(data);
    } catch (error) {
      console.error('获取队列统计失败:', error);
    }
  }, []);

  const fetchTasks = useCallback(async () => {
    try {
      const url = statusFilter
        ? `/api/translate/queue/tasks?status=${statusFilter}&limit=50`
        : '/api/translate/queue/tasks?limit=50';
      const data = await apiClient.get<{ tasks: QueueTask[] }>(url);
      setTasks(data.tasks);
    } catch (error) {
      console.error('获取任务列表失败:', error);
    }
  }, [statusFilter]);

  const fetchProviders = useCallback(async () => {
    try {
      const data = await apiClient.get<{ providers: ProviderSummary[] }>('/api/translate/providers');
      setProviders(data.providers);
    } catch (error) {
      console.error('获取翻译引擎统计失败:', error);
    }
  }, []);

  const fetchData = useCallback(async () => {
    await Promise.all([fetchStats(), fetchTasks(), fetchProviders()]);
  }, [fetchStats, fetchTasks, fetchProviders]);

  const handleInitialLoad = useCallback(async () => {
    try {
      await fetchData();
    } finally {
      if (!initialLoadRef.current) {
        initialLoadRef.current = true;
        setLoading(false);
      }
    }
  }, [fetchData]);

  usePolling(handleInitialLoad, {
    enabled: true,
    interval: 5000,
    deps: [statusFilter],
  });

  const startWorker = async () => {
    await apiClient.post('/api/translate/queue/start');
    await fetchStats();
  };

  const stopWorker = async () => {
    await apiClient.post('/api/translate/queue/stop');
    await fetchStats();
  };

  const cancelTask = async (taskId: number) => {
    try {
      await apiClient.delete(`/api/translate/queue/tasks/${taskId}`);
      await fetchData();
    } catch (error) {
      const message = error instanceof Error ? error.message : '取消任务失败';
      toast.error(message);
    }
  };

  const retryTask = async (taskId: number, force = false) => {
    if (force && !confirm('将重置该处理中任务并重新入队，确认继续？')) {
      return;
    }
    try {
      await apiClient.post(`/api/translate/queue/tasks/${taskId}/retry${force ? '?force=true' : ''}`);
      await fetchData();
    } catch (error) {
      const message = error instanceof Error ? error.message : '重试任务失败';
      toast.error(message);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <div className="text-muted-foreground" role="status" aria-live="polite">加载中...</div>
        </div>
      </div>
    );
  }

  const enabledProviderCount = providers.filter(provider => provider.enabled).length;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <div className="rounded-2xl border bg-card p-4 transition-colors">
          <div className="relative">
            <div className="text-3xl font-bold text-foreground mb-1">{stats?.pending || 0}</div>
            <div className="text-muted-foreground text-sm font-medium">待处理</div>
          </div>
        </div>
        <div className="rounded-2xl border bg-card p-4 transition-colors">
          <div className="relative">
            <div className="text-3xl font-bold text-foreground mb-1">{stats?.processing || 0}</div>
            <div className="text-muted-foreground text-sm font-medium">处理中</div>
          </div>
        </div>
        <div className="rounded-2xl border bg-card p-4 transition-colors">
          <div className="relative">
            <div className="text-3xl font-bold text-foreground mb-1">{stats?.completed || 0}</div>
            <div className="text-muted-foreground text-sm font-medium">已完成</div>
          </div>
        </div>
        <div className="rounded-2xl border bg-card p-4 transition-colors">
          <div className="relative">
            <div className="text-3xl font-bold text-foreground mb-1">{stats?.failed || 0}</div>
            <div className="text-muted-foreground text-sm font-medium">失败</div>
          </div>
        </div>
        <div className="rounded-2xl border bg-card p-4 transition-colors">
          <div className="relative">
            <div className="text-3xl font-bold text-foreground mb-1">{stats?.untranslated_papers || 0}</div>
            <div className="text-muted-foreground text-sm font-medium">未翻译</div>
          </div>
        </div>
        <div className="rounded-2xl border bg-card p-4 transition-colors">
          <div className="relative">
            <div className="text-3xl font-bold text-foreground mb-1">{enabledProviderCount}/{providers.length}</div>
            <div className="text-muted-foreground text-sm font-medium">可用引擎</div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        {stats?.is_running ? (
          <Button onClick={stopWorker} className="bg-destructive hover:bg-destructive/90 text-white">
            停止队列
          </Button>
        ) : (
          <Button onClick={startWorker} className="bg-green-600 hover:bg-green-700 text-white">
            启动队列
          </Button>
        )}
        <Button onClick={fetchData} variant="outline">
          刷新
        </Button>
        <select
          value={statusFilter}
          onChange={event => setStatusFilter(event.target.value)}
          className="h-9 rounded-md border bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          <option value="">全部状态</option>
          <option value="pending">待处理</option>
          <option value="processing">处理中</option>
          <option value="completed">已完成</option>
          <option value="failed">失败</option>
        </select>
      </div>

      <div className="rounded-2xl border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/30">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">论文</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">状态</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">进度</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">阶段</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">重试</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">创建时间</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">操作</th>
              </tr>
            </thead>
            <tbody>
              {tasks.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12">
                    <div className="text-4xl mb-2">📭</div>
                    <span className="text-muted-foreground">暂无翻译任务</span>
                  </td>
                </tr>
              ) : (
                tasks.map(task => (
                  <tr key={task.id} className="border-t border-border hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3">
                      <div className="max-w-xs truncate font-medium text-foreground" title={task.paper_title || undefined}>
                        {task.paper_title || `论文 #${task.paper_id}`}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className={cn('rounded-full text-xs', getStatusBadge(task.status))}>
                        {STATUS_LABELS[task.status] || task.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Progress value={task.progress} className="h-2 w-20" />
                        <span className="text-muted-foreground text-xs font-medium">{task.progress}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{task.current_stage || '-'}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{task.retry_count > 0 ? task.retry_count : '-'}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{new Date(task.created_at).toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        {task.status === 'pending' && (
                          <Button variant="ghost" size="sm" onClick={() => cancelTask(task.id)} className="text-destructive hover:text-destructive/80 h-auto px-2 py-1 text-sm font-medium">
                            取消
                          </Button>
                        )}
                        {(task.status === 'failed' || task.status === 'cancelled') && (
                          <Button variant="ghost" size="sm" onClick={() => retryTask(task.id)} className="text-green-500 hover:text-green-400 h-auto px-2 py-1 text-sm font-medium">
                            重试
                          </Button>
                        )}
                        {task.status === 'processing' && (
                          <Button variant="ghost" size="sm" onClick={() => retryTask(task.id, true)} className="text-yellow-500 hover:text-yellow-400 h-auto px-2 py-1 text-sm font-medium">
                            强制重试
                          </Button>
                        )}
                        {task.status === 'failed' && task.error_message && (
                          <span className="text-destructive text-xs cursor-help underline decoration-dotted" title={task.error_message}>
                            查看错误
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-2xl border bg-card p-5">
        <h4 className="text-base font-semibold text-foreground mb-3">配置入口</h4>
        <p className="text-sm text-muted-foreground">
          翻译引擎已统一到"LLM 提供商"页签管理；此处只展示翻译队列运行状态和任务操作。
        </p>
      </div>
    </div>
  );
}
