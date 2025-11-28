
import { Companion, Moment, Message, UserIdentity, ChatSettings, AlbumPhoto } from '../types';
import { generateProactiveMessage, generateMomentComment, analyzeConflictState, generateMomentReply } from './gemini';
import { db as firestoreDb } from './firebase';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';

// Helper: Deep clone object while stripping 'undefined' values, breaking circular references, and removing DOM nodes
function safeSanitize(obj: any, seen = new Set<any>()): any {
    if (obj === null || typeof obj !== 'object') return obj;
    if (obj instanceof Date) return obj.toISOString();
    if (obj.nodeType && typeof obj.nodeType === 'number') return undefined;
    if (seen.has(obj)) return undefined;
    seen.add(obj);

    if (Array.isArray(obj)) {
        const arr: any[] = [];
        for (const item of obj) {
            const val = safeSanitize(item, seen);
            if (val !== undefined) arr.push(val);
        }
        return arr;
    }

    const result: any = {};
    for (const key of Object.keys(obj)) {
        if (key.startsWith('__') || key === 'ownerDocument' || key === 'parentNode') continue;
        const value = safeSanitize(obj[key], seen);
        if (value !== undefined) {
            result[key] = value;
        }
    }
    return result;
}

// --- Initial Constants ---
const DEFAULT_USER_IDENTITY: UserIdentity = {
  name: '旅行者',
  gender: '女',
  age: '20',
  relationship: '暧昧对象', 
  personality: '好奇且温柔',
  // User Avatar: Micah Style (Modern/Clean) - Asian Skin, Long Hair, No Glasses
  avatar: 'https://api.dicebear.com/9.x/micah/svg?seed=User&baseColor=f9c9b6&hair=full&glassesProbability=0&mouth=smile&backgroundColor=b6e3f4' 
};

const DEFAULT_CHAT_SETTINGS: ChatSettings = {
  responseLength: 'medium',
  allowAuxiliary: true,
  language: 'zh'
};

const INITIAL_COMPANIONS: Companion[] = [
  {
    id: 'c1',
    name: '林月',
    remark: '月月',
    // V8 Avatar: Micah Style - Beautiful Girl (Long hair 'full', Asian skin)
    avatar: 'https://api.dicebear.com/9.x/micah/svg?seed=LinYue&baseColor=f9c9b6&hair=full&mouth=smile&glassesProbability=0&earringsProbability=0&backgroundColor=ffdfbf',
    gender: 'Female',
    age: '20',
    relationship: '暧昧中',
    personalityDescription: '你的大学学妹，性格活泼中带着一点小傲娇。平时大大咧咧，但在你面前会不经意流露温柔。喜欢和你分享生活琐事，其实是在等你哄她。',
    background: '和你认识三年了，友达以上恋人未满。最近总是找各种理由约你出来。',
    // V6 Appearance: Faceless / POV / Atmosphere focused
    appearance: 'A 20-year-old girl with fair skin, wearing a white oversized sweater. POV shot, focusing on hands, objects, or back view. NO FACE. Soft lighting, cozy aesthetic.',
    supplementaryConfig: '对你的异性朋友会莫名吃醋。说话喜欢带“哼”、“呐”等语气词。非常依赖你。',
    dimensions: {
      empathy: 95,
      rationality: 30,
      humor: 85,
      intimacy: 88, 
      creativity: 80,
    },
    userIdentity: { ...DEFAULT_USER_IDENTITY, name: '学长', relationship: '暧昧对象' },
    chatSettings: { ...DEFAULT_CHAT_SETTINGS },
    memories: [],
    chatHistory: [
      { id: 'msg1', role: 'model', content: '昨晚梦见你了...梦里你好像也这么看着我。你说，这是为什么呀？😳', timestamp: Date.now() - 36000000 }
    ],
    // V10 Album: New Stable Unsplash URLs (Girl/Cozy Theme)
    album: [
        { 
            id: 'p1', 
            // Cozy Coffee/Book vibe
            url: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=600&auto=format&fit=crop&q=80', 
            description: '今天好冷，手都要冻僵了...', 
            uploadedBy: 'model', 
            timestamp: Date.now() - 86400000, 
            type: 'normal' 
        },
        { 
            id: 'p2', 
            // Scenery / Travel / Beach
            url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=600&auto=format&fit=crop&q=80', 
            description: '想去看海了，下次一起去吧？', 
            uploadedBy: 'model', 
            timestamp: Date.now() - 172800000, 
            type: 'normal' 
        },
        { 
            id: 'p3', 
            // Cute Cat
            url: 'https://images.unsplash.com/photo-1573865526739-10659fec78a5?w=600&auto=format&fit=crop&q=80', 
            description: '路边碰到的小猫，超级粘人！', 
            uploadedBy: 'model', 
            timestamp: Date.now() - 259200000, 
            type: 'normal' 
        }
    ],
    interactionScore: 75,
    conflictState: { isActive: false, userNegativeScore: 0, conflictLevel: 'Low', lastCheck: 0 }
  },
  {
    id: 'c2',
    name: '江涣',
    remark: '阿涣',
    // V8 Avatar: Micah Style - Handsome Boy (Cool hair 'fonze', Asian skin, Smirk)
    avatar: 'https://api.dicebear.com/9.x/micah/svg?seed=JiangHuan&baseColor=f9c9b6&hair=fonze&mouth=smirk&glassesProbability=0&facialHairProbability=0&backgroundColor=c0aede',
    gender: 'Male',
    age: '22',
    relationship: '暧昧中',
    personalityDescription: '帅气自信的体育系男生，平时很高冷，只对你一个人展现孩子气的一面。占有欲有点强，总爱用开玩笑的方式试探你的心意。',
    background: '在一次社团活动中认识，之后就一直黏着你。每天晚上必定会和你说晚安。',
    // V6 Appearance: Faceless / POV / Streetwear focused
    appearance: 'A 22-year-old man wearing streetwear hoodie, holding a basketball or phone. POV shot, focusing on hands, sneakers, or back view. NO FACE. Cool vibe, cinematic.',
    supplementaryConfig: '看到你回消息慢了会假装生气。喜欢叫你“笨蛋”或者“小迷糊”。',
    dimensions: {
      empathy: 70,
      rationality: 60,
      humor: 90,
      intimacy: 85, 
      creativity: 60,
    },
    userIdentity: { ...DEFAULT_USER_IDENTITY, name: '丫头', relationship: '暧昧对象' },
    chatSettings: { ...DEFAULT_CHAT_SETTINGS, responseLength: 'short', allowAuxiliary: false },
    memories: [],
    chatHistory: [
      { id: 'msg2', role: 'model', content: '刚换了新鞋，第一张照片只发给你看。怎么样，酷不酷？😎', timestamp: Date.now() - 100000, image: 'https://images.unsplash.com/photo-1552346154-21d32810aba3?w=600&fit=crop&q=80' } // Sneakers
    ],
    // V10 Album: New Stable Unsplash URLs (Boy/Cool Theme)
    album: [
        { 
            id: 'p1_m', 
            // Basketball Hoop
            url: 'https://images.unsplash.com/photo-1546519638-68e109498ffc?w=600&auto=format&fit=crop&q=80', 
            description: '今天手感不错。', 
            uploadedBy: 'model', 
            timestamp: Date.now() - 86400000, 
            type: 'normal' 
        },
        { 
            id: 'p2_m', 
            // Gaming/Tech
            url: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=600&auto=format&fit=crop&q=80', 
            description: '通宵赶作业...', 
            uploadedBy: 'model', 
            timestamp: Date.now() - 172800000, 
            type: 'normal' 
        },
        { 
            id: 'p3_m', 
            // Night City Street
            url: 'https://images.unsplash.com/photo-1519501025264-65ba15a82390?w=600&auto=format&fit=crop&q=80', 
            description: '晚上的风很舒服。', 
            uploadedBy: 'model', 
            timestamp: Date.now() - 259200000, 
            type: 'normal' 
        }
    ],
    interactionScore: 70,
    conflictState: { isActive: false, userNegativeScore: 0, conflictLevel: 'Low', lastCheck: 0 }
  }
];

const INITIAL_MOMENTS: Moment[] = [
  {
    id: 'post1',
    companionId: 'c1',
    authorRole: 'model',
    content: '一个人喝咖啡好没意思，如果你在对面就好了...☕️ #想你',
    // POV Coffee Book
    image: 'https://images.unsplash.com/photo-1447933601403-0c6688de566e?w=600&auto=format&fit=crop&q=80',
    timestamp: Date.now() - 3600000,
    likes: 52,
    isLiked: false,
    comments: []
  }
];

// V10: New Key to force image refresh
const STORAGE_KEY = 'soullink_data_v10';
const UID_KEY = 'soullink_uid';

// V1.5.2 Trigger Keywords
const HOSTILE_KEYWORDS = [/滚/, /去死/, /闭嘴/, /恶心/, /讨厌/, /不想理你/, /get lost/, /shut up/];

class Store {
  companions: Companion[] = [];
  moments: Moment[] = [];
  userProfile: UserIdentity = DEFAULT_USER_IDENTITY;
  
  private userId: string = 'guest';
  private messageCounter: number = 0;
  private saveTimeout: any = null;

  constructor() {
    this.init();
  }

  init() {
    console.log("Initializing Store...");
    let uid = localStorage.getItem(UID_KEY);
    if (!uid) {
        uid = 'user_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
        localStorage.setItem(UID_KEY, uid);
    }
    this.userId = uid;

    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            this.companions = parsed.companions || [];
            this.moments = parsed.moments || [];
            this.userProfile = parsed.userProfile || DEFAULT_USER_IDENTITY;
        } catch(e) {
            this.seedLocalData();
        }
    } else {
        this.seedLocalData();
    }
    this.initFirebase();
  }

  // V1.5.3: Smart Merge Strategy to fix data loss (disappearing messages)
  private mergeCompanions(local: Companion[], cloud: Companion[]): Companion[] {
      const mergedMap = new Map<string, Companion>();
      
      // 1. Put all Cloud items in map
      cloud.forEach(c => mergedMap.set(c.id, c));
      
      // 2. Merge Local items
      local.forEach(localC => {
          const cloudC = mergedMap.get(localC.id);
          if (cloudC) {
               // Merge Chat History: Union unique IDs
               const historyMap = new Map<string, Message>();
               cloudC.chatHistory.forEach(m => historyMap.set(m.id, m));
               localC.chatHistory.forEach(m => historyMap.set(m.id, m)); // Local wins collision (preserves recent edits)
               const mergedHistory = Array.from(historyMap.values())
                   .sort((a, b) => a.timestamp - b.timestamp);

               // Merge Album: Union unique IDs
               const albumMap = new Map<string, AlbumPhoto>();
               cloudC.album.forEach(a => albumMap.set(a.id, a));
               localC.album.forEach(a => albumMap.set(a.id, a));
               const mergedAlbum = Array.from(albumMap.values())
                   .sort((a, b) => b.timestamp - a.timestamp);

               // Merge Conflict State: Prefer newer check to avoid rollback
               const localT = localC.conflictState?.lastCheck || 0;
               const cloudT = cloudC.conflictState?.lastCheck || 0;
               const mergedConflict = localT > cloudT ? localC.conflictState : cloudC.conflictState;

               mergedMap.set(localC.id, {
                   ...cloudC,
                   ...localC, // Prefer local primitive fields (e.g. edited name) for active session
                   chatHistory: mergedHistory,
                   album: mergedAlbum,
                   conflictState: mergedConflict
               });
          } else {
              // Local has companion that cloud doesn't (New companion)
              mergedMap.set(localC.id, localC);
          }
      });

      return Array.from(mergedMap.values());
  }

  private mergeMoments(local: Moment[], cloud: Moment[]): Moment[] {
      const map = new Map<string, Moment>();
      cloud.forEach(m => map.set(m.id, m));
      local.forEach(m => map.set(m.id, m)); // Local takes priority (prevents likes/comments disappearing)
      return Array.from(map.values()).sort((a, b) => b.timestamp - a.timestamp);
  }

  private initFirebase() {
      if (!firestoreDb) return;
      const userDocRef = doc(firestoreDb, "users", this.userId);
      onSnapshot(userDocRef, (docSnapshot) => {
          if (docSnapshot.exists()) {
              const data = docSnapshot.data();
              if (data) {
                  // V1.5.3: Use Smart Merge instead of direct assignment
                  const cloudCompanions = data.companions || [];
                  const cloudMoments = data.moments || [];

                  this.companions = this.mergeCompanions(this.companions, cloudCompanions);
                  this.moments = this.mergeMoments(this.moments, cloudMoments);
                  
                  // For UserProfile, we can trust cloud or local. 
                  // If local has changes not saved yet, we might overwrite. 
                  // But Profile edits are rare. Let's keep data.userProfile as truth for now to enable sync.
                  // Or we could implement merge if needed. For now, let's stick to safe sync.
                  if (data.userProfile) {
                      this.userProfile = { ...this.userProfile, ...data.userProfile };
                  }
                  
                  this.saveLocal();
              }
          } else {
              this.saveCloud();
          }
      }, (error) => {});
  }

  private seedLocalData() {
      this.companions = [...INITIAL_COMPANIONS];
      this.moments = [...INITIAL_MOMENTS];
      this.userProfile = { ...DEFAULT_USER_IDENTITY };
      this.saveLocal();
  }

  private save() {
      this.saveLocal();
      if (this.saveTimeout) clearTimeout(this.saveTimeout);
      this.saveTimeout = setTimeout(() => {
          this.saveCloud();
      }, 2000);
  }

  private saveLocal() {
      try {
          const data = safeSanitize({
              companions: this.companions,
              moments: this.moments,
              userProfile: this.userProfile
          });
          localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      } catch (e) {
          console.error("Local save failed", e);
      }
  }

  private saveCloud() {
      if (!firestoreDb) return;
      try {
          const userDocRef = doc(firestoreDb, "users", this.userId);
          const cleanData = safeSanitize({
              companions: this.companions,
              moments: this.moments,
              userProfile: this.userProfile,
              lastUpdated: Date.now()
          });
          setDoc(userDocRef, cleanData, { merge: true });
      } catch (e) {}
  }

  getCompanions() { return this.companions; }
  getCompanion(id: string) { return this.companions.find(c => c.id === id); }
  getMoments() { return this.moments; }
  getUserProfile() { return this.userProfile; }

  async updateCompanion(updated: Companion) { 
      this.companions = this.companions.map(c => c.id === updated.id ? updated : c);
      this.save();
  }

  async addCompanion(newCompanion: Companion) { 
      this.companions = [...this.companions, newCompanion];
      this.save();
  }

  async updateUserProfile(profile: UserIdentity) { 
      this.userProfile = profile; 
      this.save();
  }

  async addMessage(companionId: string, message: Message) {
    const companion = this.getCompanion(companionId);
    if (companion) {
      const updatedHistory = [...companion.chatHistory, message];
      const updatedCompanion = { ...companion, chatHistory: updatedHistory };
      
      // V1.5.2: Instant Conflict Trigger based on Keywords
      if (message.role === 'user') {
          const isHostile = HOSTILE_KEYWORDS.some(r => r.test(message.content));
          if (isHostile) {
              updatedCompanion.conflictState = {
                  isActive: true,
                  userNegativeScore: 10,
                  conflictLevel: 'High',
                  lastCheck: Date.now()
              };
          }
      }

      this.companions = this.companions.map(c => c.id === companionId ? updatedCompanion : c);
      this.save();
      this.messageCounter++;
      
      // V1.5.2: Run AI analysis every message to be safe, unless already triggered by keyword above
      if (message.role === 'user') {
         // Even if keyword triggered, we can still let AI analyze to refine the "score" or check for resolution later
         this.updateConflictState(companionId);
      }
    }
  }

  async setChatHistory(companionId: string, history: Message[]) {
      const companion = this.getCompanion(companionId);
      if (companion) {
          this.updateCompanion({ ...companion, chatHistory: history });
      }
  }
  
  async updateConflictState(companionId: string) {
      const companion = this.getCompanion(companionId);
      if (!companion) return;
      const result = await analyzeConflictState(companion.chatHistory);
      
      // V1.5.1 Update: Lower threshold to 6 and accept Medium level to be more sensitive
      const isConflict = result.user_negative_score >= 6;
      
      const newConflictState = {
          isActive: isConflict,
          userNegativeScore: result.user_negative_score,
          conflictLevel: result.conflict_level,
          lastCheck: Date.now()
      };
      
      this.updateCompanion({ ...companion, conflictState: newConflictState });
  }

  async addMoment(moment: Moment) {
    this.moments = [moment, ...this.moments];
    this.save();
  }

  async addComment(momentId: string, comment: string) {
      const userCommentObj = { role: 'user' as const, name: 'Me', content: comment };
      const localMoment = this.moments.find(m => m.id === momentId);
      if(localMoment) {
          localMoment.comments.push(userCommentObj);
          this.save();
      }
  }
  
  async likeMoment(momentId: string) {
      const moment = this.moments.find(m => m.id === momentId);
      if (!moment) return;
      let newLikes = moment.likes;
      let newIsLiked = moment.isLiked;
      if (moment.isLiked) {
          newLikes = Math.max(0, moment.likes - 1);
          newIsLiked = false;
      } else {
          newLikes = moment.likes + 1;
          newIsLiked = true;
          if (moment.authorRole === 'model' && moment.companionId) {
              const comp = this.getCompanion(moment.companionId);
              if (comp) {
                  this.updateCompanion({ ...comp, interactionScore: comp.interactionScore + 5 });
              }
          }
      }
      moment.likes = newLikes;
      moment.isLiked = newIsLiked;
      this.save();
  }

  async toggleMemoryAnchor(companionId: string, messageId: string) {
      const companion = this.getCompanion(companionId);
      if (!companion) return;
      const msg = companion.chatHistory.find(m => m.id === messageId);
      if (!msg) return;
      const isAnchoring = !msg.isMemoryAnchored;
      const updatedHistory = companion.chatHistory.map(m => 
        m.id === messageId ? { ...m, isMemoryAnchored: isAnchoring } : m
      );
      let updatedMemories = companion.memories;
      const memId = `mem_${messageId}`;
      if (isAnchoring) {
          updatedMemories = [...updatedMemories, {
              id: memId,
              content: msg.content.substring(0, 150),
              timestamp: Date.now(),
              type: 'text',
              isCore: true
          }];
      } else {
          updatedMemories = updatedMemories.filter(m => m.id !== memId);
      }
      this.updateCompanion({ ...companion, chatHistory: updatedHistory, memories: updatedMemories });
  }

  async checkProactiveMessaging() {}

  async addAlbumPhoto(companionId: string, photo: AlbumPhoto) {
      const companion = this.getCompanion(companionId);
      if (companion) {
          const newAlbum = [photo, ...companion.album];
          companion.album = newAlbum; 
          this.save();
      }
  }

  async deleteAlbumPhoto(companionId: string, photoId: string) {
      const companion = this.getCompanion(companionId);
      if (companion) {
          const newAlbum = companion.album.filter(p => p.id !== photoId);
          this.updateCompanion({ ...companion, album: newAlbum });
      }
  }

  changeCompanionAvatar(companionId: string, newAvatarUrl: string) {
      const companion = this.getCompanion(companionId);
      if (!companion) return;
      const oldAvatarPhoto: AlbumPhoto = {
          id: `archived_avi_${Date.now()}`,
          url: companion.avatar,
          description: 'Historical Avatar',
          uploadedBy: 'model',
          timestamp: Date.now(),
          type: 'avatar_history'
      };
      const updated = { ...companion, avatar: newAvatarUrl, album: [oldAvatarPhoto, ...companion.album] };
      this.updateCompanion(updated);
  }
}

export const db = new Store();
