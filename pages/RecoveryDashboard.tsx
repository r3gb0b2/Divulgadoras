
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { getAllPromoters, updatePromoter } from '../services/promoterService';
import { getOrganizations } from '../services/organizationService';
import { getAllCampaigns } from '../services/settingsService';
import { getRecoveryTemplates, saveRecoveryTemplate, deleteRecoveryTemplate } from '../services/recoveryService';
import { Promoter, RecoveryStatus, Organization, Campaign, RecoveryTemplate } from '../types';
import { 
    ArrowLeftIcon, SearchIcon, WhatsAppIcon, InstagramIcon, 
    RefreshIcon, FilterIcon, ClockIcon, CheckCircleIcon, XIcon, UserIcon, PencilIcon, TrashIcon, PlusIcon, DocumentDuplicateIcon 
} from '../components/Icons';
import firebase from 'firebase/compat/app';

const RecoveryDashboard: React.FC = () => {
    const navigate = useNavigate();
    const { adminData, selectedOrgId } = useAdminAuth();
    
    const [leads, setLeads] = useState<Promoter[]>([]);
    const [organizations, setOrganizations] = useState<Record<string, string>>({});
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [templates, setTemplates] = useState<RecoveryTemplate[]>([]);
    
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<RecoveryStatus | 'all'>('none');
    const [ownerFilter, setOwnerFilter] = useState<'all' | 'me' | 'none'>('all');
    const [campaignFilter, setCampaignFilter] = useState('all');

    // Modais
    const [isManageTemplatesOpen, setIsManageTemplatesOpen] = useState(false);
    const [isSelectTemplateOpen, setIsSelectTemplateOpen] = useState(false);
    const [editingTemplate, setEditingTemplate] = useState<Partial<RecoveryTemplate> | null>(null);
    const [selectedLead, setSelectedLead] = useState<Promoter | null>(null);

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        try {
            const orgIdToFetch = adminData?.role === 'superadmin' ? 'all' : selectedOrgId;
            if (!orgIdToFetch) return;

            const [orgs, allCamps, allPromoters, allTemplates] = await Promise.all([
                getOrganizations(),
                getAllCampaigns(orgIdToFetch === 'all' ? undefined : orgIdToFetch),
                getAllPromoters({
                    organizationId: orgIdToFetch,
                    filterOrgId: orgIdToFetch,
                    status: 'all'
                }),
                getRecoveryTemplates(selectedOrgId || 'global')
            ]);

            const orgMap = orgs.reduce((acc, o) => ({ ...acc, [o.id]: o.name }), {} as Record<string, string>);
            setOrganizations(orgMap);
            setCampaigns(allCamps.sort((a, b) => a.name.localeCompare(b.name)));
            setTemplates(allTemplates);

            const rejected = allPromoters.filter(p => p.status === 'rejected' || (p.status as string) === 'rejected_editable');
            setLeads(rejected);

        } catch (e) {
            console.error("Erro ao carregar leads:", e);
        } finally {
            setIsLoading(false);
        }
    }, [adminData, selectedOrgId]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const filteredLeads = useMemo(() => {
        return leads.filter(p => {
            const matchesStatus = statusFilter === 'all' || (p.recoveryStatus || 'none') === statusFilter;
            const matchesCampaign = campaignFilter === 'all' || p.campaignName === campaignFilter;
            const matchesSearch = 
                p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                p.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
                p.whatsapp.includes(searchQuery);
            
            const matchesOwner = 
                ownerFilter === 'all' || 
                (ownerFilter === 'me' && p.recoveryAdminEmail === adminData?.email) ||
                (ownerFilter === 'none' && !p.recoveryAdminEmail);

            return matchesStatus && matchesSearch && matchesOwner && matchesCampaign;
        });
    }, [leads, statusFilter, campaignFilter, searchQuery, ownerFilter, adminData]);

    const handleUpdateStatus = async (promoterId: string, status: RecoveryStatus) => {
        try {
            await updatePromoter(promoterId, {
                recoveryStatus: status,
                recoveryAdminEmail: adminData?.email,
                recoveryUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            setLeads(prev => prev.map(p => 
                p.id === promoterId ? { 
                    ...p, 
                    recoveryStatus: status, 
                    recoveryAdminEmail: adminData?.email 
                } : p
            ));
        } catch (e) {
            alert("Erro ao atualizar status.");
        }
    };

    const handleStartRecovery = (lead: Promoter) => {
        setSelectedLead(lead);
        if (templates.length === 0) {
            // Se não houver modelos, usa o padrão antigo
            const firstName = lead.name.split(' ')[0];
            const adminName = adminData?.email.split('@')[0];
            const msg = `Olá ${firstName}! Sou o ${adminName} da equipe de gestão. 👋\n\nVi que seu perfil não pôde ser aprovado para a equipe do evento ${lead.campaignName} no momento, mas não queremos que você fique de fora! 🚀\n\nLiberei uma cortesia VIP exclusiva pra você no nosso Clube. Você ganha benefícios e o seu ingresso sai por um valor promocional. Tem interesse em saber como funciona?`;
            
            if (!lead.recoveryAdminEmail) handleUpdateStatus(lead.id, 'contacted');
            window.open(`https://wa.me/55${lead.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`, '_blank');
        } else {
            setIsSelectTemplateOpen(true);
        }
    };

    const handleSendTemplate = (template: RecoveryTemplate) => {
        if (!selectedLead) return;
        
        const firstName = selectedLead.name.split(' ')[0];
        const adminName = adminData?.email.split('@')[0] || 'Gestor';
        
        const msg = template.text
            .replace(/{{nome}}/g, firstName)
            .replace(/{{admin}}/g, adminName)
            .replace(/{{evento}}/g, selectedLead.campaignName || 'evento');

        if (!selectedLead.recoveryAdminEmail) handleUpdateStatus(selectedLead.id, 'contacted');
        
        window.open(`https://wa.me/55${selectedLead.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`, '_blank');
        setIsSelectTemplateOpen(false);
    };

    const handleSaveTemplateAction = async () => {
        if (!editingTemplate?.title || !editingTemplate?.text || !selectedOrgId) return;
        try {
            await saveRecoveryTemplate(selectedOrgId, editingTemplate);
            setEditingTemplate(null);
            const allTemplates = await getRecoveryTemplates(selectedOrgId);
            setTemplates(allTemplates);
        } catch (e) { alert("Erro ao salvar."); }
    };

    const handleDeleteTemplateAction = async (id: string) => {
        if (!window.confirm("Excluir este modelo?")) return;
        try {
            await deleteRecoveryTemplate(id);
            setTemplates(prev => prev.filter(t => t.id !== id));
        } catch (e) { alert("Erro ao excluir."); }
    };

    return (
        <div className="pb-40">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4 px-4 md:px-0">
                <div>
                    <h1 className="text-3xl font-black text-white uppercase tracking-tighter flex items-center gap-3">
                        <WhatsAppIcon className="w-8 h-8 text-green-500" /> Recuperação de Vendas
                    </h1>
                    <p className="text-gray-500 text-xs font-black uppercase tracking-widest mt-1">Transforme rejeições em conversões</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={() => setIsManageTemplatesOpen(true)} className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-500 transition-all flex items-center gap-2">
                        <DocumentDuplicateIcon className="w-4 h-4" /> Modelos de Resposta
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
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
                    <div className="lg:col-span-2 relative">
                        <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                        <input 
                            type="text" placeholder="BUSCAR POR NOME OU WHATSAPP..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                            className="w-full pl-11 pr-4 py-3 bg-dark border border-gray-700 rounded-2xl text-white text-[10px] font-black uppercase outline-none focus:border-primary"
                        />
                    </div>
                    <select value={campaignFilter} onChange={e => setCampaignFilter(e.target.value)} className="bg-dark border border-gray-700 text-white px-4 py-3 rounded-2xl text-[10px] font-black uppercase outline-none focus:border-primary">
                        <option value="all">EVENTO (TODOS)</option>
                        {campaigns.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                    </select>
                    <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)} className="bg-dark border border-gray-700 text-white px-4 py-3 rounded-2xl text-[10px] font-black uppercase outline-none focus:border-primary">
                        <option value="all">STATUS (TODOS)</option>
                        <option value="none">🆕 NÃO CONTATADO</option>
                        <option value="contacted">💬 EM ABERTO</option>
                        <option value="purchased">✅ VENDA FECHADA</option>
                        <option value="no_response">⌛ SEM RETORNO</option>
                    </select>
                    <select value={ownerFilter} onChange={e => setOwnerFilter(e.target.value as any)} className="bg-dark border border-gray-700 text-white px-4 py-3 rounded-2xl text-[10px] font-black uppercase outline-none focus:border-primary">
                        <option value="all">RESPONSÁVEL (TODOS)</option>
                        <option value="me">SÓ MEUS LEADS</option>
                        <option value="none">LEADS LIVRES</option>
                    </select>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-dark/50 text-[10px] font-black text-gray-500 uppercase tracking-widest border-b border-white/5">
                                <th className="px-6 py-5">Potencial Cliente</th>
                                <th className="px-6 py-5">Origem (Evento)</th>
                                <th className="px-6 py-5 text-center">Status Funil</th>
                                <th className="px-6 py-5 text-center">Responsável</th>
                                <th className="px-6 py-4 text-right">Ação</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {isLoading ? (
                                <tr><td colSpan={5} className="text-center py-20 text-gray-500 font-black uppercase text-xs animate-pulse tracking-widest">Carregando oportunidades...</td></tr>
                            ) : filteredLeads.length === 0 ? (
                                <tr><td colSpan={5} className="text-center py-20 text-gray-500 font-black uppercase text-xs tracking-widest">Nenhum lead encontrado</td></tr>
                            ) : filteredLeads.map(p => (
                                <tr key={p.id} className="hover:bg-white/[0.02] transition-colors group">
                                    <td className="px-6 py-5">
                                        <p className="text-sm font-black text-white uppercase truncate">{p.name}</p>
                                        <div className="flex items-center gap-3 mt-1.5">
                                            <a href={`https://instagram.com/${p.instagram}`} target="_blank" rel="noreferrer" className="text-pink-500 hover:text-pink-400 transition-colors flex items-center gap-1">
                                                <InstagramIcon className="w-3.5 h-3.5" />
                                                <span className="text-[9px] font-bold">@{p.instagram}</span>
                                            </a>
                                            <p className="text-[9px] text-gray-500 font-mono">{p.whatsapp}</p>
                                        </div>
                                    </td>
                                    <td className="px-6 py-5">
                                        <p className="text-xs text-red-400 font-bold uppercase">{p.campaignName}</p>
                                        <p className="text-[9px] text-gray-600 font-black uppercase">{organizations[p.organizationId]}</p>
                                    </td>
                                    <td className="px-6 py-5 text-center">
                                        <div className="flex flex-wrap justify-center gap-1">
                                            <button onClick={() => handleUpdateStatus(p.id, 'none')} className={`px-2 py-0.5 rounded text-[8px] font-black uppercase border ${(!p.recoveryStatus || p.recoveryStatus === 'none') ? 'bg-gray-700 text-white' : 'bg-transparent text-gray-600 border-gray-800'}`}>Novo</button>
                                            <button onClick={() => handleUpdateStatus(p.id, 'contacted')} className={`px-2 py-0.5 rounded text-[8px] font-black uppercase border ${p.recoveryStatus === 'contacted' ? 'bg-blue-600 text-white' : 'bg-transparent text-gray-600 border-gray-800'}`}>Aberto</button>
                                            <button onClick={() => handleUpdateStatus(p.id, 'no_response')} className={`px-2 py-0.5 rounded text-[8px] font-black uppercase border ${p.recoveryStatus === 'no_response' ? 'bg-orange-600 text-white' : 'bg-transparent text-gray-600 border-gray-800'}`}>Vácuo</button>
                                            <button onClick={() => handleUpdateStatus(p.id, 'purchased')} className={`px-2 py-0.5 rounded text-[8px] font-black uppercase border ${p.recoveryStatus === 'purchased' ? 'bg-green-600 text-white' : 'bg-transparent text-gray-600 border-gray-800'}`}>VENDA</button>
                                        </div>
                                    </td>
                                    <td className="px-6 py-5 text-center">
                                        {p.recoveryAdminEmail ? (
                                            <p className="text-[9px] text-primary font-black uppercase truncate max-w-[80px] mx-auto">{p.recoveryAdminEmail.split('@')[0]}</p>
                                        ) : (
                                            <span className="text-gray-700 text-[9px] font-bold uppercase">Livre</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-5 text-right">
                                        <button 
                                            onClick={() => handleStartRecovery(p)}
                                            className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-xl text-[9px] font-black uppercase hover:bg-green-500 shadow-lg shadow-green-900/20 active:scale-95 transition-all"
                                        >
                                            <WhatsAppIcon className="w-4 h-4" /> INICIAR
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal: Gerenciar Modelos */}
            {isManageTemplatesOpen && (
                <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[110] flex items-center justify-center p-6" onClick={() => setIsManageTemplatesOpen(false)}>
                    <div className="bg-secondary w-full max-w-2xl p-8 rounded-[2.5rem] border border-white/10 shadow-2xl flex flex-col max-h-[85vh]" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-2xl font-black text-white uppercase tracking-tighter">Modelos de Mensagem</h2>
                            <button onClick={() => setIsManageTemplatesOpen(false)} className="p-2 text-gray-500 hover:text-white"><XIcon className="w-6 h-6"/></button>
                        </div>

                        <div className="flex-grow overflow-y-auto space-y-4 pr-2 custom-scrollbar">
                            {editingTemplate ? (
                                <div className="bg-dark/50 p-6 rounded-3xl border border-primary/30 space-y-4 animate-fadeIn">
                                    <input type="text" placeholder="Título do Modelo (ex: Boas vindas VIP)" value={editingTemplate.title || ''} onChange={e => setEditingTemplate({...editingTemplate, title: e.target.value})} className="w-full bg-dark border border-gray-700 rounded-xl p-3 text-white font-bold" />
                                    <textarea rows={6} placeholder="Mensagem... Use {{nome}}, {{admin}} e {{evento}}" value={editingTemplate.text || ''} onChange={e => setEditingTemplate({...editingTemplate, text: e.target.value})} className="w-full bg-dark border border-gray-700 rounded-xl p-3 text-white text-sm" />
                                    <div className="flex gap-2">
                                        <button onClick={handleSaveTemplateAction} className="flex-1 py-3 bg-primary text-white font-black rounded-xl uppercase text-xs">Salvar Modelo</button>
                                        <button onClick={() => setEditingTemplate(null)} className="px-6 py-3 bg-gray-700 text-white font-black rounded-xl uppercase text-xs">Cancelar</button>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <button onClick={() => setEditingTemplate({})} className="w-full py-4 border-2 border-dashed border-gray-700 rounded-3xl text-gray-500 font-black uppercase text-xs hover:border-primary hover:text-primary transition-all flex items-center justify-center gap-2">
                                        <PlusIcon className="w-4 h-4" /> Novo Modelo de Resposta
                                    </button>
                                    {templates.map(t => (
                                        <div key={t.id} className="bg-dark/40 p-5 rounded-2xl border border-white/5 flex justify-between items-start group">
                                            <div className="min-w-0">
                                                <h3 className="text-white font-black uppercase text-xs mb-1">{t.title}</h3>
                                                <p className="text-gray-500 text-[11px] line-clamp-2 italic">"{t.text}"</p>
                                            </div>
                                            <div className="flex gap-1 ml-4">
                                                <button onClick={() => setEditingTemplate(t)} className="p-2 text-gray-500 hover:text-white"><PencilIcon className="w-4 h-4"/></button>
                                                <button onClick={() => handleDeleteTemplateAction(t.id)} className="p-2 text-gray-500 hover:text-red-500"><TrashIcon className="w-4 h-4"/></button>
                                            </div>
                                        </div>
                                    ))}
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Modal: Selecionar Modelo para Envio */}
            {isSelectTemplateOpen && selectedLead && (
                <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[110] flex items-center justify-center p-6" onClick={() => setIsSelectTemplateOpen(false)}>
                    <div className="bg-secondary w-full max-w-lg p-8 rounded-[2.5rem] border border-white/10 shadow-2xl" onClick={e => e.stopPropagation()}>
                        <h2 className="text-xl font-black text-white uppercase tracking-tighter mb-2">Enviar Mensagem</h2>
                        <p className="text-gray-500 text-xs font-black uppercase mb-6 tracking-widest">Para: {selectedLead.name.split(' ')[0]}</p>

                        <div className="space-y-3">
                            {templates.map(t => (
                                <button 
                                    key={t.id} 
                                    onClick={() => handleSendTemplate(t)}
                                    className="w-full bg-dark/60 p-5 rounded-2xl border border-white/5 hover:border-green-500/50 text-left transition-all group flex justify-between items-center"
                                >
                                    <div className="min-w-0">
                                        <p className="text-white font-black uppercase text-xs group-hover:text-green-400 transition-colors">{t.title}</p>
                                        <p className="text-gray-500 text-[10px] truncate mt-1">{t.text.substring(0, 60)}...</p>
                                    </div>
                                    <WhatsAppIcon className="w-5 h-5 text-gray-700 group-hover:text-green-500" />
                                </button>
                            ))}
                            {templates.length === 0 && (
                                <p className="text-center text-gray-500 py-4 text-xs font-bold uppercase">Nenhum modelo cadastrado.</p>
                            )}
                        </div>
                        
                        <button onClick={() => setIsSelectTemplateOpen(false)} className="w-full mt-6 py-4 bg-gray-800 text-gray-400 font-black rounded-2xl uppercase text-[10px] tracking-widest">Cancelar</button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default RecoveryDashboard;
