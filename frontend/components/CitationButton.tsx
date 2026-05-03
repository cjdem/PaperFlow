'use client';

import { useState } from 'react';
import { getCitation, CitationResult } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Quote, Copy, Check } from 'lucide-react';

interface CitationButtonProps {
  paperId: number;
}

const STYLES = [
  { value: 'apa' as const, label: 'APA' },
  { value: 'mla' as const, label: 'MLA' },
  { value: 'chicago' as const, label: 'Chicago' },
  { value: 'gbt7714' as const, label: 'GB/T 7714' },
];

export default function CitationButton({ paperId }: CitationButtonProps) {
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState<'apa' | 'mla' | 'chicago' | 'gbt7714'>('gbt7714');
  const [citation, setCitation] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleGenerate = async (s: typeof style) => {
    setStyle(s);
    setLoading(true);
    try {
      const result: CitationResult = await getCitation(paperId, s);
      if (result.citations.length > 0) {
        setCitation(result.citations[0]);
      }
    } catch {
      toast.error('生成引用失败');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(citation);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative">
      <Button
        size="sm" variant="ghost"
        onClick={() => { setOpen(!open); if (!open && !citation) handleGenerate(style); }}
        className="h-7 text-xs gap-1"
      >
        <Quote className="w-3 h-3" />
      </Button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-popover border rounded-md shadow-lg p-3 w-80">
          <div className="flex items-center gap-1 mb-2">
            <Quote className="w-3 h-3 text-primary" />
            <span className="text-xs font-semibold">引用格式</span>
          </div>
          <div className="flex gap-1 mb-2">
            {STYLES.map(s => (
              <Button
                key={s.value}
                size="sm"
                variant={style === s.value ? 'default' : 'outline'}
                onClick={() => handleGenerate(s.value)}
                disabled={loading}
                className="h-6 text-xs px-2"
              >
                {s.label}
              </Button>
            ))}
          </div>
          {loading ? (
            <div className="text-xs text-muted-foreground">生成中...</div>
          ) : citation ? (
            <div className="flex items-start gap-2">
              <p className="text-xs flex-1 leading-relaxed bg-muted/50 p-2 rounded">{citation}</p>
              <Button size="sm" variant="ghost" onClick={handleCopy} className="h-6 w-6 p-0 shrink-0">
                {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
