import React, { createContext, useState, useEffect, useContext, ReactNode } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from '../firebase/config';
import { getAdminUserData, setAdminUserData } from '../services/adminService';
import { AdminUserData } from '../types';

interface AdminAuthContextType {
    user: User | null;
    adminData: AdminUserData | null;
    loading: boolean;
}

const AdminAuthContext = createContext<AdminAuthContextType | undefined>(undefined);

export const AdminAuthProvider: React.FC<{children: ReactNode}> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [adminData, setAdminData] = useState<AdminUserData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
            setLoading(true);
            if (firebaseUser) {
                setUser(firebaseUser);
                sessionStorage.setItem('isAdminAuthenticated', 'true');
                try {
                    // Use UID for secure data retrieval
                    let data = await getAdminUserData(firebaseUser.uid);

                    // If no admin data is found, check if it's the default superadmin email.
                    // If so, create their admin record on the fly for the first login.
                    if (!data && firebaseUser.email === 'rafael@agenciavitrine.com') {
                        const superAdminPayload: Omit<AdminUserData, 'uid'> = {
                            email: firebaseUser.email,
                            role: 'superadmin',
                            assignedStates: [], // Superadmin has access to all states
                        };
                        await setAdminUserData(firebaseUser.uid, superAdminPayload);
                        // Set the data for the current session after creating it
                        data = { uid: firebaseUser.uid, ...superAdminPayload };
                    }

                    setAdminData(data);
                } catch (error) {
                    console.error("Failed to fetch admin data", error);
                    setAdminData(null); // Ensure no stale data on error
                }
            } else {
                setUser(null);
                setAdminData(null);
                sessionStorage.removeItem('isAdminAuthenticated');
            }
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    return (
        <AdminAuthContext.Provider value={{ user, adminData, loading }}>
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
