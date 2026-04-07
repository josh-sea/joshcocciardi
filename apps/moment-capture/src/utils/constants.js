// Video duration options (in seconds)
export const VIDEO_DURATIONS = [1, 2, 3];

// Video status types
export const VIDEO_STATUS = {
  PENDING: 'pending',
  KEPT: 'kept',
  TOSSED: 'tossed',
};

// Maximum file size for videos (in bytes) - 50MB
export const MAX_VIDEO_SIZE = 50 * 1024 * 1024;

// Video format
export const VIDEO_FORMAT = 'video/webm';

// Swipe thresholds
export const SWIPE_THRESHOLD = 100; // pixels
export const SWIPE_VELOCITY_THRESHOLD = 0.3;

// Animation durations
export const ANIMATION_DURATION = 300; // ms

// Batch sizes
export const REVIEW_BATCH_SIZE = 20;
export const GALLERY_PAGE_SIZE = 50;

// Error messages
export const ERROR_MESSAGES = {
  CAMERA_PERMISSION_DENIED: 'Camera permission was denied. Please enable camera access in your browser settings.',
  UPLOAD_FAILED: 'Failed to upload video. Please try again.',
  DELETE_FAILED: 'Failed to delete video. Please try again.',
  AUTH_FAILED: 'Authentication failed. Please try again.',
  NETWORK_ERROR: 'Network error. Please check your connection.',
};

// Success messages
export const SUCCESS_MESSAGES = {
  VIDEO_UPLOADED: 'Video uploaded successfully!',
  VIDEO_KEPT: 'Video kept!',
  VIDEO_TOSSED: 'Video tossed!',
  PROJECT_CREATED: 'Project created successfully!',
  PROJECT_UPDATED: 'Project updated successfully!',
  PROJECT_DELETED: 'Project deleted successfully!',
};