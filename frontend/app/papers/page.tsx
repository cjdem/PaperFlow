
'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
    logout, getGroups, createGroup, deletePaper,
    uploadPapersWithProgress, Paper, Group, updatePaperGroups, UploadProgress,
    batchDeletePapers, batchUpdateGroups, batchExportPapers, downloadBlob,
    getPapersAdvanced, getFilterOptions, FilterOptions,
    previewPaper, reanalyzePaper
} from '@/lib/api';
import { apiClient } from '@/lib/apiClient';
import { useAuth } from '@/lib/useAuth';
import { usePolling } from '@/lib/usePolling';
import MarkdownRenderer from '@/components/MarkdownRenderer';
import AdvancedSearch, { SearchParams } from '@/components/AdvancedSearch';
import TranslationPanel from '@/components/TranslationPanel';
import AppSidebar from '@/components/AppSidebar';


export default function PapersPage() {
    const router = useRouter();
    const urlSearchParams = useSearchParams();
    const { user, loading: authLoading } = useAuth({ redirectTo: '/' });
    const initialLoadRef = useRef(false);
    const [loading, setLoading] = useState(true);
    const [papers, setPapers] = useState<Paper[]>([]);
    const [groups, setGroups] = useState<Group[]>([]);
    const [currentView, setCurrentView] = useState('all');
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
    const [uploadLogs, setUploadLogs] = useState<(UploadProgress & { time: string })[]>([]);
    const [expandedPaper, setExpandedPaper] = useState<number | null>(null);
    const [detailTab, setDetailTab] = useState<'analysis' | 'abstract_cn' | 'abstract_en' | 'translate'>('analysis');
    const [newGroupName, setNewGroupName] = useState('');

    const [searchParams, setSearchParams] = useState<SearchParams>({
        search: '',
        searchFields: ['all'],
        yearFrom: '',
        yearTo: '',
        journals: []
    });
    const [filterOptions, setFilterOptions] = useState<FilterOptions | null>(null);
    const [loadingOptions, setLoadingOptions] = useState(false);

    const [selectionMode, setSelectionMode] = useState(false);
    const [selectedPapers, setSelectedPapers] = useState<Set<number>>(new Set());
    const [showGroupModal, setShowGroupModal] = useState(false);
    const [showExportModal, setShowExportModal] = useState(false);
    const [batchGroupAction, setBatchGroupAction] = useState<'add' | 'remove' | 'set'>('add');
    const [batchSelectedGroups, setBatchSelectedGroups] = useState<Set<string>>(new Set());
    const [batchLoading, setBatchLoading] = useState(false);
    const [reanalyzingPaperId, setReanalyzingPaperId] = useState<number | null>(null);

    useEffect(() => {
        const viewFromUrl = urlSearchParams.get('view') || 'all';
        setCurrentView(prev => (prev === viewFromUrl ? prev : viewFromUrl));
    }, [urlSearchParams]);

    const loadFilterOptions = useCallback(async () => {
        if (filterOptions) return;
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

    const handleInitialLoad = useCallback(async () => {
        try {
            await loadData();
        } finally {
            if (!initialLoadRef.current) {
                initialLoadRef.current = true;
                setLoading(false);
            }
        }
    }, [loadData]);

    usePolling(handleInitialLoad, {
        enabled: !!user,
        deps: [currentView, searchParams]
    });

    const handleAdvancedSearch = (params: SearchParams) => {
        setSearchParams(params);
    };

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

                if (progress.status === 'success' && progress.fileIndex !== undefined && progress.fileIndex > lastSuccessIndex) {
                    lastSuccessIndex = progress.fileIndex;
                    await loadData();
                }
            });
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

    const handleDownload = async (paper: Paper) => {
        const hasFile = paper.has_file ?? !!paper.file_path;
        if (!hasFile) {
            alert('文件不存在，无法下载');
            return;
        }
        try {
            const filename = (paper.title || 'paper') + '.pdf';
            const blob = await apiClient.get<Blob>(`/api/papers/${paper.id}/download`, {
                responseType: 'blob'
            });
            downloadBlob(blob, filename);
        } catch (err) {
            alert(err instanceof Error ? err.message : '下载失败');
        }
    };

    const handlePreview = async (paper: Paper) => {
        const hasFile = paper.has_file ?? !!paper.file_path;
        if (!hasFile) {
            alert('文件不存在，无法预览');
            return;
        }
        try {
            await previewPaper(paper.id);
        } catch (err) {
            alert(err instanceof Error ? err.message : '预览失败');
        }
    };

    const handleReanalyze = async (paper: Paper) => {
        const hasFile = paper.has_file ?? !!paper.file_path;
        if (!hasFile) {
            alert('文件不存在，无法重新分析');
            return;
        }
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

    const handleSidebarViewSelect = useCallback((view: string) => {
        setCurrentView(view);
        const nextPath = view === 'all' ? '/papers' : `/papers?view=${encodeURIComponent(view)}`;
        router.replace(nextPath);
    }, [router]);

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

    const toggleSelectAll = () => {
        if (selectedPapers.size === papers.length) {
            setSelectedPapers(new Set());
        } else {
            setSelectedPapers(new Set(papers.map(p => p.id)));
        }
    };

    const exitSelectionMode = () => {
        setSelectionMode(false);
        setSelectedPapers(new Set());
    };

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

    const openGroupModal = () => {
        setBatchSelectedGroups(new Set());
        setBatchGroupAction('add');
        setShowGroupModal(true);
    };

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

    const openExportModal = () => {
        setShowExportModal(true);
    };

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

    if (authLoading || loading) {
        return (
            <div className="min-h-screen fluent-background flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-[var(--fluent-blue-500)] border-t-transparent rounded-full animate-spin" />
                    <div className="text-[var(--fluent-foreground)] text-lg font-medium" role="status" aria-live="polite">加载中...</div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen fluent-background flex">
            <AppSidebar
                user={user}
                activeSection="papers"
                currentView={currentView}
                groups={groups}
                onSelectView={handleSidebarViewSelect}
                onLogout={handleLogout}
                navExtraContent={(collapsed) => (
                    !collapsed ? (
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={newGroupName}
                                onChange={(e) => setNewGroupName(e.target.value)}
                                placeholder="新分组名"
                                className="fluent-input flex-1 text-sm py-2"
                            />
                            <button
                                onClick={handleCreateGroup}
                                className="fluent-button fluent-button-accent px-3 py-2 text-sm"
                            >
                                +
                            </button>
                        </div>
                    ) : null
                )}
                extraContent={(collapsed) => (
                    <>
                        <label
                            className={`fluent-button w-full justify-center cursor-pointer ${collapsed ? 'px-2 py-2' : 'py-3'} ${uploading ? 'bg-gray-600 cursor-wait' : 'fluent-button-accent'}`}
                            aria-busy={uploading}
                            title="上传 PDF"
                        >
                            {uploading ? (
                                <span className="flex items-center gap-2" role="status" aria-live="polite">
                                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                    </svg>
                                    {!collapsed && '处理中...'}
                                </span>
                            ) : (
                                <span>{collapsed ? '📤' : '📤 上传 PDF'}</span>
                            )}
                            <input type="file" accept=".pdf" multiple onChange={handleUpload} className="hidden" disabled={uploading} />
                        </label>

                        {!collapsed && uploadProgress && (
                            <div className="mt-3 p-4 fluent-card space-y-3">
                                {uploadProgress.totalFiles && uploadProgress.totalFiles > 1 && (
                                    <div>
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-xs font-medium text-purple-300">📁 总进度</span>
                                            <span className="text-xs font-bold text-purple-300">
                                                {(uploadProgress.fileIndex ?? 0) + 1} / {uploadProgress.totalFiles} 个文件
                                            </span>
                                        </div>
                                        <div className="fluent-progress h-2">
                                            <div
                                                className="fluent-progress-bar"
                                                style={{ width: `${(((uploadProgress.fileIndex ?? 0) + (uploadProgress.status === 'success' ? 1 : 0.5)) / uploadProgress.totalFiles) * 100}%` }}
                                            />
                                        </div>
                                    </div>
                                )}

                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-xs text-[var(--fluent-foreground-secondary)] truncate max-w-[150px]" title={uploadProgress.filename}>
                                            📄 {uploadProgress.filename}
                                        </span>
                                        <span className={`fluent-badge text-xs ${
                                            uploadProgress.status === 'success' ? 'fluent-badge-success' :
                                            uploadProgress.status === 'error' ? 'fluent-badge-error' :
                                            'fluent-badge-primary'
                                        }`}>
                                            步骤 {uploadProgress.step}/{uploadProgress.total}
                                        </span>
                                    </div>
                                    <div className="fluent-progress h-1.5 mb-2">
                                        <div
                                            className={`h-full rounded-full transition-all ${
                                                uploadProgress.status === 'success' ? 'bg-green-500' :
                                                uploadProgress.status === 'error' ? 'bg-red-500' :
                                                'fluent-progress-bar'
                                            }`}
                                            style={{ width: `${(uploadProgress.step / uploadProgress.total) * 100}%` }}
                                        />
                                    </div>
                                    <p className={`text-sm ${
                                        uploadProgress.status === 'success' ? 'text-green-400' :
                                        uploadProgress.status === 'error' ? 'text-red-400' :
                                        'text-[var(--fluent-foreground-secondary)]'
                                    }`}>
                                        {uploadProgress.message}
                                    </p>
                                </div>
                            </div>
                        )}

                        {!collapsed && uploadLogs.length > 0 && (
                            <div className="mt-3 fluent-card max-h-48 overflow-hidden">
                                <div className="p-3 flex justify-between items-center border-b border-[var(--fluent-divider)] sticky top-0 bg-inherit">
                                    <span className="text-xs text-[var(--fluent-foreground-secondary)] font-medium">📋 处理日志</span>
                                    <button
                                        onClick={() => setUploadLogs([])}
                                        className="text-xs text-[var(--fluent-foreground-secondary)] hover:text-[var(--fluent-foreground)] transition"
                                    >
                                        清除
                                    </button>
                                </div>
                                <div className="p-3 space-y-1 max-h-32 overflow-y-auto">
                                    {uploadLogs.map((log, i) => (
                                        <div key={i} className={`text-xs font-mono ${
                                            log.status === 'success' ? 'text-green-400' :
                                            log.status === 'error' ? 'text-red-400' :
                                            'text-[var(--fluent-foreground-secondary)]'
                                        }`}>
                                            <span className="opacity-50">[{log.time}]</span>{' '}
                                            <span className="text-purple-400">{log.filename}</span>{' '}
                                            {log.message}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </>
                )}
            />

            {/* 主内容 */}
            <main className="flex-1 p-6 overflow-auto">
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
                            className={`fluent-button px-4 py-3 whitespace-nowrap ${
                                selectionMode
                                    ? 'fluent-button-accent shadow-lg shadow-purple-500/25'
                                    : 'fluent-button-subtle'
                            }`}
                        >
                            {selectionMode ? '✓ 多选模式' : '☐ 多选模式'}
                        </button>
                    </div>
                </div>

                {selectionMode && (
                    <div className="mb-4 p-4 fluent-card border-purple-500/30 bg-purple-500/10 flex items-center justify-between fluent-fade-in">
                        <div className="flex items-center gap-4">
                            <span className="text-purple-200 font-medium">
                                ☑ 已选择 {selectedPapers.size} 篇论文
                            </span>
                            <button
                                onClick={toggleSelectAll}
                                className="text-sm text-[var(--fluent-foreground-secondary)] hover:text-[var(--fluent-foreground)] transition"
                            >
                                {selectedPapers.size === papers.length && papers.length > 0 ? '取消全选' : '全选'}
                            </button>
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={openGroupModal}
                                disabled={selectedPapers.size === 0 || batchLoading}
                                className="fluent-button fluent-button-accent px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                📁 分组
                            </button>
                            <button
                                onClick={openExportModal}
                                disabled={selectedPapers.size === 0 || batchLoading}
                                className="fluent-button fluent-button-subtle px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                📤 导出
                            </button>
                            <button
                                onClick={handleBatchDelete}
                                disabled={selectedPapers.size === 0 || batchLoading}
                                className="fluent-button px-4 py-2 bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                🗑️ 删除
                            </button>
                            <button
                                onClick={exitSelectionMode}
                                className="fluent-button fluent-button-subtle px-4 py-2"
                            >
                                取消
                            </button>
                        </div>
                    </div>
                )}

                {papers.length === 0 ? (
                    <div className="text-center py-20 fluent-fade-in">
                        <div className="w-24 h-24 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center">
                            <span className="text-5xl">📭</span>
                        </div>
                        <p className="text-xl font-medium text-[var(--fluent-foreground)]">暂无论文</p>
                        <p className="text-[var(--fluent-foreground-secondary)] mt-2">请上传 PDF 文件开始使用</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {papers.map((paper) => (
                            <div
                                key={paper.id}
                                className={`fluent-card overflow-hidden transition-all fluent-stagger-item hover-lift ${
                                    selectionMode && selectedPapers.has(paper.id)
                                        ? 'border-purple-500 ring-2 ring-purple-500/30 bg-purple-500/5'
                                        : ''
                                }`}
                            >
                                <div className="p-5">
                                    <div className="flex items-start gap-4">
                                        {selectionMode && (
                                            <div className="mr-1 flex items-center">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedPapers.has(paper.id)}
                                                    onChange={() => toggleSelection(paper.id)}
                                                    className="fluent-checkbox"
                                                />
                                            </div>
                                        )}
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-start gap-3">
                                                <div
                                                    className="min-w-0 flex-1 cursor-pointer"
                                                    onClick={() => {
                                                        if (selectionMode) {
                                                            toggleSelection(paper.id);
                                                        } else {
                                                            setExpandedPaper(expandedPaper === paper.id ? null : paper.id);
                                                        }
                                                    }}
                                                >
                                                    <h3 className="text-lg font-semibold text-[var(--fluent-foreground)] leading-tight break-words">{paper.title}</h3>
                                                    {paper.title_cn && <p className="text-[var(--fluent-foreground-secondary)] text-sm mt-1 break-words">{paper.title_cn}</p>}
                                                    <div className="flex flex-wrap items-center gap-3 mt-3 text-sm text-[var(--fluent-foreground-secondary)]">
                                                        <span className="fluent-badge">{paper.journal || 'Journal'}</span>
                                                        <span>📅 {paper.year}</span>
                                                    </div>
                                                    <p className="mt-2 text-sm text-[var(--fluent-foreground-secondary)] break-words">
                                                        ✍️ {paper.authors || '未知作者'}
                                                    </p>
                                                    {!selectionMode && (
                                                        <div className="flex flex-wrap gap-2 mt-3">
                                                            {groups.map(g => (
                                                                <button
                                                                    key={g.id}
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        handleGroupToggle(paper.id, g.name, paper.groups);
                                                                    }}
                                                                    className={`px-2.5 py-1 text-xs rounded-full transition font-medium ${paper.groups.some(pg => pg.name === g.name) ? 'fluent-badge-accent' : 'fluent-badge hover:bg-white/10'}`}
                                                                >
                                                                    {g.name}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    )}
                                                    {selectionMode && paper.groups.length > 0 && (
                                                        <div className="flex flex-wrap gap-1 mt-2">
                                                            {paper.groups.map(g => (
                                                                <span key={g.id} className="fluent-badge-accent px-2 py-0.5 text-xs rounded-full">
                                                                    {g.name}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                                {!selectionMode && (
                                                    <button
                                                        onClick={() => setExpandedPaper(expandedPaper === paper.id ? null : paper.id)}
                                                        className={`fluent-button fluent-button-subtle p-2 transition-transform flex-shrink-0 ${expandedPaper === paper.id ? 'rotate-180' : ''}`}
                                                        title={expandedPaper === paper.id ? '收起' : '展开'}
                                                    >
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                        </svg>
                                                    </button>
                                                )}
                                            </div>

                                            {!selectionMode && (
                                                <div className="mt-4 flex flex-wrap items-center gap-2">
                                                    <button
                                                        onClick={() => handlePreview(paper)}
                                                        disabled={!(paper.has_file ?? !!paper.file_path)}
                                                        className="fluent-button fluent-button-subtle px-2.5 py-1.5 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                                        title={paper.has_file ?? !!paper.file_path ? '预览' : '文件不存在'}
                                                    >
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                        </svg>
                                                        <span className="ml-1">预览</span>
                                                    </button>
                                                    <button
                                                        onClick={() => handleDownload(paper)}
                                                        disabled={!(paper.has_file ?? !!paper.file_path)}
                                                        className="fluent-button fluent-button-subtle px-2.5 py-1.5 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                                        title={paper.has_file ?? !!paper.file_path ? '下载' : '文件不存在'}
                                                    >
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                                        </svg>
                                                        <span className="ml-1">下载</span>
                                                    </button>
                                                    <button
                                                        onClick={() => handleReanalyze(paper)}
                                                        disabled={reanalyzingPaperId === paper.id || !(paper.has_file ?? !!paper.file_path)}
                                                        className="fluent-button fluent-button-subtle px-2.5 py-1.5 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                                        title={paper.has_file ?? !!paper.file_path ? '重新分析' : '文件不存在'}
                                                    >
                                                        {reanalyzingPaperId === paper.id ? (
                                                            <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24">
                                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                                            </svg>
                                                        ) : (
                                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                                            </svg>
                                                        )}
                                                        <span className="ml-1">{reanalyzingPaperId === paper.id ? '分析中' : '重新分析'}</span>
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete(paper.id)}
                                                        className="fluent-button px-2.5 py-1.5 text-sm bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20"
                                                        title="删除"
                                                    >
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                        </svg>
                                                        <span className="ml-1">删除</span>
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* 展开详情 */}
                                {expandedPaper === paper.id && !selectionMode && (
                                    <div className="border-t border-[var(--fluent-divider)] fluent-fade-in">
                                        <div className="p-4 border-b border-[var(--fluent-divider)]">
                                            <div className="fluent-tabs">
                                                {(['analysis', 'abstract_cn', 'abstract_en', 'translate'] as const).map(tab => (
                                                    <button
                                                        key={tab}
                                                        onClick={() => setDetailTab(tab)}
                                                        className={`fluent-tab ${detailTab === tab ? 'active' : ''}`}
                                                    >
                                                        {tab === 'analysis' && '📊 分析'}
                                                        {tab === 'abstract_cn' && '🇨🇳 中文摘要'}
                                                        {tab === 'abstract_en' && '🇺🇸 英文摘要'}
                                                        {tab === 'translate' && '🌐 翻译'}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="p-5">
                                            <div className="rounded-xl border border-[var(--fluent-divider)] bg-[var(--fluent-surface)] p-5">
                                                {detailTab === 'analysis' && (
                                                    <div className="prose prose-invert max-w-none">
                                                        <MarkdownRenderer content={paper.detailed_analysis || paper.analysis || '暂无分析内容'} />
                                                    </div>
                                                )}
                                                {detailTab === 'abstract_cn' && (
                                                    <div className="prose prose-invert max-w-none">
                                                        <p className="text-[var(--fluent-foreground)] leading-relaxed">{paper.abstract || paper.abstract_cn || '暂无中文摘要'}</p>
                                                    </div>
                                                )}
                                                {detailTab === 'abstract_en' && (
                                                    <div className="prose prose-invert max-w-none">
                                                        <p className="text-[var(--fluent-foreground)] leading-relaxed">{paper.abstract_en || '暂无英文摘要'}</p>
                                                    </div>
                                                )}
                                                {detailTab === 'translate' && (
                                                    <TranslationPanel
                                                        paperId={paper.id}
                                                        paperTitle={paper.title}
                                                        hasFile={paper.has_file ?? !!paper.file_path}
                                                        embedded
                                                        onTranslationComplete={loadData}
                                                    />
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </main>

            {/* 批量分组模态框 */}
            {showGroupModal && (
                <div className="fluent-modal-overlay">
                    <div
                        className="fluent-modal-enhanced fluent-modal-zoom"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="batch-group-title"
                        aria-describedby="batch-group-desc"
                    >
                        <div className="fluent-modal-header">
                            <h3 id="batch-group-title" className="fluent-modal-title flex items-center gap-2">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[var(--fluent-purple-400)]">
                                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                                </svg>
                                批量分组
                            </h3>
                            <button onClick={() => setShowGroupModal(false)} className="fluent-modal-close" aria-label="关闭">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <line x1="18" y1="6" x2="6" y2="18"/>
                                    <line x1="6" y1="6" x2="18" y2="18"/>
                                </svg>
                            </button>
                        </div>
                        <div className="fluent-modal-body space-y-5">
                            <p id="batch-group-desc" className="text-sm text-[var(--text-secondary)]">为选中的 <span className="text-[var(--fluent-purple-400)] font-semibold">{selectedPapers.size}</span> 篇论文设置分组</p>
                            <div>
                                <label className="text-sm font-medium text-[var(--text-primary)] mb-3 block">操作类型</label>
                                <div className="flex gap-2">
                                    {[
                                        { value: 'add', label: '添加', icon: '➕' },
                                        { value: 'remove', label: '移除', icon: '➖' },
                                        { value: 'set', label: '替换', icon: '🔄' }
                                    ].map(opt => (
                                        <button
                                            key={opt.value}
                                            onClick={() => setBatchGroupAction(opt.value as 'add' | 'remove' | 'set')}
                                            className={`fluent-button flex-1 py-2.5 ${batchGroupAction === opt.value ? 'fluent-button-accent' : 'fluent-button-subtle'}`}
                                        >
                                            <span className="mr-1">{opt.icon}</span> {opt.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <label className="text-sm font-medium text-[var(--text-primary)] mb-3 block">选择分组</label>
                                <div className="space-y-2 max-h-48 overflow-y-auto scrollbar-glass pr-2">
                                    {groups.map(g => (
                                        <label key={g.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 cursor-pointer transition border border-transparent hover:border-[var(--fluent-border)]">
                                            <input
                                                type="checkbox"
                                                checked={batchSelectedGroups.has(g.name)}
                                                onChange={() => toggleBatchGroupSelection(g.name)}
                                                className="fluent-checkbox"
                                            />
                                            <span className="text-[var(--text-primary)]">{g.name}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div className="fluent-modal-footer">
                            <button
                                onClick={() => setShowGroupModal(false)}
                                className="fluent-button fluent-button-subtle px-5 py-2.5"
                            >
                                取消
                            </button>
                            <button
                                onClick={handleBatchGroup}
                                disabled={batchSelectedGroups.size === 0 || batchLoading}
                                className="fluent-button fluent-button-accent px-5 py-2.5 disabled:opacity-50"
                            >
                                {batchLoading ? (
                                    <span className="flex items-center gap-2" role="status" aria-live="polite">
                                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                        </svg>
                                        处理中...
                                    </span>
                                ) : '确认'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 批量导出模态框 */}
            {showExportModal && (
                <div className="fluent-modal-overlay">
                    <div
                        className="fluent-modal-enhanced fluent-modal-zoom"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="batch-export-title"
                        aria-describedby="batch-export-desc"
                    >
                        <div className="fluent-modal-header">
                            <h3 id="batch-export-title" className="fluent-modal-title flex items-center gap-2">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[var(--fluent-blue-400)]">
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                                    <polyline points="17,8 12,3 7,8"/>
                                    <line x1="12" y1="3" x2="12" y2="15"/>
                                </svg>
                                批量导出
                            </h3>
                            <button onClick={() => setShowExportModal(false)} className="fluent-modal-close" aria-label="关闭">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <line x1="18" y1="6" x2="6" y2="18"/>
                                    <line x1="6" y1="6" x2="18" y2="18"/>
                                </svg>
                            </button>
                        </div>
                        <div className="fluent-modal-body">
                            <p id="batch-export-desc" className="text-sm text-[var(--text-secondary)] mb-5">导出选中的 <span className="text-[var(--fluent-blue-400)] font-semibold">{selectedPapers.size}</span> 篇论文</p>
                            <div className="grid grid-cols-2 gap-4">
                                {[
                                    { format: 'csv', icon: (
                                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                                            <polyline points="14,2 14,8 20,8"/>
                                            <line x1="8" y1="13" x2="16" y2="13"/>
                                            <line x1="8" y1="17" x2="16" y2="17"/>
                                        </svg>
                                    ), label: 'CSV 表格', desc: '适合 Excel 打开', color: 'green' },
                                    { format: 'bibtex', icon: (
                                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
                                            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
                                        </svg>
                                    ), label: 'BibTeX', desc: '适合 LaTeX 引用', color: 'purple' },
                                    { format: 'markdown', icon: (
                                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                                            <polyline points="14,2 14,8 20,8"/>
                                            <line x1="16" y1="13" x2="8" y2="13"/>
                                            <line x1="16" y1="17" x2="8" y2="17"/>
                                            <polyline points="10,9 9,9 8,9"/>
                                        </svg>
                                    ), label: 'Markdown', desc: '适合笔记软件', color: 'blue' },
                                    { format: 'json', icon: (
                                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <polyline points="16,18 22,12 16,6"/>
                                            <polyline points="8,6 2,12 8,18"/>
                                        </svg>
                                    ), label: 'JSON', desc: '适合程序处理', color: 'orange' }
                                ].map(opt => (
                                    <button
                                        key={opt.format}
                                        onClick={() => handleBatchExport(opt.format as 'csv' | 'bibtex' | 'markdown' | 'json')}
                                        disabled={batchLoading}
                                        className={`fluent-card p-5 text-left hover:border-[var(--fluent-${opt.color}-500)] transition-all group disabled:opacity-50 hover-lift`}
                                    >
                                        <div className={`w-12 h-12 rounded-xl bg-gradient-to-br from-${opt.color}-500/20 to-${opt.color}-600/10 flex items-center justify-center mb-3 text-${opt.color}-400 group-hover:scale-110 transition-transform`}>
                                            {opt.icon}
                                        </div>
                                        <div className="font-semibold text-[var(--text-primary)] group-hover:text-[var(--fluent-blue-400)]">{opt.label}</div>
                                        <div className="text-xs text-[var(--text-tertiary)] mt-1">{opt.desc}</div>
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="fluent-modal-footer">
                            <button
                                onClick={() => setShowExportModal(false)}
                                className="fluent-button fluent-button-subtle px-5 py-2.5"
                            >
                                取消
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
