'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, PanelLeft, BookOpenText } from 'lucide-react';
import { ProviderSelector } from './ProviderSelector';
import { THEMES } from './ThemeSelector';
import { ChatMessage, Message } from './ChatMessage';
import { Sidebar, ChatSession } from './Sidebar';

export function ChatInterface() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [messagesBySession, setMessagesBySession] = useState<Record<string, Message[]>>({});
  
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [model, setModel] = useState('GOOGLE:gemini-2.5-flash');
  const [theme, setTheme] = useState('');
  const [isThemeUnlocked, setIsThemeUnlocked] = useState(false);
  // Value user types into input
  const [themeCode, setThemeCode] = useState('');
  // Theme code đã được backend xác thực (dùng để gọi /api/chat)
  const [activeThemeCode, setActiveThemeCode] = useState<string | null>(null);
  const [themeCodeError, setThemeCodeError] = useState<string | null>(null);
  const [isUnlocking, setIsUnlocking] = useState(false);
  
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMounted, setIsMounted] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const currentMessages = currentSessionId ? messagesBySession[currentSessionId] || [] : [];

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [currentMessages, isLoading]);

  useEffect(() => {
    setIsMounted(true);
    const savedSessions = localStorage.getItem('theme_docs_sessions');
    const savedMessages = localStorage.getItem('theme_docs_messages');
    const savedThemeCode = localStorage.getItem('theme_docs_theme_code');
    
    async function tryUnlockWithSavedCode() {
      if (!savedThemeCode) return;
      try {
        const response = await fetch('/api/theme/unlock', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ theme_code: savedThemeCode.trim() }),
        });
        if (!response.ok) return;
        const data = await response.json();
        setTheme(data.theme);
        setActiveThemeCode(savedThemeCode.trim());
        setIsThemeUnlocked(true);
        setThemeCodeError(null);
      } catch {
        // ignore
      }
    }

    void tryUnlockWithSavedCode();

    if (savedSessions && savedMessages) {
      const parsedSessions = JSON.parse(savedSessions);
      setSessions(parsedSessions);
      setMessagesBySession(JSON.parse(savedMessages));
      if (parsedSessions.length > 0) setCurrentSessionId(parsedSessions[0].id);
      else handleNewChat();
    } else {
      handleNewChat();
    }
  }, []);

  const selectedTheme = THEMES.find((t) => t.id === theme);

  const handleUnlockTheme = async () => {
    if (isUnlocking) return;
    const normalized = themeCode.trim();
    if (!normalized) {
      setThemeCodeError('Please enter the theme code');
      return;
    }

    setIsUnlocking(true);
    setThemeCodeError(null);
    try {
      const response = await fetch('/api/theme/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme_code: normalized }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData?.details || errorData?.detail || 'Invalid theme code');
      }

      const data = await response.json();
      setTheme(data.theme);
      setActiveThemeCode(normalized);
      setIsThemeUnlocked(true);
      setThemeCodeError(null);
      setThemeCode('');
      localStorage.setItem('theme_docs_theme_code', normalized);
    } catch (err: any) {
      setThemeCodeError(err?.message || 'Unable to open chatbot with this theme code');
    } finally {
      setIsUnlocking(false);
    }
  };

  useEffect(() => {
    if (isMounted) {
      localStorage.setItem('theme_docs_sessions', JSON.stringify(sessions));
      localStorage.setItem('theme_docs_messages', JSON.stringify(messagesBySession));
    }
  }, [sessions, messagesBySession, isMounted]);

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
    }
  };

  const handleNewChat = () => {
    const newId = Date.now().toString();
    const newSession: ChatSession = { id: newId, title: 'New Chat', lastMessage: '', timestamp: Date.now() };
    setSessions(prev => [newSession, ...prev]);
    setCurrentSessionId(newId);
    setMessagesBySession(prev => ({ ...prev, [newId]: [] }));
  };

  const handleSelectSession = (id: string) => setCurrentSessionId(id);
  const handleDeleteSession = (id: string) => {
    setSessions(prev => prev.filter(s => s.id !== id));
    setMessagesBySession(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    if (currentSessionId === id) {
      const remaining = sessions.filter(s => s.id !== id);
      if (remaining.length > 0) setCurrentSessionId(remaining[0].id);
      else handleNewChat();
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!isThemeUnlocked) return;
    if (!activeThemeCode) return;
    if (!input.trim() || isLoading || !currentSessionId) return;

    const userText = input.trim();
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = '52px';

    const userMessage: Message = { id: Date.now().toString(), role: 'user', content: userText };

    setMessagesBySession(prev => ({
      ...prev, [currentSessionId]: [...(prev[currentSessionId] || []), userMessage]
    }));

    if (currentMessages.length === 0) {
      setSessions(prev => prev.map(s => 
        s.id === currentSessionId ? { ...s, title: userText.substring(0, 30) + (userText.length > 30 ? '...' : '') } : s
      ));
    }

    setIsLoading(true);

    try {
      const apiMessages = [...currentMessages, userMessage].map(m => ({ role: m.role, content: m.content }));
      
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages, model, theme_code: activeThemeCode, session_id: currentSessionId }),
      });

      if (!response.ok) throw new Error('Failed to fetch response');
      const data = await response.json();

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.text,
        contextUsed: data.contextUsed
      };

      setMessagesBySession(prev => ({
        ...prev, [currentSessionId]: [...(prev[currentSessionId] || []), assistantMessage]
      }));
    } catch (error) {
      setMessagesBySession(prev => ({
        ...prev, [currentSessionId]: [...(prev[currentSessionId] || []), {
          id: (Date.now() + 1).toString(), role: 'assistant',
          content: '⚠️ Sorry, there was a connection error to the server. Please check the backend.'
        }]
      }));
    } finally {
      setIsLoading(false);
    }
  };

  if (!isMounted) {
    return (
      <div className="h-screen bg-white flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-12 h-12 border-4 border-indigo-100 rounded-full"></div>
            <div className="w-12 h-12 border-4 border-indigo-600 rounded-full border-t-transparent animate-spin absolute top-0 left-0"></div>
          </div>
          <span className="text-gray-500 font-medium text-sm animate-pulse">Initializing system...</span>
        </div>
      </div>
    );
  }

  if (!isThemeUnlocked) {
    return (
      <div className="h-screen bg-white flex items-center justify-center px-4">
        <div className="w-full max-w-lg rounded-3xl border border-gray-200 bg-white shadow-xl p-6">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 bg-indigo-50 rounded-2xl flex items-center justify-center border border-indigo-100">
              <BookOpenText className="w-5 h-5 text-indigo-600" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-bold text-gray-900">Enter Theme Code to Unlock Chatbot</h2>
              <p className="text-gray-500 mt-1 text-sm">
                The theme code must match one of the supported codes below.
              </p>
            </div>
          </div>

          <div className="mt-5">
            <label className="text-sm font-medium text-gray-700">Theme code</label>
            <input
              value={themeCode}
              onChange={(e) => {
                setThemeCode(e.target.value);
                setThemeCodeError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleUnlockTheme();
              }}
              placeholder="Enter the theme code you received"
              className="mt-2 w-full rounded-2xl border border-gray-200 px-4 py-3 outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50/60"
            />

            {themeCodeError && (
              <div className="mt-2 text-sm text-red-600 font-medium">{themeCodeError}</div>
            )}

            <button
              onClick={handleUnlockTheme}
              disabled={isUnlocking}
              className="mt-4 w-full p-3 rounded-2xl text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 transition-all shadow-md active:scale-95"
            >
              {isUnlocking ? 'Verifying...' : 'Unlock Chatbot'}
            </button>

            <div className="mt-4 text-[12px] text-gray-500">
              After verification, the corresponding theme will be automatically applied to your chatbot.
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-white overflow-hidden font-sans relative selection:bg-indigo-100">
      <div className={`flex-shrink-0 transition-all duration-300 ease-in-out overflow-hidden h-full z-20 ${isSidebarOpen ? 'w-64 opacity-100' : 'w-0 opacity-0'}`}>
        <div className="w-64 h-full">
          <Sidebar 
            sessions={sessions} 
            currentSessionId={currentSessionId} 
            onNewChat={handleNewChat} 
            onSelectSession={handleSelectSession} 
            onDeleteSession={handleDeleteSession} 
            onCloseSidebar={() => setIsSidebarOpen(false)} 
          />
        </div>
      </div>

      <div className="flex-1 flex flex-col min-w-0 relative h-full">
        {/* Header */}
        <div className="flex items-center justify-between bg-white/80 backdrop-blur-md z-10 absolute top-0 left-0 right-0 px-4 py-3 border-b border-gray-100/50">
          <div className="flex items-center gap-3">
            {!isSidebarOpen && (
              <button onClick={() => setIsSidebarOpen(true)} className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors" title="Open sidebar">
                  <PanelLeft className="w-5 h-5" />
               </button>
            )}
            <span className="text-sm font-bold text-gray-800 tracking-tight md:hidden">Theme Support</span>
          </div>
          <div className="text-[11px] font-bold text-indigo-600 uppercase tracking-widest bg-indigo-50 px-2 py-1 rounded md:block hidden">
            Documentation Guide Chatbot
          </div>
        </div>
        
        {/* Chat content area */}
        <div className="flex-1 overflow-y-auto pt-16 pb-40 custom-scrollbar">
          {currentMessages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-4 animate-in fade-in zoom-in-95 duration-500">
              <div className="w-20 h-20 bg-gradient-to-tr from-indigo-100 to-blue-50 rounded-3xl flex items-center justify-center mb-6 shadow-sm border border-indigo-50/50">
                <BookOpenText className="w-10 h-10 text-indigo-600" />
              </div>
              <h2 className="text-3xl font-bold text-gray-800 mb-3 tracking-tight">Theme Support</h2>
              <p className="text-gray-500 max-w-md text-lg">
                Technical support agent for the Theme. <br />
                Answers strictly based on the documentation and include clear citations.
              </p>
            </div>
          ) : (
            <div className="pb-8">
              {currentMessages.map(msg => <ChatMessage key={msg.id} message={msg} />)}
              {isLoading && (
                <div className="py-6 px-4">
                  <div className="max-w-4xl mx-auto flex space-x-4 items-center">
                    <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-lg flex items-center justify-center shadow-md border border-blue-800">
                      <Bot className="w-4 h-4 text-white" />
                    </div>
                    <div className="flex space-x-1.5 items-center px-4 py-3">
                      <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Floating Input Area - Model */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-white via-white/95 to-transparent pt-10 pb-4 px-4">
          <div className="max-w-3xl mx-auto relative">
            <div className="relative shadow-xl shadow-indigo-100/20 rounded-3xl bg-white border border-gray-200 focus-within:border-indigo-400 focus-within:ring-4 focus-within:ring-indigo-50/50 transition-all duration-300">
              
              {/* Toolbar: Model (above textarea) */}
              <div className="flex items-center gap-2 px-3 pt-3 pb-1 border-b border-gray-50 md:border-none">
                <ProviderSelector model={model} setModel={setModel}/>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-gray-100 bg-gray-50">
                  <div className="w-6 h-6 rounded-lg bg-violet-50 border border-violet-100 flex items-center justify-center">
                    <div className="w-2.5 h-2.5 rounded-full bg-violet-600" />
                  </div>
                  <div className="flex flex-col leading-tight">
                    <span className="text-[12px] font-bold text-gray-800">
                      {selectedTheme?.name ?? 'Theme'}
                    </span>
                    <span className="text-[10px] font-medium text-gray-500 truncate max-w-[10rem]">
                      {theme}
                    </span>
                  </div>
                </div>
              </div>

              <textarea
                ref={textareaRef}
                value={input}
                onChange={handleInput}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
                }}
                placeholder="Ask about the Theme... (Shift + Enter for newline)"
                className="w-full resize-none bg-transparent pl-5 pr-14 py-3 focus:outline-none text-gray-700 leading-relaxed rounded-b-3xl text-[15px] custom-scrollbar"
                rows={1}
                style={{ minHeight: '52px', maxHeight: '160px' }}
              />
              
              <button
                onClick={(e) => handleSubmit(e as any)}
                disabled={!input.trim() || isLoading}
                className="absolute right-3 bottom-3 p-2.5 text-white bg-indigo-600 rounded-2xl hover:bg-indigo-700 disabled:opacity-40 transition-all shadow-md active:scale-95 flex items-center justify-center"
              >
                <Send className="w-4 h-4 translate-x-px translate-y-px" />
              </button>
            </div>
            
            <p className="text-center mt-3 text-[10px] text-gray-400 font-medium md:text-[11px]">
              AI may provide incorrect information. Always verify important details.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}