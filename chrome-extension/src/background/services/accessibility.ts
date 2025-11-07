import { createLogger } from '../log';
import { createChatModel } from '../agent/helper';
import {
  agentModelStore,
  llmProviderStore,
  AgentNameEnum,
  ProviderTypeEnum,
  type ProviderConfig,
  type ModelConfig,
} from '@extension/storage';
import type BrowserContext from '../browser/context';
import { HumanMessage } from '@langchain/core/messages';
import { ReadabilityService } from './readability';

const logger = createLogger('AccessibilityService');

interface BasicImageInfo {
  imageUrl: string;
  currentAlt: string;
  selector: string;
  isMainContent: boolean;
  importanceScore: number;
}

export interface AccessibilityAnalysisResult {
  pageSummary: string;
  imageAnalysis: Array<{
    imageUrl: string;
    currentAlt: string;
    generatedAlt?: string;
  }>;
}

export class AccessibilityService {
  private browserContext: BrowserContext;
  private readabilityService: ReadabilityService;

  constructor(browserContext: BrowserContext) {
    this.browserContext = browserContext;
    this.readabilityService = new ReadabilityService();
  }

  /**
   * Extract images from a web page with basic heuristic scoring
   */
  async extractImages(tabId: number): Promise<BasicImageInfo[]> {
    try {
      logger.info('Extracting images from tab:', tabId);

      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          interface BasicImageInfo {
            imageUrl: string;
            currentAlt: string;
            selector: string;
            isMainContent: boolean;
            importanceScore: number;
          }

          // Helper: Check if URL is a valid image
          const isValidImageUrl = (url: string): boolean => {
            if (!url || url.length === 0) return false;

            // Exclude SVGs and common ad patterns
            if (url.includes('.svg') || url.includes('data:image/svg')) return false;
            if (url.includes('/ad/') || url.includes('/ads/') || url.includes('advertisement')) return false;
            if (url.includes('banner') || url.includes('tracking')) return false;

            // Accept standard image formats
            return (
              url.includes('image') ||
              url.includes('http') ||
              url.includes('jpg') ||
              url.includes('jpeg') ||
              url.includes('png') ||
              url.includes('webp')
            );
          };

          // Helper: Extract URL from CSS background-image property
          const extractBackgroundImageUrl = (element: Element): string | null => {
            const style = window.getComputedStyle(element);
            const bgImage = style.backgroundImage;

            if (!bgImage || bgImage === 'none') return null;

            // Extract URL from url("...") or url('...')
            const urlMatch = bgImage.match(/url\(['"]?([^'"]+)['"]?\)/);
            if (!urlMatch) return null;

            const url = urlMatch[1];
            return isValidImageUrl(url) ? url : null;
          };

          // Helper: Generate CSS selector for an element
          const generateSelector = (element: Element): string => {
            if (element.id) {
              return `#${element.id}`;
            }

            const path: string[] = [];
            let current: Element | null = element;

            while (current && current !== document.body) {
              let selector = current.tagName.toLowerCase();

              if (current.className && typeof current.className === 'string') {
                const classes = current.className.trim().split(/\s+/).slice(0, 2); // Use first 2 classes
                if (classes.length > 0) {
                  selector += `.${classes.join('.')}`;
                }
              }

              path.unshift(selector);
              current = current.parentElement;

              // Limit depth
              if (path.length >= 5) break;
            }

            return path.join(' > ');
          };

          // Helper: Check if element is in main content area
          const isInMainContent = (element: Element): boolean => {
            let current: Element | null = element;

            while (current) {
              const tagName = current.tagName.toLowerCase();
              const className = current.className?.toString().toLowerCase() || '';
              const id = current.id?.toLowerCase() || '';

              // Check for main content indicators
              if (
                tagName === 'main' ||
                tagName === 'article' ||
                className.includes('main') ||
                className.includes('content') ||
                className.includes('article') ||
                id.includes('main') ||
                id.includes('content')
              ) {
                return true;
              }

              // Check for non-content areas
              if (
                tagName === 'nav' ||
                tagName === 'aside' ||
                tagName === 'footer' ||
                tagName === 'header' ||
                className.includes('sidebar') ||
                className.includes('menu') ||
                className.includes('nav') ||
                className.includes('ad') ||
                className.includes('banner')
              ) {
                return false;
              }

              current = current.parentElement;
            }

            return false;
          };

          // Helper: Calculate importance score based on image attributes
          const calculateImportanceScore = (element: Element, isMain: boolean): number => {
            let score = isMain ? 50 : 0;

            // Size considerations
            if (element instanceof HTMLImageElement) {
              const width = element.naturalWidth || element.width;
              const height = element.naturalHeight || element.height;

              // Prefer larger images
              if (width > 300 && height > 200) score += 30;
              else if (width > 150 && height > 100) score += 15;

              // Penalize tiny images (likely icons or tracking pixels)
              if (width < 50 || height < 50) score -= 30;
            }

            // Check for hero/featured class names
            const className = element.className?.toString().toLowerCase() || '';
            if (
              className.includes('hero') ||
              className.includes('featured') ||
              className.includes('main') ||
              className.includes('primary')
            ) {
              score += 25;
            }

            // Check if inside a figure tag (semantic indicator)
            if (element.closest('figure')) {
              score += 15;
            }

            return Math.max(0, Math.min(100, score));
          };

          const images: BasicImageInfo[] = [];
          const processedUrls = new Set<string>();

          // Extract <img> elements
          const imgElements = document.querySelectorAll('img');
          imgElements.forEach(img => {
            const src = img.src || img.getAttribute('data-src') || img.getAttribute('data-lazy-src');

            if (!src || !isValidImageUrl(src)) return;
            if (processedUrls.has(src)) return;

            processedUrls.add(src);

            const isMain = isInMainContent(img);
            const importanceScore = calculateImportanceScore(img, isMain);

            images.push({
              imageUrl: src,
              currentAlt: img.alt || '',
              selector: generateSelector(img),
              isMainContent: isMain,
              importanceScore,
            });
          });

          // Extract CSS background images from div elements
          const divElements = document.querySelectorAll('div');
          divElements.forEach(div => {
            const bgUrl = extractBackgroundImageUrl(div);

            if (!bgUrl) return;
            if (processedUrls.has(bgUrl)) return;

            // Check minimum size for background image divs
            const rect = div.getBoundingClientRect();
            if (rect.width < 50 || rect.height < 50) return;

            processedUrls.add(bgUrl);

            const isMain = isInMainContent(div);
            const importanceScore = calculateImportanceScore(div, isMain);

            // Background images often have additional context in aria-label
            const ariaLabel = div.getAttribute('aria-label') || '';

            images.push({
              imageUrl: bgUrl,
              currentAlt: ariaLabel,
              selector: generateSelector(div),
              isMainContent: isMain,
              importanceScore,
            });
          });

          // Sort by importance score (descending)
          images.sort((a, b) => b.importanceScore - a.importanceScore);

          return images;
        },
      });

      const images = results[0]?.result || [];
      logger.info('Extracted images:', { count: images.length });

      return images;
    } catch (error) {
      logger.error('Failed to extract images:', error);
      return [];
    }
  }

  /**
   * Extract and validate page content
   */
  private async extractPageContent(tabId: number) {
    const readabilityResult = await this.readabilityService.extractContent(tabId);
    if (!readabilityResult.success || !readabilityResult.article) {
      throw new Error('Failed to extract page content');
    }
    return readabilityResult.article;
  }

  /**
   * Retrieve and validate LLM configuration
   */
  private async getLLMConfiguration() {
    const providerConfig = await llmProviderStore.getProvider(ProviderTypeEnum.OpenAI);
    const modelConfig = await agentModelStore.getAgentModel(AgentNameEnum.Navigator);

    if (!providerConfig?.apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    if (!modelConfig) {
      throw new Error('Navigator model configuration not found');
    }

    return { providerConfig, modelConfig };
  }

  /**
   * Generate accessibility-focused page summary
   */
  private async generatePageSummary(
    article: { title: string; textContent: string },
    providerConfig: ProviderConfig,
    modelConfig: ModelConfig,
  ): Promise<string> {
    const model = createChatModel(providerConfig, modelConfig);
    const summaryPrompt = `Analyze the following web page content and provide a concise accessibility-focused summary (2-3 sentences) that describes the main purpose and key content of the page:

Title: ${article.title}
Content excerpt: ${article.textContent.substring(0, 1500)}...

Provide a clear, descriptive summary suitable for screen reader users.`;

    const summaryMessages = [new HumanMessage(summaryPrompt)];
    const summaryResponse = await model.invoke(summaryMessages);
    const pageSummary = summaryResponse.content.toString();

    logger.info('Generated page summary');
    return pageSummary;
  }

  /**
   * Fetch image from page and convert to base64
   */
  private async fetchImageAsBase64(tabId: number, imageUrl: string, selector: string): Promise<string | null> {
    try {
      logger.info('Fetching image as base64 from page:', { imageUrl: imageUrl.substring(0, 50) });

      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: async (imageUrl: string, selector: string) => {
          try {
            // Try to find the image element first
            const element = document.querySelector(selector);

            if (element instanceof HTMLImageElement && element.complete) {
              // Use canvas to convert image to base64
              const canvas = document.createElement('canvas');
              canvas.width = element.naturalWidth || element.width;
              canvas.height = element.naturalHeight || element.height;

              const ctx = canvas.getContext('2d');
              if (!ctx) throw new Error('Could not get canvas context');

              ctx.drawImage(element, 0, 0);

              // Convert to base64 (try JPEG first, fall back to PNG)
              try {
                return canvas.toDataURL('image/jpeg', 0.9);
              } catch {
                return canvas.toDataURL('image/png');
              }
            }

            // Fallback: fetch the image URL directly from the page context
            const response = await fetch(imageUrl);
            if (!response.ok) throw new Error(`Failed to fetch: ${response.status}`);

            const blob = await response.blob();
            return new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            });
          } catch (error) {
            console.error('[AccessibilityService] Failed to fetch image as base64:', error);
            return null;
          }
        },
        args: [imageUrl, selector],
      });

      const base64Data = results[0]?.result;
      if (base64Data) {
        logger.info('Successfully converted image to base64');
        return base64Data;
      }

      return null;
    } catch (error) {
      logger.error('Failed to fetch image as base64:', error);
      return null;
    }
  }

  /**
   * Generate alt text for a single image using vision model
   */
  private async generateAltTextForImage(
    tabId: number,
    image: BasicImageInfo,
    providerConfig: ProviderConfig,
    modelConfig: ModelConfig,
  ): Promise<{ imageUrl: string; currentAlt: string; generatedAlt?: string }> {
    try {
      const visionModel = createChatModel(providerConfig, modelConfig);

      // Try with direct URL first
      let visionMessages = [
        new HumanMessage({
          content: [
            {
              type: 'text',
              text: 'Generate a concise, descriptive alt text (1-2 sentences) for this image that would be useful for accessibility purposes. Focus on what is visually important and relevant to the page content. Do not include phrases like "image of" or "picture of".',
            },
            {
              type: 'image_url',
              image_url: {
                url: image.imageUrl,
              },
            },
          ],
        }),
      ];

      try {
        const visionResponse = await visionModel.invoke(visionMessages);
        const generatedAlt = visionResponse.content.toString().trim();

        await this.applyAltTextToDOM(tabId, image.selector, generatedAlt);

        logger.info('Generated alt text for image:', {
          imageUrl: image.imageUrl.substring(0, 50),
          altLength: generatedAlt.length,
        });

        return {
          imageUrl: image.imageUrl,
          currentAlt: image.currentAlt,
          generatedAlt,
        };
      } catch (error) {
        // Check if it's a 400 error (BadRequestError) indicating image download failure
        const is400Error =
          error instanceof Error &&
          (error.message.includes('400') ||
            error.message.includes('BadRequestError') ||
            error.message.includes('Error while downloading'));

        if (is400Error) {
          logger.warning('Image URL blocked by server, attempting base64 conversion:', {
            imageUrl: image.imageUrl.substring(0, 50),
          });

          // Try to fetch the image as base64 from the page context
          const base64Image = await this.fetchImageAsBase64(tabId, image.imageUrl, image.selector);

          if (base64Image) {
            logger.info('Retrying with base64 image');

            // Retry with base64 data URL
            visionMessages = [
              new HumanMessage({
                content: [
                  {
                    type: 'text',
                    text: 'Generate a concise, descriptive alt text (1-2 sentences) for this image that would be useful for accessibility purposes. Focus on what is visually important and relevant to the page content. Do not include phrases like "image of" or "picture of".',
                  },
                  {
                    type: 'image_url',
                    image_url: {
                      url: base64Image,
                    },
                  },
                ],
              }),
            ];

            const visionResponse = await visionModel.invoke(visionMessages);
            const generatedAlt = visionResponse.content.toString().trim();

            await this.applyAltTextToDOM(tabId, image.selector, generatedAlt);

            logger.info('Generated alt text for image using base64:', {
              imageUrl: image.imageUrl.substring(0, 50),
              altLength: generatedAlt.length,
            });

            return {
              imageUrl: image.imageUrl,
              currentAlt: image.currentAlt,
              generatedAlt,
            };
          } else {
            logger.error('Failed to convert image to base64, skipping image');
          }
        }

        // Re-throw if not a 400 error or base64 conversion failed
        throw error;
      }
    } catch (error) {
      logger.error('Failed to generate alt text for image:', {
        imageUrl: image.imageUrl.substring(0, 50),
        error,
      });

      return {
        imageUrl: image.imageUrl,
        currentAlt: image.currentAlt,
        generatedAlt: undefined,
      };
    }
  }

  /**
   * Analyze all images and generate alt text
   */
  private async analyzeImages(
    tabId: number,
    images: BasicImageInfo[],
    providerConfig: ProviderConfig,
    modelConfig: ModelConfig,
  ): Promise<Array<{ imageUrl: string; currentAlt: string; generatedAlt?: string }>> {
    const imageAnalysisPromises = images.map(image =>
      this.generateAltTextForImage(tabId, image, providerConfig, modelConfig),
    );

    const imageAnalysis = await Promise.all(imageAnalysisPromises);

    logger.info('Completed image analysis:', {
      imagesAnalyzed: imageAnalysis.filter(img => img.generatedAlt).length,
      totalImages: imageAnalysis.length,
    });

    return imageAnalysis;
  }

  /**
   * Perform accessibility analysis using direct LLM call (orchestrator method)
   */
  async analyzeAccessibility(tabId: number, url: string): Promise<AccessibilityAnalysisResult> {
    try {
      logger.info('Starting accessibility analysis for tab:', tabId, url);

      // Extract page content
      const article = await this.extractPageContent(tabId);

      // Extract images from the page
      const images = await this.extractImages(tabId);
      logger.info('Extracted images for analysis:', { count: images.length });

      // Get LLM configuration
      const { providerConfig, modelConfig } = await this.getLLMConfiguration();

      // Generate page summary
      const pageSummary = await this.generatePageSummary(article, providerConfig, modelConfig);

      // Analyze images and generate alt text
      const imageAnalysis = await this.analyzeImages(tabId, images, providerConfig, modelConfig);

      logger.info('Completed accessibility analysis:', {
        pageSummaryLength: pageSummary.length,
        imagesAnalyzed: imageAnalysis.filter(img => img.generatedAlt).length,
        totalImages: imageAnalysis.length,
      });

      return {
        pageSummary,
        imageAnalysis,
      };
    } catch (error) {
      logger.error('Accessibility analysis failed:', error);
      throw error;
    }
  }

  /**
   * Apply generated alt text to DOM element
   */
  private async applyAltTextToDOM(tabId: number, selector: string, altText: string): Promise<void> {
    try {
      logger.info('Applying alt text to DOM:', { selector, altText });
      await chrome.scripting.executeScript({
        target: { tabId },
        func: (selector: string, altText: string) => {
          try {
            const element = document.querySelector(selector);
            if (element) {
              if (element instanceof HTMLImageElement) {
                element.alt = `AI Generated: ${altText}`;
              } else {
                element.setAttribute('aria-label', `AI Generated: ${altText}` || altText);
              }
            } else {
              throw Error('Element not found');
            }
          } catch (error) {
            logger.error('[AccessibilityService] Failed to apply alt text:', error);
          }
        },
        args: [selector, altText],
      });
      logger.info('Alt text application script executed successfully');
    } catch (error) {
      logger.error('Failed to apply alt text to DOM:', { selector, error });
    }
  }
}
