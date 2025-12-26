
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { GuestList, Campaign, Timestamp, FieldValue } from '../types';
import { getGuestListsForOrg, createGuestList, updateGuestList, deleteGuestList } from '../services/guestListService';
import { getAllCampaigns } from '../services/settingsService';
import { ArrowLeftIcon, LinkIcon, PencilIcon, TrashIcon, CheckCircleIcon, ClipboardDocumentListIcon, UsersIcon, SearchIcon, FilterIcon } from '../components/Icons';
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';

const timestampToDateTimeLocal = (ts: any): string => {
    if (!ts) return '';
    try {
        const date = ts.toDate ? ts.toDate() : new Date(ts.seconds * 1000);
        if (isNaN(date.getTime())) return '';
        const localDate = new Date(date.getTime() - (date.getTimezoneOffset() * 60000));
        return localDate.toISOString().slice(0, 16);
    } catch (e) { return ''; }
};

// Modal for Creating/Editing Guest Lists
const ListModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onSave: (data: Partial<Omit<GuestList, 'id'>>, selectedIds: string[]) => Promise<void>;
    list: Partial<GuestList> | null;
    campaigns: Campaign[];
}> = ({ isOpen, onClose, onSave, list, campaigns }) => {
    const [formData, setFormData] = useState<Partial<Omit<GuestList, 'id'>>>({});
    const [selectedCampaignIds, setSelectedCampaignIds] = useState<Set<string>>(new Set());
    const [isSaving, setIsSaving] = useState(false);
    
    useEffect(() => {
        if (isOpen) {
            setFormData({
                name: list?.name || '',
                description: list?.description || '',
                guestAllowance: list?.guestAllowance || 0,
                startsAt: list?.startsAt || null,
                closesAt: list?.closesAt || null,
                isActive: list?.isActive !== undefined ? list.isActive : true,
                askEmail: list?.askEmail !== undefined ? list.askEmail : false,
            });

            if (list?.campaignId) {
                setSelectedCampaignIds(new Set([list.campaignId]));
            } else {
                setSelectedCampaignIds(new Set());
            }
        }
    }, [list, isOpen]);

    if (!isOpen) return null;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value, type } = e.target;
        if (type === 'checkbox') {
            setFormData(prev => ({ ...prev, [name]: (e.target as HTMLInputElement).checked }));
        } else if (type === 'number') {
            setFormData(prev => ({ ...prev, [name]: parseInt(value, 10) || 0 }));
        } else {
            setFormData(prev => ({ ...prev, [name]: value }));
        }
    };
    
    const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        const timestampValue = value ? firebase.firestore.Timestamp.fromDate(new Date(value)) : null;
        setFormData(prev => ({ ...prev, [name]: timestampValue }));
    };

    const handleToggleCampaign = (id: string) => {
        if (list?.id) {
            // No modo edição, permitimos apenas um
            setSelectedCampaignIds(new Set([id]));
            return;
        }

        setSelectedCampaignIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleSelectAll = () => {
        if (selectedCampaignIds.size === campaigns.length) {
            setSelectedCampaignIds(new Set());
        } else {
            setSelectedCampaignIds(new Set(campaigns.map(c => c.id)));
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (selectedCampaignIds.size === 0) {
            alert("Selecione pelo menos um evento.");
            return;
        }
        setIsSaving(true);
        try {
            await onSave(formData, Array.from(selectedCampaignIds));
            onClose();
        } catch (err) {
            // Erro tratado no componente pai
        } finally {
            setIsSaving(false);
        }
    };
    
    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex justify-center items-center z-50 p-4" onClick={onClose}>
            <div className="bg-secondary rounded-[2.5rem] shadow-2xl p-8 w-full max-w-2xl max-h-[90vh] flex flex-col border border-white/10" onClick={e => e.stopPropagation()}>
                <h2 className="text-3xl font-black text-white mb-6 uppercase tracking-tighter">
                    {list?.id ? 'Editar Lista VIP' : 'Nova Lista VIP'}
                </h2>
                
                <form onSubmit={handleSubmit} className="flex-grow overflow-y-auto space-y-6 pr-2 custom-scrollbar">
                    <div className="space-y-4">
                        <div className="flex justify-between items-end">
                            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Eventos Vinculados</label>
                            {!list?.id && (
                                <button type="button" onClick={handleSelectAll} className="text-[10px] font-black text-primary uppercase hover:underline">
                                    {selectedCampaignIds.size === campaigns.length ? 'Desmarcar Todos' : 'Selecionar Todos'}
                                </button>
                            )}
                        </div>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto p-3 bg-dark/50 rounded-2xl border border-white/5">
                            {campaigns.map(c => (
                                <label key={c.id} className={`flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer ${selectedCampaignIds.has(c.id) ? 'bg-primary/10 border-primary/50 text-white' : 'bg-gray-800/40 border-transparent text-gray-400 hover:border-white/10'}`}>
                                    <input 
                                        type={list?.id ? "radio" : "checkbox"}
                                        name="campaigns"
                                        checked={selectedCampaignIds.has(c.id)}
                                        onChange={() => handleToggleCampaign(c.id)}
                                        className="w-4 h-4 rounded border-gray-600 bg-dark text-primary focus:ring-primary"
                                    />
                                    <div className="flex flex-col">
                                        <span className="text-xs font-bold uppercase">{c.name}</span>
                                        <span className="text-[9px] opacity-60 font-black">{c.stateAbbr}</span>
                                    </div>
                                </label>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div>
                            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Nome da Lista</label>
                            <input type="text" name="name" placeholder="Ex: Lista VIP, Nome na Lista" value={formData.name} onChange={handleChange} required className="w-full px-5 py-4 bg-dark border border-white/10 rounded-2xl text-white outline-none focus:ring-2 focus:ring-primary font-bold" />
                        </div>
                        
                        <div>
                            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Descrição / Regras da Lista</label>
                            <textarea name="description" placeholder="Instruções opcionais para a divulgadora..." value={formData.description} onChange={handleChange} className="w-full px-5 py-4 bg-dark border border-white/10 rounded-2xl text-white outline-none focus:ring-2 focus:ring-primary text-sm min-h-[100px]" />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Nº Convidados Padrão</label>
                                <input type="number" name="guestAllowance" min="0" value={formData.guestAllowance} onChange={handleChange} className="w-full px-5 py-4 bg-dark border border-white/10 rounded-2xl text-white outline-none focus:ring-2 focus:ring-primary font-bold" />
                            </div>
                            <div className="flex items-center pt-4">
                                <label className="flex items-center gap-3 cursor-pointer group">
                                    <input type="checkbox" name="askEmail" checked={formData.askEmail} onChange={handleChange} className="w-5 h-5 rounded border-gray-600 bg-dark text-primary focus:ring-primary" />
                                    <span className="text-xs font-black text-gray-400 uppercase tracking-widest group-hover:text-white transition-colors">Solicitar E-mail?</span>
                                </label>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Início (Opcional)</label>
                                <input type="datetime-local" name="startsAt" value={formData.startsAt ? timestampToDateTimeLocal(formData.startsAt) : ''} onChange={handleDateChange} className="w-full px-5 py-4 bg-dark border border-white/10 rounded-2xl text-white outline-none focus:ring-2 focus:ring-primary text-xs" style={{colorScheme: 'dark'}} />
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Encerramento (Opcional)</label>
                                <input type="datetime-local" name="closesAt" value={formData.closesAt ? timestampToDateTimeLocal(formData.closesAt) : ''} onChange={handleDateChange} className="w-full px-5 py-4 bg-dark border border-white/10 rounded-2xl text-white outline-none focus:ring-2 focus:ring-primary text-xs" style={{colorScheme: 'dark'}} />
                            </div>
                        </div>

                        <div className="pt-2">
                            <label className="flex items-center gap-3 cursor-pointer group">
                                <input type="checkbox" name="isActive" checked={formData.isActive} onChange={handleChange} className="w-5 h-5 rounded border-gray-600 bg-dark text-primary focus:ring-primary" />
                                <span className="text-xs font-black text-gray-400 uppercase tracking-widest group-hover:text-white transition-colors">Lista Ativa (Visível)</span>
                            </label>
                        </div>
                    </div>
                </form>

                <div className="mt-8 flex gap-3 border-t border-white/5 pt-6">
                    <button type="button" onClick={onClose} className="flex-1 py-4 bg-gray-800 text-gray-400 font-black rounded-2xl hover:bg-gray-700 transition-all uppercase text-xs tracking-widest">Cancelar</button>
                    <button type="submit" onClick={handleSubmit} disabled={isSaving} className="flex-[2] py-4 bg-primary text-white font-black rounded-2xl shadow-xl shadow-primary/20 hover:bg-primary-dark transition-all uppercase text-xs tracking-widest disabled:opacity-50">
                        {isSaving ? 'Salvando...' : 'Confirmar e Salvar'}
                    </button>
                </div>
            </div>
        </div>
    );
};

const AdminLists: React.FC = () => {
    const navigate = useNavigate();
    const { adminData, selectedOrgId } = useAdminAuth();

    const [lists, setLists] = useState<GuestList[]>([]);
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [copiedLink, setCopiedLink] = useState<string | null>(null);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingList, setEditingList] = useState<GuestList | null>(null);
    const [isToggling, setIsToggling] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');

    const fetchData = useCallback(async () => {
        if (!selectedOrgId) {
            setError("Nenhuma organização selecionada.");
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        setError('');
        try {
            const [listsData, campaignsData] = await Promise.all([
                getGuestListsForOrg(selectedOrgId),
                getAllCampaigns(selectedOrgId)
            ]);
            setLists(listsData);
            setCampaigns(campaignsData.sort((a,b) => a.name.localeCompare(b.name)));
        } catch (err: any) {
            setError(err.message || "Falha ao carregar dados.");
        } finally {
            setIsLoading(false);
        }
    }, [selectedOrgId]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleOpenModal = (list: GuestList | null = null) => {
        setEditingList(list);
        setIsModalOpen(true);
    };

    const handleToggleActive = async (list: GuestList) => {
        if (isToggling) return;
        setIsToggling(list.id);
        try {
            await updateGuestList(list.id, { isActive: !list.isActive });
            await fetchData();
        } catch (err: any) {
            setError(err.message || "Falha ao atualizar o status da lista.");
        } finally {
            setIsToggling(null);
        }
    };

    const handleSaveList = async (data: Partial<Omit<GuestList, 'id'>>, selectedIds: string[]) => {
        if (!selectedOrgId || !adminData?.email) return;
        setError('');
        try {
            if (editingList) {
                const selectedCampaign = campaigns.find(c => c.id === selectedIds[0]);
                if (!selectedCampaign) throw new Error("Evento inválido.");
                
                const updateData: Partial<Omit<GuestList, 'id'>> = {
                    ...data,
                    campaignId: selectedCampaign.id,
                    campaignName: selectedCampaign.name,
                    stateAbbr: selectedCampaign.stateAbbr,
                };
                await updateGuestList(editingList.id, updateData);
            } else {
                // Criação em lote para múltiplos eventos
                const creationPromises = selectedIds.map(async (cid) => {
                    const selectedCampaign = campaigns.find(c => c.id === cid);
                    if (!selectedCampaign) return;

                    const listData: Omit<GuestList, 'id' | 'createdAt'> = {
                        ...data,
                        organizationId: selectedOrgId,
                        campaignId: selectedCampaign.id,
                        campaignName: selectedCampaign.name,
                        stateAbbr: selectedCampaign.stateAbbr,
                        createdByEmail: adminData.email
                    } as Omit<GuestList, 'id' | 'createdAt'>;
                    
                    return createGuestList(listData);
                });
                
                await Promise.all(creationPromises);
            }
            await fetchData();
        } catch (err: any) {
            setError(err.message || 'Falha ao salvar a lista.');
            throw err;
        }
    };

    const handleDelete = async (listId: string) => {
        if (window.confirm("Tem certeza que deseja deletar esta lista? Todas as confirmações de convidados associadas serão perdidas.")) {
            try {
                await deleteGuestList(listId);
                await fetchData();
            } catch (err: any) {
                setError(err.message || 'Falha ao deletar a lista.');
            }
        }
    };
    
    const handleCopyLink = (campaignId: string) => {
        const link = `${window.location.origin}/#/listas/${campaignId}`;
        navigator.clipboard.writeText(link).then(() => {
            setCopiedLink(campaignId);
            setTimeout(() => setCopiedLink(null), 2500);
        }).catch(err => alert('Falha ao copiar o link.'));
    };

    const filteredLists = useMemo(() => {
        return lists.filter(l => 
            l.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
            l.campaignName.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [lists, searchQuery]);

    return (
        <div className="pb-20">
            <div className="flex justify-between items-center mb-8">
                <h1 className="text-3xl font-black text-white uppercase tracking-tighter">Listas VIP</h1>
                <div className="flex gap-2">
                    <button onClick={() => handleOpenModal()} className="px-4 py-2 bg-primary text-white font-black rounded-xl hover:bg-primary-dark text-xs uppercase tracking-widest shadow-lg shadow-primary/20">+ Criar Listas</button>
                    <button onClick={() => navigate(-1)} className="p-2 bg-gray-800 text-gray-400 rounded-xl hover:text-white transition-colors"><ArrowLeftIcon className="w-5 h-5"/></button>
                </div>
            </div>

            <div className="bg-secondary/60 backdrop-blur-xl rounded-[2.5rem] p-6 border border-white/5 shadow-2xl space-y-6">
                <div className="flex flex-col md:flex-row gap-4">
                    <div className="relative flex-grow">
                        <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                        <input 
                            type="text" 
                            placeholder="Buscar por lista ou evento..." 
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="w-full pl-11 pr-4 py-3 bg-dark border border-gray-700 rounded-2xl text-white text-sm focus:ring-1 focus:ring-primary outline-none font-medium"
                        />
                    </div>
                </div>

                {error && <p className="text-red-400 bg-red-900/20 p-4 rounded-2xl border border-red-900/50 text-[10px] font-black uppercase tracking-widest">{error}</p>}
                
                {isLoading ? (
                    <div className="py-20 text-center flex flex-col items-center gap-4">
                        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
                        <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Carregando listas...</p>
                    </div>
                ) : filteredLists.length === 0 ? (
                    <div className="text-center py-20 bg-dark/40 rounded-3xl border border-dashed border-gray-800">
                        <p className="text-gray-500 font-bold uppercase tracking-widest text-xs">Nenhuma lista encontrada.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filteredLists.map(list => (
                            <div key={list.id} className="bg-dark/40 rounded-[2rem] border border-white/5 overflow-hidden group hover:border-white/10 transition-all flex flex-col">
                                <div className="p-6 flex flex-col flex-grow">
                                    <div className="flex justify-between items-start mb-4">
                                        <div className="min-w-0">
                                            <h3 className="text-lg font-black text-white uppercase tracking-tight truncate">{list.name}</h3>
                                            <p className="text-[10px] text-primary font-black uppercase tracking-widest mt-1 flex items-center gap-1.5">
                                                <ClipboardDocumentListIcon className="w-3 h-3" />
                                                {list.campaignName}
                                            </p>
                                        </div>
                                        <label className="flex items-center cursor-pointer flex-shrink-0 ml-4">
                                            <div className="relative">
                                                <input 
                                                    type="checkbox" 
                                                    checked={list.isActive} 
                                                    onChange={() => handleToggleActive(list)} 
                                                    disabled={isToggling === list.id} 
                                                    className="sr-only peer" 
                                                />
                                                <div className="w-9 h-5 bg-gray-700 rounded-full peer peer-checked:bg-primary transition-colors"></div>
                                                <div className="dot absolute left-0.5 top-0.5 bg-white w-4 h-4 rounded-full transition-transform peer-checked:translate-x-4"></div>
                                            </div>
                                        </label>
                                    </div>

                                    <div className="grid grid-cols-2 gap-3 mb-6 pt-4 border-t border-white/5">
                                        <div className="bg-white/5 p-3 rounded-2xl text-center">
                                            <p className="text-[8px] font-black text-gray-500 uppercase tracking-widest mb-1">Convidados</p>
                                            <p className="text-xl font-black text-white">{list.guestAllowance}</p>
                                        </div>
                                        <div className="bg-white/5 p-3 rounded-2xl text-center">
                                            <p className="text-[8px] font-black text-gray-500 uppercase tracking-widest mb-1">Divulgadoras</p>
                                            <p className="text-xl font-black text-white">
                                                {Object.keys(list.assignments || {}).length > 0 ? Object.keys(list.assignments || {}).length : 'Toda Base'}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="mt-auto space-y-3">
                                        <div className="grid grid-cols-2 gap-2">
                                            <button onClick={() => navigate(`/admin/guestlist/${list.campaignId}`)} className="flex items-center justify-center gap-2 py-3 bg-gray-800 text-white font-black rounded-xl text-[9px] uppercase tracking-widest hover:bg-gray-700 transition-all border border-white/5">
                                                <UsersIcon className="w-3.5 h-3.5" /> VER NOMES
                                            </button>
                                            <button onClick={() => navigate(`/admin/guestlist-assignments/${list.id}`)} className="flex items-center justify-center gap-2 py-3 bg-gray-800 text-white font-black rounded-xl text-[9px] uppercase tracking-widest hover:bg-gray-700 transition-all border border-white/5">
                                                <FilterIcon className="w-3.5 h-3.5" /> ATRIBUIR
                                            </button>
                                        </div>
                                        
                                        <div className="grid grid-cols-4 gap-2">
                                            <button onClick={() => handleCopyLink(list.campaignId)} className={`p-3 rounded-xl flex items-center justify-center transition-all ${copiedLink === list.campaignId ? 'bg-green-600 text-white' : 'bg-blue-900/20 text-blue-400 hover:bg-blue-900/40'}`} title="Copiar Link">
                                                <LinkIcon className="w-4 h-4" />
                                            </button>
                                            <button onClick={() => navigate(`/admin/checkin/${list.campaignId}`)} className="p-3 bg-green-900/20 text-green-400 rounded-xl hover:bg-green-900/40 flex items-center justify-center transition-all" title="Check-in">
                                                <CheckCircleIcon className="w-4 h-4" />
                                            </button>
                                            <button onClick={() => handleOpenModal(list)} className="p-3 bg-indigo-900/20 text-indigo-400 rounded-xl hover:bg-indigo-900/40 flex items-center justify-center transition-all" title="Editar">
                                                <PencilIcon className="w-4 h-4" />
                                            </button>
                                            <button onClick={() => handleDelete(list.id)} className="p-3 bg-red-900/20 text-red-400 rounded-xl hover:bg-red-900/40 flex items-center justify-center transition-all" title="Excluir">
                                                <TrashIcon className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
            <ListModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSave={handleSaveList} list={editingList} campaigns={campaigns} />
        </div>
    );
};

export default AdminLists;
