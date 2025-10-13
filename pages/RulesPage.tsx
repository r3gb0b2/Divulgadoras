import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { getCampaigns } from '../services/settingsService';
import { Campaign } from '../types';

const RulesPage: React.FC = () => {
  // FIX: Added organizationId to useParams to be able to fetch campaigns.
  const { organizationId, state, campaignName } = useParams<{ organizationId: string; state: string; campaignName: string }>();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // FIX: Added organizationId check.
    if (organizationId && state && campaignName) {
      const fetchCampaign = async () => {
        setIsLoading(true);
        setError(null);
        try {
          // FIX: Passed organizationId to getCampaigns to fix missing argument error.
          const campaigns = await getCampaigns(state, organizationId);
          const decodedCampaignName = decodeURIComponent(campaignName);
          const foundCampaign = campaigns.find(c => c.name === decodedCampaignName);
          if (foundCampaign) {
            setCampaign(foundCampaign);
          } else {
            setError(`Regras para o evento "${decodedCampaignName}" não encontradas.`);
          }
        } catch (err: any) {
          setError(err.message || 'Ocorreu um erro ao carregar as regras.');
        } finally {
          setIsLoading(false);
        }
      };
      fetchCampaign();
    } else {
      setError("Nenhuma localidade ou evento especificado.");
      setIsLoading(false);
    }
    // FIX: Added organizationId to dependency array.
  }, [organizationId, state, campaignName]);

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex justify-center items-center h-48">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      );
    }

    if (error) {
      return <p className="text-red-400 text-center">{error}</p>;
    }

    if (campaign) {
      return (
        <div 
          className="prose prose-invert prose-p:text-gray-300 prose-li:text-gray-300 prose-headings:text-primary prose-strong:text-primary max-w-none space-y-6"
          dangerouslySetInnerHTML={{ __html: campaign.rules.replace(/\n/g, '<br />') || '<p>Nenhuma regra específica cadastrada para este evento.</p>' }}
        />
      );
    }
    
    return null;
  }


  return (
    <div className="max-w-3xl mx-auto">
      <div className="bg-secondary shadow-2xl rounded-lg p-8">
        <h1 className="text-3xl font-bold text-center text-gray-100 mb-2">Regras - {campaign ? campaign.name : state?.toUpperCase()}</h1>
        <p className="text-center text-gray-400 mb-8">Leia com atenção para garantir uma boa parceria.</p>
        {renderContent()}
      </div>
    </div>
  );
};

export default RulesPage;
