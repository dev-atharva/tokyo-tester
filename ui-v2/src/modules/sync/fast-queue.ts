/**
 * Fast double-ended queue using circular buffer
 * O(1) enqueue/dequeue operations
 */
export class FastQueue<T> {
  private buffer: (T | undefined)[];
  private head: number = 0;
  private tail: number = 0;
  private size: number = 0;
  private capacity: number;

  constructor(initialCapacity: number = 1024) {
    this.capacity = initialCapacity;
    this.buffer = new Array(initialCapacity);
  }

  /**
   * Add item to the end of the queue - O(1)
   */
  enqueue(item: T): void {
    if (this.size === this.capacity) {
      this.resize();
    }

    this.buffer[this.tail] = item;
    this.tail = (this.tail + 1) % this.capacity;
    this.size++;
  }

  /**
   * Add item to the front of the queue - O(1)
   * Useful for re-queuing failed items
   */
  unshift(item: T): void {
    if (this.size === this.capacity) {
      this.resize();
    }

    this.head = (this.head - 1 + this.capacity) % this.capacity;
    this.buffer[this.head] = item;
    this.size++;
  }

  /**
   * Add multiple items to the front - O(n)
   */
  unshiftMany(items: T[]): void {
    items.reverse().forEach((item) => this.unshift(item));
  }

  /**
   * Remove and return item from the front - O(1)
   */
  dequeue(): T | undefined {
    if (this.size === 0) return undefined;

    const item = this.buffer[this.head];
    this.buffer[this.head] = undefined; // Help GC
    this.head = (this.head + 1) % this.capacity;
    this.size--;

    return item;
  }

  /**
   * Remove up to N items from the front - O(n)
   */
  dequeueMany(count: number): T[] {
    const items: T[] = [];
    const actualCount = Math.min(count, this.size);

    for (let i = 0; i < actualCount; i++) {
      const item = this.dequeue();
      if (item !== undefined) {
        items.push(item);
      }
    }

    return items;
  }

  /**
   * Look at the first item without removing it - O(1)
   */
  peek(): T | undefined {
    return this.size === 0 ? undefined : this.buffer[this.head];
  }

  /**
   * Get current size - O(1)
   */
  getSize(): number {
    return this.size;
  }

  /**
   * Check if empty - O(1)
   */
  isEmpty(): boolean {
    return this.size === 0;
  }

  /**
   * Clear all items - O(1)
   */
  clear(): void {
    this.buffer = new Array(this.capacity);
    this.head = 0;
    this.tail = 0;
    this.size = 0;
  }

  /**
   * Get all items as array (for debugging) - O(n)
   */
  toArray(): T[] {
    const items: T[] = [];
    let index = this.head;

    for (let i = 0; i < this.size; i++) {
      const item = this.buffer[index];
      if (item !== undefined) {
        items.push(item);
      }
      index = (index + 1) % this.capacity;
    }

    return items;
  }

  /**
   * Double the capacity when full - O(n)
   */
  private resize(): void {
    const newCapacity = this.capacity * 2;
    const newBuffer = new Array(newCapacity);

    // Copy items to new buffer in order
    let index = this.head;
    for (let i = 0; i < this.size; i++) {
      newBuffer[i] = this.buffer[index];
      index = (index + 1) % this.capacity;
    }

    this.buffer = newBuffer;
    this.head = 0;
    this.tail = this.size;
    this.capacity = newCapacity;
  }
}
