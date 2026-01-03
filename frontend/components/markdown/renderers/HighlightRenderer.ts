/**
 * 代码高亮渲染器
 * 使用 highlight.js 进行语法高亮
 */

import { IRenderer, RenderOptions } from '../types';
import { loadScript, loadStyle, normalizeWhitespace } from '../useRenderPipeline';

// highlight.js 类型声明
declare global {
  interface Window {
    hljs: {
      highlight: (code: string, options: { language: string; ignoreIllegals?: boolean }) => { value: string };
      getLanguage: (name: string) => unknown;
      highlightElement: (element: HTMLElement) => void;
      highlightAll: () => void;
    };
  }
}

// CDN 配置
const HLJS_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0';

export const HighlightRenderer: IRenderer = {
  name: 'highlight',
  priority: 20,

  shouldRender(element: HTMLElement): boolean {
    const codeBlocks = element.querySelectorAll('pre > code');
    return codeBlocks.length > 0;
  },

  async render(element: HTMLElement, options: RenderOptions): Promise<void> {
    const { code: codeOptions } = options;
    
    // 使用 cdnjs 的 highlight.js
    await loadStyle(
      `${HLJS_CDN}/styles/${codeOptions.theme}.min.css`,
      'academicHljsStyle'
    );

    // 加载 highlight.js 核心
    await loadScript(
      `${HLJS_CDN}/highlight.min.js`,
      'academicHljsScript'
    );

    // 获取所有代码块
    const codeBlocks = element.querySelectorAll('pre > code');
    
    codeBlocks.forEach((block) => {
      const codeElement = block as HTMLElement;
      const preElement = codeElement.parentElement;
      
      if (!preElement) return;

      // 跳过特殊语言（图表等）
      const specialLanguages = [
        'language-mermaid',
        'language-flowchart',
        'language-echarts',
        'language-math',
        'language-plantuml',
        'language-graphviz',
      ];
      
      if (specialLanguages.some(lang => codeElement.classList.contains(lang))) {
        return;
      }

      // 已经高亮过的跳过
      if (codeElement.classList.contains('hljs')) {
        return;
      }

      // 获取语言
      let language = '';
      const classMatch = codeElement.className.match(/language-(\w+)/);
      if (classMatch) {
        language = classMatch[1];
      } else if (codeOptions.defaultLanguage) {
        language = codeOptions.defaultLanguage;
        codeElement.classList.add(`language-${language}`);
      }

      // 检查语言是否支持
      if (language && !window.hljs.getLanguage(language)) {
        language = 'plaintext';
      }

      // 执行高亮
      if (language) {
        const code = normalizeWhitespace(codeElement.textContent || '');
        const result = window.hljs.highlight(code, {
          language,
          ignoreIllegals: true,
        });
        codeElement.innerHTML = result.value;
      }

      codeElement.classList.add('hljs');

      // 添加行号
      if (codeOptions.lineNumbers) {
        addLineNumbers(codeElement);
      }
    });
  },
};

/**
 * 添加行号
 */
function addLineNumbers(codeElement: HTMLElement): void {
  if (codeElement.classList.contains('has-line-numbers')) {
    return;
  }

  const code = codeElement.textContent || '';
  const lines = code.split('\n');
  
  // 移除最后一个空行
  if (lines[lines.length - 1] === '') {
    lines.pop();
  }

  const lineNumbersHtml = lines
    .map((_, index) => `<span class="line-number">${index + 1}</span>`)
    .join('');

  const lineNumbersWrapper = document.createElement('span');
  lineNumbersWrapper.className = 'line-numbers-rows';
  lineNumbersWrapper.innerHTML = lineNumbersHtml;

  codeElement.appendChild(lineNumbersWrapper);
  codeElement.classList.add('has-line-numbers');
}

export default HighlightRenderer;