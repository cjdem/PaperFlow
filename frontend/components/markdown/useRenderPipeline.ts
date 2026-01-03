'use client';

import { useCallback, useRef } from 'react';
import { IRenderer, RenderOptions } from './types';

interface UseRenderPipelineOptions {
  renderers: IRenderer[];
  options: RenderOptions;
  onRenderStart?: () => void;
  onRenderComplete?: () => void;
  onRenderError?: (error: Error, rendererName: string) => void;
}

interface RenderPipelineResult {
  execute: (element: HTMLElement) => Promise<void>;
  isRendering: boolean;
  cancel: () => void;
}

/**
 * 渲染管道 Hook
 * 按优先级顺序执行所有渲染器
 */
export function useRenderPipeline({
  renderers,
  options,
  onRenderStart,
  onRenderComplete,
  onRenderError,
}: UseRenderPipelineOptions): RenderPipelineResult {
  const isRenderingRef = useRef(false);
  const cancelledRef = useRef(false);

  const execute = useCallback(async (element: HTMLElement) => {
    if (isRenderingRef.current) {
      console.warn('Render pipeline is already running');
      return;
    }

    isRenderingRef.current = true;
    cancelledRef.current = false;
    onRenderStart?.();

    try {
      // 按优先级顺序执行渲染器
      for (const renderer of renderers) {
        if (cancelledRef.current) {
          console.log('Render pipeline cancelled');
          break;
        }

        try {
          // 检查是否需要渲染
          if (renderer.shouldRender(element)) {
            await renderer.render(element, options);
          }
        } catch (error) {
          console.error(`Renderer "${renderer.name}" failed:`, error);
          onRenderError?.(error as Error, renderer.name);
          // 继续执行其他渲染器
        }
      }

      if (!cancelledRef.current) {
        onRenderComplete?.();
      }
    } finally {
      isRenderingRef.current = false;
    }
  }, [renderers, options, onRenderStart, onRenderComplete, onRenderError]);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
  }, []);

  return {
    execute,
    isRendering: isRenderingRef.current,
    cancel,
  };
}

/**
 * 动态加载脚本
 */
export function loadScript(src: string, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // 检查是否已加载
    if (document.getElementById(id)) {
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.id = id;
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.head.appendChild(script);
  });
}

/**
 * 动态加载样式
 */
export function loadStyle(href: string, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // 检查是否已加载
    const existing = document.getElementById(id) as HTMLLinkElement;
    if (existing) {
      // 如果 href 不同，更新它
      if (existing.href !== href) {
        existing.href = href;
      }
      resolve();
      return;
    }

    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = href;
    link.onload = () => resolve();
    link.onerror = () => reject(new Error(`Failed to load style: ${href}`));
    document.head.appendChild(link);
  });
}

/**
 * 防抖函数
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      func(...args);
    }, wait);
  };
}

/**
 * 将特殊字符转换为普通空格
 */
export function normalizeWhitespace(text: string): string {
  return text.replace(/\u00A0/g, ' ');
}