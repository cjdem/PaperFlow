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
                <div className="flex-1 max-w-md relative">
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="🔍 搜索论文..."
                        className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none"
                    />
                </div>
                <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className={`px-4 py-3 rounded-lg font-medium transition flex items-center gap-2 ${isExpanded || activeFiltersCount > 0
                            ? 'bg-purple-600 text-white'
                            : 'bg-slate-800 border border-slate-700 text-gray-300 hover:bg-slate-700'
                        }`}
                >
                    {isExpanded ? '收起筛选 ▲' : '高级搜索 ▼'}
                    {activeFiltersCount > 0 && !isExpanded && (
                        <span className="px-2 py-0.5 bg-purple-500 text-white text-xs rounded-full">
                            {activeFiltersCount}
                        </span>
                    )}
                </button>
                <button
                    onClick={handleSearch}
                    className="px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg hover:from-blue-600 hover:to-purple-700 transition font-medium"
                >
                    搜索
                </button>
            </div>

            {/* 高级搜索面板 */}
            {isExpanded && (
                <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-4 animate-in slide-in-from-top-2 duration-200">
                    {/* 搜索范围 */}
                    <div>
                        <p className="text-sm text-gray-400 mb-2">搜索范围</p>
                        <div className="flex flex-wrap gap-2">
                            {[
                                { key: 'all', label: '全部字段' },
                                { key: 'title', label: '标题' },
                                { key: 'authors', label: '作者' },
                                { key: 'abstract', label: '摘要' },
                                { key: 'journal', label: '期刊' }
                            ].map(({ key, label }) => (
                                <button
                                    key={key}
                                    onClick={() => toggleSearchField(key)}
                                    className={`px-3 py-1.5 rounded-lg text-sm transition ${searchFields.includes(key)
                                            ? 'bg-purple-600 text-white'
                                            : 'bg-slate-700 text-gray-300 hover:bg-slate-600'
                                        }`}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* 年份筛选 */}
                    <div>
                        <p className="text-sm text-gray-400 mb-2">年份范围</p>
                        <div className="flex items-center gap-2">
                            <select
                                value={yearFrom}
                                onChange={(e) => setYearFrom(e.target.value)}
                                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:border-purple-500 focus:outline-none"
                            >
                                <option value="">起始年份</option>
                                {filterOptions?.years.map(year => (
                                    <option key={year} value={year}>{year}</option>
                                ))}
                            </select>
                            <span className="text-gray-500">—</span>
                            <select
                                value={yearTo}
                                onChange={(e) => setYearTo(e.target.value)}
                                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:border-purple-500 focus:outline-none"
                            >
                                <option value="">结束年份</option>
                                {filterOptions?.years.map(year => (
                                    <option key={year} value={year}>{year}</option>
                                ))}
                            </select>
                            {(yearFrom || yearTo) && (
                                <button
                                    onClick={() => { setYearFrom(''); setYearTo(''); }}
                                    className="px-2 py-1 text-gray-400 hover:text-white text-sm"
                                >
                                    清除
                                </button>
                            )}
                        </div>
                    </div>

                    {/* 期刊筛选 */}
                    <div>
                        <p className="text-sm text-gray-400 mb-2">
                            期刊筛选
                            {selectedJournals.length > 0 && (
                                <span className="ml-2 px-2 py-0.5 bg-blue-600 text-white text-xs rounded-full">
                                    已选 {selectedJournals.length}
                                </span>
                            )}
                        </p>
                        {loadingOptions ? (
                            <p className="text-gray-500 text-sm">加载中...</p>
                        ) : filterOptions?.journals.length === 0 ? (
                            <p className="text-gray-500 text-sm">暂无期刊数据</p>
                        ) : (
                            <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-1">
                                {filterOptions?.journals.map(({ name, count }) => (
                                    <button
                                        key={name}
                                        onClick={() => toggleJournal(name)}
                                        className={`px-3 py-1.5 rounded-lg text-sm transition ${selectedJournals.includes(name)
                                                ? 'bg-blue-600 text-white'
                                                : 'bg-slate-700 text-gray-300 hover:bg-slate-600'
                                            }`}
                                    >
                                        {name} <span className="text-gray-400">({count})</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* 操作按钮 */}
                    <div className="flex justify-end gap-2 pt-2 border-t border-slate-700">
                        <button
                            onClick={handleReset}
                            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition"
                        >
                            重置筛选
                        </button>
                        <button
                            onClick={handleSearch}
                            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition"
                        >
                            应用筛选
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}