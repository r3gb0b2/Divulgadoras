
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { getOrganizations } from '../services/organizationService';
import { deletePushToken } from '../services/promoterService';
import { sendPushCampaign } from '../services/messageService';
import { Organization, Promoter } from '../types';
import { ArrowLeftIcon, FaceIdIcon, AlertTriangleIcon, DocumentDuplicateIcon, TrashIcon, SearchIcon, CheckCircleIcon, DownloadIcon, RefreshIcon, XIcon } from '../components/Icons';

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
    const [showTroubleshoot, setShowTroubleshoot] = useState(false);

    const isSuperAdmin = adminData?.role === 'superadmin';

    // CÓDIGO SWIFT ULTRA-CORRIGIDO:
    // Ele aguarda o Firebase gerar o token STRING antes de notificar o Capacitor.
    const appDelegateCode = `import UIKit
import Capacitor
import FirebaseCore
import FirebaseMessaging

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate, MessagingDelegate, UNUserNotificationCenterDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        FirebaseApp.configure()
        
        Messaging.messaging().delegate = self
        UNUserNotificationCenter.current().delegate = self
        
        UIApplication.shared.registerForRemoteNotifications()
        
        return true
    }

    // didRegisterForRemoteNotifications: O SEGREDO ESTÁ AQUI
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        // 1. Vincula o token físico ao Firebase
        Messaging.messaging().apnsToken = deviceToken
        
        // 2. BUSCA O TOKEN FCM (LONG) E ENVIA PARA O CAPACITOR
        Messaging.messaging().token { token, error in
            if let fcmToken = token {
                print("FCM Token Gerado com Sucesso: \(fcmToken)")
                // ENVIAMOS A STRING (fcmToken) E NÃO O BINÁRIO (deviceToken)
                NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: fcmToken)
            }
        }
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }

    func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) {
        let dataDict: [String: String] = ["token": fcmToken ?? ""]
        NotificationCenter.default.post(name: Notification.Name("FCMToken"), object: nil, userInfo: dataDict)
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification, withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([[.alert, .sound, .badge]])
    }
}`;

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
            const matchesPlatform = (p.platform || 'ios') === activePlatformTab;
            const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
            return matchesPlatform && matchesSearch;
        });
    }, [promoters, activePlatformTab, searchQuery]);

    const invalidTokens = useMemo(() => {
        return promoters.filter(p => (p.fcmToken?.length || 0) === 64);
    }, [promoters]);

    const handleDownloadFile = () => {
        const blob = new Blob([appDelegateCode], { type: 'text/plain' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'AppDelegate.swift';
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    };

    const handleCopyToken = (token: string) => {
        if (!token) return;
        navigator.clipboard.writeText(token).then(() => {
            alert("Token copiado para a área de transferência!");
        }).catch(err => {
            console.error("Erro ao copiar token:", err);
        });
    };

    const handleDeleteToken = async (promoterId: string) => {
        if (!window.confirm("Isso removerá o token atual. Após corrigir no Xcode, peça para a divulgadora abrir o App de novo.")) return;
        
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

    const handleCleanInvalid = async () => {
        if (invalidTokens.length === 0) {
            alert("Nenhum token nativo Apple (64 chars) detectado para limpeza.");
            return;
        }
        if (!window.confirm(`Deseja apagar os ${invalidTokens.length} tokens de 64 caracteres? Eles não funcionam no Firebase. Após apagar, peça para as divulgadoras abrirem o App novamente.`)) return;

        setIsDeletingToken('clean-invalid');
        try {
            const ids = invalidTokens.map(p => p.id);
            await Promise.all(ids.map(id => deletePushToken(id)));
            setPromoters(prev => prev.filter(p => (p.fcmToken?.length || 0) !== 64));
            alert("Limpeza concluída!");
        } catch (err: any) {
            alert("Erro na limpeza: " + err.message);
        } finally {
            setIsDeletingToken(null);
        }
    };

    const handleBulkDelete = async () => {
        if (selectedPromoterIds.size === 0) return;
        if (!window.confirm(`Tem certeza que deseja remover os tokens de ${selectedPromoterIds.size} dispositivos selecionados?`)) return;

        setIsDeletingToken('bulk');
        try {
            const ids: string[] = Array.from(selectedPromoterIds);
            await Promise.all(ids.map(id => deletePushToken(id)));
            setPromoters(prev => prev.filter(p => !selectedPromoterIds.has(p.id)));
            setSelectedPromoterIds(new Set());
            alert("Tokens removidos com sucesso!");
        } catch (e: any) {
            alert("Erro ao remover alguns tokens: " + e.message);
        } finally {
            setIsDeletingToken(null);
        }
    };

    const handleSend = async () => {
        if (!title || !body || selectedPromoterIds.size === 0) {
            setError("Preencha título, mensagem e selecione pelo menos um destino.");
            return;
        }
        
        const hasInvalidSelected = Array.from(selectedPromoterIds).some(id => {
            const p = promoters.find(prom => prom.id === id);
            return p && (p.fcmToken?.length || 0) === 64;
        });

        if (hasInvalidSelected) {
            setError("Erro: Você selecionou dispositivos com Token nativo Apple (64 chars). Delete os tokens vermelhos antes de enviar.");
            return;
        }

        setIsSending(true);
        setResult(null);
        setError(null);
        try {
            const res = await sendPushCampaign({
                title,
                body,
                url: '/#/posts',
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

            {/* TROUBLESHOOTING UI */}
            <div className="mb-8">
                <button 
                    onClick={() => setShowTroubleshoot(!showTroubleshoot)}
                    className="w-full flex items-center justify-between text-left gap-2 text-white font-black bg-red-600 px-6 py-4 rounded-xl shadow-xl hover:bg-red-700 transition-all border-2 border-red-400"
                >
                    <div className="flex items-center gap-3">
                        <AlertTriangleIcon className="w-6 h-6 animate-pulse" />
                        <div>
                            <p className="text-lg">AINDA CONTINUA COM 64 CARACTERES? CLIQUE AQUI</p>
                            <p className="text-xs font-normal opacity-80">O segredo está no envio da String para o Capacitor.</p>
                        </div>
                    </div>
                    <span>{showTroubleshoot ? '▲' : '▼'}</span>
                </button>
                
                {showTroubleshoot && (
                    <div className="mt-4 bg-gray-900 border-2 border-red-500 p-6 rounded-xl animate-fadeIn shadow-2xl">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                            <div className="space-y-4">
                                <h3 className="text-red-400 font-black flex items-center gap-2">
                                    <span className="w-6 h-6 bg-red-400 text-black rounded-full flex items-center justify-center text-xs">1</span>
                                    POR QUE NÃO FUNCIONOU?
                                </h3>
                                <p className="text-sm text-gray-300 leading-relaxed">
                                    O Capacitor por padrão captura o <code className="text-blue-400">deviceToken</code> binário e envia para o JS. O Firebase precisa de tempo para trocar esse token por um FCM longo.
                                </p>
                                <div className="p-4 bg-black/50 rounded-lg border border-red-900/50">
                                    <p className="text-xs font-bold text-red-400 underline mb-2">ERRO COMUM:</p>
                                    <p className="text-[11px] text-gray-400 italic">"Postar a notificação para o Capacitor usando o objeto binário puro faz com que ele salve o token APNs nativo (64 chars) que o Firebase não aceita."</p>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <h3 className="text-red-400 font-black flex items-center gap-2">
                                    <span className="w-6 h-6 bg-red-400 text-black rounded-full flex items-center justify-center text-xs">2</span>
                                    A SOLUÇÃO DEFINITIVA
                                </h3>
                                <p className="text-sm text-gray-300">
                                    Substitua o conteúdo do seu arquivo <code className="text-blue-400">AppDelegate.swift</code> pelo botão abaixo. Ele aguarda a String do Firebase ser gerada antes de avisar o App.
                                </p>
                                <button 
                                    onClick={handleDownloadFile}
                                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-lg font-black text-sm shadow-xl transition-all w-full justify-center"
                                >
                                    <DownloadIcon className="w-5 h-5" />
                                    BAIXAR APPDELEGATE CORRIGIDO V2
                                </button>
                                <div className="mt-2 p-3 bg-indigo-900/20 border border-indigo-500/50 rounded text-[10px] text-indigo-300">
                                    <strong>IMPORTANTE:</strong> Após trocar o arquivo, apague o App do iPhone, instale de novo via Xcode e verifique se o token na tabela abaixo ficou longo.
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-6">
                    {/* FERRAMENTA DE LIMPEZA */}
                    <div className="bg-gray-800 p-5 rounded-xl border border-gray-700 shadow-lg">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-bold text-white flex items-center gap-2">
                                <RefreshIcon className="w-5 h-5 text-primary" />
                                Diagnóstico de Dispositivos
                            </h2>
                            <span className={`text-xs px-3 py-1 rounded-full font-black ${invalidTokens.length > 0 ? 'bg-red-600 text-white animate-pulse' : 'bg-green-900/30 text-green-400'}`}>
                                {invalidTokens.length} Tokens Inválidos (64 chars)
                            </span>
                        </div>
                        <p className="text-xs text-gray-400 mb-4 leading-relaxed">
                            Tokens vermelhos <strong>não recebem push</strong>. Se você já trocou o arquivo no Xcode, use o botão abaixo para limpar a base e peça para as divulgadoras abrirem o app para gerar o token novo e longo.
                        </p>
                        <button 
                            onClick={handleCleanInvalid}
                            disabled={!!isDeletingToken || invalidTokens.length === 0}
                            className="w-full py-3 bg-red-600 hover:bg-red-700 text-white text-sm font-black rounded-lg transition-all disabled:opacity-30"
                        >
                            {isDeletingToken === 'clean-invalid' ? 'Limpando...' : 'LIMPAR TODOS OS TOKENS DE 64 CARACTERES'}
                        </button>
                    </div>

                    <div className="bg-secondary p-6 rounded-xl shadow-lg border border-gray-700">
                        <div className="flex flex-col sm:flex-row items-center justify-between mb-6 gap-4">
                            <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                <SearchIcon className="w-5 h-5 text-gray-400" />
                                Dispositivos Registrados
                            </h2>
                            <div className="flex bg-dark p-1 rounded-lg border border-gray-700">
                                <button onClick={() => setActivePlatformTab('ios')} className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${activePlatformTab === 'ios' ? 'bg-primary text-white' : 'text-gray-400 hover:text-white'}`}>iOS (iPhone)</button>
                                <button onClick={() => setActivePlatformTab('android')} className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${activePlatformTab === 'android' ? 'bg-green-600 text-white' : 'text-gray-400 hover:text-white'}`}>Android</button>
                            </div>
                        </div>

                        {selectedPromoterIds.size > 0 && (
                            <div className="mb-4 p-3 bg-indigo-900/40 border border-indigo-500/50 rounded-lg flex items-center justify-between animate-fadeIn">
                                <span className="text-sm font-bold text-indigo-200">{selectedPromoterIds.size} selecionadas</span>
                                <button 
                                    onClick={handleBulkDelete}
                                    disabled={!!isDeletingToken}
                                    className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-md text-xs font-black transition-all disabled:opacity-50"
                                >
                                    <TrashIcon className="w-4 h-4" />
                                    DELETAR SELECIONADOS
                                </button>
                            </div>
                        )}

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
                                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase">Token</th>
                                        <th className="px-4 py-3 text-right text-xs font-bold text-gray-400 uppercase">Ações</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-700 bg-gray-800/20">
                                    {isLoadingData ? (
                                        <tr><td colSpan={4} className="text-center py-8 text-gray-500">Buscando...</td></tr>
                                    ) : filteredPromoters.length === 0 ? (
                                        <tr><td colSpan={4} className="text-center py-12 text-gray-500">Nenhum dispositivo registrado.</td></tr>
                                    ) : (
                                        filteredPromoters.map(p => {
                                            const isAPNs = (p.fcmToken?.length || 0) === 64;
                                            return (
                                                <tr key={p.id} className={`hover:bg-gray-700/30 ${isAPNs ? 'bg-red-900/10' : ''}`}>
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
                                                        <p className="text-[10px] text-gray-500 uppercase">{p.campaignName || 'Geral'}</p>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        {isAPNs ? (
                                                            <div className="flex flex-col">
                                                                <span className="text-[10px] bg-red-600 text-white px-2 py-0.5 rounded-full font-black w-fit">APNs (64 CHARS)</span>
                                                                <span className="text-[8px] text-red-400 font-mono mt-1">Inválido - Não envia</span>
                                                            </div>
                                                        ) : (
                                                            <div className="flex flex-col">
                                                                <span className="text-[10px] bg-green-600 text-white px-2 py-0.5 rounded-full font-black w-fit">FCM OK</span>
                                                                <span className="text-[8px] text-gray-500 font-mono mt-1">Válido</span>
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3 text-right">
                                                        <div className="flex justify-end gap-2">
                                                            <button 
                                                                onClick={() => handleCopyToken(p.fcmToken || '')} 
                                                                className="p-2 bg-gray-700 text-gray-300 rounded hover:bg-gray-600" 
                                                                title="Copiar Token"
                                                            >
                                                                <DocumentDuplicateIcon className="w-4 h-4" />
                                                            </button>
                                                            <button 
                                                                onClick={() => handleDeleteToken(p.id)} 
                                                                disabled={isDeletingToken === p.id} 
                                                                className="p-2 bg-red-900/30 text-red-400 rounded hover:bg-red-900/50 transition-all disabled:opacity-50" 
                                                                title="Excluir Token"
                                                            >
                                                                {isDeletingToken === p.id ? <RefreshIcon className="w-4 h-4 animate-spin" /> : <TrashIcon className="w-4 h-4" />}
                                                            </button>
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
                        <h2 className="text-xl font-bold text-white border-b border-gray-700 pb-3 mb-4">Disparar Alerta</h2>
                        <div className="space-y-4">
                            <input 
                                type="text" 
                                placeholder="Título do Alerta" 
                                value={title} 
                                onChange={e => setTitle(e.target.value)} 
                                className="w-full bg-dark border border-gray-700 rounded-lg px-3 py-2 text-white font-bold focus:ring-2 focus:ring-primary outline-none" 
                            />
                            <textarea 
                                placeholder="Sua mensagem aqui..." 
                                value={body} 
                                onChange={e => setBody(e.target.value)} 
                                className="w-full h-32 bg-dark border border-gray-600 rounded-lg px-3 py-2 text-white text-sm resize-none focus:ring-2 focus:ring-primary outline-none" 
                            />
                        </div>

                        <div className="mt-6 pt-4 border-t border-gray-700">
                            {error && <div className="p-3 bg-red-900/30 border border-red-800 rounded-lg mb-4 text-red-300 text-xs font-bold italic">{error}</div>}
                            {result && <div className="p-3 bg-green-900/30 border border-green-800 rounded-lg mb-4 text-green-400 text-xs text-center font-bold">🎉 {result}</div>}

                            <button 
                                onClick={handleSend} 
                                disabled={isSending || selectedPromoterIds.size === 0} 
                                className="w-full py-4 bg-primary hover:bg-primary-dark text-white rounded-xl font-black text-lg shadow-xl flex items-center justify-center gap-3 transition-all disabled:opacity-30 disabled:grayscale"
                            >
                                {isSending ? <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div> : 'DISPARAR PUSH'}
                            </button>
                            <p className="text-[10px] text-gray-500 text-center mt-3 uppercase font-bold">Destinos Selecionados: {selectedPromoterIds.size}</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AdminPushCampaignPage;
