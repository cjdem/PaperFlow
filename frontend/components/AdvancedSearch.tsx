'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, X, ChevronDown, Calendar, BookOpen, Info, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface JournalOption {
    name: string;
    count: number;
}

interface FilterOptions {
    years: number[];
    journals: JournalOption[];
}

export interface SearchParams {
    search: string;
    searchFields: string[];
    yearFrom: string;
    yearTo: string;
    journals: string[];
}

interface AdvancedSearchProps {
    onSearch: (params: SearchParams) => void;
    initialSearch?: string;
    filterOptions: FilterOptions | null;
    loadingOptions?: boolean;
    onExpandChange?: (expanded: boolean) => void;
}

export default function AdvancedSearch({
    onSearch,
    initialSearch = '',
    filterOptions,
    loadingOptions = false,
    onExpandChange
}: AdvancedSearchProps) {
    const [isExpanded, setIsExpanded] = useState(false);
    const [search, setSearch] = useState(initialSearch);
    const [searchFields, setSearchFields] = useState<string[]>(['all']);
    const [yearFrom, setYearFrom] = useState('');
    const [yearTo, setYearTo] = useState('');
    const [selectedJournals, setSelectedJournals] = useState<string[]>([]);

    // 计算激活的筛选条件数量
    const activeFiltersCount = [
        searchFields.length > 0 && !searchFields.includes('all'),
        yearFrom !== '',
        yearTo !== '',
        selectedJournals.length > 0
    ].filter(Boolean).length;

    useEffect(() => {
        if (onExpandChange) {
            onExpandChange(isExpanded);
        }
    }, [isExpanded, onExpandChange]);

    const handleSearch = () => {
        onSearch({
            search,
            searchFields,
            yearFrom,
            yearTo,
            journals: selectedJournals
        });
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleSearch();
        }
    };

    const handleReset = () => {
        setSearch('');
        setSearchFields(['all']);
        setYearFrom('');
        setYearTo('');
        setSelectedJournals([]);
        onSearch({
            search: '',
            searchFields: ['all'],
            yearFrom: '',
            yearTo: '',
            journals: []
        });
    };

    const toggleSearchField = (field: string) => {
        if (field === 'all') {
            setSearchFields(['all']);
        } else {
            const newFields = searchFields.filter(f => f !== 'all');
            if (newFields.includes(field)) {
                const filtered = newFields.filter(f => f !== field);
                setSearchFields(filtered.length ? filtered : ['all']);
            } else {
                setSearchFields([...newFields, field]);
            }
        }
    };

    const toggleJournal = (journal: string) => {
        setSelectedJournals(prev =>
            prev.includes(journal)
                ? prev.filter(j => j !== journal)
                : [...prev, journal]
        );
    };

    return (
        <div className="space-y-4">
            {/* 搜索栏 */}
            <div className="flex items-center gap-4">
                <div className="relative flex-1 max-w-lg">
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="搜索论文标题、作者、摘要..."
                        className="w-full rounded-xl border bg-transparent pl-10 pr-8 py-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    />
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
                    {search && (
                        <button
                            onClick={() => setSearch('')}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                            <X size={14} />
                        </button>
                    )}
                </div>
                <Button
                    variant={isExpanded || activeFiltersCount > 0 ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="px-4 py-3 font-medium flex items-center gap-2 transition-all"
                >
                    <ChevronDown size={16} className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                    {isExpanded ? '收起筛选' : '高级搜索'}
                    {activeFiltersCount > 0 && !isExpanded && (
                        <Badge>{activeFiltersCount}</Badge>
                    )}
                </Button>
                <Button
                    size="sm"
                    onClick={handleSearch}
                    className="px-6 py-3 font-medium flex items-center gap-2"
                >
                    <Search size={16} />
                    搜索
                </Button>
            </div>

            {/* 高级搜索面板 */}
            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                    >
                        <div className="rounded-3xl border bg-card p-5 space-y-5">
                            {/* 搜索范围 */}
                            <div>
                                <p className="text-sm text-muted-foreground mb-3 font-medium flex items-center gap-2">
                                    <Info size={16} className="text-primary" />
                                    搜索范围
                                </p>
                                <div className="flex flex-wrap gap-2">
                                    {[
                                        { key: 'all', label: '全部字段', icon: '🔍' },
                                        { key: 'title', label: '标题', icon: '📝' },
                                        { key: 'authors', label: '作者', icon: '👤' },
                                        { key: 'abstract', label: '摘要', icon: '📄' },
                                        { key: 'journal', label: '期刊', icon: '📚' }
                                    ].map(({ key, label, icon }) => (
                                        <Button
                                            key={key}
                                            variant={searchFields.includes(key) ? 'default' : 'outline'}
                                            size="sm"
                                            onClick={() => toggleSearchField(key)}
                                            className="px-3 py-2 text-sm transition-all"
                                        >
                                            <span className="mr-1">{icon}</span> {label}
                                        </Button>
                                    ))}
                                </div>
                            </div>

                            {/* 年份筛选 */}
                            <div>
                                <p className="text-sm text-muted-foreground mb-3 font-medium flex items-center gap-2">
                                    <Calendar size={16} className="text-primary" />
                                    年份范围
                                </p>
                                <div className="flex items-center gap-3">
                                    <select
                                        value={yearFrom}
                                        onChange={(e) => setYearFrom(e.target.value)}
                                        className="border rounded-md bg-transparent px-3 py-2 text-sm min-w-[120px]"
                                    >
                                        <option value="">起始年份</option>
                                        {filterOptions?.years.map(year => (
                                            <option key={year} value={year}>{year}</option>
                                        ))}
                                    </select>
                                    <span className="text-muted-foreground">至</span>
                                    <select
                                        value={yearTo}
                                        onChange={(e) => setYearTo(e.target.value)}
                                        className="border rounded-md bg-transparent px-3 py-2 text-sm min-w-[120px]"
                                    >
                                        <option value="">结束年份</option>
                                        {filterOptions?.years.map(year => (
                                            <option key={year} value={year}>{year}</option>
                                        ))}
                                    </select>
                                    {(yearFrom || yearTo) && (
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => { setYearFrom(''); setYearTo(''); }}
                                            className="px-3 py-1.5 text-sm"
                                        >
                                            <X size={14} />
                                        </Button>
                                    )}
                                </div>
                            </div>

                            {/* 期刊筛选 */}
                            <div>
                                <p className="text-sm text-muted-foreground mb-3 font-medium flex items-center gap-2">
                                    <BookOpen size={16} className="text-primary" />
                                    期刊筛选
                                    {selectedJournals.length > 0 && (
                                        <Badge>已选 {selectedJournals.length}</Badge>
                                    )}
                                </p>
                                {loadingOptions ? (
                                    <div className="flex items-center gap-2 text-muted-foreground text-sm py-4">
                                        <Loader2 className="animate-spin h-5 w-5 text-primary" />
                                        加载筛选选项...
                                    </div>
                                ) : filterOptions?.journals.length === 0 ? (
                                    <p className="text-muted-foreground text-sm py-4">暂无期刊数据</p>
                                ) : (
                                    <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto p-1">
                                        {filterOptions?.journals.map((j) => (
                                            <Button
                                                key={j.name}
                                                variant={selectedJournals.includes(j.name) ? 'default' : 'outline'}
                                                size="sm"
                                                onClick={() => toggleJournal(j.name)}
                                                className="px-3 py-2 text-sm transition-all"
                                            >
                                                {j.name}{j.count != null ? ` (${j.count})` : ''}
                                            </Button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* 操作按钮 */}
                            <div className="flex justify-between items-center pt-4 border-t border-border">
                                <div className="text-xs text-muted-foreground">
                                    {activeFiltersCount > 0 ? `已应用 ${activeFiltersCount} 个筛选条件` : '未设置筛选条件'}
                                </div>
                                <div className="flex gap-3">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={handleReset}
                                        className="px-4 py-2.5"
                                    >
                                        重置筛选
                                    </Button>
                                    <Button
                                        size="sm"
                                        onClick={handleSearch}
                                        className="px-5 py-2.5"
                                    >
                                        应用筛选
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
