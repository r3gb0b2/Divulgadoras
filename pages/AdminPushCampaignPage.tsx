
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { getOrganizations } from '../services/organizationService';
import { deletePushToken } from '../services/promoterService';
import { sendPushCampaign } from '../services/messageService';
import { Organization, Promoter } from '../types';
import { ArrowLeftIcon, FaceIdIcon, AlertTriangleIcon, DocumentDuplicateIcon, TrashIcon, SearchIcon, CheckCircleIcon, DownloadIcon, RefreshIcon } from '../components/Icons';

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

    const appDelegateCode = `import UIKit
import Capacitor
import FirebaseCore
import FirebaseMessaging

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate, MessagingDelegate, UNUserNotificationCenterDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // 1. Inicializa o Firebase (Aqui que dá o erro se o Pod não estiver instalado)
        FirebaseApp.configure()
        
        // 2. Configura os delegados de notificação
        Messaging.messaging().delegate = self
        UNUserNotificationCenter.current().delegate = self
        
        return true
    }

    // 3. CONVERSÃO: Transforma o Token APNs (64 chars) no Token FCM (Longo)
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        Messaging.messaging().apnsToken = deviceToken
        Messaging.messaging().token { token, error in
            if let token = token {
                print("Firebase registration token: \\(token)")
                NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
            }
        }
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }

    // 4. Recebimento do Token do Firebase
    func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) {
        print("Firebase registration token: \\(String(describing: fcmToken))")
        let dataDict: [String: String] = ["token": fcmToken ?? ""]
        NotificationCenter.default.post(name: Notification.Name("FCMToken"), object: nil, userInfo: dataDict)
    }

    // 5. Permite exibir a notificação mesmo com o App aberto
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
            setSelectedPromoterIds(new Set(withToken.map(p => p.id)));
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
            alert("Token copiado!");
        });
    };

    const handleSend = async () => {
        if (!title || !body || selectedPromoterIds.size === 0) {
            setError("Preencha todos os campos.");
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
        <div className="max-w-6xl mx-auto">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold flex items-center gap-3">
                    <FaceIdIcon className="w-8 h-8 text-primary" />
                    Campanhas Push
                </h1>
                <button onClick={() => navigate(-1)} className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-500 text-sm">
                    <ArrowLeftIcon className="w-4 h-4" /> Voltar
                </button>
            </div>

            {/* PAINEL DE DIAGNÓSTICO CRÍTICO PARA O XCODE */}
            <div className="mb-8">
                <button 
                    onClick={() => setShowTroubleshoot(!showTroubleshoot)}
                    className="w-full flex items-center justify-between text-left gap-2 text-white font-black bg-red-600 px-6 py-4 rounded-xl shadow-xl hover:bg-red-700 transition-all border-2 border-red-400"
                >
                    <div className="flex items-center gap-3">
                        <AlertTriangleIcon className="w-6 h-6 animate-pulse" />
                        <div>
                            <p className="text-lg">SOLUÇÃO PARA O ERRO: "No such module 'FirebaseCore'"</p>
                            <p className="text-xs font-normal opacity-80">Clique aqui se o seu Xcode não está compilando.</p>
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
                                    INSTALAÇÃO FORÇADA
                                </h3>
                                <p className="text-sm text-gray-300">
                                    O erro acontece porque o Capacitor não baixou as bibliotecas do Firebase. Feche o Xcode e rode isto no seu terminal:
                                </p>
                                <div className="bg-black p-4 rounded-lg border border-gray-700">
                                    <code className="text-green-400 text-sm block">cd ios/App && pod install</code>
                                </div>
                                <p className="text-xs text-gray-500 italic">
                                    * Se der erro de comando não encontrado, você precisa instalar o CocoaPods no seu Mac.
                                </p>
                            </div>

                            <div className="space-y-4">
                                <h3 className="text-red-400 font-black flex items-center gap-2">
                                    <span className="w-6 h-6 bg-red-400 text-black rounded-full flex items-center justify-center text-xs">2</span>
                                    ABRA O ARQUIVO BRANCO
                                </h3>
                                <p className="text-sm text-gray-300">
                                    Após rodar o comando acima, vá na pasta <code className="text-blue-400">ios/App</code> e procure pelo ícone **BRANCO** chamado:
                                </p>
                                <div className="flex items-center gap-4 bg-white/10 p-3 rounded-lg">
                                    <div className="w-10 h-10 bg-white rounded flex items-center justify-center shadow-lg">
                                        <div className="w-6 h-6 border-2 border-blue-500 rotate-45"></div>
                                    </div>
                                    <span className="text-white font-bold">App.xcworkspace</span>
                                </div>
                                <p className="text-xs text-red-400 font-bold underline">
                                    NUNCA abra o arquivo azul (.xcodeproj). Ele não carrega o Firebase.
                                </p>
                            </div>
                        </div>

                        <div className="mt-8 pt-6 border-t border-gray-800 flex flex-col md:flex-row gap-6">
                            <div className="flex-1">
                                <h3 className="text-white font-bold mb-2">3. Substitua o AppDelegate</h3>
                                <p className="text-xs text-gray-400 mb-4">Baixe o arquivo configurado e coloque em: <br/> <code className="text-red-300">ios/App/App/AppDelegate.swift</code></p>
                                <button 
                                    onClick={handleDownloadFile}
                                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-xl font-black transition-all"
                                >
                                    <DownloadIcon className="w-5 h-5" />
                                    BAIXAR APPDELEGATE.SWIFT
                                </button>
                            </div>
                            <div className="flex-1 bg-black/50 p-4 rounded-lg">
                                <h3 className="text-white font-bold mb-2 text-sm">4. Verifique o Podfile</h3>
                                <p className="text-[11px] text-gray-400">Abra o arquivo <code className="text-blue-300">ios/App/Podfile</code> e garanta que ele tenha estas linhas dentro do target 'App':</p>
                                <pre className="text-[10px] text-green-500 mt-2">
                                    pod 'Firebase/Core'<br/>
                                    pod 'Firebase/Messaging'
                                </pre>
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
                                Dispositivos com App Instalado
                            </h2>
                            <div className="flex bg-dark p-1 rounded-lg border border-gray-700">
                                <button onClick={() => setActivePlatformTab('ios')} className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${activePlatformTab === 'ios' ? 'bg-primary text-white' : 'text-gray-400 hover:text-white'}`}>iOS (iPhone)</button>
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
                                            }} className="rounded border-gray-600 text-primary" />
                                        </th>
                                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase">Divulgadora</th>
                                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase">Token</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-700 bg-gray-800/20">
                                    {isLoadingData ? (
                                        <tr><td colSpan={3} className="text-center py-8 text-gray-500">Buscando...</td></tr>
                                    ) : filteredPromoters.length === 0 ? (
                                        <tr><td colSpan={3} className="text-center py-12 text-gray-500">Nenhum dispositivo registrado.</td></tr>
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
                                                    <p className="text-[10px] text-gray-500 uppercase">{p.campaignName || 'Geral'}</p>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className="text-[10px] bg-green-600 text-white px-2 py-0.5 rounded-full font-black">FCM OK</span>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <div className="lg:col-span-1 space-y-6">
                    <div className="bg-secondary p-6 rounded-xl shadow-lg border border-gray-700 sticky top-24">
                        <h2 className="text-xl font-bold text-white border-b border-gray-700 pb-3 mb-4">Enviar Agora</h2>
                        <div className="space-y-4">
                            <input type="text" placeholder="Título do Alerta" value={title} onChange={e => setTitle(e.target.value)} className="w-full bg-dark border border-gray-700 rounded-lg px-3 py-2 text-white font-bold" />
                            <textarea placeholder="Sua mensagem aqui..." value={body} onChange={e => setBody(e.target.value)} className="w-full h-32 bg-dark border border-gray-600 rounded-lg px-3 py-2 text-white text-sm resize-none" />
                        </div>

                        <div className="mt-6 pt-4 border-t border-gray-700">
                            {error && <div className="p-3 bg-red-900/30 border border-red-800 rounded-lg mb-4 text-red-300 text-xs">{error}</div>}
                            {result && <div className="p-3 bg-green-900/30 border border-green-800 rounded-lg mb-4 text-green-400 text-xs text-center">{result}</div>}

                            <button onClick={handleSend} disabled={isSending || selectedPromoterIds.size === 0} className="w-full py-4 bg-primary hover:bg-primary-dark text-white rounded-xl font-black text-lg shadow-xl flex items-center justify-center gap-3 transition-all disabled:opacity-30">
                                {isSending ? <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div> : 'DISPARAR PUSH'}
                            </button>
                            <p className="text-[10px] text-gray-500 text-center mt-3 uppercase font-bold">Selecionadas: {selectedPromoterIds.size}</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AdminPushCampaignPage;
