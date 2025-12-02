import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { GuestList, Campaign, Timestamp, FieldValue } from '../types';
import { getGuestListsForOrg, createGuestList, updateGuestList, deleteGuestList } from '../services/guestListService';
import { getAllCampaigns } from '../services/settingsService';
import { ArrowLeftIcon, LinkIcon, PencilIcon, TrashIcon, CheckCircleIcon, ClipboardDocumentListIcon } from '../components/Icons';
// FIX: Import firebase to use Timestamp as a value.
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
    onSave: (data: Partial<Omit<GuestList, 'id'>>) => Promise<void>;
    list: Partial<GuestList> | null;
    campaigns: Campaign[];
}> = ({ isOpen, onClose, onSave, list, campaigns }) => {
    const [formData, setFormData] = useState<Partial<Omit<GuestList, 'id'>>>({});
    const [isSaving, setIsSaving] = useState(false);
    
    useEffect(() => {
        if (isOpen) {
            setFormData({
                name: list?.name || '',
                campaignId: list?.campaignId || '',
                description: list?.description || '',
                guestAllowance: list?.guestAllowance || 0,
                startsAt: list?.startsAt || null,
                closesAt: list?.closesAt || null,
                isActive: list?.isActive !== undefined ? list.isActive : true,
                askEmail: list?.askEmail !== undefined ? list.askEmail : false,
            });
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
        // FIX: Use firebase.firestore.Timestamp.fromDate() as Timestamp is only a type.
        const timestampValue = value ? firebase.firestore.Timestamp.fromDate(new Date(value)) : null;
        setFormData(prev => ({ ...prev, [name]: timestampValue }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            await onSave(formData);
            onClose();
        } catch (err) {
            // Error handling is done in parent component
        } finally {
            setIsSaving(false);
        }
    };
    
    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50 p-4" onClick={onClose}>
            <div className="bg-secondary rounded-lg shadow-xl p-6 w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <h2 className="text-2xl font-bold text-white mb-4">{list?.id ? 'Editar Lista' : 'Criar Nova Lista'}</h2>
                <form onSubmit={handleSubmit} className="flex-grow overflow-y-auto space-y-4 pr-2">
                    <div>
                        <label className="block text-sm font-medium text-gray-300">Evento Associado</label>
                        <select name="campaignId" value={formData.campaignId} onChange={handleChange} required className="mt-1 w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-white">
                            <option value="" disabled>Selecione um evento...</option>
                            {campaigns.map(c => <option key={c.id} value={c.id}>{c.name} ({c.stateAbbr})</option>)}
                        </select>
                    </div>
                    <input type="text" name="name" placeholder="Nome da Lista (ex: Lista VIP)" value={formData.name} onChange={handleChange} required className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-white" />
                    <textarea name="description" placeholder="Descrição (opcional)" value={formData.description} onChange={handleChange} className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-white" />
                    <div>
                        <label className="block text-sm font-medium text-gray-300">Nº de Convidados Padrão</label>
                        <input type="number" name="guestAllowance" min="0" value={formData.guestAllowance} onChange={handleChange} className="mt-1 w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-white" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-300">Início da Lista (opcional)</label>
                        <input type="datetime-local" name="startsAt" value={formData.startsAt ? timestampToDateTimeLocal(formData.startsAt) : ''} onChange={handleDateChange} className="mt-1 w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-white" style={{colorScheme: 'dark'}} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-300">Encerramento da Lista (opcional)</label>
                        <input type="datetime-local" name="closesAt" value={formData.closesAt ? timestampToDateTimeLocal(formData.closesAt) : ''} onChange={handleDateChange} className="mt-1 w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-white" style={{colorScheme: 'dark'}} />
                    </div>
                    <div className="flex flex-col gap-2">
                        <label className="flex items-center space-x-2 text-white">
                            <input type="checkbox" name="isActive" checked={formData.isActive} onChange={handleChange} className="h-4 w-4 text-primary bg-gray-700 border-gray-500 rounded" />
                            <span>Ativa (visível para divulgadoras)</span>
                        </label>
                        <label className="flex items-center space-x-2 text-white">
                            <input type="checkbox" name="askEmail" checked={formData.askEmail} onChange={handleChange} className="h-4 w-4 text-primary bg-gray-700 border-gray-500 rounded" />
                            <span>Solicitar E-mail dos Convidados?</span>
                        </label>
                    </div>
                </form>
                <div className="mt-6 flex justify-end space-x-3 border-t border-gray-700 pt-4">
                    <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-600 rounded-md">Cancelar</button>
                    <button type="submit" onClick={handleSubmit} disabled={isSaving} className="px-4 py-2 bg-primary text-white rounded-md disabled:opacity-50">{isSaving ? 'Salvando...' : 'Salvar'}</button>
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

    const handleSaveList = async (data: Partial<Omit<GuestList, 'id'>>) => {
        if (!selectedOrgId || !adminData?.email) return;
        setError('');
        try {
            const selectedCampaign = campaigns.find(c => c.id === data.campaignId);
            if (!selectedCampaign) throw new Error("Evento selecionado é inválido.");

            if (editingList) {
                const updateData: Partial<Omit<GuestList, 'id'>> = {
                    ...data,
                    campaignName: selectedCampaign.name,
                    stateAbbr: selectedCampaign.stateAbbr,
                };
                await updateGuestList(editingList.id, updateData);
            } else {
                const listData: Omit<GuestList, 'id' | 'createdAt'> = {
                    ...data,
                    organizationId: selectedOrgId,
                    campaignName: selectedCampaign.name,
                    stateAbbr: selectedCampaign.stateAbbr,
                    createdByEmail: adminData.email
                } as Omit<GuestList, 'id' | 'createdAt'>;
                await createGuestList(listData);
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

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold">Gerenciar Listas de Convidados</h1>
                 <button onClick={() => navigate(-1)} className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-500 text-sm">
                    <ArrowLeftIcon className="w-4 h-4" />
                    <span>Voltar</span>
                </button>
            </div>
            <div className="bg-secondary shadow-lg rounded-lg p-6">
                <div className="flex justify-between items-center mb-4">
                    <p className="text-gray-400">Crie e gerencie listas com links únicos para suas divulgadoras.</p>
                    <button onClick={() => handleOpenModal()} className="px-4 py-2 bg-primary text-white font-semibold rounded-md hover:bg-primary-dark">
                        + Criar Nova Lista
                    </button>
                </div>
                 {error && <p className="text-red-400 mb-4">{error}</p>}
                
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-700">
                        <thead className="bg-gray-700/50">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Nome da Lista</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Evento</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Atribuições</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Status</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-300 uppercase">Ações</th>
                            </tr>
                        </thead>
                         <tbody className="divide-y divide-gray-700">
                            {isLoading ? (
                                <tr><td colSpan={5} className="text-center py-8">Carregando...</td></tr>
                            ) : lists.length === 0 ? (
                                <tr><td colSpan={5} className="text-center py-8 text-gray-400">Nenhuma lista criada ainda.</td></tr>
                            ) : (
                                lists.map(list => (
                                    <tr key={list.id} className="hover:bg-gray-700/40">
                                        <td className="px-4 py-3 whitespace-nowrap font-medium text-white">{list.name}</td>
                                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-300">{list.campaignName}</td>
                                        <td className="px-4 py-3 whitespace-nowrap text-sm text-center">
                                            {Object.keys(list.assignments || {}).length > 0 ? Object.keys(list.assignments || {}).length : 'Todas'}
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap">
                                            <label className="flex items-center cursor-pointer" title={list.isActive ? 'Desativar lista' : 'Ativar lista'}>
                                                <div className="relative">
                                                    <input 
                                                        type="checkbox" 
                                                        checked={list.isActive} 
                                                        onChange={() => handleToggleActive(list)} 
                                                        disabled={isToggling === list.id} 
                                                        className="sr-only peer" 
                                                    />
                                                    <div className="w-11 h-6 bg-gray-600 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                                                </div>
                                            </label>
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium">
                                            <div className="flex justify-end items-center gap-4">
                                                <button onClick={() => navigate(`/admin/guestlist-assignments/${list.id}`)} className="text-gray-300 hover:text-white" title="Gerenciar Atribuições"><ClipboardDocumentListIcon className="w-5 h-5"/></button>
                                                <button onClick={() => navigate(`/admin/checkin/${list.campaignId}`)} className="text-green-400 hover:text-green-300" title="Controlar Entrada (Check-in)"><CheckCircleIcon className="w-5 h-5"/></button>
                                                <button onClick={() => handleCopyLink(list.campaignId)} className="text-blue-400 hover:text-blue-300" title="Copiar Link do Evento">{copiedLink === list.campaignId ? 'Copiado!' : <LinkIcon className="w-5 h-5"/>}</button>
                                                <button onClick={() => handleOpenModal(list)} className="text-yellow-400 hover:text-yellow-300" title="Editar"><PencilIcon className="w-5 h-5"/></button>
                                                <button onClick={() => handleDelete(list.id)} className="text-red-400 hover:text-red-300" title="Excluir"><TrashIcon className="w-5 h-5"/></button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                         </tbody>
                    </table>
                </div>
            </div>
            <ListModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSave={handleSaveList} list={editingList} campaigns={campaigns} />
        </div>
    );
};

export default AdminLists;
