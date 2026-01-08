
import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { auth } from '../firebase/config';
import { 
    UsersIcon, 
    MegaphoneIcon, 
    TicketIcon, 
    LogoutIcon, 
    CogIcon, 
    FaceIdIcon, 
    EnvelopeIcon, 
    WhatsAppIcon, 
    ChartBarIcon, 
    ClipboardDocumentListIcon, 
    ClockIcon, 
    UserPlusIcon,
    ShieldCheckIcon,
    SparklesIcon,
    AlertTriangleIcon
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

    const isSuperAdmin = adminData?.role === 'superadmin';

    return (
        <div className="pb-20">
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
                    {/* CARDS EXCLUSIVOS SUPERADMIN NO DASHBOARD PRINCIPAL */}
                    {isSuperAdmin && (
                        <>
                            <Link to="/admin/super" className="group block p-6 bg-indigo-600/20 rounded-3xl hover:bg-indigo-600 transition-all duration-300 border border-indigo-500/30 hover:border-transparent shadow-xl ring-1 ring-indigo-500/20">
                                <div className="flex items-center">
                                    <div className="p-3 rounded-2xl bg-indigo-500/20 text-indigo-400 group-hover:bg-white/20 group-hover:text-white transition-colors">
                                        <ShieldCheckIcon className="w-8 h-8" />
                                    </div>
                                    <h2 className="ml-4 text-xl font-black text-white uppercase tracking-tight">Super Painel</h2>
                                </div>
                                <p className="mt-4 text-gray-400 text-sm group-hover:text-indigo-100 line-clamp-2">Gestão global do sistema e configurações de rede.</p>
                                <div className="text-xs text-indigo-400 group-hover:text-white mt-4 font-black uppercase tracking-widest">Acesso Restrito &rarr;</div>
                            </Link>

                            <Link to="/admin/whatsapp-campaign" className="group block p-6 bg-green-600/10 rounded-3xl hover:bg-green-600 transition-all duration-300 border border-green-500/20 hover:border-transparent shadow-xl">
                                <div className="flex items-center">
                                    <div className="p-3 rounded-2xl bg-green-500/20 text-green-400 group-hover:bg-white/20 group-hover:text-white transition-colors">
                                        <WhatsAppIcon className="w-8 h-8" />
                                    </div>
                                    <h2 className="ml-4 text-xl font-black text-white uppercase tracking-tight">Campanhas WhatsApp</h2>
                                </div>
                                <p className="mt-4 text-gray-400 text-sm group-hover:text-green-100 line-clamp-2">Envios em massa para toda a base com IA.</p>
                                <div className="text-xs text-green-400 group-hover:text-white mt-4 font-black uppercase tracking-widest">Disparar Agora &rarr;</div>
                            </Link>
                        </>
                    )}

                    <Link to="/admin/whatsapp-reminders" className="group block p-6 bg-orange-600/10 rounded-3xl hover:bg-orange-600 transition-all duration-300 border border-orange-500/20 hover:border-transparent shadow-xl">
                        <div className="flex items-center">
                            <div className="p-3 rounded-2xl bg-orange-500/20 text-orange-400 group-hover:bg-white/20 group-hover:text-white transition-colors">
                                <AlertTriangleIcon className="w-8 h-8" />
                            </div>
                            <h2 className="ml-4 text-xl font-black text-white uppercase tracking-tight">Smart Cobrança</h2>
                        </div>
                        <p className="mt-4 text-gray-400 text-sm group-hover:text-orange-100 line-clamp-2">Cobrar prints esquecidos via WhatsApp.</p>
                        <div className="text-xs text-orange-400 group-hover:text-white mt-4 font-black uppercase tracking-widest">Sincronizar Atrasos &rarr;</div>
                    </Link>

                    <Link to="/admin/promoters" className="group block p-6 bg-gray-800/40 rounded-3xl hover:bg-primary transition-all duration-300 border border-white/5 hover:border-transparent shadow-xl">
                        <div className="flex items-center">
                            <div className="p-3 rounded-2xl bg-primary/20 text-primary group-hover:bg-white/20 group-hover:text-white transition-colors">
                                <UsersIcon className="w-8 h-8" />
                            </div>
                            <h2 className="ml-4 text-xl font-black text-white uppercase tracking-tight">Equipe</h2>
                        </div>
                        <p className="mt-4 text-gray-400 text-sm group-hover:text-purple-100 line-clamp-2">Aprovar cadastros e gerenciar histórico.</p>
                        <div className="text-xs text-primary group-hover:text-white mt-4 font-black uppercase tracking-widest">Acessar &rarr;</div>
                    </Link>

                    <Link to="/admin/recovery-leads" className="group block p-6 bg-gray-800/40 rounded-3xl hover:bg-green-600 transition-all duration-300 border border-white/5 hover:border-transparent shadow-xl">
                        <div className="flex items-center">
                            <div className="p-3 rounded-2xl bg-green-500/20 text-green-400 group-hover:bg-white/20 group-hover:text-white transition-colors">
                                <WhatsAppIcon className="w-8 h-8" />
                            </div>
                            <h2 className="ml-4 text-xl font-black text-white uppercase tracking-tight">Recuperação Equipe</h2>
                        </div>
                        <p className="mt-4 text-gray-400 text-sm group-hover:text-green-100 line-clamp-2">Contatar candidatas pendentes e suporte rápido.</p>
                        <div className="text-xs text-white mt-4 font-black uppercase tracking-widest">Acessar &rarr;</div>
                    </Link>

                    <Link to="/admin/club-vip" className="group block p-6 bg-gray-800/40 rounded-3xl hover:bg-amber-600 transition-all duration-300 border border-white/5 hover:border-transparent shadow-xl">
                        <div className="flex items-center">
                            <div className="p-3 rounded-2xl bg-amber-500/20 text-amber-400 group-hover:bg-white/20 group-hover:text-white transition-colors">
                                <TicketIcon className="w-8 h-8" />
                            </div>
                            <h2 className="ml-4 text-xl font-black text-white uppercase tracking-tight">Club VIP</h2>
                        </div>
                        <p className="mt-4 text-gray-400 text-sm group-hover:text-amber-100 line-clamp-2">Gestão de adesões, cupons e recuperação de e-mail.</p>
                        <div className="text-xs text-white mt-4 font-black uppercase tracking-widest">Acessar &rarr;</div>
                    </Link>

                    <Link to="/admin/posts" className="group block p-6 bg-gray-800/40 rounded-3xl hover:bg-primary transition-all duration-300 border border-white/5 hover:border-transparent shadow-xl">
                        <div className="flex items-center">
                            <div className="p-3 rounded-2xl bg-indigo-500/20 text-indigo-400 group-hover:bg-white/20 group-hover:text-white transition-colors">
                                <MegaphoneIcon className="w-8 h-8" />
                            </div>
                            <h2 className="ml-4 text-xl font-black text-white uppercase tracking-tight">Postagens</h2>
                        </div>
                        <p className="mt-4 text-gray-400 text-sm group-hover:text-indigo-100 line-clamp-2">Criar tarefas e validar prints.</p>
                        <div className="text-xs text-primary group-hover:text-white mt-4 font-black uppercase tracking-widest">Acessar &rarr;</div>
                    </Link>

                    <Link to="/admin/settings" className="group block p-6 bg-gray-800/40 rounded-3xl hover:bg-gray-700 transition-all duration-300 border border-white/5 hover:border-primary shadow-xl">
                        <div className="flex items-center">
                            <div className="p-3 rounded-2xl bg-gray-600/20 text-gray-400 group-hover:bg-white/20 group-hover:text-white transition-colors">
                                <CogIcon className="w-8 h-8" />
                            </div>
                            <h2 className="ml-4 text-xl font-black text-white uppercase tracking-tight">Ajustes</h2>
                        </div>
                        <p className="mt-4 text-gray-400 text-sm group-hover:text-white line-clamp-2">Configurações globais do sistema.</p>
                        <div className="text-xs text-primary group-hover:text-white mt-4 font-black uppercase tracking-widest">Acessar &rarr;</div>
                    </Link>
                </div>
            </div>
        </div>
    );
};

export default AdminDashboard;
