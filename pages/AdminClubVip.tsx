
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
    updateVipMembership
} from '../services/vipService';
import { updatePromoter } from '../services/promoterService';
import { VipMembership, VipEvent } from '../types';
import { firestore, functions } from '../firebase/config';
import { httpsCallable } from 'firebase/functions';
import { 
    ArrowLeftIcon, SearchIcon, CheckCircleIcon, XIcon, EyeIcon,
    TicketIcon, RefreshIcon, PlusIcon, TrashIcon, PencilIcon, 
    WhatsAppIcon, DownloadIcon, LinkIcon, ExternalLinkIcon,
    CogIcon, UndoIcon, ChartBarIcon, SparklesIcon, EnvelopeIcon,
    UserIcon, MapPinIcon, ClockIcon
} from '../components/Icons';

// Modal para Edição de Dados Cadastrais
const EditMembershipModal: React.FC<{ 
    isOpen: boolean, 
    onClose: () => void, 
    membership: VipMembership, 
    onSaved: () => void 
}> = ({ isOpen, onClose, membership, onSaved }) => {
    const [formData, setFormData] = useState({
        promoterName: '',
        promoterEmail: '',
        promoterWhatsapp: '',
        promoterInstagram: '',
        promoterTaxId: ''
    });
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (isOpen && membership) {
            setFormData({
                promoterName: membership.promoterName || '',
                promoterEmail: membership.promoterEmail || '',
                promoterWhatsapp: membership.promoterWhatsapp || '',
                promoterInstagram: membership.promoterInstagram || '',
                promoterTaxId: membership.promoterTaxId || ''
            });
        }
    }, [isOpen, membership]);

    if (!isOpen) return null;

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            await updateVipMembership(membership.id, {
                promoterName: formData.promoterName,
                promoterEmail: formData.promoterEmail.toLowerCase().trim(),
                promoterWhatsapp: formData.promoterWhatsapp.replace(/\D/g, ''),
                promoterInstagram: formData.promoterInstagram.replace('@', '').trim(),
                promoterTaxId: formData.promoterTaxId.replace(/\D/g, '')
            });
            alert("Dados atualizados com sucesso!");
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
                    <h2 className="text-2xl font-black text-white uppercase tracking-tighter">Editar Cadastro</h2>
                    <button onClick={onClose} className="p-2 text-gray-500 hover:text-white"><XIcon className="w-6 h-6"/></button>
                </div>
                
                <form onSubmit={handleSave} className="space-y-4">
                    <div className="space-y-1">
                        <label className="text-[10px] font-black text-gray-500 uppercase ml-1">Nome Completo</label>
                        <input 
                            type="text" 
                            value={formData.promoterName} 
                            onChange={e => setFormData({...formData, promoterName: e.target.value})}
                            className="w-full bg-dark border border-gray-700 rounded-2xl p-4 text-white font-bold outline-none focus:border-primary"
                            required
                        />
                    </div>

                    <div className="space-y-1">
                        <label className="text-[10px] font-black text-primary uppercase ml-1">E-mail de Acesso (Cuidado ao alterar)</label>
                        <input 
                            type="email" 
                            value={formData.promoterEmail} 
                            onChange={e => setFormData({...formData, promoterEmail: e.target.value})}
                            className="w-full bg-dark border border-primary/30 rounded-2xl p-4 text-white font-bold outline-none focus:border-primary"
                            required
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-gray-500 uppercase ml-1">WhatsApp</label>
                            <input 
                                type="tel" 
                                value={formData.promoterWhatsapp} 
                                onChange={e => setFormData({...formData, promoterWhatsapp: e.target.value})}
                                className="w-full bg-dark border border-gray-700 rounded-2xl p-4 text-white font-bold outline-none focus:border-primary"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-gray-500 uppercase ml-1">Instagram</label>
                            <input 
                                type="text" 
                                value={formData.promoterInstagram} 
                                onChange={e => setFormData({...formData, promoterInstagram: e.target.value})}
                                className="w-full bg-dark border border-gray-700 rounded-2xl p-4 text-white font-bold outline-none focus:border-primary"
                            />
                        </div>
                    </div>

                    <div className="space-y-1">
                        <label className="text-[10px] font-black text-gray-500 uppercase ml-1">CPF / CNPJ</label>
                        <input 
                            type="text" 
                            value={formData.promoterTaxId} 
                            onChange={e => setFormData({...formData, promoterTaxId: e.target.value})}
                            className="w-full bg-dark border border-gray-700 rounded-2xl p-4 text-white font-bold outline-none focus:border-primary"
                        />
                    </div>

                    <div className="mt-8 flex gap-3 pt-4">
                        <button type="button" onClick={onClose} className="flex-1 py-4 bg-gray-800 text-gray-400 font-black rounded-2xl uppercase text-xs">Cancelar</button>
                        <button type="submit" disabled={isSaving} className="flex-2 py-4 bg-primary text-white font-black rounded-2xl uppercase text-xs shadow-lg shadow-primary/20 disabled:opacity-50">
                            {isSaving ? 'SALVANDO...' : 'SALVAR ALTERAÇÕES'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

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
const ManageCodesModal: React.FC<{ isOpen: boolean, onClose: () => void, event: VipEvent, onSaved: () => void }> = ({ isOpen, onClose, event, onSaved }) => {
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
    
    const [isBulkProcessing, setIsBulkProcessing] = useState(false);
    const [isProcessingId, setIsProcessingId] = useState<string | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isCodesModalOpen, setIsCodesModalOpen] = useState(false);
    const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
    const [isEditMembershipOpen, setIsEditMembershipOpen] = useState(false);
    
    const [editingEvent, setEditingEvent] = useState<Partial<VipEvent> | null>(null);
    const [eventForCodes, setEventForCodes] = useState<VipEvent | null>(null);
    const [membershipToTransfer, setMembershipToTransfer] = useState<VipMembership | null>(null);
    const [membershipToEdit, setMembershipToEdit] = useState<VipMembership | null>(null);

    const isVipManager = adminData?.role === 'superadmin' || adminData?.role === 'vip_admin';

    const fetchData = useCallback(async () => {
        if (!adminData) return;
        setIsLoading(true);
        try {
            const [eventsData, membersData] = await Promise.all([
                getAllVipEvents(),
                getAllVipMemberships(selectedEventId)
            ]);
            
            // Exibe os dados principais imediatamente para não travar a UI
            setVipEvents(eventsData);
            setMemberships(membersData);

            // Busca estatísticas de estoque de forma assíncrona e individual
            const stats: Record<string, { total: number, available: number }> = {};
            for (const ev of eventsData) {
                try {
                    const available = await getVipCodeStats(ev.id);
                    const totalSnap = await firestore.collection('vipEvents').doc(ev.id).collection('availableCodes').get();
                    stats[ev.id] = { total: totalSnap.size, available };
                } catch (e) {
                    stats[ev.id] = { total: 0, available: 0 };
                }
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
                (m.promoterEmail || '').toLowerCase().includes(query) ||
                (m.promoterWhatsapp || '').includes(query);
            
            const matchesEvent = selectedEventId === 'all' || m.vipEventId === selectedEventId;
            return matchesSearch && matchesEvent;
        });
    }, [memberships, searchQuery, selectedEventId]);

    const handleSaveEvent = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingEvent?.name || !editingEvent?.price) return;
        
        try {
            const data = {
                name: editingEvent.name,
                price: Number(editingEvent.price),
                description: editingEvent.description || '',
                benefits: editingEvent.benefits || [],
                isActive: editingEvent.isActive ?? true,
                eventTime: editingEvent.eventTime || '',
                eventLocation: editingEvent.eventLocation || '',
                attractions: editingEvent.attractions || '',
                pixKey: editingEvent.pixKey || '',
                externalSlug: editingEvent.externalSlug || ''
            };

            if (editingEvent.id) {
                await updateVipEvent(editingEvent.id, data);
            } else {
                await createVipEvent(data as any);
            }
            
            setIsModalOpen(false);
            fetchData();
        } catch (e: any) {
            alert("Erro ao salvar evento: " + e.message);
        }
    };

    const handleManualActivateOrSwap = async (membership: VipMembership, forceNew: boolean = false) => {
        const confirmMsg = forceNew 
            ? "Deseja INVALIDAR o código atual e pegar um NOVO do estoque para esta divulgadora?" 
            : "Deseja ativar esta adesão usando um cupom do estoque disponível?";

        if(!window.confirm(confirmMsg)) return;

        setIsBulkProcessing(true);
        setIsProcessingId(membership.id);
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
            setIsProcessingId(null);
        }
    };

    const handleRefundAction = async (membership: VipMembership) => {
        if (!window.confirm(`ESTORNAR ADESÃO: Tem certeza? O código '${membership.benefitCode || 'N/A'}' será removido e o ingresso invalidado.`)) return;
        setIsProcessingId(membership.id);
        try {
            await refundVipMembership(membership.id);
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

            <div className="flex bg-gray-800/50 p-1.5 rounded-2xl mb-8 border border-white/5 w-fit ml-4 md:ml-0">
                <button onClick={() => setActiveTab('members')} className={`px-6 py-3 text-xs font-black uppercase rounded-xl transition-all ${activeTab === 'members' ? 'bg-primary text-white shadow-lg' : 'text-gray-400'}`}>Membros</button>
                <button onClick={() => setActiveTab('events')} className={`px-6 py-3 text-xs font-black uppercase rounded-xl transition-all ${activeTab === 'events' ? 'bg-primary text-white shadow-lg' : 'text-gray-400'}`}>Ofertas</button>
                <button onClick={() => navigate('/admin/recovery')} className="px-6 py-3 text-xs font-black uppercase rounded-xl transition-all text-gray-400 hover:text-white">Recuperação</button>
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
                                                <div className="flex items-center gap-2 mt-1">
                                                    <p className="text-[9px] text-primary font-black uppercase">{m.vipEventName}</p>
                                                    <span className="text-gray-700 font-black">|</span>
                                                    <p className="text-[11px] text-primary font-mono font-black">{m.benefitCode || '---'}</p>
                                                </div>
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
                                                <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all">
                                                    <button onClick={() => { setMembershipToEdit(m); setIsEditMembershipOpen(true); }} className="p-2 bg-gray-700 text-gray-300 rounded-xl hover:bg-primary hover:text-white transition-all border border-white/5" title="Editar Dados">
                                                        <PencilIcon className="w-4 h-4" />
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

                {activeTab === 'events' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {vipEvents.map(ev => (
                            <div key={ev.id} className="bg-dark/40 p-6 rounded-[2rem] border border-white/5 group hover:border-primary transition-all flex flex-col">
                                <div className="flex justify-between mb-4">
                                    <div className="min-w-0 flex-grow pr-4">
                                        <h3 className="text-xl font-black text-white uppercase group-hover:text-primary transition-colors truncate">{ev.name}</h3>
                                        <p className="text-primary font-black">R$ {ev.price.toFixed(2)}</p>
                                    </div>
                                    <div className={`w-3 h-3 rounded-full flex-shrink-0 ${ev.isActive ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]' : 'bg-red-500'}`}></div>
                                </div>
                                
                                <div className="p-3 bg-white/5 rounded-2xl text-center mb-6 border border-white/5">
                                    <p className="text-[8px] font-black text-gray-500 uppercase tracking-widest mb-1">Códigos em Estoque</p>
                                    <p className="text-xl font-black text-white">
                                        {eventStats[ev.id]?.available ?? '...'}<span className="text-[10px] text-gray-600 ml-1">/ {eventStats[ev.id]?.total ?? '...'}</span>
                                    </p>
                                </div>

                                <div className="mt-auto flex flex-wrap gap-2">
                                    <button onClick={() => { setEventForCodes(ev); setIsCodesModalOpen(true); }} className="flex-grow py-3 bg-indigo-900/20 text-indigo-400 border border-indigo-800/30 rounded-xl text-[10px] font-black uppercase flex items-center justify-center gap-2 hover:bg-indigo-600 hover:text-white transition-all">
                                        <CogIcon className="w-4 h-4" /> ESTOQUE
                                    </button>
                                    <button onClick={() => { setEditingEvent(ev); setIsModalOpen(true); }} className="p-3 bg-gray-800 text-white rounded-xl border border-white/5 hover:bg-primary transition-all"><PencilIcon className="w-4 h-4" /></button>
                                    {isVipManager && (
                                        <button onClick={() => { if(confirm("Excluir evento VIP permanentemente?")) deleteVipEvent(ev.id).then(fetchData); }} className="p-3 bg-red-900/30 text-red-400 rounded-xl border border-red-800/30 hover:bg-red-600 transition-all"><TrashIcon className="w-4 h-4"/></button>
                                    )}
                                </div>
                            </div>
                        ))}
                        {vipEvents.length === 0 && !isLoading && <p className="col-span-full text-center text-gray-500 font-bold uppercase text-xs py-20">Nenhuma oferta VIP cadastrada.</p>}
                    </div>
                )}
            </div>

            {/* Modal de Criação/Edição de Evento */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[110] flex items-center justify-center p-6" onClick={() => setIsModalOpen(false)}>
                    <div className="bg-secondary w-full max-w-2xl p-8 rounded-[2.5rem] border border-white/10 flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-2xl font-black text-white uppercase tracking-tighter">Configurar Oferta VIP</h2>
                            <button onClick={() => setIsModalOpen(false)} className="p-2 text-gray-500 hover:text-white"><XIcon className="w-6 h-6"/></button>
                        </div>
                        <form onSubmit={handleSaveEvent} className="space-y-4 overflow-y-auto pr-2 custom-scrollbar">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-gray-500 uppercase ml-1">Nome do Evento</label>
                                    <input type="text" placeholder="Nome" value={editingEvent?.name || ''} onChange={e => setEditingEvent({...editingEvent!, name: e.target.value})} className="w-full bg-dark border border-gray-700 rounded-xl p-3 text-white font-bold" required />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-gray-500 uppercase ml-1">Preço da Adesão (R$)</label>
                                    <input type="number" step="0.01" placeholder="0,00" value={editingEvent?.price || ''} onChange={e => setEditingEvent({...editingEvent!, price: Number(e.target.value)})} className="w-full bg-dark border border-gray-700 rounded-xl p-3 text-white font-bold" required />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-gray-500 uppercase ml-1 flex items-center gap-1"><ClockIcon className="w-3 h-3"/> Horário de Início</label>
                                    <input type="text" placeholder="Ex: 22h00" value={editingEvent?.eventTime || ''} onChange={e => setEditingEvent({...editingEvent!, eventTime: e.target.value})} className="w-full bg-dark border border-gray-700 rounded-xl p-3 text-white font-bold" />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-gray-500 uppercase ml-1 flex items-center gap-1"><MapPinIcon className="w-3 h-3"/> Local / Unidade</label>
                                    <input type="text" placeholder="Nome do Local" value={editingEvent?.eventLocation || ''} onChange={e => setEditingEvent({...editingEvent!, eventLocation: e.target.value})} className="w-full bg-dark border border-gray-700 rounded-xl p-3 text-white font-bold" />
                                </div>
                            </div>

                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-gray-500 uppercase ml-1">Atrações Principais</label>
                                <input type="text" placeholder="Ex: DJ X, Cantor Y..." value={editingEvent?.attractions || ''} onChange={e => setEditingEvent({...editingEvent!, attractions: e.target.value})} className="w-full bg-dark border border-gray-700 rounded-xl p-3 text-white font-bold" />
                            </div>

                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-gray-500 uppercase ml-1">Descrição curta (Interna)</label>
                                <textarea placeholder="..." value={editingEvent?.description || ''} onChange={e => setEditingEvent({...editingEvent!, description: e.target.value})} className="w-full bg-dark border border-gray-700 rounded-xl p-3 text-white text-sm" rows={2} />
                            </div>

                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-gray-500 uppercase ml-1">Benefícios Inclusos (Um por linha)</label>
                                <textarea 
                                    placeholder="Ex: Entrada sem fila&#10;Área exclusiva..." 
                                    value={editingEvent?.benefits?.join('\n') || ''} 
                                    onChange={e => setEditingEvent({...editingEvent!, benefits: e.target.value.split('\n')})} 
                                    className="w-full bg-dark border border-gray-700 rounded-xl p-3 text-white text-sm" 
                                    rows={4} 
                                />
                            </div>

                            <div className="flex gap-4 pt-2">
                                <label className="flex items-center gap-2 text-white text-[10px] font-black uppercase cursor-pointer">
                                    <input type="checkbox" checked={editingEvent?.isActive} onChange={e => setEditingEvent({...editingEvent!, isActive: e.target.checked})} className="w-4 h-4 rounded bg-dark text-primary" /> Ativo (Público)
                                </label>
                            </div>

                            <button type="submit" className="w-full py-5 bg-primary text-white font-black rounded-2xl uppercase text-xs tracking-widest mt-4 shadow-lg shadow-primary/20">SALVAR CONFIGURAÇÕES</button>
                        </form>
                    </div>
                </div>
            )}

            {isCodesModalOpen && eventForCodes && (
                <ManageCodesModal 
                    isOpen={isCodesModalOpen} 
                    onClose={() => { setIsCodesModalOpen(false); setEventForCodes(null); }} 
                    event={eventForCodes} 
                    onSaved={fetchData} 
                />
            )}

            {isEditMembershipOpen && membershipToEdit && (
                <EditMembershipModal 
                    isOpen={isEditMembershipOpen} 
                    onClose={() => { setIsEditMembershipOpen(false); setMembershipToEdit(null); }} 
                    membership={membershipToEdit} 
                    onSaved={fetchData} 
                />
            )}
            
            {isTransferModalOpen && membershipToTransfer && (
                <TransferModal 
                    isOpen={isTransferModalOpen} 
                    onClose={() => { setIsTransferModalOpen(false); setMembershipToTransfer(null); }} 
                    membership={membershipToTransfer} 
                    events={vipEvents} 
                    onTransferred={fetchData} 
                />
            )}
        </div>
    );
};

export default AdminClubVip;
