import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { getOrganization, updateOrganization, deleteOrganization } from '../services/organizationService';
import { getAllAdmins, setAdminUserData } from '../services/adminService';
import { Organization, OrganizationStatus, PlanId, AdminUserData } from '../types';
import { states } from '../constants/states';
import { Timestamp } from 'firebase/firestore';
import { ArrowLeftIcon } from '../components/Icons';

const timestampToInputDate = (ts: Timestamp | undefined): string => {
    if (!ts) return '';
    // toDate() converts to local time, toISOString() converts to UTC, split removes time part
    return ts.toDate().toISOString().split('T')[0];
};

const ManageOrganizationPage: React.FC = () => {
    const { orgId } = useParams<{ orgId: string }>();
    const navigate = useNavigate();
    const [organization, setOrganization] = useState<Organization | null>(null);
    const [formData, setFormData] = useState<Partial<Organization>>({});
    const [allAdmins, setAllAdmins] = useState<AdminUserData[]>([]);
    const [selectedAdminToAdd, setSelectedAdminToAdd] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchOrganization = useCallback(async () => {
        if (!orgId) return;
        setIsLoading(true);
        setError(null);
        try {
            const [orgData, adminsData] = await Promise.all([
                getOrganization(orgId),
                getAllAdmins()
            ]);

            if (!orgData) {
                throw new Error("Organização não encontrada.");
            }
            setOrganization(orgData);
            setFormData(orgData);
            setAllAdmins(adminsData);
        } catch (err: any) {
            setError(err.message || "Falha ao carregar a organização.");
        } finally {
            setIsLoading(false);
        }
    }, [orgId]);

    useEffect(() => {
        fetchOrganization();
    }, [fetchOrganization]);
    
    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        
        if (type === 'checkbox') {
             setFormData(prev => ({ ...prev, [name]: (e.target as HTMLInputElement).checked }));
        } else {
             setFormData(prev => ({ ...prev, [name]: value }));
        }
    };

    const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        if (value) {
            // Create date in local timezone to avoid off-by-one day issues
            const [year, month, day] = value.split('-').map(Number);
            const localDate = new Date(year, month - 1, day);
            setFormData(prev => ({ ...prev, [name]: Timestamp.fromDate(localDate) }));
        } else {
            setFormData(prev => ({ ...prev, [name]: undefined }));
        }
    };

    const addDaysToExpirtation = (days: number) => {
        const currentExpiry = formData.planExpiresAt ? (formData.planExpiresAt as Timestamp).toDate() : new Date();
        // If current expiry date is in the past, we should add days from today
        const baseDate = currentExpiry < new Date() ? new Date() : currentExpiry;
        
        baseDate.setDate(baseDate.getDate() + days);
        setFormData(prev => ({ ...prev, planExpiresAt: Timestamp.fromDate(baseDate) }));
    };
    
    const handleStateToggle = (stateAbbr: string) => {
        const currentStates = formData.assignedStates || [];
        const newStates = currentStates.includes(stateAbbr)
            ? currentStates.filter(s => s !== stateAbbr)
            : [...currentStates, stateAbbr];
        setFormData(prev => ({...prev, assignedStates: newStates }));
    }

    const { associatedAdmins, availableAdmins } = useMemo(() => {
        const associated: AdminUserData[] = [];
        const available: AdminUserData[] = [];

        allAdmins.forEach(admin => {
            if (admin.organizationId === orgId) {
                associated.push(admin);
            } else {
                available.push(admin);
            }
        });

        associated.sort((a, b) => a.email.localeCompare(b.email));
        available.sort((a, b) => a.email.localeCompare(b.email));

        return { associatedAdmins: associated, availableAdmins: available };
    }, [allAdmins, orgId]);

    const handleAddAdmin = async () => {
        if (!selectedAdminToAdd || !orgId) return;
        setIsSaving(true);
        setError(null);
        try {
            await setAdminUserData(selectedAdminToAdd, { organizationId: orgId });
            setSelectedAdminToAdd(''); // Reset dropdown
            await fetchOrganization(); // Refetch all data
            alert('Administrador associado com sucesso!');
        } catch (err: any) {
            setError(err.message || 'Falha ao associar administrador.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleRemoveAdmin = async (adminId: string) => {
        if (!adminId) return;
        if (window.confirm('Tem certeza que deseja desvincular este administrador da organização? Ele perderá o acesso ao painel desta organização.')) {
            setIsSaving(true);
            setError(null);
            try {
                await setAdminUserData(adminId, { organizationId: '' }); // Unset organizationId
                await fetchOrganization(); // Refetch all data
                alert('Administrador desvinculado com sucesso!');
            } catch (err: any) {
                setError(err.message || 'Falha ao desvincular administrador.');
            } finally {
                setIsSaving(false);
            }
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!orgId) return;

        setIsSaving(true);
        setError(null);
        try {
            const { id, createdAt, ownerUid, ...dataToSave } = formData;
            await updateOrganization(orgId, dataToSave as Partial<Omit<Organization, 'id'>>);
            alert("Organização atualizada com sucesso!");
            fetchOrganization();
        } catch (err: any) {
            setError(err.message || "Falha ao salvar as alterações.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!orgId) return;
        if (window.confirm(`Tem certeza que deseja DELETAR a organização "${organization?.name}"? Esta ação é irreversível e removerá todos os dados associados.`)) {
             setIsSaving(true);
             try {
                // TODO: A complete implementation should also delete associated promoters, admins, campaigns etc.
                // This is a complex operation that might be better as a Firebase Function.
                await deleteOrganization(orgId);
                alert("Organização deletada.");
                navigate('/admin/organizations');
             } catch (err: any) {
                setError(err.message || "Falha ao deletar a organização.");
                setIsSaving(false);
             }
        }
    };
    
    const formatDate = (timestamp: Timestamp | undefined) => {
        if (!timestamp) return 'N/A';
        return timestamp.toDate().toLocaleString('pt-BR');
    }

    if (isLoading) {
        return <div className="text-center py-10">Carregando organização...</div>;
    }
    
    if (error && !organization) {
        return <p className="text-red-400 text-center">{error}</p>;
    }

    if (!organization || !formData) {
        return <p className="text-center">Organização não encontrada.</p>;
    }

    return (
        <div>
            <div className="mb-6">
                 <button onClick={() => navigate(-1)} className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary-dark transition-colors mb-2">
                    <ArrowLeftIcon className="w-5 h-5" />
                    <span>Todas as Organizações</span>
                </button>
                <h1 className="text-3xl font-bold mt-1">Gerenciar: {organization.name}</h1>
                 {error && <div className="bg-red-900/50 text-red-300 p-3 rounded-md mt-4 text-sm font-semibold">{error}</div>}
            </div>

            <form onSubmit={handleSave} className="bg-secondary shadow-lg rounded-lg p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-300">Nome da Organização</label>
                        <input type="text" name="name" value={formData.name || ''} onChange={handleChange} className="mt-1 w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700"/>
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-300">Email do Proprietário</label>
                        <input type="email" name="ownerEmail" value={formData.ownerEmail || ''} onChange={handleChange} className="mt-1 w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700"/>
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-300">Plano</label>
                        <select name="planId" value={formData.planId || 'basic'} onChange={handleChange} className="mt-1 w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700">
                           <option value="basic">Básico</option>
                           <option value="professional">Profissional</option>
                        </select>
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-300">Status</label>
                        <select name="status" value={formData.status || 'hidden'} onChange={handleChange} className="mt-1 w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700">
                           <option value="active">Ativa</option>
                           <option value="trial">Teste</option>
                           <option value="expired">Expirada</option>
                           <option value="hidden">Oculta</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-300">Data de Expiração do Plano</label>
                        <div className="flex items-center gap-2 mt-1">
                            <input
                                type="date"
                                name="planExpiresAt"
                                value={timestampToInputDate(formData.planExpiresAt as Timestamp)}
                                onChange={handleDateChange}
                                className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-gray-200"
                                style={{ colorScheme: 'dark' }}
                            />
                            <button type="button" onClick={() => addDaysToExpirtation(15)} className="px-3 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-500 text-sm whitespace-nowrap">+ 15 dias</button>
                            <button type="button" onClick={() => addDaysToExpirtation(30)} className="px-3 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-500 text-sm whitespace-nowrap">+ 30 dias</button>
                        </div>
                    </div>
                     <div className="flex items-end">
                        <label className="flex items-center space-x-2">
                           <input type="checkbox" name="public" checked={!!formData.public} onChange={handleChange} className="h-4 w-4 text-primary bg-gray-700 border-gray-500 rounded" />
                           <span className="text-sm font-medium text-gray-300">Visível na página inicial</span>
                        </label>
                    </div>
                    <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-300 mb-2">Estados Atribuídos</label>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 p-2 border border-gray-600 rounded-md max-h-48 overflow-y-auto">
                           {states.map(s => (
                              <label key={s.abbr} className="flex items-center space-x-2 cursor-pointer p-1 rounded hover:bg-gray-700/50">
                                 <input type="checkbox" checked={(formData.assignedStates || []).includes(s.abbr)} onChange={() => handleStateToggle(s.abbr)} className="h-4 w-4 text-primary bg-gray-700 border-gray-500 rounded" />
                                 <span>{s.name}</span>
                              </label>
                           ))}
                        </div>
                    </div>

                    <div className="md:col-span-2 border-t border-gray-700 pt-6">
                        <label className="block text-sm font-medium text-gray-300 mb-2">Administradores Associados</label>
                        
                        {/* List of current admins */}
                        <div className="space-y-2 p-2 border border-gray-600 rounded-md mb-4 max-h-48 overflow-y-auto">
                            {associatedAdmins.length > 0 ? associatedAdmins.map(admin => (
                                <div key={admin.uid} className="flex justify-between items-center p-2 bg-gray-800 rounded">
                                    <div>
                                        <p className="text-sm font-medium text-white">{admin.email}</p>
                                        <p className="text-xs text-gray-400 capitalize">{admin.role}</p>
                                    </div>
                                    {admin.uid !== organization.ownerUid ? (
                                        <button type="button" onClick={() => handleRemoveAdmin(admin.uid)} disabled={isSaving} className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50">
                                            Desvincular
                                        </button>
                                    ) : (
                                        <span className="text-xs text-yellow-400 font-semibold">Proprietário</span>
                                    )}
                                </div>
                            )) : <p className="text-sm text-gray-500 text-center p-2">Nenhum administrador associado.</p>}
                        </div>
                        
                        {/* Add new admin */}
                        <div>
                            <label className="block text-sm font-medium text-gray-300">Adicionar administrador existente</label>
                            <div className="flex items-center gap-2 mt-1">
                                <select
                                    value={selectedAdminToAdd}
                                    onChange={(e) => setSelectedAdminToAdd(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-gray-200"
                                >
                                    <option value="">Selecione um administrador...</option>
                                    {availableAdmins.map(admin => (
                                        <option key={admin.uid} value={admin.uid}>{admin.email} {admin.organizationId ? '(outra org)' : '(sem org)'}</option>
                                    ))}
                                </select>
                                <button 
                                    type="button" 
                                    onClick={handleAddAdmin} 
                                    disabled={!selectedAdminToAdd || isSaving}
                                    className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm whitespace-nowrap disabled:opacity-50"
                                >
                                    Adicionar
                                </button>
                            </div>
                        </div>
                    </div>


                    <div className="md:col-span-2 text-sm text-gray-400">Criada em: {formatDate(organization.createdAt as Timestamp)}</div>
                </div>

                <div className="flex justify-between items-center border-t border-gray-700 pt-4 mt-4">
                    <button type="button" onClick={handleDelete} disabled={isSaving} className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50">
                        {isSaving ? '...' : 'Deletar Organização'}
                    </button>
                    <button type="submit" disabled={isSaving} className="px-6 py-2 bg-primary text-white rounded-md hover:bg-primary-dark disabled:opacity-50">
                        {isSaving ? 'Salvando...' : 'Salvar Alterações'}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default ManageOrganizationPage;