import { apiFetch, resolveApiOrigin } from '../lib/http';
import { initializeApp, getApp, getApps, deleteApp } from "firebase/app";
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signInWithRedirect, 
  getRedirectResult,
  signInWithCredential,
  browserLocalPersistence,
  setPersistence,
  User 
} from "firebase/auth";
import { getStorage, ref, uploadBytesResumable } from "firebase/storage";

let app: any = null;
let auth: any = null;
let storage: any = null;

// Detect if running inside Tauri WebView
const isTauri = typeof window !== 'undefined' && (
  (window as any).__TAURI_INTERNALS__ !== undefined || 
  (window as any).__TAURI__ !== undefined
);

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

// DEFINA A SUA CONFIGURAÇÃO DO FIREBASE AQUI
export const firebaseConfig: FirebaseConfig = {
  apiKey: "AIzaSyDE_r6SeLfmqYjwWDX27bEBJhOdngmqykQ",
  authDomain: "natum-hub-auth-2026.firebaseapp.com",
  projectId: "natum-hub-auth-2026",
  storageBucket: "natum-hub-auth-2026.firebasestorage.app",
  messagingSenderId: "607104156996",
  appId: "1:607104156996:web:22ef1140dbc398a8680311"
};

// Track what config is currently active to avoid unnecessary re-initialization
let currentConfigKey: string | null = null;

function configToKey(config: FirebaseConfig): string {
  return `${config.apiKey}:${config.projectId}:${config.appId}`;
}

export async function initializeFirebase(config?: FirebaseConfig) {
  const activeConfig = config || firebaseConfig;
  
  if (
    !activeConfig.apiKey || 
    activeConfig.apiKey === "SUA_API_KEY_AQUI" || 
    !activeConfig.projectId || 
    !activeConfig.storageBucket
  ) {
    throw new Error("Configuração do Firebase inválida ou incompleta.");
  }

  const newKey = configToKey(activeConfig);

  // If already initialized with the same config, reuse it.
  if (app && auth && storage && currentConfigKey === newKey) {
    return { app, auth, storage };
  }

  // If config changed, we need to destroy the old app
  if (currentConfigKey !== null && currentConfigKey !== newKey) {
    const apps = getApps();
    if (apps.length > 0) {
      try {
        const currentApp = getApp();
        await deleteApp(currentApp);
      } catch (e) {
        console.error("Erro ao deletar app Firebase anterior:", e);
      }
    }
    app = null;
    auth = null;
    storage = null;
  }

  // Initialize or reuse existing Firebase app
  const apps = getApps();
  if (apps.length > 0) {
    app = getApp();
  } else {
    app = initializeApp(activeConfig);
  }
  
  auth = getAuth(app);
  storage = getStorage(app);
  currentConfigKey = newKey;

  // Set persistence to local so auth state survives page reloads
  await setPersistence(auth, browserLocalPersistence);

  return { app, auth, storage };
}

export function isFirebaseInitialized(): boolean {
  return app !== null;
}

export function getFirebase() {
  if (!app || !auth || !storage) {
    throw new Error("Firebase não inicializado. Chame initializeFirebase primeiro.");
  }
  return { app, auth, storage };
}

/**
 * Login with Google.
 * 
 * In a regular browser: uses signInWithPopup (fast, no page reload).
 * In Tauri WebView: opens the system's default browser to log in on a local Axum page,
 * then polls the local Axum session storage until the credentials are set, and finally
 * signs in locally using signInWithCredential.
 */
export function loginWithGoogle(): Promise<User> {
  const { auth } = getFirebase();
  const provider = new GoogleAuthProvider();

  if (isTauri) {
    return new Promise<User>(async (resolve, reject) => {
      try {
        // 1. Clear any active session first
        try {
          await apiFetch('/auth/session', { method: 'DELETE', skipAuth: true });
        } catch (e) {
          console.warn("Could not clear session on backend:", e);
        }

        // 2. Open the system's default browser to log in
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('open_external_browser', { url: `${resolveApiOrigin()}/login` });

        // 3. Poll for the session
        const interval = setInterval(async () => {
          try {
            const res = await apiFetch('/auth/session', { skipAuth: true });
            if (res.ok) {
              const data = await res.json();
              if (data && data.idToken) {
                clearInterval(interval);
                
                // Sign in locally in Tauri using the retrieved credential
                const credential = GoogleAuthProvider.credential(data.idToken);
                const result = await signInWithCredential(auth, credential);
                
                // Clear the session from Rust memory since we've consumed it
                apiFetch('/auth/session', { method: 'DELETE', skipAuth: true }).catch(() => {});
                
                resolve(result.user);
              }
            }
          } catch (e) {
            console.error("Polling session error:", e);
          }
        }, 1000);

        // Auto timeout after 5 minutes
        setTimeout(() => {
          clearInterval(interval);
          reject(new Error("Tempo limite de login esgotado. Por favor, conclua a autenticação no seu navegador de internet."));
        }, 5 * 60 * 1000);

      } catch (err) {
        reject(err);
      }
    });
  }

  // In regular browser, use popup (faster, no page reload)
  return signInWithPopup(auth, provider)
    .then((result) => result.user)
    .catch((error: any) => {
      console.warn("signInWithPopup failed:", error.code, error.message);
      if (
        error.code === 'auth/popup-blocked' ||
        error.code === 'auth/popup-closed-by-user' ||
        error.code === 'auth/cancelled-popup-request'
      ) {
        console.warn("Falling back to signInWithRedirect...");
        return signInWithRedirect(auth, provider).then(() => {
          return new Promise<User>(() => {});
        });
      }
      throw error;
    });
}

export async function logoutFirebase(): Promise<void> {
  const { auth } = getFirebase();
  await auth.signOut();
}

export interface UploadProgressCallback {
  (progress: number): void;
}

export function uploadBackupFile(
  userId: string,
  fileBytes: Uint8Array,
  fileName: string,
  onProgress?: UploadProgressCallback
): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      const { storage } = getFirebase();
      const storageRef = ref(storage, `backups/${userId}/${fileName}`);
      
      const uploadTask = uploadBytesResumable(storageRef, fileBytes);
      
      uploadTask.on(
        "state_changed",
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          if (onProgress) {
            onProgress(Math.round(progress));
          }
        },
        (error) => {
          reject(error);
        },
        async () => {
          resolve(`backups/${userId}/${fileName}`);
        }
      );
    } catch (e) {
      reject(e);
    }
  });
}
