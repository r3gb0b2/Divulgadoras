import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { AdminUserData, AdminRole, Campaign, AdminApplication } from '../types';
import { getAllAdmins, setAdminUserData, deleteAdminUser, getPendingAdminApplications, deleteAdminApplication } from '../services/adminService';
import { getAllCampaigns } from '../services/settingsService';
import { states, stateMap } from '../constants/states';
import { auth } from '../firebase/config';
import { createUserWithEmailAndPassword } from 'firebase/auth';


const ManageUsersPage: React.FC = () => {
    const [admins, setAdmins] = useState<AdminUserData[]>([]);
    const [pendingApps, setPendingApps] = useState<AdminApplication[]>([]);
    const [allCampaigns, setAllCampaigns] = useState<Campaign[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    
    // Form state for new/editing admin
    const [editingTarget, setEditingTarget] = useState<AdminUserData | AdminApplication | null>(null);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [role, setRole] = useState<AdminRole>('viewer');
    const [assignedStates, setAssignedStates] = useState<string[]>([]);
    const [assignedCampaigns, setAssignedCampaigns] = useState<{ [stateAbbr: string]: string[] }>({});
    
    const isApproving = editingTarget ? 'createdAt' in editingTarget : false;

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        setError('');
        try {
            const [adminData, campaignData, pendingData] = await Promise.all([
                getAllAdmins(), 
                getAllCampaigns(),
                getPendingAdminApplications()
            ]);
            setAdmins(adminData);
            setAllCampaigns(campaignData);
            setPendingApps(pendingData);
        } catch (err) {
            setError('Falha ao carregar dados.');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const campaignsByState = useMemo(() => {
        return allCampaigns.reduce((acc, campaign) => {
            if (!acc[campaign.stateAbbr]) {
                acc[campaign.stateAbbr] = [];
            }
            acc[campaign.stateAbbr].push(campaign);
            return acc;
        }, {} as { [stateAbbr: string]: Campaign[] });
    }, [allCampaigns]);

    const resetForm = () => {
        setEditingTarget(null);
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

            if (newCampaigns.length === 0) {
                const updated = { ...prev };
                delete updated[stateAbbr];
                return updated;
            }
            
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
                updated[stateAbbr] = []; 
            }
            return updated;
        });
    }

    const handleEditClick = (target: AdminUserData | AdminApplication) => {
        setEditingTarget(target);
        setEmail(target.email);
        setPassword(''); 
        
        if ('role' in target) { // is AdminUserData
            setRole(target.role);
            setAssignedStates(target.assignedStates || []);
            setAssignedCampaigns(target.assignedCampaigns || {});
        } else { // is AdminApplication
            setRole('viewer');
            setAssignedStates([]);
            setAssignedCampaigns({});
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (!email) return setError("O campo de e-mail é obrigatório.");
        // Password is now only required for the manual "Add User" flow.
        if (!editingTarget && !isApproving && !password) return setError("É obrigatório definir uma senha para adicionar um novo usuário manualmente.");

        setIsLoading(true);
        try {
            let targetUid: string | null = null;
            
            if (isApproving) {
                // Approving a new user: UID already exists from the application.
                targetUid = (editingTarget as AdminApplication).uid;
                alert(`Usuário ${email} aprovado com sucesso.`);
            } else if (editingTarget) {
                // Editing an existing user
                targetUid = (editingTarget as AdminUserData).uid;
            } else {
                // Manually adding a new user (Superadmin only)
                const { user } = await createUserWithEmailAndPassword(auth, email, password);
                targetUid = user.uid;
                alert(`Usuário ${email} criado manualmente com sucesso. Lembre-se de compartilhar a senha com ele.`);
            }

            if (!targetUid) throw new Error("Não foi possível encontrar o UID do usuário.");

            const dataToSave = { email, role, assignedStates, assignedCampaigns };
            await setAdminUserData(targetUid, dataToSave);
            
            // If we were approving, delete the application now
            if (isApproving) {
                await deleteAdminApplication(editingTarget!.id);
            }

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
        if (window.confirm(`Tem certeza que deseja remover as permissões de admin para ${adminToDelete.email}? Esta ação não remove o usuário da autenticação, apenas do painel.`)) {
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

    const handleDeny = async (appToDeny: AdminApplication) => {
        if (window.confirm(`Tem certeza que deseja negar o acesso para ${appToDeny.email}? A conta de autenticação criada será mantida, mas a solicitação será removida.`)) {
            setIsLoading(true);
            try {
                await deleteAdminApplication(appToDeny.id);
                await fetchData();
            } catch (err: any) {
                setError(err.message || 'Falha ao negar a solicitação.');
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
        <div>
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold">Gerenciar Usuários Admin</h1>
                <Link to="/admin" className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-500 text-sm">
                    &larr; Voltar ao Painel
                </Link>
            </div>
            
            <div className="bg-secondary shadow-lg rounded-lg p-6">
                <div className="flex flex-col md:flex-row gap-6">
                    {/* Form Section */}
                    <form onSubmit={handleSubmit} className="w-full md:w-1/3 border border-gray-700 p-4 rounded-lg flex flex-col space-y-4">
                        <h3 className="text-xl font-semibold">{isApproving ? 'Aprovar Solicitação' : (editingTarget ? 'Editar Usuário' : 'Adicionar Usuário')}</h3>
                        
                        <div>
                            <label className="block text-sm font-medium text-gray-300">Email</label>
                            <input type="email" value={email} onChange={e => setEmail(e.target.value)} disabled={!!editingTarget} className="mt-1 w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-gray-200 disabled:bg-gray-800 disabled:cursor-not-allowed"/>
                        </div>
                        
                        {/* Password field only shown for manual user creation */}
                        {!editingTarget && !isApproving && (
                            <div>
                                <label className="block text-sm font-medium text-gray-300">Definir Senha</label>
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
                                {isLoading ? 'Salvando...' : (editingTarget ? 'Salvar Alterações' : 'Adicionar Usuário')}
                            </button>
                            {editingTarget && <button type="button" onClick={resetForm} className="px-4 py-2 bg-gray-600 rounded-md">Cancelar</button>}
                        </div>
                    </form>

                    {/* Users List Section */}
                    <div className="w-full md:w-2/3 flex-grow overflow-y-auto border border-gray-700 p-4 rounded-lg space-y-6">
                         <div>
                            <h3 className="text-xl font-semibold mb-4">Solicitações Pendentes</h3>
                            {isLoading ? <p>Carregando...</p> : (
                                pendingApps.length === 0 
                                ? <p className="text-sm text-gray-400">Nenhuma solicitação pendente.</p>
                                : <div className="space-y-3">
                                    {pendingApps.map(app => (
                                        <div key={app.id} className="block md:flex md:items-center md:justify-between p-3 bg-gray-700/50 rounded-md">
                                            <p className="font-semibold break-words flex-1">{app.email}</p>
                                            <div className="flex justify-end items-center gap-4 mt-3 md:mt-0 md:ml-4 flex-shrink-0">
                                                <button onClick={() => handleEditClick(app)} className="text-green-400 hover:text-green-300 text-sm font-medium">Aprovar</button>
                                                <button onClick={() => handleDeny(app)} className="text-red-400 hover:text-red-300 text-sm font-medium">Negar</button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                         </div>

                         <div>
                             <h3 className="text-xl font-semibold mb-4">Usuários Existentes</h3>
                             {isLoading ? <p>Carregando...</p> : (
                                <div className="space-y-3">
                                    {admins.map(admin => (
                                        <div key={admin.uid} className="block md:flex md:items-center md:justify-between p-3 bg-gray-700/50 rounded-md">
                                            <div className="min-w-0 md:flex-1">
                                                <p className="font-semibold break-words">{admin.email}</p>
                                                <p className="text-sm text-gray-400 break-words">
                                                    <span className="font-bold">{roleNames[admin.role]}</span> - {getCampaignSummary(admin)}
                                                </p>
                                            </div>
                                            <div className="flex justify-end items-center gap-4 mt-3 md:mt-0 md:ml-4 flex-shrink-0">
                                                <button onClick={() => handleEditClick(admin)} className="text-indigo-400 hover:text-indigo-300 text-sm font-medium">Editar</button>
                                                <button onClick={() => handleDelete(admin)} className="text-red-400 hover:text-red-300 text-sm font-medium">Excluir</button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                             )}
                         </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ManageUsersPage;