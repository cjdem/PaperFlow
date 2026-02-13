/**
 * 代码块渲染器
 * 添加复制按钮、语言标签等功能
 */

import { IRenderer, RenderOptions } from '../types';
import { normalizeWhitespace } from '../useRenderPipeline';

export const CodeRenderer: IRenderer = {
  name: 'code',
  priority: 10, // 在高亮之前执行

  shouldRender(element: HTMLElement): boolean {
    const codeBlocks = element.querySelectorAll('pre > code');
    return codeBlocks.length > 0;
  },

  async render(element: HTMLElement, options: RenderOptions): Promise<void> {
    const { code: codeOptions } = options;
    const codeBlocks = element.querySelectorAll('pre > code');

    codeBlocks.forEach((block, index) => {
      const codeElement = block as HTMLElement;
      const preElement = codeElement.parentElement;

      if (!preElement) return;

      // 跳过已处理的
      if (preElement.classList.contains('code-block-enhanced')) {
        return;
      }

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

      // 获取语言
      let language = '';
      const classMatch = codeElement.className.match(/language-(\w+)/);
      if (classMatch) {
        language = classMatch[1];
      }

      // 创建包装容器
      const wrapper = document.createElement('div');
      wrapper.className = 'code-block-wrapper';

      // 添加语言标签
      if (language) {
        const languageTag = document.createElement('div');
        languageTag.className = 'code-language-tag';
        languageTag.textContent = language.toUpperCase();
        wrapper.appendChild(languageTag);
      }

      // 添加复制按钮
      if (codeOptions.copyButton) {
        const copyButton = createCopyButton(codeElement);
        wrapper.appendChild(copyButton);
      }

      // 包装 pre 元素
      preElement.parentNode?.insertBefore(wrapper, preElement);
      wrapper.appendChild(preElement);
      preElement.classList.add('code-block-enhanced');

      // 限制最大高度
      preElement.style.maxHeight = `${window.innerHeight - 100}px`;
    });
  },
};

/**
 * 创建复制按钮
 */
function createCopyButton(codeElement: HTMLElement): HTMLElement {
  const button = document.createElement('button');
  button.className = 'code-copy-btn';
  button.type = 'button';
  button.setAttribute('aria-label', '复制代码');
  button.innerHTML = `
    <svg class="copy-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
    </svg>
    <svg class="check-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display: none;">
      <polyline points="20 6 9 17 4 12"></polyline>
    </svg>
    <span class="copy-text">复制</span>
  `;

  button.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();

    const code = normalizeWhitespace(codeElement.textContent || '');
    
    try {
      await navigator.clipboard.writeText(code);
      
      // 显示成功状态
      button.classList.add('copied');
      const copyIcon = button.querySelector('.copy-icon') as HTMLElement;
      const checkIcon = button.querySelector('.check-icon') as HTMLElement;
      const copyText = button.querySelector('.copy-text') as HTMLElement;
      
      if (copyIcon) copyIcon.style.display = 'none';
      if (checkIcon) checkIcon.style.display = 'block';
      if (copyText) copyText.textContent = '已复制';

      // 2秒后恢复
      setTimeout(() => {
        button.classList.remove('copied');
        if (copyIcon) copyIcon.style.display = 'block';
        if (checkIcon) checkIcon.style.display = 'none';
        if (copyText) copyText.textContent = '复制';
      }, 2000);
    } catch (err) {
      console.error('复制失败:', err);
      
      // 降级方案：使用 textarea
      const textarea = document.createElement('textarea');
      textarea.value = code;
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
  });

  return button;
}

export default CodeRenderer;