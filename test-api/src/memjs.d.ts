declare module "memjs" {
  export interface Client {
    get(key: string, callback: (error: Error | null, value: Buffer | null) => void): void;
    set(
      key: string,
      value: string | Buffer,
      options: { expires?: number },
      callback: (error: Error | null, success: boolean) => void,
    ): void;
    quit(): void;
  }

  const memjs: {
    Client: { create(servers: string): Client };
  };
  export default memjs;
}
