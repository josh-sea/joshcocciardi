// Format date to readable string
export const formatDate = (date) => {
  if (!date) return '';
  
  const d = date instanceof Date ? date : date.toDate();
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(d);
};

// Format date with time
export const formatDateTime = (date) => {
  if (!date) return '';
  
  const d = date instanceof Date ? date : date.toDate();
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
  }).format(d);
};

// Get relative time (e.g., "2 days ago")
export const getRelativeTime = (date) => {
  if (!date) return '';
  
  const d = date instanceof Date ? date : date.toDate();
  const now = new Date();
  const diffInSeconds = Math.floor((now - d) / 1000);
  
  if (diffInSeconds < 60) {
    return 'just now';
  }
  
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) {
    return `${diffInMinutes} minute${diffInMinutes > 1 ? 's' : ''} ago`;
  }
  
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) {
    return `${diffInHours} hour${diffInHours > 1 ? 's' : ''} ago`;
  }
  
  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 30) {
    return `${diffInDays} day${diffInDays > 1 ? 's' : ''} ago`;
  }
  
  const diffInMonths = Math.floor(diffInDays / 30);
  if (diffInMonths < 12) {
    return `${diffInMonths} month${diffInMonths > 1 ? 's' : ''} ago`;
  }
  
  const diffInYears = Math.floor(diffInMonths / 12);
  return `${diffInYears} year${diffInYears > 1 ? 's' : ''} ago`;
};

// Group videos by date
export const groupVideosByDate = (videos) => {
  const groups = {};
  
  videos.forEach((video) => {
    const date = formatDate(video.capturedAt);
    if (!groups[date]) {
      groups[date] = [];
    }
    groups[date].push(video);
  });
  
  return groups;
};

// Check if date is today
export const isToday = (date) => {
  if (!date) return false;
  
  const d = date instanceof Date ? date : date.toDate();
  const today = new Date();
  
  return d.getDate() === today.getDate() &&
         d.getMonth() === today.getMonth() &&
         d.getFullYear() === today.getFullYear();
};

// Check if date is this week
export const isThisWeek = (date) => {
  if (!date) return false;
  
  const d = date instanceof Date ? date : date.toDate();
  const today = new Date();
  const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  
  return d >= weekAgo && d <= today;
};