
import React, { useRef, useEffect, useState } from 'react';
import { Send, Bot, Loader2, Image as ImageIcon, History, Square, Sparkles, MessageSquare, X, Lightbulb, ChevronRight } from 'lucide-react';
import { Message } from '../types';

interface ChatSidebarProps {
  messages: Message[];
  onSendMessage: (text: string, mode: 'edit' | 'chat') => void;
  onStop?: () => void;
  isGenerating: boolean;
  hasImage: boolean;
}

const ChatSidebar: React.FC<ChatSidebarProps> = ({ 
  messages, 
  onSendMessage, 
  onStop,
  isGenerating,
  hasImage
}) => {
  const [inputText, setInputText] = useState('');
  const [lastPrompt, setLastPrompt] = useState(''); // Store last prompt for retyping
  const [mode, setMode] = useState<'edit' | 'chat'>('edit');
  const [dismissedSuggestionId, setDismissedSuggestionId] = useState<string | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
        textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [inputText]);

  // Reset mode to edit if image is uploaded and we were in chat state
  useEffect(() => {
      if (hasImage && messages.length === 1 && messages[0].text.includes('Ready')) {
          setMode('edit');
      }
  }, [hasImage, messages]);

  // Find the most recent message with suggestions
  const latestSuggestionMsg = [...messages].reverse().find(m => m.suggestions && m.suggestions.length > 0);
  const showSuggestions = latestSuggestionMsg && latestSuggestionMsg.id !== dismissedSuggestionId && latestSuggestionMsg.suggestions && latestSuggestionMsg.suggestions.length > 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const canSend = inputText.trim() && !isGenerating;
    const allowed = mode === 'chat' ? canSend : (canSend && hasImage);

    if (allowed) {
      setLastPrompt(inputText);
      onSendMessage(inputText, mode);
      setInputText('');
    }
  };

  const handleStopClick = (e: React.MouseEvent) => {
      e.preventDefault();
      if (onStop) {
          onStop();
          setInputText(lastPrompt);
      }
  };

  const handleSuggestionClick = (suggestion: string) => {
      onSendMessage(suggestion, 'edit');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit(e);
    }
  };

  return (
    <div className="flex flex-col h-full w-full">
      {/* Header */}
      <div className="p-4 border-b border-white/5 shrink-0 flex items-center justify-between bg-[#141414]">
        <div>
          <h2 className="text-sm font-semibold flex items-center gap-2 text-white">
            <Bot className="w-4 h-4 text-brand-500" />
            AI Editor
          </h2>
          <p className="text-[10px] uppercase tracking-wider font-medium text-zinc-500 mt-0.5">
            Gemini 2.5 Flash
          </p>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5 min-h-0 scroll-smooth bg-[#09090b]">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 opacity-60">
            <div className="bg-white/5 rounded-3xl w-20 h-20 flex items-center justify-center mb-4 ring-1 ring-white/10">
              <ImageIcon className="w-8 h-8 text-zinc-400" />
            </div>
            <p className="text-sm font-medium text-zinc-300 mb-1">No messages yet</p>
            <p className="text-xs text-zinc-500 max-w-[200px] mb-4">Upload an image to start refining your thumbnail with AI.</p>
          </div>
        )}
        
        {messages.map((msg) => {
          if (msg.role === 'system') {
            return (
              <div key={msg.id} className="flex justify-center my-4 animate-in fade-in zoom-in-95 duration-300">
                 <div className="bg-white/5 border border-white/5 text-zinc-400 text-[11px] px-3 py-1 rounded-full flex items-center gap-2 shadow-sm">
                   <History size={10} className="opacity-70" />
                   {msg.text}
                 </div>
              </div>
            );
          }

          return (
            <div 
              key={msg.id} 
              className={`flex flex-col gap-2 ${msg.role === 'user' ? 'items-end' : 'items-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}
            >
              <div 
                className={`max-w-[85%] rounded-2xl p-3.5 text-sm shadow-sm leading-relaxed ${
                  msg.role === 'user' 
                    ? 'bg-brand-600 text-white rounded-br-sm' 
                    : 'bg-[#1C1C1E] border border-white/5 text-zinc-200 rounded-bl-sm'
                }`}
              >
                <div className="flex items-center gap-2 mb-1.5 opacity-60 text-[10px] uppercase font-bold tracking-wide">
                   {msg.role === 'user' ? (
                     <><span>You</span></>
                   ) : (
                     <><Bot size={10} className="text-brand-400"/> <span>Assistant</span></>
                   )}
                </div>
                <p className="whitespace-pre-wrap">{msg.text}</p>
              </div>
            </div>
          );
        })}
        
        {isGenerating && (
          <div className="flex justify-start animate-pulse">
            <div className="bg-[#1C1C1E] border border-white/5 text-zinc-300 rounded-2xl rounded-bl-none px-4 py-3 flex items-center gap-3 shadow-sm">
               <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-500" />
               <span className="text-xs font-medium">Processing...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Suggestion Bar - MATCHING REQUESTED DESIGN */}
      {showSuggestions && (
        <div className="px-4 py-3 bg-[#09090b] border-t border-white/5 animate-in slide-in-from-bottom-2 fade-in duration-300">
             {/* Header */}
             <div className="flex items-center justify-between mb-3">
                 <div className="flex items-center gap-2 text-zinc-200 text-sm font-medium">
                     <Lightbulb size={16} className="text-zinc-400" />
                     <span>Suggestions</span>
                 </div>
                 <button 
                    onClick={() => setDismissedSuggestionId(latestSuggestionMsg.id)}
                    className="text-zinc-500 hover:text-white transition-colors"
                    title="Dismiss"
                 >
                     <X size={16} />
                 </button>
             </div>

             {/* Chip Row */}
             <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1 items-center">
                 {/* Static AI Features Chip - Special Design */}
                 <button 
                    className="shrink-0 whitespace-nowrap px-3 py-1.5 text-xs font-medium rounded-full bg-white text-zinc-900 border border-white flex items-center gap-1.5 hover:bg-zinc-200 transition-colors shadow-sm"
                 >
                     <Sparkles size={12} className="text-blue-500 fill-blue-500" />
                     AI Features
                 </button>

                 {latestSuggestionMsg.suggestions!.map((suggestion, idx) => (
                     <button
                        key={idx}
                        onClick={() => handleSuggestionClick(suggestion)}
                        disabled={isGenerating}
                        className="shrink-0 whitespace-nowrap px-3 py-1.5 text-xs font-medium rounded-full bg-transparent border border-white/15 text-zinc-300 hover:text-white hover:border-white/40 hover:bg-white/5 transition-all active:scale-95 disabled:opacity-50 flex items-center gap-1"
                     >
                         {suggestion}
                         <ChevronRight size={10} className="opacity-50" />
                     </button>
                 ))}
             </div>
        </div>
      )}

      {/* Input Area */}
      <div className={`p-4 ${!showSuggestions ? 'border-t border-white/5' : ''} bg-[#09090b] shrink-0`}>
        <form onSubmit={handleSubmit} className="flex gap-2 relative items-end">
          {/* Mode Switcher */}
          <div className="bg-black/40 border border-white/10 rounded-lg p-0.5 flex flex-col mb-1 shrink-0">
              <button
                  type="button"
                  onClick={() => setMode('edit')}
                  className={`p-1.5 rounded-md transition-all ${mode === 'edit' ? 'bg-brand-600 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
                  title="Image Editor Mode"
              >
                  <Sparkles size={16} />
              </button>
              <button
                  type="button"
                  onClick={() => setMode('chat')}
                  className={`p-1.5 rounded-md transition-all ${mode === 'chat' ? 'bg-blue-600 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
                  title="Chat Mode"
              >
                  <MessageSquare size={16} />
              </button>
          </div>
          
          <textarea
            ref={textareaRef}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
                mode === 'edit' 
                ? (hasImage ? "Describe your changes..." : "Upload an image first...") 
                : "Ask me anything..."
            }
            disabled={mode === 'edit' && !hasImage}
            rows={1}
            className="flex-1 bg-[#141414] border border-white/10 rounded-xl px-4 py-3.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-brand-500/50 focus:ring-1 focus:ring-brand-500/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-inner resize-none min-h-[46px] max-h-32 scrollbar-thin scrollbar-thumb-zinc-700"
          />
          <button
            type={isGenerating ? "button" : "submit"}
            onClick={isGenerating ? handleStopClick : undefined}
            disabled={(mode === 'edit' && !hasImage) || (!inputText.trim() && !isGenerating)}
            className={`
                mb-1 h-[38px] w-[38px] rounded-lg transition-all flex items-center justify-center shadow-lg shadow-brand-900/20 shrink-0
                ${isGenerating 
                    ? 'bg-zinc-700 hover:bg-zinc-600 text-white' 
                    : mode === 'edit'
                        ? 'bg-brand-600 hover:bg-brand-500 disabled:bg-white/10 disabled:text-zinc-600 text-white'
                        : 'bg-blue-600 hover:bg-blue-500 disabled:bg-white/10 disabled:text-zinc-600 text-white'
                }
            `}
            title={isGenerating ? "Stop generating" : "Send message"}
          >
            {isGenerating ? (
                <div className="relative flex items-center justify-center">
                     <Square className="w-3.5 h-3.5 fill-white animate-in zoom-in duration-300" />
                </div>
            ) : (
                <Send className="w-4 h-4 ml-0.5" />
            )}
          </button>
        </form>
        {mode === 'edit' && hasImage && <p className="text-[10px] text-zinc-600 mt-2 text-center">Press Enter to send, Shift + Enter for new line</p>}
      </div>
    </div>
  );
};

export default ChatSidebar;
