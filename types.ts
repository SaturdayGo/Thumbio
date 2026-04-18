
export interface Message {
  id: string;
  role: 'user' | 'model' | 'system'; // Added system for log messages
  text: string;
  imageUrl?: string; // If the message includes a generated/uploaded image
  suggestions?: string[]; // AI analysis suggestions
  timestamp: number;
}

export interface ThumbnailState {
  currentImage: string | null; // Base64 or Blob URL
  history: string[]; // For undo/redo
  historyIndex: number;
  isUploading: boolean;
  isGenerating: boolean;
}

export interface EditLogEntry {
  id: string;
  timestamp: number;
  action: string; // e.g., "Generated", "Undo", "Upload"
  details?: string; // e.g., "Added a cat", "Reverted changes"
}

export interface HistoryItem {
  id: string;
  thumbnail: string;
  action: string; // e.g., "Initial Upload", "Blue Sky", etc.
  timestamp: number;
}

export interface Folder {
  id: string;
  name: string;
  timestamp: number;
}

export interface Project {
  id: string;
  name: string;
  thumbnail: string; // Base64
  timestamp: number;
  editLog: EditLogEntry[];
  folderId?: string; // Optional: ID of the folder this project belongs to
  // Persistence for state restoration - making these robust
  history?: HistoryItem[];
  historyIndex?: number;
  messages?: Message[];
}

export interface Region {
  x: number; // Normalized 0-1
  y: number; // Normalized 0-1
  width: number; // Normalized 0-1
  height: number; // Normalized 0-1
}

// Add global window extension for AI Studio API Key selection
declare global {
  // Augment the existing AIStudio interface to include the methods we use.
  // The property window.aistudio is already declared elsewhere with type AIStudio.
  interface AIStudio {
    // Methods removed to avoid Duplicate identifier error as they are already defined in the environment
  }
}