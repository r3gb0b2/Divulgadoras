import React, { useState, useEffect, useCallback } from 'react';
import { getAdminUsers, addAdminUser, updateAdminUser, deleteAdminUser } from '../services/userService';
import { AdminUser, UserRole } from '../types';

interface ManageUsersModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const availableStates = [
  { abbr: 'CE', name: 'Ceará' },
  { abbr: 'SE', name: 'Aracaju' },
  { abbr: 'PA', name: 'Belém' },
  { abbr: 'PI', name: 'Teresina' },
  { abbr: 'ES', name: 'Vitória' },
  { abbr: 'PB', name: 'Paraíba' },
];

const formInputStyle = "mt-1 w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-200 focus:outline-none focus:ring-primary focus:border-primary";

const ManageUsersModal: React.FC<ManageUsersModalProps> = ({ isOpen, onClose }) => {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  
  const [isFormVisible, setIsFormVisible] = useState(false);
  const [isEditing, setIsEditing] = useState<AdminUser | null>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<UserRole>('stateadmin');
  const [selectedStates, setSelectedStates] = useState<string[]>([]);
  
  const fetchUsers = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const data = await getAdminUsers();
      setUsers(data);
    } catch (err) {
      setError('Falha ao carregar usuários.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchUsers();
    } else {
        resetForm();
    }
  }, [isOpen, fetchUsers]);

  if (!isOpen) return null;

  const resetForm = () => {
    setIsFormVisible(false);
    setIsEditing(null);
    setEmail('');
    setPassword('');
    setDisplayName('');
    setRole('stateadmin');
    setSelectedStates([]);
    setError('');
  };

  const handleStateToggle = (stateAbbr: string) => {
    setSelectedStates(prev => 
      prev.includes(stateAbbr) ? prev.filter(s => s !== stateAbbr) : [...prev, stateAbbr]
    );
  };
  
  const handleEditClick = (user: AdminUser) => {
      setIsEditing(user);
      setEmail(user.email);
      setDisplayName(user.displayName || '');
      setRole(user.role);
      setSelectedStates(user.states || []);
      setPassword(''); // Clear password for security
      setIsFormVisible(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (role === 'stateadmin' && selectedStates.length === 0) {
        setError('Selecione pelo menos um estado para o "Admin de Estado".');
        return;
    }
    
    setIsLoading(true);

    try {
      if (isEditing) {
        // Update user
        const updatedData: Partial<Omit<AdminUser, 'id'>> = {
            displayName,
            role,
            states: role === 'stateadmin' ? selectedStates : [],
        };
        await updateAdminUser(isEditing.id, updatedData);
      } else {
        // Create new user
        if(!password) {
            setError("A senha é obrigatória para criar um novo usuário.");
            setIsLoading(false);
            return;
        }
        const newUserData = {
            email,
            displayName,
            role,
            states: role === 'stateadmin' ? selectedStates : [],
        };
        await addAdminUser(newUserData, password);
      }
      await fetchUsers();
      resetForm();
    } catch (err: any) {
        setError(err.message || "Ocorreu um erro desconhecido.");
    } finally {
        setIsLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Tem certeza? Isso removerá o acesso do usuário.')) {
        setIsLoading(true);
        try {
            await deleteAdminUser(id);
            await fetchUsers();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-4xl max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Gerenciar Usuários</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-3xl">&times;</button>
        </div>
        
        {error && <p className="text-red-500 bg-red-100 dark:bg-red-900/50 p-3 rounded-md mb-4">{error}</p>}
        
        {!isFormVisible && (
            <button onClick={() => setIsFormVisible(true)} className="mb-4 px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-dark self-start">
                + Adicionar Usuário
            </button>
        )}

        {isFormVisible && (
          <form onSubmit={handleSubmit} className="p-4 border dark:border-gray-700 rounded-lg mb-4 space-y-4">
            <h3 className="text-xl font-semibold">{isEditing ? 'Editar Usuário' : 'Novo Usuário'}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required disabled={!!isEditing} className={formInputStyle + (isEditing ? ' bg-gray-200 dark:bg-gray-600' : '')} />
              <input type="password" placeholder={isEditing ? 'Nova Senha (deixe em branco para não alterar)' : 'Senha'} value={password} onChange={e => setPassword(e.target.value)} required={!isEditing} className={formInputStyle} />
              <input type="text" placeholder="Nome (Opcional)" value={displayName} onChange={e => setDisplayName(e.target.value)} className={formInputStyle} />
              <select value={role} onChange={e => setRole(e.target.value as UserRole)} className={formInputStyle}>
                <option value="stateadmin">Admin de Estado</option>
                <option value="superadmin">Super Admin</option>
              </select>
            </div>
            
            {role === 'stateadmin' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Estados Permitidos:</label>
                <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {availableStates.map(state => (
                    <label key={state.abbr} className="flex items-center space-x-2 p-2 rounded-md bg-gray-100 dark:bg-gray-700/50 cursor-pointer">
                      <input type="checkbox" checked={selectedStates.includes(state.abbr)} onChange={() => handleStateToggle(state.abbr)} className="h-4 w-4 text-primary rounded border-gray-300 focus:ring-primary" />
                      <span>{state.name} ({state.abbr})</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
            
            <div className="flex justify-end gap-3">
                <button type="button" onClick={resetForm} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 dark:bg-gray-600 dark:text-gray-200 dark:hover:bg-gray-500">Cancelar</button>
                <button type="submit" disabled={isLoading} className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-green-400">
                    {isLoading ? 'Salvando...' : (isEditing ? 'Salvar Alterações' : 'Criar Usuário')}
                </button>
            </div>
          </form>
        )}

        <div className="flex-grow overflow-y-auto">
          {isLoading && !users.length ? <p>Carregando...</p> : (
            <div className="divide-y dark:divide-gray-700">
              {users.map(user => (
                <div key={user.id} className="p-2 flex justify-between items-center">
                  <div>
                    <p className="font-semibold">{user.displayName || user.email}</p>
                    <p className="text-sm text-gray-500">{user.email}</p>
                    <p className="text-xs font-mono mt-1">
                      <span className={`px-2 py-1 rounded-full text-white ${user.role === 'superadmin' ? 'bg-indigo-500' : 'bg-blue-500'}`}>{user.role}</span>
                      {user.role === 'stateadmin' && <span className="ml-2 text-gray-600 dark:text-gray-400">{user.states.join(', ')}</span>}
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <button onClick={() => handleEditClick(user)} className="text-indigo-600 hover:text-indigo-800">Editar</button>
                    <button onClick={() => handleDelete(user.id)} className="text-red-600 hover:text-red-800">Excluir</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ManageUsersModal;
