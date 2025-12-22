
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { getOrganizations } from '../services/organizationService';
import { deletePushToken } from '../services/promoterService';
import { sendPushCampaign } from '../services/messageService';
import { Organization, Promoter } from '../types';
import { ArrowLeftIcon, FaceIdIcon, AlertTriangleIcon, DocumentDuplicateIcon, TrashIcon, SearchIcon, DownloadIcon, RefreshIcon, XIcon, CheckCircleIcon, CogIcon } from '../components/Icons';

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
    const [showTroubleshoot, setShowTroubleshoot] = useState(false);
    const [showBuildFix, setShowBuildFix] = useState(false);

    const isSuperAdmin = adminData?.role === 'superadmin';

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

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        Messaging.messaging().apnsToken = deviceToken
        Messaging.messaging().token { token, error in
            if let fcmToken = token {
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
            const pForm = (p.pushDiagnostics?.platform || 'ios').toLowerCase();
            const matchesPlatform = pForm === activePlatformTab;
            const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
            return matchesPlatform && matchesSearch;
        });
    }, [promoters, activePlatformTab, searchQuery]);

    const invalidTokens = useMemo(() => {
        return promoters.filter(p => (p.fcmToken?.length || 0) <= 64);
    }, [promoters]);

    const handleDownloadFile = () => {
        const blob = new Blob([appDelegateCode], { type: 'text/plain' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'AppDelegate.swift';
        document.body.appendChild(a); a.click();
        window.URL.revokeObjectURL(url); document.body.removeChild(a);
    };

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
        if (!window.confirm(`Deseja apagar os ${invalidTokens.length} tokens curtos (APNs)? Eles não funcionam no Firebase.`)) return;
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
        
        const hasInvalid = Array.from(selectedPromoterIds).some(id => {
            const p = promoters.find(prom => prom.id === id);
            return p && (p.fcmToken?.length || 0) <= 64;
        });

        if (hasInvalid) {
            setError("Erro: Você selecionou dispositivos com Token nativo (vermelhos). Delete-os antes de enviar.");
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

            {/* SEÇÃO DE CORREÇÃO DE BUILD XCODE */}
            <div className="mb-4">
                <button 
                    onClick={() => setShowBuildFix(!showBuildFix)}
                    className="w-full flex items-center justify-between text-left gap-2 text-white font-black bg-indigo-600 px-6 py-4 rounded-xl shadow-xl hover:bg-indigo-700 border-2 border-indigo-400 transition-all"
                >
                    <div className="flex items-center gap-3">
                        <CogIcon className="w-6 h-6 animate-spin-slow" />
                        <div>
                            <p className="text-lg">ERRO: 'Cordova/CDVAvailabilityDeprecated.h' not found?</p>
                            <p className="text-xs font-normal opacity-80">Clique aqui para ver os comandos de reparo do ambiente iOS.</p>
                        </div>
                    </div>
                    <span>{showBuildFix ? '▲' : '▼'}</span>
                </button>
                
                {showBuildFix && (
                    <div className="mt-4 bg-gray-900 border-2 border-indigo-500 p-6 rounded-xl animate-fadeIn shadow-2xl space-y-6">
                        <div className="bg-red-900/20 border border-red-900/50 p-4 rounded-lg">
                            <p className="text-red-400 font-bold mb-2">Por que isso acontece?</p>
                            <p className="text-sm text-gray-300">Este erro ocorre quando as dependências do CocoaPods estão corrompidas ou o Capacitor não sincronizou corretamente os headers do Cordova (usados para compatibilidade interna).</p>
                        </div>

                        <div className="space-y-4">
                            <h3 className="text-indigo-400 font-black flex items-center gap-2"><CheckCircleIcon className="w-5 h-5"/> PASSO A PASSO PARA CORRIGIR NO TERMINAL:</h3>
                            
                            <div className="space-y-3 font-mono text-xs">
                                <div className="bg-black p-3 rounded border border-gray-700">
                                    <p className="text-gray-500 mb-1"># 1. Remova a plataforma iOS e os Pods</p>
                                    <p className="text-green-400">rm -rf ios && rm -rf node_modules && npm install</p>
                                </div>
                                <div className="bg-black p-3 rounded border border-gray-700">
                                    <p className="text-gray-500 mb-1"># 2. Adicione a plataforma novamente</p>
                                    <p className="text-green-400">npx cap add ios</p>
                                </div>
                                <div className="bg-black p-3 rounded border border-gray-700">
                                    <p className="text-gray-500 mb-1"># 3. Sincronize e instale os Pods corretamente</p>
                                    <p className="text-green-400">npx cap sync ios && cd ios/App && pod install && cd ../..</p>
                                </div>
                            </div>

                            <div className="bg-yellow-900/20 border border-yellow-900/50 p-4 rounded-lg">
                                <p className="text-yellow-400 font-bold mb-1">Dica de Xcode:</p>
                                <p className="text-sm text-gray-300">No Xcode, vá em <strong>Product -> Clean Build Folder</strong> antes de tentar rodar novamente após os comandos acima.</p>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <div className="mb-8">
                <button 
                    onClick={() => setShowTroubleshoot(!showTroubleshoot)}
                    className="w-full flex items-center justify-between text-left gap-2 text-white font-black bg-red-600 px-6 py-4 rounded-xl shadow-xl hover:bg-red-700 border-2 border-red-400 transition-all"
                >
                    <div className="flex items-center gap-3">
                        <AlertTriangleIcon className="w-6 h-6 animate-pulse" />
                        <div>
                            <p className="text-lg">TOKEN COM 64 CARACTERES? USE A VERSÃO V2</p>
                            <p className="text-xs font-normal opacity-80">O segredo está em esperar o FCM Token antes de avisar o Capacitor.</p>
                        </div>
                    </div>
                    <span>{showTroubleshoot ? '▲' : '▼'}</span>
                </button>
                
                {showTroubleshoot && (
                    <div className="mt-4 bg-gray-900 border-2 border-red-500 p-6 rounded-xl animate-fadeIn shadow-2xl">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                            <div className="space-y-4">
                                <h3 className="text-red-400 font-black">1. POR QUE OCORRE?</h3>
                                <p className="text-sm text-gray-300">
                                    Se você envia o <code className="text-blue-400">deviceToken</code> binário, o Capacitor o converte para Hexadecimal (64 chars). O Firebase **não aceita** esse formato. Ele precisa de uma String que comece com <code className="text-green-400">f...</code> ou <code className="text-green-400">e...</code>.
                                </p>
                            </div>
                            <div className="space-y-4">
                                <h3 className="text-red-400 font-black">2. SOLUÇÃO XCODE (V2)</h3>
                                <p className="text-sm text-gray-300">Substitua seu <code className="text-blue-400">AppDelegate.swift</code> pelo arquivo abaixo. Ele força o App a aguardar a String do Firebase.</p>
                                <button onClick={handleDownloadFile} className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg font-bold text-xs">BAIXAR APPDELEGATE.SWIFT V2</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-gray-800 p-5 rounded-xl border border-gray-700 shadow-lg">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-bold text-white">Limpeza de Dados</h2>
                            <span className={`text-xs px-3 py-1 rounded-full font-black ${invalidTokens.length > 0 ? 'bg-red-600 text-white animate-pulse' : 'bg-green-900/30 text-green-400'}`}>
                                {invalidTokens.length} Dispositivos Inválidos (64 chars)
                            </span>
                        </div>
                        <button 
                            onClick={handleCleanInvalid}
                            disabled={!!isDeletingToken || invalidTokens.length === 0}
                            className="w-full py-3 bg-red-600 hover:bg-red-700 text-white text-sm font-black rounded-lg disabled:opacity-30"
                        >
                            LIMPAR TOKENS VERMELHOS (APNs)
                        </button>
                    </div>

                    <div className="bg-secondary p-6 rounded-xl shadow-lg border border-gray-700">
                        <div className="flex flex-col sm:flex-row items-center justify-between mb-6 gap-4">
                            <h2 className="text-xl font-bold text-white flex items-center gap-2">Dispositivos Ativos</h2>
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
                                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-400">Divulgadora</th>
                                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-400">Token</th>
                                        <th className="px-4 py-3 text-right text-xs font-bold text-gray-400">Ações</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-700 bg-gray-800/20">
                                    {isLoadingData ? (
                                        <tr><td colSpan={4} className="text-center py-8">Carregando...</td></tr>
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
                                                            <span className="text-[10px] bg-red-600 text-white px-2 py-0.5 rounded-full font-black">APNs (64 CHARS)</span>
                                                        ) : (
                                                            <span className="text-[10px] bg-green-600 text-white px-2 py-0.5 rounded-full font-black">FCM OK</span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3 text-right">
                                                        <div className="flex justify-end gap-2">
                                                            <button onClick={() => handleCopyToken(p.fcmToken || '')} className="p-2 bg-gray-700 text-gray-300 rounded"><DocumentDuplicateIcon className="w-4 h-4" /></button>
                                                            <button onClick={() => handleDeleteToken(p.id)} disabled={isDeletingToken === p.id} className="p-2 bg-red-900/30 text-red-400 rounded"><TrashIcon className="w-4 h-4" /></button>
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
                        <h2 className="text-xl font-bold text-white mb-4">Novo Alerta Push</h2>
                        <div className="space-y-4">
                            <input type="text" placeholder="Título do Alerta" value={title} onChange={e => setTitle(e.target.value)} className="w-full bg-dark border border-gray-700 rounded-lg px-3 py-2 text-white font-bold" />
                            <textarea placeholder="Sua mensagem aqui..." value={body} onChange={e => setBody(e.target.value)} className="w-full h-32 bg-dark border border-gray-600 rounded-lg px-3 py-2 text-white text-sm" />
                            <input type="text" placeholder="Caminho (ex: /#/posts)" value={targetUrl} onChange={e => setTargetUrl(e.target.value)} className="w-full bg-dark border border-gray-700 rounded-lg px-3 py-2 text-white text-xs font-mono" />
                        </div>

                        <div className="mt-6 pt-4 border-t border-gray-700">
                            {error && <div className="p-3 bg-red-900/30 text-red-300 text-xs font-bold mb-4">{error}</div>}
                            {result && <div className="p-3 bg-green-900/30 text-green-400 text-xs text-center font-bold mb-4">{result}</div>}
                            <button onClick={handleSend} disabled={isSending || selectedPromoterIds.size === 0} className="w-full py-4 bg-primary hover:bg-primary-dark text-white rounded-xl font-black text-lg disabled:opacity-30">
                                {isSending ? 'DISPARANDO...' : 'DISPARAR PUSH'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AdminPushCampaignPage;
