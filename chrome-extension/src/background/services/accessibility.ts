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

interface BasicLinkInfo {
  linkUrl: string;
  linkText: string;
  currentTitle: string;
  selector: string;
  isMainContent: boolean;
  importanceScore: number;
}

interface BasicButtonInfo {
  buttonText: string;
  currentAriaLabel: string;
  selector: string;
  parentContext: string;
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
  linkAnalysis: Array<{
    linkUrl: string;
    linkText: string;
    currentTitle: string;
    generatedDescription?: string;
  }>;
  buttonAnalysis: Array<{
    buttonText: string;
    currentAriaLabel: string;
    generatedDescription?: string;
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
   * Extract links from a web page with metadata
   */
  async extractLinks(tabId: number): Promise<BasicLinkInfo[]> {
    try {
      logger.info('Extracting links from tab:', tabId);

      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          interface BasicLinkInfo {
            linkUrl: string;
            linkText: string;
            currentTitle: string;
            selector: string;
            isMainContent: boolean;
            importanceScore: number;
          }

          const isValidLink = (url: string): boolean => {
            if (!url || url.length === 0) return false;
            // Exclude hash links, javascript:, mailto:, tel:
            if (
              url.startsWith('#') ||
              url.startsWith('javascript:') ||
              url.startsWith('mailto:') ||
              url.startsWith('tel:')
            )
              return false;
            return true;
          };

          const generateSelector = (element: Element): string => {
            if (element.id) {
              return `#${element.id}`;
            }

            const path: string[] = [];
            let current: Element | null = element;

            while (current && current !== document.body) {
              let selector = current.tagName.toLowerCase();

              if (current.className && typeof current.className === 'string') {
                const classes = current.className.trim().split(/\s+/).slice(0, 2);
                if (classes.length > 0) {
                  selector += `.${classes.join('.')}`;
                }
              }

              path.unshift(selector);
              current = current.parentElement;

              if (path.length >= 5) break;
            }

            return path.join(' > ');
          };

          const isInMainContent = (element: Element): boolean => {
            let current: Element | null = element;

            while (current) {
              const tagName = current.tagName.toLowerCase();
              const className = current.className?.toString().toLowerCase() || '';
              const id = current.id?.toLowerCase() || '';

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

              if (
                tagName === 'nav' ||
                tagName === 'aside' ||
                tagName === 'footer' ||
                tagName === 'header' ||
                className.includes('sidebar') ||
                className.includes('menu') ||
                className.includes('nav')
              ) {
                return false;
              }

              current = current.parentElement;
            }

            return false;
          };

          const calculateImportanceScore = (element: HTMLAnchorElement, isMain: boolean): number => {
            let score = isMain ? 50 : 0;

            const className = element.className?.toString().toLowerCase() || '';
            if (
              className.includes('primary') ||
              className.includes('cta') ||
              className.includes('button') ||
              className.includes('btn')
            ) {
              score += 30;
            }

            // Check if link has meaningful text
            const text = element.textContent?.trim() || '';
            if (text.length > 3 && text.length < 100) {
              score += 20;
            } else if (text.length <= 3) {
              score -= 20;
            }

            // Penalize "read more" or "click here" type links
            if (
              text.toLowerCase() === 'read more' ||
              text.toLowerCase() === 'click here' ||
              text.toLowerCase() === 'more'
            ) {
              score -= 10;
            }

            return Math.max(0, Math.min(100, score));
          };

          const links: BasicLinkInfo[] = [];
          const processedSelectors = new Set<string>();

          const anchorElements = document.querySelectorAll('a[href]');
          anchorElements.forEach(anchor => {
            if (!(anchor instanceof HTMLAnchorElement)) return;

            const href = anchor.href;
            if (!isValidLink(href)) return;

            const selector = generateSelector(anchor);
            if (processedSelectors.has(selector)) return;
            processedSelectors.add(selector);

            const linkText = anchor.textContent?.trim() || '';
            if (!linkText) return; // Skip links with no text

            const isMain = isInMainContent(anchor);
            const importanceScore = calculateImportanceScore(anchor, isMain);

            links.push({
              linkUrl: href,
              linkText: linkText,
              currentTitle: anchor.title || '',
              selector: selector,
              isMainContent: isMain,
              importanceScore: importanceScore,
            });
          });

          // Sort by importance score (descending)
          links.sort((a, b) => b.importanceScore - a.importanceScore);

          // Limit to top 20 most important links
          return links.slice(0, 20);
        },
      });

      const links = results[0]?.result || [];
      logger.info('Extracted links:', { count: links.length });

      return links;
    } catch (error) {
      logger.error('Failed to extract links:', error);
      return [];
    }
  }

  /**
   * Extract buttons from a web page with parent context
   */
  async extractButtons(tabId: number): Promise<BasicButtonInfo[]> {
    try {
      logger.info('Extracting buttons from tab:', tabId);

      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          // This function runs in page context, so we need to redeclare types
          interface BasicButtonInfo {
            buttonText: string;
            currentAriaLabel: string;
            selector: string;
            parentContext: string;
            isMainContent: boolean;
            importanceScore: number;
          }

          const generateSelector = (element: Element): string => {
            if (element.id) {
              return `#${element.id}`;
            }

            const path: string[] = [];
            let current: Element | null = element;

            while (current && current !== document.body) {
              let selector = current.tagName.toLowerCase();

              if (current.className && typeof current.className === 'string') {
                const classes = current.className.trim().split(/\s+/).slice(0, 2);
                if (classes.length > 0) {
                  selector += `.${classes.join('.')}`;
                }
              }

              path.unshift(selector);
              current = current.parentElement;

              if (path.length >= 5) break;
            }

            return path.join(' > ');
          };

          const getParentContext = (element: Element): string => {
            const parent = element.parentElement;
            if (!parent) return '';

            // Get parent's text content excluding the button itself
            const parentText = Array.from(parent.childNodes)
              .filter(node => node !== element)
              .map(node => node.textContent?.trim() || '')
              .join(' ')
              .trim();

            // Also get any sibling elements that might provide context
            const siblings = Array.from(parent.children)
              .filter(child => child !== element)
              .map(child => child.textContent?.trim() || '')
              .join(' ')
              .trim();

            const context = [parentText, siblings].filter(Boolean).join(' ').substring(0, 200);
            return context;
          };

          const isInMainContent = (element: Element): boolean => {
            let current: Element | null = element;

            while (current) {
              const tagName = current.tagName.toLowerCase();
              const className = current.className?.toString().toLowerCase() || '';
              const id = current.id?.toLowerCase() || '';

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

              if (
                tagName === 'nav' ||
                tagName === 'aside' ||
                tagName === 'footer' ||
                tagName === 'header' ||
                className.includes('sidebar') ||
                className.includes('menu') ||
                className.includes('nav')
              ) {
                return false;
              }

              current = current.parentElement;
            }

            return false;
          };

          const calculateImportanceScore = (element: Element, isMain: boolean, hasAriaLabel: boolean): number => {
            let score = isMain ? 50 : 0;

            const className = element.className?.toString().toLowerCase() || '';
            if (className.includes('primary') || className.includes('cta') || className.includes('submit')) {
              score += 30;
            }

            // Penalize if button already has good aria-label
            if (hasAriaLabel) {
              score -= 20;
            }

            // Check if button has meaningful text
            const text = element.textContent?.trim() || '';
            if (text.length > 0 && text.length < 50) {
              score += 20;
            } else if (text.length === 0) {
              score += 30; // Icon buttons without text are more important
            }

            return Math.max(0, Math.min(100, score));
          };

          const buttons: BasicButtonInfo[] = [];
          const processedSelectors = new Set<string>();

          // Extract <button> elements and elements with role="button"
          const buttonElements = document.querySelectorAll(
            'button, [role="button"], input[type="button"], input[type="submit"]',
          );
          buttonElements.forEach(button => {
            const selector = generateSelector(button);
            if (processedSelectors.has(selector)) return;
            processedSelectors.add(selector);

            const buttonText = button.textContent?.trim() || '';
            const ariaLabel = button.getAttribute('aria-label') || '';
            const hasAriaLabel = ariaLabel.length > 0 && ariaLabel !== buttonText;

            const parentContext = getParentContext(button);
            const isMain = isInMainContent(button);
            const importanceScore = calculateImportanceScore(button, isMain, hasAriaLabel);

            buttons.push({
              buttonText: buttonText,
              currentAriaLabel: ariaLabel,
              selector: selector,
              parentContext: parentContext,
              isMainContent: isMain,
              importanceScore: importanceScore,
            });
          });

          // Sort by importance score (descending)
          buttons.sort((a, b) => b.importanceScore - a.importanceScore);

          // Limit to top 15 most important buttons
          return buttons.slice(0, 15);
        },
      });

      const buttons = results[0]?.result || [];
      logger.info('Extracted buttons:', { count: buttons.length });

      return buttons;
    } catch (error) {
      logger.error('Failed to extract buttons:', error);
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
              type: 'text',
              text: 'Image Older ALt: , summary of article: ',
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
   * Fetch metadata from link URL
   */
  private async fetchLinkMetadata(linkUrl: string): Promise<{ title?: string; description?: string } | null> {
    try {
      const response = await fetch(linkUrl, {
        method: 'HEAD',
        redirect: 'follow',
      });

      if (!response.ok) {
        logger.info('HEAD request failed, trying GET for metadata:', linkUrl.substring(0, 50));

        const getResponse = await fetch(linkUrl, {
          method: 'GET',
          redirect: 'follow',
        });

        if (!getResponse.ok) {
          return null;
        }

        const html = await getResponse.text();

        // Parse metadata from HTML
        const titleMatch =
          html.match(/<meta\s+(?:property="og:title"|name="twitter:title")\s+content="([^"]+)"/i) ||
          html.match(/<title>([^<]+)<\/title>/i);
        const descMatch = html.match(
          /<meta\s+(?:property="og:description"|name="(?:twitter:)?description")\s+content="([^"]+)"/i,
        );

        return {
          title: titleMatch ? titleMatch[1] : undefined,
          description: descMatch ? descMatch[1] : undefined,
        };
      }

      return null;
    } catch (error) {
      logger.error('Failed to fetch link metadata:', { linkUrl: linkUrl.substring(0, 50), error });
      return null;
    }
  }

  /**
   * Generate description for a single link, trying metadata first, then AI
   */
  private async generateLinkDescription(
    tabId: number,
    link: BasicLinkInfo,
    providerConfig: ProviderConfig,
    modelConfig: ModelConfig,
    pageSummary: string,
  ): Promise<{ linkUrl: string; linkText: string; currentTitle: string; generatedDescription?: string }> {
    try {
      // First, try to get metadata from the link URL
      const metadata = await this.fetchLinkMetadata(link.linkUrl);

      if (metadata && (metadata.title || metadata.description)) {
        const generatedDescription = metadata.description || metadata.title || '';

        if (generatedDescription.length > 0) {
          await this.applyLinkTitleToDOM(tabId, link.selector, generatedDescription);

          logger.info('Used metadata for link description:', {
            linkText: link.linkText.substring(0, 30),
            descriptionLength: generatedDescription.length,
          });

          return {
            linkUrl: link.linkUrl,
            linkText: link.linkText,
            currentTitle: link.currentTitle,
            generatedDescription,
          };
        }
      }

      // If no metadata, use AI to generate description
      const model = createChatModel(providerConfig, modelConfig);

      const linkPrompt = `Given the following link from a web page, generate a concise, descriptive title attribute (1 sentence) that would help screen reader users understand where the link leads and why it's relevant.

Page context: ${pageSummary.substring(0, 300)}

Link text: "${link.linkText}"
Link URL: ${link.linkUrl}
Current title: "${link.currentTitle}"

Generate a clear, informative title that complements the link text without being redundant. If the link text is already descriptive, enhance it with destination or purpose information. Do not include phrases like "link to" or "this will take you to".`;

      const messages = [new HumanMessage(linkPrompt)];
      const response = await model.invoke(messages);
      const generatedDescription = response.content.toString().trim();

      await this.applyLinkTitleToDOM(tabId, link.selector, generatedDescription);

      logger.info('Generated AI description for link:', {
        linkText: link.linkText.substring(0, 30),
        descriptionLength: generatedDescription.length,
      });

      return {
        linkUrl: link.linkUrl,
        linkText: link.linkText,
        currentTitle: link.currentTitle,
        generatedDescription,
      };
    } catch (error) {
      logger.error('Failed to generate link description:', {
        linkText: link.linkText.substring(0, 30),
        error,
      });

      return {
        linkUrl: link.linkUrl,
        linkText: link.linkText,
        currentTitle: link.currentTitle,
        generatedDescription: undefined,
      };
    }
  }

  /**
   * Generate description for a single button using AI with parent context
   */
  private async generateButtonDescription(
    tabId: number,
    button: BasicButtonInfo,
    providerConfig: ProviderConfig,
    modelConfig: ModelConfig,
    pageSummary: string,
  ): Promise<{ buttonText: string; currentAriaLabel: string; generatedDescription?: string }> {
    try {
      const model = createChatModel(providerConfig, modelConfig);

      const buttonPrompt = `Given the following button from a web page, generate a concise, descriptive aria-label (1 sentence) that would help screen reader users understand the button's purpose and action.

Page context: ${pageSummary.substring(0, 300)}

Button text: "${button.buttonText}"
Current aria-label: "${button.currentAriaLabel}"
Parent context: "${button.parentContext}"

Generate a clear, actionable aria-label that describes what will happen when the button is clicked. Use the parent context to infer the button's purpose if the button text is vague or missing. Do not include the word "button" in the description.`;

      const messages = [new HumanMessage(buttonPrompt)];
      const response = await model.invoke(messages);
      const generatedDescription = response.content.toString().trim();

      await this.applyButtonAriaLabelToDOM(tabId, button.selector, generatedDescription);

      logger.info('Generated description for button:', {
        buttonText: button.buttonText.substring(0, 30),
        descriptionLength: generatedDescription.length,
      });

      return {
        buttonText: button.buttonText,
        currentAriaLabel: button.currentAriaLabel,
        generatedDescription,
      };
    } catch (error) {
      logger.error('Failed to generate button description:', {
        buttonText: button.buttonText.substring(0, 30),
        error,
      });

      return {
        buttonText: button.buttonText,
        currentAriaLabel: button.currentAriaLabel,
        generatedDescription: undefined,
      };
    }
  }

  /**
   * Analyze all links and generate descriptions
   */
  private async analyzeLinks(
    tabId: number,
    links: BasicLinkInfo[],
    providerConfig: ProviderConfig,
    modelConfig: ModelConfig,
    pageSummary: string,
  ): Promise<Array<{ linkUrl: string; linkText: string; currentTitle: string; generatedDescription?: string }>> {
    const linkAnalysisPromises = links.map(link =>
      this.generateLinkDescription(tabId, link, providerConfig, modelConfig, pageSummary),
    );

    const linkAnalysis = await Promise.all(linkAnalysisPromises);

    logger.info('Completed link analysis:', {
      linksAnalyzed: linkAnalysis.filter(link => link.generatedDescription).length,
      totalLinks: linkAnalysis.length,
    });

    return linkAnalysis;
  }

  /**
   * Analyze all buttons and generate descriptions
   */
  private async analyzeButtons(
    tabId: number,
    buttons: BasicButtonInfo[],
    providerConfig: ProviderConfig,
    modelConfig: ModelConfig,
    pageSummary: string,
  ): Promise<Array<{ buttonText: string; currentAriaLabel: string; generatedDescription?: string }>> {
    const buttonAnalysisPromises = buttons.map(button =>
      this.generateButtonDescription(tabId, button, providerConfig, modelConfig, pageSummary),
    );

    const buttonAnalysis = await Promise.all(buttonAnalysisPromises);

    logger.info('Completed button analysis:', {
      buttonsAnalyzed: buttonAnalysis.filter(btn => btn.generatedDescription).length,
      totalButtons: buttonAnalysis.length,
    });

    return buttonAnalysis;
  }

  /**
   * Perform accessibility analysis using direct LLM call (orchestrator method)
   */
  async analyzeAccessibility(
    tabId: number,
    url: string,
    progressCallback?: (message: string) => void,
  ): Promise<AccessibilityAnalysisResult> {
    try {
      logger.info('Starting accessibility analysis for tab:', tabId, url);

      progressCallback?.('Extracting page content...');
      // Extract page content
      const article = await this.extractPageContent(tabId);

      progressCallback?.('Extracting images from page (Top 10 - DEMO mode)...');
      // Extract images, links, and buttons from the page
      const images = (await this.extractImages(tabId)).slice(0, 10).reverse;

      progressCallback?.('Extracting links from page (Top 10 - DEMO mode)...');
      const links = (await this.extractLinks(tabId)).slice(0, 10).reverse();

      progressCallback?.('Extracting buttons from page (Top 10 - DEMO mode)...');
      const buttons = (await this.extractButtons(tabId)).slice(0, 10).reverse();

      logger.info('Extracted elements for analysis:', {
        images: images.length,
        links: links.length,
        buttons: buttons.length,
      });

      progressCallback?.('Configuring AI model...');
      // Get LLM configuration
      const { providerConfig, modelConfig } = await this.getLLMConfiguration();

      progressCallback?.('Generating page summary...');
      // Generate page summary
      const pageSummary = await this.generatePageSummary(article, providerConfig, modelConfig);

      progressCallback?.(`Analyzing ${images.length} images with AI vision...`);
      // Analyze images and generate alt text
      const imageAnalysis = await this.analyzeImages(tabId, images, providerConfig, modelConfig);

      progressCallback?.(`Analyzing ${links.length} links...`);
      // Analyze links and generate descriptions
      const linkAnalysis = await this.analyzeLinks(tabId, links, providerConfig, modelConfig, pageSummary);

      progressCallback?.(`Analyzing ${buttons.length} buttons...`);
      // Analyze buttons and generate descriptions
      const buttonAnalysis = await this.analyzeButtons(tabId, buttons, providerConfig, modelConfig, pageSummary);

      progressCallback?.('Finalizing accessibility report...');

      logger.info('Completed accessibility analysis:', {
        pageSummaryLength: pageSummary.length,
        imagesAnalyzed: imageAnalysis.filter(img => img.generatedAlt).length,
        totalImages: imageAnalysis.length,
        linksAnalyzed: linkAnalysis.filter(link => link.generatedDescription).length,
        totalLinks: linkAnalysis.length,
        buttonsAnalyzed: buttonAnalysis.filter(btn => btn.generatedDescription).length,
        totalButtons: buttonAnalysis.length,
      });

      return {
        pageSummary,
        imageAnalysis,
        linkAnalysis,
        buttonAnalysis,
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
            console.error('[AccessibilityService] Failed to apply alt text:', error);
          }
        },
        args: [selector, altText],
      });
      logger.info('Alt text application script executed successfully');
    } catch (error) {
      logger.error('Failed to apply alt text to DOM:', { selector, error });
    }
  }

  /**
   * Apply generated title to link DOM element
   */
  private async applyLinkTitleToDOM(tabId: number, selector: string, title: string): Promise<void> {
    try {
      logger.info('Applying title to link:', { selector, title });
      await chrome.scripting.executeScript({
        target: { tabId },
        func: (selector: string, title: string) => {
          try {
            const element = document.querySelector(selector);
            if (element && element instanceof HTMLAnchorElement) {
              element.title = `AI Generated: ${title}`;
            } else {
              throw Error('Link element not found');
            }
          } catch (error) {
            console.error('[AccessibilityService] Failed to apply link title:', error);
          }
        },
        args: [selector, title],
      });
      logger.info('Link title application script executed successfully');
    } catch (error) {
      logger.error('Failed to apply link title to DOM:', { selector, error });
    }
  }

  /**
   * Apply generated aria-label to button DOM element
   */
  private async applyButtonAriaLabelToDOM(tabId: number, selector: string, ariaLabel: string): Promise<void> {
    try {
      logger.info('Applying aria-label to button:', { selector, ariaLabel });
      await chrome.scripting.executeScript({
        target: { tabId },
        func: (selector: string, ariaLabel: string) => {
          try {
            const element = document.querySelector(selector);
            if (element) {
              element.setAttribute('aria-label', `AI Generated: ${ariaLabel}`);
            } else {
              throw Error('Button element not found');
            }
          } catch (error) {
            console.error('[AccessibilityService] Failed to apply button aria-label:', error);
          }
        },
        args: [selector, ariaLabel],
      });
      logger.info('Button aria-label application script executed successfully');
    } catch (error) {
      logger.error('Failed to apply button aria-label to DOM:', { selector, error });
    }
  }
}
