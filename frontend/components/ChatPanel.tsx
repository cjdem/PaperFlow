'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  getChatHistory, clearChatHistory, chatWithPaper, ChatMessage
} from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Send, Trash2, MessageSquare, Loader2 } from 'lucide-react';

interface ChatPanelProps {
  paperId: number;
}

export default function ChatPanel({ paperId }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [streamContent, setStreamContent] = useState('');
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadHistory = useCallback(async () => {
    try {
      const data = await getChatHistory(paperId);
      setMessages(data);
    } catch {
      toast.error('加载对话历史失败');
    } finally {
      setLoading(false);
    }
  }, [paperId]);

  useEffect(() => { loadHistory(); }, [loadHistory]);
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamContent]);

  const handleSend = async () => {
    if (!question.trim() || streaming) return;
    const q = question.trim();
    setQuestion('');
    setStreaming(true);
    setStreamContent('');

    setMessages(prev => [...prev, {
      id: -Date.now(), role: 'user', content: q, created_at: new Date().toISOString()
    }]);

    try {
      const response = await chatWithPaper(paperId, q);
      if (!response.ok) throw new Error('请求失败');

      const reader = response.body?.getReader();
      if (!reader) throw new Error('无法读取流');

      const decoder = new TextDecoder();
      let buffer = '';
      let fullContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.error) {
                toast.error(data.error);
                break;
              }
              if (data.content) {
                fullContent += data.content;
                setStreamContent(fullContent);
              }
            } catch { }
          }
        }
      }

      if (fullContent) {
        setMessages(prev => [...prev, {
          id: Date.now(), role: 'assistant', content: fullContent,
          created_at: new Date().toISOString()
        }]);
      }
    } catch {
      toast.error('问答请求失败');
    } finally {
      setStreaming(false);
      setStreamContent('');
    }
  };

  const handleClear = async () => {
    try {
      await clearChatHistory(paperId);
      setMessages([]);
      toast.success('对话历史已清除');
    } catch {
      toast.error('清除失败');
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">AI 论文问答</h3>
        </div>
        {messages.length > 0 && (
          <Button size="sm" variant="ghost" onClick={handleClear} className="h-6 text-xs text-destructive">
            <Trash2 className="w-3 h-3 mr-1" /> 清除
          </Button>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 mb-3 min-h-0 max-h-72">
        {loading ? (
          <div className="text-xs text-muted-foreground text-center py-4">加载中...</div>
        ) : messages.length === 0 && !streaming ? (
          <div className="text-xs text-muted-foreground text-center py-4">
            针对论文内容提问，AI 将基于论文信息回答
          </div>
        ) : (
          messages.map((msg, i) => (
            <div key={msg.id || i} className={`text-xs ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
              <div className={`inline-block max-w-[85%] p-2 rounded-lg ${
                msg.role === 'user'
                  ? 'bg-primary/10 text-primary'
                  : 'bg-muted text-foreground'
              }`}>
                <p className="whitespace-pre-wrap">{msg.content}</p>
              </div>
            </div>
          ))
        )}
        {streaming && streamContent && (
          <div className="text-xs text-left">
            <div className="inline-block max-w-[85%] p-2 rounded-lg bg-muted text-foreground">
              <p className="whitespace-pre-wrap">{streamContent}</p>
            </div>
          </div>
        )}
        {streaming && !streamContent && (
          <div className="text-xs text-left">
            <div className="inline-block p-2 rounded-lg bg-muted">
              <Loader2 className="w-3 h-3 animate-spin" />
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-2 shrink-0">
        <Input
          placeholder="提问..."
          value={question}
          onChange={e => setQuestion(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
          disabled={streaming}
          className="text-xs h-8"
        />
        <Button size="sm" onClick={handleSend} disabled={streaming || !question.trim()} className="h-8">
          <Send className="w-3 h-3" />
        </Button>
      </div>
    </div>
  );
}
