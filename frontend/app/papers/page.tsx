'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getMe, logout, getPapers, getGroups, createGroup, deletePaper, uploadPapersWithProgress, User, Paper, Group, updatePaperGroups, UploadProgress } from '@/lib/api';
import MarkdownRenderer from '@/components/MarkdownRenderer';


export default function PapersPage() {
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [papers, setPapers] = useState<Paper[]>([]);
    const [groups, setGroups] = useState<Group[]>([]);
    const [currentView, setCurrentView] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
    const [uploadLogs, setUploadLogs] = useState<(UploadProgress & { time: string })[]>([]);
    const [expandedPaper, setExpandedPaper] = useState<number | null>(null);
    const [detailTab, setDetailTab] = useState<'analysis' | 'abstract_cn' | 'abstract_en'>('analysis');
    const [newGroupName, setNewGroupName] = useState('');

    // 加载数据
    const loadData = useCallback(async () => {
        try {
            const [papersData, groupsData] = await Promise.all([
                getPapers(currentView, searchQuery || undefined),
                getGroups()
            ]);
            setPapers(papersData.papers);
            setGroups(groupsData);
        } catch (err) {
            console.error('加载数据失败:', err);
        }
    }, [currentView, searchQuery]);

    useEffect(() => {
        const init = async () => {
            try {
                const userData = await getMe();
                setUser(userData);
                await loadData();
            } catch {
                router.push('/');
            } finally {
                setLoading(false);
            }
        };
        init();
    }, [router, loadData]);

    useEffect(() => {
        if (user) loadData();
    }, [currentView, searchQuery, user, loadData]);

    const handleLogout = () => {
        logout();
        router.push('/');
    };

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        setUploading(true);
        setUploadProgress(null);
        setUploadLogs([]);

        let lastSuccessIndex = -1;

        try {
            await uploadPapersWithProgress(Array.from(files), async (progress) => {
                setUploadProgress(progress);
                setUploadLogs(prev => [...prev, {
                    time: new Date().toLocaleTimeString(),
                    ...progress
                }]);

                // 当一个文件处理成功时，立即刷新论文列表
                if (progress.status === 'success' && progress.fileIndex !== undefined && progress.fileIndex > lastSuccessIndex) {
                    lastSuccessIndex = progress.fileIndex;
                    await loadData();
                }
            });
            // 最终再刷新一次确保数据完整
            await loadData();
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : '上传失败';
            setUploadLogs(prev => [...prev, {
                time: new Date().toLocaleTimeString(),
                filename: 'System',
                step: 0,
                total: 0,
                message: `❌ ${errorMsg}`,
                status: 'error' as const
            }]);
        } finally {
            setUploading(false);
            e.target.value = '';
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm('确定要删除这篇论文吗？')) return;
        try {
            await deletePaper(id);
            await loadData();
        } catch (err) {
            alert(err instanceof Error ? err.message : '删除失败');
        }
    };

    const handleCreateGroup = async () => {
        if (!newGroupName.trim()) return;
        try {
            await createGroup(newGroupName.trim());
            setNewGroupName('');
            await loadData();
        } catch (err) {
            alert(err instanceof Error ? err.message : '创建失败');
        }
    };

    const handleGroupToggle = async (paperId: number, groupName: string, currentGroups: Group[]) => {
        const currentNames = currentGroups.map(g => g.name);
        const newGroups = currentNames.includes(groupName)
            ? currentNames.filter(n => n !== groupName)
            : [...currentNames, groupName];

        try {
            await updatePaperGroups(paperId, newGroups);
            await loadData();
        } catch (err) {
            alert(err instanceof Error ? err.message : '更新失败');
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-900 flex items-center justify-center">
                <div className="text-white text-xl">加载中...</div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-900 flex">
            {/* 侧边栏 */}
            <aside className="w-64 bg-slate-800 border-r border-slate-700 flex flex-col">
                <div className="p-4 border-b border-slate-700">
                    <h1 className="text-xl font-bold text-white">🧬 PaperFlow</h1>
                    <p className="text-sm text-gray-400 mt-1">👤 {user?.username}</p>
                    {user?.role === 'admin' && (
                        <button
                            onClick={() => router.push('/admin')}
                            className="inline-block mt-2 px-2 py-1 bg-blue-500/20 text-blue-400 text-xs rounded hover:bg-blue-500/30 transition"
                        >
                            ⚙️ 管理员设置
                        </button>
                    )}
                </div>

                {/* 导航 */}
                <nav className="flex-1 p-4 space-y-2">
                    <button
                        onClick={() => setCurrentView('all')}
                        className={`w-full text-left px-3 py-2 rounded-lg transition ${currentView === 'all' ? 'bg-purple-600 text-white' : 'text-gray-300 hover:bg-slate-700'}`}
                    >
                        📚 所有论文
                    </button>
                    <button
                        onClick={() => setCurrentView('ungrouped')}
                        className={`w-full text-left px-3 py-2 rounded-lg transition ${currentView === 'ungrouped' ? 'bg-purple-600 text-white' : 'text-gray-300 hover:bg-slate-700'}`}
                    >
                        📂 未分类
                    </button>

                    <div className="pt-4 border-t border-slate-700">
                        <p className="text-xs text-gray-500 mb-2">分组</p>
                        {groups.map(g => (
                            <button
                                key={g.id}
                                onClick={() => setCurrentView(g.name)}
                                className={`w-full text-left px-3 py-2 rounded-lg transition ${currentView === g.name ? 'bg-purple-600 text-white' : 'text-gray-300 hover:bg-slate-700'}`}
                            >
                                🏷️ {g.name}
                            </button>
                        ))}
                    </div>

                    {/* 新建分组 */}
                    <div className="pt-4">
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={newGroupName}
                                onChange={(e) => setNewGroupName(e.target.value)}
                                placeholder="新分组名"
                                className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm"
                            />
                            <button
                                onClick={handleCreateGroup}
                                className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
                            >
                                +
                            </button>
                        </div>
                    </div>
                </nav>

                {/* 上传 */}
                <div className="p-4 border-t border-slate-700">
                    <label className={`block w-full py-3 text-center rounded-lg cursor-pointer transition ${uploading ? 'bg-gray-600' : 'bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700'} text-white font-medium`}>
                        {uploading ? '处理中...' : '📤 上传 PDF'}
                        <input type="file" accept=".pdf" multiple onChange={handleUpload} className="hidden" disabled={uploading} />
                    </label>

                    {/* 进度显示 */}
                    {uploadProgress && (
                        <div className="mt-3 p-3 bg-slate-700 rounded-lg space-y-3">
                            {/* 总进度 - 多文件时显示 */}
                            {uploadProgress.totalFiles && uploadProgress.totalFiles > 1 && (
                                <div>
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-xs font-medium text-purple-300">
                                            📁 总进度
                                        </span>
                                        <span className="text-xs font-bold text-purple-400">
                                            {(uploadProgress.fileIndex ?? 0) + 1} / {uploadProgress.totalFiles} 个文件
                                        </span>
                                    </div>
                                    <div className="w-full bg-slate-600 rounded-full h-3">
                                        <div
                                            className="h-3 rounded-full transition-all bg-gradient-to-r from-purple-500 to-blue-500"
                                            style={{ width: `${(((uploadProgress.fileIndex ?? 0) + (uploadProgress.status === 'success' ? 1 : 0.5)) / uploadProgress.totalFiles) * 100}%` }}
                                        />
                                    </div>
                                </div>
                            )}

                            {/* 当前文件进度 */}
                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-xs text-gray-400 truncate max-w-[150px]" title={uploadProgress.filename}>
                                        📄 {uploadProgress.filename}
                                    </span>
                                    <span className={`text-xs px-2 py-0.5 rounded ${uploadProgress.status === 'success' ? 'bg-green-600 text-white' :
                                        uploadProgress.status === 'error' ? 'bg-red-600 text-white' :
                                            'bg-blue-600 text-white'
                                        }`}>
                                        步骤 {uploadProgress.step}/{uploadProgress.total}
                                    </span>
                                </div>
                                <div className="w-full bg-slate-600 rounded-full h-2 mb-2">
                                    <div
                                        className={`h-2 rounded-full transition-all ${uploadProgress.status === 'success' ? 'bg-green-500' :
                                            uploadProgress.status === 'error' ? 'bg-red-500' :
                                                'bg-blue-500'
                                            }`}
                                        style={{ width: `${(uploadProgress.step / uploadProgress.total) * 100}%` }}
                                    />
                                </div>
                                <p className={`text-sm ${uploadProgress.status === 'success' ? 'text-green-400' :
                                    uploadProgress.status === 'error' ? 'text-red-400' :
                                        'text-gray-300'
                                    }`}>
                                    {uploadProgress.message}
                                </p>
                            </div>
                        </div>
                    )}

                    {/* 日志面板 */}
                    {uploadLogs.length > 0 && (
                        <div className="mt-3 bg-slate-900 rounded-lg border border-slate-600 max-h-48 overflow-y-auto">
                            <div className="p-2 flex justify-between items-center border-b border-slate-700 sticky top-0 bg-slate-900">
                                <span className="text-xs text-gray-400">📋 处理日志</span>
                                <button
                                    onClick={() => setUploadLogs([])}
                                    className="text-xs text-gray-500 hover:text-gray-300"
                                >
                                    清除
                                </button>
                            </div>
                            <div className="p-2 space-y-1">
                                {uploadLogs.map((log, i) => (
                                    <div key={i} className={`text-xs font-mono ${log.status === 'success' ? 'text-green-400' :
                                        log.status === 'error' ? 'text-red-400' :
                                            'text-gray-400'
                                        }`}>
                                        <span className="text-gray-600">[{log.time}]</span>{' '}
                                        <span className="text-blue-400">{log.filename}</span>{' '}
                                        {log.message}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* 退出 */}
                <div className="p-4 border-t border-slate-700">
                    <button onClick={handleLogout} className="w-full py-2 text-gray-400 hover:text-white transition">
                        退出登录
                    </button>
                </div>
            </aside>

            {/* 主内容 */}
            <main className="flex-1 p-6 overflow-auto">
                {/* 搜索栏 */}
                <div className="mb-6">
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="🔍 搜索论文..."
                        className="w-full max-w-md px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-gray-500"
                    />
                </div>

                {/* 论文列表 */}
                {papers.length === 0 ? (
                    <div className="text-center text-gray-500 py-20">
                        📭 暂无论文，请上传 PDF 文件
                    </div>
                ) : (
                    <div className="space-y-4">
                        {papers.map(paper => (
                            <div key={paper.id} className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
                                {/* 论文卡片 */}
                                <div className="p-4">
                                    <div className="flex justify-between items-start">
                                        <div className="flex-1">
                                            <h3 className="text-lg font-semibold text-white">{paper.title}</h3>
                                            {paper.title_cn && <p className="text-gray-400 text-sm mt-1">{paper.title_cn}</p>}
                                            <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                                                <span className="px-2 py-1 bg-slate-700 rounded">{paper.journal || 'Journal'}</span>
                                                <span>📅 {paper.year}</span>
                                                <span>✍️ {paper.authors?.slice(0, 50)}...</span>
                                            </div>
                                            {/* 分组标签 */}
                                            <div className="flex flex-wrap gap-2 mt-3">
                                                {groups.map(g => (
                                                    <button
                                                        key={g.id}
                                                        onClick={() => handleGroupToggle(paper.id, g.name, paper.groups)}
                                                        className={`px-2 py-1 text-xs rounded-full transition ${paper.groups.some(pg => pg.name === g.name) ? 'bg-purple-600 text-white' : 'bg-slate-700 text-gray-400 hover:bg-slate-600'}`}
                                                    >
                                                        {g.name}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="flex gap-2 ml-4">
                                            <button
                                                onClick={() => setExpandedPaper(expandedPaper === paper.id ? null : paper.id)}
                                                className="px-3 py-1 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
                                            >
                                                {expandedPaper === paper.id ? '收起' : '📖 阅读'}
                                            </button>
                                            <button
                                                onClick={() => handleDelete(paper.id)}
                                                className="px-3 py-1 bg-red-600/20 text-red-400 text-sm rounded-lg hover:bg-red-600/30"
                                            >
                                                🗑️
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {/* 展开内容 - 标签页布局 */}
                                {expandedPaper === paper.id && (
                                    <div className="border-t border-slate-700 bg-slate-900">
                                        {/* 标签页导航 */}
                                        <div className="flex border-b border-slate-700">
                                            <button
                                                onClick={() => setDetailTab('analysis')}
                                                className={`px-6 py-3 font-medium transition-all ${detailTab === 'analysis'
                                                    ? 'text-purple-400 border-b-2 border-purple-400 bg-slate-800'
                                                    : 'text-gray-400 hover:text-gray-200 hover:bg-slate-800'
                                                    }`}
                                            >
                                                💡 深度分析
                                            </button>
                                            <button
                                                onClick={() => setDetailTab('abstract_cn')}
                                                className={`px-6 py-3 font-medium transition-all ${detailTab === 'abstract_cn'
                                                    ? 'text-blue-400 border-b-2 border-blue-400 bg-slate-800'
                                                    : 'text-gray-400 hover:text-gray-200 hover:bg-slate-800'
                                                    }`}
                                            >
                                                🇨🇳 中文摘要
                                            </button>
                                            <button
                                                onClick={() => setDetailTab('abstract_en')}
                                                className={`px-6 py-3 font-medium transition-all ${detailTab === 'abstract_en'
                                                    ? 'text-green-400 border-b-2 border-green-400 bg-slate-800'
                                                    : 'text-gray-400 hover:text-gray-200 hover:bg-slate-800'
                                                    }`}
                                            >
                                                🇬🇧 英文摘要
                                            </button>
                                        </div>

                                        {/* 标签页内容 */}
                                        <div className="p-6">
                                            {/* 深度分析 */}
                                            {detailTab === 'analysis' && (
                                                <MarkdownRenderer content={paper.detailed_analysis || '暂无分析内容'} />
                                            )}

                                            {/* 中文摘要 */}
                                            {detailTab === 'abstract_cn' && (
                                                <div className="text-gray-200 text-lg leading-9">
                                                    {paper.abstract || '暂无中文摘要'}
                                                </div>
                                            )}

                                            {/* 英文摘要 */}
                                            {detailTab === 'abstract_en' && (
                                                <div className="text-gray-200 text-lg leading-9 font-serif italic">
                                                    {paper.abstract_en || 'No English abstract available'}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
}
