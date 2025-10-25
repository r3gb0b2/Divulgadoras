import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { getAllCampaigns } from '../services/settingsService';
import { Campaign } from '../types';
import { ArrowLeftIcon, CheckCircleIcon } from '../components/Icons';

const AdminCheckinDashboard: React.FC = () => {
    const navigate = useNavigate();
    const { selectedOrgId, adminData } = useAdminAuth();
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchData = useCallback(async () => {
        const orgId = adminData?.role === 'superadmin' ? undefined : selectedOrgId;

        if (!orgId && adminData?.role !== 'superadmin') {
            setError("Nenhuma organização selecionada.");
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        setError(null);
        try {
            const campaignsData = await getAllCampaigns(orgId);
            // Filter for only active campaigns and sort by name
            const activeCampaigns = campaignsData
                .filter(c => c.isActive)
                .sort((a, b) => a.name.localeCompare(b.name));
            setCampaigns(activeCampaigns);
        } catch (err: any) {
            setError(err.message || 'Falha ao carregar os eventos.');
        } finally {
            setIsLoading(false);
        }
    }, [selectedOrgId, adminData]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

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
        
        if (campaigns.length === 0) {
            return <p className="text-gray-400 text-center py-8">Nenhum evento ativo encontrado para iniciar o check-in.</p>;
        }

        return (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {campaigns.map(campaign => (
                    <div key={campaign.id} className="bg-gray-700/50 p-4 rounded-lg flex flex-col justify-between">
                        <div>
                            <p className="font-bold text-lg text-primary">{campaign.name}</p>
                            <p className="text-sm text-gray-300">{campaign.stateAbbr}</p>
                        </div>
                        <Link
                            to={`/admin/checkin/${campaign.id}`}
                            className="mt-4 flex items-center justify-center gap-2 w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-semibold"
                        >
                            <CheckCircleIcon className="w-5 h-5" />
                            <span>Controlar Entrada</span>
                        </Link>
                    </div>
                ))}
            </div>
        );
    };

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold">Controle de Entrada</h1>
                <button onClick={() => navigate(-1)} className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-500 text-sm">
                    <ArrowLeftIcon className="w-4 h-4" />
                    <span>Voltar</span>
                </button>
            </div>
            <div className="bg-secondary shadow-lg rounded-lg p-6">
                <p className="text-gray-400 mb-6">
                    Selecione um dos eventos ativos abaixo para iniciar o processo de check-in.
                </p>
                {renderContent()}
            </div>
        </div>
    );
};

export default AdminCheckinDashboard;
