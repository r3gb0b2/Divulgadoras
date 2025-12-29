
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { 
    getAllVipMemberships, 
    updateVipMembership, 
    getAllVipEvents
} from '../services/vipService';
import { updatePromoter } from '../services/promoterService';
import { getOrganizations } from '../services/organizationService';
import { VipMembership, VipEvent } from '../types';
import { 
    ArrowLeftIcon, SearchIcon, CheckCircleIcon, 
    TicketIcon, RefreshIcon, ClockIcon, UserIcon,
    BuildingOfficeIcon, WhatsAppIcon, InstagramIcon,
    // FIX: Added XIcon to imports to fix "Cannot find name 'XIcon'" error.
    XIcon
} from '../components/Icons';

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
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isBulkProcessing, setIsBulkProcessing] = useState(false);

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

    const handleApproveBulk = async () => {
        if (selectedIds.size === 0) return;
        if (!window.confirm(`Deseja ATIVAR os benefícios de ${selectedIds.size} membros selecionados?`)) return;
        
        setIsBulkProcessing(true);
        try {
            // FIX: Explicitly typed 'id' as string to resolve "Argument of type 'unknown' is not assignable to parameter of type 'string'" error on line 70.
            await Promise.all(Array.from(selectedIds).map(async (id: string) => {
                const membership = memberships.find(m => m.id === id);
                if (membership) {
                    await updateVipMembership(id, { isBenefitActive: true });
                    await updatePromoter(membership.promoterId, { emocoesBenefitActive: true });
                }
            }));
            setSelectedIds(new Set());
            await fetchData();
            alert("Membros ativados com sucesso!");
        } catch (e) {
            alert("Erro ao processar ativação em massa.");
        } finally {
            setIsBulkProcessing(false);
        }
    };

    const handleToggleSelectOne = (id: string) => {
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedIds(next);
    };

    const handleToggleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            setSelectedIds(new Set(filteredMembers.map(m => m.id)));
        } else {
            setSelectedIds(new Set());
        }
    };

    const handleApprove = async (m: VipMembership) => {
        setIsActionLoading(m.id);
        try {
            const benefitActive = !m.isBenefitActive;
            
            await updateVipMembership(m.id, { 
                isBenefitActive: benefitActive 
            });
            await updatePromoter(m.promoterId, { 
                emocoesBenefitActive: benefitActive 
            });
            await fetchData();
        } catch (e) { alert("Erro ao processar."); }
        finally { setIsActionLoading(null); }
    };

    const filteredMembers = useMemo(() => {
        return memberships.filter(m => {
            const matchesStatus = filterStatus === 'all' || m.status === filterStatus;
            const matchesSearch = 
                m.promoterName.toLowerCase().includes(searchQuery.toLowerCase()) || 
                m.promoterEmail.toLowerCase().includes(searchQuery.toLowerCase()) ||
                (m.promoterWhatsapp || '').includes(searchQuery);
            return matchesStatus && matchesSearch;
        });
    }, [memberships, filterStatus, searchQuery]);

    const formatDate = (ts: any) => {
        if (!ts) return 'N/A';
        const d = ts.toDate ? ts.toDate() : new Date(ts);
        return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
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
                    {selectedIds.size > 0 && (
                        <button onClick={handleApproveBulk} disabled={isBulkProcessing} className="flex-1 md:flex-none px-6 py-3 bg-green-600 text-white font-black rounded-2xl text-[10px] uppercase tracking-widest shadow-xl flex items-center justify-center gap-2 transition-all hover:bg-green-500">
                            {isBulkProcessing ? 'PROCESSANDO...' : `ATIVAR ${selectedIds.size} SELECIONADOS`}
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

            <div className="bg-secondary/60 backdrop-blur-xl rounded-[2.5rem] p-6 border border-white/5 shadow-2xl space-y-6">
                <div className="flex flex-col md:flex-row gap-4">
                    <select value={selectedEventId} onChange={e => setSelectedEventId(e.target.value)} className="bg-dark border border-gray-700 text-white px-5 py-3 rounded-2xl text-xs font-black uppercase tracking-widest focus:ring-1 focus:ring-primary outline-none min-w-[220px]">
                        <option value="all">Todos Eventos VIP</option>
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

                {isLoading ? (
                    <div className="py-20 text-center flex flex-col items-center gap-4">
                        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-dark/50 text-[10px] font-black text-gray-500 uppercase tracking-widest border-b border-white/5">
                                    <th className="px-6 py-5 w-10">
                                        <input 
                                            type="checkbox" 
                                            checked={filteredMembers.length > 0 && selectedIds.size === filteredMembers.length}
                                            onChange={handleToggleSelectAll}
                                            className="w-5 h-5 rounded border-gray-700 bg-dark text-primary focus:ring-primary"
                                        />
                                    </th>
                                    <th className="px-6 py-5">Comprador</th>
                                    <th className="px-6 py-5">Contatos</th>
                                    <th className="px-6 py-5">Evento / Produtora</th>
                                    <th className="px-6 py-5">Código / Status</th>
                                    <th className="px-6 py-5 text-right">Ação</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {filteredMembers.map(m => (
                                    <tr key={m.id} className={`hover:bg-white/[0.02] transition-colors ${selectedIds.has(m.id) ? 'bg-primary/5' : ''}`}>
                                        <td className="px-6 py-5">
                                            <input 
                                                type="checkbox" 
                                                checked={selectedIds.has(m.id)} 
                                                onChange={() => handleToggleSelectOne(m.id)}
                                                className="w-5 h-5 rounded border-gray-700 bg-dark text-primary focus:ring-primary"
                                            />
                                        </td>
                                        <td className="px-6 py-5">
                                            <p className="text-sm font-black text-white uppercase truncate">{m.promoterName}</p>
                                            <div className="flex items-center gap-2 mt-1">
                                                <ClockIcon className="w-3 h-3 text-gray-500" />
                                                <span className="text-[10px] font-bold text-gray-500 uppercase">{formatDate(m.submittedAt)}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-5">
                                            <div className="flex flex-col gap-1.5">
                                                <a href={`mailto:${m.promoterEmail}`} className="text-[11px] font-bold text-gray-300 hover:text-white truncate flex items-center gap-2">
                                                    <UserIcon className="w-3.5 h-3.5 text-blue-400" /> {m.promoterEmail}
                                                </a>
                                                <div className="flex gap-4">
                                                    <a href={`https://wa.me/55${m.promoterWhatsapp?.replace(/\D/g, '')}`} target="_blank" className="text-green-400 hover:text-green-300 transition-colors flex items-center gap-1.5 font-black text-[10px] uppercase tracking-widest">
                                                        <WhatsAppIcon className="w-4 h-4" /> WhatsApp
                                                    </a>
                                                    {m.promoterInstagram && (
                                                        <a href={`https://instagram.com/${m.promoterInstagram.replace('@', '')}`} target="_blank" className="text-pink-400 hover:text-pink-300 transition-colors flex items-center gap-1.5 font-black text-[10px] uppercase tracking-widest">
                                                            <InstagramIcon className="w-4 h-4" /> Instagram
                                                        </a>
                                                    )}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-5">
                                            <p className="text-primary font-black text-[10px] uppercase tracking-tighter truncate">{m.vipEventName}</p>
                                            <p className="text-[9px] font-black text-gray-600 uppercase tracking-widest truncate mt-1">
                                                {organizations[m.organizationId] || 'Venda Direta'}
                                            </p>
                                        </td>
                                        <td className="px-6 py-5">
                                            <div className="bg-gray-800/50 p-2 rounded-xl border border-white/5 mb-1 text-center">
                                                <p className="text-white font-mono font-bold text-[11px]">{m.benefitCode || '---'}</p>
                                            </div>
                                            <div className={`text-center px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest border ${m.isBenefitActive ? 'bg-green-900/40 text-green-400 border-green-800' : 'bg-amber-900/40 text-amber-400 border-amber-800'}`}>
                                                {m.isBenefitActive ? 'ATIVO' : 'PENDENTE'}
                                            </div>
                                        </td>
                                        <td className="px-6 py-5 text-right">
                                            <button 
                                                onClick={() => handleApprove(m)}
                                                disabled={isActionLoading === m.id}
                                                className={`p-3 font-black rounded-xl transition-all shadow-lg disabled:opacity-50 ${m.isBenefitActive ? 'bg-amber-600 text-white' : 'bg-green-600 text-white'}`}
                                                title={m.isBenefitActive ? 'Pausar Benefício' : 'Ativar Benefício'}
                                            >
                                                {/* FIX: Added missing XIcon import above to fix "Cannot find name 'XIcon'" error on line 251. */}
                                                {isActionLoading === m.id ? <RefreshIcon className="w-5 h-5 animate-spin" /> : (m.isBenefitActive ? <XIcon className="w-5 h-5" /> : <CheckCircleIcon className="w-5 h-5" />)}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AdminClubVip;
