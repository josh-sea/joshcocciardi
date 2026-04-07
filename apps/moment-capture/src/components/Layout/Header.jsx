import React from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useProject } from '../../contexts/ProjectContext';

const Header = () => {
  const { user, logout } = useAuth();
  const { currentProject } = useProject();

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Failed to logout:', error);
    }
  };

  return (
    <header className="bg-white shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center py-4">
          {/* Logo and Project Name */}
          <div className="flex items-center space-x-4">
            <h1 className="text-2xl font-bold text-blue-600">Moments</h1>
            {currentProject && (
              <div className="hidden sm:block">
                <span className="text-gray-400">|</span>
                <span className="ml-4 text-lg text-gray-700">{currentProject.name}</span>
              </div>
            )}
          </div>

          {/* User Menu */}
          {user && (
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-600 hidden sm:inline">
                {user.email}
              </span>
              <button
                onClick={handleLogout}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
              >
                Logout
              </button>
            </div>
          )}
        </div>

        {/* Mobile Project Name */}
        {currentProject && (
          <div className="sm:hidden pb-3">
            <span className="text-sm text-gray-600">{currentProject.name}</span>
          </div>
        )}
      </div>
    </header>
  );
};

export default Header;
