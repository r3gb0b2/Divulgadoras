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

  const [statusFilter, setStatusFilter] = useState<PromoterStatus | 'all'>('pending');
  const [stateFilter, setStateFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPromoters, setSelectedPromoters] = useState<Set<string>>(new Set());

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
  
  const areAllOnPageSelected = useMemo(() => {
      const filteredIdsOnPage = filteredPromoters.map(p => p.id);
      if (filteredIdsOnPage.length === 0) return false;
      return filteredIdsOnPage.every(id => selectedPromoters.has(id));
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
  
  const handleSelectAllOnPage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const isChecked = e.target.checked;
    const pageIds = filteredPromoters.map(p => p.id);
    setSelectedPromoters(prev => {
        const newSet = new Set(prev);
        if(isChecked) {
            pageIds.forEach(id => newSet.add(id));
        } else {
            pageIds.forEach(id => newSet.delete(id));
        }
        return newSet;
    });
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
            
            <div className="flex-grow flex items-center justify-end gap-4">
                 {statusFilter === 'approved' && adminData.role !== 'viewer' && filteredPromoters.length > 0 && (
                    <label className="flex items-center space-x-2 text-sm text-gray-300 cursor-pointer">
                        <input type="checkbox" onChange={handleSelectAllOnPage} checked={areAllOnPageSelected} className="h-4 w-4 text-primary bg-gray-700 border-gray-500 rounded focus:ring-primary"/>
                        <span>Selecionar Visíveis</span>
                    </label>
                )}
                {selectedPromoters.size > 0 && (
                    <button onClick={handleSendNotifications} className="bg-primary hover:bg-primary-dark text-white px-4 py-2 text-sm font-semibold rounded-md">
                        Enviar Notificação ({selectedPromoters.size})
                    </button>
                )}
                {adminData.role === 'admin' && selectedPromoters.size === 0 && (
                  <button onClick={() => setIsReasonsModalOpen(true)} className="bg-gray-600 hover:bg-gray-500 text-white px-3 py-2 text-sm rounded-md">
                      Gerenciar Motivos
                  </button>
                )}
            </div>
        </div>
        
        {isLoading ? <p>Carregando...</p> : error ? <p className="text-red-400">{error}</p> : (
            <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredPromoters.map(p => (
                    <div key={p.id} className={`rounded-lg shadow-md flex flex-col transition-all duration-200 ${selectedPromoters.has(p.id) ? 'bg-primary/20 ring-2 ring-primary' : 'bg-gray-800 hover:ring-2 hover:ring-primary/50'}`}>
                        <div className="p-4 border-b border-gray-700 flex items-start gap-4">
                            <img 
                                className="h-16 w-16 rounded-full object-cover cursor-pointer flex-shrink-0" 
                                src={p.photoUrls[0]} 
                                alt={p.name} 
                                onClick={() => handleViewPhotos(p.photoUrls)} 
                            />
                            <div className="flex-grow min-w-0">
                                <div className="flex justify-between items-start">
                                    <p className="font-bold text-white break-words" title={p.name}>{p.name}</p>
                                    {statusFilter === 'approved' && adminData.role !== 'viewer' && (
                                         <input 
                                            type="checkbox" 
                                            checked={selectedPromoters.has(p.id)} 
                                            onChange={() => handleSelectPromoter(p.id)} 
                                            className="h-5 w-5 text-primary bg-gray-700 border-gray-500 rounded focus:ring-primary ml-2 flex-shrink-0"
                                        />
                                    )}
                                </div>
                                {statusBadge(p.status)}
                                <p className="text-xs text-gray-400 mt-1 break-words" title={p.email}>{p.email}</p>
                            </div>
                        </div>

                        <div className="p-4 space-y-3 text-sm flex-grow">
                            <div className="flex items-center gap-2">
                                <WhatsAppIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                {p.whatsapp ? (
                                    <a href={`https://wa.me/${p.whatsapp.replace(/\D/g, '')}?text=Olá, ${encodeURIComponent(p.name)}!`} target="_blank" rel="noopener noreferrer" className="text-gray-300 hover:text-primary break-all">{p.whatsapp}</a>
                                ) : <span className="text-gray-500">N/A</span>}
                            </div>
                            <div className="flex items-center gap-2">
                                <InstagramIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                {p.instagram ? (
                                    <a href={`https://instagram.com/${p.instagram.replace('@', '')}`} target="_blank" rel="noopener noreferrer" className="text-gray-300 hover:text-primary break-all">{p.instagram}</a>
                                ) : <span className="text-gray-500">N/A</span>}
                            </div>
                            <div className="pt-3 border-t border-gray-700/50 space-y-1">
                                <p className="text-gray-300"><strong>Idade:</strong> {calculateAge(p.dateOfBirth)} anos</p>
                                <p className="text-gray-300"><strong>Estado:</strong> {stateMap[p.state] || p.state}</p>
                                <p className="text-gray-300"><strong>Evento:</strong> {p.campaignName || 'Geral'}</p>
                            </div>
                             <p className="text-xs text-gray-500 pt-2 border-t border-gray-700/50 mt-2">
                                Inscrito em: {p.createdAt ? (p.createdAt as Timestamp).toDate().toLocaleDateString('pt-BR') : 'N/A'}
                            </p>
                        </div>

                        <div className="p-2 bg-black/20 rounded-b-lg flex justify-end items-center gap-3">
                            {p.status === 'pending' && adminData.role !== 'viewer' && (
                              <>
                                <button onClick={() => handleApprove(p)} className="text-green-400 hover:text-green-300 text-xs font-bold px-2 py-1 rounded hover:bg-green-500/10">APROVAR</button>
                                <button onClick={() => handleOpenRejectModal(p)} className="text-red-400 hover:text-red-300 text-xs font-bold px-2 py-1 rounded hover:bg-red-500/10">REJEITAR</button>
                              </>
                            )}
                            <button onClick={() => handleOpenEditModal(p)} className="text-indigo-400 hover:text-indigo-300 text-xs font-bold px-2 py-1 rounded hover:bg-indigo-500/10">DETALHES</button>
                            {adminData.role === 'superadmin' && <button onClick={() => handleDelete(p.id)} className="text-red-500 hover:text-red-400 text-xs font-bold px-2 py-1 rounded hover:bg-red-500/10">EXCLUIR</button>}
                        </div>
                    </div>
                ))}
            </div>
            {filteredPromoters.length === 0 && <p className="text-center text-gray-400 py-6">Nenhuma divulgadora encontrada com os filtros atuais.</p>}
            </>
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
