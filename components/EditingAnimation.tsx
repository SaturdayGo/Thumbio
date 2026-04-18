import React from 'react';

const EditingAnimation: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center p-8 bg-black/80 backdrop-blur-md rounded-3xl border border-white/10 shadow-2xl animate-in fade-in zoom-in-95 duration-300">
      <div className="relative w-32 h-24 mb-4">
        {/* Pixel Art Dino (SVG for crispness) */}
        <svg
          viewBox="0 0 24 24"
          className="w-16 h-16 absolute left-1/2 -translate-x-1/2 bottom-0 animate-bounce"
          style={{ animationDuration: '0.6s' }}
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M20 9H16V6H13V4H16V2H11V4H9V6H7V8H5V10H3V16H5V18H7V20H9V18H11V20H13V18H15V14H18V12H20V9Z"
            fill="#10B981" // Emerald-500
          />
          <path d="M12 5H13V6H12V5Z" fill="white" /> {/* Eye */}
        </svg>

        {/* Floating Paintbrush */}
        <div className="absolute top-0 right-0 animate-pulse">
          <svg
            viewBox="0 0 24 24"
            className="w-8 h-8 text-brand-400"
            fill="currentColor"
            style={{ transform: 'rotate(15deg)' }}
          >
            <path d="M7 14c-1.66 0-3 1.34-3 3 0 1.31-1.16 2-2 2 .92 1.22 2.49 2 4 2 2.21 0 4-1.79 4-4 0-1.66-1.34-3-3-3zm13.71-9.37l-1.34-1.34c-.39-.39-1.02-.39-1.41 0L9 11.25 12.75 15l8.96-8.96c.39-.39.39-1.02 0-1.41z" />
          </svg>
        </div>

        {/* Sparkles */}
        <div className="absolute top-8 left-0 animate-ping" style={{ animationDuration: '1s' }}>
          <svg viewBox="0 0 24 24" className="w-4 h-4 text-yellow-400" fill="currentColor">
            <path d="M12 2l2.4 7.2h7.6l-6 4.8 2.4 7.2-6-4.8-6 4.8 2.4-7.2-6-4.8h7.6z" />
          </svg>
        </div>
        <div className="absolute bottom-4 right-4 animate-ping" style={{ animationDuration: '1.5s', animationDelay: '0.2s' }}>
           <svg viewBox="0 0 24 24" className="w-3 h-3 text-blue-400" fill="currentColor">
            <path d="M12 2l2.4 7.2h7.6l-6 4.8 2.4 7.2-6-4.8-6 4.8 2.4-7.2-6-4.8h7.6z" />
          </svg>
        </div>
      </div>

      <div className="text-center">
        <h3 className="text-xl font-bold text-white mb-1 font-mono tracking-tight">
          PIXEL MAGIC
        </h3>
        <div className="flex items-center gap-2 justify-center">
            <span className="w-2 h-2 bg-brand-500 rounded-full animate-bounce" style={{ animationDelay: '0s' }}/>
            <span className="w-2 h-2 bg-brand-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}/>
            <span className="w-2 h-2 bg-brand-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}/>
        </div>
        <p className="text-xs text-zinc-400 mt-2 font-mono uppercase">
          AI is painting...
        </p>
      </div>
    </div>
  );
};

export default EditingAnimation;