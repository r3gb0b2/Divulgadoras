import React, { createContext, useState, useEffect, useContext, ReactNode } from 'react';
// FIX: Switched from modular to compat auth to resolve export errors.
import firebase from 'firebase/compat/app';
import { auth } from '../firebase/config';
import { getAdminUserData, setAdminUserData } from '../services/adminService';
import { getOrganizations } from '../services/organizationService';
import { AdminUserData, Organization } from '../types';

interface AdminAuthContextType {
    // FIX: Use compat User type.
    user: firebase.User | null;
    adminData: AdminUserData | null;
    loading: boolean;
    organizationsForAdmin: Organization[];
    selectedOrgId: string | null;
    setSelectedOrgId: (orgId: string) => void;
}

const AdminAuthContext = createContext<AdminAuthContextType | undefined>(undefined);

export const AdminAuthProvider: React.FC<{children: ReactNode}> = ({ children }) => {
    // FIX: Use compat User type.
    const [user, setUser] = useState<firebase.User | null>(null);
    const [adminData, setAdminData] = useState<AdminUserData | null>(null);
    const [loading, setLoading] = useState(true);
    const [organizationsForAdmin, setOrganizationsForAdmin] = useState<Organization[]>([]);
    const [selectedOrgId, setSelectedOrgIdState] = useState<string | null>(() => {
        return sessionStorage.getItem('selectedOrgId');
    });

    const setSelectedOrgId = (orgId: string) => {
        sessionStorage.setItem('selectedOrgId', orgId);
        setSelectedOrgIdState(orgId);
    };


    useEffect(() => {
        // FIX: Use compat onAuthStateChanged method.
        const unsubscribe = auth.onAuthStateChanged(async (firebaseUser) => {
            setLoading(true);
            setOrganizationsForAdmin([]);
            setSelectedOrgIdState(sessionStorage.getItem('selectedOrgId')); 

            if (firebaseUser) {
                setUser(firebaseUser);
                sessionStorage.setItem('isAdminAuthenticated', 'true');
                try {
                    // Use UID for secure data retrieval
                    let data = await getAdminUserData(firebaseUser.uid);

                    // If no admin data is found, check if it's the default superadmin email.
                    // If so, create their admin record on the fly for the first login.
                    // This superadmin has no organizationId and can see everything.
                    if (!data && firebaseUser.email === 'r3gb0b@gmail.com') {
                        const superAdminPayload: Omit<AdminUserData, 'uid'> = {
                            email: firebaseUser.email,
                            role: 'superadmin',
                            assignedStates: [], // Superadmin has access to all states implicitly
                        };
                        await setAdminUserData(firebaseUser.uid, superAdminPayload);
                        // Set the data for the current session after creating it
                        data = { uid: firebaseUser.uid, ...superAdminPayload };
                    }

                    setAdminData(data);
                     if (data?.organizationIds && data.organizationIds.length > 0) {
                        try {
                            const allOrgs = await getOrganizations();
                            const adminOrgs = allOrgs.filter(org => data.organizationIds.includes(org.id)).sort((a,b) => a.name.localeCompare(b.name));
                            setOrganizationsForAdmin(adminOrgs);

                            const currentSelected = sessionStorage.getItem('selectedOrgId');
                            // If there's no selection, or the selection is invalid, default to the first org
                            if (!currentSelected || !data.organizationIds.includes(currentSelected)) {
                                const defaultOrgId = data.organizationIds[0];
                                setSelectedOrgId(defaultOrgId); 
                            } else {
                                setSelectedOrgIdState(currentSelected);
                            }
                        } catch (orgError) {
                            console.error("Failed to fetch organizations for admin", orgError);
                            setOrganizationsForAdmin([]);
                        }
                    } else {
                        // No orgs associated
                        setOrganizationsForAdmin([]);
                        setSelectedOrgIdState(null);
                        sessionStorage.removeItem('selectedOrgId');
                    }
                } catch (error) {
                    console.error("Failed to fetch admin data", error);
                    setAdminData(null); // Ensure no stale data on error
                }
            } else {
                setUser(null);
                setAdminData(null);
                sessionStorage.removeItem('isAdminAuthenticated');
                setOrganizationsForAdmin([]);
                setSelectedOrgIdState(null);
                sessionStorage.removeItem('selectedOrgId');
            }
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    return (
        <AdminAuthContext.Provider value={{ user, adminData, loading, organizationsForAdmin, selectedOrgId, setSelectedOrgId }}>
            {children}
        </AdminAuthContext.Provider>
    );
};

export const useAdminAuth = (): AdminAuthContextType => {
    const context = useContext(AdminAuthContext);
    if (context === undefined) {
        throw new Error('useAdminAuth must be used within an AdminAuthProvider');
    }
    return context;
};