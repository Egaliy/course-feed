import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import crypto from 'node:crypto';

const defaultState = {
  posts: [],
  accessLinks: []
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
}
