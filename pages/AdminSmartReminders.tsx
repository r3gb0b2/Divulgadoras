
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { getAssignmentsForOrganization } from '../services/postService';
import { PostAssignment, Timestamp } from '../types';
import { functions } from '../firebase/config';
import { httpsCallable } from 'firebase/functions';
import { 
    ArrowLeftIcon, WhatsAppIcon, SearchIcon, RefreshIcon, 
    FilterIcon, ClockIcon, AlertTriangleIcon, CheckCircleIcon 
} from '../components/Icons';

const toDateSafe = (ts: any): Date | null => {
    if (!ts) return null;
    if (typeof ts.toDate === 'function') return ts.toDate();
    if (ts.seconds) return new Date(ts.seconds * 1000);
    return new Date(ts);
};

const AdminSmartReminders: React.FC = () => {
    const navigate = useNavigate();
    const { selectedOrgId } = useAdminAuth();
    
    const [assignments, setAssignments] = useState<PostAssignment[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isProcessing, setIsProcessing] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterHours, setFilterHours] = useState(12); // Padrão: postagens com mais de 12h

    const fetchData = useCallback(async () => {
        if (!selectedOrgId) return;
        setIsLoading(true);
        try {
            const data = await getAssignmentsForOrganization(selectedOrgId);
            setAssignments(data);
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    }, [selectedOrgId]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const delayedAssignments = useMemo(() => {
        const now = new Date();
        return assignments.filter(a => {
            // Apenas quem confirmou que postou (status confirmed) mas ainda não mandou o print
            if (a.status !== 'confirmed' || a.proofSubmittedAt) return false;
            
            const confirmedAt = toDateSafe(a.confirmedAt);
            if (!confirmedAt) return false;
            
            const diffInHours = (now.getTime() - confirmedAt.getTime()) / (1000 * 60 * 60);
            
            const matchesTime = diffInHours >= filterHours;
            const matchesSearch = a.promoterName.toLowerCase().includes(searchQuery.toLowerCase());
            
            return matchesTime && matchesSearch;
        }).sort((a, b) => {
            const dateA = toDateSafe(a.confirmedAt)?.getTime() || 0;
            const dateB = toDateSafe(b.confirmedAt)?.getTime() || 0;
            return dateA - dateB; // Mais antigos primeiro
        });
    }, [assignments, filterHours, searchQuery]);

    const handleSendZap = async (a: PostAssignment) => {
        setIsProcessing(a.id);
        try {
            const sendSmartZap = httpsCallable(functions, 'sendSmartWhatsAppReminder');
            const res: any = await sendSmartZap({ 
                assignmentId: a.id,
                promoterId: a.promoterId,
                organizationId: selectedOrgId
            });
            
            if (res.data.success) {
                alert("Mensagem enviada com sucesso!");
                // Opcional: remover da lista local ou marcar como "notificado hoje"
            } else {
                throw new Error(res.data.message);
            }
        } catch (err: any) {
            alert("Erro ao enviar: " + err.message);
        } finally {
            setIsProcessing(null);
        }
    };

    const handleBulkZap = async () => {
        if (delayedAssignments.length === 0) return;
        if (!window.confirm(`Deseja enviar lembretes para ${delayedAssignments.length} divulgadoras agora?`)) return;
        
        setIsProcessing('bulk');
        let count = 0;
        try {
            const sendSmartZap = httpsCallable(functions, 'sendSmartWhatsAppReminder');
            for (const a of delayedAssignments) {
                await sendSmartZap({ 
                    assignmentId: a.id, 
                    promoterId: a.promoterId, 
                    organizationId: selectedOrgId 
                });
                count++;
            }
            alert(`${count} lembretes disparados com sucesso!`);
        } catch (e) {
            alert("Ocorreu um erro no processo em lote.");
        } finally {
            setIsProcessing(null);
        }
    };

    return (
        <div className="pb-40">
            <div className="flex justify-between items-center mb-8 px-4 md:px-0">
                <div>
                    <h1 className="text-3xl font-black text-white uppercase tracking-tighter flex items-center gap-3">
                        <WhatsAppIcon className="w-8 h-8 text-green-500" /> Cobrança Inteligente
                    </h1>
                    <p className="text-gray-500 text-[10px] font-black uppercase tracking-widest mt-1">Recupere prints esquecidos automaticamente</p>
                </div>
                <button onClick={() => navigate(-1)} className="p-3 bg-gray-800 text-gray-400 rounded-2xl hover:text-white transition-colors">
                    <ArrowLeftIcon className="w-5 h-5"/>
                </button>
            </div>

            <div className="bg-secondary/60 backdrop-blur-xl rounded-[2.5rem] p-6 border border-white/5 shadow-2xl space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                    <div className="md:col-span-6 relative">
                        <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                        <input 
                            type="text" 
                            placeholder="Buscar divulgadora..." 
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="w-full pl-11 pr-4 py-3 bg-dark border border-gray-700 rounded-2xl text-white text-[10px] font-black uppercase outline-none focus:border-primary"
                        />
                    </div>
                    <div className="md:col-span-4">
                        <select 
                            value={filterHours} 
                            onChange={e => setFilterHours(Number(e.target.value))}
                            className="w-full px-4 py-3 bg-dark border border-gray-700 rounded-2xl text-white text-[10px] font-black uppercase outline-none focus:border-primary"
                        >
                            <option value={6}>Atraso de 6h+</option>
                            <option value={12}>Atraso de 12h+</option>
                            <option value={24}>Atraso de 24h+</option>
                            <option value={48}>Atraso de 48h+</option>
                        </select>
                    </div>
                    <button onClick={fetchData} className="md:col-span-2 flex items-center justify-center py-3 bg-gray-800 text-gray-300 rounded-2xl hover:bg-gray-700">
                        <RefreshIcon className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                    </button>
                </div>

                {delayedAssignments.length > 0 && (
                    <div className="bg-primary/10 border border-primary/20 p-6 rounded-3xl flex flex-col md:flex-row items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-primary/20 rounded-2xl text-primary animate-pulse">
                                <AlertTriangleIcon className="w-6 h-6" />
                            </div>
                            <div>
                                <h3 className="text-white font-black uppercase text-sm">{delayedAssignments.length} Postagens Críticas</h3>
                                <p className="text-gray-400 text-[10px] font-bold uppercase">Estas divulgadoras confirmaram o post mas não enviaram o print.</p>
                            </div>
                        </div>
                        <button 
                            onClick={handleBulkZap}
                            disabled={isProcessing !== null}
                            className="px-8 py-3 bg-primary text-white font-black rounded-2xl text-[10px] uppercase tracking-widest shadow-xl hover:bg-primary-dark disabled:opacity-50"
                        >
                            {isProcessing === 'bulk' ? 'DISPARANDO...' : 'COBRAR TODAS AGORA'}
                        </button>
                    </div>
                )}

                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-dark/50 text-[10px] font-black text-gray-500 uppercase tracking-widest border-b border-white/5">
                                <th className="px-6 py-5">Divulgadora</th>
                                <th className="px-6 py-5">Evento / Campanha</th>
                                <th className="px-6 py-5 text-center">Tempo de Atraso</th>
                                <th className="px-6 py-4 text-right">Ação</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {isLoading ? (
                                <tr><td colSpan={4} className="py-20 text-center text-gray-500 font-black uppercase text-xs">Sincronizando atrasos...</td></tr>
                            ) : delayedAssignments.length === 0 ? (
                                <tr><td colSpan={4} className="py-20 text-center text-gray-500 font-black uppercase text-xs">Nenhum print pendente no período selecionado! 🎉</td></tr>
                            ) : delayedAssignments.map(a => {
                                const confirmedAt = toDateSafe(a.confirmedAt);
                                const diff = confirmedAt ? Math.floor((new Date().getTime() - confirmedAt.getTime()) / (1000 * 60 * 60)) : 0;
                                return (
                                    <tr key={a.id} className="hover:bg-white/[0.02] transition-colors group">
                                        <td className="px-6 py-5">
                                            <p className="text-sm font-black text-white uppercase">{a.promoterName}</p>
                                            <p className="text-[10px] text-gray-500 font-mono lowercase">{a.promoterEmail}</p>
                                        </td>
                                        <td className="px-6 py-5">
                                            <p className="text-xs text-primary font-black uppercase">{a.post.campaignName}</p>
                                        </td>
                                        <td className="px-6 py-5 text-center">
                                            <div className="inline-flex items-center gap-2 px-3 py-1 bg-red-900/20 text-red-400 rounded-full border border-red-800/30">
                                                <ClockIcon className="w-3 h-3" />
                                                <span className="text-[10px] font-black">{diff} horas</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-5 text-right">
                                            <button 
                                                onClick={() => handleSendZap(a)}
                                                disabled={isProcessing !== null}
                                                className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-xl text-[9px] font-black uppercase hover:bg-green-500 shadow-lg shadow-green-900/20 transition-all transform active:scale-95"
                                            >
                                                {isProcessing === a.id ? <RefreshIcon className="w-3 h-3 animate-spin"/> : <WhatsAppIcon className="w-3 h-3" />}
                                                COBRAR PRINT
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default AdminSmartReminders;
