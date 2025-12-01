
import React, { useState, useRef } from 'react';
import { ArrowLeft, Image as ImageIcon, Globe, Save, Edit3, Camera, X } from 'lucide-react';
import { Companion, PersonaDimensions, InterfaceLanguage, DICT } from '../types';
import { db } from '../services/store';
import PersonaRadar from './PersonaRadar';

interface Props {
  companionId: string;
  onBack: () => void;
  onOpenAlbum: () => void;
  lang: InterfaceLanguage;
  setLang: (l: InterfaceLanguage) => void;
}

const ProfileEditor: React.FC<Props> = ({ companionId, onBack, onOpenAlbum, lang, setLang }) => {
    const [companion, setCompanion] = useState(db.getCompanion(companionId));
    
    // Local state for text fields to avoid jitter/database spam, save on blur or button
    const [formData, setFormData] = useState({
        name: companion?.name || '',
        avatar: companion?.avatar || '',
        description: companion?.personalityDescription || '',
        gender: companion?.gender || '',
        age: companion?.age || '',
        relationship: companion?.relationship || '',
        background: companion?.background || '',
        appearance: companion?.appearance || ''
    });

    const [isDirty, setIsDirty] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    if (!companion) return null;
    
    const labels = DICT[lang];
    const themeColor = companion.dimensions.rationality > companion.dimensions.empathy ? "#6366f1" : "#ec4899";

    const handleSliderChange = (key: keyof PersonaDimensions, val: number) => {
        const updated = { ...companion, dimensions: { ...companion.dimensions, [key]: val } };
        setCompanion(updated);
        db.updateCompanion(updated);
    };

    const handleTextChange = (field: keyof typeof formData, value: string) => {
        setFormData(prev => ({ ...prev, [field]: value }));
        setIsDirty(true);
    };

    const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                const result = reader.result as string;
                setFormData(prev => ({ ...prev, avatar: result }));
                setIsDirty(true);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSave = () => {
        const updated = {
            ...companion,
            name: formData.name,
            avatar: formData.avatar,
            personalityDescription: formData.description,
            gender: formData.gender,
            age: formData.age,
            relationship: formData.relationship,
            background: formData.background,
            appearance: formData.appearance,
            // If name changed, also update remark if it was same
            remark: (companion.remark === companion.name) ? formData.name : companion.remark
        };
        db.updateCompanion(updated);
        
        // Optional: If avatar changed, archive old one (using store helper or manually)
        if (formData.avatar !== companion.avatar) {
             db.changeCompanionAvatar(companion.id, formData.avatar);
        } else {
             setCompanion(updated); // simple update if avatar didn't change logic wise (store handles merge)
        }
        
        setCompanion(updated);
        setIsDirty(false);
    };

    return (
        <div className="flex flex-col h-full bg-slate-900 text-white overflow-y-auto">
            {/* Header */}
            <div className="px-4 py-3 flex items-center justify-between sticky top-0 bg-slate-900/95 backdrop-blur z-20 border-b border-white/10">
                <div className="flex items-center">
                    <button onClick={onBack} className="p-2 -ml-2 rounded-full hover:bg-white/10 transition"><ArrowLeft size={24} /></button>
                    <h2 className="ml-2 font-bold text-lg">{labels.userProfile}</h2>
                </div>
                <div className="flex gap-2">
                    <button onClick={() => setLang(lang === 'en' ? 'zh' : 'en')} className="p-2 bg-white/10 hover:bg-white/20 rounded-full text-xs font-bold flex items-center gap-1 transition">
                        <Globe size={14}/> {lang.toUpperCase()}
                    </button>
                    {isDirty && (
                        <button onClick={handleSave} className="flex items-center gap-1 bg-indigo-600 hover:bg-indigo-500 px-3 py-1.5 rounded-full text-xs font-bold transition animate-in fade-in zoom-in">
                            <Save size={14}/> {labels.save}
                        </button>
                    )}
                </div>
            </div>

            <div className="p-6 pb-12 space-y-8">
                 {/* Hero Section */}
                 <div className="flex flex-col items-center">
                     <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                        <div className="absolute -inset-1 bg-gradient-to-r from-pink-600 to-purple-600 rounded-full blur opacity-75 group-hover:opacity-100 transition duration-1000 group-hover:duration-200"></div>
                        <img src={formData.avatar} className="relative w-28 h-28 rounded-full border-4 border-slate-800 object-cover shadow-xl group-hover:brightness-75 transition" alt="avatar" />
                        
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition z-10">
                            <Camera className="text-white drop-shadow-md" size={32} />
                        </div>
                        <input 
                            type="file" 
                            ref={fileInputRef} 
                            className="hidden" 
                            accept="image/*" 
                            onChange={handleAvatarUpload} 
                        />
                     </div>
                     <span className="text-xs text-slate-400 mt-2">Tap avatar to change</span>
                     
                     {/* Name Input */}
                     <input 
                        className="mt-2 bg-transparent text-2xl font-bold text-center border-b border-transparent hover:border-white/20 focus:border-indigo-500 outline-none transition-all w-2/3 placeholder-white/30"
                        value={formData.name}
                        onChange={e => handleTextChange('name', e.target.value)}
                        placeholder="Name"
                     />
                     
                     {/* Album Access (Prominent) */}
                     <button onClick={onOpenAlbum} className="mt-6 flex items-center gap-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white px-8 py-3 rounded-full font-bold text-sm shadow-lg shadow-indigo-900/50 transition-all active:scale-95 border border-white/10">
                        <ImageIcon size={18}/> {labels.album}
                     </button>
                 </div>

                 {/* Basic Info Grid */}
                 <div className="grid grid-cols-3 gap-3">
                     <div className="bg-white/5 rounded-xl p-3 border border-white/5 flex flex-col hover:bg-white/10 transition">
                         <span className="text-[10px] text-gray-500 uppercase font-bold mb-1">{labels.gender}</span>
                         <input className="bg-transparent text-sm font-medium outline-none text-gray-200 w-full" value={formData.gender} onChange={e => handleTextChange('gender', e.target.value)} />
                     </div>
                     <div className="bg-white/5 rounded-xl p-3 border border-white/5 flex flex-col hover:bg-white/10 transition">
                         <span className="text-[10px] text-gray-500 uppercase font-bold mb-1">{labels.age}</span>
                         <input className="bg-transparent text-sm font-medium outline-none text-gray-200 w-full" value={formData.age} onChange={e => handleTextChange('age', e.target.value)} />
                     </div>
                     <div className="bg-white/5 rounded-xl p-3 border border-white/5 flex flex-col hover:bg-white/10 transition">
                         <span className="text-[10px] text-gray-500 uppercase font-bold mb-1">{labels.role}</span>
                         <input className="bg-transparent text-sm font-medium outline-none text-gray-200 w-full" value={formData.relationship} onChange={e => handleTextChange('relationship', e.target.value)} />
                     </div>
                 </div>

                 {/* Text Descriptions */}
                 <div className="space-y-4">
                     <div>
                         <label className="text-xs font-bold text-gray-500 uppercase ml-1 mb-1 block">{labels.persona}</label>
                         <textarea 
                            className="w-full bg-white/5 border border-white/5 rounded-xl p-3 text-sm text-gray-300 focus:ring-1 focus:ring-indigo-500 outline-none min-h-[80px]"
                            value={formData.description}
                            onChange={e => handleTextChange('description', e.target.value)}
                            placeholder="Personality description..."
                         />
                     </div>
                     <div>
                         <label className="text-xs font-bold text-gray-500 uppercase ml-1 mb-1 block">{labels.bgStory}</label>
                         <textarea 
                            className="w-full bg-white/5 border border-white/5 rounded-xl p-3 text-sm text-gray-300 focus:ring-1 focus:ring-indigo-500 outline-none min-h-[80px]"
                            value={formData.background}
                            onChange={e => handleTextChange('background', e.target.value)}
                            placeholder="Background story..."
                         />
                     </div>
                     <div>
                         <label className="text-xs font-bold text-gray-500 uppercase ml-1 mb-1 block">{labels.appearance}</label>
                         <textarea 
                            className="w-full bg-white/5 border border-white/5 rounded-xl p-3 text-sm text-gray-300 focus:ring-1 focus:ring-indigo-500 outline-none min-h-[80px]"
                            value={formData.appearance}
                            onChange={e => handleTextChange('appearance', e.target.value)}
                            placeholder="Visual appearance description..."
                         />
                     </div>
                 </div>

                 {/* Dimensions */}
                 <div className="space-y-4">
                     <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">{labels.personalitySpectrum}</h3>
                     
                     {/* Chart Container */}
                     <div className="h-64 w-full bg-white/5 rounded-2xl p-4 border border-white/5 shadow-inner">
                        <PersonaRadar dimensions={companion.dimensions} color={themeColor} lang={lang} />
                     </div>
                
                     {/* Sliders */}
                     <div className="space-y-6 bg-white/5 p-6 rounded-2xl border border-white/5">
                         {(Object.keys(companion.dimensions) as Array<keyof PersonaDimensions>).map((key) => {
                             const dimKey = `dim_${key}` as keyof typeof labels;
                             return (
                                 <div key={key}>
                                     <div className="flex justify-between mb-2">
                                         <span className="capitalize text-sm font-medium text-slate-300">{labels[dimKey] || key}</span>
                                         <span className="text-sm font-mono text-indigo-400">{companion.dimensions[key]}%</span>
                                     </div>
                                     <input type="range" min="0" max="100" value={companion.dimensions[key]} onChange={(e) => handleSliderChange(key, parseInt(e.target.value))} className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500 relative z-10"/>
                                 </div>
                             );
                         })}
                     </div>
                 </div>
            </div>
        </div>
    );
};

export default ProfileEditor;
