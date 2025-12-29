'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
    getMe, logout, getGroups, createGroup, deletePaper,
    uploadPapersWithProgress, User, Paper, Group, updatePaperGroups, UploadProgress,
    batchDeletePapers, batchUpdateGroups, batchExportPapers, downloadBlob,
    getPapersAdvanced, getFilterOptions, FilterOptions,
    downloadPaper, previewPaper, reanalyzePaper
} from '@/lib/api';
import MarkdownRenderer from '@/components/MarkdownRenderer';
import AdvancedSearch, { SearchParams } from '@/components/AdvancedSearch';
import TranslationPanel from '@/components/TranslationPanel';


export default function PapersPage() {
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [papers, setPapers] = useState<Paper[]>([]);
    const [groups, setGroups] = useState<Group[]>([]);
    const [currentView, setCurrentView] = useState('all');
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
    const [uploadLogs, setUploadLogs] = useState<(UploadProgress & { time: string })[]>([]);
    const [expandedPaper, setExpandedPaper] = useState<number | null>(null);
    const [detailTab, setDetailTab] = useState<'analysis' | 'abstract_cn' | 'abstract_en' | 'translate'>('analysis');
    const [newGroupName, setNewGroupName] = useState('');

    // 高级搜索状态
    const [searchParams, setSearchParams] = useState<SearchParams>({
        search: '',
        searchFields: ['all'],
        yearFrom: '',
        yearTo: '',
        journals: []
    });
    const [filterOptions, setFilterOptions] = useState<FilterOptions | null>(null);
    const [loadingOptions, setLoadingOptions] = useState(false);

    // 批量操作状态
    const [selectionMode, setSelectionMode] = useState(false);
    const [selectedPapers, setSelectedPapers] = useState<Set<number>>(new Set());
    const [showGroupModal, setShowGroupModal] = useState(false);
    const [showExportModal, setShowExportModal] = useState(false);
    const [batchGroupAction, setBatchGroupAction] = useState<'add' | 'remove' | 'set'>('add');
    const [batchSelectedGroups, setBatchSelectedGroups] = useState<Set<string>>(new Set());
    const [batchLoading, setBatchLoading] = useState(false);
    
    // 重新分析状态
    const [reanalyzingPaperId, setReanalyzingPaperId] = useState<number | null>(null);

    // 加载筛选选项
    const loadFilterOptions = useCallback(async () => {
        if (filterOptions) return; // 已加载过
        setLoadingOptions(true);
        try {
            const options = await getFilterOptions();
            setFilterOptions(options);
        } catch (err) {
            console.error('加载筛选选项失败:', err);
        } finally {
            setLoadingOptions(false);
        }
    }, [filterOptions]);

    // 加载数据
    const loadData = useCallback(async () => {
        try {
            const [papersData, groupsData] = await Promise.all([
                getPapersAdvanced({
                    view: currentView,
                    search: searchParams.search || undefined,
                    searchFields: searchParams.searchFields,
                    yearFrom: searchParams.yearFrom || undefined,
                    yearTo: searchParams.yearTo || undefined,
                    journals: searchParams.journals.length > 0 ? searchParams.journals : undefined
                }),
                getGroups()
            ]);
            setPapers(papersData.papers);
            setGroups(groupsData);
        } catch (err) {
            console.error('加载数据失败:', err);
        }
    }, [currentView, searchParams]);

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
    }, [currentView, searchParams, user, loadData]);

    // 处理高级搜索
    const handleAdvancedSearch = (params: SearchParams) => {
        setSearchParams(params);
    };

    // 高级搜索面板展开时加载筛选选项
    const handleSearchExpandChange = (expanded: boolean) => {
        if (expanded) {
            loadFilterOptions();
        }
    };

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

    // 下载论文 PDF
    const handleDownload = async (paper: Paper) => {
        try {
            // 直接使用论文标题作为文件名
            const filename = (paper.title || 'paper') + '.pdf';
            
            const token = localStorage.getItem('token');
            const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/papers/${paper.id}/download`, {
                headers: token ? { Authorization: `Bearer ${token}` } : {},
            });
            
            if (!response.ok) {
                const error = await response.json().catch(() => ({ detail: '下载失败' }));
                throw new Error(error.detail || '下载失败');
            }
            
            const blob = await response.blob();
            
            // 创建下载链接
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (err) {
            alert(err instanceof Error ? err.message : '下载失败');
        }
    };

    // 预览论文 PDF
    const handlePreview = (paper: Paper) => {
        previewPaper(paper.id);
    };

    // 重新分析论文
    const handleReanalyze = async (paper: Paper) => {
        if (!confirm(`确定要重新分析论文「${paper.title}」吗？这可能需要几分钟时间。`)) return;
        
        setReanalyzingPaperId(paper.id);
        try {
            await reanalyzePaper(paper.id);
            alert('重新分析完成！');
            await loadData();
        } catch (err) {
            alert(err instanceof Error ? err.message : '重新分析失败');
        } finally {
            setReanalyzingPaperId(null);
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

    // ================= 批量操作函数 =================

    // 切换选择单篇论文
    const toggleSelection = (paperId: number) => {
        setSelectedPapers(prev => {
            const next = new Set(prev);
            if (next.has(paperId)) {
                next.delete(paperId);
            } else {
                next.add(paperId);
            }
            return next;
        });
    };

    // 全选/取消全选
    const toggleSelectAll = () => {
        if (selectedPapers.size === papers.length) {
            setSelectedPapers(new Set());
        } else {
            setSelectedPapers(new Set(papers.map(p => p.id)));
        }
    };

    // 退出多选模式
    const exitSelectionMode = () => {
        setSelectionMode(false);
        setSelectedPapers(new Set());
    };

    // 批量删除
    const handleBatchDelete = async () => {
        if (selectedPapers.size === 0) return;
        if (!confirm(`确定要删除选中的 ${selectedPapers.size} 篇论文吗？此操作不可撤销。`)) return;

        setBatchLoading(true);
        try {
            const result = await batchDeletePapers(Array.from(selectedPapers));
            alert(result.message);
            setSelectedPapers(new Set());
            await loadData();
        } catch (err) {
            alert(err instanceof Error ? err.message : '批量删除失败');
        } finally {
            setBatchLoading(false);
        }
    };

    // 打开批量分组弹窗
    const openGroupModal = () => {
        setBatchSelectedGroups(new Set());
        setBatchGroupAction('add');
        setShowGroupModal(true);
    };

    // 执行批量分组
    const handleBatchGroup = async () => {
        if (selectedPapers.size === 0 || batchSelectedGroups.size === 0) return;

        setBatchLoading(true);
        try {
            const result = await batchUpdateGroups(
                Array.from(selectedPapers),
                batchGroupAction,
                Array.from(batchSelectedGroups)
            );
            alert(result.message);
            setShowGroupModal(false);
            await loadData();
        } catch (err) {
            alert(err instanceof Error ? err.message : '批量分组失败');
        } finally {
            setBatchLoading(false);
        }
    };

    // 打开批量导出弹窗
    const openExportModal = () => {
        setShowExportModal(true);
    };

    // 执行批量导出
    const handleBatchExport = async (format: 'csv' | 'bibtex' | 'markdown' | 'json') => {
        if (selectedPapers.size === 0) return;

        setBatchLoading(true);
        try {
            const blob = await batchExportPapers(Array.from(selectedPapers), format);
            const timestamp = new Date().toISOString().slice(0, 10);
            const extensions: Record<string, string> = {
                csv: 'csv',
                bibtex: 'bib',
                markdown: 'md',
                json: 'json'
            };
            downloadBlob(blob, `papers_export_${timestamp}.${extensions[format]}`);
            setShowExportModal(false);
        } catch (err) {
            alert(err instanceof Error ? err.message : '导出失败');
        } finally {
            setBatchLoading(false);
        }
    };

    // 切换批量分组选择
    const toggleBatchGroupSelection = (groupName: string) => {
        setBatchSelectedGroups(prev => {
            const next = new Set(prev);
            if (next.has(groupName)) {
                next.delete(groupName);
            } else {
                next.add(groupName);
            }
            return next;
        });
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
            <aside className="w-64 bg-slate-800 border-r border-slate-700 flex flex-col h-screen sticky top-0">
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
                <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
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
                    <button
                        onClick={() => router.push('/workspaces')}
                        className="w-full text-left px-3 py-2 rounded-lg transition text-gray-300 hover:bg-slate-700"
                    >
                        👥 团队空间
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
                {/* 高级搜索栏 */}
                <div className="mb-6">
                    <div className="flex items-start gap-4">
                        <div className="flex-1">
                            <AdvancedSearch
                                onSearch={handleAdvancedSearch}
                                initialSearch={searchParams.search}
                                filterOptions={filterOptions}
                                loadingOptions={loadingOptions}
                                onExpandChange={handleSearchExpandChange}
                            />
                        </div>
                        <button
                            onClick={() => {
                                if (selectionMode) {
                                    exitSelectionMode();
                                } else {
                                    setSelectionMode(true);
                                }
                            }}
                            className={`px-4 py-3 rounded-lg font-medium transition whitespace-nowrap ${selectionMode
                                ? 'bg-purple-600 text-white'
                                : 'bg-slate-800 border border-slate-700 text-gray-300 hover:bg-slate-700'
                                }`}
                        >
                            {selectionMode ? '✓ 多选模式' : '☐ 多选模式'}
                        </button>
                    </div>
                </div>

                {/* 批量操作工具栏 */}
                {selectionMode && (
                    <div className="mb-4 p-4 bg-purple-900/30 border border-purple-500/50 rounded-lg flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <span className="text-purple-300">
                                ☑ 已选择 {selectedPapers.size} 篇论文
                            </span>
                            <button
                                onClick={toggleSelectAll}
                                className="text-sm text-gray-400 hover:text-white transition"
                            >
                                {selectedPapers.size === papers.length && papers.length > 0 ? '取消全选' : '全选'}
                            </button>
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={handleBatchDelete}
                                disabled={selectedPapers.size === 0 || batchLoading}
                                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                            >
                                🗑️ 删除
                            </button>
                            <button
                                onClick={openGroupModal}
                                disabled={selectedPapers.size === 0 || batchLoading}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                            >
                                📁 分组
                            </button>
                            <button
                                onClick={openExportModal}
                                disabled={selectedPapers.size === 0 || batchLoading}
                                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                            >
                                📤 导出
                            </button>
                            <button
                                onClick={exitSelectionMode}
                                className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition"
                            >
                                取消
                            </button>
                        </div>
                    </div>
                )}

                {/* 论文列表 */}
                {papers.length === 0 ? (
                    <div className="text-center text-gray-500 py-20">
                        📭 暂无论文，请上传 PDF 文件
                    </div>
                ) : (
                    <div className="space-y-4">
                        {papers.map(paper => (
                            <div
                                key={paper.id}
                                className={`bg-slate-800 border rounded-xl overflow-hidden transition ${selectionMode && selectedPapers.has(paper.id)
                                    ? 'border-purple-500 ring-2 ring-purple-500/30'
                                    : 'border-slate-700'
                                    }`}
                            >
                                {/* 论文卡片 */}
                                <div className="p-4">
                                    <div className="flex justify-between items-start">
                                        {/* 多选模式下显示复选框 */}
                                        {selectionMode && (
                                            <div className="mr-4 flex items-center">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedPapers.has(paper.id)}
                                                    onChange={() => toggleSelection(paper.id)}
                                                    className="w-5 h-5 rounded border-slate-600 bg-slate-700 text-purple-600 focus:ring-purple-500 focus:ring-offset-slate-800 cursor-pointer"
                                                />
                                            </div>
                                        )}
                                        <div
                                            className="flex-1 cursor-pointer"
                                            onClick={() => selectionMode && toggleSelection(paper.id)}
                                        >
                                            <h3 className="text-lg font-semibold text-white">{paper.title}</h3>
                                            {paper.title_cn && <p className="text-gray-400 text-sm mt-1">{paper.title_cn}</p>}
                                            <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                                                <span className="px-2 py-1 bg-slate-700 rounded">{paper.journal || 'Journal'}</span>
                                                <span>📅 {paper.year}</span>
                                                <span>✍️ {paper.authors?.slice(0, 50)}...</span>
                                            </div>
                                            {/* 分组标签 */}
                                            {!selectionMode && (
                                                <div className="flex flex-wrap gap-2 mt-3">
                                                    {groups.map(g => (
                                                        <button
                                                            key={g.id}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleGroupToggle(paper.id, g.name, paper.groups);
                                                            }}
                                                            className={`px-2 py-1 text-xs rounded-full transition ${paper.groups.some(pg => pg.name === g.name) ? 'bg-purple-600 text-white' : 'bg-slate-700 text-gray-400 hover:bg-slate-600'}`}
                                                        >
                                                            {g.name}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                            {/* 多选模式下显示已有分组标签（只读） */}
                                            {selectionMode && paper.groups.length > 0 && (
                                                <div className="flex flex-wrap gap-2 mt-3">
                                                    {paper.groups.map(g => (
                                                        <span
                                                            key={g.id}
                                                            className="px-2 py-1 text-xs rounded-full bg-purple-600/50 text-purple-200"
                                                        >
                                                            {g.name}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                        {/* 非多选模式下显示操作按钮 */}
                                        {!selectionMode && (
                                            <div className="flex gap-2 ml-4 flex-wrap">
                                                <button
                                                    onClick={() => setExpandedPaper(expandedPaper === paper.id ? null : paper.id)}
                                                    className="px-3 py-1 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
                                                >
                                                    {expandedPaper === paper.id ? '收起' : '📖 阅读'}
                                                </button>
                                                {/* 文件操作按钮 - 仅当有文件时显示 */}
                                                {paper.has_file && (
                                                    <>
                                                        <button
                                                            onClick={() => handleDownload(paper)}
                                                            className="px-3 py-1 bg-green-600/20 text-green-400 text-sm rounded-lg hover:bg-green-600/30"
                                                            title="下载 PDF"
                                                        >
                                                            ⬇️ 下载
                                                        </button>
                                                        <button
                                                            onClick={() => handlePreview(paper)}
                                                            className="px-3 py-1 bg-purple-600/20 text-purple-400 text-sm rounded-lg hover:bg-purple-600/30"
                                                            title="预览 PDF"
                                                        >
                                                            👁️ 预览
                                                        </button>
                                                        <button
                                                            onClick={() => handleReanalyze(paper)}
                                                            disabled={reanalyzingPaperId === paper.id}
                                                            className="px-3 py-1 bg-orange-600/20 text-orange-400 text-sm rounded-lg hover:bg-orange-600/30 disabled:opacity-50 disabled:cursor-wait"
                                                            title="重新分析"
                                                        >
                                                            {reanalyzingPaperId === paper.id ? '⏳ 分析中...' : '🔄 重新分析'}
                                                        </button>
                                                    </>
                                                )}
                                                <button
                                                    onClick={() => handleDelete(paper.id)}
                                                    className="px-3 py-1 bg-red-600/20 text-red-400 text-sm rounded-lg hover:bg-red-600/30"
                                                >
                                                    🗑️
                                                </button>
                                            </div>
                                        )}
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
                                            {paper.has_file && (
                                                <button
                                                    onClick={() => setDetailTab('translate')}
                                                    className={`px-6 py-3 font-medium transition-all ${detailTab === 'translate'
                                                        ? 'text-orange-400 border-b-2 border-orange-400 bg-slate-800'
                                                        : 'text-gray-400 hover:text-gray-200 hover:bg-slate-800'
                                                        }`}
                                                >
                                                    🌐 PDF翻译
                                                </button>
                                            )}
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

                                            {/* PDF翻译 */}
                                            {detailTab === 'translate' && paper.has_file && (
                                                <TranslationPanel
                                                    paperId={paper.id}
                                                    paperTitle={paper.title}
                                                    hasFile={paper.has_file}
                                                />
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </main>

            {/* 批量分组弹窗 */}
            {showGroupModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-md mx-4">
                        <div className="p-4 border-b border-slate-700 flex justify-between items-center">
                            <h3 className="text-lg font-semibold text-white">📁 批量分组</h3>
                            <button
                                onClick={() => setShowGroupModal(false)}
                                className="text-gray-400 hover:text-white"
                            >
                                ✕
                            </button>
                        </div>
                        <div className="p-4 space-y-4">
                            <p className="text-gray-400">
                                已选择 <span className="text-purple-400 font-semibold">{selectedPapers.size}</span> 篇论文
                            </p>

                            {/* 操作类型选择 */}
                            <div className="space-y-2">
                                <p className="text-sm text-gray-500">选择操作:</p>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setBatchGroupAction('add')}
                                        className={`flex-1 px-3 py-2 rounded-lg text-sm transition ${batchGroupAction === 'add'
                                            ? 'bg-blue-600 text-white'
                                            : 'bg-slate-700 text-gray-300 hover:bg-slate-600'
                                            }`}
                                    >
                                        添加到分组
                                    </button>
                                    <button
                                        onClick={() => setBatchGroupAction('remove')}
                                        className={`flex-1 px-3 py-2 rounded-lg text-sm transition ${batchGroupAction === 'remove'
                                            ? 'bg-orange-600 text-white'
                                            : 'bg-slate-700 text-gray-300 hover:bg-slate-600'
                                            }`}
                                    >
                                        从分组移除
                                    </button>
                                    <button
                                        onClick={() => setBatchGroupAction('set')}
                                        className={`flex-1 px-3 py-2 rounded-lg text-sm transition ${batchGroupAction === 'set'
                                            ? 'bg-purple-600 text-white'
                                            : 'bg-slate-700 text-gray-300 hover:bg-slate-600'
                                            }`}
                                    >
                                        设为指定
                                    </button>
                                </div>
                            </div>

                            {/* 分组选择 */}
                            <div className="space-y-2">
                                <p className="text-sm text-gray-500">选择分组:</p>
                                {groups.length === 0 ? (
                                    <p className="text-gray-500 text-sm">暂无分组，请先创建分组</p>
                                ) : (
                                    <div className="space-y-2 max-h-48 overflow-y-auto">
                                        {groups.map(g => (
                                            <label
                                                key={g.id}
                                                className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition ${batchSelectedGroups.has(g.name)
                                                    ? 'bg-purple-600/30 border border-purple-500'
                                                    : 'bg-slate-700 border border-transparent hover:bg-slate-600'
                                                    }`}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={batchSelectedGroups.has(g.name)}
                                                    onChange={() => toggleBatchGroupSelection(g.name)}
                                                    className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-purple-600 focus:ring-purple-500"
                                                />
                                                <span className="text-white">{g.name}</span>
                                            </label>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="p-4 border-t border-slate-700 flex justify-end gap-2">
                            <button
                                onClick={() => setShowGroupModal(false)}
                                className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition"
                            >
                                取消
                            </button>
                            <button
                                onClick={handleBatchGroup}
                                disabled={batchSelectedGroups.size === 0 || batchLoading}
                                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                            >
                                {batchLoading ? '处理中...' : '确认'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 批量导出弹窗 */}
            {showExportModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-md mx-4">
                        <div className="p-4 border-b border-slate-700 flex justify-between items-center">
                            <h3 className="text-lg font-semibold text-white">📤 批量导出</h3>
                            <button
                                onClick={() => setShowExportModal(false)}
                                className="text-gray-400 hover:text-white"
                            >
                                ✕
                            </button>
                        </div>
                        <div className="p-4 space-y-4">
                            <p className="text-gray-400">
                                已选择 <span className="text-purple-400 font-semibold">{selectedPapers.size}</span> 篇论文
                            </p>

                            {/* 导出格式选择 */}
                            <div className="space-y-2">
                                <p className="text-sm text-gray-500">选择导出格式:</p>
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        onClick={() => handleBatchExport('csv')}
                                        disabled={batchLoading}
                                        className="p-4 bg-slate-700 rounded-lg hover:bg-slate-600 transition text-left disabled:opacity-50"
                                    >
                                        <div className="text-2xl mb-1">📊</div>
                                        <div className="text-white font-medium">CSV</div>
                                        <div className="text-xs text-gray-400">元数据表格</div>
                                    </button>
                                    <button
                                        onClick={() => handleBatchExport('bibtex')}
                                        disabled={batchLoading}
                                        className="p-4 bg-slate-700 rounded-lg hover:bg-slate-600 transition text-left disabled:opacity-50"
                                    >
                                        <div className="text-2xl mb-1">📚</div>
                                        <div className="text-white font-medium">BibTeX</div>
                                        <div className="text-xs text-gray-400">引用格式</div>
                                    </button>
                                    <button
                                        onClick={() => handleBatchExport('markdown')}
                                        disabled={batchLoading}
                                        className="p-4 bg-slate-700 rounded-lg hover:bg-slate-600 transition text-left disabled:opacity-50"
                                    >
                                        <div className="text-2xl mb-1">📝</div>
                                        <div className="text-white font-medium">Markdown</div>
                                        <div className="text-xs text-gray-400">分析报告</div>
                                    </button>
                                    <button
                                        onClick={() => handleBatchExport('json')}
                                        disabled={batchLoading}
                                        className="p-4 bg-slate-700 rounded-lg hover:bg-slate-600 transition text-left disabled:opacity-50"
                                    >
                                        <div className="text-2xl mb-1">🔧</div>
                                        <div className="text-white font-medium">JSON</div>
                                        <div className="text-xs text-gray-400">完整数据</div>
                                    </button>
                                </div>
                            </div>

                            {batchLoading && (
                                <div className="text-center text-purple-400">
                                    正在导出...
                                </div>
                            )}
                        </div>
                        <div className="p-4 border-t border-slate-700 flex justify-end">
                            <button
                                onClick={() => setShowExportModal(false)}
                                className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition"
                            >
                                关闭
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
