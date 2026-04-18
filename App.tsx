import React, { useState, useCallback, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import ChatSidebar from './components/ChatSidebar';
import ImageArea from './components/ImageArea';
import ProjectsPanel from './components/ProjectsPanel';
import BatchProcessor from './components/BatchProcessor';
import { Message, Project, EditLogEntry, HistoryItem, Region, Folder } from './types';
import { editImageWithGemini, analyzeImage, chatWithGemini } from './services/geminiService';
import { getAllProjects, saveProjectToDB, deleteProjectFromDB, getAllFolders, saveFolderToDB, deleteFolderFromDB } from './services/db';
import { Zap, Loader2, Settings, LogOut, User as UserIcon, ChevronDown, Undo2, Redo2, Layers } from 'lucide-react';
import { PLACEHOLDER_THUMBNAIL } from './constants';

const App: React.FC = () => {
  // --- State ---
  // Project & Persistence
  const [projects, setProjects] = useState<Project[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [isProjectsLoading, setIsProjectsLoading] = useState(true);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);

  // Editor State
  const [currentImage, setCurrentImage] = useState<string | null>(null);
  const [autoAnalyzeEnabled, setAutoAnalyzeEnabled] = useState(true); // Default to true
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [selectedRegion, setSelectedRegion] = useState<Region | null>(null);
  
  // Layout State
  const [sidebarWidth, setSidebarWidth] = useState(400);
  const [isResizing, setIsResizing] = useState(false);
  
  // History now stores rich objects
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);

  // UI State
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [toast, setToast] = useState<{message: string, icon?: React.ReactNode} | null>(null);
  
  // Visual Feedback for Undo/Redo
  const [visualFeedback, setVisualFeedback] = useState<{ type: 'undo' | 'redo', label: string } | null>(null);

  // Refs for safe access inside async callbacks
  const historyRef = useRef(history);
  const historyIndexRef = useRef(historyIndex);
  const currentProjectIdRef = useRef(currentProjectId);
  const messagesRef = useRef(messages);
  
  // Ref to track the current generation ID for cancellation
  const generationIdRef = useRef(0);

  // Update refs whenever state changes
  useEffect(() => {
    historyRef.current = history;
    historyIndexRef.current = historyIndex;
  }, [history, historyIndex]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    currentProjectIdRef.current = currentProjectId;
  }, [currentProjectId]);

  // --- Effects ---
  
  // 1. Cleanup legacy localStorage to prevent QuotaExceededError
  useEffect(() => {
    try {
      if (localStorage.getItem('tubethumb_projects')) {
        console.log('Cleaning up legacy localStorage data...');
        localStorage.removeItem('tubethumb_projects');
      }
    } catch (e) {
      // Ignore errors if localStorage is blocked
    }
  }, []);

  // 2. Load projects and folders from IndexedDB on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        const [loadedProjects, loadedFolders] = await Promise.all([
             getAllProjects(),
             getAllFolders()
        ]);
        
        // Ensure all loaded projects have an editLog array (migration for existing projects)
        const projectsWithLog = loadedProjects.map(p => ({
            ...p,
            editLog: p.editLog || []
        }));
        
        setProjects(projectsWithLog);
        setFolders(loadedFolders);
      } catch (error) {
        console.error("Failed to load data from DB:", error);
      } finally {
        setIsProjectsLoading(false);
      }
    };
    loadData();
  }, []);

  // 3. Resizing Logic
  const startResizing = useCallback(() => setIsResizing(true), []);
  const stopResizing = useCallback(() => setIsResizing(false), []);

  const resize = useCallback(
    (mouseMoveEvent: MouseEvent) => {
        if (isResizing) {
            const newWidth = document.body.clientWidth - mouseMoveEvent.clientX;
            // Constraints: Min 300px, Max 50% of screen or 800px
            if (newWidth > 300 && newWidth < Math.min(800, document.body.clientWidth * 0.6)) {
                setSidebarWidth(newWidth);
            }
        }
    },
    [isResizing]
  );

  useEffect(() => {
    window.addEventListener("mousemove", resize);
    window.addEventListener("mouseup", stopResizing);
    return () => {
        window.removeEventListener("mousemove", resize);
        window.removeEventListener("mouseup", stopResizing);
    };
  }, [resize, stopResizing]);

  // --- Helpers ---

  const showToast = (message: string, icon?: React.ReactNode) => {
    setToast({ message, icon });
    setTimeout(() => setToast(null), 2500);
  };

  const showVisualFeedback = (type: 'undo' | 'redo', label: string) => {
      setVisualFeedback({ type, label });
      setTimeout(() => setVisualFeedback(null), 1500);
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
    });
  };

  const addToHistory = (image: string, action: string) => {
    const currentHist = historyRef.current;
    const currentIndex = historyIndexRef.current;

    // Slice history if we are in the middle of the stack
    const newHistory = currentHist.slice(0, currentIndex + 1);
    
    newHistory.push({
        id: uuidv4(),
        thumbnail: image,
        action: action,
        timestamp: Date.now()
    });
    
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
    
    // Manually sync refs for safety in batched calls (important for immediate chained edits)
    historyRef.current = newHistory;
    historyIndexRef.current = newHistory.length - 1;

    return { newHistory, newIndex: newHistory.length - 1 };
  };

  /**
   * Centralized function to update project state and persistence.
   */
  const updateProjectState = async (
      projectId: string, 
      updates: Partial<Project>,
      logEntry?: Omit<EditLogEntry, 'id' | 'timestamp'>
  ) => {
      setProjects(prev => {
          const projectIndex = prev.findIndex(p => p.id === projectId);
          if (projectIndex === -1) return prev;

          const existingProject = prev[projectIndex];
          
          const newLog: EditLogEntry[] = logEntry ? [
              {
                  id: uuidv4(),
                  timestamp: Date.now(),
                  action: logEntry.action,
                  details: logEntry.details
              },
              ...existingProject.editLog
          ] : existingProject.editLog;

          const updatedProject: Project = {
              ...existingProject,
              ...updates,
              timestamp: Date.now(),
              editLog: newLog
          };

          saveProjectToDB(updatedProject).catch(err => {
              console.error("Failed to save project state:", err);
          });

          const newProjects = [...prev];
          newProjects.splice(projectIndex, 1);
          return [updatedProject, ...newProjects];
      });
  };

  // --- Handlers ---

  const handleAnalyzeImage = async (imageOverride?: string, projectIdOverride?: string, styleContext?: string) => {
    const imgToAnalyze = imageOverride || currentImage;
    const activeProject = projectIdOverride || currentProjectId;

    if (!imgToAnalyze || !activeProject) return;
    
    // Increment generation ID
    const currentGenId = ++generationIdRef.current;
    setIsGenerating(true);
    setIsAnalyzing(true);
    
    // Add placeholder analysis message
    const tempId = uuidv4();
    const tempMsg: Message = {
        id: tempId,
        role: 'model',
        text: 'Analyzing your thumbnail for improvements...',
        timestamp: Date.now()
    };
    setMessages(prev => [...prev, tempMsg]);

    try {
        const analysis = await analyzeImage(imgToAnalyze, styleContext);
        
        if (currentGenId !== generationIdRef.current) return;
        
        setMessages(prev => {
            const filtered = prev.filter(m => m.id !== tempId);
            const analysisMsg: Message = {
                id: uuidv4(),
                role: 'model',
                text: analysis.critique,
                suggestions: analysis.suggestions,
                timestamp: Date.now()
            };
            const newMessages = [...filtered, analysisMsg];
            
            updateProjectState(activeProject, { messages: newMessages });
            
            return newMessages;
        });

    } catch (error: any) {
        console.error("Analysis Error:", error);
        
        if (currentGenId === generationIdRef.current) {
             const errorMsg: Message = {
                 id: uuidv4(),
                 role: 'model',
                 text: "Failed to analyze image. Please check your connection and try again.",
                 timestamp: Date.now()
             };
             setMessages(prev => [...prev.filter(m => m.id !== tempId), errorMsg]);
        }
    } finally {
        if (currentGenId === generationIdRef.current) {
            setIsGenerating(false);
            setIsAnalyzing(false);
        }
    }
  };

  const handleImageUpload = async (file: File, templateName?: string, templatePrompt?: string) => {
    try {
      const base64 = await fileToBase64(file);
      
      let projectId = currentProjectId;
      let projectToUpdate = projects.find(p => p.id === projectId);
      let isNewOrReset = false;
      let nextMessages: Message[] = [];
      
      if (!projectId) {
          // Case 1: Create new project
          projectId = uuidv4();
          isNewOrReset = true;
          
          const initialHistory = [{ id: uuidv4(), thumbnail: base64, action: 'Initial Upload', timestamp: Date.now() }];
          const initialMessages: Message[] = [{ 
            id: uuidv4(), 
            role: 'model', 
            text: templateName 
              ? `Project started with **${templateName}**! I'll help you create that look.` 
              : 'Project started! What would you like to change?', 
            timestamp: Date.now() 
          }];
          
          const newProject: Project = {
            id: projectId,
            name: `Project ${projects.length + 1}`,
            thumbnail: base64,
            timestamp: Date.now(),
            editLog: [{
                id: uuidv4(),
                timestamp: Date.now(),
                action: 'Created',
                details: templateName ? `Uploaded base image (${templateName})` : 'Initial upload'
            }],
            history: initialHistory,
            historyIndex: 0,
            messages: initialMessages
          };
          await saveProjectToDB(newProject);
          setProjects(prev => [newProject, ...prev]);
          setCurrentProjectId(projectId);
          
          setCurrentImage(base64);
          setHistory(initialHistory);
          historyRef.current = initialHistory; // Manual sync
          setHistoryIndex(0);
          historyIndexRef.current = 0; // Manual sync
          setMessages(initialMessages);
          nextMessages = initialMessages;

      } else if (projectToUpdate && (projectToUpdate.thumbnail === PLACEHOLDER_THUMBNAIL)) {
          // Case 2: Update placeholder
          isNewOrReset = true;
          const initialHistory = [{ id: uuidv4(), thumbnail: base64, action: 'Initial Upload', timestamp: Date.now() }];
          const initialMessages: Message[] = [{ 
            id: uuidv4(), 
            role: 'model', 
            text: templateName 
              ? `Image uploaded. I'll analyze it for the **${templateName}** style.` 
              : 'Image uploaded. Ready for your instructions!', 
            timestamp: Date.now() 
          }];

          const updatedProject: Project = {
              ...projectToUpdate,
              name: `Project ${projects.length}`,
              thumbnail: base64,
              timestamp: Date.now(),
              editLog: [{
                id: uuidv4(),
                timestamp: Date.now(),
                action: 'Initialized',
                details: templateName ? `Uploaded base image (${templateName})` : 'Uploaded base image'
            }, ...projectToUpdate.editLog],
            history: initialHistory,
            historyIndex: 0,
            messages: initialMessages
          };
          
          await saveProjectToDB(updatedProject);
          setProjects(prev => prev.map(p => p.id === projectId ? updatedProject : p));
          
          setCurrentImage(base64);
          setHistory(initialHistory);
          historyRef.current = initialHistory; // Manual sync
          setHistoryIndex(0);
          historyIndexRef.current = 0; // Manual sync
          setMessages(initialMessages);
          nextMessages = initialMessages;
      } else {
          // Case 3: Replace
          setCurrentImage(base64);
          const { newHistory, newIndex } = addToHistory(base64, 'Replaced Image');
          
          const systemMsg: Message = {
            id: uuidv4(),
            role: 'system',
            text: templateName 
              ? `Base image replaced (Style: ${templateName})` 
              : 'Base image replaced with new upload',
            timestamp: Date.now()
          };
          const newMessages = [...messages, systemMsg];
          setMessages(newMessages);
          nextMessages = newMessages;

          await updateProjectState(projectId, {
              thumbnail: base64,
              history: newHistory,
              historyIndex: newIndex,
              messages: newMessages
          }, {
              action: 'Upload',
              details: templateName ? `Replaced base image (${templateName})` : 'Replaced base image'
          });

          showToast("Image replaced successfully");
      }

      // CRITICAL: Manually sync refs so immediate handleSendMessage calls see the new state
      if (projectId) currentProjectIdRef.current = projectId;
      messagesRef.current = nextMessages;

      // --- AUTO ACTION LOGIC ---
      if (templatePrompt) {
          // If a template is selected, we generate immediately (skip analysis)
          // Pass base64 directly as state might not be flushed
          handleSendMessage(templatePrompt, 'edit', base64);
      } else if (isNewOrReset && autoAnalyzeEnabled && projectId) {
          // Default: Auto-Analyze
          handleAnalyzeImage(base64, projectId, templatePrompt || templateName);
      }

    } catch (error) {
      console.error("Error reading file:", error);
      alert("Failed to read file. Please try again.");
    }
  };

  const handleSendMessage = useCallback(async (text: string, mode: 'edit' | 'chat', imageOverride?: string) => {
    const activeProjectId = currentProjectIdRef.current;
    if (!activeProjectId) return;
    if (!text.trim()) return;

    // Use override if provided (e.g. from immediate upload flow)
    const imgToUse = imageOverride || currentImage;

    if (mode === 'edit' && !imgToUse) return;

    const userMsg: Message = {
      id: uuidv4(),
      role: 'user',
      text: text,
      timestamp: Date.now()
    };
    
    const updatedMessages = [...messagesRef.current, userMsg];
    setMessages(updatedMessages);
    
    const currentGenId = ++generationIdRef.current;
    setIsGenerating(true);

    const regionToUse = selectedRegion;
    if (mode === 'edit') {
        setSelectedRegion(null);
    }

    try {
      if (mode === 'edit' && imgToUse) {
          const newImageData = await editImageWithGemini(imgToUse, text, regionToUse);
          
          if (currentGenId !== generationIdRef.current) {
            console.log("Generation canceled or superseded");
            return;
          }
          
          const newImageSrc = `data:image/png;base64,${newImageData}`;
          
          if (activeProjectId !== currentProjectIdRef.current) {
            console.log("Project switched during generation, discarding result.");
            return;
          }

          setCurrentImage(newImageSrc);
          const { newHistory, newIndex } = addToHistory(newImageSrc, text);

          const botMsg: Message = {
            id: uuidv4(),
            role: 'model',
            text: `I've updated the thumbnail based on: "${text}". How does it look?`,
            timestamp: Date.now()
          };
          const finalMessages = [...updatedMessages, botMsg];
          setMessages(finalMessages);

          await updateProjectState(activeProjectId, {
              thumbnail: newImageSrc,
              history: newHistory,
              historyIndex: newIndex,
              messages: finalMessages
          }, {
              action: 'Edit',
              details: text
          });

      } else {
          const responseText = await chatWithGemini(updatedMessages, text);

          if (currentGenId !== generationIdRef.current) return;

          const botMsg: Message = {
              id: uuidv4(),
              role: 'model',
              text: responseText,
              timestamp: Date.now()
          };
          const finalMessages = [...updatedMessages, botMsg];
          setMessages(finalMessages);

          await updateProjectState(activeProjectId, {
              messages: finalMessages
          });
      }

    } catch (error: any) {
      if (currentGenId !== generationIdRef.current) return;
      
      console.error("Gemini Error:", error);
      
      if (activeProjectId === currentProjectIdRef.current) {
        let errorMessage = `Sorry, I encountered an error: ${error.message || "Please try again."}`;
        
        if (error.message?.includes('502') || error.message?.includes('Failed to fetch')) {
             errorMessage = "Network error: Unable to reach the AI service. This might be a temporary connection issue.";
        } else if (error.message?.includes('SAFETY')) {
             errorMessage = "The generation was blocked by safety filters. Please try a different prompt.";
        } else if (error.message?.includes('401')) {
             errorMessage = "Authentication error: Please check your API key configuration.";
        }

        const errorMsg: Message = {
            id: uuidv4(),
            role: 'model',
            text: errorMessage,
            timestamp: Date.now()
        };
        const finalMessages = [...updatedMessages, errorMsg];
        setMessages(finalMessages);
        
        await updateProjectState(activeProjectId, {
            messages: finalMessages
        });
      }
    } finally {
      if (currentGenId === generationIdRef.current && activeProjectId === currentProjectIdRef.current) {
         setIsGenerating(false);
      }
    }
  }, [currentImage, selectedRegion]);
  
  const handleStopGeneration = useCallback(() => {
    generationIdRef.current++;
    setIsGenerating(false);
    setIsAnalyzing(false);
    
    const systemMsg: Message = {
        id: uuidv4(),
        role: 'system',
        text: 'Generation canceled',
        timestamp: Date.now()
    };
    
    setMessages(prev => {
        const newMessages = [...prev, systemMsg];
        if (currentProjectIdRef.current) {
             updateProjectState(currentProjectIdRef.current, { messages: newMessages });
        }
        return newMessages;
    });
    
    showToast("Generation canceled");
  }, []);

  const handleUndo = () => {
    if (historyIndex > 0 && currentProjectId) {
      const newIndex = historyIndex - 1;
      const prevItem = history[newIndex];
      const actionUndone = history[historyIndex].action;
      
      setHistoryIndex(newIndex);
      setCurrentImage(prevItem.thumbnail);
      setSelectedRegion(null);
      
      showVisualFeedback('undo', actionUndone);
      
      const systemMsg: Message = {
        id: uuidv4(),
        role: 'system',
        text: `Undid: ${actionUndone}`,
        timestamp: Date.now()
      };
      const newMessages = [...messages, systemMsg];
      setMessages(newMessages);

      updateProjectState(currentProjectId, {
          thumbnail: prevItem.thumbnail,
          historyIndex: newIndex,
          messages: newMessages
      }, {
          action: 'Undo',
          details: `Undid: ${actionUndone}`
      });

      showToast('Undo successful', <Undo2 size={16} className="text-zinc-400" />);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1 && currentProjectId) {
      const newIndex = historyIndex + 1;
      const nextItem = history[newIndex];
      const actionRedone = nextItem.action;

      setHistoryIndex(newIndex);
      setCurrentImage(nextItem.thumbnail);
      setSelectedRegion(null);
      
      showVisualFeedback('redo', actionRedone);

      const systemMsg: Message = {
        id: uuidv4(),
        role: 'system',
        text: `Redid: ${actionRedone}`,
        timestamp: Date.now()
      };
      const newMessages = [...messages, systemMsg];
      setMessages(newMessages);

      updateProjectState(currentProjectId, {
          thumbnail: nextItem.thumbnail,
          historyIndex: newIndex,
          messages: newMessages
      }, {
          action: 'Redo',
          details: `Redid: ${actionRedone}`
      });

      showToast('Redo successful', <Redo2 size={16} className="text-zinc-400" />);
    }
  };
  
  const handleJumpToHistory = (index: number) => {
      if (index < 0 || index >= history.length || !currentProjectId) return;
      
      const targetItem = history[index];
      const direction = index < historyIndex ? 'undo' : 'redo';
      
      setHistoryIndex(index);
      setCurrentImage(targetItem.thumbnail);
      setSelectedRegion(null);
      
      showVisualFeedback(direction, targetItem.action);
      
      const systemMsg: Message = {
        id: uuidv4(),
        role: 'system',
        text: `Jumped to: ${targetItem.action}`,
        timestamp: Date.now()
      };
      const newMessages = [...messages, systemMsg];
      setMessages(newMessages);

      updateProjectState(currentProjectId, {
          thumbnail: targetItem.thumbnail,
          historyIndex: index,
          messages: newMessages
      }, {
          action: 'History Jump',
          details: `Jumped to state: ${targetItem.action}`
      });
  };

  const handleDownload = (blob: Blob, fileName: string) => {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
    showToast('Export successful');
  };

  // --- PROJECT MANAGEMENT ---

  const handleNewProject = async (folderId?: string) => {
    const newId = uuidv4();
    const newProject: Project = {
        id: newId,
        name: "Untitled Project",
        thumbnail: PLACEHOLDER_THUMBNAIL,
        timestamp: Date.now(),
        folderId: folderId,
        editLog: [{
            id: uuidv4(),
            timestamp: Date.now(),
            action: 'Created',
            details: 'New empty project'
        }],
        history: [],
        historyIndex: -1,
        messages: []
    };

    try {
        await saveProjectToDB(newProject);
        setProjects(prev => [newProject, ...prev]);
        setCurrentProjectId(newId);
        
        setCurrentImage(null);
        setHistory([]);
        setHistoryIndex(-1);
        setMessages([]); 
        setIsGenerating(false);
        setIsAnalyzing(false);
        setSelectedRegion(null);
        showToast("New project created");
    } catch (e) {
        console.error("Failed to create new project", e);
    }
  };

  const handleLoadProject = (project: Project) => {
    if (project.id === currentProjectId) return;
    setCurrentProjectId(project.id);
    setIsGenerating(false);
    setIsAnalyzing(false);
    setSelectedRegion(null);
    generationIdRef.current++;

    if (!project.thumbnail || project.thumbnail === PLACEHOLDER_THUMBNAIL) {
        setCurrentImage(null);
        setHistory([]);
        setHistoryIndex(-1);
        setMessages([]);
    } else {
        setCurrentImage(project.thumbnail);
        
        if (project.history && project.history.length > 0) {
            setHistory(project.history);
            setHistoryIndex(project.historyIndex ?? project.history.length - 1);
        } else {
            const fallbackHistory = [{ 
                id: uuidv4(), 
                thumbnail: project.thumbnail, 
                action: 'Loaded Project', 
                timestamp: Date.now() 
            }];
            setHistory(fallbackHistory);
            setHistoryIndex(0);
        }

        if (project.messages && project.messages.length > 0) {
            setMessages(project.messages);
        } else {
            setMessages([{
                id: uuidv4(),
                role: 'system',
                text: `Loaded project "${project.name}"`,
                timestamp: Date.now(),
            }]);
        }
    }
  };

  const handleDeleteProject = async (id: string) => {
    try {
      await deleteProjectFromDB(id);
      setProjects(prev => prev.filter(p => p.id !== id));
      if (currentProjectId === id) {
        setCurrentImage(null);
        setHistory([]);
        setHistoryIndex(-1);
        setMessages([]);
        setCurrentProjectId(null);
        setSelectedRegion(null);
      }
      showToast("Project deleted");
    } catch (e) {
      console.error("Failed to delete project", e);
    }
  };

  const handleRenameProject = async (id: string, newName: string) => {
    setProjects(prev => prev.map(p => {
      if (p.id === id) {
        const updated = { ...p, name: newName };
        saveProjectToDB(updated).catch(console.error);
        return updated;
      }
      return p;
    }));
  };
  
  const handleMoveProject = async (projectId: string, folderId: string | undefined) => {
      setProjects(prev => prev.map(p => {
          if (p.id === projectId) {
              return { ...p, folderId: folderId };
          }
          return p;
      }));
      
      const project = projects.find(p => p.id === projectId);
      if (project) {
          const updated = { ...project, folderId: folderId };
          await saveProjectToDB(updated);
          showToast(`Moved to ${folderId ? 'folder' : 'projects'}`);
      }
  };

  // --- FOLDER MANAGEMENT ---

  const handleCreateFolder = async () => {
    const newFolder: Folder = {
        id: uuidv4(),
        name: "New Folder",
        timestamp: Date.now()
    };
    
    try {
        await saveFolderToDB(newFolder);
        setFolders(prev => [newFolder, ...prev]);
        showToast("Folder created");
    } catch (e) {
        console.error("Failed to create folder", e);
    }
  };

  const handleDeleteFolder = async (id: string) => {
      try {
          await deleteFolderFromDB(id);
          setFolders(prev => prev.filter(f => f.id !== id));
          
          const projectsToUpdate = projects.filter(p => p.folderId === id);
          if (projectsToUpdate.length > 0) {
              const updatedProjects = projectsToUpdate.map(p => ({ ...p, folderId: undefined }));
              
              setProjects(prev => prev.map(p => {
                  const updated = updatedProjects.find(up => up.id === p.id);
                  return updated || p;
              }));
              
              updatedProjects.forEach(p => saveProjectToDB(p));
          }
          
          showToast("Folder deleted");
      } catch (e) {
          console.error("Failed to delete folder", e);
      }
  };

  const handleRenameFolder = async (id: string, newName: string) => {
      setFolders(prev => prev.map(f => {
          if (f.id === id) {
              const updated = { ...f, name: newName };
              saveFolderToDB(updated).catch(console.error);
              return updated;
          }
          return f;
      }));
  };

  // --- Render ---

  if (isProjectsLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-black text-white">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
          <p className="text-zinc-500 font-light">Loading thumbio...</p>
        </div>
      </div>
    );
  }

  // Get current and next actions for tooltips
  const undoAction = historyIndex > 0 ? history[historyIndex].action : null;
  const redoAction = historyIndex < history.length - 1 ? history[historyIndex + 1].action : null;

  return (
    <div className="flex flex-col h-screen w-screen bg-black text-white font-sans overflow-hidden selection:bg-brand-500/30">
        {/* Toast Notification */}
        {toast && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] animate-in fade-in slide-in-from-bottom-4 duration-300 pointer-events-none">
            <div className="bg-[#1C1C1E] border border-white/10 shadow-2xl shadow-black/50 text-white px-4 py-2.5 rounded-full flex items-center gap-3 ring-1 ring-white/5">
               {toast.icon}
               <span className="text-sm font-medium">{toast.message}</span>
            </div>
          </div>
        )}

        {/* Header */}
        <header className="h-14 shrink-0 bg-[#09090b] border-b border-white/10 flex items-center px-4 justify-between z-50">
            {/* Left: Brand */}
            <div className="flex items-center gap-3 select-none">
                <div className="bg-gradient-to-br from-brand-600 to-brand-700 p-1.5 rounded-lg shadow-lg shadow-brand-900/20 ring-1 ring-white/10">
                    <Zap className="w-4 h-4 text-white fill-white" />
                </div>
                <h1 className="font-semibold text-lg tracking-tight text-white/90">thumbio</h1>
            </div>

            {/* Right: Profile */}
            <div className="flex items-center gap-4">
               <button 
                  onClick={() => setIsBatchMode(true)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm font-medium transition-colors border border-white/5"
               >
                  <Layers className="w-4 h-4 text-brand-500" />
                  <span>Batch Mode</span>
               </button>

               <div className="relative">
                  <button 
                    onClick={() => setShowProfileMenu(!showProfileMenu)}
                    className="flex items-center gap-2 pl-2 pr-1 py-1 rounded-full hover:bg-white/5 transition-colors group"
                  >
                     <img 
                       src="https://api.dicebear.com/9.x/avataaars/svg?seed=Felix" 
                       alt="Profile" 
                       className="w-7 h-7 rounded-full bg-zinc-800 ring-2 ring-black group-hover:ring-white/10 transition-all"
                     />
                     <ChevronDown className={`w-3.5 h-3.5 text-zinc-500 transition-transform duration-200 ${showProfileMenu ? 'rotate-180' : ''}`} />
                  </button>

                  {showProfileMenu && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowProfileMenu(false)} />
                      <div className="absolute right-0 top-full mt-2 w-56 bg-[#1C1C1E] border border-white/10 rounded-xl shadow-2xl py-1 z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                          <div className="px-4 py-3 border-b border-white/5">
                             <p className="text-sm font-medium text-white">Guest User</p>
                             <p className="text-xs text-zinc-500 mt-0.5">guest@thumbio.ai</p>
                          </div>
                          <div className="p-1">
                            <button className="w-full text-left px-3 py-2 text-sm text-zinc-300 hover:bg-white/5 hover:text-white rounded-lg flex items-center gap-2 transition-colors">
                               <Settings className="w-4 h-4" /> Settings
                            </button>
                             <button className="w-full text-left px-3 py-2 text-sm text-zinc-300 hover:bg-white/5 hover:text-white rounded-lg flex items-center gap-2 transition-colors">
                               <UserIcon className="w-4 h-4" /> Profile
                            </button>
                          </div>
                          <div className="border-t border-white/5 p-1">
                            <button className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 rounded-lg flex items-center gap-2 transition-colors">
                               <LogOut className="w-4 h-4" /> Sign out
                            </button>
                          </div>
                      </div>
                    </>
                  )}
               </div>
            </div>
        </header>

        {/* Main Content */}
        <div className="flex-1 flex flex-col min-h-0">
            {isBatchMode ? (
                <BatchProcessor onClose={() => setIsBatchMode(false)} />
            ) : (
              <>
            <div className="flex-1 flex flex-row min-h-0">
                
                {/* Editor Area (U) */}
                <main className="flex-1 relative bg-[#050505] min-w-0 overflow-hidden">
                    <ImageArea 
                        currentImage={currentImage}
                        onImageUpload={handleImageUpload}
                        onSendEdit={(text) => handleSendMessage(text, 'edit')}
                        isGenerating={isGenerating}
                        onUndo={handleUndo}
                        onRedo={handleRedo}
                        canUndo={historyIndex > 0}
                        canRedo={historyIndex < history.length - 1}
                        onDownload={handleDownload}
                        history={history}
                        historyIndex={historyIndex}
                        onJumpToHistory={handleJumpToHistory}
                        feedbackAction={visualFeedback}
                        undoLabel={undoAction}
                        redoLabel={redoAction}
                        onAnalyze={() => handleAnalyzeImage()}
                        autoAnalyzeEnabled={autoAnalyzeEnabled}
                        onToggleAutoAnalyze={() => setAutoAnalyzeEnabled(prev => !prev)}
                        key={currentProjectId || 'empty'}
                        isAnalyzing={isAnalyzing}
                        selectedRegion={selectedRegion}
                        onRegionChange={setSelectedRegion}
                    />
                    {isResizing && <div className="absolute inset-0 z-50 cursor-col-resize" />}
                </main>

                {/* Drag Handle */}
                <div
                    className={`w-1.5 -ml-0.5 relative z-40 cursor-col-resize hover:bg-brand-500 transition-colors flex items-center justify-center group ${isResizing ? 'bg-brand-500' : 'bg-[#09090b] border-l border-white/10'}`}
                    onMouseDown={startResizing}
                >
                     <div className={`h-8 w-1 rounded-full transition-colors ${isResizing ? 'bg-white' : 'bg-white/20 group-hover:bg-white/50'}`} />
                </div>

                {/* Chat Sidebar (C) */}
                <aside 
                    style={{ width: sidebarWidth }} 
                    className="shrink-0 bg-[#09090b] flex flex-col z-20 transition-[width] duration-0 ease-linear"
                >
                    <ChatSidebar 
                        messages={messages}
                        onSendMessage={handleSendMessage}
                        onStop={handleStopGeneration}
                        isGenerating={isGenerating}
                        hasImage={!!currentImage}
                    />
                </aside>
            </div>

            {/* Projects Panel (P) */}
            <section className="h-auto shrink-0 border-t border-white/10 bg-[#09090b] z-30">
                <ProjectsPanel 
                    projects={projects}
                    folders={folders}
                    onLoadProject={handleLoadProject}
                    onDeleteProject={handleDeleteProject}
                    onRenameProject={handleRenameProject}
                    onNewProject={handleNewProject}
                    onMoveProject={handleMoveProject}
                    onCreateFolder={handleCreateFolder}
                    onDeleteFolder={handleDeleteFolder}
                    onRenameFolder={handleRenameFolder}
                    currentProjectId={currentProjectId || undefined}
                />
            </section>
            </>
            )}
        </div>
    </div>
  );
};

export default App;