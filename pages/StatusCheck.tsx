
import React, { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { checkPromoterStatus, confirmPromoterGroupEntry } from '../services/promoterService';
import { getAllCampaigns } from '../services/settingsService';
import { Promoter, Campaign, Organization } from '../types';
import { WhatsAppIcon, ArrowLeftIcon, MegaphoneIcon, LogoutIcon } from '../components/Icons';
import { stateMap } from '../constants/states';
import { getOrganizations } from '../services/organizationService';

// Modal Component defined within the same file for simplicity
interface RulesModalProps {
  isOpen: boolean;
  onClose: () => void;
  rules: string;
  campaignName: string;
}

const RulesModal: React.FC<RulesModalProps> = ({ isOpen, onClose, rules, campaignName }) => {
  if (!isOpen) return null;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50 p-4" onClick={onClose}>
      <div className="bg-secondary rounded-lg shadow-xl p-6 w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold text-white">Regras - {campaignName}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-300 text-3xl">&times;</button>
        </div>
        <div className="flex-grow overflow-y-auto pr-2 space-y-4 text-gray-300">
           <div dangerouslySetInnerHTML={{ __html: rules.replace(/\n/g, '<br />') || 'Nenhuma regra cadastrada.' }} />
        </div>
        <div className="mt-6 flex justify-end border-t border-gray-700 pt-4">
          <button onClick={onClose} className="px-6 py-2 bg-primary text-white rounded-md hover:bg-primary-dark">Entendi</button>
        </div>
      </div>
    </div>
  );
};

const ApprovedPromoterSteps: React.FC<{ campaign: Campaign; promoter: Promoter; isPrimary: boolean }> = ({ campaign, promoter, isPrimary }) => {
    const [hasAcceptedRules, setHasAcceptedRules] = useState(promoter.hasJoinedGroup || false);
    const [cardError, setCardError] = useState<string | null>(null);
    const [isRulesModalOpen, setIsRulesModalOpen] = useState(false);

    const handleAcceptRules = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const isChecked = e.target.checked;
        setHasAcceptedRules(isChecked);
        if (isChecked && promoter && !promoter.hasJoinedGroup) {
            try {
                await confirmPromoterGroupEntry(promoter.id);
            } catch (updateError) {
                setCardError("Erro ao salvar confirmação.");
                setHasAcceptedRules(false);
            }
        }
    };

    return (
        <>
            <div className={`mt-4 ${isPrimary ? 'border-t' : 'border-t border-dashed'} border-gray-600/50 pt-4 space-y-4`}>
                <h3 className="font-bold text-lg text-white">{isPrimary ? 'Próximos Passos' : `Evento Adicional: ${campaign.name}`}</h3>
                {cardError && <p className="text-red-300 text-sm">{cardError}</p>}
                <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 w-8 h-8 bg-gray-700 rounded-full flex items-center justify-center font-bold text-white border border-gray-500">1</div>
                    <div className="flex-grow">
                        <p className="font-semibold text-gray-200">Leia as Regras</p>
                        <button onClick={() => setIsRulesModalOpen(true)} className="mt-2 w-full sm:w-auto bg-gray-700 text-white font-bold py-2 px-4 rounded text-sm border border-gray-600">Ver Regras</button>
                    </div>
                </div>
                <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-bold text-white bg-gray-700 border border-gray-500">2</div>
                    <div className="flex-grow">
                        <p className="font-semibold text-gray-200">Confirme a Leitura</p>
                        <label className="flex items-center cursor-pointer p-3 border border-gray-600/50 rounded-md bg-black/20 mt-2">
                            <input type="checkbox" checked={hasAcceptedRules} onChange={handleAcceptRules} className="h-5 w-5 text-primary rounded bg-gray-700 focus:ring-primary" />
                            <span className="ml-3 font-medium text-gray-200">Li e concordo com as regras.</span>
                        </label>
                    </div>
                </div>
                <div className="flex items-start gap-4">
                    <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-bold text-white ${hasAcceptedRules ? 'bg-green-600' : 'bg-gray-700 border border-gray-500'}`}>3</div>
                    <div className="flex-grow">
                        <p className="font-semibold text-gray-200">Entre no Grupo</p>
                        <a href={hasAcceptedRules ? campaign?.whatsappLink || '#' : undefined} target="_blank" rel="noopener noreferrer" 
                           className={`mt-2 inline-flex items-center justify-center w-full sm:w-auto bg-green-600 text-white font-bold py-3 px-4 rounded-lg ${(!hasAcceptedRules || !campaign?.whatsappLink) ? 'opacity-50 cursor-not-allowed' : 'hover:bg-green-700'}`}
                           onClick={(e) => (!hasAcceptedRules || !campaign?.whatsappLink) && e.preventDefault()}>
                            <WhatsAppIcon className="w-6 h-6 mr-2"/> Entrar no Grupo
                        </a>
                    </div>
                </div>
                <div className="mt-6 pt-6 border-t border-gray-700">
                    <Link to={`/posts?email=${encodeURIComponent(promoter.email)}`} className="flex items-center justify-center w-full bg-primary text-white font-bold py-4 px-4 rounded-lg hover:bg-primary-dark transition-colors text-lg shadow-lg">
                        <MegaphoneIcon className="w-6 h-6 mr-2" /> VER MINHAS POSTAGENS
                    </Link>
                </div>
            </div>
            <RulesModal isOpen={isRulesModalOpen} onClose={() => setIsRulesModalOpen(false)} rules={campaign.rules} campaignName={campaign.name} />
        </>
    );
};

const StatusCard: React.FC<{ promoter: Promoter, organizationName: string }> = ({ promoter, organizationName }) => {
    const [primaryCampaign, setPrimaryCampaign] = useState<Campaign | null>(null);
    const [associatedCampaignsDetails, setAssociatedCampaignsDetails] = useState<Campaign[]>([]);

    useEffect(() => {
        const fetchAllCampaignData = async () => {
            if (promoter && promoter.status === 'approved') {
                try {
                    const allCampaignsForOrg = await getAllCampaigns(promoter.organizationId);
                    if (promoter.campaignName) {
                        const foundPrimary = allCampaignsForOrg.find(c => c.name === promoter.campaignName);
                        setPrimaryCampaign(foundPrimary || null);
                    }
                    if (promoter.associatedCampaigns && promoter.associatedCampaigns.length > 0) {
                        const foundAssociated = promoter.associatedCampaigns
                            .map(assocName => allCampaignsForOrg.find(c => c.name === assocName))
                            .filter((c): c is Campaign => !!c);
                        setAssociatedCampaignsDetails(foundAssociated);
                    }
                } catch (e) { console.error(e); }
            }
        };
        fetchAllCampaignData();
    }, [promoter]);

    const statusInfoMap = {
        pending: { title: 'Cadastro em Análise', styles: 'bg-blue-900/50 border-blue-500 text-blue-300', message: 'Seu cadastro está sendo avaliado.' },
        approved: { title: 'Portal da Divulgadora', styles: 'bg-green-900/50 border-green-500 text-green-300', message: 'Parabéns, você foi aprovada!' },
        rejected: { title: 'Cadastro Não Selecionado', styles: 'bg-red-900/50 border-red-500 text-red-300', message: 'No momento seu perfil não foi selecionado.' },
        rejected_editable: { title: 'Correção Necessária', styles: 'bg-orange-900/50 border-orange-500 text-orange-300', message: 'Seu cadastro precisa de ajustes.' },
        removed: { title: 'Cadastro Removido', styles: 'bg-gray-800 border-gray-600 text-gray-400', message: 'Você foi removida da equipe.' }
    };

    const statusInfo = statusInfoMap[promoter.status] || statusInfoMap.pending;

    // FIX: Safe toUpperCase with fallback to prevent TypeError if state is missing
    const displayState = promoter.state ? (stateMap[promoter.state.toUpperCase()] || promoter.state) : 'N/A';

    return (
        <div className={`${statusInfo.styles} border-l-4 p-4 rounded-md shadow-md animate-fadeIn`}>
            <div className="flex justify-between items-start">
                <div>
                    <p className="font-bold text-xl">{statusInfo.title}</p>
                    <p className="text-sm font-semibold text-gray-300">{organizationName}</p>
                </div>
                <div className="text-xs font-semibold px-2 py-1 rounded-full bg-black/20">
                    {displayState}
                </div>
            </div>
            <p className="mt-2 text-sm whitespace-pre-wrap">{promoter.rejectionReason || statusInfo.message}</p>
            {promoter.status === 'approved' && (
                <>
                    {primaryCampaign && <ApprovedPromoterSteps campaign={primaryCampaign} promoter={promoter} isPrimary={true} />}
                    {associatedCampaignsDetails.map(c => <ApprovedPromoterSteps key={c.id} campaign={c} promoter={promoter} isPrimary={false} />)}
                </>
            )}
            {promoter.status === 'rejected_editable' && (
                 <Link to={`/${promoter.organizationId}/register/${promoter.state}/${promoter.campaignName}?edit_id=${promoter.id}`} className="mt-4 inline-block w-full text-center bg-primary text-white font-bold py-2 px-4 rounded hover:bg-primary-dark">Editar Cadastro</Link>
            )}
        </div>
    );
};

const StatusCheck: React.FC = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
    const [promoters, setPromoters] = useState<Promoter[] | null>(null);
    const [orgMap, setOrgMap] = useState<Record<string, string>>({});
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [searched, setSearched] = useState(false);
    
    const performSearch = useCallback(async (searchEmail: string) => {
        if (!searchEmail) return;
        setIsLoading(true); setError(null); setSearched(true);
        try {
            const result = await checkPromoterStatus(searchEmail);
            setPromoters(result);
            if (result && result.length > 0) {
                // SALVA O E-MAIL PARA ACESSO FUTURO
                localStorage.setItem('saved_promoter_email', searchEmail.toLowerCase().trim());
            }
        } catch (err: any) {
            setError(err.message || 'Ocorreu um erro.');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        getOrganizations().then(orgs => {
            const map = orgs.reduce((acc, org) => { acc[org.id] = org.name; return acc; }, {} as Record<string, string>);
            setOrgMap(map);
        });

        const queryParams = new URLSearchParams(location.search);
        const emailFromQuery = queryParams.get('email');
        const savedEmail = localStorage.getItem('saved_promoter_email');

        if (emailFromQuery) {
            setEmail(emailFromQuery);
            performSearch(emailFromQuery);
        } else if (savedEmail) {
            setEmail(savedEmail);
            performSearch(savedEmail);
        }
    }, [location.search, performSearch]);
    
    const handleLogout = () => {
        localStorage.removeItem('saved_promoter_email');
        setPromoters(null);
        setSearched(false);
        setEmail('');
    };

    return (
        <div className="max-w-2xl mx-auto">
            <div className="flex justify-between items-center mb-6">
                <button onClick={() => navigate('/')} className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary-dark transition-colors">
                    <ArrowLeftIcon className="w-5 h-5" /> <span>Início</span>
                </button>
                {searched && promoters && (
                    <button onClick={handleLogout} className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 font-bold uppercase tracking-wider">
                        <LogoutIcon className="w-4 h-4" /> Sair / Trocar E-mail
                    </button>
                )}
            </div>

            <div className="bg-secondary shadow-2xl rounded-3xl p-8 border border-gray-800">
                {!searched || isLoading ? (
                    <>
                        <h1 className="text-3xl font-black text-center text-white mb-2 uppercase tracking-tighter">Verificar Meu Status</h1>
                        <p className="text-center text-gray-400 mb-8">Digite o e-mail que você usou no cadastro.</p>
                        <form onSubmit={(e) => { e.preventDefault(); performSearch(email); }} className="space-y-6">
                            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="exemplo@email.com" className="w-full px-4 py-4 border border-gray-700 rounded-2xl bg-gray-800 text-white focus:ring-2 focus:ring-primary outline-none" required />
                            <button type="submit" disabled={isLoading} className="w-full py-4 bg-primary text-white font-black rounded-2xl hover:bg-primary-dark shadow-xl shadow-primary/20">
                                {isLoading ? 'CARREGANDO...' : 'VERIFICAR AGORA'}
                            </button>
                        </form>
                    </>
                ) : (
                    <div className="space-y-6">
                        <div className="text-center mb-6">
                            <h1 className="text-2xl font-black text-white uppercase">Meus Cadastros</h1>
                            <p className="text-sm text-gray-500 font-mono mt-1">{email}</p>
                        </div>
                        {promoters ? (
                            <div className="space-y-4">
                                {promoters.map(p => <StatusCard key={p.id} promoter={p} organizationName={orgMap[p.organizationId] || 'Organização'} />)}
                            </div>
                        ) : <p className="text-center text-gray-400 py-8">Nenhum cadastro encontrado.</p>}
                    </div>
                )}
            </div>
        </div>
    );
};

export default StatusCheck;
