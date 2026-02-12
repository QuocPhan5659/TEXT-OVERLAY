
import React, { useState, useCallback } from 'react';
import { VIEWS } from './constants';
import { GenerationState, Resolution, AspectRatio, ViewDefinition } from './types';
import { ImageUploader } from './components/ImageUploader';
import { ViewCard } from './components/ViewCard';
import { ImageModal } from './components/ImageModal';
import { generateArchitecturalView, analyzeArchitecturalStyle, ArchitecturalAnalysis } from './services/geminiService';
import { Box, Sparkles, AlertCircle, Settings, ScanEye, FileText, CheckCircle2, Plus } from 'lucide-react';

const App: React.FC = () => {
  const [sourceImages, setSourceImages] = useState<string[]>([]);
  const [resolution, setResolution] = useState<Resolution>('1K');
  const [customViews, setCustomViews] = useState<ViewDefinition[]>([]);
  
  const [generations, setGenerations] = useState<GenerationState>(() => {
    const initial: GenerationState = {};
    VIEWS.forEach(view => {
      initial[view.id] = { id: view.id, status: 'idle' };
    });
    return initial;
  });
  
  // Analysis State
  const [analysis, setAnalysis] = useState<ArchitecturalAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  const [modalImage, setModalImage] = useState<string | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const handleImagesUpload = (newImages: string[]) => {
    setGlobalError(null);
    setSourceImages(prev => [...prev, ...newImages]);
    
    // Reset state on new image addition
    resetGenerations();
    setAnalysis(null); 
    setAnalysisError(null);
  };

  const handleRemoveImage = (index: number) => {
    setSourceImages(prev => prev.filter((_, i) => i !== index));
    resetGenerations();
    setAnalysis(null);
  };

  const resetGenerations = () => {
    const reset: GenerationState = {};
    [...VIEWS, ...customViews].forEach(view => {
      reset[view.id] = { id: view.id, status: 'idle' };
    });
    setGenerations(reset);
  };

  // Custom View Handlers
  const handleAddCustomView = () => {
    const newId = Date.now();
    const newView: ViewDefinition = {
      id: newId,
      titleVI: "", // Empty for user to fill
      titleEN: "Custom View",
      description: "Custom user defined view",
      prompt: "", // Handled dynamically
      isCustom: true
    };
    setCustomViews(prev => [...prev, newView]);
  };

  const handleDeleteCustomView = (id: number) => {
    setCustomViews(prev => prev.filter(v => v.id !== id));
    setGenerations(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const handleRenameCustomView = (id: number, newTitle: string) => {
    setCustomViews(prev => prev.map(v => v.id === id ? { ...v, titleVI: newTitle } : v));
  };

  // Handler for Architectural Analysis
  const handleAnalyze = async () => {
    if (sourceImages.length === 0) return;
    
    setIsAnalyzing(true);
    setAnalysisError(null);
    
    try {
      const result = await analyzeArchitecturalStyle(sourceImages);
      setAnalysis(result);
    } catch (error: any) {
      setAnalysisError("Failed to analyze images. Please try again.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleGenerate = async (viewId: number, customPrompt?: string, aspectRatio: AspectRatio = '1:1') => {
    if (sourceImages.length === 0) return;

    setGenerations(prev => ({
      ...prev,
      [viewId]: { ...prev[viewId], status: 'loading', error: undefined }
    }));

    try {
      const allViews = [...VIEWS, ...customViews];
      const view = allViews.find(v => v.id === viewId);
      if (!view) throw new Error("View not found");

      // Construct prompt: Use system prompt, or build one for custom views
      let effectivePrompt = view.prompt;
      if (view.isCustom) {
        effectivePrompt = `Create an architectural view matching this title/description: "${view.titleVI}".`;
      }

      // Pass source images, resolution, aspect ratio (from card), analysis context (English), and custom prompt
      const generatedImageUrl = await generateArchitecturalView(
        sourceImages, 
        effectivePrompt, 
        resolution,
        aspectRatio,
        analysis?.english || undefined,
        customPrompt
      );

      setGenerations(prev => ({
        ...prev,
        [viewId]: { ...prev[viewId], status: 'success', imageUrl: generatedImageUrl }
      }));
    } catch (error: any) {
      setGenerations(prev => ({
        ...prev,
        [viewId]: { ...prev[viewId], status: 'error', error: error.message || "Failed to generate" }
      }));
    }
  };

  const handleGenerateAll = useCallback(async () => {
    if (sourceImages.length === 0) return;

    const allViews = [...VIEWS, ...customViews];
    // For custom views, only generate if they have a title
    const viewsToGenerate = allViews.filter(view => {
      if (view.isCustom && !view.titleVI.trim()) return false;
      return generations[view.id]?.status !== 'success';
    });
    
    if (viewsToGenerate.length === 0) return;

    setGenerations(prev => {
      const next = { ...prev };
      viewsToGenerate.forEach(view => {
        next[view.id] = { ...next[view.id], status: 'loading', error: undefined };
      });
      return next;
    });

    for (const view of viewsToGenerate) {
      try {
        // Bulk generation uses default 1:1 ratio
        await handleGenerate(view.id, undefined, '1:1');
      } catch (e) {
        console.error(`Failed to generate view ${view.id}`, e);
      }
      
      if (view !== viewsToGenerate[viewsToGenerate.length - 1]) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

  }, [sourceImages, generations, resolution, analysis, customViews]);

  const allViews = [...VIEWS, ...customViews];

  return (
    <div className="min-h-screen pb-12 bg-gray-50">
      {/* Header - Full Width */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="w-full px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-blue-600 text-white p-2 rounded-lg">
              <Box size={24} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 tracking-tight">ArchiView AI</h1>
              <p className="text-xs text-gray-500 hidden sm:block">Architectural Visualization Generator</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {sourceImages.length > 0 && (
              <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-1 pr-2">
                {/* Resolution Selector */}
                <div className="flex items-center gap-1">
                   <div className="p-1.5 text-gray-500">
                    <Settings size={16} />
                  </div>
                  <select 
                    value={resolution}
                    onChange={(e) => setResolution(e.target.value as Resolution)}
                    className="bg-transparent text-sm font-medium text-gray-700 outline-none cursor-pointer"
                  >
                    <option value="1K">1K Res</option>
                    <option value="2K">2K Res</option>
                    <option value="4K">4K Res</option>
                  </select>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Content - Full Width */}
      <main className="w-full px-4 py-6">
        
        {sourceImages.length === 0 && (
          <div className="mb-8 text-center max-w-3xl mx-auto">
            <h2 className="text-3xl font-extrabold text-gray-900 mb-4 sm:text-4xl">
              Reimagine Your Architecture
            </h2>
            <p className="text-lg text-gray-600 leading-relaxed">
              Upload up to 5 reference images. Use <strong>Analyze</strong> to extract detailed architectural DNA, then generate 33 consistent professional angles.
            </p>
          </div>
        )}

        {globalError && (
          <div className="w-full mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3 text-red-700">
            <AlertCircle size={20} />
            <p>{globalError}</p>
          </div>
        )}

        {/* Upload Section */}
        <ImageUploader 
          currentImages={sourceImages} 
          onImagesUpload={handleImagesUpload} 
          onRemoveImage={handleRemoveImage}
        />

        {/* Action Bar: Analyze & Generate */}
        {sourceImages.length > 0 && (
          <div className="w-full mb-6 space-y-4">
            
            {/* Analysis Controls */}
            <div className="flex flex-col sm:flex-row justify-center items-center gap-4">
              {!analysis && (
                <button
                  onClick={handleAnalyze}
                  disabled={isAnalyzing}
                  className={`flex items-center gap-2 px-6 py-3 rounded-full font-semibold text-white transition-all shadow-lg
                    ${isAnalyzing 
                      ? 'bg-blue-400 cursor-wait' 
                      : 'bg-blue-600 hover:bg-blue-700 hover:-translate-y-0.5'
                    }
                  `}
                >
                  {isAnalyzing ? (
                    <><ScanEye className="animate-pulse" size={20} /> Analyzing Architecture...</>
                  ) : (
                    <><ScanEye size={20} /> Analyze Reference Images</>
                  )}
                </button>
              )}

              {(analysis || !analysis) && (
                 <button
                  onClick={handleGenerateAll}
                  disabled={isAnalyzing} // Wait for analysis if trying to generate
                  className={`flex items-center gap-2 px-6 py-3 rounded-full font-semibold text-white transition-all shadow-lg
                    ${isAnalyzing
                      ? 'bg-gray-700 opacity-50 cursor-not-allowed'
                      : 'bg-gray-900 hover:bg-gray-800 hover:-translate-y-0.5'
                    }
                  `}
                >
                  <Sparkles size={18} className="text-yellow-400" />
                  Generate All Views
                </button>
              )}
            </div>

            {/* Analysis Result Card */}
            {analysisError && (
              <div className="p-4 bg-red-50 border border-red-100 rounded-xl text-red-600 text-center text-sm">
                {analysisError}
              </div>
            )}

            {analysis && (
              <div className="bg-white rounded-xl border border-blue-100 shadow-sm overflow-hidden animate-in fade-in slide-in-from-top-4 duration-500">
                <div className="bg-blue-50/50 p-4 border-b border-blue-100 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-blue-800">
                    <CheckCircle2 size={18} />
                    <h3 className="font-bold text-sm uppercase tracking-wide">Architectural DNA Analyzed</h3>
                  </div>
                  <span className="text-xs text-blue-600 font-medium px-2 py-1 bg-blue-100 rounded">
                    Ready for consistent generation
                  </span>
                </div>
                
                {/* Bilingual Columns */}
                <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-gray-100">
                  {/* Vietnamese Column */}
                  <div className="p-5">
                    <h4 className="text-xs font-bold text-gray-500 uppercase mb-3 flex items-center gap-2">
                       <span className="w-5 h-5 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-[10px] font-extrabold">VN</span>
                       Phân tích Tiếng Việt
                    </h4>
                    <div className="flex gap-3">
                      <FileText className="text-gray-400 shrink-0 mt-1" size={18} />
                      <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap max-h-60 overflow-y-auto pr-2">
                        {analysis.vietnamese}
                      </p>
                    </div>
                  </div>

                  {/* English Column */}
                  <div className="p-5 bg-gray-50/30">
                    <h4 className="text-xs font-bold text-gray-500 uppercase mb-3 flex items-center gap-2">
                       <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-[10px] font-extrabold">EN</span>
                       English Analysis (DNA)
                    </h4>
                    <div className="flex gap-3">
                      <FileText className="text-gray-400 shrink-0 mt-1" size={18} />
                      <p className="text-sm text-gray-700 leading-relaxed font-mono whitespace-pre-wrap max-h-60 overflow-y-auto pr-2">
                        {analysis.english}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Grid Section - Expanded Columns */}
        {sourceImages.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
            {allViews.map((view) => (
              <ViewCard
                key={view.id}
                view={view}
                data={generations[view.id]}
                onGenerate={handleGenerate}
                disabled={sourceImages.length === 0 || isAnalyzing}
                onMaximize={setModalImage}
                onDelete={view.isCustom ? handleDeleteCustomView : undefined}
                onRename={view.isCustom ? handleRenameCustomView : undefined}
              />
            ))}
            
            {/* Add Custom View Button */}
            <button
              onClick={handleAddCustomView}
              className="flex flex-col items-center justify-center h-full min-h-[400px] bg-white border-2 border-dashed border-gray-200 rounded-xl hover:border-blue-400 hover:bg-blue-50 transition-all group"
            >
              <div className="p-4 bg-gray-50 rounded-full group-hover:bg-blue-100 group-hover:text-blue-600 text-gray-400 transition-colors mb-4">
                <Plus size={32} />
              </div>
              <span className="font-semibold text-gray-600 group-hover:text-blue-700">Add Custom View</span>
              <span className="text-xs text-gray-400 mt-1">Create your own angle</span>
            </button>
          </div>
        ) : (
          <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-gray-300 mx-auto max-w-4xl opacity-50 select-none grayscale">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 px-8 max-w-3xl mx-auto filter blur-[2px]">
               {[1,2,3,4].map(i => (
                 <div key={i} className="h-32 bg-gray-200 rounded-lg"></div>
               ))}
            </div>
            <p className="mt-8 text-xl font-medium text-gray-400">Upload images to unlock the view generator</p>
          </div>
        )}
      </main>

      <ImageModal 
        imageUrl={modalImage} 
        onClose={() => setModalImage(null)} 
      />
    </div>
  );
};

export default App;
