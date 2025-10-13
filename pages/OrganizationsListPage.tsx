import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getOrganizations } from '../services/organizationService';
import { Organization } from '../types';

const OrganizationsListPage: React.FC = () => {
    const [organizations, setOrganizations] = useState<Organization[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchOrgs = async () => {
            setIsLoading(true);
            try {
                const orgs = await getOrganizations();
                setOrganizations(orgs);
            } catch (err: any) {
                setError(err.message || 'Failed to load organizations.');
            } finally {
                setIsLoading(false);
            }
        };
        fetchOrgs();
    }, []);
    
    if (isLoading) {
        return <div className="text-center py-10">Loading organizations...</div>;
    }

    if (error) {
        return <div className="text-red-500 text-center py-10">{error}</div>;
    }

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold">Organizações</h1>
                <Link to="/admin" className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-500 text-sm">
                    &larr; Voltar ao Dashboard
                </Link>
            </div>
            <div className="bg-secondary shadow-lg rounded-lg p-6">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-700">
                        <thead className="bg-gray-700">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Nome da Organização</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Proprietário (Email)</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Plano</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Status</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Visibilidade</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="bg-secondary divide-y divide-gray-700">
                            {organizations.map(org => (
                                <tr key={org.id}>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white">{org.name}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">{org.ownerEmail}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                                        <span className={`capitalize px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${org.planId === 'professional' ? 'bg-blue-900/50 text-blue-300' : 'bg-green-900/50 text-green-300'}`}>
                                            {org.planId}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                                         <span className={`capitalize px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${org.status === 'active' ? 'bg-green-900/50 text-green-300' : 'bg-red-900/50 text-red-300'}`}>
                                            {org.status === 'active' ? 'Ativa' : 'Inativa'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                                         <span className={`capitalize px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${org.isPublic ? 'bg-sky-900/50 text-sky-300' : 'bg-gray-600 text-gray-300'}`}>
                                            {org.isPublic ? 'Pública' : 'Oculta'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                        <Link to={`/admin/organization/${org.id}`} className="text-indigo-400 hover:text-indigo-300">
                                            Gerenciar
                                        </Link>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default OrganizationsListPage;
