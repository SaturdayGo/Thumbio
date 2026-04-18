import React, { useState, useCallback } from 'react';
import { Upload, X, Loader2, Download, Image as ImageIcon, CheckCircle, Zap, Scissors, Wand2 } from 'lucide-react';
import { editImageWithGemini } from '../services/geminiService';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

export interface BatchItem {
  id: string;
  file: File;
  preview: string;
  status: 'pending' | 'processing' | 'done' | 'error';
  result?: string;
  error?: string;
}

interface BatchProcessorProps {
  onClose: () => void;
}

const CUTOUT_PROMPT = "Isolate ONLY the central main product (e.g., tail light). Completely remove ALL surrounding background, shadows, tables, tools, wires, and debris. Make the background absolute pure white (#FFFFFF).";

const autoCropAndCenter = async (base64Data: string, mimeType: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('Canvas ctx error'));
      
      ctx.drawImage(img, 0, 0);
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imgData.data;
      
      let minX = canvas.width, minY = canvas.height, maxX = 0, maxY = 0;
      
      for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < canvas.width; x++) {
          const i = (y * canvas.width + x) * 4;
          const r = data[i];
          const g = data[i+1];
          const b = data[i+2];
          const a = data[i+3];
          
          // Define threshold for "white"
          const isWhiteOrTransparent = (a < 10) || (r > 240 && g > 240 && b > 240 && a > 240);
          
          if (!isWhiteOrTransparent) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
      
      // If image is purely white or empty
      if (minX > maxX || minY > maxY) {
        minX = 0; maxX = canvas.width; minY = 0; maxY = canvas.height;
      }
      
      const bboxWidth = maxX - minX + 1;
      const bboxHeight = maxY - minY + 1;
      
      // Create final 1:1 canvas
      const maxDim = Math.max(bboxWidth, bboxHeight);
      
      // Add 10% margin
      const finalDim = Math.floor(maxDim * 1.1);
      
      const finalCanvas = document.createElement('canvas');
      finalCanvas.width = finalDim;
      finalCanvas.height = finalDim;
      const finalCtx = finalCanvas.getContext('2d');
      if (!finalCtx) return reject(new Error('Final canvas error'));
      
      finalCtx.fillStyle = '#FFFFFF';
      finalCtx.fillRect(0, 0, finalDim, finalDim);
      
      const drawX = (finalDim - bboxWidth) / 2;
      const drawY = (finalDim - bboxHeight) / 2;
      
      finalCtx.drawImage(img, minX, minY, bboxWidth, bboxHeight, drawX, drawY, bboxWidth, bboxHeight);
      
      resolve(finalCanvas.toDataURL('image/jpeg', 0.95).split(',')[1]);
    };
    img.onerror = () => reject(new Error('Failed to load image for crop'));
    img.src = `data:${mimeType};base64,${base64Data}`;
  });
};

const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = error => reject(error);
  });
};

const BatchProcessor: React.FC<BatchProcessorProps> = ({ onClose }) => {
  const [items, setItems] = useState<BatchItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [mode, setMode] = useState<'cutout' | 'custom'>('cutout');
  const [prompt, setPrompt] = useState('');
  const [dragActive, setDragActive] = useState(false);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFiles(Array.from(e.dataTransfer.files));
    }
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(Array.from(e.target.files));
    }
  };

  const addFiles = (files: File[]) => {
    const imageFiles = files.filter(f => f.type.startsWith('image/'));
    
    const newItems = imageFiles.map(file => ({
      id: Math.random().toString(36).substring(7),
      file,
      preview: URL.createObjectURL(file),
      status: 'pending' as const
    }));

    setItems(prev => [...prev, ...newItems].slice(0, 20));
  };

  const processAll = async () => {
    if (items.length === 0) return;
    if (mode === 'custom' && !prompt.trim()) return;
    
    setIsProcessing(true);

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.status === 'done') continue;

      setItems(prev => prev.map(p => p.id === item.id ? { ...p, status: 'processing' } : p));

      try {
        let base64 = "";
        let mimeType = "";
        let finalResult = "";

        if (mode === 'cutout') {
          // Send original aspect ratio heavily optimized prompt to Gemini
          base64 = await fileToBase64(item.file);
          mimeType = item.file.type;
          const b64Data = base64.split(',')[1] || base64;
          const rawResult = await editImageWithGemini(b64Data, CUTOUT_PROMPT, null, mimeType);
          
          // Perform auto crop & rescale locally
          finalResult = await autoCropAndCenter(rawResult, mimeType);
          mimeType = 'image/jpeg';
        } else {
          // Standard original ratio processing
          base64 = await fileToBase64(item.file);
          mimeType = item.file.type;
          const b64Data = base64.split(',')[1] || base64;
          finalResult = await editImageWithGemini(b64Data, prompt, null, mimeType);
        }
        
        setItems(prev => prev.map(p => p.id === item.id ? { 
          ...p, 
          status: 'done',
          result: `data:${mimeType};base64,${finalResult}`
        } : p));
      } catch (error: any) {
        setItems(prev => prev.map(p => p.id === item.id ? { 
          ...p, 
          status: 'error',
          error: error.message || 'Error processing image'
        } : p));
      }
      
      // Delay to avoid hitting rate limits
      if (i < items.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    setIsProcessing(false);
  };

  const removeItem = (id: string) => {
    setItems(prev => prev.filter(p => {
      if (p.id === id) URL.revokeObjectURL(p.preview);
      return p.id !== id;
    }));
  };

  const downloadAll = async () => {
    const doneItems = items.filter(i => i.status === 'done' && i.result);
    if (doneItems.length === 0) return;

    const zip = new JSZip();
    
    doneItems.forEach((item, i) => {
      if (item.result) {
        const base64Data = item.result.split(',')[1];
        const ext = item.file.name.split('.').pop() || 'jpg';
        const name = `processed_${mode}_${i + 1}.${ext}`;
        zip.file(name, base64Data, { base64: true });
      }
    });

    const content = await zip.generateAsync({ type: 'blob' });
    saveAs(content, `batch_images_${mode}.zip`);
  };

  const doneCount = items.filter(i => i.status === 'done').length;

  return (
    <div className="flex flex-col h-full bg-[#050505] text-white overflow-hidden p-6 relative">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <ImageIcon className="text-brand-500" />
          Batch Image Processor
        </h2>
        <button onClick={onClose} className="p-2 hover:bg-zinc-800 rounded-lg transition-colors">
          <X size={20} className="text-zinc-400 hover:text-white" />
        </button>
      </div>

      <div className="flex gap-6 h-full min-h-0">
        <div className="w-1/3 flex flex-col gap-4">
          <div 
            className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${dragActive ? 'border-brand-500 bg-brand-500/10' : 'border-zinc-800 hover:border-zinc-700 bg-zinc-900/50'}`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <Upload size={32} className="mx-auto text-zinc-500 mb-4" />
            <p className="text-sm text-zinc-400 mb-4">Drag and drop up to 20 images here</p>
            <label className="bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2 rounded-lg cursor-pointer transition-colors text-sm">
              Select Files
              <input type="file" multiple accept="image/*" className="hidden" onChange={handleFileInput} disabled={isProcessing} />
            </label>
          </div>

          <div className="flex-1 bg-zinc-900/40 border border-white/5 rounded-xl block p-4 shadow-xl flex flex-col min-h-0">
             <div className="flex-1 overflow-y-auto pr-2 space-y-3">
               {items.map(item => (
                 <div key={item.id} className="bg-zinc-900 border border-white/10 rounded-lg p-3 flex gap-4 items-center group relative overflow-hidden">
                    <img src={item.result || item.preview} alt="" className="w-16 h-16 object-cover rounded shadow-md border border-white/10 bg-black/50" />
                    <div className="flex flex-col min-w-0 pr-8">
                       <span className="text-sm font-medium text-white/90 truncate">{item.file.name}</span>
                       <div className="mt-1.5 flex items-center gap-1.5">
                         {item.status === 'pending' && <span className="text-xs text-zinc-500 bg-zinc-800 rounded px-1.5 py-0.5">Pending</span>}
                         {item.status === 'processing' && <span className="text-xs text-brand-400 bg-brand-500/10 rounded px-1.5 py-0.5 flex items-center gap-1"><Loader2 size={10} className="animate-spin" /> Processing</span>}
                         {item.status === 'done' && <span className="text-xs text-emerald-400 bg-emerald-500/10 rounded px-1.5 py-0.5 flex items-center gap-1"><CheckCircle size={10} /> Done</span>}
                         {item.status === 'error' && <span className="text-xs text-red-400 bg-red-500/10 rounded px-1.5 py-0.5" title={item.error}>Error</span>}
                       </div>
                    </div>
                    {!isProcessing && (
                      <button onClick={() => removeItem(item.id)} className="absolute right-3 opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-500/20 text-red-400 rounded-md transition-all">
                        <X size={14} />
                      </button>
                    )}
                 </div>
               ))}
               {items.length === 0 && (
                 <div className="h-full flex flex-col items-center justify-center text-zinc-500 text-sm italic">
                    No images added yet
                 </div>
               )}
             </div>
          </div>
        </div>

        <div className="w-2/3 flex flex-col gap-6">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
             <div className="flex items-center gap-4 mb-4 border-b border-zinc-800 pb-4">
                <button 
                  onClick={() => setMode('cutout')}
                  disabled={isProcessing}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-colors ${mode === 'cutout' ? 'bg-brand-500/10 text-brand-400 border border-brand-500/50' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 border border-transparent'}`}
                >
                   <Scissors size={16} /> Strict 1:1 Subject Cutout
                </button>
                <button 
                  onClick={() => setMode('custom')}
                  disabled={isProcessing}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-colors ${mode === 'custom' ? 'bg-brand-500/10 text-brand-400 border border-brand-500/50' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 border border-transparent'}`}
                >
                   <Wand2 size={16} /> Custom Edit (Keep Ratio)
                </button>
             </div>
             
             {mode === 'custom' ? (
                 <textarea 
                   value={prompt}
                   onChange={e => setPrompt(e.target.value)}
                   placeholder="Describe the desired effect for all images. Original aspect ratio and resolution will be strictly preserved."
                   className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-4 text-white placeholder-zinc-500 resize-none h-28 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-colors"
                   disabled={isProcessing}
                 />
             ) : (
                 <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-5 h-28 flex flex-col justify-center">
                    <p className="text-zinc-300 text-sm leading-relaxed">
                       <strong className="text-brand-400">Cutout Mode Requirements Active:</strong><br/>
                       1. Center subject is strictly preserved (100% no modifications).<br/>
                       2. Output is padded and clipped perfectly to a 1:1 Ratio (Square).<br/>
                       3. Background noise entirely replaced with a pure White (#FFFFFF) canvas.
                    </p>
                 </div>
             )}
             
             <div className="flex gap-4 mt-6">
                <button 
                  onClick={processAll} 
                  disabled={isProcessing || items.length === 0 || (mode === 'custom' && !prompt.trim())}
                  className="flex-1 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:hover:bg-brand-600 text-white py-3 rounded-xl font-medium flex justify-center items-center gap-2 transition-colors shadow-lg shadow-brand-500/20"
                >
                  {isProcessing ? <><Loader2 className="animate-spin" size={18} /> Processing...</> : <><Zap size={18} /> Process Batch</>}
                </button>

                <button 
                  onClick={downloadAll} 
                  disabled={doneCount === 0 || isProcessing}
                  className="bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 disabled:hover:bg-zinc-800 text-white px-6 py-3 rounded-xl font-medium flex justify-center items-center gap-2 transition-colors"
                >
                  <Download size={18} /> Download Finished
                </button>
             </div>
          </div>

          <div className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl p-6 flex flex-col">
             <h3 className="text-lg font-medium mb-4">Preview</h3>
             <div className="flex-1 flex flex-wrap gap-4 overflow-y-auto content-start">
                {items.filter(i => i.status === 'done' || i.status === 'processing').map(item => (
                  <div key={item.id} className={`w-1/4 min-w-[150px] relative bg-black rounded-lg border border-white/10 overflow-hidden flex items-center justify-center ${mode === 'cutout' ? 'aspect-square' : 'aspect-video'}`}>
                    {item.result ? (
                      <img src={item.result} className="w-full h-full object-contain" />
                    ) : (
                       <div className="flex flex-col items-center text-brand-500">
                          <Loader2 size={24} className="animate-spin mb-2" />
                          <span className="text-xs font-medium">Processing...</span>
                       </div>
                    )}
                  </div>
                ))}
                {items.filter(i => i.status === 'done' || i.status === 'processing').length === 0 && (
                  <div className="w-full h-full flex items-center justify-center text-zinc-500 italic text-sm">
                    Processed images will appear here
                  </div>
                )}
             </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BatchProcessor;
