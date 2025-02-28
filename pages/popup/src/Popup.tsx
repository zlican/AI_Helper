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
  noStream?: boolean; // 添加新属性
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
  {
    id: 'huawei-r1',
    name: '华为云 R1',
    baseUrl:
      'https://infer-modelarts-cn-southwest-2.modelarts-infer.com/v1/infers/952e4f88-ef93-4398-ae8d-af37f63f0d8e/v1/chat/completions',
    model: 'DeepSeek-R1',
    systemPrompt: 'You are a helpful assistant.',
    modelConfig: {
      temperature: 1.0,
      top_p: 0.9,
      max_tokens: 4000,
    },
    noStream: false,
  },
];

// 在组件顶部添加分类函数
const categorizeProviders = (providers: AIProvider[]) => {
  return providers.reduce(
    (acc, provider) => {
      if (provider.id.includes('r1')) {
        acc.reasoning.push(provider);
      } else {
        acc.chat.push(provider);
      }
      return acc;
    },
    { reasoning: [] as AIProvider[], chat: [] as AIProvider[] },
  );
};

const Popup = () => {
  const theme = useStorage(exampleThemeStorage);
  const isLight = theme === 'light';
  const [showSettings, setShowSettings] = useState(false);
  const [messages, setMessages] = useState<Array<{ type: 'user' | 'ai'; content: string }>>([]);
  const [inputText, setInputText] = useState('');
  const [selectedProvider, setSelectedProvider] = useState<AIProvider>(defaultProviders[0]);
  const [providerApiKeys, setProviderApiKeys] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [currentStreamingMessage, setCurrentStreamingMessage] = useState('');
  const abortControllerRef = useRef<AbortController | null>(null);
  const categorizedProviders = categorizeProviders(defaultProviders);
  const [showCopyTip, setShowCopyTip] = useState(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // 添加滚动到底部的函数
  const scrollToBottom = () => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  };

  // 监听消息变化，自动滚动
  useEffect(() => {
    scrollToBottom();
  }, [messages, currentStreamingMessage]);

  // 从 storage 加载所有配置
  useEffect(() => {
    chrome.storage.local.get(['providerApiKeys', 'selectedProviderId'], result => {
      if (result.providerApiKeys) {
        setProviderApiKeys(result.providerApiKeys);
      }
      if (result.selectedProviderId) {
        const savedProvider = defaultProviders.find(p => p.id === result.selectedProviderId);
        if (savedProvider) {
          setSelectedProvider(savedProvider);
        }
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

  // 修改选择提供商的处理函数，添加自动关闭设置面板
  const handleProviderChange = (provider: AIProvider) => {
    setSelectedProvider(provider);
    chrome.storage.local.set({ selectedProviderId: provider.id });
    setShowSettings(false); // 选择后自动关闭设置面板
  };

  // 添加主题切换函数
  const toggleTheme = () => {
    if (theme === 'light') {
      exampleThemeStorage.set('dark');
    } else {
      exampleThemeStorage.set('light');
    }
  };

  // 修改复制函数
  const copyToClipboard = (text: string) => {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setShowCopyTip(true);
        setTimeout(() => {
          setShowCopyTip(false);
        }, 700);
      })
      .catch(err => {
        console.error('复制失败:', err);
      });
  };

  // 修改重新发送的处理函数
  const handleResend = async (content: string, messageIndex: number) => {
    // 如果当前正在生成回答，先中断它
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // 删除当前用户消息和对应的 AI 回复（如果存在）
    setMessages(prev => {
      // 如果正在流式输出，也需要清除
      setCurrentStreamingMessage('');

      // 如果当前消息是用户消息，删除它和后面的所有消息（包括可能正在生成的 AI 回复）
      if (prev[messageIndex].type === 'user') {
        return prev.filter((_, index) => index < messageIndex);
      }
      return prev;
    });

    // 直接发送新消息，不经过 inputText 状态
    const currentApiKey = providerApiKeys[selectedProvider.id];
    if (!content.trim() || !currentApiKey) return;

    // 设置加载状态
    setIsLoading(true);
    setCurrentStreamingMessage('');

    // 创建新的 AbortController
    abortControllerRef.current = new AbortController();

    try {
      // 添加用户消息
      setMessages(prev => [...prev, { type: 'user', content }]);

      if (selectedProvider.isGemini) {
        // Gemini API 特定处理
        const requestBody = {
          contents: [
            {
              parts: [{ text: content }], // 使用传入的 content 而不是 inputText
            },
          ],
          generationConfig: {
            temperature: selectedProvider.modelConfig?.temperature,
            topP: selectedProvider.modelConfig?.top_p,
            maxOutputTokens: selectedProvider.modelConfig?.max_tokens,
          },
        };

        // 复制 handleSend 中的 Gemini API 处理逻辑
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
        const aiContent = data.candidates[0]?.content?.parts[0]?.text || '';
        setMessages(prev => [...prev, { type: 'ai', content: aiContent }]);
      } else {
        // 非 Gemini API 处理
        const messageHistory = messages.map(msg => ({
          role: msg.type === 'user' ? 'user' : 'assistant',
          content: msg.content,
        }));

        // 复制 handleSend 中的其他 API 处理逻辑
        let requestBody;
        if (selectedProvider.id === 'huawei-r1') {
          requestBody = {
            model: 'DeepSeek-R1',
            messages: [
              { role: 'system', content: selectedProvider.systemPrompt || '' },
              ...messageHistory,
              { role: 'user', content },
            ],
            temperature: selectedProvider.modelConfig?.temperature || 1.0,
            max_tokens: selectedProvider.modelConfig?.max_tokens || 4000,
            stream: true,
          };

          const response = await fetch(`${selectedProvider.baseUrl}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${currentApiKey}`,
              Accept: 'text/event-stream',
              'X-Request-ID': Date.now().toString(),
              Connection: 'keep-alive',
              'Cache-Control': 'no-cache',
            },
            body: JSON.stringify(requestBody),
            signal: abortControllerRef.current.signal,
          });

          if (!response.ok) {
            const errorData = await response.text();
            throw new Error(`HTTP error! status: ${response.status}, message: ${errorData}`);
          }

          const reader = response.body?.getReader();
          const decoder = new TextDecoder();

          if (!reader) {
            throw new Error('Response body is null');
          }

          let streamedContent = '';
          let isFirstChunk = true;
          let hasAddedSeparator = false;

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
                  if (parsed.error_code) {
                    throw new Error(`华为云错误: [${parsed.error_code}] ${parsed.error_msg}`);
                  }

                  // 提取内容和思考内容
                  const reasoning = parsed.choices?.[0]?.delta?.reasoning_content || '';
                  const contentChunk = parsed.choices?.[0]?.delta?.content || '';

                  // 处理思考内容
                  if (reasoning) {
                    const cleanReasoning = reasoning
                      .replace(/\n+/g, ' ') // 压缩换行为空格
                      .replace(/\s{2,}/g, ' '); // 压缩多个空格

                    if (streamedContent.includes('[思考]')) {
                      // 在已有思考内容后追加
                      streamedContent = streamedContent.replace(
                        /(\[思考\])([\s\S]*?)(?=\n\n|$)/,
                        `$1$2${cleanReasoning}`,
                      );
                    } else {
                      // 首次添加思考内容
                      streamedContent = `[思考]${cleanReasoning}\n${streamedContent}`;
                    }
                  }

                  // 处理正式回答内容
                  if (contentChunk) {
                    const cleanContent = contentChunk
                      .replace(/[\n\r]+/g, '') // 彻底移除换行
                      .replace(/\s{2,}/g, ' '); // 压缩多个空格

                    // 添加思考与回答的分隔符
                    if (streamedContent.includes('[思考]') && !hasAddedSeparator) {
                      // 确保思考内容以换行结束
                      if (!streamedContent.endsWith('\n')) {
                        streamedContent += '\n';
                      }
                      streamedContent += '\n\n';
                      hasAddedSeparator = true;
                    }

                    // 直接追加内容（已处理换行）
                    streamedContent += cleanContent;
                  }

                  // 处理首块空行（使用新变量避免修改const）
                  let processedContent = streamedContent;
                  if (isFirstChunk && contentChunk) {
                    processedContent = processedContent.replace(/^[\s\n\r]+/, '');
                    isFirstChunk = false;
                  }

                  // 最终格式处理
                  processedContent = processedContent
                    .replace(/(\n{4,})/g, '\n\n') // 压缩多余空行但保留两个换行
                    .replace(/(\S)\n\n(\S)/g, '$1\n\n$2') // 保护内容间的两个换行
                    .trim();

                  setCurrentStreamingMessage(processedContent);
                  streamedContent = processedContent; // 更新流式内容
                } catch (e) {
                  console.error('解析流式数据错误:', e, 'Raw data:', data);
                }
              }
            }
          }

          // 流式响应完成后，添加完整消息
          setMessages(prev => [...prev, { type: 'ai', content: streamedContent }]);
          setCurrentStreamingMessage('');
        }
      }
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error('API 调用错误:', error);
        setMessages(prev => [
          ...prev,
          {
            type: 'ai',
            content:
              error.name === 'AbortError' ? '已取消生成' : `错误: ${error.message || '发生了错误，请稍后重试。'}`,
          },
        ]);
      }
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
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
        const messageHistory = messages.map(msg => ({
          role: msg.type === 'user' ? 'user' : 'assistant',
          content: msg.content,
        }));

        let requestBody;
        if (selectedProvider.id === 'huawei-r1') {
          // 华为云特定的请求体格式
          requestBody = {
            model: 'DeepSeek-R1',
            messages: [
              { role: 'system', content: selectedProvider.systemPrompt || '' },
              ...messageHistory,
              { role: 'user', content: inputText },
            ],
            temperature: selectedProvider.modelConfig?.temperature || 1.0,
            max_tokens: selectedProvider.modelConfig?.max_tokens || 4000,
            stream: true,
          };
        } else {
          // 其他提供商的请求体格式保持不变
          requestBody = {
            model: selectedProvider.model,
            messages: [
              selectedProvider.systemPrompt ? { role: 'system', content: selectedProvider.systemPrompt } : null,
              ...messageHistory,
              { role: 'user', content: inputText },
            ].filter(Boolean),
            ...selectedProvider.modelConfig,
            stream: !selectedProvider.noStream,
          };
        }

        const response = await fetch(`${selectedProvider.baseUrl}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${currentApiKey}`,
            Accept: 'text/event-stream',
            'X-Request-ID': Date.now().toString(),
            Connection: 'keep-alive',
            'Cache-Control': 'no-cache',
          },
          body: JSON.stringify(requestBody),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          const errorData = await response.text();
          throw new Error(`HTTP error! status: ${response.status}, message: ${errorData}`);
        }

        if (selectedProvider.noStream) {
          // 非流式输出处理
          const data = await response.text();
          console.log('原始响应文本:', data); // 先打印原始文本
          try {
            const jsonData = JSON.parse(data);
            let content;

            if (selectedProvider.id === 'huawei-r1') {
              // 华为云标准响应格式处理
              content =
                jsonData.choices?.[0]?.message?.content ||
                jsonData.result?.response ||
                jsonData.output?.text ||
                jsonData.answer ||
                '未找到有效响应内容';

              // 处理多余空行
              if (content) {
                // 去除开头的空白和空行，保留末尾格式
                content = content.replace(/^\s*\n+\s*/, '');
                content = content.trimEnd();
              }

              // 处理错误码（示例错误响应：{"error_code":"xxx","error_msg":"xxx"}）
              if (jsonData.error_code) {
                throw new Error(`[${jsonData.error_code}] ${jsonData.error_msg}`);
              }

              // 处理空内容但存在usage的情况
              if (!content && jsonData.usage) {
                content = `请求成功但内容为空，消耗token数：${jsonData.usage.total_tokens}`;
              }

              console.log('[华为云调试] 处理后的内容:', content);
            } else {
              // 其他提供商的响应格式处理
              content =
                jsonData.choices?.[0]?.message?.content ||
                jsonData.choices?.[0]?.content ||
                jsonData.response ||
                '无法解析响应内容';
            }

            console.log('API Response:', jsonData); // 添加调试日志
            setMessages(prev => [...prev, { type: 'ai', content }]);
          } catch (parseError) {
            console.error('无效的JSON响应:', data); // 打印非JSON响应
            throw new Error('API返回了非JSON格式的响应');
          }
        } else {
          // 流式处理逻辑更新：
          let streamedContent = '';
          let hasAddedSeparator = false;
          let isFirstContent = true;

          const reader = response.body?.getReader();
          const decoder = new TextDecoder();

          if (!reader) {
            throw new Error('Response body is null');
          }

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6);
                if (data === '[DONE]') continue;

                try {
                  const parsed = JSON.parse(data);
                  if (parsed.error_code) {
                    throw new Error(`华为云错误: [${parsed.error_code}] ${parsed.error_msg}`);
                  }

                  // 分离思考内容和正式内容
                  const reasoning = parsed.choices?.[0]?.delta?.reasoning_content || '';
                  const contentChunk = parsed.choices?.[0]?.delta?.content || '';

                  // 实时拼接思考内容（保留自然换行）
                  if (reasoning) {
                    if (!streamedContent.includes('[思考]')) {
                      streamedContent = `[思考]${reasoning}`;
                    } else {
                      // 在已有思考内容后追加，保留换行结构
                      streamedContent = streamedContent.replace(/(\[思考\])([\s\S]*?)(?=\n\n|$)/, `$1$2${reasoning}`);
                    }
                  }

                  // 实时拼接正式内容（完全去除换行）
                  if (contentChunk) {
                    let cleanContent = contentChunk
                      .replace(/[\n\r]+/g, '') // 彻底移除换行
                      .replace(/\s{2,}/g, ' '); // 压缩多个空格

                    // 首次内容处理
                    if (isFirstContent) {
                      cleanContent = cleanContent.replace(/^\s+/, '');
                      isFirstContent = false;
                    }

                    // 添加思考与回答的分隔符
                    if (streamedContent.includes('[思考]') && !hasAddedSeparator) {
                      // 确保思考内容以换行结束
                      if (!streamedContent.endsWith('\n')) {
                        streamedContent += '\n';
                      }
                      streamedContent += '\n\n';
                      hasAddedSeparator = true;
                    }

                    streamedContent += cleanContent;
                  }

                  // 实时更新显示内容
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
      }
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error('API 调用错误:', error);
      }
      setMessages(prev => [
        ...prev,
        {
          type: 'ai',
          content: error.name === 'AbortError' ? '已取消生成' : `错误: ${error.message || '发生了错误，请稍后重试。'}`,
        },
      ]);
    } finally {
      setIsLoading(false);
      setInputText('');
      abortControllerRef.current = null;
    }
  };

  // 修改取消按钮的处理函数
  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsLoading(false);
      setCurrentStreamingMessage('');
    }
  };

  return (
    <div className="min-h-[520px] h-screen flex flex-col bg-white dark:bg-gray-900">
      {/* 导航栏 - 更新夜间模式颜色 */}
      <div
        className={`h-14 shrink-0 px-4 flex justify-between items-center cursor-pointer ${
          isLight ? 'bg-white shadow-sm' : 'bg-gray-800'
        }`}
        onClick={() => setShowSettings(true)}>
        <div className="flex items-center gap-2">
          <h1
            className={`text-lg font-medium ${
              isLight ? 'text-gray-700' : 'text-blue-400' // 夜间模式改为浅蓝色
            }`}>
            AI Chat
          </h1>
        </div>

        {/* 修改模型名称显示的颜色 */}
        <span
          className={`text-sm font-medium ${
            isLight ? 'text-gray-600' : 'text-blue-400' // 改为浅蓝色
          }`}>
          {selectedProvider.name}
        </span>

        <div className="flex items-center gap-2">
          {/* 清除历史按钮 */}
          <button
            onClick={e => {
              e.stopPropagation(); // 阻止事件冒泡，避免触发设置面板
              handleClearChat();
            }}
            className={`p-2 rounded-lg transition-colors ${
              isLight ? 'hover:bg-gray-100 text-gray-500' : 'hover:bg-gray-700/50 text-blue-400'
            }`}
            title="清除聊天记录">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
          </button>

          {/* 主题切换按钮 */}
          <button
            onClick={e => {
              e.stopPropagation(); // 阻止事件冒泡，避免触发设置面板
              toggleTheme();
            }}
            className={`p-2 rounded-lg transition-colors ${
              isLight ? 'hover:bg-gray-100 text-amber-500' : 'hover:bg-gray-700/50 text-blue-400'
            }`}>
            {isLight ? (
              <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
                />
              </svg>
            ) : (
              <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
                />
              </svg>
            )}
          </button>

          {/* 设置按钮 */}
          <button
            onClick={e => {
              e.stopPropagation(); // 阻止事件冒泡，避免触发设置面板
              setShowSettings(true);
            }}
            className={`p-2 rounded-lg transition-colors ${
              isLight ? 'hover:bg-gray-100 text-gray-700' : 'hover:bg-gray-700/50 text-blue-400'
            }`}>
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
      </div>

      {/* 设置面板 - 简化模型选择 */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm">
          <div
            className={`w-[320px] rounded-2xl shadow-xl ${
              isLight ? 'bg-white' : 'bg-gray-800'
            } p-6 transform transition-all duration-200 settings-scroll max-h-[480px] overflow-y-auto`}>
            <div className="flex items-center justify-between mb-6">
              <h2 className={`text-lg font-medium ${isLight ? 'text-gray-900' : 'text-gray-100'}`}>设置</h2>
              <button
                onClick={() => setShowSettings(false)}
                className={`p-2 rounded-full transition-colors ${
                  isLight ? 'hover:bg-gray-100 text-gray-600' : 'hover:bg-gray-700 text-gray-200'
                }`}>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* 简化的模型选择列表 */}
            <div className="space-y-3">
              {defaultProviders.map(provider => (
                <div
                  key={provider.id}
                  className={`relative rounded-xl p-2 pl-1 transition-all duration-200 ${
                    selectedProvider.id === provider.id
                      ? isLight
                        ? 'bg-blue-50 ring-2 ring-blue-500'
                        : 'bg-blue-900/20 ring-2 ring-blue-400'
                      : isLight
                        ? 'hover:bg-gray-50 hover:shadow-md hover:-translate-y-0.5'
                        : 'hover:bg-gray-700/50 hover:shadow-md dark:hover:shadow-gray-700/40 hover:-translate-y-0.5'
                  }`}
                  onClick={() => handleProviderChange(provider)}>
                  <div className="flex items-center justify-between w-full gap-2 px-1">
                    <div className="flex items-center gap-2 min-w-[120px]">
                      <input
                        type="radio"
                        id={provider.id}
                        name="ai-provider"
                        checked={selectedProvider.id === provider.id}
                        onChange={() => handleProviderChange(provider)}
                        onClick={e => e.stopPropagation()}
                        className="w-4 h-4 text-blue-500 focus:ring-blue-400"
                      />
                      <label
                        htmlFor={provider.id}
                        className={`text-sm font-medium whitespace-nowrap ${
                          isLight ? 'text-gray-900' : 'text-gray-100'
                        }`}>
                        {provider.name}
                      </label>
                    </div>
                    <input
                      type="password"
                      value={providerApiKeys[provider.id] || ''}
                      onChange={e => handleSaveApiKey(provider.id, e.target.value)}
                      onClick={e => e.stopPropagation()}
                      placeholder="API Key"
                      className={`w-[90px] text-sm px-3 py-1.5 rounded-lg border transition-colors mr-0.5 overflow-hidden ${
                        isLight
                          ? 'border-gray-200 focus:border-blue-500'
                          : 'border-gray-600 bg-gray-700/50 focus:border-blue-400'
                      } focus:outline-none focus:ring-1 focus:ring-blue-500/50`}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 聊天区域 - 更新背景色 */}
      <div className={`flex-1 overflow-y-auto ${isLight ? 'bg-white' : 'bg-gray-900'}`} ref={chatContainerRef}>
        <div
          className={`h-full px-4 py-4 space-y-4 ${
            isLight ? 'bg-white' : 'bg-gray-900' // 白天模式使用纯白背景
          }`}>
          {messages.map((message, index) => (
            <div
              key={index}
              className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'} items-end gap-2`}>
              {message.type === 'ai' && (
                <div className="flex flex-col items-center gap-1 relative">
                  {/* 复制成功提示 */}
                  {showCopyTip && (
                    <div className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-gray-800 text-white text-xs rounded-md whitespace-nowrap animate-fade-out">
                      复制成功
                    </div>
                  )}
                  {/* 复制按钮 */}
                  <button
                    onClick={() => copyToClipboard(message.content)}
                    className={`w-5 h-5 rounded-md flex items-center justify-center opacity-60 hover:opacity-100 transition-opacity ${
                      isLight ? 'text-blue-600' : 'text-blue-400'
                    }`}
                    title="复制回答">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"
                      />
                    </svg>
                  </button>
                  {/* AI 头像 - 添加点击复制功能 */}
                  <button
                    onClick={() => copyToClipboard(message.content)}
                    className={`w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer ${
                      isLight
                        ? 'bg-blue-100 text-blue-600 hover:bg-blue-200'
                        : 'bg-blue-900/30 text-blue-400 hover:bg-blue-800/40'
                    }`}
                    title="复制回答">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                      />
                    </svg>
                  </button>
                </div>
              )}
              <div
                className={`max-w-[75%] rounded-2xl px-4 py-2 ${
                  message.type === 'user'
                    ? 'bg-blue-500 text-white rounded-br-none'
                    : isLight
                      ? 'bg-gray-200 text-gray-900 rounded-bl-none'
                      : 'bg-gray-700 text-gray-100 rounded-bl-none'
                }`}>
                {message.content.includes('[思考]') && (
                  <div className="mb-3 space-y-2">
                    <div className={`text-sm space-y-1 ${isLight ? 'text-gray-500' : 'text-gray-300'}`}>
                      <p className="font-medium">思考过程：</p>
                      <div className={`whitespace-pre-wrap italic ${isLight ? 'text-gray-600' : 'text-gray-300'}`}>
                        {message.content.includes('[思考]')
                          ? message.content.split(/\[思考\]/)[1]?.split('\n\n')[0] || ''
                          : ''}
                      </div>
                    </div>
                    <div className={`border-t ${isLight ? 'border-gray-200' : 'border-gray-600'}`}></div>
                  </div>
                )}
                <div className="text-sm leading-relaxed whitespace-pre-wrap">
                  {message.content.split('\n\n').slice(1).join('\n\n') || message.content}
                </div>
              </div>
              {message.type === 'user' && (
                <div className="flex flex-col items-center relative">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                      isLight ? 'bg-blue-100 text-blue-600' : 'bg-blue-900/30 text-blue-400'
                    }`}>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                      />
                    </svg>
                  </div>
                  {/* 重新发送按钮 - 使用绝对定位 */}
                  <button
                    onClick={() => handleResend(message.content, index)}
                    className={`w-5 h-5 rounded-md flex items-center justify-center opacity-60 hover:opacity-100 transition-opacity absolute -bottom-6 ${
                      isLight ? 'text-blue-600' : 'text-blue-400'
                    }`}
                    title="重新发送">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                      />
                    </svg>
                  </button>
                </div>
              )}
            </div>
          ))}

          {/* 流式响应显示 */}
          {currentStreamingMessage && (
            <div className="flex justify-start items-end gap-2">
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                  isLight ? 'bg-blue-100 text-blue-600' : 'bg-blue-900/30 text-blue-400'
                }`}>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  />
                </svg>
              </div>
              <div
                className={`max-w-[75%] rounded-2xl px-4 py-2 rounded-bl-none ${
                  isLight ? 'bg-gray-200 text-gray-900' : 'bg-gray-700 text-gray-100'
                }`}>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">
                  {currentStreamingMessage}
                  <span className="inline-block w-1 h-4 ml-0.5 align-middle animate-pulse bg-current opacity-75"></span>
                </p>
              </div>
            </div>
          )}

          {/* 加载动画 */}
          {isLoading && !currentStreamingMessage && (
            <div className="flex justify-center items-center py-4">
              <div className="relative w-8 h-8">
                <div className="absolute top-0 left-0 w-full h-full border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin"></div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 输入区域 - 固定在底部 */}
      <div
        className={`shrink-0 border-t ${isLight ? 'border-gray-200/80 bg-white' : 'border-gray-700/80 bg-gray-800'}`}>
        <div className={`flex items-center gap-3 p-4 ${isLight ? 'bg-white' : 'bg-gray-800'}`}>
          <div className="flex-1 relative">
            {/* 取消按钮 - 移到输入框上方 */}
            {(isLoading || currentStreamingMessage) && (
              <button
                onClick={handleCancel}
                className={`absolute -top-10 right-0 p-1.5 rounded-lg transition-colors shadow-sm ${
                  isLight ? 'bg-white hover:bg-gray-100' : 'bg-gray-700 hover:bg-gray-600'
                }`}
                title="取消对话">
                <div className="flex items-center gap-1.5">
                  <span className={`text-xs ${isLight ? 'text-gray-500' : 'text-gray-300'}`}>取消生成</span>
                  <svg
                    className={`w-3.5 h-3.5 ${isLight ? 'text-gray-500' : 'text-gray-300'}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </div>
              </button>
            )}
            <input
              type="text"
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              onKeyPress={e => e.key === 'Enter' && handleSend()}
              placeholder="输入消息..."
              className={`w-full px-4 py-2 rounded-xl border text-sm transition-all ${
                isLight
                  ? 'border-gray-200 bg-white text-gray-900 focus:border-blue-500'
                  : 'border-gray-600 bg-gray-700/50 text-gray-100 focus:border-blue-400'
              } focus:outline-none focus:ring-2 focus:ring-blue-500/40`}
            />
          </div>
          <button
            onClick={handleSend}
            disabled={!inputText.trim() || isLoading}
            className={`p-2 rounded-xl ${
              isLight ? 'bg-blue-500 hover:bg-blue-600' : 'bg-blue-600 hover:bg-blue-700'
            } text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}>
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
