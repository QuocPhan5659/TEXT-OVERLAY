import React, { useState, useRef } from 'react';
import { ViewDefinition, GeneratedImage, AspectRatio } from '../types';
import { ASPECT_RATIOS } from '../constants';
import { Loader2, RefreshCw, Download, Maximize2, PenTool, Ratio, Trash2, Edit3 } from 'lucide-react';

interface ViewCardProps {
  view: ViewDefinition;
  data: GeneratedImage;
  onGenerate: (viewId: number, customPrompt?: string, aspectRatio?: AspectRatio) => void;
  disabled: boolean;
  onMaximize: (url: string) => void;
  onDelete?: (id: number) => void;
  onRename?: (id: number, newName: string) => void;
}

export const ViewCard: React.FC<ViewCardProps> = ({ 
  view, 
  data, 
  onGenerate, 
  disabled,
  onMaximize,
  onDelete,
  onRename
}) => {
  const [customPrompt, setCustomPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('1:1');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  // Safe fallback if data is undefined (for new custom views)
  const safeData = data || { status: 'idle', id: view.id };
  const isIdle = safeData.status === 'idle';
  const isLoading = safeData.status === 'loading';
  const isSuccess = safeData.status === 'success';
  const isError = safeData.status === 'error';

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (safeData.imageUrl) {
      const link = document.createElement('a');
      link.href = safeData.imageUrl;
      link.download = `archiview-${view.id}-${view.titleEN.replace(/\s+/g, '-').toLowerCase()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  // Smart Textarea Logic
  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setCustomPrompt(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${e.target.scrollHeight}px`;
  };

  const handleFocus = (e: React.FocusEvent<HTMLTextAreaElement>) => {
    if (e.target.value) {
       e.target.style.height = 'auto';
       e.target.style.height = `${e.target.scrollHeight}px`;
    }
  };

  const handleBlur = (e: React.FocusEvent<HTMLTextAreaElement>) => {
    e.target.style.height = '40px'; 
    e.target.scrollTop = 0;
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col h-full hover:shadow-md transition-shadow duration-300 relative group/card">
      
      {/* Header - Fixed height */}
      <div className="p-3 border-b border-gray-100 bg-gray-50/50 h-[68px] flex flex-col justify-center relative">
        <div className="absolute top-2 right-2 flex items-center gap-1">
          {view.isCustom && onDelete ? (
             <button 
              onClick={() => onDelete(view.id)}
              className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"
              title="Delete Custom View"
             >
               <Trash2 size={14} />
             </button>
          ) : (
            <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full">
              #{view.id}
            </span>
          )}
        </div>

        {view.isCustom && onRename ? (
          <div className="pr-6">
            <div className="flex items-center gap-1 text-gray-400 mb-0.5">
              <Edit3 size={10} />
              <span className="text-[10px] uppercase font-bold tracking-wider">Custom View Name</span>
            </div>
            <input 
              type="text" 
              value={view.titleVI}
              onChange={(e) => onRename(view.id, e.target.value)}
              placeholder="Name this view..."
              className="w-full bg-transparent border-none p-0 text-sm font-bold text-gray-900 focus:ring-0 focus:outline-none placeholder:text-gray-300 truncate"
              autoFocus={view.titleVI === ''}
            />
          </div>
        ) : (
          <>
            <h3 className="font-bold text-gray-900 leading-tight text-sm truncate pr-8" title={view.titleVI}>
              {view.titleVI}
            </h3>
            <p className="text-[10px] text-gray-500 mt-0.5 font-medium truncate pr-8" title={view.titleEN}>
              {view.titleEN}
            </p>
          </>
        )}
      </div>

      {/* Image Area */}
      <div className="relative bg-gray-100 flex-grow min-h-[200px] flex items-center justify-center overflow-hidden group">
        
        {isIdle && (
          <div className="text-center p-6 text-gray-400">
            <div className="mb-2 mx-auto w-10 h-10 rounded-full bg-gray-200/50 flex items-center justify-center">
              <RefreshCw size={18} className="opacity-50" />
            </div>
            <p className="text-xs">Ready</p>
          </div>
        )}

        {isLoading && (
          <div className="flex flex-col items-center justify-center p-6 text-blue-600 animate-pulse">
            <Loader2 size={28} className="animate-spin mb-3" />
            <p className="text-[10px] font-medium uppercase tracking-wider">Reconstructing...</p>
          </div>
        )}

        {isSuccess && safeData.imageUrl && (
          <>
            <img 
              src={safeData.imageUrl} 
              alt={view.titleEN} 
              onClick={() => onMaximize(safeData.imageUrl!)}
              className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105 cursor-zoom-in"
            />
            {/* Overlay Actions */}
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center gap-3 backdrop-blur-[2px] pointer-events-none">
               <button 
                onClick={(e) => { e.stopPropagation(); onMaximize(safeData.imageUrl!); }}
                className="p-2 bg-white text-gray-900 rounded-full hover:bg-gray-100 transition-colors shadow-lg pointer-events-auto"
                title="Maximize View"
              >
                <Maximize2 size={18} />
              </button>
              <button 
                onClick={handleDownload}
                className="p-2 bg-white text-gray-900 rounded-full hover:bg-gray-100 transition-colors shadow-lg pointer-events-auto"
                title="Download Image"
              >
                <Download size={18} />
              </button>
            </div>
          </>
        )}

        {isError && (
          <div className="p-4 text-center text-red-500">
            <p className="text-xs font-medium mb-1">Failed</p>
            <p className="text-[10px] opacity-75 truncate max-w-[150px]">{safeData.error}</p>
          </div>
        )}
      </div>

      {/* Inputs Area */}
      <div className="px-3 pt-3 space-y-2">
        {/* Smart Textarea Input */}
        <div className="relative">
          <div className="absolute top-2.5 left-2.5 text-gray-400">
            <PenTool size={12} />
          </div>
          <textarea
            ref={textareaRef}
            value={customPrompt}
            onChange={handleInput}
            onFocus={handleFocus}
            onBlur={handleBlur}
            placeholder={view.isCustom ? "Describe the view details..." : "Additional details..."}
            rows={1}
            className="w-full pl-8 pr-3 py-2.5 text-xs border border-gray-200 rounded-lg bg-gray-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-gray-400 resize-none overflow-hidden min-h-[40px]"
            style={{ height: '40px' }}
            disabled={disabled || isLoading}
          />
        </div>
        
        {/* Aspect Ratio Select */}
        <div className="relative">
           <div className="absolute top-2.5 left-2.5 text-gray-400">
            <Ratio size={12} />
          </div>
          <select 
            value={aspectRatio}
            onChange={(e) => setAspectRatio(e.target.value as AspectRatio)}
            className="w-full pl-8 pr-3 py-2 text-xs border border-gray-200 rounded-lg bg-gray-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors cursor-pointer appearance-none h-8"
            disabled={disabled || isLoading}
          >
            {ASPECT_RATIOS.map((ratio) => (
              <option key={ratio.value} value={ratio.value}>
                {ratio.label} ({ratio.value})
              </option>
            ))}
          </select>
           {/* Custom Arrow */}
          <div className="absolute top-2.5 right-3 pointer-events-none">
            <svg className="h-3 w-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
      </div>

      {/* Footer / Action */}
      <div className="p-3 bg-white">
        <button
          onClick={() => onGenerate(view.id, customPrompt, aspectRatio)}
          disabled={disabled || isLoading || (view.isCustom && !view.titleVI.trim())}
          className={`w-full py-2 px-4 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-all
            ${isSuccess 
              ? 'bg-gray-100 text-gray-700 hover:bg-gray-200' 
              : 'bg-blue-600 text-white hover:bg-blue-700 shadow-md hover:shadow-lg shadow-blue-200'
            }
            ${(disabled || isLoading || (view.isCustom && !view.titleVI.trim())) ? 'opacity-50 cursor-not-allowed shadow-none' : ''}
          `}
        >
          {isLoading ? (
            <>Running...</>
          ) : isSuccess ? (
            <>
              <RefreshCw size={14} /> Retry
            </>
          ) : (
            <>Generate</>
          )}
        </button>
      </div>
    </div>
  );
};