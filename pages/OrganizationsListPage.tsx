import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { getOrganizations } from '../services/organizationService';
import { Organization, OrganizationStatus } from '../types';
import { Timestamp } from 'firebase/firestore';

const OrganizationsListPage: React.FC = () => {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOrganizations = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const orgs = await getOrganizations();
      // Sort by creation date descending
      orgs.sort((a, b) => (b.createdAt as Timestamp).toMillis() - (a.createdAt as Timestamp).toMillis());
      setOrganizations(orgs);
    } catch (err: any) {
      setError(err.message || "Não foi possível carregar as organizações.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrganizations();
  }, [fetchOrganizations]);

  const getStatusBadge = (status: OrganizationStatus) => {
    const styles: Record<OrganizationStatus, string> = {
      active: "bg-green-900/50 text-green-300",
      trial: "bg-blue-900/50 text-blue-300",
      expired: "bg-red-900/50 text-red-300",
      hidden: "bg-gray-700 text-gray-400",
    };
    const text: Record<OrganizationStatus, string> = {
      active: "Ativa",
      trial: "Teste",
      expired: "Expirada",
      hidden: "Oculta",
    };
    return <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${styles[status]}`}>{text[status]}</span>;
  };
  
  const formatDate = (timestamp: Timestamp | undefined) => {
    if (!timestamp) return 'N/A';
    return timestamp.toDate().toLocaleDateString('pt-BR');
  }

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex justify-center items-center py-10">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      );
    }

    if (error) {
      return <p className="text-red-400 text-center">{error}</p>;
    }

    return (
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-700">
          <thead className="bg-gray-700/50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Organização</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Plano</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Data de Criação</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {organizations.map(org => (
              <tr key={org.id} className="hover:bg-gray-700/40">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-white">{org.name}</div>
                  <div className="text-sm text-gray-400">{org.ownerEmail}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">{getStatusBadge(org.status)}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300 capitalize">{org.planId}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{formatDate(org.createdAt as Timestamp)}</td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <Link to={`/admin/organization/${org.id}`} className="text-primary hover:text-primary-dark">
                    Gerenciar
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Gerenciar Organizações</h1>
        <Link to="/admin" className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-500 text-sm">
          &larr; Voltar ao Painel
        </Link>
      </div>
      <div className="bg-secondary shadow-lg rounded-lg p-6">
        {renderContent()}
      </div>
    </div>
  );
};

export default OrganizationsListPage;
