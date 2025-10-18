import React from 'react';
import { auth } from '../firebase/config';
import { useAdminAuth } from '../contexts/AdminAuthContext';

const NoOrganizationAssigned: React.FC = () => {
    const { user } = useAdminAuth();

    return (
        <div className="flex items-center justify-center min-h-[60vh]">
            <div className="w-full max-w-md bg-secondary shadow-2xl rounded-lg p-8 text-center">
                <h2 className="text-2xl font-bold text-yellow-400 mb-4">Acesso Restrito</h2>
                <p className="text-gray-300 mb-6">
                    Sua conta de administrador ({user?.email}) não está vinculada a nenhuma organização.
                    Por favor, entre em contato com o administrador principal da plataforma para obter acesso.
                </p>
                <button
                    onClick={() => auth.signOut()}
                    className="w-full mt-4 py-3 px-4 bg-primary text-white rounded-md hover:bg-primary-dark font-medium"
                >
                    Sair
                </button>
            </div>
        </div>
    );
};

export default NoOrganizationAssigned;
