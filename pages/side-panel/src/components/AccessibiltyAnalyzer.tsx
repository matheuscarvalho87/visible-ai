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
    selector: string;
  }[];
  linkAnalysis?: {
    linkUrl: string;
    linkText: string;
    currentTitle: string;
    generatedDescription?: string;
    selector: string;
  }[];
  buttonAnalysis?: {
    buttonText: string;
    currentAriaLabel: string;
    generatedDescription?: string;
    selector: string;
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
  analysisProgress?: string;
  fontSize?: number;
  // accessibilityResult?: string | null;
}

const AccessibilityAnalyzer: React.FC<AccessibilityAnalyzerProps> = ({
  currentPageData,
  onHandleStarBasicAnalysis,
  visible,
  isDarkMode = false,
  isAnalyzing = false,
  analysisProgress = '',
  fontSize = 100,
}) => {
  if (!visible || !currentPageData) return null;

  const handleHighlightElement = async (selector: string) => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab.id) {
        await chrome.tabs.sendMessage(tab.id, {
          type: 'highlight_element',
          selector: selector,
        });
      }
    } catch (error) {
      console.error('Error highlighting element:', error);
    }
  };

  return (
    <div style={{ fontSize: `${fontSize}%` }} className={`h-full overflow-y-auto px-4`}>
      {/* Analysis Button */}
      <div className="mb-4">
        <button
          onClick={onHandleStarBasicAnalysis}
          disabled={isAnalyzing}
          className={`w-full rounded-lg p-3 transition-all ${
            isDarkMode
              ? 'bg-blue-600 text-white hover:bg-blue-500 disabled:bg-blue-800'
              : 'bg-blue-500 text-white hover:bg-blue-600 disabled:bg-blue-300'
          } disabled:cursor-not-allowed`}
          title="Keyboard shortcut: Alt+Shift+A">
          {isAnalyzing
            ? 'Analyzing...'
            : currentPageData.pageSummary
              ? 'Re-analyze Accessibility (Alt+Shift+A)'
              : 'Improve Accessibility (Alt+Shift+A)'}
        </button>
      </div>
      {/* Progress Message */}
      {isAnalyzing && analysisProgress && (
        <div
          className={`mb-4 rounded-lg border p-3 backdrop-blur-sm ${isDarkMode ? 'border-blue-700 bg-blue-900/50' : 'border-blue-200 bg-blue-50'}`}>
          <div className="flex items-center">
            <div
              className={`mr-3 size-4 animate-spin rounded-full border-2 border-t-transparent ${isDarkMode ? 'border-blue-400' : 'border-blue-500'}`}></div>
            <p className={`text-sm ${isDarkMode ? 'text-blue-200' : 'text-blue-700'}`}>{analysisProgress}</p>
          </div>
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
        <div className={`rounded-lg ${isDarkMode ? 'bg-slate-800' : 'bg-white/50'} mb-4 p-4 backdrop-blur-sm`}>
          <h3 className={`mb-3 font-medium ${isDarkMode ? 'text-gray-200' : 'text-gray-900'}`}>
            Image Analysis ({currentPageData.imageAnalysis.length} images)
          </h3>
          <div className="space-y-3">
            {currentPageData.imageAnalysis.map((image, index) => (
              <div
                key={index}
                role="button"
                tabIndex={0}
                onClick={() => handleHighlightElement(image.selector)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleHighlightElement(image.selector);
                  }
                }}
                className={`cursor-pointer rounded-lg border p-3 transition-all hover:shadow-lg ${isDarkMode ? 'border-gray-600 hover:border-green-500' : 'border-gray-300 hover:border-green-500'}`}
                title="Click to highlight this element on the page"
                aria-label={`Highlight image: ${image.currentAlt || 'No alt text'}`}>
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
      {currentPageData.linkAnalysis && currentPageData.linkAnalysis.length > 0 && (
        <div className={`rounded-lg ${isDarkMode ? 'bg-slate-800' : 'bg-white/50'} mb-4 p-4 backdrop-blur-sm`}>
          <h3 className={`mb-3 font-medium ${isDarkMode ? 'text-gray-200' : 'text-gray-900'}`}>
            Link Analysis ({currentPageData.linkAnalysis.length} links)
          </h3>
          <div className="space-y-3">
            {currentPageData.linkAnalysis.map((link, index) => (
              <div
                key={index}
                role="button"
                tabIndex={0}
                onClick={() => handleHighlightElement(link.selector)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleHighlightElement(link.selector);
                  }
                }}
                className={`cursor-pointer rounded-lg border p-3 transition-all hover:shadow-lg ${isDarkMode ? 'border-gray-600 hover:border-green-500' : 'border-gray-300 hover:border-green-500'}`}
                title="Click to highlight this element on the page"
                aria-label={`Highlight link: ${link.linkText}`}>
                <div className="space-y-2">
                  <div>
                    <span className={` font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Link text:</span>
                    <p className={` ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>{link.linkText}</p>
                  </div>
                  <div>
                    <span className={` font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>URL:</span>
                    <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-600'} break-all`}>
                      {link.linkUrl}
                    </p>
                  </div>
                  <div>
                    <span className={` font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      Current title:
                    </span>
                    <p className={` ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                      {link.currentTitle || 'No title'}
                    </p>
                  </div>
                  {link.generatedDescription && (
                    <div>
                      <span className={` font-medium ${isDarkMode ? 'text-green-400' : 'text-green-600'}`}>
                        Generated description:
                      </span>
                      <p className={` ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                        {link.generatedDescription}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {currentPageData.buttonAnalysis && currentPageData.buttonAnalysis.length > 0 && (
        <div className={`rounded-lg ${isDarkMode ? 'bg-slate-800' : 'bg-white/50'} p-4 backdrop-blur-sm`}>
          <h3 className={`mb-3 font-medium ${isDarkMode ? 'text-gray-200' : 'text-gray-900'}`}>
            Button Analysis ({currentPageData.buttonAnalysis.length} buttons)
          </h3>
          <div className="space-y-3">
            {currentPageData.buttonAnalysis.map((button, index) => (
              <div
                key={index}
                role="button"
                tabIndex={0}
                onClick={() => handleHighlightElement(button.selector)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleHighlightElement(button.selector);
                  }
                }}
                className={`cursor-pointer rounded-lg border p-3 transition-all hover:shadow-lg ${isDarkMode ? 'border-gray-600 hover:border-green-500' : 'border-gray-300 hover:border-green-500'}`}
                title="Click to highlight this element on the page"
                aria-label={`Highlight button: ${button.buttonText || 'icon button'}`}>
                <div className="space-y-2">
                  <div>
                    <span className={` font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      Button text:
                    </span>
                    <p className={` ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                      {button.buttonText || '(No text - icon button)'}
                    </p>
                  </div>
                  <div>
                    <span className={` font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      Current aria-label:
                    </span>
                    <p className={` ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                      {button.currentAriaLabel || 'No aria-label'}
                    </p>
                  </div>
                  {button.generatedDescription && (
                    <div>
                      <span className={` font-medium ${isDarkMode ? 'text-green-400' : 'text-green-600'}`}>
                        Generated description:
                      </span>
                      <p className={` ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                        {button.generatedDescription}
                      </p>
                    </div>
                  )}
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
