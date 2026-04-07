import { createContext, useContext, useEffect, useState } from 'react';
import { onAuthChange, signIn, signUp, signInWithGoogle, logout } from '../services/auth.service';

const AuthContext = createContext({});

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthChange((user) => {
      setCurrentUser(user);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const handleSignUp = async (email, password, displayName) => {
    try {
      setError(null);
      const user = await signUp(email, password, displayName);
      return user;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  const handleSignIn = async (email, password) => {
    try {
      setError(null);
      const user = await signIn(email, password);
      return user;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      setError(null);
      const user = await signInWithGoogle();
      return user;
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
    user: currentUser, // Add alias for components that use 'user' instead of 'currentUser'
    loading,
    error,
    signUp: handleSignUp,
    signIn: handleSignIn,
    signInWithGoogle: handleGoogleSignIn,
    logout: handleLogout,
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
