/**
 * Markdown 渲染器类型定义
 */

// 渲染器接口
export interface IRenderer {
  name: string;
  priority: number;  // 执行优先级，数字越小越先执行
  
  // 检查是否需要渲染
  shouldRender: (element: HTMLElement) => boolean;
  
  // 执行渲染
  render: (element: HTMLElement, options: RenderOptions) => Promise<void>;
  
  // 清理资源
  cleanup?: () => void;
}

// 数学公式配置
export interface MathOptions {
  engine: 'katex' | 'mathjax';
  macros?: Record<string, string>;
  inlineDigit?: boolean;
}

// 代码高亮配置
export interface CodeOptions {
  theme: string;
  lineNumbers: boolean;
  copyButton: boolean;
  defaultLanguage?: string;
}

// 图表配置
export interface DiagramOptions {
  mermaid: boolean;
  flowchart: boolean;
  echarts: boolean;
  theme: 'light' | 'dark';
}

// 渲染选项
export interface RenderOptions {
  cdn: string;
  theme: 'light' | 'dark';
  lang: string;
  math: MathOptions;
  code: CodeOptions;
  diagram: DiagramOptions;
}

// 目录项
export interface TocItem {
  id: string;
  text: string;
  level: number;
  children?: TocItem[];
}

// 渲染上下文
export interface RenderContextValue {
  options: RenderOptions;
  setOptions: (options: Partial<RenderOptions>) => void;
  renderers: IRenderer[];
  registerRenderer: (renderer: IRenderer) => void;
  unregisterRenderer: (name: string) => void;
}

// 主组件 Props
export interface AcademicMarkdownRendererProps {
  // 内容
  content: string;
  
  // 主题
  theme?: 'light' | 'dark' | 'auto';
  codeTheme?: string;
  
  // 功能开关
  features?: {
    toc?: boolean;           // 目录
    math?: boolean;          // 数学公式
    diagram?: boolean;       // 图表
    highlight?: boolean;     // 代码高亮
    lineNumbers?: boolean;   // 行号
    copyButton?: boolean;    // 复制按钮
    imagePreview?: boolean;  // 图片预览
    citation?: boolean;      // 引用
    footnote?: boolean;      // 脚注
  };
  
  // 数学公式配置
  math?: Partial<MathOptions>;
  
  // 图表配置
  diagram?: Partial<DiagramOptions>;
  
  // 回调
  onTocGenerated?: (toc: TocItem[]) => void;
  onRendered?: () => void;
  
  // 样式
  className?: string;
  maxWidth?: number;
  
  // 显示目录
  showToc?: boolean;
  tocPosition?: 'left' | 'right';
}

// 默认配置
export const defaultRenderOptions: RenderOptions = {
  cdn: 'https://unpkg.com/vditor@3.10.2',
  theme: 'dark',
  lang: 'zh_CN',
  math: {
    engine: 'katex',
    macros: {},
    inlineDigit: false,
  },
  code: {
    theme: 'github-dark',
    lineNumbers: true,
    copyButton: true,
    defaultLanguage: 'plaintext',
  },
  diagram: {
    mermaid: true,
    flowchart: false,
    echarts: false,
    theme: 'dark',
  },
};

// 默认功能配置
export const defaultFeatures = {
  toc: true,
  math: true,
  diagram: true,
  highlight: true,
  lineNumbers: true,
  copyButton: true,
  imagePreview: true,
  citation: false,
  footnote: true,
};