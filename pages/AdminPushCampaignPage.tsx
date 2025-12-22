
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { getOrganizations } from '../services/organizationService';
import { deletePushToken } from '../services/promoterService';
import { sendPushCampaign } from '../services/messageService';
import { Organization, Promoter } from '../types';
import { ArrowLeftIcon, FaceIdIcon, AlertTriangleIcon, DocumentDuplicateIcon, TrashIcon, CheckCircleIcon, CogIcon, XIcon, RefreshIcon } from '../components/Icons';

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
    const [showBuildFix, setShowBuildFix] = useState(true);

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
            const fetched = await getAllPromoters({
                organizationId: orgId,
                filterOrgId: orgId,
                filterState: 'all',
                selectedCampaign: 'all',
                status: 'approved',
            });
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
            const pForm = (p.pushDiagnostics?.platform || 'ios').toLowerCase();
            const matchesPlatform = pForm === activePlatformTab;
            const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
            return matchesPlatform && matchesSearch;
        });
    }, [promoters, activePlatformTab, searchQuery]);

    const invalidTokens = useMemo(() => {
        return promoters.filter(p => (p.fcmToken?.length || 0) <= 64);
    }, [promoters]);

    const handleCopyToken = (token: string) => {
        navigator.clipboard.writeText(token).then(() => alert("Copiado!"));
    };

    const handleDeleteToken = async (promoterId: string) => {
        if (!window.confirm("Remover este vínculo?")) return;
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

    const handleCleanInvalid = async () => {
        if (!window.confirm(`Deseja apagar os ${invalidTokens.length} tokens curtos (APNs)?`)) return;
        setIsDeletingToken('clean');
        try {
            await Promise.all(invalidTokens.map(p => deletePushToken(p.id)));
            setPromoters(prev => prev.filter(p => (p.fcmToken?.length || 0) > 64));
            alert("Limpeza concluída!");
        } catch (err: any) {
            alert(err.message);
        } finally {
            setIsDeletingToken(null);
        }
    };

    const handleSend = async () => {
        if (!title || !body || selectedPromoterIds.size === 0) {
            setError("Preencha todos os campos e selecione os destinos.");
            return;
        }
        
        setIsSending(true); setResult(null); setError(null);
        try {
            const res = await sendPushCampaign({
                title, body, url: targetUrl,
                promoterIds: Array.from(selectedPromoterIds),
                organizationId: targetOrgId || (selectedOrgId || '')
            });
            if (res.success) {
                setResult(res.message); setTitle(''); setBody('');
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

            {/* GUIA DE REPARO PARA ERRO DE COMPILAÇÃO IOS */}
            <div className="mb-8">
                <div className="bg-indigo-900/20 border-2 border-indigo-500/50 p-6 rounded-2xl shadow-xl">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-black text-indigo-400 flex items-center gap-2 uppercase tracking-wider">
                            <CogIcon className="w-6 h-6 animate-spin-slow" />
                            Correção do Erro 'Cordova/CDVAvailabilityDeprecated.h'
                        </h2>
                        <button onClick={() => setShowBuildFix(!showBuildFix)} className="text-gray-400 hover:text-white">
                            {showBuildFix ? <XIcon className="w-5 h-5" /> : <RefreshIcon className="w-5 h-5" />}
                        </button>
                    </div>

                    {showBuildFix && (
                        <div className="space-y-4 animate-fadeIn">
                            <p className="text-sm text-gray-300 leading-relaxed">
                                Este erro ocorre quando o Capacitor falha ao localizar os cabeçalhos internos do Cordova. 
                                Siga estes passos <strong>exatamente</strong> na ordem abaixo:
                            </p>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="bg-black/40 p-4 rounded-xl border border-gray-700 font-mono text-[11px]">
                                    <p className="text-indigo-400 mb-2 font-bold">1. Resetar Dependências e IOS:</p>
                                    <p className="text-gray-400 mb-1"># Execute na raiz do projeto:</p>
                                    <code className="text-green-400 block break-all">
                                        rm -rf ios node_modules package-lock.json && npm install && npx cap add ios && npx cap sync ios
                                    </code>
                                </div>
                                <div className="bg-black/40 p-4 rounded-xl border border-gray-700 font-mono text-[11px]">
                                    <p className="text-indigo-400 mb-2 font-bold">2. Reinstalar Pods Nativo:</p>
                                    <p className="text-gray-400 mb-1"># Execute estes comandos:</p>
                                    <code className="text-green-400 block">
                                        cd ios/App && pod deintegrate && pod install && cd ../..
                                    </code>
                                </div>
                            </div>

                            <div className="bg-red-900/20 border border-red-900/50 p-4 rounded-xl flex items-start gap-3">
                                <AlertTriangleIcon className="w-6 h-6 text-red-500 flex-shrink-0" />
                                <div>
                                    <p className="text-sm text-red-200 font-bold uppercase">Atenção no Xcode:</p>
                                    <p className="text-sm text-gray-300">
                                        Antes de rodar novamente no Xcode, vá em <strong>Product -> Clean Build Folder</strong>. 
                                        Isso é obrigatório para limpar referências antigas do header que não existe mais.
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-secondary p-6 rounded-xl shadow-lg border border-gray-700">
                        <div className="flex flex-col sm:flex-row items-center justify-between mb-6 gap-4">
                            <h2 className="text-xl font-bold text-white flex items-center gap-2">Dispositivos Vinculados</h2>
                            <div className="flex bg-dark p-1 rounded-lg border border-gray-700">
                                <button onClick={() => setActivePlatformTab('ios')} className={`px-4 py-1.5 text-xs font-bold rounded-md ${activePlatformTab === 'ios' ? 'bg-primary text-white' : 'text-gray-400'}`}>iOS</button>
                                <button onClick={() => setActivePlatformTab('android')} className={`px-4 py-1.5 text-xs font-bold rounded-md ${activePlatformTab === 'android' ? 'bg-green-600 text-white' : 'text-gray-400'}`}>Android</button>
                            </div>
                        </div>

                        <div className="overflow-x-auto border border-gray-700 rounded-lg">
                            <table className="min-w-full divide-y divide-gray-700">
                                <thead className="bg-dark">
                                    <tr>
                                        <th className="px-4 py-3 text-left w-10">
                                            <input type="checkbox" onChange={(e) => {
                                                const newSet = new Set(selectedPromoterIds);
                                                filteredPromoters.forEach(p => e.target.checked ? newSet.add(p.id) : newSet.delete(p.id));
                                                setSelectedPromoterIds(newSet);
                                            }} className="rounded border-gray-600 text-primary" />
                                        </th>
                                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase">Divulgadora</th>
                                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase">Token</th>
                                        <th className="px-4 py-3 text-right text-xs font-bold text-gray-400 uppercase">Ações</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-700 bg-gray-800/20">
                                    {isLoadingData ? (
                                        <tr><td colSpan={4} className="text-center py-8">Buscando...</td></tr>
                                    ) : (
                                        filteredPromoters.map(p => {
                                            const isAPNs = (p.fcmToken?.length || 0) <= 64;
                                            return (
                                                <tr key={p.id} className={`hover:bg-gray-700/30 ${isAPNs ? 'bg-red-900/10' : ''}`}>
                                                    <td className="px-4 py-3">
                                                        <input type="checkbox" checked={selectedPromoterIds.has(p.id)} onChange={() => {
                                                            const n = new Set(selectedPromoterIds);
                                                            if (n.has(p.id)) n.delete(p.id); else n.add(p.id);
                                                            setSelectedPromoterIds(n);
                                                        }} className="rounded border-gray-600 text-primary" />
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <p className="text-sm font-bold text-white">{p.name}</p>
                                                        <p className="text-[10px] text-gray-500 uppercase">{p.campaignName || 'Geral'}</p>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        {isAPNs ? (
                                                            <span className="text-[9px] bg-red-600 text-white px-2 py-0.5 rounded-full font-black">NATIVO (64)</span>
                                                        ) : (
                                                            <span className="text-[9px] bg-green-600 text-white px-2 py-0.5 rounded-full font-black">FCM OK</span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3 text-right">
                                                        <div className="flex justify-end gap-2">
                                                            <button onClick={() => handleCopyToken(p.fcmToken || '')} className="p-2 bg-gray-700 text-gray-300 rounded hover:text-white"><DocumentDuplicateIcon className="w-4 h-4" /></button>
                                                            <button onClick={() => handleDeleteToken(p.id)} disabled={isDeletingToken === p.id} className="p-2 bg-red-900/30 text-red-400 rounded hover:bg-red-900/50"><TrashIcon className="w-4 h-4" /></button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <div className="lg:col-span-1 space-y-6">
                    <div className="bg-secondary p-6 rounded-xl shadow-lg border border-gray-700 sticky top-24">
                        <h2 className="text-xl font-bold text-white mb-4">Nova Notificação</h2>
                        <div className="space-y-4">
                            <input type="text" placeholder="Título" value={title} onChange={e => setTitle(e.target.value)} className="w-full bg-dark border border-gray-700 rounded-lg px-3 py-2 text-white font-bold" />
                            <textarea placeholder="Mensagem..." value={body} onChange={e => setBody(e.target.value)} className="w-full h-32 bg-dark border border-gray-600 rounded-lg px-3 py-2 text-white text-sm" />
                            <input type="text" placeholder="URL (Ex: /#/posts)" value={targetUrl} onChange={e => setTargetUrl(e.target.value)} className="w-full bg-dark border border-gray-700 rounded-lg px-3 py-2 text-white text-xs font-mono" />
                        </div>

                        <div className="mt-6 pt-4 border-t border-gray-700">
                            {error && <div className="p-3 bg-red-900/30 text-red-300 text-xs font-bold mb-4">{error}</div>}
                            {result && <div className="p-3 bg-green-900/30 text-green-400 text-xs text-center font-bold mb-4">{result}</div>}
                            <button onClick={handleSend} disabled={isSending || selectedPromoterIds.size === 0} className="w-full py-4 bg-primary hover:bg-primary-dark text-white rounded-xl font-black text-lg disabled:opacity-30">
                                {isSending ? 'ENVIANDO...' : 'DISPARAR PUSH'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AdminPushCampaignPage;
