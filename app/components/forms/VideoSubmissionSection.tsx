import { useState } from "react";
import { isYouTubeUrl, extractYouTubeVideoId } from "~/lib/video-utils";

interface VideoEntry {
  id: string;
  url: string;
  title: string;
  platform: 'youtube' | 'other';
}

interface VideoSubmissionSectionProps {
  onVideosChange?: (videos: VideoEntry[]) => void;
  initialVideos?: VideoEntry[];
  showTitle?: boolean;
}

export function VideoSubmissionSection({ 
  onVideosChange, 
  initialVideos = [], 
  showTitle = true 
}: VideoSubmissionSectionProps) {
  const [videos, setVideos] = useState<VideoEntry[]>(initialVideos);
  const [currentUrl, setCurrentUrl] = useState("");
  const [currentTitle, setCurrentTitle] = useState("");
  const [urlError, setUrlError] = useState("");

  const validateUrl = (url: string): boolean => {
    if (!url.trim()) return false;
    
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  const detectPlatform = (url: string): 'youtube' | 'other' => {
    return isYouTubeUrl(url) ? 'youtube' : 'other';
  };

  const addVideo = () => {
    setUrlError("");
    
    if (!validateUrl(currentUrl)) {
      setUrlError("Please enter a valid URL");
      return;
    }
    
    if (!currentTitle.trim()) {
      setUrlError("Please enter a video title");
      return;
    }

    // Check for duplicate URLs
    if (videos.some(v => v.url === currentUrl.trim())) {
      setUrlError("This video URL has already been added");
      return;
    }

    const newVideo: VideoEntry = {
      id: crypto.randomUUID(),
      url: currentUrl.trim(),
      title: currentTitle.trim(),
      platform: detectPlatform(currentUrl.trim())
    };

    const updatedVideos = [...videos, newVideo];
    setVideos(updatedVideos);
    onVideosChange?.(updatedVideos);
    
    // Clear form
    setCurrentUrl("");
    setCurrentTitle("");
  };

  const removeVideo = (id: string) => {
    const updatedVideos = videos.filter(v => v.id !== id);
    setVideos(updatedVideos);
    onVideosChange?.(updatedVideos);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addVideo();
    }
  };

  return (
    <div className="video-submission-section">
      {showTitle && (
        <div className="mb-6">
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            Video Information (Optional)
          </h3>
          <p className="text-sm text-gray-600">
            Add training videos, match footage, or other relevant video content. 
            YouTube videos will be embedded with thumbnails, while other videos will link externally.
          </p>
        </div>
      )}

      {/* Add Video Form */}
      <div className="add-video-form bg-gray-50 rounded-lg p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label htmlFor="video-url" className="block text-sm font-medium text-gray-700 mb-1">
              Video URL
            </label>
            <input
              type="url"
              id="video-url"
              value={currentUrl}
              onChange={(e) => setCurrentUrl(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="https://youtube.com/watch?v=... or https://example.com/video.mp4"
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-purple-500 focus:border-purple-500"
            />
          </div>
          
          <div>
            <label htmlFor="video-title" className="block text-sm font-medium text-gray-700 mb-1">
              Video Title
            </label>
            <input
              type="text"
              id="video-title"
              value={currentTitle}
              onChange={(e) => setCurrentTitle(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="e.g., Training Session, Match vs Opponent"
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-purple-500 focus:border-purple-500"
            />
          </div>
        </div>

        {urlError && (
          <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-2">
            {urlError}
          </div>
        )}

        <button
          type="button"
          onClick={addVideo}
          className="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
        >
          <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Video
        </button>
      </div>

      {/* Video List */}
      {videos.length > 0 && (
        <div className="video-list">
          <h4 className="text-md font-medium text-gray-900 mb-3">
            Added Videos ({videos.length})
          </h4>
          <div className="space-y-3">
            {videos.map((video) => (
              <div key={video.id} className="flex items-start justify-between p-3 bg-white border border-gray-200 rounded-md">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h5 className="text-sm font-medium text-gray-900 truncate">
                      {video.title}
                    </h5>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                      video.platform === 'youtube' 
                        ? 'bg-red-100 text-red-800' 
                        : 'bg-gray-100 text-gray-800'
                    }`}>
                      {video.platform === 'youtube' ? 'YouTube' : 'External'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 truncate">
                    {video.url}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => removeVideo(video.id)}
                  className="ml-3 text-gray-400 hover:text-red-500 focus:outline-none"
                  title="Remove video"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Hidden inputs for form submission */}
      {videos.map((video, index) => (
        <div key={video.id}>
          <input type="hidden" name={`videos[${index}][url]`} value={video.url} />
          <input type="hidden" name={`videos[${index}][title]`} value={video.title} />
          <input type="hidden" name={`videos[${index}][platform]`} value={video.platform} />
        </div>
      ))}
    </div>
  );
}