'use client';

/**
 * 学术 Markdown 渲染器
 * 基于 Fluent 2 设计风格，支持代码高亮、数学公式
 */

import React, { useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import 'katex/dist/katex.min.css';
import 'highlight.js/styles/github-dark.css';
import { TableOfContents } from './academic/TableOfContents';
import './styles/academic-markdown.css';

interface AcademicMarkdownRendererProps {
  content: string;
  showToc?: boolean;
  className?: string;
  onRendered?: () => void;
}

export const AcademicMarkdownRenderer: React.FC<AcademicMarkdownRendererProps> = ({
  content,
  showToc = true,
  className = '',
  onRendered
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  
  // 渲染完成后的回调
  useEffect(() => {
    if (content) {
      // 延迟调用以确保渲染完成
      const timer = setTimeout(() => {
        onRendered?.();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [content, onRendered]);
  
  // 自定义组件
  const components = {
    // 代码块 - 由 rehype-highlight 处理高亮
    code: ({ node, inline, className, children, ...props }: any) => {
      const match = /language-(\w+)/.exec(className || '');
      const language = match ? match[1] : '';
      
      // 行内代码
      if (inline) {
        return (
          <code className={className} {...props}>
            {children}
          </code>
        );
      }
      
      // 普通代码块
      return (
        <code className={className || `language-${language}`} data-language={language} {...props}>
          {children}
        </code>
      );
    },
    
    // pre 元素 - 添加语言标识和复制按钮容器
    pre: ({ children, ...props }: any) => {
      // 获取子元素的语言
      let language = '';
      
      React.Children.forEach(children, (child: any) => {
        if (child && typeof child === 'object' && child.props) {
          const childClassName = String(child.props.className || '');
          const match = /language-(\w+)/.exec(childClassName);
          if (match) {
            language = match[1];
          }
        }
      });
      
      return (
        <pre className={`language-${language}`} data-language={language} {...props}>
          {children}
        </pre>
      );
    },
    
    // 表格增强
    table: ({ children, ...props }: any) => (
      <div className="table-wrapper" style={{ overflowX: 'auto' }}>
        <table {...props}>{children}</table>
      </div>
    ),
    
    // 图片增强
    img: ({ src, alt, ...props }: any) => (
      <figure className="image-figure">
        <img 
          src={src} 
          alt={alt} 
          loading="lazy"
          {...props}
        />
        {alt && <figcaption>{alt}</figcaption>}
      </figure>
    ),
    
    // 链接增强 - 外部链接新窗口打开
    a: ({ href, children, ...props }: any) => {
      const isExternal = href?.startsWith('http') || href?.startsWith('//');
      return (
        <a 
          href={href}
          target={isExternal ? '_blank' : undefined}
          rel={isExternal ? 'noopener noreferrer' : undefined}
          {...props}
        >
          {children}
          {isExternal && (
            <svg 
              className="external-link-icon" 
              width="12" 
              height="12" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2"
              style={{ marginLeft: '4px', verticalAlign: 'middle' }}
            >
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          )}
        </a>
      );
    }
  };
  
  return (
    <div className={`academic-markdown-wrapper ${className}`}>
      {/* 目录 - 使用 contentRef 自动生成 */}
      {showToc && (
        <TableOfContents contentRef={containerRef} />
      )}
      
      {/* 内容区域 */}
      <div
        ref={containerRef}
        className="academic-markdown academic-markdown-content rendered"
      >
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[rehypeKatex, rehypeHighlight]}
          components={components}
        >
          {content}
        </ReactMarkdown>
      </div>
    </div>
  );
};

export default AcademicMarkdownRenderer;