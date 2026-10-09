/**
 * API client for the LLM Council backend.
 */

const API_BASE = 'http://127.0.0.1:8001';

/**
 * fetch() that marks writes with the header the backend requires. A custom header
 * forces a CORS preflight, so other sites open in the browser cannot call the API.
 */
function request(url, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  if (method === 'GET') return fetch(url, options);
  return fetch(url, { ...options, headers: { ...options.headers, 'X-LLM-Council': '1' } });
}

export const api = {
  /**
   * List all conversations.
   */
  async listConversations() {
    const response = await request(`${API_BASE}/api/conversations`);
    if (!response.ok) {
      throw new Error('Failed to list conversations');
    }
    return response.json();
  },

  /**
   * Create a new conversation.
   */
  async createConversation(projectId = null) {
    const response = await request(`${API_BASE}/api/conversations`, {
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
    const response = await request(
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
    const response = await request(`${API_BASE}/api/projects`);
    if (!response.ok) {
      throw new Error('Failed to list projects');
    }
    return response.json();
  },

  /**
   * Create a project from a local folder path.
   */
  async createProject(name, path) {
    const response = await request(`${API_BASE}/api/projects`, {
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
    const response = await request(`${API_BASE}/api/projects/${projectId}`, {
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
    const response = await request(`${API_BASE}/api/pick-folder`, { method: 'POST' });
    if (!response.ok) return null;
    return (await response.json()).path;
  },

  /**
   * Upload an image or video. Resolves to the stored attachment.
   */
  async uploadFile(file) {
    const response = await request(
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

  async getCouncil(id = null) {
    const query = id ? `?id=${encodeURIComponent(id)}` : '';
    const response = await request(`${API_BASE}/api/council${query}`);
    if (!response.ok) throw new Error('Failed to load council');
    return response.json();
  },

  async saveCouncil(council) {
    const response = await request(`${API_BASE}/api/council`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(council),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || 'Failed to save council');
    return data;
  },

  async listCouncils() {
    const response = await request(`${API_BASE}/api/councils`);
    if (!response.ok) throw new Error('Failed to load councils');
    return response.json();
  },

  async createCouncil(name, fromId = null) {
    const response = await request(`${API_BASE}/api/councils`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, from_id: fromId }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || 'Failed to create council');
    return data;
  },

  async deleteCouncil(id) {
    const response = await request(`${API_BASE}/api/councils/${id}`, { method: 'DELETE' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || 'Failed to delete council');
    return data;
  },

  async setDefaultCouncil(id) {
    const response = await request(`${API_BASE}/api/councils/${id}/default`, { method: 'POST' });
    if (!response.ok) throw new Error('Failed to set default council');
    return response.json();
  },

  async getSkillCatalog() {
    const response = await request(`${API_BASE}/api/skills/catalog`);
    if (!response.ok) throw new Error('Failed to load skills');
    return response.json();
  },

  async translateSkills() {
    const response = await request(`${API_BASE}/api/skills/translate`, { method: 'POST' });
    if (!response.ok) return { pending: 0, running: false };
    return response.json();
  },

  async getInstalledSkills() {
    const response = await request(`${API_BASE}/api/skills`);
    if (!response.ok) throw new Error('Failed to load skills');
    return response.json();
  },

  async installSkill(id) {
    const response = await request(`${API_BASE}/api/skills/${encodeURIComponent(id)}`, { method: 'POST' });
    if (!response.ok) throw new Error('Failed to install skill');
    return response.json();
  },

  async uninstallSkill(id) {
    const response = await request(`${API_BASE}/api/skills/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!response.ok) throw new Error('Failed to remove skill');
    return response.json();
  },

  async getProviders() {
    const response = await request(`${API_BASE}/api/providers`);
    if (!response.ok) throw new Error('Failed to load providers');
    return response.json();
  },

  async autoconfigureCouncil() {
    const response = await request(`${API_BASE}/api/council/autoconfigure`, { method: 'POST' });
    if (!response.ok) throw new Error('Failed to configure council');
    return response.json();
  },

  async testSeat(seat) {
    const response = await request(`${API_BASE}/api/council/test`, {
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
    const response = await request(
      `${API_BASE}/api/conversations/${conversationId}`,
      { method: 'DELETE' }
    );
    if (!response.ok) {
      throw new Error('Failed to delete conversation');
    }
    return response.json();
  },

  async stopDeliberation(conversationId) {
    const response = await request(`${API_BASE}/api/conversations/${conversationId}/stop`, { method: 'POST' });
    if (!response.ok) {
      throw new Error('Failed to stop deliberation');
    }
    return response.json();
  },

  /**
   * Send a message and receive streaming updates.
   * @param {string} conversationId - The conversation ID
   * @param {string} content - The message content
   * @param {function} onEvent - Callback function for each event: (eventType, data) => void
   * @param {AbortSignal} [signal] - Optional abort signal
   * @returns {Promise<void>}
   */
  async sendMessageStream(conversationId, content, attachments, onEvent, signal) {
    const response = await request(
      `${API_BASE}/api/conversations/${conversationId}/message/stream`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(
          Array.isArray(attachments)
            ? { content, attachments }
            : { content, attachments: attachments?.attachments || [], council_id: attachments?.councilId || null }
        ),
        signal,
      }
    );

    if (!response.ok) {
      throw new Error('Failed to send message');
    }

    return api._consumeSSE(response, onEvent, signal);
  },

  /**
   * Reconnect to an in-progress or recently completed deliberation stream.
   */
  async reconnectStream(conversationId, onEvent, signal) {
    const response = await request(
      `${API_BASE}/api/conversations/${conversationId}/events`,
      { signal }
    );

    if (!response.ok) {
      throw new Error('Failed to reconnect to deliberation stream');
    }

    return api._consumeSSE(response, onEvent, signal);
  },

  async _consumeSSE(response, onEvent, signal) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    let buffer = '';
    try {
      while (true) {
        if (signal?.aborted) {
          reader.cancel();
          break;
        }
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data: ')) {
            const data = trimmed.slice(6);
            try {
              const event = JSON.parse(data);
              onEvent(event.type, event);
            } catch (e) {
              console.error('Failed to parse SSE event:', e, data);
            }
          }
        }
      }
    } catch (err) {
      if (signal?.aborted) return;
      throw err;
    }
  },
};
