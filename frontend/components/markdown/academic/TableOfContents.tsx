'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { TocItem } from '../types';

interface TableOfContentsProps {
  contentRef: React.RefObject<HTMLElement | null>;
  className?: string;
  onItemClick?: (item: TocItem) => void;
}

/**
 * 目录大纲组件
 */
export function TableOfContents({
  contentRef,
  className = '',
  onItemClick,
}: TableOfContentsProps) {
  const [tocItems, setTocItems] = useState<TocItem[]>([]);
  const [activeId, setActiveId] = useState<string>('');
  const observerRef = useRef<IntersectionObserver | null>(null);

  // 生成目录
  const generateToc = useCallback(() => {
    if (!contentRef.current) return;

    const headings = contentRef.current.querySelectorAll('h1, h2, h3, h4, h5, h6');
    const items: TocItem[] = [];

    headings.forEach((heading, index) => {
      const el = heading as HTMLElement;
      
      // 确保有 ID
      if (!el.id) {
        el.id = `heading-${index}`;
      }

      const level = parseInt(el.tagName.charAt(1), 10);
      const text = el.textContent || '';

      items.push({
        id: el.id,
        text,
        level,
      });
    });

    setTocItems(items);
  }, [contentRef]);

  // 监听滚动，高亮当前位置
  useEffect(() => {
    if (!contentRef.current || tocItems.length === 0) return;

    // 清理旧的 observer
    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    const headingElements = tocItems.map(item => 
      document.getElementById(item.id)
    ).filter(Boolean) as HTMLElement[];

    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        });
      },
      {
        rootMargin: '-80px 0px -80% 0px',
        threshold: 0,
      }
    );

    headingElements.forEach((el) => {
      observerRef.current?.observe(el);
    });

    return () => {
      observerRef.current?.disconnect();
    };
  }, [tocItems, contentRef]);

  // 初始化和内容变化时重新生成目录
  useEffect(() => {
    generateToc();

    // 监听内容变化
    if (contentRef.current) {
      const observer = new MutationObserver(() => {
        generateToc();
      });

      observer.observe(contentRef.current, {
        childList: true,
        subtree: true,
      });

      return () => observer.disconnect();
    }
  }, [generateToc, contentRef]);

  // 点击跳转
  const handleClick = (item: TocItem) => {
    const element = document.getElementById(item.id);
    if (element) {
      element.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
      setActiveId(item.id);
      onItemClick?.(item);
    }
  };

  if (tocItems.length === 0) {
    return null;
  }

  return (
    <nav className={`toc-container ${className}`}>
      <div className="toc-header">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
        <span>目录</span>
      </div>
      <ul className="toc-list">
        {tocItems.map((item) => (
          <li
            key={item.id}
            className={`toc-item ${activeId === item.id ? 'active' : ''}`}
            data-level={item.level}
            style={{ paddingLeft: `${(item.level - 1) * 12 + 12}px` }}
          >
            <button
              onClick={() => handleClick(item)}
              className="toc-link"
              title={item.text}
            >
              <span className="toc-indicator" />
              <span className="toc-text">{item.text}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export default TableOfContents;