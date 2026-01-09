
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { getAllPromoters, updatePromoter } from '../services/promoterService';
import { getRecoveryTemplates, saveRecoveryTemplate, deleteRecoveryTemplate } from '../services/recoveryService';
import { getAllCampaigns } from '../services/settingsService';
import { Promoter, RecoveryStatus, RecoveryTemplate, Campaign, PromoterStatus } from '../types';
import { 
    ArrowLeftIcon, SearchIcon, WhatsAppIcon, RefreshIcon, FilterIcon, ClockIcon, CheckCircleIcon, XIcon, PencilIcon, TrashIcon, PlusIcon, DocumentDuplicateIcon, UserIcon, MegaphoneIcon
} from '../components/Icons';
import firebase from 'firebase/compat/app';

const PromoterRecoveryPage: React.FC = () => {
    const navigate = useNavigate();
    const { adminData, selectedOrgId } = useAdminAuth();
    
    const [leads, setLeads] = useState<Promoter[]>([]);
    const [templates, setTemplates] = useState<RecoveryTemplate[]>([]);
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    
    // Estados dos Filtros
    const [searchQuery, setSearchQuery] = useState('');
    const [recoveryStatusFilter, setRecoveryStatusFilter] = useState<RecoveryStatus | 'all'>('all');
    const [promoterStatusFilter, setPromoterStatusFilter] = useState<PromoterStatus | 'all'>('all');
    const [campaignFilter, setCampaignFilter] = useState('all');
    const [adminFilter, setAdminFilter] = useState('all');

    const [isManageTemplatesOpen, setIsManageTemplatesOpen] = useState(false);
    const [isSelectTemplateOpen, setIsSelectTemplateOpen] = useState(false);
    const [editingTemplate, setEditingTemplate] = useState<Partial<RecoveryTemplate> | null>(null);
    const [selectedLead, setSelectedLead] = useState<Promoter | null>(null);

    const fetchData = useCallback(async () => {
        if (!selectedOrgId) return;
        setIsLoading(true);
        try {
            const [allPromoters, allTemplates, allCampaigns] = await Promise.all([
                getAllPromoters({ organizationId: selectedOrgId, status: 'all' }),
                getRecoveryTemplates(selectedOrgId),
                getAllCampaigns(selectedOrgId)
            ]);

            setTemplates(allTemplates);
            setCampaigns(allCampaigns);
            setLeads(allPromoters.filter(p => p.status !== 'removed'));
        } catch (e) {
            console.error("Erro ao carregar dados de recuperação:", e);
        } finally {
            setIsLoading(false);
        }
    }, [selectedOrgId]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Lista de admins únicos que já interagiram com leads para o filtro
    const uniqueAdmins = useMemo(() => {
        const admins = leads
            .map(l => l.recoveryAdminEmail)
            .filter((email): email is string => !!email);
        return Array.from(new Set(admins)).sort();
    }, [leads]);

    const filteredLeads = useMemo(() => {
        return leads.filter(p => {
            const pRecoveryStatus = p.recoveryStatus || 'none';
            
            const matchesRecoveryStatus = recoveryStatusFilter === 'all' || pRecoveryStatus === recoveryStatusFilter;
            const matchesPromoterStatus = promoterStatusFilter === 'all' || p.status === promoterStatusFilter;
            const matchesCampaign = campaignFilter === 'all' || p.campaignName === campaignFilter;
            const matchesAdmin = adminFilter === 'all' || p.recoveryAdminEmail === adminFilter;
            
            const matchesSearch = 
                p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                p.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
                p.whatsapp.includes(searchQuery);

            return matchesRecoveryStatus && matchesPromoterStatus && matchesCampaign && matchesAdmin && matchesSearch;
        });
    }, [leads, recoveryStatusFilter, promoterStatusFilter, campaignFilter, adminFilter, searchQuery]);

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
            const msg = `Olá ${firstName}! Vi que você iniciou o cadastro para nossa equipe, mas ainda não concluímos. 👋\n\nPrecisa de ajuda para finalizar ou ficou com alguma dúvida?`;
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

    const getStatusStyle = (status: PromoterStatus) => {
        switch(status) {
            case 'approved': return 'border-green-500 text-green-500 bg-green-500/10';
            case 'pending': return 'border-yellow-500 text-yellow-500 bg-yellow-500/10';
            case 'rejected_editable': return 'border-orange-500 text-orange-500 bg-orange-500/10';
            case 'rejected': return 'border-red-500 text-red-500 bg-red-500/10';
            default: return 'border-gray-500 text-gray-500';
        }
    };

    const getTimeAgo = (ts: any) => {
        const date = (ts && typeof ts.toDate === 'function') ? ts.toDate() : (ts?.seconds ? new Date(ts.seconds * 1000) : new Date(ts));
        if (!date || isNaN(date.getTime())) return '---';
        const diff = Math.floor((new Date().getTime() - date.getTime()) / 60000);
        if (diff < 60) return `há ${diff} min`;
        const hours = Math.floor(diff / 60);
        if (hours < 24) return `há ${hours} h`;
        return `há ${Math.floor(hours/24)} dias`;
    };

    return (
        <div className="pb-40">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4 px-4 md:px-0">
                <div>
                    <h1 className="text-3xl font-black text-white uppercase tracking-tighter flex items-center gap-3">
                        <WhatsAppIcon className="w-8 h-8 text-green-500" /> Recuperação de Equipe
                    </h1>
                    <p className="text-gray-500 text-xs font-black uppercase tracking-widest mt-1">Gestão de contatos e suporte às candidatas</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={() => setIsManageTemplatesOpen(true)} className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-500 flex items-center gap-2 transition-all">
                        <DocumentDuplicateIcon className="w-4 h-4" /> Modelos
                    </button>
                    <button onClick={() => fetchData()} className="p-3 bg-gray-800 text-gray-400 rounded-2xl hover:text-white transition-colors">
                        <RefreshIcon className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`}/>
                    </button>
                    <button onClick={() => navigate('/admin')} className="p-3 bg-gray-800 text-gray-400 rounded-2xl hover:text-white transition-colors">
                        <ArrowLeftIcon className="w-5 h-5" />
                    </button>
                </div>
            </div>

            <div className="bg-secondary/60 backdrop-blur-xl rounded-[2.5rem] p-6 border border-white/5 shadow-2xl space-y-6 mb-8">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
                    <div className="lg:col-span-2 relative">
                        <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                        <input 
                            type="text" placeholder="BUSCAR POR NOME OU WHATSAPP..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                            className="w-full pl-11 pr-4 py-3 bg-dark border border-gray-700 rounded-2xl text-white text-[10px] font-black uppercase outline-none focus:border-primary transition-all"
                        />
                    </div>
                    
                    <select value={campaignFilter} onChange={e => setCampaignFilter(e.target.value)} className="bg-dark border border-gray-700 text-white px-4 py-3 rounded-2xl text-[10px] font-black uppercase outline-none focus:border-primary cursor-pointer">
                        <option value="all">EVENTO (TODOS)</option>
                        {campaigns.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                    </select>

                    <select value={promoterStatusFilter} onChange={e => setPromoterStatusFilter(e.target.value as any)} className="bg-dark border border-gray-700 text-white px-4 py-3 rounded-2xl text-[10px] font-black uppercase outline-none focus:border-primary cursor-pointer">
                        <option value="all">STATUS PERFIL (TODOS)</option>
                        <option value="pending">⏳ PENDENTES</option>
                        <option value="rejected_editable">⚠️ REVISAR</option>
                        <option value="approved">✅ APROVADOS</option>
                        <option value="rejected">❌ REPROVADOS</option>
                    </select>

                    <select value={adminFilter} onChange={e => setAdminFilter(e.target.value)} className="bg-dark border border-gray-700 text-white px-4 py-3 rounded-2xl text-[10px] font-black uppercase outline-none focus:border-primary cursor-pointer">
                        <option value="all">ADMIN (TODOS)</option>
                        {uniqueAdmins.map(admin => <option key={admin} value={admin}>{admin.split('@')[0].toUpperCase()}</option>)}
                    </select>
                </div>

                <div className="flex items-center gap-4 px-2 border-t border-white/5 pt-4">
                    <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-2">
                        <FilterIcon className="w-3 h-3"/> Filtrar abordagem:
                    </p>
                    <div className="flex gap-2">
                        {(['all', 'none', 'contacted', 'purchased'] as const).map(s => (
                            <button 
                                key={s} 
                                onClick={() => setRecoveryStatusFilter(s)}
                                className={`px-3 py-1.5 rounded-full text-[8px] font-black uppercase tracking-tighter transition-all border ${recoveryStatusFilter === s ? 'bg-primary border-primary text-white shadow-lg shadow-primary/20' : 'bg-transparent border-gray-800 text-gray-600 hover:text-gray-400'}`}
                            >
                                {s === 'all' ? 'Tudo' : s === 'none' ? 'Novos' : s === 'contacted' ? 'Abordados' : 'Concluídos'}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <div className="bg-secondary/60 backdrop-blur-xl rounded-[2.5rem] p-4 border border-white/5 shadow-2xl overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-separate border-spacing-0">
                        <thead>
                            <tr className="bg-dark/50 text-[10px] font-black text-gray-500 uppercase tracking-widest">
                                <th className="px-4 py-5 border-b border-white/5 w-[35%] md:w-[30%]">Candidata / Perfil</th>
                                <th className="px-4 py-5 border-b border-white/5 w-[20%] md:w-[25%] hidden sm:table-cell">Evento</th>
                                <th className="px-4 py-5 border-b border-white/5 w-[15%] text-center">Abandono</th>
                                <th className="px-4 py-5 border-b border-white/5 w-[15%] text-center hidden md:table-cell">Admin</th>
                                <th className="px-4 py-4 border-b border-white/5 w-px whitespace-nowrap text-right">Abordagem</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {isLoading ? (
                                <tr><td colSpan={5} className="text-center py-20 text-gray-500 font-black uppercase text-xs animate-pulse">Carregando lista de recuperação...</td></tr>
                            ) : filteredLeads.length === 0 ? (
                                <tr><td colSpan={5} className="text-center py-20 text-gray-500 font-black uppercase text-xs">Nenhuma candidata encontrada com esses filtros</td></tr>
                            ) : filteredLeads.map(p => (
                                <tr key={p.id} className="hover:bg-white/[0.02] transition-colors group">
                                    <td className="px-4 py-5">
                                        <div className="flex items-center gap-3">
                                            <div className="w-9 h-9 rounded-lg overflow-hidden bg-gray-800 border border-gray-700 flex-shrink-0">
                                                {p.facePhotoUrl ? <img src={p.facePhotoUrl} className="w-full h-full object-cover" alt=""/> : <UserIcon className="w-full h-full p-2 text-gray-600"/>}
                                            </div>
                                            <div className="min-w-0 max-w-[120px] md:max-w-none">
                                                <p className="text-xs font-black text-white uppercase truncate">{p.name}</p>
                                                <div className="flex flex-wrap items-center gap-2 mt-1">
                                                    <span className={`text-[6px] font-black uppercase px-1.5 py-0.5 rounded-full border ${getStatusStyle(p.status)}`}>
                                                        {p.status === 'approved' ? 'OK' : p.status === 'pending' ? 'PEND' : p.status === 'rejected_editable' ? 'REV' : 'REP'}
                                                    </span>
                                                    <p className="text-[9px] text-primary font-bold">{p.whatsapp}</p>
                                                </div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-4 py-5 hidden sm:table-cell">
                                        <p className="text-[10px] text-white font-bold uppercase truncate max-w-[120px]">{p.campaignName || 'Inscrição Direta'}</p>
                                        <p className="text-[8px] text-gray-500 font-black uppercase mt-0.5">{p.state}</p>
                                    </td>
                                    <td className="px-4 py-5 text-center">
                                        <div className="flex flex-col items-center gap-1">
                                            <div className="flex items-center gap-1 text-gray-500 text-[9px] font-black uppercase">
                                                <ClockIcon className="w-3 h-3" /> {getTimeAgo(p.createdAt)}
                                            </div>
                                            <div className="flex justify-center gap-1 mt-1">
                                                <button onClick={() => handleUpdateStatus(p.id, 'none')} className={`px-1.5 py-0.5 rounded text-[7px] font-black uppercase border transition-all ${p.recoveryStatus === 'none' || !p.recoveryStatus ? 'bg-gray-700 text-white border-gray-600' : 'bg-transparent text-gray-600 border-gray-800'}`}>Novo</button>
                                                <button onClick={() => handleUpdateStatus(p.id, 'contacted')} className={`px-1.5 py-0.5 rounded text-[7px] font-black uppercase border transition-all ${p.recoveryStatus === 'contacted' ? 'bg-blue-600 text-white border-blue-500 shadow-lg' : 'bg-transparent text-gray-600 border-gray-800'}`}>Falei</button>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-4 py-5 text-center hidden md:table-cell">
                                        {p.recoveryAdminEmail ? (
                                            <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest bg-dark px-2 py-1 rounded-full">{p.recoveryAdminEmail.split('@')[0]}</span>
                                        ) : (
                                            <span className="text-[8px] text-gray-600 font-black uppercase">-</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-5 text-right whitespace-nowrap">
                                        <button onClick={() => handleStartRecovery(p)} className="inline-flex items-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-xl text-[10px] font-black uppercase hover:bg-green-500 shadow-lg transition-all transform active:scale-95">
                                            <WhatsAppIcon className="w-3.5 h-3.5" /> <span className="hidden sm:inline">CONTATAR</span>
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
                        <div className="flex-grow overflow-y-auto space-y-4 pr-2 custom-scrollbar">
                            {editingTemplate ? (
                                <div className="space-y-4 animate-fadeIn">
                                    <input type="text" placeholder="Título do Modelo (ex: Recuperação de Foto)" value={editingTemplate.title || ''} onChange={e => setEditingTemplate({...editingTemplate, title: e.target.value})} className="w-full bg-dark border border-gray-700 rounded-2xl p-4 text-white font-bold outline-none focus:border-primary" />
                                    <textarea rows={6} placeholder="Mensagem... Use {{nome}} e {{evento}}" value={editingTemplate.text || ''} onChange={e => setEditingTemplate({...editingTemplate, text: e.target.value})} className="w-full bg-dark border border-gray-700 rounded-2xl p-4 text-white text-sm outline-none focus:border-primary" />
                                    <div className="flex gap-2">
                                        <button onClick={handleSaveTemplate} className="flex-1 py-4 bg-primary text-white font-black rounded-xl uppercase text-xs">Salvar Modelo</button>
                                        <button onClick={() => setEditingTemplate(null)} className="px-6 py-4 bg-gray-700 text-white font-black rounded-xl uppercase text-xs">Cancelar</button>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <button onClick={() => setEditingTemplate({})} className="w-full py-5 border-2 border-dashed border-gray-700 rounded-3xl text-gray-500 font-black uppercase text-xs hover:border-primary hover:text-primary transition-all flex items-center justify-center gap-2">
                                        <PlusIcon className="w-4 h-4" /> Novo Modelo de Recuperação
                                    </button>
                                    {templates.map(t => (
                                        <div key={t.id} className="bg-dark/40 p-5 rounded-2xl border border-white/5 flex justify-between items-start group hover:border-white/10 transition-all">
                                            <div className="min-w-0">
                                                <h3 className="text-white font-black uppercase text-[10px] mb-1">{t.title}</h3>
                                                <p className="text-gray-500 text-xs line-clamp-2 italic">"{t.text}"</p>
                                            </div>
                                            <div className="flex gap-1 ml-2">
                                                <button onClick={() => setEditingTemplate(t)} className="p-2 text-gray-500 hover:text-white transition-colors"><PencilIcon className="w-4 h-4"/></button>
                                                <button onClick={() => deleteRecoveryTemplate(t.id).then(fetchData)} className="p-2 text-gray-500 hover:text-red-500 transition-colors"><TrashIcon className="w-4 h-4"/></button>
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
                    <div className="bg-secondary w-full max-w-lg p-8 rounded-[2.5rem] border border-white/10 shadow-2xl" onClick={e => e.stopPropagation()}>
                        <h2 className="text-xl font-black text-white uppercase mb-2">Escolha a Abordagem</h2>
                        <p className="text-[10px] text-gray-500 font-black uppercase mb-6 tracking-widest">Candidata: {selectedLead.name.split(' ')[0]}</p>
                        <div className="space-y-3">
                            {templates.map(t => (
                                <button key={t.id} onClick={() => handleSendTemplate(t)} className="w-full bg-dark/60 p-5 rounded-2xl border border-white/5 hover:border-green-500/50 transition-all text-left group">
                                    <p className="text-white font-black uppercase text-[10px] group-hover:text-green-400 transition-colors">{t.title}</p>
                                    <p className="text-gray-500 text-[11px] truncate mt-1 italic">{t.text.substring(0, 80)}...</p>
                                </button>
                            ))}
                            {templates.length === 0 && (
                                <p className="text-center py-10 text-gray-600 font-bold uppercase text-xs">Nenhum modelo cadastrado.</p>
                            )}
                        </div>
                        <button onClick={() => setIsSelectTemplateOpen(false)} className="w-full mt-6 py-4 bg-gray-800 text-gray-400 font-black rounded-2xl uppercase text-[10px] tracking-widest hover:text-white transition-all">Fechar</button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PromoterRecoveryPage;
