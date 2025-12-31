
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

    const handleCopy = (text: string) => {
        navigator.clipboard.writeText(text);
        alert("Copiado!");
    };

    const financialStats = useMemo(() => {
        const confirmed = memberships.filter(m => m.status === 'confirmed');
        const priceMap = vipEvents.reduce((acc, e) => ({...acc, [e.id]: e.price}), {} as Record<string, number>);
        const totalBilled = confirmed.reduce((acc, m) => acc + (priceMap[m.vipEventId] || 0), 0);
        
        return {
            totalBilled,
            confirmedCount: confirmed.length,
            waitingActivation: confirmed.filter(m => !m.isBenefitActive).length
        };
    }, [memberships, vipEvents]);

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
                    {activeTab === 'events' && (
                        <button onClick={() => { setEditingEvent({ benefits: [] }); setIsModalOpen(true); }} className="px-6 py-3 bg-primary text-white font-black rounded-2xl text-[10px] uppercase tracking-widest shadow-xl flex items-center gap-2">
                            <PlusIcon className="w-4 h-4" /> Novo Evento
                        </button>
                    )}
                    <button onClick={() => fetchData()} className="p-3 bg-gray-800 text-gray-400 rounded-2xl hover:text-white transition-colors">
                        <RefreshIcon className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`}/>
                    </button>
                </div>
            </div>

            <div className="flex bg-gray-800/50 p-1.5 rounded-2xl mb-8 border border-white/5 w-fit ml-4 md:ml-0">
                <button onClick={() => setActiveTab('members')} className={`px-6 py-3 text-xs font-black uppercase rounded-xl transition-all ${activeTab === 'members' ? 'bg-primary text-white shadow-lg' : 'text-gray-400 hover:text-gray-200'}`}>Membros</button>
                <button onClick={() => setActiveTab('events')} className={`px-6 py-3 text-xs font-black uppercase rounded-xl transition-all ${activeTab === 'events' ? 'bg-primary text-white shadow-lg' : 'text-gray-400 hover:text-gray-200'}`}>Eventos</button>
            </div>

            <div className="bg-secondary/60 backdrop-blur-xl rounded-[2.5rem] p-6 border border-white/5 shadow-2xl space-y-6">
                {activeTab === 'members' ? (
                    <>
                        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
                            <select value={selectedEventId} onChange={e => setSelectedEventId(e.target.value)} className="bg-dark border border-gray-700 text-white px-5 py-3 rounded-2xl text-[10px] font-black uppercase outline-none">
                                <option value="all">TODOS EVENTOS</option>
                                {vipEvents.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                            </select>
                            <div className="relative lg:col-span-3">
                                <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                                <input 
                                    type="text" placeholder="BUSCAR NOME OU CÓDIGO..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                                    className="w-full pl-11 pr-4 py-3 bg-dark border border-gray-700 rounded-2xl text-white text-xs font-black uppercase outline-none"
                                />
                            </div>
                        </div>

                        {selectedIds.size > 0 && (
                            <div className="p-4 bg-primary rounded-2xl flex justify-between items-center animate-fadeIn">
                                <p className="text-white font-black text-xs uppercase tracking-widest">{selectedIds.size} membros selecionados</p>
                                <button onClick={handleBulkNotify} disabled={isBulkProcessing} className="px-6 py-2 bg-white text-primary font-black rounded-xl text-[10px] uppercase hover:bg-gray-100 transition-all">
                                    ATIVAR E ENVIAR E-MAIL
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
                                        <th className="px-6 py-5 text-center">Status</th>
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
                ) : (
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
