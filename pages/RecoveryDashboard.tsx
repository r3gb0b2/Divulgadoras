
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { getAllVipMemberships, getAllVipEvents, updateVipMembership } from '../services/vipService';
import { getRecoveryTemplates, saveRecoveryTemplate, deleteRecoveryTemplate } from '../services/recoveryService';
import { getOrganizations } from '../services/organizationService';
import { VipMembership, RecoveryStatus, VipEvent, RecoveryTemplate, Organization } from '../types';
import { 
    ArrowLeftIcon, SearchIcon, WhatsAppIcon, 
    RefreshIcon, FilterIcon, ClockIcon, CheckCircleIcon, XIcon,
    PencilIcon, TrashIcon, PlusIcon, DocumentDuplicateIcon, TicketIcon,
    BuildingOfficeIcon
} from '../components/Icons';
import firebase from 'firebase/compat/app';

const toDateSafe = (timestamp: any): Date | null => {
    if (!timestamp) return null;
    if (typeof timestamp.toDate === 'function') return timestamp.toDate();
    if (typeof timestamp === 'object' && timestamp.seconds !== undefined) return new Date(timestamp.seconds * 1000);
    const date = new Date(timestamp);
    if (!isNaN(date.getTime())) return date;
    return null;
};

const RecoveryDashboard: React.FC = () => {
    const navigate = useNavigate();
    const { adminData, selectedOrgId } = useAdminAuth();
    
    const [leads, setLeads] = useState<VipMembership[]>([]);
    const [events, setEvents] = useState<VipEvent[]>([]);
    const [templates, setTemplates] = useState<RecoveryTemplate[]>([]);
    const [organizations, setOrganizations] = useState<Organization[]>([]);
    
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<RecoveryStatus | 'all'>('none');
    const [campaignFilter, setCampaignFilter] = useState('all');
    const [orgFilter, setOrgFilter] = useState<string>('all');

    // Modais
    const [isManageTemplatesOpen, setIsManageTemplatesOpen] = useState(false);
    const [isSelectTemplateOpen, setIsSelectTemplateOpen] = useState(false);
    const [editingTemplate, setEditingTemplate] = useState<Partial<RecoveryTemplate> | null>(null);
    const [selectedLead, setSelectedLead] = useState<VipMembership | null>(null);

    const isSuperAdmin = adminData?.role === 'superadmin';

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        try {
            // Se for superadmin, busca tudo. Se não, apenas da org logada.
            const targetOrg = isSuperAdmin ? 'all' : (selectedOrgId || '');
            if (!targetOrg) {
                setIsLoading(false);
                return;
            }

            const [allVip, allEvents, allTemplates, allOrgs] = await Promise.all([
                getAllVipMemberships('all'),
                getAllVipEvents(),
                getRecoveryTemplates(selectedOrgId || 'global'),
                isSuperAdmin ? getOrganizations() : Promise.resolve([])
            ]);

            setEvents(allEvents);
            setTemplates(allTemplates);
            setOrganizations(allOrgs);

            // Filtramos apenas quem está PENDENTE (Carrinho abandonado)
            const pendings = allVip.filter(m => m.status === 'pending');
            
            // Se não for superadmin, filtra pela org do admin logado imediatamente
            if (!isSuperAdmin) {
                setLeads(pendings.filter(m => m.organizationId === selectedOrgId));
            } else {
                setLeads(pendings);
            }

        } catch (e) {
            console.error("Erro ao carregar recuperação:", e);
        } finally {
            setIsLoading(false);
        }
    }, [isSuperAdmin, selectedOrgId]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Eventos filtrados pela organização selecionada no filtro (para o dropdown)
    const filteredEventOptions = useMemo(() => {
        if (orgFilter === 'all') return events;
        // Atualmente VipMembership tem organizationId, mas VipEvent pode não ter o ID da org de forma clara no tipo
        // Se o seu sistema tiver vinculo de eventos com orgs, filtre aqui. 
        // Por enquanto mostramos todos ou os que batem com os leads visiveis.
        return events;
    }, [events, orgFilter]);

    const filteredLeads = useMemo(() => {
        return leads.filter(p => {
            const pRecoveryStatus = (p as any).recoveryStatus || 'none';
            const matchesStatus = statusFilter === 'all' || pRecoveryStatus === statusFilter;
            const matchesCampaign = campaignFilter === 'all' || p.vipEventId === campaignFilter;
            const matchesOrg = orgFilter === 'all' || p.organizationId === orgFilter;
            
            const matchesSearch = 
                p.promoterName.toLowerCase().includes(searchQuery.toLowerCase()) || 
                p.promoterEmail.toLowerCase().includes(searchQuery.toLowerCase()) ||
                (p.promoterWhatsapp || '').includes(searchQuery);

            return matchesStatus && matchesSearch && matchesCampaign && matchesOrg;
        });
    }, [leads, statusFilter, campaignFilter, orgFilter, searchQuery]);

    const handleUpdateStatus = async (membershipId: string, status: RecoveryStatus) => {
        try {
            await updateVipMembership(membershipId, {
                ...({
                    recoveryStatus: status,
                    recoveryAdminEmail: adminData?.email,
                    recoveryUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
                } as any)
            });
            setLeads(prev => prev.map(p => 
                p.id === membershipId ? { 
                    ...p, 
                    recoveryStatus: status, 
                    recoveryAdminEmail: adminData?.email 
                } as any : p
            ));
        } catch (e) {
            alert("Erro ao atualizar status.");
        }
    };

    const handleStartRecovery = (lead: VipMembership) => {
        setSelectedLead(lead);
        if (templates.length === 0) {
            const firstName = lead.promoterName.split(' ')[0];
            const event = events.find(e => e.id === lead.vipEventId);
            const msg = `Olá ${firstName}! Vi que você tentou garantir seu acesso VIP para o evento ${lead.vipEventName}, mas o pagamento não foi concluído. 👋\n\nAinda tenho algumas vagas com o desconto de R$ ${event?.price.toFixed(2)}. Teve alguma dúvida ou dificuldade com o Pix? Posso te ajudar a finalizar?`;
            
            if (!(lead as any).recoveryAdminEmail) handleUpdateStatus(lead.id, 'contacted');
            window.open(`https://wa.me/55${(lead.promoterWhatsapp || '').replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`, '_blank');
        } else {
            setIsSelectTemplateOpen(true);
        }
    };

    const handleSendTemplate = (template: RecoveryTemplate) => {
        if (!selectedLead) return;
        
        const firstName = selectedLead.promoterName.split(' ')[0];
        const adminName = adminData?.email.split('@')[0] || 'Gestor';
        
        const msg = template.text
            .replace(/{{nome}}/g, firstName)
            .replace(/{{admin}}/g, adminName)
            .replace(/{{evento}}/g, selectedLead.vipEventName || 'evento');

        if (!(selectedLead as any).recoveryAdminEmail) handleUpdateStatus(selectedLead.id, 'contacted');
        
        window.open(`https://wa.me/55${(selectedLead.promoterWhatsapp || '').replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`, '_blank');
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

    const getTimeAgo = (ts: any) => {
        const date = toDateSafe(ts);
        if (!date) return '---';
        const diff = Math.floor((new Date().getTime() - date.getTime()) / 60000);
        if (diff < 60) return `há ${diff} min`;
        const hours = Math.floor(diff / 60);
        if (hours < 24) return `há ${hours} h`;
        return `há ${Math.floor(hours/24)} d`;
    };

    return (
        <div className="pb-40">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4 px-4 md:px-0">
                <div>
                    <h1 className="text-3xl font-black text-white uppercase tracking-tighter flex items-center gap-3">
                        <TicketIcon className="w-8 h-8 text-primary" /> Recuperação de Vendas
                    </h1>
                    <p className="text-gray-500 text-[10px] font-black uppercase tracking-widest mt-1">Interessados que não concluíram o Pix</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={() => setIsManageTemplatesOpen(true)} className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-500 transition-all flex items-center gap-2">
                        <DocumentDuplicateIcon className="w-4 h-4" /> Modelos
                    </button>
                    <button onClick={() => fetchData()} className="p-3 bg-gray-800 text-gray-400 rounded-2xl hover:text-white transition-colors">
                        <RefreshIcon className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`}/>
                    </button>
                    <button onClick={() => navigate('/admin/club-vip')} className="flex items-center gap-2 px-4 py-2 bg-gray-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-gray-600">
                        <ArrowLeftIcon className="w-4 h-4" /> Voltar
                    </button>
                </div>
            </div>

            <div className="bg-secondary/60 backdrop-blur-xl rounded-[2.5rem] p-6 border border-white/5 shadow-2xl space-y-6">
                
                {/* BARRA DE FILTROS */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-3 bg-dark/40 p-4 rounded-[1.5rem] border border-white/5">
                    <div className="lg:col-span-4 relative">
                        <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                        <input 
                            type="text" placeholder="NOME, E-MAIL OU WHATSAPP..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                            className="w-full pl-11 pr-4 py-3 bg-dark border border-gray-700 rounded-2xl text-white text-[10px] font-black uppercase outline-none focus:border-primary"
                        />
                    </div>
                    
                    {isSuperAdmin && (
                        <div className="lg:col-span-3 flex items-center gap-2">
                            <BuildingOfficeIcon className="w-5 h-5 text-gray-600 flex-shrink-0" />
                            <select value={orgFilter} onChange={e => { setOrgFilter(e.target.value); setCampaignFilter('all'); }} className="w-full bg-dark border border-gray-700 text-white px-4 py-3 rounded-2xl text-[10px] font-black uppercase outline-none focus:border-primary">
                                <option value="all">TODAS PRODUTORAS</option>
                                {organizations.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                            </select>
                        </div>
                    )}

                    <div className="lg:col-span-3">
                        <select value={campaignFilter} onChange={e => setCampaignFilter(e.target.value)} className="w-full bg-dark border border-gray-700 text-white px-4 py-3 rounded-2xl text-[10px] font-black uppercase outline-none focus:border-primary">
                            <option value="all">TODOS EVENTOS VIP</option>
                            {filteredEventOptions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                    </div>

                    <div className="lg:col-span-2">
                        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)} className="w-full bg-dark border border-gray-700 text-white px-4 py-3 rounded-2xl text-[10px] font-black uppercase outline-none focus:border-primary">
                            <option value="all">STATUS (TODOS)</option>
                            <option value="none">🆕 NÃO ABORDADO</option>
                            <option value="contacted">💬 ABORDADO</option>
                            <option value="no_response">⌛ SEM RETORNO</option>
                        </select>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left border-separate border-spacing-y-2">
                        <thead>
                            <tr className="text-[10px] font-black text-gray-500 uppercase tracking-widest">
                                <th className="px-6 py-2">Potencial Membro</th>
                                <th className="px-6 py-2">Evento / Valor</th>
                                <th className="px-6 py-2">Abandono</th>
                                <th className="px-6 py-2 text-center">Status</th>
                                <th className="px-6 py-2 text-right">Ação</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {isLoading ? (
                                <tr><td colSpan={5} className="text-center py-20 text-gray-500 font-black uppercase text-xs animate-pulse tracking-widest">Buscando leads VIP...</td></tr>
                            ) : filteredLeads.length === 0 ? (
                                <tr><td colSpan={5} className="text-center py-20 text-gray-500 font-black uppercase text-xs tracking-widest">Nenhum carrinho abandonado encontrado</td></tr>
                            ) : filteredLeads.map(p => {
                                const pRecoveryStatus = (p as any).recoveryStatus || 'none';
                                const event = events.find(e => e.id === p.vipEventId);
                                return (
                                    <tr key={p.id} className="bg-dark/40 hover:bg-white/[0.03] transition-all group overflow-hidden">
                                        <td className="px-6 py-5 rounded-l-2xl">
                                            <p className="text-sm font-black text-white uppercase truncate">{p.promoterName}</p>
                                            <div className="flex items-center gap-3 mt-1.5">
                                                <p className="text-[10px] text-primary font-bold">{(p.promoterWhatsapp || 'Sem Whats')}</p>
                                                <p className="text-[9px] text-gray-500 font-mono truncate">{p.promoterEmail}</p>
                                            </div>
                                        </td>
                                        <td className="px-6 py-5">
                                            <p className="text-xs text-white font-bold uppercase">{p.vipEventName}</p>
                                            <p className="text-[10px] text-primary font-black uppercase">R$ {event?.price.toFixed(2) || '---'}</p>
                                        </td>
                                        <td className="px-6 py-5">
                                            <div className="flex items-center gap-2 text-gray-500 text-[10px] font-black uppercase">
                                                <ClockIcon className="w-3.5 h-3.5" />
                                                {getTimeAgo(p.submittedAt)}
                                            </div>
                                        </td>
                                        <td className="px-6 py-5 text-center">
                                            <div className="flex flex-wrap justify-center gap-1">
                                                <button onClick={() => handleUpdateStatus(p.id, 'none')} className={`px-2 py-0.5 rounded text-[8px] font-black uppercase border ${pRecoveryStatus === 'none' ? 'bg-gray-700 text-white border-gray-600' : 'bg-transparent text-gray-600 border-gray-800'}`}>Novo</button>
                                                <button onClick={() => handleUpdateStatus(p.id, 'contacted')} className={`px-2 py-0.5 rounded text-[8px] font-black uppercase border ${pRecoveryStatus === 'contacted' ? 'bg-blue-600 text-white border-blue-500' : 'bg-transparent text-gray-600 border-gray-800'}`}>Abordado</button>
                                                <button onClick={() => handleUpdateStatus(p.id, 'no_response')} className={`px-2 py-0.5 rounded text-[8px] font-black uppercase border ${pRecoveryStatus === 'no_response' ? 'bg-orange-600 text-white border-orange-500' : 'bg-transparent text-gray-600 border-gray-800'}`}>Vácuo</button>
                                            </div>
                                            {(p as any).recoveryAdminEmail && (
                                                <p className="text-[7px] text-gray-600 font-bold uppercase mt-1">Por: {(p as any).recoveryAdminEmail.split('@')[0]}</p>
                                            )}
                                        </td>
                                        <td className="px-6 py-5 text-right rounded-r-2xl">
                                            <button 
                                                onClick={() => handleStartRecovery(p)}
                                                className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-xl text-[9px] font-black uppercase hover:bg-green-500 shadow-lg shadow-green-900/20 active:scale-95 transition-all"
                                            >
                                                <WhatsAppIcon className="w-4 h-4" /> RECUPERAR
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal: Gerenciar Modelos */}
            {isManageTemplatesOpen && (
                <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[110] flex items-center justify-center p-6" onClick={() => setIsManageTemplatesOpen(false)}>
                    <div className="bg-secondary w-full max-w-2xl p-8 rounded-[2.5rem] border border-white/10 shadow-2xl flex flex-col max-h-[85vh]" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-2xl font-black text-white uppercase tracking-tighter">Modelos de Abordagem</h2>
                            <button onClick={() => setIsManageTemplatesOpen(false)} className="p-2 text-gray-500 hover:text-white"><XIcon className="w-6 h-6"/></button>
                        </div>

                        <div className="flex-grow overflow-y-auto space-y-4 pr-2 custom-scrollbar">
                            {editingTemplate ? (
                                <div className="bg-dark/50 p-6 rounded-3xl border border-primary/30 space-y-4 animate-fadeIn">
                                    <input type="text" placeholder="Título (ex: Pix Esquecido)" value={editingTemplate.title || ''} onChange={e => setEditingTemplate({...editingTemplate, title: e.target.value})} className="w-full bg-dark border border-gray-700 rounded-xl p-3 text-white font-bold" />
                                    <textarea rows={6} placeholder="Mensagem... Use {{nome}}, {{admin}} e {{evento}}" value={editingTemplate.text || ''} onChange={e => setEditingTemplate({...editingTemplate, text: e.target.value})} className="w-full bg-dark border border-gray-700 rounded-xl p-3 text-white text-sm" />
                                    <div className="flex gap-2">
                                        <button onClick={handleSaveTemplateAction} className="flex-1 py-3 bg-primary text-white font-black rounded-xl uppercase text-xs">Salvar Modelo</button>
                                        <button onClick={() => setEditingTemplate(null)} className="px-6 py-3 bg-gray-700 text-white font-black rounded-xl uppercase text-xs">Cancelar</button>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <button onClick={() => setEditingTemplate({})} className="w-full py-4 border-2 border-dashed border-gray-700 rounded-3xl text-gray-500 font-black uppercase text-xs hover:border-primary hover:text-primary transition-all flex items-center justify-center gap-2">
                                        <PlusIcon className="w-4 h-4" /> Novo Modelo VIP
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
                        <h2 className="text-xl font-black text-white uppercase tracking-tighter mb-2">Recuperar Carrinho</h2>
                        <p className="text-gray-500 text-xs font-black uppercase mb-6 tracking-widest">Para: {selectedLead.promoterName.split(' ')[0]}</p>

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
