import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { AdminUserData, AdminRole, Campaign } from '../types';
import { getAllAdmins, setAdminUserData, deleteAdminUser } from '../services/adminService';
import { getAllCampaigns } from '../services/settingsService';
// FIX: import `stateMap` to resolve reference error.
import { states, stateMap } from '../constants/states';
import { auth } from '../firebase/config';
import { createUserWithEmailAndPassword } from 'firebase/auth';


const ManageUsersModal: React.FC<{ isOpen: boolean; onClose: () => void; }> = ({ isOpen, onClose }) => {
    const [admins, setAdmins] = useState<AdminUserData[]>([]);
    const [allCampaigns, setAllCampaigns] = useState<Campaign[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    
    // Form state for new/editing admin
    const [isEditing, setIsEditing] = useState<AdminUserData | null>(null);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [role, setRole] = useState<AdminRole>('viewer');
    const [assignedStates, setAssignedStates] = useState<string[]>([]);
    const [assignedCampaigns, setAssignedCampaigns] = useState<{ [stateAbbr: string]: string[] }>({});
    
    const fetchData = useCallback(async () => {
        setIsLoading(true);
        setError('');
        try {
            const [adminData, campaignData] = await Promise.all([getAllAdmins(), getAllCampaigns()]);
            setAdmins(adminData);
            setAllCampaigns(campaignData);
        } catch (err) {
            setError('Falha ao carregar dados.');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (isOpen) {
            fetchData();
            resetForm();
        }
    }, [isOpen, fetchData]);

    const campaignsByState = useMemo(() => {
        return allCampaigns.reduce((acc, campaign) => {
            if (!acc[campaign.stateAbbr]) {
                acc[campaign.stateAbbr] = [];
            }
            acc[campaign.stateAbbr].push(campaign);
            return acc;
        }, {} as { [stateAbbr: string]: Campaign[] });
    }, [allCampaigns]);

    if (!isOpen) return null;

    const resetForm = () => {
        setIsEditing(null);
        setEmail('');
        setPassword('');
        setRole('viewer');
        setAssignedStates([]);
        setAssignedCampaigns({});
    };

    const handleStateToggle = (stateAbbr: string) => {
        const isCurrentlyAssigned = assignedStates.includes(stateAbbr);
        const newAssignedStates = isCurrentlyAssigned
            ? assignedStates.filter(s => s !== stateAbbr)
            : [...assignedStates, stateAbbr];
        
        setAssignedStates(newAssignedStates);

        // Also clean up campaign assignments if a state is removed
        if (isCurrentlyAssigned) {
            setAssignedCampaigns(prev => {
                const newCampaigns = {...prev};
                delete newCampaigns[stateAbbr];
                return newCampaigns;
            });
        }
    };

    const handleCampaignToggle = (stateAbbr: string, campaignName: string) => {
        setAssignedCampaigns(prev => {
            const currentStateCampaigns = prev[stateAbbr] || [];
            const newCampaigns = currentStateCampaigns.includes(campaignName)
                ? currentStateCampaigns.filter(c => c !== campaignName)
                : [...currentStateCampaigns, campaignName];

            // If the new list of campaigns is empty, it means "all", so we can remove the key
            if (newCampaigns.length === 0) {
                const updated = { ...prev };
                delete updated[stateAbbr];
                return updated;
            }
            
            // If the list of selected campaigns matches all available, it's also "all"
            if (campaignsByState[stateAbbr] && newCampaigns.length === campaignsByState[stateAbbr].length) {
                 const updated = { ...prev };
                 delete updated[stateAbbr];
                 return updated;
            }

            return { ...prev, [stateAbbr]: newCampaigns };
        });
    }

    const handleSelectAllCampaigns = (stateAbbr: string, shouldSelectAll: boolean) => {
        setAssignedCampaigns(prev => {
            const updated = { ...prev };
            if (shouldSelectAll) {
                delete updated[stateAbbr]; // No specific campaigns means "all"
            } else {
                // To un-select "all", we assign an empty array, which is an invalid state
                // a user must select at least one to uncheck "all".
                // In practice, this logic is handled by what's displayed.
                updated[stateAbbr] = []; 
            }
            return updated;
        });
    }

    const handleEditClick = (admin: AdminUserData) => {
        setIsEditing(admin);
        setEmail(admin.email);
        setRole(admin.role);
        setAssignedStates(admin.assignedStates || []);
        setAssignedCampaigns(admin.assignedCampaigns || {});
        setPassword(''); // Clear password field for editing
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (!email) return setError("O campo de e-mail é obrigatório.");
        if (!isEditing && !password) return setError("O campo de senha é obrigatório para novos usuários.");
        
        setIsLoading(true);
        try {
            let targetUid = isEditing ? admins.find(a => a.email === email)?.uid : null;

            if (!isEditing) {
                const { user } = await createUserWithEmailAndPassword(auth, email, password);
                targetUid = user.uid;
                alert(`Usuário ${email} criado com sucesso. Lembre-se de compartilhar a senha com ele.`);
            }

            if (!targetUid) throw new Error("Não foi possível encontrar o UID do usuário.");

            const dataToSave = { email, role, assignedStates, assignedCampaigns };
            await setAdminUserData(targetUid, dataToSave);

            resetForm();
            await fetchData();
        } catch (err: any) {
             if (err.code === 'auth/email-already-in-use') setError("Este e-mail já está em uso.");
             else if (err.code === 'auth/weak-password') setError("A senha deve ter pelo menos 6 caracteres.");
             else setError(err.message || 'Ocorreu um erro ao salvar o administrador.');
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleDelete = async (adminToDelete: AdminUserData) => {
        if (window.confirm(`Tem certeza que deseja remover as permissões de admin para ${adminToDelete.email}?`)) {
            setIsLoading(true);
            try {
                await deleteAdminUser(adminToDelete.uid);
                await fetchData();
            } catch (err: any) {
                setError(err.message || 'Falha ao remover administrador.');
            } finally {
                setIsLoading(false);
            }
        }
    };
    
    const getCampaignSummary = (admin: AdminUserData) => {
        if (!admin.assignedStates || admin.assignedStates.length === 0) return 'Nenhum estado atribuído';
        return admin.assignedStates.map(state => {
            const campaigns = admin.assignedCampaigns?.[state];
            if (!campaigns || campaigns.length === 0) return `${state} (Todos)`;
            return `${state} (${campaigns.length} ${campaigns.length === 1 ? 'evento' : 'eventos'})`;
        }).join('; ');
    }

    const roleNames: { [key in AdminRole]: string } = { superadmin: 'Super Admin', admin: 'Admin', viewer: 'Visualizador' };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50 p-4">
            <div className="bg-secondary rounded-lg shadow-xl p-6 w-full max-w-6xl max-h-[90vh] flex flex-col">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-2xl font-bold text-white">Gerenciar Usuários Admin</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-300 text-3xl">&times;</button>
                </div>

                <div className="flex flex-col md:flex-row gap-6 flex-grow min-h-0">
                    {/* Form Section */}
                    <form onSubmit={handleSubmit} className="w-full md:w-1/3 border border-gray-700 p-4 rounded-lg flex flex-col space-y-4">
                        <h3 className="text-xl font-semibold">{isEditing ? 'Editar Usuário' : 'Adicionar Usuário'}</h3>
                        
                        <div>
                            <label className="block text-sm font-medium text-gray-300">Email</label>
                            <input type="email" value={email} onChange={e => setEmail(e.target.value)} disabled={!!isEditing} className="mt-1 w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-gray-200 disabled:bg-gray-800 disabled:cursor-not-allowed"/>
                        </div>
                        {!isEditing && (
                            <div>
                                <label className="block text-sm font-medium text-gray-300">Senha</label>
                                <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="mt-1 w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-gray-200" placeholder="Mínimo 6 caracteres" />
                            </div>
                        )}
                         <div>
                            <label className="block text-sm font-medium text-gray-300">Nível de Acesso</label>
                            <select value={role} onChange={e => setRole(e.target.value as AdminRole)} className="mt-1 w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-gray-200">
                                <option value="viewer">Visualizador</option>
                                <option value="admin">Admin</option>
                                <option value="superadmin">Super Admin</option>
                            </select>
                        </div>

                        <div className="flex-grow flex flex-col min-h-0 space-y-4">
                            <div className="flex flex-col">
                                <label className="block text-sm font-medium text-gray-300 mb-1">Estados Atribuídos</label>
                                <div className="p-2 border border-gray-600 rounded-md overflow-y-auto max-h-40 space-y-1">
                                    {states.map(s => (
                                        <label key={s.abbr} className="flex items-center space-x-2 cursor-pointer p-1 rounded hover:bg-gray-700/50">
                                            <input type="checkbox" checked={assignedStates.includes(s.abbr)} onChange={() => handleStateToggle(s.abbr)} className="h-4 w-4 text-primary bg-gray-700 border-gray-500 rounded" disabled={role === 'superadmin'} />
                                            <span>{s.name} ({s.abbr})</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                            
                            <div className="flex flex-col flex-grow min-h-0">
                                <label className="block text-sm font-medium text-gray-300 mb-1">Eventos Atribuídos</label>
                                <div className="p-2 border border-gray-600 rounded-md overflow-y-auto flex-grow space-y-3">
                                    {role === 'superadmin' ? <p className="text-sm text-gray-400">Super Admin tem acesso a tudo.</p> :
                                    assignedStates.length === 0 ? <p className="text-sm text-gray-400">Selecione um estado para ver os eventos.</p> :
                                    assignedStates.map(stateAbbr => (
                                        <div key={stateAbbr}>
                                            <h4 className="font-semibold text-primary">{stateMap[stateAbbr]}</h4>
                                            <div className="pl-2 border-l-2 border-gray-600">
                                                <label className="flex items-center space-x-2 cursor-pointer p-1 text-sm">
                                                    <input type="checkbox" checked={!assignedCampaigns[stateAbbr] || assignedCampaigns[stateAbbr]?.length === 0} onChange={(e) => handleSelectAllCampaigns(stateAbbr, e.target.checked)} className="h-4 w-4 text-primary bg-gray-700 border-gray-500 rounded"/>
                                                    <span>Todos os Eventos</span>
                                                </label>
                                                {(!assignedCampaigns[stateAbbr] && campaignsByState[stateAbbr]?.length > 0) ? null : campaignsByState[stateAbbr]?.map(c => (
                                                    <label key={c.id} className="flex items-center space-x-2 cursor-pointer p-1 text-sm">
                                                        <input type="checkbox" checked={assignedCampaigns[stateAbbr]?.includes(c.name)} onChange={() => handleCampaignToggle(stateAbbr, c.name)} className="h-4 w-4 text-primary bg-gray-700 border-gray-500 rounded"/>
                                                        <span>{c.name}</span>
                                                    </label>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {error && <p className="text-red-400 text-sm">{error}</p>}
                        <div className="flex gap-2 pt-2">
                            <button type="submit" disabled={isLoading} className="flex-1 px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-dark disabled:opacity-50">
                                {isLoading ? 'Salvando...' : (isEditing ? 'Salvar Alterações' : 'Adicionar Usuário')}
                            </button>
                            {isEditing && <button type="button" onClick={resetForm} className="px-4 py-2 bg-gray-600 rounded-md">Cancelar</button>}
                        </div>
                    </form>

                    {/* Users List Section */}
                    <div className="w-full md:w-2/3 flex-grow overflow-y-auto border border-gray-700 p-4 rounded-lg">
                         <h3 className="text-xl font-semibold mb-4">Usuários Existentes</h3>
                         {isLoading && <p>Carregando...</p>}
                         <div className="space-y-2">
                            {admins.map(admin => (
                                <div key={admin.uid} className="flex items-center justify-between p-3 bg-gray-700/50 rounded-md">
                                    <div>
                                        <p className="font-semibold">{admin.email}</p>
                                        <p className="text-sm text-gray-400">
                                            <span className="font-bold">{roleNames[admin.role]}</span> - {getCampaignSummary(admin)}
                                        </p>
                                    </div>
                                    <div className="flex gap-3">
                                        <button onClick={() => handleEditClick(admin)} className="text-indigo-400 hover:text-indigo-300">Editar</button>
                                        <button onClick={() => handleDelete(admin)} className="text-red-400 hover:text-red-300">Excluir</button>
                                    </div>
                                </div>
                            ))}
                         </div>
                    </div>
                </div>

                <div className="mt-6 flex justify-end">
                    <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-600 text-gray-200 rounded-md hover:bg-gray-500">
                        Fechar
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ManageUsersModal;