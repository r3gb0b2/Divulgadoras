
import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { auth } from '../firebase/config';
import { UsersIcon, MapPinIcon, ClipboardDocumentListIcon, MegaphoneIcon, ChartBarIcon, ClockIcon, TicketIcon, LogoutIcon, HeartIcon, CogIcon, SearchIcon, FaceIdIcon, EnvelopeIcon } from '../components/Icons';
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

    const isSuperAdmin = adminData?.role === 'superadmin';

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold text-white uppercase tracking-tighter">Painel de Controle</h1>
                <button onClick={handleLogout} className="px-4 py-2 bg-red-600 text-white rounded-xl hover:bg-red-700 flex items-center gap-2 font-bold text-sm transition-all shadow-lg shadow-red-900/20">
                    <LogoutIcon className="w-5 h-5" />
                    <span>Sair</span>
                </button>
            </div>

            <div className="bg-secondary/40 backdrop-blur-xl shadow-3xl rounded-[2.5rem] p-6 md:p-10 border border-white/5">
                <p className="text-gray-400 mb-8 font-medium">
                    Olá, <span className="text-white font-bold">{adminData?.email}</span>. Gerencie sua operação abaixo.
                </p>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <Link to="/admin/promoters" className="group block p-6 bg-gray-800/40 rounded-3xl hover:bg-primary transition-all duration-300 border border-white/5 hover:border-transparent shadow-xl">
                        <div className="flex items-center">
                            <div className="p-3 rounded-2xl bg-primary/20 text-primary group-hover:bg-white/20 group-hover:text-white transition-colors">
                                <UsersIcon className="w-8 h-8" />
                            </div>
                            <h2 className="ml-4 text-xl font-black text-white uppercase tracking-tight">Equipe</h2>
                        </div>
                        <p className="mt-4 text-gray-400 text-sm group-hover:text-purple-100 line-clamp-2">Aprovar cadastros, ver fotos e gerenciar histórico das divulgadoras.</p>
                        <div className="text-xs text-primary group-hover:text-white mt-4 font-black uppercase tracking-widest">Acessar &rarr;</div>
                    </Link>

                    <Link to="/admin/posts" className="group block p-6 bg-gray-800/40 rounded-3xl hover:bg-primary transition-all duration-300 border border-white/5 hover:border-transparent shadow-xl">
                        <div className="flex items-center">
                            <div className="p-3 rounded-2xl bg-indigo-500/20 text-indigo-400 group-hover:bg-white/20 group-hover:text-white transition-colors">
                                <MegaphoneIcon className="w-8 h-8" />
                            </div>
                            <h2 className="ml-4 text-xl font-black text-white uppercase tracking-tight">Postagens</h2>
                        </div>
                        <p className="mt-4 text-gray-400 text-sm group-hover:text-indigo-100 line-clamp-2">Criar tarefas, subir artes e validar os prints de comprovação.</p>
                    </Link>

                    {/* CARD: FILA DE PUSH (Agora visível APENAS para superadmin conforme solicitado) */}
                    {isSuperAdmin && (
                        <Link to="/admin/push-queue" className="group block p-6 bg-gray-800/40 rounded-3xl hover:bg-indigo-600 transition-all duration-300 border border-white/5 hover:border-transparent shadow-xl">
                            <div className="flex items-center">
                                <div className="p-3 rounded-2xl bg-indigo-500/20 text-indigo-400 group-hover:bg-white/20 group-hover:text-white transition-colors">
                                    <ClockIcon className="w-8 h-8" />
                                </div>
                                <h2 className="ml-4 text-xl font-black text-white uppercase tracking-tight">Fila de Push</h2>
                            </div>
                            <p className="mt-4 text-gray-400 text-sm group-hover:text-indigo-100 line-clamp-2">Monitore os lembretes automáticos de 6h agendados pelo sistema.</p>
                        </Link>
                    )}

                    <Link to="/admin/push-campaign" className="group block p-6 bg-gray-800/40 rounded-3xl hover:bg-primary transition-all duration-300 border border-white/5 hover:border-transparent shadow-xl">
                        <div className="flex items-center">
                            <div className="p-3 rounded-2xl bg-primary/20 text-primary group-hover:bg-white/20 group-hover:text-white transition-colors">
                                <FaceIdIcon className="w-8 h-8" />
                            </div>
                            <h2 className="ml-4 text-xl font-black text-white uppercase tracking-tight">Avisos Push</h2>
                        </div>
                        <p className="mt-4 text-gray-400 text-sm group-hover:text-purple-100 line-clamp-2">Envie notificações em tempo real para o celular de toda a equipe.</p>
                    </Link>

                    {isSuperAdmin && (
                         <Link to="/admin/newsletter" className="group block p-6 bg-gray-800/40 rounded-3xl hover:bg-blue-600 transition-all duration-300 border border-white/5 hover:border-transparent shadow-xl">
                            <div className="flex items-center">
                                <div className="p-3 rounded-2xl bg-blue-500/20 text-blue-400 group-hover:bg-white/20 group-hover:text-white transition-colors">
                                    <EnvelopeIcon className="w-8 h-8" />
                                </div>
                                <h2 className="ml-4 text-xl font-black text-white uppercase tracking-tight">Newsletter</h2>
                            </div>
                            <p className="mt-4 text-gray-400 text-sm group-hover:text-blue-100 line-clamp-2">Envie e-mails em massa para as divulgadoras de toda a base.</p>
                        </Link>
                    )}

                    <Link to="/admin/lists" className="group block p-6 bg-gray-800/40 rounded-3xl hover:bg-primary transition-all duration-300 border border-white/5 hover:border-transparent shadow-xl">
                        <div className="flex items-center">
                            <div className="p-3 rounded-2xl bg-purple-500/20 text-purple-400 group-hover:bg-white/20 group-hover:text-white transition-colors">
                                <ClipboardDocumentListIcon className="w-8 h-8" />
                            </div>
                            <h2 className="ml-4 text-xl font-black text-white uppercase tracking-tight">Listas VIP</h2>
                        </div>
                        <p className="mt-4 text-gray-400 text-sm group-hover:text-purple-100 line-clamp-2">Gerencie nomes de convidados e links exclusivos para cada divulgadora.</p>
                    </Link>

                    <Link to="/admin/dashboard" className="group block p-6 bg-gray-800/40 rounded-3xl hover:bg-primary transition-all duration-300 border border-white/5 hover:border-transparent shadow-xl">
                        <div className="flex items-center">
                            <div className="p-3 rounded-2xl bg-green-500/20 text-green-400 group-hover:bg-white/20 group-hover:text-white transition-colors">
                                <ChartBarIcon className="w-8 h-8" />
                            </div>
                            <h2 className="ml-4 text-xl font-black text-white uppercase tracking-tight">Desempenho</h2>
                        </div>
                        <p className="mt-4 text-gray-400 text-sm group-hover:text-green-100 line-clamp-2">Analise o ranking e a taxa de postagem de cada membro da equipe.</p>
                    </Link>

                    <Link to="/admin/checkin-dashboard" className="group block p-6 bg-gray-800/40 rounded-3xl hover:bg-primary transition-all duration-300 border border-white/5 hover:border-transparent shadow-xl">
                        <div className="flex items-center">
                            <div className="p-3 rounded-2xl bg-orange-500/20 text-orange-400 group-hover:bg-white/20 group-hover:text-white transition-colors">
                                <TicketIcon className="w-8 h-8" />
                            </div>
                            <h2 className="ml-4 text-xl font-black text-white uppercase tracking-tight">Check-in</h2>
                        </div>
                        <p className="mt-4 text-gray-400 text-sm group-hover:text-orange-100 line-clamp-2">Controle a entrada no evento via Lista ou Scanner QR Code.</p>
                    </Link>

                    <Link to="/admin/settings" className="group block p-6 bg-gray-800/40 rounded-3xl hover:bg-gray-700 transition-all duration-300 border border-white/5 hover:border-primary shadow-xl">
                        <div className="flex items-center">
                            <div className="p-3 rounded-2xl bg-gray-600/20 text-gray-400 group-hover:bg-white/20 group-hover:text-white transition-colors">
                                <CogIcon className="w-8 h-8" />
                            </div>
                            <h2 className="ml-4 text-xl font-black text-white uppercase tracking-tight">Ajustes</h2>
                        </div>
                        <p className="mt-4 text-gray-400 text-sm group-hover:text-white line-clamp-2">Configurações de equipe, eventos, estados e dados da organização.</p>
                    </Link>
                </div>
            </div>
        </div>
    );
};

export default AdminDashboard;
