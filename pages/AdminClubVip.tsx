
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
    refundVipMembership,
    addVipCodes,
    getVipCodeStats,
    getVipEventCodes
} from '../services/vipService';
import { updatePromoter } from '../services/promoterService';
import { getOrganizations } from '../services/organizationService';
import { VipMembership, VipEvent } from '../types';
import { firestore, functions } from '../firebase/config';
import { httpsCallable } from 'firebase/functions';
import { 
    ArrowLeftIcon, SearchIcon, CheckCircleIcon, XIcon, EyeIcon,
    TicketIcon, RefreshIcon, ClockIcon, PlusIcon, TrashIcon, PencilIcon, 
    WhatsAppIcon, InstagramIcon, DownloadIcon, ChartBarIcon, DocumentDuplicateIcon, 
    CogIcon, UndoIcon, MapPinIcon
} from '../components/Icons';
import VipTicket from '../components/VipTicket';

const toDateSafe = (timestamp: any): Date | null => {
    if (!timestamp) return null;
    if (typeof timestamp.toDate === 'function') return timestamp.toDate();
    if (typeof timestamp === 'object' && timestamp.seconds !== undefined) return new Date(timestamp.seconds * 1000);
    const date = new Date(timestamp);
    return isNaN(date.getTime()) ? null : date;
};

// Modal para gerenciar códigos em lote
const ManageCodesModal: React.FC<{ isOpen: boolean, onClose: () => void, event: VipEvent, onSaved: () => void, onDownloadStock: (event: VipEvent) => void }> = ({ isOpen, onClose, event, onSaved, onDownloadStock }) => {
    const [codesText, setCodesText] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [currentStock, setCurrentStock] = useState<number | null>(null);

    useEffect(() => {
        if (isOpen && event.id) {
            getVipCodeStats(event.id).then(setCurrentStock);
        }
    }, [isOpen, event.id]);

    if (!isOpen) return null;

    const handleSave = async () => {
        const codes = codesText.split('\n').map(c => c.trim()).filter(c => c.length > 0);
        if (codes.length === 0) return alert("Insira pelo menos um código.");
        
        setIsSaving(true);
        try {
            await addVipCodes(event.id, codes);
            alert(`${codes.length} códigos adicionados ao estoque!`);
            setCodesText('');
            onSaved();
            onClose();
        } catch (e: any) {
            alert("Erro ao salvar: " + e.message);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[150] flex items-center justify-center p-6" onClick={onClose}>
            <div className="bg-secondary w-full max-w-lg p-8 rounded-[2.5rem] border border-white/10 shadow-2xl" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h2 className="text-xl font-black text-white uppercase tracking-tighter">Estoque de Códigos</h2>
                        <p className="text-[9px] text-gray-500 font-bold uppercase mt-1">{event.name}</p>
                    </div>
                    <button onClick={onClose} className="p-2 text-gray-500 hover:text-white"><XIcon className="w-6 h-6"/></button>
                </div>
                
                <div className="mb-6 p-4 bg-dark/50 rounded-2xl border border-white/5 flex justify-between items-center">
                    <div>
                        <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Estoque Disponível:</p>
                        <p className="text-2xl font-black text-primary">{currentStock !== null ? currentStock : '...'}</p>
                    </div>
                    <button 
                        onClick={() => onDownloadStock(event)}
                        className="px-4 py-2 bg-indigo-900/30 text-indigo-400 border border-indigo-800 rounded-xl text-[9px] font-black uppercase tracking-widest flex items-center gap-2 hover:bg-indigo-900/50"
                    >
                        <DownloadIcon className="w-4 h-4" /> Baixar Completo
                    </button>
                </div>

                <div className="space-y-4">
                    <label className="text-[10px] font-black text-gray-500 uppercase ml-1">Colar novos códigos (Um por linha)</label>
                    <textarea 
                        rows={8}
                        value={codesText}
                        onChange={e => setCodesText(e.target.value)}
                        placeholder="CÓDIGO1&#10;CÓDIGO2&#10;CÓDIGO3..."
                        className="w-full bg-dark border border-gray-700 rounded-2xl p-4 text-white font-mono text-sm outline-none focus:border-primary"
                    />
                </div>

                <div className="mt-8 flex gap-3">
                    <button onClick={onClose} className="flex-1 py-4 bg-gray-800 text-gray-400 font-black rounded-2xl uppercase text-xs">Cancelar</button>
                    <button onClick={handleSave} disabled={isSaving} className="flex-2 py-4 bg-green-600 text-white font-black rounded-2xl uppercase text-xs shadow-lg shadow-green-900/20 disabled:opacity-50">
                        {isSaving ? 'SALVANDO...' : 'ADICIONAR AO ESTOQUE'}
                    </button>
                </div>
            </div>
        </div>
    );
};

const AdminClubVip: React.FC = () => {
    const navigate = useNavigate();
    const { adminData, loading: authLoading } = useAdminAuth();
    
    const [activeTab, setActiveTab] = useState<'members' | 'events'>('members');
    const [memberships, setMemberships] = useState<VipMembership[]>([]);
    const [vipEvents, setVipEvents] = useState<VipEvent[]>([]);
    const [eventStats, setEventStats] = useState<Record<string, { total: number, available: number }>>({});
    
    const [isLoading, setIsLoading] = useState(true);
    const [selectedEventId, setSelectedEventId] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isBulkProcessing, setIsBulkProcessing] = useState(false);
    const [isProcessingId, setIsProcessingId] = useState<string | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isCodesModalOpen, setIsCodesModalOpen] = useState(false);
    const [editingEvent, setEditingEvent] = useState<Partial<VipEvent> | null>(null);
    const [eventForCodes, setEventForCodes] = useState<VipEvent | null>(null);

    // Estado para download de PDF único (evita travar a página renderizando tudo)
    const [exportMembership, setExportMembership] = useState<VipMembership | null>(null);
    const [isDownloadingPdfId, setIsDownloadingPdfId] = useState<string | null>(null);

    const isSuperAdmin = adminData?.role === 'superadmin';

    const fetchData = useCallback(async () => {
        if (!isSuperAdmin) {
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        try {
            const [eventsData, membersData] = await Promise.all([
                getAllVipEvents(),
                getAllVipMemberships(selectedEventId)
            ]);
            
            setVipEvents(eventsData);
            setMemberships(membersData);

            const stats: Record<string, { total: number, available: number }> = {};
            for (const ev of eventsData) {
                const available = await getVipCodeStats(ev.id);
                const totalSnap = await firestore.collection('vipEvents').doc(ev.id).collection('availableCodes').get();
                stats[ev.id] = { total: totalSnap.size, available };
            }
            setEventStats(stats);

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
        const query = searchQuery.toLowerCase().trim();
        return memberships.filter(m => {
            const matchesSearch = 
                (m.promoterName || '').toLowerCase().includes(query) || 
                (m.promoterEmail || '').toLowerCase().includes(query);
            
            const matchesEvent = selectedEventId === 'all' || m.vipEventId === selectedEventId;
            return matchesSearch && matchesEvent;
        });
    }, [memberships, searchQuery, selectedEventId]);

    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            setSelectedIds(new Set(filteredMembers.map(m => m.id)));
        } else {
            setSelectedIds(new Set());
        }
    };

    const handleAdminDownloadTicket = async (membership: VipMembership) => {
        if (isDownloadingPdfId) return;
        
        setIsDownloadingPdfId(membership.id);
        const event = vipEvents.find(e => e.id === membership.vipEventId);
        
        // Ativa a renderização apenas do ingresso que vamos baixar
        setExportMembership({
            ...membership,
            eventTime: event?.eventTime,
            eventLocation: event?.eventLocation
        });
        
        // Pequena pausa para o QR Code renderizar no elemento
        setTimeout(async () => {
            const element = document.getElementById(`ticket-content-${membership.id}`);
            if (!element) {
                alert("Erro ao preparar o documento.");
                setIsDownloadingPdfId(null);
                setExportMembership(null);
                return;
            }

            const options = {
                margin: 0,
                filename: `VIP_${membership.promoterName.split(' ')[0].toUpperCase()}.pdf`,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { 
                    scale: 2, 
                    useCORS: true, 
                    backgroundColor: '#000000',
                    letterRendering: true
                },
                jsPDF: { 
                    unit: 'px', 
                    format: [400, 700],
                    orientation: 'portrait'
                }
            };

            try {
                // @ts-ignore
                await window.html2pdf().set(options).from(element).save();
            } catch (err) {
                console.error(err);
                alert("Falha ao gerar PDF.");
            } finally {
                setIsDownloadingPdfId(null);
                setExportMembership(null);
            }
        }, 800);
    };

    const handleDownloadEventStock = async (event: VipEvent) => {
        setIsBulkProcessing(true);
        try {
            const codes = await getVipEventCodes(event.id);
            if (codes.length === 0) return alert("Estoque vazio.");

            const jsonData = codes.map((c: any) => ({
                'CÓDIGO': c.code,
                'STATUS': c.used ? 'USADO' : 'DISPONÍVEL',
                'USUÁRIO': c.usedBy || '-',
                'DATA USO': c.usedAt ? (c.usedAt as any).toDate().toLocaleString('pt-BR') : '-'
            }));

            // @ts-ignore
            const ws = window.XLSX.utils.json_to_sheet(jsonData);
            // @ts-ignore
            const wb = window.XLSX.utils.book_new();
            // @ts-ignore
            window.XLSX.utils.book_append_sheet(wb, ws, "Estoque");
            // @ts-ignore
            window.XLSX.writeFile(wb, `estoque_${event.name.replace(/\s+/g, '_')}.xlsx`);
        } catch (e: any) {
            alert(e.message);
        } finally {
            setIsBulkProcessing(false);
        }
    };

    const handleManualActivateSingle = async (membership: VipMembership) => {
        if(!window.confirm("Deseja forçar a ativação com um cupom do estoque?")) return;
        setIsBulkProcessing(true);
        try {
            const activateVip = httpsCallable(functions, 'activateVipMembership');
            const res: any = await activateVip({ membershipId: membership.id });
            if (res.data.success) {
                alert(`Sucesso! Código: ${res.data.code}`);
                fetchData();
            }
        } catch (e: any) { alert(e.message); } finally { setIsBulkProcessing(false); }
    };

    const handleRefundAction = async (membership: VipMembership) => {
        if (!window.confirm(`Estornar adesão de ${membership.promoterName}?`)) return;
        setIsProcessingId(membership.id);
        try {
            await refundVipMembership(membership.id);
            await updatePromoter(membership.promoterId, { emocoesBenefitActive: false });
            fetchData();
        } catch (e: any) { alert(e.message); } finally { setIsProcessingId(null); }
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
                isSoldOut: editingEvent.isSoldOut ?? false,
                benefits: editingEvent.benefits || [],
                externalSlug: editingEvent.externalSlug || '',
                eventTime: editingEvent.eventTime || '',
                eventLocation: editingEvent.eventLocation || ''
            };
            if (editingEvent.id) await updateVipEvent(editingEvent.id, data);
            else await createVipEvent(data as any);
            setIsModalOpen(false);
            fetchData();
        } catch (e: any) { alert(e.message); } finally { setIsBulkProcessing(false); }
    };

    return (
        <div className="pb-40">
            {/* CONTAINER DE EXPORTAÇÃO DINÂMICO (Só renderiza o que for baixar) */}
            <div className="fixed left-[-2000px] top-0 pointer-events-none" style={{ width: '400px' }}>
                {exportMembership && <VipTicket membership={exportMembership} isExporting={true} />}
            </div>

            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4 px-4 md:px-0">
                <h1 className="text-3xl font-black text-white uppercase tracking-tighter flex items-center gap-3">
                    <TicketIcon className="w-8 h-8 text-primary" /> Gestão Clube VIP
                </h1>
                <div className="flex gap-2">
                    <button onClick={() => { setEditingEvent({ benefits: [], isActive: true }); setIsModalOpen(true); }} className="px-6 py-3 bg-primary text-white font-black rounded-2xl text-[10px] uppercase tracking-widest shadow-xl flex items-center gap-2">
                        <PlusIcon className="w-4 h-4" /> Novo Evento
                    </button>
                    <button onClick={() => fetchData()} className="p-3 bg-gray-800 text-gray-400 rounded-2xl hover:text-white transition-colors">
                        <RefreshIcon className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`}/>
                    </button>
                </div>
            </div>

            <div className="flex bg-gray-800/50 p-1.5 rounded-2xl mb-8 border border-white/5 w-fit ml-4 md:ml-0">
                <button onClick={() => setActiveTab('members')} className={`px-6 py-3 text-xs font-black uppercase rounded-xl transition-all ${activeTab === 'members' ? 'bg-primary text-white shadow-lg' : 'text-gray-400'}`}>Membros</button>
                <button onClick={() => setActiveTab('events')} className={`px-6 py-3 text-xs font-black uppercase rounded-xl transition-all ${activeTab === 'events' ? 'bg-primary text-white shadow-lg' : 'text-gray-400'}`}>Ofertas / Eventos</button>
            </div>

            <div className="bg-secondary/60 backdrop-blur-xl rounded-[2.5rem] p-6 border border-white/5 shadow-2xl space-y-6">
                
                {activeTab === 'members' && (
                    <>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            <select value={selectedEventId} onChange={e => setSelectedEventId(e.target.value)} className="bg-dark border border-gray-700 text-white px-4 py-3 rounded-xl text-[10px] font-black uppercase outline-none focus:border-primary">
                                <option value="all">TODOS EVENTOS</option>
                                {vipEvents.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                            </select>
                            <div className="relative">
                                <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                                <input type="text" placeholder="BUSCAR NOME OU E-MAIL..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full pl-11 pr-4 py-3 bg-dark border border-gray-700 rounded-2xl text-white text-[10px] font-black uppercase outline-none focus:border-primary" />
                            </div>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead>
                                    <tr className="bg-dark/50 text-[10px] font-black text-gray-500 uppercase tracking-widest border-b border-white/5">
                                        <th className="px-6 py-5 w-10 text-center"><input type="checkbox" onChange={handleSelectAll} className="w-4 h-4 rounded border-gray-700 bg-dark text-primary" /></th>
                                        <th className="px-6 py-5">Membro</th>
                                        <th className="px-6 py-5 text-center">Status</th>
                                        <th className="px-6 py-5 text-center">Rastreio</th>
                                        <th className="px-6 py-4 text-right">Ação</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {filteredMembers.map(m => (
                                        <tr key={m.id} className="hover:bg-white/[0.02] transition-colors">
                                            <td className="px-6 py-5 text-center"><input type="checkbox" checked={selectedIds.has(m.id)} onChange={() => { const n = new Set(selectedIds); if(n.has(m.id)) n.delete(m.id); else n.add(m.id); setSelectedIds(n); }} className="w-4 h-4 rounded border-gray-700 bg-dark text-primary" /></td>
                                            <td className="px-6 py-5">
                                                <p className="text-sm font-black text-white uppercase truncate">{m.promoterName}</p>
                                                <p className="text-[10px] text-gray-500 font-mono truncate">{m.promoterEmail}</p>
                                                <p className="text-[9px] text-primary font-black uppercase mt-1">{m.vipEventName}</p>
                                            </td>
                                            <td className="px-6 py-5 text-center">
                                                <span className={`px-2 py-0.5 rounded-full border text-[8px] font-black uppercase ${m.status === 'confirmed' ? 'bg-green-900/40 text-green-400 border-green-800' : 'bg-orange-900/40 text-orange-400 border-orange-800'}`}>
                                                    {m.status === 'confirmed' ? 'PAGO' : 'PENDENTE'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-5 text-center">
                                                <div className="flex justify-center gap-3">
                                                    <div className={`p-1 ${m.viewedAt ? 'text-blue-400' : 'text-gray-700'}`} title="Visualizou"><EyeIcon className="w-4 h-4"/></div>
                                                    <div className={`p-1 ${m.downloadedAt ? 'text-green-400' : 'text-gray-700'}`} title="Baixou"><DownloadIcon className="w-4 h-4"/></div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-5 text-right">
                                                <div className="flex justify-end gap-2">
                                                    {m.status === 'confirmed' && m.benefitCode && (
                                                        <button onClick={() => handleAdminDownloadTicket(m)} disabled={isDownloadingPdfId === m.id} className="p-2 bg-indigo-900/30 text-indigo-400 rounded-xl hover:bg-indigo-600 transition-all">
                                                            {isDownloadingPdfId === m.id ? <RefreshIcon className="w-4 h-4 animate-spin" /> : <DownloadIcon className="w-4 h-4" />}
                                                        </button>
                                                    )}
                                                    <button onClick={() => handleManualActivateSingle(m)} disabled={isBulkProcessing} className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-[9px] font-black uppercase">ATIVAR</button>
                                                    <button onClick={() => handleRefundAction(m)} disabled={isProcessingId === m.id} className="p-2 bg-red-900/20 text-red-500 rounded-xl hover:bg-red-600 hover:text-white transition-all"><UndoIcon className="w-4 h-4" /></button>
                                                </div>
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
                        {vipEvents.map(ev => {
                            const stats = eventStats[ev.id] || { total: 0, available: 0 };
                            return (
                                <div key={ev.id} className="bg-dark/40 p-6 rounded-3xl border border-white/5 group hover:border-primary transition-all">
                                    <div className="flex justify-between items-start mb-4">
                                        <div>
                                            <h3 className="text-xl font-black text-white uppercase">{ev.name}</h3>
                                            <p className="text-primary font-black text-lg">R$ {ev.price.toFixed(2)}</p>
                                        </div>
                                        <div className={`w-3 h-3 rounded-full ${ev.isActive ? 'bg-green-500' : 'bg-red-500'}`}></div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3 mb-6">
                                        <div className="bg-white/5 p-3 rounded-2xl text-center">
                                            <p className="text-[8px] font-black text-gray-500 uppercase">Estoque</p>
                                            <p className="text-xl font-black text-white">{stats.total}</p>
                                        </div>
                                        <div className="bg-white/5 p-3 rounded-2xl text-center">
                                            <p className="text-[8px] font-black text-gray-500 uppercase">Disponível</p>
                                            <p className="text-xl font-black text-primary">{stats.available}</p>
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={() => { setEventForCodes(ev); setIsCodesModalOpen(true); }} className="flex-1 py-3 bg-indigo-900/30 text-indigo-400 border border-indigo-800 rounded-xl text-[10px] font-black uppercase flex items-center justify-center gap-2">
                                            <CogIcon className="w-4 h-4" /> CÓDIGOS
                                        </button>
                                        <button onClick={() => { setEditingEvent(ev); setIsModalOpen(true); }} className="p-3 bg-gray-800 text-white rounded-xl"><PencilIcon className="w-4 h-4" /></button>
                                        <button onClick={() => { if(confirm("Excluir?")) deleteVipEvent(ev.id).then(fetchData); }} className="p-3 bg-red-900/30 text-red-500 rounded-xl"><TrashIcon className="w-4 h-4"/></button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* MODAL EVENTO */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[110] flex items-center justify-center p-6" onClick={() => setIsModalOpen(false)}>
                    <div className="bg-secondary w-full max-w-2xl p-8 rounded-[2.5rem] border border-white/10 flex flex-col" onClick={e => e.stopPropagation()}>
                        <h2 className="text-2xl font-black text-white uppercase mb-6">Evento VIP</h2>
                        <form onSubmit={handleSaveEvent} className="space-y-4 overflow-y-auto pr-2 custom-scrollbar">
                            <div className="grid grid-cols-2 gap-4">
                                <input type="text" placeholder="Nome" value={editingEvent?.name || ''} onChange={e => setEditingEvent({...editingEvent!, name: e.target.value})} className="bg-dark border border-gray-700 rounded-xl p-3 text-white font-bold" required />
                                <input type="number" step="0.01" placeholder="Preço" value={editingEvent?.price || ''} onChange={e => setEditingEvent({...editingEvent!, price: Number(e.target.value)})} className="bg-dark border border-gray-700 rounded-xl p-3 text-white font-bold" required />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <input type="text" placeholder="Horário (22h às 05h)" value={editingEvent?.eventTime || ''} onChange={e => setEditingEvent({...editingEvent!, eventTime: e.target.value})} className="bg-dark border border-gray-700 rounded-xl p-3 text-white font-bold" />
                                <input type="text" placeholder="Local" value={editingEvent?.eventLocation || ''} onChange={e => setEditingEvent({...editingEvent!, eventLocation: e.target.value})} className="bg-dark border border-gray-700 rounded-xl p-3 text-white font-bold" />
                            </div>
                            <input type="text" placeholder="Slug Externo" value={editingEvent?.externalSlug || ''} onChange={e => setEditingEvent({...editingEvent!, externalSlug: e.target.value})} className="w-full bg-dark border border-gray-700 rounded-xl p-3 text-white font-bold" />
                            <textarea placeholder="Benefícios (Um por linha)" rows={4} value={editingEvent?.benefits?.join('\n') || ''} onChange={e => setEditingEvent({...editingEvent!, benefits: e.target.value.split('\n')})} className="w-full bg-dark border border-gray-700 rounded-xl p-3 text-white text-sm" />
                            <div className="flex gap-4">
                                <label className="flex items-center gap-2 text-white text-xs font-black uppercase"><input type="checkbox" checked={editingEvent?.isActive} onChange={e => setEditingEvent({...editingEvent!, isActive: e.target.checked})} /> Oferta Ativa</label>
                                <label className="flex items-center gap-2 text-red-500 text-xs font-black uppercase"><input type="checkbox" checked={editingEvent?.isSoldOut} onChange={e => setEditingEvent({...editingEvent!, isSoldOut: e.target.checked})} /> Esgotado</label>
                            </div>
                            <button type="submit" className="w-full py-4 bg-primary text-white font-black rounded-2xl uppercase text-xs">Salvar Alterações</button>
                        </form>
                    </div>
                </div>
            )}

            {isCodesModalOpen && eventForCodes && (
                <ManageCodesModal isOpen={isCodesModalOpen} onClose={() => setIsCodesModalOpen(false)} event={eventForCodes} onSaved={fetchData} onDownloadStock={handleDownloadEventStock} />
            )}
        </div>
    );
};

export default AdminClubVip;
