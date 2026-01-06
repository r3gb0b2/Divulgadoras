
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { 
    getAllGreenlifeMemberships, getAllGreenlifeEvents, createGreenlifeEvent, 
    updateGreenlifeEvent, deleteGreenlifeEvent, refundGreenlifeMembership,
    addGreenlifeCodes, getGreenlifeCodeStats, getGreenlifeEventCodes
} from '../services/greenlifeService';
import { VipMembership, VipEvent } from '../types';
import { firestore, functions } from '../firebase/config';
import { httpsCallable } from 'firebase/functions';
import { 
    ArrowLeftIcon, SearchIcon, CheckCircleIcon, XIcon, TicketIcon, RefreshIcon, 
    PlusIcon, TrashIcon, PencilIcon, DownloadIcon, LinkIcon, CogIcon, UndoIcon
} from '../components/Icons';

const AdminGreenlife: React.FC = () => {
    const navigate = useNavigate();
    const { adminData } = useAdminAuth();
    const [activeTab, setActiveTab] = useState<'members' | 'events'>('members');
    const [memberships, setMemberships] = useState<VipMembership[]>([]);
    const [events, setEvents] = useState<VipEvent[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [isProcessing, setIsProcessing] = useState<string | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingEvent, setEditingEvent] = useState<Partial<VipEvent> | null>(null);

    const isSuperAdmin = adminData?.role === 'superadmin';

    const fetchData = useCallback(async () => {
        if (!isSuperAdmin) return;
        setIsLoading(true);
        try {
            const [eventsData, membersData] = await Promise.all([
                getAllGreenlifeEvents(),
                getAllGreenlifeMemberships()
            ]);
            setEvents(eventsData);
            setMemberships(membersData);
        } finally { setIsLoading(false); }
    }, [isSuperAdmin]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const filteredMembers = useMemo(() => {
        return memberships.filter(m => 
            m.promoterName.toLowerCase().includes(searchQuery.toLowerCase()) || 
            m.promoterEmail.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [memberships, searchQuery]);

    const handleManualActivate = async (m: VipMembership) => {
        if(!confirm("Ativar adesão manualmente?")) return;
        setIsProcessing(m.id);
        try {
            const activate = httpsCallable(functions, 'activateGreenlifeMembership');
            await activate({ membershipId: m.id });
            fetchData();
        } catch (e: any) { alert(e.message); } finally { setIsProcessing(null); }
    };

    const handleSaveEvent = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingEvent?.name) return;
        try {
            if (editingEvent.id) await updateGreenlifeEvent(editingEvent.id, editingEvent);
            else await createGreenlifeEvent(editingEvent as any);
            setIsModalOpen(false);
            fetchData();
        } catch (e: any) { alert(e.message); }
    };

    return (
        <div className="pb-40">
            <div className="flex justify-between items-center mb-8">
                <h1 className="text-3xl font-black text-white uppercase tracking-tighter flex items-center gap-3">
                    <TicketIcon className="w-8 h-8 text-green-500" /> Admin Greenlife
                </h1>
                <div className="flex gap-2">
                    <button onClick={() => { setEditingEvent({ isActive: true, benefits: [] }); setIsModalOpen(true); }} className="px-6 py-3 bg-green-600 text-white font-black rounded-2xl text-[10px] uppercase shadow-xl">Novo Evento</button>
                    <button onClick={() => navigate('/admin')} className="p-3 bg-gray-800 text-gray-400 rounded-2xl hover:text-white"><ArrowLeftIcon className="w-5 h-5"/></button>
                </div>
            </div>

            <div className="flex bg-gray-800/50 p-1.5 rounded-2xl mb-8 border border-white/5 w-fit">
                <button onClick={() => setActiveTab('members')} className={`px-6 py-3 text-xs font-black uppercase rounded-xl transition-all ${activeTab === 'members' ? 'bg-green-600 text-white shadow-lg' : 'text-gray-400'}`}>Alunos</button>
                <button onClick={() => setActiveTab('events')} className={`px-6 py-3 text-xs font-black uppercase rounded-xl transition-all ${activeTab === 'events' ? 'bg-green-600 text-white shadow-lg' : 'text-gray-400'}`}>Ofertas</button>
            </div>

            <div className="bg-secondary/60 backdrop-blur-xl rounded-[2.5rem] p-6 border border-white/5 shadow-2xl">
                {activeTab === 'members' && (
                    <div className="space-y-4">
                        <div className="relative">
                            <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                            <input type="text" placeholder="BUSCAR ALUNO..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full pl-11 pr-4 py-3 bg-dark border border-gray-700 rounded-2xl text-white text-[10px] font-black uppercase outline-none focus:border-green-500" />
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead className="bg-dark/50 text-[10px] font-black text-gray-500 uppercase tracking-widest border-b border-white/5">
                                    <tr><th className="px-6 py-5">Aluno / Evento</th><th className="px-6 py-5 text-center">Status</th><th className="px-6 py-4 text-right">Gestão</th></tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {filteredMembers.map(m => (
                                        <tr key={m.id} className="hover:bg-white/[0.02] transition-colors">
                                            <td className="px-6 py-5">
                                                <p className="text-sm font-black text-white uppercase">{m.promoterName}</p>
                                                <p className="text-[9px] text-green-500 font-black mt-1">{m.vipEventName} • {m.benefitCode || '---'}</p>
                                            </td>
                                            <td className="px-6 py-5 text-center">
                                                <span className={`px-2 py-0.5 rounded-full border text-[8px] font-black uppercase ${m.status === 'confirmed' ? 'bg-green-900/40 text-green-400 border-green-800' : 'bg-orange-900/40 text-orange-400 border-orange-800'}`}>{m.status === 'confirmed' ? 'PAGO' : 'PENDENTE'}</span>
                                            </td>
                                            <td className="px-6 py-5 text-right">
                                                {m.status === 'pending' && <button onClick={() => handleManualActivate(m)} className="px-4 py-2 bg-green-600 text-white rounded-xl text-[9px] font-black uppercase">ATIVAR</button>}
                                                <button onClick={() => { if(confirm("Estornar?")) refundGreenlifeMembership(m.id).then(fetchData); }} className="ml-2 p-2 bg-red-900/20 text-red-500 rounded-xl hover:bg-red-600 hover:text-white transition-all"><TrashIcon className="w-4 h-4"/></button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {activeTab === 'events' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {events.map(ev => (
                            <div key={ev.id} className="bg-dark/40 p-6 rounded-3xl border border-white/5 group hover:border-green-500 transition-all">
                                <div className="flex justify-between mb-4">
                                    <div><h3 className="text-xl font-black text-white uppercase">{ev.name}</h3><p className="text-green-500 font-black">R$ {ev.price.toFixed(2)}</p></div>
                                    <div className={`w-3 h-3 rounded-full ${ev.isActive ? 'bg-green-500' : 'bg-red-500'}`}></div>
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={() => { setEditingEvent(ev); setIsModalOpen(true); }} className="flex-1 py-3 bg-gray-800 text-white rounded-xl hover:bg-green-600 transition-all"><PencilIcon className="w-4 h-4 inline mr-2"/>EDITAR</button>
                                    <button onClick={() => { if(confirm("Excluir?")) deleteGreenlifeEvent(ev.id).then(fetchData); }} className="p-3 bg-red-900/20 text-red-500 rounded-xl"><TrashIcon className="w-4 h-4"/></button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {isModalOpen && (
                <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[110] flex items-center justify-center p-6" onClick={() => setIsModalOpen(false)}>
                    <div className="bg-secondary w-full max-w-2xl p-8 rounded-[2.5rem] border border-white/10" onClick={e => e.stopPropagation()}>
                        <h2 className="text-2xl font-black text-white uppercase mb-6">Oferta Greenlife</h2>
                        <form onSubmit={handleSaveEvent} className="space-y-4">
                            <input type="text" placeholder="Nome" value={editingEvent?.name || ''} onChange={e => setEditingEvent({...editingEvent!, name: e.target.value})} className="w-full bg-dark border border-gray-700 rounded-xl p-3 text-white font-bold" />
                            <input type="number" step="0.01" placeholder="Preço" value={editingEvent?.price || ''} onChange={e => setEditingEvent({...editingEvent!, price: Number(e.target.value)})} className="w-full bg-dark border border-gray-700 rounded-xl p-3 text-white font-bold" />
                            <input type="text" placeholder="Unidade" value={editingEvent?.eventLocation || ''} onChange={e => setEditingEvent({...editingEvent!, eventLocation: e.target.value})} className="w-full bg-dark border border-gray-700 rounded-xl p-3 text-white font-bold" />
                            <button type="submit" className="w-full py-5 bg-green-600 text-white font-black rounded-2xl uppercase text-xs tracking-widest">Salvar</button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminGreenlife;
