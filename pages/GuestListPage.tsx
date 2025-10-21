

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { getGuestListForCampaign } from '../services/guestListService';
import { getAllCampaigns } from '../services/settingsService';
import { getPromotersByIds } from '../services/promoterService';
import { GuestListConfirmation, Campaign, Promoter } from '../types';
import { ArrowLeftIcon, DownloadIcon } from '../components/Icons';
import { useAdminAuth } from '../contexts/AdminAuthContext';

const GuestListPage: React.FC = () => {
    const { campaignId } = useParams<{ campaignId: string }>();
    const navigate = useNavigate();
    const { adminData, selectedOrgId } = useAdminAuth();
    const [confirmations, setConfirmations] = useState<(GuestListConfirmation & { promoterDetails?: Promoter })[]>([]);
    const [campaign, setCampaign] = useState<Campaign | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeList, setActiveList] = useState<string | null>(null);
    const [filterInGroupOnly, setFilterInGroupOnly] = useState(false);

    const fetchData = useCallback(async () => {
        if (!campaignId) {
            setError("ID do evento não fornecido.");
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        setError(null);
        try {
            const confirmationData = await getGuestListForCampaign(campaignId);
            
            // Fetch promoter details to check `hasJoinedGroup` status
            const promoterIds = [...new Set(confirmationData.map((c) => c.promoterId))];
            if (promoterIds.length > 0) {
                const promotersData = await getPromotersByIds(promoterIds);
                const promotersMap = new Map(promotersData.map((p) => [p.id, p]));
                const confirmationsWithDetails = confirmationData.map((conf) => ({
                    ...conf,
                    promoterDetails: promotersMap.get(conf.promoterId),
                }));
                setConfirmations(confirmationsWithDetails);
            } else {
                 setConfirmations(confirmationData);
            }

            let orgId: string | undefined;
            if (confirmationData.length > 0) {
                orgId = confirmationData[0].organizationId;
            } else if (selectedOrgId) {
                orgId = selectedOrgId;
            }

            if (orgId) {
                const allCampaigns = await getAllCampaigns(orgId);
                const camp = allCampaigns.find(c => c.id === campaignId);
                setCampaign(camp || null);
            } else if (adminData?.role === 'superadmin' && confirmationData.length === 0) {
                const allCampaignsEver = await getAllCampaigns();
                const camp = allCampaignsEver.find(c => c.id === campaignId);
                setCampaign(camp || null);
            }

        } catch (err: any) {
            setError(err.message || 'Falha ao carregar a lista de convidados.');
        } finally {
            setIsLoading(false);
        }
    }, [campaignId, adminData, selectedOrgId]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const filteredConfirmations = useMemo(() => {
        if (!filterInGroupOnly) {
            return confirmations;
        }
        return confirmations.filter(c => c.promoterDetails?.hasJoinedGroup);
    }, [confirmations, filterInGroupOnly]);

    const groupedConfirmations = useMemo(() => {
        return filteredConfirmations.reduce((acc, conf) => {
            const listName = conf.listName || 'Lista Padrão';
            if (!acc[listName]) {
                acc[listName] = [];
            }
            acc[listName].push(conf);
            return acc;
        }, {} as Record<string, (GuestListConfirmation & { promoterDetails?: Promoter })[]>);
    }, [filteredConfirmations]);

    useEffect(() => {
        // Set the first list as active by default
        const listNames = Object.keys(groupedConfirmations);
        if (listNames.length > 0 && (!activeList || !groupedConfirmations[activeList])) {
            setActiveList(listNames[0]);
        }
    }, [groupedConfirmations, activeList]);

    const handleDownloadCSV = () => {
        if (filteredConfirmations.length === 0) return;

        const formatCSVCell = (text: string) => {
            const result = '"' + text.replace(/"/g, '""') + '"';
            return result;
        };

        const headers = ["Tipo da Lista", "Nome da Divulgadora", "Status Presença", "Convidados"];
        const rows = filteredConfirmations.map(conf => {
            const listName = formatCSVCell(conf.listName);
            const promoterName = formatCSVCell(conf.promoterName);
            const promoterStatus = formatCSVCell(conf.isPromoterAttending ? "Confirmada" : "Não vai");
            const guests = formatCSVCell(conf.guestNames.filter(name => name.trim() !== '').join('\n'));
            return [listName, promoterName, promoterStatus, guests].join(',');
        });

        const csvContent = [headers.join(','), ...rows].join('\n');
        
        const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
        const blob = new Blob([bom, csvContent], { type: 'text/csv;charset=utf-8;' });
        
        const link = document.createElement("a");
        if (link.download !== undefined) {
            const url = URL.createObjectURL(blob);
            const campaignNameSlug = campaign?.name.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'evento';
            link.setAttribute("href", url);
            link.setAttribute("download", `lista_convidados_${campaignNameSlug}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    };

    const totalConfirmed = filteredConfirmations.reduce((acc, curr) => {
        let count = 0;
        if (curr.isPromoterAttending) count++;
        count += curr.guestNames.filter(name => name.trim() !== '').length;
        return acc + count;
    }, 0);
    
    const listNames = Object.keys(groupedConfirmations);

    const totalByList = (listName: string) => {
        if (!groupedConfirmations[listName]) return 0;
        return groupedConfirmations[listName].reduce((acc, curr) => {
            let count = 0;
            if (curr.isPromoterAttending) count++;
            count += curr.guestNames.filter(name => name.trim() !== '').length;
            return acc + count;
        }, 0);
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
        
        if (confirmations.length === 0) {
            return <p className="text-gray-400 text-center py-8">Nenhuma confirmação na lista para este evento ainda.</p>;
        }
        
        if (filteredConfirmations.length === 0) {
             return <p className="text-gray-400 text-center py-8">Nenhuma confirmação encontrada com o filtro aplicado.</p>;
        }

        const currentListConfirmations = activeList ? groupedConfirmations[activeList] : [];

        return (
            <div>
                {listNames.length > 1 && (
                    <div className="border-b border-gray-700 mb-4">
                        <nav className="-mb-px flex space-x-4 overflow-x-auto" aria-label="Tabs">
                            {listNames.map(name => (
                                <button
                                    key={name}
                                    onClick={() => setActiveList(name)}
                                    className={`${
                                        activeList === name
                                            ? 'border-primary text-primary'
                                            : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-500'
                                    } whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm`}
                                >
                                    {name} ({totalByList(name)})
                                </button>
                            ))}
                        </nav>
                    </div>
                )}
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-700">
                        <thead className="bg-gray-700/50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Nome da Divulgadora</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Convidados</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-700">
                            {currentListConfirmations.map(conf => (
                                <tr key={conf.id} className="hover:bg-gray-700/40">
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className={`text-sm font-medium ${conf.promoterDetails?.hasJoinedGroup ? 'text-green-400 font-semibold' : 'text-white'}`}>
                                            {conf.promoterName}
                                        </div>
                                        <div className="text-sm text-gray-400">{conf.isPromoterAttending ? "Confirmada" : "Não vai"}</div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-pre-wrap text-sm text-gray-300">
                                        {conf.guestNames.filter(name => name.trim() !== '').join('\n') || 'Nenhum'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    const campaignName = campaign?.name || (confirmations.length > 0 ? confirmations[0].campaignName : 'Evento');

    return (
        <div>
            <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
                 <div>
                    <button onClick={() => navigate(-1)} className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary-dark transition-colors mb-2">
                        <ArrowLeftIcon className="w-5 h-5" />
                        <span>Voltar</span>
                    </button>
                    <h1 className="text-3xl font-bold mt-1">Lista de Convidados: {campaignName}</h1>
                </div>
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                     <label className="flex items-center space-x-2 text-sm font-medium text-gray-200 cursor-pointer flex-shrink-0">
                        <input
                            type="checkbox"
                            checked={filterInGroupOnly}
                            onChange={(e) => setFilterInGroupOnly(e.target.checked)}
                            className="h-4 w-4 text-primary bg-gray-700 border-gray-500 rounded focus:ring-primary"
                        />
                        <span>Mostrar apenas quem está no grupo</span>
                    </label>
                    <div className="flex items-center gap-4">
                        <Link
                            to={`/admin/checkin/${campaignId}`}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-semibold"
                        >
                            Controlar Entrada
                        </Link>
                        <button
                            onClick={handleDownloadCSV}
                            disabled={filteredConfirmations.length === 0 || isLoading}
                            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm font-semibold disabled:opacity-50"
                        >
                            <DownloadIcon className="w-4 h-4" />
                            <span>Baixar Excel (CSV)</span>
                        </button>
                        <div className="bg-primary text-white font-bold text-center rounded-lg px-4 py-2">
                            <div className="text-3xl">{totalConfirmed}</div>
                            <div className="text-sm uppercase">Confirmados</div>
                        </div>
                    </div>
                </div>
            </div>
            <div className="bg-secondary shadow-lg rounded-lg p-6">
                {renderContent()}
            </div>
        </div>
    );
};

export default GuestListPage;