import { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import ChatInterface from './components/ChatInterface';
import ConfirmDialog from './components/ConfirmDialog';
import CouncilRoom from './components/CouncilRoom';
import { api } from './api';
import { useLang } from './i18n';
import './App.css';

function App() {
  const { t, title: displayTitle } = useLang();
  const [conversations, setConversations] = useState([]);
  const [projects, setProjects] = useState([]);
  const [currentConversationId, setCurrentConversationId] = useState(null);
  const [currentConversation, setCurrentConversation] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  // In-app confirmation; native window.confirm is blocked in some embedded browsers
  const [pendingConfirm, setPendingConfirm] = useState(null);
  const [view, setView] = useState('chat'); // 'chat' | 'council'

  // Load conversations on mount
  useEffect(() => {
    loadConversations();
    loadProjects();
  }, []);

  // Load conversation details when selected
  useEffect(() => {
    if (currentConversationId) {
      loadConversation(currentConversationId);
    }
  }, [currentConversationId]);

  const loadConversations = async () => {
    try {
      const convs = await api.listConversations();
      setConversations(convs);
    } catch (error) {
      console.error('Failed to load conversations:', error);
    }
  };

  const loadProjects = async () => {
    try {
      setProjects(await api.listProjects());
    } catch (error) {
      console.error('Failed to load projects:', error);
    }
  };

  const loadConversation = async (id) => {
    try {
      const conv = await api.getConversation(id);
      setCurrentConversation(conv);
    } catch (error) {
      console.error('Failed to load conversation:', error);
    }
  };

  const handleNewConversation = async (projectId = null) => {
    try {
      const newConv = await api.createConversation(projectId);
      setView('chat');
      setConversations([
        {
          id: newConv.id,
          created_at: newConv.created_at,
          message_count: 0,
          project_id: newConv.project_id,
        },
        ...conversations,
      ]);
      setCurrentConversationId(newConv.id);
    } catch (error) {
      console.error('Failed to create conversation:', error);
    }
  };

  const handleSelectConversation = (id) => {
    setView('chat');
    setCurrentConversationId(id);
  };

  const handleDeleteConversation = async (id) => {
    const conv = conversations.find((c) => c.id === id);
    const title = conv?.title ? displayTitle(conv.title) : t('thisConversation');
    setPendingConfirm({
      title: t('confirmDeleteConvTitle'),
      message: t('confirmDeleteConvMsg', title),
      confirmLabel: t('deleteConversation'),
      onConfirm: () => deleteConversation(id),
    });
  };

  const deleteConversation = async (id) => {
    try {
      await api.deleteConversation(id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (id === currentConversationId) {
        setCurrentConversationId(null);
        setCurrentConversation(null);
      }
    } catch (error) {
      console.error('Failed to delete conversation:', error);
    }
  };

  const handleCreateProject = async (name, path) => {
    const project = await api.createProject(name, path);
    setProjects((prev) => [...prev, project]);
    await handleNewConversation(project.id);
    return project;
  };

  const handleDeleteProject = async (id) => {
    const project = projects.find((p) => p.id === id);
    const count = conversations.filter((c) => c.project_id === id).length;
    setPendingConfirm({
      title: t('confirmRemoveProjectTitle'),
      message: t('confirmRemoveProjectMsg', project?.name, count),
      confirmLabel: t('removeProject'),
      onConfirm: () => deleteProject(id),
    });
  };

  const deleteProject = async (id) => {
    try {
      await api.deleteProject(id);
      setProjects((prev) => prev.filter((p) => p.id !== id));
      setConversations((prev) => prev.filter((c) => c.project_id !== id));
      if (currentConversation?.project_id === id) {
        setCurrentConversationId(null);
        setCurrentConversation(null);
      }
    } catch (error) {
      console.error('Failed to delete project:', error);
    }
  };

  const handleSendMessage = async (content, attachments = [], council = null) => {
    if (!currentConversationId) return;

    setIsLoading(true);
    try {
      // Optimistically add user message to UI
      const userMessage = { role: 'user', content, attachments, council };
      setCurrentConversation((prev) => ({
        ...prev,
        messages: [...prev.messages, userMessage],
      }));

      // Create a partial assistant message that will be updated progressively
      const assistantMessage = {
        role: 'assistant',
        stage1: null,
        stage2: null,
        stage3: null,
        metadata: null,
        loading: {
          stage1: false,
          stage2: false,
          stage3: false,
        },
        deliberation: {
          activeStage: 1,
          startedAt: Date.now(),
          completedAt: null,
          members: [],
          chairman: null,
          models: {},
        },
      };

      // Add the partial assistant message
      setCurrentConversation((prev) => ({
        ...prev,
        messages: [...prev.messages, assistantMessage],
      }));

      // Send message with streaming
      await api.sendMessageStream(currentConversationId, content, { attachments, councilId: council?.id }, (eventType, event) => {
        switch (eventType) {
          case 'council_init':
            setCurrentConversation((prev) => {
              const messages = [...prev.messages];
              const lastMsg = messages[messages.length - 1];
              if (!lastMsg || lastMsg.role !== 'assistant') return prev;
              const modelsMap = {};
              (event.members || []).forEach((m) => {
                modelsMap[m.name] = {
                  status: 'thinking',
                  role: m.role,
                  model: m.model,
                  provider: m.provider,
                  stage: 1,
                };
              });
              lastMsg.deliberation = {
                activeStage: 1,
                startedAt: Date.now(),
                completedAt: null,
                members: event.members || [],
                chairman: event.chairman || null,
                models: modelsMap,
              };
              return { ...prev, messages };
            });
            break;

          case 'model_start':
            setCurrentConversation((prev) => {
              const messages = [...prev.messages];
              const lastMsg = messages[messages.length - 1];
              if (!lastMsg?.deliberation) return prev;
              const prevModel = lastMsg.deliberation.models[event.model] || {};
              lastMsg.deliberation.models = {
                ...lastMsg.deliberation.models,
                [event.model]: {
                  ...prevModel,
                  status: 'thinking',
                  stage: event.stage,
                  role: event.role || prevModel.role,
                  provider: event.provider || prevModel.provider,
                  startedAt: Date.now(),
                },
              };
              return { ...prev, messages };
            });
            break;

          case 'model_complete':
            setCurrentConversation((prev) => {
              const messages = [...prev.messages];
              const lastMsg = messages[messages.length - 1];
              if (!lastMsg?.deliberation) return prev;
              const prevModel = lastMsg.deliberation.models[event.model] || {};
              lastMsg.deliberation.models = {
                ...lastMsg.deliberation.models,
                [event.model]: {
                  ...prevModel,
                  status: event.success ? 'completed' : 'error',
                  duration: event.duration,
                  tokens: event.tokens,
                  stage: event.stage,
                },
              };
              return { ...prev, messages };
            });
            break;

          case 'stage1_start':
            setCurrentConversation((prev) => {
              const messages = [...prev.messages];
              const lastMsg = messages[messages.length - 1];
              if (!lastMsg) return prev;
              lastMsg.loading.stage1 = true;
              if (lastMsg.deliberation) {
                lastMsg.deliberation.activeStage = 1;
                if (event.models && (!lastMsg.deliberation.members || lastMsg.deliberation.members.length === 0)) {
                  lastMsg.deliberation.members = event.models.map((m) => ({ name: m }));
                }
              }
              return { ...prev, messages };
            });
            break;

          case 'stage1_complete':
            setCurrentConversation((prev) => {
              const messages = [...prev.messages];
              const lastMsg = messages[messages.length - 1];
              if (!lastMsg) return prev;
              lastMsg.stage1 = event.data;
              lastMsg.loading.stage1 = false;
              return { ...prev, messages };
            });
            break;

          case 'stage2_start':
            setCurrentConversation((prev) => {
              const messages = [...prev.messages];
              const lastMsg = messages[messages.length - 1];
              if (!lastMsg) return prev;
              lastMsg.loading.stage2 = true;
              if (lastMsg.deliberation) {
                lastMsg.deliberation.activeStage = 2;
                const updated = { ...lastMsg.deliberation.models };
                Object.keys(updated).forEach((k) => {
                  updated[k] = { ...updated[k], status: 'thinking', stage: 2 };
                });
                lastMsg.deliberation.models = updated;
              }
              return { ...prev, messages };
            });
            break;

          case 'stage2_complete':
            setCurrentConversation((prev) => {
              const messages = [...prev.messages];
              const lastMsg = messages[messages.length - 1];
              if (!lastMsg) return prev;
              lastMsg.stage2 = event.data;
              lastMsg.metadata = event.metadata;
              lastMsg.loading.stage2 = false;
              return { ...prev, messages };
            });
            break;

          case 'stage3_start':
            setCurrentConversation((prev) => {
              const messages = [...prev.messages];
              const lastMsg = messages[messages.length - 1];
              if (!lastMsg) return prev;
              lastMsg.loading.stage3 = true;
              if (lastMsg.deliberation) {
                lastMsg.deliberation.activeStage = 3;
                if (event.chairman && !lastMsg.deliberation.chairman) {
                  lastMsg.deliberation.chairman = { name: event.chairman };
                }
              }
              return { ...prev, messages };
            });
            break;

          case 'stage3_complete':
            setCurrentConversation((prev) => {
              const messages = [...prev.messages];
              const lastMsg = messages[messages.length - 1];
              if (!lastMsg) return prev;
              lastMsg.stage3 = event.data;
              lastMsg.loading.stage3 = false;
              return { ...prev, messages };
            });
            break;

          case 'title_complete':
            loadConversations();
            break;

          case 'complete':
            setCurrentConversation((prev) => {
              const messages = [...prev.messages];
              const lastMsg = messages[messages.length - 1];
              if (lastMsg?.deliberation) {
                lastMsg.deliberation.activeStage = 'done';
                lastMsg.deliberation.completedAt = Date.now();
              }
              return { ...prev, messages };
            });
            loadConversations();
            setIsLoading(false);
            break;

          case 'error':
            console.error('Stream error:', event.message);
            setIsLoading(false);
            break;

          default:
            console.log('Event:', eventType, event);
        }
      });
    } catch (error) {
      console.error('Failed to send message:', error);
      // Remove optimistic messages on error
      setCurrentConversation((prev) => ({
        ...prev,
        messages: prev.messages.slice(0, -2),
      }));
      setIsLoading(false);
    }
  };

  return (
    <div className="app">
      <Sidebar
        conversations={conversations}
        currentConversationId={currentConversationId}
        onSelectConversation={handleSelectConversation}
        onNewConversation={handleNewConversation}
        onDeleteConversation={handleDeleteConversation}
        projects={projects}
        onCreateProject={handleCreateProject}
        onDeleteProject={handleDeleteProject}
        onOpenCouncil={() => setView('council')}
        councilOpen={view === 'council'}
      />
      {view === 'council' ? (
        <CouncilRoom onClose={() => setView('chat')} />
      ) : (
        <ChatInterface
          conversation={currentConversation}
          onSendMessage={handleSendMessage}
          isLoading={isLoading}
        />
      )}
      {pendingConfirm && (
        <ConfirmDialog
          {...pendingConfirm}
          onCancel={() => setPendingConfirm(null)}
          onConfirm={() => {
            pendingConfirm.onConfirm();
            setPendingConfirm(null);
          }}
        />
      )}
    </div>
  );
}

export default App;
