import { useState } from 'react';
import { useProject } from '../../contexts/ProjectContext';

const CreateProject = ({ isOpen, onClose }) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [videoDuration, setVideoDuration] = useState(2);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { createProject } = useProject();

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!name.trim()) {
      setError('Please enter a project name');
      return;
    }

    try {
      setError('');
      setLoading(true);

      await createProject({
        name: name.trim(),
        description: description.trim(),
        videoDuration,
      });

      // Reset form
      setName('');
      setDescription('');
      setVideoDuration(2);
      
      // Close modal
      onClose();
    } catch (err) {
      setError('Failed to create project. Please try again.');
      console.error('Create project error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      setName('');
      setDescription('');
      setVideoDuration(2);
      setError('');
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
        onClick={handleClose}
      ></div>

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
          {/* Close Button */}
          <button
            onClick={handleClose}
            disabled={loading}
            className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition disabled:opacity-50"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* Header */}
          <h2 className="text-2xl font-bold text-gray-900 mb-6">
            Create New Project
          </h2>

          {/* Error Message */}
          {error && (
            <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Project Name */}
            <div>
              <label htmlFor="project-name" className="block text-sm font-medium text-gray-700 mb-1">
                Project Name *
              </label>
              <input
                id="project-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
                placeholder="My Summer 2024"
                disabled={loading}
                maxLength={50}
              />
            </div>

            {/* Description */}
            <div>
              <label htmlFor="project-description" className="block text-sm font-medium text-gray-700 mb-1">
                Description (optional)
              </label>
              <textarea
                id="project-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition resize-none"
                placeholder="A compilation of my summer adventures"
                rows={3}
                disabled={loading}
                maxLength={200}
              />
            </div>

            {/* Video Duration */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Default Video Duration
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[1, 2, 3].map((duration) => (
                  <button
                    key={duration}
                    type="button"
                    onClick={() => setVideoDuration(duration)}
                    disabled={loading}
                    className={`py-2 px-4 rounded-lg font-medium transition disabled:opacity-50 ${
                      videoDuration === duration
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {duration}s
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-gray-500">
                Length of each video clip you'll capture
              </p>
            </div>

            {/* Buttons */}
            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={handleClose}
                disabled={loading}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <span className="flex items-center justify-center">
                    <svg className="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Creating...
                  </span>
                ) : (
                  'Create Project'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default CreateProject;
