'use client';

import { useState, useEffect } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

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
  base_url: string | null;
  api_key?: string;
  model: string | null;
  priority: number;
  qps: number;
  enabled: boolean;
  created_at: string;
  has_api_key?: boolean;  // 是否已配置 API Key
}

interface ProviderFormData {
  name: string;
  engine_type: string;
  base_url: string;
  api_key: string;
  model: string;
  priority: number;
  qps: number;
  enabled: boolean;
}

// 引擎类型配置
const ENGINE_TYPES = [
  { value: 'openai', label: 'OpenAI', hint: 'https://api.openai.com/v1' },
  { value: 'openaicompatible', label: 'OpenAI 兼容', hint: '自定义 OpenAI 兼容 API' },
  { value: 'deepseek', label: 'DeepSeek', hint: 'https://api.deepseek.com/v1' },
  { value: 'siliconflow', label: 'SiliconFlow', hint: 'https://api.siliconflow.cn/v1' },
  { value: 'aliyundashscope', label: '阿里云 DashScope', hint: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
  { value: 'zhipu', label: '智谱 AI', hint: 'https://open.bigmodel.cn/api/paas/v4' },
  { value: 'groq', label: 'Groq', hint: 'https://api.groq.com/openai/v1' },
  { value: 'gemini', label: 'Google Gemini', hint: '无需 Base URL' },
  { value: 'google', label: 'Google Translate', hint: '无需 Base URL' },
  { value: 'deepl', label: 'DeepL', hint: '无需 Base URL' },
  { value: 'ollama', label: 'Ollama 本地', hint: 'http://localhost:11434' },
  { value: 'azure', label: 'Azure Translator', hint: 'https://api.translator.azure.cn' }
];

const createEmptyFormData = (): ProviderFormData => ({
  name: '',
  engine_type: 'openai',
  base_url: '',
  api_key: '',
  model: '',
  priority: 100,
  qps: 4,
  enabled: true
});

export default function TranslationMonitor() {
  const [stats, setStats] = useState<QueueStats | null>(null);
  const [tasks, setTasks] = useState<QueueTask[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'queue' | 'providers'>('queue');
  const [statusFilter, setStatusFilter] = useState<string>('');
  
  // 表单状态
  const [isAdding, setIsAdding] = useState(false);
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null);
  const [formData, setFormData] = useState<ProviderFormData>(createEmptyFormData());
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // 获取队列统计
  const fetchStats = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE}/api/translate/queue/stats`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setStats(await res.json());
      }
    } catch (err) {
      console.error('获取队列统计失败:', err);
    }
  };

  // 获取任务列表
  const fetchTasks = async () => {
    try {
      const token = localStorage.getItem('token');
      const url = statusFilter
        ? `${API_BASE}/api/translate/queue/tasks?status=${statusFilter}&limit=50`
        : `${API_BASE}/api/translate/queue/tasks?limit=50`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setTasks(data.tasks);
      }
    } catch (err) {
      console.error('获取任务列表失败:', err);
    }
  };

  // 获取提供商列表
  const fetchProviders = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE}/api/translate/providers`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setProviders(data.providers);
      }
    } catch (err) {
      console.error('获取提供商列表失败:', err);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    await Promise.all([fetchStats(), fetchTasks(), fetchProviders()]);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => {
      fetchStats();
      fetchTasks();
    }, 5000);
    return () => clearInterval(interval);
  }, [statusFilter]);

  // 启动工作线程
  const startWorker = async () => {
    const token = localStorage.getItem('token');
    await fetch(`${API_BASE}/api/translate/queue/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });
    fetchStats();
  };

  // 停止工作线程
  const stopWorker = async () => {
    const token = localStorage.getItem('token');
    await fetch(`${API_BASE}/api/translate/queue/stop`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });
    fetchStats();
  };

  // 取消任务
  const cancelTask = async (taskId: number) => {
    const token = localStorage.getItem('token');
    await fetch(`${API_BASE}/api/translate/queue/tasks/${taskId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    fetchTasks();
  };

  // 删除提供商
  const deleteProvider = async (providerId: number) => {
    if (!confirm('确定要删除此提供商吗？')) return;
    
    const token = localStorage.getItem('token');
    await fetch(`${API_BASE}/api/translate/providers/${providerId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
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
    setFormData({
      name: provider.name,
      engine_type: provider.engine_type,
      base_url: provider.base_url || '',
      api_key: '', // 不回显 API Key
      model: provider.model || '',
      priority: provider.priority,
      qps: provider.qps,
      enabled: provider.enabled
    });
    setEditingProvider(provider);
    setIsAdding(false);
  };

  // 创建提供商
  const createProvider = async () => {
    setSaveStatus('saving');
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE}/api/translate/providers`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      });
      
      if (res.ok) {
        setSaveStatus('saved');
        setTimeout(() => {
          resetForm();
          fetchProviders();
        }, 1000);
      } else {
        setSaveStatus('error');
        setTimeout(() => setSaveStatus('idle'), 3000);
      }
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
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE}/api/translate/providers/${editingProvider.id}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      });
      
      if (res.ok) {
        setSaveStatus('saved');
        setTimeout(() => {
          resetForm();
          fetchProviders();
        }, 1000);
      } else {
        setSaveStatus('error');
        setTimeout(() => setSaveStatus('idle'), 3000);
      }
    } catch {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  };

  // 切换启用状态
  const toggleProvider = async (provider: Provider) => {
    const token = localStorage.getItem('token');
    await fetch(`${API_BASE}/api/translate/providers/${provider.id}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ...provider,
        enabled: !provider.enabled
      })
    });
    fetchProviders();
  };

  // 获取状态标签样式
  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      pending: 'bg-yellow-900 text-yellow-300',
      processing: 'bg-blue-900 text-blue-300',
      completed: 'bg-green-900 text-green-300',
      failed: 'bg-red-900 text-red-300',
      cancelled: 'bg-gray-700 text-gray-300'
    };
    return styles[status] || 'bg-gray-700 text-gray-300';
  };

  if (loading) {
    return <div className="text-gray-400 p-4">加载中...</div>;
  }

  return (
    <div className="space-y-6">
      {/* 统计卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="text-2xl font-bold text-yellow-400">{stats?.pending || 0}</div>
          <div className="text-gray-400 text-sm">待处理</div>
        </div>
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="text-2xl font-bold text-blue-400">{stats?.processing || 0}</div>
          <div className="text-gray-400 text-sm">处理中</div>
        </div>
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="text-2xl font-bold text-green-400">{stats?.completed || 0}</div>
          <div className="text-gray-400 text-sm">已完成</div>
        </div>
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="text-2xl font-bold text-red-400">{stats?.failed || 0}</div>
          <div className="text-gray-400 text-sm">失败</div>
        </div>
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="text-2xl font-bold text-purple-400">{stats?.untranslated_papers || 0}</div>
          <div className="text-gray-400 text-sm">未翻译论文</div>
        </div>
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="text-2xl font-bold text-cyan-400">{providers.length}</div>
          <div className="text-gray-400 text-sm">翻译引擎</div>
        </div>
      </div>

      {/* 控制按钮 */}
      <div className="flex items-center gap-4">
        {stats?.is_running ? (
          <button
            onClick={stopWorker}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 flex items-center gap-2"
          >
            ⏹️ 停止翻译
          </button>
        ) : (
          <button
            onClick={startWorker}
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 flex items-center gap-2"
          >
            ▶️ 启动翻译
          </button>
        )}
        <span className={`px-3 py-2 rounded ${stats?.is_running ? 'bg-green-900 text-green-300' : 'bg-gray-700 text-gray-400'}`}>
          {stats?.is_running ? '🟢 运行中' : '⚪ 已停止'}
        </span>
        <button
          onClick={fetchData}
          className="px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600"
        >
          🔄 刷新
        </button>
      </div>

      {/* 标签页切换 */}
      <div className="flex border-b border-gray-700">
        <button
          onClick={() => setActiveTab('queue')}
          className={`px-4 py-2 ${activeTab === 'queue' ? 'border-b-2 border-blue-500 text-blue-400' : 'text-gray-400'}`}
        >
          📋 翻译队列
        </button>
        <button
          onClick={() => setActiveTab('providers')}
          className={`px-4 py-2 ${activeTab === 'providers' ? 'border-b-2 border-blue-500 text-blue-400' : 'text-gray-400'}`}
        >
          🔧 翻译引擎
        </button>
      </div>

      {/* 翻译队列 */}
      {activeTab === 'queue' && (
        <div className="space-y-4">
          {/* 状态筛选 */}
          <div className="flex gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-gray-700 text-white rounded px-3 py-2"
            >
              <option value="">全部状态</option>
              <option value="pending">待处理</option>
              <option value="processing">处理中</option>
              <option value="completed">已完成</option>
              <option value="failed">失败</option>
            </select>
          </div>

          {/* 任务列表 */}
          <div className="bg-gray-800 rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-700">
                <tr>
                  <th className="px-4 py-3 text-left text-gray-300 text-sm">论文</th>
                  <th className="px-4 py-3 text-left text-gray-300 text-sm">状态</th>
                  <th className="px-4 py-3 text-left text-gray-300 text-sm">进度</th>
                  <th className="px-4 py-3 text-left text-gray-300 text-sm">阶段</th>
                  <th className="px-4 py-3 text-left text-gray-300 text-sm">重试</th>
                  <th className="px-4 py-3 text-left text-gray-300 text-sm">创建时间</th>
                  <th className="px-4 py-3 text-left text-gray-300 text-sm">操作</th>
                </tr>
              </thead>
              <tbody>
                {tasks.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                      暂无翻译任务
                    </td>
                  </tr>
                ) : (
                  tasks.map(task => (
                    <tr key={task.id} className="border-t border-gray-700 hover:bg-gray-750">
                      <td className="px-4 py-3 text-white text-sm">
                        <div className="max-w-xs truncate" title={task.paper_title || undefined}>
                          {task.paper_title || `论文 #${task.paper_id}`}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded text-xs ${getStatusBadge(task.status)}`}>
                          {task.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-16 bg-gray-700 rounded-full h-1.5">
                            <div
                              className="bg-blue-500 h-1.5 rounded-full"
                              style={{ width: `${task.progress}%` }}
                            />
                          </div>
                          <span className="text-gray-400 text-xs">{task.progress}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs">
                        {task.current_stage || '-'}
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs">
                        {task.retry_count > 0 ? task.retry_count : '-'}
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs">
                        {new Date(task.created_at).toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        {task.status === 'pending' && (
                          <button
                            onClick={() => cancelTask(task.id)}
                            className="text-red-400 hover:text-red-300 text-sm"
                          >
                            取消
                          </button>
                        )}
                        {task.status === 'failed' && task.error_message && (
                          <span 
                            className="text-red-400 text-xs cursor-help"
                            title={task.error_message}
                          >
                            查看错误
                          </span>
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
              className="px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700"
            >
              ➕ 添加翻译引擎
            </button>
          </div>

          {/* 添加/编辑表单 */}
          {(isAdding || editingProvider) && (
            <div className="bg-slate-800 rounded-xl p-6 border border-cyan-500">
              <h3 className="text-lg font-semibold text-white mb-4">
                {isAdding ? '添加翻译引擎' : '编辑翻译引擎'}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 名称 */}
                <div>
                  <label className="block text-sm text-gray-400 mb-1">名称</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={e => setFormData({...formData, name: e.target.value})}
                    placeholder="例如：DeepSeek 翻译"
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                  />
                </div>
                
                {/* 引擎类型 */}
                <div>
                  <label className="block text-sm text-gray-400 mb-1">引擎类型</label>
                  <select
                    value={formData.engine_type}
                    onChange={e => setFormData({...formData, engine_type: e.target.value})}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                  >
                    {ENGINE_TYPES.map(t => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
                
                {/* Base URL */}
                <div className="md:col-span-2">
                  <label className="block text-sm text-gray-400 mb-1">Base URL</label>
                  <input
                    type="text"
                    value={formData.base_url}
                    onChange={e => setFormData({...formData, base_url: e.target.value})}
                    placeholder={ENGINE_TYPES.find(t => t.value === formData.engine_type)?.hint || ''}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    提示：{ENGINE_TYPES.find(t => t.value === formData.engine_type)?.hint || '请输入 API 地址'}
                  </p>
                </div>
                
                {/* API Key */}
                <div className="md:col-span-2">
                  <label className="block text-sm text-gray-400 mb-1">
                    API Key {editingProvider && <span className="text-gray-500">(留空则不修改)</span>}
                  </label>
                  <input
                    type="password"
                    value={formData.api_key}
                    onChange={e => setFormData({...formData, api_key: e.target.value})}
                    placeholder="sk-..."
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                  />
                </div>
                
                {/* 模型 */}
                <div>
                  <label className="block text-sm text-gray-400 mb-1">模型名称</label>
                  <input
                    type="text"
                    value={formData.model}
                    onChange={e => setFormData({...formData, model: e.target.value})}
                    placeholder="例如：gpt-4o-mini, deepseek-chat"
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                  />
                </div>
                
                {/* 优先级 */}
                <div>
                  <label className="block text-sm text-gray-400 mb-1">优先级 (数值越小越优先)</label>
                  <input
                    type="number"
                    min="1"
                    max="1000"
                    value={formData.priority}
                    onChange={e => setFormData({...formData, priority: Number(e.target.value)})}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                  />
                </div>
                
                {/* QPS */}
                <div>
                  <label className="block text-sm text-gray-400 mb-1">QPS (每秒请求数)</label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={formData.qps}
                    onChange={e => setFormData({...formData, qps: Number(e.target.value)})}
                    className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                  />
                  <p className="text-xs text-gray-500 mt-1">控制翻译请求频率，避免触发 API 限流</p>
                </div>
              </div>
              
              <div className="flex gap-2 mt-4">
                <button
                  onClick={isAdding ? createProvider : updateProvider}
                  disabled={saveStatus === 'saving'}
                  className={`px-4 py-2 text-white rounded-lg transition-all min-w-[100px] ${
                    saveStatus === 'saving' ? 'bg-cyan-400 cursor-wait' :
                    saveStatus === 'saved' ? 'bg-green-600' :
                    saveStatus === 'error' ? 'bg-red-600' :
                    'bg-cyan-600 hover:bg-cyan-700'
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
                  className="px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-500"
                >
                  取消
                </button>
              </div>
            </div>
          )}

          {/* 提供商列表 */}
          <div className="bg-gray-800 rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-700">
                <tr>
                  <th className="px-4 py-3 text-left text-gray-300 text-sm">名称</th>
                  <th className="px-4 py-3 text-left text-gray-300 text-sm">引擎类型</th>
                  <th className="px-4 py-3 text-left text-gray-300 text-sm">模型</th>
                  <th className="px-4 py-3 text-left text-gray-300 text-sm">API Key</th>
                  <th className="px-4 py-3 text-left text-gray-300 text-sm">优先级</th>
                  <th className="px-4 py-3 text-left text-gray-300 text-sm">QPS</th>
                  <th className="px-4 py-3 text-left text-gray-300 text-sm">状态</th>
                  <th className="px-4 py-3 text-left text-gray-300 text-sm">操作</th>
                </tr>
              </thead>
              <tbody>
                {providers.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                      <div className="text-4xl mb-3">🌐</div>
                      <p>暂无翻译引擎配置</p>
                      <button
                        onClick={handleAdd}
                        className="mt-3 px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700"
                      >
                        ➕ 添加第一个翻译引擎
                      </button>
                    </td>
                  </tr>
                ) : (
                  providers.map(provider => (
                    <tr key={provider.id} className="border-t border-gray-700 hover:bg-gray-750">
                      <td className="px-4 py-3 text-white text-sm font-medium">{provider.name}</td>
                      <td className="px-4 py-3 text-gray-300 text-sm">
                        <span className="px-2 py-1 bg-slate-700 rounded text-xs">
                          {ENGINE_TYPES.find(t => t.value === provider.engine_type)?.label || provider.engine_type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-sm">{provider.model || '-'}</td>
                      <td className="px-4 py-3">
                        {provider.has_api_key ? (
                          <span className="px-2 py-1 bg-green-900 text-green-300 rounded text-xs">✅ 已配置</span>
                        ) : (
                          <span className="px-2 py-1 bg-red-900 text-red-300 rounded text-xs">❌ 未配置</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-sm">{provider.priority}</td>
                      <td className="px-4 py-3 text-gray-400 text-sm">{provider.qps}</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => toggleProvider(provider)}
                          className={`px-2 py-1 rounded text-xs cursor-pointer ${
                            provider.enabled
                              ? 'bg-green-900 text-green-300 hover:bg-green-800'
                              : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                          }`}
                        >
                          {provider.enabled ? '✅ 启用' : '⚪ 禁用'}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleEdit(provider)}
                            className="text-blue-400 hover:text-blue-300 text-sm"
                          >
                            ✏️ 编辑
                          </button>
                          <button
                            onClick={() => deleteProvider(provider.id)}
                            className="text-red-400 hover:text-red-300 text-sm"
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
          <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
            <h4 className="text-sm font-semibold text-gray-300 mb-2">💡 配置说明</h4>
            <ul className="text-sm text-gray-400 space-y-1">
              <li>• <strong className="text-cyan-400">翻译引擎</strong>：独立于元数据/分析 LLM 池，专门用于 PDF 翻译</li>
              <li>• <strong className="text-yellow-400">优先级越小越优先</strong>：系统会按优先级顺序尝试翻译引擎</li>
              <li>• <strong className="text-green-400">QPS 限制</strong>：控制每秒请求数，避免触发 API 限流</li>
              <li>• 支持的引擎类型：OpenAI、DeepSeek、SiliconFlow、阿里云 DashScope、智谱 AI、Groq、Gemini、Google Translate、DeepL、Ollama、Azure</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}