import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { getOrganizations } from '../services/organizationService';
import { getAllCampaigns } from '../services/settingsService';
import { Organization, Campaign } from '../types';
import { functions } from '../firebase/config';
import { httpsCallable } from 'firebase/functions';
import { ArrowLeftIcon } from '../components/Icons';

const NewsletterPage: React.FC = () => {
    const navigate = useNavigate();
    const [organizations, setOrganizations] = useState<Organization[]>([]);
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [isLoadingData, setIsLoadingData] = useState(true);

    const [audience, setAudience] = useState<'all' | 'org' | 'campaign'>('all');
    const [selectedOrgId, setSelectedOrgId] = useState('');
    const [selectedCampaignId, setSelectedCampaignId] = useState('');
    const [subject, setSubject] = useState('');
    const [body, setBody] = useState('');

    const [isSending, setIsSending] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    useEffect(() => {
        const fetchData = async () => {
            setIsLoadingData(true);
            try {
                const [orgs, camps] = await Promise.all([
                    getOrganizations(),
                    getAllCampaigns(),
                ]);
                setOrganizations(orgs.sort((a, b) => a.name.localeCompare(b.name)));
                setCampaigns(camps.sort((a, b) => a.name.localeCompare(b.name)));
            } catch (err: any) {
                setError(err.message || 'Falha ao carregar dados.');
            } finally {
                setIsLoadingData(false);
            }
        };
        fetchData();
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!subject.trim() || !body.trim()) {
            setError("Assunto e corpo da mensagem são obrigatórios.");
            return;
        }

        let audienceData: { type: string; orgId?: string; campaignId?: string } = { type: audience };
        if (audience === 'org' && selectedOrgId) {
            audienceData.orgId = selectedOrgId;
        } else if (audience === 'org') {
            setError("Selecione uma organização.");
            return;
        }
        
        if (audience === 'campaign' && selectedCampaignId) {
            audienceData.campaignId = selectedCampaignId;
        } else if (audience === 'campaign') {
            setError("Selecione um evento.");
            return;
        }

        if (!window.confirm("Você tem certeza que deseja enviar esta newsletter para o público selecionado?")) {
            return;
        }

        setIsSending(true);
        setError('');
        setSuccess('');

        try {
            const sendNewsletter = httpsCallable(functions, 'sendNewsletter');
            const result = await sendNewsletter({
                audience: audienceData,
                subject,
                body,
            });
            const data = result.data as { success: boolean, message: string };
            if (data.success) {
                setSuccess(data.message);
                setSubject('');
                setBody('');
            } else {
                throw new Error(data.message);
            }
        } catch (err: any) {
            const message = err.details?.message || err.message || "Ocorreu um erro desconhecido.";
            setError(`Falha ao enviar: ${message}`);
        } finally {
            setIsSending(false);
        }
    };

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold">Enviar Newsletter</h1>
                <button onClick={() => navigate(-1)} className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-500 text-sm">
                    <ArrowLeftIcon className="w-4 h-4" />
                    <span>Voltar</span>
                </button>
            </div>
            <form onSubmit={handleSubmit} className="bg-secondary shadow-lg rounded-lg p-6 space-y-6">
                 {error && <div className="bg-red-900/50 text-red-300 p-3 rounded-md text-sm font-semibold">{error}</div>}
                 {success && <div className="bg-green-900/50 text-green-300 p-3 rounded-md text-sm font-semibold">{success}</div>}
                
                <fieldset className="p-4 border border-gray-700 rounded-lg">
                    <legend className="px-2 font-semibold text-primary">1. Selecione o Público</legend>
                    {isLoadingData ? <p>Carregando opções...</p> : (
                        <div className="space-y-4">
                            <label className="flex items-center space-x-2"><input type="radio" name="audience" value="all" checked={audience === 'all'} onChange={() => setAudience('all')} /><span>Todas as Divulgadoras Aprovadas</span></label>
                            
                            <div className="flex flex-col sm:flex-row items-center gap-4">
                                <label className="flex-shrink-0 flex items-center space-x-2"><input type="radio" name="audience" value="org" checked={audience === 'org'} onChange={() => setAudience('org')} /><span>Divulgadoras de uma Organização:</span></label>
                                <select value={selectedOrgId} onChange={e => setSelectedOrgId(e.target.value)} disabled={audience !== 'org'} className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 disabled:opacity-50">
                                    <option value="">Selecione...</option>
                                    {organizations.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                                </select>
                            </div>
                            
                            <div className="flex flex-col sm:flex-row items-center gap-4">
                                <label className="flex-shrink-0 flex items-center space-x-2"><input type="radio" name="audience" value="campaign" checked={audience === 'campaign'} onChange={() => setAudience('campaign')} /><span>Divulgadoras de um Evento:</span></label>
                                <select value={selectedCampaignId} onChange={e => setSelectedCampaignId(e.target.value)} disabled={audience !== 'campaign'} className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 disabled:opacity-50">
                                    <option value="">Selecione...</option>
                                    {campaigns.map(c => <option key={c.id} value={c.id}>{c.name} ({c.stateAbbr})</option>)}
                                </select>
                            </div>
                        </div>
                    )}
                </fieldset>

                <fieldset className="p-4 border border-gray-700 rounded-lg space-y-4">
                    <legend className="px-2 font-semibold text-primary">2. Crie a Mensagem</legend>
                    <div>
                        <label htmlFor="subject" className="block text-sm font-medium text-gray-300">Assunto do E-mail</label>
                        <input type="text" id="subject" value={subject} onChange={e => setSubject(e.target.value)} required className="mt-1 w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700" />
                    </div>
                     <div>
                        <label htmlFor="body" className="block text-sm font-medium text-gray-300">Corpo da Mensagem</label>
                        <p className="text-xs text-gray-400 mb-2">Você pode usar a variável {'{{'}promoterName{'}}'} para personalizar a mensagem com o nome da divulgadora.</p>
                        <textarea id="body" value={body} onChange={e => setBody(e.target.value)} required rows={12} className="mt-1 w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700"></textarea>
                    </div>
                </fieldset>

                <div className="flex justify-end">
                    <button type="submit" disabled={isSending || isLoadingData} className="px-6 py-3 bg-primary text-white font-semibold rounded-md hover:bg-primary-dark disabled:opacity-50">
                        {isSending ? 'Enviando...' : 'Enviar Newsletter'}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default NewsletterPage;
