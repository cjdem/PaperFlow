'use client';

import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { 
  RenderContextValue, 
  RenderOptions, 
  IRenderer, 
  defaultRenderOptions 
} from './types';

// 创建上下文
const RenderContext = createContext<RenderContextValue | null>(null);

// Provider Props
interface RenderProviderProps {
  children: React.ReactNode;
  initialOptions?: Partial<RenderOptions>;
}

// Provider 组件
export function RenderProvider({ children, initialOptions }: RenderProviderProps) {
  const [options, setOptionsState] = useState<RenderOptions>(() => ({
    ...defaultRenderOptions,
    ...initialOptions,
    math: { ...defaultRenderOptions.math, ...initialOptions?.math },
    code: { ...defaultRenderOptions.code, ...initialOptions?.code },
    diagram: { ...defaultRenderOptions.diagram, ...initialOptions?.diagram },
  }));
  
  const [renderers, setRenderers] = useState<IRenderer[]>([]);

  // 更新选项
  const setOptions = useCallback((newOptions: Partial<RenderOptions>) => {
    setOptionsState(prev => ({
      ...prev,
      ...newOptions,
      math: { ...prev.math, ...newOptions.math },
      code: { ...prev.code, ...newOptions.code },
      diagram: { ...prev.diagram, ...newOptions.diagram },
    }));
  }, []);

  // 注册渲染器
  const registerRenderer = useCallback((renderer: IRenderer) => {
    setRenderers(prev => {
      // 检查是否已存在
      const exists = prev.some(r => r.name === renderer.name);
      if (exists) {
        console.warn(`Renderer "${renderer.name}" already registered, skipping.`);
        return prev;
      }
      // 按优先级排序插入
      const newRenderers = [...prev, renderer].sort((a, b) => a.priority - b.priority);
      return newRenderers;
    });
  }, []);

  // 注销渲染器
  const unregisterRenderer = useCallback((name: string) => {
    setRenderers(prev => {
      const renderer = prev.find(r => r.name === name);
      if (renderer?.cleanup) {
        renderer.cleanup();
      }
      return prev.filter(r => r.name !== name);
    });
  }, []);

  // 上下文值
  const contextValue = useMemo<RenderContextValue>(() => ({
    options,
    setOptions,
    renderers,
    registerRenderer,
    unregisterRenderer,
  }), [options, setOptions, renderers, registerRenderer, unregisterRenderer]);

  return (
    <RenderContext.Provider value={contextValue}>
      {children}
    </RenderContext.Provider>
  );
}

// Hook: 使用渲染上下文
export function useRenderContext(): RenderContextValue {
  const context = useContext(RenderContext);
  if (!context) {
    throw new Error('useRenderContext must be used within a RenderProvider');
  }
  return context;
}

// Hook: 使用渲染选项
export function useRenderOptions(): RenderOptions {
  const { options } = useRenderContext();
  return options;
}

// Hook: 使用渲染器
export function useRenderers(): IRenderer[] {
  const { renderers } = useRenderContext();
  return renderers;
}