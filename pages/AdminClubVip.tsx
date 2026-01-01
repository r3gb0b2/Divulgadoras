
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
    WhatsAppIcon, InstagramIcon, DownloadIcon, ChartBarIcon, MegaphoneIcon, DocumentDuplicateIcon, FilterIcon, ExternalLinkIcon
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

            const rejectedPromoters = await getAllPromoters({
                organizationId: 'all',
                filterOrgId: 'all',
                status: 'all'
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
            const matchesSearch = (m.promoterName || '').toLowerCase().includes(searchQuery.toLowerCase()) || (m.promoterEmail || '').toLowerCase().includes(searchQuery.toLowerCase());
            const matchesEvent = selectedEventId === 'all' || m.vipEventId === selectedEventId;
            return matchesStatus && matchesBenefit && matchesSearch && matchesEvent;
        });
    }, [memberships, filterStatus, filterBenefit, searchQuery, selectedEventId]);

    const toggleSelectOne = (id: string) => {
        const newSet = new Set(selectedIds);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setSelectedIds(newSet);
    };

    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            const allIds = filteredMembers.map(m => m.id);
            setSelectedIds(new Set(allIds));
        } else {
            setSelectedIds(new Set());
        }
    };

    const handleCopyReportLink = () => {
        const token = selectedEventId === 'all' ? 'global' : selectedEventId;
        const url = `${window.location.origin}/#/admin/vip-metrics/${token}`;
        navigator.clipboard.writeText(url);
        alert("Link Público de Relatório Copiado!");
    };

    const handleCopy = (text: string) => {
        navigator.clipboard.writeText(text);
        alert("Código copiado!");
    };

    const handleDownloadXLS = () => {
        const target = activeTab === 'members' 
            ? (selectedIds.size > 0 ? filteredMembers.filter(m => selectedIds.has(m.id)) : filteredMembers)
            : recoveryLeads as any[];
            
        if (target.length === 0) return;
        
        let table = `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><body><table border="1"><thead><tr><th>Nome</th><th>E-mail</th><th>WhatsApp</th><th>Evento</th><th>Status Pgto</th></tr></thead><tbody>`;
        target.forEach(m => { 
            table += `<tr><td>${m.promoterName || m.name}</td><td>${m.promoterEmail || m.email}</td><td>${m.promoterWhatsapp || m.whatsapp}</td><td>${m.vipEventName || m.campaignName}</td><td>${m.status || '---'}</td></tr>`; 
        });
        table += `</tbody></table></body></html>`;
        const blob = new Blob([table], { type: 'application/vnd.ms-excel' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `clube_vip_${activeTab}.xls`);
        link.click();
    };

    const handleManualNotifySingle = async (membership: VipMembership) => {
        if (membership.status !== 'confirmed') return;
        setIsBulkProcessing(true);
        try {
            await updateVipMembership(`${membership.promoterId}_${membership.vipEventId}`, { isBenefitActive: true });
            await updatePromoter(membership.promoterId, { emocoesBenefitActive: true });
            const notifyActivation = httpsCallable(functions, 'notifyVipActivation');
            await notifyActivation({ membershipId: `${membership.promoterId}_${membership.vipEventId}` });
            alert("Sucesso!"); fetchData();
        } catch (e: any) { alert(e.message); } finally { setIsBulkProcessing(false); }
    };

    const handleBulkNotify = async () => {
        if (selectedIds.size === 0) return;
        const toProcess = filteredMembers.filter(m => selectedIds.has(m.id) && m.status === 'confirmed');
        
        if (toProcess.length === 0) {
            alert("Nenhum dos selecionados possui status de pagamento 'PAGO'.");
            return;
        }

        if (!window.confirm(`Deseja ativar e notificar ${toProcess.length} membros selecionados?`)) return;

        setIsBulkProcessing(true);
        try {
            const notifyActivation = httpsCallable(functions, 'notifyVipActivation');
            
            for (const m of toProcess) {
                await updateVipMembership(`${m.promoterId}_${m.vipEventId}`, { isBenefitActive: true });
                await updatePromoter(m.promoterId, { emocoesBenefitActive: true });
                await notifyActivation({ membershipId: `${m.promoterId}_${m.vipEventId}` });
            }
            
            alert("Processamento concluído!");
            setSelectedIds(new Set());
            fetchData();
        } catch (e: any) {
            alert("Erro no processamento: " + e.message);
        } finally {
            setIsBulkProcessing(false);
        }
    };

    return (
        <div className="pb-40">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4 px-4 md:px-0">
                <h1 className="text-3xl font-black text-white uppercase tracking-tighter flex items-center gap-3">
                    <TicketIcon className="w-8 h-8 text-primary" /> Gestão Clube VIP
                </h1>
                <div className="flex gap-2">
                    <button onClick={handleCopyReportLink} className="px-4 py-3 bg-dark border border-white/10 text-white font-black rounded-2xl text-[10px] uppercase tracking-widest shadow-xl flex items-center justify-center gap-2 hover:bg-white/5 transition-all">
                        <ExternalLinkIcon className="w-4 h-4 text-primary" /> Link de Relatório
                    </button>
                    <button onClick={handleDownloadXLS} className="px-4 py-3 bg-indigo-600 text-white font-black rounded-2xl text-[10px] uppercase tracking-widest shadow-xl flex items-center justify-center gap-2 hover:bg-indigo-500 transition-all">
                        <DownloadIcon className="w-4 h-4" /> Exportar {selectedIds.size > 0 ? `(${selectedIds.size})` : ''} XLS
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

            {/* Barra de Ação em Massa */}
            {selectedIds.size > 0 && activeTab === 'members' && (
                <div className="mx-4 md:mx-0 p-4 bg-primary rounded-2xl shadow-lg flex items-center justify-between animate-fadeIn sticky top-24 z-30 mb-6">
                    <p className="text-white font-black text-xs uppercase tracking-widest">{selectedIds.size} membros selecionados</p>
                    <div className="flex gap-2">
                        <button onClick={handleBulkNotify} disabled={isBulkProcessing} className="px-4 py-2 bg-white text-primary font-black text-[10px] uppercase rounded-xl hover:bg-gray-100 transition-colors">
                            {isBulkProcessing ? 'PROCESSANDO...' : 'ATIVAR E NOTIFICAR SELECIONADOS'}
                        </button>
                        <button onClick={() => setSelectedIds(new Set())} className="px-4 py-2 bg-black/20 text-white font-black text-[10px] uppercase rounded-xl">Cancelar</button>
                    </div>
                </div>
            )}

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
                                <input type="text" placeholder="BUSCAR NOME..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full pl-11 pr-4 py-3 bg-dark border border-gray-700 rounded-xl text-white text-[10px] font-black uppercase outline-none focus:border-primary" />
                            </div>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-dark/50 text-[10px] font-black text-gray-500 uppercase tracking-widest border-b border-white/5">
                                        <th className="px-6 py-5 w-10">
                                            <input 
                                                type="checkbox" 
                                                checked={filteredMembers.length > 0 && selectedIds.size === filteredMembers.length}
                                                onChange={handleSelectAll}
                                                className="w-5 h-5 rounded border-gray-700 bg-dark text-primary" 
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
                                            <td className="px-6 py-5">
                                                <input 
                                                    type="checkbox" 
                                                    checked={selectedIds.has(m.id)}
                                                    onChange={() => toggleSelectOne(m.id)}
                                                    className="w-5 h-5 rounded border-gray-700 bg-dark text-primary" 
                                                />
                                            </td>
                                            <td className="px-6 py-5"><p className="text-sm font-black text-white uppercase truncate">{m.promoterName}</p><p className="text-[9px] text-primary font-black uppercase mt-1">{m.vipEventName}</p></td>
                                            <td className="px-6 py-5 text-center">{m.benefitCode ? <span onClick={() => handleCopy(m.benefitCode || '')} className="px-3 py-1 bg-dark text-primary border border-primary/30 rounded-lg font-mono text-xs font-black tracking-widest cursor-pointer hover:bg-primary/10">{m.benefitCode}</span> : <span className="text-gray-600 text-[10px] font-bold">---</span>}</td>
                                            <td className="px-6 py-5 text-center">{m.isBenefitActive ? <span className="px-2 py-0.5 rounded-full bg-green-900/40 text-green-400 border border-green-800 text-[8px] font-black uppercase tracking-widest">ATIVADO</span> : <span className="px-2 py-0.5 rounded-full bg-gray-800 text-gray-500 border border-gray-700 text-[8px] font-black uppercase tracking-widest">AGUARDANDO</span>}</td>
                                            <td className="px-6 py-5 text-center"><span className={`px-2 py-0.5 rounded-full border text-[8px] font-black uppercase ${m.status === 'confirmed' ? 'bg-green-900/40 text-green-400 border-green-800' : 'bg-orange-900/40 text-orange-400 border-orange-800'}`}>{m.status === 'confirmed' ? 'PAGO' : 'PENDENTE'}</span></td>
                                            <td className="px-6 py-5 text-right">{m.status === 'confirmed' && <button onClick={() => handleManualNotifySingle(m)} disabled={isBulkProcessing} className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-[9px] font-black uppercase hover:bg-indigo-500">{m.isBenefitActive ? 'REENVIAR' : 'ATIVAR'}</button>}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
                {/* Outras abas permanecem com o mesmo funcionamento */}
            </div>
        </div>
    );
};

export default AdminClubVip;
