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
                    
                    setUser(firebaseUser);
                    setAdminData(data);
                    
                    if (!data) {
                        // User exists in Auth, but not in admins collection. Sign them out.
                        await auth.signOut();
                        return; // The next onAuthStateChanged will handle cleanup.
                    }

                    const allOrgs = await getOrganizations();
                    
                    if (data.role === 'superadmin') {
                        // Superadmin can see all orgs for the switcher
                        setOrganizationsForAdmin(allOrgs.sort((a,b) => a.name.localeCompare(b.name)));
                        // Respect sessionStorage for impersonation
                        const currentSelected = sessionStorage.getItem('selectedOrgId');
                        const isValid = allOrgs.some(org => org.id === currentSelected);
                        if (currentSelected && isValid) {
                            setSelectedOrgIdState(currentSelected);
                        } else {
                            setSelectedOrgIdState(null); // Superadmin default is no org selected
                        }
                    } else if (data.organizationIds && data.organizationIds.length > 0) {
                        const adminOrgs = allOrgs.filter(org => data.organizationIds.includes(org.id)).sort((a,b) => a.name.localeCompare(b.name));
                        
                        if (adminOrgs.length > 0) {
                             setOrganizationsForAdmin(adminOrgs);
                             const validOrgIds = adminOrgs.map(o => o.id);
                             const currentSelected = sessionStorage.getItem('selectedOrgId');

                             if (currentSelected && validOrgIds.includes(currentSelected)) {
                                 setSelectedOrgIdState(currentSelected);
                             } else {
                                 // Default to the first valid org
                                 setSelectedOrgId(validOrgIds[0]);
                             }
                        } else {
                            // Admin is assigned to orgs that no longer exist.
                            console.warn("Admin assigned to non-existent organizations.");
                            setOrganizationsForAdmin([]);
                            setSelectedOrgIdState(null);
                            sessionStorage.removeItem('selectedOrgId');
                        }
                    } else {
                        // Regular admin with no organizations assigned.
                        setOrganizationsForAdmin([]);
                        setSelectedOrgIdState(null);
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
