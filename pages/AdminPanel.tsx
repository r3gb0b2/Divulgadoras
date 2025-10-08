import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { getPromoters, updatePromoter, archivePromoter } from '../services/promoterService';
import { Promoter } from '../types';
import EditPromoterModal from '../components/EditPromoterModal';
import PhotoViewerModal from '../components/PhotoViewerModal';
import { InstagramIcon, MailIcon, WhatsAppIcon, SearchIcon, ArrowUpIcon, ArrowDownIcon, DownloadIcon, ArchiveIcon } from '../components/Icons';

const calculateAge = (dateOfBirth: string): number => {
    if (!dateOfBirth) return 0;
    const birthDate = new Date(dateOfBirth);
    // Adjust for timezone to avoid off-by-one day errors
    birthDate.setMinutes(birthDate.getMinutes() + birthDate.getTimezoneOffset());
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }
    return age;
};

type SortableKeys = keyof Pick<Promoter, 'name' | 'createdAt'> | 'age';

const AdminPanel: React.FC = () => {
  const [promoters, setPromoters] = useState<Promoter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
  const [ageFilter, setAgeFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPromoter, setSelectedPromoter] = useState<Promoter | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isPhotoViewerOpen, setIsPhotoViewerOpen] = useState(false);
  const [selectedPhotos, setSelectedPhotos] = useState<string[]>([]);
  const [photoStartIndex, setPhotoStartIndex] = useState(0);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [sortConfig, setSortConfig] = useState<{ key: SortableKeys; direction: 'asc' | 'desc' }>({ key: 'createdAt', direction: 'desc' });
  
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

  const stats = useMemo(() => {
    const unarchivedPromoters = promoters.filter(p => p.isArchived !== true);
    return {
        total: unarchivedPromoters.length,
        pending: unarchivedPromoters.filter(p => p.status === 'pending').length,
        approved: unarchivedPromoters.filter(p => p.status === 'approved').length,
        rejected: unarchivedPromoters.filter(p => p.status === 'rejected').length,
    };
  }, [promoters]);

  const processedPromoters = useMemo(() => {
    // Start with unarchived promoters. This handles old data without the isArchived field.
    let promot_ers = promoters.filter(p => p.isArchived !== true);

    if (searchQuery) {
        promot_ers = promot_ers.filter(p =>
            p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            p.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (p.instagram && p.instagram.toLowerCase().includes(searchQuery.toLowerCase()))
        );
    }

    if (filter !== 'all') {
      promot_ers = promot_ers.filter(p => p.status === filter);
    }

    if (ageFilter) {
      promot_ers = promot_ers.filter(p => calculateAge(p.dateOfBirth) === parseInt(ageFilter, 10));
    }

    if (sortConfig.key) {
        promot_ers.sort((a, b) => {
            let aValue: string | number;
            let bValue: string | number;

            if (sortConfig.key === 'age') {
                aValue = calculateAge(a.dateOfBirth);
                bValue = calculateAge(b.dateOfBirth);
            } else if (sortConfig.key === 'createdAt') {
                aValue = a.createdAt?.toMillis() || 0;
                bValue = b.createdAt?.toMillis() || 0;
            } else { // 'name'
                aValue = a[sortConfig.key] as string;
                bValue = b[sortConfig.key] as string;
            }
            
            if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }

    return promot_ers;
  }, [promoters, filter, ageFilter, searchQuery, sortConfig]);

  const requestSort = (key: SortableKeys) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
        direction = 'desc';
    }
    setSortConfig({ key, direction });
  };
  
  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedIds(e.target.checked ? processedPromoters.map(p => p.id) : []);
  };

  const handleSelectOne = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const handleBatchUpdate = async (status: 'approved' | 'rejected') => {
    const action = status === 'approved' ? 'aprovar' : 'rejeitar';
    if (!window.confirm(`Tem certeza que deseja ${action} os ${selectedIds.length} cadastros selecionados?`)) return;
    try {
        await Promise.all(selectedIds.map(id => updatePromoter(id, { status })));
        await fetchPromoters();
        setSelectedIds([]);
    } catch (error) {
        console.error(error);
        alert(`Falha ao ${action} em lote.`);
    }
  };

  const handleUpdateStatus = async (id: string, status: 'approved' | 'rejected') => {
    try {
      await updatePromoter(id, { status });
      setPromoters(prev => prev.map(p => p.id === id ? { ...p, status } : p));
    } catch (error) {
        console.error(error);
      alert('Falha ao atualizar status.');
    }
  };

  const handleArchive = async (id: string) => {
    if (window.confirm('Tem certeza que deseja arquivar este cadastro? Ele será ocultado da lista principal.')) {
        try {
            await archivePromoter(id);
            // Optimistically update the UI to remove the promoter
            setPromoters(prev => prev.map(p => p.id === id ? { ...p, isArchived: true } : p));
        } catch (error) {
            console.error(error);
            alert('Falha ao arquivar.');
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

  const openPhotoViewer = (photos: string[], startIndex: number) => {
    setSelectedPhotos(photos);
    setPhotoStartIndex(startIndex);
    setIsPhotoViewerOpen(true);
  };

  const handleExportCSV = () => {
    const headers = ["Nome", "Idade", "E-mail", "WhatsApp", "Instagram", "TikTok", "Status", "Data de Cadastro"];
    const rows = processedPromoters.map(p => [
        `"${p.name.replace(/"/g, '""')}"`, // Escape double quotes
        calculateAge(p.dateOfBirth),
        `"${p.email}"`,
        `"${p.whatsapp}"`,
        `"${p.instagram || ''}"`,
        `"${p.tiktok || ''}"`,
        `"${p.status}"`,
        `"${p.createdAt?.toDate().toLocaleDateString('pt-BR') || 'N/A'}"`
    ].join(','));

    // BOM for Excel to recognize UTF-8
    const csvContent = "\uFEFF" + headers.join(',') + "\n" + rows.join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", "divulgadoras.csv");
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
  };
  
  const SortableHeader: React.FC<{ sortKey: SortableKeys; children: React.ReactNode }> = ({ sortKey, children }) => {
    const isSorted = sortConfig.key === sortKey;
    return (
      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider cursor-pointer" onClick={() => requestSort(sortKey)}>
        <div className="flex items-center gap-2">
            {children}
            {isSorted && (sortConfig.direction === 'asc' ? <ArrowUpIcon /> : <ArrowDownIcon />)}
        </div>
      </th>
    );
  };

  const StatusBadge: React.FC<{ status: Promoter['status'] }> = ({ status }) => {
    const styles = {
        pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
        approved: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
        rejected: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
    };
    const text = {
        pending: 'Pendente',
        approved: 'Aprovado',
        rejected: 'Rejeitado',
    }
    return <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${styles[status]}`}>{text[status]}</span>
  }

  const SkeletonRow = () => (
    <tr>
        <td className="px-6 py-4"><div className="h-4 w-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div></td>
        <td className="px-6 py-4"><div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse w-32"></div></td>
        <td className="px-6 py-4"><div className="flex space-x-2"><div className="h-12 w-12 bg-gray-200 dark:bg-gray-700 rounded-md animate-pulse"></div><div className="h-12 w-12 bg-gray-200 dark:bg-gray-700 rounded-md animate-pulse"></div></div></td>
        <td className="px-6 py-4"><div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse w-40"></div></td>
        <td className="px-6 py-4"><div className="h-6 w-20 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse"></div></td>
        <td className="px-6 py-4"><div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse w-24"></div></td>
        <td className="px-6 py-4"><div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse w-28"></div></td>
    </tr>
  );
  
  return (
    <div className="bg-white dark:bg-gray-800 shadow-2xl rounded-lg p-4 md:p-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">Painel Administrativo</h1>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <div className="bg-gray-100 dark:bg-gray-700 p-4 rounded-lg"><p className="text-sm text-gray-500 dark:text-gray-400">Total</p><p className="text-2xl font-bold">{stats.total}</p></div>
            <div className="bg-yellow-100 dark:bg-yellow-900/50 p-4 rounded-lg"><p className="text-sm text-yellow-600 dark:text-yellow-400">Pendentes</p><p className="text-2xl font-bold text-yellow-800 dark:text-yellow-200">{stats.pending}</p></div>
            <div className="bg-green-100 dark:bg-green-900/50 p-4 rounded-lg"><p className="text-sm text-green-600 dark:text-green-400">Aprovados</p><p className="text-2xl font-bold text-green-800 dark:text-green-200">{stats.approved}</p></div>
            <div className="bg-red-100 dark:bg-red-900/50 p-4 rounded-lg"><p className="text-sm text-red-600 dark:text-red-400">Rejeitados</p><p className="text-2xl font-bold text-red-800 dark:text-red-200">{stats.rejected}</p></div>
        </div>
        
        <div className="flex flex-wrap gap-2 mb-4">
            <button onClick={() => setFilter('pending')} className={`px-4 py-2 rounded-md text-sm font-medium ${filter === 'pending' ? 'bg-primary text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200'}`}>Pendentes ({stats.pending})</button>
            <button onClick={() => setFilter('approved')} className={`px-4 py-2 rounded-md text-sm font-medium ${filter === 'approved' ? 'bg-primary text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200'}`}>Aprovados ({stats.approved})</button>
            <button onClick={() => setFilter('rejected')} className={`px-4 py-2 rounded-md text-sm font-medium ${filter === 'rejected' ? 'bg-primary text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200'}`}>Rejeitados ({stats.rejected})</button>
            <button onClick={() => setFilter('all')} className={`px-4 py-2 rounded-md text-sm font-medium ${filter === 'all' ? 'bg-primary text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200'}`}>Todos ({stats.total})</button>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="relative md:col-span-2">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3"><SearchIcon className="h-5 w-5 text-gray-400" /></span>
                <input type="text" placeholder="Buscar por nome, e-mail, Instagram..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary sm:text-sm bg-gray-50 dark:bg-gray-700" />
            </div>
            <input type="number" placeholder="Filtrar por idade..." value={ageFilter} onChange={(e) => setAgeFilter(e.target.value)} className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary sm:text-sm bg-gray-50 dark:bg-gray-700" />
            <button onClick={handleExportCSV} className="md:col-start-3 justify-self-end w-full md:w-auto flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600">
                <DownloadIcon className="w-4 h-4" />
                Exportar CSV
            </button>
        </div>

        {selectedIds.length > 0 && (
            <div className="bg-gray-100 dark:bg-gray-700 p-3 rounded-lg mb-6 flex items-center gap-4">
                <p className="text-sm font-medium">{selectedIds.length} selecionado(s)</p>
                <button onClick={() => handleBatchUpdate('approved')} className="px-3 py-1 bg-green-500 text-white rounded-md hover:bg-green-600 text-sm">Aprovar</button>
                <button onClick={() => handleBatchUpdate('rejected')} className="px-3 py-1 bg-red-500 text-white rounded-md hover:bg-red-600 text-sm">Rejeitar</button>
            </div>
        )}

        {error && <p className="text-red-500 text-center py-4">Erro: {error}</p>}
        {!error && (
            <div className="overflow-x-auto -mx-4 md:-mx-8 px-4 md:px-8">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-700">
                        <tr>
                            <th scope="col" className="px-6 py-3"><input type="checkbox" onChange={handleSelectAll} checked={!loading && selectedIds.length > 0 && selectedIds.length === processedPromoters.length} className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary" /></th>
                            <SortableHeader sortKey="name">Nome (Idade)</SortableHeader>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Fotos</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Contato</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Status</th>
                            <SortableHeader sortKey="createdAt">Data Cadastro</SortableHeader>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Ações</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                        {loading ? (
                            Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
                        ) : processedPromoters.map(p => {
                            const siteUrl = `${window.location.origin}/status`;
                            const emailSubject = `Parabéns! Seu cadastro de divulgadora foi aprovado!`;
                            const emailBody = `Olá ${p.name},\n\nSeu cadastro para se tornar uma divulgadora foi aprovado! Estamos muito felizes em ter você no time.\n\nPara continuar, por favor, acesse nosso site, verifique seu status e siga os próximos passos para ter acesso às regras e ao link do grupo exclusivo para divulgadoras.\n\nAcesse aqui: ${siteUrl}\n\nAtenciosamente,\nEquipe DivulgaAqui`;
                            const mailtoLink = `mailto:${p.email}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;

                            const whatsappMessage = `Olá ${p.name}! Parabéns, seu cadastro de divulgadora foi aprovado! Para continuar, acesse nosso site (${siteUrl}), verifique seu status e siga os próximos passos para entrar no grupo. 🎉`;
                            const whatsappLink = `https://wa.me/${p.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(whatsappMessage)}`;

                            return (
                                <tr key={p.id} className={selectedIds.includes(p.id) ? 'bg-pink-50 dark:bg-pink-900/20' : ''}>
                                    <td className="px-6 py-4"><input type="checkbox" checked={selectedIds.includes(p.id)} onChange={() => handleSelectOne(p.id)} className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary" /></td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{p.name} ({calculateAge(p.dateOfBirth)} anos)</td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="flex items-center space-x-2">
                                            {p.photoUrls.slice(0, 3).map((url, index) => (
                                                <button key={index} onClick={() => openPhotoViewer(p.photoUrls, index)}>
                                                    <img src={url} alt={`Foto ${index+1}`} className="h-12 w-12 rounded-md object-cover hover:opacity-80 transition-opacity" />
                                                </button>
                                            ))}
                                            {p.photoUrls.length > 3 && <span className="text-xs text-gray-500">+{p.photoUrls.length - 3}</span>}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                        {p.email}
                                        <br/>
                                        <a href={`https://wa.me/${p.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="text-green-500 hover:text-green-400 hover:underline">
                                            {p.whatsapp}
                                        </a>
                                        {p.instagram && (
                                            <>
                                                <br/>
                                                <a 
                                                    href={p.instagram.startsWith('http') ? p.instagram : `https://instagram.com/${p.instagram.replace('@','')}`} 
                                                    target="_blank" 
                                                    rel="noopener noreferrer" 
                                                    className="text-pink-500 hover:text-pink-400 hover:underline flex items-center gap-1"
                                                >
                                                    <InstagramIcon className="w-4 h-4" />
                                                    Instagram
                                                </a>
                                            </>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap"><StatusBadge status={p.status} /></td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{p.createdAt?.toDate().toLocaleDateString() ?? 'N/A'}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                        <div className="flex items-center flex-wrap gap-x-4 gap-y-2">
                                            {p.status === 'pending' && (
                                                <>
                                                    <button onClick={() => handleUpdateStatus(p.id, 'approved')} className="text-green-600 hover:text-green-900 dark:hover:text-green-400 transition-colors">Aprovar</button>
                                                    <button onClick={() => handleUpdateStatus(p.id, 'rejected')} className="text-red-600 hover:text-red-900 dark:hover:text-red-400 transition-colors">Rejeitar</button>
                                                </>
                                            )}
                                            {p.status === 'approved' && (
                                                <>
                                                    <a href={mailtoLink} className="inline-flex items-center gap-1.5 text-blue-600 hover:text-blue-900 dark:hover:text-blue-400 transition-colors" title="Notificar por E-mail">
                                                        <MailIcon className="w-4 h-4" />
                                                    </a>
                                                    <a href={whatsappLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-green-600 hover:text-green-900 dark:hover:text-green-400 transition-colors" title="Notificar por WhatsApp">
                                                        <WhatsAppIcon className="w-4 h-4" />
                                                    </a>
                                                </>
                                            )}
                                            <button onClick={() => openEditModal(p)} className="text-indigo-600 hover:text-indigo-900 dark:hover:text-indigo-400 transition-colors">Ver/Editar</button>
                                            <button onClick={() => handleArchive(p.id)} className="text-red-600 hover:text-red-900 dark:hover:text-red-400 transition-colors">Arquivar</button>
                                        </div>
                                    </td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
                 {!loading && processedPromoters.length === 0 && (
                    <div className="text-center py-8">
                        <p className="text-gray-500 dark:text-gray-400">Nenhum cadastro encontrado para a busca ou filtros aplicados.</p>
                    </div>
                )}
            </div>
        )}
        {selectedPromoter && (
            <EditPromoterModal 
                isOpen={isEditModalOpen}
                onClose={() => setIsEditModalOpen(false)}
                promoter={selectedPromoter}
                onSave={handleSaveFromModal}
            />
        )}
        <PhotoViewerModal
            isOpen={isPhotoViewerOpen}
            onClose={() => setIsPhotoViewerOpen(false)}
            imageUrls={selectedPhotos}
            startIndex={photoStartIndex}
        />
    </div>
  );
};

export default AdminPanel;