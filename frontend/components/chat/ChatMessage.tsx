import React from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import { User, Bot, BookOpenText, ExternalLink, ChevronDown } from 'lucide-react';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

function MarkdownImage({
  src,
  alt,
  className,
  ...rest
}: React.ImgHTMLAttributes<HTMLImageElement>) {
  if (src == null || typeof src !== 'string' || src === '') return null;
  return (
    // Remote RAG URLs are arbitrary domains; use native <img> (not next/image).
    // eslint-disable-next-line @next/next/no-img-element
    <img
      {...rest}
      src={src}
      alt={alt ?? ''}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      className={`my-3 block max-h-[min(85vh,48rem)] w-auto max-w-full shrink-0 rounded-lg border border-gray-200 bg-white object-contain opacity-100 [image-rendering:auto] [transform:translateZ(0)] [backface-visibility:hidden] ${className ?? ''}`}
    />
  );
}

const markdownComponents: Components = {
  img: MarkdownImage,
};

export interface DocumentChunk {
  content: string;
  metadata: {
    source?: string;
    title?: string;
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
              <Bot className="w-4 h-4 text-white" />
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
                ? 'prose-p:leading-relaxed prose-p:text-white text-white prose-img:border-white/20' 
                : 'prose-slate prose-p:leading-7 prose-headings:text-indigo-900 prose-a:text-blue-600 prose-strong:text-gray-900'
            }`}>
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[rehypeKatex]}
                components={markdownComponents}
              >
                {message.content}
              </ReactMarkdown>
            </div>
          </div>
          
          {/* RAG Context Display (Documentation references) */}
          {!isUser && message.contextUsed && message.contextUsed.length > 0 && (
            <div className="mt-4 w-full max-w-3xl">
              <div className="flex items-center text-gray-500 mb-2 gap-1.5">
                <BookOpenText className="w-4 h-4 text-indigo-500" />
                <span className="text-[11px] font-semibold uppercase tracking-wider text-indigo-500">
                  References
                </span>
              </div>

              <div className="rounded-2xl border border-gray-200 bg-gray-50/50 overflow-hidden">
                {message.contextUsed.map((ctx, idx) => {
                  const title = ctx?.metadata?.title?.trim() || `Document #${idx + 1}`;
                  const rawSource = ctx?.metadata?.source?.trim();

                  const displaySource = (() => {
                    if (!rawSource) return null;
                    try {
                      const u = new URL(rawSource);
                      const parts = u.pathname.split('/').filter(Boolean);
                      if (parts.length > 0 && parts[parts.length - 1].toLowerCase().endsWith('.json')) {
                        const parent = parts.slice(0, -1).join('/');
                        return `${u.origin}${parent ? '/' + parent : ''}`;
                      }
                      return `${u.origin}${u.pathname}`;
                    } catch (err) {
                      // Not a valid URL (maybe local path). Strip trailing .json filename if present
                      const s = rawSource.replace(/\\\\/g, '/').replace(/\\/g, '/');
                      const parts = s.split('/').filter(Boolean);
                      if (parts.length > 0 && parts[parts.length - 1].toLowerCase().endsWith('.json')) {
                        return parts.slice(0, -1).join('/') || parts[0] || '';
                      }
                      return rawSource;
                    }
                  })();

                  return (
                    <details
                      key={`${title}-${idx}`}
                      className="group border-b border-gray-200 last:border-b-0 bg-white/70 open:bg-white transition-colors"
                    >
                      <summary className="list-none cursor-pointer px-4 py-3 flex items-start gap-3 hover:bg-gray-50">
                        <ChevronDown className="w-4 h-4 text-gray-400 mt-0.5 group-open:rotate-180 transition-transform" />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold text-gray-900 truncate">
                            {title}
                          </div>
                          {rawSource ? (
                            <a
                              href={rawSource}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-0.5 inline-flex items-center gap-1 text-[12px] font-medium text-blue-600 hover:underline break-all"
                              onClick={(e) => e.stopPropagation()}
                              title={rawSource}
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              <span className="truncate">{displaySource || 'Open documentation'}</span>
                            </a>
                          ) : (
                            <div className="mt-0.5 text-[12px] text-gray-500">
                              (No source link)
                            </div>
                          )}
                        </div>
                      </summary>

                      <div className="px-4 pb-4">
                        <div className="text-[13px] leading-relaxed text-gray-700 whitespace-pre-wrap">
                          {ctx.content}
                        </div>
                      </div>
                    </details>
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