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
import { updatePromoter, getAllPromoters } from '../services/promoterService';
import { getOrganizations } from '../services/organizationService';
import { VipMembership, VipEvent, Organization, Promoter } from '../types';
import { firestore, functions } from '../firebase/config';
import { httpsCallable } from 'firebase/functions';
import { 
    ArrowLeftIcon, SearchIcon, CheckCircleIcon, XIcon, EyeIcon,
    TicketIcon, RefreshIcon, ClockIcon, UserIcon,
    BuildingOfficeIcon, PlusIcon, TrashIcon, PencilIcon, AlertTriangleIcon,
    WhatsAppIcon, InstagramIcon, DownloadIcon, ChartBarIcon, MegaphoneIcon, DocumentDuplicateIcon, FilterIcon, ExternalLinkIcon, MailIcon, LinkIcon, UndoIcon, CogIcon, MapPinIcon
} from '../components/Icons';
import firebase from 'firebase/compat/app';
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
                    <p className="text-[9px] text-gray-600 font-bold uppercase">Códigos duplicados serão ignorados automaticamente.</p>
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
    
    const [activeTab, setActiveTab] = useState<'members' | 'events' | 'recovery'>('members');
    const [memberships, setMemberships] = useState<VipMembership[]>([]);
    const [vipEvents, setVipEvents] = useState<VipEvent[]>([]);
    const [eventStats, setEventStats] = useState<Record<string, { total: number, available: number }>>({});
    
    const [isLoading, setIsLoading] = useState(true);
    const [filterStatus, setFilterStatus] = useState<'pending' | 'confirmed' | 'refunded' | 'all'>('all');
    const [filterBenefit, setFilterBenefit] = useState<'active' | 'waiting' | 'all'>('all');
    const [selectedEventId, setSelectedEventId] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isBulkProcessing, setIsBulkProcessing] = useState(false);
    const [isProcessingId, setIsProcessingId] = useState<string | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isCodesModalOpen, setIsCodesModalOpen] = useState(false);
    const [editingEvent, setEditingEvent] = useState<Partial<VipEvent> | null>(null);
    const [eventForCodes, setEventForCodes] = useState<VipEvent | null>(null);

    // Estado para download de PDF
    const [isDownloadingPdfId, setIsDownloadingPdfId] = useState<string | null>(null);

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
            const matchesStatus = filterStatus === 'all' || m.status === filterStatus;
            const matchesBenefit = filterBenefit === 'all' || 
                (filterBenefit === 'active' && m.isBenefitActive === true) ||
                (filterBenefit === 'waiting' && m.isBenefitActive === false && m.status === 'confirmed');
            
            const matchesSearch = 
                (m.promoterName || '').toLowerCase().includes(query) || 
                (m.promoterEmail || '').toLowerCase().includes(query);
            
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
            const targetList = activeTab === 'members' ? filteredMembers : memberships;
            const allIds = targetList.map(m => m.id);
            setSelectedIds(new Set(allIds));
        } else {
            setSelectedIds(new Set());
        }
    };

    const handleCopy = (text: string, msg: string = "Código copiado!") => {
        navigator.clipboard.writeText(text);
        alert(msg);
    };

    const handleAdminDownloadTicket = async (membership: VipMembership) => {
        if (isDownloadingPdfId) return;
        
        setIsDownloadingPdfId(membership.id);
        
        // Timeout para garantir que o componente off-screen foi renderizado
        setTimeout(async () => {
            const element = document.getElementById(`ticket-content-${membership.id}`);
            if (!element) {
                alert("Erro ao preparar o documento para captura.");
                setIsDownloadingPdfId(null);
                return;
            }

            const options = {
                margin: 0,
                filename: `VIP_ADMIN_${membership.promoterName.split(' ')[0].toUpperCase()}_${membership.vipEventName.replace(/\s+/g, '_')}.pdf`,
                image: { type: 'jpeg', quality: 1.0 },
                html2canvas: { 
                    scale: 3, 
                    useCORS: true, 
                    backgroundColor: '#000000',
                    logging: false,
                    scrollY: 0,
                    scrollX: 0,
                    windowWidth: 400,
                    windowHeight: 700
                },
                jsPDF: { 
                    unit: 'px', 
                    format: [400, 700],
                    orientation: 'portrait',
                    hotfixes: ['px_scaling']
                }
            };

            try {
                // @ts-ignore
                const html2pdf = window.html2pdf;
                await html2pdf().set(options).from(element).save();
            } catch (err) {
                console.error("Erro ao gerar PDF:", err);
                alert("Falha ao gerar PDF.");
            } finally {
                setIsDownloadingPdfId(null);
            }
        }, 1200);
    };

    // FIX: Added handleDownloadEventStock to download event codes as CSV.
    /**
     * Gera e baixa um arquivo CSV contendo todos os códigos de um evento.
     */
    const handleDownloadEventStock = async (event: VipEvent) => {
        setIsProcessingId(event.id);
        try {
            const codesData = await getVipEventCodes(event.id);
            if (codesData.length === 0) {
                alert("Nenhum código encontrado no estoque para este evento.");
                return;
            }

            const headers = ["Código", "Status", "Usado Por (Promoter ID)", "Data de Uso", "Criado Em"];
            const rows = codesData.map((c: any) => {
                const usedAt = toDateSafe(c.usedAt);
                const createdAt = toDateSafe(c.createdAt);
                return [
                    `"${c.code}"`,
                    `"${c.used ? 'USADO' : 'DISPONÍVEL'}"`,
                    `"${c.usedBy || ''}"`,
                    `"${usedAt ? usedAt.toLocaleString('pt-BR') : ''}"`,
                    `"${createdAt ? createdAt.toLocaleString('pt-BR') : ''}"`
                ].join(',');
            });

            const csvContent = [headers.join(','), ...rows].join('\n');
            const bom = new Uint8Array([0xEF, 0xBB, 0xBF]); // UTF-8 BOM para garantir acentuação no Excel
            const blob = new Blob([bom, csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement("a");
            const url = URL.createObjectURL(blob);
            
            link.setAttribute("href", url);
            link.setAttribute("download", `ESTOQUE_${event.name.replace(/\s+/g, '_')}_${new Date().getTime()}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (err: any) {
            alert("Erro ao baixar estoque: " + err.message);
        } finally {
            setIsProcessingId(null);
        }
    };

    const handleManualActivateSingle = async (membership: VipMembership) => {
        if (membership.status !== 'confirmed' && membership.status !== 'pending') {
             if(!window.confirm("Esta adesão não está marcada como PAGO. Deseja forçar a ativação com um cupom do estoque?")) return;
        }
        
        setIsBulkProcessing(true);
        try {
            const activateVip = httpsCallable(functions, 'activateVipMembership');
            const res: any = await activateVip({ membershipId: membership.id });
            
            if (res.data.success) {
                alert(`Sucesso! Código atribuído: ${res.data.code}`);
                fetchData();
            }
        } catch (e: any) { 
            alert("Erro ao ativar: " + e.message); 
        } finally { 
            setIsBulkProcessing(false); 
        }
    };

    const handleRefundAction = async (membership: VipMembership) => {
        if (!window.confirm(`ATENÇÃO: Deseja estornar a adesão de ${membership.promoterName}? O valor sairá das métricas e o benefício será cancelado no portal dela.`)) return;
        setIsProcessingId(membership.id);
        try {
            await refundVipMembership(membership.id);
            await updatePromoter(membership.promoterId, { 
                emocoesStatus: 'rejected',
                emocoesBenefitActive: false 
            });
            alert("Adesão estornada com sucesso!");
            fetchData();
        } catch (e: any) { alert("Erro ao estornar: " + e.message); } finally { setIsProcessingId(null); }
    };

    const handleOpenEventModal = (ev: Partial<VipEvent> | null = null) => {
        setEditingEvent(ev || { benefits: [], isActive: true, isSoldOut: false });
        setIsModalOpen(true);
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
                description: editingEvent.description || '',
                benefits: editingEvent.benefits || [],
                externalSlug: editingEvent.externalSlug || '',
                pixelId: editingEvent.pixelId || '',
                pixKey: editingEvent.pixKey || '',
                eventTime: editingEvent.eventTime || '',
                eventLocation: editingEvent.eventLocation || ''
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

    const handleOpenCodes = (ev: VipEvent) => {
        setEventForCodes(ev);
        setIsCodesModalOpen(true);
    };

    return (
        <div className="pb-40">
            {/* CONTAINER OFF-SCREEN PARA RENDERIZAÇÃO DE PDF */}
            <div className="fixed left-[-2000px] top-0 pointer-events-none" aria-hidden="true" style={{ width: '400px' }}>
                {filteredMembers.map(m => {
                    const event = vipEvents.find(e => e.id === m.vipEventId);
                    const enrichedMemb = {
                        ...m,
                        eventTime: event?.eventTime,
                        eventLocation: event?.eventLocation
                    };
                    return (
                        <div key={`export-admin-${m.id}`}>
                            <VipTicket membership={enrichedMemb} isExporting={true} />
                        </div>
                    );
                })}
            </div>

            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4 px-4 md:px-0">
                <h1 className="text-3xl font-black text-white uppercase tracking-tighter flex items-center gap-3">
                    <TicketIcon className="w-8 h-8 text-primary" /> Gestão Clube VIP
                </h1>
                <div className="flex flex-wrap gap-2">
                    <button onClick={() => fetchData()} className="p-3 bg-gray-800 text-gray-400 rounded-2xl hover:text-white transition-colors">
                        <RefreshIcon className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`}/>
                    </button>
                </div>
            </div>

            <div className="bg-secondary/60 backdrop-blur-xl rounded-[2.5rem] p-6 border border-white/5 shadow-2xl space-y-6">
                
                {/* ABA MEMBROS */}
                {activeTab === 'members' && (
                    <>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
                            <table className="w-full text-left border-collapse">
                                <thead className="bg-dark/50 text-[10px] font-black text-gray-500 uppercase tracking-widest border-b border-white/5">
                                    <tr>
                                        <th className="px-6 py-5 w-10 text-center">
                                            <input 
                                                type="checkbox" 
                                                onChange={handleSelectAll}
                                                checked={filteredMembers.length > 0 && selectedIds.size === filteredMembers.length}
                                                className="w-4 h-4 rounded border-gray-700 bg-dark text-primary focus:ring-0" 
                                            />
                                        </th>
                                        <th className="px-6 py-5">Membro</th>
                                        <th className="px-6 py-5 text-center">Status Pgto</th>
                                        <th className="px-6 py-5 text-center">Rastreio</th>
                                        <th className="px-6 py-4 text-right">Ação</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {filteredMembers.map(m => {
                                        const viewedDate = toDateSafe(m.viewedAt);
                                        const downloadedDate = toDateSafe(m.downloadedAt);

                                        return (
                                            <tr key={m.id} className={`hover:bg-white/[0.02] transition-colors ${selectedIds.has(m.id) ? 'bg-primary/5' : ''}`}>
                                                <td className="px-6 py-5 text-center">
                                                    <input 
                                                        type="checkbox" 
                                                        checked={selectedIds.has(m.id)}
                                                        onChange={() => toggleSelectOne(m.id)}
                                                        className="w-4 h-4 rounded border-gray-700 bg-dark text-primary focus:ring-0" 
                                                    />
                                                </td>
                                                <td className="px-6 py-5">
                                                    <p className="text-sm font-black text-white uppercase truncate">{m.promoterName}</p>
                                                    <p className="text-[10px] text-gray-500 font-mono lowercase truncate">{m.promoterEmail}</p>
                                                    <p className="text-[9px] text-primary font-black uppercase mt-1">{m.vipEventName}</p>
                                                </td>
                                                <td className="px-6 py-5 text-center">
                                                    <span className={`px-2 py-0.5 rounded-full border text-[8px] font-black uppercase ${m.status === 'confirmed' ? 'bg-green-900/40 text-green-400 border-green-800' : m.status === 'refunded' ? 'bg-red-900/40 text-red-400 border-red-800' : 'bg-orange-900/40 text-orange-400 border-orange-800'}`}>
                                                        {m.status === 'confirmed' ? 'PAGO' : m.status === 'refunded' ? 'ESTORNADO' : 'PENDENTE'}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-5 text-center">
                                                    <div className="flex flex-col items-center gap-2">
                                                        <div className="flex gap-4">
                                                            <div className={`flex flex-col items-center gap-1 ${viewedDate ? 'text-blue-400' : 'text-gray-700'}`} title={viewedDate ? `Visualizado em ${viewedDate.toLocaleString()}` : 'Nunca visualizou'}>
                                                                <EyeIcon className="w-4 h-4" />
                                                                <span className="text-[8px] font-black">{viewedDate ? viewedDate.toLocaleDateString('pt-BR') : '---'}</span>
                                                            </div>
                                                            <div className={`flex flex-col items-center gap-1 ${downloadedDate ? 'text-green-400' : 'text-gray-700'}`} title={downloadedDate ? `Baixado em ${downloadedDate.toLocaleString()}` : 'Nunca baixou'}>
                                                                <DownloadIcon className="w-4 h-4" />
                                                                <span className="text-[8px] font-black">{downloadedDate ? downloadedDate.toLocaleDateString('pt-BR') : '---'}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-5 text-right">
                                                    <div className="flex justify-end gap-2">
                                                        {m.status === 'confirmed' && m.benefitCode && (
                                                            <button 
                                                                onClick={() => handleAdminDownloadTicket(m)}
                                                                disabled={isDownloadingPdfId === m.id}
                                                                className="p-2 bg-indigo-900/30 text-indigo-400 rounded-xl hover:bg-indigo-600 hover:text-white transition-all border border-indigo-800/30"
                                                                title="Baixar PDF do Ingresso"
                                                            >
                                                                {isDownloadingPdfId === m.id ? <RefreshIcon className="w-4 h-4 animate-spin" /> : <DownloadIcon className="w-4 h-4" />}
                                                            </button>
                                                        )}
                                                        {m.status !== 'refunded' && (
                                                            <>
                                                                <button onClick={() => handleManualActivateSingle(m)} disabled={isBulkProcessing} className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-[9px] font-black uppercase hover:bg-indigo-500">ATIVAR</button>
                                                                <button onClick={() => handleRefundAction(m)} disabled={isProcessingId === m.id} className="p-2 bg-red-900/20 text-red-500 rounded-xl hover:bg-red-600 hover:text-white transition-all border border-red-900/30" title="Estornar">
                                                                    <UndoIcon className="w-4 h-4" />
                                                                </button>
                                                            </>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}

                {/* ABA EVENTOS */}
                {activeTab === 'events' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {vipEvents.map(ev => {
                            const stats = eventStats[ev.id] || { total: 0, available: 0 };
                            const issued = stats.total - stats.available;
                            
                            return (
                                <div key={ev.id} className="bg-dark/40 p-6 rounded-3xl border border-white/5 flex flex-col group hover:border-primary transition-all">
                                    <div className="flex justify-between items-start mb-4">
                                        <div className="min-w-0 flex-grow">
                                            <h3 className="text-xl font-black text-white uppercase truncate">{ev.name}</h3>
                                            <p className="text-primary font-black text-lg mt-1">R$ {ev.price.toFixed(2)}</p>
                                        </div>
                                        <div className="flex flex-col items-end gap-2">
                                            <div className={`w-3 h-3 rounded-full ${ev.isActive ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]' : 'bg-red-500'}`}></div>
                                            {(ev.isSoldOut || (stats.total > 0 && stats.available === 0)) && (
                                                <span className="px-2 py-0.5 bg-red-600 text-white text-[8px] font-black rounded uppercase tracking-widest shadow-lg animate-pulse">ESGOTADO</span>
                                            )}
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-3 mb-6">
                                        <div className="bg-white/5 p-3 rounded-2xl border border-white/5 text-center">
                                            <p className="text-[8px] font-black text-gray-500 uppercase tracking-widest mb-1">Cód. Totais</p>
                                            <p className="text-xl font-black text-white">{stats.total}</p>
                                        </div>
                                        <div className="bg-white/5 p-3 rounded-2xl border border-white/5 text-center">
                                            <p className="text-[8px] font-black text-gray-500 uppercase tracking-widest mb-1">Emitidos</p>
                                            <p className="text-xl font-black text-primary">{issued}</p>
                                        </div>
                                    </div>

                                    <div className="flex-grow space-y-2 mb-6">
                                        <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Benefícios:</p>
                                        {ev.benefits.map((b, i) => (
                                            <p key={i} className="text-xs text-gray-300 flex items-center gap-2"><CheckCircleIcon className="w-3 h-3 text-primary" /> {b}</p>
                                        ))}
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        <button onClick={() => handleOpenCodes(ev)} className="flex-1 py-3 bg-indigo-900/30 text-indigo-400 border border-indigo-800 rounded-xl text-[10px] font-black uppercase flex items-center justify-center gap-2 hover:bg-indigo-900/50">
                                            <CogIcon className="w-4 h-4" /> CÓDIGOS
                                        </button>
                                        <button 
                                            onClick={() => handleDownloadEventStock(ev)}
                                            className="p-3 bg-gray-800 text-white rounded-xl border border-white/5 hover:bg-primary transition-all"
                                            title="Baixar Estoque de Códigos (XLSX)"
                                        >
                                            <DownloadIcon className="w-4 h-4" />
                                        </button>
                                        <button onClick={() => handleOpenEventModal(ev)} className="p-3 bg-gray-800 text-white font-black text-[10px] uppercase rounded-xl hover:bg-gray-700 transition-all border border-white/5"><PencilIcon className="w-4 h-4" /></button>
                                        <button onClick={() => handleDeleteEvent(ev.id)} className="p-3 bg-red-900/30 text-red-400 rounded-xl border border-red-500/20 hover:bg-red-900/50 transition-all shadow-lg"><TrashIcon className="w-4 h-4"/></button>
                                    </div>
                                </div>
                            );
                        })}
                        {vipEvents.length === 0 && !isLoading && (
                            <div className="col-span-full py-20 text-center text-gray-500 font-black uppercase text-xs tracking-widest">Nenhuma oferta VIP cadastrada.</div>
                        )}
                    </div>
                )}
            </div>

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

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-gray-500 uppercase ml-1">Horário (Ex: 22h às 05h)</label>
                                    <input type="text" value={editingEvent?.eventTime || ''} onChange={e => setEditingEvent({...editingEvent!, eventTime: e.target.value})} placeholder="Ex: 22h às 05h" className="w-full bg-dark border border-gray-700 rounded-xl p-3 text-white font-bold" />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-gray-500 uppercase ml-1">Local (Nome ou Endereço)</label>
                                    <input type="text" value={editingEvent?.eventLocation || ''} onChange={e => setEditingEvent({...editingEvent!, eventLocation: e.target.value})} placeholder="Ex: Marina Park" className="w-full bg-dark border border-gray-700 rounded-xl p-3 text-white font-bold" />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-gray-500 uppercase ml-1">Slug Externo (Site ST Ingressos)</label>
                                    <input type="text" value={editingEvent?.externalSlug || ''} onChange={e => setEditingEvent({...editingEvent!, externalSlug: e.target.value})} placeholder="ex: emocoes-sunset" className="w-full bg-dark border border-gray-700 rounded-xl p-3 text-white font-bold" />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-gray-500 uppercase ml-1">Meta Pixel ID (Opcional)</label>
                                    <input type="text" value={editingEvent?.pixelId || ''} onChange={e => setEditingEvent({...editingEvent!, pixelId: e.target.value})} placeholder="Apenas o ID numérico" className="w-full bg-dark border border-gray-700 rounded-xl p-3 text-white font-bold" />
                                </div>
                            </div>

                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-gray-500 uppercase ml-1">Benefícios (Um por linha)</label>
                                <textarea rows={4} value={editingEvent?.benefits?.join('\n') || ''} onChange={e => setEditingEvent({...editingEvent!, benefits: e.target.value.split('\n')})} className="w-full bg-dark border border-gray-700 rounded-xl p-3 text-white text-sm" />
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <label className="flex items-center gap-3 cursor-pointer p-4 bg-dark/50 rounded-2xl border border-white/5 hover:border-primary/30 transition-all">
                                    <input type="checkbox" checked={editingEvent?.isActive || false} onChange={e => setEditingEvent({...editingEvent!, isActive: e.target.checked})} className="w-5 h-5 rounded border-gray-600 bg-dark text-primary" />
                                    <span className="text-[10px] font-black text-gray-300 uppercase tracking-widest">Oferta Ativa no Site</span>
                                </label>

                                <label className="flex items-center gap-3 cursor-pointer p-4 bg-dark/50 rounded-2xl border border-white/5 hover:border-red-500/30 transition-all">
                                    <input type="checkbox" checked={editingEvent?.isSoldOut || false} onChange={e => setEditingEvent({...editingEvent!, isSoldOut: e.target.checked})} className="w-5 h-5 rounded border-gray-600 bg-dark text-red-500" />
                                    <span className="text-[10px] font-black text-gray-300 uppercase tracking-widest">Marcar como Esgotado</span>
                                </label>
                            </div>

                            <button type="submit" disabled={isBulkProcessing} className="w-full py-5 bg-primary text-white font-black rounded-2xl shadow-xl uppercase text-xs tracking-widest disabled:opacity-50">
                                {isBulkProcessing ? 'SALVANDO...' : 'CONFIRMAR E SALVAR'}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* MODAL DE CÓDIGOS EM LOTE */}
            {isCodesModalOpen && eventForCodes && (
                <ManageCodesModal 
                    isOpen={isCodesModalOpen} 
                    onClose={() => setIsCodesModalOpen(false)} 
                    event={eventForCodes} 
                    onSaved={fetchData} 
                    onDownloadStock={handleDownloadEventStock}
                />
            )}
        </div>
    );
};

export default AdminClubVip;
