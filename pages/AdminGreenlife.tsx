
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { 
    getAllGreenlifeMemberships, getAllGreenlifeEvents, createGreenlifeEvent, 
    updateGreenlifeEvent, deleteGreenlifeEvent, refundGreenlifeMembership,
    addGreenlifeCodes, getGreenlifeCodeStats, getGreenlifeEventCodes,
    updateGreenlifeMembership
} from '../services/greenlifeService';
import { VipMembership, VipEvent } from '../types';
import { firestore, functions } from '../firebase/config';
import { httpsCallable } from 'firebase/functions';
import firebase from 'firebase/compat/app';
import { 
    ArrowLeftIcon, SearchIcon, CheckCircleIcon, XIcon, TicketIcon, RefreshIcon, 
    PlusIcon, TrashIcon, PencilIcon, DownloadIcon, LinkIcon, CogIcon, UndoIcon, ChartBarIcon,
    CalendarIcon, ClockIcon, MapPinIcon
} from '../components/Icons';

const ManageCodesModal: React.FC<{ 
    isOpen: boolean, 
    onClose: () => void, 
    event: VipEvent, 
    onSaved: () => void 
}> = ({ isOpen, onClose, event, onSaved }) => {
    const [codesText, setCodesText] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [currentStock, setCurrentStock] = useState<number | null>(null);

    useEffect(() => {
        if (isOpen && event.id) {
            getGreenlifeCodeStats(event.id).then(setCurrentStock);
        }
    }, [isOpen, event.id]);

    if (!isOpen) return null;

    const handleSave = async () => {
        const codes = codesText.split('\n').map(c => c.trim()).filter(c => c.length > 0);
        if (codes.length === 0) return alert("Insira pelo menos um código.");
        setIsSaving(true);
        try {
            await addGreenlifeCodes(event.id, codes);
            alert(`${codes.length} códigos adicionados!`);
            setCodesText('');
            onSaved();
            onClose();
        } catch (e: any) {
            alert("Erro ao salvar estoque.");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[150] flex items-center justify-center p-6" onClick={onClose}>
            <div className="bg-secondary w-full max-w-lg p-8 rounded-[2.5rem] border border-white/10 shadow-2xl" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h2 className="text-xl font-black text-white uppercase tracking-tighter">Estoque Greenlife</h2>
                        <p className="text-[9px] text-green-500 font-bold uppercase mt-1">{event.name}</p>
                    </div>
                    <button onClick={onClose} className="p-2 text-gray-500 hover:text-white"><XIcon className="w-6 h-6"/></button>
                </div>
                <div className="mb-6 p-4 bg-dark/50 rounded-2xl border border-white/5 flex justify-between items-center">
                    <div>
                        <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Disponível:</p>
                        <p className="text-2xl font-black text-green-500">{currentStock !== null ? currentStock : '...'}</p>
                    </div>
                </div>
                <textarea 
                    rows={8}
                    value={codesText}
                    onChange={e => setCodesText(e.target.value)}
                    placeholder="CÓDIGO1&#10;CÓDIGO2..."
                    className="w-full bg-dark border border-gray-700 rounded-2xl p-4 text-white font-mono text-sm outline-none focus:border-green-500"
                />
                <div className="mt-8 flex gap-3">
                    <button onClick={onClose} className="flex-1 py-4 bg-gray-800 text-gray-400 font-black rounded-2xl uppercase text-xs">Cancelar</button>
                    <button onClick={handleSave} disabled={isSaving} className="flex-[2] py-4 bg-green-600 text-white font-black rounded-2xl uppercase text-xs shadow-lg disabled:opacity-50">
                        {isSaving ? 'SALVANDO...' : 'ADICIONAR CÓDIGOS'}
                    </button>
                </div>
            </div>
        </div>
    );
};

const AdminGreenlife: React.FC = () => {
    const navigate = useNavigate();
    const { adminData } = useAdminAuth();
    const [activeTab, setActiveTab] = useState<'members' | 'events'>('members');
    const [memberships, setMemberships] = useState<VipMembership[]>([]);
    const [events, setEvents] = useState<VipEvent[]>([]);
    const [eventStats, setEventStats] = useState<Record<string, number>>({});
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [isProcessingId, setIsProcessingId] = useState<string | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isCodesModalOpen, setIsCodesModalOpen] = useState(false);
    const [editingEvent, setEditingEvent] = useState<Partial<VipEvent> | null>(null);
    const [selectedEventForCodes, setSelectedEventForCodes] = useState<VipEvent | null>(null);

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
            const stats: Record<string, number> = {};
            for (const ev of eventsData) {
                stats[ev.id] = await getGreenlifeCodeStats(ev.id);
            }
            setEventStats(stats);
        } finally { setIsLoading(false); }
    }, [isSuperAdmin]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const filteredMembers = useMemo(() => {
        const query = searchQuery.toLowerCase().trim();
        return memberships.filter(m => 
            (m.promoterName || '').toLowerCase().includes(query) || 
            (m.promoterEmail || '').toLowerCase().includes(query)
        );
    }, [memberships, searchQuery]);

    const handleSaveEvent = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingEvent?.name || !editingEvent?.price || !editingEvent?.eventDate) return;
        try {
            const dateStr = (editingEvent.eventDate as any);
            const firestoreDate = typeof dateStr === 'string' 
                ? firebase.firestore.Timestamp.fromDate(new Date(dateStr + "T00:00:00"))
                : editingEvent.eventDate;

            const dataToSave = {
                name: editingEvent.name,
                price: Number(editingEvent.price),
                eventDate: firestoreDate,
                eventTime: editingEvent.eventTime || '',
                eventLocation: editingEvent.eventLocation || '',
                attractions: editingEvent.attractions || '',
                isActive: editingEvent.isActive ?? true,
                isSoldOut: editingEvent.isSoldOut ?? false,
                benefits: editingEvent.benefits || []
            };

            if (editingEvent.id) await updateGreenlifeEvent(editingEvent.id, dataToSave);
            else await createGreenlifeEvent(dataToSave as any);
            
            setIsModalOpen(false);
            fetchData();
        } catch (e: any) { alert(e.message); }
    };

    return (
        <div className="pb-40">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4 px-4 md:px-0">
                <h1 className="text-3xl font-black text-white uppercase tracking-tighter flex items-center gap-3">
                    <TicketIcon className="w-8 h-8 text-green-500" /> Admin Greenlife
                </h1>
                <div className="flex gap-2">
                    <button onClick={() => { setEditingEvent({ isActive: true, isSoldOut: false, benefits: [] }); setIsModalOpen(true); }} className="px-6 py-3 bg-green-600 text-white font-black rounded-2xl text-[10px] uppercase shadow-xl">Novo Evento</button>
                    <button onClick={() => fetchData()} className="p-3 bg-gray-800 text-gray-400 rounded-2xl hover:text-white transition-colors">
                        <RefreshIcon className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`}/>
                    </button>
                    <button onClick={() => navigate('/admin')} className="p-3 bg-gray-800 text-gray-400 rounded-2xl hover:text-white transition-colors"><ArrowLeftIcon className="w-5 h-5"/></button>
                </div>
            </div>

            <div className="flex bg-gray-800/50 p-1.5 rounded-2xl mb-8 border border-white/5 w-fit">
                <button onClick={() => setActiveTab('members')} className={`px-6 py-3 text-xs font-black uppercase rounded-xl transition-all ${activeTab === 'members' ? 'bg-green-600 text-white shadow-lg' : 'text-gray-400'}`}>Alunos</button>
                <button onClick={() => setActiveTab('events')} className={`px-6 py-3 text-xs font-black uppercase rounded-xl transition-all ${activeTab === 'events' ? 'bg-green-600 text-white shadow-lg' : 'text-gray-400'}`}>Ofertas</button>
            </div>

            <div className="bg-secondary shadow-lg rounded-[2.5rem] p-6 border border-white/5">
                {activeTab === 'members' && (
                    <div className="space-y-4">
                        <div className="relative">
                            <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                            <input type="text" placeholder="BUSCAR POR NOME OU E-MAIL..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full pl-11 pr-4 py-3 bg-dark border border-gray-700 rounded-2xl text-white text-[10px] font-black uppercase outline-none focus:border-green-500" />
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead className="bg-dark/50 text-[10px] font-black text-gray-500 uppercase tracking-widest border-b border-white/5">
                                    <tr>
                                        <th className="px-6 py-5">Aluno / Evento</th>
                                        <th className="px-6 py-5 text-center">Status</th>
                                        <th className="px-6 py-4 text-right">Ações</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {filteredMembers.map(m => (
                                        <tr key={m.id} className="hover:bg-white/[0.02] transition-colors group">
                                            <td className="px-6 py-5">
                                                <p className="text-sm font-black text-white uppercase truncate">{m.promoterName}</p>
                                                <p className="text-[10px] text-gray-500 font-mono truncate">{m.promoterEmail}</p>
                                                <p className="text-[9px] text-green-500 font-black mt-1 uppercase">{m.vipEventName}</p>
                                            </td>
                                            <td className="px-6 py-5 text-center">
                                                <span className={`px-2 py-0.5 rounded-full border text-[8px] font-black uppercase ${m.status === 'confirmed' ? 'bg-green-900/40 text-green-400 border-green-800' : 'bg-orange-900/40 text-orange-400 border-orange-800'}`}>{m.status.toUpperCase()}</span>
                                            </td>
                                            <td className="px-6 py-5 text-right">
                                                <button onClick={() => { setEditingEvent({id: m.id}); setIsModalOpen(true); }} className="p-2 bg-gray-800 text-gray-400 rounded-lg hover:text-white transition-colors"><PencilIcon className="w-4 h-4"/></button>
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
                            <div key={ev.id} className="bg-dark p-6 rounded-3xl border border-white/5 group hover:border-green-500 transition-all flex flex-col">
                                <div className="flex justify-between mb-4">
                                    <div className="min-w-0 flex-grow pr-4">
                                        <h3 className="text-xl font-black text-white uppercase truncate">{ev.name}</h3>
                                        <p className="text-green-500 font-black">R$ {ev.price.toFixed(2)}</p>
                                        <p className="text-[10px] text-gray-500 font-bold uppercase mt-1 flex items-center gap-1.5">
                                            <CalendarIcon className="w-3 h-3"/> {ev.eventDate ? (ev.eventDate as any).toDate().toLocaleDateString('pt-BR') : 'Sem data'}
                                        </p>
                                    </div>
                                    <div className={`w-3 h-3 rounded-full flex-shrink-0 ${ev.isActive ? 'bg-green-500' : 'bg-red-500'}`}></div>
                                </div>
                                <div className="mt-auto flex flex-wrap gap-2 pt-4 border-t border-white/5">
                                    <button onClick={() => { setSelectedEventForCodes(ev); setIsCodesModalOpen(true); }} className="flex-grow py-3 bg-indigo-900/20 text-indigo-400 border border-indigo-800/30 rounded-xl text-[10px] font-black uppercase flex items-center justify-center gap-2 hover:bg-indigo-600 transition-all">ESTOQUE</button>
                                    <button onClick={() => { setEditingEvent(ev); setIsModalOpen(true); }} className="p-3 bg-gray-800 text-white rounded-xl hover:bg-green-600 transition-all"><PencilIcon className="w-4 h-4" /></button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {isModalOpen && (
                <div className="fixed inset-0 bg-black/95 backdrop-blur-sm z-[110] flex items-center justify-center p-6" onClick={() => setIsModalOpen(false)}>
                    <div className="bg-secondary w-full max-w-2xl p-8 rounded-[2.5rem] border border-white/10" onClick={e => e.stopPropagation()}>
                        <h2 className="text-2xl font-black text-white uppercase mb-6 tracking-tighter">Oferta Greenlife</h2>
                        <form onSubmit={handleSaveEvent} className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-gray-500 uppercase ml-1">Nome da Oferta</label>
                                    <input type="text" value={editingEvent?.name || ''} onChange={e => setEditingEvent({...editingEvent!, name: e.target.value})} className="w-full bg-dark border border-gray-700 rounded-xl p-3 text-white font-bold" />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-gray-500 uppercase ml-1">Preço (R$)</label>
                                    <input type="number" step="0.01" value={editingEvent?.price || ''} onChange={e => setEditingEvent({...editingEvent!, price: Number(e.target.value)})} className="w-full bg-dark border border-gray-700 rounded-xl p-3 text-white font-bold" />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-gray-500 uppercase ml-1 flex items-center gap-1"><CalendarIcon className="w-3 h-3"/> Data Realização</label>
                                    <input type="date" value={editingEvent?.eventDate ? (typeof editingEvent.eventDate === 'string' ? editingEvent.eventDate : (editingEvent.eventDate as any).toDate().toISOString().split('T')[0]) : ''} onChange={e => setEditingEvent({...editingEvent!, eventDate: e.target.value as any})} className="w-full bg-dark border border-gray-700 rounded-xl p-3 text-white font-bold" required />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-gray-500 uppercase ml-1">Horário</label>
                                    <input type="text" value={editingEvent?.eventTime || ''} onChange={e => setEditingEvent({...editingEvent!, eventTime: e.target.value})} className="w-full bg-dark border border-gray-700 rounded-xl p-3 text-white font-bold" />
                                </div>
                            </div>
                            <div className="flex gap-4 pt-2">
                                <label className="flex items-center gap-2 text-white text-[10px] font-black uppercase cursor-pointer"><input type="checkbox" checked={editingEvent?.isActive} onChange={e => setEditingEvent({...editingEvent!, isActive: e.target.checked})} /> Ativo</label>
                                <label className="flex items-center gap-2 text-orange-400 text-[10px] font-black uppercase cursor-pointer"><input type="checkbox" checked={editingEvent?.isSoldOut} onChange={e => setEditingEvent({...editingEvent!, isSoldOut: e.target.checked})} /> Esgotado</label>
                            </div>
                            <button type="submit" className="w-full py-5 bg-green-600 text-white font-black rounded-2xl uppercase text-xs tracking-widest mt-4">Salvar Alterações</button>
                        </form>
                    </div>
                </div>
            )}

            {isCodesModalOpen && selectedEventForCodes && (
                <ManageCodesModal 
                    isOpen={isCodesModalOpen} 
                    onClose={() => setIsCodesModalOpen(false)} 
                    event={selectedEventForCodes} 
                    onSaved={fetchData} 
                />
            )}
        </div>
    );
};

export default AdminGreenlife;
