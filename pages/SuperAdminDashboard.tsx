import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { getOrganizations } from '../services/organizationService';
import { Organization } from '../types';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase/config';
import { HomeIcon, UsersIcon, MapPinIcon, AdminUsersIcon, KeyIcon } from '../components/Icons';

const planDetails: { [key in 'basic' | 'professional']: { name: string; price: number } } = {
    basic: { name: 'Básico', price: 49 },
    professional: { name: 'Profissional', price: 99 }
};

const SuperAdminDashboard: React.FC = () => {
    const [organizations, setOrganizations] = useState<Organization[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchOrgs = async () => {
            setIsLoading(true);
            try {
                const orgsData = await getOrganizations();
                setOrganizations(orgsData);
            } catch (err) {
                setError("Falha ao carregar as organizações.");
            } finally {
                setIsLoading(false);
            }
        };
        fetchOrgs();
    }, []);

    const stats = useMemo(() => {
        const activeSubscriptions = organizations.filter(org => org.subscriptionStatus === 'active');
        const mrr = activeSubscriptions.reduce((total, org) => {
            return total + (planDetails[org.planId]?.price || 0);
        }, 0);

        return {
            totalOrgs: organizations.length,
            activeSubs: activeSubscriptions.length,
            mrr: mrr.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
        };
    }, [organizations]);
    
    const handleLogout = async () => {
        try {
            await signOut(auth);
        } catch (error) {
            console.error("Logout failed", error);
        }
    };

    const getStatusBadge = (status: Organization['subscriptionStatus']) => {
        const styles = {
            active: "bg-green-900/50 text-green-300",
            trialing: "bg-sky-900/50 text-sky-300",
            canceled: "bg-yellow-900/50 text-yellow-300",
            expired: "bg-red-900/50 text-red-300",
        };
        const text = {
            active: "Ativa",
            trialing: "Trial",
            canceled: "Cancelada",
            expired: "Expirada",
        };
        return <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${styles[status]}`}>{text[status]}</span>;
    };


    return (
        <div>
            <div className="flex justify-between items-center mb-6 flex-wrap gap-2">
                <h1 className="text-3xl font-bold flex items-center"><HomeIcon className="w-8 h-8 mr-3 text-primary"/>Super Admin Dashboard</h1>
                 <button onClick={handleLogout} className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700">
                    Sair
                </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                <div className="bg-secondary p-5 rounded-lg shadow">
                    <h3 className="text-sm font-medium text-gray-400 truncate">Total de Organizações</h3>
                    <p className="mt-1 text-3xl font-semibold text-white">{stats.totalOrgs}</p>
                </div>
                <div className="bg-secondary p-5 rounded-lg shadow">
                    <h3 className="text-sm font-medium text-gray-400 truncate">Assinaturas Ativas</h3>
                    <p className="mt-1 text-3xl font-semibold text-green-400">{stats.activeSubs}</p>
                </div>
                <div className="bg-secondary p-5 rounded-lg shadow">
                    <h3 className="text-sm font-medium text-gray-400 truncate">Receita Mensal (MRR)</h3>
                    <p className="mt-1 text-3xl font-semibold text-primary">{stats.mrr}</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                 <Link to="/admin/promoters" className="group block p-6 bg-secondary rounded-lg shadow hover:bg-gray-800 transition-colors">
                    <div className="flex items-center">
                        <UsersIcon className="w-8 h-8 text-primary"/>
                        <h2 className="ml-4 text-xl font-semibold text-gray-100">Ver Todas Divulgadoras</h2>
                    </div>
                    <p className="mt-2 text-gray-400">Visualize as inscrições de todas as organizações.</p>
                 </Link>
                 <Link to="/admin/states" className="group block p-6 bg-secondary rounded-lg shadow hover:bg-gray-800 transition-colors">
                    <div className="flex items-center">
                        <MapPinIcon className="w-8 h-8 text-primary"/>
                        <h2 className="ml-4 text-xl font-semibold text-gray-100">Gerenciar Localidades</h2>
                    </div>
                    <p className="mt-2 text-gray-400">Ative localidades e defina regras gerais.</p>
                 </Link>
                 <Link to="/admin/users" className="group block p-6 bg-secondary rounded-lg shadow hover:bg-gray-800 transition-colors">
                    <div className="flex items-center">
                        <AdminUsersIcon className="w-8 h-8 text-primary"/>
                        <h2 className="ml-4 text-xl font-semibold text-gray-100">Gerenciar Admins</h2>
                    </div>
                    <p className="mt-2 text-gray-400">Adicione ou remova administradores dos clientes.</p>
                 </Link>
                 <Link to="/admin/settings/mercado-pago" className="group block p-6 bg-secondary rounded-lg shadow hover:bg-gray-800 transition-colors">
                    <div className="flex items-center">
                        <KeyIcon className="w-8 h-8 text-primary"/>
                        <h2 className="ml-4 text-xl font-semibold text-gray-100">Credenciais de Pagamento</h2>
                    </div>
                    <p className="mt-2 text-gray-400">Configure as chaves de API do Mercado Pago.</p>
                 </Link>
            </div>

            <div className="bg-secondary shadow-lg rounded-lg p-6">
                <h2 className="text-xl font-semibold mb-4">Organizações Clientes</h2>
                 <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-700">
                        <thead className="bg-gray-700/50">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Organização</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Plano</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Status</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Expira em</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-700">
                            {isLoading ? (
                                <tr><td colSpan={4} className="text-center py-4">Carregando...</td></tr>
                            ) : error ? (
                                <tr><td colSpan={4} className="text-center py-4 text-red-400">{error}</td></tr>
                            ) : (
                                organizations.map(org => (
                                    <tr key={org.id}>
                                        <td className="px-4 py-4 whitespace-nowrap">
                                            <p className="font-semibold text-white">{org.name}</p>
                                            <p className="text-sm text-gray-400">{org.ownerEmail}</p>
                                        </td>
                                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-300">
                                            {planDetails[org.planId]?.name || org.planId}
                                        </td>
                                        <td className="px-4 py-4 whitespace-nowrap">
                                            {getStatusBadge(org.subscriptionStatus)}
                                        </td>
                                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-300">
                                            {org.subscriptionExpiresAt?.toDate().toLocaleDateString('pt-BR') || 'N/A'}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                 </div>
            </div>

        </div>
    );
};

export default SuperAdminDashboard;