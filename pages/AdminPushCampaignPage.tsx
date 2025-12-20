
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { getOrganizations } from '../services/organizationService';
import { deletePushToken } from '../services/promoterService';
import { sendPushCampaign } from '../services/messageService';
import { Organization, Promoter } from '../types';
import { ArrowLeftIcon, FaceIdIcon, AlertTriangleIcon, DocumentDuplicateIcon, TrashIcon, SearchIcon, CogIcon, CheckCircleIcon, DownloadIcon, RefreshIcon } from '../components/Icons';

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
        // 1. Inicializa o Firebase
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

    const handleCopyCode = () => {
        navigator.clipboard.writeText(appDelegateCode).then(() => {
            alert("Código copiado!");
        });
    };

    // Fix: Added handleCopyToken function to handle copying individual tokens
    const handleCopyToken = (token: string) => {
        if (!token) return;
        navigator.clipboard.writeText(token).then(() => {
            alert("Token copiado!");
        });
    };

    const handleDeleteToken = async (promoterId: string) => {
        if (!window.confirm("Isso removerá o token atual. Após corrigir no Xcode, peça para a divulgadora abrir o App de novo.")) return;
        
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

            <div className="mb-6">
                <button 
                    onClick={() => setShowTroubleshoot(!showTroubleshoot)}
                    className="flex items-center gap-2 text-indigo-400 font-bold hover:text-indigo-300 transition-colors bg-indigo-900/20 px-4 py-2 rounded-lg border border-indigo-500/30"
                >
                    <AlertTriangleIcon className="w-5 h-5 text-yellow-500" />
                    {showTroubleshoot ? 'Fechar Guia de Integração' : 'ERRO "No such module FirebaseCore"? Clique aqui'}
                </button>
                
                {showTroubleshoot && (
                    <div className="mt-4 bg-indigo-900/30 border border-indigo-500/50 p-6 rounded-xl animate-fadeIn">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                            <div>
                                <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
                                    <CheckCircleIcon className="w-5 h-5 text-green-400" />
                                    1. Baixe o Código Correto
                                </h3>
                                <p className="text-sm text-gray-300 mb-4">
                                    Este arquivo contém as pontes necessárias entre o iOS e o Firebase Messaging.
                                </p>
                                <div className="flex flex-col gap-2">
                                    <button 
                                        onClick={handleDownloadFile}
                                        className="flex items-center justify-center gap-2 bg-green-600 hover:bg-green-500 text-white px-6 py-3 rounded-xl font-black shadow-lg transition-all"
                                    >
                                        <DownloadIcon className="w-5 h-5" />
                                        BAIXAR APPDELEGATE.SWIFT
                                    </button>
                                    <button 
                                        onClick={handleCopyCode}
                                        className="text-xs text-indigo-300 hover:text-white underline py-2"
                                    >
                                        Ou apenas copiar o código
                                    </button>
                                </div>
                                <p className="text-[11px] text-gray-500 mt-4 italic">
                                    Local no Mac: <br/>
                                    <code className="text-indigo-300">ios/App/App/AppDelegate.swift</code>
                                </p>
                            </div>

                            <div className="bg-black/40 p-5 rounded-xl border border-red-500/50">
                                <h3 className="text-red-400 font-bold mb-3 flex items-center gap-2 text-sm uppercase">
                                    ⚠️ Resolvendo "No such module 'FirebaseCore'"
                                </h3>
                                <p className="text-[11px] text-gray-400 mb-4 leading-relaxed">
                                    Se o Xcode diz que o módulo não existe, siga estas ordens EXATAMENTE:
                                </p>
                                <ol className="text-xs text-gray-300 space-y-4 ml-4 list-decimal">
                                    <li><strong>FECHE O XCODE:</strong> Encerre-o totalmente (Cmd+Q).</li>
                                    <li><strong>TERMINAL (Raiz do Projeto):</strong> Rode estes comandos:
                                        <pre className="bg-gray-800 p-2 mt-1 rounded text-primary font-mono overflow-x-auto">
                                            npx cap sync ios
                                        </pre>
                                    </li>
                                    <li><strong>TERMINAL (Pasta iOS):</strong> Rode este comando de força:
                                        <pre className="bg-gray-800 p-2 mt-1 rounded text-primary font-mono overflow-x-auto">
                                            cd ios/App && pod install
                                        </pre>
                                    </li>
                                    <li><strong>ABRIR O CORRETO:</strong> Vá na pasta <code className="text-blue-300">ios/App/</code> e abra o arquivo <strong className="text-white underline">App.xcworkspace</strong> (o ícone branco).
                                        <br/><span className="text-red-400 font-bold">NÃO abra o arquivo azul (.xcodeproj).</span>
                                    </li>
                                    <li><strong>BUILD:</strong> No Xcode, aperte <kbd className="bg-gray-700 px-1 rounded">Cmd + B</kbd>. O erro deve sumir após a primeira compilação.</li>
                                </ol>
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
                                Dispositivos Registrados
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
                                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Tipo Token</th>
                                        <th className="px-4 py-3 text-right text-xs font-bold text-gray-400 uppercase tracking-wider">Ações</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-700 bg-gray-800/20">
                                    {isLoadingData ? (
                                        <tr><td colSpan={4} className="text-center py-8 text-gray-500">Buscando...</td></tr>
                                    ) : filteredPromoters.length === 0 ? (
                                        <tr><td colSpan={4} className="text-center py-12 text-gray-500">Nenhum dispositivo encontrado.</td></tr>
                                    ) : (
                                        filteredPromoters.map(p => {
                                            const isAPNs = (p.fcmToken?.length || 0) === 64;
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
                                                                <span className="text-[10px] bg-red-600 text-white px-2 py-0.5 rounded-full font-black w-fit animate-pulse">APNs (INVÁLIDO)</span>
                                                                <span className="text-[9px] text-red-400 mt-1 italic font-bold">Corrigir Xcode</span>
                                                            </div>
                                                        ) : (
                                                            <div className="flex flex-col">
                                                                <span className="text-[10px] bg-green-600 text-white px-2 py-0.5 rounded-full font-black w-fit">FCM (VÁLIDO)</span>
                                                                <span className="text-[9px] text-green-400 mt-1">Pronto.</span>
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
                        <h2 className="text-xl font-bold text-white border-b border-gray-700 pb-3 mb-4">Enviar Push</h2>
                        <div className="space-y-4">
                            <input type="text" placeholder="Título" value={title} onChange={e => setTitle(e.target.value)} className="w-full bg-dark border border-gray-700 rounded-lg px-3 py-2 text-white font-bold" />
                            <textarea placeholder="Mensagem..." value={body} onChange={e => setBody(e.target.value)} className="w-full h-32 bg-dark border border-gray-600 rounded-lg px-3 py-2 text-white text-sm resize-none" />
                        </div>

                        <div className="mt-6 pt-4 border-t border-gray-700">
                            {error && (
                                <div className="p-3 bg-red-900/30 border border-red-800 rounded-lg mb-4 text-[11px] text-red-300 italic">
                                    {error}
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
                                    'DISPARAR'
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
