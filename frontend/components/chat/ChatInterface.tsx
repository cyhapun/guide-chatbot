'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Send, Scale, PanelLeft, LibraryBig, Gavel, Check, ChevronDown } from 'lucide-react'; 
import { ProviderSelector } from './ProviderSelector';
import { ChatMessage, Message } from './ChatMessage';
import { Sidebar, ChatSession } from './Sidebar';

export function ChatInterface() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [messagesBySession, setMessagesBySession] = useState<Record<string, Message[]>>({});
  
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [model, setModel] = useState('google/gemma-4-31B-it');
  
  // State cho danh mục Lĩnh vực (Custom Dropdown)
  const [lawCategory, setLawCategory] = useState('Chung');
  const [isCategoryOpen, setIsCategoryOpen] = useState(false);
  const categoryRef = useRef<HTMLDivElement>(null);
  
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMounted, setIsMounted] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const categories = [
    "Chung", "Kinh doanh", "Đất đai", "Bảo vệ môi trường", "Tố tụng dân sự", "Nhà ở"
  ];

  const currentMessages = currentSessionId ? messagesBySession[currentSessionId] || [] : [];

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [currentMessages, isLoading]);

  useEffect(() => {
    setIsMounted(true);
    const savedSessions = localStorage.getItem('vietlaw_sessions');
    const savedMessages = localStorage.getItem('vietlaw_messages');

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

  useEffect(() => {
    if (isMounted) {
      localStorage.setItem('vietlaw_sessions', JSON.stringify(sessions));
      localStorage.setItem('vietlaw_messages', JSON.stringify(messagesBySession));
    }
  }, [sessions, messagesBySession, isMounted]);

  // Xử lý đóng Dropdown Lĩnh vực khi click ra ngoài
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (categoryRef.current && !categoryRef.current.contains(event.target as Node)) {
        setIsCategoryOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
    }
  };

  const handleNewChat = () => {
    const newId = Date.now().toString();
    const newSession: ChatSession = { id: newId, title: 'Cuộc trò chuyện mới', lastMessage: '', timestamp: Date.now() };
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
        body: JSON.stringify({ messages: apiMessages, model: model, category: lawCategory }),
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
          content: '⚠️ Xin lỗi, đã có lỗi kết nối đến máy chủ. Vui lòng kiểm tra lại Backend.'
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
          <span className="text-gray-500 font-medium text-sm animate-pulse">Khởi tạo hệ thống...</span>
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
        {/* Header tối giản */}
        <div className="flex items-center justify-between bg-white/80 backdrop-blur-md z-10 absolute top-0 left-0 right-0 px-4 py-3 border-b border-gray-100/50">
          <div className="flex items-center gap-3">
            {!isSidebarOpen && (
               <button onClick={() => setIsSidebarOpen(true)} className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors" title="Mở sidebar">
                  <PanelLeft className="w-5 h-5" />
               </button>
            )}
            <span className="text-sm font-bold text-gray-800 tracking-tight md:hidden">VietLaw AI</span>
          </div>
          <div className="text-[11px] font-bold text-indigo-600 uppercase tracking-widest bg-indigo-50 px-2 py-1 rounded md:block hidden">
            Hệ thống tra cứu pháp luật thông minh
          </div>
        </div>
        
        {/* Vùng nội dung chat */}
        <div className="flex-1 overflow-y-auto pt-16 pb-40 custom-scrollbar">
          {currentMessages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-4 animate-in fade-in zoom-in-95 duration-500">
              <div className="w-20 h-20 bg-gradient-to-tr from-indigo-100 to-blue-50 rounded-3xl flex items-center justify-center mb-6 shadow-sm border border-indigo-50/50">
                <Gavel className="w-10 h-10 text-indigo-600" />
              </div>
              <h2 className="text-3xl font-bold text-gray-800 mb-3 tracking-tight">VietLaw AI</h2>
              <p className="text-gray-500 max-w-md text-lg">
                Trợ lý pháp lý thông minh của bạn. <br/>
                Sẵn sàng giải đáp mọi thắc mắc.
              </p>
            </div>
          ) : (
            <div className="pb-8">
              {currentMessages.map(msg => <ChatMessage key={msg.id} message={msg} />)}
              {isLoading && (
                <div className="py-6 px-4">
                  <div className="max-w-4xl mx-auto flex space-x-4 items-center">
                    <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-lg flex items-center justify-center shadow-md border border-blue-800">
                      <Scale className="w-4 h-4 text-white" />
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

        {/* Floating Input Area - Tích hợp Lĩnh vực & Model */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-white via-white/95 to-transparent pt-10 pb-4 px-4">
          <div className="max-w-3xl mx-auto relative">
            <div className="relative shadow-xl shadow-indigo-100/20 rounded-3xl bg-white border border-gray-200 focus-within:border-indigo-400 focus-within:ring-4 focus-within:ring-indigo-50/50 transition-all duration-300">
              
              {/* Toolbar: Lĩnh vực & Model (Nằm trên textarea) */}
              <div className="flex items-center gap-2 px-3 pt-3 pb-1 border-b border-gray-50 md:border-none">
                
                {/* Custom Dropdown: Bộ chọn Lĩnh vực */}
                <div className="relative flex items-center" ref={categoryRef}>
                  <button 
                    type="button"
                    onClick={() => setIsCategoryOpen(!isCategoryOpen)}
                    className="flex items-center bg-gray-50 hover:bg-gray-100 rounded-xl px-3 py-1.5 transition-colors border border-gray-100 active:bg-gray-200"
                  >
                    <LibraryBig className="w-3.5 h-3.5 text-indigo-600 mr-2" />
                    <span className="text-[12px] font-bold text-gray-700">
                      {lawCategory === "Chung" ? "Tất cả lĩnh vực" : `Luật ${lawCategory}`}
                    </span>
                    <ChevronDown className={`w-3 h-3 text-gray-400 ml-1.5 transition-transform duration-200 ${isCategoryOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {/* Menu Lĩnh Vực thả xuống */}
                  {isCategoryOpen && (
                    <div className="absolute bottom-full mb-2 left-0 w-48 bg-white border border-gray-100 shadow-xl shadow-gray-200/50 rounded-xl py-1 z-50 animate-in fade-in slide-in-from-bottom-2 duration-200">
                      <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-gray-400 border-b border-gray-50 mb-1">
                        Tra cứu theo lĩnh vực
                      </div>
                      {categories.map(cat => (
                        <button
                          key={cat}
                          onClick={() => {
                            setLawCategory(cat);
                            setIsCategoryOpen(false);
                          }}
                          className={`w-full text-left px-3 py-2.5 text-[12px] font-medium flex items-center justify-between transition-colors ${
                            lawCategory === cat 
                              ? 'text-indigo-700 bg-indigo-50/50' 
                              : 'text-gray-600 hover:bg-gray-50'
                          }`}
                        >
                          {cat === "Chung" ? "Tất cả lĩnh vực" : `Luật ${cat}`}
                          {lawCategory === cat && <Check className="w-3.5 h-3.5 text-indigo-600" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Custom Dropdown: Bộ chọn Model */}
                <ProviderSelector model={model} setModel={setModel}/>
              </div>

              <textarea
                ref={textareaRef}
                value={input}
                onChange={handleInput}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
                }}
                placeholder="Nhập câu hỏi pháp lý... (Shift + Enter để xuống dòng)"
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
              AI có thể cung cấp thông tin không chính xác. Hãy luôn kiểm tra lại dữ liệu quan trọng.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}