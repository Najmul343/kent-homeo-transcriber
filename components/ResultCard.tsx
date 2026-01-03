
import React from 'react';

interface ResultCardProps {
  text: string;
  type: 'TRANSCRIPT' | 'CASE' | 'RUBRICS';
  onDelete?: () => void;
  index?: number;
}

export const ResultCard: React.FC<ResultCardProps> = ({ text, type, onDelete, index }) => {
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
  };

  const isTranscript = type === 'TRANSCRIPT';
  const isCase = type === 'CASE';
  
  let borderColor = 'border-slate-100';
  let bgColor = 'bg-white';
  let headerBg = 'bg-slate-50';
  let tagColor = 'bg-slate-200 text-slate-600';
  let title = `#${(index ?? 0) + 1}`;

  if (isCase) {
    borderColor = 'border-teal-100';
    bgColor = 'bg-teal-50/30';
    headerBg = 'bg-teal-100/50';
    tagColor = 'bg-teal-600 text-white';
    title = 'KENTIAN CASE';
  } else if (type === 'RUBRICS') {
    borderColor = 'border-amber-100';
    bgColor = 'bg-amber-50/30';
    headerBg = 'bg-amber-100/50';
    tagColor = 'bg-amber-600 text-white';
    title = 'REPERTORY RUBRICS';
  }

  return (
    <div className={`w-full max-w-md rounded-2xl shadow-sm border overflow-hidden animate-fade-in-up mb-4 ${bgColor} ${borderColor}`}>
      <div className={`px-4 py-2 border-b flex justify-between items-center ${headerBg} ${borderColor}`}>
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-tighter ${tagColor}`}>
            {title}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={handleCopy}
            className="text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded transition-colors text-slate-500 hover:bg-white/50"
          >
            Copy
          </button>
          {onDelete && (
            <button 
              onClick={onDelete}
              className="text-slate-400 hover:text-red-500 p-1 rounded hover:bg-red-50 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
        </div>
      </div>
      <div className="p-4">
        <div 
          className={`text-lg leading-relaxed text-slate-800 whitespace-pre-wrap font-sans`}
          dir="auto"
        >
          {text}
        </div>
      </div>
    </div>
  );
};
