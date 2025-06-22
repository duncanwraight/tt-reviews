import { useState } from "react";
import { extractYouTubeVideoId, getYouTubeThumbnailUrl, createYouTubeEmbedUrl, isYouTubeUrl } from "~/lib/video-utils";

interface YouTubeLiteProps {
  url: string;
  title: string;
  className?: string;
}

const PlayButton = () => (
  <div className="absolute inset-0 flex items-center justify-center group-hover:bg-black/10 transition-colors">
    <div className="bg-red-600 rounded-full p-4 shadow-lg transform group-hover:scale-110 transition-transform">
      <svg
        className="w-8 h-8 text-white ml-1"
        fill="currentColor"
        viewBox="0 0 24 24"
      >
        <path d="M8 5v14l11-7z" />
      </svg>
    </div>
  </div>
);

export function YouTubeLite({ url, title, className = "" }: YouTubeLiteProps) {
  const [isClicked, setIsClicked] = useState(false);
  
  // Extract video ID for YouTube videos
  const videoId = isYouTubeUrl(url) ? extractYouTubeVideoId(url) : null;
  
  // If not YouTube or can't extract ID, show fallback link
  if (!videoId) {
    return (
      <div className={`bg-gray-100 rounded-lg overflow-hidden ${className}`}>
        <div className="aspect-video bg-gray-200 flex items-center justify-center">
          <div className="text-center p-6">
            <svg
              className="mx-auto h-12 w-12 text-gray-400 mb-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
              />
            </svg>
            <p className="text-sm text-gray-600 mb-3">External Video</p>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
            >
              Watch Video
            </a>
          </div>
        </div>
        <div className="p-4">
          <h3 className="text-sm font-medium text-gray-900 line-clamp-2">
            {title}
          </h3>
        </div>
      </div>
    );
  }

  // If clicked, show the actual YouTube embed
  if (isClicked) {
    return (
      <div className={`bg-black rounded-lg overflow-hidden ${className}`}>
        <div className="aspect-video">
          <iframe
            src={createYouTubeEmbedUrl(videoId, true)}
            title={title}
            className="w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        </div>
        <div className="p-4 bg-white">
          <h3 className="text-sm font-medium text-gray-900 line-clamp-2">
            {title}
          </h3>
        </div>
      </div>
    );
  }

  // Show thumbnail with play button overlay
  return (
    <div
      className={`bg-white rounded-lg overflow-hidden shadow-sm border border-gray-200 cursor-pointer group ${className}`}
      onClick={() => setIsClicked(true)}
    >
      <div className="aspect-video relative overflow-hidden">
        <img
          src={getYouTubeThumbnailUrl(videoId, 'maxres')}
          alt={title}
          className="w-full h-full object-cover"
          onError={(e) => {
            // Fallback to high quality if maxres fails
            e.currentTarget.src = getYouTubeThumbnailUrl(videoId, 'high');
          }}
        />
        <PlayButton />
        
        {/* Video duration overlay could be added here if we had that data */}
      </div>
      
      <div className="p-4">
        <h3 className="text-sm font-medium text-gray-900 line-clamp-2 group-hover:text-purple-600 transition-colors">
          {title}
        </h3>
      </div>
    </div>
  );
}