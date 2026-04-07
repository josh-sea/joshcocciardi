import { useState } from 'react';
import { uploadVideo, deleteVideo } from '../services/storage.service';

const useFirebaseStorage = () => {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState(null);

  const upload = async (file, path) => {
    setUploading(true);
    setUploadProgress(0);
    setError(null);

    try {
      const downloadURL = await uploadVideo(
        file,
        path,
        (progress) => {
          setUploadProgress(progress);
        }
      );

      setUploading(false);
      setUploadProgress(100);
      return downloadURL;
    } catch (err) {
      console.error('Upload error:', err);
      setError(err.message || 'Upload failed');
      setUploading(false);
      throw err;
    }
  };

  const deleteFile = async (path) => {
    setError(null);
    
    try {
      await deleteVideo(path);
      return true;
    } catch (err) {
      console.error('Delete error:', err);
      setError(err.message || 'Delete failed');
      throw err;
    }
  };

  const reset = () => {
    setUploading(false);
    setUploadProgress(0);
    setError(null);
  };

  return {
    uploading,
    uploadProgress,
    error,
    upload,
    deleteFile,
    reset
  };
};

export default useFirebaseStorage;
