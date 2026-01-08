
import React, { useState, useEffect, useMemo } from 'react';
import firebase from 'firebase/compat/app';
import { Promoter, PostAssignment, Timestamp, RecoveryTemplate } from '../types';
import { updatePromoter } from '../services/promoterService';
import { getAssignmentsForPromoterByEmail, updateAssignment } from '../services/postService';
import { getRecoveryTemplates } from '../services/recoveryService';
import { 
    XIcon, UserIcon, MegaphoneIcon, ChartBarIcon, 
    InstagramIcon, WhatsAppIcon, CheckCircleIcon, 
    ClockIcon, AlertTriangleIcon, PencilIcon, 
    RefreshIcon, TrashIcon, CameraIcon, SearchIcon, CogIcon
} from './Icons';
import StorageMedia from './StorageMedia';
import PhotoViewerModal from './PhotoViewerModal';
import QuickWhatsAppModal from './QuickWhatsAppModal';

interface PromoterFullControlModalProps {
    isOpen: boolean;
    onClose: () => void;
    promoter: Promoter | null;
    onDataUpdated: () => void;
}

const PromoterFullControlModal: React.FC<PromoterFullControlModalProps> = ({ isOpen, onClose, promoter, onDataUpdated }) => {
    const [activeTab, setActiveTab] = useState<'tasks' | 'data' | 'stats'>('tasks');
    const [assignments, setAssignments] = useState<PostAssignment[]>([]);
    const [templates, setTemplates] = useState<RecoveryTemplate[]>([]);
    const [isLoadingTasks, setIsLoadingTasks] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isQuickChatOpen, setIsQuickChatOpen] = useState(false);
    
    const [formData, setFormData] = useState<Partial<Promoter>>({});
    const [photoViewer, setPhotoViewer] = useState<{ isOpen: boolean, urls: string[], index: number }>({ 
        isOpen: false, urls: [], index: 0 
    });

    useEffect(() => {
        if (isOpen && promoter) {
            setFormData({
                name: promoter.name,
                email: promoter.email,
                whatsapp: promoter.whatsapp,
                instagram: promoter.instagram,
                status: promoter.status,
                observation: promoter.observation || ''
            });
            fetchAssignments();
            getRecoveryTemplates(promoter.organizationId).then(setTemplates);
            setActiveTab('tasks');
        }
    }, [isOpen, promoter]);

    const fetchAssignments = async () => {
        if (!promoter?.email) return;
        setIsLoadingTasks(true);
        try {
            const data = await getAssignmentsForPromoterByEmail(promoter.email);
            setAssignments(data);
        } catch (e) { console.error(e); } finally { setIsLoadingTasks(false); }
    };

    const handleSavePromoterData = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!promoter) return;
        setIsSaving(true);
        try {
            await updatePromoter(promoter.id, formData);
            onDataUpdated();
            alert("Dados atualizados!");
        } catch (e: any) { alert(e.message); } finally { setIsSaving(false); }
    };

    if (!isOpen || !promoter) return null;

    return (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[150] flex items-center justify-center p-4 md:p-8" onClick={onClose}>
            <div className="bg-secondary w-full max-w-5xl max-h-[90vh] rounded-[3rem] border border-white/10 shadow-2xl flex flex-col overflow-hidden animate-fadeIn" onClick={e => e.stopPropagation()}>
                
                <div className="p-8 bg-gradient-to-r from-primary/20 to-transparent border-b border-white/5 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                    <div className="flex items-center gap-5">
                        <img src={promoter.facePhotoUrl || promoter.photoUrls[0]} className="w-20 h-20 rounded-2xl object-cover border-2 border-primary shadow-xl" alt="" />
                        <div>
                            <h2 className="text-3xl font-black text-white uppercase tracking-tighter leading-none">{promoter.name}</h2>
                            <div className="flex items-center gap-3 mt-1">
                                <span className="px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest border bg-green-900/40 text-green-400 border-green-800">Equipe Ativa</span>
                                <p className="text-gray-500 text-[10px] font-bold uppercase">WhatsApp: {promoter.whatsapp}</p>
                            </div>
                        </div>
                    </div>
                    <div className="flex gap-3">
                        {/* NOVO BOTÃO DE QUICK CHAT */}
                        <button onClick={() => setIsQuickChatOpen(true)} className="px-6 py-3 bg-green-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-green-500 transition-all shadow-lg shadow-green-900/30 flex items-center gap-2">
                            <WhatsAppIcon className="w-4 h-4" /> CHAT RÁPIDO
                        </button>
                        <button onClick={onClose} className="p-3 bg-gray-800 text-gray-400 rounded-2xl hover:text-white"><XIcon className="w-6 h-6"/></button>
                    </div>
                </div>

                <div className="flex bg-dark/50 p-2 gap-2 border-b border-white/5">
                    <button onClick={() => setActiveTab('tasks')} className={`px-8 py-3 text-xs font-black uppercase rounded-2xl transition-all ${activeTab === 'tasks' ? 'bg-primary text-white' : 'text-gray-500'}`}>Tarefas</button>
                    <button onClick={() => setActiveTab('data')} className={`px-8 py-3 text-xs font-black uppercase rounded-2xl transition-all ${activeTab === 'data' ? 'bg-primary text-white' : 'text-gray-500'}`}>Perfil</button>
                </div>

                <div className="flex-grow overflow-y-auto p-8 custom-scrollbar">
                    {activeTab === 'tasks' && (
                         <div className="space-y-4">
                            {isLoadingTasks ? <RefreshIcon className="w-10 h-10 animate-spin mx-auto text-primary" /> : assignments.map(a => (
                                <div key={a.id} className="bg-dark/40 p-6 rounded-3xl border border-white/5 flex justify-between items-center">
                                    <div>
                                        <h4 className="text-white font-black uppercase text-sm">{a.post?.campaignName}</h4>
                                        <p className="text-[10px] text-gray-500 font-bold uppercase">{a.status === 'confirmed' ? '✅ Postado' : '⏳ Aguardando'}</p>
                                    </div>
                                    <div className="flex gap-2">
                                        {a.proofImageUrls && <button onClick={() => setPhotoViewer({ isOpen: true, urls: a.proofImageUrls!, index: 0 })} className="p-2 bg-gray-800 rounded-xl"><CameraIcon className="w-4 h-4"/></button>}
                                    </div>
                                </div>
                            ))}
                         </div>
                    )}

                    {activeTab === 'data' && (
                        <form onSubmit={handleSavePromoterData} className="grid grid-cols-1 md:grid-cols-2 gap-8">
                             <div className="space-y-4">
                                <label className="text-[10px] font-black text-gray-500 uppercase">Nome</label>
                                <input value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full bg-dark border border-gray-700 rounded-xl p-3 text-white" />
                                <label className="text-[10px] font-black text-gray-500 uppercase">Instagram</label>
                                <input value={formData.instagram || ''} onChange={e => setFormData({...formData, instagram: e.target.value})} className="w-full bg-dark border border-gray-700 rounded-xl p-3 text-white" />
                             </div>
                             <div className="space-y-4">
                                <label className="text-[10px] font-black text-gray-500 uppercase">Observações</label>
                                <textarea rows={4} value={formData.observation || ''} onChange={e => setFormData({...formData, observation: e.target.value})} className="w-full bg-dark border border-gray-700 rounded-xl p-3 text-white" />
                                <button type="submit" className="w-full py-4 bg-primary text-white font-black rounded-xl uppercase text-xs">Salvar</button>
                             </div>
                        </form>
                    )}
                </div>
            </div>

            <QuickWhatsAppModal 
                isOpen={isQuickChatOpen} 
                onClose={() => setIsQuickChatOpen(false)} 
                promoter={promoter} 
                templates={templates} 
            />

            <PhotoViewerModal 
                isOpen={photoViewer.isOpen} 
                imageUrls={photoViewer.urls} 
                startIndex={photoViewer.index} 
                onClose={() => setPhotoViewer({ ...photoViewer, isOpen: false })} 
            />
        </div>
    );
};

export default PromoterFullControlModal;
