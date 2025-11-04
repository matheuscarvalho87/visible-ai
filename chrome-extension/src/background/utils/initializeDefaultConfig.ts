import { llmProviderStore, agentModelStore, AgentNameEnum, ProviderTypeEnum } from '@extension/storage';
import { getDefaultProviderConfig } from '@extension/storage/lib/settings/llmProviders';
import type { ProviderConfig, ModelConfig } from '@extension/storage';

/**
 * Initializes default LLM provider and agent models from environment variables
 * Only runs if DEFAULT_OPENAI_KEY is set in .env and storage is empty
 */
export async function initializeDefaultConfig(): Promise<void> {
  try {
    // Check if DEFAULT_OPENAI_KEY is available in environment
    const defaultOpenAIKey = import.meta.env.DEFAULT_OPENAI_KEY;

    // Exit early if no default key is provided
    if (!defaultOpenAIKey || defaultOpenAIKey.trim() === '') {
      console.log('[initializeDefaultConfig] No DEFAULT_OPENAI_KEY found in environment, skipping preset');
      return;
    }

    // Check if OpenAI provider already exists
    const hasOpenAI = await llmProviderStore.hasProvider(ProviderTypeEnum.OpenAI);

    if (hasOpenAI) {
      console.log('[initializeDefaultConfig] OpenAI provider already configured, skipping preset');
      return;
    }

    console.log('[initializeDefaultConfig] Setting up default OpenAI provider with gpt-5-mini');

    // Create default OpenAI provider config
    const openAIConfig: ProviderConfig = {
      ...getDefaultProviderConfig(ProviderTypeEnum.OpenAI),
      apiKey: defaultOpenAIKey,
      modelNames: ['gpt-5-mini'], // Set gpt-5-mini as the default model
    };

    // Save OpenAI provider
    await llmProviderStore.setProvider(ProviderTypeEnum.OpenAI, openAIConfig);
    console.log('[initializeDefaultConfig] OpenAI provider saved successfully');

    // Configure Navigator agent with gpt-5-mini
    const navigatorConfig: ModelConfig = {
      provider: ProviderTypeEnum.OpenAI,
      modelName: 'gpt-5-mini',
    };
    await agentModelStore.setAgentModel(AgentNameEnum.Navigator, navigatorConfig);
    console.log('[initializeDefaultConfig] Navigator agent configured with gpt-5-mini');

    // Configure Planner agent with gpt-5-mini
    const plannerConfig: ModelConfig = {
      provider: ProviderTypeEnum.OpenAI,
      modelName: 'gpt-5-mini',
    };
    await agentModelStore.setAgentModel(AgentNameEnum.Planner, plannerConfig);
    console.log('[initializeDefaultConfig] Planner agent configured with gpt-5-mini');

    console.log('[initializeDefaultConfig] Default configuration completed successfully');
  } catch (error) {
    console.error('[initializeDefaultConfig] Failed to initialize default config:', error);
    // Don't throw - allow extension to continue even if preset fails
  }
}
