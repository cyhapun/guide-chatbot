import React, { useState, useRef, useEffect } from 'react';
import { Cpu, ChevronDown, Check } from 'lucide-react';

interface ModelSelectorProps {
  model: string;
  setModel: (model: string) => void;
}

const MODELS = [
  { id: 'Qwen/Qwen3.5-9B', name: 'Qwen 3.5', fullName: 'Qwen3.5 9B' },
  { id: 'google/gemma-4-31B-it', name: 'Gemma 4', fullName: 'Gemma 4 31B' },
  { id: 'meta-llama/Llama-3.1-8B-Instruct', name: 'Llama 3.1', fullName: 'Llama 3.1 8B' },
  { id: 'deepseek-ai/DeepSeek-R1-Distill-Qwen-7B', name: 'DeepSeek R1', fullName: 'DeepSeek R1 7B' }
];

export function ProviderSelector({ model, setModel }: ModelSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedModel = MODELS.find(m => m.id === model) || MODELS[0];

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
        <div className="absolute bottom-full mb-2 left-0 md:left-auto md:right-0 w-48 bg-white border border-gray-100 shadow-xl shadow-gray-200/50 rounded-xl py-1 z-50 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-gray-400 border-b border-gray-50 mb-1">
            Chọn mô hình AI
          </div>
          {MODELS.map((m) => (
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
      )}
    </div>
  );
}