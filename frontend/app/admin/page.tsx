
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getMe, logout, User } from '@/lib/api';
import TranslationMonitor from '@/components/TranslationMonitor';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface AdminStats {
    user_count: number;
    paper_count: number;
    group_count: number;
}

interface UserStorageStats {
    user_id: number;
    username: string;
    file_count: number;
    total_size: number;
    total_size_formatted: string;
}

interface StorageStats {
    total_files: number;
    total_size: number;
    total_size_formatted: string;
    users: UserStorageStats[];
}

interface LLMProvider {
    id: number;
    name: string;
    base_url: string;
    api_key: string;
    models: string;
    api_type: string;
    pool_type: string;
    weight: number;
    priority: number;
    enabled: boolean;
    is_primary: boolean;
}

const createEmptyProvider = (poolType: string): Omit<LLMProvider, 'id' | 'is_primary'> => ({
    name: '',
    base_url: '',
    api_key: '',
    models: '',
    api_type: 'openai',
    pool_type: poolType,
    weight: 10,
    priority: 1,
    enabled: true,
});

const API_TYPE_INFO: Record<string, { label: string; urlHint: string; keyHint: string }> = {
    openai: {
        label: 'OpenAI 兼容',
        urlHint: 'https://api.openai.com/v1 或 https://api.deepseek.com/v1',
        keyHint: 'sk-...',
    },
    gemini: {
        label: 'Google Gemini',
        urlHint: 'https://generativelanguage.googleapis.com/v1beta',
        keyHint: 'AIzaSy...',
    },
    anthropic: {
        label: 'Anthropic Claude',
        urlHint: 'https://api.anthropic.com',
        keyHint: 'sk-ant-...',
    },
};

const POOL_INFO: Record<string, { label: string; icon: string; description: string; color: string }> = {
    metadata: {
        label: '元数据提取',
        icon: '📋',
        description: '用于提取论文标题、作者、期刊等元数据信息。推荐使用响应快速的小模型。',
        color: 'blue',
    },
    analysis: {
        label: '深度分析',
        icon: '🔬',
        description: '用于生成论文详细分析报告。推荐使用推理能力强的大模型。',
        color: 'purple',
    },
};

export default function AdminPage() {
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState<AdminStats | null>(null);
    const [storageStats, setStorageStats] = useState<StorageStats | null>(null);
    const [providers, setProviders] = useState<LLMProvider[]>([]);
    const [activeTab, setActiveTab] = useState<'stats' | 'storage' | 'llm' | 'translate'>('stats');
    const [activePoolTab, setActivePoolTab] = useState<'metadata' | 'analysis'>('metadata');
    const [editingProvider, setEditingProvider] = useState<LLMProvider | null>(null);
    const [isAdding, setIsAdding] = useState(false);
    const [formData, setFormData] = useState(createEmptyProvider('metadata'));
    const [retryCount, setRetryCount] = useState('3');
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

    useEffect(() => {
        const init = async () => {
            try {
                const userData = await getMe();
                if (userData.role !== 'admin') {
                    alert('需要管理员权限');
                    router.push('/papers');
                    return;
                }
                setUser(userData);
                await loadData();
                await loadRetryConfig();
            } catch {
                router.push('/');
            } finally {
                setLoading(false);
            }
        };
        init();
    }, [router]);

    const loadRetryConfig = async () => {
        const headers = getHeaders();
        const res = await fetch(`${API_BASE}/api/admin/config/llm_max_retries`, { headers });
        if (res.ok) {
            const data = await res.json();
            if (data.value) setRetryCount(data.value);
        }
    };

    const saveRetryConfig = async () => {
        const headers = getHeaders();
        await fetch(`${API_BASE}/api/admin/config`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ key: 'llm_max_retries', value: retryCount })
        });
        alert('重试次数已保存');
    };

    const getHeaders = () => {
        const token = localStorage.getItem('token');
        return {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
        };
    };

    const loadData = async () => {
        const headers = getHeaders();
        const [statsRes, providersRes, storageRes] = await Promise.all([
            fetch(`${API_BASE}/api/admin/stats`, { headers }),
            fetch(`${API_BASE}/api/admin/llm-providers`, { headers }),
            fetch(`${API_BASE}/api/admin/storage-stats`, { headers })
        ]);
        if (statsRes.ok) setStats(await statsRes.json());
        if (providersRes.ok) setProviders(await providersRes.json());
        if (storageRes.ok) setStorageStats(await storageRes.json());
    };

    const handleEdit = (p: LLMProvider) => {
        setEditingProvider(p);
        setFormData({
            name: p.name,
            base_url: p.base_url,
            api_key: p.api_key,
            models: p.models,
            api_type: p.api_type,
            pool_type: p.pool_type,
            weight: p.weight,
            priority: p.priority,
            enabled: p.enabled,
        });
        setIsAdding(false);
    };

    const handleAdd = (poolType: string) => {
        setEditingProvider(null);
        setFormData(createEmptyProvider(poolType));
        setIsAdding(true);
    };

    const handleSave = async () => {
        setSaveStatus('saving');
        const headers = getHeaders();

        try {
            let response;
            if (isAdding) {
                response = await fetch(`${API_BASE}/api/admin/llm-providers`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(formData)
                });
            } else if (editingProvider) {
                response = await fetch(`${API_BASE}/api/admin/llm-providers/${editingProvider.id}`, {
                    method: 'PUT',
                    headers,
                    body: JSON.stringify(formData)
                });
            }

            if (!response?.ok) {
                throw new Error('保存失败');
            }

            const savedProvider: LLMProvider = await response.json();

            if (isAdding) {
                setProviders(prev => [...prev, savedProvider]);
            } else if (editingProvider) {
                setProviders(prev => prev.map(p =>
                    p.id === editingProvider.id ? savedProvider : p
                ));
            }

            setSaveStatus('saved');
            setEditingProvider(null);
            setIsAdding(false);

            setTimeout(() => setSaveStatus('idle'), 2000);

        } catch (error) {
            setSaveStatus('error');
            console.error('保存失败:', error);
            setTimeout(() => setSaveStatus('idle'), 3000);
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm('确定要删除这个 LLM 提供商吗？')) return;

        const previousProviders = [...providers];
        setProviders(prev => prev.filter(p => p.id !== id));

        try {
            const res = await fetch(`${API_BASE}/api/admin/llm-providers/${id}`, {
                method: 'DELETE',
                headers: getHeaders()
            });

            if (!res.ok) {
                setProviders(previousProviders);
            }
        } catch {
            setProviders(previousProviders);
        }
    };

    const toggleProvider = async (id: number, enabled: boolean) => {
        setProviders(prev => prev.map(p =>
            p.id === id ? { ...p, enabled: !enabled } : p
        ));

        try {
            const res = await fetch(`${API_BASE}/api/admin/llm-providers/${id}/toggle`, {
                method: 'POST',
                headers: getHeaders(),
                body: JSON.stringify({ enabled: !enabled })
            });

            if (!res.ok) {
                setProviders(prev => prev.map(p =>
                    p.id === id ? { ...p, enabled: enabled } : p
                ));
            }
        } catch {
            setProviders(prev => prev.map(p =>
                p.id === id ? { ...p, enabled: enabled } : p
            ));
        }
    };

    const setPrimary = async (id: number) => {
        const targetProvider = providers.find(p => p.id === id);
        if (!targetProvider) return;

        const previousProviders = [...providers];
        setProviders(prev => prev.map(p => {
            if (p.pool_type === targetProvider.pool_type) {
                return { ...p, is_primary: p.id === id };
            }
            return p;
        }));

        try {
            const res = await fetch(`${API_BASE}/api/admin/llm-providers/${id}/set-primary`, {
                method: 'POST',
                headers: getHeaders()
            });

            if (!res.ok) {
                setProviders(previousProviders);
            }
        } catch {
            setProviders(previousProviders);
        }
    };

    const metadataProviders = providers.filter(p => p.pool_type === 'metadata');
    const analysisProviders = providers.filter(p => p.pool_type === 'analysis');
    const currentPoolProviders = activePoolTab === 'metadata' ? metadataProviders : analysisProviders;
    const poolInfo = POOL_INFO[activePoolTab];

    if (loading) {
        return (
            <div className="min-h-screen fluent-background flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-[var(--fluent-blue-500)] border-t-transparent rounded-full animate-spin" />
                    <div className="text-[var(--fluent-foreground)] text-lg font-medium">加载中...</div>
                </div>
            </div>
        );
    }

    const renderProviderForm = () => {
        if (!isAdding && !editingProvider) return null;

        const apiInfo = API_TYPE_INFO[formData.api_type] || API_TYPE_INFO.openai;

        return (
            <div className="fluent-card p-6 border-2 border-purple-500/50 mb-6 fluent-scale-in">
                <h3 className="text-lg font-semibold text-[var(--fluent-foreground)] mb-5">
                    {isAdding ? `➕ 添加 ${POOL_INFO[formData.pool_type]?.label} 模型` : '✏️ 编辑 LLM 提供商'}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div>
                        <label className="block text-sm font-medium text-[var(--fluent-foreground)] mb-2">名称</label>
                        <input
                            type="text"
                            value={formData.name}
                            onChange={e => setFormData({ ...formData, name: e.target.value })}
                            placeholder="例如：OpenAI GPT-4o"
                            className="fluent-input w-full"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-[var(--fluent-foreground)] mb-2">API 类型</label>
                        <select
                            value={formData.api_type}
                            onChange={e => setFormData({ ...formData, api_type: e.target.value })}
                            className="fluent-select w-full"
                        >
                            <option value="openai">OpenAI 兼容 (OpenAI/DeepSeek/通义千问等)</option>
                            <option value="gemini">Google Gemini</option>
                            <option value="anthropic">Anthropic Claude</option>
                        </select>
                    </div>
                    <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-[var(--fluent-foreground)] mb-2">Base URL</label>
                        <input
                            type="text"
                            value={formData.base_url}
                            onChange={e => setFormData({ ...formData, base_url: e.target.value })}
                            placeholder={apiInfo.urlHint}
                            className="fluent-input w-full"
                        />
                        <p className="text-xs text-[var(--fluent-foreground-secondary)] mt-1.5">💡 提示：{apiInfo.urlHint}</p>
                    </div>
                    <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-[var(--fluent-foreground)] mb-2">API Key</label>
                        <input
                            type="password"
                            value={formData.api_key}
                            onChange={e => setFormData({ ...formData, api_key: e.target.value })}
                            placeholder={apiInfo.keyHint}
                            className="fluent-input w-full"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-[var(--fluent-foreground)] mb-2">模型名称</label>
                        <input
                            type="text"
                            value={formData.models}
                            onChange={e => setFormData({ ...formData, models: e.target.value })}
                            placeholder="例如：gpt-4o, gpt-4o-mini"
                            className="fluent-input w-full"
                        />
                        <p className="text-xs text-[var(--fluent-foreground-secondary)] mt-1.5">💡 多个模型用逗号分隔，按顺序依次尝试</p>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-[var(--fluent-foreground)] mb-2">优先级 (1 最高)</label>
                        <input
                            type="number"
                            min="1"
                            max="100"
                            value={formData.priority}
                            onChange={e => setFormData({ ...formData, priority: Number(e.target.value) })}
                            className="fluent-input w-full"
                        />
                        <p className="text-xs text-[var(--fluent-foreground-secondary)] mt-1.5">💡 数值越小优先级越高，会优先尝试</p>
                    </div>
                </div>
                <div className="flex gap-3 mt-6 pt-5 border-t border-[var(--fluent-divider)]">
                    <button
                        onClick={handleSave}
                        disabled={saveStatus === 'saving'}
                        className={`fluent-button px-5 py-2.5 min-w-[120px] font-medium ${
                            saveStatus === 'saving' ? 'bg-purple-400 cursor-wait' :
                            saveStatus === 'saved' ? 'bg-green-600 text-white' :
                            saveStatus === 'error' ? 'bg-red-600 text-white' :
                            'fluent-button-accent'
                        }`}
                    >
                        {saveStatus === 'saving' ? '⏳ 保存中...' :
                            saveStatus === 'saved' ? '✅ 已保存' :
                            saveStatus === 'error' ? '❌ 保存失败' :
                            '💾 保存'}
                    </button>
                    <button
                        onClick={() => { setEditingProvider(null); setIsAdding(false); setSaveStatus('idle'); }}
                        className="fluent-button fluent-button-subtle px-5 py-2.5 font-medium"
                        disabled={saveStatus === 'saving'}
                    >
                        取消
                    </button>
                </div>
            </div>
        );
    };

    const renderProviderCard = (p: LLMProvider) => (
        <div key={p.id} className={`fluent-card p-5 transition-all hover:shadow-lg ${p.is_primary ? 'border-purple-500/70 shadow-purple-500/10' : ''}`}>
            <div className="flex justify-between items-start gap-4">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-3">
                        <h3 className="text-lg font-semibold text-[var(--fluent-foreground)]">{p.name}</h3>
                        {p.is_primary && <span className="fluent-badge-accent px-2.5 py-1 text-xs font-medium">⭐ 主要</span>}
                        <span className={`fluent-badge px-2.5 py-1 text-xs font-medium ${p.enabled ? 'fluent-badge-success' : ''}`}>
                            {p.enabled ? '✓ 启用' : '○ 禁用'}
                        </span>
                        <span className="fluent-badge px-2.5 py-1 text-xs">
                            {API_TYPE_INFO[p.api_type]?.label || p.api_type}
                        </span>
                    </div>
                    <div className="text-sm text-[var(--fluent-foreground-secondary)] space-y-1.5">
                        <div className="flex items-center gap-2">
                            <span className="opacity-60">🔗</span>
                            <span className="truncate">{p.base_url}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="opacity-60">🧠</span>
                            <span className="text-purple-400 font-medium">{p.models}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="opacity-60">🎯</span>
                            <span>优先级: <span className="text-yellow-400 font-medium">{p.priority}</span></span>
                        </div>
                    </div>
                </div>
                <div className="flex flex-col gap-2">
                    <button onClick={() => handleEdit(p)} className="fluent-button fluent-button-subtle px-3 py-1.5 text-sm font-medium">
                        ✏️ 编辑
                    </button>
                    <button
                        onClick={() => toggleProvider(p.id, p.enabled)}
                        className={`fluent-button px-3 py-1.5 text-sm font-medium ${p.enabled ? 'bg-orange-500/20 text-orange-400 hover:bg-orange-500/30' : 'bg-green-500/20 text-green-400 hover:bg-green-500/30'}`}
                    >
                        {p.enabled ? '⏸ 禁用' : '▶ 启用'}
                    </button>
                    {!p.is_primary && p.enabled && (
                        <button onClick={() => setPrimary(p.id)} className="fluent-button px-3 py-1.5 text-sm bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 font-medium">
                            ⭐ 设为主要
                        </button>
                    )}
                    <button onClick={() => handleDelete(p.id)} className="fluent-button px-3 py-1.5 text-sm bg-red-500/20 text-red-400 hover:bg-red-500/30 font-medium">
                        🗑️ 删除
                    </button>
                </div>
            </div>
        </div>
    );

    return (
        <div className="min-h-screen fluent-background p-6">
            <div className="max-w-6xl mx-auto">
                {/* Header */}
                <div className="flex justify-between items-center mb-8 fluent-fade-in">
                    <div>
                        <h1 className="text-3xl font-bold text-[var(--fluent-foreground)]">⚙️ 管理员控制台</h1>
                        <p className="text-[var(--fluent-foreground-secondary)] mt-1">👤 {user?.username}</p>
                    </div>
                    <div className="flex gap-3">
                        <button onClick={() => router.push('/papers')} className="fluent-button fluent-button-accent px-4 py-2.5 font-medium">
                            📚 返回论文
                        </button>
                        <button onClick={() => { logout(); router.push('/'); }} className="fluent-button fluent-button-subtle px-4 py-2.5">
                            🚪 退出登录
                        </button>
                    </div>
                </div>

                {/* Main Tabs */}
                <div className="fluent-tabs mb-6 fluent-fade-in" style={{ animationDelay: '50ms' }}>
                    <button onClick={() => setActiveTab('stats')} className={`fluent-tab ${activeTab === 'stats' ? 'active' : ''}`}>
                        📊 系统统计
                    </button>
                    <button onClick={() => setActiveTab('storage')} className={`fluent-tab ${activeTab === 'storage' ? 'active' : ''}`}>
                        💾 存储统计
                    </button>
                    <button onClick={() => setActiveTab('llm')} className={`fluent-tab ${activeTab === 'llm' ? 'active' : ''}`}>
                        🤖 LLM 提供商
                    </button>
                    <button onClick={() => setActiveTab('translate')} className={`fluent-tab ${activeTab === 'translate' ? 'active' : ''}`}>
                        🌐 翻译配置
                    </button>
                </div>

                {/* Stats Tab */}
                {activeTab === 'stats' && stats && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="fluent-stat-card-enhanced fluent-stat-card-blue fluent-stagger-item group">
                            <div className="flex items-start justify-between">
                                <div>
                                    <div className="text-sm font-medium text-[var(--text-secondary)] mb-2">用户数</div>
                                    <div className="text-4xl font-bold text-[var(--text-primary)] mb-1">{stats.user_count}</div>
                                    <div className="text-xs text-[var(--text-tertiary)]">注册用户总数</div>
                                </div>
                                <div className="fluent-stat-icon">
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                                        <circle cx="9" cy="7" r="4"/>
                                        <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                                        <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                                    </svg>
                                </div>
                            </div>
                        </div>
                        <div className="fluent-stat-card-enhanced fluent-stat-card-purple fluent-stagger-item group">
                            <div className="flex items-start justify-between">
                                <div>
                                    <div className="text-sm font-medium text-[var(--text-secondary)] mb-2">论文数</div>
                                    <div className="text-4xl font-bold text-[var(--text-primary)] mb-1">{stats.paper_count}</div>
                                    <div className="text-xs text-[var(--text-tertiary)]">已上传论文总数</div>
                                </div>
                                <div className="fluent-stat-icon fluent-stat-icon-purple">
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                                        <polyline points="14,2 14,8 20,8"/>
                                        <line x1="16" y1="13" x2="8" y2="13"/>
                                        <line x1="16" y1="17" x2="8" y2="17"/>
                                        <polyline points="10,9 9,9 8,9"/>
                                    </svg>
                                </div>
                            </div>
                        </div>
                        <div className="fluent-stat-card-enhanced fluent-stat-card-green fluent-stagger-item group">
                            <div className="flex items-start justify-between">
                                <div>
                                    <div className="text-sm font-medium text-[var(--text-secondary)] mb-2">分组数</div>
                                    <div className="text-4xl font-bold text-[var(--text-primary)] mb-1">{stats.group_count}</div>
                                    <div className="text-xs text-[var(--text-tertiary)]">论文分组总数</div>
                                </div>
                                <div className="fluent-stat-icon fluent-stat-icon-green">
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                                    </svg>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Storage Stats Tab */}
                {activeTab === 'storage' && storageStats && (
                    <div className="space-y-6">
                        {/* 总体统计 */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="fluent-stat-card-enhanced fluent-stat-card-blue fluent-stagger-item group">
                                <div className="flex items-start justify-between">
                                    <div>
                                        <div className="text-sm font-medium text-[var(--text-secondary)] mb-2">总文件数</div>
                                        <div className="text-4xl font-bold text-[var(--text-primary)] mb-1">{storageStats.total_files}</div>
                                        <div className="text-xs text-[var(--text-tertiary)]">所有用户上传的文件</div>
                                    </div>
                                    <div className="fluent-stat-icon">
                                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/>
                                            <polyline points="13,2 13,9 20,9"/>
                                        </svg>
                                    </div>
                                </div>
                            </div>
                            <div className="fluent-stat-card-enhanced fluent-stat-card-orange fluent-stagger-item group">
                                <div className="flex items-start justify-between">
                                    <div>
                                        <div className="text-sm font-medium text-[var(--text-secondary)] mb-2">总存储空间</div>
                                        <div className="text-4xl font-bold text-[var(--text-primary)] mb-1">{storageStats.total_size_formatted}</div>
                                        <div className="text-xs text-[var(--text-tertiary)]">已使用的磁盘空间</div>
                                    </div>
                                    <div className="fluent-stat-icon fluent-stat-icon-orange">
                                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <ellipse cx="12" cy="5" rx="9" ry="3"/>
                                            <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
                                            <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
                                        </svg>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* 用户存储详情 */}
                        <div className="fluent-card overflow-hidden fluent-stagger-item" style={{ animationDelay: '100ms' }}>
                            <div className="p-5 border-b border-[var(--fluent-divider)] flex items-center justify-between">
                                <h3 className="text-lg font-semibold text-[var(--text-primary)] flex items-center gap-2">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[var(--fluent-blue-400)]">
                                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                                        <circle cx="9" cy="7" r="4"/>
                                        <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                                        <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                                    </svg>
                                    用户存储详情
                                </h3>
                                <span className="fluent-badge fluent-badge-info">{storageStats.users.length} 位用户</span>
                            </div>
                            <div className="overflow-x-auto scrollbar-glass">
                                <table className="fluent-table-glass w-full">
                                    <thead>
                                        <tr>
                                            <th className="text-left">用户</th>
                                            <th className="text-right">文件数</th>
                                            <th className="text-right">存储空间</th>
                                            <th className="text-right">占比</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {storageStats.users.length === 0 ? (
                                            <tr>
                                                <td colSpan={4} className="text-center py-12">
                                                    <div className="text-4xl mb-2">📭</div>
                                                    <span className="text-[var(--text-secondary)]">暂无存储数据</span>
                                                </td>
                                            </tr>
                                        ) : (
                                            storageStats.users.map((user, index) => (
                                                <tr key={user.user_id} className="fluent-stagger-item" style={{ animationDelay: `${(index + 2) * 50}ms` }}>
                                                    <td>
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-sm font-medium">
                                                                {user.username.charAt(0).toUpperCase()}
                                                            </div>
                                                            <span className="font-medium text-[var(--text-primary)]">{user.username}</span>
                                                        </div>
                                                    </td>
                                                    <td className="text-right text-[var(--text-secondary)]">
                                                        <span className="fluent-badge">{user.file_count} 个</span>
                                                    </td>
                                                    <td className="text-right text-[var(--text-primary)] font-medium">
                                                        {user.total_size_formatted}
                                                    </td>
                                                    <td className="text-right">
                                                        <div className="flex items-center justify-end gap-3">
                                                            <div className="w-24 fluent-progress-glass">
                                                                <div
                                                                    className="fluent-progress-glass-bar"
                                                                    style={{
                                                                        width: `${storageStats.total_size > 0
                                                                            ? (user.total_size / storageStats.total_size) * 100
                                                                            : 0}%`
                                                                    }}
                                                                />
                                                            </div>
                                                            <span className="text-[var(--text-secondary)] text-sm w-14 text-right font-medium">
                                                                {storageStats.total_size > 0
                                                                    ? ((user.total_size / storageStats.total_size) * 100).toFixed(1)
                                                                    : 0}%
                                                            </span>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* 存储说明 */}
                        <div className="fluent-card p-5">
                            <h4 className="text-sm font-semibold text-[var(--fluent-foreground)] mb-3">💡 存储说明</h4>
                            <ul className="text-sm text-[var(--fluent-foreground-secondary)] space-y-2">
                                <li>• 文件按用户隔离存储，每个用户的文件存放在独立目录</li>
                                <li>• 同一用户上传相同文件（MD5 相同）会自动去重</li>
                                <li>• 删除论文时会同步删除对应的 PDF 文件</li>
                                <li>• 存储路径：<code className="fluent-badge px-2 py-0.5 text-purple-400">uploads/papers/user_&#123;id&#125;/</code></li>
                            </ul>
                        </div>
                    </div>
                )}

                {/* LLM Tab with Pool Sub-tabs */}
                {activeTab === 'llm' && (
                    <div className="space-y-6 fluent-fade-in" style={{ animationDelay: '100ms' }}>
                        {/* Pool Tabs */}
                        <div className="fluent-card p-4">
                            <div className="flex gap-4">
                                {(['metadata', 'analysis'] as const).map(poolType => {
                                    const info = POOL_INFO[poolType];
                                    const poolProviders = poolType === 'metadata' ? metadataProviders : analysisProviders;
                                    const isActive = activePoolTab === poolType;

                                    return (
                                        <button
                                            key={poolType}
                                            onClick={() => { setActivePoolTab(poolType); setIsAdding(false); setEditingProvider(null); }}
                                            className={`flex-1 p-4 rounded-xl border-2 transition-all ${
                                                isActive
                                                    ? info.color === 'blue'
                                                        ? 'bg-blue-500/20 border-blue-500'
                                                        : 'bg-purple-500/20 border-purple-500'
                                                    : 'border-[var(--fluent-border)] hover:border-[var(--fluent-blue-500)]'
                                            }`}
                                        >
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-2xl">{info.icon}</span>
                                                <span className={`fluent-badge px-2 py-1 text-sm ${poolProviders.length > 0 ? 'fluent-badge-success' : 'bg-yellow-500/20 text-yellow-400'}`}>
                                                    {poolProviders.length > 0 ? `${poolProviders.length} 个配置` : '未配置'}
                                                </span>
                                            </div>
                                            <h3 className="text-lg font-bold text-[var(--fluent-foreground)] text-left">{info.label}</h3>
                                            <p className="text-sm text-[var(--fluent-foreground-secondary)] text-left mt-1">{info.description}</p>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Current Pool Content */}
                        <div className={`fluent-card p-6 border-2 ${poolInfo.color === 'blue' ? 'border-blue-500/50' : 'border-purple-500/50'}`}>
                            <div className="flex justify-between items-center mb-4">
                                <h2 className="text-xl font-bold text-[var(--fluent-foreground)]">
                                    {poolInfo.icon} {poolInfo.label} 模型池
                                </h2>
                                <button
                                    onClick={() => handleAdd(activePoolTab)}
                                    className={`fluent-button px-4 py-2 ${poolInfo.color === 'blue' ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'fluent-button-accent'}`}
                                >
                                    ➕ 添加模型
                                </button>
                            </div>

                            {/* Edit Form */}
                            {renderProviderForm()}

                            {/* Provider List */}
                            <div className="space-y-3">
                                {currentPoolProviders.map(renderProviderCard)}

                                {currentPoolProviders.length === 0 && !isAdding && (
                                    <div className="text-center py-10 fluent-card border-dashed">
                                        <div className="text-4xl mb-3">{poolInfo.icon}</div>
                                        <p className="text-[var(--fluent-foreground-secondary)] mb-4">
                                            尚未配置 {poolInfo.label} 模型
                                        </p>
                                        <button
                                            onClick={() => handleAdd(activePoolTab)}
                                            className={`fluent-button px-4 py-2 ${poolInfo.color === 'blue' ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'fluent-button-accent'}`}
                                        >
                                            ➕ 添加第一个模型
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Retry Configuration */}
                        <div className="fluent-card p-5">
                            <h4 className="text-base font-semibold text-[var(--fluent-foreground)] mb-4">⚙️ 重试配置</h4>
                            <div className="flex items-end gap-4">
                                <div className="flex-1 max-w-xs">
                                    <label className="block text-sm font-medium text-[var(--fluent-foreground-secondary)] mb-2">单模型重试次数</label>
                                    <input
                                        type="number"
                                        min="1"
                                        max="10"
                                        value={retryCount}
                                        onChange={e => setRetryCount(e.target.value)}
                                        className="fluent-input w-full"
                                    />
                                    <p className="text-xs text-[var(--fluent-foreground-secondary)] mt-1.5">💡 每个模型失败后重试的次数，用尽后切换到下一个模型</p>
                                </div>
                                <button
                                    onClick={saveRetryConfig}
                                    className="fluent-button fluent-button-accent px-5 py-2.5 font-medium"
                                >
                                    💾 保存
                                </button>
                            </div>
                        </div>

                        {/* Info Box */}
                        <div className="fluent-card p-5">
                            <h4 className="text-base font-semibold text-[var(--fluent-foreground)] mb-3">💡 配置说明</h4>
                            <ul className="text-sm text-[var(--fluent-foreground-secondary)] space-y-2">
                                <li>• <strong className="text-blue-400">元数据提取</strong>：处理论文头部信息，推荐快速模型如 gpt-4o-mini、gemini-flash</li>
                                <li>• <strong className="text-purple-400">深度分析</strong>：生成详细报告，推荐强力模型如 gpt-4o、claude-3.5-sonnet</li>
                                <li>• 两个池独立配置，互不影响，支持不同的 API 类型和模型</li>
                                <li>• <strong className="text-yellow-400">优先级越小越优先</strong>：模型按优先级顺序尝试，每个模型会先重试 N 次再切换</li>
                            </ul>
                        </div>
                    </div>
                )}

                {/* Translation Tab */}
                {activeTab === 'translate' && (
                    <div className="fluent-fade-in" style={{ animationDelay: '100ms' }}>
                        <TranslationMonitor />
                    </div>
                )}
            </div>
        </div>
    );
}
