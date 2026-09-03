import { initializeApp, getApp, getApps } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, User } from "firebase/auth";
import { getStorage, ref, uploadBytesResumable } from "firebase/storage";

let app: any = null;
let auth: any = null;
let storage: any = null;

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

export function initializeFirebase(config: FirebaseConfig) {
  if (!config.apiKey || !config.projectId || !config.storageBucket) {
    throw new Error("Configuração do Firebase inválida ou incompleta.");
  }
  
  if (getApps().length === 0) {
    app = initializeApp(config);
  } else {
    app = getApp();
  }
  auth = getAuth(app);
  storage = getStorage(app);
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

export async function loginWithGoogle(): Promise<User> {
  const { auth } = getFirebase();
  const provider = new GoogleAuthProvider();
  // For desktop apps (Tauri), signInWithPopup is the standard and easiest flow
  const result = await signInWithPopup(auth, provider);
  return result.user;
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
