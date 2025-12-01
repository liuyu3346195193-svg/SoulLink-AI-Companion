
export type PersonaDimensions = {
  empathy: number; // 共情度
  rationality: number; // 理性度
  humor: number; // 幽默感
  intimacy: number; // 亲密倾向
  creativity: number; // 创造力
};

export type Memory = {
  id: string;
  content: string;
  timestamp: number;
  type: 'text' | 'image' | 'voice';
  isCore: boolean; // Is this a "anchored" core memory
};

export type Message = {
  id: string;
  role: 'user' | 'model';
  content: string;
  timestamp: number;
  image?: string; // Base64
  audio?: string; // Base64
  isMemoryAnchored?: boolean;
};

export type ResponseLength = 'short' | 'medium' | 'long';
export type Language = 'en' | 'zh';
export type InterfaceLanguage = 'en' | 'zh';

export type ChatSettings = {
  responseLength: ResponseLength;
  allowAuxiliary: boolean; // ( ) descriptions
  language: Language;
};

export type UserIdentity = {
  name: string;
  avatar?: string; // V1.1.2 B7: User Avatar
  gender: string;
  age: string;
  relationship: string;
  personality: string;
};

export type AlbumPhoto = {
  id: string;
  url: string; // Base64 or URL
  description: string;
  uploadedBy: 'user' | 'model';
  timestamp: number;
  type: 'normal' | 'synthesized' | 'avatar_history'; // C6: Added avatar_history
};

// V1.3.1 A9: Conflict State Tracking
export type ConflictState = {
    isActive: boolean;
    userNegativeScore: number;
    conflictLevel: 'Low' | 'Medium' | 'High';
    lastCheck: number;
};

export type Companion = {
  id: string;
  name: string;
  remark?: string; // Alias set by user (B9)
  avatar: string;
  
  // A1: Detailed Persona
  gender: string;
  age: string;
  relationship: string; // Default relationship
  personalityDescription: string;
  background: string;
  
  // V1.2.1 C4-3: AI Visual Appearance for Synthesis
  appearance: string; 

  // V1.4 A13: Supplementary Config (Injected into System Instruction)
  supplementaryConfig?: string;

  dimensions: PersonaDimensions;
  
  // A2: User Identity in this relationship
  userIdentity: UserIdentity;

  // A3: Chat Settings
  chatSettings: ChatSettings;

  memories: Memory[];
  chatHistory: Message[];
  
  // C4: Shared Album
  album: AlbumPhoto[];

  // A8: Interaction Score for Dynamic Frequency
  interactionScore: number; 
  
  // A9: Conflict State
  conflictState: ConflictState;
};

export type Moment = {
  id: string;
  companionId?: string; // Optional if user posts
  authorRole: 'user' | 'model'; // A9: Distinguish authors
  content: string;
  image?: string;
  timestamp: number;
  likes: number;
  isLiked?: boolean; // V1.4: Track if current user liked
  comments: { role: 'user' | 'model', name: string, content: string }[]; // Updated comments structure
  location?: string; // A8
};

export enum ViewState {
  CONTACTS = 'CONTACTS',
  CHAT = 'CHAT',
  PROFILE = 'PROFILE',
  MOMENTS = 'MOMENTS',
  ALBUM = 'ALBUM',
  CREATE_COMPANION = 'CREATE_COMPANION',
  USER_SETTINGS = 'USER_SETTINGS', // B11: Me View
  ME = 'ME',
  CHAT_SETTINGS = 'CHAT_SETTINGS' // V1.4 B16/B17
}

export const DICT = {
    en: {
        chats: "Chats",
        moments: "Moments",
        album: "Album",
        me: "Me",
        online: "Online",
        typing: "Typing...",
        createSoul: "Create New Soul",
        edit: "Edit",
        regenerate: "Regenerate",
        uploadPhoto: "Upload Photo",
        synthesize: "Synthesize",
        delete: "Delete",
        feedback: "Feedback",
        settings: "Settings",
        language: "Language",
        download: "Download", // C7
        search: "Search history...", // B10
        remark: "Remark", // B9
        save: "Save",
        post: "Post",
        whatsOnMind: "What's on your mind?",
        userProfile: "User Profile",
        appearance: "Appearance",
        persona: "Persona",
        basicInfo: "Basic Info",
        name: "Name",
        gender: "Gender",
        age: "Age",
        role: "Role",
        bgStory: "Background Story",
        bringLife: "Bring to Life",
        next: "Next",
        cancel: "Cancel",
        deletePhotoConfirm: "Delete this photo?",
        photoDeleted: "Photo deleted.",
        aiRestoring: "AI is restoring the album...", // A10
        translate: "Translate", // A11
        translated: "Translated",
        coreMemories: "Core Memories", // B17
        supplementaryConfig: "Supplementary Settings", // A13
        userIdentitySettings: "Your Identity", // B16
        personalitySpectrum: "Personality Spectrum",
        writeComment: "Write a comment...",
        reply: "Reply",
        argumentWarning: "Conflict State Active",
        auxiliary: "Auxiliary Descriptions",
        responseLength: "Response Length",
        len_short: "Short",
        len_medium: "Medium",
        len_long: "Long",
        deleteCompanion: "Delete Soul",
        deleteCompanionConfirm: "Are you sure you want to delete this Soul? This cannot be undone.",
        
        // Dimensions
        dim_empathy: "Empathy",
        dim_rationality: "Rationality",
        dim_humor: "Humor",
        dim_intimacy: "Intimacy",
        dim_creativity: "Creativity"
    },
    zh: {
        chats: "聊天",
        moments: "动态",
        album: "相册",
        me: "我的",
        online: "在线",
        typing: "输入中...",
        createSoul: "创建新灵体",
        edit: "修改",
        regenerate: "重新生成",
        uploadPhoto: "上传照片",
        synthesize: "合照合成",
        delete: "删除",
        feedback: "反馈",
        settings: "设置",
        language: "语言",
        download: "下载", // C7
        search: "搜索聊天记录...", // B10
        remark: "备注名", // B9
        save: "保存",
        post: "发布",
        whatsOnMind: "此刻的想法...",
        userProfile: "个人资料",
        appearance: "外貌描述",
        persona: "人格侧写",
        basicInfo: "基本信息",
        name: "姓名",
        gender: "性别",
        age: "年龄",
        role: "角色关系",
        bgStory: "背景故事",
        bringLife: "唤醒灵体",
        next: "下一步",
        cancel: "取消",
        deletePhotoConfirm: "确定删除这张照片吗？",
        photoDeleted: "照片已删除。",
        aiRestoring: "AI 正在修复相册...", // A10
        translate: "翻译", // A11
        translated: "已翻译",
        coreMemories: "专属记忆库", // B17
        supplementaryConfig: "补充设定 (设定库)", // A13
        userIdentitySettings: "你的身份设定", // B16
        personalitySpectrum: "人格光谱",
        writeComment: "写评论...",
        reply: "回复",
        argumentWarning: "冲突状态生效中",
        auxiliary: "辅助描写",
        responseLength: "回复长度",
        len_short: "简短",
        len_medium: "适中",
        len_long: "详细",
        deleteCompanion: "删除该灵体",
        deleteCompanionConfirm: "确定要永久删除这个灵体吗？所有聊天记录和记忆将无法恢复。",
        
        // Dimensions
        dim_empathy: "共情度",
        dim_rationality: "理性度",
        dim_humor: "幽默感",
        dim_intimacy: "亲密倾向",
        dim_creativity: "创造力"
    }
};
