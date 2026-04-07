import React, { useState } from 'react';
import KeptGallery from './KeptGallery';
import TossedGallery from './TossedGallery';

const GalleryPage = () => {
  const [activeTab, setActiveTab] = useState('kept');

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Tabs */}
      <div className="sticky top-0 z-40 bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex space-x-8">
            <button
              onClick={() => setActiveTab('kept')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'kept'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Kept Videos
            </button>
            <button
              onClick={() => setActiveTab('tossed')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'tossed'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Tossed Videos
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div>
        {activeTab === 'kept' && <KeptGallery />}
        {activeTab === 'tossed' && <TossedGallery />}
      </div>
    </div>
  );
};

export default GalleryPage;