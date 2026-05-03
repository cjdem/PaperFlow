'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  getPaperNotes, createPaperNote, updatePaperNote, deletePaperNote,
  PaperNote
} from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Plus, Trash2, Edit3, Check, X, StickyNote } from 'lucide-react';

interface NotesPanelProps {
  paperId: number;
}

export default function NotesPanel({ paperId }: NotesPanelProps) {
  const [notes, setNotes] = useState<PaperNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [newContent, setNewContent] = useState('');
  const [newHighlight, setNewHighlight] = useState('');
  const [newPage, setNewPage] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState('');

  const loadNotes = useCallback(async () => {
    try {
      const data = await getPaperNotes(paperId);
      setNotes(data);
    } catch {
      toast.error('加载笔记失败');
    } finally {
      setLoading(false);
    }
  }, [paperId]);

  useEffect(() => { loadNotes(); }, [loadNotes]);

  const handleCreate = async () => {
    if (!newContent.trim()) return;
    try {
      const note = await createPaperNote(paperId, {
        content: newContent.trim(),
        highlight_text: newHighlight.trim() || undefined,
        page_number: newPage ? parseInt(newPage) : undefined,
      });
      setNotes([note, ...notes]);
      setNewContent('');
      setNewHighlight('');
      setNewPage('');
      toast.success('笔记已添加');
    } catch {
      toast.error('添加笔记失败');
    }
  };

  const handleUpdate = async (noteId: number) => {
    if (!editContent.trim()) return;
    try {
      const updated = await updatePaperNote(paperId, noteId, { content: editContent.trim() });
      setNotes(notes.map(n => n.id === noteId ? updated : n));
      setEditingId(null);
      toast.success('笔记已更新');
    } catch {
      toast.error('更新笔记失败');
    }
  };

  const handleDelete = async (noteId: number) => {
    try {
      await deletePaperNote(paperId, noteId);
      setNotes(notes.filter(n => n.id !== noteId));
      toast.success('笔记已删除');
    } catch {
      toast.error('删除笔记失败');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-3">
        <StickyNote className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold">笔记与批注</h3>
      </div>

      <div className="space-y-2">
        <Input
          placeholder="写笔记..."
          value={newContent}
          onChange={e => setNewContent(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleCreate()}
        />
        <div className="flex gap-2">
          <Input
            placeholder="高亮文本（可选）"
            value={newHighlight}
            onChange={e => setNewHighlight(e.target.value)}
            className="flex-1 text-xs"
          />
          <Input
            placeholder="页码"
            value={newPage}
            onChange={e => setNewPage(e.target.value)}
            className="w-20 text-xs"
            type="number"
          />
          <Button size="sm" onClick={handleCreate} disabled={!newContent.trim()}>
            <Plus className="w-3 h-3" />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="text-xs text-muted-foreground">加载中...</div>
      ) : notes.length === 0 ? (
        <div className="text-xs text-muted-foreground">暂无笔记</div>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {notes.map(note => (
            <div key={note.id} className="p-2 rounded-md bg-muted/50 text-sm border border-border/50">
              {note.highlight_text && (
                <div className="text-xs text-primary/80 italic mb-1 border-l-2 border-primary/30 pl-2">
                  &ldquo;{note.highlight_text}&rdquo;
                  {note.page_number && <span className="text-muted-foreground ml-1">(p.{note.page_number})</span>}
                </div>
              )}
              {editingId === note.id ? (
                <div className="flex gap-1">
                  <Input
                    value={editContent}
                    onChange={e => setEditContent(e.target.value)}
                    className="flex-1 text-xs h-7"
                    onKeyDown={e => e.key === 'Enter' && handleUpdate(note.id)}
                  />
                  <Button size="sm" variant="ghost" onClick={() => handleUpdate(note.id)}>
                    <Check className="w-3 h-3" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs whitespace-pre-wrap flex-1">{note.content}</p>
                  <div className="flex gap-0.5 shrink-0">
                    <Button
                      size="sm" variant="ghost" className="h-5 w-5 p-0"
                      onClick={() => { setEditingId(note.id); setEditContent(note.content); }}
                    >
                      <Edit3 className="w-3 h-3" />
                    </Button>
                    <Button
                      size="sm" variant="ghost" className="h-5 w-5 p-0 text-destructive"
                      onClick={() => handleDelete(note.id)}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              )}
              {!note.highlight_text && note.page_number && (
                <div className="text-xs text-muted-foreground mt-1">p.{note.page_number}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
