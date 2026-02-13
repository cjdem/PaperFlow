'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { apiClient } from '@/lib/apiClient';
import { usePolling } from '@/lib/usePolling';


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

interface Provider {
  id: number;
  name: string;
  engine_type: string;
  request_format?: string;
  base_url: string | null;
  proxy?: string | null;
  api_key?: string;
  model: string | null;
  priority: number;
  qps: number;
  pool_max_workers: number | null;
  no_auto_extract_glossary: boolean;
  disable_rich_text_translate: boolean;
  enabled: boolean;
  created_at: string;
  has_api_key?: boolean;  // 是否已配置 API Key
}

interface ProviderFormData {
  name: string;
  request_format: string;
  engine_type: string;
  base_url: string;
  proxy: string;
  api_key: string;
  model: string;
  priority: number;
  qps: number;
  pool_max_workers: number | null;
  no_auto_extract_glossary: boolean;
  disable_rich_text_translate: boolean;
  enabled: boolean;
}

// 标准请求格式配置
const REQUEST_FORMATS = [
  { value: 'openai', label: 'OpenAI Chat', hint: 'https://api.openai.com/v1' },
  { value: 'openai_response', label: 'OpenAI Responses', hint: 'https://api.openai.com/v1 或兼容 Responses 的网关' },
  { value: 'gemini', label: 'Google Gemini', hint: 'https://generativelanguage.googleapis.com/v1beta/openai 或兼容网关' },
  { value: 'anthropic', label: 'Anthropic Claude', hint: 'https://api.anthropic.com/v1 或兼容网关' }
];

const createEmptyFormData = (): ProviderFormData => ({
  name: '',
  request_format: 'openai',
  engine_type: 'openai',
  base_url: '',
  proxy: '',
  api_key: '',
  model: '',
  priority: 100,
  qps: 4,
  pool_max_workers: null,
  no_auto_extract_glossary: false,
  disable_rich_text_translate: false,
  enabled: true
});

export default function TranslationMonitor() {
  const [stats, setStats] = useState<QueueStats | null>(null);
  const [tasks, setTasks] = useState<QueueTask[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const initialLoadRef = useRef(false);
  const [activeTab, setActiveTab] = useState<'queue' | 'providers'>('queue');
  const [statusFilter, setStatusFilter] = useState<string>('');
  
  // 表单状态
  const [isAdding, setIsAdding] = useState(false);
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null);
  const [formData, setFormData] = useState<ProviderFormData>(createEmptyFormData());
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [testingProviderId, setTestingProviderId] = useState<number | null>(null);

  // 获取队列统计
  const fetchStats = useCallback(async () => {
    try {
      const data = await apiClient.get<QueueStats>('/api/translate/queue/stats');
      setStats(data);
    } catch (err) {
      console.error('获取队列统计失败:', err);
    }
  }, []);

  // 获取任务列表
  const fetchTasks = useCallback(async () => {
    try {
      const url = statusFilter
        ? `/api/translate/queue/tasks?status=${statusFilter}&limit=50`
        : '/api/translate/queue/tasks?limit=50';
      const data = await apiClient.get<{ tasks: QueueTask[] }>(url);
      setTasks(data.tasks);
    } catch (err) {
      console.error('获取任务列表失败:', err);
    }
  }, [statusFilter]);

  // 获取提供商列表
  const fetchProviders = useCallback(async () => {
    try {
      const data = await apiClient.get<{ providers: Provider[] }>('/api/translate/providers');
      setProviders(data.providers);
    } catch (err) {
      console.error('获取提供商列表失败:', err);
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
    intervalMs: 5000,
    deps: [statusFilter]
  });

  useEffect(() => {
    fetchProviders();
  }, [fetchProviders]);

  // 启动工作线程
  const startWorker = async () => {
    await apiClient.post('/api/translate/queue/start');
    fetchStats();
  };

  // 停止工作线程
  const stopWorker = async () => {
    await apiClient.post('/api/translate/queue/stop');
    fetchStats();
  };

  // 取消任务
  const cancelTask = async (taskId: number) => {
    try {
      await apiClient.delete(`/api/translate/queue/tasks/${taskId}`);
      fetchData();
    } catch (error) {
      const message = error instanceof Error ? error.message : '取消任务失败';
      alert(`❌ ${message}`);
    }
  };

  // 重试任务
  const retryTask = async (taskId: number, force = false) => {
    if (force && !confirm('将重置该处理中任务并重新入队，确认继续？')) {
      return;
    }
    try {
      await apiClient.post(`/api/translate/queue/tasks/${taskId}/retry${force ? '?force=true' : ''}`);
      fetchData();
    } catch (error) {
      const message = error instanceof Error ? error.message : '重试任务失败';
      alert(`❌ ${message}`);
    }
  };

  // 删除提供商
  const deleteProvider = async (providerId: number) => {
    if (!confirm('确定要删除此提供商吗？')) return;

    await apiClient.delete(`/api/translate/providers/${providerId}`);
    fetchProviders();
  };

  // 重置表单
  const resetForm = () => {
    setFormData(createEmptyFormData());
    setIsAdding(false);
    setEditingProvider(null);
    setSaveStatus('idle');
  };

  // 开始添加
  const handleAdd = () => {
    setFormData(createEmptyFormData());
    setEditingProvider(null);
    setIsAdding(true);
  };

  // 开始编辑
  const handleEdit = (provider: Provider) => {
    const requestFormat = provider.request_format || provider.engine_type || 'openai';
    setFormData({
      name: provider.name,
      request_format: requestFormat,
      engine_type: requestFormat,
      base_url: provider.base_url || '',
      proxy: provider.proxy || '',
      api_key: '', // 不回显 API Key
      model: provider.model || '',
      priority: provider.priority,
      qps: provider.qps,
      pool_max_workers: provider.pool_max_workers,
      no_auto_extract_glossary: provider.no_auto_extract_glossary || false,
      disable_rich_text_translate: provider.disable_rich_text_translate || false,
      enabled: provider.enabled
    });
    setEditingProvider(provider);
    setIsAdding(false);
  };

  // 创建提供商
  const createProvider = async () => {
    setSaveStatus('saving');
    try {
      await apiClient.post('/api/translate/providers', formData);
      setSaveStatus('saved');
      setTimeout(() => {
        resetForm();
        fetchProviders();
      }, 1000);
    } catch {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  };

  // 更新提供商
  const updateProvider = async () => {
    if (!editingProvider) return;
    
    setSaveStatus('saving');
    try {
      await apiClient.put(`/api/translate/providers/${editingProvider.id}`, formData);
      setSaveStatus('saved');
      setTimeout(() => {
        resetForm();
        fetchProviders();
      }, 1000);
    } catch {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  };

  // 切换启用状态
  const toggleProvider = async (provider: Provider) => {
    await apiClient.put(`/api/translate/providers/${provider.id}`, {
      ...provider,
      enabled: !provider.enabled
    });
    fetchProviders();
  };

  const testProvider = async (provider: Provider) => {
    setTestingProviderId(provider.id);
    try {
      const res = await apiClient.post<{
        success: boolean;
        message: string;
        latency_ms?: number;
        engine_type?: string;
        request_format?: string;
        model?: string;
        sample?: string;
      }>(`/api/translate/providers/${provider.id}/test`);

      const latencyText = res.latency_ms !== undefined ? `（${res.latency_ms}ms）` : '';
      const modelText = res.model ? `模型: ${res.model}` : '';
      alert(`✅ ${res.message}${latencyText}${modelText ? `\n${modelText}` : ''}`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : '测试失败';
      alert(`❌ ${msg}`);
    } finally {
      setTestingProviderId(null);
    }
  };

  // 获取状态标签样式
  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      pending: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30',
      processing: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
      completed: 'fluent-badge-success',
      failed: 'fluent-badge-error',
      cancelled: 'fluent-badge'
    };
    return styles[status] || 'fluent-badge';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-[var(--fluent-blue-500)] border-t-transparent rounded-full animate-spin" />
          <div className="text-[var(--fluent-foreground-secondary)]" role="status" aria-live="polite">加载中...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 fluent-fade-in">
      {/* 统计卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <div className="fluent-stat-card group">
          <div className="absolute inset-0 bg-gradient-to-br from-yellow-500/10 to-yellow-600/5 rounded-2xl" />
          <div className="relative">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-yellow-500 to-yellow-600 flex items-center justify-center mb-3 shadow-lg shadow-yellow-500/25 group-hover:scale-110 transition-transform">
              <span className="text-lg">⏳</span>
            </div>
            <div className="text-3xl font-bold text-[var(--fluent-foreground)] mb-1">{stats?.pending || 0}</div>
            <div className="text-[var(--fluent-foreground-secondary)] text-sm font-medium">待处理</div>
          </div>
        </div>
        <div className="fluent-stat-card group">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-blue-600/5 rounded-2xl" />
          <div className="relative">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center mb-3 shadow-lg shadow-blue-500/25 group-hover:scale-110 transition-transform">
              <span className="text-lg">🔄</span>
            </div>
            <div className="text-3xl font-bold text-[var(--fluent-foreground)] mb-1">{stats?.processing || 0}</div>
            <div className="text-[var(--fluent-foreground-secondary)] text-sm font-medium">处理中</div>
          </div>
        </div>
        <div className="fluent-stat-card group">
          <div className="absolute inset-0 bg-gradient-to-br from-green-500/10 to-green-600/5 rounded-2xl" />
          <div className="relative">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center mb-3 shadow-lg shadow-green-500/25 group-hover:scale-110 transition-transform">
              <span className="text-lg">✅</span>
            </div>
            <div className="text-3xl font-bold text-[var(--fluent-foreground)] mb-1">{stats?.completed || 0}</div>
            <div className="text-[var(--fluent-foreground-secondary)] text-sm font-medium">已完成</div>
          </div>
        </div>
        <div className="fluent-stat-card group">
          <div className="absolute inset-0 bg-gradient-to-br from-red-500/10 to-red-600/5 rounded-2xl" />
          <div className="relative">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center mb-3 shadow-lg shadow-red-500/25 group-hover:scale-110 transition-transform">
              <span className="text-lg">❌</span>
            </div>
            <div className="text-3xl font-bold text-[var(--fluent-foreground)] mb-1">{stats?.failed || 0}</div>
            <div className="text-[var(--fluent-foreground-secondary)] text-sm font-medium">失败</div>
          </div>
        </div>
        <div className="fluent-stat-card group">
          <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 to-purple-600/5 rounded-2xl" />
          <div className="relative">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center mb-3 shadow-lg shadow-purple-500/25 group-hover:scale-110 transition-transform">
              <span className="text-lg">📄</span>
            </div>
            <div className="text-3xl font-bold text-[var(--fluent-foreground)] mb-1">{stats?.untranslated_papers || 0}</div>
            <div className="text-[var(--fluent-foreground-secondary)] text-sm font-medium">未翻译</div>
          </div>
        </div>
        <div className="fluent-stat-card group">
          <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 to-cyan-600/5 rounded-2xl" />
          <div className="relative">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-500 to-cyan-600 flex items-center justify-center mb-3 shadow-lg shadow-cyan-500/25 group-hover:scale-110 transition-transform">
              <span className="text-lg">🌐</span>
            </div>
            <div className="text-3xl font-bold text-[var(--fluent-foreground)] mb-1">{providers.length}</div>
            <div className="text-[var(--fluent-foreground-secondary)] text-sm font-medium">翻译引擎</div>
          </div>
        </div>
      </div>

      {/* 控制按钮 */}
      <div className="flex items-center gap-4">
        {stats?.is_running ? (
          <button
            onClick={stopWorker}
            className="fluent-button px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white font-medium flex items-center gap-2"
          >
            ⏹️ 停止翻译
          </button>
        ) : (
          <button
            onClick={startWorker}
            className="fluent-button px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white font-medium flex items-center gap-2"
          >
            ▶️ 启动翻译
          </button>
        )}
        <span className={`fluent-badge px-4 py-2.5 font-medium ${stats?.is_running ? 'fluent-badge-success' : ''}`}>
          {stats?.is_running ? '🟢 运行中' : '⚪ 已停止'}
        </span>
        <button
          onClick={fetchData}
          className="fluent-button fluent-button-subtle px-5 py-2.5 font-medium"
        >
          🔄 刷新
        </button>
      </div>

      {/* 标签页切换 */}
      <div className="fluent-tabs">
        <button
          onClick={() => setActiveTab('queue')}
          className={`fluent-tab ${activeTab === 'queue' ? 'active' : ''}`}
        >
          📋 翻译队列
        </button>
        <button
          onClick={() => setActiveTab('providers')}
          className={`fluent-tab ${activeTab === 'providers' ? 'active' : ''}`}
        >
          🔧 翻译引擎
        </button>
      </div>

      {/* 翻译队列 */}
      {activeTab === 'queue' && (
        <div className="space-y-4 fluent-fade-in">
          {/* 状态筛选 */}
          <div className="flex gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="fluent-select"
            >
              <option value="">全部状态</option>
              <option value="pending">待处理</option>
              <option value="processing">处理中</option>
              <option value="completed">已完成</option>
              <option value="failed">失败</option>
            </select>
          </div>

          {/* 任务列表 */}
          <div className="fluent-card overflow-hidden">
            <table className="fluent-table w-full">
              <thead>
                <tr>
                  <th className="text-left">论文</th>
                  <th className="text-left">状态</th>
                  <th className="text-left">进度</th>
                  <th className="text-left">阶段</th>
                  <th className="text-left">重试</th>
                  <th className="text-left">创建时间</th>
                  <th className="text-left">操作</th>
                </tr>
              </thead>
              <tbody>
                {tasks.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12">
                      <div className="text-4xl mb-2">📭</div>
                      <span className="text-[var(--fluent-foreground-secondary)]">暂无翻译任务</span>
                    </td>
                  </tr>
                ) : (
                  tasks.map(task => (
                    <tr key={task.id}>
                      <td>
                        <div className="max-w-xs truncate font-medium text-[var(--fluent-foreground)]" title={task.paper_title || undefined}>
                          {task.paper_title || `论文 #${task.paper_id}`}
                        </div>
                      </td>
                      <td>
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${getStatusBadge(task.status)}`}>
                          {task.status}
                        </span>
                      </td>
                      <td>
                        <div className="flex items-center gap-3">
                          <div className="w-20 fluent-progress h-2">
                            <div
                              className="fluent-progress-bar h-2"
                              style={{ width: `${task.progress}%` }}
                            />
                          </div>
                          <span className="text-[var(--fluent-foreground-secondary)] text-xs font-medium">{task.progress}%</span>
                        </div>
                      </td>
                      <td className="text-[var(--fluent-foreground-secondary)] text-xs">
                        {task.current_stage || '-'}
                      </td>
                      <td className="text-[var(--fluent-foreground-secondary)] text-xs">
                        {task.retry_count > 0 ? task.retry_count : '-'}
                      </td>
                      <td className="text-[var(--fluent-foreground-secondary)] text-xs">
                        {new Date(task.created_at).toLocaleString()}
                      </td>
                      <td>
                        {task.status === 'pending' && (
                          <button
                            onClick={() => cancelTask(task.id)}
                            className="text-red-400 hover:text-red-300 text-sm font-medium transition"
                          >
                            取消
                          </button>
                        )}
                        {(task.status === 'failed' || task.status === 'cancelled') && (
                          <button
                            onClick={() => retryTask(task.id)}
                            className="text-green-400 hover:text-green-300 text-sm font-medium transition"
                          >
                            重试
                          </button>
                        )}
                        {task.status === 'processing' && (
                          <button
                            onClick={() => retryTask(task.id, true)}
                            className="text-yellow-400 hover:text-yellow-300 text-sm font-medium transition"
                          >
                            强制重试
                          </button>
                        )}
                        {task.status === 'failed' && task.error_message && (
                          <div
                            className="text-red-400 text-xs cursor-help underline decoration-dotted"
                            title={task.error_message}
                          >
                            查看错误
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 翻译引擎管理 */}
      {activeTab === 'providers' && (
        <div className="space-y-4">
          {/* 添加按钮 */}
          <div className="flex justify-end">
            <button
              onClick={handleAdd}
              className="px-5 py-2.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition font-medium"
            >
              ➕ 添加翻译引擎
            </button>
          </div>

          {/* 添加/编辑表单 */}
          {(isAdding || editingProvider) && (
            <div className="bg-slate-800 rounded-xl p-6 border-2 border-purple-500/50 shadow-lg shadow-purple-500/10">
              <h3 className="text-lg font-semibold text-white mb-5">
                {isAdding ? '➕ 添加翻译引擎' : '✏️ 编辑翻译引擎'}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* 名称 */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">名称</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={e => setFormData({...formData, name: e.target.value})}
                    placeholder="例如：DeepSeek 翻译"
                    className="w-full px-4 py-2.5 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-gray-500 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition"
                  />
                </div>
                
                {/* 请求格式 */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">请求格式</label>
                  <select
                    value={formData.request_format}
                    onChange={e => setFormData({
                      ...formData,
                      request_format: e.target.value,
                      engine_type: e.target.value
                    })}
                    className="w-full px-4 py-2.5 bg-slate-700 border border-slate-600 rounded-lg text-white focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition"
                  >
                    {REQUEST_FORMATS.map(t => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
                
                {/* Base URL */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-300 mb-2">Base URL</label>
                  <input
                    type="text"
                    value={formData.base_url}
                    onChange={e => setFormData({...formData, base_url: e.target.value})}
                    placeholder={REQUEST_FORMATS.find(t => t.value === formData.request_format)?.hint || ''}
                    className="w-full px-4 py-2.5 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-gray-500 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition"
                  />
                  <p className="text-xs text-gray-400 mt-1.5">
                    💡 提示：{REQUEST_FORMATS.find(t => t.value === formData.request_format)?.hint || '请输入 API 地址'}
                  </p>
                </div>

                {/* Proxy */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-300 mb-2">Proxy（可选）</label>
                  <input
                    type="text"
                    value={formData.proxy}
                    onChange={e => setFormData({...formData, proxy: e.target.value})}
                    placeholder="http://127.0.0.1:7890"
                    className="w-full px-4 py-2.5 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-gray-500 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition"
                  />
                </div>
                
                {/* API Key */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    API Key {editingProvider && <span className="text-gray-500">(留空则不修改)</span>}
                  </label>
                  <input
                    type="password"
                    value={formData.api_key}
                    onChange={e => setFormData({...formData, api_key: e.target.value})}
                    placeholder="sk-..."
                    className="w-full px-4 py-2.5 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-gray-500 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition"
                  />
                </div>
                
                {/* 模型 */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">模型名称</label>
                  <input
                    type="text"
                    value={formData.model}
                    onChange={e => setFormData({...formData, model: e.target.value})}
                    placeholder="例如：gpt-4o-mini, deepseek-chat"
                    className="w-full px-4 py-2.5 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-gray-500 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition"
                  />
                </div>
                
                {/* 优先级 */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">优先级 (数值越小越优先)</label>
                  <input
                    type="number"
                    min="1"
                    max="1000"
                    value={formData.priority}
                    onChange={e => setFormData({...formData, priority: Number(e.target.value)})}
                    className="w-full px-4 py-2.5 bg-slate-700 border border-slate-600 rounded-lg text-white focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition"
                  />
                </div>
                
                {/* QPS */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">QPS (每秒请求数)</label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={formData.qps}
                    onChange={e => setFormData({...formData, qps: Number(e.target.value)})}
                    className="w-full px-4 py-2.5 bg-slate-700 border border-slate-600 rounded-lg text-white focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition"
                  />
                  <p className="text-xs text-gray-400 mt-1.5">💡 控制翻译请求频率，避免触发 API 限流</p>
                </div>
                
                {/* 最大工作线程数 */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">最大工作线程数 (可选)</label>
                  <input
                    type="number"
                    min="1"
                    max="1000"
                    value={formData.pool_max_workers || ''}
                    onChange={e => setFormData({...formData, pool_max_workers: e.target.value ? Number(e.target.value) : null})}
                    placeholder="默认: QPS × 10"
                    className="w-full px-4 py-2.5 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-gray-500 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition"
                  />
                  <p className="text-xs text-gray-400 mt-1.5">💡 并发翻译线程数，留空则自动计算</p>
                </div>
                
                {/* 性能优化选项 */}
                <div className="md:col-span-2 bg-slate-700/50 rounded-xl p-5 border border-slate-600">
                  <h4 className="text-sm font-semibold text-gray-200 mb-4">⚡ 性能优化选项</h4>
                  <div className="flex flex-wrap gap-6">
                    <label className="flex items-center gap-2 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={formData.no_auto_extract_glossary}
                        onChange={e => setFormData({...formData, no_auto_extract_glossary: e.target.checked})}
                        className="w-4 h-4 rounded bg-slate-600 border-slate-500 text-purple-500 focus:ring-purple-500"
                      />
                      <span className="text-sm text-gray-300 group-hover:text-white transition">禁用自动术语提取</span>
                      <span className="text-xs text-gray-500">(加速翻译)</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={formData.disable_rich_text_translate}
                        onChange={e => setFormData({...formData, disable_rich_text_translate: e.target.checked})}
                        className="w-4 h-4 rounded bg-slate-600 border-slate-500 text-purple-500 focus:ring-purple-500"
                      />
                      <span className="text-sm text-gray-300 group-hover:text-white transition">禁用富文本翻译</span>
                      <span className="text-xs text-gray-500">(加速但丢失格式)</span>
                    </label>
                  </div>
                  <p className="text-xs text-gray-400 mt-3">
                    💡 提示：禁用自动术语提取可减少 API 调用；禁用富文本翻译可避免 &quot;Too many placeholders&quot; 警告
                  </p>
                </div>
              </div>
              
              <div className="flex gap-3 mt-6 pt-5 border-t border-slate-700">
                <button
                  onClick={isAdding ? createProvider : updateProvider}
                  disabled={saveStatus === 'saving'}
                  className={`px-5 py-2.5 text-white rounded-lg transition-all min-w-[120px] font-medium ${
                    saveStatus === 'saving' ? 'bg-purple-400 cursor-wait' :
                    saveStatus === 'saved' ? 'bg-green-600' :
                    saveStatus === 'error' ? 'bg-red-600' :
                    'bg-purple-600 hover:bg-purple-700'
                  }`}
                >
                  {saveStatus === 'saving' ? '⏳ 保存中...' :
                   saveStatus === 'saved' ? '✅ 已保存' :
                   saveStatus === 'error' ? '❌ 保存失败' :
                   '💾 保存'}
                </button>
                <button
                  onClick={resetForm}
                  disabled={saveStatus === 'saving'}
                  className="px-5 py-2.5 bg-slate-600 text-gray-200 rounded-lg hover:bg-slate-500 transition font-medium"
                >
                  取消
                </button>
              </div>
            </div>
          )}

          {/* 提供商列表 */}
          <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
            <table className="w-full">
              <thead className="bg-slate-700/50">
                <tr>
                  <th className="px-5 py-4 text-left text-gray-200 text-sm font-semibold">名称</th>
                  <th className="px-5 py-4 text-left text-gray-200 text-sm font-semibold">请求格式</th>
                  <th className="px-5 py-4 text-left text-gray-200 text-sm font-semibold">模型</th>
                  <th className="px-5 py-4 text-left text-gray-200 text-sm font-semibold">API Key</th>
                  <th className="px-5 py-4 text-left text-gray-200 text-sm font-semibold">优先级</th>
                  <th className="px-5 py-4 text-left text-gray-200 text-sm font-semibold">QPS</th>
                  <th className="px-5 py-4 text-left text-gray-200 text-sm font-semibold">状态</th>
                  <th className="px-5 py-4 text-left text-gray-200 text-sm font-semibold">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {providers.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-5 py-12 text-center text-gray-400">
                      <div className="text-4xl mb-3">🌐</div>
                      <p className="mb-4">暂无翻译引擎配置</p>
                      <button
                        onClick={handleAdd}
                        className="px-5 py-2.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition font-medium"
                      >
                        ➕ 添加第一个翻译引擎
                      </button>
                    </td>
                  </tr>
                ) : (
                  providers.map(provider => (
                    <tr key={provider.id} className="hover:bg-slate-700/30 transition">
                      <td className="px-5 py-4 text-white text-sm font-medium">{provider.name}</td>
                      <td className="px-5 py-4 text-gray-300 text-sm">
                        <span className="px-2.5 py-1 bg-slate-700 rounded-full text-xs font-medium">
                          {REQUEST_FORMATS.find(t => t.value === (provider.request_format || provider.engine_type))?.label || provider.request_format || provider.engine_type}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-purple-300 text-sm font-medium">{provider.model || '-'}</td>
                      <td className="px-5 py-4">
                        {provider.has_api_key ? (
                          <span className="px-2.5 py-1 bg-green-600/20 text-green-400 rounded-full text-xs font-medium border border-green-500/30">✅ 已配置</span>
                        ) : (
                          <span className="px-2.5 py-1 bg-red-600/20 text-red-400 rounded-full text-xs font-medium border border-red-500/30">❌ 未配置</span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-yellow-400 text-sm font-medium">{provider.priority}</td>
                      <td className="px-5 py-4 text-gray-300 text-sm">{provider.qps}</td>
                      <td className="px-5 py-4">
                        <button
                          onClick={() => toggleProvider(provider)}
                          className={`px-2.5 py-1 rounded-full text-xs cursor-pointer font-medium transition ${
                            provider.enabled
                              ? 'bg-green-600/20 text-green-400 hover:bg-green-600/30 border border-green-500/30'
                              : 'bg-slate-700 text-gray-400 hover:bg-slate-600'
                          }`}
                        >
                          {provider.enabled ? '✅ 启用' : '⚪ 禁用'}
                        </button>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleEdit(provider)}
                            className="px-3 py-1.5 text-sm bg-purple-600/20 text-purple-400 rounded-lg hover:bg-purple-600/30 transition font-medium"
                          >
                            ✏️ 编辑
                          </button>
                          <button
                            onClick={() => testProvider(provider)}
                            disabled={testingProviderId === provider.id}
                            className={`px-3 py-1.5 text-sm rounded-lg transition font-medium ${
                              testingProviderId === provider.id
                                ? 'bg-purple-400/30 text-purple-200 cursor-wait'
                                : 'bg-purple-500/20 text-purple-300 hover:bg-purple-500/30'
                            }`}
                          >
                            {testingProviderId === provider.id ? '🔌 测试中...' : '🔌 测试连接'}
                          </button>
                          <button
                            onClick={() => deleteProvider(provider.id)}
                            className="px-3 py-1.5 text-sm bg-red-600/20 text-red-400 rounded-lg hover:bg-red-600/30 transition font-medium"
                          >
                            🗑️ 删除
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          
          {/* 配置说明 */}
          <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
            <h4 className="text-base font-semibold text-gray-200 mb-3">💡 配置说明</h4>
            <ul className="text-sm text-gray-300 space-y-2">
              <li>• <strong className="text-cyan-400">翻译引擎</strong>：独立于元数据/分析 LLM 池，专门用于 PDF 翻译</li>
              <li>• <strong className="text-yellow-400">优先级越小越优先</strong>：系统会按优先级顺序尝试翻译引擎</li>
              <li>• <strong className="text-green-400">QPS 限制</strong>：控制每秒请求数，避免触发 API 限流</li>
              <li>• <strong className="text-purple-400">性能优化</strong>：提高 QPS 和工作线程数可加速翻译，但需注意 API 限制</li>
              <li>• 标准请求格式：OpenAI Chat、OpenAI Responses、Gemini、Anthropic</li>
            </ul>
          </div>
          
          {/* 性能优化说明 */}
          <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
            <h4 className="text-base font-semibold text-gray-200 mb-3">⚡ 性能优化指南</h4>
            <div className="text-sm text-gray-300 space-y-2">
              <p><strong className="text-cyan-400">快速翻译配置：</strong>QPS: 10-20, 工作线程: 100-200, 禁用术语提取</p>
              <p><strong className="text-green-400">最快配置（牺牲格式）：</strong>QPS: 20-50, 工作线程: 200-500, 禁用术语提取 + 禁用富文本</p>
              <p><strong className="text-yellow-400">高质量配置：</strong>QPS: 4-10, 工作线程: 40-100, 保留所有选项</p>
              <p className="text-gray-400 mt-3">
                ⚠️ 注意：不要超过 API 服务商的 RPM/并发限制，否则会导致请求失败
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
