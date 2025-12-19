import React from 'react';
import { Link } from 'react-router-dom';
import { 
    UsersIcon, 
    BuildingOfficeIcon, 
    MapPinIcon, 
    MegaphoneIcon, 
    ClipboardDocumentListIcon, 
    KeyIcon, 
    ShieldCheckIcon, 
    EnvelopeIcon, 
    FaceIdIcon,
    TrashIcon,
    PencilIcon,
    CodeBracketIcon,
    DownloadIcon
} from '../components/Icons';

const SuperAdminDashboard: React.FC = () => {

    const handleDownloadAppDelegate = () => {
        const appDelegateContent = `import UIKit
import Capacitor
import FirebaseCore
import FirebaseMessaging

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Inicializa o Firebase
        FirebaseApp.configure()
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        // Repassa o token APNs para o Firebase Messaging
        Messaging.messaging().apnsToken = deviceToken
        // Informa ao Capacitor sobre o registro (para plugins de Push)
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        // Informa ao Capacitor sobre a falha
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }

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

    return (
        <div className="space-y-10">
            <div>
                <h1 className="text-3xl font-bold mb-6">Painel Super Admin</h1>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <Link to="/admin/organizations" className="group block p-6 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-all duration-300">
                        <div className="flex items-center">
                            <BuildingOfficeIcon className="w-8 h-8 text-primary" />
                            <h2 className="ml-4 text-xl font-semibold text-gray-100">Organizações</h2>
                        </div>
                        <p className="mt-2 text-gray-400">Gerenciar todas as produtoras e agências cadastradas.</p>
                    </Link>
                    <Link to="/admin/applications" className="group block p-6 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-all duration-300">
                        <div className="flex items-center">
                            <KeyIcon className="w-8 h-8 text-primary" />
                            <h2 className="ml-4 text-xl font-semibold text-gray-100">Solicitações de Acesso</h2>
                        </div>
                        <p className="mt-2 text-gray-400">Verificar pedidos de novos administradores.</p>
                    </Link>
                    <Link to="/admin/apple-test" className="group block p-6 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-all duration-300">
                        <div className="flex items-center">
                            <FaceIdIcon className="w-8 h-8 text-primary" />
                            <h2 className="ml-4 text-xl font-semibold text-gray-100">Apple Test Review</h2>
                        </div>
                        <p className="mt-2 text-gray-400">Gerenciar inscritos para teste do app iOS.</p>
                    </Link>
                    <Link to="/admin/newsletter" className="group block p-6 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-all duration-300">
                        <div className="flex items-center">
                            <EnvelopeIcon className="w-8 h-8 text-primary" />
                            <h2 className="ml-4 text-xl font-semibold text-gray-100">Newsletter</h2>
                        </div>
                        <p className="mt-2 text-gray-400">Enviar e-mails em massa para as divulgadoras.</p>
                    </Link>
                    <Link to="/admin/email-templates" className="group block p-6 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-all duration-300">
                        <div className="flex items-center">
                            <PencilIcon className="w-8 h-8 text-primary" />
                            <h2 className="ml-4 text-xl font-semibold text-gray-100">Templates de Email</h2>
                        </div>
                        <p className="mt-2 text-gray-400">Editar o visual dos e-mails automáticos de aprovação.</p>
                    </Link>
                    <Link to="/admin/edit-privacy" className="group block p-6 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-all duration-300">
                        <div className="flex items-center">
                            <ShieldCheckIcon className="w-8 h-8 text-primary" />
                            <h2 className="ml-4 text-xl font-semibold text-gray-100">Política de Privacidade</h2>
                        </div>
                        <p className="mt-2 text-gray-400">Atualizar o texto legal da plataforma.</p>
                    </Link>
                    <Link to="/admin/cleanup" className="group block p-6 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-all duration-300">
                        <div className="flex items-center">
                            <TrashIcon className="w-8 h-8 text-primary" />
                            <h2 className="ml-4 text-xl font-semibold text-gray-100">Limpeza de Dados</h2>
                        </div>
                        <p className="mt-2 text-gray-400">Remover prints antigos de eventos desativados para liberar espaço.</p>
                    </Link>
                </div>
            </div>

            {/* Nova Seção de Arquivos Técnicos */}
            <div className="bg-secondary/50 border border-gray-700 rounded-xl p-8">
                <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
                    <CodeBracketIcon className="w-8 h-8 text-indigo-400" />
                    Arquivos Técnicos e Deploy
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
                        <h3 className="text-lg font-bold text-white mb-2">iOS / Swift (Capacitor 6)</h3>
                        <p className="text-sm text-gray-400 mb-6">Baixe o arquivo AppDelegate.swift pronto com integração Firebase e FCM para substituir no seu projeto Xcode.</p>
                        <button 
                            onClick={handleDownloadAppDelegate}
                            className="flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 transition-all w-full sm:w-auto"
                        >
                            <DownloadIcon className="w-5 h-5" />
                            Baixar AppDelegate.swift
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SuperAdminDashboard;