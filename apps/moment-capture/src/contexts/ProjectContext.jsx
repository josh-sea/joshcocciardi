import { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import {
  createProject,
  getUserProjects,
  getProject,
  updateProject,
  deleteProject,
} from '../services/firestore.service';

const ProjectContext = createContext({});

export const useProject = () => {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error('useProject must be used within a ProjectProvider');
  }
  return context;
};

export const ProjectProvider = ({ children }) => {
  const { currentUser } = useAuth();
  const [projects, setProjects] = useState([]);
  const [currentProject, setCurrentProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load user's projects when authenticated
  useEffect(() => {
    if (currentUser) {
      loadProjects();
    } else {
      setProjects([]);
      setCurrentProject(null);
      setLoading(false);
    }
  }, [currentUser]);

  const loadProjects = async () => {
    try {
      setLoading(true);
      setError(null);
      const userProjects = await getUserProjects(currentUser.uid);
      setProjects(userProjects);
      
      // Set first project as current if no project selected
      if (!currentProject && userProjects.length > 0) {
        setCurrentProject(userProjects[0]);
      }
    } catch (err) {
      console.error('Load projects error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateProject = async (projectData) => {
    try {
      setError(null);
      const newProject = await createProject(currentUser.uid, projectData);
      setProjects([newProject, ...projects]);
      setCurrentProject(newProject);
      return newProject;
    } catch (err) {
      console.error('Create project error:', err);
      setError(err.message);
      throw err;
    }
  };

  const handleUpdateProject = async (projectId, updates) => {
    try {
      setError(null);
      await updateProject(projectId, updates);
      
      // Update local state
      setProjects(projects.map(p => 
        p.id === projectId ? { ...p, ...updates } : p
      ));
      
      if (currentProject?.id === projectId) {
        setCurrentProject({ ...currentProject, ...updates });
      }
    } catch (err) {
      console.error('Update project error:', err);
      setError(err.message);
      throw err;
    }
  };

  const handleDeleteProject = async (projectId) => {
    try {
      setError(null);
      await deleteProject(projectId);
      
      // Update local state
      const updatedProjects = projects.filter(p => p.id !== projectId);
      setProjects(updatedProjects);
      
      // If deleted project was current, select another
      if (currentProject?.id === projectId) {
        setCurrentProject(updatedProjects.length > 0 ? updatedProjects[0] : null);
      }
    } catch (err) {
      console.error('Delete project error:', err);
      setError(err.message);
      throw err;
    }
  };

  const handleSelectProject = async (projectId) => {
    try {
      setError(null);
      const project = await getProject(projectId);
      setCurrentProject(project);
    } catch (err) {
      console.error('Select project error:', err);
      setError(err.message);
      throw err;
    }
  };

  const refreshCurrentProject = async () => {
    if (currentProject) {
      try {
        const updated = await getProject(currentProject.id);
        setCurrentProject(updated);
        
        // Also update in projects list
        setProjects(projects.map(p => 
          p.id === updated.id ? updated : p
        ));
      } catch (err) {
        console.error('Refresh project error:', err);
      }
    }
  };

  const value = {
    projects,
    currentProject,
    loading,
    error,
    createProject: handleCreateProject,
    updateProject: handleUpdateProject,
    deleteProject: handleDeleteProject,
    selectProject: handleSelectProject,
    refreshProject: refreshCurrentProject,
    reloadProjects: loadProjects,
  };

  return (
    <ProjectContext.Provider value={value}>
      {children}
    </ProjectContext.Provider>
  );
};
