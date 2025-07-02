// titan-kernel/src/lifecycle/interfaces.ts
export interface OnInit {
  onInit(): Promise<void> | void;
}

export interface OnDestroy {
  onDestroy(): Promise<void> | void;
}

export interface OnApplicationStart {
  onApplicationStart(): Promise<void> | void;
}

export interface OnApplicationShutdown {
  onApplicationShutdown(): Promise<void> | void;
}