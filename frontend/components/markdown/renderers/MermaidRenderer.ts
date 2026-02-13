/**
 * Mermaid 图表渲染器
 * 支持流程图、时序图、甘特图等
 */

import { IRenderer, RenderOptions } from '../types';
import { loadScript } from '../useRenderPipeline';

// Mermaid 类型声明
declare global {
  interface Window {
    mermaid: {
      initialize: (config: MermaidConfig) => void;
      render: (id: string, text: string) => Promise<{ svg: string }>;
    };
  }
}

interface MermaidConfig {
  startOnLoad: boolean;
  theme: string;
  securityLevel: string;
  fontFamily: string;
  flowchart?: {
    htmlLabels: boolean;
    useMaxWidth: boolean;
  };
  sequence?: {
    useMaxWidth: boolean;
    diagramMarginX: number;
    diagramMarginY: number;
    boxMargin: number;
    showSequenceNumbers: boolean;
  };
  gantt?: {
    leftPadding: number;
    rightPadding: number;
  };
}

// 生成唯一 ID
let mermaidIdCounter = 0;
function generateMermaidId(): string {
  return `mermaid-${Date.now()}-${++mermaidIdCounter}`;
}

export const MermaidRenderer: IRenderer = {
  name: 'mermaid',
  priority: 40,

  shouldRender(element: HTMLElement): boolean {
    const mermaidElements = element.querySelectorAll(
      '.language-mermaid, [data-language="mermaid"], pre > code.mermaid'
    );
    return mermaidElements.length > 0;
  },

  async render(element: HTMLElement, options: RenderOptions): Promise<void> {
    const { diagram: diagramOptions, theme } = options;

    if (!diagramOptions.mermaid) {
      return;
    }

    // 使用 cdnjs 的 Mermaid
    const MERMAID_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/mermaid/10.6.1';
    
    // 加载 Mermaid
    await loadScript(
      `${MERMAID_CDN}/mermaid.min.js`,
      'academicMermaidScript'
    );

    // 配置 Mermaid
    const config: MermaidConfig = {
      startOnLoad: false,
      theme: theme === 'dark' ? 'dark' : 'default',
      securityLevel: 'loose',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      flowchart: {
        htmlLabels: true,
        useMaxWidth: true,
      },
      sequence: {
        useMaxWidth: true,
        diagramMarginX: 8,
        diagramMarginY: 8,
        boxMargin: 8,
        showSequenceNumbers: true,
      },
      gantt: {
        leftPadding: 75,
        rightPadding: 20,
      },
    };

    window.mermaid.initialize(config);

    // 查找所有 Mermaid 元素
    const mermaidElements = element.querySelectorAll(
      '.language-mermaid, [data-language="mermaid"], pre > code.mermaid'
    );

    for (const mermaidElement of Array.from(mermaidElements)) {
      const el = mermaidElement as HTMLElement;

      // 已渲染过的跳过
      if (el.getAttribute('data-mermaid-rendered') === 'true') {
        continue;
      }

      // 获取图表代码
      const code = el.textContent?.trim() || '';
      if (!code) continue;

      try {
        const id = generateMermaidId();
        const { svg } = await window.mermaid.render(id, code);

        // 创建容器
        const container = document.createElement('div');
        container.className = 'mermaid-container';
        container.innerHTML = svg;

        // 添加工具栏
        const toolbar = createMermaidToolbar(code, svg);
        container.insertBefore(toolbar, container.firstChild);

        // 替换原元素
        const parent = el.parentElement;
        if (parent?.tagName === 'PRE') {
          parent.replaceWith(container);
        } else {
          el.innerHTML = '';
          el.appendChild(container);
        }

        el.setAttribute('data-mermaid-rendered', 'true');
      } catch (error) {
        console.error('Mermaid render error:', error);

        // 显示错误信息
        const errorContainer = document.createElement('div');
        errorContainer.className = 'mermaid-error';
        errorContainer.innerHTML = `
          <div class="mermaid-error-title">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            图表渲染失败
          </div>
          <div class="mermaid-error-message">${(error as Error).message}</div>
          <pre class="mermaid-error-code">${escapeHtml(code)}</pre>
        `;

        const parent = el.parentElement;
        if (parent?.tagName === 'PRE') {
          parent.replaceWith(errorContainer);
        } else {
          el.innerHTML = '';
          el.appendChild(errorContainer);
        }
      }
    }
  },
};

/**
 * 创建 Mermaid 工具栏
 */
function createMermaidToolbar(code: string, svg: string): HTMLElement {
  const toolbar = document.createElement('div');
  toolbar.className = 'mermaid-toolbar';

  // 复制代码按钮
  const copyCodeBtn = document.createElement('button');
  copyCodeBtn.className = 'mermaid-toolbar-btn';
  copyCodeBtn.setAttribute('aria-label', '复制代码');
  copyCodeBtn.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
    </svg>
    <span>复制代码</span>
  `;
  copyCodeBtn.addEventListener('click', () => copyToClipboard(code, copyCodeBtn));

  // 下载 SVG 按钮
  const downloadBtn = document.createElement('button');
  downloadBtn.className = 'mermaid-toolbar-btn';
  downloadBtn.setAttribute('aria-label', '下载 SVG');
  downloadBtn.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
      <polyline points="7 10 12 15 17 10"></polyline>
      <line x1="12" y1="15" x2="12" y2="3"></line>
    </svg>
    <span>下载 SVG</span>
  `;
  downloadBtn.addEventListener('click', () => downloadSvg(svg));

  toolbar.appendChild(copyCodeBtn);
  toolbar.appendChild(downloadBtn);

  return toolbar;
}

/**
 * 复制到剪贴板
 */
async function copyToClipboard(text: string, button: HTMLElement): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    const span = button.querySelector('span');
    if (span) {
      const originalText = span.textContent;
      span.textContent = '已复制';
      setTimeout(() => {
        span.textContent = originalText;
      }, 2000);
    }
  } catch (err) {
    console.error('复制失败:', err);
  }
}

/**
 * 下载 SVG
 */
function downloadSvg(svg: string): void {
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `diagram-${Date.now()}.svg`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * HTML 转义
 */
function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

export default MermaidRenderer;