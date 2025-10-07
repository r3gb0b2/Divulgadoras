
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { getPromoters, updatePromoter, deletePromoter } from '../services/promoterService';
import { Promoter } from '../types';
import EditPromoterModal from '../components/EditPromoterModal';

const AdminPanel: React.FC = () => {
  const [promoters, setPromoters] = useState<Promoter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
  const [selectedPromoter, setSelectedPromoter] = useState<Promoter | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  
  const fetchPromoters = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getPromoters();
      setPromoters(data);
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar dados.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPromoters();
  }, [fetchPromoters]);

  const handleUpdateStatus = async (id: string, status: 'approved' | 'rejected') => {
    try {
      await updatePromoter(id, { status });
      setPromoters(prev => prev.map(p => p.id === id ? { ...p, status } : p));
    } catch (error) {
        console.error(error);
      alert('Falha ao atualizar status.');
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Tem certeza que deseja deletar este cadastro? Esta ação não pode ser desfeita.')) {
        try {
            await deletePromoter(id);
            setPromoters(prev => prev.filter(p => p.id !== id));
        } catch (error) {
            console.error(error);
            alert('Falha ao deletar.');
        }
    }
  }

  const handleSaveFromModal = async (id: string, data: Partial<Omit<Promoter, 'id'>>) => {
      await updatePromoter(id, data);
      await fetchPromoters(); // Refetch all data to ensure consistency
  };

  const openEditModal = (promoter: Promoter) => {
    setSelectedPromoter(promoter);
    setIsEditModalOpen(true);
  };
  
  const filteredPromoters = useMemo(() => {
    if (filter === 'all') return promoters;
    return promoters.filter(p => p.status === filter);
  }, [promoters, filter]);

  const StatusBadge: React.FC<{ status: Promoter['status'] }> = ({ status }) => {
    const styles = {
        pending: 'bg-yellow-100 text-yellow-800',
        approved: 'bg-green-100 text-green-800',
        rejected: 'bg-red-100 text-red-800',
    };
    const text = {
        pending: 'Pendente',
        approved: 'Aprovado',
        rejected: 'Rejeitado',
    }
    return <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${styles[status]}`}>{text[status]}</span>
  }
  
  return (
    <div className="bg-white dark:bg-gray-800 shadow-2xl rounded-lg p-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">Painel Administrativo</h1>
        
        <div className="flex space-x-2 mb-6">
            <button onClick={() => setFilter('pending')} className={`px-4 py-2 rounded-md text-sm font-medium ${filter === 'pending' ? 'bg-primary text-white' : 'bg-gray-200 dark:bg-gray-700'}`}>Pendentes</button>
            <button onClick={() => setFilter('approved')} className={`px-4 py-2 rounded-md text-sm font-medium ${filter === 'approved' ? 'bg-primary text-white' : 'bg-gray-200 dark:bg-gray-700'}`}>Aprovados</button>
            <button onClick={() => setFilter('rejected')} className={`px-4 py-2 rounded-md text-sm font-medium ${filter === 'rejected' ? 'bg-primary text-white' : 'bg-gray-200 dark:bg-gray-700'}`}>Rejeitados</button>
            <button onClick={() => setFilter('all')} className={`px-4 py-2 rounded-md text-sm font-medium ${filter === 'all' ? 'bg-primary text-white' : 'bg-gray-200 dark:bg-gray-700'}`}>Todos</button>
        </div>

        {loading && <p>Carregando...</p>}
        {error && <p className="text-red-500">Erro: {error}</p>}
        {!loading && !error && (
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-700">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Nome</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Contato</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Status</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Data</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Ações</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                        {filteredPromoters.map(p => (
                            <tr key={p.id}>
                                <td className="px-6 py-4 whitespace-nowrap">{p.name} ({p.age} anos)</td>
                                <td className="px-6 py-4 whitespace-nowrap">{p.email}<br/>{p.whatsapp}</td>
                                <td className="px-6 py-4 whitespace-nowrap"><StatusBadge status={p.status} /></td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{p.createdAt.toDate().toLocaleDateString()}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                                    {p.status === 'pending' && (
                                        <>
                                            <button onClick={() => handleUpdateStatus(p.id, 'approved')} className="text-green-600 hover:text-green-900">Aprovar</button>
                                            <button onClick={() => handleUpdateStatus(p.id, 'rejected')} className="text-red-600 hover:text-red-900">Rejeitar</button>
                                        </>
                                    )}
                                    <button onClick={() => openEditModal(p)} className="text-indigo-600 hover:text-indigo-900">Ver/Editar</button>
                                    <button onClick={() => handleDelete(p.id)} className="text-red-600 hover:text-red-900">Deletar</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                 {filteredPromoters.length === 0 && <p className="text-center py-4 text-gray-500">Nenhum cadastro encontrado.</p>}
            </div>
        )}
        <EditPromoterModal 
            isOpen={isEditModalOpen}
            onClose={() => setIsEditModalOpen(false)}
            promoter={selectedPromoter}
            onSave={handleSaveFromModal}
        />
    </div>
  );
};

export default AdminPanel;
