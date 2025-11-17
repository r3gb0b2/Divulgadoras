import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { GuestList, Promoter, PostAssignment, Timestamp, FieldValue, Campaign } from '../types';
import { getGuestListById, updateGuestList } from '../services/guestListService';
import { getApprovedPromoters } from '../services/promoterService';
import { getAssignmentsForOrganization } from '../services/postService';
import { ArrowLeftIcon, SearchIcon } from '../components/Icons';
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';
import { getAllCampaigns } from '../services/settingsService';

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
    const [assignments, setAssignments] = useState<{ [promoterId: string]: { guestAllowance: number; info?: string; closesAt?: Timestamp | FieldValue | null; requireGuestEmail?: boolean; } }>({});
    
    const [searchQuery, setSearchQuery] = useState('');
    const [colorFilter, setColorFilter] = useState<'all' | 'green' | 'blue' | 'yellow' | 'red'>('all');
    const [bulkAllowance, setBulkAllowance] = useState<number>(0);
    const [bulkInfo, setBulkInfo] = useState<string>('');
    const [bulkClosesAt, setBulkClosesAt] = useState<string>('');
    const [bulkRequireEmail, setBulkRequireEmail] = useState<boolean>(false);

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
                throw new Error("Dados da lista incompletos (Falta a Região/Estado). Por favor, edite a lista na página 'Gerenciar Listas', selecione o evento novamente e salve para corrigir.");
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
            setAssignments(listData.assignments || {});
            setBulkAllowance(listData.guestAllowance || 0);
            setBulkRequireEmail(listData.requireGuestEmail || false);

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
    
        postAssignments.forEach(a => {
            if (!a.post) return;
            const stat = statsMap.get(a.promoterId);
            if (!stat) return;
            stat.assigned++;
            if (a.proofSubmittedAt) stat.completed++;
            else if (a.justification && a.justificationStatus === 'accepted') stat.acceptedJustifications++;
            else if (a.justification && a.justificationStatus === 'rejected') stat.missed++;
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
    }, [promotersWithStats, searchQuery, colorFilter]);

    const handleAssignmentChange = (promoterId: string) => {
        setAssignments(prev => {
            const newAssignments = { ...prev };
            if (newAssignments[promoterId]) {
                delete newAssignments[promoterId];
            } else {
                newAssignments[promoterId] = {
                    guestAllowance: list?.guestAllowance ?? 0,
                    info: '',
                    closesAt: null,
                    requireGuestEmail: list?.requireGuestEmail ?? false,
                };
            }
            return newAssignments;
        });
    };
    
    const handleSettingChange = (promoterId: string, field: string, value: any) => {
        setAssignments(prev => {
            if (!prev[promoterId]) return prev;
            const newAssignments = { ...prev };
            newAssignments[promoterId] = { ...newAssignments[promoterId], [field]: value };
            return newAssignments;
        });
    };
    
    const handleToggleAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        const isChecked = e.target.checked;
        const visibleIds = filteredPromoters.map(p => p.id);
        setAssignments(prev => {
            const newAssignments = { ...prev };
            if (isChecked) {
                visibleIds.forEach(id => {
                    if (!newAssignments[id]) {
                        newAssignments[id] = { 
                            guestAllowance: list?.guestAllowance || 0, 
                            requireGuestEmail: list?.requireGuestEmail || false, 
                            info: '', 
                            closesAt: null 
                        };
                    }
                });
            } else {
                visibleIds.forEach(id => {
                    delete newAssignments[id];
                });
            }
            return newAssignments;
        });
    };

    const handleApplyBulk = (field: 'guestAllowance' | 'info' | 'closesAt' | 'requireGuestEmail') => {
        const visibleIds = filteredPromoters.map(p => p.id);
        const selectedVisibleIds = visibleIds.filter(id => assignments[id]);
        
        if (selectedVisibleIds.length === 0) {
            alert("Nenhuma divulgadora selecionada na lista visível para aplicar a ação.");
            return;
        }

        let valueToApply: any;
        switch (field) {
            case 'guestAllowance': valueToApply = bulkAllowance; break;
            case 'info': valueToApply = bulkInfo; break;
            case 'closesAt': valueToApply = bulkClosesAt ? firebase.firestore.Timestamp.fromDate(new Date(bulkClosesAt)) : null; break;
            case 'requireGuestEmail': valueToApply = bulkRequireEmail; break;
        }

        setAssignments(prev => {
            const newAssignments = { ...prev };
            selectedVisibleIds.forEach(id => {
                newAssignments[id] = { ...newAssignments[id], [field]: valueToApply };
            });
            return newAssignments;
        });
        alert(`Ação em massa aplicada para ${selectedVisibleIds.length} divulgadoras.`);
    };

    const handleSave = async () => {
        if (!listId) return;
        setIsSaving(true);
        setError(null);
        try {
            await updateGuestList(listId, { assignments });
            alert("Atribuições salvas com sucesso!");
            navigate('/admin/lists');
        } catch (err: any) {
            setError(err.message || "Falha ao salvar.");
        } finally {
            setIsSaving(false);
        }
    };

    const allVisibleSelected = useMemo(() => {
        if (filteredPromoters.length === 0) return false;
        return filteredPromoters.every(p => assignments[p.id]);
    }, [filteredPromoters, assignments]);

    return (
        <div>
            <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
                <div>
                    <button onClick={() => navigate(-1)} className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary-dark"><ArrowLeftIcon className="w-5 h-5" /><span>Voltar</span></button>
                    <h1 className="text-3xl font-bold mt-1">Atribuir Divulgadoras</h1>
                    <p className="text-primary font-semibold">{list?.name || 'Carregando...'} para {list?.campaignName}</p>
                </div>
            </div>
            <div className="bg-secondary shadow-lg rounded-lg p-6">
                {isLoading ? (
                    <div className="flex justify-center items-center py-10"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div></div>
                ) : error ? (
                    <p className="text-red-400 text-center">{error}</p>
                ) : (
                    <>
                        {/* Filters and Search */}
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 my-4">
                            <div className="relative flex-grow">
                                <span className="absolute inset-y-0 left-0 flex items-center pl-3"><SearchIcon className="h-5 w-5 text-gray-400" /></span>
                                <input type="text" placeholder="Buscar por nome ou @..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full pl-10 pr-4 py-2 border border-gray-600 rounded-md bg-gray-800 text-gray-200" />
                            </div>
                            <div className="flex items-center gap-x-2">
                                <span className="font-semibold text-gray-300 text-xs">Filtrar por Cor:</span>
                                <div className="flex space-x-1 p-1 bg-dark/70 rounded-lg">
                                    {(['all', 'green', 'blue', 'yellow', 'red'] as const).map(f => (
                                        <button key={f} type="button" onClick={() => setColorFilter(f)} className={`px-2 py-1 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 ${colorFilter === f ? 'bg-primary text-white' : 'text-gray-300 hover:bg-gray-700'}`}>
                                            {f !== 'all' && <div className={`w-2.5 h-2.5 rounded-full ${f === 'green' ? 'bg-green-400' : f === 'blue' ? 'bg-blue-400' : f === 'yellow' ? 'bg-yellow-400' : 'bg-red-400'}`}></div>}
                                            <span>{{'all': 'Todos', 'green': 'Verde', 'blue': 'Azul', 'yellow': 'Laranja', 'red': 'Vermelho'}[f]}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Bulk Actions */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 p-4 border border-gray-700 rounded-lg mb-4">
                            <div className="flex flex-col gap-2">
                                <input type="number" value={bulkAllowance} onChange={e => setBulkAllowance(parseInt(e.target.value, 10))} className="w-full px-2 py-1 text-sm bg-gray-800 rounded border border-gray-600"/>
                                <button onClick={() => handleApplyBulk('guestAllowance')} className="w-full text-xs py-1 px-2 bg-gray-600 rounded">Aplicar Qtde</button>
                            </div>
                             <div className="flex flex-col gap-2">
                                <input type="text" placeholder="Informativo" value={bulkInfo} onChange={e => setBulkInfo(e.target.value)} className="w-full px-2 py-1 text-sm bg-gray-800 rounded border border-gray-600"/>
                                <button onClick={() => handleApplyBulk('info')} className="w-full text-xs py-1 px-2 bg-gray-600 rounded">Aplicar Info</button>
                            </div>
                             <div className="flex flex-col gap-2">
                                <input type="datetime-local" value={bulkClosesAt} onChange={e => setBulkClosesAt(e.target.value)} className="w-full px-2 py-1 text-sm bg-gray-800 rounded border border-gray-600" style={{colorScheme: 'dark'}}/>
                                <button onClick={() => handleApplyBulk('closesAt')} className="w-full text-xs py-1 px-2 bg-gray-600 rounded">Aplicar Data Limite</button>
                            </div>
                             <div className="flex flex-col gap-2 justify-center">
                                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={bulkRequireEmail} onChange={e => setBulkRequireEmail(e.target.checked)} className="h-4 w-4 text-primary bg-gray-700 border-gray-500 rounded"/><span>Exigir E-mail</span></label>
                                <button onClick={() => handleApplyBulk('requireGuestEmail')} className="w-full text-xs py-1 px-2 bg-gray-600 rounded">Aplicar E-mail</button>
                            </div>
                        </div>

                        {/* Assignments Table */}
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-700">
                                <thead className="bg-gray-700/50">
                                    <tr>
                                        <th className="px-4 py-3"><input type="checkbox" onChange={handleToggleAll} checked={allVisibleSelected} /></th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Divulgadora</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Qtde Convidados</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Exigir E-mail</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Informativo Individual</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Data Limite Individual</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-700">
                                    {filteredPromoters.map(p => {
                                        const isAssigned = !!assignments[p.id];
                                        const assignment = assignments[p.id];
                                        return (
                                            <tr key={p.id} className={`hover:bg-gray-700/40 ${isAssigned ? '' : 'opacity-50'}`}>
                                                <td className="px-4 py-2"><input type="checkbox" checked={isAssigned} onChange={() => handleAssignmentChange(p.id)} /></td>
                                                <td className="px-4 py-2"><span className={`font-semibold ${getPerformanceColor(p.completionRate)}`}>{p.instagram || p.name}</span></td>
                                                <td className="px-4 py-2"><input type="number" min="0" value={assignment?.guestAllowance ?? ''} onChange={e => handleSettingChange(p.id, 'guestAllowance', parseInt(e.target.value, 10))} disabled={!isAssigned} className="w-20 px-2 py-1 text-sm bg-gray-800 rounded border border-gray-600 disabled:bg-gray-900" /></td>
                                                <td className="px-4 py-2"><input type="checkbox" checked={assignment?.requireGuestEmail ?? false} onChange={e => handleSettingChange(p.id, 'requireGuestEmail', e.target.checked)} disabled={!isAssigned} className="h-4 w-4 text-primary bg-gray-700 border-gray-500 rounded disabled:bg-gray-900" /></td>
                                                <td className="px-4 py-2"><input type="text" value={assignment?.info ?? ''} onChange={e => handleSettingChange(p.id, 'info', e.target.value)} disabled={!isAssigned} placeholder="Opcional" className="w-full px-2 py-1 text-sm bg-gray-800 rounded border border-gray-600 disabled:bg-gray-900" /></td>
                                                <td className="px-4 py-2"><input type="datetime-local" value={assignment?.closesAt ? timestampToDateTimeLocal(assignment.closesAt) : ''} onChange={e => handleSettingChange(p.id, 'closesAt', e.target.value ? firebase.firestore.Timestamp.fromDate(new Date(e.target.value)) : null)} disabled={!isAssigned} className="w-full px-2 py-1 text-sm bg-gray-800 rounded border border-gray-600 disabled:bg-gray-900" style={{colorScheme: 'dark'}} /></td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
                <div className="mt-6 border-t border-gray-700 pt-4 flex justify-end">
                    <button onClick={handleSave} disabled={isSaving || isLoading} className="px-6 py-2 bg-primary text-white font-semibold rounded-md hover:bg-primary-dark disabled:opacity-50">
                        {isSaving ? 'Salvando...' : 'Salvar Atribuições'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default GuestListAssignments;