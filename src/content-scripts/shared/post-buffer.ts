import type { PostData } from '../../shared/types';
import { CONFIG } from '../../shared/constants';

export class PostBuffer {
  private posts: PostData[] = [];
  private readonly maxSize: number;

  constructor(maxSize: number = CONFIG.MAX_POST_BUFFER_SIZE) {
    this.maxSize = maxSize;
  }

  add(newPosts: PostData[]): void {
    // New posts go to the head, cap at max size
    this.posts = [...newPosts, ...this.posts]
      .filter((post, index, self) =>
        index === self.findIndex(p => p.id === post.id)
      )
      .slice(0, this.maxSize);
  }

  getAll(): PostData[] {
    return [...this.posts];
  }

  clear(): void {
    this.posts = [];
  }

  get size(): number {
    return this.posts.length;
  }
}
