/* eslint-disable react/prop-types */
import React from 'react';

interface PageData {
  id: string;
  pageUrl: string;
  pageSummary: string;
  imageAnalysis?: {
    imageUrl: string;
    currentAlt: string;
    generatedAlt?: string;
  }[];
  createdAt: number;
  updatedAt: number;
}

interface AccessibilityAnalyzerProps {
  currentPageData: PageData | null;
  onHandleStarBasicAnalysis: () => void;
  onClose: () => void;
  visible: boolean;
  isDarkMode?: boolean;
  isAnalyzing?: boolean;
  fontSize?: number;
  // accessibilityResult?: string | null;
}

const AccessibilityAnalyzer: React.FC<AccessibilityAnalyzerProps> = ({
  currentPageData,
  onHandleStarBasicAnalysis,
  visible,
  isDarkMode = false,
  isAnalyzing = false,
  fontSize = 100,
}) => {
  if (!visible || !currentPageData) return null;

  return (
    <div style={{ fontSize: `${fontSize}%` }} className={`h-full overflow-y-auto px-4`}>
      {/* Analysis Button */}
      {!currentPageData.pageSummary && (
        <div className="mb-4">
          <button
            onClick={onHandleStarBasicAnalysis}
            disabled={isAnalyzing}
            className={`w-full rounded-lg p-3 transition-all ${
              isDarkMode
                ? 'bg-blue-600 text-white hover:bg-blue-500 disabled:bg-blue-800'
                : 'bg-blue-500 text-white hover:bg-blue-600 disabled:bg-blue-300'
            } disabled:cursor-not-allowed`}>
            {isAnalyzing ? 'Analyzing...' : 'Improve Accessibility'}
          </button>
        </div>
      )}
      {/* Live Analysis Result */}
      {currentPageData.pageSummary && (
        <div className={`rounded-lg ${isDarkMode ? 'bg-slate-800' : 'bg-white/50'} mb-4 p-4 backdrop-blur-sm`}>
          <h3 className={`mb-2 font-medium ${isDarkMode ? 'text-gray-200' : 'text-gray-900'}`}>VisibleAi Summary</h3>
          <div className={`${isDarkMode ? 'text-gray-300' : 'text-gray-700'} whitespace-pre-wrap leading-relaxed`}>
            {currentPageData.pageSummary || 'No summary available.'}
          </div>
        </div>
      )}
      {currentPageData.imageAnalysis && currentPageData.imageAnalysis.length > 0 && (
        <div className={`rounded-lg ${isDarkMode ? 'bg-slate-800' : 'bg-white/50'} p-4 backdrop-blur-sm`}>
          <h3 className={`mb-3 font-medium ${isDarkMode ? 'text-gray-200' : 'text-gray-900'}`}>
            Image Analysis ({currentPageData.imageAnalysis.length} images)
          </h3>
          <div className="space-y-3">
            {currentPageData.imageAnalysis.map((image, index) => (
              <div
                key={index}
                className={`rounded-lg border p-3 ${isDarkMode ? 'border-gray-600' : 'border-gray-300'}`}>
                <img
                  width={(200 * fontSize) / 100}
                  height={(200 * fontSize) / 100}
                  src={image.imageUrl}
                  alt={image.currentAlt || 'Image'}
                  className="mb-2 rounded object-cover"
                  onError={e => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
                <div className="space-y-2">
                  <div>
                    <span className={` font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      Current alt:
                    </span>
                    <p className={` ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                      {image.currentAlt || 'No alt text'}
                    </p>
                    {image.generatedAlt && (
                      <div>
                        <span className={` font-medium ${isDarkMode ? 'text-green-400' : 'text-green-600'}`}>
                          Generated alt:
                        </span>
                        <p className={` ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>{image.generatedAlt}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* {accessibilityReport && (
        <div className="space-y-4">
        
          <div className={`rounded-lg ${isDarkMode ? 'bg-slate-800' : 'bg-white/50'} p-4 backdrop-blur-sm`}>
            <h3 className={`mb-2 text-sm font-medium ${isDarkMode ? 'text-gray-200' : 'text-gray-900'}`}>
              Page Summary
            </h3>
            <p className={` ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              {accessibilityReport.pageSummary}
            </p>
          </div>

          {accessibilityReport.imageAnalysis && accessibilityReport.imageAnalysis.length > 0 && (
            <div className={`rounded-lg ${isDarkMode ? 'bg-slate-800' : 'bg-white/50'} p-4 backdrop-blur-sm`}>
              <h3 className={`mb-3 text-sm font-medium ${isDarkMode ? 'text-gray-200' : 'text-gray-900'}`}>
                Image Analysis ({accessibilityReport.imageAnalysis.length} images)
              </h3>
              <div className="space-y-3">
                {accessibilityReport.imageAnalysis.map((image, index) => (
                  <div
                    key={index}
                    className={`rounded-lg border p-3 ${isDarkMode ? 'border-gray-600' : 'border-gray-300'}`}>
                    <img
                      src={image.imageUrl}
                      alt={image.currentAlt || 'Image'}
                      className="mb-2 size-16 rounded object-cover"
                      onError={e => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                    <div className="space-y-2">
                      <div>
                        <span className={` font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                          Current alt:
                        </span>
                        <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                          {image.currentAlt || 'No alt text'}
                        </p>
                      </div>
                      {image.generatedAlt && (
                        <div>
                          <span className={`text-xs font-medium ${isDarkMode ? 'text-green-400' : 'text-green-600'}`}>
                            Generated alt:
                          </span>
                          <p className={`text-xs ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                            {image.generatedAlt}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )} */}
    </div>
  );
};

export default AccessibilityAnalyzer;
