
'use client';

import { useState, useCallback, useRef, useEffect, Suspense } from 'react';
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
import AppShell from '@/components/AppShell';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { motion, AnimatePresence } from 'motion/react';
import { ENTRANCE_VARIANTS } from '@/lib/animations/fluid-transitions';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
    Loader2, Upload, FolderOpen, FileText, ClipboardList, CheckCheck,
    Square, CheckSquare, Trash2, Inbox, Calendar, PenLine, BarChart3,
    Globe, FileDown, Eye, RefreshCw, Plus, Minus, ArrowLeftRight, X,
    FileSpreadsheet, BookOpen, Braces
} from 'lucide-react';


export default function PapersPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="animate-spin h-8 w-8 text-primary rounded-full border-2 border-primary border-t-transparent" /></div>}>
      <PapersContent />
    </Suspense>
  );
}

function PapersContent() {
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
            toast.error(err instanceof Error ? err.message : '删除失败');
        }
    };

    const handleDownload = async (paper: Paper) => {
        const hasFile = paper.has_file ?? !!paper.file_path;
        if (!hasFile) {
            toast.error('文件不存在，无法下载');
            return;
        }
        try {
            const filename = (paper.title || 'paper') + '.pdf';
            const blob = await apiClient.get<Blob>(`/api/papers/${paper.id}/download`, {
                responseType: 'blob'
            });
            downloadBlob(blob, filename);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : '下载失败');
        }
    };

    const handlePreview = async (paper: Paper) => {
        const hasFile = paper.has_file ?? !!paper.file_path;
        if (!hasFile) {
            toast.error('文件不存在，无法预览');
            return;
        }
        try {
            await previewPaper(paper.id);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : '预览失败');
        }
    };

    const handleReanalyze = async (paper: Paper) => {
        const hasFile = paper.has_file ?? !!paper.file_path;
        if (!hasFile) {
            toast.error('文件不存在，无法重新分析');
            return;
        }
        if (!confirm(`确定要重新分析论文「${paper.title}」吗？这可能需要几分钟时间。`)) return;

        setReanalyzingPaperId(paper.id);
        try {
            await reanalyzePaper(paper.id);
            toast.success('重新分析完成！');
            await loadData();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : '重新分析失败');
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
            toast.error(err instanceof Error ? err.message : '创建失败');
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
            toast.error(err instanceof Error ? err.message : '更新失败');
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
            toast.success(result.message);
            setSelectedPapers(new Set());
            await loadData();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : '批量删除失败');
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
            toast.success(result.message);
            setShowGroupModal(false);
            await loadData();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : '批量分组失败');
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
            toast.error(err instanceof Error ? err.message : '导出失败');
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
        return <div className="min-h-screen flex items-center justify-center bg-background"><Loader2 className="animate-spin h-8 w-8 text-primary" /></div>;
    }

    const toolbar = (
        <div className="flex items-center gap-2">
            <form onSubmit={(e) => { e.preventDefault(); handleCreateGroup(); }} className="flex items-center gap-2">
                <Input
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    placeholder="新分组名"
                    className="w-32 h-8 text-sm"
                />
                <Button type="submit" size="sm" variant="outline" disabled={!newGroupName.trim()}>
                    <Plus className="w-3.5 h-3.5" />
                </Button>
            </form>
            <label className={cn("cursor-pointer", uploading && "pointer-events-none opacity-50")}>
                <span>
                    <Button variant="outline" size="sm" disabled={uploading}>
                        {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                        <span className="ml-1.5 hidden sm:inline">上传</span>
                    </Button>
                </span>
                <input type="file" accept=".pdf" multiple onChange={handleUpload} className="hidden" disabled={uploading} />
            </label>
        </div>
    );

    return (
        <AppShell title="论文管理" toolbar={toolbar}>
            {/* 上传进度 */}
            <AnimatePresence>
                {uploadProgress && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="mb-4 rounded-3xl border bg-card p-4 space-y-3 overflow-hidden"
                    >
                        {uploadProgress.totalFiles && uploadProgress.totalFiles > 1 && (
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs font-medium text-muted-foreground"><FolderOpen className="w-4 h-4 inline" /> 总进度</span>
                                    <span className="text-xs font-medium text-muted-foreground">
                                        {(uploadProgress.fileIndex ?? 0) + 1} / {uploadProgress.totalFiles} 个文件
                                    </span>
                                </div>
                                <Progress value={(((uploadProgress.fileIndex ?? 0) + (uploadProgress.status === 'success' ? 1 : 0.5)) / uploadProgress.totalFiles) * 100} className="h-2" />
                            </div>
                        )}

                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-xs text-muted-foreground truncate max-w-[200px]" title={uploadProgress.filename}>
                                    <FileText className="w-4 h-4 inline" /> {uploadProgress.filename}
                                </span>
                                <Badge variant={
                                    uploadProgress.status === 'success' ? 'default' :
                                    uploadProgress.status === 'error' ? 'destructive' : 'outline'
                                }>
                                    步骤 {uploadProgress.step}/{uploadProgress.total}
                                </Badge>
                            </div>
                            <Progress
                                value={(uploadProgress.step / uploadProgress.total) * 100}
                                className={cn(
                                    "h-1.5 mb-2",
                                    uploadProgress.status === 'success' && "[&>div]:bg-green-500",
                                    uploadProgress.status === 'error' && "[&>div]:bg-red-500"
                                )}
                            />
                            <p className={cn(
                                "text-sm",
                                uploadProgress.status === 'success' ? "text-green-500" :
                                uploadProgress.status === 'error' ? "text-red-500" :
                                "text-muted-foreground"
                            )}>
                                {uploadProgress.message}
                            </p>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* 处理日志 */}
            <AnimatePresence>
                {uploadLogs.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="mb-4 rounded-3xl border bg-card max-h-48 overflow-hidden"
                    >
                        <div className="p-3 flex justify-between items-center border-b border-border sticky top-0 bg-card">
                            <span className="text-xs text-muted-foreground font-medium"><ClipboardList className="w-4 h-4 inline" /> 处理日志</span>
                            <button onClick={() => setUploadLogs([])} className="text-xs text-muted-foreground hover:text-foreground transition">清除</button>
                        </div>
                        <div className="p-3 space-y-1 max-h-32 overflow-y-auto">
                            {uploadLogs.map((log, i) => (
                                <div key={i} className={cn(
                                    "text-xs font-mono",
                                    log.status === 'success' ? "text-green-500" :
                                    log.status === 'error' ? "text-red-500" :
                                    "text-muted-foreground"
                                )}>
                                    <span className="opacity-50">[{log.time}]</span>{' '}
                                    <span className="text-primary">{log.filename}</span>{' '}
                                    {log.message}
                                </div>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* 搜索 + 多选 */}
            <div className="mb-4" role="search">
                <div className="flex flex-col md:flex-row items-start gap-4">
                    <div className="flex-1">
                        <AdvancedSearch
                            onSearch={handleAdvancedSearch}
                            initialSearch={searchParams.search}
                            filterOptions={filterOptions}
                            loadingOptions={loadingOptions}
                            onExpandChange={handleSearchExpandChange}
                        />
                    </div>
                    <Button
                        variant={selectionMode ? "default" : "outline"}
                        size="sm"
                        onClick={() => selectionMode ? exitSelectionMode() : setSelectionMode(true)}
                    >
                        {selectionMode ? <CheckCheck className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                        <span className="ml-1.5 hidden md:inline">多选</span>
                    </Button>
                </div>
            </div>

            {/* 批量操作栏 */}
            <AnimatePresence>
                {selectionMode && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="mb-4 p-4 rounded-3xl border bg-card flex flex-col md:flex-row items-start md:items-center justify-between gap-3"
                    >
                        <div className="flex items-center gap-4">
                            <span className="font-medium text-sm md:text-base">
                                <CheckSquare className="w-4 h-4 inline" /> 已选择 {selectedPapers.size} 篇
                            </span>
                            <button onClick={toggleSelectAll} className="text-sm text-muted-foreground hover:text-foreground transition">
                                {selectedPapers.size === papers.length && papers.length > 0 ? '取消全选' : '全选'}
                            </button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <Button size="sm" onClick={openGroupModal} disabled={selectedPapers.size === 0 || batchLoading}>
                                <FolderOpen className="w-4 h-4" /> <span className="hidden md:inline ml-1">分组</span>
                            </Button>
                            <Button size="sm" variant="outline" onClick={openExportModal} disabled={selectedPapers.size === 0 || batchLoading}>
                                <Upload className="w-4 h-4" /> <span className="hidden md:inline ml-1">导出</span>
                            </Button>
                            <Button size="sm" variant="destructive" onClick={handleBatchDelete} disabled={selectedPapers.size === 0 || batchLoading}>
                                <Trash2 className="w-4 h-4" /> <span className="hidden md:inline ml-1">删除</span>
                            </Button>
                            <Button size="sm" variant="outline" onClick={exitSelectionMode}>取消</Button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* 论文列表 */}
            {papers.length === 0 ? (
                <div className="text-center py-20">
                    <div className="w-24 h-24 mx-auto mb-6 rounded-2xl bg-primary/10 flex items-center justify-center">
                        <Inbox className="w-12 h-12 text-primary" />
                    </div>
                    <p className="text-xl font-medium text-foreground">暂无论文</p>
                    <p className="text-muted-foreground mt-2">请上传 PDF 文件开始使用</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {papers.map((paper, index) => (
                        <motion.div
                            key={paper.id}
                            {...ENTRANCE_VARIANTS.card(index)}
                            className={cn(
                                "rounded-3xl border bg-card overflow-hidden transition-all",
                                selectionMode && selectedPapers.has(paper.id) && "border-primary ring-2 ring-primary/30 bg-primary/5"
                            )}
                        >
                            <div className="p-5">
                                <div className="flex items-start gap-4">
                                    {selectionMode && (
                                        <div className="mr-1 flex items-center">
                                            <input
                                                type="checkbox"
                                                checked={selectedPapers.has(paper.id)}
                                                onChange={() => toggleSelection(paper.id)}
                                                className="w-4 h-4 rounded border"
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
                                                <h3 className="text-lg font-semibold text-foreground leading-tight break-words">{paper.title}</h3>
                                                {paper.title_cn && <p className="text-muted-foreground text-sm mt-1 break-words">{paper.title_cn}</p>}
                                                <div className="flex flex-wrap items-center gap-3 mt-3 text-sm text-muted-foreground">
                                                    <Badge variant="outline">{paper.journal || 'Journal'}</Badge>
                                                    <span><Calendar className="w-3 h-3 inline" /> {paper.year}</span>
                                                </div>
                                                <p className="mt-2 text-sm text-muted-foreground break-words">
                                                    <PenLine className="w-3 h-3 inline" /> {paper.authors || '未知作者'}
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
                                                                className={cn(
                                                                    "px-2.5 py-1 text-xs rounded-full transition font-medium",
                                                                    paper.groups.some(pg => pg.name === g.name)
                                                                        ? "bg-primary text-primary-foreground"
                                                                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                                                                )}
                                                            >
                                                                {g.name}
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                                {selectionMode && paper.groups.length > 0 && (
                                                    <div className="flex flex-wrap gap-1 mt-2">
                                                        {paper.groups.map(g => (
                                                            <Badge key={g.id}>{g.name}</Badge>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                            {!selectionMode && (
                                                <button
                                                    onClick={() => setExpandedPaper(expandedPaper === paper.id ? null : paper.id)}
                                                    className={cn(
                                                        "p-2 rounded-md hover:bg-muted transition-transform flex-shrink-0",
                                                        expandedPaper === paper.id && "rotate-180"
                                                    )}
                                                    title={expandedPaper === paper.id ? '收起' : '展开'}
                                                    aria-label={expandedPaper === paper.id ? '收起详情' : '展开详情'}
                                                >
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                    </svg>
                                                </button>
                                            )}
                                        </div>

                                        {!selectionMode && (
                                            <div className="mt-4 flex flex-wrap items-center gap-2">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handlePreview(paper)}
                                                    disabled={!(paper.has_file ?? !!paper.file_path)}
                                                    title={paper.has_file ?? !!paper.file_path ? '预览' : '文件不存在'}
                                                >
                                                    <Eye className="w-4 h-4" />
                                                    <span className="ml-1 hidden md:inline">预览</span>
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleDownload(paper)}
                                                    disabled={!(paper.has_file ?? !!paper.file_path)}
                                                    title={paper.has_file ?? !!paper.file_path ? '下载' : '文件不存在'}
                                                >
                                                    <FileDown className="w-4 h-4" />
                                                    <span className="ml-1 hidden md:inline">下载</span>
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleReanalyze(paper)}
                                                    disabled={reanalyzingPaperId === paper.id || !(paper.has_file ?? !!paper.file_path)}
                                                    title={paper.has_file ?? !!paper.file_path ? '重新分析' : '文件不存在'}
                                                >
                                                    {reanalyzingPaperId === paper.id ? (
                                                        <Loader2 className="w-4 h-4 animate-spin" />
                                                    ) : (
                                                        <RefreshCw className="w-4 h-4" />
                                                    )}
                                                    <span className="ml-1 hidden md:inline">{reanalyzingPaperId === paper.id ? '分析中' : '重新分析'}</span>
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleDelete(paper.id)}
                                                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                                    title="删除"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                    <span className="ml-1 hidden md:inline">删除</span>
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* 展开详情 */}
                            <AnimatePresence>
                                {expandedPaper === paper.id && !selectionMode && (
                                    <motion.div
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                        className="border-t border-border overflow-hidden"
                                    >
                                        <div className="p-4 border-b border-border">
                                            <div className="inline-flex gap-1 border-b border-border -mb-px">
                                                {(['analysis', 'abstract_cn', 'abstract_en', 'translate'] as const).map(tab => (
                                                    <button
                                                        key={tab}
                                                        onClick={() => setDetailTab(tab)}
                                                        className={cn(
                                                            "px-3 py-2 text-sm border-b-2 transition-colors",
                                                            detailTab === tab
                                                                ? "border-primary text-foreground font-medium"
                                                                : "border-transparent text-muted-foreground hover:text-foreground"
                                                        )}
                                                    >
                                                        {tab === 'analysis' && <><BarChart3 className="w-4 h-4 inline" /> 分析</>}
                                                        {tab === 'abstract_cn' && '中文摘要'}
                                                        {tab === 'abstract_en' && '英文摘要'}
                                                        {tab === 'translate' && <><Globe className="w-4 h-4 inline" /> 翻译</>}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="p-5">
                                            <div className="rounded-2xl border border-border bg-muted/30 p-5">
                                                {detailTab === 'analysis' && (
                                                    <div className="prose max-w-none">
                                                        <MarkdownRenderer content={paper.detailed_analysis || paper.analysis || '暂无分析内容'} />
                                                    </div>
                                                )}
                                                {detailTab === 'abstract_cn' && (
                                                    <div className="prose max-w-none">
                                                        <p className="text-foreground leading-relaxed">{paper.abstract || paper.abstract_cn || '暂无中文摘要'}</p>
                                                    </div>
                                                )}
                                                {detailTab === 'abstract_en' && (
                                                    <div className="prose max-w-none">
                                                        <p className="text-foreground leading-relaxed">{paper.abstract_en || '暂无英文摘要'}</p>
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
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </motion.div>
                    ))}
                </div>
            )}

            {/* 批量分组对话框 */}
            <Dialog open={showGroupModal} onOpenChange={setShowGroupModal}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <FolderOpen className="w-5 h-5 text-primary" />
                            批量分组
                        </DialogTitle>
                        <DialogDescription>为选中的 <span className="text-primary font-semibold">{selectedPapers.size}</span> 篇论文设置分组</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-5">
                        <div>
                            <label className="text-sm font-medium mb-3 block">操作类型</label>
                            <div className="flex gap-2">
                                {[
                                    { value: 'add' as const, label: '添加', Icon: Plus },
                                    { value: 'remove' as const, label: '移除', Icon: Minus },
                                    { value: 'set' as const, label: '替换', Icon: ArrowLeftRight }
                                ].map(opt => (
                                    <Button
                                        key={opt.value}
                                        variant={batchGroupAction === opt.value ? "default" : "outline"}
                                        className="flex-1"
                                        onClick={() => setBatchGroupAction(opt.value)}
                                    >
                                        <opt.Icon className="w-4 h-4" /> {opt.label}
                                    </Button>
                                ))}
                            </div>
                        </div>
                        <div>
                            <label className="text-sm font-medium mb-3 block">选择分组</label>
                            <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
                                {groups.map(g => (
                                    <label key={g.id} className={cn(
                                        "flex items-center gap-3 p-3 rounded-xl cursor-pointer transition border",
                                        batchSelectedGroups.has(g.name)
                                            ? "border-primary/50 bg-primary/5"
                                            : "border-transparent hover:bg-muted"
                                    )}>
                                        <input
                                            type="checkbox"
                                            checked={batchSelectedGroups.has(g.name)}
                                            onChange={() => toggleBatchGroupSelection(g.name)}
                                            className="w-4 h-4 rounded border"
                                        />
                                        <span>{g.name}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowGroupModal(false)}>取消</Button>
                        <Button onClick={handleBatchGroup} disabled={batchSelectedGroups.size === 0 || batchLoading}>
                            {batchLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : '确认'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* 批量导出对话框 */}
            <Dialog open={showExportModal} onOpenChange={setShowExportModal}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <FileDown className="w-5 h-5 text-primary" />
                            批量导出
                        </DialogTitle>
                        <DialogDescription>导出选中的 <span className="text-primary font-semibold">{selectedPapers.size}</span> 篇论文</DialogDescription>
                    </DialogHeader>
                    <div className="grid grid-cols-2 gap-4">
                        {[
                            { format: 'csv' as const, icon: <FileSpreadsheet className="w-6 h-6" />, label: 'CSV 表格', desc: '适合 Excel 打开' },
                            { format: 'bibtex' as const, icon: <BookOpen className="w-6 h-6" />, label: 'BibTeX', desc: '适合 LaTeX 引用' },
                            { format: 'markdown' as const, icon: <FileText className="w-6 h-6" />, label: 'Markdown', desc: '适合笔记软件' },
                            { format: 'json' as const, icon: <Braces className="w-6 h-6" />, label: 'JSON', desc: '适合程序处理' }
                        ].map(opt => (
                            <button
                                key={opt.format}
                                onClick={() => handleBatchExport(opt.format)}
                                disabled={batchLoading}
                                className="rounded-3xl border bg-card p-5 text-left hover:border-primary/30 transition-all group disabled:opacity-50"
                            >
                                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-3 text-primary group-hover:scale-110 transition-transform">
                                    {opt.icon}
                                </div>
                                <div className="font-semibold group-hover:text-primary">{opt.label}</div>
                                <div className="text-xs text-muted-foreground mt-1">{opt.desc}</div>
                            </button>
                        ))}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowExportModal(false)}>取消</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </AppShell>
    );
}
