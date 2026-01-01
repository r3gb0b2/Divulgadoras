
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { 
    getAllVipMemberships, 
    updateVipMembership, 
    getAllVipEvents, 
    createVipEvent, 
    updateVipEvent, 
    deleteVipEvent,
    sendVipRecoveryEmail
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
    WhatsAppIcon, InstagramIcon, DownloadIcon, ChartBarIcon, MegaphoneIcon, DocumentDuplicateIcon, FilterIcon, ExternalLinkIcon, MailIcon
} from '../components/Icons';
import firebase from 'firebase/compat/app';

declare global {
  interface Window {
    XLSX: any;
  }
}

const AdminClubVip: React.FC = () => {
    const navigate = useNavigate();
    const { adminData, loading: authLoading } = useAdminAuth();
    
    const [activeTab, setActiveTab] = useState<'members' | 'events' | 'recovery'>('members');
    const [memberships, setMemberships] = useState<VipMembership[]>([]);
    const [vipEvents, setVipEvents] = useState<VipEvent[]>([]);
    const [organizations, setOrganizations] = useState<Record<string, string>>({});
    
    const [isLoading, setIsLoading] = useState(true);
    const [filterStatus, setFilterStatus] = useState<'pending' | 'confirmed' | 'all'>('all');
    const [filterBenefit, setFilterBenefit] = useState<'active' | 'waiting' | 'all'>('all');
    const [selectedEventId, setSelectedEventId] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isBulkProcessing, setIsBulkProcessing] = useState(false);
    const [isProcessingId, setIsProcessingId] = useState<string | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingEvent, setEditingEvent] = useState<Partial<VipEvent> | null>(null);

    const isSuperAdmin = adminData?.role === 'superadmin';

    const fetchData = useCallback(async () => {
        if (!isSuperAdmin) {
            setIsLoading(false);
            return;
        }
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
            const matchesSearch = (m.promoterName || '').toLowerCase().includes(searchQuery.toLowerCase()) || (m.promoterEmail || '').toLowerCase().includes(searchQuery.toLowerCase());
            const matchesEvent = selectedEventId === 'all' || m.vipEventId === selectedEventId;
            return matchesStatus && matchesBenefit && matchesSearch && matchesEvent;
        });
    }, [memberships, filterStatus, filterBenefit, searchQuery, selectedEventId]);

    const recoveryMembers = useMemo(() => {
        return memberships.filter(m => {
            if (m.status === 'confirmed') return false;
            const matchesSearch = (m.promoterName || '').toLowerCase().includes(searchQuery.toLowerCase()) || (m.promoterEmail || '').toLowerCase().includes(searchQuery.toLowerCase());
            const matchesEvent = selectedEventId === 'all' || m.vipEventId === selectedEventId;
            return matchesSearch && matchesEvent;
        });
    }, [memberships, searchQuery, selectedEventId]);

    const toggleSelectOne = (id: string) => {
        const newSet = new Set(selectedIds);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setSelectedIds(newSet);
    };

    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            const targetList = activeTab === 'members' ? filteredMembers : recoveryMembers;
            const allIds = targetList.map(m => m.id);
            setSelectedIds(new Set(allIds));
        } else {
            setSelectedIds(new Set());
        }
    };

    const handleCopy = (text: string) => {
        navigator.clipboard.writeText(text);
        alert("Código copiado!");
    };

    // FUNÇÕES DE DOWNLOAD EXCEL
    const handleDownloadXLSX = (mode: 'codes' | 'full') => {
        const listToExport = selectedIds.size > 0 
            ? filteredMembers.filter(m => selectedIds.has(m.id))
            : filteredMembers;

        if (listToExport.length === 0) return alert("Nenhum dado para exportar.");
        
        let ws;
        if (mode === 'codes') {
            // MODO SOMENTE CÓDIGOS: Cria um "Array of Arrays" (AOA)
            // Cada sub-array representa uma linha. Com um elemento por linha, fica tudo na Coluna A.
            const aoaData = listToExport
                .filter(m => m.benefitCode && m.benefitCode.trim() !== '')
                .map(m => [m.benefitCode]);

            if (aoaData.length === 0) return alert("Nenhum código gerado para exportar.");
            
            // Cria a planilha a partir do array bruto, sem cabeçalhos
            ws = window.XLSX.utils.aoa_to_sheet(aoaData);
        } else {
            // MODO DADOS COMPLETOS: Usa mapeamento de objeto para json_to_sheet (com cabeçalhos)
            const jsonData = listToExport.map(m => ({
                'NOME': m.promoterName,
                'E-MAIL': m.promoterEmail,
                'WHATSAPP': m.promoterWhatsapp || '',
                'INSTAGRAM': m.promoterInstagram || '',
                'CÓDIGO VIP': m.benefitCode || '',
                'EVENTO': m.vipEventName,
                'STATUS PGTO': m.status === 'confirmed' ? 'PAGO' : 'PENDENTE',
                'ATIVAÇÃO': m.isBenefitActive ? 'SIM' : 'NÃO',
                'DATA ADESÃO': m.submittedAt ? (m.submittedAt as any).toDate().toLocaleString('pt-BR') : ''
            }));
            ws = window.XLSX.utils.json_to_sheet(jsonData);
        }

        const wb = window.XLSX.utils.book_new();
        window.XLSX.utils.book_append_sheet(wb, ws, "Membros VIP");
        window.XLSX.writeFile(wb, `membros_vip_${mode === 'codes' ? 'codigos' : 'completo'}_${new Date().getTime()}.xlsx`);
    };

    const handleManualNotifySingle = async (membership: VipMembership) => {
        if (membership.status !== 'confirmed') return;
        setIsBulkProcessing(true);
        try {
            await updateVipMembership(membership.id, { isBenefitActive: true });
            await updatePromoter(membership.promoterId, { emocoesBenefitActive: true });
            const notifyActivation = httpsCallable(functions, 'notifyVipActivation');
            await notifyActivation({ membershipId: membership.id });
            alert("Sucesso!"); fetchData();
        } catch (e: any) { alert(e.message); } finally { setIsBulkProcessing(false); }
    };

    const handleBulkNotify = async () => {
        const toProcess = filteredMembers.filter(m => selectedIds.has(m.id) && m.status === 'confirmed');
        if (toProcess.length === 0) return alert("Selecione membros com pagamento PAGO.");
        
        if (!window.confirm(`Ativar e notificar ${toProcess.length} membros?`)) return;
        
        setIsBulkProcessing(true);
        try {
            const notifyActivation = httpsCallable(functions, 'notifyVipActivation');
            for (const m of toProcess) {
                await updateVipMembership(m.id, { isBenefitActive: true });
                await updatePromoter(m.promoterId, { emocoesBenefitActive: true });
                await notifyActivation({ membershipId: m.id });
            }
            alert("Processado com sucesso!");
            setSelectedIds(new Set());
            fetchData();
        } catch (e: any) { alert(e.message); } finally { setIsBulkProcessing(false); }
    };

    const handleBulkRecovery = async () => {
        const toProcess = recoveryMembers.filter(m => selectedIds.has(m.id));
        if (toProcess.length === 0) return alert("Selecione leads de carrinho abandonado.");
        
        if (!window.confirm(`Enviar e-mail de recuperação para ${toProcess.length} leads selecionados? Será gerado um novo Pix Mercado Pago para cada um.`)) return;
        
        setIsBulkProcessing(true);
        let successCount = 0;
        let failCount = 0;

        try {
            const createPix = httpsCallable(functions, 'createVipPixPayment');
            
            for (const m of toProcess) {
                try {
                    const event = vipEvents.find(e => e.id === m.vipEventId);
                    if (!event) continue;

                    const pixRes: any = await createPix({
                        vipEventId: m.vipEventId,
                        promoterId: m.promoterId,
                        email: m.promoterEmail,
                        name: m.promoterName,
                        whatsapp: m.promoterWhatsapp || "",
                        instagram: m.promoterInstagram || "",
                        amount: event.price
                    });

                    await sendVipRecoveryEmail(m.id, pixRes.data);
                    successCount++;
                } catch (err) {
                    console.error(`Erro ao processar recuperação de ${m.promoterName}:`, err);
                    failCount++;
                }
            }
            
            alert(`Processamento concluído!\nSucesso: ${successCount}\nFalhas: ${failCount}`);
            setSelectedIds(new Set());
            fetchData();
        } catch (e: any) { 
            alert("Erro fatal no processamento em massa."); 
        } finally { 
            setIsBulkProcessing(false); 
        }
    };

    const handleRecoveryEmail = async (m: VipMembership) => {
        const event = vipEvents.find(e => e.id === m.vipEventId);
        if (!event) return;

        if (!window.confirm(`Enviar e-mail de recuperação para ${m.promoterName}? Será gerado um novo Pix Mercado Pago.`)) return;
        
        setIsProcessingId(m.id);
        try {
            const createPix = httpsCallable(functions, 'createVipPixPayment');
            const pixRes: any = await createPix({
                vipEventId: m.vipEventId,
                promoterId: m.promoterId,
                email: m.promoterEmail,
                name: m.promoterName,
                whatsapp: m.promoterWhatsapp || "",
                instagram: m.promoterInstagram || "",
                amount: event.price
            });

            await sendVipRecoveryEmail(m.id, pixRes.data);
            alert("E-mail de recuperação enviado com sucesso!");
            fetchData();
        } catch (e: any) { alert("Erro: " + e.message); } finally { setIsProcessingId(null); }
    };

    const handleSaveEvent = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingEvent?.name || !editingEvent?.price) return;
        setIsBulkProcessing(true);
        try {
            const data = {
                name: editingEvent.name,
                price: Number(editingEvent.price),
                isActive: editingEvent.isActive ?? true,
                description: editingEvent.description || '',
                benefits: editingEvent.benefits || [],
                externalSlug: editingEvent.externalSlug || '',
                pixKey: editingEvent.pixKey || ''
            };
            if (editingEvent.id) await updateVipEvent(editingEvent.id, data);
            else await createVipEvent(data as any);
            setIsModalOpen(false);
            fetchData();
        } catch (e: any) { alert(e.message); } finally { setIsBulkProcessing(false); }
    };

    const handleDeleteEvent = async (id: string) => {
        if (!window.confirm("Excluir oferta VIP?")) return;
        try {
            await deleteVipEvent(id);
            fetchData();
        } catch (e: any) { alert(e.message); }
    };

    return (
        <div className="pb-40">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4 px-4 md:px-0">
                <h1 className="text-3xl font-black text-white uppercase tracking-tighter flex items-center gap-3">
                    <TicketIcon className="w-8 h-8 text-primary" /> Gestão Clube VIP
                </h1>
                <div className="flex flex-wrap gap-2">
                    {activeTab === 'members' && (
                        <>
                            <button onClick={() => window.open('/#/admin/vip-metrics/global', '_blank')} className="px-4 py-3 bg-indigo-900/30 text-indigo-400 border border-indigo-800 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 hover:bg-indigo-900/50">
                                <ChartBarIcon className="w-4 h-4" /> Relatório Público
                            </button>
                            <button onClick={() => handleDownloadXLSX('codes')} className="px-4 py-3 bg-gray-800 text-gray-300 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 hover:text-white">
                                <DownloadIcon className="w-4 h-4" /> Códigos (.xlsx)
                            </button>
                            <button onClick={() => handleDownloadXLSX('full')} className="px-4 py-3 bg-gray-800 text-gray-300 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 hover:text-white">
                                <DownloadIcon className="w-4 h-4" /> Dados Completos
                            </button>
                        </>
                    )}
                    {activeTab === 'events' && (
                        <button onClick={() => { setEditingEvent({ benefits: [], isActive: true }); setIsModalOpen(true); }} className="px-6 py-3 bg-primary text-white font-black rounded-2xl text-[10px] uppercase tracking-widest shadow-xl flex items-center justify-center gap-2">
                            <PlusIcon className="w-4 h-4" /> Novo Evento
                        </button>
                    )}
                    <button onClick={() => fetchData()} className="p-3 bg-gray-800 text-gray-400 rounded-2xl hover:text-white transition-colors">
                        <RefreshIcon className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`}/>
                    </button>
                </div>
            </div>

            <div className="flex bg-gray-800/50 p-1.5 rounded-2xl mb-8 border border-white/5 w-fit ml-4 md:ml-0 overflow-x-auto max-w-full">
                <button onClick={() => { setActiveTab('members'); setSelectedIds(new Set()); }} className={`px-6 py-3 text-xs font-black uppercase rounded-xl transition-all whitespace-nowrap ${activeTab === 'members' ? 'bg-primary text-white shadow-lg' : 'text-gray-400 hover:text-gray-200'}`}>Membros</button>
                <button onClick={() => { setActiveTab('recovery'); setSelectedIds(new Set()); }} className={`px-6 py-3 text-xs font-black uppercase rounded-xl transition-all whitespace-nowrap ${activeTab === 'recovery' ? 'bg-primary text-white shadow-lg' : 'text-gray-400 hover:text-gray-200'}`}>Recuperação de Carrinho</button>
                <button onClick={() => { setActiveTab('events'); setSelectedIds(new Set()); }} className={`px-6 py-3 text-xs font-black uppercase rounded-xl transition-all whitespace-nowrap ${activeTab === 'events' ? 'bg-primary text-white shadow-lg' : 'text-gray-400 hover:text-gray-200'}`}>Eventos / Ofertas</button>
            </div>

            {/* BARRA DE AÇÕES EM MASSA */}
            {selectedIds.size > 0 && (
                <div className="mx-4 md:mx-0 p-4 bg-primary rounded-2xl shadow-lg flex items-center justify-between animate-fadeIn sticky top-24 z-30 mb-6 border border-white/20">
                    <p className="text-white font-black text-xs uppercase tracking-widest">{selectedIds.size} selecionados</p>
                    <div className="flex gap-2">
                        {activeTab === 'members' && (
                            <button onClick={handleBulkNotify} disabled={isBulkProcessing} className="px-4 py-2 bg-white text-primary font-black text-[10px] uppercase rounded-xl hover:bg-gray-100 transition-colors">
                                {isBulkProcessing ? 'PROCESSANDO...' : 'ATIVAR E NOTIFICAR'}
                            </button>
                        )}
                        {activeTab === 'recovery' && (
                            <button onClick={handleBulkRecovery} disabled={isBulkProcessing} className="px-4 py-2 bg-white text-primary font-black text-[10px] uppercase rounded-xl hover:bg-gray-100 transition-colors">
                                {isBulkProcessing ? 'ENVIANDO...' : 'RECUPERAR SELECIONADOS (E-MAIL)'}
                            </button>
                        )}
                        <button onClick={() => setSelectedIds(new Set())} className="px-4 py-2 bg-black/20 text-white font-black text-[10px] uppercase rounded-xl">Cancelar</button>
                    </div>
                </div>
            )}

            {isLoading ? (
                <div className="flex justify-center py-20">
                    <RefreshIcon className="w-10 h-10 text-primary animate-spin" />
                </div>
            ) : (
                <div className="bg-secondary/60 backdrop-blur-xl rounded-[2.5rem] p-6 border border-white/5 shadow-2xl space-y-6">
                    
                    {/* ABA MEMBROS */}
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
                                    <input type="text" placeholder="BUSCAR NOME..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full pl-11 pr-4 py-3 bg-dark border border-gray-700 rounded-xl text-white text-[10px] font-black uppercase outline-none focus:border-primary" />
                                </div>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="bg-dark/50 text-[10px] font-black text-gray-500 uppercase tracking-widest border-b border-white/5">
                                            <th className="px-6 py-5 w-10 text-center">
                                                <input 
                                                    type="checkbox" 
                                                    onChange={handleSelectAll}
                                                    checked={filteredMembers.length > 0 && selectedIds.size === filteredMembers.length}
                                                    className="w-4 h-4 rounded border-gray-700 bg-dark text-primary focus:ring-0" 
                                                />
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
                                            <tr key={m.id} className={`hover:bg-white/[0.02] transition-colors ${selectedIds.has(m.id) ? 'bg-primary/5' : ''}`}>
                                                <td className="px-6 py-5 text-center">
                                                    <input 
                                                        type="checkbox" 
                                                        checked={selectedIds.has(m.id)}
                                                        onChange={() => toggleSelectOne(m.id)}
                                                        className="w-4 h-4 rounded border-gray-700 bg-dark text-primary focus:ring-0" 
                                                    />
                                                </td>
                                                <td className="px-6 py-5"><p className="text-sm font-black text-white uppercase truncate">{m.promoterName}</p><p className="text-[9px] text-primary font-black uppercase mt-1">{m.vipEventName}</p></td>
                                                <td className="px-6 py-5 text-center">{m.benefitCode ? <span onClick={() => handleCopy(m.benefitCode || '')} className="px-3 py-1 bg-dark text-primary border border-primary/30 rounded-lg font-mono text-xs font-black tracking-widest cursor-pointer hover:bg-primary/10">{m.benefitCode}</span> : <span className="text-gray-600 text-[10px] font-bold">---</span>}</td>
                                                <td className="px-6 py-5 text-center">{m.isBenefitActive ? <span className="px-2 py-0.5 rounded-full bg-green-900/40 text-green-400 border border-green-800 text-[8px] font-black uppercase tracking-widest">ATIVADO</span> : <span className="px-2 py-0.5 rounded-full bg-gray-800 text-gray-500 border border-gray-700 text-[8px] font-black uppercase tracking-widest">AGUARDANDO</span>}</td>
                                                <td className="px-6 py-5 text-center"><span className={`px-2 py-0.5 rounded-full border text-[8px] font-black uppercase ${m.status === 'confirmed' ? 'bg-green-900/40 text-green-400 border-green-800' : 'bg-orange-900/40 text-orange-400 border-orange-800'}`}>{m.status === 'confirmed' ? 'PAGO' : 'PENDENTE'}</span></td>
                                                <td className="px-6 py-5 text-right">
                                                    {m.status === 'confirmed' && <button onClick={() => handleManualNotifySingle(m)} disabled={isBulkProcessing} className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-[9px] font-black uppercase hover:bg-indigo-500">{m.isBenefitActive ? 'REENVIAR' : 'ATIVAR'}</button>}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}

                    {/* ABA RECUPERAÇÃO */}
                    {activeTab === 'recovery' && (
                        <>
                            <div className="flex flex-col md:flex-row gap-4">
                                <select value={selectedEventId} onChange={e => setSelectedEventId(e.target.value)} className="bg-dark border border-gray-700 text-white px-4 py-3 rounded-xl text-[10px] font-black uppercase outline-none focus:border-primary w-full md:w-64">
                                    <option value="all">TODOS EVENTOS</option>
                                    {vipEvents.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                                </select>
                                <div className="relative flex-grow">
                                    <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                                    <input type="text" placeholder="BUSCAR POR NOME OU E-MAIL..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full pl-11 pr-4 py-3 bg-dark border border-gray-700 rounded-xl text-white text-[10px] font-black uppercase outline-none focus:border-primary" />
                                </div>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="bg-dark/50 text-[10px] font-black text-gray-500 uppercase tracking-widest border-b border-white/5">
                                            <th className="px-6 py-5 w-10 text-center">
                                                <input 
                                                    type="checkbox" 
                                                    onChange={handleSelectAll}
                                                    checked={recoveryMembers.length > 0 && selectedIds.size === recoveryMembers.length}
                                                    className="w-4 h-4 rounded border-gray-700 bg-dark text-primary focus:ring-0" 
                                                />
                                            </th>
                                            <th className="px-6 py-5">Potencial Membro</th>
                                            <th className="px-6 py-5">WhatsApp</th>
                                            <th className="px-6 py-5">Data Tentativa</th>
                                            <th className="px-6 py-5 text-right">Recuperar</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5">
                                        {recoveryMembers.map(m => (
                                            <tr key={m.id} className={`hover:bg-white/[0.02] transition-colors ${selectedIds.has(m.id) ? 'bg-primary/5' : ''}`}>
                                                <td className="px-6 py-5 text-center">
                                                    <input 
                                                        type="checkbox" 
                                                        checked={selectedIds.has(m.id)}
                                                        onChange={() => toggleSelectOne(m.id)}
                                                        className="w-4 h-4 rounded border-gray-700 bg-dark text-primary focus:ring-0" 
                                                    />
                                                </td>
                                                <td className="px-6 py-5"><p className="text-sm font-black text-white uppercase truncate">{m.promoterName}</p><p className="text-[9px] text-primary font-black uppercase mt-1">{m.vipEventName}</p></td>
                                                <td className="px-6 py-5 text-sm text-gray-400 font-mono">{m.promoterWhatsapp || '---'}</td>
                                                <td className="px-6 py-5 text-xs text-gray-500">{m.submittedAt ? (m.submittedAt as any).toDate().toLocaleDateString('pt-BR') : '---'}</td>
                                                <td className="px-6 py-5 text-right">
                                                    <button 
                                                        onClick={() => handleRecoveryEmail(m)} 
                                                        disabled={isProcessingId === m.id}
                                                        className="px-4 py-2 bg-blue-600 text-white rounded-xl text-[9px] font-black uppercase hover:bg-blue-500 flex items-center gap-2"
                                                    >
                                                        {isProcessingId === m.id ? <RefreshIcon className="w-3 h-3 animate-spin"/> : <MailIcon className="w-3 h-3" />} E-MAIL COM NOVO PIX
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                        {recoveryMembers.length === 0 && (
                                            <tr><td colSpan={5} className="text-center py-20 text-gray-500 font-black uppercase text-xs tracking-widest">Nenhum carrinho abandonado encontrado.</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}

                    {/* ABA EVENTOS */}
                    {activeTab === 'events' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {vipEvents.map(ev => (
                                <div key={ev.id} className="bg-dark/40 p-6 rounded-3xl border border-white/5 flex flex-col group hover:border-primary transition-all">
                                    <div className="flex justify-between items-start mb-4">
                                        <div>
                                            <h3 className="text-xl font-black text-white uppercase truncate">{ev.name}</h3>
                                            <p className="text-primary font-black text-lg mt-1">R$ {ev.price.toFixed(2)}</p>
                                        </div>
                                        <div className={`w-3 h-3 rounded-full ${ev.isActive ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]' : 'bg-red-500'}`}></div>
                                    </div>
                                    <div className="flex-grow space-y-2 mb-6">
                                        <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest">Benefícios:</p>
                                        {ev.benefits.map((b, i) => (
                                            <p key={i} className="text-xs text-gray-300 flex items-center gap-2"><CheckCircleIcon className="w-3 h-3 text-primary" /> {b}</p>
                                        ))}
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={() => { setEditingEvent(ev); setIsModalOpen(true); }} className="flex-1 py-3 bg-gray-800 text-white font-black text-[10px] uppercase rounded-xl hover:bg-gray-700 transition-all border border-white/5">Editar</button>
                                        <button onClick={() => handleDeleteEvent(ev.id)} className="p-3 bg-red-900/30 text-red-500 rounded-xl border border-red-500/20 hover:bg-red-900/50"><TrashIcon className="w-4 h-4"/></button>
                                    </div>
                                </div>
                            ))}
                            {vipEvents.length === 0 && (
                                <div className="col-span-full py-20 text-center text-gray-500 font-black uppercase text-xs tracking-widest">Nenhuma oferta VIP cadastrada.</div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* MODAL DE EVENTO VIP */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[110] flex items-center justify-center p-6" onClick={() => setIsModalOpen(false)}>
                    <div className="bg-secondary w-full max-w-2xl p-8 rounded-[2.5rem] border border-white/10 shadow-2xl flex flex-col max-h-[85vh]" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-2xl font-black text-white uppercase tracking-tighter">{editingEvent?.id ? 'Editar Evento VIP' : 'Novo Evento VIP'}</h2>
                            <button onClick={() => setIsModalOpen(false)} className="p-2 text-gray-500 hover:text-white"><XIcon className="w-6 h-6"/></button>
                        </div>

                        <form onSubmit={handleSaveEvent} className="flex-grow overflow-y-auto space-y-6 pr-2 custom-scrollbar">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-gray-500 uppercase ml-1">Nome do Evento</label>
                                    <input type="text" value={editingEvent?.name || ''} onChange={e => setEditingEvent({...editingEvent!, name: e.target.value})} className="w-full bg-dark border border-gray-700 rounded-xl p-3 text-white font-bold" required />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-gray-500 uppercase ml-1">Preço (R$)</label>
                                    <input type="number" step="0.01" value={editingEvent?.price || ''} onChange={e => setEditingEvent({...editingEvent!, price: Number(e.target.value)})} className="w-full bg-dark border border-gray-700 rounded-xl p-3 text-white font-bold" required />
                                </div>
                            </div>

                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-gray-500 uppercase ml-1">Slug Externo (Site ST Ingressos)</label>
                                <input type="text" value={editingEvent?.externalSlug || ''} onChange={e => setEditingEvent({...editingEvent!, externalSlug: e.target.value})} placeholder="ex: emocoes-sunset" className="w-full bg-dark border border-gray-700 rounded-xl p-3 text-white font-bold" />
                            </div>

                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-gray-500 uppercase ml-1">Benefícios (Um por linha)</label>
                                <textarea rows={4} value={editingEvent?.benefits?.join('\n') || ''} onChange={e => setEditingEvent({...editingEvent!, benefits: e.target.value.split('\n')})} className="w-full bg-dark border border-gray-700 rounded-xl p-3 text-white text-sm" />
                            </div>

                            <label className="flex items-center gap-3 cursor-pointer">
                                <input type="checkbox" checked={editingEvent?.isActive || false} onChange={e => setEditingEvent({...editingEvent!, isActive: e.target.checked})} className="w-5 h-5 rounded border-gray-600 bg-dark text-primary" />
                                <span className="text-[10px] font-black text-gray-300 uppercase tracking-widest">Oferta Ativa no Site</span>
                            </label>

                            <button type="submit" disabled={isBulkProcessing} className="w-full py-5 bg-primary text-white font-black rounded-2xl shadow-xl uppercase text-xs tracking-widest disabled:opacity-50">
                                {isBulkProcessing ? 'SALVANDO...' : 'CONFIRMAR E SALVAR'}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminClubVip;
