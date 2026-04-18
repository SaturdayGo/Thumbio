import React, { useState } from 'react';
import { Project, Folder } from '../types';
import { Trash2, Edit2, Clock, Image as ImageIcon, Plus, History, X, Folder as FolderIcon, FolderOpen, ArrowLeft, CornerUpLeft } from 'lucide-react';
import { PLACEHOLDER_THUMBNAIL } from '../constants';

interface ProjectsPanelProps {
  projects: Project[];
  folders: Folder[];
  onLoadProject: (project: Project) => void;
  onDeleteProject: (id: string) => void;
  onRenameProject: (id: string, newName: string) => void;
  onNewProject: (folderId?: string) => void;
  onMoveProject: (projectId: string, folderId: string | undefined) => void;
  
  onCreateFolder: () => void;
  onDeleteFolder: (id: string) => void;
  onRenameFolder: (id: string, newName: string) => void;
  
  currentProjectId?: string;
}

const ProjectsPanel: React.FC<ProjectsPanelProps> = ({
  projects,
  folders,
  onLoadProject,
  onDeleteProject,
  onRenameProject,
  onNewProject,
  onMoveProject,
  onCreateFolder,
  onDeleteFolder,
  onRenameFolder,
  currentProjectId,
}) => {
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [showHistoryId, setShowHistoryId] = useState<string | null>(null);
  
  // Drag and Drop State
  const [draggedProjectId, setDraggedProjectId] = useState<string | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);

  // Derived state
  const currentFolder = folders.find(f => f.id === currentFolderId);
  const visibleProjects = projects.filter(p => p.folderId === (currentFolderId || undefined));
  
  // In root view, show folders. In folder view, usually don't show nested folders (keeping it 1 level deep for now)
  const visibleFolders = currentFolderId ? [] : folders;

  const handleStartEdit = (item: Project | Folder, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(item.id);
    setEditName(item.name);
  };

  const handleSaveEdit = (id: string, type: 'project' | 'folder') => {
    if (editName.trim()) {
      if (type === 'project') {
          onRenameProject(id, editName.trim());
      } else {
          onRenameFolder(id, editName.trim());
      }
    }
    setEditingId(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent, id: string, type: 'project' | 'folder') => {
    if (e.key === 'Enter') {
      handleSaveEdit(id, type);
    }
  };

  const toggleHistory = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setShowHistoryId(prev => prev === id ? null : id);
  };

  // DnD Handlers
  const handleDragStart = (e: React.DragEvent, projectId: string) => {
      setDraggedProjectId(projectId);
      e.dataTransfer.setData('projectId', projectId);
      e.dataTransfer.effectAllowed = 'move';
      // Create a drag image if needed, or default is fine
  };

  const handleDragOver = (e: React.DragEvent, folderId: string | null) => {
      e.preventDefault();
      // Only allow dropping if we are dragging a project
      if (draggedProjectId) {
          setDragOverFolderId(folderId || 'root'); // 'root' for back button drop
          e.dataTransfer.dropEffect = 'move';
      }
  };

  const handleDragLeave = (e: React.DragEvent) => {
      e.preventDefault();
      setDragOverFolderId(null);
  };

  const handleDrop = (e: React.DragEvent, folderId: string | undefined) => {
      e.preventDefault();
      const projectId = e.dataTransfer.getData('projectId');
      if (projectId && projectId === draggedProjectId) {
          // Prevent dropping on self or same folder
          const project = projects.find(p => p.id === projectId);
          if (project && project.folderId !== folderId) {
             onMoveProject(projectId, folderId);
          }
      }
      setDraggedProjectId(null);
      setDragOverFolderId(null);
  };
  
  const handleDropOnRoot = (e: React.DragEvent) => {
      handleDrop(e, undefined); // undefined = root
  };

  return (
    <div className="h-full flex flex-col bg-[#09090b]">
      {/* Header */}
      <div className="px-6 py-2 border-b border-white/5 flex justify-between items-center bg-[#09090b]">
        <div className="flex items-center gap-4">
            {currentFolderId ? (
                <div 
                    className={`flex items-center gap-2 text-zinc-400 hover:text-white transition-colors cursor-pointer ${dragOverFolderId === 'root' ? 'bg-white/10 rounded px-2 -ml-2' : ''}`}
                    onClick={() => setCurrentFolderId(null)}
                    onDragOver={(e) => handleDragOver(e, null)}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDropOnRoot}
                >
                    <div className="bg-zinc-800 p-1 rounded-md">
                        <CornerUpLeft size={12} />
                    </div>
                    <span className="text-[11px] font-bold uppercase tracking-widest">Back to Folder</span>
                </div>
            ) : (
                <h3 className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">Folder</h3>
            )}
            
            <span className="text-[10px] text-zinc-700">|</span>
            
            <div className="flex items-center gap-2">
                <button 
                    onClick={() => onNewProject(currentFolderId || undefined)}
                    className="flex items-center gap-1.5 text-xs font-medium text-brand-400 hover:text-brand-300 transition-colors bg-brand-900/10 px-2 py-1 rounded-md border border-brand-500/10 hover:border-brand-500/30"
                    title="Create New Project"
                >
                    <Plus size={12} strokeWidth={3} />
                    Project
                </button>
                
                {!currentFolderId && (
                    <button 
                        onClick={onCreateFolder}
                        className="flex items-center gap-1.5 text-xs font-medium text-zinc-400 hover:text-white transition-colors bg-white/5 px-2 py-1 rounded-md border border-white/5 hover:bg-white/10"
                        title="Create New Folder"
                    >
                        <FolderIcon size={12} strokeWidth={3} />
                        Folder
                    </button>
                )}
            </div>
        </div>
        
        <div className="flex items-center gap-3">
             {currentFolderId && (
                 <div className="flex items-center gap-2 text-zinc-500 text-xs px-2 py-0.5 bg-white/5 rounded-full border border-white/5">
                     <FolderOpen size={10} />
                     <span className="font-medium text-zinc-300">{currentFolder?.name}</span>
                 </div>
             )}
             <span className="text-[11px] text-zinc-600 font-medium">
                 {visibleProjects.length} projects {visibleFolders.length > 0 && `• ${visibleFolders.length} folders`}
             </span>
        </div>
      </div>
      
      {/* List */}
      {(visibleProjects.length === 0 && visibleFolders.length === 0) ? (
        <div className="flex-1 flex flex-col items-center justify-center text-zinc-600 p-4">
            <div className="bg-white/5 p-4 rounded-full mb-3 ring-1 ring-white/5">
                {currentFolderId ? <FolderOpen className="w-5 h-5 opacity-40" /> : <ImageIcon className="w-5 h-5 opacity-40" />}
            </div>
            <p className="text-xs font-medium">
                {currentFolderId ? "This folder is empty." : "Your library is empty."}
            </p>
            {currentFolderId && (
                <button 
                    onClick={() => setCurrentFolderId(null)} 
                    className="mt-3 text-[10px] text-blue-400 hover:underline"
                >
                    Return to root
                </button>
            )}
        </div>
      ) : (
        <div className="flex-1 overflow-x-auto p-4 flex gap-4 overflow-y-hidden scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent items-center">
            
            {/* RENDER FOLDERS */}
            {visibleFolders.map(folder => (
                <div
                    key={folder.id}
                    onClick={() => setCurrentFolderId(folder.id)}
                    onDragOver={(e) => handleDragOver(e, folder.id)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, folder.id)}
                    className={`
                        group relative flex-shrink-0 w-32 h-32 md:w-40 md:h-40 bg-[#141415] border rounded-xl cursor-pointer transition-all duration-300 flex flex-col items-center justify-center
                        ${dragOverFolderId === folder.id ? 'border-brand-500 bg-brand-500/10 scale-105' : 'border-white/5 hover:border-white/20 hover:bg-white/5 hover:-translate-y-1'}
                    `}
                >
                    <div className="relative mb-2">
                        <FolderIcon 
                            size={40} 
                            className={`text-zinc-600 fill-zinc-800/50 group-hover:text-zinc-500 transition-colors ${dragOverFolderId === folder.id ? 'text-brand-500' : ''}`} 
                            strokeWidth={1}
                        />
                        {/* Project count badge */}
                        <div className="absolute -bottom-1 -right-2 bg-zinc-800 text-zinc-400 text-[9px] px-1.5 rounded-full border border-zinc-700 min-w-[18px] text-center">
                            {projects.filter(p => p.folderId === folder.id).length}
                        </div>
                    </div>
                    
                    {editingId === folder.id ? (
                        <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            onBlur={() => handleSaveEdit(folder.id, 'folder')}
                            onKeyDown={(e) => handleKeyDown(e, folder.id, 'folder')}
                            autoFocus
                            onClick={(e) => e.stopPropagation()}
                            className="w-24 bg-black text-white text-xs px-2 py-1 rounded border border-brand-500 outline-none text-center"
                        />
                    ) : (
                        <span className="text-xs font-medium text-zinc-400 group-hover:text-zinc-200 truncate max-w-[80%] text-center">
                            {folder.name}
                        </span>
                    )}

                    {/* Actions Overlay */}
                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                        <button
                            onClick={(e) => handleStartEdit(folder, e)}
                            className="p-1.5 rounded-md bg-black/50 hover:bg-white/20 text-zinc-400 hover:text-white backdrop-blur-sm"
                        >
                            <Edit2 size={10} />
                        </button>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                if (deleteConfirmId === folder.id) {
                                    onDeleteFolder(folder.id);
                                    setDeleteConfirmId(null);
                                } else {
                                    setDeleteConfirmId(folder.id);
                                    setTimeout(() => setDeleteConfirmId(prev => prev === folder.id ? null : prev), 3000);
                                }
                            }}
                            className={`p-1.5 rounded-md transition-all backdrop-blur-sm ${
                                deleteConfirmId === folder.id ? 'bg-red-600 text-white' : 'bg-black/50 hover:bg-red-500/20 text-zinc-400 hover:text-red-400'
                            }`}
                        >
                            <Trash2 size={10} />
                        </button>
                    </div>
                </div>
            ))}

            {/* RENDER PROJECTS */}
            {visibleProjects.map((project) => (
            <div 
                key={project.id}
                draggable
                onDragStart={(e) => handleDragStart(e, project.id)}
                onClick={() => onLoadProject(project)}
                className={`
                group relative flex-shrink-0 w-60 aspect-video bg-[#1C1C1E] border rounded-xl overflow-hidden cursor-pointer transition-all duration-300
                ${currentProjectId === project.id 
                    ? 'border-brand-500/50 ring-2 ring-brand-500/20 shadow-md shadow-black' 
                    : 'border-white/5 hover:border-white/20 hover:-translate-y-1'
                }
                ${draggedProjectId === project.id ? 'opacity-50' : ''}
                `}
            >
                {/* Thumbnail Preview */}
                <div className="w-full h-full relative flex items-center justify-center bg-black">
                {(!project.thumbnail || project.thumbnail === PLACEHOLDER_THUMBNAIL) ? (
                     <div className="w-full h-full bg-[#1C1C1E] flex items-center justify-center">
                         <div className="flex flex-col items-center gap-2 opacity-30">
                            <Plus className="w-8 h-8 text-zinc-500" />
                         </div>
                     </div>
                ) : (
                    <img 
                        src={project.thumbnail} 
                        alt={project.name} 
                        className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity duration-500"
                    />
                )}
                
                <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-80 pointer-events-none" />
                </div>

                {/* History Overlay */}
                {showHistoryId === project.id && (
                    <div className="absolute inset-0 bg-black/90 backdrop-blur-sm z-30 flex flex-col animate-in fade-in duration-200 cursor-default" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between p-2 border-b border-white/10">
                            <span className="text-[10px] font-bold uppercase text-zinc-400">Edit History</span>
                            <button 
                                onClick={(e) => toggleHistory(e, project.id)}
                                className="text-zinc-500 hover:text-white"
                            >
                                <X size={12} />
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-2 space-y-2 scrollbar-thin scrollbar-thumb-zinc-700">
                            {(!project.editLog || project.editLog.length === 0) ? (
                                <p className="text-[10px] text-zinc-600 text-center mt-4">No history available</p>
                            ) : (
                                project.editLog.map((log) => (
                                    <div key={log.id} className="flex flex-col gap-0.5 pb-2 border-b border-white/5 last:border-0">
                                        <div className="flex justify-between items-center">
                                            <span className="text-[10px] font-semibold text-brand-400">{log.action}</span>
                                            <span className="text-[9px] text-zinc-600">{new Date(log.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                                        </div>
                                        {log.details && (
                                            <p className="text-[9px] text-zinc-400 truncate leading-tight" title={log.details}>
                                                {log.details}
                                            </p>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}

                {/* Info Overlay */}
                <div className="absolute inset-x-0 bottom-0 p-3 pt-8 bg-gradient-to-t from-black/90 to-transparent">
                    <div className="flex justify-between items-end">
                        <div className="flex-1 mr-2 min-w-0">
                        {editingId === project.id ? (
                            <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            onBlur={() => handleSaveEdit(project.id, 'project')}
                            onKeyDown={(e) => handleKeyDown(e, project.id, 'project')}
                            autoFocus
                            onClick={(e) => e.stopPropagation()}
                            className="w-full bg-black text-white text-xs px-2 py-1 rounded border border-brand-500 outline-none"
                            />
                        ) : (
                            <div className="group/title flex items-center gap-2">
                            <h4 className="font-medium text-white text-xs truncate" title={project.name}>
                                {project.name}
                            </h4>
                            <button 
                                onClick={(e) => handleStartEdit(project, e)}
                                className="opacity-0 group-hover/title:opacity-100 text-zinc-400 hover:text-white transition-opacity"
                            >
                                <Edit2 size={10} />
                            </button>
                            </div>
                        )}
                        <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 mt-1">
                            <Clock size={10} />
                            <span>{new Date(project.timestamp).toLocaleDateString()}</span>
                        </div>
                        </div>
                        
                        <div className="flex items-center gap-1">
                             <button
                                onClick={(e) => toggleHistory(e, project.id)}
                                className={`p-2 rounded-full transition-all backdrop-blur-md z-20 ${
                                    showHistoryId === project.id 
                                    ? 'bg-brand-500 text-white' 
                                    : 'bg-white/5 hover:bg-white/20 text-zinc-400 hover:text-brand-300 opacity-0 group-hover:opacity-100'
                                }`}
                                title="View History"
                            >
                                <History size={12} strokeWidth={2} />
                            </button>

                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (deleteConfirmId === project.id) {
                                        onDeleteProject(project.id);
                                        setDeleteConfirmId(null);
                                    } else {
                                        setDeleteConfirmId(project.id);
                                        setTimeout(() => setDeleteConfirmId(prev => prev === project.id ? null : prev), 3000);
                                    }
                                }}
                                className={`p-2 rounded-full transition-all backdrop-blur-md z-20 ${
                                    deleteConfirmId === project.id
                                    ? 'bg-red-600 text-white opacity-100 scale-110 shadow-lg shadow-red-900/50'
                                    : 'bg-white/5 hover:bg-red-500/20 text-zinc-400 hover:text-red-400 opacity-0 group-hover:opacity-100'
                                }`}
                                title={deleteConfirmId === project.id ? "Click again to delete" : "Delete"}
                            >
                                <Trash2 size={12} strokeWidth={deleteConfirmId === project.id ? 2.5 : 2} />
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            ))}
        </div>
      )}
    </div>
  );
};

export default ProjectsPanel;