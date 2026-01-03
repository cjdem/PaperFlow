/**
 * 数学公式渲染器
 * 支持 KaTeX 和 MathJax 两种引擎
 */

import { IRenderer, RenderOptions } from '../types';
import { loadScript, loadStyle, normalizeWhitespace } from '../useRenderPipeline';

// KaTeX 类型声明
declare global {
  interface Window {
    katex: {
      renderToString: (
        math: string,
        options: {
          displayMode: boolean;
          output: string;
          macros?: Record<string, string>;
          throwOnError?: boolean;
        }
      ) => string;
    };
    MathJax: {
      startup: {
        promise: Promise<void>;
        document: {
          clear: () => void;
          updateDocument: () => void;
        };
      };
      tex2svgPromise: (
        math: string,
        options: { display: boolean }
      ) => Promise<Element>;
      getMetricsFor: (element: Element) => { display: boolean };
    };
  }
}

export const MathRenderer: IRenderer = {
  name: 'math',
  priority: 30,

  shouldRender(element: HTMLElement): boolean {
    // 检查是否有数学公式元素
    const mathElements = element.querySelectorAll(
      '.language-math, .math-inline, .math-display, [data-math]'
    );
    // 也检查 KaTeX 的标记
    const katexElements = element.querySelectorAll('.katex, .katex-display');
    return mathElements.length > 0 || katexElements.length > 0;
  },

  async render(element: HTMLElement, options: RenderOptions): Promise<void> {
    const { cdn, math: mathOptions } = options;

    if (mathOptions.engine === 'katex') {
      await renderWithKaTeX(element, cdn, mathOptions.macros || {});
    } else {
      await renderWithMathJax(element, cdn, mathOptions.macros || {});
    }
  },
};

// KaTeX CDN
const KATEX_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9';

/**
 * 使用 KaTeX 渲染
 */
async function renderWithKaTeX(
  element: HTMLElement,
  _cdn: string,
  macros: Record<string, string>
): Promise<void> {
  // 加载 KaTeX 样式
  await loadStyle(`${KATEX_CDN}/katex.min.css`, 'academicKatexStyle');

  // 加载 KaTeX 脚本
  await loadScript(`${KATEX_CDN}/katex.min.js`, 'academicKatexScript');

  // 加载化学公式扩展
  await loadScript(`${KATEX_CDN}/contrib/mhchem.min.js`, 'academicKatexChemScript');

  // 查找所有数学公式元素 - 包括新的 div.math-display 结构
  const mathElements = element.querySelectorAll('.language-math, .math-inline, .math-display');

  mathElements.forEach((mathElement) => {
    const el = mathElement as HTMLElement;

    // 已渲染过的跳过
    if (el.getAttribute('data-math-rendered')) {
      return;
    }

    // 获取公式内容
    let math = el.getAttribute('data-math') || el.textContent || '';
    math = normalizeWhitespace(math).trim();

    if (!math) return;

    // 判断是否为块级公式
    const isBlock =
      el.tagName === 'DIV' ||
      el.classList.contains('math-display') ||
      el.classList.contains('language-math');

    try {
      const html = window.katex.renderToString(math, {
        displayMode: isBlock,
        output: 'html',
        macros,
        throwOnError: false,
      });

      el.innerHTML = html;
      el.setAttribute('data-math', math);
      el.setAttribute('data-math-rendered', 'true');
      el.classList.add('math-rendered');

      // 添加复制功能
      el.addEventListener('copy', (event: ClipboardEvent) => {
        event.stopPropagation();
        event.preventDefault();
        const mathContent = el.getAttribute('data-math') || '';
        event.clipboardData?.setData('text/plain', mathContent);
        event.clipboardData?.setData('text/html', el.innerHTML);
      });
    } catch (error) {
      console.error('KaTeX render error:', error);
      el.innerHTML = `<span class="math-error">${(error as Error).message}</span>`;
      el.classList.add('math-error-container');
    }
  });
}

// MathJax CDN
const MATHJAX_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/mathjax/3.2.2';

/**
 * 使用 MathJax 渲染
 */
async function renderWithMathJax(
  element: HTMLElement,
  _cdn: string,
  macros: Record<string, string>
): Promise<void> {
  // 初始化 MathJax 配置
  if (!window.MathJax) {
    window.MathJax = {
      loader: {
        paths: { mathjax: MATHJAX_CDN },
      },
      startup: {
        typeset: false,
      },
      tex: {
        macros,
      },
    } as unknown as typeof window.MathJax;
  }

  // 加载 MathJax
  await loadScript(`${MATHJAX_CDN}/es5/tex-svg-full.js`, 'academicMathJaxScript');

  // 等待 MathJax 初始化
  await window.MathJax.startup.promise;

  // 查找所有数学公式元素
  const mathElements = element.querySelectorAll('.language-math, .math-inline, .math-display');

  for (const mathElement of Array.from(mathElements)) {
    const el = mathElement as HTMLElement;

    // 已渲染过的跳过
    if (el.getAttribute('data-math-rendered')) {
      continue;
    }

    // 获取公式内容
    let math = el.getAttribute('data-math') || el.textContent || '';
    math = normalizeWhitespace(math).trim();

    if (!math) continue;

    // 判断是否为块级公式
    const isBlock =
      el.tagName === 'DIV' ||
      el.classList.contains('math-display') ||
      el.classList.contains('language-math');

    try {
      const mathOptions = window.MathJax.getMetricsFor(el);
      mathOptions.display = isBlock;

      const node = await window.MathJax.tex2svgPromise(math, mathOptions);

      el.innerHTML = '';
      el.setAttribute('data-math', math);
      el.setAttribute('data-math-rendered', 'true');
      el.appendChild(node);
      el.classList.add('math-rendered');

      window.MathJax.startup.document.clear();
      window.MathJax.startup.document.updateDocument();

      // 检查错误
      const errorElement = node.querySelector('[data-mml-node="merror"]');
      if (errorElement && errorElement.textContent?.trim()) {
        el.innerHTML = `<span class="math-error">${errorElement.textContent.trim()}</span>`;
        el.classList.add('math-error-container');
      }
    } catch (error) {
      console.error('MathJax render error:', error);
      el.innerHTML = `<span class="math-error">${(error as Error).message}</span>`;
      el.classList.add('math-error-container');
    }
  }
}

export default MathRenderer;