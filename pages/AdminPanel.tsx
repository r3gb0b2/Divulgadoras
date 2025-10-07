import React, { useState, useEffect } from 'react';
import { getPromoters } from '../services/promoterService';
import { Promoter } from '../types';
import { InstagramIcon, TikTokIcon, MailIcon, PhoneIcon } from '../components/Icons';

const AdminPanel: React.FC = () => {
  const [promoters, setPromoters] = useState<Promoter[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadPromoters = async () => {
      setIsLoading(true);
      try {
        const fetchedPromoters = await getPromoters();
        setPromoters(fetchedPromoters);
      } catch (error) {
        console.error("Failed to load promoters:", error);
      } finally {
        setIsLoading(false);
      }
    };
    loadPromoters();
  }, []);

  if (isLoading) {
    return (
      <div className="text-center py-10">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">Painel Administrativo</h1>
        <div className="flex justify-center items-center space-x-3">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          <p className="text-gray-600 dark:text-gray-400 text-lg">Carregando perfis...</p>
        </div>
      </div>
    );
  }

  if (promoters.length === 0) {
    return (
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">Painel Administrativo</h1>
        <p className="text-gray-600 dark:text-gray-400">Nenhum perfil cadastrado ainda.</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-8">Perfis Cadastrados ({promoters.length})</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
        {promoters.map((promoter) => (
          <ProfileCard key={promoter.id} promoter={promoter} />
        ))}
      </div>
    </div>
  );
};

interface ProfileCardProps {
  promoter: Promoter;
}

const ProfileCard: React.FC<ProfileCardProps> = ({ promoter }) => {
    const formattedDate = new Date(promoter.submissionDate).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    });
  
    return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden transform hover:scale-105 transition-transform duration-300">
      <img className="w-full h-56 object-cover object-center" src={promoter.photo} alt={promoter.name} />
      <div className="p-6">
        <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">{promoter.name}</h2>
        <p className="text-gray-600 dark:text-gray-400">{promoter.age} anos</p>
        <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">Cadastro: {formattedDate}</p>
        <div className="mt-4 border-t border-gray-200 dark:border-gray-700 pt-4 space-y-3">
           <SocialLink href={`mailto:${promoter.email}`} Icon={MailIcon} text={promoter.email} />
           <SocialLink href={`https://wa.me/${promoter.whatsapp.replace(/\D/g, '')}`} Icon={PhoneIcon} text={promoter.whatsapp} />
           <SocialLink href={promoter.instagram} Icon={InstagramIcon} text="Instagram" />
           {promoter.tiktok && <SocialLink href={promoter.tiktok} Icon={TikTokIcon} text="TikTok" />}
        </div>
      </div>
    </div>
  );
};

interface SocialLinkProps {
    href: string;
    Icon: React.ElementType;
    text: string;
}

const SocialLink: React.FC<SocialLinkProps> = ({ href, Icon, text }) => (
    <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center text-sm text-gray-600 dark:text-gray-300 hover:text-primary dark:hover:text-pink-400 transition-colors"
    >
        <Icon className="w-5 h-5 mr-3 flex-shrink-0" />
        <span className="truncate">{text}</span>
    </a>
);


export default AdminPanel;
