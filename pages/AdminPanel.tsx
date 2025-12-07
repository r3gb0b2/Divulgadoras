import React, { useState, useEffect, useCallback } from 'react';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { getAllPromoters, findPromotersByEmail } from '../services/promoterService';
import { getOrganizations } from '../services/organizationService';
import { Promoter, AdminUserData } from '../types';
import { SearchIcon, RefreshIcon, UsersIcon } from '../components/Icons';
import PromoterLookupModal from '../components/PromoterLookupModal';
import { useNavigate } from 'react-router-dom';

interface AdminPanelProps {
    adminData: AdminUserData;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({ adminData }) => {
    const { selectedOrgId } = useAdminAuth();
    const navigate = useNavigate();
    
    const [promoters, setPromoters] = useState<Promoter[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    
    // Lookup State
    const [lookupEmail, setLookupEmail] = useState('');
    const [isLookingUp, setIsLookingUp] = useState(false);
    const [lookupError, setLookupError] = useState<string | null>(null);
    const [lookupResults, setLookupResults] = useState<Promoter[] | null>(null);
    const [isLookupModalOpen, setIsLookupModalOpen] = useState(false);
    
    // Organizations Map for display
    const [organizationsMap, setOrganizationsMap] = useState<Record<string, string>>({});

    useEffect(() => {
        const loadOrgs = async () => {
            try {
                const orgs = await getOrganizations();
                const map = orgs.reduce((acc, org) => {
                    acc[org.id] = org.name;
                    return acc;
                }, {} as Record<string, string>);
                setOrganizationsMap(map);
            } catch (e) {
                console.error("Failed to load organizations map", e);
            }
        };
        loadOrgs();
    }, []);

    const fetchPromoters = useCallback(async () => {
        if (!selectedOrgId && adminData.role !== 'superadmin') return;
        
        setIsLoading(true);
        setError(null);
        try {
            const data = await getAllPromoters({
                organizationId: adminData.role === 'superadmin' ? undefined : selectedOrgId,
                filterOrgId: selectedOrgId || 'all',
                filterState: 'all',
                status: 'all',
                selectedCampaign: 'all'
            });
            setPromoters(data);
        } catch (err: any) {
            setError(err.message || "Falha ao carregar divulgadoras.");
        } finally {
            setIsLoading(false);
        }
    }, [selectedOrgId, adminData.role]);

    useEffect(() => {
        fetchPromoters();
    }, [fetchPromoters]);

    const handleLookupPromoter = async (emailToSearch?: string) => {
        const email = (typeof emailToSearch === 'string' ? emailToSearch : '') || lookupEmail;
        if (!email.trim()) return;
        setIsLookingUp(true);
        setLookupError(null);
        setLookupResults(null);
        setIsLookupModalOpen(true);
        try {
            const results = await findPromotersByEmail(String(email).trim());
            setLookupResults(results);
        } catch (err: unknown) {
            let errorMessage = "Ocorreu um erro na busca.";
            if (err instanceof Error) {
                errorMessage = err.message;
            } else if (typeof err === 'string') {
                errorMessage = err;
            }
            setLookupError(errorMessage);
        } finally {
            setIsLookingUp(false);
        }
    };

    const handleGoToPromoter = (promoter: Promoter) => {
        // Close modal and navigate to edit page
        setIsLookupModalOpen(false);
        navigate(`/${promoter.organizationId}/register/${promoter.state}/${promoter.campaignName ? encodeURIComponent(promoter.campaignName) : ''}?edit_id=${promoter.id}`);
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                    <UsersIcon className="w-6 h-6" />
                    Divulgadoras
                </h1>
                <div className="flex gap-2 w-full md:w-auto">
                    <div className="relative flex-grow md:flex-grow-0">
                        <input 
                            type="text" 
                            value={lookupEmail}
                            onChange={(e) => setLookupEmail(e.target.value)}
                            placeholder="Buscar por e-mail..."
                            className="w-full md:w-64 px-4 py-2 rounded-l-md bg-gray-700 text-white border border-gray-600 focus:outline-none focus:border-primary"
                            onKeyDown={(e) => e.key === 'Enter' && handleLookupPromoter()}
                        />
                        <button 
                            onClick={() => handleLookupPromoter()}
                            className="absolute right-0 top-0 bottom-0 px-3 bg-primary text-white rounded-r-md hover:bg-primary-dark"
                        >
                            <SearchIcon className="w-5 h-5" />
                        </button>
                    </div>
                    <button onClick={fetchPromoters} className="p-2 bg-gray-600 text-white rounded-md hover:bg-gray-500">
                        <RefreshIcon className="w-5 h-5" />
                    </button>
                </div>
            </div>

            {/* Main List */}
            <div className="bg-secondary rounded-lg shadow-lg overflow-hidden">
                {isLoading ? (
                    <div className="p-8 text-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div></div>
                ) : error ? (
                    <div className="p-8 text-center text-red-400">{error}</div>
                ) : promoters.length === 0 ? (
                    <div className="p-8 text-center text-gray-400">Nenhuma divulgadora encontrada.</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-700">
                            <thead className="bg-gray-700/50">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Nome</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Email</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Status</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Evento</th>
                                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-700">
                                {promoters.map((promoter) => (
                                    <tr key={promoter.id} className="hover:bg-gray-700/30">
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white">{promoter.name}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{promoter.email}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                                promoter.status === 'approved' ? 'bg-green-900 text-green-300' : 
                                                promoter.status === 'rejected' ? 'bg-red-900 text-red-300' : 
                                                'bg-yellow-900 text-yellow-300'
                                            }`}>
                                                {promoter.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{promoter.campaignName || '-'}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                            <button 
                                                onClick={() => handleGoToPromoter(promoter)}
                                                className="text-primary hover:text-primary-dark"
                                            >
                                                Editar
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <PromoterLookupModal 
                isOpen={isLookupModalOpen}
                onClose={() => setIsLookupModalOpen(false)}
                isLoading={isLookingUp}
                error={lookupError}
                results={lookupResults}
                onGoToPromoter={handleGoToPromoter}
                organizationsMap={organizationsMap}
            />
        </div>
    );
};
