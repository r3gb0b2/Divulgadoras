import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { getOrganization, updateOrganization } from '../services/organizationService';
import { Organization } from '../types';

const ManageOrganizationPage: React.FC = () => {
    const { orgId } = useParams<{ orgId: string }>();
    const navigate = useNavigate();
    const [organization, setOrganization] = useState<Organization | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

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
            navigate('/admin/organizations');
        } catch (err: any) {
            setError(err.message || 'Failed to save changes.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        if (organization) {
            setOrganization({ ...organization, [name]: value });
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
             <div className="max-w-2xl">
                <form onSubmit={handleUpdate} className="bg-secondary shadow-lg rounded-lg p-6 space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-300">Nome da Organização</label>
                        <input
                            type="text"
                            name="name"
                            value={organization.name}
                            onChange={handleChange}
                            className="mt-1 w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-gray-200"
                        />
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-300">Email do Proprietário</label>
                        <input
                            type="email"
                            name="ownerEmail"
                            value={organization.ownerEmail}
                            readOnly
                            className="mt-1 w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-800 text-gray-400 cursor-not-allowed"
                        />
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-300">Plano de Assinatura</label>
                        <select
                            name="planId"
                            value={organization.planId}
                            onChange={handleChange}
                            className="mt-1 w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-gray-200"
                        >
                            <option value="basic">Básico</option>
                            <option value="professional">Profissional</option>
                        </select>
                    </div>
                     <div className="flex justify-end pt-4">
                        <button
                            type="submit"
                            disabled={isSaving}
                            className="px-6 py-2 bg-primary text-white rounded-md hover:bg-primary-dark disabled:opacity-50"
                        >
                            {isSaving ? 'Salvando...' : 'Salvar Alterações'}
                        </button>
                    </div>
                </form>
             </div>
        </div>
    );
};

export default ManageOrganizationPage;
