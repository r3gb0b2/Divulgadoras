
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { getOrganizations } from '../services/organizationService';
import { deletePushToken } from '../services/promoterService';
import { sendPushCampaign } from '../services/messageService';
import { getAllCampaigns } from '../services/settingsService';
import { Organization, Promoter, Campaign } from '../types';
import { ArrowLeftIcon, FaceIdIcon, TrashIcon, CheckCircleIcon, SearchIcon, MegaphoneIcon } from '../components/Icons';

const AdminPushCampaignPage: React.FC = () => {
    const navigate = useNavigate();
    const { adminData, selectedOrgId } = useAdminAuth();
    
    const [organizations, setOrganizations] = useState<Organization[]>([]);
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [promoters, setPromoters] = useState<Promoter[]>([]);
    const [isLoadingData, setIsLoadingData] = useState(true);

    const [targetOrgId, setTargetOrgId] = useState('');
    const [targetCampaignName, setTargetCampaignName] = useState('all');
    const [activePlatformTab, setActivePlatformTab] = useState<'ios' | 'android'>('ios');
    const [selectedPromoterIds, setSelectedPromoterIds] = useState<Set<string>>(new Set());
    const [searchQuery, setSearchQuery] = useState('');

    const [title, setTitle] = useState('');
    const [body, setBody] = useState('');
    const [targetUrl, setTargetUrl] = useState('/#/posts');
    
    const [isSending, setIsSending] = useState(false);
    const [isDeletingToken, setIsDeletingToken] = useState<string | null>(null);
    const [result, setResult] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const isSuperAdmin = adminData?.role === 'superadmin';

    // 1. Carregar Organizações e Campanhas
    useEffect(() => {
        const loadInitial = async () => {
            if (isSuperAdmin) {
                const orgs = await getOrganizations();
                setOrganizations(orgs.sort((a,b) => a.name.localeCompare(b.name)));
            } else if (selectedOrgId) {
                setTargetOrgId(selectedOrgId);
            }
        };
        loadInitial();
    }, [isSuperAdmin, selectedOrgId]);

    useEffect(() => {
        const orgId = isSuperAdmin ? targetOrgId : selectedOrgId;
        if (orgId) {
            getAllCampaigns(orgId).then(data => {
                setCampaigns(data.sort((a,b) => a.name.localeCompare(b.name)));
            });
        }
    }, [targetOrgId, selectedOrgId, isSuperAdmin]);

    // 2. Buscar Promotoras filtradas
    const fetchPromoters = useCallback(async () => {
        const orgId = isSuperAdmin ? targetOrgId : selectedOrgId;
        if (!orgId) return;
        setIsLoadingData(true);
        try {
            const { getAllPromoters } = await import('../services/promoterService');
            const fetched = await getAllPromoters({
                organizationId: orgId,
                filterOrgId: orgId,
                filterState: 'all',
                selectedCampaign: targetCampaignName, // Filtro por campanha injetado aqui
                status: 'approved',
            });
            // Filtra apenas quem tem token
            const withToken = fetched.filter(p => !!p.fcmToken);
            setPromoters(withToken);
            
            // Auto-selecionar todos os filtrados por padrão ao trocar de campanha
            setSelectedPromoterIds(new Set(withToken.map(p => p.id))); 
        } catch (err) {
            setError("Erro ao buscar dispositivos.");
        } finally {
            setIsLoadingData(false);
        }
    }, [isSuperAdmin, targetOrgId, selectedOrgId, targetCampaignName]);

    useEffect(() => {
        fetchPromoters();
    }, [fetchPromoters]);

    const filteredPromoters = useMemo(() => {
        return promoters.filter(p => {
            let pPlatform = (p.pushDiagnostics?.platform || 'ios').toLowerCase();
            const matchesPlatform = pPlatform === activePlatformTab;
            const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
            return matchesPlatform && matchesSearch;
        });
    }, [promoters, activePlatformTab, searchQuery]);

    const handleDeleteToken = async (promoterId: string) => {
        if (!window.confirm("Remover este vínculo de dispositivo?")) return;
        setIsDeletingToken(promoterId);
        try {
            await deletePushToken(promoterId);
            setPromoters(prev => prev.filter(p => p.id !== promoterId));
        } catch (e: any) {
            alert("Erro: " + e.message);
        } finally {
            setIsDeletingToken(null);
        }
    };

    const handleSend = async () => {
        const orgId = isSuperAdmin ? targetOrgId : selectedOrgId;
        if (!title || !body || selectedPromoterIds.size === 0 || !orgId) {
            setError("Preencha título, mensagem e selecione ao menos um destino.");
            return;
        }
        
        if (!window.confirm(`Confirmar disparo de PUSH para ${selectedPromoterIds.size} aparelhos?`)) return;

        setIsSending(true); setResult(null); setError(null);
        try {
            const res = await sendPushCampaign({
                title, body, url: targetUrl,
                promoterIds: Array.from(selectedPromoterIds),
                organizationId: orgId
            });
            if (res.success) {
                setResult(res.message); setTitle(''); setBody('');
                setSelectedPromoterIds(new Set());
                fetchPromoters(); 
            } else {
                setError(res.message);
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsSending(false);
        }
    };

    return (
        <div className="max-w-6xl mx-auto pb-20">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold flex items-center gap-3">
                    <FaceIdIcon className="w-8 h-8 text-primary" />
                    Campanhas Push
                </h1>
                <button onClick={() => navigate(-1)} className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-500 text-sm">
                    <ArrowLeftIcon className="w-4 h-4" /> Voltar
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Filtros e Lista */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-secondary p-6 rounded-xl shadow-lg border border-gray-700">
                        <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                             <MegaphoneIcon className="w-5 h-5 text-primary" />
                             Segmentação de Audiência
                        </h2>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                            {isSuperAdmin && (
                                <div>
                                    <label className="text-[10px] font-black text-gray-500 uppercase ml-1">Organização</label>
                                    <select value={targetOrgId} onChange={e => setTargetOrgId(e.target.value)} className="w-full bg-dark border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:ring-1 focus:ring-primary outline-none">
                                        <option value="">Selecione...</option>
                                        {organizations.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                                    </select>
                                </div>
                            )}
                            <div>
                                <label className="text-[10px] font-black text-gray-500 uppercase ml-1">Filtrar por Evento</label>
                                <select value={targetCampaignName} onChange={e => setTargetCampaignName(e.target.value)} className="w-full bg-dark border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:ring-1 focus:ring-primary outline-none">
                                    <option value="all">Todos os Eventos</option>
                                    {campaigns.map(c => <option key={c.id} value={c.name}>{c.name} ({c.stateAbbr})</option>)}
                                </select>
                            </div>
                        </div>

                        <div className="flex flex-col sm:flex-row items-center justify-between mb-4 gap-4 border-t border-gray-700 pt-4">
                            <div className="relative flex-grow w-full">
                                <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                                <input 
                                    type="text" 
                                    placeholder="Buscar por nome..." 
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    className="w-full bg-dark border border-gray-700 rounded-lg pl-10 pr-4 py-2 text-sm text-white"
                                />
                            </div>
                            <div className="flex bg-dark p-1 rounded-lg border border-gray-700 flex-shrink-0">
                                <button onClick={() => setActivePlatformTab('ios')} className={`px-4 py-1.5 text-xs font-bold rounded-md ${activePlatformTab === 'ios' ? 'bg-primary text-white' : 'text-gray-400'}`}>iOS</button>
                                <button onClick={() => setActivePlatformTab('android')} className={`px-4 py-1.5 text-xs font-bold rounded-md ${activePlatformTab === 'android' ? 'bg-green-600 text-white' : 'text-gray-400'}`}>Android</button>
                            </div>
                        </div>

                        <div className="overflow-x-auto border border-gray-700 rounded-lg max-h-[400px] overflow-y-auto">
                            <table className="min-w-full divide-y divide-gray-700">
                                <thead className="bg-dark sticky top-0 z-10">
                                    <tr>
                                        <th className="px-4 py-3 text-left w-10">
                                            <input type="checkbox" checked={filteredPromoters.length > 0 && filteredPromoters.every(p => selectedPromoterIds.has(p.id))} onChange={(e) => {
                                                const newSet = new Set(selectedPromoterIds);
                                                filteredPromoters.forEach(p => e.target.checked ? newSet.add(p.id) : newSet.delete(p.id));
                                                setSelectedPromoterIds(newSet);
                                            }} className="rounded border-gray-600 text-primary" />
                                        </th>
                                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase">Divulgadora</th>
                                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase">Campanha</th>
                                        <th className="px-4 py-3 text-right text-xs font-bold text-gray-400 uppercase">Ações</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-700 bg-gray-800/20">
                                    {isLoadingData ? (
                                        <tr><td colSpan={4} className="text-center py-8 text-gray-500">Buscando dispositivos...</td></tr>
                                    ) : filteredPromoters.length === 0 ? (
                                        <tr><td colSpan={4} className="text-center py-8 text-gray-500">Nenhum dispositivo encontrado para os filtros selecionados.</td></tr>
                                    ) : (
                                        filteredPromoters.map(p => (
                                            <tr key={p.id} className="hover:bg-gray-700/30">
                                                <td className="px-4 py-3">
                                                    <input type="checkbox" checked={selectedPromoterIds.has(p.id)} onChange={() => {
                                                        const n = new Set(selectedPromoterIds);
                                                        if (n.has(p.id)) n.delete(p.id); else n.add(p.id);
                                                        setSelectedPromoterIds(n);
                                                    }} className="rounded border-gray-600 text-primary" />
                                                </td>
                                                <td className="px-4 py-3">
                                                    <p className="text-sm font-bold text-white">{p.name}</p>
                                                    <p className="text-[10px] text-gray-500 font-mono">{p.email}</p>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className="text-[9px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-black border border-primary/20 uppercase">{p.campaignName || 'Geral'}</span>
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    <button onClick={() => handleDeleteToken(p.id)} disabled={isDeletingToken === p.id} className="p-2 bg-red-900/30 text-red-400 rounded hover:bg-red-900/50"><TrashIcon className="w-4 h-4" /></button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                {/* Composição da Mensagem */}
                <div className="lg:col-span-1">
                    <div className="bg-secondary p-6 rounded-xl shadow-lg border border-gray-700 sticky top-24">
                        <h2 className="text-xl font-bold text-white mb-4">Nova Notificação</h2>
                        <div className="space-y-4">
                            <div>
                                <label className="text-[10px] font-black text-gray-500 uppercase ml-1">Título do Alerta</label>
                                <input type="text" placeholder="Ex: Novo Post Disponível!" value={title} onChange={e => setTitle(e.target.value)} className="w-full bg-dark border border-gray-700 rounded-lg px-3 py-2 text-white font-bold focus:ring-1 focus:ring-primary outline-none" />
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-gray-500 uppercase ml-1">Mensagem Curta</label>
                                <textarea placeholder="Clique para ver os detalhes da nova tarefa..." value={body} onChange={e => setBody(e.target.value)} className="w-full h-32 bg-dark border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:ring-1 focus:ring-primary outline-none" />
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-gray-500 uppercase ml-1">Link de Destino</label>
                                <input type="text" placeholder="/#/posts" value={targetUrl} onChange={e => setTargetUrl(e.target.value)} className="w-full bg-dark border border-gray-700 rounded-lg px-3 py-2 text-white text-xs font-mono" />
                            </div>
                        </div>

                        <div className="mt-6 pt-4 border-t border-gray-700">
                            {error && <div className="p-3 bg-red-900/30 text-red-300 text-xs font-bold mb-4 rounded-lg border border-red-800/50">{error}</div>}
                            {result && <div className="p-3 bg-green-900/30 text-green-400 text-xs text-center font-bold mb-4 rounded-lg border border-green-800/50">{result}</div>}
                            <button onClick={handleSend} disabled={isSending || selectedPromoterIds.size === 0} className="w-full py-4 bg-primary hover:bg-primary-dark text-white rounded-xl font-black text-lg shadow-xl shadow-primary/20 disabled:opacity-30 transition-all transform active:scale-95">
                                {isSending ? 'ENVIANDO...' : `DISPARAR PARA ${selectedPromoterIds.size}`}
                            </button>
                            <p className="text-[9px] text-gray-500 text-center mt-3 uppercase tracking-widest italic">Segmentado por: {targetCampaignName === 'all' ? 'Todos os Eventos' : targetCampaignName}</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AdminPushCampaignPage;
