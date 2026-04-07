import React from 'react';

const LoadingSpinner = ({ size = 'md', message = '' }) => {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-8 w-8',
    lg: 'h-12 w-12',
    xl: 'h-16 w-16'
  };

  return (
    <div className="flex flex-col items-center justify-center">
      <div className={`${sizeClasses[size]} animate-spin`}>
        <div className="h-full w-full border-4 border-gray-200 rounded-full border-t-blue-500"></div>
      </div>
      {message && (
        <p className="mt-4 text-sm text-gray-600">{message}</p>
      )}
    </div>
  );
};

export default LoadingSpinner;
