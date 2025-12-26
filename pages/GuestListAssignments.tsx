import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { GuestList, Promoter, PostAssignment, Timestamp, FieldValue } from '../types';
import { getGuestListById, updateGuestList } from '../services/guestListService';
import { getApprovedPromoters } from '../services/promoterService';
import { getAssignmentsForOrganization } from '../services/postService';
import { ArrowLeftIcon, SearchIcon, FilterIcon } from '../components/Icons';
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';

const getPerformanceColor = (rate: number): string => {
    if (rate < 0) return 'text-gray-300';
    if (rate === 100) return 'text-green-400';
    if (rate >= 60) return 'text-blue-400';
    if (rate >= 31) return 'text-yellow-400';
    return 'text-red-400';
};

const toDateSafe = (timestamp: any): Date | null => {
    if (!timestamp) return null;
    if (typeof timestamp.toDate === 'function') return timestamp.toDate();
    if (typeof timestamp === 'object' && timestamp.seconds !== undefined) return new Date(timestamp.seconds * 1000);
    const date = new Date(timestamp);
    if (!isNaN(date.getTime())) return date;
    return null;
};

const timestampToDateTimeLocal = (ts: any): string => {
    if (!ts) return '';
    try {
        const date = ts.toDate ? ts.toDate() : new Date(ts.seconds * 1000);
        if (isNaN(date.getTime())) return '';
        const localDate = new Date(date.getTime() - (date.getTimezoneOffset() * 60000));
        return localDate.toISOString().slice(0, 16);
    } catch (e) { return ''; }
};

const GuestListAssignments: React.FC = () => {
    const { listId } = useParams<{ listId: string }>();
    const navigate = useNavigate();
    const { adminData } = useAdminAuth();

    const [list, setList] = useState<GuestList | null>(null);
    const [promoters, setPromoters] = useState<Promoter[]>([]);
    const [postAssignments, setPostAssignments] = useState<PostAssignment[]>([]);
    const [assignments, setAssignments] = useState<{ [promoterId: string]: { guestAllowance: number; info?: string; closesAt?: Timestamp | FieldValue | null } }>({});
    
    const [searchQuery, setSearchQuery] = useState('');
    const [colorFilter, setColorFilter] = useState<'all' | 'green' | 'blue' | 'yellow' | 'red'>('all');
    const [filterInGroup, setFilterInGroup] = useState(false);
    const [bulkAllowance, setBulkAllowance] = useState<number>(0);
    const [bulkInfo, setBulkInfo] = useState<string>('');
    const [bulkClosesAt, setBulkClosesAt] = useState<string>('');

    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchData = useCallback(async () => {
        if (!listId || !adminData) return;
        setIsLoading(true);
        setError(null);
        try {
            const listData = await getGuestListById(listId);
            if (!listData) throw new Error("Lista de convidados não encontrada.");
            
            if (!listData.stateAbbr) {
                throw new Error("Dados da lista incompletos. Por favor, edite e salve a lista novamente para corrigir.");
            }

            const [approvedPromoters, orgAssignments] = await Promise.all([
                getApprovedPromoters(
                    listData.organizationId,
                    listData.stateAbbr,
                    listData.campaignName
                ),
                getAssignmentsForOrganization(listData.organizationId)
            ]);

            setList(listData);
            approvedPromoters.sort((a, b) => (a.instagram || a.name).localeCompare(b.instagram || b.name));
            setPromoters(approvedPromoters);
            setPostAssignments(orgAssignments);
            
            setAssignments(listData.assignments as any || {});
            setBulkAllowance(listData.guestAllowance || 0);

        } catch (err: any) {
            setError(err.message || "Falha ao carregar dados.");
        } finally {
            setIsLoading(false);
        }
    }, [listId, adminData]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const promotersWithStats = useMemo(() => {
        if (postAssignments.length === 0) {
            return promoters.map(p => ({ ...p, completionRate: -1 }));
        }
    
        const statsMap = new Map<string, { assigned: number; completed: number; acceptedJustifications: number; missed: number; pending: number }>();
        promoters.forEach(p => {
            statsMap.set(p.id, { assigned: 0, completed: 0, acceptedJustifications: 0, missed: 0, pending: 0 });
        });
    
        const now = new Date();
        postAssignments.forEach(a => {
            if (!a.post) return;
            const stat = statsMap.get(a.promoterId);
            if (!stat) return;
            stat.assigned++;
            if (a.proofSubmittedAt) stat.completed++;
            else if (a.justification && a.justificationStatus === 'accepted') stat.acceptedJustifications++;
            else if (a.justification && a.justificationStatus === 'rejected') stat.missed++;
            else {
                let isMissed = false;
                if (!a.post.allowLateSubmissions) {
                    const confirmedAt = toDateSafe(a.confirmedAt);
                    if (confirmedAt) {
                        const deadline = new Date(confirmedAt.getTime() + 24 * 60 * 60 * 1000);
                        if (now > deadline) isMissed = true;
                    } else {
                        const expiresAt = toDateSafe(a.post.expiresAt);
                        if (expiresAt && now > expiresAt) isMissed = true;
                    }
                }
                if (isMissed) stat.missed++;
            }
        });
    
        return promoters.map(p => {
            const stats = statsMap.get(p.id);
            const successfulOutcomes = stats ? stats.completed + stats.acceptedJustifications : 0;
            const completionRate = stats && stats.assigned > 0
                ? Math.round((successfulOutcomes / stats.assigned) * 100)
                : -1;
            return { ...p, completionRate };
        });
    }, [promoters, postAssignments]);

    const filteredPromoters = useMemo(() => {
        let results = promotersWithStats;
        if (filterInGroup) results = results.filter(p => p.hasJoinedGroup === true);
        if (searchQuery.trim()) {
            const lowerQuery = searchQuery.toLowerCase();
            results = results.filter(p => p.name.toLowerCase().includes(lowerQuery) || (p.instagram && p.instagram.toLowerCase().includes(lowerQuery)));
        }
        if (colorFilter !== 'all') {
            results = results.filter(p => {
                const rate = p.completionRate;
                if (rate < 0) return false;
                if (colorFilter === 'green') return rate === 100;
                if (colorFilter === 'blue') return rate >= 60 && rate < 100;
                if (colorFilter === 'yellow') return rate >= 31 && rate < 60;
                if (colorFilter === 'red') return rate >= 0 && rate <= 30;
                return true;
            });
        }
        return results;
    }, [promotersWithStats, searchQuery, colorFilter, filterInGroup]);

    const handleToggle = (promoterId: string) => {
        setAssignments(prev => {
            const newAssignments = { ...prev };
            if (newAssignments[promoterId]) {
                delete newAssignments[promoterId];
            } else {
                newAssignments[promoterId] = { guestAllowance: list?.guestAllowance || 0, info: '', closesAt: null };
            }
            return newAssignments;
        });
    };

    const handleAllowanceChange = (promoterId: string, value: string) => {
        const allowance = parseInt(value, 10);
        if (isNaN(allowance) || allowance < 0) return;
        setAssignments(prev => ({
            ...prev,
            [promoterId]: { ...prev[promoterId], guestAllowance: allowance }
        }));
    };

    const handleInfoChange = (promoterId: string, value: string) => {
        setAssignments(prev => ({
            ...prev,
            [promoterId]: { ...prev[promoterId], info: value }
        }));
    };
    
    const handleDateChange = (promoterId: string, value: string) => {
        const date = value ? firebase.firestore.Timestamp.fromDate(new Date(value)) : null;
        setAssignments(prev => ({
            ...prev,
            [promoterId]: { ...prev[promoterId], closesAt: date }
        }));
    };

    const handleToggleAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        const isChecked = e.target.checked;
        const visibleIds = filteredPromoters.map(p => p.id);
        setAssignments(prev => {
            const newAssignments = { ...prev };
            if (isChecked) {
                visibleIds.forEach(id => {
                    if (!newAssignments[id]) {
                        newAssignments[id] = { guestAllowance: list?.guestAllowance || 0, info: '', closesAt: null };
                    }
                });
            } else {
                visibleIds.forEach(id => delete newAssignments[id]);
            }
            return newAssignments;
        });
    };
    
    const handleApplyBulkAllowance = () => {
        setAssignments(prev => {
            const newAssignments = { ...prev };
            Object.keys(newAssignments).forEach(id => {
                newAssignments[id] = { ...newAssignments[id], guestAllowance: bulkAllowance };
            });
            return newAssignments;
        });
    };

    const handleApplyBulkInfo = () => {
        setAssignments(prev => {
            const newAssignments = { ...prev };
            Object.keys(newAssignments).forEach(id => {
                newAssignments[id] = { ...newAssignments[id], info: bulkInfo };
            });
            return newAssignments;
        });
    };
    
    const handleApplyBulkDate = () => {
        const date = bulkClosesAt ? firebase.firestore.Timestamp.fromDate(new Date(bulkClosesAt)) : null;
        setAssignments(prev => {
            const newAssignments = { ...prev };
            Object.keys(newAssignments).forEach(id => {
                newAssignments[id] = { ...newAssignments[id], closesAt: date };
            });
            return newAssignments;
        });
    };

    const handleSave = async () => {
        if (!listId) return;
        setIsSaving(true);
        setError(null);
        try {
            await updateGuestList(listId, { assignments: assignments as any });
            alert("Atribuições salvas!");
            navigate('/admin/lists');
        } catch (err: any) {
            setError(err.message || "Falha ao salvar.");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div>
            <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
                <div>
                    <button onClick={() => navigate(-1)} className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary-dark transition-colors"><ArrowLeftIcon className="w-5 h-5" /><span>Voltar</span></button>
                    <h1 className="text-3xl font-bold mt-1">Atribuir Divulgadoras</h1>
                    <p className="text-primary font-semibold">{list?.name || 'Carregando...'} para {list?.campaignName}</p>
                </div>
            </div>
            <div className="bg-secondary shadow-lg rounded-lg p-6">
                 <div className="space-y-6">
                    {/* LEGENDA E FILTROS DE COR */}
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 p-4 border border-gray-700 rounded-lg">
                        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-gray-400">
                            <span className="font-bold text-gray-300">Legenda de Aproveitamento:</span>
                            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-green-400"></div><span>100%</span></div>
                            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-blue-400"></div><span>60-99%</span></div>
                            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-yellow-400"></div><span>31-59%</span></div>
                            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-red-400"></div><span>0-30%</span></div>
                        </div>
                        <div className="flex items-center gap-x-2">
                            <span className="font-bold text-gray-300 text-xs">Filtrar por Cor:</span>
                            <div className="flex space-x-1 p-1 bg-dark/70 rounded-lg">
                                {(['all', 'green', 'blue', 'yellow', 'red'] as const).map(f => (
                                    <button key={f} onClick={() => setColorFilter(f)} className={`px-2 py-1 text-[10px] font-bold rounded-md transition-all flex items-center gap-1.5 ${colorFilter === f ? 'bg-primary text-white' : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200'}`}>
                                        {f !== 'all' && <div className={`w-2 h-2 rounded-full ${f === 'green' ? 'bg-green-400' : f === 'blue' ? 'bg-blue-400' : f === 'yellow' ? 'bg-yellow-400' : 'bg-red-400'}`}></div>}
                                        <span>{{'all': 'Todos', 'green': 'Verde', 'blue': 'Azul', 'yellow': 'Laranja', 'red': 'Vermelho'}[f]}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 p-4 border border-gray-700 rounded-lg">
                        <div className="relative flex-grow w-full">
                            <span className="absolute inset-y-0 left-0 flex items-center pl-3"><SearchIcon className="h-5 w-5 text-gray-400" /></span>
                            <input type="text" placeholder="Buscar por nome ou @instagram..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full pl-10 pr-4 py-2 border border-gray-600 rounded-md bg-gray-800 text-gray-200 focus:ring-1 focus:ring-primary outline-none" />
                        </div>
                        <label className="flex items-center space-x-2 text-sm font-medium text-gray-200 cursor-pointer flex-shrink-0">
                            <input type="checkbox" checked={filterInGroup} onChange={e => setFilterInGroup(e.target.checked)} className="h-4 w-4 text-primary bg-gray-700 border-gray-500 rounded focus:ring-primary" />
                            <span>Apenas no grupo</span>
                        </label>
                    </div>
                    
                    <div className="flex flex-col gap-4 p-4 border border-gray-700 rounded-lg bg-dark/20">
                         <div className="flex flex-wrap justify-between items-center gap-4">
                            <label className="flex items-center space-x-2 font-bold text-sm cursor-pointer">
                                <input type="checkbox" onChange={handleToggleAll} checked={filteredPromoters.length > 0 && filteredPromoters.every(p => !!assignments[p.id])} className="h-4 w-4 text-primary bg-gray-700 border-gray-500 rounded" />
                                <span>Marcar/Desmarcar Visíveis ({Object.keys(assignments).length} total selecionado)</span>
                            </label>
                        </div>
                        <div className="flex flex-col md:flex-row flex-wrap items-start md:items-center gap-4">
                            <div className="flex items-center gap-2">
                                <input type="number" min="0" value={bulkAllowance} onChange={e => setBulkAllowance(parseInt(e.target.value, 10) || 0)} className="w-20 px-2 py-1 border border-gray-600 rounded-md bg-gray-700 text-white font-bold" />
                                <button type="button" onClick={handleApplyBulkAllowance} className="px-3 py-1.5 bg-primary text-white text-[10px] font-black uppercase rounded hover:bg-primary-dark transition-all">Qtde em Massa</button>
                            </div>
                            <div className="flex items-center gap-2">
                                <input type="text" value={bulkInfo} onChange={e => setBulkInfo(e.target.value)} className="w-40 px-2 py-1 border border-gray-600 rounded-md bg-gray-700 text-white text-sm" placeholder="Informativo..."/>
                                <button type="button" onClick={handleApplyBulkInfo} className="px-3 py-1.5 bg-primary text-white text-[10px] font-black uppercase rounded hover:bg-primary-dark transition-all">Info em Massa</button>
                            </div>
                             <div className="flex items-center gap-2">
                                <input type="datetime-local" value={bulkClosesAt} onChange={e => setBulkClosesAt(e.target.value)} className="w-48 px-2 py-1 border border-gray-600 rounded-md bg-gray-700 text-white text-[10px]" style={{colorScheme: 'dark'}} />
                                <button type="button" onClick={handleApplyBulkDate} className="px-3 py-1.5 bg-primary text-white text-[10px] font-black uppercase rounded hover:bg-primary-dark transition-all">Data em Massa</button>
                            </div>
                        </div>
                    </div>

                    <div className="overflow-x-auto rounded-xl border border-gray-700">
                        <table className="min-w-full">
                            <thead className="bg-gray-700/50">
                                <tr>
                                    <th className="p-3 text-left w-12"></th>
                                    <th className="p-3 text-left text-xs font-bold text-gray-300 uppercase tracking-widest">Divulgadora</th>
                                    <th className="p-3 text-center text-xs font-bold text-gray-300 uppercase tracking-widest">Perf.</th>
                                    <th className="p-3 text-left text-xs font-bold text-gray-300 uppercase tracking-widest">Convidados</th>
                                    <th className="p-3 text-left text-xs font-bold text-gray-300 uppercase tracking-widest">Informativo Extra</th>
                                    <th className="p-3 text-left text-xs font-bold text-gray-300 uppercase tracking-widest">Prazo Limite</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-700">
                                {filteredPromoters.map(p => (
                                    <tr key={p.id} className={`hover:bg-gray-700/40 transition-colors ${assignments[p.id] ? 'bg-primary/5' : ''}`}>
                                        <td className="p-3"><input type="checkbox" checked={!!assignments[p.id]} onChange={() => handleToggle(p.id)} className="h-4 w-4 text-primary bg-gray-700 border-gray-500 rounded"/></td>
                                        <td className="p-3 whitespace-nowrap">
                                            <div className={`font-bold text-sm ${p.hasJoinedGroup ? 'text-green-400' : 'text-white'}`}>{p.instagram || p.name}</div>
                                            <div className="text-[10px] text-gray-500">{p.name}</div>
                                        </td>
                                        <td className="p-3 whitespace-nowrap text-center">
                                            <span className={`font-black text-xs ${getPerformanceColor(p.completionRate)}`}>
                                                {p.completionRate >= 0 ? `${p.completionRate}%` : 'N/A'}
                                            </span>
                                        </td>
                                        <td className="p-3">
                                            <input type="number" min="0" value={assignments[p.id]?.guestAllowance ?? ''} onChange={e => handleAllowanceChange(p.id, e.target.value)} disabled={!assignments[p.id]} className="w-16 px-2 py-1 border border-gray-600 rounded bg-gray-800 text-white font-bold disabled:opacity-30"/>
                                        </td>
                                        <td className="p-3">
                                            <input type="text" value={assignments[p.id]?.info ?? ''} onChange={e => handleInfoChange(p.id, e.target.value)} disabled={!assignments[p.id]} className="w-full px-2 py-1 border border-gray-600 rounded bg-gray-800 text-white text-xs disabled:opacity-30" placeholder="Ex: Entrada até 23h"/>
                                        </td>
                                        <td className="p-3">
                                            <input type="datetime-local" value={assignments[p.id] ? timestampToDateTimeLocal(assignments[p.id]?.closesAt) : ''} onChange={e => handleDateChange(p.id, e.target.value)} disabled={!assignments[p.id]} className="px-2 py-1 border border-gray-600 rounded bg-gray-800 text-white disabled:opacity-30 text-[10px]" style={{colorScheme: 'dark'}}/>
                                        </td>
                                    </tr>
                                ))}
                                {filteredPromoters.length === 0 && (
                                    <tr><td colSpan={6} className="text-center py-20 text-gray-500 font-bold uppercase tracking-widest">Nenhuma divulgadora encontrada</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
                <div className="mt-6 border-t border-gray-700 pt-6 flex justify-end gap-4">
                    <button onClick={() => navigate('/admin/lists')} className="px-6 py-2 bg-gray-700 text-white rounded-md hover:bg-gray-600 transition-all font-semibold">Cancelar</button>
                    <button onClick={handleSave} disabled={isSaving || isLoading} className="px-8 py-2 bg-primary text-white font-black uppercase text-xs tracking-widest rounded-md hover:bg-primary-dark transition-all disabled:opacity-50 shadow-lg shadow-primary/20">
                        {isSaving ? 'Salvando...' : 'Salvar Atribuições'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default GuestListAssignments;