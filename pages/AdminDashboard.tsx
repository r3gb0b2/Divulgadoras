
import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { auth, firestore } from '../firebase/config';
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
    AlertTriangleIcon,
    CheckCircleIcon
} from '../components/Icons';
import { useAdminAuth } from '../contexts/AdminAuthContext';

const AdminDashboard: React.FC = () => {
    const { adminData, selectedOrgId } = useAdminAuth();
    const navigate = useNavigate();
    const [quickStats, setQuickStats] = useState({ promoters: 0, pendingTasks: 0, activeEvents: 0 });

    useEffect(() => {
        if (selectedOrgId) {
            // Busca contagem rápida para o Dashboard
            firestore.collection('promoters').where('organizationId', '==', selectedOrgId).where('status', '==', 'approved').get().then(snap => {
                setQuickStats(prev => ({ ...prev, promoters: snap.size }));
            });
            firestore.collection('campaigns').where('organizationId', '==', selectedOrgId).where('status', '==', 'active').get().then(snap => {
                setQuickStats(prev => ({ ...prev, activeEvents: snap.size }));
            });
        }
    }, [selectedOrgId]);

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
                <div>
                    <h1 className="text-3xl font-bold text-white uppercase tracking-tighter">Painel de Controle</h1>
                    <p className="text-gray-500 text-[10px] font-black uppercase tracking-widest mt-1">Gestão Estratégica • {adminData?.email.split('@')[0]}</p>
                </div>
                <button onClick={handleLogout} className="px-4 py-2 bg-red-600/10 text-red-500 border border-red-500/20 rounded-xl hover:bg-red-600 hover:text-white flex items-center gap-2 font-bold text-xs transition-all">
                    <LogoutIcon className="w-5 h-5" />
                    <span>Sair</span>
                </button>
            </div>

            {/* QUICK MONITORING WIDGETS */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                <div className="bg-secondary/60 border border-white/5 p-6 rounded-[2rem] shadow-xl">
                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Equipe Ativa</p>
                    <div className="flex items-end gap-2">
                        <span className="text-3xl font-black text-white leading-none">{quickStats.promoters}</span>
                        <span className="text-green-500 text-[10px] font-bold mb-1">Meninas</span>
                    </div>
                </div>
                <div className="bg-secondary/60 border border-white/5 p-6 rounded-[2rem] shadow-xl">
                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Eventos Ativos</p>
                    <div className="flex items-end gap-2">
                        <span className="text-3xl font-black text-primary leading-none">{quickStats.activeEvents}</span>
                        <span className="text-primary/50 text-[10px] font-bold mb-1">Campanhas</span>
                    </div>
                </div>
                <div className="bg-primary/10 border border-primary/20 p-6 rounded-[2rem] shadow-xl relative overflow-hidden group cursor-pointer" onClick={() => navigate('/admin/whatsapp-reminders')}>
                    <SparklesIcon className="absolute -right-2 -bottom-2 w-16 h-16 text-primary/10 group-hover:scale-110 transition-transform" />
                    <p className="text-[10px] font-black text-primary uppercase tracking-widest mb-1">Status Sistema</p>
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                        <span className="text-lg font-black text-white uppercase tracking-tighter">Online & Pronto</span>
                    </div>
                </div>
            </div>

            <div className="bg-secondary/40 backdrop-blur-xl shadow-3xl rounded-[2.5rem] p-6 md:p-10 border border-white/5">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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
                            </Link>

                            <Link to="/admin/whatsapp-campaign" className="group block p-6 bg-green-600/10 rounded-3xl hover:bg-green-600 transition-all duration-300 border border-green-500/20 hover:border-transparent shadow-xl">
                                <div className="flex items-center">
                                    <div className="p-3 rounded-2xl bg-green-500/20 text-green-400 group-hover:bg-white/20 group-hover:text-white transition-colors">
                                        <WhatsAppIcon className="w-8 h-8" />
                                    </div>
                                    <h2 className="ml-4 text-xl font-black text-white uppercase tracking-tight">Campanhas Massivas</h2>
                                </div>
                                <p className="mt-4 text-gray-400 text-sm group-hover:text-green-100 line-clamp-2">Envios em massa para toda a base com inteligência artificial.</p>
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
                        <p className="mt-4 text-gray-400 text-sm group-hover:text-orange-100 line-clamp-2">Cobrar prints esquecidos via WhatsApp automaticamente.</p>
                    </Link>

                    <Link to="/admin/promoters" className="group block p-6 bg-gray-800/40 rounded-3xl hover:bg-primary transition-all duration-300 border border-white/5 hover:border-transparent shadow-xl">
                        <div className="flex items-center">
                            <div className="p-3 rounded-2xl bg-primary/20 text-primary group-hover:bg-white/20 group-hover:text-white transition-colors">
                                <UsersIcon className="w-8 h-8" />
                            </div>
                            <h2 className="ml-4 text-xl font-black text-white uppercase tracking-tight">Equipe Ativa</h2>
                        </div>
                        <p className="mt-4 text-gray-400 text-sm group-hover:text-purple-100 line-clamp-2">Aprovar novos cadastros e gerenciar histórico completo.</p>
                    </Link>

                    <Link to="/admin/recovery-leads" className="group block p-6 bg-gray-800/40 rounded-3xl hover:bg-green-600 transition-all duration-300 border border-white/5 hover:border-transparent shadow-xl">
                        <div className="flex items-center">
                            <div className="p-3 rounded-2xl bg-green-500/20 text-green-400 group-hover:bg-white/20 group-hover:text-white transition-colors">
                                <WhatsAppIcon className="w-8 h-8" />
                            </div>
                            <h2 className="ml-4 text-xl font-black text-white uppercase tracking-tight">Recuperação</h2>
                        </div>
                        <p className="mt-4 text-gray-400 text-sm group-hover:text-green-100 line-clamp-2">Contatar candidatas pendentes e suporte rápido.</p>
                    </Link>

                    <Link to="/admin/club-vip" className="group block p-6 bg-gray-800/40 rounded-3xl hover:bg-amber-600 transition-all duration-300 border border-white/5 hover:border-transparent shadow-xl">
                        <div className="flex items-center">
                            <div className="p-3 rounded-2xl bg-amber-500/20 text-amber-400 group-hover:bg-white/20 group-hover:text-white transition-colors">
                                <TicketIcon className="w-8 h-8" />
                            </div>
                            <h2 className="ml-4 text-xl font-black text-white uppercase tracking-tight">Club VIP</h2>
                        </div>
                        <p className="mt-4 text-gray-400 text-sm group-hover:text-amber-100 line-clamp-2">Gestão de adesões pagas, cupons e ingressos digitais.</p>
                    </Link>

                    <Link to="/admin/posts" className="group block p-6 bg-gray-800/40 rounded-3xl hover:bg-primary transition-all duration-300 border border-white/5 hover:border-transparent shadow-xl">
                        <div className="flex items-center">
                            <div className="p-3 rounded-2xl bg-indigo-500/20 text-indigo-400 group-hover:bg-white/20 group-hover:text-white transition-colors">
                                <MegaphoneIcon className="w-8 h-8" />
                            </div>
                            <h2 className="ml-4 text-xl font-black text-white uppercase tracking-tight">Campanhas</h2>
                        </div>
                        <p className="mt-4 text-gray-400 text-sm group-hover:text-indigo-100 line-clamp-2">Criar tarefas de postagem e validar prints de story.</p>
                    </Link>

                    <Link to="/admin/settings" className="group block p-6 bg-gray-800/40 rounded-3xl hover:bg-gray-700 transition-all duration-300 border border-white/5 hover:border-primary shadow-xl">
                        <div className="flex items-center">
                            <div className="p-3 rounded-2xl bg-gray-600/20 text-gray-400 group-hover:bg-white/20 group-hover:text-white transition-colors">
                                <CogIcon className="w-8 h-8" />
                            </div>
                            <h2 className="ml-4 text-xl font-black text-white uppercase tracking-tight">Configurações</h2>
                        </div>
                        <p className="mt-4 text-gray-400 text-sm group-hover:text-white line-clamp-2">Personalização da produtora e regras de acesso.</p>
                    </Link>
                </div>
            </div>
        </div>
    );
};

export default AdminDashboard;
