'use client';

import { useState } from 'react';
import { importPaper, ImportResult } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Download, Loader2 } from 'lucide-react';

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export default function ImportDialog({ open, onOpenChange, onSuccess }: ImportDialogProps) {
  const [importType, setImportType] = useState<'doi' | 'arxiv' | 'bibtex'>('doi');
  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const handleImport = async () => {
    if (!value.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await importPaper(importType, value.trim());
      setResult(res);
      if (res.success) {
        toast.success(`导入成功: ${res.title}`);
        onSuccess?.();
      }
    } catch {
      toast.error('导入失败');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setValue('');
    setResult(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="w-4 h-4" /> 智能导入论文
          </DialogTitle>
          <DialogDescription>
            通过 DOI、arXiv ID 或 BibTeX 直接导入论文元数据
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex gap-2">
            {(['doi', 'arxiv', 'bibtex'] as const).map(t => (
              <Button
                key={t}
                size="sm"
                variant={importType === t ? 'default' : 'outline'}
                onClick={() => { setImportType(t); setValue(''); setResult(null); }}
                className="text-xs uppercase"
              >
                {t === 'bibtex' ? 'BibTeX' : t}
              </Button>
            ))}
          </div>

          {importType === 'bibtex' ? (
            <textarea
              placeholder="@article{key, title={...}, author={...}, ...}"
              value={value}
              onChange={e => setValue(e.target.value)}
              className="w-full h-32 rounded-md border bg-background px-3 py-2 text-xs font-mono resize-none"
            />
          ) : (
            <Input
              placeholder={
                importType === 'doi'
                  ? '10.1000/xyz123'
                  : '2305.12345 或 https://arxiv.org/abs/2305.12345'
              }
              value={value}
              onChange={e => setValue(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleImport()}
            />
          )}

          {result && (
            <div className={`text-xs p-2 rounded ${result.success ? 'bg-green-500/10 text-green-700' : 'bg-destructive/10 text-destructive'}`}>
              {result.success
                ? `已导入: ${result.title} (ID: ${result.paper_id})`
                : result.error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>关闭</Button>
          <Button onClick={handleImport} disabled={loading || !value.trim()}>
            {loading && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
            导入
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
