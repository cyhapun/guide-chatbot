import React from 'react';
import { Plus, MessageSquare, Trash2, Gavel, PanelLeftClose } from 'lucide-react';

export interface ChatSession {
  id: string;
  title: string;
  lastMessage: string;
  timestamp: number;
}

interface SidebarProps {
  sessions: ChatSession[];
  currentSessionId: string | null;
  onNewChat: () => void;
  onSelectSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
  onCloseSidebar: () => void;
}

export function Sidebar({ sessions, currentSessionId, onNewChat, onSelectSession, onDeleteSession, onCloseSidebar }: SidebarProps) {
  return (
    <div className="w-64 bg-gray-950 h-screen flex flex-col text-gray-300 font-sans border-r border-gray-900 shadow-xl">
      
      {/* Thanh Header */}
      <div className="h-14 flex items-center justify-between px-4 mt-2">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center">
            <Gavel className="w-4 h-4 text-white" />
          </div>
          <span className="text-sm font-bold text-white tracking-wide">VietLaw AI</span>
        </div>
        <button
          onClick={onCloseSidebar}
          className="p-1.5 rounded-md hover:bg-gray-800 text-gray-400 hover:text-gray-200 transition-colors"
          title="Đóng sidebar"
        >
          <PanelLeftClose className="w-4 h-4" />
        </button>
      </div>

      {/* Nút Tạo Chat Mới */}
      <div className="px-3 py-3">
        <button
          onClick={onNewChat}
          className="w-full flex items-center justify-center gap-2 bg-gray-800/80 hover:bg-gray-800 border border-gray-700/50 rounded-xl py-2.5 px-3 transition-all duration-200 shadow-sm"
        >
          <Plus className="w-4 h-4 text-indigo-400" />
          <span className="text-sm font-medium text-gray-200">Đoạn chat mới</span>
        </button>
      </div>

      {/* Danh sách Lịch sử Chat */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1 custom-scrollbar">
        <div className="px-2 pt-1 pb-2 text-[11px] font-bold uppercase tracking-wider text-gray-500">
          Lịch sử tra cứu
        </div>
        
        {sessions.length === 0 ? (
          <div className="px-2 text-sm text-gray-600 italic text-center mt-4">Chưa có hội thoại nào</div>
        ) : (
          sessions.map((session) => (
            <div
              key={session.id}
              className={`group relative flex items-center px-3 py-2.5 rounded-xl cursor-pointer transition-all duration-200 ${
                currentSessionId === session.id 
                  ? 'bg-gray-800/80 text-white shadow-sm' 
                  : 'hover:bg-gray-900 text-gray-400 hover:text-gray-200'
              }`}
              onClick={() => onSelectSession(session.id)}
            >
              <MessageSquare className={`w-4 h-4 mr-3 flex-shrink-0 ${currentSessionId === session.id ? 'text-indigo-400' : 'text-gray-500 group-hover:text-gray-400'}`} />
              
              <div className="flex-1 truncate pr-6">
                <span className="text-[13px] font-medium block truncate">{session.title}</span>
              </div>
              
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteSession(session.id);
                }}
                className={`absolute right-2 p-1.5 rounded-lg hover:bg-red-500/10 hover:text-red-400 transition-all opacity-0 group-hover:opacity-100 ${
                  currentSessionId === session.id ? 'opacity-100 text-gray-400' : ''
                }`}
                title="Xóa đoạn chat này"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))
        )}
      </div>

      {/* Khu vực User Profile */}
      <div className="p-3 mt-auto border-t border-gray-800/50">
        <div className="flex items-center space-x-3 p-2 rounded-xl hover:bg-gray-900 transition-colors cursor-pointer">
          <div className="w-8 h-8 bg-gradient-to-tr from-gray-700 to-gray-600 rounded-full flex items-center justify-center">
            <span className="text-xs font-bold text-white">VL</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-200 truncate">Luật sư / Cá nhân</p>
            <p className="text-[11px] text-gray-500 truncate font-medium">Gói cơ bản</p>
          </div>
        </div>
      </div>
    </div>
  );
}