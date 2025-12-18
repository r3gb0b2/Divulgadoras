
import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { auth } from '../firebase/config';
import { UsersIcon, MapPinIcon, ClipboardDocumentListIcon, MegaphoneIcon, ChartBarIcon, ClockIcon, TicketIcon, LogoutIcon, HeartIcon, CogIcon, SearchIcon, FaceIdIcon } from '../components/Icons';
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

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
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
                        <p className="mt-3 text-gray-400">Aprovar cadastros, ver lista completa, fotos e gerenciar equipe.</p>
                        <div className="text-sm text-primary mt-4 font-semibold group-hover:underline">Acessar Lista &rarr;</div>
                    </Link>

                    <Link to="/admin/posts" className="group block p-6 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-all duration-300">
                        <div className="flex items-center">
                            <MegaphoneIcon className="w-8 h-8 text-primary" />
                            <h2 className="ml-4 text-xl font-semibold text-gray-100">Posts e Tarefas</h2>
                        </div>
                        <p className="mt-2 text-gray-400">Criar publicações, verificar prints e gerenciar conteúdo.</p>
                    </Link>

                    {/* NOVO CARD: NOTIFICAÇÕES PUSH */}
                    <Link to="/admin/push-campaign" className="group block p-6 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-all duration-300 border border-transparent hover:border-indigo-500">
                        <div className="flex items-center">
                            <div className="p-3 rounded-full bg-indigo-500/20 text-indigo-400">
                                <FaceIdIcon className="w-8 h-8" />
                            </div>
                            <h2 className="ml-4 text-xl font-semibold text-gray-100">Notificações Push</h2>
                        </div>
                        <p className="mt-2 text-gray-400">Envie avisos urgentes diretamente para a tela do celular das divulgadoras.</p>
                    </Link>

                    <Link to="/admin/lists" className="group block p-6 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-all duration-300">
                        <div className="flex items-center">
                            <ClipboardDocumentListIcon className="w-8 h-8 text-primary" />
                            <h2 className="ml-4 text-xl font-semibold text-gray-100">Listas de Convidados</h2>
                        </div>
                        <p className="mt-2 text-gray-400">Gerenciar listas VIP, aniversariantes e gerar links.</p>
                    </Link>

                    <Link to="/admin/dashboard" className="group block p-6 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-all duration-300">
                        <div className="flex items-center">
                            <ChartBarIcon className="w-8 h-8 text-primary" />
                            <h2 className="ml-4 text-xl font-semibold text-gray-100">Desempenho</h2>
                        </div>
                        <p className="mt-2 text-gray-400">Ver ranking, estatísticas e engajamento da equipe.</p>
                    </Link>

                    <Link to="/admin/checkin-dashboard" className="group block p-6 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-all duration-300">
                        <div className="flex items-center">
                            <TicketIcon className="w-8 h-8 text-primary" />
                            <h2 className="ml-4 text-xl font-semibold text-gray-100">Check-in</h2>
                        </div>
                        <p className="mt-2 text-gray-400">Controlar entrada no evento e ler QR Codes.</p>
                    </Link>
                    
                    <Link to="/admin/scheduled-posts" className="group block p-6 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-all duration-300">
                        <div className="flex items-center">
                            <ClockIcon className="w-8 h-8 text-primary" />
                            <h2 className="ml-4 text-xl font-semibold text-gray-100">Agendamentos</h2>
                        </div>
                        <p className="mt-2 text-gray-400">Ver e editar publicações programadas.</p>
                    </Link>

                    <Link to="/admin/connect" className="group block p-6 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-all duration-300">
                        <div className="flex items-center">
                            <HeartIcon className="w-8 h-8 text-primary" />
                            <h2 className="ml-4 text-xl font-semibold text-gray-100">Conexão (Follow Loop)</h2>
                        </div>
                        <p className="mt-2 text-gray-400">Gerenciar dinâmica de seguidores.</p>
                    </Link>

                    <Link to="/admin/settings" className="group block p-6 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-all duration-300">
                        <div className="flex items-center">
                            <CogIcon className="w-8 h-8 text-primary" />
                            <h2 className="ml-4 text-xl font-semibold text-gray-100">Configurações</h2>
                        </div>
                        <p className="mt-2 text-gray-400">Dados da organização, equipe, regiões e planos.</p>
                    </Link>
                </div>
            </div>
        </div>
    );
};

export default AdminDashboard;
