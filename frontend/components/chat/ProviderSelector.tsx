import React, { useState, useRef, useEffect } from 'react';
import { Cpu, ChevronDown, Check } from 'lucide-react';

interface ModelSelectorProps {
  model: string;
  setModel: (model: string) => void;
}

interface ModelOption {
  id: string;
  name: string;
  fullName: string;
  provider: 'GOOGLE' | 'OPENAI' | 'OPENROUTER';
}

const MODELS: ModelOption[] = [
  { id: 'GOOGLE:gemini-2.0-flash', name: 'Gemini Flash', fullName: 'gemini-2.0-flash', provider: 'GOOGLE' },
  { id: 'GOOGLE:gemini-1.5-pro', name: 'Gemini Pro', fullName: 'gemini-1.5-pro', provider: 'GOOGLE' },
  { id: 'OPENAI:gpt-4o-mini', name: 'GPT-4o Mini', fullName: 'gpt-4o-mini', provider: 'OPENAI' },
  { id: 'OPENAI:gpt-4.1-mini', name: 'GPT-4.1 Mini', fullName: 'gpt-4.1-mini', provider: 'OPENAI' },
  { id: 'OPENROUTER:openai/gpt-4o-mini', name: 'OR GPT-4o Mini', fullName: 'openai/gpt-4o-mini', provider: 'OPENROUTER' },
  { id: 'OPENROUTER:anthropic/claude-3.5-sonnet', name: 'OR Claude 3.5', fullName: 'anthropic/claude-3.5-sonnet', provider: 'OPENROUTER' },
];

export function ProviderSelector({ model, setModel }: ModelSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedModel = MODELS.find(m => m.id === model) || MODELS[0];
  const groupedModels: Record<ModelOption['provider'], ModelOption[]> = {
    GOOGLE: MODELS.filter((m) => m.provider === 'GOOGLE'),
    OPENAI: MODELS.filter((m) => m.provider === 'OPENAI'),
    OPENROUTER: MODELS.filter((m) => m.provider === 'OPENROUTER'),
  };

  // Xử lý đóng menu khi click ra ngoài
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative flex items-center" ref={dropdownRef}>
      <button 
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center bg-gray-50 hover:bg-gray-100 rounded-xl px-3 py-1.5 transition-colors border border-gray-100 active:bg-gray-200"
      >
        <Cpu className="w-3.5 h-3.5 text-emerald-600 mr-2" />
        <div className="flex items-center gap-1">
          <span className="text-[12px] font-bold text-gray-700">{selectedModel.name}</span>
          <ChevronDown className={`w-3 h-3 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {/* Menu thả xuống */}
      {isOpen && (
        <div className="absolute bottom-full mb-2 left-0 md:left-auto md:right-0 w-64 bg-white border border-gray-100 shadow-xl shadow-gray-200/50 rounded-xl py-1 z-50 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-gray-400 border-b border-gray-50 mb-1">
            Chọn mô hình AI
          </div>
          {(['GOOGLE', 'OPENAI', 'OPENROUTER'] as const).map((provider) => (
            <div key={provider} className="py-1">
              <div className="px-3 pb-1 pt-1 text-[10px] font-bold tracking-wider text-gray-400">
                {provider}
              </div>
              {groupedModels[provider].map((m) => (
                <button
                  key={m.id}
                  onClick={() => {
                    setModel(m.id);
                    setIsOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2.5 text-[12px] font-medium flex items-center justify-between transition-colors ${
                    model === m.id
                      ? 'text-emerald-700 bg-emerald-50/50'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {m.fullName}
                  {model === m.id && <Check className="w-3.5 h-3.5 text-emerald-600" />}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}