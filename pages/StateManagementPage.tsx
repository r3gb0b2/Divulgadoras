
import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Campaign, AdminUserData, StatesConfig, Timestamp, CampaignStatus } from '../types';
import { getCampaigns, addCampaign, updateCampaign, deleteCampaign, getStatesConfig, setStatesConfig } from '../services/settingsService';
import { setAdminUserData } from '../services/adminService';
import { stateMap } from '../constants/states';
import { ArrowLeftIcon } from '../components/Icons';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { functions } from '../firebase/config';

// Modal component for Add/Edit Campaign
const CampaignModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onSave: (campaign: Omit<Campaign, 'id' | 'organizationId' | 'stateAbbr'> | Partial<Campaign> & { id: string }) => void;
    campaign: Omit<Campaign, 'id' | 'stateAbbr' | 'organizationId'> | Campaign | null;
}> = ({ isOpen, onClose, onSave, campaign }) => {
    const [formData, setFormData] = useState({ 
        name: '', 
        description: '', 
        whatsappLink: '', 
        rules: '', 
        status: 'active' as CampaignStatus,
        pixelId: '',
        preventDuplicateInOrg: false,
    });
    
    useEffect(() => {
        if (campaign) {
            setFormData({
                name: campaign.name || '',
                description: campaign.description || '',
                whatsappLink: campaign.whatsappLink || '',
                rules: campaign.rules || '',
                status: campaign.status || 'active',
                pixelId: campaign.pixelId || '',
                preventDuplicateInOrg: campaign.preventDuplicateInOrg || false,
            });
        } else {
            setFormData({ name: '', description: '', whatsappLink: '', rules: '', status: 'active', pixelId: '', preventDuplicateInOrg: false });
        }
    }, [campaign, isOpen]);
    
    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave({ ...(campaign || {}), ...formData });
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50 p-4">
            <div className="bg-secondary rounded-lg shadow-xl p-6 w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <h2 className="text-2xl font-bold text-white mb-4">{'id' in (campaign || {}) ? 'Editar Evento' : 'Novo Evento'}</h2>
                <form onSubmit={handleSubmit} className="flex-grow overflow-y-auto space-y-4 pr-2">
                    <input type="text" placeholder="Nome do Evento/Gênero" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} required className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-white"/>
                    <textarea placeholder="Descrição (opcional)" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-white min-h-[80px]"/>
                    <input type="text" placeholder="ID do Pixel (Facebook, etc) - Opcional" value={formData.pixelId} onChange={e => setFormData({...formData, pixelId: e.target.value})} className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-white"/>
                    <input type="url" placeholder="Link do Grupo do WhatsApp" value={formData.whatsappLink} onChange={e => setFormData({...formData, whatsappLink: e.target.value})} required className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-white"/>
                    <textarea placeholder="Regras e Informações" value={formData.rules} onChange={e => setFormData({...formData, rules: e.target.value})} className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-white min-h-[150px]"/>
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Status</label>
                         <select 
                            value={formData.status} 
                            onChange={e => setFormData({...formData, status: e.target.value as CampaignStatus})} 
                            className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-white"
                        >
                            <option value="active">Ativo (visível para cadastro)</option>
                            <option value="inactive">Inativo (não permite novos cadastros)</option>
                            <option value="hidden">Oculto (não aparece na lista de eventos)</option>
                        </select>
                    </div>
                    <div>
                        <label className="flex items-center space-x-2 cursor-pointer">
                            <input 
                                type="checkbox" 
                                checked={formData.preventDuplicateInOrg} 
                                onChange={e => setFormData({...formData, preventDuplicateInOrg: e.target.checked})} 
                                className="h-4 w-4 text-primary bg-gray-700 border-gray-500 rounded"
                            />
                            <span className="text-sm font-medium text-gray-300">Bloquear se já aprovada na organização</span>
                        </label>
                        <p className="text-xs text-gray-400 mt-1 ml-6">
                            Se marcado, impede que uma divulgadora se cadastre neste evento se ela já tiver um cadastro 'Aprovado' em qualquer outro evento desta organização.
                        </p>
                    </div>
                </form>
                 <div className="mt-6 flex justify-end space-x-3 border-t border-gray-700 pt-4">
                    <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-600 rounded-md">Cancelar</button>
                    <button type="submit" onClick={handleSubmit} className="px-4 py-2 bg-primary text-white rounded-md">Salvar</button>
                </div>
            </div>
        </div>
    );
};

interface StateManagementPageProps {
  adminData: AdminUserData;
}

const getStatusBadge = (status: CampaignStatus) => {
    const styles: Record<CampaignStatus, string> = {
        active: "bg-green-900/50 text-green-300",
        inactive: "bg-red-900/50 text-red-300",
        hidden: "bg-gray-700 text-gray-400",
    };
    const text: Record<CampaignStatus, string> = { active: "Ativo", inactive: "Inativo", hidden: "Oculto" };
    return <span className={`text-xs ml-2 px-2 py-0.5 rounded-full ${styles[status]}`}>{text[status]}</span>;
};

const StateManagementPage: React.FC<StateManagementPageProps> = ({ adminData }) => {
    const { stateAbbr } = useParams<{ stateAbbr: string }>();
    const { selectedOrgId } = useAdminAuth();
    const navigate = useNavigate();
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [statesConfig, setStatesConfig] = useState<StatesConfig | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
    const [copiedLink, setCopiedLink] = useState<string | null>(null);

    const isSuperAdmin = adminData.role === 'superadmin';
    const orgIdForOps = isSuperAdmin ? undefined : selectedOrgId;

    const fetchData = useCallback(async () => {
        if (!stateAbbr) return;

        // Guard against calling API without orgId for non-superadmins
        if (!isSuperAdmin && !selectedOrgId) {
            setError("Sua conta de administrador não está associada a uma organização. Impossível carregar eventos.");
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        setError('');
        try {
            const campaignData = await getCampaigns(stateAbbr, orgIdForOps);
            setCampaigns(campaignData);
            if (isSuperAdmin) {
                const config = await getStatesConfig();
                setStatesConfig(config);
            }
        } catch (err: any) {
            setError(err.message || 'Falha ao carregar dados.');
        } finally {
            setIsLoading(false);
        }
    }, [stateAbbr, isSuperAdmin, selectedOrgId, orgIdForOps]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleOpenModal = (campaign: Campaign | null = null) => {
        setEditingCampaign(campaign);
        setIsModalOpen(true);
    };
    
    const handleCopyLink = (campaign: Campaign) => {
        if (!stateAbbr || !orgIdForOps) return;
        const link = `${window.location.origin}/#/${orgIdForOps}/register/${stateAbbr}/${encodeURIComponent(campaign.name)}`;
        navigator.clipboard.writeText(link).then(() => {
            setCopiedLink(campaign.id);
            setTimeout(() => setCopiedLink(null), 2500);
        }).catch(err => {
            console.error('Failed to copy direct link: ', err);
            alert('Falha ao copiar o link. Por favor, tente manualmente.');
        });
    };

    const handleSaveCampaign = async (campaignData: Omit<Campaign, 'id' | 'organizationId' | 'stateAbbr'> | Partial<Campaign> & { id: string }) => {
        if (!stateAbbr || !orgIdForOps) return;

        if (isSuperAdmin) {
             setError("Super Admins devem gerenciar campanhas no painel da organização.");
             return;
        }

        try {
            if ('id' in campaignData && campaignData.id) {
                const { id, ...dataToUpdate } = campaignData;
                await updateCampaign(id, dataToUpdate);
            } else {
                const newCampaignName = (campaignData as { name: string }).name;
                await addCampaign({
                    ...(campaignData as Omit<Campaign, 'id' | 'organizationId' | 'stateAbbr'>),
                    stateAbbr,
                    organizationId: orgIdForOps,
                });

                // Auto-assign the new campaign to the creating admin if they have restrictions for this state.
                const adminRestrictions = adminData.assignedCampaigns?.[stateAbbr];
                if (adminRestrictions !== undefined) { // `undefined` means all access, an array (even empty) means restricted access
                    const newAssignedCampaigns = { ...(adminData.assignedCampaigns || {}) };
                    const updatedCampaignsForState = [...(newAssignedCampaigns[stateAbbr] || []), newCampaignName];
                    newAssignedCampaigns[stateAbbr] = updatedCampaignsForState;
                    
                    await setAdminUserData(adminData.uid, { assignedCampaigns: newAssignedCampaigns });
                }
            }
            setIsModalOpen(false);
            fetchData();
        } catch (err: any) {
            setError(err.message || 'Falha ao salvar evento.');
        }
    };

    const handleDeleteCampaign = async (id: string) => {
        if (window.confirm('Tem certeza que deseja deletar este evento?')) {
            try {
                await deleteCampaign(id);
                fetchData();
            } catch (err: any) {
                setError(err.message || 'Falha ao deletar evento.');
            }
        }
    };
    
    const handleToggleStateActive = async (isActive: boolean) => {
        if (!isSuperAdmin || !stateAbbr || !statesConfig) return;
        try {
            const newConfig = { ...statesConfig, [stateAbbr]: { ...statesConfig[stateAbbr], isActive } };
            await setStatesConfig(newConfig);
            setStatesConfig(newConfig);
        } catch (err: any) {
            setError(err.message || 'Falha ao atualizar status da região.');
        }
    };
    
    const currentStateConfig = stateAbbr ? statesConfig?.[stateAbbr] : null;

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold">Gerenciar: {stateAbbr ? stateMap[stateAbbr.toUpperCase()] : 'Região'}</h1>
                <button onClick={() => navigate(-1)} className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-500 text-sm">
                    <ArrowLeftIcon className="w-4 h-4" /> Voltar
                </button>
            </div>
            {error && <p className="text-red-400 bg-red-900/50 p-3 rounded-md mb-4">{error}</p>}
            
            {isSuperAdmin && currentStateConfig && (
                <div className="bg-secondary shadow-lg rounded-lg p-6 mb-6">
                    <h2 className="text-xl font-semibold mb-3">Configurações Globais</h2>
                    <label className="flex items-center space-x-3 cursor-pointer">
                        <div className="relative">
                            <input type="checkbox" checked={currentStateConfig.isActive} onChange={e => handleToggleStateActive(e.target.checked)} className="sr-only" />
                            <div className={`block w-14 h-8 rounded-full ${currentStateConfig.isActive ? 'bg-primary' : 'bg-gray-600'}`}></div>
                            <div className={`dot absolute left-1 top-1 bg-white w-6 h-6 rounded-full transition-transform ${currentStateConfig.isActive ? 'transform translate-x-full' : ''}`}></div>
                        </div>
                        <span className="text-white font-medium">Inscrições {currentStateConfig.isActive ? 'ATIVAS' : 'INATIVAS'} para esta região</span>
                    </label>
                </div>
            )}
            
            <div className="bg-secondary shadow-lg rounded-lg p-6">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-semibold">Eventos / Gêneros</h2>
                    {adminData.role !== 'viewer' && (
                        <button onClick={() => handleOpenModal()} className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-dark text-sm">
                            + Novo Evento
                        </button>
                    )}
                </div>
                {isLoading ? <p>Carregando...</p> : campaigns.length === 0 ? <p className="text-gray-400">Nenhum evento cadastrado para esta região.</p> : (
                    <div className="space-y-3">
                        {campaigns.map(c => (
                            <div key={c.id} className="bg-gray-700/50 p-3 rounded-md flex flex-col sm:flex-row justify-between sm:items-center gap-3">
                                <div>
                                    <p className="font-semibold text-white flex items-center">{c.name} {getStatusBadge(c.status)}</p>
                                    <p className="text-sm text-gray-400">{c.description}</p>
                                    {c.preventDuplicateInOrg && (
                                        <span className="text-xs text-yellow-400 bg-yellow-900/30 px-1.5 py-0.5 rounded mt-1 inline-block">Bloqueia Duplicidade</span>
                                    )}
                                </div>
                                {adminData.role !== 'viewer' && (
                                    <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2 text-sm font-medium flex-shrink-0">
                                        <button 
                                            onClick={() => handleCopyLink(c)} 
                                            className="text-blue-400 hover:text-blue-300 transition-colors duration-200 disabled:text-gray-500 disabled:cursor-default"
                                            disabled={copiedLink === c.id}
                                        >
                                            {copiedLink === c.id ? 'Link Copiado!' : 'Copiar Link Direto'}
                                        </button>
                                        <button onClick={() => handleOpenModal(c)} className="text-indigo-400 hover:text-indigo-300">Editar</button>
                                        <button onClick={() => handleDeleteCampaign(c.id)} className="text-red-400 hover:text-red-300">Excluir</button>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <CampaignModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSave={handleSaveCampaign} campaign={editingCampaign} />
        </div>
    );
};

export default StateManagementPage;
