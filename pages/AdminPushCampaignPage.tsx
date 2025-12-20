
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { getOrganizations } from '../services/organizationService';
import { getAllCampaigns } from '../services/settingsService';
import { sendPushCampaign } from '../services/messageService';
import { Organization, Campaign, Promoter } from '../types';
import { ArrowLeftIcon, FaceIdIcon, WhatsAppIcon, InstagramIcon } from '../components/Icons';

const AdminPushCampaignPage: React.FC = () => {
    const navigate = useNavigate();
    const { adminData, selectedOrgId } = useAdminAuth();
    
    const [organizations, setOrganizations] = useState<Organization[]>([]);
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [promoters, setPromoters] = useState<Promoter[]>([]);
    const [isLoadingData, setIsLoadingData] = useState(true);

    // Filter State
    const [targetOrgId, setTargetOrgId] = useState('');
    const [targetCampaignName, setTargetCampaignName] = useState('all');
    const [activePlatformTab, setActivePlatformTab] = useState<'ios' | 'android'>('ios');
    const [selectedPromoterIds, setSelectedPromoterIds] = useState<Set<string>>(new Set());
    const [searchQuery, setSearchQuery] = useState('');

    // Message State
    const [title, setTitle] = useState('');
    const [body, setBody] = useState('');
    const [targetUrl, setTargetUrl] = useState('/#/posts');

    const [isSending, setIsSending] = useState(false);
    const [result, setResult] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const isSuperAdmin = adminData?.role === 'superadmin';

    useEffect(() => {
        if (isSuperAdmin) {
            getOrganizations().then(orgs => setOrganizations(orgs.sort((a,b) => a.name.localeCompare(b.name))));
        } else if (selectedOrgId) {
            setTargetOrgId(selectedOrgId);
        }
    }, [isSuperAdmin, selectedOrgId]);

    useEffect(() => {
        if (targetOrgId) {
            getAllCampaigns(targetOrgId).then(camps => setCampaigns(camps.sort((a,b) => a.name.localeCompare(b.name))));
        }
    }, [targetOrgId]);

    const fetchPromoters = useCallback(async () => {
        if (!targetOrgId) return;
        setIsLoadingData(true);
        try {
            const { getAllPromoters } = await import('../services/promoterService');
            const fetched = await getAllPromoters({
                organizationId: targetOrgId,
                filterOrgId: targetOrgId,
                filterState: 'all',
                selectedCampaign: targetCampaignName,
                status: 'approved',
            });
            // Filtra apenas quem tem token
            const withToken = fetched.filter(p => !!p.fcmToken);
            setPromoters(withToken);
            setSelectedPromoterIds(new Set(withToken.map(p => p.id)));
        } catch (err) {
            setError("Erro ao buscar divulgadoras.");
        } finally {
            setIsLoadingData(false);
        }
    }, [targetOrgId, targetCampaignName]);

    useEffect(() => {
        fetchPromoters();
    }, [fetchPromoters]);

    const filteredPromoters = useMemo(() => {
        return promoters.filter(p => {
            // Correção da lógica de plataforma:
            // 1. Se p.platform existe, deve bater com a aba.
            // 2. Se p.platform NÃO existe (registros antigos), vamos assumir Android por ser a maioria dos casos antigos.
            const pPlatform = p.platform || 'android'; 
            const matchesPlatform = pPlatform === activePlatformTab;
            const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
            return matchesPlatform && matchesSearch;
        });
    }, [promoters, activePlatformTab, searchQuery]);

    const handleSend = async () => {
        if (!title || !body || selectedPromoterIds.size === 0) {
            setError("Preencha todos os campos e selecione ao menos uma divulgadora.");
            return;
        }

        const idsToNotify = (Array.from(selectedPromoterIds) as string[]).filter((id: string) => 
            filteredPromoters.some(p => p.id === id)
        );

        if (idsToNotify.length === 0) {
            setError("Nenhuma divulgadora selecionada na plataforma atual.");
            return;
        }

        if (!window.confirm(`Enviar notificação para ${idsToNotify.length} dispositivos ${activePlatformTab.toUpperCase()}?`)) return;

        setIsSending(true);
        setResult(null);
        setError(null);

        try {
            const res = await sendPushCampaign({
                title,
                body,
                url: targetUrl,
                promoterIds: idsToNotify,
                organizationId: targetOrgId
            });
            setResult(res.message);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsSending(false);
        }
    };

    const handleCopyToken = (token: string) => {
        navigator.clipboard.writeText(token);
        alert("Token copiado!");
    };

    return (
        <div className="max-w-6xl mx-auto">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold flex items-center gap-3">
                    <FaceIdIcon className="w-8 h-8 text-primary" />
                    Central de Notificações Push
                </h1>
                <button onClick={() => navigate(-1)} className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-500 text-sm">
                    <ArrowLeftIcon className="w-4 h-4" /> Voltar
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Coluna 1: Audiência e Lista de Dispositivos */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-secondary p-6 rounded-lg shadow-lg border border-gray-700">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-xl font-bold text-white">1. Selecionar Dispositivos</h2>
                            <div className="flex bg-dark p-1 rounded-lg">
                                <button 
                                    onClick={() => setActivePlatformTab('ios')}
                                    className={`px-4 py-1.5 text-sm font-bold rounded-md flex items-center gap-2 transition-all ${activePlatformTab === 'ios' ? 'bg-primary text-white' : 'text-gray-400 hover:text-white'}`}
                                >
                                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.1 2.48-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .76-3.27.82-1.31.05-2.31-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.24-1.99 1.1-3.15-1.03.04-2.28.67-3.02 1.52-.66.76-1.23 1.93-1.07 3.08 1.13.08 2.25-.63 2.99-1.45z"/></svg>
                                    iPhone
                                </button>
                                <button 
                                    onClick={() => setActivePlatformTab('android')}
                                    className={`px-4 py-1.5 text-sm font-bold rounded-md flex items-center gap-2 transition-all ${activePlatformTab === 'android' ? 'bg-green-600 text-white' : 'text-gray-400 hover:text-white'}`}
                                >
                                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M17.523 15.3414C18.423 15.3414 19.166 14.5984 19.166 13.6984C19.166 12.7984 18.423 12.0554 17.523 12.0554C16.623 12.0554 15.88 12.7984 15.88 13.6984C15.88 14.5984 16.623 15.3414 17.523 15.3414ZM17.523 12.9264C17.949 12.9264 18.295 13.2724 18.295 13.6984C18.295 14.1244 17.949 14.4704 17.523 14.4704C17.097 14.4704 16.751 14.1244 16.751 13.6984C16.751 13.2724 17.097 12.9264 17.523 12.9264Z" /></svg>
                                    Android
                                </button>
                            </div>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-4 mb-4">
                            <input 
                                type="text" 
                                placeholder="Buscar por nome..." 
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                className="flex-grow bg-dark border border-gray-600 rounded px-3 py-2 text-sm text-white"
                            />
                            {isSuperAdmin && (
                                <select value={targetOrgId} onChange={e => setTargetOrgId(e.target.value)} className="bg-dark border border-gray-600 rounded px-3 py-2 text-sm text-white min-w-[200px]">
                                    <option value="">Filtrar Organização...</option>
                                    {organizations.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                                </select>
                            )}
                        </div>

                        <div className="overflow-x-auto border border-gray-700 rounded-lg">
                            <table className="min-w-full divide-y divide-gray-700">
                                <thead className="bg-dark">
                                    <tr>
                                        <th className="px-4 py-3 text-left w-10">
                                            <input 
                                                type="checkbox" 
                                                checked={filteredPromoters.length > 0 && filteredPromoters.every(p => selectedPromoterIds.has(p.id))}
                                                onChange={(e) => {
                                                    const newSet = new Set(selectedPromoterIds);
                                                    filteredPromoters.forEach(p => e.target.checked ? newSet.add(p.id) : newSet.delete(p.id));
                                                    setSelectedPromoterIds(newSet);
                                                }}
                                                className="rounded border-gray-600 text-primary focus:ring-primary"
                                            />
                                        </th>
                                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase">Divulgadora</th>
                                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase">Plataforma</th>
                                        <th className="px-4 py-3 text-right text-xs font-bold text-gray-400 uppercase">Ações</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-700 bg-gray-800/30">
                                    {isLoadingData ? (
                                        <tr><td colSpan={4} className="text-center py-8 text-gray-500">Carregando...</td></tr>
                                    ) : filteredPromoters.length === 0 ? (
                                        <tr><td colSpan={4} className="text-center py-8 text-gray-500">Nenhum dispositivo encontrado nesta aba.</td></tr>
                                    ) : (
                                        filteredPromoters.map(p => (
                                            <tr key={p.id} className="hover:bg-gray-700/30 transition-colors">
                                                <td className="px-4 py-3">
                                                    <input 
                                                        type="checkbox" 
                                                        checked={selectedPromoterIds.has(p.id)}
                                                        onChange={() => {
                                                            const n = new Set(selectedPromoterIds);
                                                            if (n.has(p.id)) n.delete(p.id); else n.add(p.id);
                                                            setSelectedPromoterIds(n);
                                                        }}
                                                        className="rounded border-gray-600 text-primary focus:ring-primary"
                                                    />
                                                </td>
                                                <td className="px-4 py-3">
                                                    <p className="text-sm font-bold text-white">{p.name}</p>
                                                    <p className="text-xs text-gray-500">{p.campaignName || 'Geral'}</p>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${p.platform === 'ios' ? 'bg-white text-black' : 'bg-green-600 text-white'}`}>
                                                        {p.platform || 'android'}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    <div className="flex justify-end gap-2">
                                                        <button onClick={() => handleCopyToken(p.fcmToken!)} className="text-[10px] text-primary hover:underline font-bold uppercase">Token</button>
                                                        <a href={`https://instagram.com/${p.instagram?.replace('@', '')}`} target="_blank" className="text-gray-500 hover:text-pink-500"><InstagramIcon className="w-4 h-4" /></a>
                                                        <a href={`https://wa.me/55${p.whatsapp?.replace(/\D/g, '')}`} target="_blank" className="text-gray-500 hover:text-green-500"><WhatsAppIcon className="w-4 h-4" /></a>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                {/* Coluna 2: Formulário da Mensagem */}
                <div className="lg:col-span-1 space-y-6">
                    <div className="bg-secondary p-6 rounded-lg shadow-lg border border-gray-700 space-y-4">
                        <h2 className="text-xl font-bold text-white border-b border-gray-700 pb-2">2. Criar Notificação</h2>
                        
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Título</label>
                            <input 
                                type="text" 
                                placeholder="Ex: Nova tarefa liberada! 🚀" 
                                value={title} 
                                onChange={e => setTitle(e.target.value)} 
                                className="w-full bg-dark border border-gray-600 rounded px-3 py-2 text-white font-bold focus:ring-1 focus:ring-primary outline-none" 
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Conteúdo da Mensagem</label>
                            <textarea 
                                placeholder="Olá, você tem uma nova postagem aguardando..." 
                                value={body} 
                                onChange={e => setBody(e.target.value)} 
                                className="w-full h-32 bg-dark border border-gray-600 rounded px-3 py-2 text-white text-sm focus:ring-1 focus:ring-primary outline-none" 
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Redirecionar para:</label>
                            <select value={targetUrl} onChange={e => setTargetUrl(e.target.value)} className="w-full bg-dark border border-gray-600 rounded px-3 py-2 text-white text-sm">
                                <option value="/#/posts">Página de Postagens (Minhas Tarefas)</option>
                                <option value="/#/status">Minha Conta (Status)</option>
                                <option value="/#/connect">Conexão Divulgadoras</option>
                            </select>
                        </div>

                        <div className="pt-4 space-y-3">
                            <div className="bg-blue-900/10 p-3 rounded border border-blue-900/30">
                                <p className="text-xs text-blue-400 font-medium">Plataforma Alvo: <strong className="uppercase">{activePlatformTab}</strong></p>
                                <p className="text-xs text-gray-500 mt-1">Selecionados: {selectedPromoterIds.size} aparelhos</p>
                            </div>

                            {error && <p className="text-red-400 text-sm font-bold animate-pulse">{error}</p>}
                            {result && <p className="text-green-400 text-sm font-bold">{result}</p>}

                            <button 
                                onClick={handleSend} 
                                disabled={isSending || selectedPromoterIds.size === 0} 
                                className={`w-full py-4 rounded-xl font-black text-lg shadow-lg flex items-center justify-center gap-3 transition-all transform active:scale-95 ${activePlatformTab === 'ios' ? 'bg-primary hover:bg-primary-dark' : 'bg-green-600 hover:bg-green-700'} text-white disabled:opacity-30`}
                            >
                                {isSending ? (
                                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
                                ) : (
                                    <>
                                        <span>Disparar Push</span>
                                        <FaceIdIcon className="w-6 h-6" />
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AdminPushCampaignPage;
