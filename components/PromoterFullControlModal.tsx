
import React, { useState, useEffect, useMemo } from 'react';
import firebase from 'firebase/compat/app';
import { Promoter, PostAssignment, Timestamp } from '../types';
import { updatePromoter } from '../services/promoterService';
import { getAssignmentsForPromoterByEmail, updateAssignment } from '../services/postService';
// Added CogIcon to imports
import { 
    XIcon, UserIcon, MegaphoneIcon, ChartBarIcon, 
    InstagramIcon, WhatsAppIcon, CheckCircleIcon, 
    ClockIcon, AlertTriangleIcon, PencilIcon, 
    RefreshIcon, TrashIcon, CameraIcon, SearchIcon, CogIcon
} from './Icons';
import StorageMedia from './StorageMedia';
import PhotoViewerModal from './PhotoViewerModal';

interface PromoterFullControlModalProps {
    isOpen: boolean;
    onClose: () => void;
    promoter: Promoter | null;
    onDataUpdated: () => void;
}

const PromoterFullControlModal: React.FC<PromoterFullControlModalProps> = ({ isOpen, onClose, promoter, onDataUpdated }) => {
    const [activeTab, setActiveTab] = useState<'tasks' | 'data' | 'stats'>('tasks');
    const [assignments, setAssignments] = useState<PostAssignment[]>([]);
    const [isLoadingTasks, setIsLoadingTasks] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    
    // Form state para edição de dados
    const [formData, setFormData] = useState<Partial<Promoter>>({});
    
    // Photo Viewer state
    const [photoViewer, setPhotoViewer] = useState<{ isOpen: boolean, urls: string[], index: number }>({ 
        isOpen: false, urls: [], index: 0 
    });

    const fetchAssignments = async () => {
        if (!promoter?.email) return;
        setIsLoadingTasks(true);
        try {
            const data = await getAssignmentsForPromoterByEmail(promoter.email);
            setAssignments(data);
        } catch (e) {
            console.error("Erro ao carregar tarefas:", e);
        } finally {
            setIsLoadingTasks(false);
        }
    };

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
            setActiveTab('tasks');
        }
    }, [isOpen, promoter]);

    const handleSavePromoterData = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!promoter) return;
        setIsSaving(true);
        try {
            await updatePromoter(promoter.id, formData);
            onDataUpdated();
            alert("Dados updated com sucesso!");
        } catch (e: any) {
            alert("Erro ao salvar: " + e.message);
        } finally {
            setIsSaving(false);
        }
    };

    const handleUpdateTaskStatus = async (assignmentId: string, status: 'pending' | 'confirmed' | 'completed_manual') => {
        if (!window.confirm("Deseja alterar o status desta postagem?")) return;
        
        setIsSaving(true);
        try {
            let data: Partial<PostAssignment> = {};
            if (status === 'completed_manual') {
                data = {
                    status: 'confirmed',
                    proofSubmittedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    proofImageUrls: ['manual_approval']
                };
            } else {
                data = {
                    status: status as any,
                    proofSubmittedAt: null,
                    proofImageUrls: []
                };
            }
            await updateAssignment(assignmentId, data);
            await fetchAssignments();
        } catch (e: any) {
            alert("Erro ao atualizar tarefa: " + e.message);
        } finally {
            setIsSaving(false);
        }
    };

    const handleAcceptJustification = async (assignment: PostAssignment) => {
        if (!window.confirm("Aceitar esta justificativa e dar presença para a divulgadora?")) return;
        setIsSaving(true);
        try {
            await updateAssignment(assignment.id, { justificationStatus: 'accepted' });
            await fetchAssignments();
        } catch (e: any) {
            alert(e.message);
        } finally {
            setIsSaving(false);
        }
    };

    const stats = useMemo(() => {
        const total = assignments.length;
        const completed = assignments.filter(a => !!a.proofSubmittedAt || a.justificationStatus === 'accepted').length;
        const justified = assignments.filter(a => !!a.justification && a.justificationStatus !== 'accepted').length;
        const rate = total > 0 ? Math.round((completed / total) * 100) : 0;
        return { total, completed, justified, rate };
    }, [assignments]);

    if (!isOpen || !promoter) return null;

    return (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[150] flex items-center justify-center p-4 md:p-8" onClick={onClose}>
            <div className="bg-secondary w-full max-w-5xl max-h-[90vh] rounded-[3rem] border border-white/10 shadow-2xl flex flex-col overflow-hidden animate-fadeIn" onClick={e => e.stopPropagation()}>
                
                {/* HEADER */}
                <div className="p-8 bg-gradient-to-r from-primary/20 to-transparent border-b border-white/5 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                    <div className="flex items-center gap-5">
                        <div className="relative group cursor-pointer" onClick={() => setPhotoViewer({ isOpen: true, urls: promoter.photoUrls || [], index: 0 })}>
                            <img src={promoter.facePhotoUrl || promoter.photoUrls[0]} className="w-20 h-20 rounded-2xl object-cover border-2 border-primary shadow-xl group-hover:scale-105 transition-transform" alt="" />
                            <div className="absolute inset-0 bg-primary/20 opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl flex items-center justify-center">
                                <SearchIcon className="w-6 h-6 text-white" />
                            </div>
                        </div>
                        <div>
                            <h2 className="text-3xl font-black text-white uppercase tracking-tighter leading-tight">{promoter.name}</h2>
                            <div className="flex items-center gap-3 mt-1">
                                <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest border ${promoter.status === 'approved' ? 'bg-green-900/40 text-green-400 border-green-800' : 'bg-red-900/40 text-red-400 border-red-800'}`}>
                                    {promoter.status === 'approved' ? 'Equipe Ativa' : 'Inativa'}
                                </span>
                                <p className="text-gray-500 text-[10px] font-bold uppercase tracking-widest">ID: {promoter.id.substring(0, 8)}</p>
                            </div>
                        </div>
                    </div>
                    <div className="flex gap-3">
                        <a href={`https://wa.me/55${promoter.whatsapp}`} target="_blank" rel="noreferrer" className="p-3 bg-green-600/20 text-green-400 rounded-2xl hover:bg-green-600 hover:text-white transition-all border border-green-600/30"><WhatsAppIcon className="w-6 h-6"/></a>
                        <a href={`https://instagram.com/${promoter.instagram}`} target="_blank" rel="noreferrer" className="p-3 bg-pink-600/20 text-pink-400 rounded-2xl hover:bg-pink-600 hover:text-white transition-all border border-pink-600/30"><InstagramIcon className="w-6 h-6"/></a>
                        <button onClick={onClose} className="p-3 bg-gray-800 text-gray-400 rounded-2xl hover:text-white transition-all"><XIcon className="w-6 h-6"/></button>
                    </div>
                </div>

                {/* TABS SELECTOR */}
                <div className="flex bg-dark/50 p-2 gap-2 border-b border-white/5">
                    <button onClick={() => setActiveTab('tasks')} className={`flex-1 md:flex-none px-8 py-3 text-xs font-black uppercase rounded-2xl transition-all ${activeTab === 'tasks' ? 'bg-primary text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'}`}>
                        <div className="flex items-center justify-center gap-2">
                            <MegaphoneIcon className="w-4 h-4" /> Tarefas ({assignments.length})
                        </div>
                    </button>
                    <button onClick={() => setActiveTab('data')} className={`flex-1 md:flex-none px-8 py-3 text-xs font-black uppercase rounded-2xl transition-all ${activeTab === 'data' ? 'bg-primary text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'}`}>
                        <div className="flex items-center justify-center gap-2">
                            <UserIcon className="w-4 h-4" /> Dados Pessoais
                        </div>
                    </button>
                    <button onClick={() => setActiveTab('stats')} className={`flex-1 md:flex-none px-8 py-3 text-xs font-black uppercase rounded-2xl transition-all ${activeTab === 'stats' ? 'bg-primary text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'}`}>
                        <div className="flex items-center justify-center gap-2">
                            <ChartBarIcon className="w-4 h-4" /> Métricas
                        </div>
                    </button>
                </div>

                {/* CONTENT AREA */}
                <div className="flex-grow overflow-y-auto p-8 custom-scrollbar">
                    
                    {/* TAB: TAREFAS */}
                    {activeTab === 'tasks' && (
                        <div className="space-y-4">
                            {isLoadingTasks ? (
                                <div className="flex justify-center py-20"><RefreshIcon className="w-10 h-10 text-primary animate-spin" /></div>
                            ) : assignments.length === 0 ? (
                                <p className="text-center text-gray-500 font-bold uppercase text-xs py-20">Nenhuma postagem atribuída a esta divulgadora.</p>
                            ) : (
                                assignments.map(a => (
                                    <div key={a.id} className="bg-dark/40 p-6 rounded-3xl border border-white/5 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 group hover:border-primary/30 transition-all">
                                        <div className="flex items-start gap-4 min-w-0 flex-grow">
                                            <div className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0 bg-black border border-gray-800">
                                                <StorageMedia path={a.post?.mediaUrl || ''} type={a.post?.type === 'text' ? 'image' : a.post?.type as any} className="w-full h-full object-cover" />
                                            </div>
                                            <div className="min-w-0">
                                                <h4 className="text-white font-black uppercase text-sm truncate">{a.post?.campaignName || 'Postagem Removida'}</h4>
                                                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1">Designada em {a.createdAt ? (a.createdAt as any).toDate().toLocaleDateString('pt-BR') : 'Data N/A'}</p>
                                                
                                                <div className="flex flex-wrap gap-2 mt-3">
                                                    {a.proofSubmittedAt ? (
                                                        <span className="px-2 py-0.5 rounded-lg bg-green-900/30 text-green-400 border border-green-800 text-[9px] font-black uppercase">Concluído</span>
                                                    ) : a.status === 'confirmed' ? (
                                                        <span className="px-2 py-0.5 rounded-lg bg-blue-900/30 text-blue-400 border border-blue-800 text-[9px] font-black uppercase">Aguardando Print</span>
                                                    ) : (
                                                        <span className="px-2 py-0.5 rounded-lg bg-yellow-900/30 text-yellow-400 border border-yellow-800 text-[9px] font-black uppercase">Pendente</span>
                                                    )}

                                                    {a.justification && (
                                                        <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase border ${a.justificationStatus === 'accepted' ? 'bg-green-900/30 text-green-400 border-green-800' : 'bg-orange-900/30 text-orange-400 border-orange-800 border-orange-500/30 animation-pulse'}`}>
                                                            Justificativa: {a.justificationStatus === 'accepted' ? 'Aceita' : 'Pendente'}
                                                        </span>
                                                    )}
                                                </div>

                                                {a.justification && a.justificationStatus !== 'accepted' && (
                                                    <div className="mt-4 p-4 bg-orange-900/10 rounded-2xl border border-orange-500/20">
                                                        <p className="text-[11px] text-orange-200 italic">"{a.justification}"</p>
                                                        <button onClick={() => handleAcceptJustification(a)} className="mt-3 px-4 py-1.5 bg-orange-600 text-white font-black text-[9px] uppercase rounded-lg hover:bg-orange-500">Aceitar Justificativa</button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        <div className="flex gap-2 w-full md:w-auto">
                                            {a.proofSubmittedAt && a.proofImageUrls && a.proofImageUrls[0] !== 'manual_approval' && (
                                                <button onClick={() => setPhotoViewer({ isOpen: true, urls: a.proofImageUrls!, index: 0 })} className="p-3 bg-gray-800 text-white rounded-xl hover:bg-primary transition-all">
                                                    <CameraIcon className="w-5 h-5"/>
                                                </button>
                                            )}
                                            <div className="flex-grow md:flex-none flex gap-2">
                                                <button onClick={() => handleUpdateTaskStatus(a.id, 'completed_manual')} className="flex-1 px-4 py-2 bg-green-600/20 text-green-400 border border-green-500/30 rounded-xl text-[9px] font-black uppercase hover:bg-green-600 hover:text-white transition-all">Dar Presença</button>
                                                <button onClick={() => handleUpdateTaskStatus(a.id, 'pending')} className="flex-1 px-4 py-2 bg-gray-800 text-gray-400 border border-white/5 rounded-xl text-[9px] font-black uppercase hover:bg-red-900/40 hover:text-red-400 transition-all">Resetar</button>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    )}

                    {/* TAB: DADOS PESSOAIS */}
                    {activeTab === 'data' && (
                        <form onSubmit={handleSavePromoterData} className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
                            <div className="space-y-6">
                                <h3 className="text-xl font-black text-white uppercase tracking-tight flex items-center gap-2">
                                    <UserIcon className="w-5 h-5 text-primary" /> Informações Básicas
                                </h3>
                                
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-gray-500 uppercase ml-1">Nome Completo</label>
                                    <input type="text" value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full bg-dark border border-gray-700 rounded-2xl p-4 text-white font-bold outline-none focus:ring-1 focus:ring-primary" />
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-gray-500 uppercase ml-1">E-mail</label>
                                    <input type="email" value={formData.email || ''} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full bg-dark border border-gray-700 rounded-2xl p-4 text-white font-bold outline-none focus:ring-1 focus:ring-primary" />
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-gray-500 uppercase ml-1">Instagram</label>
                                    <input type="text" value={formData.instagram || ''} onChange={e => setFormData({...formData, instagram: e.target.value})} className="w-full bg-dark border border-gray-700 rounded-2xl p-4 text-white font-bold outline-none focus:ring-1 focus:ring-primary" />
                                </div>
                            </div>

                            <div className="space-y-6">
                                <h3 className="text-xl font-black text-white uppercase tracking-tight flex items-center gap-2">
                                    <CogIcon className="w-5 h-5 text-primary" /> Gestão de Status
                                </h3>

                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-gray-500 uppercase ml-1">Status Global</label>
                                    <select value={formData.status || 'pending'} onChange={e => setFormData({...formData, status: e.target.value as any})} className="w-full bg-dark border border-gray-700 rounded-2xl p-4 text-white font-bold outline-none focus:ring-1 focus:ring-primary">
                                        <option value="approved">Aprovada (Ativa)</option>
                                        <option value="pending">Em Análise (Pendente)</option>
                                        <option value="rejected">Rejeitada (Bloqueada)</option>
                                        <option value="removed">Removida da Equipe</option>
                                    </select>
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-gray-500 uppercase ml-1">Observações Privadas</label>
                                    <textarea value={formData.observation || ''} onChange={e => setFormData({...formData, observation: e.target.value})} rows={4} className="w-full bg-dark border border-gray-700 rounded-2xl p-4 text-white text-sm outline-none focus:ring-1 focus:ring-primary" placeholder="Anotações sobre esta divulgadora..."></textarea>
                                </div>

                                <button type="submit" disabled={isSaving} className="w-full py-5 bg-primary text-white font-black rounded-2xl shadow-xl shadow-primary/20 uppercase text-xs tracking-widest hover:bg-primary-dark transition-all disabled:opacity-50">
                                    {isSaving ? 'Salvando...' : 'Salvar Alterações'}
                                </button>
                            </div>
                        </form>
                    )}

                    {/* TAB: MÉTRICAS */}
                    {activeTab === 'stats' && (
                        <div className="max-w-4xl mx-auto space-y-8">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div className="bg-dark/40 p-6 rounded-[2rem] border border-white/5 text-center">
                                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Total Atribuído</p>
                                    <p className="text-4xl font-black text-white">{stats.total}</p>
                                </div>
                                <div className="bg-dark/40 p-6 rounded-[2rem] border border-white/5 text-center">
                                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Presenças</p>
                                    <p className="text-4xl font-black text-green-400">{stats.completed}</p>
                                </div>
                                <div className="bg-dark/40 p-6 rounded-[2rem] border border-white/5 text-center">
                                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Justificativas</p>
                                    <p className="text-4xl font-black text-orange-400">{stats.justified}</p>
                                </div>
                                <div className="bg-dark/40 p-6 rounded-[2rem] border border-white/5 text-center">
                                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Aproveitamento</p>
                                    <p className={`text-4xl font-black ${stats.rate >= 80 ? 'text-green-400' : stats.rate >= 50 ? 'text-blue-400' : 'text-red-400'}`}>{stats.rate}%</p>
                                </div>
                            </div>

                            <div className="bg-primary/10 border border-primary/20 p-8 rounded-[2.5rem] flex flex-col items-center text-center">
                                <h4 className="text-xl font-black text-white uppercase mb-2">Nível de Engajamento</h4>
                                <div className="w-full max-w-md bg-gray-800 rounded-full h-4 overflow-hidden my-4 shadow-inner">
                                    <div className={`h-full transition-all duration-1000 ${stats.rate >= 80 ? 'bg-green-500' : stats.rate >= 50 ? 'bg-blue-500' : 'bg-red-500'}`} style={{ width: `${stats.rate}%` }}></div>
                                </div>
                                <p className="text-gray-400 text-sm italic font-medium">Esta métrica considera postagens com print enviado e justificativas aceitas pelo administrador.</p>
                            </div>
                        </div>
                    )}

                </div>
                
                {/* FOOTER */}
                <div className="p-8 border-t border-white/5 flex justify-end">
                    <button onClick={onClose} className="px-10 py-4 bg-gray-800 text-gray-400 font-black rounded-2xl hover:text-white uppercase text-[10px] tracking-widest transition-all">Fechar Central</button>
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
