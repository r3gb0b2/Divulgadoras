
import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Campaign, AdminUserData, StatesConfig, Timestamp, CampaignStatus } from '../types';
import { getCampaigns, addCampaign, updateCampaign, deleteCampaign, getStatesConfig, setStatesConfig } from '../services/settingsService';
import { stateMap } from '../constants/states';
import { ArrowLeftIcon, PencilIcon, TrashIcon, RefreshIcon, PlusIcon, LinkIcon } from '../components/Icons';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import firebase from 'firebase/compat/app';

const CampaignModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onSave: (campaign: any) => void;
    campaign: Campaign | null;
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

    return (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex justify-center items-center z-[100] p-4" onClick={onClose}>
            <div className="bg-secondary rounded-[2.5rem] shadow-2xl p-8 w-full max-w-2xl max-h-[90vh] flex flex-col border border-white/10" onClick={e => e.stopPropagation()}>
                <h2 className="text-2xl font-black text-white mb-6 uppercase tracking-tighter">{campaign ? 'Editar Evento' : 'Novo Evento'}</h2>
                <form onSubmit={e => { e.preventDefault(); onSave(formData); }} className="flex-grow overflow-y-auto space-y-4 pr-2 custom-scrollbar">
                    <div className="space-y-1">
                        <label className="text-[10px] font-black text-gray-500 uppercase ml-1">Nome do Evento</label>
                        <input type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} required className="w-full px-5 py-4 bg-dark border border-white/10 rounded-2xl text-white outline-none focus:ring-2 focus:ring-primary font-bold"/>
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] font-black text-gray-500 uppercase ml-1">Link do Grupo WhatsApp</label>
                        <input type="url" value={formData.whatsappLink} onChange={e => setFormData({...formData, whatsappLink: e.target.value})} required className="w-full px-5 py-4 bg-dark border border-white/10 rounded-2xl text-white outline-none focus:ring-2 focus:ring-primary text-sm"/>
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] font-black text-gray-500 uppercase ml-1">Regras e Instruções</label>
                        <textarea value={formData.rules} onChange={e => setFormData({...formData, rules: e.target.value})} rows={6} className="w-full px-5 py-4 bg-dark border border-white/10 rounded-2xl text-white outline-none focus:ring-2 focus:ring-primary text-sm"/>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                         <div className="space-y-1">
                            <label className="text-[10px] font-black text-gray-500 uppercase ml-1">Status</label>
                            <select value={formData.status} onChange={e => setFormData({...formData, status: e.target.value as any})} className="w-full px-5 py-4 bg-dark border border-white/10 rounded-2xl text-white outline-none focus:ring-2 focus:ring-primary text-xs font-black uppercase">
                                <option value="active">ATIVO</option>
                                <option value="inactive">INATIVO</option>
                                <option value="hidden">OCULTO</option>
                            </select>
                        </div>
                        <div className="flex items-center pt-4">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input type="checkbox" checked={formData.preventDuplicateInOrg} onChange={e => setFormData({...formData, preventDuplicateInOrg: e.target.checked})} className="w-4 h-4 rounded bg-dark text-primary" />
                                <span className="text-[10px] font-black text-gray-400 uppercase">Bloquear Duplicidade</span>
                            </label>
                        </div>
                    </div>
                </form>
                 <div className="mt-8 flex gap-3 border-t border-white/5 pt-6">
                    <button type="button" onClick={onClose} className="flex-1 py-4 bg-gray-800 text-gray-400 font-black rounded-2xl uppercase text-xs">Cancelar</button>
                    <button type="submit" onClick={() => onSave(formData)} className="flex-[2] py-4 bg-primary text-white font-black rounded-2xl uppercase text-xs shadow-xl shadow-primary/20">Salvar Evento</button>
                </div>
            </div>
        </div>
    );
};

const StateManagementPage: React.FC<{ adminData: AdminUserData }> = ({ adminData }) => {
    const { stateAbbr } = useParams<{ stateAbbr: string }>();
    const { selectedOrgId } = useAdminAuth();
    const navigate = useNavigate();
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
    const [copiedId, setCopiedId] = useState<string | null>(null);

    const fetchData = useCallback(async () => {
        if (!stateAbbr || !selectedOrgId) return;
        setIsLoading(true);
        try {
            const data = await getCampaigns(stateAbbr, selectedOrgId);
            setCampaigns(data);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    }, [stateAbbr, selectedOrgId]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const handleSave = async (formData: any) => {
        if (!stateAbbr || !selectedOrgId) return;
        try {
            if (editingCampaign) {
                await updateCampaign(editingCampaign.id, formData);
            } else {
                await addCampaign({
                    ...formData,
                    stateAbbr,
                    organizationId: selectedOrgId
                });
            }
            setIsModalOpen(false);
            fetchData();
        } catch (err: any) {
            alert(err.message);
        }
    };

    const handleCopy = (c: Campaign) => {
        const link = `${window.location.origin}/#/${selectedOrgId}/${stateAbbr}/${encodeURIComponent(c.name)}/register`;
        navigator.clipboard.writeText(link);
        setCopiedId(c.id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    return (
        <div className="max-w-5xl mx-auto p-4">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-black text-white uppercase tracking-tighter">{stateMap[stateAbbr?.toUpperCase() || '']}</h1>
                    <p className="text-primary font-bold uppercase text-[10px] tracking-widest mt-1">Gestão de Eventos Regionais</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={() => { setEditingCampaign(null); setIsModalOpen(true); }} className="px-6 py-3 bg-primary text-white font-black rounded-2xl text-[10px] uppercase shadow-xl flex items-center gap-2 transition-all active:scale-95">
                        <PlusIcon className="w-4 h-4" /> Novo Evento
                    </button>
                    <button onClick={() => navigate(-1)} className="p-3 bg-gray-800 text-gray-400 rounded-2xl hover:text-white transition-all"><ArrowLeftIcon className="w-5 h-5"/></button>
                </div>
            </div>

            <div className="bg-secondary/60 backdrop-blur-xl rounded-[2.5rem] border border-white/5 shadow-2xl p-6">
                {isLoading ? (
                    <div className="flex justify-center py-20"><RefreshIcon className="w-10 h-10 text-primary animate-spin" /></div>
                ) : campaigns.length === 0 ? (
                    <div className="text-center py-20 text-gray-600 font-bold uppercase text-xs">Nenhum evento cadastrado para esta região.</div>
                ) : (
                    <div className="grid gap-4">
                        {campaigns.map(c => (
                            <div key={c.id} className="bg-dark/40 p-6 rounded-3xl border border-white/5 flex flex-col md:flex-row justify-between items-center gap-6 group hover:border-primary/30 transition-all">
                                <div className="text-center md:text-left">
                                    <div className="flex items-center gap-3 justify-center md:justify-start">
                                        <h3 className="text-xl font-black text-white uppercase">{c.name}</h3>
                                        <span className={`px-2 py-0.5 rounded-full text-[8px] font-black border ${c.status === 'active' ? 'bg-green-900/40 text-green-400 border-green-800' : 'bg-red-900/40 text-red-400 border-red-800'}`}>{c.status.toUpperCase()}</span>
                                    </div>
                                    <p className="text-gray-500 text-[10px] font-bold uppercase mt-1 tracking-widest truncate max-w-sm">{c.whatsappLink || 'Sem link de grupo'}</p>
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={() => handleCopy(c)} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${copiedId === c.id ? 'bg-green-600 text-white' : 'bg-indigo-900/20 text-indigo-400 border border-indigo-800/30 hover:bg-indigo-600 hover:text-white'}`}>
                                        <LinkIcon className="w-4 h-4" /> {copiedId === c.id ? 'Copiado!' : 'Copiar Link'}
                                    </button>
                                    <button onClick={() => { setEditingCampaign(c); setIsModalOpen(true); }} className="p-3 bg-gray-800 text-white rounded-xl hover:bg-primary transition-all"><PencilIcon className="w-4 h-4"/></button>
                                    <button onClick={() => { if(confirm("Excluir?")) deleteCampaign(c.id).then(fetchData); }} className="p-3 bg-red-900/30 text-red-500 rounded-xl hover:bg-red-600 transition-all"><TrashIcon className="w-4 h-4"/></button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <CampaignModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSave={handleSave} campaign={editingCampaign} />
        </div>
    );
};

export default StateManagementPage;
