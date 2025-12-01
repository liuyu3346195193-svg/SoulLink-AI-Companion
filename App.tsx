
import React, { useState, useEffect, useRef } from 'react';
import { Users, MessageCircle, Aperture, Settings, Heart, Send, Sliders, PlayCircle, ArrowLeft, PlusCircle, Check, Image as ImageIcon, Globe, User, Edit, Languages, Camera } from 'lucide-react';
import { db } from './services/store';
import { Companion, ViewState, Moment, PersonaDimensions, UserIdentity, ChatSettings, DICT, InterfaceLanguage } from './types';
import ChatScreen from './components/ChatScreen';
import PersonaRadar from './components/PersonaRadar';
import AlbumView from './components/AlbumView';
import ProfileEditor from './components/ProfileEditor';
import ChatSettingsView from './components/ChatSettingsView';
import { generateSocialPostStructured, generateImageFromPrompt, translateText, generateMomentComment, generateMomentReply } from './services/gemini';

// --- Create View (V1.1) ---
const CreateCompanionView: React.FC<{ onCancel: () => void, onComplete: (id: string) => void, lang: InterfaceLanguage }> = ({ onCancel, onComplete, lang }) => {
    const [step, setStep] = useState(1);
    const [data, setData] = useState<Partial<Companion>>({
        name: '', gender: '', age: '', relationship: '', personalityDescription: '', background: '',
        appearance: '',
        avatar: `https://picsum.photos/id/${Math.floor(Math.random() * 100)}/200/200`,
        dimensions: { empathy: 50, rationality: 50, humor: 50, intimacy: 50, creativity: 50 },
        chatSettings: { responseLength: 'medium', allowAuxiliary: true, language: lang }, // Use current lang
        userIdentity: { name: 'User', gender: '', age: '', relationship: '', personality: '', avatar: 'https://ui-avatars.com/api/?name=User' },
        album: []
    });
    
    const labels = DICT[lang];

    const handleCreate = () => {
        const newId = Date.now().toString();
        const fullCompanion: Companion = {
            id: newId,
            name: data.name!, remark: data.name!, avatar: data.avatar!,
            gender: data.gender!, age: data.age!, relationship: data.relationship!,
            personalityDescription: data.personalityDescription!, background: data.background!,
            appearance: data.appearance || `A ${data.gender} character`,
            dimensions: data.dimensions!, userIdentity: data.userIdentity!, chatSettings: data.chatSettings!,
            memories: [], album: [],
            chatHistory: [{ id: 'init', role: 'model', content: `(Opens eyes) Hello... I am ${data.name}.`, timestamp: Date.now() }],
            interactionScore: 50,
            conflictState: { isActive: false, userNegativeScore: 0, conflictLevel: 'Low', lastCheck: 0 }
        };
        db.addCompanion(fullCompanion);
        onComplete(newId);
    };

    return (
        <div className="flex flex-col h-full bg-white">
            <div className="p-4 border-b flex items-center">
                <button onClick={onCancel} className="p-2"><ArrowLeft /></button>
                <h2 className="ml-2 font-bold text-lg">{labels.createSoul}</h2>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {step === 1 && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-right">
                        <h3 className="text-xl font-bold text-indigo-600">{labels.basicInfo}</h3>
                        <div className="flex justify-center mb-6"><img src={data.avatar} className="w-24 h-24 rounded-full border-4 border-indigo-100" /></div>
                        <input placeholder={labels.name} className="w-full p-3 bg-gray-50 rounded-xl border" value={data.name} onChange={e => setData({...data, name: e.target.value})} />
                        {/* B12: Fix overflow by stacking or flex wrap */}
                        <div className="flex gap-2 flex-wrap">
                             <input placeholder={labels.gender} className="flex-1 min-w-[120px] p-3 bg-gray-50 rounded-xl border" value={data.gender} onChange={e => setData({...data, gender: e.target.value})} />
                             <input placeholder={labels.age} className="flex-1 min-w-[120px] p-3 bg-gray-50 rounded-xl border" value={data.age} onChange={e => setData({...data, age: e.target.value})} />
                        </div>
                        <input placeholder={labels.role} className="w-full p-3 bg-gray-50 rounded-xl border" value={data.relationship} onChange={e => setData({...data, relationship: e.target.value})} />
                        <textarea placeholder={labels.bgStory} className="w-full p-3 bg-gray-50 rounded-xl border h-32" value={data.personalityDescription} onChange={e => setData({...data, personalityDescription: e.target.value})} />
                        <textarea placeholder={labels.appearance} className="w-full p-3 bg-gray-50 rounded-xl border h-24" value={data.appearance} onChange={e => setData({...data, appearance: e.target.value})} />
                        <button disabled={!data.name} onClick={() => setStep(2)} className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold disabled:bg-gray-300">{labels.next}</button>
                    </div>
                )}
                {step === 2 && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-right">
                         <h3 className="text-xl font-bold text-indigo-600">{labels.persona}</h3>
                         {/* Increased height to 64 (16rem) from 48 to prevent blurry/cramped text */}
                         <div className="h-64 pointer-events-none w-full"><PersonaRadar dimensions={data.dimensions as PersonaDimensions} lang={lang} /></div>
                         <div className="space-y-4 pb-10">
                             {Object.keys(data.dimensions!).map(key => {
                                 const dimKey = `dim_${key}` as keyof typeof labels;
                                 return (
                                     <div key={key}>
                                         <div className="flex justify-between text-xs uppercase font-bold text-gray-400 mb-1">{labels[dimKey] || key}</div>
                                         <input type="range" className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600 relative z-10" min="0" max="100"
                                            value={data.dimensions![key as keyof PersonaDimensions]}
                                            onChange={e => setData({...data, dimensions: { ...data.dimensions!, [key]: parseInt(e.target.value) }})}
                                         />
                                     </div>
                                 );
                             })}
                         </div>
                         <button onClick={() => handleCreate()} className="w-full py-3 bg-pink-500 text-white rounded-xl font-bold">{labels.bringLife}</button>
                    </div>
                )}
            </div>
        </div>
    );
};

// B11: Me View
const MeView: React.FC<{ lang: InterfaceLanguage, setLang: (l: InterfaceLanguage) => void }> = ({ lang, setLang }) => {
    const [profile, setProfile] = useState(db.getUserProfile());
    const fileInputRef = useRef<HTMLInputElement>(null);
    const labels = DICT[lang];

    const handleSave = () => {
        db.updateUserProfile(profile);
        alert("Profile Saved!");
    };

    const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setProfile(prev => ({ ...prev, avatar: reader.result as string }));
            };
            reader.readAsDataURL(file);
        }
    };

    return (
        <div className="flex flex-col h-full bg-white">
            <div className="pt-12 pb-6 px-6 bg-gray-900 text-white shadow-lg">
                <div className="flex justify-between items-center">
                    <h1 className="text-2xl font-bold">{labels.me}</h1>
                    <button onClick={() => setLang(lang === 'en' ? 'zh' : 'en')} className="p-2 bg-white/20 rounded-full text-xs font-bold flex items-center gap-1">
                        <Globe size={14}/> {lang.toUpperCase()}
                    </button>
                </div>
            </div>
            
            <div className="p-6 space-y-6 flex-1 overflow-y-auto">
                 <div className="flex flex-col items-center">
                     <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                         <img src={profile.avatar} className="w-24 h-24 rounded-full border-4 border-white shadow-lg mb-4 group-hover:brightness-90 transition object-cover" />
                         <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition z-10 mb-4">
                            <Camera className="text-white drop-shadow-md" size={24} />
                         </div>
                         <input 
                            type="file" 
                            ref={fileInputRef} 
                            className="hidden" 
                            accept="image/*" 
                            onChange={handleAvatarUpload} 
                         />
                     </div>

                     <div className="w-full space-y-3">
                         <label className="text-xs text-gray-500 font-bold uppercase">{labels.name}</label>
                         <input value={profile.name} onChange={e => setProfile({...profile, name: e.target.value})} className="w-full p-3 bg-gray-50 rounded-xl border" />
                         
                         {/* Avatar URL can still be manually edited if needed, but upload is primary */}
                         <label className="text-xs text-gray-500 font-bold uppercase">Avatar URL (Optional)</label>
                         <input value={profile.avatar} onChange={e => setProfile({...profile, avatar: e.target.value})} className="w-full p-3 bg-gray-50 rounded-xl border text-gray-400 text-xs truncate" />
                         
                         <label className="text-xs text-gray-500 font-bold uppercase">{labels.gender}</label>
                         <input value={profile.gender} onChange={e => setProfile({...profile, gender: e.target.value})} className="w-full p-3 bg-gray-50 rounded-xl border" />

                         <label className="text-xs text-gray-500 font-bold uppercase">{labels.age}</label>
                         <input value={profile.age} onChange={e => setProfile({...profile, age: e.target.value})} className="w-full p-3 bg-gray-50 rounded-xl border" />
                     </div>
                 </div>
                 <button onClick={handleSave} className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold">{labels.save}</button>
            </div>
        </div>
    );
};

const ContactsView: React.FC<{ onSelect: (id: string) => void, onCreate: () => void, lang: InterfaceLanguage, setLang: (l: InterfaceLanguage) => void }> = ({ onSelect, onCreate, lang, setLang }) => {
  // Use state to track companions for reactivity
  const [companions, setCompanions] = useState<Companion[]>(db.getCompanions());
  const labels = DICT[lang];

  useEffect(() => {
    // Initial sync
    setCompanions(db.getCompanions());
    
    // Subscribe to store changes
    const unsubscribe = db.subscribe(() => {
        setCompanions([...db.getCompanions()]); // Force new reference
    });
    return unsubscribe;
  }, []);

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="pt-12 pb-4 px-6 bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg flex justify-between items-start">
        <div>
            <h1 className="text-2xl font-bold tracking-tight">SoulLink</h1>
            <p className="text-indigo-100 text-sm">V1.4 - Deep Connection</p>
        </div>
        <button onClick={() => setLang(lang === 'en' ? 'zh' : 'en')} className="p-2 bg-white/20 rounded-full hover:bg-white/30 transition text-xs font-bold flex items-center gap-1">
            <Globe size={14}/> {lang.toUpperCase()}
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {companions.map(c => {
          const lastMsg = c.chatHistory[c.chatHistory.length - 1];
          return (
            <div key={c.id} onClick={() => onSelect(c.id)} className="flex items-center p-3 bg-white hover:bg-gray-50 rounded-xl shadow-sm border border-gray-100 transition-all cursor-pointer active:scale-[0.98]">
              <img src={c.avatar} alt={c.name} className="w-14 h-14 rounded-full object-cover border-2 border-indigo-100" />
              <div className="ml-4 flex-1 overflow-hidden">
                <div className="flex justify-between items-baseline">
                  <h3 className="font-semibold text-gray-800">{c.remark || c.name}</h3>
                  <span className="text-xs text-gray-400">
                    {lastMsg ? new Date(lastMsg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : ''}
                  </span>
                </div>
                <p className="text-sm text-gray-500 truncate mt-0.5 pr-4">
                  {lastMsg ? lastMsg.content : c.personalityDescription}
                </p>
              </div>
            </div>
          );
        })}
        <button onClick={onCreate} className="w-full py-4 border-2 border-dashed border-gray-300 rounded-xl text-gray-400 flex items-center justify-center hover:bg-gray-50 hover:border-indigo-300 hover:text-indigo-400 transition-colors group">
            <PlusCircle className="mr-2 group-hover:scale-110 transition-transform"/>
            <span className="font-medium">{labels.createSoul}</span>
        </button>
      </div>
    </div>
  );
};

const MomentsView: React.FC<{lang: InterfaceLanguage}> = ({lang}) => {
  const [moments, setMoments] = useState<Moment[]>(db.getMoments());
  const [generating, setGenerating] = useState(false);
  
  // A9: User Post
  const [showPostInput, setShowPostInput] = useState(false);
  const [userPostContent, setUserPostContent] = useState('');
  
  // A12: Comment UI State
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const [commentInput, setCommentInput] = useState('');

  // A11: Translations map
  const [translations, setTranslations] = useState<Record<string, string>>({});

  const labels = DICT[lang];

  useEffect(() => {
      // Subscribe to store changes
      const unsubscribe = db.subscribe(() => {
          setMoments([...db.getMoments()]);
      });
      return unsubscribe;
  }, []);

  // V1.3.1 A8: Trigger AI Content with Structured Generation + Image
  const triggerAIContent = async () => {
    setGenerating(true);
    const companions = db.getCompanions();
    const randomComp = companions[Math.floor(Math.random() * companions.length)];
    
    if (randomComp) {
        const data = await generateSocialPostStructured(randomComp);
        
        if (data) {
             let imageUrl = undefined;
             if (data.image_prompt) {
                 imageUrl = await generateImageFromPrompt(data.image_prompt) || undefined;
             }

             const newMoment: Moment = {
                id: Date.now().toString(), 
                companionId: randomComp.id, 
                authorRole: 'model', 
                content: data.text_content, 
                timestamp: Date.now(), 
                likes: 0, 
                comments: [],
                image: imageUrl,
                location: data.location
            };
            
            db.addMoment(newMoment);
        }
    }
    setGenerating(false);
  };

  const handleUserPost = async () => {
      if (!userPostContent.trim()) return;
      const newMoment: Moment = {
          id: `u_${Date.now()}`,
          authorRole: 'user',
          content: userPostContent,
          timestamp: Date.now(),
          likes: 0,
          comments: []
      };
      db.addMoment(newMoment);
      setUserPostContent('');
      setShowPostInput(false);

      // V1.8: Trigger AI Comment on User Post
      const companions = db.getCompanions();
      if (companions.length > 0) {
          const randomComp = companions[Math.floor(Math.random() * companions.length)];
          // Simulated delay for AI reading the post
          setTimeout(async () => {
              const comment = await generateMomentComment(randomComp, newMoment.content);
              if (comment) {
                  db.addComment(newMoment.id, comment, randomComp);
              }
          }, 3000);
      }
  };

  const handleLike = async (e: React.MouseEvent, id: string) => {
      e.stopPropagation(); // Prevent container clicks
      await db.likeMoment(id);
  };

  // V1.4 A12: Handle User Comment
  const handleSendComment = (momentId: string) => {
      if (!commentInput.trim()) return;
      db.addComment(momentId, commentInput);
      setCommentInput('');
      setActiveCommentId(null);
      
      // V1.8: Trigger AI Reply if the moment belongs to an AI
      const moment = moments.find(m => m.id === momentId);
      if (moment && moment.authorRole === 'model' && moment.companionId) {
           const comp = db.getCompanion(moment.companionId);
           if (comp) {
               // Simulated delay for AI reply
               setTimeout(async () => {
                   const reply = await generateMomentReply(comp, moment.content, commentInput);
                   if (reply) {
                       db.addComment(momentId, reply, comp);
                   }
               }, 2500);
           }
      }
  };

  // V1.4 A11: Translate
  const handleTranslate = async (momentId: string, text: string) => {
      if (translations[momentId]) return; 
      const targetLang = lang === 'en' ? 'en' : 'zh';
      const t = await translateText(text, targetLang);
      setTranslations(prev => ({...prev, [momentId]: t}));
  };

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <div className="px-6 py-4 bg-white shadow-sm flex justify-between items-center z-10 sticky top-0">
        <h2 className="text-xl font-bold text-gray-800">{labels.moments}</h2>
        <div className="flex gap-2">
            <button onClick={() => setShowPostInput(!showPostInput)} className="p-2 bg-indigo-100 text-indigo-600 rounded-full hover:bg-indigo-200">
                <Edit size={24} />
            </button>
            <button onClick={triggerAIContent} disabled={generating} className={`p-2 rounded-full ${generating ? 'bg-gray-200' : 'bg-pink-100 text-pink-600 hover:bg-pink-200'}`}>
                <Aperture className={generating ? 'animate-spin' : ''} size={24} />
            </button>
        </div>
      </div>

      {showPostInput && (
          <div className="p-4 bg-white border-b border-indigo-100 animate-in slide-in-from-top">
              <textarea 
                className="w-full p-3 border rounded-xl bg-gray-50 text-sm" 
                placeholder={labels.whatsOnMind}
                value={userPostContent}
                onChange={e => setUserPostContent(e.target.value)}
              />
              <div className="flex justify-end mt-2">
                  <button onClick={handleUserPost} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold">{labels.post}</button>
              </div>
          </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {moments.map(m => {
          let authorName = "User";
          let authorAvatar = db.getUserProfile().avatar;
          let authorStatus = null;
          const translation = translations[m.id];
          
          if (m.authorRole === 'model' && m.companionId) {
              const comp = db.getCompanion(m.companionId);
              if (comp) {
                  authorName = comp.remark || comp.name;
                  authorAvatar = comp.avatar;
                  if (comp.conflictState.isActive) {
                      authorStatus = <span className="text-[10px] text-red-500 bg-red-50 px-1 rounded ml-1">Distanced</span>;
                  }
              }
          }

          return (
            <div key={m.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
               <div className="p-4 flex items-center space-x-3">
                 <img src={authorAvatar} className="w-10 h-10 rounded-full object-cover" alt="avatar" />
                 <div>
                     <h4 className="font-bold text-sm text-gray-900 flex items-center">{authorName} {authorStatus}</h4>
                     <span className="text-xs text-gray-400 flex items-center gap-1">
                         {new Date(m.timestamp).toLocaleTimeString()}
                         {m.location && <span className="text-indigo-400">• {m.location}</span>}
                     </span>
                 </div>
               </div>
               
               <div className="px-4 pb-2 text-gray-800 text-sm leading-relaxed">
                   {m.content}
                   {translation && (
                       <div className="mt-2 pt-2 border-t border-dashed border-gray-200 text-gray-500 italic text-xs">
                           <span className="flex items-center gap-1 mb-1 font-semibold text-gray-400"><Languages size={10}/> {labels.translated}</span>
                           {translation}
                       </div>
                   )}
               </div>
               
               {m.image && <div className="w-full h-48 bg-gray-100 overflow-hidden"><img src={m.image} className="w-full h-full object-cover" alt="content" /></div>}
               
               <div className="p-3 border-t border-gray-100 flex flex-col gap-2">
                  <div className="flex space-x-4 items-center">
                      {/* V1.4 B15: Heart Animation */}
                      <button 
                        onClick={(e) => handleLike(e, m.id)} 
                        className="flex items-center text-gray-500 hover:text-pink-500 space-x-1 group active:scale-125 transition-transform"
                      >
                          <Heart 
                             size={18} 
                             className={`transition-colors duration-300 ${m.isLiked ? 'fill-pink-500 text-pink-600' : 'group-hover:fill-pink-500'}`}
                          /> 
                          <span className={`text-xs ${m.isLiked ? 'text-pink-600 font-bold' : ''}`}>{m.likes}</span>
                      </button>
                      <button 
                        onClick={() => setActiveCommentId(activeCommentId === m.id ? null : m.id)} 
                        className="flex items-center text-gray-500 hover:text-indigo-500 space-x-1"
                      >
                          <MessageCircle size={18} /> 
                          <span className="text-xs">{m.comments.length}</span>
                      </button>
                      <button onClick={() => handleTranslate(m.id, m.content)} className="flex items-center text-gray-400 hover:text-gray-600 ml-auto" title={labels.translate}>
                          <Languages size={16}/>
                      </button>
                  </div>
                  
                  {/* Comments Section */}
                  {(m.comments.length > 0 || activeCommentId === m.id) && (
                      <div className="bg-gray-50 p-3 rounded-lg space-y-2 mt-2">
                          {m.comments.map((c, idx) => (
                              <div key={idx} className="text-xs flex gap-1">
                                  <span className="font-bold text-indigo-600 shrink-0">{c.name}:</span> 
                                  <span className="text-gray-700">{c.content}</span>
                              </div>
                          ))}
                          
                          {activeCommentId === m.id && (
                              <div className="flex gap-2 mt-2 animate-in fade-in slide-in-from-top-1">
                                  <input 
                                     autoFocus
                                     className="flex-1 text-xs p-2 border rounded" 
                                     placeholder={labels.writeComment}
                                     value={commentInput}
                                     onChange={(e) => setCommentInput(e.target.value)}
                                     onKeyDown={(e) => e.key === 'Enter' && handleSendComment(m.id)}
                                  />
                                  <button onClick={() => handleSendComment(m.id)} className="p-2 bg-indigo-500 text-white rounded text-xs font-bold">{labels.reply}</button>
                              </div>
                          )}
                      </div>
                  )}
               </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const App: React.FC = () => {
  const [view, setView] = useState<ViewState>(ViewState.CONTACTS);
  const [activeCompanionId, setActiveCompanionId] = useState<string | null>(null);
  const [lang, setLang] = useState<InterfaceLanguage>('zh'); // Default to Chinese

  useEffect(() => {
      db.checkProactiveMessaging();
  }, []); 

  const labels = DICT[lang];

  const handleDeleteCompanion = async (id: string) => {
      await db.deleteCompanion(id);
      setActiveCompanionId(null);
      setView(ViewState.CONTACTS);
  };

  const renderContent = () => {
    switch (view) {
      case ViewState.CONTACTS:
        return <ContactsView onSelect={(id) => { setActiveCompanionId(id); setView(ViewState.CHAT); }} onCreate={() => setView(ViewState.CREATE_COMPANION)} lang={lang} setLang={setLang} />;
      case ViewState.MOMENTS:
        return <MomentsView lang={lang} />;
      case ViewState.CHAT:
        if (!activeCompanionId) return null;
        return <ChatScreen companionId={activeCompanionId} onBack={() => setView(ViewState.CONTACTS)} onOpenProfile={() => setView(ViewState.PROFILE)} onOpenChatSettings={() => setView(ViewState.CHAT_SETTINGS)} lang={lang} />;
      case ViewState.CHAT_SETTINGS: // V1.4
        if (!activeCompanionId) return null;
        return <ChatSettingsView 
            companionId={activeCompanionId} 
            onBack={() => setView(ViewState.CHAT)} 
            onOpenProfile={() => setView(ViewState.PROFILE)}
            onDelete={handleDeleteCompanion} // Pass delete handler
            lang={lang} 
        />;
      case ViewState.PROFILE:
        if (!activeCompanionId) return null;
        return <ProfileEditor companionId={activeCompanionId} onBack={() => setView(ViewState.CHAT)} onOpenAlbum={() => setView(ViewState.ALBUM)} lang={lang} setLang={setLang} />;
      case ViewState.ALBUM:
        if (!activeCompanionId) return null;
        return <AlbumView companionId={activeCompanionId} lang={lang} onBack={() => setView(ViewState.PROFILE)} />;
      case ViewState.CREATE_COMPANION:
        return <CreateCompanionView onCancel={() => setView(ViewState.CONTACTS)} onComplete={(id) => { setActiveCompanionId(id); setView(ViewState.CHAT); }} lang={lang} />;
      case ViewState.USER_SETTINGS:
        return <MeView lang={lang} setLang={setLang} />;
      default:
        return null;
    }
  };

  const showNav = view === ViewState.CONTACTS || view === ViewState.MOMENTS || view === ViewState.USER_SETTINGS;

  return (
    <div className="w-full h-screen max-w-md mx-auto bg-gray-50 flex flex-col overflow-hidden shadow-2xl relative">
      <div className="flex-1 overflow-hidden relative">{renderContent()}</div>
      {showNav && (
        <div className="h-16 bg-white border-t border-gray-200 flex justify-around items-center px-2 z-20">
          <button onClick={() => setView(ViewState.CONTACTS)} className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${view === ViewState.CONTACTS ? 'text-indigo-600' : 'text-gray-400'}`}>
            <MessageCircle size={24} fill={view === ViewState.CONTACTS ? "currentColor" : "none"} /> <span className="text-[10px] font-medium">{labels.chats}</span>
          </button>
          <button onClick={() => setView(ViewState.MOMENTS)} className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${view === ViewState.MOMENTS ? 'text-indigo-600' : 'text-gray-400'}`}>
            <Aperture size={24} /> <span className="text-[10px] font-medium">{labels.moments}</span>
          </button>
          <button onClick={() => setView(ViewState.USER_SETTINGS)} className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${view === ViewState.USER_SETTINGS ? 'text-indigo-600' : 'text-gray-400'}`}>
            <Settings size={24} /> <span className="text-[10px] font-medium">{labels.me}</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default App;
