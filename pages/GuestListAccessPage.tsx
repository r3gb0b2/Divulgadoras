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
    const [assignments, setAssignments] = useState<{ [promoterId: string]: string[] }>({});

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
                        {promoters.length > 0 && (campaign?.guestListTypes?.length ?? 0) > 0 ? (
                            <div className="mt-2 border border-gray-700 rounded-lg p-2 max-h-[60vh] overflow-y-auto space-y-3">
                                {promoters.map(p => (
                                    <div key={p.id} className="p-3 bg-gray-800/50 rounded-md">
                                        <p className={`font-semibold ${p.hasJoinedGroup ? 'text-green-400' : 'text-gray-200'}`} title={p.name}>{p.instagram || p.name}</p>
                                        <div className="pl-4 mt-2 space-y-1 border-l-2 border-gray-600">
                                            {(campaign?.guestListTypes || []).map(listName => (
                                                <label key={listName} className="flex items-center space-x-2 cursor-pointer">
                                                    <input 
                                                        type="checkbox"
                                                        checked={(assignments[p.id] || []).includes(listName)}
                                                        onChange={() => handleAssignmentToggle(p.id, listName)}
                                                        className="h-4 w-4 text-primary bg-gray-700 border-gray-500 rounded"
                                                    />
                                                    <span className="text-sm text-gray-300">{listName}</span>
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
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