import { createContext, useContext, useEffect, useState } from 'react';
import { onAuthChange, signInWithGoogle, logout } from '../services/auth.service';

const AuthContext = createContext({});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    return onAuthChange((user) => {
      setCurrentUser(user);
      setLoading(false);
    });
  }, []);

  const handleGoogleSignIn = async () => {
    try {
      setError(null);
      return await signInWithGoogle();
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  const handleLogout = async () => {
    try {
      setError(null);
      await logout();
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  const value = {
    currentUser,
    user: currentUser,
    loading,
    error,
    signInWithGoogle: handleGoogleSignIn,
    logout: handleLogout,
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
