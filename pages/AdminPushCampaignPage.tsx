
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { getOrganizations } from '../services/organizationService';
import { deletePushToken } from '../services/promoterService';
import { sendPushCampaign } from '../services/messageService';
import { Organization, Promoter } from '../types';
import { ArrowLeftIcon, FaceIdIcon, SearchIcon, TrashIcon, DocumentDuplicateIcon, RefreshIcon, CheckCircleIcon, XIcon } from '../components/Icons';

const AdminPushCampaignPage: React.FC = () => {
    const navigate = useNavigate();
    const { adminData, selectedOrgId } = useAdminAuth();
    
    const [organizations, setOrganizations] = useState<Organization[]>([]);
    const [promoters, setPromoters] = useState<Promoter[]>([]);
    const [isLoadingData, setIsLoadingData] = useState(true);

    const [targetOrgId, setTargetOrgId] = useState('');
    const [activePlatformTab, setActivePlatformTab] = useState<'ios' | 'android' | 'web'>('ios');
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

    useEffect(() => {
        if (isSuperAdmin) {
            getOrganizations().then(orgs => setOrganizations(orgs.sort((a,b) => a.name.localeCompare(b.name))));
        } else if (selectedOrgId) {
            setTargetOrgId(selectedOrgId);
        }
    }, [isSuperAdmin, selectedOrgId]);

    const fetchPromoters = useCallback(async () => {
        const orgId = isSuperAdmin ? targetOrgId : selectedOrgId;
        if (!orgId) return;

        setIsLoadingData(true);
        try {
            const { getAllPromoters } = await import('../services/promoterService');
            // Buscamos apenas quem é aprovado para facilitar
            const fetched = await getAllPromoters({
                organizationId: orgId,
                filterOrgId: orgId,
                filterState: 'all',
                selectedCampaign: 'all',
                status: 'approved',
            });
            
            // Filtramos apenas quem tem token para esta tela ser focada em "dispositivos ativos"
            const withToken = fetched.filter(p => !!p.fcmToken);
            setPromoters(withToken);
            setSelectedPromoterIds(new Set()); 
        } catch (err) {
            setError("Erro ao buscar dispositivos.");
        } finally {
            setIsLoadingData(false);
        }
    }, [isSuperAdmin, targetOrgId, selectedOrgId]);

    useEffect(() => {
        fetchPromoters();
    }, [fetchPromoters]);

    const filteredPromoters = useMemo(() => {
        return promoters.filter(p => {
            const platform = (p.pushDiagnostics?.platform || 'ios').toLowerCase();
            const matchesPlatform = platform === activePlatformTab;
            const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
            return matchesPlatform && matchesSearch;
        });
    }, [promoters, activePlatformTab, searchQuery]);

    const stats = useMemo(() => {
        return {
            ios: promoters.filter(p => (p.pushDiagnostics?.platform || 'ios').toLowerCase() === 'ios').length,
            android: promoters.filter(p => (p.pushDiagnostics?.platform || '').toLowerCase() === 'android').length,
        };
    }, [promoters]);

    const handleDeleteToken = async (promoterId: string) => {
        if (!window.confirm("Tem certeza que deseja desvincular este dispositivo? A divulgadora precisará abrir o app novamente para registrar um novo token.")) return;
        
        setIsDeletingToken(promoterId);
        try {
            await deletePushToken(promoterId);
            setPromoters(prev => prev.filter(p => p.id !== promoterId));
            setSelectedPromoterIds(prev => {
                const n = new Set(prev);
                n.delete(promoterId);
                return n;
            });
        } catch (e: any) {
            alert("Erro: " + e.message);
        } finally {
            setIsDeletingToken(null);
        }
    };

    const handleSend = async () => {
        if (!title || !body || selectedPromoterIds.size === 0) {
            setError("Preencha título, mensagem e selecione pelo menos um destino.");
            return;
        }

        setIsSending(true);
        setResult(null);
        setError(null);
        try {
            const res = await sendPushCampaign({
                title,
                body,
                url: targetUrl,
                promoterIds: Array.from(selectedPromoterIds),
                organizationId: targetOrgId || (selectedOrgId || '')
            });
            if (res.success) {
                setResult(res.message);
                setTitle('');
                setBody('');
                setSelectedPromoterIds(new Set());
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
                
                {/* Coluna Esquerda: Listagem e Gerenciamento */}
                <div className="lg:col-span-2 space-y-6">
                    
                    <div className="bg-secondary p-6 rounded-xl shadow-lg border border-gray-700">
                        <div className="flex flex-col sm:flex-row items-center justify-between mb-6 gap-4">
                            <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                <SearchIcon className="w-5 h-5 text-gray-400" />
                                Dispositivos Vinculados
                            </h2>
                            <div className="flex bg-dark p-1 rounded-lg border border-gray-700">
                                <button onClick={() => setActivePlatformTab('ios')} className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${activePlatformTab === 'ios' ? 'bg-primary text-white' : 'text-gray-400 hover:text-white'}`}>iOS ({stats.ios})</button>
                                <button onClick={() => setActivePlatformTab('android')} className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${activePlatformTab === 'android' ? 'bg-green-600 text-white' : 'text-gray-400 hover:text-white'}`}>Android ({stats.android})</button>
                            </div>
                        </div>

                        <div className="mb-4">
                            <input 
                                type="text" 
                                placeholder="Filtrar por nome..." 
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                className="w-full bg-dark border border-gray-700 rounded-lg px-4 py-2 text-sm text-white focus:ring-1 focus:ring-primary outline-none"
                            />
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
                                                className="rounded border-gray-600 text-primary" 
                                            />
                                        </th>
                                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase">Divulgadora</th>
                                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase">Vínculo</th>
                                        <th className="px-4 py-3 text-right text-xs font-bold text-gray-400 uppercase">Ações</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-700 bg-gray-800/20">
                                    {isLoadingData ? (
                                        <tr><td colSpan={4} className="text-center py-8 text-gray-500 italic">Buscando...</td></tr>
                                    ) : filteredPromoters.length === 0 ? (
                                        <tr><td colSpan={4} className="text-center py-12 text-gray-500">Nenhum dispositivo encontrado para esta plataforma.</td></tr>
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
                                                        className="rounded border-gray-600 text-primary" 
                                                    />
                                                </td>
                                                <td className="px-4 py-3">
                                                    <p className="text-sm font-bold text-white">{p.name}</p>
                                                    <p className="text-xs text-gray-500">{p.instagram}</p>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="flex flex-col">
                                                        <span className="text-[10px] bg-green-900/30 text-green-400 px-2 py-0.5 rounded-full font-bold w-fit flex items-center gap-1">
                                                            <CheckCircleIcon className="w-3 h-3" /> Token OK
                                                        </span>
                                                        <span className="text-[9px] text-gray-500 mt-1 italic">Atualizado: {p.lastTokenUpdate ? new Date((p.lastTokenUpdate as any).seconds * 1000).toLocaleDateString() : 'N/A'}</span>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    <div className="flex justify-end gap-2">
                                                        <button 
                                                            onClick={() => handleDeleteToken(p.id)} 
                                                            disabled={isDeletingToken === p.id} 
                                                            className="p-2 bg-red-900/20 text-red-400 rounded hover:bg-red-900/40 transition-all disabled:opacity-50" 
                                                            title="Desvincular Dispositivo"
                                                        >
                                                            {isDeletingToken === p.id ? <RefreshIcon className="w-4 h-4 animate-spin" /> : <TrashIcon className="w-4 h-4" />}
                                                        </button>
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

                {/* Coluna Direita: Criação do Alerta */}
                <div className="lg:col-span-1 space-y-6">
                    <div className="bg-secondary p-6 rounded-xl shadow-lg border border-gray-700 sticky top-24">
                        <h2 className="text-xl font-bold text-white border-b border-gray-700 pb-3 mb-4">Nova Campanha</h2>
                        
                        {isSuperAdmin && (
                            <div className="mb-4">
                                <label className="block text-xs font-bold text-gray-400 mb-1 uppercase tracking-widest">Organização</label>
                                <select value={targetOrgId} onChange={e => setTargetOrgId(e.target.value)} className="w-full bg-dark border border-gray-700 rounded-lg p-2 text-sm text-white">
                                    <option value="">Selecione...</option>
                                    {organizations.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                                </select>
                            </div>
                        )}

                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-400 mb-1 uppercase tracking-widest">Título</label>
                                <input 
                                    type="text" 
                                    placeholder="Ex: Novo Post Disponível!" 
                                    value={title} 
                                    onChange={e => setTitle(e.target.value)} 
                                    className="w-full bg-dark border border-gray-700 rounded-lg px-3 py-2 text-white font-bold focus:ring-1 focus:ring-primary outline-none" 
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-400 mb-1 uppercase tracking-widest">Mensagem</label>
                                <textarea 
                                    placeholder="Escreva algo curto e atrativo..." 
                                    value={body} 
                                    onChange={e => setBody(e.target.value)} 
                                    className="w-full h-24 bg-dark border border-gray-700 rounded-lg px-3 py-2 text-white text-sm resize-none focus:ring-1 focus:ring-primary outline-none" 
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-400 mb-1 uppercase tracking-widest">Ação ao Abrir (Caminho)</label>
                                <input 
                                    type="text" 
                                    placeholder="Ex: /#/posts" 
                                    value={targetUrl} 
                                    onChange={e => setTargetUrl(e.target.value)} 
                                    className="w-full bg-dark border border-gray-700 rounded-lg px-3 py-2 text-white text-xs font-mono focus:ring-1 focus:ring-primary outline-none" 
                                />
                                <div className="mt-2 flex flex-wrap gap-1">
                                    <button onClick={() => setTargetUrl('/#/posts')} className="text-[10px] bg-gray-700 hover:bg-gray-600 px-2 py-0.5 rounded text-gray-300">Tarefas</button>
                                    <button onClick={() => setTargetUrl('/#/status')} className="text-[10px] bg-gray-700 hover:bg-gray-600 px-2 py-0.5 rounded text-gray-300">Status</button>
                                    <button onClick={() => setTargetUrl('/#/connect')} className="text-[10px] bg-gray-700 hover:bg-gray-600 px-2 py-0.5 rounded text-gray-300">Seguidores</button>
                                </div>
                            </div>
                        </div>

                        <div className="mt-8 pt-4 border-t border-gray-700">
                            {error && <div className="p-3 bg-red-900/30 border border-red-800 rounded-lg mb-4 text-red-300 text-xs font-bold italic">{error}</div>}
                            {result && <div className="p-3 bg-green-900/30 border border-green-800 rounded-lg mb-4 text-green-400 text-xs text-center font-bold">🎉 {result}</div>}

                            <button 
                                onClick={handleSend} 
                                disabled={isSending || selectedPromoterIds.size === 0} 
                                className="w-full py-4 bg-primary hover:bg-primary-dark text-white rounded-xl font-black text-lg shadow-xl shadow-primary/20 flex items-center justify-center gap-3 transition-all disabled:opacity-30 disabled:grayscale"
                            >
                                {isSending ? <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div> : 'DISPARAR AGORA'}
                            </button>
                            <p className="text-[10px] text-gray-500 text-center mt-3 uppercase font-bold tracking-widest">Selecionados: {selectedPromoterIds.size}</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AdminPushCampaignPage;
