
import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { auth } from '../firebase/config';
import { 
    UsersIcon, 
    MapPinIcon, 
    ClipboardDocumentListIcon, 
    MegaphoneIcon, 
    ChartBarIcon, 
    ClockIcon, 
    TicketIcon, 
    LogoutIcon, 
    HeartIcon, 
    CogIcon, 
    FaceIdIcon,
    CodeBracketIcon,
    DownloadIcon
} from '../components/Icons';
import { useAdminAuth } from '../contexts/AdminAuthContext';

const AdminDashboard: React.FC = () => {
    const { adminData } = useAdminAuth();
    const navigate = useNavigate();

    const handleLogout = async () => {
        try {
            await auth.signOut();
            navigate('/admin/login');
        } catch (error) {
            console.error("Logout failed", error);
        }
    };

    const handleDownloadAppDelegate = () => {
        const appDelegateContent = `import UIKit
import Capacitor
import FirebaseCore
import FirebaseMessaging

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Inicializa o SDK do Firebase
        FirebaseApp.configure()
        return true
    }

    // Handlers para Notificações Push
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        Messaging.messaging().apnsToken = deviceToken
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }

    // Handlers para Deep Links (Links que abrem o App)
    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }
}
`;
        const blob = new Blob([appDelegateContent], { type: 'text/plain' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'AppDelegate.swift';
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    };

    const isSuperAdmin = adminData?.role === 'superadmin';

    return (
        <div className="space-y-8">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold">Painel Administrativo</h1>
                <button onClick={handleLogout} className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 flex items-center gap-2">
                    <LogoutIcon className="w-5 h-5" />
                    <span>Sair</span>
                </button>
            </div>

            <div className="bg-secondary shadow-lg rounded-lg p-6">
                <p className="text-gray-400 mb-6">
                    Bem-vindo, {adminData?.email}. Selecione uma opção abaixo para gerenciar seu evento.
                </p>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <Link to="/admin/promoters" className="group block p-6 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-all duration-300 border border-gray-600 hover:border-primary">
                        <div className="flex items-center">
                            <div className="p-3 rounded-full bg-primary/20 text-primary">
                                <UsersIcon className="w-8 h-8" />
                            </div>
                            <h2 className="ml-4 text-xl font-semibold text-gray-100">Divulgadoras</h2>
                        </div>
                        <p className="mt-3 text-gray-400">Aprovar cadastros, ver lista completa e fotos.</p>
                    </Link>

                    <Link to="/admin/posts" className="group block p-6 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-all duration-300">
                        <div className="flex items-center">
                            <MegaphoneIcon className="w-8 h-8 text-primary" />
                            <h2 className="ml-4 text-xl font-semibold text-gray-100">Posts e Tarefas</h2>
                        </div>
                        <p className="mt-2 text-gray-400">Criar publicações e verificar prints de comprovação.</p>
                    </Link>

                    <Link to="/admin/push-campaign" className="group block p-6 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-all duration-300">
                        <div className="flex items-center">
                            <FaceIdIcon className="w-8 h-8 text-indigo-400" />
                            <h2 className="ml-4 text-xl font-semibold text-gray-100">Notificações Push</h2>
                        </div>
                        <p className="mt-2 text-gray-400">Envie alertas diretamente para o celular das meninas.</p>
                    </Link>

                    <Link to="/admin/lists" className="group block p-6 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-all duration-300">
                        <div className="flex items-center">
                            <ClipboardDocumentListIcon className="w-8 h-8 text-primary" />
                            <h2 className="ml-4 text-xl font-semibold text-gray-100">Listas VIP</h2>
                        </div>
                        <p className="mt-2 text-gray-400">Gerenciar listas de convidados e gerar links.</p>
                    </Link>

                    <Link to="/admin/checkin-dashboard" className="group block p-6 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-all duration-300">
                        <div className="flex items-center">
                            <TicketIcon className="w-8 h-8 text-primary" />
                            <h2 className="ml-4 text-xl font-semibold text-gray-100">Check-in</h2>
                        </div>
                        <p className="mt-2 text-gray-400">Controlar entrada no evento e ler QR Codes.</p>
                    </Link>

                    <Link to="/admin/settings" className="group block p-6 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-all duration-300">
                        <div className="flex items-center">
                            <CogIcon className="w-8 h-8 text-primary" />
                            <h2 className="ml-4 text-xl font-semibold text-gray-100">Configurações</h2>
                        </div>
                        <p className="mt-2 text-gray-400">Dados da organização, equipe e regiões.</p>
                    </Link>
                </div>
            </div>

            {/* Seção Técnica para Super Admin */}
            {isSuperAdmin && (
                <div className="bg-indigo-900/20 border border-indigo-500/30 rounded-xl p-8">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                        <div className="flex gap-4">
                            <div className="p-3 bg-indigo-500/20 rounded-xl text-indigo-400">
                                <CodeBracketIcon className="w-8 h-8" />
                            </div>
                            <div>
                                <h2 className="text-2xl font-bold text-white uppercase tracking-tight">Arquivos Técnicos (iOS)</h2>
                                <p className="text-gray-400 text-sm mt-1">Substitua o arquivo <code className="bg-black/40 px-1 rounded text-indigo-300">AppDelegate.swift</code> no seu Xcode para habilitar o Firebase Push.</p>
                            </div>
                        </div>
                        <button 
                            onClick={handleDownloadAppDelegate}
                            className="flex items-center justify-center gap-2 px-8 py-4 bg-indigo-600 text-white font-black rounded-xl hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-600/20 w-full md:w-auto"
                        >
                            <DownloadIcon className="w-6 h-6" />
                            BAIXAR APPDELEGATE.SWIFT
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminDashboard;
