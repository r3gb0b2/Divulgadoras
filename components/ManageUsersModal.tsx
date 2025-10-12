import React, { useState, useEffect, useCallback } from 'react';
import { AdminUserData, AdminRole } from '../types';
import { getAllAdmins, setAdminUserData, deleteAdminUser } from '../services/adminService';
import { states } from '../constants/states';
import { auth } from '../firebase/config';
import { createUserWithEmailAndPassword } from 'firebase/auth';


const ManageUsersModal: React.FC<{ isOpen: boolean; onClose: () => void; }> = ({ isOpen, onClose }) => {
    const [admins, setAdmins] = useState<AdminUserData[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    
    // Form state for new/editing admin
    const [isEditing, setIsEditing] = useState<AdminUserData | null>(null);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [role, setRole] = useState<AdminRole>('viewer');
    const [assignedStates, setAssignedStates] = useState<string[]>([]);
    
    const fetchAdmins = useCallback(async () => {
        setIsLoading(true);
        setError('');
        try {
            const data = await getAllAdmins();
            setAdmins(data);
        } catch (err) {
            setError('Falha ao carregar lista de administradores.');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (isOpen) {
            fetchAdmins();
            resetForm();
        }
    }, [isOpen, fetchAdmins]);

    if (!isOpen) return null;

    const resetForm = () => {
        setIsEditing(null);
        setEmail('');
        setPassword('');
        setRole('viewer');
        setAssignedStates([]);
    };

    const handleStateToggle = (stateAbbr: string) => {
        setAssignedStates(prev => 
            prev.includes(stateAbbr)
                ? prev.filter(s => s !== stateAbbr)
                : [...prev, stateAbbr]
        );
    };

    const handleSelectAllStates = () => {
        setAssignedStates(states.map(s => s.abbr));
    };

    const handleEditClick = (admin: AdminUserData) => {
        setIsEditing(admin);
        setEmail(admin.email);
        setRole(admin.role);
        setAssignedStates(admin.assignedStates);
        setPassword(''); // Clear password field for editing
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email) {
            setError("O campo de e-mail é obrigatório.");
            return;
        }
        
        // In "add mode", password is required
        if (!isEditing && !password) {
            setError("O campo de senha é obrigatório para novos usuários.");
            return;
        }

        setIsLoading(true);
        setError('');

        try {
            let targetUid = isEditing ? admins.find(a => a.email === email)?.uid : null;

            // If adding a new user, create them in Auth first
            if (!isEditing) {
                // This is a temporary auth instance to not log out the superadmin
                const { user } = await createUserWithEmailAndPassword(auth, email, password);
                targetUid = user.uid;
                alert(`Usuário ${email} criado com sucesso. Lembre-se de compartilhar a senha com ele.`);
            }

            if (!targetUid) {
                throw new Error("Não foi possível encontrar o UID do usuário. Verifique se o e-mail existe na autenticação do Firebase.");
            }

            // FIX: Correctly structure the data object for saving, excluding the 'uid' property.
            // This resolves the error on line 102 by aligning with the updated `setAdminUserData` signature.
            const dataToSave = { email, role, assignedStates };
            await setAdminUserData(targetUid, dataToSave);

            resetForm();
            await fetchAdmins();
        } catch (err: any) {
            console.error(err);
             if (err.code === 'auth/email-already-in-use') {
                setError("Este e-mail já está em uso por outro usuário.");
            } else if (err.code === 'auth/weak-password') {
                setError("A senha deve ter pelo menos 6 caracteres.");
            } else {
                setError(err.message || 'Ocorreu um erro ao salvar o administrador.');
            }
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleDelete = async (adminToDelete: AdminUserData) => {
        if (window.confirm(`Tem certeza que deseja remover as permissões de admin para ${adminToDelete.email}? Esta ação não pode ser desfeita.`)) {
            setIsLoading(true);
            try {
                // FIX: This now works because `adminToDelete` has a `uid` property, resolving the error on line 125.
                await deleteAdminUser(adminToDelete.uid);
                await fetchAdmins();
            } catch (err: any) {
                setError(err.message || 'Falha ao remover administrador.');
            } finally {
                setIsLoading(false);
            }
        }
    };

    const roleNames: { [key in AdminRole]: string } = {
        superadmin: 'Super Admin',
        admin: 'Admin',
        viewer: 'Visualizador'
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50 p-4">
            <div className="bg-secondary rounded-lg shadow-xl p-6 w-full max-w-4xl max-h-[90vh] flex flex-col">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-2xl font-bold text-white">Gerenciar Usuários Admin</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-300 text-3xl">&times;</button>
                </div>

                <div className="flex flex-col md:flex-row gap-6">
                    {/* Form Section */}
                    <div className="w-full md:w-1/3 border border-gray-700 p-4 rounded-lg">
                        <h3 className="text-xl font-semibold mb-4">{isEditing ? 'Editar Usuário' : 'Adicionar Novo Usuário'}</h3>
                        <form onSubmit={handleSubmit} className="space-y-4">
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
                            <div>
                                <label className="block text-sm font-medium text-gray-300">Estados Atribuídos</label>
                                <div className="mt-2 p-2 border border-gray-600 rounded-md max-h-32 overflow-y-auto space-y-1">
                                    {states.map(s => (
                                        <label key={s.abbr} className="flex items-center space-x-2 cursor-pointer">
                                            <input type="checkbox" checked={assignedStates.includes(s.abbr)} onChange={() => handleStateToggle(s.abbr)} className="h-4 w-4 text-primary bg-gray-700 border-gray-500 rounded"/>
                                            <span>{s.name} ({s.abbr})</span>
                                        </label>
                                    ))}
                                </div>
                                <button type="button" onClick={handleSelectAllStates} className="text-xs text-primary hover:underline mt-1">Selecionar todos</button>
                            </div>
                            {error && <p className="text-red-400 text-sm">{error}</p>}
                            <div className="flex gap-2">
                                <button type="submit" disabled={isLoading} className="flex-1 px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-dark disabled:opacity-50">
                                    {isLoading ? 'Salvando...' : (isEditing ? 'Salvar Alterações' : 'Adicionar Usuário')}
                                </button>
                                {isEditing && <button type="button" onClick={resetForm} className="px-4 py-2 bg-gray-600 rounded-md">Cancelar Edição</button>}
                            </div>
                        </form>
                    </div>

                    {/* Users List Section */}
                    <div className="w-full md:w-2/3 flex-grow overflow-y-auto border border-gray-700 p-4 rounded-lg">
                         <h3 className="text-xl font-semibold mb-4">Usuários Existentes</h3>
                         {isLoading && <p>Carregando...</p>}
                         <div className="space-y-2">
                            {admins.map(admin => (
                                <div key={admin.email} className="flex items-center justify-between p-3 bg-gray-700/50 rounded-md">
                                    <div>
                                        <p className="font-semibold">{admin.email}</p>
                                        <p className="text-sm text-gray-400">
                                            <span className="font-bold">{roleNames[admin.role]}</span> - {admin.assignedStates.length > 0 ? admin.assignedStates.join(', ') : 'Nenhum estado'}
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