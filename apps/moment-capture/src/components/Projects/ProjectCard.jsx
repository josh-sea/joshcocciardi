import { useProject } from '../../contexts/ProjectContext';
import { formatDistanceToNow } from 'date-fns';

const ProjectCard = ({ project, onEdit, onDelete }) => {
  const { currentProject, selectProject } = useProject();
  const isSelected = currentProject?.id === project.id;

  const handleSelect = () => {
    if (!isSelected) {
      selectProject(project.id);
    }
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return 'Unknown';
    
    try {
      // Handle Firestore Timestamp
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      return formatDistanceToNow(date, { addSuffix: true });
    } catch (err) {
      return 'Unknown';
    }
  };

  return (
    <div
      onClick={handleSelect}
      className={`p-4 rounded-xl border-2 transition-all cursor-pointer ${
        isSelected
          ? 'border-blue-500 bg-blue-50'
          : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-md'
      }`}
    >
      {/* Header */}
      <div className="flex justify-between items-start mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-semibold text-gray-900 truncate">
            {project.name}
          </h3>
          {project.description && (
            <p className="text-sm text-gray-600 mt-1 line-clamp-2">
              {project.description}
            </p>
          )}
        </div>

        {isSelected && (
          <div className="ml-2">
            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
              Active
            </span>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="bg-gray-50 rounded-lg p-2 text-center">
          <div className="text-2xl font-bold text-gray-900">
            {project.videoCount || 0}
          </div>
          <div className="text-xs text-gray-600">Total</div>
        </div>
        <div className="bg-green-50 rounded-lg p-2 text-center">
          <div className="text-2xl font-bold text-green-700">
            {project.keptCount || 0}
          </div>
          <div className="text-xs text-green-700">Kept</div>
        </div>
        <div className="bg-purple-50 rounded-lg p-2 text-center">
          <div className="text-2xl font-bold text-purple-700">
            {project.videoDuration || 2}s
          </div>
          <div className="text-xs text-purple-700">Duration</div>
        </div>
      </div>

      {/* Metadata */}
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>Created {formatDate(project.createdAt)}</span>
        
        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit(project);
            }}
            className="p-1 text-gray-400 hover:text-blue-600 transition"
            title="Edit project"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(project);
            }}
            className="p-1 text-gray-400 hover:text-red-600 transition"
            title="Delete project"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProjectCard;
