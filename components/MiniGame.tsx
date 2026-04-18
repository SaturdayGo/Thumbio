
import React, { useRef, useEffect, useState } from 'react';
import { Zap, Trophy, Play, MousePointerClick } from 'lucide-react';

const MiniGame: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // menu: Initial start screen
  // ready: Bird hovering, waiting for first tap
  // playing: Game active
  // gameover: Crashed
  const [gameState, setGameState] = useState<'menu' | 'ready' | 'playing' | 'gameover'>('menu');
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);

  // Game State Refs (for loop performance)
  const birdRef = useRef({ x: 50, y: 150, velocity: 0, radius: 14, rotation: 0 });
  const pipesRef = useRef<{ x: number; topHeight: number; passed: boolean }[]>([]);
  const starsRef = useRef<{ x: number; y: number; size: number; speed: number }[]>([]);
  const frameRef = useRef<number>(0);
  const scoreRef = useRef(0);
  const frameCountRef = useRef(0); // For sine wave hovering

  // Constants - Tuned for fun
  const GRAVITY = 0.25; 
  const JUMP = -5.5;
  const SPEED = 2.5;
  const PIPE_SPACING = 240; // More space between pipes
  const PIPE_GAP = 170;     // Wider gap for easier gameplay
  const PIPE_WIDTH = 52;

  const initStars = (width: number, height: number) => {
      const stars = [];
      for (let i = 0; i < 40; i++) {
          stars.push({
              x: Math.random() * width,
              y: Math.random() * height,
              size: Math.random() * 2 + 0.5,
              speed: Math.random() * 0.5 + 0.1
          });
      }
      starsRef.current = stars;
  };

  const resetGame = () => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    
    // Position bird
    birdRef.current = { 
        x: canvas.width / 3, 
        y: canvas.height / 2, 
        velocity: 0, 
        radius: 14,
        rotation: 0
    };
    
    pipesRef.current = [];
    scoreRef.current = 0;
    frameCountRef.current = 0;
    
    setScore(0);
    setGameState('ready');
  };

  const handleAction = () => {
      if (gameState === 'menu' || gameState === 'gameover') {
          resetGame();
      } else if (gameState === 'ready') {
          setGameState('playing');
          birdRef.current.velocity = JUMP;
      } else if (gameState === 'playing') {
          birdRef.current.velocity = JUMP;
      }
  };

  // Resize & Init using ResizeObserver to handle split-pane resizing
  useEffect(() => {
      if (!containerRef.current) return;

      const handleResize = () => {
          if (containerRef.current && canvasRef.current) {
              canvasRef.current.width = containerRef.current.clientWidth;
              canvasRef.current.height = containerRef.current.clientHeight;
              if (starsRef.current.length === 0) {
                  initStars(canvasRef.current.width, canvasRef.current.height);
              }
          }
      };

      const resizeObserver = new ResizeObserver(() => {
          handleResize();
      });

      resizeObserver.observe(containerRef.current);
      
      return () => {
          resizeObserver.disconnect();
      };
  }, []);

  // Controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        // Fix: Do not intercept spacebar if user is typing in an input or textarea
        const target = e.target as HTMLElement;
        const isTyping = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
        
        if (isTyping) {
            return;
        }

        if (e.code === 'Space') {
            e.preventDefault();
            handleAction();
        }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameState]);

  // Main Game Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const loop = () => {
        frameCountRef.current++;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // --- Draw Background (Stars) ---
        ctx.fillStyle = '#1a1a1c'; // Dark Zinc
        starsRef.current.forEach(star => {
            ctx.beginPath();
            ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
            ctx.fill();
            // Move stars
            if (gameState === 'playing' || gameState === 'ready') {
                star.x -= star.speed;
                if (star.x < 0) star.x = canvas.width;
            }
        });

        // --- Logic based on State ---
        
        if (gameState === 'ready') {
            // Hover Bird
            birdRef.current.y = (canvas.height / 2) + Math.sin(frameCountRef.current * 0.1) * 10;
            birdRef.current.rotation = 0;
        } 
        else if (gameState === 'playing') {
            // Update Bird Physics
            birdRef.current.velocity += GRAVITY;
            birdRef.current.y += birdRef.current.velocity;
            
            // Rotation based on velocity
            birdRef.current.rotation = Math.min(Math.PI / 4, Math.max(-Math.PI / 4, (birdRef.current.velocity * 0.1)));

            // Floor/Ceiling Collision
            if (birdRef.current.y + birdRef.current.radius > canvas.height || birdRef.current.y - birdRef.current.radius < 0) {
                setGameState('gameover');
                return; // Stop loop
            }

            // Pipe Logic
            // Add new pipe
            if (pipesRef.current.length === 0 || canvas.width - pipesRef.current[pipesRef.current.length - 1].x >= PIPE_SPACING) {
                const minPipeHeight = 50;
                const maxPipeHeight = canvas.height - PIPE_GAP - minPipeHeight;
                const randomHeight = Math.floor(Math.random() * (maxPipeHeight - minPipeHeight + 1)) + minPipeHeight;
                pipesRef.current.push({ x: canvas.width, topHeight: randomHeight, passed: false });
            }

            // Move & Remove Pipes
            for (let i = pipesRef.current.length - 1; i >= 0; i--) {
                const pipe = pipesRef.current[i];
                pipe.x -= SPEED;

                // Remove off-screen
                if (pipe.x + PIPE_WIDTH < 0) {
                    pipesRef.current.splice(i, 1);
                    continue;
                }

                // Collision Detection
                // Check X range
                if (
                    birdRef.current.x + birdRef.current.radius - 4 > pipe.x && 
                    birdRef.current.x - birdRef.current.radius + 4 < pipe.x + PIPE_WIDTH
                ) {
                    // Check Y range (Hit Top Pipe OR Hit Bottom Pipe)
                    if (
                        birdRef.current.y - birdRef.current.radius + 4 < pipe.topHeight || 
                        birdRef.current.y + birdRef.current.radius - 4 > pipe.topHeight + PIPE_GAP
                    ) {
                        setGameState('gameover');
                        return;
                    }
                }

                // Score
                if (!pipe.passed && birdRef.current.x > pipe.x + PIPE_WIDTH) {
                    pipe.passed = true;
                    scoreRef.current += 1;
                    setScore(scoreRef.current);
                }
            }
        }

        // --- Draw Pipes ---
        pipesRef.current.forEach(pipe => {
            const gradient = ctx.createLinearGradient(pipe.x, 0, pipe.x + PIPE_WIDTH, 0);
            gradient.addColorStop(0, '#ef4444'); // Red-500
            gradient.addColorStop(0.5, '#f87171'); // Red-400
            gradient.addColorStop(1, '#dc2626'); // Red-600
            
            ctx.fillStyle = gradient;
            ctx.strokeStyle = '#7f1d1d'; // Red-900
            ctx.lineWidth = 2;

            // Top Pipe
            ctx.fillRect(pipe.x, 0, PIPE_WIDTH, pipe.topHeight);
            ctx.strokeRect(pipe.x, -2, PIPE_WIDTH, pipe.topHeight + 2); // -2 to hide top border
            
            // Bottom Pipe
            const bottomPipeY = pipe.topHeight + PIPE_GAP;
            ctx.fillRect(pipe.x, bottomPipeY, PIPE_WIDTH, canvas.height - bottomPipeY);
            ctx.strokeRect(pipe.x, bottomPipeY, PIPE_WIDTH, canvas.height - bottomPipeY + 2);

            // Caps
            ctx.fillStyle = '#991b1b'; // Darker cap
            ctx.fillRect(pipe.x - 2, pipe.topHeight - 10, PIPE_WIDTH + 4, 10);
            ctx.fillRect(pipe.x - 2, bottomPipeY, PIPE_WIDTH + 4, 10);
        });

        // --- Draw Bird ---
        ctx.save();
        ctx.translate(birdRef.current.x, birdRef.current.y);
        ctx.rotate(birdRef.current.rotation);
        
        // Body
        ctx.beginPath();
        ctx.arc(0, 0, birdRef.current.radius, 0, Math.PI * 2);
        ctx.fillStyle = '#FBBF24'; // Amber-400
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#FFF';
        ctx.stroke();

        // Eye
        ctx.beginPath();
        ctx.arc(6, -4, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#FFF';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(8, -4, 1.5, 0, Math.PI * 2);
        ctx.fillStyle = '#000';
        ctx.fill();

        // Wing
        ctx.beginPath();
        ctx.ellipse(-2, 2, 6, 4, 0.2, 0, Math.PI * 2);
        ctx.fillStyle = '#F59E0B'; // Amber-500
        ctx.fill();

        // Beak
        ctx.beginPath();
        ctx.moveTo(8, 2);
        ctx.lineTo(16, 6);
        ctx.lineTo(8, 10);
        ctx.fillStyle = '#F97316'; // Orange-500
        ctx.fill();

        ctx.restore();

        // Loop
        if (gameState !== 'gameover') {
            frameRef.current = requestAnimationFrame(loop);
        }
    };

    frameRef.current = requestAnimationFrame(loop);

    return () => cancelAnimationFrame(frameRef.current);
  }, [gameState]);

  useEffect(() => {
      if (score > highScore) setHighScore(score);
  }, [score, highScore]);

  // Click handler wrapper
  const handleWrapperClick = (e: React.MouseEvent | React.TouchEvent) => {
      e.stopPropagation(); // Prevent bubbling to image editor underneath
      handleAction();
  };

  return (
    <div 
        ref={containerRef} 
        onClick={handleWrapperClick}
        onTouchStart={handleWrapperClick}
        className="relative w-full h-full bg-[#0D0D0D] overflow-hidden rounded-3xl cursor-pointer select-none"
    >
      <canvas ref={canvasRef} className="block w-full h-full" />
      
      {/* HUD */}
      <div className="absolute top-6 left-0 right-0 flex justify-center pointer-events-none z-20">
          <div className="flex gap-12 bg-black/30 backdrop-blur-md px-6 py-2 rounded-full border border-white/5">
              <div className="flex flex-col items-center">
                  <span className="text-[9px] uppercase text-zinc-400 font-bold tracking-widest">Score</span>
                  <span className="text-2xl font-bold text-white font-mono leading-none">{score}</span>
              </div>
              <div className="flex flex-col items-center">
                  <span className="text-[9px] uppercase text-zinc-400 font-bold tracking-widest">Best</span>
                  <span className="text-2xl font-bold text-brand-500 font-mono leading-none">{highScore}</span>
              </div>
          </div>
      </div>

      {/* Start Screen */}
      {gameState === 'menu' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm z-30 p-6 text-center animate-in fade-in">
              <div className="bg-brand-500 p-4 rounded-2xl mb-6 shadow-xl shadow-brand-900/40 ring-4 ring-brand-500/20 animate-pulse">
                  <Zap className="w-10 h-10 text-white fill-white" />
              </div>
              <h3 className="text-3xl font-bold text-white mb-2 tracking-tight">Analyzing...</h3>
              <p className="text-zinc-400 text-sm mb-8 font-medium">While we optimize your image, set a high score!</p>
              <button 
                className="flex items-center gap-3 bg-white text-black px-8 py-3 rounded-xl font-bold hover:bg-zinc-200 transition-all active:scale-95 shadow-xl group"
              >
                  <Play size={20} fill="currentColor" className="group-hover:translate-x-0.5 transition-transform" />
                  Play Game
              </button>
          </div>
      )}

      {/* Get Ready Screen */}
      {gameState === 'ready' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center z-20 pointer-events-none">
              <div className="mt-32 flex flex-col items-center animate-bounce">
                  <MousePointerClick className="w-8 h-8 text-white/80 mb-2" />
                  <p className="text-white font-bold text-lg drop-shadow-md">Tap or Space to Fly</p>
              </div>
          </div>
      )}

      {/* Game Over Screen */}
      {gameState === 'gameover' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 backdrop-blur-md z-30 p-6 text-center animate-in zoom-in-95 duration-200">
              <h3 className="text-4xl font-black text-white mb-2 italic">CRASHED!</h3>
              <div className="flex items-center gap-3 mb-8 bg-white/5 px-6 py-3 rounded-2xl border border-white/10">
                  <Trophy size={20} className="text-brand-500" />
                  <span className="text-xl text-zinc-200 font-medium">Score: <span className="text-white font-bold">{score}</span></span>
              </div>
              <button 
                className="bg-brand-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-brand-500 transition-colors shadow-lg shadow-brand-900/30 w-full max-w-xs"
              >
                  Try Again
              </button>
              <p className="mt-6 text-xs text-zinc-500 animate-pulse font-medium">Still working on your thumbnail...</p>
          </div>
      )}
    </div>
  );
};

export default MiniGame;
