/**
 * API client for the LLM Council backend.
 */

const API_BASE = 'http://localhost:8001';

export const api = {
  /**
   * List all conversations.
   */
  async listConversations() {
    const response = await fetch(`${API_BASE}/api/conversations`);
    if (!response.ok) {
      throw new Error('Failed to list conversations');
    }
    return response.json();
  },

  /**
   * Create a new conversation.
   */
  async createConversation(projectId = null) {
    const response = await fetch(`${API_BASE}/api/conversations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ project_id: projectId }),
    });
    if (!response.ok) {
      throw new Error('Failed to create conversation');
    }
    return response.json();
  },

  /**
   * Get a specific conversation.
   */
  async getConversation(conversationId) {
    const response = await fetch(
      `${API_BASE}/api/conversations/${conversationId}`
    );
    if (!response.ok) {
      throw new Error('Failed to get conversation');
    }
    return response.json();
  },

  /**
   * List all projects.
   */
  async listProjects() {
    const response = await fetch(`${API_BASE}/api/projects`);
    if (!response.ok) {
      throw new Error('Failed to list projects');
    }
    return response.json();
  },

  /**
   * Create a project from a local folder path.
   */
  async createProject(name, path) {
    const response = await fetch(`${API_BASE}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, path }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.detail || 'Failed to create project');
    }
    return data;
  },

  /**
   * Delete a project and its conversations.
   */
  async deleteProject(projectId) {
    const response = await fetch(`${API_BASE}/api/projects/${projectId}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      throw new Error('Failed to delete project');
    }
    return response.json();
  },

  /**
   * Open the native folder picker (macOS). Resolves to a path or null.
   */
  async pickFolder() {
    const response = await fetch(`${API_BASE}/api/pick-folder`, { method: 'POST' });
    if (!response.ok) return null;
    return (await response.json()).path;
  },

  /**
   * Upload an image or video. Resolves to the stored attachment.
   */
  async uploadFile(file) {
    const response = await fetch(
      `${API_BASE}/api/uploads?name=${encodeURIComponent(file.name)}`,
      { method: 'POST', body: file }
    );
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.detail || 'Falha no envio');
    }
    return data;
  },

  /**
   * URL of an uploaded file (for thumbnails).
   */
  uploadUrl(uploadId, filename) {
    return `${API_BASE}/api/uploads/${uploadId}/${encodeURIComponent(filename)}`;
  },

  async getCouncil() {
    const response = await fetch(`${API_BASE}/api/council`);
    if (!response.ok) throw new Error('Failed to load council');
    return response.json();
  },

  async saveCouncil(council) {
    const response = await fetch(`${API_BASE}/api/council`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(council),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || 'Failed to save council');
    return data;
  },

  async getSkillCatalog() {
    const response = await fetch(`${API_BASE}/api/skills/catalog`);
    if (!response.ok) throw new Error('Failed to load skills');
    return response.json();
  },

  async getInstalledSkills() {
    const response = await fetch(`${API_BASE}/api/skills`);
    if (!response.ok) throw new Error('Failed to load skills');
    return response.json();
  },

  async installSkill(id) {
    const response = await fetch(`${API_BASE}/api/skills/${encodeURIComponent(id)}`, { method: 'POST' });
    if (!response.ok) throw new Error('Failed to install skill');
    return response.json();
  },

  async uninstallSkill(id) {
    const response = await fetch(`${API_BASE}/api/skills/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!response.ok) throw new Error('Failed to remove skill');
    return response.json();
  },

  async getProviders() {
    const response = await fetch(`${API_BASE}/api/providers`);
    if (!response.ok) throw new Error('Failed to load providers');
    return response.json();
  },

  async testSeat(seat) {
    const response = await fetch(`${API_BASE}/api/council/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(seat),
    });
    return response.json();
  },

  /**
   * Delete a conversation.
   */
  async deleteConversation(conversationId) {
    const response = await fetch(
      `${API_BASE}/api/conversations/${conversationId}`,
      { method: 'DELETE' }
    );
    if (!response.ok) {
      throw new Error('Failed to delete conversation');
    }
    return response.json();
  },

  /**
   * Send a message in a conversation.
   */
  async sendMessage(conversationId, content) {
    const response = await fetch(
      `${API_BASE}/api/conversations/${conversationId}/message`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content }),
      }
    );
    if (!response.ok) {
      throw new Error('Failed to send message');
    }
    return response.json();
  },

  /**
   * Send a message and receive streaming updates.
   * @param {string} conversationId - The conversation ID
   * @param {string} content - The message content
   * @param {function} onEvent - Callback function for each event: (eventType, data) => void
   * @returns {Promise<void>}
   */
  async sendMessageStream(conversationId, content, attachments, onEvent) {
    const response = await fetch(
      `${API_BASE}/api/conversations/${conversationId}/message/stream`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content, attachments }),
      }
    );

    if (!response.ok) {
      throw new Error('Failed to send message');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          try {
            const event = JSON.parse(data);
            onEvent(event.type, event);
          } catch (e) {
            console.error('Failed to parse SSE event:', e);
          }
        }
      }
    }
  },
};
