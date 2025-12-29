
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
import { getOrganizations } from '../services/organizationService';
import { VipMembership, VipEvent, Organization } from '../types';
import { 
    ArrowLeftIcon, SearchIcon, CheckCircleIcon, XIcon, 
    EyeIcon, TicketIcon, RefreshIcon, ClockIcon, UserIcon,
    BuildingOfficeIcon, PlusIcon, TrashIcon, PencilIcon, AlertTriangleIcon
} from '../components/Icons';
import PhotoViewerModal from '../components/PhotoViewerModal';

const VipEventModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onSave: (data: any) => Promise<void>;
    event: VipEvent | null;
}> = ({ isOpen, onClose, onSave, event }) => {
    const [formData, setFormData] = useState({
        name: '', price: 50, isActive: true, description: '', pixKey: '', benefits: ''
    });

    useEffect(() => {
        if (event) setFormData({
            name: event.name, price: event.price, isActive: event.isActive, 
            description: event.description, pixKey: event.pixKey, benefits: event.benefits.join('\n')
        });
        else setFormData({ name: '', price: 50, isActive: true, description: '', pixKey: 'pix@equipecerta.com.br', benefits: '' });
    }, [event, isOpen]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <div className="bg-secondary w-full max-w-lg p-8 rounded-[2.5rem] border border-white/10 max-h-[90vh] overflow-y-auto">
                <h3 className="text-2xl font-black text-white uppercase mb-6 tracking-tighter">{event ? 'Editar Evento VIP' : 'Novo Evento VIP'}</h3>
                <div className="space-y-4">
                    <div>
                        <label className="text-[10px] font-black text-gray-500 uppercase ml-1 tracking-widest">Nome do Evento</label>
                        <input type="text" placeholder="Ex: Camarote Verão 2024" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full bg-dark p-4 rounded-2xl border border-gray-700 text-white font-bold outline-none focus:ring-1 focus:ring-primary" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-[10px] font-black text-gray-500 uppercase ml-1 tracking-widest">Preço da Adesão (R$)</label>
                            <input type="number" value={formData.price} onChange={e => setFormData({...formData, price: Number(e.target.value)})} className="w-full bg-dark p-4 rounded-2xl border border-gray-700 text-white font-bold outline-none focus:ring-1 focus:ring-primary" />
                        </div>
                        <div>
                            <label className="text-[10px] font-black text-gray-500 uppercase ml-1 tracking-widest">Status Inicial</label>
                            <select value={formData.isActive ? 'true' : 'false'} onChange={e => setFormData({...formData, isActive: e.target.value === 'true'})} className="w-full bg-dark p-4 rounded-2xl border border-gray-700 text-white font-bold outline-none focus:ring-1 focus:ring-primary">
                                <option value="true">Ativo</option>
                                <option value="false">Pausado</option>
                            </select>
                        </div>
                    </div>
                    <div>
                        <label className="text-[10px] font-black text-gray-500 uppercase ml-1 tracking-widest">Chave PIX (Específica do Evento)</label>
                        <input type="text" placeholder="Chave para recebimento" value={formData.pixKey} onChange={e => setFormData({...formData, pixKey: e.target.value})} className="w-full bg-dark p-4 rounded-2xl border border-gray-700 text-white text-sm outline-none focus:ring-1 focus:ring-primary" />
                    </div>
                    <div>
                        <label className="text-[10px] font-black text-gray-500 uppercase ml-1 tracking-widest">Descrição curta</label>
                        <textarea placeholder="Explicação rápida..." value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} className="w-full bg-dark p-4 rounded-2xl border border-gray-700 text-white text-sm h-20 outline-none focus:ring-1 focus:ring-primary" />
                    </div>
                    <div>
                        <label className="text-[10px] font-black text-gray-500 uppercase ml-1 tracking-widest">Vantagens (uma por linha)</label>
                        <textarea placeholder="Ex: Camiseta Exclusiva&#10;Entrada Sem Fila" value={formData.benefits} onChange={e => setFormData({...formData, benefits: e.target.value})} className="w-full bg-dark p-4 rounded-2xl border border-gray-700 text-white text-sm h-32 outline-none focus:ring-1 focus:ring-primary" />
                    </div>
                </div>
                <div className="flex gap-4 mt-8">
                    <button onClick={onClose} className="flex-1 py-4 bg-gray-800 text-gray-400 font-bold rounded-2xl hover:bg-gray-700 transition-colors uppercase text-xs tracking-widest">Cancelar</button>
                    <button onClick={() => onSave({...formData, benefits: formData.benefits.split('\n').filter(b => b.trim())})} className="flex-1 py-4 bg-primary text-white font-black rounded-2xl shadow-xl shadow-primary/20 hover:bg-primary-dark transition-all uppercase text-xs tracking-widest">Salvar Evento</button>
                </div>
            </div>
        </div>
    );
};

const AdminClubVip: React.FC = () => {
    const navigate = useNavigate();
    const { adminData, loading: authLoading } = useAdminAuth();
    
    const [memberships, setMemberships] = useState<VipMembership[]>([]);
    const [vipEvents, setVipEvents] = useState<VipEvent[]>([]);
    const [organizations, setOrganizations] = useState<Record<string, string>>({});
    const [isLoading, setIsLoading] = useState(true);
    const [filterStatus, setFilterStatus] = useState<'pending' | 'confirmed' | 'rejected' | 'all'>('pending');
    const [selectedEventId, setSelectedEventId] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [isActionLoading, setIsActionLoading] = useState<string | null>(null);
    
    const [isEventModalOpen, setIsEventModalOpen] = useState(false);
    const [editingEvent, setEditingEvent] = useState<VipEvent | null>(null);
    const [photoViewer, setPhotoViewer] = useState({ isOpen: false, url: '' });

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

    if (!authLoading && !isSuperAdmin) {
        return (
            <div className="py-20 text-center flex flex-col items-center gap-6">
                <div className="w-20 h-20 bg-red-900/20 rounded-full flex items-center justify-center text-red-500">
                    <AlertTriangleIcon className="w-10 h-10" />
                </div>
                <h1 className="text-2xl font-black text-white uppercase">Acesso Restrito</h1>
                <p className="text-gray-400 max-w-xs">Apenas o Super Administrador pode gerenciar os eventos e adesões do Clube VIP.</p>
                <button onClick={() => navigate('/admin')} className="px-6 py-2 bg-gray-800 text-white font-bold rounded-xl">Voltar ao Painel</button>
            </div>
        );
    }

    const handleApprove = async (m: VipMembership) => {
        const code = window.prompt("Código ou Link para a divulgadora:", m.benefitCode || "VOUCHER-VIP-2024");
        if (code === null) return;
        setIsActionLoading(m.id);
        try {
            await updateVipMembership(m.id, { status: 'confirmed', benefitCode: code });
            await fetchData();
        } catch (e) { alert("Erro ao aprovar."); }
        finally { setIsActionLoading(null); }
    };

    const handleReject = async (id: string) => {
        if (!window.confirm("Recusar este comprovante?")) return;
        setIsActionLoading(id);
        try {
            await updateVipMembership(id, { status: 'rejected' });
            await fetchData();
        } catch (e) { alert("Erro ao recusar."); }
        finally { setIsActionLoading(null); }
    };

    const handleSaveEvent = async (data: any) => {
        try {
            if (editingEvent) await updateVipEvent(editingEvent.id, data);
            else await createVipEvent(data);
            setIsEventModalOpen(false);
            await fetchData();
        } catch (e) { alert("Erro ao salvar evento."); }
    };

    const handleDeleteEvent = async (id: string) => {
        if (!window.confirm("Excluir este evento VIP? Isso não remove os membros já cadastrados, mas o evento deixará de aparecer para novas adesões.")) return;
        await deleteVipEvent(id);
        await fetchData();
    };

    const filteredMembers = useMemo(() => {
        return memberships.filter(m => {
            const matchesStatus = filterStatus === 'all' || m.status === filterStatus;
            const matchesSearch = m.promoterName.toLowerCase().includes(searchQuery.toLowerCase()) || m.promoterEmail.toLowerCase().includes(searchQuery.toLowerCase());
            return matchesStatus && matchesSearch;
        });
    }, [memberships, filterStatus, searchQuery]);

    return (
        <div className="pb-20">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4 px-4 md:px-0">
                <div>
                    <h1 className="text-3xl font-black text-white uppercase tracking-tighter flex items-center gap-3 leading-none">
                        <TicketIcon className="w-8 h-8 text-primary" />
                        Gestão Clube VIP
                    </h1>
                    <p className="text-[10px] text-gray-500 font-black uppercase tracking-[0.2em] mt-1.5 ml-1">Controle de Adesões e Faturamento</p>
                </div>
                <div className="flex gap-2 w-full md:w-auto">
                    <button onClick={() => { setEditingEvent(null); setIsEventModalOpen(true); }} className="flex-1 md:flex-none px-4 py-3 bg-primary text-white font-black rounded-2xl text-[10px] uppercase tracking-widest shadow-xl shadow-primary/20 flex items-center justify-center gap-2 hover:scale-[1.02] transition-all">
                        <PlusIcon className="w-4 h-4" /> Criar Evento VIP
                    </button>
                    <button onClick={() => fetchData()} className="p-3 bg-gray-800 text-gray-400 rounded-2xl hover:text-white transition-colors">
                        <RefreshIcon className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`}/>
                    </button>
                    <button onClick={() => navigate(-1)} className="p-3 bg-gray-800 text-gray-400 rounded-2xl hover:text-white transition-colors">
                        <ArrowLeftIcon className="w-5 h-5"/>
                    </button>
                </div>
            </div>

            {/* Gestão de Eventos */}
            {vipEvents.length > 0 && (
                <div className="mb-10 px-4 md:px-0">
                    <h2 className="text-[10px] font-black text-gray-500 uppercase tracking-[0.3em] mb-4 ml-1">Eventos VIP Configuráveis</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {vipEvents.map(ev => (
                            <div key={ev.id} className={`p-5 rounded-[2rem] border transition-all ${ev.isActive ? 'bg-primary/5 border-primary/20 shadow-lg shadow-primary/5' : 'bg-gray-800/40 border-white/5 opacity-60'}`}>
                                <div className="flex justify-between items-start mb-3">
                                    <p className="text-white font-black text-sm uppercase truncate leading-none pt-1">{ev.name}</p>
                                    <div className={`w-2.5 h-2.5 rounded-full ${ev.isActive ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-red-500'}`}></div>
                                </div>
                                <div className="flex items-end justify-between">
                                    <p className="text-primary font-black text-lg">R$ {ev.price}</p>
                                    <div className="flex gap-1">
                                        <button onClick={() => { setEditingEvent(ev); setIsEventModalOpen(true); }} className="p-2 bg-gray-800 text-gray-400 rounded-xl hover:text-white transition-colors"><PencilIcon className="w-3.5 h-3.5" /></button>
                                        <button onClick={() => handleDeleteEvent(ev.id)} className="p-2 bg-red-900/20 text-red-500 rounded-xl hover:bg-red-600 hover:text-white transition-all"><TrashIcon className="w-3.5 h-3.5" /></button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="bg-secondary/60 backdrop-blur-xl rounded-[2.5rem] p-6 border border-white/5 shadow-2xl space-y-6">
                <div className="flex flex-col md:flex-row gap-4">
                    <select value={selectedEventId} onChange={e => setSelectedEventId(e.target.value)} className="bg-dark border border-gray-700 text-white px-5 py-3 rounded-2xl text-xs font-black uppercase tracking-widest focus:ring-1 focus:ring-primary outline-none min-w-[220px]">
                        <option value="all">Filtro: Todos Eventos</option>
                        {vipEvents.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                    </select>
                    <div className="relative flex-grow">
                        <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                        <input 
                            type="text" placeholder="Buscar por nome ou e-mail..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                            className="w-full pl-11 pr-4 py-3 bg-dark border border-gray-700 rounded-2xl text-white text-sm focus:ring-1 focus:ring-primary outline-none font-medium"
                        />
                    </div>
                    <div className="flex bg-dark p-1 rounded-2xl border border-gray-700 overflow-x-auto">
                        {(['pending', 'confirmed', 'all'] as const).map(s => (
                            <button key={s} onClick={() => setFilterStatus(s)} className={`px-5 py-2 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all whitespace-nowrap ${filterStatus === s ? 'bg-primary text-white shadow-lg' : 'text-gray-400 hover:text-gray-200'}`}>
                                {{'pending':'Pendentes','confirmed':'Ativos','all':'Ver Todos'}[s]}
                            </button>
                        ))}
                    </div>
                </div>

                {isLoading ? (
                    <div className="py-20 text-center flex flex-col items-center gap-4">
                        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
                        <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Sincronizando banco...</p>
                    </div>
                ) : filteredMembers.length === 0 ? (
                    <div className="py-20 text-center bg-dark/40 rounded-[2rem] border border-dashed border-gray-800">
                        <p className="text-gray-500 font-bold uppercase tracking-widest text-xs">Nenhum pedido de adesão encontrado.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filteredMembers.map(m => (
                            <div key={m.id} className="bg-dark/40 rounded-[2rem] border border-white/5 overflow-hidden group hover:border-white/10 transition-all flex flex-col">
                                <div className="p-6">
                                    <div className="flex justify-between items-start mb-4">
                                        <div className="min-w-0">
                                            <p className="text-sm font-black text-white uppercase tracking-tight truncate leading-none mb-1">{m.promoterName}</p>
                                            <p className="text-primary font-black text-[9px] uppercase tracking-widest truncate">{m.vipEventName}</p>
                                        </div>
                                        <div className="text-right flex-shrink-0">
                                            <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest border ${m.status === 'confirmed' ? 'bg-green-900/40 text-green-400 border-green-800' : m.status === 'rejected' ? 'bg-red-900/40 text-red-400 border-red-800' : 'bg-yellow-900/40 text-yellow-400 border-yellow-800'}`}>
                                                {{'confirmed':'VIP ATIVO','pending':'PENDENTE','rejected':'RECUSADO'}[m.status]}
                                            </span>
                                        </div>
                                    </div>

                                    {m.proofUrl && (
                                        <div className="mb-4 relative group/img cursor-pointer" onClick={() => setPhotoViewer({ isOpen: true, url: m.proofUrl })}>
                                            <img src={m.proofUrl} alt="Comprovante" className="w-full h-40 object-cover rounded-2xl border border-gray-700 group-hover:border-primary transition-all" />
                                            <div className="absolute inset-0 bg-primary/20 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center rounded-2xl">
                                                <EyeIcon className="w-8 h-8 text-white" />
                                            </div>
                                        </div>
                                    )}

                                    <div className="mb-4 flex items-center gap-2 px-3 py-2 bg-gray-800/50 rounded-xl border border-white/5">
                                        <BuildingOfficeIcon className="w-3.5 h-3.5 text-gray-500" />
                                        <p className="text-[10px] font-black text-gray-400 uppercase truncate">
                                            {organizations[m.organizationId] || 'Produtora não identificada'}
                                        </p>
                                    </div>

                                    {m.status === 'confirmed' && (
                                        <div className="mb-4 p-3 bg-green-900/20 rounded-xl border border-green-800/30">
                                            <p className="text-[8px] text-green-500 font-black uppercase mb-1">Voucher Ativo:</p>
                                            <p className="text-xs text-white font-mono font-bold truncate select-all">{m.benefitCode || 'Sem Código'}</p>
                                        </div>
                                    )}

                                    <div className="flex gap-2 mt-auto">
                                        <button 
                                            onClick={() => handleApprove(m)}
                                            disabled={isActionLoading === m.id}
                                            className="flex-1 py-3 bg-green-600 text-white font-black rounded-xl text-[10px] uppercase tracking-widest hover:bg-green-500 transition-all flex items-center justify-center gap-2 shadow-lg shadow-green-900/20 disabled:opacity-50"
                                        >
                                            {isActionLoading === m.id ? <RefreshIcon className="w-4 h-4 animate-spin" /> : <CheckCircleIcon className="w-4 h-4" />}
                                            {m.status === 'confirmed' ? 'Alterar Código' : 'Aprovar'}
                                        </button>
                                        {m.status === 'pending' && (
                                            <button 
                                                onClick={() => handleReject(m.id)}
                                                disabled={isActionLoading === m.id}
                                                className="px-4 py-3 bg-red-900/30 text-red-400 rounded-xl border border-red-900/50 hover:bg-red-900/50 transition-all disabled:opacity-50"
                                            >
                                                <XIcon className="w-4 h-4" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <VipEventModal 
                isOpen={isEventModalOpen} 
                onClose={() => setIsEventModalOpen(false)} 
                onSave={handleSaveEvent} 
                event={editingEvent} 
            />

            {photoViewer.isOpen && (
                <PhotoViewerModal 
                    imageUrls={[photoViewer.url]} 
                    startIndex={0} 
                    isOpen={photoViewer.isOpen} 
                    onClose={() => setPhotoViewer({ ...photoViewer, isOpen: false })} 
                />
            )}
        </div>
    );
};

export default AdminClubVip;
