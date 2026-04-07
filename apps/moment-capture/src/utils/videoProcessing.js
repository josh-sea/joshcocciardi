import { MAX_VIDEO_SIZE } from './constants';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

// Singleton FFmpeg instance
let ffmpegInstance = null;
let ffmpegLoaded = false;

// Validate video file
export const validateVideo = (file) => {
  if (!file) {
    throw new Error('No file provided');
  }
  
  if (!file.type.startsWith('video/')) {
    throw new Error('File must be a video');
  }
  
  if (file.size > MAX_VIDEO_SIZE) {
    throw new Error(`Video must be less than ${MAX_VIDEO_SIZE / (1024 * 1024)}MB`);
  }
  
  return true;
};

// Get video duration from blob
export const getVideoDuration = (blob) => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    
    video.onloadedmetadata = () => {
      window.URL.revokeObjectURL(video.src);
      resolve(video.duration);
    };
    
    video.onerror = () => {
      reject(new Error('Failed to load video metadata'));
    };
    
    video.src = URL.createObjectURL(blob);
  });
};

// Generate video thumbnail
export const generateThumbnail = (blob) => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    
    video.preload = 'metadata';
    video.muted = true;
    
    video.onloadeddata = () => {
      // Seek to 50% of the video
      video.currentTime = video.duration / 2;
    };
    
    video.onseeked = () => {
      // Set canvas size to video size
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      // Draw video frame to canvas
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      // Convert canvas to blob
      canvas.toBlob((thumbnailBlob) => {
        window.URL.revokeObjectURL(video.src);
        resolve(thumbnailBlob);
      }, 'image/jpeg', 0.8);
    };
    
    video.onerror = () => {
      reject(new Error('Failed to generate thumbnail'));
    };
    
    video.src = URL.createObjectURL(blob);
  });
};

// Get or create FFmpeg instance
const getFFmpeg = async () => {
  if (ffmpegInstance && ffmpegLoaded) {
    return ffmpegInstance;
  }

  if (!ffmpegInstance) {
    ffmpegInstance = new FFmpeg();
  }

  if (!ffmpegLoaded) {
    try {
      // Load FFmpeg core from CDN
      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
      await ffmpegInstance.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      });
      ffmpegLoaded = true;
      console.log('FFmpeg loaded successfully');
    } catch (error) {
      console.error('Failed to load FFmpeg:', error);
      throw new Error('Failed to initialize video converter');
    }
  }

  return ffmpegInstance;
};

// Convert video to MP4 format with H.264 codec
export const convertToMP4 = async (webmBlob, onProgress = null) => {
  try {
    console.log('Starting video conversion to MP4...');
    const ffmpeg = await getFFmpeg();

    // Set up progress handler
    if (onProgress) {
      ffmpeg.on('progress', ({ progress }) => {
        onProgress(Math.round(progress * 100));
      });
    }

    // Write input file to FFmpeg virtual filesystem
    const inputFileName = 'input.webm';
    const outputFileName = 'output.mp4';
    
    await ffmpeg.writeFile(inputFileName, await fetchFile(webmBlob));

    // Convert to MP4 with H.264 video + AAC audio
    // -map 0:v   : include all video streams
    // -map 0:a?  : include audio if present (? = optional, won't fail if no audio)
    // -c:v libx264 : H.264 video codec
    // -c:a aac   : AAC audio codec (native encoder, always available in ffmpeg-core)
    // -b:a 128k  : Audio bitrate
    // -movflags +faststart : Enable progressive streaming
    await ffmpeg.exec([
      '-i', inputFileName,
      '-map', '0:v',
      '-map', '0:a?',
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '22',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-movflags', '+faststart',
      outputFileName
    ]);

    // Read the output file
    const data = await ffmpeg.readFile(outputFileName);
    
    // Clean up
    await ffmpeg.deleteFile(inputFileName);
    await ffmpeg.deleteFile(outputFileName);

    // Convert to blob
    const mp4Blob = new Blob([data.buffer], { type: 'video/mp4' });
    
    console.log('Video conversion completed successfully');
    console.log(`Original size: ${formatFileSize(webmBlob.size)}`);
    console.log(`Converted size: ${formatFileSize(mp4Blob.size)}`);
    
    return mp4Blob;
  } catch (error) {
    console.error('Video conversion failed:', error);
    throw new Error(`Failed to convert video: ${error.message}`);
  }
};

// Compress video (basic implementation)
export const compressVideo = async (blob, targetSize = MAX_VIDEO_SIZE) => {
  // For now, just return the original blob
  // In a production app, you might want to use a library like ffmpeg.wasm
  // to actually compress the video
  return blob;
};

// Convert blob to base64 (for IndexedDB storage)
export const blobToBase64 = (blob) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

// Convert base64 to blob
export const base64ToBlob = (base64) => {
  const parts = base64.split(';base64,');
  const contentType = parts[0].split(':')[1];
  const raw = window.atob(parts[1]);
  const rawLength = raw.length;
  const uInt8Array = new Uint8Array(rawLength);
  
  for (let i = 0; i < rawLength; ++i) {
    uInt8Array[i] = raw.charCodeAt(i);
  }
  
  return new Blob([uInt8Array], { type: contentType });
};

// Format file size for display
export const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
};

// Create video element for playback
export const createVideoElement = (url, options = {}) => {
  const video = document.createElement('video');
  video.src = url;
  video.muted = options.muted ?? false;
  video.autoplay = options.autoplay ?? false;
  video.loop = options.loop ?? false;
  video.controls = options.controls ?? true;
  video.playsInline = true; // Important for mobile
  
  return video;
};