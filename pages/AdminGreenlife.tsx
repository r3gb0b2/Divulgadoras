
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
import { 
    ArrowLeftIcon, SearchIcon, CheckCircleIcon, XIcon, TicketIcon, RefreshIcon, 
    PlusIcon, TrashIcon, PencilIcon, DownloadIcon, LinkIcon, CogIcon, UndoIcon, ChartBarIcon
} from '../components/Icons';

// Modal de Gerenciamento de Códigos (Estoque)
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
            alert(`${codes.length} códigos adicionados ao estoque Greenlife!`);
            setCodesText('');
            onSaved();
            onClose();
        } catch (e: any) {
            alert("Erro ao salvar estoque: " + e.message);
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

                <div className="space-y-4">
                    <label className="text-[10px] font-black text-gray-500 uppercase ml-1">Colar novos códigos (Um por linha)</label>
                    <textarea 
                        rows={8}
                        value={codesText}
                        onChange={e => setCodesText(e.target.value)}
                        placeholder="ALUNO001&#10;ALUNO002..."
                        className="w-full bg-dark border border-gray-700 rounded-2xl p-4 text-white font-mono text-sm outline-none focus:border-green-500"
                    />
                </div>

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

    const handleCopyTicketLink = (m: VipMembership) => {
        const url = `${window.location.origin}/#/alunosgreenlife/status?email=${encodeURIComponent(m.promoterEmail)}`;
        navigator.clipboard.writeText(url);
        alert("Link do ingresso copiado!");
    };

    const handleManualActivateOrSwap = async (m: VipMembership, forceNew: boolean = false) => {
        const confirmMsg = forceNew 
            ? "Deseja INVALIDAR o código atual e pegar um NOVO do estoque Greenlife?" 
            : "Deseja ativar esta adesão pegando um código do estoque Greenlife disponível?";

        if(!confirm(confirmMsg)) return;

        setIsProcessingId(m.id);
        try {
            const activate = httpsCallable(functions, 'activateGreenlifeMembership');
            const res: any = await activate({ membershipId: m.id, forceNew });
            if (res.data.success) {
                alert(`Sucesso! Código atribuído: ${res.data.code}`);
                fetchData();
            }
        } catch (e: any) { alert("Erro ao processar: " + (e.message || "Estoque possivelmente vazio.")); } finally { setIsProcessingId(null); }
    };

    const handleRefundAction = async (m: VipMembership) => {
        if (!confirm(`ESTORNAR ALUNO: Tem certeza? O código '${m.benefitCode || 'N/A'}' será removido e o acesso invalidado.`)) return;
        setIsProcessingId(m.id);
        try {
            await refundGreenlifeMembership(m.id);
            fetchData();
        } catch (e: any) { alert("Erro ao estornar: " + e.message); } finally { setIsProcessingId(null); }
    };

    const handleSaveEvent = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingEvent?.name || !editingEvent?.price) return;
        try {
            const dataToSave = {
                name: editingEvent.name,
                price: Number(editingEvent.price),
                eventTime: editingEvent.eventTime || '',
                eventLocation: editingEvent.eventLocation || '',
                attractions: editingEvent.attractions || '',
                isActive: editingEvent.isActive ?? true,
                isSoldOut: editingEvent.isSoldOut ?? false, // Garantindo o campo manual
                benefits: editingEvent.benefits || []
            };

            if (editingEvent.id) await updateGreenlifeEvent(editingEvent.id, dataToSave);
            else await createGreenlifeEvent(dataToSave as any);
            
            setIsModalOpen(false);
            fetchData();
        } catch (e: any) { alert(e.message); }
    };

    const handleDownloadStock = async (event: VipEvent) => {
        try {
            const codes = await getGreenlifeEventCodes(event.id);
            if (codes.length === 0) return alert("Estoque vazio.");
            
            const jsonData = codes.map((c: any) => ({
                'CÓDIGO': c.code,
                'STATUS': c.used ? 'USADO' : 'DISPONÍVEL',
                'ALUNO': c.usedBy || '-',
                'DATA USO': c.usedAt ? c.usedAt.toDate().toLocaleString('pt-BR') : '-'
            }));

            // @ts-ignore
            const ws = window.XLSX.utils.json_to_sheet(jsonData);
            // @ts-ignore
            const wb = window.XLSX.utils.book_new();
            // @ts-ignore
            window.XLSX.utils.book_append_sheet(wb, ws, "Estoque Greenlife");
            // @ts-ignore
            window.XLSX.writeFile(wb, `estoque_greenlife_${event.name.replace(/\s+/g, '_')}.xlsx`);
        } catch (e: any) { alert(e.message); }
    };

    return (
        <div className="pb-40">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4 px-4 md:px-0">
                <h1 className="text-3xl font-black text-white uppercase tracking-tighter flex items-center gap-3">
                    <TicketIcon className="w-8 h-8 text-green-500" /> Admin Greenlife
                </h1>
                <div className="flex gap-2">
                    <button onClick={() => navigate('/admin/greenlife-metrics/global')} className="px-4 py-3 bg-green-900/20 text-green-400 border border-green-600/30 font-black rounded-2xl text-[10px] uppercase tracking-widest hover:bg-green-600 hover:text-white transition-all flex items-center gap-2">
                        <ChartBarIcon className="w-4 h-4" /> Métricas de Venda
                    </button>
                    <button onClick={() => { setEditingEvent({ isActive: true, isSoldOut: false, benefits: [] }); setIsModalOpen(true); }} className="px-6 py-3 bg-green-600 text-white font-black rounded-2xl text-[10px] uppercase shadow-xl">Novo Evento</button>
                    <button onClick={() => fetchData()} className="p-3 bg-gray-800 text-gray-400 rounded-2xl hover:text-white transition-colors">
                        <RefreshIcon className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`}/>
                    </button>
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
                                                <p className="text-[11px] text-green-500 font-mono font-black mt-1">{m.benefitCode || '---'}</p>
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
                                                    <button onClick={() => handleCopyTicketLink(m)} className="p-2 bg-indigo-900/30 text-indigo-400 rounded-xl hover:bg-indigo-600 hover:text-white transition-all border border-indigo-800/30" title="Copiar Link do Ingresso">
                                                        <LinkIcon className="w-4 h-4" />
                                                    </button>
                                                    {m.status === 'pending' ? (
                                                        <button onClick={() => handleManualActivateOrSwap(m)} disabled={isProcessingId === m.id} className="px-4 py-2 bg-green-600 text-white rounded-xl text-[9px] font-black uppercase hover:bg-green-500">ATIVAR</button>
                                                    ) : m.status !== 'refunded' && (
                                                        <button onClick={() => handleManualActivateOrSwap(m, true)} disabled={isProcessingId === m.id} className="p-2 bg-blue-900/30 text-blue-400 rounded-xl border border-blue-800/50 hover:bg-blue-600 hover:text-white transition-all" title="Trocar / Renovar Código">
                                                            <RefreshIcon className={`w-4 h-4 ${isProcessingId === m.id ? 'animate-spin' : ''}`} />
                                                        </button>
                                                    )}
                                                    {m.status !== 'refunded' && (
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
                    </div>
                )}

                {activeTab === 'events' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {events.map(ev => (
                            <div key={ev.id} className="bg-dark/40 p-6 rounded-3xl border border-white/5 group hover:border-green-500 transition-all flex flex-col">
                                <div className="flex justify-between mb-4">
                                    <div><h3 className="text-xl font-black text-white uppercase">{ev.name}</h3><p className="text-green-500 font-black">R$ {ev.price.toFixed(2)}</p></div>
                                    <div className={`w-3 h-3 rounded-full ${ev.isActive ? 'bg-green-500' : 'bg-red-500'}`}></div>
                                </div>
                                
                                <div className="p-3 bg-white/5 rounded-2xl text-center mb-6 border border-white/5">
                                    <p className="text-[8px] font-black text-gray-500 uppercase tracking-widest mb-1">Códigos Disponíveis</p>
                                    <p className="text-xl font-black text-green-500">{eventStats[ev.id] || 0}</p>
                                </div>

                                <div className="mt-auto flex flex-wrap gap-2">
                                    <button onClick={() => { setSelectedEventForCodes(ev); setIsCodesModalOpen(true); }} className="flex-grow py-3 bg-indigo-900/20 text-indigo-400 border border-indigo-800/30 rounded-xl text-[10px] font-black uppercase flex items-center justify-center gap-2 hover:bg-indigo-600 hover:text-white transition-all">
                                        <CogIcon className="w-4 h-4" /> ESTOQUE
                                    </button>
                                    <button onClick={() => handleDownloadStock(ev)} className="p-3 bg-gray-800 text-white rounded-xl border border-white/5 hover:bg-green-600 transition-all" title="Baixar Estoque"><DownloadIcon className="w-4 h-4" /></button>
                                    <button onClick={() => { setEditingEvent(ev); setIsModalOpen(true); }} className="p-3 bg-gray-800 text-white rounded-xl border border-white/5 hover:bg-green-600 transition-all"><PencilIcon className="w-4 h-4" /></button>
                                    <button onClick={() => { if(confirm("Excluir?")) deleteGreenlifeEvent(ev.id).then(fetchData); }} className="p-3 bg-red-900/30 text-red-400 rounded-xl"><TrashIcon className="w-4 h-4"/></button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {isModalOpen && (
                <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[110] flex items-center justify-center p-6" onClick={() => setIsModalOpen(false)}>
                    <div className="bg-secondary w-full max-w-2xl p-8 rounded-[2.5rem] border border-white/10" onClick={e => e.stopPropagation()}>
                        <h2 className="text-2xl font-black text-white uppercase mb-6 tracking-tighter">Oferta Greenlife</h2>
                        <form onSubmit={handleSaveEvent} className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-gray-500 uppercase ml-1">Nome da Oferta</label>
                                    <input type="text" placeholder="Nome" value={editingEvent?.name || ''} onChange={e => setEditingEvent({...editingEvent!, name: e.target.value})} className="w-full bg-dark border border-gray-700 rounded-xl p-3 text-white font-bold" />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-gray-500 uppercase ml-1">Preço (R$)</label>
                                    <input type="number" step="0.01" placeholder="Preço" value={editingEvent?.price || ''} onChange={e => setEditingEvent({...editingEvent!, price: Number(e.target.value)})} className="w-full bg-dark border border-gray-700 rounded-xl p-3 text-white font-bold" />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-gray-500 uppercase ml-1">Horário</label>
                                    <input type="text" placeholder="Ex: 08h às 22h" value={editingEvent?.eventTime || ''} onChange={e => setEditingEvent({...editingEvent!, eventTime: e.target.value})} className="w-full bg-dark border border-gray-700 rounded-xl p-3 text-white font-bold" />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-gray-500 uppercase ml-1">Unidade / Local</label>
                                    <input type="text" placeholder="Ex: Greenlife Aldeota" value={editingEvent?.eventLocation || ''} onChange={e => setEditingEvent({...editingEvent!, eventLocation: e.target.value})} className="w-full bg-dark border border-gray-700 rounded-xl p-3 text-white font-bold" />
                                </div>
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-gray-500 uppercase ml-1">Atrações do Dia</label>
                                <input type="text" placeholder="Ex: Cantor X, DJ Y..." value={editingEvent?.attractions || ''} onChange={e => setEditingEvent({...editingEvent!, attractions: e.target.value})} className="w-full bg-dark border border-gray-700 rounded-xl p-3 text-white font-bold" />
                            </div>
                            <div className="flex flex-wrap gap-6 pt-2">
                                <label className="flex items-center gap-2 text-white text-[10px] font-black uppercase cursor-pointer">
                                    <input type="checkbox" checked={editingEvent?.isActive} onChange={e => setEditingEvent({...editingEvent!, isActive: e.target.checked})} className="w-4 h-4 rounded bg-dark text-green-500 focus:ring-0" /> Ativo
                                </label>
                                <label className="flex items-center gap-2 text-orange-400 text-[10px] font-black uppercase cursor-pointer">
                                    <input type="checkbox" checked={editingEvent?.isSoldOut} onChange={e => setEditingEvent({...editingEvent!, isSoldOut: e.target.checked})} className="w-4 h-4 rounded bg-dark text-orange-500 focus:ring-0" /> Esgotado (Manual)
                                </label>
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
