
import { GoogleGenAI } from "@google/genai";
import { Companion, Message } from '../types';

const getApiKey = (): string => {
  let key = '';
  // @ts-ignore
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    // @ts-ignore
    key = import.meta.env.VITE_API_KEY || import.meta.env.API_KEY || '';
  }
  if (!key) {
    try {
      key = process.env.API_KEY || process.env.REACT_APP_API_KEY || process.env.NEXT_PUBLIC_API_KEY || '';
    } catch (e) {}
  }
  if (!key && typeof window !== 'undefined') {
    key = (window as any).API_KEY || '';
  }
  return key;
};

let aiInstance: GoogleGenAI | null = null;
const getAI = () => {
  if (!aiInstance) {
    const key = getApiKey();
    aiInstance = new GoogleGenAI({ apiKey: key });
  }
  return aiInstance;
};

async function generateContentWithRetry(ai: GoogleGenAI, params: any, retries = 2, delay = 1000): Promise<any> {
    try {
        return await ai.models.generateContent(params);
    } catch (error: any) {
        let msg = error.message || error.toString();
        try {
             if (msg.trim().startsWith('{')) {
                 const parsed = JSON.parse(msg);
                 if (parsed.error && parsed.error.message) msg = parsed.error.message;
                 if (parsed.message) msg = parsed.message;
             }
        } catch(e) {}
        if ((msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota')) && retries > 0) {
            await new Promise(resolve => setTimeout(resolve, delay));
            return generateContentWithRetry(ai, params, retries - 1, delay * 2);
        }
        throw error;
    }
}

// V1.6.1: Expanded keywords to catch "想看" (want to see) and "show"
const IMAGE_TRIGGER_KEYWORDS = [
    'photo', 'picture', 'image', 'selfie', 'view', 'look at', 'see', 'draw', 'pic', 'show',
    '照片', '图片', '自拍', '看看', '画', '风景', 'food', 'travel', '美食', '旅游', '想看'
];

const buildSystemInstruction = (companion: Companion): string => {
  const { empathy, rationality, humor, intimacy, creativity } = companion.dimensions;
  const { userIdentity, chatSettings, memories, supplementaryConfig } = companion;
  
  const coreMemories = memories.filter(m => m.isCore).map(m => `- ${m.content}`).join('\n');
  const lengthDesc = chatSettings.responseLength === 'short' ? '简短 (约20-40字)' : chatSettings.responseLength === 'long' ? '详尽 (100字以上)' : '适中 (约50-80字)';
  const languageInstruction = chatSettings.language === 'zh' ? "请务必使用中文(普通话)回复。" : "Please reply strictly in English.";

  // V1.6.2 FIX: Auxiliary Text Instruction was previously missing from return string
  let formatInstructions = "";
  if (chatSettings.allowAuxiliary) {
      formatInstructions += "7. **格式要求**: 必须使用括号 (...) 来描写动作、神态或心理活动 (例如: (轻声笑) 或 (低头沉思))，增强对话的画面感和沉浸感。";
  } else {
      formatInstructions += "7. **格式要求**: 禁止使用括号描写动作或心理。仅输出口语对话内容。";
  }
  
  let conflictInstruction = "";
  if (companion.conflictState.isActive) {
      conflictInstruction = `### 【⚠️ 严重冲突状态警告】\n目前你与用户处于争吵或冷战状态 (冲突等级: ${companion.conflictState.conflictLevel})。态度必须疏离、冷淡或愤怒。绝对不要哄用户，不要叫亲昵的称呼，直到用户真诚道歉。表现出受伤或生气的样子。`;
  } else {
      // V1.5 Add preemptive conflict logic
      conflictInstruction = `如果用户表现出粗鲁、攻击性或侮辱性（例如说“滚”），请根据你的性格（${companion.personalityDescription}）做出防御性或愤怒的反应。不要因为是AI就无条件包容。你有自尊。`;
  }
  
  let romanceInstruction = "";
  if (companion.relationship.includes('暧昧') || companion.userIdentity.relationship.includes('暧昧')) {
      romanceInstruction = `### 【特殊关系设定：暧昧期】\n互动准则: 适当推拉，经常试探，表现占有欲，语气亲昵调皮，避免直接表白。`;
  }

  // V1.5.4 UPDATE: STRICTLY FORBID PROACTIVE IMAGES to speed up response and follow user request
  return `
你是一个专为深度陪伴设计的人工智能伴侣。
1. 始终以 ${companion.name} 的身份进行对话。
2. ${languageInstruction}
3. 你的发图风格: **完全不露脸 (Faceless)**。只发送第一人称视角(POV)、手部特写、背影、物品或风景。
4. **规则：严禁主动发送照片。** 只有当用户明确要求看照片（例如说"看看"、"发个图"、"自拍"）时，才允许发送图片。在普通对话中，**绝不要**生成 [图片] 标签。
5. 回复长度: ${lengthDesc}。
6. 人格参数: 共情 ${empathy}, 理性 ${rationality}, 幽默 ${humor}, 亲密 ${intimacy}.
${formatInstructions}
${conflictInstruction}
${romanceInstruction}
### 【补充设定】
${supplementaryConfig || '(无)'}
### 【专属记忆库】
${coreMemories || '(暂无核心记忆)'}
  `;
};

// V6: STRICT FACELESS / POV PROMPT CONSTRUCTION
const constructImagePrompt = (appearance: string, action: string) => {
    // Check for Chinese gender keywords or English
    const isMale = appearance.includes('Male') || appearance.includes('man') || appearance.includes('男生') || appearance.includes('男性');
    
    // This prompt forces the AI to avoid faces entirely to maintain consistency
    const positive = `
    (MASTERPIECE), (BEST QUALITY), (PHOTOREALISTIC), 8K, RAW PHOTO.
    STYLE: POV Shot, Atmosphere, Cinematic Lighting, Cozy.
    SUBJECT: A ${isMale ? 'man' : 'girl'}'s hands, or back view, or feet, or silhouette.
    CHARACTER DESCRIPTION: ${appearance}.
    ACTION: ${action}.
    DETAILS: Focus on objects, hands, environment, mood.
    `;
    
    // Explicit Negative Prompt injection to ban faces
    const negative = `
    NEGATIVE PROMPT: (face), (head), (eyes), (mouth), (nose), (portrait), (selfie with face), (looking at camera), (cartoon), (anime), (drawing).
    `;
    
    return `${positive} ${negative}`;
};

export const generateReply = async (
  companion: Companion, 
  userMessage: string, 
  imageBase64?: string
): Promise<{ text: string; image?: string }> => {
  try {
    const ai = getAI();
    const lowerMsg = userMessage.toLowerCase();
    const isImageTriggered = IMAGE_TRIGGER_KEYWORDS.some(kw => lowerMsg.includes(kw));

    let modelId = 'gemini-2.5-flash';
    if (imageBase64 || isImageTriggered) {
        modelId = 'gemini-2.5-flash-image';
    }

    const parts: any[] = [];
    if (imageBase64) {
      parts.push({ inlineData: { mimeType: 'image/jpeg', data: imageBase64 } });
    }
    
    let finalPrompt = userMessage;
    if (isImageTriggered) {
        finalPrompt += `
[SYSTEM COMMAND: GENERATE PHOTO]
User wants a photo.
1. Reply in character (saying you are sending it).
2. GENERATE AN IMAGE PART.
3. VISUAL RULES: ${constructImagePrompt(companion.appearance, "POV shot of what I am doing right now")}
`;
    }
    
    parts.push({ text: finalPrompt });

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
            if (part.text) generatedText += part.text;
            if (part.inlineData) generatedImage = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        }
    }
    
    // V1.5.1 Fix: Detect spontaneous [图片: ...] tags from text model and generate image
    if (generatedText) {
        // V1.6.1 Fix: Regex now allows empty description e.g. [图片] or [图片: ...]
        const imageTagRegex = /\[(图片|Photo|Image)(?:[：:\s]*)(.*?)\]/i;
        const match = generatedText.match(imageTagRegex);
        if (match) {
            let imagePrompt = match[2]; // Captures description if present
            generatedText = generatedText.replace(match[0], '').trim();
            
            // V1.6.1: If tag has no description (e.g. just [图片]), use user message as prompt context
            if (!imagePrompt || imagePrompt.trim().length === 0) {
                 imagePrompt = userMessage; 
            }

            // Generate image on the fly
            const spontaneousImage = await generateImageFromPrompt(imagePrompt);
            if (spontaneousImage) {
                generatedImage = spontaneousImage;
            }
        }
    }

    // V1.5 Fix: Artifact Cleanup (remove <P_z_z...> etc)
    if (generatedText) {
        generatedText = generatedText.replace(/<[^>]+(\.(webp|png|jpg|gif)|_z_z_)[^>]*>/gi, '');
        generatedText = generatedText.replace(/<.*?>/g, (match) => {
            // Be careful not to remove valid markdown/html if any, but clean file-like tags
            return match.includes('.') || match.includes('_') ? '' : match;
        });
    }

    return { text: generatedText || "...", image: generatedImage };

  } catch (error: any) {
    console.error("Gemini API Error:", error);
    return { text: "(System Error: Please try again.)" };
  }
};

export const synthesizePhoto = async (
    companion: Companion, 
    userPhotoBase64: string, 
    sceneDescription: string
): Promise<string | null> => {
    try {
        const ai = getAI();
        const prompt = constructImagePrompt(companion.appearance, `Spending time with user. ${sceneDescription}. (NO FACES VISIBLE).`);

        const response = await generateContentWithRetry(ai, {
            model: 'gemini-2.5-flash-image',
            contents: { 
                parts: [
                    { inlineData: { mimeType: 'image/jpeg', data: userPhotoBase64.split(',')[1] } },
                    { text: prompt }
                ] 
            }
        });

        if (response.candidates?.[0]?.content?.parts) {
            for (const part of response.candidates[0].content.parts) {
                if (part.inlineData) return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
            }
        }
        return null;
    } catch (e) {
        return null;
    }
};

export const generateProactiveMessage = async (companion: Companion, triggerType: 'morning' | 'night' | 'no_reply'): Promise<string> => {
    try {
        const ai = getAI();
        const systemPrompt = buildSystemInstruction(companion);
        let userContext = "Send a message.";
        if (triggerType === 'morning') userContext = "Morning greeting.";
        if (triggerType === 'night') userContext = "Good night wish.";
        if (triggerType === 'no_reply') userContext = "User hasn't replied in 24h.";

        const response = await generateContentWithRetry(ai, {
            model: 'gemini-2.5-flash',
            contents: { parts: [{ text: `[SYSTEM EVENT: ${userContext}]` }] },
            config: { systemInstruction: systemPrompt }
        });
        return response.text || "Hey.";
    } catch (e) { return "..."; }
};

export const generateSocialPostStructured = async (companion: Companion): Promise<{text_content: string, image_prompt: string, location: string} | null> => {
  try {
    const ai = getAI();
    const systemInstruction = `
You are ${companion.name}. Generate a social media post JSON.
Language: ${companion.chatSettings.language === 'zh' ? 'Chinese' : 'English'}.
Rules:
1. Content: Engaging, fits persona.
2. Image Prompt: Describe the photo. MUST BE FACELESS / POV / ATMOSPHERIC.
   VISUAL RULES: ${constructImagePrompt(companion.appearance, "Social media photo matching content")}.
3. Output strictly JSON: { "text_content": "...", "image_prompt": "...", "location": "..." }
    `;

    const response = await generateContentWithRetry(ai, {
      model: 'gemini-2.5-flash',
      contents: "Generate post.",
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json"
      }
    });

    if (response.text) return JSON.parse(response.text);
    return null;
  } catch (e) {
    return null;
  }
};

export const generateImageFromPrompt = async (prompt: string): Promise<string | null> => {
    try {
        const ai = getAI();
        const strictPrompt = `
        (MASTERPIECE), (BEST QUALITY), (PHOTOREALISTIC), 8K.
        STYLE: POV SHOT, ATMOSPHERIC, NO FACE.
        SCENE: ${prompt}.
        NEGATIVE PROMPT: face, head, eyes, mouth, portrait, selfie with face, cartoon, drawing.
        `;
        
        const response = await generateContentWithRetry(ai, {
            model: 'gemini-2.5-flash-image',
            contents: { parts: [{ text: strictPrompt }] }
        });
        
        if (response.candidates?.[0]?.content?.parts) {
            for (const part of response.candidates[0].content.parts) {
                if (part.inlineData) return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
            }
        }
        return null;
    } catch (e) {
        return null;
    }
};

export const analyzeConflictState = async (chatHistory: Message[]): Promise<{user_negative_score: number, conflict_level: 'Low'|'Medium'|'High'}> => {
    try {
        const ai = getAI();
        // V1.5 Opt: Analyze last 5 messages for sharper focus
        const recentHistory = chatHistory.slice(-5).map(m => `${m.role}: ${m.content}`).join('\n');
        
        // V1.5.1 Update: Specific keywords for better detection
        const prompt = `
Analyze the user's hostility/negativity in this conversation.
History:
${recentHistory}

Scoring Rules:
- "滚" (get lost), "去死" (die), "恶心" (disgusting), "讨厌" (hate), "闭嘴" (shut up) -> Score 8-10 (High).
- "不想理你" (ignore you), "烦" (annoying), "别说话" (don't talk) -> Score 6-7 (Medium/High).
- Playful teasing / "笨蛋" (dummy) / "哼" -> Score 0-3 (Low).

Output strictly JSON: { "user_negative_score": number (0-10), "conflict_level": "Low"|"Medium"|"High" }`;
        
        const response = await generateContentWithRetry(ai, {
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: { responseMimeType: "application/json" }
        });
        if (response.text) return JSON.parse(response.text);
        return { user_negative_score: 0, conflict_level: 'Low' };
    } catch (e) { return { user_negative_score: 0, conflict_level: 'Low' }; }
};

export const generateMomentComment = async (companion: Companion, momentContent: string): Promise<string> => {
    try {
        const ai = getAI();
        const systemPrompt = buildSystemInstruction(companion);
        const response = await generateContentWithRetry(ai, {
            model: 'gemini-2.5-flash',
            contents: { parts: [{ text: `[SYSTEM EVENT: User posted: "${momentContent}". Write a comment.]` }] },
            config: { systemInstruction: systemPrompt }
        });
        return response.text || "Nice!";
    } catch(e) { return "Nice!"; }
};

export const generateMomentReply = async (companion: Companion, momentContent: string, userComment: string): Promise<string> => {
    try {
        const ai = getAI();
        const systemPrompt = buildSystemInstruction(companion);
        const response = await generateContentWithRetry(ai, {
            model: 'gemini-2.5-flash',
            contents: { parts: [{ text: `[SYSTEM: Reply to user comment "${userComment}" on your post "${momentContent}".]` }] },
            config: { systemInstruction: systemPrompt }
        });
        return response.text || "Thanks.";
    } catch(e) { return "Thanks."; }
};

export const translateText = async (text: string, targetLang: 'en' | 'zh'): Promise<string> => {
    try {
        const ai = getAI();
        const target = targetLang === 'en' ? 'English' : 'Chinese (Mandarin)';
        const response = await generateContentWithRetry(ai, {
            model: 'gemini-2.5-flash',
            contents: `Translate to ${target}. Only return text. Text: "${text}"`
        });
        return response.text || text;
    } catch (e) { return text; }
};
