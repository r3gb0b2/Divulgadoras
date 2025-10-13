import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { getOrganization, updateOrganization, deleteOrganizationAndRelatedAdmins } from '../services/organizationService';
import { Organization } from '../types';
import { states } from '../constants/states';

const ManageOrganizationPage: React.FC = () => {
    const { orgId } = useParams<{ orgId: string }>();
    const navigate = useNavigate();
    const [organization, setOrganization] = useState<Organization | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    
    // State for delete confirmation modal
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [deleteConfirmationName, setDeleteConfirmationName] = useState('');

    const fetchOrg = useCallback(async () => {
        if (!orgId) return;
        setIsLoading(true);
        try {
            const org = await getOrganization(orgId);
            if (!org) {
                throw new Error('Organization not found.');
            }
            setOrganization(org);
        } catch (err: any) {
            setError(err.message || 'Failed to load organization data.');
        } finally {
            setIsLoading(false);
        }
    }, [orgId]);

    useEffect(() => {
        fetchOrg();
    }, [fetchOrg]);

    const handleUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!orgId || !organization) return;
        setIsSaving(true);
        try {
            const { id, ...dataToSave } = organization;
            await updateOrganization(orgId, dataToSave);
            alert('Organization updated successfully.');
            // No navigation, stay on page
        } catch (err: any) {
            setError(err.message || 'Failed to save changes.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        
        let finalValue: string | boolean | string[] = value;

        if (type === 'checkbox') {
            finalValue = (e.target as HTMLInputElement).checked;
        }

        if (name === "assignedStates") {
             const options = (e.target as HTMLSelectElement).options;
             const selectedStates: string[] = [];
             for (let i = 0, l = options.length; i < l; i++) {
                if (options[i].selected) {
                    selectedStates.push(options[i].value);
                }
             }
             finalValue = selectedStates;
        }

        if (organization) {
            setOrganization({ ...organization, [name]: finalValue });
        }
    };
    
    const handleDelete = async () => {
        if (!orgId || !organization || deleteConfirmationName !== organization.name) {
            alert("O nome da organização não confere.");
            return;
        }
        setIsSaving(true);
        try {
            await deleteOrganizationAndRelatedAdmins(orgId);
            alert("Organização e administradores relacionados foram excluídos com sucesso.");
            navigate('/admin/organizations');
        } catch (err: any) {
            setError(err.message || 'Falha ao excluir a organização.');
        } finally {
            setIsSaving(false);
            setIsDeleteModalOpen(false);
        }
    };
    
    if (isLoading) {
        return <div className="text-center py-10">Loading organization details...</div>;
    }

    if (error) {
        return <div className="text-red-500 text-center py-10">{error}</div>;
    }

    if (!organization) {
        return <div className="text-center py-10">Organization not found.</div>;
    }

    return (
        <div>
             <div className="mb-6">
                <Link to="/admin/organizations" className="text-sm text-primary hover:underline">&larr; Todas as Organizações</Link>
                <h1 className="text-3xl font-bold mt-1">Gerenciar: {organization.name}</h1>
            </div>
             <div className="max-w-3xl">
                <form onSubmit={handleUpdate} className="bg-secondary shadow-lg rounded-lg p-6 space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-300">Nome da Organização</label>
                        <input type="text" name="name" value={organization.name} onChange={handleChange} className="mt-1 w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-gray-200" />
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-300">Email do Proprietário</label>
                        <input type="email" name="ownerEmail" value={organization.ownerEmail} readOnly className="mt-1 w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-800 text-gray-400 cursor-not-allowed" />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-300">Plano de Assinatura</label>
                            <select name="planId" value={organization.planId} onChange={handleChange} className="mt-1 w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-gray-200">
                                <option value="basic">Básico</option>
                                <option value="professional">Profissional</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-300">Status</label>
                            <select name="status" value={organization.status} onChange={handleChange} className="mt-1 w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-gray-200">
                                <option value="active">Ativa</option>
                                <option value="inactive">Inativa</option>
                            </select>
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-300">Visibilidade Pública</label>
                        <select name="isPublic" value={String(organization.isPublic)} onChange={(e) => handleChange({ ...e, target: {...e.target, name: 'isPublic', value: e.target.value === 'true' } } as any)} className="mt-1 w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-gray-200">
                            <option value="true">Pública (aparece na lista inicial)</option>
                            <option value="false">Oculta (acesso apenas por link direto)</option>
                        </select>
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-300">Localidades Permitidas</label>
                        <select name="assignedStates" value={organization.assignedStates || []} onChange={handleChange} multiple className="mt-1 w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-gray-200 h-48">
                            {states.map(state => (
                                <option key={state.abbr} value={state.abbr}>{state.name}</option>
                            ))}
                        </select>
                        <p className="text-xs text-gray-400 mt-1">Segure Ctrl (ou Cmd) para selecionar múltiplos estados. Se nenhum for selecionado, todos serão permitidos.</p>
                    </div>

                     <div className="flex justify-end pt-4">
                        <button type="submit" disabled={isSaving} className="px-6 py-2 bg-primary text-white rounded-md hover:bg-primary-dark disabled:opacity-50">
                            {isSaving ? 'Salvando...' : 'Salvar Alterações'}
                        </button>
                    </div>
                </form>

                {/* Danger Zone */}
                <div className="mt-8 bg-secondary shadow-lg rounded-lg p-6 border border-red-900/50">
                    <h3 className="text-xl font-semibold text-red-400">Zona de Perigo</h3>
                    <p className="text-sm text-gray-400 mt-2 mb-4">Estas ações são destrutivas e não podem ser desfeitas.</p>
                    <button onClick={() => setIsDeleteModalOpen(true)} className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 text-sm">
                        Excluir Organização
                    </button>
                </div>
             </div>

             {/* Delete Confirmation Modal */}
             {isDeleteModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-75 flex justify-center items-center z-50 p-4">
                    <div className="bg-secondary rounded-lg shadow-xl p-6 w-full max-w-lg">
                        <h2 className="text-2xl font-bold text-red-400">Excluir Organização</h2>
                        <p className="text-gray-300 mt-2">Esta ação é irreversível. Todos os administradores associados a esta organização também serão removidos.</p>
                        <p className="text-gray-400 mt-4">Para confirmar, digite o nome da organização: <strong className="text-primary">{organization.name}</strong></p>
                        <input 
                            type="text"
                            value={deleteConfirmationName}
                            onChange={(e) => setDeleteConfirmationName(e.target.value)}
                            className="mt-2 w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-gray-200"
                        />
                        <div className="mt-6 flex justify-end space-x-3">
                            <button type="button" onClick={() => setIsDeleteModalOpen(false)} className="px-4 py-2 bg-gray-600 text-gray-200 rounded-md hover:bg-gray-500">
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={handleDelete}
                                disabled={isSaving || deleteConfirmationName !== organization.name}
                                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:bg-red-800 disabled:cursor-not-allowed"
                            >
                                {isSaving ? 'Excluindo...' : 'Excluir Permanentemente'}
                            </button>
                        </div>
                    </div>
                </div>
             )}
        </div>
    );
};

export default ManageOrganizationPage;
