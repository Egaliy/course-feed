import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import crypto from 'node:crypto';
import { normalizeTopicId, normalizeTopics, slugifyTopic } from './topics.js';

const defaultState = {
  posts: [],
  accessLinks: [],
  registrations: [],
  topics: [],
  adminTopicSelections: {}
};

export class Store {
  constructor(filePath) {
    this.filePath = filePath;
    this.state = structuredClone(defaultState);
    this.writeQueue = Promise.resolve();
  }

  async load() {
    await mkdir(dirname(this.filePath), { recursive: true });

    try {
      const raw = await readFile(this.filePath, 'utf8');
      this.state = { ...structuredClone(defaultState), ...JSON.parse(raw) };
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await this.save();
    }
  }

  async save() {
    this.writeQueue = this.writeQueue.then(async () => {
      const body = JSON.stringify(this.state, null, 2);
      await writeFile(this.filePath, body);
    });
    return this.writeQueue;
  }

  async addPost(input) {
    const post = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      text: '',
      media: [],
      ...input
    };
    this.state.posts.push(post);
    await this.save();
    return post;
  }

  getPosts() {
    return [...this.state.posts].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  async deletePosts(ids) {
    const before = this.state.posts.length;
    const idSet = new Set(ids.map((id) => String(id || '')));
    
    const postsToDelete = this.state.posts.filter((p) => idSet.has(p.id));
    this.state.posts = this.state.posts.filter((post) => !idSet.has(post.id));
    
    if (this.state.posts.length !== before) {
      for (const p of postsToDelete) {
        if (p.media) {
          for (const item of p.media) {
            if (item.url && item.url.startsWith('/uploads/')) {
              const filePath = join(process.cwd(), 'public', item.url);
              await unlink(filePath).catch((e) => console.error('Local delete error:', e));
            }
          }
        }
      }
      await this.save();
      return true;
    }
    return false;
  }

  async deletePost(id) {
    return this.deletePosts([id]);
  }

  getTopics() {
    return this.state.topics || [];
  }

  async addTopic(label, options = {}) {
    if (!this.state.topics) this.state.topics = [];
    const topicLabel = String(label || '').trim();
    if (!topicLabel) throw new Error('Topic label is empty');

    const topics = normalizeTopics(this.state.topics);
    const parentId = normalizeTopicId(options.parentId);
    const parent = parentId ? topics.find((topic) => topic.id === parentId) : null;
    if (parentId && !parent) throw new Error('Parent topic is missing');

    const existingIds = new Set(topics.map((t) => t.id));
    const baseId = normalizeTopicId(slugifyTopic(topicLabel)) || `topic-${Date.now().toString(36)}`;
    let id = baseId;
    let index = 2;
    while (existingIds.has(id)) {
      id = `${baseId}-${index}`;
      index += 1;
    }

    const topic = {
      id,
      label: topicLabel,
      ...(parent ? { parentId: parent.id } : {})
    };

    this.state.topics.push(topic);
    await this.save();
    return topic;
  }

  getAdminTopicSelection(adminId) {
    return (this.state.adminTopicSelections || {})[String(adminId)] || 'other';
  }

  async setAdminTopicSelection(adminId, topicId) {
    if (!this.state.adminTopicSelections) this.state.adminTopicSelections = {};
    this.state.adminTopicSelections[String(adminId)] = topicId;
    await this.save();
  }

  async createAccessLink(months) {
    const now = new Date();
    const expiresAt = new Date(now);
    expiresAt.setMonth(expiresAt.getMonth() + months);

    const link = {
      token: crypto.randomBytes(24).toString('base64url'),
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      months
    };

    this.state.accessLinks.push(link);
    await this.save();
    return link;
  }

  findAccessLink(token) {
    return this.state.accessLinks.find((link) => link.token === token);
  }

  getRegistrations() {
    return [...this.state.registrations].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  async addRegistration(input) {
    const registration = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      name: '',
      contact: '',
      note: '',
      ...input
    };

    this.state.registrations.push(registration);
    await this.save();
    return registration;
  }

}
