import '@src/Popup.css';
import { useStorage, withErrorBoundary, withSuspense } from '@extension/shared';
import { exampleThemeStorage } from '@extension/storage';
import { t } from '@extension/i18n';
import { ToggleButton } from '@extension/ui';
import { useState, useEffect, useRef } from 'react';

// 定义AI提供商类型
type AIProvider = {
  id: string;
  name: string;
  apiKey?: string; // 改为可选，因为每个实例会有自己的 apiKey
  baseUrl: string;
  model: string;
  systemPrompt?: string;
  modelConfig?: {
    temperature: number;
    top_p: number;
    max_tokens: number;
    presence_penalty?: number;
    frequency_penalty?: number;
  };
  isGemini?: boolean; // 添加标识符
};

const defaultProviders: AIProvider[] = [
  {
    id: 'deepseek-r1',
    name: 'DeepSeek R1',
    baseUrl: 'https://api.deepseek.com/v1/chat/completions',
    model: 'deepseek-reasoner',
    systemPrompt: ``,
    modelConfig: {
      temperature: 0.2,
      top_p: 0.1,
      max_tokens: 4000,
      presence_penalty: 0.1,
      frequency_penalty: 0.1,
    },
  },
  {
    id: 'deepseek-v3',
    name: 'DeepSeek V3',
    baseUrl: 'https://api.deepseek.com/v1/chat/completions',
    model: 'deepseek-chat',
    systemPrompt: '',
    modelConfig: {
      temperature: 0.7,
      top_p: 0.9,
      max_tokens: 2000,
    },
  },
  {
    id: 'aliyun-r1',
    name: '阿里云 R1',
    baseUrl: 'https://api.aliyun.com/v1/chat/completions',
    model: 'aliyun-reasoner',
    systemPrompt: ``,
    modelConfig: {
      temperature: 0.2,
      top_p: 0.1,
      max_tokens: 4000,
    },
  },
  {
    id: 'tencent-r1',
    name: '腾讯云 R1',
    baseUrl: 'https://api.tencent.com/v1/chat/completions',
    model: 'tencent-reasoner',
    systemPrompt: ``,
    modelConfig: {
      temperature: 0.2,
      top_p: 0.1,
      max_tokens: 4000,
    },
  },
  {
    id: 'guiji-r1',
    name: '硅基流动 R1',
    baseUrl: 'https://api.guiji.ai/v1/chat/completions',
    model: 'guiji-reasoner',
    systemPrompt: `。`,
    modelConfig: {
      temperature: 0.2,
      top_p: 0.1,
      max_tokens: 4000,
    },
  },
  {
    id: 'gemini-flash',
    name: 'Gemini 2 Flash',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
    model: 'gemini-2.0-flash',
    isGemini: true,
    modelConfig: {
      temperature: 0.7,
      top_p: 0.9,
      max_tokens: 2000,
    },
  },
];

const Popup = () => {
  const theme = useStorage(exampleThemeStorage);
  const isLight = theme === 'light';
  const [showSettings, setShowSettings] = useState(false);
  const [messages, setMessages] = useState<Array<{ type: 'user' | 'ai'; content: string }>>([]);
  const [inputText, setInputText] = useState('');
  const [selectedProvider, setSelectedProvider] = useState(defaultProviders[0]);
  const [providerApiKeys, setProviderApiKeys] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [currentStreamingMessage, setCurrentStreamingMessage] = useState('');
  const abortControllerRef = useRef<AbortController | null>(null);

  // 从 storage 加载所有 API keys
  useEffect(() => {
    chrome.storage.local.get(['providerApiKeys'], result => {
      if (result.providerApiKeys) {
        setProviderApiKeys(result.providerApiKeys);
      }
    });
  }, []);

  // 从 storage 加载聊天记录
  useEffect(() => {
    chrome.storage.local.get(['chatHistory'], result => {
      if (result.chatHistory) {
        setMessages(result.chatHistory);
      }
    });
  }, []);

  // 监听消息变化并保存
  useEffect(() => {
    if (messages.length > 0) {
      chrome.storage.local.set({ chatHistory: messages });
    }
  }, [messages]);

  // 保存特定提供商的 API key
  const handleSaveApiKey = (providerId: string, apiKey: string) => {
    const newProviderApiKeys = { ...providerApiKeys, [providerId]: apiKey };
    setProviderApiKeys(newProviderApiKeys);
    chrome.storage.local.set({ providerApiKeys: newProviderApiKeys });
  };

  // 修改清除对话历史函数，同时清除存储
  const handleClearChat = () => {
    setMessages([]);
    setCurrentStreamingMessage('');
    chrome.storage.local.remove(['chatHistory']);
  };

  const handleSend = async () => {
    const currentApiKey = providerApiKeys[selectedProvider.id];
    if (!inputText.trim() || !currentApiKey) return;

    setMessages(prev => [...prev, { type: 'user', content: inputText }]);
    setIsLoading(true);
    setCurrentStreamingMessage('');

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();

    try {
      if (selectedProvider.isGemini) {
        // Gemini API 特定处理
        const requestBody = {
          contents: [
            {
              parts: [{ text: inputText }],
            },
          ],
          generationConfig: {
            temperature: selectedProvider.modelConfig?.temperature,
            topP: selectedProvider.modelConfig?.top_p,
            maxOutputTokens: selectedProvider.modelConfig?.max_tokens,
          },
        };

        const response = await fetch(`${selectedProvider.baseUrl}?key=${currentApiKey}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => null);
          throw new Error(
            `Gemini API error! status: ${response.status}${
              errorData ? `, message: ${errorData.error?.message || JSON.stringify(errorData)}` : ''
            }`,
          );
        }

        const data = await response.json();
        const content = data.candidates[0]?.content?.parts[0]?.text || '';

        setMessages(prev => [...prev, { type: 'ai', content }]);
      } else {
        // 原有的其他 API 处理逻辑
        const messageHistory = messages.map(msg => ({
          role: msg.type === 'user' ? 'user' : 'assistant',
          content: msg.content,
        }));

        const requestBody = {
          model: selectedProvider.model,
          messages: [
            selectedProvider.systemPrompt ? { role: 'system', content: selectedProvider.systemPrompt } : null,
            ...messageHistory,
            { role: 'user', content: inputText },
          ].filter(Boolean),
          ...selectedProvider.modelConfig,
          stream: true,
        };

        const response = await fetch(`${selectedProvider.baseUrl}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${currentApiKey}`,
            Accept: 'text/event-stream',
          },
          body: JSON.stringify(requestBody),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => null);
          throw new Error(
            `HTTP error! status: ${response.status}${errorData ? `, message: ${errorData.error?.message || JSON.stringify(errorData)}` : ''}`,
          );
        }

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        if (!reader) {
          throw new Error('Response body is null');
        }

        let streamedContent = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') continue;

              try {
                const parsed = JSON.parse(data);
                const content = parsed.choices[0]?.delta?.content || '';
                streamedContent += content;
                setCurrentStreamingMessage(streamedContent);
              } catch (e) {
                console.error('解析流式数据错误:', e);
              }
            }
          }
        }

        // 流式响应完成后，添加完整消息
        setMessages(prev => [...prev, { type: 'ai', content: streamedContent }]);
        setCurrentStreamingMessage('');
      }
    } catch (error) {
      console.error('API 调用错误:', error);
      setMessages(prev => [
        ...prev,
        {
          type: 'ai',
          content: `错误: ${error.message || '发生了错误，请稍后重试。'}`,
        },
      ]);
    } finally {
      setIsLoading(false);
      setInputText('');
      abortControllerRef.current = null;
    }
  };

  // 对提供商进行分类
  const categorizedProviders = {
    reasoning: defaultProviders.filter(p => p.id.includes('r1')),
    chat: defaultProviders.filter(p => !p.id.includes('r1')),
  };

  return (
    <div className={`w-[360px] h-[520px] ${isLight ? 'bg-slate-50' : 'bg-gray-800'}`}>
      {/* 顶部导航栏 */}
      <div
        className={`h-16 px-4 flex items-center justify-between border-b ${
          isLight ? 'border-gray-200' : 'border-gray-700'
        }`}>
        <div className="flex items-center gap-2">
          <ToggleButton />
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={`p-2 rounded-lg ${isLight ? 'hover:bg-gray-100' : 'hover:bg-gray-700'} transition-colors`}
            title="设置">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>

        {/* 添加清除按钮 */}
        <button
          onClick={handleClearChat}
          className={`p-2 rounded-lg ${isLight ? 'hover:bg-gray-100' : 'hover:bg-gray-700'} transition-colors`}
          title="清除对话">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
            />
          </svg>
        </button>
      </div>

      {/* 设置面板 */}
      {showSettings && (
        <div
          className={`absolute top-16 right-4 w-72 p-4 rounded-lg shadow-lg ${isLight ? 'bg-white' : 'bg-gray-700'}`}>
          <h2 className={`text-lg font-semibold mb-4 ${isLight ? 'text-gray-900' : 'text-gray-100'}`}>设置</h2>

          {/* 推理模型组 */}
          <div className="mb-4">
            <h3 className={`text-sm font-medium mb-2 ${isLight ? 'text-gray-700' : 'text-gray-300'}`}>推理模型</h3>
            <div className="space-y-4">
              {categorizedProviders.reasoning.map(provider => (
                <div key={provider.id} className="space-y-2">
                  <div className="flex items-center">
                    <input
                      type="radio"
                      id={provider.id}
                      name="ai-provider"
                      checked={selectedProvider.id === provider.id}
                      onChange={() => setSelectedProvider(provider)}
                      className="mr-2"
                    />
                    <label htmlFor={provider.id} className={`text-sm ${isLight ? 'text-gray-700' : 'text-gray-300'}`}>
                      {provider.name}
                    </label>
                  </div>
                  <input
                    type="password"
                    value={providerApiKeys[provider.id] || ''}
                    onChange={e => handleSaveApiKey(provider.id, e.target.value)}
                    placeholder={`输入 ${provider.name} API Key`}
                    className={`w-full p-2 text-sm rounded border ${
                      isLight ? 'border-gray-200' : 'border-gray-600'
                    } focus:outline-none focus:ring-1 focus:ring-blue-500`}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* 对话模型组 */}
          <div>
            <h3 className={`text-sm font-medium mb-2 ${isLight ? 'text-gray-700' : 'text-gray-300'}`}>对话模型</h3>
            <div className="space-y-4">
              {categorizedProviders.chat.map(provider => (
                <div key={provider.id} className="space-y-2">
                  <div className="flex items-center">
                    <input
                      type="radio"
                      id={provider.id}
                      name="ai-provider"
                      checked={selectedProvider.id === provider.id}
                      onChange={() => setSelectedProvider(provider)}
                      className="mr-2"
                    />
                    <label htmlFor={provider.id} className={`text-sm ${isLight ? 'text-gray-700' : 'text-gray-300'}`}>
                      {provider.name}
                    </label>
                  </div>
                  <input
                    type="password"
                    value={providerApiKeys[provider.id] || ''}
                    onChange={e => handleSaveApiKey(provider.id, e.target.value)}
                    placeholder={`输入 ${provider.name} API Key`}
                    className={`w-full p-2 text-sm rounded border ${
                      isLight ? 'border-gray-200' : 'border-gray-600'
                    } focus:outline-none focus:ring-1 focus:ring-blue-500`}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 聊天区域 */}
      <div className="h-[calc(100%-8rem)] overflow-y-auto p-4">
        {messages.map((message, index) => (
          <div key={index} className={`mb-4 ${message.type === 'user' ? 'text-right' : 'text-left'}`}>
            <div
              className={`inline-block max-w-[80%] rounded-lg px-4 py-2 ${
                message.type === 'user'
                  ? isLight
                    ? 'bg-blue-500 text-white'
                    : 'bg-blue-600 text-white'
                  : isLight
                    ? 'bg-gray-200 text-gray-900'
                    : 'bg-gray-700 text-gray-100'
              }`}>
              {message.content}
            </div>
          </div>
        ))}

        {/* 流式响应显示区域 */}
        {currentStreamingMessage && (
          <div className="mb-4 text-left">
            <div
              className={`inline-block max-w-[80%] rounded-lg px-4 py-2 ${
                isLight ? 'bg-gray-200 text-gray-900' : 'bg-gray-700 text-gray-100'
              }`}>
              {currentStreamingMessage}
              <span className="animate-pulse">▊</span>
            </div>
          </div>
        )}

        {isLoading && !currentStreamingMessage && (
          <div className="flex justify-center items-center py-2">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-500"></div>
          </div>
        )}
      </div>

      {/* 输入区域 */}
      <div className={`h-16 px-4 py-2 border-t ${isLight ? 'border-gray-200' : 'border-gray-700'}`}>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            onKeyPress={e => e.key === 'Enter' && handleSend()}
            placeholder="Type your message..."
            className={`flex-1 p-2 rounded-lg border ${
              isLight ? 'border-gray-200 bg-white text-gray-900' : 'border-gray-600 bg-gray-700 text-gray-100'
            } focus:outline-none focus:ring-2 focus:ring-blue-500`}
          />
          <button
            onClick={handleSend}
            className={`p-2 rounded-lg ${
              isLight ? 'bg-blue-500' : 'bg-blue-600'
            } text-white hover:opacity-90 transition-opacity`}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};

export default withErrorBoundary(withSuspense(Popup, <div> Loading ... </div>), <div> Error Occur </div>);
