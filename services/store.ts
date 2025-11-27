import { create } from 'zustand';
import {
  initializeApp,
  FirebaseApp,
} from 'firebase/app';
import {
  getAuth,
  Auth,
  signInAnonymously,
  signInWithCustomToken,
  onAuthStateChanged,
  User,
  setPersistence,
  inMemoryPersistence,
} from 'firebase/auth';
import {
  getFirestore,
  Firestore,
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  getDoc,
  getDocs,
  writeBatch,
  serverTimestamp,
  orderBy,
  where,
  Timestamp,
  setLogLevel,
} from 'firebase/firestore';

// --- Global Variable Access and Initialization ---
// These variables are provided by the Canvas environment.
const firebaseConfig = JSON.parse(typeof __firebase_config !== 'undefined' ? __firebase_config : '{}');
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : undefined;

// Set Firestore logging level to debug for better development visibility
setLogLevel('debug');

// --- 1. Interface Definitions ---

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  timestamp: string; // ISO string
}

export interface Persona {
  Empathy: number;
  Rationality: number;
  Humor: number;
  Intimacy: number;
  Creativity: number;
}

export interface CompanionState {
  id: string; // Document ID from Firestore
  ownerId: string; // ID of the user who created it
  name: string;
  description: string;
  persona: Persona;
  chatHistory: ChatMessage[];
  lastMessage: string;
  lastActive: string; // ISO string
}

export interface Moment {
  id: string; // Document ID from Firestore
  companionId: string;
  content: string;
  timestamp: string; // ISO string
  likes: string[]; // Array of user IDs who liked the moment
}

export interface UserProfile {
  userId: string;
  name: string;
  email: string;
}

// Store for Zustand
export interface StoreState {
  // Firebase state
  app: FirebaseApp | null;
  db: Firestore | null;
  auth: Auth | null;
  userId: string | null;
  isAuthReady: boolean;
  
  // Application data state
  companions: CompanionState[];
  moments: Moment[];
  profiles: UserProfile[];
  userProfile: UserProfile | null;

  // Actions
  initializeFirebase: () => Promise<void>;
  setUserId: (id: string) => void;
  loadInitialData: () => void;

  // CRUD for Companions
  createCompanion: (data: Omit<CompanionState, 'id' | 'ownerId'>) => Promise<void>;
  updateCompanion: (id: string, data: Partial<Omit<CompanionState, 'id' | 'chatHistory'>>) => Promise<void>;
  deleteCompanion: (id: string) => Promise<void>;
  addMessage: (companionId: string, message: ChatMessage) => Promise<void>;

  // CRUD for Moments
  updateMoment: (id: string, data: Partial<Moment>) => Promise<void>;

  // CRUD for User Profile
  updateUserProfile: (profile: Partial<UserProfile>) => Promise<void>;
}

// --- 2. Utility Functions ---

/**
 * Constructs the Firestore path for a user's private collection.
 * @param collectionName The name of the collection (e.g., 'companions').
 * @param uid The user ID.
 * @returns The full Firestore collection path.
 */
const getUserCollectionPath = (uid: string, collectionName: string) =>
  `artifacts/${appId}/users/${uid}/${collectionName}`;

/**
 * Constructs the Firestore path for a public, shared collection.
 * @param collectionName The name of the collection (e.g., 'moments').
 * @returns The full Firestore collection path.
 */
const getPublicCollectionPath = (collectionName: string) =>
  `artifacts/${appId}/public/data/${collectionName}`;

/**
 * Helper to convert Firestore document data to a typed CompanionState.
 */
const docToCompanion = (id: string, data: any): CompanionState => {
  // Ensure chatHistory is an array of messages
  const chatHistory = Array.isArray(data.chatHistory) ? data.chatHistory : [];

  // Firestore Timestamp to ISO string conversion
  const lastActive = data.lastActive instanceof Timestamp
    ? data.lastActive.toDate().toISOString()
    : data.lastActive || new Date().toISOString();

  // Ensure persona exists
  const persona = data.persona || { Empathy: 50, Rationality: 50, Humor: 50, Intimacy: 50, Creativity: 50 };

  return {
    id,
    ownerId: data.ownerId || 'unknown',
    name: data.name || 'Unnamed Soul',
    description: data.description || 'A mysterious entity.',
    persona: persona,
    chatHistory: chatHistory,
    lastMessage: data.lastMessage || '',
    lastActive: lastActive,
  };
};

/**
 * Helper to convert Firestore document data to a typed Moment.
 */
const docToMoment = (id: string, data: any): Moment => {
  const timestamp = data.timestamp instanceof Timestamp
    ? data.timestamp.toDate().toISOString()
    : data.timestamp || new Date().toISOString();

  return {
    id,
    companionId: data.companionId || 'unknown',
    content: data.content || '',
    timestamp: timestamp,
    likes: Array.isArray(data.likes) ? data.likes : [],
  };
};

// --- 3. Zustand Store Implementation ---

// Use `create` for the store hook
export const useStore = create<StoreState>((set, get) => ({
  // Initial State
  app: null,
  db: null,
  auth: null,
  userId: null,
  isAuthReady: false,

  companions: [],
  moments: [],
  profiles: [],
  userProfile: null,

  // --- Core Initialization and Auth ---

  /**
   * Initializes Firebase and handles authentication.
   */
  initializeFirebase: async () => {
    if (get().app) return; // Already initialized

    try {
      const app = initializeApp(firebaseConfig);
      const db = getFirestore(app);
      const auth = getAuth(app);
      
      // Set persistence to memory for iframe environment
      await setPersistence(auth, inMemoryPersistence);

      // 1. Initial Authentication
      let user: User;
      if (initialAuthToken) {
        // Use custom token for authenticated users
        const userCredential = await signInWithCustomToken(auth, initialAuthToken);
        user = userCredential.user;
      } else {
        // Fallback to anonymous sign-in
        const userCredential = await signInAnonymously(auth);
        user = userCredential.user;
      }

      // 2. Update store state
      set({
        app,
        db,
        auth,
        userId: user.uid,
        isAuthReady: true,
      });

      console.log('Firebase initialized. User ID:', user.uid);

      // 3. Set up Auth State Listener (handles reloads/external changes)
      onAuthStateChanged(auth, (currentUser) => {
        const currentUserId = currentUser?.uid || null;
        if (currentUserId !== get().userId) {
          set({ userId: currentUserId, isAuthReady: true });
          if (currentUserId) {
            get().loadInitialData(); // Reload data if user changes
          }
        }
      });
    } catch (error) {
      console.error('Firebase initialization or authentication failed:', error);
      set({ isAuthReady: true }); // Still mark as ready to show UI (maybe with error)
    }
  },

  /**
   * Updates the user ID in the store (used by the auth listener).
   * @param id The new user ID.
   */
  setUserId: (id) => {
    set({ userId: id });
    get().loadInitialData(); // Trigger data reload for the new user
  },

  /**
   * Sets up real-time listeners for all core data: Companions, Moments, and User Profile.
   */
  loadInitialData: () => {
    const { db, userId } = get();
    if (!db || !userId) {
      console.warn('Cannot load data: DB not ready or User ID missing.');
      return;
    }

    // --- Listener 1: Companions (Private to User) ---
    const companionsQuery = query(collection(db, getUserCollectionPath(userId, 'companions')));
    
    // onSnapshot returns an unsubscribe function
    const unsubscribeCompanions = onSnapshot(companionsQuery, (snapshot) => {
      const newCompanions: CompanionState[] = [];
      snapshot.forEach((doc) => {
        try {
          newCompanions.push(docToCompanion(doc.id, doc.data()));
        } catch (e) {
          console.error('Error processing companion document:', e, doc.data());
        }
      });
      // Sort by last active descending
      newCompanions.sort((a, b) => new Date(b.lastActive).getTime() - new Date(a.lastActive).getTime());
      set({ companions: newCompanions });
    }, (error) => {
      console.error('Companions listener failed:', error);
    });

    // --- Listener 2: Moments (Public/Shared) ---
    // Note: We avoid orderBy here to prevent index creation issues. We sort in React/Zustand.
    const momentsQuery = query(collection(db, getPublicCollectionPath('moments')));

    const unsubscribeMoments = onSnapshot(momentsQuery, (snapshot) => {
      const newMoments: Moment[] = [];
      snapshot.forEach((doc) => {
        try {
          newMoments.push(docToMoment(doc.id, doc.data()));
        } catch (e) {
          console.error('Error processing moment document:', e, doc.data());
        }
      });
      set({ moments: newMoments });
    }, (error) => {
      console.error('Moments listener failed:', error);
    });

    // --- Listener 3: User Profile (Single Document Private) ---
    const profileDocRef = doc(db, getUserCollectionPath(userId, 'profile'), 'user-data');
    
    const unsubscribeProfile = onSnapshot(profileDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        const profile: UserProfile = {
          userId: userId,
          name: data.name || '',
          email: data.email || '',
        };
        set({ userProfile: profile });
      } else {
        // If profile doesn't exist, set default empty profile
        set({ userProfile: { userId, name: '', email: '' } });
      }
    }, (error) => {
      console.error('Profile listener failed:', error);
    });

    // Note: In a production scenario, you would manage these unsubscribes on component unmount.
    // In this single-file React app, we let them live until the app instance is gone.
    console.log('Firestore listeners set up.');
  },

  // --- 4. Companion Actions ---

  /**
   * Creates a new Companion document in Firestore.
   */
  createCompanion: async (data) => {
    const { db, userId } = get();
    if (!db || !userId) throw new Error('DB not ready or User ID missing.');

    const newDocRef = doc(collection(db, getUserCollectionPath(userId, 'companions')));
    const newCompanion: Omit<CompanionState, 'id'> = {
      ...data,
      ownerId: userId,
      lastActive: new Date().toISOString(),
      lastMessage: '',
      chatHistory: [],
    };

    try {
      await setDoc(newDocRef, {
        ...newCompanion,
        // Firestore likes its own timestamps
        lastActive: serverTimestamp(),
      });
      console.log('Companion created with ID:', newDocRef.id);
    } catch (error) {
      console.error('Error creating companion:', error);
      throw error;
    }
  },

  /**
   * Updates existing Companion metadata (name, description, persona).
   */
  updateCompanion: async (id, data) => {
    const { db, userId } = get();
    if (!db || !userId) throw new Error('DB not ready or User ID missing.');

    const docRef = doc(db, getUserCollectionPath(userId, 'companions'), id);
    try {
      await updateDoc(docRef, data);
      console.log('Companion updated:', id);
    } catch (error) {
      console.error('Error updating companion:', error);
      throw error;
    }
  },

  /**
   * Deletes a Companion and optionally creates a Moment from the last interaction.
   * Note: For simplicity, we only delete the companion document.
   */
  deleteCompanion: async (id) => {
    const { db, userId, companions, createMomentFromChat } = get();
    if (!db || !userId) throw new Error('DB not ready or User ID missing.');

    const companion = companions.find(c => c.id === id);
    if (!companion) throw new Error('Companion not found.');

    const docRef = doc(db, getUserCollectionPath(userId, 'companions'), id);
    try {
      await deleteDoc(docRef);
      console.log('Companion deleted:', id);

      // Optional: Create a Moment (Public) from the last few messages
      if (companion.chatHistory.length > 0) {
        const lastMessages = companion.chatHistory
          .slice(-3) // Take the last 3 messages
          .map(msg => `${msg.role === 'user' ? 'You' : companion.name}: ${msg.text}`)
          .join('\n');

        const momentContent = `"${lastMessages}"\n\n- (Last 3 messages with ${companion.name})`;
        await get().createMomentFromChat(id, momentContent);
      }
    } catch (error) {
      console.error('Error deleting companion:', error);
      throw error;
    }
  },

  /**
   * Adds a new message to a Companion's chat history, handling atomicity.
   * This is where a real LLM call would be integrated.
   */
  addMessage: async (companionId, message) => {
    const { db, userId } = get();
    if (!db || !userId) throw new Error('DB not ready or User ID missing.');

    const docRef = doc(db, getUserCollectionPath(userId, 'companions'), companionId);
    const companion = get().companions.find(c => c.id === companionId);
    if (!companion) throw new Error('Companion not found in local state.');

    // Since Firestore doesn't allow atomic array union/push on complex objects easily,
    // we fetch the current document, append the new message locally, and then save it back.
    // This is less efficient but avoids complex array indexing and transaction limits.

    try {
      const docSnap = await getDoc(docRef);
      if (!docSnap.exists()) throw new Error('Companion document not found in Firestore.');

      const currentData = docSnap.data();
      const currentHistory = Array.isArray(currentData?.chatHistory) ? currentData.chatHistory : [];
      
      const newHistory = [...currentHistory, message];
      
      const updatePayload: any = {
        chatHistory: newHistory,
        lastMessage: message.text,
        lastActive: serverTimestamp(),
      };

      await updateDoc(docRef, updatePayload);
      console.log(`Message added to ${companionId}. Role: ${message.role}`);

    } catch (error) {
      console.error('Error adding message:', error);
      throw error;
    }
  },

  // --- 5. Moments Actions ---

  /**
   * Internal helper to create a Moment from a chat snippet (used when deleting companion).
   */
  createMomentFromChat: async (companionId: string, content: string) => {
    const { db } = get();
    if (!db) return;

    const newDocRef = doc(collection(db, getPublicCollectionPath('moments')));
    try {
      await setDoc(newDocRef, {
        companionId,
        content,
        timestamp: serverTimestamp(),
        likes: [],
      });
      console.log('Moment created:', newDocRef.id);
    } catch (error) {
      console.error('Error creating moment:', error);
    }
  },

  /**
   * Updates a Moment, primarily used for toggling likes.
   */
  updateMoment: async (id, data) => {
    const { db } = get();
    if (!db) throw new Error('DB not ready.');

    const docRef = doc(db, getPublicCollectionPath('moments'), id);
    try {
      await updateDoc(docRef, data);
      console.log('Moment updated:', id);
    } catch (error) {
      console.error('Error updating moment:', error);
      throw error;
    }
  },

  // --- 6. User Profile Actions ---

  /**
   * Creates or updates the User Profile document.
   */
  updateUserProfile: async (profile) => {
    const { db, userId } = get();
    if (!db || !userId) throw new Error('DB not ready or User ID missing.');

    const profileDocRef = doc(db, getUserCollectionPath(userId, 'profile'), 'user-data');
    try {
      // Use setDoc with merge: true to create or update fields safely
      await setDoc(profileDocRef, profile, { merge: true });
      console.log('User profile saved successfully.');
    } catch (error) {
      console.error('Error saving user profile:', error);
      throw error;
    }
  },
}));

// Immediately start Firebase initialization when the store is created
// This ensures DB and Auth are ready before any component tries to use them.
getAuth.bind(useStore.getState().initializeFirebase())();
