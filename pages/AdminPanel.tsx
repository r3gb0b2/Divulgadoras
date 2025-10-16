import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth, functions } from '../firebase/config';
import { httpsCallable } from 'firebase/functions';
import { serverTimestamp, Timestamp } from 'firebase/firestore';
import { listenToPromoters, updatePromoter, deletePromoter, getRejectionReasons } from '../services/promoterService';
import { Promoter, PromoterStatus, RejectionReason, AdminUserData } from '../types';
import { CogIcon, InstagramIcon, WhatsAppIcon } from '../components/Icons';
import PhotoViewerModal from '../components/PhotoViewerModal';
import EditPromoterModal from '../components/EditPromoterModal';
import RejectionModal from '../components/RejectionModal';
import ManageReasonsModal from '../components/ManageReasonsModal';
import { stateMap } from '../constants/states';

interface AdminPanelProps {
  adminData: AdminUserData;
}

const calculateAge = (dob: string): number | string => {
    if (!dob) return 'N/A';
    try {
        // Handles both YYYY-MM-DD and DD/MM/YYYY
        const parts = dob.split(dob.includes('-') ? '-' : '/');
        const birthDate = dob.includes('-') 
            ? new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]))
            : new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));

        if (isNaN(birthDate.getTime())) return 'N/A';
        
        const today = new Date();
        let age = today.getFullYear() - birthDate.getFullYear();
        const m = today.getMonth() - birthDate.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
            age--;
        }
        return age >= 0 ? age : 'N/A';
    } catch (e) {
        return 'N/A';
    }
};

const StatusCard: React.FC<{ count: number; label: string; onClick: () => void; active: boolean; color: string }> = ({ count, label, onClick, active, color }) => (
    <button
        onClick={onClick}
        className={`p-4 rounded-lg shadow-md text-left transition-all duration-200 ${active ? `${color} ring-2 ring-offset-2 ring-offset-dark ring-white/80` : 'bg-secondary hover:bg-gray-800/80'}`}
    >
        <div className="text-2xl font-bold">{count}</div>
        <div className="text-sm text-gray-300">{label}</div>
    </button>
);


const AdminPanel: React.FC<AdminPanelProps> = ({ adminData }) => {
  const navigate = useNavigate();
  const [promoters, setPromoters] = useState<Promoter[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<PromoterStatus | 'all'>('pending');
  const [stateFilter, setStateFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Bulk selection
  const [selectedPromoters, setSelectedPromoters] = useState<Set<string>>(new Set());

  // Modals
  const [isPhotoViewerOpen, setIsPhotoViewerOpen] = useState(false);
  const [photoViewerUrls, setPhotoViewerUrls] = useState<string[]>([]);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingPromoter, setEditingPromoter] = useState<Promoter | null>(null);
  const [isRejectionModalOpen, setIsRejectionModalOpen] = useState(false);
  const [rejectingPromoter, setRejectingPromoter] = useState<Promoter | null>(null);
  const [isReasonsModalOpen, setIsReasonsModalOpen] = useState(false);
  
  const [rejectionReasons, setRejectionReasons] = useState<RejectionReason[]>([]);

  const fetchReasons = useCallback(async () => {
    if (adminData.organizationId) {
        try {
            const reasons = await getRejectionReasons(adminData.organizationId);
            setRejectionReasons(reasons);
        } catch (e) {
            console.error("Failed to fetch rejection reasons", e);
        }
    }
  }, [adminData.organizationId]);
  
  const clearSelection = () => setSelectedPromoters(new Set());

  useEffect(() => {
    fetchReasons();
  }, [fetchReasons]);

  useEffect(() => {
    setIsLoading(true);
    const assignedStates = (adminData.role === 'admin' || adminData.role === 'viewer') && adminData.assignedStates && adminData.assignedStates.length > 0
        ? adminData.assignedStates
        : null;

    const unsubscribe = listenToPromoters(
      adminData.organizationId,
      assignedStates,
      (loadedPromoters) => {
        setPromoters(loadedPromoters);
        setIsLoading(false);
        setError(null);
      },
      (err) => {
        setError(err.message);
        setIsLoading(false);
      }
    );
    return () => unsubscribe();
  }, [adminData]);

  const filteredPromoters = useMemo(() => {
    return promoters
      .filter(p => {
        if (!adminData.organizationId && adminData.role !== 'superadmin') return false;
        if (adminData.role === 'superadmin') return true;

        const promoterState = p.state.toUpperCase();
        const assignedStates = adminData.assignedStates || [];
        const stateCampaigns = adminData.assignedCampaigns ? adminData.assignedCampaigns[promoterState] : undefined;

        if (assignedStates.length > 0 && !assignedStates.includes(promoterState)) return false;
        if (stateCampaigns && stateCampaigns.length > 0) return p.campaignName ? stateCampaigns.includes(p.campaignName) : false;
        
        return true;
      })
      .filter(p => statusFilter === 'all' || p.status === statusFilter)
      .filter(p => stateFilter === 'all' || p.state === stateFilter)
      .filter(p =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.whatsapp.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.instagram.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.campaignName && p.campaignName.toLowerCase().includes(searchQuery.toLowerCase()))
      );
  }, [promoters, statusFilter, stateFilter, searchQuery, adminData]);

  const counts = useMemo(() => ({
    pending: promoters.filter(p => p.status === 'pending').length,
    approved: promoters.filter(p => p.status === 'approved').length,
    rejected: promoters.filter(p => p.status === 'rejected').length,
  }), [promoters]);
  
  const areAllSelected = useMemo(() => {
    const filteredIds = new Set(filteredPromoters.map(p => p.id));
    return filteredPromoters.length > 0 && Array.from(selectedPromoters).every(id => filteredIds.has(id)) && selectedPromoters.size === filteredPromoters.length;
  }, [filteredPromoters, selectedPromoters]);


  const handleLogout = async () => {
    await signOut(auth);
    navigate('/admin/login');
  };

  const handleUpdateStatus = async (promoter: Promoter, status: PromoterStatus, reason?: string) => {
    const dataToUpdate: Partial<Omit<Promoter, 'id'>> = { 
        status,
        actionTakenByUid: adminData.uid,
        actionTakenByEmail: adminData.email,
        statusChangedAt: serverTimestamp(),
    };
    if (status === 'rejected' && reason) dataToUpdate.rejectionReason = reason;
    if (status === 'approved') dataToUpdate.rejectionReason = '';
    await updatePromoter(promoter.id, dataToUpdate);
  };
  
  const handleApprove = async (promoter: Promoter) => await handleUpdateStatus(promoter, 'approved');
  
  const handleOpenRejectModal = (promoter: Promoter) => {
    setRejectingPromoter(promoter);
    setIsRejectionModalOpen(true);
  };
  
  const handleConfirmRejection = async (reason: string) => {
    if (rejectingPromoter) await handleUpdateStatus(rejectingPromoter, 'rejected', reason);
    setIsRejectionModalOpen(false);
    setRejectingPromoter(null);
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Tem certeza que deseja deletar este cadastro permanentemente?')) await deletePromoter(id);
  };

  const handleOpenEditModal = (promoter: Promoter) => {
    setEditingPromoter(promoter);
    setIsEditModalOpen(true);
  };
  
  const handleSaveEdit = async (id: string, data: Partial<Omit<Promoter, 'id'>>) => {
      await updatePromoter(id, { ...data, actionTakenByUid: adminData.uid, actionTakenByEmail: adminData.email, statusChangedAt: serverTimestamp() });
  };
  
  const handleViewPhotos = (urls: string[]) => {
    setPhotoViewerUrls(urls);
    setIsPhotoViewerOpen(true);
  };
  
  const handleStatusCardClick = (status: PromoterStatus | 'all') => {
    setStatusFilter(status);
    clearSelection();
  };
  
  const handleSelectPromoter = (id: string) => {
    setSelectedPromoters(prev => {
        const newSet = new Set(prev);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        return newSet;
    });
  };
  
  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) setSelectedPromoters(new Set(filteredPromoters.map(p => p.id)));
    else clearSelection();
  };

  const handleSendNotifications = async () => {
    if (selectedPromoters.size === 0) return;

    if (window.confirm(`Tem certeza que deseja enviar e-mail de notificação para ${selectedPromoters.size} divulgadoras selecionadas?`)) {
        try {
            const sendBulkApprovalEmail = httpsCallable(functions, 'sendBulkApprovalEmail');
            await sendBulkApprovalEmail({ promoterIds: Array.from(selectedPromoters) });

            alert('E-mails de notificação enviados com sucesso!');
            clearSelection();
        } catch (error) {
            console.error("Error sending bulk notifications:", error);
            alert('Ocorreu um erro ao enviar as notificações. Verifique o console ou se a função de nuvem "sendBulkApprovalEmail" está implantada.');
        }
    }
  };


  const statusBadge = (status: PromoterStatus) => {
    const styles = { pending: 'bg-blue-900/50 text-blue-300', approved: 'bg-green-900/50 text-green-300', rejected: 'bg-red-900/50 text-red-300' };
    const text = { pending: 'Pendente', approved: 'Aprovado', rejected: 'Rejeitado' };
    return <span className={`px-2 py-0.5 inline-flex text-xs leading-5 font-semibold rounded-full ${styles[status]}`}>{text[status]}</span>;
  };

  const availableStates = useMemo(() => {
    if (adminData.role === 'superadmin' || !adminData.assignedStates || adminData.assignedStates.length === 0) {
      return Array.from(new Set(promoters.map(p => p.state))).sort();
    }
    return adminData.assignedStates.sort();
  }, [promoters, adminData]);

  return (
    <div>
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div>
          <h1 className="text-3xl font-bold">Painel do Organizador</h1>
          <p className="text-gray-400">Gerencie as divulgadoras da sua organização.</p>
        </div>
        <div className="flex items-center gap-4">
          {adminData.role !== 'viewer' && (
            <Link to="/admin/settings" className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-500 text-sm">
              <CogIcon className="w-4 h-4" /> Configurações
            </Link>
          )}
          <button onClick={handleLogout} className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 text-sm">Sair</button>
        </div>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatusCard count={promoters.length} label="Todos" onClick={() => handleStatusCardClick('all')} active={statusFilter === 'all'} color="bg-gray-600" />
        <StatusCard count={counts.pending} label="Pendentes" onClick={() => handleStatusCardClick('pending')} active={statusFilter === 'pending'} color="bg-blue-600" />
        <StatusCard count={counts.approved} label="Aprovadas" onClick={() => handleStatusCardClick('approved')} active={statusFilter === 'approved'} color="bg-green-600" />
        <StatusCard count={counts.rejected} label="Rejeitadas" onClick={() => handleStatusCardClick('rejected')} active={statusFilter === 'rejected'} color="bg-red-600" />
      </div>

      <div className="bg-secondary p-6 rounded-lg shadow-md">
        <div className="flex flex-col md:flex-row gap-4 mb-4">
            <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value as any); clearSelection(); }} className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm w-full md:w-auto">
                <option value="all">Todos Status</option>
                <option value="pending">Pendentes</option>
                <option value="approved">Aprovados</option>
                <option value="rejected">Rejeitados</option>
            </select>
            <select value={stateFilter} onChange={(e) => { setStateFilter(e.target.value); clearSelection(); }} className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm w-full md:w-auto">
                <option value="all">Todos Estados</option>
                {availableStates.map(s => <option key={s} value={s}>{stateMap[s] || s}</option>)}
            </select>
            <input type="text" value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); clearSelection(); }} placeholder="Buscar..." className="flex-grow bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm" />
            
            {selectedPromoters.size > 0 && (
                <button onClick={handleSendNotifications} className="bg-primary hover:bg-primary-dark text-white px-4 py-2 text-sm font-semibold rounded-md md:ml-auto">
                    Enviar Notificação ({selectedPromoters.size})
                </button>
            )}
            {adminData.role === 'admin' && selectedPromoters.size === 0 && (
              <button onClick={() => setIsReasonsModalOpen(true)} className="bg-gray-600 hover:bg-gray-500 text-white px-3 py-2 text-sm rounded-md md:ml-auto">
                  Gerenciar Motivos
              </button>
            )}
        </div>
        
        {isLoading ? <p>Carregando...</p> : error ? <p className="text-red-400">{error}</p> : (
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-700">
                    <thead>
                        <tr>
                           {statusFilter === 'approved' && adminData.role !== 'viewer' && (
                               <th className="px-4 py-3">
                                   <input type="checkbox" onChange={handleSelectAll} checked={areAllSelected} className="h-4 w-4 text-primary bg-gray-700 border-gray-500 rounded focus:ring-primary"/>
                               </th>
                           )}
                           <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Divulgadora</th>
                           <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Contatos</th>
                           <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Idade</th>
                           <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Estado/Evento</th>
                           <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Inscrição</th>
                           <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Status</th>
                           <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Ações</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700">
                        {filteredPromoters.map(p => (
                            <tr key={p.id} className={`transition-colors duration-200 ${selectedPromoters.has(p.id) ? 'bg-primary/20' : 'hover:bg-gray-800/50'}`}>
                                {statusFilter === 'approved' && adminData.role !== 'viewer' && (
                                    <td className="px-4 py-4"><input type="checkbox" checked={selectedPromoters.has(p.id)} onChange={() => handleSelectPromoter(p.id)} className="h-4 w-4 text-primary bg-gray-700 border-gray-500 rounded focus:ring-primary"/></td>
                                )}
                                <td className="px-4 py-4 whitespace-nowrap">
                                    <div className="flex items-center">
                                        <div className="flex-shrink-0 h-10 w-10">
                                            <img className="h-10 w-10 rounded-full object-cover cursor-pointer" src={p.photoUrls[0]} alt={p.name} onClick={() => handleViewPhotos(p.photoUrls)} />
                                        </div>
                                        <div className="ml-4 min-w-0">
                                            <div className="text-sm font-medium text-white truncate" title={p.name}>{p.name}</div>
                                            <div className="text-sm text-gray-400 truncate" title={p.email}>{p.email}</div>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-300">
                                    {p.whatsapp && <div className="flex items-center gap-1.5"><WhatsAppIcon className="w-4 h-4 text-green-400"/> {p.whatsapp}</div>}
                                    {p.instagram && <div className="flex items-center gap-1.5 mt-1"><InstagramIcon className="w-4 h-4 text-pink-400"/> {p.instagram}</div>}
                                </td>
                                <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-300">{calculateAge(p.dateOfBirth)}</td>
                                <td className="px-4 py-4 whitespace-nowrap text-sm">
                                    <div>{stateMap[p.state] || p.state}</div>
                                    <div className="text-gray-400">{p.campaignName || 'Geral'}</div>
                                </td>
                                <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-300">
                                    {p.createdAt ? (p.createdAt as Timestamp).toDate().toLocaleDateString('pt-BR') : 'N/A'}
                                </td>
                                <td className="px-4 py-4 whitespace-nowrap">{statusBadge(p.status)}</td>
                                <td className="px-4 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                                    {p.status === 'pending' && adminData.role !== 'viewer' && (
                                      <>
                                        <button onClick={() => handleApprove(p)} className="text-green-400 hover:text-green-300">Aprovar</button>
                                        <button onClick={() => handleOpenRejectModal(p)} className="text-red-400 hover:text-red-300">Rejeitar</button>
                                      </>
                                    )}
                                    <button onClick={() => handleOpenEditModal(p)} className="text-indigo-400 hover:text-indigo-300">Detalhes</button>
                                    {adminData.role === 'superadmin' && <button onClick={() => handleDelete(p.id)} className="text-red-500 hover:text-red-400">Excluir</button>}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                 {filteredPromoters.length === 0 && <p className="text-center text-gray-400 py-6">Nenhuma divulgadora encontrada com os filtros atuais.</p>}
            </div>
        )}
      </div>

      <PhotoViewerModal isOpen={isPhotoViewerOpen} onClose={() => setIsPhotoViewerOpen(false)} imageUrls={photoViewerUrls} startIndex={0} />
      <EditPromoterModal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} promoter={editingPromoter} onSave={handleSaveEdit} />
      <RejectionModal isOpen={isRejectionModalOpen} onClose={() => setIsRejectionModalOpen(false)} onConfirm={handleConfirmRejection} reasons={rejectionReasons} />
      <ManageReasonsModal isOpen={isReasonsModalOpen} onClose={() => setIsReasonsModalOpen(false)} onReasonsUpdated={fetchReasons} organizationId={adminData.organizationId || ''} />
    </div>
  );
};

export default AdminPanel;
