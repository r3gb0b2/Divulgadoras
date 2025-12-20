
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { getOrganizations } from '../services/organizationService';
import { deletePushToken } from '../services/promoterService';
import { sendPushCampaign } from '../services/messageService';
import { Organization, Promoter } from '../types';
import { ArrowLeftIcon, FaceIdIcon, AlertTriangleIcon, DocumentDuplicateIcon, TrashIcon, SearchIcon, CheckCircleIcon, CogIcon } from '../components/Icons';

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
    
    const [isSending, setIsSending] = useState(false);
    const [isDeletingToken, setIsDeletingToken] = useState<string | null>(null);
    const [result, setResult] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [debugError, setDebugError] = useState<string | null>(null);
    const [showTroubleshoot, setShowTroubleshoot] = useState(false);

    const isSuperAdmin = adminData?.role === 'superadmin';

    useEffect(() => {
        if (isSuperAdmin) {
            getOrganizations().then(orgs => setOrganizations(orgs.sort((a,b) => a.name.localeCompare(b.name))));
        } else if (selectedOrgId) {
            setTargetOrgId(selectedOrgId);
        }
    }, [isSuperAdmin, selectedOrgId]);

    const fetchPromoters = useCallback(async () => {
        if (!targetOrgId) return;
        setIsLoadingData(true);
        try {
            const { getAllPromoters } = await import('../services/promoterService');
            const fetched = await getAllPromoters({
                organizationId: targetOrgId,
                filterOrgId: targetOrgId,
                filterState: 'all',
                selectedCampaign: 'all',
                status: 'approved',
            });
            const withToken = fetched.filter(p => !!p.fcmToken);
            setPromoters(withToken);
            setSelectedPromoterIds(new Set(withToken.map(p => p.id)));
        } catch (err) {
            setError("Erro ao buscar dispositivos.");
        } finally {
            setIsLoadingData(false);
        }
    }, [targetOrgId]);

    useEffect(() => {
        fetchPromoters();
    }, [fetchPromoters]);

    const filteredPromoters = useMemo(() => {
        return promoters.filter(p => {
            const matchesPlatform = (p.platform || 'ios') === activePlatformTab;
            const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
            return matchesPlatform && matchesSearch;
        });
    }, [promoters, activePlatformTab, searchQuery]);

    const handleCopyToken = (token: string) => {
        if (!token) return;
        navigator.clipboard.writeText(token).then(() => {
            alert("Token copiado!");
        });
    };

    const handleDeleteToken = async (promoterId: string) => {
        if (!window.confirm("Isso removerá o token atual do banco. A divulgadora precisará abrir o App novamente para gerar um novo token.")) return;
        
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
        if (!title || !body || selectedPromoterIds.size === 0) {
            setError("Preencha todos os campos.");
            return;
        }

        const idsToSend: string[] = [...selectedPromoterIds].filter(id => 
            filteredPromoters.some(p => p.id === id)
        );

        setIsSending(true);
        setResult(null);
        setError(null);
        setDebugError(null);

        try {
            const res = await sendPushCampaign({
                title,
                body,
                url: '/#/posts',
                promoterIds: idsToSend,
                organizationId: targetOrgId
            });
            
            if (res.success) {
                setResult(res.message);
                setTitle('');
                setBody('');
            } else {
                setError(res.message);
                if (res.message.includes("tokens nativos Apple")) {
                    setDebugError("Diagnóstico: O App está enviando o token APNs ao invés do token FCM. Isso geralmente indica falta do arquivo de configuração ou erro na chave .p8 no Console do Firebase.");
                }
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsSending(false);
        }
    };

    return (
        <div className="max-w-6xl mx-auto">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold flex items-center gap-3">
                    <FaceIdIcon className="w-8 h-8 text-primary" />
                    Central de Mensagens Push
                </h1>
                <button onClick={() => navigate(-1)} className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-500 text-sm">
                    <ArrowLeftIcon className="w-4 h-4" /> Voltar
                </button>
            </div>

            {/* Troubleshooting Section - Agora focado em Capabilities e Firebase Console */}
            <div className="mb-6">
                <button 
                    onClick={() => setShowTroubleshoot(!showTroubleshoot)}
                    className="flex items-center gap-2 text-indigo-400 font-bold hover:text-indigo-300 transition-colors bg-indigo-900/20 px-4 py-2 rounded-lg border border-indigo-500/30"
                >
                    <CogIcon className="w-5 h-5" />
                    {showTroubleshoot ? 'Fechar Guia de Configuração' : 'O Target está marcado mas o Push não chega? Clique aqui'}
                </button>
                
                {showTroubleshoot && (
                    <div className="mt-4 bg-indigo-900/30 border border-indigo-500/50 p-6 rounded-xl animate-fadeIn">
                        <h3 className="text-lg font-bold text-white mb-4">Checklist Final de Push (iOS)</h3>
                        <div className="space-y-6 text-sm text-gray-300">
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="bg-black/40 p-4 rounded-lg border-l-4 border-primary">
                                    <p className="font-bold text-white mb-2">1. Xcode: Habilitar Capacidades</p>
                                    <p>No Xcode, clique no ícone azul do projeto (topo da lista esquerda):</p>
                                    <ol className="mt-2 ml-4 list-decimal space-y-1">
                                        <li>Vá na aba <strong className="text-white">"Signing & Capabilities"</strong>.</li>
                                        <li>Clique em <strong className="text-white">"+ Capability"</strong>.</li>
                                        <li>Adicione <strong className="text-green-400">Push Notifications</strong>.</li>
                                        <li>Adicione <strong className="text-green-400">Background Modes</strong> e marque a caixa <strong className="text-white">"Remote notifications"</strong>.</li>
                                    </ol>
                                </div>

                                <div className="bg-black/40 p-4 rounded-lg border-l-4 border-green-500">
                                    <p className="font-bold text-white mb-2">2. Firebase Console: Chave APNs</p>
                                    <p>Sem isso, o Firebase não tem "permissão" da Apple para enviar o Push:</p>
                                    <ol className="mt-2 ml-4 list-decimal space-y-1">
                                        <li>No Apple Developer, gere uma chave <strong className="text-white">Push (.p8)</strong>.</li>
                                        <li>No <strong className="text-white">Firebase Console</strong> -> Configurações do Projeto -> Cloud Messaging.</li>
                                        <li>Em "Configuração do App iOS", faça o upload dessa chave .p8.</li>
                                        <li>Certifique-se de que o <strong className="text-white">Bundle ID</strong> no Firebase é IGUAL ao do Xcode.</li>
                                    </ol>
                                </div>
                            </div>

                            <div className="bg-yellow-900/20 p-4 rounded-lg border border-yellow-500/30">
                                <p className="font-bold text-yellow-300 mb-1">Como testar a correção?</p>
                                <p>Delete o token da divulgadora na tabela abaixo. Peça para ela fechar o App totalmente e abrir de novo. Se o token gerado tiver <strong className="text-white">centenas de caracteres</strong>, as notificações agora funcionarão!</p>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-secondary p-6 rounded-xl shadow-lg border border-gray-700">
                        <div className="flex flex-col sm:flex-row items-center justify-between mb-6 gap-4">
                            <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                <SearchIcon className="w-5 h-5 text-gray-400" />
                                1. Dispositivos Identificados
                            </h2>
                            <div className="flex bg-dark p-1 rounded-lg border border-gray-700">
                                <button onClick={() => setActivePlatformTab('ios')} className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${activePlatformTab === 'ios' ? 'bg-primary text-white' : 'text-gray-400 hover:text-white'}`}>iPhone (iOS)</button>
                                <button onClick={() => setActivePlatformTab('android')} className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${activePlatformTab === 'android' ? 'bg-green-600 text-white' : 'text-gray-400 hover:text-white'}`}>Android</button>
                            </div>
                        </div>

                        <div className="overflow-x-auto border border-gray-700 rounded-lg">
                            <table className="min-w-full divide-y divide-gray-700">
                                <thead className="bg-dark">
                                    <tr>
                                        <th className="px-4 py-3 text-left w-10">
                                            <input type="checkbox" checked={filteredPromoters.length > 0 && filteredPromoters.every(p => selectedPromoterIds.has(p.id))} onChange={(e) => {
                                                const newSet = new Set(selectedPromoterIds);
                                                filteredPromoters.forEach(p => e.target.checked ? newSet.add(p.id) : newSet.delete(p.id));
                                                setSelectedPromoterIds(newSet);
                                            }} className="rounded border-gray-600 text-primary focus:ring-primary" />
                                        </th>
                                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Divulgadora</th>
                                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Diagnóstico</th>
                                        <th className="px-4 py-3 text-right text-xs font-bold text-gray-400 uppercase tracking-wider">Ações</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-700 bg-gray-800/20">
                                    {isLoadingData ? (
                                        <tr><td colSpan={4} className="text-center py-8 text-gray-500">Buscando...</td></tr>
                                    ) : filteredPromoters.length === 0 ? (
                                        <tr><td colSpan={4} className="text-center py-12 text-gray-500">Nenhum dispositivo encontrado nesta aba.</td></tr>
                                    ) : (
                                        filteredPromoters.map(p => {
                                            const isAPNs = p.fcmToken?.length === 64;
                                            return (
                                                <tr key={p.id} className={`hover:bg-gray-700/30 transition-colors ${isAPNs ? 'bg-red-900/10' : ''}`}>
                                                    <td className="px-4 py-3">
                                                        <input type="checkbox" checked={selectedPromoterIds.has(p.id)} onChange={() => {
                                                            const n = new Set(selectedPromoterIds);
                                                            if (n.has(p.id)) n.delete(p.id); else n.add(p.id);
                                                            setSelectedPromoterIds(n);
                                                        }} className="rounded border-gray-600 text-primary focus:ring-primary" />
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <p className="text-sm font-bold text-white">{p.name}</p>
                                                        <p className="text-[10px] text-gray-500 uppercase">{p.campaignName || 'Geral'}</p>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        {isAPNs ? (
                                                            <div className="flex flex-col">
                                                                <span className="text-[10px] bg-red-600 text-white px-2 py-0.5 rounded-full font-black w-fit animate-pulse">INVÁLIDO (APNs)</span>
                                                                <span className="text-[9px] text-red-400 mt-1 italic">64 chars. Firebase ignorado.</span>
                                                            </div>
                                                        ) : (
                                                            <div className="flex flex-col">
                                                                <span className="text-[10px] bg-green-600 text-white px-2 py-0.5 rounded-full font-black w-fit">VÁLIDO (FCM)</span>
                                                                <span className="text-[9px] text-green-400 mt-1">{p.fcmToken?.length} caracteres</span>
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3 text-right">
                                                        <div className="flex justify-end gap-2">
                                                            <button onClick={() => handleCopyToken(p.fcmToken || '')} className="p-2 bg-gray-700 text-gray-300 rounded hover:bg-gray-600" title="Copiar Token"><DocumentDuplicateIcon className="w-4 h-4" /></button>
                                                            <button onClick={() => handleDeleteToken(p.id)} disabled={isDeletingToken === p.id} className="p-2 bg-red-900/30 text-red-400 rounded hover:bg-red-900/50" title="Excluir Token"><TrashIcon className="w-4 h-4" /></button>
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
                        <h2 className="text-xl font-bold text-white border-b border-gray-700 pb-3 mb-4">2. Enviar Push</h2>
                        <div className="space-y-4">
                            <input type="text" placeholder="Título" value={title} onChange={e => setTitle(e.target.value)} className="w-full bg-dark border border-gray-700 rounded-lg px-3 py-2 text-white font-bold" />
                            <textarea placeholder="Mensagem..." value={body} onChange={e => setBody(e.target.value)} className="w-full h-32 bg-dark border border-gray-700 rounded-lg px-3 py-2 text-white text-sm resize-none" />
                        </div>

                        <div className="mt-6 pt-4 border-t border-gray-700">
                            {error && (
                                <div className="p-3 bg-red-900/30 border border-red-800 rounded-lg mb-4">
                                    <div className="flex items-center gap-2 text-red-400 text-xs font-bold mb-1">
                                        <AlertTriangleIcon className="w-4 h-4"/> ERRO NO ENVIO
                                    </div>
                                    <p className="text-red-300 text-[11px] leading-relaxed italic">{error}</p>
                                </div>
                            )}
                            {debugError && (
                                <div className="p-2 bg-indigo-900/20 border border-indigo-500/30 rounded mb-4">
                                    <p className="text-indigo-300 text-[10px] leading-tight italic">{debugError}</p>
                                </div>
                            )}
                            {result && (
                                <div className="p-3 bg-green-900/30 border border-green-800 rounded-lg mb-4 text-center">
                                    <p className="text-green-400 text-xs font-bold">🎉 {result}</p>
                                </div>
                            )}

                            <button onClick={handleSend} disabled={isSending || selectedPromoterIds.size === 0} className="w-full py-4 bg-primary hover:bg-primary-dark text-white rounded-xl font-black text-lg shadow-xl flex items-center justify-center gap-3 transition-all disabled:opacity-30">
                                {isSending ? (
                                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
                                ) : (
                                    'ENVIAR AGORA'
                                )}
                            </button>
                            <p className="text-[10px] text-gray-500 text-center mt-3 uppercase font-bold">
                                Selecionados: {selectedPromoterIds.size}
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AdminPushCampaignPage;
