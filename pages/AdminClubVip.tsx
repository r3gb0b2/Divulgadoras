
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
    EyeIcon, TicketIcon, RefreshIcon, ClockIcon, UserIcon,
    BuildingOfficeIcon, PlusIcon, TrashIcon, PencilIcon, AlertTriangleIcon,
    WhatsAppIcon, InstagramIcon, DownloadIcon
} from '../components/Icons';

const AdminClubVip: React.FC = () => {
    const navigate = useNavigate();
    const { adminData, loading: authLoading } = useAdminAuth();
    
    const [activeTab, setActiveTab] = useState<'members' | 'events'>('members');
    const [memberships, setMemberships] = useState<VipMembership[]>([]);
    const [vipEvents, setVipEvents] = useState<VipEvent[]>([]);
    const [organizations, setOrganizations] = useState<Record<string, string>>({});
    
    const [isLoading, setIsLoading] = useState(true);
    const [filterStatus, setFilterStatus] = useState<'pending' | 'confirmed' | 'rejected' | 'all'>('all');
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

    const handleToggleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            // SÓ PODE SELECIONAR QUEM TEM PAGAMENTO CONFIRMADO
            const validIds = filteredMembers
                .filter(m => m.status === 'confirmed')
                .map(m => m.id);
            setSelectedIds(new Set(validIds));
        } else {
            setSelectedIds(new Set());
        }
    };

    const handleToggleSelectOne = (membership: VipMembership) => {
        if (membership.status !== 'confirmed') return;
        
        const next = new Set(selectedIds);
        if (next.has(membership.id)) next.delete(membership.id);
        else next.add(membership.id);
        setSelectedIds(next);
    };

    const handleBulkActivate = async () => {
        if (selectedIds.size === 0) return;
        if (!window.confirm(`Deseja ATIVAR as cortesias de ${selectedIds.size} membros? Eles receberão um e-mail com o link de resgate.`)) return;
        
        setIsBulkProcessing(true);
        try {
            const notifyActivation = httpsCallable(functions, 'notifyVipActivation');
            
            await Promise.all(Array.from(selectedIds).map(async (id: string) => {
                const membership = memberships.find(m => m.id === id);
                if (membership) {
                    await updateVipMembership(id, { isBenefitActive: true });
                    await updatePromoter(membership.promoterId, { emocoesBenefitActive: true });
                    // Gatilho de e-mail de ativação
                    await notifyActivation({ membershipId: id });
                }
            }));
            setSelectedIds(new Set());
            await fetchData();
            alert("Cortesias ativadas e e-mails enviados!");
        } catch (e) {
            alert("Erro ao processar ativação.");
        } finally {
            setIsBulkProcessing(false);
        }
    };

    const handleSaveEvent = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingEvent?.name) return;
        
        setIsBulkProcessing(true);
        try {
            if (editingEvent.id) {
                await updateVipEvent(editingEvent.id, editingEvent);
            } else {
                await createVipEvent({
                    name: editingEvent.name!,
                    price: editingEvent.price || 0,
                    description: editingEvent.description || '',
                    benefits: editingEvent.benefits || [],
                    pixKey: editingEvent.pixKey || '',
                    externalSlug: editingEvent.externalSlug || '',
                    isActive: editingEvent.isActive ?? true
                });
            }
            setIsModalOpen(false);
            setEditingEvent(null);
            await fetchData();
        } catch (e) {
            alert("Erro ao salvar evento.");
        } finally {
            setIsBulkProcessing(false);
        }
    };

    const handleDeleteEvent = async (id: string) => {
        if (!window.confirm("Excluir este evento VIP?")) return;
        try {
            await deleteVipEvent(id);
            await fetchData();
        } catch (e) { alert("Erro ao deletar."); }
    };

    const handleDownloadExcel = () => {
        if (filteredMembers.length === 0) return;

        let table = `
            <html xmlns:x="urn:schemas-microsoft-com:office:excel">
            <head>
                <meta http-equiv="content-type" content="application/vnd.ms-excel; charset=UTF-8">
            </head>
            <body>
                <table border="1">
                    <thead>
                        <tr style="background-color: #7e39d5; color: white; font-weight: bold;">
                            <th>Data Cadastro</th>
                            <th>Status Pagto</th>
                            <th>Evento VIP</th>
                            <th>Membro</th>
                            <th>E-mail</th>
                            <th>WhatsApp</th>
                            <th>Instagram</th>
                            <th>Código Cortesia</th>
                            <th>Ingresso Enviado?</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        filteredMembers.forEach(m => {
            const date = (m.submittedAt as any)?.toDate?.().toLocaleString('pt-BR') || 'N/A';
            const statusPagto = m.status === 'confirmed' ? 'PAGO' : 'PENDENTE';
            const statusCortesia = m.isBenefitActive ? 'SIM' : 'NÃO';
            table += `
                <tr>
                    <td>${date}</td>
                    <td>${statusPagto}</td>
                    <td>${m.vipEventName}</td>
                    <td>${m.promoterName}</td>
                    <td>${m.promoterEmail}</td>
                    <td>${m.promoterWhatsapp || ''}</td>
                    <td>${m.promoterInstagram || ''}</td>
                    <td style="font-family: monospace;">${m.benefitCode || ''}</td>
                    <td>${statusCortesia}</td>
                </tr>
            `;
        });

        table += `</tbody></table></body></html>`;

        const blob = new Blob([table], { type: 'application/vnd.ms-excel' });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `gestao_clube_vip_${new Date().getTime()}.xls`;
        link.click();
    };

    const filteredMembers = useMemo(() => {
        return memberships.filter(m => {
            const matchesStatus = filterStatus === 'all' || m.status === filterStatus;
            const matchesSearch = 
                (m.promoterName || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
                (m.promoterEmail || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                (m.promoterWhatsapp || '').includes(searchQuery);
            return matchesStatus && matchesSearch;
        });
    }, [memberships, filterStatus, searchQuery]);

    const formatDate = (ts: any) => {
        if (!ts) return 'N/A';
        const d = ts.toDate ? ts.toDate() : new Date(ts);
        return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    };

    return (
        <div className="pb-20">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4 px-4 md:px-0">
                <div>
                    <h1 className="text-3xl font-black text-white uppercase tracking-tighter flex items-center gap-3 leading-none">
                        <TicketIcon className="w-8 h-8 text-primary" />
                        Gestão Clube VIP
                    </h1>
                </div>
                <div className="flex gap-2 w-full md:w-auto">
                    {activeTab === 'events' && (
                        <button onClick={() => { setEditingEvent({ benefits: [] }); setIsModalOpen(true); }} className="flex-1 md:flex-none px-6 py-3 bg-primary text-white font-black rounded-2xl text-[10px] uppercase tracking-widest shadow-xl flex items-center justify-center gap-2">
                            <PlusIcon className="w-4 h-4" /> Novo Evento
                        </button>
                    )}
                    {activeTab === 'members' && (
                        <button onClick={handleDownloadExcel} className="flex-1 md:flex-none px-6 py-3 bg-green-600 text-white font-black rounded-2xl text-[10px] uppercase tracking-widest shadow-xl flex items-center justify-center gap-2">
                            <DownloadIcon className="w-4 h-4" /> Exportar XLS
                        </button>
                    )}
                    {activeTab === 'members' && selectedIds.size > 0 && (
                        <button onClick={handleBulkActivate} disabled={isBulkProcessing} className="flex-1 md:flex-none px-6 py-3 bg-indigo-600 text-white font-black rounded-2xl text-[10px] uppercase tracking-widest shadow-xl flex items-center justify-center gap-2">
                            {isBulkProcessing ? 'PROCESSANDO...' : `LIBERAR ${selectedIds.size} INGRESSOS`}
                        </button>
                    )}
                    <button onClick={() => fetchData()} className="p-3 bg-gray-800 text-gray-400 rounded-2xl hover:text-white transition-colors">
                        <RefreshIcon className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`}/>
                    </button>
                    <button onClick={() => navigate(-1)} className="p-3 bg-gray-800 text-gray-400 rounded-2xl hover:text-white transition-colors">
                        <ArrowLeftIcon className="w-5 h-5"/>
                    </button>
                </div>
            </div>

            <div className="flex bg-gray-800/50 p-1.5 rounded-2xl mb-8 border border-white/5 w-fit">
                <button onClick={() => setActiveTab('members')} className={`px-6 py-3 text-xs font-black uppercase rounded-xl transition-all ${activeTab === 'members' ? 'bg-primary text-white shadow-lg' : 'text-gray-400 hover:text-gray-200'}`}>Membros ({memberships.length})</button>
                <button onClick={() => setActiveTab('events')} className={`px-6 py-3 text-xs font-black uppercase rounded-xl transition-all ${activeTab === 'events' ? 'bg-primary text-white shadow-lg' : 'text-gray-400 hover:text-gray-200'}`}>Ofertas VIP ({vipEvents.length})</button>
            </div>

            <div className="bg-secondary/60 backdrop-blur-xl rounded-[2.5rem] p-6 border border-white/5 shadow-2xl space-y-6">
                {activeTab === 'members' ? (
                    <>
                        <div className="flex flex-col md:flex-row gap-4">
                            <select value={selectedEventId} onChange={e => setSelectedEventId(e.target.value)} className="bg-dark border border-gray-700 text-white px-5 py-3 rounded-2xl text-xs font-black uppercase tracking-widest focus:ring-1 focus:ring-primary outline-none min-w-[220px]">
                                <option value="all">Filtrar: Todos Eventos</option>
                                {vipEvents.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                            </select>
                            <div className="relative flex-grow">
                                <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                                <input 
                                    type="text" placeholder="Buscar por nome, e-mail ou whats..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                                    className="w-full pl-11 pr-4 py-3 bg-dark border border-gray-700 rounded-2xl text-white text-sm focus:ring-1 focus:ring-primary outline-none font-medium"
                                />
                            </div>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-dark/50 text-[10px] font-black text-gray-500 uppercase tracking-widest border-b border-white/5">
                                        <th className="px-6 py-5 w-10">
                                            <input type="checkbox" checked={filteredMembers.length > 0 && selectedIds.size === filteredMembers.filter(m => m.status === 'confirmed').length} onChange={handleToggleSelectAll} className="w-5 h-5 rounded border-gray-700 bg-dark text-primary focus:ring-primary" />
                                        </th>
                                        <th className="px-6 py-5">Comprador</th>
                                        <th className="px-6 py-5">Contatos</th>
                                        <th className="px-6 py-5">Status Pagto</th>
                                        <th className="px-6 py-5">Status Ingresso</th>
                                        <th className="px-6 py-5 text-right">Data</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {isLoading ? (
                                        <tr><td colSpan={6} className="text-center py-20 text-gray-500 font-bold uppercase text-xs tracking-widest animate-pulse">Carregando membros...</td></tr>
                                    ) : filteredMembers.length === 0 ? (
                                        <tr><td colSpan={6} className="text-center py-20 text-gray-500 font-bold uppercase text-xs tracking-widest">Nenhum membro encontrado</td></tr>
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
                                                    <p className="text-[10px] text-gray-500 font-mono mt-1">{m.promoterEmail}</p>
                                                </td>
                                                <td className="px-6 py-5">
                                                    <div className="flex gap-3">
                                                        <a href={`https://wa.me/55${m.promoterWhatsapp?.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="p-2 bg-green-900/30 text-green-400 rounded-lg border border-green-800/30 hover:bg-green-600 hover:text-white transition-all"><WhatsAppIcon className="w-4 h-4"/></a>
                                                        {m.promoterInstagram && (
                                                            <a href={`https://instagram.com/${m.promoterInstagram.replace('@', '')}`} target="_blank" rel="noreferrer" className="p-2 bg-pink-900/30 text-pink-400 rounded-lg border border-pink-800/30 hover:bg-pink-600 hover:text-white transition-all"><InstagramIcon className="w-4 h-4"/></a>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-5">
                                                    {m.status === 'confirmed' ? (
                                                        <span className="px-2 py-0.5 rounded-full bg-green-900/40 text-green-400 border border-green-800 text-[8px] font-black uppercase tracking-widest">PAGO</span>
                                                    ) : (
                                                        <span className="px-2 py-0.5 rounded-full bg-orange-900/40 text-orange-400 border border-orange-800 text-[8px] font-black uppercase tracking-widest">PENDENTE (NÃO FINALIZOU)</span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-5">
                                                    <div className="flex flex-col gap-1.5">
                                                        <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest border w-fit ${m.isBenefitActive ? 'bg-green-900/40 text-green-400 border-green-800' : 'bg-amber-900/40 text-amber-400 border-amber-800'}`}>
                                                            {m.isBenefitActive ? 'ENVIADO' : 'AGUARDANDO ADMIN'}
                                                        </span>
                                                        <p className="text-[11px] font-mono text-gray-300 font-bold select-all">{m.benefitCode || (m.status === 'confirmed' ? 'Aguardando...' : 'N/A')}</p>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-5 text-right">
                                                    <p className="text-[10px] text-gray-500 font-bold uppercase">{formatDate(m.submittedAt)}</p>
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
                            <div key={ev.id} className="bg-dark/40 rounded-[2rem] p-6 border border-white/5 flex flex-col group hover:border-primary/30 transition-all">
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
                                <p className="text-[8px] text-gray-600 mt-1 uppercase">O link será: stingingressos.com.br/eventos/<b>{editingEvent?.externalSlug || 'exemplo'}</b>?cupom=CÓDIGO</p>
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-gray-500 uppercase ml-1">Benefícios (um por linha)</label>
                                <textarea 
                                    rows={4} 
                                    value={editingEvent?.benefits?.join('\n') || ''} 
                                    onChange={e => setEditingEvent({...editingEvent!, benefits: e.target.value.split('\n').filter(b => b.trim() !== '')})}
                                    className="w-full bg-dark border border-white/10 rounded-2xl p-4 text-white text-sm" 
                                    placeholder="Ex: Camiseta Exclusiva&#10;Entrada Sem Fila&#10;10% de desconto no Bar"
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
