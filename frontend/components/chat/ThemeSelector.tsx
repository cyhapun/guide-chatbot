import React, { useEffect, useRef, useState } from 'react';
import { Palette, ChevronDown, Check } from 'lucide-react';

interface ThemeOption {
  id: string;
  name: string;
  fullName: string;
}

interface ThemeSelectorProps {
  theme: string;
  setTheme: (theme: string) => void;
}

export const THEMES: ThemeOption[] = [
  { id: 'docs-theme-sky-com__dcare', name: 'Dcare', fullName: 'Theme Dcare' },
  { id: 'docs-theme-sky-com__cozycorner', name: 'Cozycorner', fullName: 'Theme Cozycorner' },
  { id: 'docs-theme-sky-com__ecomall', name: 'Ecomall', fullName: 'Theme Ecomall' },
  { id: 'docs-theme-sky-com__emall', name: 'Emall', fullName: 'Theme Emall' },
  { id: 'docs-theme-sky-com__merto', name: 'Merto', fullName: 'Theme Merto' },
  { id: 'docs-theme-sky-com__wikibook', name: 'Wikibook', fullName: 'Theme Wikibook' },
];

export function ThemeSelector({ theme, setTheme }: ThemeSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const selectedTheme = THEMES.find((item) => item.id === theme) || THEMES[0];

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative flex items-center" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center bg-gray-50 hover:bg-gray-100 rounded-xl px-3 py-1.5 transition-colors border border-gray-100 active:bg-gray-200"
      >
        <Palette className="w-3.5 h-3.5 text-violet-600 mr-2" />
        <div className="flex items-center gap-1">
          <span className="text-[12px] font-bold text-gray-700">{selectedTheme.name}</span>
          <ChevronDown className={`w-3 h-3 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {isOpen && (
        <div className="absolute bottom-full mb-2 left-0 md:left-auto md:right-0 w-56 bg-white border border-gray-100 shadow-xl shadow-gray-200/50 rounded-xl py-1 z-50 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-gray-400 border-b border-gray-50 mb-1">
            Select Theme
          </div>
          {THEMES.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                setTheme(item.id);
                setIsOpen(false);
              }}
              className={`w-full text-left px-3 py-2.5 text-[12px] font-medium flex items-center justify-between transition-colors ${
                theme === item.id ? 'text-violet-700 bg-violet-50/50' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {item.fullName}
              {theme === item.id && <Check className="w-3.5 h-3.5 text-violet-600" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
