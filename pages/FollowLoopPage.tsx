
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { findPromotersByEmail } from '../services/promoterService';
import { getOrganization } from '../services/organizationService';
import { getStatsForPromoter } from '../services/postService';
import { 
  joinFollowLoop, 
  getParticipantStatus, 
  getNextProfileToFollow, 
  registerFollow, 
  getPendingValidations, 
  validateFollow,
  getConfirmedFollowers,
  getPeopleIFollow,
  getRejectedFollowsReceived,
  getRejectedFollowsGiven,
  undoRejection,
  reportUnfollow
} from '../services/followLoopService';
import { Promoter, FollowLoopParticipant, FollowInteraction } from '../types';
import { ArrowLeftIcon, InstagramIcon, HeartIcon, RefreshIcon, CheckCircleIcon, XIcon, UsersIcon, ChartBarIcon, AlertTriangleIcon, UndoIcon, UserMinusIcon, ExternalLinkIcon } from '../components/Icons';

const FollowLoopPage: React.FC = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [promoter, setPromoter] = useState<Promoter | null>(null);
  const [participant, setParticipant] = useState<FollowLoopParticipant | null>(null);
  const [ineligibleData, setIneligibleData] = useState<{ current: number, required: number } | null>(null);
  
  const [activeTab, setActiveTab] = useState<'follow' | 'validate' | 'followers' | 'following' | 'alerts'>('follow');
  const [targetProfile, setTargetProfile] = useState<FollowLoopParticipant | null>(null);
  const [validations, setValidations] = useState<FollowInteraction[]>([]);
  const [followersList, setFollowersList] = useState<FollowInteraction[]>([]);
  const [followingList, setFollowingList] = useState<FollowInteraction[]>([]);
  const [alerts, setAlerts] = useState<FollowInteraction[]>([]);
  const [rejectedByMe, setRejectedByMe] = useState<FollowInteraction[]>([]);
  const [validationView, setValidationView] = useState<'pending' | 'rejected'>('pending');
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasClickedLink, setHasClickedLink] = useState(false);

  // --- Auth / Entry ---
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setIsLoading(true);
    setError(null);
    setIneligibleData(null);

    try {
      const profiles = await findPromotersByEmail(email);
      const approved = profiles.find(p => p.status === 'approved');
      
      if (!approved) {
        throw new Error('Nenhum cadastro aprovado encontrado para este e-mail.');
      }
      
      // --- Eligibility Check ---
      const org = await getOrganization(approved.organizationId);
      const requiredThreshold = org?.followLoopThreshold || 0;

      if (requiredThreshold > 0) {
          const { stats } = await getStatsForPromoter(approved.id);
          const successful = stats.completed + stats.acceptedJustifications;
          const currentRate = stats.assigned > 0 ? Math.round((successful / stats.assigned) * 100) : 100;
          
          if (currentRate < requiredThreshold) {
              setIneligibleData({ current: currentRate, required: requiredThreshold });
              setIsLoading(false);
              return;
          }
      }
      
      setPromoter(approved);
      setIsLoggedIn(true);
      
      const partStatus = await getParticipantStatus(approved.id);
      setParticipant(partStatus);
      
      // Sync state if missing in participant record
      if (partStatus && !partStatus.state && approved.state) {
          await joinFollowLoop(approved.id);
      }
      
      if (partStatus) {
        if (partStatus.isBanned) return;
        loadAllData(approved.id, approved.organizationId, approved.state);
      }

    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const loadAllData = async (pid: string, orgId: string, state: string) => {
      loadNextTarget(pid, orgId, state);
      loadValidations(pid);
      loadAlerts(pid);
  };

  const handleJoin = async () => {
    if (!promoter) return;
    setIsLoading(true);
    try {
      await joinFollowLoop(promoter.id);
      const status = await getParticipantStatus(promoter.id);
      setParticipant(status);
      loadAllData(promoter.id, promoter.organizationId, promoter.state);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // --- Core Logic ---

  const loadNextTarget = useCallback(async (pid: string, orgId: string, state: string) => {
    setTargetProfile(null);
    setHasClickedLink(false);
    setError(null); 
    try {
      const next = await getNextProfileToFollow(pid, orgId, state);
      setTargetProfile(next);
    } catch (err: any) {
      console.error(err);
      setError("Erro ao carregar perfis: " + (err.message || "Tente novamente."));
    }
  }, []);

  const loadValidations = useCallback(async (pid: string) => {
    try {
      const pendingList = await getPendingValidations(pid);
      setValidations(pendingList);
      // Also load rejected list for "undo" feature
      const rejectedList = await getRejectedFollowsGiven(pid);
      setRejectedByMe(rejectedList);
    } catch (err) {
      console.error(err);
    }
  }, []);

  const loadFollowers = useCallback(async (pid: string) => {
    try {
        const list = await getConfirmedFollowers(pid);
        setFollowersList(list);
    } catch (err) {
        console.error(err);
    }
  }, []);

  const loadFollowing = useCallback(async (pid: string) => {
    try {
        // We also need the followers list to check for mutual following
        if (followersList.length === 0) {
            await loadFollowers(pid);
        }
        const list = await getPeopleIFollow(pid);
        setFollowingList(list);
    } catch (err) {
        console.error(err);
    }
  }, [followersList, loadFollowers]);
  
  const loadAlerts = useCallback(async (pid: string) => {
      try {
          const list = await getRejectedFollowsReceived(pid);
          setAlerts(list);
      } catch (err) {
          console.error(err);
      }
  }, []);

  const handleInstagramClick = () => {
    setHasClickedLink(true);
    if (targetProfile) {
        const handle = targetProfile.instagram.replace('@', '').replace('/', '');
        window.open(`https://instagram.com/${handle}`, '_blank');
    }
  };
  
  const handleOpenAlertProfile = (instagram: string) => {
      if (!instagram) {
          alert("Instagram não encontrado para este perfil.");
          return;
      }
      const handle = instagram.replace('@', '').replace('/', '');
      window.open(`https://instagram.com/${handle}`, '_blank');
  }

  const handleConfirmFollow = async () => {
    if (!promoter || !targetProfile) return;
    setIsLoading(true);
    try {
      await registerFollow(promoter.id, targetProfile.id);
      await loadNextTarget(promoter.id, promoter.organizationId, promoter.state);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSkip = () => {
      if (promoter) {
        loadNextTarget(promoter.id, promoter.organizationId, promoter.state);
      }
  };

  const handleValidationAction = async (interactionId: string, isValid: boolean, followerId: string) => {
      if (!promoter) return;
      try {
          await validateFollow(interactionId, isValid, followerId);
          // Refresh lists
          loadValidations(promoter.id);
          if (isValid) loadFollowers(promoter.id);
      } catch (err: any) {
          alert(err.message);
      }
  };

  const handleUndoRejection = async (interactionId: string) => {
      if (!promoter) return;
      if (!window.confirm("Confirmar que ela seguiu agora? Isso removerá o ponto negativo dela.")) return;
      try {
          await undoRejection(interactionId);
          loadValidations(promoter.id); // Refresh lists
          alert("Rejeição revertida com sucesso!");
      } catch (err: any) {
          alert(err.message);
      }
  };
  
  const handleReportUnfollow = async (interactionId: string, offenderId: string) => {
      if (!promoter) return;
      if (!window.confirm("Tem certeza que deseja reportar que ela parou de seguir? Isso removerá a validação e adicionará um ponto negativo para ela.")) return;
      try {
          await reportUnfollow(interactionId, offenderId, promoter.id);
          loadFollowers(promoter.id); // Refresh list
          alert("Reportado com sucesso.");
      } catch (err: any) {
          alert(err.message);
      }
  };

  const isMutualFollow = (personId: string) => {
      return followersList.some(f => f.followerId === personId);
  };

  // --- Renders ---

  if (ineligibleData) {
      return (
        <div className="max-w-md mx-auto px-4 py-8">
            <button onClick={() => setIneligibleData(null)} className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary-dark transition-colors mb-4">
                <ArrowLeftIcon className="w-5 h-5" />
                <span>Tentar outro e-mail</span>
            </button>
            <div className="bg-secondary shadow-2xl rounded-lg p-8 text-center">
                <div className="w-16 h-16 bg-yellow-900/50 rounded-full flex items-center justify-center mx-auto mb-4 text-yellow-400">
                    <ChartBarIcon className="w-8 h-8" />
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">Desempenho Insuficiente</h2>
                <p className="text-gray-400 mb-6">
                    Para participar desta dinâmica, a organização exige que você tenha uma taxa de cumprimento de tarefas de no mínimo <strong className="text-white">{ineligibleData.required}%</strong>.
                </p>
                <div className="bg-gray-800 p-4 rounded-lg mb-6">
                    <p className="text-sm text-gray-400">Sua taxa atual</p>
                    <p className={`text-3xl font-bold ${ineligibleData.current < 30 ? 'text-red-500' : 'text-yellow-500'}`}>{ineligibleData.current}%</p>
                </div>
                <p className="text-sm text-gray-400">
                    Realize as postagens pendentes e melhore seu desempenho para desbloquear o acesso.
                </p>
            </div>
        </div>
      );
  }

  if (!isLoggedIn) {
    return (
      <div className="max-w-md mx-auto px-4 py-8">
         <button onClick={() => navigate('/')} className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary-dark transition-colors mb-4">
            <ArrowLeftIcon className="w-5 h-5" />
            <span>Voltar para Início</span>
        </button>
        <div className="bg-secondary shadow-2xl rounded-lg p-8 text-center">
          <h1 className="text-3xl font-bold text-white mb-2">Conexão Divulgadoras</h1>
          <p className="text-gray-400 mb-6">Ganhe seguidores reais da sua equipe! Entre com seu e-mail para participar.</p>
          <form onSubmit={handleLogin} className="space-y-4">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Seu e-mail de cadastro"
              className="w-full px-4 py-3 border border-gray-600 rounded-lg bg-gray-800 text-white focus:ring-2 focus:ring-primary outline-none"
              required
            />
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button type="submit" disabled={isLoading} className="w-full py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50">
              {isLoading ? 'Verificando...' : 'Acessar'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (!participant) {
    return (
      <div className="max-w-md mx-auto px-4 py-8 text-center">
         <div className="bg-secondary shadow-2xl rounded-lg p-8">
            <h2 className="text-2xl font-bold text-white mb-4">Olá, {promoter?.name}!</h2>
            <p className="text-gray-300 mb-6">
                Ao participar da dinâmica <strong>Conexão Divulgadoras</strong>, seu perfil ficará visível para outras meninas da equipe seguirem você.
                Em troca, você também deve seguir as colegas. Vamos crescer juntas?
            </p>
            <button onClick={handleJoin} disabled={isLoading} className="w-full py-4 bg-green-600 text-white font-bold rounded-lg text-lg shadow-lg hover:bg-green-700 transition-colors">
                {isLoading ? 'Entrando...' : 'Quero Participar! 🚀'}
            </button>
            {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
         </div>
      </div>
    );
  }

  if (participant.isBanned) {
      return (
        <div className="max-w-md mx-auto px-4 py-8 text-center">
            <div className="bg-red-900/50 border border-red-500 shadow-2xl rounded-lg p-8">
                <h2 className="text-2xl font-bold text-red-300 mb-4">Acesso Bloqueado</h2>
                <p className="text-gray-300">
                    Você foi removida desta dinâmica devido a um alto número de relatos negativos (não seguiu de volta) ou por não cumprir as regras da equipe.
                </p>
                <p className="text-gray-400 text-sm mt-4">Entre em contato com o suporte se achar que isso é um erro.</p>
            </div>
        </div>
      );
  }

  return (
    <div className="max-w-lg mx-auto px-4 pb-20 pt-4">
       <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-white">Conexão Divulgadoras</h2>
            <div className="flex gap-2 text-xs font-mono bg-gray-800 px-2 py-1 rounded">
                <span className="text-green-400">Seguindo: {participant.followingCount}</span>
            </div>
       </div>

       {/* Tabs */}
       <div className="flex mb-6 bg-gray-800 rounded-lg p-1 overflow-x-auto">
           <button 
             onClick={() => setActiveTab('follow')} 
             className={`flex-1 py-2 px-3 text-sm font-medium rounded-md whitespace-nowrap transition-all ${activeTab === 'follow' ? 'bg-gray-700 text-white shadow' : 'text-gray-400 hover:text-gray-200'}`}
           >
               Seguir
           </button>
           <button 
             onClick={() => { setActiveTab('validate'); if(promoter) loadValidations(promoter.id); }} 
             className={`flex-1 py-2 px-3 text-sm font-medium rounded-md whitespace-nowrap transition-all ${activeTab === 'validate' ? 'bg-gray-700 text-white shadow' : 'text-gray-400 hover:text-gray-200'}`}
           >
               Validar ({validations.length})
           </button>
           <button 
             onClick={() => { setActiveTab('followers'); if(promoter) loadFollowers(promoter.id); }} 
             className={`flex-1 py-2 px-3 text-sm font-medium rounded-md whitespace-nowrap transition-all ${activeTab === 'followers' ? 'bg-gray-700 text-white shadow' : 'text-gray-400 hover:text-gray-200'}`}
           >
               Seguidores
           </button>
           <button 
             onClick={() => { setActiveTab('following'); if(promoter) loadFollowing(promoter.id); }} 
             className={`flex-1 py-2 px-3 text-sm font-medium rounded-md whitespace-nowrap transition-all ${activeTab === 'following' ? 'bg-gray-700 text-white shadow' : 'text-gray-400 hover:text-gray-200'}`}
           >
               Seguindo
           </button>
           <button 
             onClick={() => { setActiveTab('alerts'); if(promoter) loadAlerts(promoter.id); }} 
             className={`flex-1 py-2 px-3 text-sm font-medium rounded-md whitespace-nowrap transition-all flex items-center justify-center gap-1 ${activeTab === 'alerts' ? 'bg-gray-700 text-white shadow' : 'text-gray-400 hover:text-gray-200'}`}
           >
               Alertas
               {alerts.length > 0 && <span className="bg-red-500 text-white text-[10px] px-1.5 rounded-full">{alerts.length}</span>}
           </button>
       </div>

       {activeTab === 'follow' && (
           <div className="flex flex-col items-center">
               {targetProfile ? (
                   <div className="w-full bg-secondary rounded-xl shadow-xl overflow-hidden border border-gray-700 relative">
                       <div className="h-24 bg-gradient-to-r from-purple-800 to-pink-800"></div>
                       <div className="px-6 pb-8 text-center -mt-12">
                           <img 
                             src={targetProfile.photoUrl || 'https://via.placeholder.com/150'} 
                             alt={targetProfile.promoterName} 
                             className="w-24 h-24 rounded-full border-4 border-secondary mx-auto object-cover bg-gray-900"
                           />
                           <h3 className="text-2xl font-bold text-white mt-3">{targetProfile.promoterName}</h3>
                           <p className="text-pink-400 font-medium text-lg mb-6">{targetProfile.instagram}</p>
                           <p className="text-gray-500 text-xs mb-4">{targetProfile.state}</p>
                           
                           <div className="space-y-3">
                               {!hasClickedLink ? (
                                   <button 
                                     onClick={handleInstagramClick}
                                     className="w-full py-3 bg-white text-pink-600 font-bold rounded-full hover:bg-gray-100 transition-colors flex items-center justify-center gap-2"
                                   >
                                       <InstagramIcon className="w-5 h-5" />
                                       Abrir Instagram e Seguir
                                   </button>
                               ) : (
                                   <button 
                                     onClick={handleConfirmFollow}
                                     disabled={isLoading}
                                     className="w-full py-3 bg-green-600 text-white font-bold rounded-full hover:bg-green-700 transition-colors flex items-center justify-center gap-2 animate-pulse"
                                   >
                                       <HeartIcon className="w-5 h-5" />
                                       {isLoading ? 'Salvando...' : 'Já Segui! Próxima'}
                                   </button>
                               )}
                               
                               <button onClick={handleSkip} className="text-gray-500 text-sm hover:text-gray-300 underline mt-2">
                                   Pular perfil
                               </button>
                           </div>
                       </div>
                   </div>
               ) : (
                   <div className="text-center py-10 text-gray-400">
                       {!error ? (
                           <>
                                <p className="text-lg mb-4">Oba! Você já viu todos os perfis disponíveis no momento.</p>
                                <button onClick={() => promoter && loadNextTarget(promoter.id, promoter.organizationId, promoter.state)} className="inline-flex items-center gap-2 px-4 py-2 bg-gray-700 rounded-full hover:bg-gray-600 text-white">
                                    <RefreshIcon className="w-4 h-4" /> Verificar Novamente
                                </button>
                           </>
                       ) : (
                           <div className="text-red-400">
                               <p className="mb-2">{error}</p>
                               <button onClick={() => promoter && loadNextTarget(promoter.id, promoter.organizationId, promoter.state)} className="inline-flex items-center gap-2 px-4 py-2 bg-red-900/30 rounded-full hover:bg-red-900/50 text-white border border-red-500">
                                    <RefreshIcon className="w-4 h-4" /> Tentar Novamente
                                </button>
                           </div>
                       )}
                   </div>
               )}
           </div>
       )}

       {activeTab === 'validate' && (
           <div className="space-y-4">
               <div className="flex space-x-1 bg-gray-800 p-1 rounded-lg mb-4 w-fit mx-auto">
                   <button 
                       onClick={() => setValidationView('pending')} 
                       className={`px-4 py-1.5 text-xs font-medium rounded-md ${validationView === 'pending' ? 'bg-primary text-white' : 'text-gray-400'}`}
                   >
                       Pendentes
                   </button>
                   <button 
                       onClick={() => setValidationView('rejected')} 
                       className={`px-4 py-1.5 text-xs font-medium rounded-md ${validationView === 'rejected' ? 'bg-primary text-white' : 'text-gray-400'}`}
                   >
                       Recusados
                   </button>
               </div>

               {validationView === 'pending' ? (
                   <>
                       {validations.length === 0 ? (
                           <p className="text-center text-gray-400 py-8">Nenhuma validação pendente.</p>
                       ) : (
                           validations.map(val => (
                               <div key={val.id} className="bg-gray-800 p-4 rounded-lg border border-gray-700 shadow-sm">
                                   <div className="flex justify-between items-start mb-3">
                                       <div>
                                           <p className="font-bold text-white text-lg">{val.followerName}</p>
                                           <p className="text-sm text-gray-400">@{val.followerInstagram.replace('@', '')}</p>
                                       </div>
                                       <a
                                           href={`https://instagram.com/${val.followerInstagram.replace('@', '')}`}
                                           target="_blank"
                                           rel="noopener noreferrer"
                                           className="px-3 py-1.5 bg-gradient-to-r from-purple-900 to-pink-900 text-white text-xs font-bold rounded-full border border-pink-700/50 hover:opacity-90 flex items-center gap-1 transition-all"
                                       >
                                           <InstagramIcon className="w-3 h-3" />
                                           Ver / Seguir
                                       </a>
                                   </div>
                                   <p className="text-xs text-gray-500 mb-4 flex items-center gap-1">
                                       <span className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></span>
                                       Aguardando sua confirmação
                                   </p>
                                   <div className="flex gap-3">
                                       <button 
                                         onClick={() => handleValidationAction(val.id, false, val.followerId)}
                                         className="flex-1 py-2.5 bg-red-900/20 text-red-400 border border-red-900/50 rounded-lg hover:bg-red-900/40 flex items-center justify-center gap-2 text-sm font-semibold transition-colors"
                                       >
                                           <XIcon className="w-4 h-4" />
                                           Não Seguiu
                                       </button>
                                       <button 
                                         onClick={() => handleValidationAction(val.id, true, val.followerId)}
                                         className="flex-1 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center justify-center gap-2 text-sm font-semibold transition-colors shadow-md"
                                       >
                                           <CheckCircleIcon className="w-4 h-4" />
                                           Confirmar
                                       </button>
                                   </div>
                               </div>
                           ))
                       )}
                       <p className="text-xs text-gray-500 text-center mt-4 bg-blue-900/20 p-2 rounded">
                           <strong>Atenção:</strong> Ao marcar "Não Seguiu", você gera uma notificação negativa para a outra divulgadora.
                       </p>
                   </>
               ) : (
                   // Rejected View (Undo)
                   <>
                       {rejectedByMe.length === 0 ? (
                           <p className="text-center text-gray-400 py-8">Você não rejeitou ninguém recentemente.</p>
                       ) : (
                           rejectedByMe.map(val => (
                               <div key={val.id} className="bg-gray-800 p-3 rounded-lg border border-red-900/30 flex items-center justify-between">
                                   <div>
                                       <p className="font-bold text-gray-300 line-through">{val.followerName}</p>
                                       <p className="text-xs text-red-400">Marcado como "Não Seguiu"</p>
                                   </div>
                                   <button
                                       onClick={() => handleUndoRejection(val.id)}
                                       className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-xs rounded flex items-center gap-1"
                                   >
                                       <UndoIcon className="w-3 h-3" />
                                       Reverter
                                   </button>
                               </div>
                           ))
                       )}
                   </>
               )}
           </div>
       )}

       {activeTab === 'alerts' && (
           <div className="space-y-4">
               {alerts.length === 0 ? (
                   <div className="text-center py-10">
                       <CheckCircleIcon className="w-12 h-12 text-green-500 mx-auto mb-3 opacity-50" />
                       <p className="text-gray-300 font-semibold">Tudo certo!</p>
                       <p className="text-gray-500 text-sm">Nenhuma pendência ou alerta no momento.</p>
                   </div>
               ) : (
                   <>
                       <p className="text-sm text-red-300 bg-red-900/20 p-3 rounded border border-red-900/50 mb-4">
                           Estas divulgadoras informaram que você <strong>não seguiu</strong> de volta. Por favor, verifique e siga para regularizar.
                       </p>
                       {alerts.map(alert => (
                           <div key={alert.id} className="bg-gray-800 p-4 rounded-lg border-l-4 border-red-500 flex justify-between items-center">
                               <div>
                                   <p className="font-bold text-white">{alert.followedName}</p>
                                   <p className="text-xs text-gray-400">Informou que você não seguiu.</p>
                               </div>
                               <button 
                                   onClick={() => handleOpenAlertProfile(alert.followedInstagram || '')} 
                                   className="px-3 py-2 bg-white text-black font-bold rounded text-xs flex items-center gap-1 hover:bg-gray-200"
                               >
                                   <InstagramIcon className="w-3 h-3" />
                                   Corrigir Agora
                               </button>
                           </div>
                       ))}
                   </>
               )}
           </div>
       )}

       {activeTab === 'followers' && (
           <div className="space-y-4">
               {followersList.length === 0 ? (
                   <p className="text-center text-gray-400 py-8">Você ainda não tem seguidores confirmados nesta dinâmica.</p>
               ) : (
                   <>
                     <p className="text-center text-gray-400 text-sm mb-2">{followersList.length} seguidora(s) confirmada(s).</p>
                     {followersList.map(f => (
                        <div key={f.id} className="bg-gray-800 p-3 rounded-lg flex items-center gap-4 border border-gray-700">
                            <div className="w-10 h-10 bg-purple-900 rounded-full flex items-center justify-center flex-shrink-0 text-white">
                                <UsersIcon className="w-5 h-5" />
                            </div>
                            <div className="flex-grow overflow-hidden">
                                <p className="font-bold text-white truncate">{f.followerName}</p>
                                <a 
                                    href={`https://instagram.com/${f.followerInstagram.replace('@', '')}`} 
                                    target="_blank" 
                                    rel="noopener noreferrer" 
                                    className="text-sm text-pink-400 hover:underline truncate block"
                                >
                                    {f.followerInstagram}
                                </a>
                            </div>
                            <div className="flex-shrink-0 flex flex-col items-end gap-2">
                                <div className="text-green-400 flex items-center gap-1" title="Confirmado">
                                    <CheckCircleIcon className="w-4 h-4" />
                                    <span className="text-xs font-medium">Confirmada</span>
                                </div>
                                <button 
                                    onClick={() => handleReportUnfollow(f.id, f.followerId)}
                                    className="text-xs px-2 py-1 bg-gray-700 hover:bg-red-900/40 text-gray-300 hover:text-red-300 border border-gray-600 hover:border-red-500 rounded transition-colors"
                                >
                                    Parou de seguir
                                </button>
                            </div>
                        </div>
                     ))}
                   </>
               )}
           </div>
       )}

       {activeTab === 'following' && (
           <div className="space-y-4">
               {followingList.length === 0 ? (
                   <p className="text-center text-gray-400 py-8">Você ainda não seguiu ninguém nesta dinâmica.</p>
               ) : (
                   <>
                     <p className="text-center text-gray-400 text-sm mb-2">Você está seguindo {followingList.length} pessoa(s).</p>
                     {followingList.map(f => {
                        const isMutual = isMutualFollow(f.followedId);
                        return (
                            <div key={f.id} className="bg-gray-800 p-3 rounded-lg flex items-center gap-4 border border-gray-700">
                                <div className="w-10 h-10 bg-indigo-900 rounded-full flex items-center justify-center flex-shrink-0 text-white">
                                    <UsersIcon className="w-5 h-5" />
                                </div>
                                <div className="flex-grow overflow-hidden">
                                    <p className="font-bold text-white truncate">{f.followedName}</p>
                                    <a 
                                        href={`https://instagram.com/${f.followedInstagram?.replace('@', '')}`} 
                                        target="_blank" 
                                        rel="noopener noreferrer" 
                                        className="text-sm text-pink-400 hover:underline truncate block"
                                    >
                                        {f.followedInstagram}
                                    </a>
                                </div>
                                <div className="flex-shrink-0 flex flex-col items-end gap-1">
                                    <a 
                                        href={`https://instagram.com/${f.followedInstagram?.replace('@', '')}`} 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className="p-2 bg-gray-700 hover:bg-gray-600 text-white rounded-full"
                                        title="Abrir Instagram"
                                    >
                                        <ExternalLinkIcon className="w-4 h-4" />
                                    </a>
                                    {isMutual ? (
                                        <span className="text-[10px] font-bold text-green-400 bg-green-900/30 px-2 py-0.5 rounded-full border border-green-900">
                                            Segue você
                                        </span>
                                    ) : (
                                        <span className="text-[10px] font-bold text-yellow-400 bg-yellow-900/30 px-2 py-0.5 rounded-full border border-yellow-900">
                                            Não te segue
                                        </span>
                                    )}
                                </div>
                            </div>
                        );
                     })}
                   </>
               )}
           </div>
       )}
    </div>
  );
};

export default FollowLoopPage;
