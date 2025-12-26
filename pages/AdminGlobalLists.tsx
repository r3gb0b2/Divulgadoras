
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { getOrganizations } from '../services/organizationService';
import { getAllCampaigns } from '../services/settingsService';
import { createGlobalList, getGlobalLists, deleteGlobalList } from '../services/globalListService';
import { GlobalList, Organization, Campaign } from '../types';
import { ArrowLeftIcon, LinkIcon, TrashIcon, PlusIcon, ClipboardDocumentListIcon, BuildingOfficeIcon } from '../components/Icons';

const AdminGlobalLists: React.FC = () => {
    const navigate = useNavigate();
    const { adminData } = useAdminAuth();
    
    const [globalLists, setGlobalLists] = useState<GlobalList[]>([]);
    const [organizations, setOrganizations] = useState<Organization[]>([]);
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    
    const [isLoading, setIsLoading] = useState(true);
    const [isCreating, setIsCreating] = useState(false);
    
    // Form State
    const [name, setName] = useState('');
    const [items, setItems] = useState<GlobalList['items']>([]);
    const [selectedOrgId, setSelectedOrgId] = useState('');
    const [selectedCampId, setSelectedCampId] = useState('');

    const isSuperAdmin = adminData?.role === 'superadmin';

    useEffect(() => {
        if (!isSuperAdmin) {
            navigate('/admin');
            return;
        }
        fetchData();
    }, [isSuperAdmin]);

    const fetchData = async () => {
        setIsLoading(true);
        try {
            const [lists, orgs, allCamps] = await Promise.all([
                getGlobalLists(),
                getOrganizations(),
                getAllCampaigns()
            ]);
            setGlobalLists(lists);
            setOrganizations(orgs.sort((a,b) => a.name.localeCompare(b.name)));
            setCampaigns(allCamps);
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    };

    const handleAddItem = () => {
        const org = organizations.find(o => o.id === selectedOrgId);
        const camp = campaigns.find(c => c.id === selectedCampId);
        if (!org || !camp) return;

        if (items.some(i => i.campaignId === camp.id)) {
            alert("Este evento já foi adicionado.");
            return;
        }

        setItems([...items, {
            organizationId: org.id,
            campaignId: camp.id,
            campaignName: camp.name,
            orgName: org.name
        }]);
        setSelectedCampId('');
    };

    const handleRemoveItem = (id: string) => {
        setItems(items.filter(i => i.campaignId !== id));
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim() || items.length === 0) return;
        setIsCreating(true);
        try {
            await createGlobalList({
                name,
                isActive: true,
                items
            });
            setName('');
            setItems([]);
            fetchData();
            alert("Link Global criado!");
        } catch (e) {
            alert("Erro ao salvar.");
        } finally {
            setIsCreating(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (window.confirm("Excluir este Link Global?")) {
            await deleteGlobalList(id);
            fetchData();
        }
    };

    const handleCopy = (id: string) => {
        const url = `${window.location.origin}/#/global-list/${id}`;
        navigator.clipboard.writeText(url);
        alert("Link copiado!");
    };

    if (isLoading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div></div>;

    return (
        <div className="space-y-8 pb-20">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-black text-white uppercase tracking-tighter">Links Globais de Lista</h1>
                <button onClick={() => navigate(-1)} className="p-2 bg-gray-800 text-white rounded-xl"><ArrowLeftIcon className="w-5 h-5"/></button>
            </div>

            <div className="bg-secondary p-8 rounded-[2.5rem] border border-white/5 shadow-2xl">
                <h2 className="text-xl font-black text-white uppercase mb-6 flex items-center gap-2">
                    <PlusIcon className="w-5 h-5 text-primary" /> Criar Novo Combo
                </h2>
                <form onSubmit={handleSave} className="space-y-6">
                    <input type="text" placeholder="Nome do Combo (Ex: Tour Verão 2024)" value={name} onChange={e => setName(e.target.value)} className="w-full bg-dark border border-gray-700 rounded-2xl p-4 text-white font-bold" required />
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-dark/50 p-6 rounded-3xl border border-white/5">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-gray-500 uppercase ml-1">1. Selecione a Produtora</label>
                            <select value={selectedOrgId} onChange={e => setSelectedOrgId(e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded-xl p-3 text-sm text-white">
                                <option value="">Escolha...</option>
                                {organizations.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                            </select>
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-gray-500 uppercase ml-1">2. Selecione o Evento</label>
                            <select value={selectedCampId} onChange={e => setSelectedCampId(e.target.value)} disabled={!selectedOrgId} className="w-full bg-gray-800 border border-gray-700 rounded-xl p-3 text-sm text-white disabled:opacity-30">
                                <option value="">Escolha...</option>
                                {campaigns.filter(c => c.organizationId === selectedOrgId).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                        </div>
                        <button type="button" onClick={handleAddItem} disabled={!selectedCampId} className="md:col-span-2 py-3 bg-primary text-white font-black rounded-xl uppercase text-xs tracking-widest disabled:opacity-30">Adicionar ao Combo</button>
                    </div>

                    <div className="space-y-3">
                        {items.map((item, idx) => (
                            <div key={idx} className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5">
                                <div>
                                    <p className="text-white font-bold text-sm uppercase">{item.campaignName}</p>
                                    <p className="text-[10px] text-primary font-black uppercase">{item.orgName}</p>
                                </div>
                                <button type="button" onClick={() => handleRemoveItem(item.campaignId)} className="text-red-500 p-2 hover:bg-red-500/10 rounded-lg"><TrashIcon className="w-4 h-4"/></button>
                            </div>
                        ))}
                    </div>

                    <button type="submit" disabled={isCreating || items.length === 0} className="w-full py-5 bg-green-600 text-white font-black rounded-3xl shadow-xl hover:bg-green-500 transition-all uppercase tracking-widest text-sm">
                        {isCreating ? 'GERANDO...' : 'CRIAR LINK GLOBAL'}
                    </button>
                </form>
            </div>

            <div className="space-y-4">
                <h2 className="text-2xl font-black text-white uppercase tracking-tighter">Links Ativos</h2>
                {globalLists.map(list => (
                    <div key={list.id} className="bg-secondary p-6 rounded-3xl border border-white/5 flex flex-col md:flex-row justify-between items-center gap-4">
                        <div className="flex-grow">
                            <h3 className="text-xl font-black text-white uppercase">{list.name}</h3>
                            <p className="text-xs text-gray-500 mt-1 uppercase font-bold">{list.items.length} eventos linkados</p>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={() => handleCopy(list.id)} className="px-4 py-2 bg-blue-600 text-white rounded-xl font-bold text-xs uppercase flex items-center gap-2"><LinkIcon className="w-4 h-4"/> Copiar Link</button>
                            <button onClick={() => handleDelete(list.id)} className="p-2 bg-red-900/30 text-red-500 rounded-xl border border-red-500/30"><TrashIcon className="w-5 h-5"/></button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default AdminGlobalLists;
