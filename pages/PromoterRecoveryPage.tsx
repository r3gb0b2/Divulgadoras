
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { getAllPromoters, updatePromoter } from '../services/promoterService';
import { getRecoveryTemplates, saveRecoveryTemplate, deleteRecoveryTemplate } from '../services/recoveryService';
import { Promoter, RecoveryStatus, RecoveryTemplate } from '../types';
import { 
    ArrowLeftIcon, SearchIcon, WhatsAppIcon, RefreshIcon, FilterIcon, ClockIcon, CheckCircleIcon, XIcon, PencilIcon, TrashIcon, PlusIcon, DocumentDuplicateIcon
} from '../components/Icons';
import firebase from 'firebase/compat/app';

const PromoterRecoveryPage: React.FC = () => {
    const navigate = useNavigate();
    const { adminData, selectedOrgId } = useAdminAuth();
    
    const [leads, setLeads] = useState<Promoter[]>([]);
    const [templates, setTemplates] = useState<RecoveryTemplate[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<RecoveryStatus | 'all'>('all');

    const [isManageTemplatesOpen, setIsManageTemplatesOpen] = useState(false);
    const [isSelectTemplateOpen, setIsSelectTemplateOpen] = useState(false);
    const [editingTemplate, setEditingTemplate] = useState<Partial<RecoveryTemplate> | null>(null);
    const [selectedLead, setSelectedLead] = useState<Promoter | null>(null);

    const fetchData = useCallback(async () => {
        if (!selectedOrgId) return;
        setIsLoading(true);
        try {
            const [allPromoters, allTemplates] = await Promise.all([
                getAllPromoters({ organizationId: selectedOrgId, status: 'all' }),
                getRecoveryTemplates(selectedOrgId)
            ]);

            setTemplates(allTemplates);
            // Filtra por quem está pendente ou precisa de ajuste (rejected_editable)
            const pendings = allPromoters.filter(p => p.status === 'pending' || (p.status as string) === 'rejected_editable');
            setLeads(pendings);
        } catch (e) {
            console.error("Erro ao carregar leads:", e);
        } finally {
            setIsLoading(false);
        }
    }, [selectedOrgId]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const filteredLeads = useMemo(() => {
        return leads.filter(p => {
            const pRecoveryStatus = p.recoveryStatus || 'none';
            const matchesStatus = statusFilter === 'all' || pRecoveryStatus === statusFilter;
            const matchesSearch = 
                p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                p.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
                p.whatsapp.includes(searchQuery);

            return matchesStatus && matchesSearch;
        });
    }, [leads, statusFilter, searchQuery]);

    const handleUpdateStatus = async (id: string, status: RecoveryStatus) => {
        try {
            await updatePromoter(id, {
                recoveryStatus: status,
                recoveryAdminEmail: adminData?.email,
                recoveryUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            setLeads(prev => prev.map(p => 
                p.id === id ? { ...p, recoveryStatus: status, recoveryAdminEmail: adminData?.email } : p
            ));
        } catch (e) {
            alert("Erro ao atualizar status.");
        }
    };

    const handleStartRecovery = (lead: Promoter) => {
        setSelectedLead(lead);
        if (templates.length === 0) {
            const firstName = lead.name.split(' ')[0];
            const msg = `Olá ${firstName}! Vi que você iniciou o cadastro para nossa equipe de divulgação, mas ainda não concluímos o processo. 👋\n\nPrecisa de alguma ajuda para finalizar suas fotos ou ficou com alguma dúvida sobre como funciona?`;
            handleUpdateStatus(lead.id, 'contacted');
            window.open(`https://wa.me/55${lead.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`, '_blank');
        } else {
            setIsSelectTemplateOpen(true);
        }
    };

    const handleSendTemplate = (template: RecoveryTemplate) => {
        if (!selectedLead) return;
        const firstName = selectedLead.name.split(' ')[0];
        const msg = template.text
            .replace(/{{nome}}/g, firstName)
            .replace(/{{evento}}/g, selectedLead.campaignName || 'evento');

        handleUpdateStatus(selectedLead.id, 'contacted');
        window.open(`https://wa.me/55${selectedLead.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`, '_blank');
        setIsSelectTemplateOpen(false);
    };

    const handleSaveTemplate = async () => {
        if (!editingTemplate?.title || !editingTemplate?.text || !selectedOrgId) return;
        try {
            await saveRecoveryTemplate(selectedOrgId, editingTemplate);
            setEditingTemplate(null);
            fetchData();
        } catch (e) { alert("Erro ao salvar."); }
    };

    return (
        <div className="pb-40">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4 px-4 md:px-0">
                <div>
                    <h1 className="text-3xl font-black text-white uppercase tracking-tighter flex items-center gap-3">
                        <WhatsAppIcon className="w-8 h-8 text-green-500" /> Recuperação de Equipe
                    </h1>
                    <p className="text-gray-500 text-xs font-black uppercase tracking-widest mt-1">Contato direto com candidatas pendentes</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={() => setIsManageTemplatesOpen(true)} className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-500 flex items-center gap-2">
                        <DocumentDuplicateIcon className="w-4 h-4" /> Modelos
                    </button>
                    <button onClick={() => fetchData()} className="p-3 bg-gray-800 text-gray-400 rounded-2xl hover:text-white transition-colors">
                        <RefreshIcon className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`}/>
                    </button>
                    <button onClick={() => navigate('/admin')} className="flex items-center gap-2 px-4 py-2 bg-gray-700 text-white rounded-xl text-xs font-black uppercase tracking-widest">
                        <ArrowLeftIcon className="w-4 h-4" /> Voltar
                    </button>
                </div>
            </div>

            <div className="bg-secondary/60 backdrop-blur-xl rounded-[2.5rem] p-6 border border-white/5 shadow-2xl space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    <div className="lg:col-span-2 relative">
                        <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                        <input 
                            type="text" placeholder="BUSCAR POR NOME OU WHATSAPP..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                            className="w-full pl-11 pr-4 py-3 bg-dark border border-gray-700 rounded-2xl text-white text-[10px] font-black uppercase outline-none focus:border-primary"
                        />
                    </div>
                    <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)} className="bg-dark border border-gray-700 text-white px-4 py-3 rounded-2xl text-[10px] font-black uppercase outline-none focus:border-primary">
                        <option value="all">STATUS (TODOS)</option>
                        <option value="none">🆕 NÃO ABORDADO</option>
                        <option value="contacted">💬 ABORDADO</option>
                        <option value="purchased">✅ CONCLUÍDO</option>
                    </select>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-dark/50 text-[10px] font-black text-gray-500 uppercase tracking-widest border-b border-white/5">
                                <th className="px-6 py-5">Candidata</th>
                                <th className="px-6 py-5">Inscrição</th>
                                <th className="px-6 py-5 text-center">Recuperação</th>
                                <th className="px-6 py-4 text-right">Ação</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {isLoading ? (
                                <tr><td colSpan={4} className="text-center py-20 text-gray-500 font-black uppercase text-xs">Carregando leads...</td></tr>
                            ) : filteredLeads.length === 0 ? (
                                <tr><td colSpan={4} className="text-center py-20 text-gray-500 font-black uppercase text-xs">Nenhum lead pendente</td></tr>
                            ) : filteredLeads.map(p => (
                                <tr key={p.id} className="hover:bg-white/[0.02] transition-colors group">
                                    <td className="px-6 py-5">
                                        <p className="text-sm font-black text-white uppercase truncate">{p.name}</p>
                                        <p className="text-[10px] text-primary font-bold">{p.whatsapp}</p>
                                    </td>
                                    <td className="px-6 py-5">
                                        <p className="text-xs text-white font-bold uppercase">{p.campaignName}</p>
                                        <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-full border ${p.status === 'pending' ? 'border-yellow-500 text-yellow-500' : 'border-orange-500 text-orange-500'}`}>
                                            {p.status === 'pending' ? 'Pendente' : 'Revisar'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-5 text-center">
                                        <div className="flex justify-center gap-1">
                                            <button onClick={() => handleUpdateStatus(p.id, 'none')} className={`px-2 py-0.5 rounded text-[8px] font-black uppercase border ${p.recoveryStatus === 'none' ? 'bg-gray-700 text-white' : 'bg-transparent text-gray-600 border-gray-800'}`}>Novo</button>
                                            <button onClick={() => handleUpdateStatus(p.id, 'contacted')} className={`px-2 py-0.5 rounded text-[8px] font-black uppercase border ${p.recoveryStatus === 'contacted' ? 'bg-blue-600 text-white' : 'bg-transparent text-gray-600 border-gray-800'}`}>Abordado</button>
                                            <button onClick={() => handleUpdateStatus(p.id, 'no_response')} className={`px-2 py-0.5 rounded text-[8px] font-black uppercase border ${p.recoveryStatus === 'no_response' ? 'bg-red-600 text-white' : 'bg-transparent text-gray-600 border-gray-800'}`}>Sem Resposta</button>
                                        </div>
                                    </td>
                                    <td className="px-6 py-5 text-right">
                                        <button onClick={() => handleStartRecovery(p)} className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-xl text-[9px] font-black uppercase hover:bg-green-500 shadow-lg shadow-green-900/20 transition-all">
                                            <WhatsAppIcon className="w-4 h-4" /> CONTATAR
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal Gerenciar Modelos */}
            {isManageTemplatesOpen && (
                <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[110] flex items-center justify-center p-6" onClick={() => setIsManageTemplatesOpen(false)}>
                    <div className="bg-secondary w-full max-w-2xl p-8 rounded-[2.5rem] border border-white/10 flex flex-col max-h-[85vh]" onClick={e => e.stopPropagation()}>
                        <h2 className="text-2xl font-black text-white uppercase mb-6 tracking-tighter">Modelos de Abordagem</h2>
                        <div className="flex-grow overflow-y-auto space-y-4 pr-2">
                            {editingTemplate ? (
                                <div className="space-y-4 animate-fadeIn">
                                    <input type="text" placeholder="Título" value={editingTemplate.title || ''} onChange={e => setEditingTemplate({...editingTemplate, title: e.target.value})} className="w-full bg-dark border border-gray-700 rounded-xl p-3 text-white font-bold" />
                                    <textarea rows={6} placeholder="Mensagem... Use {{nome}} e {{evento}}" value={editingTemplate.text || ''} onChange={e => setEditingTemplate({...editingTemplate, text: e.target.value})} className="w-full bg-dark border border-gray-700 rounded-xl p-3 text-white text-sm" />
                                    <div className="flex gap-2">
                                        <button onClick={handleSaveTemplate} className="flex-1 py-3 bg-primary text-white font-black rounded-xl uppercase text-xs">Salvar</button>
                                        <button onClick={() => setEditingTemplate(null)} className="px-6 py-3 bg-gray-700 text-white font-black rounded-xl uppercase text-xs">Cancelar</button>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <button onClick={() => setEditingTemplate({})} className="w-full py-4 border-2 border-dashed border-gray-700 rounded-2xl text-gray-500 font-black uppercase text-xs hover:border-primary transition-all flex items-center justify-center gap-2">
                                        <PlusIcon className="w-4 h-4" /> Novo Modelo
                                    </button>
                                    {templates.map(t => (
                                        <div key={t.id} className="bg-dark/40 p-4 rounded-xl border border-white/5 flex justify-between items-start">
                                            <div className="min-w-0">
                                                <h3 className="text-white font-black uppercase text-[10px] mb-1">{t.title}</h3>
                                                <p className="text-gray-500 text-xs line-clamp-2 italic">"{t.text}"</p>
                                            </div>
                                            <div className="flex gap-1 ml-2">
                                                <button onClick={() => setEditingTemplate(t)} className="p-1.5 text-gray-500 hover:text-white"><PencilIcon className="w-4 h-4"/></button>
                                                <button onClick={() => deleteRecoveryTemplate(t.id).then(fetchData)} className="p-1.5 text-gray-500 hover:text-red-500"><TrashIcon className="w-4 h-4"/></button>
                                            </div>
                                        </div>
                                    ))}
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Selecionar Modelo */}
            {isSelectTemplateOpen && selectedLead && (
                <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[110] flex items-center justify-center p-6" onClick={() => setIsSelectTemplateOpen(false)}>
                    <div className="bg-secondary w-full max-w-lg p-8 rounded-[2.5rem] border border-white/10" onClick={e => e.stopPropagation()}>
                        <h2 className="text-xl font-black text-white uppercase mb-6">Escolha o Modelo</h2>
                        <div className="space-y-3">
                            {templates.map(t => (
                                <button key={t.id} onClick={() => handleSendTemplate(t)} className="w-full bg-dark/60 p-4 rounded-xl border border-white/5 hover:border-green-500 transition-all text-left">
                                    <p className="text-white font-black uppercase text-[10px]">{t.title}</p>
                                    <p className="text-gray-500 text-xs truncate mt-1">{t.text}</p>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PromoterRecoveryPage;
