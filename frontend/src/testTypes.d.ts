declare module 'react-test-renderer' {
  import type { ReactElement } from 'react';

  export interface ReactTestInstance {
    props: any;
    findAllByType(type: string | React.ComponentType<any>): ReactTestInstance[];
    findByProps(props: Record<string, unknown>): ReactTestInstance;
  }

  export interface ReactTestRenderer {
    root: ReactTestInstance;
  }

  export function act(callback: () => void | Promise<void>): Promise<void>;
  export function create(element: ReactElement): ReactTestRenderer;
}
