import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { Campaign, Promoter } from '../types';
import { getApprovedPromoters } from '../services/promoterService';
import { getAllCampaigns, updateCampaign } from '../services/settingsService';
import { ArrowLeftIcon, SearchIcon } from '../components/Icons';

const GuestListAccessPage: React.FC = () => {
    const { campaignId } = useParams<{ campaignId: string }>();
    const navigate = useNavigate();
    const { adminData } = useAdminAuth();

    const [campaign, setCampaign] = useState<Campaign | null>(null);
    const [promoters, setPromoters] = useState<Promoter[]>([]);
    const [accessMode, setAccessMode] = useState<'all' | 'specific'>('all');
    const [assignments, setAssignments] = useState<{ [promoterId: string]: string[] }>({});
    const [searchQuery, setSearchQuery] = useState('');

    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchData = useCallback(async () => {
        if (!campaignId || !adminData) return;
        setIsLoading(true);
        setError(null);
        try {
            // FIX: Property 'organizationId' does not exist on type 'AdminUserData'. Did you mean 'organizationIds'?
            const orgId = adminData.organizationIds?.[0];
            if (!orgId && adminData.role !== 'superadmin') {
                throw new Error("Organização não encontrada.");
            }

            const allOrgCampaigns = await getAllCampaigns(orgId);
            const currentCampaign = allOrgCampaigns.find(c => c.id === campaignId);

            if (!currentCampaign) {
                throw new Error("Evento não encontrado.");
            }

            const approvedPromoters = await getApprovedPromoters(
                currentCampaign.organizationId,
                currentCampaign.stateAbbr,
                currentCampaign.name
            );

            setCampaign(currentCampaign);
            // Sort promoters alphabetically by name or instagram handle
            approvedPromoters.sort((a, b) => (a.instagram || a.name).localeCompare(b.instagram || b.name));
            setPromoters(approvedPromoters);
            setAccessMode(currentCampaign.guestListAccess || 'all');
            setAssignments(currentCampaign.guestListAssignments || {});

        } catch (err: any) {
            setError(err.message || "Falha ao carregar dados.");
        } finally {
            setIsLoading(false);
        }
    }, [campaignId, adminData]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);
    
    const filteredPromoters = useMemo(() => {
        if (!searchQuery.trim()) {
            return promoters;
        }
        const lowerQuery = searchQuery.toLowerCase();
        return promoters.filter(p => 
            p.name.toLowerCase().includes(lowerQuery) || 
            (p.instagram && p.instagram.toLowerCase().includes(lowerQuery))
        );
    }, [promoters, searchQuery]);

    const handleAssignmentToggle = (promoterId: string, listName: string) => {
        setAssignments(prev => {
            const currentLists = prev[promoterId] || [];
            const newLists = currentLists.includes(listName)
                ? currentLists.filter(l => l !== listName)
                : [...currentLists, listName];

            const newAssignments = { ...prev };
            if (newLists.length > 0) {
                newAssignments[promoterId] = newLists;
            } else {
                delete newAssignments[promoterId]; // clean up empty arrays
            }
            return newAssignments;
        });
    };

    const handleToggleAllForList = (listName: string) => {
        const promoterIds = filteredPromoters.map(p => p.id);
        const areAllSelected = promoterIds.every(id => assignments[id]?.includes(listName));

        setAssignments(prev => {
            const newAssignments = { ...prev };
            promoterIds.forEach(id => {
                const currentLists = newAssignments[id] || [];
                if (areAllSelected) {
                    // Unselect all: remove the listName
                    newAssignments[id] = currentLists.filter(l => l !== listName);
                    if (newAssignments[id].length === 0) {
                        delete newAssignments[id];
                    }
                } else {
                    // Select all: add the listName if not present
                    if (!currentLists.includes(listName)) {
                        newAssignments[id] = [...currentLists, listName];
                    }
                }
            });
            return newAssignments;
        });
    };


    const handleSave = async () => {
        if (!campaignId) return;
        setIsSaving(true);
        setError(null);
        try {
            const updateData: Partial<Campaign> = {
                guestListAccess: accessMode,
                guestListAssignments: accessMode === 'specific' ? assignments : {},
            };
            await updateCampaign(campaignId, updateData);
            alert("Configurações de acesso salvas!");
            navigate(-1);
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
                                        const selectedCount = filteredPromoters.filter(p => (assignments[p.id] || []).includes(listName)).length;
                                        return (
                                            <div key={listName} className="border border-gray-700 rounded-lg p-4">
                                                <div className="flex justify-between items-center mb-2">
                                                    <h3 className="text-xl font-semibold text-primary">{listName}</h3>
                                                    <label className="flex items-center space-x-2 cursor-pointer text-sm font-medium">
                                                        <input 
                                                            type="checkbox"
                                                            onChange={() => handleToggleAllForList(listName)}
                                                            checked={filteredPromoters.length > 0 && selectedCount === filteredPromoters.length}
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
                                                                checked={(assignments[p.id] || []).includes(listName)}
                                                                onChange={() => handleAssignmentToggle(p.id, listName)}
                                                                className="h-4 w-4 text-primary bg-gray-700 border-gray-500 rounded"
                                                            />
                                                            <span 
                                                                className={`truncate text-sm ${p.hasJoinedGroup ? 'text-green-400' : 'text-gray-300'}`}
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
                    <button onClick={() => navigate(-1)} className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary-dark transition-colors mb-2">
                        <ArrowLeftIcon className="w-5 h-5" />
                        <span>Voltar</span>
                    </button>
                    <h1 className="text-3xl font-bold mt-1">Gerenciar Acesso à Lista</h1>
                    <p className="text-primary font-semibold">{campaign?.name || 'Carregando...'}</p>
                </div>
            </div>
            <div className="bg-secondary shadow-lg rounded-lg p-6">
                {renderContent()}
                <div className="mt-6 border-t border-gray-700 pt-4 flex justify-end">
                    <button onClick={handleSave} disabled={isSaving || isLoading} className="px-6 py-2 bg-primary text-white font-semibold rounded-md hover:bg-primary-dark disabled:opacity-50">
                        {isSaving ? 'Salvando...' : 'Salvar Alterações'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default GuestListAccessPage;