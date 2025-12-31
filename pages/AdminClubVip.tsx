
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { 
    getAllVipMemberships, 
    updateVipMembership, 
    getAllVipEvents, 
    createVipEvent, 
    updateVipEvent, 
    deleteVipEvent 
} from '../services/vipService';
import { updatePromoter, getAllPromoters } from '../services/promoterService';
import { getOrganizations } from '../services/organizationService';
import { VipMembership, VipEvent, Organization, Promoter, RecoveryStatus } from '../types';
import { firestore, functions } from '../firebase/config';
import { httpsCallable } from 'firebase/functions';
import { 
    ArrowLeftIcon, SearchIcon, CheckCircleIcon, XIcon, 
    TicketIcon, RefreshIcon, ClockIcon, UserIcon,
    BuildingOfficeIcon, PlusIcon, TrashIcon, PencilIcon, AlertTriangleIcon,
    WhatsAppIcon, InstagramIcon, DownloadIcon, ChartBarIcon, MegaphoneIcon, DocumentDuplicateIcon, FilterIcon
} from '../components/Icons';
import firebase from 'firebase/compat/app';

const AdminClubVip: React.FC = () => {
    const navigate = useNavigate();
    const { adminData, loading: authLoading } = useAdminAuth();
    
    const [activeTab, setActiveTab] = useState<'members' | 'events' | 'recovery'>('members');
    const [memberships, setMemberships] = useState<VipMembership[]>([]);
    const [vipEvents, setVipEvents] = useState<VipEvent[]>([]);
    const [recoveryLeads, setRecoveryLeads] = useState<Promoter[]>([]);
    const [organizations, setOrganizations] = useState<Record<string, string>>({});
    
    const [isLoading, setIsLoading] = useState(true);
    const [filterStatus, setFilterStatus] = useState<'pending' | 'confirmed' | 'all'>('all');
    const [filterBenefit, setFilterBenefit] = useState<'active' | 'waiting' | 'all'>('all');
    const [filterRecovery, setFilterRecovery] = useState<RecoveryStatus | 'all'>('all');
    const [selectedEventId, setSelectedEventId] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isBulkProcessing, setIsBulkProcessing] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingEvent, setEditingEvent] = useState<Partial<VipEvent> | null>(null);

    const isSuperAdmin = adminData?.role === 'superadmin';

    const fetchData = useCallback(async () => {
        if (!isSuperAdmin) return;
        setIsLoading(true);
        try {
            const [orgsData, eventsData, membersData] = await Promise.all([
                getOrganizations(),
                getAllVipEvents(),
                getAllVipMemberships(selectedEventId)
            ]);
            
            const orgMap = orgsData.reduce((acc, o) => ({ ...acc, [o.id]: o.name }), {} as Record<string, string>);
            setOrganizations(orgMap);
            setVipEvents(eventsData);
            setMemberships(membersData);

            // Carregar Leads para Recuperação (Pessoas rejeitadas em qualquer org)
            const rejectedPromoters = await getAllPromoters({
                organizationId: 'all', // Superadmin vê tudo
                filterOrgId: 'all',
                status: 'all' // Filtraremos localmente para incluir rejected e rejected_editable
            });
            
            setRecoveryLeads(rejectedPromoters.filter(p => p.status === 'rejected' || (p.status as string) === 'rejected_editable'));
            
        } catch (e) {
            console.error("Erro ao carregar dados VIP:", e);
        } finally {
            setIsLoading(false);
        }
    }, [selectedEventId, isSuperAdmin]);

    useEffect(() => {
        if (!authLoading) fetchData();
    }, [authLoading, fetchData]);

    const filteredMembers = useMemo(() => {
        return memberships.filter(m => {
            const matchesStatus = filterStatus === 'all' || m.status === filterStatus;
            const matchesBenefit = filterBenefit === 'all' || 
                (filterBenefit === 'active' && m.isBenefitActive === true) ||
                (filterBenefit === 'waiting' && m.isBenefitActive === false && m.status === 'confirmed');
            
            const matchesSearch = 
                (m.promoterName || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
                (m.promoterEmail || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                (m.benefitCode || '').toLowerCase().includes(searchQuery.toLowerCase());
            
            const matchesEvent = selectedEventId === 'all' || m.vipEventId === selectedEventId;
            
            return matchesStatus && matchesBenefit && matchesSearch && matchesEvent;
        });
    }, [memberships, filterStatus, filterBenefit, searchQuery, selectedEventId]);

    const filteredRecovery = useMemo(() => {
        return recoveryLeads.filter(p => {
            const matchesRecovery = filterRecovery === 'all' || (p.recoveryStatus || 'none') === filterRecovery;
            const matchesSearch = 
                (p.name || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
                (p.email || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                (p.whatsapp || '').includes(searchQuery);
            
            return matchesRecovery && matchesSearch;
        });
    }, [recoveryLeads, filterRecovery, searchQuery]);

    const handleCopy = (text: string) => {
        if (!text) return;
        navigator.clipboard.writeText(text);
        alert("Copiado!");
    };

    const handleUpdateRecovery = async (promoterId: string, status: RecoveryStatus) => {
        try {
            await updatePromoter(promoterId, {
                recoveryStatus: status,
                recoveryAdminEmail: adminData?.email,
                recoveryUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            // Atualiza localmente
            setRecoveryLeads(prev => prev.map(p => 
                p.id === promoterId ? { ...p, recoveryStatus: status, recoveryAdminEmail: adminData?.email } : p
            ));
        } catch (e) {
            alert("Erro ao atualizar status de recuperação.");
        }
    };

    const handleWhatsAppRecovery = (promoter: Promoter) => {
        const firstName = promoter.name.split(' ')[0];
        const adminName = adminData?.email.split('@')[0];
        const msg = `Olá ${firstName}! Tudo bem? Sou o ${adminName} da Equipe Certa. Vi que seu cadastro para a equipe do evento ${promoter.campaignName} não pôde ser aprovado no momento, mas não queremos que você fique de fora! 🚀\n\nLiberei uma condição VIP exclusiva pra você no nosso Clube. Você ganha benefícios e o seu ingresso sai por um valor promocional. Tem interesse em saber como funciona?`;
        
        // Atribui o admin automaticamente ao clicar
        handleUpdateRecovery(promoter.id, 'contacted');
        
        const url = `https://wa.me/55${promoter.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`;
        window.open(url, '_blank');
    };

    const handleDownloadXLS = () => {
        const target = activeTab === 'members' ? filteredMembers : filteredRecovery as any[];
        if (target.length === 0) return;

        let table = `
            <html xmlns:x="urn:schemas-microsoft-com:office:excel">
            <head>
                <meta http-equiv="content-type" content="application/vnd.ms-excel; charset=UTF-8">
            </head>
            <body>
                <table border="1">
                    <thead>
                        <tr>
                            <th style="background-color: #f0f0f0; font-weight: bold;">Nome</th>
                            <th style="background-color: #f0f0f0; font-weight: bold;">E-mail</th>
                            <th style="background-color: #f0f0f0; font-weight: bold;">WhatsApp</th>
                            <th style="background-color: #f0f0f0; font-weight: bold;">Evento/Origem</th>
                            ${activeTab === 'members' ? `
                                <th style="background-color: #f0f0f0; font-weight: bold;">Código</th>
                                <th style="background-color: #f0f0f0; font-weight: bold;">Status Pagto</th>
                                <th style="background-color: #f0f0f0; font-weight: bold;">Ativado</th>
                            ` : `
                                <th style="background-color: #f0f0f0; font-weight: bold;">Status Recuperação</th>
                                <th style="background-color: #f0f0f0; font-weight: bold;">Admin Responsável</th>
                            `}
                        </tr>
                    </thead>
                    <tbody>
        `;

        target.forEach(m => {
            if (activeTab === 'members') {
                table += `
                    <tr>
                        <td>${m.promoterName}</td>
                        <td>${m.promoterEmail}</td>
                        <td>${m.promoterWhatsapp || ''}</td>
                        <td>${m.vipEventName}</td>
                        <td style="font-family: monospace;">${m.benefitCode || ''}</td>
                        <td>${m.status === 'confirmed' ? 'PAGO' : 'PENDENTE'}</td>
                        <td>${m.isBenefitActive ? 'SIM' : 'NÃO'}</td>
                    </tr>
                `;
            } else {
                table += `
                    <tr>
                        <td>${m.name}</td>
                        <td>${m.email}</td>
                        <td>${m.whatsapp}</td>
                        <td>${m.campaignName}</td>
                        <td>${m.recoveryStatus || 'none'}</td>
                        <td>${m.recoveryAdminEmail || '-'}</td>
                    </tr>
                `;
            }
        });

        table += `</tbody></table></body></html>`;

        const blob = new Blob([table], { type: 'application/vnd.ms-excel' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `clube_vip_${activeTab}_${new Date().getTime()}.xls`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleManualNotifySingle = async (membership: VipMembership) => {
        if (membership.status !== 'confirmed') return;
        
        setIsBulkProcessing(true);
        const docId = `${membership.promoterId}_${membership.vipEventId}`;

        try {
            await updateVipMembership(docId, { isBenefitActive: true });
            await updatePromoter(membership.promoterId, { emocoesBenefitActive: true });
            
            const notifyActivation = httpsCallable(functions, 'notifyVipActivation');
            await notifyActivation({ membershipId: docId });

            alert(`Sucesso! E-mail enviado para ${membership.promoterName}`);
            await fetchData();
        } catch (e: any) {
            alert(`Falha técnica: ${e.message}`);
        } finally {
            setIsBulkProcessing(false);
        }
    };

    const handleBulkNotify = async () => {
        if (selectedIds.size === 0) return;
        if (!window.confirm(`Enviar e-mail para ${selectedIds.size} membros selecionados?`)) return;
        
        setIsBulkProcessing(true);
        try {
            const notifyActivation = httpsCallable(functions, 'notifyVipActivation');
            for (const id of Array.from(selectedIds)) {
                const m = memberships.find(item => item.id === id);
                if (m) {
                    const docId = `${m.promoterId}_${m.vipEventId}`;
                    await updateVipMembership(docId, { isBenefitActive: true });
                    await updatePromoter(m.promoterId, { emocoesBenefitActive: true });
                    await notifyActivation({ membershipId: docId });
                }
            }
            setSelectedIds(new Set());
            await fetchData();
            alert(`Ativações processadas.`);
        } catch (e) {
            alert("Erro ao processar ativações.");
        } finally {
            setIsBulkProcessing(false);
        }
    };

    const handleSaveEvent = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingEvent?.name) return;
        setIsBulkProcessing(true);
        try {
            if (editingEvent.id) await updateVipEvent(editingEvent.id, editingEvent);
            else await createVipEvent({
                name: editingEvent.name!,
                price: editingEvent.price || 0,
                description: editingEvent.description || '',
                benefits: editingEvent.benefits || [],
                pixKey: editingEvent.pixKey || '',
                externalSlug: editingEvent.externalSlug || '',
                isActive: editingEvent.isActive ?? true
            });
            setIsModalOpen(false);
            setEditingEvent(null);
            await fetchData();
        } catch (e) { alert("Erro ao salvar evento."); } finally { setIsBulkProcessing(false); }
    };

    return (
        <div className="pb-40">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4 px-4 md:px-0">
                <h1 className="text-3xl font-black text-white uppercase tracking-tighter flex items-center gap-3">
                    <TicketIcon className="w-8 h-8 text-primary" /> Gestão Clube VIP
                </h1>
                <div className="flex gap-2">
                    <button onClick={handleDownloadXLS} className="px-4 py-3 bg-indigo-600 text-white font-black rounded-2xl text-[10px] uppercase tracking-widest shadow-xl flex items-center justify-center gap-2 hover:bg-indigo-500 transition-all">
                        <DownloadIcon className="w-4 h-4" /> Exportar XLS
                    </button>
                    {activeTab === 'events' && (
                        <button onClick={() => { setEditingEvent({ benefits: [] }); setIsModalOpen(true); }} className="px-6 py-3 bg-primary text-white font-black rounded-2xl text-[10px] uppercase tracking-widest shadow-xl flex items-center justify-center gap-2">
                            <PlusIcon className="w-4 h-4" /> Novo Evento
                        </button>
                    )}
                    <button onClick={() => fetchData()} className="p-3 bg-gray-800 text-gray-400 rounded-2xl hover:text-white transition-colors">
                        <RefreshIcon className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`}/>
                    </button>
                </div>
            </div>

            <div className="flex bg-gray-800/50 p-1.5 rounded-2xl mb-8 border border-white/5 w-fit ml-4 md:ml-0 overflow-x-auto max-w-full">
                <button onClick={() => setActiveTab('members')} className={`px-6 py-3 text-xs font-black uppercase rounded-xl transition-all whitespace-nowrap ${activeTab === 'members' ? 'bg-primary text-white shadow-lg' : 'text-gray-400 hover:text-gray-200'}`}>Membros</button>
                <button onClick={() => setActiveTab('recovery')} className={`px-6 py-3 text-xs font-black uppercase rounded-xl transition-all whitespace-nowrap ${activeTab === 'recovery' ? 'bg-primary text-white shadow-lg' : 'text-gray-400 hover:text-gray-200'}`}>Recuperação de Carrinho</button>
                <button onClick={() => setActiveTab('events')} className={`px-6 py-3 text-xs font-black uppercase rounded-xl transition-all whitespace-nowrap ${activeTab === 'events' ? 'bg-primary text-white shadow-lg' : 'text-gray-400 hover:text-gray-200'}`}>Eventos</button>
            </div>

            <div className="bg-secondary/60 backdrop-blur-xl rounded-[2.5rem] p-6 border border-white/5 shadow-2xl space-y-6">
                {activeTab === 'members' && (
                    <>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            <select value={selectedEventId} onChange={e => setSelectedEventId(e.target.value)} className="bg-dark border border-gray-700 text-white px-4 py-3 rounded-xl text-[10px] font-black uppercase outline-none focus:border-primary">
                                <option value="all">TODOS EVENTOS</option>
                                {vipEvents.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                            </select>
                            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as any)} className="bg-dark border border-gray-700 text-white px-4 py-3 rounded-xl text-[10px] font-black uppercase outline-none focus:border-primary">
                                <option value="all">STATUS PGTO (TODOS)</option>
                                <option value="confirmed">PAGO</option>
                                <option value="pending">PENDENTE</option>
                            </select>
                            <select value={filterBenefit} onChange={e => setFilterBenefit(e.target.value as any)} className="bg-dark border border-gray-700 text-white px-4 py-3 rounded-xl text-[10px] font-black uppercase outline-none focus:border-primary">
                                <option value="all">ATIVAÇÃO (TODAS)</option>
                                <option value="active">ATIVADOS</option>
                                <option value="waiting">AGUARDANDO ATIVAÇÃO</option>
                            </select>
                            <div className="relative">
                                <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                                <input 
                                    type="text" placeholder="BUSCAR NOME..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                                    className="w-full pl-11 pr-4 py-3 bg-dark border border-gray-700 rounded-xl text-white text-[10px] font-black uppercase outline-none focus:border-primary"
                                />
                            </div>
                        </div>

                        {selectedIds.size > 0 && (
                            <div className="p-4 bg-primary rounded-2xl flex justify-between items-center animate-fadeIn">
                                <p className="text-white font-black text-xs uppercase tracking-widest">{selectedIds.size} membros selecionados</p>
                                <button onClick={handleBulkNotify} disabled={isBulkProcessing} className="px-6 py-2 bg-white text-primary font-black rounded-xl text-[10px] uppercase hover:bg-gray-100 transition-all">
                                    ATIVAR EM MASSA
                                </button>
                            </div>
                        )}

                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-dark/50 text-[10px] font-black text-gray-500 uppercase tracking-widest border-b border-white/5">
                                        <th className="px-6 py-5 w-10">
                                            <input type="checkbox" onChange={(e) => {
                                                if (e.target.checked) setSelectedIds(new Set(filteredMembers.map(m => m.id)));
                                                else setSelectedIds(new Set());
                                            }} className="w-5 h-5 rounded border-gray-700 bg-dark text-primary" />
                                        </th>
                                        <th className="px-6 py-5">Membro</th>
                                        <th className="px-6 py-5 text-center">Código</th>
                                        <th className="px-6 py-5 text-center">Ativação</th>
                                        <th className="px-6 py-5 text-center">Status Pgto</th>
                                        <th className="px-6 py-5 text-right">Ação</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {filteredMembers.map(m => (
                                        <tr key={m.id} className="hover:bg-white/[0.02] transition-colors">
                                            <td className="px-6 py-5">
                                                <input 
                                                    type="checkbox" 
                                                    checked={selectedIds.has(m.id)} 
                                                    onChange={() => {
                                                        const n = new Set(selectedIds);
                                                        if (n.has(m.id)) n.delete(m.id); else n.add(m.id);
                                                        setSelectedIds(n);
                                                    }} 
                                                    className="w-5 h-5 rounded border-gray-700 bg-dark text-primary" 
                                                />
                                            </td>
                                            <td className="px-6 py-5">
                                                <p className="text-sm font-black text-white uppercase truncate">{m.promoterName}</p>
                                                <p className="text-[9px] text-primary font-black uppercase mt-1">{m.vipEventName}</p>
                                            </td>
                                            <td className="px-6 py-5 text-center">
                                                {m.benefitCode ? (
                                                    <span 
                                                        onClick={() => handleCopy(m.benefitCode || '')}
                                                        className="px-3 py-1 bg-dark text-primary border border-primary/30 rounded-lg font-mono text-xs font-black tracking-widest cursor-pointer hover:bg-primary/10 transition-colors"
                                                        title="Clique para copiar"
                                                    >
                                                        {m.benefitCode}
                                                    </span>
                                                ) : <span className="text-gray-600 text-[10px] font-bold">---</span>}
                                            </td>
                                            <td className="px-6 py-5 text-center">
                                                {m.isBenefitActive ? (
                                                    <span className="px-2 py-0.5 rounded-full bg-green-900/40 text-green-400 border border-green-800 text-[8px] font-black uppercase tracking-widest">ATIVADO</span>
                                                ) : (
                                                    <span className="px-2 py-0.5 rounded-full bg-gray-800 text-gray-500 border border-gray-700 text-[8px] font-black uppercase tracking-widest">AGUARDANDO</span>
                                                )}
                                            </td>
                                            <td className="px-6 py-5 text-center">
                                                <span className={`px-2 py-0.5 rounded-full border text-[8px] font-black uppercase ${m.status === 'confirmed' ? 'bg-green-900/40 text-green-400 border-green-800' : 'bg-orange-900/40 text-orange-400 border-orange-800'}`}>
                                                    {m.status === 'confirmed' ? 'PAGO' : 'PENDENTE'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-5 text-right">
                                                {m.status === 'confirmed' && (
                                                    <button onClick={() => handleManualNotifySingle(m)} disabled={isBulkProcessing} className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-[9px] font-black uppercase hover:bg-indigo-500">
                                                        {m.isBenefitActive ? 'REENVIAR' : 'ATIVAR'}
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}

                {activeTab === 'recovery' && (
                    <>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            <select value={filterRecovery} onChange={e => setFilterRecovery(e.target.value as any)} className="bg-dark border border-gray-700 text-white px-4 py-3 rounded-xl text-[10px] font-black uppercase outline-none focus:border-primary">
                                <option value="all">STATUS RECUPERAÇÃO (TODOS)</option>
                                <option value="none">NÃO CONTATADO</option>
                                <option value="contacted">JÁ CONTATADO</option>
                                <option value="purchased">COMPROU</option>
                                <option value="no_response">NÃO RESPONDEU</option>
                            </select>
                            <div className="relative lg:col-span-2">
                                <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                                <input 
                                    type="text" placeholder="BUSCAR POR NOME OU WHATSAPP..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                                    className="w-full pl-11 pr-4 py-3 bg-dark border border-gray-700 rounded-xl text-white text-[10px] font-black uppercase outline-none focus:border-primary"
                                />
                            </div>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-dark/50 text-[10px] font-black text-gray-500 uppercase tracking-widest border-b border-white/5">
                                        <th className="px-6 py-5">Potencial Cliente</th>
                                        <th className="px-6 py-5">Origem (Evento Rejeitado)</th>
                                        <th className="px-6 py-5 text-center">Status Recuperação</th>
                                        <th className="px-6 py-5 text-center">Responsável</th>
                                        <th className="px-6 py-5 text-right">Ação</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {filteredRecovery.map(p => (
                                        <tr key={p.id} className="hover:bg-white/[0.02] transition-colors">
                                            <td className="px-6 py-5">
                                                <p className="text-sm font-black text-white uppercase truncate">{p.name}</p>
                                                <p className="text-[9px] text-gray-500 font-mono mt-1">{p.whatsapp}</p>
                                            </td>
                                            <td className="px-6 py-5">
                                                <p className="text-xs text-red-400 font-bold uppercase">{p.campaignName}</p>
                                                <p className="text-[9px] text-gray-600 font-black uppercase">{organizations[p.organizationId]}</p>
                                            </td>
                                            <td className="px-6 py-5 text-center">
                                                <div className="flex flex-wrap justify-center gap-1">
                                                    <button onClick={() => handleUpdateRecovery(p.id, 'none')} className={`px-2 py-0.5 rounded text-[8px] font-black uppercase border ${(!p.recoveryStatus || p.recoveryStatus === 'none') ? 'bg-gray-700 text-white' : 'bg-transparent text-gray-600 border-gray-800'}`}>Limpar</button>
                                                    <button onClick={() => handleUpdateRecovery(p.id, 'contacted')} className={`px-2 py-0.5 rounded text-[8px] font-black uppercase border ${p.recoveryStatus === 'contacted' ? 'bg-blue-600 text-white' : 'bg-transparent text-gray-600 border-gray-800'}`}>Contato</button>
                                                    <button onClick={() => handleUpdateRecovery(p.id, 'no_response')} className={`px-2 py-0.5 rounded text-[8px] font-black uppercase border ${p.recoveryStatus === 'no_response' ? 'bg-orange-600 text-white' : 'bg-transparent text-gray-600 border-gray-800'}`}>Vácuo</button>
                                                    <button onClick={() => handleUpdateRecovery(p.id, 'purchased')} className={`px-2 py-0.5 rounded text-[8px] font-black uppercase border ${p.recoveryStatus === 'purchased' ? 'bg-green-600 text-white' : 'bg-transparent text-gray-600 border-gray-800'}`}>VENDA!</button>
                                                </div>
                                            </td>
                                            <td className="px-6 py-5 text-center">
                                                {p.recoveryAdminEmail ? (
                                                    <p className="text-[10px] text-primary font-black uppercase">{p.recoveryAdminEmail.split('@')[0]}</p>
                                                ) : (
                                                    <span className="text-gray-700 text-[10px] font-bold">Livre</span>
                                                )}
                                            </td>
                                            <td className="px-6 py-5 text-right">
                                                <button 
                                                    onClick={() => handleWhatsAppRecovery(p)}
                                                    className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-xl text-[9px] font-black uppercase hover:bg-green-500 shadow-lg shadow-green-900/20"
                                                >
                                                    <WhatsAppIcon className="w-4 h-4" /> INICIAR
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}

                {activeTab === 'events' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {vipEvents.map(ev => (
                            <div key={ev.id} className="bg-dark/40 rounded-[2rem] p-6 border border-white/5 flex flex-col group hover:border-primary/30 transition-all">
                                <div className="flex justify-between items-start mb-4">
                                    <div className={`p-3 rounded-2xl ${ev.isActive ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                                        <TicketIcon className="w-8 h-8" />
                                    </div>
                                    <button onClick={() => { setEditingEvent(ev); setIsModalOpen(true); }} className="p-2 text-gray-400 hover:text-white"><PencilIcon className="w-4 h-4"/></button>
                                </div>
                                <h3 className="text-xl font-black text-white uppercase mb-2">{ev.name}</h3>
                                <p className="text-primary font-black text-2xl mb-4">R$ {ev.price.toFixed(2)}</p>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {isModalOpen && (
                <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[100] flex items-center justify-center p-6" onClick={() => setIsModalOpen(false)}>
                    <div className="bg-secondary w-full max-w-lg p-8 rounded-[2.5rem] border border-white/10 shadow-2xl" onClick={e => e.stopPropagation()}>
                        <h2 className="text-2xl font-black text-white uppercase tracking-tighter mb-6">{editingEvent?.id ? 'Editar' : 'Nova'} Oferta VIP</h2>
                        <form className="space-y-4">
                            <div>
                                <label className="text-[10px] font-black text-gray-500 uppercase ml-1">Nome</label>
                                <input type="text" value={editingEvent?.name || ''} onChange={e => setEditingEvent({...editingEvent!, name: e.target.value})} required className="w-full bg-dark border border-white/10 rounded-2xl p-4 text-white font-bold" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[10px] font-black text-gray-500 uppercase ml-1">Preço (R$)</label>
                                    <input type="number" step="0.01" value={editingEvent?.price || ''} onChange={e => setEditingEvent({...editingEvent!, price: parseFloat(e.target.value)})} required className="w-full bg-dark border border-white/10 rounded-2xl p-4 text-white font-bold" />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-gray-500 uppercase ml-1">Slug STingressos</label>
                                    <input type="text" value={editingEvent?.externalSlug || ''} onChange={e => setEditingEvent({...editingEvent!, externalSlug: e.target.value})} className="w-full bg-dark border border-white/10 rounded-2xl p-4 text-white font-mono" />
                                </div>
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-gray-500 uppercase ml-1">Benefícios (um por linha)</label>
                                <textarea rows={4} value={editingEvent?.benefits?.join('\n') || ''} onChange={e => setEditingEvent({...editingEvent!, benefits: e.target.value.split('\n')})} className="w-full bg-dark border border-white/10 rounded-2xl p-4 text-white text-sm" />
                            </div>
                            <button type="submit" onClick={handleSaveEvent} disabled={isBulkProcessing} className="w-full py-4 bg-primary text-white font-black rounded-2xl uppercase tracking-widest">SALVAR</button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminClubVip;
