// @ts-ignore
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, Firestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyAAlEiLPRINq6gT7B4dBvqrBkjGmKH0K0o",
  authDomain: "ai-chat-7f46f.firebaseapp.com",
  projectId: "ai-chat-7f46f",
  storageBucket: "ai-chat-7f46f.firebasestorage.app",
  messagingSenderId: "95949653468",
  appId: "1:95949653468:web:094478742b5c89143cfb19",
  measurementId: "G-SYSN02VK8L"
};

let app: any;
let db: Firestore | null = null;

try {
    // Check for existing apps to prevent double-initialization
    // @ts-ignore
    const existingApps = getApps();
    if (existingApps.length === 0) {
        // @ts-ignore
        app = initializeApp(firebaseConfig);
    } else {
        // @ts-ignore
        app = getApp();
    }
    
    db = getFirestore(app);
    console.log("Firebase Initialized Successfully");
} catch (error) {
    console.error("Firebase Initialization Failed:", error);
    // Fallback to null so app doesn't crash completely
    db = null;
}

export { db };