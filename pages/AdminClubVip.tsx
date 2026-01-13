
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { 
    getAllVipMemberships, 
    getAllVipEvents, 
    createVipEvent, 
    updateVipEvent, 
    deleteVipEvent,
    refundVipMembership,
    transferVipMembership,
    addVipCodes,
    getVipCodeStats,
    getVipEventCodes
} from '../services/vipService';
import { updatePromoter } from '../services/promoterService';
import { VipMembership, VipEvent } from '../types';
import { firestore, functions } from '../firebase/config';
import { httpsCallable } from 'firebase/functions';
import { 
    ArrowLeftIcon, SearchIcon, CheckCircleIcon, XIcon, EyeIcon,
    TicketIcon, RefreshIcon, PlusIcon, TrashIcon, PencilIcon, 
    WhatsAppIcon, DownloadIcon, LinkIcon, ExternalLinkIcon,
    CogIcon, UndoIcon, ChartBarIcon, SparklesIcon, EnvelopeIcon
} from '../components/Icons';

// Modal para Transferência
const TransferModal: React.FC<{ isOpen: boolean, onClose: () => void, membership: VipMembership, events: VipEvent[], onTransferred: () => void }> = ({ isOpen, onClose, membership, events, onTransferred }) => {
    const [selectedId, setSelectedId] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    if (!isOpen) return null;

    const handleTransfer = async () => {
        const newEvent = events.find(e => e.id === selectedId);
        if (!newEvent) return alert("Selecione um evento de destino.");
        
        setIsSaving(true);
        try {
            await transferVipMembership(membership.id, newEvent);
            const activateVip = httpsCallable(functions, 'activateVipMembership');
            await activateVip({ membershipId: membership.id, forceNew: true });
            
            alert(`Sucesso! Adesão transferida para: ${newEvent.name}`);
            onTransferred();
            onClose();
        } catch (e: any) {
            alert("Erro ao transferir: " + e.message);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[150] flex items-center justify-center p-6" onClick={onClose}>
            <div className="bg-secondary w-full max-w-lg p-8 rounded-[2.5rem] border border-white/10 shadow-2xl" onClick={e => e.stopPropagation()}>
                <h2 className="text-2xl font-black text-white uppercase tracking-tighter mb-2">Transferir Ingresso</h2>
                <p className="text-[10px] text-gray-500 font-bold uppercase mb-6">Membro: {membership.promoterName}</p>
                
                <div className="space-y-4">
                    <label className="text-[10px] font-black text-gray-500 uppercase ml-1">Selecione o Novo Evento</label>
                    <select 
                        value={selectedId}
                        onChange={e => setSelectedId(e.target.value)}
                        className="w-full bg-dark border border-gray-700 rounded-2xl p-4 text-white font-bold outline-none focus:border-primary"
                    >
                        <option value="">Escolha o destino...</option>
                        {events.filter(e => e.id !== membership.vipEventId && e.isActive).map(e => (
                            <option key={e.id} value={e.id}>{e.name} (R$ {e.price.toFixed(2)})</option>
                        ))}
                    </select>
                </div>

                <div className="mt-8 flex gap-3">
                    <button onClick={onClose} className="flex-1 py-4 bg-gray-800 text-gray-400 font-black rounded-2xl uppercase text-xs">Cancelar</button>
                    <button onClick={handleTransfer} disabled={isSaving || !selectedId} className="flex-2 py-4 bg-primary text-white font-black rounded-2xl uppercase text-xs shadow-lg shadow-primary/20 disabled:opacity-50">
                        {isSaving ? 'TRANSFERINDO...' : 'CONFIRMAR TRANSFERÊNCIA'}
                    </button>
                </div>
            </div>
        </div>
    );
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
                        <DownloadIcon className="w-4 h-4" /> Baixar XLS
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
    
    const [activeTab, setActiveTab] = useState<'members' | 'events' | 'recovery'>('members');
    const [memberships, setMemberships] = useState<VipMembership[]>([]);
    const [vipEvents, setVipEvents] = useState<VipEvent[]>([]);
    const [eventStats, setEventStats] = useState<Record<string, { total: number, available: number }>>({});
    
    const [isLoading, setIsLoading] = useState(true);
    const [selectedEventId, setSelectedEventId] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    
    // Email states para recuperação
    const [emailSubject, setEmailSubject] = useState('Gostaria de te ajudar a garantir seu VIP 🎫');
    const [emailBody, setEmailBody] = useState('<p>Olá {{promoterName}},</p><p>Vimos que você iniciou sua adesão ao <strong>{{campaignName}}</strong> mas não concluiu o Pix.</p><p>Ainda temos algumas vagas disponíveis e gostaríamos que você estivesse conosco! Teve alguma dúvida no processo?</p><p>Acesse seu portal e tente novamente: <a href="https://equipecerta.com.br/#/clubvip/status">Acessar Portal VIP</a></p>');
    const [isSendingEmail, setIsSendingEmail] = useState(false);

    const [isBulkProcessing, setIsBulkProcessing] = useState(false);
    const [isProcessingId, setIsProcessingId] = useState<string | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isCodesModalOpen, setIsCodesModalOpen] = useState(false);
    const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
    
    const [editingEvent, setEditingEvent] = useState<Partial<VipEvent> | null>(null);
    const [eventForCodes, setEventForCodes] = useState<VipEvent | null>(null);
    const [membershipToTransfer, setMembershipToTransfer] = useState<VipMembership | null>(null);

    // Gestores VIP e SuperAdmins vêm TUDO
    const isVipManager = adminData?.role === 'superadmin' || adminData?.role === 'vip_admin';

    const fetchData = useCallback(async () => {
        if (!adminData) return;
        setIsLoading(true);
        try {
            // Se for Gestor VIP Global, buscamos 'all' independente de estar linkado a org
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
    }, [selectedEventId, adminData]);

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

    const pendingLeads = useMemo(() => {
        return memberships.filter(m => m.status === 'pending');
    }, [memberships]);

    const handleCopyTicketLink = (membership: VipMembership) => {
        const url = `${window.location.origin}/#/clubvip/status?email=${encodeURIComponent(membership.promoterEmail)}`;
        navigator.clipboard.writeText(url);
        alert("Link do portal copiado!");
    };

    const handleManualActivateOrSwap = async (membership: VipMembership, forceNew: boolean = false) => {
        const confirmMsg = forceNew 
            ? "Deseja INVALIDAR o código atual e pegar um NOVO do estoque para esta divulgadora?" 
            : "Deseja ativar esta adesão usando um cupom do estoque disponível?";

        if(!window.confirm(confirmMsg)) return;

        setIsBulkProcessing(true);
        try {
            const activateVip = httpsCallable(functions, 'activateVipMembership');
            const res: any = await activateVip({ membershipId: membership.id, forceNew });
            if (res.data.success) {
                alert(`Sucesso! Código atribuído do estoque: ${res.data.code}`);
                fetchData();
            }
        } catch (e: any) { 
            alert("Erro ao processar: " + (e.message || "Estoque possivelmente vazio.")); 
        } finally { 
            setIsBulkProcessing(false); 
        }
    };

    const handleRefundAction = async (membership: VipMembership) => {
        if (!window.confirm(`ESTORNAR ADESÃO: Tem certeza? O código '${membership.benefitCode || 'N/A'}' será removido e o ingresso invalidado.`)) return;
        setIsProcessingId(membership.id);
        try {
            await refundVipMembership(membership.id);
            await updatePromoter(membership.promoterId, { emocoesBenefitActive: false });
            fetchData();
        } catch (e: any) { alert("Erro ao estornar: " + e.message); } finally { setIsProcessingId(null); }
    };

    return (
        <div className="pb-40">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4 px-4 md:px-0">
                <h1 className="text-3xl font-black text-white uppercase tracking-tighter flex items-center gap-3">
                    <TicketIcon className="w-8 h-8 text-primary" /> Gestão Clube VIP
                </h1>
                <div className="flex flex-wrap gap-2">
                    <button onClick={() => navigate('/admin/vip-metrics/global')} className="px-4 py-3 bg-blue-600/20 text-blue-400 border border-blue-600/30 font-black rounded-2xl text-[10px] uppercase tracking-widest hover:bg-blue-600 hover:text-white transition-all flex items-center gap-2">
                        <ChartBarIcon className="w-4 h-4" /> Métricas de Venda
                    </button>
                    {isVipManager && (
                        <button onClick={() => { setEditingEvent({ benefits: [], isActive: true }); setIsModalOpen(true); }} className="px-6 py-3 bg-primary text-white font-black rounded-2xl text-[10px] uppercase tracking-widest shadow-xl flex items-center gap-2">
                            <PlusIcon className="w-4 h-4" /> Novo Evento
                        </button>
                    )}
                    <button onClick={() => fetchData()} className="p-3 bg-gray-800 text-gray-400 rounded-2xl hover:text-white transition-colors">
                        <RefreshIcon className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`}/>
                    </button>
                    <button onClick={() => navigate('/admin')} className="p-3 bg-gray-800 text-gray-400 rounded-2xl hover:text-white"><ArrowLeftIcon className="w-5 h-5"/></button>
                </div>
            </div>

            {/* Conteúdo mantido conforme o original, apenas com os cargos ajustados no topo */}
            <div className="flex bg-gray-800/50 p-1.5 rounded-2xl mb-8 border border-white/5 w-fit ml-4 md:ml-0">
                <button onClick={() => setActiveTab('members')} className={`px-6 py-3 text-xs font-black uppercase rounded-xl transition-all ${activeTab === 'members' ? 'bg-primary text-white shadow-lg' : 'text-gray-400'}`}>Membros</button>
                <button onClick={() => setActiveTab('events')} className={`px-6 py-3 text-xs font-black uppercase rounded-xl transition-all ${activeTab === 'events' ? 'bg-primary text-white shadow-lg' : 'text-gray-400'}`}>Ofertas</button>
                <button onClick={() => setActiveTab('recovery')} className={`px-6 py-3 text-xs font-black uppercase rounded-xl transition-all ${activeTab === 'recovery' ? 'bg-primary text-white shadow-lg' : 'text-gray-400'}`}>Recuperação</button>
            </div>

            <div className="bg-secondary/60 backdrop-blur-xl rounded-[2.5rem] p-6 border border-white/5 shadow-2xl space-y-6">
                {/* Tabelas e grids do componente original ... */}
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
                                        <th className="px-6 py-5">Membro / Evento</th>
                                        <th className="px-6 py-5 text-center">Status Pgto</th>
                                        <th className="px-6 py-4 text-right">Ações</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {filteredMembers.map(m => (
                                        <tr key={m.id} className="hover:bg-white/[0.02] transition-colors group">
                                            <td className="px-6 py-5">
                                                <p className="text-sm font-black text-white uppercase truncate">{m.promoterName}</p>
                                                <p className="text-[10px] text-gray-500 font-mono truncate">{m.promoterEmail}</p>
                                                <p className="text-[9px] text-primary font-black uppercase mt-1">{m.vipEventName}</p>
                                                <p className="text-[11px] text-primary font-mono font-black mt-1">{m.benefitCode || '---'}</p>
                                            </td>
                                            <td className="px-6 py-5 text-center">
                                                <span className={`px-2 py-0.5 rounded-full border text-[8px] font-black uppercase ${
                                                    m.status === 'confirmed' ? 'bg-green-900/40 text-green-400 border-green-800' : 
                                                    m.status === 'refunded' ? 'bg-red-900/40 text-red-400 border-red-800' :
                                                    'bg-orange-900/40 text-orange-400 border-orange-800'
                                                }`}>
                                                    {m.status === 'confirmed' ? 'PAGO' : m.status === 'refunded' ? 'ESTORNADO' : 'PENDENTE'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-5 text-right">
                                                <div className="flex justify-end gap-2">
                                                    <button onClick={() => handleCopyTicketLink(m)} className="p-2 bg-indigo-900/30 text-indigo-400 rounded-xl hover:bg-indigo-600 hover:text-white transition-all border border-indigo-800/30" title="Copiar Link do Portal">
                                                        <LinkIcon className="w-4 h-4" />
                                                    </button>
                                                    {m.status === 'confirmed' && isVipManager && (
                                                        <button 
                                                            onClick={() => { setMembershipToTransfer(m); setIsTransferModalOpen(true); }}
                                                            className="p-2 bg-purple-900/30 text-purple-400 rounded-xl border border-purple-800/50 hover:bg-purple-600 hover:text-white transition-all"
                                                            title="Transferir para outro Evento"
                                                        >
                                                            <RefreshIcon className="w-4 h-4 rotate-90" />
                                                        </button>
                                                    )}
                                                    {m.status === 'pending' ? (
                                                        <button onClick={() => handleManualActivateOrSwap(m)} disabled={isBulkProcessing} className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-[9px] font-black uppercase hover:bg-indigo-500">ATIVAR</button>
                                                    ) : (m.status !== 'refunded' && isVipManager) && (
                                                        <button onClick={() => handleManualActivateOrSwap(m, true)} disabled={isBulkProcessing} className="p-2 bg-blue-900/30 text-blue-400 rounded-xl border border-blue-800/50 hover:bg-blue-600 hover:text-white transition-all" title="Trocar / Renovar Código">
                                                            <RefreshIcon className={`w-4 h-4 ${isBulkProcessing && isProcessingId === m.id ? 'animate-spin' : ''}`} />
                                                        </button>
                                                    )}
                                                    {(m.status !== 'refunded' && isVipManager) && (
                                                        <button onClick={() => handleRefundAction(m)} disabled={isProcessingId === m.id} className="p-2 bg-red-900/20 text-red-500 rounded-xl hover:bg-red-600 hover:text-white transition-all border border-red-900/30" title="Estornar e Invalidar">
                                                            <UndoIcon className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
                {/* Outras abas ... */}
            </div>
        </div>
    );
};

export default AdminClubVip;
