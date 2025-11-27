import { Companion, Moment, Message, UserIdentity, ChatSettings, AlbumPhoto } from '../types';
import { generateProactiveMessage, generateMomentComment, analyzeConflictState, generateMomentReply } from './gemini';

// --- Initial Constants (Used for seeding DB or Offline Mode) ---
const DEFAULT_USER_IDENTITY: UserIdentity = {
  name: 'Traveler',
  gender: 'Unknown',
  age: 'Unknown',
  relationship: 'Friend',
  personality: 'Curious and kind',
  avatar: 'https://ui-avatars.com/api/?name=User&background=random' 
};

const DEFAULT_CHAT_SETTINGS: ChatSettings = {
  responseLength: 'medium',
  allowAuxiliary: true,
  language: 'en'
};

const INITIAL_COMPANIONS: Companion[] = [
  {
    id: 'c1',
    name: 'Elysia',
    remark: 'Ellie',
    avatar: 'https://picsum.photos/id/64/200/200',
    gender: 'Female',
    age: 'Appears 19',
    relationship: 'Childhood Friend',
    personalityDescription: 'A gentle and empathetic listener who loves art and nature.',
    background: 'Grew up in a digital garden, loves painting sunsets.',
    appearance: 'A young woman with long pink hair, wearing a white summer dress, soft expression, blue eyes.',
    supplementaryConfig: 'Loves strawberry cake. Often hums a melody.',
    dimensions: {
      empathy: 90,
      rationality: 30,
      humor: 50,
      intimacy: 70,
      creativity: 85,
    },
    userIdentity: { ...DEFAULT_USER_IDENTITY, name: 'Senpai', relationship: 'Childhood Friend' },
    chatSettings: { ...DEFAULT_CHAT_SETTINGS },
    memories: [
      { id: 'm1', content: 'User likes sunsets.', timestamp: Date.now(), type: 'text', isCore: true }
    ],
    chatHistory: [
      { id: 'msg1', role: 'model', content: 'Hello Senpai! The sky is beautiful today. How are you feeling?', timestamp: Date.now() - 36000000 }
    ],
    album: [
        { id: 'p1', url: 'https://picsum.photos/id/10/300/300', description: 'A walk in the park', uploadedBy: 'model', timestamp: Date.now(), type: 'normal' }
    ],
    interactionScore: 50,
    conflictState: { isActive: false, userNegativeScore: 0, conflictLevel: 'Low', lastCheck: 0 }
  },
  {
    id: 'c2',
    name: 'Atlas',
    avatar: 'https://picsum.photos/id/91/200/200',
    gender: 'Male',
    age: 'AI Construct',
    relationship: 'Assistant',
    personalityDescription: 'A rational strategic advisor and coding partner. Stoic and precise.',
    background: 'Created to optimize workflows and solve complex logic puzzles.',
    appearance: 'A futuristic android male, metallic accents, glowing blue interface elements, sleek grey uniform.',
    dimensions: {
      empathy: 20,
      rationality: 95,
      humor: 30,
      intimacy: 15,
      creativity: 80,
    },
    userIdentity: { ...DEFAULT_USER_IDENTITY, name: 'Operator', relationship: 'Commander' },
    chatSettings: { ...DEFAULT_CHAT_SETTINGS, responseLength: 'short', allowAuxiliary: false },
    memories: [],
    chatHistory: [
      { id: 'msg2', role: 'model', content: 'Systems online. Ready to assist with your objectives, Operator.', timestamp: Date.now() - 100000 }
    ],
    album: [],
    interactionScore: 30,
    conflictState: { isActive: false, userNegativeScore: 0, conflictLevel: 'Low', lastCheck: 0 }
  }
];

const INITIAL_MOMENTS: Moment[] = [
  {
    id: 'post1',
    companionId: 'c1',
    authorRole: 'model',
    content: 'Just saw a flower blooming through the pavement. Life always finds a way. 🌸',
    image: 'https://picsum.photos/id/106/500/300',
    timestamp: Date.now() - 3600000,
    likes: 12,
    isLiked: false,
    comments: []
  }
];

class Store {
  companions: Companion[] = [];
  moments: Moment[] = [];
  userProfile: UserIdentity = DEFAULT_USER_IDENTITY;
  
  private userId: string = 'guest';
  // Optimization: Track message count to throttle expensive API calls
  private messageCounter: number = 0;

  constructor() {
    this.init();
  }

  async init() {
    console.log("Initializing Store (Offline Mode)...");
    this.seedLocalData();
  }

  private seedLocalData() {
      this.companions = [...INITIAL_COMPANIONS];
      this.moments = [...INITIAL_MOMENTS];
      this.userProfile = { ...DEFAULT_USER_IDENTITY };
  }

  // --- Public API ---

  getCompanions() { return this.companions; }
  getCompanion(id: string) { return this.companions.find(c => c.id === id); }
  getMoments() { return this.moments; }
  getUserProfile() { return this.userProfile; }

  // --- Async Write Operations (Local Only) ---

  async updateCompanion(updated: Companion) { 
      this.companions = this.companions.map(c => c.id === updated.id ? updated : c);
  }

  async addCompanion(newCompanion: Companion) { 
      this.companions = [...this.companions, newCompanion];
  }

  async updateUserProfile(profile: UserIdentity) { 
      this.userProfile = profile; 
  }

  async addMessage(companionId: string, message: Message) {
    const companion = this.getCompanion(companionId);
    if (companion) {
      // Optimistic Update
      const updatedHistory = [...companion.chatHistory, message];
      const updatedCompanion = { ...companion, chatHistory: updatedHistory };
      this.companions = this.companions.map(c => c.id === companionId ? updatedCompanion : c);
      
      this.messageCounter++;
      
      // OPTIMIZATION: Only run conflict analysis every 5 messages, AND skip the very first one after reload (counter > 1)
      if (message.role === 'user' && this.messageCounter > 1 && this.messageCounter % 5 === 0) {
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
      const isConflict = result.user_negative_score >= 7 && result.conflict_level === 'High';
      
      const newConflictState = {
          isActive: isConflict,
          userNegativeScore: result.user_negative_score,
          conflictLevel: result.conflict_level,
          lastCheck: Date.now()
      };
      
      this.updateCompanion({ ...companion, conflictState: newConflictState });
      if (isConflict) console.log(`[Conflict] ${companion.name} entered argument state.`);
  }

  async addMoment(moment: Moment) {
    this.moments = [moment, ...this.moments];
    
    if (moment.authorRole === 'user') {
        const companions = this.getCompanions();
        const reactor = companions[Math.floor(Math.random() * companions.length)];
        if (reactor && !reactor.conflictState.isActive) {
            setTimeout(async () => {
                const commentText = await generateMomentComment(reactor, moment.content);
                const newComment = { role: 'model' as const, name: reactor.remark || reactor.name, content: commentText };
                
                // Update Local Moment
                const currentMoment = this.moments.find(m => m.id === moment.id);
                if (currentMoment) {
                    currentMoment.comments.push(newComment);
                }
            }, 5000);
        }
    }
  }

  async addComment(momentId: string, comment: string) {
      const userCommentObj = { role: 'user' as const, name: 'Me', content: comment };
      
      // Optimistic
      const localMoment = this.moments.find(m => m.id === momentId);
      if(localMoment) localMoment.comments.push(userCommentObj);

      if (localMoment && localMoment.authorRole === 'model' && localMoment.companionId) {
          const companion = this.getCompanion(localMoment.companionId);
          if (companion && !companion.conflictState.isActive) {
               setTimeout(async () => {
                    const replyText = await generateMomentReply(companion, localMoment.content, comment);
                    const aiReplyObj = { role: 'model' as const, name: companion.remark || companion.name, content: replyText };
                    
                    const m = this.moments.find(m => m.id === momentId);
                    if(m) m.comments.push(aiReplyObj);
               }, 3000);
          }
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

  async checkProactiveMessaging() {
      // Simple offline check
      if (this.companions.length === 0) {
          setTimeout(() => this.checkProactiveMessaging(), 2000);
          return;
      }
      const now = Date.now();
      const TWELVE_HOURS = 12 * 60 * 60 * 1000;
      
      for (const c of this.companions) {
          if (c.conflictState.isActive) continue;
          const lastMsg = c.chatHistory[c.chatHistory.length - 1];
          if (!lastMsg) continue;
          
          if ((now - lastMsg.timestamp) > TWELVE_HOURS) {
             // Logic for proactive poke would trigger here if extended
          }
      }
  }

  async addAlbumPhoto(companionId: string, photo: AlbumPhoto) {
      const companion = this.getCompanion(companionId);
      if (companion) {
          const newAlbum = [photo, ...companion.album];
          companion.album = newAlbum; 
      }
  }

  async deleteAlbumPhoto(companionId: string, photoId: string) {
      const companion = this.getCompanion(companionId);
      if (companion) {
          const newAlbum = companion.album.filter(p => p.id !== photoId);
          this.updateCompanion({ ...companion, album: newAlbum });

          setTimeout(() => {
              const restorationPhoto: AlbumPhoto = {
                  id: `restore_${Date.now()}`,
                  url: `https://picsum.photos/id/${Math.floor(Math.random()*100)}/300/300`,
                  description: 'AI noticed the album felt empty and added a new memory.',
                  uploadedBy: 'model',
                  timestamp: Date.now(),
                  type: 'normal'
              };
              this.addAlbumPhoto(companionId, restorationPhoto);
          }, 5000); 
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
