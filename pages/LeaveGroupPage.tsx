import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getPromoterById, requestGroupRemoval } from '../services/promoterService';
import { Promoter } from '../types';
import { ArrowLeftIcon } from '../components/Icons';

const LeaveGroupPage: React.FC = () => {
    const location = useLocation();
    const navigate = useNavigate();

    const [promoter, setPromoter] = useState<Promoter | null>(null);
    const [campaignName, setCampaignName] = useState('');
    const [promoterId, setPromoterId] = useState('');
    const [orgId, setOrgId] = useState('');
    
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    useEffect(() => {
        const queryParams = new URLSearchParams(location.search);
        const pId = queryParams.get('promoterId');
        const cName = queryParams.get('campaignName');
        const oId = queryParams.get('orgId');

        if (!pId || !cName || !oId) {
            setError("Link inválido ou informações ausentes.");
            setIsLoading(false);
            return;
        }

        setPromoterId(pId);
        setCampaignName(decodeURIComponent(cName));
        setOrgId(oId);

        const fetchPromoter = async () => {
            try {
                const promoterData = await getPromoterById(pId);
                if (!promoterData) {
                    throw new Error("Seu cadastro de divulgadora não foi encontrado.");
                }
                setPromoter(promoterData);
            } catch (err: any) {
                setError(err.message);
            } finally {
                setIsLoading(false);
            }
        };

        fetchPromoter();
    }, [location.search]);

    const handleSubmit = async () => {
        setIsSubmitting(true);
        setError(null);
        try {
            await requestGroupRemoval(promoterId, campaignName, orgId);
            setSuccess(true);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const renderContent = () => {
        if (isLoading) {
             return <div className="text-center py-10"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div></div>;
        }
        if (error) {
            return <p className="text-red-400 text-center py-4">{error}</p>;
        }
        if (success) {
            return (
                <div className="text-center">
                    <h2 className="text-2xl font-bold text-green-400 mb-4">Solicitação Enviada!</h2>
                    <p className="text-gray-300">Sua solicitação para ser removida do grupo do evento <strong>{campaignName}</strong> foi enviada ao organizador.</p>
                    <p className="text-gray-300 mt-2">Você pode fechar esta página.</p>
                </div>
            );
        }
        if (promoter) {
            return (
                <div className="text-center">
                    <p className="text-gray-300 mb-6">
                        Você está prestes a solicitar a remoção do grupo de divulgação do evento <strong>{campaignName}</strong>.
                    </p>
                    <p className="text-gray-400 text-sm mb-6">
                        Ao confirmar, o organizador será notificado. Se sua solicitação for aprovada, você será removida de todas as publicações ativas deste evento.
                    </p>
                    <button
                        onClick={handleSubmit}
                        disabled={isSubmitting}
                        className="w-full sm:w-auto px-6 py-3 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
                    >
                        {isSubmitting ? 'Enviando...' : 'Confirmar Solicitação de Remoção'}
                    </button>
                </div>
            );
        }
        return null;
    };

    return (
        <div className="max-w-2xl mx-auto">
            <button onClick={() => navigate(-1)} className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary-dark transition-colors mb-4">
                <ArrowLeftIcon className="w-5 h-5" />
                <span>Voltar</span>
            </button>
            <div className="bg-secondary shadow-2xl rounded-lg p-8">
                <h1 className="text-3xl font-bold text-center text-gray-100 mb-4">Solicitar Remoção de Grupo</h1>
                {renderContent()}
            </div>
        </div>
    );
};

export default LeaveGroupPage;
