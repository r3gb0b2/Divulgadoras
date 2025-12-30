
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
import { updatePromoter } from '../services/promoterService';
import { getOrganizations } from '../services/organizationService';
import { VipMembership, VipEvent, Organization } from '../types';
import { functions } from '../firebase/config';
import { httpsCallable } from 'firebase/functions';
import { 
    ArrowLeftIcon, SearchIcon, CheckCircleIcon, XIcon, 
    TicketIcon, RefreshIcon, ClockIcon, UserIcon,
    BuildingOfficeIcon, PlusIcon, TrashIcon, PencilIcon, AlertTriangleIcon,
    WhatsAppIcon, InstagramIcon, DownloadIcon, ChartBarIcon, MegaphoneIcon, DocumentDuplicateIcon
} from '../components/Icons';

const AdminClubVip: React.FC = () => {
    const navigate = useNavigate();
    const { adminData, loading: authLoading } = useAdminAuth();
    
    const [activeTab, setActiveTab] = useState<'members' | 'events'>('members');
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
        } catch (e) {
            console.error("Erro ao carregar dados VIP:", e);
        } finally {
            setIsLoading(false);
        }
    }, [selectedEventId, isSuperAdmin]);

    useEffect(() => {
        if (!authLoading) fetchData();
    }, [authLoading, fetchData]);

    // --- FILTROS ---
    const filteredMembers = useMemo(() => {
        return memberships.filter(m => {
            const matchesStatus = filterStatus === 'all' || m.status === filterStatus;
            const matchesBenefit = filterBenefit === 'all' || 
                (filterBenefit === 'active' && m.isBenefitActive === true) ||
                (filterBenefit === 'waiting' && m.isBenefitActive === false && m.status === 'confirmed');
            
            const matchesSearch = 
                (m.promoterName || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
                (m.promoterEmail || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                (m.promoterWhatsapp || '').includes(searchQuery) ||
                (m.benefitCode || '').toLowerCase().includes(searchQuery.toLowerCase());
            
            const matchesEvent = selectedEventId === 'all' || m.vipEventId === selectedEventId;
            
            return matchesStatus && matchesBenefit && matchesSearch && matchesEvent;
        });
    }, [memberships, filterStatus, filterBenefit, searchQuery, selectedEventId]);

    // --- DASHBOARD DE FATURAMENTO ---
    const financialStats = useMemo(() => {
        const confirmed = memberships.filter(m => m.status === 'confirmed');
        const pending = memberships.filter(m => m.status === 'pending');
        const priceMap = vipEvents.reduce((acc, e) => ({...acc, [e.id]: e.price}), {} as Record<string, number>);
        
        const totalBilled = confirmed.reduce((acc, m) => acc + (priceMap[m.vipEventId] || 0), 0);
        const totalPending = pending.reduce((acc, m) => acc + (priceMap[m.vipEventId] || 0), 0);
        
        return {
            totalBilled,
            totalPending,
            confirmedCount: confirmed.length,
            pendingCount: pending.length,
            waitingActivation: confirmed.filter(m => !m.isBenefitActive).length
        };
    }, [memberships, vipEvents]);

    // --- AÇÕES DE NOTIFICAÇÃO ---
    const handleManualNotifySingle = async (membership: VipMembership) => {
        if (membership.status !== 'confirmed') return;
        
        const btn = document.getElementById(`notify-btn-${membership.id}`);
        if(btn) btn.classList.add('animate-spin');

        try {
            // No banco, o ID do documento é "promoterId_vipEventId"
            const docId = `${membership.promoterId}_${membership.vipEventId}`;
            
            await updateVipMembership(docId, { isBenefitActive: true });
            await updatePromoter(membership.promoterId, { emocoesBenefitActive: true });
            
            const notifyActivation = httpsCallable(functions, 'notifyVipActivation');
            const result: any = await notifyActivation({ membershipId: docId });

            if (result.data?.success) {
                alert(`Sucesso! E-mail enviado para ${membership.promoterName}`);
            } else {
                alert(`Aviso: Cupom ativado no painel, mas o disparo de e-mail retornou: ${result.data?.error || 'Erro desconhecido'}`);
            }
            await fetchData();
        } catch (e: any) {
            alert(`Falha técnica ao processar: ${e.message}`);
        } finally {
            if(btn) btn.classList.remove('animate-spin');
        }
    };

    const handleBulkNotify = async () => {
        if (selectedIds.size === 0) return;
        if (!window.confirm(`Enviar e-mail de acesso para ${selectedIds.size} membros selecionados?`)) return;
        
        setIsBulkProcessing(true);
        try {
            const notifyActivation = httpsCallable(functions, 'notifyVipActivation');
            let successCount = 0;

            for (const id of Array.from(selectedIds)) {
                const m = memberships.find(item => item.id === id);
                if (m) {
                    const docId = `${m.promoterId}_${m.vipEventId}`;
                    await updateVipMembership(docId, { isBenefitActive: true });
                    await updatePromoter(m.promoterId, { emocoesBenefitActive: true });
                    await notifyActivation({ membershipId: docId });
                    successCount++;
                }
            }

            setSelectedIds(new Set());
            await fetchData();
            alert(`Operação concluída! ${successCount} ativações processadas.`);
        } catch (e) {
            alert("Erro ao processar notificações em massa.");
        } finally {
            setIsBulkProcessing(false);
        }
    };

    // --- DOWNLOAD DE CÓDIGOS (CSV PARA IMPORTAÇÃO) ---
    const handleDownloadCodesCSV = () => {
        const target = selectedIds.size > 0 ? Array.from(selectedIds).map(id => memberships.find(m => m.id === id)).filter(Boolean) : filteredMembers.filter(m => m.status === 'confirmed');
        
        if (target.length === 0) {
            alert("Nenhum código para exportar.");
            return;
        }

        const headers = ["Nome", "E-mail", "WhatsApp", "Evento VIP", "Cupom/Código"];
        const rows = target.map(m => `"${m!.promoterName}","${m!.promoterEmail}","${m!.promoterWhatsapp || ''}","${m!.vipEventName}","${m!.benefitCode || ''}"`);
        const csv = [headers.join(','), ...rows].join('\n');
        
        const blob = new Blob(["\ufeff" + csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `cupons_clube_vip_${new Date().getTime()}.csv`;
        link.click();
    };

    // --- DOWNLOAD RELATÓRIO FINANCEIRO (PDF) ---
    const handleDownloadFinancialPDF = () => {
        const confirmed = memberships.filter(m => m.status === 'confirmed');
        const priceMap = vipEvents.reduce((acc, e) => ({...acc, [e.id]: e.price}), {} as Record<string, number>);
        const now = new Date().toLocaleString('pt-BR');

        const printWindow = window.open('', '_blank');
        if (!printWindow) return;

        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Relatório Financeiro Clube VIP</title>
                <style>
                    body { font-family: 'Inter', -apple-system, sans-serif; color: #1a1a1a; padding: 40px; margin: 0; background: #fff; }
                    .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 4px solid #7e39d5; padding-bottom: 20px; margin-bottom: 30px; }
                    .logo-area h1 { margin: 0; font-size: 24px; text-transform: uppercase; letter-spacing: -1px; }
                    .logo-area span { color: #7e39d5; }
                    .report-info { text-align: right; font-size: 10px; color: #666; text-transform: uppercase; font-weight: bold; }
                    
                    .stats-grid { display: grid; grid-template-cols: repeat(3, 1fr); gap: 20px; margin-bottom: 40px; }
                    .stat-card { background: #f9f9fb; border: 1px solid #eee; padding: 20px; border-radius: 15px; }
                    .stat-card label { display: block; font-size: 9px; font-weight: 800; color: #999; text-transform: uppercase; margin-bottom: 5px; }
                    .stat-card .value { font-size: 22px; font-weight: 900; color: #1a1a1a; }
                    .stat-card .value.green { color: #16a34a; }

                    table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 10px; }
                    th { background: #f4f4f7; padding: 12px 10px; text-align: left; text-transform: uppercase; font-weight: 800; color: #555; border-bottom: 2px solid #eee; }
                    td { padding: 10px; border-bottom: 1px solid #eee; color: #333; }
                    tr:nth-child(even) { background-color: #fafafa; }
                    .footer-table { background: #7e39d5 !important; color: #fff !important; font-weight: bold; font-size: 14px; }
                    .footer-table td { color: #fff; border: none; padding: 20px; }
                    
                    @media print {
                        .no-print { display: none; }
                        body { padding: 0; }
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <div class="logo-area"><h1>EQUIPE <span>CERTA</span></h1><p style="margin:0; font-size:10px; font-weight:bold; color:#7e39d5;">CONTROLE FINANCEIRO CLUBE VIP</p></div>
                    <div class="report-info">Gerado em: ${now}<br>Status: Pagamentos Confirmados</div>
                </div>

                <div class="stats-grid">
                    <div class="stat-card"><label>Total Bruto</label><div class="value green">R$ ${financialStats.totalBilled.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div></div>
                    <div class="stat-card"><label>Vendas Confirmadas</label><div class="value">${financialStats.confirmedCount}</div></div>
                    <div class="stat-card"><label>Ticket Médio</label><div class="value">R$ ${(financialStats.totalBilled / (financialStats.confirmedCount || 1)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div></div>
                </div>

                <table>
                    <thead>
                        <tr>
                            <th>Data</th>
                            <th>Evento VIP</th>
                            <th>Cliente</th>
                            <th>ID Transação</th>
                            <th>Cupom Gerado</th>
                            <th>Valor (R$)</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${confirmed.map(m => `
                            <tr>
                                <td>${(m.submittedAt as any)?.toDate?.().toLocaleDateString('pt-BR')}</td>
                                <td style="font-weight:bold;">${m.vipEventName}</td>
                                <td>${m.promoterName}</td>
                                <td style="font-family:monospace; color:#666;">${m.paymentId || 'MANUAL'}</td>
                                <td style="font-family:monospace; font-weight:bold; color:#7e39d5;">${m.benefitCode || '---'}</td>
                                <td style="font-weight:bold;">${(priceMap[m.vipEventId] || 0).toFixed(2).replace('.', ',')}</td>
                            </tr>
                        `).join('')}
                        <tr class="footer-table">
                            <td colspan="5" style="text-align:right;">TOTAL ACUMULADO:</td>
                            <td>R$ ${financialStats.totalBilled.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                        </tr>
                    </tbody>
                </table>
                
                <p style="text-align:center; font-size:9px; color:#aaa; margin-top:50px; text-transform:uppercase; font-weight:bold; letter-spacing:2px;">
                    Relatório gerado automaticamente pelo sistema de gestão Equipe Certa.
                </p>

                <script>
                    window.onload = function() { window.print(); }
                </script>
            </body>
            </html>
        `;

        printWindow.document.write(html);
        printWindow.document.close();
    };

    const handleToggleSelectOne = (m: VipMembership) => {
        const newSet = new Set(selectedIds);
        if (newSet.has(m.id)) newSet.delete(m.id);
        else newSet.add(m.id);
        setSelectedIds(newSet);
    };

    const handleToggleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            const selectableIds = filteredMembers
                .filter(m => m.status === 'confirmed')
                .map(m => m.id);
            setSelectedIds(new Set(selectableIds));
        } else {
            setSelectedIds(new Set());
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

    const handleDeleteEvent = async (id: string) => {
        if (!window.confirm("Excluir este evento VIP?")) return;
        try {
            await deleteVipEvent(id);
            await fetchData();
        } catch (e) { alert("Erro ao deletar."); }
    };

    const formatDate = (ts: any) => {
        if (!ts) return 'N/A';
        const d = ts.toDate ? ts.toDate() : new Date(ts);
        return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    };

    return (
        <div className="pb-40">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4 px-4 md:px-0">
                <div>
                    <h1 className="text-3xl font-black text-white uppercase tracking-tighter flex items-center gap-3 leading-none">
                        <TicketIcon className="w-8 h-8 text-primary" />
                        Gestão Clube VIP
                    </h1>
                </div>
                <div className="flex flex-wrap gap-2 w-full md:w-auto">
                    <button onClick={handleDownloadCodesCSV} className="flex-1 md:flex-none px-4 py-3 bg-indigo-600 text-white font-black rounded-2xl text-[10px] uppercase tracking-widest shadow-xl flex items-center justify-center gap-2 hover:bg-indigo-500 transition-all">
                        <DocumentDuplicateIcon className="w-4 h-4" /> Exportar Cupons
                    </button>
                    <button onClick={handleDownloadFinancialPDF} className="flex-1 md:flex-none px-4 py-3 bg-white text-dark font-black rounded-2xl text-[10px] uppercase tracking-widest shadow-xl flex items-center justify-center gap-2 hover:bg-gray-100 transition-all">
                        <ChartBarIcon className="w-4 h-4" /> Baixar PDF Financeiro
                    </button>
                    {activeTab === 'events' && (
                        <button onClick={() => { setEditingEvent({ benefits: [] }); setIsModalOpen(true); }} className="flex-1 md:flex-none px-6 py-3 bg-primary text-white font-black rounded-2xl text-[10px] uppercase tracking-widest shadow-xl flex items-center justify-center gap-2">
                            <PlusIcon className="w-4 h-4" /> Novo Evento
                        </button>
                    )}
                    <button onClick={() => fetchData()} className="p-3 bg-gray-800 text-gray-400 rounded-2xl hover:text-white transition-colors">
                        <RefreshIcon className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`}/>
                    </button>
                </div>
            </div>

            {/* DASHBOARD CARDS */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8 px-4 md:px-0">
                <div className="bg-secondary/60 border border-white/5 p-6 rounded-[2rem] shadow-xl">
                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Total Faturado (Pago)</p>
                    <p className="text-3xl font-black text-green-400">R$ {financialStats.totalBilled.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                    <p className="text-[10px] text-gray-600 font-bold mt-2 uppercase">{financialStats.confirmedCount} vendas confirmadas</p>
                </div>
                <div className="bg-secondary/60 border border-white/5 p-6 rounded-[2rem] shadow-xl">
                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Pendente (Iniciado)</p>
                    <p className="text-3xl font-black text-orange-400">R$ {financialStats.totalPending.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                    <p className="text-[10px] text-gray-600 font-bold mt-2 uppercase">{financialStats.pendingCount} carrinhos abertos</p>
                </div>
                <div className="bg-secondary/60 border border-white/5 p-6 rounded-[2rem] shadow-xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-10"><ClockIcon className="w-12 h-12 text-primary" /></div>
                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Aguardando Ativação</p>
                    <p className="text-3xl font-black text-white">{financialStats.waitingActivation}</p>
                    <p className="text-[10px] text-primary font-bold mt-2 uppercase">Membros com cupom pendente</p>
                </div>
                <div className="bg-secondary/60 border border-white/5 p-6 rounded-[2rem] shadow-xl">
                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Taxa de Conversão</p>
                    <p className="text-3xl font-black text-primary">
                        {financialStats.confirmedCount + financialStats.pendingCount > 0 
                            ? Math.round((financialStats.confirmedCount / (financialStats.confirmedCount + financialStats.pendingCount)) * 100) 
                            : 0}%
                    </p>
                    <p className="text-[10px] text-gray-600 font-bold mt-2 uppercase">Cliques vs Vendas</p>
                </div>
            </div>

            <div className="flex bg-gray-800/50 p-1.5 rounded-2xl mb-8 border border-white/5 w-fit ml-4 md:ml-0">
                <button onClick={() => setActiveTab('members')} className={`px-6 py-3 text-xs font-black uppercase rounded-xl transition-all ${activeTab === 'members' ? 'bg-primary text-white shadow-lg' : 'text-gray-400 hover:text-gray-200'}`}>Membros ({memberships.length})</button>
                <button onClick={() => setActiveTab('events')} className={`px-6 py-3 text-xs font-black uppercase rounded-xl transition-all ${activeTab === 'events' ? 'bg-primary text-white shadow-lg' : 'text-gray-400 hover:text-gray-200'}`}>Ofertas VIP ({vipEvents.length})</button>
            </div>

            <div className="bg-secondary/60 backdrop-blur-xl rounded-[2.5rem] p-6 border border-white/5 shadow-2xl space-y-6">
                {activeTab === 'members' ? (
                    <>
                        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
                            <select value={selectedEventId} onChange={e => setSelectedEventId(e.target.value)} className="bg-dark border border-gray-700 text-white px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest focus:ring-1 focus:ring-primary outline-none">
                                <option value="all">TODOS EVENTOS</option>
                                {vipEvents.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                            </select>
                            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as any)} className="bg-dark border border-gray-700 text-white px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest focus:ring-1 focus:ring-primary outline-none">
                                <option value="all">STATUS: TODOS</option>
                                <option value="confirmed">SOMENTE PAGOS</option>
                                <option value="pending">SOMENTE PENDENTES</option>
                            </select>
                            <select value={filterBenefit} onChange={e => setFilterBenefit(e.target.value as any)} className="bg-dark border border-gray-700 text-white px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest focus:ring-1 focus:ring-primary outline-none">
                                <option value="all">CORTESIA: TODAS</option>
                                <option value="waiting">PAGO E NÃO ENVIADO</option>
                                <option value="active">JÁ ENVIADOS</option>
                            </select>
                            <div className="relative">
                                <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                                <input 
                                    type="text" placeholder="BUSCAR NOME OU CÓDIGO..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                                    className="w-full pl-11 pr-4 py-3 bg-dark border border-gray-700 rounded-2xl text-white text-xs font-black uppercase focus:ring-1 focus:ring-primary outline-none"
                                />
                            </div>
                        </div>

                        {selectedIds.size > 0 && (
                            <div className="p-4 bg-primary rounded-2xl flex justify-between items-center animate-fadeIn shadow-lg shadow-primary/20">
                                <p className="text-white font-black text-xs uppercase tracking-widest">{selectedIds.size} membros selecionados</p>
                                <button onClick={handleBulkNotify} disabled={isBulkProcessing} className="px-6 py-2 bg-white text-primary font-black rounded-xl text-[10px] uppercase hover:bg-gray-100 transition-all">
                                    {isBulkProcessing ? 'ENVIANDO...' : 'ATIVAR E NOTIFICAR TODOS'}
                                </button>
                            </div>
                        )}

                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-dark/50 text-[10px] font-black text-gray-500 uppercase tracking-widest border-b border-white/5">
                                        <th className="px-6 py-5 w-10">
                                            <input type="checkbox" checked={filteredMembers.length > 0 && selectedIds.size === filteredMembers.filter(m => m.status === 'confirmed').length} onChange={handleToggleSelectAll} className="w-5 h-5 rounded border-gray-700 bg-dark text-primary focus:ring-primary" />
                                        </th>
                                        <th className="px-6 py-5">Membro</th>
                                        <th className="px-6 py-5">Código</th>
                                        <th className="px-6 py-5 text-center">Contatos</th>
                                        <th className="px-6 py-5">Pagamento</th>
                                        <th className="px-6 py-5">Cortesia</th>
                                        <th className="px-6 py-5 text-right">Ações</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {isLoading ? (
                                        <tr><td colSpan={7} className="text-center py-20 text-gray-500 font-bold uppercase text-xs tracking-widest animate-pulse">Carregando membros...</td></tr>
                                    ) : filteredMembers.length === 0 ? (
                                        <tr><td colSpan={7} className="text-center py-20 text-gray-500 font-bold uppercase text-xs tracking-widest">Nenhum membro encontrado</td></tr>
                                    ) : (
                                        filteredMembers.map(m => (
                                            <tr key={m.id} className={`hover:bg-white/[0.02] transition-colors ${selectedIds.has(m.id) ? 'bg-primary/5' : ''}`}>
                                                <td className="px-6 py-5">
                                                    <input 
                                                        type="checkbox" 
                                                        checked={selectedIds.has(m.id)} 
                                                        onChange={() => handleToggleSelectOne(m)} 
                                                        disabled={m.status !== 'confirmed'}
                                                        className={`w-5 h-5 rounded border-gray-700 bg-dark text-primary focus:ring-primary ${m.status !== 'confirmed' ? 'opacity-20 cursor-not-allowed' : 'cursor-pointer'}`} 
                                                    />
                                                </td>
                                                <td className="px-6 py-5">
                                                    <p className="text-sm font-black text-white uppercase truncate">{m.promoterName}</p>
                                                    <p className="text-[9px] text-primary font-black uppercase tracking-widest mt-1 truncate max-w-[150px]">{m.vipEventName}</p>
                                                </td>
                                                <td className="px-6 py-5">
                                                    {m.benefitCode ? (
                                                        <span className="px-2 py-1 bg-dark text-primary border border-primary/30 rounded-lg font-mono text-xs font-black tracking-widest">{m.benefitCode}</span>
                                                    ) : (
                                                        <span className="text-gray-600 text-[10px] font-bold">---</span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-5">
                                                    <div className="flex justify-center gap-2">
                                                        <a href={`https://wa.me/55${m.promoterWhatsapp?.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="p-2 bg-green-900/30 text-green-400 rounded-lg border border-green-800/30 hover:bg-green-600 hover:text-white transition-all"><WhatsAppIcon className="w-3.5 h-3.5"/></a>
                                                        {m.promoterInstagram && (
                                                            <a href={`https://instagram.com/${m.promoterInstagram.replace('@', '')}`} target="_blank" rel="noreferrer" className="p-2 bg-pink-900/30 text-pink-400 rounded-lg border border-pink-800/30 hover:bg-pink-600 hover:text-white transition-all"><InstagramIcon className="w-3.5 h-3.5"/></a>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-5">
                                                    {m.status === 'confirmed' ? (
                                                        <div className="flex flex-col">
                                                            <span className="px-2 py-0.5 rounded-full bg-green-900/40 text-green-400 border border-green-800 text-[8px] font-black uppercase tracking-widest w-fit">PAGO</span>
                                                            <span className="text-[8px] text-gray-600 mt-1 font-bold uppercase">{formatDate(m.updatedAt || m.submittedAt)}</span>
                                                        </div>
                                                    ) : (
                                                        <span className="px-2 py-0.5 rounded-full bg-orange-900/40 text-orange-400 border border-orange-800 text-[8px] font-black uppercase tracking-widest">AGUARDANDO PIX</span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-5">
                                                    {m.isBenefitActive ? (
                                                        <span className="px-2 py-0.5 rounded-full bg-green-900/40 text-green-400 border border-green-800 text-[8px] font-black uppercase tracking-widest">ENVIADO</span>
                                                    ) : m.status === 'confirmed' ? (
                                                        <span className="px-2 py-0.5 rounded-full bg-amber-900/40 text-amber-400 border border-amber-800 text-[8px] font-black uppercase tracking-widest animate-pulse">PENDENTE</span>
                                                    ) : (
                                                        <span className="text-[8px] text-gray-700 font-black uppercase">N/A</span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-5 text-right">
                                                    <div className="flex justify-end gap-2 opacity-100 transition-all">
                                                        {m.status === 'confirmed' && (
                                                            <button 
                                                                id={`notify-btn-${m.id}`}
                                                                onClick={() => handleManualNotifySingle(m)} 
                                                                disabled={isBulkProcessing}
                                                                className="p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 shadow-lg shadow-indigo-900/20"
                                                                title="Enviar Notificação de Acesso Agora"
                                                            >
                                                                <MegaphoneIcon className="w-4 h-4" />
                                                            </button>
                                                        )}
                                                        <button 
                                                            onClick={() => {
                                                                const msg = `Olá ${m.promoterName.split(' ')[0]}! Notamos que você iniciou sua adesão ao Clube VIP para o evento ${m.vipEventName} mas ainda não finalizou o pagamento Pix. Ficou com alguma dúvida? Posso te ajudar?`;
                                                                window.open(`https://wa.me/55${m.promoterWhatsapp?.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`, '_blank');
                                                            }}
                                                            className="p-2 bg-gray-700 text-gray-400 rounded-lg hover:text-white"
                                                            title="Suporte Individual (WhatsApp)"
                                                        >
                                                            <WhatsAppIcon className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {vipEvents.map(ev => (
                            <div key={ev.id} className="bg-dark/40 rounded-[2rem] p-6 border border-white/5 flex flex-col group hover:border-primary/30 transition-all shadow-lg">
                                <div className="flex justify-between items-start mb-4">
                                    <div className={`p-3 rounded-2xl ${ev.isActive ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                                        <TicketIcon className="w-8 h-8" />
                                    </div>
                                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button onClick={() => { setEditingEvent(ev); setIsModalOpen(true); }} className="p-2 bg-gray-800 text-gray-400 rounded-xl hover:text-white"><PencilIcon className="w-4 h-4"/></button>
                                        <button onClick={() => handleDeleteEvent(ev.id)} className="p-2 bg-red-900/20 text-red-400 rounded-xl hover:bg-red-600 hover:text-white"><TrashIcon className="w-4 h-4"/></button>
                                    </div>
                                </div>
                                <h3 className="text-xl font-black text-white uppercase tracking-tight mb-2">{ev.name}</h3>
                                <p className="text-primary font-black text-2xl mb-4">R$ {ev.price.toFixed(2).replace('.', ',')}</p>
                                <div className="space-y-2 mb-6 flex-grow">
                                    <p className="text-[9px] font-black text-gray-600 uppercase tracking-widest">ID Link: {ev.externalSlug || 'não definido'}</p>
                                    {ev.benefits.slice(0, 3).map((b, i) => (
                                        <div key={i} className="flex gap-2 text-xs text-gray-400 font-medium">
                                            <CheckCircleIcon className="w-4 h-4 text-primary flex-shrink-0" /> <span className="truncate">{b}</span>
                                        </div>
                                    ))}
                                    {ev.benefits.length > 3 && <p className="text-[9px] text-gray-600 font-black uppercase">+{ev.benefits.length - 3} outros benefícios</p>}
                                </div>
                                <div className="flex items-center justify-between pt-4 border-t border-white/5">
                                    <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest border ${ev.isActive ? 'bg-green-900/40 text-green-400 border-green-800' : 'bg-red-900/40 text-red-400 border-red-800'}`}>
                                        {ev.isActive ? 'Oferta Ativa' : 'Pausada'}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Modal para Criar/Editar Evento */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[100] flex items-center justify-center p-6" onClick={() => setIsModalOpen(false)}>
                    <div className="bg-secondary w-full max-w-lg p-8 rounded-[2.5rem] border border-white/10 shadow-2xl flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                        <h2 className="text-2xl font-black text-white uppercase tracking-tighter mb-6">{editingEvent?.id ? 'Editar' : 'Nova'} Oferta VIP</h2>
                        
                        <form onSubmit={handleSaveEvent} className="space-y-4 overflow-y-auto pr-2 custom-scrollbar">
                            <div>
                                <label className="text-[10px] font-black text-gray-500 uppercase ml-1">Nome do Produto</label>
                                <input type="text" value={editingEvent?.name || ''} onChange={e => setEditingEvent({...editingEvent!, name: e.target.value})} required className="w-full bg-dark border border-white/10 rounded-2xl p-4 text-white font-bold outline-none focus:ring-1 focus:ring-primary" placeholder="Ex: Camarote VIP Sunset" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[10px] font-black text-gray-500 uppercase ml-1">Preço (R$)</label>
                                    <input type="number" step="0.01" value={editingEvent?.price || ''} onChange={e => setEditingEvent({...editingEvent!, price: parseFloat(e.target.value)})} required className="w-full bg-dark border border-white/10 rounded-2xl p-4 text-white font-bold" />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-gray-500 uppercase ml-1">Status</label>
                                    <select value={editingEvent?.isActive ? 'true' : 'false'} onChange={e => setEditingEvent({...editingEvent!, isActive: e.target.value === 'true'})} className="w-full bg-dark border border-white/10 rounded-2xl p-4 text-white font-bold">
                                        <option value="true">Ativo</option>
                                        <option value="false">Pausado</option>
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-gray-500 uppercase ml-1">ID da URL STingressos (Slug)</label>
                                <input type="text" value={editingEvent?.externalSlug || ''} onChange={e => setEditingEvent({...editingEvent!, externalSlug: e.target.value})} className="w-full bg-dark border border-white/10 rounded-2xl p-4 text-white font-mono text-sm" placeholder="Ex: festival-sunset-2024" />
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-gray-500 uppercase ml-1">Benefícios (um por linha)</label>
                                <textarea 
                                    rows={4} 
                                    value={editingEvent?.benefits?.join('\n') || ''} 
                                    onChange={e => setEditingEvent({...editingEvent!, benefits: e.target.value.split('\n').filter(b => b.trim() !== '')})}
                                    className="w-full bg-dark border border-white/10 rounded-2xl p-4 text-white text-sm" 
                                    placeholder="Ex: Camiseta Exclusiva&#10;Entrada Sem Fila"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-gray-500 uppercase ml-1">Chave Pix de Recebimento</label>
                                <input type="text" value={editingEvent?.pixKey || ''} onChange={e => setEditingEvent({...editingEvent!, pixKey: e.target.value})} required className="w-full bg-dark border border-white/10 rounded-2xl p-4 text-white font-mono text-xs" placeholder="CNPJ, E-mail ou Chave Aleatória" />
                            </div>
                        </form>

                        <div className="flex gap-4 mt-8 pt-6 border-t border-white/5">
                           <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-4 bg-gray-800 text-gray-400 font-bold rounded-2xl uppercase text-xs">Cancelar</button>
                           <button type="submit" onClick={handleSaveEvent} disabled={isBulkProcessing} className="flex-[2] py-4 bg-primary text-white font-black rounded-2xl shadow-xl uppercase text-xs tracking-widest">{isBulkProcessing ? 'SALVANDO...' : 'CONFIRMAR'}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminClubVip;
