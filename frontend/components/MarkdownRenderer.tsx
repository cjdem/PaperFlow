'use client';

import React, { useState, useCallback, ComponentPropsWithoutRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import 'katex/dist/katex.min.css';
import 'highlight.js/styles/github-dark.css';

// 复制按钮组件
const CopyButton = ({ text }: { text: string }) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('复制失败:', err);
        }
    }, [text]);

    return (
        <button
            onClick={handleCopy}
            className={`absolute top-3 right-3 px-2 py-1 rounded text-xs font-medium transition-all duration-200 ${copied
                    ? 'bg-green-600 text-white'
                    : 'bg-slate-600 text-gray-300 hover:bg-slate-500 hover:text-white'
                }`}
            title={copied ? '已复制！' : '复制代码'}
        >
            {copied ? '✓ 已复制' : '📋 复制'}
        </button>
    );
};

// 自定义代码块组件
const CodeBlock = ({ children, className, ...props }: ComponentPropsWithoutRef<'code'>) => {
    const match = /language-(\w+)/.exec(className || '');
    const language = match ? match[1] : '';
    const isInline = !className;

    if (isInline) {
        return (
            <code className="inline-code" {...props}>
                {children}
            </code>
        );
    }

    const codeString = String(children).replace(/\n$/, '');

    return (
        <div className="code-block-wrapper">
            {language && (
                <div className="code-language-tag">{language.toUpperCase()}</div>
            )}
            <CopyButton text={codeString} />
            <code className={className} {...props}>
                {children}
            </code>
        </div>
    );
};

// 自定义 pre 组件
const PreBlock = ({ children, ...props }: ComponentPropsWithoutRef<'pre'>) => {
    return (
        <pre className="code-block" {...props}>
            {children}
        </pre>
    );
};

// 表格容器组件
const TableWrapper = ({ children, ...props }: ComponentPropsWithoutRef<'table'>) => {
    return (
        <div className="table-wrapper">
            <table {...props}>{children}</table>
        </div>
    );
};

// 主组件
interface MarkdownRendererProps {
    content: string;
    className?: string;
}

export default function MarkdownRenderer({ content, className = '' }: MarkdownRendererProps) {
    return (
        <div className={`markdown-content ${className}`}>
            <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[rehypeKatex, rehypeHighlight]}
                components={{
                    code: CodeBlock,
                    pre: PreBlock,
                    table: TableWrapper,
                }}
            >
                {content}
            </ReactMarkdown>
        </div>
    );
}
