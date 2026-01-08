
import React, { useState, useEffect } from 'react';
import { Promoter, PostAssignment } from '../types';
import { updatePromoter } from '../services/promoterService';
import { getAssignmentsForPromoterByEmail } from '../services/postService';
import { 
    XIcon, UserIcon, CheckCircleIcon, 
    RefreshIcon, MapPinIcon, ShieldCheckIcon, EyeIcon
} from './Icons';
import PhotoViewerModal from './PhotoViewerModal';

interface PromoterFullControlModalProps {
    isOpen: boolean;
    onClose: () => void;
    promoter: Promoter | null;
    onDataUpdated: () => void;
}

const PromoterFullControlModal: React.FC<PromoterFullControlModalProps> = ({ isOpen, onClose, promoter, onDataUpdated }) => {
    const [activeTab, setActiveTab] = useState<'tasks' | 'data' | 'personal'>('tasks');
    const [assignments, setAssignments] = useState<PostAssignment[]>([]);
    const [isLoadingTasks, setIsLoadingTasks] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    
    const [formData, setFormData] = useState<Partial<Promoter>>({});
    const [photoViewer, setPhotoViewer] = useState<{ isOpen: boolean, urls: string[], index: number }>({ 
        isOpen: false, urls: [], index: 0 
    });

    useEffect(() => {
        if (isOpen && promoter) {
            setFormData({ ...promoter });
            fetchAssignments();
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

    const handleSave = async (e: React.FormEvent) => {
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
        <div className="fixed inset-0 bg-black/95 backdrop-blur-sm z-[200] flex items-center justify-center p-4 md:p-8" onClick={onClose}>
            <div className="bg-secondary w-full max-w-4xl max-h-[90vh] rounded-[3rem] border border-white/10 shadow-2xl flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                
                <div className="p-8 bg-dark/40 border-b border-white/5 flex flex-col md:flex-row justify-between items-center gap-6">
                    <div className="flex items-center gap-5">
                        <img src={promoter.facePhotoUrl || promoter.photoUrls[0]} className="w-16 h-16 rounded-2xl object-cover border-2 border-primary" alt="" />
                        <div>
                            <h2 className="text-2xl font-black text-white uppercase tracking-tighter">{promoter.name}</h2>
                            <p className="text-primary font-bold text-[10px] uppercase tracking-widest">{promoter.instagram}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-3 bg-gray-800 text-gray-400 rounded-2xl hover:text-white"><XIcon className="w-6 h-6"/></button>
                </div>

                <div className="flex bg-dark/20 p-2 gap-2 border-b border-white/5 overflow-x-auto">
                    <button onClick={() => setActiveTab('tasks')} className={`px-6 py-2.5 text-[10px] font-black uppercase rounded-xl transition-all whitespace-nowrap ${activeTab === 'tasks' ? 'bg-primary text-white' : 'text-gray-500 hover:bg-white/5'}`}>Histórico Tasks</button>
                    <button onClick={() => setActiveTab('data')} className={`px-6 py-2.5 text-[10px] font-black uppercase rounded-xl transition-all whitespace-nowrap ${activeTab === 'data' ? 'bg-primary text-white' : 'text-gray-500 hover:bg-white/5'}`}>Dados Básicos</button>
                    <button onClick={() => setActiveTab('personal')} className={`px-6 py-2.5 text-[10px] font-black uppercase rounded-xl transition-all whitespace-nowrap ${activeTab === 'personal' ? 'bg-primary text-white' : 'text-gray-500 hover:bg-white/5'}`}>Dados Pessoais (LGPD)</button>
                </div>

                <div className="flex-grow overflow-y-auto p-8 custom-scrollbar">
                    {activeTab === 'tasks' && (
                         <div className="space-y-3">
                            {isLoadingTasks ? <div className="flex justify-center py-10"><RefreshIcon className="w-8 h-8 animate-spin text-primary" /></div> : assignments.map(a => (
                                <div key={a.id} className="bg-dark/40 p-4 rounded-2xl border border-white/5 flex justify-between items-center">
                                    <div className="min-w-0 pr-4">
                                        <h4 className="text-white font-black uppercase text-xs truncate">{a.post?.campaignName}</h4>
                                        <p className="text-[9px] text-gray-500 font-bold uppercase mt-1">{a.status === 'confirmed' ? '✅ Postado' : '⏳ Pendente'}</p>
                                    </div>
                                    {a.proofImageUrls && <button onClick={() => setPhotoViewer({ isOpen: true, urls: a.proofImageUrls!, index: 0 })} className="p-2 bg-gray-800 rounded-xl text-primary"><EyeIcon className="w-4 h-4"/></button>}
                                </div>
                            ))}
                            {assignments.length === 0 && !isLoadingTasks && <p className="text-center text-gray-600 font-bold uppercase text-[10px] py-10">Nenhuma tarefa designada</p>}
                         </div>
                    )}

                    {activeTab === 'data' && (
                        <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fadeIn">
                             <div className="space-y-4">
                                <div><label className="text-[9px] font-black text-gray-500 uppercase ml-1">Nome Completo</label><input value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full bg-dark border border-gray-700 rounded-xl p-3 text-white text-sm" /></div>
                                <div><label className="text-[9px] font-black text-gray-500 uppercase ml-1">Instagram</label><input value={formData.instagram || ''} onChange={e => setFormData({...formData, instagram: e.target.value})} className="w-full bg-dark border border-gray-700 rounded-xl p-3 text-white text-sm" /></div>
                             </div>
                             <div className="space-y-4">
                                <div><label className="text-[9px] font-black text-gray-500 uppercase ml-1">WhatsApp</label><input value={formData.whatsapp || ''} onChange={e => setFormData({...formData, whatsapp: e.target.value})} className="w-full bg-dark border border-gray-700 rounded-xl p-3 text-white text-sm" /></div>
                                <div><label className="text-[9px] font-black text-gray-500 uppercase ml-1">Notas Administrativas</label><textarea rows={3} value={formData.observation || ''} onChange={e => setFormData({...formData, observation: e.target.value})} className="w-full bg-dark border border-gray-700 rounded-xl p-3 text-white text-sm" /></div>
                                <button type="submit" disabled={isSaving} className="w-full py-4 bg-primary text-white font-black rounded-xl uppercase text-[10px] tracking-widest">{isSaving ? 'SALVANDO...' : 'ATUALIZAR CADASTRO'}</button>
                             </div>
                        </form>
                    )}

                    {activeTab === 'personal' && (
                        <div className="space-y-8 animate-fadeIn">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="bg-dark/40 p-6 rounded-2xl border border-white/5">
                                    <p className="text-[9px] font-black text-primary uppercase tracking-widest mb-4 flex items-center gap-2"><ShieldCheckIcon className="w-4 h-4"/> Documentação</p>
                                    <div className="space-y-4">
                                        <div><p className="text-[9px] text-gray-500 font-black uppercase">CPF / Tax ID</p><p className="text-lg font-black text-white font-mono">{promoter.taxId || 'Não Informado'}</p></div>
                                        <div><p className="text-[9px] text-gray-500 font-black uppercase">Data de Nascimento</p><p className="text-lg font-black text-white">{promoter.dateOfBirth || 'Não Informada'}</p></div>
                                    </div>
                                </div>
                                <div className="bg-dark/40 p-6 rounded-2xl border border-white/5">
                                    <p className="text-[9px] font-black text-primary uppercase tracking-widest mb-4 flex items-center gap-2"><MapPinIcon className="w-4 h-4"/> Endereço</p>
                                    {promoter.address ? (
                                        <div className="space-y-3">
                                            <div><p className="text-[9px] text-gray-500 font-black uppercase">Rua / Nº</p><p className="text-sm font-bold text-white uppercase">{promoter.address.street}, {promoter.address.number}</p></div>
                                            <div><p className="text-[9px] text-gray-500 font-black uppercase">Cidade / Estado</p><p className="text-sm font-bold text-white uppercase">{promoter.address.city} - {promoter.address.state}</p></div>
                                            <div><p className="text-[9px] text-gray-500 font-black uppercase">CEP</p><p className="text-sm font-mono text-gray-300">{promoter.address.zipCode}</p></div>
                                        </div>
                                    ) : <p className="text-gray-600 text-xs italic">Endereço não cadastrado.</p>}
                                </div>
                            </div>
                            
                            <div className="p-5 bg-blue-900/10 border border-blue-500/20 rounded-2xl">
                                <p className="text-[10px] text-blue-300 font-bold uppercase text-center leading-relaxed">Estes dados são protegidos por criptografia e acessíveis apenas por administradores com nível total de permissão.</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>

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
