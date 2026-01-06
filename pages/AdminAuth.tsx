
import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import AdminDashboard from './AdminDashboard';
import SuperAdminDashboard from './SuperAdminDashboard';
import { AdminPanel } from './AdminPanel';
import ManageUsersPage from './ManageUsersPage';
import OrganizationsListPage from './OrganizationsListPage';
import ManageOrganizationPage from './ManageOrganizationPage';
import AdminApplicationsListPage from './AdminApplicationsListPage';
import AdminPosts from './AdminPosts';
import CreatePost from './CreatePost';
import PostDetails from './PostDetails';
import AdminLists from './AdminLists';
import GuestListAssignments from './GuestListAssignments';
import GuestListPage from './GuestListPage';
import GuestListCheckinPage from './GuestListCheckinPage';
import GuestListAccessPage from './GuestListAccessPage';
import PostDashboard from './PostDashboard';
import AdminSchedulePage from './AdminSchedulePage';
import AdminOneTimePosts from './AdminOneTimePosts';
import CreateOneTimePost from './CreateOneTimePost';
import EditOneTimePost from './EditOneTimePost';
import OneTimePostDetails from './OneTimePostDetails';
import AdminFollowLoopPage from './AdminFollowLoopPage';
import GroupRemovalsPage from './GroupRemovalsPage';
import GuestListChangeRequestsPage from './GuestListChangeRequestsPage';
import PromoterDiagnosticsPage from './PromoterDiagnosticsPage';
import GeminiPage from './Gemini';
import AdminPushCampaignPage from './AdminPushCampaignPage';
import AdminPushQueuePage from './AdminPushQueuePage';
import AdminCleanupPage from './AdminCleanupPage';
import EmailTemplateEditor from './EmailTemplateEditor';
import EditPrivacyPolicyPage from './EditPrivacyPolicyPage';
import NewsletterPage from './NewsletterPage';
import SubscriptionPage from './SubscriptionPage';
import ChangePasswordPage from './ChangePasswordPage';
import QrCodeScannerPage from './QrCodeScannerPage';
import SettingsPage from './SettingsPage';
import AdminLoginPage from './AdminLoginPage';
import AdminAppleTestReview from './AdminAppleTestReview';
import AdminGlobalLists from './AdminGlobalLists';
import AdminClubVip from './AdminClubVip';
import AdminGreenlife from './AdminGreenlife';
import RecoveryDashboard from './RecoveryDashboard';
import VipPublicDashboard from './VipPublicDashboard';

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user, loading } = useAdminAuth();
    if (loading) return <div className="flex justify-center items-center h-screen"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div></div>;
    if (!user) return <Navigate to="/admin/login" replace />; 
    return <>{children}</>;
};

const AdminAuth: React.FC = () => {
    const { adminData, user } = useAdminAuth();

    return (
        <Routes>
            <Route path="login" element={user ? <Navigate to="/admin" replace /> : <AdminLoginPage />} />
            <Route path="vip-metrics/:token" element={<VipPublicDashboard />} />

            <Route index element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>} />
            
            {adminData?.role === 'superadmin' && (
                <>
                    <Route path="super" element={<ProtectedRoute><SuperAdminDashboard /></ProtectedRoute>} />
                    <Route path="organizations" element={<ProtectedRoute><OrganizationsListPage /></ProtectedRoute>} />
                    <Route path="applications" element={<ProtectedRoute><AdminApplicationsListPage /></ProtectedRoute>} />
                    <Route path="newsletter" element={<ProtectedRoute><NewsletterPage /></ProtectedRoute>} />
                    <Route path="email-templates" element={<ProtectedRoute><EmailTemplateEditor /></ProtectedRoute>} />
                    <Route path="edit-privacy" element={<ProtectedRoute><EditPrivacyPolicyPage /></ProtectedRoute>} />
                    <Route path="cleanup" element={<ProtectedRoute><AdminCleanupPage /></ProtectedRoute>} />
                    <Route path="push-queue" element={<ProtectedRoute><AdminPushQueuePage /></ProtectedRoute>} />
                    <Route path="global-lists" element={<ProtectedRoute><AdminGlobalLists /></ProtectedRoute>} />
                </>
            )}

            <Route path="promoters" element={<ProtectedRoute>{adminData ? <AdminPanel adminData={adminData} /> : <Navigate to="/admin/login" />}</ProtectedRoute>} />
            <Route path="settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
            <Route path="apple-test" element={<ProtectedRoute><AdminAppleTestReview /></ProtectedRoute>} />
            
            <Route path="posts" element={<ProtectedRoute><AdminPosts /></ProtectedRoute>} />
            <Route path="posts/new" element={<ProtectedRoute><CreatePost /></ProtectedRoute>} />
            <Route path="posts/:postId" element={<ProtectedRoute><PostDetails /></ProtectedRoute>} />
            
            <Route path="lists" element={<ProtectedRoute><AdminLists /></ProtectedRoute>} />
            <Route path="guestlist/:campaignId" element={<ProtectedRoute><GuestListPage /></ProtectedRoute>} /> 
            <Route path="guestlist-assignments/:listId" element={<ProtectedRoute><GuestListAssignments /></ProtectedRoute>} />
            <Route path="checkin-dashboard" element={<ProtectedRoute><GuestListCheckinPage /></ProtectedRoute>} />
            <Route path="checkin/scanner" element={<ProtectedRoute><QrCodeScannerPage /></ProtectedRoute>} />
            <Route path="checkin/:campaignId" element={<ProtectedRoute><GuestListCheckinPage /></ProtectedRoute>} />
            <Route path="guestlist-access/:campaignId" element={<ProtectedRoute><GuestListAccessPage /></ProtectedRoute>} />
            
            <Route path="dashboard" element={<ProtectedRoute><PostDashboard /></ProtectedRoute>} />
            <Route path="scheduled-posts" element={<ProtectedRoute><AdminSchedulePage /></ProtectedRoute>} />
            
            <Route path="one-time-posts" element={<ProtectedRoute><AdminOneTimePosts /></ProtectedRoute>} />
            <Route path="one-time-posts/new" element={<ProtectedRoute><CreateOneTimePost /></ProtectedRoute>} />
            <Route path="one-time-posts/edit/:postId" element={<ProtectedRoute><EditOneTimePost /></ProtectedRoute>} />
            <Route path="one-time-posts/:postId" element={<ProtectedRoute><OneTimePostDetails /></ProtectedRoute>} />
            
            <Route path="connect" element={<ProtectedRoute><AdminFollowLoopPage /></ProtectedRoute>} />
            <Route path="group-removals" element={<ProtectedRoute><GroupRemovalsPage /></ProtectedRoute>} />
            <Route path="guestlist-requests" element={<ProtectedRoute><GuestListChangeRequestsPage /></ProtectedRoute>} />
            <Route path="diagnostics" element={<ProtectedRoute><PromoterDiagnosticsPage /></ProtectedRoute>} />
            <Route path="gemini" element={<ProtectedRoute><GeminiPage /></ProtectedRoute>} />
            <Route path="push-campaign" element={<ProtectedRoute><AdminPushCampaignPage /></ProtectedRoute>} />
            <Route path="settings/change-password" element={<ProtectedRoute><ChangePasswordPage /></ProtectedRoute>} />
            <Route path="settings/subscription" element={<ProtectedRoute><SubscriptionPage /></ProtectedRoute>} />
            
            <Route path="club-vip" element={<ProtectedRoute><AdminClubVip /></ProtectedRoute>} />
            <Route path="greenlife" element={<ProtectedRoute><AdminGreenlife /></ProtectedRoute>} />
            <Route path="recovery" element={<ProtectedRoute><RecoveryDashboard /></ProtectedRoute>} />

            <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
    );
};

export default AdminAuth;
