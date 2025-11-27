import { Companion, Moment, Message, UserIdentity, ChatSettings, AlbumPhoto } from '../types';
import { generateProactiveMessage, generateMomentComment, analyzeConflictState, generateMomentReply } from './gemini';

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
  companions: Companion[] = INITIAL_COMPANIONS;
  moments: Moment[] = INITIAL_MOMENTS;
  userProfile: UserIdentity = DEFAULT_USER_IDENTITY; // For global user profile (B11)

  getCompanions() { return this.companions; }
  getCompanion(id: string) { return this.companions.find(c => c.id === id); }
  updateCompanion(updated: Companion) { this.companions = this.companions.map(c => c.id === updated.id ? updated : c); }
  addCompanion(newCompanion: Companion) { this.companions = [...this.companions, newCompanion]; }
  
  // B11: Global User Profile
  getUserProfile() { return this.userProfile; }
  updateUserProfile(profile: UserIdentity) { 
      this.userProfile = profile; 
      // Sync to companions? For now, we assume companions hold a copy of user identity specific to them, but global profile is for "Me" page.
  }

  addMessage(companionId: string, message: Message) {
    const companion = this.getCompanion(companionId);
    if (companion) {
      companion.chatHistory = [...companion.chatHistory, message];
      this.updateCompanion(companion);
      
      // A9: Trigger Conflict Analysis (Async) if user message
      if (message.role === 'user') {
          this.updateConflictState(companionId);
      }
    }
  }
  
  // V1.3.1 A9: Conflict State Analysis
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
      if (isConflict) console.log(`[Conflict Detected] Companion ${companion.name} entered argument state.`);
  }

  setChatHistory(companionId: string, history: Message[]) {
      const companion = this.getCompanion(companionId);
      if (companion) {
          companion.chatHistory = history;
          this.updateCompanion(companion);
      }
  }

  getMoments() { return this.moments; }

  // A9: AI Reacts to User Moment
  async addMoment(moment: Moment) {
    this.moments = [moment, ...this.moments];
    
    // If User posted, trigger AI reaction (A9)
    if (moment.authorRole === 'user') {
        const companions = this.getCompanions();
        // Pick one or two random companions to react
        const reactor = companions[Math.floor(Math.random() * companions.length)];
        if (reactor) {
            // A9 Check: If in Argument State, SKIP interaction
            if (reactor.conflictState.isActive) {
                console.log(`[A9] ${reactor.name} is in argument state. Skipping interaction.`);
                return;
            }

            setTimeout(async () => {
                const commentText = await generateMomentComment(reactor, moment.content);
                const updatedMoments = this.moments.map(m => {
                    if (m.id === moment.id) {
                        return {
                            ...m,
                            comments: [...m.comments, { role: 'model', name: reactor.remark || reactor.name, content: commentText }]
                        } as Moment;
                    }
                    return m;
                });
                this.moments = updatedMoments;
            }, 5000); // 5s delay simulation
        }
    }
  }

  // V1.4 A12: Add Comment and Auto Reply
  async addComment(momentId: string, comment: string) {
      const moment = this.moments.find(m => m.id === momentId);
      if (!moment) return;
      
      const userCommentObj = { role: 'user' as const, name: 'Me', content: comment };
      
      // Update store immediately with user comment
      this.moments = this.moments.map(m => {
          if (m.id === momentId) {
              return { ...m, comments: [...m.comments, userCommentObj] };
          }
          return m;
      });

      // A12: If moment belongs to AI, trigger reply
      if (moment.authorRole === 'model' && moment.companionId) {
          const companion = this.getCompanion(moment.companionId);
          if (companion && !companion.conflictState.isActive) {
               // Simulate typing delay
               setTimeout(async () => {
                    const replyText = await generateMomentReply(companion, moment.content, comment);
                    const aiReplyObj = { role: 'model' as const, name: companion.remark || companion.name, content: replyText };
                    
                    this.moments = this.moments.map(m => {
                        if (m.id === momentId) {
                             return { ...m, comments: [...m.comments, aiReplyObj] };
                        }
                        return m;
                    });
               }, 3000);
          }
      }
  }
  
  // V1.4 B15: Toggle Like logic
  likeMoment(momentId: string) {
      this.moments = this.moments.map(m => {
          if (m.id === momentId) {
              let newLikes = m.likes;
              let newIsLiked = m.isLiked;

              if (m.isLiked) {
                  newLikes = Math.max(0, m.likes - 1);
                  newIsLiked = false;
              } else {
                  newLikes = m.likes + 1;
                  newIsLiked = true;
                  // A8: Boost interaction score only on Like
                  if (m.authorRole === 'model' && m.companionId) {
                      const comp = this.getCompanion(m.companionId);
                      if (comp) {
                          comp.interactionScore += 5;
                          this.updateCompanion(comp);
                      }
                  }
              }
              return { ...m, likes: newLikes, isLiked: newIsLiked };
          }
          return m;
      });
  }

  // A5: Memory Anchor (Fixed ID stability and filtering)
  toggleMemoryAnchor(companionId: string, messageId: string) {
      const companion = this.getCompanion(companionId);
      if (!companion) return;

      const msg = companion.chatHistory.find(m => m.id === messageId);
      if (!msg) return;

      const isAnchoring = !msg.isMemoryAnchored;
      const updatedHistory = companion.chatHistory.map(m => 
        m.id === messageId ? { ...m, isMemoryAnchored: isAnchoring } : m
      );

      let updatedMemories = companion.memories;
      const memId = `mem_${messageId}`; // V1.4: Stable ID based on message ID

      if (isAnchoring) {
          updatedMemories = [...updatedMemories, {
              id: memId,
              content: msg.content.substring(0, 150),
              timestamp: Date.now(),
              type: 'text',
              isCore: true
          }];
      } else {
          // V1.4: Fixed filtering to target specific memory ID
          updatedMemories = updatedMemories.filter(m => m.id !== memId);
      }
      this.updateCompanion({ ...companion, chatHistory: updatedHistory, memories: updatedMemories });
  }

  // A7 + A8: Proactive Messaging & Dynamic Frequency
  async checkProactiveMessaging() {
      const now = Date.now();
      const currentHour = new Date().getHours();
      const TWELVE_HOURS = 12 * 60 * 60 * 1000;

      for (const c of this.companions) {
          // A9: Don't proactive msg if arguing
          if (c.conflictState.isActive) continue;

          const lastMsg = c.chatHistory[c.chatHistory.length - 1];
          if (!lastMsg) continue;

          let triggerReason: 'morning' | 'night' | 'no_reply' | null = null;
          const timeSinceLast = now - lastMsg.timestamp;

          if (timeSinceLast > TWELVE_HOURS) {
             if (currentHour >= 7 && currentHour <= 9) triggerReason = 'morning';
             else if (currentHour >= 22 && currentHour <= 23) triggerReason = 'night';
          }
          
          // A8: If score is high, check more frequently (simulated here by reducing threshold)
          const replyThreshold = c.interactionScore > 80 ? TWELVE_HOURS : 24 * 60 * 60 * 1000;

          if (timeSinceLast > replyThreshold && !triggerReason) {
              triggerReason = 'no_reply';
          }

          if (triggerReason) {
              const content = await generateProactiveMessage(c, triggerReason);
              const pokeMsg: Message = {
                 id: `poke_${now}`,
                 role: 'model',
                 content: content,
                 timestamp: now
              };
              this.addMessage(c.id, pokeMsg);
          }
      }
  }

  // C4: Album
  addAlbumPhoto(companionId: string, photo: AlbumPhoto) {
      const companion = this.getCompanion(companionId);
      if (companion) {
          const newAlbum = [photo, ...companion.album];
          this.updateCompanion({ ...companion, album: newAlbum });
      }
  }

  // A10: Adaptive Album Maintenance
  deleteAlbumPhoto(companionId: string, photoId: string) {
      const companion = this.getCompanion(companionId);
      if (companion) {
          const newAlbum = companion.album.filter(p => p.id !== photoId);
          this.updateCompanion({ ...companion, album: newAlbum });

          // A10: Trigger "Recompensation" photo after a delay
          setTimeout(() => {
              const restorationPhoto: AlbumPhoto = {
                  id: `restore_${Date.now()}`,
                  url: `https://picsum.photos/id/${Math.floor(Math.random()*100)}/300/300`, // Simulated generation
                  description: 'AI noticed the album felt empty and added a new memory.',
                  uploadedBy: 'model',
                  timestamp: Date.now(),
                  type: 'normal'
              };
              this.addAlbumPhoto(companionId, restorationPhoto);
          }, 5000); // 5s delay
      }
  }

  // C5 & C6: Dynamic Avatar & Archiving
  changeCompanionAvatar(companionId: string, newAvatarUrl: string) {
      const companion = this.getCompanion(companionId);
      if (!companion) return;

      // C6: Archive old avatar
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