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
// FIX: Added missing import for getAllCampaigns
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

    // FIX: Add missing state variables
    const [campaign, setCampaign] = useState<Campaign | null>(null);
    const [accessMode, setAccessMode] = useState<'all' | 'specific'>('all');

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

            // FIX: Fetch allCampaigns to get data for the `campaign` state variable
            const [approvedPromoters, orgAssignments, allCampaigns] = await Promise.all([
                getApprovedPromoters(
                    listData.organizationId,
                    listData.stateAbbr,
                    listData.campaignName
                ),
                getAssignmentsForOrganization(listData.organizationId),
                getAllCampaigns(listData.organizationId)
            ]);

            const currentCampaign = allCampaigns.find(c => c.id === listData.campaignId);
            setCampaign(currentCampaign || null);

            setList(listData);
            approvedPromoters.sort((a, b) => (a.instagram || a.name).localeCompare(b.instagram || b.name));
            setPromoters(approvedPromoters);
            setPostAssignments(orgAssignments);
            setAssignments(listData.assignments || {});
            setAccessMode(currentCampaign?.guestListAccess || 'all');
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

    const handleAssignmentToggle = (promoterId: string, listName: string) => {
        setAssignments(prev => {
            const currentLists = (prev[promoterId] as unknown as string[]) || [];
            const newLists = currentLists.includes(listName)
                ? currentLists.filter(l => l !== listName)
                : [...currentLists, listName];

            const newAssignments = { ...prev };
            if (newLists.length > 0) {
                (newAssignments as any)[promoterId] = newLists;
            } else {
                delete newAssignments[promoterId]; // clean up empty arrays
            }
            return newAssignments;
        });
    };

    const handleToggleAllForList = (listName: string, isChecked: boolean) => {
        const promoterIds = filteredPromoters.map(p => p.id);
        setAssignments(prev => {
            const newAssignments = { ...prev };
            promoterIds.forEach(id => {
                const currentLists = (newAssignments[id] as unknown as string[]) || [];
                if (isChecked) {
                    // Add the listName if not present
                    if (!currentLists.includes(listName)) {
                        (newAssignments as any)[id] = [...currentLists, listName];
                    }
                } else {
                    // Remove the listName
                    (newAssignments as any)[id] = currentLists.filter(l => l !== listName);
                    if ((newAssignments as any)[id].length === 0) {
                        delete newAssignments[id];
                    }
                }
            });
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
                        newAssignments[id] = { guestAllowance: list?.guestAllowance || 0, requireGuestEmail: list?.requireGuestEmail || false, info: '', closesAt: null };
                    }
                });
            } else {
                visibleIds.forEach(id => delete newAssignments[id]);
            }
            return newAssignments;
        });
    };
    
    const handleApplyBulkAllowance = () => {
        const selectedIds = Object.keys(assignments);
        if(selectedIds.length === 0) {
            alert("Nenhuma divulgadora selecionada para aplicar a quantidade.");
            return;
        }
        setAssignments(prev => {
            const newAssignments = { ...prev };
            selectedIds.forEach(id => {
                newAssignments[id] = { ...newAssignments[id], guestAllowance: bulkAllowance };
            });
            return newAssignments;
        });
    };

    const handleApplyBulkInfo = () => {
        const selectedIds = Object.keys(assignments);
        if(selectedIds.length === 0) {
            alert("Nenhuma divulgadora selecionada para aplicar o informativo.");
            return;
        }
        setAssignments(prev => {
            const newAssignments = { ...prev };
            selectedIds.forEach(id => {
                newAssignments[id] = { ...newAssignments[id], info: bulkInfo };
            });
            return newAssignments;
        });
    };
    
    const handleApplyBulkDate = () => {
        const selectedIds = Object.keys(assignments);
        if (selectedIds.length === 0) {
            alert("Nenhuma divulgadora selecionada para aplicar a data.");
            return;
        }
        const date = bulkClosesAt ? firebase.firestore.Timestamp.fromDate(new Date(bulkClosesAt)) : null;
        setAssignments(prev => {
            const newAssignments = { ...prev };
            selectedIds.forEach(id => {
                newAssignments[id] = { ...newAssignments[id], closesAt: date };
            });
            return newAssignments;
        });
    };

    const handleApplyBulkEmail = () => {
        const selectedIds = Object.keys(assignments);
        if (selectedIds.length === 0) {
            alert("Nenhuma divulgadora selecionada para aplicar a exigência de email.");
            return;
        }
        setAssignments(prev => {
            const newAssignments = { ...prev };
            selectedIds.forEach(id => {
                newAssignments[id] = { ...newAssignments[id], requireGuestEmail: bulkRequireEmail };
            });
            return newAssignments;
        });
    };

    const handleSave = async () => {
        if (!listId) return;
        setIsSaving(true);
        setError(null);
        try {
            await updateGuestList(listId, { assignments });
            alert("Atribuições salvas com sucesso!");
            navigate('/admin/lists');
        } catch (err: any)
{
            setError(err.message || "Falha ao salvar.");
        } finally {
            setIsSaving(false);
        }
    };

    const renderContent = () => {
        if (isLoading) {
            return (
                <div className="flex justify-center items-center py-10">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
                </div>
            );
        }

        if (error) {
            return <p className="text-red-400 text-center">{error}</p>;
        }
        
        return (
             <div className="space-y-6">
                <div>
                    <h2 className="text-lg font-semibold text-white">Modo de Acesso</h2>
                    <div className="mt-2 space-y-2">
                        <label className="flex items-center space-x-3 p-3 bg-gray-700/50 rounded-lg cursor-pointer">
                            <input type="radio" name="accessMode" value="all" checked={accessMode === 'all'} onChange={() => setAccessMode('all')} className="h-4 w-4 text-primary bg-gray-800 border-gray-600 focus:ring-primary" />
                            <div>
                                <span className="font-medium text-gray-200">Todas as Divulgadoras</span>
                                <p className="text-sm text-gray-400">Permitir que qualquer divulgadora aprovada para este evento confirme presença em <strong className="text-gray-300">todas</strong> as listas.</p>
                            </div>
                        </label>
                         <label className="flex items-center space-x-3 p-3 bg-gray-700/50 rounded-lg cursor-pointer">
                            <input type="radio" name="accessMode" value="specific" checked={accessMode === 'specific'} onChange={() => setAccessMode('specific')} className="h-4 w-4 text-primary bg-gray-800 border-gray-600 focus:ring-primary" />
                            <div>
                                <span className="font-medium text-gray-200">Divulgadoras Específicas</span>
                                <p className="text-sm text-gray-400">Apenas as divulgadoras que você selecionar abaixo poderão confirmar presença nas listas <strong className="text-gray-300">designadas</strong>.</p>
                            </div>
                        </label>
                    </div>
                </div>

                {accessMode === 'specific' && (
                    <div>
                        <h2 className="text-lg font-semibold text-white">Atribuir Listas</h2>
                         {(promoters.length > 0 && (campaign?.guestListTypes?.length ?? 0) > 0) ? (
                            <>
                                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 my-4">
                                    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-gray-400">
                                        <span className="font-semibold text-gray-300">Legenda de Aproveitamento:</span>
                                        <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-green-400"></div><span>100%</span></div>
                                        <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-blue-400"></div><span>60-99%</span></div>
                                        <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-yellow-400"></div><span>31-59%</span></div>
                                        <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-red-400"></div><span>0-30%</span></div>
                                    </div>
                                     <div className="flex items-center gap-x-2">
                                        <span className="font-semibold text-gray-300 text-xs">Filtrar por Cor:</span>
                                        <div className="flex space-x-1 p-1 bg-dark/70 rounded-lg">
                                            {(['all', 'green', 'blue', 'yellow', 'red'] as const).map(f => (
                                                <button key={f} onClick={() => setColorFilter(f)} className={`px-2 py-1 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 ${colorFilter === f ? 'bg-primary text-white' : 'text-gray-300 hover:bg-gray-700'}`}>
                                                    {f !== 'all' && <div className={`w-2.5 h-2.5 rounded-full ${f === 'green' ? 'bg-green-400' : f === 'blue' ? 'bg-blue-400' : f === 'yellow' ? 'bg-yellow-400' : 'bg-red-400'}`}></div>}
                                                    <span>{{'all': 'Todos', 'green': 'Verde', 'blue': 'Azul', 'yellow': 'Laranja', 'red': 'Vermelho'}[f]}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                                <div className="relative my-4">
                                     <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                                        <SearchIcon className="h-5 w-5 text-gray-400" />
                                    </span>
                                    <input 
                                        type="text"
                                        placeholder="Buscar divulgadora por nome ou @..."
                                        value={searchQuery}
                                        onChange={e => setSearchQuery(e.target.value)}
                                        className="w-full pl-10 pr-4 py-2 border border-gray-600 rounded-md bg-gray-800 text-gray-200 focus:ring-primary focus:border-primary"
                                    />
                                </div>
                                <div className="space-y-4">
                                    {(campaign?.guestListTypes || []).map(listName => {
                                        const selectedCount = filteredPromoters.filter(p => ((assignments[p.id] as unknown as string[]) || []).includes(listName)).length;
                                        const areAllSelected = filteredPromoters.length > 0 && filteredPromoters.every(p => (assignments[p.id] as any)?.includes(listName));
                                        return (
                                            <div key={listName} className="border border-gray-700 rounded-lg p-4">
                                                <div className="flex justify-between items-center mb-2">
                                                    <h3 className="text-xl font-semibold text-primary">{listName}</h3>
                                                    <label className="flex items-center space-x-2 cursor-pointer text-sm font-medium">
                                                        <input 
                                                            type="checkbox"
                                                            onChange={(e) => handleToggleAllForList(listName, e.target.checked)}
                                                            checked={areAllSelected}
                                                            className="h-4 w-4 text-primary bg-gray-700 border-gray-500 rounded"
                                                        />
                                                        <span>
                                                            Marcar/Desmarcar Todos ({selectedCount}/{filteredPromoters.length})
                                                        </span>
                                                    </label>
                                                </div>
                                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-60 overflow-y-auto p-2 border-t border-gray-700">
                                                     {filteredPromoters.map(p => (
                                                        <label key={p.id} className="flex items-center space-x-2 p-1 rounded hover:bg-gray-800/50 cursor-pointer">
                                                            <input 
                                                                type="checkbox"
                                                                checked={((assignments[p.id] as unknown as string[]) || []).includes(listName)}
                                                                onChange={() => handleAssignmentToggle(p.id, listName)}
                                                                className="h-4 w-4 text-primary bg-gray-700 border-gray-500 rounded"
                                                            />
                                                            <span 
                                                                className={`truncate text-sm font-semibold ${getPerformanceColor(p.completionRate)}`}
                                                                title={p.name}
                                                            >
                                                                {p.instagram || p.name}
                                                            </span>
                                                        </label>
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </>
                        ) : (
                            <p className="text-gray-400 text-center mt-4">
                                {promoters.length === 0 ? "Nenhuma divulgadora aprovada para este evento." : "Nenhum tipo de lista foi criado para este evento."}
                            </p>
                        )}
                    </div>
                )}
            </div>
        );
    };

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
                {renderContent()}
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