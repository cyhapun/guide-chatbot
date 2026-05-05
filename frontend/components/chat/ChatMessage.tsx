import React from 'react';
import ReactMarkdown from 'react-markdown';
import { User, Scale, BookOpen, ChevronRight } from 'lucide-react';

export interface DocumentChunk {
  content: string;
  metadata: {
    source?: string;
    dieu?: string;
    khoan?: string;
    diem?: string;
    law?: string;
  };
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  contextUsed?: DocumentChunk[];
}

export function ChatMessage({ message }: { message: Message }) {
  const isUser = message.role === 'user';

  return (
    <div className={`py-6 px-4 transition-all hover:bg-gray-50/50 ${isUser ? '' : ''}`}>
      <div className={`max-w-4xl mx-auto flex gap-5 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
        
        {/* Avatar */}
        <div className="flex-shrink-0 mt-1">
          {isUser ? (
            <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center shadow-inner border border-gray-300">
              <User className="w-5 h-5 text-gray-600" />
            </div>
          ) : (
            <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-lg flex items-center justify-center shadow-md border border-blue-800">
              <Scale className="w-4 h-4 text-white" />
            </div>
          )}
        </div>
        
        {/* Message Content */}
        <div className={`flex-1 min-w-0 flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
          <div className={`inline-block max-w-[85%] ${
            isUser 
              ? 'bg-blue-600 text-white px-5 py-3.5 rounded-2xl rounded-tr-sm shadow-sm' 
              : 'text-gray-800'
          }`}>
            <div className={`prose max-w-none ${
              isUser 
                ? 'prose-p:leading-relaxed prose-p:text-white text-white' 
                : 'prose-slate prose-p:leading-7 prose-headings:text-indigo-900 prose-a:text-blue-600 prose-strong:text-gray-900'
            }`}>
              <ReactMarkdown>{message.content}</ReactMarkdown>
            </div>
          </div>
          
          {/* RAG Context Display (Căn cứ pháp lý) */}
          {!isUser && message.contextUsed && message.contextUsed.length > 0 && (
            <div className="mt-4 w-full max-w-3xl">
              <div className="flex items-center text-gray-500 mb-2 gap-1.5">
                <BookOpen className="w-4 h-4 text-indigo-500" />
                <span className="text-[11px] font-semibold uppercase tracking-wider text-indigo-500">
                  Căn cứ pháp lý áp dụng
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {message.contextUsed.map((ctx: any, idx) => {
                  const { source, dieu, khoan, diem } = ctx.metadata || {};
                  let displayText = source || 'Tài liệu pháp lý';
                  if (dieu) displayText += ` - Điều ${dieu}`;
                  if (khoan) displayText += ` (Khoản ${khoan})`;
                  if (diem) displayText += ` Điểm ${diem}`;

                  return (
                    <div 
                      key={idx} 
                      className="group flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[13px] font-medium bg-indigo-50/50 text-indigo-800 border border-indigo-100/50 hover:bg-indigo-100 hover:border-indigo-300 cursor-help transition-colors"
                      title={ctx.content}
                    >
                      <ChevronRight className="w-3 h-3 text-indigo-400" />
                      <span className="truncate max-w-[280px]">{displayText}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}