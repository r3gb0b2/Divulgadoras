import React, { createContext, useState, useEffect, useContext, ReactNode } from 'react';
// FIX: Switched from modular to compat auth to resolve export errors.
import firebase from 'firebase/compat/app';
import { auth } from '../firebase/config';
import { getAdminUserData, setAdminUserData } from '../services/adminService';
import { AdminUserData } from '../types';

interface AdminAuthContextType {
    // FIX: Use compat User type.
    user: firebase.User | null;
    adminData: AdminUserData | null;
    loading: boolean;
    selectedOrganizationId: string | null;
    selectOrganization: (orgId: string) => void;
    clearSelectedOrganization: () => void;
}

const AdminAuthContext = createContext<AdminAuthContextType | undefined>(undefined);

export const AdminAuthProvider: React.FC<{children: ReactNode}> = ({ children }) => {
    // FIX: Use compat User type.
    const [user, setUser] = useState<firebase.User | null>(null);
    const [adminData, setAdminData] = useState<AdminUserData | null>(null);
    const [loading, setLoading] = useState(true);
    const [selectedOrganizationId, setSelectedOrganizationId] = useState<string | null>(
        () => sessionStorage.getItem('selectedOrganizationId') || null
    );

    const selectOrganization = (orgId: string) => {
        sessionStorage.setItem('selectedOrganizationId', orgId);
        setSelectedOrganizationId(orgId);
    };

    const clearSelectedOrganization = () => {
        sessionStorage.removeItem('selectedOrganizationId');
        setSelectedOrganizationId(null);
    };


    useEffect(() => {
        // FIX: Use compat onAuthStateChanged method.
        const unsubscribe = auth.onAuthStateChanged(async (firebaseUser) => {
            setLoading(true);
            if (firebaseUser) {
                setUser(firebaseUser);
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

                    if (data) {
                        // If the currently selected org is no longer in the user's list, clear it.
                        if (selectedOrganizationId && !data.organizationIds?.includes(selectedOrganizationId)) {
                            clearSelectedOrganization();
                        } 
                        // If the user has exactly one org, auto-select it.
                        else if (data.organizationIds?.length === 1 && selectedOrganizationId !== data.organizationIds[0]) {
                            selectOrganization(data.organizationIds[0]);
                        }
                    }

                } catch (error) {
                    console.error("Failed to fetch admin data", error);
                    setAdminData(null); // Ensure no stale data on error
                }
            } else {
                setUser(null);
                setAdminData(null);
                clearSelectedOrganization();
            }
            setLoading(false);
        });

        return () => unsubscribe();
    }, [selectedOrganizationId]); // Rerun effect if selectedOrganizationId changes to handle edge cases

    return (
        <AdminAuthContext.Provider value={{ user, adminData, loading, selectedOrganizationId, selectOrganization, clearSelectedOrganization }}>
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