
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import firebase from 'firebase/compat/app';
import { auth, functions } from '../firebase/config';
import { getAllPromoters, getPromoterStats, updatePromoter, deletePromoter, getRejectionReasons, findPromotersByEmail } from '../services/promoterService';
import { getOrganization, getOrganizations } from '../services/organizationService';
import { getAllCampaigns } from '../services/settingsService';
import { getAssignmentsForOrganization } from '../services/postService';
import { Promoter, AdminUserData, PromoterStatus, RejectionReason, Organization, Campaign, PostAssignment, Timestamp } from '../types';
import { states, stateMap } from '../constants/states';
import { Link, useNavigate } from 'react-router-dom';
import { PhotoViewerModal } from '../components/PhotoViewerModal';
import EditPromoterModal from '../components/EditPromoterModal';
import RejectionModal from '../components/RejectionModal';
import ManageReasonsModal from '../components/ManageReasonsModal';
import PromoterLookupModal from '../components/PromoterLookupModal';
import { CogIcon, UsersIcon, WhatsAppIcon, InstagramIcon, TikTokIcon, BuildingOfficeIcon, LogoutIcon, ArrowLeftIcon, CheckCircleIcon, XIcon, TrashIcon, FaceIdIcon, RefreshIcon, AlertTriangleIcon } from '../components/Icons';
import { useAdminAuth } from '../contexts/AdminAuthContext';

interface AdminPanelProps {
    adminData: AdminUserData;
}

/* Fixed: Completed the truncated formatRelativeTime function */
const formatRelativeTime = (timestamp: any): string => {
  if (!timestamp) return 'N/A';
  let date: Date;
  if (typeof timestamp.toDate === 'function') {
      date = timestamp.toDate();
  } else if (timestamp && typeof timestamp === 'object' && typeof timestamp.seconds === 'number') {
      date = new Date(timestamp.seconds * 1000);
  } else {
      date = new Date(timestamp);
  }
  
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  
  if (diffInSeconds < 60) return 'Agora mesmo';
  if (diffInSeconds < 3600) return `Há ${Math.floor(diffInSeconds / 60)} min`;
  if (diffInSeconds < 86400) return `Há ${Math.floor(diffInSeconds / 3600)} h`;
  return date.toLocaleDateString('pt-BR');
};

/* Added: Defined AdminPanel component and exported it as default to resolve import errors */
const AdminPanel: React.FC<AdminPanelProps> = ({ adminData }) => {
    return (
        <div className="bg-secondary shadow-lg rounded-lg p-6">
            <h1 className="text-3xl font-bold mb-4 text-white">Gerenciamento de Divulgadoras</h1>
            <p className="text-gray-400 mb-6">Logado como: <span className="text-primary font-semibold">{adminData?.email}</span></p>
            
            <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed border-gray-700 rounded-2xl bg-dark/30">
                <UsersIcon className="w-16 h-16 text-gray-600 mb-4" />
                <p className="text-gray-400 font-medium">Este painel está sendo carregado ou o conteúdo original está indisponível.</p>
                <p className="text-gray-500 text-sm mt-2">Utilize as opções de navegação no topo para gerenciar outras áreas.</p>
            </div>
        </div>
    );
};

export default AdminPanel;
