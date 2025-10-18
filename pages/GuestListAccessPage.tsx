import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { Campaign, Promoter } from '../types';
import { getApprovedPromoters } from '../services/promoterService';
import { getAllCampaigns, updateCampaign } from '../services/settingsService';
import { ArrowLeftIcon } from '../components/Icons';

const GuestListAccessPage: React.FC = () => {
    const { campaignId } = useParams<{ campaignId: string }>();
    const navigate = useNavigate();
    const { adminData } = useAdminAuth();

    const [campaign, setCampaign] = useState<Campaign | null>(null);
    const [promoters, setPromoters] = useState<Promoter[]>([]);
    const [accessMode, setAccessMode] = useState<'all' | 'specific'>('all');
    const [assignedPromoters, setAssignedPromoters] = useState<Set<string>>(new Set());

    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchData = useCallback(async () => {
        if (!campaignId || !adminData) return;
        setIsLoading(true);
        setError(null);
        try {
            const orgId = adminData.organizationId;
            if (!orgId && adminData.role !== 'superadmin') {
                throw new Error("Organização não encontrada.");
            }

            // Fetch campaign details and all approved promoters in parallel
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
            setPromoters(approvedPromoters);
            setAccessMode(currentCampaign.guestListAccess || 'all');
            setAssignedPromoters(new Set(currentCampaign.guestListAssignedPromoters || []));

        } catch (err: any) {
            setError(err.message || "Falha ao carregar dados.");
        } finally {
            setIsLoading(false);
        }
    }, [campaignId, adminData]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handlePromoterToggle = (promoterId: string) => {
        setAssignedPromoters(prev => {
            const newSet = new Set(prev);
            if (newSet.has(promoterId)) {
                newSet.delete(promoterId);
            } else {
                newSet.add(promoterId);
            }
            return newSet;
        });
    };
    
    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            setAssignedPromoters(new Set(promoters.map(p => p.id)));
        } else {
            setAssignedPromoters(new Set());
        }
    };


    const handleSave = async () => {
        if (!campaignId) return;
        setIsSaving(true);
        setError(null);
        try {
            const updateData: Partial<Campaign> = {
                guestListAccess: accessMode,
                guestListAssignedPromoters: accessMode === 'specific' ? Array.from(assignedPromoters) : [],
            };
            await updateCampaign(campaignId, updateData);
            alert("Configurações de acesso salvas!");
            navigate(-1);
        } catch (err: any) {
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
                                <p className="text-sm text-gray-400">Permitir que qualquer divulgadora aprovada para este evento confirme presença na lista.</p>
                            </div>
                        </label>
                         <label className="flex items-center space-x-3 p-3 bg-gray-700/50 rounded-lg cursor-pointer">
                            <input type="radio" name="accessMode" value="specific" checked={accessMode === 'specific'} onChange={() => setAccessMode('specific')} className="h-4 w-4 text-primary bg-gray-800 border-gray-600 focus:ring-primary" />
                            <div>
                                <span className="font-medium text-gray-200">Divulgadoras Específicas</span>
                                <p className="text-sm text-gray-400">Apenas as divulgadoras que você selecionar abaixo poderão confirmar presença na lista.</p>
                            </div>
                        </label>
                    </div>
                </div>

                {accessMode === 'specific' && (
                    <div>
                        <h2 className="text-lg font-semibold text-white">Selecione as Divulgadoras com Acesso</h2>
                        {promoters.length > 0 ? (
                            <div className="mt-2 border border-gray-700 rounded-lg p-2 max-h-80 overflow-y-auto">
                                <label className="flex items-center space-x-2 p-2 font-semibold">
                                    <input type="checkbox" onChange={handleSelectAll} checked={assignedPromoters.size === promoters.length && promoters.length > 0} className="h-4 w-4 text-primary bg-gray-700 border-gray-500 rounded" />
                                    <span>Selecionar Todas ({assignedPromoters.size}/{promoters.length})</span>
                                </label>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                                    {promoters.map(p => (
                                        <label key={p.id} className="flex items-center space-x-2 p-2 rounded hover:bg-gray-700/50 cursor-pointer">
                                            <input type="checkbox" checked={assignedPromoters.has(p.id)} onChange={() => handlePromoterToggle(p.id)} className="h-4 w-4 text-primary bg-gray-700 border-gray-500 rounded flex-shrink-0" />
                                            <span className={`truncate ${p.hasJoinedGroup ? 'text-green-400 font-semibold' : 'text-gray-200'}`} title={`${p.name} (${p.instagram})`}>
                                                {p.instagram || p.name}
                                            </span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <p className="text-gray-400 text-center mt-4">Nenhuma divulgadora aprovada para este evento foi encontrada.</p>
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
