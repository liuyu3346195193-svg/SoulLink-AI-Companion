import React, { useState, useEffect, useRef } from 'react';
import { Send, Image as ImageIcon, Mic, MoreVertical, Anchor, ArrowLeft, RefreshCw, Edit2, Plus, Smile, Video, Phone, X, Search, Check, Save, Languages, Brain, Trash2, Settings } from 'lucide-react';
import { Companion, Message, ChatSettings, UserIdentity, InterfaceLanguage, DICT, AlbumPhoto } from '../types';
import { db } from '../services/store';
import { generateReply, translateText } from '../services/gemini';
import ReactMarkdown from 'react-markdown';

interface Props {
  companionId: string;
  onBack: () => void;
  onOpenProfile: () => void;
  onOpenChatSettings: () => void; // V1.4
  lang: InterfaceLanguage; 
}

const ChatScreen: React.FC<Props> = ({ companionId, onBack, onOpenProfile, onOpenChatSettings, lang }) => {
  const [companion, setCompanion] = useState<Companion | undefined>(db.getCompanion(companionId));
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  
  // UI States
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  
  // B10: Search
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // A11: Translations map (msgId -> translatedText)
  const [translations, setTranslations] = useState<Record<string, string>>({});

  const labels = DICT[lang];

  useEffect(() => {
    const interval = setInterval(() => {
      const updated = db.getCompanion(companionId);
      if (updated) {
          setCompanion({...updated});
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [companionId]);

  useEffect(() => {
    if (scrollRef.current && !showSearch) { 
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [companion?.chatHistory.length, isTyping]);

  const handleSend = async (overrideContent?: string) => {
    if ((!input.trim() && !attachedImage && !overrideContent) || !companion) return;

    const contentToSend = overrideContent || input;
    
    // Optimistic UI Update
    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: contentToSend,
      timestamp: Date.now(),
      image: attachedImage || undefined
    };

    db.addMessage(companionId, userMsg);
    const newHistory = [...companion.chatHistory, userMsg];
    setCompanion({ ...companion, chatHistory: newHistory });
    
    setInput('');
    setAttachedImage(null);
    setShowPlusMenu(false);
    setIsTyping(true);

    const replyData = await generateReply(companion, userMsg.content, userMsg.image?.split(',')[1]);
    
    if (replyData.image) {
        const autoPhoto: AlbumPhoto = {
            id: `auto_${Date.now()}`,
            url: replyData.image,
            description: `Generated from chat: ${replyData.text.substring(0, 20)}...`,
            uploadedBy: 'model',
            timestamp: Date.now(),
            type: 'normal'
        };
        db.addAlbumPhoto(companionId, autoPhoto);
    }

    const botMsg: Message = {
      id: (Date.now() + 1).toString(),
      role: 'model',
      content: replyData.text,
      timestamp: Date.now(),
      image: replyData.image 
    };

    db.addMessage(companionId, botMsg);
    setIsTyping(false);
    setCompanion(prev => prev ? ({ ...prev, chatHistory: [...newHistory, botMsg] }) : prev);
  };

  const handleRegenerate = async () => {
      if (!companion || companion.chatHistory.length === 0) return;
      const lastMsg = companion.chatHistory[companion.chatHistory.length - 1];
      if (lastMsg.role !== 'model') return;

      const userMsgIndex = companion.chatHistory.length - 2;
      const userMsg = userMsgIndex >= 0 ? companion.chatHistory[userMsgIndex] : null;

      if (!userMsg) return;

      const historyWithoutLast = companion.chatHistory.slice(0, -1);
      db.setChatHistory(companionId, historyWithoutLast);
      setCompanion({ ...companion, chatHistory: historyWithoutLast });
      
      setIsTyping(true);
      const replyData = await generateReply(companion, userMsg.content, userMsg.image?.split(',')[1]);
       
      if (replyData.image) {
        const autoPhoto: AlbumPhoto = {
            id: `auto_${Date.now()}`,
            url: replyData.image,
            description: `Regenerated from chat`,
            uploadedBy: 'model',
            timestamp: Date.now(),
            type: 'normal'
        };
        db.addAlbumPhoto(companionId, autoPhoto);
      }

      const botMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        content: replyData.text,
        timestamp: Date.now(),
        image: replyData.image
      };
  
      db.addMessage(companionId, botMsg);
      setIsTyping(false);
      setCompanion(prev => prev ? ({ ...prev, chatHistory: [...historyWithoutLast, botMsg] }) : prev);
  };

  const handleEditMessage = async (msgId: string, newContent: string) => {
      if (!companion) return;
      const msgIndex = companion.chatHistory.findIndex(m => m.id === msgId);
      if (msgIndex === -1) return;
      const historyKept = companion.chatHistory.slice(0, msgIndex);
      db.setChatHistory(companionId, historyKept);
      setCompanion({...companion, chatHistory: historyKept});
      setInput(newContent);
      setEditingMsgId(null);
      handleSend(newContent); 
  };

  const toggleAnchor = (msgId: string) => {
      if (!companion) return;
      db.toggleMemoryAnchor(companionId, msgId);
      setCompanion(db.getCompanion(companionId));
  };

  const handleTranslate = async (msgId: string, text: string) => {
      if (translations[msgId]) return; // Already translated
      const targetLang = lang === 'en' ? 'en' : 'zh'; // Translate TO current UI lang (assuming msg is in other)
      const t = await translateText(text, targetLang);
      setTranslations(prev => ({...prev, [msgId]: t}));
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setAttachedImage(reader.result as string);
        setShowPlusMenu(false);
      };
      reader.readAsDataURL(file);
    }
  };

  if (!companion) return <div>Companion not found</div>;

  const displayedHistory = searchQuery 
     ? companion.chatHistory.filter(m => m.content.toLowerCase().includes(searchQuery.toLowerCase()))
     : companion.chatHistory;

  return (
    <div className="flex flex-col h-full bg-[#f2f2f2] relative">
      
      {/* --- Header --- */}
      <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200 shadow-sm z-20">
        <div className="flex items-center cursor-pointer" onClick={onOpenProfile}>
            <button onClick={(e) => { e.stopPropagation(); onBack(); }} className="p-2 -ml-2 text-gray-600 hover:bg-gray-100 rounded-full">
               <ArrowLeft size={24} />
            </button>
            <div className="flex flex-col ml-2">
                <span className="font-semibold text-gray-800">{companion.remark || companion.name}</span>
                {companion.remark && companion.remark !== companion.name && (
                    <span className="text-[10px] text-gray-400">({companion.name})</span>
                )}
            </div>
        </div>
        <div className="flex items-center gap-1">
            <button onClick={() => setShowSearch(!showSearch)} className={`p-2 rounded-full ${showSearch ? 'bg-gray-100 text-indigo-600' : 'text-gray-600 hover:bg-gray-100'}`}>
                <Search size={22} />
            </button>
            <button onClick={onOpenChatSettings} className="p-2 text-gray-600 hover:bg-gray-100 rounded-full">
               <Settings size={24} />
            </button>
        </div>
      </div>

      {/* Search Bar */}
      {showSearch && (
          <div className="px-4 py-2 bg-white border-b border-gray-100 animate-in slide-in-from-top-2">
              <input 
                 autoFocus
                 className="w-full bg-gray-100 rounded-lg px-3 py-2 text-sm outline-none"
                 placeholder={labels.search}
                 value={searchQuery}
                 onChange={(e) => setSearchQuery(e.target.value)}
              />
          </div>
      )}

      {/* V1.4 C8: Conflict State Warning */}
      {companion.conflictState.isActive && (
          <div className="px-4 py-2 bg-red-100 text-red-700 text-sm font-medium border-b border-red-200 flex items-center gap-2">
              <X size={16} />
              <span>{labels.argumentWarning}</span>
          </div>
      )}

      {/* --- Chat Area --- */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4" onClick={() => setShowPlusMenu(false)}>
        {displayedHistory.map((msg, idx) => {
          const isMe = msg.role === 'user';
          const isLast = idx === companion.chatHistory.length - 1;
          const translation = translations[msg.id];
          
          return (
            <div key={msg.id} className={`flex w-full group ${isMe ? 'justify-end' : 'justify-start'}`}>
              {!isMe && (
                <img src={companion.avatar} alt="avatar" className="w-10 h-10 rounded-full mr-3 border border-gray-300 self-start" />
              )}
              {isMe && companion.userIdentity.avatar && (
                 <img src={companion.userIdentity.avatar} alt="me" className="w-10 h-10 rounded-full ml-3 border border-gray-300 self-start order-last" />
              )}
              
              <div className={`max-w-[75%] flex flex-col ${isMe ? 'items-end' : 'items-start'} relative`}>
                {msg.image && (
                   <img src={msg.image} className="max-w-full rounded-lg mb-2 shadow-sm border border-black/10" alt="content" />
                )}
                
                <div
                  className={`px-4 py-2.5 rounded-2xl shadow-sm text-sm leading-relaxed relative 
                    ${isMe ? 'bg-[#95ec69] text-black rounded-tr-none' : 'bg-white text-gray-800 rounded-tl-none'}
                  `}
                >
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                  
                  {/* A11 Translation Display */}
                  {translation && (
                      <div className="mt-2 pt-2 border-t border-black/10 text-gray-600 text-xs italic">
                          <div className="flex items-center gap-1 mb-1 text-gray-400"><Languages size={10}/> {labels.translated}</div>
                          {translation}
                      </div>
                  )}

                  {!isMe && (
                      <button 
                        onClick={() => toggleAnchor(msg.id)}
                        className={`absolute -right-8 top-2 p-1.5 rounded-full transition-all 
                            ${msg.isMemoryAnchored 
                                ? 'text-yellow-500 bg-white shadow opacity-100 scale-100' 
                                : 'text-gray-300 opacity-0 group-hover:opacity-100 hover:text-yellow-500 scale-90 hover:scale-100'}
                        `}
                      >
                          <Anchor size={14} fill={msg.isMemoryAnchored ? "currentColor" : "none"} />
                      </button>
                  )}
                </div>

                <div className={`flex items-center mt-1 space-x-2 opacity-0 group-hover:opacity-100 transition-opacity ${isMe ? 'flex-row-reverse space-x-reverse' : ''}`}>
                    <span className="text-[10px] text-gray-400">
                        {new Date(msg.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
                    </span>
                    
                    {/* A11 Translate Button */}
                    <button onClick={() => handleTranslate(msg.id, msg.content)} className="p-1 hover:bg-gray-200 rounded text-gray-500" title={labels.translate}>
                        <Languages size={12} />
                    </button>
                    
                    {isMe ? (
                         <button onClick={() => { setInput(msg.content); setEditingMsgId(msg.id); }} className="p-1 hover:bg-gray-200 rounded text-gray-500" title="Edit">
                             <Edit2 size={12} />
                         </button>
                    ) : (
                        isLast && (
                            <button onClick={handleRegenerate} className="p-1 hover:bg-gray-200 rounded text-gray-500" title="Regenerate">
                                <RefreshCw size={12} />
                            </button>
                        )
                    )}
                </div>
              </div>
            </div>
          );
        })}
        {isTyping && (
          <div className="flex w-full justify-start">
            <img src={companion.avatar} alt="avatar" className="w-10 h-10 rounded-full mr-3 border border-gray-300" />
            <div className="bg-white px-4 py-3 rounded-2xl rounded-tl-none shadow-sm flex space-x-1">
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-75"></div>
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-150"></div>
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-300"></div>
            </div>
          </div>
        )}
      </div>

      {/* --- Input Area --- */}
      <div className="bg-gray-100 border-t border-gray-200">
        {attachedImage && (
            <div className="px-4 pt-2">
                <div className="relative inline-block">
                    <img src={attachedImage} alt="preview" className="h-16 rounded-lg border border-gray-300" />
                    <button onClick={() => setAttachedImage(null)} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs">×</button>
                </div>
            </div>
        )}

        <div className="px-3 py-2 flex items-end gap-2">
          <div className="relative">
             <button 
                onClick={() => setShowPlusMenu(!showPlusMenu)}
                className={`p-2 mb-1 rounded-full text-gray-600 transition-colors ${showPlusMenu ? 'bg-gray-300 rotate-45' : 'bg-white shadow-sm hover:bg-gray-50'}`}
             >
                <Plus size={24} /> 
             </button>
             
             {showPlusMenu && (
                 <div className="absolute bottom-14 left-0 bg-gray-800/90 backdrop-blur-md text-white rounded-xl p-3 shadow-xl w-48 z-30 flex flex-col gap-2 animate-in fade-in slide-in-from-bottom-2">
                     <label className="flex items-center gap-3 p-2 hover:bg-white/10 rounded-lg cursor-pointer transition">
                         <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                         <ImageIcon size={20} className="text-green-400"/>
                         <span className="text-sm">Photo</span>
                     </label>
                 </div>
             )}
          </div>

          <div className="flex-1 bg-white rounded-2xl shadow-sm border border-gray-200 flex items-center px-2 py-1">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                      if (editingMsgId) handleEditMessage(editingMsgId, input);
                      else handleSend();
                  }
              }}
              placeholder={editingMsgId ? "Editing..." : "Message..."}
              className="flex-1 px-2 py-2 bg-transparent outline-none text-gray-800 placeholder-gray-400"
            />
            <button className="p-2 text-gray-500 hover:text-yellow-500 transition-colors">
              <Smile size={24} />
            </button>
          </div>
          
          <button 
            onClick={() => editingMsgId ? handleEditMessage(editingMsgId, input) : handleSend()}
            disabled={!input.trim() && !attachedImage}
            className={`p-2 mb-1 rounded-full shadow-sm text-white transition-all
                ${(!input.trim() && !attachedImage) ? 'bg-gray-300' : 'bg-[#95ec69] hover:bg-[#85d65c] active:scale-95'}
            `}>
            {editingMsgId ? <Edit2 size={24} className="p-0.5" /> : <Send size={24} className={(!input.trim() && !attachedImage) ? "text-gray-500" : "text-black"} />}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatScreen;