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

            if (firebaseUser) {
                try {
                    let data = await getAdminUserData(firebaseUser.uid);

                    // If no admin data is found, check if it's the default superadmin email.
                    // If so, create their admin record on the fly for the first login.
                    if (!data && firebaseUser.email === 'r3gb0b@gmail.com') {
                        const superAdminPayload: Omit<AdminUserData, 'uid'> = {
                            email: firebaseUser.email,
                            role: 'superadmin',
                            assignedStates: [], // Superadmin has access to all states implicitly
                        };
                        await setAdminUserData(firebaseUser.uid, superAdminPayload);
                        data = { uid: firebaseUser.uid, ...superAdminPayload };
                    }
                    
                    if (!data) {
                        // User exists in Auth, but not in admins collection. Sign them out.
                        await auth.signOut();
                        return; // The next onAuthStateChanged will handle cleanup.
                    }
                    
                    setUser(firebaseUser);
                    setAdminData(data);

                    const allOrgs = await getOrganizations();
                    
                    let adminVisibleOrgs: Organization[] = [];
                    if (data.role === 'superadmin') {
                        adminVisibleOrgs = allOrgs;
                    } else if (data.organizationIds?.length) {
                        const accessibleOrgIds = new Set(data.organizationIds);
                        // Make sure to only include orgs that still exist
                        adminVisibleOrgs = allOrgs.filter(org => accessibleOrgIds.has(org.id));
                    }

                    // Always sort for consistent UI
                    adminVisibleOrgs.sort((a, b) => a.name.localeCompare(b.name));
                    setOrganizationsForAdmin(adminVisibleOrgs);

                    let newSelectedOrgId: string | null = null;
                    if (adminVisibleOrgs.length > 0) {
                        const storedId = sessionStorage.getItem('selectedOrgId');
                        const isValidStoredId = storedId && adminVisibleOrgs.some(org => org.id === storedId);

                        if (isValidStoredId) {
                            newSelectedOrgId = storedId;
                        } else if (data.role !== 'superadmin') {
                            // If stored ID is invalid or missing, default non-superadmin to their first available org.
                            newSelectedOrgId = adminVisibleOrgs[0].id;
                        }
                        // For superadmin, if storedId is invalid, newSelectedOrgId remains null, which is correct.
                    }
                    
                    // Update state and sessionStorage in one go
                    setSelectedOrgIdState(newSelectedOrgId);
                    if (newSelectedOrgId) {
                        sessionStorage.setItem('selectedOrgId', newSelectedOrgId);
                    } else {
                        sessionStorage.removeItem('selectedOrgId');
                    }
                } catch (error) {
                    console.error("Error during auth state processing:", error);
                    // On any error, sign out and clear state
                    await auth.signOut();
                }
            } else {
                setUser(null);
                setAdminData(null);
                setOrganizationsForAdmin([]);
                setSelectedOrgIdState(null);
                sessionStorage.clear();
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