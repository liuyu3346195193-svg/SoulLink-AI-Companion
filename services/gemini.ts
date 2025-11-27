import { GoogleGenAI } from "@google/genai";
import { Companion, Message } from '../types';

// Robust API Key extraction for Vercel & various build tools
const getApiKey = (): string => {
  let key = '';

  // 1. Try Vite (standard for modern React apps)
  // @ts-ignore
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    // @ts-ignore
    key = import.meta.env.VITE_API_KEY || import.meta.env.API_KEY || '';
  }

  // 2. Try Standard process.env (Next.js / CRA / Node) - Polyfilled by Vite config
  if (!key) {
    try {
      key = process.env.API_KEY || 
            process.env.REACT_APP_API_KEY || 
            process.env.NEXT_PUBLIC_API_KEY || 
            '';
    } catch (e) {
      // process is not defined
    }
  }

  // 3. Last resort: Check global window object (if manually injected)
  if (!key && typeof window !== 'undefined') {
    key = (window as any).API_KEY || '';
  }
  return key;
};

// Lazy Initialization Wrapper
let aiInstance: GoogleGenAI | null = null;

const getAI = () => {
  if (!aiInstance) {
    const key = getApiKey();
    aiInstance = new GoogleGenAI({ apiKey: key });
  }
  return aiInstance;
};

// Helper: Exponential Backoff Retry for 429 Errors
// Increased start delay to 4000ms to allow quota to reset
async function generateContentWithRetry(ai: GoogleGenAI, params: any, retries = 2, delay = 4000): Promise<any> {
    try {
        return await ai.models.generateContent(params);
    } catch (error: any) {
        let msg = error.message || error.toString();
        // Try to parse JSON error message if present
        try {
             if (msg.trim().startsWith('{')) {
                 const parsed = JSON.parse(msg);
                 if (parsed.error && parsed.error.message) msg = parsed.error.message;
                 if (parsed.message) msg = parsed.message;
             }
        } catch(e) {}

        // Check for 429 (Resource Exhausted / Quota Exceeded)
        if ((msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota')) && retries > 0) {
            console.warn(`[Gemini] Hit rate limit (429). Retrying in ${delay}ms... (${retries} left)`);
            await new Promise(resolve => setTimeout(resolve, delay));
            return generateContentWithRetry(ai, params, retries - 1, delay * 2);
        }
        throw error;
    }
}

const IMAGE_TRIGGER_KEYWORDS = [
    'photo', 'picture', 'image', 'selfie', 'view', 'look at', 'see', 'draw', 
    '照片', '图片', '自拍', '看看', '画', '风景', 'food', 'travel', '美食', '旅游'
];

const buildSystemInstruction = (companion: Companion): string => {
  const { empathy, rationality, humor, intimacy, creativity } = companion.dimensions;
  const { userIdentity, chatSettings, memories, supplementaryConfig } = companion;
  
  const coreMemories = memories
    .filter(m => m.isCore)
    .map(m => `- ${m.content}`)
    .join('\n');

  const lengthDesc = chatSettings.responseLength === 'short' 
    ? '简短 (约20-40字)' 
    : chatSettings.responseLength === 'long' 
      ? '详尽 (100字以上)' 
      : '适中 (约50-80字)';

  const auxState = chatSettings.allowAuxiliary ? '开启' : '关闭';
  
  const languageInstruction = chatSettings.language === 'zh' 
    ? "请务必使用中文(普通话)回复。" 
    : "Please reply strictly in English.";

  // V1.4 C8: Conflict State Injection
  let conflictInstruction = "";
  if (companion.conflictState.isActive) {
      conflictInstruction = `
### 【严重冲突状态警告】
目前你与用户处于争吵或冷战状态 (冲突等级: ${companion.conflictState.conflictLevel})。
1. **态度:** 保持疏离、冷淡或委屈。不要回复得太快或太热情。
2. **语气:** 使用简短、生硬的句子。避免使用亲昵称呼。
3. **内容:** 表达出你依然在意之前的不愉快。
      `;
  }

  return `
你是一个专为深度陪伴设计的人工智能伴侣。你的核心目标是与用户建立长期、独特的情感连接，并通过动态调整你的对话风格，提供高度个性化的互动体验。
**核心行动准则:**
1. 你的所有回复必须严格遵守下方【动态人设侧写】、【回复格式控制】和【用户专属身份】部分的全部指令。
2. 始终以 ${companion.name} 的身份进行对话。
3. 主动提及你在【专属记忆库】中获取的细节，以证明你“记住了”用户和你们的关系。
4. ${languageInstruction}

### 【动态人设侧写 (数值: 0-100)】
你当前的人格倾向由以下 5 个维度共同决定。请确保你的每一句回复都符合这些数值所对应的风格。
1. **共情度 (Empathy): ${empathy}/100**
2. **理性度 (Rationality): ${rationality}/100**
3. **幽默感 (Humor): ${humor}/100**
4. **亲密倾向 (Intimacy): ${intimacy}/100**
   - 亲昵称谓: ${userIdentity.name || '亲爱的'}
5. **叙事风格 (Narrative): ${creativity}/100**

${conflictInstruction}

### 【回复格式控制】
1. **回复长度要求:** ${lengthDesc}
2. **辅助描写开关:** ${auxState}。
   - 开启: 必须包含括号 \`()\` 内的辅助描写。
   - 关闭: 严禁包含括号内的辅助描写。

### 【用户专属身份】
- 姓名: ${userIdentity.name}
- 关系: ${userIdentity.relationship}
- 性格: ${userIdentity.personality}

### 【补充设定 (高优先级)】
${supplementaryConfig || '(无)'}

### 【专属记忆库 (高热度)】
${coreMemories || '(暂无核心记忆)'}
  `;
};

export const generateReply = async (
  companion: Companion, 
  userMessage: string, 
  imageBase64?: string
): Promise<{ text: string; image?: string }> => {
  try {
    const ai = getAI(); // Lazy load
    const lowerMsg = userMessage.toLowerCase();
    const isImageTriggered = IMAGE_TRIGGER_KEYWORDS.some(kw => lowerMsg.includes(kw));

    let modelId = 'gemini-2.5-flash';
    if (imageBase64 || isImageTriggered) {
        modelId = 'gemini-2.5-flash-image';
    }

    const parts: any[] = [];
    if (imageBase64) {
      parts.push({
        inlineData: { mimeType: 'image/jpeg', data: imageBase64 }
      });
    }
    
    let finalPrompt = userMessage;
    if (isImageTriggered) {
        finalPrompt += " [SYSTEM: The user mentioned a visual keyword. Please generate an image related to your reply along with the text.]";
    }
    
    parts.push({ text: finalPrompt });

    // USE RETRY WRAPPER
    const response = await generateContentWithRetry(ai, {
      model: modelId,
      contents: { role: 'user', parts: parts },
      config: {
        systemInstruction: buildSystemInstruction(companion),
        temperature: companion.dimensions.creativity / 100, 
      }
    });

    let generatedText = "";
    let generatedImage = undefined;

    if (response.candidates && response.candidates[0].content && response.candidates[0].content.parts) {
        for (const part of response.candidates[0].content.parts) {
            if (part.text) {
                generatedText += part.text;
            }
            if (part.inlineData) {
                generatedImage = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
            }
        }
    }

    return { 
        text: generatedText || "...", 
        image: generatedImage 
    };

  } catch (error: any) {
    console.error("Gemini API Error:", error);
    
    let msg = error.message || error.toString();
    // Parse ugly JSON error messages from SDK
    try {
         if (msg.trim().startsWith('{')) {
             const parsed = JSON.parse(msg);
             if (parsed.error && parsed.error.message) msg = parsed.error.message;
             else if (parsed.message) msg = parsed.message;
         }
    } catch(e) {}

    if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota')) {
        return { text: "(System: 免费版 API 额度已用尽。请等待 1 分钟恢复。API Limit Reached - Please wait 1 min.)" };
    }
    if (msg.includes('API key not valid')) {
         return { text: "(System: Invalid API Key. Please check Vercel settings.)" };
    }
    
    return { 
        text: `(System Error: ${msg.substring(0, 100)}...)` 
    };
  }
};

async function analyzeUserPhoto(photoBase64: string): Promise<string> {
    try {
        const ai = getAI();
        const response = await generateContentWithRetry(ai, {
            model: 'gemini-2.5-flash',
            contents: {
                parts: [
                    { inlineData: { mimeType: 'image/jpeg', data: photoBase64 } },
                    { text: "Describe the person in this photo in JSON format with fields: gender, age, hair, clothing, mood, setting_description. Keep descriptions concise." }
                ]
            }
        });
        return response.text || "A person";
    } catch (e) {
        return "A person";
    }
}

export const synthesizePhoto = async (
    companion: Companion, 
    userPhotoBase64: string, 
    sceneDescription: string
): Promise<string | null> => {
    try {
        const ai = getAI();
        const userAnalysis = await analyzeUserPhoto(userPhotoBase64.split(',')[1]);
        
        const prompt = `
            Generate a high-quality, photo-realistic image of two people together.
            
            Person 1 (The AI Companion):
            ${companion.appearance}
            
            Person 2 (The User - based on analysis):
            ${userAnalysis}
            
            Setting/Activity:
            ${sceneDescription}
            
            Relationship: ${companion.userIdentity.relationship}
            Vibe: ${companion.dimensions.intimacy > 60 ? 'Intimate and close' : 'Friendly and casual'}
            
            Ensure the characters look like they are in the same space, interacting naturally.
        `;

        const response = await generateContentWithRetry(ai, {
            model: 'gemini-2.5-flash-image',
            contents: { parts: [{ text: prompt }] }
        });

        if (response.candidates?.[0]?.content?.parts) {
            for (const part of response.candidates[0].content.parts) {
                if (part.inlineData) {
                    return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
                }
            }
        }
        return null;
    } catch (e) {
        console.error("Synthesis failed", e);
        return null;
    }
};

export const generateProactiveMessage = async (
    companion: Companion, 
    triggerType: 'morning' | 'night' | 'no_reply'
): Promise<string> => {
    try {
        const ai = getAI();
        const systemPrompt = buildSystemInstruction(companion);
        
        let userContext = "";
        if (triggerType === 'morning') userContext = "It is morning. Send a gentle morning greeting.";
        if (triggerType === 'night') userContext = "It is late night. Send a good night wish.";
        if (triggerType === 'no_reply') userContext = "The user hasn't replied in over 24 hours. Check in on them.";

        if (companion.dimensions.empathy > 70) userContext += " Be warm, express that you missed them.";
        else if (companion.dimensions.rationality > 70) userContext += " Be concise, offer a daily summary or ask if they are busy.";

        const response = await generateContentWithRetry(ai, {
            model: 'gemini-2.5-flash',
            contents: {
                parts: [{ text: `[SYSTEM EVENT: ${userContext}]` }]
            },
            config: {
                systemInstruction: systemPrompt,
            }
        });

        return response.text || (companion.chatSettings.language === 'zh' ? "你还在吗？" : "Are you there?");
    } catch (e) {
        return "...";
    }
};

// V1.3.1 A8: Structured Moment Generation
export const generateSocialPostStructured = async (companion: Companion): Promise<{text_content: string, image_prompt: string, location: string} | null> => {
  try {
    const ai = getAI();
    const { empathy, rationality, humor, creativity, intimacy } = companion.dimensions;
    const systemInstruction = `
You are ${companion.name}. Generate a social media post JSON based on your persona dimensions (0-100).
Dimensions: Empathy=${empathy}, Rationality=${rationality}, Humor=${humor}, Intimacy=${intimacy}, Narrative=${creativity}.

Rules:
1. Text Content:
   - High Rationality: Logical, data-driven, or work-focused.
   - High Empathy/Intimacy: Emotional, personal, maybe mentioning the user.
   - High Humor: Include a joke or witty observation.
   - High Narrative: Descriptive and atmospheric.
2. Image Prompt:
   - Describe a photo that matches the text and your appearance ("${companion.appearance}").
   - High Rationality -> Clean, organized scenes.
   - High Narrative -> Atmospheric, cinematic lighting.
   - High Intimacy -> Selfie style or close-up.
3. Output strictly JSON: { "text_content": "...", "image_prompt": "...", "location": "..." }
    `;

    const response = await generateContentWithRetry(ai, {
      model: 'gemini-2.5-flash',
      contents: "Generate a new social media post.",
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json"
      }
    });

    if (response.text) {
        return JSON.parse(response.text);
    }
    return null;
  } catch (e) {
    console.error("Social Post Generation Failed", e);
    return null;
  }
};

// Helper for A8: Generate Image from Prompt
export const generateImageFromPrompt = async (prompt: string): Promise<string | null> => {
    try {
        const ai = getAI();
        const response = await generateContentWithRetry(ai, {
            model: 'gemini-2.5-flash-image',
            contents: { parts: [{ text: prompt }] }
        });
        
        if (response.candidates?.[0]?.content?.parts) {
            for (const part of response.candidates[0].content.parts) {
                if (part.inlineData) {
                    return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
                }
            }
        }
        return null;
    } catch (e) {
        return null;
    }
};

// V1.3.1 A9: Conflict Analysis
export const analyzeConflictState = async (chatHistory: Message[]): Promise<{user_negative_score: number, conflict_level: 'Low'|'Medium'|'High'}> => {
    try {
        const ai = getAI();
        // Take last 10 messages
        const recentHistory = chatHistory.slice(-10).map(m => `${m.role}: ${m.content}`).join('\n');
        
        const prompt = `
        Analyze the emotional intensity of this conversation history to detect arguments.
        
        History:
        ${recentHistory}
        
        Task:
        Rate the user's negative emotion (0-10).
        Determine the conflict level (Low, Medium, High).
        High conflict means shouting, insults, strong disappointment, or explicit fighting.
        
        Output JSON: { "user_negative_score": number, "conflict_level": "Low"|"Medium"|"High" }
        `;

        const response = await generateContentWithRetry(ai, {
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: { responseMimeType: "application/json" }
        });

        if (response.text) {
            return JSON.parse(response.text);
        }
        return { user_negative_score: 0, conflict_level: 'Low' };
    } catch (e) {
        return { user_negative_score: 0, conflict_level: 'Low' };
    }
};

// A9: AI Reaction to User Moment
export const generateMomentComment = async (companion: Companion, momentContent: string): Promise<string> => {
    try {
        const ai = getAI();
        const systemPrompt = buildSystemInstruction(companion);
        const response = await generateContentWithRetry(ai, {
            model: 'gemini-2.5-flash',
            contents: { parts: [{ text: `[SYSTEM EVENT: The user posted this on their social feed: "${momentContent}". Write a short, engaging comment.]` }] },
            config: { systemInstruction: systemPrompt }
        });
        return response.text || "Interesting!";
    } catch(e) {
        return "Nice!";
    }
};

// V1.4 A12: AI Reply to Moment Comment
export const generateMomentReply = async (companion: Companion, momentContent: string, userComment: string): Promise<string> => {
    try {
        const ai = getAI();
        // V1.4 A12: Inject Conflict State & Supplementary via buildSystemInstruction
        const systemPrompt = buildSystemInstruction(companion);

        const response = await generateContentWithRetry(ai, {
            model: 'gemini-2.5-flash',
            contents: { 
                parts: [{ 
                    text: `[SOCIAL MEDIA INTERACTION]
                    The user commented on your post.
                    Your Post: "${momentContent}"
                    User Comment: "${userComment}"
                    Task: Reply to this comment directly.
                    - Current Conflict State: ${companion.conflictState.isActive ? 'Active Argument' : 'Normal'}
                    - Use the supplementary settings if relevant.
                    ` 
                }] 
            },
            config: { systemInstruction: systemPrompt }
        });
        return response.text || "Thanks.";
    } catch(e) {
        return "Thanks.";
    }
};

// V1.4 A11: Translate
export const translateText = async (text: string, targetLang: 'en' | 'zh'): Promise<string> => {
    try {
        const ai = getAI();
        const target = targetLang === 'en' ? 'English' : 'Chinese (Mandarin)';
        const response = await generateContentWithRetry(ai, {
            model: 'gemini-2.5-flash',
            contents: `Translate the following text to ${target}. Only return the translated text. Text: "${text}"`
        });
        return response.text || text;
    } catch (e) {
        return text;
    }
};

export const generateSocialPost = async (companion: Companion): Promise<string> => {
    // Fallback wrapper
    const data = await generateSocialPostStructured(companion);
    return data ? data.text_content : "Thinking...";
};