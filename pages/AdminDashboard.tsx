
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
    const [quickStats, setQuickStats] = useState({ 
        promoters: 0, 
        pendingApproval: 0, 
        activeEvents: 0,
        todayRegistrations: 0 
    });

    useEffect(() => {
        if (selectedOrgId) {
            const now = new Date();
            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

            // Total de Ativas
            firestore.collection('promoters')
                .where('organizationId', '==', selectedOrgId)
                .where('status', '==', 'approved')
                .get().then(snap => {
                    setQuickStats(prev => ({ ...prev, promoters: snap.size }));
                });

            // Pendentes de Aprovação
            firestore.collection('promoters')
                .where('organizationId', '==', selectedOrgId)
                .where('status', '==', 'pending')
                .get().then(snap => {
                    setQuickStats(prev => ({ ...prev, pendingApproval: snap.size }));
                });

            // Inscritas hoje
            firestore.collection('promoters')
                .where('organizationId', '==', selectedOrgId)
                .where('createdAt', '>=', today)
                .get().then(snap => {
                    setQuickStats(prev => ({ ...prev, todayRegistrations: snap.size }));
                });

            // Eventos Ativos
            firestore.collection('campaigns')
                .where('organizationId', '==', selectedOrgId)
                .where('status', '==', 'active')
                .get().then(snap => {
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
        <div className="pb-40 px-4 md:px-0">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-4">
                <div>
                    <h1 className="text-4xl font-black text-white uppercase tracking-tighter">Command Center</h1>
                    <p className="text-primary font-black text-[10px] uppercase tracking-[0.3em] mt-1">Gestão de Equipes Equipe Certa</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="hidden md:block text-right mr-4">
                        <p className="text-white font-bold text-sm uppercase">{adminData?.email.split('@')[0]}</p>
                        <p className="text-gray-500 text-[10px] font-black uppercase tracking-widest">{adminData?.role}</p>
                    </div>
                    <button onClick={handleLogout} className="p-3 bg-red-600/10 text-red-500 border border-red-500/20 rounded-2xl hover:bg-red-600 hover:text-white transition-all shadow-lg">
                        <LogoutIcon className="w-6 h-6" />
                    </button>
                </div>
            </div>

            {/* HIGH-END METRICS GRID */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
                <div className="bg-secondary/60 backdrop-blur-xl border border-white/5 p-8 rounded-[2.5rem] shadow-2xl relative overflow-hidden group">
                    <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:opacity-10 transition-opacity">
                        <UsersIcon className="w-24 h-24 text-white" />
                    </div>
                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Equipe Ativa</p>
                    <div className="flex items-baseline gap-2">
                        <span className="text-5xl font-black text-white tracking-tighter">{quickStats.promoters}</span>
                        <span className="text-green-500 text-xs font-black uppercase">Membros</span>
                    </div>
                </div>

                <div className="bg-secondary/60 backdrop-blur-xl border border-white/5 p-8 rounded-[2.5rem] shadow-2xl relative overflow-hidden group">
                    <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:opacity-10 transition-opacity">
                        <AlertTriangleIcon className="w-24 h-24 text-yellow-500" />
                    </div>
                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Para Aprovação</p>
                    <div className="flex items-baseline gap-2">
                        <span className="text-5xl font-black text-yellow-500 tracking-tighter">{quickStats.pendingApproval}</span>
                        <span className="text-yellow-500/50 text-xs font-black uppercase">Pendentes</span>
                    </div>
                </div>

                <div className="bg-secondary/60 backdrop-blur-xl border border-white/5 p-8 rounded-[2.5rem] shadow-2xl relative overflow-hidden group">
                    <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:opacity-10 transition-opacity">
                        <SparklesIcon className="w-24 h-24 text-primary" />
                    </div>
                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Novas Hoje</p>
                    <div className="flex items-baseline gap-2">
                        <span className="text-5xl font-black text-primary tracking-tighter">{quickStats.todayRegistrations}</span>
                        <span className="text-primary/50 text-xs font-black uppercase">Inscrições</span>
                    </div>
                </div>

                <div className="bg-secondary/60 backdrop-blur-xl border border-white/5 p-8 rounded-[2.5rem] shadow-2xl relative overflow-hidden group">
                    <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:opacity-10 transition-opacity">
                        <CheckCircleIcon className="w-24 h-24 text-green-500" />
                    </div>
                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Eventos Ativos</p>
                    <div className="flex items-baseline gap-2">
                        <span className="text-5xl font-black text-white tracking-tighter">{quickStats.activeEvents}</span>
                        <span className="text-gray-500 text-xs font-black uppercase">Listas</span>
                    </div>
                </div>
            </div>

            <div className="bg-secondary/40 backdrop-blur-2xl shadow-3xl rounded-[3rem] p-6 md:p-12 border border-white/5">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {isSuperAdmin && (
                        <>
                            <Link to="/admin/super" className="group block p-8 bg-indigo-600/10 rounded-[2rem] hover:bg-indigo-600 transition-all duration-500 border border-indigo-500/20 hover:border-transparent shadow-xl">
                                <div className="flex items-center mb-6">
                                    <div className="p-4 rounded-2xl bg-indigo-500/20 text-indigo-400 group-hover:bg-white/20 group-hover:text-white transition-colors">
                                        <ShieldCheckIcon className="w-8 h-8" />
                                    </div>
                                    <h2 className="ml-5 text-2xl font-black text-white uppercase tracking-tight">Super Admin</h2>
                                </div>
                                <p className="text-gray-400 text-sm group-hover:text-indigo-100 font-medium">Controle total de organizações e faturamento global do sistema.</p>
                            </Link>

                            <Link to="/admin/whatsapp-campaign" className="group block p-8 bg-green-600/10 rounded-[2rem] hover:bg-green-600 transition-all duration-500 border border-green-500/20 hover:border-transparent shadow-xl">
                                <div className="flex items-center mb-6">
                                    <div className="p-4 rounded-2xl bg-green-500/20 text-green-400 group-hover:bg-white/20 group-hover:text-white transition-colors">
                                        <WhatsAppIcon className="w-8 h-8" />
                                    </div>
                                    <h2 className="ml-5 text-2xl font-black text-white uppercase tracking-tight">Campanhas</h2>
                                </div>
                                <p className="text-gray-400 text-sm group-hover:text-green-100 font-medium">Envio de convites e comunicados massivos via API Sure e IA.</p>
                            </Link>
                        </>
                    )}

                    <Link to="/admin/promoters" className="group block p-8 bg-gray-800/40 rounded-[2rem] hover:bg-primary transition-all duration-500 border border-white/5 hover:border-transparent shadow-xl">
                        <div className="flex items-center mb-6">
                            <div className="p-4 rounded-2xl bg-primary/20 text-primary group-hover:bg-white/20 group-hover:text-white transition-colors">
                                <UsersIcon className="w-8 h-8" />
                            </div>
                            <h2 className="ml-5 text-2xl font-black text-white uppercase tracking-tight">Gestão Equipe</h2>
                        </div>
                        <p className="text-gray-400 text-sm group-hover:text-purple-100 font-medium">Aprovação de novos perfis e controle de divulgadoras ativas.</p>
                    </Link>

                    <Link to="/admin/posts" className="group block p-8 bg-gray-800/40 rounded-[2rem] hover:bg-primary transition-all duration-500 border border-white/5 hover:border-transparent shadow-xl">
                        <div className="flex items-center mb-6">
                            <div className="p-4 rounded-2xl bg-indigo-500/20 text-indigo-400 group-hover:bg-white/20 group-hover:text-white transition-colors">
                                <MegaphoneIcon className="w-8 h-8" />
                            </div>
                            <h2 className="ml-5 text-2xl font-black text-white uppercase tracking-tight">Tarefas</h2>
                        </div>
                        <p className="text-gray-400 text-sm group-hover:text-indigo-100 font-medium">Crie postagens e valide prints de story enviados pela equipe.</p>
                    </Link>

                    <Link to="/admin/club-vip" className="group block p-8 bg-gray-800/40 rounded-[2rem] hover:bg-amber-600 transition-all duration-500 border border-white/5 hover:border-transparent shadow-xl">
                        <div className="flex items-center mb-6">
                            <div className="p-4 rounded-2xl bg-amber-500/20 text-amber-400 group-hover:bg-white/20 group-hover:text-white transition-colors">
                                <TicketIcon className="w-8 h-8" />
                            </div>
                            <h2 className="ml-5 text-2xl font-black text-white uppercase tracking-tight">Club VIP</h2>
                        </div>
                        <p className="text-gray-400 text-sm group-hover:text-amber-100 font-medium">Gestão de ingressos promocionais pagos e adesões de membros.</p>
                    </Link>

                    <Link to="/admin/settings" className="group block p-8 bg-gray-800/40 rounded-[2rem] hover:bg-gray-700 transition-all duration-500 border border-white/5 hover:border-primary shadow-xl">
                        <div className="flex items-center mb-6">
                            <div className="p-4 rounded-2xl bg-gray-600/20 text-gray-400 group-hover:bg-white/20 group-hover:text-white transition-colors">
                                <CogIcon className="w-8 h-8" />
                            </div>
                            <h2 className="ml-5 text-2xl font-black text-white uppercase tracking-tight">Settings</h2>
                        </div>
                        <p className="text-gray-400 text-sm group-hover:text-white font-medium">Configuração de regiões, eventos e permissões de acesso.</p>
                    </Link>
                </div>
            </div>
            
            <div className="mt-12 text-center">
                <p className="text-[9px] text-gray-700 uppercase font-black tracking-[0.4em]">Equipe Certa • High Performance Management</p>
            </div>
        </div>
    );
};

export default AdminDashboard;
