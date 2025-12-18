
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
    PencilIcon
} from '../components/Icons';

const SuperAdminDashboard: React.FC = () => {
    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold">Painel Super Admin</h1>
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
                <Link to="/admin/push-campaign" className="group block p-6 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-all duration-300 border border-transparent hover:border-indigo-500">
                    <div className="flex items-center">
                        <FaceIdIcon className="w-8 h-8 text-primary" />
                        <h2 className="ml-4 text-xl font-semibold text-gray-100">Campanha Push</h2>
                    </div>
                    <p className="mt-2 text-gray-400">Envie notificações nativas diretamente para os celulares das divulgadoras.</p>
                    <div className="text-sm text-primary mt-4 opacity-0 group-hover:opacity-100 transition-opacity font-semibold">Enviar &rarr;</div>
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
    );
};

export default SuperAdminDashboard;
