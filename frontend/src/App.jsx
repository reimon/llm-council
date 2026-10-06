import { useState, useEffect, useRef } from 'react';
import Sidebar from './components/Sidebar';
import ChatInterface from './components/ChatInterface';
import ConfirmDialog from './components/ConfirmDialog';
import CouncilRoom from './components/CouncilRoom';
import { api } from './api';
import { useLang } from './i18n';
import './App.css';

function applyDeliberationEvent(prevDelib, eventType, event) {
  const current = prevDelib || {
    activeStage: 1,
    startedAt: Date.now(),
    completedAt: null,
    members: [],
    chairman: null,
    models: {},
    stage1: null,
    stage2: null,
    stage3: null,
    metadata: null,
    loading: { stage1: false, stage2: false, stage3: false },
  };

  const next = {
    ...current,
    loading: { ...current.loading },
    models: { ...current.models },
  };

  switch (eventType) {
    case 'council_init': {
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
      next.activeStage = 1;
      next.members = event.members || [];
      next.chairman = event.chairman || null;
      next.models = { ...next.models, ...modelsMap };
      break;
    }

    case 'stage1_start': {
      next.activeStage = 1;
      next.loading.stage1 = true;
      if (event.models && (!next.members || next.members.length === 0)) {
        next.members = event.models.map((m) => ({ name: m }));
      }
      break;
    }

    case 'model_start': {
      const prevModel = next.models[event.model] || {};
      next.models[event.model] = {
        ...prevModel,
        status: 'thinking',
        stage: event.stage,
        role: event.role || prevModel.role,
        provider: event.provider || prevModel.provider,
        startedAt: Date.now(),
      };
      break;
    }

    case 'model_complete': {
      const prevModel = next.models[event.model] || {};
      next.models[event.model] = {
        ...prevModel,
        status: event.success ? 'completed' : 'error',
        duration: event.duration,
        tokens: event.tokens,
        stage: event.stage,
      };
      // Show each answer/review as soon as its model finishes (the *_complete events replace these)
      if (event.success && typeof event.content === 'string') {
        if (event.stage === 1) {
          next.stage1 = [
            ...(next.stage1 || []).filter((r) => r.model !== event.model),
            { model: event.model, role: event.role, response: event.content },
          ];
        } else if (event.stage === 2) {
          next.stage2 = [
            ...(next.stage2 || []).filter((r) => r.model !== event.model),
            { model: event.model, ranking: event.content, parsed_ranking: event.parsed_ranking || [] },
          ];
        }
      }
      break;
    }

    case 'stage2_labels': {
      next.metadata = { ...(next.metadata || {}), label_to_model: event.label_to_model };
      break;
    }

    case 'stage1_complete': {
      next.stage1 = event.data;
      next.loading.stage1 = false;
      break;
    }

    case 'stage2_start': {
      next.activeStage = 2;
      next.loading.stage2 = true;
      const updated = { ...next.models };
      Object.keys(updated).forEach((k) => {
        updated[k] = { ...updated[k], status: 'thinking', stage: 2 };
      });
      next.models = updated;
      break;
    }

    case 'stage2_complete': {
      next.stage2 = event.data;
      next.metadata = event.metadata;
      next.loading.stage2 = false;
      break;
    }

    case 'stage3_start': {
      next.activeStage = 3;
      next.loading.stage3 = true;
      if (event.chairman && !next.chairman) {
        next.chairman = { name: event.chairman };
      }
      break;
    }

    case 'stage3_complete': {
      next.stage3 = event.data;
      next.loading.stage3 = false;
      break;
    }

    case 'complete': {
      next.activeStage = 'done';
      next.completedAt = Date.now();
      break;
    }

    default:
      break;
  }
  return next;
}

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

  // Active deliberations keyed by conversationId
  const [activeDeliberations, setActiveDeliberations] = useState({});
  const activeDeliberationsRef = useRef({});
  activeDeliberationsRef.current = activeDeliberations;

  // Active SSE stream connections keyed by conversationId
  const activeStreamsRef = useRef(new Set());

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

  const handleDeliberationEvent = (convId, eventType, event) => {
    // 1. Update activeDeliberations map
    setActiveDeliberations((prev) => {
      if (eventType === 'complete') {
        const { [convId]: _, ...rest } = prev;
        return rest;
      }
      const updated = applyDeliberationEvent(prev[convId], eventType, event);
      return { ...prev, [convId]: updated };
    });

    // 2. Refresh sidebar list when title or deliberation finishes
    if (eventType === 'title_complete' || eventType === 'complete') {
      loadConversations();
    }

    // 3. Deliberation finished: if viewing this conversation, reload it to show saved data
    if (eventType === 'complete') {
      if (currentConversationId === convId) {
        loadConversation(convId);
        setIsLoading(false);
      }
      return;
    }

    if (eventType === 'error') {
      console.error(`Deliberation error on conversation ${convId}:`, event.message);
      if (currentConversationId === convId) {
        setIsLoading(false);
      }
      return;
    }

    // 4. Update the current active conversation if it matches convId
    setCurrentConversation((prev) => {
      if (!prev || prev.id !== convId) return prev;

      const messages = [...prev.messages];
      let lastMsg = messages[messages.length - 1];
      if (!lastMsg || lastMsg.role !== 'assistant') {
        lastMsg = {
          role: 'assistant',
          stage1: null,
          stage2: null,
          stage3: null,
          metadata: null,
          loading: { stage1: false, stage2: false, stage3: false },
          deliberation: null,
        };
        messages.push(lastMsg);
      } else {
        lastMsg = { ...lastMsg };
        messages[messages.length - 1] = lastMsg;
      }

      const updatedDelib = applyDeliberationEvent(lastMsg.deliberation, eventType, event);
      lastMsg.deliberation = updatedDelib;
      lastMsg.stage1 = updatedDelib.stage1;
      lastMsg.stage2 = updatedDelib.stage2;
      lastMsg.stage3 = updatedDelib.stage3;
      lastMsg.metadata = updatedDelib.metadata;
      lastMsg.loading = updatedDelib.loading;

      return { ...prev, messages };
    });
  };

  const startListeningToDeliberation = (convId) => {
    if (activeStreamsRef.current.has(convId)) return;
    activeStreamsRef.current.add(convId);

    api.reconnectStream(convId, (eventType, event) => {
      handleDeliberationEvent(convId, eventType, event);
    }).catch((err) => {
      console.error(`Reconnect stream error for conv ${convId}:`, err);
    }).finally(() => {
      activeStreamsRef.current.delete(convId);
    });
  };

  const loadConversation = async (id) => {
    try {
      const conv = await api.getConversation(id);
      const activeDelib = activeDeliberationsRef.current[id];

      if (activeDelib) {
        // Conversation has an active deliberation running in memory
        const messages = [...conv.messages];
        const lastMsg = messages[messages.length - 1];
        if (!lastMsg || lastMsg.role !== 'assistant') {
          messages.push({
            role: 'assistant',
            stage1: activeDelib.stage1,
            stage2: activeDelib.stage2,
            stage3: activeDelib.stage3,
            metadata: activeDelib.metadata,
            loading: activeDelib.loading,
            deliberation: activeDelib,
          });
        } else {
          messages[messages.length - 1] = {
            ...lastMsg,
            stage1: activeDelib.stage1,
            stage2: activeDelib.stage2,
            stage3: activeDelib.stage3,
            metadata: activeDelib.metadata,
            loading: activeDelib.loading,
            deliberation: activeDelib,
          };
        }
        conv.messages = messages;
        setIsLoading(true);
      } else if (conv.is_deliberating) {
        // Deliberation is running on backend (e.g. after reload)
        setIsLoading(true);
        startListeningToDeliberation(id);
      } else {
        setIsLoading(false);
      }

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
      activeStreamsRef.current.delete(id);
      setActiveDeliberations((prev) => {
        const { [id]: _, ...rest } = prev;
        return rest;
      });
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

  const handleSendMessage = async (content, attachments = [], council = null, isRetry = false) => {
    if (!currentConversationId) return;
    const convId = currentConversationId;

    setIsLoading(true);

    const initialDelib = {
      activeStage: 1,
      startedAt: Date.now(),
      completedAt: null,
      members: [],
      chairman: null,
      models: {},
      stage1: null,
      stage2: null,
      stage3: null,
      metadata: null,
      loading: { stage1: false, stage2: false, stage3: false },
    };

    setActiveDeliberations((prev) => ({
      ...prev,
      [convId]: initialDelib,
    }));

    if (!isRetry) {
      const userMessage = { role: 'user', content, attachments, council };
      const assistantMessage = {
        role: 'assistant',
        stage1: null,
        stage2: null,
        stage3: null,
        metadata: null,
        loading: { stage1: false, stage2: false, stage3: false },
        deliberation: initialDelib,
      };

      setCurrentConversation((prev) => ({
        ...prev,
        messages: [...prev.messages, userMessage, assistantMessage],
      }));
    } else {
      const assistantMessage = {
        role: 'assistant',
        stage1: null,
        stage2: null,
        stage3: null,
        metadata: null,
        loading: { stage1: false, stage2: false, stage3: false },
        deliberation: initialDelib,
      };

      setCurrentConversation((prev) => ({
        ...prev,
        messages: [...prev.messages, assistantMessage],
      }));
    }

    activeStreamsRef.current.add(convId);

    try {
      await api.sendMessageStream(
        convId,
        content,
        { attachments, councilId: council?.id },
        (eventType, event) => {
          handleDeliberationEvent(convId, eventType, event);
        }
      );
    } catch (error) {
      console.error('Failed to send message:', error);
      setActiveDeliberations((prev) => {
        const { [convId]: _, ...rest } = prev;
        return rest;
      });
      loadConversation(convId);
      setIsLoading(false);
    } finally {
      activeStreamsRef.current.delete(convId);
    }
  };

  const handleRetryDeliberation = (lastUserMsg) => {
    if (!lastUserMsg) return;
    handleSendMessage(
      lastUserMsg.content,
      lastUserMsg.attachments || [],
      lastUserMsg.council || null,
      true /* isRetry */
    );
  };

  const augmentedConversations = conversations.map((c) => ({
    ...c,
    is_deliberating: Boolean(activeDeliberations[c.id] || c.is_deliberating),
  }));

  return (
    <div className="app">
      <Sidebar
        conversations={augmentedConversations}
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
          onRetryDeliberation={handleRetryDeliberation}
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
