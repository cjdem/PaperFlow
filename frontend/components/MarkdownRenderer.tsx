'use client';

/**
 * Markdown 渲染器组件
 * 使用新的 AcademicMarkdownRenderer 实现
 * 保持向后兼容的 API
 */

import React from 'react';
import { AcademicMarkdownRenderer } from './markdown';

interface MarkdownRendererProps {
    content: string;
    className?: string;
    showToc?: boolean;
    onRendered?: () => void;
}

export default function MarkdownRenderer({
    content,
    className = '',
    showToc = false,
    onRendered
}: MarkdownRendererProps) {
    return (
        <AcademicMarkdownRenderer
            content={content}
            className={className}
            showToc={showToc}
            onRendered={onRendered}
        />
    );
}

// 导出新的渲染器供直接使用
export { AcademicMarkdownRenderer } from './markdown';
