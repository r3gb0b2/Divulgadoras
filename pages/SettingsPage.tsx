import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { UsersIcon, CreditCardIcon, MapPinIcon, ArrowLeftIcon, SparklesIcon, MegaphoneIcon, BuildingOfficeIcon, KeyIcon, ChartBarIcon, ClockIcon, ClipboardDocumentListIcon, TicketIcon, LogoutIcon } from '../components/Icons';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { getOrganization } from '../services/organizationService';
import { Organization } from '../types';

interface SettingItem {
  id: string;
  to: string;
  Icon: React.ElementType;
  title: string;
  description: string;
  condition: () => boolean;
}

const SettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const { adminData, selectedOrgId } = useAdminAuth();
  const [isOwner, setIsOwner] = useState(false);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [orderedItems, setOrderedItems] = useState<SettingItem[]>([]);
  
  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);

  const ALL_SETTINGS_ITEMS: SettingItem[] = [
    {
      id: 'org_data',
      to: `/admin/organization/${selectedOrgId}`,
      Icon: BuildingOfficeIcon,
      title: 'Dados da Organização',
      description: 'Edite o nome da sua organização, regiões, administradores associados e outras configurações gerais.',
      condition: () => isOwner,
    },
    {
      id: 'regions_events',
      to: '/admin/states',
      Icon: MapPinIcon,
      title: 'Regiões e Eventos',
      description: 'Visualize suas regiões ativas e crie ou edite eventos/gêneros para receber cadastros.',
      condition: () => true,
    },
    {
      id: 'manage_users',
      to: '/admin/users',
      Icon: UsersIcon,
      title: 'Gerenciar Usuários',
      description: 'Adicione, edite ou remova membros da sua equipe que podem acessar este painel.',
      condition: () => true,
    },
    {
      id: 'group_removals',
      to: '/admin/group-removals',
      Icon: LogoutIcon,
      title: 'Solicitações de Remoção',
      description: 'Visualize e gerencie os pedidos de divulgadoras para sair dos grupos de divulgação.',
      condition: () => true,
    },
    {
      id: 'guestlist_requests',
      to: '/admin/guestlist-requests',
      Icon: ClipboardDocumentListIcon,
      title: 'Solicitações de Alteração de Lista',
      description: 'Aprove ou rejeite pedidos de divulgadoras para editar listas de convidados já enviadas.',
      condition: () => organization?.guestListManagementEnabled !== false,
    },
    {
      id: 'manage_posts',
      to: '/admin/posts',
      Icon: MegaphoneIcon,
      title: 'Gerenciamento de Posts',
      description: 'Crie, edite e acompanhe o desempenho das publicações para suas divulgadoras.',
      condition: () => true,
    },
    {
      id: 'one_time_post',
      to: '/admin/one-time-posts',
      Icon: MegaphoneIcon,
      title: 'Post Único',
      description: 'Crie um post com link compartilhável para pessoas não cadastradas enviarem comprovação e entrarem na lista.',
      condition: () => organization?.oneTimePostEnabled !== false,
    },
    {
      id: 'manage_guestlists',
      to: '/admin/lists',
      Icon: ClipboardDocumentListIcon,
      title: 'Gerenciar Listas de Convidados',
      description: 'Crie listas (VIP, Aniversariante), atribua divulgadoras e gere links únicos de confirmação.',
      condition: () => organization?.guestListManagementEnabled !== false,
    },
    {
      id: 'checkin',
      to: '/admin/checkin-dashboard',
      Icon: TicketIcon,
      title: 'Controle de Entrada',
      description: 'Valide a entrada de divulgadoras e convidados no dia do evento através da tela de check-in.',
      condition: () => organization?.guestListCheckinEnabled !== false,
    },
    {
      id: 'performance',
      to: '/admin/dashboard',
      Icon: ChartBarIcon,
      title: 'Desempenho das Divulgadoras',
      description: 'Analise estatísticas de postagens, como aproveitamento, posts perdidos e justificativas por divulgadora.',
      condition: () => true,
    },
    {
      id: 'scheduled_posts',
      to: '/admin/scheduled-posts',
      Icon: ClockIcon,
      title: 'Publicações Agendadas',
      description: 'Crie posts com antecedência e agende o envio automático para a data e hora desejada.',
      condition: () => true,
    },
    {
      id: 'change_password',
      to: '/admin/settings/change-password',
      Icon: KeyIcon,
      title: 'Alterar Senha',
      description: 'Modifique sua senha de acesso ao painel de administrador.',
      condition: () => true,
    },
    {
      id: 'subscription',
      to: '/admin/settings/subscription',
      Icon: CreditCardIcon,
      title: 'Gerenciar Assinatura',
      description: 'Visualize seu plano atual, histórico de faturas e gerencie sua forma de pagamento.',
      condition: () => true,
    },
    {
      id: 'gemini_assistant',
      to: '/admin/gemini',
      Icon: SparklesIcon,
      title: 'Assistente Gemini',
      description: 'Use a inteligência artificial do Google para gerar textos criativos, ideias para redes sociais, regras de eventos e muito mais.',
      condition: () => true,
    },
  ];

  useEffect(() => {
    if (selectedOrgId) {
      getOrganization(selectedOrgId).then(orgData => {
        setOrganization(orgData);
        if (orgData && adminData?.uid === orgData.ownerUid) {
          setIsOwner(true);
        } else {
          setIsOwner(false);
        }
      }).catch(err => {
        console.error("Could not fetch organization data:", err);
        setIsOwner(false);
      });
    } else {
      setIsOwner(false);
      setOrganization(null);
    }
  }, [adminData, selectedOrgId]);
  
  useEffect(() => {
    if (!adminData?.uid) return;

    const storageKey = `settingsOrder_${adminData.uid}`;
    const savedOrder = localStorage.getItem(storageKey);
    
    let initialItems = [...ALL_SETTINGS_ITEMS];

    if (savedOrder) {
        try {
            const savedOrderIds: string[] = JSON.parse(savedOrder);
            const itemsMap = new Map(initialItems.map(item => [item.id, item]));
            const ordered = savedOrderIds.map(id => itemsMap.get(id)).filter(Boolean) as SettingItem[];
            const remaining = initialItems.filter(item => !savedOrderIds.includes(item.id));
            initialItems = [...ordered, ...remaining];
        } catch (e) {
            console.error("Failed to parse settings order from localStorage", e);
            localStorage.removeItem(storageKey); // Clear corrupted data
        }
    }
    
    setOrderedItems(initialItems);

  }, [isOwner, organization]); // Re-run when conditions might change

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, index: number) => {
    dragItem.current = index;
    e.currentTarget.style.opacity = '0.5';
  };

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>, index: number) => {
    dragOverItem.current = index;
  };

  const handleDrop = () => {
    if (dragItem.current === null || dragOverItem.current === null || dragItem.current === dragOverItem.current) {
      return;
    }

    const newItems = [...orderedItems];
    const [draggedItemContent] = newItems.splice(dragItem.current, 1);
    newItems.splice(dragOverItem.current, 0, draggedItemContent);
    
    setOrderedItems(newItems);

    if (adminData?.uid) {
        const storageKey = `settingsOrder_${adminData.uid}`;
        const orderedIds = newItems.map(item => item.id);
        localStorage.setItem(storageKey, JSON.stringify(orderedIds));
    }
  };

  const handleDragEnd = (e: React.DragEvent<HTMLDivElement>) => {
    e.currentTarget.style.opacity = '1';
    // Clean up refs after the whole operation is finished
    dragItem.current = null;
    dragOverItem.current = null;
  };


  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Configurações da Organização</h1>
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-500 text-sm">
          <ArrowLeftIcon className="w-4 h-4" />
          <span>Voltar ao Painel</span>
        </button>
      </div>
      <div className="bg-secondary shadow-lg rounded-lg p-6">
        <p className="text-gray-400 mb-6">
          Gerencie os usuários, regiões, eventos e sua assinatura na plataforma. Você pode arrastar os cards para organizá-los como preferir.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {orderedItems.filter(item => item.condition()).map((item, index) => (
             <div
                key={item.id}
                draggable
                onDragStart={(e) => handleDragStart(e, index)}
                onDragEnter={(e) => handleDragEnter(e, index)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                onDragEnd={handleDragEnd}
                className="group block p-6 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-all duration-300 cursor-grab active:cursor-grabbing"
              >
                <Link to={item.to} className="flex flex-col h-full pointer-events-none">
                  <div className="flex items-center">
                    <item.Icon className="w-8 h-8 text-primary" />
                    <h2 className="ml-4 text-xl font-semibold text-gray-100">{item.title}</h2>
                  </div>
                  <p className="mt-2 text-gray-400 flex-grow">
                    {item.description}
                  </p>
                  <div className="text-sm text-primary mt-4 opacity-0 group-hover:opacity-100 transition-opacity font-semibold">
                    Acessar &rarr;
                  </div>
                </Link>
              </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;