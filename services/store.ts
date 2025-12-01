
import { Companion, Moment, Message, UserIdentity, ChatSettings, AlbumPhoto } from '../types';
import { generateProactiveMessage, generateMomentComment, analyzeConflictState, generateMomentReply } from './gemini';
import { db as firestoreDb } from './firebase';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';

// Helper: Deep clone object while stripping 'undefined' values, breaking circular references, and removing DOM nodes
function safeSanitize(obj: any, seen = new WeakSet<any>()): any {
    if (obj === null || typeof obj !== 'object') return obj;
    if (obj instanceof Date) return obj.toISOString();
    
    // Cycle detection
    if (seen.has(obj)) return undefined;
    seen.add(obj);

    // Filter out React Internals / DOM Nodes / Events aggressively
    if (obj.nodeType || obj.nativeEvent || obj._reactInternals || obj.$$typeof || obj.constructor?.name === 'SyntheticBaseEvent') return undefined;

    // Handle Arrays
    if (Array.isArray(obj)) {
        const arr: any[] = [];
        for (const item of obj) {
            const val = safeSanitize(item, seen);
            if (val !== undefined) arr.push(val);
        }
        return arr;
    }

    // Filter out complex class instances (keep plain objects and those that look like data)
    // We allow Object prototype or null prototype.
    const proto = Object.getPrototypeOf(obj);
    if (proto !== null && proto !== Object.prototype) {
        // Special handling for Firestore Timestamps or similar data-like classes could go here
        // For now, if it has 'seconds' and 'nanoseconds', we treat it as data (Firestore Timestamp)
        if (typeof obj.seconds === 'number' && typeof obj.nanoseconds === 'number') {
            // Keep it
        } else {
             // If it looks suspicious (like having 'src' and 'i' which caused the user error), skip it
             // or try to extract only safe keys. For safety, we skip known dangerous patterns.
             if (obj.constructor && obj.constructor.name !== 'Object') {
                 // return undefined; // Too aggressive?
             }
        }
    }

    const result: any = {};
    for (const key of Object.keys(obj)) {
        // Skip internal/private properties
        if (key.startsWith('__') || key.startsWith('_')) continue;
        if (['ownerDocument', 'parentNode', 'delegateTarget', 'sourceCapabilities', 'view'].includes(key)) continue;
        
        try {
            const value = safeSanitize(obj[key], seen);
            if (value !== undefined) {
                result[key] = value;
            }
        } catch (e) {
            // Ignore properties that throw on access
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
    // V6 Appearance: Faceless / POV / Atmosphere focused (Updated to Chinese)
    appearance: '20岁的清纯女孩，皮肤白皙，穿着白色宽松毛衣或居家服。第一人称视角(POV)，特写手部动作、拿的东西或背影。完全不露脸。光线柔和，温馨治愈的氛围。(Female)',
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
    // V8 Avatar: Micah Style - Handsome Boy (Cool hair 'fonze', Asian skin, Smirk) -> Glasses added for Physics vibe
    avatar: 'https://api.dicebear.com/9.x/micah/svg?seed=JiangHuan&baseColor=f9c9b6&hair=fonze&mouth=smirk&glassesProbability=100&facialHairProbability=0&backgroundColor=c0aede',
    gender: 'Male',
    age: '22',
    relationship: '暧昧中',
    // REFACTORED: Physics Student Persona
    personalityDescription: '清冷理智的物理系天才学霸。智商极高，性格沉稳，平时总是泡在实验室里。虽然不善言辞，但会用极其严谨的逻辑来分析生活中的一切，包括对你的喜欢。',
    background: '在图书馆复习期末考时偶然坐在他对面，因为一道物理题产生交集。后来发现他是同校物理系的风云人物。',
    // V6 Appearance: Faceless / POV / Physics & Lab vibe (Updated to Chinese)
    appearance: '22岁的男生，穿着整洁的衬衫或实验室白大褂，戴着银丝眼镜，手指修长骨节分明。第一人称视角(POV)，聚焦于拿着书本的手、实验器材、笔记或写满公式的黑板。不露脸。知性、冷静、理智的氛围。(Male)',
    supplementaryConfig: '看到你不懂的题会一边叹气一边手把手教你。喜欢喝黑咖啡。对不严谨的事情很较真。',
    dimensions: {
      empathy: 60,
      rationality: 95,
      humor: 40,
      intimacy: 80, 
      creativity: 85,
    },
    userIdentity: { ...DEFAULT_USER_IDENTITY, name: '同学', relationship: '暧昧对象' },
    chatSettings: { ...DEFAULT_CHAT_SETTINGS, responseLength: 'short', allowAuxiliary: true },
    memories: [],
    chatHistory: [
      { id: 'msg2', role: 'model', content: '刚做完这组实验数据，误差在预期范围内。你看，这个波形...是不是很完美？🧪', timestamp: Date.now() - 100000, image: 'https://images.unsplash.com/photo-1532094349884-543bc11b234d?w=600&auto=format&fit=crop&q=80' } // Lab equipment
    ],
    // V10 Album: New Stable Unsplash URLs (Physics/Lab Theme)
    album: [
        { 
            id: 'p1_m', 
            // Writing formulas / Study
            url: 'https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?w=600&auto=format&fit=crop&q=80', 
            description: '今晚通宵推导公式。', 
            uploadedBy: 'model', 
            timestamp: Date.now() - 86400000, 
            type: 'normal' 
        },
        { 
            id: 'p2_m', 
            // Library / Books
            url: 'https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=600&auto=format&fit=crop&q=80', 
            description: '图书馆的角落，这里很安静。', 
            uploadedBy: 'model', 
            timestamp: Date.now() - 172800000, 
            type: 'normal' 
        },
        { 
            id: 'p3_m', 
            // Coffee / Night
            url: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=600&auto=format&fit=crop&q=80', 
            description: '实验必需品。', 
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
  
  // V1.9.2: Permanent Tombstones for deleted IDs to survive reload/sync
  private deletedCompanionIds: Set<string> = new Set();
  
  // V1.9.3: Subscription System
  private listeners: (() => void)[] = [];

  constructor() {
    this.init();
  }
  
  public subscribe(listener: () => void) {
      this.listeners.push(listener);
      // Return unsubscribe function
      return () => {
          this.listeners = this.listeners.filter(l => l !== listener);
      };
  }
  
  private notify() {
      this.listeners.forEach(l => l());
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
            // Load tombstones
            if (parsed.deletedCompanionIds && Array.isArray(parsed.deletedCompanionIds)) {
                this.deletedCompanionIds = new Set(parsed.deletedCompanionIds);
            }
        } catch(e) {
            this.seedLocalData();
        }
    } else {
        this.seedLocalData();
    }
    
    // Safety check: Filter out any deleted items that might have sneaked into companions array
    this.companions = this.companions.filter(c => !this.deletedCompanionIds.has(c.id));
    
    this.initFirebase();
  }

  // V1.5.3: Smart Merge Strategy to fix data loss (disappearing messages)
  // V1.6.0: Enhanced to recover images if pruned locally
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
               
               // First fill with Cloud messages (which contain full images)
               cloudC.chatHistory.forEach(m => historyMap.set(m.id, m));
               
               // Then overlay Local messages
               localC.chatHistory.forEach(localM => {
                   const cloudM = historyMap.get(localM.id);
                   // If local message has stripped image (due to Quota pruning) but cloud has it, Restore it.
                   if (cloudM && !localM.image && cloudM.image) {
                       localM.image = cloudM.image;
                   }
                   historyMap.set(localM.id, localM); // Local still wins for text edits/timestamps
               });
               
               const mergedHistory = Array.from(historyMap.values())
                   .sort((a, b) => a.timestamp - b.timestamp);

               // Merge Album: Union unique IDs, similar image restoration logic
               const albumMap = new Map<string, AlbumPhoto>();
               cloudC.album.forEach(a => albumMap.set(a.id, a));
               localC.album.forEach(localA => {
                   const cloudA = albumMap.get(localA.id);
                   if (cloudA && (!localA.url || localA.url === '') && cloudA.url) {
                       localA.url = cloudA.url;
                   }
                   albumMap.set(localA.id, localA);
               });
               
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

      // V1.9.2: Strict Filter using persistent Tombstones
      return Array.from(mergedMap.values()).filter(c => !this.deletedCompanionIds.has(c.id));
  }

  private mergeMoments(local: Moment[], cloud: Moment[]): Moment[] {
      const map = new Map<string, Moment>();
      cloud.forEach(m => map.set(m.id, m));
      local.forEach(m => {
          const cloudM = map.get(m.id);
          // Restore image if pruned locally
          if (cloudM && !m.image && cloudM.image) {
              m.image = cloudM.image;
          }
          map.set(m.id, m);
      }); // Local takes priority (prevents likes/comments disappearing)
      return Array.from(map.values()).sort((a, b) => b.timestamp - a.timestamp);
  }

  private initFirebase() {
      if (!firestoreDb) return;
      const userDocRef = doc(firestoreDb, "users", this.userId);
      onSnapshot(userDocRef, (docSnapshot) => {
          if (docSnapshot.exists()) {
              const data = docSnapshot.data();
              if (data) {
                  // V1.9.2: Merge Tombstones from Cloud (Union)
                  const cloudDeletedIds = new Set<string>(data.deletedCompanionIds || []);
                  cloudDeletedIds.forEach(id => this.deletedCompanionIds.add(id));

                  // V1.5.3: Use Smart Merge instead of direct assignment
                  const cloudCompanions = data.companions || [];
                  const cloudMoments = data.moments || [];

                  this.companions = this.mergeCompanions(this.companions, cloudCompanions);
                  this.moments = this.mergeMoments(this.moments, cloudMoments);
                  
                  if (data.userProfile) {
                      this.userProfile = { ...this.userProfile, ...data.userProfile };
                  }
                  
                  this.saveLocal();
                  // V1.9.4: Notify UI after cloud sync
                  this.notify();
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

  // V1.6.0: Quota-Safe Local Save
  private saveLocal() {
      try {
          const rawData = {
              companions: this.companions,
              moments: this.moments,
              userProfile: this.userProfile,
              // V1.9.2 Persist Tombstones
              deletedCompanionIds: Array.from(this.deletedCompanionIds)
          };
          
          const cleanData = safeSanitize(rawData);
          const json = JSON.stringify(cleanData);
          
          try {
              localStorage.setItem(STORAGE_KEY, json);
          } catch (e: any) {
              if (this.isQuotaError(e)) {
                  console.warn("LocalStorage Quota Exceeded. Attempting to prune local cache...");
                  this.saveLocalPruned(cleanData);
              } else {
                  console.error("Local save error:", e);
              }
          }
      } catch (e) {
          console.error("Local save failed", e);
      }
      // V1.9.3 Notify listeners after save
      this.notify();
  }
  
  private isQuotaError(e: any): boolean {
      return (
          e instanceof DOMException &&
          (e.code === 22 || e.code === 1014 || e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED') &&
          (localStorage.length !== 0)
      );
  }

  private saveLocalPruned(data: any) {
      // Create deep clone for pruning
      const pruned = JSON.parse(JSON.stringify(data));
      
      // Strategy 1: Truncate History
      if (pruned.companions) {
          pruned.companions = pruned.companions.map((c: any) => ({
              ...c,
              chatHistory: c.chatHistory.slice(-30) // Keep last 30
          }));
      }

      try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(pruned));
          console.log("Saved pruned local data (Strategy 1: History Truncated)");
          return;
      } catch (e) {
          if (!this.isQuotaError(e)) return;
      }

      // Strategy 2: Strip Base64 Images (Fallback to Cloud for images)
      if (pruned.companions) {
          pruned.companions = pruned.companions.map((c: any) => ({
              ...c,
              chatHistory: c.chatHistory.map((m: any) => {
                   if (m.image && m.image.length > 200 && m.image.startsWith('data:')) {
                       return { ...m, image: undefined }; // Strip image
                   }
                   return m;
              }),
              album: c.album.map((p: any) => {
                   if (p.url && p.url.length > 200 && p.url.startsWith('data:')) {
                       return { ...p, url: '' }; // Strip base64
                   }
                   return p;
              })
          }));
      }
      if (pruned.moments) {
          pruned.moments = pruned.moments.map((m: any) => {
              if (m.image && m.image.length > 200 && m.image.startsWith('data:')) {
                  return { ...m, image: undefined };
              }
              return m;
          });
      }

      try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(pruned));
          console.log("Saved pruned local data (Strategy 2: Images Stripped)");
      } catch (e) {
          console.error("Critical: LocalStorage full even after pruning.");
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
              // V1.9.2 Sync Tombstones to Cloud
              deletedCompanionIds: Array.from(this.deletedCompanionIds),
              lastUpdated: Date.now()
          });
          setDoc(userDocRef, cleanData, { merge: true });
      } catch (e) {}
  }

  // V1.9.4: Safe Getter that always filters based on tombstones
  getCompanions() { 
      // Strict filter just in case the main array still contains it
      return this.companions.filter(c => !this.deletedCompanionIds.has(c.id)); 
  }
  
  getCompanion(id: string) { return this.getCompanions().find(c => c.id === id); }
  
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

  // V1.9.2: Delete Companion with Persistent Tombstone
  async deleteCompanion(id: string) {
      this.deletedCompanionIds.add(id);
      this.companions = this.companions.filter(c => c.id !== id);
      this.saveLocal();
      this.saveCloud(); // Force immediate cloud update
  }

  async updateUserProfile(profile: UserIdentity) { 
      this.userProfile = profile; 
      this.save();
  }

  async addMessage(companionId: string, message: Message) {
    const companion = this.getCompanion(companionId);
    if (companion) {
      // V1.9.6 SECURITY: Force content to be a string.
      // This prevents Event objects or complex structures from being saved as message content,
      // which causes circular JSON errors.
      if (typeof message.content !== 'string') {
          console.warn("Detected non-string message content. Coercing to string.", message.content);
          message.content = String(message.content || "");
      }
      
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

  // V1.7: Support AI authors for comments
  async addComment(momentId: string, comment: string, authorCompanion?: Companion) {
      const localMoment = this.moments.find(m => m.id === momentId);
      if(localMoment) {
          // If authorCompanion is provided, it's an AI comment. Otherwise, it's the user.
          const commentObj = authorCompanion 
            ? { role: 'model' as const, name: authorCompanion.remark || authorCompanion.name, content: comment }
            : { role: 'user' as const, name: this.userProfile.name || 'Me', content: comment };

          localMoment.comments.push(commentObj);
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
