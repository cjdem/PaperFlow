'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getMe, logout, User } from '@/lib/api';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface AdminStats {
    user_count: number;
    paper_count: number;
    group_count: number;
}

interface LLMProvider {
    id: number;
    name: string;
    base_url: string;
    api_key: string;
    models: string;
    api_type: string;
    pool_type: string;
    weight: number;  // 保留向后兼容
    priority: number;  // 优先级 (1 最高)
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
    priority: 1,  // 默认最高优先级
    enabled: true,
});

// API 类型配置信息
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

// 池类型配置信息
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
    const [providers, setProviders] = useState<LLMProvider[]>([]);
    const [activeTab, setActiveTab] = useState<'stats' | 'llm'>('stats');
    const [activePoolTab, setActivePoolTab] = useState<'metadata' | 'analysis'>('metadata');
    const [editingProvider, setEditingProvider] = useState<LLMProvider | null>(null);
    const [isAdding, setIsAdding] = useState(false);
    const [formData, setFormData] = useState(createEmptyProvider('metadata'));
    const [retryCount, setRetryCount] = useState('3');  // 重试次数配置

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
        const [statsRes, providersRes] = await Promise.all([
            fetch(`${API_BASE}/api/admin/stats`, { headers }),
            fetch(`${API_BASE}/api/admin/llm-providers`, { headers })
        ]);
        if (statsRes.ok) setStats(await statsRes.json());
        if (providersRes.ok) setProviders(await providersRes.json());
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
        const headers = getHeaders();
        if (isAdding) {
            await fetch(`${API_BASE}/api/admin/llm-providers`, {
                method: 'POST',
                headers,
                body: JSON.stringify(formData)
            });
        } else if (editingProvider) {
            await fetch(`${API_BASE}/api/admin/llm-providers/${editingProvider.id}`, {
                method: 'PUT',
                headers,
                body: JSON.stringify(formData)
            });
        }
        setEditingProvider(null);
        setIsAdding(false);
        await loadData();
    };

    const handleDelete = async (id: number) => {
        if (!confirm('确定要删除这个 LLM 提供商吗？')) return;
        await fetch(`${API_BASE}/api/admin/llm-providers/${id}`, {
            method: 'DELETE',
            headers: getHeaders()
        });
        await loadData();
    };

    const toggleProvider = async (id: number, enabled: boolean) => {
        await fetch(`${API_BASE}/api/admin/llm-providers/${id}/toggle`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify({ enabled: !enabled })
        });
        await loadData();
    };

    const setPrimary = async (id: number) => {
        await fetch(`${API_BASE}/api/admin/llm-providers/${id}/set-primary`, {
            method: 'POST',
            headers: getHeaders()
        });
        await loadData();
    };

    // 按池类型过滤提供商
    const metadataProviders = providers.filter(p => p.pool_type === 'metadata');
    const analysisProviders = providers.filter(p => p.pool_type === 'analysis');
    const currentPoolProviders = activePoolTab === 'metadata' ? metadataProviders : analysisProviders;
    const poolInfo = POOL_INFO[activePoolTab];

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-900 flex items-center justify-center">
                <div className="text-white text-xl">加载中...</div>
            </div>
        );
    }

    const renderProviderForm = () => {
        if (!isAdding && !editingProvider) return null;

        const apiInfo = API_TYPE_INFO[formData.api_type] || API_TYPE_INFO.openai;

        return (
            <div className="bg-slate-800 rounded-xl p-6 border border-purple-500 mb-4">
                <h3 className="text-lg font-semibold text-white mb-4">
                    {isAdding ? `添加 ${POOL_INFO[formData.pool_type]?.label} 模型` : '编辑 LLM 提供商'}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm text-gray-400 mb-1">名称</label>
                        <input
                            type="text"
                            value={formData.name}
                            onChange={e => setFormData({ ...formData, name: e.target.value })}
                            placeholder="例如：OpenAI GPT-4o"
                            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                        />
                    </div>
                    <div>
                        <label className="block text-sm text-gray-400 mb-1">API 类型</label>
                        <select
                            value={formData.api_type}
                            onChange={e => setFormData({ ...formData, api_type: e.target.value })}
                            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                        >
                            <option value="openai">OpenAI 兼容 (OpenAI/DeepSeek/通义千问等)</option>
                            <option value="gemini">Google Gemini</option>
                            <option value="anthropic">Anthropic Claude</option>
                        </select>
                    </div>
                    <div className="md:col-span-2">
                        <label className="block text-sm text-gray-400 mb-1">Base URL</label>
                        <input
                            type="text"
                            value={formData.base_url}
                            onChange={e => setFormData({ ...formData, base_url: e.target.value })}
                            placeholder={apiInfo.urlHint}
                            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                        />
                        <p className="text-xs text-gray-500 mt-1">提示：{apiInfo.urlHint}</p>
                    </div>
                    <div className="md:col-span-2">
                        <label className="block text-sm text-gray-400 mb-1">API Key</label>
                        <input
                            type="password"
                            value={formData.api_key}
                            onChange={e => setFormData({ ...formData, api_key: e.target.value })}
                            placeholder={apiInfo.keyHint}
                            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                        />
                    </div>
                    <div>
                        <label className="block text-sm text-gray-400 mb-1">模型名称</label>
                        <input
                            type="text"
                            value={formData.models}
                            onChange={e => setFormData({ ...formData, models: e.target.value })}
                            placeholder="例如：gpt-4o, gpt-4o-mini"
                            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                        />
                        <p className="text-xs text-gray-500 mt-1">多个模型用逗号分隔</p>
                    </div>
                    <div>
                        <label className="block text-sm text-gray-400 mb-1">优先级 (1 最高)</label>
                        <input
                            type="number"
                            min="1"
                            max="100"
                            value={formData.priority}
                            onChange={e => setFormData({ ...formData, priority: Number(e.target.value) })}
                            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                        />
                        <p className="text-xs text-gray-500 mt-1">数值越小优先级越高，会优先尝试</p>
                    </div>
                </div>
                <div className="flex gap-2 mt-4">
                    <button onClick={handleSave} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                        💾 保存
                    </button>
                    <button
                        onClick={() => { setEditingProvider(null); setIsAdding(false); }}
                        className="px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-500"
                    >
                        取消
                    </button>
                </div>
            </div>
        );
    };

    const renderProviderCard = (p: LLMProvider) => (
        <div key={p.id} className={`bg-slate-800 rounded-xl p-4 border ${p.is_primary ? 'border-purple-500' : 'border-slate-700'}`}>
            <div className="flex justify-between items-start">
                <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-lg font-semibold text-white">{p.name}</h3>
                        {p.is_primary && <span className="px-2 py-0.5 bg-purple-600 text-white text-xs rounded">主要</span>}
                        <span className={`px-2 py-0.5 text-xs rounded ${p.enabled ? 'bg-green-600 text-white' : 'bg-gray-600 text-gray-300'}`}>
                            {p.enabled ? '启用' : '禁用'}
                        </span>
                        <span className="px-2 py-0.5 bg-slate-600 text-gray-300 text-xs rounded">
                            {API_TYPE_INFO[p.api_type]?.label || p.api_type}
                        </span>
                    </div>
                    <div className="mt-2 text-sm text-gray-400 space-y-1">
                        <div>🔗 {p.base_url}</div>
                        <div>🧠 {p.models}</div>
                        <div>🎯 优先级: {p.priority}</div>
                    </div>
                </div>
                <div className="flex flex-wrap gap-2">
                    <button onClick={() => handleEdit(p)} className="px-3 py-1 text-sm bg-blue-600/20 text-blue-400 rounded-lg hover:bg-blue-600/30">
                        ✏️ 编辑
                    </button>
                    <button
                        onClick={() => toggleProvider(p.id, p.enabled)}
                        className={`px-3 py-1 text-sm rounded-lg ${p.enabled ? 'bg-red-600/20 text-red-400 hover:bg-red-600/30' : 'bg-green-600/20 text-green-400 hover:bg-green-600/30'}`}
                    >
                        {p.enabled ? '禁用' : '启用'}
                    </button>
                    {!p.is_primary && p.enabled && (
                        <button onClick={() => setPrimary(p.id)} className="px-3 py-1 text-sm bg-purple-600/20 text-purple-400 rounded-lg hover:bg-purple-600/30">
                            设为主要
                        </button>
                    )}
                    <button onClick={() => handleDelete(p.id)} className="px-3 py-1 text-sm bg-red-600/20 text-red-400 rounded-lg hover:bg-red-600/30">
                        🗑️ 删除
                    </button>
                </div>
            </div>
        </div>
    );

    return (
        <div className="min-h-screen bg-slate-900 p-6">
            <div className="max-w-6xl mx-auto">
                {/* Header */}
                <div className="flex justify-between items-center mb-8">
                    <div>
                        <h1 className="text-3xl font-bold text-white">⚙️ 管理员控制台</h1>
                        <p className="text-gray-400 mt-1">👤 {user?.username}</p>
                    </div>
                    <div className="flex gap-3">
                        <button onClick={() => router.push('/papers')} className="px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600">
                            📚 返回论文
                        </button>
                        <button onClick={() => { logout(); router.push('/'); }} className="px-4 py-2 bg-red-600/20 text-red-400 rounded-lg hover:bg-red-600/30">
                            退出登录
                        </button>
                    </div>
                </div>

                {/* Main Tabs */}
                <div className="flex gap-2 mb-6">
                    <button onClick={() => setActiveTab('stats')} className={`px-4 py-2 rounded-lg font-medium transition ${activeTab === 'stats' ? 'bg-purple-600 text-white' : 'bg-slate-800 text-gray-400 hover:bg-slate-700'}`}>
                        📊 系统统计
                    </button>
                    <button onClick={() => setActiveTab('llm')} className={`px-4 py-2 rounded-lg font-medium transition ${activeTab === 'llm' ? 'bg-purple-600 text-white' : 'bg-slate-800 text-gray-400 hover:bg-slate-700'}`}>
                        🤖 LLM 提供商
                    </button>
                </div>

                {/* Stats Tab */}
                {activeTab === 'stats' && stats && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
                            <div className="text-4xl mb-2">👥</div>
                            <div className="text-3xl font-bold text-white">{stats.user_count}</div>
                            <div className="text-gray-400">用户数</div>
                        </div>
                        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
                            <div className="text-4xl mb-2">📄</div>
                            <div className="text-3xl font-bold text-white">{stats.paper_count}</div>
                            <div className="text-gray-400">论文数</div>
                        </div>
                        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
                            <div className="text-4xl mb-2">📁</div>
                            <div className="text-3xl font-bold text-white">{stats.group_count}</div>
                            <div className="text-gray-400">分组数</div>
                        </div>
                    </div>
                )}

                {/* LLM Tab with Pool Sub-tabs */}
                {activeTab === 'llm' && (
                    <div className="space-y-6">
                        {/* Pool Tabs - 硬隔离展示 */}
                        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
                            <div className="flex gap-4">
                                {(['metadata', 'analysis'] as const).map(poolType => {
                                    const info = POOL_INFO[poolType];
                                    const poolProviders = poolType === 'metadata' ? metadataProviders : analysisProviders;
                                    const isActive = activePoolTab === poolType;
                                    const colorClass = info.color === 'blue'
                                        ? (isActive ? 'bg-blue-600 border-blue-500' : 'bg-slate-700 border-slate-600 hover:border-blue-500')
                                        : (isActive ? 'bg-purple-600 border-purple-500' : 'bg-slate-700 border-slate-600 hover:border-purple-500');

                                    return (
                                        <button
                                            key={poolType}
                                            onClick={() => { setActivePoolTab(poolType); setIsAdding(false); setEditingProvider(null); }}
                                            className={`flex-1 p-4 rounded-xl border-2 transition-all ${colorClass}`}
                                        >
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-2xl">{info.icon}</span>
                                                <span className={`px-2 py-1 rounded text-sm ${poolProviders.length > 0 ? 'bg-green-600/20 text-green-400' : 'bg-yellow-600/20 text-yellow-400'}`}>
                                                    {poolProviders.length > 0 ? `${poolProviders.length} 个配置` : '未配置'}
                                                </span>
                                            </div>
                                            <h3 className="text-lg font-bold text-white text-left">{info.label}</h3>
                                            <p className="text-sm text-gray-400 text-left mt-1">{info.description}</p>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Current Pool Content */}
                        <div className={`rounded-xl border-2 p-6 ${poolInfo.color === 'blue' ? 'border-blue-500/50 bg-blue-500/5' : 'border-purple-500/50 bg-purple-500/5'}`}>
                            <div className="flex justify-between items-center mb-4">
                                <h2 className="text-xl font-bold text-white">
                                    {poolInfo.icon} {poolInfo.label} 模型池
                                </h2>
                                <button
                                    onClick={() => handleAdd(activePoolTab)}
                                    className={`px-4 py-2 rounded-lg text-white ${poolInfo.color === 'blue' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-purple-600 hover:bg-purple-700'}`}
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
                                    <div className="text-center py-10 bg-slate-800/50 rounded-xl border border-dashed border-slate-600">
                                        <div className="text-4xl mb-3">{poolInfo.icon}</div>
                                        <p className="text-gray-400 mb-4">
                                            尚未配置 {poolInfo.label} 模型
                                        </p>
                                        <button
                                            onClick={() => handleAdd(activePoolTab)}
                                            className={`px-4 py-2 rounded-lg text-white ${poolInfo.color === 'blue' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-purple-600 hover:bg-purple-700'}`}
                                        >
                                            ➕ 添加第一个模型
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Retry Configuration */}
                        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
                            <h4 className="text-sm font-semibold text-gray-300 mb-3">⚙️ 重试配置</h4>
                            <div className="flex items-center gap-4">
                                <div className="flex-1">
                                    <label className="block text-sm text-gray-400 mb-1">单模型重试次数</label>
                                    <input
                                        type="number"
                                        min="1"
                                        max="10"
                                        value={retryCount}
                                        onChange={e => setRetryCount(e.target.value)}
                                        className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                                    />
                                    <p className="text-xs text-gray-500 mt-1">每个模型失败后重试的次数，用尽后切换到下一个模型</p>
                                </div>
                                <button
                                    onClick={saveRetryConfig}
                                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 self-center mt-4"
                                >
                                    💾 保存
                                </button>
                            </div>
                        </div>

                        {/* Info Box */}
                        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
                            <h4 className="text-sm font-semibold text-gray-300 mb-2">💡 配置说明</h4>
                            <ul className="text-sm text-gray-400 space-y-1">
                                <li>• <strong className="text-blue-400">元数据提取</strong>：处理论文头部信息，推荐快速模型如 gpt-4o-mini、gemini-flash</li>
                                <li>• <strong className="text-purple-400">深度分析</strong>：生成详细报告，推荐强力模型如 gpt-4o、claude-3.5-sonnet</li>
                                <li>• 两个池独立配置，互不影响，支持不同的 API 类型和模型</li>
                                <li>• <strong className="text-yellow-400">优先级越小越优先</strong>：模型按优先级顺序尝试，每个模型会先重试 N 次再切换</li>
                            </ul>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
