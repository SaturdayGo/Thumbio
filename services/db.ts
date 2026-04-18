import { Project, Folder } from '../types';

const DB_NAME = 'TubeThumbDB';
const PROJECT_STORE = 'projects';
const FOLDER_STORE = 'folders';
const DB_VERSION = 2; // Bumped for folders support

/**
 * Opens the IndexedDB database.
 */
const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    // Check if indexedDB is supported
    if (!('indexedDB' in window)) {
        reject(new Error("IndexedDB is not supported in this environment."));
        return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (event) => {
        console.error("IndexedDB Error:", (event.target as IDBOpenDBRequest).error);
        reject(request.error);
    };

    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      
      if (!db.objectStoreNames.contains(PROJECT_STORE)) {
        db.createObjectStore(PROJECT_STORE, { keyPath: 'id' });
      }
      
      if (!db.objectStoreNames.contains(FOLDER_STORE)) {
        db.createObjectStore(FOLDER_STORE, { keyPath: 'id' });
      }
    };
  });
};

/**
 * Retrieves all projects from the database.
 */
export const getAllProjects = async (): Promise<Project[]> => {
  try {
      const db = await initDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(PROJECT_STORE, 'readonly');
        const store = transaction.objectStore(PROJECT_STORE);
        const request = store.getAll();

        request.onsuccess = () => {
            // Sort by timestamp descending (newest first)
            const projects = request.result as Project[];
            // Safety check for array
            if (!Array.isArray(projects)) {
                resolve([]);
                return;
            }
            projects.sort((a, b) => b.timestamp - a.timestamp);
            resolve(projects);
        };
        request.onerror = () => {
            console.error("Error fetching projects:", request.error);
            reject(request.error);
        };
      });
  } catch (error) {
      console.error("DB Initialization failed during getAllProjects", error);
      return []; // Return empty if DB fails to let app load
  }
};

/**
 * Saves or updates a project in the database.
 */
export const saveProjectToDB = async (project: Project): Promise<void> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(PROJECT_STORE, 'readwrite');
    const store = transaction.objectStore(PROJECT_STORE);
    const request = store.put(project);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

/**
 * Deletes a project from the database.
 */
export const deleteProjectFromDB = async (id: string): Promise<void> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(PROJECT_STORE, 'readwrite');
    const store = transaction.objectStore(PROJECT_STORE);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

/**
 * FOLDER OPERATIONS
 */

export const getAllFolders = async (): Promise<Folder[]> => {
  try {
      const db = await initDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(FOLDER_STORE, 'readonly');
        const store = transaction.objectStore(FOLDER_STORE);
        const request = store.getAll();

        request.onsuccess = () => {
            const folders = request.result as Folder[];
            if (!Array.isArray(folders)) {
                resolve([]);
                return;
            }
            // Sort folders A-Z or by time? Let's do time for now
            folders.sort((a, b) => b.timestamp - a.timestamp);
            resolve(folders);
        };
        request.onerror = () => reject(request.error);
      });
  } catch (error) {
      console.error("DB Error getting folders", error);
      return [];
  }
};

export const saveFolderToDB = async (folder: Folder): Promise<void> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(FOLDER_STORE, 'readwrite');
    const store = transaction.objectStore(FOLDER_STORE);
    const request = store.put(folder);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

export const deleteFolderFromDB = async (id: string): Promise<void> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(FOLDER_STORE, 'readwrite');
    const store = transaction.objectStore(FOLDER_STORE);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};