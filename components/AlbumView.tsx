import React, { useState, useRef } from 'react';
import { Upload, Wand2, Trash2, X, AlertCircle, Download } from 'lucide-react';
import { Companion, AlbumPhoto, DICT, InterfaceLanguage } from '../types';
import { db } from '../services/store';
import { synthesizePhoto } from '../services/gemini';

interface Props {
    companionId: string;
    lang: InterfaceLanguage;
    onBack: () => void;
}

const AlbumView: React.FC<Props> = ({ companionId, lang, onBack }) => {
    const [companion, setCompanion] = useState<Companion | undefined>(db.getCompanion(companionId));
    const [selectedPhoto, setSelectedPhoto] = useState<AlbumPhoto | null>(null);
    const [isSynthesizing, setIsSynthesizing] = useState(false);
    const [statusText, setStatusText] = useState("");
    
    // V1.2.1 C4-3: Scene Input
    const [scene, setScene] = useState("");
    const [showSceneInput, setShowSceneInput] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const labels = DICT[lang];
    const refresh = () => setCompanion(db.getCompanion(companionId));

    const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file && companion) {
            const reader = new FileReader();
            reader.onloadend = () => {
                const newPhoto: AlbumPhoto = {
                    id: Date.now().toString(),
                    url: reader.result as string,
                    description: 'Uploaded by user',
                    uploadedBy: 'user',
                    timestamp: Date.now(),
                    type: 'normal'
                };
                db.addAlbumPhoto(companion.id, newPhoto);
                refresh();
            };
            reader.readAsDataURL(file);
        }
    };

    const handleDelete = (id: string, feedback?: string) => {
        if (!companion) return;
        db.deleteAlbumPhoto(companion.id, id);
        setSelectedPhoto(null);
        refresh();
        // A10 Logic is in store (timeout), user might see it appear later.
    };

    const triggerSynthesis = () => {
        fileInputRef.current?.click();
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.[0]) {
            setShowSceneInput(true);
        }
    };

    // C7: Download
    const handleDownload = (url: string) => {
        const link = document.createElement('a');
        link.href = url;
        link.download = `photo_${Date.now()}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const performSynthesis = async () => {
        if (!companion || !fileInputRef.current?.files?.[0]) return;
        
        setShowSceneInput(false);
        setIsSynthesizing(true);
        setStatusText("Analyzing...");

        const file = fileInputRef.current.files[0];
        const reader = new FileReader();
        reader.onloadend = async () => {
            const base64 = reader.result as string;
            
            const result = await synthesizePhoto(
                companion, 
                base64, 
                scene || `Spending time together with ${companion.name}`
            );
            
            if (result) {
                const newPhoto: AlbumPhoto = {
                    id: Date.now().toString(),
                    url: result,
                    description: `Synthesized: ${scene}`,
                    uploadedBy: 'model',
                    timestamp: Date.now(),
                    type: 'synthesized'
                };
                db.addAlbumPhoto(companion.id, newPhoto);
                refresh();
            } else {
                alert("Synthesis failed.");
            }
            setIsSynthesizing(false);
            setStatusText("");
            setScene("");
        };
        reader.readAsDataURL(file);
    };

    if (!companion) return null;

    return (
        <div className="flex flex-col h-full bg-white relative">
            <div className="p-4 border-b flex justify-between items-center sticky top-0 bg-white z-10">
                <h2 className="text-xl font-bold text-gray-800">{labels.album}</h2>
                <button onClick={onBack} className="text-gray-500 hover:text-gray-800"><X /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
                <div className="flex gap-2 mb-6">
                    <label className="flex-1 flex items-center justify-center gap-2 p-3 bg-gray-50 rounded-xl border border-dashed border-gray-300 cursor-pointer hover:bg-gray-100 transition">
                        <input type="file" className="hidden" accept="image/*" onChange={handleUpload} />
                        <Upload size={18} />
                        <span className="text-sm font-medium text-gray-600">{labels.uploadPhoto}</span>
                    </label>
                    <button 
                        onClick={triggerSynthesis}
                        disabled={isSynthesizing}
                        className="flex-1 flex items-center justify-center gap-2 p-3 bg-indigo-50 rounded-xl border border-dashed border-indigo-200 cursor-pointer hover:bg-indigo-100 transition"
                    >
                        <input ref={fileInputRef} type="file" className="hidden" accept="image/*" onChange={handleFileSelect} />
                        <Wand2 size={18} className={isSynthesizing ? "animate-spin text-indigo-600" : "text-indigo-600"} />
                        <span className="text-sm font-medium text-indigo-700">{isSynthesizing ? statusText || "Processing..." : labels.synthesize}</span>
                    </button>
                </div>

                <div className="grid grid-cols-3 gap-2">
                    {companion.album.map(photo => (
                        <div key={photo.id} onClick={() => setSelectedPhoto(photo)} className="aspect-square relative group cursor-pointer overflow-hidden rounded-lg bg-gray-100">
                            <img src={photo.url} className="w-full h-full object-cover transition-transform group-hover:scale-110" alt="album" />
                            {photo.type === 'synthesized' && (
                                <div className="absolute top-1 right-1 bg-indigo-500/80 p-1 rounded-full text-white">
                                    <Wand2 size={10} />
                                </div>
                            )}
                            {photo.type === 'avatar_history' && (
                                <div className="absolute top-1 left-1 bg-black/50 p-1 rounded-full text-white text-[8px] uppercase px-2">
                                    History
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {showSceneInput && (
                <div className="absolute inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
                        <h3 className="text-lg font-bold mb-2">Imagine the Scene</h3>
                        <p className="text-sm text-gray-500 mb-4">Describe the setting or activity.</p>
                        <textarea 
                            value={scene}
                            onChange={(e) => setScene(e.target.value)}
                            placeholder="e.g. Drinking coffee..."
                            className="w-full border rounded-lg p-3 text-sm h-24 mb-4 focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                        <div className="flex gap-2">
                             <button onClick={() => setShowSceneInput(false)} className="flex-1 py-2 bg-gray-100 rounded-lg text-gray-700 font-medium">{labels.cancel}</button>
                             <button onClick={performSynthesis} className="flex-1 py-2 bg-indigo-600 text-white rounded-lg font-bold shadow-lg shadow-indigo-200">{labels.synthesize}</button>
                        </div>
                    </div>
                </div>
            )}

            {selectedPhoto && (
                <div className="absolute inset-0 z-50 bg-black/95 flex flex-col justify-center items-center p-4">
                    <div className="absolute top-4 right-4 flex gap-4">
                         <button onClick={() => handleDownload(selectedPhoto.url)} className="text-white/70 hover:text-indigo-400" title={labels.download}><Download /></button>
                         <button onClick={() => handleDelete(selectedPhoto.id)} className="text-white/70 hover:text-red-500"><Trash2 /></button>
                         <button onClick={() => setSelectedPhoto(null)} className="text-white/70 hover:text-white"><X /></button>
                    </div>
                    <img src={selectedPhoto.url} className="max-w-full max-h-[80vh] rounded-lg shadow-2xl" alt="detail" />
                    <div className="mt-4 text-center">
                        <p className="text-white/80 text-sm">{selectedPhoto.description}</p>
                        <p className="text-white/40 text-xs mt-1">{new Date(selectedPhoto.timestamp).toLocaleDateString()}</p>
                    </div>
                    
                    <div className="mt-8 flex gap-2">
                        <button onClick={() => handleDelete(selectedPhoto.id, "Not my style")} className="px-3 py-1 bg-white/10 rounded-full text-xs text-white/60 hover:bg-white/20">Don't like style</button>
                        <button onClick={() => handleDelete(selectedPhoto.id, "Bad quality")} className="px-3 py-1 bg-white/10 rounded-full text-xs text-white/60 hover:bg-white/20">Bad quality</button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AlbumView;
