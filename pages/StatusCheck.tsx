import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { checkPromoterStatus, updatePromoter } from '../services/promoterService';
import { getAllCampaigns } from '../services/settingsService';
import { Promoter, Campaign, Organization } from '../types';
import { WhatsAppIcon, ArrowLeftIcon } from '../components/Icons';
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
  if (!isOpen) {
    return null;
  }

  // Handle ESC key to close modal
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50 p-4"
      onClick={onClose}
      aria-modal="true"
      role="dialog"
    >
      <div
        className="bg-secondary rounded-lg shadow-xl p-6 w-full max-w-2xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside the modal
      >
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold text-white">Regras - {campaignName}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-300 text-3xl">&times;</button>
        </div>

        <div className="flex-grow overflow-y-auto pr-2 space-y-4">
           <div
             className="prose prose-invert prose-p:text-gray-300 prose-li:text-gray-300 prose-headings:text-primary prose-strong:text-primary max-w-none"
             dangerouslySetInnerHTML={{ __html: rules.replace(/\n/g, '<br />') || '<p>Nenhuma regra específica cadastrada para este evento.</p>' }}
           />
        </div>

        <div className="mt-6 flex justify-end border-t border-gray-700 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2 bg-primary text-white rounded-md hover:bg-primary-dark"
          >
            Entendi
          </button>
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
                await updatePromoter(promoter.id, { hasJoinedGroup: true });
            } catch (updateError) {
                console.error("Failed to update status:", updateError);
                setCardError("Não foi possível salvar sua confirmação. Tente novamente.");
                setHasAcceptedRules(false); // Revert on failure
            }
        }
    };

    return (
        <>
            <div className={`mt-4 ${isPrimary ? 'border-t' : 'border-t border-dashed'} border-gray-600/50 pt-4 space-y-4`}>
                {isPrimary ? (
                    <h3 className="font-bold text-lg text-white">Próximos Passos</h3>
                ) : (
                    <h3 className="font-semibold text-md text-gray-200">Evento Adicional: <span className="text-primary">{campaign.name}</span></h3>
                )}

                {cardError && <p className="text-red-300 text-sm mt-2">{cardError}</p>}

                {/* Step 1 */}
                <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 w-8 h-8 bg-primary rounded-full flex items-center justify-center font-bold text-white">1</div>
                    <div className="flex-grow">
                        <p className="font-semibold text-gray-200">Leia as Regras</p>
                        <p className="text-xs text-gray-400 mb-2">Clique no botão para ver todas as regras e informações sobre o evento.</p>
                        <button
                            onClick={() => setIsRulesModalOpen(true)}
                            className="inline-block w-full sm:w-auto text-center bg-primary text-white font-bold py-2 px-4 rounded hover:bg-primary-dark transition-colors text-sm"
                        >
                            Ver Regras de {campaign.name}
                        </button>
                    </div>
                </div>

                {/* Step 2 */}
                <div className="flex items-start gap-4">
                    <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-bold text-white bg-primary`}>2</div>
                    <div className="flex-grow">
                        <p className="font-semibold text-gray-200">Confirme a Leitura</p>
                        <div className="p-3 border border-gray-600/50 rounded-md bg-black/20 mt-2">
                            <label className="flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={hasAcceptedRules}
                                    onChange={handleAcceptRules}
                                    className="h-5 w-5 text-primary rounded border-gray-500 bg-gray-700 focus:ring-primary"
                                />
                                <span className="ml-3 font-medium text-gray-200">Li e concordo com todas as regras.</span>
                            </label>
                        </div>
                    </div>
                </div>

                {/* Step 3 */}
                <div className="flex items-start gap-4">
                    <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-bold text-white ${hasAcceptedRules ? 'bg-primary' : 'bg-gray-600'}`}>3</div>
                    <div className="flex-grow">
                        <p className="font-semibold text-gray-200">Entre no Grupo</p>
                        <p className="text-xs text-gray-400 mb-2">Após confirmar a leitura das regras, o botão para entrar no grupo será liberado.</p>
                        <a
                            href={hasAcceptedRules ? campaign?.whatsappLink || '#' : undefined}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`inline-flex items-center justify-center w-full sm:w-auto bg-green-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-green-700 transition-colors text-base ${(!hasAcceptedRules || !campaign?.whatsappLink) ? 'opacity-50 cursor-not-allowed' : ''}`}
                            aria-disabled={!hasAcceptedRules || !campaign?.whatsappLink}
                            onClick={(e) => (!hasAcceptedRules || !campaign?.whatsappLink) && e.preventDefault()}
                        >
                            <WhatsAppIcon className="w-6 h-6 mr-2"/>
                            Entrar no Grupo de {campaign.name}
                        </a>
                        {!campaign?.whatsappLink && hasAcceptedRules && <p className="text-xs text-yellow-400 mt-2">O link para o grupo ainda não foi disponibilizado pelo organizador.</p>}
                    </div>
                </div>
            </div>

            <RulesModal
                isOpen={isRulesModalOpen}
                onClose={() => setIsRulesModalOpen(false)}
                rules={campaign.rules}
                campaignName={campaign.name}
            />
        </>
    );
};


// This component displays the status for a single registration
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
                    } else {
                        setPrimaryCampaign(null);
                    }

                    if (promoter.associatedCampaigns && promoter.associatedCampaigns.length > 0) {
                        const foundAssociated = promoter.associatedCampaigns
                            .map(assocName => allCampaignsForOrg.find(c => c.name === assocName))
                            .filter((c): c is Campaign => !!c); // Filter out any not found
                        setAssociatedCampaignsDetails(foundAssociated);
                    } else {
                        setAssociatedCampaignsDetails([]);
                    }
                } catch (e) {
                    console.error("Failed to fetch campaign data", e);
                }
            }
        };
        fetchAllCampaignData();
    }, [promoter]);

    const statusInfoMap = {
        pending: {
            title: 'Cadastro em Análise',
            message: 'Seu cadastro está sendo avaliado por nossa equipe. Assim que houver uma decisão, você receberá um e-mail. Você também pode continuar consultando esta página.',
            styles: 'bg-blue-900/50 border-blue-500 text-blue-300'
        },
        approved: {
            title: 'Portal da Divulgadora',
            message: 'Parabéns, seu cadastro foi aprovado! Siga os próximos passos abaixo para concluir sua entrada na equipe.',
            styles: 'bg-green-900/50 border-green-500 text-green-300'
        },
        rejected: {
            title: 'Cadastro Não Aprovado',
            message: 'Agradecemos o seu interesse, mas no momento seu perfil não foi selecionado. Boa sorte na próxima!',
            styles: 'bg-red-900/50 border-red-500 text-red-300'
        }
    };

    const statusInfo = statusInfoMap[promoter.status];

    if (!statusInfo) {
         return <div className="bg-red-900/50 border-l-4 border-red-500 text-red-300 p-4 rounded-md"><p>Ocorreu um erro ao verificar o status deste cadastro.</p></div>;
    }

    const finalMessage = promoter.status === 'rejected' && promoter.rejectionReason
        ? promoter.rejectionReason
        : statusInfo.message;

    return (
        <div className={`${statusInfo.styles} border-l-4 p-4 rounded-md`} role="alert">
            <div className="flex justify-between items-start">
                <div>
                    <p className="font-bold text-xl">{statusInfo.title}</p>
                    <p className="text-sm font-semibold text-gray-300">{organizationName}</p>
                    {promoter.campaignName && <p className="text-xs text-primary">{promoter.campaignName} (Principal)</p>}
                </div>
                <div className="text-xs font-semibold px-2 py-1 rounded-full bg-black/20">
                    {promoter.state ? stateMap[promoter.state.toUpperCase()] || promoter.state : 'N/A'}
                </div>
            </div>

            <p className="mt-2 text-sm whitespace-pre-wrap">{finalMessage}</p>
            
            {promoter.status === 'approved' && (
                <>
                    {primaryCampaign && <ApprovedPromoterSteps campaign={primaryCampaign} promoter={promoter} isPrimary={true} />}
                    {associatedCampaignsDetails.map(assocCampaign => (
                        <ApprovedPromoterSteps key={assocCampaign.id} campaign={assocCampaign} promoter={promoter} isPrimary={false} />
                    ))}
                </>
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
    
    const performSearch = async (searchEmail: string) => {
        if (!searchEmail) return;
        setIsLoading(true);
        setError(null);
        setPromoters(null);
        setSearched(true);
        try {
            const result = await checkPromoterStatus(searchEmail);
            setPromoters(result);
        } catch (err: any) {
            setError(err.message || 'Ocorreu um erro.');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        const queryParams = new URLSearchParams(location.search);
        const emailFromQuery = queryParams.get('email');
        if (emailFromQuery) {
            setEmail(emailFromQuery);
            performSearch(emailFromQuery);
        }
    }, [location.search]);

    useEffect(() => {
        // Fetch all organizations to map IDs to names
        const fetchOrgs = async () => {
            try {
                const orgs = await getOrganizations();
                const map = orgs.reduce((acc, org) => {
                    acc[org.id] = org.name;
                    return acc;
                }, {} as Record<string, string>);
                setOrgMap(map);
            } catch (e) {
                console.error("Failed to fetch organizations for mapping", e);
                setError("Não foi possível carregar dados das organizações.");
            }
        };
        fetchOrgs();
    }, []);
    
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        performSearch(email);
    };
    
    const renderStatusResult = () => {
        if (!searched) return null;
        if (isLoading) {
            return (
                <div className="flex justify-center items-center h-24">
                  <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
                </div>
            );
        }
        if (error) return <p className="text-red-500 mt-4 text-center">{error}</p>;
        if (!promoters) {
            return <p className="text-center text-gray-400 mt-4">Nenhum cadastro encontrado para este e-mail.</p>;
        }

        return (
            <div className="space-y-4">
                {promoters.map(p => <StatusCard key={p.id} promoter={p} organizationName={orgMap[p.organizationId] || 'Organização Desconhecida'} />)}
            </div>
        );
    };

    return (
        <div className="max-w-2xl mx-auto">
            <button onClick={() => navigate(-1)} className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary-dark transition-colors mb-4">
                <ArrowLeftIcon className="w-5 h-5" />
                <span>Voltar</span>
            </button>
            <div className="bg-secondary shadow-2xl rounded-lg p-8">
                <h1 className="text-3xl font-bold text-center text-gray-100 mb-2">Verificar Status do Cadastro</h1>
                <p className="text-center text-gray-400 mb-8">Digite o e-mail que você usou no cadastro para ver o status em todas as organizações.</p>
                
                <form onSubmit={handleSubmit} className="space-y-6">
                    <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Seu e-mail de cadastro"
                        className="w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm placeholder-gray-500 focus:outline-none focus:ring-primary focus:border-primary sm:text-sm bg-gray-700 text-gray-200"
                        required
                    />
                     <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:bg-primary/50 disabled:cursor-not-allowed transition-all duration-300"
                    >
                        {isLoading ? 'Verificando...' : 'Verificar'}
                    </button>
                </form>
                
                <div className="mt-8">
                    {renderStatusResult()}
                </div>
            </div>
        </div>
    );
};

export default StatusCheck;