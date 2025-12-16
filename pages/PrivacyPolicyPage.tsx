
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getPrivacyPolicy } from '../services/settingsService';
import { ArrowLeftIcon } from '../components/Icons';

const PrivacyPolicyPage: React.FC = () => {
    const navigate = useNavigate();
    const [content, setContent] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchPolicy = async () => {
            setIsLoading(true);
            try {
                const text = await getPrivacyPolicy();
                setContent(text || '<p>Ainda não há uma política de privacidade definida.</p>');
            } catch (err: any) {
                setError("Erro ao carregar a política de privacidade.");
            } finally {
                setIsLoading(false);
            }
        };
        fetchPolicy();
    }, []);

    return (
        <div className="max-w-4xl mx-auto p-6">
            <button onClick={() => navigate('/')} className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary-dark transition-colors mb-6">
                <ArrowLeftIcon className="w-5 h-5" />
                <span>Voltar ao Início</span>
            </button>
            
            <div className="bg-secondary shadow-2xl rounded-lg p-8">
                <h1 className="text-3xl font-bold text-white mb-6 border-b border-gray-700 pb-4">Política de Privacidade</h1>
                
                {isLoading ? (
                    <div className="flex justify-center items-center py-10">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
                    </div>
                ) : error ? (
                    <p className="text-red-400 text-center">{error}</p>
                ) : (
                    <div 
                        className="prose prose-invert max-w-none text-gray-300"
                        dangerouslySetInnerHTML={{ __html: content }}
                    />
                )}
            </div>
            
            <div className="mt-8 text-center text-sm text-gray-500">
                <p>&copy; {new Date().getFullYear()} Equipe Certa. Todos os direitos reservados.</p>
            </div>
        </div>
    );
};

export default PrivacyPolicyPage;
