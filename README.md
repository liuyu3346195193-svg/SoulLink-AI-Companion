# 💡 伴侣养成系统：深度情感连接与人设连贯性方案

版本：V1.4.2 | Deep Connection

> **定位：** 致力于建立深度情感连接的 AI 伴侣平台，将 AI 打造成拥有性格、情绪、记忆和生活动态的“灵魂伴侣”。

---

## 🎯 一、核心产品价值与解决痛点

| 产品痛点 (待解决) | 核心方案 (价值主张) |
| :--- | :--- |
| **AI 人设不一致/记忆漂移**  | **⚓ 记忆锚定**：重要对话永久存入核心记忆库，确保 AI 永远记得关键事件。|
| **AI 回复冰冷/缺乏情绪反馈** | **💔 冲突状态 (Conflict State)**：引入负面情绪状态，模拟真人争吵/冷战，提升互动真实度和情感深度。|
| **虚拟感强/缺乏代入感** | **📸 氛围感陪伴**：照片均为 POV/不露脸风格，避免“恐怖谷”效应，并提供**合照合成**功能打破次元壁。|

---

## ⚙️ 二、深度定制与养成机制

### 1. 人格雷达 - 核心机制
通过**五维参数**滑块，让用户彻底定义 AI 的性格底色，实现**个性化养成闭环**。

| 维度 | 作用 |
| :--- | :--- |
| **共情度 ** | 决定 AI 的温柔体贴程度。 |
| **理性度 ** | 决定 AI 的逻辑性与感性倾向。 |
| **幽默感 ** | 影响 AI 是否爱开玩笑。 |
| **默契度 ** | 决定 AI 对情话/身体接触的接受度。 |
| **创造力 ** | 影响对话的丰富程度和脑洞。 |

### 2. 社交互动 
* **独立于聊天的生活轨迹：** AI 根据地点/心情自动发布动态。
* **用户行为转化：** 用户的**点赞**会直接增加亲密度。

### 3. 补充设定 
用户可像写小说一样添加 AI 设定，AI 在对话中**严格遵守**（如“讨厌吃香菜”）。

---

## 💡 三、关键功能与创新点

* **合照合成 (Photo Synthesis)：** 上传用户照片，AI 根据人设将其融入，生成**专属合照**，增强情感联结。
* **消息编辑/重新生成：** 提高对话容错率和用户体验。
* **用户发布动态：** 促进用户与 AI 在社交层面的双向互动。

---

## 🔗 四、项目演示与文档

* **在线 Demo 体验 (Vercel):** [soul-link-ai-companion.vercel.app](https://soul-link-ai-companion.vercel.app/)
* **产品功能演示 (小红书视频):** [[产品演示链接](https://www.xiaohongshu.com/discovery/item/692e1248000000000d03a299?source=webshare&xhsshare=pc_web&xsec_token=AB2z45Wk-HMj3X68pGI-dHis9KiBrVnTQtqp5FaCJ0YmM=&xsec_source=pc_share)]
* **完整产品描述 (PRD 来源):** 本 $README$ 内容即提炼自**完整的项目产品文档**。

---

## 🛠️ 五、技术栈 

> SoulLink AI 是一个由 **React/TypeScript** 构建的 **Local-First** AI 应用，以 **Google Gemini API** 为核心智能引擎。

### 1. AI 与大模型 (AIGC)
* **核心智能引擎：** Google Gemini API。
* **使用模型：** $gemini-2.5-flash$ (对话、分析) 和 $gemini-2.5-flash-image$ (多模态识图、生图)。
* **核心功能：** 角色对话、冲突状态分析 (`analyzeConflictState`)、朋友圈文案生成 (`generateSocialPostStructured`)、照片合成 (`synthesizePhoto`) 等。

### 2. 前端与构建
* **核心框架：** React, TypeScript。
* **构建工具：** Vite (极速热更新)。
* **部署环境：** Vercel (CI/CD)。

### 3. 数据与状态
* **核心策略：** Local-First Store (基于 localStorage)。
* **云端同步：** Firebase Firestore (用于云端数据同步和持久化备份，实现了 Smart Merge 实时合并策略)。

### 4. 样式与 UI
* **UI 框架：** Tailwind CSS (实用优先)。
* **数据可视化：** Recharts (用于绘制角色人格维度的雷达图)。
* **组件库：** Lucide React (图标), React Markdown (渲染 AI 输出文本)。
---
* *SoulLink AI - 连接每一个孤独的灵魂。*
