import { Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

const AuthGuard = ({ children }) => {
  const { currentUser } = useAuth();

  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

export default AuthGuard;
