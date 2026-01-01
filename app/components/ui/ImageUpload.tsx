import React, { useState, useRef } from "react";
import { LazyImage } from "./LazyImage";

interface ImageUploadProps {
  name: string;
  label?: string;
  helpText?: string;
  required?: boolean;
  disabled?: boolean;
  accept?: string;
  maxSize?: number; // in MB
  className?: string;
  preview?: boolean;
  existingImageUrl?: string;
  onFileChange?: (file: File | null) => void;
}

export function ImageUpload({
  name,
  label,
  helpText,
  required = false,
  disabled = false,
  accept = "image/jpeg,image/png,image/webp",
  maxSize = 10,
  className = "",
  preview = true,
  existingImageUrl,
  onFileChange,
}: ImageUploadProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(existingImageUrl || null);
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = (file: File | null) => {
    setError(null);

    if (file) {
      // Validate file type
      const allowedTypes = accept.split(",").map(type => type.trim());
      if (!allowedTypes.includes(file.type)) {
        setError(
          "Invalid file type. Please select a JPEG, PNG, or WebP image."
        );
        setSelectedFile(null);
        setPreviewUrl(null);
        if (onFileChange) onFileChange(null);
        return;
      }

      // Validate file size
      const maxSizeBytes = maxSize * 1024 * 1024;
      if (file.size > maxSizeBytes) {
        setError(`File size must be less than ${maxSize}MB.`);
        setSelectedFile(null);
        setPreviewUrl(null);
        if (onFileChange) onFileChange(null);
        return;
      }

      setSelectedFile(file);
      if (onFileChange) onFileChange(file);

      // Create preview URL if preview is enabled
      if (preview) {
        const url = URL.createObjectURL(file);
        setPreviewUrl(url);
      }
    } else {
      setSelectedFile(null);
      setPreviewUrl(null);
      if (onFileChange) onFileChange(null);
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    processFile(file);
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    setError(null);
    if (onFileChange) onFileChange(null);

    // Clear the file input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleClick = () => {
    if (!disabled) {
      fileInputRef.current?.click();
    }
  };

  // Drag and drop event handlers
  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) {
      setIsDragOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    if (disabled) return;

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      processFile(file);

      // Update the hidden file input to match the dropped file
      if (fileInputRef.current) {
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        fileInputRef.current.files = dataTransfer.files;
      }
    }
  };

  // Clean up preview URL when component unmounts
  React.useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  return (
    <div className={`space-y-2 ${className}`}>
      {label && (
        <label className="block text-sm font-medium text-gray-700">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}

      {helpText && (
        <p className="text-sm text-gray-500">{helpText}</p>
      )}

      <div className="flex flex-col space-y-3">
        {/* File Input (Hidden) */}
        <input
          ref={fileInputRef}
          type="file"
          name={name}
          accept={accept}
          onChange={handleFileChange}
          disabled={disabled}
          required={required}
          className="hidden"
        />

        {/* Upload Area */}
        {!selectedFile && !previewUrl && (
          <div
            onClick={handleClick}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            className={`
              border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-all duration-200
              ${isDragOver 
                ? "border-purple-500 bg-purple-50 border-solid" 
                : "border-gray-300 hover:border-gray-400 hover:bg-gray-50"
              }
              ${disabled ? "cursor-not-allowed opacity-50" : ""}
            `}
          >
            <div className="space-y-2">
              <svg
                className="mx-auto h-12 w-12 text-gray-400"
                stroke="currentColor"
                fill="none"
                viewBox="0 0 48 48"
              >
                <path
                  d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <div className="text-sm text-gray-600">
                {isDragOver ? (
                  <span className="font-medium text-purple-600">
                    Drop your image here
                  </span>
                ) : (
                  <>
                    <span className="font-medium text-purple-600">
                      Click to upload
                    </span>{" "}
                    or drag and drop
                  </>
                )}
              </div>
              <p className="text-xs text-gray-500">
                JPEG, PNG, WebP up to {maxSize}MB
              </p>
            </div>
          </div>
        )}

        {/* Preview Area */}
        {(selectedFile || previewUrl) && (
          <div className="border border-gray-300 rounded-lg p-4">
            <div className="flex items-start space-x-4">
              {/* Image Preview */}
              {previewUrl && (
                <div className="flex-shrink-0 w-20 h-20">
                  <LazyImage
                    src={previewUrl}
                    alt="Preview"
                    className="w-full h-full border border-gray-200"
                    placeholder="blur"
                  />
                </div>
              )}

              {/* File Info */}
              <div className="flex-1 min-w-0">
                {selectedFile ? (
                  <>
                    <div className="text-sm font-medium text-gray-900 truncate">
                      {selectedFile.name}
                    </div>
                    <div className="text-sm text-gray-500">
                      {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-sm font-medium text-gray-900">
                      Existing image
                    </div>
                    <button
                      type="button"
                      onClick={handleClick}
                      disabled={disabled}
                      className="text-sm text-purple-600 hover:text-purple-800"
                    >
                      Click to replace
                    </button>
                  </>
                )}
              </div>

              {/* Remove Button */}
              <button
                type="button"
                onClick={handleRemoveFile}
                disabled={disabled}
                className="flex-shrink-0 p-1 text-gray-400 hover:text-gray-600 disabled:opacity-50"
              >
                <svg
                  className="h-5 w-5"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-3">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
