import React, { useCallback, useState, useEffect, useRef } from 'react';
import { Upload, Image as ImageIcon, Sparkles, Undo2, Redo2, Download, X, ZoomIn, History, Check, Settings, ChevronDown, FileType, Gauge, Scan, MousePointer2, Zap, Film, Smartphone, Gamepad2, Globe, Palette, LayoutTemplate, Send } from 'lucide-react';
import { HistoryItem, Region } from '../types';
import MiniGame from './MiniGame';
import EditingAnimation from './EditingAnimation';

interface ImageAreaProps {
  currentImage: string | null;
  onImageUpload: (file: File, templateName?: string, templatePrompt?: string) => void;
  onSendEdit?: (text: string) => void;
  isGenerating: boolean;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onDownload: (blob: Blob, fileName: string) => void;
  // History Props
  history: HistoryItem[];
  historyIndex: number;
  onJumpToHistory: (index: number) => void;
  // Feedback Props
  feedbackAction?: { type: 'undo' | 'redo', label: string } | null;
  undoLabel?: string;
  redoLabel?: string;
  // Analysis
  onAnalyze: () => void;
  autoAnalyzeEnabled?: boolean;
  onToggleAutoAnalyze?: () => void;
  isAnalyzing?: boolean;
  // Region Editing
  selectedRegion?: Region | null;
  onRegionChange?: (region: Region | null) => void;
}

const TEMPLATES = [
  { 
    id: 'Mr Beast Style', 
    icon: Zap, 
    label: 'Mr Beast', 
    desc: 'Viral, Shocked, Vibrant', 
    color: 'text-yellow-400', 
    border: 'border-yellow-500/50', 
    bg: 'bg-yellow-500/10',
    prompt: "Make it a viral Mr Beast style thumbnail. High contrast, extreme saturation, expressive faces with shocked emotions, glowing outlines around subjects, and a vibrant, blurred background."
  },
  { 
    id: 'Cinematic Vlog', 
    icon: Film, 
    label: 'Cinematic', 
    desc: 'Film Look, Moody', 
    color: 'text-cyan-400', 
    border: 'border-cyan-500/50', 
    bg: 'bg-cyan-500/10',
    prompt: "Apply a cinematic vlog look. Use teal and orange color grading, dramatic lighting with deep shadows, film grain, and a shallow depth of field for a moody atmosphere."
  },
  { 
    id: 'MKBHD Tech', 
    icon: Smartphone, 
    label: 'Tech Review', 
    desc: 'Clean, Matte, 8K', 
    color: 'text-zinc-100', 
    border: 'border-zinc-300/50', 
    bg: 'bg-zinc-500/10',
    prompt: "Create a clean tech review style. Matte finish, bright studio lighting, extremely sharp focus on the subject, neutral background, and 8k resolution minimalist composition."
  },
  { 
    id: 'Epic Gaming', 
    icon: Gamepad2, 
    label: 'Gaming', 
    desc: 'Action, Effects, Red', 
    color: 'text-purple-500', 
    border: 'border-purple-500/50', 
    bg: 'bg-purple-500/10',
    prompt: "Design an epic gaming thumbnail. Intense action, glowing neon particle effects, aggressive red and purple lighting accents, and a dynamic high-energy composition."
  },
  { 
    id: 'Documentary', 
    icon: Globe, 
    label: 'Documentary', 
    desc: 'Gritty, Realistic', 
    color: 'text-emerald-400', 
    border: 'border-emerald-500/50', 
    bg: 'bg-emerald-500/10',
    prompt: "Give it a high-quality documentary feel. Gritty texture, realistic natural lighting, muted earth tones, and a compelling, storytelling photo-journalistic composition."
  },
  { 
    id: 'Brain Storm', 
    icon: Palette, 
    label: 'Creative', 
    desc: 'Abstract, Artistic', 
    color: 'text-pink-400', 
    border: 'border-pink-500/50', 
    bg: 'bg-pink-500/10',
    prompt: "Transform this into a creative art piece. Use abstract collage elements, surreal imagery, a vibrant and unusual color palette, and artistic brushstroke effects."
  },
];

const ImageArea: React.FC<ImageAreaProps> = ({ 
  currentImage, 
  onImageUpload, 
  onSendEdit,
  isGenerating,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onDownload,
  history,
  historyIndex,
  onJumpToHistory,
  feedbackAction,
  undoLabel,
  redoLabel,
  onAnalyze,
  autoAnalyzeEnabled = false,
  onToggleAutoAnalyze,
  isAnalyzing = false,
  selectedRegion,
  onRegionChange
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [showLightbox, setShowLightbox] = useState(false);
  const [showHistoryDropdown, setShowHistoryDropdown] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  
  // Selection Tool State
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [dragStart, setDragStart] = useState<{x: number, y: number} | null>(null);
  const [regionPrompt, setRegionPrompt] = useState("");

  // Template State
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);

  // Export State
  const [exportFormat, setExportFormat] = useState<'png' | 'jpeg' | 'webp'>('png');
  const [exportQuality, setExportQuality] = useState(0.9);
  const [estimatedSize, setEstimatedSize] = useState<string | null>(null);
  const [isCalculatingSize, setIsCalculatingSize] = useState(false);

  const historyDropdownRef = useRef<HTMLDivElement>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const sizeCalculationTimeoutRef = useRef<number | null>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  const selectedTemplate = TEMPLATES.find(t => t.id === selectedTemplateId);

  // Reset lightbox when image changes
  useEffect(() => {
    setShowLightbox(false);
  }, [currentImage]);

  // Auto-exit selection mode when generation starts
  useEffect(() => {
    if (isGenerating) {
        setIsSelectionMode(false);
    }
  }, [isGenerating]);
  
  // Clear region prompt when selection clears
  useEffect(() => {
    if (!selectedRegion) {
        setRegionPrompt("");
    }
  }, [selectedRegion]);

  // Force cursor style during drawing for better UX
  useEffect(() => {
    if (isDrawing) {
        document.body.style.cursor = 'crosshair';
    } else {
        document.body.style.cursor = '';
    }
    return () => { document.body.style.cursor = ''; };
  }, [isDrawing]);

  // Click outside handlers
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
        if (historyDropdownRef.current && !historyDropdownRef.current.contains(event.target as Node)) {
            setShowHistoryDropdown(false);
        }
        if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
            setShowExportMenu(false);
        }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // --- Drag and Drop for Upload ---
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!isSelectionMode) {
       setIsDragging(true);
    }
  }, [isSelectionMode]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (isSelectionMode) return;

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.type.startsWith('image/')) {
        const tmpl = TEMPLATES.find(t => t.id === selectedTemplateId);
        onImageUpload(file, tmpl?.label, tmpl?.prompt);
      }
    }
  }, [onImageUpload, isSelectionMode, selectedTemplateId]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const tmpl = TEMPLATES.find(t => t.id === selectedTemplateId);
      onImageUpload(e.target.files[0], tmpl?.label, tmpl?.prompt);
    }
  };

  // --- Region Selection Logic ---

  const getNormalizedCoordinates = useCallback((e: React.MouseEvent | MouseEvent) => {
      const img = imageRef.current;
      if (!img) return null;

      const rect = img.getBoundingClientRect();
      const imageRatio = img.naturalWidth / img.naturalHeight;
      const containerRatio = rect.width / rect.height;

      let renderWidth = rect.width;
      let renderHeight = rect.height;
      let offsetX = 0;
      let offsetY = 0;

      // Calculate actual rendered image dimensions within the object-contain element
      if (containerRatio > imageRatio) {
          // Pillarboxed (bars on sides)
          renderWidth = rect.height * imageRatio;
          offsetX = (rect.width - renderWidth) / 2;
      } else {
          // Letterboxed (bars on top/bottom)
          renderHeight = rect.width / imageRatio;
          offsetY = (rect.height - renderHeight) / 2;
      }

      // Calculate position relative to the actual image content
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;

      let x = (clickX - offsetX) / renderWidth;
      let y = (clickY - offsetY) / renderHeight;

      // Clamp values
      x = Math.max(0, Math.min(1, x));
      y = Math.max(0, Math.min(1, y));

      return { x, y };
  }, []);

  // Use global window listeners for dragging to allow dragging outside the image area
  useEffect(() => {
    if (!isDrawing || !dragStart) return;

    const handleWindowMouseMove = (e: MouseEvent) => {
        if (!onRegionChange) return;
        e.preventDefault(); 
        
        const coords = getNormalizedCoordinates(e);
        if (coords) {
            const x = Math.min(dragStart.x, coords.x);
            const y = Math.min(dragStart.y, coords.y);
            const width = Math.abs(coords.x - dragStart.x);
            const height = Math.abs(coords.y - dragStart.y);
            
            onRegionChange({ x, y, width, height });
        }
    };

    const handleWindowMouseUp = () => {
        setIsDrawing(false);
        setDragStart(null);
    };

    window.addEventListener('mousemove', handleWindowMouseMove);
    window.addEventListener('mouseup', handleWindowMouseUp);

    return () => {
        window.removeEventListener('mousemove', handleWindowMouseMove);
        window.removeEventListener('mouseup', handleWindowMouseUp);
    };
  }, [isDrawing, dragStart, onRegionChange, getNormalizedCoordinates]);

  const handleMouseDown = (e: React.MouseEvent) => {
      if (!isSelectionMode || !currentImage) return;
      e.preventDefault();
      e.stopPropagation(); // Prevent propagation to avoid conflicts
      
      const coords = getNormalizedCoordinates(e);
      if (coords) {
          setIsDrawing(true);
          setDragStart(coords);
          // Start with zero size
          if (onRegionChange) {
              onRegionChange({ x: coords.x, y: coords.y, width: 0, height: 0 });
          }
      }
  };
  
  // Resize handler
  const handleResizeStart = (e: React.MouseEvent, corner: 'tl' | 'tr' | 'bl' | 'br') => {
      e.preventDefault();
      e.stopPropagation();
      
      if (!selectedRegion) return;
      
      const { x, y, width, height } = selectedRegion;
      let anchorX = 0;
      let anchorY = 0;
      
      // Set the anchor to the opposite corner
      if (corner === 'tl') { anchorX = x + width; anchorY = y + height; }
      else if (corner === 'tr') { anchorX = x; anchorY = y + height; }
      else if (corner === 'bl') { anchorX = x + width; anchorY = y; }
      else if (corner === 'br') { anchorX = x; anchorY = y; }
      
      setDragStart({ x: anchorX, y: anchorY });
      setIsDrawing(true);
  };
  
  // Clear selection if mode is turned off
  useEffect(() => {
      if (!isSelectionMode && selectedRegion && onRegionChange) {
          onRegionChange(null);
      }
  }, [isSelectionMode]);

  const handleRegionPromptSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (regionPrompt.trim() && onSendEdit) {
          setIsSelectionMode(false); // Dismiss mode immediately for snappy feedback
          onSendEdit(regionPrompt.trim());
          setRegionPrompt("");
      }
  };

  // --- Export Logic ---

  const formatBytes = (bytes: number, decimals = 1) => {
      if (bytes === 0) return '0 Bytes';
      const k = 1024;
      const dm = decimals < 0 ? 0 : decimals;
      const sizes = ['Bytes', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  const calculateSize = useCallback(() => {
      if (!currentImage) return;
      setIsCalculatingSize(true);
      
      const img = new Image();
      img.src = currentImage;
      img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
              ctx.drawImage(img, 0, 0);
              const mimeType = `image/${exportFormat}`;
              canvas.toBlob((blob) => {
                  if (blob) {
                      setEstimatedSize(formatBytes(blob.size));
                  }
                  setIsCalculatingSize(false);
              }, mimeType, exportQuality);
          }
      };
  }, [currentImage, exportFormat, exportQuality]);

  // Debounced size calculation
  useEffect(() => {
      if (showExportMenu) {
          if (sizeCalculationTimeoutRef.current) {
              window.clearTimeout(sizeCalculationTimeoutRef.current);
          }
          sizeCalculationTimeoutRef.current = window.setTimeout(calculateSize, 200);
      }
  }, [showExportMenu, exportFormat, exportQuality, calculateSize]);

  const handleExportClick = () => {
      if (!currentImage) return;
      
      const img = new Image();
      img.src = currentImage;
      img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
              ctx.drawImage(img, 0, 0);
              const mimeType = `image/${exportFormat}`;
              canvas.toBlob((blob) => {
                  if (blob) {
                      const randomNumber = Math.floor(1000 + Math.random() * 9000);
                      const fileName = `thumbio-${randomNumber}.${exportFormat}`;
                      onDownload(blob, fileName);
                      setShowExportMenu(false);
                  }
              }, mimeType, exportQuality);
          }
      };
  };

  return (
    <div 
      className={`relative flex-1 h-full flex flex-col transition-colors duration-500 ease-out ${
        isDragging ? 'bg-brand-900/10' : 'bg-[#0D0D0D]'
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Lightbox / Popup Window */}
      {showLightbox && currentImage && (
        <div 
          className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-md flex items-center justify-center p-4 sm:p-8 animate-in fade-in duration-200"
          onClick={() => setShowLightbox(false)}
        >
            <div className="absolute top-4 right-4 z-50">
                <button 
                  onClick={() => setShowLightbox(false)}
                  className="p-3 bg-white/10 hover:bg-white/20 rounded-full text-white transition-all hover:rotate-90"
                >
                    <X size={24} />
                </button>
            </div>
            <img 
              src={currentImage} 
              alt="Full view"
              className="max-w-full max-h-full object-contain shadow-2xl rounded-sm cursor-zoom-out select-none"
              onClick={(e) => e.stopPropagation()} 
            />
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-black/50 backdrop-blur-md text-white/70 px-4 py-2 rounded-full text-xs font-medium border border-white/10 pointer-events-none">
                Viewing in popup mode
            </div>
        </div>
      )}

      {/* Toolbar - Glassmorphism Floating Bar */}
      {currentImage && (
        <div className="absolute top-6 left-0 right-0 z-30 flex justify-center pointer-events-none px-4 animate-in fade-in slide-in-from-top-4 duration-500">
          <div className="bg-[#1C1C1E]/80 backdrop-blur-xl border border-white/10 p-1.5 rounded-2xl flex items-center gap-1 shadow-2xl shadow-black/50 pointer-events-auto">
             
             {/* Selection Tool */}
             <div className="border-r border-white/10 pr-1 mr-1">
                 <button
                    onClick={() => setIsSelectionMode(!isSelectionMode)}
                    className={`p-2.5 rounded-xl transition-all active:scale-95 flex items-center gap-2 ${
                        isSelectionMode ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/30' : 'text-zinc-300 hover:bg-white/10 hover:text-white'
                    }`}
                    title="Selection Mode"
                 >
                     <Scan size={18} strokeWidth={isSelectionMode ? 2.5 : 2} />
                 </button>
             </div>

             {/* Suggestions Toggle */}
             <div className="border-r border-white/10 pr-1 mr-1">
                <button
                    onClick={onAnalyze}
                    disabled={isGenerating}
                    className="p-2.5 rounded-xl transition-all active:scale-95 flex items-center gap-2 text-brand-400 hover:bg-brand-500/10 hover:text-brand-300 disabled:opacity-50"
                    title="Get AI Suggestions"
                >
                    <Sparkles size={18} strokeWidth={2} className="fill-brand-500/20" />
                </button>
             </div>

             {/* Undo/Redo Group */}
             <div className="flex items-center gap-0.5 border-r border-white/10 pr-1 mr-1">
                <div className="group relative">
                    <button 
                    onClick={onUndo}
                    disabled={!canUndo || isGenerating}
                    className="p-2.5 hover:bg-white/10 rounded-xl text-zinc-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all active:scale-95"
                    >
                    <Undo2 size={18} strokeWidth={2} />
                    </button>
                    {canUndo && undoLabel && (
                        <div className="absolute top-full mt-3 left-1/2 -translate-x-1/2 px-2.5 py-1.5 bg-[#27272a] text-white text-[10px] font-medium rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none border border-white/10 shadow-xl z-50">
                            Undo: {undoLabel}
                            <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-[#27272a] border-t border-l border-white/10 rotate-45"></div>
                        </div>
                    )}
                </div>

                <div className="group relative">
                    <button 
                    onClick={onRedo}
                    disabled={!canRedo || isGenerating}
                    className="p-2.5 hover:bg-white/10 rounded-xl text-zinc-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all active:scale-95"
                    >
                    <Redo2 size={18} strokeWidth={2} />
                    </button>
                    {canRedo && redoLabel && (
                        <div className="absolute top-full mt-3 left-1/2 -translate-x-1/2 px-2.5 py-1.5 bg-[#27272a] text-white text-[10px] font-medium rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none border border-white/10 shadow-xl z-50">
                            Redo: {redoLabel}
                            <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-[#27272a] border-t border-l border-white/10 rotate-45"></div>
                        </div>
                    )}
                </div>
             </div>
             
             {/* History Dropdown */}
             <div className="relative mr-1 border-r border-white/10 pr-1" ref={historyDropdownRef}>
                <button
                    onClick={() => setShowHistoryDropdown(!showHistoryDropdown)}
                    className={`p-2.5 rounded-xl transition-all active:scale-95 flex items-center gap-2 ${
                        showHistoryDropdown ? 'bg-white/10 text-white' : 'text-zinc-300 hover:bg-white/10 hover:text-white'
                    }`}
                >
                    <History size={18} strokeWidth={2} />
                </button>
                
                {showHistoryDropdown && (
                    <div className="absolute top-full mt-3 left-1/2 -translate-x-1/2 w-64 bg-[#1C1C1E] border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-150 origin-top">
                        <div className="px-3 py-2 bg-white/5 border-b border-white/5 flex justify-between items-center">
                            <span className="text-[10px] font-bold uppercase text-zinc-400 tracking-wider">Timeline</span>
                            <span className="text-[10px] text-zinc-600">{history.length} states</span>
                        </div>
                        <div className="max-h-60 overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-700 p-1">
                            {history.slice().reverse().map((item, reverseIndex) => {
                                const actualIndex = history.length - 1 - reverseIndex;
                                const isCurrent = actualIndex === historyIndex;
                                const isFuture = actualIndex > historyIndex;
                                
                                return (
                                    <button
                                        key={item.id}
                                        onClick={() => {
                                            onJumpToHistory(actualIndex);
                                            setShowHistoryDropdown(false);
                                        }}
                                        className={`w-full text-left px-3 py-2 rounded-lg text-xs flex items-center gap-3 transition-colors ${
                                            isCurrent 
                                                ? 'bg-brand-500/10 text-brand-400 border border-brand-500/20' 
                                                : isFuture
                                                    ? 'text-zinc-500 hover:bg-white/5'
                                                    : 'text-zinc-300 hover:bg-white/5'
                                        }`}
                                    >
                                        <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                            isCurrent ? 'bg-brand-500' : isFuture ? 'bg-zinc-700' : 'bg-zinc-500'
                                        }`} />
                                        <div className="flex-1 min-w-0">
                                            <p className={`truncate font-medium ${isFuture && 'line-through opacity-50'}`}>
                                                {item.action}
                                            </p>
                                            <p className="text-[9px] opacity-50">
                                                {new Date(item.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'})}
                                            </p>
                                        </div>
                                        {isCurrent && <Check size={12} className="text-brand-500" />}
                                    </button>
                                );
                            })}
                        </div>
                        <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-3 h-3 bg-[#1C1C1E] border-t border-l border-white/10 rotate-45"></div>
                    </div>
                )}
             </div>

             {/* Export Dropdown */}
             <div className="relative" ref={exportMenuRef}>
                 <button
                    onClick={() => setShowExportMenu(!showExportMenu)}
                    disabled={isGenerating}
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-white rounded-xl transition-all font-semibold text-sm disabled:opacity-50 active:scale-95 shadow-lg shadow-emerald-900/20"
                 >
                    <Download size={16} strokeWidth={2.5} />
                    <span>Download</span>
                    <ChevronDown size={14} className={`transition-transform duration-200 ${showExportMenu ? 'rotate-180' : ''}`} />
                 </button>

                 {showExportMenu && (
                     <div className="absolute top-full mt-3 right-0 w-72 bg-[#1C1C1E] border border-white/10 rounded-xl shadow-2xl p-4 z-50 animate-in fade-in zoom-in-95 duration-150 origin-top-right">
                         <h3 className="text-xs font-bold uppercase text-zinc-400 mb-4 tracking-wider">Export Settings</h3>
                         
                         <div className="space-y-4">
                             {/* Format Selection */}
                             <div className="space-y-2">
                                 <label className="text-xs text-zinc-300 flex items-center gap-2">
                                     <FileType size={12} /> Format
                                 </label>
                                 <div className="grid grid-cols-3 gap-2">
                                     {(['png', 'jpeg', 'webp'] as const).map(fmt => (
                                         <button
                                            key={fmt}
                                            onClick={() => setExportFormat(fmt)}
                                            className={`
                                                px-2 py-1.5 text-xs font-medium rounded-lg border transition-all uppercase
                                                ${exportFormat === fmt 
                                                    ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400' 
                                                    : 'bg-white/5 border-white/5 text-zinc-400 hover:bg-white/10'
                                                }
                                            `}
                                         >
                                             {fmt === 'jpeg' ? 'JPG' : fmt}
                                         </button>
                                     ))}
                                 </div>
                             </div>

                             {/* Quality Slider (for JPG/WEBP) */}
                             {exportFormat !== 'png' ? (
                                 <div className="space-y-2">
                                     <div className="flex justify-between items-center text-xs text-zinc-300">
                                         <span className="flex items-center gap-2"><Gauge size={12} /> Quality</span>
                                         <span className="text-emerald-400 font-medium">{Math.round(exportQuality * 100)}%</span>
                                     </div>
                                     <input 
                                         type="range" 
                                         min="0.1" 
                                         max="1.0" 
                                         step="0.05"
                                         value={exportQuality}
                                         onChange={(e) => setExportQuality(parseFloat(e.target.value))}
                                         className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                                     />
                                 </div>
                             ) : (
                                 /* Lossless UI for PNG */
                                 <div className="space-y-2">
                                     <div className="flex justify-between items-center text-xs text-zinc-300">
                                         <span className="flex items-center gap-2"><Gauge size={12} /> Quality</span>
                                         <span className="text-emerald-400 font-medium">Lossless</span>
                                     </div>
                                     <div className="w-full h-8 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-center justify-center">
                                         <span className="text-[10px] font-medium text-emerald-400 tracking-wide uppercase flex items-center gap-1.5">
                                             <Check size={10} strokeWidth={3} /> Maximum Quality
                                         </span>
                                     </div>
                                 </div>
                             )}
                             
                             {/* Size Estimation */}
                             <div className="bg-black/40 rounded-lg p-3 border border-white/5 flex justify-between items-center">
                                 <span className="text-xs text-zinc-500">Est. Size</span>
                                 <span className="text-xs font-mono text-zinc-300">
                                     {isCalculatingSize ? <span className="animate-pulse">...</span> : estimatedSize || '-'}
                                 </span>
                             </div>

                             {/* Download Button */}
                             <button
                                 onClick={handleExportClick}
                                 className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-semibold shadow-lg shadow-emerald-900/20 transition-all active:scale-95"
                             >
                                 Save as .{exportFormat === 'jpeg' ? 'jpg' : exportFormat}
                             </button>
                         </div>
                         <div className="absolute -top-1 right-8 w-3 h-3 bg-[#1C1C1E] border-t border-l border-white/10 rotate-45"></div>
                     </div>
                 )}
             </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12 overflow-hidden">
        {currentImage ? (
          <div className="relative w-full max-w-full lg:max-w-5xl aspect-video rounded-3xl shadow-2xl ring-1 ring-white/10 group bg-black overflow-hidden min-h-[200px]">
            
            {/* Blurred Background Layer for 16:9 Fill */}
            <div className="absolute inset-0 z-0">
                <img 
                    src={currentImage} 
                    alt="Background" 
                    className="w-full h-full object-cover blur-3xl scale-110 opacity-40 brightness-50"
                />
                <div className="absolute inset-0 bg-black/20" />
            </div>

            {/* Main Image Container */}
            <div 
                className={`relative w-full h-full group/image ${isSelectionMode ? 'cursor-crosshair' : ''}`}
                onMouseDown={handleMouseDown}
            >
                <img 
                  ref={imageRef}
                  src={currentImage} 
                  alt="Current Thumbnail" 
                  onClick={() => !isSelectionMode && setShowLightbox(true)}
                  draggable={false}
                  className={`relative z-10 w-full h-full object-contain transition-transform duration-300 ${!isSelectionMode && 'cursor-zoom-in'}`}
                />

                {/* Selection Overlay & Popup */}
                {selectedRegion && imageRef.current && (() => {
                     const img = imageRef.current;
                     const rect = img.getBoundingClientRect();
                     const imageRatio = img.naturalWidth / img.naturalHeight;
                     const containerRatio = rect.width / rect.height;

                     let renderWidth = rect.width;
                     let renderHeight = rect.height;
                     let offsetX = 0;
                     let offsetY = 0;

                     if (containerRatio > imageRatio) {
                         renderWidth = rect.height * imageRatio;
                         offsetX = (rect.width - renderWidth) / 2;
                     } else {
                         renderHeight = rect.width / imageRatio;
                         offsetY = (rect.height - renderHeight) / 2;
                     }

                     // Selection Box Coordinates (Relative to Container)
                     const selX = offsetX + (selectedRegion.x * renderWidth);
                     const selY = offsetY + (selectedRegion.y * renderHeight);
                     const selW = selectedRegion.width * renderWidth;
                     const selH = selectedRegion.height * renderHeight;

                     const selectionStyle: React.CSSProperties = {
                         left: selX,
                         top: selY,
                         width: selW,
                         height: selH
                     };
                     
                     // --- POPUP LOGIC ---
                     const MIN_POPUP_WIDTH = 260;
                     const POPUP_HEIGHT = 64; // Approx height of input + margins (increased to prevent clip)
                     const MARGIN = 12;
                     
                     // Target Width
                     // Use min width, but stretch if selection is wider, up to container max
                     let popupW = Math.max(MIN_POPUP_WIDTH, selW);
                     popupW = Math.min(popupW, rect.width - (MARGIN * 2)); // Constrain to container

                     // Target X (Centered on selection)
                     let popupX = selX + (selW / 2) - (popupW / 2);
                     
                     // Clamp X to container
                     popupX = Math.max(MARGIN, Math.min(popupX, rect.width - popupW - MARGIN));
                     
                     // Target Y (Below or Above)
                     // Try below first
                     let popupY = selY + selH + MARGIN;
                     let showBelow = true;
                     
                     // If fits below? (considering footer space etc)
                     if (popupY + POPUP_HEIGHT > rect.height) {
                        // Try above
                        popupY = selY - POPUP_HEIGHT - MARGIN;
                        showBelow = false;
                     }
                     
                     // Final Clamp Y to ensure it is never cut off (even if it means overlapping selection)
                     popupY = Math.max(MARGIN, Math.min(popupY, rect.height - POPUP_HEIGHT - MARGIN));

                     const promptStyle: React.CSSProperties = {
                         left: popupX,
                         top: popupY,
                         width: popupW,
                     };
                     
                     // Arrow Logic
                     // Arrow points to center of selection
                     // Relative to Popup Box
                     const arrowTargetX = (selX + selW / 2) - popupX;
                     // Clamp arrow to within popup radius
                     const arrowSafeX = Math.max(16, Math.min(arrowTargetX, popupW - 16));
                     
                     const arrowStyle: React.CSSProperties = {
                        left: arrowSafeX,
                        // Top/Bottom handled by class logic based on showBelow
                     };

                     return (
                         <>
                            {/* The Selection Box */}
                            <div 
                                className="absolute z-30 pointer-events-none"
                                style={selectionStyle}
                            >
                                <div className="absolute inset-0 border-[3px] border-blue-500 bg-blue-500/10 pointer-events-none shadow-[0_0_15px_rgba(59,130,246,0.5)] rounded-lg">
                                    {/* Clear Selection Button */}
                                    <button
                                        onMouseDown={(e) => {
                                            e.stopPropagation();
                                            onRegionChange && onRegionChange(null);
                                        }}
                                        className="absolute -top-3 -right-3 bg-red-500 text-white rounded-full p-1 shadow-sm hover:scale-110 transition-transform pointer-events-auto z-40"
                                        title="Clear Selection"
                                    >
                                        <X size={10} strokeWidth={3} />
                                    </button>
                                    <div className="absolute -top-3 left-2 bg-blue-500 text-white text-[9px] px-1.5 py-0.5 font-bold tracking-wider rounded-full shadow-sm">
                                        EDIT REGION
                                    </div>
                                    
                                    {/* Resize Handles */}
                                    <div 
                                        className="absolute top-0 left-0 w-4 h-4 -translate-x-1/2 -translate-y-1/2 bg-white border-2 border-blue-500 rounded-full cursor-nw-resize pointer-events-auto shadow-sm hover:scale-110 transition-transform z-50"
                                        onMouseDown={(e) => handleResizeStart(e, 'tl')}
                                    />
                                    <div 
                                        className="absolute top-0 right-0 w-4 h-4 translate-x-1/2 -translate-y-1/2 bg-white border-2 border-blue-500 rounded-full cursor-ne-resize pointer-events-auto shadow-sm hover:scale-110 transition-transform z-50"
                                        onMouseDown={(e) => handleResizeStart(e, 'tr')}
                                    />
                                    <div 
                                        className="absolute bottom-0 left-0 w-4 h-4 -translate-x-1/2 translate-y-1/2 bg-white border-2 border-blue-500 rounded-full cursor-sw-resize pointer-events-auto shadow-sm hover:scale-110 transition-transform z-50"
                                        onMouseDown={(e) => handleResizeStart(e, 'bl')}
                                    />
                                    <div 
                                        className="absolute bottom-0 right-0 w-4 h-4 translate-x-1/2 translate-y-1/2 bg-white border-2 border-blue-500 rounded-full cursor-se-resize pointer-events-auto shadow-sm hover:scale-110 transition-transform z-50"
                                        onMouseDown={(e) => handleResizeStart(e, 'br')}
                                    />
                                </div>
                            </div>

                            {/* Popup Prompt Input - Sibling to selection, positioned nicely */}
                            {!isDrawing && !isGenerating && (
                                <div 
                                    className="absolute pointer-events-auto z-50 animate-in fade-in slide-in-from-top-1 duration-200"
                                    style={promptStyle}
                                    onMouseDown={(e) => e.stopPropagation()} 
                                >
                                    <form onSubmit={handleRegionPromptSubmit} className="flex gap-1.5 p-1.5 bg-[#1C1C1E] border border-white/10 rounded-xl shadow-2xl shadow-black/80 ring-1 ring-white/5 relative z-10">
                                        <input
                                            type="text"
                                            value={regionPrompt}
                                            onChange={(e) => setRegionPrompt(e.target.value)}
                                            placeholder="Ask AI to edit this area..."
                                            className="flex-1 bg-transparent text-xs text-white placeholder-zinc-500 px-3 py-2 outline-none min-w-0 font-medium"
                                            autoFocus
                                        />
                                        <button 
                                            type="submit"
                                            disabled={!regionPrompt.trim()}
                                            className="bg-blue-600 hover:bg-blue-500 text-white p-2 rounded-lg transition-colors disabled:opacity-50 disabled:bg-white/5"
                                        >
                                            <Send size={12} fill="currentColor" />
                                        </button>
                                    </form>
                                    {/* Arrow */}
                                    <div 
                                        className="absolute w-3 h-3 bg-[#1C1C1E] border-white/10 transform rotate-45 z-0"
                                        style={{
                                            ...arrowStyle,
                                            top: showBelow ? -6 : undefined,
                                            bottom: !showBelow ? -6 : undefined,
                                            borderTop: showBelow ? '1px solid' : 'none',
                                            borderLeft: showBelow ? '1px solid' : 'none',
                                            borderRight: !showBelow ? '1px solid' : 'none',
                                            borderBottom: !showBelow ? '1px solid' : 'none',
                                        }}
                                    />
                                </div>
                            )}
                         </>
                     );
                })()}
                
                {/* Popup Hint on Hover (Only if not in Selection Mode) */}
                {!isSelectionMode && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none opacity-0 group-hover/image:opacity-100 transition-opacity duration-300">
                        <div className="bg-black/60 backdrop-blur-sm px-3 py-1.5 rounded-full flex items-center gap-2 text-white/90 text-xs font-medium border border-white/10 translate-y-4 group-hover/image:translate-y-0 transition-transform">
                            <ZoomIn size={14} />
                            <span>Click to expand</span>
                        </div>
                    </div>
                )}
            </div>
            
            {/* MINI GAME OVERLAY (Analysis Phase) */}
            {isAnalyzing && (
                <div className="absolute inset-0 z-50 bg-[#0D0D0D] border-4 border-black">
                    <MiniGame />
                </div>
            )}
            
            {/* 8-BIT EDITING ANIMATION (Generation Phase - ONLY if not analyzing) */}
            {isGenerating && !isAnalyzing && (
              <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 backdrop-blur-sm cursor-default">
                  <EditingAnimation />
              </div>
            )}

            {/* Hover helper for replacing image manually */}
            {!isGenerating && !feedbackAction && !isSelectionMode && (
              <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-all duration-300 z-20 translate-y-2 group-hover:translate-y-0">
                <label className="cursor-pointer bg-black/60 hover:bg-black/80 text-white px-4 py-2.5 rounded-xl backdrop-blur-md flex items-center gap-2 text-xs font-medium border border-white/10 shadow-xl transition-colors">
                    <Upload size={14} />
                    <span>Replace Base</span>
                    <input type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
                </label>
              </div>
            )}
            
            {/* Helper text for Selection Mode */}
            {isSelectionMode && !selectedRegion && (
                 <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-blue-600 px-5 py-2.5 rounded-full text-white text-xs font-bold border border-white/20 shadow-xl animate-bounce z-40 pointer-events-none">
                     Click and drag to select an area
                 </div>
            )}
          </div>
        ) : (
          /* Empty State / Upload Area */
          <div className="flex flex-col items-center justify-center w-full">
            <div className="text-center w-full max-w-md animate-in fade-in zoom-in-95 duration-500">
                <label 
                className={`
                    block relative cursor-pointer
                    border border-dashed rounded-[2rem] p-10 lg:p-14
                    transition-all duration-300 group
                    ${isDragging 
                    ? 'border-blue-500 bg-blue-500/10 scale-105' 
                    : 'border-white/10 hover:border-white/20 hover:bg-white/5'
                    }
                `}
                >
                <input 
                    type="file" 
                    className="hidden" 
                    accept="image/*"
                    onChange={handleFileChange}
                />
                
                <div className="flex flex-col items-center gap-6">
                    <div className={`
                        w-20 h-20 rounded-3xl flex items-center justify-center shadow-2xl transition-all duration-300
                        ${isDragging ? 'bg-blue-500 text-white rotate-12 scale-110' : 'bg-[#1C1C1E] text-zinc-400 ring-1 ring-white/10 group-hover:scale-110 group-hover:text-white group-hover:ring-white/20'}
                    `}>
                        {isDragging ? <Upload size={36} /> : <ImageIcon size={36} strokeWidth={1.5} />}
                    </div>
                    
                    <div>
                        <h3 className="text-xl font-semibold text-white mb-2">
                            {isDragging ? 'Drop it here' : 'Start Creating'}
                        </h3>
                        <p className="text-zinc-500 text-sm leading-relaxed">
                            Drag and drop your thumbnail here, <br/> or click to browse files.
                        </p>
                    </div>
                    
                    <span className="text-xs font-medium text-zinc-600 bg-white/5 px-3 py-1 rounded-full border border-white/5">
                        PNG, JPG, WEBP
                    </span>
                    
                    {/* Auto-Analyze Toggle */}
                    {onToggleAutoAnalyze && (
                        <div 
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                onToggleAutoAnalyze();
                            }}
                            className="flex items-center gap-2 mt-2 cursor-pointer group/toggle p-2 hover:bg-white/5 rounded-lg transition-colors"
                        >
                            <div className={`w-9 h-5 rounded-full p-0.5 transition-colors duration-300 ${autoAnalyzeEnabled ? 'bg-brand-500' : 'bg-zinc-700'}`}>
                                <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-300 ${autoAnalyzeEnabled ? 'translate-x-4' : ''}`} />
                            </div>
                            <div className="flex items-center gap-1.5">
                                <Sparkles size={12} className={autoAnalyzeEnabled ? 'text-brand-400' : 'text-zinc-500'} />
                                <span className={`text-xs font-medium ${autoAnalyzeEnabled ? 'text-zinc-300' : 'text-zinc-500'}`}>Auto-Analyze with AI</span>
                            </div>
                        </div>
                    )}
                </div>
                </label>
            </div>

            {/* Template Selector */}
            <div className="mt-8 w-full max-w-2xl flex flex-col items-center animate-in slide-in-from-bottom-4 duration-500 delay-100">
                <button
                    onClick={(e) => {
                        e.preventDefault();
                        setShowTemplates(!showTemplates);
                    }}
                    className={`
                        flex items-center gap-2 px-6 py-3 rounded-full text-xs font-medium transition-all duration-300 border relative overflow-hidden group/btn
                        ${selectedTemplateId 
                            ? 'bg-zinc-800 text-white border-zinc-700 shadow-lg shadow-black/50' 
                            : 'bg-[#1C1C1E] text-zinc-300 border-white/10 hover:border-brand-500/50 hover:text-white hover:shadow-lg hover:shadow-brand-900/20'
                        }
                    `}
                >
                    {selectedTemplateId ? (
                        <>
                            <div className="p-1 rounded bg-brand-500/20 text-brand-400">
                                {React.createElement(TEMPLATES.find(t => t.id === selectedTemplateId)?.icon || LayoutTemplate, { size: 12 })}
                            </div>
                            <span className="text-zinc-300">Using: <span className="text-white font-semibold">{TEMPLATES.find(t => t.id === selectedTemplateId)?.label}</span></span>
                            <div 
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedTemplateId(null);
                                }}
                                className="ml-1.5 p-0.5 hover:bg-white/20 rounded-full transition-colors text-zinc-500 hover:text-white"
                            >
                                <X size={12} />
                            </div>
                        </>
                    ) : (
                        <>
                            <LayoutTemplate size={14} className="text-brand-400 group-hover/btn:scale-110 transition-transform" />
                            <span className="text-zinc-200 font-medium">Select Style Template</span>
                            <span className="text-zinc-500 ml-1 group-hover/btn:text-zinc-400 transition-colors">(Optional)</span>
                            <ChevronDown size={12} className={`transition-transform duration-300 ${showTemplates ? 'rotate-180' : ''} opacity-50`} />
                        </>
                    )}
                </button>

                <div className={`
                    flex gap-3 px-4 mt-4 w-full overflow-x-auto pb-4 scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent snap-x
                    transition-all duration-500 ease-[cubic-bezier(0.25,1,0.5,1)] origin-top
                    ${showTemplates ? 'max-h-96 opacity-100 scale-100' : 'max-h-0 opacity-0 scale-95'}
                `}>
                    {TEMPLATES.map(t => {
                        const isSelected = selectedTemplateId === t.id;
                        return (
                            <button 
                                key={t.id}
                                disabled={isGenerating}
                                onClick={() => {
                                    if (isGenerating) return;
                                    const newId = selectedTemplateId === t.id ? null : t.id;
                                    setSelectedTemplateId(newId);
                                    
                                    // Trigger AI generation if selecting (not deselecting) and image exists
                                    if (newId && currentImage && onSendEdit) {
                                        onSendEdit(t.prompt);
                                    }
                                }}
                                className={`
                                    group relative flex-shrink-0 w-44 p-3 rounded-xl border text-left transition-all duration-200 active:scale-95 snap-center
                                    disabled:opacity-50 disabled:cursor-not-allowed
                                    ${isSelected 
                                        ? `bg-[#1C1C1E] ${t.border.replace('group-hover:', '')} ring-1 ring-inset ${t.color.replace('text', 'ring')}` 
                                        : `bg-transparent border-white/5 hover:bg-[#1C1C1E] hover:border-white/10`
                                    }
                                `}
                            >
                                <div className="flex items-center gap-3 mb-2">
                                    <div className={`
                                        p-2 rounded-lg transition-colors
                                        ${isSelected ? t.bg.replace('group-hover:', '') : 'bg-white/5 group-hover:bg-white/10'}
                                    `}>
                                        <t.icon size={16} className={isSelected ? t.color : 'text-zinc-400 group-hover:text-white'} />
                                    </div>
                                    <span className={`text-xs font-semibold ${isSelected ? 'text-white' : 'text-zinc-400 group-hover:text-white'}`}>
                                        {t.label}
                                    </span>
                                </div>
                                <p className="text-[10px] text-zinc-600 font-medium pl-1 line-clamp-2">
                                    {t.desc}
                                </p>
                                {isSelected && (
                                    <div className="absolute top-2 right-2">
                                        <Check size={12} className={t.color} strokeWidth={3} />
                                    </div>
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ImageArea;