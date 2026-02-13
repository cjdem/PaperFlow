'use client';

import { useState, useEffect } from 'react';

interface JournalOption {
    name: string;
    count: number;
}

interface FilterOptions {
    years: string[];
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
                <div className="fluent-search-container flex-1 max-w-lg">
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="搜索论文标题、作者、摘要..."
                        className="fluent-search-input"
                    />
                    <svg className="fluent-search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="11" cy="11" r="8"/>
                        <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                    </svg>
                    {search && (
                        <button
                            onClick={() => setSearch('')}
                            className="fluent-search-clear"
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <line x1="18" y1="6" x2="6" y2="18"/>
                                <line x1="6" y1="6" x2="18" y2="18"/>
                            </svg>
                        </button>
                    )}
                </div>
                <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className={`fluent-button px-4 py-3 font-medium flex items-center gap-2 transition-all ${
                        isExpanded || activeFiltersCount > 0
                            ? 'fluent-button-accent'
                            : 'fluent-button-subtle'
                    }`}
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                        <polyline points="6,9 12,15 18,9"/>
                    </svg>
                    {isExpanded ? '收起筛选' : '高级搜索'}
                    {activeFiltersCount > 0 && !isExpanded && (
                        <span className="fluent-badge-accent px-2 py-0.5 text-xs rounded-full">
                            {activeFiltersCount}
                        </span>
                    )}
                </button>
                <button
                    onClick={handleSearch}
                    className="fluent-button fluent-button-primary px-6 py-3 font-medium flex items-center gap-2"
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="11" cy="11" r="8"/>
                        <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                    </svg>
                    搜索
                </button>
            </div>

            {/* 高级搜索面板 */}
            {isExpanded && (
                <div className="fluent-card p-5 space-y-5 fluent-dropdown-expand">
                    {/* 搜索范围 */}
                    <div>
                        <p className="text-sm text-[var(--text-secondary)] mb-3 font-medium flex items-center gap-2">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[var(--fluent-blue-400)]">
                                <circle cx="12" cy="12" r="10"/>
                                <line x1="12" y1="8" x2="12" y2="12"/>
                                <line x1="12" y1="16" x2="12.01" y2="16"/>
                            </svg>
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
                                <button
                                    key={key}
                                    onClick={() => toggleSearchField(key)}
                                    className={`fluent-button px-3 py-2 text-sm transition-all ${
                                        searchFields.includes(key)
                                            ? 'fluent-button-accent'
                                            : 'fluent-button-subtle'
                                    }`}
                                >
                                    <span className="mr-1">{icon}</span> {label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* 年份筛选 */}
                    <div>
                        <p className="text-sm text-[var(--text-secondary)] mb-3 font-medium flex items-center gap-2">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[var(--fluent-purple-400)]">
                                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                                <line x1="16" y1="2" x2="16" y2="6"/>
                                <line x1="8" y1="2" x2="8" y2="6"/>
                                <line x1="3" y1="10" x2="21" y2="10"/>
                            </svg>
                            年份范围
                        </p>
                        <div className="flex items-center gap-3">
                            <select
                                value={yearFrom}
                                onChange={(e) => setYearFrom(e.target.value)}
                                className="fluent-select min-w-[120px]"
                            >
                                <option value="">起始年份</option>
                                {filterOptions?.years.map(year => (
                                    <option key={year} value={year}>{year}</option>
                                ))}
                            </select>
                            <span className="text-[var(--text-tertiary)]">至</span>
                            <select
                                value={yearTo}
                                onChange={(e) => setYearTo(e.target.value)}
                                className="fluent-select min-w-[120px]"
                            >
                                <option value="">结束年份</option>
                                {filterOptions?.years.map(year => (
                                    <option key={year} value={year}>{year}</option>
                                ))}
                            </select>
                            {(yearFrom || yearTo) && (
                                <button
                                    onClick={() => { setYearFrom(''); setYearTo(''); }}
                                    className="fluent-button fluent-button-subtle px-3 py-1.5 text-sm"
                                >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <line x1="18" y1="6" x2="6" y2="18"/>
                                        <line x1="6" y1="6" x2="18" y2="18"/>
                                    </svg>
                                </button>
                            )}
                        </div>
                    </div>

                    {/* 期刊筛选 */}
                    <div>
                        <p className="text-sm text-[var(--text-secondary)] mb-3 font-medium flex items-center gap-2">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[var(--fluent-success)]">
                                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
                                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
                            </svg>
                            期刊筛选
                            {selectedJournals.length > 0 && (
                                <span className="fluent-badge-primary px-2 py-0.5 text-xs rounded-full">
                                    已选 {selectedJournals.length}
                                </span>
                            )}
                        </p>
                        {loadingOptions ? (
                            <div className="flex items-center gap-2 text-[var(--text-secondary)] text-sm py-4">
                                <div className="w-5 h-5 border-2 border-[var(--fluent-blue-500)] border-t-transparent rounded-full animate-spin" />
                                加载筛选选项...
                            </div>
                        ) : filterOptions?.journals.length === 0 ? (
                            <p className="text-[var(--text-tertiary)] text-sm py-4">暂无期刊数据</p>
                        ) : (
                            <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto scrollbar-glass p-1">
                                {filterOptions?.journals.map(({ name, count }) => (
                                    <button
                                        key={name}
                                        onClick={() => toggleJournal(name)}
                                        className={`fluent-button px-3 py-2 text-sm transition-all ${
                                            selectedJournals.includes(name)
                                                ? 'fluent-button-accent'
                                                : 'fluent-button-subtle'
                                        }`}
                                    >
                                        {name} <span className="opacity-50 ml-1">({count})</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* 操作按钮 */}
                    <div className="flex justify-between items-center pt-4 border-t border-[var(--fluent-divider)]">
                        <div className="text-xs text-[var(--text-tertiary)]">
                            {activeFiltersCount > 0 ? `已应用 ${activeFiltersCount} 个筛选条件` : '未设置筛选条件'}
                        </div>
                        <div className="flex gap-3">
                            <button
                                onClick={handleReset}
                                className="fluent-button fluent-button-subtle px-4 py-2.5"
                            >
                                重置筛选
                            </button>
                            <button
                                onClick={handleSearch}
                                className="fluent-button fluent-button-primary px-5 py-2.5"
                            >
                                应用筛选
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}