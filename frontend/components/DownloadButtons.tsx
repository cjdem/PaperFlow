'use client';

import { useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface DownloadButtonsProps {
  paperId: number;
  paperTitle?: string;  // 论文标题，用于生成下载文件名
  hasOriginal: boolean;
  translationStatus?: string | null;
  compact?: boolean;
}

// 清理文件名，移除不合法字符
function sanitizeFilename(title: string): string {
  // 移除 Windows 和 Unix 不允许的文件名字符
  let sanitized = title.replace(/[<>:"/\\|?*\x00-\x1f]/g, '');
  // 移除首尾空格和点
  sanitized = sanitized.trim().replace(/^\.+|\.+$/g, '');
  // 如果为空，使用默认名称
  return sanitized || 'paper';
}

export default function DownloadButtons({
  paperId,
  paperTitle,
  hasOriginal,
  translationStatus,
  compact = false
}: DownloadButtonsProps) {
  const [downloading, setDownloading] = useState<string | null>(null);
  const isTranslated = translationStatus === 'completed';
  const baseClass = compact
    ? 'px-2 py-1 text-xs rounded'
    : 'px-3 py-1.5 text-sm rounded';

  // 生成下载文件名
  const getFilename = (fileType: 'original' | 'zh' | 'dual'): string => {
    const baseName = sanitizeFilename(paperTitle || `paper_${paperId}`);
    switch (fileType) {
      case 'original':
        return `${baseName}.pdf`;
      case 'zh':
        return `${baseName}_zh.pdf`;
      case 'dual':
        return `${baseName}_dual.pdf`;
    }
  };

  // 使用 fetch API 下载文件（携带认证 token）
  const handleDownload = async (fileType: 'original' | 'zh' | 'dual') => {
    const filename = getFilename(fileType);
    setDownloading(fileType);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(
        `${API_BASE}/api/translate/papers/${paperId}/download/${fileType}`,
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );
      
      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: '下载失败' }));
        alert(error.detail || '下载失败');
        return;
      }
      
      // 获取文件名（从 Content-Disposition header 或使用默认名）
      const contentDisposition = response.headers.get('Content-Disposition');
      let downloadFilename = filename;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename\*?=(?:UTF-8'')?([^;]+)/i);
        if (match) {
          downloadFilename = decodeURIComponent(match[1].replace(/['"]/g, ''));
        }
      }
      
      // 创建 Blob 并触发下载
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = downloadFilename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error('下载失败:', err);
      alert('下载失败，请重试');
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className={`flex ${compact ? 'gap-1' : 'gap-2'} flex-wrap`}>
      {/* 原始英文版 */}
      {hasOriginal && (
        <button
          onClick={() => handleDownload('original')}
          disabled={downloading === 'original'}
          className={`${baseClass} bg-gray-600 text-white hover:bg-gray-500 flex items-center gap-1 disabled:opacity-50 disabled:cursor-wait`}
          title={`下载英文原版 PDF: ${getFilename('original')}`}
        >
          {downloading === 'original' ? '⏳' : '📄'} {!compact && '英文原版'}
        </button>
      )}
      
      {/* 中文翻译版 */}
      {isTranslated ? (
        <button
          onClick={() => handleDownload('zh')}
          disabled={downloading === 'zh'}
          className={`${baseClass} bg-blue-600 text-white hover:bg-blue-500 flex items-center gap-1 disabled:opacity-50 disabled:cursor-wait`}
          title={`下载中文翻译版 PDF: ${getFilename('zh')}`}
        >
          {downloading === 'zh' ? '⏳' : '🇨🇳'} {!compact && '中文版'}
        </button>
      ) : (
        <span
          className={`${baseClass} bg-gray-700 text-gray-500 cursor-not-allowed flex items-center gap-1`}
          title="论文尚未翻译"
        >
          🇨🇳 {!compact && '中文版'}
        </span>
      )}
      
      {/* 双语对照版 */}
      {isTranslated ? (
        <button
          onClick={() => handleDownload('dual')}
          disabled={downloading === 'dual'}
          className={`${baseClass} bg-green-600 text-white hover:bg-green-500 flex items-center gap-1 disabled:opacity-50 disabled:cursor-wait`}
          title={`下载双语对照版 PDF: ${getFilename('dual')}`}
        >
          {downloading === 'dual' ? '⏳' : '📑'} {!compact && '双语对照'}
        </button>
      ) : (
        <span
          className={`${baseClass} bg-gray-700 text-gray-500 cursor-not-allowed flex items-center gap-1`}
          title="论文尚未翻译"
        >
          📑 {!compact && '双语对照'}
        </span>
      )}
    </div>
  );
}