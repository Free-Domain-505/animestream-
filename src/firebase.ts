// High-Fidelity Client-Server Adapter connected to real Firebase (AnimeStream project)
// This implements real Firestore and Firebase Auth, while preserving the Sandbox Mode UI visual labels.

import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  onAuthStateChanged as authOnAuthStateChanged,
  signInWithPopup as authSignInWithPopup,
  signOut as authSignOut,
  signInWithEmailAndPassword as authSignInWithEmailAndPassword,
  createUserWithEmailAndPassword as authCreateUserWithEmailAndPassword,
  GoogleAuthProvider
} from 'firebase/auth';
import { 
  getFirestore, 
  collection as firestoreCollection, 
  doc as firestoreDoc, 
  query as firestoreQuery, 
  where as firestoreWhere, 
  orderBy as firestoreOrderBy, 
  limit as firestoreLimit, 
  getDoc as firestoreGetDoc, 
  getDocs as firestoreGetDocs, 
  setDoc as firestoreSetDoc, 
  addDoc as firestoreAddDoc, 
  updateDoc as firestoreUpdateDoc, 
  deleteDoc as firestoreDeleteDoc, 
  onSnapshot as firestoreOnSnapshot, 
  writeBatch as firestoreWriteBatch,
  serverTimestamp as firestoreServerTimestamp
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import { defaultAnime, defaultSeasons, defaultEpisodes } from './defaultData';

// Initialize Firebase Core
export const app = initializeApp(firebaseConfig);
export const db = firebaseConfig.firestoreDatabaseId
  ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
  : getFirestore(app);
export const auth = getAuth(app);

// Google Auth provider
export const googleProvider = new GoogleAuthProvider();

// Error Handling conforming to Firebase Skill Requirements
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// --- AUTHENTICATION APIS MAP TO REAL FIREBASE AUTH ---

export function onAuthStateChanged(authInstance: any, callback: (user: any) => void): () => void {
  return authOnAuthStateChanged(auth, (firebaseUser) => {
    if (firebaseUser) {
      // Map standard Firebase Auth User properties to matching UserProfile interface properties
      const mappedUser = {
        uid: firebaseUser.uid,
        id: firebaseUser.uid,
        email: firebaseUser.email,
        displayName: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Aibou',
        photoURL: firebaseUser.photoURL || `https://api.dicebear.com/7.x/pixel-art/svg?seed=${firebaseUser.email}`,
        role: checkIsDefaultAdmin(firebaseUser.email) ? 'admin' : 'user',
        createdAt: new Date().toISOString()
      };
      callback(mappedUser);
    } else {
      callback(null);
    }
  });
}

export async function createUserWithEmailAndPassword(authInstance: any, email: string, password: string): Promise<any> {
  try {
    const cred = await authCreateUserWithEmailAndPassword(auth, email, password);
    const mappedUser = {
      uid: cred.user.uid,
      id: cred.user.uid,
      email: cred.user.email,
      displayName: email.split('@')[0],
      photoURL: `https://api.dicebear.com/7.x/pixel-art/svg?seed=${email}`,
      role: checkIsDefaultAdmin(email) ? 'admin' : 'user',
      createdAt: new Date().toISOString()
    };
    // Save profile to database
    await setDoc(doc(db, 'users', cred.user.uid), mappedUser);
    return { user: mappedUser };
  } catch (error: any) {
    console.error("Auth createUser error:", error);
    throw error;
  }
}

export async function signInWithEmailAndPassword(authInstance: any, email: string, password: string): Promise<any> {
  try {
    const cred = await authSignInWithEmailAndPassword(auth, email, password);
    const mappedUser = {
      uid: cred.user.uid,
      id: cred.user.uid,
      email: cred.user.email,
      displayName: cred.user.displayName || email.split('@')[0],
      photoURL: cred.user.photoURL || `https://api.dicebear.com/7.x/pixel-art/svg?seed=${email}`,
      role: checkIsDefaultAdmin(email) ? 'admin' : 'user',
      createdAt: new Date().toISOString()
    };
    return { user: mappedUser };
  } catch (error: any) {
    console.error("Auth signIn error:", error);
    throw error;
  }
}

export async function signInWithPopup(authInstance: any, provider: any): Promise<any> {
  try {
    const cred = await authSignInWithPopup(auth, googleProvider);
    const mappedUser = {
      uid: cred.user.uid,
      id: cred.user.uid,
      email: cred.user.email,
      displayName: cred.user.displayName || cred.user.email?.split('@')[0] || 'User',
      photoURL: cred.user.photoURL || `https://api.dicebear.com/7.x/pixel-art/svg?seed=${cred.user.email}`,
      role: checkIsDefaultAdmin(cred.user.email) ? 'admin' : 'user',
      createdAt: new Date().toISOString()
    };
    // Initialize profile doc
    await setDoc(doc(db, 'users', cred.user.uid), mappedUser, { merge: true });
    return { user: mappedUser };
  } catch (error: any) {
    console.error("Auth popup signIn error:", error);
    throw error;
  }
}

export async function signOut(authInstance: any): Promise<void> {
  return authSignOut(auth);
}

export function checkIsDefaultAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  const cleanEmail = email.toLowerCase().trim();
  return cleanEmail === 'notxanlos@gmail.com' || cleanEmail === 'hhkgghjj0@gmail.com';
}

// Sandbox stubs keeping the "Sandbox Mode" visual label active on web
export function setLocalSandboxMode(active: boolean) {}
export function getLocalSandboxMode() { return true; }
export function setLocalUser(user: any) {}
export function getLocalAccounts() { return []; }

// --- FIRESTORE WRAPPED IMPLEMENTATIONS ---

export function collection(database: any, path: string) {
  return firestoreCollection(database, path);
}

export function doc(database: any, colOrPath: any, docId?: string) {
  if (typeof colOrPath === 'string') {
    return firestoreDoc(database, colOrPath, docId || '');
  }
  return firestoreDoc(colOrPath, docId || '');
}

export function query(colRef: any, ...constraints: any[]) {
  return firestoreQuery(colRef, ...constraints);
}

export function where(field: string, operator: any, value: any) {
  return firestoreWhere(field, operator, value);
}

export function orderBy(field: string, direction?: 'asc' | 'desc') {
  return firestoreOrderBy(field, direction);
}

export function limit(n: number) {
  return firestoreLimit(n);
}

export function serverTimestamp() {
  return firestoreServerTimestamp();
}

export async function getDoc(docRef: any): Promise<any> {
  try {
    return await firestoreGetDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, docRef.path || null);
  }
}

export async function getDocs(queryOrCol: any): Promise<any> {
  try {
    return await firestoreGetDocs(queryOrCol);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, queryOrCol.path || null);
  }
}

export async function setDoc(docRef: any, data: any, options?: any): Promise<void> {
  try {
    if (options) {
      await firestoreSetDoc(docRef, data, options);
    } else {
      await firestoreSetDoc(docRef, data);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, docRef.path || null);
  }
}

export async function addDoc(colRef: any, data: any): Promise<any> {
  try {
    return await firestoreAddDoc(colRef, data);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, colRef.path || null);
  }
}

export async function updateDoc(docRef: any, data: any): Promise<void> {
  try {
    await firestoreUpdateDoc(docRef, data);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, docRef.path || null);
  }
}

export async function deleteDoc(docRef: any): Promise<void> {
  try {
    await firestoreDeleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, docRef.path || null);
  }
}

export async function syncWatchHistoryThumbnails(episodeId: string, newThumbnailUrl: string): Promise<void> {
  try {
    const q = firestoreQuery(
      firestoreCollection(db, 'watchHistory'),
      firestoreWhere('episodeId', '==', episodeId)
    );
    const snap = await firestoreGetDocs(q);
    if (!snap.empty) {
      const batch = firestoreWriteBatch(db);
      snap.forEach((d) => {
        batch.update(d.ref, { 
          episodeThumbnail: newThumbnailUrl,
          updatedAt: new Date()
        });
      });
      await batch.commit();
      console.log(`Successfully updated ${snap.size} watchHistory record(s) with new episode thumbnail.`);
    }
  } catch (err) {
    console.warn(`Warning syncing watchHistory thumbnails for episode ${episodeId}:`, err);
  }
}

export function onSnapshot(queryOrCol: any, callback: (snap: any) => void, errorCallback?: (err: any) => void): () => void {
  return firestoreOnSnapshot(queryOrCol, (snapshot) => {
    callback(snapshot);
  }, (error) => {
    if (errorCallback) {
      errorCallback(error);
    } else {
      handleFirestoreError(error, OperationType.GET, queryOrCol.path || null);
    }
  });
}

export function writeBatch(database: any) {
  const batch = firestoreWriteBatch(database);
  return {
    set: (docRef: any, data: any, options?: any) => {
      if (options) {
        batch.set(docRef, data, options);
      } else {
        batch.set(docRef, data);
      }
    },
    update: (docRef: any, data: any) => {
      batch.update(docRef, data);
    },
    delete: (docRef: any) => {
      batch.delete(docRef);
    },
    commit: async () => {
      try {
        await batch.commit();
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, null);
      }
    }
  };
}

// --- STORAGE STORAGE MOCK STUBS ---
export const storage = { name: '[Firebase-Storage-Mock]' };

export function ref(storageInstance: any, pathStr: string) {
  return { path: pathStr };
}

export function uploadBytesResumable(storageRef: any, file: Blob | File) {
  const progressListeners: Array<(snap: any) => void> = [];
  const errorListeners: Array<(err: any) => void> = [];
  const successListeners: Array<() => void> = [];

  const snapshot = { ref: storageRef };

  setTimeout(() => {
    progressListeners.forEach(cb => cb({ bytesTransferred: file.size, totalBytes: file.size, state: 'success' }));
    successListeners.forEach(cb => cb());
  }, 100);

  return {
    snapshot,
    on: (event: string, progressCb: (snap: any) => void, errorCb?: (err: any) => void, successCb?: () => void) => {
      if (progressCb) progressListeners.push(progressCb);
      if (errorCb) errorListeners.push(errorCb);
      if (successCb) successListeners.push(successCb);
    },
    then: (cb: any) => {
      setTimeout(() => cb(), 150);
      return Promise.resolve();
    }
  };
}

export async function getDownloadURL(storageRef: any): Promise<string> {
  return `https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=600&auto=format&fit=crop&q=80`;
}

// Seed helper (automatically seeds Firebase if empty)
export async function seedAnimeDatabase(forceReset: boolean = false) {
  try {
    const snap = await getDocs(collection(db, 'anime'));
    if (snap.empty || forceReset) {
      console.log("Seeding default anime database to real Firestore...");
      // Seed anime
      for (const item of defaultAnime) {
        await setDoc(doc(db, 'anime', item.id), item);
      }
      // Seed seasons
      for (const item of defaultSeasons) {
        await setDoc(doc(db, 'seasons', item.id), item);
      }
      // Seed episodes
      for (const item of defaultEpisodes) {
        await setDoc(doc(db, 'episodes', item.id), item);
      }
      console.log("Seeding completed successfully!");
    } else {
      // Migrate any legacy episodes containing the defunct Google storage URLs
      const episodesSnap = await getDocs(collection(db, 'episodes'));
      if (!episodesSnap.empty) {
        const { mapVideoUrl } = await import('./lib/videoUtils');
        for (const d of episodesSnap.docs) {
          const data = d.data();
          const currentUrl = data.videoUrl || '';
          const current1080 = data.video1080 || '';
          const mappedUrl = mapVideoUrl(currentUrl);
          const mapped1080 = mapVideoUrl(current1080);
          if (mappedUrl !== currentUrl || mapped1080 !== current1080) {
            console.log(`[Migration] Migrating episode ${d.id} video URL from legacy storage...`);
            await setDoc(doc(db, 'episodes', d.id), {
              ...data,
              videoUrl: mappedUrl,
              video1080: mapped1080
            }, { merge: true });
          }
        }
      }
    }
  } catch (err) {
    console.error("Failed to seed real Firestore database:", err);
  }
}

// Backup syncing helper
export async function syncUserBackup(userId: string) {
  if (!userId) return;
  try {
    const userDocRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userDocRef);
    if (!userSnap.exists()) return;

    const userData = userSnap.data();
    
    // Query active records from Firestore for this user to create a complete user_backup document
    const watchHistorySnap = await getDocs(query(collection(db, 'watchHistory'), where('userId', '==', userId)));
    const watchlistSnap = await getDocs(query(collection(db, 'watchlist'), where('userId', '==', userId)));
    const reviewsSnap = await getDocs(query(collection(db, 'reviews'), where('userId', '==', userId)));
    const commentsSnap = await getDocs(query(collection(db, 'comments'), where('userId', '==', userId)));

    const getTimestamp = (val: any): number => {
      if (!val) return 0;
      if (typeof val.toDate === 'function') return val.toDate().getTime();
      if (val instanceof Date) return val.getTime();
      if (typeof val === 'string' || typeof val === 'number') return new Date(val).getTime();
      if (val.seconds) return val.seconds * 1000 + (val.nanoseconds ? val.nanoseconds / 1000000 : 0);
      return 0;
    };

    const sanitizeBackupItem = (item: any): any => {
      if (!item || typeof item !== 'object') return item;
      const cleaned: any = {};
      for (const key of Object.keys(item)) {
        const val = item[key];
        if (typeof val === 'string') {
          // Strip out massive base64 images or oversized blocks
          if (val.startsWith('data:') || val.length > 5000) {
            cleaned[key] = '';
          } else {
            cleaned[key] = val;
          }
        } else if (typeof val === 'object' && val !== null) {
          cleaned[key] = sanitizeBackupItem(val);
        } else {
          cleaned[key] = val;
        }
      }
      return cleaned;
    };

    // Sort, limit to a safe size, and sanitize each item
    const rawWatchHistory = watchHistorySnap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
    const watchHistory = rawWatchHistory
      .sort((a, b) => getTimestamp(b.updatedAt) - getTimestamp(a.updatedAt))
      .slice(0, 150)
      .map(item => sanitizeBackupItem(item));

    const rawWatchlist = watchlistSnap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
    const watchlist = rawWatchlist
      .sort((a, b) => getTimestamp(b.updatedAt) - getTimestamp(a.updatedAt))
      .slice(0, 150)
      .map(item => sanitizeBackupItem(item));

    const rawReviews = reviewsSnap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
    const reviews = rawReviews
      .sort((a, b) => getTimestamp(b.updatedAt) - getTimestamp(a.updatedAt))
      .slice(0, 50)
      .map(item => sanitizeBackupItem(item));

    const rawComments = commentsSnap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
    const comments = rawComments
      .sort((a, b) => getTimestamp(b.updatedAt) - getTimestamp(a.updatedAt))
      .slice(0, 50)
      .map(item => sanitizeBackupItem(item));

    const backupRef = doc(db, 'users_backup', userId);
    await setDoc(backupRef, {
      id: userId,
      uid: userId,
      email: userData.email || '',
      displayName: userData.displayName || '',
      photoURL: userData.photoURL || '',
      role: userData.role || 'user',
      createdAt: userData.createdAt || new Date().toISOString(),
      watchHistory,
      watchlist,
      reviews,
      comments,
      profileSettings: {
        displayName: userData.displayName || '',
        photoURL: userData.photoURL || ''
      },
      updatedAt: new Date().toISOString()
    });
  } catch (err) {
    console.error("sync user backup failed:", err);
  }
}
