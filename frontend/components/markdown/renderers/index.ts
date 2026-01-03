/**
 * 渲染器注册表
 */

export { CodeRenderer } from './CodeRenderer';
export { HighlightRenderer } from './HighlightRenderer';
export { MathRenderer } from './MathRenderer';
export { MermaidRenderer } from './MermaidRenderer';

// 导入所有渲染器
import { CodeRenderer } from './CodeRenderer';
import { HighlightRenderer } from './HighlightRenderer';
import { MathRenderer } from './MathRenderer';
import { MermaidRenderer } from './MermaidRenderer';
import { IRenderer } from '../types';

/**
 * 获取所有默认渲染器
 */
export function getDefaultRenderers(): IRenderer[] {
  return [
    CodeRenderer,
    HighlightRenderer,
    MathRenderer,
    MermaidRenderer,
  ].sort((a, b) => a.priority - b.priority);
}

/**
 * 根据功能配置获取渲染器
 */
export function getRenderersByFeatures(features: {
  highlight?: boolean;
  math?: boolean;
  diagram?: boolean;
  copyButton?: boolean;
}): IRenderer[] {
  const renderers: IRenderer[] = [];

  // 代码块渲染器（复制按钮、语言标签）
  if (features.copyButton !== false) {
    renderers.push(CodeRenderer);
  }

  // 代码高亮
  if (features.highlight !== false) {
    renderers.push(HighlightRenderer);
  }

  // 数学公式
  if (features.math !== false) {
    renderers.push(MathRenderer);
  }

  // 图表（Mermaid）
  if (features.diagram !== false) {
    renderers.push(MermaidRenderer);
  }

  return renderers.sort((a, b) => a.priority - b.priority);
}