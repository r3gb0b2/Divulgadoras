import React, { useState, useEffect } from 'react';
import { getPromoters } from '../services/promoterService';
import { Promoter } from '../types';
import { InstagramIcon, TikTokIcon, MailIcon, PhoneIcon, ChevronLeftIcon, ChevronRightIcon } from '../components/Icons';

const AdminPanel: React.FC = () => {
  const [promoters, setPromoters] = useState<Promoter[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadPromoters = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const fetchedPromoters = await getPromoters();
        setPromoters(fetchedPromoters);
      } catch (err: any) {
        console.error("Failed to load promoters:", err.message);
        setError("Não foi possível carregar os perfis. Verifique se as credenciais do Firebase estão corretas e se as regras de segurança permitem a leitura de dados.");
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

  if (error) {
    return (
      <div className="text-center py-10 bg-red-50 dark:bg-gray-800 rounded-lg p-6">
        <h1 className="text-3xl font-bold text-red-600 dark:text-red-400 mb-4">Ocorreu um Erro</h1>
        <p className="text-red-700 dark:text-red-300">{error}</p>
        <p className="text-sm text-gray-500 mt-4">Dica: Verifique o console do navegador (F12) para ver detalhes técnicos do erro.</p>
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
    const [currentImageIndex, setCurrentImageIndex] = useState(0);
    
    const formattedDate = new Date(promoter.submissionDate).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    });

    const nextImage = (e: React.MouseEvent) => {
        e.stopPropagation();
        setCurrentImageIndex((prevIndex) => (prevIndex + 1) % promoter.photos.length);
    };

    const prevImage = (e: React.MouseEvent) => {
        e.stopPropagation();
        setCurrentImageIndex((prevIndex) => (prevIndex - 1 + promoter.photos.length) % promoter.photos.length);
    };
  
    return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden transform hover:scale-105 transition-transform duration-300">
      <div className="relative">
        <img className="w-full h-56 object-cover object-center" src={promoter.photos[currentImageIndex]} alt={promoter.name} />
        {promoter.photos.length > 1 && (
            <>
                <button onClick={prevImage} className="absolute left-2 top-1/2 -translate-y-1/2 bg-black bg-opacity-50 text-white p-1 rounded-full hover:bg-opacity-75 transition focus:outline-none">
                    <ChevronLeftIcon className="h-6 w-6" />
                </button>
                <button onClick={nextImage} className="absolute right-2 top-1/2 -translate-y-1/2 bg-black bg-opacity-50 text-white p-1 rounded-full hover:bg-opacity-75 transition focus:outline-none">
                    <ChevronRightIcon className="h-6 w-6" />
                </button>
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black bg-opacity-50 text-white text-xs px-2 py-1 rounded-full">
                    {currentImageIndex + 1} / {promoter.photos.length}
                </div>
            </>
        )}
      </div>
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