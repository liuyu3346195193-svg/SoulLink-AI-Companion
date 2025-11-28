
import React, { useState, useEffect } from 'react';
import { ArrowLeft, Save, Brain, Trash2, Edit2, User, BookOpen, ChevronDown, ChevronRight, Plus, X, Check, Smile, Image as ImageIcon, MessageSquare } from 'lucide-react';
import { Companion, InterfaceLanguage, DICT, UserIdentity, ChatSettings, Memory } from '../types';
import { db } from '../services/store';

interface Props {
    companionId: string;
    lang: InterfaceLanguage;
    onBack: () => void;
    onOpenProfile: () => void;
}

type Section = 'general' | 'identity' | 'config' | 'memories' | null;

const ChatSettingsView: React.FC<Props> = ({ companionId, lang, onBack, onOpenProfile }) => {
    // Re-fetch to ensure fresh data on mount
    const [companion, setCompanion] = useState<Companion | undefined>(db.getCompanion(companionId));
    
    // UI State
    const [activeSection, setActiveSection] = useState<Section>('general');
    
    // Staging States
    const [tempIdentity, setTempIdentity] = useState<UserIdentity | undefined>(companion?.userIdentity);
    const [tempRemark, setTempRemark] = useState<string>(companion?.remark || companion?.name || "");
    const [chatSettings, setChatSettings] = useState<ChatSettings | undefined>(companion?.chatSettings);
    
    // Supplementary Config as List (Split by newlines for CRUD)
    const [configItems, setConfigItems] = useState<string[]>(
        companion?.supplementaryConfig ? companion.supplementaryConfig.split('\n').filter(s => s.trim()) : []
    );
    const [newConfigItem, setNewConfigItem] = useState("");
    
    // Memories Staging
    const [tempMemories, setTempMemories] = useState<Memory[]>(companion?.memories || []);
    const [editingMemoryId, setEditingMemoryId] = useState<string | null>(null);
    const [editMemoryContent, setEditMemoryContent] = useState("");

    const labels = DICT[lang];

    useEffect(() => {
        const current = db.getCompanion(companionId);
        if (current) {
            setCompanion(current);
            setTempIdentity(current.userIdentity);
            setTempRemark(current.remark || current.name);
            setChatSettings(current.chatSettings);
            setConfigItems(current.supplementaryConfig ? current.supplementaryConfig.split('\n').filter(s => s.trim()) : []);
            setTempMemories(current.memories);
        }
    }, [companionId]);

    if (!companion || !tempIdentity || !chatSettings) return null;

    const handleSave = () => {
        const fullConfigString = configItems.join('\n');
        
        const updated: Companion = {
            ...companion,
            remark: tempRemark,
            userIdentity: tempIdentity,
            supplementaryConfig: fullConfigString,
            chatSettings: chatSettings,
            memories: tempMemories
        };
        
        db.updateCompanion(updated);
        setCompanion(updated);
        alert(labels.save + " Success!");
    };

    // Config CRUD
    const addConfigItem = () => {
        if (newConfigItem.trim()) {
            setConfigItems([...configItems, newConfigItem.trim()]);
            setNewConfigItem("");
        }
    };
    const removeConfigItem = (index: number) => {
        const newItems = [...configItems];
        newItems.splice(index, 1);
        setConfigItems(newItems);
    };
    const updateConfigItem = (index: number, val: string) => {
        const newItems = [...configItems];
        newItems[index] = val;
        setConfigItems(newItems);
    };

    // Memory CRUD
    const handleDeleteMemory = (memId: string) => {
        setTempMemories(tempMemories.filter(m => m.id !== memId));
    };
    const startEditMemory = (m: Memory) => {
        setEditingMemoryId(m.id);
        setEditMemoryContent(m.content);
    };
    const saveEditMemory = () => {
        if (editingMemoryId) {
            setTempMemories(tempMemories.map(m => m.id === editingMemoryId ? { ...m, content: editMemoryContent } : m));
            setEditingMemoryId(null);
            setEditMemoryContent("");
        }
    };

    const toggleSection = (s: Section) => {
        setActiveSection(activeSection === s ? null : s);
    };

    return (
        <div className="flex flex-col h-full bg-white">
            <div className="p-4 border-b flex items-center justify-between bg-white z-10 shadow-sm">
                <div className="flex items-center">
                    <button onClick={onBack} className="p-2 -ml-2 text-gray-600 hover:bg-gray-100 rounded-full">
                        <ArrowLeft size={24} />
                    </button>
                    <h2 className="ml-2 font-bold text-lg">{labels.settings}</h2>
                </div>
                <button onClick={handleSave} className="px-4 py-2 bg-indigo-600 text-white rounded-lg flex items-center gap-2 text-sm font-bold shadow hover:bg-indigo-700 active:scale-95 transition-all">
                    <Save size={16} /> {labels.save}
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-20">
                {/* 0. Profile & Persona Navigation (Restored Feature) */}
                <div onClick={onOpenProfile} className="border border-indigo-100 rounded-xl p-4 bg-gradient-to-r from-indigo-50 to-purple-50 flex items-center justify-between cursor-pointer hover:shadow-md transition group">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-white shadow-sm flex items-center justify-center text-indigo-600 border border-indigo-100 group-hover:scale-110 transition">
                             <img src={companion.avatar} className="w-full h-full rounded-full object-cover" />
                        </div>
                        <div>
                            <h3 className="font-bold text-gray-800 text-sm">{labels.userProfile} & {labels.album}</h3>
                            <p className="text-xs text-gray-500">Edit persona, appearance, dimensions</p>
                        </div>
                    </div>
                    <ChevronRight size={18} className="text-gray-400 group-hover:text-indigo-500 group-hover:translate-x-1 transition" />
                </div>

                {/* 1. General Settings */}
                <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                    <button onClick={() => toggleSection('general')} className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 transition">
                        <span className="font-bold text-gray-700 flex items-center gap-2">
                            <SettingsIcon size={16} className="text-gray-500"/> General
                        </span>
                        {activeSection === 'general' ? <ChevronDown size={16}/> : <ChevronRight size={16}/>}
                    </button>
                    {activeSection === 'general' && (
                        <div className="p-4 bg-white space-y-4 animate-in slide-in-from-top-2 border-t border-gray-100">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">{labels.remark}</label>
                                <input 
                                    className="w-full p-2 bg-gray-50 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-100 outline-none" 
                                    value={tempRemark} 
                                    onChange={(e) => setTempRemark(e.target.value)} 
                                />
                            </div>
                            
                            {/* Response Length Selector */}
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-2">{labels.responseLength}</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {(['short', 'medium', 'long'] as const).map((len) => (
                                        <button
                                            key={len}
                                            onClick={() => setChatSettings({...chatSettings, responseLength: len})}
                                            className={`py-2 text-xs font-bold rounded-lg border transition-all 
                                                ${chatSettings.responseLength === len 
                                                    ? 'bg-indigo-50 border-indigo-200 text-indigo-600 shadow-sm ring-1 ring-indigo-200' 
                                                    : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                                        >
                                            {len === 'short' && labels.len_short}
                                            {len === 'medium' && labels.len_medium}
                                            {len === 'long' && labels.len_long}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="flex items-center justify-between">
                                <label className="text-sm font-medium text-gray-700">{labels.language}</label>
                                <div className="flex bg-gray-100 rounded-lg p-1">
                                    <button onClick={() => setChatSettings({...chatSettings, language: 'en'})} className={`px-3 py-1.5 text-xs rounded-md transition ${chatSettings.language === 'en' ? 'bg-white shadow text-indigo-600 font-bold' : 'text-gray-500'}`}>English</button>
                                    <button onClick={() => setChatSettings({...chatSettings, language: 'zh'})} className={`px-3 py-1.5 text-xs rounded-md transition ${chatSettings.language === 'zh' ? 'bg-white shadow text-indigo-600 font-bold' : 'text-gray-500'}`}>中文</button>
                                </div>
                            </div>

                            <div className="flex items-center justify-between">
                                <label className="text-sm font-medium text-gray-700">{labels.auxiliary}</label>
                                <button 
                                    onClick={() => setChatSettings({...chatSettings, allowAuxiliary: !chatSettings.allowAuxiliary})}
                                    className={`w-10 h-6 rounded-full transition-colors relative ${chatSettings.allowAuxiliary ? 'bg-indigo-500' : 'bg-gray-300'}`}
                                >
                                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${chatSettings.allowAuxiliary ? 'left-5' : 'left-1'}`}></div>
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* 2. User Identity */}
                <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                    <button onClick={() => toggleSection('identity')} className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 transition">
                         <span className="font-bold text-gray-700 flex items-center gap-2">
                            <User size={16} className="text-indigo-500"/> {labels.userIdentitySettings}
                        </span>
                        {activeSection === 'identity' ? <ChevronDown size={16}/> : <ChevronRight size={16}/>}
                    </button>
                    {activeSection === 'identity' && (
                        <div className="p-4 bg-white space-y-3 animate-in slide-in-from-top-2 border-t border-gray-100">
                            <div>
                                <label className="text-xs text-gray-400 font-bold uppercase">{labels.name}</label>
                                <input className="w-full p-2 text-sm border rounded-lg mt-1" value={tempIdentity.name} onChange={e => setTempIdentity({...tempIdentity, name: e.target.value})} />
                            </div>
                            <div>
                                <label className="text-xs text-gray-400 font-bold uppercase">{labels.role}</label>
                                <input className="w-full p-2 text-sm border rounded-lg mt-1" value={tempIdentity.relationship} onChange={e => setTempIdentity({...tempIdentity, relationship: e.target.value})} />
                            </div>
                            <div>
                                <label className="text-xs text-gray-400 font-bold uppercase">{labels.persona}</label>
                                <input className="w-full p-2 text-sm border rounded-lg mt-1" value={tempIdentity.personality} onChange={e => setTempIdentity({...tempIdentity, personality: e.target.value})} />
                            </div>
                        </div>
                    )}
                </div>

                {/* 3. Supplementary Config (CRUD List) */}
                <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                    <button onClick={() => toggleSection('config')} className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 transition">
                         <span className="font-bold text-gray-700 flex items-center gap-2">
                            <BookOpen size={16} className="text-emerald-500"/> {labels.supplementaryConfig}
                        </span>
                        {activeSection === 'config' ? <ChevronDown size={16}/> : <ChevronRight size={16}/>}
                    </button>
                    {activeSection === 'config' && (
                        <div className="p-4 bg-white animate-in slide-in-from-top-2 border-t border-gray-100">
                            <p className="text-xs text-gray-400 mb-3">
                                {lang === 'zh' ? '注入到系统提示词中的事实、习惯或背景设定。' : 'Facts, habits, or lore injected into the system prompt.'}
                            </p>
                            <div className="space-y-2 mb-3">
                                {configItems.map((item, idx) => (
                                    <div key={idx} className="flex gap-2 items-center">
                                        <input 
                                            className="flex-1 p-2 text-sm bg-gray-50 border border-transparent hover:bg-white hover:border-gray-200 focus:bg-white focus:border-indigo-300 rounded transition-all"
                                            value={item}
                                            onChange={(e) => updateConfigItem(idx, e.target.value)}
                                        />
                                        <button onClick={() => removeConfigItem(idx)} className="text-gray-400 hover:text-red-500 p-1"><Trash2 size={14}/></button>
                                    </div>
                                ))}
                                {configItems.length === 0 && (
                                    <div className="text-sm text-gray-400 italic text-center py-2">
                                        {lang === 'zh' ? '暂无补充设定。' : 'No supplementary settings.'}
                                    </div>
                                )}
                            </div>
                            <div className="flex gap-2 mt-2">
                                <input 
                                    className="flex-1 p-2 text-sm border rounded-lg"
                                    placeholder={lang === 'zh' ? "添加新设定..." : "Add new detail..."}
                                    value={newConfigItem}
                                    onChange={e => setNewConfigItem(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && addConfigItem()}
                                />
                                <button onClick={addConfigItem} className="p-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600"><Plus size={18}/></button>
                            </div>
                        </div>
                    )}
                </div>

                {/* 4. Core Memories (CRUD) */}
                <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                    <button onClick={() => toggleSection('memories')} className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 transition">
                         <span className="font-bold text-gray-700 flex items-center gap-2">
                            <Brain size={16} className="text-amber-500"/> {labels.coreMemories}
                        </span>
                        {activeSection === 'memories' ? <ChevronDown size={16}/> : <ChevronRight size={16}/>}
                    </button>
                    {activeSection === 'memories' && (
                        <div className="p-4 bg-white animate-in slide-in-from-top-2 space-y-2 border-t border-gray-100">
                            {tempMemories.filter(m => m.isCore).map(m => (
                                <div key={m.id} className="text-sm p-3 bg-amber-50 border border-amber-100 rounded-xl flex flex-col gap-2">
                                    {editingMemoryId === m.id ? (
                                        <div className="flex flex-col gap-2">
                                            <textarea 
                                                className="w-full p-2 text-sm border rounded bg-white" 
                                                value={editMemoryContent} 
                                                onChange={e => setEditMemoryContent(e.target.value)}
                                            />
                                            <div className="flex justify-end gap-2">
                                                <button onClick={() => setEditingMemoryId(null)} className="text-xs text-gray-500 px-2 py-1">Cancel</button>
                                                <button onClick={saveEditMemory} className="text-xs bg-indigo-600 text-white px-3 py-1 rounded">Save</button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex justify-between items-start gap-2">
                                            <span className="text-gray-800 leading-relaxed">{m.content}</span>
                                            <div className="flex flex-col gap-1 shrink-0">
                                                <button onClick={() => startEditMemory(m)} className="text-indigo-400 hover:text-indigo-600 p-1"><Edit2 size={14}/></button>
                                                <button onClick={() => handleDeleteMemory(m.id)} className="text-gray-400 hover:text-red-500 p-1"><Trash2 size={14}/></button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                            {tempMemories.filter(m => m.isCore).length === 0 && (
                                <div className="text-sm text-gray-400 italic text-center py-4">No core memories yet. Tag messages in chat to add them here.</div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

// Simple Icon wrapper for consistency
const SettingsIcon: React.FC<{size: number, className: string}> = ({size, className}) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.09a2 2 0 0 1-1-1.74v-.47a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
);

export default ChatSettingsView;
    