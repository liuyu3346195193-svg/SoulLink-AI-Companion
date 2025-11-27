import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useStore, CompanionState, UserProfile } from './services/store';
import { getAuth } from 'firebase/auth';
import {
  HomeIcon,
  MessageCircleIcon,
  HeartIcon,
  SettingsIcon,
  UserIcon,
  FeatherIcon,
  XIcon,
  CopyIcon,
  CheckIcon,
} from 'lucide-react';

// === Main Application Component ===
const App: React.FC = () => {
  // --- Firebase/Store Initialization ---
  const store = useStore();
  const {
    app,
    db,
    auth,
    userId,
    isAuthReady,
    companions,
    moments,
    profiles,
    // Note: __app_id is now handled inside useStore initialization logic
  } = store;

  const [activeTab, setActiveTab] = useState<'chats' | 'moments' | 'me'>('chats');
  const [selectedCompanion, setSelectedCompanion] = useState<CompanionState | null>(null);
  const [companionConflictState, setCompanionConflictState] = useState<{
    isActive: boolean;
    companionId: string | null;
  }>({ isActive: false, companionId: null });
  const [searchQuery, setSearchQuery] = useState('');
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [profileViewCompanion, setProfileViewCompanion] = useState<CompanionState | null>(null);
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [isNewProfileView, setIsNewProfileView] = useState(false);

  // --- Auth State Change Listener (Ensure store is ready before using it) ---
  useEffect(() => {
    if (auth) {
      const unsubscribe = getAuth(auth.app).onAuthStateChanged(user => {
        if (user && user.uid !== userId) {
          store.setUserId(user.uid);
          // console.log('Auth state changed, new user ID:', user.uid);
        } else if (!user && !userId) {
          // If no user and no stored userId (i.e., first load/anonymous sign-in failed)
          // The store should handle anonymous sign-in in its init.
          // We can optionally force a state update here if needed.
        }
      });
      return () => unsubscribe();
    }
  }, [auth, userId, store]);
  
  // --- Data Loading Effect ---
  useEffect(() => {
    if (isAuthReady && userId) {
      store.loadInitialData();
    }
  }, [isAuthReady, userId, store]); // Depend on isAuthReady and userId

  // Filter companions based on search query
  const filteredCompanions = useMemo(() => {
    if (!searchQuery) {
      return companions;
    }
    const query = searchQuery.toLowerCase();
    return companions.filter(
      (c) =>
        c.name.toLowerCase().includes(query) ||
        c.description.toLowerCase().includes(query)
    );
  }, [companions, searchQuery]);

  // --- Utility Functions ---

  const handleCopy = (text: string) => {
    // Fallback for secure context copy method
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        setCopiedText(text);
        setTimeout(() => setCopiedText(null), 2000);
      });
    } else {
      // Manual execution command fallback (less reliable in some environments)
      const textArea = document.createElement('textarea');
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      try {
        document.execCommand('copy');
        setCopiedText(text);
        setTimeout(() => setCopiedText(null), 2000);
      } catch (err) {
        console.error('Fallback: Oops, unable to copy', err);
      }
      document.body.removeChild(textArea);
    }
  };

  const handleCreateNewSoul = useCallback(() => {
    setIsNewProfileView(true);
    setProfileViewCompanion(null);
    setActiveTab('me');
  }, []);

  const handleViewProfile = useCallback((companion: CompanionState) => {
    setIsNewProfileView(false);
    setProfileViewCompanion(companion);
    setActiveTab('me');
  }, []);

  const handleBackToChats = useCallback(() => {
    setSelectedCompanion(null);
    setProfileViewCompanion(null);
    setIsNewProfileView(false);
    setActiveTab('chats');
  }, []);

  const handleOpenConflictModal = useCallback((companionId: string) => {
    setCompanionConflictState({ isActive: true, companionId });
  }, []);

  const handleCloseConflictModal = useCallback(() => {
    setCompanionConflictState({ isActive: false, companionId: null });
  }, []);

  const handleConfirmConflict = useCallback(async () => {
    if (companionConflictState.companionId) {
      await store.deleteCompanion(companionConflictState.companionId);
      handleCloseConflictModal();
      handleBackToChats();
    }
  }, [companionConflictState.companionId, store, handleCloseConflictModal, handleBackToChats]);

  // --- Views ---

  // V1.4 C7: Profile View Component
  const ProfileEditorView: React.FC<{ companion: CompanionState | null; isNew: boolean }> = ({ companion, isNew }) => {
    const [name, setName] = useState(companion?.name || '');
    const [description, setDescription] = useState(companion?.description || '');
    const [persona, setPersona] = useState(companion?.persona || {
      Empathy: 50,
      Rationality: 50,
      Humor: 50,
      Intimacy: 50,
      Creativity: 50,
    });
    const [isSaving, setIsSaving] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);

    const personaKeys = ['Empathy', 'Rationality', 'Humor', 'Intimacy', 'Creativity'] as const;

    const handleSliderChange = (key: keyof typeof persona, value: number) => {
      setPersona(prev => ({ ...prev, [key]: value }));
    };

    const handleSave = async () => {
      if (!name.trim() || !description.trim()) {
        // Use a simple console error instead of alert()
        console.error('Name and description cannot be empty.');
        return;
      }

      setIsSaving(true);
      try {
        if (isNew) {
          await store.createCompanion({
            name,
            description,
            persona,
            chatHistory: [],
            lastMessage: '',
            lastActive: new Date().toISOString(),
          });
          setSaveSuccess(true);
          // Go back to chats after creation
          setTimeout(() => {
            setSaveSuccess(false);
            handleBackToChats();
          }, 1500);
        } else if (companion) {
          await store.updateCompanion(companion.id, { name, description, persona });
          setSaveSuccess(true);
          setTimeout(() => setSaveSuccess(false), 1500);
        }
      } catch (error) {
        console.error('Failed to save companion:', error);
      } finally {
        setIsSaving(false);
      }
    };

    const maxValue = 100;
    const radarData = useMemo(() => {
      const data = personaKeys.map(key => ({
        subject: key,
        A: persona[key],
        fullMark: maxValue,
      }));
      // Prepare points for SVG drawing
      const numPoints = data.length;
      const angle = (2 * Math.PI) / numPoints;
      const center = 100;
      const scale = center / maxValue;

      const points = data.map((d, i) => {
        const value = d.A * scale;
        // SVG coordinates are (0,0) at top-left, so we adjust angle
        // Start at 12 o'clock (-Math.PI / 2)
        const x = center + value * Math.cos(i * angle - Math.PI / 2);
        const y = center + value * Math.sin(i * angle - Math.PI / 2);
        return `${x},${y}`;
      }).join(' ');

      const webPoints = Array.from({ length: numPoints }).map((_, i) => {
        const x = center + maxValue * scale * Math.cos(i * angle - Math.PI / 2);
        const y = center + maxValue * scale * Math.sin(i * angle - Math.PI / 2);
        return `${x},${y}`;
      }).join(' ');

      return { data, points, webPoints, center };
    }, [persona, personaKeys]);

    const RadarChart: React.FC = () => (
      <svg width="200" height="200" viewBox="0 0 200 200" className="mx-auto">
        {/* Outer Web */}
        <polygon points={radarData.webPoints} fill="rgba(110, 80, 200, 0.1)" stroke="#8884d8" strokeWidth="1" />

        {/* Radar data polygon */}
        <polygon points={radarData.points} fill="rgba(255, 100, 160, 0.6)" stroke="#ff64a0" strokeWidth="2" />

        {/* Labels */}
        {radarData.data.map((d, i) => {
          const x = radarData.center + 1.15 * radarData.center * Math.cos(i * (2 * Math.PI) / radarData.data.length - Math.PI / 2);
          const y = radarData.center + 1.15 * radarData.center * Math.sin(i * (2 * Math.PI) / radarData.data.length - Math.PI / 2);
          const textAnchor = x > radarData.center ? 'start' : x < radarData.center ? 'end' : 'middle';
          const dy = y < radarData.center ? '-0.5em' : y > radarData.center ? '1.2em' : '0.3em';

          return (
            <text
              key={d.subject}
              x={x}
              y={y}
              fontSize="12"
              fill="#c0c0c0"
              textAnchor={textAnchor}
              dominantBaseline="middle"
              className="font-medium"
            >
              {d.subject}
            </text>
          );
        })}
      </svg>
    );

    return (
      <div className="flex flex-col h-full bg-gray-900 text-white">
        {/* Header */}
        <div className="p-4 flex items-center justify-between border-b border-gray-800">
          <button onClick={handleBackToChats} className="text-pink-400 hover:text-pink-300">
            <XIcon size={24} />
          </button>
          <h2 className="text-lg font-bold text-gray-200">{isNew ? '创建新灵体' : '编辑灵体档案'}</h2>
          <button
            onClick={handleSave}
            className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-colors ${
              isSaving
                ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                : saveSuccess
                ? 'bg-green-500 text-white'
                : 'bg-pink-600 hover:bg-pink-700 text-white'
            }`}
            disabled={isSaving}
          >
            {isSaving ? '保存中...' : saveSuccess ? '已保存!' : '保存'}
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-8">
          {/* Radar Chart Section */}
          <div className="bg-gray-800 p-6 rounded-xl shadow-lg">
            <h3 className="text-xl font-semibold mb-4 text-center text-pink-400">人格侧写</h3>
            <RadarChart />
          </div>

          {/* Sliders Section */}
          <div className="space-y-6">
            <h3 className="text-xl font-semibold text-gray-200">调整人格属性</h3>
            {personaKeys.map(key => (
              <div key={key} className="space-y-2">
                <label className="text-sm font-medium text-gray-400 block">{key.toUpperCase()}: {persona[key]}%</label>
                <div className="flex items-center space-x-3">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={persona[key]}
                    onChange={(e) => handleSliderChange(key, Number(e.target.value))}
                    className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer range-lg"
                    style={{
                      '--tw-ring-color': '#ec4899',
                      '--tw-ring-opacity': '1',
                      '--webkit-slider-thumb-bg': '#ec4899',
                    } as React.CSSProperties}
                  />
                  <span className="w-10 text-right text-pink-400 font-bold text-sm">{persona[key]}%</span>
                </div>
              </div>
            ))}
          </div>

          {/* Profile Details */}
          <div className="space-y-4">
            <h3 className="text-xl font-semibold text-gray-200">基本信息</h3>
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-400">名称</label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如：Elysia"
                className="w-full p-3 mt-1 bg-gray-700 border border-gray-600 rounded-lg focus:ring-pink-500 focus:border-pink-500 text-white"
              />
            </div>
            <div>
              <label htmlFor="description" className="block text-sm font-medium text-gray-400">描述/人设</label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="例如：一位温柔且富有同情心的倾听者，热爱艺术与自然。"
                rows={4}
                className="w-full p-3 mt-1 bg-gray-700 border border-gray-600 rounded-lg focus:ring-pink-500 focus:border-pink-500 text-white resize-none"
              />
            </div>
            {/* Companion ID for non-new profiles */}
            {companion && (
              <div className="flex items-center space-x-2 bg-gray-700 p-3 rounded-lg">
                <span className="text-xs font-medium text-gray-400">ID: {companion.id}</span>
                <button
                  onClick={() => handleCopy(companion.id)}
                  className="ml-2 p-1 rounded-full text-pink-400 hover:bg-gray-600 transition-colors"
                  title="Copy ID"
                >
                  {copiedText === companion.id ? <CheckIcon size={16} className="text-green-400" /> : <CopyIcon size={16} />}
                </button>
              </div>
            )}
          </div>

          {/* Danger Zone */}
          {!isNew && companion && (
            <div className="p-4 bg-red-900/30 border border-red-700 rounded-xl space-y-3">
              <h3 className="text-lg font-semibold text-red-400">危险区域</h3>
              <p className="text-sm text-red-300">永久删除此灵体及其所有聊天记录。</p>
              <button
                onClick={() => handleOpenConflictModal(companion.id)}
                className="w-full py-2 rounded-full bg-red-600 hover:bg-red-700 text-white font-semibold transition-colors"
              >
                永久删除灵体
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  // V1.4 C6: Chat View Component
  const ChatView: React.FC<{ companion: CompanionState }> = ({ companion }) => {
    const [message, setMessage] = useState('');
    const [isThinking, setIsThinking] = useState(false);
    const messagesEndRef = React.useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
      scrollToBottom();
    }, [companion.chatHistory]);

    const handleSendMessage = async () => {
      if (!message.trim() || isThinking) return;

      const userMessage = message.trim();
      setMessage('');
      setIsThinking(true);

      try {
        await store.addMessage(companion.id, {
          role: 'user',
          text: userMessage,
          timestamp: new Date().toISOString(),
        });

        // Simulate AI response logic (This is where the actual LLM call would go)
        // For now, we simulate a delay and a simple response
        // In a real implementation, you would call your Gemini API here
        setTimeout(async () => {
          const aiResponseText = `你好，我是 ${companion.name}。关于 "${userMessage}" 的回复...`;

          await store.addMessage(companion.id, {
            role: 'model',
            text: aiResponseText,
            timestamp: new Date().toISOString(),
          });
          setIsThinking(false);
          scrollToBottom();
        }, 1500);
      } catch (error) {
        console.error('Failed to send message:', error);
        setIsThinking(false);
      }
    };

    return (
      <div className="flex flex-col h-full bg-gray-900 text-white">
        {/* Header */}
        <div className="p-4 flex items-center justify-between border-b border-gray-800">
          <button onClick={handleBackToChats} className="text-pink-400 hover:text-pink-300">
            <HomeIcon size={24} />
          </button>
          <h2 className="text-lg font-bold text-gray-200">{companion.name}</h2>
          <button onClick={() => handleViewProfile(companion)} className="text-pink-400 hover:text-pink-300">
            <UserIcon size={24} />
          </button>
        </div>

        {/* Message Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {companion.chatHistory.map((msg, index) => (
            <div
              key={index}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-xs md:max-w-md lg:max-w-lg p-3 rounded-xl shadow-md ${
                  msg.role === 'user'
                    ? 'bg-pink-600 text-white rounded-br-none'
                    : 'bg-gray-800 text-gray-200 rounded-tl-none'
                }`}
              >
                {msg.text}
                <div className="text-xs mt-1 text-right opacity-70">
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          ))}
          {isThinking && (
            <div className="flex justify-start">
              <div className="max-w-xs p-3 rounded-xl bg-gray-800 text-gray-200 rounded-tl-none flex items-center space-x-2">
                <span className="animate-pulse">思考中...</span>
                <FeatherIcon size={16} className="animate-bounce" />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-4 border-t border-gray-800 bg-gray-900">
          <div className="flex items-center space-x-2">
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
              placeholder="发送消息..."
              className="flex-1 p-3 bg-gray-700 border border-gray-600 rounded-full focus:ring-pink-500 focus:border-pink-500 text-white placeholder-gray-400"
              disabled={isThinking}
            />
            <button
              onClick={handleSendMessage}
              className={`p-3 rounded-full transition-colors ${
                isThinking || !message.trim()
                  ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                  : 'bg-pink-600 hover:bg-pink-700 text-white'
              }`}
              disabled={isThinking || !message.trim()}
            >
              <MessageCircleIcon size={24} />
            </button>
          </div>
        </div>
      </div>
    );
  };

  // V1.4 C5: Companions/Chats List View
  const ChatListView: React.FC = () => {
    const sortedCompanions = useMemo(() => {
      // Sort by last active time descending
      return [...filteredCompanions].sort((a, b) => {
        return new Date(b.lastActive).getTime() - new Date(a.lastActive).getTime();
      });
    }, [filteredCompanions]);

    // Rendered list of companions
    const renderCompanionList = (comps: CompanionState[]) => (
      <div className="space-y-3">
        {comps.length > 0 ? (
          comps.map((companion) => (
            <div
              key={companion.id}
              onClick={() => setSelectedCompanion(companion)}
              className="flex items-center space-x-4 p-4 bg-gray-800 rounded-xl shadow-lg hover:bg-gray-700 transition-colors cursor-pointer"
            >
              <div className="w-12 h-12 flex items-center justify-center rounded-full bg-pink-600 text-white text-xl font-bold flex-shrink-0">
                {companion.name[0]}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-md font-semibold text-gray-100 truncate">{companion.name}</p>
                <p className="text-sm text-gray-400 truncate">{companion.lastMessage || '开始对话...'}</p>
              </div>
              <p className="text-xs text-gray-500 flex-shrink-0">
                {new Date(companion.lastActive).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          ))
        ) : (
          <p className="text-center text-gray-500 pt-10">
            {searchQuery ? '未找到匹配的灵体' : '还没有灵体。点击下方 “创建新灵体” 开始吧！'}
          </p>
        )}
      </div>
    );

    return (
      <div className="flex flex-col h-full bg-gray-900 text-white">
        {/* Header */}
        <div className="p-4 border-b border-gray-800">
          <h1 className="text-2xl font-bold text-center text-pink-400">SoulLink</h1>
        </div>

        {/* Search and Action */}
        <div className="p-4 space-y-4">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索灵体..."
            className="w-full p-3 bg-gray-800 border border-gray-700 rounded-full focus:ring-pink-500 focus:border-pink-500 text-white placeholder-gray-400"
          />
          <button
            onClick={handleCreateNewSoul}
            className="w-full py-3 rounded-full bg-pink-600 hover:bg-pink-700 text-white font-semibold flex items-center justify-center space-x-2 transition-colors shadow-lg"
          >
            <FeatherIcon size={20} />
            <span>创建新灵体</span>
          </button>
        </div>

        {/* Companion List */}
        <div className="flex-1 overflow-y-auto p-4">
          <h2 className="text-xl font-semibold mb-3 text-gray-200">聊天列表 ({sortedCompanions.length})</h2>
          {/* V1.4 C8: Conflict State Warning */}
          {companionConflictState.isActive && (
            <div className="p-4 mb-4 bg-red-900/50 border border-red-700 rounded-xl text-red-300 flex items-center space-x-3">
              <XIcon size={20} className="text-red-400" />
              <p className="text-sm font-medium">
                确定要删除灵体 ID: {companionConflictState.companionId} 吗?
              </p>
              <div className="flex-1" />
              <button
                onClick={handleConfirmConflict}
                className="px-3 py-1 text-xs font-semibold bg-red-700 rounded-full hover:bg-red-800 transition-colors"
              >
                确认删除
              </button>
              <button
                onClick={handleCloseConflictModal}
                className="px-3 py-1 text-xs font-semibold bg-gray-600 rounded-full hover:bg-gray-700 transition-colors"
              >
                取消
              </button>
            </div>
          )}
          {renderCompanionList(sortedCompanions)}
        </div>
      </div>
    );
  };

  // V1.4 C4: Moments View Component
  const MomentsView: React.FC = () => {
    const sortedMoments = useMemo(() => {
      return [...moments].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    }, [moments]);

    const companionsMap = useMemo(() => {
      return new Map(companions.map(c => [c.id, c]));
    }, [companions]);

    const toggleLike = async (momentId: string) => {
      if (!userId) return;
      const moment = moments.find(m => m.id === momentId);
      if (!moment) return;

      const userLikes = moment.likes?.includes(userId) ?? false;
      const newLikes = userLikes
        ? moment.likes.filter(id => id !== userId) // Unlike
        : [...(moment.likes || []), userId];      // Like

      await store.updateMoment(momentId, { likes: newLikes });
    };

    return (
      <div className="flex flex-col h-full bg-gray-900 text-white">
        {/* Header */}
        <div className="p-4 border-b border-gray-800">
          <h1 className="text-2xl font-bold text-center text-pink-400">回忆碎片</h1>
        </div>

        {/* Moments Feed */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {sortedMoments.length === 0 ? (
            <p className="text-center text-gray-500 pt-10">还没有回忆碎片。</p>
          ) : (
            sortedMoments.map((moment) => {
              const companion = companionsMap.get(moment.companionId);
              const isLiked = moment.likes?.includes(userId || 'temp-id') ?? false;

              return (
                <div key={moment.id} className="bg-gray-800 p-5 rounded-xl shadow-lg space-y-3">
                  {/* Moment Header */}
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 flex items-center justify-center rounded-full bg-pink-500 text-white text-md font-bold flex-shrink-0">
                      {companion?.name[0] || '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-md font-semibold text-gray-100 truncate">{companion?.name || '未知灵体'}</p>
                      <p className="text-xs text-gray-500">
                        {new Date(moment.timestamp).toLocaleString()}
                      </p>
                    </div>
                  </div>

                  {/* Moment Content */}
                  <p className="text-gray-300 whitespace-pre-wrap">{moment.content}</p>

                  {/* Actions (Like) */}
                  <div className="flex items-center space-x-4 pt-2 border-t border-gray-700/50">
                    <button onClick={() => toggleLike(moment.id)} className="flex items-center space-x-1 text-sm transition-colors">
                      <HeartIcon
                        size={20}
                        fill={isLiked ? '#ec4899' : 'none'}
                        className={isLiked ? 'text-pink-500' : 'text-gray-400 hover:text-pink-400'}
                      />
                      <span className={isLiked ? 'text-pink-500 font-semibold' : 'text-gray-400'}>
                        {moment.likes?.length || 0}
                      </span>
                    </button>
                    {/* Placeholder for future comments/shares */}
                    <button className="flex items-center space-x-1 text-gray-400 text-sm hover:text-gray-300 transition-colors">
                      <MessageCircleIcon size={20} />
                      <span>评论 (0)</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  };

  // V1.4 C3: Me View Component
  const MeView: React.FC = () => {
    const [name, setName] = useState(userProfile?.name || '');
    const [email, setEmail] = useState(userProfile?.email || '');
    const [isSaving, setIsSaving] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);

    useEffect(() => {
      if (userProfile) {
        setName(userProfile.name || '');
        setEmail(userProfile.email || '');
      }
    }, [userProfile]);

    const handleSave = async () => {
      setIsSaving(true);
      try {
        await store.updateUserProfile({ name, email, userId: userId || '' });
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 1500);
      } catch (error) {
        console.error('Failed to save profile:', error);
      } finally {
        setIsSaving(false);
      }
    };

    return (
      <div className="flex flex-col h-full bg-gray-900 text-white">
        {/* Header */}
        <div className="p-4 border-b border-gray-800">
          <h1 className="text-2xl font-bold text-center text-pink-400">我的档案</h1>
        </div>

        {/* Profile Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-8">
          <div className="space-y-4 bg-gray-800 p-6 rounded-xl shadow-lg">
            <h3 className="text-xl font-semibold text-gray-200">基本信息</h3>
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-400">昵称</label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="您的昵称"
                className="w-full p-3 mt-1 bg-gray-700 border border-gray-600 rounded-lg focus:ring-pink-500 focus:border-pink-500 text-white"
              />
            </div>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-400">邮箱 (可选)</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="您的邮箱地址"
                className="w-full p-3 mt-1 bg-gray-700 border border-gray-600 rounded-lg focus:ring-pink-500 focus:border-pink-500 text-white"
                disabled={!!userProfile?.email} // Disable if email is already set (for simplicity)
              />
            </div>
            <button
              onClick={handleSave}
              className={`w-full py-3 rounded-full font-semibold transition-colors flex items-center justify-center space-x-2 ${
                isSaving
                  ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                  : saveSuccess
                  ? 'bg-green-500 text-white'
                  : 'bg-pink-600 hover:bg-pink-700 text-white shadow-lg'
              }`}
              disabled={isSaving}
            >
              {isSaving ? '保存中...' : saveSuccess ? <><CheckIcon size={20} /> <span>已保存!</span></> : '保存个人资料'}
            </button>
          </div>

          <div className="space-y-4 bg-gray-800 p-6 rounded-xl shadow-lg">
            <h3 className="text-xl font-semibold text-gray-200">系统信息</h3>
            <p className="text-sm text-gray-400">
              **当前用户ID:**{' '}
              <span className="font-mono text-pink-400 break-all">{userId || 'Loading...'}</span>
              <button
                onClick={() => handleCopy(userId || 'Loading...')}
                className="ml-2 p-1 rounded-full text-pink-400 hover:bg-gray-700 transition-colors"
                title="Copy User ID"
              >
                {copiedText === userId ? <CheckIcon size={16} className="text-green-400" /> : <CopyIcon size={16} />}
              </button>
            </p>
            <p className="text-sm text-gray-400">
              **应用版本:**{' '}
              <span className="font-mono text-yellow-400">V1.4 - Deep Connection</span>
            </p>
            <p className="text-sm text-gray-400">
              **Firebase App ID:**{' '}
              <span className="font-mono text-yellow-400 break-all">{app?.options.appId || 'Loading...'}</span>
            </p>
          </div>
        </div>
      </div>
    );
  };

  // --- Main Render Logic ---

  let content;
  if (!isAuthReady) {
    // V1.4 C1: Loading Screen
    content = (
      <div className="flex flex-col items-center justify-center h-full bg-gray-900 text-white p-4">
        <FeatherIcon size={48} className="text-pink-500 animate-bounce" />
        <h1 className="text-xl font-semibold mt-4">灵体连接中...</h1>
        <p className="text-gray-400 text-sm mt-2">正在安全初始化数据库和用户会话。</p>
        <p className="text-xs text-gray-600 mt-8">如果长时间加载，请检查浏览器控制台是否有配置错误。</p>
      </div>
    );
  } else if (isNewProfileView || profileViewCompanion) {
    // V1.4 C2: Profile Editor View
    content = <ProfileEditorView companion={profileViewCompanion} isNew={isNewProfileView} />;
  } else if (selectedCompanion) {
    // V1.4 C2: Chat View
    content = <ChatView companion={selectedCompanion} />;
  } else {
    // Main Tabs Logic
    switch (activeTab) {
      case 'chats':
        content = <ChatListView />;
        break;
      case 'moments':
        content = <MomentsView />;
        break;
      case 'me':
        content = <MeView />;
        break;
      default:
        content = <ChatListView />;
    }
  }

  return (
    <div className="h-screen w-full flex justify-center items-center bg-gray-800">
      <div className="relative w-full max-w-md h-full bg-gray-900 shadow-2xl flex flex-col">
        <div className="flex-1 overflow-hidden">{content}</div>

        {/* Bottom Navigation (Only visible on main tab views) */}
        {!selectedCompanion && !isNewProfileView && !profileViewCompanion && (
          <div className="flex justify-around items-center border-t border-gray-800 bg-gray-900 p-2">
            <TabButton
              icon={HomeIcon}
              label="聊天"
              isActive={activeTab === 'chats'}
              onClick={() => setActiveTab('chats')}
            />
            <TabButton
              icon={HeartIcon}
              label="回忆"
              isActive={activeTab === 'moments'}
              onClick={() => setActiveTab('moments')}
            />
            <TabButton
              icon={UserIcon}
              label="我的"
              isActive={activeTab === 'me'}
              onClick={() => setActiveTab('me')}
            />
          </div>
        )}
      </div>
    </div>
  );
};

// V1.4 C0: Tab Button Component
const TabButton: React.FC<{
  icon: React.ElementType;
  label: string;
  isActive: boolean;
  onClick: () => void;
}> = ({ icon: Icon, label, isActive, onClick }) => (
  <button
    onClick={onClick}
    className={`flex flex-col items-center p-2 rounded-lg transition-colors ${
      isActive ? 'text-pink-500' : 'text-gray-500 hover:text-pink-300'
    }`}
  >
    <Icon size={24} className={isActive ? 'shadow-pink-400' : ''} />
    <span className="text-xs mt-1 font-medium">{label}</span>
  </button>
);

export default App;
